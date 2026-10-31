PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'contestant' CHECK (role IN ('contestant', 'admin')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  school      TEXT    NOT NULL DEFAULT '',
  phone       TEXT    NOT NULL DEFAULT '',
  -- Token đội: cấp khi tạo đội, dùng để thành viên đăng nhập và nộp flag (khớp token đội trên ForcAD).
  token       TEXT,
  -- Tên đội tương ứng trên ForcAD (để trống = trùng tên đội); dùng khi đồng bộ token.
  forcad_name TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  full_name   TEXT    NOT NULL,
  student_id  TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  is_leader   INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contents (
  key        TEXT NOT NULL,
  lang       TEXT NOT NULL CHECK (lang IN ('vi', 'en')),
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (key, lang)
);
