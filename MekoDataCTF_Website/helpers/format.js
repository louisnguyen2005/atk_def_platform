function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Chuyển nội dung văn bản do BTC nhập thành HTML an toàn:
// dòng thường → <p>, dòng "- " → <li>, cặp "Q: "/"A: " → hỏi đáp.
function renderBody(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let html = '';
  let inList = false;
  const closeList = () => {
    if (inList) html += '</ul>';
    inList = false;
  };

  for (const line of lines) {
    if (line.startsWith('- ')) {
      if (!inList) html += '<ul>';
      inList = true;
      html += `<li>${escapeHtml(line.slice(2))}</li>`;
    } else if (/^Q:\s*/i.test(line)) {
      closeList();
      html += `<p class="faq-q">${escapeHtml(line.replace(/^Q:\s*/i, ''))}</p>`;
    } else if (/^A:\s*/i.test(line)) {
      closeList();
      html += `<p class="faq-a">${escapeHtml(line.replace(/^A:\s*/i, ''))}</p>`;
    } else {
      closeList();
      html += `<p>${escapeHtml(line)}</p>`;
    }
  }
  closeList();
  return html;
}

// Hiển thị chuỗi datetime-local (YYYY-MM-DDTHH:mm) theo ngôn ngữ
function formatDateTime(value, lang = 'vi') {
  const d = new Date(value);
  if (isNaN(d)) return value || '';
  return d.toLocaleString(lang === 'en' ? 'en-GB' : 'vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

module.exports = { escapeHtml, renderBody, formatDateTime };
