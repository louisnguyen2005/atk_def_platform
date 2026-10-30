const db = require('../config/database');

// Các mục nội dung trên trang chủ, theo thứ tự hiển thị
const SECTIONS = ['hero', 'about', 'format', 'rules', 'prizes', 'faq', 'contact'];

const Content = {
  SECTIONS,

  // { hero: {title, body}, about: {...}, ... } cho một ngôn ngữ
  byLang(lang) {
    const rows = db.prepare('SELECT key, title, body FROM contents WHERE lang = ?').all(lang);
    const map = {};
    SECTIONS.forEach((k) => (map[k] = { title: '', body: '' }));
    rows.forEach((r) => (map[r.key] = { title: r.title, body: r.body }));
    return map;
  },

  // { vi: {...}, en: {...} } cho trang quản trị
  allLangs() {
    return { vi: this.byLang('vi'), en: this.byLang('en') };
  },

  upsert(key, lang, title, body) {
    db.prepare(
      `INSERT INTO contents (key, lang, title, body) VALUES (?, ?, ?, ?)
       ON CONFLICT(key, lang) DO UPDATE SET title = excluded.title, body = excluded.body,
       updated_at = datetime('now')`
    ).run(key, lang, title, body);
  },

  isEmpty() {
    return db.prepare('SELECT COUNT(*) AS n FROM contents').get().n === 0;
  },
};

module.exports = Content;
