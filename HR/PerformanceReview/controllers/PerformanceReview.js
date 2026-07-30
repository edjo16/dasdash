// here are the functions that are used to create, update and read performance review /form_hr_performance_review
import sql from 'mssql';
import Rules from '../../../USERS/rule/DevTeam.js';
import USERModel from '../../../USERS/model/USER.js';
import PerformanceReviewModel from "../../PerformanceReview/model/PerformanceReview.js";
import { getAdjustedDate } from '../../../Middleware/validateUserId.js';

export default class PerformanceReviewController {

    static async getInitialPerformanceReview(conection, req, res) {
        const UserID = req.session?.userID;
        const formName = "Performance Review Delivery";
        let devteam = await Rules.validateTeam(req.session?.iddevteam,UserID)
        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            const mform = await PerformanceReviewModel.getMasterForm(pool, formName);
            const managerData = await PerformanceReviewModel.getManagerData(pool, usuario.Manager);

            // Renderizar la vista
            res.render("RRHH/form_hr_performance_review", {
                title: "Performance Review Delivery",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                    Dep: usuario.Dep,
                    cdepartamento: usuario.cdepartamento,
                    manager: managerData[0],
                },
                userMenu: usuario.Menu,
                usuarios: grupousuarios, 
                devteam: devteam,
                mform: mform,
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async readPerformanceReviewById(conection, req, res) {
        const UserID = req.session?.userID;
        const { id } = req.params;
        const read = req.query.read;
        let devteam = await Rules.validateTeam(req.session?.iddevteam,UserID)
        let devUser = req.session?.iddevteam ? req.session?.iddevteam : null;

        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            const performanceReview = await PerformanceReviewModel.getPerformanceReviewById(pool, id);

            // Renderizar la vista
            res.render("rrhh/performance_review_details", {
                title: "Performance Review Details",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                },
                details: {
                    id,
                    date: performanceReview.date,
                    collaboratorName: performanceReview.collaboratorName,
                    collabjobTitle: performanceReview.collabjobTitle,
                    leaderName: performanceReview.leaderName,
                    leaderJobTitle: performanceReview.leaderJobTitle,
                    averageGoal: performanceReview.averageGoal,
                    developmentGoal: performanceReview.developmentGoal,
                    observationsLeader: performanceReview.observationsLeader,
                    observationsAssociate: performanceReview.observationsAssociate,
                    generalResult: performanceReview.generalResult,
                    log_id: performanceReview.log_id,
                },
                userMenu: usuario.Menu,
                devUser:devUser,
                usuarios: grupousuarios,
                devteam: devteam,
                read: read,
            });

        } catch (error) {
            console.error("Error en la lectura de la solicitud de aprobaciÃ³n:", error);
            res.status(500).json({ error: error.message });
        }
    }

    static async createPerformanceReview(conection, req, res) {
        const userId = req.session?.userID;
        const date = getAdjustedDate();
        let devteam = await Rules.validateTeam(req.session?.iddevteam,userId)
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const formId = await PerformanceReviewModel.createForm(transaction, userId, req.body);
            const approvalsFlow = await PerformanceReviewModel.handleApprovals(transaction, req,formId, date, userId);
            await PerformanceReviewModel.updateFormWithLogId(transaction, formId, approvalsFlow);
            await transaction.commit();
            setTimeout(() => {
                let redirectRute = `http://${req.headers.host}/approvals-detalle?RowID=${approvalsFlow}`;
                res.redirect(redirectRute);
            }, 500);
        } catch (err) {
            try { await transaction.rollback(); } catch (_) {}
            console.error("Error en el flujo de aprobaciÃ³n:", err);
            return res.status(500).json({ result: 0, err });
        }
    }

    static async updatePerformanceReview(conection, req, res) {
        const { id } = req.params;
        const userId = req.session?.userID;
        const formData = req.body;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const response = await PerformanceReviewModel.updatePerformanceReview(transaction, id, userId, formData);
            await transaction.commit();
            res.send(response);

        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error("Error updating the performance review:", error);
            return res.status(500).json({ result: 0, error: "Error updating the performance review." });
        }
    }

}
