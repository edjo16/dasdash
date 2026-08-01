/* ============================================================
   CRM — Persistencia del visor de PDF
   ------------------------------------------------------------
   Versiones y auditoria de los adjuntos de un caso, sobre las tablas
   crm_document_versions y crm_audit_log (ver wiki/sql/002_crm_pdf_viewer_tables.sql).

   Deliberadamente separado de APPROVALS: alli se firman documentos y el
   vocabulario es otro ('signed', 'signature_placed', ...). Un documento
   de CRM se identifica por (crm_id, msg_id, filename).
============================================================ */

import sql from 'mssql';
import { normalizeOriginalFilename } from '../../Approvals_functions/services/pdf-text-writer.js';

/** Sufijo con el que el visor nombra cada version generada. */
export const VERSION_SUFFIX = '_edited_v';
/** Sufijo del respaldo del archivo tal como se subio. */
export const ORIGINAL_SUFFIX = '_v0_original';

function splitFilename(filename = '') {
    const originalFilename = normalizeOriginalFilename(filename);
    const dot = originalFilename.lastIndexOf('.');
    if (dot === -1) {
        return { originalFilename, base: originalFilename, ext: '' };
    }
    return {
        originalFilename,
        base: originalFilename.slice(0, dot),
        ext: originalFilename.slice(dot),
    };
}

export default class CRMPdfModel {

    /**
     * Versiones de un adjunto, de la mas nueva a la mas vieja.
     * Incluye la fila del original (guardada con su nombre real) y las
     * generadas por el visor (`<base>_edited_vN.<ext>`).
     */
    static async getDocumentVersions(transaction, crmId, msgId, filename) {
        const { originalFilename, base, ext } = splitFilename(filename);

        const request = new sql.Request(transaction);
        request.input('crm_id', sql.Int, crmId);
        request.input('msg_id', sql.Int, msgId);
        request.input('originalFilename', sql.NVarChar(500), originalFilename);
        request.input('editedPrefix', sql.NVarChar(500), `${base}${VERSION_SUFFIX}`);
        request.input('ext', sql.NVarChar(50), ext);

        const result = await request.query(`
            SELECT * FROM crm_document_versions
            WHERE crm_id = @crm_id
              AND msg_id = @msg_id
              AND (
                filename = @originalFilename
                OR (
                    CHARINDEX(@editedPrefix, filename) = 1
                    AND (@ext = '' OR RIGHT(filename, LEN(@ext)) = @ext)
                )
              )
            ORDER BY version DESC, created_at DESC
        `);
        return result.recordset || [];
    }

    static async insertDocumentVersion(transaction, data) {
        const request = new sql.Request(transaction);
        request.input('crm_id',       sql.Int,            data.crm_id);
        request.input('msg_id',       sql.Int,            data.msg_id);
        request.input('filename',     sql.NVarChar(500),  data.filename);
        request.input('version',      sql.Int,            data.version);
        request.input('version_type', sql.NVarChar(20),   data.version_type);
        request.input('file_hash',    sql.NVarChar(128),  data.file_hash);
        request.input('file_path',    sql.NVarChar(1000), data.file_path);
        request.input('created_by',   sql.NVarChar(100),  data.created_by);

        const result = await request.query(`
            INSERT INTO crm_document_versions
                (crm_id, msg_id, filename, version, version_type, file_hash, file_path, created_by)
            OUTPUT INSERTED.id
            VALUES (@crm_id, @msg_id, @filename, @version, @version_type, @file_hash, @file_path, @created_by)
        `);
        return result.recordset[0].id;
    }

    static async insertAuditLog(transaction, data) {
        const request = new sql.Request(transaction);
        request.input('crm_id',        sql.Int,              data.crm_id);
        request.input('msg_id',        sql.Int,              data.msg_id);
        request.input('filename',      sql.NVarChar(500),    data.filename);
        request.input('action',        sql.NVarChar(50),     data.action);
        request.input('user_id',       sql.NVarChar(100),    data.user_id);
        request.input('user_name',     sql.NVarChar(200),    data.user_name);
        request.input('ip_address',    sql.NVarChar(45),     data.ip_address || null);
        request.input('document_hash', sql.NVarChar(128),    data.document_hash || null);
        request.input('details',       sql.NVarChar(sql.MAX), data.details || null);

        await request.query(`
            INSERT INTO crm_audit_log
                (crm_id, msg_id, filename, [action], user_id, user_name, ip_address, document_hash, details)
            VALUES
                (@crm_id, @msg_id, @filename, @action, @user_id, @user_name, @ip_address, @document_hash, @details)
        `);
    }

    static async getAuditLog(transaction, crmId, msgId, filename) {
        const request = new sql.Request(transaction);
        request.input('crm_id', sql.Int, crmId);
        request.input('msg_id', sql.Int, msgId);
        request.input('filename', sql.NVarChar(500), normalizeOriginalFilename(filename));

        const result = await request.query(`
            SELECT * FROM crm_audit_log
            WHERE crm_id = @crm_id AND msg_id = @msg_id AND filename = @filename
            ORDER BY created_at DESC
        `);
        return result.recordset || [];
    }
}
