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

// File nào khoá cả router ở đúng mức ADMIN thì miễn kiểm chủ sở hữu.
// Lý do: ADMIN là super-role, hostWhere() cố tình BỎ lọc cho họ — nên đòi
// hostWhere ở đây là vô nghĩa. Điển hình là routes/hosts.js: nó thao tác TRÊN
// các host, không phải trên dữ liệu bên trong một host.
// Chỉ miễn khi danh sách vai đúng bằng ADMIN; thêm bất kỳ vai nào khác là
// hết miễn, vì lúc đó lại có vai bị lọc đi qua đây.
const chiAdmin = (src) => {
  const m = src.match(/router\.use\(requireRole\(([^)]*)\)\)/);
  if (!m) return false;
  const vai = m[1].split(',').map((s) => s.replace(/['"\s.]/g, '')).filter(Boolean);
  return vai.length === 1 && vai[0] === 'ADMIN';
};

const rows = [];
const mienVìAdmin = [];
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  if (chiAdmin(src)) { mienVìAdmin.push(f); continue; }

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
console.log(`\nDA RA ${rows.length} route ghi (bo qua ${MIEN.size} route khong thuoc host nao)`);
if (mienVìAdmin.length) {
  console.log(`Mien vi khoa ca router o dung muc ADMIN: ${mienVìAdmin.join(', ')}`);
}
console.log('');
if (thieu.length === 0) {
  console.log('OK - Tat ca deu co kiem chu so huu (hostWhere / findOwn / updateOwn / deleteOwn / ownsRecord).');
} else {
  console.log(`LOI - ${thieu.length} route KHONG thay dau hieu kiem chu so huu:\n`);
  for (const r of thieu) console.log(`   ${r.ten}`);
  console.log('\nMoi dong tren la mot cho host B co the dung du lieu host A. Phai xem lai tay.');
}
console.log('');
process.exit(thieu.length ? 1 : 0);
