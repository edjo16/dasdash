import sql from 'mssql';
import { get_menu } from '../../functions.js';

export default class USERModel {
    constructor() { }
    static async getAllUserNames(transaction) {
        const requestUser = new sql.Request(transaction);
        const query = `SELECT UserID, Name, Email FROM Users`;
        const { recordset } = await requestUser.query(query);
       return recordset
    }
    static async getAllUsersActive(transaction) {
        const requestUser = new sql.Request(transaction);
        const query = `SELECT Id, UserID, Name, Email FROM Users WHERE UserID IS NOT NULL AND user_type = 1 AND Estado = 1 order by Name asc`;
        const { recordset } = await requestUser.query(query);
       return recordset
    }
    static async getAllUserActive(transaction, ccompania) {
        const requestUser = new sql.Request(transaction);
        const query = `SELECT UserID, Name, Email, cdepartamento, md.nombre as departamento FROM Users u
        INNER JOIN mdepartamento md ON u.cdepartamento = md.id
        WHERE u.UserID IS NOT NULL AND u.ccompania = @ccompania AND u.user_type = 1 AND u.Estado = 1 order by u.Name asc`;
        requestUser.input('ccompania', sql.VarChar, ccompania);
        const { recordset } = await requestUser.query(query);
       return recordset
    }
    static async getAllUserActiveByDepartment(transaction, ccompania, cdepartamento) {
        const requestUser = new sql.Request(transaction);
        const query = `SELECT UserID, Name, Email FROM Users WHERE UserID IS NOT NULL AND ccompania = @ccompania  AND cdepartamento = @cdepartamento AND user_type = 1 AND Estado = 1 order by Name asc`;
        requestUser.input('ccompania', sql.VarChar, ccompania);
        requestUser.input('cdepartamento', sql.VarChar, cdepartamento);
        const { recordset } = await requestUser.query(query);
       return recordset
    }
    static async obtenerDatosUsuario(transaction, UserID) {
        const requestUser = new sql.Request(transaction);
        const query = `
            SELECT TOP 1 Users.*,c.ccompania AS ccompania_compania,c.xnombre, c.xlogo
            FROM Users 
            LEFT JOIN (SELECT CAST(ccompania AS VARCHAR(10)) AS ccompania, xnombre, xlogo FROM companias) AS c 
            ON Users.compania LIKE '%' + c.ccompania + '%'
            WHERE Users.UserID = @UserID OR Users.Name = @UserID`;
        requestUser.input('UserID', sql.VarChar, UserID);
        const { recordset } = await requestUser.query(query);
        const usuario = {
            departamentoOrigen: recordset[0].departamento,
            compania:recordset[0].ccompania,
            companies:recordset[0].compania,
            UserName: recordset[0].Name,
            UserID: recordset[0].UserID,
            UserEmail: recordset[0].Email,
            Modules: recordset[0].Modules,
            Dep: recordset[0].cdepartamento,
            Manager: recordset[0].Manager,
            cdepartamento: recordset[0].departamento,
            departamento: recordset[0].departamento,
            compania_nombre:recordset[0].xnombre,
            DarkMode: recordset[0].dark_mode || 0,
            Menu: get_menu({ recordset: [recordset[0]] })
        };

        return usuario;
    }
    static async obtenerDatosUsuarioByName(transaction, Name) {
        const requestUser = new sql.Request(transaction);
        const query = `SELECT TOP 1 UserID FROM Users WHERE Name = @Name OR Name = @Name`;
        requestUser.input('Name', sql.VarChar, Name);
        const { recordset } = await requestUser.query(query);
        return recordset[0];
    }

    static async findDevTeam(transaction, UserID) {

        const requestUser = new sql.Request(transaction);
        let grupousuarios = []
        const query = `SELECT * FROM Users WHERE Name IS NOT NULL AND user_type = 1 ORDER BY estado DESC, Name asc`;
        const { recordset } = await requestUser.query(query);

        if (recordset) {
            for (let u = 0; u < recordset.length; u++) {
                grupousuarios.push([recordset[u].UserID, recordset[u].Name])
            }
        }
        return grupousuarios;
    }

    static async findUserNames(transaction, logData) {
        const users = logData;
        const userData = {
            solicitante: users.solicitante,
            verificador: users.verificador || 'N/A',
            aprobador: users.aprobador || 'N/A',
            firmante: users.firmante || 'N/A',
            ejecutor: users.ejecutor || 'N/A',
            operador: users.operador || 'N/A',
            asignado: users.asignado || 'N/A',
            csuscriptor: users.csuscriptor || 'N/A'
        };

        const userFields = Object.entries(userData).filter(([_, value]) => value !== 'N/A');
        const namesToFetch = userFields.map(([key, value]) => value);

        if (namesToFetch.length === 0) {
            return {};
        }

        // Construimos la consulta con parámetros
        const query = `
            SELECT UserID, Name
            FROM Users
            WHERE Name IS NOT NULL
            AND user_type = 1
            AND Name IN (${namesToFetch.map((_, index) => `@name${index}`).join(', ')})
            ORDER BY estado DESC, Name ASC
        `;

        const requestUserNames = new sql.Request(transaction);
        namesToFetch.forEach((name, index) => {
            requestUserNames.input(`name${index}`, sql.NVarChar, name);
        });

        try {
            const { recordset } = await requestUserNames.query(query);

            const result = {};
            for (const [field, name] of userFields) {
                const user = recordset.find(u => u.Name === name);
                if (user) {
                    result[field] = user.UserID;
                }
            }

            return result;
        } catch (error) {
            console.error("Error al ejecutar la consulta:", error);
            throw new Error("Error al obtener los UserIDs");
        }
    }
    // necesito cambiar esta para que me devuelva los Names en lugar de los userIDs
    static async findUserNamesById(transaction, logData, managerDepartment) {
        const users = logData;
        const userData = {
            verificador: users?.verificador || 'N/A',
            aprobador: users?.aprobador || 'N/A',
            firmante: users?.firmante || 'N/A',
            ejecutor: users?.ejecutor || 'N/A',
            operador: users?.operador || 'N/A',
            asignado: users?.asignado || 'N/A',
            csuscriptor: users?.csuscriptor || 'N/A'
        };

        const userFields = Object.entries(userData).filter(([_, value]) => value !== 'N/A');
        const usersIds = userFields.map(([key, value]) => value);

        if (usersIds.length === 0) {
            return {};
        }

        // Construimos la consulta con parámetros
        const query = `
            SELECT UserID, Name
            FROM Users
            WHERE Name IS NOT NULL
            AND user_type = 1
            AND UserID IN (${usersIds.map((_, index) => `@name${index}`).join(', ')})
            ORDER BY estado DESC, Name ASC
        `;

        const requestUserNames = new sql.Request(transaction);
        usersIds.forEach((userId, index) => {
            requestUserNames.input(`name${index}`, sql.NVarChar, userId);
        });

        try {
            const { recordset } = await requestUserNames.query(query);

            const result = {};
            for (const [field, name] of userFields) {
                if(name === 'area_supervisor') {
                    result[field] = managerDepartment;
                }
                else {
                const user = recordset.find(u => u.UserID === name);
                if (user) {
                    result[field] = user.Name;
                } else {
                    result[field] = "N/A";
                }
            }
            }

            return result;
        } catch (error) {
            console.error("Error al ejecutar la consulta:", error);
            throw new Error("Error al obtener los UserIDs");
        }
    }
    static async getGroupUsers(transaction) {
        let grupousuarios = [];
        const request = new sql.Request(transaction);
        const query = "SELECT * FROM Users WHERE Name IS NOT NULL AND user_type = 1 ORDER BY estado DESC, Name asc";
        const { recordset } = await request.query(query);
        for (let u = 0; u < recordset.length; u++) {
            grupousuarios.push([recordset[u].UserID, recordset[u].Name])
        }
        return grupousuarios;
    }
        static async getAccUsers(transaction, ccompania) {
        const request = new sql.Request(transaction);
        const query = "SELECT Name FROM Users WHERE Name IS NOT NULL AND user_type = 1 AND cdepartamento = 1 AND ccompania = @ccompania AND estado = 1 ORDER BY Name asc";
        request.input('ccompania', sql.Int, ccompania);
        const { recordset } = await request.query(query);
        return recordset;
    }
    static async getManagerData(transaction, Manager) {
        const request = new sql.Request(transaction);
        const query = `SELECT Name, UserID, xcargo FROM Users WHERE UserID = @Manager`;
        request.input('Manager', sql.VarChar, Manager);
        const { recordset } = await request.query(query);
        return recordset;
    }

    static async getAreaSupervisor(transaction, id) {
        const request = new sql.Request(transaction);
        const query = `SELECT nombre, manager, parent_of, suplente FROM mdepartamento WHERE id = @id`;
        request.input('id', sql.VarChar, id);
        const { recordset } = await request.query(query);
        return recordset[0];
    }

    static async getUserAccess(transaction, manager, parent_of) {
        const request = new sql.Request(transaction);
        const query = `SELECT * FROM mdepartamento WHERE manager = @manager AND parent_of = @parent_of`;
        request.input('manager', sql.VarChar, manager);
        request.input('parent_of', sql.VarChar, parent_of);
        const { recordset } = await request.query(query);
        return recordset;
    }

    static async getAllDepartments(transaction) {
        const request = new sql.Request(transaction);
        const query = `SELECT * FROM mdepartamento`;
        const { recordset } = await request.query(query);
        return recordset;
    }

    static async getCountries(transaction) {
        const request = new sql.Request(transaction);
        const query = `SELECT cpais, xnombre_pais_ingles FROM m_pais ORDER BY xnombre_pais_ingles ASC`;
        const { recordset } = await request.query(query);
        return recordset;
    }

    static async findUserId(transaction, userIDs, csuscriptor) {
        const users = userIDs;
        // Orden de mayor a menor jerarquía
        const mainFields = [
            { main: 'uejecutor', suplente: 'uejecutor_suplente', result: 'ejecutor' },
            { main: 'uoperador', suplente: 'uoperador_suplente', result: 'operador' },
            { main: 'ufirmante', suplente: 'ufirmante_suplente', result: 'firmante' },
            { main: 'uaprobador', suplente: 'uaprobador_suplente', result: 'aprobador' },
            { main: 'uverificador', suplente: 'uverificador_suplente', result: 'verificador' }
        ];

        let idsToFetch = [];
        mainFields.forEach(({ main, suplente }) => {
            if (users[main] && users[main] !== 'N/A') idsToFetch.push(users[main]);
            if (users[suplente] && users[suplente] !== 'N/A') idsToFetch.push(users[suplente]);
        });
        if (csuscriptor && csuscriptor !== 'N/A') idsToFetch.push(csuscriptor);

        idsToFetch = [...new Set(idsToFetch)];
        if (idsToFetch.length === 0) {
            return {};
        }

        const query = `
            SELECT UserID, Name, vacaciones
            FROM Users
            WHERE Name IS NOT NULL
            AND user_type = 1
            AND vacaciones = 0
            AND UserID IN (${idsToFetch.map((_, index) => `@UserID${index}`).join(', ')})
            ORDER BY estado DESC, Name ASC
        `;

        const requestUserNames = new sql.Request(transaction);
        idsToFetch.forEach((UserID, index) => {
            requestUserNames.input(`UserID${index}`, sql.NVarChar, UserID);
        });

        try {
            const { recordset } = await requestUserNames.query(query);
            let result = {
                verificador: "N/A",
                aprobador: "N/A",
                firmante: "N/A",
                ejecutor: "N/A",
                operador: "N/A",
                csuscriptor: "N/A"
            };

            // to avoid repetitions of participants
            const usedUserIds = new Set();

            for (const { main, suplente, result: resultKey } of mainFields) {
                let userId = users[main];
                let user = userId && userId !== 'N/A' ? recordset.find(u => u.UserID === userId) : null;
                if (user && user.vacaciones !== 1 && !usedUserIds.has(user.UserID)) {
                    result[resultKey] = user.Name;
                    usedUserIds.add(user.UserID);
                    continue;
                }
                // if principal is vacation or already used or not exists, search for suplent
                let suplenteId = users[suplente];
                let suplenteUser = suplenteId && suplenteId !== 'N/A' ? recordset.find(u => u.UserID === suplenteId) : null;
                if (suplenteUser && suplenteUser.vacaciones !== 1 && !usedUserIds.has(suplenteUser.UserID)) {
                    result[resultKey] = suplenteUser.Name;
                    usedUserIds.add(suplenteUser.UserID);
                    continue;
                }
                // if any of them is not exists, set to N/A
            }

            if (csuscriptor && csuscriptor !== 'N/A') {
                const user = recordset.find(u => u.UserID === csuscriptor);
                if (user && user.vacaciones !== 1 && !usedUserIds.has(user.UserID)) {
                    result.csuscriptor = user.Name;
                    usedUserIds.add(user.UserID);
                }
            }

            return result;
        } catch (error) {
            console.error("Error al ejecutar la consulta:", error);
            throw new Error("Error al obtener los UserIDs");
        }
    }
    static async findUserId2(transaction, userIDs = [], csuscriptor) {

        // Roles válidos del sistema
        const validRoles = ['verificador', 'aprobador', 'firmante', 'ejecutor', 'operador'];

        // 1️⃣ Extraer todos los IDs únicos
        let idsToFetch = [];

        userIDs.forEach(roleObj => {
            const roleKey = Object.keys(roleObj)[0];
            const roleData = roleObj[roleKey];

            if (validRoles.includes(roleKey) && roleData?.integrantes?.length) {
                roleData.integrantes.forEach(i => {
                    if (i.code && i.code !== 'N/A') {
                        idsToFetch.push(i.code);
                    }
                });
            }
        });

        if (csuscriptor && csuscriptor !== 'N/A') {
            idsToFetch.push(csuscriptor);
        }

        idsToFetch = [...new Set(idsToFetch)];
        if (idsToFetch.length === 0) return {};

        // 2️⃣ Query
        const query = `
            SELECT UserID, Name, vacaciones
            FROM Users
            WHERE Name IS NOT NULL
            AND user_type = 1
            AND vacaciones = 0
            AND UserID IN (${idsToFetch.map((_, i) => `@UserID${i}`).join(', ')})
            ORDER BY Name ASC
        `;

        const request = new sql.Request(transaction);
        idsToFetch.forEach((id, i) => {
            request.input(`UserID${i}`, sql.NVarChar, id);
        });

        try {
            const { recordset } = await request.query(query);

            let result = {
                verificador: "N/A",
                aprobador: "N/A",
                firmante: "N/A",
                ejecutor: "N/A",
                operador: "N/A",
                csuscriptor: "N/A"
            };

            const usedUserIds = new Set();

            // 3️⃣ Asignar usuarios por rol
            for (const roleObj of userIDs) {
                const roleKey = Object.keys(roleObj)[0];
                const roleData = roleObj[roleKey];

                if (!validRoles.includes(roleKey)) continue;

                for (const integrante of roleData.integrantes || []) {
                    const user = recordset.find(
                        u => u.UserID === integrante.code && !usedUserIds.has(u.UserID)
                    );

                    if (user) {
                        result[roleKey] = user.Name;
                        usedUserIds.add(user.UserID);
                        break; // solo uno por rol
                    }
                }
            }

            // 4️⃣ csuscriptor
            if (csuscriptor && csuscriptor !== 'N/A') {
                const user = recordset.find(
                    u => u.UserID === csuscriptor && !usedUserIds.has(u.UserID)
                );

                if (user) {
                    result.csuscriptor = user.Name;
                    usedUserIds.add(user.UserID);
                }
            }

            return result;

        } catch (error) {
            console.error("Error al ejecutar la consulta:", error);
            throw new Error("Error al obtener los UserIDs");
        }
    }

    static async findUserIdSIR(transaction, userIDs, csuscriptor) {
        const users = userIDs;
        // Orden de mayor a menor jerarquía
        const mainFields = [
            { main: 'uejecutor', suplente: 'uejecutor_suplente', result: 'ejecutor' },
            { main: 'uoperador', suplente: 'uoperador_suplente', result: 'operador' },
            { main: 'ufirmante', suplente: 'ufirmante_suplente', result: 'firmante' },
            { main: 'uaprobador', suplente: 'uaprobador_suplente', result: 'aprobador' },
            { main: 'uverificador', suplente: 'uverificador_suplente', result: 'verificador' }
        ];

        let idsToFetch = [];
        mainFields.forEach(({ main, suplente }) => {
            if (users[main] && users[main] !== 'N/A') idsToFetch.push(users[main]);
            if (users[suplente] && users[suplente] !== 'N/A') idsToFetch.push(users[suplente]);
        });
        if (csuscriptor && csuscriptor !== 'N/A') idsToFetch.push(csuscriptor);

        idsToFetch = [...new Set(idsToFetch)];
        if (idsToFetch.length === 0) {
            return {};
        }

        const query = `
            SELECT UserID, Name, vacaciones
            FROM Users
            WHERE Name IS NOT NULL
            AND user_type = 1
            AND vacaciones = 0
            AND UserID IN (${idsToFetch.map((_, index) => `@UserID${index}`).join(', ')})
            ORDER BY estado DESC, Name ASC
        `;

        const requestUserNames = new sql.Request(transaction);
        idsToFetch.forEach((UserID, index) => {
            requestUserNames.input(`UserID${index}`, sql.NVarChar, UserID);
        });

        try {
            const { recordset } = await requestUserNames.query(query);
            let result = {
                verificador: "N/A",
                aprobador: "N/A",
                firmante: "N/A",
                ejecutor: "N/A",
                operador: "N/A",
                csuscriptor: "N/A"
            };

            // to avoid repetitions of participants
            const usedUserIds = new Set();

            for (const { main, suplente, result: resultKey } of mainFields) {
                let userId = users[main];
                let user = userId && userId !== 'N/A' ? recordset.find(u => u.UserID === userId) : null;
                if (user && user.vacaciones !== 1 && !usedUserIds.has(user.UserID)) {
                    result[resultKey] = user.Name;
                    usedUserIds.add(user.UserID);
                    continue;
                }
                // if principal is vacation or already used or not exists, search for suplent
                let suplenteId = users[suplente];
                let suplenteUser = suplenteId && suplenteId !== 'N/A' ? recordset.find(u => u.UserID === suplenteId) : null;
                if (suplenteUser && suplenteUser.vacaciones !== 1 && !usedUserIds.has(suplenteUser.UserID)) {
                    result[resultKey] = suplenteUser.Name;
                    usedUserIds.add(suplenteUser.UserID);
                    continue;
                }
                // if any of them is not exists, set to N/A
            }

            if (csuscriptor && csuscriptor !== 'N/A') {
                const user = recordset.find(u => u.UserID === csuscriptor);
                if (user && user.vacaciones !== 1 && !usedUserIds.has(user.UserID)) {
                    result.csuscriptor = user.Name;
                    usedUserIds.add(user.UserID);
                }
            }

            // Determinar el estado efectivo inicial según el primer rol disponible
            const statusOrder = [
                { key: 'verificador', status: 'Verify' },
                { key: 'aprobador', status: 'Approve' },
                { key: 'firmante', status: 'Signature' },
                { key: 'operador', status: 'Operate' },
                { key: 'ejecutor', status: 'Execute' }
            ];

            let effectiveStatus = 'Verify'; // valor por defecto (se ajustará abajo si corresponde)
            for (const { key, status } of statusOrder) {
                if (result[key] && result[key] !== 'N/A') {
                    effectiveStatus = status;
                    break;
                }
            }

            return { ...result, status: effectiveStatus };
        } catch (error) {
            console.error("Error al ejecutar la consulta:", error);
            throw new Error("Error al obtener los UserIDs");
        }
    }
    static async GetUserIdByManager(transaction, UserID) {
        const request = new sql.Request(transaction);
        const query = `SELECT Name, UserID FROM Users WHERE manager = @UserID and Estado = 1 order by Name`
        request.input('UserID', sql.VarChar, UserID)
        const { recordset } = await request.query(query);
        return recordset;
    }
    static async GetUserNameByManager(transaction, UserID, query_where) {

        const request = new sql.Request(transaction);
        const query = `SELECT Name, UserID FROM Users WHERE (manager = @UserID or ${query_where}) and Estado = 1 order by Name`
        request.input('UserID', sql.VarChar, UserID)
        const { recordset } = await request.query(query);
        return recordset;
    }

    static async getUserDepartment(transaction, UserID) {
        let sql_where = '';
        const request = new sql.Request(transaction);
        
        // Obtener departamentos donde el usuario es manager
        const queryManager = `SELECT id, nombre, parent_of FROM mdepartamento WHERE manager = @UserID`;
        request.input('UserID', sql.VarChar, UserID);
        const { recordset: managerDepts } = await request.query(queryManager);
        
        // Función recursiva para obtener todos los parent_of
        const getAllParentIds = async (currentIds) => {
            if (currentIds.size === 0) {
                return new Set();
            }
            
            const allParentIds = new Set(currentIds);
            const request2 = new sql.Request(transaction);
            const idsArray = Array.from(currentIds);
            const placeholders = idsArray.map((_, index) => `@id${index}`).join(', ');
            const queryParents = `SELECT id, parent_of FROM mdepartamento WHERE id IN (${placeholders})`;
            
            idsArray.forEach((id, index) => {
                request2.input(`id${index}`, sql.VarChar, id);
            });
            
            const { recordset: parentRecords } = await request2.query(queryParents);
            const nextLevelIds = new Set();
            
            parentRecords.forEach(dept => {
                if (dept.parent_of) {
                    const ids = dept.parent_of.split(';');
                    ids.forEach(id => {
                        const trimmedId = id.trim();
                        if (trimmedId && !allParentIds.has(trimmedId)) {
                            nextLevelIds.add(trimmedId);
                            allParentIds.add(trimmedId);
                        }
                    });
                }
            });
            
            // Recursión: buscar parent_of de los nuevos IDs encontrados
            if (nextLevelIds.size > 0) {
                const childParentIds = await getAllParentIds(nextLevelIds);
                childParentIds.forEach(id => allParentIds.add(id));
            }
            
            return allParentIds;
        };
        
        // Recolectar IDs iniciales de parent_of
        const initialParentIds = new Set();
        managerDepts.forEach(dept => {
            if (dept.parent_of) {
                const ids = dept.parent_of.split(';');
                ids.forEach(id => {
                    const trimmedId = id.trim();
                    if (trimmedId) {
                        initialParentIds.add(trimmedId);
                    }
                });
            }
        });
        
        // Obtener todos los parent_of de forma recursiva
        const allParentIds = await getAllParentIds(initialParentIds);
        
        // Construir la condición para buscar flows
        let departmentConditions = `d.manager = @UserID`;
        if (allParentIds.size > 0) {
            const parentConditions = Array.from(allParentIds).map((id, index) => {
                request.input(`parent${index}`, sql.VarChar, id);
                return `d.id = @parent${index}`;
            }).join(' OR ');
            departmentConditions += ` OR ${parentConditions}`;
        }

        // Consulta principal para obtener los flows
        const query = `SELECT f.id FROM mdepartamento d
        INNER JOIN approvals_flow f ON f.cdepartamento = d.id
        WHERE ${departmentConditions}
        GROUP BY f.id`;
        
        const { recordset } = await request.query(query);

        // Construir el WHERE con todos los flow IDs
        for (let index = 0; index < recordset.length; index++) {
            if (index == 0 || index < recordset.length) {
                sql_where += ` or `
            }
            sql_where += `cflow = ${recordset[index].id}`
        }
        
        return sql_where;
    }
    static async getDepartmentWhenManager(transaction, UserID) {
        const request = new sql.Request(transaction);
        
        // Obtener departamentos donde el usuario es manager
        const query = `SELECT id, nombre, parent_of FROM mdepartamento WHERE manager = @UserID`;
        request.input('UserID', sql.VarChar, UserID);
        const { recordset } = await request.query(query);
        
        // Si no es manager de ningún departamento, devolver array vacío
        if (!recordset || recordset.length === 0) {
            return [];
        }
        
        // Función recursiva para obtener todos los parent_of
        const getAllParentIds = async (currentIds) => {
            if (currentIds.size === 0) {
                return new Set();
            }
            
            const allParentIds = new Set(currentIds);
            const request2 = new sql.Request(transaction);
            const idsArray = Array.from(currentIds);
            const placeholders = idsArray.map((_, index) => `@id${index}`).join(', ');
            const queryParents = `SELECT id, parent_of FROM mdepartamento WHERE id IN (${placeholders})`;
            
            idsArray.forEach((id, index) => {
                request2.input(`id${index}`, sql.Int, id);
            });
            
            const { recordset: parentRecords } = await request2.query(queryParents);
            const nextLevelIds = new Set();
            
            parentRecords.forEach(dept => {
                if (dept.parent_of) {
                    const ids = dept.parent_of.split(';');
                    ids.forEach(id => {
                        const trimmedId = id.trim();
                        if (trimmedId && !isNaN(trimmedId)) {
                            const parsedId = parseInt(trimmedId, 10);
                            if (!allParentIds.has(parsedId)) {
                                nextLevelIds.add(parsedId);
                                allParentIds.add(parsedId);
                            }
                        }
                    });
                }
            });
            
            // Recursión: buscar parent_of de los nuevos IDs encontrados
            if (nextLevelIds.size > 0) {
                const childParentIds = await getAllParentIds(nextLevelIds);
                childParentIds.forEach(id => allParentIds.add(id));
            }
            
            return allParentIds;
        };
        
        // Recolectar IDs iniciales de parent_of
        const initialParentIds = new Set();
        recordset.forEach(dept => {
            if (dept.parent_of) {
                const ids = dept.parent_of.split(';');
                ids.forEach(id => {
                    const trimmedId = id.trim();
                    if (trimmedId && !isNaN(trimmedId)) {
                        initialParentIds.add(parseInt(trimmedId, 10));
                    }
                });
            }
        });
        
        // Obtener todos los parent_of de forma recursiva
        const allParentIds = await getAllParentIds(initialParentIds);
        
        // Obtener solo los departamentos finales (que NO tienen parent_of)
        let leafDepartments = [];
        if (allParentIds.size > 0) {
            const request3 = new sql.Request(transaction);
            const parentIdsArray = Array.from(allParentIds);
            const placeholders = parentIdsArray.map((_, index) => `@parentId${index}`).join(', ');
            const queryLeaf = `SELECT id, nombre FROM mdepartamento WHERE id IN (${placeholders}) AND (parent_of IS NULL OR parent_of = '')`;
            
            parentIdsArray.forEach((id, index) => {
                request3.input(`parentId${index}`, sql.Int, id);
            });
            
            const { recordset: leafRecords } = await request3.query(queryLeaf);
            leafDepartments = leafRecords;
        }
        
        // Eliminar duplicados por id
        const uniqueDepartments = Array.from(
            new Map(leafDepartments.map(item => [item.id, item])).values()
        );
        
        return uniqueDepartments;
    }

    static async getManagerAccess(transaction, manager) {
        const request = new sql.Request(transaction);
        const query = `SELECT * FROM mdepartamento WHERE manager = @manager`;
        request.input('manager', sql.VarChar, manager);
        const { recordset } = await request.query(query);
        return recordset;
    }

    
    static async getUsersByDepartment(conection, departamento) {
        let sql_where = departamento.map(id => `cdepartamento = ${id}`).join(' or ');
        let pool = await sql.connect(conection);
        var result = await pool.request()
            .query(`SELECT Name FROM Users WHERE (${sql_where})`);
    
        return result.recordset;
    }
        static async getUsernamesForSupportApproval(transaction, id) {
            const request = new sql.Request(transaction);
            const query = `SELECT ejecutor, asignado, firmante FROM log WHERE id = @id`;
            request.input('id', sql.Int, id);
            const { recordset } = await request.query(query);
            const { ejecutor, asignado, firmante } = recordset[0];
            return { ejecutor, asignado, firmante }
        }
        static async getUserIDForSupportApproval(transaction, ejecutor, asignado, firmante) {
            const request = new sql.Request(transaction);
            const query = `SELECT UserID FROM Users WHERE Name = @ejecutor OR Name = @asignado OR Name = @firmante`;
            request.input('ejecutor', sql.NVarChar, ejecutor);
            request.input('asignado', sql.NVarChar, asignado);
            request.input('firmante', sql.NVarChar, firmante);
            const { recordset } = await request.query(query);
            const userIds = recordset.map(record => record.UserID);
            return userIds;            
        }
        static async getUsernamesForApproval(transaction, id) {
            const request = new sql.Request(transaction);
            const query = `SELECT solicitante, verificador, aprobador, firmante, operador, ejecutor, asignado, csuscriptor FROM log WHERE id = @id`;
            request.input('id', sql.Int, id);
            const { recordset } = await request.query(query);
            const { solicitante, verificador, aprobador, firmante, operador, ejecutor, asignado, csuscriptor } = recordset[0];
            return { solicitante, verificador, aprobador, firmante, operador, ejecutor, asignado, csuscriptor }
        }

        static async getUserIDForApproval(transaction, solicitante, verificador, aprobador, firmante, operador, ejecutor, asignado, csuscriptor) {
            const request = new sql.Request(transaction);
            const query = `SELECT UserID FROM Users WHERE  Name = @solicitante OR Name = @verificador OR Name = @aprobador OR Name = @firmante OR Name = @operador OR Name = @ejecutor OR Name = @asignado OR Name = @csuscriptor`;
            request.input('solicitante', sql.NVarChar, solicitante);
            request.input('verificador', sql.NVarChar, verificador);
            request.input('aprobador', sql.NVarChar, aprobador);
            request.input('firmante', sql.NVarChar, firmante);
            request.input('operador', sql.NVarChar, operador);
            request.input('ejecutor', sql.NVarChar, ejecutor);
            request.input('asignado', sql.NVarChar, asignado);
            request.input('csuscriptor', sql.NVarChar, csuscriptor);
            const { recordset } = await request.query(query);
            const userIds = recordset.map(record => record.UserID);
            return userIds;            
        }

        static async getUsersAndCompanies(transaction, req, res, companies) {
            const request = new sql.Request(transaction);
            let query = `SELECT u.Name 
            FROM Users u 
            WHERE u.user_type = 1  AND u.compania LIKE @companies AND u.estado = 1 
            ORDER BY u.Name
            `;        
            request.input('companies', `%${companies}%`);
            const { recordset } = await request.query(query);
            return recordset;
        }
        static async getUserFlows(transaction, req, res) {
            const request = new sql.Request(transaction);
            let query = `SELECT * from approvals_flow AS a
            LEFT JOIN companias AS c ON c.ccompania = a.ccompania
            where id = ${req.body.approvals_select}`;
            request.input('compania', sql.VarChar, req.body.compania);
            const { recordset } = await request.query(query);
            return recordset[0];
        }
        static async getDepartment(transaction, departmentId) {
            const request = new sql.Request(transaction);
            const query = `
            SELECT nombre
            FROM departamentos
            WHERE id = @departmentId
        `;
        request.input('departmentId', sql.Int, departmentId);
        const { recordset } = await request.query(query);
        return recordset[0];
        }
        static async getAccessUsers(transaction, id_flow) {
            const request = new sql.Request(transaction);
            const query = `SELECT user_code FROM approval_access WHERE id_flow = @id_flow OR admin = 1`;
            request.input('id_flow', sql.Int, id_flow);
            const { recordset } = await request.query(query);
            const userIds = recordset ? recordset.map(record => record.user_code) : [];
            return userIds;            
        }
        static async getFlowAccess(transaction, user_code) {
            const request = new sql.Request(transaction);
            const query = `
                SELECT id_flow 
                FROM approval_access 
                WHERE user_code = @user_code AND id_flow <> 0
            `;

            request.input('user_code', sql.VarChar, user_code);
            const { recordset } = await request.query(query);

            const flows = recordset
                ? recordset.map(record => ` or cflow = ${record.id_flow}`).join('')
                : '';
            return flows;
        }

        static async getUserAlias(transaction, user_alias) {
            const request = new sql.Request(transaction);
            const query = `SELECT user_code,user_alias, Name FROM approvals_alias
            left join users on users.UserID = user_code
             WHERE user_alias = @user_alias`
            request.input('user_alias', sql.VarChar, user_alias);
            const { recordset } = await request.query(query);
            return recordset ? recordset[0] : null;
        }

}