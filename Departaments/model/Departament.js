import sql from 'mssql';
export default class DepartamentModel {
    constructor() { }

    static async getDepartaments(conection) {
        let pool = await sql.connect(conection)
        var result = await pool.request()
            .query("Select * from departamentos")

        return result.recordset;
    }

    static async getDepartmentsByStringIds(connOrTx, idsString) {
        const ids = (idsString || '')
        .replace(/;/g, ',')        
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter(Number.isInteger);

        if (ids.length === 0) return [];

        const placeholders = ids.map((_, i) => `@id${i}`).join(', ');

        const query = `
        SELECT *
        FROM departamentos
        WHERE id IN (${placeholders});
        `;

        const request =
        connOrTx instanceof sql.Transaction
            ? new sql.Request(connOrTx)
            : (connOrTx.request ? connOrTx.request() : new sql.Request(connOrTx));

        ids.forEach((val, i) => request.input(`id${i}`, sql.Int, val));

        const result = await request.query(query);
        return result.recordset;
    }
    static async getCompaniesByStringIds(connOrTx, idsString) {
        const ids = (idsString || '')
        .replace(/;/g, ',')        
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter(Number.isInteger);

        if (ids.length === 0) return [];

        const placeholders = ids.map((_, i) => `@id${i}`).join(', ');

        const query = `
        SELECT *
        FROM mcompania
        WHERE ccompania IN (${placeholders});
        `;

        const request =
        connOrTx instanceof sql.Transaction
            ? new sql.Request(connOrTx)
            : (connOrTx.request ? connOrTx.request() : new sql.Request(connOrTx));

        ids.forEach((val, i) => request.input(`id${i}`, sql.Int, val));

        const result = await request.query(query);
        return result.recordset;
    }
    static async getDepartmentById(conection, id){
        let pool = await sql.connect(conection)
        var result = await pool.request()
            .input('id', sql.Int, id)
            .query("Select * from departamentos where id = @id")

        return result.recordset[0];
    }
    static async getDepartmentNameById(conection, id){
        let pool = await sql.connect(conection)
        var result = await pool.request()
            .input('id', sql.Int, id)
            .query("Select * from mdepartamento where id = @id")

        return result.recordset[0];
    }
    static async getAllBanks(conection) {
        let pool = await sql.connect(conection)
        var result = await pool.request().query(`select id, xnombre from mbanco`)
        return result.recordset;
    }
static async getBanks(connection, banco, moneda, ccompania) {
    const pool = await sql.connect(connection);

    const result = await pool.request()
        .input('banco', sql.NVarChar, banco)
        .input('moneda', sql.NVarChar, `%${moneda}%`)
        .input('ccompania', sql.Int, ccompania)
        .query(`
            SELECT *
            FROM mbanco
            WHERE xnombre = @banco
              AND monedas LIKE @moneda
              AND ccompania = @ccompania
        `);

    return result.recordset[0];
}
    static async getBanksById(conection, banco) {
        let pool = await sql.connect(conection)
        var result = await pool.request()
            .input('banco', sql.Int, banco)
            .query(`select * from mbanco where id = @banco`)
        return result.recordset[0];
    }
    static async getCompany(conection, ccompania){
        let pool = await sql.connect(conection)
        var result = await pool.request()
            .input('ccompania', sql.Int, ccompania)
            .query(`select * from mcompania where ccompania = @ccompania`)

        return result.recordset[0];
    }
}
