// Kiểm nhánh thử sau khi áp migration: đủ cột mới, đủ enum, dữ liệu cũ còn nguyên.
// Dùng: node scripts/kiem-cot-moi.mjs           -> kiểm NHÁNH THỬ (DATABASE_URL_THU)
//       node scripts/kiem-cot-moi.mjs --that    -> kiểm PRODUCTION (chỉ đọc, không ghi gì)
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const thatSu = process.argv.includes('--that');
const url = thatSu ? process.env.DATABASE_URL : process.env.DATABASE_URL_THU;
if (!url) { console.error('✕ Thiếu ' + (thatSu ? 'DATABASE_URL' : 'DATABASE_URL_THU')); process.exit(1); }

const COT = [
  'listPriceWeekend', 'listPriceHoliday', 'floorPriceWeekend', 'floorPriceHoliday', 'markupHoliday',
  'lichNguon', 'lichLink', 'lichSheetTab', 'lichSheetCot', 'lichKey',
  'lichDongBoLuc', 'lichLoiTu', 'lichNhatKy',
];

const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });
console.log((thatSu ? 'PRODUCTION' : 'NHÁNH THỬ') + ':', (url.match(/@([^/]+)/) || [, '?'])[1], '\n');

let hong = 0;
try {
  const cot = await db.$queryRawUnsafe(
    `SELECT column_name, is_nullable FROM information_schema.columns
     WHERE table_name = 'Home' AND column_name = ANY($1::text[])`, COT);
  const co = new Map(cot.map((r) => [r.column_name, r.is_nullable]));
  for (const k of COT) {
    if (!co.has(k)) { console.log('  ✕ thiếu cột', k); hong++; }
    else if (co.get(k) !== 'YES') { console.log('  ✕ cột', k, 'KHÔNG nullable — sai'); hong++; }
  }
  if (!hong) console.log('  OK   đủ 13 cột mới, tất cả đều nullable');

  const en = await db.$queryRawUnsafe(
    `SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'ChoNguonLich' ORDER BY e.enumsortorder`);
  const nhan = en.map((r) => r.enumlabel).join(',');
  if (nhan === 'APP,ICAL,SCRIPT,SHEET') console.log('  OK   enum ChoNguonLich đúng 4 giá trị');
  else { console.log('  ✕ enum ChoNguonLich sai:', nhan || '(không có)'); hong++; }

  const [h, b, e, u] = await Promise.all([
    db.home.count(), db.booking.count(), db.expense.count(), db.user.count(),
  ]);
  console.log(`  OK   dữ liệu: ${h} căn · ${b} booking · ${e} thu chi · ${u} tài khoản`);
  if (h !== 9 || b !== 52) {
    console.log('  ⚠  khác lúc sao lưu (9 căn / 52 booking) — xem lại trước khi đi tiếp');
    hong++;
  }

  const cu = await db.$queryRawUnsafe(
    `SELECT count(*)::int n FROM "Home" WHERE price IS NULL OR name IS NULL`);
  if (cu[0].n === 0) console.log('  OK   cột cũ (name, price) không dòng nào bị null hoá');
  else { console.log('  ✕ có', cu[0].n, 'căn mất name hoặc price'); hong++; }
} catch (err) {
  console.error('  ✕ lỗi:', err.message.split('\n')[0]);
  hong++;
} finally {
  await db.$disconnect();
}

console.log(hong ? `\n✕ ${hong} chỗ có vấn đề — đừng áp lên production.` : '\n✅ Migration sạch. Áp lên production được.');
process.exit(hong ? 1 : 0);
