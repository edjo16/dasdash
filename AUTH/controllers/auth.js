import Rules from '../../USERS/rule/DevTeam.js';
import sql from 'mssql';
import pkg from 'crypto-js';
const { AES, enc } = pkg;

export default class AuthController {

    static async devSwitchUser(connection, req, res) {

        try {
            const { targetUserID } = req.body;

            if (!targetUserID) {
                return res.status(400).json({ ok: false, message: 'targetUserID es required' });
            }

            if (!req.session?.iddevteam) {
                return res.status(403).json({ ok: false, message: 'Not authorized' });
            }

            const realDevUserID = req.session.iddevteam;

            const isDev = await Rules.validateTeam(realDevUserID, realDevUserID);
            if (!isDev) {
                return res.status(403).json({ ok: false, message: 'Your are not part of the dev Team' });
            }

            const canImpersonate = await Rules.validateTeam(realDevUserID, targetUserID);
            if (!canImpersonate) {
                return res.status(403).json({ ok: false, message: 'You cannot access with this user' });
            }

            req.session.userID = targetUserID;
            req.session.isImpersonating = true;

            return req.session.save((err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ ok: false, message: 'We could not save the session' });
                }

                return res.json({ ok: true });
            });

        } catch (error) {
            console.error(error);
            return res.status(500).json({ ok: false, message: 'Internal Error' });
        }
    };
    static async devRestoreUser(connection, req, res) {
        try {
            if (!req.session?.iddevteam) {
                return res.status(403).json({ ok: false, message: 'Not authorized' });
            }

            req.session.userID = req.session.iddevteam;
            req.session.isImpersonating = false;

            return req.session.save((err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ ok: false, message: 'No session restaured' });
                }

                return res.json({ ok: true });
            });

        } catch (error) {
            console.error(error);
            return res.status(500).json({ ok: false, message: 'Internal error' });
        }
    }

    /**
     * DevTeam only — forces PsExp to a past date so the next login
     * redirects to /weblogincambio (password-change flow).
     * Body: { targetUserID: string }
     */
    static async devExpirePassword(connection, req, res) {
        try {

            const { targetUserID } = req.body;
            if (!targetUserID) {
                return res.status(400).json({ ok: false, message: 'targetUserID is required' });
            }

            // Set PsExp to yesterday so the current password is immediately expired
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const expiredEnc = AES.encrypt(yesterday.toString(), 'uj8M0N@qBwLT#ZCWA!WRco9&7WhOA1').toString();

            await sql.connect(connection);
            const request = new sql.Request();
            request.input('psexp', sql.VarChar, expiredEnc);
            request.input('uid',   sql.VarChar, targetUserID);
            const result = await request.query(
                'UPDATE Users SET PsExp = @psexp WHERE UserID = @uid'
            );

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ ok: false, message: 'User not found' });
            }

            return res.json({ ok: true, message: `Password expired for ${targetUserID}` });

        } catch (error) {
            console.error(error);
            return res.status(500).json({ ok: false, message: 'Internal error' });
        }
    }

    static async getPasswordExpiryStatus(connection, req, res) {
        try {
            const userID = req.session?.userID;
            if (!userID) {
                return res.status(401).json({ ok: false, message: 'Unauthorized' });
            }

            await sql.connect(connection);
            const request = new sql.Request();
            request.input('uid', sql.VarChar, userID);
            const result = await request.query('SELECT PsExp FROM Users WHERE UserID = @uid');

            if (!result.recordset || result.recordset.length === 0) {
                return res.status(404).json({ ok: false, message: 'User not found' });
            }

            let expPlain = '';
            try {
                expPlain = AES.decrypt(result.recordset[0].PsExp || '', 'uj8M0N@qBwLT#ZCWA!WRco9&7WhOA1').toString(enc.Utf8);
            } catch (e) {
                expPlain = '';
            }

            const expDate = new Date(expPlain);
            if (!expPlain || Number.isNaN(expDate.getTime())) {
                return res.json({
                    ok: true,
                    daysRemaining: null,
                    expiresAt: null,
                    isExpiringSoon: false
                });
            }

            const msRemaining = expDate.getTime() - Date.now();
            const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

            return res.json({
                ok: true,
                daysRemaining,
                expiresAt: expDate.toISOString(),
                isExpiringSoon: daysRemaining <= 10
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ ok: false, message: 'Internal error' });
        }
    }

    static async changeOwnPassword(connection, req, res) {
        try {
            const userID = req.session?.userID;
            if (!userID) {
                return res.status(401).json({ ok: false, message: 'Unauthorized' });
            }

            const currentPassword = (req.body?.currentPassword || '').trim();
            const newPassword = (req.body?.newPassword || '').trim();

            if (!currentPassword || !newPassword) {
                return res.status(400).json({ ok: false, message: 'Current and new password are required' });
            }

            if (currentPassword === newPassword) {
                return res.status(400).json({ ok: false, message: 'New password must be different from current password' });
            }

            await sql.connect(connection);

            const findReq = new sql.Request();
            findReq.input('uid', sql.VarChar, userID);
            const findResult = await findReq.query('SELECT Pscode FROM Users WHERE UserID = @uid');

            if (!findResult.recordset || findResult.recordset.length === 0) {
                return res.status(404).json({ ok: false, message: 'User not found' });
            }

            let currentStored = '';
            try {
                currentStored = AES.decrypt(findResult.recordset[0].Pscode || '', '8pZi4!U#r@ejWg8D#87$OMpee89yHD').toString(enc.Utf8);
            } catch (e) {
                currentStored = '';
            }

            if (currentStored !== currentPassword) {
                return res.status(400).json({ ok: false, message: 'Current password is incorrect' });
            }

            const now = new Date();
            const nextExpiration = new Date(now);
            nextExpiration.setMonth(nextExpiration.getMonth() + 3);

            const encryptedPassword = AES.encrypt(newPassword, '8pZi4!U#r@ejWg8D#87$OMpee89yHD').toString();
            const encryptedExp = AES.encrypt(nextExpiration.toString(), 'uj8M0N@qBwLT#ZCWA!WRco9&7WhOA1').toString();

            const updateReq = new sql.Request();
            updateReq.input('uid', sql.VarChar, userID);
            updateReq.input('pscode', sql.VarChar, encryptedPassword);
            updateReq.input('psexp', sql.VarChar, encryptedExp);
            await updateReq.query(`
                UPDATE Users
                SET Pscode = @pscode,
                    PsExp = @psexp,
                    PsTcode = NULL,
                    PsTExp = NULL,
                    fmodificado = GETDATE()
                WHERE UserID = @uid
            `);

            return res.json({
                ok: true,
                message: 'Password updated successfully',
                expiresAt: nextExpiration.toISOString()
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ ok: false, message: 'Internal error' });
        }
    }
}