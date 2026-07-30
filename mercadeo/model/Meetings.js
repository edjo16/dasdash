import sql from 'mssql';
import { convertToDate } from '../../Approvals_functions/functions.js';

export default class MeetingsModel {

  // ── List ─────────────────────────────────────────────────────────────────
  static async getAllMeetings(transaction, userId, devteam, limit, offset, search) {
    const request = new sql.Request(transaction);
    let query = `SELECT id, meeting_name, meeting_address, meeting_comments,
      uingreso, FORMAT(fingreso,'dd/MM/yyyy') AS fingreso
      FROM event_meetings WHERE 1=1`;
    if (!devteam) {
      query += ` AND uingreso = @userId`;
      request.input('userId', sql.VarChar, userId);
    }
    if (search) {
      query += ` AND (meeting_name LIKE @search OR meeting_address LIKE @search)`;
      request.input('search', sql.VarChar, `%${search}%`);
    }
    query += ` ORDER BY fingreso DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    request.input('limit',  sql.Int, limit);
    request.input('offset', sql.Int, offset);
    const { recordset } = await request.query(query);
    return recordset;
  }

  static async getTotalCount(transaction, userId, devteam, search) {
    const request = new sql.Request(transaction);
    let query = `SELECT COUNT(*) AS totalCount FROM event_meetings WHERE 1=1`;
    if (!devteam) {
      query += ` AND uingreso = @userId`;
      request.input('userId', sql.VarChar, userId);
    }
    if (search) {
      query += ` AND (meeting_name LIKE @search OR meeting_address LIKE @search)`;
      request.input('search', sql.VarChar, `%${search}%`);
    }
    const { recordset } = await request.query(query);
    return recordset[0].totalCount;
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────
  static async getMeetingById(transaction, id) {
    const { recordset } = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`SELECT * FROM event_meetings WHERE id = @id`);
    return recordset[0];
  }

  static async createMeeting(transaction, data) {
    const { meeting_name, meeting_address, meeting_comments, user_created } = data;
    const { recordset } = await new sql.Request(transaction)
      .input('meeting_name',     sql.NVarChar, meeting_name)
      .input('meeting_address',  sql.NVarChar, meeting_address  || null)
      .input('meeting_comments', sql.NVarChar, meeting_comments || null)
      .input('uingreso',     sql.VarChar,  user_created)
      .query(`INSERT INTO event_meetings (meeting_name, meeting_address, meeting_comments, uingreso, fingreso)
        OUTPUT INSERTED.id
        VALUES (@meeting_name, @meeting_address, @meeting_comments, @uingreso, GETDATE())`);
    return recordset[0];
  }

  static async updateMeeting(transaction, id, data) {
    await new sql.Request(transaction)
      .input('id',               sql.Int,      id)
      .input('meeting_name',     sql.NVarChar, data.meeting_name     || null)
      .input('meeting_address',  sql.NVarChar, data.meeting_address  || null)
      .input('meeting_comments', sql.NVarChar, data.meeting_comments || null)
      .input('umodificado', sql.VarChar, data.umodificado || null)
      .query(`UPDATE event_meetings SET
        meeting_name=@meeting_name, meeting_address=@meeting_address,
        meeting_comments=@meeting_comments, fmodificado=GETDATE(), umodificado=@umodificado WHERE id=@id`);
    return { result: 1 };
  }

  static async deleteMeeting(transaction, id) {
    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`DELETE FROM event_meetings WHERE id=@id`);
    return { result: 1 };
  }

  // ── Action Points ─────────────────────────────────────────────────────────
  static async getActions(transaction, meeting_id) {
    const { recordset } = await new sql.Request(transaction)
      .input('meeting_id', sql.Int, meeting_id)
      .query(`SELECT a.*,
        FORMAT(a.meet_date,'yyyy-MM-dd') AS meet_date_fmt,
        FORMAT(a.due_date,'yyyy-MM-dd')  AS due_date_fmt
        FROM events_meetings_actions a
        WHERE a.meeting_id = @meeting_id
        ORDER BY a.id ASC`);
    return recordset;
  }

  static async upsertAction(transaction, data) {
    const { id, meeting_id, action_points, meeting_details, priority, uingreso } = data;
    const toDate = (v) => v ? (v.includes('/') ? convertToDate(v) : v) : null;
    const meet_date = toDate(data.meet_date);
    const due_date  = toDate(data.due_date);
    if (id) {
      await new sql.Request(transaction)
        .input('id',              sql.Int,     id)
        .input('action_points',   sql.VarChar,  action_points   || null)
        .input('meeting_details', sql.VarChar,  meeting_details || null)
        .input('meet_date',       sql.Date,     meet_date       || null)
        .input('due_date',        sql.Date,     due_date        || null)
        .input('priority',        sql.Int,      priority != null ? parseInt(priority) : null)
        .input('uingreso',        sql.VarChar,  uingreso)
        .query(`UPDATE events_meetings_actions SET
          action_points=@action_points, meeting_details=@meeting_details,
          meet_date=@meet_date, due_date=@due_date, priority=@priority,
          user_updated=@uingreso, fmodificado=GETDATE(), umodificado=@uingreso
          WHERE id=@id`);
      return { id };
    } else {
      const { recordset } = await new sql.Request(transaction)
        .input('meeting_id',      sql.Int,      meeting_id)
        .input('action_points',   sql.VarChar,  action_points   || null)
        .input('meeting_details', sql.VarChar,  meeting_details || null)
        .input('meet_date',       sql.Date,     meet_date       || null)
        .input('due_date',        sql.Date,     due_date        || null)
        .input('priority',        sql.Int,      priority != null ? parseInt(priority) : null)
        .input('created_by',      sql.VarChar,  uingreso)
        .input('uingreso',        sql.VarChar,  uingreso)
        .query(`INSERT INTO events_meetings_actions
          (meeting_id, action_points, meeting_details, meet_date, due_date, priority, created_by, uingreso, fingreso)
          OUTPUT INSERTED.id
          VALUES (@meeting_id, @action_points, @meeting_details, @meet_date, @due_date, @priority, @created_by, @uingreso, GETDATE())`);
      return { id: recordset[0].id };
    }
  }

  static async deleteAction(transaction, id) {
    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`DELETE FROM events_meetings_actions WHERE id=@id AND crm_id IS NULL`);
    return { result: 1 };
  }

  static async updateAction(transaction, id, data) {
    const toDate = (v) => v ? (v.includes('/') ? convertToDate(v) : v) : null;
    await new sql.Request(transaction)
      .input('id',              sql.Int,      id)
      .input('meeting_details', sql.VarChar,  data.meeting_details || null)
      .input('meet_date',       sql.Date,     toDate(data.meet_date))
      .input('action_points',   sql.VarChar,  data.action_points   || null)
      .input('due_date',        sql.Date,     toDate(data.due_date))
      .input('priority',        sql.Int,      data.priority        || null)
      .input('umodificado',     sql.VarChar,  data.user_updated    || null)
      .query(`UPDATE events_meetings_actions SET
        meeting_details=@meeting_details, meet_date=@meet_date,
        action_points=@action_points, due_date=@due_date,
        priority=@priority, fmodificado=GETDATE(), umodificado=@umodificado
        WHERE id=@id AND crm_id IS NULL`);
    return { result: 1 };
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  static async getActionContactsByMeeting(transaction, meeting_id) {
    const { recordset } = await new sql.Request(transaction)
      .input('meeting_id', sql.Int, meeting_id)
      .query(`SELECT mc.meeting_action_id, mc.contact_id,
        c.name AS contact_name, comp.nombre AS company_name
        FROM event_meetings_contacts mc
        JOIN events_meetings_actions a         ON mc.meeting_action_id = a.id
        JOIN badaco_contactos c        ON mc.contact_id = c.contact_id
        LEFT JOIN badaco_mcompany comp ON c.bmc_id = comp.bmc_id
        WHERE a.meeting_id = @meeting_id
        ORDER BY mc.meeting_action_id, c.name`);
    return recordset;
  }

  static async addActionContact(transaction, meeting_action_id, contact_id) {
    await new sql.Request(transaction)
      .input('meeting_action_id', sql.Int, parseInt(meeting_action_id))
      .input('contact_id',        sql.Int, parseInt(contact_id))
      .query(`IF NOT EXISTS (SELECT 1 FROM event_meetings_contacts WHERE meeting_action_id=@meeting_action_id AND contact_id=@contact_id)
        INSERT INTO event_meetings_contacts (meeting_action_id, contact_id) VALUES (@meeting_action_id, @contact_id)`);
    return { result: 1 };
  }

  static async removeActionContact(transaction, meeting_action_id, contact_id) {
    await new sql.Request(transaction)
      .input('meeting_action_id', sql.Int, parseInt(meeting_action_id))
      .input('contact_id',        sql.Int, parseInt(contact_id))
      .query(`DELETE FROM event_meetings_contacts WHERE meeting_action_id=@meeting_action_id AND contact_id=@contact_id`);
    return { result: 1 };
  }

  // ── Responsibles ──────────────────────────────────────────────────────────
  static async getActionResponsiblesByMeeting(transaction, meeting_id) {
    const { recordset } = await new sql.Request(transaction)
      .input('meeting_id', sql.Int, meeting_id)
      .query(`SELECT r.meeting_action_id, r.responsible
        FROM events_meetings_responsibles r
        JOIN events_meetings_actions a ON r.meeting_action_id = a.id
        WHERE a.meeting_id = @meeting_id
        ORDER BY r.meeting_action_id, r.id`);
    return recordset;
  }

  static async addActionResponsible(transaction, meeting_action_id, responsible) {
    await new sql.Request(transaction)
      .input('meeting_action_id', sql.Int,     parseInt(meeting_action_id))
      .input('responsible',       sql.VarChar,  responsible)
      .query(`IF NOT EXISTS (SELECT 1 FROM events_meetings_responsibles WHERE meeting_action_id=@meeting_action_id AND responsible=@responsible)
        INSERT INTO events_meetings_responsibles (meeting_action_id, responsible) VALUES (@meeting_action_id, @responsible)`);
    return { result: 1 };
  }

  static async removeActionResponsible(transaction, meeting_action_id, responsible) {
    await new sql.Request(transaction)
      .input('meeting_action_id', sql.Int,     parseInt(meeting_action_id))
      .input('responsible',       sql.VarChar,  responsible)
      .query(`DELETE FROM events_meetings_responsibles WHERE meeting_action_id=@meeting_action_id AND responsible=@responsible`);
    return { result: 1 };
  }

  // ── Close meeting: generate CRM cases from eligible action points ─────────
  static async closeMeeting(transaction, meeting_id, user_id, departamento_id, user_code) {
    const { recordset: actions } = await new sql.Request(transaction)
      .input('meeting_id', sql.Int, meeting_id)
      .query(`SELECT DISTINCT a.* FROM events_meetings_actions a
        JOIN events_meetings_responsibles r ON r.meeting_action_id = a.id
        WHERE a.meeting_id=@meeting_id AND a.action_points IS NOT NULL
        AND a.due_date IS NOT NULL AND a.crm_id IS NULL`);

    let crm_created = 0;
    for (const action of actions) {
      const { recordset: resp } = await new sql.Request(transaction)
        .input('action_id', sql.Int, action.id)
        .query(`SELECT responsible FROM events_meetings_responsibles WHERE meeting_action_id=@action_id`);

      const { recordset } = await new sql.Request(transaction)
        .input('cprioridad',          sql.Int,     action.priority || 0)
        .input('conversacion_titulo', sql.VarChar,  action.action_points)
        .input('departamento_id',     sql.VarChar,  String(departamento_id))
        .input('de_correo',           sql.VarChar,  user_id)
        .input('de_nombre',           sql.VarChar,  user_id)
        .input('asunto_interno',      sql.VarChar,  action.meeting_details || action.action_points)
        .input('ffin',                sql.Date,     action.due_date)
        .query(`INSERT INTO crm_main (cprioridad, conversacion_titulo, departamento_id, de_correo, de_nombre, asunto_interno, ffin)
          OUTPUT INSERTED.id
          VALUES (@cprioridad, @conversacion_titulo, @departamento_id, @de_correo, @de_nombre, @asunto_interno, @ffin)`);

      const crm_id = recordset[0].id;
      crm_created++;

      // Initialize estado (Not Started = 0) for the department
      await new sql.Request(transaction)
        .input('id_main',       sql.Int, crm_id)
        .input('cdepartamento', sql.Int, departamento_id)
        .input('cestado',       sql.Int, 0)
        .query(`INSERT INTO crm_main_estado (id_main, cdepartamento, cestado) VALUES (@id_main, @cdepartamento, @cestado)`);

      // Welcome message
      await new sql.Request(transaction)
        .input('id_main',         sql.Int,     crm_id)
        .input('nombre_mensaje',  sql.VarChar, 'Meeting Action Point')
        .input('body_mensaje',    sql.VarChar, 'New meeting action point added')
        .input('id_msg',          sql.Int,     1)
        .input('de_nombre',       sql.VarChar, user_id)
        .query(`INSERT INTO crm_msg (id_main, nombre_mensaje, body_mensaje, id_msg, de_nombre)
          VALUES (@id_main, @nombre_mensaje, @body_mensaje, @id_msg, @de_nombre)`);

      for (const r of resp) {
        await new sql.Request(transaction)
          .input('id_main',       sql.Int,     crm_id)
          .input('cdepartamento', sql.Int,     departamento_id)
          .input('uasignado',     sql.VarChar, r.responsible)
          .query(`INSERT INTO crm_asignado (id_main, cdepartamento, uasignado) VALUES (@id_main, @cdepartamento, @uasignado)`);
      }

      // Link meeting action contacts to the new CRM case
      const { recordset: contacts } = await new sql.Request(transaction)
        .input('action_id', sql.Int, action.id)
        .query(`SELECT contact_id FROM event_meetings_contacts WHERE meeting_action_id=@action_id`);

      for (const c of contacts) {
        await new sql.Request(transaction)
          .input('crm_id',    sql.Int,     crm_id)
          .input('ccontacto', sql.VarChar, String(c.contact_id))
          .query(`IF NOT EXISTS (SELECT 1 FROM crm_main_contacts WHERE crm_id=@crm_id AND ccontacto=@ccontacto)
            INSERT INTO crm_main_contacts (crm_id, ccontacto) VALUES (@crm_id, @ccontacto)`);
      }

      await new sql.Request(transaction)
        .input('id',     sql.Int, action.id)
        .input('crm_id', sql.Int, crm_id)
        .query(`UPDATE events_meetings_actions SET crm_id=@crm_id WHERE id=@id`);
    }

    // Update meeting status to 'closed'
    await new sql.Request(transaction)
      .input('meeting_id', sql.Int, meeting_id)
      .input('user_id', sql.VarChar, user_code)
      .query(`UPDATE event_meetings SET meeting_status='closed', umodificado=@user_id, fmodificado=GETDATE() WHERE id=@meeting_id`);

    return { result: 1, crm_created };
  }
}
