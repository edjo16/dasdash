import sql from 'mssql';

/**
 * Generic per-user, per-module UI preferences stored as JSON.
 * Table auto-creates on first use (reference script: sql/user_table_prefs.sql).
 */
export default class UserPrefsModel {
    static _tableEnsured = false;

    static async ensureTable(pool) {
        if (UserPrefsModel._tableEnsured) return;
        const request = new sql.Request(pool);
        await request.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'user_table_prefs')
            BEGIN
                CREATE TABLE user_table_prefs (
                    utp_id      INT IDENTITY(1,1) PRIMARY KEY,
                    user_id     VARCHAR(50)  NOT NULL,
                    module      VARCHAR(50)  NOT NULL,
                    prefs       NVARCHAR(MAX) NOT NULL,
                    fingreso    DATETIME DEFAULT GETDATE(),
                    fmodificado DATETIME DEFAULT GETDATE(),
                    CONSTRAINT UQ_user_table_prefs UNIQUE (user_id, module)
                );
            END
        `);
        UserPrefsModel._tableEnsured = true;
    }

    /**
     * Returns the parsed prefs object for a user/module, or null if none saved.
     */
    static async getPrefs(pool, userId, module) {
        await UserPrefsModel.ensureTable(pool);
        const request = new sql.Request(pool);
        request.input('user_id', sql.VarChar, String(userId));
        request.input('module', sql.VarChar, module);
        const { recordset } = await request.query(`
            SELECT prefs FROM user_table_prefs
            WHERE user_id = @user_id AND module = @module
        `);
        if (!recordset.length) return null;
        try {
            return JSON.parse(recordset[0].prefs);
        } catch (_) {
            return null;
        }
    }

    /**
     * Upserts the prefs object (stored as JSON) for a user/module.
     */
    static async savePrefs(pool, userId, module, prefs) {
        await UserPrefsModel.ensureTable(pool);
        const request = new sql.Request(pool);
        request.input('user_id', sql.VarChar, String(userId));
        request.input('module', sql.VarChar, module);
        request.input('prefs', sql.NVarChar, JSON.stringify(prefs));
        await request.query(`
            MERGE user_table_prefs AS target
            USING (SELECT @user_id AS user_id, @module AS module) AS src
                ON target.user_id = src.user_id AND target.module = src.module
            WHEN MATCHED THEN
                UPDATE SET prefs = @prefs, fmodificado = GETDATE()
            WHEN NOT MATCHED THEN
                INSERT (user_id, module, prefs) VALUES (@user_id, @module, @prefs);
        `);
    }
}
