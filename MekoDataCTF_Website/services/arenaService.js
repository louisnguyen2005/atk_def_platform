// Dữ liệu World Arena dùng chung cho mọi người xem.
// - Một vòng lấy dữ liệu ForcAD: cache ngắn + gộp các yêu cầu đồng thời (không gọi ForcAD theo số người xem).
// - /scoreboard/state: JSON có ETag (304 khi không đổi).
// - /scoreboard/stream: Server-Sent Events, đẩy trạng thái mới ngay khi đổi; chỉ chạy vòng hỏi khi có người xem.
// Chỉ chuyển tiếp danh sách trường công khai cố định; không bao giờ trả flag, token hay dữ liệu checker riêng.
const crypto = require('crypto');
const Setting = require('../models/Setting');
const ZODIAC = require('../config/zodiac');

const ORIGIN = process.env.FORCAD_URL || 'http://127.0.0.1:18080';
const STATE_TTL = 1500;      // ms: dữ liệu dùng lại cho các yêu cầu sát nhau
const TEAMS_TTL = 30000;     // ms: danh sách đội ít thay đổi
const PUSH_INTERVAL = 2000;  // ms: chu kỳ hỏi ForcAD khi có người xem SSE
const HEARTBEAT = 15000;     // ms: giữ kết nối SSE và đồng bộ đồng hồ
const MAX_CLIENTS = 500;

async function fetchJson(path) {
  const response = await fetch(new URL(path, ORIGIN), { signal: AbortSignal.timeout(6000), redirect: 'error' });
  if (!response.ok) throw new Error('upstream ' + response.status);
  return response.json();
}

/* ---------- Gán con giáp: ngẫu nhiên nhưng ổn định cho cả giải ---------- */
let zodiacSeed = null;
function seed() {
  if (zodiacSeed !== null) return zodiacSeed;
  const saved = Number(Setting.all().arena_zodiac_seed);
  if (Number.isInteger(saved) && saved > 0) return (zodiacSeed = saved);
  zodiacSeed = crypto.randomInt(1, 2 ** 31);
  Setting.set('arena_zodiac_seed', zodiacSeed);
  return zodiacSeed;
}
function shuffled(n, s) {
  let a = s >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}
// Đội xếp theo id; đội thứ i nhận con giáp thứ i của hoán vị (tối đa 12 con khác nhau, sau đó lặp lại).
function withZodiac(teams) {
  const order = shuffled(ZODIAC.length, seed());
  return [...teams].sort((a, b) => (Number(a.id) || 1e9) - (Number(b.id) || 1e9) || String(a.name).localeCompare(String(b.name)))
    .map((t, i) => ({ id: t.id, name: t.name, zodiac: ZODIAC[order[i % ZODIAC.length]].id }));
}

/* ---------- Dựng trạng thái từ ForcAD ---------- */
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o && o[k] !== undefined).map(k => [k, o[k]]));
const list = v => (Array.isArray(v) ? v : []);
let teamsCache = { at: 0, data: [] };

async function loadTeams() {
  if (Date.now() - teamsCache.at < TEAMS_TTL && teamsCache.data.length) return teamsCache.data;
  try {
    const data = list(await fetchJson('/api/client/teams/')).map(t => ({ id: t.id, name: t.name })).filter(t => t.name);
    teamsCache = { at: Date.now(), data };
  } catch (_) { /* dùng danh sách cũ hoặc suy ra từ bảng điểm */ }
  return teamsCache.data;
}

async function load() {
  const [tick, arena, teams] = await Promise.all([
    fetchJson('/api/client/tick-status/'),
    fetchJson('/api/client/arena/').catch(() => ({})),
    loadTeams(),
  ]);
  const scores = list(tick.scores).map(s => pick(s, ['team_id', 'name', 'total', 'sla', 'attack', 'defense']));
  const known = new Map(teams.map(t => [String(t.name).toLowerCase(), t]));
  scores.forEach(s => { if (!known.has(String(s.name).toLowerCase())) known.set(String(s.name).toLowerCase(), { id: s.team_id, name: s.name }); });
  return {
    ok: true,
    game: pick(tick, ['mode', 'round', 'tick', 'phase', 'deadline', 'tick_seconds', 'ticks_per_round', 'max_rounds', 'running', 'overall_tick']),
    scores,
    teams: withZodiac([...known.values()]),
    services: list(arena.services).map(s => pick(s, ['team', 'service', 'status'])),
    captures: list(arena.captures).slice(0, 50).map(c => pick(c, ['tick', 'attacker', 'attacker_id', 'victim', 'victim_id', 'capture_flag_id', 'service', 'submit_time'])),
    checks: list(arena.checks).slice(0, 60).map(c => pick(c, ['tick', 'team', 'status', 'points'])),
    defends: list(arena.defends).slice(0, 50).map(x => pick(x, ['tick', 'attacker', 'victim', 'service', 'reason', 'time'])),
  };
}

/* ---------- Cache + gộp yêu cầu ---------- */
let current = null;   // { at, state, json, etag }
let inflight = null;

function store(state) {
  const json = JSON.stringify(state);
  const etag = 'W/"' + crypto.createHash('sha1').update(json).digest('base64url').slice(0, 20) + '"';
  const changed = !current || current.etag !== etag;
  current = { at: Date.now(), state, json, etag };
  if (changed) broadcast('state', current);
  return current;
}

function getState() {
  if (current && Date.now() - current.at < STATE_TTL) return Promise.resolve(current);
  if (!inflight) {
    inflight = load().then(store, () => store({ ok: false }))
      .finally(() => { inflight = null; });
  }
  return inflight;
}

// Thời điểm máy chủ (giây) giúp trình duyệt đồng bộ đồng hồ đếm ngược với hạn tick của ForcAD.
const withNow = entry => entry.json.replace(/^\{/, `{"now":${Date.now() / 1000},`);

/* ---------- Server-Sent Events ---------- */
const clients = new Set();
let pollTimer = null, beatTimer = null;

function write(res, event, data, id) {
  res.write(`event: ${event}\n${id ? `id: ${id}\n` : ''}data: ${data}\n\n`);
}
function broadcast(event, entry) {
  if (!clients.size) return;
  const data = withNow(entry);
  for (const res of clients) write(res, event, data, entry.etag);
}
function startLoop() {
  if (pollTimer) return;
  pollTimer = setInterval(() => { getState().catch(() => {}); }, PUSH_INTERVAL);
  beatTimer = setInterval(() => { for (const res of clients) write(res, 'ping', `{"now":${Date.now() / 1000}}`); }, HEARTBEAT);
}
function stopLoop() {
  clearInterval(pollTimer); clearInterval(beatTimer);
  pollTimer = beatTimer = null;
}

function subscribe(req, res) {
  if (clients.size >= MAX_CLIENTS) return res.status(503).json({ error: 'Quá nhiều kết nối trực tiếp, đang dùng chế độ tải định kỳ.' });
  res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  clients.add(res);
  res.on('error', () => clients.delete(res));
  startLoop();
  getState().then(entry => { if (clients.has(res)) write(res, 'state', withNow(entry), entry.etag); }, () => {});
  req.on('close', () => {
    clients.delete(res);
    if (!clients.size) stopLoop();
  });
}

async function sendState(req, res) {
  const entry = await getState();
  res.set({ 'Cache-Control': 'no-cache', ETag: entry.etag });
  if (req.get('if-none-match') === entry.etag) return res.status(304).end();
  res.type('application/json').send(withNow(entry));
}

module.exports = { getState, subscribe, sendState, ZODIAC };
