import { sqlConfig } from '../../dbConfig.js';
import express from "express";
import { checkServerAvailability } from '../../Middleware/checkServerAvailability.js';
import { requireAuth } from '../../Middleware/requireAuth.js';
import AIController from '../controllers/controllers.js';

const router = express.Router();

router.get('/api/ai/crm-context', checkServerAvailability, requireAuth, async (req, res) => {
        await AIController.getCrmContext(sqlConfig, req, res);
    });

router.get('/api/ai/approval-context', checkServerAvailability, requireAuth, async (req, res) => {
        await AIController.getApprovalContext(sqlConfig, req, res);
    });

router.post("/api/ai/send", checkServerAvailability, requireAuth, async (req, res) => {
        await AIController.AIcrmMessages(sqlConfig, req, res);
    });

router.post("/api/ai/save-message", checkServerAvailability, requireAuth, async (req, res) => {
        await AIController.saveAISummaryAsMessage(sqlConfig, req, res);
    });

export default router;



