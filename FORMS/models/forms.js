
import sql from 'mssql';
import Rules from '../../USERS/rule/DevTeam.js';
import { writeFile } from 'fs';
import { request as _request } from 'https';
import { get_menu, ApprovalCreation } from '../../functions.js';
import { optionsMaster } from '../../APPROVALS/functions.js';
import ApprovalFunctionsModel from '../../Approvals_functions/models/approval_functions.js';

export default class FormsModel {
    constructor() { }

    //forms Recursos humanos
    static async postFormsHR(transaction, req, res) {
        UserID = req.session?.userID
        DBtype = databaseapproval
        databaseapproval = req.query.dbdevteam
        sql.connect(transaction, err => {
            if (err) {
                console.log(err);
                throw err;
            } else {
                //tarea

                databaseapproval = req.body.dbdevteam
                if (!databaseapproval) {
                    databaseapproval = "log"
                    ruta_txt = '//srv-dc-lombard.lombard.local/IT - Automatic Tasks/Approvals/Dev/3. Signature/'
                } else { ruta_txt = '//srv-dc-lombard.lombard.local/IT - Automatic Tasks/Approvals/3. Signature/' }
                var UserID = req.body.UserID
                var proceso = req.body.nombre
                var detalle_proceso = req.body.description
                var departamento = 'RRHH'
                var solicitante = req.body.UserName
                var verificador = 'N/A'
                var aprobador = 'N/A'
                var firmante = req.body.Firmante
                var ejecutor = 'N/A'
                var estado = 'Signature'
                var monto = ""
                var banco = ""
                var date = new Date()
                const offset = date.getTimezoneOffset()
                date = new Date(date.getTime() - (offset * 60 * 1000))
                date = date.toISOString().slice(0, 19).replace('T', ' ')
                // Query insert
                const logReq = new sql.Request();
                logReq.input('proceso', sql.VarChar, proceso);
                logReq.input('detalle_proceso', sql.VarChar, detalle_proceso);
                logReq.input('departamento', sql.VarChar, departamento);
                logReq.input('solicitante', sql.VarChar, solicitante);
                logReq.input('solicitante_fecha', sql.VarChar, date);
                logReq.input('verificador', sql.VarChar, verificador);
                logReq.input('aprobador', sql.VarChar, aprobador);
                logReq.input('firmante', sql.VarChar, firmante);
                logReq.input('ejecutor', sql.VarChar, ejecutor);
                logReq.input('estado', sql.VarChar, estado);
                logReq.query("Insert into log (proceso,detalle_proceso,departamento,solicitante,solicitante_fecha,verificador,aprobador,firmante,ejecutor,estado) Values (@proceso,@detalle_proceso,@departamento,@solicitante,@solicitante_fecha,@verificador,@aprobador,@firmante,@ejecutor,@estado)", (err, result) => {
                    if (err) {
                        console.log(err)
                    } else {
                        // console.log(result)
                        new sql.Request().query("SELECT TOP(1) id from log  ORDER BY id DESC", (err, result) => {
                            var RowID = result.recordset[0].id
                            var filename = ''
                            if (req.files) {
                                var links = '<p>Documents for Approval & Signature:</p><br>'
                                if (req.files.Signingfiles) {
                                    if (req.files.Signingfiles.name) {
                                        file = req.files.Signingfiles;
                                        filename = nombres_latinos(file.name)
                                        file.mv('//srv-dc-lombard.lombard.local/Recursos Humanos/Approvals/Aprobado/' + RowID + '/' + filename);
                                        const archReq = new sql.Request();
                                        archReq.input('id_log', sql.Int, RowID);
                                        archReq.input('departamento', sql.VarChar, departamento);
                                        archReq.input('proceso', sql.VarChar, proceso);
                                        archReq.input('archivo_nombre', sql.VarChar, filename);
                                        archReq.input('tipo', sql.Int, 1);
                                        archReq.query("insert into archivos (id_log, departamento, proceso, archivo_nombre, tipo) VALUES (@id_log, @departamento, @proceso, @archivo_nombre, @tipo)", (err, result) => { })
                                    } else {
                                        forEach(keysIn(req.files.Signingfiles), (key) => {
                                            file = req.files.Signingfiles[key];
                                            filename = nombres_latinos(file.name)
                                            file.mv('//srv-dc-lombard.lombard.local/Recursos Humanos/Approvals/Aprobado/' + RowID + '/' + filename);
                                            const archReq = new sql.Request();
                                            archReq.input('id_log', sql.Int, RowID);
                                            archReq.input('departamento', sql.VarChar, departamento);
                                            archReq.input('proceso', sql.VarChar, proceso);
                                            archReq.input('archivo_nombre', sql.VarChar, filename);
                                            archReq.input('tipo', sql.Int, 1);
                                            archReq.query("insert into archivos (id_log, departamento, proceso, archivo_nombre, tipo) VALUES (@id_log, @departamento, @proceso, @archivo_nombre, @tipo)", (err, result) => { })
                                        });
                                    }
                                }
                                if (req.files.Supportfiles) {
                                    links += '<p>Supporting Documents:</p><br>'
                                    if (req.files.Supportfiles.name) {
                                        file = req.files.Supportfiles;
                                        filename = nombres_latinos(file.name)
                                        file.mv('//srv-dc-lombard.lombard.local/Recursos Humanos/Approvals/Aprobado/' + RowID + '/' + filename);
                                        const archReq = new sql.Request();
                                        archReq.input('id_log', sql.Int, RowID);
                                        archReq.input('departamento', sql.VarChar, departamento);
                                        archReq.input('proceso', sql.VarChar, proceso);
                                        archReq.input('archivo_nombre', sql.VarChar, filename);
                                        archReq.input('tipo', sql.Int, 0);
                                        archReq.query("insert into archivos (id_log, departamento, proceso, archivo_nombre, tipo) VALUES (@id_log, @departamento, @proceso, @archivo_nombre, @tipo)", (err, result) => { })
                                    } else {
                                        forEach(keysIn(req.files.Supportfiles), (key) => {
                                            file = req.files.Supportfiles[key];
                                            filename = nombres_latinos(file.name)
                                            file.mv('//srv-dc-lombard.lombard.local/Recursos Humanos/Approvals/Aprobado/' + RowID + '/' + filename);
                                            const archReq = new sql.Request();
                                            archReq.input('id_log', sql.Int, RowID);
                                            archReq.input('departamento', sql.VarChar, departamento);
                                            archReq.input('proceso', sql.VarChar, proceso);
                                            archReq.input('archivo_nombre', sql.VarChar, filename);
                                            archReq.input('tipo', sql.Int, 0);
                                            archReq.query("insert into archivos (id_log, departamento, proceso, archivo_nombre, tipo) VALUES (@id_log, @departamento, @proceso, @archivo_nombre, @tipo)", (err, result) => { })
                                        });
                                    }
                                }
                            }
                            const data = new TextEncoder().encode(
                                JSON.stringify({ id: result.recordset[0].id, env: process.env.ENTORNO })
                            )
                            const options = optionsMaster(data)
                            const ApprovalSummit = _request(options, res => {
                                console.log(`statusCode: ${res.statusCode}`)
                                res.on('data', d => {
                                    process.stdout.write(d)
                                })
                            })
                            ApprovalSummit.on('error', error => {
                                console.error(error)
                            })
                            ApprovalSummit.write(data)
                            ApprovalSummit.end()
                            res.render("forms_temp", {
                                Form: "forms_hr",
                                UsuarioID: UserID,
                                ResultForm: 1,
                                dbdevteam: req.body.dbdevteam
                            });
                        })
                    }
                })

            }
        }); //sql
    };
    static async getFormsTemp(req, res) {
        res.render("forms_temp", {});
    };
    static async getFormsFunctionBeneficiario(transaction, req, res) {
        var departamento = req.body.departamento
        databaseapproval = req.query.dbdevteam
        sql.connect(transaction, err => {
            const benReq = new sql.Request();
            benReq.input('departamento', sql.VarChar, `%${departamento}%`);
            benReq.query("Select beneficiario_id, nombre from beneficiario where (departamento LIKE @departamento)", (err, result) => {
                if (err) {
                    console.log(err)
                }
                res.status(200).send({ arraytest: result.recordset })
                // res.send(200, { arraytest: result.recordset })
            })
        })

    };
    static async getFormsFunctionBeneficiarioCuenta(transaction, req, res) {
        var id = req.body.id
        databaseapproval = req.query.dbdevteam
        sql.connect(transaction, err => {
            const cuentaReq = new sql.Request();
            cuentaReq.input('id', sql.VarChar, id);
            cuentaReq.query("Select cuenta_id, banco, cuenta_bancaria from beneficiario_cuenta where (beneficiario_id = @id)", (err, result) => {
                if (err) {
                    console.log(err)
                }
                res.status(200).send({ arraytest: result.recordset })
            })
        })

    };
    static async postFormsInterdepartmentalRequest(transaction, req, res) {
        var UserID = req.body.UsuarioID
        var id_dep_inicio = Number(req.body.id_dep_inicio)
        var ctipo = Number(req.body.ctipo)
        var solicitante = req.body.xnombre
        var username = req.body.username
        var estado = req.body.estado
        var approvals_select = Number(req.body.approvals_select)
        var compania = Number(req.body.compania)
        sql.connect(transaction, err => {
            if (err) {
                console.log(err);
                throw err;
            } else {
                // sql_query = `SELECT u.Name 
                // FROM Users u 
                // WHERE u.ccompania = @compania AND u.Estado = 1 AND u.user_type = 1
                // ORDER BY Name`
                let sql_query = `SELECT u.Name 
                FROM Users u 
                WHERE u.Estado = 1 AND u.user_type = 1 AND ccompania = @compania
                ORDER BY Name`
                let sqlrequest = new sql.Request()
                sqlrequest.input('compania', sql.Int, compania);
                sqlrequest.query(sql_query, (err, result) => {
                    if (err) {
                        res.send({ result: 0 })
                        throw err;
                    } else {
                        let users = result.recordset
                        // Buscar Departamentos
                        const flowReq = new sql.Request();
                        flowReq.input('approvals_select', sql.Int, approvals_select);
                        flowReq.query(`select * from approvals_flow AS a
                            LEFT JOIN companias AS c ON c.ccompania = a.ccompania
                            where id = @approvals_select`, (err, result) => {
                            if (err) {
                                const errReq = new sql.Request();
                                errReq.input('respuesta', sql.VarChar, String(err));
                                errReq.query("INSERT into actcarpeta (cusuario, tipo, respuesta) VALUES (988, 'Preparacion PO Detalle', @respuesta)", (err, result) => {
                                    if (err) { console.log(err); throw err; }
                                })
                                res.status(200).send({
                                    RowID: 0
                                })
                            }
                            let approvals_flow = result.recordset[0]
                            let ruta = ApprovalFunctionsModel._getServerPath(approvalsFlow.server, approvalsFlow.location)
                            ruta = ruta.replace('\\', '/')
                            var compania = approvals_flow.xnombre
                            //Campos formulario
                            var proceso = req.body.proceso
                            var ccompania = Number(req.body.compania)
                            var detalle_proceso = req.body.description
                            var verificador = req.body.verificador
                            var aprobador = req.body.aprobador
                            var ejecutor = req.body.ejecutor
                            var moneda = req.body.moneda
                            var mmonto = Number(req.body.monto)
                            var fecha = req.body.fecha
                            var solicitante = req.body.solicitante
                            var estado = req.body.estado
                            var cifra = req.body.cifra
                            var banco = req.body.banco
                            var UserId = req.body.UserID
                            let date = new Date()
                            const offset = date.getTimezoneOffset()
                            date = new Date(date.getTime() - (offset * 60 * 1000))
                            date = date.toISOString().slice(0, 19).replace('T', ' ')
                            if (req.body.firmante.includes(" staff")) {
                                firmante = users
                            }
                            else if (req.body.firmante == 'N/A') {
                                firmante.push(JSON.parse('{"Name":"N/A"}'))
                            }
                            else {
                                let searchResult = users.find(obj => obj.Name === req.body.firmante);
                                firmante.push(searchResult)
                            }
                            const depReq = new sql.Request();
                            depReq.input('cdepartamento', sql.Int, approvals_flow.cdepartamento);
                            depReq.query(`select * from departamentos where id = @cdepartamento`, (err, result) => {
                                let departamento = result.recordset[0].nombre
                                for (let index = 0; index < firmante.length; index++) {
                                    let RowID = ApprovalCreation(transaction, proceso, detalle_proceso, departamento, solicitante, date, verificador, aprobador, firmante[index].Name, ejecutor, estado, cifra, banco, username, moneda, mmonto, operador, 'N/A', approvals_select, ccompania, req, ruta, null)
                                    RowID.then(function (result) {
                                        if (index == firmante.length - 1) {
                                            res.status(200).send({
                                                RowID: result,
                                                estado: estado
                                            })
                                        }
                                    })
                                }

                            }) //Departamentos
                        })//Flows
                    }
                })
            }
        });
    };
    static async getMasterForm(transaction, formName) {
        const request = new sql.Request(transaction);
        const query = `SELECT id, table_name, name FROM mform WHERE name = @formName`;
        request.input('formName', sql.VarChar, formName);
        const { recordset } = await request.query(query);
        return recordset;
    }
}
