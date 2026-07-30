
// here are the functions that are used to create, update and read performance review /form_hr_performance_review
import sql from 'mssql';
import { sqlConfig } from '../../../dbConfig.js';
import { ApprovalCreationVesion2, asignacion_integrates } from '../../../functions.js';
import {convertToDate} from '../../../Approvals_functions/functions.js';
import ApprovalFunctionsModel from '../../../Approvals_functions/models/approval_functions.js';
export default class PersonnelRequisitionModel {
    constructor() { }

    /**
     * Finds the correct Personnel Requisition approval flow for a user based on their department and company.
     */
    static async getPersonnelRequisitionFlow(transaction, userDepartmentId, userCompania) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT * FROM approvals_flow
            WHERE nombre = 'Personnel Requisition Form'
              AND estado = 1
              AND origen = 'DASHBOARD'
            ORDER BY cdepartamento DESC;
        `;
        const { recordset } = await request.query(query);
        if (!recordset || recordset.length === 0) return null;


        return recordset[0] || null;
    }

    /**
     * Resolves actors for a Personnel Requisition flow.
     */
    static resolveActors(flow, users, userDepartment, username, allDepartments) {
        const effectiveDepartment = allDepartments.find(d => d.id === flow.cdepartamento);

        const [procesos, estados] = asignacion_integrates(
            flow, users, effectiveDepartment || {}, username,
            flow.id, flow.nombre, [], allDepartments
        );

        return { procesos, estados };
    }

    static async getMasterForm(transaction, formName) {
        const request = new sql.Request(transaction);
        const query = `SELECT id, table_name, name FROM mform WHERE name = @formName`;
        request.input('formName', sql.VarChar, formName);
        const { recordset } = await request.query(query);
        return recordset;
    }
    
    static async getManagerData(transaction, Manager) {
        const request = new sql.Request(transaction);
        const query = `SELECT Name, UserID, xcargo FROM Users WHERE UserID = @Manager`;
        request.input('Manager', sql.VarChar, Manager);
        const { recordset } = await request.query(query);
        return recordset;
    }

    static async getAllCompanies(transaction, idsCompanies) {
        const idList = idsCompanies.split(';').map(id => parseInt(id, 10));
        const request = new sql.Request(transaction);
    
        if (idList.length === 0) {
            return []; 
        }
    
        idList.forEach((id, index) => {
            request.input(`id${index}`, sql.VarChar, id);
        });
        const placeholders = idList.map((_, index) => `@id${index}`).join(',');
        const query = `SELECT ccompania, xnombre 
                       FROM companias 
                       WHERE ccompania IN (${placeholders}) 
                       AND xnombre IS NOT NULL`;
    
        const { recordset } = await request.query(query);
        return recordset;
    }

    static async createForm(transaction, userId, body) {
        let formId = null;
        let effectiveDate = body.effectiveDate ? convertToDate(body.effectiveDate) : null;
        let expectedStartDate = body.expectedStartDate ? convertToDate(body.expectedStartDate) : null;
        const request = new sql.Request(transaction);
            const { recordset } = await request
            .input('requestorName', sql.NVarChar, body.requestorName)
            .input('requestorPosition', sql.NVarChar, body.requestorPosition)
            .input('reasonForRequisition', sql.NVarChar, body.reasonForRequisition)
            .input('effectiveDate', sql.Date, effectiveDate) 
            .input('expectedStartDate', sql.Date, expectedStartDate)
            .input('supportOrBussineesNotes', sql.NVarChar, body.supportOrBussineesNotes) 
            .input('reasonNotes', sql.NVarChar, body.reasonNotes || null) 
            .input('replaceWho', sql.NVarChar, body.replaceWho || null) 
            .input('businessCaseIsAttached', sql.Bit, body.businessCaseIsAttached || "0")
            .input('positionType', sql.NVarChar, body.positionType)
            .input('positionJobTitle', sql.NVarChar, body.positionJobTitle)
            .input('area', sql.NVarChar, body.area)
            .input('location', sql.NVarChar, body.location)
            .input('availableDeskOffice', sql.NVarChar, body.availableDeskOffice)
            .input('attachedDescription', sql.NVarChar, body.attachedDescription)
            .input('notesObservationsRequirements', sql.NVarChar, body.notesObservationsRequirements)
            .input('minCompensationRange', sql.Decimal, body.minCompensationRange)  
            .input('avegareCompensationRange', sql.Decimal, body.avegareCompensationRange)  
            .input('maxCompensationRange', sql.Decimal, body.maxCompensationRange) 
            .input('rangeInfoSource', sql.NVarChar, body.rangeInfoSource) 
            .input('benefits', sql.NVarChar, body.benefits) 
            .input('annualBonus', sql.NVarChar, body.annualBonus) 
            .input('benefitsNotes', sql.NVarChar, body.benefitsNotes) 
            .input('source', sql.NVarChar, body.source || null)
            .input('preIndentifyCandidate', sql.NVarChar, body.preIndentifyCandidate || null) 
            .input('headhunter', sql.NVarChar, body.headhunter || null) 
            .input('notesSourceRequiriments', sql.NVarChar, body.notesSourceRequiriments || null) 
            .input('userCreated', sql.NVarChar, userId)            
            .query(`
                INSERT INTO forms_hr_personnel_requisition (
                    requestorName,
                    requestorPosition,
                    reasonForRequisition,
                    effectiveDate,
                    expectedStartDate,
                    supportOrBussineesNotes,
                    reasonNotes,
                    replaceWho,
                    businessCaseIsAttached,
                    positionType,
                    positionJobTitle,
                    area,
                    location,
                    availableDeskOffice,
                    attachedDescription,
                    notesObservationsRequirements,
                    minCompensationRange,
                    avegareCompensationRange,
                    maxCompensationRange,
                    rangeInfoSource,
                    benefits,
                    annualBonus,
                    benefitsNotes,
                    source,
                    preIndentifyCandidate,
                    headhunter,
                    notesSourceRequiriments,
                    userCreated
                ) OUTPUT INSERTED.ID VALUES (
                    @requestorName,
                    @requestorPosition,
                    @reasonForRequisition,
                    @effectiveDate,
                    @expectedStartDate,
                    @supportOrBussineesNotes,
                    @reasonNotes,
                    @replaceWho,
                    @businessCaseIsAttached,
                    @positionType,
                    @positionJobTitle,
                    @area,
                    @location,
                    @availableDeskOffice,
                    @attachedDescription,
                    @notesObservationsRequirements,
                    @minCompensationRange,
                    @avegareCompensationRange,
                    @maxCompensationRange,
                    @rangeInfoSource,
                    @benefits,
                    @annualBonus,
                    @benefitsNotes,
                    @source,
                    @preIndentifyCandidate,
                    @headhunter,
                    @notesSourceRequiriments,
                    @userCreated
                );
            `);
            formId = recordset[0].ID;
            return formId;
    }

    static async handleApprovals(transaction, req, formId, date, userId) {
        try {
        let RowID;
            const username = userId
            const approvalData = req.body;
            const approvalsSelect = Number(approvalData.approvals_select);
            const compania = Number(approvalData.compania);
            const verificador = approvalData.verificador;
            const ejecutor = approvalData.ejecutor;
            const aprobador = approvalData.aprobador;
            const firmante = approvalData.firmante;
            const operador = approvalData.operador;
            const proceso = approvalData.proceso;
            const request = new sql.Request(transaction);
            const { recordsets } = await request.query(`
                SELECT * FROM approvals_flow AS a 
                LEFT JOIN companias AS c ON c.ccompania = a.ccompania 
                WHERE id = ${approvalsSelect}
            `);

            if (!recordsets.length || !recordsets[0].length) {
                console.error('No approvals flow found for the specified ID.');
                return null;
            }
            const approvalsruta = ApprovalFunctionsModel._getServerPath(recordsets[0][0].server, recordsets[0][0].location);
            const departmentRequest = new sql.Request(transaction);
            const departamentsResult = await departmentRequest.query(`
                SELECT * FROM departamentos WHERE id = ${recordsets[0][0].cdepartamento}
            `);

            const departamentName = departamentsResult.recordset[0].nombre;
            const detalleProceso = proceso + " - " + approvalData.reasonForRequisition + " - " + approvalData.positionJobTitle;

            // Call the function to create approval record
            const resolved = await ApprovalCreationVesion2(sqlConfig, proceso, detalleProceso, departamentName, approvalData.xnombre, date, verificador, aprobador, firmante, ejecutor, approvalData.estado, null, null, username, null, null, operador, 'N/A', approvalsSelect,  compania, req, approvalsruta, approvalData.mform, formId       
            );

            RowID = resolved;
            return RowID;
            } catch (error) {
                console.error("Error in PersonnelRequisitionController:", error);
                throw error; 
            }

    }

    static async updateFormWithLogId(transaction, formId, RowID) {

            const request = new sql.Request(transaction);
            await request
                .input('id', sql.Int, formId)
                .input('log_id', sql.Int, RowID)
                .query(`
                    UPDATE forms_hr_personnel_requisition 
                    SET log_id = @log_id
                    WHERE ID = @id;
                `);
            return true;
    }
}


