import sql from 'mssql';
import CRMModel from '../../CRM/model/CRM.js';
import { existsSync } from 'fs';
import {
  buildPdfContextFromCandidates,
  isAiReadableFile,
  trimContextText
} from './shared/pdf-context.js';

const MAX_MESSAGE_CONTEXT_CHARS = Number(process.env.AI_CRM_MAX_MSG_CHARS || 50000);

function normalizeHost(host) {
  return String(host || '').trim().replace(/^[/\\]+|[/\\]+$/g, '');
}

function getCrmServerHost() {
  return normalizeHost(process.env.server_1 || '');
}

function getCandidateCrmHosts() {
  const hosts = [
    process.env.server_1,
    process.env.file_server,
    'vps-file01'
  ].map(normalizeHost).filter(Boolean);

  return Array.from(new Set(hosts));
}

function buildCrmUncPath(crmId, msgId, filename) {
  const host = getCrmServerHost();
  if (!host) return null;
  return `\\\\${host}\\CRM\\${crmId}\\${msgId}\\${filename}`;
}

function buildCrmUncPathByHost(host, crmId, msgId, filename) {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  return `\\\\${normalized}\\CRM\\${crmId}\\${msgId}\\${filename}`;
}

function resolveExistingCrmFilePath(crmId, msgId, filename) {
  const hosts = getCandidateCrmHosts();
  for (const host of hosts) {
    const filePath = buildCrmUncPathByHost(host, crmId, msgId, filename);
    if (filePath && existsSync(filePath)) {
      return { path: filePath, host };
    }
  }

  const primary = buildCrmUncPath(crmId, msgId, filename);
  return { path: primary, host: null };
}

async function getCrmMessages(pool, crmId) {
  const query = `
    SELECT
      FORMAT(c.frecibido, 'dd/MM/yyyy hh:mm tt') AS ffrecibido,
      c.id_main,
      c.id_msg,
      c.nombre_mensaje,
      c.body_mensaje,
      ISNULL(u.Name, c.de_nombre) AS de,
      STUFF((
        SELECT ';' + a.xname
        FROM crm_archivos a
        WHERE a.id_main = c.id_main AND a.id_msg = c.id_msg
        GROUP BY a.xname
        FOR XML PATH('')
      ), 1, 1, '') AS files
    FROM crm_msg c
    LEFT JOIN Users u ON u.Email = c.de_correo
    WHERE c.id_main = @crm_id
    ORDER BY c.fingreso DESC
  `;

  const result = await pool.request()
    .input('crm_id', sql.Int, crmId)
    .query(query);

  return result.recordset || [];
}

function buildMessagesContext(rows) {
  const serialized = rows.map((message, index) => {
    const sender = message.de || 'Unknown';
    const body = String(message.body_mensaje || '').trim();
    const date = message.ffrecibido || '';
    const files = String(message.files || '')
      .split(';')
      .map((fileName) => fileName.trim())
      .filter(Boolean);

    let block = '[' + (index + 1) + '] ' + date + ' - ' + sender + ':\n' + body;
    if (files.length > 0) {
      block += '\n[Attachments: ' + files.join(', ') + ']';
    }
    return block;
  }).join('\n\n---\n\n');

  return trimContextText(serialized, MAX_MESSAGE_CONTEXT_CHARS);
}

async function buildCrmPdfContext(crmId, rows) {
  const candidates = [];

  for (const row of rows) {
    const idMsg = Number(row.id_msg);
    const files = String(row.files || '')
      .split(';')
      .map((f) => f.trim())
      .filter(Boolean)
      .filter((f) => isAiReadableFile(f));

    for (const filename of files) {
      candidates.push({
        id_msg: idMsg,
        filename,
        source_label: 'msg_id=' + idMsg
      });
    }
  }

  return buildPdfContextFromCandidates(candidates, (item) => {
    return resolveExistingCrmFilePath(crmId, item.id_msg, item.filename);
  });
}

export async function buildCrmCaseContext(connection, crmId, includeDocs, userId) {
  if (!crmId) {
    return { status: 400, payload: { result: 0, error: 'crm_id is required' } };
  }

  if (!userId) {
    return { status: 401, payload: { result: 0, error: 'Unauthorized' } };
  }

  const access = await CRMModel.validateCrmAccess(connection, crmId, userId);
  if (!access?.result || !access?.hasAccess) {
    return { status: 403, payload: { result: 0, error: 'Forbidden' } };
  }

  const pool = await sql.connect(connection);
  const rows = await getCrmMessages(pool, crmId);
  const messagesContext = buildMessagesContext(rows);

  let pdfContext = {
    documentContextText: '',
    documents: [],
    warnings: [],
    truncated: false
  };

  if (includeDocs) {
    pdfContext = await buildCrmPdfContext(crmId, rows);
  }

  return {
    status: 200,
    payload: {
      result: 1,
      crm_id: crmId,
      messagesText: messagesContext.text,
      messagesTruncated: messagesContext.truncated,
      documentContextText: pdfContext.documentContextText,
      documents: pdfContext.documents,
      documentWarnings: pdfContext.warnings,
      documentsTruncated: pdfContext.truncated,
      includeDocs
    }
  };
}
