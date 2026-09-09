// So dữ liệu production hiện tại với bản sao lưu mới nhất: có dòng nào biến mất không.
// Chỉ đọc, không ghi.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const db = new PrismaClient({ log: ['error'] });

const thuMuc = 'E:/project/homestay/_sao-luu';
const ten = fs.readdirSync(thuMuc).filter((f) => f.endsWith('.json.gz')).sort().pop();
const sao = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(thuMuc, ten))));
const B = sao.bang || {};
console.log('Bản sao lưu:', ten, '· tạo lúc', sao.taoLuc, '\n');

let mat = 0;
for (const b of ['home', 'booking', 'expense', 'user', 'charge', 'stockEntry']) {
  const cu = (B[b] || []).map((r) => r.id);
  const moi = (await db[b].findMany({ select: { id: true } })).map((r) => r.id);
  const setMoi = new Set(moi);
  const thieu = cu.filter((id) => !setMoi.has(id));
  const setCu = new Set(cu);
  const them = moi.filter((id) => !setCu.has(id));
  mat += thieu.length;
  console.log(`  ${b.padEnd(12)} sao lưu ${String(cu.length).padStart(3)} · hiện ${String(moi.length).padStart(3)}` +
    (thieu.length ? `   ✕ MẤT ${thieu.length} dòng: ${thieu.join(',')}` : '   ✓ còn đủ') +
    (them.length ? `   · mới thêm: ${them.join(',')}` : ''));
}

console.log('\n3 booking mới nhất:');
for (const b of await db.booking.findMany({
  orderBy: { id: 'desc' }, take: 3,
  select: { id: true, guest: true, checkIn: true, createdAt: true, source: true, homeId: true },
})) {
  console.log('   #' + b.id, '·', new Date(b.createdAt).toISOString().replace('T', ' ').slice(0, 16),
    'UTC · nguồn', b.source, '· căn', b.homeId, '·', b.guest);
}

const xoaMem = await db.booking.count({ where: { deletedAt: { not: null } } });
console.log('\nBooking đã xoá mềm:', xoaMem);

const daDien = await db.home.count({
  where: { OR: [{ listPriceWeekend: { not: null } }, { floorPriceWeekend: { not: null } }, { lichNguon: { not: null } }] },
});
console.log('Căn đã có dữ liệu ở cột mới:', daDien, '(phải là 0 — chưa code nào ghi)');

await db.$disconnect();
console.log(mat ? '\n✕ CÓ DÒNG BỊ MẤT' : '\n✅ Không mất dòng nào so với bản sao lưu.');
