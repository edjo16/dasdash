import sql from 'mssql';
import { appendFile, readFile, mkdir, copyFile, read, createReadStream, existsSync, statSync, readFileSync } from 'fs';
import { request as _request } from 'https';
import { Get_Actuante_X_Accion, Get_Sig_Estado_X_Accion } from '../../fuctions-approvals.js';
import { isTheLastIntegrant } from '../../APPROVALS/functions.js';
import ApprovalFunctionsModel from '../models/approval_functions.js';
import { getFormatedDate } from '../../Middleware/validateUserId.js';
import ApprovalModel from '../../APPROVALS/model/approvals.js';
import DashboardModel from '../../USERS/model/Dasboard.js';
import { nombres_latinos } from '../../fuctions-approvals.js';
import pkg from 'lodash';
import path from 'path';
import { InsertFileApproval, asignacion_integrates } from '../../functions.js';
import {readFileAndSign} from '../../HR/PersonnelRequisition/readFileAndSign.js';
import { azurePost } from '../functions.js';    
import DashboardController from '../../USERS/controllers/Dashboard.js';
import EventsModel from '../../mercadeo/model/events.js';
import ChangesControlModel from '../../IT/model/ChangesControl.js';
import DigitalSignaturesModel from '../models/digital_signatures.js';
import Rules from '../../USERS/rule/DevTeam.js';
import { resolveApprovalFileFullPath } from '../shared/approval-file-routing.js';
import MsgReaderModule from '@kenjiuno/msgreader';

const MsgReader = MsgReaderModule.default || MsgReaderModule;

// ─────────────────────────────────────────────────────────────────────────────
// File-routing helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the icon path for a given filename based on its extension.
 * @param {string} filename
 * @returns {string} public icon path
 */
function getFileIcon(filename) {
    if (/\.(png|jpg|jpeg)$/i.test(filename)) return '/icons/png.png';
    if (/\.(docx?)$/i.test(filename))        return '/icons/word.png';
    if (/\.(xlsx|xlsm)$/i.test(filename))    return '/icons/excel.png';
    if (/\.pdf$/i.test(filename))            return '/icons/pdf.png';
    if (/\.msg$/i.test(filename))            return '/img/envelope-regular.svg';
    return '/icons/default.png';
}

/** Returns true when the filename is an image (png / jpg / jpeg). */
function isImageFile(filename) {
    return /\.(png|jpg|jpeg)$/i.test(filename);
}

/** Returns true when the filename is a PDF. */
function isPdfFile(filename) {
    return /\.pdf$/i.test(filename);
}

/**
 * Returns the MIME type for a given filename.
 */
function getMimeType(filename) {
    if (/\.(png)$/i.test(filename))        return 'image/png';
    if (/\.(jpg|jpeg)$/i.test(filename))   return 'image/jpeg';
    if (/\.pdf$/i.test(filename))          return 'application/pdf';
    if (/\.msg$/i.test(filename))          return 'application/vnd.ms-outlook';
    if (/\.(docx?)$/i.test(filename))      return 'application/msword';
    if (/\.(xlsx|xlsm)$/i.test(filename))  return 'application/vnd.ms-excel';
    return 'application/octet-stream';
}

function isSafeFilename(filename) {
    const value = String(filename || '').trim();
    return !!value && !/[/\\]/.test(value);
}

function getApprovalFileExtension(filename) {
    const value = String(filename || '').toLowerCase();
    const dot = value.lastIndexOf('.');
    return dot >= 0 ? value.slice(dot) : '';
}


/**
 * Resolves claims-specific key and label from archivo.proceso when
 * the flow uses SIR reference-based sub-paths (used for section headers).
 * Returns { claimsKey, claimsLabel } or nulls if not applicable.
 */
function resolveClaimsLabel(archivo, flowOrigen) {
    if (!flowOrigen) return { claimsKey: null, claimsLabel: null };
    const raw = archivo.proceso || '';
    if (flowOrigen === 'claims') {
        const parts = raw.split(',');
        if (parts.length < 2) return { claimsKey: null, claimsLabel: null };
        return {
            claimsKey: parts[0],
            claimsLabel: `<p>Claim: ${parts[0]} | Cover note: ${parts[1]}</p>`,
        };
    }
    if (flowOrigen === 'claims_treaty') {
        let claimNum, coverNote;
        if (raw.includes(',')) {
            const parts = raw.split(',');
            const first = parts[0].trim();
            const aviso = first.split('-');
            claimNum = aviso[0];
            coverNote = aviso.slice(1).join('-');
        } else if (raw.includes('-')) {
            const aviso = raw.split('-');
            claimNum = aviso[0];
            coverNote = aviso.slice(1).join('-');
        }
        if (!claimNum) return { claimsKey: null, claimsLabel: null };
        return {
            claimsKey: raw,
            claimsLabel: `<p>Claim: ${claimNum} | Cover note: ${coverNote}</p>`,
        };
    }
    return { claimsKey: null, claimsLabel: null };
}

export default class ApprovalFunctionsController {

    static async approvalDetalleAccion(conection, req, res) {
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            let { AccionFinal, nombre, RowID, departamento, estado, comentario } = req.body;
            estado = Array.isArray(estado) ? estado[0] : estado
            RowID = Array.isArray(RowID) ? RowID[0] : RowID
            
            const { forEach: _forEach, keysIn } = pkg;
            
            let sir_reference = null;
            let proceso;
            const log = await ApprovalFunctionsModel.getApprovalLog(transaction, RowID);
            if (log.sir_reference) {
                sir_reference = log.sir_reference.split(' ')[0]
            }
            const approvalFlow = await ApprovalModel.getApprovalFlow(transaction, log.cflow)

            const { aprobador, firmante, operador, ejecutor, cflow } = log;
            const isTheLastUser = isTheLastIntegrant(log, nombre);
            const date = getFormatedDate();

            let actuante = Get_Actuante_X_Accion(estado);
            if (actuante == undefined && estado == 'Executed') {
                actuante = 'ejecutor';
            }
            if(cflow == "90" && AccionFinal == "Executed"){
                const logInitial = await ApprovalFunctionsModel.getApprovalLog(transaction, log.id_original);
                const approvalInitial = await ApprovalModel.getApprovalFlow(transaction, logInitial.cflow);

            const newFiles = await ApprovalFunctionsModel.getMultipleFilesForNewLog(transaction, RowID);
                if(newFiles && newFiles.length > 0){
                    for (let archivo of newFiles) {
                        let rutaNew = ApprovalFunctionsModel._getServerPath(approvalFlow.server, approvalFlow.location)
                        let rutaInitial = ApprovalFunctionsModel._getServerPath(approvalInitial.server, approvalInitial.location)

                        let sourcePath = rutaNew+ RowID + "/" + archivo.archivo_nombre;
                        const destPath = rutaInitial+ log.id_original + "/" + archivo.archivo_nombre;

                          try {
                            await ApprovalFunctionsModel.updateLogJournalEntry(transaction, log.id_original, comentario);
                            await azurePost(log.id_original);
                            await new Promise((resolve, reject) => {
                                copyFile(sourcePath, destPath, async (error) => {
                                    if (error) {
                                        return reject(error);
                                    }
                                    try {
                                        let InsertFileApprovalInOriginal = await InsertFileApproval(transaction, log.id_original, "Operations", "Posted Remittance", archivo.archivo_nombre, 3, 89);
                                        if (!InsertFileApprovalInOriginal) {
                                            console.error("Failed to insert file approval for signing file.");
                                        }
                                        resolve();
                                    } catch (error) {
                                        reject(error);
                                    }
                                });
                            });

                            } catch (error) {
                                console.error(error);
                                throw error;
                            }
                        }
                }
            }
            if(cflow == "97" && AccionFinal == "Approved" || AccionFinal == "Rejected"){
                await EventsModel.updateStatus(transaction, log.id, AccionFinal);
            }
            if(cflow == "98"){
                await ChangesControlModel.updateStatus(transaction, log.id, AccionFinal);
            } 
             if(cflow == "67"){
                const {archivo_nombre} = await ApprovalFunctionsModel.getFilesForNewLog(transaction, RowID);
                const fileServer = process.env.DB_SERVER !== "vps-desa01" ? "srv-dc-lombard.lombard.local" : "vps-desa01";
                const ruta = "//"+fileServer+"/Approvals/67/" + RowID + "/" + archivo_nombre;
                const result = await readFileAndSign(RowID, AccionFinal, ruta, nombre, comentario);
                if(result.result == "Success"){
                let newName =  "Personnel Requisition Form - " + AccionFinal + ".pdf";
                await ApprovalFunctionsModel.updateFileNamePersonnelRequisition(transaction, RowID, newName);
                }
             }
            const temp_estado = Get_Sig_Estado_X_Accion(AccionFinal, departamento, estado, aprobador, firmante, operador, ejecutor);
            const sig_estado = temp_estado["estado"];
            const cierre_fecha = isTheLastUser ? `cierre_fecha = '${date}',` : 'cierre_fecha = NULL,';

            // Update Approval Log in database
            await ApprovalFunctionsModel.updateApprovalLog(transaction, RowID, comentario, date, sig_estado, actuante, cierre_fecha);
            appendFile('//srv-dc-lombard.lombard.local/IT - Automatic Tasks/Approvals/Dev/Task/ActiveBot_Pending.txt', `https://flow.microsoft.com/manage/environments/Default-255e7e67-94b4-4b19-bca0-bce66bde2c1e/approvals/received/${RowID}?response=%27${estado}%27¬\r\n`, function (error) {
                if (error) console.error(error);
            });
            if (req.files && req.files.PaymentSupportfiles ) {
                if (req.files.PaymentSupportfiles.name || approvalFlow.xprocesos == "Payment Request Claims FAC" || approvalFlow.xprocesos == "Payment Request Claims Treaty" || approvalFlow.xprocesos == "MGA Payment Request Claims FAC" || approvalFlow.xprocesos == "Claims FAC multiple pagos") {
                 
                let file = req.files.PaymentSupportfiles.length > 1 ? req.files.PaymentSupportfiles[0] : req.files.PaymentSupportfiles;
                let filename = nombres_latinos(file.name);


                if(approvalFlow.xprocesos == "Payment Request Claims FAC" || approvalFlow.xprocesos == "Payment Request Claims Treaty" || approvalFlow.xprocesos == "MGA Payment Request Claims Treaty" ||approvalFlow.xprocesos == "MGA Payment Request Claims FAC" || approvalFlow.xprocesos == "Claims FAC multiple pagos") {
                    let reference = log.sir_reference.toString().replace(/[()]/g, '').split(',');
                    proceso = reference.length > 1 ? reference[reference.length - 1].trim().replace(' ', ',') : log.sir_reference.replace(' ', ',')
                } else{
                    proceso = log.proceso
                }
                if(req.files.PaymentSupportfiles.length > 1){
                    let files = req.files.PaymentSupportfiles;
                    for (let file of files) {
                        let filename = nombres_latinos(file.name);
                        await ApprovalFunctionsModel.insertFileRecord(transaction, RowID, departamento, log, filename, proceso);
                    }
                } else {
                    await ApprovalFunctionsModel.insertFileRecord(transaction, RowID, departamento, log, filename, proceso);
                }
                if (approvalFlow.xprocesos == "Payment Request Claims FAC" || approvalFlow.xprocesos == "Payment Request Claims Treaty" || approvalFlow.xprocesos === 'Payment Request Claims Treaty'||approvalFlow.xprocesos == "MGA Payment Request Claims FAC"  ||approvalFlow.xprocesos == "MGA Payment Request Claims Treaty" || approvalFlow.xprocesos == "Claims FAC multiple pagos") {
                    const supportId = await ApprovalModel.getSupportApprovalFlow(transaction, RowID);
                    const archivos = await ApprovalFunctionsModel.getAllFilesFromApproval(transaction, supportId.id_nuevo);
                    let archivosOld = await ApprovalFunctionsModel.getFilesFromApproval(transaction, RowID);
                    const procesosValidos = ["Payment Request Claims FAC", "MGA Payment Request Claims Treaty", "Payment Request Claims Treaty", "MGA Payment Request Claims FAC","Claims FAC multiple pagos"];
                    archivosOld = procesosValidos.includes(approvalFlow.xprocesos)? archivosOld.map(item => {
                        let parts = item.proceso.split(',');
                        if (parts.length > 0) {
                            let subParts = parts[0].split('-');
                            if (subParts.length > 1) {
                                subParts[1] = '1';
                            }
                            parts[0] = subParts.join('-');
                        }
                        return { ...item, proceso: parts[0] };
                    }) 
                    : archivosOld.map(item => {
                        let parts = item.proceso.split('-')[0];
                        return { ...item, proceso: parts };
                    });

                    const SupportApproval = await ApprovalModel.getLogById(transaction, supportId.id_nuevo);
                    const supportFlow = await ApprovalModel.getApprovalFlow(transaction, SupportApproval.cflow);
                
                    let sir_referenceGroup = log.sir_reference.split(',').map(item => item.trim());

                    sir_referenceGroup = procesosValidos.includes(approvalFlow.xprocesos) ?
                    sir_referenceGroup.map(item => {
                        let [firstPart, secondPart] = item.split(' ');
                        let subParts = firstPart.split('-');
                        if (subParts.length > 1) {
                            subParts[1] = '1';
                        }
                        firstPart = subParts.join('-');
                        secondPart = secondPart.split(' ')[0];
                        return `${firstPart} ${secondPart}`;
                    })
                    :sir_referenceGroup
                    sir_referenceGroup = [...new Set(sir_referenceGroup)];
                    for (let i = 0; i < sir_referenceGroup.length; i++) {
                        let sirCode;
                        if (approvalFlow.xprocesos == "Claims FAC multiple pagos") {
                            sirCode = sir_referenceGroup[i].split(' ')[0];
                        } else if (approvalFlow.xprocesos == "MGA Payment Request Claims Treaty"||approvalFlow.xprocesos == "Payment Request Claims Treaty"){
                            sirCode = sir_referenceGroup[i].split(' ')[0];
                            sirCode = sirCode.split('-')[0]
                        }
                         else {
                            sirCode = sir_referenceGroup[i].split(' ')[0];
                        }

                        const archivesFromThisCode = archivosOld.filter(item => item.proceso.includes(sirCode));
                        const archivesNames = archivesFromThisCode.map(item => item.archivo_nombre);
                        const archivosIncludes = archivos.filter(item => archivesNames.includes(item.archivo_nombre));

                        let approvalFlowPath = ApprovalFunctionsModel._getServerPath(approvalFlow.server, approvalFlow.location);
                        let supportFlowPath = ApprovalFunctionsModel._getServerPath(supportFlow.server, supportFlow.location);
                        if (req.files.PaymentSupportfiles.length > 1) {
                            const fileKeys = keysIn(req.files.PaymentSupportfiles);
                            for (const key of fileKeys) {
                                let file = req.files.PaymentSupportfiles[key];
                                let filename = nombres_latinos(file.name);
                                let fullPath = path.join(approvalFlowPath, sirCode, filename);
                                file.mv(fullPath, function(error) {
                                    if (error) {
                                        console.error("Error moving file:", error);
                                    } else {
                                        console.log("File moved successfully to", fullPath);
                                    }
                                });
                            }

                        } else {
                            let fullPath = path.join(approvalFlowPath, sirCode, filename);
                            file.mv(fullPath, function(error) {
                                if (error) {
                                    console.error("Error moving file:", error);
                                } else {
                                    console.log("File moved successfully to", fullPath);
                                }
                            });
                        }

                        if (archivosIncludes.length >= 1) {
                            for (let e = 0; e < archivosIncludes.length; e++) {
                                let fileName = archivosIncludes[e].archivo_nombre;
                                copyFile(supportFlowPath + supportId.id_nuevo + "/" + fileName, approvalFlowPath + sirCode + "/" + fileName, (error) => {
                                    if (error) {
                                        console.log(error);
                                    }
                                });
                            }
                        } 
                    }
                } else {
                    let approvalFlowPath = ApprovalFunctionsModel._getServerPath(approvalFlow.server, approvalFlow.location);
                    file.mv(approvalFlowPath + RowID + '/' + filename);
                }

                } else {
                 let approvalFlowPath = ApprovalFunctionsModel._getServerPath(approvalFlow.server, approvalFlow.location);
                 const fileKeys = keysIn(req.files.PaymentSupportfiles);
                 for (const key of fileKeys) {
                    let file = req.files.PaymentSupportfiles[key];
                    let filename = nombres_latinos(file.name);
                    file.mv(approvalFlowPath + RowID + '/' + filename);
                    await ApprovalFunctionsModel.insertFileRecord(transaction, RowID, departamento, log, filename, log.proceso);
                 }
                }
            }
            // Update approval_asignado status
            await ApprovalFunctionsModel.updateApprovalAsignado(transaction, RowID, sig_estado);
            
            // Handle external API request
            await azurePost(RowID);

            await transaction.commit();
            res.send({ result: 1, RowID });
            // Send the approval request if necessary
            
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            req.body.UsuarioID = req.body.nombre;
            req.error = error.message;
            await DashboardController.createErrorLog(conection, req, res);
        }
    };

    static async asignarUsuario(conection, req, res) {
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const {  RowID, uasignar, comentario_asignar } = req.body;
            const date = getFormatedDate();
            await ApprovalFunctionsModel.updateLog(transaction, Number(RowID), uasignar, comentario_asignar, date);
            const data = new TextEncoder().encode(JSON.stringify({ id: parseInt(RowID), env: process.env.ENTORNO }));
            const options = {
                hostname: 'prod-178.westus.logic.azure.com',
                port: 443,
                path: '/workflows/7911903a9f74457480056c019f3c023d/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=huCHS2GADwCa3nVA6YG12PdE-A6umsAB18eu2y6F460',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };
    
            const approvalSummit = _request(options, response => {
                response.on('data', d => {
                    process.stdout.write(d);
                });
            });
    
            approvalSummit.on('error', error => {
                console.error(error);
            });
    
            approvalSummit.write(data);
            approvalSummit.end();
    
            await transaction.commit();
            res.send({ result: 1 });
    
        } catch (err) {
            try { await transaction.rollback(); } catch (_) {}
            console.error(err);
            res.send({ result: 0 });
        }
    };

    static async copyFilesApprovals(conection, req, res){
        let RowID = Number(req.body.RowID)
        let OldRowID = Number(req.body.oldRowID)
        let cflow = Number(req.body.cflow)
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
                const logDetails = await ApprovalFunctionsModel.getLogDetails(transaction, OldRowID, RowID);
                const approvalFlowDetails = await ApprovalFunctionsModel.getApprovalFlowDetails(transaction, logDetails[0].cflow, cflow);
                const files = await ApprovalFunctionsModel.getFilesForLog(transaction, OldRowID);
                let Oldcflow = logDetails.find(log => log.id === OldRowID).cflow;
                let newlog = logDetails.find(log => log.id === RowID);
                let ruta = ApprovalFunctionsModel._getServerPath(
                    approvalFlowDetails.find(flow => flow.id === cflow).server,
                    approvalFlowDetails.find(flow => flow.id === cflow).location
                );
                let Oldruta = ApprovalFunctionsModel._getServerPath(
                    approvalFlowDetails.find(flow => flow.id === Oldcflow).server,
                    approvalFlowDetails.find(flow => flow.id === Oldcflow).location
                );
                
                for (let archivo of files) {
                  await ApprovalFunctionsModel.insertFile(
                    transaction,
                    RowID,
                    newlog.departamento,
                    newlog.proceso,
                    archivo.archivo_nombre,
                    Oldcflow === 83 || Oldcflow === 84 || Oldcflow === 100 || Oldcflow === 101 ? archivo.tipo : 0
                  );
          
                  let sourcePath;
                  if (Oldcflow === 83 || Oldcflow === 84 || Oldcflow === 100 || Oldcflow === 101) {
                    let rutaSir = Oldcflow === 84 || Oldcflow === 101? archivo.proceso.split('-')[0] : archivo.proceso.split(',')[0];
                    let parts = rutaSir.split('-');
                    if (parts.length > 1 && Oldcflow !== 84) parts[1] = '1';
                    rutaSir = Oldcflow !== 84 ? parts.join('-') : parts[0];
                    sourcePath = `${Oldruta}${rutaSir}/${archivo.archivo_nombre}`;
                  } else {
                    sourcePath = `${Oldruta}${OldRowID}/${archivo.archivo_nombre}`;
                  }
          
                  const destPath = `${ruta}${RowID}/${archivo.archivo_nombre}`;
                   copyFile(sourcePath, destPath, (err) => {
                    if (err) console.log(err);
                });
                }
                await transaction.commit();
                res.send({ result: 1 });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error in copyFilesApprovals:', error);
            res.send({ result: 0, error: error.message });
        }
    };

    static async postApprovalArchiveslIST(conection, req, res) {
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const RowID = Number(req.body.RowID);

            const archivos = await ApprovalFunctionsModel.getArchivosByLogId(transaction, RowID);

            if (!archivos || archivos.length === 0) {
                await transaction.commit();
                return res.send({ result: 0, files: [] });
            }

            // Get the actual log and its flow (not hardcoded cflow)
            const log         = await ApprovalFunctionsModel.getApprovalLog(transaction, RowID);
            const cflow       = Number(log.cflow);
            const approvalFlow = await ApprovalModel.getApprovalFlow(transaction, log.cflow);

            let subtitulo_firma   = true;
            let subtitulo_soporte = true;
            let temp              = '';
            const files           = [];

            for (const archivo of archivos) {
                // ── Section headers (by file tipo) ────────────────────────
                if (archivo.tipo == 1 && subtitulo_firma) {
                    files.push({ type: 'header', content: 'Documents for Approval & Signature:' });
                    subtitulo_firma = false;
                }
                if (archivo.tipo == 0 && subtitulo_soporte) {
                    files.push({ type: 'header', content: 'Supporting Documents:' });
                    subtitulo_soporte = false;
                }
                if (archivo.tipo == 2 && subtitulo_soporte) {
                    files.push({ type: 'header', content: 'Proof of Payment:' });
                    subtitulo_soporte = false;
                }
                if (archivo.tipo == 3 && subtitulo_soporte) {
                    files.push({ type: 'header', content: 'Journal Entry:' });
                    subtitulo_soporte = false;
                }

                // ── Department-based claims / Claims-Treaty sub-headers ──
                if ((archivo.departamento === 'Claims' || archivo.departamento === 'ART') &&
                    [14, 15, 16, 17, 38, 83, 84, 85, 100, 101, 127].includes(cflow)) {
                    const parts = archivo.proceso ? archivo.proceso.split(',') : [];
                    if (parts.length >= 2 && temp !== parts[0] && !subtitulo_soporte) {
                        files.push({ type: 'claims_header', content: `<p>Claim: ${parts[0]} | Cover note: ${parts[1]}</p>` });
                        temp = parts[0];
                    }
                } else if (archivo.departamento === 'Claims-Treaty' && approvalFlow.origen === 'SIR') {
                    const raw = archivo.proceso || '';
                    let claimNum, coverNote, groupKey;
                    if (raw.includes(',')) {
                        const parts = raw.split(',');
                        const first = parts[0].trim();
                        groupKey = first;
                        const aviso = first.split('-');
                        claimNum = aviso[0];
                        coverNote = aviso.slice(1).join('-');
                    } else if (raw.includes('-')) {
                        const aviso = raw.split('-');
                        claimNum = aviso[0];
                        coverNote = aviso.slice(1).join('-');
                        groupKey = raw;
                    }
                    if (claimNum && groupKey && temp !== groupKey && !subtitulo_soporte) {
                        files.push({ type: 'claims_header', content: `<p>Claim: ${claimNum} | Cover note: ${coverNote}</p>` });
                        temp = groupKey;
                    }
                }

                // ── Build file entry ──────────────────────────────────────
                const filename   = archivo.archivo_nombre;
                const icon       = getFileIcon(filename);
                const is_image   = isImageFile(filename);
                const is_pdf     = isPdfFile(filename);
                let latestVersion = 1;
                let latestFilename = filename;

                if (is_pdf) {
                    const versions = await DigitalSignaturesModel.getDocumentVersions(transaction, RowID, filename);
                    if (versions.length > 0) {
                        latestVersion = Number(versions[0].version) || 1;
                        latestFilename = versions[0].filename || filename;
                    }
                }

                const fileUrl = is_pdf
                    ? `/pdf-sign/signed-file?RowID=${RowID}&filename=${encodeURIComponent(filename)}&version=latest`
                    : `/approval-file?RowID=${RowID}&filename=${encodeURIComponent(filename)}`;

                const downloadUrl = is_pdf
                    ? `/pdf-sign/signed-file?RowID=${RowID}&filename=${encodeURIComponent(filename)}&version=latest&dl=1`
                    : `/approval-file?RowID=${RowID}&filename=${encodeURIComponent(filename)}&dl=1`;

                files.push({
                    type: 'file',
                    filename,
                    latest_filename: latestFilename,
                    latest_version: latestVersion,
                    has_versions: latestVersion > 1,
                    icon,
                    is_image,
                    is_pdf,
                    file_url: fileUrl,
                    download_url: downloadUrl,
                });
            }

            await transaction.commit();
            res.send({ result: 1, files });

        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.log(error);
        }
    }

    /**
     * Streams a file from its UNC path to the client.
     * Resolves the path using the approval flow's server/location config.
     * Query params: RowID (int), filename (string), dl=1 (optional, forces download).
     */
    static async serveApprovalFile(conection, req, res) {
        const RowID    = Number(req.query.RowID);
        const filename = req.query.filename || '';
        const forceDownload = req.query.dl === '1';

        // Basic validation – prevent path traversal
        if (!RowID || !isSafeFilename(filename)) {
            return res.status(400).send({ error: 'Invalid parameters' });
        }

        try {
            const fileContext = await resolveApprovalFileFullPath(conection, RowID, filename);
            if (!fileContext.ok) {
                return res.status(fileContext.status).send({ error: fileContext.error });
            }

            const fullPath = fileContext.fullPath;

            if (!existsSync(fullPath)) {
                return res.status(404).send({ error: 'File not found' });
            }

            const stat     = statSync(fullPath);
            const mimeType = getMimeType(filename);

            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Type', mimeType);
            if (forceDownload) {
                res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            } else {
                res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
            }

            const stream = createReadStream(fullPath);
            stream.on('error', (err) => {
                console.error('Stream error:', err);
                if (!res.headersSent) res.status(500).send({ error: 'Error reading file' });
            });
            stream.pipe(res);

        } catch (error) {
            console.error('serveApprovalFile error:', error);
            if (!res.headersSent) res.status(500).send({ error: error.message });
        }
    }

    static async getApprovalMsgContent(conection, req, res) {
        const RowID = Number(req.query.RowID);
        const filename = String(req.query.filename || '').trim();

        if (!RowID || !isSafeFilename(filename)) {
            return res.status(400).json({ result: 0, error: 'Invalid parameters' });
        }
        if (getApprovalFileExtension(filename) !== '.msg') {
            return res.status(400).json({ result: 0, error: 'Only .msg files are supported' });
        }

        try {
            const fileContext = await resolveApprovalFileFullPath(conection, RowID, filename);
            if (!fileContext.ok) {
                return res.status(fileContext.status).json({ result: 0, error: fileContext.error });
            }

            const fullPath = fileContext.fullPath;
            if (!existsSync(fullPath)) {
                const UserID = req.session?.userID || req.query?.userID || '';
                const devteam = UserID ? await Rules.validateTeam(req.session?.iddevteam, UserID) : false;
                return res.status(404).json(devteam
                    ? { result: 0, error: `File not found ruta: ${fullPath}`}
                    : { result: 0, error: 'File not found' }
                );
            }

            const buffer = readFileSync(fullPath);
            const reader = new MsgReader(buffer);
            const data = reader.getFileData();

            const formatRecipients = (list, type) => {
                if (!Array.isArray(list)) return [];
                return list
                    .filter((r) => !type || r.recipType === type)
                    .map((r) => ({
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
            console.error('getApprovalMsgContent error:', error);
            return res.status(500).json({ result: 0, error: error.message });
        }
    }

    static async getApprovalMsgAttachment(conection, req, res) {
        const RowID = Number(req.query.RowID);
        const filename = String(req.query.filename || '').trim();
        const attIndex = Number(req.query.att_index);

        if (!RowID || !isSafeFilename(filename) || !Number.isInteger(attIndex) || attIndex < 0) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }
        if (getApprovalFileExtension(filename) !== '.msg') {
            return res.status(400).json({ error: 'Only .msg files are supported' });
        }

        try {
            const fileContext = await resolveApprovalFileFullPath(conection, RowID, filename);
            if (!fileContext.ok) {
                return res.status(fileContext.status).json({ error: fileContext.error });
            }

            const fullPath = fileContext.fullPath;
            if (!existsSync(fullPath)) {
                return res.status(404).json({ error: 'File not found' });
            }

            const buffer = readFileSync(fullPath);
            const reader = new MsgReader(buffer);
            const data = reader.getFileData();

            if (!data.attachments || !data.attachments[attIndex]) {
                return res.status(404).json({ error: 'Attachment not found' });
            }

            const attData = reader.getAttachment(attIndex);
            const attName = data.attachments[attIndex].fileName ||
                data.attachments[attIndex].fileNameShort ||
                `attachment_${attIndex}`;
            const contentBuffer = Buffer.from(attData?.content || []);

            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attName)}"`);
            res.setHeader('Content-Length', contentBuffer.length);
            return res.send(contentBuffer);
        } catch (error) {
            console.error('getApprovalMsgAttachment error:', error);
            return res.status(500).json({ error: error.message });
        }
    }

    static async postGetActores(conection, req, res) {
        const id_flow = Number(req.body.id_flow);
        const id_dep = Number(req.body.id_dep);
        const username = req.session?.userID || null;
        const banco = req.body.banco;
        const moneda = req.body.moneda;
        const ccompania = req.body.ccompania;
        const monto = req.body.monto;
        const bancosTatiana = ['1', '17', '26', '5', '16', '28'];
        const makeStaticOperator = id_flow == 2;

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            
            // Obtener flujo de aprobación
            const flow_row = await ApprovalFunctionsModel.getApprovalFlowById(transaction, id_flow);
            
            if (!flow_row) {
                await transaction.commit();
                return res.send({ result: 0 });
            }

            const bancos = await ApprovalFunctionsModel.getAllBancos(transaction, banco, ccompania );
            const alldepartamentos = await ApprovalFunctionsModel.getAllDepartamentos(transaction);
            const users = await ApprovalFunctionsModel.getUsersByCompany(transaction, flow_row.ccompania);
            const departamentos = await ApprovalFunctionsModel.getDepartamentoById(transaction, flow_row.cdepartamento);
            let temp = asignacion_integrates(flow_row, users, departamentos, username, id_flow, flow_row.nombre, bancos, alldepartamentos);
            let procesos = temp[0];
            let estados = temp[1];
            
            // Aplicar lógica estática de operador si es necesario
            if (makeStaticOperator) {
                for (let i = 0; i < procesos.length; i++) {
                    const item = procesos[i];
                    const nameStr = Array.isArray(item) ? item.map(o => o.Name).join(';') : (item?.Name || '');
                    if (nameStr.includes("Ericka Castillo") && monto >= 100000) {
                        procesos[i] = Array.isArray(item)
                            ? item.filter(o => o.Name.includes("Ericka Castillo"))
                            : item;
                    } else if (nameStr.includes("Tatiana Del Barrio") && (monto < 100000 || monto == undefined) && bancosTatiana.includes(banco)) {
                        procesos[i] = Array.isArray(item)
                            ? item.filter(o => o.Name.includes("Tatiana Del Barrio"))
                            : item;
                    }
                }
            }
            
            await transaction.commit();
            res.send({ result: 1, procesos, estados, ctipo: flow_row.ctipo_flujo });
            
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            req.body.UsuarioID = req.body.id;
            req.error = error.message;
            await DashboardController.createErrorLog(conection, req, res);
        }
    }    
}