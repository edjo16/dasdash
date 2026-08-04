/**
 * Servicio de OCR basado en tesseract.js (puro JS/WASM, sin binarios nativos).
 *
 *   - Configuración de PSM por tipo de idioma (RTL / CJK / LTR).
 *   - Modo "auto": prueba varios idiomas y se queda con el de mejor resultado.
 *   - Preprocesado opcional con sharp antes de reconocer.
 *
 * Los workers de Tesseract se cachean por idioma (cargar el WASM + traineddata
 * es costoso). Los `.traineddata` se descargan del CDN y se cachean en disco;
 * se puede forzar una ruta local con TOOLS_TESS_LANG_PATH para entornos sin
 * salida a internet.
 */
import { createWorker, OEM } from 'tesseract.js';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { RTL_CODES, CJK_CODES, AUTO_DETECT_CODES } from '../utils/languages.js';
import { cleanText, significantLength } from '../utils/text-clean.js';
import { preprocessForOcr } from './image-preprocess.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CACHE_PATH = process.env.TOOLS_TESS_CACHE_PATH || join(__dirname, '..', '.tess-cache');
const LANG_PATH = process.env.TOOLS_TESS_LANG_PATH || undefined; // undefined => CDN por defecto
const AUTO_STOP_THRESHOLD = 50; // nº de caracteres significativos que da por buena la detección

// Asegurar que el directorio de caché exista: tesseract.js NO lo crea y, si
// falta, el guardado de los .traineddata en disco se omite en silencio (cada
// reinicio del servidor volvería a descargarlos).
try {
  mkdirSync(CACHE_PATH, { recursive: true });
} catch (err) {
  console.error('[Tools OCR] could not create cache dir:', err.message);
}

/** Caché de workers: code -> Promise<Worker>. */
const workerCache = new Map();

function pageSegParams(code) {
  const params = { tessedit_pageseg_mode: '6' }; // 6 = bloque uniforme de texto
  if (RTL_CODES.has(code) || CJK_CODES.has(code)) {
    params.preserve_interword_spaces = '1';
  }
  return params;
}

async function getWorker(code) {
  if (workerCache.has(code)) return workerCache.get(code);

  const promise = (async () => {
    const worker = await createWorker(code, OEM.LSTM_ONLY, {
      cachePath: CACHE_PATH,
      ...(LANG_PATH ? { langPath: LANG_PATH } : {})
    });
    await worker.setParameters(pageSegParams(code));
    return worker;
  })().catch((err) => {
    workerCache.delete(code); // permitir reintento si la carga falló
    throw err;
  });

  workerCache.set(code, promise);
  return promise;
}

/**
 * Reconoce texto de un buffer de imagen con un idioma concreto.
 * @param {Buffer} buffer
 * @param {string} code  código ISO de Tesseract (p. ej. 'spa')
 * @returns {Promise<string>}
 */
async function recognizeWithLang(buffer, code) {
  const worker = await getWorker(code);
  const { data } = await worker.recognize(buffer);
  return cleanText(data?.text || '');
}

/**
 * OCR de una imagen con soporte de detección automática.
 *
 * @param {Buffer} imageBuffer   imagen original (cualquier formato)
 * @param {string} code          código ISO o 'auto'
 * @param {{ preprocess?: boolean }} [options]
 * @returns {Promise<{ text: string, detectedLang: string }>}
 */
export async function ocrImage(imageBuffer, code, options = {}) {
  const { preprocess = true } = options;
  const buffer = preprocess ? await preprocessForOcr(imageBuffer) : imageBuffer;

  if (code !== 'auto') {
    const text = await recognizeWithLang(buffer, code);
    return { text, detectedLang: code };
  }

  // Detección automática: probar idiomas comunes y quedarse con el mejor.
  let best = { text: '', detectedLang: 'eng' };
  for (const candidate of AUTO_DETECT_CODES) {
    try {
      const text = await recognizeWithLang(buffer, candidate);
      if (significantLength(text) > significantLength(best.text)) {
        best = { text, detectedLang: candidate };
      }
      if (significantLength(best.text) > AUTO_STOP_THRESHOLD) break;
    } catch (err) {
      console.error(`[Tools OCR] auto candidate ${candidate} failed:`, err.message);
    }
  }
  return best;
}

/**
 * OCR de múltiples imágenes (páginas). Combina el texto con cabeceras de página.
 *
 * @param {Buffer[]} pages
 * @param {string} code
 * @param {{ preprocess?: boolean, onProgress?: (info:{page:number,total:number})=>void }} [options]
 * @returns {Promise<{ text: string, detectedLang: string, pages: Array }>}
 */
export async function ocrPages(pages, code, options = {}) {
  const { preprocess = true, onProgress } = options;
  const total = pages.length;
  const results = [];
  let combined = '';
  let detectedLang = code;

  for (let i = 0; i < total; i++) {
    if (onProgress) onProgress({ page: i + 1, total });
    try {
      const { text, detectedLang: dl } = await ocrImage(pages[i], code, { preprocess });
      if (code === 'auto' && dl) detectedLang = dl;
      if (text.trim()) {
        combined += `\n--- Page ${i + 1} ---\n${text}\n`;
        results.push({ page: i + 1, chars: text.length });
      } else {
        results.push({ page: i + 1, chars: 0 });
      }
    } catch (err) {
      console.error(`[Tools OCR] page ${i + 1} failed:`, err.message);
      results.push({ page: i + 1, chars: 0, error: true });
    }
  }

  return { text: combined.trim(), detectedLang, pages: results };
}

/** Libera todos los workers cacheados (para apagado / mantenimiento). */
export async function terminateWorkers() {
  const workers = Array.from(workerCache.values());
  workerCache.clear();
  await Promise.allSettled(
    workers.map(async (p) => {
      try {
        const w = await p;
        await w.terminate();
      } catch (_) {}
    })
  );
}
