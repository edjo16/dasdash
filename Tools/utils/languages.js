/**
 * Idiomas soportados por la herramienta de traducción multiidioma.
 *
 * Migrado desde `IDIOMAS_TESSERACT` del prototipo Python.
 * Cada entrada mapea el nombre visible (inglés) al código ISO de Tesseract.
 * `auto` = detección automática (se prueban varios idiomas en el OCR).
 */
export const OCR_LANGUAGES = {
  'Automatic Detection': 'auto',
  Arabic: 'ara',
  English: 'eng',
  French: 'fra',
  German: 'deu',
  Hebrew: 'heb',
  Hindi: 'hin',
  Italian: 'ita',
  Japanese: 'jpn',
  Korean: 'kor',
  Portuguese: 'por',
  'Simplified Chinese': 'chi_sim',
  Spanish: 'spa',
  Russian: 'rus',
  Thai: 'tha',
  'Traditional Chinese': 'chi_tra',
  Vietnamese: 'vie'
};

/**
 * Idiomas destino de traducción (no incluyen "Automatic Detection",
 * el destino siempre debe ser explícito).
 */
export const TARGET_LANGUAGES = Object.fromEntries(
  Object.entries(OCR_LANGUAGES).filter(([, code]) => code !== 'auto')
);

/** Idiomas de escritura de derecha a izquierda. */
export const RTL_CODES = new Set(['ara', 'heb']);

/** Idiomas CJK (sin separación de palabras por espacios). */
export const CJK_CODES = new Set(['chi_sim', 'chi_tra', 'jpn', 'kor']);

/**
 * Idiomas que se prueban en modo detección automática, en orden de prioridad.
 */
export const AUTO_DETECT_CODES = ['eng', 'spa', 'fra', 'heb', 'ara', 'chi_sim'];

/** Valida que un código de OCR sea soportado (incluye 'auto'). */
export function isValidOcrCode(code) {
  return code === 'auto' || Object.values(OCR_LANGUAGES).includes(code);
}

/** Devuelve el nombre visible a partir de un código ISO. */
export function nameFromCode(code) {
  const entry = Object.entries(OCR_LANGUAGES).find(([, c]) => c === code);
  return entry ? entry[0] : code;
}
