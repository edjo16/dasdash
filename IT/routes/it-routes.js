// temporary change location
import TemporaryChangeLocationController from "../controllers/TemporaryChangeLocation.js";
import EquipmentCheckOutModel from "../model/EquipmentCheckOut.js";
import SoftwareChangeRequestController from "../controllers/ChangesControl.js";
import ExternalEmailsRequestController from "../controllers/ExternalEmailsRequest.js";
import LogErrorsController from "../controllers/LogErrors.js";
import express from "express";
import { sqlConfig } from "../../dbConfig.js";
import { requireAuth } from '../../Middleware/requireAuth.js';
import requirePermission from '../../Middleware/requirePermission.js';
import DevTeamRules from '../../USERS/rule/DevTeam.js';
const router = express.Router();

const legacyITPrivilegedFallback = (req) => DevTeamRules.validateChangeRequestModule(req?.session?.iddevteam, req?.session?.userID);
const changeRequestManageGuards = [
    requireAuth,
    requirePermission('it.change_request', 'manage', {
        legacyFallback: legacyITPrivilegedFallback
    })
];
const errorLogsReadGuards = [
    requireAuth,
    requirePermission('it.error_logs', 'read', {
        legacyFallback: legacyITPrivilegedFallback
    })
];
/**
 * @openapi
 * /forms_ITequipment:
 *   get:
 *     summary: GET
 *     description: Read all the approvals
 *     tags:
 *       - IT FORMS ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               p:
 *                 type: string
 *                 example: lossa
 *               iddevteam:
 *                 type: string
 *                 example: lossa 
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reporte:
 *                   type: object 
 *                   example: {title: "IT - Electronic Equipment Checkout Form",userProfile: {UserName: UserName,UserID: UserID,UsuarioID: UserID,UserManager: manager},userMenu: Menu,okForm: req.query.result,usuarios: grupousuarios,devteam: devteam,dbdevteam: databaseapproval}
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
router.get("/forms_ITequipment", async(req, res) => {
        await EquipmentCheckOutModel.readEquipmentCheckout(sqlConfig, req, res)   
});
/**
 * @openapi
 * /forms_ITequipment:
 *   post:
 *     summary: POST
 *     description: Read all the approvals
 *     tags:
 *       - IT FORMS ENDPOINTS
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
router.post('/forms_ITequipment', async (req, res) => {
        await EquipmentCheckOutModel.createEquipmentCheckout(sqlConfig,req, res)
});
/**
 * @openapi
 * /forms_it_temporary_change_location:
 *   get:
 *     summary: GET
 *     description: The necesarry data to make the form
 *     tags:
 *       - IT FORMS ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               p:
 *                 type: string
 *                 example: lossa
 *               iddevteam:
 *                 type: string
 *                 example: lossa 
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reporte:
 *                   type: object 
 *                   example: {title: "IT - Electronic Equipment Checkout Form",userProfile: {UserName: UserName,UserID: UserID,UsuarioID: UserID,UserManager: manager},userMenu: Menu,okForm: req.query.result,usuarios: grupousuarios,devteam: devteam,dbdevteam: databaseapproval}
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
router.get(`/forms_it_temporary_change_location/`, async (req, res) => {
    await TemporaryChangeLocationController.getInitialTemporaryChangeLocation(sqlConfig, req, res)
});
/**
 * @openapi
 * /forms_it_temporary_change_location:
 *   post:
 *     summary: POST
 *     description: create a new temporary change location form, it sends an email to the IT department to let them know that a temporary change location has been requested.
 *     tags:
 *       - IT FORMS ENDPOINTS
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *            type: integer
 *            example: 45
 *         required: true
 *         description: id of the form to read
 *       - in: query
 *         name: p
 *         schema:
 *            type: string
 *            example: lossa
 *         required: true
 *         description: UserID
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
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
router.get(`/forms_it_temporary_change_locations/`, async (req, res) => {
    await TemporaryChangeLocationController.readForms(sqlConfig, req, res)
});
router.get(`/forms_it_temporary_change_locations_map/`, async (req, res) => {
    await TemporaryChangeLocationController.readFormsMap(sqlConfig, req, res)
});
router.get("/it/map-tile/:z/:x/:y.png", requireAuth, async (req, res) => {
    await TemporaryChangeLocationController.proxyMapTile(req, res)
});
/**
 * @openapi
 * /temporary_change_locations:
 *   get:
 *     summary: GET
 *     description: create a new perfromance review form and create an approval with it, returns the ID of the created approval.
 *     tags:
 *       - IT FORMS ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *              requestorName:
 *                type: string
 *              requestorPosition:
 *                type: string
 *              reasonForRequisition:
 *                type: string
 *              effectiveDate:
 *                type: string
 *                format: date
 *                nullable: true
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:  {"result": 1}
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
router.get(`/temporary_change_locations/`, async (req, res) => {
    await TemporaryChangeLocationController.renderFormList(sqlConfig, req, res)
});
/**
 * @openapi
 * /forms_it_temporary_change_location:
 *   post:
 *     summary: POST
 *     description: create a new temporary change location form, it sends an email to the IT department to let them know that a temporary change location has been requested.
 *     tags:
 *       - IT FORMS ENDPOINTS
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *            type: integer
 *            example: 45
 *         required: true
 *         description: id of the form to read
 *       - in: query
 *         name: p
 *         schema:
 *            type: string
 *            example: lossa
 *         required: true
 *         description: UserID
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example: {title: 'Performance Review Details',formData: {id: 45,date_created: 2025-01-08T14:53:48.827Z,user_created: 'fpaz',country: 'ARGENTINA',start_date: '2025-01-10',end_date: '2025-01-18',comments: 'me voy a la cas de messi',collaborator_name: 'Franklin Paz',manager: 'wchaguaceda,Wendy Chaguaceda',area_supervisor: 'wchaguaceda',status: 'ongoing',collaborator_title: 'Human Resources Coordinator',manager_title: 'Human Resources Manager',suplente: 'fpaz',department: 'RRHH'},userProfile: { UserName: 'Luis Ossa', UsuarioID: 'lossa' },userMenu: {M_Admin: 'View',M_Conta: 'View',M_CRM: 'View',F_Conta: 'View',F_Admin: 'View',xcargo: 'IT & Security Manager',F_Finanzas: 'View',F_Governance: 'View',F_HR: 'View',Modules: 'All,Operations,Marketing',compania: '1;2;6;7;8;9;10',ccompania: [ 1, '1' ],logo: 'ACRE_LOGO-02.svg',Name: 'Luis Ossa',dep: '9;21;17;'},  usuarios: [ ],devUser: null,  devteam: true,read: 'true'}
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
router.post(`/forms_it_temporary_change_location/`, async (req, res) => {
    await TemporaryChangeLocationController.createTemporaryChangeLocation(sqlConfig, req, res)
});
/**
 * @openapi
 * /temporary_change_locations/{id}:
 *   get:
 *     summary: GET
 *     description: read the data necessary to render the form (Need update when the indepent frontend is ready)
 *     tags:
 *       - IT FORMS ENDPOINTS
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *            type: integer
 *            example: 45
 *         required: true
 *         description: id of the form to read
 *       - in: query
 *         name: p
 *         schema:
 *            type: string
 *            example: lossa
 *         required: true
 *         description: UserID
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example: {title: 'Performance Review Details',formData: {id: 45,date_created: 2025-01-08T14:53:48.827Z,user_created: 'fpaz',country: 'ARGENTINA',start_date: '2025-01-10',end_date: '2025-01-18',comments: 'me voy a la cas de messi',collaborator_name: 'Franklin Paz',manager: 'wchaguaceda,Wendy Chaguaceda',area_supervisor: 'wchaguaceda',status: 'ongoing',collaborator_title: 'Human Resources Coordinator',manager_title: 'Human Resources Manager',suplente: 'fpaz',department: 'RRHH'},userProfile: { UserName: 'Luis Ossa', UsuarioID: 'lossa' },userMenu: {M_Admin: 'View',M_Conta: 'View',M_CRM: 'View',F_Conta: 'View',F_Admin: 'View',xcargo: 'IT & Security Manager',F_Finanzas: 'View',F_Governance: 'View',F_HR: 'View',Modules: 'All,Operations,Marketing',compania: '1;2;6;7;8;9;10',ccompania: [ 1, '1' ],logo: 'ACRE_LOGO-02.svg',Name: 'Luis Ossa',dep: '9;21;17;'},  usuarios: [ ],devUser: null,  devteam: true,read: 'true'}
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
router.get("/temporary_change_locations/:id", async (req, res) => {
    await TemporaryChangeLocationController.readFormById(sqlConfig, req, res)
});
router.get('/temporary_change_locations_json/:id', async (req, res) => {
    await TemporaryChangeLocationController.readFormByIdJson(sqlConfig, req, res)
});
// IT SOFTWARE CHANGE REQUEST
router.get("/forms_it_software_change_request_view", ...changeRequestManageGuards, async (req, res) => {
    await SoftwareChangeRequestController.getInitialView(sqlConfig, req, res)
});
router.get("/forms_it_software_change_request", ...changeRequestManageGuards, async (req, res) => {
        await SoftwareChangeRequestController.getEventsFormList(sqlConfig, req, res)
})
router.get("/get_forms_it_software_change_request_view", requireAuth, async (req, res) => {
    await SoftwareChangeRequestController.getEventsForm(sqlConfig, req, res)
})
router.post("/forms_it_software_change_request", requireAuth, async (req, res) => {
    await SoftwareChangeRequestController.postEventsForm(sqlConfig, req, res)
})
router.get("/get_forms_it_software_change_request/:id", requireAuth, async (req, res) => {
    await SoftwareChangeRequestController.readFormById(sqlConfig, req, res)
})
router.get("/get_forms_it_software_change_request_json/:id", requireAuth, async (req, res) => {
    await SoftwareChangeRequestController.readFormByIdJson(sqlConfig, req, res)
})
router.get("/forms_it_software_change_request/download", ...changeRequestManageGuards, async (req, res) => {
    await SoftwareChangeRequestController.downloadExcel(sqlConfig, req, res)
})

// IT EXTERNAL EMAILS REQUEST
/**
 * @openapi
 * /forms_it_external_emails_request:
 *   get:
 *     summary: GET External Emails Request form
 *     description: Render the External Emails Request (external email unblocking) form
 *     tags:
 *       - IT FORMS ENDPOINTS
 *     responses:
 *       200:
 *         description: OK
 */
router.get("/forms_it_external_emails_request", requireAuth, async (req, res) => {
    await ExternalEmailsRequestController.getInitialView(sqlConfig, req, res)
});
/**
 * @openapi
 * /forms_it_external_emails_request/actors:
 *   get:
 *     summary: GET External Emails Request actors
 *     description: Resolve the approval flow actors for the current user's request
 *     tags:
 *       - IT FORMS ENDPOINTS
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example: {"result": 1, "flow": {}, "actors": {}, "estado": "Verify"}
 */
router.get("/forms_it_external_emails_request/actors", requireAuth, async (req, res) => {
    await ExternalEmailsRequestController.getActors(sqlConfig, req, res)
});
/**
 * @openapi
 * /forms_it_external_emails_request:
 *   post:
 *     summary: POST External Emails Request
 *     description: Create a new external email unblocking request and its approval
 *     tags:
 *       - IT FORMS ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               contact_name:
 *                 type: string
 *               email:
 *                 type: string
 *               reason:
 *                 type: string
 *                 enum: [provider, temporal]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example: {"result": 1, "formId": 1, "RowID": 1}
 */
router.post("/forms_it_external_emails_request", requireAuth, async (req, res) => {
    await ExternalEmailsRequestController.createExternalEmailsRequest(sqlConfig, req, res)
});
/**
 * @openapi
 * /forms_it_external_emails_request/{id}/data:
 *   get:
 *     summary: GET External Emails Request data
 *     description: Return a single External Emails Request record as JSON (used by the approval detail modal)
 *     tags:
 *       - IT FORMS ENDPOINTS
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: OK
 */
router.get("/forms_it_external_emails_request/:id/data", requireAuth, async (req, res) => {
    await ExternalEmailsRequestController.getFormByIdJson(sqlConfig, req, res)
});

// IT ERROR LOGS
router.get("/forms_it_log_errors", ...errorLogsReadGuards, async (req, res) => {
    await LogErrorsController.getLogErrorsView(sqlConfig, req, res)
});
router.get("/get_log_errors_data", ...errorLogsReadGuards, async (req, res) => {
    await LogErrorsController.getLogErrorsData(sqlConfig, req, res)
});
router.get("/get_log_error_detail", ...errorLogsReadGuards, async (req, res) => {
    await LogErrorsController.getLogErrorDetail(sqlConfig, req, res)
});

export default router;