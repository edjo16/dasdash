import sql from 'mssql';
import { getQuery, getQueryCount, removeAccents, parseDate, parseDateComming, postMicrosoft } from '../functions.js';
import ApprovalFunctionsModel from '../../Approvals_functions/models/approval_functions.js';
export default class ApprovalModel {
  constructor() { }

  static async getApprovalsFilter(transaction, UserName, userAlias, limit, offset, process, status, search, solicitante_fecha, cierre_fecha, only_start, sql_where, justPayments, departamento) {
    let userAliasQuery = userAlias !== null ? `OR solicitante = @userAlias OR verificador = @userAlias OR aprobador = @userAlias OR firmante = @userAlias OR operador = @userAlias OR asignado = @userAlias OR ejecutor = @userAlias ` : ``
    let query = getQuery(status, sql_where, userAliasQuery)
    let order = ` ORDER BY solicitante_fecha DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    if (departamento !== null && departamento !== 'All') {
      query += ` AND log.departamento = @departamento`;
    }
    if (process !== null && process !== 'All') {
      query += ` AND proceso = @process`;
    }
    if (justPayments && justPayments !== 'All') {
      query += `AND af.ctipo_flujo = @justPayments`
    }
    if (solicitante_fecha !== null && cierre_fecha !== null) {
      if (only_start === "true") {
        query += ` AND (solicitante_fecha >= '${solicitante_fecha}' AND solicitante_fecha <= '${cierre_fecha}')`;
        order = `ORDER BY solicitante_fecha OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
      }
      else if (only_start === "false") {
        query += ` AND (solicitante_fecha >= '${solicitante_fecha}' AND cierre_fecha <= '${cierre_fecha}')`;
        order = ` ORDER BY solicitante_fecha OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
      }
    }
    if (search !== null) {
      query += ` AND (proceso LIKE @search OR detalle_proceso LIKE @search OR solicitante LIKE @search OR log.id LIKE @search)`;
    }

    query += order;

    const request = new sql.Request(transaction);
    request.input('UserName', sql.VarChar, UserName);
    if (userAlias !== null) request.input('userAlias', sql.VarChar, userAlias);
    if (process) request.input('process', sql.VarChar, process);
    if (justPayments !== "All") request.input('justPayments', sql.Int, justPayments);
    if (status) request.input('status', sql.VarChar, status);
    if (search) request.input('search', sql.VarChar, `%${search}%`);
    if (departamento) request.input('departamento', sql.VarChar, departamento);
    if (solicitante_fecha !== null && cierre_fecha !== null && only_start !== null) {
      request.input('solicitante_fecha', sql.DateTime, solicitante_fecha);
      request.input('cierre_fecha', sql.DateTime, cierre_fecha);
    }
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);
    const { recordset } = await request.query(query);
    return recordset;
  }
  static async totalCount(transaction, UserName, userAlias, process, status, search, solicitante_fecha, cierre_fecha, only_start, sql_where, justPayments, departamento) {
    let userAliasQuery = userAlias !== null ? `OR solicitante = @userAlias OR verificador = @userAlias OR aprobador = @userAlias OR firmante = @userAlias OR operador = @userAlias OR asignado = @userAlias OR ejecutor = @userAlias ` : ``
    let query = getQueryCount(status, sql_where, userAliasQuery)

    if (process !== null && process !== 'All') {
      query += ` AND proceso = @process`;
    }
    if (justPayments && justPayments !== 'All') {
      query += `AND af.ctipo_flujo = @justPayments`
    }
    if (departamento !== null && departamento !== 'All') {
      query += ` AND departamento = @departamento`;
    }
    if (solicitante_fecha !== null && cierre_fecha !== null) {
      if (only_start === "true") {
        query += ` AND (solicitante_fecha >= '${solicitante_fecha}' AND solicitante_fecha <= '${cierre_fecha}')`;
      }
      else if (only_start === "false") {
        query += ` AND (solicitante_fecha >= '${solicitante_fecha}' AND cierre_fecha <= '${cierre_fecha}')`;
      }
    }
    if (search !== null) {
      query += ` AND (proceso LIKE @search OR detalle_proceso LIKE @search OR solicitante LIKE @search OR log.id LIKE @search)`;
    }
    const request = new sql.Request(transaction);
    request.input('UserName', sql.VarChar, UserName);
    if (userAlias !== null) request.input('userAlias', sql.VarChar, userAlias);
    if (process) request.input('process', sql.VarChar, process);
    if (justPayments !== "All") request.input('justPayments', sql.Int, justPayments);
    if (status) request.input('status', sql.VarChar, status);
    if (search) request.input('search', sql.VarChar, `%${search}%`);
    if (departamento) request.input('departamento', sql.VarChar, departamento);
    if (solicitante_fecha !== null && cierre_fecha !== null && only_start == null) {
      request.input('solicitante_fecha', sql.DateTime, solicitante_fecha);
      request.input('cierre_fecha', sql.DateTime, cierre_fecha);
    }
    const { recordset } = await request.query(query);
    const result = recordset[0].totalCount;
    return result;
  }
  static async getApprovalsApprovedFilter(transaction, UserName, userAlias, limit, offset, process, status, search) {
    let query = "SELECT id, proceso, detalle_proceso as detalle_proceso, FORMAT(solicitante_fecha,'dd/MM/yyyy') AS s_fecha, solicitante, verificador, aprobador, operador, firmante, ejecutor, estado FROM log WHERE (solicitante = @UserName OR solicitante = @userAlias OR verificador = @UserName OR verificador = @userAlias OR aprobador = @UserName OR aprobador = @userAlias OR firmante = @UserName OR firmante = @userAlias OR ejecutor = @UserName OR ejecutor = @userAlias) AND (estado = 'Approved' or estado = 'Verified' or estado = 'Signed' or estado='Executed')";

    if (process !== null && process !== 'All') {
      query += ` AND proceso = @process`;
    }
    if (status !== null && status !== 'All') {
      query += ` AND estado = @status`;
    }
    if (search !== null) {
      query += ` AND (proceso LIKE @search OR detalle_proceso LIKE @search OR solicitante LIKE @search OR log.id LIKE @search)`;
    }

    query += `
            ORDER BY solicitante_fecha DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `;
    const request = new sql.Request(transaction);
    request.input('UserName', sql.VarChar, UserName);
    request.input('userAlias', sql.VarChar, userAlias);
    if (process) request.input('process', sql.VarChar, process);
    if (status) request.input('status', sql.VarChar, status);
    if (search) request.input('search', sql.VarChar, `%${search}%`);
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);

    return await request.query(query);

  }

  static async totalCountApproved(transaction, UserName, process, status, search) {
    let query = `SELECT COUNT(*) AS totalCount FROM log 
    WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR operador = @UserName OR firmante = @UserName OR ejecutor = @UserName)
    AND (estado = 'Approved' OR estado = 'Verified' OR estado = 'Signed' OR estado = 'Executed')
`;

    if (process !== null && process !== 'All') {
      query += ` AND proceso = @process`;
    }
    if (status !== null && status !== 'All') {
      query += ` AND estado = @status`;
    }
    if (search !== null) {
      query += ` AND (proceso LIKE @search OR detalle_proceso LIKE @search OR solicitante LIKE @search OR log.id LIKE @search)`;
    }

    const request = new sql.Request(transaction);
    request.input('UserName', sql.VarChar, UserName);
    if (process) request.input('process', sql.VarChar, process);
    if (status) request.input('status', sql.VarChar, status);
    if (search) request.input('search', sql.VarChar, `%${search}%`);

    return await request.query(query);
  }
  static async createLog(transaction, proceso, detalle_proceso, departamento, solicitante, date, verificador, aprobador, firmante, ejecutor, estado, monto, banco, username, moneda, mmonto, operador, cflow, ccompania, csuscriptor, sir_reference) {
    let id = null;
    let sql_query = `INSERT INTO log
    (proceso, detalle_proceso, departamento, solicitante, solicitante_fecha, verificador, aprobador, firmante, ejecutor, estado, monto, banco, UserID, moneda, mmonto, operador, asignado, cflow, ccompania, csuscriptor, sir_reference)
    OUTPUT INSERTED.id
    VALUES(@proceso, @detalle_proceso, @departamento, @solicitante, @solicitante_fecha, @verificador, @aprobador, @firmante, @ejecutor, @estado, @monto, @banco, @UserID, @moneda, @mmonto, @operador,@asignado, @cflow, @ccompania, @csuscriptor, @sir_reference);`;

    const request = new sql.Request(transaction);
    const { recordset } = await request
      .input('proceso', sql.NVarChar, proceso)
      .input('detalle_proceso', sql.NVarChar, detalle_proceso)
      .input('departamento', sql.NVarChar, departamento)
      .input('solicitante', sql.NVarChar, solicitante)
      .input('solicitante_fecha', sql.DateTime, date)
      .input('verificador', sql.NVarChar, verificador)
      .input('aprobador', sql.NVarChar, aprobador)
      .input('firmante', sql.NVarChar, firmante)
      .input('ejecutor', sql.NVarChar, ejecutor)
      .input('estado', sql.NVarChar, estado)
      .input('monto', sql.NVarChar, monto)
      .input('banco', sql.NVarChar, banco)
      .input('UserID', sql.NVarChar, username)
      .input('moneda', sql.NVarChar, moneda)
      .input('mmonto', sql.Float, mmonto)
      .input('operador', sql.NVarChar, 'N/A')
      .input('asignado', sql.NVarChar, 'N/A')
      .input('cflow', sql.Int, cflow)
      .input('ccompania', sql.Int, ccompania)
      .input('csuscriptor', sql.NVarChar, csuscriptor)
      .input('sir_reference', sql.NVarChar, sir_reference)
      .query(sql_query);
    id = recordset[0].id;
    return id;

  }

  static async getProcesos(transaction, UserName, sql_where) {
    const query = `
        SELECT DISTINCT(proceso) as proceso FROM log WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR ejecutor = @UserName ${sql_where}) AND proceso is not null `;
    const request = new sql.Request(transaction);
    request.input('UserName', sql.VarChar, UserName);
    const { recordset } = await request.query(query);
    return recordset
  }

  static async countTotalRecords(transaction, UserName) {
    const countQuery = `SELECT COUNT(*) AS total FROM log WHERE solicitante = @UserName`;
    const request = new sql.Request(transaction);
    request.input('UserName', sql.VarChar, UserName);
    const countResult = await request.query(countQuery);
    return countResult.recordset[0].total;
  }

  static async getLogById(transaction, RowID) {
    const query = `SELECT *, FORMAT(solicitante_fecha,'dd/MM/yyyy hh:mm tt') AS s_fecha,FORMAT(cierre_fecha,'dd/MM/yyyy hh:mm tt') AS cierre,FORMAT(verificador_fecha,'dd/MM/yyyy hh:mm tt') AS v_fecha,FORMAT(aprobador_fecha,'dd/MM/yyyy hh:mm tt') AS a_fecha,FORMAT(firmante_fecha,'dd/MM/yyyy hh:mm tt') AS f_fecha,FORMAT(operador_fecha,'dd/MM/yyyy hh:mm tt') AS o_fecha,FORMAT(ejecutor_fecha,'dd/MM/yyyy hh:mm tt') AS e_fecha, FORMAT(asignado_fecha,'dd/MM/yyyy hh:mm tt') AS as_fecha FROM log
            LEFT JOIN (
              SELECT id_original, id_nuevo, estado1
              FROM (
                SELECT id_original, id_nuevo, estado AS estado1,
                     ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
                FROM approval_asignado
              ) a
              WHERE rn = 1
            ) AS l ON log.id = l.id_original
            WHERE  id = @RowID`;
    const requestLog = new sql.Request(transaction);
    requestLog.input('RowID', sql.Int, RowID);
    const { recordset } = await requestLog.query(query);

    if (recordset.length < 1) throw new Error("Log no encontrado.");
    return recordset[recordset.length - 1];
  }
  static async getAllApprovalFlow(transaction) {
    const query = `SELECT * FROM approvals_flow`;
    const requestApprovalFlow = new sql.Request(transaction);
    const { recordset } = await requestApprovalFlow.query(query);

    if (recordset.length < 1) return 0;
    return recordset[0];
  }
  static async getApprovalFlow(transaction, flowId) {
    const query = `SELECT * FROM approvals_flow WHERE id = @flowId`;
    const requestApprovalFlow = new sql.Request(transaction);
    requestApprovalFlow.input('flowId', sql.Int, flowId);
    const { recordset } = await requestApprovalFlow.query(query);

    if (recordset.length < 1) return 0;
    return recordset[0];
  }
  static async getApprovalFlowByName(transaction, flowIndicator) {
    const query = `SELECT * FROM approvals_flow 
    LEFT JOIN mcompania AS c ON c.ccompania = approvals_flow.ccompania
    WHERE nombre = @flowIndicator`;

    const requestApprovalFlow = new sql.Request(transaction);
    requestApprovalFlow.input('flowIndicator', sql.VarChar, flowIndicator);
    const { recordset } = await requestApprovalFlow.query(query);

    if (recordset.length < 1) return 0;
    return recordset[0];
  }
  static async getMasterData(transaction, formID) {
    const query = `SELECT id, table_name FROM mform WHERE id = @formID`;
    const requestMasterData = new sql.Request(transaction);
    requestMasterData.input('formID', sql.Int, formID);
    const { recordset } = await requestMasterData.query(query);

    if (recordset.length < 1) throw new Error("Formulario no encontrado.");
    return recordset[0];
  }

  static async hasFatherApproval(transaction, aprovalChild) {
    const query = `SELECT id_original FROM approval_asignado WHERE id_nuevo = @aprovalChild`;
    const requestFather = new sql.Request(transaction);
    requestFather.input('aprovalChild', sql.Int, aprovalChild);
    const { recordset } = await requestFather.query(query);

    if (recordset.length < 1) return false;
    return recordset[0];
  }
  static async getApprovalsApproved(transaction, UserName) {
    const query = "SELECT id, proceso FROM log WHERE (solicitante = '" + UserName + "' or verificador = '" + UserName + "' or aprobador = '" + UserName + "' or firmante = '" + UserName + "' or ejecutor = '" + UserName + "') AND (estado = 'Approved' or estado = 'Verified' or estado = 'Signed' or estado='Executed') ORDER BY solicitante_fecha DESC";
    const request = new sql.Request(transaction);
    // request.input('UserName', sql.VarChar, UserName);
    return await request.query(query);
  }

  static async getApprovalsPending(transaction, UserName) {
    const query = `SELECT FORMAT(solicitante_fecha,'dd/MM/yyyy') AS s_fecha, log.*, l.id_nuevo, l.estado1 
        FROM log 
    LEFT JOIN (
      SELECT id_original, id_nuevo, estado1
      FROM (
        SELECT id_original, id_nuevo, estado AS estado1,
             ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
        FROM approval_asignado
      ) aa
      WHERE rn = 1
    ) AS l ON log.id = l.id_original
        WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR operador = @UserName OR asignado = @UserName OR ejecutor = @UserName)
        AND (estado = 'Verify' AND verificador = @UserName) OR (estado = 'Approve' AND aprobador = @UserName) OR (estado = 'Signature' AND firmante = @UserName) 
        OR (estado = 'Apply' AND operador = @UserName) OR (estado = 'Execute' AND ejecutor = @UserName) OR (estado = 'Execute' AND asignado = @UserName)
        AND (estado = 'Verify' OR estado = 'Approve' OR estado = 'Signature' OR estado = 'Apply' OR estado = 'Execute')
        ORDER BY solicitante_fecha DESC`;

    const request = new sql.Request(transaction);
    request.input('UserName', sql.VarChar, UserName);
    const { recordset } = await request.query(query);

    return recordset;

  }

  static async getApprovalsPendingAll(transaction, UserName, limit, offset, process, status, search, solicitante_fecha, cierre_fecha, only_start, sql_where, justPayments, departamento) {
    const query = `SELECT log.id, solicitante, proceso, detalle_proceso AS detalle_proceso, 
                   FORMAT(solicitante_fecha,'dd/MM/yyyy') AS s_fecha, 
                   verificador, aprobador, operador, firmante, ejecutor, asignado, csuscriptor, log.estado, 
                   ApprovalID, banco, pago, mmonto, moneda, cierre_fecha, l.estado1, af.ctipo_flujo 
        FROM log
    LEFT JOIN (
      SELECT id_original, id_nuevo, estado1
      FROM (
        SELECT id_original, id_nuevo, estado AS estado1,
             ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
        FROM approval_asignado
      ) ab
      WHERE rn = 1
    ) AS l ON log.id = l.id_original
        LEFT JOIN approvals_flow af ON log.cflow = af.id
    WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR operador = @UserName OR asignado = @UserName OR ejecutor = @UserName  or csuscriptor = @UserName ${sql_where}) and (log.estado != 'Cancelado')
    ORDER BY log.solicitante_fecha desc, id_original DESC, id_nuevo desc`
    const request = new sql.Request(transaction);
    request.input('UserName', sql.VarChar, UserName);
    const { recordset } = await request.query(query);
    let logTotalQuery = recordset
    var UserTotalEjecutando = 0
    var UserTotalRechazado = 0
    var UserTotal = 0
    let UserTotalPending = 0
    var TotalCancelados = 0
    var id_asignados = []
    var id_asignados_ejecutando = []
    var log_pendiente = []
    var log_ejecutando = []
    var log_ejecutados = []
    var log_rechazados = []
    for (let i = 0; i < logTotalQuery.length; i++) {
      // Estado en progreso
      if (logTotalQuery[i].verificador == UserName && logTotalQuery[i].estado == "Verify") {
        UserTotalPending++;
        log_pendiente.push(logTotalQuery[i])
      } else if (logTotalQuery[i].aprobador == UserName && logTotalQuery[i].estado == "Approve") {
        UserTotalPending++;
        log_pendiente.push(logTotalQuery[i])
      } else if (logTotalQuery[i].firmante == UserName && logTotalQuery[i].estado == "Signature") {
        UserTotalPending++;
        log_pendiente.push(logTotalQuery[i])
      } else if (logTotalQuery[i].operador == UserName && logTotalQuery[i].estado == "Apply") {
        UserTotalPending++;
        log_pendiente.push(logTotalQuery[i])
      } else if (logTotalQuery[i].asignado == UserName && logTotalQuery[i].estado == "Execute") {
        //Si el pedido de pago ya lo iniciaron no se debe mostrar como pendiente
        if (logTotalQuery[i].estado1 != "Rejected" && logTotalQuery[i].estado1 != "Cancelled") {
          id_asignados_ejecutando.push(logTotalQuery[i].id)
        }
        // Si el pago no lo han iniciado mostrar en pendiente
        if ((logTotalQuery[i].estado1 == "Rejected" || logTotalQuery[i].estado1 == "Cancelled") && !(id_asignados_ejecutando.includes(logTotalQuery[i].id)) || logTotalQuery[i].estado1 == null) {
          id_asignados.push(logTotalQuery[i].id)
          UserTotalPending++;
          log_pendiente.push(logTotalQuery[i])
        }
      } else if (logTotalQuery[i].ejecutor == UserName && logTotalQuery[i].estado == "Execute") {
        if (logTotalQuery[i].estado1 != 'Executed' && logTotalQuery[i].asignado != null && logTotalQuery[i].asignado != 'N/A') {
          //Si el pedido de pago ya lo iniciaron no se debe mostrar como pendiente
          if (logTotalQuery[i].estado1 != "Rejected") {
            id_asignados_ejecutando.push(logTotalQuery[i].id)
            UserTotalEjecutando++;
            log_ejecutando.push(logTotalQuery[i])
          }
          // Si el pago no lo han iniciado mostrar en pendiente
          if (logTotalQuery[i].estado1 == "Rejected" && !(id_asignados_ejecutando.includes(logTotalQuery[i].id))) {
            UserTotalEjecutando++;
            log_ejecutando.push(logTotalQuery[i])
          }
          // 
        } else if (logTotalQuery[i].estado1 == 'Executed' && logTotalQuery[i].estado == 'Execute' || logTotalQuery[i].estado1 == 'Approved' && logTotalQuery[i].estado == 'Execute') {
          UserTotalPending++;
          log_pendiente.push(logTotalQuery[i])
        } else {
          UserTotalPending++;
          log_pendiente.push(logTotalQuery[i])
        }
      }
      // Estado rechazado
      else if (logTotalQuery[i].estado == "Rejected" || logTotalQuery[i].estado == "Expired") {
        log_rechazados.push(logTotalQuery[i])
        UserTotalRechazado++
      }
      //Proceso finalizado
      else if (logTotalQuery[i].estado == "Verified" || logTotalQuery[i].estado == "Approved" || logTotalQuery[i].estado == "Signed" || logTotalQuery[i].estado == "Applied" || logTotalQuery[i].estado == "Executed") {
        UserTotal++
        log_ejecutados.push(logTotalQuery[i])
      } else if (logTotalQuery[i].estado == "Cancelled") {
        TotalCancelados++
      } else {
        //Si el flujo esta abierto
        UserTotalEjecutando++
        log_ejecutando.push(logTotalQuery[i])
      }
    }

    if (solicitante_fecha !== null && cierre_fecha !== null) {
      if (only_start === "true") {
        log_pendiente = log_pendiente.filter(item => {
          const dateOrigin = parseDate(item.s_fecha);
          const solicitanteFecha = parseDateComming(solicitante_fecha);
          const cierreFecha = parseDateComming(cierre_fecha);
          return dateOrigin >= solicitanteFecha && dateOrigin <= cierreFecha;
        });
      } else if (only_start === "false") {
        log_pendiente = log_pendiente.filter(item => {
          if (item.cierre_fecha !== null) {
            const dateOrigin = parseDate(item.s_fecha);
            const cierreFechaOrigin = parseDate(item.cierre_fecha);
            const solicitanteFecha = parseDateComming(solicitante_fecha);
            const cierreFecha = parseDateComming(cierre_fecha);
            return dateOrigin >= solicitanteFecha && cierreFechaOrigin <= cierreFecha;
          }
        });
      }
    }

    // Filtro por proceso (si es diferente de 'All')
    if (process && process !== 'All') {
      log_pendiente = log_pendiente.filter(item => item.proceso === process);
    }
    if (justPayments && justPayments !== 'All') {
      log_pendiente = log_pendiente.filter(item => item.ctipo_flujo == justPayments)
    }
    // Filtro por departamento
    if (departamento && departamento !== 'All') {
      log_pendiente = log_pendiente.filter(item => item.departamento === departamento);
    }
    // Filtro por búsqueda (en los campos solicitante, detalle_proceso, proceso, id)
    if (search) {
      log_pendiente = log_pendiente.filter(item => {
        return item.proceso.toLowerCase().includes(search.toLowerCase()) ||
          item.detalle_proceso.toLowerCase().includes(search.toLowerCase()) ||
          removeAccents(item.solicitante.toLowerCase()).startsWith(removeAccents(search.toLowerCase())) ||
          item.id.toString().includes(search);
      });
    }

    // Paginar los resultados: aplicar limit y offset sobre los resultados ya filtrados
    const results = log_pendiente.slice(offset, offset + limit);
    const totalResults = log_pendiente.length
    // Devolver los resultados filtrados y paginados
    return { results, totalResults };
  }


  static async getApprovalsOngoinAll(transaction, UserName, limit, offset, process, status, search, solicitante_fecha, cierre_fecha, only_start, sql_where, justPayments, departamento) {
    const query = `SELECT log.id, solicitante, proceso, detalle_proceso AS detalle_proceso, 
                   FORMAT(solicitante_fecha,'dd/MM/yyyy') AS s_fecha, 
                   verificador, aprobador, operador, firmante, ejecutor, asignado, csuscriptor, log.estado, 
                   ApprovalID, pago, banco, mmonto, moneda, cierre_fecha, l.estado1, af.ctipo_flujo 
        FROM log
    LEFT JOIN (
      SELECT id_original, id_nuevo, estado1
      FROM (
        SELECT id_original, id_nuevo, estado AS estado1,
             ROW_NUMBER() OVER (PARTITION BY id_original ORDER BY id_nuevo DESC) AS rn
        FROM approval_asignado
      ) ac
      WHERE rn = 1
    ) AS l ON log.id = l.id_original
        LEFT JOIN approvals_flow af ON log.cflow = af.id
                        WHERE (solicitante = @UserName OR verificador = @UserName OR aprobador = @UserName OR firmante = @UserName OR operador = @UserName OR asignado = @UserName OR ejecutor = @UserName or csuscriptor = @UserName ${sql_where}) and (log.estado != 'Cancelado')
                        ORDER BY log.solicitante_fecha desc, id_original DESC, id_nuevo desc`
    const request = new sql.Request(transaction);
    request.input('UserName', sql.VarChar, UserName);
    const { recordset } = await request.query(query);
    let logTotalQuery = recordset
    var UserTotalEjecutando = 0
    var UserTotalRechazado = 0
    var UserTotal = 0
    let UserTotalPending = 0
    var TotalCancelados = 0
    var id_asignados = []
    var id_asignados_ejecutando = []
    var log_pendiente = []
    var log_ejecutando = []
    var log_ejecutados = []
    var log_rechazados = []
    for (let i = 0; i < logTotalQuery.length; i++) {
      // Estado en progreso
      if (logTotalQuery[i].verificador == UserName && logTotalQuery[i].estado == "Verify") {
        UserTotalPending++;
        log_pendiente.push(logTotalQuery[i])
      } else if (logTotalQuery[i].aprobador == UserName && logTotalQuery[i].estado == "Approve") {
        UserTotalPending++;
        log_pendiente.push(logTotalQuery[i])
      } else if (logTotalQuery[i].firmante == UserName && logTotalQuery[i].estado == "Signature") {
        UserTotalPending++;
        log_pendiente.push(logTotalQuery[i])
      } else if (logTotalQuery[i].operador == UserName && logTotalQuery[i].estado == "Apply") {
        UserTotalPending++;
        log_pendiente.push(logTotalQuery[i])
      } else if (logTotalQuery[i].asignado == UserName && logTotalQuery[i].estado == "Execute") {
        //Si el pedido de pago ya lo iniciaron no se debe mostrar como pendiente
        if (logTotalQuery[i].estado1 != "Rejected") {
          id_asignados_ejecutando.push(logTotalQuery[i].id)
        }
        // Si el pago no lo han iniciado mostrar en pendiente
        if (logTotalQuery[i].estado1 == "Rejected" && !(id_asignados_ejecutando.includes(logTotalQuery[i].id)) || logTotalQuery[i].estado1 == null) {
          id_asignados.push(logTotalQuery[i].id)
          UserTotalPending++;
          log_pendiente.push(logTotalQuery[i])
        }
      } else if (logTotalQuery[i].ejecutor == UserName && logTotalQuery[i].estado == "Execute") {
        if (logTotalQuery[i].estado1 != 'Executed' && logTotalQuery[i].asignado != null && logTotalQuery[i].asignado != 'N/A') {
          //Si el pedido de pago ya lo iniciaron no se debe mostrar como pendiente
          if (logTotalQuery[i].estado1 != "Rejected") {
            id_asignados_ejecutando.push(logTotalQuery[i].id)
            UserTotalEjecutando++;
            log_ejecutando.push(logTotalQuery[i])
          }
          // Si el pago no lo han iniciado mostrar en pendiente
          if (logTotalQuery[i].estado1 == "Rejected" && !(id_asignados_ejecutando.includes(logTotalQuery[i].id))) {
            UserTotalEjecutando++;
            log_ejecutando.push(logTotalQuery[i])
          }
          // 
        } else if (logTotalQuery[i].estado1 == 'Executed' && logTotalQuery[i].estado == 'Execute' || logTotalQuery[i].estado1 == 'Approved' && logTotalQuery[i].estado == 'Execute') {
          UserTotalPending++;
          log_pendiente.push(logTotalQuery[i])
        } else {
          UserTotalPending++;
          log_pendiente.push(logTotalQuery[i])
        }
      }
      // Estado rechazado
      else if (logTotalQuery[i].estado == "Rejected" || logTotalQuery[i].estado == "Expired") {
        log_rechazados.push(logTotalQuery[i])
        UserTotalRechazado++
      }
      //Proceso finalizado
      else if (logTotalQuery[i].estado == "Verified" || logTotalQuery[i].estado == "Approved" || logTotalQuery[i].estado == "Signed" || logTotalQuery[i].estado == "Applied" || logTotalQuery[i].estado == "Executed") {
        UserTotal++
        log_ejecutados.push(logTotalQuery[i])
      } else if (logTotalQuery[i].estado == "Cancelled") {
        TotalCancelados++
      } else {
        //Si el flujo esta abierto
        UserTotalEjecutando++
        log_ejecutando.push(logTotalQuery[i])
      }
    }
    if (solicitante_fecha !== null && cierre_fecha !== null) {
      if (only_start === "true") {
        log_ejecutando = log_ejecutando.filter(item => {
          const dateOrigin = parseDate(item.s_fecha);
          const solicitanteFecha = parseDateComming(solicitante_fecha);
          const cierreFecha = parseDateComming(cierre_fecha);
          return dateOrigin >= solicitanteFecha && dateOrigin <= cierreFecha;
        });
      } else if (only_start === "false") {
        log_ejecutando = log_ejecutando.filter(item => {
          if (item.cierre_fecha !== null) {
            const dateOrigin = parseDate(item.s_fecha);
            const cierreFechaOrigin = parseDate(item.cierre_fecha);
            const solicitanteFecha = parseDateComming(solicitante_fecha);
            const cierreFecha = parseDateComming(cierre_fecha);
            return dateOrigin >= solicitanteFecha && cierreFechaOrigin <= cierreFecha;
          }
        });
      }
    }

    // Filtro por proceso (si es diferente de 'All')
    if (process && process !== 'All') {
      log_ejecutando = log_ejecutando.filter(item => item.proceso === process);
    }
    if (justPayments && justPayments !== 'All') {
      log_ejecutando = log_ejecutando.filter(item => item.ctipo_flujo == justPayments)
    }
    // Filtro por departamento
    if (departamento && departamento !== 'All') {
      log_ejecutando = log_ejecutando.filter(item => item.departamento === departamento);
    }
    // Filtro por búsqueda (en los campos solicitante, detalle_proceso, proceso, id)
    if (search) {
      log_ejecutando = log_ejecutando.filter(item => {
        return item.proceso.toLowerCase().includes(search.toLowerCase()) ||
          item.detalle_proceso.toLowerCase().includes(search.toLowerCase()) ||
          removeAccents(item.solicitante.toLowerCase()).startsWith(removeAccents(search.toLowerCase())) ||
          item.id.toString().includes(search);
      });
    }


    // Paginar los resultados: aplicar limit y offset sobre los resultados ya filtrados
    const results = log_ejecutando.slice(offset, offset + limit);
    const totalResults = log_ejecutando.length
    // Devolver los resultados filtrados y paginados
    return { results, totalResults };
  }

  static async getOriginalApprovalFlow(transaction, flowId) {
    const query = `SELECT * FROM approval_asignado WHERE id_nuevo = @flowId`;
    const requestApprovalFlow = new sql.Request(transaction);
    requestApprovalFlow.input('flowId', sql.Int, flowId);
    const { recordset } = await requestApprovalFlow.query(query);
    return recordset;
  }

  static async getSupportApprovalFlow(transaction, flowId) {
    const query = `SELECT * FROM approval_asignado WHERE id_original = @flowId`;
    const requestApprovalFlow = new sql.Request(transaction);
    requestApprovalFlow.input('flowId', sql.Int, flowId);
    const { recordset } = await requestApprovalFlow.query(query);
    return recordset[0];
  }
  static async ApprovalCreation(transaction, proceso, detalle_proceso, departamento, solicitante, date, verificador, aprobador, firmante, ejecutor, estado, cifra, banco, username, moneda, mmonto, operador, asignado, approvals_select, ccompania, req, ruta, mform, form_id, remittance, beneficiarioInfo = null, firmprocess) {
    try {
      const isDuplicate = await ApprovalModel.existsDuplicate(transaction, proceso, detalle_proceso, solicitante, date, firmprocess);
      if (isDuplicate) {
        console.log('Duplicate request: a request for this firm is already made for this date.');
      } else {
        const query = `INSERT INTO log
              (proceso, detalle_proceso, departamento, solicitante, solicitante_fecha, verificador, aprobador, firmante, ejecutor, estado, monto, banco, UserID, moneda, mmonto, operador, asignado, cflow, ccompania, mform, form_id , remittance, beneficiario)
              OUTPUT INSERTED.id  -- Esto devolverá el id de la fila insertada
              VALUES(@proceso, @detalle_proceso, @departamento, @solicitante, @solicitante_fecha, @verificador, @aprobador, @firmante, @ejecutor, @estado, @monto, @banco, @UserID, @moneda, @mmonto, @operador, @asignado, @cflow, @ccompania, @mform, @form_id, @remittance, @beneficiario);`;
        const requestcreatelog = new sql.Request(transaction);
        let beneficiarioPassed = beneficiarioInfo !== null && beneficiarioInfo.beneficiario_id !== undefined ? beneficiarioInfo.beneficiario_id : null
        const result = await requestcreatelog
          .input('proceso', sql.VarChar, proceso)
          .input('detalle_proceso', sql.VarChar, detalle_proceso)
          .input('departamento', sql.VarChar, departamento)
          .input('solicitante', sql.VarChar, solicitante)
          .input('solicitante_fecha', sql.DateTime, date)
          .input('verificador', sql.VarChar, verificador)
          .input('aprobador', sql.VarChar, aprobador)
          .input('firmante', sql.VarChar, firmante)
          .input('ejecutor', sql.VarChar, ejecutor)
          .input('estado', sql.VarChar, estado)
          .input('monto', sql.VarChar, cifra)
          .input('banco', sql.VarChar, banco)
          .input('UserID', sql.VarChar, username)
          .input('moneda', sql.VarChar, moneda)
          .input('mmonto', sql.Float, mmonto)
          .input('operador', sql.VarChar, operador)
          .input('asignado', sql.VarChar, 'N/A')
          .input('cflow', sql.Int, approvals_select)
          .input('ccompania', sql.Int, ccompania)
          .input('mform', sql.Int, mform)
          .input('form_id', sql.Int, form_id)
          .input('remittance', sql.Int, remittance)
          .input('beneficiario', sql.Int, beneficiarioPassed)
          .query(query);
        const RowID = result.recordset[0].id;
        try {
          await ApprovalFunctionsModel.FileApprovalCreation(transaction, RowID, proceso, departamento, approvals_select, req, ruta, mform, form_id, beneficiarioInfo, banco);
        } catch (fileError) {
          throw fileError;
        }
        try {
          await postMicrosoft(RowID);
        } catch (error) {
          console.error("Error in postMicrosoft:", error);
        }
        return RowID;
      }
    } catch (error) {
      console.error('Error in ApprovalCreation:', error);
      throw error;
    }
  }

  static async existsDuplicate(transaction, proceso, detalle_proceso, solicitante, fecha, firmante) {
    if (firmante && firmante.includes("staff")) {
      return false;
    }
    const query = `
      SELECT TOP 1 id FROM log
      WHERE proceso = @proceso
        AND detalle_proceso = @detalle_proceso
        AND solicitante = @solicitante
        AND solicitante_fecha >= DATEADD(MINUTE, -5, @fecha)
        AND solicitante_fecha <= @fecha
    `;
    const request = new sql.Request(transaction);
    request.input('proceso', sql.VarChar, proceso);
    request.input('detalle_proceso', sql.VarChar, detalle_proceso);
    request.input('solicitante', sql.VarChar, solicitante);
    request.input('fecha', sql.DateTime, fecha);
    const { recordset } = await request.query(query);
    return recordset.length > 0;
  }
  static async CancelledApproval(transaction, id) {
    const query = `UPDATE log SET estado = 'Cancelled' WHERE id = @id`;
    const requestApprovalCancel = new sql.Request(transaction);
    requestApprovalCancel.input('id', sql.Int, id);
    await requestApprovalCancel.query(query);
  }
  static async FinAsignado(transaction, id) {
    const query = `SELECT id_nuevo FROM approval_asignado WHERE id_nuevo = @id And estado <> 'Cancelled'`;
    const requestApprovalCancel = new sql.Request(transaction);
    requestApprovalCancel.input('id', sql.Int, id);
    const { recordset } = await requestApprovalCancel.query(query);
    return recordset.length > 0;
  }
  static async CancelledApprovalAsignado(transaction, id) {
    const query = `UPDATE approval_asignado SET estado = 'Cancelled' WHERE id_nuevo = @id`;
    const requestApprovalCancel = new sql.Request(transaction);
    requestApprovalCancel.input('id', sql.Int, id);
    await requestApprovalCancel.query(query);
  }
  static async ReadBeneficiaryFromBank(transaction, compania, departamento, departamento_id, q = '', limit = 25) {
    let baseWhere = `compania = @compania AND (estado = 1 OR estado IS NULL)`;
    if (!(departamento.includes('Accounting') || departamento.includes('Finance'))) {
      baseWhere += ` AND departamento = @departamento_id`;
    }
    let query = `SELECT beneficiario_id, departamento, cuenta_banco_beneficiario, cuenta_banco, direcion_beneficiario, direccion, IBAN, ABA, SORT, SWIFT, state_branch, banco_beneficiario, banco_intermediario, direccion_banco_intermediario, IBAN_banco_intermediario, ABA_banco_intermediario, SWIFT_banco_intermediario, SORT_banco_intermediario, state_branch_banco_intermediario, pais_beneficiario, pais_intermediario,
                 cable_beneficiario, cable_intermediario, cuenta_banco_intermediario, tipo_cuenta, display_name
                 FROM approval_mbeneficiary
                 WHERE ${baseWhere}`;
    if (q && q.trim() !== '') {
      query += ` AND (
        cuenta_banco_beneficiario LIKE @q OR
        banco_beneficiario LIKE @q OR
        cuenta_banco LIKE @q OR
        direccion LIKE @q OR
        IBAN LIKE @q OR
        SWIFT LIKE @q
      )`;
    }
    query += ` ORDER BY cuenta_banco_beneficiario OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY`;
    const requestApprovalBeneficiary = new sql.Request(transaction);
    requestApprovalBeneficiary.input('compania', sql.VarChar, compania);
    requestApprovalBeneficiary.input('departamento_id', sql.VarChar, departamento_id);
    if (q && q.trim() !== '') {
      requestApprovalBeneficiary.input('q', sql.VarChar, `%${q}%`);
    }
    requestApprovalBeneficiary.input('limit', sql.Int, limit);
    const { recordset } = await requestApprovalBeneficiary.query(query);
    return recordset
  }

  static async ListBeneficiariesPaged(transaction, compania, companiesInfo, depIds, q = '', page = 1, limit = 15, dep_filter = null, estado = null) {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 15;
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const offset = (safePage - 1) * safeLimit;

    const companyIds = (companiesInfo && companiesInfo.length > 0)
      ? companiesInfo.map(c => c.ccompania)
      : [compania];
    const compPlaceholders = companyIds.map((_, i) => `@comp${i}`).join(', ');
    let where = `amb.compania IN (${compPlaceholders})`;

    let depPlaceholders = '';
    if (!depIds.includes(1)) {

      if (depIds.length > 0) {
        depPlaceholders = depIds.map((_, i) => `@dep${i}`).join(', ');
        where += ` AND amb.departamento IN (${depPlaceholders})`;
      }
      else {
        where += ` AND 1 = 0`;
      }
    }
    if (dep_filter !== null && dep_filter !== undefined) {
      where += ` AND amb.departamento = @dep_filter`;
    }
    if (estado !== null && estado !== undefined) {
      where += ` AND amb.estado = @estado`;
    }
    const hasQ = typeof q === 'string' && q.trim() !== '';
    if (hasQ) {
      where += `
        AND (
          amb.cuenta_banco_beneficiario LIKE @q OR
          amb.banco_beneficiario        LIKE @q OR
          amb.cuenta_banco              LIKE @q OR
          amb.display_name              LIKE @q
        )`;
    }

    const dataQuery = `
      SELECT 
        mpais_ben.cpais  AS cpais_beneficiario,
        mpais_ben.xnombre_pais_ingles AS pais_beneficiario_nombre,
        mpais_int.cpais  AS cpais_intermediario,
        mdep.nombre      AS nombre_departamento,
        amb.compania,
        amb.beneficiario_id,
        amb.departamento,
        amb.cuenta_banco_beneficiario,
        amb.cuenta_banco,
        amb.direcion_beneficiario,
        amb.display_name,
        amb.direccion,
        amb.IBAN,
        amb.ABA,
        amb.SORT,
        amb.SWIFT,
        amb.state_branch,
        amb.banco_beneficiario,
        amb.banco_intermediario,
        amb.direccion_banco_intermediario,
        amb.IBAN_banco_intermediario,
        amb.ABA_banco_intermediario,
        amb.SWIFT_banco_intermediario,
        amb.SORT_banco_intermediario,
        amb.state_branch_banco_intermediario,
        amb.pais_beneficiario,
        amb.pais_intermediario,
        amb.cable_beneficiario,
        amb.cable_intermediario,
        amb.cuenta_banco_intermediario,
        amb.tipo_cuenta,
        mtipo.tipo_cuenta AS tipo_cuenta_nombre,
        amb.estado
      FROM approval_mbeneficiary AS amb
      LEFT JOIN mdepartamento AS mdep
            ON mdep.id = amb.departamento
      LEFT JOIN m_pais AS mpais_ben
            ON mpais_ben.cpais = amb.pais_beneficiario
      LEFT JOIN m_pais AS mpais_int
            ON mpais_int.cpais = amb.pais_intermediario
      LEFT JOIN approval_mbtipo_cuenta AS mtipo
            ON mtipo.tipo_cuenta_id = amb.tipo_cuenta
      WHERE ${where}
      ORDER BY amb.cuenta_banco_beneficiario ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM approval_mbeneficiary AS amb
      WHERE ${where};
    `;

    const req = new sql.Request(transaction);
    companyIds.forEach((val, i) => req.input(`comp${i}`, sql.Int, val));
    depIds.forEach((val, i) => req.input(`dep${i}`, sql.Int, val));
    if (dep_filter !== null && dep_filter !== undefined) req.input('dep_filter', sql.Int, dep_filter);
    if (estado !== null && estado !== undefined) req.input('estado', sql.Int, estado);
    if (hasQ) req.input('q', sql.VarChar, `%${q.trim()}%`);
    req.input('offset', sql.Int, offset);
    req.input('limit', sql.Int, safeLimit);

    const dataRes = await req.query(dataQuery);

    const reqCount = new sql.Request(transaction);
    companyIds.forEach((val, i) => reqCount.input(`comp${i}`, sql.Int, val));
    depIds.forEach((val, i) => reqCount.input(`dep${i}`, sql.Int, val));
    if (dep_filter !== null && dep_filter !== undefined) reqCount.input('dep_filter', sql.Int, dep_filter);
    if (estado !== null && estado !== undefined) reqCount.input('estado', sql.Int, estado);
    if (hasQ) reqCount.input('q', sql.VarChar, `%${q.trim()}%`);

    const countRes = await reqCount.query(countQuery);

    return {
      rows: dataRes.recordset,
      total: countRes.recordset[0]?.total ?? 0
    };
  }
  static async GetTipoCuenta(transaction) {
    const request = new sql.Request(transaction);
    const { recordset } = await request.query(`SELECT tipo_cuenta_id, tipo_cuenta FROM approval_mbtipo_cuenta ORDER BY tipo_cuenta`);
    return recordset;
  }

  static async GetMonedas(transaction) {
    const request = new sql.Request(transaction);
    const { recordset } = await request.query(
      `SELECT cmoneda, xnombre_moneda_ingles, xabrev_moneda FROM sir_mmone ORDER BY CASE WHEN cmoneda = 1 THEN 0 WHEN cmoneda = 2 THEN 1 ELSE 2 END, xnombre_moneda_ingles;`
    );
    return recordset;
  }

  static async GetBeneficiaryMonedas(transaction, beneficiario_id) {
    const request = new sql.Request(transaction);
    request.input('beneficiario_id', sql.Int, parseInt(beneficiario_id));
    const { recordset } = await request.query(
      `SELECT cmoneda FROM approval_mbeneficiary_moneda WHERE beneficiario_id = @beneficiario_id`
    );
    return recordset.map(r => r.cmoneda);
  }

  static async SaveBeneficiaryMonedas(transaction, beneficiario_id, monedas) {
    const benId = parseInt(beneficiario_id);
    const delReq = new sql.Request(transaction);
    delReq.input('beneficiario_id', sql.Int, benId);
    await delReq.query(`DELETE FROM approval_mbeneficiary_moneda WHERE beneficiario_id = @beneficiario_id`);
    if (Array.isArray(monedas) && monedas.length > 0) {
      for (const cmoneda of monedas) {
        const insReq = new sql.Request(transaction);
        insReq.input('beneficiario_id', sql.Int, benId);
        insReq.input('cmoneda', sql.VarChar, String(cmoneda));
        await insReq.query(
          `INSERT INTO approval_mbeneficiary_moneda (beneficiario_id, cmoneda) VALUES (@beneficiario_id, @cmoneda)`
        );
      }
    }
  }

  static async CheckDuplicateCuentaBanco(transaction, cuenta_banco, cuenta_banco_beneficiario, departamento, excludeId = null) {
    const request = new sql.Request(transaction);
    request.input('cuenta_banco', sql.VarChar, cuenta_banco);
    request.input('cuenta_banco_beneficiario', sql.VarChar, cuenta_banco_beneficiario);
    request.input('departamento', sql.Int, Number(departamento));
    let query = `SELECT COUNT(*) AS total FROM approval_mbeneficiary WHERE cuenta_banco = @cuenta_banco and cuenta_banco_beneficiario = @cuenta_banco_beneficiario and departamento = @departamento `;
    if (excludeId !== null && excludeId !== undefined && excludeId !== '') {
      request.input('excludeId', sql.Int, excludeId);
      query += ` AND beneficiario_id <> @excludeId`;
    }
    const { recordset } = await request.query(query);
    return recordset[0].total > 0;
  }
  static async GetBeneficiaryById(transaction, beneficiario_id) {
    const req = new sql.Request(transaction);
    req.input('beneficiario_id', sql.Int, parseInt(beneficiario_id));
    const { recordset } = await req.query(`
  SELECT
    pais_ben.cpais AS cpais_beneficiario, pais_int.cpais AS cpais_intermediario,
    amb.beneficiario_id,amb.departamento, amb.compania, amb.cuenta_banco_beneficiario, amb.cuenta_banco,
    amb.direcion_beneficiario, amb.display_name, amb.direccion, amb.IBAN,amb.ABA,amb.SORT,amb.SWIFT,amb.state_branch,amb.banco_beneficiario,amb.banco_intermediario,
    amb.direccion_banco_intermediario, amb.IBAN_banco_intermediario, amb.ABA_banco_intermediario, amb.SWIFT_banco_intermediario,
    amb.SORT_banco_intermediario, amb.state_branch_banco_intermediario, amb.pais_beneficiario, amb.pais_intermediario, amb.cable_beneficiario, amb.cable_intermediario, amb.cuenta_banco_intermediario, amb.tipo_cuenta, amb.tipo_cuenta_intermediario, amb.estado,
    amb.uingreso,
    FORMAT(amb.fingreso,    'dd/MM/yyyy HH:mm') AS fingreso,
    amb.umodificado,
    FORMAT(amb.fmodificado, 'dd/MM/yyyy HH:mm') AS fmodificado
  FROM approval_mbeneficiary AS amb
  LEFT JOIN m_pais AS pais_ben
         ON pais_ben.cpais = amb.pais_beneficiario
  LEFT JOIN m_pais AS pais_int
         ON pais_int.cpais = amb.pais_intermediario
  WHERE amb.beneficiario_id = @beneficiario_id;
`);
    return recordset[0] || null;
  }

  static async CreateBeneficiary(transaction, data, userInfo) {
    // Decide si es creación o edición (upsert básico por beneficiario_id)
    const isUpdate = data.beneficiario_id !== undefined && data.beneficiario_id !== null && data.beneficiario_id !== '';
    let user = data.uingreso || data.user
    if (isUpdate) {
      const updateQuery = `UPDATE approval_mbeneficiary
        SET 
            cuenta_banco_beneficiario = @cuenta_banco_beneficiario,
            cuenta_banco = @cuenta_banco,
            direcion_beneficiario = @direcion_beneficiario,
            display_name = @display_name,
            direccion = @direccion,
            IBAN = @IBAN,
            ABA = @ABA,
            SWIFT = @SWIFT,
            SORT = @SORT,
            state_branch = @state_branch,
            banco_beneficiario = @banco_beneficiario,
            banco_intermediario = @banco_intermediario,
            direccion_banco_intermediario = @direccion_banco_intermediario,
            IBAN_banco_intermediario = @IBAN_banco_intermediario,
            ABA_banco_intermediario = @ABA_banco_intermediario,
            state_branch_banco_intermediario = @state_branch_banco_intermediario,
            SWIFT_banco_intermediario = @SWIFT_banco_intermediario,
            SORT_banco_intermediario = @SORT_banco_intermediario,
            pais_beneficiario = @pais_beneficiario,
            pais_intermediario = @pais_intermediario,
            cable_beneficiario = @cable_beneficiario,
            cable_intermediario = @cable_intermediario,
            cuenta_banco_intermediario= @cuenta_banco_intermediario,
            tipo_cuenta = @tipo_cuenta,
            tipo_cuenta_intermediario = @tipo_cuenta_intermediario,
            estado = @estado,
            umodificado = @umodificado,
            fmodificado = GETDATE()
        WHERE beneficiario_id = @beneficiario_id;
        SELECT * FROM approval_mbeneficiary WHERE beneficiario_id = @beneficiario_id;`;
      const request = new sql.Request(transaction);
      const { recordset } = await request
        .input('cuenta_banco_beneficiario', sql.VarChar, data.cuenta_banco_beneficiario ?? null)
        .input('cuenta_banco', sql.VarChar, data.cuenta_banco ?? null)
        .input('direcion_beneficiario', sql.VarChar, data.direcion_beneficiario ?? null)
        .input('display_name', sql.VarChar, data.display_name ?? null)
        .input('direccion', sql.VarChar, data.direccion ?? null)
        .input('IBAN', sql.VarChar, data.IBAN ?? null)
        .input('ABA', sql.VarChar, data.ABA ?? null)
        .input('SWIFT', sql.VarChar, data.SWIFT ?? null)
        .input('SORT', sql.VarChar, data.SORT ?? null)
        .input('state_branch', sql.VarChar, data.state_branch ?? null)
        .input('banco_beneficiario', sql.VarChar, data.banco_beneficiario ?? null)
        .input('banco_intermediario', sql.VarChar, data.banco_intermediario ?? null)
        .input('direccion_banco_intermediario', sql.VarChar, data.direccion_banco_intermediario ?? null)
        .input('IBAN_banco_intermediario', sql.VarChar, data.IBAN_banco_intermediario ?? null)
        .input('ABA_banco_intermediario', sql.VarChar, data.ABA_banco_intermediario ?? null)
        .input('state_branch_banco_intermediario', sql.VarChar, data.state_branch_banco_intermediario ?? null)
        .input('SWIFT_banco_intermediario', sql.VarChar, data.SWIFT_banco_intermediario ?? null)
        .input('SORT_banco_intermediario', sql.VarChar, data.SORT_banco_intermediario ?? null)
        .input('pais_beneficiario', sql.Int, data.pais_beneficiario ?? null)
        .input('pais_intermediario', sql.Int, data.pais_intermediario ?? null)
        .input('umodificado', sql.VarChar, user ?? null)
        .input('beneficiario_id', sql.Int, data.beneficiario_id)
        .input('cable_beneficiario', sql.VarChar, data.cable_beneficiario ?? null)
        .input('cable_intermediario', sql.VarChar, data.cable_intermediario ?? null)
        .input('cuenta_banco_intermediario', sql.VarChar, data.cuenta_banco_intermediario ?? null)
        .input('tipo_cuenta', sql.Int, data.tipo_cuenta ? parseInt(data.tipo_cuenta) : null)
        .input('tipo_cuenta_intermediario', sql.Int, data.tipo_cuenta_intermediario ? parseInt(data.tipo_cuenta_intermediario) : null)
        .input('estado', sql.Int, data.estado !== undefined && data.estado !== '' ? parseInt(data.estado) : 1)

        .query(updateQuery);
      if (data.monedas !== undefined) {
        await ApprovalModel.SaveBeneficiaryMonedas(transaction, data.beneficiario_id, data.monedas);
      }
      return recordset[0];
    } else {
      // Insert: asumimos que beneficiario_id es identidad y no se envía valor; si no lo es, usar data.beneficiario_id
      const insertQuery = `INSERT INTO approval_mbeneficiary
        (cuenta_banco_beneficiario, departamento, cuenta_banco, direcion_beneficiario, display_name, direccion, IBAN, ABA, SORT, SWIFT, state_branch, banco_beneficiario, banco_intermediario, direccion_banco_intermediario, IBAN_banco_intermediario, ABA_banco_intermediario, SWIFT_banco_intermediario, state_branch_banco_intermediario, SORT_banco_intermediario, compania, uingreso, pais_beneficiario, pais_intermediario, cable_beneficiario, cable_intermediario, cuenta_banco_intermediario, tipo_cuenta, tipo_cuenta_intermediario, estado)
        OUTPUT INSERTED.beneficiario_id, INSERTED.cuenta_banco_beneficiario
        VALUES(@cuenta_banco_beneficiario, @departamento, @cuenta_banco, @direcion_beneficiario, @display_name, @direccion, @IBAN, @ABA, @SORT, @SWIFT, @state_branch, @banco_beneficiario, @banco_intermediario, @direccion_banco_intermediario, @IBAN_banco_intermediario, @ABA_banco_intermediario, @SWIFT_banco_intermediario, @state_branch_banco_intermediario, @SORT_banco_intermediario, @compania, @uingreso, @pais_beneficiario, @pais_intermediario, @cable_beneficiario, @cable_intermediario, @cuenta_banco_intermediario, @tipo_cuenta, @tipo_cuenta_intermediario, @estado );
        SELECT * FROM approval_mbeneficiary WHERE beneficiario_id = SCOPE_IDENTITY();`;
      const request = new sql.Request(transaction);
      const { recordset } = await request
        .input('cuenta_banco_beneficiario', sql.VarChar, data.cuenta_banco_beneficiario ?? null)
        .input('departamento', sql.Int, (data.departamento_modal && data.departamento_modal !== '') ? parseInt(data.departamento_modal) : (userInfo.Dep ?? null))
        .input('cuenta_banco', sql.VarChar, data.cuenta_banco ?? null)
        .input('direcion_beneficiario', sql.VarChar, data.direcion_beneficiario ?? null)
        .input('display_name', sql.VarChar, data.display_name ?? null)
        .input('direccion', sql.VarChar, data.direccion ?? null)
        .input('IBAN', sql.VarChar, data.IBAN ?? null)
        .input('ABA', sql.VarChar, data.ABA ?? null)
        .input('SORT', sql.VarChar, data.SORT ?? null)
        .input('SWIFT', sql.VarChar, data.SWIFT ?? null)
        .input('state_branch', sql.VarChar, data.state_branch ?? null)
        .input('banco_beneficiario', sql.VarChar, data.banco_beneficiario ?? null)
        .input('banco_intermediario', sql.VarChar, data.banco_intermediario ?? null)
        .input('direccion_banco_intermediario', sql.VarChar, data.direccion_banco_intermediario ?? null)
        .input('IBAN_banco_intermediario', sql.VarChar, data.IBAN_banco_intermediario ?? null)
        .input('ABA_banco_intermediario', sql.VarChar, data.ABA_banco_intermediario ?? null)
        .input('SWIFT_banco_intermediario', sql.VarChar, data.SWIFT_banco_intermediario ?? null)
        .input('state_branch_banco_intermediario', sql.VarChar, data.state_branch_banco_intermediario ?? null)
        .input('SORT_banco_intermediario', sql.VarChar, data.SORT_banco_intermediario ?? null)
        .input('pais_beneficiario', sql.Int, data.pais_beneficiario ?? null)
        .input('pais_intermediario', sql.Int, data.pais_intermediario ?? null)
        .input('compania', sql.VarChar, (data.compania_modal && data.compania_modal !== '') ? String(data.compania_modal) : (userInfo.compania ?? null))
        .input('uingreso', sql.VarChar, data.user ?? null)
        .input('cable_beneficiario', sql.VarChar, data.cable_beneficiario ?? null)
        .input('cable_intermediario', sql.VarChar, data.cable_intermediario ?? null)
        .input('cuenta_banco_intermediario', sql.VarChar, data.cuenta_banco_intermediario ?? null)
        .input('tipo_cuenta', sql.Int, data.tipo_cuenta ? parseInt(data.tipo_cuenta) : null)
        .input('tipo_cuenta_intermediario', sql.Int, data.tipo_cuenta_intermediario ? parseInt(data.tipo_cuenta_intermediario) : null)
        .input('estado', sql.Int, data.estado !== undefined && data.estado !== '' ? parseInt(data.estado) : 1)
        .query(insertQuery);
      // La segunda selección devuelve fila completa; tomamos la última por seguridad
      const inserted = recordset[recordset.length - 1];
      if (data.monedas !== undefined && inserted?.beneficiario_id) {
        await ApprovalModel.SaveBeneficiaryMonedas(transaction, inserted.beneficiario_id, data.monedas);
      }
      return inserted;
    }
  }
  static async ReadBeneficiaryFromId(transaction, id) {
    let query = `SELECT * FROM approval_mbeneficiary WHERE beneficiario_id = @id`;
    const requestApprovalBeneficiary = new sql.Request(transaction);
    requestApprovalBeneficiary.input('id', sql.Int, id);
    const { recordset } = await requestApprovalBeneficiary.query(query);
    return recordset[0]
  }
  static async ReadCompanyLanguage(transaction, id) {
    let query = `SELECT language, xnombre, xheader FROM mcompania WHERE ccompania = @id`;
    const requestApprovalBeneficiary = new sql.Request(transaction);
    requestApprovalBeneficiary.input('id', sql.Int, id);
    const { recordset } = await requestApprovalBeneficiary.query(query);
    return recordset[0]
  }


  // Métodos para manejar relaciones approval-CRM
  static async getCrmApprovalRelations(conection, approval_id) {
    try {
      const pool = await sql.connect(conection);
      const query = `
        SELECT DISTINCT acr.id, acr.approval_id, acr.crm_id,
          c.conversacion_titulo, c.asunto_interno,
          FORMAT(c.fingreso, 'dd/MM/yyyy') as fecha_ingreso
        FROM approval_crm_relations acr
        INNER JOIN crm_main c ON c.id = acr.crm_id
        WHERE acr.approval_id = @approval_id
        ORDER BY acr.id DESC
      `;
      const result = await pool.request()
        .input('approval_id', sql.Int, approval_id)
        .query(query);

      return { result: 1, relations: result.recordset };
    } catch (err) {
      console.log(err);
      return { result: 0, err: err.message };
    }
  }

  static async addCrmApprovalRelations(conection, req, res) {
    try {
      const { approval_id, crm_ids } = req.body;

      if (!approval_id || !crm_ids || !Array.isArray(crm_ids) || crm_ids.length === 0) {
        return { result: 0, err: 'Missing required parameters: approval_id and crm_ids array' };
      }

      const pool = await sql.connect(conection);

      // Verificar qué relaciones ya existen
      const existingQuery = `
        SELECT crm_id 
        FROM approval_crm_relations 
        WHERE approval_id = @approval_id AND crm_id IN (${crm_ids.map((_, i) => `@check_${i}`).join(',')})
      `;

      const checkRequest = pool.request().input('approval_id', sql.Int, approval_id);
      crm_ids.forEach((id, index) => {
        checkRequest.input(`check_${index}`, sql.Int, id);
      });

      const existing = await checkRequest.query(existingQuery);
      const existingIds = new Set(existing.recordset.map(r => r.crm_id));

      // Filtrar solo los IDs que no existen
      const newCrmIds = crm_ids.filter(id => !existingIds.has(id));

      if (newCrmIds.length === 0) {
        return { result: 0, err: 'All selected CRMs are already linked to this approval' };
      }

      // Insertar las relaciones en batch
      const values = newCrmIds.map((crm_id, index) =>
        `(@approval_id, @crm_id_${index})`
      ).join(', ');

      const query = `
        INSERT INTO approval_crm_relations (approval_id, crm_id)
        VALUES ${values}
      `;

      const request = pool.request().input('approval_id', sql.Int, approval_id);

      newCrmIds.forEach((crm_id, index) => {
        request.input(`crm_id_${index}`, sql.Int, crm_id);
      });

      await request.query(query);

      let message = `${newCrmIds.length} CRM(s) linked successfully`;
      if (existingIds.size > 0) {
        message += ` (${existingIds.size} already linked)`;
      }

      return { result: 1, message };
    } catch (err) {
      console.log(err);
      // Si hay error de duplicado, dar mensaje más amigable
      if (err.message.includes('duplicate') || err.message.includes('UNIQUE')) {
        return { result: 0, err: 'Some CRMs are already linked to this approval' };
      }
      return { result: 0, err: err.message };
    }
  }

  static async removeCrmApprovalRelation(conection, req, res) {
    try {
      const { relation_id } = req.body;

      if (!relation_id) {
        return { result: 0, err: 'Missing required parameter: relation_id' };
      }

      const pool = await sql.connect(conection);

      const query = `DELETE FROM approval_crm_relations WHERE id = @relation_id`;

      await pool.request()
        .input('relation_id', sql.Int, relation_id)
        .query(query);

      return { result: 1, message: 'CRM relation removed successfully' };
    } catch (err) {
      console.log(err);
      return { result: 0, err: err.message };
    }
  }

  // ============================================
  // APPROVAL-APPROVAL RELATIONS
  // ============================================
  static async getApprovalApprovalRelations(conection, req, res) {
    try {
      const { approval_id } = req.query;

      if (!approval_id) {
        return { result: 0, err: 'Missing required parameter: approval_id' };
      }

      const pool = await sql.connect(conection);

      const query = `
        SELECT
          aar.id,
          aar.approval_parent_id,
          aar.approval_child_id,
          CASE WHEN aar.approval_parent_id = @approval_id THEN aar.approval_child_id ELSE aar.approval_parent_id END AS related_approval_id,
          l.detalle_proceso
        FROM approval_approval_relations aar
        INNER JOIN log l ON l.id = CASE WHEN aar.approval_parent_id = @approval_id THEN aar.approval_child_id ELSE aar.approval_parent_id END
        WHERE (aar.approval_parent_id = @approval_id OR aar.approval_child_id = @approval_id)
          AND (CASE WHEN aar.approval_parent_id = @approval_id THEN aar.approval_child_id ELSE aar.approval_parent_id END) <> @approval_id
        ORDER BY aar.id DESC
      `;

      const result = await pool.request()
        .input('approval_id', sql.Int, approval_id)
        .query(query);

      return { result: 1, relations: result.recordset };
    } catch (err) {
      console.log(err);
      return { result: 0, err: err.message };
    }
  }

  static async addApprovalApprovalRelations(conection, req, res) {
    try {
      const { approval_id, related_approval_ids, created_by } = req.body;

      if (!approval_id || !related_approval_ids || !Array.isArray(related_approval_ids) || related_approval_ids.length === 0) {
        return { result: 0, err: 'Missing or invalid parameters' };
      }

      const pool = await sql.connect(conection);

      // Verificar qué relaciones ya existen (bidireccionales)
      const existingQuery = `
        SELECT DISTINCT
          CASE 
            WHEN approval_parent_id = @approval_id THEN approval_child_id 
            ELSE approval_parent_id 
          END AS related_id
        FROM approval_approval_relations 
        WHERE (approval_parent_id = @approval_id AND approval_child_id IN (${related_approval_ids.map((_, i) => `@check_${i}`).join(',')}))
           OR (approval_child_id = @approval_id AND approval_parent_id IN (${related_approval_ids.map((_, i) => `@check_${i}`).join(',')}))
      `;

      const checkRequest = pool.request().input('approval_id', sql.Int, approval_id);
      related_approval_ids.forEach((id, index) => {
        checkRequest.input(`check_${index}`, sql.Int, id);
      });

      const existing = await checkRequest.query(existingQuery);
      const existingIds = new Set(existing.recordset.map(r => r.related_id));

      // Filtrar solo los IDs que no existen
      const newApprovalIds = related_approval_ids.filter(id => !existingIds.has(id));

      if (newApprovalIds.length === 0) {
        return { result: 0, err: 'All selected approvals are already linked' };
      }

      const values = newApprovalIds
        .map((_, index) => `(@approval_id, @related_id_${index})`)
        .join(',');

      const query = `
        INSERT INTO approval_approval_relations (approval_parent_id, approval_child_id)
        VALUES ${values}
      `;

      const request = pool.request()
        .input('approval_id', sql.Int, approval_id);

      newApprovalIds.forEach((related_id, index) => {
        request.input(`related_id_${index}`, sql.Int, related_id);
      });

      await request.query(query);

      let message = `${newApprovalIds.length} Approval(s) linked successfully`;
      if (existingIds.size > 0) {
        message += ` (${existingIds.size} already linked)`;
      }

      return { result: 1, message };
    } catch (err) {
      console.log(err);
      if (err.message.includes('duplicate') || err.message.includes('UNIQUE')) {
        return { result: 0, err: 'Some approvals are already linked' };
      }
      if (err.message.includes('CHK_approval_not_self')) {
        return { result: 0, err: 'Cannot link an approval to itself' };
      }
      return { result: 0, err: err.message };
    }
  }

  static async removeApprovalApprovalRelation(conection, req, res) {
    try {
      const { relation_id } = req.body;

      if (!relation_id) {
        return { result: 0, err: 'Missing required parameter: relation_id' };
      }

      const pool = await sql.connect(conection);

      const query = `DELETE FROM approval_approval_relations WHERE id = @relation_id`;

      await pool.request()
        .input('relation_id', sql.Int, relation_id)
        .query(query);

      return { result: 1, message: 'Approval relation removed successfully' };
    } catch (err) {
      console.log(err);
      return { result: 0, err: err.message };
    }
  }

  // ============================================
  // COST CODE (mcost_code)
  // ============================================
  static async getCostCodesByDepartment(transaction, cdepartment) {
    const query = `SELECT cost_id, ccompany, cdepartment, xname, status, account_id, fingreso, uingreso, fmodificado, umodificado
                   FROM mcost_code
                   WHERE cdepartment = @cdepartment AND status = 1
                   ORDER BY xname`;
    const request = new sql.Request(transaction);
    request.input('cdepartment', sql.Int, cdepartment);
    const { recordset } = await request.query(query);
    return recordset;
  }

  static async createCostCode(transaction, ccompany, cdepartment, xname, userId) {
    const now = new Date();
    const query = `INSERT INTO mcost_code (ccompany, cdepartment, xname, status, fingreso, uingreso, fmodificado, umodificado)
                   OUTPUT INSERTED.cost_id
                   VALUES(@ccompany, @cdepartment, @xname, 1, @fingreso, @uingreso, @fmodificado, @umodificado)`;
    const request = new sql.Request(transaction);
    request.input('ccompany', sql.Int, ccompany);
    request.input('cdepartment', sql.Int, cdepartment);
    request.input('xname', sql.NVarChar, xname);
    request.input('fingreso', sql.DateTime, now);
    request.input('uingreso', sql.VarChar, userId);
    request.input('fmodificado', sql.DateTime, now);
    request.input('umodificado', sql.VarChar, userId);
    const { recordset } = await request.query(query);
    return recordset[0].cost_id;
  }

  static async listCostCodesPaged(transaction, q, page, limit, dep_filter, company_filter, status_filter) {
    const offset = (page - 1) * limit;
    let where = '1=1';
    const request = new sql.Request(transaction);

    if (q) {
      where += ` AND mc.xname LIKE '%' + @q + '%'`;
      request.input('q', sql.NVarChar, q);
    }
    if (dep_filter !== null) {
      where += ` AND mc.cdepartment = @dep_filter`;
      request.input('dep_filter', sql.Int, dep_filter);
    }
    if (company_filter !== null) {
      where += ` AND mc.ccompany = @company_filter`;
      request.input('company_filter', sql.Int, company_filter);
    }
    if (status_filter !== null) {
      where += ` AND mc.status = @status_filter`;
      request.input('status_filter', sql.Int, status_filter);
    }

    const countQuery = `SELECT COUNT(*) AS total FROM mcost_code mc WHERE ${where}`;
    const countReq = request.clone ? new sql.Request(transaction) : request;
    // Clone inputs
    const countRequest = new sql.Request(transaction);
    if (q) countRequest.input('q', sql.NVarChar, q);
    if (dep_filter !== null) countRequest.input('dep_filter', sql.Int, dep_filter);
    if (company_filter !== null) countRequest.input('company_filter', sql.Int, company_filter);
    if (status_filter !== null) countRequest.input('status_filter', sql.Int, status_filter);
    const { recordset: countRs } = await countRequest.query(countQuery);
    const total = countRs[0].total;

    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);
    const dataQuery = `SELECT mc.cost_id, mc.ccompany, mc.cdepartment, mc.xname, mc.status,
                              mc.fingreso, mc.uingreso, mc.fmodificado, mc.umodificado,
                              d.nombre AS nombre_departamento,
                              c.xnombre AS nombre_compania
                       FROM mcost_code mc
                       LEFT JOIN departamentos d ON d.id = mc.cdepartment
                       LEFT JOIN mcompania c ON c.ccompania = mc.ccompany
                       WHERE ${where}
                       ORDER BY mc.xname
                       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    const { recordset: rows } = await request.query(dataQuery);
    return { rows, total };
  }

  static async getCostCodeById(transaction, cost_id) {
    const query = `SELECT mc.*, d.nombre AS nombre_departamento, c.xnombre AS nombre_compania
                   FROM mcost_code mc
                   LEFT JOIN departamentos d ON d.id = mc.cdepartment
                   LEFT JOIN mcompania c ON c.ccompania = mc.ccompany
                   WHERE mc.cost_id = @cost_id`;
    const request = new sql.Request(transaction);
    request.input('cost_id', sql.Int, cost_id);
    const { recordset } = await request.query(query);
    return recordset[0] || null;
  }

  static async updateCostCode(transaction, cost_id, data, userId) {
    const now = new Date();
    const query = `UPDATE mcost_code
                   SET ccompany = @ccompany, cdepartment = @cdepartment, xname = @xname,
                       status = @status, fmodificado = @fmodificado, umodificado = @umodificado
                   WHERE cost_id = @cost_id`;
    const request = new sql.Request(transaction);
    request.input('cost_id', sql.Int, cost_id);
    request.input('ccompany', sql.Int, data.ccompany);
    request.input('cdepartment', sql.Int, data.cdepartment);
    request.input('xname', sql.NVarChar, data.xname);
    request.input('status', sql.Int, data.status);
    request.input('fmodificado', sql.DateTime, now);
    request.input('umodificado', sql.VarChar, userId);
    await request.query(query);
  }

  // ============================================
  // APPROVAL ITEMS
  // ============================================
  static async getApprovalItems(transaction, appr_id) {
    const query = `SELECT ai.*, mc.xname AS cost_code_name, mc.account_id
                   FROM approval_items ai
                   LEFT JOIN mcost_code mc ON mc.cost_id = ai.mcost_id
                   WHERE ai.appr_id = @appr_id
                   ORDER BY ai.id`;
    const request = new sql.Request(transaction);
    request.input('appr_id', sql.Int, appr_id);
    const { recordset } = await request.query(query);
    return recordset;
  }

  static async createApprovalItems(transaction, appr_id, items, userId, currency) {
    const now = new Date();
    for (const item of items) {
      const query = `INSERT INTO approval_items (appr_id, mcost_id, name, amount, currency, fingreso, uingreso)
                     VALUES(@appr_id, @mcost_id, @name, @amount, @currency, @fingreso, @uingreso)`;
      const request = new sql.Request(transaction);
      request.input('appr_id', sql.Int, appr_id);
      request.input('mcost_id', sql.Int, item.cost_id);
      request.input('name', sql.NVarChar, item.name);
      request.input('currency', sql.NVarChar, currency);
      request.input('amount', sql.Float, item.amount);
      request.input('fingreso', sql.DateTime, now);
      request.input('uingreso', sql.VarChar, userId);
      await request.query(query);
    }
  }
  static async insertSirLog(transaction, data) {
    const query = `INSERT INTO approvals_sir_log
      (request_body, status, approval_id, error_message)
      VALUES (@request_body, @status, @approval_id, @error_message)`;
    const request = new sql.Request(transaction);
    request.input('request_body', sql.NVarChar, data.request_body);
    request.input('status', sql.NVarChar, data.status);
    request.input('approval_id', sql.Int, data.approval_id);
    request.input('error_message', sql.NVarChar, data.error_message);
    await request.query(query);
  }

  static async createSirLog(connection, request_body, status) {
    const request = connection.request();
    request.input('request_body', sql.NVarChar, request_body);
    request.input('status', sql.NVarChar, status);
    const { recordset } = await request.query(`INSERT INTO approvals_sir_log (request_body, status) OUTPUT INSERTED.id VALUES (@request_body, @status)`);
    return recordset[0].id;
  }

  static async updateSirLogSuccess(connection, id, approval_id) {
    const request = connection.request();
    request.input('id', sql.Int, id);
    request.input('status', sql.NVarChar, 'success');
    request.input('approval_id', sql.Int, approval_id);
    await request.query(`UPDATE approvals_sir_log SET status = @status, approval_id = @approval_id WHERE id = @id`);
  }

  static async updateSirLogFailed(connection, id, error_message) {
    const request = connection.request();
    request.input('id', sql.Int, id);
    request.input('status', sql.NVarChar, 'failed');
    request.input('error_message', sql.NVarChar, error_message);
    await request.query(`UPDATE approvals_sir_log SET status = @status, error_message = @error_message WHERE id = @id`);
  }

  static async getTransactionBank(transaction, company, moneda) {
    const query = `SELECT bl.*, mc.xnombre_legal, mc.xheader, mc.xfooter
                   FROM banco_legal_transacciones bl
                   LEFT JOIN mcompania mc ON mc.ccompania = bl.compania
                   WHERE bl.compania = @company and bl.moneda = @moneda
                   ORDER BY bl.id`;
    const request = new sql.Request(transaction);
    request.input('company', sql.Int, company);
    request.input('moneda', sql.VarChar, moneda);
    const { recordset } = await request.query(query);
    return recordset[0];
  }

  static async createSirLog(connection, request_body, status) {
    const request = connection.request();
    request.input('request_body', sql.NVarChar, request_body);
    request.input('status', sql.NVarChar, status);
    const { recordset } = await request.query(`INSERT INTO approvals_sir_log (request_body, status) OUTPUT INSERTED.id VALUES (@request_body, @status)`);
    return recordset[0].id;
  }

  static async updateSirLogSuccess(connection, id, approval_id) {
    const request = connection.request();
    request.input('id', sql.Int, id);
    request.input('status', sql.NVarChar, 'success');
    request.input('approval_id', sql.Int, approval_id);
    await request.query(`UPDATE approvals_sir_log SET status = @status, approval_id = @approval_id WHERE id = @id`);
  }

  static async updateSirLogFailed(connection, id, error_message) {
    const request = connection.request();
    request.input('id', sql.Int, id);
    request.input('status', sql.NVarChar, 'failed');
    request.input('error_message', sql.NVarChar, error_message);
    await request.query(`UPDATE approvals_sir_log SET status = @status, error_message = @error_message WHERE id = @id`);
  }


}
