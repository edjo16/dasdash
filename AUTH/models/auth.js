import pkg from "crypto-js";
import {envio_correo} from '../functions.js';
import sql from 'mssql'; 
import Rules from '../../USERS/rule/DevTeam.js';
 
const { AES, enc } = pkg;

export default class AuthModel {
    constructor() { }

    static async getWeblogin(transaction, req, res) {
        var videos = ["videos/New video.mp4", "videos/Presentation Video - 274111.mp4", "videos/Numbers - 220981.mp4", "videos/Waves - 266311-1.m4v"];
        var random_video = videos[Math.floor(Math.random() * videos.length)];
        let user = req.session?.userID
        var date = new Date()
        const offset = date.getTimezoneOffset()
        date = new Date(date.getTime() - (offset * 60 * 1000) - (1 * 91 * 24 * 60 * 60 * 1000))
        res.render("weblogin", {
            UserEmail1: user,
            title: "Login"
        })
    };
static async postWeblogin(transaction, req, res) {
  try {
    await sql.connect(transaction);

    const userInput = (req.body.name || '').trim();
    const codeInput = (req.body.code || '').trim();

    if (!userInput || !codeInput) {
      return res.render("weblogin", { okForm: 0 });
    }

    // 1) Buscar usuario (parametrizado)
    const findReq = new sql.Request();
    findReq.input('user', sql.VarChar, userInput);
    const result = await findReq.query(`
      SELECT Pscode, PsExp, UserID
      FROM Users
      WHERE UserID = @user OR Email = @user
    `);

    if (!result.recordset || result.recordset.length === 0) {
      // Usuario no existe
      return res.render("weblogin", { okForm: 0 });
    }

    const row = result.recordset[0];

    // 2) Desencriptar con try/catch
    let act = '';
    let expPlain = '';
    try {
      act = AES.decrypt(row.Pscode, "8pZi4!U#r@ejWg8D#87$OMpee89yHD").toString(enc.Utf8);
    } catch (e) { act = ''; }

    try {
      expPlain = AES.decrypt(row.PsExp, "uj8M0N@qBwLT#ZCWA!WRco9&7WhOA1").toString(enc.Utf8);
    } catch (e) { expPlain = ''; }

    // 3) Validar código
    if (act !== codeInput) {
      return res.render("weblogin", { okForm: 0 });
    }

    // 4) Validar expiración
    const now = new Date();

    const redirectToChangePassword = (cb) => {
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          console.error(regenErr);
          return res.render("weblogin", { okForm: 0 });
        }
        req.session.pendingUserID = row.UserID;
        req.session.save(() => cb());
      });
    };

    if (!expPlain) {
      return redirectToChangePassword(() => res.redirect('/weblogincambio'));
    }

    const expDate = new Date(expPlain);
    if (Number.isNaN(expDate.getTime()) || now >= expDate) {
      return redirectToChangePassword(() => res.redirect('/weblogincambio'));
    }

    // 5) Usuario pertenece a DevTeam
    const UserID = row.UserID;
    const devteam = await Rules.validateTeam(UserID, UserID);

    // 6) Extender SeExp (12h) y guardar
    const sessionUntil = new Date(now.getTime() + (12 * 60 * 60 * 1000));
    const sessionEnc = AES.encrypt(sessionUntil.toString(), "$8&fajGD").toString();

    const upReq = new sql.Request();
    upReq.input('user', sql.VarChar, userInput);
    upReq.input('seexp', sql.VarChar, sessionEnc);
    await upReq.query(`
      UPDATE Users SET SeExp = @seexp
      WHERE (UserID = @user OR Email = @user)
    `);

    // 7) Regenerar y guardar sesión en el store
    req.session.regenerate((sessionErr) => {
    if (sessionErr) {
        console.error(sessionErr);
        return res.status(500).send('Error creating session');
    }

    req.session.userID = UserID;
    req.session.iddevteam = devteam ? UserID : null;
    req.session.isImpersonating = false;

    req.session.save((saveErr) => {
        if (saveErr) {
        console.error(saveErr);
        return res.status(500).send('Error Saving session');
        }

        return res.redirect(303, '/');
    });
    });
  } catch (err) {
    console.error(err);
    return res.render("weblogin", { okForm: 0 });
  }
}
    static async getWeblogincambio(transaction, req, res) {
        var user = req.session?.userID || req.session?.pendingUserID || ''
        res.render("weblogincambio", {
            OldPasswordPlaceHolder: "Old Password",
            UserEmail: user,
            title: "Login"
        })
    };
    static async postWeblogincambio(transaction, req, res) {
        try {
            await sql.connect(transaction);

            const user     = (req.body.UserEmail || '').trim();
            const codeold  = (req.body.codeold   || '').trim();
            const code1    = (req.body.code1     || '').trim();
            const code2    = (req.body.code2     || '').trim();
            const tipocambio = req.body.tipocambio || 'Old Password';

            const renderForm = (extra) =>
                res.render('weblogincambio', { OldPasswordPlaceHolder: tipocambio, UserEmail: user, ...extra });

            // New password must differ from old
            if (codeold === code1) return renderForm({ igual: 0 });

            // Confirmation must match
            if (code1 !== code2) return renderForm({ nuevanoigual: 0 });

            if (!user) return renderForm({ act: 0 });

            // Fetch user — parameterized to prevent SQL injection
            const findReq = new sql.Request();
            findReq.input('user', sql.VarChar, user);
            const result = await findReq.query(
                'SELECT Pscode, PsExp, UserID, PsTcode, PsTExp FROM Users WHERE UserID = @user OR Email = @user'
            );

            if (!result.recordset || result.recordset.length === 0) {
                return renderForm({ act: 0 });
            }

            const row    = result.recordset[0];
            const UserID = row.UserID;

            let act = '';
            let acttemp = '';
            try { act     = AES.decrypt(row.Pscode,  '8pZi4!U#r@ejWg8D#87$OMpee89yHD').toString(enc.Utf8); } catch (e) { act = ''; }
            try { acttemp = AES.decrypt(row.PsTcode, '8pZi4!U#r@ejWg8D#87$OMpee89yHD').toString(enc.Utf8); } catch (e) { acttemp = ''; }

            let cambio = false;
            if (codeold === act) {
                cambio = true;
            } else if (acttemp && codeold === acttemp) {
                // Validate temp code has NOT yet expired
                let exptemp = '';
                try { exptemp = AES.decrypt(row.PsTExp, 'uj8M0N@qBwLT#ZCWA!WRco9&7WhOA1').toString(enc.Utf8); } catch (e) { exptemp = ''; }
                const expDate = new Date(exptemp);
                if (exptemp && !Number.isNaN(expDate.getTime()) && new Date() < expDate) {
                    cambio = true;
                }
            }

            if (!cambio) return renderForm({ act: 0 });

            // Build new encrypted values (avoid date mutation)
            const now          = new Date();
            const expNew       = new Date(now);
            expNew.setMonth(expNew.getMonth() + 3);
            const sessionUntil = new Date(now.getTime() + 12 * 60 * 60 * 1000);

            const newPscode = AES.encrypt(code1,                '8pZi4!U#r@ejWg8D#87$OMpee89yHD').toString();
            const newPsExp  = AES.encrypt(expNew.toString(),    'uj8M0N@qBwLT#ZCWA!WRco9&7WhOA1').toString();
            const newSeExp  = AES.encrypt(sessionUntil.toString(), '$8&fajGD').toString();

            const upReq = new sql.Request();
            upReq.input('pscode', sql.VarChar, newPscode);
            upReq.input('psexp',  sql.VarChar, newPsExp);
            upReq.input('seexp',  sql.VarChar, newSeExp);
            upReq.input('user',   sql.VarChar, user);
            await upReq.query(
                'UPDATE Users SET Pscode = @pscode, PsExp = @psexp, SeExp = @seexp, PsTcode = NULL, PsTExp = NULL WHERE UserID = @user OR Email = @user'
            );

            // Check DevTeam membership so privileges are preserved after password change
            const devteam = await Rules.validateTeam(UserID, UserID);

            // Regenerate session to prevent session fixation after authentication
            req.session.regenerate((regenErr) => {
                if (regenErr) {
                    console.error(regenErr);
                    return res.status(500).send('Error creating session');
                }

                req.session.userID          = UserID;
                req.session.iddevteam       = devteam ? UserID : null;
                req.session.isImpersonating = false;

                req.session.save((saveErr) => {
                    if (saveErr) {
                        console.error(saveErr);
                        return res.status(500).send('Error saving session');
                    }
                    return res.redirect('/');
                });
            });

        } catch (err) {
            console.error(err);
            return res.status(500).send('Internal error');
        }
    };
    static async getWebloginforgot(transaction, req, res) {
        let user = req.session?.userID
        res.render("webloginforgot", {
            UserEmail1: user,
            title: "Login",
            okForm: 0
        })
    };
    static async postWebloginforgot(transaction, req, res) {
        try {
            await sql.connect(transaction);

            const user = (req.body.name || '').trim();

            if (!user) {
                return res.render("webloginforgot", {
                    UserEmail1: user,
                    title: "Login",
                    okForm: 0
                });
            }

            const findReq = new sql.Request();
            findReq.input('user', sql.VarChar, user);
            const result = await findReq.query(
                'SELECT Email, PsTcode, PsTExp FROM Users WHERE Email = @user'
            );

            if (!result.recordset || result.recordset.length === 0) {
                // Do not reveal whether the email exists
                return res.render("webloginforgot", {
                    UserEmail1: user,
                    title: "Login",
                    okForm: "If that email is registered, a temporary code has been sent."
                });
            }

            // Generate temporary code: 5 letters + 2 digits
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
            const digits  = '0123456789';
            let PsTcode = '';
            for (let i = 0; i < 5; i++) {
                PsTcode += letters.charAt(Math.floor(Math.random() * letters.length));
            }
            for (let i = 0; i < 2; i++) {
                PsTcode += digits.charAt(Math.floor(Math.random() * digits.length));
            }

            const date = new Date();
            const offset = date.getTimezoneOffset();
            const adjustedDate = new Date(date.getTime() - (offset * 60 * 1000));
            const exptemp = new Date(adjustedDate.setDate(adjustedDate.getDate() + 1));
            const exp     = AES.encrypt(exptemp.toString(), "uj8M0N@qBwLT#ZCWA!WRco9&7WhOA1").toString();
            const acttemp = AES.encrypt(PsTcode, "8pZi4!U#r@ejWg8D#87$OMpee89yHD").toString();

            envio_correo("olvido_contraseña", PsTcode, user);

            const upReq = new sql.Request();
            upReq.input('acttemp', sql.VarChar, acttemp);
            upReq.input('exp',     sql.VarChar, exp);
            upReq.input('user',    sql.VarChar, user);
            await upReq.query(
                'UPDATE Users SET PsTcode = @acttemp, PsTExp = @exp WHERE Email = @user'
            );

            return res.render("weblogincambio", {
                OldPasswordPlaceHolder: "Temporary Password",
                UserEmail: user,
                title: "Login",
                okForm: 0
            });

        } catch (err) {
            console.error(err);
            return res.status(500).send('Internal error');
        }
    };
}