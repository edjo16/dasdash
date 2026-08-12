/* ============================================================
   Translation PDF — generation service
   ------------------------------------------------------------
   Orquesta el pipeline de una traduccion, en dos mitades separadas
   a proposito:

     extractAndTranslate()  — la parte cara, en background
       archivo original (pdf / imagen / documento ofimatico)
            -> extraccion de texto  (extraction-service / office-extraction-service)
            -> traduccion por IA    (Tools/services/translation-service)

     buildTranslatedPdf()   — la parte barata, a peticion del usuario
       texto revisado -> PDF nuevo (pdf-lib)

   Entre las dos, el usuario revisa (y corrige) el texto. Asi no se
   escriben documentos que nadie ha mirado dentro del expediente.

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
import {
    extractFromDocument,
    isSupportedDocument,
} from '../../Tools/services/office-extraction-service.js';
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

/**
 * True si el archivo es traducible por esta funcionalidad.
 * Cubre PDF, imagenes (via OCR) y documentos ofimaticos: Word moderno
 * (.docx y variantes), OpenDocument, RTF y texto plano.
 *
 * Word 97-2003 (.doc) queda fuera a proposito — ver
 * Tools/services/office-extraction-service.js.
 */
export function isTranslatableFile(filename) {
    const name = String(filename || '');
    return PDF_EXT.test(name) || IMAGE_EXT.test(name) || isSupportedDocument(name);
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
 * @param {number} [params.approvalId] Atajo para APPROVALS; equivale a
 *        documentRef = `Approval: <id>`.
 * @param {string} [params.documentRef] Referencia libre del expediente que
 *        origina la traduccion (p. ej. `CRM: 1234 · Message: 56`). La usan
 *        los modulos distintos de APPROVALS.
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
        documentRef,
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
    pdfDoc.setProducer('DasDash — Document Translation');
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
        documentRef || (approvalId ? `Approval: ${approvalId}` : null),
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
 * Etapa cara del pipeline: bytes del archivo original -> texto traducido.
 *
 * Se separa de la composicion del PDF porque es la unica parte lenta
 * (OCR + varias llamadas al modelo) y porque su resultado es lo que el
 * usuario revisa en el preview antes de decidir si quiere el documento.
 *
 * @param {object} params
 * @param {Buffer} params.sourceBytes
 * @param {string} params.sourceFilename
 * @param {string} params.targetCode
 * @param {string} [params.sourceCode='auto']
 * @param {(stage:string, detail:object)=>void} [params.onProgress]
 * @returns {Promise<{ translatedText:string, charCount:number,
 *                     extractionMethod:string, sourcePageCount:number }>}
 */
export async function extractAndTranslate(params) {
    const {
        sourceBytes,
        sourceFilename,
        targetCode,
        sourceCode = 'auto',
        onProgress = () => {},
    } = params;

    if (!isTranslatableFile(sourceFilename)) {
        const error = new Error('File type not supported for translation');
        error.code = 'UNSUPPORTED_FILE';
        throw error;
    }

    // 1) Extraccion segun el tipo de archivo.
    //    - PDF:        texto embebido y, si es escaneo, OCR.
    //    - Imagen:     siempre OCR.
    //    - Documentos: lectura directa del formato (sin OCR).
    onProgress('extracting', {});
    let extraction;
    if (PDF_EXT.test(sourceFilename)) {
        extraction = await extractFromPdf(sourceBytes, { code: sourceCode, preprocess: true });
    } else if (IMAGE_EXT.test(sourceFilename)) {
        extraction = await extractFromImage(sourceBytes, { code: sourceCode, preprocess: true });
    } else {
        extraction = await extractFromDocument(sourceBytes, sourceFilename);
    }

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

    return {
        translatedText,
        charCount: translatedText.length,
        extractionMethod: extraction.method || null,
        sourcePageCount: extraction.pageCount || 0,
    };
}

/*
 * No hay un `generateTranslatedPdf` de un solo paso a proposito: el flujo
 * es siempre traducir -> revisar -> generar. Quien necesite encadenarlo
 * sin intervencion del usuario compone `extractAndTranslate` y
 * `buildTranslatedPdf`, que es exactamente lo que hace el motor de jobs.
 */
