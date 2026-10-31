const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(process.env.DB_FILE || path.join(dataDir, 'mekodata.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Nâng cấp DB cũ: schema.sql chỉ tạo bảng mới, không thêm cột vào bảng đã có.
const teamColumns = new Set(db.prepare('PRAGMA table_info(teams)').all().map((c) => c.name));
if (!teamColumns.has('token')) db.exec('ALTER TABLE teams ADD COLUMN token TEXT');
if (!teamColumns.has('forcad_name')) db.exec("ALTER TABLE teams ADD COLUMN forcad_name TEXT NOT NULL DEFAULT ''");
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS teams_token_idx ON teams(token)');

// Đội đăng ký trước khi có token: cấp token ngay để đăng nhập và nộp flag được.
const missing = db.prepare("SELECT id FROM teams WHERE token IS NULL OR token = ''").all();
if (missing.length) {
  const setToken = db.prepare('UPDATE teams SET token = ? WHERE id = ?');
  db.transaction(() => missing.forEach(({ id }) => setToken.run(crypto.randomBytes(8).toString('hex'), id)))();
}

module.exports = db;
