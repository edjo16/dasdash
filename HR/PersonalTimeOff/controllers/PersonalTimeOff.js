import sql from 'mssql';
import Rules from '../../../USERS/rule/DevTeam.js';
import USERModel from '../../../USERS/model/USER.js';
import PersonalTimeOffModel from '../model/PersonalTimeOff.js';
import ApprovalFunctionsModel from '../../../Approvals_functions/models/approval_functions.js';
import { convertToDate,convertToNewDate } from '../../../Approvals_functions/functions.js';
import { getAdjustedDate } from '../../../Middleware/validateUserId.js';
import { ApprovalCreation } from '../../../functions.js';
import DashboardController from '../../../USERS/controllers/Dashboard.js';

export default class PersonalTimeOffController {

    static async getInitialView(conection, req, res) {
        const UserID = req.session?.userID;
        const formName = "Personal Time Off";
        let devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);

        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const mform = await PersonalTimeOffModel.getMasterForm(pool, formName);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];

            res.render("rrhh/form_hr_personal_time_off", {
                title: "Personal Time Off",
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
     * Returns the resolved actors for the PTO approval flow based on the user's department.
     */
    static async getActors(conection, req, res) {
        const userId = req.session?.userID;

        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, userId);
            const allDepartments = await ApprovalFunctionsModel.getAllDepartamentos(pool);
            const users = await ApprovalFunctionsModel.getUsersByCompany(pool, usuario.compania);
            const flow = await PersonalTimeOffModel.getPersonalTimeOffFlow(pool, usuario.Dep, usuario.compania);

            if (!flow) {
                return res.status(404).json({ error: 'No Personal Time Off flow found for your department.' });
            }

            const { procesos, estados } = PersonalTimeOffModel.resolveActors(
                flow, users, { id: Number(usuario.Dep) }, userId, allDepartments
            );

            // Extract resolved actor names and UserIDs from procesos array
            // procesos layout: [solicitante(N/A), verificador, aprobador, firmante, operador, ejecutor, ...suplentes]
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

            // Deduplicate: if the same userId appears in multiple roles,
            // keep it only in the last (furthest) role and nullify the earlier ones.
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

            // Determine the initial estado
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

    static async createPersonalTimeOff(conection, req, res) {
        const userId = req.session?.userID;
        let devteam = await Rules.validateTeam(req.session?.iddevteam, userId);
        const date = getAdjustedDate();

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        let updateTransaction = null;

        try {
            await transaction.begin();

            const body = { ...req.body };
            const msPerDay  = 1000 * 60 * 60 * 24;
            let end_date = body.request_type !== 'partial_permit' && convertToNewDate(body.end_date)
            let start_date = body.request_type !== 'partial_permit' && convertToNewDate(body.start_date)
            // Convert dates from DD/MM/YYYY to Date objects
            body.start_date = convertToDate(body.start_date);
            body.end_date = convertToDate(body.end_date);

            const totalDays = body.request_type !== 'partial_permit'? Math.floor( (end_date - start_date) / msPerDay) + 1 : 0;
            
            // 1. Create the form record
            const formId = await PersonalTimeOffModel.createForm(transaction, userId, body, totalDays);

            // 2. Resolve the approval flow and actors
            const usuario = await USERModel.obtenerDatosUsuario(transaction, userId);
            const allDepartments = await ApprovalFunctionsModel.getAllDepartamentos(transaction);
            const users = await ApprovalFunctionsModel.getUsersByCompany(transaction, usuario.compania);
            const flow = await PersonalTimeOffModel.getPersonalTimeOffFlow(transaction, usuario.Dep, usuario.compania);

            if (!flow) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(400).json({ error: 'No Personal Time Off flow found for your department.' });
            }

            const mform = await PersonalTimeOffModel.getMasterForm(transaction, "Personal Time Off");
            const mformId = mform.length > 0 ? mform[0].id : null;

            // Get department name for the log
            const userDept = allDepartments.find(d => d.id === Number(usuario.Dep));
            const departmentName = userDept ? userDept.nombre : 'Unknown';

            const basePath = ApprovalFunctionsModel._getServerPath(flow.server, flow.location);

            await transaction.commit();

            // 3. Build detail text
            const typeLabels = {
                vacation: 'Vacation',
                medical_cert: 'Medical Certificate',
                no_medical_cert: 'Absence without Medical Certificate',
                partial_permit: 'Partial Permit',
                non_remunerated: 'Non-remunerated Time',
                license: 'License'
            };
            const typeLabel = typeLabels[req.body.request_type] || req.body.request_type;

            const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

            const fmtDateDay = (d) => {
            const date = (d instanceof Date) ? d : new Date(d);
            if (isNaN(date)) return '';
            const y = date.getUTCFullYear();
            const m = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${day} (${dayNames[date.getUTCDay()]})`;
            }
            ;
            const fmtTime = (t) => {
                if (!t) return '';
                const cleaned = t.replace(/\s*(AM|PM)\s*/i, '').trim();
                const [hStr, mStr] = cleaned.split(':');
                let h = parseInt(hStr, 10);
                const m   = (mStr || '00').trim();
                const ampm = h >= 12 ? 'PM' : 'AM';
                h = h % 12 || 12;
                return `${h}:${m} ${ampm}`;
            };

            let detalleProceso;
            if (req.body.request_type === 'partial_permit') {
                const timeFrom = fmtTime(req.body.start_permit_hour);
                const timeTo   = fmtTime(req.body.end_permit_hour);
                detalleProceso = `Personal Time Off - ${typeLabel} - ${body.start_date} ${timeFrom} to ${timeTo}`;
            } else {
                const daysLabel = totalDays === 1 ? '1 day' : `${totalDays} days`;
                detalleProceso  = `Personal Time Off - ${typeLabel} - ${fmtDateDay(body.start_date)} to ${fmtDateDay(body.end_date)}, equivalent to ${daysLabel}`;
            }

            // 4. Create the approval record
            const RowID = await ApprovalCreation(
                conection,
                'Personal Time Off',
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
                usuario.compania,
                req,                // req (for file handling)
                basePath,
                mformId,
                formId
            );

            // 5. Link the form with the approval log
            await sql.connect(conection);
            updateTransaction = new sql.Transaction();
            await updateTransaction.begin();
            await PersonalTimeOffModel.updateFormWithLogId(updateTransaction, formId, RowID);
            await updateTransaction.commit();

            res.status(200).json({ result: 1, formId: formId, RowID: RowID });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            if (updateTransaction) { try { await updateTransaction.rollback(); } catch (_) {} }
            req.session.iddevteam = devteam;
            req.body.UsuarioID = userId;
            req.error = error.message;
            await DashboardController.createErrorLog(conection, req, res);
        }
    }

    static async readById(conection, req, res) {
        const UserID = req.session?.userID;
        const formId = req.params.id;
        let devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);

        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];

            const request = new sql.Request(pool);
            request.input('id', sql.Int, formId);
            const { recordset } = await request.query(`
                SELECT id, request_type, start_date, end_date, days,
                       start_permit_hour, end_permit_hour, notes, log_id, user_created
                FROM forms_hr_personal_time_off
                WHERE id = @id;
            `);

            if (!recordset || recordset.length === 0) {
                return res.status(404).render("error_view", {
                    title: "Not Found",
                    userProfile: { UserName: usuario.UserName, UsuarioID: UserID },
                    userMenu: usuario.Menu,
                    usuarios: grupousuarios,
                    devteam: devteam,
                });
            }

            const form = recordset[0];

            res.render("rrhh/form_hr_personal_time_off_detail", {
                title: "Personal Time Off",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                    Dep: usuario.Dep,
                    cdepartamento: usuario.cdepartamento,
                },
                userMenu: usuario.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
                form: form,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Returns a single PTO form record as JSON (used by the modal in approvals-detalle).
     */
    static async getFormByIdJson(conection, req, res) {
        const formId = req.params.id;

        const pool = await sql.connect(conection);

        try {

            const request = new sql.Request(pool);
            request.input('id', sql.Int, formId);
            const { recordset } = await request.query(`
                SELECT id, request_type, start_date, end_date, days,
                       start_permit_hour, end_permit_hour, notes, log_id, user_created
                FROM forms_hr_personal_time_off
                WHERE id = @id;
            `);

            if (!recordset || recordset.length === 0) {
                return res.status(404).json({ result: 0, error: 'Not found' });
            }

            res.json({ result: 1, form: recordset[0] });
        } catch (error) {
            res.status(500).json({ result: 0, error: error.message });
        }
    }
}
