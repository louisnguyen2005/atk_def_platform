const db = require('../config/database');

const Member = {
  listByTeam(teamId) {
    return db
      .prepare('SELECT * FROM members WHERE team_id = ? ORDER BY position')
      .all(teamId);
  },

  replaceForTeam(teamId, members) {
    db.prepare('DELETE FROM members WHERE team_id = ?').run(teamId);
    const insert = db.prepare(
      'INSERT INTO members (team_id, full_name, student_id, is_leader, position) VALUES (?, ?, ?, ?, ?)'
    );
    members.forEach((m, i) => insert.run(teamId, m.full_name, m.student_id, i === 0 ? 1 : 0, i));
  },

  // Trả về các MSSV đã thuộc đội khác (để báo trùng)
  findTakenStudentIds(studentIds, excludeTeamId = 0) {
    if (studentIds.length === 0) return [];
    const placeholders = studentIds.map(() => '?').join(',');
    return db
      .prepare(
        `SELECT student_id FROM members WHERE student_id IN (${placeholders}) AND team_id != ?`
      )
      .all(...studentIds, excludeTeamId)
      .map((r) => r.student_id);
  },

  count() {
    return db.prepare('SELECT COUNT(*) AS n FROM members').get().n;
  },
};

module.exports = Member;
