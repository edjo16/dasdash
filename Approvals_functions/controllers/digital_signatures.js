import sql from 'mssql';
import { PDFDocument } from 'pdf-lib';
import { readFile, mkdir } from 'fs/promises';
import { existsSync, createReadStream, statSync } from 'fs';
import path from 'path';
import {
    applyWritesToPdfDocument,
    getClientIp,
    hashBuffer,
    isFileLockedCode,
    isFileLockedError,
    normalizeOriginalFilename,
    writeFileSafe,
} from '../services/pdf-text-writer.js';
import DigitalSignaturesModel from '../models/digital_signatures.js';
import ApprovalFunctionsModel from '../models/approval_functions.js';
import ApprovalModel from '../../APPROVALS/model/approvals.js';
import DashboardController from '../../USERS/controllers/Dashboard.js';
import USERModel from '../../USERS/model/USER.js';
import Rules from '../../USERS/rule/DevTeam.js';

function resolveFilePath(flow, log, archivoProcesso) {
    const server        = flow?.server ?? null;
    const location      = (flow?.location ?? '').replace(/^[/\\]+|[/\\]+$/g, '');
    const referenceType = flow?.reference_type ?? 0;
    const RowID         = log.id;
    const sir_reference = log.sir_reference ? log.sir_reference.trim().split(' ')[0] : '';
    const s = (n) => (process.env[`server_${n}`] || '').replace(/^[/\\]+|[/\\]+$/g, '');
    const join = (...parts) => parts.filter(Boolean).join('/');

    if (server === 1) return `//${s(1)}/${join(location, String(RowID))}`;
    if (server === 2) return `//${s(2)}/${join(location, String(RowID))}`;
    if (server === 3 || server === 4) {
        if (referenceType === 1) {
            if(server === 3) {
                const procesoPath = (archivoProcesso || '').replace(/^[/\\]+|[/\\]+$/g, '');
                return `//${s(server)}/${join(location)}/${join(procesoPath.split('-')[0] + '-1' )}`;
            }
            else {
                const prefix = sir_reference ? sir_reference.split('-')[0] + '-1' : String(RowID);
                return `//${s(server)}/${join(location)}/${join(prefix)}`;
            }
        }
        if (referenceType === 2) return `//${s(server)}/${join(location)}/${join(sir_reference)}`;
        if (referenceType === 3) {
            const procesoPath = (archivoProcesso || '').replace(/^[/\\]+|[/\\]+$/g, '');
            return `//${s(server)}/${join(location)}/${join(procesoPath.split('-')[0] + '-1')}`;
        }
        if (referenceType === 4) {
            const procesoPath = (archivoProcesso || '').replace(/^[/\\]+|[/\\]+$/g, '');
            return `//${s(server)}/${join(location)}/${join(procesoPath.split('-')[0])}`;
        }
        const procesoPath = (archivoProcesso || '').replace(/^[/\\]+|[/\\]+$/g, '');
        return `//${s(server)}/${join(location)}/${join(procesoPath)}`;
        }
        else {
        return `//${s(5)}/${join(location, String(RowID))}`;
        }
}


async function resolveFullPath(transaction, RowID, filename) {
    const safeFilename = normalizeOriginalFilename(filename);
    const log = await ApprovalFunctionsModel.getApprovalLog(transaction, RowID);
    const approvalFlow = await ApprovalModel.getApprovalFlow(transaction, log.cflow);
    const archivos = await ApprovalFunctionsModel.getArchivosByLogId(transaction, RowID);
    const archivo = archivos.find(a => a.archivo_nombre === safeFilename)
        || archivos.find(a => normalizeOriginalFilename(a.archivo_nombre) === safeFilename);
    const archivoProcesso = archivo?.proceso || '';
    const basePath = resolveFilePath(approvalFlow, log, archivoProcesso);
    if (!basePath) return null;
    const resolvedFilename = archivo?.archivo_nombre || safeFilename;
    return basePath.replace(/\\/g, '/').replace(/\/+$/, '') + '/' + resolvedFilename;
}

async function resolveVersionContext(transaction, RowID, filename, requestedVersion = 'latest') {
    const originalFilename = normalizeOriginalFilename(filename);
    const versions = await DigitalSignaturesModel.getDocumentVersions(transaction, RowID, originalFilename);

    const requested = String(requestedVersion || 'latest').toLowerCase();

    let fullPath = null;
    let selectedFilename = originalFilename;
    let currentVersion = versions.length > 0 ? Math.max(...versions.map(v => Number(v.version))) : 0;

    const isLatest = requested === 'latest';
    if (isLatest) {
        // Latest always resolves to the original file path (which is overwritten with each new version)
        fullPath = await resolveFullPath(transaction, RowID, originalFilename);
    } else {
        // Specific version requested - find its version record and use its file_path
        const numericVersion = Number(requested);
        if (!Number.isNaN(numericVersion)) {
            const selectedVersion = versions.find(v => Number(v.version) === numericVersion) || null;
            if (selectedVersion?.file_path && existsSync(selectedVersion.file_path)) {
                fullPath = selectedVersion.file_path;
                selectedFilename = selectedVersion.filename || originalFilename;
                currentVersion = Number(selectedVersion.version);
            }
        }
        // Fallback: if version not found, try original file path
        if (!fullPath) {
            fullPath = await resolveFullPath(transaction, RowID, originalFilename);
        }
    }

    // Fallback if resolveFullPath returns null
    if (!fullPath && versions.length > 0) {
        const firstWithPath = versions.find(v => v.file_path && existsSync(v.file_path));
        if (firstWithPath) {
            fullPath = firstWithPath.file_path;
            selectedFilename = firstWithPath.filename || originalFilename;
        }
    }

    return {
        originalFilename,
        selectedFilename,
        fullPath,
        currentVersion,
        versions,
    };
}

export default class DigitalSignaturesController {

    static async getPdfInfo(conection, req, res) {
        const RowID    = Number(req.query.RowID);
        const filename = req.query.filename || '';
        const version  = req.query.version || 'latest';

        if (!RowID || !filename || /[/\\]/.test(filename) || filename === '.' || filename === '..') {
            return res.status(400).send({ error: 'Invalid parameters' });
        }

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const usuario = await USERModel.obtenerDatosUsuario(transaction, req.session?.userID);
            const UserID = req.session?.userID;
            const devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);
            const context = await resolveVersionContext(transaction, RowID, filename, version);
            const fullPath = context.fullPath;
            if (!fullPath || !existsSync(fullPath)) {
                await transaction.commit();
                return res.status(404).send(devteam
                    ? { error: 'File not found', ruta: fullPath }
                    : { error: 'File not found' }
                );
            }

            let pdfBytes;
            try {
                pdfBytes = await readFile(fullPath);
            } catch (readErr) {
                if (isFileLockedError(readErr)) {
                    try { await transaction.rollback(); } catch (_) {}
                    return res.status(409).send({ error: 'file_locked', message: 'The file is currently open by another user. Please try again later.' });
                }
                throw readErr;
            }
            const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
            const pageCount = pdfDoc.getPageCount();
            const pages = [];
            for (let i = 0; i < pageCount; i++) {
                const page = pdfDoc.getPage(i);
                const { width, height } = page.getSize();
                pages.push({ pageNumber: i + 1, width, height });
            }

            const docHash = hashBuffer(pdfBytes);
            const signatures = await DigitalSignaturesModel.getSignaturesByApproval(transaction, RowID, context.originalFilename);
            const annotations = await DigitalSignaturesModel.getAnnotationsByApproval(
                transaction,
                RowID,
                context.originalFilename,
                context.currentVersion,
            );

            await DigitalSignaturesModel.insertAuditLog(transaction, {
                approval_id: RowID, filename: context.originalFilename,
                action: 'document_viewed',
                user_id: req.session?.userID || 'unknown',
                user_name: usuario.UserName || 'unknown',
                ip_address: getClientIp(req),
                document_hash: docHash,
                details: null,
            });

            await transaction.commit();
            res.send({
                result: 1,
                is_devteam: !!devteam,
                pageCount, pages, docHash,
                currentVersion: context.currentVersion,
                selectedFilename: context.selectedFilename,
                versions: context.versions.map(v => ({
                    version: v.version,
                    filename: v.filename,
                    version_type: v.version_type,
                    created_at: v.created_at,
                })),
                signatures: signatures.map(s => ({
                    id: s.id,
                    signer_name: s.signer_name,
                    signer_user_id: s.signer_user_id,
                    page_number: s.page_number,
                    position_x: s.position_x,
                    position_y: s.position_y,
                    sig_width: s.sig_width,
                    sig_height: s.sig_height,
                    signed_at: s.signed_at,
                    document_hash: s.document_hash,
                })),
                annotations: annotations.map(a => ({
                    id: a.id,
                    annotation_type: a.annotation_type,
                    page_number: a.page_number,
                    position_x: a.position_x,
                    position_y: a.position_y,
                    box_width: a.box_width,
                    box_height: a.box_height,
                    annotation_text: a.annotation_text,
                    source_version: a.source_version,
                    created_at: a.created_at,
                    created_by: a.created_by,
                    updated_at: a.updated_at,
                    updated_by: a.updated_by,
                })),
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('getPdfInfo error:', error);
            if (!res.headersSent) res.status(500).send({ error: error.message });
        }
    }

    static async signDocument(conection, req, res) {
        const { RowID, filename, signatureData, positionX, positionY, pageNumber, sigWidth, sigHeight } = req.body;
        const writes = Array.isArray(req.body.writes) ? req.body.writes : [];
        const userId = req.session?.userID;

        if (!RowID || !filename || !signatureData || !userId) {
            return res.status(400).send({ error: 'Missing required fields' });
        }
        if (/[/\\]/.test(filename) || filename === '.' || filename === '..') {
            return res.status(400).send({ error: 'Invalid filename' });
        }

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const usuario = await USERModel.obtenerDatosUsuario(transaction, userId);

            // Business rule: always sign the latest available version.
            const context = await resolveVersionContext(transaction, Number(RowID), filename, 'latest');
            const fullPath = context.fullPath;
            if (!fullPath || !existsSync(fullPath)) {
                await transaction.commit();
                return res.status(404).send({ error: 'File not found' });
            }

            let originalBytes;
            try {
                originalBytes = await readFile(fullPath);
            } catch (readErr) {
                if (isFileLockedError(readErr)) {
                    try { await transaction.rollback(); } catch (_) {}
                    return res.status(409).send({ error: 'file_locked', message: 'The file is currently open by another user. Please try again later.' });
                }
                throw readErr;
            }
            const originalHash = hashBuffer(originalBytes);

            const pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
            const appliedWrites = await applyWritesToPdfDocument(pdfDoc, writes);
            const page = pdfDoc.getPage((pageNumber || 1) - 1);

            const sigBase64 = signatureData.replace(/^data:image\/\w+;base64,/, '');
            const sigBytes = Buffer.from(sigBase64, 'base64');
            const sigImage = signatureData.includes('image/png')
                ? await pdfDoc.embedPng(sigBytes)
                : await pdfDoc.embedJpg(sigBytes);

            const pX = positionX || 50;
            const pY = positionY || 50;
            const sW = sigWidth  || 200;
            const sH = sigHeight || 80;

            page.drawImage(sigImage, {
                x: pX,
                y: pY,
                width: sW,
                height: sH,
            });

            const signedPdfBytes = await pdfDoc.save();
            const signedHash = hashBuffer(Buffer.from(signedPdfBytes));

            const versions = context.versions;

            const dir = path.dirname(fullPath);
            const ext = path.extname(context.originalFilename);
            const base = path.basename(context.originalFilename, ext);

            if (versions.length === 0) {
                // Save a copy of the original unsigned bytes before overwriting
                const v0Path = path.join(dir, `${base}_v0_original${ext}`);
                await mkdir(dir, { recursive: true });
                await writeFileSafe(v0Path, originalBytes);
                await DigitalSignaturesModel.insertDocumentVersion(transaction, {
                    approval_id: RowID, filename: context.originalFilename,
                    version: 0, version_type: 'original',
                    file_hash: originalHash,
                    file_path: v0Path,
                    created_by: userId,
                });
            }

            const newVersion = versions.length > 0
                ? Math.max(...versions.map(v => Number(v.version))) + 1
                : 1;

            const signedFilename = `${base}_signed_v${newVersion}${ext}`;
            const signedPath = path.join(dir, signedFilename);

            await mkdir(dir, { recursive: true });
            await writeFileSafe(signedPath, signedPdfBytes);

            // Overwrite the original file so it always has the latest version
            await writeFileSafe(fullPath, signedPdfBytes);

            await DigitalSignaturesModel.insertDocumentVersion(transaction, {
                approval_id: RowID, filename: signedFilename,
                version: newVersion, version_type: 'signed',
                file_hash: signedHash,
                file_path: signedPath,
                created_by: userId,
            });

            const sigId = await DigitalSignaturesModel.insertSignature(transaction, {
                approval_id: RowID,
                filename: context.originalFilename,
                signer_user_id: userId,
                signer_name: usuario.UserName,
                signature_data: signatureData,
                position_x: pX,
                position_y: pY,
                page_number: pageNumber || 1,
                sig_width: sW,
                sig_height: sH,
                document_hash: originalHash,
                signed_hash: signedHash,
                ip_address: getClientIp(req),
                user_agent: (req.headers['user-agent'] || '').substring(0, 500),
            });

            await DigitalSignaturesModel.insertAuditLog(transaction, {
                approval_id: RowID, filename: context.originalFilename,
                action: 'document_signed',
                user_id: userId, 
                user_name: usuario.UserName,
                ip_address: getClientIp(req),
                document_hash: signedHash,
                details: JSON.stringify({
                    signature_id: sigId,
                    source_version: context.currentVersion,
                    page: pageNumber || 1,
                    position: { x: pX, y: pY, w: sW, h: sH },
                    writes_applied: appliedWrites.length,
                    writes: appliedWrites,
                    original_hash: originalHash,
                    signed_filename: signedFilename,
                }),
            });

            await transaction.commit();
            res.send({
                result: 1,
                signature_id: sigId,
                base_filename: context.originalFilename,
                signed_filename: signedFilename,
                signed_hash: signedHash,
                writes_applied: appliedWrites.length,
                version: newVersion,
            });

        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            if (isFileLockedCode(error.code)) {
                return res.status(409).send({ error: 'file_locked', message: 'The file is currently open by another user. Please try again later.' });
            }
            console.error('signDocument error:', error);
            req.body.UsuarioID = req.session?.userID;
            req.error = error.message;
            await DashboardController.createErrorLog(conection, req, res);
        }
    }

    static async saveUserSignature(conection, req, res) {
        const { signatureData, label } = req.body;
        const userId = req.session?.userID;

        if (!userId || !signatureData) {
            return res.status(400).send({ error: 'Missing required fields' });
        }

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const id = await DigitalSignaturesModel.saveUserSignature(transaction, userId, signatureData, label);
            await transaction.commit();
            res.send({ result: 1, id });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('saveUserSignature error:', error);
            res.status(500).send({ error: error.message });
        }
    }

    static async getUserSignatures(conection, req, res) {
        const userId = req.session?.userID;
        if (!userId) return res.status(401).send({ error: 'Not authenticated' });

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const signatures = await DigitalSignaturesModel.getUserSavedSignatures(transaction, userId);
            const defaultSig = await DigitalSignaturesModel.getUserDefaultSignature(transaction, userId);
            await transaction.commit();
            res.send({
                result: 1,
                signatures,
                default_signature_data: defaultSig?.signature_data || null,
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).send({ error: error.message });
        }
    }

    static async deleteUserSignature(conection, req, res) {
        const userId = req.session?.userID;
        const sigId = Number(req.body.id);
        if (!userId || !sigId) return res.status(400).send({ error: 'Missing fields' });

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const deletion = await DigitalSignaturesModel.deleteUserSignature(transaction, sigId, userId);
            if (!deletion || Number(deletion.deleted) === 0) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(404).send({ error: 'Signature not found for this user' });
            }
            await transaction.commit();
            res.send({
                result: 1,
                deleted: Number(deletion.deleted) || 0,
                default_reassigned: !!deletion.defaultReassigned,
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('deleteUserSignature error:', error);
            res.status(500).send({ error: error.message });
        }
    }

    static async saveAnnotations(conection, req, res) {
        const RowID = Number(req.body.RowID);
        const filename = req.body.filename || '';
        const annotations = Array.isArray(req.body.annotations) ? req.body.annotations : null;
        const requestedVersion = req.body.version || 'latest';
        const userId = req.session?.userID;

        if (!userId) return res.status(401).send({ error: 'Not authenticated' });
        if (!RowID || !filename || annotations === null) {
            return res.status(400).send({ error: 'Missing required fields' });
        }
        if (/[/\\]/.test(filename) || filename === '.' || filename === '..') {
            return res.status(400).send({ error: 'Invalid filename' });
        }
        if (String(requestedVersion || 'latest').toLowerCase() !== 'latest') {
            return res.status(400).send({ error: 'Annotations can only be edited on Latest version' });
        }

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const usuario = await USERModel.obtenerDatosUsuario(transaction, userId);
            const context = await resolveVersionContext(transaction, RowID, filename, 'latest');
            if (!context.fullPath || !existsSync(context.fullPath)) {
                await transaction.commit();
                return res.status(404).send({ error: 'File not found' });
            }

            const saved = await DigitalSignaturesModel.saveAnnotationsBatch(transaction, {
                approval_id: RowID,
                filename: context.originalFilename,
                current_version: context.currentVersion,
                user_id: userId,
                user_name: usuario?.UserName || userId,
                ip_address: getClientIp(req),
                annotations,
            });

            await transaction.commit();
            res.send({
                result: 1,
                annotations: saved.map(a => ({
                    id: a.id,
                    annotation_type: a.annotation_type,
                    page_number: a.page_number,
                    position_x: a.position_x,
                    position_y: a.position_y,
                    box_width: a.box_width,
                    box_height: a.box_height,
                    annotation_text: a.annotation_text,
                    source_version: a.source_version,
                    created_at: a.created_at,
                    created_by: a.created_by,
                    updated_at: a.updated_at,
                    updated_by: a.updated_by,
                })),
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('saveAnnotations error:', error);
            res.status(500).send({ error: error.message });
        }
    }

    static async applyTextWrites(conection, req, res) {
        const RowID = Number(req.body.RowID);
        const filename = req.body.filename || '';
        const writes = Array.isArray(req.body.writes) ? req.body.writes : null;
        const requestedVersion = req.body.version || 'latest';
        const userId = req.session?.userID;

        if (!userId) return res.status(401).send({ error: 'Not authenticated' });
        if (!RowID || !filename || writes === null || writes.length === 0) {
            return res.status(400).send({ error: 'Missing required fields' });
        }
        if (/[/\\]/.test(filename) || filename === '.' || filename === '..') {
            return res.status(400).send({ error: 'Invalid filename' });
        }
        if (String(requestedVersion || 'latest').toLowerCase() !== 'latest') {
            return res.status(400).send({ error: 'Text can only be applied on Latest version' });
        }

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const usuario = await USERModel.obtenerDatosUsuario(transaction, userId);
            const context = await resolveVersionContext(transaction, RowID, filename, 'latest');
            const fullPath = context.fullPath;
            if (!fullPath || !existsSync(fullPath)) {
                await transaction.commit();
                return res.status(404).send({ error: 'File not found' });
            }

            let originalBytes;
            try {
                originalBytes = await readFile(fullPath);
            } catch (readErr) {
                if (isFileLockedError(readErr)) {
                    try { await transaction.rollback(); } catch (_) {}
                    return res.status(409).send({ error: 'file_locked', message: 'The file is currently open by another user. Please try again later.' });
                }
                throw readErr;
            }
            const originalHash = hashBuffer(originalBytes);

            const pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
            const appliedWrites = await applyWritesToPdfDocument(pdfDoc, writes);

            if (appliedWrites.length === 0) {
                await transaction.commit();
                return res.status(400).send({ error: 'No valid text to apply' });
            }

            const editedPdfBytes = await pdfDoc.save();
            const editedHash = hashBuffer(Buffer.from(editedPdfBytes));

            const versions = context.versions;

            const dir = path.dirname(fullPath);
            const ext = path.extname(context.originalFilename);
            const base = path.basename(context.originalFilename, ext);

            if (versions.length === 0) {
                // Save a copy of the original unsigned bytes before overwriting
                const v0Path = path.join(dir, `${base}_v0_original${ext}`);
                await mkdir(dir, { recursive: true });
                await writeFileSafe(v0Path, originalBytes);
                await DigitalSignaturesModel.insertDocumentVersion(transaction, {
                    approval_id: RowID,
                    filename: context.originalFilename,
                    version: 0,
                    version_type: 'original',
                    file_hash: originalHash,
                    file_path: v0Path,
                    created_by: userId,
                });
            }

            const newVersion = versions.length > 0
                ? Math.max(...versions.map(v => Number(v.version))) + 1
                : 1;
            const signedFilename = `${base}_signed_v${newVersion}${ext}`;
            const signedPath = path.join(dir, signedFilename);

            await mkdir(dir, { recursive: true });
            await writeFileSafe(signedPath, editedPdfBytes);

            // Overwrite the original file so it always has the latest version
            await writeFileSafe(fullPath, editedPdfBytes);

            await DigitalSignaturesModel.insertDocumentVersion(transaction, {
                approval_id: RowID,
                filename: signedFilename,
                version: newVersion,
                version_type: 'signed',
                file_hash: editedHash,
                file_path: signedPath,
                created_by: userId,
            });

            await DigitalSignaturesModel.insertAuditLog(transaction, {
                approval_id: RowID,
                filename: context.originalFilename,
                action: 'document_signed',
                user_id: userId,
                user_name: usuario?.UserName || userId,
                ip_address: getClientIp(req),
                document_hash: editedHash,
                details: JSON.stringify({
                    operation: 'text_write_batch',
                    source_version: context.currentVersion,
                    writes_applied: appliedWrites.length,
                    writes: appliedWrites,
                    original_hash: originalHash,
                    output_filename: signedFilename,
                }),
            });

            await transaction.commit();
            res.send({
                result: 1,
                version: newVersion,
                signed_filename: signedFilename,
                signed_hash: editedHash,
                writes_applied: appliedWrites.length,
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            if (isFileLockedCode(error.code)) {
                return res.status(409).send({ error: 'file_locked', message: 'The file is currently open by another user. Please try again later.' });
            }
            console.error('applyTextWrites error:', error);
            res.status(500).send({ error: error.message });
        }
    }

    static async verifyDocument(conection, req, res) {
        const RowID    = Number(req.body.RowID);
        const filename = req.body.filename || '';
        const version  = req.body.version || 'latest';
        const userId   = req.session?.userID;

        if (!RowID || !filename) return res.status(400).send({ error: 'Missing fields' });
        if (/[/\\]/.test(filename) || filename === '.' || filename === '..') {
            return res.status(400).send({ error: 'Invalid filename' });
        }

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const usuario = await USERModel.obtenerDatosUsuario(transaction, userId);
            const context = await resolveVersionContext(transaction, RowID, filename, version);
            const fullPath = context.fullPath;
            if (!fullPath || !existsSync(fullPath)) {
                await transaction.commit();
                return res.status(404).send({ error: 'File not found' });
            }

            let fileBytes;
            try {
                fileBytes = await readFile(fullPath);
            } catch (readErr) {
                if (isFileLockedError(readErr)) {
                    try { await transaction.rollback(); } catch (_) {}
                    return res.status(409).send({ error: 'file_locked', message: 'The file is currently open by another user. Please try again later.' });
                }
                throw readErr;
            }
            const currentHash = hashBuffer(fileBytes);

            const versions = context.versions;
            const signatures = await DigitalSignaturesModel.getSignaturesByApproval(transaction, RowID, context.originalFilename);

            let integrityOk = true;
            let matchedVersion = null;
            for (const v of versions) {
                if (v.file_hash === currentHash) {
                    matchedVersion = v;
                    break;
                }
            }
            if (versions.length > 0 && !matchedVersion) {
                integrityOk = false;
            }

            await DigitalSignaturesModel.insertAuditLog(transaction, {
                approval_id: RowID, filename: context.originalFilename,
                action: 'integrity_verified',
                user_id: userId || 'system',
                user_name: usuario.UserName || 'system',
                ip_address: getClientIp(req),
                document_hash: currentHash,
                details: JSON.stringify({
                    integrity_ok: integrityOk,
                    checked_version: context.currentVersion,
                    matched_version: matchedVersion?.version,
                }),
            });

            await transaction.commit();
            res.send({
                result: 1,
                integrity_ok: integrityOk,
                current_hash: currentHash,
                current_version: context.currentVersion,
                selected_filename: context.selectedFilename,
                matched_version: matchedVersion,
                total_versions: versions.length,
                total_signatures: signatures.length,
                signatures: signatures.map(s => ({
                    id: s.id,
                    signer_name: s.signer_name,
                    signed_at: s.signed_at,
                    document_hash: s.document_hash,
                })),
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('verifyDocument error:', error);
            res.status(500).send({ error: error.message });
        }
    }

    static async getAuditTrail(conection, req, res) {
        const RowID    = Number(req.query.RowID);
        const filename = req.query.filename || '';

        if (!RowID) return res.status(400).send({ error: 'Missing RowID' });

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const logs = filename
                ? await DigitalSignaturesModel.getAuditLog(transaction, RowID, filename)
                : await DigitalSignaturesModel.getAuditLogByApproval(transaction, RowID);
            await transaction.commit();
            res.send({ result: 1, logs });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).send({ error: error.message });
        }
    }

    static async getDocumentVersions(conection, req, res) {
        const RowID    = Number(req.query.RowID);
        const filename = req.query.filename || '';

        if (!RowID || !filename) return res.status(400).send({ error: 'Missing fields' });

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const versions = await DigitalSignaturesModel.getDocumentVersions(transaction, RowID, filename);
            await transaction.commit();
            res.send({
                result: 1,
                versions,
                latestVersion: versions.length > 0 ? versions[0] : null,
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).send({ error: error.message });
        }
    }

    static async serveSignedFile(conection, req, res) {
        const RowID    = Number(req.query.RowID);
        const filename = req.query.filename || '';
        const version  = req.query.version || 'latest';
        const forceDownload = req.query.dl === '1';
        if (!RowID || !filename || /[/\\]/.test(filename) || filename === '.' || filename === '..') {
            return res.status(400).send({ error: 'Invalid parameters' });
        }

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const devteam = await Rules.validateTeam(req.session?.iddevteam, req.session?.userID);
            const context = await resolveVersionContext(transaction, RowID, filename, version);
            const fullPath = context.fullPath;
            await transaction.commit();

            if (!fullPath || !existsSync(fullPath)) {
                return res.status(404).send(devteam
                    ? { error: 'File not found', ruta: fullPath }
                    : { error: 'File not found' }
                );
            }

            const stat = statSync(fullPath);
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Type', 'application/pdf');
            const outFilename = encodeURIComponent(context.selectedFilename || filename);
            if (forceDownload) {
                res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
            } else {
                res.setHeader('Content-Disposition', `inline; filename="${outFilename}"`);
            }
            const stream = createReadStream(fullPath);
            stream.on('error', (streamErr) => {
                if (!res.headersSent) {
                    if (isFileLockedError(streamErr)) {
                        res.status(409).send({ error: 'file_locked', message: 'The file is currently open by another user. Please try again later.' });
                    } else {
                        res.status(500).send({ error: 'Error reading file' });
                    }
                }
            });
            stream.pipe(res);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            if (!res.headersSent) res.status(500).send({ error: error.message });
        }
    }

    static async getSignatureCertificate(conection, req, res) {
        const sigId = Number(req.query.id);
        if (!sigId) return res.status(400).send({ error: 'Missing signature id' });

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();

            const request = new sql.Request(transaction);
            request.input('id', sql.Int, sigId);
            const result = await request.query('SELECT * FROM approval_signatures WHERE id = @id');
            const sig = result.recordset[0];

            if (!sig) {
                await transaction.commit();
                return res.status(404).send({ error: 'Signature not found' });
            }

            const auditLogs = await DigitalSignaturesModel.getAuditLog(transaction, sig.approval_id, sig.filename);
            await transaction.commit();

            res.send({
                result: 1,
                certificate: {
                    signature_id: sig.id,
                    approval_id: sig.approval_id,
                    filename: sig.filename,
                    signer: {
                        user_id: sig.signer_user_id,
                        name: sig.signer_name,
                    },
                    position: {
                        page: sig.page_number,
                        x: sig.position_x,
                        y: sig.position_y,
                        width: sig.sig_width,
                        height: sig.sig_height,
                    },
                    security: {
                        document_hash_before: sig.document_hash,
                        document_hash_after: sig.signed_hash,
                        ip_address: sig.ip_address,
                        user_agent: sig.user_agent,
                    },
                    signed_at: sig.signed_at,
                    status: sig.status,
                    audit_trail: auditLogs,
                },
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).send({ error: error.message });
        }
    }
}