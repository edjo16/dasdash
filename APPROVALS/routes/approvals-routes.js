import { request as _request } from 'https';
import { sqlConfig } from '../../dbConfig.js';
import ApprovalController from '../controllers/approvals.js';
import DashboardController from '../../USERS/controllers/Dashboard.js';
import USERController from '../../USERS/controllers/Users.js';
import ApprovalFunctionsModel from '../../Approvals_functions/models/approval_functions.js'
import ApprovalFunctionsController from '../../Approvals_functions/controllers/approval_functions.js';
import DigitalSignaturesController from '../../Approvals_functions/controllers/digital_signatures.js';
import ApprovalTranslationsController from '../../Approvals_functions/controllers/approval_translations.js';
import express from "express";
import { checkServerAvailability } from '../../Middleware/checkServerAvailability.js';
import { requireAuth } from '../../Middleware/requireAuth.js';

const router = express.Router();
/**
 * @openapi
 * /:
 *   get:
 *     summary: GET
 *     description: Read all the approvals
 *     tags:
 *       - HOME ENDPOINTS
 *     parameters:
 *       - in: query
 *         name: p
 *         schema:
 *            type: string
 *            example: username16
 *         required: true
 *         description: UserID
 *       - in: query
 *         name: page
 *         schema:
 *           type: string
 *           example: 1
 *         required: true
 *         description: Page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: string
 *           example: 15
 *         required: true
 *         description: Limit
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           example: All
 *         required: true
 *         description: Status
 *       - in: query
 *         name: process
 *         schema:
 *           type: string
 *           example: Payment Request
 *         required: false
 *         description: Process
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: Instrucción de pagos
 *         required: false
 *         description: Search
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           example: 1
 *         required: false
 *         description: Type
 *       - in: query
 *         name: only_start
 *         schema:
 *           type: string
 *           example: true
 *         required: false
 *         description: Only Start
 *       - in: query
 *         name: solicitante_fecha
 *         schema:
 *           type: string
 *           example: 02/01/2025
 *         required: false
 *         description: Solicitante Fecha
 *       - in: query
 *         name: cierre_fecha
 *         schema:
 *           type: string
 *           example: 02/01/2025
 *         required: false
 *         description: Cierre Fecha
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 approvalData:
 *                   type: object 
 *                   example: {"approvalData": [{"id": 19291,"solicitante": "Ledys Garcia","proceso": "RRHH Ausencias y Vacaciones","detalle_proceso": "Register absence with medical certificate, 2024-11-13 (Wednesday)-2024-11-13 (Wednesday) equivalent to 1 days. Enfermedad común ","s_fecha": "14/11/2024","verificador": "Nelly","aprobador": "N/A","firmante": "N/A","ejecutor": "Franklin Paz","asignado": null,"estado": "Execute","ApprovalID": "2b1e199c-9928-4264-805a-11c4ecbb9048","pago": null,"mmonto": null,"moneda": null,"cierre_fecha": null,"estado1": null,"ctipo_flujo": 0,"pending": true,"solicitante_imagen": "lgarcia","verificador_imagen": "nelly","aprobador_imagen": null,"firmante_imagen": null,"ejecutor_imagen": "fpaz","operador_imagen": null,"asignado_imagen": null}]}
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

router.get("/", checkServerAvailability, requireAuth, async (req, res) => {
    // Mantienes tus locals del estado de servidores
    res.locals.serversAvailable = req.serversAvailable;
    res.locals.serverStatus = req.serverStatus || [];
    res.locals.availableServersCount = req.availableServersCount || 0;
    res.locals.totalServersCount = req.totalServersCount || 0;

    if (!req.serversAvailable) {
      res.locals.serverWarning = {
        title: 'Server Warning',
        message: `Not all storage servers are available.`,
        type: 'warning'
      };
    }

    await DashboardController.getDashboard(sqlConfig, req, res);
  }
);
/**
 * @openapi
 * /:
 *   get:
 *     summary: GET
 *     description: Read all the approvals
 *     tags:
 *       - APPROVALS ENDPOINTS
 *     parameters:
 *       - in: query
 *         name: p
 *         schema:
 *            type: string
 *            example: username16
 *         required: true
 *         description: UserID
 *       - in: query
 *         name: page
 *         schema:
 *           type: string
 *           example: 1
 *         required: true
 *         description: Page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: string
 *           example: 15
 *         required: true
 *         description: Limit
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           example: All
 *         required: true
 *         description: Status
 *       - in: query
 *         name: process
 *         schema:
 *           type: string
 *           example: Payment Request
 *         required: false
 *         description: Process
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: Instrucción de pagos
 *         required: false
 *         description: Search
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           example: 1
 *         required: false
 *         description: Type
 *       - in: query
 *         name: only_start
 *         schema:
 *           type: string
 *           example: true
 *         required: false
 *         description: Only Start
 *       - in: query
 *         name: solicitante_fecha
 *         schema:
 *           type: string
 *           example: 02/01/2025
 *         required: false
 *         description: Solicitante Fecha
 *       - in: query
 *         name: cierre_fecha
 *         schema:
 *           type: string
 *           example: 02/01/2025
 *         required: false
 *         description: Cierre Fecha
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 approvalData:
 *                   type: object 
 *                   example: {"approvalData": [{"id": 19291,"solicitante": "Ledys Garcia","proceso": "RRHH Ausencias y Vacaciones","detalle_proceso": "Register absence with medical certificate, 2024-11-13 (Wednesday)-2024-11-13 (Wednesday) equivalent to 1 days. Enfermedad común ","s_fecha": "14/11/2024","verificador": "Nelly","aprobador": "N/A","firmante": "N/A","ejecutor": "Franklin Paz","asignado": null,"estado": "Execute","ApprovalID": "2b1e199c-9928-4264-805a-11c4ecbb9048","pago": null,"mmonto": null,"moneda": null,"cierre_fecha": null,"estado1": null,"ctipo_flujo": 0,"pending": true,"solicitante_imagen": "lgarcia","verificador_imagen": "nelly","aprobador_imagen": null,"firmante_imagen": null,"ejecutor_imagen": "fpaz","operador_imagen": null,"asignado_imagen": null}]}
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
    router.post("/download-excel", async (req, res) => {
        await ApprovalController.downloadExcel(sqlConfig, req, res)
    });

    router.post("/copy_files_approvals_to_sir", async (req, res) => {
        await ApprovalController.getFilesFromApproval(sqlConfig, req, res)
    });
/**
 * @openapi
 * /global_search:
 *   get:
 *     summary: GET
 *     description: Read all the approvals
 *     tags:
 *       - APPROVALS ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               busqueda:
 *                 type: algo
 *                 example: bus
 *               UserID:
 *                 type: string
 *                 example: lossa 
 *               user:
 *                 type: string
 *                 example: Luis Ossa
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
    router.post('/global_search/approvals', async (req, res) => {
        await ApprovalFunctionsModel.globalSearchApprovals(req, res)
    });
    router.post('/global_search/crm', async (req, res) => {
        await ApprovalFunctionsModel.globalSearchCRM(req, res)
    });
    router.post('/global_search/crm_msg', async (req, res) => {
        await ApprovalFunctionsModel.globalSearchCRMMsg(req, res)
    });

/**
 * @openapi
 * /all-approvals:
 *   get:
 *     summary: GET
 *     description: Read all the approvals
 *     tags:
 *       - APPROVALS ENDPOINTS
 *     parameters:
 *       - in: query
 *         name: p
 *         schema:
 *            type: string
 *            example: username16
 *         required: true
 *         description: UserID
 *       - in: query
 *         name: page
 *         schema:
 *           type: string
 *           example: 1
 *         required: true
 *         description: Page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: string
 *           example: 15
 *         required: true
 *         description: Limit
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           example: All
 *         required: true
 *         description: Status
 *       - in: query
 *         name: process
 *         schema:
 *           type: string
 *           example: Payment Request
 *         required: false
 *         description: Process
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: Instrucción de pagos
 *         required: false
 *         description: Search
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           example: 1
 *         required: false
 *         description: Type
 *       - in: query
 *         name: only_start
 *         schema:
 *           type: string
 *           example: true
 *         required: false
 *         description: Only Start
 *       - in: query
 *         name: solicitante_fecha
 *         schema:
 *           type: string
 *           example: 02/01/2025
 *         required: false
 *         description: Solicitante Fecha
 *       - in: query
 *         name: cierre_fecha
 *         schema:
 *           type: string
 *           example: 02/01/2025
 *         required: false
 *         description: Cierre Fecha
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 approvalData:
 *                   type: object 
 *                   example: {"approvalData": [{"id": 19291,"solicitante": "Ledys Garcia","proceso": "RRHH Ausencias y Vacaciones","detalle_proceso": "Register absence with medical certificate, 2024-11-13 (Wednesday)-2024-11-13 (Wednesday) equivalent to 1 days. Enfermedad común ","s_fecha": "14/11/2024","verificador": "Nelly","aprobador": "N/A","firmante": "N/A","ejecutor": "Franklin Paz","asignado": null,"estado": "Execute","ApprovalID": "2b1e199c-9928-4264-805a-11c4ecbb9048","pago": null,"mmonto": null,"moneda": null,"cierre_fecha": null,"estado1": null,"ctipo_flujo": 0,"pending": true,"solicitante_imagen": "lgarcia","verificador_imagen": "nelly","aprobador_imagen": null,"firmante_imagen": null,"ejecutor_imagen": "fpaz","operador_imagen": null,"asignado_imagen": null}]}
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
    router.get("/all-approvals", requireAuth, async (req, res) => {
        await ApprovalController.readAllApprovals(sqlConfig, req, res)
    });
    router.get("/approvals-total",requireAuth, async (req, res) => {
        await ApprovalController.readAprovals(sqlConfig, req, res)
    });
/**
 * @openapi
 * /approvals-detalle:
 *   get:
 *     summary: GET
 *     description: Read approvals details by ID
 *     tags:
 *       - APPROVALS ENDPOINTS
 *     parameters:
 *       - in: query
 *         name: p
 *         schema:
 *            type: string
 *            example: username16
 *         required: true
 *         description: Username from the user
 *       - in: query
 *         name: RowID
 *         schema:
 *           type: string
 *           example: 18882
 *         required: true
 *         description: ID del log
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 approvalData:
 *                   type: string 
 *                   example: "<!DOCTYPE html> por ahora es un html, pronto se cambiara a un json"
 *       400:
 *         description: FAILED
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                    type: string 
 *                    example: "Log no encontrado."
 */
    router.get("/approvals-detalle",requireAuth, async (req, res) => {
        await ApprovalController.readAprovalsById(sqlConfig, req, res)
    });
/**
 * @openapi
 * /approvals_detalle_accion:
 *   get:
 *     summary: GET
 *     description: Read all the approvals
 *     tags:
 *       - APPROVALS ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accion_final:
 *                 type: string
 *                 example: Executed
 *               comentario:
 *                 type: string
 *                 example: comentario
 *               nombre:
 *                 type: string
 *                 example: Alfonso Guevara
 *               RowID:
 *                 type: string
 *                 example: 18882
 *               departamento:
 *                 type: string
 *                 example: 1;2;3;4;5;6;22;
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
    router.post("/approvals_detalle_accion", async (req, res) => {
        await ApprovalFunctionsController.approvalDetalleAccion(sqlConfig, req, res)
    });
/**
 * @openapi
 * /approval-json-txt:
 *   post:
 *     summary: Fetches approval details from a .txt file
 *     description: Retrieves and processes a .txt file containing approval details based on the provided parameters and returns the modified approval links.
 *     tags:
 *       - APPROVALS ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 example: "12345"
 *               departamento:
 *                 type: string
 *                 example: "Accounting"
 *               estado:
 *                 type: string
 *                 example: "Verify"
 *     responses:
 *       200:
 *         description: Successfully processed the .txt file and returned modified links
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 detalle:
 *                   type: object
 *                   properties:
 *                     RowID:
 *                       type: string
 *                       example: "12345"
 *                     links:
 *                       type: array
 *                       items:
 *                         type: string
 *                         example: "sir://accounting|file1|path1"
 *       400:
 *         description: Failed to process the request due to invalid input or server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error processing file"
 *       500:
 *         description: Server error while reading or parsing the .txt file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
    router.post('/approval-json-txt', async (req, res) => {
        await ApprovalFunctionsModel.getJsonTxt(req, res)
    })
    router.post('/approval-average', async(req, res) => {
        await ApprovalFunctionsModel.getApprovalAverague(req, res)
    })
    router.get('/approval-summary', async(req, res) => {
        await ApprovalFunctionsModel.getSummary(req, res)
    })
    // ------------------ Funciones API Approvals ------------------
    router.post('/approvals-paid', async (req, res) => {
        await ApprovalFunctionsModel.postApprovalPaid(req, res)
    })
    router.post("/approval-lista-archivos", async (req, res) => {
        await ApprovalFunctionsController.postApprovalArchiveslIST(sqlConfig, req, res)
    })
    router.get("/approval-file", requireAuth, async (req, res) => {
        await ApprovalFunctionsController.serveApprovalFile(sqlConfig, req, res)
    })
    router.get("/approval-msg-content", requireAuth, async (req, res) => {
        await ApprovalFunctionsController.getApprovalMsgContent(sqlConfig, req, res)
    })
    router.get("/approval-msg-attachment", requireAuth, async (req, res) => {
        await ApprovalFunctionsController.getApprovalMsgAttachment(sqlConfig, req, res)
    })

    // ── Digital Signature endpoints ──────────────────────────────
    router.get("/pdf-sign/info", requireAuth, async (req, res) => {
        await DigitalSignaturesController.getPdfInfo(sqlConfig, req, res);
    })
    router.post("/pdf-sign/sign", requireAuth, async (req, res) => {
        await DigitalSignaturesController.signDocument(sqlConfig, req, res);
    })
    router.post("/pdf-sign/verify", requireAuth, async (req, res) => {
        await DigitalSignaturesController.verifyDocument(sqlConfig, req, res);
    })
    router.get("/pdf-sign/audit", requireAuth, async (req, res) => {
        await DigitalSignaturesController.getAuditTrail(sqlConfig, req, res);
    })
    router.get("/pdf-sign/versions", requireAuth, async (req, res) => {
        await DigitalSignaturesController.getDocumentVersions(sqlConfig, req, res);
    })
    router.get("/pdf-sign/certificate", requireAuth, async (req, res) => {
        await DigitalSignaturesController.getSignatureCertificate(sqlConfig, req, res);
    })
    router.post("/pdf-sign/save-signature", requireAuth, async (req, res) => {
        await DigitalSignaturesController.saveUserSignature(sqlConfig, req, res);
    })
    router.get("/pdf-sign/user-signatures", requireAuth, async (req, res) => {
        await DigitalSignaturesController.getUserSignatures(sqlConfig, req, res);
    })
    router.post("/pdf-sign/delete-signature", requireAuth, async (req, res) => {
        await DigitalSignaturesController.deleteUserSignature(sqlConfig, req, res);
    })
    router.post("/pdf-sign/annotations/save", requireAuth, async (req, res) => {
        await DigitalSignaturesController.saveAnnotations(sqlConfig, req, res);
    })
    router.post("/pdf-sign/text/apply", requireAuth, async (req, res) => {
        await DigitalSignaturesController.applyTextWrites(sqlConfig, req, res);
    })
    router.get("/pdf-sign/signed-file", requireAuth, async (req, res) => {
        await DigitalSignaturesController.serveSignedFile(sqlConfig, req, res);
    })

    // ── Document translation endpoints ───────────────────────────
    router.get("/approval-translate/languages", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.getLanguages(sqlConfig, req, res);
    })
    router.post("/approval-translate/create", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.createTranslation(sqlConfig, req, res);
    })
    router.get("/approval-translate/list", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.listTranslations(sqlConfig, req, res);
    })
    router.get("/approval-translate/status", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.getStatus(sqlConfig, req, res);
    })
    router.get("/approval-translate/preview", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.getPreviewText(sqlConfig, req, res);
    })
    router.post("/approval-translate/generate", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.generateDocument(sqlConfig, req, res);
    })
    router.get("/approval-translate/file", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.serveTranslationFile(sqlConfig, req, res);
    })
    router.post("/approval-translate/delete", requireAuth, async (req, res) => {
        await ApprovalTranslationsController.deleteTranslation(sqlConfig, req, res);
    })

/**
 * @openapi
 * /CopiarArchivosAuditoria:
 *   post:
 *     summary: Copies audit files based on department-specific configurations
 *     description: This endpoint handles the copying of audit files from one directory to another based on the department-specific path configurations. It manages multiple departments and processes and handles errors that occur during the file copying.
 *     tags:
 *       - APPROVALS ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 example: "12345"
 *     responses:
 *       200:
 *         description: Successfully copied files and handled the process
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: array
 *                   items:
 *                     type: string
 *                     example: "Error copying file: <error message>"
 *                 ruta_final:
 *                   type: string
 *                   example: "//srv-dc-lombard.lombard.local/Claims/Auditoria Compliance/12345/"
 *       400:
 *         description: Bad request or missing required parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid request"
 *       500:
 *         description: Server error while copying files or handling request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Server error during file copying process"
 */
    router.post("/CopiarArchivosAuditoria", async (req, res) => {
        await ApprovalFunctionsModel.postCopyAuditArchives(req, res)
    })
    router.post("/get_files_by_avisos", async (req, res) => {
        await ApprovalFunctionsModel.postFilesByAvisos(req, res)
    })
    router.post("/add_files", async (req, res) => {
        await ApprovalFunctionsModel.postAddFiles(req, res)
    })
    router.post("/get_flows", async (req, res) => {
        await ApprovalFunctionsModel.postGetFlows(req, res)
    })
    router.post("/get_procesos", async (req, res) => {
        await ApprovalFunctionsModel.postGetProcesos(req, res)
    })
/**
 * @openapi
 * /get_departamento:
 *   post:
 *     summary: POST
 *     description: get approvals departments
 *     tags:
 *       - APPROVALS FUNCTIONS ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               departamento:
 *                 type: string
 *                 example: 1;2;3;4;5;6;22;
 *               compania:
 *                 type: string
 *                 example: 1
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:  {"result": 1,"departamento": {"nombre": "Accounting","ruta": "\\\\srv-dc-lombard.lombard.local\\Contabilidad","manager": "iquintero","suplente": "N/A","id": 1,"ccompania": 1}}
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
    router.post("/get_departamento", async (req, res) => {
        await ApprovalFunctionsModel.postGetDepartamento(req, res)
    })
/**
 * @openapi
 * /get_companias:
 *   post:
 *     summary: POST
 *     description: get companies
 *     tags:
 *       - APPROVALS FUNCTIONS ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ccompania:
 *                 type: string
 *                 example: 1;7;10
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:  {"result": 1,"companias": [{"ccompania": 1,"xnombre": "Active Re","xlogo": "ACRE_LOGO-02.svg","xdominios": "acreinsurance.com"},{"ccompania": 7,"xnombre": "Pine Holding","xlogo": "NoLogo.svg","xdominios": null},{"ccompania": 10,"xnombre": "Siros","xlogo": "NoLogo.svg","xdominios": null}]}
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
    router.post("/get_companias", async (req, res) => {
        await ApprovalFunctionsModel.postGetCompanias(req, res)
    })
/**
 * @openapi
 * /get_actores:
 *   post:
 *     summary: POST
 *     description: get approvals integrants
 *     tags:
 *       - APPROVALS FUNCTIONS ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id_flow:
 *                 type: string
 *                 example: 37
 *               id_dep:
 *                 type: number
 *                 example: 9
 *               id:
 *                 type: string
 *                 example: cvergara
 *               banco:
 *                 type: string
 *                 example: Banco Cibanco
 *               moneda:
 *                 type: string
 *                 example: MXN
 *               ccompania:
 *                 type: string
 *                 example: 1
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   example: {"result": 1,"procesos": ["N/A","Dafne Gutiérrez","Dafne Gutiérrez","N/A","N/A","N/A","Dafne Gutiérrez","N/A","N/A","N/A","N/A"],"estados": ["N/A",true,true,"N/A","N/A","N/A",true,"N/A","N/A","N/A","N/A"],"ctipo": 0}
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
    router.post("/get_actores", async (req, res) => {
        await ApprovalFunctionsController.postGetActores(sqlConfig, req, res)
    })
    router.post("/get_approval_asignado", async (req, res) => {
        await ApprovalFunctionsModel.postGetApprovalAsignado(req, res)
    })
    router.post("/update_approval_asignado", async (req, res) => {
        await ApprovalFunctionsModel.postGetApprovalAsignado(req, res)
    })
    router.post("/get_usuarios_by_manager", async (req, res) => {
        await USERController.getUsuariosBymanager(sqlConfig, req, res)
    })
    router.post("/get_bancos", async(req, res) => {
        await ApprovalFunctionsModel.getBancos(req, res)
    })
    router.post("/get_monedas", async (req, res) => {
        await ApprovalFunctionsModel.getMonedas(req, res)
    })
    router.post("/approval_asignar_usuario", async (req, res) => {
        await  ApprovalFunctionsController.asignarUsuario(sqlConfig, req, res)
    })
    router.post("/get_log", async(req, res) => {
        await ApprovalFunctionsModel.getLog(req, res)
    })
    router.get("/get_approvals", async(req, res) => {
        await ApprovalFunctionsModel.getApprovals(req, res)
    })
    router.post("/agregar_approval_asignado", async (req, res) => {
        await ApprovalFunctionsModel.agregarApprovalAsignado(req,res)
    })
    router.post("/copy_files_approvals", async (req, res) => {
        await ApprovalFunctionsController.copyFilesApprovals(sqlConfig,req, res)
    })
    router.post('/approvals_management_resume', async (req, res) => {
        await ApprovalFunctionsModel.approvalsManagementResume(req,res)
    })
    router.post("/error_view/", async (req, res) => {
        await DashboardController.createErrorLog(sqlConfig, req, res)
    })
    router.post("/error_crm", async (req, res) => {
        await DashboardController.createErrorCRM(sqlConfig, req, res)
    })
    router.post("/cancel_approval", async (req, res) => {
        await ApprovalController.cancelApproval(sqlConfig, req, res)
    })
    router.post("/add_beneficiary", async (req, res) => {
        await ApprovalController.addBeneficiary(sqlConfig, req, res)
    })
    router.get("/beneficiary-detail-json", async (req, res) => {
        await ApprovalController.getBeneficiaryDetailJson(sqlConfig, req, res)
    })
    router.get("/beneficiary-list",requireAuth, async (req, res) => {
        await ApprovalController.renderBeneficiaryList(sqlConfig, req, res)
    })
    router.post("/list_beneficiaries", async (req, res) => {
        await ApprovalController.listBeneficiaries(sqlConfig, req, res)
    })
    router.post("/preview-beneficiary-pdf", async (req, res) => {
        await ApprovalController.previewBeneficiaryPdf(sqlConfig, req, res)
    })
    router.post("/preview-luxemburgo-pdf", async (req, res) => {
        await ApprovalController.previewLuxemburgoPdf(sqlConfig, req, res)
    })
    router.post("/get_manager_deparments", async (req, res) => {
        await ApprovalController.Managerdeparments(sqlConfig, req, res)
    }) 

    // Rutas para manejar relaciones Approval-CRM
    router.get('/approval_get_crm_relations', async (req, res) => {
        try {
            const { approval_id } = req.query;
            const ApprovalModel = (await import('../model/approvals.js')).default;
            const result = await ApprovalModel.getCrmApprovalRelations(sqlConfig, approval_id);
            res.send(result);
        } catch (err) {
            console.error(err);
            res.send({ result: 0, err: err.message });
        }
    });

    router.post('/add_crm_approval_reference', async (req, res) => {
        try {
            const ApprovalModel = (await import('../model/approvals.js')).default;
            const result = await ApprovalModel.addCrmApprovalRelations(sqlConfig, req, res);
            res.send(result);
        } catch (err) {
            console.error(err);
            res.send({ result: 0, err: err.message });
        }
    });

    router.post('/remove_crm_approval_reference', async (req, res) => {
        try {
            const ApprovalModel = (await import('../model/approvals.js')).default;
            const result = await ApprovalModel.removeCrmApprovalRelation(sqlConfig, req, res);
            res.send(result);
        } catch (err) {
            console.error(err);
            res.send({ result: 0, err: err.message });
        }
    });

    // Rutas para manejar relaciones Approval-Approval
    router.get('/approval_get_approval_relations', async (req, res) => {
        try {
            const ApprovalModel = (await import('../model/approvals.js')).default;
            const result = await ApprovalModel.getApprovalApprovalRelations(sqlConfig, req, res);
            res.send(result);
        } catch (err) {
            console.error(err);
            res.send({ result: 0, err: err.message });
        }
    });

    router.post('/add_approval_approval_reference', async (req, res) => {
        try {
            const ApprovalModel = (await import('../model/approvals.js')).default;
            const result = await ApprovalModel.addApprovalApprovalRelations(sqlConfig, req, res);
            res.send(result);
        } catch (err) {
            console.error(err);
            res.send({ result: 0, err: err.message });
        }
    });

    router.post('/remove_approval_approval_reference', async (req, res) => {
        try {
            const ApprovalModel = (await import('../model/approvals.js')).default;
            const result = await ApprovalModel.removeApprovalApprovalRelation(sqlConfig, req, res);
            res.send(result);
        } catch (err) {
            console.error(err);
            res.send({ result: 0, err: err.message });
        }
    });

    router.post('/create-crm-from-change-request', async (req, res) => {
        const ApprovalController = (await import('../controllers/approvals.js')).default;
        await ApprovalController.createCrmFromChangeRequest(sqlConfig, req, res);
    });
    router.post('/post-user-request', async (req, res) => {
        await ApprovalController.getRequestApproval(sqlConfig, req, res)
    });

    // Cost Code & Approval Items routes
    router.get('/get_cost_codes', async (req, res) => {
        await ApprovalController.getCostCodes(sqlConfig, req, res);
    });
    router.post('/create_cost_code', async (req, res) => {
        await ApprovalController.createCostCode(sqlConfig, req, res);
    });
    router.get('/get_approval_items', async (req, res) => {
        await ApprovalController.getApprovalItems(sqlConfig, req, res);
    });

    // Cost Code Manager (devteam only)
    router.get('/cost-code-list', requireAuth, async (req, res) => {
        await ApprovalController.renderCostCodeList(sqlConfig, req, res);
    });
    router.post('/list_cost_codes', async (req, res) => {
        await ApprovalController.listCostCodes(sqlConfig, req, res);
    });
    router.get('/cost_code_detail', async (req, res) => {
        await ApprovalController.getCostCodeDetail(sqlConfig, req, res);
    });
    router.post('/save_cost_code', async (req, res) => {
        await ApprovalController.saveCostCode(sqlConfig, req, res);
    });

export default router;
