import { Router } from 'express';
import { requireAuth } from '../../Middleware/requireAuth.js';
import requirePermission from '../../Middleware/requirePermission.js';
import AuthorizationController from '../controllers/authorizationController.js';

const router = Router();

/*
  Bootstrap is intentionally guarded by legacy DevTeam until first superadmin
  assignment is done; after rollout, this endpoint should be disabled.
*/
router.post('/api/authz/bootstrap', requireAuth, AuthorizationController.bootstrapSuperAdmin);

router.get(
  '/api/authz/my-permissions',
  requireAuth,
  AuthorizationController.myPermissions
);

router.get(
  '/api/authz/health-check',
  requireAuth,
  requirePermission('authz', 'manage'),
  (req, res) => {
    return res.status(200).json({
      success: true,
      message: 'Authorization middleware is active.',
      authz: req.authz || null
    });
  }
);

router.get(
  '/api/authz/roles',
  requireAuth,
  requirePermission('authz', 'manage'),
  AuthorizationController.listRoles
);

router.get(
  '/api/authz/permissions',
  requireAuth,
  requirePermission('authz', 'manage'),
  AuthorizationController.listPermissions
);

router.post(
  '/api/authz/assign-role',
  requireAuth,
  requirePermission('authz', 'manage'),
  AuthorizationController.assignRole
);

router.post(
  '/api/authz/revoke-role',
  requireAuth,
  requirePermission('authz', 'manage'),
  AuthorizationController.revokeRole
);

export default router;
