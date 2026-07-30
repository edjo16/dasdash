import sql from 'mssql';
import { sqlConfig } from '../../../dbConfig.js';

export default class PersonalTimeOffModel {
    constructor() { }

    static async getMasterForm(transaction, formName) {
        const request = new sql.Request(transaction);
        const query = `SELECT id, table_name, name FROM mform WHERE name = @formName`;
        request.input('formName', sql.VarChar, formName);
        const { recordset } = await request.query(query);
        return recordset;
    }

    static async createForm(transaction, userId, body) {
        const request = new sql.Request(transaction);
        const { recordset } = await request
            .input('request_type', sql.VarChar(100), body.request_type)
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
                    start_date,
                    end_date,
                    start_permit_hour,
                    end_permit_hour,
                    notes,
                    user_created,
                    uingreso
                ) OUTPUT INSERTED.id VALUES (
                    @request_type,
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
}
