// Ba nơi cùng khai báo nhóm vai trò, phải giống hệt nhau:
//   backend  src/middleware/auth.js        <- nơi CHẶN thật
//   web      sabihome/src/lib/quyen.ts     <- khoá nút
//   mobile   homestay-mobile/src/utils/quyen.js
//
// Lệch một bên là sinh ra một trong hai lỗi khó chịu:
//   giao diện rộng hơn backend -> host bấm nút xong ăn 403, không hiểu vì sao
//   giao diện hẹp hơn backend  -> host có quyền thật mà không thấy nút nào
//
// Backend là nguồn sự thật; hai bên kia phải theo.
// Chỉ đọc file, không đụng database. Lệch thì thoát mã 1.
import fs from 'node:fs';
import path from 'node:path';

const GOC = path.resolve(import.meta.dirname, '..');       // homestay-backend
const CHA = path.resolve(GOC, '..');                       // thư mục chứa cả 3 dự án

const NGUON = [
  { ten: 'backend', duong: path.join(GOC, 'src/middleware/auth.js') },
  { ten: 'web', duong: path.join(CHA, 'sabihome/src/lib/quyen.ts') },
  { ten: 'mobile', duong: path.join(CHA, 'homestay-mobile/src/utils/quyen.js') },
];

const CAN_CO = ['CHU_WORKSPACE', 'QUAN_LY', 'VAN_HANH'];

function doc(duong) {
  const src = fs.readFileSync(duong, 'utf8');
  const out = {};
  for (const m of src.matchAll(/export const ([A-Z_]+)\s*=\s*\[([^\]]*)\]/g)) {
    out[m[1]] = m[2].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean);
  }
  return out;
}

const thieuFile = NGUON.filter((n) => !fs.existsSync(n.duong));
if (thieuFile.length) {
  console.log('\nKHONG TIM THAY FILE:');
  for (const n of thieuFile) console.log(`   ${n.ten}: ${n.duong}`);
  console.log('\nChay script nay tu trong homestay-backend, va 3 du an phai nam cung mot thu muc cha.\n');
  process.exit(1);
}

const bang = Object.fromEntries(NGUON.map((n) => [n.ten, doc(n.duong)]));
const lech = [];

for (const nhom of CAN_CO) {
  const chuan = bang.backend[nhom];
  if (!chuan) { lech.push(`backend thieu nhom ${nhom}`); continue; }
  for (const ten of ['web', 'mobile']) {
    const co = bang[ten][nhom];
    if (!co) { lech.push(`${ten} thieu nhom ${nhom}`); continue; }
    if (co.join(',') !== chuan.join(',')) {
      lech.push(`${nhom}: backend [${chuan.join(', ')}]  !=  ${ten} [${co.join(', ')}]`);
    }
  }
}

console.log('');
for (const nhom of CAN_CO) {
  console.log(`  ${nhom.padEnd(14)} ${(bang.backend[nhom] || ['?']).join(', ')}`);
}
console.log('');

if (lech.length === 0) {
  console.log('OK - backend / web / mobile khai bao giong het nhau.\n');
  process.exit(0);
}
console.log(`LECH - ${lech.length} cho khong khop:\n`);
for (const d of lech) console.log(`   ${d}`);
console.log('\nBackend la nguon su that. Sua web/mobile cho khop roi chay lai.\n');
process.exit(1);
