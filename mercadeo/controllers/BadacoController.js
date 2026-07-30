import sql from 'mssql';
import BadacoModel from '../model/BadacoModel.js';
import { get_menu } from '../../functions.js';
import USERModel from '../../USERS/model/USER.js';
import Rules from '../../USERS/rule/DevTeam.js';
import EventsModel from '../model/events.js'

export default class BadacoController {
    constructor() { }

    /**
     * Render the contacts list view
     */
    static async getContactsList(connection, req, res) {
        const pool = await sql.connect(connection);
        
        try {
            const UserID = req.session?.userID || req.body.UserID;
            const devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);
            const usuarioData = await USERModel.obtenerDatosUsuario(pool, UserID);
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const users = await USERModel.getAllUserActive(pool, "1");
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            if (!UserID) {
                return res.redirect("/sinID");
            }

            // Get companies for filter
            const companies = await BadacoModel.getAllCompanies(pool);
            const jobLevels = await BadacoModel.getAllJobLevels(pool);
            const countries = await BadacoModel.getUniqueCountries(pool);

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
            const { search, bmc_id, bmjl_id, country, limit, page } = req.query;
            
            const filters = {};
            if (search) filters.search = search;
            if (bmc_id) filters.bmc_id = parseInt(bmc_id);
            if (bmjl_id) filters.bmjl_id = parseInt(bmjl_id);
            if (country) filters.country = country;
            
            const limitNum = parseInt(limit) || 15;
            const pageNum = parseInt(page) || 1;
            const offsetNum = (pageNum - 1) * limitNum;
            
            const contacts = await BadacoModel.getAllContacts(pool, filters, limitNum, offsetNum);
            const total = await BadacoModel.getContactsCount(pool, filters);
            
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
            const usuarioData = await USERModel.obtenerDatosUsuario(pool, UserID);
            
            if (!UserID) {
                return res.redirect("/sinID");
            }

            const companies = await BadacoModel.getAllCompanies(pool);
            const jobLevels = await BadacoModel.getAllJobLevels(pool);
            const relationships = await BadacoModel.getAllRelationships(pool);
            const countriesAll = await USERModel.getCountries(pool);
            const relationshipType = await BadacoModel.getCompanyType(pool);
            const regions = await BadacoModel.getCompanyRegion(pool);
            const grupousuarios_active = await USERModel.getAllUserActive(pool,usuarioData.compania);
            const devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            const events = await EventsModel.readforms(pool, 100, 0, devteam, UserID, null, null, null);

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
            const usuarioData = await USERModel.obtenerDatosUsuario(pool, UserID);
            
            if (!UserID) {
                return res.redirect("/sinID");
            }

            const contact =await BadacoModel.getContactById(pool, contactId);
            
            if (!contact) {
                return res.status(404).send('Contact not found');
            }

            // Get previous and next contact IDs for navigation
            const prevNext = await BadacoModel.getPrevNextContact(pool, contactId);

            const companies = await BadacoModel.getAllCompanies(pool);
            const jobLevels = await BadacoModel.getAllJobLevels(pool);
            const relationships = await BadacoModel.getAllRelationships(pool);
            const countriesAll = await USERModel.getCountries(pool);
            const relationshipType = await BadacoModel.getCompanyType(pool);
            const regions = await BadacoModel.getCompanyRegion(pool);
            const grupousuarios_active = await USERModel.getAllUserActive(pool,usuarioData.compania);
            const devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            const events = await EventsModel.readforms(pool, 100, 0, devteam, UserID, null, null, null);

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
     * Get companies API
     */
    static async getCompaniesAPI(connection, req, res) {
        const pool = await sql.connect(connection);
        
        try {
            const companies = await BadacoModel.getAllCompanies(pool);
            
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
            const jobLevels = await BadacoModel.getAllJobLevels(pool);
            
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
            const relationships = await BadacoModel.getAllRelationships(pool);
            
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
            // const region = req.body.pais ? await BadacoModel.getRegionById(transaction,req.body.pais): null
            // const domain = req.body.email ? req.body.email.split('@')[1]: null
            const data = {
                uingreso:req.body.uingreso,
                nombre: req.body.nombre,
                pais: req.body.pais || null,
                bmrl_id: req.body.bmrl_id  || null,
                // region: region,
                telefono: req.body.telefono || null,
                address: req.body.address || null,
                email: req.body.email || null,
                // domain: domain,
                website: req.body.website || null,
            };
            
            const companyId = await BadacoModel.createCompany(transaction, data);
            
            await transaction.commit();
            
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
     * Download contacts to Excel
     */
    static async downloadExcel(connection, req, res) {
        await sql.connect(connection);
        const transaction = new sql.Transaction();
        
        try {
            await transaction.begin();
            const UserID = req.session?.userID || req.body.UserID;
            const data = req.body.data;
            const filters = {};
            
            if (data.search) filters.search = data.search;
            if (data.bmc_id) filters.bmc_id = parseInt(data.bmc_id);
            if (data.bmjl_id) filters.bmjl_id = parseInt(data.bmjl_id);
            if (data.country) filters.country = data.country;
            
            // Get all contacts with filters (no pagination for Excel)
            const contacts = await BadacoModel.getAllContacts(transaction, filters, 100000, 0);
            const usuarioData = UserID ? await USERModel.getGroupUsers(transaction): [];
            const regions =  await BadacoModel.getRegions(transaction)

            await transaction.commit();
            
            if (contacts.length === 0) {
                return res.status(400).send('No data to export');
            }
            
            // Import ExcelJS dynamically
            const ExcelJS = (await import('exceljs')).default;
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Contacts');
            
            // Define columns - Name, Email, Company first, then the rest
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
            
            worksheet.columns = columns;
            
            // Add title in row 1 (before headers)
            worksheet.insertRow(1, []);
            worksheet.mergeCells('A1:G1');
            worksheet.getCell('A1').value = 'BADACO - Contact Database';
            worksheet.getCell('A1').font = { bold: true, size: 14 };
            worksheet.getCell('A1').alignment = { horizontal: 'center' };
            
            // Add empty row
            worksheet.insertRow(2, []);
            
            // Headers are now in row 3
            // Style header row
            worksheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFF' } };
            worksheet.getRow(3).fill = { 
                type: 'pattern', 
                pattern: 'solid', 
                fgColor: { argb: '00586f' }
            };

            // Add data rows starting from row 4
            contacts.forEach((contact) => {
                const domain = contact.email ? contact.email.split('@')[1]: null
                const region = contact.company_country_name ? regions.find( (region => region.xnombre_pais_ingles === contact.company_country_name)) : ''
                const contactos_asociados = (contact.contactos_asociados || [])
                    .map(userCode => {
                        const usuario = usuarioData.find(([codigo]) => codigo === userCode);
                        return usuario?.[1];
                    })
                    .filter(Boolean)
                    .join(', ');

                worksheet.addRow({
                    company_name: contact.company_name || '',
                    name: contact.name || '',
                    email: contact.email || '',
                    domain:domain || '',
                    job_title: contact.job_title || '',
                    job_level_name: contact.job_level_name || '',
                    relationship: contact.relationship || '',
                    country: contact.company_country_name  || '',
                    regions: region.xnombre_continente_ingles || '',
                    phone_number: contact.phone_number || '',
                    contact_re: contactos_asociados  || ''
                });
            });
            // Set response headers
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=badaco-contacts.xlsx');
            
            // Write to response
            await workbook.xlsx.write(res);
            res.end();
            
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error generating Excel file:', error);
            res.status(500).send('Error generating Excel file');
        }
    }

    /**
     * GET reference data for external integrations (companies, job levels, relationships)
     */
    static async getExternalReferenceData(connection, req, res) {
        const pool = await sql.connect(connection);
        try {
            const companies     = await BadacoModel.getAllCompanies(pool);
            const jobLevels     = await BadacoModel.getAllJobLevels(pool);
            const relationships = await BadacoModel.getAllRelationships(pool);
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
