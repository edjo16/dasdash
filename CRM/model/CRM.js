import sql from 'mssql';
import { get_menu } from '../../functions.js';
import CRMRule from '../rule/CRMRule.js';
import DepartamentModel from '../../Departaments/model/Departament.js';
import Rules from '../../USERS/rule/DevTeam.js';
import { prepareEmailForPending, sir_post_validation, cas_post_validation } from '../../CRM/functions.js';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import pkg from 'lodash';
import { nombres_latinos } from '../../fuctions-approvals.js';
import USERModel from '../../USERS/model/USER.js';
const { keysIn, forEach } = pkg;

export default class CRMModel {
    constructor() { }
    static async getCRMById(transaction, id_main){
        const query = 'SELECT de_correo, cprioridad, conversacion_titulo FROM crm_main WHERE id = @id_main';
        const requestCRM = new sql.Request(transaction);
        requestCRM.input('id_main', sql.Int, id_main);
        const {recordset} = await requestCRM.query(query);
        return recordset[0];
  }

static async validateCrmAccess(conection, crm_id, userid) {
        try {
            const pool = await sql.connect(conection);
 
            const userQuery = `
                SELECT departamento, Email, Modules 
                FROM Users 
                WHERE UserID = @userid
            `;
            const userResult = await pool.request()
                .input('userid', sql.VarChar, userid)
                .query(userQuery);
 
            if (!userResult.recordset || userResult.recordset.length === 0) {
                return { result: 0, hasAccess: false, message: 'User not found' };
            }
 
            const user = userResult.recordset[0];
            const userDepartment = user.departamento;
            const userEmail = user.Email;
            const userModules = user.Modules;
 
            if (userModules === 'All') {
                return { result: 1, hasAccess: true };
            }
 
            // Verify is user has been asigned
            const assignedQuery = `
                SELECT COUNT(*) as count
                FROM crm_asignado
                WHERE id_main = @crm_id AND uasignado = @userid
            `;
            const assignedResult = await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .input('userid', sql.VarChar, userid)
                .query(assignedQuery);
 
            if (assignedResult.recordset[0].count > 0) {
                return { result: 1, hasAccess: true };
            }
            // Verificar if user department is part of the crm
            const departamentos = userDepartment.split(";")
 
            const departmentQuery = `
                SELECT cdepartamento
                FROM crm_asignado a
                WHERE a.id_main = @crm_id 
            `;
            const departmentResult = await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .query(departmentQuery);
 
            const crm_main_deps = departmentResult.recordset.map(asignado => asignado.cdepartamento)
 
            const existeCoincidencia = crm_main_deps.some(dep =>
            departamentos.includes(String(dep))
            );
 
            if (existeCoincidencia) {
                return { result: 1, hasAccess: true };
            }
 
            // Verify is the user is the creator
            const ownerQuery = `
                SELECT COUNT(*) as count
                FROM crm_main
                WHERE id = @crm_id AND de_correo = @email
            `;
            const ownerResult = await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .input('email', sql.VarChar, userEmail)
                .query(ownerQuery);
 
            if (ownerResult.recordset[0].count > 0) {
                return { result: 1, hasAccess: true };
            }
 
            // Verify is the user is the manager/suplente (area supervisor) of any department assigned to the case
            const validDeps = [...new Set(crm_main_deps.filter(dep => dep !== null && dep !== undefined))];
            if (validDeps.length > 0) {
                const supervisorRequest = pool.request();
                const paramNames = validDeps.map((dep, idx) => {
                    const paramName = `dep${idx}`;
                    supervisorRequest.input(paramName, sql.Int, dep);
                    return `@${paramName}`;
                });
                const supervisorQuery = `
                    SELECT manager, suplente
                    FROM mdepartamento
                    WHERE id IN (${paramNames.join(', ')})
                `;
                const supervisorResult = await supervisorRequest.query(supervisorQuery);
                const isSupervisor = supervisorResult.recordset.some(dep =>
                    (dep.manager && dep.manager !== 'N/A' && dep.manager === userid) ||
                    (dep.suplente && dep.suplente !== 'N/A' && dep.suplente === userid)
                );
 
                if (isSupervisor) {
                    return { result: 1, hasAccess: true };
                }
            }
 
            // if any of the case access is false
            return { result: 1, hasAccess: false };
 
        } catch (err) {
            console.log('Error validating CRM access:', err);
            return { result: 0, hasAccess: false, err: err.message };
        }
    }

    static _buildCRMPostWhere(request, { email, departamentos, status, asigned, userid, search = '', priority = '', key = '', assigned_users = '', global_status = '' }) {
        let query_where = ' WHERE 1=1'
        const depStr = String(departamentos == null ? '' : departamentos)

        // Department filter
        if (!depStr.includes(';')) {
            request.input('dep_single', sql.VarChar, `%${depStr};%`)
            query_where += ` AND m.departamento_id LIKE @dep_single`
        } else {
            // filter(Boolean) drops the trailing empty token from "1;2;3;" and is
            // robust whether or not the string ends with ';'
            const deps = depStr.split(';').map(s => s.trim()).filter(Boolean)
            if (deps.length > 0) {
                const placeholders = deps.map((d, i) => {
                    request.input(`dep${i}`, sql.Int, parseInt(d, 10))
                    return `@dep${i}`
                })
                query_where += ` AND a.cdepartamento IN (${placeholders.join(', ')})`
            }
        }

        // Email filter - should be OR with department
        if (email && email.trim() !== '') {
            request.input('email', sql.VarChar, email)
            query_where = query_where.replace('WHERE 1=1', 'WHERE (1=1')
            query_where += ` OR (m.de_nombre = @email OR m.de_correo = @email))`
        }

        // Pending key filter
        if (key === 'Pending') {
            query_where += ` AND EXISTS (SELECT 1 FROM crm_main_estado e_pend LEFT JOIN crm_mestados me_pend ON me_pend.cestado = e_pend.cestado WHERE e_pend.id_main = a.id_main AND e_pend.cdepartamento = a.cdepartamento AND me_pend.ctype IN (0, 1))`
        }

        // Status filter
        if (status !== '' && status !== null && status !== undefined) {
            request.input('status', sql.Int, parseInt(status, 10))
            query_where += ` AND EXISTS (SELECT 1 FROM crm_main_estado e_st WHERE e_st.id_main = a.id_main AND e_st.cdepartamento = a.cdepartamento AND e_st.cestado = @status)`
        }

        // Assigned filter
        if (asigned) {
            request.input('userid', sql.VarChar, userid)
            query_where += ` AND (a.uasignado = @userid)`
        }

        // Search filter — columns use a *_CI_AS collation, so LOWER() is redundant
        // and only makes the predicate non-sargable; matching is already case-insensitive.
        if (search && search.trim() !== '') {
            request.input('search', sql.VarChar, `%${search.trim()}%`)
            query_where += ` AND (CAST(m.id AS VARCHAR) LIKE @search OR m.asunto_interno LIKE @search OR m.conversacion_titulo LIKE @search OR m.de_nombre LIKE @search OR EXISTS (SELECT 1 FROM crm_main_contacts cmc JOIN badaco_contactos bc ON bc.contact_id = TRY_CAST(cmc.ccontacto AS INT) WHERE cmc.crm_id = m.id AND bc.name LIKE @search) OR EXISTS (SELECT 1 FROM crm_msg msg_search WHERE msg_search.id_main = m.id AND CAST(msg_search.body_mensaje AS NVARCHAR(MAX)) LIKE @search))`
        }

        // Priority filter
        if (priority !== '' && priority !== null && priority !== undefined) {
            request.input('priority', sql.Int, parseInt(priority, 10))
            query_where += ` AND (m.cprioridad = @priority)`
        }

        // Assigned-user filter (OR logic across selected users)
        if (assigned_users && assigned_users.trim() !== '') {
            const auList = assigned_users.split(';').map(u => u.trim()).filter(Boolean)
            if (auList.length > 0) {
                const placeholders = auList.map((u, i) => {
                    request.input(`au${i}`, sql.VarChar, u)
                    return `@au${i}`
                })
                query_where += ` AND EXISTS (SELECT 1 FROM crm_asignado ca_au WHERE ca_au.id_main = a.id_main AND ca_au.uasignado IN (${placeholders.join(', ')}))`
            }
        }

        // Global status filter (open = not closed, closed = 999)
        if (global_status === 'open') {
            query_where += ` AND EXISTS (SELECT 1 FROM crm_main_estado e_gs WHERE e_gs.id_main = a.id_main AND e_gs.cestado <> 999)`
        } else if (global_status === 'closed') {
            query_where += ` AND EXISTS (SELECT 1 FROM crm_main_estado e_gs WHERE e_gs.id_main = a.id_main AND e_gs.cestado = 999)`
        }

        return query_where
    }

    static async getCRMPost(transaction, email, departamentos, status, asigned, userid, limit = 15, offset = 0, search = '', priority = '', key = '', assigned_users = '', global_status = '') {
        const request = transaction.request()
        const query_where = CRMModel._buildCRMPostWhere(request, { email, departamentos, status, asigned, userid, search, priority, key, assigned_users, global_status })
        request.input('limit', sql.Int, limit)
        request.input('offset', sql.Int, offset)

        const sql_query = `SELECT DISTINCT(a.id_main) id, m.conversacion_titulo,
            m.de_nombre, FORMAT (m.fingreso, 'yyyy-MM-dd') as fecha_ingreso, FORMAT (m.ffin, 'yyyy-MM-dd') as fecha_fin, FORMAT (m.fmodificado,
            'yyyy-MM-dd') as fecha_modificado,
            CASE
                WHEN (SELECT COUNT(DISTINCT e3.cestado) FROM crm_main_estado e3 WHERE e3.id_main = a.id_main) = 1
                THEN stuff((select ';' + uasignado from crm_asignado b where b.id_main = a.id_main group by uasignado for xml path('')),1,1,'')
                ELSE stuff((select ';' + uasignado from crm_asignado b where b.id_main = a.id_main AND b.cdepartamento = a.cdepartamento group by uasignado for xml path('')),1,1,'')
            END user_asig,
            (SELECT TOP 1 me2.xnombre FROM crm_main_estado e2
             LEFT JOIN crm_mestados me2 ON me2.cestado = e2.cestado
             WHERE e2.id_main = a.id_main AND e2.cdepartamento = a.cdepartamento) as xestado,
            ISNULL(CASE WHEN TRY_CAST(m.asunto_interno AS INT) IS NOT NULL THEN ct.label ELSE m.asunto_interno END, m.asunto_interno) as asunto_interno,
            stuff((SELECT '; ' + bc.name FROM crm_main_contacts cmc JOIN badaco_contactos bc ON bc.contact_id = TRY_CAST(cmc.ccontacto AS INT) WHERE cmc.crm_id = m.id FOR XML PATH('')), 1, 2, '') as xcontacto,
            m.cprioridad, mp.xprioridad
            FROM crm_asignado a
            LEFT JOIN crm_main m ON m.id = a.id_main
            LEFT JOIN crm_mprioridad mp ON mp.cprioridad = m.cprioridad
            LEFT JOIN crm_case_type ct ON ct.type_id = TRY_CAST(m.asunto_interno AS INT)
            ${query_where}
            ORDER BY id desc
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY`

        const select = await request.query(sql_query)
        return select.recordset
    }

    static async getCRMPostCount(transaction, email, departamentos, status, asigned, userid, search = '', priority = '', key = '', assigned_users = '', global_status = '') {
        const request = transaction.request()
        const query_where = CRMModel._buildCRMPostWhere(request, { email, departamentos, status, asigned, userid, search, priority, key, assigned_users, global_status })

        const sql_query = `SELECT COUNT(*) as total FROM (
            SELECT DISTINCT a.id_main,
                CASE
                    WHEN (SELECT COUNT(DISTINCT e3.cestado) FROM crm_main_estado e3 WHERE e3.id_main = a.id_main) > 1
                    THEN a.cdepartamento ELSE 0
                END as unique_key
            FROM crm_asignado a
            LEFT JOIN crm_main m ON m.id = a.id_main
            LEFT JOIN crm_mprioridad mp ON mp.cprioridad = m.cprioridad
            ${query_where}
        ) sub`

        const select = await request.query(sql_query)
        return select.recordset[0].total
    }

    static async getUserDataWithCompany(pool, UserID) {
        let sql_query = `SELECT TOP 1 * FROM Users 
            LEFT JOIN (SELECT cast(ccompania AS VARCHAR(10)) as ccompania, xnombre, xlogo FROM companias) AS c 
            ON Users.compania LIKE '%' + c.ccompania + '%'
            WHERE UserID = @UserID`

        var result = await pool.request()
            .input('UserID', sql.VarChar, UserID)
            .query(sql_query)
        
        return result
    }

    static async getAllActiveUsers(pool) {
        var result = await pool.request()
            .query("SELECT Name, UserID, Modules FROM Users WHERE Name is NOT NULL and estado = 1 order by Name asc")
        
        return result.recordset
    }

    static async getAllDepartments(pool) {
        var result = await pool.request()
            .query("Select * from departamentos")
        
        return result.recordset
    }

static async getUserCRMUsers(conection, res, req) {
        var cdepartamento = req.body.cdepartamento.split(';')
        var searchName = req.body.searchName || ''
        let pool = await sql.connect(conection)
        
        let whereClause = `WHERE 
    u.cdepartamento IS NOT NULL 
    AND d.id <> 10 
    AND u.estado = 1 
    AND u.ccompania = 1`
        
        // Add search filter if searchName is provided
        if (searchName && searchName.trim() !== '') {
            whereClause += ` AND (u.Name LIKE @searchName OR u.userid LIKE @searchName)`
        }
        
        let sql_query = `SELECT u.userid,u.Name,d.nombre AS xdepartamento,d.manager,d.id AS department_id,
    CASE
        WHEN u.userid = d.manager THEN 'Head' 
        ELSE 'Employee' 
    END AS role
FROM 
    Users u 
    LEFT JOIN mdepartamento d ON d.id = u.cdepartamento 
${whereClause}
ORDER BY 
    d.nombre, 
    role DESC,
    u.Name`

        const request = pool.request()
        
        // Add search parameter if provided
        if (searchName && searchName.trim() !== '') {
            request.input('searchName', sql.VarChar, `%${searchName}%`)
        }
        
        const usersRecord = await request.query(sql_query)
        const usuarios = usersRecord.recordset

        return usuarios

    }


    static async linkedMeetings(transaction, crm_id) {
        const query =(`SELECT a.id, a.action_points, a.meeting_details,
            FORMAT(a.due_date,'dd/MM/yyyy') AS due_date,
            m.id AS meeting_id, m.meeting_name
            FROM events_meetings_actions a
            JOIN event_meetings m ON m.id = a.meeting_id
            WHERE a.crm_id = @crm_id
            ORDER BY a.id ASC`);
        const requestCRM = new sql.Request(transaction);
        requestCRM.input('crm_id', sql.Int, crm_id)
        const {recordset} = await requestCRM.query(query);
        return recordset || {};
    }

    static async getCrmMainData(transaction, crm_id) {
        const sql_query = `select TOP(1)FORMAT(c.fingreso,'dd/MM/yyyy hh:mm tt') AS ffingreso, 
        isnull(isnull(u.Name, c.de_nombre), c.de_correo) as de,
        ISNULL(CASE WHEN TRY_CAST(c.asunto_interno AS INT) IS NOT NULL THEN ct.label ELSE c.asunto_interno END, c.asunto_interno) as asunto_interno,
        FORMAT(isnull(c.fmodificado, c.fingreso),'dd/MM/yyyy hh:mm tt') as ffmodificado, 
        FORMAT(isnull(c.ffin, c.fingreso),'dd/MM/yyyy hh:mm tt') as ffin,
        FORMAT(c.finicio,'dd/MM/yyyy hh:mm tt') as ffinicio,
        e.cestado, me.xnombre,
        stuff (( SELECT ';' + b.uasignado from crm_asignado b where b.id_main = c.id group BY b.uasignado for xml path('')),1,1,'') user_asig,
        stuff (( SELECT ';' + convert(varchar,b.cdepartamento) from crm_asignado b where b.id_main = c.id group BY b.cdepartamento for xml path('')),1,1,'') departamento_id,
        c.conversacion_titulo, 
        stuff((SELECT '; ' + bc.name FROM crm_main_contacts cmc JOIN badaco_contactos bc ON bc.contact_id = TRY_CAST(cmc.ccontacto AS INT) WHERE cmc.crm_id = c.id FOR XML PATH('')), 1, 2, '') as xcontacto,
        stuff((SELECT '; ' + CONVERT(varchar, bc.contact_id) FROM crm_main_contacts cmc JOIN badaco_contactos bc ON bc.contact_id = TRY_CAST(cmc.ccontacto AS INT) WHERE cmc.crm_id = c.id FOR XML PATH('')), 1, 2, '') as xcontacto_ids,
        p.xprioridad,
        br.label as xbusiness_relationship,
        c.b_relation_id
        from crm_main c
        LEFT JOIN Users u ON u.Email = c.de_correo
        LEFT JOIN crm_main_estado e ON e.id_main = c.id
        LEFT JOIN crm_mestados me ON me.cestado = e.cestado
        LEFT JOIN crm_mprioridad p ON p.cprioridad = c.cprioridad
        LEFT JOIN crm_case_type ct ON ct.type_id = TRY_CAST(c.asunto_interno AS INT)
        LEFT JOIN m_business_relationship br ON br.b_relation_id = c.b_relation_id
        WHERE c.id = @crm_id
        order BY c.fingreso desc`;

        const request = new sql.Request(transaction);
        request.input('crm_id', sql.Int, crm_id);
        const result = await request.query(sql_query);
        return result;
    }
    static async getCrmEstadosByDepartment(transaction, crm_id) {
        const sql_query = `select * from crm_main_estado where id_main = @crm_id order by cdepartamento`;

        const request = new sql.Request(transaction);
        request.input('crm_id', sql.Int, crm_id);
        const result = await request.query(sql_query);
        return result;
    }

    static async getCrnDetails(conection, res, req) {
        const crm_id = req.body.crm_id
        const pool = await sql.connect(conection)
        const sql_query = `select FORMAT(c.frecibido,'dd/MM/yyyy hh:mm tt') AS ffrecibido, id_main, id_msg, nombre_mensaje, body_mensaje, ms_filename, isnull(u.Name, c.de_nombre) as de, c.ctipo,
        stuff (( select ';' + xname from crm_archivos a WHERE a.id_main = c.id_main AND a.id_msg = c.id_msg group by xname for xml path('')),1,1,'') files,
        stuff (( select ';' + xname from crm_archivos a WHERE a.id_main = c.id_main AND a.id_msg = c.id_msg AND a.favorites = 1 group by xname for xml path('')),1,1,'') favorites_files
        from crm_msg c
        LEFT JOIN Users u ON u.Email = c.de_correo
        where id_main = @crm_id
        order BY c.fingreso desc`

        const crm_msg = await pool.request()
            .input('crm_id', sql.Int, crm_id)
            .query(sql_query)

        return ({ result: 1, crm_msg })
    }

    static async getCrmSirData(conection, res, req) {
        var crm_id = ';' + req.body.crm_id + ';'
        const pool = await sql.connect(conection)
        const sql_query = `
        SELECT concat(CONVERT(varchar,cnota),'-', CONVERT(varchar,cendoso)) AS sir_id, ltrim(rtrim(crm_id)) crm_id, 'Cover Note' AS tabla,
            FORMAT(fingreso,'dd/MM/yyyy hh:mm tt') AS ffingreso, uingreso, FORMAT(fmodificado,'dd/MM/yyyy hh:mm tt') AS ffmodificado, umodificado
        FROM sir_dnota WHERE crm_id LIKE @crm_id
        UNION 
        SELECT CONVERT(varchar,cllamada) AS sir_id, ltrim(rtrim(crm_id)) crm_id, 'Offers' AS tabla,
            FORMAT(fingreso,'dd/MM/yyyy hh:mm tt') AS ffingreso, uingreso, FORMAT(fmodificado,'dd/MM/yyyy hh:mm tt') AS ffmodificado, umodificado
        FROM sir_dllamada WHERE crm_id LIKE @crm_id
        UNION 
        SELECT concat(CONVERT(varchar,caviso),'-', CONVERT(varchar,cn_stro)) AS sir_id, ltrim(rtrim(crm_id)) crm_id, 'Claims Reserve' AS tabla,
            FORMAT(fingreso,'dd/MM/yyyy hh:mm tt') AS ffingreso, uingreso, FORMAT(fmodificado,'dd/MM/yyyy hh:mm tt') AS ffmodificado, umodificado
        FROM sir_daper WHERE crm_id LIKE @crm_id
        UNION
        SELECT concat(CONVERT(varchar,caviso), '-', CONVERT(varchar,cn_stro1)) AS sir_id, ltrim(rtrim(crm_id)) crm_id, 'Claim Payment' AS tabla,
            FORMAT(fingreso,'dd/MM/yyyy hh:mm tt') AS ffingreso, uingreso, FORMAT(fmodificado,'dd/MM/yyyy hh:mm tt') AS ffmodificado, umodificado
        FROM sir_dcomp WHERE crm_id LIKE @crm_id
        UNION
        SELECT concat(CONVERT(varchar,idcontrol), '-', CONVERT(varchar,cn_stro)) AS sir_id, ltrim(rtrim(crm_id)) crm_id, 'Claims' AS tabla,
            FORMAT(fingreso,'dd/MM/yyyy hh:mm tt') AS ffingreso, uingreso, FORMAT(fmodificado,'dd/MM/yyyy hh:mm tt') AS ffmodificado, umodificado
        FROM sir_crcpsinpend WHERE crm_id LIKE @crm_id
        UNION
        SELECT ltrim(rtrim(cncontrato)) AS sir_id, ltrim(rtrim(crm_id)) crm_id, 'Treaty' AS tabla,
            FORMAT(fingreso,'dd/MM/yyyy hh:mm tt') AS ffingreso, uingreso, FORMAT(fmodificado,'dd/MM/yyyy hh:mm tt') AS ffmodificado, umodificado
        FROM sir_crcp WHERE crm_id LIKE @crm_id
        UNION
        SELECT ltrim(rtrim(CONVERT(varchar,cingreso))) AS sir_id, ltrim(rtrim(crm_id)) crm_id, 'Remittances' AS tabla,
            FORMAT(fingreso,'dd/MM/yyyy hh:mm tt') AS ffingreso, uingreso, FORMAT(fmodificado,'dd/MM/yyyy hh:mm tt') AS ffmodificado, umodificado
        FROM sir_paingreso WHERE crm_id LIKE @crm_id
        UNION
        SELECT ltrim(rtrim(cncontrato)) AS sir_id, ltrim(rtrim(crm_id)) crm_id, 'Treaty' AS tabla,
            FORMAT(fingreso,'dd/MM/yyyy hh:mm tt') AS ffingreso, uingreso, FORMAT(fmodificado,'dd/MM/yyyy hh:mm tt') AS ffmodificado, umodificado
        FROM sir_crcnp WHERE crm_id LIKE @crm_id
        `;

        const crm_msg = await pool.request()
            .input('crm_id', sql.VarChar, `%${crm_id}%`)
            .query(sql_query)

        return ({ result: 1, rows: crm_msg.recordset })

    }

    static async getCrmCasData(conection, res, req) {
        var { module_code, module_id } = req.body
        const pool = await sql.connect(conection)
        const sql_query = `SELECT id, module_code, module_id, reference_type, reference, reference_id,
            FORMAT(fingreso,'dd/MM/yyyy hh:mm tt') AS ffingreso
            FROM cas_reference WHERE module_code = @module_code AND module_id = @module_id`
        const result = await pool.request()
            .input('module_code', sql.VarChar, module_code)
            .input('module_id', sql.Int, module_id)
            .query(sql_query)
        return ({ result: 1, rows: result.recordset })
    }

    static async addCasdata(conection, res, req) {
        try {
            const { modulo, value, module_code, module_id, userid } = req.body
            const exist = await cas_post_validation(modulo, value)
            if (!exist) return res.send({ result: 2 })
            const pool = await sql.connect(conection)
            const reference = value.split("-")[0]
            const reference_id = value.split("-")[1]
            const check = await pool.request()
                .input('module_code', sql.VarChar, module_code)
                .input('module_id', sql.Int, module_id)
                .input('reference', sql.Int, reference)
                .input('reference_id', sql.Int, reference_id)
                .query(`SELECT id FROM cas_reference WHERE module_code = @module_code AND module_id = @module_id AND reference = @reference AND reference_id = @reference_id`)
            if (check.recordset.length > 0) {
                return res.send({ result: 3 })
            }
            await pool.request()
                .input('module_code', sql.VarChar, module_code)
                .input('module_id', sql.Int, module_id)
                .input('reference_type', sql.VarChar, modulo)
                .input('reference', sql.Int, reference)
                .input('reference_id', sql.Int, reference_id)
                .input('userid', sql.VarChar, userid)
                .query(`INSERT INTO cas_reference (module_code, module_id, reference_type, reference, reference_id, fingreso, uingreso)
                    VALUES (@module_code, @module_id, @reference_type, @reference, @reference_id, getdate(), @userid)`)
            res.send({ result: 1 })
        } catch (err) {
            console.log(err)
            res.send({ result: 0, err })
        }
    }

    static async deleteCasdata(conection, res, req) {
        try {
            const { cas_id } = req.body
            const pool = await sql.connect(conection)
            await pool.request()
                .input('cas_id', sql.Int, cas_id)
                .query(`DELETE FROM cas_reference WHERE id = @cas_id`)
            res.send({ result: 1 })
        } catch (err) {
            console.log(err)
            res.send({ result: 0, err })
        }
    }

    static async getCrmAssigned(conection, res, req) {
        var dep = req.body.cdepartamento
        var crm_id = req.body.crm_id
        let sql_query = `select a.uasignado, a.fingreso, u.Name, d.id, d.nombre from crm_asignado a
        left join Users u on u.UserID = a.uasignado
        left join departamentos d on d.id = a.cdepartamento
        where a.cdepartamento = @dep AND a.id_main = @crm_id
        order by u.Name`
        const pool = await sql.connect(conection)
        const asignados = await pool.request()
            .input('dep', sql.Int, dep)
            .input('crm_id', sql.Int, crm_id)
            .query(sql_query)

        return ({ result: 1, asignados: asignados.recordset })

    }

    static async getStateForDepartamento(conection, res, req) {
        var xdepartamento = req.body.xdepartamento
        const pool = await sql.connect(conection)
        const sql_query = `SELECT id AS cdepartamento FROM departamentos WHERE nombre = @xdepartamento`

        const departaments = await pool.request()
            .input('xdepartamento', sql.VarChar, xdepartamento)
            .query(sql_query)

        let cdepartamento = departaments.recordset[0].cdepartamento
        const sql_query2 = `SELECT * FROM crm_mestados e
                WHERE e.cdepartamento = @cdepartamento OR e.cdepartamento = 0
                order by cestado`
        const result = await pool.request()
            .input('cdepartamento', sql.VarChar, cdepartamento)
            .query(sql_query2)

        return ({ result: 1, estados_dep: result.recordset })
    }

    static async getAssigned(conection, res, req) {
        const { crm_id, cdepartamento } = req.body
        const pool = await sql.connect(conection)
        const sql_query = `select * from crm_asignado where id_main = @crm_id`

        const crmAssigned = await pool.request()
            .input('crm_id', sql.Int, crm_id)
            .query(sql_query)

        const query = `SELECT u.userid,u.Name,d.nombre AS xdepartamento,d.manager,d.id AS department_id,
    CASE
        WHEN u.userid = d.manager THEN 'Head' 
        ELSE 'Employee' 
    END AS role
FROM 
    Users u 
    LEFT JOIN mdepartamento d ON d.id = u.cdepartamento 
WHERE 
    u.cdepartamento IS NOT NULL 
    AND d.id <> 10 
    AND u.estado = 1 
    AND u.ccompania = 1
    ${crmAssigned.recordset.map((assigned) => `AND u.userid <> '${assigned.uasignado}'`).join(' ')}
ORDER BY 
    d.nombre, 
    role DESC,
    u.Name
`

        const usersRecord = await pool.request()
            .query(query)
        const usuarios = usersRecord.recordset
        // .reduce((acc, current) => {
        //     if (current.id === cdepartamento || current.userid === current.manager) acc.push(current)
        // //     if (current.role === 'Employee' && current.department_id == cdepartamento) acc.push(current)
        // //     return acc;
        // }, [])

        return ({ result: 1, usuarios })

    }

    static async addSirdata(conection, res, req) {
        try {
            const { modulo, value, crm_main, userid } = req.body
            const exist = await sir_post_validation(modulo, value)
            if (!exist) return res.send({ result: 2 })
            const pool = await sql.connect(conection)
            const principal = value.split("-")[0]
            const endoso = value.split("-")[1]
            let result

            switch (modulo) {
                case "fac_Cover Note":
                    result = await pool.request()
                        .input('cnota', sql.Int, principal)
                        .input('cendoso', sql.Int, endoso)
                        .input('crm_main', sql.VarChar, crm_main)
                        .input('userid', sql.VarChar, userid)
                        .query(`MERGE sir_dnota AS target
                                USING (SELECT @cnota AS cnota, @cendoso AS cendoso) AS source
                                    ON (target.cnota = source.cnota AND target.cendoso = source.cendoso)
                                WHEN MATCHED AND (target.crm_id IS NULL OR target.crm_id NOT LIKE '%;' + @crm_main + ';%') THEN
                                    UPDATE SET
                                        crm_id = ISNULL(NULLIF(LTRIM(RTRIM(target.crm_id)),''), ';') + @crm_main + ';',
                                        fingreso = ISNULL(target.fingreso, getdate()),
                                        uingreso = ISNULL(target.uingreso, @userid),
                                        fmodificado = getdate(),
                                        umodificado = @userid
                                WHEN NOT MATCHED THEN
                                    INSERT (cnota, cendoso, crm_id, fingreso, uingreso, fmodificado, umodificado)
                                    VALUES (@cnota, @cendoso, ';' + @crm_main + ';', getdate(), @userid, getdate(), @userid);`)
                    break
                case "fac_Offers":
                    result = await pool.request()
                        .input('cllamada', sql.Int, principal)
                        .input('crm_main', sql.VarChar, crm_main)
                        .input('userid', sql.VarChar, userid)
                        .query(`MERGE sir_dllamada AS target
                                USING (SELECT @cllamada AS cllamada) AS source
                                    ON (target.cllamada = source.cllamada)
                                WHEN MATCHED AND (target.crm_id IS NULL OR target.crm_id NOT LIKE '%;' + @crm_main + ';%') THEN
                                    UPDATE SET
                                        crm_id = ISNULL(NULLIF(LTRIM(RTRIM(target.crm_id)),''), ';') + @crm_main + ';',
                                        fingreso = ISNULL(target.fingreso, getdate()),
                                        uingreso = ISNULL(target.uingreso, @userid),
                                        fmodificado = getdate(),
                                        umodificado = @userid
                                WHEN NOT MATCHED THEN
                                    INSERT (cllamada, crm_id, fingreso, uingreso, fmodificado, umodificado)
                                    VALUES (@cllamada, ';' + @crm_main + ';', getdate(), @userid, getdate(), @userid);`)
                    break
                case "fac_Claims Reserve":
                    result = await pool.request()
                        .input('caviso', sql.Int, principal)
                        .input('cn_stro', sql.Int, endoso)
                        .input('crm_main', sql.VarChar, crm_main)
                        .input('userid', sql.VarChar, userid)
                        .query(`MERGE sir_daper AS target
                                USING (SELECT @caviso AS caviso, @cn_stro AS cn_stro) AS source
                                    ON (target.caviso = source.caviso AND target.cn_stro = source.cn_stro)
                                WHEN MATCHED AND (target.crm_id IS NULL OR target.crm_id NOT LIKE '%;' + @crm_main + ';%') THEN
                                    UPDATE SET
                                        crm_id = ISNULL(NULLIF(LTRIM(RTRIM(target.crm_id)),''), ';') + @crm_main + ';',
                                        fingreso = ISNULL(target.fingreso, getdate()),
                                        uingreso = ISNULL(target.uingreso, @userid),
                                        fmodificado = getdate(),
                                        umodificado = @userid
                                WHEN NOT MATCHED THEN
                                    INSERT (caviso, cn_stro, crm_id, fingreso, uingreso, fmodificado, umodificado)
                                    VALUES (@caviso, @cn_stro, ';' + @crm_main + ';', getdate(), @userid, getdate(), @userid);`)
                    break
                case "fac_Claim Payment":
                    result = await pool.request()
                        .input('caviso', sql.Int, principal)
                        .input('cn_stro1', sql.Int, endoso)
                        .input('crm_main', sql.VarChar, crm_main)
                        .input('userid', sql.VarChar, userid)
                        .query(`MERGE sir_dcomp AS target
                                USING (SELECT @caviso AS caviso, @cn_stro1 AS cn_stro1) AS source
                                    ON (target.caviso = source.caviso AND target.cn_stro1 = source.cn_stro1)
                                WHEN MATCHED AND (target.crm_id IS NULL OR target.crm_id NOT LIKE '%;' + @crm_main + ';%') THEN
                                    UPDATE SET
                                        crm_id = ISNULL(NULLIF(LTRIM(RTRIM(target.crm_id)),''), ';') + @crm_main + ';',
                                        fingreso = ISNULL(target.fingreso, getdate()),
                                        uingreso = ISNULL(target.uingreso, @userid),
                                        fmodificado = getdate(),
                                        umodificado = @userid
                                WHEN NOT MATCHED THEN
                                    INSERT (caviso, cn_stro1, crm_id, fingreso, uingreso, fmodificado, umodificado)
                                    VALUES (@caviso, @cn_stro1, ';' + @crm_main + ';', getdate(), @userid, getdate(), @userid);`)
                    break
                case "treaty_Claims":
                    result = await pool.request()
                        .input('idcontrol', sql.Int, principal)
                        .input('cn_stro', sql.Int, endoso)
                        .input('crm_main', sql.VarChar, crm_main)
                        .input('userid', sql.VarChar, userid)
                        .query(`MERGE sir_crcpsinpend AS target
                                USING (SELECT @idcontrol AS idcontrol, @cn_stro AS cn_stro) AS source
                                    ON (target.idcontrol = source.idcontrol AND target.cn_stro = source.cn_stro)
                                WHEN MATCHED AND (target.crm_id IS NULL OR target.crm_id NOT LIKE '%;' + @crm_main + ';%') THEN
                                    UPDATE SET
                                        crm_id = ISNULL(NULLIF(LTRIM(RTRIM(target.crm_id)),''), ';') + @crm_main + ';',
                                        fingreso = ISNULL(target.fingreso, getdate()),
                                        uingreso = ISNULL(target.uingreso, @userid),
                                        fmodificado = getdate(),
                                        umodificado = @userid
                                WHEN NOT MATCHED THEN
                                    INSERT (idcontrol, cn_stro, crm_id, fingreso, uingreso, fmodificado, umodificado)
                                    VALUES (@idcontrol, @cn_stro, ';' + @crm_main + ';', getdate(), @userid, getdate(), @userid);`)
                    break
                case "treaty_Remittances":
                    result = await pool.request()
                        .input('cingreso', sql.VarChar, principal)
                        .input('crm_main', sql.VarChar, crm_main)
                        .input('userid', sql.VarChar, userid)
                        .query(`MERGE sir_paingreso AS target
                                USING (SELECT @cingreso AS cingreso) AS source
                                    ON (target.cingreso = source.cingreso)
                                WHEN MATCHED AND (target.crm_id IS NULL OR target.crm_id NOT LIKE '%;' + @crm_main + ';%') THEN
                                    UPDATE SET
                                        crm_id = ISNULL(NULLIF(LTRIM(RTRIM(target.crm_id)),''), ';') + @crm_main + ';',
                                        fingreso = ISNULL(target.fingreso, getdate()),
                                        uingreso = ISNULL(target.uingreso, @userid),
                                        fmodificado = getdate(),
                                        umodificado = @userid
                                WHEN NOT MATCHED THEN
                                    INSERT (cingreso, crm_id, fingreso, uingreso, fmodificado, umodificado)
                                    VALUES (@cingreso, ';' + @crm_main + ';', getdate(), @userid, getdate(), @userid);`)
                    break
                case "treaty_Treaty":
                    result = await pool.request()
                        .input('cncontrato', sql.VarChar, principal)
                        .input('crm_main', sql.VarChar, crm_main)
                        .input('userid', sql.VarChar, userid)
                        .query(`MERGE sir_crcp AS target
                                USING (SELECT @cncontrato AS cncontrato) AS source
                                    ON (target.cncontrato = source.cncontrato)
                                WHEN MATCHED AND (target.crm_id IS NULL OR target.crm_id NOT LIKE '%;' + @crm_main + ';%') THEN
                                    UPDATE SET
                                        crm_id = ISNULL(NULLIF(LTRIM(RTRIM(target.crm_id)),''), ';') + @crm_main + ';',
                                        fingreso = ISNULL(target.fingreso, getdate()),
                                        uingreso = ISNULL(target.uingreso, @userid),
                                        fmodificado = getdate(),
                                        umodificado = @userid
                                WHEN NOT MATCHED THEN
                                    INSERT (cncontrato, crm_id, fingreso, uingreso, fmodificado, umodificado)
                                    VALUES (@cncontrato, ';' + @crm_main + ';', getdate(), @userid, getdate(), @userid);
                                MERGE sir_crcnp AS target
                                USING (SELECT @cncontrato AS cncontrato) AS source
                                    ON (target.cncontrato = source.cncontrato)
                                WHEN MATCHED AND (target.crm_id IS NULL OR target.crm_id NOT LIKE '%;' + @crm_main + ';%') THEN
                                    UPDATE SET
                                        crm_id = ISNULL(NULLIF(LTRIM(RTRIM(target.crm_id)),''), ';') + @crm_main + ';',
                                        fingreso = ISNULL(target.fingreso, getdate()),
                                        uingreso = ISNULL(target.uingreso, @userid),
                                        fmodificado = getdate(),
                                        umodificado = @userid
                                WHEN NOT MATCHED THEN
                                    INSERT (cncontrato, crm_id, fingreso, uingreso, fmodificado, umodificado)
                                    VALUES (@cncontrato, ';' + @crm_main + ';', getdate(), @userid, getdate(), @userid);`)
                    break
                default:
                    return res.send({ result: 0 })
            }

            // rowsAffected[0] === 0 means crm_main is already associated
            if (result.rowsAffected[0] === 0) {
                return res.send({ result: 3 })
            }
            res.send({ result: 1 })
        } catch (err) {
            console.log(err)
            res.send({ result: 0, err })
        }
    }

    static async updateCRMState(transaction, crm_id, estado_valor, cdepartamento, date) {
        const request = new sql.Request(transaction);
        await request
            .input('crm_id', sql.Int, crm_id)
            .input('estado_valor', sql.Int, estado_valor)
            .input('cdepartamento', sql.Int, cdepartamento)
            .input('date', sql.NVarChar, date)
            .query(`
                UPDATE crm_main_estado 
                SET cestado = @estado_valor, fmodificado = @date
                WHERE id_main = @crm_id AND cdepartamento = @cdepartamento
            `);
    }

    static async updateCRMMain(transaction, crm_id, date) {
        const request = new sql.Request(transaction);
        await request
            .input('crm_id', sql.Int, crm_id)
            .input('date', sql.NVarChar, date)
            .query(`
                UPDATE crm_main 
                SET fmodificado = @date
                WHERE id = @crm_id
            `);
    }

    static async getEstadoByValue(transaction, estado_valor) {
        const request = new sql.Request(transaction);
        const result = await request
            .input('estado_valor', sql.Int, estado_valor)
            .query(`
                SELECT * FROM crm_mestados 
                WHERE cestado = @estado_valor
            `);
        return result.recordset;
    }

    static async crmMsgInsert(conection, res, req) {
        const { userid, UserEmail, crm_id, cdepartamento, departamento: xdepartamento, nombre_mensaje, mensaje } = req.body;
        const user_name = req.session.userID;
        
        const systemMessages = ['Add user', 'Remove user', 'Change estatus'];
        const ctipo = systemMessages.includes(nombre_mensaje) ? 3 : 1;
        await sql.connect(conection)
        const transaction = new sql.Transaction();
        
        try {
            await transaction.begin();
            const userData = await USERModel.obtenerDatosUsuario(transaction, user_name);
            const request = new sql.Request(transaction);
            const requestInsert = new sql.Request(transaction);

            request.input('crm_id', sql.Int, crm_id);
            const result = await request.query(`
                select * from crm_main m
                LEFT OUTER JOIN (SELECT id_main, COUNT(*) cnt FROM .crm_msg GROUP BY id_main) as x ON x.id_main = m.id
                where id = @crm_id
            `);
            const crm_main = result.recordset.shift()
            const id_msg = crm_main.cnt + 1
            const date = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 19)
                .replace('T', ' ');

            await requestInsert.input('crm_id', sql.Int, crm_id)
                .input('id_mensaje', sql.NVarChar, crm_main.conversacion_id)
                .input('userid', sql.NVarChar, userid)
                .input('de_nombre', sql.NVarChar,  userData.UserName)
                .input('cdepartamento', sql.Int, cdepartamento)
                .input('xdepartamento', sql.NVarChar, xdepartamento)
                .input('nombre_mensaje', sql.NVarChar, nombre_mensaje)
                .input('id_msg', sql.Int, id_msg)
                .input('mensaje', sql.NVarChar, mensaje)
                .input('date', sql.NVarChar, date)
                .input('ctipo', sql.Int, ctipo)
                .query(`
                insert into crm_msg ("id_mensaje", "id_main", "nombre_mensaje", "body_mensaje", "id_msg", "de_nombre", "ctipo")
                VALUES (@id_mensaje, @crm_id, @nombre_mensaje, @mensaje, @id_msg, @de_nombre, @ctipo)`);

            await transaction.commit()
            return ({ result: 1 })

        } catch (err) {
            try { await transaction.rollback(); } catch (_) {}
            return { result: 0, err }
        }
    }

    // Adds a "New comment" message to an existing CRM case, with optional file attachments.
    static async addComment(conection, crm_id, description, UserName, files = null) {
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();

            const caseRequest = new sql.Request(transaction);
            const caseResult = await caseRequest
                .input('crm_id', sql.Int, crm_id)
                .query('SELECT id FROM crm_main WHERE id = @crm_id');
            if (!caseResult.recordset.length) {
                await transaction.rollback();
                return { result: 0, err: 'CRM case not found' };
            }

            const countRequest = new sql.Request(transaction);
            const countResult = await countRequest
                .input('crm_id', sql.Int, crm_id)
                .query('SELECT COUNT(*) id_msg FROM dbo.crm_msg WHERE id_main = @crm_id');
            const id_msg = countResult.recordset[0].id_msg + 1;

            await CRMModel.createNewMessage(transaction, crm_id, 'New comment', description, id_msg, UserName, files);

            const updateRequest = new sql.Request(transaction);
            await updateRequest
                .input('crm_id', sql.Int, crm_id)
                .query('UPDATE crm_main SET fmodificado = getdate() WHERE id = @crm_id');

            await transaction.commit();
            return { result: 1, id_msg };
        } catch (err) {
            try { await transaction.rollback(); } catch (_) {}
            return { result: 0, err: err.message };
        }
    }

    static async crmRemoveUser(conection, res, req) {
        const { u_asignado: user, crm_id } = req.body;
        await sql.connect(conection)
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();
            const requestUser = new sql.Request(transaction);
            const { recordset: users } = await requestUser.input('user', sql.VarChar, user)
                .query(`
                select * from Users u
                LEFT JOIN departamentos d ON d.id = u.cdepartamento
                where UserId = @user
                `);

            const requestCRMAsigned = new sql.Request(transaction);
            const cdepartamento = users[0].cdepartamento
            const resultQuery = await requestCRMAsigned
                .input('user', sql.VarChar, user)
                .input('crm_id', sql.Int, crm_id)
                .input('cdepartamento', sql.VarChar, cdepartamento)
                .query(`select * FROM crm_asignado WHERE id_main = @crm_id AND cdepartamento = @cdepartamento`);

            if (resultQuery.recordset.length === 1) {
                try { await transaction.rollback(); } catch (_) {}
                return { result: 2 };
            }

            const requestDeleteCRMAsigned = new sql.Request(transaction);
            await requestDeleteCRMAsigned
                .input('user', sql.VarChar, user)
                .input('crm_id', sql.Int, crm_id)
                .input('cdepartamento', sql.VarChar, cdepartamento)
                .query(`DELETE FROM crm_asignado WHERE id_main = @crm_id AND uasignado = @user`);

            const requestCRMAssigned = new sql.Request(transaction);
            const { recordset: crm_asignado } = await requestCRMAssigned
                .input('crm_id', sql.Int, crm_id)
                .query(`SELECT * from crm_asignado where id_main = @crm_id`);
            const dep_nuevo = crm_asignado.map((assigned) => assigned.cdepartamento).join(';')

            const requestUpdateCrmMain = new sql.Request(transaction);
            await requestUpdateCrmMain
                .input('crm_id', sql.Int, crm_id)
                .input('departamento_id', sql.VarChar, dep_nuevo)
                .query(`UPDATE crm_main set departamento_id = @departamento_id where id = @crm_id`);

            await transaction.commit()
            return ({ result: 1, dep_nuevo, users });

        } catch (err) {
            try { await transaction.rollback(); } catch (_) {}
            return { result: 0, err }
        }
    }

    static async addAsigneds(conection, res, req) {
        const { user, crm_id } = req.body;
        const assignorId = req.session.userID;
        let dataToSend;
        await sql.connect(conection)
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();
            const requestUser = new sql.Request(transaction);
            const { recordset: users } = await requestUser
                .input('user', sql.VarChar, user)
                .query(`select *,d.nombre as xdepartamento from Users u LEFT JOIN departamentos d ON d.id = u.cdepartamento where UserId = @user`);

            const requestAssignor = new sql.Request(transaction);
            const { recordset: assignorRecord } = await requestAssignor
                .input('assignorId', sql.VarChar, assignorId)
                .query(`SELECT Name FROM Users WHERE UserID = @assignorId`);
            const assignorName = assignorRecord[0]?.Name || assignorId;

            const requestCrmAsignado = new sql.Request(transaction)
            const cdepartamento = users[0].cdepartamento
            await requestCrmAsignado
                .input('user', sql.VarChar, user)
                .input('crm_id', sql.Int, crm_id)
                .input('cdepartamento', sql.VarChar, cdepartamento)
                .query(`insert into crm_asignado ("id_main", "uasignado", "cdepartamento") VALUES (@crm_id, @user, @cdepartamento)`);

            const requestCrmMainEstado = new sql.Request(transaction)
            const resultQuery = await requestCrmMainEstado
                .input('user', sql.VarChar, user)
                .input('crm_id', sql.Int, crm_id)
                .input('cdepartamento', sql.VarChar, cdepartamento)
                .query(`select * from crm_main_estado where id_main = @crm_id and cdepartamento = @cdepartamento`);

            if (resultQuery.rowsAffected < 1) {
                const requestCrmMainEstadoInsert = new sql.Request(transaction)
                await requestCrmMainEstadoInsert
                    .input('crm_id', sql.Int, crm_id)
                    .input('cdepartamento', sql.Int, cdepartamento)
                    .input('cestado', sql.Int, 0)
                    .query(`insert into crm_main_estado ("id_main", "cdepartamento", "cestado") VALUES (@crm_id, @cdepartamento, @cestado)`);
                    
                }
            await transaction.commit()
            // Send email notification fire-and-forget so it never blocks or rolls back the assignment
            const _emailUsers = users
            Promise.resolve().then(async () => {
                try {
                    const pool = await sql.connect(conection)
                    const { recordset } = await pool.request()
                        .input('crm_id', sql.Int, crm_id)
                        .query(`SELECT TOP 1 crm_main.*, crm_asignado.*, crm_main_estado.* FROM crm_main
                            INNER JOIN crm_asignado ON crm_main.id = crm_asignado.id_main
                            INNER JOIN crm_main_estado ON crm_main.id = crm_main_estado.id_main WHERE crm_main.id = @crm_id`)
                    if (recordset.length > 0) {
                        const prepareEmails = await prepareEmailForPending(recordset[0], _emailUsers[0].Name, _emailUsers[0].Email)
                        await pool.request()
                            .input('a', sql.NVarChar, _emailUsers[0].Email)
                            .input('de', sql.NVarChar, 'no-reply@acreinsurance.com')
                            .input('sujeto', sql.NVarChar, 'CRM task has been assigned to you')
                            .input('body', sql.NVarChar, prepareEmails.body)
                            .query(`INSERT INTO emails (a, de, sujeto, body) VALUES (@a, @de, @sujeto, @body)`)
                    }
                } catch (emailErr) {
                    console.error('CRM add user email notification failed:', emailErr.message)
                }
            }).catch(() => {})
            return ({ result: 1, dep_nuevo: cdepartamento, users, assignorName })
        } catch (err) {
            try { await transaction.rollback(); } catch (_) {}
            return { result: 0, err: err.message }
        }

    }

    static async createCRMPendingTasks(transaction) {
        const query = `
            SELECT crm_main.*, crm_asignado.*, crm_main_estado.*
            FROM crm_main
            INNER JOIN crm_asignado ON crm_main.id = crm_asignado.id_main
            INNER JOIN crm_main_estado ON crm_main.id = crm_main_estado.id_main
            WHERE crm_main_estado.cestado != 999;
        `;
        const request = new sql.Request(transaction);
        const { recordset } = await request.query(query);
        return recordset;
    }

    static async createEmail(transaction, a, de, sujeto, body) {
        let formId = null;
        const request = new sql.Request(transaction);
        const { recordset } = await request
        .input('a', sql.NVarChar, a)
        .input('de', sql.NVarChar, de)
        .input('sujeto', sql.NVarChar, sujeto)
        .input('body', sql.NVarChar, body)
        .query(`INSERT INTO emails (a, de, sujeto, body) OUTPUT INSERTED.ID VALUES (@a, @de, @sujeto, @body);`);
        formId = recordset[0].ID;
        return formId;
    }

    static async getUserBydepartment(transaction, deparment) {
        const request = new sql.Request(transaction);
        const query = `SELECT Name, UserID, Modules FROM Users WHERE cdepartamento = @deparment AND Estado = 1 ORDER BY Name ASC`;
        request.input('deparment', sql.VarChar, deparment)
        const { recordset } = await request.query(query);
        return recordset;
    }

    static async getCRMPrioridad(transaction) {
        const request = new sql.Request(transaction);
        const query = `SELECT cprioridad, ndias FROM crm_mprioridad`;
        const { recordset } = await request.query(query);
        return recordset;
    }
    /**
     * Returns all colleagues the current user should be able to filter by.
     * Scope: user's own department(s) + any child departments (parent_of) when the
     * user is the manager or suplente of that department.
     *
     * @param {sql.Transaction} transaction
     * @param {string} userID       - the logged-in user's UserID
     * @returns {Array<{UserID, Name, departamento}>}
     */
    static async getFilterColleagues(transaction, userID) {
        // 1. Get user's own cdepartamento (integer) and the full mdepartamento row for it
        const userReq = new sql.Request(transaction);
        userReq.input('userID', sql.VarChar, userID);
        const userRow = await userReq.query(
            `SELECT u.cdepartamento, d.manager, d.suplente, d.parent_of
             FROM Users u
             LEFT JOIN mdepartamento d ON d.id = u.cdepartamento
             WHERE u.UserID = @userID`
        );

        if (!userRow.recordset.length) return [];

        const { cdepartamento, manager, suplente, parent_of } = userRow.recordset[0];

        // 2. Build the set of department IDs to include
        const depSet = new Set();
        if (cdepartamento) depSet.add(String(cdepartamento));

        // If user is manager or suplente of their department, include parent_of children
        const isManager = manager === userID || suplente === userID;
        if (isManager && parent_of) {
            parent_of.split(';').map(s => s.trim()).filter(Boolean).forEach(id => depSet.add(id));
        }

        if (depSet.size === 0) return [];

        // 3. Also check if user is manager/suplente of OTHER departments (multi-dept managers)
        const mgReq = new sql.Request(transaction);
        mgReq.input('userID', sql.VarChar, userID);
        const managedDeps = await mgReq.query(
            `SELECT id, parent_of FROM mdepartamento WHERE manager = @userID OR suplente = @userID`
        );
        for (const dep of managedDeps.recordset) {
            depSet.add(String(dep.id));
            if (dep.parent_of) {
                dep.parent_of.split(';').map(s => s.trim()).filter(Boolean).forEach(id => depSet.add(id));
            }
        }

        // 4. Fetch all active users from the collected departments
        const depArr = Array.from(depSet);
        const usersReq = new sql.Request(transaction);
        depArr.forEach((id, i) => usersReq.input(`dep${i}`, sql.VarChar, id));
        usersReq.input('userDep', sql.VarChar, String(cdepartamento));
        const usersResult = await usersReq.query(
            `SELECT u.UserID, u.Name, d.nombre AS departamento
             FROM Users u
             LEFT JOIN mdepartamento d ON d.id = u.cdepartamento
             WHERE u.Estado = 1
               AND u.UserID IS NOT NULL
             ORDER BY CASE WHEN CAST(u.cdepartamento AS VARCHAR) = @userDep THEN 0 ELSE 1 END ASC,
                      d.nombre ASC, u.Name ASC`
        );

        return usersResult.recordset
    }

    static async getCaseTypeLabelById(transaction, type_id) {
        const request = new sql.Request(transaction);
        request.input('type_id', sql.Int, parseInt(type_id, 10));
        const { recordset } = await request.query(`SELECT label FROM crm_case_type WHERE type_id = @type_id`);
        return recordset[0]?.label || null;
    }

    static async createNewCase(transaction, userEmail, asignados, description, cprioridad  , conversacion_titulo, u_asignado, departamento_id, asuntoOutlook, dateOutlook, asunto_interno, detalle, dueDate, dep, business_relationship = null, startDate = null) {
        // Insert main CRM record and capture inserted ID
        const insertMainQuery = `
            INSERT INTO crm_main (cprioridad,conversacion_titulo,departamento_id,de_correo,de_nombre,asunto_interno,ffin,finicio,b_relation_id)
            OUTPUT INSERTED.id
            VALUES (@cprioridad,@conversacion_titulo,@departamento_id,@de_correo,@de_nombre,@asunto_interno,@ffin,@finicio,@b_relation_id);`;

        const requestCreateMain = new sql.Request(transaction);
        const { recordset } = await requestCreateMain
            // Note: Column name is cprioridad in DB. Map param cprioridad  -> cprioridad
            .input('cprioridad', sql.Int, cprioridad )
            .input('conversacion_titulo', sql.VarChar, conversacion_titulo)
            .input('departamento_id', sql.VarChar, departamento_id)
            .input('de_correo', sql.VarChar, userEmail)
            .input('de_nombre', sql.VarChar, userEmail)
            .input('asunto_interno', sql.VarChar, asunto_interno)
            .input('ffin', sql.Date, dueDate)
            .input('finicio', sql.DateTime, startDate || dueDate)
            .input('b_relation_id', sql.Int, business_relationship ? parseInt(business_relationship) : null)
            // .input('asuntoOutlook', sql.VarChar, description)
            // .input('dateOutlook', sql.VarChar, dateOutlook)
            // .input('detalle', sql.VarChar, detalle)
            .query(insertMainQuery);

        const id = recordset[0].id;

        // Ensure asignados is an array and insert each assignment
        const assignedList = Array.isArray(asignados) ? asignados : (asignados ? [asignados] : []);
        const insertAssignedQuery = `INSERT INTO crm_asignado (id_main, uasignado, cdepartamento) VALUES (@id, @uasignado, @cdepartamento)`;
        let listDeparment = assignedList.filter((item, index, self) => 
            index === self.findIndex((t) => t.department === item.department)
        );
        
        if (dep) {
            const depId = parseInt(dep);
            if (!isNaN(depId) && !listDeparment.some(item => item.department === depId)) {
                listDeparment.push({ department: depId, code: null, name: null });
            }
        }
        
        for (const uasignado of assignedList) {
            const requestInsertAssigned = new sql.Request(transaction);
            await requestInsertAssigned
                .input('id', sql.Int, id)
                .input('uasignado', sql.VarChar, uasignado.code)
                .input('cdepartamento', sql.Int, uasignado.department)
                .query(insertAssignedQuery);
        }
        for (const dep of listDeparment) {
            const requestStatus = new sql.Request(transaction);
            await requestStatus
                .input('id_main', sql.Int, id)
                .input('cdepartamento', sql.Int, dep.department)
                .input('cestado', sql.Int, 0)
                .query(`INSERT INTO crm_main_estado (id_main, cdepartamento, cestado)
                VALUES (@id_main, @cdepartamento, @cestado)`);
        }

        return id;

    } 

    static async createNewMessage(transaction, id_main, nombre_mensaje, body_mensaje, id_msg, de_nombre, files = null, ctipo = 1) {
    // Marcar archivo como favorito
    if (files && files.favoritesUpdate) {
        for (const fav of files.favoritesUpdate) {
            const requestFav = new sql.Request(transaction);
            await requestFav
                .input('id_main', sql.Int, fav.id_main)
                .input('id_msg', sql.Int, fav.id_msg)
                .input('xname', sql.VarChar, fav.xname)
                .input('favorites', sql.Bit, fav.favorites)
                .query('UPDATE crm_archivos SET favorites = @favorites WHERE id_main = @id_main AND id_msg = @id_msg AND xname = @xname');
        }
    }

        
        const requestInsert = new sql.Request(transaction);
        await requestInsert
            .input('id_main', sql.Int, id_main)
            .input('nombre_mensaje', sql.VarChar, nombre_mensaje)
            .input('body_mensaje', sql.VarChar, body_mensaje)
            .input('id_msg', sql.Int, id_msg)
            .input('de_nombre', sql.VarChar, de_nombre)
            .input('ctipo', sql.Int, ctipo)
            .query(`INSERT INTO crm_msg (id_main, nombre_mensaje, body_mensaje, id_msg, de_nombre, ctipo)
            VALUES (@id_main, @nombre_mensaje, @body_mensaje, @id_msg, @de_nombre, @ctipo)`);

        if (files !== null && files.Supportfiles) {
            const crm_dir = `//${process.env.file_server}/CRM/`
            var folderPath = join(crm_dir, String(id_main));  
            if (!existsSync(folderPath)) {
                mkdirSync(folderPath);
            }
            var folderPath = join(crm_dir, String(id_main), String(id_msg));   
            if (!existsSync(folderPath)) {
                mkdirSync(folderPath);
            } 
            if (files.Supportfiles.name) {
                let file = files.Supportfiles;
                let filename = nombres_latinos(file.name)
                let sql_query = `insert into crm_archivos (id_main, id_msg, xname)
                VALUES (@crm_id, @id_msg, @xname)`
                    const requestInsert2 = new sql.Request(transaction);
                    await requestInsert2
                    .input('crm_id', sql.Int, id_main)
                    .input('id_msg', sql.Int, id_msg)
                    .input('xname', sql.VarChar, filename)
                    .query(sql_query)
                var filePath = join(folderPath, filename);
                file.mv(filePath);
            } else {
                for (const key of Object.keys(files.Supportfiles)) {
                    const file = files.Supportfiles[key];
                    const filename = nombres_latinos(file.name);
                    const requestInsert3 = new sql.Request(transaction);
                    await requestInsert3
                        .input('crm_id', sql.Int, id_main)
                        .input('id_msg', sql.Int, id_msg)
                        .input('xname', sql.VarChar, filename)
                        .query(`INSERT INTO crm_archivos (id_main, id_msg, xname)
                            VALUES (@crm_id, @id_msg, @xname)
                        `);

                    const filePath = join(folderPath, filename);
                    await file.mv(filePath);
                            
                }  
        }
    }
    }

    static async createCRMStatus(transaction, id_main, cdepartamento, cestado) {
        const requestInsert = new sql.Request(transaction);
        await requestInsert
            .input('id_main', sql.Int, id_main)
            .input('cdepartamento', sql.Int, cdepartamento)
            .input('cestado', sql.Int, cestado)
            .query(`INSERT INTO crm_main_estado (id_main, cdepartamento, cestado)
            VALUES (@id_main, @cdepartamento, @cestado)`);
        return id_main;
    }
    static async getUserByGroupCRM(transaction, ms_id) {
        const request = new sql.Request(transaction);
        const query = `SELECT xintegrantes FROM mgroups WHERE ms_id = @ms_id `;
        request.input('ms_id', sql.VarChar, ms_id)
        const { recordset } = await request.query(query);
        return recordset;
    }
    
    static async getAllCrmAssignedMembers(transaction, id_main, cdepartamentoToExclude) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT a.uasignado, a.fingreso, a.cdepartamento, u.Name, d.nombre as departamento_nombre
            FROM crm_asignado a
            LEFT JOIN Users u ON u.UserID = a.uasignado
            LEFT JOIN mdepartamento d ON d.id = a.cdepartamento
            WHERE a.id_main = @id_main AND a.cdepartamento != @cdepartamentoToExclude
            ORDER BY u.Name
        `;
        request.input('id_main', sql.Int, id_main);
        request.input('cdepartamentoToExclude', sql.Int, cdepartamentoToExclude);
        const { recordset } = await request.query(query);
        return recordset;
    }
    
    static async updateStartDate(conection, res, req) {
        try {
            const { crm_id, finicio, UserName } = req.body;
            if (!crm_id || !finicio || !UserName) {
                return { result: 0, err: 'Missing parameters: crm_id, finicio, UserName' };
            }

            const pool = await sql.connect(conection);

            // Parse ISO local datetime (YYYY-MM-DDTHH:mm) directly to avoid timezone shifts
            const isoRe = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
            const m = String(finicio).match(isoRe);
            if (!m) return { result: 0, err: 'Invalid new start date format' };
            const [_, sy, sm, sd, sh, smin] = m;
            const year = parseInt(sy, 10), month = parseInt(sm, 10), day = parseInt(sd, 10);
            const hours = parseInt(sh, 10), minutes = parseInt(smin, 10);

            // Create Date via Date.UTC so mssql (which serializes in UTC) stores the exact parsed values
            const startDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
            if (isNaN(startDate.getTime())) {
                return { result: 0, err: 'Invalid new start date' };
            }

            // Fetch old date formatted directly from SQL (avoids JS Date timezone issues)
            const oldDateQuery = await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .query(`SELECT FORMAT(finicio, 'dd/MM/yyyy hh:mm tt') AS old_finicio FROM crm_main WHERE id = @crm_id`);
            const oldFormatted = oldDateQuery.recordset?.[0]?.old_finicio || 'N/A';

            // Format new date from parsed parts (no timezone dependency)
            const newFormatted = (() => {
                const h12 = hours % 12 || 12;
                const ampm = hours >= 12 ? 'PM' : 'AM';
                return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year} ${String(h12).padStart(2,'0')}:${String(minutes).padStart(2,'0')} ${ampm}`;
            })();

            await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .input('finicio', sql.DateTime, startDate)
                .query(`UPDATE crm_main SET finicio = @finicio, fmodificado = GETDATE() WHERE id = @crm_id`);

            const { recordset } = await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .query(`SELECT COUNT(*) AS id_msg FROM crm_msg WHERE id_main = @crm_id`);
            const nextId = (recordset?.[0]?.id_msg || 0) + 1;

            const bodyMsg = `The start date has been updated from '${oldFormatted}' to '${newFormatted}'.`;
            await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .input('nombre_mensaje', sql.VarChar, 'System Update')
                .input('body_mensaje', sql.VarChar, bodyMsg)
                .input('id_msg', sql.Int, nextId)
                .input('de_nombre', sql.VarChar, UserName)
                .query(`INSERT INTO crm_msg (id_main, nombre_mensaje, body_mensaje, id_msg, de_nombre, ctipo)
                        VALUES (@crm_id, @nombre_mensaje, @body_mensaje, @id_msg, @de_nombre, 3)`);

            return { result: 1 };
        } catch (err) {
            console.log(err);
            return { result: 0, err: err.message };
        }
    }

    static async updateDueDate(conection, res, req) {
        try {
            const { crm_id, ffin, UserName } = req.body;
            if (!crm_id || !ffin || !UserName) {
                return { result: 0, err: 'Missing parameters: crm_id, ffin, UserName' };
            }

            const pool = await sql.connect(conection);

            // Parse ISO local datetime (YYYY-MM-DDTHH:mm) directly to avoid timezone shifts
            const isoRe = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
            const m = String(ffin).match(isoRe);
            if (!m) return { result: 0, err: 'Invalid new due date format' };
            const [_, sy, sm, sd, sh, smin] = m;
            const year = parseInt(sy, 10), month = parseInt(sm, 10), day = parseInt(sd, 10);
            const hours = parseInt(sh, 10), minutes = parseInt(smin, 10);

            // Create Date via Date.UTC so mssql (which serializes in UTC) stores the exact parsed values
            const dueDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
            if (isNaN(dueDate.getTime())) {
                return { result: 0, err: 'Invalid new due date' };
            }

            // Fetch old date formatted directly from SQL (avoids JS Date timezone issues)
            const oldDateQuery = await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .query(`SELECT FORMAT(ffin, 'dd/MM/yyyy hh:mm tt') AS old_ffin FROM crm_main WHERE id = @crm_id`);
            const oldFormatted = oldDateQuery.recordset?.[0]?.old_ffin || 'N/A';

            // Format new date from parsed parts (no timezone dependency)
            const newFormatted = (() => {
                const h12 = hours % 12 || 12;
                const ampm = hours >= 12 ? 'PM' : 'AM';
                return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year} ${String(h12).padStart(2,'0')}:${String(minutes).padStart(2,'0')} ${ampm}`;
            })();

            // Update due date and modification timestamp
            await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .input('ffin', sql.DateTime, dueDate)
                .query(`UPDATE crm_main SET ffin = @ffin, fmodificado = GETDATE() WHERE id = @crm_id`);

            // Get next id_msg
            const { recordset } = await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .query(`SELECT COUNT(*) AS id_msg FROM crm_msg WHERE id_main = @crm_id`);
            const nextId = (recordset?.[0]?.id_msg || 0) + 1;

            // Insert message log including old and new values
            const bodyMsg = `The due date has been updated from '${oldFormatted}' to '${newFormatted}'.`;
            await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .input('nombre_mensaje', sql.VarChar, 'System Update')
                .input('body_mensaje', sql.VarChar, bodyMsg)
                .input('id_msg', sql.Int, nextId)
                .input('de_nombre', sql.VarChar, UserName)
                .query(`INSERT INTO crm_msg (id_main, nombre_mensaje, body_mensaje, id_msg, de_nombre, ctipo)
                        VALUES (@crm_id, @nombre_mensaje, @body_mensaje, @id_msg, @de_nombre, 3)`);

            return { result: 1 };
        } catch (err) {
            console.log(err);
            return { result: 0, err: err.message };
        }
    }

    static async updateBusinessRelationship(conection, crm_id, b_relation_id, UserName) {
        try {
            const pool = await sql.connect(conection);

            // Fetch old label
            const oldRes = await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .query(`SELECT br.label FROM crm_main c LEFT JOIN m_business_relationship br ON br.b_relation_id = c.b_relation_id WHERE c.id = @crm_id`);
            const oldLabel = oldRes.recordset?.[0]?.label || 'None';

            // Fetch new label
            let newLabel = 'None';
            if (b_relation_id) {
                const newRes = await pool.request()
                    .input('b_relation_id', sql.Int, parseInt(b_relation_id))
                    .query(`SELECT label FROM m_business_relationship WHERE b_relation_id = @b_relation_id`);
                newLabel = newRes.recordset?.[0]?.label || 'None';
            }

            // Update crm_main
            await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .input('b_relation_id', sql.Int, b_relation_id ? parseInt(b_relation_id) : null)
                .query(`UPDATE crm_main SET b_relation_id = @b_relation_id, fmodificado = GETDATE() WHERE id = @crm_id`);

            // Log message
            const { recordset } = await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .query(`SELECT COUNT(*) AS id_msg FROM crm_msg WHERE id_main = @crm_id`);
            const nextId = (recordset?.[0]?.id_msg || 0) + 1;
            const bodyMsg = `Business relationship updated from '${oldLabel}' to '${newLabel}'.`;
            await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .input('nombre_mensaje', sql.VarChar, 'System Update')
                .input('body_mensaje', sql.VarChar, bodyMsg)
                .input('id_msg', sql.Int, nextId)
                .input('de_nombre', sql.VarChar, UserName)
                .query(`INSERT INTO crm_msg (id_main, nombre_mensaje, body_mensaje, id_msg, de_nombre, ctipo) VALUES (@crm_id, @nombre_mensaje, @body_mensaje, @id_msg, @de_nombre, 3)`);

            return { result: 1 };
        } catch (err) {
            console.log(err);
            return { result: 0, err: err.message };
        }
    }

    // MÃ©todos para manejar relaciones approval-CRM
    static async getApprovalCrmRelations(conection, crm_id) {
        try {
            const pool = await sql.connect(conection);
            const query = `
                SELECT acr.id, acr.approval_id, acr.crm_id,
                    a.solicitante, a.proceso, a.detalle_proceso, 
                    FORMAT(a.solicitante_fecha, 'dd/MM/yyyy') as s_fecha,
                    a.estado
                FROM approval_crm_relations acr
                INNER JOIN log a ON a.id = acr.approval_id
                WHERE acr.crm_id = @crm_id
                ORDER BY acr.id DESC
            `;
            const result = await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .query(query);
            
            return { result: 1, relations: result.recordset };
        } catch (err) {
            console.log(err);
            return { result: 0, err: err.message };
        }
    }

    static async addApprovalCrmRelations(conection, req, res) {
        try {
            const { crm_id, approval_ids } = req.body;
            
            if (!crm_id || !approval_ids || !Array.isArray(approval_ids) || approval_ids.length === 0) {
                return { result: 0, err: 'Missing required parameters: crm_id and approval_ids array' };
            }

            const pool = await sql.connect(conection);
            
            // Verificar que relaciones ya existen
            const existingQuery = `
                SELECT approval_id 
                FROM approval_crm_relations 
                WHERE crm_id = @crm_id AND approval_id IN (${approval_ids.map((_, i) => `@check_${i}`).join(',')})
            `;
            
            const checkRequest = pool.request().input('crm_id', sql.Int, crm_id);
            approval_ids.forEach((id, index) => {
                checkRequest.input(`check_${index}`, sql.Int, id);
            });
            
            const existing = await checkRequest.query(existingQuery);
            const existingIds = new Set(existing.recordset.map(r => r.approval_id));
            
            // Filtrar solo los IDs que no existen
            const newApprovalIds = approval_ids.filter(id => !existingIds.has(id));
            
            if (newApprovalIds.length === 0) {
                return { result: 0, err: 'All selected approvals are already linked to this CRM' };
            }
            
            // Insertar las relaciones en batch
            const values = newApprovalIds.map((approval_id, index) => 
                `(@crm_id, @approval_id_${index})`
            ).join(', ');
            
            const query = `
                INSERT INTO approval_crm_relations (crm_id, approval_id)
                VALUES ${values}
            `;
            
            const request = pool.request().input('crm_id', sql.Int, crm_id);
            
            newApprovalIds.forEach((approval_id, index) => {
                request.input(`approval_id_${index}`, sql.Int, approval_id);
            });
            
            await request.query(query);
            
            let message = `${newApprovalIds.length} approval(s) linked successfully`;
            if (existingIds.size > 0) {
                message += ` (${existingIds.size} already linked)`;
            }
            
            return { result: 1, message };
        } catch (err) {
            console.log(err);
            // Si hay error de duplicado, dar mensaje mas amigable
            if (err.message.includes('duplicate') || err.message.includes('UNIQUE')) {
                return { result: 0, err: 'Some approvals are already linked to this CRM' };
            }
            return { result: 0, err: err.message };
        }
    }

    static async removeApprovalCrmRelation(conection, req, res) {
        try {
            const { relation_id } = req.body;
            
            if (!relation_id) {
                return { result: 0, err: 'Missing required parameter: relation_id' };
            }

            const pool = await sql.connect(conection);
            
            const query = `DELETE FROM approval_crm_relations WHERE id = @relation_id`;
            
            await pool.request()
                .input('relation_id', sql.Int, relation_id)
                .query(query);
            
            return { result: 1, message: 'Approval relation removed successfully' };
        } catch (err) {
            console.log(err);
            return { result: 0, err: err.message };
        }
    }

    // ============================================
    // CRM-CRM RELATIONS
    // ============================================
    static async getCrmCrmRelations(conection, crm_id) {
        try {
            if (!crm_id) {
                return { result: 0, err: 'Missing required parameter: crm_id' };
            }

            const pool = await sql.connect(conection);
            
            const query = `
                SELECT
                    ccr.id,
                    ccr.crm_id,
                    ccr.related_crm_id,
                    CASE WHEN ccr.crm_id = @crm_id THEN ccr.related_crm_id ELSE ccr.crm_id END AS related_crm_id_resolved,
                    cm.conversacion_titulo,
                    cm.asunto_interno,
                    cm.fingreso
                FROM crm_crm_relations ccr
                INNER JOIN crm_main cm ON cm.id = (CASE WHEN ccr.crm_id = @crm_id THEN ccr.related_crm_id ELSE ccr.crm_id END)
                WHERE (ccr.crm_id = @crm_id OR ccr.related_crm_id = @crm_id)
                  AND (CASE WHEN ccr.crm_id = @crm_id THEN ccr.related_crm_id ELSE ccr.crm_id END) <> @crm_id
                ORDER BY ccr.id DESC
            `;
            
            const result = await pool.request()
                .input('crm_id', sql.Int, crm_id)
                .query(query);
            
            return { result: 1, relations: result.recordset };
        } catch (err) {
            console.log(err);
            return { result: 0, err: err.message };
        }
    }

    static async addCrmCrmRelations(conection, req, res) {
        try {
            const { crm_id, related_crm_ids } = req.body;
            
            if (!crm_id || !related_crm_ids || !Array.isArray(related_crm_ids) || related_crm_ids.length === 0) {
                return { result: 0, err: 'Missing or invalid parameters' };
            }

            const pool = await sql.connect(conection);
            
            // Verificar que relaciones ya existen (bidireccionales)
            const existingQuery = `
                SELECT DISTINCT
                    CASE 
                        WHEN crm_id = @crm_id THEN related_crm_id 
                        ELSE crm_id 
                    END AS related_id
                FROM crm_crm_relations 
                WHERE (crm_id = @crm_id AND related_crm_id IN (${related_crm_ids.map((_, i) => `@check_${i}`).join(',')}))
                   OR (related_crm_id = @crm_id AND crm_id IN (${related_crm_ids.map((_, i) => `@check_${i}`).join(',')}))
            `;
            
            const checkRequest = pool.request().input('crm_id', sql.Int, crm_id);
            related_crm_ids.forEach((id, index) => {
                checkRequest.input(`check_${index}`, sql.Int, id);
            });
            
            const existing = await checkRequest.query(existingQuery);
            const existingIds = new Set(existing.recordset.map(r => r.related_id));
            
            // Filtrar solo los IDs que no existen
            const newCrmIds = related_crm_ids.filter(id => !existingIds.has(id));
            
            if (newCrmIds.length === 0) {
                return { result: 0, err: 'All selected CRMs are already linked' };
            }
            
            const values = newCrmIds
                .map((_, index) => `(@crm_id, @related_id_${index})`)
                .join(',');
            
            const query = `
                INSERT INTO crm_crm_relations (crm_id, related_crm_id)
                VALUES ${values}
            `;
            
            const request = pool.request()
                .input('crm_id', sql.Int, crm_id)
            
            newCrmIds.forEach((related_id, index) => {
                request.input(`related_id_${index}`, sql.Int, related_id);
            });
            
            await request.query(query);
            
            let message = `${newCrmIds.length} CRM(s) linked successfully`;
            if (existingIds.size > 0) {
                message += ` (${existingIds.size} already linked)`;
            }
            
            return { result: 1, message };
        } catch (err) {
            console.log(err);
            if (err.message.includes('duplicate') || err.message.includes('UNIQUE')) {
                return { result: 0, err: 'Some CRMs are already linked' };
            }
            if (err.message.includes('CHK_crm_not_self')) {
                return { result: 0, err: 'Cannot link a CRM to itself' };
            }
            return { result: 0, err: err.message };
        }
    }

    static async removeCrmCrmRelation(conection, req, res) {
        try {
            const { relation_id } = req.body;
            
            if (!relation_id) {
                return { result: 0, err: 'Missing required parameter: relation_id' };
            }

            const pool = await sql.connect(conection);
            
            const query = `DELETE FROM crm_crm_relations WHERE id = @relation_id`;
            
            await pool.request()
                .input('relation_id', sql.Int, relation_id)
                .query(query);
            
            return { result: 1, message: 'CRM relation removed successfully' };
        } catch (err) {
            console.log(err);
            return { result: 0, err: err.message };
        }
    }

    static async CreateCaseTypeCRM(transaction, data, userInfo) {
        // Decide si es creacion o edicion (upsert basico por beneficiario_id)
        const isUpdate = data.type_id !== undefined && data.type_id !== null && data.type_id !== '';
        let user = data.uingreso || data.user 
        if(isUpdate){
          const updateQuery = `UPDATE crm_case_type
            SET 
                label = @label,
                estado = @estado,
                umodificado = @umodificado,
                fmodificado = GETDATE()
            WHERE type_id = @type_id;
            SELECT * FROM crm_case_type WHERE type_id = @type_id;`;
          const request = new sql.Request(transaction);
          const { recordset } = await request
            .input('label', sql.VarChar, data.label ?? null)
            .input('estado', sql.Int, data.estado !== undefined && data.estado !== '' ? parseInt(data.estado) : 1)
            .query(updateQuery);
          return recordset[0];
        } else {
          const insertQuery = `INSERT INTO crm_case_type
            (label, departamento, compania, uingreso, estado)
            OUTPUT INSERTED.type_id, INSERTED.label
            VALUES(@label, @departamento, @compania, @uingreso, @estado);
            SELECT * FROM crm_case_type WHERE type_id = SCOPE_IDENTITY();`;
          const request = new sql.Request(transaction);
          const { recordset } = await request
            .input('uingreso', sql.VarChar, data.user ?? null)
            .input('label', sql.VarChar, data.label ?? null)
            .input('estado', sql.Int, data.estado !== undefined && data.estado !== '' ? parseInt(data.estado) : 1)
            .input('departamento', sql.Int, (data.departamento_modal && data.departamento_modal !== '') ? parseInt(data.departamento_modal) : (userInfo.Dep ?? null))
            .input('compania', sql.Int, (data.compania_modal && data.compania_modal !== '') ? parseInt(data.compania_modal) : (userInfo.compania ?? null))
            .query(insertQuery);
          return recordset[recordset.length - 1];
        }
    }
  static async CheckDuplicateLabel(transaction, label, departamento, excludeId = null) {
    const request = new sql.Request(transaction);
    request.input('label', sql.VarChar,label );
    request.input('departamento', sql.Int, Number(departamento));
    
    let query = `SELECT COUNT(*) AS total FROM crm_case_type WHERE label = @label AND departamento = @departamento`;
    if (excludeId !== null && excludeId !== undefined && excludeId !== '') {
      request.input('excludeId', sql.Int, excludeId);
      query += ` AND type_id <> @excludeId`;
    }
    const { recordset } = await request.query(query);
    return recordset[0].total > 0;
  }

  static async GetLabelById(transaction, type_id) {
    const req = new sql.Request(transaction);
    req.input('type_id', sql.Int, parseInt(type_id));
    const { recordset } = await req.query(`
    SELECT
        amb.type_id, amb.departamento, amb.compania, amb.label, amb.estado,
        amb.uingreso,
        FORMAT(amb.fingreso,    'dd/MM/yyyy HH:mm') AS fingreso,
        amb.umodificado,
        FORMAT(amb.fmodificado, 'dd/MM/yyyy HH:mm') AS fmodificado,
        COALESCE(d.nombre, CAST(amb.departamento AS VARCHAR)) AS nombre_departamento,
        COALESCE(c.xnombre, CAST(amb.compania AS VARCHAR)) AS nombre_compania
    FROM crm_case_type AS amb
    LEFT JOIN mdepartamento AS d ON d.id = amb.departamento
    LEFT JOIN mcompania AS c ON c.ccompania = amb.compania
    WHERE amb.type_id = @type_id;
    `);
        return recordset[0] || null;
    }
  static async getCaseTypesAllActive(transaction, compania, companiesInfo, depIds) {
    const companyIds = (companiesInfo && companiesInfo.length > 0)
      ? companiesInfo.map(c => c.ccompania == compania)
      : [compania];
    const compPlaceholders = companyIds.map((_, i) => `@comp${i}`).join(', ');
    let where = `ct.compania IN (${compPlaceholders}) AND ct.estado = 1`;
      if (depIds.length > 0) {
        const depPlaceholders = depIds.map((_, i) => `@dep${i}`).join(', ');
        where += ` AND ct.departamento IN (${depPlaceholders})`;
      } else {
        where += ` AND 1 = 0`;
      }
    const query = `
      SELECT ct.type_id, ct.label, ct.departamento, ct.isglobal,
             COALESCE(d.nombre, CAST(ct.departamento AS VARCHAR)) AS nombre_departamento
      FROM crm_case_type ct
      LEFT JOIN mdepartamento d ON d.id = ct.departamento
      WHERE ${where}
      or ct.isglobal = 1
      ORDER BY d.nombre ASC, ct.label ASC;
    `;
    const req = new sql.Request(transaction);
    companyIds.forEach((val, i) => req.input(`comp${i}`, sql.Int, val));
    depIds.forEach((val, i) => req.input(`dep${i}`, sql.Int, val));
    const { recordset } = await req.query(query);
    return recordset;
  }
   static async getCaseTypesAll(transaction, compania, companiesInfo, depIds) {
    const companyIds = (companiesInfo && companiesInfo.length > 0)
      ? companiesInfo.map(c => c.ccompania)
      : [compania];
    const compPlaceholders = companyIds.map((_, i) => `@comp${i}`).join(', ');
    let where = `ct.compania IN (${compPlaceholders})`;
    if (!depIds.includes(1)) {
      if (depIds.length > 0) {
        const depPlaceholders = depIds.map((_, i) => `@dep${i}`).join(', ');
        where += ` AND ct.departamento IN (${depPlaceholders})`;
      } else {
        where += ` AND 1 = 0`;
      }
    }
    const query = `
      SELECT ct.type_id, ct.label, ct.departamento,
             COALESCE(d.nombre, CAST(ct.departamento AS VARCHAR)) AS nombre_departamento
      FROM crm_case_type ct
      LEFT JOIN mdepartamento d ON d.id = ct.departamento
      WHERE ${where}
      OR ct.departamento = 56
      ORDER BY d.nombre ASC, ct.label ASC;
    `;
    const req = new sql.Request(transaction);
    companyIds.forEach((val, i) => req.input(`comp${i}`, sql.Int, val));
    depIds.forEach((val, i) => req.input(`dep${i}`, sql.Int, val));
    const { recordset } = await req.query(query);
    return recordset;
  }
  static async findCRMsWithRecentMessages(transaction, minutes = 30) {
    const request = new sql.Request(transaction);
    request.input('minutes', sql.Int, -minutes);
    const { recordset } = await request.query(`
      SELECT DISTINCT cm.id, cm.conversacion_titulo, cm.asunto_interno, cm.cprioridad, cm.de_correo
      FROM crm_msg msg
      INNER JOIN crm_main cm ON cm.id = msg.id_main
      WHERE msg.fingreso >= DATEADD(MINUTE, @minutes, GETDATE())
      AND msg.nombre_mensaje = 'New comment'
    `);
    return recordset;
  }

static async getLastMessagesByCRM(transaction, crmId, limit = 5, minutes = null) {
  const request = new sql.Request(transaction);
  request.input('crmId', sql.Int, crmId);
  request.input('limit', sql.Int, limit);

  let where = "id_main = @crmId AND nombre_mensaje = 'New comment'";

  if (minutes !== null) {
    request.input('minutes', sql.Int, -minutes);
    where += ' AND fingreso >= DATEADD(MINUTE, @minutes, GETDATE())';
  }

  const { recordset } = await request.query(`
    SELECT TOP(@limit) id_mensaje, id_main, FORMAT(fingreso, 'dd/MM/yyyy hh:mm tt') AS ffingreso,
           nombre_mensaje, body_mensaje, id_msg, de_nombre, de_correo, ms_filename
    FROM crm_msg
    WHERE ${where}
    ORDER BY fingreso DESC
  `);

  return recordset;
}

  static async getCRMParticipants(transaction, crmId) {
    const request = new sql.Request(transaction);
    request.input('crmId', sql.Int, crmId);
    const { recordset } = await request.query(`
      SELECT DISTINCT u.UserID, u.Name, u.Email
      FROM crm_asignado ca
      INNER JOIN Users u ON u.UserID = ca.uasignado AND u.Email IS NOT NULL
      WHERE ca.id_main = @crmId
      UNION
      SELECT DISTINCT u.UserID, u.Name, u.Email
      FROM crm_main cm
      LEFT JOIN Users u ON u.Email = cm.de_correo
      WHERE cm.id = @crmId AND u.Email IS NOT NULL
    `);
    return recordset;
  }

  static async getBusinessRelationships(transaction) {
    const request = new sql.Request(transaction);
    const { recordset } = await request.query(`SELECT b_relation_id, label FROM m_business_relationship ORDER BY b_relation_id`);
    return recordset;
  }

  static async ListCaseTypesPaged(transaction, compania, companiesInfo, depIds, q = '', page = 1, limit = 15, dep_filter = null, estado = null) {
    const safeLimit  = Number.isInteger(limit) && limit > 0 ? limit : 15;
    const safePage   = Number.isInteger(page)  && page  > 0 ? page  : 1;
    const offset     = (safePage - 1) * safeLimit;

    const companyIds = (companiesInfo && companiesInfo.length > 0)
      ? companiesInfo.map(c => c.ccompania)
      : [compania];
    const compPlaceholders = companyIds.map((_, i) => `@comp${i}`).join(', ');
    let where = `amb.compania IN (${compPlaceholders})`;

    let depPlaceholders = '';
    if(!depIds.includes(1)){

      if (depIds.length > 0) {
        depPlaceholders = depIds.map((_, i) => `@dep${i}`).join(', ');
        where += ` AND amb.departamento IN (${depPlaceholders})`;
      }
      else {
        where += ` AND 1 = 0`;
    }
  }
    if (dep_filter !== null && dep_filter !== undefined) {
      where += ` AND amb.departamento = @dep_filter`;
    }
    if (estado !== null && estado !== undefined) {
      where += ` AND amb.estado = @estado`;
    }
    const hasQ = typeof q === 'string' && q.trim() !== '';
    if (hasQ) {
      where += `
        AND (
          amb.label              LIKE @q
        )`;
    }

    const dataQuery = `
      SELECT 
        mdep.nombre      AS nombre_departamento,
        amb.type_id,
        amb.compania,
        amb.departamento,
        amb.label,
        amb.estado
      FROM crm_case_type AS amb
      LEFT JOIN mdepartamento AS mdep
            ON mdep.id = amb.departamento
      WHERE ${where}
      ORDER BY amb.label ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM crm_case_type AS amb
      WHERE ${where};
    `;

    const req = new sql.Request(transaction);
    companyIds.forEach((val, i) => req.input(`comp${i}`, sql.Int, val));
    depIds.forEach((val, i) => req.input(`dep${i}`, sql.Int, val));
    if (dep_filter !== null && dep_filter !== undefined) req.input('dep_filter', sql.Int, dep_filter);
    if (estado    !== null && estado    !== undefined) req.input('estado',     sql.Int, estado);
    if (hasQ) req.input('q', sql.VarChar, `%${q.trim()}%`);
    req.input('offset', sql.Int, offset);
    req.input('limit',  sql.Int, safeLimit);

    const dataRes = await req.query(dataQuery);

    const reqCount = new sql.Request(transaction);
    companyIds.forEach((val, i) => reqCount.input(`comp${i}`, sql.Int, val));
    depIds.forEach((val, i) => reqCount.input(`dep${i}`, sql.Int, val));
    if (dep_filter !== null && dep_filter !== undefined) reqCount.input('dep_filter', sql.Int, dep_filter);
    if (estado    !== null && estado    !== undefined) reqCount.input('estado',     sql.Int, estado);
    if (hasQ) reqCount.input('q', sql.VarChar, `%${q.trim()}%`);

    const countRes = await reqCount.query(countQuery);

    return {
      rows: dataRes.recordset,
      total: countRes.recordset[0]?.total ?? 0
    };
  }
}
