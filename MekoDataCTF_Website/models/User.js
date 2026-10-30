const bcrypt = require('bcryptjs');
const db = require('../config/database');

const User = {
  findById(id) {
    return db.prepare('SELECT id, email, role, created_at FROM users WHERE id = ?').get(id);
  },

  findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },

  create({ email, password, role = 'contestant' }) {
    const hash = bcrypt.hashSync(password, 10);
    const info = db
      .prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
      .run(email, hash, role);
    return this.findById(info.lastInsertRowid);
  },

  setPassword(id, password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), id);
  },

  verifyPassword(user, password) {
    return bcrypt.compareSync(password, user.password_hash);
  },

  countContestants() {
    return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'contestant'").get().n;
  },
};

module.exports = User;
