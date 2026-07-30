import express from "express";
import { spawn } from 'child_process';
import sql from 'mssql';
import { sqlConfig } from "../../dbConfig.js";
import SIRModel from "../models/sir-models.js";
import ApprovalController from "../../APPROVALS/controllers/approvals.js";
const router = express.Router();

/**
 * @openapi
 * /approvals-sir:
 *   post:
 *     summary: Create an Approval From the SIR flows 81-87 100-101 
 *     description: |
 *       Flows     
 * 
 *       [   81  - Underwriting Signature Request - Facultativos LATAM        ]   
 *       [   82  - Underwriting Signature Request - Facultativos OVERSEAS  ]   
 *       [   83  - Payment Request - Payment Request Claims FAC  - SINIESTROS  ]   
 *       [   84  - Payment Request - Payment Request Claims Treaty - CRSINIESTROS   ]   
 *       [   85  - Signature Document Request - Claims FAC Firma documento  -  SINIESTROS ]   
 *       [   86  - Operations Firma documento - Operations Firma documento LATAM   - CONTRATOS]   
 *       [   106  - Operations Firma documento - Operations Firma documento OVERSEAS  - CONTRATOS]   
 *       [   87  - Table Characteristics Review - Operation Table Characteristics - CONTRATOS]   
 *       [   100 - Payment Request - MGA Payment Request FAC  - SINIESTROS]   
 *       [   101 - Payment Request - MGA Payment Request Claims Treaty - CRSINIESTROS]   
 *       [   112  - Underwriting Signature Request - FAC Firma documento LATAM  ] This change is intended to force the approver of these deals to be Erik Feigelson   
 *       [   116  - Underwriting Signature Request - ART Signature Request  ]   
 *       [   119  - Signature Document Request - MGA Signature Request  ] 
 *     tags:
 *       - SIR ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cusuario:
 *                 type: string
 *                 example: emoulton
 *               cflow:
 *                 type: integer
 *                 example: 86
 *               csuscriptor:
 *                 type: string
 *                 example: lvargas
 *               detalle_proceso:
 *                 type: string
 *                 example: Otro de Otro de prueba proceder con los procesos de esta suscripción
 *               sir_reference:
 *                 type: string
 *                 example: 2025.211.6444.012.001400
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: number 
 *                   example: 19450                  
 *       400:
 *         description: FAILED
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                     error:
 *                       type: string 
 *                       example: "Missing required fields... fields: cusuario, cflow, csuscriptor, detalle_proceso, sir_reference"
 */
    router.post("/approvals-sir", async (req, res) => {
        await ApprovalController.createApprovalBySIR(sqlConfig, req, res)
    });
/**
 * @openapi
 * /custom_report:
 *   post:
 *     summary: Generates a custom report
 *     description: Generates a custom report
 *     tags:
 *       - SIR ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reporte:
 *                 type: string
 *                 example: 12
 *               inicio:
 *                 type: string
 *                 example: 
 *               fin:
 *                 type: string
 *                 example: 87
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reporte:
 *                   type: number 
 *                   example: 1
 *       400:
 *         description: FAILED
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     error:
 *                       type: string 
 *                       example: "Repote invalido"
 */
    router.post('/custom_report', async(req, res) => {
        await SIRModel.customReport(req, res)
    });
/**
 * @openapi
 * /mga_bordereau:
 *   post:
 *     summary: Send data to MGA Bordereau
 *     description: Send data to MGA Bordereau
 *     tags:
 *       - SIR ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ruta:
 *                 type: string
 *                 example: 12
 *               suscriptor:
 *                 type: string
 *                 example: 
 *               env:
 *                 type: string
 *                 example: 87
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: number 
 *                   example: 1
 *       400:
 *         description: FAILED
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     error:
 *                       type: string 
 *                       example: "Repote invalido"
 */
    router.post("/mga_bordereau", async(req, res) => {
        await SIRModel.mgaBordereau(req, res)
    });
/**
 * @openapi
 * /mga_bordereau_endorsement:
 *   post:
 *     summary: Send data to MGA Bordereau
 *     description: Send data to MGA Bordereau
 *     tags:
 *       - SIR ENDPOINTS
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: number 
 *                   example: 1
 */
    router.post("/mga_bordereau_endorsement", async(req, res) => {
        await SIRModel.mgaBordereauEndorsement(req, res)
    });
/**
 * @openapi
 * /liq_payment:
 *   post:
 *     summary: Send data to MGA Bordereau
 *     description: Send data to MGA Bordereau
 *     tags:
 *       - SIR ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ruta:
 *                 type: string
 *                 example: 12
 *               suscriptor:
 *                 type: string
 *                 example: 
 *               env:
 *                 type: string
 *                 example: 87
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: number 
 *                   example: 1                  
 */
    router.post("/liq_payment", async(req, res) => {
        await SIRModel.liqPayment(req, res)
    });
/**
 * @openapi
 * /cobranza:
 *   post:
 *     summary: Send data to MGA Bordereau
 *     description: Send data to MGA Bordereau
 *     tags:
 *       - SIR ENDPOINTS
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: number 
 *                   example: 1                  
 */
    router.post("/cobranza", async(req, res) => {
        await SIRModel.cobranza(req, res)
    });
/**
 * @openapi
 * /sendmail:
 *   post:
 *     summary: Send data to MGA Bordereau
 *     description: Send data to MGA Bordereau
 *     tags:
 *       - SIR ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 example: 12
 *               env:
 *                 type: string
 *                 example: desa
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: number 
 *                   example: 1                  
 */
    router.post("/sendmail", async(req, res) => {
        await SIRModel.sendMail(req, res)
    });
/**
 * @openapi
 * /api_get_monedas:
 *   post:
 *     summary: Get Monedas from the master table 
 *     description: Get Monedas from the master table
 *     tags:
 *       - SIR ENDPOINTS
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: number 
 *                   example: 1                  
 */ 
    router.post("/api_get_monedas", async(req, res) => {
        await SIRModel.apiGetMonedas(req, res)
    });

    router.post("/sendmail_dashboard", async(req, res) => {
        await SIRModel.sendMailDashboard(req, res)
    });
    export default router; 
