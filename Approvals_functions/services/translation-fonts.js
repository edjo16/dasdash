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
