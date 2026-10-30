const Content = require('../models/Content');
const Setting = require('../models/Setting');
const Team = require('../models/Team');

exports.index = (req, res) => {
  const settings = Setting.all();
  res.render('home', {
    title: req.t('site.tagline'),
    isHome: true,
    content: Content.byLang(req.lang),
    settings,
    registrationOpen: Setting.isRegistrationOpen(settings),
    hasTeam: req.user ? !!Team.findByUser(req.user.id) : false,
  });
};
