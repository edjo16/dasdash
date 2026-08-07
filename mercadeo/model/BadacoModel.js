import sql from 'mssql';

export default class BadacoModel {
    constructor() { }

    /**
     * Separador con el que se concatenan los colaboradores asignados dentro
     * de la consulta (STRING_AGG) para deshacerlos en JS. Se elige un
     * carácter que no puede aparecer en un código de usuario.
     */
    static ASSIGNEE_SEPARATOR = '|';

    // ==================== CONTACTOS ====================

    /**
     * Traduce los filtros de la lista a una cláusula WHERE parametrizada.
     *
     * Devuelve también QUÉ tablas necesita el filtro (`needs`): la consulta
     * de paginación sólo une lo imprescindible para filtrar, y deja los
     * catálogos decorativos para el segundo paso, cuando ya sólo quedan las
     * filas de la página. Ver `getAllContacts`.
     */
    static _buildContactFilters(request, filters = {}) {
        const conditions = ['1 = 1'];
        const needs = { company: false, companyCountry: false };

        if (filters.search) {
            conditions.push(`(
                c.name LIKE @search OR
                c.email LIKE @search OR
                c.job_title LIKE @search OR
                comp.nombre LIKE @search
            )`);
            request.input('search', sql.NVarChar(200), `%${filters.search}%`);
            needs.company = true;   // la búsqueda mira también el nombre de la empresa
        }

        if (filters.bmc_id) {
            conditions.push('c.bmc_id = @bmc_id');
            request.input('bmc_id', sql.Int, filters.bmc_id);
        }

        if (filters.bmjl_id) {
            conditions.push('c.bmjl_id = @bmjl_id');
            request.input('bmjl_id', sql.Int, filters.bmjl_id);
        }

        if (filters.country) {
            conditions.push('c.country = @country');
            request.input('country', sql.VarChar(10), filters.country);
        }

        if (filters.bmrl_id) {
            conditions.push('c.contact_rl_id = @bmrl_id');
            request.input('bmrl_id', sql.Int, filters.bmrl_id);
        }

        if (filters.job_title) {
            conditions.push('c.job_title LIKE @job_title');
            request.input('job_title', sql.NVarChar(200), `%${filters.job_title}%`);
        }

        if (filters.event) {
            conditions.push('c.event = @event');
            request.input('event', sql.Int, filters.event);
        }

        // Región = continente del país de la empresa (igual que en el Excel)
        if (filters.region) {
            conditions.push('spm.xnombre_continente_ingles = @region');
            request.input('region', sql.VarChar(100), filters.region);
            needs.company = true;
            needs.companyCountry = true;
        }

        return { whereClause: conditions.join(' AND '), needs };
    }

    /**
     * Contactos de la lista, con filtros y paginación.
     *
     * Estrategia (la clave para que escale): la consulta va en dos pasos
     * dentro de una sola ida al servidor.
     *
     *   1. CTE `page`: filtra, ordena y pagina tocando SÓLO
     *      `badaco_contactos` (más `badaco_mcompany`/`m_pais` si el filtro
     *      los necesita) y devuelve nada más que los `contact_id` de la
     *      página. Es lo único que crece con el tamaño de la tabla, y con
     *      los índices de `sql/badaco_performance.sql` se resuelve con
     *      seeks. `COUNT(*) OVER ()` trae de paso el total de filas
     *      filtradas, así que no hace falta una segunda consulta de conteo.
     *
     *   2. La consulta externa une los catálogos y agrega los colaboradores
     *      asignados SÓLO para esas filas (15 por defecto). Antes esto se
     *      hacía sobre todo el conjunto filtrado, y encima con una consulta
     *      extra por contacto (N+1: 15 filas = 16 idas al servidor; el
     *      Excel con 100.000 contactos = 100.001).
     *
     * @returns {Promise<{rows: Array, total: number}>}
     */
    static async getAllContacts(transaction, filters = {}, limit = 100, offset = 0) {
        const request = new sql.Request(transaction);
        const { whereClause, needs } = BadacoModel._buildContactFilters(request, filters);

        const pageJoins = [
            needs.company ? 'LEFT JOIN badaco_mcompany AS comp ON c.bmc_id = comp.bmc_id' : '',
            needs.companyCountry ? 'LEFT JOIN m_pais AS spm ON spm.cpais = comp.pais' : ''
        ].filter(Boolean).join('\n            ');

        const query = `
            WITH page AS (
                SELECT c.contact_id, COUNT(*) OVER () AS total_rows
                FROM badaco_contactos AS c
                ${pageJoins}
                WHERE ${whereClause}
                ORDER BY c.contact_id ASC
                OFFSET @offset ROWS
                FETCH NEXT @limit ROWS ONLY
            )
            SELECT
                c.contact_id,
                c.bmc_id,
                c.email,
                c.name,
                c.job_title,
                c.bmjl_id,
                c.address,
                c.phone_number,
                c.event,
                c.fingreso,
                c.uingreso,
                c.contact_rl_id,
                c.fmodificado,
                c.umodificado,
                comp.nombre AS company_name,
                jl.name     AS job_level_name,
                br.name     AS relationship,
                spc.cpais               AS contact_country_code,
                spc.xnombre_pais_ingles AS contact_country_name,
                spm.cpais               AS company_country_code,
                spm.xnombre_pais_ingles AS company_country_name,
                spm.xnombre_continente_ingles AS company_region,
                asoc.contactos_asociados,
                p.total_rows
            FROM page AS p
            INNER JOIN badaco_contactos AS c ON c.contact_id = p.contact_id
            LEFT JOIN badaco_mcompany      AS comp ON c.bmc_id = comp.bmc_id
            LEFT JOIN badaco_mjoblevel     AS jl   ON c.bmjl_id = jl.bmjl_id
            LEFT JOIN badaco_mrelationship AS br   ON c.contact_rl_id = br.bmrl_id
            LEFT JOIN m_pais AS spc ON spc.cpais = c.country
            LEFT JOIN m_pais AS spm ON spm.cpais = comp.pais
            OUTER APPLY (
                SELECT STRING_AGG(CAST(bac.contact AS NVARCHAR(MAX)), '${BadacoModel.ASSIGNEE_SEPARATOR}') AS contactos_asociados
                FROM badaco_activere_contactos AS bac
                WHERE bac.contact_id = c.contact_id
            ) AS asoc
            ORDER BY c.contact_id ASC;
        `;

        request.input('limit', sql.Int, limit);
        request.input('offset', sql.Int, offset);

        const { recordset } = await request.query(query);

        const rows = recordset.map((row) => {
            const { total_rows, contactos_asociados, ...contact } = row;
            contact.contactos_asociados = contactos_asociados
                ? String(contactos_asociados).split(BadacoModel.ASSIGNEE_SEPARATOR)
                : [];
            return contact;
        });

        return { rows, total: recordset.length ? recordset[0].total_rows : 0 };
    }

    /**
     * Recorre TODOS los contactos que cumplen el filtro en lotes, sin
     * cargarlos de golpe en memoria. Lo usa la exportación a Excel.
     *
     * @param {number} batchSize filas por ida al servidor
     * @param {(rows: Array, info: {total: number, fetched: number}) => Promise<void>} onBatch
     * @returns {Promise<number>} filas procesadas
     */
    static async forEachContactBatch(transaction, filters, batchSize, onBatch) {
        const size = Math.max(1, Math.min(Number(batchSize) || 2000, 10000));
        let offset = 0;
        let total = 0;

        for (;;) {
            const { rows, total: filtered } = await BadacoModel.getAllContacts(transaction, filters, size, offset);
            if (offset === 0) total = filtered;
            if (!rows.length) break;

            offset += rows.length;
            await onBatch(rows, { total, fetched: offset });

            if (rows.length < size || offset >= total) break;
        }

        return offset;
    }

    /**
     * Lista ligera de contactos para los selectores.
     * Sin argumentos mantiene el comportamiento histórico (todos, ordenados
     * por nombre); con `search`/`limit` sólo devuelve lo que se busca, que es
     * lo que hay que usar en pantallas nuevas.
     */
    static async getContactsForPicker(transaction, options = {}) {
        const request = new sql.Request(transaction);
        const conditions = [];

        if (options.search) {
            conditions.push('(c.name LIKE @search OR comp.nombre LIKE @search)');
            request.input('search', sql.NVarChar(200), `%${options.search}%`);
        }

        const limit = options.limit ? Math.max(1, Math.min(Number(options.limit), 5000)) : null;
        const top = limit ? `TOP (${limit})` : '';
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const { recordset } = await request.query(`
            SELECT ${top} c.contact_id, c.name, c.job_title, comp.nombre AS company_name
            FROM badaco_contactos AS c
            LEFT JOIN badaco_mcompany AS comp ON c.bmc_id = comp.bmc_id
            ${where}
            ORDER BY c.name ASC
        `);
        return recordset;
    }

    /**
     * Total de contactos que cumplen el filtro.
     *
     * La lista ya NO lo usa (getAllContacts devuelve el total en la misma
     * consulta con COUNT(*) OVER()); queda como respaldo para cuando se pide
     * una pagina vacia mas alla del final y para llamadas externas.
     */
    static async getContactsCount(transaction, filters = {}) {
        const request = new sql.Request(transaction);
        const { whereClause, needs } = BadacoModel._buildContactFilters(request, filters);

        const joins = [
            needs.company ? 'LEFT JOIN badaco_mcompany AS comp ON c.bmc_id = comp.bmc_id' : '',
            needs.companyCountry ? 'LEFT JOIN m_pais AS spm ON spm.cpais = comp.pais' : ''
        ].filter(Boolean).join(String.fromCharCode(10) + '            ');

        const { recordset } = await request.query(`
            SELECT COUNT(*) AS total
            FROM badaco_contactos AS c
            ${joins}
            WHERE ${whereClause}
        `);
        return recordset[0].total;
    }

    /**
     * Get contact by ID
     */
    static async getContactById(transaction, contactId) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT 
                c.*,
                comp.nombre as company_name,
                comp.pais as company_country,
                comp.telefono as company_phone,
                comp.email as company_email,
                comp.address as company_address,
                comp.domain as company_domain,
                comp.website as company_website,
                jl.name as job_level_name
            FROM badaco_contactos c
            LEFT JOIN badaco_mcompany comp ON c.bmc_id = comp.bmc_id
            LEFT JOIN badaco_mjoblevel jl ON c.bmjl_id = jl.bmjl_id
            WHERE c.contact_id = @contactId
        `;
        request.input('contactId', sql.Int, contactId);
        const { recordset } = await request.query(query);
        const contact = recordset[0];
        if (contact) {
            const activeReq = new sql.Request(transaction);
            const activeQuery = `SELECT bac.contact FROM approvals.dbo.badaco_activere_contactos bac WHERE bac.contact_id = @contact_id`;
            activeReq.input('contact_id', sql.Int, contactId);
            const { recordset: asociados } = await activeReq.query(activeQuery);
            contact.contactos_asociados = asociados.map(a => a.contact);
        }
        return contact;
    }

    /**
     * Get previous and next contact IDs for navigation
     */
    static async getPrevNextContact(transaction, contactId) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT 
                (SELECT TOP 1 contact_id FROM badaco_contactos WHERE contact_id < @contactId ORDER BY contact_id DESC) as prev,
                (SELECT TOP 1 contact_id FROM badaco_contactos WHERE contact_id > @contactId ORDER BY contact_id ASC) as next
        `;
        request.input('contactId', sql.Int, contactId);
        const { recordset } = await request.query(query);
        return recordset[0] || { prev: null, next: null };
    }

    /**
     * Check if email already exists
     */
    static async checkEmailExists(transaction, email, excludeContactId = null) {
        const request = new sql.Request(transaction);
        let query = `
            SELECT COUNT(*) as count
            FROM badaco_contactos
            WHERE email = @email
        `;

        if (excludeContactId) {
            query += ` AND contact_id != @contactId`;
            request.input('contactId', sql.Int, excludeContactId);
        }

        request.input('email', sql.VarChar, email);
        const { recordset } = await request.query(query);
        return recordset[0].count > 0;
    }

    /**
     * Busca de un tirón los contactos que ya usan alguno de esos correos.
     * Lo usa la carga masiva (herramienta de tarjetas) para avisar de los
     * duplicados sin lanzar una consulta por fila.
     */
    static async findContactsByEmails(transaction, emails) {
        const list = [...new Set((emails || [])
            .map((email) => String(email == null ? '' : email).trim().toLowerCase())
            .filter(Boolean))];
        if (!list.length) return [];

        const request = new sql.Request(transaction);
        const params = list.map((email, i) => {
            request.input('email' + i, sql.VarChar, email);
            return '@email' + i;
        });

        // Sin LOWER() sobre la columna: aplicar una función al campo impide
        // usar IX_badaco_contactos_email y fuerza recorrer la tabla entera.
        // La comparación sigue siendo insensible a mayúsculas porque esa es
        // la intercalación (collation) por defecto del servidor.
        const query = `
            SELECT c.contact_id, c.email, c.name, comp.nombre AS company_name
            FROM badaco_contactos AS c
            LEFT JOIN badaco_mcompany AS comp ON c.bmc_id = comp.bmc_id
            WHERE c.email IN (${params.join(', ')})
        `;

        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Create new contact
     */
    static async createContact(transaction, data) {
        const request = new sql.Request(transaction);
        const query = `
            INSERT INTO badaco_contactos (
                bmc_id, email, name, job_title, bmjl_id,
                country, address, phone_number, event, contact_rl_id,
                fingreso, uingreso
            ) VALUES (
                @bmc_id, @email, @name, @job_title, @bmjl_id,
                @country, @address, @phone_number, @event, @contact_rl_id,
                GETDATE(), @uingreso
            );
            SELECT SCOPE_IDENTITY() AS contact_id;
        `;

        request.input('bmc_id', sql.Int, data.bmc_id);
        request.input('email', sql.VarChar, data.email || null);
        request.input('name', sql.VarChar, data.name || null);
        request.input('job_title', sql.VarChar, data.job_title || null);
        request.input('bmjl_id', sql.Int, data.bmjl_id || null);
        request.input('country', sql.VarChar, data.country || null);
        request.input('address', sql.VarChar, data.address || null);
        request.input('phone_number', sql.VarChar, data.phone_number || null);
        request.input('event', sql.Int, data.event || null);
        request.input('contact_rl_id', sql.Int, data.contact_rl_id || null);
        request.input('uingreso', sql.VarChar, data.uingreso);

        const { recordset } = await request.query(query);
        const contact_id = recordset[0].contact_id;
        // Insertar contactos asociados
        if (Array.isArray(data.contactos_asociados)) {
            for (const asociado of data.contactos_asociados) {
                const activeReq = new sql.Request(transaction);
                activeReq.input('contact_id', sql.Int, contact_id);
                activeReq.input('contact', sql.VarChar, asociado);
                await activeReq.query(`INSERT INTO approvals.dbo.badaco_activere_contactos (contact_id, contact) VALUES (@contact_id, @contact)`);
            }
        }
        return contact_id;
    }

    /**
     * Update contact
     */
    static async updateContact(transaction, contactId, data) {
        const request = new sql.Request(transaction);
        const query = `
            UPDATE badaco_contactos SET
                bmc_id = @bmc_id,
                email = @email,
                name = @name,
                job_title = @job_title,
                bmjl_id = @bmjl_id,
                country = @country,
                address = @address,
                phone_number = @phone_number,
                event = @event,
                contact_rl_id = @contact_rl_id,
                fmodificado = GETDATE(),
                umodificado = @umodificado
            WHERE contact_id = @contactId
        `;

        request.input('contactId', sql.Int, contactId);
        request.input('bmc_id', sql.Int, data.bmc_id);
        request.input('email', sql.VarChar, data.email || null);
        request.input('name', sql.VarChar, data.name || null);
        request.input('job_title', sql.VarChar, data.job_title || null);
        request.input('bmjl_id', sql.Int, data.bmjl_id || null);
        request.input('country', sql.VarChar, data.country || null);
        request.input('address', sql.VarChar, data.Address || null);
        request.input('phone_number', sql.VarChar, data.phone_number || null);
        request.input('event', sql.Int, data.event || null);
        request.input('contact_rl_id', sql.Int, data.contact_rl_id || null);
        request.input('umodificado', sql.VarChar, data.umodificado);

        await request.query(query);
        // Actualizar contactos asociados
        const delReq = new sql.Request(transaction);
        delReq.input('contactId', sql.Int, contactId);
        await delReq.query(`DELETE FROM approvals.dbo.badaco_activere_contactos WHERE contact_id = @contactId`);
        if (Array.isArray(data.contactos_asociados)) {
            for (const asociado of data.contactos_asociados) {
                const activeReq = new sql.Request(transaction);
                activeReq.input('contactId', sql.Int, contactId);
                activeReq.input('contact', sql.VarChar, asociado);
                await activeReq.query(`INSERT INTO approvals.dbo.badaco_activere_contactos (contact_id, contact) VALUES (@contactId, @contact)`);
            }
        }
        return true;
    }
    /**
     * Actualiza un contacto con lo que trae una tarjeta de presentación.
     *
     * A diferencia de `updateContact` (el formulario completo), aquí sólo se
     * tocan los campos que la tarjeta puede aportar: el evento, la relación y
     * los colaboradores asignados se quedan como estaban, porque la
     * herramienta de tarjetas no los pregunta y borrarlos sería perder datos.
     *
     * Cada campo se escribe con COALESCE: lo que la tarjeta no leyó (llega
     * null) no pisa el valor que ya había en BADACO. El email no se toca: es
     * la llave con la que se encontró el contacto.
     */
    static async updateContactFromCard(transaction, contactId, data) {
        const request = new sql.Request(transaction);
        const query = `
            UPDATE badaco_contactos SET
                bmc_id = COALESCE(@bmc_id, bmc_id),
                name = COALESCE(@name, name),
                job_title = COALESCE(@job_title, job_title),
                bmjl_id = COALESCE(@bmjl_id, bmjl_id),
                country = COALESCE(@country, country),
                address = COALESCE(@address, address),
                phone_number = COALESCE(@phone_number, phone_number),
                fmodificado = GETDATE(),
                umodificado = @umodificado
            WHERE contact_id = @contactId
        `;

        request.input('contactId', sql.Int, contactId);
        request.input('bmc_id', sql.Int, data.bmc_id || null);
        request.input('name', sql.VarChar, data.name || null);
        request.input('job_title', sql.VarChar, data.job_title || null);
        request.input('bmjl_id', sql.Int, data.bmjl_id || null);
        request.input('country', sql.VarChar, data.country || null);
        request.input('address', sql.VarChar, data.address || null);
        request.input('phone_number', sql.VarChar, data.phone_number || null);
        request.input('umodificado', sql.VarChar, data.umodificado);

        await request.query(query);
        return true;
    }

    // ==================== COUNTRIES ====================
        static async getRegions(transaction) {
        const request = new sql.Request(transaction);
        const query = ` SELECT xnombre_continente_ingles, xnombre_pais_ingles FROM m_pais`;
        const { recordset } = await request.query(query);
        return recordset;
    }

    // ==================== COMPANIES ====================

    /**
     * Get all companies
     */
    static async getAllCompanies(transaction) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT 
                mpais.cpais,
                mpais.xnombre_pais_ingles, 
                bc.bmc_id, bc.bmrl_id, bc.nombre, bc.pais, bc.telefono, bc.address, bc.email, bc.domain, bc.website
            FROM badaco_mcompany AS bc
            LEFT JOIN m_pais AS mpais
            ON mpais.cpais = bc.pais
            ORDER BY nombre ASC
        `;
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Empresas en versión mínima (id + nombre + país) para los desplegables
     * y los emparejados. La lista completa trae ocho columnas por fila y se
     * serializa entera en el HTML de la página; para elegir en un combo sólo
     * hacen falta éstas.
     */
    static async getCompanyOptions(transaction) {
        const request = new sql.Request(transaction);
        const { recordset } = await request.query(`
            SELECT bc.bmc_id, bc.nombre, bc.pais, mpais.xnombre_pais_ingles
            FROM badaco_mcompany AS bc
            LEFT JOIN m_pais AS mpais ON mpais.cpais = bc.pais
            ORDER BY bc.nombre ASC
        `);
        return recordset;
    }

    /**
     * Get company by ID
     */
    // static async getCompanyById(transaction, companyId) {
    //     const request = new sql.Request(transaction);
    //     const query = `
    //         SELECT bmc_id, bmrl_id, nombre, pais, telefono, address, email, domain, website
    //         FROM badaco_mcompany
    //         WHERE bmc_id = @companyId
    //     `;
    //     request.input('companyId', sql.Int, companyId);
    //     const { recordset } = await request.query(query);
    //     return recordset[0];
    // }

    /**
     * Create new company
     */
    static async createCompany(transaction, data) {
        const request = new sql.Request(transaction);
        const query = `
            INSERT INTO badaco_mcompany (nombre, pais, bmrg_id, bmrl_id, telefono, address, email, domain, website, uingreso, fingreso)
            VALUES (@nombre, @pais, @bmrg_id, @bmrl_id, @telefono, @address, @email, @domain, @website, @uingreso, GETDATE());
            SELECT SCOPE_IDENTITY() AS bmc_id;
        `;

        request.input('nombre', sql.NVarChar, data.nombre);
        request.input('pais', sql.NVarChar, data.pais || null);
        request.input('bmrg_id', sql.Int, data.region || null);
        request.input('bmrl_id', sql.Int, data.bmrl_id || null);
        request.input('telefono', sql.NVarChar, data.telefono || null);
        request.input('address', sql.NVarChar, data.address || null);
        request.input('email', sql.NVarChar, data.email || null);
        request.input('domain', sql.NVarChar, data.domain || null);
        request.input('website', sql.NVarChar, data.website || null);
        request.input('uingreso', sql.NVarChar, data.uingreso || null);
        const { recordset } = await request.query(query);
        return recordset[0].bmc_id;
    }

    /**
     * Get company by ID
     */
    static async getCompanyById(transaction, companyId) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT
                mpais.cpais,
                mpais.xnombre_pais_ingles,
                bc.bmc_id,
                bc.nombre,
                bc.bmrg_id,
                bc.bmrl_id,
                bc.telefono,
                bc.address,
                bc.email,
                bc.domain,
                bc.website,
                bc.pais,
                bc.uingreso,
                bc.fmodificado,
                bc.umodificado,
                bc.b_relation_id
            FROM badaco_mcompany AS bc
            LEFT JOIN m_pais AS mpais
                ON mpais.cpais = bc.pais
            WHERE bmc_id = @bmc_id
        `;

        request.input('bmc_id', sql.Int, companyId);

        const { recordset } = await request.query(query);
        return recordset.length > 0 ? recordset[0] : null;
    }

    /**
     * Update company
     */
    static async updateCompany(transaction, companyId, data) {
        const request = new sql.Request(transaction);
        const query = `
            UPDATE badaco_mcompany
            SET
                nombre = @nombre,
                pais = @pais,
                -- bmrg_id/domain are not editable from the UI: keep whatever is stored
                -- (e.g. written by the external API) when the caller omits them
                bmrg_id = COALESCE(@bmrg_id, bmrg_id),
                bmrl_id = @bmrl_id,
                telefono = @telefono,
                address = @address,
                email = @email,
                domain = COALESCE(@domain, domain),
                website = @website,
                fmodificado = GETDATE(),
                umodificado = @umodificado
            WHERE bmc_id = @bmc_id
        `;

        request.input('bmc_id', sql.Int, companyId);
        request.input('nombre', sql.NVarChar, data.nombre);
        request.input('pais', sql.NVarChar, data.pais || null);
        request.input('bmrg_id', sql.Int, data.region || null);
        request.input('bmrl_id', sql.Int, data.bmrl_id || null);
        request.input('telefono', sql.NVarChar, data.telefono || null);
        request.input('address', sql.NVarChar, data.address || null);
        request.input('email', sql.NVarChar, data.email || null);
        request.input('domain', sql.NVarChar, data.domain || null);
        request.input('website', sql.NVarChar, data.website || null);
        request.input('umodificado', sql.NVarChar, data.uingreso || null);

        await request.query(query);
        return true;
    }

    // ==================== JOB LEVELS ====================

    /**
     * Get all job levels
     */
    static async getAllJobLevels(transaction) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT bmjl_id, name, fingreso, uingreso, fmodificado, umodificado
            FROM badaco_mjoblevel
            ORDER BY name ASC
        `;
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Create new job level
     */
    static async createJobLevel(transaction, data) {
        const request = new sql.Request(transaction);
        const query = `
            INSERT INTO badaco_mjoblevel (name, fingreso, uingreso)
            VALUES (@name, GETDATE(), @uingreso);
            SELECT SCOPE_IDENTITY() AS bmjl_id;
        `;

        request.input('name', sql.VarChar, data.name);
        request.input('uingreso', sql.VarChar, data.uingreso);

        const { recordset } = await request.query(query);
        return recordset[0].bmjl_id;
    }

    // ==================== RELATIONSHIPS ====================

    /**
     * Get all relationships
     */
    static async getAllRelationships(transaction) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT bmrl_id, name, fingreso, uingreso, fmodificado, umodificado
            FROM badaco_mrelationship
            ORDER BY name ASC
        `;
        const { recordset } = await request.query(query);
        return recordset;
    }

    /**
     * Create new relationship
     */
    static async createRelationship(transaction, data) {
        const request = new sql.Request(transaction);
        const query = `
            INSERT INTO badaco_mrelationship (name, fingreso, uingreso)
            VALUES (@name, GETDATE(), @uingreso);
            SELECT SCOPE_IDENTITY() AS bmrl_id;
        `;

        request.input('name', sql.VarChar, data.name);
        request.input('uingreso', sql.VarChar, data.uingreso);

        const { recordset } = await request.query(query);
        return recordset[0].bmrl_id;
    }

    /**
     * Check if a company exists by ID
     */
    static async checkCompanyExists(transaction, companyId) {
        const request = new sql.Request(transaction);
        const query = `SELECT COUNT(*) as count FROM badaco_mcompany WHERE bmc_id = @bmc_id`;
        request.input('bmc_id', sql.Int, companyId);
        const { recordset } = await request.query(query);
        return recordset[0].count > 0;
    }

    // ==================== UTILITY ====================

    /**
     * Get unique countries from contacts
     */
    static async getUniqueCountries(transaction) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT DISTINCT country
            FROM badaco_contactos
            WHERE country IS NOT NULL AND country != ''
            ORDER BY country ASC
        `;
        const { recordset } = await request.query(query);
        return recordset.map(r => r.country);
    }

    /**
     * Get unique regions (continents) from m_pais
     */
    static async getUniqueRegions(transaction) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT DISTINCT xnombre_continente_ingles
            FROM m_pais
            WHERE xnombre_continente_ingles IS NOT NULL AND xnombre_continente_ingles != ''
            ORDER BY xnombre_continente_ingles ASC
        `;
        const { recordset } = await request.query(query);
        return recordset.map(r => r.xnombre_continente_ingles);
    }
    static async getCompanyType(transaction) {
        const request = new sql.Request(transaction);
        const query = `SELECT * FROM mercadeo_tipos`;
        const { recordset } = await request.query(query);
        return recordset
    }
    static async getCompanyRegion(transaction) {
        const request = new sql.Request(transaction);
        const query = `SELECT * FROM badaco_mregions`;
        const { recordset } = await request.query(query);
        return recordset
    }
}
