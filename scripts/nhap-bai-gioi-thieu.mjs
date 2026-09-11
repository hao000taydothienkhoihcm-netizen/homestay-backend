// Đổ BÀI GIỚI THIỆU từ rổ GOODSTAY vào cột salesInfo — đợt nhập 116 căn trước bỏ quên cột này,
// nên hiện chỉ 1/117 căn có bài, mà bài chính là thứ Sales bấm "Gửi khách".
//
// GIỮ NGUYÊN CHỮ CỦA CHỦ NHÀ. Máy không tự sửa văn người ta — chỉ ĐẾM và LIỆT KÊ chỗ lộ
// (tên căn, số nhà, link Maps, số điện thoại) để màn khai căn tô đỏ cho bạn sửa tay từng căn.
// Luật đã chốt: bài chào khách tuyệt đối không được có tên căn / địa chỉ; khách chưa cọc mà
// biết nhà nào là tự đi đặt thẳng, Sales mất công không.
//
//   node scripts/nhap-bai-gioi-thieu.mjs         -> xem trước
//   node scripts/nhap-bai-gioi-thieu.mjs --ghi   -> ghi vào NHÁNH THỬ
import 'dotenv/config';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const GHI = process.argv.includes('--ghi');
const url = process.env.DATABASE_URL_THU;
if (!url) { console.error('✕ Thiếu DATABASE_URL_THU'); process.exit(1); }
const host = (u) => (u.match(/@([^/]+)/) || [, '?'])[1];
if (host(url) === host(process.env.DATABASE_URL || '')) { console.error('✕ Cùng endpoint với production. Dừng.'); process.exit(1); }
const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });

const gon = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd').replace(/[^a-z0-9]/gi, '').toLowerCase();

/** Cùng một bộ luật với màn khai căn (CanNhaModal.tsx · loBai) — hai bên phải đếm giống nhau. */
function soiLo(bai, ten, diaChi) {
  const ra = [];
  const g = gon(bai);
  const t = gon(ten);
  if (t.length >= 5 && g.includes(t)) ra.push('tên căn');
  const soNha = (String(diaChi || '').match(/\b\d+[A-Za-z]?(\s*\/\s*\d+[A-Za-z]?)*\b/) || [])[0];
  if (soNha && soNha.length >= 2) {
    const re = new RegExp('(^|[^\\d])' + soNha.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*') + '([^\\d]|$)');
    if (re.test(bai)) ra.push('số nhà');
  }
  if ((bai.match(/https?:\/\/\S+/gi) || []).some((u) => /maps|goo\.gl|geo|g\.page/i.test(u))) ra.push('link bản đồ');
  if ((bai.match(/(?:^|[^\d])(0\d{8,10})(?![\d])/g) || []).length) ra.push('số điện thoại');
  return ra;
}

const ro = JSON.parse(fs.readFileSync(new URL('./du-lieu/ro-hang-goodstay.json', import.meta.url), 'utf8'));
const baiTheoMa = new Map(ro.filter((x) => x.gioiThieu && x.gioiThieu.trim()).map((x) => [x.ma, x.gioiThieu.trim()]));

const can = await db.home.findMany({
  where: { desc: { startsWith: 'GOODSTAY' } },
  select: { id: true, name: true, desc: true, address: true, salesInfo: true },
  orderBy: { id: 'asc' },
});

let ghi = 0, boQua = 0, daCo = 0;
const demLo = new Map();
const dsLo = [];
for (const c of can) {
  const ma = (c.desc.match(/G-\d+/) || [])[0];
  const bai = ma ? baiTheoMa.get(ma) : null;
  if (!bai) { boQua++; continue; }
  if (c.salesInfo && c.salesInfo.trim().length > bai.length * 0.8) { daCo++; continue; }  // đã có bài dài hơn -> không đè

  const lo = soiLo(bai, c.name, c.address);
  for (const x of lo) demLo.set(x, (demLo.get(x) || 0) + 1);
  if (lo.length) dsLo.push({ ma, ten: c.name, lo });
  ghi++;
  if (GHI) await db.home.update({ where: { id: c.id }, data: { salesInfo: bai.slice(0, 5000) } });
}

console.log(`${can.length} căn · ghi bài: ${ghi} · đã có bài riêng, giữ nguyên: ${daCo} · rổ không có bài: ${boQua}`);
console.log(`\nChỗ lộ (màn khai căn sẽ tô đỏ để bạn sửa tay):`);
for (const [k, v] of [...demLo].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)} bài lộ ${k}`);
console.log(`  => ${dsLo.length}/${ghi} bài cần sửa, ${ghi - dsLo.length} bài sạch sẵn.`);
console.log('\n20 căn cần sửa trước:');
for (const x of dsLo.slice(0, 20)) console.log(`  ${x.ma} ${x.ten.slice(0, 30).padEnd(30)} ${x.lo.join(', ')}`);
console.log(GHI ? '\nĐã ghi.' : '\nThêm --ghi để ghi thật.');
await db.$disconnect();
