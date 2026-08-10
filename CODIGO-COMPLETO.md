# Traducción de documentos en Approvals — código completo

Todo el código de la funcionalidad, listo para copiar y pegar.

- **Parte 1 — Archivos nuevos (9):** crea cada archivo en la ruta indicada y pega el bloque completo.
- **Parte 2 — Archivos existentes (6):** solo hay que insertar fragmentos; cada uno indica dónde.

Rama de referencia: `feature/approval-document-translations` · commit `bad6d4c`

---

## Índice

### Parte 1 — Archivos nuevos
1. `sql/approval_translations.sql`
2. `Approvals_functions/models/translations.js`
3. `Approvals_functions/services/translation-fonts.js`
4. `Approvals_functions/services/translation-pdf-service.js`
5. `Approvals_functions/services/translation-job-runner.js`
6. `Approvals_functions/controllers/approval_translations.js`
7. `public/js/approval-translations.js`
8. `public/css/approval-translations.css`
9. `Approvals_functions/TRANSLATIONS.md`

### Parte 2 — Ediciones a archivos existentes
10. `Approvals.js`
11. `APPROVALS/routes/approvals-routes.js`
12. `Approvals_functions/controllers/approval_functions.js`
13. `public/scripts.js`
14. `views/layout.pug`
15. `package.json`

---

# Parte 1 — Archivos nuevos

Estos se crean desde cero. No hay riesgo de conflicto con tu código.


## 1. `sql/approval_translations.sql`

```sql
/* ============================================================
   APPROVALS — Document translations
   ------------------------------------------------------------
   Guarda las traducciones generadas para los archivos de un
   approval. Un mismo archivo puede tener N traducciones (una por
   idioma destino y/o por reintento), por eso la clave natural es
   (approval_id, source_filename, target_lang, version).

   El PDF resultante se escribe en la MISMA carpeta del archivo
   original (resuelta por approval-file-routing.js), de forma que
   viaja junto al expediente cuando se copian los directorios.

   Sigue el patron de `document_versions` (digital_signatures).
   ============================================================ */

IF OBJECT_ID('dbo.approval_translations', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.approval_translations (
        id                  INT IDENTITY(1,1) NOT NULL,
        approval_id         INT               NOT NULL,
        source_filename     NVARCHAR(500)     NOT NULL,
        target_lang         NVARCHAR(20)      NOT NULL,
        source_lang         NVARCHAR(20)      NULL,
        version             INT               NOT NULL CONSTRAINT DF_approval_translations_version DEFAULT (1),
        translated_filename NVARCHAR(500)     NULL,
        file_path           NVARCHAR(1000)    NULL,
        file_hash           NVARCHAR(128)     NULL,
        page_count          INT               NULL,
        char_count          INT               NULL,
        extraction_method   NVARCHAR(20)      NULL,
        status              NVARCHAR(20)      NOT NULL CONSTRAINT DF_approval_translations_status DEFAULT ('pending'),
        error_message       NVARCHAR(1000)    NULL,
        created_by          NVARCHAR(100)     NULL,
        created_by_name     NVARCHAR(200)     NULL,
        created_at          DATETIME          NOT NULL CONSTRAINT DF_approval_translations_created DEFAULT (GETDATE()),
        started_at          DATETIME          NULL,
        completed_at        DATETIME          NULL,
        CONSTRAINT PK_approval_translations PRIMARY KEY CLUSTERED (id),
        CONSTRAINT CK_approval_translations_status
            CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
    );
END
GO

/* Busqueda principal: traducciones de un archivo dentro de un approval. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_approval_translations_file')
BEGIN
    CREATE NONCLUSTERED INDEX IX_approval_translations_file
        ON dbo.approval_translations (approval_id, source_filename)
        INCLUDE (target_lang, version, status, translated_filename, created_at);
END
GO

/* Cola de trabajos pendientes (job runner). */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_approval_translations_status')
BEGIN
    CREATE NONCLUSTERED INDEX IX_approval_translations_status
        ON dbo.approval_translations (status, created_at);
END
GO

/* ------------------------------------------------------------
   Auditoria de traducciones (quien genero/descargo/elimino que).
   Separada de la tabla principal para no mezclar el estado del
   job con el rastro de auditoria.
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.approval_translation_audit_log', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.approval_translation_audit_log (
        id              INT IDENTITY(1,1) NOT NULL,
        translation_id  INT               NULL,
        approval_id     INT               NOT NULL,
        source_filename NVARCHAR(500)     NOT NULL,
        action          NVARCHAR(50)      NOT NULL,
        user_id         NVARCHAR(100)     NULL,
        user_name       NVARCHAR(200)     NULL,
        ip_address      NVARCHAR(64)      NULL,
        details         NVARCHAR(1000)    NULL,
        created_at      DATETIME          NOT NULL CONSTRAINT DF_approval_translation_audit_created DEFAULT (GETDATE()),
        CONSTRAINT PK_approval_translation_audit_log PRIMARY KEY CLUSTERED (id)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_approval_translation_audit_approval')
BEGIN
    CREATE NONCLUSTERED INDEX IX_approval_translation_audit_approval
        ON dbo.approval_translation_audit_log (approval_id, source_filename, created_at DESC);
END
GO
```

---

## 2. `Approvals_functions/models/translations.js`

```javascript
/* ============================================================
   APPROVALS — Translations model
   ------------------------------------------------------------
   Unica capa que conoce las tablas `approval_translations` y
   `approval_translation_audit_log`. No resuelve rutas, no genera
   PDFs y no valida permisos: eso vive en el servicio/controlador.
   ============================================================ */
import sql from 'mssql';

/** Estados posibles de un job de traduccion. */
export const TRANSLATION_STATUS = Object.freeze({
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
});

const SELECT_COLUMNS = `
    id, approval_id, source_filename, target_lang, source_lang, version,
    translated_filename, file_path, file_hash, page_count, char_count,
    extraction_method, status, error_message, created_by, created_by_name,
    created_at, started_at, completed_at
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

    /**
     * Conteo por archivo para pintar los botones de la lista de archivos
     * sin hacer una consulta por cada uno.
     */
    static async countByApproval(transaction, approvalId) {
        const request = new sql.Request(transaction);
        request.input('approval_id', sql.Int, approvalId);
        const result = await request.query(`
            SELECT
                source_filename,
                SUM(CASE WHEN status = '${TRANSLATION_STATUS.COMPLETED}' THEN 1 ELSE 0 END) AS completed_count,
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
```

---

## 3. `Approvals_functions/services/translation-fonts.js`

```javascript
/* ============================================================
   Translation PDF — font resolution
   ------------------------------------------------------------
   pdf-lib solo trae fuentes estandar (Helvetica/Times/Courier)
   que codifican en WinAnsi: sirven para espanol, ingles, frances,
   aleman, italiano y portugues, pero NO para arabe, hebreo, ruso,
   chino, japones, coreano, hindi, tailandes ni vietnamita.

   Para esos idiomas hay que incrustar un TTF/OTF Unicode, lo que
   requiere `@pdf-lib/fontkit`. Ambos son opcionales: si no estan
   disponibles, el servicio lo reporta con un mensaje accionable
   en vez de generar un PDF lleno de cuadros vacios.

   Como agregar soporte para un idioma:
     1) npm i @pdf-lib/fontkit
     2) Copiar el TTF/OTF correspondiente al directorio de fuentes
        (por defecto `public/font`, configurable con la variable de
        entorno TRANSLATION_FONT_DIR).
   ============================================================ */
import path from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FONT_DIR = path.resolve(__dirname, '../../public/font');

/** Directorio donde se buscan las fuentes Unicode. */
export function getFontDir() {
    return process.env.TRANSLATION_FONT_DIR || DEFAULT_FONT_DIR;
}

/**
 * Idiomas que la codificacion WinAnsi de las fuentes estandar cubre.
 * Para estos no hace falta incrustar nada.
 */
const WINANSI_LANGS = new Set(['eng', 'spa', 'fra', 'deu', 'ita', 'por']);

/**
 * Candidatos de archivo de fuente por idioma, en orden de preferencia.
 * Se aceptan varias familias para no atar la instalacion a un unico
 * proveedor de fuentes.
 */
const FONT_CANDIDATES = {
    ara: ['NotoNaskhArabic-Regular.ttf', 'NotoSansArabic-Regular.ttf', 'Amiri-Regular.ttf'],
    heb: ['NotoSansHebrew-Regular.ttf', 'DejaVuSans.ttf'],
    rus: ['NotoSans-Regular.ttf', 'DejaVuSans.ttf'],
    hin: ['NotoSansDevanagari-Regular.ttf'],
    tha: ['NotoSansThai-Regular.ttf'],
    vie: ['NotoSans-Regular.ttf', 'DejaVuSans.ttf'],
    jpn: ['NotoSansJP-Regular.otf', 'NotoSansJP-Regular.ttf', 'NotoSansCJKjp-Regular.otf'],
    kor: ['NotoSansKR-Regular.otf', 'NotoSansKR-Regular.ttf', 'NotoSansCJKkr-Regular.otf'],
    chi_sim: ['NotoSansSC-Regular.otf', 'NotoSansSC-Regular.ttf', 'NotoSansCJKsc-Regular.otf'],
    chi_tra: ['NotoSansTC-Regular.otf', 'NotoSansTC-Regular.ttf', 'NotoSansCJKtc-Regular.otf'],
};

/**
 * Fuentes Unicode genericas que se prueban como ultimo recurso para
 * cualquier idioma que no tenga candidato propio instalado.
 *
 * Ojo: NotoSans/DejaVu cubren latino, cirilico y griego, pero NO arabe,
 * hebreo, CJK, devanagari ni tailandes. Por eso no basta con encontrar
 * el archivo: hay que comprobar que la fuente tiene los glifos del
 * idioma (ver `fontHasGlyphsFor`), o el PDF saldria lleno de cuadros.
 */
const GENERIC_UNICODE_FONTS = ['NotoSans-Regular.ttf', 'DejaVuSans.ttf'];

/**
 * Caracter representativo de cada idioma, usado para verificar que la
 * fuente candidata realmente puede dibujarlo.
 */
const SCRIPT_SAMPLES = {
    ara: 'ا',
    heb: 'א',
    rus: 'Ж',
    hin: 'क',
    tha: 'ก',
    vie: 'ế',
    jpn: 'あ',
    kor: '한',
    chi_sim: '中',
    chi_tra: '學',
};

/** Idiomas de escritura derecha-a-izquierda. */
export const RTL_LANGS = new Set(['ara', 'heb']);

/** Idiomas sin separacion de palabras por espacios (corte por caracter). */
export const CJK_LANGS = new Set(['chi_sim', 'chi_tra', 'jpn', 'kor']);

/** True si el idioma se puede escribir con las fuentes estandar de pdf-lib. */
export function isWinAnsiLanguage(targetCode) {
    return WINANSI_LANGS.has(String(targetCode));
}

function firstExisting(fileNames) {
    const dir = getFontDir();
    for (const name of fileNames) {
        const candidate = path.join(dir, name);
        if (existsSync(candidate)) return candidate;
    }
    return null;
}

/**
 * Comprueba que la fuente contiene glifos para el idioma. Sin esta
 * validacion, una fuente latina generica se aceptaria para arabe o
 * chino y el PDF resultante saldria ilegible (cuadros vacios).
 */
function fontHasGlyphsFor(fontkit, fontBytes, targetCode) {
    const sample = SCRIPT_SAMPLES[targetCode];
    if (!sample) return true; // idioma latino: cualquier fuente Unicode sirve

    try {
        const font = fontkit.create(fontBytes);
        const codePoint = sample.codePointAt(0);
        if (typeof font?.hasGlyphForCodePoint === 'function') {
            return font.hasGlyphForCodePoint(codePoint);
        }
        // Fallback para builds de fontkit sin ese helper.
        const glyph = font?.glyphForCodePoint?.(codePoint);
        return Boolean(glyph && glyph.id !== 0);
    } catch (_) {
        return false;
    }
}

/**
 * Devuelve la primera fuente instalada que existe Y tiene glifos para
 * el idioma pedido.
 */
async function findUsableFont(targetCode, fontkit) {
    if (!fontkit) return null;

    const candidates = [...(FONT_CANDIDATES[targetCode] || []), ...GENERIC_UNICODE_FONTS];
    const dir = getFontDir();

    for (const name of candidates) {
        const candidatePath = path.join(dir, name);
        if (!existsSync(candidatePath)) continue;

        let bytes;
        try {
            bytes = await readFile(candidatePath);
        } catch (_) {
            continue;
        }

        if (fontHasGlyphsFor(fontkit, bytes, targetCode)) {
            return { fontPath: candidatePath, fontBytes: bytes };
        }
    }

    return null;
}

/** Carga perezosa de fontkit (dependencia opcional). */
async function loadFontkit() {
    try {
        const mod = await import('@pdf-lib/fontkit');
        return mod?.default || mod || null;
    } catch (_) {
        return null;
    }
}

/**
 * Resuelve con que fuente se debe escribir la traduccion.
 *
 * @param {string} targetCode codigo ISO del idioma destino (p. ej. 'ara')
 * @returns {Promise<{ kind:'standard'|'embedded', fontBytes?:Buffer,
 *                     fontkit?:object, fontPath?:string, rtl:boolean, cjk:boolean }>}
 * @throws {Error} con `code = 'FONT_UNAVAILABLE'` si el idioma necesita una
 *                 fuente incrustada que no esta instalada.
 */
export async function resolveTranslationFont(targetCode) {
    const code = String(targetCode || '');
    const rtl = RTL_LANGS.has(code);
    const cjk = CJK_LANGS.has(code);

    if (isWinAnsiLanguage(code)) {
        return { kind: 'standard', rtl, cjk };
    }

    const candidates = [...(FONT_CANDIDATES[code] || []), ...GENERIC_UNICODE_FONTS];
    const fontkit = await loadFontkit();
    const usable = await findUsableFont(code, fontkit);

    if (!usable) {
        const missing = [];
        if (!fontkit) missing.push('el paquete `@pdf-lib/fontkit` (npm i @pdf-lib/fontkit)');
        missing.push(
            firstExisting(candidates)
                // Hay archivo, pero sin glifos para este alfabeto.
                ? `una fuente con glifos para este idioma en ${getFontDir()} (por ejemplo ${candidates[0]})`
                : `una fuente Unicode en ${getFontDir()} (por ejemplo ${candidates[0]})`
        );

        const error = new Error(
            `No se puede generar el PDF en este idioma: falta ${missing.join(' y ')}.`
        );
        error.code = 'FONT_UNAVAILABLE';
        throw error;
    }

    return {
        kind: 'embedded',
        fontBytes: usable.fontBytes,
        fontkit,
        fontPath: usable.fontPath,
        rtl,
        cjk,
    };
}

/**
 * Diagnostico para la UI/admin: que idiomas se pueden exportar a PDF
 * en esta instalacion. Permite deshabilitar opciones en el selector en
 * lugar de dejar que el job falle mas tarde.
 *
 * @param {Record<string,string>} languages mapa nombre -> codigo
 */
export async function getSupportedTargetLanguages(languages) {
    const fontkit = await loadFontkit();
    const result = {};

    for (const [name, code] of Object.entries(languages || {})) {
        if (isWinAnsiLanguage(code)) {
            result[code] = { name, code, supported: true, reason: null };
            continue;
        }
        const usable = await findUsableFont(code, fontkit);
        const supported = Boolean(usable);
        result[code] = {
            name,
            code,
            supported,
            reason: supported
                ? null
                : (!fontkit ? 'missing_fontkit' : 'missing_font'),
        };
    }

    return result;
}
```

---

## 4. `Approvals_functions/services/translation-pdf-service.js`

```javascript
/* ============================================================
   Translation PDF — generation service
   ------------------------------------------------------------
   Orquesta el pipeline completo de una traduccion:

       archivo original (pdf/imagen)
            -> extraccion de texto  (Tools/services/extraction-service)
            -> traduccion por IA    (Tools/services/translation-service)
            -> PDF nuevo con el texto traducido  (pdf-lib)

   Decision de diseno (acordada con el usuario): el resultado es un
   PDF NUEVO que contiene solo el texto traducido, no un calco del
   layout original. Es la opcion fiable: reconstruir el layout de un
   escaneo produce resultados impredecibles.

   Este modulo no toca la base de datos ni express: recibe bytes y
   devuelve bytes. Eso lo hace testeable y reutilizable si manana se
   quiere la misma funcion en CRM o IT.
   ============================================================ */
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { extractFromPdf, extractFromImage } from '../../Tools/services/extraction-service.js';
import { translateText } from '../../Tools/services/translation-service.js';
import { nameFromCode } from '../../Tools/utils/languages.js';
import { resolveTranslationFont } from './translation-fonts.js';

/** Extensiones aceptadas, alineadas con la tool de Tools/translator. */
const PDF_EXT = /\.pdf$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/** Layout de la pagina (A4 en puntos). */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 56;
const BODY_SIZE = 11;
const BODY_LEADING = 1.45;
const TITLE_SIZE = 15;
const META_SIZE = 8.5;

/**
 * Trozos maximos de texto enviados al servicio de IA. Los documentos
 * largos se parten para no exceder el contexto del modelo y para que
 * un fallo puntual no invalide toda la traduccion.
 */
const TRANSLATION_CHUNK_CHARS = Number(process.env.TRANSLATION_CHUNK_CHARS || 3500);

/** True si el archivo es traducible por esta funcionalidad. */
export function isTranslatableFile(filename) {
    const name = String(filename || '');
    return PDF_EXT.test(name) || IMAGE_EXT.test(name);
}

/**
 * Nombre del PDF resultante. Se guarda junto al original, con el idioma
 * y la version en el nombre para que convivan varias traducciones.
 *   contrato.pdf  ->  contrato_translated_ara_v2.pdf
 */
export function buildTranslatedFilename(sourceFilename, targetCode, version) {
    const ext = path.extname(sourceFilename);
    const base = path.basename(sourceFilename, ext);
    const safeLang = String(targetCode).replace(/[^a-z0-9_]/gi, '');
    return `${base}_translated_${safeLang}_v${version}.pdf`;
}

/**
 * Parte el texto en bloques que respetan los limites de parrafo siempre
 * que sea posible, para no cortar frases a la mitad entre llamadas.
 */
export function chunkText(text, maxChars = TRANSLATION_CHUNK_CHARS) {
    const normalized = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!normalized) return [];
    if (normalized.length <= maxChars) return [normalized];

    const chunks = [];
    let current = '';

    for (const paragraph of normalized.split(/\n{2,}/)) {
        const block = paragraph.trim();
        if (!block) continue;

        if (block.length > maxChars) {
            // Parrafo gigantesco: cortar por lineas y, si hace falta, a lo bruto.
            if (current) { chunks.push(current); current = ''; }
            let rest = block;
            while (rest.length > maxChars) {
                const window = rest.slice(0, maxChars);
                const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. '));
                const splitAt = cut > maxChars * 0.5 ? cut + 1 : maxChars;
                chunks.push(rest.slice(0, splitAt).trim());
                rest = rest.slice(splitAt);
            }
            if (rest.trim()) current = rest.trim();
            continue;
        }

        const candidate = current ? `${current}\n\n${block}` : block;
        if (candidate.length > maxChars) {
            chunks.push(current);
            current = block;
        } else {
            current = candidate;
        }
    }

    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

/** Ajuste de linea por ancho real de glifos. */
function wrapLine(line, maxWidth, font, size, breakAnywhere) {
    if (!line) return [''];

    const measure = (s) => {
        try {
            return font.widthOfTextAtSize(s, size);
        } catch (_) {
            // Glifo no soportado por la fuente: aproximacion conservadora.
            return s.length * size * 0.6;
        }
    };

    if (measure(line) <= maxWidth) return [line];

    const units = breakAnywhere ? Array.from(line) : line.split(/(\s+)/);
    const out = [];
    let current = '';

    for (const unit of units) {
        const candidate = current + unit;
        if (current && measure(candidate) > maxWidth) {
            out.push(current.trimEnd());
            current = breakAnywhere ? unit : unit.replace(/^\s+/, '');
        } else {
            current = candidate;
        }
    }

    if (current.trim()) out.push(current.trimEnd());
    return out.length ? out : [''];
}

/**
 * Sustituye los caracteres que la fuente estandar (WinAnsi) no puede
 * codificar, para que pdf-lib no lance al dibujar.
 */
function sanitizeForStandardFont(text) {
    return String(text)
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/\u00A0/g, ' ')
        // eslint-disable-next-line no-control-regex
        .replace(/[^\x00-\xFF]/g, '?');
}

/**
 * Compone el PDF final con el texto traducido.
 *
 * @param {object} params
 * @param {string} params.translatedText
 * @param {string} params.sourceFilename
 * @param {string} params.targetCode
 * @param {string} [params.sourceCode]
 * @param {string} [params.createdByName]
 * @param {number} [params.approvalId]
 * @returns {Promise<{ bytes: Buffer, pageCount: number }>}
 */
export async function buildTranslatedPdf(params) {
    const {
        translatedText,
        sourceFilename,
        targetCode,
        sourceCode,
        createdByName,
        approvalId,
    } = params;

    const fontChoice = await resolveTranslationFont(targetCode);
    const pdfDoc = await PDFDocument.create();

    let bodyFont;
    let titleFont;

    if (fontChoice.kind === 'embedded') {
        pdfDoc.registerFontkit(fontChoice.fontkit);
        bodyFont = await pdfDoc.embedFont(fontChoice.fontBytes, { subset: true });
        titleFont = bodyFont;
    } else {
        bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    }

    const useStandard = fontChoice.kind === 'standard';
    const prepare = (t) => (useStandard ? sanitizeForStandardFont(t) : String(t));

    pdfDoc.setTitle(`Translation — ${sourceFilename}`);
    pdfDoc.setSubject(`Translated to ${nameFromCode(targetCode)}`);
    pdfDoc.setProducer('DasDash — Approvals Translation');
    pdfDoc.setCreationDate(new Date());

    const maxWidth = PAGE_WIDTH - MARGIN_X * 2;
    const lineHeight = BODY_SIZE * BODY_LEADING;
    const textColor = rgb(0.1, 0.1, 0.1);
    const mutedColor = rgb(0.45, 0.45, 0.45);

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let cursorY = PAGE_HEIGHT - MARGIN_TOP;

    const newPage = () => {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        cursorY = PAGE_HEIGHT - MARGIN_TOP;
    };

    /** Dibuja una linea respetando RTL (alineada a la derecha). */
    const drawLine = (text, { font, size, color }) => {
        if (cursorY - size < MARGIN_BOTTOM) newPage();
        if (text.length) {
            let x = MARGIN_X;
            if (fontChoice.rtl) {
                let width;
                try {
                    width = font.widthOfTextAtSize(text, size);
                } catch (_) {
                    width = text.length * size * 0.6;
                }
                x = PAGE_WIDTH - MARGIN_X - width;
            }
            page.drawText(text, { x, y: cursorY, size, font, color });
        }
        cursorY -= size * BODY_LEADING;
    };

    // ── Encabezado ────────────────────────────────────────────
    const headerTitle = prepare(`Translation — ${nameFromCode(targetCode)}`);
    drawLine(headerTitle, { font: titleFont, size: TITLE_SIZE, color: textColor });
    cursorY -= 4;

    const metaParts = [
        `Source file: ${sourceFilename}`,
        sourceCode && sourceCode !== 'auto' ? `Source language: ${nameFromCode(sourceCode)}` : null,
        approvalId ? `Approval: ${approvalId}` : null,
        createdByName ? `Generated by: ${createdByName}` : null,
        `Generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    ].filter(Boolean);

    for (const meta of metaParts) {
        for (const l of wrapLine(prepare(meta), maxWidth, bodyFont, META_SIZE, false)) {
            drawLine(l, { font: bodyFont, size: META_SIZE, color: mutedColor });
        }
    }

    cursorY -= 6;
    page.drawLine({
        start: { x: MARGIN_X, y: cursorY },
        end: { x: PAGE_WIDTH - MARGIN_X, y: cursorY },
        thickness: 0.7,
        color: rgb(0.8, 0.8, 0.8),
    });
    cursorY -= lineHeight;

    const disclaimer = prepare('Machine translation — review before relying on it for decisions.');
    for (const l of wrapLine(disclaimer, maxWidth, bodyFont, META_SIZE, false)) {
        drawLine(l, { font: bodyFont, size: META_SIZE, color: mutedColor });
    }
    cursorY -= lineHeight * 0.6;

    // ── Cuerpo ────────────────────────────────────────────────
    const paragraphs = String(translatedText || '').replace(/\r\n?/g, '\n').split('\n');

    for (const rawParagraph of paragraphs) {
        const paragraph = prepare(rawParagraph.trimEnd());
        if (!paragraph.trim()) {
            cursorY -= lineHeight * 0.5;
            continue;
        }
        const lines = wrapLine(paragraph, maxWidth, bodyFont, BODY_SIZE, fontChoice.cjk);
        for (const l of lines) {
            drawLine(l, { font: bodyFont, size: BODY_SIZE, color: textColor });
        }
    }

    const bytes = Buffer.from(await pdfDoc.save());
    return { bytes, pageCount: pdfDoc.getPageCount() };
}

/**
 * Pipeline completo: bytes del archivo original -> bytes del PDF traducido.
 *
 * @param {object} params
 * @param {Buffer} params.sourceBytes
 * @param {string} params.sourceFilename
 * @param {string} params.targetCode
 * @param {string} [params.sourceCode='auto']
 * @param {string} [params.createdByName]
 * @param {number} [params.approvalId]
 * @param {(stage:string, detail:object)=>void} [params.onProgress]
 * @returns {Promise<{ bytes:Buffer, pageCount:number, charCount:number,
 *                     extractionMethod:string, sourcePageCount:number }>}
 */
export async function generateTranslatedPdf(params) {
    const {
        sourceBytes,
        sourceFilename,
        targetCode,
        sourceCode = 'auto',
        createdByName,
        approvalId,
        onProgress = () => {},
    } = params;

    if (!isTranslatableFile(sourceFilename)) {
        const error = new Error('File type not supported for translation');
        error.code = 'UNSUPPORTED_FILE';
        throw error;
    }

    // 1) Extraccion (embebido o OCR, lo decide el servicio de Tools).
    onProgress('extracting', {});
    const extraction = PDF_EXT.test(sourceFilename)
        ? await extractFromPdf(sourceBytes, { code: sourceCode, preprocess: true })
        : await extractFromImage(sourceBytes, { code: sourceCode, preprocess: true });

    const sourceText = String(extraction?.text || '').trim();
    if (!sourceText) {
        const error = new Error('No readable text was found in the document');
        error.code = 'NO_TEXT';
        throw error;
    }

    // 2) Traduccion por bloques.
    const chunks = chunkText(sourceText);
    const translatedChunks = [];

    for (let i = 0; i < chunks.length; i++) {
        onProgress('translating', { chunk: i + 1, totalChunks: chunks.length });
        const translated = await translateText(chunks[i], targetCode);
        if (!translated) {
            const error = new Error('The AI service returned an empty translation');
            error.code = 'EMPTY_TRANSLATION';
            throw error;
        }
        translatedChunks.push(translated.trim());
    }

    const translatedText = translatedChunks.join('\n\n');

    // 3) Composicion del PDF.
    onProgress('rendering', {});
    const { bytes, pageCount } = await buildTranslatedPdf({
        translatedText,
        sourceFilename,
        targetCode,
        sourceCode,
        createdByName,
        approvalId,
    });

    return {
        bytes,
        pageCount,
        charCount: translatedText.length,
        extractionMethod: extraction.method || null,
        sourcePageCount: extraction.pageCount || 0,
    };
}
```

---

## 5. `Approvals_functions/services/translation-job-runner.js`

```javascript
/* ============================================================
   Translation jobs — background runner
   ------------------------------------------------------------
   La traduccion de un documento largo puede tardar minutos (OCR +
   varias llamadas al modelo), demasiado para el ciclo request /
   response. El controlador solo encola el job y responde; este
   runner lo procesa fuera del request.

   Caracteristicas:
     - Cola persistida en `approval_translations` (sobrevive a los
       reinicios; los jobs colgados se re-encolan al arrancar).
     - Concurrencia limitada para no saturar el servicio de IA.
     - Un unico bucle por proceso; `notify()` lo despierta cuando
       entra trabajo nuevo, en vez de hacer polling agresivo.
   ============================================================ */
import sql from 'mssql';
import path from 'path';
import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import ApprovalTranslationsModel, { TRANSLATION_STATUS } from '../models/translations.js';
import { resolveApprovalFileFullPath } from '../shared/approval-file-routing.js';
import { hashBuffer, writeFileSafe, isFileLockedError } from './pdf-text-writer.js';
import { generateTranslatedPdf, buildTranslatedFilename } from './translation-pdf-service.js';

const MAX_CONCURRENT = Number(process.env.TRANSLATION_MAX_CONCURRENT || 1);
const IDLE_POLL_MS = Number(process.env.TRANSLATION_IDLE_POLL_MS || 15000);
const STALE_JOB_MINUTES = Number(process.env.TRANSLATION_STALE_MINUTES || 30);

let connectionConfig = null;
let running = false;
let activeCount = 0;
let wakeUpTimer = null;

/** Ejecuta `fn` dentro de una transaccion, con rollback ante error. */
async function withTransaction(fn) {
    await sql.connect(connectionConfig);
    const transaction = new sql.Transaction();
    await transaction.begin();
    try {
        const result = await fn(transaction);
        await transaction.commit();
        return result;
    } catch (error) {
        try { await transaction.rollback(); } catch (_) {}
        throw error;
    }
}

/** Mensaje de error apto para mostrar al usuario final. */
function toUserMessage(error) {
    switch (error?.code) {
        case 'NO_TEXT':
            return 'No readable text was found in this document.';
        case 'FONT_UNAVAILABLE':
            return error.message;
        case 'UNSUPPORTED_FILE':
            return 'This file type cannot be translated.';
        case 'EMPTY_TRANSLATION':
            return 'The translation service returned an empty result. Please try again.';
        case 'FILE_LOCKED':
            return 'The file is currently open by another user. Please try again later.';
        default:
            return error?.message || 'Unexpected error while translating the document.';
    }
}

/** Procesa un job ya reclamado (estado `processing`). */
async function processJob(job) {
    const sourceFilename = job.source_filename;

    // 1) Localizar el archivo original en su ruta UNC.
    const resolved = await resolveApprovalFileFullPath(
        connectionConfig,
        job.approval_id,
        sourceFilename,
    );

    if (!resolved?.ok || !resolved.fullPath) {
        const error = new Error(resolved?.error || 'Could not resolve the source file path');
        error.code = 'PATH_NOT_RESOLVED';
        throw error;
    }
    if (!existsSync(resolved.fullPath)) {
        const error = new Error('Source file not found on the server');
        error.code = 'FILE_NOT_FOUND';
        throw error;
    }

    let sourceBytes;
    try {
        sourceBytes = await readFile(resolved.fullPath);
    } catch (readErr) {
        if (isFileLockedError(readErr)) {
            const error = new Error('The file is locked by another process');
            error.code = 'FILE_LOCKED';
            throw error;
        }
        throw readErr;
    }

    // 2) Extraer + traducir + componer el PDF.
    const result = await generateTranslatedPdf({
        sourceBytes,
        sourceFilename,
        targetCode: job.target_lang,
        sourceCode: job.source_lang || 'auto',
        createdByName: job.created_by_name,
        approvalId: job.approval_id,
    });

    // 3) Guardar junto al original.
    const targetDir = path.dirname(resolved.fullPath);
    if (!existsSync(targetDir)) {
        await mkdir(targetDir, { recursive: true });
    }

    const translatedFilename = buildTranslatedFilename(
        sourceFilename,
        job.target_lang,
        job.version,
    );
    const outputPath = path.join(targetDir, translatedFilename).replace(/\\/g, '/');

    await writeFileSafe(outputPath, result.bytes);

    // 4) Marcar como completado.
    await withTransaction(async (transaction) => {
        await ApprovalTranslationsModel.markCompleted(transaction, job.id, {
            translated_filename: translatedFilename,
            file_path: outputPath,
            file_hash: hashBuffer(result.bytes),
            page_count: result.pageCount,
            char_count: result.charCount,
            extraction_method: result.extractionMethod,
        });
        await ApprovalTranslationsModel.insertAuditLog(transaction, {
            translation_id: job.id,
            approval_id: job.approval_id,
            source_filename: sourceFilename,
            action: 'translation_completed',
            user_id: job.created_by,
            user_name: job.created_by_name,
            details: `lang=${job.target_lang}; file=${translatedFilename}; pages=${result.pageCount}`,
        });
    });

    console.log(`[Translations] job ${job.id} completed -> ${translatedFilename}`);
}

/** Reclama y procesa jobs hasta agotar la cola o el limite de concurrencia. */
async function drainQueue() {
    if (!connectionConfig) return;

    while (activeCount < MAX_CONCURRENT) {
        let job = null;
        try {
            job = await withTransaction((transaction) =>
                ApprovalTranslationsModel.claimNextPendingJob(transaction));
        } catch (error) {
            console.error('[Translations] failed to claim job:', error.message);
            return;
        }

        if (!job) return; // cola vacia

        activeCount += 1;
        // Deliberadamente sin await: se procesan hasta MAX_CONCURRENT en paralelo.
        processJob(job)
            .catch(async (error) => {
                console.error(`[Translations] job ${job.id} failed:`, error);
                try {
                    await withTransaction(async (transaction) => {
                        await ApprovalTranslationsModel.markFailed(
                            transaction, job.id, toUserMessage(error),
                        );
                        await ApprovalTranslationsModel.insertAuditLog(transaction, {
                            translation_id: job.id,
                            approval_id: job.approval_id,
                            source_filename: job.source_filename,
                            action: 'translation_failed',
                            user_id: job.created_by,
                            user_name: job.created_by_name,
                            details: toUserMessage(error),
                        });
                    });
                } catch (dbError) {
                    console.error('[Translations] could not persist failure:', dbError.message);
                }
            })
            .finally(() => {
                activeCount -= 1;
                // Puede haber quedado trabajo pendiente mientras este corria.
                setImmediate(() => { drainQueue().catch(() => {}); });
            });
    }
}

/** Despierta el runner (lo llama el controlador tras encolar un job). */
export function notifyNewJob() {
    if (!running) return;
    drainQueue().catch((error) => {
        console.error('[Translations] drain error:', error.message);
    });
}

/**
 * Arranca el runner. Idempotente: llamarlo dos veces no duplica bucles.
 * Se invoca una sola vez desde el arranque de la app.
 */
export function startTranslationJobRunner(sqlConfig) {
    if (running) return;
    connectionConfig = sqlConfig;
    running = true;

    // Los jobs que quedaron en `processing` tras un reinicio vuelven a la cola.
    withTransaction((transaction) =>
        ApprovalTranslationsModel.requeueStaleJobs(transaction, STALE_JOB_MINUTES))
        .then((count) => {
            if (count > 0) console.log(`[Translations] re-queued ${count} stale job(s)`);
        })
        .catch((error) => {
            console.error('[Translations] could not re-queue stale jobs:', error.message);
        });

    const tick = () => {
        drainQueue().catch((error) => {
            console.error('[Translations] drain error:', error.message);
        });
    };

    tick();
    wakeUpTimer = setInterval(tick, IDLE_POLL_MS);
    if (typeof wakeUpTimer.unref === 'function') wakeUpTimer.unref();

    console.log(`[Translations] job runner started (concurrency ${MAX_CONCURRENT})`);
}

/** Detiene el runner (util en tests o apagado controlado). */
export function stopTranslationJobRunner() {
    running = false;
    if (wakeUpTimer) clearInterval(wakeUpTimer);
    wakeUpTimer = null;
}

export { TRANSLATION_STATUS };
```

---

## 6. `Approvals_functions/controllers/approval_translations.js`

```javascript
/* ============================================================
   APPROVALS — Translations controller
   ------------------------------------------------------------
   Capa HTTP de la funcionalidad de traduccion de documentos.
   Responsabilidades: validar entrada, resolver identidad del
   usuario, delegar en modelo/servicios y formatear la respuesta.
   No genera PDFs ni arma rutas de disco por su cuenta.

   Endpoints:
     GET  /approval-translate/languages   idiomas disponibles
     POST /approval-translate/create      encola una traduccion
     GET  /approval-translate/list        traducciones de un archivo
     GET  /approval-translate/status      estado de un job (polling)
     GET  /approval-translate/file        sirve/descarga el PDF
     POST /approval-translate/delete      borrado logico
   ============================================================ */
import sql from 'mssql';
import { existsSync, createReadStream, statSync } from 'fs';
import ApprovalTranslationsModel, { TRANSLATION_STATUS } from '../models/translations.js';
import ApprovalFunctionsModel from '../models/approval_functions.js';
import USERModel from '../../USERS/model/USER.js';
import Rules from '../../USERS/rule/DevTeam.js';
import { getClientIp, isFileLockedError } from '../services/pdf-text-writer.js';
import { isTranslatableFile } from '../services/translation-pdf-service.js';
import { getSupportedTargetLanguages } from '../services/translation-fonts.js';
import { notifyNewJob } from '../services/translation-job-runner.js';
import { OCR_LANGUAGES, TARGET_LANGUAGES, isValidOcrCode } from '../../Tools/utils/languages.js';

/** Rechaza nombres de archivo con separadores o traversal. */
function isUnsafeFilename(filename) {
    return !filename || /[/\\]/.test(filename) || filename === '.' || filename === '..';
}

/** Proyeccion segura de una fila hacia el cliente (sin rutas de disco). */
function toPublicTranslation(row, approvalId) {
    return {
        id: row.id,
        approval_id: row.approval_id,
        source_filename: row.source_filename,
        target_lang: row.target_lang,
        target_lang_name: nameOf(row.target_lang),
        source_lang: row.source_lang,
        version: row.version,
        translated_filename: row.translated_filename,
        status: row.status,
        error_message: row.error_message,
        page_count: row.page_count,
        char_count: row.char_count,
        extraction_method: row.extraction_method,
        created_by_name: row.created_by_name,
        created_at: row.created_at,
        completed_at: row.completed_at,
        file_url: row.status === TRANSLATION_STATUS.COMPLETED
            ? `/approval-translate/file?RowID=${approvalId}&id=${row.id}`
            : null,
        download_url: row.status === TRANSLATION_STATUS.COMPLETED
            ? `/approval-translate/file?RowID=${approvalId}&id=${row.id}&dl=1`
            : null,
    };
}

function nameOf(code) {
    const entry = Object.entries(OCR_LANGUAGES).find(([, c]) => c === code);
    return entry ? entry[0] : code;
}

export default class ApprovalTranslationsController {

    /**
     * GET /approval-translate/languages
     * Idiomas origen/destino y si el destino se puede exportar a PDF
     * en esta instalacion (depende de las fuentes instaladas).
     */
    static async getLanguages(connection, req, res) {
        try {
            const supported = await getSupportedTargetLanguages(TARGET_LANGUAGES);
            return res.send({
                result: 1,
                sourceLanguages: OCR_LANGUAGES,
                targetLanguages: TARGET_LANGUAGES,
                targetSupport: supported,
            });
        } catch (error) {
            console.error('[Translations] getLanguages error:', error);
            return res.status(500).send({ result: 0, error: 'Could not load languages' });
        }
    }

    /**
     * POST /approval-translate/create
     * Body: { RowID, filename, target_lang, source_lang? }
     * Encola el job y responde de inmediato (procesamiento asincrono).
     */
    static async createTranslation(connection, req, res) {
        const RowID = Number(req.body.RowID);
        const filename = req.body.filename || '';
        const targetLang = String(req.body.target_lang || '');
        const sourceLang = String(req.body.source_lang || 'auto');
        const userId = req.session?.userID;

        if (!userId) return res.status(401).send({ result: 0, error: 'Not authenticated' });
        if (!RowID) return res.status(400).send({ result: 0, error: 'Invalid approval id' });
        if (isUnsafeFilename(filename)) {
            return res.status(400).send({ result: 0, error: 'Invalid filename' });
        }
        if (!Object.values(TARGET_LANGUAGES).includes(targetLang)) {
            return res.status(400).send({ result: 0, error: 'Unsupported target language' });
        }
        if (!isValidOcrCode(sourceLang)) {
            return res.status(400).send({ result: 0, error: 'Unsupported source language' });
        }
        if (!isTranslatableFile(filename)) {
            return res.status(415).send({
                result: 0,
                error: 'Only PDF and image files (PNG, JPG, WEBP) can be translated',
            });
        }

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();

            // El archivo debe pertenecer realmente a este approval.
            const archivos = await ApprovalFunctionsModel.getArchivosByLogId(transaction, RowID);
            const belongs = Array.isArray(archivos)
                && archivos.some((a) => a.archivo_nombre === filename);
            if (!belongs) {
                await transaction.commit();
                return res.status(404).send({ result: 0, error: 'File not found in this approval' });
            }

            // Evitar encolar dos veces el mismo archivo+idioma.
            const active = await ApprovalTranslationsModel.findActiveJob(
                transaction, RowID, filename, targetLang,
            );
            if (active) {
                await transaction.commit();
                return res.send({
                    result: 1,
                    alreadyQueued: true,
                    translation: toPublicTranslation(active, RowID),
                });
            }

            const usuario = await USERModel.obtenerDatosUsuario(transaction, userId);
            const created = await ApprovalTranslationsModel.createJob(transaction, {
                approval_id: RowID,
                source_filename: filename,
                target_lang: targetLang,
                source_lang: sourceLang,
                created_by: userId,
                created_by_name: usuario?.UserName || null,
            });

            await ApprovalTranslationsModel.insertAuditLog(transaction, {
                translation_id: created.id,
                approval_id: RowID,
                source_filename: filename,
                action: 'translation_requested',
                user_id: userId,
                user_name: usuario?.UserName || null,
                ip_address: getClientIp(req),
                details: `lang=${targetLang}; source=${sourceLang}`,
            });

            const row = await ApprovalTranslationsModel.getById(transaction, created.id);
            await transaction.commit();

            // Despierta al runner para que lo tome cuanto antes.
            notifyNewJob();

            return res.send({
                result: 1,
                queued: true,
                translation: toPublicTranslation(row, RowID),
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[Translations] createTranslation error:', error);
            return res.status(500).send({ result: 0, error: 'Could not queue the translation' });
        }
    }

    /**
     * GET /approval-translate/list?RowID=&filename=
     * Traducciones de un archivo (para el boton "Open translation").
     */
    static async listTranslations(connection, req, res) {
        const RowID = Number(req.query.RowID);
        const filename = req.query.filename || '';

        if (!RowID) return res.status(400).send({ result: 0, error: 'Invalid approval id' });
        if (isUnsafeFilename(filename)) {
            return res.status(400).send({ result: 0, error: 'Invalid filename' });
        }

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const rows = await ApprovalTranslationsModel.listByFile(transaction, RowID, filename);
            await transaction.commit();

            return res.send({
                result: 1,
                translations: rows.map((row) => toPublicTranslation(row, RowID)),
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[Translations] listTranslations error:', error);
            return res.status(500).send({ result: 0, error: 'Could not load translations' });
        }
    }

    /**
     * GET /approval-translate/status?RowID=&id=
     * Polling ligero del job mientras se genera en background.
     */
    static async getStatus(connection, req, res) {
        const RowID = Number(req.query.RowID);
        const id = Number(req.query.id);

        if (!RowID || !id) return res.status(400).send({ result: 0, error: 'Invalid parameters' });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const row = await ApprovalTranslationsModel.getById(transaction, id);
            await transaction.commit();

            if (!row || Number(row.approval_id) !== RowID) {
                return res.status(404).send({ result: 0, error: 'Translation not found' });
            }
            return res.send({ result: 1, translation: toPublicTranslation(row, RowID) });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[Translations] getStatus error:', error);
            return res.status(500).send({ result: 0, error: 'Could not read the translation status' });
        }
    }

    /**
     * GET /approval-translate/file?RowID=&id=&dl=1
     * Sirve el PDF traducido desde su ruta (junto al archivo original).
     */
    static async serveTranslationFile(connection, req, res) {
        const RowID = Number(req.query.RowID);
        const id = Number(req.query.id);
        const forceDownload = req.query.dl === '1';

        if (!RowID || !id) return res.status(400).send({ error: 'Invalid parameters' });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const devteam = await Rules.validateTeam(req.session?.iddevteam, req.session?.userID);
            const row = await ApprovalTranslationsModel.getById(transaction, id);

            if (!row || Number(row.approval_id) !== RowID) {
                await transaction.commit();
                return res.status(404).send({ error: 'Translation not found' });
            }
            if (row.status !== TRANSLATION_STATUS.COMPLETED || !row.file_path) {
                await transaction.commit();
                return res.status(409).send({ error: 'The translation is not ready yet' });
            }

            await ApprovalTranslationsModel.insertAuditLog(transaction, {
                translation_id: row.id,
                approval_id: RowID,
                source_filename: row.source_filename,
                action: forceDownload ? 'translation_downloaded' : 'translation_viewed',
                user_id: req.session?.userID,
                ip_address: getClientIp(req),
                details: row.translated_filename,
            });
            await transaction.commit();

            if (!existsSync(row.file_path)) {
                return res.status(404).send(devteam
                    ? { error: 'Translated file not found', ruta: row.file_path }
                    : { error: 'Translated file not found' });
            }

            const stat = statSync(row.file_path);
            const outName = encodeURIComponent(row.translated_filename || 'translation.pdf');
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `${forceDownload ? 'attachment' : 'inline'}; filename="${outName}"`,
            );

            const stream = createReadStream(row.file_path);
            stream.on('error', (streamErr) => {
                if (res.headersSent) return;
                if (isFileLockedError(streamErr)) {
                    res.status(409).send({ error: 'file_locked', message: 'The file is currently in use. Please try again later.' });
                } else {
                    res.status(500).send({ error: 'Error reading file' });
                }
            });
            stream.pipe(res);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[Translations] serveTranslationFile error:', error);
            if (!res.headersSent) res.status(500).send({ error: error.message });
        }
    }

    /**
     * POST /approval-translate/delete
     * Body: { RowID, id }. Borrado logico: el PDF permanece en disco
     * (forma parte del expediente) pero deja de listarse.
     */
    static async deleteTranslation(connection, req, res) {
        const RowID = Number(req.body.RowID);
        const id = Number(req.body.id);
        const userId = req.session?.userID;

        if (!userId) return res.status(401).send({ result: 0, error: 'Not authenticated' });
        if (!RowID || !id) return res.status(400).send({ result: 0, error: 'Invalid parameters' });

        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const row = await ApprovalTranslationsModel.getById(transaction, id);
            if (!row || Number(row.approval_id) !== RowID) {
                await transaction.commit();
                return res.status(404).send({ result: 0, error: 'Translation not found' });
            }

            await ApprovalTranslationsModel.cancel(transaction, id, RowID);
            await ApprovalTranslationsModel.insertAuditLog(transaction, {
                translation_id: id,
                approval_id: RowID,
                source_filename: row.source_filename,
                action: 'translation_removed',
                user_id: userId,
                ip_address: getClientIp(req),
                details: row.translated_filename,
            });
            await transaction.commit();

            return res.send({ result: 1, deleted: true });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('[Translations] deleteTranslation error:', error);
            return res.status(500).send({ result: 0, error: 'Could not remove the translation' });
        }
    }
}
```

---

## 7. `public/js/approval-translations.js`

```javascript
/* ═══════════════════════════════════════════════════════════
   Approval Document Translations
   -----------------------------------------------------------
   Modulo autocontenido: inyecta sus propios modales y no depende
   de que la vista declare markup. Se expone como window.ApprovalTranslations.

   API publica:
     ApprovalTranslations.openTranslateModal(rowId, filename)
     ApprovalTranslations.openTranslationsModal(rowId, filename)

   El backend procesa la traduccion en background, asi que aqui
   solo se encola y se hace polling del estado.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Estado ───────────────────────────────────────────────
  var languagesCache = null;
  var pollTimers = {};
  var currentRowId = null;
  var currentFilename = null;

  var POLL_INTERVAL_MS = 4000;
  var POLL_MAX_ATTEMPTS = 450; // ~30 min

  // ── Utilidades ───────────────────────────────────────────
  function el(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) return '';
    try {
      var d = new Date(value);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString();
    } catch (e) { return ''; }
  }

  function request(url, options) {
    var opts = options || {};
    return fetch(url, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin'
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || ('Request failed (' + res.status + ')'));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  // ── Markup (inyectado una sola vez) ──────────────────────
  function ensureMarkup() {
    if (el('approvalTranslateModal')) return;

    var wrapper = document.createElement('div');
    wrapper.innerHTML = [
      // Modal: nueva traduccion
      '<div id="approvalTranslateModal" class="app-modal atr-modal">',
      '  <div class="app-modal-dialog" style="max-width:520px;">',
      '    <div class="app-modal-header">',
      '      <h6 class="app-modal-title"><i class="fas fa-language me-2"></i>Translate document</h6>',
      '      <button type="button" class="app-modal-close" data-atr-close="approvalTranslateModal" aria-label="Close">&times;</button>',
      '    </div>',
      '    <div class="app-modal-body">',
      '      <p class="atr-filename" id="atrSourceFilename"></p>',
      '      <div class="atr-field">',
      '        <label class="atr-label" for="atrSourceLang">Source language</label>',
      '        <select id="atrSourceLang" class="form-select form-select-sm"></select>',
      '      </div>',
      '      <div class="atr-field">',
      '        <label class="atr-label" for="atrTargetLang">Target language</label>',
      '        <select id="atrTargetLang" class="form-select form-select-sm"></select>',
      '        <small id="atrTargetHint" class="atr-hint"></small>',
      '      </div>',
      '      <div id="atrCreateFeedback" class="atr-feedback"></div>',
      '    </div>',
      '    <div class="app-modal-footer">',
      '      <button type="button" class="btn btn-outline-secondary btn-sm" data-atr-close="approvalTranslateModal">Cancel</button>',
      '      <button type="button" id="atrSubmitBtn" class="btn btn-sm atr-btn-primary">',
      '        <i class="fas fa-language me-1"></i>Translate',
      '      </button>',
      '    </div>',
      '  </div>',
      '</div>',
      // Modal: traducciones existentes
      '<div id="approvalTranslationsModal" class="app-modal atr-modal">',
      '  <div class="app-modal-dialog" style="max-width:680px;">',
      '    <div class="app-modal-header">',
      '      <h6 class="app-modal-title"><i class="fas fa-globe me-2"></i>Translations</h6>',
      '      <button type="button" class="app-modal-close" data-atr-close="approvalTranslationsModal" aria-label="Close">&times;</button>',
      '    </div>',
      '    <div class="app-modal-body">',
      '      <p class="atr-filename" id="atrListFilename"></p>',
      '      <div id="atrList" class="atr-list"></div>',
      '    </div>',
      '    <div class="app-modal-footer">',
      '      <button type="button" class="btn btn-outline-secondary btn-sm" data-atr-close="approvalTranslationsModal">Close</button>',
      '      <button type="button" id="atrNewFromListBtn" class="btn btn-sm atr-btn-primary">',
      '        <i class="fas fa-plus me-1"></i>New translation',
      '      </button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');

    while (wrapper.firstChild) document.body.appendChild(wrapper.firstChild);

    // Cierre por boton y por click en el backdrop.
    document.querySelectorAll('[data-atr-close]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeModal(this.getAttribute('data-atr-close'));
      });
    });
    ['approvalTranslateModal', 'approvalTranslationsModal'].forEach(function (id) {
      var modal = el(id);
      if (!modal) return;
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal(id);
      });
    });

    el('atrSubmitBtn').addEventListener('click', submitTranslation);
    el('atrNewFromListBtn').addEventListener('click', function () {
      closeModal('approvalTranslationsModal');
      openTranslateModal(currentRowId, currentFilename);
    });
    el('atrTargetLang').addEventListener('change', renderTargetHint);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      ['approvalTranslateModal', 'approvalTranslationsModal'].forEach(function (id) {
        var modal = el(id);
        if (modal && modal.classList.contains('open')) closeModal(id);
      });
    });
  }

  function openModal(id) {
    ensureMarkup();
    var modal = el(id);
    if (modal) modal.classList.add('open');
  }

  function closeModal(id) {
    var modal = el(id);
    if (modal) modal.classList.remove('open');
  }

  // ── Idiomas ──────────────────────────────────────────────
  function loadLanguages() {
    if (languagesCache) return Promise.resolve(languagesCache);
    return request('/approval-translate/languages').then(function (data) {
      languagesCache = data;
      return data;
    });
  }

  function fillLanguageSelects(data) {
    var sourceSelect = el('atrSourceLang');
    var targetSelect = el('atrTargetLang');
    var support = data.targetSupport || {};

    sourceSelect.innerHTML = Object.keys(data.sourceLanguages || {}).map(function (name) {
      var code = data.sourceLanguages[name];
      return '<option value="' + escapeHtml(code) + '"' + (code === 'auto' ? ' selected' : '') + '>' +
        escapeHtml(name) + '</option>';
    }).join('');

    targetSelect.innerHTML = Object.keys(data.targetLanguages || {}).map(function (name) {
      var code = data.targetLanguages[name];
      var info = support[code];
      var unsupported = info && info.supported === false;
      return '<option value="' + escapeHtml(code) + '"' +
        (code === 'eng' ? ' selected' : '') +
        (unsupported ? ' data-unsupported="1"' : '') + '>' +
        escapeHtml(name) + (unsupported ? ' (PDF font not installed)' : '') +
        '</option>';
    }).join('');

    renderTargetHint();
  }

  /** Avisa antes de encolar si el idioma no tiene fuente PDF instalada. */
  function renderTargetHint() {
    var select = el('atrTargetLang');
    var hint = el('atrTargetHint');
    if (!select || !hint) return;

    var option = select.options[select.selectedIndex];
    if (option && option.getAttribute('data-unsupported') === '1') {
      hint.className = 'atr-hint atr-hint--warn';
      hint.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i>' +
        'This language needs a Unicode font on the server to render the PDF. ' +
        'Ask IT to install it before translating.';
    } else {
      hint.className = 'atr-hint';
      hint.textContent = 'The translated PDF is saved next to the original file.';
    }
  }

  function setFeedback(message, kind) {
    var box = el('atrCreateFeedback');
    if (!box) return;
    if (!message) {
      box.textContent = '';
      box.className = 'atr-feedback';
      return;
    }
    box.className = 'atr-feedback atr-feedback--' + (kind || 'info');
    box.innerHTML = message;
  }

  // ── Crear traduccion ─────────────────────────────────────
  function openTranslateModal(rowId, filename) {
    if (!rowId || !filename) return;
    ensureMarkup();
    currentRowId = rowId;
    currentFilename = filename;

    el('atrSourceFilename').innerHTML = '<i class="fas fa-file-pdf me-1"></i>' + escapeHtml(filename);
    setFeedback('');
    el('atrSubmitBtn').disabled = true;
    openModal('approvalTranslateModal');

    loadLanguages().then(function (data) {
      fillLanguageSelects(data);
      el('atrSubmitBtn').disabled = false;
    }).catch(function (err) {
      setFeedback('Could not load the language list: ' + escapeHtml(err.message), 'error');
    });
  }

  function submitTranslation() {
    var btn = el('atrSubmitBtn');
    var targetLang = el('atrTargetLang').value;
    var sourceLang = el('atrSourceLang').value;

    if (!targetLang) {
      setFeedback('Please choose a target language.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Queueing...';
    setFeedback('');

    request('/approval-translate/create', {
      method: 'POST',
      body: {
        RowID: currentRowId,
        filename: currentFilename,
        target_lang: targetLang,
        source_lang: sourceLang
      }
    }).then(function (data) {
      var translation = data.translation || {};
      var message = data.alreadyQueued
        ? 'This translation is already in progress.'
        : 'Translation queued. It runs in the background — you can keep working.';

      setFeedback('<i class="fas fa-check-circle me-1"></i>' + message, 'success');
      startPolling(currentRowId, currentFilename, translation.id);

      setTimeout(function () {
        closeModal('approvalTranslateModal');
        openTranslationsModal(currentRowId, currentFilename);
      }, 1200);
    }).catch(function (err) {
      setFeedback('<i class="fas fa-exclamation-circle me-1"></i>' + escapeHtml(err.message), 'error');
    }).finally(function () {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-language me-1"></i>Translate';
    });
  }

  // ── Polling del job ──────────────────────────────────────
  function startPolling(rowId, filename, translationId) {
    if (!translationId || pollTimers[translationId]) return;

    var attempts = 0;
    pollTimers[translationId] = setInterval(function () {
      attempts += 1;
      if (attempts > POLL_MAX_ATTEMPTS) {
        stopPolling(translationId);
        return;
      }

      request('/approval-translate/status?RowID=' + encodeURIComponent(rowId) +
        '&id=' + encodeURIComponent(translationId))
        .then(function (data) {
          var t = data.translation;
          if (!t) return;

          if (t.status === 'completed' || t.status === 'failed') {
            stopPolling(translationId);
            notifyFinished(t);
            // Refrescar la lista abierta y la lista de archivos del approval.
            var listModal = el('approvalTranslationsModal');
            if (listModal && listModal.classList.contains('open')) {
              loadTranslations(rowId, filename);
            }
            if (typeof window.ArchivosApproval === 'function') {
              window.ArchivosApproval(rowId, { highlightFilename: filename });
            }
          }
        })
        .catch(function () { /* red intermitente: se reintenta en el siguiente tick */ });
    }, POLL_INTERVAL_MS);
  }

  function stopPolling(translationId) {
    if (pollTimers[translationId]) {
      clearInterval(pollTimers[translationId]);
      delete pollTimers[translationId];
    }
  }

  /** Aviso no bloqueante al terminar el job. */
  function notifyFinished(translation) {
    var ok = translation.status === 'completed';
    var toast = document.createElement('div');
    toast.className = 'atr-toast ' + (ok ? 'atr-toast--ok' : 'atr-toast--error');
    toast.innerHTML =
      '<i class="fas ' + (ok ? 'fa-check-circle' : 'fa-exclamation-circle') + ' me-2"></i>' +
      '<div><strong>' + escapeHtml(translation.source_filename) + '</strong><br>' +
      (ok
        ? 'Translation to ' + escapeHtml(translation.target_lang_name || translation.target_lang) + ' is ready.'
        : escapeHtml(translation.error_message || 'Translation failed.')) +
      '</div>';

    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.add('atr-toast--visible'); }, 20);
    setTimeout(function () {
      toast.classList.remove('atr-toast--visible');
      setTimeout(function () { toast.remove(); }, 300);
    }, 6000);
  }

  // ── Listado de traducciones ──────────────────────────────
  function openTranslationsModal(rowId, filename) {
    if (!rowId || !filename) return;
    ensureMarkup();
    currentRowId = rowId;
    currentFilename = filename;

    el('atrListFilename').innerHTML = '<i class="fas fa-file-pdf me-1"></i>' + escapeHtml(filename);
    el('atrList').innerHTML = '<div class="atr-loading"><i class="fas fa-spinner fa-spin me-2"></i>Loading translations...</div>';
    openModal('approvalTranslationsModal');
    loadTranslations(rowId, filename);
  }

  function loadTranslations(rowId, filename) {
    request('/approval-translate/list?RowID=' + encodeURIComponent(rowId) +
      '&filename=' + encodeURIComponent(filename))
      .then(function (data) {
        renderTranslations(data.translations || [], rowId, filename);
      })
      .catch(function (err) {
        el('atrList').innerHTML =
          '<div class="atr-empty">Could not load translations: ' + escapeHtml(err.message) + '</div>';
      });
  }

  function statusBadge(status) {
    var map = {
      pending: ['atr-badge--wait', 'fa-clock', 'Queued'],
      processing: ['atr-badge--wait', 'fa-spinner fa-spin', 'Translating'],
      completed: ['atr-badge--ok', 'fa-check', 'Ready'],
      failed: ['atr-badge--error', 'fa-times', 'Failed']
    };
    var cfg = map[status] || map.pending;
    return '<span class="atr-badge ' + cfg[0] + '"><i class="fas ' + cfg[1] + ' me-1"></i>' + cfg[2] + '</span>';
  }

  function renderTranslations(translations, rowId, filename) {
    var list = el('atrList');

    if (!translations.length) {
      list.innerHTML =
        '<div class="atr-empty"><i class="fas fa-globe atr-empty__icon"></i>' +
        '<p>No translations yet for this file.</p></div>';
      return;
    }

    list.innerHTML = translations.map(function (t) {
      var meta = [
        t.created_by_name ? escapeHtml(t.created_by_name) : null,
        formatDate(t.created_at),
        t.page_count ? t.page_count + ' page(s)' : null
      ].filter(Boolean).join(' · ');

      var actions = '';
      if (t.status === 'completed') {
        actions =
          '<a class="atr-action" href="' + escapeHtml(t.file_url) + '" target="_blank" title="Open translation">' +
          '<i class="fas fa-external-link-alt"></i></a>' +
          '<a class="atr-action" href="' + escapeHtml(t.download_url) + '" title="Download">' +
          '<i class="fas fa-download"></i></a>';
      }
      actions +=
        '<button type="button" class="atr-action atr-action--danger" data-atr-delete="' + t.id + '" title="Remove from list">' +
        '<i class="fas fa-trash"></i></button>';

      var error = t.status === 'failed' && t.error_message
        ? '<div class="atr-item__error">' + escapeHtml(t.error_message) + '</div>'
        : '';

      return '<div class="atr-item">' +
        '<div class="atr-item__main">' +
        '<div class="atr-item__title">' +
        escapeHtml(t.target_lang_name || t.target_lang) +
        ' <span class="atr-item__version">v' + t.version + '</span> ' +
        statusBadge(t.status) +
        '</div>' +
        '<div class="atr-item__meta">' + escapeHtml(meta) + '</div>' +
        error +
        '</div>' +
        '<div class="atr-item__actions">' + actions + '</div>' +
        '</div>';
    }).join('');

    // Reanudar el polling de los que siguen en curso (p. ej. tras recargar).
    translations.forEach(function (t) {
      if (t.status === 'pending' || t.status === 'processing') {
        startPolling(rowId, filename, t.id);
      }
    });

    list.querySelectorAll('[data-atr-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-atr-delete');
        if (!window.confirm('Remove this translation from the list?')) return;

        request('/approval-translate/delete', {
          method: 'POST',
          body: { RowID: rowId, id: Number(id) }
        }).then(function () {
          loadTranslations(rowId, filename);
          if (typeof window.ArchivosApproval === 'function') {
            window.ArchivosApproval(rowId, { highlightFilename: filename });
          }
        }).catch(function (err) {
          window.alert('Could not remove the translation: ' + err.message);
        });
      });
    });
  }

  // ── API publica ──────────────────────────────────────────
  window.ApprovalTranslations = {
    openTranslateModal: openTranslateModal,
    openTranslationsModal: openTranslationsModal,
    resumePolling: startPolling
  };
})();
```

---

## 8. `public/css/approval-translations.css`

```css
/* ═══════════════════════════════════════════════════════════
   Approval Document Translations
   Reutiliza el contenedor `.app-modal` del mixin modal-container
   y solo aporta los estilos propios de la funcionalidad.
   ═══════════════════════════════════════════════════════════ */

:root {
  --atr-primary: #00586f;
  --atr-surface: #ffffff;
  --atr-text: #212529;
  --atr-muted: #6c757d;
  --atr-border: #dee2e6;
  --atr-hover: #f8f9fa;
}

:root[data-theme="dark"] {
  --atr-primary: #2f95ad;
  --atr-surface: #1d2128;
  --atr-text: #e4e7ec;
  --atr-muted: #96a1af;
  --atr-border: #2b313a;
  --atr-hover: #252b34;
}

/* El modal se inyecta en <body>, fuera del mixin, por lo que necesita
   las reglas base del contenedor cuando esa vista no lo incluye. */
.atr-modal {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 1060;
  background: rgba(0, 0, 0, .5);
  overflow-y: auto;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}

.atr-modal.open {
  display: flex;
}

.atr-modal .app-modal-dialog {
  width: 100%;
  background: var(--atr-surface);
  color: var(--atr-text);
  border-radius: 5px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, .25);
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
}

.atr-modal .app-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: .75rem 1rem;
  border-bottom: 2px solid var(--atr-primary);
}

.atr-modal .app-modal-title {
  margin: 0;
  color: var(--atr-text);
}

.atr-modal .app-modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: var(--atr-muted);
}

.atr-modal .app-modal-body {
  padding: 1.25rem;
  overflow-y: auto;
  flex: 1 1 auto;
}

.atr-modal .app-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: .75rem 1rem;
  border-top: 1px solid var(--atr-border);
}

.atr-btn-primary {
  background-color: var(--atr-primary);
  color: #e9ecef;
  border: none;
}

.atr-btn-primary:hover:not(:disabled) {
  filter: brightness(1.1);
  color: #fff;
}

.atr-btn-primary:disabled {
  opacity: .65;
}

/* ── Formulario ───────────────────────────────────────────── */
.atr-filename {
  font-size: .9rem;
  font-weight: 600;
  color: var(--atr-primary);
  margin-bottom: 1rem;
  word-break: break-all;
}

.atr-field {
  margin-bottom: 1rem;
}

.atr-label {
  display: block;
  font-size: .8rem;
  font-weight: 600;
  color: var(--atr-muted);
  margin-bottom: .35rem;
  text-transform: uppercase;
  letter-spacing: .02em;
}

.atr-hint {
  display: block;
  margin-top: .35rem;
  font-size: .78rem;
  color: var(--atr-muted);
}

.atr-hint--warn {
  color: #b26a00;
}

:root[data-theme="dark"] .atr-hint--warn {
  color: #e0a458;
}

.atr-feedback {
  font-size: .85rem;
  margin-top: .5rem;
  min-height: 1.2rem;
}

.atr-feedback--success { color: #1a7f45; }
.atr-feedback--error   { color: #c0392b; }
.atr-feedback--info    { color: var(--atr-muted); }

:root[data-theme="dark"] .atr-feedback--success { color: #58c98a; }
:root[data-theme="dark"] .atr-feedback--error   { color: #ef8a80; }

/* ── Listado de traducciones ──────────────────────────────── */
.atr-list {
  display: flex;
  flex-direction: column;
  gap: .5rem;
}

.atr-loading,
.atr-empty {
  text-align: center;
  padding: 1.75rem 1rem;
  color: var(--atr-muted);
  font-size: .9rem;
}

.atr-empty__icon {
  display: block;
  font-size: 2rem;
  margin-bottom: .6rem;
  opacity: .45;
}

.atr-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: .7rem .9rem;
  border: 1px solid var(--atr-border);
  border-radius: 5px;
  transition: background-color .15s ease;
}

.atr-item:hover {
  background: var(--atr-hover);
}

.atr-item__main {
  min-width: 0;
  flex: 1;
}

.atr-item__title {
  font-size: .92rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: .4rem;
  flex-wrap: wrap;
}

.atr-item__version {
  font-size: .75rem;
  font-weight: 500;
  color: var(--atr-muted);
}

.atr-item__meta {
  font-size: .78rem;
  color: var(--atr-muted);
  margin-top: .2rem;
}

.atr-item__error {
  font-size: .78rem;
  color: #c0392b;
  margin-top: .3rem;
}

.atr-item__actions {
  display: flex;
  gap: .25rem;
  flex-shrink: 0;
}

.atr-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--atr-border);
  border-radius: 4px;
  background: transparent;
  color: var(--atr-primary);
  font-size: .85rem;
  cursor: pointer;
  text-decoration: none;
}

.atr-action:hover {
  background: var(--atr-primary);
  color: #fff;
}

.atr-action--danger {
  color: #c0392b;
}

.atr-action--danger:hover {
  background: #c0392b;
  color: #fff;
}

/* ── Badges de estado ─────────────────────────────────────── */
.atr-badge {
  font-size: .7rem;
  font-weight: 600;
  padding: .15rem .45rem;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: .02em;
}

.atr-badge--ok    { background: #d6f2e0; color: #1a7f45; }
.atr-badge--wait  { background: #fdf1d4; color: #8a6100; }
.atr-badge--error { background: #fadbd8; color: #a4271c; }

:root[data-theme="dark"] .atr-badge--ok    { background: #1c3b2a; color: #6fd79c; }
:root[data-theme="dark"] .atr-badge--wait  { background: #3b3320; color: #e0b45e; }
:root[data-theme="dark"] .atr-badge--error { background: #3d2320; color: #ef8a80; }

/* ── Toast de fin de job ──────────────────────────────────── */
.atr-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1080;
  display: flex;
  align-items: flex-start;
  gap: .3rem;
  max-width: 340px;
  padding: .85rem 1rem;
  border-radius: 6px;
  background: var(--atr-surface);
  color: var(--atr-text);
  border-left: 4px solid var(--atr-primary);
  box-shadow: 0 6px 24px rgba(0, 0, 0, .18);
  font-size: .86rem;
  opacity: 0;
  transform: translateY(12px);
  transition: opacity .25s ease, transform .25s ease;
}

.atr-toast--visible {
  opacity: 1;
  transform: translateY(0);
}

.atr-toast--ok    { border-left-color: #1a7f45; }
.atr-toast--error { border-left-color: #c0392b; }

/* ── Botones en la lista de archivos ──────────────────────── */
.file_action_btn .fa-language {
  color: var(--atr-primary);
}

.file_translation_count {
  font-size: .7rem;
  font-weight: 600;
  color: var(--atr-primary);
  margin-left: 2px;
}

@media (max-width: 768px) {
  .atr-modal {
    padding: 10px;
  }

  .atr-item {
    flex-direction: column;
    align-items: flex-start;
    gap: .5rem;
  }

  .atr-toast {
    left: 16px;
    right: 16px;
    max-width: none;
  }
}
```

---

## 9. `Approvals_functions/TRANSLATIONS.md`

````markdown
# Traducción de documentos en Approvals

Lleva la herramienta `Tools/translator` al detalle de un approval: cada archivo
traducible gana un botón **Translate** (elige idioma) y, cuando ya tiene
traducciones, un botón **Open translation** (un archivo puede tener varias).

El PDF traducido se guarda **en la misma carpeta del archivo original**, así que
viaja con el expediente cuando se copian los directorios.

---

## Arquitectura

El pipeline reutiliza los servicios que ya existían en `Tools/` en lugar de
duplicar la lógica de OCR y de traducción:

```
archivo original (UNC)
   └─> Tools/services/extraction-service.js     texto embebido o OCR
        └─> Tools/services/translation-service.js   traducción vía IA
             └─> translation-pdf-service.js         compone el PDF nuevo
                  └─> se escribe junto al original
```

### Separación de responsabilidades

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Datos | `models/translations.js` | Único punto que conoce las tablas. Sin rutas ni HTTP. |
| Dominio | `services/translation-pdf-service.js` | Bytes de entrada → bytes de PDF. Sin BD ni Express: testeable y reutilizable desde CRM/IT. |
| Dominio | `services/translation-fonts.js` | Qué fuente usar por idioma y si el idioma es exportable. |
| Infra | `services/translation-job-runner.js` | Cola en background, concurrencia, reintentos. |
| HTTP | `controllers/approval_translations.js` | Validación, sesión, formato de respuesta. |
| Ruteo | `APPROVALS/routes/approvals-routes.js` | Solo cablea rutas a métodos. |
| UI | `public/js/approval-translations.js` | Modales, polling y avisos. Autocontenido. |

La resolución de la ruta física reutiliza `shared/approval-file-routing.js`, el
mismo módulo que ya usaban las firmas digitales — no se duplicó esa lógica.

---

## Procesamiento asíncrono

Una traducción puede tardar minutos (OCR + varias llamadas al modelo), demasiado
para un request HTTP. Por eso:

1. `POST /approval-translate/create` solo **encola** el job y responde al instante.
2. `translation-job-runner.js` lo procesa fuera del request.
3. El frontend hace polling de `/approval-translate/status` y avisa con un toast.

La cola está **persistida en la tabla**, no en memoria: si el proceso se reinicia
a mitad de una traducción, el job vuelve a `pending` al arrancar y se reintenta.

### Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `TRANSLATION_MAX_CONCURRENT` | `1` | Traducciones en paralelo. Subirlo satura más el servicio de IA. |
| `TRANSLATION_IDLE_POLL_MS` | `15000` | Cada cuánto revisa la cola si nadie la despierta. |
| `TRANSLATION_STALE_MINUTES` | `30` | Tras cuántos minutos un job colgado se re-encola. |
| `TRANSLATION_CHUNK_CHARS` | `3500` | Tamaño de los bloques enviados al modelo. |
| `TRANSLATION_FONT_DIR` | `public/font` | Dónde buscar las fuentes Unicode. |

Reutiliza `AI_ENDPOINT` y `AI_MODEL`, ya configuradas para el módulo `AI/`.

---

## Instalación

### 1. Base de datos

```sql
-- Ejecutar una vez
:r sql/approval_translations.sql
```

Crea `approval_translations` (jobs + resultados) y
`approval_translation_audit_log` (quién generó, abrió o eliminó qué).

### 2. Dependencias

```bash
npm install
```

Agrega `@pdf-lib/fontkit`, necesario para incrustar fuentes Unicode.

### 3. Fuentes por idioma ⚠️

`pdf-lib` solo trae fuentes WinAnsi, que cubren **inglés, español, francés,
alemán, italiano y portugués**. Para los demás idiomas hay que copiar la fuente
correspondiente a `public/font/` (o a `TRANSLATION_FONT_DIR`):

| Idioma | Archivo esperado |
|---|---|
| Ruso, Vietnamita | `NotoSans-Regular.ttf` |
| Árabe | `NotoNaskhArabic-Regular.ttf` |
| Hebreo | `NotoSansHebrew-Regular.ttf` |
| Hindi | `NotoSansDevanagari-Regular.ttf` |
| Tailandés | `NotoSansThai-Regular.ttf` |
| Japonés | `NotoSansJP-Regular.otf` |
| Coreano | `NotoSansKR-Regular.otf` |
| Chino simplificado | `NotoSansSC-Regular.otf` |
| Chino tradicional | `NotoSansTC-Regular.otf` |

El sistema **no se conforma con encontrar el archivo**: verifica con fontkit que
la fuente tenga glifos reales para ese alfabeto. Una fuente latina no se acepta
para árabe, precisamente para no generar PDFs llenos de cuadros vacíos.

Los idiomas sin fuente aparecen marcados como *(PDF font not installed)* en el
selector, así el usuario lo ve **antes** de encolar, no cuando el job falla.

---

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/approval-translate/languages` | Idiomas y cuáles son exportables aquí |
| POST | `/approval-translate/create` | Encola una traducción |
| GET | `/approval-translate/list` | Traducciones de un archivo |
| GET | `/approval-translate/status` | Estado de un job (polling) |
| GET | `/approval-translate/file` | Sirve o descarga el PDF (`&dl=1`) |
| POST | `/approval-translate/delete` | Borrado lógico |

Todos pasan por `requireAuth`. `create` verifica además que el archivo pertenezca
realmente a ese approval, y los nombres se validan contra path traversal.

---

## Convención de nombres

```
contrato.pdf  →  contrato_translated_ara_v1.pdf
              →  contrato_translated_ara_v2.pdf   (re-traducción)
              →  contrato_translated_spa_v1.pdf   (otro idioma)
```

La versión es por `(approval, archivo, idioma)`, así que un mismo documento puede
tener varias traducciones conviviendo, que es justo lo que pide la UI.

---

## Notas de diseño

- **El PDF traducido es un documento nuevo con solo el texto**, no un calco del
  layout original. Reconstruir el layout de un escaneo da resultados
  impredecibles; esta opción es la fiable.
- Lleva una nota visible de *machine translation* para que nadie tome decisiones
  legales sobre un texto sin revisar.
- El borrado es lógico: el PDF permanece en disco porque forma parte del
  expediente, pero deja de listarse.
- El conteo de traducciones de la lista de archivos se resuelve con **una sola
  consulta por approval**, no una por archivo.
- Si las tablas aún no están desplegadas, la lista de archivos sigue funcionando
  (el error se registra y se degrada silenciosamente).

## Extender a CRM u otros módulos

`translation-pdf-service.js` y `translation-fonts.js` no dependen de APPROVALS.
Para reutilizarlos basta con aportar la resolución de rutas y una tabla propia,
igual que `pdf-text-writer.js` ya se comparte hoy entre APPROVALS y CRM.
````

---

# Parte 2 — Ediciones a archivos existentes

Aquí **no** se reemplaza el archivo entero: solo se insertan los fragmentos indicados.

---

## 10. `Approvals.js`

**a)** Junto al resto de imports, después de `import toolsRoutes ...`:

```javascript
import { startTranslationJobRunner } from './Approvals_functions/services/translation-job-runner.js';
```

**b)** Dentro de `sql.connect(sqlConfig).then((pool) => {`, justo después de `observeDbPool(pool);`:

```javascript
    // Procesador en background de las traducciones de documentos (APPROVALS).
    startTranslationJobRunner(sqlConfig);
```

---

## 11. `APPROVALS/routes/approvals-routes.js`

**a)** Después de `import DigitalSignaturesController ...`:

```javascript
import ApprovalTranslationsController from '../../Approvals_functions/controllers/approval_translations.js';
```

**b)** Después del bloque de rutas `/pdf-sign/...` (tras `router.get("/pdf-sign/signed-file", ...)`):

```javascript
    // ── Document translation endpoints ───────────────────────────
    router.get("/approval-translate/languages", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.getLanguages(sqlConfig, req, res);
    })
    router.post("/approval-translate/create", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.createTranslation(sqlConfig, req, res);
    })
    router.get("/approval-translate/list", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.listTranslations(sqlConfig, req, res);
    })
    router.get("/approval-translate/status", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.getStatus(sqlConfig, req, res);
    })
    router.get("/approval-translate/file", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.serveTranslationFile(sqlConfig, req, res);
    })
    router.post("/approval-translate/delete", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.deleteTranslation(sqlConfig, req, res);
    })
```

---

## 12. `Approvals_functions/controllers/approval_functions.js`

**a)** Después de `import { resolveApprovalFileFullPath } ...`:

```javascript
import ApprovalTranslationsModel from '../models/translations.js';
import { isTranslatableFile } from '../services/translation-pdf-service.js';
```

**b)** En `postApprovalArchiveslIST`, después de `const files = [];`:

```javascript
            // Traducciones existentes por archivo (una sola consulta para todo
            // el approval, en lugar de una por archivo).
            const translationCounts = new Map();
            try {
                const counts = await ApprovalTranslationsModel.countByApproval(transaction, RowID);
                for (const row of counts) {
                    translationCounts.set(row.source_filename, {
                        completed: Number(row.completed_count) || 0,
                        pending: Number(row.pending_count) || 0,
                    });
                }
            } catch (translationErr) {
                // La lista de archivos no debe romperse si el modulo de
                // traducciones aun no esta desplegado en esta base.
                console.error('[Translations] count lookup failed:', translationErr.message);
            }
```

**c)** En el mismo método, justo antes de `files.push({ type: 'file', ...`:

```javascript
                const translations = translationCounts.get(filename) || { completed: 0, pending: 0 };
```

y **dentro** de ese `files.push({...})`, después de `download_url: downloadUrl,`:

```javascript
                    // ── Traduccion de documentos ──────────────────────
                    is_translatable: isTranslatableFile(filename),
                    translation_count: translations.completed,
                    translation_pending: translations.pending,
                    has_translations: translations.completed > 0,
```

---

## 13. `public/scripts.js`

**a)** Justo **antes** de `function ArchivosApproval(RowID = 0, options = {}) {`:

```javascript
/**
 * Agrega los botones de traduccion a la fila de un archivo.
 *
 * - "Translate": abre el modal de seleccion de idioma (encola un job).
 * - "Open translation": solo si el archivo ya tiene traducciones; abre el
 *   listado, porque un mismo archivo puede tener varias.
 *
 * Toda la logica vive en window.ApprovalTranslations
 * (public/js/approval-translations.js); aqui solo se cablean los botones.
 */
function appendTranslationActions(actionsContainer, rowId, item) {
    if (!actionsContainer || !item || !item.is_translatable) return;
    if (!window.ApprovalTranslations) return; // modulo no cargado en esta vista

    var btnTranslate = document.createElement('a');
    btnTranslate.href = '#';
    btnTranslate.title = 'Translate this document';
    btnTranslate.className = 'file_action_btn';
    btnTranslate.innerHTML = '<i class="fas fa-language secondIcon"></i>';
    btnTranslate.onclick = function (e) {
        e.preventDefault();
        window.ApprovalTranslations.openTranslateModal(rowId, item.filename);
        return false;
    };
    actionsContainer.appendChild(btnTranslate);

    var hasTranslations = item.has_translations || Number(item.translation_pending) > 0;
    if (!hasTranslations) return;

    var count = Number(item.translation_count) || 0;
    var pending = Number(item.translation_pending) || 0;

    var btnOpen = document.createElement('a');
    btnOpen.href = '#';
    btnOpen.title = pending > 0
        ? 'Open translation (' + pending + ' in progress)'
        : 'Open translation';
    btnOpen.className = 'file_action_btn';
    btnOpen.innerHTML = '<i class="fas fa-globe secondIcon"></i>' +
        (count > 0 ? '<span class="file_translation_count">' + count + '</span>' : '') +
        (pending > 0 ? '<i class="fas fa-spinner fa-spin secondIcon" style="margin-left:3px;"></i>' : '');
    btnOpen.onclick = function (e) {
        e.preventDefault();
        window.ApprovalTranslations.openTranslationsModal(rowId, item.filename);
        return false;
    };
    actionsContainer.appendChild(btnOpen);
}
```

**b)** Dentro de `ArchivosApproval`, en la rama de **imágenes** (`if (item.is_image) {`), después de `actions.appendChild(link);`:

```javascript
                        appendTranslationActions(actions, id, item);
```

**c)** En la rama de **PDFs** (`} else if (item.is_pdf) {`), después de `actions.appendChild(btnDownload);`:

```javascript
                        appendTranslationActions(actions, id, item);
```

---

## 14. `views/layout.pug`

**a)** En el bloque `if(title=='Approval Details')` de los CSS, después de `link(rel="stylesheet" href="/css/pdf-viewer.css")`:

```pug
      link(rel="stylesheet" href="/css/approval-translations.css")
```

**b)** En el bloque `if(title=='Approval Details')` de los scripts, después de `script(src='/js/pdf-viewer-sign.js')`:

```pug
      script(src='/js/approval-translations.js')
```

---

## 15. `package.json`

En `dependencies`, después de `"@kenjiuno/msgreader"`:

```json
        "@pdf-lib/fontkit": "^1.1.1",
```

---

# Puesta en marcha

```bash
# 1. Tablas (una sola vez)
#    Ejecutar sql/approval_translations.sql en SQL Server

# 2. Dependencias
npm install

# 3. Fuentes Unicode (solo para idiomas no latinos)
#    Copiar los .ttf/.otf de Noto a public/font/
#    Ver la tabla de fuentes en Approvals_functions/TRANSLATIONS.md

# 4. Reiniciar la app
```

Sin fuentes adicionales funcionan inglés, español, francés, alemán, italiano y
portugués. Los demás idiomas aparecen marcados como *(PDF font not installed)*
en el selector hasta que se instale la fuente correspondiente.
