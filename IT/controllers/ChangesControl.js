import sql from 'mssql';
import ExcelJS from 'exceljs';
import Rules from '../../USERS/rule/DevTeam.js';
import USERModel from '../../USERS/model/USER.js';
import DashboardController from "../../USERS/controllers/Dashboard.js";
import ChangesControlModel from '../model/ChangesControl.js';
import ApprovalModel from '../../APPROVALS/model/approvals.js';
import FormsModel from '../../FORMS/models/forms.js';
import DepartamentModel from '../../Departaments/model/Departament.js';
import { generatePDF } from '../generateChangeRequest.js'
import { getAdjustedDate } from '../../Middleware/validateUserId.js';
import ApprovalFunctionsModel from '../../Approvals_functions/models/approval_functions.js';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
export default class SoftwareChangeRequestController {

    static async getInitialView(conection, req, res) {
        const UserID = req.session?.userID;
        const formName = "Change Request";
        const devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);
        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.findDevTeam(pool, UserID) : [];      
            const mform = await FormsModel.getMasterForm(pool, formName);
            const approvalFlow = await ApprovalModel.getApprovalFlowByName(pool, mform[0].name);
            const department = await DepartamentModel.getDepartmentNameById(pool, usuario.Dep);
            res.render("IT/forms_it_change_request_list", {
                title: "Change Request",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                    Dep: usuario.departamentoOrigen,
                    cdepartamento: usuario.cdepartamento,
                    department: department ? department.nombre : '',
                },
                userMenu: usuario.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
                mform: mform,
                approvalFlow: approvalFlow,
            });
            } catch (error) {
            req.session.iddevteam = devteam;
            req.body.UsuarioID = UserID;
            req.error= error.message;
            await DashboardController.createErrorLog(conection, req, res);
        }
    }
    static async getEventsFormList(conection, req, res) {
        const UserID = req.session?.userID;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const aplication = req.query.application_name || null;
        const status = req.query.status || null;
        const search = req.query.search || null;
        const year = req.query.year || null;
        const offset = (page - 1) * limit;
        let departmentAccess=[]
        let devteam = await Rules.validateChangeRequestModule(req.session?.iddevteam, UserID)
        const pool = await sql.connect(conection);
        try {
            const getAllDepartments = await USERModel.getAllDepartments(pool);
            const UserInfo = await USERModel.obtenerDatosUsuario(pool, UserID);
            const formData = await ChangesControlModel.readforms(pool, limit, offset, devteam, UserID, aplication, status, search, year);
            const totalCount = await ChangesControlModel.totalCount(pool, devteam, UserID, aplication, status, search, year);
            res.send({ formData, totalCount: totalCount.recordset[0].totalCount });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
}

   static async postEventsForm(conection, req, res) {
        const {verificador, aprobador, firmante, ejecutor, operador, cusuario, approval_name, solicitante,
        application_name, collaborator_name, collaborator_department, priority, type, title, report, functions, fields, comments } = req.body;
        let status = req.body.status;

        req.files = req.files || {};
        req.files.Supportfiles = req.files.files || [];
        if (!application_name  || !priority || !type || !title) {
        return res.status(400).json({ error: "Missing required fields... fields: application_name, priority, type, title" });
    }
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const mform = await FormsModel.getMasterForm(transaction, approval_name);
            const usuario = await USERModel.obtenerDatosUsuario(transaction, cusuario);
            const approvalFlow = await ApprovalModel.getApprovalFlowByName(transaction, mform[0].name)
            const company =  approvalFlow.ccompania.length > 1? approvalFlow.ccompania[0] : approvalFlow.ccompania
            const department = await DepartamentModel.getDepartmentById(transaction, approvalFlow.cdepartamento);
            const managerDepartment = await DepartamentModel.getDepartmentById(transaction, usuario.Dep);
            const areaSupervisor = await USERModel.obtenerDatosUsuario(transaction, managerDepartment.manager);
            let getIntegrants = await USERModel.findUserNamesById(transaction, req.body, areaSupervisor.UserName);
            getIntegrants.verificador === getIntegrants.aprobador ? getIntegrants.verificador = "N/A" : getIntegrants.verificador;
            getIntegrants.verificador === 'N/A'? status = 'Approve' : status;
            const basePath = ApprovalFunctionsModel._getServerPath(approvalFlow.server, approvalFlow.location);
            const changes = await ChangesControlModel.postEvents(transaction, cusuario, solicitante, collaborator_department , application_name, priority, type, title, report, functions, fields, comments, status);
            const detalle_proceso = 'Changes required for ' + application_name + ' - ' + type + ' - ' + title;
            const date = getAdjustedDate();
            const log = await ApprovalModel.ApprovalCreation(transaction, approvalFlow.nombre, detalle_proceso, department.nombre, solicitante, date, getIntegrants.verificador, getIntegrants.aprobador, firmante, ejecutor, status, null, null, cusuario, null, null, operador, 'N/A', approvalFlow.id , company, req, basePath, mform[0].id, changes.id);
            const directoryPath = `${basePath}${log}`;
            await ChangesControlModel.updateFormWithLogId(transaction, changes.id, log);

            // Generate the PDF file
            const filenamePdf = await generatePDF(req.body, log, getIntegrants.verificador, getIntegrants.aprobador, changes.id);

            // Ensure the directory exists or create it
            await fs.mkdir(directoryPath, { recursive: true });

            // Define the file path and write the PDF content
            const filePath = `${directoryPath}/Change Request.pdf`;
            const file = createWriteStream(filePath);
            file.write(filenamePdf);
            file.end();

            // Wait for the file to finish writing
            await new Promise((resolve, reject) => {
                file.on('finish', resolve);
                file.on('error', reject);
            });

            // Insert the file into the approval system
            let InsertFileApprovalresult = await ApprovalFunctionsModel.insertFileApproval(transaction,log,department.nombre,`Change Request`,`Change Request.pdf`,1,approvalFlow.id);

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

    static async downloadExcel(conection, req, res) {
        const UserID = req.session?.userID;
        const application_name = req.query.application_name || null;
        const status = req.query.status || null;
        const search = req.query.search || null;
        const year = req.query.year || null;
        let devteam = await Rules.validateChangeRequestModule(req.session?.iddevteam, UserID);

        const pool = await sql.connect(conection);
        try {
            const rows = await ChangesControlModel.readAllForExport(pool, devteam, UserID, application_name, status, search, year);

            if (!rows || rows.length === 0) {
                return res.status(404).json({ error: 'No data found for the selected filters.' });
            }

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Change Requests');

            // Title row
            worksheet.mergeCells('A1:I1');
            const titleCell = worksheet.getCell('A1');
            titleCell.value = 'Change Requests';
            titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00586F' } };
            worksheet.getRow(1).height = 24;
            worksheet.addRow([]);

            // Header row
            const columns = [
                { header: 'ID',              key: 'id',              width: 8  },
                { header: 'Approval ID',     key: 'log_id',          width: 12 },
                { header: 'Collaborator',    key: 'collaborator_name',width: 22 },
                { header: 'Application',     key: 'application_name', width: 16 },
                { header: 'Priority',        key: 'priority',         width: 12 },
                { header: 'Type',            key: 'type',             width: 16 },
                { header: 'Title',           key: 'title',            width: 35 },
                { header: 'Date Created',    key: 'date_created',     width: 18 },
                { header: 'Status',          key: 'approval_status',  width: 14 },
            ];
            
            // Set column widths
            columns.forEach((col) => {
                const colIndex = columns.indexOf(col) + 1;
                worksheet.getColumn(colIndex).width = col.width;
            });

            // Add header row at row 3
            const headerRow = worksheet.getRow(3);
            columns.forEach((col, i) => {
                const cell = headerRow.getCell(i + 1);
                cell.value = col.header;
                cell.font = { bold: true, color: { argb: 'FF0D2333' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = { bottom: { style: 'thin', color: { argb: 'FFAAC5D0' } } };
            });
            headerRow.height = 18;

            // Data rows
            rows.forEach((item, index) => {
                const row = worksheet.insertRow(index + 4, [
                    item.id, item.log_id, item.collaborator_name, item.application_name,
                    item.priority, item.type, item.title, item.date_created,
                    item.approval_status,
                ]);
                row.eachCell(cell => {
                    cell.alignment = { vertical: 'middle' };
                    cell.border = { bottom: { style: 'hair', color: { argb: 'FFE0E8ED' } } };
                });
                if (index % 2 === 1) {
                    row.eachCell(cell => {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FA' } };
                    });
                }
            });

            const yearLabel = year ? `_${year}` : '';
            const appLabel  = application_name ? `_${application_name}` : '';
            const filename  = `change_requests${appLabel}${yearLabel}.xlsx`;

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async readFormByIdJson(conection, req, res) {
        const UserID = req.session?.userID;
        const id = req.params.id;
        const pool = await sql.connect(conection);
        try {
            const formData = await ChangesControlModel.readFormById(pool, id);
            res.json({ formData });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async getFormById(conection, req, res) {
        const UserID = req.session?.userID;
        const id = req.params.id
        let devteam = await Rules.validateTeam(req.session?.iddevteam, UserID)
        const read = req.query.read;
        await sql.connect(conection);
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();
            const usuario = await USERModel.obtenerDatosUsuario(transaction, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(transaction) : [];
            const managerData = await USERModel.getManagerData(transaction, usuario.Manager);
            const formData = await EventsModel.readFormById(transaction, id);
            const eventParticipants = await EventsModel.readFormParticipantsById(transaction, formData.id);
            const eventMeetings = await EventsModel.readFormEventById(transaction, formData.id, formData.category);
            const log = await ApprovalModel.getLogById(transaction, formData.log_id);
            await transaction.commit();
            // Renderizar la vista
            res.send({
                formData: formData,
                participants: eventParticipants,
                meetings: eventMeetings,
                read: read,
                approval: log.id,
            });

        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
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
}