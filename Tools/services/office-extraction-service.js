/* ============================================================
   Tools — Office / text document extraction
   ------------------------------------------------------------
   Extrae texto plano de documentos ofimaticos, complementando a
   `extraction-service.js` (que cubre PDF e imagenes via OCR).

   Formatos soportados:
     .docx .docm .dotx .dotm  Word moderno (OOXML)  — nativo, sin dependencias
     .odt  .ott               OpenDocument          — nativo, sin dependencias
     .rtf                     Rich Text Format      — nativo, sin dependencias
     .txt .md .csv .log       Texto plano           — nativo

   Word 97-2003 (`.doc` binario) queda deliberadamente fuera: es un
   contenedor OLE2 con estructuras propietarias que exigiria una
   dependencia externa (`word-extractor`) para un formato practicamente
   extinto. Se rechaza con un mensaje que indica la salida obvia:
   abrir el archivo y guardarlo como .docx.

   Los OOXML/ODT son ZIPs, y el unico entry que interesa es el XML del
   documento. Por eso se implementa un lector ZIP minimo sobre `zlib`
   (nativo de Node) en lugar de arrastrar una libreria completa.
   ============================================================ */
import { inflateRawSync } from 'zlib';

/* ── Constantes del formato ZIP ───────────────────────────── */
const EOCD_SIGNATURE = 0x06054b50;   // End of Central Directory
const CDFH_SIGNATURE = 0x02014b50;   // Central Directory File Header
const LFH_SIGNATURE = 0x04034b50;    // Local File Header
const MAX_COMMENT_SIZE = 0xffff;

/**
 * Localiza el End of Central Directory, que puede estar desplazado si
 * el ZIP lleva comentario al final.
 */
function findEndOfCentralDirectory(buffer) {
    const minPos = Math.max(0, buffer.length - MAX_COMMENT_SIZE - 22);
    for (let i = buffer.length - 22; i >= minPos; i--) {
        if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
    }
    return -1;
}

/**
 * Lee un unico entry del ZIP por nombre exacto, sin descomprimir el resto.
 *
 * @param {Buffer} buffer
 * @param {string} entryName p. ej. 'word/document.xml'
 * @returns {Buffer|null}
 */
export function readZipEntry(buffer, entryName) {
    if (!buffer || buffer.length < 22) return null;

    const eocd = findEndOfCentralDirectory(buffer);
    if (eocd < 0) return null;

    const entryCount = buffer.readUInt16LE(eocd + 10);
    let offset = buffer.readUInt32LE(eocd + 16);

    for (let i = 0; i < entryCount; i++) {
        if (offset + 46 > buffer.length) return null;
        if (buffer.readUInt32LE(offset) !== CDFH_SIGNATURE) return null;

        const compressionMethod = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

        if (name === entryName) {
            // El header local repite nombre/extra con longitudes propias.
            if (buffer.readUInt32LE(localHeaderOffset) !== LFH_SIGNATURE) return null;
            const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
            const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
            const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
            const data = buffer.subarray(dataStart, dataStart + compressedSize);

            if (compressionMethod === 0) return Buffer.from(data);   // almacenado
            if (compressionMethod === 8) return inflateRawSync(data); // deflate
            return null; // metodo no soportado (bzip2, lzma...)
        }

        offset += 46 + nameLength + extraLength + commentLength;
    }

    return null;
}

/** Decodifica las entidades XML mas comunes. */
function decodeXmlEntities(text) {
    return String(text)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&amp;/g, '&'); // siempre al final
}

/**
 * Normaliza espacios y saltos sin destruir la separacion de parrafos.
 * Los tabuladores se conservan: son el separador de celdas de tabla, y
 * colapsarlos a espacios haria ilegible cualquier documento tabular.
 */
function normalizeText(text) {
    return String(text)
        .replace(/\r\n?/g, '\n')
        .replace(/\u00A0/g, ' ')
        .split('\n')
        .map((line) => line
            .replace(/ +/g, ' ')      // runs de espacios -> uno
            .replace(/\t+/g, '\t')    // runs de tabs -> uno
            .replace(/ ?\t ?/g, '\t') // espacios pegados al tab sobran
            .replace(/^[ \t]+|[ \t]+$/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Convierte el XML de un documento OOXML/ODT a texto plano, respetando
 * parrafos, saltos de linea, tabulaciones y celdas de tabla.
 *
 * Se procesan las etiquetas de Word (w:) y de OpenDocument (text:).
 */
function xmlToText(xml) {
    let text = String(xml);

    // Bloques cuyo contenido no forma parte del cuerpo del documento.
    text = text.replace(/<w:instrText[\s\S]*?<\/w:instrText>/g, '');
    text = text.replace(/<office:annotation[\s\S]*?<\/office:annotation>/g, '');

    // Separadores estructurales -> saltos de linea.
    text = text.replace(/<w:br\b[^>]*\/?>/g, '\n');
    text = text.replace(/<w:cr\b[^>]*\/?>/g, '\n');
    text = text.replace(/<w:tab\b[^>]*\/?>/g, '\t');
    text = text.replace(/<text:tab\b[^>]*\/?>/g, '\t');
    text = text.replace(/<text:line-break\b[^>]*\/?>/g, '\n');
    text = text.replace(/<text:s\b[^>]*\/?>/g, ' ');

    /*
     * Celdas de tabla. Una celda contiene parrafos propios, y si su cierre
     * se tradujera a salto de linea cada celda caeria en su propia fila y
     * se perderia la estructura de la tabla. Por eso primero se aplanan
     * los parrafos DENTRO de cada celda y luego la celda entera se cierra
     * con un tabulador.
     */
    const flattenCell = (openTag, closeTag, innerParagraphEnd) => {
        const cellRe = new RegExp(`<${openTag}\\b[^>]*>([\\s\\S]*?)<\\/${closeTag}>`, 'g');
        text = text.replace(cellRe, (_, inner) =>
            inner.replace(innerParagraphEnd, ' ') + '\t');
    };
    flattenCell('w:tc', 'w:tc', /<\/w:p>/g);
    flattenCell('table:table-cell', 'table:table-cell', /<\/text:(?:p|h)>/g);

    // Fin de parrafo / fila.
    text = text.replace(/<\/w:p>/g, '\n');
    text = text.replace(/<\/w:tr>/g, '\n');
    text = text.replace(/<\/text:p>/g, '\n');
    text = text.replace(/<\/text:h>/g, '\n');
    text = text.replace(/<\/table:table-row>/g, '\n');

    // Resto de etiquetas fuera; queda solo el contenido textual.
    text = text.replace(/<[^>]+>/g, '');

    return normalizeText(decodeXmlEntities(text));
}

/** Texto de un .docx / .docm / .dotx / .dotm. */
export function extractFromDocxBuffer(buffer) {
    const documentXml = readZipEntry(buffer, 'word/document.xml');
    if (!documentXml) {
        const error = new Error('The Word file appears to be corrupted or is not a valid .docx');
        error.code = 'INVALID_DOCX';
        throw error;
    }
    return xmlToText(documentXml.toString('utf8'));
}

/** Texto de un .odt / .ott. */
export function extractFromOdtBuffer(buffer) {
    const contentXml = readZipEntry(buffer, 'content.xml');
    if (!contentXml) {
        const error = new Error('The OpenDocument file appears to be corrupted');
        error.code = 'INVALID_ODT';
        throw error;
    }
    return xmlToText(contentXml.toString('utf8'));
}

/**
 * Texto de un .rtf.
 * RTF mezcla texto con grupos de control; se descartan los grupos de
 * metadatos y se traducen los escapes hexadecimales y de unicode.
 */
export function extractFromRtfBuffer(buffer) {
    let rtf = buffer.toString('binary');

    // Grupos ignorables completos (fuentes, colores, info del documento...).
    rtf = rtf.replace(/\{\\\*[\s\S]*?\}/g, '');
    rtf = rtf.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pgdsctbl)[\s\S]*?\}/g, '');

    // Escapes unicode: \uNNNN seguido de un caracter de reemplazo.
    rtf = rtf.replace(/\\u(-?\d+)\s?\??/g, (_, code) => {
        let value = parseInt(code, 10);
        if (value < 0) value += 65536;
        return String.fromCharCode(value);
    });

    // Escapes hexadecimales \'hh.
    rtf = rtf.replace(/\\'([0-9a-f]{2})/gi, (_, hex) =>
        Buffer.from([parseInt(hex, 16)]).toString('latin1'));

    // Escapes de llaves y barra literales. Se protegen con marcadores
    // para que la limpieza posterior de `{}` no se los lleve por delante.
    const LBRACE = '\u0001';
    const RBRACE = '\u0002';
    const BACKSLASH = '\u0003';
    rtf = rtf.replace(/\\\\/g, BACKSLASH)
             .replace(/\\\{/g, LBRACE)
             .replace(/\\\}/g, RBRACE);

    // Saltos de parrafo y linea.
    rtf = rtf.replace(/\\(?:par|line|pard)\b/g, '\n');
    rtf = rtf.replace(/\\tab\b/g, '\t');

    // Resto de palabras de control y llaves de agrupacion.
    rtf = rtf.replace(/\\[a-z]+-?\d*\s?/gi, '');
    rtf = rtf.replace(/[{}]/g, '');

    // Escapes de caracteres no alfabeticos (\%, \-, \_, \~...): se
    // conserva el caracter y se descarta la barra.
    rtf = rtf.replace(/\\([^a-zA-Z])/g, '$1');

    // Restaurar los literales protegidos.
    rtf = rtf.split(LBRACE).join('{')
             .split(RBRACE).join('}')
             .split(BACKSLASH).join('\\');

    return normalizeText(rtf);
}

/** Texto plano, tolerante a BOM y a UTF-16. */
export function extractFromPlainTextBuffer(buffer) {
    if (buffer.length >= 2) {
        if (buffer[0] === 0xff && buffer[1] === 0xfe) return normalizeText(buffer.toString('utf16le', 2));
        if (buffer[0] === 0xfe && buffer[1] === 0xff) {
            const swapped = Buffer.from(buffer.subarray(2));
            swapped.swap16();
            return normalizeText(swapped.toString('utf16le'));
        }
    }
    let text = buffer.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return normalizeText(text);
}

/* ── Registro de formatos ─────────────────────────────────── */

const OOXML_EXT = /\.(docx|docm|dotx|dotm)$/i;
const ODT_EXT = /\.(odt|ott)$/i;
const RTF_EXT = /\.rtf$/i;
const PLAIN_EXT = /\.(txt|md|markdown|csv|log)$/i;

/** Word binario: reconocido solo para dar un mensaje util al rechazarlo. */
const LEGACY_DOC_EXT = /\.(doc|dot)$/i;

/** True si este servicio puede extraer texto del archivo. */
export function isSupportedDocument(filename) {
    const name = String(filename || '');
    return OOXML_EXT.test(name)
        || ODT_EXT.test(name)
        || RTF_EXT.test(name)
        || PLAIN_EXT.test(name);
}

/** True si es un Word 97-2003, que se rechaza con instrucciones. */
export function isLegacyDoc(filename) {
    return LEGACY_DOC_EXT.test(String(filename || ''));
}

/** Etiqueta legible del formato, para mensajes de UI. */
export function getDocumentKind(filename) {
    const name = String(filename || '');
    if (OOXML_EXT.test(name)) return 'word';
    if (ODT_EXT.test(name)) return 'opendocument';
    if (RTF_EXT.test(name)) return 'rtf';
    if (PLAIN_EXT.test(name)) return 'text';
    if (LEGACY_DOC_EXT.test(name)) return 'word-legacy';
    return null;
}

/**
 * Extrae texto de un documento ofimatico.
 * Misma forma de retorno que `extraction-service.js` para que las capas
 * superiores traten todos los formatos de manera uniforme.
 *
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {Promise<{ text:string, detectedLang:string, method:string, pageCount:number }>}
 */
export async function extractFromDocument(buffer, filename) {
    const kind = getDocumentKind(filename);
    let text = '';

    switch (kind) {
        case 'word':
            text = extractFromDocxBuffer(buffer);
            break;
        case 'opendocument':
            text = extractFromOdtBuffer(buffer);
            break;
        case 'rtf':
            text = extractFromRtfBuffer(buffer);
            break;
        case 'text':
            text = extractFromPlainTextBuffer(buffer);
            break;
        case 'word-legacy': {
            const error = new Error(
                'Word 97-2003 files (.doc) are not supported. Open the document '
                + 'and save it as .docx, then try again.',
            );
            error.code = 'LEGACY_DOC_UNSUPPORTED';
            throw error;
        }
        default: {
            const error = new Error('Unsupported document type');
            error.code = 'UNSUPPORTED_FILE';
            throw error;
        }
    }

    return {
        text,
        detectedLang: '',
        method: kind === 'text' ? 'plain' : 'document',
        // Los formatos de flujo continuo no tienen paginacion fija.
        pageCount: 0,
    };
}
