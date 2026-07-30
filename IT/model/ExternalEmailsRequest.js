import sql from 'mssql';
import { asignacion_integrates } from '../../functions.js';

// Flujo de aprobación del formulario. Es un único flujo que aplica a
// todas las empresas y todos los departamentos.
export const EXTERNAL_EMAILS_FLOW_ID = 135;
export const EXTERNAL_EMAILS_FORM_NAME = 'External Emails Request';

// Motivos permitidos para la solicitud (valor guardado -> etiqueta mostrada)
export const REASON_LABELS = {
    provider: 'Provider',
    temporal: 'Temporal'
};

export default class ExternalEmailsRequestModel {
    constructor() { }

    static async getMasterForm(transaction, formName) {
        const request = new sql.Request(transaction);
        const query = `SELECT id, table_name, name FROM mform WHERE name = @formName`;
        request.input('formName', sql.VarChar, formName);
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Devuelve el flujo de aprobación del formulario (flujo 135).
     * A diferencia de Personal Time Off no hay flujos por departamento:
     * el mismo flujo se usa para todas las empresas y departamentos.
     */
    static async getExternalEmailsFlow(transaction) {
        const request = new sql.Request(transaction);
        request.input('id', sql.Int, EXTERNAL_EMAILS_FLOW_ID);
        const { recordset } = await request.query(`
            SELECT * FROM approvals_flow
            WHERE id = @id AND estado = 1;
        `);
        return recordset.length > 0 ? recordset[0] : null;
    }

    /**
     * Resuelve los actores del flujo con la misma lógica de asignacion_integrates.
     * Como el flujo es genérico (cdepartamento = 0) se usa el departamento real
     * del solicitante para que `area_supervisor` resuelva correctamente.
     */
    static resolveActors(flow, users, userDepartment, username, allDepartments) {
        const effectiveDepartment = flow.cdepartamento
            ? allDepartments.find(d => d.id === flow.cdepartamento)
            : allDepartments.find(d => d.id === Number(userDepartment?.id || userDepartment));

        const [procesos, estados] = asignacion_integrates(
            flow, users, effectiveDepartment || {}, username,
            flow.id, flow.nombre, [], allDepartments
        );

        return { procesos, estados };
    }

    static async createForm(transaction, userId, body) {
        const request = new sql.Request(transaction);
        const { recordset } = await request
            .input('contact_name', sql.NVarChar(150), body.contact_name)
            .input('email', sql.NVarChar(150), body.email)
            .input('reason', sql.VarChar(50), body.reason)
            .input('uingreso', sql.VarChar(50), userId)
            .query(`
                INSERT INTO forms_it_external_emails_request (
                    contact_name,
                    email,
                    reason,
                    uingreso
                ) OUTPUT INSERTED.id VALUES (
                    @contact_name,
                    @email,
                    @reason,
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
                UPDATE forms_it_external_emails_request
                SET log_id = @log_id
                WHERE id = @id;
            `);
        return true;
    }

    static async getFormById(transaction, formId) {
        const request = new sql.Request(transaction);
        request.input('id', sql.Int, formId);
        const { recordset } = await request.query(`
            SELECT id, contact_name, email, reason, log_id, uingreso, fingreso
            FROM forms_it_external_emails_request
            WHERE id = @id;
        `);
        return recordset.length > 0 ? recordset[0] : null;
    }

    static async getFormByLogId(transaction, logId) {
        const request = new sql.Request(transaction);
        request.input('log_id', sql.Int, logId);
        const { recordset } = await request.query(`
            SELECT id, contact_name, email, reason, log_id, uingreso, fingreso
            FROM forms_it_external_emails_request
            WHERE log_id = @log_id;
        `);
        return recordset.length > 0 ? recordset[0] : null;
    }
}
