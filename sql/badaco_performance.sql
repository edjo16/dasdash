-- ═══════════════════════════════════════════════════════════════════════
-- BADACO — índices y estadísticas
--
-- Script IDEMPOTENTE: se puede correr las veces que haga falta, sólo crea
-- lo que no existe. Ejecutar sobre la base de datos de la aplicación
-- (la de `DB_NAME`, normalmente `approvals`).
--
-- Por qué: la lista de contactos filtra, ordena y pagina sobre
-- `badaco_contactos` y une cuatro catálogos. Sin índices cada consulta es
-- un scan completo de la tabla más un hash join de cada catálogo, y el
-- coste crece de forma lineal con el número de contactos.
--
-- Recomendado ejecutarlo en una ventana de baja actividad: la creación de
-- un índice bloquea la tabla (salvo en Enterprise, donde puede añadirse
-- WITH (ONLINE = ON) a cada CREATE INDEX).
--
-- Convención de nombres: IX_<tabla>_<columnas>.
-- ═══════════════════════════════════════════════════════════════════════
SET NOCOUNT ON;

-- ───────────────────────────────────────────────────────────────────────
-- 1. badaco_contactos — tabla principal
-- ───────────────────────────────────────────────────────────────────────

-- 1.1 Clave primaria agrupada (contact_id).
--     Es la base de todo: la lista ordena y pagina por contact_id
--     (ORDER BY ... OFFSET/FETCH) y las pantallas de detalle buscan por id.
--     Sobre un heap ambas cosas obligan a leer la tabla entera.
IF OBJECT_ID('dbo.badaco_contactos', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE object_id = OBJECT_ID('dbo.badaco_contactos') AND index_id = 1)
   AND NOT EXISTS (SELECT 1 FROM sys.key_constraints
                   WHERE parent_object_id = OBJECT_ID('dbo.badaco_contactos') AND type = 'PK')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.badaco_contactos')
                 AND name = 'contact_id' AND is_nullable = 0)
    BEGIN
        ALTER TABLE dbo.badaco_contactos
            ADD CONSTRAINT PK_badaco_contactos PRIMARY KEY CLUSTERED (contact_id);
        PRINT 'OK  PK_badaco_contactos (clustered)';
    END
    ELSE
        PRINT 'AVISO: badaco_contactos.contact_id admite NULL — no se puede crear la PK. Revisar los datos primero.';
END

-- 1.2 Empresa: el filtro más usado de la lista y el JOIN con badaco_mcompany.
--     El INCLUDE cubre las columnas que pinta la tabla, así el filtro por
--     empresa se resuelve sin volver a la tabla base.
IF OBJECT_ID('dbo.badaco_contactos', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = 'IX_badaco_contactos_bmc_id'
                     AND object_id = OBJECT_ID('dbo.badaco_contactos'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_badaco_contactos_bmc_id
        ON dbo.badaco_contactos (bmc_id)
        INCLUDE (name, email, job_title, bmjl_id, country, contact_rl_id, event);
    PRINT 'OK  IX_badaco_contactos_bmc_id';
END

-- 1.3 Email: control de duplicados (checkEmailExists) y la validación por
--     lotes de la herramienta de tarjetas (findContactsByEmails).
--     NO se crea UNIQUE a propósito: puede haber correos vacíos/repetidos
--     históricos y el script fallaría. Ver la nota del final.
IF OBJECT_ID('dbo.badaco_contactos', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = 'IX_badaco_contactos_email'
                     AND object_id = OBJECT_ID('dbo.badaco_contactos'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_badaco_contactos_email
        ON dbo.badaco_contactos (email)
        INCLUDE (name, bmc_id);
    PRINT 'OK  IX_badaco_contactos_email';
END

-- 1.4 Nombre: ORDER BY de los selectores y, sobre todo, hace que la
--     búsqueda LIKE '%texto%' recorra un índice estrecho en vez de la
--     tabla completa (menos páginas leídas por búsqueda).
IF OBJECT_ID('dbo.badaco_contactos', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = 'IX_badaco_contactos_name'
                     AND object_id = OBJECT_ID('dbo.badaco_contactos'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_badaco_contactos_name
        ON dbo.badaco_contactos (name)
        INCLUDE (email, job_title, bmc_id);
    PRINT 'OK  IX_badaco_contactos_name';
END

-- 1.5 Resto de filtros de la barra (job level, país, relación, evento).
--     Son columnas de baja cardinalidad: el optimizador no siempre los
--     usará, pero cuando el filtro es selectivo (un evento concreto)
--     convierten un scan en un seek. La tabla es de lectura intensiva y
--     escritura escasa, así que el coste de mantenerlos es despreciable.
IF OBJECT_ID('dbo.badaco_contactos', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = 'IX_badaco_contactos_bmjl_id'
                     AND object_id = OBJECT_ID('dbo.badaco_contactos'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_badaco_contactos_bmjl_id
        ON dbo.badaco_contactos (bmjl_id) INCLUDE (bmc_id, name);
    PRINT 'OK  IX_badaco_contactos_bmjl_id';
END

IF OBJECT_ID('dbo.badaco_contactos', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = 'IX_badaco_contactos_country'
                     AND object_id = OBJECT_ID('dbo.badaco_contactos'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_badaco_contactos_country
        ON dbo.badaco_contactos (country) INCLUDE (bmc_id, name);
    PRINT 'OK  IX_badaco_contactos_country';
END

IF OBJECT_ID('dbo.badaco_contactos', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = 'IX_badaco_contactos_contact_rl_id'
                     AND object_id = OBJECT_ID('dbo.badaco_contactos'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_badaco_contactos_contact_rl_id
        ON dbo.badaco_contactos (contact_rl_id) INCLUDE (bmc_id, name);
    PRINT 'OK  IX_badaco_contactos_contact_rl_id';
END

IF OBJECT_ID('dbo.badaco_contactos', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = 'IX_badaco_contactos_event'
                     AND object_id = OBJECT_ID('dbo.badaco_contactos'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_badaco_contactos_event
        ON dbo.badaco_contactos (event) INCLUDE (bmc_id, name);
    PRINT 'OK  IX_badaco_contactos_event';
END

-- ───────────────────────────────────────────────────────────────────────
-- 2. badaco_activere_contactos — colaboradores asignados a cada contacto
--    Sin este índice, resolver la columna "Contact Active Re" obliga a
--    recorrer la tabla entera por cada página de la lista.
-- ───────────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.badaco_activere_contactos', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = 'IX_badaco_activere_contactos_contact_id'
                     AND object_id = OBJECT_ID('dbo.badaco_activere_contactos'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_badaco_activere_contactos_contact_id
        ON dbo.badaco_activere_contactos (contact_id) INCLUDE (contact);
    PRINT 'OK  IX_badaco_activere_contactos_contact_id';
END

-- ───────────────────────────────────────────────────────────────────────
-- 3. Catálogos — el lado "uno" de cada JOIN
--    Con PK, cada JOIN es un seek por fila devuelta; sin ella, SQL Server
--    lee el catálogo completo en memoria en cada consulta.
-- ───────────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.badaco_mcompany', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE object_id = OBJECT_ID('dbo.badaco_mcompany') AND index_id = 1)
   AND NOT EXISTS (SELECT 1 FROM sys.key_constraints
                   WHERE parent_object_id = OBJECT_ID('dbo.badaco_mcompany') AND type = 'PK')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.badaco_mcompany')
                 AND name = 'bmc_id' AND is_nullable = 0)
    BEGIN
        ALTER TABLE dbo.badaco_mcompany
            ADD CONSTRAINT PK_badaco_mcompany PRIMARY KEY CLUSTERED (bmc_id);
        PRINT 'OK  PK_badaco_mcompany (clustered)';
    END
    ELSE
        PRINT 'AVISO: badaco_mcompany.bmc_id admite NULL — no se puede crear la PK.';
END

-- Nombre: ORDER BY nombre de los selectores y la búsqueda por empresa.
IF OBJECT_ID('dbo.badaco_mcompany', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = 'IX_badaco_mcompany_nombre'
                     AND object_id = OBJECT_ID('dbo.badaco_mcompany'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_badaco_mcompany_nombre
        ON dbo.badaco_mcompany (nombre) INCLUDE (pais, bmrl_id);
    PRINT 'OK  IX_badaco_mcompany_nombre';
END

IF OBJECT_ID('dbo.badaco_mcompany', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = 'IX_badaco_mcompany_pais'
                     AND object_id = OBJECT_ID('dbo.badaco_mcompany'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_badaco_mcompany_pais
        ON dbo.badaco_mcompany (pais) INCLUDE (nombre);
    PRINT 'OK  IX_badaco_mcompany_pais';
END

IF OBJECT_ID('dbo.badaco_mjoblevel', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE object_id = OBJECT_ID('dbo.badaco_mjoblevel') AND index_id = 1)
   AND NOT EXISTS (SELECT 1 FROM sys.key_constraints
                   WHERE parent_object_id = OBJECT_ID('dbo.badaco_mjoblevel') AND type = 'PK')
   AND EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.badaco_mjoblevel')
                 AND name = 'bmjl_id' AND is_nullable = 0)
BEGIN
    ALTER TABLE dbo.badaco_mjoblevel
        ADD CONSTRAINT PK_badaco_mjoblevel PRIMARY KEY CLUSTERED (bmjl_id);
    PRINT 'OK  PK_badaco_mjoblevel (clustered)';
END

IF OBJECT_ID('dbo.badaco_mrelationship', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE object_id = OBJECT_ID('dbo.badaco_mrelationship') AND index_id = 1)
   AND NOT EXISTS (SELECT 1 FROM sys.key_constraints
                   WHERE parent_object_id = OBJECT_ID('dbo.badaco_mrelationship') AND type = 'PK')
   AND EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.badaco_mrelationship')
                 AND name = 'bmrl_id' AND is_nullable = 0)
BEGIN
    ALTER TABLE dbo.badaco_mrelationship
        ADD CONSTRAINT PK_badaco_mrelationship PRIMARY KEY CLUSTERED (bmrl_id);
    PRINT 'OK  PK_badaco_mrelationship (clustered)';
END

-- m_pais es un maestro compartido con otros módulos: aquí sólo se añade un
-- índice NO agrupado (no se toca su estructura). Se une dos veces por
-- consulta (país del contacto y país de la empresa).
IF OBJECT_ID('dbo.m_pais', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = 'IX_m_pais_cpais'
                     AND object_id = OBJECT_ID('dbo.m_pais'))
   AND NOT EXISTS (SELECT 1 FROM sys.index_columns ic
                   JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                   JOIN sys.columns  c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                   WHERE ic.object_id = OBJECT_ID('dbo.m_pais')
                     AND c.name = 'cpais' AND ic.key_ordinal = 1)
BEGIN
    CREATE NONCLUSTERED INDEX IX_m_pais_cpais
        ON dbo.m_pais (cpais) INCLUDE (xnombre_pais_ingles, xnombre_continente_ingles);
    PRINT 'OK  IX_m_pais_cpais';
END

-- ───────────────────────────────────────────────────────────────────────
-- 4. card_files — imágenes de tarjetas (ver sql/card_files.sql)
-- ───────────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.card_files', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = 'IX_card_files_contact'
                     AND object_id = OBJECT_ID('dbo.card_files'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_card_files_contact ON dbo.card_files (contact_id);
    PRINT 'OK  IX_card_files_contact';
END

-- ───────────────────────────────────────────────────────────────────────
-- 5. Estadísticas al día: sin ellas el optimizador puede seguir eligiendo
--    un scan aunque el índice exista.
-- ───────────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.badaco_contactos', 'U') IS NOT NULL
    UPDATE STATISTICS dbo.badaco_contactos WITH FULLSCAN;
IF OBJECT_ID('dbo.badaco_mcompany', 'U') IS NOT NULL
    UPDATE STATISTICS dbo.badaco_mcompany WITH FULLSCAN;
IF OBJECT_ID('dbo.badaco_activere_contactos', 'U') IS NOT NULL
    UPDATE STATISTICS dbo.badaco_activere_contactos WITH FULLSCAN;
PRINT 'OK  Estadísticas actualizadas';

-- ═══════════════════════════════════════════════════════════════════════
-- NOTAS / SIGUIENTES PASOS (no se ejecutan solos)
-- ═══════════════════════════════════════════════════════════════════════
--
-- a) Email único. Cuando los datos estén limpios, esto convierte el
--    control de duplicados en una garantía del motor (hoy es sólo una
--    comprobación de la aplicación, y dos altas simultáneas pueden colarse):
--
--      -- 1) ver qué habría que arreglar antes:
--      SELECT email, COUNT(*) FROM dbo.badaco_contactos
--      WHERE email IS NOT NULL AND email <> ''
--      GROUP BY email HAVING COUNT(*) > 1;
--
--      -- 2) índice único filtrado (permite varios NULL/vacíos):
--      CREATE UNIQUE NONCLUSTERED INDEX UX_badaco_contactos_email
--          ON dbo.badaco_contactos (email)
--          WHERE email IS NOT NULL AND email <> '';
--
-- b) Búsqueda de texto. `LIKE '%texto%'` nunca puede usar un índice para
--    posicionarse: siempre recorre. Con los índices de arriba el recorrido
--    es sobre índices estrechos y aguanta bien, pero a partir de unos
--    cientos de miles de contactos conviene full-text:
--
--      CREATE FULLTEXT CATALOG badaco_ft AS DEFAULT;
--      CREATE FULLTEXT INDEX ON dbo.badaco_contactos (name, email, job_title)
--          KEY INDEX PK_badaco_contactos WITH STOPLIST = SYSTEM;
--      -- y en el modelo, cambiar el LIKE por CONTAINS(...)
--
-- c) Claves foráneas. No se crean aquí porque fallarían con datos
--    históricos huérfanos. Cuando se pueda, dan integridad y ayudan al
--    optimizador:
--
--      SELECT COUNT(*) FROM dbo.badaco_contactos c
--      LEFT JOIN dbo.badaco_mcompany m ON m.bmc_id = c.bmc_id
--      WHERE c.bmc_id IS NOT NULL AND m.bmc_id IS NULL;   -- debe dar 0
--
-- d) Mantenimiento: reorganizar/reconstruir índices y actualizar
--    estadísticas periódicamente (job semanal).
-- ═══════════════════════════════════════════════════════════════════════
