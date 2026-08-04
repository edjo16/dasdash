/**
 * Servicio de la herramienta "Presentation Cards" (extracción de datos de
 * tarjetas de presentación con un modelo de visión).
 *
 * NO usa OCR: el modelo de visión lee la imagen directamente. El módulo
 * `ocr-service.js` pertenece a la herramienta de traducción, no a ésta.
 *
 * Los campos extraídos están alineados con `badaco_contactos` (ver
 * CARD_FIELDS) para que la tarjeta pueda convertirse en contacto sin
 * transformaciones intermedias. Las llaves foráneas (empresa, país, nivel de
 * cargo) las resuelve `badaco-match.js`.
 *
 * Configuración:
 *   TOOLS_VISION_ENDPOINT / AI_ENDPOINT  endpoint Ollama (/api/generate o /api/chat)
 *   TOOLS_VISION_MODEL    / AI_MODEL     modelo de visión (p. ej. gemma3:12b)
 *   TOOLS_VISION_JSON=0                  desactiva el modo JSON nativo del proveedor
 *   TOOLS_VISION_TIMEOUT_MS              timeout por imagen (def. 180000)
 */
import sharp from 'sharp';

/**
 * Campos que extrae el modelo, en el orden en que se muestran.
 * `badaco` documenta a qué columna de `badaco_contactos` corresponde cada uno.
 */
export const CARD_FIELDS = [
  { key: 'name', label: 'Name', badaco: 'name' },
  { key: 'job_title', label: 'Job Title', badaco: 'job_title' },
  { key: 'company', label: 'Company', badaco: 'bmc_id' },
  { key: 'email', label: 'Email', badaco: 'email' },
  { key: 'phone_number', label: 'Phone', badaco: 'phone_number' },
  { key: 'mobile', label: 'Mobile', badaco: 'phone_number (respaldo)' },
  { key: 'country', label: 'Country', badaco: 'country (cpais)' },
  { key: 'address', label: 'Address', badaco: 'address' },
  { key: 'website', label: 'Website', badaco: null }
];

export const CARD_FIELD_KEYS = CARD_FIELDS.map((f) => f.key);

/**
 * Columnas de la tabla de revisión. Las de tipo `link` no se editan como
 * texto: muestran la etiqueta del catálogo de BADACO pero guardan el id.
 *   - `link`   : clave del emparejado devuelto por matchCardToBadaco
 *   - `source` : campo extraído del que nace la sugerencia (lo que dice la tarjeta)
 *   - `catalog`: catálogo del que se llena el desplegable
 */
export const CARD_COLUMNS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'job_title', label: 'Job Title', type: 'text' },
  { key: 'job_level', label: 'Job Level', type: 'link', link: 'jobLevel', source: 'job_title', catalog: 'jobLevels', badacoOnly: true },
  { key: 'company', label: 'Company', type: 'link', link: 'company', source: 'company', catalog: 'companies', creatable: true },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'phone_number', label: 'Phone', type: 'text' },
  { key: 'mobile', label: 'Mobile', type: 'text' },
  { key: 'country', label: 'Country', type: 'link', link: 'country', source: 'country', catalog: 'countries' },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'website', label: 'Website', type: 'text' }
];

/**
 * Prompt de extracción. Pensado para modelos de visión que siguen
 * instrucciones (gemma3, llama3.2-vision, qwen2.5-vl): pide un único objeto
 * JSON con claves fijas, sin texto alrededor.
 */
const EXTRACTION_PROMPT = `You are reading a photo of a business card. Extract the contact data.

Return ONLY one JSON object, with exactly these keys and string values:
{"name":"","job_title":"","company":"","email":"","phone_number":"","mobile":"","website":"","address":"","country":""}

Rules:
- name: the person's full name only (no title, no degrees such as Ing./Lic./MBA).
- job_title: the position exactly as printed (e.g. "Sales Manager", "Gerente General").
- company: the company or organization name only. Never the slogan, the tagline or the person's name.
- email: the full email address, lowercase.
- phone_number: the office / landline / direct number. It is usually labelled T, Tel, Tel., Dir, Direct, Directo, Fijo, Office or Oficina.
- mobile: the cellphone number. It is usually labelled C, M, Cel, Cell, Móvil, Movil, Mobile or WhatsApp.
- Keep phone numbers as printed, including the country code and the leading "+" when it is shown.
- website: the web address without http:// or https://. Do not use the email domain as the website.
- address: street, building, suite and city, WITHOUT the country.
- country: only the country. If the card names a well-known city instead (Panama City, Miami, Bogotá...), write the country that city belongs to. Otherwise leave it empty.
- If the card is in Spanish, keep the values in their original language; do not translate.
- If a value is not on the card, use an empty string "". Never write "N/A", "not found", "no disponible" or similar.
- Do not invent data. Do not add keys. Do not add explanations, comments or markdown fences.`;

const VISION_TIMEOUT_MS = Number(process.env.TOOLS_VISION_TIMEOUT_MS || 180000); // 3 min
const MAX_IMAGE_SIDE = 1600; // px: suficiente para leer una tarjeta, limita el payload base64
const USE_JSON_FORMAT = process.env.TOOLS_VISION_JSON !== '0';

/** Valores considerados "vacíos" por el modelo. */
const EMPTY_VALUES = new Set([
  '', '-', '--', 'n/a', 'na', 'n.a.', 'none', 'null', 'unknown', 'not found', 'not available',
  'no disponible', 'no especificada', 'no especificado', 'no se encuentra', 'no aplica', 'sin datos'
]);

/** Devuelve un objeto con todos los campos vacíos. */
export function emptyCard() {
  return Object.fromEntries(CARD_FIELD_KEYS.map((k) => [k, '']));
}

/**
 * Normaliza la imagen para el modelo de visión: auto-orienta (EXIF),
 * limita el tamaño y convierte a JPEG (payload base64 más pequeño).
 * Fail-safe: si sharp falla devuelve el buffer original.
 */
export async function prepareCardImage(inputBuffer) {
  try {
    return await sharp(inputBuffer, { failOn: 'none' })
      .rotate()
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (error) {
    console.error('[Tools Cards] prepareCardImage error, using original:', error.message);
    return inputBuffer;
  }
}

/** Extrae el texto de la respuesta del proveedor (formatos generate y chat). */
function extractAIText(response) {
  if (!response) return '';
  if (typeof response.response === 'string') return response.response;
  if (typeof response.message?.content === 'string') return response.message.content;
  if (typeof response.text === 'string') return response.text;
  if (typeof response.content === 'string') return response.content;
  return '';
}

/**
 * Llama al modelo de visión con la imagen en base64.
 * Soporta endpoints tipo Ollama `/api/generate` (prompt + images) y
 * `/api/chat` (messages con images), según a qué apunte el endpoint.
 *
 * @param {Buffer} imageBuffer
 * @returns {Promise<string>} texto crudo devuelto por el modelo
 */
export async function callVisionModel(imageBuffer) {
  const endpoint = process.env.TOOLS_VISION_ENDPOINT || process.env.AI_ENDPOINT;
  const model = process.env.TOOLS_VISION_MODEL || process.env.AI_MODEL;

  if (!endpoint) {
    throw new Error('TOOLS_VISION_ENDPOINT / AI_ENDPOINT is not configured');
  }

  const prepared = await prepareCardImage(imageBuffer);
  const imageB64 = prepared.toString('base64');

  // temperature 0 = determinista: dos pasadas sobre la misma tarjeta coinciden.
  const options = {
    temperature: 0.0,
    num_predict: 800,
    top_p: 0.95,
    top_k: 40,
    repeat_penalty: 1.1
  };

  const isChatEndpoint = /\/api\/chat\/?$/i.test(endpoint);
  const body = isChatEndpoint
    ? {
        model,
        messages: [{ role: 'user', content: EXTRACTION_PROMPT, images: [imageB64] }],
        stream: false,
        options
      }
    : {
        model,
        prompt: EXTRACTION_PROMPT,
        images: [imageB64],
        stream: false,
        options
      };

  // Modo JSON nativo del proveedor: evita fences y texto de relleno.
  if (USE_JSON_FORMAT) body.format = 'json';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(VISION_TIMEOUT_MS)
  });

  if (!res.ok) {
    throw new Error(`AI vision service error status ${res.status}`);
  }

  const data = await res.json();
  return String(extractAIText(data) || '').trim();
}

/** Limpia asteriscos/markdown y guiones decorativos de un valor. */
function cleanFieldValue(value, { stripHyphens = false } = {}) {
  let out = String(value == null ? '' : value).replace(/[*`]/g, '').trim();
  if (stripHyphens) out = out.replace(/-/g, ' ').trim();
  out = out.replace(/^[-–—:\s]+/, '').replace(/[,;\s]+$/, '').trim().replace(/\s+/g, ' ');
  return EMPTY_VALUES.has(out.toLowerCase()) ? '' : out;
}

/** Normalizaciones específicas por campo. */
function normalizeField(key, value) {
  const keepHyphens = key === 'phone_number' || key === 'mobile' || key === 'website' || key === 'email';
  let out = cleanFieldValue(value, { stripHyphens: !keepHyphens });
  if (!out) return '';

  if (key === 'email') {
    out = out.toLowerCase().replace(/^mailto:/, '').replace(/\s+/g, '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out)) return '';
  }
  if (key === 'website') {
    out = out.replace(/^https?:\/\//i, '').replace(/\/+$/, '').replace(/\s+/g, '');
    if (out.includes('@')) return ''; // el modelo copió el email
  }
  return out;
}

// Etiquetas (español/inglés) y claves alternativas -> campo canónico.
const LABEL_MAP = {
  name: 'name', nombre: 'name', 'full name': 'name', fullname: 'name',
  position: 'job_title', cargo: 'job_title', puesto: 'job_title', title: 'job_title',
  'job title': 'job_title', job_title: 'job_title', jobtitle: 'job_title',
  company: 'company', empresa: 'company', compania: 'company', 'compañia': 'company',
  'compañía': 'company', organization: 'company', organizacion: 'company',
  phone: 'phone_number', telefono: 'phone_number', 'teléfono': 'phone_number',
  tel: 'phone_number', phone_number: 'phone_number', 'phone number': 'phone_number',
  office: 'phone_number', oficina: 'phone_number', direct: 'phone_number',
  mobile: 'mobile', movil: 'mobile', 'móvil': 'mobile', celular: 'mobile',
  cel: 'mobile', cell: 'mobile', whatsapp: 'mobile',
  website: 'website', web: 'website', sitio: 'website', url: 'website',
  email: 'email', correo: 'email', 'e-mail': 'email', mail: 'email',
  address: 'address', direccion: 'address', 'dirección': 'address',
  location: 'address', ubicacion: 'address', 'ubicación': 'address',
  country: 'country', pais: 'country', 'país': 'country'
};

const LABEL_RE = /^\s*[-*•]*\s*([A-Za-zÁÉÍÓÚáéíóúñÑ][A-Za-zÁÉÍÓÚáéíóúñÑ\s_-]{1,20})\s*[:：]\s*(.*)$/;

/** Quita bloques de razonamiento y fences de markdown. */
function stripNoise(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\|[^|]*\|>/g, '')
    .replace(/```[a-z]*\s*/gi, '')
    .replace(/```/g, '')
    .trim();
}

/** Devuelve el primer objeto JSON balanceado del texto, o null. */
function extractJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}

/**
 * Estructura la respuesta del modelo en los campos de la tarjeta.
 * Primero intenta JSON (formato pedido en el prompt); si el modelo devuelve
 * texto plano, cae a líneas "Etiqueta: valor" y luego a heurísticas.
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseCardData(text) {
  const clean = stripNoise(text);
  const data = emptyCard();

  // 1) JSON (camino normal con `format: 'json'`).
  const parsed = extractJsonObject(clean);
  if (parsed && typeof parsed === 'object') {
    let filled = 0;
    for (const [rawKey, rawValue] of Object.entries(parsed)) {
      if (rawValue && typeof rawValue === 'object') continue;
      const field = LABEL_MAP[String(rawKey).trim().toLowerCase()];
      if (!field || data[field]) continue;
      const value = normalizeField(field, rawValue);
      if (value) { data[field] = value; filled++; }
    }
    if (filled) return data;
  }

  // 2) Líneas "Campo: valor" + heurísticas por palabra clave.
  for (const rawLine of clean.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(LABEL_RE);
    if (match) {
      const field = LABEL_MAP[match[1].trim().toLowerCase().replace(/_/g, ' ')];
      if (field) {
        const value = normalizeField(field, match[2]);
        if (value && !data[field]) data[field] = value;
        continue;
      }
    }

    const lower = line.toLowerCase();
    const tail = () => line.split(':').pop();

    if (line.includes('@') && !data.email) {
      data.email = normalizeField('email', line.replace(/^.*?(email|correo|mail)\s*[:：]?/i, ''));
    } else if (/(cel|mobile|m[oó]vil|whatsapp)/.test(lower) && !data.mobile) {
      data.mobile = normalizeField('mobile', tail());
    } else if (/(tel|phone|oficina|office|directo?)/.test(lower) && !data.phone_number) {
      data.phone_number = normalizeField('phone_number', tail());
    } else if (/(http|www\.)/.test(lower) && !data.website) {
      data.website = normalizeField('website', line.replace(/^.*?(website|web|url)\s*[:：]?/i, ''));
    } else if (/(dir|address|location|ubicaci)/.test(lower) && !data.address) {
      data.address = normalizeField('address', tail());
    } else if (/(ceo|manager|director|engineer|assistant|profesor|lic|geren)/.test(lower) && !data.job_title) {
      data.job_title = normalizeField('job_title', tail());
    } else if (/(nomb|name)/.test(lower) && !data.name) {
      data.name = normalizeField('name', tail());
    } else if (/(company|empresa|compa)/.test(lower) && !data.company) {
      data.company = normalizeField('company', line.replace(/^.*?(company|empresa|compa[nñ]ia)\s*[:：]?/i, ''));
    }
  }

  return data;
}

/**
 * Combina los datos de las dos caras de una tarjeta: para cada campo se usa
 * el valor no vacío, priorizando el frente.
 *
 * @param {Record<string,string>} frontData
 * @param {Record<string,string>} backData
 * @returns {Record<string,string>}
 */
export function mergeCardData(frontData, backData) {
  const merged = emptyCard();
  for (const key of CARD_FIELD_KEYS) {
    const frontValue = String(frontData?.[key] || '').trim();
    const backValue = String(backData?.[key] || '').trim();
    merged[key] = frontValue || backValue || '';
  }
  return merged;
}

/**
 * Flujo completo para una tarjeta: frente (+ dorso opcional) -> datos.
 *
 * @param {Buffer} frontBuffer
 * @param {Buffer|null} backBuffer
 * @returns {Promise<{ data: Record<string,string>, raw: { front: string, back: string|null } }>}
 */
export async function extractCard(frontBuffer, backBuffer = null) {
  const frontText = await callVisionModel(frontBuffer);
  const frontData = parseCardData(frontText);

  if (!backBuffer) {
    return { data: frontData, raw: { front: frontText, back: null } };
  }

  const backText = await callVisionModel(backBuffer);
  const backData = parseCardData(backText);

  return {
    data: mergeCardData(frontData, backData),
    raw: { front: frontText, back: backText }
  };
}
