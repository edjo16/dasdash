/**
 * Normalización de texto extraído por OCR.
 * Portado de `limpiar_texto_para_pdf, adaptado a JS.
 *
 * El objetivo es limpiar artefactos de codificación sin destruir texto
 * de idiomas de escritura de derecha a izquierda (árabe/hebreo) ni CJK.
 */

// Reemplazos de caracteres tipográficos problemáticos.
const REPLACEMENTS = {
  '“': '"', // comilla izquierda
  '”': '"', // comilla derecha
  '‘': "'", // comilla simple izquierda
  '’': "'", // comilla simple derecha
  '–': '-', // en dash
  '—': '--', // em dash
  '…': '...', // puntos suspensivos
  ' ': ' ' // espacio no separable
};

/** Detecta si el texto contiene caracteres RTL (árabe/hebreo). */
export function hasRtl(text) {
  // Rango hebreo (0590-05FF) y árabe (0600-06FF).
  return /[֐-ۿ]/.test(String(text || ''));
}

/**
 * Limpia el texto: normaliza Unicode (NFKC), reemplaza tipografía y
 * elimina caracteres de control no imprimibles.
 */
export function cleanText(text) {
  if (!text) return '';

  let out = String(text).normalize('NFKC');

  for (const [oldChar, newChar] of Object.entries(REPLACEMENTS)) {
    out = out.split(oldChar).join(newChar);
  }

  // Normalizar saltos de línea y colapsar líneas en blanco excesivas.
  out = out.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');

  // Eliminar caracteres de control (excepto tab \x09 y newline \x0A).
  // eslint-disable-next-line no-control-regex
  out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  return out.trim();
}

/** Cuenta caracteres significativos (sin espacios en blanco). */
export function significantLength(text) {
  return String(text || '').replace(/\s+/g, '').length;
}
