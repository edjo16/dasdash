/**
 * Modelo de `card_files`: relación entre un contacto de BADACO y la imagen de
 * la tarjeta de presentación con la que se creó.
 *
 * El archivo vive en el servidor de archivos (//<DB_SERVER>/BADACO/<cf_id>/),
 * no en la base de datos: aquí sólo se guarda el nombre, la ruta ya resuelta y
 * el estado. La escritura en disco la hace `Tools/services/card-storage.js`.
 *
 * La tabla se crea sola en el primer uso, igual que `user_table_prefs`
 * (script de referencia: sql/card_files.sql).
 */
import sql from 'mssql';

export default class CardFilesModel {
    static _tableEnsured = false;

    static async ensureTable(pool) {
        if (CardFilesModel._tableEnsured) return;
        const request = new sql.Request(pool);
        await request.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'card_files')
            BEGIN
                CREATE TABLE card_files (
                    cf_id      INT IDENTITY(1,1) PRIMARY KEY,
                    contact_id INT           NOT NULL,
                    side       VARCHAR(10)   NOT NULL DEFAULT 'front',
                    file_name  NVARCHAR(255) NOT NULL,
                    file_path  NVARCHAR(500) NULL,
                    mime_type  VARCHAR(100)  NULL,
                    file_size  INT           NULL,
                    status     VARCHAR(20)   NOT NULL DEFAULT 'pending',
                    fingreso   DATETIME      DEFAULT GETDATE(),
                    uingreso   VARCHAR(50)   NULL
                );

                CREATE INDEX IX_card_files_contact ON card_files (contact_id);
            END
        `);
        CardFilesModel._tableEnsured = true;
    }

    /**
     * Reserva la fila (estado `pending`) y devuelve su id. El id es el nombre
     * de la carpeta donde se escribirá el archivo, así que se inserta ANTES de
     * tocar el disco.
     */
    static async create(pool, data) {
        await CardFilesModel.ensureTable(pool);
        const request = new sql.Request(pool);
        request.input('contact_id', sql.Int, data.contact_id);
        request.input('side', sql.VarChar(10), data.side || 'front');
        request.input('file_name', sql.NVarChar(255), data.file_name);
        request.input('mime_type', sql.VarChar(100), data.mime_type || null);
        request.input('file_size', sql.Int, data.file_size || null);
        request.input('uingreso', sql.VarChar(50), data.uingreso == null ? null : String(data.uingreso));

        const { recordset } = await request.query(`
            INSERT INTO card_files (contact_id, side, file_name, mime_type, file_size, status, fingreso, uingreso)
            VALUES (@contact_id, @side, @file_name, @mime_type, @file_size, 'pending', GETDATE(), @uingreso);
            SELECT SCOPE_IDENTITY() AS cf_id;
        `);
        return recordset[0].cf_id;
    }

    /** Confirma que el archivo quedó escrito en `filePath`. */
    static async markStored(pool, cfId, filePath) {
        const request = new sql.Request(pool);
        request.input('cf_id', sql.Int, cfId);
        request.input('file_path', sql.NVarChar(500), filePath);
        await request.query(`
            UPDATE card_files SET file_path = @file_path, status = 'stored' WHERE cf_id = @cf_id
        `);
    }

    /** Borra la fila reservada cuando la escritura en disco falló. */
    static async remove(pool, cfId) {
        const request = new sql.Request(pool);
        request.input('cf_id', sql.Int, cfId);
        await request.query('DELETE FROM card_files WHERE cf_id = @cf_id');
    }

    static async getById(pool, cfId) {
        await CardFilesModel.ensureTable(pool);
        const request = new sql.Request(pool);
        request.input('cf_id', sql.Int, cfId);
        const { recordset } = await request.query('SELECT * FROM card_files WHERE cf_id = @cf_id');
        return recordset[0] || null;
    }

    /** Imágenes de un contacto, en el orden en que se guardaron. */
    static async listByContact(pool, contactId) {
        await CardFilesModel.ensureTable(pool);
        const request = new sql.Request(pool);
        request.input('contact_id', sql.Int, contactId);
        const { recordset } = await request.query(`
            SELECT cf_id, contact_id, side, file_name, file_path, mime_type, file_size, status, fingreso, uingreso
            FROM card_files
            WHERE contact_id = @contact_id
            ORDER BY cf_id ASC
        `);
        return recordset;
    }
}
