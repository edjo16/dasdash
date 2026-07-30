import sql from 'mssql';
import { sqlConfig } from '../../../dbConfig.js';
import { asignacion_integrates } from '../../../functions.js';

export default class PersonalTimeOffModel {
    constructor() { }

    static async getMasterForm(transaction, formName) {
        const request = new sql.Request(transaction);
        const query = `SELECT id, table_name, name FROM mform WHERE name = @formName`;
        request.input('formName', sql.VarChar, formName);
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Finds the correct PTO approval flow for a user based on their department and company.
     * Flow logic:
     *  - Specific flows (cdepartamento != 0) take priority when matching the user's department.
     *  - The generic flow (cdepartamento = 0) is used as fallback for all other departments.
     */
    static async getPersonalTimeOffFlow(transaction, userDepartmentId, userCompania) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT * FROM approvals_flow
            WHERE nombre = 'Personal Time Off'
              AND estado = 1
              AND origen = 'DASHBOARD'
            ORDER BY cdepartamento DESC;
        `;
        const { recordset } = await request.query(query);
        if (!recordset || recordset.length === 0) return null;

        // Try to find a specific flow matching the user's department
        const specificFlow = recordset.find(f =>
            f.cdepartamento !== 0 && f.cdepartamento === Number(userDepartmentId)
        );
        if (specificFlow) return specificFlow;

        // Fallback to generic flow (cdepartamento = 0)
        const genericFlow = recordset.find(f => f.cdepartamento === 0);
        return genericFlow || null;
    }

    /**
     * Resolves actors for a PTO flow using the same logic as asignacion_integrates.
     * For the generic flow (cdepartamento=0), the user's actual department is used
     * to resolve area_supervisor instead of the flow's cdepartamento.
     */
    static resolveActors(flow, users, userDepartment, username, allDepartments) {
        // For the generic flow (cdepartamento=0), we need to set the department
        // to the user's actual department so area_supervisor resolves correctly
        const effectiveDepartment = flow.cdepartamento === 0
            ? allDepartments.find(d => d.id === Number(userDepartment?.id || userDepartment))
            : allDepartments.find(d => d.id === flow.cdepartamento);

        const [procesos, estados] = asignacion_integrates(
            flow, users, effectiveDepartment || {}, username,
            flow.id, flow.nombre, [], allDepartments
        );

        return { procesos, estados };
    }

    static async createForm(transaction, userId, body, totalDays) {
        const request = new sql.Request(transaction);
        const { recordset } = await request
            .input('request_type', sql.VarChar(100), body.request_type)
            .input('days', sql.Int, totalDays|| 0)
            .input('start_date', sql.Date, body.start_date)
            .input('end_date', sql.Date, body.end_date)
            .input('start_permit_hour', sql.VarChar(10), body.start_permit_hour || null)
            .input('end_permit_hour', sql.VarChar(10), body.end_permit_hour || null)
            .input('notes', sql.NVarChar(500), body.notes || null)
            .input('user_created', sql.VarChar(50), userId)
            .input('uingreso', sql.VarChar(50), userId)
            .query(`
                INSERT INTO forms_hr_personal_time_off (
                    request_type,
                    days,
                    start_date,
                    end_date,
                    start_permit_hour,
                    end_permit_hour,
                    notes,
                    user_created,
                    uingreso
                ) OUTPUT INSERTED.id VALUES (
                    @request_type,
                    @days,
                    @start_date,
                    @end_date,
                    @start_permit_hour,
                    @end_permit_hour,
                    @notes,
                    @user_created,
                    @uingreso
                );
            `);
        return recordset[0].id;
    }

    static async updateFormWithLogId(transaction, formId, logId) {
        const request = new sql.Request(transaction);
        await request
            .input('id', sql.Int, formId)
            .input('log_id', sql.Int, logId)
            .query(`
                UPDATE forms_hr_personal_time_off 
                SET log_id = @log_id
                WHERE id = @id;
            `);
        return true;
    }

    static async getFormByLogId(transaction, logId) {
        const request = new sql.Request(transaction);
        request.input('log_id', sql.Int, logId);
        const { recordset } = await request.query(`
            SELECT id, request_type, start_date, end_date, days,
                   start_permit_hour, end_permit_hour, notes, log_id
            FROM forms_hr_personal_time_off
            WHERE log_id = @log_id;
        `);
        return recordset.length > 0 ? recordset[0] : null;
    }
}
