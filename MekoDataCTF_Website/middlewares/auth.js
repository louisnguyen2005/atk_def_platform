function requireLogin(req, res, next) {
  if (req.user) return next();
  req.flash('error', req.t('auth.loginRequired'));
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

function requireAdmin(req, res, next) {
  if (!req.user) return requireLogin(req, res, next);
  if (req.user.role === 'admin') return next();
  res.status(403).render('error', { title: '403', message: req.t('errors.forbidden') });
}

function requireGuest(req, res, next) {
  if (!req.user) return next();
  res.redirect(req.user.role === 'admin' ? '/admin' : '/team');
}

module.exports = { requireLogin, requireAdmin, requireGuest };
