import express from 'express';
import UsersController from '../controllers/usersController.js';
import { sqlConfig } from '../../dbConfig.js';
import { requireAuth } from '../../Middleware/requireAuth.js';
import requirePermission from '../../Middleware/requirePermission.js';
import DevTeamRules from '../rule/DevTeam.js';

const router = express.Router();

const legacyUsersManageFallback = (req) => DevTeamRules.validateTeam(req?.session?.iddevteam, req?.session?.userID);
const usersManageGuards = [
    requireAuth,
    requirePermission('users', 'manage', {
        legacyFallback: legacyUsersManageFallback
    })
];

/**
 * @openapi
 * /users:
 *   get:
 *     summary: GET Users List View
 *     description: Renderiza la vista de lista de usuarios
 *     tags:
 *       - USERS ENDPOINTS
 *     parameters:
 *       - in: query
 *         name: p
 *         schema:
 *           type: string
 *         description: UserID del usuario logueado
 *         example: lossa
 *     responses:
 *       200:
 *         description: Vista de lista de usuarios renderizada
 *       401:
 *         description: Usuario no autorizado
 *       500:
 *         description: Error del servidor
 */
router.get('/users', ...usersManageGuards, async (req, res) => {
    await UsersController.getUsersList(sqlConfig, req, res);
});

/**
 * @openapi
 * /users/detail/{id}:
 *   get:
 *     summary: GET User Detail View
 *     description: Renderiza la vista de detalle de un usuario específico
 *     tags:
 *       - USERS ENDPOINTS
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario a consultar
 *       - in: query
 *         name: p
 *         schema:
 *           type: string
 *         description: UserID del usuario logueado
 *         example: lossa
 *     responses:
 *       200:
 *         description: Vista de detalle del usuario renderizada
 *       400:
 *         description: ID de usuario no proporcionado
 *       401:
 *         description: Usuario no autorizado
 *       404:
 *         description: Usuario no encontrado
 *       500:
 *         description: Error del servidor
 */
router.get('/users/detail/:id', ...usersManageGuards, async (req, res) => {
    await UsersController.getUserDetail(sqlConfig, req, res);
});

/**
 * @openapi
 * /users/edit/{id}:
 *   get:
 *     summary: GET User Edit View
 *     description: Renderiza la vista de edición de un usuario específico
 *     tags:
 *       - USERS ENDPOINTS
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario a editar
 *       - in: query
 *         name: p
 *         schema:
 *           type: string
 *         description: UserID del usuario logueado
 *         example: lossa
 *     responses:
 *       200:
 *         description: Vista de edición del usuario renderizada
 *       400:
 *         description: ID de usuario no proporcionado
 *       401:
 *         description: Usuario no autorizado
 *       404:
 *         description: Usuario no encontrado
 *       500:
 *         description: Error del servidor
 */
router.get('/users/edit/:id', ...usersManageGuards, async (req, res) => {
    await UsersController.getUserEdit(sqlConfig, req, res);
});

/**
 * /users/create:
 *   get:
 *     summary: GET User Create View
 *     description: Renderiza la vista para crear un nuevo usuario
 */
router.get('/users/create', ...usersManageGuards, async (req, res) => {
    await UsersController.getUserCreate(sqlConfig, req, res);
});

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: GET Users List API
 *     description: Obtiene la lista de usuarios en formato JSON
 *     tags:
 *       - USERS API ENDPOINTS
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Término de búsqueda para filtrar usuarios
 *         example: John
 *     responses:
 *       200:
 *         description: Lista de usuarios obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                   example: 25
 *       500:
 *         description: Error del servidor
 */
router.get('/api/users', ...usersManageGuards, async (req, res) => {
    await UsersController.getUsersAPI(sqlConfig, req, res);
});

/**
 * @openapi
 * /api/users/paginated:
 *   get:
 *     summary: GET Paginated Users List API
 *     description: Obtiene la lista de usuarios con paginación y filtros
 *     tags:
 *       - USERS API ENDPOINTS
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Número de página
 *         example: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *         description: Cantidad de registros por página
 *         example: 15
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Término de búsqueda
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filtro de estado (all, 1, 0)
 *         example: all
 *       - in: query
 *         name: company
 *         schema:
 *           type: string
 *         description: Filtro de compañía
 *     responses:
 *       200:
 *         description: Lista de usuarios paginada obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     pageSize:
 *                       type: integer
 *                     totalItems:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNextPage:
 *                       type: boolean
 *                     hasPrevPage:
 *                       type: boolean
 *                 companies:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         description: Error del servidor
 */
router.get('/api/users/paginated', ...usersManageGuards, async (req, res) => {
    await UsersController.getUsersListPaginated(sqlConfig, req, res);
});

/**
 * /api/users:
 *   post:
 *     summary: Create a new user
 */
router.post('/api/users', ...usersManageGuards, async (req, res) => {
    await UsersController.createUser(sqlConfig, req, res);
});

/**
 * @openapi
 * /api/users/{id}:
 *   get:
 *     summary: GET User Detail API
 *     description: Obtiene el detalle de un usuario en formato JSON
 *     tags:
 *       - USERS API ENDPOINTS
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario a consultar
 *     responses:
 *       200:
 *         description: Detalle del usuario obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: object
 *       400:
 *         description: ID de usuario no proporcionado
 *       404:
 *         description: Usuario no encontrado
 *       500:
 *         description: Error del servidor
 */
/**
 * @openapi
 * /api/users/active:
 *   get:
 *     summary: GET Active Users API
 *     description: Obtiene la lista de usuarios activos en formato JSON
 *     tags:
 *       - USERS API ENDPOINTS
 *     responses:
 *       200:
 *         description: Lista de usuarios activos obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                   example: 20
 *       500:
 *         description: Error del servidor
 */
router.get('/api/users/active', requireAuth, async (req, res) => {
    await UsersController.getActiveUsersAPI(sqlConfig, req, res);
});

router.get('/api/users/:id', ...usersManageGuards, async (req, res) => {
    await UsersController.getUserDetailAPI(sqlConfig, req, res);
});

/**
 * @openapi
 * /api/users/{id}:
 *   put:
 *     summary: Update User
 *     description: Update user information
 *     tags:
 *       - USERS API ENDPOINTS
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               Name:
 *                 type: string
 *               Email:
 *                 type: string
 *               Manager:
 *                 type: string
 *               Location:
 *                 type: string
 *               xcargo:
 *                 type: string
 *               ccompania:
 *                 type: integer
 *               cdepartamento:
 *                 type: integer
 *               departamento:
 *                 type: string
 *               compania:
 *                 type: string
 *               vacaciones:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Error updating user
 */
router.put('/api/users/:id', ...usersManageGuards, async (req, res) => {
    await UsersController.updateUser(sqlConfig, req, res);
});

/**
 * @openapi
 * /api/users/{id}/change-password:
 *   post:
 *     summary: Send Temporary Password
 *     description: Generates a temporary password and sends it by email to the selected user
 *     tags:
 *       - USERS API ENDPOINTS
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user
 *     responses:
 *       200:
 *         description: Temporary password sent successfully
 *       400:
 *         description: Invalid request
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 *       500:
 *         description: Error sending temporary password
 */
router.post('/api/users/:id/change-password', ...usersManageGuards, async (req, res) => {
    await UsersController.changePassword(sqlConfig, req, res);
});

/**
 * @openapi
 * /api/users/{id}/image:
 *   post:
 *     summary: Upload User Image
 *     description: Upload or update profile picture for a user (PNG only)
 *     tags:
 *       - USERS API ENDPOINTS
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               userImage:
 *                 type: string
 *                 format: binary
 *               userID:
 *                 type: string
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *       400:
 *         description: Invalid file format or missing file
 *       500:
 *         description: Error uploading image
 */
router.post('/api/users/:id/image', requireAuth, async (req, res) => {
    await UsersController.uploadUserImage(sqlConfig, req, res);
});

/**
 * @openapi
 * /api/users/{id}/signature:
 *   post:
 *     summary: Upload User Signature
 *     description: Upload or update a user's digital signature (PNG only)
 *     tags:
 *       - USERS API ENDPOINTS
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               userSignature:
 *                 type: string
 *                 format: binary
 *               userID:
 *                 type: string
 *     responses:
 *       200:
 *         description: Signature uploaded successfully
 *       400:
 *         description: Invalid file format or missing file
 *       500:
 *         description: Error uploading signature
 */
router.post('/api/users/:id/signature', requireAuth, async (req, res) => {
    await UsersController.uploadUserSignature(sqlConfig, req, res);
});

router.post('/api/users/darkmode', requireAuth, async (req, res) => {
    await UsersController.toggleDarkMode(sqlConfig, req, res);
});

export default router;
