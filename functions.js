/*************************************************************/
// NumeroALetras
// The MIT License (MIT)
// 
// Copyright (c) 2015 Luis Alfredo Chee 
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
// 
// @author Rodolfo Carmona
// @contributor Jean (jpbadoino@gmail.com)
/*************************************************************/
import pkg from 'mssql';
import { readFile, writeFile } from 'fs';
import { request } from 'https';
import { nombres_latinos } from './fuctions-approvals.js';
import pkgLodash from 'lodash'; // Renombramos la importación para evitar conflictos
import { Console } from 'console';
import { generatePDF } from './HR/PersonnelRequisition/GeneratePDF.js';
import fs from 'fs/promises';
import path from 'path';
import {optionsMaster} from './APPROVALS/functions.js';
const { forEach: _forEach, keysIn } = pkgLodash; // Desestructuración

function Unidades(num, decena) {

    switch (num) {
        case 1:
            if (decena == "SinDecena") {
                return "UN";
            } else {
                return "UNO";
            }
        case 2:
            return "DOS";
        case 3:
            return "TRES";
        case 4:
            return "CUATRO";
        case 5:
            return "CINCO";
        case 6:
            return "SEIS";
        case 7:
            return "SIETE";
        case 8:
            return "OCHO";
        case 9:
            return "NUEVE";
    }

    return "";
} //Unidades()

function Decenas(num) {

    decena = Math.floor(num / 10);
    unidad = num - (decena * 10);

    switch (decena) {
        case 1:
            switch (unidad) {
                case 0:
                    return "DIEZ";
                case 1:
                    return "ONCE";
                case 2:
                    return "DOCE";
                case 3:
                    return "TRECE";
                case 4:
                    return "CATORCE";
                case 5:
                    return "QUINCE";
                default:
                    return "DIECI" + Unidades(unidad, "ConDecena");
            }
        case 2:
            switch (unidad) {
                case 0:
                    return "VEINTE";
                default:
                    return "VEINTI" + Unidades(unidad, "SinDecena");
            }
        case 3:
            return DecenasY("TREINTA", unidad);
        case 4:
            return DecenasY("CUARENTA", unidad);
        case 5:
            return DecenasY("CINCUENTA", unidad);
        case 6:
            return DecenasY("SESENTA", unidad);
        case 7:
            return DecenasY("SETENTA", unidad);
        case 8:
            return DecenasY("OCHENTA", unidad);
        case 9:
            return DecenasY("NOVENTA", unidad);
        case 0:
            return Unidades(unidad);
    }
} //Unidades()

function DecenasY(strSin, numUnidades) {
    if (numUnidades > 0)
        return strSin + " Y " + Unidades(numUnidades, "SinDecena")

    return strSin;
} //DecenasY()

function Centenas(num) {
    centenas = Math.floor(num / 100);
    decenas = num - (centenas * 100);

    switch (centenas) {
        case 1:
            if (decenas > 0)
                return "CIENTO " + Decenas(decenas);
            return "CIEN";
        case 2:
            return "DOSCIENTOS " + Decenas(decenas);
        case 3:
            return "TRESCIENTOS " + Decenas(decenas);
        case 4:
            return "CUATROCIENTOS " + Decenas(decenas);
        case 5:
            return "QUINIENTOS " + Decenas(decenas);
        case 6:
            return "SEISCIENTOS " + Decenas(decenas);
        case 7:
            return "SETECIENTOS " + Decenas(decenas);
        case 8:
            return "OCHOCIENTOS " + Decenas(decenas);
        case 9:
            return "NOVECIENTOS " + Decenas(decenas);
    }

    return Decenas(decenas);
} //Centenas()

function Seccion(num, divisor, strSingular, strPlural) {
    cientos = Math.floor(num / divisor)
    resto = num - (cientos * divisor)

    letras = "";

    if (cientos > 0)
        if (cientos > 1)
            letras = Centenas(cientos) + " " + strPlural;
        else
            letras = strSingular;

    if (resto > 0)
        letras += "";

    return letras;
} //Seccion()

function Miles(num) {
    divisor = 1000;
    cientos = Math.floor(num / divisor)
    resto = num - (cientos * divisor)

    strMiles = Seccion(num, divisor, "MIL", "MIL");
    strCentenas = Centenas(resto);

    if (strMiles == "")
        return strCentenas;

    return strMiles + " " + strCentenas;
} //Miles()
function Millones(num) {
    divisor = 1000000;
    cientos = Math.floor(num / divisor)
    resto = num - (cientos * divisor)

    strMillones = Seccion(num, divisor, "UN MILLON", "MILLONES");
    strMiles = Miles(resto);

    if (strMillones == "")
        return strMiles;

    return strMillones + " " + strMiles;
}
const { connect, NVarChar, DateTime, Float, Int } = pkg; // Desestructuración

const sqlConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PWD,
    database: process.env.DB_NAME,
    server: process.env.DB_SERVER,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    options: {
        encrypt: false, // for azure
        trustServerCertificate: false // change to true for local dev / self-signed certs
    }
}

export function NumeroALetras(num) {
    var data = {
        numero: num,
        enteros: Math.floor(num),
        centavos: (((Math.round(num * 100)) - (Math.floor(num) * 100))),
        letrasCentavos: "",
        letrasMonedaPlural: '', //"PESOS", 'Dólares', 'Bolívares', 'etcs'
        letrasMonedaSingular: '', //"PESO", 'Dólar', 'Bolivar', 'etc'

        letrasMonedaCentavoPlural: "CENTAVOS",
        letrasMonedaCentavoSingular: "CENTAVO"
    };

    // if (data.centavos > 0) {
    //     data.letrasCentavos = "CON " + (function() {
    //         if (data.centavos == 1)
    //             return Millones(data.centavos) + " " + data.letrasMonedaCentavoSingular;
    //         else
    //             return Millones(data.centavos) + " " + data.letrasMonedaCentavoPlural;
    //     })();
    // };
    if (data.enteros == 0)
        return "CERO";
    if (data.enteros == 1)
        return Millones(data.enteros);

    else
        return Millones(data.enteros);
}
export function get_menu(result) {
    var Menu = {};
    Menu["M_Admin"] = result.recordset[0].M_Admin;
    Menu["M_Conta"] = result.recordset[0].M_Conta;
    Menu["M_CRM"] = result.recordset[0].M_CRM;
    Menu["F_Conta"] = result.recordset[0].F_Conta;
    Menu["F_Admin"] = result.recordset[0].F_Admin;
    Menu["xcargo"] = result.recordset[0].xcargo;
    Menu["F_Finanzas"] = result.recordset[0].F_Finanzas;
    Menu["F_Governance"] = result.recordset[0].F_Governance;
    Menu["F_HR"] = result.recordset[0].F_HR;
    Menu["Modules"] = result.recordset[0].Modules;
    Menu["compania"] = result.recordset[0].compania;
    Menu["ccompania"] = result.recordset[0].ccompania;
    Menu["logo"] = result.recordset[0].xlogo;
    Menu['Name'] = result.recordset[0].Name;
    Menu['dep'] = result.recordset[0].departamento;
    return Menu;
}
export async function approval_bitacora(sql, RowID, UserID, accion, detalle, modulo, resultado) {
    sql.connect(sqlConfig, err => {
        let sqlrequest = new sql.Request();
        sqlrequest.input('id', sql.Int, RowID);
        sqlrequest.input('username', sql.NVarChar, UserID);
        sqlrequest.input('accion', sql.NVarChar, accion);
        sqlrequest.input('detalle', sql.NVarChar, detalle);
        sqlrequest.input('modulo', sql.NVarChar, modulo);
        sqlrequest.input('resultado', sql.NVarChar, resultado);
        sqlrequest.query(`insert into approval_bitacora 
        (id, username, accion, detalle, modulo, resultado) 
        values (@id, @username, @accion, @detalle, @modulo, @resultado);`, (err, result) => {
            if (err) {
                console.log(err);
            }
            console.log(result);
        });
    });
}

export function asignacion_integrates(flow_row, users, departamento, username, id_flow, nombre, bancos, departamentos, company) {
    var proceso = [];
    var estado = [];

    function getUserWithSuplente(userId, suplenteId) {
        let user = users.find(obj => obj.UserID === userId);
        const isSignature = typeof nombre === 'string' && nombre.toLowerCase().includes('signature');
        if (!user || (user.vacaciones == 1 && !isSignature)) {
            let suplente = users.find(obj => obj.UserID === suplenteId);
            if (!suplente || suplente.vacaciones == 1) {
                return [{ Name: 'N/A', UserID: 'N/A' }, 'N/A'];
            }
            return [{ Name: suplente.Name, UserID: suplente.UserID }, suplente.Estado];
        }
        return [{ Name: user.Name, UserID: user.UserID }, user.Estado];
    }

    proceso.push({ Name: 'N/A', UserID: 'N/A' });
    estado.push('N/A');

    if (flow_row.length > 0) {
        while (flow_row.length > 0) {
            for (let i = 0; i < flow_row.length; i++) {
                if (flow_row[i].id == id_flow) {
                    flow_row = flow_row[i];
                }
            }
        }
    }

    if (bancos.length == 1) {
        flow_row['uoperador'] = bancos[0].uoperador;
        flow_row['uejecutor'] = bancos[0].uejecutor;
        flow_row['uoperador_suplente'] = bancos[0].uoperador_suplente;
        flow_row['uejecutor_suplente'] = bancos[0].uejecutor_suplente;
    }

    for (var key in flow_row) {
        switch (key) {
            case 'uverificador':
            case 'uaprobador':
            case 'ufirmante':
            case 'uoperador':
            case 'uejecutor':
            case 'uverificador_suplente':
            case 'uaprobador_suplente':
            case 'ufirmante_suplente':
            case 'uoperador_suplente':
            case 'uejecutor_suplente':
                switch (flow_row[key]) {
                    case 'N/A':
                        proceso.push({ Name: 'N/A', UserID: 'N/A' });
                        estado.push('N/A');
                        break;
                    case 'ALL':
                        var temp_proceso = [];
                        var temp_estado = '';
                        for (let index = 0; index < users.length; index++) {
                            const user = users[index];
                            const [obj, est] = getUserWithSuplente(user.UserID, null);
                            temp_proceso.push(obj);
                            temp_estado += est + ';';
                        }
                        proceso.push(temp_proceso);
                        estado.push(temp_estado);
                        break;
                    case 'manager':
                        let user = users.find(obj => obj.UserID === username);
                        let manager = users.find(obj => obj.UserID === user?.Manager);

                        if (user?.Manager == 'N/A') {
                            proceso.push({ Name: 'N/A', UserID: 'N/A' });
                            estado.push('N/A');
                        }
                        else if (username == manager?.UserID && key != 'uoperador' && key != 'uejecutor' && key != 'uoperador_suplente' && key != 'uejecutor_suplente' && key != 'ufirmante') {
                            proceso.push({ Name: 'N/A', UserID: 'N/A' });
                            estado.push('N/A');
                        } else {
                            const [obj, est] = getUserWithSuplente(manager?.UserID, flow_row[key + '_suplente']);
                            proceso.push(obj);
                            estado.push(est);
                        }
                        break;
                    case 'area_supervisor':
                        const userGetName2 = users.find(obj => obj.UserID === username);
                        const userDepartment2 = userGetName2?.cdepartamento;
                        const area2 = departamentos.filter(d => d.id === userDepartment2);

                        let targetSupervisorId;
                        if (nombre === "Personnel Requisition Form") {
                            targetSupervisorId = area2[0]?.manager;
                        } else if (departamento.manager == username && key !== 'uoperador' && key !== 'uejecutor' && key !== 'uoperador_suplente' && key !== 'uejecutor_suplente' && key !== 'ufirmante') {
                            targetSupervisorId = userGetName2?.Manager;
                        } else {
                            targetSupervisorId = departamento.manager;
                        }

                        if (targetSupervisorId && targetSupervisorId !== 'N/A') {
                            const [obj, est] = getUserWithSuplente(targetSupervisorId, flow_row[key + '_suplente']);
                            proceso.push(obj);
                            estado.push(est);
                        } else {
                            proceso.push({ Name: 'N/A', UserID: 'N/A' });
                            estado.push('N/A');
                        }
                        break;
                    case 'finance_supervisor':
                        const finance = departamentos.filter(d => d.nombre === "Accounting");
                        const finance_supervisor = finance[0]?.manager;

                        if (departamento.manager == username && key != 'uoperador' && key != 'uejecutor' && key != 'uoperador_suplente' && key != 'uejecutor_suplente' && key != 'ufirmante') {
                            proceso.push({ Name: 'N/A', UserID: 'N/A' });
                            estado.push('N/A');
                        } else {
                            const [obj, est] = getUserWithSuplente(finance_supervisor, flow_row[key + '_suplente']);
                            proceso.push(obj);
                            estado.push(est);
                        }
                        break;
                    case 'rrhh_supervisor':
                        const rrhh = departamentos.filter(d => d.nombre === "RRHH");
                        const rrhh_supervisor = rrhh[0]?.manager;

                        if (departamento.manager == username && key != 'uoperador' && key != 'uejecutor' && key != 'uoperador_suplente' && key != 'uejecutor_suplente' && key != 'ufirmante') {
                            proceso.push({ Name: 'N/A', UserID: 'N/A' });
                            estado.push('N/A');
                        } else {
                            const [obj, est] = getUserWithSuplente(rrhh_supervisor, flow_row[key + '_suplente']);
                            proceso.push(obj);
                            estado.push(est);
                        }
                        break;
                    case 'staff':
                        proceso.push({ Name: departamento.xnombre + " staff", UserID: 'N/A' });
                        estado.push(true);
                        break;
                    default:
                        const isInEjecutorOrOperador = flow_row['uejecutor'] == username || flow_row['uoperador'] == username;
                        if (!isInEjecutorOrOperador && ((key === 'uverificador' && flow_row[key] == username && id_flow != 120) || (key === 'uaprobador' && flow_row[key] == username && id_flow != 120))) {
                            proceso.push({ Name: 'N/A', UserID: 'N/A' });
                            estado.push('N/A');
                        } else {
                            let temp_proceso = null;
                            let temp_estado = '';

                            if (flow_row[key].includes(';')) {
                                let firmantes = flow_row[key].split(';');
                                let arr = [];
                                for (let i = 0; i < firmantes.length; i++) {
                                    let suplenteId = null;
                                    if (flow_row[key + '_suplente']?.includes(';')) {
                                        suplenteId = flow_row[key + '_suplente'].split(';')[i];
                                    }
                                    const [obj, est] = getUserWithSuplente(firmantes[i], suplenteId);
                                    arr.push(obj);
                                    temp_estado += est + ';';
                                }
                                temp_proceso = arr;
                            } else {
                                const suplenteId = flow_row[key + '_suplente'];
                                const [obj, est] = getUserWithSuplente(flow_row[key], suplenteId);
                                temp_proceso = obj;
                                temp_estado = est;
                            }

                            proceso.push(temp_proceso);
                            estado.push(temp_estado);
                        }
                        break;
                }
                break;
            default:
                break;
        }
    }

    return [proceso, estado];
}


function _getServerPath(server, location) {
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

export async function ApprovalCreation(sqlConfig, proceso, detalle_proceso, departamento, solicitante, date, verificador, aprobador, firmante, ejecutor, estado, cifra, banco, username, moneda, mmonto, operador, asignado, approvals_select, ccompania, req, ruta, mform, form_id) {

    try {
        let pool = await connect(sqlConfig);

        // SQL insert query
        let sql_query = `INSERT INTO log
            (proceso, detalle_proceso, departamento, solicitante, solicitante_fecha, verificador, aprobador, firmante, ejecutor, estado, monto, banco, UserID, moneda, mmonto, operador, asignado, cflow, ccompania, mform, form_id)
            OUTPUT INSERTED.id  -- This will return the id of the inserted row
            VALUES(@proceso, @detalle_proceso, @departamento, @solicitante, @solicitante_fecha, @verificador, @aprobador, @firmante, @ejecutor, @estado, @monto, @banco, @UserID, @moneda, @mmonto, @operador,@asignado, @cflow, @ccompania, @mform, @form_id);`;

        let result = await pool.request()
            .input('proceso', NVarChar, proceso)
            .input('detalle_proceso', NVarChar, detalle_proceso)
            .input('departamento', NVarChar, departamento)
            .input('solicitante', NVarChar, solicitante)
            .input('solicitante_fecha', DateTime, date)
            .input('verificador', NVarChar, verificador)
            .input('aprobador', NVarChar, aprobador)
            .input('firmante', NVarChar, firmante)
            .input('ejecutor', NVarChar, ejecutor)
            .input('estado', NVarChar, estado)
            .input('monto', NVarChar, cifra)
            .input('banco', NVarChar, banco)
            .input('UserID', NVarChar, username)
            .input('moneda', NVarChar, moneda)
            .input('mmonto', Float, mmonto)
            .input('operador', NVarChar, operador)
            .input('asignado', NVarChar, 'N/A')
            .input('cflow', Int, approvals_select)
            .input('ccompania', Int, ccompania)
            .input('mform', Int, mform)
            .input('form_id', Int, form_id)
            .query(sql_query);
        let RowID = result.recordset[0].id;
        if (req.files) {
            if (req.files.Signingfiles) {
                let files = Array.isArray(req.files.Signingfiles) ? req.files.Signingfiles : [req.files.Signingfiles];
                for (let file of files) {
                    if (file.name) {
                        let filename = nombres_latinos(file.name);
                        await file.mv(`${ruta}${RowID}/${filename}`);

                        let InsertFileApprovalresult = await InsertFileApproval(sqlConfig, RowID, departamento, proceso, filename, 1, approvals_select);

                        if (!InsertFileApprovalresult) {
                            console.error("Failed to insert file approval for signing file.");
                        }
                    }
                }
            }

            if (req.files.Supportfiles) {
                let files = Array.isArray(req.files.Supportfiles) ? req.files.Supportfiles : [req.files.Supportfiles];
                for (let file of files) {
                    if (file.name) {
                        let filename = nombres_latinos(file.name);
                        await file.mv(`${ruta}${RowID}/${filename}`);

                        let InsertFileApprovalresult = await InsertFileApproval(sqlConfig, RowID, departamento, proceso, filename, 0, approvals_select);
                        if (!InsertFileApprovalresult) {
                            console.error("Failed to insert file approval for support file.");
                        }
                    }
                }
            }
        }


        // Post a Microsoft
        const data = new TextEncoder().encode(
            JSON.stringify({ id: RowID, env: process.env.ENTORNO })
        );

        const options = optionsMaster(data)

        const ApprovalSummit = request(options, res => {
            res.on('data', d => {
                process.stdout.write(d);
            });
        });

        ApprovalSummit.on('error', error => {
            console.error("Error during Approval Summit:", error);
        });

        ApprovalSummit.write(data);
        ApprovalSummit.end();

        return RowID;
    } catch (error) {
        console.error("Error in main function:", error);
        return 0;
    }

}

export async function InsertFileApproval(sqlConfig, RowID, departamento, proceso, filename, tipo, cflow, sir_reference = null) {
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

export async function ApprovalCreationVesion2(sqlConfig, proceso, detalle_proceso, departamento, solicitante, date, verificador, aprobador, firmante, ejecutor, estado, cifra, banco, username, moneda, mmonto, operador, asignado, approvals_select, ccompania, req, ruta, mform, form_id) {

    try {
        let pool = await connect(sqlConfig);

        // SQL insert query
        let sql_query = `INSERT INTO log
            (proceso, detalle_proceso, departamento, solicitante, solicitante_fecha, verificador, aprobador, firmante, ejecutor, estado, monto, banco, UserID, moneda, mmonto, operador, asignado, cflow, ccompania, mform, form_id)
            OUTPUT INSERTED.id  -- This will return the id of the inserted row
            VALUES(@proceso, @detalle_proceso, @departamento, @solicitante, @solicitante_fecha, @verificador, @aprobador, @firmante, @ejecutor, @estado, @monto, @banco, @UserID, @moneda, @mmonto, @operador,@asignado, @cflow, @ccompania, @mform, @form_id);`;

        let result = await pool.request()
            .input('proceso', NVarChar, proceso)
            .input('detalle_proceso', NVarChar, detalle_proceso)
            .input('departamento', NVarChar, departamento)
            .input('solicitante', NVarChar, solicitante)
            .input('solicitante_fecha', DateTime, date)
            .input('verificador', NVarChar, verificador)
            .input('aprobador', NVarChar, aprobador)
            .input('firmante', NVarChar, firmante)
            .input('ejecutor', NVarChar, ejecutor)
            .input('estado', NVarChar, estado)
            .input('monto', NVarChar, cifra)
            .input('banco', NVarChar, banco)
            .input('UserID', NVarChar, username)
            .input('moneda', NVarChar, moneda)
            .input('mmonto', Float, mmonto)
            .input('operador', NVarChar, operador)
            .input('asignado', NVarChar, 'N/A')
            .input('cflow', Int, approvals_select)
            .input('ccompania', Int, ccompania)
            .input('mform', Int, mform)
            .input('form_id', Int, form_id)
            .query(sql_query);

        let RowID = result.recordset[0].id;
        let filename = '';

        try {
            const pdfData = {
                requestorName: req.body.requestorName,
                requestorPosition: req.body.requestorPosition,
                reasonForRequisition: req.body.reasonForRequisition,
                effectiveDate: req.body.effectiveDate,
                expectedStartDate: req.body.expectedStartDate,
                supportOrBussineesNotes: req.body.supportOrBussineesNotes,
                reasonNotes: req.body.reasonNotes,
                replaceWho: req.body.replaceWho,
                businessCaseIsAttached: req.body.businessCaseIsAttached,
                positionType: req.body.positionType,
                positionJobTitle: req.body.positionJobTitle,
                area: req.body.area,
                location: req.body.location,
                availableDeskOffice: req.body.availableDeskOffice,
                attachedDescription: req.body.attachedDescription,
                notesObservationsRequirements: req.body.notesObservationsRequirements,
                minCompensationRange: req.body.minCompensationRange,
                avegareCompensationRange: req.body.avegareCompensationRange,
                maxCompensationRange: req.body.maxCompensationRange,
                rangeInfoSource: req.body.rangeInfoSource,
                benefits: req.body.benefits,
                annualBonus: req.body.annualBonus,
                benefitsNotes: req.body.benefitsNotes,
                notesObservationsBenefits: req.body.notesObservationsBenefits,
                source: req.body.source,
                preIndentifyCandidate: req.body.preIndentifyCandidate,
                headhunter: req.body.headhunter,
                notesSourceRequiriments: req.body.notesSourceRequiriments,
            };

            const { fileBuffer, filename } = await generatePDF(pdfData, RowID);
            const folderPath = path.join(ruta, String(RowID));
            const filePath = path.join(folderPath, filename);
            await fs.mkdir(folderPath, { recursive: true });
            await fs.writeFile(filePath, fileBuffer);
            const insertResult = await InsertFileApproval(sqlConfig, RowID, departamento, proceso, filename, 1, approvals_select);

            if (!insertResult) {
                console.error("Failed to insert file approval for generated PDF.");
            }
        } catch (error) {
            console.error("Error in handlePDFGenerationAndInsertion:", error);
            throw error; 
        }

        if (req.files) {
            if (req.files.Supportfiles) {
                let files = Array.isArray(req.files.Supportfiles) ? req.files.Supportfiles : [req.files.Supportfiles];
                for (let file of files) {
                    if (file.name) {
                        let filename = nombres_latinos(file.name);
                        try {                            
                            await file.mv(`${ruta}${RowID}/${filename}`);
                            let InsertFileApprovalresult = await InsertFileApproval(sqlConfig, RowID, departamento, proceso, filename, 0, approvals_select);
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

        // Post a Microsoft
        const data = new TextEncoder().encode(
            JSON.stringify({ id: RowID, env: process.env.ENTORNO })
        );

        const options = optionsMaster(data)

        const ApprovalSummit = request(options, res => {
            res.on('data', d => {
                process.stdout.write(d);
            });
        });

        ApprovalSummit.on('error', error => {
            console.error("Error during Approval Summit:", error);
        });

        ApprovalSummit.write(data);
        ApprovalSummit.end();

        return RowID;
    } catch (error) {
        console.error("Error in main function:", error);
        throw error;
    }

}




