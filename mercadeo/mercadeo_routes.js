import express from "express";
import { request } from "http";
import path from "path";
import fs from 'fs';
import { connect } from "http2";
import https from 'https';
import _ from "lodash";
import { get_menu } from '../functions.js';
import sql from 'mssql'; 
import pkg from "crypto-js";
import { sqlConfig } from "../dbConfig.js";
import Rules from '../USERS/rule/DevTeam.js';
import EventsController from '../mercadeo/controllers/events.js';
import MeetingsController from '../mercadeo/controllers/Meetings.js';
import { requireAuth } from "../Middleware/requireAuth.js"
export default function(app) {
    const { connect: _connect, Request } = sql;
    app.get("/mercadeo_contactos", async (req, res) => {
        const UserID = req.session?.userID
        let devteam = await Rules.validateTeam(req.session?.iddevteam,UserID)
        var grupousuarios = []
        _connect(sqlConfig, err => {
                if (err) {
                    console.log(err);
                    throw err;
                }
                if (UserID == undefined) {
                    res.redirect("/sinID");
                } else {
                    // Query usuario
                    const userReq = new Request();
                    userReq.input('UserID', sql.VarChar, UserID);
                    userReq.query(`SELECT TOP 1 * FROM Users 
                LEFT JOIN (SELECT cast(ccompania AS VARCHAR(10)) as ccompania, xnombre, xlogo FROM companias) AS c 
                ON Users.compania LIKE '%' + c.ccompania + '%'
                WHERE UserID = @UserID`, (err, result) => {
                        if (result == undefined) {
                            res.redirect("/sinID");
                        } else {
                            let UserName = result.recordset[0].Name
                            let UserEmail = result.recordset[0].Email
                            let Modules = result.recordset[0].Modules
                            var Menu = {}
                            Menu = get_menu(result)
                            console.log(Menu.logo)
                            new Request().query("SELECT Name, UserID FROM Users WHERE Name is NOT NULL order by Name asc", (err, result) => {
                     
                                if (devteam) {
                                    for (let u = 0; u < result.recordset.length; u++) {
                                        grupousuarios.push([result.recordset[u].UserID, result.recordset[u].Name])
                                    }
                                }
                                // Query Total
                                new Request().query(`SELECT * from mercadeo_union_contactos order by contacto`, (err, result) => {
                                    // Estado en progreso
                                    var a = []
                                    var b = []
                                    var c = []
                                    var d = []
                                    for (let i = 0; i < result.rowsAffected; i++) {
                                        a.push([
                                            result.recordset[i].contacto,
                                            result.recordset[i].email,
                                            result.recordset[i].compania,
                                            result.recordset[i].tipo,
                                            result.recordset[i].ramo,
                                            result.recordset[i].pais,
                                            result.recordset[i].region,
                                            result.recordset[i].cargo,
                                            result.recordset[i].ubicacion
                                        ])
                                        b.push(result.recordset[i].email)
                                        c.push(result.recordset[i].ubicacion)
                                        d.push(result.recordset[i].id)
                                    }
                                    res.render("mercadeo_contactos", {
                                        title: "Contacts",
                                        userProfile: {
                                            UserName: UserName,
                                            UsuarioID: UserID
                                        },
                                        contactos: a,
                                        email: b,
                                        ubicacion: c,
                                        id: d,
                                        userMenu: Menu,
                                        usuarios: grupousuarios,
                                        devteam: devteam
                                    });
                                });
                            }); // Usuarios DevTeam
                        } //else user
                    }); // select user
                }
            }) // sql connect
    });
    app.post('/mecardeo_exp_main', function(req, res, next) {
        var valores = []
        var cols = []
        let companyVal = req.body.companyVal
        let typeVal = req.body.typeVal
        let businessLineVal = req.body.businessLineVal
        let countryVal = req.body.countryVal
        let regionsVal = req.body.regionsVal
        let nameVal = req.body.nameVal
        let emailVal = req.body.emailVal
        let positionVal = req.body.positionVal
        let locationVal = req.body.locationVal
        cols.push('compania', 'tipo', 'ramo', 'pais', 'region', 'contacto', 'email', 'cargo', 'ubicacion')
        valores.push(companyVal, typeVal, businessLineVal, countryVal, regionsVal, nameVal, emailVal, positionVal, locationVal)
        var date = new Date()
        const offset = date.getTimezoneOffset()
        date = new Date(date.getTime() - (offset * 60 * 1000))
        date = date.toISOString().slice(0, 19).replace('T', ' ');
        sql.connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                throw err;
            } else {
                new sql.Request().query(`delete from mercadeo_tmp_exp`, (err, result) => {
                    if (err) {
                        console.log(err)
                        res.send({ result: 0 })
                    } else {
                        const expReq = new sql.Request();
                        const paramNames = [];
                        for (let i = 0; i < valores.length; i++) {
                            if (valores[i] != '') {
                                const paramName = `p${i}`;
                                paramNames.push(`${cols[i]} LIKE @${paramName}`);
                                expReq.input(paramName, sql.VarChar, `%${valores[i]}%`);
                            }
                        }
                        let conditions = paramNames.length > 0 ? `WHERE ${paramNames.join(' AND ')}` : '';
                        expReq.query(`INSERT INTO dbo.mercadeo_tmp_exp
                        SELECT DISTINCT contacto AS Name, email AS Email, pais AS Country, compania AS Company, cargo AS Position, tipo AS Type, ramo AS 'Business Line', ubicacion AS location 
                        FROM (SELECT c.compania, mt.xnombre AS tipo, c.ramo, pais, region, c.contacto, c.email, NULL AS cargo, CONVERT(VARCHAR,ccedente) + ' SIR' AS ubicacion FROM dbo.sir_contactos AS c LEFT JOIN mercadeo_tipos AS mt ON mt.tipo = c.tipo UNION SELECT compania, mt.xnombre AS tipo, NULL AS ramo, xnombre_pais_ingles AS pais, xdescripcion_l AS region, nombre, email, cargo, 'MER' AS ubicacion FROM dbo.mercadeo_contactos AS c LEFT JOIN mercadeo_tipos AS mt ON mt.tipo = c.tipo LEFT JOIN sir_mpais AS mpais ON mpais.cpais = convert(VARCHAR,c.pais)) AS tmpp 
                        ${conditions}`, (err, result) => {
                            if (err) {
                                console.log(err)
                                res.send({ result: 0 })
                            } else {
                                res.send({ result: 1 })
                            }
                        })
                    }
                })
            }
        });
    });
    app.post('/mercadeo_contacto_existe', function(req, res, next) {
        email = req.body.email
        sql.connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                throw err;
            } else {
                const emailReq = new sql.Request();
                emailReq.input('email', sql.VarChar, email);
                emailReq.query(`select * from mercadeo_union_contactos where email = @email`, (err, result) => {
                    if (err) {
                        console.log(err)
                        res.send({ result: 0 })
                    } else {
                        if (result.recordset.length < 1) {
                            res.send({ result: 1 })
                        } else {
                            res.send({ result: 2 })
                        }
                    }
                })
            }
        })
    })
    app.post('/mercadeo_delete_contactos', function(req, res, next) {
        valores = req.body.id
        _connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                throw err;
            } else {
                var date = new Date()
                const offset = date.getTimezoneOffset()
                    //eliminados en los ultimos 5min
                date = new Date(date.getTime() - (offset * 60 * 1000))
                date = date.toISOString().slice(0, 19).replace('T', ' ');
                const delReq = new Request();
                delReq.input('date', sql.VarChar, date);
                const paramNames = [];
                for (let i = 0; i < valores.length; i++) {
                    if (valores[i] !== '') {
                        const paramName = `id${i}`;
                        paramNames.push(`@${paramName}`);
                        delReq.input(paramName, sql.VarChar, valores[i]);
                    }
                }
                if (paramNames.length === 0) return res.send({ result: 0 });
                delReq.query(`UPDATE mercadeo_contactos SET feliminacion = @date WHERE id IN (${paramNames.join(',')})`, (err, result) => {
                    if (err) {
                        console.log(err)
                        res.send({ result: 0 })
                    } else {
                        res.send({ result: result.rowsAffected[0] })
                    }
                })
            }
        })
    })
    app.post('/mercadeo_contactos_eliminados', function(req, res, next) {
        _connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                throw err;
            } else {
                var date = new Date()
                const offset = date.getTimezoneOffset()
                    //eliminados en los ultimos 5min
                date = new Date(date.getTime() - (offset * 60 * 1000) - (6 * 60 * 1000))
                date = date.toISOString().slice(0, 19).replace('T', ' ');
                console.log(date)
                const countReq = new Request();
                countReq.input('date', sql.VarChar, date);
                countReq.query(`select count(*) as count from mercadeo_contactos where feliminacion > @date`, (err, result) => {
                    if (err) {
                        console.log(err)
                        res.send({ result: 0 })
                    } else {
                        res.send({ result: result.recordset[0].count })
                    }
                })
            }
        })
    })
    app.post('/restaurar_contactos_eliminados', function(req, res, next) {
        _connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                throw err;
            } else {
                var date = new Date()
                const offset = date.getTimezoneOffset()
                    //eliminados en los ultimos 5min
                date = new Date(date.getTime() - (offset * 60 * 1000) - (60 * 60 * 1000))
                date = date.toISOString().slice(0, 19).replace('T', ' ');
                const restoreReq = new Request();
                restoreReq.input('date', sql.VarChar, date);
                restoreReq.query(`update mercadeo_contactos set feliminado = NULL where feliminacion > @date`, (err, result) => {
                    if (err) {
                        console.log(err)
                        res.send({ result: 0 })
                    } else {
                        console.log(result.recordset[0].count)
                        res.send({
                            result: console.log(result.recordset[0].count)
                        })
                    }
                })
            }
        })
    })
    app.get("/forms_marketing_events_list",requireAuth, async (req, res) => {
        await EventsController.getInitialEvents(sqlConfig, req, res)
    })
    app.get("/get_forms_marketing_events", async (req, res, next) => {
        await EventsController.getEventsFormList(sqlConfig, req, res)
    })
    app.get("/forms_marketing_events", async (req, res) => {
        await EventsController.getEventsForm(sqlConfig, req, res)
    })
    app.post("/forms_marketing_events", async (req, res) => {
        await EventsController.postEventsForm(sqlConfig, req, res)
    })
    app.get("/get_forms_marketing_events/:id",requireAuth, async (req, res) => {
        await EventsController.readFormById(sqlConfig, req, res)
    })
    app.get("/get_forms_events/:id", async (req, res) => {
        await EventsController.getFormById(sqlConfig, req, res)
    })
    app.put("/forms_marketing_events/:id", async (req, res) => {
        await EventsController.updateEventForm(sqlConfig, req, res)
    })
    app.post("/post_pdf_forms_marketing_events/:id", async (req, res) => {
        await EventsController.updateEventPDF(sqlConfig, req, res)
    })
    app.get("/forms_marketing_events_report/:id", async (req, res) => {
        await EventsController.getEventReport(sqlConfig, req, res)
    })
    app.get("/get_forms_events_report/:id", async (req, res) => {
        await EventsController.getReportData(sqlConfig, req, res)
    })
    app.post("/events_resume/:event_id", async (req, res) => {
        req.body.event_id = req.params.event_id;
        await EventsController.saveResume(sqlConfig, req, res)
    })
    app.post("/events_meeting_action", async (req, res) => {
        await EventsController.saveMeetingAction(sqlConfig, req, res)
    })
    app.delete("/events_meeting_action/:id", async (req, res) => {
        await EventsController.deleteMeetingAction(sqlConfig, req, res)
    })
    app.put("/events_meeting_action/:id", async (req, res) => {
        await EventsController.updateMeetingAction(sqlConfig, req, res)
    })
    app.post("/events_close_report/:id", async (req, res) => {
        await EventsController.closeReport(sqlConfig, req, res)
    })
    app.post("/events_action_contact", async (req, res) => {
        await EventsController.saveActionContact(sqlConfig, req, res)
    })
    app.delete("/events_action_contact", async (req, res) => {
        await EventsController.deleteActionContact(sqlConfig, req, res)
    })
    app.post("/events_action_responsible", async (req, res) => {
        await EventsController.saveActionResponsible(sqlConfig, req, res)
    })
    app.delete("/events_action_responsible", async (req, res) => {
        await EventsController.deleteActionResponsible(sqlConfig, req, res)
    })

    // ── Standalone Meetings ────────────────────────────────────────────────
    app.get("/meetings_list", requireAuth, async (req, res) => {
        await MeetingsController.getMeetingsList(sqlConfig, req, res)
    })
    app.get("/get_meetings", async (req, res) => {
        await MeetingsController.getMeetingsData(sqlConfig, req, res)
    })
    app.get("/meetings/:id", async (req, res) => {
        await MeetingsController.getMeetingDetail(sqlConfig, req, res)
    })
    app.post("/meetings", async (req, res) => {
        await MeetingsController.createMeeting(sqlConfig, req, res)
    })
    app.put("/meetings/:id", async (req, res) => {
        await MeetingsController.updateMeeting(sqlConfig, req, res)
    })
    app.delete("/meetings/:id", async (req, res) => {
        await MeetingsController.deleteMeeting(sqlConfig, req, res)
    })
    app.post("/meetings_action", async (req, res) => {
        await MeetingsController.saveMeetingAction(sqlConfig, req, res)
    })
    app.delete("/meetings_action/:id", async (req, res) => {
        await MeetingsController.deleteMeetingAction(sqlConfig, req, res)
    })
    app.put("/meetings_action/:id", async (req, res) => {
        await MeetingsController.updateMeetingAction(sqlConfig, req, res)
    })
    app.post("/meetings_action_contact", async (req, res) => {
        await MeetingsController.saveActionContact(sqlConfig, req, res)
    })
    app.delete("/meetings_action_contact", async (req, res) => {
        await MeetingsController.deleteActionContact(sqlConfig, req, res)
    })
    app.post("/meetings_action_responsible", async (req, res) => {
        await MeetingsController.saveActionResponsible(sqlConfig, req, res)
    })
    app.delete("/meetings_action_responsible", async (req, res) => {
        await MeetingsController.deleteActionResponsible(sqlConfig, req, res)
    })
    app.post("/meetings_close/:id", async (req, res) => {
        await MeetingsController.closeMeeting(sqlConfig, req, res)
    })
};