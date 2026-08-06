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
import CardFilesModel from '../models/card-files.js';
import { badacoCatalogs, invalidateBadacoCache } from '../../mercadeo/services/badaco-cache.js';
import { extractCard, CARD_FIELDS, CARD_COLUMNS } from '../services/card-service.js';
import { matchCardToBadaco } from '../services/badaco-match.js';
import {
  stageCardImage,
  readStagedFile,
  discardStaged,
  storeCardFile,
  readStoredFile,
  cardsRootPath
} from '../services/card-storage.js';

const MAX_FILE_BYTES = Number(process.env.TOOLS_MAX_FILE_BYTES || 25 * 1024 * 1024); // 25 MB
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/** Tope de contactos por petición en la carga masiva a BADACO. */
const MAX_BATCH_CONTACTS = Number(process.env.TOOLS_MAX_BATCH_CONTACTS || 200);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Catálogos para el emparejado. Un lote puede traer 40 tarjetas y cada una
 * dispara una petición: sin caché serían 120 consultas.
 *
 * Se usa la caché compartida de BADACO (`mercadeo/services/badaco-cache.js`)
 * en vez de una propia, para que una empresa creada desde aquí aparezca al
 * instante en la lista de contactos y al revés.
 */
async function loadMatchCatalogs(connection) {
  const pool = await sql.connect(connection);
  const [companies, jobLevels, countries] = await Promise.all([
    badacoCatalogs.companies(pool),
    badacoCatalogs.jobLevels(pool),
    badacoCatalogs.countries(pool)
  ]);
  return { companies, jobLevels, countries };
}

/** Invalida la caché (una empresa nueva debe poder emparejarse enseguida). */
export function invalidateCardCatalogs() {
  invalidateBadacoCache('company', 'jobLevel', 'relationship');
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

/**
 * Archiva las imágenes aparcadas de una tarjeta y las deja relacionadas con el
 * contacto recién creado.
 *
 * El orden importa: primero se inserta la fila en `card_files` (su id es el
 * nombre de la carpeta) y después se escribe el archivo. Si el disco falla se
 * borra la fila, para no dejar registros que apunten a nada.
 *
 * Nunca lanza: un contacto ya creado no se deshace porque su foto no se pudo
 * guardar. Lo que no se pudo archivar vuelve como `warning`.
 *
 * @param {*} pool
 * @param {number} contactId
 * @param {Array<{side: string, token: string}>} images
 * @param {string} userId
 * @returns {Promise<{files: Array, warning: string|null}>}
 */
export async function saveContactCardImages(pool, contactId, images, userId) {
  const files = [];
  const problems = [];

  for (const image of images || []) {
    if (!image?.token) continue;

    let cfId = null;
    try {
      const staged = await readStagedFile(image.token);
      if (!staged) {
        problems.push(`the ${image.side} image is no longer available on the server`);
        continue;
      }

      cfId = await CardFilesModel.create(pool, {
        contact_id: contactId,
        side: image.side,
        file_name: staged.fileName,
        mime_type: staged.mimeType,
        file_size: staged.size,
        uingreso: userId
      });

      const fullPath = await storeCardFile(cfId, staged.fileName, staged.buffer);
      await CardFilesModel.markStored(pool, cfId, fullPath);
      await discardStaged(image.token);

      files.push({
        cf_id: cfId,
        side: image.side,
        file_name: staged.fileName,
        url: `/api/tools/cards/files/${cfId}`
      });
    } catch (error) {
      console.error('[Tools] cards saveContactCardImages error:', error);
      if (cfId) {
        try { await CardFilesModel.remove(pool, cfId); } catch (_) { /* ya no hay nada que limpiar */ }
      }
      problems.push(`the ${image.side} image could not be archived (${error.message || 'unknown error'})`);
    }
  }

  return {
    files,
    warning: problems.length ? `The contact was created, but ${problems.join(' and ')}.` : null
  };
}

export default class CardsController {
  /** GET /tools/cards — renderiza la página de la herramienta. */
  static async getCardsPage(connection, req, res) {
    const UserID = req.session?.userID;
    try {
      const pool = await sql.connect(connection);
      const [usuario, devteam] = await Promise.all([
        USERModel.obtenerDatosUsuario(pool, UserID),
        Rules.validateTeam(UserID, req.session?.iddevteam)
      ]);
      const grupousuarios = devteam ? await USERModel.findDevTeam(pool, UserID) : [];

      // Solo se cargan los catálogos de BADACO para usuarios con acceso al módulo
      // (mismo criterio que el ítem "BADACO" del sidebar en layout.pug).
      const modules = usuario.Menu?.Modules || [];
      const badacoEnabled = modules.includes('Business Developer') || modules.includes('Marketing') || modules.includes('All');

      // La API de extracción lo consulta para decidir si adjunta sugerencias.
      if (req.session) req.session.toolsBadacoEnabled = badacoEnabled;

      let companies = [], jobLevels = [], relationships = [], allCountries = [], events = [], grupousuarios_active = [];
      if (badacoEnabled) {
        let eventsResult;
        [companies, jobLevels, relationships, allCountries, grupousuarios_active, eventsResult] = await Promise.all([
          badacoCatalogs.companies(pool),
          badacoCatalogs.jobLevels(pool),
          badacoCatalogs.relationships(pool),
          badacoCatalogs.countries(pool),
          USERModel.getAllUserActive(pool, usuario.compania),
          EventsModel.readforms(pool, 100, 0, devteam, UserID, null, null, null)
        ]);
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

      // La imagen se aparca aquí y el alta del contacto la mueve a
      // //<DB_SERVER>/BADACO/<id>. Sólo tiene sentido si el usuario puede
      // crear contactos, y si el recurso compartido falla se sigue adelante
      // sin archivarla (`image` viaja como null).
      let image = null;
      let backImage = null;
      if (req.session?.toolsBadacoEnabled) {
        image = await stageCardImage(front.data, front.name);
        if (back) backImage = await stageCardImage(back.data, back.name);
      }

      return res.json({
        result: 1,
        data: extraction.data,
        match,
        raw: extraction.raw,
        fileName: front.name,
        backFileName: back ? back.name : null,
        image,
        backImage
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
        // Imágenes aparcadas en /extract que hay que archivar si el alta sale bien.
        images: [
          { side: 'front', token: text(raw?.image_token) },
          { side: 'back', token: text(raw?.back_image_token) }
        ].filter((image) => image.token),
        files: [],
        fileWarning: null,
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

            // Fuera de la transacción: el archivo se escribe en el servidor de
            // archivos, y un problema ahí no debe deshacer el contacto.
            const saved = await saveContactCardImages(pool, item.contactId, item.images, userId);
            item.files = saved.files;
            item.fileWarning = saved.warning;
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

      // Un alta puede estrenar un país: el filtro de la lista de BADACO se
      // arma con los países que usan los contactos.
      if (!dryRun && items.some((item) => item.contactId)) {
        invalidateBadacoCache('contact');
      }

      const results = items.map((item) => ({
        ref: item.ref,
        label: item.label,
        status: item.error ? 'error' : (dryRun ? 'ready' : 'created'),
        contact_id: item.contactId,
        code: item.error ? item.error.code : null,
        fields: item.error ? item.error.fields : [],
        message: item.error ? item.error.message : null,
        existing_contact_id: item.error ? (item.error.contactId || null) : null,
        files: item.files,
        file_warning: item.fileWarning
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

  /**
   * POST /api/tools/cards/files — archiva la imagen de una tarjeta contra un
   * contacto que ya existe.
   *
   * Lo usa la acción "abrir el formulario completo" de la tabla: ese alta la
   * hace el modal de BADACO, así que la imagen se adjunta después, cuando el
   * modal devuelve el `contact_id`.
   *
   * Body: `{ contact_id, image_token, back_image_token }`.
   */
  static async attachFiles(connection, req, res) {
    if (!req.session?.toolsBadacoEnabled) {
      return res.status(403).json({ result: 0, error: 'Badaco module is not enabled for this user' });
    }

    const contactId = toInt(req.body?.contact_id);
    if (!contactId) {
      return res.status(400).json({ result: 0, error: 'A valid contact_id is required' });
    }

    const images = [
      { side: 'front', token: text(req.body?.image_token) },
      { side: 'back', token: text(req.body?.back_image_token) }
    ].filter((image) => image.token);

    if (!images.length) {
      return res.status(400).json({ result: 0, error: 'No card image was sent' });
    }

    try {
      const pool = await sql.connect(connection);
      const saved = await saveContactCardImages(pool, contactId, images, req.session?.userID);
      return res.json({ result: 1, files: saved.files, warning: saved.warning });
    } catch (error) {
      console.error('[Tools] cards attachFiles error:', error);
      return res.status(500).json({ result: 0, error: 'Failed to archive the card image' });
    }
  }

  /**
   * GET /api/tools/cards/files/:id — devuelve la imagen archivada.
   * El archivo vive fuera de /public, así que se sirve desde aquí (con sesión).
   */
  static async getFile(connection, req, res) {
    if (!req.session?.toolsBadacoEnabled) {
      return res.status(403).json({ result: 0, error: 'Badaco module is not enabled for this user' });
    }

    const cfId = toInt(req.params?.id);
    if (!cfId) {
      return res.status(400).json({ result: 0, error: 'Invalid file id' });
    }

    try {
      const pool = await sql.connect(connection);
      const record = await CardFilesModel.getById(pool, cfId);
      if (!record) {
        return res.status(404).json({ result: 0, error: 'Card image not found' });
      }

      const file = await readStoredFile(record);
      if (!file) {
        return res.status(404).json({ result: 0, error: 'The card image is no longer on the file server' });
      }

      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${String(file.fileName).replace(/"/g, '')}"`);
      return res.send(file.buffer);
    } catch (error) {
      console.error('[Tools] cards getFile error:', error);
      return res.status(500).json({ result: 0, error: 'Failed to read the card image' });
    }
  }

  /**
   * GET /api/tools/cards/contacts/:id/files — imágenes archivadas de un
   * contacto (útil para la ficha de BADACO y para comprobar el archivado).
   */
  static async listContactFiles(connection, req, res) {
    if (!req.session?.toolsBadacoEnabled) {
      return res.status(403).json({ result: 0, error: 'Badaco module is not enabled for this user' });
    }

    const contactId = toInt(req.params?.id);
    if (!contactId) {
      return res.status(400).json({ result: 0, error: 'Invalid contact id' });
    }

    try {
      const pool = await sql.connect(connection);
      const files = await CardFilesModel.listByContact(pool, contactId);
      return res.json({
        result: 1,
        root: cardsRootPath(),
        files: files.map((file) => ({
          cf_id: file.cf_id,
          side: file.side,
          file_name: file.file_name,
          file_path: file.file_path,
          status: file.status,
          url: `/api/tools/cards/files/${file.cf_id}`
        }))
      });
    } catch (error) {
      console.error('[Tools] cards listContactFiles error:', error);
      return res.status(500).json({ result: 0, error: 'Failed to list the card images' });
    }
  }
}
