import sql from 'mssql';
import ApprovalModel from '../model/approvals.js';
import Rules from '../../USERS/rule/DevTeam.js';
import USERModel from '../../USERS/model/USER.js';
import { getAdjustedDate, getAdjustedDateMultiple } from '../../Middleware/validateUserId.js';
import { generateBeneficiaryPdf } from '../generatePdf.js';
import { asignacion_integrates } from '../../functions.js';
import DepartamentModel from '../../Departaments/model/Departament.js';
import DashboardModel from '../../USERS/model/Dasboard.js';
import approvalsRule from '../rules/approvals.js';
import ApprovalFunctionsModel from '../../Approvals_functions/models/approval_functions.js';
import { formatearFecha, getApprovalStatus, transformDate, readFileFromSIR, getLastUser } from '../functions.js';
import ExcelJS from 'exceljs';
import DashboardController from '../../USERS/controllers/Dashboard.js';
import { postMicrosoft, getProcessApprovals, getApprovalData, postCRM } from '../../APPROVALS/functions.js';
import EventsModel from '../../mercadeo/model/events.js';
import ChangesControlModel from '../../IT/model/ChangesControl.js';
import CRMModel from '../../CRM/model/CRM.js';
import InterpersonalModel from '../../APPROVALS/model/interpersonal.js';
import { generateLuxemburgo, montoEnPalabras } from '../generateLuxemburgo.js';

export default class ApprovalController {
    static async getRequestApproval(conection, req, res) {
        const user_id = req.body.user_id || req.session?.UserID;
        const monto = req.body.monto;
        const banco = req.body.banco;
        const bancosTatiana = ['1', '17', '26', '5', '16', '28'];
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const userData = await USERModel.obtenerDatosUsuario(transaction, user_id);
            const companias = await InterpersonalModel.postGetCompanias(transaction, userData.companies);
            const allDepartments = await ApprovalFunctionsModel.getAllDepartamentos(transaction);
            const users = await ApprovalFunctionsModel.getUsersByCompany(transaction, userData.compania);
            let flows = await InterpersonalModel.postGetFlows(transaction, userData.departamento);

            const resolvedFlows = [];
            for (const flow of flows) {
                const department = await ApprovalFunctionsModel.getDepartamentoById(transaction, flow.cdepartamento);
                const depNombre = flow.dep_nombre || department?.nombre || 'Other';
                // Resolve actors using asignacion_integrates (handles suplentes, vacaciones, staff, ALL)
                const bancos = [];
                let [procesos, estados] = asignacion_integrates(flow, users, department, userData.UserID, flow.id, flow.nombre, bancos, allDepartments);

                // Apply static operator logic for flow 2
                if (flow.id == 2) {
                    for (let i = 0; i < procesos.length; i++) {
                        const item = procesos[i];
                        const nameStr = Array.isArray(item) ? item.map(o => o.Name).join(';') : (item?.Name || '');
                        if (nameStr.includes("Ericka Castillo") && monto >= 100000) {
                            procesos[i] = Array.isArray(item)
                                ? item.filter(o => o.Name.includes("Ericka Castillo"))
                                : item;
                        } else if (nameStr.includes("Tatiana Del Barrio") && (monto < 100000 || monto == undefined) && bancosTatiana.includes(banco)) {
                            procesos[i] = Array.isArray(item)
                                ? item.filter(o => o.Name.includes("Tatiana Del Barrio"))
                                : item;
                        }
                    }
                }
                
                // Resolve banks if flow has bank configuration
                let banks = [];
                if (flow.xbanco && flow.xbanco !== "N/A") {
                    const bancoArray = flow.xbanco.split(';').filter(item => item !== '');
                    const bankList = await InterpersonalModel.getBanks(conection, flow.ccompania, flow.id) || [];
                    banks = bankList.map(bank => {
                        const bankBancos = [bank];
                        const flowWithBank = { ...flow };
                        const [bankProcesos, bankEstados] = asignacion_integrates(flowWithBank, users, department, userData.UserID, flow.id, flow.nombre, bankBancos, allDepartments);
                        const monedas = bank.monedas ? bank.monedas.split(';').filter(Boolean).sort() : [];
                        return {
                            banco_id: bank.id,
                            xnombre: bank.xnombre,
                            monedas,
                            procesos: bankProcesos,
                            estados: bankEstados
                        };
                    });
                }

                resolvedFlows.push({
                    id: flow.id,
                    ccompania: flow.ccompania,
                    nombre: flow.nombre,
                    xprocesos: flow.xprocesos,
                    xbanco: flow.xbanco,
                    ccentcosto: flow.ccentcosto,
                    cdepartamento: flow.cdepartamento,
                    dep_nombre: depNombre,
                    ctipo_flujo: flow.ctipo_flujo,
                    departamentoDestino: flow.departamentoDestino,
                    estado: flow.estado,
                    procesos,
                    estados,
                    banks
                });
            }

            const data = { flows: resolvedFlows, companies: companias };
            await transaction.commit();
            res.send({ result: 1, data: data });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }        
    }  
    static async readAllApprovals(conection, req, res) {
        const UserID = req.session?.userID || null;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const process = req.query.process || null;
        const status = req.query.status || "All";
        const search = req.query.search || null;
        const type = req.query.type || "All";
        const departamento = req.query.departamento || null;
        const only_start = req.query.only_start || null;
        const offset = (page - 1) * limit;
        const solicitante_fecha = req.query.solicitante_fecha || null;
        const cierre_fecha = req.query.cierre_fecha || null;
        const transformedSolicitanteFecha = solicitante_fecha !== null ? transformDate(solicitante_fecha) : null;
        const transformedCierreFecha = cierre_fecha !== null ? transformDate(cierre_fecha) : null;
        let AllApprovals = [];
        let AllApprovalsCount = null;
        let approvalData = [];
        let totalCount = 0;
        const pool = await sql.connect(conection);
        try {
            const userData = await USERModel.obtenerDatosUsuario(pool, UserID);
            const userAlias = await USERModel.getUserAlias(pool, UserID) || null;
            let cflows = await USERModel.getUserDepartment(pool, UserID);
            const flows = await USERModel.getFlowAccess(pool, UserID);
            const banks = await DepartamentModel.getAllBanks(pool);
            cflows = cflows.concat(flows);
            const getUserNames = await USERModel.getAllUserNames(pool);
            if (status !== 'Pending' && status !== 'Ongoing') {
            approvalData = await ApprovalModel.getApprovalsFilter(pool, userData.UserName, userAlias!== null? userAlias.Name: null, limit, offset, process, status, search, transformedSolicitanteFecha, transformedCierreFecha, only_start, cflows, type, departamento);
            totalCount = await ApprovalModel.totalCount(pool, userData.UserName, userAlias!== null? userAlias.Name: null, process, status, search, transformedSolicitanteFecha, transformedCierreFecha, only_start, cflows, type, departamento);
            }
            if (status == 'Pending') {
                const { results, totalResults } = await ApprovalModel.getApprovalsPendingAll(pool, userData.UserName, limit, offset, process, status, search, transformedSolicitanteFecha, transformedCierreFecha, only_start, cflows, type, departamento);
                approvalData = results
                totalCount = totalResults
            }
            if (status == 'Ongoing') {
                const { results, totalResults } = await ApprovalModel.getApprovalsOngoinAll(pool, userData.UserName, limit, offset, process, status, search, transformedSolicitanteFecha, transformedCierreFecha, only_start, cflows, type, departamento);
                approvalData = results
                totalCount = totalResults
            }
            approvalData = await getApprovalData(approvalData,getUserNames, req);
            res.send({username:userData.UserName,  approvalData: AllApprovalsCount !== null ? AllApprovals : approvalData, totalCount: totalCount, estado:status, banks:banks });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async readAprovals(conection, req, res) {
        const UserID = req.session?.userID || null;
        const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam );

        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.findDevTeam(pool, UserID) : [];
            let cflows = await USERModel.getUserDepartment(pool, UserID);
            const flows = await USERModel.getFlowAccess(pool, UserID);
            cflows = cflows.concat(flows);
            const log = await ApprovalModel.getProcesos(pool, usuario.UserName, cflows );
            const process = await getProcessApprovals(log);
            const banks = await DepartamentModel.getAllBanks(pool);
            const managerDepartments = await USERModel.getDepartmentWhenManager(pool, UserID);
            res.render("approvals/approvals-total", {
                title: "Approvals",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                },
                userMenu: usuario.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
                process: process,
                banks: banks,
                managerDepartments: managerDepartments
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async readAprovalsById(conection, req, res) {
        const UserID = req.session?.userID;
        const RowID = req.query.RowID;
        const error_id = req.query.Toast;
        const mensaje = req.query.ToastMessaje;
        let fatherIntegrants = null;
        let table_name = null;
        let fatherLog = null;
        let isOriginal = false; 
        let validateSeeSupport;
        let validateSupportViewApproval;
        const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam);
        const pool = await sql.connect(conection);
    
        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const getAreaSupervisor = await USERModel.getAreaSupervisor(pool, usuario.Dep);
            const log = await ApprovalModel.getLogById(pool, RowID);
            const permissiontoCancel = await Rules.validatePermissionCancelApproval(pool, RowID, UserID, usuario.UserName, getAreaSupervisor, req.session?.iddevteam,log.cflow);
            const permision = await Rules.validatePermissionApproval(pool, RowID, UserID, usuario.Manager, getAreaSupervisor, req.session?.iddevteam, log.id_nuevo !== null, log.id_nuevo, log.cflow);
            const FunctionsPermisions = await Rules.validateMarketingModule(pool, req.session?.iddevteam, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            const asignados = await USERModel.getAccUsers(pool, usuario.compania)
            const bancoApproval = !isNaN(Number(log.banco)) && log.banco !=='' && log.banco !== null  && log.banco !== 'N/A'? await DepartamentModel.getBanksById(pool, Number(log.banco)) : []; 
            const beneficiarioInfo = log.beneficiario !==null ? await ApprovalModel.ReadBeneficiaryFromId(pool, log.beneficiario) : null
            const countries = await USERModel.getCountries(pool);
            const tipoCuenta = await ApprovalModel.GetTipoCuenta(pool);
            if (!permision) {
                return res.render("detaller-error", {
                    title: "Approval Details",
                    userProfile: {
                        UserName: usuario.UserName,
                        UsuarioID: UserID,
                        cdepatamento: usuario.departamentoOrigen
                    },
                    detalle: {
                        RowID: `Approval # ${RowID}`,
                    },
                    userMenu: usuario.Menu,
                    usuarios: grupousuarios,
                    devteam: devteam,
                });
            }
            let company = null;
            const userIntegrants = await USERModel.findUserNames(pool, log);
            if (log.form_id !== null) {
                const masterData = await ApprovalModel.getMasterData(pool, log.mform);
                table_name = masterData.table_name;
            }
            const hasFatherApproval = await ApprovalModel.hasFatherApproval(pool, RowID);
            if (hasFatherApproval.id_original || log.id_nuevo) {
                if(hasFatherApproval.id_original) {
                    isOriginal = true;
                    fatherLog = await ApprovalModel.getLogById(pool, hasFatherApproval.id_original);
                    validateSeeSupport = true;
                }
                else if(log.id_nuevo && log.id_nuevo !== log.id) {
                    isOriginal = false;
                    fatherLog = await ApprovalModel.getLogById(pool, log.id_nuevo);
                    validateSeeSupport = await Rules.validateSupportView(pool, Number(log.id_nuevo), UserID, req.session?.iddevteam)
                    validateSupportViewApproval = await Rules.validateSupportViewApproval(pool, Number(log.id_nuevo), UserID, req.session?.iddevteam, log.ejecutor)
                }
                fatherIntegrants = await USERModel.findUserNames(pool, fatherLog);

                fatherLog.solicitante_fecha = formatearFecha(fatherLog.solicitante_fecha);
                if (fatherLog.asignado_fecha) {
                    fatherLog.asignado_fecha = formatearFecha(fatherLog.asignado_fecha);
                }
            }

            if (table_name !== null) {
                const requestLog = new sql.Request(pool);
                const query = `SELECT id FROM ${table_name} WHERE log_id = ${RowID}`;
                const { recordset } = await requestLog.query(query);
                if (recordset.length > 0) {
                    log.log_id = recordset[0].id;
                }
                else {
                    log.log_id = null;
                }
            }

            const approvalFlow = await ApprovalModel.getApprovalFlow(pool, log.cflow);
            const { approval, accion, ctipo_flujo, departamentoDestino } = getApprovalStatus(log, usuario, approvalFlow)
            if (log.ccompania) {
                company = await DepartamentModel.getCompany(pool, log.ccompania)
            }
            const lastUser = getLastUser(log);
            const executedIsEqualOfAsigned = (log.estado === 'Execute' && log.ejecutor === log.asignado && validateSeeSupport === undefined ) ? 'asignado' : accion;
            // section of events is mfrom is 3
            let eventParticipants = null;
            let eventMeetings = null;
            let formData = null;
            if(log.mform === 3){
                formData = await EventsModel.readFormByLogId(pool, RowID);
                eventParticipants = await EventsModel.readFormParticipantsById(pool, formData.id);
                eventMeetings = await EventsModel.readFormEventById(pool, formData.id, formData.category);
            }
            let changeRequestData = null;
            if (log.mform === 4 && log.form_id) {
                changeRequestData = await ChangesControlModel.readFormById(pool, log.form_id);
            }
            
            const grupousuarios_active = log.mform === 4 ? await USERModel.getAllUserActive(pool, usuario.compania) : [];

            // Fetch approval items for cost center section
            let approvalItems = [];
            try {
                if(hasFatherApproval && hasFatherApproval.id_original){
                    approvalItems = await ApprovalModel.getApprovalItems(pool, hasFatherApproval.id_original);
                } else{
                     approvalItems = await ApprovalModel.getApprovalItems(pool,  log.id);
                }

            } catch (_) {}

            // No transaction commit needed for GET request

            let hasCrmRelation = false;
            if (log.mform === 4) {
                try {
                    const crmRelations = await ApprovalModel.getCrmApprovalRelations(conection, log.id);
                    hasCrmRelation = crmRelations && crmRelations.length > 0;
                } catch (_) {}
            }

            res.render("approvals/approvals-detalle", {
                title: "Approval Details",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                    cdepatamento: usuario.departamentoOrigen,
                    permisionToCancel: permissiontoCancel,
                    departamento_user: usuario.Dep
                },
                detalle: {
                    company: company ? company.xnombre : "No Company Associated",
                    RowID: log.id,
                    proceso: log.proceso,
                    detalle_proceso: log.detalle_proceso,
                    departamento: log.departamento,
                    departamentoOrigen: usuario.departamentoOrigen,
                    departamentoDestino: departamentoDestino,
                    solicitante: log.solicitante,
                    solicitante_fecha: log.s_fecha,
                    verificador: log.verificador,
                    verificador_comentarios: log.verificador_comentarios,
                    v_fecha: log.v_fecha,
                    aprobador: log.aprobador,
                    aprobador_comentarios: log.aprobador_comentarios,
                    a_fecha: log.a_fecha,
                    firmante: log.firmante,
                    firmante_comentarios: log.firmante_comentarios,
                    f_fecha: log.f_fecha,
                    operador: log.operador,
                    operador_comentarios: log.operador_comentarios,
                    o_fecha: log.o_fecha,
                    ejecutor: log.ejecutor,
                    ejecutor_comentarios: log.ejecutor_comentarios,
                    asignador_comentarios: log.operador_comentarios2,
                    e_fecha: log.e_fecha,
                    estado: log.estado,
                    approval: approval,
                    accion: executedIsEqualOfAsigned,
                    asignado: log.asignado,
                    asignado_fecha: log.as_fecha,
                    ctipo_flujo: ctipo_flujo,
                    estado1: log.estado1,
                    log_id: log.log_id,
                    csuscriptor: log.csuscriptor,
                    sir_reference: log.sir_reference,
                    cierre_fecha: log.cierre,
                    banco:  !isNaN(Number(log.banco)) ? bancoApproval.xnombre : log.banco,
                    remittance: log.remittance,
                    monto: log.monto,
                    mmonto: log.mmonto,
                    moneda: log.moneda,
                    mform: log.mform,
                    form_id: log.form_id,
                },
                events:{
                    eventParticipants,
                    eventMeetings,
                    eventInfo: formData
                },
                beneficiario: beneficiarioInfo,
                countries: countries,
                tipoCuenta: tipoCuenta,
                ccompania: log.ccompania || usuario.compania || '',
                infoLog: devteam? log : '',
                fatherLog: fatherLog || null,
                isOriginal: isOriginal || false,
                validateSeeSupport: validateSeeSupport || false,
                validateSupportViewApproval: validateSupportViewApproval || false,
                fatherLogId: hasFatherApproval ? hasFatherApproval.id_original : null,
                userMenu: usuario.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
                okForm: error_id,
                mensaje: mensaje,
                userIntegrants,
                fatherIntegrants,
                edit: FunctionsPermisions,
                lastUser,
                asignados:asignados,
                changeRequestData: changeRequestData || null,
                grupousuarios_active: grupousuarios_active || [],
                hasCrmRelation: hasCrmRelation,
                approvalItems: approvalItems || [],
            });

        } catch (error) {
            req.body.UsuarioID = req.session?.userID;
            req.error = error.message;
            req.endpoint = "/approvals-detalle";
            await DashboardController.createErrorLog(conection, req, res);
        }
    }
    static async createApprovalBySIR(conection, req, res) {
        const { cusuario, cflow, csuscriptor, detalle_proceso, sir_reference, banco=null, moneda= null, monto = null } = req.body;

        if (!cusuario || !cflow || !csuscriptor || !detalle_proceso || !sir_reference) {
            return res.status(400).json({ error: "Missing required fields... fields: cusuario, cflow, csuscriptor, detalle_proceso, sir_reference" });
        }
    
        const pool = await sql.connect(conection);
        let sirLogId = null;
        try {
            sirLogId = await ApprovalModel.createSirLog(pool, JSON.stringify(req.body), 'Procesing');
        } catch (logError) {
            console.error('Failed to insert sir log:', logError.message);
        }

        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const date = getAdjustedDate();
            const { UserName, Manager } = await USERModel.obtenerDatosUsuario(transaction, cusuario);
            const csuscriptorInfo = await USERModel.obtenerDatosUsuario(transaction, csuscriptor);
            const approvalFlow = await ApprovalModel.getApprovalFlow(transaction, cflow);
            const department = await DepartamentModel.getDepartmentById(transaction, approvalFlow.cdepartamento);
            const departments = await DepartamentModel.getDepartaments(transaction);
            const { integrants } = await approvalsRule.getIntegrantUserSIR(approvalFlow, csuscriptorInfo.Manager, departments,csuscriptor);
            const integrantsNames = await USERModel.findUserIdSIR(transaction, integrants, csuscriptor);
            const effectiveStatus = integrantsNames.status;
            let cbanco = approvalFlow.ctipo_flujo == 2 ? null : banco; 
            let mmonto = monto !== null ? Number(monto).toFixed(2) : approvalFlow.mmonto;
            const log = await ApprovalModel.createLog(transaction, approvalFlow.nombre, detalle_proceso, department.nombre, UserName, date, integrantsNames.verificador, integrantsNames.aprobador, integrantsNames.firmante, integrantsNames.ejecutor, effectiveStatus, approvalFlow.cifra, cbanco, cusuario, moneda, mmonto, integrantsNames.operador, cflow, approvalFlow.ccompania, csuscriptorInfo.UserName, sir_reference);
            await postMicrosoft(log);
            await transaction.commit();

            if (sirLogId) {
                try {
                    await ApprovalModel.updateSirLogSuccess(pool, sirLogId, log);
                } catch (updateError) {
                    console.error('Failed to update sir log (success):', updateError.message);
                }
            }

            res.send({ id: log });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}

            if (sirLogId) {
                try {
                    await ApprovalModel.updateSirLogFailed(pool, sirLogId, error.message);
                } catch (updateError) {
                    console.error('Failed to update sir log (failed):', updateError.message);
                }
            }

            res.status(500).json({ error: error.message });
        }
    }

    static async getActores(conection, req, res) {
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const approvalFlow = await ApprovalModel.getApprovalFlow(transaction, cflow);
            const department = await DepartamentModel.getDepartmentById(transaction, approvalFlow.cdepartamento);
            const departments = await DepartamentModel.getDepartaments(transaction)
            const bancos = approvalFlow.xbanco !== "N/A" ? await DepartamentModel.getBanks(transaction, banco, moneda, ccompania) : [];
            let temp = asignacion_integrates(flow_row, users, department, username, approvalFlow.id_flow, approvalFlow.nombre, bancos, departments)
            let procesos = temp[0]
            let estados = temp[1]
            res.send({ result: 1, procesos, estados, ctipo: flow_row.ctipo_flujo })

            await transaction.commit()
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }

    }

    static async downloadExcel(conection, req, res) {
        const data = req.body.data;
        const UserID = req.session?.userID
        const page = parseInt(data.page) || 1;
        const limit = 20000;
        const offset = (page - 1) * limit;
        const process = data.process || null;
        const departamento = data.departamento || null;
        const status = data.status || "All";
        const search = data.search || null;
        const type = data.type_approval || "All";
        const only_start = data.dateFilterStart || null;
        const solicitante_fecha = data.solicitante_fecha || null;
        const cierre_fecha = data.cierre_fecha || null;
        const transformedSolicitanteFecha = solicitante_fecha !== null ? transformDate(solicitante_fecha) : null;
        const transformedCierreFecha = cierre_fecha !== null ? transformDate(cierre_fecha) : null;
        let approvalData = [];
        await sql.connect(conection);
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();
            const userData = await USERModel.obtenerDatosUsuario(transaction, UserID);
            let userAlias = await USERModel.getUserAlias(transaction, UserID) || null;
            userAlias = userAlias != null ? userAlias.Name : null;
            let cflows = await USERModel.getUserDepartment(transaction, UserID);
            const flows = await USERModel.getFlowAccess(transaction, UserID);
            cflows = cflows.concat(flows);
            const getUserNames = await USERModel.getAllUserNames(transaction);
            if (status !== 'Pending' && status !== 'Ongoing') {
            approvalData = await ApprovalModel.getApprovalsFilter(transaction, userData.UserName, userAlias, limit, offset, process, status, search, transformedSolicitanteFecha, transformedCierreFecha, only_start, cflows, type, departamento);
            }
            if (status == 'Pending') {
                const { results } = await ApprovalModel.getApprovalsPendingAll(transaction, userData.UserName, limit, offset, process, status, search, transformedSolicitanteFecha, transformedCierreFecha, only_start, cflows, type, departamento);
                approvalData = results
            }
            if (status == 'Ongoing') {
                const { results } = await ApprovalModel.getApprovalsOngoinAll(transaction, userData.UserName, limit, offset, process, status, search, transformedSolicitanteFecha, transformedCierreFecha, only_start, cflows, type, departamento);
                approvalData = results
            }

            const filteredData = approvalData.map(item => {
                const { id, s_fecha, solicitante, proceso, detalle_proceso, estado, verificador, aprobador, ejecutor, firmante, moneda, mmonto, cierre_fecha } = item;

                const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(mmonto);

                const formattedEndDate = cierre_fecha ? new Date(cierre_fecha).toLocaleDateString('en-GB') : '';

                return { id, s_fecha, solicitante, proceso, detalle_proceso, estado, verificador, aprobador, firmante, ejecutor, moneda, mmonto: formattedAmount, cierre_fecha: formattedEndDate };
            });

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('approvals');

            worksheet.mergeCells('A1:B1');
            worksheet.getCell('A1').value = 'Approvals';
            worksheet.getCell('A1').font = { bold: true, size: 14 };
            worksheet.getCell('A1').alignment = { horizontal: 'center' };
            worksheet.addRow([]);

            const columns = [
                { header: 'ID', key: 'id', width: 10 },
                { header: 'Start Date', key: 's_fecha', width: 20 },
                { header: 'Requester', key: 'solicitante', width: 20 },
                { header: 'Process', key: 'proceso', width: 20 },
                { header: 'Process Details', key: 'detalle_proceso', width: 30 },
                { header: 'Status', key: 'estado', width: 20 },
                { header: 'Verifier', key: 'verificador', width: 20 },
                { header: 'Approver', key: 'aprobador', width: 20 },
                { header: 'Signer', key: 'firmante', width: 20 },
                { header: 'Executor', key: 'ejecutor', width: 20 },
                { header: 'Currency', key: 'moneda', width: 20 },
                { header: 'Amount', key: 'mmonto', width: 20 },
                { header: 'End Date', key: 'cierre_fecha', width: 20 },
            ];
            if (filteredData.length > 0) {
                worksheet.getRow(2).values = columns.map(col => col.header);
                worksheet.columns = Object.keys(filteredData[0]).map(key => ({
                    header: key.header,
                    key: key,
                    width: 20
                }));
                filteredData.forEach((item, index) => {
                    worksheet.insertRow(index + 3, item);
                });

                worksheet.getRow(2).font = { bold: true };
                worksheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "DCE6F1" } };
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename=approvals.xlsx');

                await workbook.xlsx.write(res);
                res.end();
                await transaction.commit();
            } else {
                res.status(400).send('No data provided');
            }
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error al generar el archivo Excel:', error);
            res.status(500).send('Error al generar el archivo Excel');
        }
    }

    static async cancelApproval(conection, req, res) {
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const foundAsignado = await ApprovalModel.FinAsignado(transaction, req.body.id);
            if (foundAsignado) {
                await ApprovalModel.CancelledApproval(transaction, req.body.id);
                await ApprovalModel.CancelledApprovalAsignado(transaction, req.body.id);
            }else{
                await ApprovalModel.CancelledApproval(transaction, req.body.id);
            }
            await transaction.commit();
            res.status(200).send("Approval Cancelled");
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error(error);
            res.status(400).send("Approval Not Cancelled");
        }
    }
    static async Managerdeparments(conection, req, res) {
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const { userID } = req.body
            const departamentos = await USERModel.getDepartmentWhenManager(transaction, userID)

            await transaction.commit();
            res.status(200).send(departamentos);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error(error);
        }
    }
    static async addBeneficiary(conection, req, res) {
        const data = req.body
        if(data.banco_beneficiario =='' && data.cuenta_banco =='' && data.cuenta_banco_beneficiario ==''){
            return res.status(400).send("Required Fields Not Submited")
        }

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const isUpdate = data.beneficiario_id !== undefined && data.beneficiario_id !== null && data.beneficiario_id !== '';
            if (data.cuenta_banco && data.cuenta_banco !== '') {
                const isDuplicate = await ApprovalModel.CheckDuplicateCuentaBanco(
                    transaction,
                    data.cuenta_banco,
                    data.cuenta_banco_beneficiario,
                    data.departamento_modal,
                    isUpdate ? data.beneficiario_id : null
                );
                if (isDuplicate) {
                    await transaction.rollback();
                    return res.status(409).send("Bank account number already exists");
                }
            }
            const userData = await USERModel.obtenerDatosUsuario(transaction, data.uingreso || data.user);
            const result = await ApprovalModel.CreateBeneficiary(transaction, data, userData);
            await transaction.commit();
            res.status(200).send(result);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error(error);
            res.status(400).send("Approval Not Cancelled");
        }
    }

    static async getBeneficiaryDetailJson(conection, req, res) {
        const UserID = req.session?.userID;
        const beneficiario_id = req.query.id;
        if (!beneficiario_id) return res.status(400).json({ error: 'Missing id' });
        try {
            const pool = await sql.connect(conection);
            const userData = await USERModel.obtenerDatosUsuario(pool, UserID);
            const beneficiary = await ApprovalModel.GetBeneficiaryById(pool, beneficiario_id);
            const userDeps = userData.departamento.split(';') 
            const canEdit = (beneficiary && userDeps.includes(String(beneficiary.departamento)));
            const tipoCuenta = await ApprovalModel.GetTipoCuenta(pool);
            const monedas = beneficiary ? await ApprovalModel.GetBeneficiaryMonedas(pool, beneficiario_id) : [];
            res.json({ beneficiary: beneficiary || {}, canEdit, tipoCuenta, monedas });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error loading beneficiary' });
        }
    }


    static async renderBeneficiaryList(conection, req, res) {
        const UserID = req.session?.userID;
        const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam);

        try {
            const pool = await sql.connect(conection);
            const userData = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            const countries = await USERModel.getCountries(pool);
            const tipoCuenta = await ApprovalModel.GetTipoCuenta(pool);
            const monedas = await ApprovalModel.GetMonedas(pool);

            // Departments the user has access to
            const departments = await DepartamentModel.getDepartmentsByStringIds(pool, userData.departamento);
            const companies = await DepartamentModel.getCompaniesByStringIds(pool, userData.companies);

            res.render('approvals/beneficiary_list', {
                title: 'Beneficiary Manager',
                userProfile: {
                    UserName: userData.UserName,
                    UsuarioID: UserID,
                    Dep: userData.Dep,
                },
                countries: countries,
                tipoCuenta: tipoCuenta,
                monedas: monedas,
                compania: userData.compania,
                departments: departments.map(d => ({ id: d.id, nombre: d.nombre, ccompania: d.ccompania })),
                companies: companies,
                userMenu: userData.Menu,
                usuarios:grupousuarios,
                devteam: devteam,
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Error loading beneficiary list');
        }
    }

    static async listBeneficiaries(conection, req, res) {
        const { user, q = '', page = 1, limit = 15, dep_filter = null, estado = null } = req.body;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const { compania, companies, departamento, compania_nombre } = await USERModel.obtenerDatosUsuario(transaction, user);
            const companiesInfo = await DepartamentModel.getCompaniesByStringIds(transaction, companies);

            const department = await DepartamentModel.getDepartmentsByStringIds(transaction, departamento);
            const parsedPage  = Math.max(1, parseInt(page)  || 1);
            const parsedLimit = Math.min(Math.max(1, parseInt(limit) || 15), 100);
            const depIds = department.map(dep=> dep.id);
            const parsedDep    = dep_filter !== null && dep_filter !== '' ? parseInt(dep_filter)    : null;
            const parsedEstado = estado    !== null && estado    !== '' ? parseInt(estado)    : null;

            const { rows, total } = await ApprovalModel.ListBeneficiariesPaged(
                transaction, compania, companiesInfo, depIds, q, parsedPage, parsedLimit, parsedDep, parsedEstado
            );
            const departments = department.map(d => ({ id: d.id, nombre: d.nombre }));
            const data = rows.map(b => ({ ...b, edit: depIds.includes(b.departamento), compania_nombre: (companiesInfo.find(c => c.ccompania == b.compania)?.xnombre ?? b.compania), departamento: b.nombre_departamento }));
            await transaction.commit();
            res.status(200).json({ data, total, page: parsedPage, limit: parsedLimit, departments });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error(error);
            res.status(400).json({ error: error.message });
        }
    }

    static async createCrmFromChangeRequest(connection, req, res) {
        const { UserID, approval_id, form_id, asignados: asignadosRaw, cprioridad } = req.body;
        if (!UserID || !approval_id || !form_id) {
            return res.status(400).json({ result: 0, error: 'Missing required fields: UserID, approval_id, form_id' });
        }
        await sql.connect(connection);
        const transaction = new sql.Transaction();
        let asignados = asignadosRaw ? asignadosRaw.split(';').filter(s => s !== '') : [];
        let approvalFlowRuta = null;
        try {
            await transaction.begin();
            const user = await USERModel.obtenerDatosUsuario(transaction, UserID);
            const changeRequest = await ChangesControlModel.readFormById(transaction, form_id);
            if (!changeRequest) throw new Error('Change request not found');
            const log = await ApprovalModel.getLogById(transaction, approval_id);
            const approvalFlow = await ApprovalModel.getApprovalFlow(transaction, log.cflow);
            approvalFlowRuta = ApprovalFunctionsModel._getServerPath(approvalFlow.server, approvalFlow.location);

            for (let i = 0; i < asignados.length; i++) {
                const userData = await USERModel.obtenerDatosUsuario(transaction, asignados[i]);
                asignados[i] = { department: userData.Dep, code: userData.UserID, name: userData.UserName };
            }

            const prioridad = await CRMModel.getCRMPrioridad(transaction);
            const cprioridadNum = Number(cprioridad) || 0;
            const currentDate = new Date();
            const daysToAdd = prioridad.find(p => p.cprioridad === cprioridadNum)?.ndias || 1;
            const dueDate = new Date(currentDate.setDate(currentDate.getDate() + daysToAdd));

            const conversacion_titulo = changeRequest.title;
            const asunto_interno = `Change Request - ${changeRequest.collaborator_department}`;
            const description = changeRequest.report || '';

            const crmId = await CRMModel.createNewCase(
                transaction, user.UserEmail, asignados, description, cprioridadNum,
                conversacion_titulo, null, `${user.Dep};`, null, null,
                asunto_interno, null, dueDate, user.Dep
            );

            await CRMModel.createNewMessage(transaction, crmId, 'Change Request', description, 1, user.UserName, null);

            const linkReq = new sql.Request(transaction);
            await linkReq
                .input('crm_id', sql.Int, crmId)
                .input('approval_id', sql.Int, Number(approval_id))
                .query('INSERT INTO approval_crm_relations (crm_id, approval_id) VALUES (@crm_id, @approval_id)');

            await transaction.commit();

            // Copy Change Request PDF to CRM folder (non-transactional, best-effort)
            try {
                const { join } = await import('path');
                const { copyFileSync, existsSync, mkdirSync } = await import('fs');
                const crmDir = `//${process.env.file_server}/CRM/`;
                const crmMainDir = join(crmDir, String(crmId));
                const destDir = join(crmMainDir, '1');
                if (!existsSync(crmMainDir)) mkdirSync(crmMainDir);
                if (!existsSync(destDir)) mkdirSync(destDir);
                const sourcePdf = join(approvalFlowRuta, String(approval_id), 'Change Request.pdf');
                const destPdf = join(destDir, 'Change Request.pdf');
                copyFileSync(sourcePdf, destPdf);
                const pool = await sql.connect(connection);
                await pool.request()
                    .input('crm_id', sql.Int, crmId)
                    .input('id_msg', sql.Int, 1)
                    .input('xname', sql.VarChar, 'Change Request.pdf')
                    .query('INSERT INTO crm_archivos (id_main, id_msg, xname) VALUES (@crm_id, @id_msg, @xname)');
            } catch (fileErr) {
                console.error('Warning: Could not attach Change Request PDF to CRM:', fileErr.message);
            }

            for (const asignado of asignados) {
                try {
                    await postCRM(`${asignado.code}@acreinsurance.com`, null, null, asunto_interno, description, cprioridadNum, asignado.name, conversacion_titulo, crmId);
                } catch (notifyErr) {
                    console.error('Warning: Could not notify assignee:', notifyErr.message);
                }
            }

            res.json({ result: 1, crm_id: crmId });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error in createCrmFromChangeRequest:', error);
            res.status(500).json({ result: 0, error: error.message });
        }
    }

    static async previewBeneficiaryPdf(conection, req, res) {
        const { beneficiario_id, banco, moneda, monto, description, compania } = req.body;
        if (!beneficiario_id || !banco) return res.status(400).json({ error: 'Missing required fields' });
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const beneficiarioInfo = await ApprovalModel.GetBeneficiaryById(transaction, beneficiario_id);
            const approval_by_id = await ApprovalModel.getLogById(transaction, beneficiario_id);
            if (!beneficiarioInfo) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Beneficiary not found' });
            }
            const compId = compania || beneficiarioInfo.compania;
            const { language, xnombre, xheader } = await ApprovalModel.ReadCompanyLanguage(transaction, compId);
            const date = getAdjustedDateMultiple(language);
            const countries = await USERModel.getCountries(transaction);
            const tipoCuentaList = await ApprovalModel.GetTipoCuenta(transaction);
            const paisBenNombre = countries.find(c => String(c.cpais) === String(beneficiarioInfo.pais_beneficiario))?.xnombre_pais_ingles || beneficiarioInfo.pais_beneficiario || '';
            const paisIntNombre = countries.find(c => String(c.cpais) === String(beneficiarioInfo.pais_intermediario))?.xnombre_pais_ingles || beneficiarioInfo.pais_intermediario || '';
            const tipoCuentaNombre = tipoCuentaList.find(t => String(t.tipo_cuenta_id) === String(beneficiarioInfo.tipo_cuenta))?.tipo_cuenta || '';
            const tipoCuentaIntNombre = tipoCuentaList.find(t => String(t.tipo_cuenta_id) === String(beneficiarioInfo.tipo_cuenta_intermediario))?.tipo_cuenta || '';
            const pdfData = {
                ...beneficiarioInfo,
                pais_beneficiario: paisBenNombre,
                pais_intermediario: paisIntNombre,
                tipo_cuenta: tipoCuentaNombre,
                tipo_cuenta_intermediario: tipoCuentaIntNombre,
                company_name: xnombre,
                fecha_solicitud: date,
                banco: banco,
                monto: monto ? `${moneda} ${new Intl.NumberFormat('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(Number(monto))}` : '',
                concepto: description || '',
                solicitante: true,
                verificador: req.body.verificador,
                aprobador: req.body.aprobador,
                firmante: req.body.firmante,
                operador: req.body.operador,
                ejecutor: req.body.ejecutor,
            };
            const pdfBuffer = await generateBeneficiaryPdf(pdfData, language, '', xheader);
            const filename = language === 'ES'
                ? `Beneficiario - ${beneficiarioInfo.cuenta_banco_beneficiario}.pdf`
                : `Beneficiary - ${beneficiarioInfo.cuenta_banco_beneficiario}.pdf`;
            await transaction.commit();
            res.json({ pdf: pdfBuffer.toString('base64'), filename });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error generating beneficiary PDF preview:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async previewLuxemburgoPdf(conection, req, res) {
        const { beneficiario_id, moneda, monto, company  } = req.body;
        const correspondiente = req.body.correspondiente || req.body.description || '';
        if (!beneficiario_id || !moneda) return res.status(400).json({ error: 'Missing required fields' });
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const beneficiarioInfo = await ApprovalModel.GetBeneficiaryById(transaction, beneficiario_id);
            const transactionDetail = await ApprovalModel.getTransactionBank(transaction, company, moneda)
            if (!beneficiarioInfo) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Beneficiary not found' });
            }
            const pdfData = {
                moneda: moneda,
                cuenta_bancaria: beneficiarioInfo.cuenta_banco || '',
                monto: monto ? `${moneda} ${new Intl.NumberFormat('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(Number(monto))}` : '',
                monto_texto: montoEnPalabras(monto, moneda),
                a_favor_de: beneficiarioInfo.cuenta_banco_beneficiario || '',
                correspondiente: correspondiente || '',
                banco_beneficiario: beneficiarioInfo.banco_beneficiario || '',
                direcion_beneficiario: beneficiarioInfo.direcion_beneficiario || '',
                SWIFT: beneficiarioInfo.SWIFT || '',
                SORT: beneficiarioInfo.SORT || '',
                IBAN: beneficiarioInfo.IBAN || '',
                cuenta_banco_beneficiario: beneficiarioInfo.cuenta_banco_beneficiario || '',
                direccion: beneficiarioInfo.direccion || '',
                cuenta_banco: beneficiarioInfo.cuenta_banco || ''
            };
            const pdfBuffer = await generateLuxemburgo(pdfData, transactionDetail);
            const filename = `Transferencia_Luxemburgo_${moneda}.pdf`;
            await transaction.commit();
            res.json({ pdf: Buffer.from(pdfBuffer).toString('base64'), filename });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error generating Luxemburgo PDF preview:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async getCostCodes(conection, req, res) {
        const { cdepartment } = req.query;
        if (!cdepartment) return res.status(400).json({ error: 'cdepartment is required' });
        try {
            const pool = await sql.connect(conection);
            const costCodes = await ApprovalModel.getCostCodesByDepartment(pool, Number(cdepartment));
            res.json({ result: 1, costCodes });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async createCostCode(conection, req, res) {
        const UserID = req.session?.userID;
        const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam);
        if (!devteam) return res.status(403).json({ error: 'Only devteam members can create cost codes' });

        const { ccompany, cdepartment, xname } = req.body;
        if (!ccompany || !cdepartment || !xname) return res.status(400).json({ error: 'ccompany, cdepartment and xname are required' });

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const cost_id = await ApprovalModel.createCostCode(transaction, Number(ccompany), Number(cdepartment), xname, UserID);
            await transaction.commit();
            res.json({ result: 1, cost_id });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }

    static async getApprovalItems(conection, req, res) {
        const { appr_id } = req.query;
        if (!appr_id) return res.status(400).json({ error: 'appr_id is required' });
        try {
            const pool = await sql.connect(conection);
            const items = await ApprovalModel.getApprovalItems(pool, Number(appr_id));
            res.json({ result: 1, items });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async renderCostCodeList(conection, req, res) {
        const UserID = req.session?.userID;
        const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam);
        if (!devteam) return res.status(403).send('Access denied');

        try {
            const pool = await sql.connect(conection);
            const userData = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = await USERModel.getGroupUsers(pool);
            const departments = await ApprovalFunctionsModel.getAllDepartamentos(pool);
            const companies = await DepartamentModel.getCompaniesByStringIds(pool, userData.companies);

            res.render('approvals/cost_code_list', {
                title: 'Cost Code Manager',
                userProfile: {
                    UserName: userData.UserName,
                    UsuarioID: UserID,
                    Dep: userData.Dep,
                },
                departments: departments.map(d => ({ id: d.id, nombre: d.nombre, ccompania: d.ccompania })),
                companies: companies,
                userMenu: userData.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Error loading cost code list');
        }
    }

    static async listCostCodes(conection, req, res) {
        const UserID = req.session?.userID;
        const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam);
        if (!devteam) return res.status(403).json({ error: 'Access denied' });

        const { q = '', page = 1, limit = 15, dep_filter = null, company_filter = null, status_filter = null } = req.body;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const parsedPage  = Math.max(1, parseInt(page) || 1);
            const parsedLimit = Math.min(Math.max(1, parseInt(limit) || 15), 100);
            const parsedDep = dep_filter !== null && dep_filter !== '' ? parseInt(dep_filter) : null;
            const parsedCompany = company_filter !== null && company_filter !== '' ? parseInt(company_filter) : null;
            const parsedStatus = status_filter !== null && status_filter !== '' ? parseInt(status_filter) : null;

            const { rows, total } = await ApprovalModel.listCostCodesPaged(
                transaction, q, parsedPage, parsedLimit, parsedDep, parsedCompany, parsedStatus
            );
            const departments = await ApprovalFunctionsModel.getAllDepartamentos(transaction);
            await transaction.commit();
            res.status(200).json({
                data: rows,
                total,
                page: parsedPage,
                limit: parsedLimit,
                departments: departments.map(d => ({ id: d.id, nombre: d.nombre }))
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error(error);
            res.status(400).json({ error: error.message });
        }
    }

    static async getCostCodeDetail(conection, req, res) {
        const UserID = req.session?.userID;
        const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam);
        if (!devteam) return res.status(403).json({ error: 'Access denied' });

        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id is required' });

        try {
            const pool = await sql.connect(conection);
            const costCode = await ApprovalModel.getCostCodeById(pool, Number(id));
            if (!costCode) return res.status(404).json({ error: 'Cost code not found' });
            res.json({ result: 1, costCode });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async saveCostCode(conection, req, res) {
        const UserID = req.session?.userID;
        const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam);
        if (!devteam) return res.status(403).json({ error: 'Only devteam members can manage cost codes' });

        const { cost_id, ccompany, cdepartment, xname, status } = req.body;
        if (!ccompany || !cdepartment || !xname) return res.status(400).json({ error: 'ccompany, cdepartment and xname are required' });

        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            let resultId;
            if (cost_id) {
                await ApprovalModel.updateCostCode(transaction, Number(cost_id), {
                    ccompany: Number(ccompany),
                    cdepartment: Number(cdepartment),
                    xname,
                    status: status !== undefined ? Number(status) : 1
                }, UserID);
                resultId = cost_id;
            } else {
                resultId = await ApprovalModel.createCostCode(transaction, Number(ccompany), Number(cdepartment), xname, UserID);
            }
            await transaction.commit();
            res.json({ result: 1, cost_id: resultId });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }
}

