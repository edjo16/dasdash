import sql from 'mssql';

export default class LogErrorsModel {
  constructor() { }

  static async readLogErrors(transaction, limit, offset, search, userName, endpoint) {
    let query = `SELECT 
      id, 
      userName, 
      FORMAT(date, 'dd/MM/yyyy HH:mm:ss') AS date,
      payload, 
      response, 
      enpoint as endpoint
    FROM log_errors 
    WHERE id IS NOT NULL`;

    if (userName !== null && userName !== '') {
      query += ` AND userName = @userName`;
    }

    if (endpoint !== null && endpoint !== '') {
      query += ` AND enpoint = @endpoint`;
    }

    if (search !== null && search !== '') {
      query += ` AND (userName LIKE @search OR enpoint LIKE @search OR payload LIKE @search OR response LIKE @search)`;
    }

    query += `
      ORDER BY id DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const request = new sql.Request(transaction);
    if (userName !== null && userName !== '') request.input('userName', sql.VarChar, userName);
    if (endpoint !== null && endpoint !== '') request.input('endpoint', sql.VarChar, endpoint);
    if (search !== null && search !== '') request.input('search', sql.VarChar, `%${search}%`);
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);

    return await request.query(query);
  }

  static async totalCount(transaction, search, userName, endpoint) {
    let query = `SELECT COUNT(*) AS totalCount FROM log_errors WHERE id IS NOT NULL`;

    if (userName !== null && userName !== '') {
      query += ` AND userName = @userName`;
    }

    if (endpoint !== null && endpoint !== '') {
      query += ` AND enpoint = @endpoint`;
    }

    if (search !== null && search !== '') {
      query += ` AND (userName LIKE @search OR enpoint LIKE @search OR payload LIKE @search OR response LIKE @search)`;
    }

    const request = new sql.Request(transaction);
    if (userName !== null && userName !== '') request.input('userName', sql.VarChar, userName);
    if (endpoint !== null && endpoint !== '') request.input('endpoint', sql.VarChar, endpoint);
    if (search !== null && search !== '') request.input('search', sql.VarChar, `%${search}%`);

    const result = await request.query(query);
    return result.recordset[0];
  }

  static async getLogById(transaction, id) {
    const request = new sql.Request(transaction);
    const query = `SELECT 
      id, 
      userName, 
      date,
      payload, 
      response, 
      enpoint as endpoint
    FROM log_errors 
    WHERE id = @id`;

    request.input('id', sql.Int, id);
    const result = await request.query(query);
    return result.recordset[0];
  }

  static async getUniqueUsers(transaction) {
    const request = new sql.Request(transaction);
    const query = `SELECT DISTINCT userName 
      FROM log_errors 
      WHERE userName IS NOT NULL 
      ORDER BY userName`;

    const result = await request.query(query);
    return result.recordset;
  }

  static async getUniqueEndpoints(transaction) {
    const request = new sql.Request(transaction);
    const query = `SELECT DISTINCT enpoint as endpoint 
      FROM log_errors 
      WHERE enpoint IS NOT NULL 
      ORDER BY enpoint`;

    const result = await request.query(query);
    return result.recordset;
  }
}
