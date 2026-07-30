// here are the functions that are used to create, update and read performance review /form_hr_performance_review
import sql from 'mssql';
import Rules from '../../../USERS/rule/DevTeam.js';
import USERModel from '../../../USERS/model/USER.js';
import PerformanceReviewModel from "../../PerformanceReview/model/PerformanceReview.js";
import PersonnelRequisitionModel from '../model/PersonnelRequisition.js';
import ApprovalFunctionsModel from '../../../Approvals_functions/models/approval_functions.js';
import { getAdjustedDate } from '../../../Middleware/validateUserId.js';
import { ApprovalCreationVesion2 } from '../../../functions.js';
import { sqlConfig } from '../../../dbConfig.js';
import DashboardController from '../../../USERS/controllers/Dashboard.js';
export default class PersonnelRequisitionController {

    static async getInitialPersonnelRequisition(conection, req, res) {
        const UserID = req.session?.userID;
        const formName = "Personnel Requisition Form";
        let devteam = await Rules.validateTeam(req.session?.iddevteam,UserID)
        
        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const mform = await PerformanceReviewModel.getMasterForm(pool, formName);
            const managerData = await PerformanceReviewModel.getManagerData(pool, usuario.Manager);
            const allcompanys = await PersonnelRequisitionModel.getAllCompanies(pool, usuario.Menu.compania);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            res.render("RRHH/form_hr_personnel_requisition", {
                title: "Personnel Requisition Form",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                    Dep: usuario.Dep,
                    cdepartamento: usuario.cdepartamento,
                    manager: managerData[0],
                },
                companies: allcompanys,
                userMenu: usuario.Menu,
                usuarios: grupousuarios, 
                devteam: devteam,
                mform: mform,
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Returns the resolved actors for the Personnel Requisition approval flow.
     */
    static async getActors(conection, req, res) {
        const userId = req.session?.userID;

        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, userId);
            const allDepartments = await ApprovalFunctionsModel.getAllDepartamentos(pool);
            const users = await ApprovalFunctionsModel.getUsersByCompany(pool, usuario.compania);
            const flow = await PersonnelRequisitionModel.getPersonnelRequisitionFlow(pool, usuario.Dep, usuario.compania);

            if (!flow) {
                return res.status(404).json({ error: 'No Personnel Requisition flow found for your department.' });
            }

            const { procesos, estados } = PersonnelRequisitionModel.resolveActors(
                flow, users, { id: Number(usuario.Dep) }, userId, allDepartments
            );

            const buildActor = (item) => ({
                name: item?.Name || 'N/A',
                userId: item?.UserID && item.UserID !== 'N/A' ? item.UserID : null,
            });

            const actorKeys = ['verificador', 'aprobador', 'firmante', 'operador', 'ejecutor'];
            const actorRaw = {
                verificador: buildActor(procesos[1]),
                aprobador:   buildActor(procesos[2]),
                firmante:    buildActor(procesos[3]),
                operador:    buildActor(procesos[4]),
                ejecutor:    buildActor(procesos[5]),
            };

            // Deduplicate: keep only in the last (furthest) role
            const nullActor = { name: 'N/A', userId: null };
            for (let i = 0; i < actorKeys.length; i++) {
                const uid = actorRaw[actorKeys[i]].userId;
                if (!uid) continue;
                for (let j = i + 1; j < actorKeys.length; j++) {
                    if (actorRaw[actorKeys[j]].userId === uid) {
                        actorRaw[actorKeys[i]] = { ...nullActor };
                        break;
                    }
                }
            }

            const actors = actorRaw;

            let estado = 'Execute';
            if (actors.verificador.name !== 'N/A') estado = 'Verify';
            else if (actors.aprobador.name !== 'N/A') estado = 'Approve';
            else if (actors.firmante.name !== 'N/A') estado = 'Signature';
            else if (actors.operador.name !== 'N/A') estado = 'Apply';
            else if (actors.ejecutor.name !== 'N/A') estado = 'Execute';

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
                estado: estado,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async createPersonalRequisition(conection, req, res) {
        const userId = req.session?.userID;
        const date = getAdjustedDate();
        let devteam = await Rules.validateTeam(req.session?.iddevteam, userId);

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        let updateTransaction = null;

        try {
            await transaction.begin();

            // 1. Create the form record
            const formId = await PersonnelRequisitionModel.createForm(transaction, userId, req.body);

            // 2. Resolve the approval flow and actors
            const usuario = await USERModel.obtenerDatosUsuario(transaction, userId);
            const allDepartments = await ApprovalFunctionsModel.getAllDepartamentos(transaction);
            const flow = await PersonnelRequisitionModel.getPersonnelRequisitionFlow(transaction, usuario.Dep, usuario.compania);

            if (!flow) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(400).json({ result: 0, error: 'No Personnel Requisition flow found for your department.' });
            }

            const mform = await PersonnelRequisitionModel.getMasterForm(transaction, "Personnel Requisition Form");
            const mformId = mform.length > 0 ? mform[0].id : null;

            const userDept = allDepartments.find(d => d.id === Number(usuario.Dep));
            const departmentName = userDept ? userDept.nombre : 'Unknown';
            const basePath = ApprovalFunctionsModel._getServerPath(flow.server, flow.location);

            await transaction.commit();

            // 3. Build detail text
            const proceso = 'Personnel Requisition Form';
            const detalleProceso = proceso + ' - ' + (req.body.reasonForRequisition || '') + ' - ' + (req.body.positionJobTitle || '');

            // 4. Create the approval record
            const RowID = await ApprovalCreationVesion2(
                sqlConfig,
                proceso,
                detalleProceso,
                departmentName,
                usuario.UserName,
                date,
                req.body.verificador || 'N/A',
                req.body.aprobador || 'N/A',
                req.body.firmante || 'N/A',
                req.body.ejecutor || 'N/A',
                req.body.estado || 'Verify',
                null,               // cifra
                null,               // banco
                userId,             // username
                null,               // moneda
                null,               // mmonto
                req.body.operador || 'N/A',
                'N/A',              // asignado
                flow.id,            // approvals_select
                flow.ccompania,     // ccompania
                req,                // req (for file handling)
                basePath,
                mformId,
                formId
            );

            // 5. Link the form with the approval log
            await sql.connect(conection);
            updateTransaction = new sql.Transaction();
            await updateTransaction.begin();
            await PersonnelRequisitionModel.updateFormWithLogId(updateTransaction, formId, RowID);
            await updateTransaction.commit();

            res.status(200).json({ result: 1, formId: formId, RowID: RowID });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            if (updateTransaction) { try { await updateTransaction.rollback(); } catch (_) {} }
            console.error('createPersonalRequisition error:', error.message);
            return res.status(500).json({ result: 0, error: error.message });
        }
    }

}