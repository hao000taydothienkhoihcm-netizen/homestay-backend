import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });
const ma = process.argv[2] || 'G-001';
const can = (await db.home.findMany({ where: { desc: { startsWith: 'GOODSTAY' } } })).find((c) => c.desc.includes(ma));
if (!can) { console.log('không thấy', ma); process.exit(1); }
const t = (x) => (x == null ? '—' : x.toLocaleString('vi-VN'));
console.log(`#${can.id} ${can.name} · ${can.coCheHoaHong} · cuoiTuanGom ${can.cuoiTuanGom}`);
console.log(`  price(host nhận)  thường ${t(can.price)} · CT ${t(can.weekendPrice)} · lễ ${t(can.holidayPrice)}`);
console.log(`  floorPrice(chợ)   thường ${t(can.floorPrice)} · CT ${t(can.floorPriceWeekend)} · lễ ${t(can.floorPriceHoliday)}`);
console.log(`  mức kê            thường ${t(can.markupMin)} · max(cũ) ${t(can.markupMax)} · lễ ${t(can.markupHoliday)}`);
console.log(`  => giá bán        thường ${t((can.floorPrice||0)+(can.markupMin||0))} · CT ${t((can.floorPriceWeekend||0)+(can.markupMin||0))} · lễ ${t((can.floorPriceHoliday||0)+(can.markupHoliday??can.markupMin??0))}`);
console.log(`  lịch: ${can.lichNguon} ${can.lichLink || ''}`);
await db.$disconnect();
