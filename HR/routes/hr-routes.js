import PerformanceReviewController from "../PerformanceReview/controllers/PerformanceReview.js";
import PersonnelRequisitionController from "../PersonnelRequisition/controllers/PersonnelRequisition.js";
import PersonalTimeOffController from "../PersonalTimeOff/controllers/PersonalTimeOff.js";
import express from "express";
import { sqlConfig } from "../../dbConfig.js";
import { requireAuth } from '../../Middleware/requireAuth.js';

const router = express.Router();
/**
 * @openapi
 * /form_hr_personnel_requisition:
 *   get:
 *     summary: GET
 *     description: read the data necessary to render the form (Need update when the indepent frontend is ready)
 *     tags:
 *       - HR FORMS ENDPOINTS
 *     parameters:
 *       - in: query
 *         name: p
 *         schema:
 *            type: string
 *            example: username16
 *         required: true
 *         description: UserID
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
 *                   example: {}
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
    router.get("/form_hr_personnel_requisition", async (req, res) => {
        await PersonnelRequisitionController.getInitialPersonnelRequisition(sqlConfig, req, res)
    })
/**
 * @openapi
 * /form_hr_personnel_requisition:
 *   post:
 *     summary: POST
 *     description: create a new perfromance review form and create an approval with it, returns the ID of the created approval.
 *     tags:
 *       - HR FORMS ENDPOINTS
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
 *              expectedStartDate:
 *                type: string
 *                format: date
 *              supportOrBussineesNotes:
 *                type: string
 *              reasonNotes:
 *                type: string
 *                nullable: true
 *              replaceWho:
 *                type: string
 *                nullable: true
 *              businessCaseIsAttached:
 *                type: boolean
 *              positionType:
 *                type: string
 *              positionJobTitle:
 *                type: string
 *              area:
 *                type: string
 *              location:
 *                type: string
 *              availableDeskOffice:
 *                type: string
 *              attachedDescription:
 *                type: string
 *              notesObservationsRequirements:
 *                type: string
 *              minCompensationRange:
 *                type: number
 *                format: decimal
 *              avegareCompensationRange:
 *                type: number
 *                format: decimal
 *              maxCompensationRange:
 *                type: number
 *                format: decimal
 *              rangeInfoSource:
 *                type: string
 *              benefits:
 *                type: string
 *              annualBonus:
 *                type: string
 *              benefitsNotes:
 *                type: string
 *              source:
 *                type: string
 *                nullable: true
 *              preIndentifyCandidate:
 *                type: string
 *                nullable: true
 *              headhunter:
 *                type: string
 *                nullable: true
 *              notesSourceRequiriments:
 *                type: string
 *                nullable: true
 *              userCreated:
 *                type: string
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
    router.post("/form_hr_personnel_requisition", async (req, res) => {
        await PersonnelRequisitionController.createPersonalRequisition(sqlConfig, req, res)
    })

/**
 * @openapi
 * /form_hr_personnel_requisition/actors:
 *   get:
 *     summary: GET Personnel Requisition actors
 *     description: Resolve approval flow actors for the current user's Personnel Requisition request
 *     tags:
 *       - HR FORMS ENDPOINTS
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example: {"result": 1, "flow": {}, "actors": {}, "estado": "Verify"}
 */
    router.get("/form_hr_personnel_requisition/actors", requireAuth, async (req, res) => {
        await PersonnelRequisitionController.getActors(sqlConfig, req, res)
    })
/**
 * @openapi
 * /forms_hr_performance_review:
 *   get:
 *     summary: GET
 *     description: read the data necessary to render the form
 *     tags:
 *       - HR FORMS ENDPOINTS
 *     parameters:
 *       - in: query
 *         name: p
 *         schema:
 *            type: string
 *            example: username16
 *         required: true
 *         description: UserID
 *       - in: query
 *         name: iddevteam
 *         schema:
 *            type: string
 *            example: username16
 *         required: true
 *         description: UserID
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
 *                   example: {}
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
    router.get("/forms_hr_performance_review", requireAuth,  async (req, res) => {
        await PerformanceReviewController.getInitialPerformanceReview(sqlConfig, req, res)
    })
/**
 * @openapi
 * /forms_hr_performance_review/:id:
 *   get:
 *     summary: GET
 *     description: read the data necessary to render the form (Need update when the indepent frontend is ready)
 *     tags:
 *       - HR FORMS ENDPOINTS
 *     parameters:
 *       - in: query
 *         name: p
 *         schema:
 *            type: string
 *            example: username16
 *         required: true
 *         description: UserID
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
 *                   example: {title: 'Performance Review Details',userProfile: { UserName: 'Luis Ossa', UsuarioID: 'lossa' }, details: {id: '6',date: 2024-11-16T11:01:35.567Z,collaboratorName: 'Luis Ossa',collabjobTitle: 'IT & Security Manager',leaderName: 'Dafne Gutiérrez',leaderJobTitle: 'Chief Information Officer',averageGoal: 50,developmentGoal: 90,observationsLeader: 'prueba',observationsAssociate: 'prueba 2',generalResult: 'rarely',log_id: 19315},userMenu: {M_Admin: 'View',M_Conta: 'View',M_CRM: 'View',F_Conta: 'View',F_Admin: 'View',xcargo: 'IT & Security Manager',F_Finanzas: 'View',F_Governance: 'View',F_HR: 'View',Modules: 'All,Operations,Marketing',compania: '1;2;6;7;8;9;10',ccompania: [ 1, '1' ],logo: 'ACRE_LOGO-02.svg',Name: 'Luis Ossa',dep: '9;21;17;'},  usuarios: [ ],devUser: null,  devteam: true,read: 'true'}
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
    router.get("/forms_hr_performance_review/:id", async (req, res) => {
        await PerformanceReviewController.readPerformanceReviewById(sqlConfig, req, res)
    })
/**
 * @openapi
 * /form_hr_personnel_requisition:
 *   post:
 *     summary: POST
 *     description: create a new perfromance review form and create an approval with it, returns the ID of the created approval.
 *     tags:
 *       - HR FORMS ENDPOINTS
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
 *              expectedStartDate:
 *                type: string
 *                format: date
 *              supportOrBussineesNotes:
 *                type: string
 *              reasonNotes:
 *                type: string
 *                nullable: true
 *              replaceWho:
 *                type: string
 *                nullable: true
 *              businessCaseIsAttached:
 *                type: boolean
 *              positionType:
 *                type: string
 *              positionJobTitle:
 *                type: string
 *              area:
 *                type: string
 *              location:
 *                type: string
 *              availableDeskOffice:
 *                type: string
 *              attachedDescription:
 *                type: string
 *              notesObservationsRequirements:
 *                type: string
 *              minCompensationRange:
 *                type: number
 *                format: decimal
 *              avegareCompensationRange:
 *                type: number
 *                format: decimal
 *              maxCompensationRange:
 *                type: number
 *                format: decimal
 *              rangeInfoSource:
 *                type: string
 *              benefits:
 *                type: string
 *              annualBonus:
 *                type: string
 *              benefitsNotes:
 *                type: string
 *              source:
 *                type: string
 *                nullable: true
 *              preIndentifyCandidate:
 *                type: string
 *                nullable: true
 *              headhunter:
 *                type: string
 *                nullable: true
 *              notesSourceRequiriments:
 *                type: string
 *                nullable: true
 *              userCreated:
 *                type: string
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
    router.post("/forms_hr_performance_review", async (req, res) => {
        await PerformanceReviewController.createPerformanceReview(sqlConfig, req, res)
    })
/**
 * @openapi
 * /form_hr_personnel_requisition:
 *   put:
 *     summary: PUT
 *     description: create a new perfromance review form and create an approval with it, returns the ID of the created approval.
 *     tags:
 *       - HR FORMS ENDPOINTS
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
 *              expectedStartDate:
 *                type: string
 *                format: date
 *              supportOrBussineesNotes:
 *                type: string
 *              reasonNotes:
 *                type: string
 *                nullable: true
 *              replaceWho:
 *                type: string
 *                nullable: true
 *              businessCaseIsAttached:
 *                type: boolean
 *              positionType:
 *                type: string
 *              positionJobTitle:
 *                type: string
 *              area:
 *                type: string
 *              location:
 *                type: string
 *              availableDeskOffice:
 *                type: string
 *              attachedDescription:
 *                type: string
 *              notesObservationsRequirements:
 *                type: string
 *              minCompensationRange:
 *                type: number
 *                format: decimal
 *              avegareCompensationRange:
 *                type: number
 *                format: decimal
 *              maxCompensationRange:
 *                type: number
 *                format: decimal
 *              rangeInfoSource:
 *                type: string
 *              benefits:
 *                type: string
 *              annualBonus:
 *                type: string
 *              benefitsNotes:
 *                type: string
 *              source:
 *                type: string
 *                nullable: true
 *              preIndentifyCandidate:
 *                type: string
 *                nullable: true
 *              headhunter:
 *                type: string
 *                nullable: true
 *              notesSourceRequiriments:
 *                type: string
 *                nullable: true
 *              userCreated:
 *                type: string
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
    router.put(`/forms_hr_performance_review/:id`, async (req, res) => {
        await PerformanceReviewController.updatePerformanceReview(sqlConfig, req, res)
    })

/**
 * @openapi
 * /form_hr_personal_time_off:
 *   get:
 *     summary: GET Personal Time Off form
 *     description: Render the Personal Time Off request form
 *     tags:
 *       - HR FORMS ENDPOINTS
 *     responses:
 *       200:
 *         description: OK
 */
    router.get("/form_hr_personal_time_off", requireAuth, async (req, res) => {
        await PersonalTimeOffController.getInitialView(sqlConfig, req, res)
    })

/**
 * @openapi
 * /form_hr_personal_time_off:
 *   post:
 *     summary: POST Personal Time Off
 *     description: Create a new Personal Time Off request
 *     tags:
 *       - HR FORMS ENDPOINTS
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               request_type:
 *                 type: string
 *               start_date:
 *                 type: string
 *               end_date:
 *                 type: string
 *               start_permit_hour:
 *                 type: string
 *                 nullable: true
 *               end_permit_hour:
 *                 type: string
 *                 nullable: true
 *               notes:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example: {"result": 1, "formId": 1}
 */
    router.post("/form_hr_personal_time_off", requireAuth, async (req, res) => {
        await PersonalTimeOffController.createPersonalTimeOff(sqlConfig, req, res)
    })

/**
 * @openapi
 * /form_hr_personal_time_off/actors:
 *   get:
 *     summary: GET Personal Time Off actors
 *     description: Resolve approval flow actors for the current user's PTO request
 *     tags:
 *       - HR FORMS ENDPOINTS
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example: {"result": 1, "flow": {}, "actors": {}, "estado": "Verify"}
 */
    router.get("/form_hr_personal_time_off/actors", requireAuth, async (req, res) => {
        await PersonalTimeOffController.getActors(sqlConfig, req, res)
    })

    router.get("/form_hr_personal_time_off/:id/data", requireAuth, async (req, res) => {
        await PersonalTimeOffController.getFormByIdJson(sqlConfig, req, res)
    })

/**
 * @openapi
 * /form_hr_personal_time_off/{id}:
 *   get:
 *     summary: GET Personal Time Off detail
 *     description: View a specific Personal Time Off request
 *     tags:
 *       - HR FORMS ENDPOINTS
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
    router.get("/form_hr_personal_time_off/:id", requireAuth, async (req, res) => {
        await PersonalTimeOffController.readById(sqlConfig, req, res)
    })

export default router;