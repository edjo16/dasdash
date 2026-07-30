import express from 'express';
import BadacoController from '../controllers/BadacoController.js';
import { sqlConfig } from '../../dbConfig.js';
import { requireAuth } from '../../Middleware/requireAuth.js';
import requirePermission from '../../Middleware/requirePermission.js';
import DevTeamRules from '../../USERS/rule/DevTeam.js';

const router = express.Router();
const legacyBadacoManageFallback = (req) => DevTeamRules.validateMarketingModule(req?.session?.iddevteam, req?.session?.userID);
const badacoManageGuards = [
    requireAuth,
    requirePermission('marketing.badaco', 'manage', {
        legacyFallback: legacyBadacoManageFallback
    })
];
/**
 * @openapi
 * /badaco-contacts:
 *   get:
 *     summary: GET Contacts List View
 *     description: Read all the approvals
 *     tags:
 *       - BADACO API
 *     parameters:
 *       - in: query
 *         name: p
 *         schema:
 *           type: string
 *         description: UserID del usuario logueado
 *     responses:
 *       200:
 *         description: Vista de lista de contactos renderizada
 *       401:
 *         description: Usuario no autorizado
 *       500:
 *         description: Error del servidor
 */
router.get('/badaco-contacts', ...badacoManageGuards, async (req, res) => {
    await BadacoController.getContactsList(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco-contacts/create:
 *   get:
 *     summary: GET Contact Create Form
 *     description: Renderiza el formulario para crear un nuevo contacto
 *     tags:
 *       - BADACO API
 *     parameters:
 *       - in: query
 *         name: p
 *         schema:
 *           type: string
 *         description: UserID del usuario logueado
 *     responses:
 *       200:
 *         description: Formulario de creación renderizado
 */
router.get('/badaco-contacts/create', ...badacoManageGuards, async (req, res) => {
    await BadacoController.getContactForm(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco-contacts/edit/{id}:
 *   get:
 *     summary: GET Contact Edit Form
 *     description: Renderiza el formulario para editar un contacto
 *     tags:
 *       - BADACO API
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del contacto
 *       - in: query
 *         name: p
 *         schema:
 *           type: string
 *         description: UserID del usuario logueado
 *     responses:
 *       200:
 *         description: Formulario de edición renderizado
 *       404:
 *         description: Contacto no encontrado
 */
router.get('/badaco-contacts/edit/:id', ...badacoManageGuards, async (req, res) => {
    await BadacoController.getContactEdit(sqlConfig, req, res);
});

// ==================== API ENDPOINTS (DATA) ====================

/**
 * @openapi
 * /badaco/api/contacts:
 *   get:
 *     summary: GET Contacts Data
 *     description: Obtiene los datos de contactos para DataTable
 *     tags:
 *       - BADACO API
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: bmc_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: bmjl_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Datos de contactos
 */
router.get('/badaco/api/contacts', ...badacoManageGuards, async (req, res) => {
    await BadacoController.getContactsData(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco/api/check-email:
 *   get:
 *     summary: Check Email Availability
 *     description: Verifica si un email ya existe en la base de datos
 *     tags:
 *       - BADACO API
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: excludeContactId
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Estado de disponibilidad del email
 */
router.get('/badaco/api/check-email', ...badacoManageGuards, async (req, res) => {
    await BadacoController.checkEmailAPI(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco/api/companies:
 *   get:
 *     summary: GET Companies
 *     description: Obtiene la lista de compañías
 *     tags:
 *       - BADACO API
 *     responses:
 *       200:
 *         description: Lista de compañías
 */
router.get('/badaco/api/companies', ...badacoManageGuards, async (req, res) => {
    await BadacoController.getCompaniesAPI(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco/api/joblevels:
 *   get:
 *     summary: GET Job Levels
 *     description: Obtiene la lista de niveles de trabajo
 *     tags:
 *       - BADACO API
 *     responses:
 *       200:
 *         description: Lista de job levels
 */
router.get('/badaco/api/joblevels', ...badacoManageGuards, async (req, res) => {
    await BadacoController.getJobLevelsAPI(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco/api/relationships:
 *   get:
 *     summary: GET Relationships
 *     description: Obtiene la lista de tipos de relación
 *     tags:
 *       - BADACO API
 *     responses:
 *       200:
 *         description: Lista de relationships
 */
router.get('/badaco/api/relationships', ...badacoManageGuards, async (req, res) => {
    await BadacoController.getRelationshipsAPI(sqlConfig, req, res);
});

// ==================== API ENDPOINTS (CRUD) ====================

/**
 * @openapi
 * /badaco-contacts/create:
 *   post:
 *     summary: POST Create Contact
 *     description: Crea un nuevo contacto
 *     tags:
 *       - BADACO API
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Contacto creado exitosamente
 */
router.post('/badaco-contacts/create', ...badacoManageGuards, async (req, res) => {
    await BadacoController.createContact(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco-contacts/update/{id}:
 *   post:
 *     summary: POST Update Contact
 *     description: Actualiza un contacto existente
 *     tags:
 *       - BADACO API
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Contacto actualizado exitosamente
 */
router.post('/badaco-contacts/update/:id', ...badacoManageGuards, async (req, res) => {
    await BadacoController.updateContact(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco-contacts/delete/{id}:
 *   delete:
 *     summary: DELETE Contact
 *     description: Elimina un contacto
 *     tags:
 *       - BADACO API
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Contacto eliminado exitosamente
 */
router.delete('/badaco-contacts/delete/:id', ...badacoManageGuards, async (req, res) => {
    await BadacoController.deleteContact(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco/companies/create:
 *   post:
 *     summary: POST Create Company
 *     description: Crea una nueva compañía
 *     tags:
 *       - BADACO API
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Compañía creada exitosamente
 */
router.post('/badaco/companies/create', ...badacoManageGuards, async (req, res) => {
    await BadacoController.createCompany(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco/companies/{id}:
 *   get:
 *     summary: GET Company by ID
 *     description: Obtiene los datos de una compañía específica
 *     tags:
 *       - BADACO API
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la compañía
 *     responses:
 *       200:
 *         description: Datos de la compañía
 *       404:
 *         description: Compañía no encontrada
 */
router.get('/badaco/companies/:id', ...badacoManageGuards, async (req, res) => {
    await BadacoController.getCompanyById(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco/companies/update/{id}:
 *   post:
 *     summary: POST Update Company
 *     description: Actualiza una compañía existente
 *     tags:
 *       - BADACO API
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Compañía actualizada exitosamente
 */
router.post('/badaco/companies/update/:id', ...badacoManageGuards, async (req, res) => {
    await BadacoController.updateCompany(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco/joblevels/create:
 *   post:
 *     summary: POST Create Job Level
 *     description: Crea un nuevo nivel de trabajo
 *     tags:
 *       - BADACO API
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Job level creado exitosamente
 */
router.post('/badaco/joblevels/create', ...badacoManageGuards, async (req, res) => {
    await BadacoController.createJobLevel(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco/relationships/create:
 *   post:
 *     summary: POST Create Relationship
 *     description: Crea un nuevo tipo de relación
 *     tags:
 *       - BADACO API
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Relationship creado exitosamente
 */
router.post('/badaco/relationships/create', ...badacoManageGuards, async (req, res) => {
    await BadacoController.createRelationship(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco/download-excel:
 *   post:
 *     summary: POST Download Contacts to Excel
 *     description: Descarga los contactos filtrados en formato Excel
 *     tags:
 *       - BADACO API
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: object
 *                 properties:
 *                   search:
 *                     type: string
 *                   bmc_id:
 *                     type: integer
 *                   bmjl_id:
 *                     type: integer
 *                   country:
 *                     type: string
 *     responses:
 *       200:
 *         description: Archivo Excel generado exitosamente
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
router.post('/badaco/download-excel', ...badacoManageGuards, async (req, res) => {
    await BadacoController.downloadExcel(sqlConfig, req, res);
});
/**
 * @openapi
 * /badaco/api/external/reference-data:
 *   get:
 *     summary: GET Reference Data
 *     description: |
 *       Returns all reference lists needed to create companies and contacts from an external app.
 *       Call this first to get the IDs (bmc_id, bmjl_id, bmrl_id) you will need when creating records.
 *     tags:
 *       - BADACO External API
 *     responses:
 *       200:
 *         description: Reference data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     companies:
 *                       type: array
 *                       description: Use bmc_id when creating a contact
 *                     jobLevels:
 *                       type: array
 *                       description: Use bmjl_id when creating a contact
 *                     relationships:
 *                       type: array
 *                       description: Use bmrl_id when creating a company
 *                 hint:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/badaco/api/external/reference-data', async (req, res) => {
    await BadacoController.getExternalReferenceData(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco/api/external/companies:
 *   post:
 *     summary: Create Company (External)
 *     description: |
 *       Creates a new company from an external application.
 *       After creation the returned `bmc_id` can be used immediately to create contacts.
 *     tags:
 *       - BADACO External API
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *             properties:
 *               nombre:
 *                 type: string
 *                 description: "Company name (required)"
 *                 example: "Acme Corp"
 *               pais:
 *                 type: string
 *                 description: "Country name"
 *                 example: "United States"
 *               bmrl_id:
 *                 type: integer
 *                 description: "Relationship type ID — get it from /badaco/api/external/reference-data"
 *               bmrg_id:
 *                 type: integer
 *                 description: "Region ID — get it from /badaco/api/external/reference-data"
 *               telefono:
 *                 type: string
 *                 description: "Phone number"
 *                 example: "+1-555-0100"
 *               address:
 *                 type: string
 *                 description: "Street address"
 *               email:
 *                 type: string
 *                 description: "Company email"
 *                 example: "info@acme.com"
 *               domain:
 *                 type: string
 *                 description: "Company domain"
 *                 example: "acme.com"
 *               website:
 *                 type: string
 *                 description: "Company website"
 *                 example: "https://acme.com"
 *               created_by:
 *                 type: string
 *                 description: "Identifier of the external system or user creating the record (defaults to API_EXTERNAL)"
 *                 example: "my-crm-app"
 *     responses:
 *       201:
 *         description: Company created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Company created successfully."
 *                 bmc_id:
 *                   type: integer
 *                   description: "The new company's ID — use this as bmc_id when creating contacts"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         description: Server error
 */
router.post('/badaco/api/external/companies', async (req, res) => {
    await BadacoController.createCompanyExternal(sqlConfig, req, res);
});

/**
 * @openapi
 * /badaco/api/external/contacts:
 *   post:
 *     summary: Create Contact (External)
 *     description: |
 *       Creates a new contact from an external application.
 *       **A contact must belong to an existing company** — `bmc_id` is required and must be valid.
 *       You can get all available company IDs from `GET /badaco/api/external/reference-data`.
 *       If the company does not exist yet, create it first with `POST /badaco/api/external/companies`.
 *     tags:
 *       - BADACO External API
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bmc_id
 *               - name
 *             properties:
 *               bmc_id:
 *                 type: integer
 *                 description: "Company ID (required). The contact will be linked to this company."
 *                 example: 5
 *               name:
 *                 type: string
 *                 description: "Contact full name (required)"
 *                 example: "Jane Doe"
 *               email:
 *                 type: string
 *                 description: "Contact email address (must be unique across all contacts)"
 *                 example: "jane.doe@acme.com"
 *               job_title:
 *                 type: string
 *                 description: "Contact's job title"
 *                 example: "Head of Marketing"
 *               bmjl_id:
 *                 type: integer
 *                 description: "Job level ID — get it from /badaco/api/external/reference-data"
 *               country:
 *                 type: string
 *                 description: "Contact's country"
 *                 example: "United States"
 *               address:
 *                 type: string
 *                 description: "Contact's address"
 *               phone_number:
 *                 type: string
 *                 description: "Contact's phone number"
 *                 example: "+1-555-0199"
 *               created_by:
 *                 type: string
 *                 description: "Identifier of the external system or user creating the record (defaults to API_EXTERNAL)"
 *                 example: "my-crm-app"
 *     responses:
 *       201:
 *         description: Contact created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Contact created successfully."
 *                 contact_id:
 *                   type: integer
 *                   description: "The new contact's ID"
 *       400:
 *         description: Validation error (missing fields, invalid company, duplicate email)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["\"bmc_id\" (company ID) is required. A contact must belong to a company."]
 *       500:
 *         description: Server error
 */
router.post('/badaco/api/external/contacts', async (req, res) => {
    await BadacoController.createContactExternal(sqlConfig, req, res);
});

export default router;
