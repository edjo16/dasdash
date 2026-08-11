/* ============================================================
   CRM — Document translations
   ------------------------------------------------------------
   Guarda las traducciones generadas para los archivos de un caso
   de CRM. A diferencia de APPROVALS, en CRM un archivo cuelga de
   un mensaje concreto, por lo que la clave natural es
   (crm_id, msg_id, source_filename, target_lang, version).

   El PDF resultante se escribe en la MISMA carpeta del archivo
   original, es decir \\{server_1}\CRM\{crm_id}\{msg_id}\, de forma
   que viaja junto al caso cuando se copian los directorios.

   Tablas separadas de `approval_translations` siguiendo el mismo
   criterio que ya usan `crm_document_versions` y `crm_audit_log`.
   ============================================================ */

IF OBJECT_ID('dbo.crm_translations', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.crm_translations (
        id                  INT IDENTITY(1,1) NOT NULL,
        crm_id              INT               NOT NULL,
        msg_id              INT               NOT NULL,
        source_filename     NVARCHAR(500)     NOT NULL,
        target_lang         NVARCHAR(20)      NOT NULL,
        source_lang         NVARCHAR(20)      NULL,
        version             INT               NOT NULL CONSTRAINT DF_crm_translations_version DEFAULT (1),
        translated_filename NVARCHAR(500)     NULL,
        file_path           NVARCHAR(1000)    NULL,
        file_hash           NVARCHAR(128)     NULL,
        page_count          INT               NULL,
        char_count          INT               NULL,
        extraction_method   NVARCHAR(20)      NULL,
        status              NVARCHAR(20)      NOT NULL CONSTRAINT DF_crm_translations_status DEFAULT ('pending'),
        error_message       NVARCHAR(1000)    NULL,
        created_by          NVARCHAR(100)     NULL,
        created_by_name     NVARCHAR(200)     NULL,
        created_at          DATETIME          NOT NULL CONSTRAINT DF_crm_translations_created DEFAULT (GETDATE()),
        started_at          DATETIME          NULL,
        completed_at        DATETIME          NULL,
        CONSTRAINT PK_crm_translations PRIMARY KEY CLUSTERED (id),
        CONSTRAINT CK_crm_translations_status
            CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
    );
END
GO

/* Busqueda principal: traducciones de un archivo dentro de un mensaje. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_crm_translations_file')
BEGIN
    CREATE NONCLUSTERED INDEX IX_crm_translations_file
        ON dbo.crm_translations (crm_id, msg_id, source_filename)
        INCLUDE (target_lang, version, status, translated_filename, created_at);
END
GO

/* Contadores para pintar los botones de todo el caso de una sola consulta. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_crm_translations_case')
BEGIN
    CREATE NONCLUSTERED INDEX IX_crm_translations_case
        ON dbo.crm_translations (crm_id, status)
        INCLUDE (msg_id, source_filename);
END
GO

/* Cola de trabajos pendientes (job runner). */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_crm_translations_status')
BEGIN
    CREATE NONCLUSTERED INDEX IX_crm_translations_status
        ON dbo.crm_translations (status, created_at);
END
GO

/* ------------------------------------------------------------
   Auditoria de traducciones (quien genero/descargo/elimino que).
   Separada de la tabla principal para no mezclar el estado del
   job con el rastro de auditoria.
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.crm_translation_audit_log', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.crm_translation_audit_log (
        id              INT IDENTITY(1,1) NOT NULL,
        translation_id  INT               NULL,
        crm_id          INT               NOT NULL,
        msg_id          INT               NOT NULL,
        source_filename NVARCHAR(500)     NOT NULL,
        action          NVARCHAR(50)      NOT NULL,
        user_id         NVARCHAR(100)     NULL,
        user_name       NVARCHAR(200)     NULL,
        ip_address      NVARCHAR(64)      NULL,
        details         NVARCHAR(1000)    NULL,
        created_at      DATETIME          NOT NULL CONSTRAINT DF_crm_translation_audit_created DEFAULT (GETDATE()),
        CONSTRAINT PK_crm_translation_audit_log PRIMARY KEY CLUSTERED (id)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_crm_translation_audit_case')
BEGIN
    CREATE NONCLUSTERED INDEX IX_crm_translation_audit_case
        ON dbo.crm_translation_audit_log (crm_id, msg_id, source_filename, created_at DESC);
END
GO
