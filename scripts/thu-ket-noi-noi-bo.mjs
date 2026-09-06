// Kiểm tra chuỗi DATABASE_URL (app nội bộ) còn nối được không — dùng sau khi đổi mật khẩu neondb_owner.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL;
if (!url) { console.error('✕ Chưa có DATABASE_URL trong .env'); process.exit(1); }
console.log('DB:', url.replace(/\/\/[^@]*@/, '//***@'));

const db = new PrismaClient({ datasources: { db: { url } } });
try {
  const [home, booking, user] = await Promise.all([
    db.home.count(), db.booking.count(), db.user.count()
  ]);
  console.log('  OK   nối được — ' + home + ' căn, ' + booking + ' booking, ' + user + ' tài khoản');
  await db.$executeRawUnsafe('SELECT 1');
  console.log('  OK   quyền chủ sở hữu còn nguyên');
  console.log('\n✅ Chuỗi DATABASE_URL mới hoạt động bình thường.');
} catch (e) {
  console.error('  ✕   KHÔNG nối được:', e.message.split('\n')[0]);
  process.exit(1);
} finally {
  await db.$disconnect();
}
