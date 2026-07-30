import sql from 'mssql';
import Rules from '../../USERS/rule/DevTeam.js';
import USERModel from '../../USERS/model/USER.js';
import DashboardController from "../../USERS/controllers/Dashboard.js";
import { getAdjustedDate } from '../../Middleware/validateUserId.js';
import ApprovalModel from '../../APPROVALS/model/approvals.js';
import DepartamentModel from '../../Departaments/model/Departament.js'
import { sanitizeHtml } from '../../utils/sanitize-html.js'
import ApprovalFunctionsModel from '../../Approvals_functions/models/approval_functions.js';
export default class FormsController {

    static async getInterdepartmentalRequest(conection, req, res) {
        const UserID = req.session?.userID;
        const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam);
        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.findDevTeam(pool, UserID) : [];
            const tipoCuenta = await ApprovalModel.GetTipoCuenta(pool);
            const departments = await DepartamentModel.getDepartmentsByStringIds(pool, usuario.departamento);
            const companies = await DepartamentModel.getCompaniesByStringIds(pool, usuario.companies);
            const monedas = await ApprovalModel.GetMonedas(pool);

            const countries = await USERModel.getCountries(pool);
            res.render("approvals/forms_interdepartmental_request", {
                title: "Request Form",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                    Dep: usuario.departamentoOrigen,
                    cdepartamento: usuario.cdepartamento
                },
                tipoCuenta:tipoCuenta,
                userMenu: usuario.Menu,
                monedas:monedas,
                companies: companies,
                departments: departments.map(d => ({ id: d.id, nombre: d.nombre, ccompania: d.ccompania })),
                defaultCompania: usuario.compania,
                defaultDep: usuario.Dep,
                usuarios: grupousuarios,
                devteam: devteam,
                countries: countries,
            });
            } catch (error) {
            await DashboardController.createErrorLog(conection, req, res);
        }
    };
    static async postInterdepartmentalRequest(conection, req, res) {
        let { UserID, xnombre, username, estado, approvals_select, compania, ctipo, banco, beneficiario = null,
             monto, moneda, proceso, verificador, aprobador, operador, ejecutor, firmante, remitanceAmount,  remittance } = req.body;
        let mmonto = null
        monto = remitanceAmount !== '' ? remitanceAmount : monto
        let ammount =  remitanceAmount !== '' ? `USD${remitanceAmount}` : monto;
        moneda = remitanceAmount !== ''? 'USD' : moneda;
        let cifra = null;
        let bank = banco
        let detalleProceso = sanitizeHtml(req.body.description);
        let texto = "";

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const users = await USERModel.getUsersAndCompanies(transaction, req, res, compania);
            const beneficiarioInfo = beneficiario !== null && beneficiario !== '' ? await ApprovalModel.ReadBeneficiaryFromId(transaction, beneficiario) : beneficiario;
             
            const approvalsFlow = await USERModel.getUserFlows(transaction, req, res);
            let ruta = ApprovalFunctionsModel._getServerPath(approvalsFlow.server, approvalsFlow.location);
            ruta = ruta.replace('\\', '/');
            const department = await USERModel.getDepartment(transaction, approvalsFlow.cdepartamento);
            
            let firmanteList = [];
            if (firmante.includes("staff")) {
                firmanteList = users;
            } else if (firmante === 'N/A') {
                firmanteList.push({ Name: "N/A" });
            } else {
                const searchResult = users.find(user => user.Name === firmante);
                if (searchResult) {
                    firmanteList.push(searchResult);
                } else {
                    throw new Error(`Firmante ${firmante} not found in users list ${user}`);
                }
            }
            const date = getAdjustedDate();
            if (ctipo == 1 || ctipo == 2 || ctipo == 3) {
                mmonto = Number(monto)
                if(approvalsFlow.nombre == "Journal Entry") {
                    ammount = ammount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")
                    cifra = ammount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")
                    texto += " " + ammount
                }
                else if (ammount > 0) {
                    ammount = moneda + ammount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")
                    cifra = ammount.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")
                    texto += " " + ammount
                } else {
                    ammount = 0
                }

                if (bank === undefined || bank == '' || bank == 'undefined'|| bank == 'N/A') {
                    bank = ''
                } else {
                    let bancoFound = await DepartamentModel.getBanksById(transaction, Number(bank))
                    bank = bank == 'N/A' ? '' : `${bancoFound.xnombre}`
                }
            }
    
            for (let i = 0; i < firmanteList.length; i++) {
                let firmanteUser = firmanteList[i];
                try {
                    const RowID = await ApprovalModel.ApprovalCreation(transaction, proceso, detalleProceso, department.nombre, xnombre, date, verificador, aprobador, firmanteUser.Name, ejecutor, estado, cifra, bank, username, moneda, mmonto, operador, 'N/A', approvals_select, compania, req, ruta, null , null, remittance, beneficiarioInfo, firmante)
                    
                    // Save approval items (cost center) if present
                    if (req.body.approval_items) {
                        let items;
                        try {
                            items = JSON.parse(req.body.approval_items);
                        } catch (_) {
                            items = [];
                        }
                        if (Array.isArray(items) && items.length > 0) {
                            await ApprovalModel.createApprovalItems(transaction, RowID, items, username, moneda);
                        }
                    }

                    if (i === firmanteList.length - 1) {
                        await transaction.commit();
                        return res.status(200).json({ RowID: RowID, estado: estado });
                    }
                } catch (error) {
                    if (error.message && error.message.includes('Duplicate')) {
                        try { await transaction.rollback(); } catch (_) {}
                        return res.status(409).json({ error: error.message, duplicate: true });
                    } else {
                        throw error;
                    }
                }
            }
    
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            req.body.UsuarioID = username;
            req.error = error.message
            req.file_error = error.message.includes("file")
            await DashboardController.createErrorLog(conection, req, res);
        }
    }

    static async getFormsHR(conection, req, res) {
        const UserID = req.session?.userID;
        const devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);
        let databaseapproval = req.query.dbdevteam
        const pool = await sql.connect(conection);
        
        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.findDevTeam(pool, UserID) : [];
            res.render("forms_hr", {
                title: "Form Human Resources",
                userProfile: {
                    UserName: usuario.UserName,
                    UserID: UserID,
                    UsuarioID: UserID
                },
                userMenu: Menu,
                okForm: req.query.result,
                usuarios: grupousuarios,
                devteam: devteam,
                dbdevteam: databaseapproval
            });
            } catch (error) {
                console.log(error)
            await DashboardController.createErrorLog(conection, req, res);
            res.status(500).json({ error: error.message });
        }
    };
}

