// Nguồn dữ liệu trực tiếp của World Arena + bảng xếp hạng + đồng hồ tick.
// Ưu tiên Server-Sent Events (/scoreboard/stream): máy chủ đẩy trạng thái ngay khi đổi.
// Nếu trình duyệt/mạng không giữ được SSE thì chuyển sang AJAX /scoreboard/state với ETag (304 khi không đổi).
// Mỗi trạng thái mới phát sự kiện 'arena-state' cho world.js.
(() => {
'use strict';
const root = document.querySelector('[data-arena]');
if (!root) return;
const get = s => root.querySelector(s);
const labels = { ready: 'READY', preparing: 'PREPARING', running: 'RUNNING', paused: 'PAUSED', checking: 'CHECKING', draining: 'FINAL FLAG WINDOW', finished: 'FINISHED', archived: 'ARCHIVED', recreating: 'RESETTING' };

let state = null;          // trạng thái hợp lệ gần nhất
let connected = false;
let skew = 0;              // giờ máy chủ - giờ trình duyệt (giây)
let rankingKey = '';
const previous = new Map();
const serverNow = () => Date.now() / 1000 + skew;

function setConnected(on) {
  if (connected === on && root.dataset.ready) return;
  connected = on;
  root.dataset.ready = '1';
  root.classList.toggle('disconnected', !on);
  get('[data-live]').textContent = on ? 'LIVE DATA CONNECTED' : 'LIVE DATA DISCONNECTED';
  root.dispatchEvent(new CustomEvent('arena-connection', { detail: { connected: on } }));
  if (!on && !state) placeholder('Chưa lấy được dữ liệu ForcAD. Đang thử kết nối lại…');
  timer();
}

// Một dòng thông báo trải hết bảng xếp hạng (không đặt text thẳng vào tbody để khỏi vỡ bảng).
function placeholder(text) {
  const body = get('[data-ranking]');
  body.replaceChildren();
  const cell = body.insertRow().insertCell();
  cell.colSpan = 6;
  cell.textContent = text;
  rankingKey = '';
}

function timer() {
  const el = get('[data-timer]'), game = state?.game;
  if (!game || !connected) { el.textContent = '—'; el.classList.remove('urgent'); return; }
  if (!['running', 'draining'].includes(game.phase) || !game.deadline) { el.textContent = labels[game.phase] || '—'; el.classList.remove('urgent'); return; }
  const left = Math.max(0, Math.ceil(game.deadline - serverNow()));
  el.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  el.classList.toggle('urgent', left <= 20);
  const bar = get('[data-progress]');
  bar.max = game.tick_seconds || 120;
  bar.value = Math.max(0, bar.max - left);
}

function renderRanking() {
  const game = state.game || {}, body = get('[data-ranking]');
  get('[data-phase]').textContent = game.mode === 'round1' ? (labels[game.phase] || game.phase || '—') : 'READY';
  get('[data-tick]').textContent = game.mode === 'round1' ? `${game.tick ?? '—'}/${game.ticks_per_round ?? '—'}` : '—';
  get('[data-updated]').textContent = 'Cập nhật lúc ' + new Date().toLocaleTimeString('vi-VN');
  if (game.mode !== 'round1') {
    if (rankingKey === 'idle') return;
    placeholder('Chưa có bảng điểm Round 1. Ban tổ chức chưa chuẩn bị cuộc thi.');
    rankingKey = 'idle';
    return;
  }
  const rows = [...(state.scores || [])].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const key = JSON.stringify(rows) + game.ticks_per_round;
  if (key === rankingKey) return; // không đổi: không đụng DOM
  rankingKey = key;
  const fragment = document.createDocumentFragment();
  let rank = 0;
  rows.forEach((team, i) => {
    if (i === 0 || team.total !== rows[i - 1].total) rank = i + 1;
    const tr = document.createElement('tr');
    tr.classList.toggle('leader', rank === 1);
    if (previous.has(team.team_id) && previous.get(team.team_id) !== team.total) tr.classList.add('changed');
    [rank, team.name, team.total, `${team.sla} / ${game.ticks_per_round}`, team.attack, team.defense].forEach((v, index) => {
      const td = document.createElement('td');
      td.textContent = String(v);
      if (index === 5 && team.defense < 0) td.className = 'negative';
      tr.append(td);
    });
    fragment.append(tr);
    previous.set(team.team_id, team.total);
  });
  body.replaceChildren(fragment);
  if (!rows.length) placeholder('Chưa có đội đang hoạt động.');
}

function accept(data) {
  if (typeof data.now === 'number') skew = data.now - Date.now() / 1000;
  if (!data.ok) return setConnected(false); // giữ dữ liệu cũ trên màn hình
  state = data;
  setConnected(true);
  renderRanking();
  timer();
  root.dispatchEvent(new CustomEvent('arena-state', { detail: state }));
}

/* ---------- AJAX dự phòng (ETag) ---------- */
let etag = null, pollTimer = null;
async function poll() {
  clearTimeout(pollTimer);
  try {
    const r = await fetch('/scoreboard/state', { cache: 'no-store', headers: etag ? { 'If-None-Match': etag } : {}, signal: AbortSignal.timeout(8000) });
    if (r.status === 304) setConnected(true);
    else if (r.ok) { etag = r.headers.get('ETag'); accept(await r.json()); }
    else throw Error();
  } catch (_) { setConnected(false); }
  pollTimer = setTimeout(poll, document.hidden ? 15000 : 3000);
}

/* ---------- SSE ---------- */
function stream() {
  if (!window.EventSource) return poll();
  const source = new EventSource('/scoreboard/stream');
  let failures = 0;
  source.addEventListener('state', e => { failures = 0; try { accept(JSON.parse(e.data)); } catch (_) {} });
  source.addEventListener('ping', e => { try { skew = JSON.parse(e.data).now - Date.now() / 1000; } catch (_) {} });
  source.onopen = () => { failures = 0; };
  source.onerror = () => {
    setConnected(false);
    // EventSource tự nối lại; lỗi liên tiếp (proxy chặn stream…) thì chuyển hẳn sang AJAX.
    if (++failures >= 3) { source.close(); poll(); }
  };
}

stream();
setInterval(timer, 1000);
})();
