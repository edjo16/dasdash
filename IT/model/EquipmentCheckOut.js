import sql from 'mssql';
import { ApprovalCreation } from '../../functions.js';
import { sqlConfig } from '../../dbConfig.js';
import { get_menu } from '../../functions.js';
import Rules from '../../USERS/rule/DevTeam.js';
import { request as _request } from 'https';
import { optionsMaster } from '../../APPROVALS/functions.js';
export default class EquipmentCheckOutModel {
    constructor() { }

    static async readEquipmentCheckout(conection, req, res) {
        const UserID = req.session?.userID
        let databaseapproval = req.query.dbdevteam
        let devteam = await Rules.validateTeam(req.session?.iddevteam,UserID)
        var Menu = {}
        let departamentoOrigen
        let UserName
        let UserEmail
        let Modules
        let grupousuarios = [];
        let manager
        const pool = await sql.connect(conection);

        try {
            const requestUser = new sql.Request(pool);
            const query = `SELECT TOP 1 * FROM Users 
                LEFT JOIN (SELECT cast(ccompania AS VARCHAR(10)) as ccompania, xnombre, xlogo FROM companias) AS c 
                ON Users.compania LIKE '%' + c.ccompania + '%'
                WHERE UserID =  '${UserID}'`
                const { recordset } = await requestUser.query(query)
                departamentoOrigen = recordset[0].departamento
                UserName = recordset[0].Name
                UserEmail = recordset[0].Email
                manager = recordset[0].Manager
                Modules = recordset[0].Modules
                let result = { recordset: [recordset[0]] }
                Menu = get_menu(result)
        } catch (error) {
            console.log(error)
            res.status(500).json({ error: 'Error al leer los usuarioss.' });
            return;
        }

        try {
            const requestEquipmentCheckoutForm = new sql.Request(pool);
            const { recordset } = await requestEquipmentCheckoutForm.query("SELECT * FROM Users WHERE Name IS NOT NULL AND user_type = 1 ORDER BY estado DESC, Name asc");


            if (devteam) {
                for (let u = 0; u < recordset.length; u++) {
                    grupousuarios.push([recordset[u].UserID, recordset[u].Name])
                }
            }
                res.render("IT/forms_ITequipment", {
                    title: "IT - Electronic Equipment Checkout Form",
                    userProfile: {
                        UserName: UserName,
                        UserID: UserID,
                        UsuarioID: UserID,
                        UserManager: manager
                    },
                    userMenu: Menu,
                    okForm: req.query.result,
                    usuarios: grupousuarios,
                    devteam: devteam,
                    dbdevteam: databaseapproval
                });

            
        } catch (err) {
            console.error("Error en la lectura de la solicitud de aprobaciÃ³n:", err);
            return { result: 0, err };
        }

    }
    
    static async createEquipmentCheckout(conection, req, res) {
                let databaseapproval = req.query.dbdevteam
                let ruta_txt
                sql.connect(conection, err => {
                    if (err) {
                        console.log(err);
                        throw err;
                    } else {
                        //tarea
                        databaseapproval = req.body.dbdevteam
                        if (!databaseapproval) {
                            databaseapproval = "log"
                           ruta_txt = '//srv-dc-lombard.lombard.local/IT - Automatic Tasks/Approvals/2. Approve/'
                        } else { ruta_txt = '//srv-dc-lombard.lombard.local/IT - Automatic Tasks/Approvals/Dev/2. Approve/' }
                        var UserID = req.body.UserID
                        var UserName = req.body.UserName
                        var UserManager = req.body.UserManager
                        var proceso = "Retiro de equipo informatico"
                        var detalle_proceso = "Retiro desde " + req.body.fretiro + " hasta " + req.body.freintegro + " y retira: "
                        var departamento = 'IT'
                        var solicitante = UserName
                        var verificador = 'N/A'
                        var aprobador = req.body.Aprobador
                        var firmante = 'N/A'
                        var ejecutor = 'N/A'
                        var estado = 'Approve'
                        var monto = ""
                        var banco = ""
                        var date = new Date()
                        const offset = date.getTimezoneOffset()
                        date = new Date(date.getTime() - (offset * 60 * 1000))
                        date = date.toISOString().slice(0, 19).replace('T', ' ')
                        if (req.body.dockstation == 1) {
                            detalle_proceso += "Dockstation"
                            if (req.body.laptop == 1 || req.body.monitor == 1 || req.body.tablet == 1) {
                                detalle_proceso += ","
                            }
                        }
                        if (req.body.laptop == 1) {
                            detalle_proceso += "Laptop"
                            if (req.body.monitor == 1 || req.body.tablet == 1) {
                                detalle_proceso += ","
                            }
                        }
                        if (req.body.monitor == 1) {
                            detalle_proceso += "Monitor"
                            if (req.body.tablet == 1) {
                                detalle_proceso += ","
                            }
                        }
                        if (req.body.tablet == 1) {
                            detalle_proceso += "Tablet."
                        }
                        // Query insert
                        new sql.Request().query("SELECT * FROM Users WHERE UserID = '" + UserManager + "'", (err, result) => {
                            if (req.body.Aprobador) {
                                aprobador = req.body.Aprobador
                            } else {
                                aprobador = result.recordset[0].Name
                            }
                            new sql.Request().query("Insert into log (proceso,detalle_proceso,departamento,solicitante,solicitante_fecha,verificador,aprobador,firmante,ejecutor,estado) Values ('" + proceso + "','" + detalle_proceso + "','" + departamento + "','" + solicitante + "','" + date + "','" + verificador + "','" + aprobador + "','" + firmante + "','" + ejecutor + "','" + estado + "')", (err, result) => {
                                if (err) {
                                    console.log(err)
                                } else {
                                    // console.log(result)
                                    new sql.Request().query("SELECT TOP(1) id from log  ORDER BY id DESC", (err, result) => {
                                        // const texto = {
                                        //     Departamento: departamento,
                                        //     Detalles: {
                                        //         RowID: result.recordset[0].id,
                                        //         Titulo: proceso,
                                        //         Descripcion: {
                                        //             Fecha: date,
                                        //             Comentarios: detalle_proceso,
                                        //             Monto: monto,
                                        //             Banco: banco
                                        //         },
                                        //         Integrante: {
                                        //             solicitante: solicitante,
                                        //             verificador: verificador,
                                        //             aprobador: aprobador,
                                        //             firmante: firmante,
                                        //             ejecutor: ejecutor
                                        //         },
                                        //         Files: {
                                        //             nombre: "",
                                        //             links: ""
                                        //         }
                                        //     }
                                        // }
                                        // fs.writeFile(ruta_txt + result.recordset[0].id + '.txt', JSON.stringify(texto), function(err) {
                                        //     if (err) throw err;
                                        // });
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
                                            Form: "forms_ITequipment",
                                            UsuarioID: UserID,
                                            ResultForm: 1,
                                            dbdevteam: req.body.dbdevteam
                                        });
                                    })
                                }
                            })
                        })
        
        
        
                    }
                }); //sql
    }
}

