import { sqlConfig } from '../../dbConfig.js';
import express from "express";
import FormsModel from "../models/forms.js";
import FormsController from "../controllers/forms.js";
import { requireAuth } from '../../Middleware/requireAuth.js';
const router = express.Router();

//forms Recursos humanos
router.get("/forms_hr", async (req, res) => {
    await FormsController.getFormsHR(sqlConfig, req, res);
});
router.post('/forms_hr', async (req, res) => {
    await FormsModel.postFormsHR(sqlConfig, req, res);
});
router.get('/forms_temp', async (req, res) => {
    await FormsModel.postFormsHR(sqlConfig, req, res);
});
router.get("/forms_temp", async (req, res) => {
    await FormsModel.getFormsTemp(req, res);
});
router.get("/get_beneficiario", async (req, res) => {
    await FormsModel.getFormsFunctionBeneficiario(sqlConfig, req, res);
});
router.get("/get_beneficiario_cuenta", async (req, res) => {
    await FormsModel.getFormsFunctionBeneficiarioCuenta(sqlConfig, req, res);
});
router.get("/get_beneficiario_cuenta", async (req, res) => {
    await FormsModel.getFormsFunctionBeneficiarioCuenta(sqlConfig, req, res);
});
router.get("/forms_interdepartmental_request", requireAuth, async (req, res) => {
    await FormsController.getInterdepartmentalRequest(sqlConfig, req, res)
});
router.post('/forms_interdepartmental_request', async (req, res) => {
    await FormsController.postInterdepartmentalRequest(sqlConfig, req, res);
});
export default router;