// World Arena: bản đồ, linh thú 12 con giáp, đạn tấn công, khiên phòng thủ, nhật ký và nộp flag.
// Dữ liệu đến từ arena.js (sự kiện 'arena-state'); mọi con số điểm lấy từ ForcAD, file này chỉ dựng hiệu ứng.
(() => {
'use strict';
const root = document.querySelector('[data-arena]');
const stage = document.querySelector('.map-stage');
if (!root || !stage) return;

const NS = 'http://www.w3.org/2000/svg';
const W = 1600, H = 1000; // viewBox bản đồ (config/arenaMap.js)
const $ = s => document.querySelector(s);
const json = (v, fallback) => { try { return JSON.parse(v); } catch (_) { return fallback; } };
const SLOTS = json(stage.dataset.slots, [[260, 190], [1180, 320], [300, 720], [1250, 620]]);
const LANDS = json(stage.dataset.lands, []);
const ZODIAC_LIST = json(stage.dataset.zodiac, []);
const ZODIAC = new Map(ZODIAC_LIST.map(z => [z.id, z]));
const COLORS = ['#38bdf8', '#fb923c', '#c084fc', '#facc15', '#2dd4bf', '#f472b6', '#a3e635', '#818cf8', '#fda4af', '#5eead4', '#fde68a', '#93c5fd'];
// Luật điểm của cuộc thi, chỉ dùng cho phần chú giải.
const RULES = { flag: 100, sla: 100, down: 100 };
const STATUS = { 101: 'UP', 102: 'CORRUPT', 103: 'MUMBLE', 104: 'DOWN', 110: 'CHECKING', '-1': 'NOT CHECKED' };
const BLOCK_REASON = { expired: 'flag hết hạn', invalid: 'flag sai định dạng/hết hạn', duplicate: 'flag đã nộp rồi' };

const fx = $('#fx-layer');
const bases = new Map();    // team -> phần tử căn cứ
const teamInfo = new Map(); // team -> { id, name, color, zodiac, land, territory, x, y }
const key = name => String(name || '').toLowerCase();
const fmt = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
const timeOf = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleTimeString('vi-VN'); };
const rnd = (a, b) => a + Math.random() * (b - a);

let previous = null;      // điểm lần trước: Map team -> score
let seenCaptures = null;  // null ở lần nhận đầu: không bắn lại lịch sử
let seenDefends = null;
let lastScores = [], lastServices = null;
const localEvents = [];   // đòn bị chặn mô phỏng tại chỗ từ form nộp flag

/* ---------- Hiệu ứng động: bật/tắt, tạm dừng khi ẩn tab ---------- */
const motionButton = $('[data-motion]');
let motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
try { const saved = localStorage.getItem('arena-motion'); if (saved) motion = saved === 'on'; } catch (_) {}
function applyMotion() {
  root.classList.toggle('calm', !motion);
  motionButton.setAttribute('aria-pressed', String(motion));
  motionButton.textContent = 'Hiệu ứng động: ' + (motion ? 'BẬT' : 'TẮT');
}
motionButton.addEventListener('click', () => {
  motion = !motion;
  try { localStorage.setItem('arena-motion', motion ? 'on' : 'off'); } catch (_) {}
  applyMotion();
});
applyMotion();
const animate = () => motion && !document.hidden;
document.addEventListener('visibilitychange', () => root.classList.toggle('tab-hidden', document.hidden));

/* ---------- SVG & hình học ---------- */
function svg(tag, attrs, parent = fx) {
  const el = document.createElementNS(NS, tag);
  for (const [a, v] of Object.entries(attrs)) el.setAttribute(a, v);
  parent.append(el);
  return el;
}

function blobPath(cx, cy, r, seed, n = 12) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, j = (((Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1) + 1) % 1;
    pts.push([cx + Math.cos(a) * r * (.82 + .3 * j), cy + Math.sin(a) * r * (.82 + .3 * j)]);
  }
  const f = v => v.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

function slotOf(i) {
  const [x, y] = SLOTS[i % SLOTS.length], lap = Math.floor(i / SLOTS.length);
  return [x + lap * 46, y + lap * 38]; // quá số vị trí: đặt lệch cạnh vị trí cũ
}

// Nền 4K: chỉ hiện (và bật sóng) khi ảnh đã giải mã xong, tránh lộ biển trống lúc mới tải.
(function terrain() {
  const img = stage.querySelector('.map-terrain');
  const ready = () => stage.classList.add('terrain-ready');
  if (img.complete && img.naturalWidth) return ready();
  (img.decode ? img.decode() : Promise.reject()).then(ready, () => img.addEventListener('load', ready, { once: true }));
})();

// Lấp lánh mặt nước quanh vùng nắng (lớp này đã được che phần đất liền bằng sea-mask).
(function sparkles() {
  const group = $('#sparkles');
  for (let i = 0; i < 90; i++) {
    const near = i < 56, a = rnd(0, Math.PI * 2), d = Math.sqrt(Math.random()), rot = -24 * Math.PI / 180;
    const ex = near ? 360 * d * Math.cos(a) : rnd(-1500, 0), ey = near ? 160 * d * Math.sin(a) : rnd(0, 950);
    const x = near ? 1330 + ex * Math.cos(rot) - ey * Math.sin(rot) : 1550 + ex, y = near ? 150 + ex * Math.sin(rot) + ey * Math.cos(rot) : 30 + ey;
    const s = near ? rnd(5, 11) : rnd(3, 6);
    const star = svg('path', { d: `M${x} ${y - s}L${x + s * .2} ${y - s * .2}L${x + s} ${y}L${x + s * .2} ${y + s * .2}L${x} ${y + s}L${x - s * .2} ${y + s * .2}L${x - s} ${y}L${x - s * .2} ${y - s * .2}Z`, class: 'spark' }, group);
    star.style.animationDelay = rnd(0, 6).toFixed(2) + 's';
    star.style.animationDuration = rnd(2.4, 5).toFixed(2) + 's';
  }
})();

/* ---------- Đội, con giáp, vùng đất ---------- */
function setFacing(team, dir) {
  const base = bases.get(team), info = teamInfo.get(team);
  if (!base || !info) return;
  const native = info.zodiac.faces === 'right' ? 1 : -1;
  base.style.setProperty('--flip', dir === native ? 1 : -1);
}
const homeDir = team => ((teamInfo.get(team)?.x ?? 0) < W / 2 ? 1 : -1); // quay mặt về giữa bản đồ

let layoutKey = '';
function layoutTeams(list) {
  const teams = [...new Map((list || []).filter(t => t && t.name).map(t => [key(t.name), t])).values()]
    .sort((a, b) => (Number(a.id) || 1e9) - (Number(b.id) || 1e9) || a.name.localeCompare(b.name));
  const signature = teams.map(t => key(t.name) + ':' + (t.zodiac || '')).join('|');
  if (!teams.length || signature === layoutKey) return;
  layoutKey = signature;

  const holder = $('#map-bases'), territories = $('#territories'), outposts = $('#outposts');
  holder.replaceChildren(); territories.replaceChildren(); outposts.replaceChildren();
  bases.clear(); teamInfo.clear();
  const dense = teams.length > 8, radius = dense ? 76 : 104;
  stage.classList.toggle('dense', dense);

  teams.forEach((t, i) => {
    const team = key(t.name), [x, y] = slotOf(i);
    const zodiac = ZODIAC.get(t.zodiac) || ZODIAC_LIST[i % ZODIAC_LIST.length];
    const color = COLORS[i % COLORS.length], land = LANDS[i % LANDS.length] || '';
    const territory = svg('path', { d: blobPath(x, y + 10, radius, i + 1), class: 'territory', fill: color, stroke: color }, territories);

    const base = $('#base-template').content.firstElementChild.cloneNode(true);
    base.dataset.team = team;
    base.classList.add('z-' + zodiac.idle);
    base.style.left = (x / W * 100) + '%';
    base.style.top = (y / H * 100) + '%';
    base.style.setProperty('--team', color);
    // Lệch nhịp ngẫu nhiên để các con không cử động đồng loạt.
    base.style.setProperty('--idle-delay', (-rnd(0, 6)).toFixed(2) + 's');
    base.style.setProperty('--idle-speed', rnd(.88, 1.14).toFixed(2));
    base.setAttribute('aria-label', `${t.name} · ${zodiac.chi} (${zodiac.name}) · vùng đất ${land}`);
    base.querySelector('h2').textContent = t.name;
    const img = base.querySelector('.z-img');
    img.src = `/images/zodiac/${zodiac.id}.png`;
    img.alt = `${zodiac.chi} – ${zodiac.name}`;
    holder.append(base);
    bases.set(team, base);
    teamInfo.set(team, { id: t.id, name: t.name, color, zodiac, land, territory, x, y });
    setFacing(team, homeDir(team));
  });

  // Vùng đất còn trống: chờ đội mới khi mở rộng giải.
  for (let i = teams.length; i < SLOTS.length; i++) {
    const [x, y] = slotOf(i);
    const g = svg('g', { class: 'outpost', transform: `translate(${x} ${y})` }, outposts);
    svg('circle', { r: 26 }, g);
    svg('path', { d: 'M-2 10V-16l16 6-16 6' }, g);
  }

  const roster = $('#world-roster');
  roster.replaceChildren();
  for (const info of teamInfo.values()) {
    const li = document.createElement('li');
    li.style.setProperty('--team', info.color);
    const img = document.createElement('img');
    img.src = `/images/zodiac/${info.zodiac.id}.png`; img.alt = ''; img.decoding = 'async';
    const text = document.createElement('div');
    const b = document.createElement('b'); b.textContent = info.name;
    const s = document.createElement('span'); s.textContent = `${info.zodiac.chi} · ${info.zodiac.name} · ${info.land}`;
    text.append(b, s);
    li.append(img, text);
    roster.append(li);
  }

  // Form nộp flag chỉ có khi đã đăng nhập; đội đang đăng nhập được chọn sẵn làm "Đội của bạn".
  const myTeam = $('#world-submit')?.dataset.myTeam || '';
  for (const id of ['#fx-attacker', '#fx-victim']) {
    const select = $(id);
    if (!select) continue;
    const keep = select.value || (id === '#fx-attacker' ? myTeam : '');
    select.replaceChildren(new Option('—', ''));
    for (const [team, info] of teamInfo) select.append(new Option(`${info.name} · ${info.zodiac.name}`, team));
    select.value = teamInfo.has(keep) ? keep : '';
  }
  if (lastServices) renderServices(lastServices);
  paintScores(lastScores);
}

/* ---------- Tiện ích hiệu ứng ---------- */
function center(team) {
  const emblem = bases.get(team)?.querySelector('.base-emblem');
  if (!emblem) return null;
  const s = stage.getBoundingClientRect(), e = emblem.getBoundingClientRect(), k = W / s.width;
  return { x: (e.left + e.width / 2 - s.left) * k, y: (e.top + e.height * .55 - s.top) * k, r: e.width / 2 * k };
}

function flash(team, cls, ms) {
  const b = bases.get(team);
  if (!b) return;
  b.classList.remove(cls);
  void b.offsetWidth; // khởi động lại animation khi lặp liên tiếp
  b.classList.add(cls);
  clearTimeout(b['t_' + cls]);
  b['t_' + cls] = setTimeout(() => b.classList.remove(cls), ms);
}

function floatText(team, value, label, tone) {
  const box = bases.get(team)?.querySelector('.base-floats');
  if (!box) return;
  const el = document.createElement('span');
  el.className = 'score-float ' + tone;
  el.textContent = value;
  if (label) { const s = document.createElement('small'); s.textContent = label; el.append(s); }
  box.append(el);
  setTimeout(() => el.remove(), 3400);
}

function confetti(team) {
  const box = bases.get(team)?.querySelector('.z-confetti');
  if (!box || !animate()) return;
  box.replaceChildren();
  const color = teamInfo.get(team)?.color || '#ffc94d';
  const palette = [color, '#ffd166', '#ffffff', '#ff6b6b', '#7dffb2'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('i');
    const a = rnd(-Math.PI * .95, -Math.PI * .05), d = rnd(4, 10);
    p.style.setProperty('--dx', (Math.cos(a) * d).toFixed(2) + 'cqi');
    p.style.setProperty('--dy', (Math.sin(a) * d).toFixed(2) + 'cqi');
    p.style.setProperty('--rot', rnd(-540, 540).toFixed(0) + 'deg');
    p.style.setProperty('--c', palette[i % palette.length]);
    p.style.animationDelay = rnd(0, .25).toFixed(2) + 's';
    box.append(p);
  }
  setTimeout(() => box.replaceChildren(), 2200);
}

function burst(x, y, kind, spread) {
  const flashCircle = svg('circle', { cx: x, cy: y, r: 22, class: 'fx-flash ' + kind });
  const ring = svg('circle', { cx: x, cy: y, r: 20, class: 'fx-ring ' + kind });
  const sparks = [];
  for (let i = 0; i < 14; i++) {
    const a = spread.from + (spread.to - spread.from) * (i / 13) + rnd(-.18, .18), len = rnd(26, 58);
    sparks.push(svg('line', { x1: x, y1: y, x2: x + Math.cos(a) * len, y2: y + Math.sin(a) * len, class: 'fx-spark ' + kind, 'stroke-dasharray': '60 60' }));
  }
  setTimeout(() => { flashCircle.remove(); ring.remove(); sparks.forEach(s => s.remove()); }, 950);
}

/* ---------- Bắn đạn: kind = 'hit' (trúng) | 'blocked' (bị khiên chặn) ---------- */
function fire(from, to, kind) {
  const a = center(from), b = center(to);
  if (!a || !b || from === to) return Promise.resolve();
  const dir = b.x >= a.x ? 1 : -1;
  if (!animate()) { // không chạy chuyển động: chỉ thể hiện kết quả
    if (kind === 'hit') { flash(to, 'hit', 1500); flash(from, 'celebrate', 1200); }
    else flash(to, 'blocked', 2000);
    return Promise.resolve();
  }
  const color = teamInfo.get(from)?.color || '#ffb347';
  const attacker = bases.get(from);
  // Quay mặt về mục tiêu, lấy đà rồi lao tới.
  setFacing(from, dir);
  attacker.style.setProperty('--dir', dir);
  flash(from, 'windup', 320);
  if (kind === 'blocked') flash(to, 'blocked', 2600);

  return new Promise(resolve => setTimeout(() => {
    flash(from, 'lunge', 520);
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
    const bend = (Math.random() < .5 ? -1 : 1) * dist * .3;
    const cx = (a.x + b.x) / 2 - dy / dist * bend, cy = (a.y + b.y) / 2 + dx / dist * bend - dist * .12;
    const sx = a.x + dx / dist * a.r * .7, sy = a.y + dy / dist * a.r * .7;
    const d = `M${sx} ${sy}Q${cx} ${cy} ${b.x} ${b.y}`;
    const glow = svg('path', { d, class: 'fx-glow-trail ' + kind });
    const core = svg('path', { d, class: 'fx-trail ' + kind });
    if (kind === 'hit') { core.style.stroke = color; glow.style.stroke = color; }
    const total = core.getTotalLength();
    const stop = Math.max(0, total - (kind === 'hit' ? b.r * .55 : b.r * 2.05)); // trúng: tới thân; chặn: tới mép khiên
    for (const p of [glow, core]) { p.setAttribute('stroke-dasharray', `${total} ${total}`); p.setAttribute('stroke-dashoffset', total); }
    const muzzle = svg('circle', { cx: sx, cy: sy, r: 16, class: 'fx-muzzle' });
    const shell = svg('g', { class: 'fx-shell ' + kind });
    svg('circle', { r: 17, class: 'fx-shell-halo' }, shell);
    svg('circle', { r: 9, class: 'fx-shell-core' }, shell);
    if (kind === 'hit') shell.style.setProperty('--shell', color);
    const duration = 850 + dist * .55, t0 = performance.now();
    let frame = 0;
    setTimeout(resolve, 450); // viên sau được phóng trước khi viên này tới đích
    const step = now => {
      const p = Math.min(1, (now - t0) / duration), eased = p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      const at = core.getPointAtLength(stop * eased);
      shell.setAttribute('transform', `translate(${at.x} ${at.y})`);
      for (const q of [glow, core]) q.setAttribute('stroke-dashoffset', total - stop * eased);
      if (frame++ % 2 === 0) { // đuôi lửa
        const ember = svg('circle', { cx: at.x, cy: at.y, r: 7, class: 'fx-ember ' + kind });
        if (kind === 'hit') ember.style.fill = color;
        setTimeout(() => ember.remove(), 520);
      }
      if (p < 1) return requestAnimationFrame(step);
      shell.remove(); muzzle.remove();
      if (kind === 'hit') {
        burst(at.x, at.y, 'hit', { from: 0, to: Math.PI * 2 });
        const victim = bases.get(to);
        victim?.style.setProperty('--kb', dir);
        flash(to, 'hit', 1300);
        flash(to, 'knockback', 900);
        // Đội tấn công trúng: nhảy lên ăn mừng.
        flash(from, 'celebrate', 1900);
        confetti(from);
      } else {
        const back = Math.atan2(sy - at.y, sx - at.x);
        burst(at.x, at.y, 'blocked', { from: back - 1.2, to: back + 1.2 }); // tia lửa dội ngược
        flash(to, 'guard', 1100);
        floatText(to, 'BLOCKED', '', 'info');
      }
      for (const q of [glow, core]) { q.style.transition = 'opacity .9s'; q.style.opacity = '0'; }
      setTimeout(() => { glow.remove(); core.remove(); }, 1000);
      setTimeout(() => setFacing(from, homeDir(from)), 2600);
    };
    requestAnimationFrame(step);
  }, 300));
}

let queue = Promise.resolve();
const enqueue = fn => { queue = queue.then(fn).catch(() => {}); };

/* ---------- Điểm ---------- */
function paintScores(scores) {
  const others = Math.max(0, (scores.length || bases.size) - 1);
  $('[data-rule-attack]').textContent = fmt(RULES.flag);
  $('[data-rule-victim]').textContent = fmt(-RULES.flag);
  $('[data-rule-sla]').textContent = fmt(RULES.sla);
  $('[data-rule-down]').textContent = `${RULES.down} × ${others} = ${fmt(-RULES.down * others)}`;

  const sorted = [...scores].sort((x, y) => y.total - x.total);
  const ranks = new Map();
  sorted.forEach((t, i) => ranks.set(key(t.name), i && t.total === sorted[i - 1].total ? ranks.get(key(sorted[i - 1].name)) : i + 1));
  const allEqual = sorted.length > 1 && sorted.every(t => t.total === sorted[0].total);
  for (const [team, base] of bases) {
    const s = scores.find(t => key(t.name) === team);
    base.querySelector('[data-base-score]').textContent = s ? s.total : '—';
    base.querySelector('[data-base-rank]').textContent = s ? '#' + ranks.get(team) : '#—';
    base.classList.toggle('leader', !!s && ranks.get(team) === 1 && !allEqual);
  }
  // Tô màu đội trong bảng xếp hạng (bảng do arena.js dựng).
  for (const row of document.querySelectorAll('[data-ranking] tr')) {
    const cell = row.cells[1], info = cell && teamInfo.get(key(cell.textContent));
    if (!info) continue;
    cell.dataset.teamDot = '';
    cell.style.setProperty('--dot', info.color);
  }
}

// Biến động điểm thật giữa hai lần cập nhật -> số nổi + khiên SLA.
function scoreDeltas(scores) {
  const next = new Map(scores.map(t => [key(t.name), t]));
  if (previous && !document.hidden) {
    let delay = 0;
    for (const [team, now] of next) {
      const old = previous.get(team);
      if (!old) continue;
      const dAtk = now.attack - old.attack, dSla = now.sla - old.sla, dDef = now.defense - old.defense, dTotal = now.total - old.total;
      const parts = [];
      if (dAtk) parts.push([fmt(dAtk), 'ATK', dAtk > 0 ? 'pos' : 'neg']);
      if (dSla) parts.push([fmt(dSla), dSla > 0 ? 'SLA' : 'DOWN', dSla > 0 ? 'pos' : 'neg']);
      if (dDef) parts.push([fmt(dDef), 'DEF', dDef > 0 ? 'pos' : 'neg']);
      if (!parts.length && dTotal) parts.push([fmt(dTotal), '', dTotal > 0 ? 'pos' : 'neg']);
      if (dSla > 0 && !bases.get(team)?.classList.contains('down')) setTimeout(() => flash(team, 'shielded', 4500), delay);
      for (const p of parts) { const at = delay; setTimeout(() => floatText(team, ...p), at); delay += 450; }
    }
  }
  previous = next;
}

/* ---------- Nhật ký & trạng thái service ---------- */
function entry(parent, tag, tagClass, text, fresh) {
  const p = document.createElement('p');
  p.className = 'world-entry' + (fresh ? ' fresh' : '');
  if (tag) { const t = document.createElement('span'); t.className = 'tag ' + tagClass; t.textContent = tag; p.append(t); }
  p.append(document.createTextNode(text));
  parent.append(p);
}
const defendId = x => [key(x.attacker), key(x.victim), x.time, x.reason].join(':');
const captureId = c => 'c' + c.attacker_id + ':' + c.capture_flag_id;

let feedKey = '';
function renderFeed(captures, defends, freshIds) {
  const events = [
    ...captures.map(c => ({ id: captureId(c), time: c.submit_time, kind: 'hit', text: ` Tick ${c.tick} · ${c.attacker} → ${c.victim} · ${c.service} · ${timeOf(c.submit_time)}` })),
    ...defends.map(x => ({ id: 'd' + defendId(x), time: x.time, kind: 'block', text: ` Tick ${x.tick ?? '—'} · ${x.attacker} → ${x.victim} · ${BLOCK_REASON[x.reason] || x.reason || 'bị chặn'} · ${timeOf(x.time)}` })),
    ...localEvents,
  ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 60);
  const signature = events.map(e => e.id).join('|');
  if (signature === feedKey) return;
  feedKey = signature;
  const feed = $('#world-feed');
  feed.replaceChildren();
  if (!events.length) return entry(feed, '', '', 'Chưa có đòn tấn công nào được ghi nhận. Chiến trường đang yên lặng.');
  for (const ev of events) entry(feed, ev.kind === 'hit' ? 'HIT' : 'BLOCKED', ev.kind === 'hit' ? 'tag-hit' : 'tag-block', ev.text, freshIds.has(ev.id));
}

let servicesKey = '';
function renderServices(services) {
  lastServices = services;
  const signature = JSON.stringify(services) + layoutKey;
  if (signature === servicesKey) return;
  servicesKey = signature;
  const details = $('#world-service-details');
  details.replaceChildren();
  services.forEach(s => entry(details, STATUS[s.status] || 'UNKNOWN', s.status === 101 ? 'tag-sla' : s.status === 104 ? 'tag-down' : 'tag-info', ` ${s.team} · ${s.service}`));
  $('#world-services').textContent = services.length ? '· ' + [...new Set(services.map(s => s.service))].join(' / ') : '';
  let up = 0;
  for (const [team, base] of bases) {
    const mine = services.filter(s => key(s.team) === team);
    const down = mine.find(s => s.status === 104), warn = mine.find(s => s.status === 102 || s.status === 103);
    const unknown = !mine.length || mine.some(s => s.status === 110 || s.status === -1);
    base.classList.toggle('down', !!down);
    base.classList.toggle('svc-warn', !down && !!warn);
    base.classList.toggle('svc-unknown', !down && !warn && unknown);
    teamInfo.get(team)?.territory.classList.toggle('down', !!down);
    base.querySelector('[data-base-status]').textContent = down ? 'SERVICE DOWN' : warn ? (STATUS[warn.status] || 'UNKNOWN') : !mine.length ? 'NOT CHECKED' : unknown ? 'CHECKING' : 'SERVICE UP';
    base.title = mine.map(s => s.service + ': ' + (STATUS[s.status] || 'UNKNOWN')).join(' · ');
    if (mine.length && mine.every(s => s.status === 101)) up++;
  }
  $('[data-stat-up]').textContent = `${up}/${bases.size}`;
}

let checksKey = '';
function renderChecks(checks) {
  const signature = JSON.stringify(checks);
  if (signature === checksKey) return;
  checksKey = signature;
  const box = $('#world-checks');
  box.replaceChildren();
  if (!checks.length) return entry(box, '', '', 'Chưa có kết quả checker cuối tick.');
  for (const c of checks) {
    const up = c.status === 101, down = c.status === 104;
    entry(box, up ? 'SLA ' + fmt(c.points) : down ? 'DOWN' : STATUS[c.status] || 'UNKNOWN', up ? 'tag-sla' : down ? 'tag-down' : 'tag-info', ` Tick ${c.tick} · ${c.team}`);
  }
}

/* ---------- Nhận trạng thái ---------- */
root.addEventListener('arena-state', e => {
  const d = e.detail || {}, game = d.game || {};
  const running = ['running', 'draining'].includes(game.phase);
  $('[data-banner-label]').textContent = running ? `Tick ${game.tick ?? '—'} ends in` : 'Trạng thái';
  $('[data-stat-round]').textContent = game.round ?? '—';
  root.classList.toggle('battle', game.phase === 'running');
  if (game.phase === 'running') $('[data-phase]').textContent = 'Battle in progress';
  $('#world-status').textContent = '';

  const scores = Array.isArray(d.scores) ? d.scores : [];
  layoutTeams(d.teams && d.teams.length ? d.teams : scores.map(t => ({ id: t.team_id, name: t.name })));
  lastScores = scores;
  paintScores(scores);
  scoreDeltas(scores);
  renderServices(Array.isArray(d.services) ? d.services : []);
  renderChecks(Array.isArray(d.checks) ? d.checks : []);

  const captures = Array.isArray(d.captures) ? d.captures : [];
  const defends = Array.isArray(d.defends) ? d.defends : [];
  $('[data-stat-captures]').textContent = captures.length >= 50 ? '50+' : captures.length;
  const fresh = new Set();
  if (seenCaptures) {
    // Theo thứ tự thời gian, tối đa 12 viên mỗi lần để bản đồ không quá tải. Tab ẩn: chỉ ghi nhận, không bắn bù.
    captures.filter(c => !seenCaptures.has(captureId(c))).reverse().slice(-12).forEach(c => {
      fresh.add(captureId(c));
      if (!document.hidden) enqueue(() => fire(key(c.attacker), key(c.victim), 'hit'));
    });
  }
  if (seenDefends) {
    defends.filter(x => !seenDefends.has('d' + defendId(x))).reverse().slice(-12).forEach(x => {
      fresh.add('d' + defendId(x));
      if (!document.hidden) enqueue(() => fire(key(x.attacker), key(x.victim), 'blocked'));
    });
  }
  seenCaptures = new Set(captures.map(captureId));
  seenDefends = new Set(defends.map(x => 'd' + defendId(x)));
  renderFeed(captures, defends, fresh);
});

root.addEventListener('arena-connection', e => {
  if (e.detail.connected) return;
  $('#world-status').textContent = 'LIVE DATA DISCONNECTED · Giữ kết quả gần nhất, đang tự kết nối lại';
});

// Hiển thị 4 căn cứ ngay khi tải trang, trước khi có dữ liệu.
layoutTeams(json(stage.dataset.defaultTeams, []));

/* ---------- Nộp flag (AJAX) ---------- */
function classify(message) {
  const m = String(message || '').replace(/^\[[^\]]*\]\s*/, '');
  if (/^Flag accepted/i.test(m)) return 'accepted';
  if (/already stolen/i.test(m)) return 'duplicate';
  if (/your own/i.test(m)) return 'own';
  if (/invalid or too old/i.test(m)) return 'invalid';
  if (/too old|expired/i.test(m)) return 'expired';
  if (/invalid/i.test(m)) return 'invalid';
  return 'rejected';
}
const RESULT_LABEL = { accepted: 'ACCEPTED', duplicate: 'DUPLICATE', own: 'OWN FLAG', invalid: 'INVALID', expired: 'EXPIRED', rejected: 'REJECTED' };

// Token đội không đi qua trình duyệt: máy chủ lấy token của đội đang đăng nhập.
const form = $('#world-submit');
form?.addEventListener('reset', () => { $('#world-submit-result').textContent = ''; });
form?.addEventListener('submit', async e => {
  e.preventDefault();
  const button = form.querySelector('button[type=submit]'), out = $('#world-submit-result');
  const attacker = $('#fx-attacker').value, victim = $('#fx-victim').value;
  button.disabled = true;
  out.textContent = 'Đang gửi…';
  try {
    const r = await fetch('/scoreboard/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': form.elements._csrf.value },
      body: JSON.stringify({ flags: form.elements.flags.value.trim().split(/\s+/) }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await r.json();
    if (!Array.isArray(result)) { out.textContent = result.error || JSON.stringify(result); return; }
    const kinds = result.map(x => classify(x.msg));
    out.textContent = result.map((x, i) => RESULT_LABEL[kinds[i]] + ' · ' + (x.msg || '')).join('\n');
    // Flag hết hạn / sai định dạng / đã nộp: đội mục tiêu phòng thủ thành công.
    // Flag hợp lệ sẽ đến qua captures của ForcAD nên không bắn ở đây để tránh trùng.
    if (attacker && victim && attacker !== victim && teamInfo.has(attacker) && teamInfo.has(victim)) {
      kinds.filter(k => BLOCK_REASON[k]).slice(0, 5).forEach(k => {
        localEvents.unshift({ id: 'l' + Date.now() + Math.random(), time: new Date().toISOString(), kind: 'block',
          text: ` ${teamInfo.get(attacker).name} → ${teamInfo.get(victim).name} · ${BLOCK_REASON[k]} · ${timeOf(Date.now())} (mô phỏng tại chỗ)` });
        enqueue(() => fire(attacker, victim, 'blocked'));
      });
      localEvents.splice(20);
    }
  } catch (_) {
    out.textContent = 'Không kết nối được bộ nhận flag.';
  } finally {
    button.disabled = false;
  }
});
})();
