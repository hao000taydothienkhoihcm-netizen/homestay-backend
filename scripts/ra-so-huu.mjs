// Rà: mọi route GHI có thực sự kiểm chủ sở hữu không?
//
// Vì sao cần: trước đây phần lớn route ghi chỉ ADMIN vào được, mà ADMIN là super-role
// (hostWhere bỏ lọc) nên quên kiểm host cũng không lộ ra. Từ lúc mở quyền cho HOST,
// mỗi route ghi thiếu kiểm chủ sở hữu là một lỗ thật: host B sửa được dữ liệu host A.
//
// Script đọc thân từng route và tìm dấu hiệu có kiểm host:
//   hostWhere / findOwn / updateOwn / deleteOwn / ownsRecord / ownHostId
// Chỉ đọc file, không đụng database.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '../src/routes');
const DAU_HIEU = /hostWhere|findOwn|updateOwn|deleteOwn|ownsRecord|ownHostId/;

// Route ghi nhưng KHÔNG đụng dữ liệu của host nào — không cần kiểm.
const MIEN = new Set([
  'auth.js POST /login',
  'auth.js POST /register',
  'sheet.js POST /preview',
]);

const rows = [];
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');

  // Cắt file theo từng lần khai báo router.<method>(...) để lấy thân route.
  const moc = [...src.matchAll(/router\.(get|post|patch|put|delete)\(\s*'([^']*)'/g)];
  for (let i = 0; i < moc.length; i++) {
    const [, method, p] = moc[i];
    if (method === 'get') continue;
    const dau = moc[i].index;
    const cuoi = i + 1 < moc.length ? moc[i + 1].index : src.length;
    const than = src.slice(dau, cuoi);

    const ten = `${f} ${method.toUpperCase()} ${p}`;
    if (MIEN.has(ten)) continue;
    rows.push({ ten, ok: DAU_HIEU.test(than) });
  }
}

const thieu = rows.filter(r => !r.ok);
console.log(`\nDA RA ${rows.length} route ghi (bo qua ${MIEN.size} route khong thuoc host nao)\n`);
if (thieu.length === 0) {
  console.log('OK - Tat ca deu co kiem chu so huu (hostWhere / findOwn / updateOwn / deleteOwn / ownsRecord).');
} else {
  console.log(`LOI - ${thieu.length} route KHONG thay dau hieu kiem chu so huu:\n`);
  for (const r of thieu) console.log(`   ${r.ten}`);
  console.log('\nMoi dong tren la mot cho host B co the dung du lieu host A. Phai xem lai tay.');
}
console.log('');
process.exit(thieu.length ? 1 : 0);
