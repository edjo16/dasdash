import sql from 'mssql';
import UsersModel from '../models/users.js';
import { get_menu } from '../../functions.js';
import Rules from '../rule/DevTeam.js';
import USERModel from '../model/USER.js';
import { envio_correo } from '../../AUTH/functions.js';
import DigitalSignaturesModel from '../../Approvals_functions/models/digital_signatures.js';
import path from 'path';
import fs from 'fs';
export default class UsersController {
    constructor() { }

    static generateTemporaryPassword() {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        const digits = '0123456789';
        let tempPassword = '';

        for (let i = 0; i < 5; i++) {
            tempPassword += letters.charAt(Math.floor(Math.random() * letters.length));
        }
        for (let i = 0; i < 2; i++) {
            tempPassword += digits.charAt(Math.floor(Math.random() * digits.length));
        }

        return tempPassword;
    }

    static normalizeUploadFile(uploadedFile) {
        if (!uploadedFile) return null;
        return Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile;
    }

    static buildSignatureDataUrl(uploadedFile) {
        const signatureFile = UsersController.normalizeUploadFile(uploadedFile);
        if (!signatureFile) {
            throw new Error('No signature file provided');
        }

        const filename = String(signatureFile.name || '').toLowerCase();
        const mimeType = String(signatureFile.mimetype || '').toLowerCase();
        if (!filename.endsWith('.png') || (mimeType && mimeType !== 'image/png')) {
            throw new Error('Only PNG files are allowed for signatures');
        }

        if (Number(signatureFile.size || 0) > 5 * 1024 * 1024) {
            throw new Error('Signature file size must be less than 5MB');
        }

        const fileBuffer = signatureFile.data;
        if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
            throw new Error('Invalid signature file content');
        }

        return `data:image/png;base64,${fileBuffer.toString('base64')}`;
    }

    static async saveSignatureForUser(transaction, targetUserId, uploadedFile, label = 'Default') {
        const safeTargetUserId = String(targetUserId || '').trim();
        if (!safeTargetUserId) {
            throw new Error('UserID is required to save signature');
        }

        const signatureData = UsersController.buildSignatureDataUrl(uploadedFile);
        const id = await DigitalSignaturesModel.saveUserSignature(transaction, safeTargetUserId, signatureData, label);
        return { id };
    }

    /**
     * Render the users list view
     */
    static async getUsersList(connection, req, res) {
        const pool = await sql.connect(connection);
        try {
            const UserID = req.session?.userID || req.body.UserID;
            const devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);
            const usuarioData = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            
            if (!devteam) {
                return res.render('forbiden_view', {
                title: "¡Access denied!",
                userProfile: {
                    UserName: usuarioData.UserName,
                    UsuarioID: UserID,
                },
                userMenu: usuarioData.Menu,
                usuarios: grupousuarios
            });
            }

            const requestUser = new sql.Request(pool);
            const userQuery = `
                SELECT TOP 1 
                    Users.*, 
                    c.xnombre, 
                    c.xlogo
                FROM Users 
                LEFT JOIN mcompania c ON Users.ccompania = c.ccompania
                WHERE Users.UserID = @UserID
            `;
            requestUser.input('UserID', sql.VarChar, UserID);
            const { recordset: userRecordset } = await requestUser.query(userQuery);

            if (!userRecordset || userRecordset.length === 0) {
                return res.status(401).send('Unauthorized user');
            }

            const usuario = {
                UserName: userRecordset[0].Name,
                UserID: userRecordset[0].UserID,
                UsuarioID: userRecordset[0].UserID,
                UserEmail: userRecordset[0].Email,
                Modules: userRecordset[0].Modules,
                Manager: userRecordset[0].Manager,
                ManagerName: userRecordset[0].manager_name,
                Menu: get_menu({ recordset: [userRecordset[0]] })
            };

            // Get all users
            const users = await UsersModel.getAllUsers(pool);

            // Get unique companies for filter
            const companies = [...new Set(users.map(u => u.compania_nombre).filter(Boolean))];

            res.render('admin/users_list', {
                title: 'User Management',
                userProfile: usuario,
                userMenu: usuario.Menu,
                users: [],  // Empty array, data will be loaded via API
                usuarios: users,
                totalUsers: users.length,
                devteam: devteam,
                activeUsers: users.filter(u => u.Estado === true || u.Estado === 1).length,
                companies: companies
            });

        } catch (error) {
            console.error('Error in getUsersList:', error);
            res.status(500).send('Error loading users list');
        }
    }

    /**
     * Render the user detail view
     */
    static async getUserDetail(connection, req, res) {
        const pool = await sql.connect(connection);

        try {
            // Get current user data (who is logged in)
            const UserID = req.session?.userID || req.body.UserID;
            const devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);
            const usuarioData = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.findDevTeam(pool, UserID) : [];
            
            if (!devteam) {
                return res.render('forbiden_view', {
                title: "¡Access denied!",
                userProfile: {
                    UserName: usuarioData.UserName,
                    UsuarioID: UserID,
                },
                userMenu: usuarioData.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
            });
            }

            const requestUser = new sql.Request(pool);
            const userQuery = `
                SELECT TOP 1 
                    Users.*, 
                    c.xnombre, 
                    c.xlogo
                FROM Users 
                LEFT JOIN mcompania c ON Users.ccompania = c.ccompania
                WHERE Users.UserID = @UserID
            `;
            requestUser.input('UserID', sql.VarChar, UserID);
            const { recordset: userRecordset } = await requestUser.query(userQuery);

            if (!userRecordset || userRecordset.length === 0) {
                return res.status(401).send('Unauthorized user');
            }

            const usuario = {
                UserName: userRecordset[0].Name,
                UserID: userRecordset[0].UserID,
                UsuarioID: userRecordset[0].UserID,
                UserEmail: userRecordset[0].Email,
                Modules: userRecordset[0].Modules,
                Manager: userRecordset[0].Manager,
                ManagerName: userRecordset[0].manager_name,
                Menu: get_menu({ recordset: [userRecordset[0]] })
            };

            // Get the ID of the user to view in detail
            const targetUserId = req.params.id || req.query.id;
            if (!targetUserId) {
                return res.status(400).send('User ID not provided');
            }

            // Get specific user detail
            const userDetail = await UsersModel.getUserById(pool, targetUserId);

            if (!userDetail) {
                return res.status(404).send('User not found');
            }

            // Get all departments for this user
            const userDepartments = await UsersModel.getDepartmentsByIds(pool, userDetail.departamento);
            
            // Get all companies for this user
            const userCompanies = await UsersModel.getCompaniesByIds(pool, userDetail.compania);

            // Get all companies, departments, and managers for dropdowns
            const companies = await UsersModel.getAllCompanies(pool);
            const allDepartments = await UsersModel.getAllDepartments(pool);
            const managers = await UsersModel.getAllManagers(pool);

            res.render('admin/users_detail', {
                title: 'User Detail',
                userProfile: usuario,
                userMenu: usuario.Menu,
                user: userDetail,
                userDepartments: userDepartments,
                userCompanies: userCompanies,
                companies: companies,
                allDepartments: allDepartments,
                usuarios: grupousuarios,
                devteam: devteam,
                managers: managers
            });

        } catch (error) {
            console.error('Error in getUserDetail:', error);
            res.status(500).send('Error loading user detail');
        }
    }

    /**
     * Render the user edit view
     */
    static async getUserEdit(connection, req, res) {
        const pool = await sql.connect(connection);

        try {
            // Get current user data (who is logged in)
            const UserID = req.session?.userID || req.body.UserID;
            const devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);
            const usuarioData = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.findDevTeam(pool, UserID) : [];
            
            if (!devteam) {
                return res.render('forbiden_view', {
                title: "Access denied!",
                userProfile: {
                    UserName: usuarioData.UserName,
                    UsuarioID: UserID,
                },
                userMenu: usuarioData.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
            });
            }

            const requestUser = new sql.Request(pool);
            const userQuery = `
                SELECT TOP 1 
                    Users.*, 
                    c.xnombre, 
                    c.xlogo,
                    m.Name AS manager_name
                FROM Users 
                LEFT JOIN mcompania c ON Users.ccompania = c.ccompania
                LEFT JOIN Users m ON Users.Manager = m.UserID
                WHERE Users.UserID = @UserID
            `;
            requestUser.input('UserID', sql.VarChar, UserID);
            const { recordset: userRecordset } = await requestUser.query(userQuery);

            if (!userRecordset || userRecordset.length === 0) {
                return res.status(401).send('Unauthorized user');
            }

            const usuario = {
                UserName: userRecordset[0].Name,
                UserID: userRecordset[0].UserID,
                UsuarioID: userRecordset[0].UserID,
                UserEmail: userRecordset[0].Email,
                Modules: userRecordset[0].Modules,
                Manager: userRecordset[0].Manager,
                ManagerName: userRecordset[0].manager_name,
                Menu: get_menu({ recordset: [userRecordset[0]] })
            };

            // Get the ID of the user to edit
            const targetUserId = req.params.id || req.query.id;
            if (!targetUserId) {
                return res.status(400).send('User ID not provided');
            }

            // Get specific user detail
            const userDetail = await UsersModel.getUserById(pool, targetUserId);

            if (!userDetail) {
                return res.status(404).send('User not found');
            }

            // Get all companies, departments, and managers for dropdowns
            const companies = await UsersModel.getAllCompanies(pool);
            const allDepartments = await UsersModel.getAllDepartments(pool);
            const managers = await UsersModel.getAllManagers(pool);

            // Format dates as DD/MM/YYYY for the date inputs
            const fmtDate = (d) => {
                if (!d) return '';
                const dt = new Date(d);
                if (isNaN(dt.getTime())) return '';
                const dd = String(dt.getDate()).padStart(2, '0');
                const mm = String(dt.getMonth() + 1).padStart(2, '0');
                return `${dd}/${mm}/${dt.getFullYear()}`;
            };
            if (userDetail.finicio) userDetail.finicio = fmtDate(userDetail.finicio);
            if (userDetail.fsalida) userDetail.fsalida = fmtDate(userDetail.fsalida);
            userDetail.Estado == true? userDetail.Estado = '1': userDetail.Estado = '0' 

            res.render('admin/users_edit', {
                title: 'Edit User',
                userProfile: usuario,
                userMenu: usuario.Menu,
                user: userDetail,
                companies: companies,
                usuarios: grupousuarios,
                devteam: devteam,
                allDepartments: allDepartments,
                managers: managers
            });

        } catch (error) {
            console.error('Error in getUserEdit:', error);
            res.status(500).send('Error loading user edit form');
        }
    }

    /**
     * Render the create user view
     */
    static async getUserCreate(connection, req, res) {
        const pool = await sql.connect(connection);

        try {
            const UserID = req.session?.userID || req.body.UserID;
            let devteam = await Rules.validateTeam(req.session?.iddevteam,UserID);
            const usuarioData = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.findDevTeam(pool, UserID) : [];
            const selectUsers = await USERModel.getAllUsersActive(pool)
            if (!devteam) {
                return res.render('forbiden_view', {
                title: "Access denied!",
                userProfile: {
                    UserName: usuarioData.UserName,
                    UsuarioID: UserID,
                },
                userMenu: usuarioData.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
            });
            }

            const requestUser = new sql.Request(pool);
            const userQuery = `
                SELECT TOP 1 Users.*, c.xnombre, c.xlogo
                FROM Users 
                LEFT JOIN mcompania c ON Users.ccompania = c.ccompania
                WHERE Users.UserID = @UserID
            `;
            requestUser.input('UserID', sql.VarChar, UserID);
            const { recordset: userRecordset } = await requestUser.query(userQuery);

            if (!userRecordset || userRecordset.length === 0) {
                return res.status(401).send('Unauthorized user');
            }

            const usuario = {
                UserName: userRecordset[0].Name,
                UserID: userRecordset[0].UserID,
                UsuarioID: userRecordset[0].UserID,
                UserEmail: userRecordset[0].Email,
                Modules: userRecordset[0].Modules,
                Manager: userRecordset[0].Manager,
                ManagerName: userRecordset[0].manager_name,
                Menu: get_menu({ recordset: [userRecordset[0]] })
            };

            const companies = await UsersModel.getAllCompanies(pool);
            const allDepartments = await UsersModel.getAllDepartments(pool);
            const managers = await UsersModel.getAllManagers(pool);

            res.render('admin/users_create', {
                title: 'Create User',
                userProfile: usuario,
                selectUsers:selectUsers,
                userMenu: usuario.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
                companies: companies,
                allDepartments: allDepartments,
                managers: managers
            });

        } catch (error) {
            console.error('Error in getUserCreate:', error);
            res.status(500).send('Error loading user create form');
        }
    }

    /**
     * Create user API
     */
    static async createUser(connection, req, res) {
        await sql.connect(connection);
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            // DevTeam validation
            const devteam = await Rules.validateTeam(req.session.iddevteam, req.session.userID);
            
            if (!devteam) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(403).json({ result: 0, message: 'Access denied: You do not have permission to create users' });
            }

            // basic validation
            if (!req.body || !req.body.Name || !req.body.Email) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(400).json({ result: 0, message: 'Required fields are not completed' });
            } 

            const userData = {
                Name: req.body.Name,
                Email: req.body.Email,
                UserID: req.body.UserID,
                Manager: req.body.Manager,
                Location: req.body.Location,
                Location1: req.body.Location1,
                xcargo: req.body.xcargo,
                finicio: req.body.finicio,
                fsalida: req.body.fsalida,
                uingreso: req.body.uingreso || req.body.p || req.session?.userID,
                umodificado: req.body.uingreso || req.body.p || req.session?.userID,
                ccompania: req.body.ccompania,
                cdepartamento: req.body.cdepartamentos,
                departamento: req.body.departamento,
                compania: req.body.compania,
                vacaciones: req.body.vacaciones,
                M_Admin: req.body.M_Admin,
                M_Conta: req.body.M_Conta,
                M_CRM: req.body.M_CRM,
                F_IT: req.body.F_IT,
                F_Conta: req.body.F_Conta,
                F_Admin: req.body.F_Admin,
                F_Finanzas: req.body.F_Finanzas,
                F_Governance: req.body.F_Governance,
                F_HR: req.body.F_HR,
                Modules: req.body.Modules,
                Grupo: req.body.Grupo
            };

            // Password field (optional, will use default if not provided)
            if (req.body.password) userData.password = req.body.password;

            const newId = await UsersModel.createUser(transaction, userData);
            let signatureSaved = false;
            let signatureWarning = null;

            // Handle user image upload if provided
            if (req.files && req.files.userImage) {
                const userImage = req.files.userImage;
                const userID = req.body.UserID;
                
                // Validate file extension
                if (!userImage.name.toLowerCase().endsWith('.png')) {
                    try { await transaction.rollback(); } catch (_) {}
                    return res.status(400).json({ result: 0, message: 'Only PNG files are allowed' });
                }
                
                // Save image to //srv-dc-lombard.lombard.local/Approvals/pic/
                const imagePath = `//srv-dc-lombard.lombard.local/Approvals/pic/${userID}.png`;
                
                try {
                    await userImage.mv(imagePath);
                } catch (fileError) {
                    console.error('Error saving user image:', fileError);
                    // Don't rollback transaction, just log the error
                    // User is still created, just without image
                }
            }

            // Handle user signature upload if provided
            if (req.files && req.files.userSignature) {
                try {
                    await UsersController.saveSignatureForUser(
                        transaction,
                        req.body.UserID,
                        req.files.userSignature,
                        'Initial Signature'
                    );
                    signatureSaved = true;
                } catch (signatureError) {
                    signatureWarning = signatureError.message;
                    console.error('Error saving user signature on create:', signatureError);
                    // Keep user creation successful even when signature upload fails.
                }
            }

            await transaction.commit();

            res.status(201).json({
                result: 1,
                message: 'User created',
                id: newId,
                signature_saved: signatureSaved,
                signature_warning: signatureWarning,
            });

        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error in createUser:', error);
            res.status(500).json({ result: 0, message: 'Error creating user', error: error.message });
        }
    }

    /**
     * API to get users list (JSON)
     */
    static async getUsersAPI(connection, req, res) {
        const pool = await sql.connect(connection);

        try {
            const searchTerm = req.query.search || req.body.search;
            let users;

            if (searchTerm) {
                users = await UsersModel.searchUsers(pool, searchTerm);
            } else {
                users = await UsersModel.getAllUsers(pool);
            }

            res.status(200).json({
                result: 1,
                data: users,
                total: users.length
            });

        } catch (error) {
            console.error('Error in getUsersAPI:', error);
            res.status(500).json({
                result: 0,
                message: 'Error getting users',
                error: error.message
            });
        }
    }

    /**
     * API to get paginated users list with filters
     */
    static async getUsersListPaginated(connection, req, res) {
        const pool = await sql.connect(connection);

        try {
            // Get pagination parameters
            const page = parseInt(req.query.page) || 1;
            const pageSize = parseInt(req.query.pageSize) || 15;
            const search = req.query.search || '';
            const statusFilter = req.query.status || 'all';
            const companyFilter = req.query.company || 'all';

            // Get all users
            let users = await UsersModel.getAllUsers(pool);

            // Apply search filter
            if (search) {
                const searchUpper = search.toUpperCase();
                // Normalize search term to remove accents
                const normalizedSearch = searchUpper.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                
                users = users.filter(user => {
                    const searchFields = [
                        user.Id?.toString(),
                        user.Name,
                        user.Email,
                        user.UserID,
                        user.compania_nombre,
                        user.departamento_nombre,
                        user.departamento,
                        user.xcargo,
                        user.Manager
                    ];
                    
                    return searchFields.some(field => {
                        if (!field) return false;
                        const fieldUpper = field.toString().toUpperCase();
                        // Normalize field to remove accents
                        const normalizedField = fieldUpper.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        return normalizedField.includes(normalizedSearch);
                    });
                });
            }

            // Apply status filter
            if (statusFilter !== 'all') {
                const filterValue = statusFilter === '1';
                users = users.filter(user => 
                    user.Estado === filterValue || user.Estado === parseInt(statusFilter)
                );
            }

            // Apply company filter
            if (companyFilter !== 'all') {
                users = users.filter(user => user.compania_nombre === companyFilter);
            }

            // Get total after filters
            const totalFiltered = users.length;
            const totalPages = Math.ceil(totalFiltered / pageSize);

            // Apply pagination
            const startIndex = (page - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const paginatedUsers = users.slice(startIndex, endIndex);

            // Get unique companies for filter dropdown
            const companies = [...new Set(users.map(u => u.compania_nombre).filter(Boolean))];

            res.status(200).json({
                result: 1,
                data: paginatedUsers,
                pagination: {
                    page: page,
                    pageSize: pageSize,
                    totalItems: totalFiltered,
                    totalPages: totalPages,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                },
                companies: companies
            });

        } catch (error) {
            console.error('Error in getUsersListPaginated:', error);
            res.status(500).json({
                result: 0,
                message: 'Error getting paginated users',
                error: error.message
            });
        }
    }

    /**
     * API to get user detail (JSON)
     */
    static async getUserDetailAPI(connection, req, res) {
        const pool = await sql.connect(connection);

        try {
            const userId = req.params.id || req.query.id;
            if (!userId) {
                return res.status(400).json({
                    result: 0,
                    message: 'User ID not provided'
                });
            }

            const user = await UsersModel.getUserById(pool, userId);

            if (!user) {
                return res.status(404).json({
                    result: 0,
                    message: 'User not found'
                });
            }

            res.status(200).json({
                result: 1,
                data: user
            });

        } catch (error) {
            console.error('Error in getUserDetailAPI:', error);
            res.status(500).json({
                result: 0,
                message: 'Error getting user detail',
                error: error.message
            });
        }
    }

    /**
     * API to get active users
     */
    static async getActiveUsersAPI(connection, req, res) {
        const pool = await sql.connect(connection);

        try {
            const users = await UsersModel.getActiveUsers(pool);

            res.status(200).json({
                result: 1,
                data: users,
                total: users.length
            });

        } catch (error) {
            console.error('Error in getActiveUsersAPI:', error);
            res.status(500).json({
                result: 0,
                message: 'Error getting active users',
                error: error.message
            });
        }
    }

    /**
     * Update user information
     */
    static async updateUser(connection, req, res) {
        await sql.connect(connection);
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            // DevTeam validation
            const UserID = req.session?.userID || req.body.UserID;
            const devteam = await Rules.validateTeam(req.session?.iddevteam, UserID);
            
            if (!devteam) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(403).json({ result: 0, message: 'Access denied: You do not have permission to update users' });
            }

            const userId = req.params.id;
            
            // Only include fields that are actually provided (not undefined)
            const userData = {};
            if (req.body.Name !== undefined) userData.Name = req.body.Name;
            if (req.body.Email !== undefined) userData.Email = req.body.Email;
            if (req.body.Manager !== undefined) userData.Manager = req.body.Manager;
            if (req.body.Location !== undefined) userData.Location = req.body.Location;
            if (req.body.Location1 !== undefined) userData.Location1 = req.body.Location1;
            if (req.body.finicio !== undefined) userData.finicio = req.body.finicio;
            if (req.body.fsalida !== undefined) userData.fsalida = req.body.fsalida;
            userData.umodificado = req.body.umodificado || req.body.p || UserID;
            if (req.body.xcargo !== undefined) userData.xcargo = req.body.xcargo;
            if (req.body.ccompaniae !== undefined) userData.ccompaniae = req.body.ccompaniae;
            if (req.body.cdepartamentoe !== undefined) userData.cdepartamentoe = req.body.cdepartamentoe;
            if (req.body.departamento !== undefined) userData.departamento = req.body.departamento;
            if (req.body.compania !== undefined) userData.compania = req.body.compania;
            if (req.body.vacaciones !== undefined) {
                userData.vacaciones = req.body.vacaciones === 'true' || req.body.vacaciones === '1' ? 1 : 0;
            }
            if (req.body.Estado !== undefined) userData.Estado = Number(req.body.Estado);

            // Permissions and Modules
            if (req.body.M_Admin !== undefined) userData.M_Admin = req.body.M_Admin;
            if (req.body.M_Conta !== undefined) userData.M_Conta = req.body.M_Conta ;
            if (req.body.M_CRM !== undefined) userData.M_CRM = req.body.M_CRM;
            if (req.body.F_IT !== undefined) userData.F_IT = req.body.F_IT;
            if (req.body.F_Conta !== undefined) userData.F_Conta = req.body.F_Conta ;
            if (req.body.F_Admin !== undefined) userData.F_Admin = req.body.F_Admin;
            if (req.body.F_Finanzas !== undefined) userData.F_Finanzas = req.body.F_Finanzas;
            if (req.body.F_Governance !== undefined) userData.F_Governance = req.body.F_Governance;
            if (req.body.F_HR !== undefined) userData.F_HR = req.body.F_HR;
            if (req.body.Modules !== undefined) userData.Modules = req.body.Modules;
            if (req.body.Grupo !== undefined) userData.Grupo = req.body.Grupo;

            await UsersModel.updateUser(transaction, userId, userData);

            await transaction.commit();

            res.status(200).json({
                result: 1,
                message: 'User updated successfully'
            });

        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error in updateUser:', error);
            res.status(500).json({
                result: 0,
                message: 'Error updating user',
                error: error.message
            });
        }
    }

    /**
     * Reset user password by generating and emailing a temporary password
     */
    static async changePassword(connection, req, res) {
        await sql.connect(connection);
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            // DevTeam validation
            const requesterUserId = req.session?.userID || req.body?.UserID;
            const devteam = await Rules.validateTeam(req.session?.iddevteam, requesterUserId);

            if (!devteam) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(403).json({
                    result: 0,
                    message: 'Access denied: You do not have permission to reset passwords'
                });
            }

            const userId = Number.parseInt(req.params.id, 10);
            if (Number.isNaN(userId)) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(400).json({
                    result: 0,
                    message: 'Invalid user ID'
                });
            }

            const targetUser = await UsersModel.getUserById(transaction, userId);

            if (!targetUser) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(404).json({
                    result: 0,
                    message: 'User not found'
                });
            }

            if (!targetUser.Email) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(400).json({
                    result: 0,
                    message: 'The user has no email configured'
                });
            }

            const temporaryPassword = UsersController.generateTemporaryPassword();

            await UsersModel.setTemporaryPassword(transaction, userId, temporaryPassword);
            envio_correo('olvido_contraseÃ±a', temporaryPassword, targetUser.Email);

            await transaction.commit();

            res.status(200).json({
                result: 1,
                message: 'Temporary password sent successfully (valid for 24 hours)'
            });

        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error in changePassword:', error);
            res.status(500).json({
                result: 0,
                message: 'Error changing password',
                error: error.message
            });
        }
    }

    /**
     * Upload user image
     */
    static async uploadUserImage(connection, req, res) {
        try {
            const actorUserID = req.session?.userID;
            if (!actorUserID) {
                return res.status(401).json({
                    result: 0,
                    message: 'Unauthorized'
                });
            }

            // Check if file was provided
            if (!req.files || !req.files.userImage) {
                return res.status(400).json({
                    result: 0,
                    message: 'No image file provided'
                });
            }

            const userImage = req.files.userImage;
            const userID = req.body.userID;

            if (!userID) {
                return res.status(400).json({
                    result: 0,
                    message: 'UserID is required'
                });
            }

            const isSelfUpdate = String(actorUserID) === String(userID);
            if (!isSelfUpdate) {
                const isLegacyDevTeam = await Rules.validateTeam(req.session?.iddevteam, actorUserID);
                if (!isLegacyDevTeam) {
                    return res.status(403).json({
                        result: 0,
                        message: 'Access denied: You can only update your own photo'
                    });
                }
            }

            // Validate file extension
            if (!userImage.name.toLowerCase().endsWith('.png')) {
                return res.status(400).json({
                    result: 0,
                    message: 'Only PNG files are allowed'
                });
            }

            // Validate file size (5MB max)
            if (userImage.size > 5 * 1024 * 1024) {
                return res.status(400).json({
                    result: 0,
                    message: 'File size must be less than 5MB'
                });
            }

            // Save image to //srv-dc-lombard.lombard.local/Approvals/pic/
            const imagePath = `//srv-dc-lombard.lombard.local/Approvals/pic/${userID}.png`;

            await userImage.mv(imagePath);

            res.status(200).json({
                result: 1,
                message: 'Image uploaded successfully'
            });

        } catch (error) {
            console.error('Error in uploadUserImage:', error);
            res.status(500).json({
                result: 0,
                message: 'Error uploading image',
                error: error.message
            });
        }
    }

    static async uploadUserSignature(connection, req, res) {
        await sql.connect(connection);
        const transaction = new sql.Transaction();

        try {
            const actorUserID = req.session?.userID;
            if (!actorUserID) {
                return res.status(401).json({
                    result: 0,
                    message: 'Unauthorized'
                });
            }

            if (!req.files || !req.files.userSignature) {
                return res.status(400).json({
                    result: 0,
                    message: 'No signature file provided'
                });
            }

            const targetUserID = String(req.body.userID || '').trim();
            if (!targetUserID) {
                return res.status(400).json({
                    result: 0,
                    message: 'UserID is required'
                });
            }

            const isSelfUpdate = String(actorUserID) === String(targetUserID);
            if (!isSelfUpdate) {
                const isLegacyDevTeam = await Rules.validateTeam(req.session?.iddevteam, actorUserID);
                if (!isLegacyDevTeam) {
                    return res.status(403).json({
                        result: 0,
                        message: 'Access denied: You can only update your own signature'
                    });
                }
            }

            await transaction.begin();
            const saved = await UsersController.saveSignatureForUser(
                transaction,
                targetUserID,
                req.files.userSignature,
                req.body.label || 'Profile Signature'
            );
            await transaction.commit();

            return res.status(200).json({
                result: 1,
                message: 'Signature uploaded successfully',
                id: saved.id,
            });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error in uploadUserSignature:', error);
            return res.status(500).json({
                result: 0,
                message: 'Error uploading signature',
                error: error.message
            });
        }
    }

    static async toggleDarkMode(connection, req, res) {
        await sql.connect(connection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const UserID = req.session?.userID;
            if (!UserID) {
                try { await transaction.rollback(); } catch (_) {}
                return res.status(401).json({ result: 0, message: 'Unauthorized' });
            }
            const darkMode = req.body.DarkMode === 1 ? 1 : 0;
            const request = new sql.Request(transaction);
            request.input('UserID', sql.VarChar, UserID);
            request.input('DarkMode', sql.Int, darkMode);
            await request.query('UPDATE Users SET dark_mode = @DarkMode WHERE UserID = @UserID');
            await transaction.commit();
            res.json({ result: 1, DarkMode: darkMode });
        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            console.error('Error toggling dark mode:', error);
            res.status(500).json({ result: 0, message: 'Error updating dark mode' });
        }
    }
}
