import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });
const can = await db.home.findMany({
  where: { desc: { startsWith: 'GOODSTAY' } },
  select: { id: true, name: true, address: true, salesInfo: true, rules: true, salesTitle: true,
            coCheHoaHong: true, floorPrice: true, markupMin: true, markupMax: true, listPrice: true,
            commissionPct: true, caretakerPhone: true, albumUrl: true, coverImages: true,
            amenities: true, lichNguon: true, choTrangThai: true },
});
const d = (f) => can.filter(f).length;
console.log(`${can.length} căn GOODSTAY`);
console.log(`  có bài giới thiệu : ${d(c => c.salesInfo && c.salesInfo.trim())}`);
console.log(`  có quy định căn   : ${d(c => c.rules && c.rules.trim())}`);
console.log(`  có tiêu đề bán    : ${d(c => c.salesTitle && c.salesTitle.trim())}`);
console.log(`  có SĐT đón khách  : ${d(c => c.caretakerPhone)}`);
console.log(`  có link album     : ${d(c => c.albumUrl)}   · có ảnh bìa: ${d(c => (c.coverImages||[]).length)}`);
console.log(`  có tiện ích       : ${d(c => (c.amenities||[]).length)}`);
console.log(`  cơ chế GIA_SAN    : ${d(c => c.coCheHoaHong === 'GIA_SAN')} · PHAN_TRAM ${d(c => c.coCheHoaHong === 'PHAN_TRAM')} · chưa chọn ${d(c => !c.coCheHoaHong)}`);
console.log(`  GIA_SAN có mức kê : ${d(c => c.coCheHoaHong === 'GIA_SAN' && c.markupMin)} / ${d(c => c.coCheHoaHong === 'GIA_SAN')}`);
console.log(`  markupMax != min  : ${d(c => c.markupMax && c.markupMin && c.markupMax !== c.markupMin)}`);
console.log(`  lichNguon SHEET   : ${d(c => c.lichNguon === 'SHEET')} · APP ${d(c => c.lichNguon === 'APP')} · trống ${d(c => !c.lichNguon)}`);
// Bài giới thiệu có lộ tên căn / địa chỉ không?
const lo = can.filter(c => c.salesInfo && c.name && c.salesInfo.toLowerCase().includes(c.name.toLowerCase().slice(0, 12)));
console.log(`  bài LỘ tên căn    : ${lo.length}`);
const m = can.find(c => c.salesInfo);
if (m) console.log(`\nVí dụ bài của ${m.name}:\n---\n${m.salesInfo.slice(0, 400)}\n---`);
await db.$disconnect();
