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
}
