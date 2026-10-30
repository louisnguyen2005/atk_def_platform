const Team = require('../models/Team');
const Member = require('../models/Member');
const User = require('../models/User');
const Setting = require('../models/Setting');
const Content = require('../models/Content');
const exportService = require('../services/exportService');

function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

exports.dashboard = (req, res) => {
  const settings = Setting.all();
  res.render('admin/dashboard', {
    title: req.t('admin.title'),
    stats: {
      teams: Team.count(),
      members: Member.count(),
      accounts: User.countContestants(),
    },
    settings,
    registrationOpen: Setting.isRegistrationOpen(settings),
    recentTeams: Team.listAll().slice(0, 5),
  });
};

// ----- Nội dung trang -----
exports.contents = (req, res) => {
  res.render('admin/contents', {
    title: req.t('admin.contents'),
    sections: Content.SECTIONS,
    contents: Content.allLangs(),
  });
};

exports.saveContents = (req, res) => {
  const input = req.body.contents || {};
  Content.SECTIONS.forEach((key) => {
    ['vi', 'en'].forEach((lang) => {
      const item = input[key] && input[key][lang];
      if (!item) return;
      Content.upsert(key, lang, String(item.title || '').slice(0, 200), String(item.body || '').slice(0, 10000));
    });
  });
  req.flash('success', req.t('admin.saved'));
  res.redirect('/admin/contents');
};

// ----- Thời gian thi -----
exports.schedule = (req, res) => {
  res.render('admin/schedule', { title: req.t('admin.schedule'), settings: Setting.all() });
};

exports.saveSchedule = (req, res) => {
  const values = {
    registration_open: req.body.registration_open ? '1' : '0',
    registration_deadline: String(req.body.registration_deadline || ''),
    contest_start: String(req.body.contest_start || ''),
    contest_end: String(req.body.contest_end || ''),
    event_location: String(req.body.event_location || '').trim().slice(0, 200),
    min_members: String(parseInt(req.body.min_members, 10)),
    max_members: String(parseInt(req.body.max_members, 10)),
  };

  const start = new Date(values.contest_start);
  const end = new Date(values.contest_end);
  const deadline = new Date(values.registration_deadline);
  const min = Number(values.min_members);
  const max = Number(values.max_members);
  const valid =
    !isNaN(start) && !isNaN(end) && !isNaN(deadline) && end > start &&
    Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max <= 10 && min <= max;

  if (!valid) {
    return res.status(400).render('admin/schedule', {
      title: req.t('admin.schedule'),
      settings: { ...Setting.all(), ...values },
      errors: [req.t('admin.invalidSchedule')],
    });
  }

  Setting.setMany(values);
  req.flash('success', req.t('admin.saved'));
  res.redirect('/admin/schedule');
};

// ----- Đội thi -----
exports.teams = (req, res) => {
  const q = String(req.query.q || '').trim();
  res.render('admin/teams', { title: req.t('admin.teams'), teams: Team.listAll(q), q });
};

exports.teamDetail = (req, res, next) => {
  const team = Team.findById(Number(req.params.id));
  if (!team) return next();
  res.render('admin/team', { title: team.name, team });
};

exports.deleteTeam = (req, res) => {
  Team.delete(Number(req.params.id));
  req.flash('success', req.t('admin.deleted'));
  res.redirect('/admin/teams');
};

// ----- Xuất file -----
exports.exportXlsx = async (req, res, next) => {
  try {
    const buffer = await exportService.buildXlsx(Team.listAllWithMembers());
    res.attachment(`MekoDataCTF_teams_${stamp()}.xlsx`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
};

exports.exportCsv = (req, res) => {
  res.attachment(`MekoDataCTF_teams_${stamp()}.csv`);
  res.type('text/csv; charset=utf-8');
  res.send(exportService.buildCsv(Team.listAllWithMembers()));
};
