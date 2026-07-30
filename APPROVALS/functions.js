import fs from 'fs';
import { InsertFileApproval } from '../functions.js';
import { sqlConfig } from '../dbConfig.js';
import { request } from 'https';
import dotenv from 'dotenv';
import { prepareEmailForPending } from '../CRM/functions.js';

dotenv.config();

export function optionsMaster(data) {
    return {
        hostname: 'ade577a92a8d4f93aace1d374e2500.22.environment.api.powerplatform.com',
        port: 443,
        path: '/powerautomate/automations/direct/workflows/134c84abd6c64e0e8f73b09b8edc2c84/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=rug7AjuITTnLo8TELj4-4VYc6TB-GMuDYrtOgDqCWXo',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };
}

export function formatearFecha(fecha) {
    let dia = String(fecha.getDate()).padStart(2, '0');
    let mes = String(fecha.getMonth() + 1).padStart(2, '0');
    let año = fecha.getFullYear();
    let horas = String(fecha.getHours()).padStart(2, '0');
    let minutos = String(fecha.getMinutes()).padStart(2, '0');
    let periodo = 'AM';

    return `${dia}/${mes}/${año} ${horas}:${minutos} ${periodo}`;
}

export function getApprovalStatus(log, usuario, approvalFlow) {
    let approval = "";
    let accion = "";
    let ctipo_flujo = null;
    let departamentoDestino = "";
    if (log.estado === 'Verify' && log.verificador === usuario.UserName) {
        approval = log.ApprovalID;
        accion = 'Verified';
    }
    if (log.cflow != 0) {
        ctipo_flujo = approvalFlow.ctipo_flujo
        departamentoDestino = approvalFlow.departamentoDestino
    } else {
        ctipo_flujo = 0
        departamentoDestino = 0
    }
    if (log.estado == 'Verify' && log.verificador == usuario.UserName) {
        approval = log.ApprovalID
        accion = 'Verified'
    }
    if (log.estado == 'Approve' && log.aprobador == usuario.UserName) {
        approval = log.ApprovalID
        accion = 'Approved'
    }
    if (log.estado == 'Signature' && log.firmante == usuario.UserName) {
        approval = log.ApprovalID
        accion = 'Signed'
    }
    if (log.estado == 'Apply' && log.operador == usuario.UserName) {
        approval = log.ApprovalID
        accion = 'Applied'
    }
    if (log.estado == 'Execute' && log.asignado == usuario.UserName) {
        approval = log.ApprovalID
        accion = 'asignado'
    }
    if (log.estado == 'Execute' && log.ejecutor == usuario.UserName) {
        approval = log.ApprovalID
        accion = 'Executed'
    }

    return { approval, accion, ctipo_flujo, departamentoDestino }
}


export function getQuery(principalStatus, sql_where, userAliasQuery) {
    let query;
    if (principalStatus == 'All') {
        query = `SELECT log.id, solicitante, proceso, detalle_proceso AS detalle_proceso, 
                   FORMAT(solicitante_fecha,'dd/MM/yyyy') AS s_fecha, 
                   verificador, aprobador, operador, firmante, ejecutor, asignado, csuscriptor, log.estado, 
                   ApprovalID, banco, pago, mmonto, moneda, cierre_fecha, af.ctipo_flujo, log.departamento 
        FROM log
        LEFT JOIN (
            SELECT id_original, id_nuevo, estado1
            FROM (
                SELECT id_original, id_nuevo, estado AS estado1,
                     ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
                FROM approval_asignado
            ) sub
            WHERE rn = 1
        ) AS l ON log.id = l.id_original
        LEFT JOIN approvals_flow af ON log.cflow = af.id
        WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR ejecutor = @UserName OR operador = @UserName OR asignado = @UserName OR csuscriptor = @UserName ${userAliasQuery} ${sql_where})`
    }
    if (principalStatus == 'Closed') {
        query = `SELECT log.id, solicitante, proceso, detalle_proceso AS detalle_proceso, 
                   FORMAT(solicitante_fecha,'dd/MM/yyyy') AS s_fecha, 
                   verificador, aprobador, firmante, ejecutor, asignado, csuscriptor, log.estado, 
                   ApprovalID, pago, banco, mmonto, moneda, cierre_fecha, af.ctipo_flujo, log.departamento 
        FROM log
        LEFT JOIN (
            SELECT id_original, id_nuevo, estado1
            FROM (
                SELECT id_original, id_nuevo, estado AS estado1,
                     ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
                FROM approval_asignado
            ) sub
            WHERE rn = 1
        ) AS l ON log.id = l.id_original
		LEFT JOIN approvals_flow af ON log.cflow = af.id
        WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR ejecutor = @UserName OR asignado = @UserName OR operador = @UserName or csuscriptor = @UserName ${userAliasQuery} ${sql_where})
        AND (log.estado = 'Approved' OR log.estado = 'Verified' OR log.estado = 'Signed' OR log.estado ='Executed' OR log.estado = 'Applied')`
    }
    if (principalStatus == 'Pending') {
        query = `SELECT log.id, solicitante, proceso, detalle_proceso AS detalle_proceso, 
                   FORMAT(solicitante_fecha,'dd/MM/yyyy') AS s_fecha, 
                   verificador, aprobador, firmante, ejecutor, asignado, log.estado, 
                   ApprovalID, pago, mmonto, moneda, cierre_fecha, af.ctipo_flujo, log.departamento 
        FROM log
        LEFT JOIN (
            SELECT id_original, id_nuevo, estado1
            FROM (
                SELECT id_original, id_nuevo, estado AS estado1,
                     ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
                FROM approval_asignado
            ) sub
            WHERE rn = 1
        ) AS l ON log.id = l.id_original
		LEFT JOIN approvals_flow af ON log.cflow = af.id
        WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR operador = @UserName OR asignado = @UserName OR ejecutor = @UserName)
        AND (estado = 'Verify' AND verificador = @UserName OR estado = 'Apply' AND operador = @UserName OR estado = 'Approve' AND aprobador = @UserName OR estado = 'Signature' AND firmante = @UserName OR estado = 'Apply' AND operador = @UserName OR estado = 'Execute' AND ejecutor = @UserName OR estado = 'Execute' AND asignado = @UserName)
        AND (estado = 'Verify' OR estado = 'Approve' OR estado = 'Signature' OR estado = 'Apply' OR estado = 'Execute')`
    }
    if (principalStatus == 'Ongoing') {
        query = `SELECT log.id, solicitante, proceso, detalle_proceso AS detalle_proceso, 
                   FORMAT(solicitante_fecha,'dd/MM/yyyy') AS s_fecha, 
                   verificador, aprobador, firmante, ejecutor, asignado, log.estado, 
                   ApprovalID, pago, mmonto, moneda, cierre_fecha, af.ctipo_flujo, log.departamento 
        FROM log
        LEFT JOIN (
            SELECT id_original, id_nuevo, estado1
            FROM (
                SELECT id_original, id_nuevo, estado AS estado1,
                     ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
                FROM approval_asignado
            ) sub
            WHERE rn = 1
        ) AS l ON log.id = l.id_original
		LEFT JOIN approvals_flow af ON log.cflow = af.id
        WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR operador = @UserName OR asignado = @UserName OR ejecutor = @UserName)
        AND (estado = 'Verify' AND verificador = @UserName OR estado = 'Apply' AND operador = @UserName OR estado = 'Approve' AND aprobador = @UserName OR estado = 'Signature' AND firmante = @UserName OR estado = 'Execute' AND asignado = @username)`
    }
    else if (principalStatus == 'Rejected') {
        query = `SELECT log.id, solicitante, proceso, detalle_proceso AS detalle_proceso, 
                   FORMAT(solicitante_fecha,'dd/MM/yyyy') AS s_fecha, 
                   verificador, aprobador, operador, firmante, ejecutor, asignado, log.estado, 
                   ApprovalID, pago, mmonto, banco, moneda, cierre_fecha, af.ctipo_flujo, log.departamento 
        FROM log
        LEFT JOIN (
            SELECT id_original, id_nuevo, estado1
            FROM (
                SELECT id_original, id_nuevo, estado AS estado1,
                     ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
                FROM approval_asignado
            ) sub
            WHERE rn = 1
        ) AS l ON log.id = l.id_original
		LEFT JOIN approvals_flow af ON log.cflow = af.id
        WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR operador = @UserName OR asignado = @UserName OR ejecutor = @UserName ${userAliasQuery} ${sql_where})
        AND (log.estado = 'Rejected' OR log.estado = 'Expired')`
    }
    return query;
}

export function getQueryCount(principalStatus, sql_where, userAliasQuery) {
    let query;
    if (principalStatus == 'All') {
        query = `SELECT COUNT(*) AS totalCount FROM log
        LEFT JOIN (
            SELECT id_original, id_nuevo, estado1
            FROM (
                SELECT id_original, id_nuevo, estado AS estado1,
                     ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
                FROM approval_asignado
            ) sub
            WHERE rn = 1
        ) AS l ON log.id = l.id_original
        LEFT JOIN approvals_flow af ON log.cflow = af.id
        WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR ejecutor = @UserName OR operador = @UserName OR asignado = @UserName ${userAliasQuery} ${sql_where})`
    }
    if (principalStatus == 'Closed') {
        query = `SELECT COUNT(*) AS totalCount FROM log
        LEFT JOIN (
            SELECT id_original, id_nuevo, estado1
            FROM (
                SELECT id_original, id_nuevo, estado AS estado1,
                     ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
                FROM approval_asignado
            ) sub
            WHERE rn = 1
        ) AS l ON log.id = l.id_original
        LEFT JOIN approvals_flow af ON log.cflow = af.id 
        WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR ejecutor = @UserName OR asignado = @UserName OR operador = @UserName ${userAliasQuery} ${sql_where})
        AND (log.estado = 'Approved' OR log.estado = 'Verified' OR log.estado = 'Signed' OR log.estado ='Executed' OR log.estado = 'Applied')`

    }
    if (principalStatus == 'Pending') {
        query = `SELECT COUNT(*) AS totalCount
        FROM log 
        LEFT JOIN (
            SELECT id_original, id_nuevo, estado1
            FROM (
                SELECT id_original, id_nuevo, estado AS estado1,
                     ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
                FROM approval_asignado
            ) sub
            WHERE rn = 1
        ) AS l ON log.id = l.id_original
        WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR operador = @UserName OR asignado = @UserName OR ejecutor = @UserName)
        AND (estado = 'Verify' AND verificador = @UserName) OR (estado = 'Approve' AND aprobador = @UserName) OR (estado = 'Signature' AND firmante = @UserName) 
        OR (estado = 'Apply' AND operador = @UserName) OR (estado = 'Execute' AND ejecutor = @UserName) OR (estado = 'Execute' AND asignado = @UserName)
        AND (estado = 'Verify' OR estado = 'Approve' OR estado = 'Signature' OR estado = 'Apply' OR estado = 'Execute')`
    }

    if (principalStatus == 'Ongoing') {
        query = `SELECT COUNT(*) AS totalCount
        FROM log
        LEFT JOIN (
            SELECT id_original, id_nuevo, estado1
            FROM (
                SELECT id_original, id_nuevo, estado AS estado1,
                     ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
                FROM approval_asignado
            ) sub
            WHERE rn = 1
        ) AS l ON log.id = l.id_original
        WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR operador = @UserName OR asignado = @UserName OR ejecutor = @UserName)
        AND (estado = 'Verify' AND verificador = @UserName OR estado = 'Apply' AND operador = @UserName OR estado = 'Approve' AND aprobador = @UserName OR estado = 'Signature' AND firmante = @UserName OR estado = 'Execute' AND asignado = @username)`
    }
    if (principalStatus == 'Rejected') {
        query = `SELECT COUNT(*) AS totalCount
        FROM log  
        LEFT JOIN (
            SELECT id_original, id_nuevo, estado1
            FROM (
                SELECT id_original, id_nuevo, estado AS estado1,
                     ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
                FROM approval_asignado
            ) sub
            WHERE rn = 1
        ) AS l ON log.id = l.id_original
         LEFT JOIN approvals_flow af ON log.cflow = af.id
         WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR operador = @UserName OR asignado = @UserName OR ejecutor = @UserName ${userAliasQuery} ${sql_where})
         AND (log.estado = 'Rejected' OR log.estado = 'Expired')`
    }
    return query;
}

export function isTheLastIntegrant(log, userName) {
    let lastIntegrant = null;
    if (log.ejecutor !== 'N/A' && log.estado !== 'Verify') {
        lastIntegrant = log.ejecutor;
    } else if (log.ejecutor === 'N/A' && log.firmante !== 'N/A') {
        lastIntegrant = log.firmante;
    } else if (log.ejecutor === 'N/A' && log.firmante === 'N/A' && log.aprobador !== 'N/A') {
        lastIntegrant = log.aprobador;
    } else if (log.ejecutor === 'N/A' && log.firmante === 'N/A' && log.operador !== 'N/A') {
        lastIntegrant = log.operador;
    } else if (log.ejecutor === 'N/A' && log.firmante === 'N/A' && log.aprobador === 'N/A' && log.verificador !== 'N/A') {
        lastIntegrant = log.verificador;
    }


    return lastIntegrant === userName;
}

export function transformDate(dateString) {
    if (!dateString) return null;
    let [dd, mm, yyyy] = dateString.split('/');
    const dateF = `${mm}/${dd}/${yyyy}`;
    const date = new Date(dateF);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export function removeAccents(str) {
    return str.replace(/[á]/g, 'a')
        .replace(/[é]/g, 'e')
        .replace(/[í]/g, 'i')
        .replace(/[ó]/g, 'o')
        .replace(/[ú]/g, 'u');
}

export async function readFileFromSIR(ruta, id, department, proceso, tipo, cflow, sir_reference) {
    console.log("leyendo la ruta", ruta)
    fs.readdir(ruta, async (err, files) => {
        if (err) {
            console.error("Error reading directory:", err);
            return;
        }
        files.forEach(async file => {
            console.log("leyendo el archivo", file)
            await InsertFileApproval(sqlConfig, id, department, proceso, file, tipo, cflow, sir_reference);
        });
    });
}

export function parseDate(dateStr) {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);
}
export function parseDateComming(dateStr) {
    dateStr = dateStr.split('T')[0];
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export async function postMicrosoft(RowID) {
    const envValue = (process.env.ENTORNO ?? '').toString();
    if (!envValue) {
        console.warn('ENTORNO is not set. Sending empty env field to Power Automate.');
    }
    const data = new TextEncoder().encode(
        JSON.stringify({ id: RowID, env: envValue })
    );
    const options = {
        hostname: 'ade577a92a8d4f93aace1d374e2500.22.environment.api.powerplatform.com',
        port: 443,
        path: '/powerautomate/automations/direct/workflows/134c84abd6c64e0e8f73b09b8edc2c84/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=rug7AjuITTnLo8TELj4-4VYc6TB-GMuDYrtOgDqCWXo',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const ApprovalSummit = request(options, res => {
        res.on('data', d => {
            process.stdout.write(d);
        });
    });

    ApprovalSummit.on('error', error => {
        console.error("Error during Approval Summit:", error);
    });

    ApprovalSummit.write(data);
    ApprovalSummit.end();
}
export async function getProcessApprovals(log = null) {
    if (!log) return null;
    const getProcess = log.map(item => {
        if (!/^\d/.test(item.proceso)) {
            return item.proceso.trim()
        }
        return null;
    }).filter(Boolean);
    const updatedProcess = [...new Set(getProcess)];
    const process = updatedProcess.concat("All");
    const chairmanIndex = process.indexOf("Chairman Expenses");
    if (chairmanIndex > -1) {
        process.splice(chairmanIndex, 1);
        process.unshift("Chairman Expenses");
    }
    return process;
}

export async function getApprovalData(approvalData, getUserNames, req) {
    const getUserID = (name) => {
        if (name === "N/A") return null;
        const user = getUserNames.find(user => user.Name === name);
        return user ? user.UserID : null;
    };

    approvalData.forEach(approval => {
        if (req.query.status == 'Pending') {
            approval.pending = true;
        }
        approval.solicitante_imagen = getUserID(approval.solicitante);
        approval.verificador_imagen = getUserID(approval.verificador);
        approval.aprobador_imagen = getUserID(approval.aprobador);
        approval.firmante_imagen = getUserID(approval.firmante);
        approval.ejecutor_imagen = getUserID(approval.ejecutor);
        approval.operador_imagen = getUserID(approval.operador);
        approval.asignado_imagen = getUserID(approval.asignado);
    });
    return approvalData;
}

export const getLastUser = (log) => {
    const roles = [
        { name: "ejecutor", comentario: log.ejecutor_comentarios },
        { name: "operador", comentario: log.operador_comentarios },
        { name: "firmante", comentario: log.firmante_comentarios },
        { name: "aprobador", comentario: log.aprobador_comentarios },
        { name: "verificador", comentario: log.verificador_comentarios },
    ];

    const lastUser = roles.find(role => role.comentario && role.comentario.trim() !== "");

    if (!lastUser) return null;

    return {
        userName: log[lastUser.name]
    };
};

export async function postCRM(to, cc, cco, asunto_interno, body, cprioridad, name, conversacion_titulo, id) {
    try {
        const baseUrl = process.env.CRM_POST;
        if (!baseUrl) throw new Error('CRM_POST is not defined in environment variables');
        const priority = cprioridad === 2 ? 'critical' : cprioridad === 1 ? 'important' : 'normal';
        const addDays = priority === 'critical' ? 1 : priority === 'important' ? 3 : 5;
        let dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + addDays);
        let emailHtml = '';
  
        let personHtml = `<div style="margin-bottom: 20px;background-color:white;"><h4 style="color: #333;background-color:white;word-break:break-word;overflow-wrap:break-word">You have been assigned to a task</h4>`;
          const generateTaskHtml = (task, priority) => {
              let taskHtml = '';
                  const { conversacion_titulo, asunto_interno, description, ffin, id } = task;
                  let dueDate = 'No date';
                  if (ffin) {
                      const dt = new Date(ffin);
                      const dd = String(dt.getDate()).padStart(2, '0');
                      const mm = String(dt.getMonth() + 1).padStart(2, '0');
                      const yyyy = dt.getFullYear();
                      dueDate = `${dd}/${mm}/${yyyy}`;
                  }
                  let priorityColor = '';
  
                  if (priority === 'critical') priorityColor = '#DC3545'; 
                  if (priority === 'important') priorityColor = '#FF4400'; 
                  if (priority === 'normal') priorityColor = '#FFCA1C';  
  
                  taskHtml += `<div style="padding: 5px; border: 1px solid #ddd; border-radius: 5px; margin: 4px;background-color:white;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse; margin: 0 0 4px 0;"><tr><td style="font-size: 12px; color: #5f5f5f;">ID: ${id}</td><td width="6">&nbsp;</td><td style="font-size: 12px; color: #5f5f5f;">Priority: </td><td width="6">&nbsp;</td><td bgcolor="${priorityColor}"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="font-size: 10px; color: #000000ff; padding: 5px 8px; text-align: center;">${priority.charAt(0).toUpperCase() + priority.slice(1)}</td></tr></table></td></tr></table><div style="margin-left: 40px; font-size: 14px; color: #5f5f5f;"><p style="margin: 0 0 8px 0; mso-line-height-rule: exactly;">📝 Subject: ${asunto_interno}</p><p style="margin: 0 0 8px 0; mso-line-height-rule: exactly;">📅 Due Date: ${dueDate}</p><p style="color: #000000; margin: 0 0 8px 0; mso-line-height-rule: exactly;">${conversacion_titulo ? conversacion_titulo.slice(0, 125) + '...' : ''}</p><p style="color: #000000; margin: 0 0 8px 0; mso-line-height-rule: exactly;">${description  ? description.slice(0, 250) : ''}</p></div></div>`;
              
              return taskHtml;
          };
  
          personHtml += generateTaskHtml({ conversacion_titulo, asunto_interno,description:body, ffin: dueDate, id }, priority);

          personHtml += '</div>';
          emailHtml += personHtml;
        const toDesigned = process.env.ENTORNO == 'desa'? 'lossa@acreinsurance.com' : to; 
        const payload = {
            to: toDesigned || '',
            cc: cc || '',
            cco: cco || '',
            subject: `CRM [${id}] - ${asunto_interno}` || '',
            body: `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>CRM</title></head><body style="Margin:0;padding:0;background:#f2f2f2;"><center style="width:100%;table-layout:fixed;background:#f2f2f2;padding:24px 0;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f2f2f2;"><tr><td align="center" style="padding:0;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td height="25" style="line-height:25px;font-size:0;">&nbsp;</td></tr></table><!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td height="50" style="line-height:50px;font-size:0;">&nbsp;</td></tr></table><![endif]--><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border-radius:8px;"><tr><td style="padding:24px 28px;font-family:Arial,sans-serif;font-size:16px;line-height:22px;color:#333333;"><h2 style="Margin:0 0 16px 0;font-size:20px;font-weight:600;color:#222222;word-break:break-word;overflow-wrap:break-word">Hello, ${name}. You have been assigned to a task.</h2><div style="border-top:1px solid #e5e5e5;Margin:0 0 16px 0;padding-top:16px;">${emailHtml}</div><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="left" bgcolor="#00586F"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="font-size:14px;color:#ffffff;padding:8px 16px;text-align:center;"><a href="sir://ActiveDashboard|/" style="color:#ffffff; text-decoration:none; display:inline-block;">Open Dashboard</a></td></tr></table></td></tr></table></td></tr></table></td></tr></table></center></body></html>`
        };
        const url = `${baseUrl.replace(/\/$/, '')}/api/global/v1/send_mail`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeout);

        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await res.json().catch(() => null)
            : await res.text().catch(() => null);

        if (!res.ok) {
            return { ok: false, status: res.status, error: data || { message: res.statusText } };
        }

        return { ok: true, status: res.status, data };
    } catch (error) {
        const status = error.name === 'AbortError' ? 408 : 500;
        console.error('postCRM error:', status, error?.message || error);
        return { ok: false, status, error: { message: error?.message || 'Request failed' } };
    }
}
export async function postCloseTask(to, cc, cco, body, cprioridad, id, conversacion_titulo, departamento, estado) {
    try {
        const baseUrl = process.env.CRM_POST;
        if (!baseUrl) throw new Error('CRM_POST is not defined in environment variables');
        let emailHtml = '';
  
        let personHtml = `<div style="margin-bottom: 20px;background-color:white;"><h4 style="color: #333;background-color:white;word-break:break-word;overflow-wrap:break-word">There have been changes to the CRM.</h4>`;
          const generateTaskHtml = (task, cprioridad) => {
              let taskHtml = '';
              let priorityColor = '';
                  const {description, id } = task;
                  if (cprioridad === 'critical') priorityColor = '#DC3545' ;
                  if (cprioridad === 'important') priorityColor = '#FF4400';
                  if (cprioridad === 'normal') priorityColor = '#FFCA1C';
  
                  taskHtml += `<div style="padding: 5px; border: 1px solid #ddd; border-radius: 5px; margin: 4px;background-color:white;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse; margin: 0 0 4px 0;"><tr><td style="font-size: 12px; color: #5f5f5f;">ID: ${id}</td><td width="6">&nbsp;</td><td style="font-size: 12px; color: #5f5f5f;">Priority: </td><td width="6">&nbsp;</td><td bgcolor="${priorityColor}"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="font-size: 10px; color: #000000ff; padding: 5px 8px; text-align: center;">${cprioridad.charAt(0).toUpperCase() + cprioridad.slice(1)}</td></tr></table></td></tr></table><div style="margin-left: 40px; font-size: 14px; color: #5f5f5f;"><p style="color: #000000; margin: 0 0 8px 0; mso-line-height-rule: exactly;">${description.length > 100  ? description.slice(0, 250) : description}</p></div></div>`;
              
              return taskHtml;
          };
  
          personHtml += generateTaskHtml({ description:body, cprioridad, id}, cprioridad);

          personHtml += '</div>';
          emailHtml += personHtml;
        const toDesigned = process.env.ENTORNO == 'desa'? 'lossa@acreinsurance.com' : to; 
        const payload = {
            to: toDesigned || '',
            cc: cc || '',
            cco: cco || '',
            subject: `CRM [${id}] - ${conversacion_titulo} [${estado}] [${departamento}] ` || '',
            body: `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>CRM</title></head><body style="Margin:0;padding:0;background:#f2f2f2;"><center style="width:100%;table-layout:fixed;background:#f2f2f2;padding:24px 0;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f2f2f2;"><tr><td align="center" style="padding:0;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td height="25" style="line-height:25px;font-size:0;">&nbsp;</td></tr></table><!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td height="50" style="line-height:50px;font-size:0;">&nbsp;</td></tr></table><![endif]--><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border-radius:8px;"><tr><td style="padding:24px 28px;font-family:Arial,sans-serif;font-size:16px;line-height:22px;color:#333333;"><h2 style="Margin:0 0 16px 0;font-size:20px;font-weight:600;color:#222222;word-break:break-word;overflow-wrap:break-word">Hello Everyone.</h2><div style="border-top:1px solid #e5e5e5;Margin:0 0 16px 0;padding-top:16px;">${emailHtml}</div><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="left" bgcolor="#00586F"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="font-size:14px;color:#ffffff;padding:8px 16px;text-align:center;"><a href="sir://ActiveDashboard|/" style="color:#ffffff; text-decoration:none; display:inline-block;">Open Dashboard</a></td></tr></table></td></tr></table></td></tr></table></td></tr></table></center></body></html>`
        };
        const url = `${baseUrl.replace(/\/$/, '')}/api/global/v1/send_mail`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeout);

        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await res.json().catch(() => null)
            : await res.text().catch(() => null);

        if (!res.ok) {
            return { ok: false, status: res.status, error: data || { message: res.statusText } };
        }

        return { ok: true, status: res.status, data };
    } catch (error) {
        const status = error.name === 'AbortError' ? 408 : 500;
        console.error('postCRM error:', status, error?.message || error);
        return { ok: false, status, error: { message: error?.message || 'Request failed' } };
    }

}

