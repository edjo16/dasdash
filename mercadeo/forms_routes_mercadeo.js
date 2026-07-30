import express from "express";
import { request } from "http";
import path from "path";
import fs from 'fs';
import { connect } from "http2";
import https from 'https';
import _ from "lodash";
import { get_menu } from '../functions.js';
import sql from 'mssql'; 
import { sqlConfig } from '../dbConfig.js';
import Rules from '../USERS/rule/DevTeam.js';
export default function(app) {
    var titulo = "BADACO - "

        //Forms Marketing
    app.get("/forms_mercadeo_nuevo_contacto", async (req, res) => {
        const UserID = req.session?.userID
        let devteam = await Rules.validateTeam(req.session?.iddevteam,UserID)

        sql.connect(sqlConfig, err => {
            if (err) {
                console.log(err);
            }
            if (UserID == undefined) {
                res.redirect("/sinID");
            } else {
                // Query usuario
                new sql.Request().query(`SELECT TOP 1 * FROM Users 
                LEFT JOIN (SELECT cast(ccompania AS VARCHAR(10)) as ccompania, xnombre, xlogo FROM companias) AS c 
                ON Users.compania LIKE '%' + c.ccompania + '%'
                WHERE UserID =  '${UserID}'`, (err, result) => {
                    if (result == undefined) {
                        res.redirect("/sinID");
                    } else {
                        let UserName = result.recordset[0].Name
                        let UserEmail = result.recordset[0].Email
                        let Modules = result.recordset[0].Modules
                        var Menu = {}
                        Menu = get_menu(result)
                        new sql.Request().query("SELECT * FROM Users WHERE Name IS NOT NULL AND user_type = 1 ORDER BY estado DESC, Name asc", (err, result) => {
                            var grupousuarios = []
                            var grupousuarios_active = []
                            for (let u = 0; u < result.recordset.length; u++) {
                                grupousuarios.push([result.recordset[u].UserID, result.recordset[u].Name])
                                if (result.recordset[u].compania) {
                                    if (result.recordset[u].compania.includes('1')) {
                                        grupousuarios_active.push([result.recordset[u].UserID, result.recordset[u].Name])
                                    }
                                }
                            }
                            new sql.Request().query("SELECT tipo, xnombre FROM mercadeo_tipos order by xnombre", (err, result) => {
                                var tipos = []
                                for (let u = 0; u < result.recordset.length; u++) {
                                    tipos.push([result.recordset[u].tipo, result.recordset[u].xnombre])
                                }
                                new sql.Request().query("SELECT cpais, xnombre_pais_ingles FROM m_pais order by xnombre_pais_ingles", (err, result) => {
                                    var pais = []
                                    for (let u = 0; u < result.recordset.length; u++) {
                                        pais.push([result.recordset[u].cpais, result.recordset[u].xnombre_pais_ingles])
                                    }
                                    new sql.Request().query("SELECT DISTINCT(RTRIM(LTRIM(region))) as region FROM sir_contactos WHERE region IS NOT null", (err, result) => {
                                        var region = []
                                        for (let u = 0; u < result.recordset.length; u++) {
                                            region.push(result.recordset[u].region)
                                        }
                                        res.render("forms_mercadeo_nuevo_contacto", {
                                            title: titulo + "New Contact Form",
                                            userProfile: {
                                                UserName: UserName,
                                                UserID: UserID,
                                                UsuarioID: UserID
                                            },
                                            tipos: tipos,
                                            pais: pais,
                                            region: region,
                                            userMenu: Menu,
                                            okForm: req.query.result,
                                            usuarios: grupousuarios,
                                            grupousuarios_active,
                                            devteam: devteam
                                        });
                                    }); // Select Region
                                }); // Select Pais
                            }); //Select Tipos
                        }); // Menu dev
                    } // Si usuario correcto
                }); //Datos usuario

            }
        }); //sql    
    });
    app.post('/form_mercadeo_nuevo_contacto_simple', async function(req, res, next) {
        var UserID = req.body.UserID
        var nombre = req.body.nombre
        var email = req.body.email
        var referencia = req.body.referencia
        var date = new Date()
        const offset = date.getTimezoneOffset()
        date = new Date(date.getTime() - (offset * 60 * 1000))
        fingreso = date.toISOString().slice(0, 19).replace('T', ' ')
        let pool = await sql.connect(sqlConfig)
        sql_query = `SELECT top(1) id from mercadeo_union_contactos where email = @email`
        let select = await pool.request()
            .query(sql_query)
        if(select.recordset[0].length < 1){            
            sql_query = `Insert into mercadeo_contactos (nombre, email, usuario_ingreso, fingreso, active_contacto, referencia) 
            Values (@nombre, @email, @UserID, @fingreso, @active_contacto, @referencia)`
            let insert = await pool.request()
                .input('nombre', sql.NVarChar, nombre)
                .input('email', sql.NVarChar, email)
                .input('UserID', sql.NVarChar, UserID)
                .input('fingreso', sql.DateTime, fingreso)
                .input('active_contacto', sql.NVarChar, UserID)
                .input('referencia', sql.NVarChar, referencia)
            console.log('insert contact')
            sql_query = `SELECT top(1) id from mercadeo_union_contactos where email = @email`
            let select = await pool.request()
                .query(sql_query)
            res.send({
                RowID: select.recordset[0].id,
            });
        }
        else{
            res.send({
                RowID: select.recordset[0].id,
            });
        }
    });
    app.post('/form_mercadeo_nuevo_contacto', function(req, res, next) {
        const UserID = req.session?.userID
        sql.connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                throw err;
            } else {
                var UserID = req.body.UserID
                var UserName = req.body.UserName
                var nombre = req.body.nombre
                var email = req.body.email
                var cargo = req.body.cargo
                var tipo = req.body.tipo
                var pais = req.body.pais
                var compania = req.body.compania
                var telefono = req.body.telefono
                var celular = req.body.celular
                var ciudad = req.body.ciudad
                var direccion = req.body.direccion
                var region = req.body.region
                var active_contacto = req.body.active_contacto
                var referencia = req.body.referencia
                var web = req.body.web
                var linkedin = req.body.linkedin
                var linkedin_persona = req.body.linkedin_persona
                console.log("Nuevo contacto", region, web)
                var date = new Date()
                const offset = date.getTimezoneOffset()
                date = new Date(date.getTime() - (offset * 60 * 1000))
                let fingreso = date.toISOString().slice(0, 19).replace('T', ' ')
                let sqlrequest = new sql.Request()
                sqlrequest.input('nombre', sql.NVarChar, nombre);
                sqlrequest.input('tipo', sql.NVarChar, tipo);
                sqlrequest.input('email', sql.NVarChar, email);
                sqlrequest.input('pais', sql.Int, pais);
                sqlrequest.input('cargo', sql.NVarChar, cargo);
                sqlrequest.input('compania', sql.NVarChar, compania);
                sqlrequest.input('UserID', sql.NVarChar, UserID);
                sqlrequest.input('telefono', sql.NVarChar, telefono);
                sqlrequest.input('celular', sql.NVarChar, celular);
                sqlrequest.input('ciudad', sql.NVarChar, ciudad);
                sqlrequest.input('direccion', sql.NVarChar, direccion);
                sqlrequest.input('region', sql.NVarChar, region);
                sqlrequest.input('fingreso', sql.DateTime, fingreso);
                sqlrequest.input('active_contacto', sql.NVarChar, active_contacto);
                sqlrequest.input('referencia', sql.NVarChar, referencia);
                sqlrequest.input('web', sql.NVarChar, web);
                sqlrequest.input('linkedin', sql.NVarChar, linkedin);
                sqlrequest.input('linkedin_persona', sql.NVarChar, linkedin_persona);
                let sql_query = `Insert into mercadeo_contactos (nombre, tipo, email, pais, cargo,compania, usuario_ingreso, telefono, celular, ciudad, direccion, region, fingreso, active_contacto, referencia, web, linkedin, linkedin_persona) 
                Values (@nombre, @tipo, @email, @pais, @cargo, @compania, @UserID, @telefono, @celular, @ciudad, @direccion, @region, @fingreso, @active_contacto, @referencia, @web, @linkedin, @linkedin_persona)`
                sqlrequest.query(sql_query, (err, result) => {
                    if (err) {
                        console.log(err)
                    } else {
                        new sql.Request().query("select id from mercadeo_contactos where nombre = '" + nombre + "' and tipo = '" + tipo + "' and email = '" + email + "' and pais = " + pais + " and cargo = '" + cargo + "' and compania = '" + compania + "'", (err, result) => {
                            if (err) {
                                console.log(err)
                            }
                            let id = result.recordset[0].id
                            res.send({
                                RowID: id,
                            });
                        })
                    }
                })
            }
        }); //sql
    });
    app.get("/forms_mercadeo_update_contacto", async (req, res) => {
        const UserID = req.session?.userID
        const RowID = req.query.RowID
        let devteam = await Rules.validateTeam(req.session?.iddevteam,UserID)
        var grupousuarios = []
        let grupousuarios_active = []
        sql.connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                throw err;
            }
            if (UserID == undefined) {
                res.redirect("/sinID");
            } else {
                // Query usuario
                new sql.Request().query(`SELECT TOP 1 * FROM Users 
                LEFT JOIN (SELECT cast(ccompania AS VARCHAR(10)) as ccompania, xnombre, xlogo FROM companias) AS c 
                ON Users.compania LIKE '%' + c.ccompania + '%'
                WHERE UserID =  '${UserID}'`, (err, result) => {
                    if (result == undefined) {
                        res.redirect("/sinID");
                    } else {
                        let UserName = result.recordset[0].Name
                        let UserEmail = result.recordset[0].Email
                        let Modules = result.recordset[0].Modules
                        var Menu = {}
                        Menu = get_menu(result)
                        new sql.Request().query("SELECT * FROM Users WHERE Name IS NOT NULL AND user_type = 1 ORDER BY estado DESC, Name asc", (err, result) => {
                            if (devteam) {
                                for (let u = 0; u < result.recordset.length; u++) {
                                    grupousuarios.push([result.recordset[u].UserID, result.recordset[u].Name])
                                }
                            }
                            for (let u = 0; u < result.recordset.length; u++) {
                                if (result.recordset[u].compania) {
                                    if (result.recordset[u].compania.includes('1')) {
                                        grupousuarios_active.push([result.recordset[u].UserID, result.recordset[u].Name])
                                    }
                                }
                            }
                            new sql.Request().query("SELECT *, FORMAT(fmodificacion,'dd/MM/yyyy') AS fecha_modificado, FORMAT(fingreso,'dd/MM/yyyy') AS fecha_ingreso from mercadeo_contactos where id = '" + RowID + "'", (err, result) => {
                                if (err) {
                                    console.log(err);
                                }
                                let log = result
                                new sql.Request().query("SELECT * FROM mercadeo_tipos", (err, result) => {
                                    var tipos = []
                                    for (let u = 0; u < result.recordset.length; u++) {
                                        tipos.push([result.recordset[u].tipo, result.recordset[u].xnombre])
                                    }
                                    new sql.Request().query("SELECT * FROM m_pais order by xnombre_pais_ingles", (err, result) => {
                                        var pais = []
                                        for (let u = 0; u < result.recordset.length; u++) {
                                            pais.push([result.recordset[u].cpais, result.recordset[u].xnombre_pais_ingles])
                                        }
                                        new sql.Request().query("SELECT DISTINCT(RTRIM(LTRIM(region))) as region FROM sir_contactos WHERE region IS NOT null", (err, result) => {
                                            var region = []
                                            for (let u = 0; u < result.recordset.length; u++) {
                                                region.push(result.recordset[u].region)
                                            }
                                            res.render("forms_mercadeo_update_contacto", {
                                                title: titulo + "Update Contact",
                                                userProfile: {
                                                    UserName: UserName,
                                                    UsuarioID: UserID
                                                },
                                                detalle: {
                                                    RowID: log.recordset[0].id,
                                                    nombre: log.recordset[0].nombre,
                                                    tipo: log.recordset[0].tipo,
                                                    email: log.recordset[0].email,
                                                    compania: log.recordset[0].compania,
                                                    pais: log.recordset[0].pais,
                                                    cargo: log.recordset[0].cargo,
                                                    ciudad: log.recordset[0].ciudad,
                                                    direccion: log.recordset[0].direccion,
                                                    telefono: log.recordset[0].telefono,
                                                    celular: log.recordset[0].celular,
                                                    fmodificado: log.recordset[0].fecha_modificado,
                                                    fingreso: log.recordset[0].fecha_ingreso,
                                                    usuario_ingreso: log.recordset[0].usuario_ingreso,
                                                    usuario_modificacion: log.recordset[0].usuario_modificacion,
                                                    active_contacto: log.recordset[0].active_contacto,
                                                    web: log.recordset[0].web,
                                                    region: log.recordset[0].region,
                                                    linkedin: log.recordset[0].linkedin,
                                                    linkedin_persona: log.recordset[0].linkedin_persona,
                                                    referencia: log.recordset[0].referencia,
                                                },
                                                grupousuarios_active,
                                                tipos: tipos,
                                                pais: pais,
                                                region: region,
                                                userMenu: Menu,
                                                usuarios: grupousuarios,
                                                devteam: devteam,
                                            });
                                        });
                                    })
                                })
                            }); // Total detalle
                        }); // Menu dev
                    } // Si usuario correcto
                }); //Datos usuario
            }
        }); // SQL

    });
    app.post('/form_mercadeo_update_contacto', function(req, res, next) {
        sql.connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                throw err;
            } else {
                var UserID = req.body.UserID
                var RowID = req.body.RowID
                var UserName = req.body.UserName
                var nombre = req.body.nombre
                var email = req.body.email
                var cargo = req.body.cargo
                var tipo = req.body.tipo
                var pais = req.body.pais
                var compania = req.body.compania
                var telefono = req.body.telefono
                var celular = req.body.celular
                var ciudad = req.body.ciudad
                var direccion = req.body.direccion
                var region = req.body.region
                var active_contacto = req.body.active_contacto
                var referencia = req.body.referencia
                var web = req.body.web
                var linkedin = req.body.linkedin
                var linkedin_persona = req.body.linkedin_persona
                var date = new Date()
                const offset = date.getTimezoneOffset()
                date = new Date(date.getTime() - (offset * 60 * 1000))
                let fingreso = date.toISOString().slice(0, 19).replace('T', ' ')
                let sqlrequest = new sql.Request()
                sqlrequest.input('nombre', sql.NVarChar, nombre);
                sqlrequest.input('tipo', sql.NVarChar, tipo);
                sqlrequest.input('email', sql.NVarChar, email);
                sqlrequest.input('pais', sql.Int, pais);
                sqlrequest.input('cargo', sql.NVarChar, cargo);
                sqlrequest.input('compania', sql.NVarChar, compania);
                sqlrequest.input('UserID', sql.NVarChar, UserID);
                sqlrequest.input('telefono', sql.NVarChar, telefono);
                sqlrequest.input('celular', sql.NVarChar, celular);
                sqlrequest.input('ciudad', sql.NVarChar, ciudad);
                sqlrequest.input('direccion', sql.NVarChar, direccion);
                sqlrequest.input('region', sql.NVarChar, region);
                sqlrequest.input('fingreso', sql.DateTime, fingreso);
                sqlrequest.input('RowID', sql.Int, RowID);
                sqlrequest.input('active_contacto', sql.NVarChar, active_contacto);
                sqlrequest.input('referencia', sql.NVarChar, referencia);
                sqlrequest.input('web', sql.NVarChar, web);
                sqlrequest.input('linkedin', sql.NVarChar, linkedin);
                sqlrequest.input('linkedin_persona', sql.NVarChar, linkedin_persona);
                let sql_query = `Update mercadeo_contactos SET nombre = @nombre, tipo = @tipo, email = @email, pais = @pais, cargo = @cargo, compania = @compania, usuario_modificacion = @UserID, telefono = @telefono, celular = @celular, ciudad = @ciudad, direccion = @direccion, region = @region, fmodificacion = @fingreso, active_contacto = @active_contacto, referencia = @referencia, web = @web, linkedin = @linkedin, linkedin_persona = @linkedin_persona
                where id = @RowID`
                sqlrequest.query(sql_query, (err, result) => {
                    if (err) {
                        console.log(err)
                        res.send({
                            RowID: 0,
                        });
                    } else {
                        if (err) {
                            console.log(err)
                            res.send({
                                RowID: RowID,
                            });
                        } else {
                            res.send({
                                RowID: RowID,
                            });
                        }
                    }
                })
            }
        }); //sql
    });
};