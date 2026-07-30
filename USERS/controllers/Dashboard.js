import sql from 'mssql';
import Rules from '../rule/DevTeam.js';
import USERModel from '../model/USER.js';
import DashboardModel from '../model/Dasboard.js';
import { calculateDepartments, calculateLogStats } from '../functions.js';

export default class DashboardController {

static async getDashboard(connection, req, res) {
  // 1) Tomar todo de la sesión
  const UserID = req.session?.userID || null;
  const iddevteam = req.session?.iddevteam || null; // puede ser null por defecto

  // 2) Validar equipo/impersonación (si aplica en tu lógica)
  const devteam = await Rules.validateTeam(iddevteam, UserID);
  const devUser = iddevteam ?? null;

  // 3) Conectar y usar pool directamente (GET no necesita transacción)
  const pool = await sql.connect(connection);

  try {
    // 4) Si no hay usuario en sesión, fuera
    if (!UserID) {
      return res.redirect("/weblogin");
    }

    const departmentFlows = await DashboardModel.getDepartmentsFlows(pool, UserID);
    const sql_where = departmentFlows.map(flow => `cflow = ${flow.id}`).join(' OR ');

    const userDetails = await USERModel.obtenerDatosUsuario(pool, UserID);
    const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];

    const logTotalQuery = await DashboardModel.getLogDetails(pool, userDetails.UserName, sql_where);

    const departamentos = calculateDepartments(logTotalQuery, userDetails.Modules);
    const { UserTotal, UserTotalEjecutando, UserTotalPending, UserTotalRechazado } = calculateLogStats(logTotalQuery);

    const topApprovals = await DashboardModel.getTopApprovals(pool, userDetails.UserName);

    const ultimosTop = topApprovals.recordset.map(approval => [
      approval.id, approval.detalle_proceso, approval.s_fecha, approval.estado
    ]);

    const ultimosTopId = topApprovals.rowsAffected === 0 ? [] : topApprovals.recordset.map(approval => approval.id);

    res.render("index", {
      title: "Dashboard",
      userProfile: {
        UserName: userDetails.UserName,
        Total: UserTotal,
        Ejecutando: UserTotalEjecutando,
        Pendiente: UserTotalPending,
        Rejected: UserTotalRechazado,
        ultimosTop,
        ultimosTopId: ultimosTopId,
        TablaUltimos: topApprovals.rowsAffected === 0 ? "Not" : "View",
        departamentos: departamentos,
        UsuarioID: UserID,
        DarkMode: userDetails.DarkMode || 0,
      },
      userMenu: userDetails.Menu,
      devUser: devUser,
      usuarios: grupousuarios,
      devteam
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
}

    static async createErrorLog(conection, req, res) {
        const UserID = req.body.UsuarioID || req.body.UserID;
        const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam);
        const payload = Object.entries(req.body).map(([key, value]) => `${key}:${value}`).join(', '); 
        const respuesta = req.error; 
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const usuario = await USERModel.obtenerDatosUsuario(transaction, UserID);
            const grupousuarios = devteam ? await USERModel.findDevTeam(transaction, UserID) : [];
            const logError = await DashboardModel.CreateErrorLog(transaction, UserID, payload.substring(0, 500), respuesta.substring(0, 500));
            await transaction.commit();
            if( req.file_error === true){
                res.status(200).json({ error: respuesta });
            }
            else{
            res.status(400).render("error_view", {
                title: "¡An error has occurred!",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                },
                userMenu: usuario.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
                logError: logError
            });
        }
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error(error);
            res.status(500).send("Internal Server Error");
        }
    }

    
    static async createErrorCRM(conection, req, res) {
        const UserID = req.body.user_id
        const payload =  typeof req.body.payload === 'object' ? JSON.stringify(req.body.payload) : req.body.payload;
        const response = req.body.response; 

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const logError = await DashboardModel.CreateErrorCRM(transaction, UserID, payload.substring(0, 500), response.substring(0, 500));
            await transaction.commit();
            if(logError){
                res.status(200).json({ error: response });
            }
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error(error);
            res.status(500).send("Internal Server Error");
        }
    }
}