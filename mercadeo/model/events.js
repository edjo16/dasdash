import sql from 'mssql';
import {convertToDate} from '../../Approvals_functions/functions.js';
export default class EventsModel {
  constructor() { }
  static async getEvents(transaction) {
    const request = new sql.Request(transaction);
    const query = `SELECT * FROM m_events_conference`;
    const { recordset } = await request.query(query);
    return recordset;
  }
  static async postEvents(transaction, user_created, collaborator_name, category, country, city, objective, event_name, start_date, end_date, estimated_budget, participants_number, comments) {
    let start_date_converted = start_date ? convertToDate(start_date) : null;
    let end_date_converted = end_date ? convertToDate(end_date) : null;
    const request = new sql.Request(transaction);
    const query = `INSERT INTO forms_events (user_created, collaborator_name, category, country, city, objective, event_name, start_date, end_date, estimated_budget, participants_number, comments) 
        OUTPUT INSERTED.id
        VALUES ( @user_created, @collaborator_name, @category, @country, @city, @objective, @event_name, @start_date, @end_date, @estimated_budget, @participants_number, @comments)`;
    request.input('user_created', sql.VarChar, user_created);
    request.input('collaborator_name', sql.VarChar, collaborator_name)
    request.input('category', sql.VarChar, category);
    request.input('country', sql.VarChar, country);
    request.input('city', sql.VarChar, city);
    request.input('objective', sql.VarChar, objective);
    request.input('event_name', sql.VarChar, event_name || null);
    request.input('start_date', sql.Date, start_date_converted);
    request.input('end_date', sql.Date, end_date_converted);
    request.input('estimated_budget', sql.Float, estimated_budget);
    request.input('participants_number', sql.Int, participants_number);
    request.input('comments', sql.VarChar, comments || null);
    const { recordset } = await request.query(query);
    return recordset[0];
  }
  static async postParticipants(transaction, event_id, participants) {
    if( participants == undefined || participants.length === 0) return;
    for (const participant of participants) {
      const request = new sql.Request(transaction);
      const query = `INSERT INTO event_participants (event_id, name) 
            VALUES (@event_id, @name)`;
      request.input('event_id', sql.Int, event_id);
      request.input('name', sql.NVarChar, participant.name);
      await request.query(query);
    }
    return { message: 'Participants added successfully' };
  }
  static async postMeetings(transaction, event_id, meetings, usuario) {
    if( meetings == undefined || meetings.length === 0) return;
    for (const meeting of meetings) {
      const request = new sql.Request(transaction);
      const query = `INSERT INTO event_meetings (event_id, meeting_name, meeting_address, meeting_comments, uingreso, fingreso)
            VALUES (@event_id, @meeting_name, @meeting_address, @meeting_comments, @uingreso, GETDATE())`;
      request.input('event_id', sql.Int, event_id);
      request.input('meeting_name', sql.NVarChar, meeting.meeting_name);
      request.input('meeting_address', sql.NVarChar, meeting.meeting_address || null);
      request.input('meeting_comments', sql.NVarChar, meeting.meeting_comments || null);
      request.input('uingreso', sql.NVarChar, usuario|| null);
      await request.query(query);
    }
    return { message: 'Meetings added successfully' };
  }
  static async readforms(transaction, limit, offset, ITuser, userId, category, status, search) {
    let query;
    let statusFilter = '';

    // Add logic for approval_status flag
    if (!status) {
        statusFilter = `CASE
            WHEN approval_status = 'Verify' THEN 'Not Approved'
            WHEN approval_status = 'Rejected' THEN 'Rejected'
            WHEN approval_status = 'Approved' AND start_date > GETDATE() THEN 'Planned'
            WHEN approval_status = 'Approved' AND start_date <= GETDATE() AND end_date >= GETDATE() THEN 'Ongoing'
            WHEN approval_status = 'Approved' AND end_date < GETDATE() THEN 'Finished'
            END AS approval_status`;
    } else {
        if (status === 'Not Approved') {
            statusFilter = `CASE
            WHEN approval_status = 'Verify' THEN 'Not Approved' END AS status`;
        } else if (status === 'Rejected') {
            statusFilter = `CASE
            WHEN approval_status = 'Rejected' THEN 'Rejected' END AS status`;
        } else if (status === 'Planned') {
            statusFilter = `CASE
            WHEN approval_status = 'Approved' AND start_date > GETDATE() THEN 'Planned' END AS status`;
        } else if (status === 'Ongoing') {
            statusFilter = `CASE
            WHEN approval_status = 'Approved' AND start_date <= GETDATE() AND end_date >= GETDATE() THEN 'Ongoing' END AS status`;
        } else if (status === 'Finished') {
            statusFilter = `CASE
            WHEN approval_status = 'Approved' AND end_date < GETDATE() THEN 'Finished' END AS status`;
        }
    }

    if (ITuser) {
        query = `SELECT id, event_name, visit_name, collaborator_name, category, country, approval_status, ${statusFilter}, 
        FORMAT(start_date, 'dd/MM/yyyy') AS start_date, 
        FORMAT(end_date, 'dd/MM/yyyy') AS end_date
        FROM forms_events WHERE category IS NOT NULL`;
    } else {
        query = `SELECT id, event_name, visit_name, collaborator_name, category, country, approval_status, ${statusFilter}, 
        FORMAT(start_date, 'dd/MM/yyyy') AS start_date, 
        FORMAT(end_date, 'dd/MM/yyyy') AS end_date 
        FROM forms_events WHERE user_created = @userId`;
    }

    if (category !== null) {
        query += ` AND category = @category`;
    }
    if (status !== null) {
        if (status === 'Planned') {
            query += ` AND start_date > GETDATE()`;
        } else if (status === 'Ongoing') {
            query += ` AND start_date <= GETDATE() AND end_date >= GETDATE()`;
        } else if (status === 'Finished') {
            query += ` AND end_date < GETDATE()`;
        }
    }
    if (search !== null) {
        query += ` AND (collaborator_name LIKE @search OR id LIKE @search OR start_date LIKE @search)`;
    }

    query += `
        ORDER BY date DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const request = new sql.Request(transaction);
    request.input('userId', sql.VarChar, userId);
    if (status !== null) request.input('status', sql.VarChar, status);
    if (category !== null) request.input('category', sql.VarChar, category);
    if (search !== null) request.input('search', sql.VarChar, `%${search}%`);
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);

    return await request.query(query);
}
  static async totalCount(transaction, ITuser, userId, category, status, search, departmentAccess) {
    let query;
    let statusFilter = '';

    if (!status) {
      statusFilter = `CASE
            WHEN approval_status = 'Verify' THEN 'Not Approved'
            WHEN approval_status = 'Rejected' THEN 'Rejected'
            WHEN approval_status = 'Approved' AND start_date > GETDATE() THEN 'Planned'
            WHEN approval_status = 'Approved' AND start_date <= GETDATE() AND end_date >= GETDATE() THEN 'Ongoing'
            WHEN approval_status = 'Approved' AND end_date < GETDATE() THEN 'Finished'
            END AS status`;
          } else {
            if (status === 'Not Approved') {
                statusFilter = `CASE
                WHEN approval_status = 'Verify' THEN 'Not Approved' END AS status`;
            } else if (status === 'Rejected') {
                statusFilter = `CASE
                WHEN approval_status = 'Rejected' THEN 'Rejected' END AS status`;
            } else if (status === 'Planned') {
                statusFilter = `CASE
                WHEN approval_status = 'Approved' AND start_date > GETDATE() THEN 'Planned' END AS status`;
            } else if (status === 'Ongoing') {
                statusFilter = `CASE
                WHEN approval_status = 'Approved' AND start_date <= GETDATE() AND end_date >= GETDATE() THEN 'Ongoing' END AS status`;
            } else if (status === 'Finished') {
                statusFilter = `CASE
                WHEN approval_status = 'Approved' AND end_date < GETDATE() THEN 'Finished' END AS status`;
            }
        }

    if (ITuser) {
      query = `SELECT COUNT(*) AS totalCount
             FROM forms_events 
             WHERE id IS NOT NULL`;
    } else {
      query = `SELECT COUNT(*) AS totalCount
             FROM forms_events 
             WHERE user_created = @userId`;
    }

    if (category !== null) {
      query += ` AND category = @category`;
    }

    if (status !== null) {
      if (status === 'Planned') {
        query += ` AND start_date > GETDATE()`;
      } else if (status === 'Ongoing') {
        query += ` AND start_date <= GETDATE() AND end_date >= GETDATE()`;
      } else if (status === 'Finished') {
        query += ` AND end_date < GETDATE()`;
      }
    }

    if (search !== null) {
      query += ` AND (collaborator_name LIKE @search OR id LIKE @search OR category LIKE @search)`;
    }

    const request = new sql.Request(transaction);
    request.input('userId', sql.VarChar, userId);

    if (category) request.input('category', sql.VarChar, category);
    if (status) request.input('status', sql.VarChar, status);
    if (search) request.input('search', sql.VarChar, `%${search}%`);

    return await request.query(query);
  }
    static async readFormByLogId(transaction, id) {
    let formId = null;
    const request = new sql.Request(transaction);
    const { recordset } = await request
      .input('id', sql.Int, id)
      .query(`SELECT FORMAT(start_date,'dd/MM/yyyy') AS start_dates, FORMAT(end_date,'dd/MM/yyyy') AS end_dates, * FROM forms_events WHERE log_id = @id;`)
    formId = recordset[0];
    formId.start_date = formId.start_dates;
    formId.end_date = formId.end_dates
    return formId;
  }
  static async readFormById(transaction, id) {
    let formId = null;
    const request = new sql.Request(transaction);
    const { recordset } = await request
      .input('id', sql.Int, id)
      .query(`SELECT FORMAT(start_date,'dd/MM/yyyy') AS start_dates, FORMAT(end_date,'dd/MM/yyyy') AS end_dates, * FROM forms_events WHERE id = @id;`)
    formId = recordset[0];
    formId.start_date = formId.start_dates;
    formId.end_date = formId.end_dates
    return formId;
  }
  static async readFormParticipantsById(transaction, id) {
    let participants = [];
    const request = new sql.Request(transaction);
    const { recordset } = await request
      .input('id', sql.Int, id)
      .query(`SELECT * FROM event_participants WHERE event_id = @id;`)
    participants = recordset;
    return participants;
  }
  static async readFormEventById(transaction, id) {
    let events = null;
    const request = new sql.Request(transaction);
    const { recordset } = await request
      .input('id', sql.Int, id)
      .query(`SELECT * FROM event_meetings WHERE event_id = @id;`)
    events = recordset;
    return events;
  }

  static async updateFormEvent(transaction, id, userId, formData, changes) {
    // Function to log changes in event_version table
    async function logEventChange(eventId, changeType, changedTable, changedColumn, oldValue, newValue, userId) {
        const requestLog = new sql.Request(transaction);
        await requestLog
            .input('event_id', sql.Int, eventId)
            .input('change_type', sql.VarChar, changeType)
            .input('changed_table', sql.VarChar, changedTable)
            .input('changed_column', sql.VarChar, changedColumn)
            .input('old_value', sql.Text, oldValue)
            .input('new_value', sql.Text, newValue)
            .input('user_id', sql.VarChar, userId)
            .query(`
                INSERT INTO event_version (event_id, change_type, changed_table, changed_column, old_value, new_value, user_id)
                VALUES (@event_id, @change_type, @changed_table, @changed_column, @old_value, @new_value, @user_id);
            `);
    }

    // Ensure changes exist before proceeding
    if (Object.keys(changes.eventChanges).length > 0) {
        let objective = changes.eventChanges.objective?.current ? changes.eventChanges.objective?.current  : null;
        let start_date = changes.eventChanges.start_date?.current ? convertToDate(changes.eventChanges.start_date?.current) : null;
        let end_date = changes.eventChanges.end_date?.current ? convertToDate(changes.eventChanges.end_date?.current) : null;
        let estimated_budget = changes.eventChanges.estimated_budget?.current ? changes.eventChanges.estimated_budget?.current : null;
        let participants_number = changes.eventChanges.participants_number?.current ? formData.participants_number : null;
        let comments = changes.eventChanges.comments?.current ? changes.eventChanges.comments?.current : null;

        const requestUpdateForm = new sql.Request(transaction);
        requestUpdateForm
            .input('id', sql.Int, id)
            .input('user_updated', sql.VarChar, userId);
        if(objective !== null) requestUpdateForm.input('objective', sql.VarChar, objective);
        if(estimated_budget !== null) requestUpdateForm.input('estimated_budget', sql.Float, estimated_budget);
        if(participants_number !== null) requestUpdateForm.input('participants_number', sql.Int, participants_number);
        if(comments !== null) requestUpdateForm.input('comments', sql.VarChar, comments);
        if(start_date !== null) requestUpdateForm.input('start_date', sql.Date, start_date);
        if(end_date !== null) requestUpdateForm.input('end_date', sql.Date, end_date);

        let setClause = [];
        if (objective !== null) setClause.push('objective = @objective');
        if (start_date !== null) setClause.push('start_date = @start_date');
        if (end_date !== null) setClause.push('end_date = @end_date');
        if (estimated_budget !== null) setClause.push('estimated_budget = @estimated_budget');
        if (participants_number !== null) setClause.push('participants_number = @participants_number');
        if (comments !== null) setClause.push('comments = @comments');
       
        const setClauseString = setClause.join(', ');
        await requestUpdateForm.query(`
            UPDATE forms_events 
            SET ${setClauseString}
            WHERE ID = @id;
        `);

        // Log the changes for each modified field
        const fieldsToLog = ['objective', 'start_date', 'end_date', 'estimated_budget', 'participants_number', 'comments'];
        for (let field of fieldsToLog) {
            if (changes.eventChanges[field] && changes.eventChanges[field].current !== undefined) {
                await logEventChange(
                    id, 
                    'UPDATE', 
                    'events', 
                    field, 
                    changes.eventChanges[field].previous, 
                    changes.eventChanges[field].current, 
                    userId
                );
            }
        }
    }

    // Handle participant changes
    for (const participant of changes.participantsChanges.toRemove) {
        const requestDeleteParticipant = new sql.Request(transaction);
        await requestDeleteParticipant
            .input('id', sql.Int, participant.id)
            .query(`DELETE FROM event_participants WHERE id = @id`);
        await logEventChange(id, 'DELETE', 'participants', 'name', participant.name, null, userId);
    }

    for (const participant of changes.participantsChanges.toAdd) {
        const requestAddParticipant = new sql.Request(transaction);
        await requestAddParticipant
            .input('event_id', sql.Int, id)
            .input('name', sql.VarChar, participant.name)
            .query(`INSERT INTO event_participants (event_id, name) VALUES (@event_id, @name)`);
        await logEventChange(id, 'ADD', 'participants', 'name', null, participant.name, userId);
    }

    for (const participant of changes.participantsChanges.toUpdate) {
        const requestUpdateParticipant = new sql.Request(transaction);
        await requestUpdateParticipant
            .input('event_id', sql.Int, id)
            .input('name', sql.VarChar, participant.name)
            .query(`UPDATE event_participants SET name = @name WHERE event_id = @event_id AND name = @name`);
        await logEventChange(id, 'UPDATE', 'participants', 'name', participant.old_name, participant.name, userId);
    }

    // Handle meeting changes
    for (const meeting of changes.meetingsChanges.toRemove) {
        const requestDeleteMeeting = new sql.Request(transaction);
        await requestDeleteMeeting
            .input('id', sql.Int, meeting.id)
            .query(`DELETE FROM event_meetings WHERE id = @id`);
        await logEventChange(id, 'DELETE', 'meetings', 'meeting_name', meeting.meeting_name, null, userId);
    }

    for (const meeting of changes.meetingsChanges.toAdd) {
        const requestAddMeeting = new sql.Request(transaction);
        await requestAddMeeting
            .input('event_id', sql.Int, id)
            .input('meeting_name', sql.NVarChar, meeting.meeting_name)
            .input('meeting_address', sql.NVarChar, meeting.meeting_address || null)
            .input('meeting_comments', sql.NVarChar, meeting.meeting_comments || null)
            .query(`INSERT INTO event_meetings (event_id, meeting_name, meeting_address, meeting_comments) VALUES (@event_id, @meeting_name, @meeting_address, @meeting_comments)`);
        await logEventChange(id, 'ADD', 'meetings', 'meeting_name', null, meeting.meeting_name, userId);
    }

    for (const meeting of changes.meetingsChanges.toUpdate) {
        const current = meeting.current;
        const requestUpdateMeeting = new sql.Request(transaction);
        await requestUpdateMeeting
            .input('event_id', sql.Int, id)
            .input('meeting_name', sql.NVarChar, current.meeting_name || meeting.initial.meeting_name)
            .input('meeting_address', sql.NVarChar, current.meeting_address || meeting.initial.meeting_name)
            .input('meeting_comments', sql.NVarChar, current.meeting_comments || meeting.initial.meeting_name)
            .query(`
                UPDATE event_meetings 
                SET meeting_address = @meeting_address, meeting_comments = @meeting_comments 
                WHERE event_id = @event_id AND meeting_name = @meeting_name
            `);

        if (current.meeting_address !== meeting.initial.meeting_address) {
            await logEventChange(id, 'UPDATE', 'meetings', 'meeting_address', meeting.initial.meeting_address, current.meeting_address, userId);
        }
        if (current.meeting_comments !== meeting.initial.meeting_comments) {
            await logEventChange(id, 'UPDATE', 'meetings', 'meeting_comments', meeting.initial.meeting_comments, current.meeting_comments, userId);
        }
    }

    return { result: 1, message: 'Event updated successfully.' };
}

  static async updateFormWithLogId(transaction, formId, RowID) {

            const request = new sql.Request(transaction);
            await request
                .input('id', sql.Int, formId)
                .input('log_id', sql.Int, RowID)
                .query(`
                    UPDATE forms_events 
                    SET log_id = @log_id
                    WHERE ID = @id;
                `);
            return true;
  }

  static async updateStatus(transaction, log_id, approval_status) {
    const request = new sql.Request(transaction);
    await request
        .input('log_id', sql.Int, log_id)
        .input('approval_status', sql.VarChar, approval_status)
        .query(`
            UPDATE forms_events 
            SET approval_status = @approval_status
            WHERE log_id = @log_id;
        `);
    return true;
}

  // ── Report: Participant Summary ──────────────────────────────────────────
  static async getResumeByEventId(transaction, event_id) {
    const { recordset } = await new sql.Request(transaction)
      .input('event_id', sql.Int, event_id)
      .query(`SELECT * FROM event_meetings_resume WHERE event_id = @event_id ORDER BY fingreso ASC`);
    return recordset;
  }

  static async upsertResume(transaction, event_id, uingreso, comments) {
    await new sql.Request(transaction)
      .input('event_id', sql.Int, event_id)
      .input('uingreso', sql.VarChar, uingreso)
      .input('comments', sql.VarChar, comments)
      .query(`IF EXISTS (SELECT 1 FROM event_meetings_resume WHERE event_id=@event_id AND uingreso=@uingreso)
        UPDATE event_meetings_resume SET comments=@comments, fmodificado=GETDATE(), umodificado=@uingreso WHERE event_id=@event_id AND uingreso=@uingreso
      ELSE
        INSERT INTO event_meetings_resume (event_id, uingreso, comments) VALUES (@event_id, @uingreso, @comments)`);
    return { result: 1 };
  }

  // ── Report: Meeting Action Points ────────────────────────────────────────
  static async getMeetingActions(transaction, event_id) {
    const { recordset } = await new sql.Request(transaction)
      .input('event_id', sql.Int, event_id)
      .query(`SELECT a.*,
        FORMAT(a.meet_date,'yyyy-MM-dd') AS meet_date_fmt,
        FORMAT(a.due_date,'yyyy-MM-dd')  AS due_date_fmt
        FROM events_meetings_actions a
        WHERE a.event_id = @event_id
        ORDER BY a.meeting_id, a.id ASC`);
    return recordset;
  }

  static async getActionContactsByEvent(transaction, event_id) {
    const { recordset } = await new sql.Request(transaction)
      .input('event_id', sql.Int, event_id)
      .query(`SELECT ec.meeting_action_id, ec.contact_id,
        c.name AS contact_name, comp.nombre AS company_name
        FROM event_meetings_contacts ec
        JOIN events_meetings_actions a  ON ec.meeting_action_id = a.id
        JOIN badaco_contactos c         ON ec.contact_id = c.contact_id
        LEFT JOIN badaco_mcompany comp  ON c.bmc_id = comp.bmc_id
        WHERE a.event_id = @event_id
        ORDER BY ec.meeting_action_id, c.name`);
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

  static async upsertMeetingAction(transaction, data) {
    const { id, event_id, meeting_id,
            action_points, meeting_details,
            priority, uingreso } = data;
    const toDate = (v) => v ? (v.includes('/') ? convertToDate(v) : v) : null;
    const meet_date = toDate(data.meet_date);
    const due_date  = toDate(data.due_date);
    if (id) {
      await new sql.Request(transaction)
        .input('id',               sql.Int,     id)
        .input('action_points',    sql.VarChar,  action_points    || null)
        .input('meeting_details',  sql.VarChar,  meeting_details  || null)
        .input('meet_date',        sql.Date,     meet_date        || null)
        .input('due_date',         sql.Date,     due_date         || null)
        .input('priority',         sql.Int,      priority ? parseInt(priority) : null)
        .input('uingreso',         sql.VarChar,  uingreso)
        .query(`UPDATE events_meetings_actions SET
          action_points=@action_points, meeting_details=@meeting_details,
          meet_date=@meet_date, due_date=@due_date, priority=@priority,
          user_updated=@uingreso, fmodificado=GETDATE(), umodificado=@uingreso
          WHERE id=@id`);
      return { id };
    } else {
      const { recordset } = await new sql.Request(transaction)
        .input('event_id',         sql.Int,      event_id)
        .input('meeting_id',       sql.VarChar,  String(meeting_id))
        .input('action_points',    sql.VarChar,  action_points    || null)
        .input('meeting_details',  sql.VarChar,  meeting_details  || null)
        .input('meet_date',        sql.Date,     meet_date        || null)
        .input('due_date',         sql.Date,     due_date         || null)
        .input('priority',         sql.Int,      priority ? parseInt(priority) : null)
        .input('created_by',       sql.VarChar,  uingreso)
        .input('uingreso',         sql.VarChar,  uingreso)
        .query(`INSERT INTO events_meetings_actions
          (event_id, meeting_id,
           action_points, meeting_details, meet_date, due_date, priority,
           created_by, uingreso, fingreso)
          OUTPUT INSERTED.id
          VALUES (@event_id, @meeting_id,
           @action_points, @meeting_details, @meet_date, @due_date, @priority,
           @created_by, @uingreso, GETDATE())`);
      return { id: recordset[0].id };
    }
  }

  static async deleteMeetingAction(transaction, id) {
    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`DELETE FROM events_meetings_actions WHERE id=@id AND crm_id IS NULL`);
    return { result: 1 };
  }

  static async updateMeetingAction(transaction, id, data) {
    const toDate = (v) => v ? (v.includes('/') ? convertToDate(v) : v) : null;
    await new sql.Request(transaction)
      .input('id',               sql.Int,      id)
      .input('meeting_details',  sql.VarChar,  data.meeting_details  || null)
      .input('meet_date',        sql.Date,     toDate(data.meet_date))
      .input('action_points',    sql.VarChar,  data.action_points    || null)
      .input('due_date',         sql.Date,     toDate(data.due_date))
      .input('priority',         sql.Int,      data.priority         || null)
      .input('umodificado',      sql.VarChar,  data.user_updated     || null)
      .query(`UPDATE events_meetings_actions SET
        meeting_details=@meeting_details, meet_date=@meet_date,
        action_points=@action_points, due_date=@due_date,
        priority=@priority, fmodificado=GETDATE(), umodificado=@umodificado
        WHERE id=@id AND crm_id IS NULL`);
    return { result: 1 };
  }

  static async getActionResponsiblesByEvent(transaction, event_id) {
    const { recordset } = await new sql.Request(transaction)
      .input('event_id', sql.Int, event_id)
      .query(`SELECT r.meeting_action_id, r.responsible
        FROM events_meetings_responsibles r
        JOIN events_meetings_actions a ON r.meeting_action_id = a.id
        WHERE a.event_id = @event_id
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

  static async closeReport(transaction, event_id, user_id, departamento_id, user_email) {
    const { recordset: actions } = await new sql.Request(transaction)
      .input('event_id', sql.Int, event_id)
      .query(`SELECT DISTINCT a.* FROM events_meetings_actions a
        JOIN events_meetings_responsibles r ON r.meeting_action_id = a.id
        WHERE a.event_id=@event_id AND a.action_points IS NOT NULL
        AND a.due_date IS NOT NULL AND a.crm_id IS NULL`);

    const crms = [];
    for (const action of actions) {
      // get all responsibles for this action
      const { recordset: resp } = await new sql.Request(transaction)
        .input('action_id', sql.Int, action.id)
        .query(`SELECT responsible FROM events_meetings_responsibles WHERE meeting_action_id=@action_id`);

      const { recordset } = await new sql.Request(transaction)
        .input('cprioridad',          sql.Int,     action.priority || 0)
        .input('conversacion_titulo', sql.VarChar,  action.action_points)
        .input('departamento_id',     sql.VarChar,  String(departamento_id))
        .input('de_correo',           sql.VarChar,  user_email)
        .input('de_nombre',           sql.VarChar,  user_email)
        .input('asunto_interno',      sql.VarChar,  action.meeting_details || action.action_points)
        .input('ffin',                sql.Date,     action.due_date)
        .query(`INSERT INTO crm_main (cprioridad, conversacion_titulo, departamento_id, de_correo, de_nombre, asunto_interno, ffin)
          OUTPUT INSERTED.id
          VALUES (@cprioridad, @conversacion_titulo, @departamento_id, @de_correo, @de_nombre, @asunto_interno, @ffin)`);
      const crm_id = recordset[0].id;

      for (const r of resp) {
        await new sql.Request(transaction)
          .input('id_main',      sql.Int,     crm_id)
          .input('uasignado',    sql.VarChar,  r.responsible)
          .input('cdepartamento',sql.Int,      parseInt(departamento_id))
          .query(`INSERT INTO crm_asignado (id_main, uasignado, cdepartamento) VALUES (@id_main, @uasignado, @cdepartamento)`);
      }

      await new sql.Request(transaction)
        .input('id_main',      sql.Int, crm_id)
        .input('cdepartamento',sql.Int, parseInt(departamento_id))
        .input('cestado',      sql.Int, 0)
        .query(`INSERT INTO crm_main_estado (id_main, cdepartamento, cestado) VALUES (@id_main, @cdepartamento, @cestado)`);
      // Welcome message
      await new sql.Request(transaction)
        .input('id_main',         sql.Int,     crm_id)
        .input('nombre_mensaje',  sql.VarChar, 'Meeting Action Point')
        .input('body_mensaje',    sql.VarChar, 'New meeting action point added')
        .input('id_msg',          sql.Int,     1)
        .input('de_nombre',       sql.VarChar, user_email)
        .query(`INSERT INTO crm_msg (id_main, nombre_mensaje, body_mensaje, id_msg, de_nombre)
          VALUES (@id_main, @nombre_mensaje, @body_mensaje, @id_msg, @de_nombre)`);

      // Insert contacts from event_meetings_contacts into crm_main_contacts
      const { recordset: contacts } = await new sql.Request(transaction)
        .input('action_id', sql.Int, action.id)
        .query(`SELECT contact_id FROM event_meetings_contacts WHERE meeting_action_id=@action_id`);
      for (const c of contacts) {
        await new sql.Request(transaction)
          .input('crm_id',    sql.Int,     crm_id)
          .input('ccontacto', sql.VarChar, String(c.contact_id))
          .query(`INSERT INTO crm_main_contacts (crm_id, ccontacto) VALUES (@crm_id, @ccontacto)`);
      }

      await new sql.Request(transaction)
        .input('id',          sql.Int,     action.id)
        .input('crm_id',      sql.Int,     crm_id)
        .input('crm_status',  sql.VarChar, 'Open')
        .input('umodificado', sql.VarChar, user_id)
        .query(`UPDATE events_meetings_actions SET crm_id=@crm_id, crm_status=@crm_status, fmodificado=GETDATE(), umodificado=@umodificado WHERE id=@id`);

      crms.push({ action_id: action.id, crm_id });
    }

    // Update report status to 'closed'
    await new sql.Request(transaction)
      .input('event_id', sql.Int, event_id)
      .input('user_id', sql.VarChar, user_id)
      .query(`UPDATE forms_events SET report_status='closed', user_updated=@user_id, date_update=GETDATE() WHERE id=@event_id`);

    return { result: 1, created: crms.length, crms };
  }
}