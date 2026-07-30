import sql from 'mssql';
import Rules from '../../USERS/rule/DevTeam.js';
import USERModel from '../../USERS/model/USER.js';
import EventsModel from '../model/events.js';
import BadacoModel from '../model/BadacoModel.js';
import FormsModel from '../../FORMS/models/forms.js';
import ApprovalModel from '../../APPROVALS/model/approvals.js';
import DepartamentModel from '../../Departaments/model/Departament.js';
import { getAdjustedDate } from '../../Middleware/validateUserId.js';
import { compareEventData } from '../functions.js';
import DashboardController from '../../USERS/controllers/Dashboard.js';
import { generatePdf } from '../functions.js';
import ApprovalFunctionsModel from '../../Approvals_functions/models/approval_functions.js';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
export default class EventsController {

    static async getInitialEvents(conection, req, res) {
        const UserID = req.session?.userID;
        let devteam = await Rules.validateTeam(req.session?.iddevteam, UserID)
        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            // Renderizar la vista
            res.render("marketing/forms_marketing_events_list", {
                title: "Events",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                    Dep: usuario.Dep,
                    cdepartamento: usuario.cdepartamento,
                },
                userMenu: usuario.Menu,
                usuarios: grupousuarios, 
                devteam: devteam
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async getEventsFormList(conection, req, res) {
            const UserID = req.session?.userID
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 15;
            const category = req.query.category || null;
            const status = req.query.status || null;
            const search = req.query.search || null;
            const offset = (page - 1) * limit;
            let departmentAccess=[]
            let devteam = await Rules.validateMarketingModule(req.session?.iddevteam, UserID)
            const pool = await sql.connect(conection);
            try {
                const getAllDepartments = await USERModel.getAllDepartments(pool);
                const UserInfo = await USERModel.obtenerDatosUsuario(pool, UserID);
                // const { manager, suplente, parent_of } = await USERModel.getAreaSupervisor(pool, UserInfo.Dep);
                // if (parent_of && manager == UserID || parent_of && suplente == UserID) {
                //     const orderParentOf = parent_of.split(';');
                //     for (let i = 0; i < orderParentOf.length; i++) {
                //          let department = getAllDepartments.filter(department => department.id == orderParentOf[i])
                //          departmentAccess.push(department[0].nombre)
                //         }
    
                //     }
                const formData = await EventsModel.readforms(pool, limit, offset, devteam, UserID, category, status, search);
                const totalCount = await EventsModel.totalCount(pool, devteam, UserID, category, status, search);
                res.send({ formData, totalCount: totalCount.recordset[0].totalCount });
    
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
    }
    static async getEventsForm(conection, req, res) {
        const UserID = req.session?.userID;
        const formName = "Events Form";
        let devteam = await Rules.validateTeam(req.session?.iddevteam,UserID)
        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            const countries = await USERModel.getCountries(pool);
            const users = await USERModel.getAllUserActive(pool, usuario.compania);
            const events = await EventsModel.getEvents(pool);
            const mform = await FormsModel.getMasterForm(pool, formName);
            const approvalFlow = await ApprovalModel.getApprovalFlowByName(pool, mform[0].name);
            // Renderizar la vista
            res.render("marketing/forms_marketing_events", {
                title: "Events",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                    Dep: usuario.Dep,
                    cdepartamento: usuario.cdepartamento,
                },
                approvalFlow: approvalFlow,
                countries: countries,
                events: events,
                users: users,
                userMenu: usuario.Menu,
                usuarios: grupousuarios, 
                devteam: devteam,
                mform: mform,
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
   static async postEventsForm(conection, req, res) {
        const {verificador, aprobador, firmante, ejecutor, operador, cusuario, approval_name, status, solicitante,
        category, country, city, objective, event_name, start_date, end_date, estimated_budget, participants_number, comments  } = req.body;
        const participants = req.body.participants;
        const meetings = req.body.meetings;
        let participantsParse = JSON.parse(participants);
        let meetingsParse = JSON.parse(meetings);
        req.files = req.files || {};
        req.files.Supportfiles = req.files.files || [];
        if (!category || !country || !city || !objective || !estimated_budget || !participants_number) {
        return res.status(400).json({ error: "Missing required fields... fields: category, country, city, objective, estimated_budget, participants_number" });
    }
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const mform = await FormsModel.getMasterForm(transaction, approval_name);
            const approvalFlow = await ApprovalModel.getApprovalFlowByName(transaction, mform[0].name)
            const company =  approvalFlow.ccompania.length > 1? approvalFlow.ccompania[0] : approvalFlow.ccompania
            const department = await DepartamentModel.getDepartmentById(transaction, approvalFlow.cdepartamento);
            const getIntegrants = await USERModel.findUserNamesById(transaction, req.body);
            const events = await EventsModel.postEvents(transaction, cusuario, solicitante, category, country, city, objective, event_name, start_date, end_date, estimated_budget, participants_number, comments);
            const eventparticipants = await EventsModel.postParticipants(transaction, events.id, participantsParse);
            const eventmeetings = await EventsModel.postMeetings(transaction, events.id, meetingsParse, cusuario);
            const detalle_proceso = category + ' - ' + event_name + ' - ' + country
            const date = getAdjustedDate();
            const log = await ApprovalModel.ApprovalCreation(transaction, category, detalle_proceso, department.nombre, solicitante, date, getIntegrants.verificador, getIntegrants.aprobador, firmante, ejecutor, status, null, null, cusuario, null, null, operador, 'N/A', approvalFlow.id , company, req, approvalFlow.server, approvalFlow.location, mform[0].id, events.id);
            await EventsModel.updateFormWithLogId(transaction, events.id, log);

            // Generate the PDF file
            const filenamePdf = await generatePdf(req.body, log, getIntegrants.aprobador);

            // Ensure the directory exists or create it
            const basePath = ApprovalFunctionsModel._getServerPath(approvalFlow.server, approvalFlow.location);
            const directoryPath = `${basePath}${log}`;
            await fs.mkdir(directoryPath, { recursive: true });

            // Define the file path and write the PDF content
            const filePath = `${directoryPath}/${category}.pdf`;
            const file = createWriteStream(filePath);
            file.write(filenamePdf);
            file.end();

            // Wait for the file to finish writing
            await new Promise((resolve, reject) => {
                file.on('finish', resolve);
                file.on('error', reject);
            });

            // Insert the file into the approval system
            let InsertFileApprovalresult = await ApprovalFunctionsModel.insertFileApproval(transaction,log,department.nombre,category,`${category}.pdf`,1,approvalFlow.id);

            // Validate the insertion result
            if (!InsertFileApprovalresult) {
                throw { status: 400, message: `Failed to insert ${category}.pdf file.` };
            }

            // Commit the transaction
            await transaction.commit();
            res.send({ id: log });
        } catch (error) { 
            try { await transaction.rollback(); } catch (_) {}
            req.body.UsuarioID = req.body.solicitante;
            req.error = error.message;
            await DashboardController.createErrorLog(conection, req, res);
        }
    }
    static async readFormById(conection, req, res) {
            const UserID = req.session?.userID;
            const id = req.params.id
            let devteam = await Rules.validateTeam(req.session.iddevteam, UserID)
            const read = req.query.read;
            const pool = await sql.connect(conection);
    
            try {
                const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
                const users = await USERModel.getAllUserActive(pool, usuario.compania);
                const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
                const managerData = await USERModel.getManagerData(pool, usuario.Manager);
                const formData = await EventsModel.readFormById(pool, id);
                const eventParticipants = await EventsModel.readFormParticipantsById(pool, formData.id);
                const eventMeetings = await EventsModel.readFormEventById(pool, formData.id, formData.category);
                const resume  = await EventsModel.getResumeByEventId(pool, formData.id);
                const actions = await EventsModel.getMeetingActions(pool, formData.id);
                const contacts = await BadacoModel.getContactsForPicker(pool);
                const actionContactsRaw = await EventsModel.getActionContactsByEvent(pool, formData.id);
                const actionResponsiblesRaw = await EventsModel.getActionResponsiblesByEvent(pool, formData.id);
                // Build actionContacts map: { actionId: [{ contact_id, contact_name, company_name }] }
                const actionContacts = {};
                actionContactsRaw.forEach(function(row) {
                    const key = String(row.meeting_action_id);
                    if (!actionContacts[key]) actionContacts[key] = [];
                    actionContacts[key].push({ contact_id: row.contact_id, name: row.contact_name, company_name: row.company_name || '' });
                });
                // Build actionResponsibles map: { actionId: [responsible] }
                const actionResponsibles = {};
                actionResponsiblesRaw.forEach(function(row) {
                    const key = String(row.meeting_action_id);
                    if (!actionResponsibles[key]) actionResponsibles[key] = [];
                    actionResponsibles[key].push(row.responsible);
                });
                // Renderizar la vista
                res.render("marketing/forms_marketing_events_details", {
                    title: `Event  #${id}`,
                    formData: formData,
                    userProfile: {
                        UserName: usuario.UserName,
                        UsuarioID: UserID,
                        Dep: usuario.Dep,
                        cdepartamento: usuario.cdepartamento,
                        manager: managerData,
                    },
                    users: users,
                    participants: eventParticipants,
                    meetings: eventMeetings,
                    resume: resume,
                    actions: actions,
                    contacts: contacts,
                    actionContacts: actionContacts,
                    actionResponsibles: actionResponsibles,
                    read: read,
                    userMenu: usuario.Menu,
                    usuarios: grupousuarios,
                    devteam: devteam,
                    iddevteam: req.session?.iddevteam || null,
                });
    
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
    }
    static async getFormById(conection, req, res) {
        const UserID = req.session?.userID;
        const id = req.params.id
        let devteam = await Rules.validateTeam(req.session.iddevteam, UserID)
        const read = req.query.read;
        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            const managerData = await USERModel.getManagerData(pool, usuario.Manager);
            const formData = await EventsModel.readFormById(pool, id);
            const eventParticipants = await EventsModel.readFormParticipantsById(pool, formData.id);
            const eventMeetings = await EventsModel.readFormEventById(pool, formData.id, formData.category);
            const log = await ApprovalModel.getLogById(pool, formData.log_id);
            // Renderizar la vista
            res.send({
                formData: formData,
                participants: eventParticipants,
                meetings: eventMeetings,
                read: read,
                approval: log.id,
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async updateEventForm(conection, req, res) {
        const id = Number(req.params.id);
        const formData = req.body;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const changes = compareEventData(formData.initial_events, formData);
            const makeUpdate = await EventsModel.updateFormEvent(transaction, id, formData.user, formData, changes);
            await transaction.commit();
            res.send({ makeUpdate });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            req.error = error.message;
            req.body.UsuarioID = formData.user;
            DashboardController.createErrorLog(conection, req, res);
        }
    }
    static async updateEventPDF(conection, req, res) {        const id = Number(req.params.id);
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const formData = await EventsModel.readFormById(transaction, id);
            const log = await ApprovalModel.getLogById(transaction, formData.log_id);
            const approvalFlow = await ApprovalModel.getApprovalFlow(transaction, log.cflow);
            const eventParticipants = await EventsModel.readFormParticipantsById(transaction, formData.id);
            const eventMeetings = await EventsModel.readFormEventById(transaction, formData.id);
            
            const body= {...formData, participants:eventParticipants,  meetings:eventMeetings};
            const filenamePdf = await generatePdf(body, log.id, log.aprobador);
            const basePath = ApprovalFunctionsModel._getServerPath(approvalFlow.server, approvalFlow.location);
            const directoryPath = `${basePath}${log.id}`;
            await fs.mkdir(directoryPath, { recursive: true });
            const filePath = log.estado == "Approved" ? `${directoryPath}/${formData.category} - Modified After Approval.pdf` : `${directoryPath}/${formData.category}.pdf`;
            if(log.estado == "Approved"){
                const file = createWriteStream(filePath);
                file.write(filenamePdf);
                file.end();
    
                await new Promise((resolve, reject) => {
                    file.on('finish', resolve);
                    file.on('error', reject);
                });
                    let InsertFileApprovalresult = await ApprovalFunctionsModel.insertFileApproval(transaction, log.id, log.departamento, formData.category, `${formData.category} - Modified After Approval.pdf`, 0, approvalFlow.id);
                if (!InsertFileApprovalresult) {
                    throw { status: 400, message: `Failed to insert ${category}.pdf file.` };
                }
            } else {
                await fs.writeFile(filePath, filenamePdf);
            }

            await transaction.commit();
            res.send({ result: 1, message: 'PDF updated successfully.' });
            
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ result: 0, error: error.message });
        }
    }

    static async getEventReport(conection, req, res) {
        const UserID   = req.session?.userID;
        const id       = req.params.id;
        let devteam    = await Rules.validateTeam(req.session?.iddevteam, UserID);
        const pool = await sql.connect(conection);
        try {
            const usuario        = await USERModel.obtenerDatosUsuario(pool, UserID);
            const users          = await USERModel.getAllUserActive(pool, usuario.compania);
            const grupousuarios  = devteam ? await USERModel.getGroupUsers(pool) : [];
            const formData       = await EventsModel.readFormById(pool, id);
            const participants   = await EventsModel.readFormParticipantsById(pool, formData.id);
            const meetings       = await EventsModel.readFormEventById(pool, formData.id);
            const resume         = await EventsModel.getResumeByEventId(pool, formData.id);
            const actions        = await EventsModel.getMeetingActions(pool, formData.id);
            res.render('marketing/forms_marketing_events_report', {
                title:       'Event Report',
                formData,
                userProfile: {
                    UserName:      usuario.UserName,
                    UsuarioID:     UserID,
                    Dep:           usuario.Dep,
                    cdepartamento: usuario.cdepartamento,
                },
                participants,
                meetings,
                resume,
                actions,
                users,
                userMenu:   usuario.Menu,
                usuarios:   grupousuarios,
                devteam,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getReportData(conection, req, res) {
        const id = req.params.id;
        const pool = await sql.connect(conection);
        try {
            const resume  = await EventsModel.getResumeByEventId(pool, id);
            const actions = await EventsModel.getMeetingActions(pool, id);
            res.send({ resume, actions });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async saveResume(conection, req, res) {
        const { event_id, uingreso, comments } = req.body;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const result = await EventsModel.upsertResume(transaction, event_id, uingreso, comments);
            await transaction.commit();
            res.send(result);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }

    static async saveMeetingAction(conection, req, res) {
        const data   = { ...req.body, uingreso: req.body.user_id  };
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const result = await EventsModel.upsertMeetingAction(transaction, data);
            await transaction.commit();
            res.send(result);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }

    static async deleteMeetingAction(conection, req, res) {
        const id = req.params.id;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const result = await EventsModel.deleteMeetingAction(transaction, id);
            await transaction.commit();
            res.send(result);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }

    static async updateMeetingAction(conection, req, res) {
        const id = req.params.id;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const result = await EventsModel.updateMeetingAction(transaction, id, req.body);
            await transaction.commit();
            res.send(result);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }

    static async saveActionContact(conection, req, res) {
        const { meeting_action_id, contact_id } = req.body;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const result = await EventsModel.addActionContact(transaction, meeting_action_id, contact_id);
            await transaction.commit();
            res.send(result);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }

    static async deleteActionContact(conection, req, res) {
        const { meeting_action_id, contact_id } = req.body;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const result = await EventsModel.removeActionContact(transaction, meeting_action_id, contact_id);
            await transaction.commit();
            res.send(result);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }

    static async saveActionResponsible(conection, req, res) {
        const { meeting_action_id, responsible } = req.body;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const result = await EventsModel.addActionResponsible(transaction, meeting_action_id, responsible);
            await transaction.commit();
            res.send(result);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }

    static async deleteActionResponsible(conection, req, res) {
        const { meeting_action_id, responsible } = req.body;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const result = await EventsModel.removeActionResponsible(transaction, meeting_action_id, responsible);
            await transaction.commit();
            res.send(result);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }

    static async closeReport(conection, req, res) {
        const UserID        = req.session?.userID || req.body.user_id ;
        const event_id      = req.params.id;
        const departamento  = req.body.departamento;
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const {UserEmail} = await USERModel.obtenerDatosUsuario(transaction, UserID);
            const result = await EventsModel.closeReport(transaction, event_id, UserID, departamento, UserEmail);
            await transaction.commit();
            res.send(result);
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }
}
