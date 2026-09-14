// Deploy trên Render chết ở P1002 "Timed out trying to acquire a postgres advisory lock".
// Prisma lấy advisory lock 72707369 trước khi chạy migrate. Ai đang giữ nó?
// CHỈ ĐỌC.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } }, log: ['error'] });

const khoa = await db.$queryRawUnsafe(`
  SELECT l.pid, l.granted, a.state, a.application_name,
         EXTRACT(EPOCH FROM (now() - a.state_change))::int AS giay_im
  FROM pg_locks l LEFT JOIN pg_stat_activity a ON a.pid = l.pid
  WHERE l.locktype = 'advisory'
`);
console.log(khoa.length ? `⚠ Đang có ${khoa.length} advisory lock:` : '✓ Không còn advisory lock nào — Render deploy lại là qua được.');
for (const k of khoa) console.log(`   pid ${k.pid} · granted ${k.granted} · ${k.state} · ${k.application_name} · im ${k.giay_im}s`);

const ket = await db.$queryRawUnsafe(`SELECT count(*)::int n, state FROM pg_stat_activity WHERE datname = current_database() GROUP BY state`);
console.log('\nKết nối đang mở tới production:');
for (const r of ket) console.log(`   ${String(r.n).padStart(3)} × ${r.state || '(không rõ)'}`);

const m = await db.$queryRawUnsafe(`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 3`);
console.log('\n3 migration gần nhất:');
for (const r of m) console.log(`   ${r.migration_name} · xong ${r.finished_at ? new Date(r.finished_at).toISOString().slice(0,19) : 'CHƯA'}${r.rolled_back_at ? ' · ĐÃ LÙI' : ''}`);
await db.$disconnect();
