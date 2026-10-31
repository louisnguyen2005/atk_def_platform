const crypto = require('crypto');
const db = require('../config/database');
const Member = require('./Member');

// Cùng định dạng token đội của ForcAD (secrets.token_hex(8)) để đẩy sang ForcAD được nguyên trạng.
const TOKEN_RE = /^[0-9a-f]{16}$/;
const newToken = () => crypto.randomBytes(8).toString('hex');

const Team = {
  TOKEN_RE,

  // Đăng nhập thành viên bằng token đội (token 64 bit ngẫu nhiên; chống dò bằng giới hạn số lần thử ở controller).
  findByToken(token) {
    const value = String(token || '').trim().toLowerCase();
    if (!TOKEN_RE.test(value)) return null;
    const row = db.prepare('SELECT id FROM teams WHERE token = ?').get(value);
    return row ? this.findById(row.id) : null;
  },

  // Cấp token mới (BTC dùng khi token bị lộ). Token cũ mất hiệu lực ngay trên website;
  // cần chạy lại scripts/sync-forcad-tokens.js để ForcAD nhận token mới.
  regenerateToken(id) {
    const token = newToken();
    db.prepare("UPDATE teams SET token = ?, updated_at = datetime('now') WHERE id = ?").run(token, id);
    return token;
  },

  setForcadName(id, forcadName) {
    db.prepare("UPDATE teams SET forcad_name = ?, updated_at = datetime('now') WHERE id = ?").run(forcadName, id);
  },

  // Tên đội dùng để khớp với ForcAD: tên đã khai báo riêng, nếu trống thì dùng tên đội.
  forcadNameOf(team) {
    return (team.forcad_name || team.name || '').trim();
  },
  findById(id) {
    const team = db
      .prepare('SELECT t.*, u.email FROM teams t JOIN users u ON u.id = t.user_id WHERE t.id = ?')
      .get(id);
    if (team) team.members = Member.listByTeam(team.id);
    return team;
  },

  // Bản rút gọn cho phiên đăng nhập bằng token (chạy ở mọi request nên không nạp thành viên).
  findBasic(id) {
    return db.prepare('SELECT id, name, token, forcad_name FROM teams WHERE id = ?').get(id);
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
      .prepare('INSERT INTO teams (user_id, name, school, phone, token) VALUES (?, ?, ?, ?, ?)')
      .run(userId, name, school, phone, newToken());
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
