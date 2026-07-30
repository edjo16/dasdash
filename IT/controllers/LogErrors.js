import sql from 'mssql';
import Rules from '../../USERS/rule/DevTeam.js';
import USERModel from '../../USERS/model/USER.js';
import DashboardController from "../../USERS/controllers/Dashboard.js";
import LogErrorsModel from '../model/LogErrors.js';

export default class LogErrorsController {

  static async getLogErrorsView(connection, req, res) {
    const UserID = req.session?.userID;
    const devteam = Rules.validateTeam(UserID);

    const pool = await sql.connect(connection);

    try {
      const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
      const grupousuarios = devteam ? await USERModel.findDevTeam(pool, UserID) : [];
      
      const uniqueUsers = await LogErrorsModel.getUniqueUsers(pool);
      const uniqueEndpoints = await LogErrorsModel.getUniqueEndpoints(pool);
      

      res.render("IT/forms_it_log_errors", {
        title: "System Error Logs",
        userProfile: {
          UserName: usuario.UserName,
          UsuarioID: UserID,
          Dep: usuario.departamentoOrigen,
          cdepartamento: usuario.cdepartamento
        },
        userMenu: usuario.Menu,
        usuarios: grupousuarios,
        devteam: devteam,
        uniqueUsers: uniqueUsers,
        uniqueEndpoints: uniqueEndpoints
      });
    } catch (error) {
      req.session.iddevteam = devteam;
      req.body.UsuarioID = UserID;
      req.error = error.message;
      await DashboardController.createErrorLog(connection, req, res);
    }
  }

  static async getLogErrorsData(connection, req, res) {
    const UserID = req.session?.userID;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || null;
    const userName = req.query.userName || null;
    const endpoint = req.query.endpoint || null;
    const offset = (page - 1) * limit;

    let devteam = await Rules.validateChangeRequestModule(req.session?.iddevteam, UserID);

    const pool = await sql.connect(connection);

    try {
      const logData = await LogErrorsModel.readLogErrors(
        pool, 
        limit, 
        offset, 
        search, 
        userName, 
        endpoint
      );

      const totalCount = await LogErrorsModel.totalCount(
        pool, 
        search, 
        userName, 
        endpoint
      );

      res.send({ 
        logData: logData.recordset, 
        totalCount: totalCount.totalCount 
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getLogErrorDetail(connection, req, res) {
    const UserID = req.session?.userID;
    const logId = req.query.id;

    if (!logId) {
      return res.status(400).json({ error: 'Se requiere el ID del log' });
    }

    const pool = await sql.connect(connection);

    try {
      const logDetail = await LogErrorsModel.getLogById(pool, logId);

      if (!logDetail) {
        return res.status(404).json({ error: 'Log no encontrado' });
      }

      res.json(logDetail);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
