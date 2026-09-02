// ═══════════════════════════════════════════════════════════════
// Kiểm tra cách ly multi-tenant — CHỈ ĐỌC, KHÔNG GHI GÌ VÀO DATABASE.
//
// Ý tưởng: deleteOwn/updateOwn thực chất là deleteMany/updateMany với
// `where: hostWhere(req, { id })`. Số dòng chúng đụng tới đúng bằng
// count() của cùng cái where. Nên đếm là biết được kết quả mà không phải ghi.
//
// Chạy:  node scripts/kiem-tra-cach-ly.mjs
// ═══════════════════════════════════════════════════════════════

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hostWhere } from '../src/middleware/auth.js';

const prisma = new PrismaClient();

// Giả lập req.user — không tạo tài khoản thật nào.
const nhu = (role, hostId) => ({ user: { role, hostId } });

const ADMIN    = nhu('ADMIN', 1);     // super-role, phải thấy hết
const QL_HOST1 = nhu('MANAGER', 1);   // quản lý của Sabi Home
const QL_HOST9 = nhu('MANAGER', 999); // host lạ — phải không thấy gì
const SALES    = nhu('SALES', null);  // chưa gán host — phải không thấy gì

const BANG = [
  ['booking',          () => prisma.booking],
  ['home',             () => prisma.home],
  ['expense',          () => prisma.expense],
  ['holiday',          () => prisma.holiday],
  ['chargeTemplate',   () => prisma.chargeTemplate],
  ['stockEntry',       () => prisma.stockEntry],
  ['user',             () => prisma.user],
];

let loi = 0;
const bao = (ok, msg) => { if (!ok) loi++; console.log(`${ok ? '  OK  ' : ' SAI  '} ${msg}`); };

console.log('\n═══ 1. TỔNG QUAN DỮ LIỆU THẬT ═══');
const tong = {};
for (const [ten, m] of BANG) {
  tong[ten] = await m().count();
  const cuaHost1 = await m().count({ where: { hostId: 1 } });
  const khongHost = await m().count({ where: { hostId: null } });
  console.log(`  ${ten.padEnd(16)} tổng ${String(tong[ten]).padStart(4)}  |  host#1 ${String(cuaHost1).padStart(4)}  |  hostId rỗng ${khongHost}`);
  // hostId rỗng là mối lo: nhân viên (không phải admin) sẽ không thấy những dòng này.
  bao(khongHost === 0, `${ten}: không còn dòng nào thiếu hostId`);
}

console.log('\n═══ 2. ADMIN VẪN THẤY TOÀN BỘ (không được lọt regression) ═══');
for (const [ten, m] of BANG) {
  const n = await m().count({ where: hostWhere(ADMIN) });
  bao(n === tong[ten], `${ten}: admin thấy ${n}/${tong[ten]}`);
}

console.log('\n═══ 3. QUẢN LÝ HOST#1 VẪN THẤY ĐỦ DỮ LIỆU NHÀ MÌNH ═══');
for (const [ten, m] of BANG) {
  const n = await m().count({ where: hostWhere(QL_HOST1) });
  bao(n === tong[ten], `${ten}: quản lý host#1 thấy ${n}/${tong[ten]}`);
}

console.log('\n═══ 4. HOST LẠ KHÔNG THẤY GÌ ═══');
for (const [ten, m] of BANG) {
  const n = await m().count({ where: hostWhere(QL_HOST9) });
  bao(n === 0, `${ten}: host#999 thấy ${n} dòng (phải là 0)`);
}

console.log('\n═══ 5. TÀI KHOẢN CHƯA GÁN HOST KHÔNG THẤY GÌ ═══');
for (const [ten, m] of BANG) {
  const n = await m().count({ where: hostWhere(SALES) });
  bao(n === 0, `${ten}: sales chưa gán host thấy ${n} dòng (phải là 0)`);
}

console.log('\n═══ 6. MÔ PHỎNG XOÁ/SỬA THEO ID — host lạ gõ đại id có thật ═══');
// Lấy id thật đang tồn tại, rồi đếm xem host lạ có "với" tới được không.
for (const [ten, m] of BANG) {
  const mau = await m().findFirst({ select: { id: true } });
  if (!mau) { console.log(`  (bỏ qua ${ten} — bảng rỗng)`); continue; }

  const voiToi   = await m().count({ where: hostWhere(QL_HOST9, { id: mau.id }) });
  const chinhChu = await m().count({ where: hostWhere(QL_HOST1, { id: mau.id }) });

  bao(voiToi === 0,   `${ten}#${mau.id}: host lạ sửa/xoá được ${voiToi} dòng (phải là 0)`);
  bao(chinhChu === 1, `${ten}#${mau.id}: chính chủ vẫn sửa/xoá được (${chinhChu})`);
}

console.log('\n═══ 7. GIÁ THEO THÁNG / THEO NGÀY ═══');
// Hai bảng này lọc qua homeId chứ không tự mang hostId trong route,
// nên kiểm bằng đường vòng: căn nhà phải thuộc host thì mới với tới bảng giá.
const homeLa = await prisma.home.findFirst({ where: hostWhere(QL_HOST9), select: { id: true } });
bao(homeLa === null, `host lạ không lấy được căn nhà nào để lần ra bảng giá`);

const homeThat = await prisma.home.findFirst({ where: hostWhere(QL_HOST1), select: { id: true, name: true } });
bao(homeThat !== null, `chính chủ vẫn lấy được căn nhà (${homeThat?.name})`);

console.log('\n' + '═'.repeat(55));
console.log(loi === 0 ? '  TẤT CẢ ĐỀU ĐÚNG — không ghi gì vào database.' : `  CÓ ${loi} MỤC SAI — xem lại ở trên.`);
console.log('═'.repeat(55) + '\n');

await prisma.$disconnect();
process.exit(loi === 0 ? 0 : 1);
