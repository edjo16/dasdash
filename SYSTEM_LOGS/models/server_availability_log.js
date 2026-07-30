import sql from 'mssql';
import { sqlConfig } from '../../dbConfig.js';

export default class ServerAvailabilityLogModel {
  static async insertLog(failedServers, availableCount, totalServers, detail) {
    const pool = await sql.connect(sqlConfig);
    const request = pool.request();
    request.input('payload', sql.NVarChar, `Total: ${totalServers}, Avaliable: ${availableCount}`);
    request.input('response', sql.NVarChar, `${failedServers} is not avaliable`);

    const insertQuery = `
      INSERT INTO log_errors (response, payload)
      OUTPUT INSERTED.id
      VALUES (@response, @payload);
    `;

    const { recordset } = await request.query(insertQuery);
    return recordset && recordset[0] ? recordset[0].id : null;
  }
}
