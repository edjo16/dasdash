import sql from 'mssql';
import { sqlConfig } from '../../dbConfig.js';
import CRMModel from '../model/CRM.js';
import { validateUserId } from "../../Middleware/validateUserId.js";
import CRMController from '../controllers/CRM.js';
import CRMPdfController from '../controllers/CRM_pdf.js';
import cron from 'node-cron';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import pkg from 'lodash';
import { nombres_latinos } from '../../fuctions-approvals.js';
import { requireAuth } from '../../Middleware/requireAuth.js';
import { sanitizeHtml } from '../../utils/sanitize-html.js';

export default function (app) {
    const { forEach, keysIn } = pkg;
    var titulo = "CRM - "
    const crm_dir = '//vps-file01/CRM/'

    app.get("/crm_main", validateUserId, async (req, res) => {
       await CRMController.getCRMGet(sqlConfig, req, res)
    });
    app.post('/crm_get_main', async function (req, res) {
        await CRMController.getCRMPost(sqlConfig, req, res);
    });
    app.post('/crm_download_excel', requireAuth, async function (req, res) {
        await CRMController.downloadExcel(sqlConfig, req, res);
    });

    app.get('/crm_filter_colleagues', requireAuth, async (req, res) => {
        await CRMController.getFilterColleagues(sqlConfig, req, res);
    });

    app.post('/crm_validate_access', async function (req, res) {
        try {
            const { crm_id, userid } = req.body;
            
            if (!crm_id || !userid) {
                return res.json({ result: 0, hasAccess: false, message: 'Missing required parameters' });
            }
            
            const validation = await CRMModel.validateCrmAccess(sqlConfig, crm_id, userid);
            res.json(validation);
        } catch (err) {
            console.error('Error in /crm_validate_access:', err);
            res.json({ result: 0, hasAccess: false, err: err.message });
        }
    });


    app.post('/crm_change_user', function (req, res, next) {
        var id = req.body.id
        var user = req.body.user
        var date = new Date()
        const offset = date.getTimezoneOffset()
        date = new Date(date.getTime() - (offset * 60 * 1000))
        date = date.toISOString().slice(0, 19).replace('T', ' ');
        sql.connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                throw err;
            } else {
                const request = new sql.Request();
                request.input('user', sql.VarChar, user);
                request.input('date', sql.VarChar, date);
                request.input('id', sql.Int, id);
                request.query(`update crm_main set u_asignado = @user, fasignado = @date where id = @id`, (err, result) => {
                    if (err) {
                        console.log(err)
                        res.send({ result: 0 })
                    } else {
                        res.send({ result: 1 })
                    }
                })
            }
        });
    });
    /**
     * @openapi
     * /crm_create_new_case:
     *   post:
     *     summary: Create a new CRM case
     *     description: |
     *       Creates a new CRM case with assigned users, priority, description and optional metadata.
     *       Sends email notifications to assigned users and returns the created case data.
     *       - Use Multipart so you can add file in files.Supportfiles array of binary files
     *     tags:
     *       - CRM ENDPOINTS
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - UserID
     *               - asignados
     *               - description
     *               - cprioridad
     *             properties:
     *               UserID:
     *                 type: string
     *                 description: ID of the user creating the case
     *                 example: "username16"
     *               asignados:
     *                 type: string
     *                 description: Semicolon-separated list of assigned user codes
     *                 example: "user01;user02;user03"
     *               description:
     *                 type: string
     *                 description: Description/body of the case
     *                 example: "Issue with policy renewal process"
     *               cprioridad:
     *                 type: integer
     *                 description: Priority level (0=Normal, 1=Important, 2=Urgent)
     *                 example: 1
     *               departamento_id:
     *                 type: integer
     *                 nullable: true
     *                 description: Department ID
     *               asunto_interno:
     *                 type: integer
     *                 nullable: true
     *                 description: Internal subject (can be a numeric case type ID)
     *               business_relationship:
     *                 type: string
     *                 nullable: true
     *                 description: Business relationship identifier
     *               finicio:
     *                 type: string
     *                 format: date-time
     *                 nullable: true
     *                 description: Start date in ISO format (e.g. 2024-01-15T09:00)
     *     responses:
     *       200:
     *         description: Case created successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 result:
     *                   type: integer
     *                   example: 1
     *                 id:
     *                   type: integer
     *                   description: Newly created CRM case ID
     *                 caseData:
     *                   type: object
     *                   properties:
     *                     id:
     *                       type: integer
     *                     xprioridad:
     *                       type: string
     *                       example: "Important"
     *                     cprioridad:
     *                       type: integer
     *                       example: 1
     *                     asunto_interno:
     *                       type: string
     *                     conversacion_titulo:
     *                       type: string
     *                     fecha_fin:
     *                       type: string
     *                       format: date
     *                     fecha_modificado:
     *                       type: string
     *                       nullable: true
     *                     fecha_ingreso:
     *                       type: string
     *                       format: date
     *                     user_asig:
     *                       type: string
     *                     xestado:
     *                       type: string
     *                       example: "Not started"
     *                     de_nombre:
     *                       type: string
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 error:
     *                   type: string
     *                   example: "Error message"
     */
    app.post('/crm_create_new_case', async function (req, res) {
        await CRMController.CreateNewCRM(sqlConfig, req, res)
    });
    app.post('/crm_notification_new_case', async function (req, res) {
        await CRMController.notificationNewCRM(sqlConfig, req, res)
    });
    app.get("/crm_msg", validateUserId, async (req, res) => {
        await CRMController.crm_main_detail(sqlConfig, req, res)
    });
    app.get('/crm-file', requireAuth, async (req, res) => {
        await CRMController.serveCrmFile(sqlConfig, req, res);
    });
    app.get('/crm-open-cmd', requireAuth, async (req, res) => {
        await CRMController.serveCrmOpenCmd(sqlConfig, req, res);
    });
    app.get('/crm-open-local', requireAuth, async (req, res) => {
        await CRMController.launchCrmOpenOnClient(sqlConfig, req, res);
    });
    app.get('/crm-open-backend', requireAuth, async (req, res) => {
        await CRMController.openCrmFromBackend(sqlConfig, req, res);
    });
    app.get('/crm-launch-file', requireAuth, async (req, res) => {
        await CRMController.launchCrmFile(sqlConfig, req, res);
    });
    // ── Visor de PDF (ver + escribir comentarios, sin firma) ──
    app.get('/crm-pdf/info', requireAuth, async (req, res) => {
        await CRMPdfController.getPdfInfo(sqlConfig, req, res);
    });
    app.get('/crm-pdf/file', requireAuth, async (req, res) => {
        await CRMPdfController.servePdfFile(sqlConfig, req, res);
    });
    app.post('/crm-pdf/text/apply', requireAuth, async (req, res) => {
        await CRMPdfController.applyTextWrites(sqlConfig, req, res);
    });
    app.get('/crm-msg-content', requireAuth, async (req, res) => {
        await CRMController.getCrmMsgContent(sqlConfig, req, res);
    });
    app.get('/crm-msg-attachment', requireAuth, async (req, res) => {
        await CRMController.getCrmMsgAttachment(sqlConfig, req, res);
    });
    app.post('/crm_get_case', async function (req, res) {
        await CRMController.getCrmCase(sqlConfig, req, res);
    });
    app.post('/crm_get_detail', async function (req, res, next) {
        const userId = req.session?.userID;
        if (!userId) {
            return res.status(401).json({ result: 0, error: 'Unauthorized' });
        }
        const validation = await CRMModel.validateCrmAccess(sqlConfig, req.body.crm_id, userId);
        if (!validation?.result || !validation?.hasAccess) {
            return res.status(403).json({ result: 0, error: 'Forbidden' });
        }
        CRMModel.getCrnDetails(sqlConfig, res, req)
            .then(crm => res.send(crm))
            .catch(console.error)
    });
    app.get('/crm_get_pending', async function (req, res, next) {
        var UserId = req.session?.userID
        let pool = await sql.connect(sqlConfig)
        let sql_query = `
        SELECT DISTINCT ca.id_main
        FROM crm_asignado ca 
        WHERE ca.uasignado = @UserId 
          AND EXISTS (
            SELECT 1 FROM crm_main_estado cme 
            LEFT JOIN crm_mestados me ON me.cestado = cme.cestado 
            WHERE cme.id_main = ca.id_main 
              AND cme.cdepartamento = ca.cdepartamento 
              AND me.ctype IN (0, 1)
          )
        `
        let crm_pending = await pool.request()
            .input('UserId', sql.VarChar, UserId)
            .query(sql_query)
        res.send({ result: 1, crm_pending })
    });
    app.post('/crm_get_asigned', function (req, res, next) {
        CRMModel.getCrmAssigned(sqlConfig, res, req)
            .then(crm => res.send(crm))
            .catch(console.error)
    });
    app.post('/crm_fill_estados', function (req, res, next) {
        var crm_id = req.body.crm_id
        var dep = req.body.cdepartamento
        sql.connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                res.send({ result: 0, err })
            } else {
                sqlrequest = new sql.Request()
                sqlrequest.input('crm_id', sql.Int, crm_id);
                sqlrequest.input('dep', sql.Int, dep);
                sqlrequest.query(`
                SELECT cme.cestado, mdep.nombre AS xdepartamento, me.xnombre AS xestado FROM crm_main_estado cme
                LEFT JOIN mdepartamento mdep ON mdep.id = cme.cdepartamento
                LEFT JOIN crm_mestados me ON me.cestado = cme.cestado
                where cme.id_main = @crm_id AND cme.cdepartamento = @dep
                `, (err, result) => {
                    estados = result.recordset
                    res.send({ result: 1, estados })
                })
            }
        });
    });
    app.post('/crm_get_estados', function (req, res, next) {
        var xdepartamento = req.body.dep
        sql.connect(sqlConfig, err => {
            if (err) {
                console.log(err);
                res.send({ result: 0, err })
            } else {
                sqlrequest = new sql.Request()
                sqlrequest.input('xdepartamento', sql.VarChar, xdepartamento);
                sqlrequest.query(`
                SELECT id AS cdepartamento FROM mdepartamento
                WHERE nombre = @xdepartamento
                `, (err, result) => {
                    if (err) {
                        console.log(err);
                        res.send({ result: 0, err })
                    } else {
                        cdepartamento = result.recordset[0].cdepartamento
                        sqlrequest = new sql.Request()
                        sqlrequest.input('cdepartamento', sql.VarChar, cdepartamento);
                        sqlrequest.query(`
                        SELECT * FROM crm_mestados e
                        WHERE e.cdepartamento = @cdepartamento OR e.cdepartamento = 0
                        order by estado_orden
                        `, (err, result) => {
                            if (err) {
                                console.log(err);
                                res.send({ result: 0, err })
                            } else {
                                estados = result.recordset
                                res.send({ result: 1, estados })
                            }
                        })
                    }
                })
            }
        });
    });
    app.post('/crm_get_estados_x_departamento', function (req, res, next) {
        CRMModel.getStateForDepartamento(sqlConfig, res, req)
            .then(data => res.send(data))
            .catch((err) => res.send({ result: 0, err }))
    });
    app.post('/crm_cambio_estado', async function (req, res, next) {
        await CRMController.changeState(sqlConfig, req, res);
    });
    app.post('/crm_msg_insert', function (req, res, next) {
        CRMModel.crmMsgInsert(sqlConfig, res, req)
            .then(data => res.send(data))
            .catch((err) => res.send({ result: 0, err }))
    });
    app.post('/crm_show_asignar', function (req, res, next) {
        CRMModel.getAssigned(sqlConfig, res, req)
            .then(crm => res.send(crm))
            .catch((err) => res.send({ result: 0, err }))
    });
    app.post('/crm_getusuarios', async function (req, res, next) {
        await CRMModel.getUserCRMUsers(sqlConfig, res, req)
            .then(usuarios => res.send({ result: 1, usuarios }))
            .catch((err) => res.send({ result: 0, err }))
    });
    app.post('/get_usuarios', async function (req, res) {
        await CRMController.getUsuario(sqlConfig, req, res)            
    });
    app.post('/crm_add_sirdata',  async function (req, res, next) {
         await CRMModel.addSirdata(sqlConfig, res, req)
    });
    app.post('/crm_get_sirdata', function (req, res, next) {
        CRMModel.getCrmSirData(sqlConfig, res, req)
            .then(crm => res.send(crm))
            .catch((e) => res.send({ result: 0, e }))
    })
    app.post('/crm_add_casdata', async function (req, res, next) {
        await CRMModel.addCasdata(sqlConfig, res, req)
    });
    app.post('/crm_get_casdata', function (req, res, next) {
        CRMModel.getCrmCasData(sqlConfig, res, req)
            .then(data => res.send(data))
            .catch((e) => res.send({ result: 0, e }))
    });
    app.post('/crm_casdata_delete', async function(req, res) {
        await CRMModel.deleteCasdata(sqlConfig, res, req)
    });
    app.post('/crm_add_asignado', async function (req, res, next) {
        await CRMModel.addAsigneds(sqlConfig, res, req)
        .then(crm => res.send(crm))
        .catch((err) => res.send({ result: 0, err }))
    });
    app.post('/crm_remove_user', async function (req, res, next) {
        await CRMModel.crmRemoveUser(sqlConfig, res, req)
            .then(data => res.send(data))
            .catch((err) => res.send({ result: 0, err }))
    });

    // Update CRM start date (finicio) and log message
    app.post('/update_start_date', async function (req, res) {
        await CRMModel.updateStartDate(sqlConfig, res, req)
            .then(data => res.send(data))
            .catch((err) => res.send({ result: 0, err }))
    });

    // Update CRM due date (ffin) and log message
    app.post('/update_due_date', async function (req, res) {
        await CRMModel.updateDueDate(sqlConfig, res, req)
            .then(data => res.send(data))
            .catch((err) => res.send({ result: 0, err }))
    });

    // Update CRM business relationship
    app.post('/crm_update_business_relationship', async function (req, res) {
        const { crm_id, b_relation_id, UserName } = req.body;
        if (!crm_id || !UserName) return res.status(400).json({ result: 0, err: 'Missing required fields' });
        const result = await CRMModel.updateBusinessRelationship(sqlConfig, crm_id, b_relation_id || null, UserName);
        res.json(result);
    });

    app.post('/create_email_by_pending_crm_tasks', async (req, res)=> {
        await CRMController.createEmailByPendingCRMTasks(sqlConfig, req, res)
    });

    // cron.schedule('0 9 * * *', async (req, res) => {
    //     try {
    //         await CRMController.createEmailByPendingCRMTasks(sqlConfig, req, res);
    //         console.log('Scheduled task executed successfully');
    //     } catch (error) {
    //         console.error('Error executing scheduled task:', error);
    //     }
    // });

    app.post('/crm_send_recent_messages_digest', async (req, res) => {
        await CRMController.sendRecentMessagesDigest(sqlConfig, req, res);
    });

    cron.schedule('*/30 * * * *', async () => {
        try {
            await CRMController.sendRecentMessagesDigest(sqlConfig, null, null);
            console.log('CRM recent messages digest sent successfully');
        } catch (error) {
            console.error('Error sending CRM recent messages digest:', error);
        }
    });
    
    app.post('/crm_archivo_favorite', async function(req, res) {
        try {
            let pool = await sql.connect(sqlConfig);
            const { id_main, id_msg, xname, favorites } = req.body;
            await pool.request()
                .input('id_main', sql.Int, id_main)
                .input('id_msg', sql.Int, id_msg)
                .input('xname', sql.VarChar, xname)
                .input('favorites', sql.Bit, favorites)
                .query('UPDATE crm_archivos SET favorites = @favorites WHERE id_main = @id_main AND id_msg = @id_msg AND xname = @xname');
            res.send({ result: 1 });
        } catch (error) {
            res.send({ result: 0, error });
        }
    });
    
    app.post('/form_crm_new_msg', async function(req, res, next) {
            try {
                let pool = await sql.connect(sqlConfig)
                var UserID = req.body.UserID
                var UserName = req.body.UserName
                var crm_id = req.body.crm_id
                var description = sanitizeHtml(req.body.description)
                // Obtener departamentos donde el usuario sea manager
                let sql_query = `SELECT COUNT(*) id_msg FROM dbo.crm_msg WHERE id_main = @crm_id`
                let crm_msg = await pool.request()
                    .input('crm_id', sql.Int, crm_id)
                    .query(sql_query)
                let id_msg = crm_msg.recordset[0].id_msg + 1
                sql_query = `INSERT INTO approvals.dbo.crm_msg
                (id_mensaje, id_main, fingreso, nombre_mensaje, body_mensaje, id_msg, de_nombre, ms_process, para_correo, to_procesado, ms_filename, de_correo, para_nombre, ctipo)
                VALUES('', @crm_id, getdate(), 'New comment', @description, @id_msg, @UserName, 0, Null, 0, '', '', '', 1);`
                var insert = await pool.request()
                    .input('crm_id', sql.Int, crm_id)
                    .input('description', sql.VarChar, description)
                    .input('id_msg', sql.Int, id_msg)
                    .input('UserName', sql.VarChar, UserName)
                    .query(sql_query)
                try {
                    if (req.files && req.files.Supportfiles) {
                        var folderPath = join(crm_dir, String(crm_id));  
                        if (!existsSync(folderPath)) {
                            mkdirSync(folderPath);
                        }
                        var folderPath = join(crm_dir, String(crm_id), String(id_msg));   
                        if (!existsSync(folderPath)) {
                            mkdirSync(folderPath);
                        } 
                        if (req.files.Supportfiles.name) {
                            let file = req.files.Supportfiles;
                            let filename = nombres_latinos(file.name)
                            sql_query = `insert into crm_archivos (id_main, id_msg, xname)
                            VALUES (@crm_id, @id_msg, @xname)`
                            var insert = await pool.request()
                                .input('crm_id', sql.Int, crm_id)
                                .input('id_msg', sql.Int, id_msg)
                                .input('xname', sql.VarChar, filename)
                                .query(sql_query)
                            var filePath = join(folderPath, filename);
                            file.mv(filePath);
                        } else {
                            forEach(keysIn(req.files.Supportfiles), (key) => {
                                let file = req.files.Supportfiles[key];
                                let filename = nombres_latinos(file.name)
                                sql_query = `insert into crm_archivos (id_main, id_msg, xname)
                                VALUES (@crm_id, @id_msg, @xname)`
                                var insert = pool.request()
                                    .input('crm_id', sql.Int, crm_id)
                                    .input('id_msg', sql.Int, id_msg)
                                    .input('xname', sql.VarChar, filename)
                                    .query(sql_query)
                                var filePath = join(folderPath, filename);
                                file.mv(filePath);
                            });
                        }
                    }                    
                } catch (error) {
                    console.log(error)                
                }
                await pool.request()
                    .input('crm_id', sql.Int, crm_id)
                    .query(`UPDATE crm_main SET fmodificado = getdate() WHERE id = @crm_id`)
                res.send({ result: 1 })
            } catch (error) {
                console.log(error)
                res.send({ result: 0 })
            }
        });

        
    app.post("/deparment-users", async (req, res) => {
        await CRMController.readUsersByDepartment(sqlConfig, req, res)
    })

    // Rutas para manejar relaciones CRM-Approval
    app.get('/crm_get_approval_relations', async (req, res) => {
        try {
            const { crm_id } = req.query;
            const result = await CRMModel.getApprovalCrmRelations(sqlConfig, crm_id);
            res.send(result);
        } catch (err) {
            console.error(err);
            res.send({ result: 0, err: err.message });
        }
    });

    app.post('/add_approval_crm_reference', async (req, res) => {
        try {
            const result = await CRMModel.addApprovalCrmRelations(sqlConfig, req, res);
            res.send(result);
        } catch (err) {
            console.error(err);
            res.send({ result: 0, err: err.message });
        }
    });

    app.post('/remove_approval_crm_reference', async (req, res) => {
        try {
            const result = await CRMModel.removeApprovalCrmRelation(sqlConfig, req, res);
            res.send(result);
        } catch (err) {
            console.error(err);
            res.send({ result: 0, err: err.message });
        }
    });

    app.get('/crm_get_crm_relations', async (req, res) => {
        try {
            const { crm_id } = req.query;
            const result = await CRMModel.getCrmCrmRelations(sqlConfig, crm_id);
            res.send(result);
        } catch (err) {
            console.error(err);
            res.send({ result: 0, err: err.message });
        }
    });

    app.post('/add_crm_crm_reference', async (req, res) => {
        try {
            const result = await CRMModel.addCrmCrmRelations(sqlConfig, req, res);
            res.send(result);
        } catch (err) {
            console.error(err);
            res.send({ result: 0, err: err.message });
        }
    });

    app.post('/remove_crm_crm_reference', async (req, res) => {
        try {
            const result = await CRMModel.removeCrmCrmRelation(sqlConfig, req, res);
            res.send(result);
        } catch (err) {
            console.error(err);
            res.send({ result: 0, err: err.message });
        }
    });
    app.post('/crm_sirdata_delete', async function(req, res) {
        try {
            const { tabla, sir_id, crm_main, userid } = req.body
            const pool = await sql.connect(sqlConfig)
            const principal = String(sir_id).split('-')[0]
            const endoso = String(sir_id).split('-')[1]
            const crm_tag = ';' + crm_main + ';'
            const tableMap = {
                'Cover Note':     { table: 'sir_dnota',      where: 'cnota = @p1 AND cendoso = @p2', p2: true  },
                'Offers':         { table: 'sir_dllamada',   where: 'cllamada = @p1',                p2: false },
                'Claims Reserve': { table: 'sir_daper',      where: 'caviso = @p1 AND cn_stro = @p2',p2: true  },
                'Claim Payment':  { table: 'sir_dcomp',      where: 'caviso = @p1 AND cn_stro1 = @p2',p2: true },
                'Claims':         { table: 'sir_crcpsinpend',where: 'idcontrol = @p1 AND cn_stro = @p2',p2: true },
                'Remittances':    { table: 'sir_paingreso',  where: 'cingreso = @p1',                p2: false },
                'Treaty':         { table: 'sir_crcp',       where: 'cncontrato = @p1',              p2: false },
            }
            const def = tableMap[tabla]
            if (!def) return res.send({ result: 0 })
            let req2 = pool.request()
                .input('crm_tag', sql.VarChar, crm_tag)
                .input('userid', sql.VarChar, userid)
                .input('p1', sql.VarChar, principal)
            if (def.p2) req2 = req2.input('p2', sql.VarChar, endoso)
            await req2.query(`UPDATE ${def.table}
                SET crm_id = REPLACE(crm_id, @crm_tag, ';'),
                    fmodificado = getdate(), umodificado = @userid
                WHERE ${def.where}`)
            // Treaty también actualiza sir_crcnp
            if (tabla === 'Treaty') {
                await pool.request()
                    .input('crm_tag', sql.VarChar, crm_tag)
                    .input('userid', sql.VarChar, userid)
                    .input('p1', sql.VarChar, principal)
                    .query(`UPDATE sir_crcnp
                        SET crm_id = REPLACE(crm_id, @crm_tag, ';'),
                            fmodificado = getdate(), umodificado = @userid
                        WHERE cncontrato = @p1`)
            }
            res.send({ result: 1 })
        } catch (error) {
            console.log(error)
            res.send({ result: 0 })
        }
    })

    app.get('/crm_main_cases_type', async function (req, res) {
        await CRMController.renderCasesTypes(sqlConfig, req, res)
    });

    app.post("/cases_type-list",requireAuth, async (req, res) => {
        await CRMController.listCaseTypes(sqlConfig, req, res)
    })

    app.get("/case-type-detail-json",requireAuth, async (req, res) => {
        await CRMController.getCRMCaseDetailJson(sqlConfig, req, res)
    })

    app.post("/add_case_type",requireAuth, async (req, res) => {
        await CRMController.addCRMCaseType(sqlConfig, req, res)

    })

    app.get("/case-types-dropdown", requireAuth, async (req, res) => {
        await CRMController.getCaseTypesForDropdown(sqlConfig, req, res)
    })
    app.get("/case-types-outlook", async (req, res) => {
        await CRMController.getCaseTypesForOutlook(sqlConfig, req, res)
    })
};