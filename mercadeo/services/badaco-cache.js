/**
 * Caché en memoria de los catálogos de BADACO.
 *
 * Problema que resuelve: empresas, job levels, relaciones, países y regiones
 * cambian unas pocas veces al día, pero se consultaban en CADA render de la
 * lista, del formulario, de los modales y de la herramienta de tarjetas. Con
 * varios usuarios trabajando a la vez eso son cientos de consultas idénticas
 * por minuto contra tablas que no se han movido.
 *
 * Diseño:
 *   - TTL corto (5 min por defecto) para que un cambio hecho por otra vía
 *     aparezca solo, sin reiniciar nada.
 *   - Invalidación explícita en las altas/ediciones (`invalidateBadacoCache`),
 *     para que quien acaba de crear una empresa la vea al instante.
 *   - Una sola consulta en vuelo por catálogo: si diez peticiones piden las
 *     empresas a la vez con la caché fría, sólo una va a la base de datos y
 *     las demás esperan a esa misma promesa.
 *
 * Es una caché de proceso: con varias instancias de la app cada una tiene la
 * suya, y el TTL las mantiene alineadas.
 */
import BadacoModel from '../model/BadacoModel.js';
import USERModel from '../../USERS/model/USER.js';

const TTL_MS = Number(process.env.BADACO_CACHE_TTL_MS || 5 * 60 * 1000);

/** key -> { at, value, inflight } */
const store = new Map();

/** Catálogos que se invalidan al tocar cada entidad. */
const INVALIDATION_MAP = {
  company: ['companies', 'companyOptions'],
  jobLevel: ['jobLevels'],
  relationship: ['relationships'],
  contact: ['contactCountries']
};

async function cached(key, loader) {
  const entry = store.get(key);

  if (entry && entry.value !== undefined && Date.now() - entry.at < TTL_MS) {
    return entry.value;
  }
  if (entry?.inflight) return entry.inflight;

  const inflight = loader()
    .then((value) => {
      store.set(key, { at: Date.now(), value });
      return value;
    })
    .catch((error) => {
      // Un fallo no debe quedar cacheado ni dejar la entrada colgada.
      store.delete(key);
      throw error;
    });

  store.set(key, { at: entry?.at ?? 0, value: entry?.value, inflight });
  return inflight;
}

/**
 * Invalida los catálogos afectados por un cambio.
 * @param {...('company'|'jobLevel'|'relationship'|'contact')} entities
 */
export function invalidateBadacoCache(...entities) {
  if (!entities.length) {
    store.clear();
    return;
  }
  for (const entity of entities) {
    for (const key of INVALIDATION_MAP[entity] || []) store.delete(key);
  }
}

/** Catálogos cacheados. Todos reciben el `pool` y devuelven lo mismo que el modelo. */
export const badacoCatalogs = {
  companies: (pool) => cached('companies', () => BadacoModel.getAllCompanies(pool)),
  companyOptions: (pool) => cached('companyOptions', () => BadacoModel.getCompanyOptions(pool)),
  jobLevels: (pool) => cached('jobLevels', () => BadacoModel.getAllJobLevels(pool)),
  relationships: (pool) => cached('relationships', () => BadacoModel.getAllRelationships(pool)),
  companyTypes: (pool) => cached('companyTypes', () => BadacoModel.getCompanyType(pool)),
  companyRegions: (pool) => cached('companyRegions', () => BadacoModel.getCompanyRegion(pool)),
  regionNames: (pool) => cached('regionNames', () => BadacoModel.getUniqueRegions(pool)),
  /** Continente por país, para el Excel (m_pais completo, ~250 filas). */
  regions: (pool) => cached('regions', () => BadacoModel.getRegions(pool)),
  /** Países del maestro m_pais (cpais + nombre). */
  countries: (pool) => cached('countries', () => USERModel.getCountries(pool)),
  /** Países que realmente usan los contactos (alimenta el filtro de la lista). */
  contactCountries: (pool) => cached('contactCountries', () => BadacoModel.getUniqueCountries(pool))
};

/** Diagnóstico: qué hay cacheado y desde cuándo. */
export function badacoCacheStats() {
  return [...store.entries()].map(([key, entry]) => ({
    key,
    ageMs: entry.at ? Date.now() - entry.at : null,
    rows: Array.isArray(entry.value) ? entry.value.length : null,
    loading: !!entry.inflight
  }));
}
