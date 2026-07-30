/* ============================================================
   CRM — Visor de PDF con escritura de comentarios
============================================================ */

import sql from 'mssql';
import path from 'path';
import { readFile, mkdir } from 'fs/promises';
import { createReadStream, existsSync, statSync } from 'fs';
import { PDFDocument } from 'pdf-lib';
import DigitalSignaturesModel from '../../Approvals_functions/models/digital_signatures.js';
import USERModel from '../../USERS/model/USER.js';
import {
    applyWritesToPdfDocument,
    getClientIp,
    hashBuffer,
    isFileLockedCode,
    isFileLockedError,
    normalizeOriginalFilename,
    writeFileSafe,
} from '../../Approvals_functions/services/pdf-text-writer.js';
import { buildCrmUncPath, isSafeFilename, validateCrmReadAccess } from './CRM.js';

const CRM_MODULE = 'crm';
const VERSION_SUFFIX = '_edited_v';
const ORIGINAL_SUFFIX = '_v0_original';

const FILE_LOCKED_RESPONSE = {
    error: 'file_locked',
    message: 'The file is currently open by another user. Please try again later.',
};

function docRef(msgId) {
    return { module: CRM_MODULE, subRefId: msgId };
}

/** Valida parametros comunes y el acceso del usuario al caso. */
async function validateCrmPdfRequest(connection, req, crmId, msgId, filename) {
    if (!crmId || !msgId || !isSafeFilename(filename)) {
        return { ok: false, status: 400, error: 'Invalid parameters' };
    }
    if (path.extname(filename).toLowerCase() !== '.pdf') {
        return { ok: false, status: 400, error: 'Only PDF files are supported' };
    }
    const access = await validateCrmReadAccess(connection, req, crmId);
    if (!access.ok) {
        return { ok: false, status: access.status, error: access.error };
    }
    return { ok: true };
}

/**
 * Resuelve que archivo fisico corresponde a la version pedida.
 * 'latest' siempre apunta al archivo original, que se sobrescribe con
 * cada version nueva (mismo criterio que APPROVALS).
 */
async function resolveCrmVersionContext(transaction, crmId, msgId, filename, requestedVersion = 'latest') {
    const originalFilename = normalizeOriginalFilename(filename);
    const versions = await DigitalSignaturesModel.getDocumentVersions(
        transaction, crmId, originalFilename, docRef(msgId),
    );

    const originalPath = buildCrmUncPath(crmId, msgId, originalFilename);
    const requested = String(requestedVersion || 'latest').toLowerCase();

    let fullPath = originalPath;
    let selectedFilename = originalFilename;
    let currentVersion = versions.length > 0 ? Math.max(...versions.map(v => Number(v.version))) : 0;

    if (requested !== 'latest') {
        const numericVersion = Number(requested);
        const selected = Number.isNaN(numericVersion)
            ? null
            : versions.find(v => Number(v.version) === numericVersion) || null;
        if (selected?.file_path && existsSync(selected.file_path)) {
            fullPath = selected.file_path;
            selectedFilename = selected.filename || originalFilename;
            currentVersion = Number(selected.version);
        }
    }

    return { originalFilename, selectedFilename, fullPath, currentVersion, versions };
}

function mapVersions(versions) {
    return versions.map(v => ({
        version: v.version,
        filename: v.filename,
        version_type: v.version_type,
        created_at: v.created_at,
    }));
}

export default class CRMPdfController {

    /** Metadatos del PDF (paginas, tamanos y versiones disponibles). */
    static async getPdfInfo(connection, req, res) {
        const crmId = Number(req.query.crm_id);
        const msgId = Number(req.query.msg_id);
        const filename = String(req.query.filename || '').trim();
        const version = req.query.version || 'latest';

        const check = await validateCrmPdfRequest(connection, req, crmId, msgId, filename);
        if (!check.ok) return res.status(check.status).send({ error: check.error });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const usuario = await USERModel.obtenerDatosUsuario(transaction, req.session?.userID);
            const context = await resolveCrmVersionContext(transaction, crmId, msgId, filename, version);

            if (!context.fullPath || !existsSync(context.fullPath)) {
                await transaction.commit();
                return res.status(404).send({ error: 'File not found' });
            }

            let pdfBytes;
            try {
                pdfBytes = await readFile(context.fullPath);
            } catch (readErr) {
                if (isFileLockedError(readErr)) {
                    await transaction.rollback();
                    return res.status(409).send(FILE_LOCKED_RESPONSE);
                }
                throw readErr;
            }

            const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
            const pageCount = pdfDoc.getPageCount();
            const pages = [];
            for (let i = 0; i < pageCount; i++) {
                const { width, height } = pdfDoc.getPage(i).getSize();
                pages.push({ pageNumber: i + 1, width, height });
            }

            await DigitalSignaturesModel.insertAuditLog(transaction, {
                approval_id: crmId,
                module: CRM_MODULE,
                sub_ref_id: msgId,
                filename: context.originalFilename,
                action: 'document_viewed',
                user_id: req.session?.userID || 'unknown',
                user_name: usuario?.UserName || 'unknown',
                ip_address: getClientIp(req),
                document_hash: hashBuffer(pdfBytes),
                details: null,
            });

            await transaction.commit();
            res.send({
                result: 1,
                pageCount,
                pages,
                currentVersion: context.currentVersion,
                selectedFilename: context.selectedFilename,
                versions: mapVersions(context.versions),
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) { /* transaction already finished */ }
            console.error('CRM getPdfInfo error:', error);
            if (!res.headersSent) res.status(500).send({ error: error.message });
        }
    }

    /** Entrega el binario del PDF (version pedida) para pdf.js o descarga. */
    static async servePdfFile(connection, req, res) {
        const crmId = Number(req.query.crm_id);
        const msgId = Number(req.query.msg_id);
        const filename = String(req.query.filename || '').trim();
        const version = req.query.version || 'latest';
        const forceDownload = req.query.dl === '1';

        const check = await validateCrmPdfRequest(connection, req, crmId, msgId, filename);
        if (!check.ok) return res.status(check.status).send({ error: check.error });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        let context;
        try {
            await transaction.begin();
            context = await resolveCrmVersionContext(transaction, crmId, msgId, filename, version);
            await transaction.commit();
        } catch (error) {
            try { await transaction.rollback(); } catch (_) { /* transaction already finished */ }
            console.error('CRM servePdfFile error:', error);
            return res.status(500).send({ error: error.message });
        }

        if (!context.fullPath || !existsSync(context.fullPath)) {
            return res.status(404).send({ error: 'File not found' });
        }

        const outFilename = encodeURIComponent(context.selectedFilename || filename);
        res.setHeader('Content-Length', statSync(context.fullPath).size);
        res.setHeader('Content-Type', 'application/pdf');
        // 'latest' apunta siempre a la misma URL y cambia al guardar texto:
        // sin esto el navegador podria mostrar la version anterior.
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader(
            'Content-Disposition',
            `${forceDownload ? 'attachment' : 'inline'}; filename="${outFilename}"`,
        );

        const stream = createReadStream(context.fullPath);
        stream.on('error', (streamErr) => {
            if (res.headersSent) return;
            if (isFileLockedError(streamErr)) return res.status(409).send(FILE_LOCKED_RESPONSE);
            res.status(500).send({ error: 'Error reading file' });
        });
        stream.pipe(res);
    }

    /**
     * Escribe los textos dentro del PDF y genera una version nueva.
     * La primera vez respalda el archivo original como version 0.
     */
    static async applyTextWrites(connection, req, res) {
        const crmId = Number(req.body.crm_id);
        const msgId = Number(req.body.msg_id);
        const filename = String(req.body.filename || '').trim();
        const writes = Array.isArray(req.body.writes) ? req.body.writes : null;
        const requestedVersion = req.body.version || 'latest';
        const userId = req.session?.userID;

        if (!userId) return res.status(401).send({ error: 'Not authenticated' });
        if (!writes || writes.length === 0) {
            return res.status(400).send({ error: 'Missing required fields' });
        }
        if (String(requestedVersion).toLowerCase() !== 'latest') {
            return res.status(400).send({ error: 'Text can only be applied on Latest version' });
        }

        const check = await validateCrmPdfRequest(connection, req, crmId, msgId, filename);
        if (!check.ok) return res.status(check.status).send({ error: check.error });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const usuario = await USERModel.obtenerDatosUsuario(transaction, userId);
            const context = await resolveCrmVersionContext(transaction, crmId, msgId, filename, 'latest');

            if (!context.fullPath || !existsSync(context.fullPath)) {
                await transaction.commit();
                return res.status(404).send({ error: 'File not found' });
            }

            let originalBytes;
            try {
                originalBytes = await readFile(context.fullPath);
            } catch (readErr) {
                if (isFileLockedError(readErr)) {
                    await transaction.rollback();
                    return res.status(409).send(FILE_LOCKED_RESPONSE);
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

            const editedBytes = await pdfDoc.save();
            const editedHash = hashBuffer(Buffer.from(editedBytes));

            const dir = path.dirname(context.fullPath);
            const ext = path.extname(context.originalFilename);
            const base = path.basename(context.originalFilename, ext);
            await mkdir(dir, { recursive: true });

            // Respaldo del original antes de sobrescribirlo por primera vez.
            if (context.versions.length === 0) {
                const originalBackupPath = path.join(dir, `${base}${ORIGINAL_SUFFIX}${ext}`);
                await writeFileSafe(originalBackupPath, originalBytes);
                await DigitalSignaturesModel.insertDocumentVersion(transaction, {
                    approval_id: crmId,
                    module: CRM_MODULE,
                    sub_ref_id: msgId,
                    filename: context.originalFilename,
                    version: 0,
                    version_type: 'original',
                    file_hash: originalHash,
                    file_path: originalBackupPath,
                    created_by: userId,
                });
            }

            const newVersion = context.versions.length > 0
                ? Math.max(...context.versions.map(v => Number(v.version))) + 1
                : 1;
            const editedFilename = `${base}${VERSION_SUFFIX}${newVersion}${ext}`;
            const editedPath = path.join(dir, editedFilename);

            await writeFileSafe(editedPath, editedBytes);
            // El archivo original siempre queda con la ultima version aplicada.
            await writeFileSafe(context.fullPath, editedBytes);

            await DigitalSignaturesModel.insertDocumentVersion(transaction, {
                approval_id: crmId,
                module: CRM_MODULE,
                sub_ref_id: msgId,
                filename: editedFilename,
                version: newVersion,
                version_type: 'edited',
                file_hash: editedHash,
                file_path: editedPath,
                created_by: userId,
            });

            await DigitalSignaturesModel.insertAuditLog(transaction, {
                approval_id: crmId,
                module: CRM_MODULE,
                sub_ref_id: msgId,
                filename: context.originalFilename,
                action: 'document_text_written',
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
                    output_filename: editedFilename,
                }),
            });

            await transaction.commit();
            res.send({
                result: 1,
                version: newVersion,
                edited_filename: editedFilename,
                edited_hash: editedHash,
                writes_applied: appliedWrites.length,
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) { /* transaction already finished */ }
            if (isFileLockedCode(error.code)) {
                return res.status(409).send(FILE_LOCKED_RESPONSE);
            }
            console.error('CRM applyTextWrites error:', error);
            if (!res.headersSent) res.status(500).send({ error: error.message });
        }
    }
}