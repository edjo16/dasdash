import { appendFile, readFile, mkdir, copyFile } from 'fs';
import sql from 'mssql';
import { request as _request } from 'https';
import { get_menu, approval_bitacora } from '../../functions.js';
import { sqlConfig } from "../../dbConfig.js";
import pkg from 'lodash';
import Rules from '../../USERS/rule/DevTeam.js';
const { replace, split, last, result, template, compact, flow, forEach } = pkg;
import USERModel from '../../USERS/model/USER.js';
import { nombres_latinos } from '../../fuctions-approvals.js';
import { generateBeneficiaryPdf } from '../../APPROVALS/generatePdf.js'
import { generateLuxemburgo, montoEnPalabras } from '../../APPROVALS/generateLuxemburgo.js'
import ApprovalModel from '../../APPROVALS/model/approvals.js';
const programa_ruta = "approvals-routes."
import fs from 'fs/promises';
import { getAdjustedDateMultiple } from '../../Middleware/validateUserId.js'
export default class ApprovalFunctionsModel {
    constructor() { }

    static async postApprovalPaid(req, res) {
        var valor = req.body.v
        var date = new Date()
        const offset = date.getTimezoneOffset()
        date = new Date(date.getTime() - (offset * 60 * 1000))
        date = date.toISOString().slice(0, 19).replace('T', ' ')
        var id = req.body.id

        var stmt = "UPDATE log SET pago =" + valor + ", pago_fecha = '" + date + "' WHERE id = " + id + " and (departamento = 'Accounting' or departamento = 'Finance')";
        sql.connect(sqlConfig, err => {
            new sql.Request().query(stmt, (err, result) => {
                if (err) { console.log(err) } else {
                    res.send({
                        result: result
                    })
                }
            })
        })

    }
    static async getArchivosByLogId(transaction, RowID) {
        const request = new sql.Request(transaction);
        const query = "SELECT * from archivos where id_log = @RowID order by tipo desc, proceso desc, archivo_nombre desc";
        request.input('RowID', sql.Int, RowID);
        const result = await request.query(query);
        return result.recordset || [];
    }

    static async getCflowByLogId(transaction, RowID) {
        const request = new sql.Request(transaction);
        const query = "SELECT cflow from log where id = @RowID";
        request.input('RowID', sql.Int, RowID);
        const result = await request.query(query);
        return result.recordset && result.recordset.length > 0 ? result.recordset[0].cflow : null;
    }
    static async postCopyAuditArchives(req, res) {
        var id = req.body.id
        let departamento
        let errores = []
        let ruta_inicial
        let ruta_final
        let proceso
        let carpeta

        new sql.Request().query("SELECT * from archivos where id_log = '" + id + "' order by tipo desc, proceso desc, archivo_nombre desc", (err, result) => {
            departamento = result.recordset[0].departamento
            for (let i = 0; i < result.recordset.length; i++) {
                switch (departamento) {
                    case 'Accounting':
                        ruta_inicial = "//srv-dc-lombard.lombard.local/Contabilidad/Approvals/Aprobado/"
                        ruta_final = ""
                        break
                    case 'Claims':
                        proceso = result.recordset[i].proceso.split(',')[0]
                        carpeta = proceso.split('-')[0]
                        ruta_inicial = "//srv-db-lombard/DB/DOCUMENTOS/SINIESTROS/" + carpeta + "-1/"
                        ruta_final = "//srv-dc-lombard.lombard.local/Claims/Auditoria Compliance/" + id + "/"
                        break
                    case 'Claims-Treaty':
                        proceso = result.recordset[i].proceso.split('-')[1]
                        ruta_inicial = "//srv-db-lombard/DB/DOCUMENTOS/CRSINIESTROS/" + proceso + "/"
                        ruta_final = "//srv-dc-lombard.lombard.local/Claims/Auditoria Compliance/" + id + "/"
                        break
                    case 'Finance':
                        ruta_inicial = "//srv-dc-lombard.lombard.local/Finance/Approvals/Aprobado/" + id
                        ruta_final = ""
                        break
                    case 'Governance':
                        ruta_inicial = "//srv-dc-lombard.lombard.local/Corporate  Governance & Human Resources/Approvals/Aprobado/"
                        ruta_final = ""
                        break
                    case 'RRHH':
                        ruta_inicial = "//srv-dc-lombard.lombard.local/Recursos Humanos/Approvals/Aprobado/"
                        ruta_final = ""
                        break
                    case 'Underwriting':
                        ruta_inicial = "//srv-db-lombard/DB/DOCUMENTOS/"
                        ruta_final = "//srv-dc-lombard.lombard.local/Rea Seguros/Auditoria Firmas/"
                        break
                }
                if (ruta_final != "") {
                    if (result.recordset[i].tipo == 1) {
                        mkdir(ruta_final, { recursive: true }, (err) => {
                            if (err)
                                console.log(err)
                        });
                        copyFile(ruta_inicial + result.recordset[i].archivo_nombre, ruta_final + "/" + result.recordset[i].archivo_nombre, (err) => {
                            if (err)
                                console.log(err)
                        });

                    }
                    try {
                        mkdir(ruta_final + proceso.split(',')[0] + "/", { recursive: true }, (err) => {
                            if (err)
                                console.log(err)
                        });
                    } catch (err) {
                        console.log(err)
                    }
                    try {
                        if (result.recordset[i].archivo_nombre.includes('Detalle_de_Siniestro') || result.recordset[i].archivo_nombre.includes('FORMULARIO_FICOHSA')) { } else {
                            copyFile(ruta_inicial + result.recordset[i].archivo_nombre, ruta_final + proceso + "/" + result.recordset[i].archivo_nombre, (err) => {
                                if (err)
                                    console.log(err)
                            });
                        }
                    } catch (err) {
                        errores.push(err)
                    }
                } else {
                    ruta_final = ruta_inicial
                }
            }
            console.log(errores)
            res.send({
                result: errores,
                ruta_final: ruta_final
            })
        })
    }
    static async postFilesByAvisos(req, res) {
        try {
            const RowID = Number(req.body.id);
            await sql.connect(sqlConfig);

            const queryArchivos = `
                SELECT * FROM archivos WHERE id_log = '${RowID}' ORDER BY tipo DESC, proceso DESC, archivo_nombre DESC`;
            let resultArchivos;
            try {
                resultArchivos = await new sql.Request().query(queryArchivos);
            } catch (error) {
                return res.status(400).send({ error: 'Error al obtener archivos de la base de datos.', detalle: error.message });
            }

            const archivos = resultArchivos.recordsets[0] || [];
            const avisos = [];
            let ultimo = '';

            for (const archivo of archivos) {
                const aviso = archivo.proceso.split(',')[0];
                if (ultimo !== aviso) {
                    avisos.push(aviso);
                }
                ultimo = aviso;
            }

            let queryAvisos = '';
            let tabla = '';

            for (let e = 0; e < avisos.length; e++) {
                if (avisos[e].includes("-")) {
                    const partes = avisos[e].split('-');
                    tabla = partes[1].length > 9 ? 'crarsini_vi' : 'darchivosnt_vi';
                    queryAvisos += `caviso = ${partes[0]}`;
                    if (e < avisos.length - 1) queryAvisos += ' OR ';
                }
            }

            if (!queryAvisos || !tabla) {
                return res.status(400).send({ error: 'No se encontraron avisos válidos para consultar.' });
            }

            const querySIR = `SELECT * FROM ${tabla} WHERE (${queryAvisos}) ORDER BY caviso`;
            let resultSir;
            try {
                resultSir = await new sql.Request().query(querySIR);
            } catch (error) {
                return res.status(400).send({ error: 'Error al obtener archivos desde tabla SIR.', detalle: error.message });
            }

            const darchivosnt_vi = resultSir.recordset || [];
            const pendientes = [];

            for (const sir of darchivosnt_vi) {
                for (const archivo of archivos) {
                    const avisoArchivo = archivo.proceso.split(',')[0];
                    const cavisoSir = sir.caviso.toString();
                    const cavisoArchivo = avisoArchivo.split('-')[0];

                    const esMismoArchivo = cavisoArchivo == cavisoSir && archivo.archivo_nombre == sir.xubicacion;
                    const esIgnorable = sir.xubicacion.includes("Detalle_de") || sir.xubicacion.includes("Formulario_");

                    if (!esMismoArchivo && !esIgnorable) {
                        if (tabla === 'crarsini_vi') {
                            pendientes.push(`${sir.caviso}~${sir.xubicacion}`);
                        } else {
                            pendientes.push(`${sir.caviso}-${sir.cn_stro}~${sir.xubicacion}`);
                        }
                    }
                }
            }
            const unicos = [...new Set(pendientes)];
            res.send({ pendientes: unicos });
        } catch (err) {
            console.error('Error inesperado en postFilesByAvisos:', err);
            res.status(400).send({ error: 'Error inesperado.', detalle: err.message });
        }
    }

    static async postAddFiles(req, res) {
        var id_log = Number(req.body.id_log)
        var departamento = req.body.departamento
        var proceso = req.body.proceso
        var archivo_nombre = req.body.archivo_nombre
        var tipo = Number(req.body.tipo)
        sql.connect(sqlConfig, err => {
            let sql_query = `insert into archivos (id_log, departamento, proceso, archivo_nombre, tipo) VALUES (${id_log}, '${departamento}', '${proceso}', '${archivo_nombre}', ${tipo})`
            new sql.Request().query(sql_query, (err, result) => {
                if (err) {
                    console.log(err)
                    res.send({ result: "error" })
                } else {
                    res.send({ result: "exito" })
                }
            })
        })
    }
    static async postGetFlows(req, res) {
        const rawId = (req.body.id ?? '').toString();
        const compania = Number(req.body.compania);
        const principal_id = (req.body.principal_id ?? '').toString();
        const ids = rawId
            .split(';')
            .map(s => s.trim())
            .filter(Boolean)
            .map(n => Number(n))
            .filter(n => Number.isInteger(n));

        const depClause = ids.length > 0 ? `cdepartamento IN (${ids.join(',')})` : '1 = 0';

        sql.connect(sqlConfig, err => {
            let sql_query = `SELECT 
                                f.*,
                                (SELECT d.nombre FROM mdepartamento d WHERE d.id = f.cdepartamento) AS dep_nombre
                            FROM approvals_flow AS f
                            WHERE f.nombre = 'Performance Review Delivery'
                                OR f.nombre = 'Personnel Requisition Form'
                                OR (${depClause.replaceAll('cdepartamento', 'f.cdepartamento')}
                                AND f.ccompania = ${compania}
                                AND f.estado = 1)
                            ORDER BY f.nombre;`;

            new sql.Request().query(sql_query, (err, result) => {
                if (err) {
                    res.send({ result: 0 })
                    throw err;
                } else {
                    let flow_row = result.recordset
                    const flows = flow_row.filter(flow => !flow.origen.includes("SIR"))
                    res.send({ result: 1, procesos: flows })
                }
            })
        })
    }
    static async postGetProcesos(req, res) {
        var id = req.body.id
        var compania = req.body.compania
        var cflow = req.body.cflow
        var query_where = ''
        sql.connect(sqlConfig, err => {
            let sql_query = `SELECT * FROM approvals_flow 
                WHERE id =${cflow} 
                OR (cdepartamento = ${id}
                AND ccompania = ${compania} 
                AND id = ${cflow} 
                AND estado = 1 AND ruta <> 'SIR')`
            new sql.Request().query(sql_query, (err, result) => {
                if (err) {
                    res.send({ result: 0 })
                } else {
                    let flow_row = result.recordset
                    res.send({ result: 1, procesos: flow_row })
                }
            })
        })
    }
    static async postGetDepartamento(req, res) {
        var departamento = req.body.departamento.split(';')
        var compania = req.body.compania
        let sql_where = ''
        for (let index = 0; index < departamento.length; index++) {
            if (index > 0 && index < departamento.length - 1) {
                sql_where += ' or '
            }
            if (index <= departamento.length - 2) {
                sql_where += ' id = ' + departamento[index]
            }
        }
        // query_where += ` AND ccompania = ${compania}`
        sql.connect(sqlConfig, err => {
            let sql_query = `SELECT * FROM departamentos WHERE ccompania = ${compania} `
            if (sql_where) {
                sql_query += `and (${sql_where})`
            }
            new sql.Request().query(sql_query, (err, result) => {
                if (err) {
                    res.send({ result: 0 })
                    throw err;
                } else {
                    let dep_row = result.recordset[0]
                    res.send({ result: 1, departamento: dep_row })
                }
            })
        })
    }
    static async postGetCompanias(req, res) {
        var id = req.body.ccompania.split(';')
        // var companias = req.body.compania.split(';')
        var query_where = ''
        for (let index = 0; index < id.length; index++) {
            query_where += `ccompania = ${id[index]}`
            if (index < id.length - 1)
                query_where += ` or `
        }
        sql.connect(sqlConfig, err => {
            let sql_query = `SELECT * FROM companias WHERE ${query_where}`
            new sql.Request().query(sql_query, (err, result) => {
                if (err) {
                    res.send({ result: 0 })
                    throw err;
                } else {
                    let companias = result.recordset
                    res.send({ result: 1, companias: companias })
                }
            })
        })
    }
    static async getApprovalFlowById(transaction, id_flow) {
        const query = `SELECT * FROM approvals_flow WHERE id = @id_flow AND estado = 1`;
        const request = new sql.Request(transaction);
        request.input('id_flow', sql.Int, id_flow);
        const result = await request.query(query);
        return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
    }

    static async getAllBancos(transaction, banco, ccompania) {
        let sql_query
        const request = new sql.Request(transaction);
        if (banco == '' && banco !== 'N/A') {
         sql_query = `SELECT * FROM mbanco`;
        } else {
          sql_query = `select * from mbanco where id = @banco and ccompania = @ccompania`
          request.input('banco', sql.NVarChar, banco.toString());
          request.input('ccompania', sql.NVarChar, ccompania);
        }
        const result = await request.query(sql_query);
        return result.recordset;
    }

    static async getAllDepartamentos(transaction) {
        const query = `SELECT * FROM departamentos d 
                       INNER JOIN mcompania c ON c.ccompania = d.ccompania`;
        const request = new sql.Request(transaction);
        const result = await request.query(query);
        return result.recordset;
    }

    static async getUsersByCompany(transaction, ccompania) {
        const query = `SELECT Name, UserID, Estado, Manager, Email, cdepartamento, vacaciones 
                       FROM Users 
                       WHERE Name IS NOT NULL 
                       AND user_type = 1
                       AND Estado = 1 
                       AND compania LIKE '%' + @ccompania + '%' 
                       ORDER BY Name ASC`;
        const request = new sql.Request(transaction);
        request.input('ccompania', sql.NVarChar, ccompania.toString());
        const result = await request.query(query);
        return result.recordset;
    }

    static async getDepartamentoById(transaction, cdepartamento) {
        const query = `SELECT * FROM departamentos d 
                       INNER JOIN mcompania c ON c.ccompania = d.ccompania 
                       WHERE id = @cdepartamento`;
        const request = new sql.Request(transaction);
        request.input('cdepartamento', sql.Int, cdepartamento);
        const result = await request.query(query);
        return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
    }
    static async postGetApprovalAsignado(req, res) {
        var RowID = Number(req.body.RowID)
        sql.connect(sqlConfig, err => {
            new sql.Request().query(`SELECT l.estado AS estado_log,* FROM approval_asignado
            LEFT JOIN (SELECT * FROM log) AS l ON id_nuevo = l.id
            WHERE id_original =  ${RowID}
            ORDER BY id_nuevo DESC`, (err, result) => {
                let flow_row;
                if (err) {
                    res.send({ result: 0 })
                    throw err;
                } else {
                    flow_row = result.recordset
                    res.send({ result: 1, flow_row })
                }
            })
        })
    }
    static async postUpdateApprovalAsignado(req, res) {
        var RowID = Number(req.body.RowID)
        var estado = req.body.estado
        const sql = require('mssql')
        sqlrequest = new sql.Request()
        sqlrequest.input('RowID', sql.Int, RowID);
        sql.connect(sqlConfig, err => {
            sqlrequest.query("select * approval_asignado where id_nuevo = @RowID", (err, result) => {
                if (result != undefined) {
                    if (result.recordset.length > 0) {
                        var date = new Date()
                        const offset = date.getTimezoneOffset()
                        date = new Date(date.getTime() - (offset * 60 * 1000))
                        date = date.toISOString().slice(0, 19).replace('T', ' ')
                        sqlrequest = new sql.Request()
                        sqlrequest.input('RowID', sql.Int, RowID);
                        sqlrequest.input('estado', sql.NVarChar, newlog.estado);
                        sqlrequest.input('fmodificacion', slq.Date, date)
                        sqlrequest.query("update approval_asignado set estado = @estado, fmodificacion = @fmodificacion where id_nuevo = @RowID", (err, result) => {
                            if (err) {
                                res.send({ result: 0 })
                                throw err;
                            } else {
                                res.send({ result: 1 })
                            }
                        })
                    }
                }
            })

        });
    }
    static async getAllFilesFromApproval(transaction, id_log) {
        let query = `SELECT * FROM archivos WHERE id_log = @id_log`
        const request = new sql.Request(transaction);
        request.input('id_log', sql.Int, id_log);
        const { recordset } = await request.query(query);
        return recordset;
    }

    static async getFilesFromApproval(transaction, id_log) {
        let query = `SELECT * FROM archivos WHERE id_log = @id_log and tipo = 1;`
        const request = new sql.Request(transaction);
        request.input('id_log', sql.Int, id_log);
        const { recordset } = await request.query(query);
        return recordset;
    }

    static async getApprovalLog(transaction, id) {
        const query = `SELECT *, FORMAT(solicitante_fecha,'dd/MM/yyyy hh:mm tt') AS s_fecha,FORMAT(cierre_fecha,'dd/MM/yyyy hh:mm tt') AS cierre,FORMAT(verificador_fecha,'dd/MM/yyyy hh:mm tt') AS v_fecha,FORMAT(aprobador_fecha,'dd/MM/yyyy hh:mm tt') AS a_fecha,FORMAT(firmante_fecha,'dd/MM/yyyy hh:mm tt') AS f_fecha,FORMAT(operador_fecha,'dd/MM/yyyy hh:mm tt') AS o_fecha,FORMAT(ejecutor_fecha,'dd/MM/yyyy hh:mm tt') AS e_fecha, FORMAT(asignado_fecha,'dd/MM/yyyy hh:mm tt') AS as_fecha FROM log
        LEFT JOIN (SELECT id AS id_nuevo, max(id_original) AS id_original, estado1 FROM log 
        LEFT JOIN ( SELECT id_original, id_nuevo, estado as estado1 FROM approval_asignado) AS a ON id = id_nuevo
        GROUP BY id, estado1) AS l ON log.id = l.id_nuevo
        WHERE  id = @RowID`;
        const requestLog = new sql.Request(transaction);
        requestLog.input('RowID', sql.Int, id);
        const { recordset } = await requestLog.query(query);
        return recordset[0];
    }


    static async updateApprovalLog(transaction, rowID, comentario, date, sig_estado, actuante, cierre_fecha) {
        const query = `UPDATE log SET ${actuante}_comentarios = @comentario, ${cierre_fecha} ${actuante}_fecha = @date, estado = @sig_estado, ApprovalID = Null WHERE id = @RowID`;
        const request = new sql.Request(transaction);
        request.input('comentario', sql.NVarChar(sql.MAX), comentario);
        request.input('date', sql.NVarChar(50), date);
        request.input('sig_estado', sql.NVarChar(100), sig_estado);
        request.input('RowID', sql.Int, rowID);
        const result = await request.query(query);
        return result;
    }

    static async insertFileRecord(transaction, RowID, departamento, log, filename, proceso = null) {
        let query;
        if (proceso.includes('Posted Remittance')) {
            query = `INSERT INTO archivos (id_log, departamento, proceso, archivo_nombre, tipo) VALUES (@RowID, @departamento, @proceso, @filename, 3)`;
        } else {
            query = `INSERT INTO archivos (id_log, departamento, proceso, archivo_nombre, tipo) VALUES (@RowID, @departamento, @proceso, @filename, 2)`;
        }
        const request = new sql.Request(transaction);
        request.input('RowID', sql.Int, RowID);
        request.input('departamento', sql.NVarChar(100), departamento);
        request.input('proceso', sql.NVarChar(sql.MAX), proceso || log.proceso);
        request.input('filename', sql.NVarChar(500), filename);
        const { recordset } = await request.query(query);
        return recordset;
    }

    static async updateApprovalAsignado(transaction, RowID, sig_estado) {
        const query = `UPDATE approval_asignado SET estado = @sig_estado WHERE id_nuevo = @RowID`;
        const request = new sql.Request(transaction);
        request.input('RowID', sql.Int, RowID)
        request.input('sig_estado', sql.NVarChar, sig_estado);
        const result = await request.query(query);
        return result;
    }

    static async getBancos(req, res) {
        var approval_id = req.body.approval_id
        let bancos;
        sql.connect(sqlConfig, err => {
            let sqlrequest = new sql.Request()
            sqlrequest.input('approval_id', sql.Int, Number(approval_id));
            let sql_query = `SELECT  mb.xnombre, ab.banco_id
            FROM approval_banco ab
            INNER JOIN mbanco mb ON ab.banco_id = mb.id
            WHERE ab.approval_flow_id = @approval_id`
            sqlrequest.query(sql_query, (err, result) => {
                if (err) {
                    console.log(err)
                    res.send({ result: 0 })
                } else {
                    try {
                        bancos = result.recordset
                        res.send({ result: 1, bancos })
                    } catch (error) {
                        res.send({ result: 0 })
                    }
                }
            })
        })
    }
    static async getMonedas(req, res) {
        var banco = req.body.banco
        var ccompania = req.body.ccompania
        sql.connect(sqlConfig, err => {
            let sqlrequest = new sql.Request()
            sqlrequest.input('banco', sql.NVarChar, banco);
            sqlrequest.input('ccompania', sql.NVarChar, ccompania);
            let sql_query = `SELECT DISTINCT(monedas) FROM mbanco 
            where id = @banco AND ccompania = @ccompania`
            sqlrequest.query(sql_query, (err, result) => {
                if (err) {
                    console.log(err)
                    res.send({ result: 0 })
                } else {
                    try {
                        let monedas = []
                        for (let index = 0; index < result.recordset.length; index++) {
                            let temp = result.recordset[index].monedas.split(';')
                            for (let e = 0; e < temp.length; e++) {
                                monedas.push(temp[e])
                            }
                        }
                        monedas.sort()
                        res.send({ result: 1, monedas })
                    } catch (error) {
                        console.log(error)
                        res.send({ result: 0 })
                    }
                }
            })
        })
    }
    static async getLogDetails(transaction, OldRowID, RowID) {
        const query = `SELECT * FROM log WHERE id = @OldRowID or id = @RowID;`;
        const request = new sql.Request(transaction);
        request.input('OldRowID', sql.Int, OldRowID);
        request.input('RowID', sql.Int, RowID);
        const result = await request.query(query);
        return result.recordset;
    }
    static async updateLog(transaction, RowID, uasignar, comentario_asignar, date) {
        const query = `UPDATE log SET asignado = @uasignar, asignado_fecha = @date, operador_comentarios2 = @comentario_asignar WHERE id = @RowID`;
        return new Promise((resolve, reject) => {
            const request = new sql.Request(transaction);
            request.input('RowID', sql.Int, RowID);
            request.input('uasignar', sql.NVarChar(255), uasignar);
            request.input('comentario_asignar', sql.NVarChar(sql.MAX), comentario_asignar);
            request.input('date', sql.NVarChar(50), date);

            request.query(query, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }

    static async getLog(req, res) {
        var id = Number(req.body.id)
        let databaseapproval = req.query.dbdevteam
        let log
        sql.connect(sqlConfig, err => {
            new sql.Request().query(`SELECT * FROM log where id = ${id}`, (err, result) => {
                if (err) {
                    console.log(err)
                    res.send({ result: 0 })
                } else {
                    log = result.recordset[0]
                    res.send({ result: 1, procesos: log })
                }
            })
        })

    }

    static async getApprovals(req, res) {
        try {
            var  UserID = req.session?.userID || null;
            let pool = await sql.connect(sqlConfig)
            // 
            // Obtener prefil de usuario
            // 
            let sql_query = `SELECT * FROM Users where UserID = @UserID`
            let Users = await pool.request()
                .input('UserID', sql.VarChar, UserID)
                .query(sql_query)
            let UserName = Users.recordset[0].Name
            // 
            // Obtener departamentos donde el usuario sea manager
            // 
            sql_query = `SELECT f.id FROM mdepartamento d
                        INNER JOIN approvals_flow f ON f.cdepartamento = d.id
                        WHERE d.manager = @UserID
                        GROUP BY f.id`
            let cflows = await pool.request()
                .input('UserID', sql.VarChar, UserID)
                .query(sql_query)
            var sql_where = ``
            for (let index = 0; index < cflows.recordset.length; index++) {
                if (index == 0 || index < cflows.recordset.length) {
                    sql_where += ` or `
                }
                sql_where += `cflow = ${cflows.recordset[index].id}`
            }

            const userAlias = await USERModel.getUserAlias(pool, UserID) || null;
            const userAliasQuery = userAlias !== null ? `OR solicitante = @userAlias OR verificador = @userAlias OR aprobador = @userAlias OR firmante = @userAlias OR operador = @userAlias OR asignado = @userAlias OR ejecutor = @userAlias ` : ``
            // 
            // Obtener approvals 
            // 
            sql_query = `select *,FORMAT(solicitante_fecha,'dd/MM/yyyy') AS s_fecha FROM log
                        LEFT JOIN (
                        SELECT id AS id_original, max(id_nuevo) AS id_nuevo, estado1 FROM log 
                        LEFT JOIN (
                        SELECT id_original, id_nuevo, estado as estado1 FROM approval_asignado
                        ) AS a ON id = id_original
                        GROUP BY id, estado1
                        ) AS l ON log.id = l.id_original
                        WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName
                        OR firmante = @UserName OR operador = @UserName OR asignado = @UserName OR ejecutor = @UserName
                        ${userAliasQuery}${sql_where}) and (estado != 'Cancelado')
                        ORDER BY log.solicitante_fecha desc, id_original DESC, id_nuevo desc`
            let log = await pool.request()
                .input('UserName', sql.VarChar, UserName)
            if (userAlias !== null) {
                log.input('userAlias', sql.VarChar, userAlias.Name)
            }
            log = await log.query(sql_query)
            let logTotalQuery = log.recordset
            var UserTotalEjecutando = 0
            var UserTotalRechazado = 0
            var UserTotal = 0
            let UserTotalPending = 0
            var TotalCancelados = 0
            var id_asignados = []
            var id_asignados_ejecutando = []
            var log_pendiente = []
            var log_ejecutando = []
            var log_ejecutados = []
            var log_rechazados = []
            for (let i = 0; i < logTotalQuery.length; i++) {
                // Estado en progreso
                if (logTotalQuery[i].verificador == UserName && logTotalQuery[i].estado == "Verify") {
                    UserTotalPending++;
                    log_pendiente.push(logTotalQuery[i])
                } else if (logTotalQuery[i].aprobador == UserName && logTotalQuery[i].estado == "Approve") {
                    UserTotalPending++;
                    log_pendiente.push(logTotalQuery[i])
                } else if (logTotalQuery[i].firmante == UserName && logTotalQuery[i].estado == "Signature") {
                    UserTotalPending++;
                    log_pendiente.push(logTotalQuery[i])
                } else if (logTotalQuery[i].operador == UserName && logTotalQuery[i].estado == "Apply") {
                    UserTotalPending++;
                    log_pendiente.push(logTotalQuery[i])
                } else if (logTotalQuery[i].asignado == UserName && logTotalQuery[i].estado == "Execute") {
                    //Si el pedido de pago ya lo iniciaron no se debe mostrar como pendiente
                    if (logTotalQuery[i].estado1 != "Rejected" && logTotalQuery[i].estado1 != "Cancelled") {
                    id_asignados_ejecutando.push(logTotalQuery[i].id)
                    }
                    // Si el pago no lo han iniciado mostrar en pendiente
                    if ((logTotalQuery[i].estado1 == "Rejected" || logTotalQuery[i].estado1 == "Cancelled") && !(id_asignados_ejecutando.includes(logTotalQuery[i].id)) || logTotalQuery[i].estado1 == null) {
                    id_asignados.push(logTotalQuery[i].id)
                    UserTotalPending++;
                    log_pendiente.push(logTotalQuery[i])
                    }
                } else if (logTotalQuery[i].ejecutor == UserName && logTotalQuery[i].estado == "Execute") {
                    if (logTotalQuery[i].estado1 != 'Executed' && logTotalQuery[i].asignado != null && logTotalQuery[i].asignado != 'N/A') {
                        //Si el pedido de pago ya lo iniciaron no se debe mostrar como pendiente
                        if (logTotalQuery[i].estado1 != "Rejected") {
                            id_asignados_ejecutando.push(logTotalQuery[i].id)
                            UserTotalEjecutando++;
                            log_ejecutando.push(logTotalQuery[i])
                        }
                        // Si el pago no lo han iniciado mostrar en pendiente
                        if (logTotalQuery[i].estado1 == "Rejected" && !(id_asignados_ejecutando.includes(logTotalQuery[i].id))) {
                            UserTotalEjecutando++;
                            log_ejecutando.push(logTotalQuery[i])
                        }
                        // 
                    } else if (logTotalQuery[i].estado1 == 'Executed' && logTotalQuery[i].estado == 'Execute' || logTotalQuery[i].estado1 == 'Approved' && logTotalQuery[i].estado == 'Execute') {
                        UserTotalPending++;
                        log_pendiente.push(logTotalQuery[i])
                    } else {
                        UserTotalPending++;
                        log_pendiente.push(logTotalQuery[i])
                    }
                }
                // Estado rechazado
                else if (logTotalQuery[i].estado == "Rejected" || logTotalQuery[i].estado == "Expired") {
                    log_rechazados.push(logTotalQuery[i])
                    UserTotalRechazado++
                }
                //Proceso finalizado
                else if (logTotalQuery[i].estado == "Verified" || logTotalQuery[i].estado == "Approved" || logTotalQuery[i].estado == "Signed" || logTotalQuery[i].estado == "Applied" || logTotalQuery[i].estado == "Executed") {
                    UserTotal++
                    log_ejecutados.push(logTotalQuery[i])
                } else if (logTotalQuery[i].estado == "Cancelled") {
                    TotalCancelados++
                } else {
                    //Si el flujo esta abierto
                    UserTotalEjecutando++
                    log_ejecutando.push(logTotalQuery[i])
                }
            }
            res.send({
                result: 1,
                log_pendiente,
                UserTotalPending,
                UserTotalEjecutando,
                UserTotalRechazado,
                UserTotal,
                id_asignados,
                log_ejecutando,
                log_ejecutados,
                log_rechazados
            })
        } catch (error) {
            console.log(error)
        }
    }

    static async agregarApprovalAsignado(req, res) {
        var RowID = Number(req.body.RowID)
        var OldRowID = Number(req.body.OldRowID)
        var estado = req.body.estado
        sql.connect(sqlConfig, err => {
            let sqlrequest = new sql.Request()
            sqlrequest.input('RowID', sql.Int, RowID);
            sqlrequest.input('OldRowID', sql.Int, OldRowID);
            sqlrequest.input('estado', sql.VarChar, estado);
            sqlrequest.query(`insert into approval_asignado (id_original, id_nuevo, estado) values (@OldRowID, @RowID, @estado)`, (err, result) => {
                if (err) {
                    console.log(err)
                    res.send({ result: 0 })
                } else {
                    res.send({ result: 1 })
                }
            })
        })
    }
    static async approvalsManagementResume(req, res) {
        try {
            let pool = await sql.connect(sqlConfig);
            let sql_query = `SELECT departamento, COUNT(*) as num FROM log WHERE (ccompania IS NULL OR ccompania = 1) GROUP BY departamento ORDER BY departamento`;
            let select = await pool.request().query(sql_query);
            let resume = select.recordset;

            // Calculate the total count
            let total = resume.reduce((sum, item) => sum + item.num, 0);

            // Add the total to the response
            resume.push({ departamento: 'Total', num: total });

            res.send({ result: 1, resume });
        } catch (error) {
            console.log(error);
            res.send({ result: 0 });
        }
    }
    static async globalSearchApprovals(req, res) {
        var busqueda = req.body.busqueda
        var UserName = req.body.user
        var UserID = req.body.UserID
        try {
            let pool = await sql.connect(sqlConfig)

            let userInfo = await pool.request()
                .input('UserID', sql.VarChar, UserID)
                .query(`SELECT Email, cdepartamento, departamento FROM Users WHERE UserID = @UserID`)

            let result = await pool.request()
                .input('UserID', sql.VarChar, UserID)
                .query(`SELECT f.id FROM mdepartamento d
                    INNER JOIN approvals_flow f ON f.cdepartamento = d.id
                    WHERE d.manager = @UserID
                    GROUP BY f.id`)
            let cflows = result.recordset || []
            var sql_where = cflows.length > 0
                ? ' AND (' + cflows.map(f => 'cflow = ' + f.id).join(' OR ') + ')'
                : ' AND 1=0'

            let approvalsResult = await pool.request()
                .input('UserName', sql.VarChar, UserName)
                .input('busqueda', sql.VarChar, busqueda)
                .query(`SELECT TOP 50
                    la.id, la.estado, la.banco, la.sir_reference, la.proceso,
                    la.detalle_proceso, la.beneficiario, la.solicitante,
                    la.moneda, la.mmonto, la.departamento, la.ccompania,
                    la.solicitante_fecha,
                    be.cuenta_banco_beneficiario,
                    be.display_name AS nombre_beneficiario,
                    mb.xnombre AS banco_nombre
                    FROM LOG la
                    LEFT JOIN approval_mbeneficiary be ON be.beneficiario_id = la.beneficiario
                    LEFT JOIN mbanco mb ON mb.id = TRY_CAST(la.banco AS INT)
                    WHERE (CAST(la.id AS VARCHAR) LIKE '%' + @busqueda + '%'
                        OR la.sir_reference LIKE '%' + @busqueda + '%'
                        OR CAST(la.banco AS VARCHAR) LIKE '%' + @busqueda + '%'
                        OR la.proceso LIKE '%' + @busqueda + '%'
                        OR be.cuenta_banco_beneficiario LIKE '%' + @busqueda + '%'
                        OR be.display_name LIKE '%' + @busqueda + '%'
                        OR la.detalle_proceso LIKE '%' + @busqueda + '%'
                        OR la.verificador_comentarios LIKE '%' + @busqueda + '%'
                        OR la.aprobador_comentarios LIKE '%' + @busqueda + '%'
                        OR la.firmante_comentarios LIKE '%' + @busqueda + '%'
                        OR la.ejecutor_comentarios LIKE '%' + @busqueda + '%'
                        OR la.solicitante LIKE '%' + @busqueda + '%'
                        OR la.verificador LIKE '%' + @busqueda + '%'
                        OR la.aprobador LIKE '%' + @busqueda + '%'
                        OR la.firmante LIKE '%' + @busqueda + '%'
                        OR la.ejecutor LIKE '%' + @busqueda + '%')
                    AND (la.solicitante = @UserName OR la.verificador = @UserName
                        OR la.aprobador = @UserName OR la.firmante = @UserName
                        OR la.operador = @UserName OR la.ejecutor = @UserName ${sql_where})
                    ORDER BY la.solicitante_fecha DESC`)

            res.send({ search: approvalsResult.recordset || [] })
        } catch (error) {
            console.log(error)
            res.status(500).send({ search: [] })
        }
    }

    static async globalSearchCRM(req, res) {
        var busqueda = req.body.busqueda
        var UserID = req.body.UserID
        try {
            let pool = await sql.connect(sqlConfig)

            let userInfo = await pool.request()
                .input('UserID', sql.VarChar, UserID)
                .query(`SELECT Email, cdepartamento, departamento FROM Users WHERE UserID = @UserID`)
            let userEmail = userInfo.recordset[0]?.Email || ''
            let cdepartamento = userInfo.recordset[0]?.cdepartamento || ''

            let crmAccessWhere = ` AND (m.departamento_id LIKE '%' + @cdepartamento + ';%'
                OR m.de_nombre = @UserEmail OR m.de_correo = @UserEmail
                OR EXISTS (SELECT 1 FROM crm_asignado ca WHERE ca.id_main = m.id AND ca.uasignado = @UserID2))`

            let crmResult = await pool.request()
                .input('busqueda', sql.VarChar, busqueda)
                .input('UserEmail', sql.VarChar, userEmail)
                .input('cdepartamento', sql.VarChar, cdepartamento)
                .input('UserID2', sql.VarChar, UserID)
                .query(`SELECT TOP 20
                    m.id, m.conversacion_titulo, m.de_nombre, m.de_correo,
                    m.asunto_interno, m.cprioridad, m.departamento_id,
                    FORMAT(m.fingreso, 'yyyy-MM-dd') AS fecha_ingreso,
                    FORMAT(m.fmodificado, 'yyyy-MM-dd') AS fecha_modificado,
                    mp.xprioridad
                    FROM crm_main m
                    LEFT JOIN crm_mprioridad mp ON mp.cprioridad = m.cprioridad
                    WHERE (CAST(m.id AS VARCHAR) LIKE '%' + @busqueda + '%'
                        OR m.conversacion_titulo LIKE '%' + @busqueda + '%'
                        OR m.de_nombre LIKE '%' + @busqueda + '%'
                        OR m.de_correo LIKE '%' + @busqueda + '%'
                        OR m.asunto_interno LIKE '%' + @busqueda + '%')
                    ${crmAccessWhere}
                    ORDER BY m.id DESC`)

            res.send({ crm: crmResult.recordset || [] })
        } catch (error) {
            console.log(error)
            res.status(500).send({ crm: [] })
        }
    }

    static async globalSearchCRMMsg(req, res) {
        var busqueda = req.body.busqueda
        var UserID = req.body.UserID
        try {
            let pool = await sql.connect(sqlConfig)

            let userInfo = await pool.request()
                .input('UserID', sql.VarChar, UserID)
                .query(`SELECT Email, cdepartamento, departamento FROM Users WHERE UserID = @UserID`)
            let userEmail = userInfo.recordset[0]?.Email || ''
            let cdepartamento = userInfo.recordset[0]?.cdepartamento || ''

            let crmAccessWhere = ` AND (m.departamento_id LIKE '%' + @cdepartamento + ';%'
                OR m.de_nombre = @UserEmail OR m.de_correo = @UserEmail
                OR EXISTS (SELECT 1 FROM crm_asignado ca WHERE ca.id_main = m.id AND ca.uasignado = @UserID2))`

            let crmMsgResult = await pool.request()
                .input('busqueda', sql.VarChar, busqueda)
                .input('UserEmail', sql.VarChar, userEmail)
                .input('cdepartamento', sql.VarChar, cdepartamento)
                .input('UserID2', sql.VarChar, UserID)
                .query(`SELECT TOP 50
                    msg.id_mensaje, msg.id_main, msg.nombre_mensaje,
                    LEFT(CAST(msg.body_mensaje AS NVARCHAR(MAX)), 200) AS body_mensaje_resumen,
                    msg.id_msg, msg.de_nombre, msg.de_correo,
                    msg.ctipo, FORMAT(msg.fingreso, 'yyyy-MM-dd HH:mm') AS fecha_mensaje,
                    m.conversacion_titulo, m.asunto_interno, m.cprioridad
                    FROM crm_msg msg
                    INNER JOIN crm_main m ON m.id = msg.id_main
                    WHERE (msg.nombre_mensaje LIKE '%' + @busqueda + '%'
                        OR CAST(msg.body_mensaje AS NVARCHAR(MAX)) LIKE '%' + @busqueda + '%')
                    ${crmAccessWhere}
                    ORDER BY msg.id_mensaje DESC`)

            res.send({ crm_msg: crmMsgResult.recordset || [] })
        } catch (error) {
            console.log(error)
            res.status(500).send({ crm_msg: [] })
        }
    }
    static async getApprovalAverague(req, res) {
        sql.connect(sqlConfig, err => {
            new sql.Request().query(`SELECT log.departamento,
            COUNT(id) AS id,
            sum(DATEDIFF(n, log.solicitante_fecha, log.verificador_fecha)) AS prom_verificador, 
            sum(DATEDIFF(n, log.verificador_fecha, log.aprobador_fecha)) AS prom_aprobador, 
            sum(DATEDIFF(n, log.aprobador_fecha, log.firmante_fecha)) AS prom_firmante, 
            sum(DATEDIFF(n, log.firmante_fecha, log.ejecutor_fecha)) AS prom_ejecutor
            FROM log 
            WHERE (estado = 'executed' or estado = 'signed') AND (departamento = 'Claims' OR departamento = 'Accounting')
            GROUP BY departamento`, (err, result) => {
                var TotalAccounting = result.recordset[0].prom_verificador + result.recordset[0].prom_aprobador + result.recordset[0].prom_firmante + result.recordset[0].prom_ejecutor
                var TotalClaims = +result.recordset[1].prom_verificador + result.recordset[1].prom_aprobador + result.recordset[1].prom_firmante + result.recordset[1].prom_ejecutor
                var grupo = '{ "Accounting": { "Verifier": ' + result.recordset[0].prom_verificador + ', "Approver": ' + result.recordset[0].prom_aprobador + ', "Signatory": ' + result.recordset[0].prom_firmante + ', "Executor": ' + result.recordset[0].prom_ejecutor + ', "Total":' + result.recordset[0].id + ' },  "Claims": { "Verifier": ' + result.recordset[1].prom_verificador + ', "Approver": ' + result.recordset[1].prom_aprobador + ', "Signatory": ' + result.recordset[1].prom_firmante + ', "Executor": ' + result.recordset[1].prom_ejecutor + ', "Total": ' + result.recordset[1].id + ' },  "Finance": { "Verifier": 0, "Approver": 0, "Signatory": 0, "Executor": 0, "Total": 0 },  "Governance": { "Verifier": 0, "Approver": 0, "Signatory": 0, "Executor": 0, "Total": 0 } ,  "Underwriting": { "Verifier": 0, "Approver": 0, "Signatory": 0, "Executor": 0, "Total": 0 }}'
                var obj = JSON.parse(grupo)
                new sql.Request().query(`SELECT log.departamento,
                COUNT(id) AS id,
                sum(DATEDIFF(n, log.solicitante_fecha, log.verificador_fecha)) AS prom_verificador, 
                sum(DATEDIFF(n, log.verificador_fecha, log.firmante_fecha)) AS prom_firmante
                FROM log 
                WHERE (estado = 'executed' or estado = 'signed') AND (departamento = 'Underwriting')
                GROUP BY departamento`, (err, result) => {
                    var TotalUnderwriting = result.recordset[0].prom_verificador + result.recordset[0].prom_firmante
                    obj["Underwriting"]["Verifier"] = result.recordset[0].prom_verificador
                    obj["Underwriting"]["Signatory"] = result.recordset[0].prom_firmante
                    obj["Underwriting"]["Total"] = result.recordset[0].id
                    // console.log(obj)
                    new sql.Request().query(`SELECT log.departamento,
                    COUNT(id) AS id,
                    sum(DATEDIFF(n, log.solicitante_fecha, log.aprobador_fecha)) AS prom_aprobador, 
                    sum(DATEDIFF(n, log.aprobador_fecha, log.firmante_fecha)) AS prom_firmante,
                    sum(DATEDIFF(n, log.firmante_fecha, log.ejecutor_fecha)) AS prom_ejecutor
                    FROM log 
                    WHERE (estado = 'executed' or estado = 'signed') AND (departamento = 'Finance')
                    GROUP BY departamento`, (err, result) => {
                        var TotalFinance = result.recordset[0].prom_verificador + result.recordset[0].prom_firmante + result.recordset[0].prom_ejecutor
                        obj["Finance"]["Approver"] = result.recordset[0].prom_aprobador
                        obj["Finance"]["Signatory"] = result.recordset[0].prom_firmante
                        obj["Finance"]["Executor"] = result.recordset[0].prom_ejecutor
                        obj["Finance"]["Total"] = result.recordset[0].id
                        new sql.Request().query(`SELECT log.departamento,
                        COUNT(id) AS id,
                        sum(DATEDIFF(n, log.solicitante_fecha, log.firmante_fecha)) AS prom_firmante
                        FROM log 
                        WHERE (estado = 'executed' or estado = 'signed') AND (departamento = 'Governance')
                        GROUP BY departamento`, (err, result) => {
                            var TotalGovernance = result.recordset[0].prom_firmante
                            obj["Governance"]["Signatory"] = result.recordset[0].prom_firmante
                            obj["Governance"]["Total"] = result.recordset[0].id
                            res.send({
                                result: obj
                            })
                        })
                    })
                })
            })
        })
    }
    static async getSummary(req, res) {
        //Usuario
        sql.connect(sqlConfig, err => {
            new sql.Request().query(`SELECT id, log.departamento,
            solicitante, log.solicitante_fecha, 
            verificador, log.verificador_fecha,
            aprobador, log.aprobador_fecha, 
            firmante, log.firmante_fecha,
            ejecutor, ejecutor_fecha,
            estado
            FROM log
            WHERE estado <> 'Cancelado'
            AND (estado = 'executed' or estado = 'Applied' or estado = 'Signed' or estado = 'Approved' or estado = 'Verified')`, (err, result) => {
                res.send({
                    result: result
                })
            })
        })
    }

    //Models of controller copyFilesApprovals
    static async getLogDetails(transaction, OldRowID, RowID) {
        const query = `SELECT * FROM log WHERE id = @OldRowID or id = @RowID;`;
        const request = new sql.Request(transaction);
        request.input('OldRowID', sql.Int, OldRowID);
        request.input('RowID', sql.Int, RowID);
        const result = await request.query(query);
        return result.recordset;
    }
    static async getApprovalFlowDetails(transaction, Oldcflow, cflow) {
        const query = `SELECT id, server, location, ruta FROM approvals_flow WHERE id = @Oldcflow or id = @cflow;`;
        const request = new sql.Request(transaction);
        request.input('Oldcflow', sql.VarChar, Oldcflow);
        request.input('cflow', sql.Int, cflow);
        const result = await request.query(query);
        return result.recordset;
    }
    static async getFilesForLog(transaction, OldRowID) {
        const query = `SELECT * FROM archivos WHERE id_log = @OldRowID AND tipo <> 3;`;
        const request = new sql.Request(transaction);
        request.input('OldRowID', sql.VarChar, OldRowID);
        const result = await request.query(query);
        return result.recordset;
    }
    static async getFilesForNewLog(transaction, OldRowID) {
        const query = `SELECT * FROM archivos WHERE id_log = @OldRowID AND tipo = 1;`;
        const request = new sql.Request(transaction);
        request.input('OldRowID', sql.VarChar, OldRowID);
        const result = await request.query(query);
        return result.recordset[0];
    }
    static async getMultipleFilesForNewLog(transaction, OldRowID) {
        const query = `SELECT * FROM archivos WHERE id_log = @OldRowID AND tipo = 1;`;
        const request = new sql.Request(transaction);
        request.input('OldRowID', sql.VarChar, OldRowID);
        const result = await request.query(query);
        return result.recordset;
    }
    static async updateFileNamePersonnelRequisition(transaction, id, filename) {
        const query = `UPDATE archivos SET archivo_nombre = @filename WHERE id_log = @id AND tipo = 1;`;
        const request = new sql.Request(transaction);
        request.input('id', sql.VarChar, id);
        request.input('filename', sql.VarChar, filename);
        const result = await request.query(query);
        return result.recordset;
    }

    static async replaceArchivoNombreForSignedVersion(transaction, RowID, currentFilename, originalFilename, newFilename) {
        const query = `
            UPDATE archivos
            SET archivo_nombre = @newFilename
            WHERE id_log = @RowID
              AND (
                archivo_nombre = @currentFilename
                OR archivo_nombre = @originalFilename
              );`;
        const request = new sql.Request(transaction);
        request.input('RowID', sql.Int, RowID);
        request.input('currentFilename', sql.NVarChar(500), currentFilename || '');
        request.input('originalFilename', sql.NVarChar(500), originalFilename || '');
        request.input('newFilename', sql.NVarChar(500), newFilename);
        const result = await request.query(query);
        return result.rowsAffected?.[0] || 0;
    }

    static async insertFile(transaction, RowID, departamento, proceso, archivo_nombre, tipo) {
        const query = `INSERT INTO archivos (id_log, departamento, proceso, archivo_nombre, tipo)
                   VALUES (@id_log, @departamento, @proceso, @archivo_nombre, @tipo);`;
        const request = new sql.Request(transaction);
        request.input('id_log', sql.Int, RowID);
        request.input('departamento', sql.NVarChar(100), departamento);
        request.input('proceso', sql.NVarChar(sql.MAX), proceso);
        request.input('archivo_nombre', sql.NVarChar(500), archivo_nombre);
        request.input('tipo', sql.Int, tipo);
        const result = await request.query(query);
        return result.recordset;

    }
    /**
     * Returns all active routing rules from approval_file_routing,
     * ordered by priority DESC. Used by postApprovalArchiveslIST to
     */
    static async getFileRoutingConfig(transaction) {
        const request = new sql.Request(transaction);
        const query = `
            SELECT id, cflow, file_departamento, required_origen,
                   proceso_min_length, proceso_max_length,
                   departamento_out, proceso_strategy,
                   is_payment_flow, subtitulo_group, priority
            FROM   approval_file_routing
            WHERE  active = 1
            ORDER BY priority DESC`;
        const result = await request.query(query);
        return result.recordset || [];
    }

    static async updateLogJournalEntry(transaction, id, comentario) {
        const query = `UPDATE log SET estado = 'Executed', ejecutor_comentarios = @comentario, ejecutor_fecha = GETDATE(), cierre_fecha = GETDATE() WHERE id = @id`;
        const request = new sql.Request(transaction);
        request.input('id', sql.Int, id);
        request.input('comentario', sql.NVarChar(sql.MAX), comentario);
        await request.query(query);
    }

    static async InsertFileApproval(sqlConfig, RowID, departamento, proceso, filename, tipo, cflow, sir_reference = null) {
        try {
            const pool = await connect(sqlConfig);
            let sql_query = `INSERT INTO archivos (id_log, departamento, proceso, archivo_nombre, tipo, cflow`;
            if (sir_reference) {
                sql_query += `, sir_reference`;
            }
            sql_query += `) VALUES (@RowID, @departamento, @proceso, @filename, @tipo, @cflow`;
            if (sir_reference) {
                sql_query += `, @sir_reference`;
            }
            sql_query += `)`;

            const request = pool.request()
                .input('RowID', Int, RowID)
                .input('departamento', NVarChar, departamento)
                .input('proceso', NVarChar, proceso)
                .input('filename', NVarChar, filename)
                .input('tipo', Int, tipo)
                .input('cflow', Int, cflow);

            if (sir_reference) {
                request.input('sir_reference', NVarChar, sir_reference);
            }

            await request.query(sql_query);

            return 1;  // Indicate success
        } catch (error) {
            console.error("Error inserting file approval:", error);
            return { success: false, message: "Failed to insert file approval", error };  // Return detailed error information
        }
    }

    static async insertFileApproval(transaction, RowID, departamento, proceso, filename, tipo, cflow, sir_reference = null) {
        let query = `INSERT INTO archivos (id_log, departamento, proceso, archivo_nombre, tipo, cflow`;
        if (sir_reference) {
            query += `, sir_reference`;
        }
        query += `) VALUES (@RowID, @departamento, @proceso, @filename, @tipo, @cflow`;
        if (sir_reference) {
            query += `, @sir_reference`;
        }
        query += `)`;
        const requestApprovalFlow = new sql.Request(transaction);
        requestApprovalFlow.input('RowID', sql.Int, RowID)
            .input('departamento', sql.NVarChar, departamento)
            .input('proceso', sql.NVarChar, proceso)
            .input('filename', sql.NVarChar, filename)
            .input('tipo', sql.Int, tipo)
            .input('cflow', sql.Int, cflow);
        if (sir_reference) {
            requestApprovalFlow.input('sir_reference', sql.NVarChar, sir_reference);
        }
        await requestApprovalFlow.query(query);
        return 1;
    }

    static _getServerPath(server, location) {
        const serverMap = {
            1: process.env.server_1,
            2: process.env.server_2,
            3: process.env.server_3,
            4: process.env.server_4,
            5: process.env.server_5,
        };
        const basePath = serverMap[server];
        if (!basePath) {
            throw new Error(`Servidor no válido: ${server}. Debe ser un número del 1 al 5.`);
        }
        return  `\\\\${basePath}\\${location || ''}`;
    }

    static async FileApprovalCreation(transaction, RowID, proceso, departamento, approvals_select, req, ruta, mform, form_id, beneficiarioInfo, banco) {
        if (req.files) {
            if (req.files.Signingfiles) {
                let files = Array.isArray(req.files.Signingfiles) ? req.files.Signingfiles : [req.files.Signingfiles];
                for (let file of files) {
                    if (file.name) {
                        let filename = nombres_latinos(file.name);
                        try {

                            await file.mv(`${ruta}${RowID}/${filename}`);
                            let InsertFileApprovalresult = await ApprovalFunctionsModel.insertFileApproval(transaction, RowID, departamento, proceso, filename, 1, approvals_select);
                            if (!InsertFileApprovalresult) {
                                console.error("Failed to insert file approval for signing file.");
                            }
                        } catch (error) {
                            console.error(`Failed to move signing file ${filename}:`, error);
                            throw error;
                        }
                    }
                }
            }

            if (req.files.Supportfiles) {
                let files = Array.isArray(req.files.Supportfiles) ? req.files.Supportfiles : [req.files.Supportfiles];
                for (let file of files) {
                    if (file.name) {
                        let filename = nombres_latinos(file.name);
                        try {
                            await file.mv(`${ruta}${RowID}/${filename}`);
                            let InsertFileApprovalresult = await ApprovalFunctionsModel.insertFileApproval(transaction, RowID, departamento, proceso, filename, 0, approvals_select);
                            if (!InsertFileApprovalresult) {
                                console.error("Failed to insert file approval for support file.");
                            }
                        } catch (error) {
                            console.error(`Failed to move support file ${filename}:`, error);
                            throw error;
                        }
                    }
                }
            }
        }
        if (beneficiarioInfo && req.body.banco !== 'N/A') {
            const { language, xnombre, xheader } = await ApprovalModel.ReadCompanyLanguage(transaction, beneficiarioInfo.compania)
            const date = getAdjustedDateMultiple(language)
            const countries = await USERModel.getCountries(transaction);
            const tipoCuentaList = await ApprovalModel.GetTipoCuenta(transaction);
            const paisBenNombre = countries.find(c => String(c.cpais) === String(beneficiarioInfo.pais_beneficiario))?.xnombre_pais_ingles || beneficiarioInfo.pais_beneficiario || '';
            const paisIntNombre = countries.find(c => String(c.cpais) === String(beneficiarioInfo.pais_intermediario))?.xnombre_pais_ingles || beneficiarioInfo.pais_intermediario || '';
            const tipoCuentaNombre = tipoCuentaList.find(t => String(t.tipo_cuenta_id) === String(beneficiarioInfo.tipo_cuenta))?.tipo_cuenta || '';
            const tipoCuentaIntNombre = tipoCuentaList.find(t => String(t.tipo_cuenta_id) === String(beneficiarioInfo.tipo_cuenta_intermediario))?.tipo_cuenta || '';
            let beneficiaryFileName = language == 'ENG' ? `Beneficiary - ${beneficiarioInfo.cuenta_banco_beneficiario} - ${proceso}.pdf` : `Beneficiario - ${beneficiarioInfo.cuenta_banco_beneficiario} - ${proceso}.pdf`
            const pdfData = {
                ...beneficiarioInfo,
                pais_beneficiario: paisBenNombre,
                pais_intermediario: paisIntNombre,
                tipo_cuenta: tipoCuentaNombre,
                tipo_cuenta_intermediario: tipoCuentaIntNombre,
                company_name: xnombre,
                fecha_solicitud: date,
                banco: banco,
                monto: `${req.body.moneda} ${req.body.monto}`,
                concepto: req.body.description,
                solicitante: req.body.xnombre !== 'N/A',
                verificador: req.body.verificador !== 'N/A',
                aprobador: req.body.aprobador !== 'N/A',
                operador: req.body.operador !== 'N/A',
                firmante: req.body.firmante !== 'N/A',
                ejecutor: req.body.ejecutor !== 'N/A'
            };
            const pdfBuffer = await generateBeneficiaryPdf(pdfData, language, RowID, xheader);
            try {
                await fs.mkdir(`${ruta}${RowID}`, { recursive: true });
                await fs.writeFile(`${ruta}${RowID}/${beneficiaryFileName}`, pdfBuffer);
                let InsertFileApprovalresult = await ApprovalFunctionsModel.insertFileApproval(transaction, RowID, departamento, proceso, beneficiaryFileName, 1, approvals_select);
                if (!InsertFileApprovalresult) {
                    console.error("Failed to insert file approval for support file.");
                }
            } catch (error) {
                console.error(`Failed to save PDF file ${beneficiaryFileName}:`, error);
                throw error;
            }
        }
        // Generate Luxemburgo transfer PDF when bank is "Banco de Luxemburgo"
        if (beneficiarioInfo && banco === 'Banco de Luxemburgo' && req.body.moneda) {
            try {
                const luxData = {
                    moneda: req.body.moneda,
                    cuenta_bancaria: beneficiarioInfo.cuenta_banco || '',
                    monto: req.body.monto ? `${req.body.moneda} ${new Intl.NumberFormat('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }).format(Number(req.body.monto))}` : '',
                    monto_texto: montoEnPalabras(req.body.monto, req.body.moneda),
                    a_favor_de: beneficiarioInfo.cuenta_banco_beneficiario || '',
                    correspondiente: req.body.description || '',
                    banco_beneficiario: beneficiarioInfo.banco_beneficiario || '',
                    direcion_beneficiario: beneficiarioInfo.direcion_beneficiario || '',
                    SWIFT: beneficiarioInfo.SWIFT || '',
                    SORT: beneficiarioInfo.SORT || '',
                    IBAN: beneficiarioInfo.IBAN || '',
                    cuenta_banco_beneficiario: beneficiarioInfo.cuenta_banco_beneficiario || '',
                    direccion: beneficiarioInfo.direccion || '',
                    cuenta_banco: beneficiarioInfo.cuenta_banco || ''
                };
                const transactionDetail = await ApprovalModel.getTransactionBank(transaction, beneficiarioInfo.compania, req.body.moneda)
                const luxPdfBuffer = await generateLuxemburgo(luxData, transactionDetail);
                const luxFileName = `Transferencia_Luxemburgo_${req.body.moneda}.pdf`;
                await fs.mkdir(`${ruta}${RowID}`, { recursive: true });
                await fs.writeFile(`${ruta}${RowID}/${luxFileName}`, Buffer.from(luxPdfBuffer));
                let InsertLuxResult = await ApprovalFunctionsModel.insertFileApproval(transaction, RowID, departamento, proceso, luxFileName, 1, approvals_select);
                if (!InsertLuxResult) {
                    console.error("Failed to insert file approval for Luxemburgo PDF.");
                }
            } catch (error) {
                console.error(`Failed to generate Luxemburgo PDF:`, error);
                throw error;
            }
        }
    }

}