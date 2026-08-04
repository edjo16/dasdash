/**
 * Extracción de texto desde archivos (imágenes y PDFs).
 *
 * Estrategia híbrida para PDFs (decisión de diseño acordada):
 *   1. Se intenta extraer el texto embebido con `pdf-parse` (rápido, alta
 *      calidad, sin OCR). Cubre PDFs "digitales".
 *   2. Si el PDF apenas contiene texto (escaneado), se rasterizan sus páginas
 *      con `pdf-to-img` y se pasan por OCR (tesseract.js) — reemplazo de la
 *      conversión PyMuPDF -> OCR del prototipo Python.
 *
 * Las imágenes van directamente al OCR.
 */
import { ocrImage, ocrPages } from './ocr-service.js';
import { significantLength } from '../utils/text-clean.js';

// Umbral de caracteres significativos por página para considerar un PDF
// "digital" (con texto embebido) y evitar el OCR.
const DIGITAL_PDF_MIN_CHARS_PER_PAGE = 20;
const DEFAULT_DPI = 200;

let pdfParserPromise = null;

async function getPdfParser() {
  if (!pdfParserPromise) {
    pdfParserPromise = import('pdf-parse')
      .then((mod) => mod?.PDFParse || mod?.default?.PDFParse || null)
      .catch((err) => {
        console.error('[Tools] pdf-parse load error:', err);
        return null;
      });
  }
  return pdfParserPromise;
}

/** Extrae texto embebido de un PDF con pdf-parse. */
async function extractEmbeddedPdfText(buffer) {
  const ParserClass = await getPdfParser();
  if (!ParserClass) return { text: '', pages: 0 };

  const parser = new ParserClass({ data: buffer });
  try {
    const result = await parser.getText();
    return {
      text: String(result?.text || '').replace(/\r\n?/g, '\n').trim(),
      pages: Number(result?.total || 0)
    };
  } finally {
    try {
      await parser.destroy();
    } catch (_) {}
  }
}

/** Rasteriza las páginas de un PDF a buffers PNG usando pdf-to-img. */
async function rasterizePdf(buffer, dpi) {
  const { pdf } = await import('pdf-to-img');
  const scale = Math.max(1, dpi / 72);
  const document = await pdf(buffer, { scale });

  const images = [];
  for await (const page of document) {
    images.push(page); // Buffer PNG
  }
  return images;
}

/**
 * Extrae texto de un PDF (estrategia híbrida).
 *
 * @param {Buffer} buffer
 * @param {{ code:string, preprocess?:boolean, dpi?:number, onProgress?:Function }} opts
 * @returns {Promise<{ text:string, detectedLang:string, method:string, pageCount:number }>}
 */
export async function extractFromPdf(buffer, opts) {
  const { code, preprocess = true, dpi = DEFAULT_DPI, onProgress } = opts;

  // 1) Intentar texto embebido.
  let embedded = { text: '', pages: 0 };
  try {
    embedded = await extractEmbeddedPdfText(buffer);
  } catch (err) {
    console.error('[Tools] embedded PDF text extraction failed:', err.message);
  }

  const pageCount = embedded.pages || 0;
  const perPage = pageCount ? significantLength(embedded.text) / pageCount : significantLength(embedded.text);

  if (embedded.text && perPage >= DIGITAL_PDF_MIN_CHARS_PER_PAGE) {
    return {
      text: embedded.text,
      detectedLang: code === 'auto' ? '' : code,
      method: 'embedded',
      pageCount
    };
  }

  // 2) PDF escaneado: rasterizar + OCR.
  const images = await rasterizePdf(buffer, dpi);
  if (!images.length) {
    // Sin páginas rasterizables: devolver lo poco embebido que hubiera.
    return { text: embedded.text, detectedLang: '', method: 'embedded', pageCount };
  }

  const ocr = await ocrPages(images, code, { preprocess, onProgress });
  return {
    text: ocr.text,
    detectedLang: ocr.detectedLang,
    method: 'ocr',
    pageCount: images.length
  };
}

/**
 * Extrae texto de una imagen (siempre OCR).
 *
 * @param {Buffer} buffer
 * @param {{ code:string, preprocess?:boolean }} opts
 * @returns {Promise<{ text:string, detectedLang:string, method:string, pageCount:number }>}
 */
export async function extractFromImage(buffer, opts) {
  const { code, preprocess = true } = opts;
  const { text, detectedLang } = await ocrImage(buffer, code, { preprocess });
  return { text, detectedLang, method: 'ocr', pageCount: 1 };
}
