// Tạo/cập nhật tài khoản BTC từ .env và nạp nội dung mặc định.
// Chạy: npm run seed            (giữ nội dung đã sửa)
//       npm run seed -- --reset-content   (ghi đè nội dung bằng mặc định)
require('dotenv').config();

const User = require('../models/User');
const Content = require('../models/Content');
const Setting = require('../models/Setting');
const defaults = require('../config/defaultContent');

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

if (!email || password.length < 8) {
  console.error('Cần đặt ADMIN_EMAIL và ADMIN_PASSWORD (>= 8 ký tự) trong file .env');
  process.exit(1);
}

const existing = User.findByEmail(email);
if (existing) {
  User.setPassword(existing.id, password);
  console.log(`✔ Đã cập nhật mật khẩu tài khoản BTC: ${email}`);
} else {
  User.create({ email, password, role: 'admin' });
  console.log(`✔ Đã tạo tài khoản BTC: ${email}`);
}

if (Content.isEmpty() || process.argv.includes('--reset-content')) {
  Object.entries(defaults).forEach(([lang, sections]) => {
    Object.entries(sections).forEach(([key, { title, body }]) => Content.upsert(key, lang, title, body));
  });
  console.log('✔ Đã nạp nội dung trang mặc định (VI/EN)');
}

const current = Setting.all();
Object.keys(Setting.DEFAULTS).forEach((k) => Setting.set(k, current[k]));
console.log('✔ Đã khởi tạo cấu hình thời gian thi');
