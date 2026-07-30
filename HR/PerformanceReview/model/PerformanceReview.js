
// here are the functions that are used to create, update and read performance review /form_hr_performance_review
import sql from 'mssql';
import { ApprovalCreation } from '../../../functions.js';
import { sqlConfig } from '../../../dbConfig.js';
import { getAdjustedDate } from '../../../Middleware/validateUserId.js';
export default class PerformanceReviewModel {
    constructor() { }

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
    
    static async getPerformanceReviewById(transaction, id) {
        const request = new sql.Request(transaction);
        const query = `SELECT * FROM forms_hr_performance_review WHERE id = @id`;
        request.input('id', sql.Int, id);
        const { recordset } = await request.query(query);
        if (recordset.length < 1) throw new Error("No se encontró la solicitud de aprobación.");
        return recordset[0];
    }

    static async createForm(transaction, userId, body) {
        let formId = null;
        const request = new sql.Request(transaction);
            const { recordset } = await request
            .input('userCreated', sql.NVarChar, userId)
            .input('collaboratorName', sql.NVarChar, body.collaboratorName)
            .input('collabjobTitle', sql.NVarChar, body.collabjobTitle)
            .input('leaderName', sql.NVarChar, body.leaderName)
            .input('leaderJobTitle', sql.NVarChar, body.leaderJobTitle)
            .input('averageGoal', sql.Int, body.averageGoal)
            .input('developmentGoal', sql.Int, body.developmentGoal)
            .input('observationsLeader', sql.NVarChar, body.observationsLeader)
            .input('observationsAssociate', sql.NVarChar, body.observationsAssociate)
            .input('generalResult', sql.NVarChar, body.generalResult)
            .query(`
                INSERT INTO forms_hr_performance_review (
                    userCreated,
                    collaboratorName,    
                    collabjobTitle,
                    leaderName,
                    leaderJobTitle,
                    averageGoal,
                    developmentGoal,
                    observationsLeader,
                    observationsAssociate,
                    generalResult
                ) OUTPUT INSERTED.ID VALUES (
                    @userCreated,
                    @collaboratorName,
                    @collabjobTitle,
                    @leaderName,
                    @leaderJobTitle,
                    @averageGoal,
                    @developmentGoal,
                    @observationsLeader,
                    @observationsAssociate,
                    @generalResult
                );
            `);
            formId = recordset[0].ID;
            return formId;
    }

    static async updateFormWithLogId(transaction, formId, RowID) {

        const request = new sql.Request(transaction);
        await request
            .input('id', sql.Int, formId)
            .input('log_id', sql.Int, RowID)
            .query(`
                UPDATE forms_hr_performance_review 
                SET log_id = @log_id
                WHERE ID = @id;
            `);
        return true;
    }
    
    static async handleApprovals(transaction, req, formId, date, userId) {
        
        let RowID;
            const username = userId
            const approvalData = req.body; 
            const approvalsSelect = Number(approvalData.approvals_select);
            const compania = Number(approvalData.compania);
            const verificador = approvalData.verificador;
            const ejecutor = approvalData.ejecutor;
            const proceso = approvalData.proceso;
            const request = new sql.Request(transaction);
            console.log(verificador, ejecutor)

            if(verificador == "N/A"){
                approvalData.estado = 'Execute'
            }
            const { recordsets } = await request.query(`
                SELECT * FROM approvals_flow AS a 
                LEFT JOIN companias AS c ON c.ccompania = a.ccompania 
                WHERE id = ${approvalsSelect}
            `);

            if (!recordsets.length || !recordsets[0].length) {
                console.error('No approvals flow found for the specified ID.');
                return null;
            }

            const approvalsruta = recordsets[0][0].ruta.replace('\\', '/');
            const departmentRequest = new sql.Request(transaction);
            const departamentsResult = await departmentRequest.query(`
                SELECT * FROM departamentos WHERE id = ${recordsets[0][0].cdepartamento}
            `);

            const departamentName = departamentsResult.recordset[0].nombre;
            const detalleProceso = proceso

            // Call the function to create approval record
            const resolved = await ApprovalCreation(sqlConfig, proceso, detalleProceso, departamentName, approvalData.xnombre, date, verificador, "N/A", "N/A", ejecutor, approvalData.estado, null, null, username, null, null, 'N/A', 'N/A', approvalsSelect, compania, req, approvalsruta, approvalData.mform, formId)
            RowID = resolved;
            return RowID;

    }

    static async updatePerformanceReview(transaction, id, userId, formData) {

            const date = getAdjustedDate();

            const requestUpdateForm = new sql.Request(transaction);
            await requestUpdateForm
                .input('id', sql.Int, id)
                .input('averageGoal', sql.Int, formData.averageGoal)
                .input('developmentGoal', sql.Int, formData.developmentGoal)
                .input('observationsLeader', sql.NVarChar, formData.observationsLeader)
                .input('observationsAssociate', sql.NVarChar, formData.observationsAssociate)
                .input('generalResult', sql.NVarChar, formData.generalResult)
                .input('dateUpdated', sql.DateTime, date)
                .input('userUpdated', sql.NVarChar, userId)
                .query(`
                UPDATE forms_hr_performance_review 
                SET 
                    averageGoal = @averageGoal,
                    developmentGoal = @developmentGoal,
                    observationsLeader = @observationsLeader,
                    observationsAssociate = @observationsAssociate,
                    generalResult = @generalResult,
                    dateUpdated = @dateUpdated,
                    userUpdated = @userUpdated
                WHERE ID = @id;
            `);

            // If the update is successful, return the updated data or a success message
            return { result: 1, message: 'Performance review updated successfully.' };

    }

}