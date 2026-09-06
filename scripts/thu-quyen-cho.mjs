// Kiểm tài khoản chỉ-đọc của chợ đã đúng chưa.  Chạy: node scripts/thu-quyen-cho.mjs
//
// Đọc DATABASE_URL_CHO trong .env (file này gitignored — đừng dán chuỗi kết nối vào chat).
// Phải ra: ĐỌC được, GHI bị từ chối. Nếu ghi được nghĩa là role đang thừa quyền —
// coi như chưa tách, vì bug ở chợ vẫn phá được dữ liệu thật.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL_CHO;
if (!url) {
  console.error('✕ Chưa có DATABASE_URL_CHO trong .env');
  process.exit(1);
}
if (url === process.env.DATABASE_URL) {
  console.error('✕ DATABASE_URL_CHO trùng y hệt DATABASE_URL — đó là chuỗi chủ sở hữu, KHÔNG phải role chỉ đọc.');
  process.exit(1);
}
console.log('DB:', url.replace(/:\/\/[^@]+@/, '://***@'));

const db = new PrismaClient({ datasources: { db: { url } } });
let loi = 0;

try {
  const n = await db.$queryRaw`SELECT count(*)::int AS n FROM "Home"`;
  console.log(`  OK   đọc được bảng Home — ${n[0].n} căn`);
} catch (e) {
  console.log('  ✕    KHÔNG đọc được bảng Home:', e.message.split('\n')[0]);
  loi++;
}

try {
  const n = await db.$queryRaw`SELECT count(*)::int AS n FROM "Booking"`;
  console.log(`  OK   đọc được bảng Booking — ${n[0].n} booking (chợ cần để tính ngày bận)`);
} catch (e) {
  console.log('  ✕    KHÔNG đọc được bảng Booking:', e.message.split('\n')[0]);
  loi++;
}

// Thử ghi — PHẢI hỏng. Bọc trong transaction rồi rollback để lỡ có ghi được cũng không bẩn dữ liệu.
try {
  await db.$transaction(async (t) => {
    await t.$executeRaw`INSERT INTO "Expense" (date, category, "desc", amount, "updatedAt")
                        VALUES (now(), 'THU-QUYEN', 'xoa ngay', 1, now())`;
    throw new Error('__ROLLBACK__');
  });
} catch (e) {
  const m = e.message || '';
  if (m.includes('__ROLLBACK__')) {
    console.log('  ✕    GHI ĐƯỢC vào bảng Expense — role đang THỪA QUYỀN, chưa đạt.');
    console.log('       (đã rollback, dữ liệu không bẩn — nhưng phải chạy lại phần GRANT)');
    loi++;
  } else if (/permission denied|quyền/i.test(m)) {
    console.log('  OK   ghi vào Expense bị từ chối — đúng như thiết kế');
  } else {
    console.log('  ?    ghi hỏng vì lý do khác:', m.split('\n')[0]);
  }
}

await db.$disconnect();
console.log(loi ? `\n✕ Còn ${loi} chỗ chưa đạt.\n` : '\n✅ Role chỉ-đọc đã đúng. Dán chuỗi này vào Render → sabi-cho → DATABASE_URL_CHO.\n');
process.exit(loi ? 1 : 0);
