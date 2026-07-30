import sql from 'mssql';
import CRMModel from '../../CRM/model/CRM.js';
import { buildCrmCaseContext } from '../services/crm-context-service.js';
import { buildApprovalCaseContext } from '../services/approval-context-service.js';

function extractAIText(response) {
  if (!response) return '';
  if (typeof response.response === 'string') return response.response;
  if (typeof response.text === 'string') return response.text;
  if (typeof response.content === 'string') return response.content;
  return '';
}

function splitForStreaming(text, chunkSize = 180) {
  const value = String(text || '');
  if (!value) return [];
  const chunks = [];
  for (let i = 0; i < value.length; i += chunkSize) {
    chunks.push(value.slice(i, i + chunkSize));
  }
  return chunks;
}

function buildActionLabel(accion, approvalId) {
  if (!approvalId) return accion || 'chat';
  const base = `approval:${approvalId}:${accion || 'chat'}`;
  return base.length > 50 ? base.slice(0, 50) : base;
}

export default class AIController {
  static async #createLog(pool, crmId, solicitante, accion) {
    try {
      const result = await pool.request()
        .input('crm_id', sql.Int, crmId ? parseInt(crmId) : null)
        .input('solicitante', sql.VarChar, solicitante || 'unknown')
        .input('accion', sql.VarChar, accion || 'chat')
        .input('modelo', sql.VarChar, process.env.AI_MODEL || null)
        .query(`INSERT INTO log_ia_activity (crm_id, solicitante, accion, modelo)
                OUTPUT INSERTED.log_id
                VALUES (@crm_id, @solicitante, @accion, @modelo)`);
      return result.recordset[0]?.log_id ?? null;
    } catch (error) {
      console.error('[AI log] insert error:', error);
      return null;
    }
  }

  static async #closeLog(pool, logId, estado, respuestaChars = null) {
    if (!logId) return;
    try {
      await pool.request()
        .input('log_id', sql.Int, logId)
        .input('estado', sql.VarChar, estado)
        .input('respuesta_chars', sql.Int, respuestaChars)
        .query(`UPDATE log_ia_activity
                SET estado = @estado, frealizado = GETDATE(), respuesta_chars = @respuesta_chars
                WHERE log_id = @log_id`);
    } catch (error) {
      console.error('[AI log] update error:', error);
    }
  }

  static async #markLogSaved(pool, logId) {
    if (!logId) return;
    try {
      await pool.request()
        .input('log_id', sql.Int, logId)
        .query(`UPDATE log_ia_activity SET guardado_en_crm = 1 WHERE log_id = @log_id`);
    } catch (error) {
      console.error('[AI log] markSaved error:', error);
    }
  }

  static async getCrmContext(connection, req, res) {
    try {
      const crmId = Number(req.query.crm_id);
      const includeDocs = String(req.query.include_docs || '1') !== '0';
      const userId = req.session?.userID;

      const result = await buildCrmCaseContext(connection, crmId, includeDocs, userId);
      return res.status(result.status).json(result.payload);
    } catch (error) {
      console.error('[AI CRM context] error:', error);
      return res.status(500).json({ result: 0, error: 'Failed to build CRM context' });
    }
  }

  static async getApprovalContext(connection, req, res) {
    try {
      const approvalId = Number(req.query.approval_id);
      const includeDocs = String(req.query.include_docs || '1') !== '0';
      const userId = req.session?.userID;
      const devTeamUserId = req.session?.iddevteam;

      const result = await buildApprovalCaseContext(
        connection,
        approvalId,
        includeDocs,
        userId,
        devTeamUserId
      );

      return res.status(result.status).json(result.payload);
    } catch (error) {
      console.error('[AI Approval context] error:', error);
      return res.status(500).json({ result: 0, error: 'Failed to build Approval context' });
    }
  }

  static async AIcrmMessages(connection, req, res) {
    const {
      prompt,
      stream = false,
      crm_id = null,
      approval_id = null,
      solicitante = null,
      accion = 'chat'
    } = req.body;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const pool = await sql.connect(connection);
    const actionLabel = buildActionLabel(accion, approval_id);
    const logId = await AIController.#createLog(pool, crm_id, solicitante, actionLabel);

    try {
      const aiRes = await fetch(process.env.AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.AI_MODEL,
          prompt,
          stream: false
        })
      });

      if (!aiRes.ok) {
        throw new Error('AI service error status ' + aiRes.status);
      }

      const data = await aiRes.json();
      const text = extractAIText(data);
      const respLen = text.length;

      await AIController.#closeLog(pool, logId, 'closed', respLen);

      if (!stream) {
        return res.json({ ...data, log_id: logId });
      }

      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      res.write(JSON.stringify({ type: 'meta', log_id: logId }) + '\n');

      const chunks = splitForStreaming(text);
      for (const token of chunks) {
        res.write(JSON.stringify({ type: 'token', token }) + '\n');
      }

      res.write(JSON.stringify({ type: 'done', text, log_id: logId }) + '\n');
      return res.end();
    } catch (error) {
      console.error('AI proxy error:', error);
      await AIController.#closeLog(pool, logId, 'cancelled');

      if (stream) {
        try {
          res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
          res.write(JSON.stringify({ type: 'meta', log_id: logId }) + '\n');
          res.write(JSON.stringify({ type: 'error', message: 'Error calling AI service' }) + '\n');
          return res.end();
        } catch (_) {
          return res.status(500).json({ error: 'Error calling AI service' });
        }
      }

      return res.status(500).json({ error: 'Error calling AI service' });
    }
  }

  static async saveAISummaryAsMessage(connection, req, res) {
    const { crm_id, summary, log_id = null } = req.body;

    if (!crm_id || !summary) {
      return res.status(400).json({ error: 'crm_id and summary are required' });
    }

    const pool = await sql.connect(connection);
    const transaction = new sql.Transaction();

    try {
      await transaction.begin();

      const date = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
        .toISOString().slice(0, 19).replace('T', ' ');

      await CRMModel.createNewMessage(
        transaction,
        parseInt(crm_id),
        'AI Analysis',
        summary,
        null,
        'AI Assistance'
      );

      await CRMModel.updateCRMMain(transaction, parseInt(crm_id), date);
      await transaction.commit();

      if (log_id) await AIController.#markLogSaved(pool, parseInt(log_id));

      return res.json({ result: 1 });
    } catch (error) {
      try { await transaction.rollback(); } catch (_) {}
      console.error('AI save-as-message error:', error);
      return res.status(500).json({ error: 'Failed to save message' });
    }
  }
}