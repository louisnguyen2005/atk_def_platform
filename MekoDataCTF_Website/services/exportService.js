const ExcelJS = require('exceljs');

const HEADERS = ['STT đội', 'Tên đội', 'Email đội', 'Trường / Khoa', 'SĐT', 'Vai trò', 'Họ và tên', 'MSSV', 'Ngày đăng ký'];

// Mỗi dòng là một thành viên, kèm thông tin đội
function toRows(teams) {
  const rows = [];
  teams.forEach((team, i) => {
    team.members.forEach((m) => {
      rows.push([
        i + 1,
        team.name,
        team.email,
        team.school,
        team.phone,
        m.is_leader ? 'Đội trưởng' : 'Thành viên',
        m.full_name,
        m.student_id,
        team.created_at,
      ]);
    });
  });
  return rows;
}

async function buildXlsx(teams) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekoDataCTF';
  wb.created = new Date();

  const ws = wb.addWorksheet('Danh sách thí sinh');
  ws.addRow(HEADERS);
  toRows(teams).forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E5E6F' } };
  ws.columns.forEach((col, i) => {
    col.width = [8, 24, 28, 28, 14, 12, 26, 14, 20][i];
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: 'I1' };

  const summary = wb.addWorksheet('Tổng hợp đội');
  summary.addRow(['STT', 'Tên đội', 'Email', 'Trường / Khoa', 'SĐT', 'Số thành viên', 'Đội trưởng', 'Ngày đăng ký']);
  teams.forEach((t, i) => {
    const leader = t.members.find((m) => m.is_leader);
    summary.addRow([i + 1, t.name, t.email, t.school, t.phone, t.members.length, leader ? leader.full_name : '', t.created_at]);
  });
  summary.getRow(1).font = { bold: true };
  summary.columns.forEach((col, i) => (col.width = [6, 24, 28, 28, 14, 14, 26, 20][i]));

  return wb.xlsx.writeBuffer();
}

function csvCell(value) {
  let s = String(value ?? '');
  // Chặn CSV/formula injection khi mở bằng Excel
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(teams) {
  const lines = [HEADERS, ...toRows(teams)].map((r) => r.map(csvCell).join(','));
  // BOM để Excel nhận đúng UTF-8 tiếng Việt
  return '﻿' + lines.join('\r\n');
}

module.exports = { buildXlsx, buildCsv };
