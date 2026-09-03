// Xem bang _prisma_migrations tren database dang tro toi. CHI DOC.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
try {
  const r = await p.$queryRawUnsafe(
    'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at'
  );
  if (!r.length) console.log('  bang _prisma_migrations ton tai nhung RONG');
  for (const m of r) console.log(`  ${m.migration_name}   ap dung: ${m.finished_at ? m.finished_at.toISOString().slice(0, 16) : '(chua)'}${m.rolled_back_at ? '  DA ROLLBACK' : ''}`);
} catch (e) {
  console.log('  KHONG co bang _prisma_migrations -> production chua tung dung prisma migrate');
}
await p.$disconnect();
