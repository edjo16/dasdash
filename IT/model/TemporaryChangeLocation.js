// here are the functions that are used to create, update and read performance review /form_hr_performance_review
import sql from 'mssql';
export default class TemporaryChangeLocationModel {
  constructor() { }

  static async createForm(transaction, UserID, body) {
    let formId = null;
    const request = new sql.Request(transaction);
    const { recordset } = await request
      .input('user_created', sql.NVarChar, UserID)
      .input('collaborator_name', sql.NVarChar, body.collaborator_name)
      .input('collaborator_title', sql.NVarChar, body.collaborator_title)
      .input('department', sql.NVarChar, body.department)
      .input('manager', sql.NVarChar, body.manager)
      .input('manager_title', sql.NVarChar, body.manager_title)
      .input('area_supervisor', sql.NVarChar, body.area_supervisor)
      .input('suplente', sql.NVarChar, body.suplente)
      .input('country', sql.NVarChar, body.country)
      .input('start_date', sql.Date, body.start_date)
      .input('end_date', sql.Date, body.end_date)
      .input('comments', sql.NVarChar, body.comments)
      .query(`
            INSERT INTO forms_it_temporary_change_location (
              user_created,
              collaborator_name,
              collaborator_title,
              department,
              manager,
              manager_title,
              area_supervisor,
              suplente,
              country,
              start_date,
              end_date,
              comments
            ) OUTPUT INSERTED.ID VALUES (
              @user_created,
              @collaborator_name,
              @collaborator_title,
              @department,
              @manager,
              @manager_title,
              @area_supervisor,
              @suplente,
              @country,
              @start_date,
              @end_date,
              @comments
            );
          `);
    formId = recordset[0].ID;
    return formId;
  }
  static async redForms(transaction, limit, offset, ITuser, userId, department, status, search, departmentAccess) {
    let query;
    let statusFilter = '';
    
    if (!status) {
        statusFilter = `CASE
            WHEN start_date > GETDATE() THEN 'Planned'
            WHEN start_date <= GETDATE() AND end_date >= GETDATE() THEN 'Ongoing'
            WHEN end_date < GETDATE() THEN 'Finished'
        END AS status`;
    } else {
      if(status === 'Planned') {
      statusFilter = `CASE
      WHEN start_date > GETDATE() THEN 'Planned' END AS status`;
    }
      else if(status === 'Ongoing') {
        statusFilter = `CASE
        WHEN start_date <= GETDATE() AND end_date >= GETDATE() THEN 'Ongoing' END AS status`;
      }
      else if(status === 'Finished') {
        statusFilter = `CASE
        WHEN end_date < GETDATE() THEN 'Finished' END AS status`;
      }
    }

    if (ITuser) {
      query = `SELECT id, collaborator_name, department, country, ${statusFilter}, 
      FORMAT(start_date, 'dd/MM/yyyy') AS start_date, 
      FORMAT(end_date, 'dd/MM/yyyy') AS end_date
      FROM forms_it_temporary_change_location WHERE department IS NOT NULL`;
    }
    else if (departmentAccess.length > 0) {
      const inClause = departmentAccess.map((_, index) => `@departmentAccess${index}`).join(', ');
      query = `SELECT id, collaborator_name, department, country, ${statusFilter}, FORMAT(start_date,'dd/MM/yyyy') AS start_date, FORMAT(end_date,'dd/MM/yyyy') AS end_date
     FROM forms_it_temporary_change_location WHERE user_created = @userId OR manager = @userId OR area_supervisor = @userId OR suplente = @userId OR department IN (${inClause})`;
    }
    else {
      query = `SELECT id, collaborator_name, department, country, ${statusFilter}, FORMAT(start_date, 'dd/MM/yyyy') AS start_date, FORMAT(end_date, 'dd/MM/yyyy') AS end_date 
      FROM forms_it_temporary_change_location WHERE user_created = @userId OR manager = @userId OR area_supervisor = @userId OR suplente = @userId`
    }

    if (department !== null) {
      query += ` AND department = @department`;
    }
    if (status !== null) {
      if(status === 'Planned') {
        query += ` AND start_date > GETDATE()`;
      } else if(status === 'Ongoing') {
        query += ` AND start_date <= GETDATE() AND end_date >= GETDATE()`;
      } else if(status === 'Finished') {
        query += ` AND end_date < GETDATE()`;
      }
    }
    if (search !== null) {
      query += ` AND (collaborator_name LIKE @search OR id LIKE @search OR start_date LIKE @search)`;
    }

    query += `
            ORDER BY date_created DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `;

    const request = new sql.Request(transaction);
    request.input('userId', sql.VarChar, userId);
    if (status) request.input('status', sql.VarChar, status);
    if (departmentAccess.length > 0) departmentAccess.forEach((department, index) => {
      request.input(`departmentAccess${index}`, sql.VarChar, department); // O el tipo adecuado, según el tipo de datos de 'department'
    });
    if (department) request.input('department', sql.VarChar, department);
    if (search) request.input('search', sql.VarChar, `%${search}%`);
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);

    return await request.query(query);
}


static async totalCount(transaction, ITuser, userId, department, status, search, departmentAccess) {
  let query;
  let statusFilter = '';

  if (!status) {
      statusFilter = `CASE
          WHEN start_date > GETDATE() THEN 'Planned'
          WHEN start_date <= GETDATE() AND end_date >= GETDATE() THEN 'Ongoing'
          WHEN end_date < GETDATE() THEN 'Finished'
      END AS status`;
  } else {
    if (status === 'Planned') {
      statusFilter = `CASE
      WHEN start_date > GETDATE() THEN 'Planned' END AS status`;
    }
    else if (status === 'Ongoing') {
      statusFilter = `CASE
      WHEN start_date <= GETDATE() AND end_date >= GETDATE() THEN 'Ongoing' END AS status`;
    }
    else if (status === 'Finished') {
      statusFilter = `CASE
      WHEN end_date < GETDATE() THEN 'Finished' END AS status`;
    }
  }

  if (ITuser) {
    query = `SELECT COUNT(*) AS totalCount
             FROM forms_it_temporary_change_location 
             WHERE id IS NOT NULL`;
  } else if (departmentAccess.length > 0) {
    const inClause = departmentAccess.map((_, index) => `@departmentAccess${index}`).join(', ');
    query = `SELECT COUNT(*) AS totalCount
             FROM forms_it_temporary_change_location 
             WHERE user_created = @userId OR manager = @userId OR area_supervisor = @userId OR suplente = @userId OR department IN (${inClause})`;
  } else {
    query = `SELECT COUNT(*) AS totalCount
             FROM forms_it_temporary_change_location 
             WHERE user_created = @userId 
                OR manager = @userId 
                OR area_supervisor = @userId 
                OR suplente = @userId`;
  }

  if (department !== null) {
    query += ` AND department = @department`;
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
    query += ` AND (collaborator_name LIKE @search OR id LIKE @search OR department LIKE @search)`;
  }

  const request = new sql.Request(transaction);
  request.input('userId', sql.VarChar, userId);

  // Handle department access filtering
  if (departmentAccess.length > 0) {
    departmentAccess.forEach((department, index) => {
      request.input(`departmentAccess${index}`, sql.VarChar, department);
    });
  }

  if (department) request.input('department', sql.VarChar, department);
  if (status) request.input('status', sql.VarChar, status);
  if (search) request.input('search', sql.VarChar, `%${search}%`);

  return await request.query(query);
}

  static getStatusCaseSql() {
    return `CASE
      WHEN CAST(start_date AS date) > CAST(GETDATE() AS date) THEN 'Planned'
      WHEN CAST(start_date AS date) <= CAST(GETDATE() AS date) AND CAST(end_date AS date) >= CAST(GETDATE() AS date) THEN 'Ongoing'
      WHEN CAST(end_date AS date) < CAST(GETDATE() AS date) THEN 'Finished'
      ELSE 'Unknown'
    END`;
  }

  static appendStatusFilter(query, status) {
    if (!status) return query;
    if (status === 'Planned') {
      return query + ` AND CAST(start_date AS date) > CAST(GETDATE() AS date)`;
    }
    if (status === 'Ongoing') {
      return query + ` AND CAST(start_date AS date) <= CAST(GETDATE() AS date) AND CAST(end_date AS date) >= CAST(GETDATE() AS date)`;
    }
    if (status === 'Finished') {
      return query + ` AND CAST(end_date AS date) < CAST(GETDATE() AS date)`;
    }
    return query;
  }

  static applyDepartmentInputs(request, departmentAccess) {
    if (!departmentAccess || departmentAccess.length === 0) return;
    departmentAccess.forEach((departmentName, index) => {
      request.input(`departmentAccess${index}`, sql.VarChar, departmentName);
    });
  }

  static buildAccessWhereClause(ITuser, departmentAccess) {
    if (ITuser) {
      return `department IS NOT NULL`;
    }

    if (departmentAccess && departmentAccess.length > 0) {
      const inClause = departmentAccess.map((_, index) => `@departmentAccess${index}`).join(', ');
      return `(user_created = @userId OR manager = @userId OR area_supervisor = @userId OR suplente = @userId OR department IN (${inClause}))`;
    }

    return `(user_created = @userId OR manager = @userId OR area_supervisor = @userId OR suplente = @userId)`;
  }

  static async readFormsMap(transaction, ITuser, userId, department, status, search, departmentAccess) {
    const statusCase = this.getStatusCaseSql();
    let query = `
      SELECT
        id,
        collaborator_name,
        department,
        country,
        CONVERT(VARCHAR(10), start_date, 23) AS start_date,
        CONVERT(VARCHAR(10), end_date, 23) AS end_date,
        CONVERT(VARCHAR(19), date_created, 120) AS date_created,
        ${statusCase} AS status
      FROM forms_it_temporary_change_location
      WHERE ${this.buildAccessWhereClause(ITuser, departmentAccess)}
    `;

    if (department) {
      query += ` AND department = @department`;
    }

    query = this.appendStatusFilter(query, status);

    if (search) {
      query += ` AND (
        collaborator_name LIKE @search
        OR department LIKE @search
        OR country LIKE @search
        OR CONVERT(VARCHAR(10), start_date, 103) LIKE @search
        OR CONVERT(VARCHAR(10), end_date, 103) LIKE @search
      )`;
    }

    query += ` ORDER BY date_created DESC`;

    const request = new sql.Request(transaction);
    request.input('userId', sql.VarChar, userId);
    this.applyDepartmentInputs(request, departmentAccess);
    if (department) request.input('department', sql.VarChar, department);
    if (search) request.input('search', sql.VarChar, `%${search}%`);

    return await request.query(query);
  }

  static async readMapStatusCounters(transaction, ITuser, userId, department, search, departmentAccess) {
    const statusCase = this.getStatusCaseSql();
    let baseQuery = `
      SELECT ${statusCase} AS status
      FROM forms_it_temporary_change_location
      WHERE ${this.buildAccessWhereClause(ITuser, departmentAccess)}
    `;

    if (department) {
      baseQuery += ` AND department = @department`;
    }

    if (search) {
      baseQuery += ` AND (
        collaborator_name LIKE @search
        OR department LIKE @search
        OR country LIKE @search
        OR CONVERT(VARCHAR(10), start_date, 103) LIKE @search
        OR CONVERT(VARCHAR(10), end_date, 103) LIKE @search
      )`;
    }

    const finalQuery = `
      SELECT status, COUNT(*) AS total
      FROM (${baseQuery}) src
      WHERE status IN ('Planned', 'Ongoing', 'Finished')
      GROUP BY status
    `;

    const request = new sql.Request(transaction);
    request.input('userId', sql.VarChar, userId);
    this.applyDepartmentInputs(request, departmentAccess);
    if (department) request.input('department', sql.VarChar, department);
    if (search) request.input('search', sql.VarChar, `%${search}%`);

    return await request.query(finalQuery);
  }

  static async findBestCollaborator(transaction, ITuser, userId, department, search, departmentAccess) {
    if (!search || !search.trim()) {
      return null;
    }

    let query = `
      SELECT TOP 1 collaborator_name
      FROM forms_it_temporary_change_location
      WHERE ${this.buildAccessWhereClause(ITuser, departmentAccess)}
        AND collaborator_name LIKE @search
    `;

    if (department) {
      query += ` AND department = @department`;
    }

    query += `
      ORDER BY
        CASE
          WHEN LOWER(collaborator_name) = LOWER(@searchExact) THEN 0
          WHEN LOWER(collaborator_name) LIKE LOWER(@searchPrefix) THEN 1
          ELSE 2
        END,
        date_created DESC
    `;

    const request = new sql.Request(transaction);
    request.input('userId', sql.VarChar, userId);
    this.applyDepartmentInputs(request, departmentAccess);
    if (department) request.input('department', sql.VarChar, department);
    request.input('search', sql.VarChar, `%${search}%`);
    request.input('searchExact', sql.VarChar, search);
    request.input('searchPrefix', sql.VarChar, `${search}%`);

    const result = await request.query(query);
    if (!result.recordset || result.recordset.length === 0) {
      return null;
    }

    return result.recordset[0].collaborator_name;
  }

  static async readCollaboratorHistory(transaction, ITuser, userId, collaboratorName, departmentAccess) {
    if (!collaboratorName) {
      return { recordset: [] };
    }

    const statusCase = this.getStatusCaseSql();
    let query = `
      SELECT
        id,
        collaborator_name,
        department,
        country,
        CONVERT(VARCHAR(10), start_date, 23) AS start_date,
        CONVERT(VARCHAR(10), end_date, 23) AS end_date,
        CONVERT(VARCHAR(19), date_created, 120) AS date_created,
        ${statusCase} AS status
      FROM forms_it_temporary_change_location
      WHERE ${this.buildAccessWhereClause(ITuser, departmentAccess)}
        AND collaborator_name = @collaboratorName
      ORDER BY start_date ASC, date_created ASC
    `;

    const request = new sql.Request(transaction);
    request.input('userId', sql.VarChar, userId);
    request.input('collaboratorName', sql.VarChar, collaboratorName);
    this.applyDepartmentInputs(request, departmentAccess);

    return await request.query(query);
  }

  static async readFormById(transaction, id) {
    let formId = null;
    const request = new sql.Request(transaction);
    const { recordset } = await request
      .input('id', sql.Int, id)
      .query(`SELECT * FROM forms_it_temporary_change_location WHERE id = @id;`)
    formId = recordset[0];
    formId.start_date = formId.start_date.toISOString().split('T')[0];
    formId.end_date = formId.end_date.toISOString().split('T')[0];
    return formId;
  }

  static async readAllForms(transaction, ITuser, userId, departmentAccess) {
    let query;
    if (ITuser) {
        query = `SELECT DISTINCT department
                 FROM forms_it_temporary_change_location 
                 WHERE department IS NOT NULL`;
    } else if (departmentAccess.length > 0) {
        const inClause = departmentAccess.map((_, index) => `@departmentAccess${index}`).join(', ');
        query = `SELECT DISTINCT department 
                 FROM forms_it_temporary_change_location 
                 WHERE department IN (${inClause})`;
    } else {
        query = `SELECT DISTINCT department 
                 FROM forms_it_temporary_change_location 
                 WHERE user_created = @userId 
                 OR manager = @userId 
                 OR area_supervisor = @userId 
                 OR suplente = @userId`;
    }


    const request = new sql.Request(transaction);
    if (departmentAccess.length > 0) {
        departmentAccess.forEach((department, index) => {
            request.input(`departmentAccess${index}`, sql.VarChar, department); // O el tipo adecuado, según el tipo de datos de 'department'
        });
    }
    request.input('userId', sql.VarChar, userId);
    return await request.query(query);
}
}
