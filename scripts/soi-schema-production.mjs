// CHỈ ĐỌC. Xem production đã có những cột/migration mới hay chưa — để biết đẩy code lên
// Render có gãy không. Không ghi một chữ nào vào production.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } }, log: ['error'] });

const daChay = await db.$queryRawUnsafe(
  `SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at`
).catch(() => null);
const tenDaChay = new Set((daChay || []).map((r) => r.migration_name));

const coTrongRepo = fs.readdirSync('prisma/migrations', { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

console.log(`Production đã chạy ${tenDaChay.size} migration · repo có ${coTrongRepo.length}`);
const thieu = coTrongRepo.filter((m) => !tenDaChay.has(m));
if (!thieu.length) console.log('✓ Production đã có đủ mọi migration trong repo — đẩy code lên là chạy được ngay.');
else {
  console.log(`\n⚠ Production CÒN THIẾU ${thieu.length} migration:`);
  for (const m of thieu) console.log('   ' + m);
  console.log('\n   Đẩy code mới lên mà chưa chạy `npx prisma migrate deploy` thì backend sẽ');
  console.log('   hỏi cột chưa tồn tại -> lỗi 500 ở mọi màn có dùng cột đó.');
}

// Soi thẳng vài cột mới nhất cho chắc
const cot = await db.$queryRawUnsafe(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'Home'`
).catch(() => []);
const co = new Set(cot.map((r) => r.column_name));
const CAN = ['kmTrungTam', 'lat', 'lng', 'viTriUocChung', 'mapLink', 'lichNguon', 'lichLink', 'lichSheetTab', 'lichSheetCot', 'floorPriceWeekend', 'markupHoliday', 'cuoiTuanGom', 'rules', 'salesInfo'];
console.log('\nCột bảng Home trên production:');
for (const c of CAN) console.log(`   ${co.has(c) ? '✓' : '✕ THIẾU'}  ${c}`);

const n = await db.home.count();
const ban = await db.home.count({ where: { choTrangThai: 'DANG_BAN' } }).catch(() => '?');
console.log(`\nDữ liệu production: ${n} căn · ${ban} căn đang bán (không bị đụng tới, mọi script đều chặn ghi vào production)`);
await db.$disconnect();
