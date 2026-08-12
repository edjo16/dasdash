
/* ============================================================
   TRANSLATIONS — Preview antes de generar el documento
   ------------------------------------------------------------
   Parte el job de traduccion en dos etapas para que el usuario
   revise (y corrija) el texto antes de que se escriba un PDF
   junto al expediente:

       pending -> processing -> translated  (texto listo, sin archivo)
                                     |
                                     +--> completed (PDF generado)

   `translated` es un estado terminal para el motor de background:
   el job ya no consume CPU ni llamadas a la IA. El paso a

   
   `completed` lo dispara el usuario desde la UI, y es barato
   (solo composicion del PDF con pdf-lib).

   Migracion idempotente: se puede ejecutar varias veces.
   Aplica a las dos colas (approvals y CRM).
   ============================================================ */

/* ── APPROVALS ─────────────────────────────────────────────── */

IF COL_LENGTH('dbo.approval_translations', 'translated_text') IS NULL
BEGIN
    ALTER TABLE dbo.approval_translations ADD translated_text NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('dbo.approval_translations', 'preview_ready_at') IS NULL
BEGIN
    ALTER TABLE dbo.approval_translations ADD preview_ready_at DATETIME NULL;
END
GO

/* El CHECK original no contempla 'translated': hay que rehacerlo. */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_approval_translations_status')
BEGIN
    ALTER TABLE dbo.approval_translations DROP CONSTRAINT CK_approval_translations_status;
END
GO

ALTER TABLE dbo.approval_translations WITH NOCHECK
    ADD CONSTRAINT CK_approval_translations_status
    CHECK (status IN ('pending', 'processing', 'translated', 'completed', 'failed', 'cancelled'));
GO

/* ── CRM ───────────────────────────────────────────────────── */

IF COL_LENGTH('dbo.crm_translations', 'translated_text') IS NULL
BEGIN
    ALTER TABLE dbo.crm_translations ADD translated_text NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('dbo.crm_translations', 'preview_ready_at') IS NULL
BEGIN
    ALTER TABLE dbo.crm_translations ADD preview_ready_at DATETIME NULL;
END
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_crm_translations_status')
BEGIN
    ALTER TABLE dbo.crm_translations DROP CONSTRAINT CK_crm_translations_status;
END
GO

ALTER TABLE dbo.crm_translations WITH NOCHECK
    ADD CONSTRAINT CK_crm_translations_status
    CHECK (status IN ('pending', 'processing', 'translated', 'completed', 'failed', 'cancelled'));
GO
