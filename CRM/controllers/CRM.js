import sql from 'mssql';
import CRMModel from '../model/CRM.js';
import { groupBy, prepareEmail } from '../functions.js';
import USERModel from '../../USERS/model/USER.js';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from 'fs';
import MsgReaderModule from '@kenjiuno/msgreader';
const MsgReader = MsgReaderModule.default || MsgReaderModule;
import { tmpdir } from 'os';
import { join as pathJoin } from 'path';
import DepartamentModel from '../../Departaments/model/Departament.js';
import { postCRM, postCloseTask } from '../../APPROVALS/functions.js'
import { get_menu } from '../../functions.js';
import Rules from '../../USERS/rule/DevTeam.js';
import DashboardController from '../../USERS/controllers/Dashboard.js';
import { sanitizeHtml } from '../../utils/sanitize-html.js';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';
dotenv.config();
function normalizeHost(host) {
    return String(host || '').trim().replace(/^[/\\]+|[/\\]+$/g, '');
}

function getCrmServerHost() {
    return normalizeHost(process.env.server_1 || '');
}

export function isSafeFilename(filename) {
    const value = String(filename || '').trim();
    return !!value && !/[/\\]/.test(value)
    // && !value.includes('..'); because there is already files with ..pdf etc
}

function getCrmFileExtension(filename) {
    const value = String(filename || '').toLowerCase();
    const dot = value.lastIndexOf('.');
    return dot >= 0 ? value.slice(dot) : '';
}

function getCrmMimeType(filename) {
    const ext = getCrmFileExtension(filename);
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.msg') return 'application/vnd.ms-outlook';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.doc' || ext === '.docx') return 'application/msword';
    if (ext === '.xls' || ext === '.xlsx' || ext === '.xlsm') return 'application/vnd.ms-excel';
    return 'application/octet-stream';
}

export function buildCrmUncPath(crmId, msgId, filename) {
    const host = getCrmServerHost();
    if (!host) return null;
    return `\\\\${host}\\CRM\\${crmId}\\${msgId}\\${filename}`;
}

function hasUnsafeCmdChars(value) {
    return /["`\r\n]/.test(String(value || ''));
}

function getCrmTempCmdDirectory() {
    const host = getCrmServerHost() || 'vps-file01';
    return `\\\\${host}\\CRM\\temporal`;
}

function getLocalCrmTempCmdDirectory() {
    return pathJoin(tmpdir(), 'crm-open-cmd');
}

function getCrmTempCmdFilename(crmId, msgId, filename) {
    const base = String(filename || 'document')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 40);
    const stamp = Date.now();
    const rnd = Math.floor(Math.random() * 1000000);
    return `crm_open_${crmId}_${msgId}_${base || 'document'}_${stamp}_${rnd}.cmd`;
}

function getSafeCmdDownloadName(filename) {
    const base = String(filename || 'document')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${base || 'document'}.cmd`;
}

function escapeCmdValue(value) {
    // Escape % to avoid accidental environment-variable expansion in cmd.exe
    return String(value || '').replace(/%/g, '%%');
}

async function waitForFileReady(filePath, maxAttempts = 12, delayMs = 120) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            if (existsSync(filePath)) {
                const stats = statSync(filePath);
                if (stats && stats.size > 0) return true;
            }
        } catch (_) {}

        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return false;
}

function buildOpenCommandContent(filename, uncPath) {
    const ext = getCrmFileExtension(filename);
    const safeUncPath = escapeCmdValue(uncPath);

    if (ext === '.msg') {
        return (
            '@echo off\r\n' +
            `set "MSG_FILE=${safeUncPath}"\r\n` +
            'set "OUTLOOK_BIN="\r\n' +
            'if exist "%ProgramFiles%\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE" set "OUTLOOK_BIN=%ProgramFiles%\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE"\r\n' +
            'if not defined OUTLOOK_BIN if exist "%ProgramFiles(x86)%\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE" set "OUTLOOK_BIN=%ProgramFiles(x86)%\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE"\r\n' +
            'if not defined OUTLOOK_BIN if exist "%ProgramFiles%\\Microsoft Office\\Office16\\OUTLOOK.EXE" set "OUTLOOK_BIN=%ProgramFiles%\\Microsoft Office\\Office16\\OUTLOOK.EXE"\r\n' +
            'if not defined OUTLOOK_BIN if exist "%ProgramFiles(x86)%\\Microsoft Office\\Office16\\OUTLOOK.EXE" set "OUTLOOK_BIN=%ProgramFiles(x86)%\\Microsoft Office\\Office16\\OUTLOOK.EXE"\r\n' +
            'if defined OUTLOOK_BIN (\r\n' +
            '  start "" "%OUTLOOK_BIN%" /f "%MSG_FILE%"\r\n' +
            ') else (\r\n' +
            '  start "" outlook.exe /f "%MSG_FILE%"\r\n' +
            '  if errorlevel 1 start "" "%MSG_FILE%"\r\n' +
            ')\r\n' +
            '@(goto) 2>nul & del "%~f0"\r\n'
        );
    }
    return (
        '@echo off\r\n' +
        `start "" "${safeUncPath}"\r\n` +
        '@(goto) 2>nul & del "%~f0"\r\n'
    );
}

export async function validateCrmReadAccess(connection, req, crmId) {
    const userId = req.session?.userID;
    if (!userId) return { ok: false, status: 401, error: 'Unauthorized' };
    const validation = await CRMModel.validateCrmAccess(connection, crmId, userId);
    if (!validation?.result || !validation?.hasAccess) {
        return { ok: false, status: 403, error: 'Forbidden' };
    }
    return { ok: true };
}

export default class CRMController {
    static async getCRMGet(connection, req, res) {
        const UserID = req.session?.userID;
        const pool = await sql.connect(connection);

        try {

            let devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios_active = await USERModel.getAllUserActive(pool,usuario.compania);
            const result1 = await CRMModel.getUserDataWithCompany(pool, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];

            if (result1 == undefined) {
                return res.redirect("/sinID");
            }

            let departamentoOrigen = result1.recordset[0].departamento;
            let UserName = result1.recordset[0].Name;
            let UserEmail = result1.recordset[0].Email;
            let cdepartamento = result1.recordset[0].cdepartamento;
            let Modules = result1.recordset[0].Modules;
            const Menu = get_menu(result1);

            var usuarios = [];

            const result2 = await CRMModel.getAllActiveUsers(pool);


            for (let u = 0; u < result2.length; u++) {
                usuarios.push([result2[u].Name, result2[u].Modules]);
            }

            const result3 = await CRMModel.getAllDepartments(pool);

            var crm_modules = '';
            if (Menu.Modules == 'All') {
                for (let u = 0; u < result3.length; u++) {
                    crm_modules += 'departamento_id = ' + result3[u].id;
                    if (u < result3.length - 1) {
                        crm_modules += " or ";
                    }
                }
            }

            var crm_u = [];
            var temp = [];
            let o = 0;

            for (let u = 0; u < result3.length; u++) {
                for (let e = 0; e < usuarios.length; e++) {
                    if (usuarios[e][1] != null) {
                        if (usuarios[e][1].includes(result3[u].nombre)) {
                            temp[o] = [result3[u].nombre, usuarios[e][0]];
                            o += 1;
                        }
                    }
                }
            }

            crm_u = temp;
            let col_id = [];
            let main = result3;

            for (let i = 0; i < main.length; i++) {
                col_id.push(main[i]);
            }
            // Departments the user has access to
            const departments = await DepartamentModel.getDepartaments(pool);
            const companies = await DepartamentModel.getCompaniesByStringIds(pool, usuario.companies);
            const filterColleagues = await CRMModel.getFilterColleagues(pool, UserID);
            const businessRelationships = await CRMModel.getBusinessRelationships(pool);
            res.render("CRM/crm_main",{
                title: "CRM",
                userProfile: {
                    UserName: UserName,
                    UserID: UserID,
                    UsuarioID: UserID,
                    departamentoOrigen: departamentoOrigen,
                    cdepartamento: cdepartamento
                },
                userMenu: Menu,
                grupousuarios_active: grupousuarios_active,
                okForm: req.query.result,
                usuarios: grupousuarios,
                devteam: devteam,
                tabla: main,
                col_id: col_id,
                crm_u: crm_u,
                companies: companies,
                departments: departments.map(d => ({ id: d.id, nombre: d.nombre, ccompania: d.ccompania })),
                filterColleagues: filterColleagues,
                businessRelationships: businessRelationships.map(r => ({ value: r.b_relation_id, label: r.label }))
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async changeState(connection, req, res) {
        const { estado_valor, cdepartamento, crm_id, userName } = req.body;
        const UserID = req.session?.userID;
        await sql.connect(connection);
        const date = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');

        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            // Validate that the user belongs to the department they are trying to update
            const userCheck = await new sql.Request(transaction)
                .input('UserID', sql.VarChar, UserID)
                .query('SELECT cdepartamento, departamento, Modules FROM Users WHERE UserID = @UserID');
            if (userCheck.recordset.length > 0) {
                const { cdepartamento: userDept, departamento: userDepts, Modules } = userCheck.recordset[0];
                const allowedDepts = [...new Set([String(userDept), ...(userDepts ? userDepts.split(';').map(s => s.trim()).filter(Boolean) : [])])];
                if (Modules !== 'All' && !allowedDepts.includes(String(cdepartamento))) {
                    try { await transaction.rollback(); } catch (_) {}
                    return res.status(403).json({ result: 0, error: 'You can only update the status of your own department.' });
                }
            }

            // update CRM state
            await CRMModel.updateCRMState(transaction, crm_id, estado_valor, cdepartamento, date);
            // update date of modification on crm
            await CRMModel.updateCRMMain(transaction, crm_id, date);

            // obtain new state
            const estado = await CRMModel.getEstadoByValue(transaction, estado_valor);
            if (estado_valor == '999') {
                const users = await USERModel.getAllUserNames();
                const { de_correo, cprioridad, conversacion_titulo } = await CRMModel.getCRMById(transaction, crm_id);
                const department = await DepartamentModel.getDepartmentById(transaction, cdepartamento);
                const members = await CRMModel.getAllCrmAssignedMembers(transaction, crm_id, cdepartamento);
                const ownerIsInHouse = users.find(user => user.Email == de_correo)
                let membersEmails = []
                for (let i = 0; i < members.length; i++) {
                    let userInfo = users.find(user => user.Name == members[i].Name)
                    if (userInfo) {
                        membersEmails.push(userInfo.Email)
                    }
                }
                if (ownerIsInHouse) {
                    membersEmails.push(de_correo)
                }
                const usersToSendEmail = membersEmails.join(';')
                const priority = cprioridad === 2 ? 'critical' : cprioridad === 1 ? 'important' : 'normal';
                const estado = estado_valor === '999' ? 'Closed' : estado_valor === '1' ? 'In progress' : 'Not Started';
                const postEMAILCRM = await postCloseTask(usersToSendEmail, null, null, `${userName} has marked the case as closed for ${department.nombre} department.`, priority, crm_id, conversacion_titulo, department?.nombre, estado)
            }
            await transaction.commit();

            res.send({ result: 1, estado });

        } catch (err) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ result: 0, error: err.message });
        }
    }

    static async createEmailByPendingCRMTasks(conection, req, res) {
        const pool = await sql.connect(conection);
        const results = [];
        try {
            const users = await USERModel.getAllUserNames(pool);
            const pendingTasks = await CRMModel.createCRMPendingTasks(pool);
            const groupTasks = groupBy(pendingTasks, users);
            const pendingEmails = prepareEmail(groupTasks);
            const baseUrl = process.env.CRM_POST;
            if (!baseUrl) {
                throw new Error('CRM_POST is not defined in environment variables');
            }
            const sendMailUrl = `${baseUrl.replace(/\/$/, '')}/api/global/v1/send_mail`;

            for (let i = 0; i < pendingEmails.length; i++) {
                const payload = {
                    to: pendingEmails[i].to || '',
                    cc: pendingEmails[i].cc || '',
                    cco: pendingEmails[i].cco || '',
                    subject: pendingEmails[i].subject || 'Pending Tasks CRM',
                    body: pendingEmails[i].body || ''
                };

                if (!payload.to) {
                    results.push({ ok: false, status: 400, error: { message: 'Missing recipient email' } });
                    continue;
                }

                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 15000);

                try {
                    const mailRes = await fetch(sendMailUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: controller.signal
                    });

                    const contentType = mailRes.headers.get('content-type') || '';
                    const data = contentType.includes('application/json')
                        ? await mailRes.json().catch(() => null)
                        : await mailRes.text().catch(() => null);

                    if (!mailRes.ok) {
                        results.push({
                            ok: false,
                            status: mailRes.status,
                            to: payload.to,
                            error: data || { message: mailRes.statusText }
                        });
                    } else {
                        results.push({ ok: true, status: mailRes.status, to: payload.to });
                    }
                } catch (error) {
                    const status = error.name === 'AbortError' ? 408 : 500;
                    results.push({ ok: false, status, to: payload.to, error: { message: error.message } });
                } finally {
                    clearTimeout(timeout);
                }

            }

            const failures = results.filter((item) => !item.ok);
            if (failures.length > 0) {
                throw new Error(`Failed to send ${failures.length} pending CRM email(s)`);
            }

            if (res) {
                return res.status(200).json({ ok: true, status: 200, sent: results.length, results });
            }
            return { ok: true, status: 200, sent: results.length, results };

        } catch (error) {
            if (res) {
                res.status(500).json({ ok: false, error: error.message, results });
            } else {
                console.error(error.message);
                return { ok: false, error: error.message, results };
            }
        }
    }

    static async sendRecentMessagesDigest(conection, req, res) {
        const pool = await sql.connect(conection);
        const results = [];
        try {
            const recentCRMs = await CRMModel.findCRMsWithRecentMessages(pool);
            if (recentCRMs.length === 0) {
                const msg = 'No recent CRM messages found';
                if (res) return res.status(200).json({ ok: true, message: msg });
                return { ok: true, message: msg };
            }

            const baseUrl = process.env.CRM_POST;
            if (!baseUrl) throw new Error('CRM_POST is not defined in environment variables');
            const sendMailUrl = `${baseUrl.replace(/\/$/, '')}/api/global/v1/send_mail`;
            function normalizeMessage(html) {
                return String(html || '')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&')
                    .replace(/&nbsp;/g, ' ')
                    .replace(
                        /<b>(.*?)<\/b>/gi,
                        '<strong data-lexical-text="true">$1</strong>'
                    )
                    .replace(/<table[\s\S]*?<\/table>/gi, '')
                    .replace(/<(?!\/?strong\b)[^>]+>/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            const escapeHtml = (value) => String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/<[^>]*>/g, '')
                .trim();
            // Collect per-participant: { email -> { name, cases: [{ crm, messages }] } }
            const perParticipant = {};

            for (const crm of recentCRMs) {
                const messages = await CRMModel.getLastMessagesByCRM(pool, crm.id, 5, 30);
                if (messages.length === 0) continue;
                const participants = await CRMModel.getCRMParticipants(pool, crm.id);
                if (participants.length === 0) continue;
                const senderUserIDs = new Set(
                    messages.map(m => m.de_nombre).filter(Boolean)
                );

                for (const p of participants) {
                    if (senderUserIDs.has(p.UserID)|| senderUserIDs.has(p.Name) ) continue;
                    const email = p.Email;
                    if (!email) continue;
                    if (!perParticipant[email]) {
                        perParticipant[email] = { name: p.Name || p.UserID || 'User', cases: [] };
                    }
                    if (!perParticipant[email].cases.some(c => c.crm.id === crm.id)) {
                        perParticipant[email].cases.push({ crm, messages });
                    }
                }
            }

            if (Object.keys(perParticipant).length === 0) {
                const msg = 'No participants found for recent messages';
                if (res) return res.status(200).json({ ok: true, message: msg });
                return { ok: true, message: msg };
            }

            const totalCases = new Set();
            for (const entry of Object.values(perParticipant)) {
                entry.cases.forEach(c => totalCases.add(c.crm.id));
            }

            for (const [toDesigned, entry] of Object.entries(perParticipant)) {
                const name = escapeHtml(entry.name);
                const firstName = name.split(' ')[0];

                const caseSections = entry.cases.map(({ crm, messages }, idx) => {
                    const priority = crm.cprioridad === 2 ? 'critical' : crm.cprioridad === 1 ? 'important' : 'normal';
                    const priorityLabel = priority.charAt(0).toUpperCase() + priority.slice(1);
                    const priorityColor = priority === 'critical' ? '#DC3545' : priority === 'important' ? '#FF4400' : '#FFCA1C';
                    const crmTitle = escapeHtml(crm.conversacion_titulo || crm.asunto_interno || 'CRM Case');

                    const msgRows = messages.map(m => {
                        const sender = escapeHtml(m.de_nombre || m.de_correo || 'Unknown');
                        let body = normalizeMessage((m.body_mensaje || ''))
                        body = body.slice(0, 250) ;
                        return `<tr><td style="padding:8px 12px;border:1px solid #e5e5e5;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#333;">${m.ffingreso || ''}</td><td style="padding:8px 12px;border:1px solid #e5e5e5;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#333;">${sender}</td><td style="padding:8px 12px;border:1px solid #e5e5e5;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#333;">${body}</td></tr>`;
                    }).join('');

                    const separator = idx > 0
                        ? '<tr><td style="padding:0 24px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="border-top:2px solid #00586F;font-size:0;line-height:0;padding-top:16px;">&nbsp;</td></tr></table></td></tr>'
                        : '';

                    return separator +
                        '<tr><td style="padding:16px 24px 4px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#222222;"><strong>#' + crm.id + ' — ' + crmTitle + '</strong></td></tr>' +
                        '<tr><td style="padding:0 24px 8px 24px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="' + priorityColor + '" style="padding:3px 8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;">' + priorityLabel + '</td></tr></table></td></tr>' +
                        '<tr><td style="padding:4px 24px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">' +
                        '<thead><tr><td style="padding:6px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;color:#5f5f5f;border:1px solid #e5e5e5;background:#fafafa;">Date</td><td style="padding:6px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;color:#5f5f5f;border:1px solid #e5e5e5;background:#fafafa;">From</td><td style="padding:6px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;color:#5f5f5f;border:1px solid #e5e5e5;background:#fafafa;">Message</td></tr></thead>' +
                        '<tbody>' + msgRows + '</tbody></table></td></tr>';
                }).join('');

                const bodyHtml = '<!DOCTYPE html>' +
                    '<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRM Messages Digest</title></head>' +
                    '<body style="margin:0;padding:0;background-color:#f2f2f2;">' +
                    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f2f2f2;">' +
                    '<tr><td align="center" style="padding:24px 12px;">' +
                    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="width:640px;max-width:640px;background-color:#ffffff;border-collapse:collapse;">' +
                    '<tr><td style="padding:24px 24px 12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:28px;color:#222222;"><strong>Hello, ' + firstName + '.</strong></td></tr>' +
                    '<tr><td style="padding:0 24px 16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#555;">' +
                    totalCases.size + ' CRM case' + (totalCases.size > 1 ? 's have' : ' has') + ' new messages in the last 30 minutes.</td></tr>' +
                    '<tr><td style="padding:0 0 0 0;">' + caseSections + '</td></tr>' +
                    '<tr><td style="padding:20px 24px 24px 24px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#00586F" style="padding:10px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;"><a href="sir://ActiveDashboard|/" style="color:#ffffff;text-decoration:none;">Open Dashboard</a></td></tr></table></td></tr>' +
                    '</table></td></tr></table></body></html>';

                const payload = {
                    to: process.env.ENTORNO === 'desa' ? 'epinto@acreinsurance.com' : toDesigned,
                    cc: '',
                    cco: '',
                    subject: `CRM Case with new messages`,
                    body: bodyHtml
                };

                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 15000);
                try {
                    const mailRes = await fetch(sendMailUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: controller.signal
                    });
                    const contentType = mailRes.headers.get('content-type') || '';
                    const data = contentType.includes('application/json')
                        ? await mailRes.json().catch(() => null)
                        : await mailRes.text().catch(() => null);
                    if (!mailRes.ok) {
                        results.push({ ok: false, status: mailRes.status, to: toDesigned, error: data || { message: mailRes.statusText } });
                    } else {
                        results.push({ ok: true, status: mailRes.status, to: toDesigned });
                    }
                } catch (error) {
                    const status = error.name === 'AbortError' ? 408 : 500;
                    results.push({ ok: false, status, to: toDesigned, error: { message: error.message } });
                } finally {
                    clearTimeout(timeout);
                }
            }

            const failures = results.filter(r => !r.ok);
            if (failures.length > 0) {
                console.error(`Failed to send ${failures.length} digest email(s)`);
            }

            if (res) {
                return res.status(200).json({ ok: true, status: 200, sent: results.filter(r => r.ok).length, failed: failures.length, results });
            }
            return { ok: true, status: 200, sent: results.filter(r => r.ok).length, failed: failures.length, results };

        } catch (error) {
            if (res) {
                res.status(500).json({ ok: false, error: error.message, results });
            } else {
                console.error(error.message);
                return { ok: false, error: error.message, results };
            }
        }
    }

    static async readUsersByDepartment(connection, req, res) {
        const { departamento_id, u_asignado } = req.body;
        const pool = await sql.connect(connection);

        try {
            let users = [];
            let otherUsers = [];
            let usersSplit = [];
            users = await CRMModel.getUserBydepartment(pool, departamento_id);
            const department = await DepartamentModel.getDepartmentNameById(pool, departamento_id);
            const getUserByGroupCRM = u_asignado && await CRMModel.getUserByGroupCRM(pool, u_asignado).then(data => data) || [];
            if (Array.isArray(getUserByGroupCRM) && getUserByGroupCRM[0] != undefined) {
                const integrantes = getUserByGroupCRM[0].xintegrantes.split(';').map(s => s.trim()).filter(Boolean);
                for (const name of integrantes) {
                    const data = await USERModel.obtenerDatosUsuario(pool, name).then(data => ({
                        Name: data?.UserName || '',
                        UserID: name || '',
                        Modules: data?.Modules || '',
                        Dep: data?.Dep || '',
                    }));
                    usersSplit.push(data);
                }
            }
            if (department.parent_of !== null) {
                const parent = department.parent_of.split(';');
                for (let dep of parent) {
                    const parentDepartment = await CRMModel.getUserBydepartment(pool, dep);
                    otherUsers = otherUsers.concat(parentDepartment);
                }
            }

            if (users.length === 0 && otherUsers.length === 0) {
                return res.status(404).json({ message: 'No users found for the given department.' });
            }
            const result = users.concat(otherUsers).concat(usersSplit);
            const resultClean = Array.from(
                new Map(result.map(user => [user.UserID, user])).values());
            return res.status(200).json({ users: resultClean });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async CreateNewCRM(conection, req, res) {
        let { UserID, asignados, description, cprioridad, conversacion_titulo = null, u_asignado = null, departamento_id = null, asuntoOutlook = null, dateOutlook = null, asunto_interno = null, detalle = null, origen = null, crm_case_id = null, business_relationship = null, finicio = null } = req.body;
        description = sanitizeHtml(description);
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        asignados = asignados ? asignados.split(';').filter(s => s !== '') : [];
        let user
        try {
            await transaction.begin();
            if (origen !== 'EMAIL') {
                user = await USERModel.obtenerDatosUsuario(transaction, UserID);
                for (let i = 0; i < asignados.length; i++) {
                    const userData = await USERModel.obtenerDatosUsuario(transaction, asignados[i]);
                    asignados[i] = { department: userData.Dep, code: userData.UserID, name: userData.UserName };
                }
            } else {
                user = await USERModel.obtenerDatosUsuario(transaction, u_asignado);
                asignados[0] = { department: user.Dep, code: user.UserID, user: user.UserName };
            }
            const prioridad = await CRMModel.getCRMPrioridad(transaction);
            let dueDate = null
            const dueDateFunc = (cprioridad) => {
                const currentDate = new Date();
                let daysToAdd = 0;
                switch (cprioridad) {
                    case 0:
                        daysToAdd = prioridad.find(p => p.cprioridad === 0)?.ndias || 1;
                        break;
                    case 1:
                        daysToAdd = prioridad.find(p => p.cprioridad === 1)?.ndias || 3;
                        break;
                    case 2:
                        daysToAdd = prioridad.find(p => p.cprioridad === 2)?.ndias || 5;
                        break;
                }
                return new Date(currentDate.setDate(currentDate.getDate() + daysToAdd));
            }
            dueDate = dueDateFunc(Number(cprioridad));
            // Resolve asunto_interno label if it's a numeric type_id
            const asunto_label = /^\d+$/.test(String(asunto_interno || ''))
                ? ((await CRMModel.getCaseTypeLabelById(transaction, asunto_interno)) || asunto_interno)
                : asunto_interno;
            // Parse finicio from ISO string if provided
            let parsedFinicio = null;
            if (finicio) {
                const isoRe = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
                const fm = String(finicio).match(isoRe);
                if (fm) {
                    const [_, fy, fmo, fd, fh, fmin] = fm;
                    parsedFinicio = new Date(Date.UTC(parseInt(fy, 10), parseInt(fmo, 10) - 1, parseInt(fd, 10), parseInt(fh, 10), parseInt(fmin, 10)));
                }
            }

            if (origen !== 'EMAIL') {
                const newCase = await CRMModel.createNewCase(transaction, user.UserEmail, asignados, description, cprioridad, conversacion_titulo, u_asignado, departamento_id, asuntoOutlook, dateOutlook, asunto_interno, detalle, dueDate, user.Dep, business_relationship, parsedFinicio);
                await CRMModel.createNewMessage(transaction, newCase, 'New comment', description, 1, user.UserName, req.files);
                for (let asignado of asignados) {
                    await postCRM(`${asignado.code}@acreinsurance.com`, null, null, asunto_label, description, cprioridad, asignado.name, conversacion_titulo, newCase)
                }
                await transaction.commit();
                const xprioridadMap = {0: 'Normal', 1: 'Important', 2: 'Urgent'};
                const xprioridadLabel = xprioridadMap[Number(cprioridad)] || 'Normal';
                const _fmtDate = (d) => { if (!d) return null; const dt = new Date(d); return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0'); };
                const userAsigStr = Array.isArray(asignados) ? asignados.map(a => a.code).join(';') : '';
                res.send({
                    result: 1,
                    id: newCase,
                    caseData: {
                        id: newCase,
                        xprioridad: xprioridadLabel,
                        cprioridad: Number(cprioridad),
                        asunto_interno: asunto_label || '---',
                        conversacion_titulo: conversacion_titulo || '',
                        fecha_fin: _fmtDate(dueDate),
                        fecha_modificado: null,
                        fecha_ingreso: _fmtDate(new Date()),
                        user_asig: userAsigStr || null,
                        xestado: 'Not started',
                        de_nombre: user.UserEmail
                    }
                })
            } else {
                await postCRM(user.UserEmail, null, null, asunto_label, detalle, cprioridad, user.UserName, asuntoOutlook, crm_case_id)
                await transaction.commit();
                res.send({ result: 1 })
            }
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }
    static async notificationNewCRM(conection, req, res) {
        let {asignados, origen=null, crm_case_id=null } = req.body;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const crmid = await CRMModel.getCrmMainData(transaction, crm_case_id)
            let { asunto_interno,conversacion_titulo,user_asig ,xprioridad } = crmid.recordset[0]
            asignados = user_asig ? user_asig.split(';').filter(s => s !=='') : [];
            if(origen !== 'EMAIL'){
            for (let i = 0; i < asignados.length; i++) {
                const userData = await USERModel.obtenerDatosUsuario(transaction, asignados[i]);
                asignados[i] = { department : userData.Dep, code: userData.UserID, name:userData.UserName };
            }
            }

            for(let asignado of asignados){
                await postCRM(`${asignado.code}@acreinsurance.com`, null, null, asunto_interno, "New case created", xprioridad, asignado.name, conversacion_titulo, crm_case_id )
            }
            await transaction.commit();
            res.send({ result: 1})
            
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }
    static async getCRMPost(conection, req, res) {
        const pool = await sql.connect(conection);
        const UserID = req.session?.userID;

        try {
            const { departamentos, status = '', asigned = 0, page = 1, limit = 15, search = '', priority = '', key = '', assigned_users = '', global_status = '' } = req.body;
            const offset = (page - 1) * limit;
            const userInfo = await USERModel.obtenerDatosUsuario(pool, UserID)
            // Run the page query and the count in parallel — they are independent
            // requests over the pool (not a single-connection transaction), so this
            // roughly halves total latency vs. awaiting them one after the other.
            const [crmPosts, totalCount] = await Promise.all([
                CRMModel.getCRMPost(
                    pool,
                    userInfo.UserEmail,
                    userInfo.cdepartamento,
                    status,
                    asigned,
                    UserID,
                    limit,
                    offset,
                    search,
                    priority,
                    key,
                    assigned_users,
                    global_status
                ),
                CRMModel.getCRMPostCount(
                    pool,
                    userInfo.UserEmail,
                    userInfo.cdepartamento,
                    status,
                    asigned,
                    UserID,
                    search,
                    priority,
                    key,
                    assigned_users,
                    global_status
                )
            ]);

            res.send({ result: 1, crm: crmPosts, totalCount: totalCount });
        } catch (error) {
            console.log("user",UserID)
            console.log(error)
            req.body.UsuarioID = UserID;
            req.error = error.message;
            await DashboardController.createErrorLog(conection, req, res);
        }
    }

    static async downloadExcel(conection, req, res) {
        const data = req.body?.data || req.body || {};
        const UserID = req.session?.userID;

        const status = data.status || '';
        const asigned = Number(data.asigned || 0);
        const search = data.search || '';
        const priority = data.priority || '';
        const key = data.key || '';
        const assignedUsers = data.assigned_users || '';
        const globalStatus = data.global_status || '';

        await sql.connect(conection);
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();
            const userInfo = await USERModel.obtenerDatosUsuario(transaction, UserID);

            const totalCount = await CRMModel.getCRMPostCount(
                transaction,
                userInfo.UserEmail,
                userInfo.cdepartamento,
                status,
                asigned,
                UserID,
                search,
                priority,
                key,
                assignedUsers,
                globalStatus
            );

            if (!totalCount || totalCount <= 0) {
                await transaction.commit();
                return res.status(400).send('No data provided');
            }

            const crmPosts = await CRMModel.getCRMPost(
                transaction,
                userInfo.UserEmail,
                userInfo.cdepartamento,
                status,
                asigned,
                UserID,
                totalCount,
                0,
                search,
                priority,
                key,
                assignedUsers,
                globalStatus
            );

            const rows = crmPosts.map((item) => ({
                case_id: item.id,
                priority: item.xprioridad || '',
                case_type: item.asunto_interno || '',
                subject: item.conversacion_titulo || '',
                due_date: item.fecha_fin || '',
                last_update: item.fecha_modificado || item.fecha_ingreso || '',
                assigned: item.user_asig || '',
                status: item.xestado || '',
                owner: item.de_nombre || ''
            }));

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('crm');

            worksheet.mergeCells('A1:I1');
            worksheet.getCell('A1').value = 'CRM';
            worksheet.getCell('A1').font = { bold: true, size: 14 };
            worksheet.getCell('A1').alignment = { horizontal: 'center' };

            worksheet.addRow(['Case', 'Priority', 'Case Type', 'Subject', 'Due Date', 'Last Update', 'Assigned', 'Status', 'Owner']);

            worksheet.columns = [
                { key: 'case_id', width: 10 },
                { key: 'priority', width: 14 },
                { key: 'case_type', width: 28 },
                { key: 'subject', width: 50 },
                { key: 'due_date', width: 14 },
                { key: 'last_update', width: 14 },
                { key: 'assigned', width: 30 },
                { key: 'status', width: 16 },
                { key: 'owner', width: 24 }
            ];

            rows.forEach(row => worksheet.addRow(row));

            worksheet.getRow(2).font = { bold: true };
            worksheet.getRow(2).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'DCE6F1' }
            };

            await transaction.commit();

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=crm.xlsx');

            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            if (transaction._begun) {
                try { await transaction.rollback(); } catch (_) {}
            }
            console.error('Error generating CRM Excel file:', error);
            res.status(500).send('Error generating CRM Excel file');
        }
    }

static async getCrmCase(conection, req, res) {
       const crm_id = req.body.crm_id;
       let pool;
       const transaction = new sql.Transaction();
 
       try {
           const access = await validateCrmReadAccess(conection, req, crm_id);
           if (!access.ok) {
               return res.status(access.status).json({ result: 0, error: access.error });
           }
 
           pool = await sql.connect(conection);
           transaction._poolConnection = pool;
           await transaction.begin();
 
           const crm_main = await CRMModel.getCrmMainData(transaction, crm_id);
           const estados_dep = await CRMModel.getCrmEstadosByDepartment(transaction, crm_id);
 
           await transaction.commit();
           res.send({ result: 1, crm_main, estados_dep });
       } catch (error) {
           if (transaction._begun) {
               try { await transaction.rollback(); } catch (_) {}
           }
           res.status(500).json({ result: 0, error: error.message });
       }
   }
    static async getUsuario(conection, req, res) {
        await sql.connect(conection);
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();
            const users = await USERModel.getAllUserActive(transaction,"1")

            await transaction.commit();
            res.send({ result: 1, users });
        } catch (error) {
            if (transaction._begun) {
                try { await transaction.rollback(); } catch (_) {}
            }
            res.status(500).json({ result: 0, error: error.message });
        }
    }

   static async crm_main_detail(conection, req, res) {
       const pool = await sql.connect(conection);
 
       try {
           const UserID = req.session?.userID
           const crm_id = req.query.crm_id
 
           let devteam = await Rules.validateTeam(req.session?.iddevteam,UserID);
           const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
 
           const access = await validateCrmReadAccess(conection, req, crm_id);
           if (!access.ok) {
               return res.render("detaller-error", {
                   title: "CRM - Detail",
                   userProfile: {
                       UserName: usuario.UserName,
                       UserID: UserID,
                       UsuarioID: UserID,
                       departamentoOrigen: usuario.Dep,
                       departamento: usuario.departamento
                   },
                   detalle: {
                        RowID: `CRM # ${crm_id}`,
                    },
                   userMenu: usuario.Menu,
                   usuarios: [],
                   devteam: devteam,
                   crm_id,
               });
           }
            const grupousuarios_active = await USERModel.getAllUserActive(pool,usuario.compania);
            const departaments = await DepartamentModel.getDepartaments(conection);
            const temp = []
            const linked_meetings = await CRMModel.linkedMeetings(pool, crm_id)
            const businessRelationships = await CRMModel.getBusinessRelationships(pool);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
                res.render("CRM/crm_msg",{
                title: "CRM - Detail",
                userProfile: {
                    UserName: usuario.UserName,
                    UserID: UserID,
                    UsuarioID: UserID,
                    departamentoOrigen: usuario.Dep,
                    departamento: usuario.departamento
                },
                grupousuarios_active: grupousuarios_active,
                usuarios: grupousuarios,
                userMenu: usuario.Menu,
                okForm: 1,
                devteam: devteam,
                tabla: departaments,
                col_id: departaments,
                crm_u: temp,
                crm_id,
                linked_meetings,
                businessRelationships: businessRelationships.map(r => ({ value: r.b_relation_id, label: r.label })),
                crmServer1: process.env.server_1 || ''
            })
        
        }catch (error) {
            res.status(500).json({ result: 0, error: error.message });
        }
    }

    static async serveCrmFile(connection, req, res) {
        const crmId = Number(req.query.crm_id);
        const msgId = Number(req.query.msg_id);
        const filename = String(req.query.filename || '').trim();
        const forceDownload = req.query.dl === '1';

        if (!crmId || !msgId || !isSafeFilename(filename)) {
            return res.status(400).send({ error: 'Invalid parameters' });
        }

        try {
            const access = await validateCrmReadAccess(connection, req, crmId);
            if (!access.ok) {
                return res.status(access.status).send({ error: access.error });
            }

            const uncPath = buildCrmUncPath(crmId, msgId, filename);
            if (!uncPath) {
                return res.status(500).send({ error: 'server_1 or file_server is not configured' });
            }

            if (!existsSync(uncPath)) {
                return res.status(404).send({ error: 'File not found' });
            }

            const stat = statSync(uncPath);
            const mimeType = getCrmMimeType(filename);

            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Type', mimeType);
            if (forceDownload) {
                res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            } else {
                res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
            }

            const stream = createReadStream(uncPath);
            stream.on('error', (err) => {
                console.error('CRM file stream error:', err);
                if (!res.headersSent) res.status(500).send({ error: 'Error reading file' });
            });
            stream.pipe(res);
        } catch (error) {
            console.error('serveCrmFile error:', error);
            if (!res.headersSent) {
                return res.status(500).send({ error: error.message });
            }
        }
    }

    static async serveCrmOpenCmd(connection, req, res) {
        const crmId = Number(req.query.crm_id);
        const msgId = Number(req.query.msg_id);
        const filename = String(req.query.filename || '').trim();
        const mode = String(req.query.mode || 'download').toLowerCase();
        const ext = getCrmFileExtension(filename);

        if (!crmId || !msgId || !isSafeFilename(filename)) {
            return res.status(400).send({ error: 'Invalid parameters' });
        }

        if (ext !== '.pdf' && ext !== '.msg') {
            return res.status(400).send({ error: 'Only .pdf and .msg files are supported' });
        }

        try {
            const access = await validateCrmReadAccess(connection, req, crmId);
            if (!access.ok) {
                return res.status(access.status).send({ error: access.error });
            }

            const uncPath = buildCrmUncPath(crmId, msgId, filename);
            if (!uncPath) {
                return res.status(500).send({ error: 'server_1 or file_server is not configured' });
            }

            if (!existsSync(uncPath)) {
                return res.status(404).send({ error: 'File not found' });
            }

            if (hasUnsafeCmdChars(uncPath)) {
                return res.status(400).send({ error: 'Invalid path for command generation' });
            }

            const cmdContent = buildOpenCommandContent(filename, uncPath);

            if (mode === 'run') {
                const tempDir = getCrmTempCmdDirectory();
                try {
                    if (!existsSync(tempDir)) {
                        mkdirSync(tempDir, { recursive: true });
                    }
                    const tempCmdName = getCrmTempCmdFilename(crmId, msgId, filename);
                    const tempCmdPath = `${tempDir}\\${tempCmdName}`;
                    writeFileSync(tempCmdPath, cmdContent, { encoding: 'utf8' });

                    return res.status(200).send({ result: 1, cmd_path: tempCmdPath });
                } catch (tempError) {
                    console.error('CRM temp CMD save error:', tempError);
                    return res.status(500).send({
                        error: 'Failed to save cmd in temporal folder',
                        error_code: tempError.code || 'UNKNOWN',
                        error_details: tempError.message,
                    });
                }
            }

            const downloadName = getSafeCmdDownloadName(filename);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
            return res.status(200).send(cmdContent);
        } catch (error) {
            console.error('serveCrmOpenCmd error:', error);
            return res.status(500).send({ error: error.message });
        }
    }

    static async launchCrmOpenOnClient(connection, req, res) {
        const crmId = Number(req.query.crm_id);
        const msgId = Number(req.query.msg_id);
        const filename = String(req.query.filename || '').trim();
        const ext = getCrmFileExtension(filename);
        const responseType = String(req.query.response || '').toLowerCase();
        const silent = String(req.query.silent || '0') === '1';

        if (!crmId || !msgId || !isSafeFilename(filename)) {
            return res.status(400).send({ error: 'Invalid parameters' });
        }

        if (ext !== '.pdf' && ext !== '.msg') {
            return res.status(400).send({ error: 'Only .pdf and .msg files are supported' });
        }

        try {
            const access = await validateCrmReadAccess(connection, req, crmId);
            if (!access.ok) {
                return res.status(access.status).send({ error: access.error });
            }

            const uncPath = buildCrmUncPath(crmId, msgId, filename);
            if (!uncPath) {
                return res.status(500).send({ error: 'server_1 or file_server is not configured' });
            }

            if (!existsSync(uncPath)) {
                return res.status(404).send({ error: 'File not found' });
            }

            if (hasUnsafeCmdChars(uncPath)) {
                return res.status(400).send({ error: 'Invalid path for command generation' });
            }

            const cmdContent = buildOpenCommandContent(filename, uncPath);
            const tempDir = getCrmTempCmdDirectory();
            if (!existsSync(tempDir)) {
                mkdirSync(tempDir, { recursive: true });
            }

            const tempCmdName = getCrmTempCmdFilename(crmId, msgId, filename);
            const tempCmdPath = `${tempDir}\\${tempCmdName}`;
            writeFileSync(tempCmdPath, cmdContent, { encoding: 'utf8' });

            const fileReady = await waitForFileReady(tempCmdPath);
            if (!fileReady) {
                return res.status(500).send({ error: 'Launcher file was created but is not yet ready. Please try again.' });
            }

            const launchUrl = encodeURI('file://' + tempCmdPath.replace(/\\/g, '/'));
            if (responseType === 'json') {
                return res.status(200).send({
                    result: 1,
                    cmd_path: tempCmdPath,
                    launch_url: launchUrl,
                });
            }
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

            if (silent) {
                return res.status(200).send(
                    '<!doctype html>' +
                    '<html><head><meta charset="utf-8"><title></title></head>' +
                    '<body><script>(function(){' +
                    'var u=' + JSON.stringify(launchUrl) + ';' +
                    'var a=document.createElement("a");a.href=u;a.style.display="none";document.body.appendChild(a);' +
                    'function fire(){try{window.location.href=u;}catch(e){}try{a.click();}catch(e){}}' +
                    'fire();setTimeout(fire,350);setTimeout(fire,1200);' +
                    '})();</script></body></html>'
                );
            }

            const safeLaunchHref = launchUrl
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
            return res.status(200).send(
                '<!doctype html>' +
                '<html><head><meta charset="utf-8"><title>Opening file...</title></head>' +
                '<body style="font-family:Segoe UI,Arial,sans-serif;padding:18px;">' +
                '<p>Launching file on your computer...</p>' +
                '<p>If nothing opens, click: <a href="' + safeLaunchHref + '">Open file locally</a></p>' +
                '<script>(function(){var u=' + JSON.stringify(launchUrl) + ';window.location.href=u;})();</script>' +
                '</body></html>'
            );
        } catch (error) {
            console.error('launchCrmOpenOnClient error:', error);
            return res.status(500).send({ error: error.message });
        }
    }

    static async openCrmFromBackend(connection, req, res) {
        return res.status(410).send({
            result: 0,
            error: 'Backend open disabled. Use /crm-open-local for client-side opening.'
        });
    }

    static async launchCrmFile(connection, req, res) {
        const crmId = Number(req.query.crm_id);
        const msgId = Number(req.query.msg_id);
        const filename = String(req.query.filename || '').trim();

        if (!crmId || !msgId || !isSafeFilename(filename)) {
            return res.status(400).json({ result: 0, error: 'Invalid parameters' });
        }

        try {
            const access = await validateCrmReadAccess(connection, req, crmId);
            if (!access.ok) {
                return res.status(access.status).json({ result: 0, error: access.error });
            }

            const uncPath = buildCrmUncPath(crmId, msgId, filename);
            if (!uncPath) {
                return res.status(500).json({ result: 0, error: 'File server not configured' });
            }

            if (!existsSync(uncPath)) {
                return res.status(404).json({ result: 0, error: 'File not found on server' });
            }

            return res.json({ result: 1, unc_path: uncPath });
        } catch (error) {
            console.error('launchCrmFile error:', error);
            return res.status(500).json({ result: 0, error: error.message });
        }
    }

    static async getCrmMsgContent(connection, req, res) {
        const crmId = Number(req.query.crm_id);
        const msgId = Number(req.query.msg_id);
        const filename = String(req.query.filename || '').trim();

        if (!crmId || !msgId || !isSafeFilename(filename)) {
            return res.status(400).json({ result: 0, error: 'Invalid parameters' });
        }
        if (getCrmFileExtension(filename) !== '.msg') {
            return res.status(400).json({ result: 0, error: 'Only .msg files are supported' });
        }

        try {
            const access = await validateCrmReadAccess(connection, req, crmId);
            if (!access.ok) {
                return res.status(access.status).json({ result: 0, error: access.error });
            }

            const uncPath = buildCrmUncPath(crmId, msgId, filename);
            if (!uncPath || !existsSync(uncPath)) {
                return res.status(404).json({ result: 0, error: 'File not found' });
            }

            const buffer = readFileSync(uncPath);
            const reader = new MsgReader(buffer);
            const data = reader.getFileData();

            const formatRecipients = (list, type) => {
                if (!Array.isArray(list)) return [];
                return list
                    .filter(r => !type || r.recipType === type)
                    .map(r => ({
                        name: r.name || '',
                        email: r.smtpAddress || r.email || ''
                    }));
            };

            const attachments = (data.attachments || []).map((att, idx) => ({
                index: idx,
                filename: att.fileName || att.fileNameShort || `attachment_${idx}`,
                size: att.contentLength || 0,
                mimeType: att.mimeType || ''
            }));

            const bodyHtml = data.bodyHtml || data.compressedRtf ? (data.bodyHtml || '') : '';
            const bodyText = data.body || '';

            return res.json({
                result: 1,
                subject: data.subject || '(no subject)',
                from: {
                    name: data.senderName || '',
                    email: data.senderEmail || data.senderSmtpAddress || ''
                },
                to: formatRecipients(data.recipients, 'to'),
                cc: formatRecipients(data.recipients, 'cc'),
                date: data.messageDeliveryTime || data.clientSubmitTime || data.creationTime || null,
                bodyHtml: bodyHtml,
                bodyText: bodyText,
                attachments: attachments
            });
        } catch (error) {
            console.error('getCrmMsgContent error:', error);
            return res.status(500).json({ result: 0, error: error.message });
        }
    }

    static async getCrmMsgAttachment(connection, req, res) {
        const crmId = Number(req.query.crm_id);
        const msgId = Number(req.query.msg_id);
        const filename = String(req.query.filename || '').trim();
        const attIndex = Number(req.query.att_index);

        if (!crmId || !msgId || !isSafeFilename(filename) || !Number.isInteger(attIndex) || attIndex < 0) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }
        if (getCrmFileExtension(filename) !== '.msg') {
            return res.status(400).json({ error: 'Only .msg files are supported' });
        }

        try {
            const access = await validateCrmReadAccess(connection, req, crmId);
            if (!access.ok) {
                return res.status(access.status).json({ error: access.error });
            }

            const uncPath = buildCrmUncPath(crmId, msgId, filename);
            if (!uncPath || !existsSync(uncPath)) {
                return res.status(404).json({ error: 'File not found' });
            }

            const buffer = readFileSync(uncPath);
            const reader = new MsgReader(buffer);
            const data = reader.getFileData();

            if (!data.attachments || !data.attachments[attIndex]) {
                return res.status(404).json({ error: 'Attachment not found' });
            }

            const attData = reader.getAttachment(attIndex);
            const attName = (data.attachments[attIndex].fileName || data.attachments[attIndex].fileNameShort || `attachment_${attIndex}`);

            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attName)}"`);
            res.setHeader('Content-Length', attData.content.length);
            return res.send(Buffer.from(attData.content));
        } catch (error) {
            console.error('getCrmMsgAttachment error:', error);
            return res.status(500).json({ error: error.message });
        }
    }

    // CRM CASE TYPE
    static async addCRMCaseType(conection, req, res) {
        const data = req.body
        const user = req.session?.userID
        if(data.label ==''){
            return res.status(400).send("Required Fields Not Submited")
        }

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const userData = await USERModel.obtenerDatosUsuario(transaction, user);
            const isUpdate = data.type_id !== undefined && data.type_id !== null && data.type_id !== '';
                const isDuplicate = await CRMModel.CheckDuplicateLabel(
                    transaction,
                    data.label,
                    data.departamento_modal,
                    isUpdate ? data.type_id : null
                );
                if (isDuplicate) {
                    try { await transaction.rollback(); } catch (_) {}
                    return res.status(409).send("label already exists");
                }
            
            const result = await CRMModel.CreateCaseTypeCRM(transaction, data, userData);
            await transaction.commit();
            res.status(200).send(result);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error(error);
            res.status(400).send("Approval Not Cancelled");
        }
    }

    static async getCRMCaseDetailJson(conection, req, res) {
        const UserID = req.session?.userID;
        const type_id = req.query.id;
        if (!type_id) return res.status(400).json({ error: 'Missing id' });
        const pool = await sql.connect(conection);
        try {
            const userData = await USERModel.obtenerDatosUsuario(pool, UserID);
            const caseTypes = await CRMModel.GetLabelById(pool, type_id);
            const userDeps = userData.departamento.split(';') 
            const canEdit = (caseTypes && userDeps.includes(String(caseTypes.departamento)));
            res.json({ case_type: caseTypes || {}, canEdit });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error loading case types' });
        }
    }

    static async renderCasesTypes(conection, req, res) {
        const UserID = req.session?.userID;
        const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam);

        const pool = await sql.connect(conection);
        try {
            const userData = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];

            // Departments the user has access to
            const departments = await DepartamentModel.getDepartmentsByStringIds(pool, userData.departamento);
            const companies = await DepartamentModel.getCompaniesByStringIds(pool, userData.companies);

            res.render('CRM/crm_case_type_list', {
                title: 'Beneficiary Manager',
                userProfile: {
                    UserName: userData.UserName,
                    UsuarioID: UserID,
                    Dep: userData.Dep,
                },
                compania: userData.compania,
                departments: departments.map(d => ({ id: d.id, nombre: d.nombre, ccompania: d.ccompania })),
                companies: companies,
                userMenu: userData.Menu,
                usuarios:grupousuarios,
                devteam: devteam,
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Error loading beneficiary list');
        }
    }

    static async getCaseTypesForDropdown(conection, req, res) {
        const UserID = req.session?.userID;
        const pool = await sql.connect(conection);
        try {
            const { compania, companies, departamento } = await USERModel.obtenerDatosUsuario(pool, UserID);
            const companiesInfo = await DepartamentModel.getCompaniesByStringIds(pool, companies);
            const department = await DepartamentModel.getDepartmentsByStringIds(pool, departamento);
            const depIds = department.map(dep => dep.id);
            const rows = await CRMModel.getCaseTypesAllActive(pool, compania, companiesInfo, depIds);
            res.status(200).json({ data: rows });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    }
    static async getCaseTypesForOutlook(conection, req, res) {
        const UserID = req.query.p
        const pool = await sql.connect(conection);
        try {
            const { compania, companies, departamento } = await USERModel.obtenerDatosUsuario(pool, UserID);
            const companiesInfo = await DepartamentModel.getCompaniesByStringIds(pool, companies);
            const department = await DepartamentModel.getDepartmentsByStringIds(pool, departamento);
            const depIds = department.map(dep => dep.id);
            const rows = await CRMModel.getCaseTypesAll(pool, compania, companiesInfo, depIds);
            res.status(200).json({ data: rows });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    }

    static async listCaseTypes(conection, req, res) {
        const { user, q = '', page = 1, limit = 15, dep_filter = null, estado = null } = req.body;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const { compania, companies, departamento, compania_nombre } = await USERModel.obtenerDatosUsuario(transaction, user);
            const companiesInfo = await DepartamentModel.getCompaniesByStringIds(transaction, companies);

            const department = await DepartamentModel.getDepartmentsByStringIds(transaction, departamento);
            const parsedPage  = Math.max(1, parseInt(page)  || 1);
            const parsedLimit = Math.min(Math.max(1, parseInt(limit) || 15), 100);
            const depIds = department.map(dep=> dep.id);
            const parsedDep    = dep_filter !== null && dep_filter !== '' ? parseInt(dep_filter)    : null;
            const parsedEstado = estado    !== null && estado    !== '' ? parseInt(estado)    : null;

            const { rows, total } = await CRMModel.ListCaseTypesPaged(
                transaction, compania, companiesInfo, depIds, q, parsedPage, parsedLimit, parsedDep, parsedEstado
            );
            const departments = department.map(d => ({ id: d.id, nombre: d.nombre }));
            const data = rows.map(b => {
                const companyInfo = companiesInfo.find(c => c.ccompania == b.compania);
                return {
                    ...b,
                    edit: depIds.includes(b.departamento),
                    compania_nombre: companyInfo?.xnombre || b.compania || '',
                    departamento: b.nombre_departamento || ''
                };
            });
            await transaction.commit();
            res.status(200).json({ data, total, page: parsedPage, limit: parsedLimit, departments });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error(error);
            res.status(400).json({ error: error.message });
        }
    }

    static async getFilterColleagues(conection, req, res) {
        const UserID = req.session?.userID;
        const pool = await sql.connect(conection);
        try {
            const colleagues = await CRMModel.getFilterColleagues(pool, UserID);
            res.status(200).json({ result: 1, users: colleagues });
        } catch (error) {
            res.status(500).json({ result: 0, error: error.message });
        }
    }
    
}