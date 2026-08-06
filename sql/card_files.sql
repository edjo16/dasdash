-- ─────────────────────────────────────────────────────────────
-- card_files — imagen de la tarjeta de presentación con la que se
-- creó un contacto de BADACO.
--
-- El archivo NO se guarda en la base de datos: se escribe en
--   //<DB_SERVER>/BADACO/<cf_id>/<file_name>
-- (la carpeta es el id de la propia fila) y aquí queda la relación
-- contacto <-> imagen.
--
-- Script de referencia: la app crea la tabla en el primer uso
-- (ver Tools/models/card-files.js), así que ejecutarlo es opcional.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'card_files')
BEGIN
    CREATE TABLE card_files (
        cf_id      INT IDENTITY(1,1) PRIMARY KEY,
        contact_id INT           NOT NULL,              -- badaco_contactos.contact_id
        side       VARCHAR(10)   NOT NULL DEFAULT 'front', -- front | back
        file_name  NVARCHAR(255) NOT NULL,
        file_path  NVARCHAR(500) NULL,                  -- ruta completa ya resuelta
        mime_type  VARCHAR(100)  NULL,
        file_size  INT           NULL,
        status     VARCHAR(20)   NOT NULL DEFAULT 'pending', -- pending | stored
        fingreso   DATETIME      DEFAULT GETDATE(),
        uingreso   VARCHAR(50)   NULL
    );

    CREATE INDEX IX_card_files_contact ON card_files (contact_id);
END
