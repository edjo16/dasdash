/**
 * Preprocesamiento de imágenes para mejorar el OCR.
 *
 * Reemplaza la lógica OpenCV/PIL del prototipo Python
 * (`mejorar_imagen_para_ocr` + `preprocesar_imagen`) usando `sharp`,
 * que trae binarios precompilados (sin dependencias nativas a compilar).
 *
 * Pipeline: escalado de imágenes pequeñas -> escala de grises ->
 * normalización de contraste -> realce (sharpen) -> binarización por umbral.
 */
import sharp from 'sharp';

const MIN_DIMENSION = 1000; // px: por debajo de esto, se amplía para mejor OCR
const THRESHOLD = 140; // umbral de binarización (0-255)

/**
 * Devuelve un buffer PNG preprocesado listo para OCR.
 * Si algo falla, devuelve el buffer original.
 *
 * @param {Buffer} inputBuffer  Imagen original (cualquier formato soportado por sharp).
 * @param {{ binarize?: boolean }} [options]
 * @returns {Promise<Buffer>}
 */
export async function preprocessForOcr(inputBuffer, options = {}) {
  const { binarize = true } = options;

  try {
    const image = sharp(inputBuffer, { failOn: 'none' });
    const meta = await image.metadata();

    let pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate(); // auto-orienta por EXIF

    // Ampliar imágenes pequeñas para que Tesseract tenga más detalle.
    const minSide = Math.min(meta.width || 0, meta.height || 0);
    if (minSide && minSide < MIN_DIMENSION) {
      const factor = MIN_DIMENSION / minSide;
      pipeline = pipeline.resize({
        width: Math.round((meta.width || 0) * factor),
        height: Math.round((meta.height || 0) * factor),
        kernel: 'lanczos3'
      });
    }

    pipeline = pipeline
      .grayscale()
      .normalize() // estira el histograma (≈ mejora de contraste)
      .sharpen();

    if (binarize) {
      pipeline = pipeline.threshold(THRESHOLD);
    }

    return await pipeline.png().toBuffer();
  } catch (error) {
    console.error('[Tools OCR] preprocess error, using original:', error.message);
    return inputBuffer;
  }
}

/**
 * Normaliza cualquier imagen a PNG sin preprocesar (para vista previa/uso directo).
 * @param {Buffer} inputBuffer
 * @returns {Promise<Buffer>}
 */
export async function toPng(inputBuffer) {
  try {
    return await sharp(inputBuffer, { failOn: 'none' }).rotate().png().toBuffer();
  } catch (error) {
    console.error('[Tools OCR] toPng error:', error.message);
    return inputBuffer;
  }
}
