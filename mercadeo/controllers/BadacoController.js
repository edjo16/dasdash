import sql from 'mssql';
import BadacoModel from '../model/BadacoModel.js';
import { get_menu } from '../../functions.js';
import USERModel from '../../USERS/model/USER.js';
import Rules from '../../USERS/rule/DevTeam.js';
import EventsModel from '../model/events.js'
import UserPrefsModel from '../../USERS/model/UserPrefs.js';
import { badacoCatalogs, invalidateBadacoCache } from '../services/badaco-cache.js';

const BADACO_CONTACTS_MODULE = 'badaco_contacts';

/** Filas por lote al exportar a Excel (ver downloadExcel). */
const EXCEL_BATCH_SIZE = Number(process.env.BADACO_EXCEL_BATCH_SIZE || 2000);

export default class BadacoController {
    constructor() { }

    /**
     * Render the contacts list view
     */
    static async getContactsList(connection, req, res) {
        const pool = await sql.connect(connection);
        
        try {
            const UserID = req.session?.userID || req.body.UserID;
            if (!UserID) {
                return res.redirect("/sinID");
            }

            // Primero lo que condiciona al resto: el perfil da la compañía con
            // la que se filtran los usuarios activos.
            const [devteam, usuarioData] = await Promise.all([
                Rules.validateTeam(req.session?.iddevteam, UserID),
                USERModel.obtenerDatosUsuario(pool, UserID)
            ]);

            // El resto son consultas independientes: van en paralelo (cada
            // sql.Request toma su propia conexión del pool) en vez de una
            // detrás de otra. Los catálogos salen de la caché de BADACO.
            const [
                users,
                grupousuarios,
                companies,
                jobLevels,
                countries,
                relationships,
                countriesAll,
                grupousuarios_active,
                events,
                regions,
                columnPrefs
            ] = await Promise.all([
                USERModel.getAllUserActive(pool, "1"),
                devteam ? USERModel.getGroupUsers(pool) : Promise.resolve([]),
                badacoCatalogs.companies(pool),
                badacoCatalogs.jobLevels(pool),
                badacoCatalogs.contactCountries(pool),
                badacoCatalogs.relationships(pool),
                badacoCatalogs.countries(pool),
                USERModel.getAllUserActive(pool, usuarioData.compania),
                EventsModel.readforms(pool, 100, 0, devteam, UserID, null, null, null),
                badacoCatalogs.regionNames(pool),
                // Saved column visibility preferences for this user (null = defaults)
                UserPrefsModel.getPrefs(pool, UserID, BADACO_CONTACTS_MODULE)
            ]);

            res.render('badaco/badaco_contacts_list', {
                title: 'BADACO - Contact Database',
                userProfile: {
                    UserName: usuarioData.UserName,
                    UserID: UserID,
                    UsuarioID: UserID,
                    UserEmail: usuarioData.UserEmail
                },
                userMenu: usuarioData.Menu,
                companies: companies,
                jobLevels: jobLevels,
                users: users,
                usuarios: grupousuarios,
                countries: countries,
                allCountries: countriesAll,
                relationships: relationships,
                grupousuarios_active: grupousuarios_active,
                events: events.recordset || [],
                regions: regions,
                columnPrefs: columnPrefs,
                devteam: devteam
            });

        } catch (error) {
            console.error('Error in getContactsList:', error);
            res.status(500).send('Error loading contacts list');
        }
    }

    /**
     * Get contacts data for DataTable (API)
     */
    static async getContactsData(connection, req, res) {
        const pool = await sql.connect(connection);
        
        try {
            const { search, bmc_id, bmjl_id, country, bmrl_id, job_title, event, region, limit, page } = req.query;

            const filters = {};
            if (search) filters.search = search;
            if (bmc_id) filters.bmc_id = parseInt(bmc_id);
            if (bmjl_id) filters.bmjl_id = parseInt(bmjl_id);
            if (country) filters.country = country;
            if (bmrl_id) filters.bmrl_id = parseInt(bmrl_id);
            if (job_title) filters.job_title = job_title;
            if (event) filters.event = parseInt(event);
            if (region) filters.region = region;
            
            // Tope defensivo: la lista pagina de 15 en 15, pero el parámetro
            // llega por querystring y nadie debe poder pedir 500.000 filas.
            const limitNum = Math.min(Math.max(parseInt(limit) || 15, 1), 200);
            const pageNum = Math.max(parseInt(page) || 1, 1);
            const offsetNum = (pageNum - 1) * limitNum;

            // Una sola consulta: filas + total (COUNT(*) OVER()).
            const { rows: contacts, total: pageTotal } = await BadacoModel.getAllContacts(pool, filters, limitNum, offsetNum);

            // Sin filas no hay total que leer (página más allá del final o
            // resultado vacío): sólo en ese caso se consulta el conteo aparte.
            const total = contacts.length ? pageTotal : await BadacoModel.getContactsCount(pool, filters);

            res.json({
                success: true,
                data: contacts,
                total: total,
                limit: limitNum,
                page: pageNum,
                totalPages: Math.ceil(total / limitNum)
            });

        } catch (error) {
            console.error('Error in getContactsData:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Render contact form (create mode)
     */
    static async getContactForm(connection, req, res) {
        const pool = await sql.connect(connection);
        
        try {
            const UserID = req.session?.userID || req.body.UserID;
            if (!UserID) {
                return res.redirect("/sinID");
            }

            const [usuarioData, devteam] = await Promise.all([
                USERModel.obtenerDatosUsuario(pool, UserID),
                Rules.validateTeam(req.session?.iddevteam, UserID)
            ]);

            const [
                companies, jobLevels, relationships, countriesAll,
                relationshipType, regions, grupousuarios_active, grupousuarios, events
            ] = await Promise.all([
                badacoCatalogs.companies(pool),
                badacoCatalogs.jobLevels(pool),
                badacoCatalogs.relationships(pool),
                badacoCatalogs.countries(pool),
                badacoCatalogs.companyTypes(pool),
                badacoCatalogs.companyRegions(pool),
                USERModel.getAllUserActive(pool, usuarioData.compania),
                devteam ? USERModel.getGroupUsers(pool) : Promise.resolve([]),
                EventsModel.readforms(pool, 100, 0, devteam, UserID, null, null, null)
            ]);

            res.render('badaco/badaco_contacts_form', {
                title: 'BADACO - New Contact',
                userProfile: {
                    UserName: usuarioData.UserName,
                    UserID: UserID,
                    UserEmail: usuarioData.UserEmail,
                    UsuarioID: UserID,
                },
                userMenu: usuarioData.Menu,
                allCountries:countriesAll,
                events:events.recordset,
                companies: companies,
                jobLevels: jobLevels,
                devteam:devteam,
                regions:regions,
                usuarios:grupousuarios,
                grupousuarios_active:grupousuarios_active,
                relationships: relationships,
                relationshipType: relationshipType,
                contact: null,
                isEdit: false,
                prevContactId: null,
                nextContactId: null
            });

        } catch (error) {
            console.error('Error in getContactForm:', error);
            res.status(500).send('Error loading contact form');
        }
    }

    /**
     * Render contact form (edit mode)
     */
    static async getContactEdit(connection, req, res) {
        const pool = await sql.connect(connection);
        
        try {
            const UserID = req.session?.userID || req.body.UserID;
            const contactId = req.params.id;
            if (!UserID) {
                return res.redirect("/sinID");
            }

            const [usuarioData, devteam, contact, prevNext] = await Promise.all([
                USERModel.obtenerDatosUsuario(pool, UserID),
                Rules.validateTeam(req.session?.iddevteam, UserID),
                BadacoModel.getContactById(pool, contactId),
                // Navegación anterior/siguiente: no depende del contacto en sí
                BadacoModel.getPrevNextContact(pool, contactId)
            ]);

            if (!contact) {
                return res.status(404).send('Contact not found');
            }

            const [
                companies, jobLevels, relationships, countriesAll,
                relationshipType, regions, grupousuarios_active, grupousuarios, events
            ] = await Promise.all([
                badacoCatalogs.companies(pool),
                badacoCatalogs.jobLevels(pool),
                badacoCatalogs.relationships(pool),
                badacoCatalogs.countries(pool),
                badacoCatalogs.companyTypes(pool),
                badacoCatalogs.companyRegions(pool),
                USERModel.getAllUserActive(pool, usuarioData.compania),
                devteam ? USERModel.getGroupUsers(pool) : Promise.resolve([]),
                EventsModel.readforms(pool, 100, 0, devteam, UserID, null, null, null)
            ]);

            res.render('badaco/badaco_contacts_form', {
                title: 'BADACO - Edit Contact',
                userProfile: {
                    UsuarioID: UserID,
                    UserName: usuarioData.UserName,
                    UserID: UserID,
                    UserEmail: usuarioData.UserEmail
                },
                userMenu: usuarioData.Menu,
                allCountries:countriesAll,
                events:events.recordset ||[],
                companies: companies,
                jobLevels: jobLevels,
                regions:regions,
                grupousuarios_active:grupousuarios_active,
                userMenu: usuarioData.Menu,
                usuarios: grupousuarios,
                relationships: relationships,
                relationshipType: relationshipType,
                contact: contact,
                isEdit: true,
                prevContactId: prevNext.prev,
                nextContactId: prevNext.next
            });

        } catch (error) {
            console.error('Error in getContactEdit:', error);
            res.status(500).send('Error loading contact');
        }
    }

    /**
     * Create new contact (POST)
     */
    static async createContact(connection, req, res) {
        await sql.connect(connection);
        const transaction = new sql.Transaction();
        
        try {
            await transaction.begin();
            
            const UserID = req.body.UserID || req.session?.userID;
            const email = req.body.email;
            
            // Validate email is unique
            if (email) {
                const emailExists = await BadacoModel.checkEmailExists(transaction, email);
                if (emailExists) {
                    try { await transaction.rollback(); } catch (_) {}
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Email already exists. Please use a different email address.'
                    });
                }
            }

            const data = {
                bmc_id: req.body.bmc_id,
                email: email,
                name: req.body.name,
                job_title: req.body.job_title,
                bmjl_id: req.body.bmjl_id || null,
                country: req.body.country,
                address: req.body.address,
                phone_number: req.body.phone_number,
                event: req.body.event || null,
                contactos_asociados: req.body.contactos_asociados || [],
                contact_rl_id: req.body.contact_rl_id,
                uingreso: UserID
            };
            
            const contactId = await BadacoModel.createContact(transaction, data);

            await transaction.commit();
            // El filtro de países de la lista se arma con los países que usan
            // los contactos: un alta puede estrenar uno.
            invalidateBadacoCache('contact');

            res.json({
                success: true,
                message: 'Contact created successfully',
                contact_id: contactId
            });

        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error in createContact:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    /**
     * Update contact (POST)
     */
    static async updateContact(connection, req, res) {
        await sql.connect(connection);
        const transaction = new sql.Transaction();
        
        try {
            await transaction.begin();
            
            const contactId = req.params.id;
            const UserID = req.body.UserID || req.session?.userID;
            const email = req.body.email;
            
            // Validate email is unique (excluding current contact)
            if (email) {
                const emailExists = await BadacoModel.checkEmailExists(transaction, email, contactId);
                if (emailExists) {
                    try { await transaction.rollback(); } catch (_) {}
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Email already exists. Please use a different email address.'
                    });
                }
            }
            
            const data = {
                bmc_id: req.body.bmc_id,
                email: email,
                name: req.body.name,
                job_title: req.body.job_title,
                bmjl_id: req.body.bmjl_id || null,
                country: req.body.country,
                Address: req.body.address,
                phone_number: req.body.phone_number,
                event: req.body.event || null,
                contactos_asociados: req.body.contactos_asociados || [],
                contact_rl_id: req.body.contact_rl_id || null,
                umodificado: UserID
            };
            
            await BadacoModel.updateContact(transaction, contactId, data);

            await transaction.commit();
            invalidateBadacoCache('contact');

            res.json({
                success: true, 
                message: 'Contact updated successfully'
            });

        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error in updateContact:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    /**
     * Get contact by ID (GET, JSON) - used by the contact modal (create/edit)
     */
    static async getContactByIdAPI(connection, req, res) {
        const pool = await sql.connect(connection);

        try {
            const contactId = parseInt(req.params.id);

            if (!contactId || isNaN(contactId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid contact ID'
                });
            }

            const contact = await BadacoModel.getContactById(pool, contactId);

            if (!contact) {
                return res.status(404).json({
                    success: false,
                    error: 'Contact not found'
                });
            }

            res.json({
                success: true,
                contact: contact
            });

        } catch (error) {
            console.error('Error in getContactByIdAPI:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get companies API
     */
    static async getCompaniesAPI(connection, req, res) {
        const pool = await sql.connect(connection);
        
        try {
            const companies = await badacoCatalogs.companies(pool);

            res.json({
                success: true, 
                data: companies 
            });

        } catch (error) {
            console.error('Error in getCompaniesAPI:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    /**
     * Get job levels API
     */
    static async getJobLevelsAPI(connection, req, res) {
        const pool = await sql.connect(connection);
        
        try {
            const jobLevels = await badacoCatalogs.jobLevels(pool);

            res.json({
                success: true, 
                data: jobLevels 
            });

        } catch (error) {
            console.error('Error in getJobLevelsAPI:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    /**
     * Check email availability API
     */
    static async checkEmailAPI(connection, req, res) {
        const pool = await sql.connect(connection);
        
        try {
            const email = req.query.email;
            const excludeContactId = req.query.excludeContactId ? parseInt(req.query.excludeContactId) : null;
            
            if (!email) {
                return res.json({ exists: false });
            }
            
            const exists = await BadacoModel.checkEmailExists(pool, email, excludeContactId);
            
            res.json({ exists: exists });

        } catch (error) {
            console.error('Error in checkEmailAPI:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    /**
     * Get relationships API
     */
    static async getRelationshipsAPI(connection, req, res) {
        const pool = await sql.connect(connection);
        
        try {
            const relationships = await badacoCatalogs.relationships(pool);

            res.json({
                success: true, 
                data: relationships 
            });

        } catch (error) {
            console.error('Error in getRelationshipsAPI:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    /**
     * Create new company (POST)
     */
    static async createCompany(connection, req, res) {
        await sql.connect(connection);
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();
            // domain and region are derived at export time (see downloadExcel), not captured here
            const data = {
                uingreso:req.body.uingreso,
                nombre: req.body.nombre,
                pais: req.body.pais || null,
                bmrl_id: req.body.bmrl_id  || null,
                telefono: req.body.telefono || null,
                address: req.body.address || null,
                email: req.body.email || null,
                website: req.body.website || null,
            };
            
            const companyId = await BadacoModel.createCompany(transaction, data);

            await transaction.commit();
            invalidateBadacoCache('company');

            res.json({
                success: true,
                message: 'Company created successfully',
                bmc_id: companyId
            });

        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error in createCompany:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    /**
     * Get company by ID (GET)
     */
    static async getCompanyById(connection, req, res) {
        const pool = await sql.connect(connection);
        
        try {
            const companyId = parseInt(req.params.id);
            
            if (!companyId || isNaN(companyId)) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid company ID' 
                });
            }
            
            const company = await BadacoModel.getCompanyById(pool, companyId);
            
            if (!company) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Company not found' 
                });
            }
            
            res.json({ 
                success: true, 
                company: company
            });

        } catch (error) {
            console.error('Error in getCompanyById:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    /**
     * Update company (POST)
     */
    static async updateCompany(connection, req, res) {
        await sql.connect(connection);
        const transaction = new sql.Transaction();
        
        try {
            await transaction.begin();
            
            const companyId = parseInt(req.params.id);
            
            if (!companyId || isNaN(companyId)) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid company ID' 
                });
            }
            
            const data = {
                bmc_id: companyId,
                nombre: req.body.nombre,
                pais: req.body.pais || null,
                bmrl_id: req.body.bmrl_id || null,
                region: req.body.region || null,
                telefono: req.body.telefono || null,
                address: req.body.address || null,
                email: req.body.email || null,
                domain: req.body.domain || null,
                website: req.body.website || null,
                uingreso: req.body.uingreso
            };
            
            await BadacoModel.updateCompany(transaction, companyId, data);

            await transaction.commit();
            invalidateBadacoCache('company');

            res.json({
                success: true,
                message: 'Company updated successfully'
            });

        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error in updateCompany:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    /**
     * Create new job level (POST)
     */
    static async createJobLevel(connection, req, res) {
        await sql.connect(connection);
        const transaction = new sql.Transaction();
        
        try {
            await transaction.begin();
            
            const UserID = req.body.UserID || req.session?.userID;
            const data = {
                name: req.body.name,
                uingreso: UserID
            };
            
            const jobLevelId = await BadacoModel.createJobLevel(transaction, data);

            await transaction.commit();
            invalidateBadacoCache('jobLevel');

            res.json({
                success: true, 
                message: 'Job Level created successfully',
                bmjl_id: jobLevelId
            });

        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error in createJobLevel:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    /**
     * Descarga de los contactos filtrados a Excel.
     *
     * Se genera en streaming y por lotes: las filas se leen de
     * `BADACO_EXCEL_BATCH_SIZE` en `BADACO_EXCEL_BATCH_SIZE` y se escriben
     * directo en la respuesta, así que ni la app ni la base de datos tienen
     * que sostener el resultado completo en memoria. Antes se pedían hasta
     * 100.000 contactos de una vez (más una consulta por contacto para sus
     * colaboradores) y se armaba el libro entero en RAM antes de enviar nada.
     *
     * Tampoco se abre transacción: son lecturas, y una transacción abierta
     * mientras se genera el archivo mantiene bloqueos sobre la tabla.
     */
    static async downloadExcel(connection, req, res) {
        const pool = await sql.connect(connection);

        try {
            const UserID = req.session?.userID || req.body.UserID;
            const data = req.body.data || {};
            const filters = {};

            if (data.search) filters.search = data.search;
            if (data.bmc_id) filters.bmc_id = parseInt(data.bmc_id);
            if (data.bmjl_id) filters.bmjl_id = parseInt(data.bmjl_id);
            if (data.country) filters.country = data.country;
            if (data.bmrl_id) filters.bmrl_id = parseInt(data.bmrl_id);
            if (data.job_title) filters.job_title = data.job_title;
            if (data.event) filters.event = parseInt(data.event);
            if (data.region) filters.region = data.region;

            // Códigos de usuario -> nombre. Un Map: antes era un find() por
            // cada colaborador de cada fila (búsqueda lineal dentro del bucle).
            const groupUsers = UserID ? await USERModel.getGroupUsers(pool) : [];
            // Las claves se normalizan a texto: el código guardado en
            // badaco_activere_contactos es varchar y el UserID puede venir
            // numérico, y con comparación estricta no casaban nunca.
            const userNames = new Map(groupUsers.map(([code, name]) => [String(code), name]));

            const ExcelJS = (await import('exceljs')).default;
            const columns = [
                { header: 'Company', key: 'company_name', width: 30 },
                { header: 'Name', key: 'name', width: 30 },
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Domain', key: 'domain', width: 30 },
                { header: 'Job Title', key: 'job_title', width: 25 },
                { header: 'Job Level', key: 'job_level_name', width: 20 },
                { header: 'Relationship', key: 'relationship', width: 20 },
                { header: 'Country', key: 'country', width: 20 },
                { header: 'Regions', key: 'regions', width: 20 },
                { header: 'Phone', key: 'phone_number', width: 20 },
                { header: 'Contact Active Re', key: 'contact_re', width: 20 }
            ];

            let workbook = null;
            let worksheet = null;

            // El libro se crea al llegar el primer lote: si el filtro no
            // devuelve nada todavía se puede responder con un 400 limpio,
            // porque aún no se ha escrito ni una cabecera.
            const startWorkbook = () => {
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename=badaco-contacts.xlsx');

                workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
                worksheet = workbook.addWorksheet('Contacts');
                // Sin `header` en las columnas: las tres primeras filas
                // (título, blanco, cabecera) se escriben a mano, en orden,
                // porque en streaming no se puede insertar hacia atrás.
                worksheet.columns = columns.map((column) => ({ key: column.key, width: column.width }));

                const title = worksheet.addRow(['BADACO - Contact Database']);
                worksheet.mergeCells('A1:G1');
                title.font = { bold: true, size: 14 };
                title.alignment = { horizontal: 'center' };
                title.commit();

                worksheet.addRow([]).commit();

                const header = worksheet.addRow(columns.map((column) => column.header));
                header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                header.eachCell((cell) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00586F' } };
                });
                header.commit();
            };

            await BadacoModel.forEachContactBatch(pool, filters, EXCEL_BATCH_SIZE, async (rows) => {
                if (!workbook) startWorkbook();

                for (const contact of rows) {
                    const domain = contact.email ? contact.email.split('@')[1] : '';
                    const asignados = (contact.contactos_asociados || [])
                        .map((userCode) => userNames.get(String(userCode)))
                        .filter(Boolean)
                        .join(', ');

                    worksheet.addRow({
                        company_name: contact.company_name || '',
                        name: contact.name || '',
                        email: contact.email || '',
                        domain: domain || '',
                        job_title: contact.job_title || '',
                        job_level_name: contact.job_level_name || '',
                        relationship: contact.relationship || '',
                        country: contact.company_country_name || '',
                        // Ya viene resuelta en la consulta (continente del
                        // país de la empresa): no hace falta buscarla en m_pais.
                        regions: contact.company_region || '',
                        phone_number: contact.phone_number || '',
                        contact_re: asignados
                    }).commit();
                }
            });

            if (!workbook) {
                return res.status(400).send('No data to export');
            }

            worksheet.commit();
            await workbook.commit();   // cierra la respuesta

        } catch (error) {
            console.error('Error generating Excel file:', error);
            // Si ya empezó a bajar el archivo no se puede devolver un 500:
            // se corta la respuesta para que el navegador lo dé por fallido.
            if (res.headersSent) return res.destroy(error);
            res.status(500).send('Error generating Excel file');
        }
    }

    /**
     * GET user preferences for the contacts list (column visibility)
     */
    static async getUserPrefs(connection, req, res) {
        const pool = await sql.connect(connection);
        try {
            const UserID = req.session?.userID || req.query.UserID;
            if (!UserID) {
                return res.status(401).json({ success: false, error: 'Not authenticated' });
            }
            const prefs = await UserPrefsModel.getPrefs(pool, UserID, BADACO_CONTACTS_MODULE);
            res.json({ success: true, prefs: prefs });
        } catch (error) {
            console.error('Error in getUserPrefs:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * POST user preferences for the contacts list (column visibility)
     */
    static async saveUserPrefs(connection, req, res) {
        const pool = await sql.connect(connection);
        try {
            const UserID = req.session?.userID || req.body.UserID;
            if (!UserID) {
                return res.status(401).json({ success: false, error: 'Not authenticated' });
            }
            const columns = req.body.columns;
            if (!Array.isArray(columns) || columns.length === 0) {
                return res.status(400).json({ success: false, error: '"columns" must be a non-empty array' });
            }
            await UserPrefsModel.savePrefs(pool, UserID, BADACO_CONTACTS_MODULE, { columns: columns.map(String) });
            res.json({ success: true });
        } catch (error) {
            console.error('Error in saveUserPrefs:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * GET reference data for external integrations (companies, job levels, relationships)
     */
    static async getExternalReferenceData(connection, req, res) {
        const pool = await sql.connect(connection);
        try {
            const [companies, jobLevels, relationships] = await Promise.all([
                badacoCatalogs.companies(pool),
                badacoCatalogs.jobLevels(pool),
                badacoCatalogs.relationships(pool)
            ]);
            res.json({
                success: true,
                data: { companies, jobLevels, relationships },
                hint: 'Use bmc_id for companies, bmjl_id for job levels, bmrl_id for relationship types when creating records.'
            });
        } catch (error) {
            console.error('Error in getExternalReferenceData:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Create company from external application (POST)
     * Required: nombre
     * Optional: pais, bmrl_id, bmrg_id, telefono, address, email, domain, website, created_by
     */
    static async createCompanyExternal(connection, req, res) {
        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();

            const errors = [];
            if (!req.body.nombre || String(req.body.nombre).trim() === '') {
                errors.push('"nombre" (company name) is required.');
            }
            if (errors.length > 0) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(400).json({ success: false, errors });
            }

            const data = {
                nombre:   String(req.body.nombre).trim(),
                pais:     req.body.pais     || null,
                bmrl_id:  req.body.bmrl_id  ? parseInt(req.body.bmrl_id)  : null,
                region:   req.body.bmrg_id  ? parseInt(req.body.bmrg_id)  : null,
                telefono: req.body.telefono || null,
                address:  req.body.address  || null,
                email:    req.body.email    || null,
                domain:   req.body.domain   || null,
                website:  req.body.website  || null,
                uingreso: req.body.created_by ? String(req.body.created_by) : 'API_EXTERNAL',
            };

            const companyId = await BadacoModel.createCompany(transaction, data);
            await transaction.commit();
            invalidateBadacoCache('company');

            res.status(201).json({
                success: true,
                message: 'Company created successfully.',
                bmc_id: companyId,
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error in createCompanyExternal:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Create contact from external application (POST)
     * Required: bmc_id (company must exist), name
     * Optional: email, job_title, bmjl_id, country, address, phone_number, created_by
     * Note: A contact cannot be created without a valid company (bmc_id).
     */
    static async createContactExternal(connection, req, res) {
        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();

            const errors = [];
            if (!req.body.bmc_id) {
                errors.push('"bmc_id" (company ID) is required. A contact must belong to a company.');
            }
            if (!req.body.name || String(req.body.name).trim() === '') {
                errors.push('"name" (full name) is required.');
            }
            if (errors.length > 0) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(400).json({ success: false, errors });
            }

            const bmc_id = parseInt(req.body.bmc_id);
            if (isNaN(bmc_id)) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(400).json({ success: false, errors: ['"bmc_id" must be a valid integer.'] });
            }

            // Validate company exists
            const companyExists = await BadacoModel.checkCompanyExists(transaction, bmc_id);
            if (!companyExists) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(400).json({
                    success: false,
                    errors: [`Company with bmc_id ${bmc_id} does not exist. Use GET /badaco/api/external/reference-data to list available companies.`],
                });
            }

            // Validate email uniqueness if provided
            const email = req.body.email ? String(req.body.email).trim() : null;
            if (email) {
                const emailExists = await BadacoModel.checkEmailExists(transaction, email);
                if (emailExists) {
                    try { await transaction.rollback(); } catch (_) {}
                    return res.status(400).json({
                        success: false,
                        errors: [`The email "${email}" is already in use by another contact. Please use a different email address.`],
                    });
                }
            }

            const data = {
                bmc_id,
                name:        String(req.body.name).trim(),
                email,
                job_title:    req.body.job_title    ? String(req.body.job_title).trim()    : null,
                bmjl_id:      req.body.bmjl_id      ? parseInt(req.body.bmjl_id)           : null,
                country:      req.body.country      || null,
                Address:      req.body.address      || null,
                phone_number: req.body.phone_number || null,
                event:        null,
                contactos_asociados: [],
                uingreso: req.body.created_by ? String(req.body.created_by) : 'API_EXTERNAL',
            };

            const contactId = await BadacoModel.createContact(transaction, data);
            await transaction.commit();
            invalidateBadacoCache('contact');

            res.status(201).json({
                success: true,
                message: 'Contact created successfully.',
                contact_id: contactId,
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error in createContactExternal:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
