/**
 * Controlador de la herramienta "Presentation Cards" (extracción de datos de
 * tarjetas de presentación con IA de visión).
 *
 * Parte del módulo Tools. Sigue las convenciones del proyecto:
 *   - `sqlConfig` (config de conexión) se recibe como primer argumento.
 *   - Los métodos son estáticos.
 *   - El render de la página obtiene el perfil/menú del usuario igual que el
 *     resto de vistas (obtenerDatosUsuario + validateTeam).
 *
 * Además de extraer, resuelve las llaves foráneas de BADACO (empresa, país y
 * nivel de cargo) contra los catálogos, para que el usuario revise etiquetas
 * legibles mientras se guardan los ids.
 */
import sql from 'mssql';
import Rules from '../../USERS/rule/DevTeam.js';
import USERModel from '../../USERS/model/USER.js';
import BadacoModel from '../../mercadeo/model/BadacoModel.js';
import EventsModel from '../../mercadeo/model/events.js';
import { extractCard, CARD_FIELDS, CARD_COLUMNS } from '../services/card-service.js';
import { matchCardToBadaco } from '../services/badaco-match.js';

const MAX_FILE_BYTES = Number(process.env.TOOLS_MAX_FILE_BYTES || 25 * 1024 * 1024); // 25 MB
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/** Tope de contactos por petición en la carga masiva a BADACO. */
const MAX_BATCH_CONTACTS = Number(process.env.TOOLS_MAX_BATCH_CONTACTS || 200);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Caché de catálogos para el emparejado. Un lote puede traer 40 tarjetas y
 * cada una dispara una petición: sin caché serían 120 consultas.
 */
const CATALOG_TTL_MS = Number(process.env.TOOLS_CATALOG_TTL_MS || 5 * 60 * 1000);
let catalogCache = { at: 0, data: null };

async function loadMatchCatalogs(connection) {
  if (catalogCache.data && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.data;
  }
  const pool = await sql.connect(connection);
  const [companies, jobLevels, countries] = await Promise.all([
    BadacoModel.getAllCompanies(pool),
    BadacoModel.getAllJobLevels(pool),
    USERModel.getCountries(pool)
  ]);
  catalogCache = { at: Date.now(), data: { companies, jobLevels, countries } };
  return catalogCache.data;
}

/** Invalida la caché (una empresa nueva debe poder emparejarse enseguida). */
export function invalidateCardCatalogs() {
  catalogCache = { at: 0, data: null };
}

/** Recorta un valor de texto al ancho de su columna en `badaco_contactos`. */
function text(value, max) {
  const clean = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  return max ? clean.slice(0, max) : clean;
}

function toInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Valida que un archivo subido sea una imagen soportada dentro del límite. */
function validateImage(file) {
  if (file.size > MAX_FILE_BYTES) {
    return `File "${file.name}" too large. Max ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB`;
  }
  if (!IMAGE_MIME.has(file.mimetype) && !IMAGE_EXT.test(file.name)) {
    return `Unsupported file type: "${file.name}". Use PNG, JPG, JPEG or WEBP`;
  }
  return null;
}

export default class CardsController {
  /** GET /tools/cards — renderiza la página de la herramienta. */
  static async getCardsPage(connection, req, res) {
    const UserID = req.session?.userID;
    try {
      const pool = await sql.connect(connection);
      const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
      const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam);
      const grupousuarios = devteam ? await USERModel.findDevTeam(pool, UserID) : [];

      // Solo se cargan los catálogos de BADACO para usuarios con acceso al módulo
      // (mismo criterio que el ítem "BADACO" del sidebar en layout.pug).
      const modules = usuario.Menu?.Modules || [];
      const badacoEnabled = modules.includes('Business Developer') || modules.includes('Marketing') || modules.includes('All');

      // La API de extracción lo consulta para decidir si adjunta sugerencias.
      if (req.session) req.session.toolsBadacoEnabled = badacoEnabled;

      let companies = [], jobLevels = [], relationships = [], allCountries = [], events = [], grupousuarios_active = [];
      if (badacoEnabled) {
        [companies, jobLevels, relationships, allCountries, grupousuarios_active] = await Promise.all([
          BadacoModel.getAllCompanies(pool),
          BadacoModel.getAllJobLevels(pool),
          BadacoModel.getAllRelationships(pool),
          USERModel.getCountries(pool),
          USERModel.getAllUserActive(pool, usuario.compania)
        ]);
        const eventsResult = await EventsModel.readforms(pool, 100, 0, devteam, UserID, null, null, null);
        events = eventsResult.recordset || [];
      }

      // Catálogos ligeros para los desplegables de la tabla de revisión:
      // sólo id + etiqueta, para no inflar el HTML de la página.
      const matchCatalogs = {
        companies: companies.map((c) => ({
          id: c.bmc_id,
          label: c.nombre,
          hint: (c.xnombre_pais_ingles || '').trim()
        })),
        jobLevels: jobLevels.map((jl) => ({ id: jl.bmjl_id, label: jl.name })),
        countries: allCountries.map((c) => ({ id: c.cpais, label: (c.xnombre_pais_ingles || '').trim() }))
      };

      res.render('tools/cards', {
        title: 'Tools - Presentation Cards',
        userProfile: {
          UserName: usuario.UserName,
          UserID: UserID,
          UsuarioID: UserID,
          UserEmail: usuario.UserEmail
        },
        userMenu: usuario.Menu,
        usuarios: grupousuarios,
        devteam,
        cardFields: CARD_FIELDS,
        cardColumns: CARD_COLUMNS.filter((col) => !col.badacoOnly || badacoEnabled),
        matchCatalogs,
        badacoEnabled,
        companies,
        jobLevels,
        relationships,
        allCountries,
        events,
        grupousuarios_active
      });
    } catch (error) {
      console.error('[Tools] getCardsPage error:', error);
      res.status(500).send('Error loading the presentation cards tool');
    }
  }

  /**
   * POST /api/tools/cards/extract — extrae los datos de UNA tarjeta.
   * Espera multipart con el campo `front` (imagen) y opcionalmente `back`
   * (imagen del dorso para tarjetas de doble cara). El frontend procesa la
   * lista de tarjetas secuencialmente, una petición por tarjeta.
   *
   * Respuesta: `data` (texto tal como lo leyó el modelo) y `match` (llaves de
   * BADACO sugeridas: bmc_id, cpais, bmjl_id, con alternativas y confianza).
   */
  static async extract(connection, req, res) {
    try {
      const front = req.files?.front;
      const back = req.files?.back || null;

      if (!front) {
        return res.status(400).json({ result: 0, error: 'No card image was uploaded' });
      }

      for (const file of back ? [front, back] : [front]) {
        const error = validateImage(file);
        if (error) return res.status(415).json({ result: 0, error });
      }

      const extraction = await extractCard(front.data, back ? back.data : null);

      // El emparejado es un extra: si falla, la extracción sigue siendo útil.
      let match = null;
      if (req.session?.toolsBadacoEnabled) {
        try {
          match = matchCardToBadaco(extraction.data, await loadMatchCatalogs(connection));
        } catch (matchError) {
          console.error('[Tools] cards match error:', matchError);
        }
      }

      return res.json({
        result: 1,
        data: extraction.data,
        match,
        raw: extraction.raw,
        fileName: front.name,
        backFileName: back ? back.name : null
      });
    } catch (error) {
      console.error('[Tools] cards extract error:', error);
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      return res.status(timedOut ? 504 : 500).json({
        result: 0,
        error: timedOut
          ? 'The AI service took too long to respond (more than 3 minutes)'
          : 'Failed to extract data from the card'
      });
    }
  }

  /**
   * POST /api/tools/cards/rematch — vuelve a resolver las llaves de BADACO
   * para los datos ya editados por el usuario (sin volver a llamar a la IA).
   * Lo usa la tabla cuando se corrige a mano la empresa o el país.
   */
  static async rematch(connection, req, res) {
    try {
      if (!req.session?.toolsBadacoEnabled) {
        return res.status(403).json({ result: 0, error: 'Badaco module is not enabled for this user' });
      }
      const card = req.body?.data || {};
      if (req.body?.refresh) invalidateCardCatalogs();

      const match = matchCardToBadaco(card, await loadMatchCatalogs(connection));
      return res.json({ result: 1, match });
    } catch (error) {
      console.error('[Tools] cards rematch error:', error);
      return res.status(500).json({ result: 0, error: 'Failed to match the card against Badaco' });
    }
  }

  /**
   * POST /api/tools/cards/contacts — crea en BADACO uno o varios contactos ya
   * revisados en la tabla, sin pasar por el formulario.
   *
   * Body: `{ contacts: [{ ref, label, name, email, bmc_id, ... }], dryRun }`.
   * Con `dryRun` sólo se valida (lo usa la tabla para marcar los duplicados
   * antes de que el usuario pulse "enviar").
   *
   * Cada contacto se inserta en su propia transacción: una fila con problemas
   * no debe tumbar el resto del lote. La respuesta devuelve el resultado fila
   * a fila (`ref` es el identificador que mandó el cliente) para que la tabla
   * pueda decir exactamente qué línea falló y por qué.
   */
  static async createContacts(connection, req, res) {
    if (!req.session?.toolsBadacoEnabled) {
      return res.status(403).json({ result: 0, error: 'Badaco module is not enabled for this user' });
    }

    const dryRun = !!req.body?.dryRun;
    const contacts = Array.isArray(req.body?.contacts) ? req.body.contacts : [];

    if (!contacts.length) {
      return res.status(400).json({ result: 0, error: 'No contacts were sent' });
    }
    if (contacts.length > MAX_BATCH_CONTACTS) {
      return res.status(413).json({
        result: 0,
        error: `Too many contacts in a single request (max ${MAX_BATCH_CONTACTS})`
      });
    }

    try {
      const pool = await sql.connect(connection);
      const userId = req.session?.userID;

      const items = contacts.map((raw, position) => ({
        ref: raw?.ref == null ? position : raw.ref,
        label: text(raw?.label) || `Card ${position + 1}`,
        contactId: null,
        error: null,
        data: {
          bmc_id: toInt(raw?.bmc_id),
          name: text(raw?.name, 100),
          email: text(raw?.email, 100).toLowerCase(),
          job_title: text(raw?.job_title, 75),
          bmjl_id: toInt(raw?.bmjl_id),
          country: text(raw?.country, 10) || null,
          address: text(raw?.address, 250) || null,
          phone_number: text(raw?.phone_number, 50) || null
        }
      }));

      // 1) Campos obligatorios y duplicados dentro del propio lote.
      const seen = new Map();
      for (const item of items) {
        const missing = [];
        if (!item.data.name) missing.push('Name');
        if (!item.data.email) missing.push('Email');
        if (!item.data.bmc_id) missing.push('Company');

        if (missing.length) {
          item.error = {
            code: 'missing_fields',
            fields: missing,
            message: `Missing required ${missing.length > 1 ? 'fields' : 'field'}: ${missing.join(', ')}.`
          };
          continue;
        }
        if (!EMAIL_RE.test(item.data.email)) {
          item.error = {
            code: 'invalid_email',
            fields: ['Email'],
            message: `"${item.data.email}" is not a valid email address.`
          };
          continue;
        }

        const twin = seen.get(item.data.email);
        if (twin) {
          item.error = {
            code: 'duplicate_batch',
            fields: ['Email'],
            message: `The email ${item.data.email} is repeated in this batch — "${twin.label}" already uses it.`
          };
          continue;
        }
        seen.set(item.data.email, item);
      }

      // 2) La empresa enlazada tiene que seguir existiendo.
      const pendingCompanies = [...new Set(items.filter((i) => !i.error).map((i) => i.data.bmc_id))];
      const companyExists = new Map();
      for (const id of pendingCompanies) {
        companyExists.set(id, await BadacoModel.checkCompanyExists(pool, id));
      }
      for (const item of items) {
        if (item.error) continue;
        if (!companyExists.get(item.data.bmc_id)) {
          item.error = {
            code: 'unknown_company',
            fields: ['Company'],
            message: 'The linked company no longer exists in Badaco. Pick another one or create it again.'
          };
        }
      }

      // 3) Correos que ya están en BADACO (una sola consulta para todo el lote).
      const existing = await BadacoModel.findContactsByEmails(
        pool,
        items.filter((i) => !i.error).map((i) => i.data.email)
      );
      const byEmail = new Map(existing.map((c) => [String(c.email || '').trim().toLowerCase(), c]));
      for (const item of items) {
        if (item.error) continue;
        const hit = byEmail.get(item.data.email);
        if (hit) {
          item.error = {
            code: 'duplicate_badaco',
            fields: ['Email'],
            message: `${item.data.email} already belongs to ${hit.name || 'another contact'}` +
              `${hit.company_name ? ` (${hit.company_name})` : ''} in Badaco.`,
            contactId: hit.contact_id
          };
        }
      }

      // 4) Alta. En `dryRun` sólo se valida.
      if (!dryRun) {
        for (const item of items) {
          if (item.error) continue;
          const transaction = new sql.Transaction(pool);
          try {
            await transaction.begin();
            item.contactId = await BadacoModel.createContact(transaction, {
              ...item.data,
              event: null,
              contact_rl_id: null,
              contactos_asociados: [],
              uingreso: userId
            });
            await transaction.commit();
          } catch (error) {
            try { await transaction.rollback(); } catch (_) { /* la transacción ya murió */ }
            console.error('[Tools] cards createContacts insert error:', error);
            item.error = {
              code: 'insert_failed',
              fields: [],
              message: `Badaco rejected this contact: ${error.message || 'unknown error'}`
            };
          }
        }
      }

      const results = items.map((item) => ({
        ref: item.ref,
        label: item.label,
        status: item.error ? 'error' : (dryRun ? 'ready' : 'created'),
        contact_id: item.contactId,
        code: item.error ? item.error.code : null,
        fields: item.error ? item.error.fields : [],
        message: item.error ? item.error.message : null,
        existing_contact_id: item.error ? (item.error.contactId || null) : null
      }));

      return res.json({
        result: 1,
        dryRun,
        created: results.filter((r) => r.status === 'created').length,
        ready: results.filter((r) => r.status === 'ready').length,
        failed: results.filter((r) => r.status === 'error').length,
        results
      });
    } catch (error) {
      console.error('[Tools] cards createContacts error:', error);
      return res.status(500).json({ result: 0, error: 'Failed to send the contacts to Badaco' });
    }
  }
}
