import sql from 'mssql';
import approvalsRule from '../../APPROVALS/rules/approvals.js';
export default class InterpersonalModel {
    constructor() { }
    static async postGetCompanias(transaction, companiasUnordered) {
        var query_where = ''
        const companias = companiasUnordered.split(';')
        for (let index = 0; index < companias.length; index++) {
            query_where += `ccompania = ${companias[index]}`
            if (index < companias.length - 1)
                query_where += ` or `
        }

        let sql_query = `SELECT * FROM companias WHERE ${query_where}`;

        const request = new sql.Request(transaction);
        request.input('ccompania', sql.VarChar, companias);
        const { recordset } = await request.query(sql_query);
        return recordset;
    }
    static async getBanks(conection, ccompania, cflow) {
        const pool = await sql.connect(conection);
        const request = pool.request();

        request.input('ccompania', sql.Int, ccompania);
        request.input('cflow', sql.Int, cflow);

        const result = await request.query(`
            SELECT *
            FROM (
                SELECT DISTINCT mb.*
                FROM approval_banco ab
                INNER JOIN mbanco mb ON ab.banco_id = mb.id
                WHERE ab.approval_flow_id = @cflow
                AND mb.ccompania = @ccompania
            ) t
            ORDER BY 
                CASE 
                    WHEN t.xnombre = 'Banco Ficohsa' THEN 0 
                    ELSE 1 
                END,
                t.xnombre;
        `);

        return result.recordset;
    }

    // version actual 
    static async postGetFlows( transaction, cdepartamento) {
        const requestFlows = new sql.Request(transaction);
        const departamentos = cdepartamento.split(';').map(s => s.trim()).filter(Boolean);
        const placeholders = departamentos.map((_, i) => `@dep${i}`).join(', ');
        departamentos.forEach((dep, i) => {
            requestFlows.input(`dep${i}`, sql.VarChar, dep);
        });
        const query = `SELECT f.*, 
            (SELECT d.nombre FROM mdepartamento d WHERE d.id = f.cdepartamento) AS dep_nombre
            FROM approvals_flow f
            WHERE (f.cdepartamento IN (${placeholders}) AND f.origen = 'DASHBOARD' AND f.estado = 1) 
            ORDER BY f.nombre;`;
        const { recordset } = await requestFlows.query(query);
        return recordset;
    }
    static async getIntegrantUser(approvalFlow, manager, departments) {
        const estados = [
            { estadoKey: 'verificador', integrantesKey: 'uverificador', estado_accion: 'Verify;Verified' },
            { estadoKey: 'aprobador', integrantesKey: 'uaprobador', estado_accion: 'Approve;Approved' },
            { estadoKey: 'firmante', integrantesKey: 'ufirmante', estado_accion: 'Signature;Signed' },
            { estadoKey: 'operador', integrantesKey: 'uoperador', estado_accion: 'Apply;Applied' },
            { estadoKey: 'ejecutor', integrantesKey: 'uejecutor', estado_accion: 'Execute;Executed' },
            { estadoKey: 'verificador_suplente', integrantesKey: 'uverificador_suplente', estado_accion: 'Verify;Verified' },
            { estadoKey: 'aprobador_suplente', integrantesKey: 'uaprobador_suplente', estado_accion: 'Approve;Approved' },
            { estadoKey: 'firmante_suplente', integrantesKey: 'ufirmante_suplente', estado_accion: 'Signature;Signed' },
            { estadoKey: 'operador_suplente', integrantesKey: 'uoperador_suplente', estado_accion: 'Apply;Applied' },
            { estadoKey: 'ejecutor_suplente', integrantesKey: 'uejecutor_suplente', estado_accion: 'Execute;Executed' },
            { estadoKey: 'csuscriptor', integrantesKey: 'uejecutor_suplente', estado_accion: 'Execute;Executed' },
        ];

        let seen = new Set();
        let repeatedValues = new Set();
        let result = [];

        for (let i = 0; i < estados.length; i++) {
            const estadoName = estados[i].estadoKey;
            const integrantesStr = approvalFlow[estados[i].integrantesKey];
            if (!estadoName || !integrantesStr || !estadoName === '') continue;

            const integrantesArr = integrantesStr.split(';').map(s => s.trim()).filter(Boolean);
            // Puede haber varios requeridos separados por ;
            let integrantesResueltos = [];

            for (let integrante of integrantesArr) {
                let resolvedUser = null;
                const isARole = await approvalsRule.chekIntegrant(integrante);

                if (!isARole) {
                    resolvedUser = integrante;
                } else {
                    if (integrante === "manager") {
                        resolvedUser = manager;
                    } else if (integrante === "area_supervisor") {
                        const accountingDept = departments.find(dept =>  dept.id === Number(approvalFlow.cdepartamento ));
                        if (accountingDept) resolvedUser = accountingDept.manager;
                    } else if (integrante === "rrhh_supervisor") {
                        const rrhhDept = departments.find(dept => dept.id === Number(approvalFlow.cdepartamento ));
                        if (rrhhDept) resolvedUser = rrhhDept.manager;
                    } else if (integrante === "acc_supervisor") {
                        const accountingDept = departments.find(dept => dept.id === Number(approvalFlow.cdepartamento ));
                        if (accountingDept) resolvedUser = accountingDept.manager;
                    }
                }

                if (resolvedUser && resolvedUser !== 'N/A') {
                    if (seen.has(resolvedUser)) {
                        repeatedValues.add(resolvedUser);
                    } else {
                        seen.add(resolvedUser);
                        integrantesResueltos.push({ code: resolvedUser });
                    }
                }
            }

            // Elimina repetidos marcados como 'N/A'
            integrantesResueltos = integrantesResueltos.filter(obj => !repeatedValues.has(obj.code));

            if (integrantesResueltos.length > 0) {
                result.push({
                    [estados[i].estadoKey]: {
                        estado: estadoName,
                        integrantes: integrantesResueltos
                    }
                });
            }
        }

        return result;
    }
    static async getIntegrantUserBank(approvalFlow) {
        const estados = [
            { estadoKey: 'estado1', integrantesKey: 'estado_integrantes1', requiredKey: 'estado_integrantes_required_1', select: 'estado_select_1', estado_accion: 'estado_accion1' },
            { estadoKey: 'estado2', integrantesKey: 'estado_integrantes2', requiredKey: 'estado_integrantes_required_2', select: 'estado_select_2', estado_accion: 'estado_accion2' },
        ];

        let seen = new Set();
        let repeatedValues = new Set();
        let result = [];

        for (let i = 0; i < estados.length; i++) {
            const estadoName = approvalFlow[estados[i].estadoKey];
            const integrantesStr = approvalFlow[estados[i].integrantesKey];
            if (!estadoName || !integrantesStr || !estadoName === '') continue;

            const integrantesArr = integrantesStr.split(';').map(s => s.trim()).filter(Boolean);
            let integrantesResueltos = [];

            for (let integrante of integrantesArr) {
                let resolvedUser = null;
                resolvedUser = integrante; 

                if (resolvedUser && resolvedUser !== 'N/A') {
                    if (seen.has(resolvedUser)) {
                        repeatedValues.add(resolvedUser);
                    } else {
                        seen.add(resolvedUser);
                        integrantesResueltos.push({ code: resolvedUser });
                    }
                }
            }

            // Elimina repetidos marcados como 'N/A'
            integrantesResueltos = integrantesResueltos.filter(obj => !repeatedValues.has(obj.nombre));

            if (integrantesResueltos.length > 0) {
                result.push({
                    [estados[i].estadoKey]: {
                        estado: estadoName,
                        integrantes: integrantesResueltos
                    }
                });
            }
            
        }
        const bankEstados = [
            { estadoKey: 'estado1', integrantesKey: 'estado_integrantes1', requiredKey: 'estado_integrantes_required_1', select: 'estado_select_1', estado_accion: 'estado_accion1' },
            { estadoKey: 'estado2', integrantesKey: 'estado_integrantes2', requiredKey: 'estado_integrantes_required_2', select: 'estado_select_2', estado_accion: 'estado_accion2' }
        ];

        let bankSeen = new Set();
        let bankRepeatedValues = new Set();
        let bankResult = [];

        for (let i = 0; i < bankEstados.length; i++) {
            const estadoName = approvalFlow[bankEstados[i].estadoKey];
            const integrantesStr = approvalFlow[bankEstados[i].integrantesKey];
            const requiredStr = approvalFlow[bankEstados[i].requiredKey];
            const selectValue = approvalFlow[bankEstados[i].select];
            const estado_accion = approvalFlow[bankEstados[i].estado_accion];
            if (!estadoName || !integrantesStr || !estadoName === '') continue;

            const integrantesArr = integrantesStr.split(';').map(s => s.trim()).filter(Boolean);
            const requiredArr = requiredStr ? requiredStr.split(';').map(s => s.trim()).filter(Boolean) : [];
            let integrantesResueltos = [];

            for (let integrante of integrantesArr) {
                let resolvedUser = integrante;
                if (resolvedUser && resolvedUser !== 'N/A') {
                    if (bankSeen.has(resolvedUser)) {
                        bankRepeatedValues.add(resolvedUser);
                    } else {
                        bankSeen.add(resolvedUser);
                        // Marcar como required si resolvedUser está en requiredArr
                        let isRequired = requiredArr.includes(resolvedUser);
                        integrantesResueltos.push({ code: resolvedUser, required: isRequired });
                    }
                }
            }

            // Elimina repetidos marcados como 'N/A'
            integrantesResueltos = integrantesResueltos.filter(obj => !bankRepeatedValues.has(obj.code));

            if (integrantesResueltos.length > 0) {
                bankResult.push({
                    [bankEstados[i].estadoKey]: {
                        estado: estadoName,
                        accion: estado_accion || '',
                        select: selectValue.split(';')[0] || '',
                        integrantes: integrantesResueltos
                    }
                });
            }
        }
        return bankResult;
    }
    static async getDepByApproval(transaction, approval_id) {
    const requestFlows = new sql.Request(transaction);
    let query = `SELECT  mb.xnombre, ab.banco_id
            FROM approval_banco ab
            INNER JOIN mbanco mb ON ab.banco_id = mb.id
            WHERE ab.approval_flow_id = @approval_id`
        requestFlows.input('approval_id', sql.Int, approval_id);
        const { recordset } = await requestFlows.query(query);
        return recordset;
    }
   
     // actualizacion de postGetFlows para nueva version

    static async postGetFlows2( transaction, cdepartamento, compania) {
        const requestFlows = new sql.Request(transaction);
        const query = `SELECT * FROM approvalsFlow 
            WHERE (cdepartamento = @cdepartamento AND ccompania = @ccompania AND origen = 'DASHBOARD' AND estado = 1) 
            ORDER BY nombre;`;

        requestFlows.input('cdepartamento', sql.VarChar, cdepartamento);
        requestFlows.input('ccompania', sql.VarChar, compania);
        const { recordset } = await requestFlows.query(query);
        return recordset;
    }
    static async getIntegrantUser2(approvalFlow, manager, departments) {
        const estados = [
            { estadoKey: 'estado1', integrantesKey: 'estado_integrantes1', requiredKey: 'estado_integrantes_required_1', select: 'estado_select_1', estado_accion: 'estado_accion1' },
            { estadoKey: 'estado2', integrantesKey: 'estado_integrantes2', requiredKey: 'estado_integrantes_required_2', select: 'estado_select_2', estado_accion: 'estado_accion2' },
            { estadoKey: 'estado3', integrantesKey: 'estado_integrantes3', requiredKey: 'estado_integrantes_required_3', select: 'estado_select_3', estado_accion: 'estado_accion3' },
            { estadoKey: 'estado4', integrantesKey: 'estado_integrantes4', requiredKey: 'estado_integrantes_required_4', select: 'estado_select_4', estado_accion: 'estado_accion4' },
            { estadoKey: 'estado5', integrantesKey: 'estado_integrantes5', requiredKey: 'estado_integrantes_required_5', select: 'estado_select_5', estado_accion: 'estado_accion5' }
        ];

        let seen = new Set();
        let repeatedValues = new Set();
        let result = [];

        for (let i = 0; i < estados.length; i++) {
            const estadoName = approvalFlow[estados[i].estadoKey];
            const integrantesStr = approvalFlow[estados[i].integrantesKey];
            const requiredStr = approvalFlow[estados[i].requiredKey];
            const selectValue = approvalFlow[estados[i].select];
            const estado_accion = approvalFlow[estados[i].estado_accion];
            if (!estadoName || !integrantesStr || !estadoName === '') continue;

            const integrantesArr = integrantesStr.split(';').map(s => s.trim()).filter(Boolean);
            // Puede haber varios requeridos separados por ;
            const requiredArr = requiredStr ? requiredStr.split(';').map(s => s.trim()).filter(Boolean) : [];
            let integrantesResueltos = [];

            for (let integrante of integrantesArr) {
                let resolvedUser = null;
                const isARole = await approvalsRule.chekIntegrant(integrante);

                if (!isARole) {
                    resolvedUser = integrante;
                } else {
                    if (integrante === "manager") {
                        resolvedUser = manager;
                    } else if (integrante === "area_supervisor") {
                        const accountingDept = departments.find(dept =>  dept.id === Number(approvalFlow.cdepartamento ));
                        if (accountingDept) resolvedUser = accountingDept.manager;
                    } else if (integrante === "rrhh_supervisor") {
                        const rrhhDept = departments.find(dept => dept.id === Number(approvalFlow.cdepartamento ));
                        if (rrhhDept) resolvedUser = rrhhDept.manager;
                    } else if (integrante === "acc_supervisor") {
                        const accountingDept = departments.find(dept => dept.id === Number(approvalFlow.cdepartamento ));
                        if (accountingDept) resolvedUser = accountingDept.manager;
                    }
                }

                if (resolvedUser && resolvedUser !== 'N/A') {
                    if (seen.has(resolvedUser)) {
                        repeatedValues.add(resolvedUser);
                    } else {
                        seen.add(resolvedUser);
                        // Marcar como required si resolvedUser está en requiredArr (por nombre, código o rol)
                        let isRequired = false;
                        for (let req of requiredArr) {
                            const isReqRole = await approvalsRule.chekIntegrant(req);
                            let reqUser = null;
                            if (!isReqRole) {
                                reqUser = req;
                            } else {
                                if (req === "manager") {
                                    reqUser = manager;
                                } else if (req === "area_supervisor") {
                                    const accountingDept = departments.find(dept =>  dept.id === Number(approvalFlow.cdepartamento ));
                                    if (accountingDept) reqUser = accountingDept.manager;
                                } else if (req === "rrhh_supervisor") {
                                    const rrhhDept = departments.find(dept => dept.id === Number(approvalFlow.cdepartamento ));
                                    if (rrhhDept) reqUser = rrhhDept.manager;
                                } else if (req === "acc_supervisor") {
                                    const accountingDept = departments.find(dept => dept.id === Number(approvalFlow.cdepartamento ));
                                    if (accountingDept) reqUser = accountingDept.manager;
                                }
                            }
                            if (reqUser === resolvedUser) {
                                isRequired = true;
                                break;
                            }
                        }
                        integrantesResueltos.push({ code: resolvedUser, required: isRequired });
                    }
                }
            }

            // Elimina repetidos marcados como 'N/A'
            integrantesResueltos = integrantesResueltos.filter(obj => !repeatedValues.has(obj.code));

            if (integrantesResueltos.length > 0) {
                result.push({
                    [estados[i].estadoKey]: {
                        estado: estadoName,
                        select: selectValue || '',
                        accion: estado_accion || '',
                        integrantes: integrantesResueltos
                    }
                });
            }
        }

        return result;
    }
    static async getIntegrantUserBank2(approvalFlow) {
        const estados = [
            { estadoKey: 'estado1', integrantesKey: 'estado_integrantes1', requiredKey: 'estado_integrantes_required_1', select: 'estado_select_1', estado_accion: 'estado_accion1' },
            { estadoKey: 'estado2', integrantesKey: 'estado_integrantes2', requiredKey: 'estado_integrantes_required_2', select: 'estado_select_2', estado_accion: 'estado_accion2' },
        ];

        let seen = new Set();
        let repeatedValues = new Set();
        let result = [];

        for (let i = 0; i < estados.length; i++) {
            const estadoName = approvalFlow[estados[i].estadoKey];
            const integrantesStr = approvalFlow[estados[i].integrantesKey];
            if (!estadoName || !integrantesStr || !estadoName === '') continue;

            const integrantesArr = integrantesStr.split(';').map(s => s.trim()).filter(Boolean);
            let integrantesResueltos = [];

            for (let integrante of integrantesArr) {
                let resolvedUser = null;
                resolvedUser = integrante; 

                if (resolvedUser && resolvedUser !== 'N/A') {
                    if (seen.has(resolvedUser)) {
                        repeatedValues.add(resolvedUser);
                    } else {
                        seen.add(resolvedUser);
                        integrantesResueltos.push({ code: resolvedUser });
                    }
                }
            }

            // Elimina repetidos marcados como 'N/A'
            integrantesResueltos = integrantesResueltos.filter(obj => !repeatedValues.has(obj.nombre));

            if (integrantesResueltos.length > 0) {
                result.push({
                    [estados[i].estadoKey]: {
                        estado: estadoName,
                        integrantes: integrantesResueltos
                    }
                });
            }
            
        }
        const bankEstados = [
            { estadoKey: 'estado1', integrantesKey: 'estado_integrantes1', requiredKey: 'estado_integrantes_required_1', select: 'estado_select_1', estado_accion: 'estado_accion1' },
            { estadoKey: 'estado2', integrantesKey: 'estado_integrantes2', requiredKey: 'estado_integrantes_required_2', select: 'estado_select_2', estado_accion: 'estado_accion2' }
        ];

        let bankSeen = new Set();
        let bankRepeatedValues = new Set();
        let bankResult = [];

        for (let i = 0; i < bankEstados.length; i++) {
            const estadoName = approvalFlow[bankEstados[i].estadoKey];
            const integrantesStr = approvalFlow[bankEstados[i].integrantesKey];
            const requiredStr = approvalFlow[bankEstados[i].requiredKey];
            const selectValue = approvalFlow[bankEstados[i].select];
            const estado_accion = approvalFlow[bankEstados[i].estado_accion];
            if (!estadoName || !integrantesStr || !estadoName === '') continue;

            const integrantesArr = integrantesStr.split(';').map(s => s.trim()).filter(Boolean);
            const requiredArr = requiredStr ? requiredStr.split(';').map(s => s.trim()).filter(Boolean) : [];
            let integrantesResueltos = [];

            for (let integrante of integrantesArr) {
                let resolvedUser = integrante;
                if (resolvedUser && resolvedUser !== 'N/A') {
                    if (bankSeen.has(resolvedUser)) {
                        bankRepeatedValues.add(resolvedUser);
                    } else {
                        bankSeen.add(resolvedUser);
                        // Marcar como required si resolvedUser está en requiredArr
                        let isRequired = requiredArr.includes(resolvedUser);
                        integrantesResueltos.push({ code: resolvedUser, required: isRequired });
                    }
                }
            }

            // Elimina repetidos marcados como 'N/A'
            integrantesResueltos = integrantesResueltos.filter(obj => !bankRepeatedValues.has(obj.code));

            if (integrantesResueltos.length > 0) {
                bankResult.push({
                    [bankEstados[i].estadoKey]: {
                        estado: estadoName,
                        accion: estado_accion || '',
                        select: selectValue.split(';')[0] || '',
                        integrantes: integrantesResueltos
                    }
                });
            }
        }
        return bankResult;
    }
    
    }
