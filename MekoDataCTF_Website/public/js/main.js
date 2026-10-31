(function () {
  'use strict';

  // ----- Xác nhận trước khi xóa -----
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // ----- Token đội: hiện/ẩn và sao chép -----
  document.querySelectorAll('[data-token-value]').forEach(function (box) {
    var root = box.closest('.token-box');
    var toggle = root && root.querySelector('[data-token-toggle]');
    var copy = root && root.querySelector('[data-token-copy]');
    var token = box.getAttribute('data-token-value');
    var masked = box.textContent;
    if (toggle) {
      toggle.addEventListener('click', function () {
        var showing = box.textContent === token;
        box.textContent = showing ? masked : token;
        toggle.textContent = showing ? toggle.dataset.show : toggle.dataset.hide;
      });
    }
    if (copy) {
      copy.addEventListener('click', function () {
        var label = copy.textContent;
        var done = function () {
          copy.textContent = copy.dataset.copied;
          setTimeout(function () { copy.textContent = label; }, 1600);
        };
        if (navigator.clipboard) navigator.clipboard.writeText(token).then(done, function () {});
      });
    }
  });

  // ----- Đồng hồ đếm ngược -----
  var cd = document.querySelector('[data-countdown]');
  if (cd) {
    var start = new Date(cd.dataset.start).getTime();
    var end = new Date(cd.dataset.end).getTime();
    var title = cd.querySelector('[data-countdown-title]');
    var grid = cd.querySelector('[data-countdown-grid]');
    var units = {};
    cd.querySelectorAll('[data-unit]').forEach(function (el) { units[el.dataset.unit] = el; });
    var pad = function (n) { return String(n).padStart(2, '0'); };

    var tick = function () {
      var now = Date.now();
      if (isNaN(start)) { cd.hidden = true; return; }
      if (now >= start) {
        grid.hidden = true;
        title.textContent = now < end ? cd.dataset.running : cd.dataset.ended;
        return true;
      }
      var s = Math.floor((start - now) / 1000);
      units.d.textContent = pad(Math.floor(s / 86400));
      units.h.textContent = pad(Math.floor((s % 86400) / 3600));
      units.m.textContent = pad(Math.floor((s % 3600) / 60));
      units.s.textContent = pad(s % 60);
    };
    tick();
    var timer = setInterval(function () { if (tick()) clearInterval(timer); }, 1000);
  }

  // ----- Thêm / xóa thành viên trong form đội -----
  var form = document.querySelector('[data-team-form]');
  if (form) {
    var list = form.querySelector('[data-members]');
    var tpl = form.querySelector('[data-member-template]');
    var addBtn = form.querySelector('[data-add-member]');
    var max = Number(form.dataset.max) || 4;
    var min = Number(form.dataset.min) || 1;
    var labelPattern = addBtn.dataset.label;

    // Đánh lại chỉ số name="members[i][field]" và nhãn sau mỗi thay đổi
    var reindex = function () {
      var rows = list.querySelectorAll('[data-member-row]');
      rows.forEach(function (row, i) {
        row.querySelector('[data-member-label]').textContent = labelPattern.replace('{n}', i + 1);
        row.querySelector('[data-leader-badge]').hidden = i !== 0;
        row.querySelectorAll('input').forEach(function (input) {
          var field = input.dataset.field || input.name.replace(/^members\[\d+\]\[(\w+)\]$/, '$1');
          input.dataset.field = field;
          input.name = 'members[' + i + '][' + field + ']';
        });
        row.querySelector('[data-remove-member]').hidden = rows.length <= min;
      });
      addBtn.hidden = rows.length >= max;
    };

    addBtn.addEventListener('click', function () {
      if (list.querySelectorAll('[data-member-row]').length >= max) return;
      list.appendChild(tpl.content.cloneNode(true));
      reindex();
      var rows = list.querySelectorAll('[data-member-row]');
      rows[rows.length - 1].querySelector('input').focus();
    });

    list.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-remove-member]');
      if (!btn) return;
      btn.closest('[data-member-row]').remove();
      reindex();
    });

    reindex();
  }
})();
