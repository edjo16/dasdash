import AuthorizationModel from '../model/Authorization.js';

function uniqueInts(values) {
  return [...new Set((values || []).map(v => Number(v)).filter(v => !Number.isNaN(v)))];
}

function includesScopeValue(actual, scopeId) {
  if (actual === null || actual === undefined) return false;
  if (Array.isArray(actual)) {
    return actual.map(v => String(v)).includes(String(scopeId));
  }
  return String(actual) === String(scopeId);
}

function scopeMatches(assignment, context, userId) {
  const scopeType = String(assignment.scope_type || 'global').toLowerCase();
  const scopeId = assignment.scope_id;

  switch (scopeType) {
    case 'global':
      return true;
    case 'company':
      return includesScopeValue(context.company, scopeId);
    case 'department':
      return includesScopeValue(context.department, scopeId);
    case 'flow':
      return includesScopeValue(context.flowId, scopeId);
    case 'self':
      return String(context.targetUserId || '') === String(userId || '');
    default:
      return false;
  }
}

function buildRequestMeta(req) {
  return {
    route_path: req?.originalUrl || req?.url || null,
    method: req?.method || null,
    ip_address: req?.ip || null
  };
}

function normalizeRequestId(value) {
  if (!value) return null;
  const str = String(value).trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str) ? str : null;
}

export default class AuthorizationService {
  static async checkPermission(connection, params) {
    const {
      userId,
      resource,
      action,
      context = {},
      requestMeta = {},
      requestId = null
    } = params;

    const safeRequestId = normalizeRequestId(requestId);

    const denyResult = async (reason, policyHits = []) => {
      await AuthorizationModel.writeAccessAudit(connection, {
        request_id: safeRequestId,
        user_id: userId,
        resource,
        action,
        decision: 'deny',
        reason,
        policy_hits: JSON.stringify(policyHits),
        context_snapshot: JSON.stringify(context),
        ...requestMeta
      });

      return {
        allowed: false,
        reason,
        policyHits
      };
    };

    const assignments = await AuthorizationModel.getUserPermissionAssignments(connection, userId, resource, action);
    if (!assignments || assignments.length === 0) {
      return denyResult('No active permission assignment for resource/action');
    }

    const scopedAssignments = assignments.filter(a => scopeMatches(a, context, userId));
    if (scopedAssignments.length === 0) {
      return denyResult('Permission exists but scope does not match context');
    }

    const deniedByRole = scopedAssignments.filter(a => String(a.effect).toLowerCase() === 'deny');
    if (deniedByRole.length > 0) {
      return denyResult('Explicit deny effect found on role-permission assignment', deniedByRole.map(x => ({ role: x.role_code, effect: x.effect })));
    }

    const allowAssignments = scopedAssignments.filter(a => String(a.effect).toLowerCase() === 'allow');
    if (allowAssignments.length === 0) {
      return denyResult('No allow effect found after filtering assignments');
    }

    const roleIds = uniqueInts(allowAssignments.map(a => a.role_id));
    const permissionIds = uniqueInts(allowAssignments.map(a => a.permission_id));
    const policies = await AuthorizationModel.getPoliciesForDecision(connection, roleIds, permissionIds);

    const matchingDenyPolicies = [];
    const matchingAllowPolicies = [];
    const existingAllowPolicies = [];

    for (const policy of policies) {
      const matches = AuthorizationModel.policyMatches(policy, context);
      const effect = String(policy.effect || '').toLowerCase();

      if (effect === 'allow') {
        existingAllowPolicies.push(policy.policy_code);
      }

      if (!matches) continue;

      if (effect === 'deny') {
        matchingDenyPolicies.push(policy.policy_code);
      } else if (effect === 'allow') {
        matchingAllowPolicies.push(policy.policy_code);
      }
    }

    if (matchingDenyPolicies.length > 0) {
      return denyResult('Matched deny policy', matchingDenyPolicies);
    }

    if (existingAllowPolicies.length > 0 && matchingAllowPolicies.length === 0) {
      return denyResult('Allow policy exists but no allow policy matched request context', existingAllowPolicies);
    }

    await AuthorizationModel.writeAccessAudit(connection, {
      request_id: safeRequestId,
      user_id: userId,
      resource,
      action,
      decision: 'allow',
      reason: 'Permission granted by RBAC/ABAC evaluation',
      policy_hits: JSON.stringify(matchingAllowPolicies),
      context_snapshot: JSON.stringify(context),
      ...requestMeta
    });

    return {
      allowed: true,
      reason: 'Permission granted',
      roleCodes: [...new Set(allowAssignments.map(a => a.role_code))],
      permissionCodes: [...new Set(allowAssignments.map(a => a.permission_code))],
      policyHits: matchingAllowPolicies
    };
  }

  static async checkPermissionFromRequest(connection, req, resource, action, context = {}) {
    const userId = req?.session?.userID;

    if (!userId) {
      return {
        allowed: false,
        reason: 'No authenticated session user'
      };
    }

    return AuthorizationService.checkPermission(connection, {
      userId,
      resource,
      action,
      context,
      requestMeta: buildRequestMeta(req),
      requestId: req?.requestId || null
    });
  }
}
