import sql from 'mssql';
import Rules from '../../../USERS/rule/DevTeam.js';
import USERModel from '../../../USERS/model/USER.js';
import PersonalTimeOffModel from '../model/PersonalTimeOff.js';
import { convertToDate } from '../../../Approvals_functions/functions.js';
import DashboardController from '../../../USERS/controllers/Dashboard.js';

export default class PersonalTimeOffController {

    static async getInitialView(conection, req, res) {
        const UserID = req.session?.userID;
        const formName = "Personal Time Off";
        let devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);

        await sql.connect(conection);
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();
            const usuario = await USERModel.obtenerDatosUsuario(transaction, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(transaction) : [];
            await transaction.commit();

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
            });
        } catch (error) {
            await transaction.rollback();
            res.status(500).json({ error: error.message });
        }
    }

    static async createPersonalTimeOff(conection, req, res) {
        const userId = req.session?.userID;
        let devteam = await Rules.validateTeam(req.session?.iddevteam, userId);

        await sql.connect(conection);
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            // Convert dates from DD/MM/YYYY to Date objects
            const body = { ...req.body };
            body.start_date = convertToDate(body.start_date);
            body.end_date = convertToDate(body.end_date);

            const formId = await PersonalTimeOffModel.createForm(transaction, userId, body);

            await transaction.commit();
            res.status(200).json({ result: 1, formId: formId });
        } catch (error) {
            await transaction.rollback();
            req.session.iddevteam = devteam;
            req.body.UsuarioID = userId;
            req.error = error.message;
            await DashboardController.createErrorLog(conection, req, res);
        }
    }
}
