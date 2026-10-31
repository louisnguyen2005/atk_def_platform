const User = require('../models/User');
const Team = require('../models/Team');

// Nạp người dùng hiện tại và flash message (lưu trong session, hiển thị một lần).
module.exports = function locals(req, res, next) {
  req.user = req.session.userId ? User.findById(req.session.userId) : null;
  if (req.session.userId && !req.user) delete req.session.userId;

  // Thành viên đăng nhập bằng token đội: phiên gắn với đội, không có tài khoản riêng.
  // Token bị BTC cấp lại (hoặc đội bị xóa) thì phiên cũ mất hiệu lực ngay.
  req.memberTeam = null;
  if (req.session.teamId) {
    const team = Team.findBasic(req.session.teamId);
    if (team && team.token === req.session.teamToken) req.memberTeam = team;
    else {
      delete req.session.teamId;
      delete req.session.teamToken;
    }
  }

  req.flash = (type, message) => {
    req.session.flash = req.session.flash || [];
    req.session.flash.push({ type, message });
  };

  res.locals.user = req.user;
  res.locals.memberTeam = req.memberTeam;
  res.locals.flash = req.session.flash || [];
  delete req.session.flash;
  res.locals.currentPath = req.path;
  res.locals.langUrl = (lang) => {
    const params = new URLSearchParams(req.query);
    params.set('lang', lang);
    return `${req.path}?${params.toString()}`;
  };
  next();
};
