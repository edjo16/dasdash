import sql from 'mssql';
import pkg from 'crypto-js';
const { AES } = pkg;

// Parse DD/MM/YYYY string to a JS Date for sql.Date params
function parseDDMMYYYY(str) {
    if (!str || typeof str !== 'string') return null;
    const [d, m, y] = str.split('/');
    if (!d || !m || !y) return null;
    const date = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
    return isNaN(date.getTime()) ? null : date;
}

export default class UsersModel {
    constructor() { }

    /**
     * Get all users with company and department information
     */
    static async getAllUsers(transaction) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT 
                u.Id,
                u.Name,
                u.Email,
                u.UserID,
                u.Manager,
                m.Name AS manager_name,
                u.Modules,
                u.Location,
                u.Location1,
                u.M_Admin,
                u.M_Conta,
                u.F_IT,
                u.F_Conta,
                u.F_Admin,
                u.F_Finanzas,
                u.F_Governance,
                u.F_HR,
                u.M_CRM,
                u.Estado,
                u.Grupo,
                u.departamento,
                u.fingreso,
                u.fmodificado,
                u.compania,
                u.user_type,
                u.cdepartamento,
                u.ccompania,
                u.xcargo,
                u.ms_id,
                u.vacaciones,
                c.xnombre AS compania_nombre,
                c.xlogo AS compania_logo,
                d.nombre AS departamento_nombre,
                d.manager AS departamento_manager
            FROM Users u
            LEFT JOIN mcompania c ON u.ccompania = c.ccompania
            LEFT JOIN mdepartamento d ON u.cdepartamento = d.id
            LEFT JOIN Users m ON u.Manager = m.UserID
            WHERE u.user_type = 1
            ORDER BY u.id ASC
        `;
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Get a user by ID with complete information
     */
    static async getUserById(transaction, userId) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT 
                u.Id,
                u.Name,
                u.Email,
                u.UserID,
                u.Manager,
                m.Name AS manager_name,
                u.Modules,
                u.Location,
                u.Location1,
                u.M_Admin,
                u.M_Conta,
                u.F_IT,
                u.F_Conta,
                u.F_Admin,
                u.F_Finanzas,
                u.F_Governance,
                u.F_HR,
                u.M_CRM,
                u.PC,
                u.Estado,
                u.EstadoHasta,
                u.Grupo,
                u.cusuario,
                u.departamento,
                u.fingreso,
                u.fmodificado,
                u.compania,
                u.user_type,
                u.cdepartamento,
                u.ccompania,
                u.xcargo,
                u.ms_id,
                u.finicio,
                u.fsalida,
                u.vacaciones,
                c.xnombre AS compania_nombre,
                c.xlogo AS compania_logo,
                c.xdominios AS compania_dominios,
                c.[language] AS compania_language,
                d.nombre AS departamento_nombre,
                d.ruta AS departamento_ruta,
                d.manager AS departamento_manager,
                d.suplente AS departamento_suplente,
                d.parent_of AS departamento_parent_of
            FROM Users u
            LEFT JOIN mcompania c ON u.ccompania = c.ccompania
            LEFT JOIN mdepartamento d ON u.cdepartamento = d.id
            LEFT JOIN Users m ON u.Manager = m.UserID
            WHERE u.Id = @userId
        `;
        request.input('userId', sql.Int, userId);
        const { recordset } = await request.query(query);
        return recordset[0];
    }

    /**
     * Get department names from semicolon-separated IDs
     */
    static async getDepartmentsByIds(transaction, departmentIds) {
        if (!departmentIds || departmentIds.trim() === '') {
            return [];
        }

        const request = new sql.Request(transaction);
        // Remove empty strings and trailing semicolons
        const ids = departmentIds.split(';').filter(id => id.trim() !== '');
        
        if (ids.length === 0) {
            return [];
        }

        // Create a comma-separated list for SQL IN clause
        const idList = ids.join(',');
        
        const query = `
            SELECT id, nombre, ruta, manager, suplente, ccompania, parent_of
            FROM mdepartamento
            WHERE id IN (${idList})
            ORDER BY nombre ASC
        `;
        
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Get company names from semicolon-separated IDs
     */
    static async getCompaniesByIds(transaction, companyIds) {
        if (!companyIds || companyIds.toString().trim() === '') {
            return [];
        }

        const request = new sql.Request(transaction);
        // Remove empty strings and trailing semicolons
        const ids = companyIds.toString().split(';').filter(id => id.trim() !== '');
        
        if (ids.length === 0) {
            return [];
        }

        // Create a comma-separated list for SQL IN clause
        const idList = ids.join(',');
        
        const query = `
            SELECT ccompania, xnombre, xlogo, xdominios, [language]
            FROM mcompania
            WHERE ccompania IN (${idList})
            ORDER BY xnombre ASC
        `;
        
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Get active users
     */
    static async getActiveUsers(transaction) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT 
                u.Id,
                u.Name,
                u.Email,
                u.UserID,
                u.Manager,
                m.Name AS manager_name,
                u.Location,
                u.Estado,
                u.departamento,
                u.xcargo,
                c.xnombre AS compania_nombre,
                d.nombre AS departamento_nombre
            FROM Users u
            LEFT JOIN mcompania c ON u.ccompania = c.ccompania
            LEFT JOIN mdepartamento d ON u.cdepartamento = d.id
            LEFT JOIN Users m ON u.Manager = m.UserID
            WHERE u.Estado = 1 AND u.user_type = 1
            ORDER BY u.Name ASC
        `;
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Search users by search term
     */
    static async searchUsers(transaction, searchTerm) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT 
                u.Id,
                u.Name,
                u.Email,
                u.UserID,
                u.Manager,
                m.Name AS manager_name,
                u.Location,
                u.Estado,
                u.departamento,
                u.xcargo,
                c.xnombre AS compania_nombre,
                d.nombre AS departamento_nombre
            FROM Users u
            LEFT JOIN mcompania c ON u.ccompania = c.ccompania
            LEFT JOIN mdepartamento d ON u.cdepartamento = d.id
            LEFT JOIN Users m ON u.Manager = m.UserID
            WHERE u.user_type = 1 
                AND (
                    u.Name LIKE @searchTerm 
                    OR u.Email LIKE @searchTerm 
                    OR u.UserID LIKE @searchTerm
                    OR c.xnombre LIKE @searchTerm
                    OR d.nombre LIKE @searchTerm
                )
            ORDER BY u.Name ASC
        `;
        request.input('searchTerm', sql.VarChar, `%${searchTerm}%`);
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Get all companies
     */
    static async getAllCompanies(transaction) {
        const request = new sql.Request(transaction);
        const query = `SELECT ccompania, xnombre, xlogo, xdominios, [language] FROM mcompania ORDER BY xnombre ASC`;
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Get all departments
     */
    static async getAllDepartments(transaction) {
        const request = new sql.Request(transaction);
        const query = `SELECT id, nombre, ruta, manager, suplente, ccompania, parent_of FROM mdepartamento ORDER BY nombre ASC`;
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Get departments by company
     */
    static async getDepartmentsByCompany(transaction, ccompania) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT id, nombre, ruta, manager, suplente, ccompania, parent_of 
            FROM mdepartamento 
            WHERE ccompania = @ccompania
            ORDER BY nombre ASC
        `;
        request.input('ccompania', sql.Int, ccompania);
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Update user information (partial update - only updates provided fields)
     */
    static async updateUser(transaction, userId, userData) {
        const request = new sql.Request(transaction);
        
        // Build dynamic query with only the fields that are provided
        const setFields = [];
        
        if (userData.Name !== undefined) {
            request.input('Name', sql.VarChar, userData.Name);
            setFields.push('Name = @Name');
        }
        if (userData.Email !== undefined) {
            request.input('Email', sql.VarChar, userData.Email);
            setFields.push('Email = @Email');
        }
        if (userData.Manager !== undefined) {
            request.input('Manager', sql.VarChar, userData.Manager);
            setFields.push('Manager = @Manager');
        }
        if (userData.Location !== undefined) {
            request.input('Location', sql.VarChar, userData.Location);
            setFields.push('Location = @Location');
        }
        if (userData.Location1 !== undefined) {
            request.input('Location1', sql.VarChar, userData.Location1);
            setFields.push('Location1 = @Location1');
        }
        if (userData.finicio !== undefined) {
            request.input('finicio', sql.Date, userData.finicio ? parseDDMMYYYY(userData.finicio) : null);
            setFields.push('finicio = @finicio');
        }
        if (userData.fsalida !== undefined) {
            request.input('fsalida', sql.Date, userData.fsalida ? parseDDMMYYYY(userData.fsalida) : null);
            setFields.push('fsalida = @fsalida');
        }
        if (userData.umodificado !== undefined) {
            request.input('umodificado', sql.VarChar, userData.umodificado);
            setFields.push('umodificado = @umodificado');
        }
        if (userData.xcargo !== undefined) {
            request.input('xcargo', sql.VarChar, userData.xcargo);
            setFields.push('xcargo = @xcargo');
        }
        if (userData.ccompaniae !== undefined) {
            request.input('ccompaniae', sql.Int, userData.ccompaniae);
            setFields.push('ccompania = @ccompaniae');
        }
        if (userData.cdepartamentoe !== undefined) {
            request.input('cdepartamentoe', sql.Int, userData.cdepartamentoe);
            setFields.push('cdepartamento = @cdepartamentoe');
        }
        if (userData.departamento !== undefined) {
            request.input('departamento', sql.VarChar, userData.departamento);
            setFields.push('departamento = @departamento');
        }
        if (userData.compania !== undefined) {
            request.input('compania', sql.VarChar, userData.compania);
            setFields.push('compania = @compania');
        }
        if (userData.vacaciones !== undefined) {
            request.input('vacaciones', sql.Bit, userData.vacaciones);
            setFields.push('vacaciones = @vacaciones');
        }
        if (userData.Estado !== undefined) {
            request.input('Estado', sql.Bit, userData.Estado);
            setFields.push('Estado = @Estado');
        }
        // Permissions and Modules
        if (userData.M_Admin !== undefined) {
            request.input('M_Admin', sql.VarChar, userData.M_Admin);
            setFields.push('M_Admin = @M_Admin');
        }
        if (userData.M_Conta !== undefined) {
            request.input('M_Conta', sql.VarChar, userData.M_Conta);
            setFields.push('M_Conta = @M_Conta');
        }
        if (userData.M_CRM !== undefined) {
            request.input('M_CRM', sql.VarChar, userData.M_CRM);
            setFields.push('M_CRM = @M_CRM');
        }
        if (userData.F_IT !== undefined) {
            request.input('F_IT', sql.VarChar, userData.F_IT);
            setFields.push('F_IT = @F_IT');
        }
        if (userData.F_Conta !== undefined) {
            request.input('F_Conta', sql.VarChar, userData.F_Conta);
            setFields.push('F_Conta = @F_Conta');
        }
        if (userData.F_Admin !== undefined) {
            request.input('F_Admin', sql.VarChar, userData.F_Admin);
            setFields.push('F_Admin = @F_Admin');
        }
        if (userData.F_Finanzas !== undefined) {
            request.input('F_Finanzas', sql.VarChar, userData.F_Finanzas);
            setFields.push('F_Finanzas = @F_Finanzas');
        }
        if (userData.F_Governance !== undefined) {
            request.input('F_Governance', sql.VarChar, userData.F_Governance);
            setFields.push('F_Governance = @F_Governance');
        }
        if (userData.F_HR !== undefined) {
            request.input('F_HR', sql.VarChar, userData.F_HR);
            setFields.push('F_HR = @F_HR');
        }
        if (userData.Modules !== undefined) {
            request.input('Modules', sql.VarChar, userData.Modules);
            setFields.push('Modules = @Modules');
        }
        if (userData.Grupo !== undefined) {
            request.input('Grupo', sql.VarChar, userData.Grupo);
            setFields.push('Grupo = @Grupo');
        }
        
        // Always update modification date
        setFields.push('fmodificado = GETDATE()')
        
        if (setFields.length === 1) {
            // Only fmodificado, nothing to update
            return true;
        }
        
        const query = `
            UPDATE Users SET
                ${setFields.join(',\n                ')}
            WHERE Id = @userId
        `;
        
        request.input('userId', sql.Int, userId);
        await request.query(query);
        return true;
    }

    /**
     * Change user password
     */
    static async changePassword(transaction, userId, newPassword) {
        const request = new sql.Request(transaction);
        
        // Encrypt password with same logic as auth.js
        const encryptedPassword = AES.encrypt(newPassword, "8pZi4!U#r@ejWg8D#87$OMpee89yHD").toString();
        
        // Set expiration date to 3 months from now
        const date = new Date();
        const exp = new Date(date.setMonth(date.getMonth() + 3));
        const encryptedExp = AES.encrypt(exp.toString(), "uj8M0N@qBwLT#ZCWA!WRco9&7WhOA1").toString();
        
        const query = `
            UPDATE Users SET
                Pscode = @Pscode,
                PsExp = @PsExp,
                PsTcode = NULL,
                PsTExp = NULL,
                fmodificado = GETDATE()
            WHERE Id = @userId
        `;
        
        request.input('userId', sql.Int, userId);
        request.input('Pscode', sql.VarChar, encryptedPassword);
        request.input('PsExp', sql.VarChar, encryptedExp);
        
        await request.query(query);
        return true;
    }

    /**
     * Set temporary password (forgot/reset flow)
     */
    static async setTemporaryPassword(transaction, userId, temporaryPassword) {
        const request = new sql.Request(transaction);

        const encryptedTemporaryPassword = AES.encrypt(temporaryPassword, '8pZi4!U#r@ejWg8D#87$OMpee89yHD').toString();
        const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000));
        const encryptedTemporaryExp = AES.encrypt(expiresAt.toString(), 'uj8M0N@qBwLT#ZCWA!WRco9&7WhOA1').toString();

        const query = `
            UPDATE Users SET
                PsTcode = @PsTcode,
                PsTExp = @PsTExp,
                fmodificado = GETDATE()
            WHERE Id = @userId
        `;

        request.input('userId', sql.Int, userId);
        request.input('PsTcode', sql.VarChar, encryptedTemporaryPassword);
        request.input('PsTExp', sql.VarChar, encryptedTemporaryExp);

        await request.query(query);
        return true;
    }

    /**
     * Get all active managers for dropdown
     */
    static async getAllManagers(transaction) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT UserID, Name 
            FROM Users 
            WHERE Estado = 1 AND user_type = 1 AND UserID IS NOT NULL
            ORDER BY Name ASC
        `;
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Create a new user and return the inserted Id
     */
    static async createUser(transaction, userData) {
        const request = new sql.Request(transaction);

        // Prepare inputs (use null/defaults when not provided)
        request.input('Name', sql.VarChar, userData.Name || null);
        request.input('Email', sql.VarChar, userData.Email || null);
        request.input('UserID', sql.VarChar, userData.UserID || null);
        request.input('Manager', sql.VarChar, userData.Manager || null);
        request.input('Location', sql.VarChar, userData.Location || null);
        request.input('Location1', sql.VarChar, userData.Location1 || null);
        request.input('xcargo', sql.VarChar, userData.xcargo || null);
        request.input('finicio', sql.Date, userData.finicio ? parseDDMMYYYY(userData.finicio) : null);
        request.input('fsalida', sql.Date, userData.fsalida ? parseDDMMYYYY(userData.fsalida) : null);
        request.input('uingreso', sql.VarChar, userData.uingreso || null);
        request.input('umodificado', sql.VarChar, userData.umodificado || userData.uingreso || null);
        request.input('ccompania', sql.Int, userData.ccompania || null);
        request.input('cdepartamento', sql.Int, userData.cdepartamento || null);
        request.input('departamento', sql.VarChar, userData.departamento || null);
        request.input('compania', sql.VarChar, userData.compania || null);
        request.input('vacaciones', sql.Bit, userData.vacaciones === undefined ? 0 : (userData.vacaciones === '1' || userData.vacaciones === 'true' || userData.vacaciones === 1));
        request.input('M_Admin', sql.VarChar, userData.M_Admin || null);
        request.input('M_Conta', sql.VarChar, userData.M_Conta || null);
        request.input('M_CRM', sql.VarChar, userData.M_CRM || null);
        request.input('F_IT', sql.VarChar, userData.F_IT || null);
        request.input('F_Conta', sql.VarChar, userData.F_Conta || null);
        request.input('F_Admin', sql.VarChar, userData.F_Admin || null);
        request.input('F_Finanzas', sql.VarChar, userData.F_Finanzas || null);
        request.input('F_Governance', sql.VarChar, userData.F_Governance || null);
        request.input('F_HR', sql.VarChar, userData.F_HR || null);
        request.input('Modules', sql.VarChar, userData.Modules || null);
        request.input('Grupo', sql.VarChar, userData.Grupo || null);
        
        // Password handling: Create permanent password
        // Use provided password or default "Welcome123!"
        const password = userData.password || "Welcome123!";
        const encryptedPassword = AES.encrypt(password, "8pZi4!U#r@ejWg8D#87$OMpee89yHD").toString();
        request.input('Pscode', sql.VarChar, encryptedPassword);
        
        // Set expiration to 3 months from now
        const date = new Date();
        const exp = new Date(date.setMonth(date.getMonth() + 3));
        const encryptedExp = AES.encrypt(exp.toString(), "uj8M0N@qBwLT#ZCWA!WRco9&7WhOA1").toString();
        request.input('PsExp', sql.VarChar, encryptedExp);
        
        // No temporary password
        request.input('PsTcode', sql.VarChar, null);
        request.input('PsTExp', sql.VarChar, null);

        const query = `
            INSERT INTO Users (
                Name, Email, UserID, Manager, Location, Location1, xcargo,
                finicio, fsalida, uingreso, umodificado,
                ccompania, cdepartamento, departamento, compania, vacaciones,
                M_Admin, M_Conta, M_CRM, F_IT, F_Conta, F_Admin, F_Finanzas, F_Governance, F_HR,
                Modules, Grupo, Pscode, PsExp, PsTcode, PsTExp, Estado, user_type, fingreso, fmodificado
            )
            OUTPUT INSERTED.Id
            VALUES (
                @Name, @Email, @UserID, @Manager, @Location, @Location1, @xcargo,
                @finicio, @fsalida, @uingreso, @umodificado,
                @ccompania, @cdepartamento, @departamento, @compania, @vacaciones,
                @M_Admin, @M_Conta, @M_CRM, @F_IT, @F_Conta, @F_Admin, @F_Finanzas, @F_Governance, @F_HR,
                @Modules, @Grupo, @Pscode, @PsExp, @PsTcode, @PsTExp, 1, 1, GETDATE(), GETDATE()
            )
        `;

        const { recordset } = await request.query(query);
        // recordset[0] will contain { Id: <new id> }
        return recordset && recordset[0] ? recordset[0].Id : null;
    }
}
