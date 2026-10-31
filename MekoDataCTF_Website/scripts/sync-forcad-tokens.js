// Đồng bộ token đội từ website sang ForcAD, để flag nộp bằng token đội được ForcAD cộng điểm đúng đội.
//
// Website là nơi cấp token (lúc đội trưởng tạo đội). Mỗi đội trên website được ghép với đội cùng tên
// trên ForcAD (hoặc theo "Tên đội trên ForcAD" khai ở trang quản trị), rồi ghi token của website vào ForcAD.
//
//   node scripts/sync-forcad-tokens.js            # chỉ xem kế hoạch, không ghi gì
//   node scripts/sync-forcad-tokens.js --apply    # ghi token sang ForcAD
//
// Biến môi trường: FORCAD_URL (mặc định http://127.0.0.1:18080), FORCAD_ADMIN_USER (mặc định forcad),
// FORCAD_ADMIN_PASSWORD (bắt buộc, mục admin.password trong ForcAD-demo/config.yml), DB_FILE (tùy chọn).
//
// Chạy lại sau khi: tạo thêm đội trên ForcAD, BTC cấp token mới cho đội, hoặc round1 "tái tạo"
// (ForcAD tự sinh lại token khi tái tạo).
require('dotenv').config();
const Team = require('../models/Team');

const apply = process.argv.includes('--apply');
const origin = process.env.FORCAD_URL || 'http://127.0.0.1:18080';
const username = process.env.FORCAD_ADMIN_USER || 'forcad';
const password = process.env.FORCAD_ADMIN_PASSWORD || '';

async function main() {
  if (!password) {
    console.error('Thiếu FORCAD_ADMIN_PASSWORD (mục admin.password trong ForcAD-demo/config.yml).');
    return 2;
  }

  // Đăng nhập API quản trị ForcAD: phiên nằm trong cookie "session".
  const login = await fetch(new URL('/api/admin/login/', origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    redirect: 'error',
  });
  if (!login.ok) {
    console.error(`Đăng nhập ForcAD thất bại (HTTP ${login.status}). Kiểm tra tài khoản quản trị.`);
    return 2;
  }
  const session = (login.headers.get('set-cookie') || '').match(/session=([^;]+)/);
  if (!session) {
    console.error('ForcAD không trả cookie phiên quản trị.');
    return 2;
  }
  const api = (path, init = {}) => fetch(new URL('/api/admin/' + path, origin), {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: `session=${session[1]}` },
    redirect: 'error',
  });

  const list = await api('teams/');
  if (!list.ok) {
    console.error(`Không đọc được danh sách đội ForcAD (HTTP ${list.status}).`);
    return 2;
  }
  const forcadTeams = (await list.json()).filter((t) => t.active);
  const byName = new Map(forcadTeams.map((t) => [String(t.name).trim().toLowerCase(), t]));
  const websiteTeams = Team.listAll();

  let problems = 0;
  const plan = [];
  const matched = new Set();
  for (const team of websiteTeams) {
    const target = Team.forcadNameOf(team);
    const forcad = byName.get(target.toLowerCase());
    if (!forcad) {
      console.log(`✗ ${team.name}: chưa có đội "${target}" (đang hoạt động) trên ForcAD`);
      problems += 1;
      continue;
    }
    if (matched.has(forcad.id)) {
      console.log(`✗ ${team.name}: đội ForcAD "${forcad.name}" đã ghép với đội website khác`);
      problems += 1;
      continue;
    }
    matched.add(forcad.id);
    // Không để hai đội ForcAD trùng token: ForcAD tra đội theo token khi nhận flag.
    const clash = forcadTeams.find((t) => t.id !== forcad.id && t.token === team.token);
    if (clash) {
      console.log(`✗ ${team.name}: token đang thuộc đội ForcAD "${clash.name}"`);
      problems += 1;
      continue;
    }
    if (forcad.token === team.token) {
      console.log(`✓ ${team.name} → ${forcad.name}: token đã khớp`);
      continue;
    }
    plan.push({ team, forcad });
    console.log(`→ ${team.name} → ${forcad.name}: ${apply ? 'ghi token' : 'sẽ ghi token (chạy lại với --apply)'}`);
  }

  for (const forcad of forcadTeams) {
    if (!matched.has(forcad.id)) console.log(`· Đội ForcAD "${forcad.name}" không ghép với đội website nào (giữ token của ForcAD)`);
  }

  if (apply) {
    for (const { team, forcad } of plan) {
      const res = await api(`teams/${forcad.id}/`, { method: 'PUT', body: JSON.stringify({ ...forcad, token: team.token }) });
      if (!res.ok) {
        console.log(`✗ ${team.name}: ForcAD từ chối cập nhật (HTTP ${res.status})`);
        problems += 1;
      }
    }
  }

  const written = apply ? plan.length : 0;
  console.log(`\n${websiteTeams.length} đội website · ${forcadTeams.length} đội ForcAD đang hoạt động · ${apply ? `đã ghi ${written}` : `cần ghi ${plan.length}`} · ${problems} vấn đề`);
  return problems ? 1 : 0;
}

// Đặt exitCode thay vì process.exit(): để kết nối HTTP đóng xong rồi mới thoát
// (gọi process.exit() khi socket còn mở làm Node trên Windows báo lỗi assert của libuv).
main().then((code) => { process.exitCode = code; }, (err) => {
  console.error('Không kết nối được ForcAD:', err.message);
  process.exitCode = 2;
});
