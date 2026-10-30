const User = require('../models/User');

// Nạp người dùng hiện tại và flash message (lưu trong session, hiển thị một lần).
module.exports = function locals(req, res, next) {
  req.user = req.session.userId ? User.findById(req.session.userId) : null;
  if (req.session.userId && !req.user) delete req.session.userId;

  req.flash = (type, message) => {
    req.session.flash = req.session.flash || [];
    req.session.flash.push({ type, message });
  };

  res.locals.user = req.user;
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
