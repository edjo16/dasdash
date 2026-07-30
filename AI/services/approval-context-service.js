import sql from 'mssql';
import ApprovalModel from '../../APPROVALS/model/approvals.js';
import ApprovalFunctionsModel from '../../Approvals_functions/models/approval_functions.js';
import USERModel from '../../USERS/model/USER.js';
import Rules from '../../USERS/rule/DevTeam.js';
import { resolveApprovalBasePath } from '../../Approvals_functions/shared/approval-file-routing.js';
import {
  buildPdfContextFromCandidates,
  isPdfFile,
  trimContextText
} from './shared/pdf-context.js';

const MAX_MESSAGE_CONTEXT_CHARS = Number(process.env.AI_CRM_MAX_MSG_CHARS || 50000);

function normalizeValue(value, fallback = 'N/A') {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
}

function buildApprovalDetailText(log, crmRelations) {
  const sections = [];

  sections.push('Approval Summary');
  sections.push('ID: ' + normalizeValue(log?.id));
  sections.push('Process: ' + normalizeValue(log?.proceso));
  sections.push('Status: ' + normalizeValue(log?.estado));
  sections.push('Requester: ' + normalizeValue(log?.solicitante));
  sections.push('Department: ' + normalizeValue(log?.departamento));
  sections.push('Start Date: ' + normalizeValue(log?.s_fecha || log?.solicitante_fecha));
  sections.push('Close Date: ' + normalizeValue(log?.cierre));
  sections.push('Flow ID: ' + normalizeValue(log?.cflow));

  if (log?.mmonto || log?.moneda) {
    sections.push('Amount: ' + normalizeValue(log?.mmonto) + ' ' + normalizeValue(log?.moneda, ''));
  }

  sections.push('Detail:');
  sections.push(normalizeValue(log?.detalle_proceso));

  const roleComments = [
    ['Verifier', log?.verificador, log?.verificador_comentarios],
    ['Approver', log?.aprobador, log?.aprobador_comentarios],
    ['Signer', log?.firmante, log?.firmante_comentarios],
    ['Operator', log?.operador, log?.operador_comentarios],
    ['Executor', log?.ejecutor, log?.ejecutor_comentarios]
  ];

  const commentLines = [];
  roleComments.forEach(([role, actor, comment]) => {
    if (actor && String(actor).trim() && actor !== 'N/A') {
      commentLines.push(role + ': ' + normalizeValue(actor));
    }
    if (comment && String(comment).trim()) {
      commentLines.push(role + ' Comment: ' + String(comment).trim());
    }
  });

  if (commentLines.length) {
    sections.push('');
    sections.push('Approval History/Comments:');
    sections.push(commentLines.join('\n'));
  }

  if (Array.isArray(crmRelations) && crmRelations.length) {
    sections.push('');
    sections.push('Linked CRM Cases:');
    crmRelations.forEach((relation) => {
      sections.push(
        '- CRM #' + normalizeValue(relation.crm_id) +
        ' | Subject: ' + normalizeValue(relation.conversacion_titulo) +
        ' | Type: ' + normalizeValue(relation.asunto_interno) +
        ' | Date: ' + normalizeValue(relation.fecha_ingreso)
      );
    });
  }

  return trimContextText(sections.join('\n'), MAX_MESSAGE_CONTEXT_CHARS);
}

async function resolveApprovalContextData(connection, approvalId, userId, devTeamUserId) {
  await sql.connect(connection);
  const transaction = new sql.Transaction();

  try {
    await transaction.begin();

    const user = await USERModel.obtenerDatosUsuario(transaction, userId);
    if (!user) {
      await transaction.commit();
      return { ok: false, status: 401, error: 'Unauthorized' };
    }

    const log = await ApprovalModel.getLogById(transaction, approvalId);
    if (!log) {
      await transaction.commit();
      return { ok: false, status: 404, error: 'Approval not found' };
    }

    const areaSupervisor = await USERModel.getAreaSupervisor(transaction, user.Dep);
    const hasPermission = await Rules.validatePermissionApproval(
      transaction,
      approvalId,
      userId,
      user.Manager,
      areaSupervisor,
      devTeamUserId,
      log.id_nuevo !== null,
      log.id_nuevo,
      log.cflow
    );

    if (!hasPermission) {
      await transaction.commit();
      return { ok: false, status: 403, error: 'Forbidden' };
    }

    const approvalFlow = await ApprovalModel.getApprovalFlow(transaction, log.cflow);
    const archivos = await ApprovalFunctionsModel.getArchivosByLogId(transaction, approvalId);

    await transaction.commit();

    return {
      ok: true,
      log,
      approvalFlow,
      archivos: Array.isArray(archivos) ? archivos : []
    };
  } catch (error) {
    try { await transaction.rollback(); } catch (_) {}
    throw error;
  }
}

async function buildApprovalPdfContext(approvalId, approvalFlow, log, archivos) {
  const candidates = (Array.isArray(archivos) ? archivos : [])
    .map((fileRow) => ({
      filename: String(fileRow.archivo_nombre || '').trim(),
      process: String(fileRow.proceso || ''),
      id_msg: Number(approvalId),
      source_label: 'approval_id=' + approvalId,
      meta: fileRow
    }))
    .filter((candidate) => candidate.filename)
    .filter((candidate) => isPdfFile(candidate.filename));

  return buildPdfContextFromCandidates(candidates, (item) => {
    const basePath = resolveApprovalBasePath(approvalFlow, log, item.process || '');
    if (!basePath) return null;
    return {
      path: basePath.replace(/\\/g, '/') + '/' + item.filename,
      host: null
    };
  });
}

export async function buildApprovalCaseContext(connection, approvalId, includeDocs, userId, devTeamUserId) {
  if (!approvalId) {
    return { status: 400, payload: { result: 0, error: 'approval_id is required' } };
  }

  if (!userId) {
    return { status: 401, payload: { result: 0, error: 'Unauthorized' } };
  }

  const data = await resolveApprovalContextData(connection, approvalId, userId, devTeamUserId);
  if (!data.ok) {
    return {
      status: data.status || 500,
      payload: { result: 0, error: data.error || 'Failed to load approval context' }
    };
  }

  let crmRelations = [];
  try {
    const linkedCrm = await ApprovalModel.getCrmApprovalRelations(connection, approvalId);
    crmRelations = linkedCrm?.result ? (linkedCrm.relations || []) : [];
  } catch (error) {
    console.error('[AI Approval context] linked CRM error:', error);
  }

  const messagesContext = buildApprovalDetailText(data.log, crmRelations);

  let pdfContext = {
    documentContextText: '',
    documents: [],
    warnings: [],
    truncated: false
  };

  if (includeDocs) {
    pdfContext = await buildApprovalPdfContext(approvalId, data.approvalFlow, data.log, data.archivos);
  }

  return {
    status: 200,
    payload: {
      result: 1,
      approval_id: approvalId,
      messagesText: messagesContext.text,
      messagesTruncated: messagesContext.truncated,
      documentContextText: pdfContext.documentContextText,
      documents: pdfContext.documents,
      documentWarnings: pdfContext.warnings,
      documentsTruncated: pdfContext.truncated,
      includeDocs,
      linkedCrmCount: crmRelations.length
    }
  };
}
