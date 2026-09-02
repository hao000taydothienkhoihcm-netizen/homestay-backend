// Liệt kê mọi route GHI (POST/PATCH/PUT/DELETE) và vai trò nào được phép.
// Trả lời câu: "một tài khoản vai HOST làm được những gì?"
// Chỉ đọc file, không đụng database.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '../src/routes');
const RE = /router\.(get|post|patch|put|delete)\(\s*'([^']*)'\s*,?\s*([\s\S]{0,120})/g;

// Route viết requireRole(...QUAN_LY) chứ không liệt kê tay từng vai.
// Đọc thẳng định nghĩa nhóm trong middleware/auth.js để bung ra danh sách thật —
// tự đọc file thay vì chép cứng, để sửa nhóm bên kia là báo cáo này đúng theo.
const AUTH = fs.readFileSync(path.resolve(import.meta.dirname, '../src/middleware/auth.js'), 'utf8');
const NHOM = {};
for (const m of AUTH.matchAll(/export const ([A-Z_]+)\s*=\s*\[([^\]]*)\]/g)) {
  NHOM[m[1]] = m[2].replace(/['\s]/g, '');
}
const bung = (s) => s.replace(/\.{3}([A-Z_]+)/g, (all, ten) => NHOM[ten] ?? all);

const rows = [];
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  // requireRole đặt ở router.use(...) áp cho cả file
  const chung = src.match(/router\.use\(requireRole\(([^)]*)\)\)/);
  const roleChung = chung ? bung(chung[1].replace(/['\s]/g, '')) : null;

  for (const m of src.matchAll(RE)) {
    const [, method, p, sau] = m;
    if (method === 'get') continue;                 // chỉ quan tâm route GHI
    const r = sau.match(/requireRole\(([^)]*)\)/);
    const roles = r ? bung(r[1].replace(/['\s]/g, '')) : (roleChung || 'MỌI VAI ĐĂNG NHẬP');
    rows.push({ file: f, method: method.toUpperCase(), path: p, roles });
  }
}

const coHost = rows.filter(r => r.roles.includes('HOST') || r.roles === 'MỌI VAI ĐĂNG NHẬP');
const khongHost = rows.filter(r => !coHost.includes(r));

const in_ = (list) => list.map(r =>
  `  ${r.method.padEnd(6)} ${(r.file.replace('.js', '') + r.path).padEnd(34)} ${r.roles}`
).join('\n');

console.log(`\nTỔNG SỐ ROUTE GHI: ${rows.length}\n`);
console.log(`═══ Vai HOST LÀM ĐƯỢC (${coHost.length}) ═══`);
console.log(coHost.length ? in_(coHost) : '  (không có route nào)');
console.log(`\n═══ Vai HOST BỊ CHẶN (${khongHost.length}) ═══`);
console.log(in_(khongHost));
console.log('');
