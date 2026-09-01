// Đếm mã màu VIẾT CỨNG trong web + mobile, để ước lượng công đổi bảng màu.
// Màu nằm trong biến (--xxx hoặc COLORS.xxx) thì đổi 1 dòng là xong;
// màu viết cứng rải rác thì phải đi sửa từng chỗ. Script chỉ đọc.
import fs from 'node:fs';
import path from 'node:path';

const GOC = path.resolve(import.meta.dirname, '../..');
const HEX = /#[0-9a-fA-F]{6}\b/g;
const RGBA = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g;

function quet(thuMuc, duoi) {
  const ra = [];
  (function di(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) di(p);
      else if (duoi.some(x => e.name.endsWith(x))) ra.push(p);
    }
  })(thuMuc);
  return ra;
}

for (const [ten, thuMuc, duoi] of [
  ['WEB  (sabihome/src)', path.join(GOC, 'sabihome/src'), ['.ts', '.tsx', '.css']],
  ['MOBILE (homestay-mobile/src)', path.join(GOC, 'homestay-mobile/src'), ['.js']],
]) {
  if (!fs.existsSync(thuMuc)) { console.log(`\n${ten}: khong thay`); continue; }
  const files = quet(thuMuc, duoi);
  let hex = 0, rgba = 0;
  const theoFile = [];
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    const h = (s.match(HEX) || []).length;
    const r = (s.match(RGBA) || []).length;
    hex += h; rgba += r;
    if (h + r > 0) theoFile.push([path.relative(GOC, f), h + r]);
  }
  theoFile.sort((a, b) => b[1] - a[1]);
  console.log(`\n═══ ${ten} ═══`);
  console.log(`  ${files.length} file · ${hex} mã hex · ${rgba} rgba  →  tổng ${hex + rgba} chỗ viết cứng`);
  console.log('  Nặng nhất:');
  for (const [f, n] of theoFile.slice(0, 8)) console.log(`    ${String(n).padStart(4)}  ${f}`);
}
