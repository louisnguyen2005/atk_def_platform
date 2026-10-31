const db = require('../config/database');

// Mỗi đội tối đa 4 thành viên: cố định, không chỉnh trong trang quản trị.
const MAX_MEMBERS = 4;

const DEFAULTS = {
  event_location: 'Trường Đại học Cần Thơ — Khu II, đường 3/2, Ninh Kiều, Cần Thơ',
  registration_open: '1',
  registration_deadline: '2026-12-01T23:59',
  contest_start: '2026-12-06T08:00',
  contest_end: '2026-12-06T17:00',
  max_members: '4',
  min_members: '1',
};

const Setting = {
  DEFAULTS,
  MAX_MEMBERS,

  all() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const result = { ...DEFAULTS };
    rows.forEach((r) => (result[r.key] = r.value));
    // Bỏ qua giá trị max_members cũ còn lưu trong DB; tối thiểu cũng không vượt quá mức tối đa cố định.
    result.max_members = String(MAX_MEMBERS);
    const min = Number(result.min_members);
    result.min_members = String(Number.isInteger(min) ? Math.min(Math.max(min, 1), MAX_MEMBERS) : 1);
    return result;
  },

  set(key, value) {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, String(value));
  },

  setMany(values) {
    db.transaction(() => Object.entries(values).forEach(([k, v]) => this.set(k, v)))();
  },

  // Đăng ký/sửa đội chỉ được phép khi BTC bật đăng ký và chưa quá hạn
  isRegistrationOpen(settings = this.all()) {
    if (settings.registration_open !== '1') return false;
    const deadline = new Date(settings.registration_deadline);
    return isNaN(deadline) || Date.now() <= deadline.getTime();
  },
};

module.exports = Setting;
