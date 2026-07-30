import sql from 'mssql';

function normalizeOriginalFilename(filename = '') {
    return String(filename).replace(/_signed_v\d+(?=\.[^.]+$)/i, '');
}

function splitFilename(filename = '') {
    const normalized = normalizeOriginalFilename(filename);
    const dot = normalized.lastIndexOf('.');
    if (dot === -1) {
        return { originalFilename: normalized, base: normalized, ext: '' };
    }
    return {
        originalFilename: normalized,
        base: normalized.slice(0, dot),
        ext: normalized.slice(dot),
    };
}

export default class DigitalSignaturesModel {

    static async insertSignature(transaction, data) {
        const request = new sql.Request(transaction);
        request.input('approval_id',    sql.Int,            data.approval_id);
        request.input('filename',       sql.NVarChar(500),  data.filename);
        request.input('signer_user_id', sql.NVarChar(100),  data.signer_user_id);
        request.input('signer_name',    sql.NVarChar(200),  data.signer_name);
        request.input('signature_data', sql.NVarChar(sql.MAX), data.signature_data);
        request.input('position_x',     sql.Float,          data.position_x);
        request.input('position_y',     sql.Float,          data.position_y);
        request.input('page_number',    sql.Int,            data.page_number);
        request.input('sig_width',      sql.Float,          data.sig_width);
        request.input('sig_height',     sql.Float,          data.sig_height);
        request.input('document_hash',  sql.NVarChar(128),  data.document_hash);
        request.input('signed_hash',    sql.NVarChar(128),  data.signed_hash);
        request.input('ip_address',     sql.NVarChar(45),   data.ip_address);
        request.input('user_agent',     sql.NVarChar(500),  data.user_agent);

        const result = await request.query(`
            INSERT INTO approval_signatures
                (approval_id, filename, signer_user_id, signer_name, signature_data,
                 position_x, position_y, page_number, sig_width, sig_height,
                 document_hash, signed_hash, ip_address, user_agent)
            OUTPUT INSERTED.id
            VALUES
                (@approval_id, @filename, @signer_user_id, @signer_name, @signature_data,
                 @position_x, @position_y, @page_number, @sig_width, @sig_height,
                 @document_hash, @signed_hash, @ip_address, @user_agent)
        `);
        return result.recordset[0].id;
    }

    static async getSignaturesByApproval(transaction, approvalId, filename) {
        const request = new sql.Request(transaction);
        const normalizedFilename = normalizeOriginalFilename(filename);
        request.input('approval_id', sql.Int, approvalId);
        request.input('filename', sql.NVarChar(500), normalizedFilename);
        const result = await request.query(`
            SELECT * FROM approval_signatures
            WHERE approval_id = @approval_id AND filename = @filename AND status = 'active'
            ORDER BY signed_at ASC
        `);
        return result.recordset || [];
    }

    static async getSignaturesByApprovalAll(transaction, approvalId) {
        const request = new sql.Request(transaction);
        request.input('approval_id', sql.Int, approvalId);
        const result = await request.query(`
            SELECT * FROM approval_signatures
            WHERE approval_id = @approval_id AND status = 'active'
            ORDER BY signed_at ASC
        `);
        return result.recordset || [];
    }

    static async saveUserSignature(transaction, userId, signatureData, label) {
        const request = new sql.Request(transaction);
        request.input('user_id', sql.NVarChar(100), userId);
        request.input('signature_data', sql.NVarChar(sql.MAX), signatureData);
        request.input('label', sql.NVarChar(100), label || 'Default');

        await request.query(`
            UPDATE user_saved_signatures SET is_default = 0 WHERE user_id = @user_id
        `);

        const req2 = new sql.Request(transaction);
        req2.input('user_id', sql.NVarChar(100), userId);
        req2.input('signature_data', sql.NVarChar(sql.MAX), signatureData);
        req2.input('label', sql.NVarChar(100), label || 'Default');
        const result = await req2.query(`
            INSERT INTO user_saved_signatures (user_id, signature_data, label, is_default)
            OUTPUT INSERTED.id
            VALUES (@user_id, @signature_data, @label, 1)
        `);
        return result.recordset[0].id;
    }

    static async getUserSavedSignatures(transaction, userId) {
        const request = new sql.Request(transaction);
        request.input('user_id', sql.NVarChar(100), userId);
        const result = await request.query(`
            SELECT id, label, signature_data, is_default, created_at FROM user_saved_signatures
            WHERE user_id = @user_id ORDER BY is_default DESC, created_at DESC
        `);
        return result.recordset || [];
    }

    static async getUserDefaultSignature(transaction, userId) {
        const request = new sql.Request(transaction);
        request.input('user_id', sql.NVarChar(100), userId);
        const result = await request.query(`
            SELECT TOP 1 * FROM user_saved_signatures
            WHERE user_id = @user_id AND is_default = 1
        `);
        return result.recordset[0] || null;
    }

    static async deleteUserSignature(transaction, sigId, userId) {
        const request = new sql.Request(transaction);
        request.input('id', sql.Int, sigId);
        request.input('user_id', sql.NVarChar(100), userId);
        const deleted = await request.query(`
            DELETE FROM user_saved_signatures
            OUTPUT DELETED.id AS id, DELETED.is_default AS is_default
            WHERE id = @id AND user_id = @user_id
        `);

        const deletedRow = (deleted.recordset && deleted.recordset[0]) || null;
        if (!deletedRow) {
            return { deleted: 0, defaultReassigned: false };
        }

        let defaultReassigned = false;
        if (deletedRow.is_default) {
            const req2 = new sql.Request(transaction);
            req2.input('user_id', sql.NVarChar(100), userId);
            const promoted = await req2.query(`
                ;WITH next_default AS (
                    SELECT TOP 1 id
                    FROM user_saved_signatures
                    WHERE user_id = @user_id
                    ORDER BY created_at DESC, id DESC
                )
                UPDATE s
                SET is_default = CASE WHEN s.id = n.id THEN 1 ELSE 0 END
                FROM user_saved_signatures s
                CROSS JOIN next_default n
                WHERE s.user_id = @user_id
            `);
            defaultReassigned = Number(promoted.rowsAffected && promoted.rowsAffected[0] || 0) > 0;
        }

        return {
            deleted: 1,
            defaultReassigned,
        };
    }

    static async insertDocumentVersion(transaction, data) {
        const request = new sql.Request(transaction);
        request.input('approval_id', sql.Int,             data.approval_id);
        request.input('filename',    sql.NVarChar(500),   data.filename);
        request.input('version',     sql.Int,             data.version);
        request.input('version_type',sql.NVarChar(20),    data.version_type);
        request.input('file_hash',   sql.NVarChar(128),   data.file_hash);
        request.input('file_path',   sql.NVarChar(1000),  data.file_path);
        request.input('created_by',  sql.NVarChar(100),   data.created_by);

        const result = await request.query(`
            INSERT INTO document_versions
                (approval_id, filename, version, version_type, file_hash, file_path, created_by)
            OUTPUT INSERTED.id
            VALUES (@approval_id, @filename, @version, @version_type, @file_hash, @file_path, @created_by)
        `);
        return result.recordset[0].id;
    }

    static async getDocumentVersions(transaction, approvalId, filename) {
        const { originalFilename, base, ext } = splitFilename(filename);
        const signedPrefix = `${base}_signed_v`;

        const request = new sql.Request(transaction);
        request.input('approval_id', sql.Int, approvalId);
        request.input('originalFilename', sql.NVarChar(500), originalFilename);
        request.input('signedPrefix', sql.NVarChar(500), signedPrefix);
        request.input('ext', sql.NVarChar(50), ext);
        const result = await request.query(`
            SELECT * FROM document_versions
            WHERE approval_id = @approval_id
              AND (
                filename = @originalFilename
                OR (
                    CHARINDEX(@signedPrefix, filename) = 1
                    AND (@ext = '' OR RIGHT(filename, LEN(@ext)) = @ext)
                )
              )
            ORDER BY version DESC, created_at DESC
        `);
        return result.recordset || [];
    }

    static async getLatestVersion(transaction, approvalId, filename) {
        const versions = await this.getDocumentVersions(transaction, approvalId, filename);
        return versions.length > 0 ? versions[0] : null;
    }

    static async getVersionByNumber(transaction, approvalId, filename, versionNumber) {
        const versions = await this.getDocumentVersions(transaction, approvalId, filename);
        return versions.find(v => Number(v.version) === Number(versionNumber)) || null;
    }

    static async insertAuditLog(transaction, data) {
        const request = new sql.Request(transaction);
        request.input('approval_id',   sql.Int,             data.approval_id);
        request.input('filename',      sql.NVarChar(500),   data.filename);
        request.input('action',        sql.NVarChar(50),    data.action);
        request.input('user_id',       sql.NVarChar(100),   data.user_id);
        request.input('user_name',     sql.NVarChar(200),   data.user_name);
        request.input('ip_address',    sql.NVarChar(45),    data.ip_address);
        request.input('document_hash', sql.NVarChar(128),   data.document_hash);
        request.input('details',       sql.NVarChar(sql.MAX), data.details);

        await request.query(`
            INSERT INTO signature_audit_log
                (approval_id, filename, action, user_id, user_name, ip_address, document_hash, details)
            VALUES
                (@approval_id, @filename, @action, @user_id, @user_name, @ip_address, @document_hash, @details)
        `);
    }

    static async getAuditLog(transaction, approvalId, filename) {
        const request = new sql.Request(transaction);
        const normalizedFilename = normalizeOriginalFilename(filename);
        request.input('approval_id', sql.Int, approvalId);
        request.input('filename', sql.NVarChar(500), normalizedFilename);
        const result = await request.query(`
            SELECT * FROM signature_audit_log
            WHERE approval_id = @approval_id AND filename = @filename
            ORDER BY created_at DESC
        `);
        return result.recordset || [];
    }

    static async getAuditLogByApproval(transaction, approvalId) {
        const request = new sql.Request(transaction);
        request.input('approval_id', sql.Int, approvalId);
        const result = await request.query(`
            SELECT * FROM signature_audit_log
            WHERE approval_id = @approval_id
            ORDER BY created_at DESC
        `);
        return result.recordset || [];
    }

    static async getAnnotationsByApproval(transaction, approvalId, filename, maxVersion = null) {
        const request = new sql.Request(transaction);
        const normalizedFilename = normalizeOriginalFilename(filename);
        request.input('approval_id', sql.Int, approvalId);
        request.input('filename', sql.NVarChar(500), normalizedFilename);
        request.input('max_version', sql.Int, Number(maxVersion) || null);
        const result = await request.query(`
            SELECT *
            FROM document_annotations
            WHERE approval_id = @approval_id
              AND filename = @filename
              AND status = 'active'
              AND (@max_version IS NULL OR source_version <= @max_version)
            ORDER BY page_number ASC, id ASC
        `);
        return result.recordset || [];
    }

    static async insertAnnotationAuditLog(transaction, data) {
        const request = new sql.Request(transaction);
        request.input('annotation_id', sql.Int, data.annotation_id || null);
        request.input('approval_id', sql.Int, data.approval_id);
        request.input('filename', sql.NVarChar(500), data.filename);
        request.input('action', sql.NVarChar(30), data.action);
        request.input('user_id', sql.NVarChar(100), data.user_id);
        request.input('user_name', sql.NVarChar(200), data.user_name);
        request.input('ip_address', sql.NVarChar(45), data.ip_address || null);
        request.input('details', sql.NVarChar(sql.MAX), data.details || null);
        await request.query(`
            INSERT INTO annotation_change_log
                (annotation_id, approval_id, filename, action, user_id, user_name, ip_address, details)
            VALUES
                (@annotation_id, @approval_id, @filename, @action, @user_id, @user_name, @ip_address, @details)
        `);
    }

    static async saveAnnotationsBatch(transaction, data) {
        const approvalId = Number(data.approval_id);
        const userId = String(data.user_id || 'unknown');
        const userName = String(data.user_name || 'unknown');
        const ipAddress = data.ip_address || null;
        const currentVersion = Number(data.current_version) || 1;
        const normalizedFilename = normalizeOriginalFilename(data.filename || '');
        const incoming = Array.isArray(data.annotations) ? data.annotations : [];

        const existingReq = new sql.Request(transaction);
        existingReq.input('approval_id', sql.Int, approvalId);
        existingReq.input('filename', sql.NVarChar(500), normalizedFilename);
        const existingRows = (await existingReq.query(`
            SELECT id
            FROM document_annotations
            WHERE approval_id = @approval_id
              AND filename = @filename
              AND status = 'active'
        `)).recordset || [];

        const existingIdSet = new Set(existingRows.map(function (r) { return Number(r.id); }));
        const keptIds = new Set();

        let createdCount = 0;
        let updatedCount = 0;
        let deletedCount = 0;

        for (const raw of incoming) {
            const annotationType = raw && raw.annotation_type === 'comment' ? 'comment' : 'text';
            const pageNumber = Math.max(1, Number(raw?.page_number) || 1);
            const positionX = Number(raw?.position_x) || 0;
            const positionY = Number(raw?.position_y) || 0;
            const boxWidth = Math.max(40, Number(raw?.box_width) || 180);
            const boxHeight = Math.max(24, Number(raw?.box_height) || 70);
            const annotationText = String(raw?.annotation_text || '');
            const maybeId = Number(raw?.id);

            if (Number.isFinite(maybeId) && existingIdSet.has(maybeId)) {
                const updReq = new sql.Request(transaction);
                updReq.input('id', sql.Int, maybeId);
                updReq.input('annotation_type', sql.NVarChar(20), annotationType);
                updReq.input('page_number', sql.Int, pageNumber);
                updReq.input('position_x', sql.Float, positionX);
                updReq.input('position_y', sql.Float, positionY);
                updReq.input('box_width', sql.Float, boxWidth);
                updReq.input('box_height', sql.Float, boxHeight);
                updReq.input('annotation_text', sql.NVarChar(sql.MAX), annotationText);
                updReq.input('source_version', sql.Int, currentVersion);
                updReq.input('updated_by', sql.NVarChar(100), userId);
                await updReq.query(`
                    UPDATE document_annotations
                    SET annotation_type = @annotation_type,
                        page_number = @page_number,
                        position_x = @position_x,
                        position_y = @position_y,
                        box_width = @box_width,
                        box_height = @box_height,
                        annotation_text = @annotation_text,
                        source_version = @source_version,
                        updated_by = @updated_by,
                        updated_at = GETDATE()
                    WHERE id = @id
                `);

                keptIds.add(maybeId);
                updatedCount += 1;
                await this.insertAnnotationAuditLog(transaction, {
                    annotation_id: maybeId,
                    approval_id: approvalId,
                    filename: normalizedFilename,
                    action: 'updated',
                    user_id: userId,
                    user_name: userName,
                    ip_address: ipAddress,
                    details: JSON.stringify({
                        page_number: pageNumber,
                        position_x: positionX,
                        position_y: positionY,
                        box_width: boxWidth,
                        box_height: boxHeight,
                    }),
                });
                continue;
            }

            const insReq = new sql.Request(transaction);
            insReq.input('approval_id', sql.Int, approvalId);
            insReq.input('filename', sql.NVarChar(500), normalizedFilename);
            insReq.input('annotation_type', sql.NVarChar(20), annotationType);
            insReq.input('page_number', sql.Int, pageNumber);
            insReq.input('position_x', sql.Float, positionX);
            insReq.input('position_y', sql.Float, positionY);
            insReq.input('box_width', sql.Float, boxWidth);
            insReq.input('box_height', sql.Float, boxHeight);
            insReq.input('annotation_text', sql.NVarChar(sql.MAX), annotationText);
            insReq.input('source_version', sql.Int, currentVersion);
            insReq.input('created_by', sql.NVarChar(100), userId);

            const insResult = await insReq.query(`
                INSERT INTO document_annotations
                    (approval_id, filename, annotation_type, page_number,
                     position_x, position_y, box_width, box_height,
                     annotation_text, source_version, created_by)
                OUTPUT INSERTED.id
                VALUES
                    (@approval_id, @filename, @annotation_type, @page_number,
                     @position_x, @position_y, @box_width, @box_height,
                     @annotation_text, @source_version, @created_by)
            `);

            const insertedId = Number(insResult.recordset?.[0]?.id);
            if (insertedId) keptIds.add(insertedId);
            createdCount += 1;
            await this.insertAnnotationAuditLog(transaction, {
                annotation_id: insertedId || null,
                approval_id: approvalId,
                filename: normalizedFilename,
                action: 'created',
                user_id: userId,
                user_name: userName,
                ip_address: ipAddress,
                details: JSON.stringify({
                    page_number: pageNumber,
                    position_x: positionX,
                    position_y: positionY,
                    box_width: boxWidth,
                    box_height: boxHeight,
                }),
            });
        }

        for (const existingId of existingIdSet) {
            if (keptIds.has(existingId)) continue;
            const delReq = new sql.Request(transaction);
            delReq.input('id', sql.Int, existingId);
            delReq.input('updated_by', sql.NVarChar(100), userId);
            await delReq.query(`
                UPDATE document_annotations
                SET status = 'deleted', updated_by = @updated_by, updated_at = GETDATE()
                WHERE id = @id
            `);

            deletedCount += 1;
            await this.insertAnnotationAuditLog(transaction, {
                annotation_id: existingId,
                approval_id: approvalId,
                filename: normalizedFilename,
                action: 'deleted',
                user_id: userId,
                user_name: userName,
                ip_address: ipAddress,
                details: null,
            });
        }

        await this.insertAnnotationAuditLog(transaction, {
            annotation_id: null,
            approval_id: approvalId,
            filename: normalizedFilename,
            action: 'batch_saved',
            user_id: userId,
            user_name: userName,
            ip_address: ipAddress,
            details: JSON.stringify({
                created: createdCount,
                updated: updatedCount,
                deleted: deletedCount,
                total_sent: incoming.length,
            }),
        });

        return this.getAnnotationsByApproval(transaction, approvalId, normalizedFilename, currentVersion);
    }
}
