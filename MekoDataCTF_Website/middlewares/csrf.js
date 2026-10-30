const crypto = require('crypto');

// Token CSRF đồng bộ theo session: mọi form POST phải gửi trường _csrf.
module.exports = function csrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const sent = String((req.body && req.body._csrf) || req.get('x-csrf-token') || '');
  const expected = req.session.csrfToken;
  if (sent.length === expected.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))) {
    return next();
  }
  res.status(403).render('error', { title: '403', message: req.t('errors.csrf') });
};
