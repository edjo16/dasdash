/**
 * Servicio de traducción.
 *
 * Reutiliza la misma infraestructura de IA del proyecto (`AI_ENDPOINT` /
 * `AI_MODEL`, endpoint tipo Ollama `/api/generate`) que ya emplea el módulo
 * `AI/`. Portado de `traducir_con_gpt` / `extract_structured_data_local`
 */
import { nameFromCode } from '../utils/languages.js';

/** Construye el prompt de traducción */
export function buildTranslationPrompt(text, targetLangName) {
  return `Eres un traductor profesional experto en múltiples idiomas incluyendo árabe, hebreo, chino, japonés y coreano.
Traduce el texto manteniendo el formato, contexto y significado original.
Si el texto contiene caracteres especiales o es de un idioma de escritura de derecha a izquierda, maneja la traducción apropiadamente.

Detecta el idioma del siguiente texto y tradúcelo al ${targetLangName} de manera precisa, natural y completa:

${text}

Proporciona la traducción directamente, de forma completa y sin explicaciones adicionales.`;
}

/** Extrae el texto de la respuesta del proveedor de IA (varias formas posibles). */
function extractAIText(response) {
  if (!response) return '';
  if (typeof response.response === 'string') return response.response;
  if (typeof response.text === 'string') return response.text;
  if (typeof response.content === 'string') return response.content;
  return '';
}

/**
 * Traduce un texto al idioma destino.
 *
 * @param {string} text
 * @param {string} targetCode  código ISO del idioma destino (p. ej. 'eng')
 * @returns {Promise<string>}
 */
export async function translateText(text, targetCode) {
  if (!process.env.AI_ENDPOINT) {
    throw new Error('AI_ENDPOINT is not configured');
  }

  const targetName = nameFromCode(targetCode);
  const prompt = buildTranslationPrompt(text, targetName);

  const res = await fetch(process.env.AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      prompt,
      stream: false
    })
  });

  if (!res.ok) {
    throw new Error(`AI service error status ${res.status}`);
  }

  const data = await res.json();
  return extractAIText(data).trim();
}
