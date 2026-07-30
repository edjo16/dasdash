import sql from 'mssql';
import {convertToDate} from '../../Approvals_functions/functions.js';
export default class ChangesControlModel {
  constructor() { }
  static async postEvents(transaction, user_created, collaborator_name, collaborator_department, application, priority, type, title, report, functions, fields, comments, approval_status) {
    const request = new sql.Request(transaction);
    const query = `INSERT INTO forms_it_change_request (user_created, collaborator_name, collaborator_department, application_name, priority, type, title, report, functions, fields, comments, approval_status)
        OUTPUT INSERTED.id
        VALUES ( @user_created, @collaborator_name, @collaborator_department, @application_name, @priority, @type, @title, @report, @functions, @fields, @comments, @approval_status)`;
    request.input('user_created', sql.VarChar, user_created);
    request.input('collaborator_name', sql.VarChar, collaborator_name)
    request.input('collaborator_department', sql.VarChar, collaborator_department);
    request.input('application_name', sql.VarChar, application);
    request.input('priority', sql.VarChar, priority);
    request.input('type', sql.VarChar, type);
    request.input('title', sql.NVarChar, title);
    request.input('report', sql.NVarChar, report);
    request.input('functions', sql.NVarChar, functions);
    request.input('fields', sql.VarChar, fields);
    request.input('comments', sql.VarChar, comments || null);
    request.input('approval_status', sql.VarChar, approval_status);
    const { recordset } = await request.query(query);
    return recordset[0];
  }

  static async readforms(transaction, limit, offset, ITuser, userId, application_name, status, search, year) {
    let query;
    let statusFilter = '';

    if (ITuser) {
        query = `SELECT id, log_id, collaborator_name, application_name, priority, type, title,
        FORMAT(date_created,'dd/MM/yyyy') AS date_created, user_created, approval_status
        FROM forms_it_change_request WHERE application_name IS NOT NULL`;
    } else {
        query = `SELECT id, log_id, collaborator_name, application_name, priority, type, title,
        FORMAT(date_created,'dd/MM/yyyy') AS date_created, user_created, approval_status
        FROM forms_it_change_request WHERE user_created = @userId`;
    }

    if (application_name !== null) {
        query += ` AND application_name = @application_name`;
    }
    if (status !== null) {
      query += ` AND approval_status = @approval_status`;
    }
    if (year !== null) {
        query += ` AND YEAR(date_created) = @year`;
    }
    if (search !== null) {
        query += ` AND (collaborator_name LIKE @search OR id LIKE @search OR priority LIKE @search OR type LIKE @search)`;
    }

    query += `
        ORDER BY id DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;
    const request = new sql.Request(transaction);
    request.input('userId', sql.VarChar, userId);
    if (status !== null) request.input('approval_status', sql.VarChar, status);
    if (application_name !== null) request.input('application_name', sql.VarChar, application_name);
    if (year !== null) request.input('year', sql.Int, parseInt(year));
    if (search !== null) request.input('search', sql.VarChar, `%${search}%`);
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);
    return await request.query(query);
}
  static async totalCount(transaction, ITuser, userId, application_name, status, search, year) {
    let query;

    if (ITuser) {
      query = `SELECT COUNT(*) AS totalCount FROM forms_it_change_request WHERE id IS NOT NULL`;
    } else {
      query = `SELECT COUNT(*) AS totalCount FROM forms_it_change_request WHERE user_created = @userId`;
    }

    if (application_name !== null) {
      query += ` AND application_name = @application_name`;
    }

    if (status !== null) {
        query += ` AND approval_status = @approval_status`;
    }

    if (year !== null) {
        query += ` AND YEAR(date_created) = @year`;
    }

    if (search !== null) {
      query += ` AND (collaborator_name LIKE @search OR id LIKE @search OR application_name LIKE @search)`;
    }

    const request = new sql.Request(transaction);
    request.input('userId', sql.VarChar, userId);

    if (application_name) request.input('application_name', sql.VarChar, application_name);
    if (status) request.input('approval_status', sql.VarChar, status);
    if (year) request.input('year', sql.Int, parseInt(year));
    if (search) request.input('search', sql.VarChar, `%${search}%`);

    return await request.query(query);
  }
  static async readAllForExport(transaction, ITuser, userId, application_name, status, search, year) {
    let query;

    if (ITuser) {
      query = `SELECT id, log_id, collaborator_name, application_name, priority, type, title,
        FORMAT(date_created,'dd/MM/yyyy HH:mm') AS date_created, user_created, approval_status
        FROM forms_it_change_request WHERE application_name IS NOT NULL`;
    } else {
      query = `SELECT id, log_id, collaborator_name, application_name, priority, type, title,
        FORMAT(date_created,'dd/MM/yyyy HH:mm') AS date_created, user_created, approval_status
        FROM forms_it_change_request WHERE user_created = @userId`;
    }

    if (application_name) query += ` AND application_name = @application_name`;
    if (status)           query += ` AND approval_status = @approval_status`;
    if (year)             query += ` AND YEAR(date_created) = @year`;
    if (search)           query += ` AND (collaborator_name LIKE @search OR CAST(id AS VARCHAR) LIKE @search OR application_name LIKE @search OR title LIKE @search)`;

    query += ` ORDER BY id DESC`;

    const request = new sql.Request(transaction);
    request.input('userId', sql.VarChar, userId);
    if (application_name) request.input('application_name', sql.VarChar, application_name);
    if (status)           request.input('approval_status', sql.VarChar, status);
    if (year)             request.input('year', sql.Int, parseInt(year));
    if (search)           request.input('search', sql.VarChar, `%${search}%`);

    const { recordset } = await request.query(query);
    return recordset;
  }

  static async readFormById(transaction, id) {
    let formId = null;
    const request = new sql.Request(transaction);
    const { recordset } = await request
      .input('id', sql.Int, id)
      .query(`SELECT FORMAT(date_created,'dd/MM/yyyy') AS date_created, * FROM forms_it_change_request WHERE id = @id;`)
      formId = recordset[0];
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
        let objective = changes.eventChanges.objective?.current || null;
        let start_date = changes.eventChanges.start_date?.current ? convertToDate(changes.eventChanges.start_date?.current) : null;
        let end_date = changes.eventChanges.end_date?.current ? convertToDate(changes.eventChanges.end_date?.current) : null;
        let estimated_budget = changes.eventChanges.estimated_budget?.current || null;
        let participants_number = changes.eventChanges.participants_number?.current || null;
        let comments = changes.eventChanges.comments?.current || null;

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
            UPDATE forms_it_change_request 
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
            .query(`INSERT INTO event_meetings (event_id, meeting_name, meeting_address, meeting_comments, uingreso, fingreso) VALUES (@event_id, @meeting_name, @meeting_address, @meeting_comments, @uingreso, GETDATE())`);
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
                    UPDATE forms_it_change_request 
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
            UPDATE forms_it_change_request 
            SET approval_status = @approval_status
            WHERE log_id = @log_id;
        `);
    return true;
}
}