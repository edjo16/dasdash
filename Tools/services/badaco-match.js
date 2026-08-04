/**
 * Emparejado ("matching") de los datos crudos de una tarjeta contra los
 * catálogos de BADACO.
 *
 * La tarjeta trae texto libre (Company, Country, Job Title) pero
 * `badaco_contactos` guarda llaves foráneas:
 *
 *   Company    -> bmc_id   (badaco_mcompany)
 *   Job Title  -> bmjl_id  (badaco_mjoblevel, nivel del cargo)
 *   Country    -> cpais    (m_pais, código de país)
 *
 * Este módulo resuelve esas llaves con aproximación difusa y devuelve
 * SIEMPRE la etiqueta legible junto al id, para que la UI muestre el nombre
 * y el backend guarde el código. Nunca decide por el usuario cuando la
 * confianza es baja: en ese caso sólo propone candidatos.
 *
 * Módulo puro (sin SQL, sin I/O): recibe los catálogos ya cargados.
 */

/* ------------------------------------------------------------------ *
 * Normalización y similitud
 * ------------------------------------------------------------------ */

/** Quita acentos/diacríticos ("Panamá" -> "Panama"). */
export function stripDiacritics(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** minúsculas, sin acentos, sin puntuación y con espacios colapsados. */
export function normalize(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Sufijos societarios y ruido que no aportan al comparar nombres de empresa. */
const COMPANY_STOPWORDS = new Set([
  'sa', 'sas', 'sac', 'sapi', 'srl', 'sl', 'spa', 'ab', 'ag', 'gmbh', 'bv', 'nv', 'oy', 'plc',
  'inc', 'llc', 'lllc', 'ltd', 'ltda', 'limited', 'corp', 'corporation', 'company', 'co',
  'cv', 'pte', 'pty', 'kk', 'sarl',
  'group', 'grupo', 'holding', 'holdings', 'international', 'intl', 'internacional',
  'the', 'and', 'de', 'del', 'la', 'el', 'los', 'las', 'y'
]);

/**
 * Clave comparable de un nombre de empresa: sin sufijos societarios ni letras
 * sueltas, para que "Acme Logistics" y "Acme Logistics, S.A." coincidan.
 * Si al filtrar no queda nada (p. ej. "H&M") se conserva el nombre completo.
 */
export function companyKey(name) {
  const tokens = normalize(name).split(' ').filter(Boolean);
  const meaningful = tokens.filter((t) => t.length > 1 && !COMPANY_STOPWORDS.has(t));
  return (meaningful.length ? meaningful : tokens).join(' ');
}

function bigrams(value) {
  const text = String(value || '').replace(/\s+/g, '');
  const out = new Map();
  for (let i = 0; i < text.length - 1; i++) {
    const gram = text.slice(i, i + 2);
    out.set(gram, (out.get(gram) || 0) + 1);
  }
  return out;
}

/** Coeficiente de Sørensen–Dice sobre bigramas (0..1). */
function diceCoefficient(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const gramsA = bigrams(a);
  const gramsB = bigrams(b);
  let intersection = 0;
  let totalA = 0;
  let totalB = 0;

  gramsA.forEach((count) => { totalA += count; });
  gramsB.forEach((count, gram) => {
    totalB += count;
    intersection += Math.min(count, gramsA.get(gram) || 0);
  });

  return (2 * intersection) / (totalA + totalB);
}

/** Jaccard sobre el conjunto de palabras. */
function tokenJaccard(a, b) {
  const setA = new Set(String(a || '').split(' ').filter(Boolean));
  const setB = new Set(String(b || '').split(' ').filter(Boolean));
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  setA.forEach((token) => { if (setB.has(token)) shared++; });
  return shared / (setA.size + setB.size - shared);
}

/**
 * Similitud entre dos cadenas ya normalizadas (0..1).
 * Combina caracteres (tolera erratas del OCR/modelo) y palabras (tolera
 * orden distinto), y premia el prefijo común ("Acme" vs "Acme Panama").
 */
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const dice = diceCoefficient(a, b);
  const jaccard = tokenJaccard(a, b);
  let score = Math.max(dice, jaccard * 0.95, (dice * 0.6) + (jaccard * 0.4));

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 4 && longer.startsWith(shorter)) {
    score = Math.max(score, 0.86);
  }

  return Math.min(1, score);
}

/* ------------------------------------------------------------------ *
 * Niveles de confianza
 * ------------------------------------------------------------------ */

/** A partir de este puntaje el candidato se selecciona automáticamente. */
export const AUTO_SELECT_SCORE = 0.80;
/** Debajo de este puntaje el candidato ni siquiera se propone. */
export const SUGGEST_SCORE = 0.55;
const MAX_OPTIONS = 5;

function confidenceOf(score, reason) {
  if (reason === 'domain' || reason === 'exact' || score >= 0.95) return 'high';
  if (score >= AUTO_SELECT_SCORE) return 'medium';
  if (score >= SUGGEST_SCORE) return 'low';
  return 'none';
}

/**
 * Empaqueta el resultado de un emparejado con la forma que consume la UI.
 * `id`/`label` sólo vienen rellenos cuando la confianza permite auto-seleccionar;
 * en caso contrario el usuario elige entre `options`.
 */
function buildMatch(candidates, rawValue) {
  const ranked = candidates
    .filter((c) => c.score >= SUGGEST_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_OPTIONS)
    .map((c) => ({
      id: c.id,
      label: c.label,
      score: Math.round(c.score * 100) / 100,
      reason: c.reason || 'similar',
      confidence: confidenceOf(c.score, c.reason)
    }));

  const best = ranked[0];
  const auto = best && best.confidence !== 'low' ? best : null;

  return {
    raw: rawValue || '',
    id: auto ? auto.id : null,
    label: auto ? auto.label : '',
    score: auto ? auto.score : (best ? best.score : 0),
    reason: auto ? auto.reason : (best ? 'suggested' : 'not-found'),
    confidence: auto ? auto.confidence : (best ? 'low' : 'none'),
    options: ranked
  };
}

/* ------------------------------------------------------------------ *
 * Empresas (bmc_id)
 * ------------------------------------------------------------------ */

/** Deja un dominio comparable: "https://www.acme.com/x" -> "acme.com". */
export function normalizeDomain(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  return text
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .replace(/[^a-z0-9.-]/g, '');
}

/** Dominios genéricos que NO identifican a una empresa. */
const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.es', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'msn.com', 'gmx.com'
]);

function emailDomain(email) {
  const at = String(email || '').indexOf('@');
  if (at === -1) return '';
  const domain = normalizeDomain(String(email).slice(at + 1));
  return PUBLIC_EMAIL_DOMAINS.has(domain) ? '' : domain;
}

/**
 * Empareja la empresa de la tarjeta contra `badaco_mcompany`.
 * Prioridad: dominio (email/website) > nombre exacto > similitud.
 *
 * @param {{company?:string, email?:string, website?:string}} card
 * @param {Array<{bmc_id:number, nombre:string, domain?:string, website?:string}>} companies
 */
export function matchCompany(card, companies = []) {
  const rawName = String(card?.company || '').trim();
  const cardDomain = emailDomain(card?.email) || normalizeDomain(card?.website);
  const key = companyKey(rawName);

  if (!rawName && !cardDomain) return buildMatch([], rawName);

  const candidates = [];
  for (const company of companies) {
    const label = String(company.nombre || '').trim();
    if (!label) continue;

    const companyDomain = normalizeDomain(company.domain) || normalizeDomain(company.website);
    if (cardDomain && companyDomain && companyDomain === cardDomain) {
      candidates.push({ id: company.bmc_id, label, score: 1, reason: 'domain' });
      continue;
    }

    if (!key) continue;
    const otherKey = companyKey(label);
    if (otherKey && otherKey === key) {
      candidates.push({ id: company.bmc_id, label, score: 0.99, reason: 'exact' });
      continue;
    }

    const score = similarity(key, otherKey);
    if (score >= SUGGEST_SCORE) {
      candidates.push({ id: company.bmc_id, label, score, reason: 'similar' });
    }
  }

  return buildMatch(candidates, rawName);
}

/* ------------------------------------------------------------------ *
 * Países (cpais)
 * ------------------------------------------------------------------ */

/** Nombres alternativos (español, siglas, ISO) -> nombre en inglés del catálogo. */
const COUNTRY_ALIASES = {
  'estados unidos': 'united states', 'estados unidos de america': 'united states',
  usa: 'united states', us: 'united states', eeuu: 'united states', 'ee uu': 'united states',
  'u s a': 'united states', america: 'united states', 'united states of america': 'united states',
  espana: 'spain', es: 'spain',
  mexico: 'mexico', mx: 'mexico', 'estados unidos mexicanos': 'mexico',
  panama: 'panama', pa: 'panama', 'republica de panama': 'panama',
  colombia: 'colombia', co: 'colombia',
  'costa rica': 'costa rica', cr: 'costa rica',
  guatemala: 'guatemala', gt: 'guatemala',
  honduras: 'honduras', hn: 'honduras',
  'el salvador': 'el salvador', sv: 'el salvador',
  nicaragua: 'nicaragua', ni: 'nicaragua',
  'republica dominicana': 'dominican republic', rd: 'dominican republic', do: 'dominican republic',
  'puerto rico': 'puerto rico', pr: 'puerto rico',
  peru: 'peru', pe: 'peru',
  chile: 'chile', cl: 'chile',
  argentina: 'argentina', ar: 'argentina',
  brasil: 'brazil', brazil: 'brazil', br: 'brazil',
  ecuador: 'ecuador', ec: 'ecuador',
  venezuela: 'venezuela', ve: 'venezuela',
  uruguay: 'uruguay', uy: 'uruguay',
  paraguay: 'paraguay', py: 'paraguay',
  bolivia: 'bolivia', bo: 'bolivia',
  canada: 'canada', ca: 'canada',
  'reino unido': 'united kingdom', uk: 'united kingdom', 'gran bretana': 'united kingdom',
  inglaterra: 'united kingdom', 'england': 'united kingdom', gb: 'united kingdom',
  alemania: 'germany', de: 'germany', deutschland: 'germany',
  francia: 'france', fr: 'france',
  italia: 'italy', it: 'italy',
  'paises bajos': 'netherlands', holanda: 'netherlands', nl: 'netherlands',
  suiza: 'switzerland', ch: 'switzerland',
  china: 'china', cn: 'china',
  japon: 'japan', jp: 'japan',
  india: 'india', in: 'india',
  'corea del sur': 'south korea', kr: 'south korea',
  singapur: 'singapore', sg: 'singapore',
  turquia: 'turkey', tr: 'turkey',
  'emiratos arabes unidos': 'united arab emirates', ae: 'united arab emirates', dubai: 'united arab emirates',
  'arabia saudita': 'saudi arabia', sa: 'saudi arabia',
  sudafrica: 'south africa', za: 'south africa',
  australia: 'australia', au: 'australia',
  portugal: 'portugal', pt: 'portugal',
  belgica: 'belgium', be: 'belgium',
  suecia: 'sweden', se: 'sweden',
  noruega: 'norway', no: 'norway',
  dinamarca: 'denmark', dk: 'denmark',
  polonia: 'poland', pl: 'poland'
};

/** Prefijos telefónicos -> nombre en inglés del catálogo. */
const DIAL_CODES = [
  // Plan de numeración norteamericano: el código de área va pegado al 1.
  ['1809', 'dominican republic'], ['1829', 'dominican republic'], ['1849', 'dominican republic'],
  ['1787', 'puerto rico'], ['1939', 'puerto rico'],
  ['507', 'panama'], ['506', 'costa rica'], ['505', 'nicaragua'], ['504', 'honduras'],
  ['503', 'el salvador'], ['502', 'guatemala'], ['501', 'belize'],
  ['57', 'colombia'], ['58', 'venezuela'], ['52', 'mexico'], ['51', 'peru'],
  ['56', 'chile'], ['55', 'brazil'], ['54', 'argentina'], ['593', 'ecuador'],
  ['591', 'bolivia'], ['595', 'paraguay'], ['598', 'uruguay'],
  ['53', 'cuba'], ['509', 'haiti'], ['592', 'guyana'], ['597', 'suriname'],
  ['34', 'spain'], ['44', 'united kingdom'], ['49', 'germany'], ['33', 'france'],
  ['39', 'italy'], ['351', 'portugal'], ['31', 'netherlands'], ['41', 'switzerland'],
  ['32', 'belgium'], ['43', 'austria'], ['353', 'ireland'], ['30', 'greece'],
  ['45', 'denmark'], ['46', 'sweden'], ['47', 'norway'], ['358', 'finland'],
  ['48', 'poland'], ['420', 'czech republic'], ['36', 'hungary'], ['40', 'romania'],
  ['7', 'russia'], ['380', 'ukraine'], ['90', 'turkey'],
  ['86', 'china'], ['81', 'japan'], ['91', 'india'], ['82', 'south korea'],
  ['65', 'singapore'], ['852', 'hong kong'], ['886', 'taiwan'], ['60', 'malaysia'],
  ['66', 'thailand'], ['62', 'indonesia'], ['63', 'philippines'], ['84', 'vietnam'],
  ['971', 'united arab emirates'], ['966', 'saudi arabia'], ['974', 'qatar'],
  ['965', 'kuwait'], ['973', 'bahrain'], ['968', 'oman'], ['972', 'israel'],
  ['27', 'south africa'], ['20', 'egypt'], ['212', 'morocco'], ['234', 'nigeria'],
  ['61', 'australia'], ['64', 'new zealand'],
  ['1', 'united states']
].sort((a, b) => b[0].length - a[0].length); // el prefijo más largo gana

function countryFromPhone(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  if (!digits.startsWith('+')) return '';
  const number = digits.slice(1);
  for (const [code, name] of DIAL_CODES) {
    if (number.startsWith(code)) return name;
  }
  return '';
}

/**
 * Empareja el país de la tarjeta contra `m_pais` y devuelve el `cpais`.
 * Busca, en orden: el campo Country, la última línea de la dirección, el
 * texto completo de la dirección y por último el prefijo telefónico.
 *
 * @param {{country?:string, address?:string, phone_number?:string, mobile?:string}} card
 * @param {Array<{cpais:string, xnombre_pais_ingles:string}>} countries
 */
export function matchCountry(card, countries = []) {
  const rawCountry = String(card?.country || '').trim();
  const address = String(card?.address || '').trim();

  const catalog = countries
    .map((c) => ({
      id: c.cpais,
      label: String(c.xnombre_pais_ingles || '').trim(),
      key: normalize(c.xnombre_pais_ingles)
    }))
    .filter((c) => c.key);

  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const resolveAlias = (value) => {
    const key = normalize(value);
    if (!key) return null;
    if (byKey.has(key)) return byKey.get(key);
    const alias = COUNTRY_ALIASES[key];
    return alias && byKey.has(alias) ? byKey.get(alias) : null;
  };

  // 1) Coincidencia directa (o vía alias) del campo Country.
  const direct = resolveAlias(rawCountry);
  if (direct) {
    return buildMatch([{ id: direct.id, label: direct.label, score: 1, reason: 'exact' }], rawCountry);
  }

  // 2) Última porción de la dirección ("... , Panama City, Panama").
  const addressTail = address.split(/[,\n]/).map((p) => p.trim()).filter(Boolean).pop() || '';
  const tail = resolveAlias(addressTail);
  if (tail) {
    return buildMatch([{ id: tail.id, label: tail.label, score: 0.95, reason: 'address' }], rawCountry || addressTail);
  }

  // 3) Cualquier país nombrado dentro de la dirección completa.
  const addressKey = ` ${normalize(address)} `;
  if (addressKey.trim()) {
    for (const country of catalog) {
      if (country.key.length >= 4 && addressKey.includes(` ${country.key} `)) {
        return buildMatch([{ id: country.id, label: country.label, score: 0.9, reason: 'address' }], rawCountry || country.label);
      }
    }
  }

  // 4) Prefijo telefónico internacional.
  const fromPhone = resolveAlias(countryFromPhone(card?.phone_number) || countryFromPhone(card?.mobile));
  if (fromPhone) {
    return buildMatch([{ id: fromPhone.id, label: fromPhone.label, score: 0.85, reason: 'phone' }], rawCountry);
  }

  // 5) Similitud difusa contra el catálogo (erratas del modelo).
  if (!rawCountry) return buildMatch([], '');
  const needle = normalize(rawCountry);
  const candidates = catalog
    .map((c) => ({ id: c.id, label: c.label, score: similarity(needle, c.key), reason: 'similar' }))
    .filter((c) => c.score >= SUGGEST_SCORE);

  return buildMatch(candidates, rawCountry);
}

/* ------------------------------------------------------------------ *
 * Job level (bmjl_id)
 * ------------------------------------------------------------------ */

/**
 * Reglas cargo -> nivel, de mayor a menor jerarquía. `aliases` son los nombres
 * que suele tener el nivel en `badaco_mjoblevel`; se emparejan por similitud
 * contra los que realmente existen en la base.
 */
const JOB_LEVEL_RULES = [
  {
    test: /\b(ceo|cfo|coo|cto|cio|cmo|cco|cso|chro|chief|president|presidente|founder|fundador|owner|propietario|dueno|chairman|chairwoman|managing partner|socio|partner|gerente general|general manager|country manager)\b/,
    aliases: ['c-level', 'c level', 'c suite', 'executive', 'ejecutivo', 'top management', 'owner', 'president', 'chief', 'senior executive']
  },
  {
    test: /\b(vp|vice president|vicepresident|vicepresidente|evp|svp|avp)\b/,
    aliases: ['vp', 'vice president', 'executive', 'senior management', 'c-level']
  },
  {
    test: /\b(director|directora|directeur|head of|head|jefe|jefa)\b/,
    aliases: ['director', 'head', 'senior management', 'management']
  },
  {
    test: /\b(manager|management|gerente|supervisor|supervisora|lead|leader|team lead|encargado|encargada|coordinator|coordinador|coordinadora|jefatura)\b/,
    aliases: ['manager', 'gerente', 'middle management', 'management', 'supervisor', 'coordinator']
  },
  {
    test: /\b(engineer|ingeniero|ingeniera|analyst|analista|specialist|especialista|consultant|consultor|consultora|technician|tecnico|developer|desarrollador|designer|disenador|architect|arquitecto|advisor|asesor|sales|ventas|representative|representante|executive|ejecutiva|agent|agente|officer|broker)\b/,
    aliases: ['staff', 'professional', 'specialist', 'analyst', 'individual contributor', 'employee', 'senior', 'operational']
  },
  {
    test: /\b(assistant|asistente|intern|pasante|trainee|secretary|secretaria|clerk|auxiliar|junior|aprendiz|receptionist|recepcionista)\b/,
    aliases: ['assistant', 'entry level', 'junior', 'support', 'trainee', 'operational']
  }
];

/**
 * Deduce el nivel del cargo (`bmjl_id`) a partir del texto del puesto.
 * Primero intenta una coincidencia directa contra los nombres del catálogo
 * (p. ej. cargo "Director" y nivel "Director"); si no, aplica las reglas.
 *
 * @param {string} jobTitle
 * @param {Array<{bmjl_id:number, name:string}>} jobLevels
 */
export function matchJobLevel(jobTitle, jobLevels = []) {
  const raw = String(jobTitle || '').trim();
  if (!raw) return buildMatch([], '');

  const catalog = jobLevels
    .map((jl) => ({ id: jl.bmjl_id, label: String(jl.name || '').trim(), key: normalize(jl.name) }))
    .filter((jl) => jl.key);
  if (!catalog.length) return buildMatch([], raw);

  const title = normalize(raw);
  const titleTokens = ` ${title} `;

  // 1) El nombre del nivel aparece literalmente en el cargo.
  const literal = catalog
    .filter((jl) => jl.key.length >= 3 && titleTokens.includes(` ${jl.key} `))
    .map((jl) => ({ id: jl.id, label: jl.label, score: 0.97, reason: 'exact' }));
  if (literal.length) return buildMatch(literal, raw);

  // 2) Reglas por jerarquía: el primer patrón que dispara manda.
  for (const rule of JOB_LEVEL_RULES) {
    if (!rule.test.test(title)) continue;

    const candidates = catalog
      .map((jl) => {
        const score = rule.aliases.reduce((best, alias) => Math.max(best, similarity(normalize(alias), jl.key)), 0);
        return { id: jl.id, label: jl.label, score, reason: 'rule' };
      })
      .filter((c) => c.score >= SUGGEST_SCORE);

    if (candidates.length) return buildMatch(candidates, raw);
  }

  // 3) Similitud directa cargo <-> nivel como último recurso.
  const fallback = catalog
    .map((jl) => ({ id: jl.id, label: jl.label, score: similarity(title, jl.key), reason: 'similar' }))
    .filter((c) => c.score >= SUGGEST_SCORE);

  return buildMatch(fallback, raw);
}

/* ------------------------------------------------------------------ *
 * Entrada principal
 * ------------------------------------------------------------------ */

/**
 * Resuelve todas las llaves foráneas de una tarjeta de una sola pasada.
 *
 * @param {Record<string,string>} card  datos extraídos (claves de CARD_FIELDS)
 * @param {{companies:Array, jobLevels:Array, countries:Array}} catalogs
 * @returns {{company:object, jobLevel:object, country:object}}
 */
export function matchCardToBadaco(card, catalogs = {}) {
  return {
    company: matchCompany(card, catalogs.companies || []),
    jobLevel: matchJobLevel(card?.job_title, catalogs.jobLevels || []),
    country: matchCountry(card, catalogs.countries || [])
  };
}
