
export function requireAuth(req, res, next) {
  if (!req.session || !req.session.userID) return res.redirect('/weblogin');
  next();
}
