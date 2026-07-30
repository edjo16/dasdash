import sql from 'mssql';
import ApprovalFunctionsModel from '../models/approval_functions.js';
import ApprovalModel from '../../APPROVALS/model/approvals.js';

function normalizeHost(host) {
  return String(host || '').replace(/^[/\\]+|[/\\]+$/g, '');
}

function joinPathParts(parts) {
  return parts.filter(Boolean).join('/');
}

export function resolveApprovalBasePath(flow, log, archivoProceso) {
  const server = flow?.server ?? null;
  const location = String(flow?.location || '').replace(/^[/\\]+|[/\\]+$/g, '');
  const referenceType = flow?.reference_type ?? 0;
  const rowId = log.id;
  const sirReference = log.sir_reference ? String(log.sir_reference).trim().split(' ')[0] : '';

  const serverHost = (n) => normalizeHost(process.env[`server_${n}`] || '');

  if (server === 1) {
    return `//${serverHost(1)}/${joinPathParts([location, String(rowId)])}`;
  }

  if (server === 2) {
    return `//${serverHost(2)}/${joinPathParts([location, String(rowId)])}`;
  }
  if (server === 5) {
    return `//${serverHost(5)}/${joinPathParts([location, String(rowId)])}`;
  }

  if (server === 3 || server === 4) {
    if (referenceType === 1) {
      if (server === 3) {
        const procesoPath = String(archivoProceso || '').replace(/^[/\\]+|[/\\]+$/g, '');
        const procesoFinal = procesoPath.split('-')[0] + '-1'
        return `//${serverHost(server)}/${joinPathParts([location, procesoFinal])}`;
      }
      else {
        const procesoPath = String(archivoProceso || '').replace(/^[/\\]+|[/\\]+$/g, '');
        return `//${serverHost(server)}/${joinPathParts([location, procesoPath.split(',')[0]])}`;
      }

    }

    if (referenceType === 2) {
      return `//${serverHost(server)}/${joinPathParts([location, sirReference])}`;
    }

    if (referenceType === 3) {
      const procesoPath = String(archivoProceso || '').replace(/^[/\\]+|[/\\]+$/g, '');
      return `//${serverHost(server)}/${joinPathParts([location, procesoPath.split('-')[0] + '-1'])}`;
    }

    if (referenceType === 4) {
      const procesoPath = String(archivoProceso || '').replace(/^[/\\]+|[/\\]+$/g, '');
      return `//${serverHost(server)}/${joinPathParts([location, procesoPath.split('-')[0]])}`;
    }

    const procesoPath = String(archivoProceso || '').replace(/^[/\\]+|[/\\]+$/g, '');
    return `//${serverHost(server)}/${joinPathParts([location, procesoPath])}`;
  }

  if (flow?.ruta) {
    return `${flow.ruta}${rowId}`;
  }

  if (flow?.server) {
    const base = ApprovalFunctionsModel._getServerPath(flow.server, flow.location);
    return `${base}${rowId}`;
  }

  return null;
}

export async function resolveApprovalFileFullPath(connection, rowId, filename) {
  await sql.connect(connection);
  const transaction = new sql.Transaction();

  try {
    await transaction.begin();

    const log = await ApprovalFunctionsModel.getApprovalLog(transaction, rowId);
    if (!log) {
      await transaction.commit();
      return { ok: false, status: 404, error: 'Approval not found' };
    }

    const approvalFlow = await ApprovalModel.getApprovalFlow(transaction, log.cflow);
    if (!approvalFlow) {
      await transaction.commit();
      return { ok: false, status: 404, error: 'Approval flow not found' };
    }

    const archivos = await ApprovalFunctionsModel.getArchivosByLogId(transaction, rowId);
    const archivo = Array.isArray(archivos)
      ? archivos.find((a) => a.archivo_nombre === filename)
      : null;

    if (!archivo) {
      await transaction.commit();
      return { ok: false, status: 404, error: 'File not found in approval' };
    }

    const basePath = resolveApprovalBasePath(approvalFlow, log, archivo.proceso || '');
    await transaction.commit();

    if (!basePath) {
      return { ok: false, status: 404, error: 'Could not resolve file path' };
    }

    const fullPath = basePath.replace(/\\/g, '/') + '/' + filename;
    return { ok: true, fullPath };
  } catch (error) {
    try { await transaction.rollback(); } catch (_) { }
    throw error;
  }
}
