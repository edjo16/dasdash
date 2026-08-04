import { sqlConfig } from '../../dbConfig.js';
import express from 'express';
import { requireAuth } from '../../Middleware/requireAuth.js';
import TranslatorController from '../controllers/translator.js';
import CardsController from '../controllers/cards.js';

const router = express.Router();

// Página de la herramienta de traducción multiidioma.
router.get('/tools/translator', requireAuth, async (req, res) => {
  await TranslatorController.getTranslatorPage(sqlConfig, req, res);
});

// API: extracción de texto (OCR / PDF) desde el archivo subido.
router.post('/api/tools/extract', requireAuth, async (req, res) => {
  await TranslatorController.extract(sqlConfig, req, res);
});

// API: traducción del texto extraído.
router.post('/api/tools/translate', requireAuth, async (req, res) => {
  await TranslatorController.translate(sqlConfig, req, res);
});

// Página de la herramienta de tarjetas de presentación.
router.get('/tools/cards', requireAuth, async (req, res) => {
  await CardsController.getCardsPage(sqlConfig, req, res);
});

// API: extracción de datos de una tarjeta (frente + dorso opcional).
router.post('/api/tools/cards/extract', requireAuth, async (req, res) => {
  await CardsController.extract(sqlConfig, req, res);
});

// API: re-emparejado contra los catálogos de BADACO tras editar los datos.
router.post('/api/tools/cards/rematch', requireAuth, async (req, res) => {
  await CardsController.rematch(sqlConfig, req, res);
});

export default router;
