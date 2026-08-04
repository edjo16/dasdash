-- ─────────────────────────────────────────────────────────────
-- user_table_prefs — per-user, per-module UI preferences (JSON)
-- Reference script: the app auto-creates this table on first use
-- (see USERS/model/UserPrefs.js), so running this manually is optional.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'user_table_prefs')
BEGIN
    CREATE TABLE user_table_prefs (
        utp_id      INT IDENTITY(1,1) PRIMARY KEY,
        user_id     VARCHAR(50)  NOT NULL,
        module      VARCHAR(50)  NOT NULL,        -- e.g. 'badaco_contacts'
        prefs       NVARCHAR(MAX) NOT NULL,       -- JSON: {"columns":["company","name",...]}
        fingreso    DATETIME DEFAULT GETDATE(),
        fmodificado DATETIME DEFAULT GETDATE(),
        CONSTRAINT UQ_user_table_prefs UNIQUE (user_id, module)
    );
END
