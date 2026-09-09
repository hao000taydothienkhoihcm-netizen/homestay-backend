// Xem bảng _prisma_migrations: migration nào đã áp, lúc nào. Chỉ đọc.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

for (const [ten, url] of [['PRODUCTION', process.env.DATABASE_URL], ['NHÁNH THỬ', process.env.DATABASE_URL_THU]]) {
  if (!url) continue;
  const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });
  console.log('\n' + ten + ':', (url.match(/@([^/]+)/) || [, '?'])[1]);
  try {
    const rows = await db.$queryRawUnsafe(
      `SELECT migration_name, started_at, finished_at, applied_steps_count
       FROM _prisma_migrations ORDER BY started_at`);
    for (const r of rows) {
      console.log('   ', new Date(r.started_at).toISOString().replace('T', ' ').slice(0, 19),
        '·', r.migration_name, r.finished_at ? '' : '  ⚠ CHƯA XONG');
    }
  } catch (e) { console.log('    lỗi:', e.message.split('\n')[0]); }
  await db.$disconnect();
}
