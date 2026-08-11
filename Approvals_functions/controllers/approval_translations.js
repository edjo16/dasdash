/* ============================================================
   APPROVALS — Translations controller
   ------------------------------------------------------------
   Capa HTTP de la funcionalidad de traduccion de documentos.
   Responsabilidades: validar entrada, resolver identidad del
   usuario, delegar en modelo/servicios y formatear la respuesta.
   No genera PDFs ni arma rutas de disco por su cuenta.

   Endpoints:
     GET  /approval-translate/languages   idiomas disponibles
     POST /approval-translate/create      encola una traduccion
     GET  /approval-translate/list        traducciones de un archivo
     GET  /approval-translate/status      estado de un job (polling)
     GET  /approval-translate/file        sirve/descarga el PDF
     POST /approval-translate/delete      borrado logico
   ============================================================ */
import sql from 'mssql';
import { existsSync, createReadStream, statSync } from 'fs';
import ApprovalTranslationsModel, { TRANSLATION_STATUS } from '../models/translations.js';
import ApprovalFunctionsModel from '../models/approval_functions.js';
import USERModel from '../../USERS/model/USER.js';
import Rules from '../../USERS/rule/DevTeam.js';
import { getClientIp, isFileLockedError } from '../services/pdf-text-writer.js';
import { isTranslatableFile } from '../services/translation-pdf-service.js';
import { getSupportedTargetLanguages } from '../services/translation-fonts.js';
import { notifyNewJob } from '../services/translation-job-runner.js';
import { OCR_LANGUAGES, TARGET_LANGUAGES, isValidOcrCode } from '../../Tools/utils/languages.js';

/** Rechaza nombres de archivo con separadores o traversal. */
function isUnsafeFilename(filename) {
    return !filename || /[/\\]/.test(filename) || filename === '.' || filename === '..';
}

/** Proyeccion segura de una fila hacia el cliente (sin rutas de disco). */
function toPublicTranslation(row, approvalId) {
    return {
        id: row.id,
        approval_id: row.approval_id,
        source_filename: row.source_filename,
        target_lang: row.target_lang,
        target_lang_name: nameOf(row.target_lang),
        source_lang: row.source_lang,
        version: row.version,
        translated_filename: row.translated_filename,
        status: row.status,
        error_message: row.error_message,
        page_count: row.page_count,
        char_count: row.char_count,
        extraction_method: row.extraction_method,
        created_by_name: row.created_by_name,
        created_at: row.created_at,
        completed_at: row.completed_at,
        file_url: row.status === TRANSLATION_STATUS.COMPLETED
            ? `/approval-translate/file?RowID=${approvalId}&id=${row.id}`
            : null,
        download_url: row.status === TRANSLATION_STATUS.COMPLETED
            ? `/approval-translate/file?RowID=${approvalId}&id=${row.id}&dl=1`
            : null,
    };
}

function nameOf(code) {
    const entry = Object.entries(OCR_LANGUAGES).find(([, c]) => c === code);
    return entry ? entry[0] : code;
}

export default class ApprovalTranslationsController {

    /**
     * GET /approval-translate/languages
     * Idiomas origen/destino y si el destino se puede exportar a PDF
     * en esta instalacion (depende de las fuentes instaladas).
     */
    static async getLanguages(connection, req, res) {
        try {
            const supported = await getSupportedTargetLanguages(TARGET_LANGUAGES);
            return res.send({
                result: 1,
                sourceLanguages: OCR_LANGUAGES,
                targetLanguages: TARGET_LANGUAGES,
                targetSupport: supported,
            });
        } catch (error) {
            console.error('[Translations] getLanguages error:', error);
            return res.status(500).send({ result: 0, error: 'Could not load languages' });
        }
    }

    /**
     * POST /approval-translate/create
     * Body: { RowID, filename, target_lang, source_lang? }
     * Encola el job y responde de inmediato (procesamiento asincrono).
     */
    static async createTranslation(connection, req, res) {
        const RowID = Number(req.body.RowID);
        const filename = req.body.filename || '';
        const targetLang = String(req.body.target_lang || '');
        const sourceLang = String(req.body.source_lang || 'auto');
        const userId = req.session?.userID;

        if (!userId) return res.status(401).send({ result: 0, error: 'Not authenticated' });
        if (!RowID) return res.status(400).send({ result: 0, error: 'Invalid approval id' });
        if (isUnsafeFilename(filename)) {
            return res.status(400).send({ result: 0, error: 'Invalid filename' });
        }
        if (!Object.values(TARGET_LANGUAGES).includes(targetLang)) {
            return res.status(400).send({ result: 0, error: 'Unsupported target language' });
        }
        if (!isValidOcrCode(sourceLang)) {
            return res.status(400).send({ result: 0, error: 'Unsupported source language' });
        }
        if (!isTranslatableFile(filename)) {
            return res.status(415).send({
                result: 0,
                error: 'Only PDF and image files (PNG, JPG, WEBP) can be translated',
            });
        }

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();

            // El archivo debe pertenecer realmente a este approval.
            const archivos = await ApprovalFunctionsModel.getArchivosByLogId(transaction, RowID);
            const belongs = Array.isArray(archivos)
                && archivos.some((a) => a.archivo_nombre === filename);
            if (!belongs) {
                await transaction.commit();
                return res.status(404).send({ result: 0, error: 'File not found in this approval' });
            }

            // Evitar encolar dos veces el mismo archivo+idioma.
            const active = await ApprovalTranslationsModel.findActiveJob(
                transaction, RowID, filename, targetLang,
            );
            if (active) {
                await transaction.commit();
                return res.send({
                    result: 1,
                    alreadyQueued: true,
                    translation: toPublicTranslation(active, RowID),
                });
            }

            const usuario = await USERModel.obtenerDatosUsuario(transaction, userId);
            const created = await ApprovalTranslationsModel.createJob(transaction, {
                approval_id: RowID,
                source_filename: filename,
                target_lang: targetLang,
                source_lang: sourceLang,
                created_by: userId,
                created_by_name: usuario?.UserName || null,
            });

            await ApprovalTranslationsModel.insertAuditLog(transaction, {
                translation_id: created.id,
                approval_id: RowID,
                source_filename: filename,
                action: 'translation_requested',
                user_id: userId,
                user_name: usuario?.UserName || null,
                ip_address: getClientIp(req),
                details: `lang=${targetLang}; source=${sourceLang}`,
            });

            const row = await ApprovalTranslationsModel.getById(transaction, created.id);
            await transaction.commit();

            // Despierta al runner para que lo tome cuanto antes.
            notifyNewJob();

            return res.send({
                result: 1,
                queued: true,
                translation: toPublicTranslation(row, RowID),
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[Translations] createTranslation error:', error);
            return res.status(500).send({ result: 0, error: 'Could not queue the translation' });
        }
    }

    /**
     * GET /approval-translate/list?RowID=&filename=
     * Traducciones de un archivo (para el boton "Open translation").
     */
    static async listTranslations(connection, req, res) {
        const RowID = Number(req.query.RowID);
        const filename = req.query.filename || '';

        if (!RowID) return res.status(400).send({ result: 0, error: 'Invalid approval id' });
        if (isUnsafeFilename(filename)) {
            return res.status(400).send({ result: 0, error: 'Invalid filename' });
        }

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const rows = await ApprovalTranslationsModel.listByFile(transaction, RowID, filename);
            await transaction.commit();

            return res.send({
                result: 1,
                translations: rows.map((row) => toPublicTranslation(row, RowID)),
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[Translations] listTranslations error:', error);
            return res.status(500).send({ result: 0, error: 'Could not load translations' });
        }
    }

    /**
     * GET /approval-translate/status?RowID=&id=
     * Polling ligero del job mientras se genera en background.
     */
    static async getStatus(connection, req, res) {
        const RowID = Number(req.query.RowID);
        const id = Number(req.query.id);

        if (!RowID || !id) return res.status(400).send({ result: 0, error: 'Invalid parameters' });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const row = await ApprovalTranslationsModel.getById(transaction, id);
            await transaction.commit();

            if (!row || Number(row.approval_id) !== RowID) {
                return res.status(404).send({ result: 0, error: 'Translation not found' });
            }
            return res.send({ result: 1, translation: toPublicTranslation(row, RowID) });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[Translations] getStatus error:', error);
            return res.status(500).send({ result: 0, error: 'Could not read the translation status' });
        }
    }

    /**
     * GET /approval-translate/file?RowID=&id=&dl=1
     * Sirve el PDF traducido desde su ruta (junto al archivo original).
     */
    static async serveTranslationFile(connection, req, res) {
        const RowID = Number(req.query.RowID);
        const id = Number(req.query.id);
        const forceDownload = req.query.dl === '1';

        if (!RowID || !id) return res.status(400).send({ error: 'Invalid parameters' });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const devteam = await Rules.validateTeam(req.session?.iddevteam, req.session?.userID);
            const row = await ApprovalTranslationsModel.getById(transaction, id);

            if (!row || Number(row.approval_id) !== RowID) {
                await transaction.commit();
                return res.status(404).send({ error: 'Translation not found' });
            }
            if (row.status !== TRANSLATION_STATUS.COMPLETED || !row.file_path) {
                await transaction.commit();
                return res.status(409).send({ error: 'The translation is not ready yet' });
            }

            await ApprovalTranslationsModel.insertAuditLog(transaction, {
                translation_id: row.id,
                approval_id: RowID,
                source_filename: row.source_filename,
                action: forceDownload ? 'translation_downloaded' : 'translation_viewed',
                user_id: req.session?.userID,
                ip_address: getClientIp(req),
                details: row.translated_filename,
            });
            await transaction.commit();

            if (!existsSync(row.file_path)) {
                return res.status(404).send(devteam
                    ? { error: 'Translated file not found', ruta: row.file_path }
                    : { error: 'Translated file not found' });
            }

            const stat = statSync(row.file_path);
            const outName = encodeURIComponent(row.translated_filename || 'translation.pdf');
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `${forceDownload ? 'attachment' : 'inline'}; filename="${outName}"`,
            );

            const stream = createReadStream(row.file_path);
            stream.on('error', (streamErr) => {
                if (res.headersSent) return;
                if (isFileLockedError(streamErr)) {
                    res.status(409).send({ error: 'file_locked', message: 'The file is currently in use. Please try again later.' });
                } else {
                    res.status(500).send({ error: 'Error reading file' });
                }
            });
            stream.pipe(res);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[Translations] serveTranslationFile error:', error);
            if (!res.headersSent) res.status(500).send({ error: error.message });
        }
    }

    /**
     * POST /approval-translate/delete
     * Body: { RowID, id }. Borrado logico: el PDF permanece en disco
     * (forma parte del expediente) pero deja de listarse.
     */
    static async deleteTranslation(connection, req, res) {
        const RowID = Number(req.body.RowID);
        const id = Number(req.body.id);
        const userId = req.session?.userID;

        if (!userId) return res.status(401).send({ result: 0, error: 'Not authenticated' });
        if (!RowID || !id) return res.status(400).send({ result: 0, error: 'Invalid parameters' });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const row = await ApprovalTranslationsModel.getById(transaction, id);
            if (!row || Number(row.approval_id) !== RowID) {
                await transaction.commit();
                return res.status(404).send({ result: 0, error: 'Translation not found' });
            }

            await ApprovalTranslationsModel.cancel(transaction, id, RowID);
            await ApprovalTranslationsModel.insertAuditLog(transaction, {
                translation_id: id,
                approval_id: RowID,
                source_filename: row.source_filename,
                action: 'translation_removed',
                user_id: userId,
                ip_address: getClientIp(req),
                details: row.translated_filename,
            });
            await transaction.commit();

            return res.send({ result: 1, deleted: true });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[Translations] deleteTranslation error:', error);
            return res.status(500).send({ result: 0, error: 'Could not remove the translation' });
        }
    }
}
