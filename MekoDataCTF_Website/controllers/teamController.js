const Team = require('../models/Team');
const Member = require('../models/Member');
const Setting = require('../models/Setting');

const STUDENT_ID_RE = /^[A-Za-z0-9]{4,15}$/;
const PHONE_RE = /^[0-9+\s().-]{8,20}$/;

// Gom dữ liệu form: members[i][full_name], members[i][student_id]
function parseForm(body) {
  const raw = body.members ? Object.values(body.members) : [];
  return {
    name: String(body.name || '').trim(),
    school: String(body.school || '').trim().slice(0, 120),
    phone: String(body.phone || '').trim(),
    members: raw
      .map((m) => ({
        full_name: String(m.full_name || '').trim().replace(/\s+/g, ' ').slice(0, 80),
        student_id: String(m.student_id || '').trim().toUpperCase(),
      }))
      .filter((m) => m.full_name || m.student_id),
  };
}

function validate(req, data, settings, teamId = 0) {
  const t = req.t;
  const min = Number(settings.min_members) || 1;
  const max = Number(settings.max_members) || 4;
  const errors = [];

  if (data.name.length < 2 || data.name.length > 50) errors.push(t('team.errors.nameRequired'));
  else if (Team.isNameTaken(data.name, teamId)) errors.push(t('team.errors.nameTaken'));

  if (data.phone && !PHONE_RE.test(data.phone)) errors.push(t('team.errors.phone'));

  if (data.members.length < min || data.members.length > max) {
    errors.push(t('team.errors.memberCount', { min, max }));
  }
  data.members.forEach((m, i) => {
    if (!m.full_name) errors.push(t('team.errors.memberName', { n: i + 1 }));
    if (!STUDENT_ID_RE.test(m.student_id)) errors.push(t('team.errors.studentId', { n: i + 1 }));
  });

  const ids = data.members.map((m) => m.student_id);
  if (new Set(ids).size !== ids.length) errors.push(t('team.errors.duplicateInTeam'));

  const taken = Member.findTakenStudentIds(ids, teamId);
  if (taken.length) errors.push(t('team.errors.studentIdTaken', { ids: taken.join(', ') }));

  return errors;
}

function formView(req, res, { team, data, errors = [], status = 200 }) {
  const settings = Setting.all();
  res.status(status).render('team/form', {
    title: team ? req.t('team.editTitle') : req.t('team.createTitle'),
    team,
    data,
    errors,
    minMembers: Number(settings.min_members) || 1,
    maxMembers: Number(settings.max_members) || 4,
  });
}

exports.show = (req, res) => {
  const team = Team.findByUser(req.user.id);
  if (!team) return res.redirect('/team/edit');
  res.render('team/show', {
    title: req.t('team.title'),
    team,
    canEdit: Setting.isRegistrationOpen(),
  });
};

exports.edit = (req, res) => {
  const team = Team.findByUser(req.user.id);
  if (!Setting.isRegistrationOpen()) {
    req.flash('error', req.t('team.locked'));
    return res.redirect(team ? '/team' : '/');
  }
  const data = team
    ? { name: team.name, school: team.school, phone: team.phone, members: team.members }
    : { name: '', school: '', phone: '', members: [{ full_name: '', student_id: '' }] };
  formView(req, res, { team, data });
};

exports.save = (req, res) => {
  const settings = Setting.all();
  const team = Team.findByUser(req.user.id);

  if (!Setting.isRegistrationOpen(settings)) {
    req.flash('error', req.t('team.locked'));
    return res.redirect(team ? '/team' : '/');
  }

  const data = parseForm(req.body);
  const errors = validate(req, data, settings, team ? team.id : 0);
  if (errors.length) {
    if (data.members.length === 0) data.members.push({ full_name: '', student_id: '' });
    return formView(req, res, { team, data, errors, status: 400 });
  }

  try {
    if (team) {
      Team.updateWithMembers(team.id, data);
      req.flash('success', req.t('team.updated'));
    } else {
      Team.createWithMembers(req.user.id, data);
      req.flash('success', req.t('team.created'));
    }
  } catch (err) {
    // Ràng buộc UNIQUE có thể bị vi phạm nếu hai đội gửi cùng lúc
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
      return formView(req, res, { team, data, errors: [req.t('team.errors.nameTaken')], status: 409 });
    }
    throw err;
  }
  res.redirect('/team');
};
