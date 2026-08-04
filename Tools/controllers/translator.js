/**
 * Controlador de la herramienta "Traducción Multiidioma desde Imágenes y PDFs".
 *
 * Parte del módulo Tools. Sigue las convenciones del proyecto:
 *   - `sqlConfig` (config de conexión) se recibe como primer argumento.
 *   - Los métodos son estáticos.
 *   - El render de la página obtiene el perfil/menú del usuario igual que el
 *     resto de vistas (obtenerDatosUsuario + validateTeam).
 */
import sql from 'mssql';
import Rules from '../../USERS/rule/DevTeam.js';
import USERModel from '../../USERS/model/USER.js';
import { OCR_LANGUAGES, TARGET_LANGUAGES, isValidOcrCode } from '../utils/languages.js';
import { extractFromImage, extractFromPdf } from '../services/extraction-service.js';
import { translateText } from '../services/translation-service.js';

const MAX_FILE_BYTES = Number(process.env.TOOLS_MAX_FILE_BYTES || 25 * 1024 * 1024); // 25 MB
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

export default class TranslatorController {
  /** GET /tools/translator — renderiza la página de la herramienta. */
  static async getTranslatorPage(connection, req, res) {
    const UserID = req.session?.userID;
    try {
      const pool = await sql.connect(connection);
      const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
      const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam);
      const grupousuarios = devteam ? await USERModel.findDevTeam(pool, UserID) : [];

      res.render('tools/translator', {
        title: 'Tools - Translator',
        userProfile: {
          UserName: usuario.UserName,
          UsuarioID: UserID
        },
        userMenu: usuario.Menu,
        usuarios: grupousuarios,
        devteam,
        ocrLanguages: OCR_LANGUAGES,
        targetLanguages: TARGET_LANGUAGES
      });
    } catch (error) {
      console.error('[Tools] getTranslatorPage error:', error);
      res.status(500).send('Error loading the translator tool');
    }
  }

  /**
   * POST /api/tools/extract — extrae texto de un archivo subido.
   * Espera multipart con el campo `file` y campos `source_lang`, `preprocess`.
   */
  static async extract(connection, req, res) {
    try {
      const file = req.files?.file;
      if (!file) {
        return res.status(400).json({ result: 0, error: 'No file was uploaded' });
      }

      if (file.size > MAX_FILE_BYTES) {
        return res.status(413).json({
          result: 0,
          error: `File too large. Max ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB`
        });
      }

      const code = String(req.body.source_lang || 'auto');
      if (!isValidOcrCode(code)) {
        return res.status(400).json({ result: 0, error: 'Unsupported source language' });
      }
      const preprocess = String(req.body.preprocess ?? '1') !== '0';
      const dpi = Number(req.body.dpi) || undefined;

      const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.name);
      const isImage = IMAGE_MIME.has(file.mimetype) || IMAGE_EXT.test(file.name);

      if (!isPdf && !isImage) {
        return res.status(415).json({ result: 0, error: 'Unsupported file type' });
      }

      const buffer = file.data;
      const extraction = isPdf
        ? await extractFromPdf(buffer, { code, preprocess, dpi })
        : await extractFromImage(buffer, { code, preprocess });

      return res.json({
        result: 1,
        text: extraction.text,
        detectedLang: extraction.detectedLang || null,
        method: extraction.method,
        pageCount: extraction.pageCount,
        chars: extraction.text.length,
        fileName: file.name,
        fileSize: file.size
      });
    } catch (error) {
      console.error('[Tools] extract error:', error);
      return res.status(500).json({ result: 0, error: 'Failed to extract text from the file' });
    }
  }

  /**
   * POST /api/tools/translate — traduce texto al idioma destino.
   * Body JSON: { text, target_lang }.
   */
  static async translate(connection, req, res) {
    try {
      const text = String(req.body.text || '').trim();
      const targetCode = String(req.body.target_lang || '');

      if (!text) {
        return res.status(400).json({ result: 0, error: 'text is required' });
      }
      if (!TARGET_LANGUAGES || !Object.values(TARGET_LANGUAGES).includes(targetCode)) {
        return res.status(400).json({ result: 0, error: 'Unsupported target language' });
      }

      const translation = await translateText(text, targetCode);
      if (!translation) {
        return res.status(502).json({ result: 0, error: 'Empty translation from AI service' });
      }

      return res.json({ result: 1, translation });
    } catch (error) {
      console.error('[Tools] translate error:', error);
      return res.status(500).json({ result: 0, error: 'Failed to translate text' });
    }
  }
}
