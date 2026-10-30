// World Arena: bản đồ chiến trường, đạn tấn công, khiên phòng thủ và nộp flag.
// Mọi con số điểm lấy từ ForcAD (qua arena.js); file này chỉ dựng hiệu ứng theo dữ liệu đó.
(() => {
'use strict';
const root = document.querySelector('[data-arena]');
const stage = document.querySelector('.map-stage');
if (!root || !stage) return;

const NS = 'http://www.w3.org/2000/svg';
const W = 1600, H = 1000; // viewBox của bản đồ
const fx = document.querySelector('#fx-layer');
const bases = new Map();    // team -> phần tử căn cứ
const teamInfo = new Map(); // team -> { id, name, color, beast, land, territory }
// Hiệu ứng động: mặc định theo prefers-reduced-motion; lựa chọn của người xem được ghi nhớ.
const motionButton = document.querySelector('[data-motion]');
let motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
try { const saved = localStorage.getItem('arena-motion'); if (saved) motion = saved === 'on'; } catch (_) {}
const applyMotion = () => {
  root.classList.toggle('calm', !motion);
  motionButton.setAttribute('aria-pressed', String(motion));
  motionButton.textContent = 'Hiệu ứng động: ' + (motion ? 'BẬT' : 'TẮT');
};
motionButton?.addEventListener('click', () => {
  motion = !motion;
  try { localStorage.setItem('arena-motion', motion ? 'on' : 'off'); } catch (_) {}
  applyMotion();
});
if (motionButton) applyMotion();
// Luật điểm của cuộc thi, chỉ dùng cho phần chú giải.
const RULES = { flag: 100, sla: 100, down: 100 };
const STATUS = { 101: 'UP', 102: 'CORRUPT', 103: 'MUMBLE', 104: 'DOWN', 110: 'CHECKING', '-1': 'NOT CHECKED' };
const BLOCK_REASON = { expired: 'flag hết hạn', invalid: 'flag sai định dạng/hết hạn', duplicate: 'flag đã nộp rồi' };

const $ = s => document.querySelector(s);
const key = name => String(name || '').toLowerCase();
const fmt = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
const timeOf = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleTimeString('vi-VN'); };

let previous = null;        // điểm lần trước: Map team -> {attack, sla, defense, total}
let seenCaptures = null;    // null ở lần tải đầu: không bắn lại lịch sử
let seenDefends = null;
let lastScores = null, lastServices = null;
const localEvents = [];     // đòn bị chặn mô phỏng tại chỗ từ form nộp flag

/* ---------- Đội, linh thú và vùng đất ---------- */
// Vị trí vùng đất trên hai lục địa (toạ độ viewBox). Bốn vị trí đầu trải đều bản đồ;
// các vị trí sau dành cho khi mở rộng thêm đội.
const SLOTS = [[260, 190], [1180, 320], [300, 720], [1250, 620], [800, 380], [1430, 420], [230, 450], [1000, 660],
  [420, 300], [1400, 690], [420, 560], [980, 320], [800, 620], [260, 880], [1120, 760], [1500, 560]];
const LANDS = ['Frostfang', 'Emberwood', 'Sunspire', 'Mosswater', 'Ironcliff', 'Coral Reach', 'Ashen Vale', 'Stormwatch',
  'Glimmer Bay', 'Thornfield', 'Obsidian Peak', 'Driftmoor', 'Saltmarsh', 'Skyforge', 'Willowmere', 'Duskhaven'];
const BEASTS = [
  { id: 'eagle', name: 'Đại bàng cơ khí', eye: '#ffd166' },
  { id: 'elephant', name: 'Voi chiến cơ khí', eye: '#ff3b3b' },
  { id: 'bear', name: 'Gấu trắng cơ khí', eye: '#5ff3ff' },
  { id: 'rex', name: 'Khủng long cơ khí', eye: '#ff2d2d' },
];
const COLORS = ['#38bdf8', '#fb923c', '#c084fc', '#facc15', '#2dd4bf', '#f472b6', '#a3e635', '#818cf8', '#fda4af', '#5eead4', '#fde68a', '#93c5fd'];

// Đường cong khép kín mềm quanh một điểm (Catmull-Rom → Bézier), dùng cho vùng lãnh thổ.
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

let layoutKey = '';
function layoutTeams(list) {
  const teams = [...new Map(list.filter(t => t && t.name).map(t => [key(t.name), t])).values()]
    .sort((a, b) => (Number(a.id) || 1e9) - (Number(b.id) || 1e9) || a.name.localeCompare(b.name));
  const signature = teams.map(t => key(t.name)).join('|');
  if (!teams.length || signature === layoutKey) return;
  layoutKey = signature;

  const holder = $('#map-bases'), territories = $('#territories'), outposts = $('#outposts');
  holder.replaceChildren(); territories.replaceChildren(); outposts.replaceChildren();
  bases.clear(); teamInfo.clear();
  const dense = teams.length > 8, radius = dense ? 76 : 104;
  stage.classList.toggle('dense', dense);

  teams.forEach((t, i) => {
    const team = key(t.name), [x, y] = slotOf(i);
    const beast = BEASTS[i % BEASTS.length], color = COLORS[i % COLORS.length], land = LANDS[i % LANDS.length];
    const territory = svg('path', { d: blobPath(x, y + 10, radius, i + 1), class: 'territory', fill: color, stroke: color }, territories);

    const base = $('#base-template').content.firstElementChild.cloneNode(true);
    base.dataset.team = team;
    base.style.left = (x / W * 100) + '%';
    base.style.top = (y / H * 100) + '%';
    base.style.setProperty('--team', color);
    base.style.setProperty('--eye', beast.eye);
    base.setAttribute('aria-label', `${t.name} · ${beast.name} · vùng đất ${land}`);
    base.querySelector('h2').textContent = t.name;
    base.querySelector('.base-beast').append($('#beast-' + beast.id).content.firstElementChild.cloneNode(true));
    holder.append(base);
    bases.set(team, base);
    teamInfo.set(team, { id: t.id, name: t.name, color, beast, land, territory });
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
    const icon = $('#beast-' + info.beast.id).content.firstElementChild.cloneNode(true);
    icon.classList.add('roster-beast');
    li.style.setProperty('--eye', info.beast.eye);
    const text = document.createElement('div');
    const b = document.createElement('b'); b.textContent = info.name;
    const s = document.createElement('span'); s.textContent = `${info.beast.name} · ${info.land}`;
    text.append(b, s);
    li.append(icon, text);
    roster.append(li);
  }

  for (const id of ['#fx-attacker', '#fx-victim']) {
    const select = $(id), keep = select.value;
    select.replaceChildren(new Option('—', ''));
    for (const [team, info] of teamInfo) select.append(new Option(info.name, team));
    select.value = teamInfo.has(keep) ? keep : '';
  }

  if (lastServices) renderServices(lastServices);
  if (lastScores) paintScores(lastScores);
}

// Lấp lánh mặt nước quanh vùng nắng chiếu.
(function sparkles() {
  const group = $('#sparkles');
  if (!group) return;
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 70; i++) {
    const near = i < 46, a = rnd(0, Math.PI * 2), d = Math.sqrt(Math.random());
    const ex = near ? 330 * d * Math.cos(a) : rnd(-700, 250), ey = near ? 150 * d * Math.sin(a) : rnd(0, 700);
    const rot = -24 * Math.PI / 180;
    const x = near ? 1330 + ex * Math.cos(rot) - ey * Math.sin(rot) : 1100 + ex, y = near ? 150 + ex * Math.sin(rot) + ey * Math.cos(rot) : 200 + ey;
    const s = near ? rnd(4, 9) : rnd(3, 6);
    const star = svg('path', { d: `M${x} ${y - s}L${x + s * .22} ${y - s * .22}L${x + s} ${y}L${x + s * .22} ${y + s * .22}L${x} ${y + s}L${x - s * .22} ${y + s * .22}L${x - s} ${y}L${x - s * .22} ${y - s * .22}Z`, class: 'spark' }, group);
    star.style.animationDelay = rnd(0, 5).toFixed(2) + 's';
    star.style.animationDuration = rnd(2.2, 4.8).toFixed(2) + 's';
  }
})();

/* ---------- Toạ độ & tiện ích hiệu ứng ---------- */
function center(team) {
  const emblem = bases.get(team)?.querySelector('.base-emblem');
  if (!emblem) return null;
  const s = stage.getBoundingClientRect(), e = emblem.getBoundingClientRect();
  const k = W / s.width;
  return { x: (e.left + e.width / 2 - s.left) * k, y: (e.top + e.height / 2 - s.top) * k, r: e.width / 2 * k };
}

function svg(tag, attrs, parent = fx) {
  const el = document.createElementNS(NS, tag);
  for (const [a, v] of Object.entries(attrs)) el.setAttribute(a, v);
  parent.append(el);
  return el;
}

function flash(team, cls, ms) {
  const b = bases.get(team);
  if (!b) return;
  b.classList.remove(cls);
  void b.offsetWidth; // khởi động lại animation khi trúng liên tiếp
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
  setTimeout(() => el.remove(), 2800);
}

function burst(x, y, kind, spread) {
  svg('circle', { cx: x, cy: y, r: 14, class: 'fx-burst ' + kind });
  for (let i = 0; i < 8; i++) {
    const a = spread.from + (spread.to - spread.from) * (i / 7) + (Math.random() - .5) * .3;
    const len = 18 + Math.random() * 22;
    const line = svg('line', { x1: x, y1: y, x2: x + Math.cos(a) * len, y2: y + Math.sin(a) * len, class: 'fx-spark ' + kind, 'stroke-dasharray': '30 30' });
    setTimeout(() => line.remove(), 800);
  }
  setTimeout(() => fx.querySelector('.fx-burst')?.remove(), 850);
}

/* ---------- Bắn đạn: kind = 'hit' (trúng) | 'blocked' (bị khiên chặn) ---------- */
function fire(from, to, kind) {
  const a = center(from), b = center(to);
  if (!a || !b || from === to) return Promise.resolve();
  if (kind === 'blocked') flash(to, 'blocked', 2400);
  if (!motion) {
    flash(to, kind === 'hit' ? 'hit' : 'blocked', 1500);
    return Promise.resolve();
  }
  flash(from, 'attacking', 1000);
  const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
  const bend = (Math.random() < .5 ? -1 : 1) * dist * .28;
  const cx = (a.x + b.x) / 2 - dy / dist * bend, cy = (a.y + b.y) / 2 + dx / dist * bend;
  const sx = a.x + dx / dist * a.r, sy = a.y + dy / dist * a.r;
  const path = svg('path', { d: `M${sx} ${sy}Q${cx} ${cy} ${b.x} ${b.y}`, class: 'fx-trail ' + kind });
  const total = path.getTotalLength();
  // Đạn trúng dừng ở mép huy hiệu; đạn bị chặn dừng ở mép khiên.
  const stop = Math.max(0, total - (kind === 'hit' ? b.r * .7 : b.r * 1.85));
  path.setAttribute('stroke-dasharray', `${total} ${total}`);
  path.setAttribute('stroke-dashoffset', total);
  svg('circle', { cx: sx, cy: sy, r: 10, class: 'fx-muzzle' });
  const shell = svg('circle', { cx: sx, cy: sy, r: 7, class: 'fx-shell ' + kind });
  const duration = 900 + dist * .6;
  const t0 = performance.now();
  return new Promise(resolve => {
    setTimeout(resolve, 420); // viên sau được phóng trước khi viên này tới đích
    const step = now => {
      const p = Math.min(1, (now - t0) / duration), eased = p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      const at = path.getPointAtLength(stop * eased);
      shell.setAttribute('cx', at.x); shell.setAttribute('cy', at.y);
      path.setAttribute('stroke-dashoffset', total - stop * eased);
      if (p < 1) return requestAnimationFrame(step);
      shell.remove();
      fx.querySelector('.fx-muzzle')?.remove();
      const back = Math.atan2(sy - at.y, sx - at.x);
      if (kind === 'hit') {
        burst(at.x, at.y, 'hit', { from: 0, to: Math.PI * 2 });
        flash(to, 'hit', 1400);
      } else {
        burst(at.x, at.y, 'blocked', { from: back - 1.1, to: back + 1.1 }); // tia lửa dội ngược
        floatText(to, 'BLOCKED', '', 'info');
      }
      path.style.transition = 'opacity .8s';
      path.style.opacity = '0';
      setTimeout(() => path.remove(), 900);
    };
    requestAnimationFrame(step);
  });
}

let queue = Promise.resolve();
const enqueue = fn => { queue = queue.then(fn).catch(() => {}); };

/* ---------- Điểm (sự kiện từ arena.js) ---------- */
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

root.addEventListener('arena-scores-updated', e => {
  const d = e.detail || {};
  const running = ['running', 'draining'].includes(d.phase);
  $('[data-banner-label]').textContent = running ? `Tick ${d.tick ?? '—'} ends in` : 'Trạng thái';
  $('[data-stat-round]').textContent = d.round ?? '—';
  if (d.tick != null) $('[data-tick]').textContent = d.ticks_per_round ? `${d.tick}/${d.ticks_per_round}` : d.tick;
  root.classList.toggle('battle', d.phase === 'running');
  if (d.phase === 'running') $('[data-phase]').textContent = 'Battle in progress';

  const scores = Array.isArray(d.scores) ? d.scores : [];
  // Đội mới xuất hiện trong bảng điểm thì được cấp vùng đất ngay.
  if (scores.some(t => !teamInfo.has(key(t.name)))) {
    layoutTeams([...[...teamInfo.values()].map(t => ({ id: t.id, name: t.name })), ...scores.map(t => ({ id: t.team_id, name: t.name }))]);
  }
  lastScores = scores;
  paintScores(scores);

  // Biến động điểm thật giữa hai lần cập nhật -> số nổi + khiên SLA.
  const next = new Map(scores.map(t => [key(t.name), t]));
  if (previous) {
    let delay = 0;
    for (const [team, now] of next) {
      const old = previous.get(team);
      if (!old) continue;
      const dAtk = now.attack - old.attack, dSla = now.sla - old.sla, dDef = now.defense - old.defense;
      const parts = [];
      if (dAtk) parts.push([fmt(dAtk), 'ATK', dAtk > 0 ? 'pos' : 'neg']);
      if (dSla) parts.push([fmt(dSla), dSla > 0 ? 'SLA' : 'DOWN', dSla > 0 ? 'pos' : 'neg']);
      if (dDef) parts.push([fmt(dDef), 'DEF', dDef > 0 ? 'pos' : 'neg']);
      const dTotal = now.total - old.total;
      if (!parts.length && dTotal) parts.push([fmt(dTotal), '', dTotal > 0 ? 'pos' : 'neg']);
      if (dSla > 0 && !bases.get(team)?.classList.contains('down')) setTimeout(() => flash(team, 'shielded', 4200), delay);
      for (const p of parts) { const at = delay; setTimeout(() => floatText(team, ...p), at); delay += 380; }
    }
  }
  previous = next;
});

/* ---------- Dữ liệu chiến trường (captures, services, checks) ---------- */
function entry(parent, tag, tagClass, text, fresh) {
  const p = document.createElement('p');
  p.className = 'world-entry' + (fresh ? ' fresh' : '');
  if (tag) { const t = document.createElement('span'); t.className = 'tag ' + tagClass; t.textContent = tag; p.append(t); }
  p.append(document.createTextNode(text));
  parent.append(p);
}

function renderFeed(captures, defends, freshIds) {
  const feed = $('#world-feed');
  const events = [
    ...captures.map(c => ({ id: 'c' + c.attacker_id + ':' + c.capture_flag_id, time: c.submit_time, kind: 'hit',
      text: ` Tick ${c.tick} · ${c.attacker} → ${c.victim} · ${c.service} · ${timeOf(c.submit_time)}` })),
    ...defends.map(x => ({ id: 'd' + defendId(x), time: x.time, kind: 'block',
      text: ` Tick ${x.tick ?? '—'} · ${x.attacker} → ${x.victim} · ${BLOCK_REASON[x.reason] || x.reason || 'bị chặn'} · ${timeOf(x.time)}` })),
    ...localEvents,
  ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 60);
  feed.replaceChildren();
  if (!events.length) return entry(feed, '', '', 'Chưa có đòn tấn công nào được ghi nhận. Chiến trường đang yên lặng.');
  for (const ev of events) entry(feed, ev.kind === 'hit' ? 'HIT' : 'BLOCKED', ev.kind === 'hit' ? 'tag-hit' : 'tag-block', ev.text, freshIds.has(ev.id));
}
const defendId = x => [key(x.attacker), key(x.victim), x.time, x.reason].join(':');

function renderServices(services) {
  lastServices = services;
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
    teamInfo.get(team)?.territory.classList.toggle('down', !!down);
    base.classList.toggle('svc-warn', !down && !!warn);
    base.classList.toggle('svc-unknown', !down && !warn && unknown);
    const badge = base.querySelector('[data-base-status]');
    badge.textContent = down ? 'SERVICE DOWN' : warn ? (STATUS[warn.status] || 'UNKNOWN') : !mine.length ? 'NOT CHECKED' : unknown ? 'CHECKING' : 'SERVICE UP';
    base.title = mine.map(s => s.service + ': ' + (STATUS[s.status] || 'UNKNOWN')).join(' · ');
    if (mine.length && mine.every(s => s.status === 101)) up++;
  }
  $('[data-stat-up]').textContent = `${up}/${bases.size}`;
}

function renderChecks(checks) {
  const box = $('#world-checks');
  box.replaceChildren();
  if (!checks.length) return entry(box, '', '', 'Chưa có kết quả checker cuối tick.');
  for (const c of checks) {
    const up = c.status === 101, down = c.status === 104;
    entry(box, up ? 'SLA ' + fmt(c.points) : down ? 'DOWN' : STATUS[c.status] || 'UNKNOWN', up ? 'tag-sla' : down ? 'tag-down' : 'tag-info', ` Tick ${c.tick} · ${c.team}`);
  }
}

async function refresh() {
  try {
    const response = await fetch('/scoreboard/data/arena', { cache: 'no-store', signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw Error();
    const d = await response.json();
    const captures = Array.isArray(d.captures) ? d.captures : [];
    const defends = Array.isArray(d.defends) ? d.defends : [];
    $('#world-status').textContent = '';
    renderServices(Array.isArray(d.services) ? d.services : []);
    renderChecks(Array.isArray(d.checks) ? d.checks : []);
    $('[data-stat-captures]').textContent = captures.length >= 50 ? '50+' : captures.length;

    const capIds = new Set(captures.map(c => 'c' + c.attacker_id + ':' + c.capture_flag_id));
    const defIds = new Set(defends.map(x => 'd' + defendId(x)));
    const fresh = new Set();
    if (seenCaptures) {
      // Bắn theo thứ tự thời gian, tối đa 12 viên mỗi lần cập nhật để bản đồ không quá tải.
      captures.filter(c => !seenCaptures.has('c' + c.attacker_id + ':' + c.capture_flag_id)).reverse().slice(-12).forEach(c => {
        fresh.add('c' + c.attacker_id + ':' + c.capture_flag_id);
        enqueue(() => fire(key(c.attacker), key(c.victim), 'hit'));
      });
    }
    if (seenDefends) {
      defends.filter(x => !seenDefends.has('d' + defendId(x))).reverse().slice(-12).forEach(x => {
        fresh.add('d' + defendId(x));
        enqueue(() => fire(key(x.attacker), key(x.victim), 'blocked'));
      });
    }
    seenCaptures = capIds;
    seenDefends = defIds;
    renderFeed(captures, defends, fresh);
  } catch (_) {
    $('#world-status').textContent = 'LIVE DATA DISCONNECTED · Giữ kết quả gần nhất';
    for (const base of bases.values()) base.querySelector('[data-base-status]').textContent = 'DATA DISCONNECTED';
  } finally {
    setTimeout(refresh, 5000);
  }
}

// Danh sách đội: hiển thị 4 đội mặc định ngay, sau đó lấy danh sách thật từ ForcAD.
try { layoutTeams(JSON.parse(stage.dataset.defaultTeams || '[]')); } catch (_) {}
async function loadTeams() {
  try {
    const r = await fetch('/scoreboard/data/teams', { cache: 'no-store', signal: AbortSignal.timeout(7000) });
    const teams = r.ok ? await r.json() : [];
    if (Array.isArray(teams) && teams.length) layoutTeams(teams);
  } catch (_) { /* giữ bố cục hiện tại */ }
  setTimeout(loadTeams, 30000);
}
loadTeams();
refresh();

/* ---------- Nộp flag ---------- */
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

const form = $('#world-submit');
form?.addEventListener('reset', () => { $('#world-submit-result').textContent = ''; });
form?.addEventListener('submit', async e => {
  e.preventDefault();
  const button = form.querySelector('button[type=submit]'), out = $('#world-submit-result');
  const attacker = $('#fx-attacker').value, victim = $('#fx-victim').value;
  button.disabled = true;
  try {
    const r = await fetch('/scoreboard/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': form.elements._csrf.value },
      body: JSON.stringify({ token: form.elements.token.value.trim(), flags: form.elements.flags.value.trim().split(/\s+/) }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await r.json();
    if (!Array.isArray(result)) { out.textContent = result.error || JSON.stringify(result); return; }
    const kinds = result.map(x => classify(x.msg));
    out.textContent = result.map((x, i) => RESULT_LABEL[kinds[i]] + ' · ' + (x.msg || '')).join('\n');
    // Flag hết hạn / sai định dạng / đã nộp: đội mục tiêu phòng thủ thành công.
    // Flag hợp lệ sẽ xuất hiện qua captures của ForcAD nên không bắn ở đây để tránh trùng.
    if (attacker && victim && attacker !== victim) {
      kinds.filter(k => BLOCK_REASON[k]).slice(0, 5).forEach(k => {
        localEvents.unshift({ id: 'l' + Date.now() + Math.random(), time: new Date().toISOString(), kind: 'block',
          text: ` ${bases.get(attacker).querySelector('h2').textContent} → ${bases.get(victim).querySelector('h2').textContent} · ${BLOCK_REASON[k]} · ${timeOf(Date.now())} (mô phỏng tại chỗ)` });
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
