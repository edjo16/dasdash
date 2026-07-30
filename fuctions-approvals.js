
import sql from 'mssql';
import { sqlConfig } from './dbConfig.js';


    export  function Get_Actuante_X_Accion(accion) {
        switch (accion) {
            case 'Verify':
                var col = 'verificador'
                break
            case 'Approve':
                var col = 'aprobador'
                break
            case 'Signature':
                var col = 'firmante'
                break
            case 'Apply':
                var col = 'operador'
                break
            case 'Execute':
                var col = 'ejecutor'
                break
        }
        return col
    }

    export  function Get_Sig_Estado_X_Accion(accion, departamento, estado, aprobador, firmante, operador, ejecutor) {
        var resultado = {}
        switch (accion) {
            case 'Verify':
            case 'Verified':
                if (aprobador == 'N/A') {
                    if (firmante == 'N/A') {
                        if (operador == 'N/A') {
                            if (ejecutor == 'N/A') {
                                resultado["estado"] = 'Verified'
                                resultado["rutanew"] = '3. Signature'
                            } else {
                                resultado["estado"] = 'Execute'
                                resultado["rutanew"] = '4. Execute'
                            }
                        } else {
                            resultado["estado"] = 'Apply'
                            resultado["rutanew"] = '3. Signature'
                        }
                    } else {
                        resultado["estado"] = 'Signature'
                        resultado["rutanew"] = '3. Signature'
                    }
                } else {
                    resultado["estado"] = 'Approve'
                    resultado["rutanew"] = '2. Approve'
                }
                break
            case 'Approve':
            case 'Approved':
                if (firmante == 'N/A') {
                    if (operador == 'N/A') {
                        if (ejecutor == 'N/A') {
                            resultado["estado"] = 'Approved'
                            resultado["rutanew"] = '3. Signature'
                        } else {
                            resultado["estado"] = 'Execute'
                            resultado["rutanew"] = '4. Execute'
                        }
                    } else {
                        resultado["estado"] = 'Apply'
                        resultado["rutanew"] = '3. Signature'
                    }
                } else {
                    resultado["estado"] = 'Signature'
                    resultado["rutanew"] = '3. Signature'
                }
                break
            case 'Signed':
            case 'Signature':
                if (operador == 'N/A') {
                    if (ejecutor == 'N/A') {
                        resultado["estado"] = 'Signed'
                        resultado["rutanew"] = '3. Signature'
                    } else {
                        resultado["estado"] = 'Execute'
                        resultado["rutanew"] = '4. Execute'
                    }
                } else {
                    resultado["estado"] = 'Apply'
                    resultado["rutanew"] = '3. Signature'
                }
                break
            case 'Applied':
            case 'Apply':
                if (ejecutor == 'N/A') {
                    resultado["estado"] = 'Applied'
                    resultado["rutanew"] = '5. Signed'
                } else {
                    resultado["estado"] = 'Execute'
                    resultado["rutanew"] = '4. Execute'
                }
                break
            case 'Execute':
            case 'Executed':
                resultado["estado"] = 'Executed'
                resultado["rutanew"] = '6. Executed'
                break
            case 'Rejected':
                resultado["estado"] = 'Rejected'
                resultado["rutanew"] = '7. Rejected'
                break
        }

        // switch (departamento) {
        //     case 'Governance':
        //         switch (accion) {
        //             case 'Verified':
        //             case 'Verify':
        //                 if (aprobador == 'N/A') {
        //                     resultado["estado"] = 'Signature'
        //                     resultado["rutanew"] = '3. Signature'

        //                 } else {
        //                     resultado["estado"] = 'Approve'
        //                     resultado["rutanew"] = '2. Approve'
        //                 }
        //                 break
        //             case 'Signed':
        //             case 'Signature':
        //                 resultado["estado"] = 'Signed'
        //                 resultado["rutanew"] = '5. Signed'
        //                 break
        //             case 'Rejected':
        //                 resultado["estado"] = 'Rejected'
        //                 resultado["rutanew"] = '7. Rejected'
        //                 break
        //         }
        //         break
        //     case 'Underwriting':
        //         switch (accion) {
        //             case 'Verify':
        //             case 'Verified':
        //                 if (firmante == 'N/A') {
        //                     resultado["estado"] = 'Verified'
        //                     resultado["rutanew"] = '1.5. Verified'

        //                 } else {
        //                     resultado["estado"] = 'Signature'
        //                     resultado["rutanew"] = '3. Signature'
        //                 }
        //                 break
        //             case 'Approve':
        //             case 'Approved':
        //                 resultado["estado"] = 'Signature'
        //                 resultado["rutanew"] = '3. Signature'
        //                 break
        //             case 'Signed':
        //             case 'Signature':
        //                 resultado["estado"] = 'Signed'
        //                 resultado["rutanew"] = '5. Signed'
        //                 break
        //             case 'Rejected':
        //                 resultado["estado"] = 'Rejected'
        //                 resultado["rutanew"] = '7. Rejected'
        //                 break
        //         }
        //     :
        //         switch (accion) {
        //             case 'Verify':
        //             case 'Verified':
        //                 resultado["estado"] = 'Approve'
        //                 resultado["rutanew"] = '2. Approve'
        //                 break
        //             case 'Approve':
        //             case 'Approved':
        //                 resultado["estado"] = 'Signature'
        //                 resultado["rutanew"] = '3. Signature'
        //                 break
        //             case 'Signature':
        //             case 'Signed':
        //                 if (ejecutor == 'N/A') {
        //                     resultado["estado"] = 'Signed'
        //                     resultado["rutanew"] = '5. Execute'

        //                 } else {
        //                     resultado["estado"] = 'Execute'
        //                     resultado["rutanew"] = '4. Execute'
        //                 }
        //                 break
        //             case 'Execute':
        //             case 'Executed':
        //                 resultado["estado"] = 'Executed'
        //                 resultado["rutanew"] = '6. Executed'
        //                 break
        //             case 'Rejected':
        //                 resultado["estado"] = 'Rejected'
        //                 resultado["rutanew"] = '7. Rejected'
        //                 break
        //         }
        //         break
        // }
        switch (estado) {
            case 'Verify':
                resultado["rutaold"] = '1. Verify'
                break
            case 'Approve':
                resultado["rutaold"] = '2. Approve'
                break
            case 'Signature':
                resultado["rutaold"] = '3. Signature'
                break
            case 'Execute':
                resultado["rutaold"] = '4. Execute'
                break
        }
        try {
            console.log(accion, departamento, estado, ejecutor, resultado["estado"])
        } catch (err) { console.log("Error Get_Sig_Estado_X_Accion") }
        return resultado
    }
    export  function Get_Resultado(estado) {
        var resultado = ''
        switch (estado) {
            case 'Verify':
                resultado = 'Verified'
                break
            case 'Approve':
                resultado = 'Approve'
                break
            case 'Signature':
                resultado = 'Signature'
                break
            case 'Execute':
                resultado = 'Execute'
                break
        }
        return resultado
    }
    export  function inicio_approval(sql, departamento, soliciante_username) {
        new sql.Request().query("exec FlowApprovalByUser @tipo = '" + departamento + "', @usuario = '" + soliciante_username + "'", (err, result) => {
            if (result.recordset[0].verificador) {
                console.log(result.recordset[0].verificador)
            } else if (result.recordset[0].aprobador) {
                console.log(result.recordset[0].aprobador)
            } else {
                console.log(result.recordset[0].firmante)
            }
            return result
        })
    }
    export  function get_correo_usuario(UserID) {
    
        sql.connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                throw err;
            }
            new sql.Request().query("SELECT Email FROM Users WHERE UserID = '" + UserID + "' or Name = '" + UserID + "'", (err, result) => {
                email = result.recordset[0].Email
                return email
            })
        })

    }
    export  function nuevo_archivo_approval(id, departamento, proceso, nombre, tipo) {
        console.log(id + ", '" + departamento + "', '" + proceso + "', '" + nombre + "', " + tipo)
        sql.connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                throw err;
            }
            new sql.Request().query("insert into archivos (id_log, departamento, proceso, archivo_nombre, tipo) VALUES (" + id + ", '" + departamento + "', '" + proceso + "', '" + nombre + "', " + tipo + ")", (err, result) => {
                if (err) {
                    console.log(err);
                    throw err;
                }
                return result
            })
        })
    }
    export function nombres_latinos(nombre) {
        nombre = nombre.replace('Ã¡', 'á');
        nombre = nombre.replace('Ã©', 'é');
        nombre = nombre.replace('Ã­', 'í');
        nombre = nombre.replace('Ã³', 'ó');
        nombre = nombre.replace('Ãº', 'ú');
        nombre = nombre.replace('Ã\x81', 'Á');
        nombre = nombre.replace('Ã\x89', 'É');
        nombre = nombre.replace('Ã\x8D', 'Í');
        nombre = nombre.replace('Ã\x93', 'Ó');
        nombre = nombre.replace('Ã\x9A', 'Ú');
        nombre = nombre.replace('Ã±', 'ñ');
        nombre = nombre.replace('Ã\x91', 'Ñ');
        nombre = nombre.replace(/["'`]/g, '');  
        
        return nombre;
    }
    
    export  function crm_usuarios(departamento) {

        sql.connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                throw err;
            }
            new sql.Request().query("select UserID from users WHERE Modules LIKE '%" + departamento + "%'", (err, result) => {
                if (err) {
                    console.log(err);
                    throw err;
                }
                console.log(result.recordset)
                return result.recordset
            })
        })
    }

    export  function performanceReview( id, date, collaboratorName, collabjobTitle, leaderName, leaderJobTitle, averageGoal, developmentGoal, observationsLeader, observationsAssociate, generalResult) {
        console.log(id + ", '" + date + "', '" + collaboratorName + "', '" + collabjobTitle + "', " + leaderName + ", '" + leaderJobTitle + "', " + averageGoal + ", " + developmentGoal + ", '" + observationsLeader + "', '" + observationsAssociate + "', '" + generalResult + "'")

        sql.connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                throw err;
            }
            new sql.Request().query("insert into forms_hr_performance_review (id, date, collaboratorName, collabjobTitle, leaderName, leaderJobTitle, averageGoal, developmentGoal, observationsLeader, observationsAssociate, generalResult) VALUES ("
                 + id + ",  '" + date + "', '" + collaboratorName + "', '" + collabjobTitle + "', " + leaderName + ", '" + leaderJobTitle + "', " + averageGoal + ", " + developmentGoal + ", '" + observationsLeader + "', '" + observationsAssociate + "', '" + generalResult + "')", (err, result) => {
                if (err) {
                    console.log(err);
                    throw err;
                }
                return result
            })
        })
    }