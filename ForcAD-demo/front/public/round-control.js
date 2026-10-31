(() => {
  if (location.pathname !== '/') return;
  const panel = document.createElement('section');
  panel.style.cssText = 'margin:12px auto;padding:12px;max-width:1050px;background:#f4f5f8;border:1px solid #c6ccd7;border-radius:8px;font:15px Arial,sans-serif';
  panel.innerHTML = '<strong>Điều khiển round</strong> <span id="rc-state">Đang kiểm tra…</span> <button id="rc-start" type="button" hidden>Bắt đầu</button> <button id="rc-stop" type="button" hidden>Dừng</button> <button id="rc-reset" type="button" hidden>Reset round và điểm</button> <button id="rc-archive" type="button" hidden>Đóng và lưu hồ sơ</button> <a id="rc-download" hidden>Tải hồ sơ JSON</a> <a id="rc-login" href="/admin/" hidden>Đăng nhập quản trị</a><div id="rc-maintenance" style="margin-top:8px;font-size:13px;color:#555;white-space:pre-wrap"></div><div style="margin-top:5px;font-size:12px;color:#555">Chỉ quản trị viên điều khiển. Đóng/lưu không xóa dữ liệu; tái tạo cần chạy script sau khi cả bốn VM đã được dọn và kiểm tra.</div>';
  document.body.insertBefore(panel, document.getElementById('app'));
  const state = panel.querySelector('#rc-state');
  const start = panel.querySelector('#rc-start');
  const stop = panel.querySelector('#rc-stop');
  const reset = panel.querySelector('#rc-reset');
  const login = panel.querySelector('#rc-login');
  const archive = panel.querySelector('#rc-archive');
  const download = panel.querySelector('#rc-download');
  const maintenance = panel.querySelector('#rc-maintenance');
  const prepare = document.createElement('button');
  prepare.textContent = 'Chuẩn bị Round 1 (3 task)'; prepare.hidden = true;
  panel.appendChild(prepare);
  const submission = document.createElement('a');
  submission.href = '/submit.html'; submission.textContent = ' Nộp flag / Mục tiêu';
  panel.appendChild(submission);
  const management=document.createElement('a'); management.href='/admin/'; management.textContent=' · Quản lý đội / task'; panel.appendChild(management);
  const help = panel.querySelector('div');
  help.textContent = 'Bắt đầu mới sinh và đặt flag. Dừng khóa nộp flag, tạm dừng đồng hồ; tác vụ đã gửi có thể hoàn tất.';
  let busy = false;
  async function refresh() {
    if (busy) return;
    try {
      const res = await fetch('/api/admin/round-control/', {credentials:'same-origin', cache:'no-store'});
      if (res.status === 403 || res.status === 401) {
        state.textContent = '— cần đăng nhập quản trị';
        login.hidden = false; start.hidden = stop.hidden = reset.hidden = prepare.hidden = archive.hidden = download.hidden = true; return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      state.textContent = data.running ? '— Đang chạy' : '— Đã dừng';
      login.hidden = true; start.hidden = data.running; stop.hidden = !data.running; reset.hidden = data.running;
      const r1 = data.round1 || {};
      prepare.hidden = data.running || r1.configured || ['archived','recreating'].includes(r1.phase);
      archive.hidden = data.running || !r1.configured || !['ready','paused','finished'].includes(r1.phase) || !!r1.archive_id;
      download.hidden = !['archived','recreating'].includes(r1.phase) || !r1.archive_id;
      if (download.hidden === false) {
        download.href = '/api/admin/round1/archive/' + encodeURIComponent(r1.archive_id) + '/';
        maintenance.textContent = `Đã đóng và lưu hồ sơ ${r1.archive_id}. Hãy tải JSON lưu ngoài máy trước khi dọn dữ liệu. Sau khi dọn và kiểm tra đủ attacker1–4, chạy trong PowerShell tại workspace:\npython round1-lab/recycle.py --archive-id ${r1.archive_id}`;
      } else maintenance.textContent = '';
      if (data.round1?.configured) {
        reset.hidden = true;
        if (data.round1.phase === 'finished') start.hidden = true;
        state.textContent += ` — Round 1: ${data.round1.phase}, tick ${data.round1.tick}/15`;
      }
      if (r1.phase === 'archived') {
        start.hidden = stop.hidden = reset.hidden = prepare.hidden = true;
        state.textContent = '— Đã đóng; dữ liệu thi được lưu';
      }
      if (r1.phase === 'recreating') {
        start.hidden = stop.hidden = reset.hidden = prepare.hidden = archive.hidden = true;
        download.hidden = false;
        state.textContent = '— Đang hoàn tất tái tạo; chạy lại script cùng archive ID nếu cần';
      }
    } catch (err) {
      state.textContent = '— Không kết nối được bộ điều khiển';
      start.hidden = stop.hidden = reset.hidden = prepare.hidden = archive.hidden = download.hidden = true;
    }
  }
  async function setRunning(running) {
    busy = true; start.disabled = stop.disabled = true;
    try {
      const res = await fetch('/api/admin/round-control/', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({running})});
      if (!res.ok) { const body = await res.json(); throw new Error(body.error || 'HTTP ' + res.status); }
    } catch (err) { alert('Không đổi được trạng thái round: ' + err.message); }
    finally { busy = false; start.disabled = stop.disabled = false; await refresh(); }
  }
  start.addEventListener('click', () => setRunning(true));
  stop.addEventListener('click', () => setRunning(false));
  prepare.addEventListener('click', async () => {
    if (!confirm('Chuẩn bị Round 1 với ba task IDOR, SQLi, Upload? Chỉ thực hiện khi bản health đã dừng và reset về 0. Chưa sinh flag cho đến khi bấm Bắt đầu.')) return;
    busy = true; prepare.disabled = true;
    try {
      const res = await fetch('/api/admin/round1/prepare/', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:'PREPARE ROUND1'})});
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'HTTP '+res.status);
      location.reload();
    } catch (err) { alert(err.message); }
    finally { busy = false; prepare.disabled = false; }
  });
  archive.addEventListener('click', async () => {
    if (!confirm('Đóng Round 1 và tạo hồ sơ lưu trong PostgreSQL? Hành động này không xóa flag hay điểm. Sau đó tải JSON về máy trước khi tái tạo.')) return;
    busy = true; archive.disabled = true;
    try {
      const res = await fetch('/api/admin/round1/archive/', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:'ARCHIVE ROUND1'})});
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'HTTP ' + res.status);
      location.reload();
    } catch (err) { alert('Không đóng được cuộc thi: ' + err.message); }
    finally { busy = false; archive.disabled = false; await refresh(); }
  });
  reset.addEventListener('click', async () => {
    if (!confirm('Reset về tick 0, điểm của các đội về 0 và xóa lịch sử kiểm tra ForcAD? Hãy dừng và chờ ít nhất 30 giây trước khi reset.')) return;
    busy = true; reset.disabled = true;
    try {
      const res = await fetch('/api/admin/round-control/reset/', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:'RESET'})});
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'HTTP ' + res.status);
      alert('Đã reset tick và điểm của các đội về 0.');
      location.reload();
    } catch (err) { alert('Không reset được: ' + err.message); }
    finally { busy = false; reset.disabled = false; }
  });
  refresh(); setInterval(refresh, 5000);
})();
