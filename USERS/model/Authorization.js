import sql from 'mssql';

function parseCsvValues(raw) {
  return String(raw || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

export default class AuthorizationModel {
  static async getUserPermissionAssignments(connection, userId, resource, action) {
    await sql.connect(connection);
    const request = new sql.Request();
    request.input('user_id', sql.VarChar, userId);
    request.input('resource', sql.VarChar, resource);
    request.input('action', sql.VarChar, action);

    const query = `
      SELECT
        ur.user_role_id,
        ur.role_id,
        ur.scope_type,
        ur.scope_id,
        r.role_code,
        rp.permission_id,
        rp.effect,
        p.permission_code,
        p.resource,
        p.action
      FROM auth_user_roles ur
      INNER JOIN auth_roles r ON r.role_id = ur.role_id AND r.status = 1
      INNER JOIN auth_role_permissions rp ON rp.role_id = ur.role_id
      INNER JOIN auth_permissions p ON p.permission_id = rp.permission_id AND p.status = 1
      WHERE ur.user_id = @user_id
        AND ur.status = 1
        AND (ur.valid_from IS NULL OR ur.valid_from <= SYSUTCDATETIME())
        AND (ur.valid_to IS NULL OR ur.valid_to >= SYSUTCDATETIME())
        AND (p.resource = @resource OR p.resource = '*')
        AND (p.action = @action OR p.action = '*')
    `;

    const { recordset } = await request.query(query);
    return recordset;
  }

  static async getPoliciesForDecision(connection, roleIds, permissionIds) {
    if ((!roleIds || roleIds.length === 0) && (!permissionIds || permissionIds.length === 0)) {
      return [];
    }

    await sql.connect(connection);
    const request = new sql.Request();

    let roleCondition = '1 = 0';
    if (Array.isArray(roleIds) && roleIds.length > 0) {
      roleCondition = roleIds.map((_, idx) => `pb.role_id = @role_${idx}`).join(' OR ');
      roleIds.forEach((id, idx) => request.input(`role_${idx}`, sql.Int, id));
    }

    let permissionCondition = '1 = 0';
    if (Array.isArray(permissionIds) && permissionIds.length > 0) {
      permissionCondition = permissionIds.map((_, idx) => `pb.permission_id = @perm_${idx}`).join(' OR ');
      permissionIds.forEach((id, idx) => request.input(`perm_${idx}`, sql.Int, id));
    }

    const query = `
      SELECT DISTINCT
        ap.policy_id,
        ap.policy_code,
        ap.attribute_key,
        ap.operator,
        ap.attribute_value,
        ap.effect
      FROM auth_policy_bindings pb
      INNER JOIN auth_policies ap ON ap.policy_id = pb.policy_id
      WHERE pb.status = 1
        AND ap.status = 1
        AND ((${roleCondition}) OR (${permissionCondition}))
    `;

    const { recordset } = await request.query(query);
    return recordset;
  }

  static async writeAccessAudit(connection, auditData) {
    await sql.connect(connection);
    const request = new sql.Request();
    request.input('request_id', sql.UniqueIdentifier, auditData.request_id || null);
    request.input('user_id', sql.VarChar, auditData.user_id);
    request.input('resource', sql.VarChar, auditData.resource);
    request.input('action', sql.VarChar, auditData.action);
    request.input('decision', sql.VarChar, auditData.decision);
    request.input('reason', sql.NVarChar, auditData.reason || null);
    request.input('policy_hits', sql.NVarChar(sql.MAX), auditData.policy_hits || null);
    request.input('context_snapshot', sql.NVarChar(sql.MAX), auditData.context_snapshot || null);
    request.input('route_path', sql.NVarChar, auditData.route_path || null);
    request.input('method', sql.VarChar, auditData.method || null);
    request.input('ip_address', sql.VarChar, auditData.ip_address || null);

    const query = `
      INSERT INTO auth_access_audit (
        request_id, user_id, resource, action, decision, reason,
        policy_hits, context_snapshot, route_path, method, ip_address
      )
      VALUES (
        @request_id, @user_id, @resource, @action, @decision, @reason,
        @policy_hits, @context_snapshot, @route_path, @method, @ip_address
      )
    `;

    await request.query(query);
  }

  static async ensureBaselineAssignment(connection, targetUserId, assignedBy = null) {
    await sql.connect(connection);
    const request = new sql.Request();
    request.input('target_user_id', sql.VarChar, targetUserId);
    request.input('assigned_by', sql.VarChar, assignedBy || null);

    const query = `
      DECLARE @role_id INT;
      SELECT @role_id = role_id FROM auth_roles WHERE role_code = 'AUTHZ_SUPERADMIN' AND status = 1;

      IF @role_id IS NULL
      BEGIN
        THROW 50001, 'AUTHZ_SUPERADMIN role does not exist. Run security/sql/001_authz_rbac.sql first.', 1;
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM auth_user_roles
        WHERE user_id = @target_user_id
          AND role_id = @role_id
          AND status = 1
          AND scope_type = 'global'
      )
      BEGIN
        INSERT INTO auth_user_roles (
          user_id, role_id, scope_type, scope_id, valid_from, valid_to, status, assigned_by
        )
        VALUES (
          @target_user_id, @role_id, 'global', NULL, SYSUTCDATETIME(), NULL, 1, @assigned_by
        );
      END;
    `;

    await request.query(query);
  }

  static async getUserEffectivePermissions(connection, userId) {
    await sql.connect(connection);
    const request = new sql.Request();
    request.input('user_id', sql.VarChar, userId);

    const query = `
      SELECT DISTINCT
        p.permission_code,
        p.resource,
        p.action,
        rp.effect,
        r.role_code,
        ur.scope_type,
        ur.scope_id
      FROM auth_user_roles ur
      INNER JOIN auth_roles r ON r.role_id = ur.role_id AND r.status = 1
      INNER JOIN auth_role_permissions rp ON rp.role_id = ur.role_id
      INNER JOIN auth_permissions p ON p.permission_id = rp.permission_id AND p.status = 1
      WHERE ur.user_id = @user_id
        AND ur.status = 1
        AND (ur.valid_from IS NULL OR ur.valid_from <= SYSUTCDATETIME())
        AND (ur.valid_to IS NULL OR ur.valid_to >= SYSUTCDATETIME())
      ORDER BY p.resource, p.action, r.role_code
    `;

    const { recordset } = await request.query(query);
    return recordset;
  }

  static async listRoles(connection) {
    await sql.connect(connection);
    const request = new sql.Request();

    const query = `
      SELECT role_id, role_code, role_name, description, is_system, status, created_at, updated_at
      FROM auth_roles
      ORDER BY role_code
    `;

    const { recordset } = await request.query(query);
    return recordset;
  }

  static async listPermissions(connection) {
    await sql.connect(connection);
    const request = new sql.Request();

    const query = `
      SELECT permission_id, permission_code, resource, action, description, status, created_at, updated_at
      FROM auth_permissions
      ORDER BY resource, action
    `;

    const { recordset } = await request.query(query);
    return recordset;
  }

  static async assignRoleToUser(connection, payload) {
    const {
      targetUserId,
      roleCode,
      scopeType = 'global',
      scopeId = null,
      validFrom = null,
      validTo = null,
      assignedBy = null
    } = payload;

    await sql.connect(connection);
    const request = new sql.Request();
    request.input('target_user_id', sql.VarChar, targetUserId);
    request.input('role_code', sql.VarChar, roleCode);
    request.input('scope_type', sql.VarChar, scopeType);
    request.input('scope_id', sql.VarChar, scopeId);
    request.input('valid_from', sql.DateTime2, validFrom);
    request.input('valid_to', sql.DateTime2, validTo);
    request.input('assigned_by', sql.VarChar, assignedBy);

    const query = `
      DECLARE @role_id INT;
      SELECT @role_id = role_id FROM auth_roles WHERE role_code = @role_code AND status = 1;

      IF @role_id IS NULL
      BEGIN
        THROW 50002, 'Role code not found or inactive.', 1;
      END;

      IF EXISTS (
        SELECT 1
        FROM auth_user_roles
        WHERE user_id = @target_user_id
          AND role_id = @role_id
          AND scope_type = @scope_type
          AND ISNULL(scope_id, '') = ISNULL(@scope_id, '')
          AND status = 1
      )
      BEGIN
        RETURN;
      END;

      INSERT INTO auth_user_roles (
        user_id, role_id, scope_type, scope_id, valid_from, valid_to, status, assigned_by
      )
      VALUES (
        @target_user_id, @role_id, @scope_type, @scope_id, @valid_from, @valid_to, 1, @assigned_by
      );
    `;

    await request.query(query);
  }

  static async revokeRoleFromUser(connection, payload) {
    const {
      targetUserId,
      roleCode,
      scopeType = 'global',
      scopeId = null
    } = payload;

    await sql.connect(connection);
    const request = new sql.Request();
    request.input('target_user_id', sql.VarChar, targetUserId);
    request.input('role_code', sql.VarChar, roleCode);
    request.input('scope_type', sql.VarChar, scopeType);
    request.input('scope_id', sql.VarChar, scopeId);

    const query = `
      UPDATE ur
      SET ur.status = 0
      FROM auth_user_roles ur
      INNER JOIN auth_roles r ON r.role_id = ur.role_id
      WHERE ur.user_id = @target_user_id
        AND r.role_code = @role_code
        AND ur.scope_type = @scope_type
        AND ISNULL(ur.scope_id, '') = ISNULL(@scope_id, '')
        AND ur.status = 1;
    `;

    await request.query(query);
  }

  static policyMatches(policy, context) {
    const actualRaw = context?.[policy.attribute_key];
    const expectedRaw = policy.attribute_value;
    const op = String(policy.operator || '').toLowerCase();

    const actual = Array.isArray(actualRaw) ? actualRaw.map(v => String(v)) : String(actualRaw ?? '');

    switch (op) {
      case 'eq':
        return String(actual) === String(expectedRaw);
      case 'neq':
        return String(actual) !== String(expectedRaw);
      case 'contains':
        if (Array.isArray(actual)) return actual.includes(String(expectedRaw));
        return String(actual).toLowerCase().includes(String(expectedRaw).toLowerCase());
      case 'in': {
        const expected = parseCsvValues(expectedRaw).map(v => v.toLowerCase());
        if (Array.isArray(actual)) {
          return actual.some(v => expected.includes(String(v).toLowerCase()));
        }
        return expected.includes(String(actual).toLowerCase());
      }
      default:
        return false;
    }
  }
}
