const Team = require('../models/Team');

// Đội của phiên hiện tại: đội trưởng (đăng nhập email) hoặc thành viên (đăng nhập token đội).
function sessionTeam(req) {
  if (req.memberTeam) return { team: req.memberTeam, role: 'member' };
  if (req.user && req.user.role === 'contestant') {
    const team = Team.findByUser(req.user.id);
    if (team) return { team, role: 'captain' };
  }
  return null;
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  req.flash('error', req.t('auth.loginRequired'));
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

// Chỉ đội trưởng (tài khoản email) mới được tạo/sửa đội; thành viên token chỉ được xem.
function requireCaptain(req, res, next) {
  if (req.user) return next();
  if (req.memberTeam) {
    req.flash('error', req.t('team.captainOnly'));
    return res.redirect('/team');
  }
  return requireLogin(req, res, next);
}

// Xem trang đội: đội trưởng hoặc thành viên đăng nhập bằng token.
function requireTeamAccess(req, res, next) {
  if (req.user || req.memberTeam) return next();
  return requireLogin(req, res, next);
}

function requireAdmin(req, res, next) {
  if (!req.user) return requireLogin(req, res, next);
  if (req.user.role === 'admin') return next();
  res.status(403).render('error', { title: '403', message: req.t('errors.forbidden') });
}

function requireGuest(req, res, next) {
  if (req.memberTeam) return res.redirect('/team');
  if (!req.user) return next();
  res.redirect(req.user.role === 'admin' ? '/admin' : '/team');
}

// Đăng xuất được cho cả tài khoản email lẫn phiên token.
function requireSession(req, res, next) {
  if (req.user || req.memberTeam) return next();
  res.redirect('/');
}

module.exports = { sessionTeam, requireLogin, requireCaptain, requireTeamAccess, requireAdmin, requireGuest, requireSession };
