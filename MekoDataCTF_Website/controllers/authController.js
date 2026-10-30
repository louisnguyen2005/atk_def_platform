const User = require('../models/User');
const Setting = require('../models/Setting');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Chỉ cho phép chuyển hướng nội bộ sau khi đăng nhập
function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

exports.showLogin = (req, res) => {
  res.render('auth/login', { title: req.t('auth.loginTitle'), email: '', next: req.query.next || '' });
};

exports.login = (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = User.findByEmail(email);

  if (!user || !User.verifyPassword(user, password)) {
    return res.status(401).render('auth/login', {
      title: req.t('auth.loginTitle'),
      email,
      next: req.body.next || '',
      errors: [req.t('auth.invalidCredentials')],
    });
  }

  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.userId = user.id;
    req.flash('success', req.t('auth.loggedIn'));
    res.redirect(safeNext(req.body.next) || (user.role === 'admin' ? '/admin' : '/team'));
  });
};

exports.showRegister = (req, res) => {
  res.render('auth/register', {
    title: req.t('auth.registerTitle'),
    email: '',
    registrationOpen: Setting.isRegistrationOpen(),
  });
};

exports.register = (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirmPassword || '');
  const registrationOpen = Setting.isRegistrationOpen();

  const errors = [];
  if (!registrationOpen) errors.push(req.t('auth.registrationClosed'));
  if (!EMAIL_RE.test(email) || email.length > 120) errors.push(req.t('auth.invalidEmail'));
  if (password.length < 8) errors.push(req.t('auth.passwordTooShort'));
  if (password !== confirm) errors.push(req.t('auth.passwordMismatch'));
  if (errors.length === 0 && User.findByEmail(email)) errors.push(req.t('auth.emailTaken'));

  if (errors.length) {
    return res.status(400).render('auth/register', {
      title: req.t('auth.registerTitle'),
      email,
      registrationOpen,
      errors,
    });
  }

  const user = User.create({ email, password });
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.userId = user.id;
    req.flash('success', req.t('auth.registered'));
    res.redirect('/team/edit');
  });
};

exports.logout = (req, res) => {
  const t = req.t;
  req.session.regenerate(() => {
    req.flash('success', t('auth.loggedOut'));
    res.redirect('/');
  });
};
