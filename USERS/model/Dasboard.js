import sql from 'mssql';

export default class DashboardModel {
    constructor() { }
    // Función para obtener el flujo de trabajo de los departamentos donde el usuario es manager
    static async getDepartmentsFlows(transaction, UserID) {
        const request = new sql.Request(transaction);
        const query = `SELECT f.id 
        FROM mdepartamento d
        INNER JOIN approvals_flow f ON f.cdepartamento = d.id
        WHERE d.manager = @UserID
        GROUP BY f.id`;
        request.input('UserID', sql.VarChar, UserID)
        const { recordset } = await request.query(query);
        return recordset;
    }


    // Función para obtener el registro de logs
    static async getLogDetails(transaction, UserName, sql_where) {
        const request = new sql.Request(transaction);
        let query = `
        SELECT FORMAT(solicitante_fecha,'dd/MM/yyyy') AS s_fecha, * 
        FROM log 
        WHERE solicitante = @UserName
        OR verificador = @UserName
        OR aprobador = @UserName 
        OR firmante = @UserName 
        OR operador = @UserName 
        OR asignado = @UserName 
        OR ejecutor = @UserName 
    `;
        if (sql_where.length > 0) {
            query += `OR ${sql_where} `
        }

        request.input('UserName', sql.VarChar, UserName)
        const { recordset } = await request.query(query);

        return recordset;
    }


    // Función para obtener los últimos 10 procesos de aprobación
    static async getTopApprovals(transaction, UserName) {
        const request = new sql.Request(transaction);
        const query = `SELECT TOP(10) id, proceso, left(detalle_proceso,70) as detalle_proceso, FORMAT(solicitante_fecha,'dd/MM/yyyy') AS s_fecha, estado FROM log WHERE  solicitante = @UserName ORDER BY solicitante_fecha DESC`
        request.input('UserName', sql.VarChar, UserName)
        const { recordset, rowsAffected } = await request.query(query);
        return { recordset, rowsAffected };
    }

    static async CreateErrorLog(transaction, userName, payload, response) {
        let id = null;
        const request = new sql.Request(transaction);
        const query = `INSERT INTO log_errors (userName, payload, response) OUTPUT INSERTED.id VALUES (@userName, @payload, @response)`;
        const { recordset } = await request
            .input('userName', sql.VarChar, userName)
            .input('payload', sql.NVarChar, payload)
            .input('response', sql.VarChar, response)
            .query(query);
        id = recordset[0].id;
        return id;
    }
    
    static async getErrorLogById(transaction, id) {
        const request = new sql.Request(transaction);
        const query = `SELECT * FROM log_errors WHERE id = @id`;
        const { recordset } = await request.input('id', sql.Int, id).query(query);
        return recordset[0];
    }

    static async CreateErrorCRM(transaction, userName, payload, response) {
        let id = null;
        const request = new sql.Request(transaction);
        const query = `INSERT INTO crm_errors (userName, payload, response) OUTPUT INSERTED.id VALUES (@userName, @payload, @response)`;
        const { recordset } = await request
            .input('userName', sql.VarChar, userName)
            .input('payload', sql.NVarChar, payload)
            .input('response', sql.VarChar, response)
            .query(query);
        id = recordset[0].id;
        return id;
    }

}
