// External Emails Request (desbloqueo de correos externos) — /forms_it_external_emails_request
import sql from 'mssql';
import Rules from '../../USERS/rule/DevTeam.js';
import USERModel from '../../USERS/model/USER.js';
import ExternalEmailsRequestModel, { EXTERNAL_EMAILS_FORM_NAME, REASON_LABELS } from '../model/ExternalEmailsRequest.js';
import ApprovalFunctionsModel from '../../Approvals_functions/models/approval_functions.js';
import { getAdjustedDate } from '../../Middleware/validateUserId.js';
import { ApprovalCreation } from '../../functions.js';
import DashboardController from '../../USERS/controllers/Dashboard.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default class ExternalEmailsRequestController {

    /**
     * Resuelve el flujo 135 y sus actores para el usuario indicado.
     * Devuelve null en `flow` cuando el flujo no está configurado/activo.
     */
    static async resolveFlowForUser(transaction, usuario, userId) {
        const allDepartments = await ApprovalFunctionsModel.getAllDepartamentos(transaction);
        const users = await ApprovalFunctionsModel.getUsersByCompany(transaction, usuario.compania);
        const flow = await ExternalEmailsRequestModel.getExternalEmailsFlow(transaction);

        if (!flow) return { flow: null, actors: null, estado: null, allDepartments };

        const { procesos } = ExternalEmailsRequestModel.resolveActors(
            flow, users, { id: Number(usuario.Dep) }, userId, allDepartments
        );

        // procesos: [solicitante(N/A), verificador, aprobador, firmante, operador, ejecutor, ...suplentes]
        const buildActor = (item) => ({
            name: item?.Name || 'N/A',
            userId: item?.UserID && item.UserID !== 'N/A' ? item.UserID : null,
        });

        const actorKeys = ['verificador', 'aprobador', 'firmante', 'operador', 'ejecutor'];
        const actors = {
            verificador: buildActor(procesos[1]),
            aprobador:   buildActor(procesos[2]),
            firmante:    buildActor(procesos[3]),
            operador:    buildActor(procesos[4]),
            ejecutor:    buildActor(procesos[5]),
        };

        // Si el mismo usuario aparece en varios roles, se conserva solo en el último.
        const nullActor = { name: 'N/A', userId: null };
        for (let i = 0; i < actorKeys.length; i++) {
            const uid = actors[actorKeys[i]].userId;
            if (!uid) continue;
            for (let j = i + 1; j < actorKeys.length; j++) {
                if (actors[actorKeys[j]].userId === uid) {
                    actors[actorKeys[i]] = { ...nullActor };
                    break;
                }
            }
        }

        let estado = 'Execute';
        if (actors.verificador.name !== 'N/A') estado = 'Verify';
        else if (actors.aprobador.name !== 'N/A') estado = 'Approve';
        else if (actors.firmante.name !== 'N/A') estado = 'Signature';
        else if (actors.operador.name !== 'N/A') estado = 'Apply';
        else if (actors.ejecutor.name !== 'N/A') estado = 'Execute';

        return { flow, actors, estado, allDepartments };
    }

    static async getInitialView(conection, req, res) {
        const UserID = req.session?.userID;
        let devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);

        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const mform = await ExternalEmailsRequestModel.getMasterForm(pool, EXTERNAL_EMAILS_FORM_NAME);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];

            res.render("IT/external_emails/forms_it_external_emails_request", {
                title: "External Emails Request",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                    Dep: usuario.Dep,
                    cdepartamento: usuario.cdepartamento,
                },
                userMenu: usuario.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
                mform: mform.length > 0 ? mform[0] : null,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Devuelve los actores resueltos del flujo de aprobación para el usuario en sesión.
     */
    static async getActors(conection, req, res) {
        const userId = req.session?.userID;

        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, userId);
            const { flow, actors, estado } = await ExternalEmailsRequestController.resolveFlowForUser(pool, usuario, userId);

            if (!flow) {
                return res.status(404).json({ error: 'No External Emails Request flow found.' });
            }

            res.json({
                result: 1,
                flow: {
                    id: flow.id,
                    ccompania: flow.ccompania,
                    nombre: flow.nombre,
                    ruta: flow.ruta,
                    cdepartamento: flow.cdepartamento,
                },
                actors,
                estado,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async createExternalEmailsRequest(conection, req, res) {
        const userId = req.session?.userID;
        let devteam = await Rules.validateTeam(req.session?.iddevteam, userId);
        const date = getAdjustedDate();

        const body = {
            contact_name: (req.body.contact_name || '').trim(),
            email: (req.body.email || '').trim(),
            reason: (req.body.reason || '').trim().toLowerCase(),
        };

        if (!body.contact_name || !body.email || !body.reason) {
            return res.status(400).json({ error: 'Name, Email and Reason for Request are required.' });
        }
        if (!EMAIL_REGEX.test(body.email)) {
            return res.status(400).json({ error: 'The email address is not valid.' });
        }
        if (!REASON_LABELS[body.reason]) {
            return res.status(400).json({ error: 'Invalid Reason for Request.' });
        }

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        let updateTransaction = null;

        try {
            await transaction.begin();

            // 1. Crear el registro del formulario
            const formId = await ExternalEmailsRequestModel.createForm(transaction, userId, body);

            // 2. Resolver el flujo de aprobación y sus actores
            const usuario = await USERModel.obtenerDatosUsuario(transaction, userId);
            const { flow, actors, estado, allDepartments } = await ExternalEmailsRequestController.resolveFlowForUser(transaction, usuario, userId);

            if (!flow) {
                try { await transaction.rollback(); } catch (_) { }
                return res.status(400).json({ error: 'No External Emails Request flow found.' });
            }

            const mform = await ExternalEmailsRequestModel.getMasterForm(transaction, EXTERNAL_EMAILS_FORM_NAME);
            const mformId = mform.length > 0 ? mform[0].id : null;

            const userDept = allDepartments.find(d => d.id === Number(usuario.Dep));
            const departmentName = userDept ? userDept.nombre : 'Unknown';

            const approvalsRuta = flow.ruta ? flow.ruta.replace('\\', '/') : '';

            await transaction.commit();

            // 3. Detalle del proceso
            const detalleProceso = `External Emails Request for ${body.contact_name} - ${body.email} - Reason: ${REASON_LABELS[body.reason]}`;

            // 4. Crear la aprobación
            const RowID = await ApprovalCreation(
                conection,
                'External Emails Request',
                detalleProceso,
                departmentName,
                usuario.UserName,
                date,
                actors.verificador.name,
                actors.aprobador.name,
                actors.firmante.name,
                actors.ejecutor.name,
                estado,
                null,               // cifra
                null,               // banco
                userId,             // username
                null,               // moneda
                null,               // mmonto
                actors.operador.name,
                'N/A',              // asignado
                flow.id,            // approvals_select
                usuario.compania,
                req,                // req (para archivos)
                approvalsRuta,
                mformId,
                formId
            );

            // 5. Enlazar el formulario con el log de aprobación
            await sql.connect(conection);
            updateTransaction = new sql.Transaction();
            await updateTransaction.begin();
            await ExternalEmailsRequestModel.updateFormWithLogId(updateTransaction, formId, RowID);
            await updateTransaction.commit();

            res.status(200).json({ result: 1, formId: formId, RowID: RowID });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) { }
            if (updateTransaction) { try { await updateTransaction.rollback(); } catch (_) { } }
            req.session.iddevteam = devteam;
            req.body.UsuarioID = userId;
            req.error = error.message;
            await DashboardController.createErrorLog(conection, req, res);
        }
    }

    /**
     * Devuelve un formulario como JSON (usado por el modal de approvals-detalle).
     */
    static async getFormByIdJson(conection, req, res) {
        const formId = req.params.id;

        const pool = await sql.connect(conection);

        try {
            const form = await ExternalEmailsRequestModel.getFormById(pool, formId);

            if (!form) {
                return res.status(404).json({ result: 0, error: 'Not found' });
            }

            res.json({ result: 1, form: form });
        } catch (error) {
            res.status(500).json({ result: 0, error: error.message });
        }
    }
}
