(() => {
  'use strict';
  const embedded = location.pathname.startsWith('/crypto');
  const api = embedded ? '/crypto/api' : '/api';
  const byId = id => document.getElementById(id);
  let snapshot = null;
  let adminKey = '';
  let serverOffset = 0;
  let stateSequence = '';
  const taskLabels = { curveball: 'Curveball', padding_oracle: 'Padding', ecdsa_nonce: 'ECDSA' };
  let csrfToken = '';
  let signedInAsAdmin = false;
  let signedInAsTeam = false;
  let signedTeamName = '';

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (embedded && options.method && options.method !== 'GET') {
      if (!csrfToken) {
        const sessionResponse = await fetch(api + '/session', { cache: 'no-store', credentials: 'same-origin' });
        const session = await sessionResponse.json();
        csrfToken = session.csrfToken || '';
        signedInAsTeam = !!session.signedInAsTeam;
        signedTeamName = session.signedTeamName || '';
      }
      headers['X-CSRF-Token'] = csrfToken;
    }
    const response = await fetch(api + path, { cache: 'no-store', credentials: 'same-origin', ...options, headers });
    let payload;
    try { payload = await response.json(); } catch (_) { payload = { ok: false, error: 'invalid_response' }; }
    if (!response.ok) throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), { status: response.status, payload });
    return payload;
  }

  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function updateTeams(teams) {
    const select = byId('team-select');
    const current = select.value;
    select.replaceChildren(new Option('Chọn đội', ''));
    for (const team of teams || []) select.add(new Option(team.name, team.id));
    if (teams.some(team => team.id === current)) select.value = current;
    else if (embedded && signedInAsTeam && signedTeamName) {
      const match = teams.find(team => team.name.localeCompare(signedTeamName, 'vi', { sensitivity: 'base' }) === 0);
      if (match) select.value = match.id;
    }
    syncDemoToken();
  }

  function syncDemoToken() {
    const id = byId('team-select').value;
    const token = snapshot?.demoTeamTokens?.[id];
    if (token && (!byId('team-token').dataset.edited || !byId('team-token').value)) {
      byId('team-token').value = token;
      byId('team-token').dataset.edited = '';
    }
  }

  function renderScores() {
    const body = byId('rankings');
    const rows = snapshot.scores || [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="loading">Đang chờ các đội được cấu hình.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row, index) => `<tr class="${index === 0 ? 'leader' : ''}"><td>${index + 1}</td><td><span class="team-name">${escape(row.name)}</span></td><td><b class="total-score">${row.total}</b></td><td><span class="score-pos">+${row.attack}</span></td><td><span class="${row.defense < 0 ? 'score-neg' : 'score-pos'}">${row.defense > 0 ? '+' : ''}${row.defense}</span></td><td><span class="score-sla">${row.sla} <small>/ ${snapshot.game.ticks_per_round}</small></span></td></tr>`).join('');
  }

  function renderTargets() {
    for (const task of Object.keys(taskLabels)) {
      const slot = document.querySelector(`[data-target="${task}"]`);
      const rows = (snapshot.teams || []).map(team => {
        const port = team.ports[task];
        const host = team.host;
        const endpoint = `${host}:${port}`;
        return `<div class="endpoint-row"><span>${escape(team.name)}</span><code>${escape(endpoint)}</code><button type="button" data-copy="${escape(endpoint)}" title="Sao chép ncat command">COPY ⧉</button></div>`;
      });
      slot.innerHTML = rows.join('') || '<span>Đợi cấu hình địa chỉ VM</span>';
    }
  }

  function renderHealth() {
    const rows = snapshot.scores || [];
    const checks = snapshot.services || [];
    if (snapshot.game.tick < 1 || !checks.length) {
      byId('health-rows').innerHTML = '<div class="health-empty">Bắt đầu round để chạy kiểm tra service.</div>';
      return;
    }
    byId('health-rows').innerHTML = rows.map(team => {
      const cells = Object.keys(taskLabels).map(task => {
        const row = checks.find(c => c.team_id === team.team_id && c.service === task);
        const status = row?.status || 'PENDING';
        const label = status === 'UP' ? 'UP' : status === 'PATCHED' ? 'PATCHED' : status === 'DOWN' ? 'DOWN' : status === 'CHECK_FAILED' ? 'CHECK ERR' : 'WAIT';
        return `<span class="status-pill status-${escape(status)}" title="${escape(row?.detail || '')}">${label}</span>`;
      }).join('');
      return `<div class="health-row"><strong>${escape(team.name)}</strong>${cells}</div>`;
    }).join('');
  }

  function renderCaptures() {
    const captures = snapshot.captures || [];
    byId('capture-feed').innerHTML = captures.length ? captures.slice(0, 5).map(item =>
      `<div class="capture-row"><span><strong>${escape(item.attacker)}</strong> captured ${escape(item.task)} from ${escape(item.victim)}</span><time>R${item.tick}</time></div>`).join('')
      : '<div class="feed-empty">Chưa có flag bị cướp.</div>';
  }

  function renderTimer() {
    const game = snapshot?.game;
    if (!game) return;
    const labels = { ready: 'READY TO DEPLOY', preparing: 'PLACING FLAGS', running: 'ROUND LIVE', checking: 'CHECKING SERVICES', paused: 'ROUND PAUSED', finished: 'MATCH COMPLETE' };
    byId('phase-label').textContent = labels[game.phase] || game.phase.toUpperCase();
    byId('tick-label').textContent = game.tick ? `R${game.tick}/${game.ticks_per_round}` : `${game.ticks_per_round} ROUNDS`;
    const left = game.phase === 'running' && game.deadline ? Math.max(0, Math.ceil(game.deadline - (Date.now() / 1000 + serverOffset))) : 0;
    byId('timer').textContent = game.phase === 'running' ? `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : '--:--';
  }

  function render() {
    if (typeof snapshot.now === 'number') serverOffset = snapshot.now - Date.now() / 1000;
    updateTeams(snapshot.teams || []);
    renderScores();
    renderTargets();
    renderHealth();
    renderCaptures();
    renderTimer();
    if (byId('team-count')) byId('team-count').textContent = (snapshot.teams || []).length || '—';
    byId('updated').textContent = `R${snapshot.game.tick || 0} · ${new Date((snapshot.now || Date.now() / 1000) * 1000).toLocaleTimeString('vi-VN')}`;
    byId('connection-label').textContent = `ĐANG KẾT NỐI · ${snapshot.game.phase.toUpperCase()}`;
    byId('connection-dot').style.background = 'var(--teal)';
    const signature = JSON.stringify([snapshot.game.phase, snapshot.game.tick, snapshot.scores, snapshot.services, snapshot.captures, snapshot.defenses]);
    if (signature !== stateSequence) {
      stateSequence = signature;
      window.cryptoRangeState = snapshot;   // arenas that start late read the latest state from here
      document.dispatchEvent(new CustomEvent('crypto-range:state', { detail: snapshot }));
    }
  }

  async function refresh() {
    try {
      snapshot = await request('/state');
      render();
    } catch (error) {
      byId('connection-label').textContent = embedded ? 'SCOREBOARD BACKEND OFFLINE' : 'CONTROLLER ĐANG KHỞI ĐỘNG';
      byId('connection-dot').style.background = '#f39992';
      console.warn('crypto-range:', error.message);
    }
  }

  byId('team-select').addEventListener('change', () => {
    byId('team-token').dataset.edited = '';
    syncDemoToken();
  });
  byId('team-token').addEventListener('input', () => { byId('team-token').dataset.edited = '1'; });
  byId('show-token').addEventListener('click', event => {
    const input = byId('team-token');
    input.type = input.type === 'password' ? 'text' : 'password';
    event.currentTarget.textContent = input.type === 'password' ? 'HIỆN' : 'ẨN';
  });
  byId('submit-form').addEventListener('submit', async event => {
    event.preventDefault();
    const result = byId('submit-result');
    result.classList.remove('error');
    const flags = byId('flag-input').value.split(/\s+/).map(s => s.trim()).filter(Boolean);
    const selectedDemoToken = snapshot?.demoTeamTokens?.[byId('team-select').value];
    const token = byId('team-token').value.trim() || selectedDemoToken || '';
    if ((!token && !(embedded && signedInAsTeam)) || !flags.length) {
      result.textContent = 'Chọn đội, nhập token và flag.';
      result.classList.add('error');
      return;
    }
    result.textContent = 'Đang gửi…';
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['X-Team-Token'] = token;
      const response = await request('/submit', { method: 'POST', headers, body: JSON.stringify({ flags }) });
      const count = response.accepted?.length || 0;
      result.textContent = count ? `✓ ${count} flag được chấp nhận · ${response.rejected || 0} bị từ chối` : `0 flag được chấp nhận · ${response.rejected || 0} không hợp lệ, trùng hoặc đã hết hạn`;
      result.classList.toggle('error', !count);
      byId('flag-input').value = '';
      await refresh();
    } catch (error) {
      result.textContent = error.status === 401 ? 'Token không hợp lệ.' : 'Không gửi được flag.';
      result.classList.add('error');
    }
  });

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-copy]');
    if (!button) return;
    const endpoint = button.dataset.copy;
    const command = `ncat ${endpoint}`;
    try {
      await navigator.clipboard.writeText(command);
      button.textContent = 'COPIED ✓';
      setTimeout(() => { button.textContent = 'COPY ⧉'; }, 1300);
    } catch (_) {
      window.prompt('ncat command:', command);
    }
  });

  byId('admin-login').addEventListener('click', async () => {
    const status = byId('admin-status');
    try {
      let response;
      if (embedded) {
        if (!signedInAsAdmin) throw Object.assign(new Error('Đăng nhập tài khoản Ban tổ chức trên website trước.'), { status: 401 });
        response = await request('/admin/state');
      } else {
        adminKey = byId('admin-token').value.trim();
        response = await request('/admin/state', { headers: { Authorization: `Bearer ${adminKey}` } });
      }
      if (!response.ok) throw new Error('Không có quyền BTC');
      byId('admin-actions').hidden = false;
      status.classList.remove('error');
      status.textContent = '✓ BTC đã xác thực';
      const addresses = response.teams.map(team => `${team.id} · ${team.host}`).join('    ');
      byId('admin-team-info').innerHTML = `TEAM VM / SSH TARGETS&nbsp;&nbsp; <code>${escape(addresses)}</code>`;
    } catch (error) {
      adminKey = '';
      status.classList.add('error');
      status.textContent = error.status === 401 && embedded ? error.message : error.status === 404 ? 'Cần bật API trong cấu hình controller.' : 'Admin key chưa đúng.';
    }
  });

  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
    if (!adminKey && !(embedded && signedInAsAdmin)) return;
    const action = button.dataset.action;
    if (action === 'reset' && !window.confirm('Xóa điểm, flags và lịch sử của cuộc thi đang chạy?')) return;
    byId('action-result').textContent = 'Đang chạy…';
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (!embedded) headers.Authorization = `Bearer ${adminKey}`;
      const response = await request('/admin/action', { method: 'POST', headers, body: JSON.stringify({ action }) });
      if (!response.ok) throw new Error(response.error || 'Không thực hiện được.');
      byId('action-result').textContent = `Đã chuyển trạng thái: ${response.phase}`;
      await refresh();
    } catch (error) {
      byId('action-result').textContent = error.message;
    }
  }));

  setInterval(renderTimer, 500);
  if (embedded) {
    byId('admin-token').closest('.admin-login').hidden = true;
    request('/session').then(session => {
      csrfToken = session.csrfToken || '';
      signedInAsAdmin = !!session.signedInAsAdmin;
      signedInAsTeam = !!session.signedInAsTeam;
      signedTeamName = session.signedTeamName || '';
      if (signedInAsTeam) {
        byId('team-token').placeholder = 'Đã xác thực bằng tài khoản đội';
        syncDemoToken();
      }
    });
  }
  refresh();
  setInterval(refresh, 1800);
})();
