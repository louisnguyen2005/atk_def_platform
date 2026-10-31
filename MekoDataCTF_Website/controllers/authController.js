const User = require('../models/User');
const Team = require('../models/Team');
const Setting = require('../models/Setting');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Giới hạn số lần nhập sai token theo IP để không dò được token đội.
const TOKEN_MAX_FAILS = 10;
const TOKEN_WINDOW_MS = 10 * 60 * 1000;
const tokenFails = new Map(); // ip -> { count, resetAt }

function tokenBlocked(ip) {
  const entry = tokenFails.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    tokenFails.delete(ip);
    return false;
  }
  return entry.count >= TOKEN_MAX_FAILS;
}

function recordTokenFail(ip) {
  const entry = tokenFails.get(ip);
  if (!entry || Date.now() > entry.resetAt) tokenFails.set(ip, { count: 1, resetAt: Date.now() + TOKEN_WINDOW_MS });
  else entry.count += 1;
}

// Chỉ cho phép chuyển hướng nội bộ sau khi đăng nhập
function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

function loginView(res, req, { status = 200, email = '', next = '', errors = [], tokenErrors = [] } = {}) {
  res.status(status).render('auth/login', { title: req.t('auth.loginTitle'), email, next, errors, tokenErrors });
}

exports.showLogin = (req, res) => {
  loginView(res, req, { next: req.query.next || '' });
};

exports.login = (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = User.findByEmail(email);

  if (!user || !User.verifyPassword(user, password)) {
    return loginView(res, req, { status: 401, email, next: req.body.next || '', errors: [req.t('auth.invalidCredentials')] });
  }

  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.userId = user.id;
    req.flash('success', req.t('auth.loggedIn'));
    res.redirect(safeNext(req.body.next) || (user.role === 'admin' ? '/admin' : '/team'));
  });
};

// Thành viên đăng nhập bằng token đội do đội trưởng chia sẻ.
exports.tokenLogin = (req, res) => {
  const next = req.body.next || '';
  if (tokenBlocked(req.ip)) {
    return loginView(res, req, { status: 429, next, tokenErrors: [req.t('auth.tokenTooMany')] });
  }
  const team = Team.findByToken(req.body.token);
  if (!team) {
    recordTokenFail(req.ip);
    return loginView(res, req, { status: 401, next, tokenErrors: [req.t('auth.invalidToken')] });
  }
  tokenFails.delete(req.ip);

  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.teamId = team.id;
    req.session.teamToken = team.token;
    req.flash('success', req.t('auth.tokenLoggedIn', { team: team.name }));
    res.redirect(safeNext(next) || '/team');
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
