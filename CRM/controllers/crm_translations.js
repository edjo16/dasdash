/* ============================================================
   CRM — Translations controller
   ------------------------------------------------------------
   Capa HTTP de la traduccion de documentos en CRM. Responsabilidades:
   validar entrada, comprobar acceso al caso, delegar en modelo y
   servicios, y formatear la respuesta. No genera PDFs ni arma rutas
   de disco por su cuenta.

   Espejo del controlador de APPROVALS, con dos diferencias:
     - un archivo se identifica por (crm_id, msg_id, filename);
     - el control de acceso es el del caso (validateCrmReadAccess),
       no el de equipos de APPROVALS.

   El flujo tiene dos pasos: primero se traduce el texto en background
   (`create`), y solo cuando el usuario ha revisado el preview se genera
   el documento (`generate`). Asi no aparecen PDFs sin revisar dentro
   del caso.

   Endpoints:
     GET  /crm-translate/languages   idiomas disponibles
     POST /crm-translate/create      encola una traduccion
     GET  /crm-translate/list        traducciones de un archivo
     GET  /crm-translate/counts      contadores de todo el caso
     GET  /crm-translate/status      estado de un job (polling)
     GET  /crm-translate/preview     texto traducido para revisar
     POST /crm-translate/generate    genera el PDF con el texto final
     GET  /crm-translate/file        sirve/descarga el PDF
     POST /crm-translate/delete      borrado logico
   ============================================================ */
import sql from 'mssql';
import { existsSync, createReadStream, statSync } from 'fs';
import CRMTranslationsModel, { TRANSLATION_STATUS } from '../model/crm_translations.js';
import CRMModel from '../model/CRM.js';
import USERModel from '../../USERS/model/USER.js';
import Rules from '../../USERS/rule/DevTeam.js';
import { isSafeFilename, validateCrmReadAccess } from './CRM.js';
import { getClientIp, isFileLockedError } from '../../Approvals_functions/services/pdf-text-writer.js';
import { isTranslatableFile } from '../../Approvals_functions/services/translation-pdf-service.js';
import { getSupportedTargetLanguages } from '../../Approvals_functions/services/translation-fonts.js';
import { notifyNewJob } from '../services/crm-translation-source.js';
import {
    renderTranslationDocument,
    translationErrorMessage,
} from '../../Approvals_functions/services/translation-job-engine.js';
import { OCR_LANGUAGES, TARGET_LANGUAGES, isValidOcrCode } from '../../Tools/utils/languages.js';

/** Ejecuta `fn` dentro de una transaccion, con rollback ante error. */
async function withTransaction(connection, fn) {
    await sql.connect(connection);
    const transaction = new sql.Transaction();
    await transaction.begin();
    try {
        const result = await fn(transaction);
        await transaction.commit();
        return result;
    } catch (error) {
        try { await transaction.rollback(); } catch (_) {}
        throw error;
    }
}

/** Proyeccion segura de una fila hacia el cliente (sin rutas de disco). */
function toPublicTranslation(row) {
    const ready = row.status === TRANSLATION_STATUS.COMPLETED;
    // El texto existe desde `translated`; el documento, solo desde `completed`.
    const hasText = ready || row.status === TRANSLATION_STATUS.TRANSLATED;
    const base = `/crm-translate/file?crm_id=${row.crm_id}&id=${row.id}`;
    return {
        id: row.id,
        crm_id: row.crm_id,
        msg_id: row.msg_id,
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
        preview_ready_at: row.preview_ready_at,
        completed_at: row.completed_at,
        has_preview: hasText,
        has_document: ready,
        file_url: ready ? base : null,
        download_url: ready ? `${base}&dl=1` : null,
    };
}

function nameOf(code) {
    const entry = Object.entries(OCR_LANGUAGES).find(([, c]) => c === code);
    return entry ? entry[0] : code;
}

export default class CRMTranslationsController {

    /**
     * GET /crm-translate/languages
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
            console.error('[CRM Translations] getLanguages error:', error);
            return res.status(500).send({ result: 0, error: 'Could not load languages' });
        }
    }

    /**
     * POST /crm-translate/create
     * Body: { crm_id, msg_id, filename, target_lang, source_lang? }
     * Encola el job y responde de inmediato (procesamiento asincrono).
     */
    static async createTranslation(connection, req, res) {
        const crmId = Number(req.body.crm_id);
        const msgId = Number(req.body.msg_id);
        const filename = String(req.body.filename || '').trim();
        const targetLang = String(req.body.target_lang || '');
        const sourceLang = String(req.body.source_lang || 'auto');
        const userId = req.session?.userID;

        if (!userId) return res.status(401).send({ result: 0, error: 'Not authenticated' });
        if (!crmId || !msgId) return res.status(400).send({ result: 0, error: 'Invalid case or message id' });
        if (!isSafeFilename(filename)) {
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
                error: 'Only PDF, image (PNG, JPG, WEBP), Word (.docx), OpenDocument, '
                     + 'RTF and plain text files can be translated. Word 97-2003 (.doc) '
                     + 'must be saved as .docx first.',
            });
        }

        const access = await validateCrmReadAccess(connection, req, crmId);
        if (!access.ok) return res.status(access.status).send({ result: 0, error: access.error });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();

            // El archivo debe pertenecer realmente a este mensaje de este caso.
            const archivos = await CRMModel.getMessageFileNames(transaction, crmId, msgId);
            if (!archivos.includes(filename)) {
                await transaction.commit();
                return res.status(404).send({ result: 0, error: 'File not found in this message' });
            }

            // Evitar encolar dos veces el mismo archivo+idioma.
            const active = await CRMTranslationsModel.findActiveJob(
                transaction, crmId, msgId, filename, targetLang,
            );
            if (active) {
                await transaction.commit();
                return res.send({
                    result: 1,
                    alreadyQueued: true,
                    translation: toPublicTranslation(active),
                });
            }

            const usuario = await USERModel.obtenerDatosUsuario(transaction, userId);
            const created = await CRMTranslationsModel.createJob(transaction, {
                crm_id: crmId,
                msg_id: msgId,
                source_filename: filename,
                target_lang: targetLang,
                source_lang: sourceLang,
                created_by: userId,
                created_by_name: usuario?.UserName || null,
            });

            await CRMTranslationsModel.insertAuditLog(transaction, {
                translation_id: created.id,
                crm_id: crmId,
                msg_id: msgId,
                source_filename: filename,
                action: 'translation_requested',
                user_id: userId,
                user_name: usuario?.UserName || null,
                ip_address: getClientIp(req),
                details: `lang=${targetLang}; source=${sourceLang}`,
            });

            const row = await CRMTranslationsModel.getById(transaction, created.id);
            await transaction.commit();

            // Despierta al runner para que lo tome cuanto antes.
            notifyNewJob();

            return res.send({
                result: 1,
                queued: true,
                translation: toPublicTranslation(row),
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[CRM Translations] createTranslation error:', error);
            return res.status(500).send({ result: 0, error: 'Could not queue the translation' });
        }
    }

    /**
     * GET /crm-translate/list?crm_id=&msg_id=&filename=
     * Traducciones de un archivo (para el boton "Open translation").
     */
    static async listTranslations(connection, req, res) {
        const crmId = Number(req.query.crm_id);
        const msgId = Number(req.query.msg_id);
        const filename = String(req.query.filename || '').trim();

        if (!crmId || !msgId) return res.status(400).send({ result: 0, error: 'Invalid case or message id' });
        if (!isSafeFilename(filename)) {
            return res.status(400).send({ result: 0, error: 'Invalid filename' });
        }

        const access = await validateCrmReadAccess(connection, req, crmId);
        if (!access.ok) return res.status(access.status).send({ result: 0, error: access.error });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const rows = await CRMTranslationsModel.listByFile(transaction, crmId, msgId, filename);
            await transaction.commit();

            return res.send({
                result: 1,
                translations: rows.map(toPublicTranslation),
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[CRM Translations] listTranslations error:', error);
            return res.status(500).send({ result: 0, error: 'Could not load translations' });
        }
    }

    /**
     * GET /crm-translate/counts?crm_id=
     * Contadores por (mensaje, archivo) de todo el caso. En CRM la lista de
     * adjuntos se arma en el cliente a partir de un string, asi que los
     * contadores no pueden viajar dentro de ella: se piden una sola vez al
     * cargar el caso y se cruzan en el navegador.
     */
    static async getCounts(connection, req, res) {
        const crmId = Number(req.query.crm_id);
        if (!crmId) return res.status(400).send({ result: 0, error: 'Invalid case id' });

        const access = await validateCrmReadAccess(connection, req, crmId);
        if (!access.ok) return res.status(access.status).send({ result: 0, error: access.error });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const rows = await CRMTranslationsModel.countByCase(transaction, crmId);
            await transaction.commit();

            return res.send({
                result: 1,
                counts: rows.map((row) => ({
                    msg_id: row.msg_id,
                    filename: row.source_filename,
                    completed: Number(row.completed_count) || 0,
                    preview: Number(row.preview_count) || 0,
                    pending: Number(row.pending_count) || 0,
                })),
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[CRM Translations] getCounts error:', error);
            return res.status(500).send({ result: 0, error: 'Could not load translation counts' });
        }
    }

    /**
     * GET /crm-translate/status?crm_id=&id=
     * Polling ligero del job mientras se genera en background.
     */
    static async getStatus(connection, req, res) {
        const crmId = Number(req.query.crm_id);
        const id = Number(req.query.id);

        if (!crmId || !id) return res.status(400).send({ result: 0, error: 'Invalid parameters' });

        const access = await validateCrmReadAccess(connection, req, crmId);
        if (!access.ok) return res.status(access.status).send({ result: 0, error: access.error });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const row = await CRMTranslationsModel.getById(transaction, id);
            await transaction.commit();

            if (!row || Number(row.crm_id) !== crmId) {
                return res.status(404).send({ result: 0, error: 'Translation not found' });
            }
            return res.send({ result: 1, translation: toPublicTranslation(row) });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[CRM Translations] getStatus error:', error);
            return res.status(500).send({ result: 0, error: 'Could not read the translation status' });
        }
    }

    /**
     * GET /crm-translate/preview?crm_id=&id=
     * Texto traducido para revisarlo (y corregirlo) antes de generar el
     * documento. Se sirve aparte del resto de campos porque puede pesar
     * cientos de KB y no tiene sentido en cada tick de polling.
     */
    static async getPreviewText(connection, req, res) {
        const crmId = Number(req.query.crm_id);
        const id = Number(req.query.id);

        if (!crmId || !id) return res.status(400).send({ result: 0, error: 'Invalid parameters' });

        const access = await validateCrmReadAccess(connection, req, crmId);
        if (!access.ok) return res.status(access.status).send({ result: 0, error: access.error });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const row = await CRMTranslationsModel.getPreview(transaction, id);
            await transaction.commit();

            if (!row || Number(row.crm_id) !== crmId) {
                return res.status(404).send({ result: 0, error: 'Translation not found' });
            }
            if (row.status !== TRANSLATION_STATUS.TRANSLATED
                && row.status !== TRANSLATION_STATUS.COMPLETED) {
                return res.status(409).send({ result: 0, error: 'The translation is not ready yet' });
            }

            return res.send({
                result: 1,
                translation: toPublicTranslation(row),
                text: row.translated_text || '',
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[CRM Translations] getPreviewText error:', error);
            return res.status(500).send({ result: 0, error: 'Could not load the translated text' });
        }
    }

    /**
     * POST /crm-translate/generate
     * Body: { crm_id, id, text? }
     * Segunda etapa del flujo: compone el PDF con el texto (ya revisado) y
     * lo guarda junto al original. Sincrono a proposito — aqui no hay OCR
     * ni llamadas a la IA, solo composicion con pdf-lib.
     */
    static async generateDocument(connection, req, res) {
        const crmId = Number(req.body.crm_id);
        const id = Number(req.body.id);
        const editedText = req.body.text === undefined ? null : String(req.body.text);
        const userId = req.session?.userID;

        if (!userId) return res.status(401).send({ result: 0, error: 'Not authenticated' });
        if (!crmId || !id) return res.status(400).send({ result: 0, error: 'Invalid parameters' });
        if (editedText !== null && !editedText.trim()) {
            return res.status(400).send({ result: 0, error: 'The translated text cannot be empty' });
        }

        const access = await validateCrmReadAccess(connection, req, crmId);
        if (!access.ok) return res.status(access.status).send({ result: 0, error: access.error });

        // 1) Leer el job y guardar las correcciones del usuario.
        let job;
        try {
            job = await withTransaction(connection, async (transaction) => {
                const row = await CRMTranslationsModel.getPreview(transaction, id);
                if (!row || Number(row.crm_id) !== crmId) return null;

                if (editedText !== null && editedText !== row.translated_text) {
                    await CRMTranslationsModel.updateTranslatedText(transaction, id, editedText);
                    row.translated_text = editedText;
                }
                return row;
            });
        } catch (error) {
            console.error('[CRM Translations] generateDocument (read) error:', error);
            return res.status(500).send({ result: 0, error: 'Could not read the translation' });
        }

        if (!job) return res.status(404).send({ result: 0, error: 'Translation not found' });
        if (job.status !== TRANSLATION_STATUS.TRANSLATED
            && job.status !== TRANSLATION_STATUS.COMPLETED) {
            return res.status(409).send({ result: 0, error: 'The translation is not ready yet' });
        }

        // 2) Componer y escribir el documento (fuera de transaccion: es I/O).
        let rendered;
        try {
            rendered = await renderTranslationDocument('crm', job, job.translated_text);
        } catch (error) {
            console.error('[CRM Translations] generateDocument (render) error:', error);
            const status = error.code === 'FONT_UNAVAILABLE' ? 422 : 500;
            return res.status(status).send({ result: 0, error: translationErrorMessage(error) });
        }

        // 3) Persistir el resultado.
        try {
            const row = await withTransaction(connection, async (transaction) => {
                await CRMTranslationsModel.markCompleted(transaction, id, {
                    translated_filename: rendered.translatedFilename,
                    file_path: rendered.filePath,
                    file_hash: rendered.fileHash,
                    page_count: rendered.pageCount,
                    char_count: String(job.translated_text || '').length,
                    extraction_method: job.extraction_method,
                });
                await CRMTranslationsModel.insertAuditLog(transaction, {
                    translation_id: id,
                    crm_id: crmId,
                    msg_id: job.msg_id,
                    source_filename: job.source_filename,
                    action: 'translation_completed',
                    user_id: userId,
                    ip_address: getClientIp(req),
                    details: `lang=${job.target_lang}; file=${rendered.translatedFilename}; `
                           + `pages=${rendered.pageCount}${editedText !== null ? '; edited' : ''}`,
                });
                return CRMTranslationsModel.getById(transaction, id);
            });

            return res.send({ result: 1, translation: toPublicTranslation(row) });
        } catch (error) {
            // El PDF ya esta en disco; solo fallo el registro. Se avisa para
            // que el usuario reintente en lugar de creer que no se genero.
            console.error('[CRM Translations] generateDocument (persist) error:', error);
            return res.status(500).send({
                result: 0,
                error: 'The document was generated but could not be registered. Please try again.',
            });
        }
    }

    /**
     * GET /crm-translate/file?crm_id=&id=&dl=1
     * Sirve el PDF traducido desde su ruta (junto al archivo original).
     */
    static async serveTranslationFile(connection, req, res) {
        const crmId = Number(req.query.crm_id);
        const id = Number(req.query.id);
        const forceDownload = req.query.dl === '1';

        if (!crmId || !id) return res.status(400).send({ error: 'Invalid parameters' });

        const access = await validateCrmReadAccess(connection, req, crmId);
        if (!access.ok) return res.status(access.status).send({ error: access.error });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const devteam = await Rules.validateTeam(req.session?.iddevteam, req.session?.userID);
            const row = await CRMTranslationsModel.getById(transaction, id);

            if (!row || Number(row.crm_id) !== crmId) {
                await transaction.commit();
                return res.status(404).send({ error: 'Translation not found' });
            }
            if (row.status !== TRANSLATION_STATUS.COMPLETED || !row.file_path) {
                await transaction.commit();
                return res.status(409).send({ error: 'The translation is not ready yet' });
            }

            await CRMTranslationsModel.insertAuditLog(transaction, {
                translation_id: row.id,
                crm_id: crmId,
                msg_id: row.msg_id,
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
            console.error('[CRM Translations] serveTranslationFile error:', error);
            if (!res.headersSent) res.status(500).send({ error: error.message });
        }
    }

    /**
     * POST /crm-translate/delete
     * Body: { crm_id, id }. Borrado logico: el PDF permanece en disco
     * (forma parte del caso) pero deja de listarse.
     */
    static async deleteTranslation(connection, req, res) {
        const crmId = Number(req.body.crm_id);
        const id = Number(req.body.id);
        const userId = req.session?.userID;

        if (!userId) return res.status(401).send({ result: 0, error: 'Not authenticated' });
        if (!crmId || !id) return res.status(400).send({ result: 0, error: 'Invalid parameters' });

        const access = await validateCrmReadAccess(connection, req, crmId);
        if (!access.ok) return res.status(access.status).send({ result: 0, error: access.error });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const row = await CRMTranslationsModel.getById(transaction, id);
            if (!row || Number(row.crm_id) !== crmId) {
                await transaction.commit();
                return res.status(404).send({ result: 0, error: 'Translation not found' });
            }

            await CRMTranslationsModel.cancel(transaction, id, crmId);
            await CRMTranslationsModel.insertAuditLog(transaction, {
                translation_id: id,
                crm_id: crmId,
                msg_id: row.msg_id,
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
            console.error('[CRM Translations] deleteTranslation error:', error);
            return res.status(500).send({ result: 0, error: 'Could not remove the translation' });
        }
    }
}
