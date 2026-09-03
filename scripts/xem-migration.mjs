// Xem DB dang o migration nao + cac bang/cot GD3 da co chua. CHI DOC.
// Dung TEST_DB_URL neu co (nhanh), khong thi DATABASE_URL (that).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

let url = process.env.TEST_DB_URL || process.env.DATABASE_URL;
if (!/connect_timeout/.test(url)) url += (url.includes('?') ? '&' : '?') + 'connect_timeout=30&pool_timeout=30';
const p = new PrismaClient({ datasources: { db: { url } } });
const host = url.match(/@([^/]+)\//)?.[1];
console.log('DB:', host);

for (let lan = 1; lan <= 3; lan++) {
  try {
    const rows = await p.$queryRawUnsafe(
      `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`);
    for (const r of rows) console.log(`  ${r.finished_at ? 'OK ' : '?? '} ${r.migration_name}${r.rolled_back_at ? '  (ROLLED BACK)' : ''}`);
    const cols = await p.$queryRawUnsafe(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE (table_name='Host' AND column_name IN ('plan','internalAppEnabled'))
          OR (table_name='Booking' AND column_name='source')
          OR (table_name='Home' AND column_name IN ('choTrangThai','coCheHoaHong','ward'))
          OR (table_name='LichKhoa' AND column_name IN ('ngay','nguon'))
       ORDER BY table_name, column_name`);
    console.log('  cot GD3 co mat:', cols.map((c) => `${c.table_name}.${c.column_name}`).join(', ') || '(chua co)');
    break;
  } catch (e) {
    console.log(`  lan ${lan}: ${String(e.message).split('\n').find((l) => /reach|Error/.test(l)) || e.message}`);
    await new Promise((r) => setTimeout(r, 6000));
  }
}
await p.$disconnect();
