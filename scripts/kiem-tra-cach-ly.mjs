// ═══════════════════════════════════════════════════════════════
// Kiểm tra cách ly multi-tenant — CHỈ ĐỌC, KHÔNG GHI GÌ VÀO DATABASE.
//
// Ý tưởng: deleteOwn/updateOwn thực chất là deleteMany/updateMany với
// `where: hostWhere(req, { id })`. Số dòng chúng đụng tới đúng bằng
// count() của cùng cái where. Nên đếm là biết được kết quả mà không phải ghi.
//
// Từ 09/2026: ADMIN KHÔNG còn là super-role thấy hết. Ngoài chế độ hỗ trợ admin
// thấy 0 dòng của mọi host; vào hỗ trợ host X (req.hoTroHostId = X) thì thấy đúng
// bằng chủ host X. Booking xoá là xoá mềm — client `src/prisma.js` tự giấu.
//
// Chạy:  node scripts/kiem-tra-cach-ly.mjs
// ═══════════════════════════════════════════════════════════════

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hostWhere, hostWhereTaiKhoan, hostHieuLuc } from '../src/middleware/auth.js';
import { prisma as prismaLoc } from '../src/prisma.js';

const prisma = new PrismaClient(); // thô, không lọc thùng rác — để đếm "sự thật"

// Giả lập req — không tạo tài khoản thật nào.
const nhu = (role, hostId, hoTroHostId = null) => ({ user: { role, hostId }, hoTroHostId });

const ADMIN_NGOAI = nhu('ADMIN', null);      // admin ngoài chế độ hỗ trợ — phải thấy 0
const ADMIN_HT1   = nhu('ADMIN', null, 1);   // admin đang hỗ trợ host#1 — thấy như chủ host#1
const ADMIN_HT9   = nhu('ADMIN', null, 999); // admin hỗ trợ host không tồn tại — 0
const QL_HOST1 = nhu('MANAGER', 1);   // quản lý của Sabi Home
const QL_HOST9 = nhu('MANAGER', 999); // host lạ — phải không thấy gì
const SALES    = nhu('SALES', null);  // chưa gán host — phải không thấy gì
const CHU_HOST1 = nhu('HOST', 1);     // chủ Sabi Home — thấy đủ nhà mình
const CHU_HOST9 = nhu('HOST', 999);   // chủ nhà khác — phải không thấy gì
const CHU_CHUA_GAN = nhu('HOST', null); // HOST chưa gán host — phải không thấy gì

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
const tong = {}, cua1 = {};
for (const [ten, m] of BANG) {
  tong[ten] = await m().count();
  cua1[ten] = await m().count({ where: { hostId: 1 } });
  const khongHost = await m().count({ where: { hostId: null } });
  console.log(`  ${ten.padEnd(16)} tổng ${String(tong[ten]).padStart(4)}  |  host#1 ${String(cua1[ten]).padStart(4)}  |  hostId rỗng ${khongHost}`);
  // hostId rỗng: với user là admin nền tảng (đúng thiết kế); bảng khác thì là lỗi.
  if (ten === 'user') {
    const adminRong = await m().count({ where: { hostId: null, role: 'ADMIN' } });
    bao(khongHost === adminRong, `user: ${khongHost} dòng thiếu hostId đều là ADMIN nền tảng (${adminRong})`);
  } else {
    bao(khongHost === 0, `${ten}: không còn dòng nào thiếu hostId`);
  }
}

console.log('\n═══ 2. ADMIN NGOÀI CHẾ ĐỘ HỖ TRỢ KHÔNG THẤY GÌ CỦA HOST ═══');
for (const [ten, m] of BANG) {
  if (ten === 'user') continue; // user xử lý riêng ở 2b
  const n = await m().count({ where: hostWhere(ADMIN_NGOAI) });
  bao(n === 0, `${ten}: admin ngoài hỗ trợ thấy ${n} dòng (phải là 0)`);
}
{
  // Tài khoản là ngoại lệ: admin ngoài hỗ trợ quản được MỌI tài khoản (mở/khoá, reset).
  const n = await prisma.user.count({ where: hostWhereTaiKhoan(ADMIN_NGOAI) });
  bao(n === tong.user, `user: admin ngoài hỗ trợ thấy ${n}/${tong.user} tài khoản (quản trị nền tảng)`);
  bao(hostHieuLuc(ADMIN_NGOAI) === null, 'hostHieuLuc(admin ngoài hỗ trợ) = null');
}

console.log('\n═══ 2b. ADMIN TRONG CHẾ ĐỘ HỖ TRỢ = CHỦ HOST ĐÓ ═══');
for (const [ten, m] of BANG) {
  const ht = await m().count({ where: hostWhere(ADMIN_HT1) });
  const chu = await m().count({ where: hostWhere(CHU_HOST1) });
  bao(ht === chu && ht === cua1[ten], `${ten}: admin hỗ trợ host#1 thấy ${ht} = chủ host#1 ${chu} = thật ${cua1[ten]}`);
  const la = await m().count({ where: hostWhere(ADMIN_HT9) });
  bao(la === 0, `${ten}: admin hỗ trợ host#999 thấy ${la} (phải là 0)`);
}
bao(hostHieuLuc(ADMIN_HT1) === 1, 'hostHieuLuc(admin hỗ trợ host#1) = 1');
{
  const n = await prisma.user.count({ where: hostWhereTaiKhoan(ADMIN_HT1) });
  bao(n === cua1.user, `user: admin trong hỗ trợ chỉ thấy tài khoản host#1 (${n}/${cua1.user})`);
}

console.log('\n═══ 3. QUẢN LÝ HOST#1 THẤY ĐỦ DỮ LIỆU NHÀ MÌNH ═══');
for (const [ten, m] of BANG) {
  const n = await m().count({ where: hostWhere(QL_HOST1) });
  bao(n === cua1[ten], `${ten}: quản lý host#1 thấy ${n}/${cua1[ten]}`);
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
for (const [ten, m] of BANG) {
  const mau = await m().findFirst({ where: { hostId: 1 }, select: { id: true } });
  if (!mau) { console.log(`  (bỏ qua ${ten} — host#1 không có dòng nào)`); continue; }

  const voiToi   = await m().count({ where: hostWhere(QL_HOST9, { id: mau.id }) });
  const chinhChu = await m().count({ where: hostWhere(QL_HOST1, { id: mau.id }) });
  const adminNgoai = await m().count({ where: hostWhere(ADMIN_NGOAI, { id: mau.id }) });
  const adminHT  = await m().count({ where: hostWhere(ADMIN_HT1, { id: mau.id }) });

  bao(voiToi === 0,   `${ten}#${mau.id}: host lạ sửa/xoá được ${voiToi} dòng (phải là 0)`);
  bao(chinhChu === 1, `${ten}#${mau.id}: chính chủ vẫn sửa/xoá được (${chinhChu})`);
  bao(adminNgoai === 0, `${ten}#${mau.id}: admin ngoài hỗ trợ sửa/xoá được ${adminNgoai} (phải là 0)`);
  bao(adminHT === 1, `${ten}#${mau.id}: admin đang hỗ trợ host#1 sửa/xoá được (${adminHT})`);
}

console.log('\n═══ 6b. VAI HOST — quyền ghi ngang admin nhưng phải bị lọc ═══');
for (const [ten, m] of BANG) {
  const chinhChu = await m().count({ where: hostWhere(CHU_HOST1) });
  const hostLa   = await m().count({ where: hostWhere(CHU_HOST9) });
  const chuaGan  = await m().count({ where: hostWhere(CHU_CHUA_GAN) });
  bao(chinhChu === cua1[ten], `${ten}: chủ host#1 thấy ${chinhChu}/${cua1[ten]} (đủ nhà mình)`);
  bao(hostLa === 0,  `${ten}: chủ host#999 thấy ${hostLa} dòng (phải là 0)`);
  bao(chuaGan === 0, `${ten}: HOST chưa gán host thấy ${chuaGan} dòng (phải là 0)`);
}

console.log('\n═══ 7. GIÁ THEO THÁNG / THEO NGÀY ═══');
// Hai bảng này lọc qua homeId chứ không tự mang hostId trong route,
// nên kiểm bằng đường vòng: căn nhà phải thuộc host thì mới với tới bảng giá.
const homeLa = await prisma.home.findFirst({ where: hostWhere(QL_HOST9), select: { id: true } });
bao(homeLa === null, `host lạ không lấy được căn nhà nào để lần ra bảng giá`);
const homeAdmin = await prisma.home.findFirst({ where: hostWhere(ADMIN_NGOAI), select: { id: true } });
bao(homeAdmin === null, `admin ngoài hỗ trợ không lấy được căn nhà nào`);
const homeThat = await prisma.home.findFirst({ where: hostWhere(QL_HOST1), select: { id: true, name: true } });
bao(homeThat !== null, `chính chủ vẫn lấy được căn nhà (${homeThat?.name})`);

console.log('\n═══ 8. THÙNG RÁC BOOKING — client lọc phải giấu booking đã xoá ═══');
{
  const thoTong = await prisma.booking.count();
  const thoRac  = await prisma.booking.count({ where: { deletedAt: { not: null } } });
  const locThay = await prismaLoc.booking.count();
  bao(locThay === thoTong - thoRac, `client lọc thấy ${locThay} = tổng ${thoTong} − rác ${thoRac}`);
  const locRac = await prismaLoc.booking.count({ where: { deletedAt: { not: null } } });
  bao(locRac === thoRac, `client lọc vẫn liệt kê được thùng rác khi hỏi rõ deletedAt (${locRac})`);
  const locHost1 = await prismaLoc.booking.count({ where: hostWhere(CHU_HOST1) });
  const thoHost1Song = await prisma.booking.count({ where: { hostId: 1, deletedAt: null } });
  bao(locHost1 === thoHost1Song, `chủ host#1 qua client lọc thấy ${locHost1} booking đang sống (thật ${thoHost1Song})`);
}

console.log('\n' + '═'.repeat(55));
console.log(loi === 0 ? '  TẤT CẢ ĐỀU ĐÚNG — không ghi gì vào database.' : `  CÓ ${loi} MỤC SAI — xem lại ở trên.`);
console.log('═'.repeat(55) + '\n');

await prisma.$disconnect();
await prismaLoc.$disconnect();
process.exitCode = loi === 0 ? 0 : 1;
