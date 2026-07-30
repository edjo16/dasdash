import sql from 'mssql';
import Rules from '../../USERS/rule/DevTeam.js';
import USERModel from '../../USERS/model/USER.js';
import MeetingsModel from '../model/Meetings.js';
import BadacoModel from '../model/BadacoModel.js';

export default class MeetingsController {

  static async getMeetingsList(connection, req, res) {
    const UserID  = req.session?.userID;
    let devteam   = await Rules.validateTeam(req.session?.iddevteam, UserID);
    const pool = await sql.connect(connection);
    try {
      const usuario       = await USERModel.obtenerDatosUsuario(pool, UserID);
      const grupousuarios = devteam ? await USERModel.getGroupUsers(pool) : [];
      res.render('marketing/forms_marketing_meetings_list', {
        title: 'Meetings',
        userProfile: {
          UserName:      usuario.UserName,
          UsuarioID:     UserID,
          Dep:           usuario.Dep,
          cdepartamento: usuario.cdepartamento,
        },
        userMenu:   usuario.Menu,
        usuarios:   grupousuarios,
        devteam,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getMeetingsData(connection, req, res) {
    const UserID  = req.session?.userID;
    const page = parseInt(req.query.page) || 1;
    const limit   = parseInt(req.query.limit)  || 15;
    const search  = req.query.search           || null;
    const offset  = (page - 1) * limit;
    let devteam   = await Rules.validateTeam(req.session?.iddevteam, UserID);
    const pool = await sql.connect(connection);
    try {
      const rows       = await MeetingsModel.getAllMeetings(pool, UserID, devteam, limit, offset, search);
      const totalCount = await MeetingsModel.getTotalCount(pool, UserID, devteam, search);
      res.send({ result: 1, rows, totalCount });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getMeetingDetail(connection, req, res) {
    const UserID = req.session?.userID;
    const id     = req.params.id;
    let devteam  = await Rules.validateTeam(req.session?.iddevteam, UserID);
    const pool = await sql.connect(connection);
    try {
      const usuario               = await USERModel.obtenerDatosUsuario(pool, UserID);
      const users                 = await USERModel.getAllUserActive(pool, usuario.compania);
      const grupousuarios         = devteam ? await USERModel.getGroupUsers(pool) : [];
      const meeting               = await MeetingsModel.getMeetingById(pool, id);
      const actions               = await MeetingsModel.getActions(pool, id);
      const contacts              = await BadacoModel.getContactsForPicker(pool);
      const actionContactsRaw     = await MeetingsModel.getActionContactsByMeeting(pool, id);
      const actionResponsiblesRaw = await MeetingsModel.getActionResponsiblesByMeeting(pool, id);

      const actionContacts = {};
      actionContactsRaw.forEach(row => {
        const key = String(row.meeting_action_id);
        if (!actionContacts[key]) actionContacts[key] = [];
        actionContacts[key].push({ contact_id: row.contact_id, name: row.contact_name, company_name: row.company_name || '' });
      });

      const actionResponsibles = {};
      actionResponsiblesRaw.forEach(row => {
        const key = String(row.meeting_action_id);
        if (!actionResponsibles[key]) actionResponsibles[key] = [];
        actionResponsibles[key].push(row.responsible);
      });

      res.render('marketing/forms_marketing_meetings_detail', {
        title:    meeting ? meeting.meeting_name : 'Meeting',
        meeting,
        actions,
        meetActions: actions,
        contacts,
        actionContacts,
        actionResponsibles,
        users,
        userProfile: {
          UserName:      usuario.UserName,
          UsuarioID:     UserID,
          Dep:           usuario.Dep,
          cdepartamento: usuario.cdepartamento,
        },
        userMenu:   usuario.Menu,
        usuarios:   grupousuarios,
        devteam,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createMeeting(connection, req, res) {
    const { meeting_name, meeting_address, meeting_comments, user_id } = req.body;
    if (!meeting_name) return res.status(400).json({ error: 'meeting_name is required' });
    await sql.connect(connection);
    const transaction = new sql.Transaction();
    try {
      await transaction.begin();
      const result = await MeetingsModel.createMeeting(transaction, {
        meeting_name, meeting_address, meeting_comments, user_created: user_id,
      });
      await transaction.commit();
      res.send({ result: 1, id: result.id });
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      res.status(500).json({ error: error.message });
    }
  }

  static async updateMeeting(connection, req, res) {
    const id = req.params.id;
    await sql.connect(connection);
    const transaction = new sql.Transaction();
    try {
      await transaction.begin();
      const data = { ...req.body, umodificado: req.body.user_id };
      const result = await MeetingsModel.updateMeeting(transaction, id, data);
      await transaction.commit();
      res.send(result);
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteMeeting(connection, req, res) {
    const id = req.params.id;
    await sql.connect(connection);
    const transaction = new sql.Transaction();
    try {
      await transaction.begin();
      const result = await MeetingsModel.deleteMeeting(transaction, id);
      await transaction.commit();
      res.send(result);
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      res.status(500).json({ error: error.message });
    }
  }

  static async saveMeetingAction(connection, req, res) {
    const data = { ...req.body, uingreso: req.body.user_id };
    await sql.connect(connection);
    const transaction = new sql.Transaction();
    try {
      await transaction.begin();
      const result = await MeetingsModel.upsertAction(transaction, data);
      await transaction.commit();
      res.send(result);
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteMeetingAction(connection, req, res) {
    const id = req.params.id;
    await sql.connect(connection);
    const transaction = new sql.Transaction();
    try {
      await transaction.begin();
      const result = await MeetingsModel.deleteAction(transaction, id);
      await transaction.commit();
      res.send(result);
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      res.status(500).json({ error: error.message });
    }
  }

  static async updateMeetingAction(connection, req, res) {
    const id = req.params.id;
    await sql.connect(connection);
    const transaction = new sql.Transaction();
    try {
      await transaction.begin();
      const result = await MeetingsModel.updateAction(transaction, id, req.body);
      await transaction.commit();
      res.send(result);
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      res.status(500).json({ error: error.message });
    }
  }

  static async saveActionContact(connection, req, res) {
    const { meeting_action_id, contact_id } = req.body;
    await sql.connect(connection);
    const transaction = new sql.Transaction();
    try {
      await transaction.begin();
      const result = await MeetingsModel.addActionContact(transaction, meeting_action_id, contact_id);
      await transaction.commit();
      res.send(result);
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteActionContact(connection, req, res) {
    const { meeting_action_id, contact_id } = req.body;
    await sql.connect(connection);
    const transaction = new sql.Transaction();
    try {
      await transaction.begin();
      const result = await MeetingsModel.removeActionContact(transaction, meeting_action_id, contact_id);
      await transaction.commit();
      res.send(result);
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      res.status(500).json({ error: error.message });
    }
  }

  static async saveActionResponsible(connection, req, res) {
    const { meeting_action_id, responsible } = req.body;
    await sql.connect(connection);
    const transaction = new sql.Transaction();
    try {
      await transaction.begin();
      const result = await MeetingsModel.addActionResponsible(transaction, meeting_action_id, responsible);
      await transaction.commit();
      res.send(result);
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteActionResponsible(connection, req, res) {
    const { meeting_action_id, responsible } = req.body;
    await sql.connect(connection);
    const transaction = new sql.Transaction();
    try {
      await transaction.begin();
      const result = await MeetingsModel.removeActionResponsible(transaction, meeting_action_id, responsible);
      await transaction.commit();
      res.send(result);
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      res.status(500).json({ error: error.message });
    }
  }

  static async closeMeeting(connection, req, res) {
    const UserID      = req.body.user_id;
    const meeting_id  = req.params.id;
    const departamento = req.body.departamento;
    await sql.connect(connection);
    const transaction = new sql.Transaction();
    try {
      await transaction.begin();
      const usuario = await USERModel.obtenerDatosUsuario(transaction, UserID);
      const result = await MeetingsModel.closeMeeting(transaction, meeting_id, usuario.UserEmail, usuario.Dep, usuario.UserID);
      await transaction.commit();
      res.send(result);
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      res.status(500).json({ error: error.message });
    }
  }
}
