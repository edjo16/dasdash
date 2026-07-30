import express from "express";
import { sqlConfig } from "../../dbConfig.js";
import AuthModel from "../models/auth.js";
import AuthController from "../controllers/auth.js";
import { requireAuth } from "../../Middleware/requireAuth.js";
import requirePermission from "../../Middleware/requirePermission.js";
import DevTeamRules from "../../USERS/rule/DevTeam.js";
const router = express.Router();

router.get('/weblogin', async (req, res) => {
    await AuthModel.getWeblogin(sqlConfig, req, res)
})
router.post('/weblogin', async (req, res) => {
    await AuthModel.postWeblogin(sqlConfig, req, res)
 })
router.get('/weblogincambio', async (req, res) => {
    await AuthModel.getWeblogincambio(sqlConfig, req, res)
 })
router.post('/weblogincambio', async (req, res) => {
    await AuthModel.postWeblogincambio(sqlConfig, req, res)
 })
router.get('/webloginforgot', async (req, res) => {
    await AuthModel.getWebloginforgot(sqlConfig, req, res)
 })
router.post('/webloginforgot', async (req, res) => {
    await AuthModel.postWebloginforgot(sqlConfig, req, res)
 })

// Logout: destroy session and redirect to login
router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/weblogin'));
});

// Session keep-alive ping — client calls this when user clicks "I'm Here"
// Touching lastActivity causes express-session to persist the session and
// renew its maxAge (12 h), so the server-side TTL is reset as well.
router.post('/api/session/ping', (req, res) => {
    if (!req.session || !req.session.userID) {
        return res.status(401).json({ ok: false, message: 'Session expired' });
    }
    req.session.lastActivity = Date.now();   // mark modification so the store saves it
    res.json({ ok: true });
});

// DevTeam: switch viewing-as user without changing URL
router.post(
    '/api/session/devteam',
    requireAuth,
    requirePermission('auth.devteam', 'switch_user', {
        legacyFallback: (req) => DevTeamRules.validateTeam(req?.session?.iddevteam, req?.session?.userID)
    }),
    (req, res) => {
        const { userID, iddevteam } = req.body;
        if (!userID) return res.status(400).json({ error: 'userID required' });
        req.session.userID = userID;
        req.session.iddevteam = iddevteam || null;
        res.json({ ok: true });
    }
);

router.get('/api/auth/password-expiry', async (req, res) => {
    await AuthController.getPasswordExpiryStatus(sqlConfig, req, res);
});

router.post('/api/auth/change-password', async (req, res) => {
    await AuthController.changeOwnPassword(sqlConfig, req, res);
});

router.post(
    '/devteam/switch-user',
    requireAuth,
    requirePermission('auth.devteam', 'switch_user', {
        legacyFallback: (req) => DevTeamRules.validateTeam(req?.session?.iddevteam, req?.session?.userID)
    }),
    async (req, res) => {
        await AuthController.devSwitchUser(sqlConfig, req, res)
    }
);

router.post(
    '/devteam/restore-user',
    requireAuth,
    requirePermission('auth.devteam', 'restore_user', {
        legacyFallback: (req) => DevTeamRules.validateTeam(req?.session?.iddevteam, req?.session?.userID)
    }),
    async (req, res) => {
        await AuthController.devRestoreUser(sqlConfig, req, res)
    }
);

// DevTeam: force a user's password to appear expired (testing only)
router.post(
    '/devteam/expire-password',
    requireAuth,
    requirePermission('auth.devteam', 'expire_password', {
        legacyFallback: (req) => DevTeamRules.validateTeam(req?.session?.iddevteam, req?.session?.userID)
    }),
    async (req, res) => {
        await AuthController.devExpirePassword(sqlConfig, req, res);
    }
);

export default router;
