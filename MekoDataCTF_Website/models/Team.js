const db = require('../config/database');
const Member = require('./Member');

const Team = {
  findById(id) {
    const team = db
      .prepare('SELECT t.*, u.email FROM teams t JOIN users u ON u.id = t.user_id WHERE t.id = ?')
      .get(id);
    if (team) team.members = Member.listByTeam(team.id);
    return team;
  },

  findByUser(userId) {
    const team = db.prepare('SELECT * FROM teams WHERE user_id = ?').get(userId);
    if (team) team.members = Member.listByTeam(team.id);
    return team;
  },

  isNameTaken(name, excludeTeamId = 0) {
    return !!db.prepare('SELECT 1 FROM teams WHERE name = ? AND id != ?').get(name, excludeTeamId);
  },

  createWithMembers: db.transaction((userId, { name, school, phone, members }) => {
    const info = db
      .prepare('INSERT INTO teams (user_id, name, school, phone) VALUES (?, ?, ?, ?)')
      .run(userId, name, school, phone);
    Member.replaceForTeam(info.lastInsertRowid, members);
    return info.lastInsertRowid;
  }),

  updateWithMembers: db.transaction((teamId, { name, school, phone, members }) => {
    db.prepare(
      "UPDATE teams SET name = ?, school = ?, phone = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(name, school, phone, teamId);
    Member.replaceForTeam(teamId, members);
  }),

  delete(id) {
    db.prepare('DELETE FROM teams WHERE id = ?').run(id);
  },

  listAll(search = '') {
    const q = `%${search}%`;
    return db
      .prepare(
        `SELECT t.*, u.email,
                (SELECT COUNT(*) FROM members m WHERE m.team_id = t.id) AS member_count
           FROM teams t JOIN users u ON u.id = t.user_id
          WHERE t.name LIKE ? OR u.email LIKE ? OR t.school LIKE ?
             OR EXISTS (SELECT 1 FROM members m WHERE m.team_id = t.id
                         AND (m.full_name LIKE ? OR m.student_id LIKE ?))
          ORDER BY t.created_at DESC`
      )
      .all(q, q, q, q, q);
  },

  listAllWithMembers() {
    const teams = db
      .prepare(
        'SELECT t.*, u.email FROM teams t JOIN users u ON u.id = t.user_id ORDER BY t.created_at'
      )
      .all();
    teams.forEach((t) => (t.members = Member.listByTeam(t.id)));
    return teams;
  },

  count() {
    return db.prepare('SELECT COUNT(*) AS n FROM teams').get().n;
  },
};

module.exports = Team;
