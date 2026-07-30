import { sqlConfig } from '../dbConfig.js';
import AuthorizationService from '../USERS/services/authorizationService.js';

function normalizeContextValue(value) {
  if (value === undefined) return null;
  return value;
}

export default function requirePermission(resource, action, options = {}) {
  const {
    getContext,
    legacyFallback,
    onDenied
  } = options;

  return async (req, res, next) => {
    try {
      const userId = req?.session?.userID;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const context = typeof getContext === 'function'
        ? (getContext(req) || {})
        : {};

      const normalizedContext = Object.keys(context).reduce((acc, key) => {
        acc[key] = normalizeContextValue(context[key]);
        return acc;
      }, {});

      const decision = await AuthorizationService.checkPermissionFromRequest(
        sqlConfig,
        req,
        resource,
        action,
        normalizedContext
      );

      if (decision.allowed) {
        req.authz = {
          ...(req.authz || {}),
          [resource]: {
            action,
            decision
          }
        };
        return next();
      }

      if (typeof legacyFallback === 'function') {
        const legacyAllowed = await Promise.resolve(legacyFallback(req));
        if (legacyAllowed) {
          req.authz = {
            ...(req.authz || {}),
            [resource]: {
              action,
              decision: {
                ...decision,
                allowed: true,
                reason: 'Allowed by legacy fallback while authz migration completes'
              },
              legacyFallback: true
            }
          };
          return next();
        }
      }

      if (typeof onDenied === 'function') {
        return onDenied(req, res, decision);
      }

      return res.status(403).json({
        success: false,
        message: 'Forbidden',
        details: decision.reason
      });
    } catch (error) {
      if (typeof legacyFallback === 'function') {
        try {
          const legacyAllowed = await Promise.resolve(legacyFallback(req));
          if (legacyAllowed) {
            return next();
          }
        } catch (legacyError) {
          console.error('Legacy fallback error in requirePermission:', legacyError);
        }
      }

      console.error('Authorization error in requirePermission:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization service error'
      });
    }
  };
}
