import { sqlConfig } from '../../dbConfig.js';
import AuthorizationModel from '../model/Authorization.js';
import Rules from '../rule/DevTeam.js';

export default class AuthorizationController {
  static async bootstrapSuperAdmin(req, res) {
    try {
      const actorUserId = req?.session?.userID;
      if (!actorUserId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const isLegacyDevTeam = await Rules.validateTeam(req?.session?.iddevteam, actorUserId);
      if (!isLegacyDevTeam) {
        return res.status(403).json({
          success: false,
          message: 'Only legacy DevTeam users can bootstrap initial AUTHZ_SUPERADMIN assignment.'
        });
      }

      const targetUserId = req?.body?.user_id || actorUserId;
      await AuthorizationModel.ensureBaselineAssignment(sqlConfig, targetUserId, actorUserId);

      return res.status(200).json({
        success: true,
        message: 'AUTHZ_SUPERADMIN assignment completed.',
        data: {
          target_user_id: targetUserId
        }
      });
    } catch (error) {
      console.error('Error in bootstrapSuperAdmin:', error);
      return res.status(500).json({
        success: false,
        message: 'Error bootstrapping superadmin assignment.'
      });
    }
  }

  static async myPermissions(req, res) {
    try {
      const userId = req?.session?.userID;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const permissions = await AuthorizationModel.getUserEffectivePermissions(sqlConfig, userId);
      return res.status(200).json({
        success: true,
        data: permissions
      });
    } catch (error) {
      console.error('Error in myPermissions:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching effective permissions.'
      });
    }
  }

  static async listRoles(req, res) {
    try {
      const roles = await AuthorizationModel.listRoles(sqlConfig);
      return res.status(200).json({
        success: true,
        data: roles
      });
    } catch (error) {
      console.error('Error in listRoles:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching authorization roles.'
      });
    }
  }

  static async listPermissions(req, res) {
    try {
      const permissions = await AuthorizationModel.listPermissions(sqlConfig);
      return res.status(200).json({
        success: true,
        data: permissions
      });
    } catch (error) {
      console.error('Error in listPermissions:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching authorization permissions.'
      });
    }
  }

  static async assignRole(req, res) {
    try {
      const actorUserId = req?.session?.userID;
      const {
        user_id: targetUserId,
        role_code: roleCode,
        scope_type: scopeType = 'global',
        scope_id: scopeId = null,
        valid_from: validFrom = null,
        valid_to: validTo = null
      } = req?.body || {};

      if (!targetUserId || !roleCode) {
        return res.status(400).json({
          success: false,
          message: 'user_id and role_code are required.'
        });
      }

      await AuthorizationModel.assignRoleToUser(sqlConfig, {
        targetUserId,
        roleCode,
        scopeType,
        scopeId,
        validFrom,
        validTo,
        assignedBy: actorUserId
      });

      return res.status(200).json({
        success: true,
        message: 'Role assigned successfully.'
      });
    } catch (error) {
      console.error('Error in assignRole:', error);
      return res.status(500).json({
        success: false,
        message: 'Error assigning role.'
      });
    }
  }

  static async revokeRole(req, res) {
    try {
      const {
        user_id: targetUserId,
        role_code: roleCode,
        scope_type: scopeType = 'global',
        scope_id: scopeId = null
      } = req?.body || {};

      if (!targetUserId || !roleCode) {
        return res.status(400).json({
          success: false,
          message: 'user_id and role_code are required.'
        });
      }

      await AuthorizationModel.revokeRoleFromUser(sqlConfig, {
        targetUserId,
        roleCode,
        scopeType,
        scopeId
      });

      return res.status(200).json({
        success: true,
        message: 'Role revoked successfully.'
      });
    } catch (error) {
      console.error('Error in revokeRole:', error);
      return res.status(500).json({
        success: false,
        message: 'Error revoking role.'
      });
    }
  }
}
