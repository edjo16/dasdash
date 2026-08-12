/* ============================================================
   APPROVALS — Translations model
   ------------------------------------------------------------
   Unica capa que conoce las tablas `approval_translations` y
   `approval_translation_audit_log`. No resuelve rutas, no genera
   PDFs y no valida permisos: eso vive en el servicio/controlador.
   ============================================================ */
import sql from 'mssql';

/**
 * Estados posibles de un job de traduccion.
 *
 * `TRANSLATED` es el estado intermedio del flujo de dos pasos: el texto
 * ya esta traducido y guardado, pero el documento aun no se ha generado.
 * Es terminal para el motor de background; el salto a `COMPLETED` lo
 * dispara el usuario tras revisar el preview.
 */
export const TRANSLATION_STATUS = Object.freeze({
    PENDING: 'pending',
    PROCESSING: 'processing',
    TRANSLATED: 'translated',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
});

/**
 * Columnas de uso general. Deliberadamente SIN `translated_text`: el texto
 * completo puede pesar cientos de KB y estas columnas viajan en cada
 * listado y en cada tick de polling. El texto se pide aparte (getPreview).
 */
const SELECT_COLUMNS = `
    id, approval_id, source_filename, target_lang, source_lang, version,
    translated_filename, file_path, file_hash, page_count, char_count,
    extraction_method, status, error_message, created_by, created_by_name,
    created_at, started_at, preview_ready_at, completed_at
`;

export default class ApprovalTranslationsModel {

    /**
     * Crea el registro del job en estado `pending`.
     * La version se calcula por (approval_id, source_filename, target_lang)
     * para que un mismo archivo pueda re-traducirse al mismo idioma.
     */
    static async createJob(transaction, data) {
        const request = new sql.Request(transaction);
        request.input('approval_id', sql.Int, data.approval_id);
        request.input('source_filename', sql.NVarChar(500), data.source_filename);
        request.input('target_lang', sql.NVarChar(20), data.target_lang);
        request.input('source_lang', sql.NVarChar(20), data.source_lang || null);
        request.input('created_by', sql.NVarChar(100), String(data.created_by ?? ''));
        request.input('created_by_name', sql.NVarChar(200), data.created_by_name || null);

        const result = await request.query(`
            DECLARE @nextVersion INT = (
                SELECT ISNULL(MAX(version), 0) + 1
                FROM approval_translations
                WHERE approval_id = @approval_id
                  AND source_filename = @source_filename
                  AND target_lang = @target_lang
            );

            INSERT INTO approval_translations
                (approval_id, source_filename, target_lang, source_lang, version,
                 status, created_by, created_by_name)
            OUTPUT INSERTED.id, INSERTED.version
            VALUES
                (@approval_id, @source_filename, @target_lang, @source_lang, @nextVersion,
                 '${TRANSLATION_STATUS.PENDING}', @created_by, @created_by_name);
        `);

        return result.recordset[0];
    }

    static async getById(transaction, id) {
        const request = new sql.Request(transaction);
        request.input('id', sql.Int, id);
        const result = await request.query(`
            SELECT ${SELECT_COLUMNS} FROM approval_translations WHERE id = @id
        `);
        return result.recordset[0] || null;
    }

    /** Traducciones de un archivo concreto, mas recientes primero. */
    static async listByFile(transaction, approvalId, sourceFilename) {
        const request = new sql.Request(transaction);
        request.input('approval_id', sql.Int, approvalId);
        request.input('source_filename', sql.NVarChar(500), sourceFilename);
        const result = await request.query(`
            SELECT ${SELECT_COLUMNS}
            FROM approval_translations
            WHERE approval_id = @approval_id
              AND source_filename = @source_filename
              AND status <> '${TRANSLATION_STATUS.CANCELLED}'
            ORDER BY created_at DESC, id DESC
        `);
        return result.recordset || [];
    }

    /** Fila completa CON el texto traducido, para la pantalla de preview. */
    static async getPreview(transaction, id) {
        const request = new sql.Request(transaction);
        request.input('id', sql.Int, id);
        const result = await request.query(`
            SELECT ${SELECT_COLUMNS}, translated_text
            FROM approval_translations WHERE id = @id
        `);
        return result.recordset[0] || null;
    }

    /**
     * Conteo por archivo para pintar los botones de la lista de archivos
     * sin hacer una consulta por cada uno.
     *
     * `preview_count` son las traducciones con texto listo pendientes de
     * generar el documento: la UI las marca aparte porque requieren una
     * accion del usuario, no solo esperar.
     */
    static async countByApproval(transaction, approvalId) {
        const request = new sql.Request(transaction);
        request.input('approval_id', sql.Int, approvalId);
        const result = await request.query(`
            SELECT
                source_filename,
                SUM(CASE WHEN status = '${TRANSLATION_STATUS.COMPLETED}' THEN 1 ELSE 0 END) AS completed_count,
                SUM(CASE WHEN status = '${TRANSLATION_STATUS.TRANSLATED}' THEN 1 ELSE 0 END) AS preview_count,
                SUM(CASE WHEN status IN ('${TRANSLATION_STATUS.PENDING}', '${TRANSLATION_STATUS.PROCESSING}') THEN 1 ELSE 0 END) AS pending_count
            FROM approval_translations
            WHERE approval_id = @approval_id
              AND status <> '${TRANSLATION_STATUS.CANCELLED}'
            GROUP BY source_filename
        `);
        return result.recordset || [];
    }

    /** Job existente aun en curso para el mismo archivo+idioma (evita duplicados). */
    static async findActiveJob(transaction, approvalId, sourceFilename, targetLang) {
        const request = new sql.Request(transaction);
        request.input('approval_id', sql.Int, approvalId);
        request.input('source_filename', sql.NVarChar(500), sourceFilename);
        request.input('target_lang', sql.NVarChar(20), targetLang);
        const result = await request.query(`
            SELECT TOP 1 ${SELECT_COLUMNS}
            FROM approval_translations
            WHERE approval_id = @approval_id
              AND source_filename = @source_filename
              AND target_lang = @target_lang
              AND status IN ('${TRANSLATION_STATUS.PENDING}', '${TRANSLATION_STATUS.PROCESSING}')
            ORDER BY created_at DESC
        `);
        return result.recordset[0] || null;
    }

    /**
     * Toma el siguiente job pendiente marcandolo como `processing` de forma
     * atomica (UPDATE ... OUTPUT con readpast) para que varias instancias del
     * runner no procesen el mismo registro.
     */
    static async claimNextPendingJob(transaction) {
        const request = new sql.Request(transaction);
        const result = await request.query(`
            UPDATE TOP (1) t
            SET status = '${TRANSLATION_STATUS.PROCESSING}',
                started_at = GETDATE()
            OUTPUT ${SELECT_COLUMNS.split(',').map(c => 'INSERTED.' + c.trim()).join(', ')}
            FROM approval_translations AS t WITH (READPAST, UPDLOCK, ROWLOCK)
            WHERE t.status = '${TRANSLATION_STATUS.PENDING}'
        `);
        return result.recordset[0] || null;
    }

    /**
     * Cierra la etapa cara (extraccion + IA): guarda el texto traducido y
     * deja el job en `translated`, a la espera de que el usuario revise el
     * preview y pida generar el documento.
     */
    static async markTranslated(transaction, id, data) {
        const request = new sql.Request(transaction);
        request.input('id', sql.Int, id);
        request.input('translated_text', sql.NVarChar(sql.MAX), String(data.translated_text || ''));
        request.input('char_count', sql.Int, data.char_count ?? null);
        request.input('extraction_method', sql.NVarChar(20), data.extraction_method || null);
        await request.query(`
            UPDATE approval_translations
            SET status = '${TRANSLATION_STATUS.TRANSLATED}',
                translated_text = @translated_text,
                char_count = @char_count,
                extraction_method = @extraction_method,
                error_message = NULL,
                preview_ready_at = GETDATE()
            WHERE id = @id
        `);
    }

    /** Guarda las correcciones que el usuario hizo sobre el preview. */
    static async updateTranslatedText(transaction, id, text) {
        const request = new sql.Request(transaction);
        request.input('id', sql.Int, id);
        request.input('translated_text', sql.NVarChar(sql.MAX), String(text || ''));
        request.input('char_count', sql.Int, String(text || '').length);
        await request.query(`
            UPDATE approval_translations
            SET translated_text = @translated_text,
                char_count = @char_count
            WHERE id = @id
        `);
    }

    static async markCompleted(transaction, id, data) {
        const request = new sql.Request(transaction);
        request.input('id', sql.Int, id);
        request.input('translated_filename', sql.NVarChar(500), data.translated_filename);
        request.input('file_path', sql.NVarChar(1000), data.file_path);
        request.input('file_hash', sql.NVarChar(128), data.file_hash || null);
        request.input('page_count', sql.Int, data.page_count ?? null);
        request.input('char_count', sql.Int, data.char_count ?? null);
        request.input('extraction_method', sql.NVarChar(20), data.extraction_method || null);
        await request.query(`
            UPDATE approval_translations
            SET status = '${TRANSLATION_STATUS.COMPLETED}',
                translated_filename = @translated_filename,
                file_path = @file_path,
                file_hash = @file_hash,
                page_count = @page_count,
                char_count = @char_count,
                extraction_method = @extraction_method,
                error_message = NULL,
                completed_at = GETDATE()
            WHERE id = @id
        `);
    }

    static async markFailed(transaction, id, errorMessage) {
        const request = new sql.Request(transaction);
        request.input('id', sql.Int, id);
        request.input('error_message', sql.NVarChar(1000), String(errorMessage || '').slice(0, 1000));
        await request.query(`
            UPDATE approval_translations
            SET status = '${TRANSLATION_STATUS.FAILED}',
                error_message = @error_message,
                completed_at = GETDATE()
            WHERE id = @id
        `);
    }

    /**
     * Devuelve a `pending` los jobs que quedaron colgados en `processing`
     * (por ejemplo si el proceso se reinicio a mitad de una traduccion).
     */
    static async requeueStaleJobs(transaction, staleMinutes = 30) {
        const request = new sql.Request(transaction);
        request.input('staleMinutes', sql.Int, staleMinutes);
        const result = await request.query(`
            UPDATE approval_translations
            SET status = '${TRANSLATION_STATUS.PENDING}', started_at = NULL
            WHERE status = '${TRANSLATION_STATUS.PROCESSING}'
              AND started_at IS NOT NULL
              AND DATEDIFF(MINUTE, started_at, GETDATE()) >= @staleMinutes
        `);
        return result.rowsAffected?.[0] || 0;
    }

    /** Borrado logico: la traduccion desaparece de la UI pero queda el rastro. */
    static async cancel(transaction, id, approvalId) {
        const request = new sql.Request(transaction);
        request.input('id', sql.Int, id);
        request.input('approval_id', sql.Int, approvalId);
        const result = await request.query(`
            UPDATE approval_translations
            SET status = '${TRANSLATION_STATUS.CANCELLED}'
            WHERE id = @id AND approval_id = @approval_id
        `);
        return result.rowsAffected?.[0] || 0;
    }

    static async insertAuditLog(transaction, data) {
        const request = new sql.Request(transaction);
        request.input('translation_id', sql.Int, data.translation_id ?? null);
        request.input('approval_id', sql.Int, data.approval_id);
        request.input('source_filename', sql.NVarChar(500), data.source_filename);
        request.input('action', sql.NVarChar(50), data.action);
        request.input('user_id', sql.NVarChar(100), String(data.user_id ?? ''));
        request.input('user_name', sql.NVarChar(200), data.user_name || null);
        request.input('ip_address', sql.NVarChar(64), data.ip_address || null);
        request.input('details', sql.NVarChar(1000), data.details ? String(data.details).slice(0, 1000) : null);
        await request.query(`
            INSERT INTO approval_translation_audit_log
                (translation_id, approval_id, source_filename, action, user_id, user_name, ip_address, details)
            VALUES
                (@translation_id, @approval_id, @source_filename, @action, @user_id, @user_name, @ip_address, @details)
        `);
    }
}
