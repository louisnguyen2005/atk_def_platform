// Giao diện /scoreboard: nhận sự kiện 'arena-state' từ arena.js và dựng nhật ký, trạng thái service, form nộp flag.
// Mọi con số lấy từ ForcAD. Sân đấu (public/arena-ui) đọc sự kiện 'crypto-range:state' nên file này đổi dữ liệu
// ForcAD sang định dạng đó, chỉ để dựng hiệu ứng.
(() => {
'use strict';
const root = document.querySelector('[data-arena]');
if (!root) return;

const $ = s => document.querySelector(s);
const json = (v, fallback) => { try { return JSON.parse(v); } catch (_) { return fallback; } };
const key = name => String(name || '').toLowerCase();
const fmt = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
const timeOf = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleTimeString('vi-VN'); };

// Luật điểm của cuộc thi, chỉ dùng cho phần chú giải.
const RULES = { flag: 1, sla: 1 };
const STATUS = { 101: 'UP', 102: 'CORRUPT', 103: 'MUMBLE', 104: 'DOWN', 110: 'CHECKING', '-1': 'NOT CHECKED' };
const BLOCK_REASON = { expired: 'flag hết hạn', invalid: 'flag sai định dạng/hết hạn', duplicate: 'flag đã nộp rồi' };
const MAX_FX = 12;   // số đòn tối đa mỗi lần cập nhật để sân đấu không quá tải

const teams = new Map();   // key(tên đội) -> { id, name }; id là chuỗi vì sân đấu sắp xếp bằng localeCompare
let liveTeams = false;     // false khi chưa nhận được danh sách đội thật
let lastCaptures = [], lastDefends = [];

/* ---------- Dựng phần tử (chỉ dùng textContent cho dữ liệu từ ForcAD) ---------- */
function row(parent, tag, tone, text, time) {
  const line = document.createElement('div');
  line.className = 'capture-row';
  if (tag) {
    const label = document.createElement('span');
    label.className = 'log-tag ' + tone;
    label.textContent = tag;
    line.append(label);
  }
  const body = document.createElement('span');
  body.textContent = text;
  line.append(body);
  if (time) {
    const stamp = document.createElement('time');
    stamp.textContent = time;
    line.append(stamp);
  }
  parent.append(line);
}
function empty(parent, text) {
  const note = document.createElement('div');
  note.className = 'feed-empty';
  note.textContent = text;
  parent.replaceChildren(note);
}

/* ---------- Điểm & chú giải ---------- */
function paintRules(scores) {
  $('[data-rule-attack]').textContent = fmt(RULES.flag);
  $('[data-rule-victim]').textContent = fmt(-RULES.flag);
  $('[data-rule-sla]').textContent = fmt(RULES.sla);
  $('[data-rule-down]').textContent = 'SLA +0';
}

/* ---------- Nhật ký ---------- */
const defendId = x => [key(x.attacker), key(x.victim), x.time, x.reason].join(':');
const captureId = c => 'c' + c.attacker_id + ':' + c.capture_flag_id;
const localEvents = [];   // đòn bị chặn mô phỏng tại chỗ từ form nộp flag

let feedKey = '';
function renderFeed(captures, defends) {
  const events = [
    ...captures.map(c => ({ id: captureId(c), time: c.submit_time, kind: 'hit', text: `Tick ${c.tick} · ${c.attacker} → ${c.victim} · ${c.service}` })),
    ...defends.map(x => ({ id: 'd' + defendId(x), time: x.time, kind: 'block', text: `Tick ${x.tick ?? '—'} · ${x.attacker} → ${x.victim} · ${BLOCK_REASON[x.reason] || x.reason || 'bị chặn'}` })),
    ...localEvents,
  ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 60);
  const signature = events.map(e => e.id).join('|');
  if (signature === feedKey) return;
  feedKey = signature;
  const feed = $('#world-feed');
  if (!events.length) return empty(feed, 'Chưa có đòn tấn công nào được ghi nhận. Chiến trường đang yên lặng.');
  feed.replaceChildren();
  for (const ev of events) row(feed, ev.kind === 'hit' ? 'HIT' : 'BLOCKED', ev.kind === 'hit' ? 'hit' : 'block', ev.text, timeOf(ev.time));
}

let capturesKey = '';
function renderCaptures(captures) {
  const signature = captures.slice(0, 5).map(captureId).join('|');
  if (signature === capturesKey && signature) return;
  capturesKey = signature;
  const box = $('#capture-feed');
  if (!captures.length) return empty(box, 'Chưa có flag bị chiếm.');
  box.replaceChildren();
  for (const c of captures.slice(0, 5)) {
    const line = document.createElement('div');
    line.className = 'capture-row';
    const text = document.createElement('span');
    const who = document.createElement('strong');
    who.textContent = c.attacker;
    text.append(who, ` chiếm ${c.service} của ${c.victim}`);
    const tick = document.createElement('time');
    tick.textContent = 'T' + c.tick;
    line.append(text, tick);
    box.append(line);
  }
}

/* ---------- Trạng thái service ---------- */
const pillClass = status => (status === 101 ? 'UP' : status === 104 ? 'DOWN' : status === 102 || status === 103 ? 'CHECK_FAILED' : 'PENDING');

let servicesKey = '';
function renderServices(services) {
  const names = [...new Set(services.map(s => s.service))];
  const signature = JSON.stringify(services) + [...teams.keys()].join('|');
  if (signature === servicesKey) return;
  servicesKey = signature;

  const table = $('.health-table');
  table.style.setProperty('--svc', Math.max(names.length, 1));
  const head = $('#health-head');
  head.replaceChildren();
  for (const label of ['ĐỘI', ...names]) {
    const cell = document.createElement('span');
    cell.textContent = label;
    head.append(cell);
  }

  const box = $('#health-rows');
  let up = 0;
  if (!services.length) empty(box, 'Chờ dữ liệu checker…');
  else box.replaceChildren();
  for (const [team, info] of teams) {
    const mine = services.filter(s => key(s.team) === team);
    if (mine.length && mine.every(s => s.status === 101)) up++;
    if (!services.length) continue;
    const line = document.createElement('div');
    line.className = 'health-row';
    const title = document.createElement('strong');
    title.textContent = info.name;
    line.append(title);
    for (const name of names) {
      const item = mine.find(s => s.service === name);
      const pill = document.createElement('span');
      pill.className = 'status-pill status-' + (item ? pillClass(item.status) : 'PENDING');
      pill.textContent = item ? STATUS[item.status] || 'UNKNOWN' : 'NOT CHECKED';
      line.append(pill);
    }
    box.append(line);
  }
  $('[data-stat-up]').textContent = `${up}/${teams.size}`;
}

let checksKey = '';
function renderChecks(checks) {
  const signature = JSON.stringify(checks);
  if (signature === checksKey) return;
  checksKey = signature;
  const box = $('#world-checks');
  if (!checks.length) return empty(box, 'Chưa có kết quả checker cuối tick.');
  box.replaceChildren();
  for (const c of checks) {
    const up = c.status === 101, down = c.status === 104;
    row(box, up ? 'SLA ' + fmt(c.points) : down ? 'DOWN' : STATUS[c.status] || 'UNKNOWN', up ? 'sla' : down ? 'down' : 'info', `Tick ${c.tick} · ${c.team}`);
  }
}

/* ---------- Sự kiện cho sân đấu ---------- */
// Sân đấu chỉ bắn những id lớn hơn id đã thấy, nên id được cấp tăng dần theo từng đòn cần diễn.
let nextFxId = 0;
let seenCaptures = null, seenDefends = null;   // null ở lần nhận đầu: không bắn lại lịch sử
let previousSla = null;
let fxCaptures = [], fxDefenses = [];

const idOf = name => teams.get(key(name))?.id;
const keep = (list, items) => [...list, ...items].slice(-MAX_FX);

function collectFx(captures, defends, scores, tick) {
  const shots = [], shields = [];
  if (seenCaptures && !document.hidden) {   // tab ẩn: chỉ ghi nhận, không bắn bù
    captures.filter(c => !seenCaptures.has(captureId(c))).reverse().slice(-MAX_FX).forEach(c => {
      shots.push({ id: ++nextFxId, attacker_id: idOf(c.attacker), victim_id: idOf(c.victim), task: c.service, tick: c.tick });
    });
    defends.filter(x => !seenDefends.has(defendId(x))).reverse().slice(-MAX_FX).forEach(x => {
      shields.push({ id: ++nextFxId, team_id: idOf(x.victim), task: x.service, tick: x.tick ?? tick, note: 'chặn flag', float: 'BLOCKED' });
    });
  }
  if (previousSla && !document.hidden) {
    for (const s of scores) {
      const old = previousSla.get(key(s.name));
      if (old !== undefined && s.sla > old) shields.push({ id: ++nextFxId, team_id: idOf(s.name), task: 'sla', tick, note: 'giữ dịch vụ', float: fmt(s.sla - old) + ' SLA' });
    }
  }
  seenCaptures = new Set(captures.map(captureId));
  seenDefends = new Set(defends.map(defendId));
  previousSla = new Map(scores.map(s => [key(s.name), s.sla]));
  fxCaptures = keep(fxCaptures, shots);
  fxDefenses = keep(fxDefenses, shields);
}

function publishArena(game, scores) {
  const ranked = [...scores].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .map(s => ({ ...s, team_id: idOf(s.name) }));
  const state = { game, teams: [...teams.values()], scores: ranked, captures: fxCaptures, defenses: fxDefenses };
  window.cryptoRangeState = state;   // sân đấu tải muộn đọc trạng thái mới nhất từ đây
  document.dispatchEvent(new CustomEvent('crypto-range:state', { detail: state }));
}

/* ---------- Nhận trạng thái ---------- */
root.addEventListener('arena-state', e => {
  const d = e.detail || {}, game = d.game || {};
  const list = v => (Array.isArray(v) ? v : []);
  const scores = list(d.scores), captures = list(d.captures), defends = list(d.defends);

  const liveList = list(d.teams).length ? d.teams : scores.map(t => ({ id: t.team_id, name: t.name }));
  liveTeams = liveList.length > 0;
  teams.clear();
  for (const t of liveList) if (t && t.name) teams.set(key(t.name), { id: String(t.id), name: t.name });

  $('[data-stat-round]').textContent = game.round ?? '—';
  $('[data-stat-captures]').textContent = captures.length >= 50 ? '50+' : captures.length;
  if (game.phase === 'running') $('[data-phase]').textContent = 'BATTLE IN PROGRESS';

  lastCaptures = captures; lastDefends = defends;
  paintRules(scores);
  syncSubmitTeams();
  renderServices(list(d.services));
  renderChecks(list(d.checks));
  renderCaptures(captures);
  renderFeed(captures, defends);
  collectFx(captures, defends, scores, game.tick);
  if (liveTeams) publishArena(game, scores);
});

/* ---------- Nộp flag (AJAX) ---------- */
// "Đội của bạn" cố định theo đội đang đăng nhập: khớp tên khai riêng / slug / tên đội (data-my-teams)
// với danh sách đội ForcAD. "Đội mục tiêu" gồm các đội ForcAD còn lại.
const form = $('#world-submit');
function syncSubmitTeams() {
  if (!form) return;
  const attacker = $('#fx-attacker'), victim = $('#fx-victim');
  const myTeam = json(form.dataset.myTeams, []).find(k => teams.has(k)) || '';
  attacker.replaceChildren(myTeam ? new Option(teams.get(myTeam).name, myTeam) : new Option('— chưa ghép với ForcAD —', ''));
  $('#submit-unlinked').hidden = !!myTeam || !liveTeams;
  const chosen = victim.value;
  victim.replaceChildren(new Option('—', ''));
  for (const [team, info] of teams) if (team !== myTeam) victim.append(new Option(info.name, team));
  victim.value = chosen !== myTeam && teams.has(chosen) ? chosen : '';
}

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
    // Flag hợp lệ sẽ đến qua captures của ForcAD nên không diễn ở đây để tránh trùng.
    if (attacker && victim && attacker !== victim && teams.has(attacker) && teams.has(victim)) {
      kinds.filter(k => BLOCK_REASON[k]).slice(0, 5).forEach(k => {
        localEvents.unshift({ id: 'l' + Date.now() + Math.random(), time: new Date().toISOString(), kind: 'block',
          text: `${teams.get(attacker).name} → ${teams.get(victim).name} · ${BLOCK_REASON[k]} (mô phỏng tại chỗ)` });
        window.cryptoArena?.queue.push({ type: 'shield', team: teams.get(victim).id, tick: window.cryptoRangeState?.game?.tick || 0, tasks: ['block'], note: 'chặn flag', float: 'BLOCKED' });
      });
      localEvents.splice(20);
      renderFeed(lastCaptures, lastDefends);
    }
  } catch (_) {
    out.textContent = 'Không kết nối được bộ nhận flag.';
  } finally {
    button.disabled = false;
  }
});
})();
