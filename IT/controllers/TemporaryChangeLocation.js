// here are the functions that are used to create, update and read performance review /form_hr_performance_review
import sql from 'mssql';
import { request as _request } from 'https';
import Rules from '../../USERS/rule/DevTeam.js';
import USERModel from '../../USERS/model/USER.js';
import TemporaryChangeLocationModel from "../model/TemporaryChangeLocation.js";
import dotenv from 'dotenv';
dotenv.config();
export default class TemporaryChangeLocationController {
    static async getDepartmentAccess(transaction, UserID) {
        const departmentAccess = [];
        const getAllDepartments = await USERModel.getAllDepartments(transaction);
        const userInfo = await USERModel.obtenerDatosUsuario(transaction, UserID);
        const { manager, suplente, parent_of } = await USERModel.getAreaSupervisor(transaction, userInfo.Dep);

        if (parent_of && (manager == UserID || suplente == UserID)) {
            const orderParentOf = parent_of.split(';').filter((value) => value.trim() !== '');
            for (let i = 0; i < orderParentOf.length; i++) {
                const department = getAllDepartments.filter((item) => item.id == orderParentOf[i]);
                if (department[0] && department[0].nombre) {
                    departmentAccess.push(department[0].nombre);
                }
            }
        }

        return departmentAccess;
    }

    static mapCounters(rows) {
        const initial = { Planned: 0, Ongoing: 0, Finished: 0 };
        if (!rows || rows.length === 0) return initial;

        rows.forEach((row) => {
            if (row && row.status && Object.prototype.hasOwnProperty.call(initial, row.status)) {
                initial[row.status] = Number(row.total || 0);
            }
        });

        return initial;
    }

    static async getInitialTemporaryChangeLocation(conection, req, res) {
        const UserID = req.session?.userID;
        let devteam = await Rules.validateTeam(req.session?.iddevteam, UserID)

        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const { nombre, manager, suplente } = await USERModel.getAreaSupervisor(pool, usuario.Dep);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            const managerData = await USERModel.getManagerData(pool, usuario.Manager);
            const countries = await USERModel.getCountries(pool);
            // Renderizar la vista
            res.render("IT/location/forms_it_temporary_change_location", {
                title: "Temporary Change Location Form",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                    Dep: usuario.Dep,
                    cdepartamento: nombre,
                    manager: managerData[0] || [],
                    area_supervisor: manager,
                    suplente: suplente,
                },
                countries: countries,
                userMenu: usuario.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async createTemporaryChangeLocation(conection, req, res) {
        const UserID = req.session?.userID;
        const devteam = await Rules.validateTeam(req.session?.iddevteam, UserID)
        const isAjaxRequest = req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest' || (req.get('accept') || '').includes('application/json');
        await sql.connect(conection);
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const FormId = await TemporaryChangeLocationModel.createForm(transaction, UserID, req.body);
            const data = new TextEncoder().encode(
                JSON.stringify({ id: FormId, env: process.env.ENTORNO})
            )
            
            fetch('https://prod-114.westus.logic.azure.com/workflows/5ab35fad56204a23b927b2d7ffa0e8b0/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=qYL9KwjDDsVGb9HVMmq6WXBq7iL8iic3093UI65Ff6A', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                },
                body: data
            }).catch(error => {
                console.error('Error:', error);
            });
            
            await transaction.commit();
            const redirectRute = `http://${req.headers.host}/temporary_change_locations/${FormId}`;

            if (isAjaxRequest) {
                return res.status(201).json({
                    ok: true,
                    id: FormId,
                    redirectUrl: redirectRute,
                });
            }

            setTimeout(() => {
                res.redirect(redirectRute);
            }, 500);

        } catch (error) {
            try { await transaction.rollback(); } catch (_) {}
            res.status(500).json({ error: error.message });
        }
    }
    static async readForms(conection, req, res) {
        const UserID = req.session?.userID;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const department = req.query.department || null;
        const status = req.query.status || null;
        const search = req.query.search || null;
        const offset = (page - 1) * limit;
        let departmentAccess=[]
        let devteam = await Rules.validateITModuleTemporaryLocation(req.session?.iddevteam, UserID)
        const pool = await sql.connect(conection);
        try {
            const getAllDepartments = await USERModel.getAllDepartments(pool);
            const UserInfo = await USERModel.obtenerDatosUsuario(pool, UserID);
            const { nombre, manager, suplente, parent_of } = await USERModel.getAreaSupervisor(pool, UserInfo.Dep);
            if (parent_of && manager == UserID || parent_of && suplente == UserID) {
                const orderParentOf = parent_of.split(';').filter(value => value.trim() !== '');
                for (let i = 0; i < orderParentOf.length; i++) {
                     let department = getAllDepartments.filter(department => department.id == orderParentOf[i])
                     departmentAccess.push(department[0].nombre)
                    }

                }
            const formData = await TemporaryChangeLocationModel.redForms(pool, limit, offset, devteam, UserID, department, status, search, departmentAccess);
            const totalCount = await TemporaryChangeLocationModel.totalCount(pool, devteam, UserID, department, status, search, departmentAccess);
            res.send({ formData, totalCount: totalCount.recordset[0].totalCount });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async readFormsMap(conection, req, res) {
        const UserID = req.session?.userID;
        const department = req.query.department || null;
        const status = req.query.status || 'Ongoing';
        const search = (req.query.search || '').trim();
        const safeSearch = search || null;
        let devteam = await Rules.validateITModuleTemporaryLocation(req.session?.iddevteam, UserID)

        const pool = await sql.connect(conection);

        try {
            const departmentAccess = await this.getDepartmentAccess(pool, UserID);
            const mapData = await TemporaryChangeLocationModel.readFormsMap(
                pool,
                devteam,
                UserID,
                department,
                status,
                safeSearch,
                departmentAccess,
            );

            const counters = await TemporaryChangeLocationModel.readMapStatusCounters(
                pool,
                devteam,
                UserID,
                department,
                safeSearch,
                departmentAccess,
            );

            let selectedCollaborator = null;
            let history = [];

            if (safeSearch) {
                selectedCollaborator = await TemporaryChangeLocationModel.findBestCollaborator(
                    pool,
                    devteam,
                    UserID,
                    department,
                    safeSearch,
                    departmentAccess,
                );

                if (selectedCollaborator) {
                    const historyResult = await TemporaryChangeLocationModel.readCollaboratorHistory(
                        pool,
                        devteam,
                        UserID,
                        selectedCollaborator,
                        departmentAccess,
                    );
                    history = historyResult.recordset || [];
                }
            }

            res.send({
                points: mapData.recordset || [],
                counters: this.mapCounters(counters.recordset || []),
                selectedCollaborator,
                history,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async proxyMapTile(req, res) {
        const z = parseInt(req.params.z, 10);
        const x = parseInt(req.params.x, 10);
        const y = parseInt(req.params.y, 10);

        if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 19) {
            return res.status(400).end();
        }

        const maxTile = 2 ** z;
        if (x < 0 || x >= maxTile || y < 0 || y >= maxTile) {
            return res.status(400).end();
        }

        const subdomains = ['a', 'b', 'c'];
        const subdomain = subdomains[(x + y) % subdomains.length];
        const tileUrl = `https://${subdomain}.tile.openstreetmap.org/${z}/${x}/${y}.png`;

        try {
            const upstream = await fetch(tileUrl, {
                headers: { 'User-Agent': 'ActiveRe-Dashboard/1.0 (internal corporate tool; contact IT)' },
            });

            if (!upstream.ok) {
                return res.status(upstream.status).end();
            }

            const buffer = Buffer.from(await upstream.arrayBuffer());
            res.set('Content-Type', upstream.headers.get('content-type') || 'image/png');
            res.set('Cache-Control', 'public, max-age=86400');
            res.send(buffer);
        } catch (error) {
            res.status(502).end();
        }
    }
    static async readFormById(conection, req, res) {
        const UserID = req.session?.userID;
        const id = req.params.id
        let devteam = await Rules.validateTeam(req.session?.iddevteam, UserID)
        const pool = await sql.connect(conection);

        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
            const managerData = await USERModel.getManagerData(pool, usuario.Manager);
            const countries = await USERModel.getCountries(pool);
            const formData = await TemporaryChangeLocationModel.readFormById(pool, id);
            // Renderizar la vista
            res.render("IT/location/forms_it_temporary_change_location_detail", {
                title: "Temporary Change Location",
                formData: formData,
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                    Dep: usuario.Dep,
                    cdepartamento: usuario.cdepartamento,
                    manager: managerData[0] || {},
                },
                countries: countries,
                userMenu: usuario.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async readFormByIdJson(conection, req, res) {
        const id = req.params.id;

        const pool = await sql.connect(conection);

        try {
            const formData = await TemporaryChangeLocationModel.readFormById(pool, id);

            res.status(200).json({ formData });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    static async renderFormList(conection, req, res) {
        const UserID = req.session?.userID;
        const devteam = await Rules.validateTeam(UserID, req.session?.iddevteam);
        let departmentAccess=[]
        const pool = await sql.connect(conection);
        try {
            const usuario = await USERModel.obtenerDatosUsuario(pool, UserID);
            const UserInfo = await USERModel.obtenerDatosUsuario(pool, UserID);
            const grupousuarios = devteam ? await USERModel.findDevTeam(pool, UserID) : [];
            const { nombre, manager, suplente, parent_of } = await USERModel.getAreaSupervisor(pool, UserInfo.Dep);
            const managerData = await USERModel.getManagerData(pool, usuario.Manager);
            const countries = await USERModel.getCountries(pool);

            departmentAccess = await this.getDepartmentAccess(pool, UserID);
            const getDepartments = await TemporaryChangeLocationModel.readAllForms(pool, devteam, UserID, departmentAccess)
            let departments = getDepartments.recordset
            departmentAccess.length > 0? departments= departments.filter(department => departmentAccess.includes(department.department)) : departments

            res.render("IT/location/forms_it_temporary_change_location_list", {
                title: "Temporary Change Location Forms",
                userProfile: {
                    UserName: usuario.UserName,
                    UsuarioID: UserID,
                    Dep: usuario.Dep,
                    cdepartamento: nombre,
                    manager: managerData[0] || {},
                    area_supervisor: manager,
                    suplente: suplente,
                },
                countries: countries,
                userMenu: usuario.Menu,
                usuarios: grupousuarios,
                devteam: devteam,
                departments: departments||[],
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

}