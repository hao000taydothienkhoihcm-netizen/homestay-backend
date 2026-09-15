// Chạy `prisma migrate deploy` trên NHÁNH THỬ (DATABASE_URL_THU), không đụng production.
//   node scripts/migrate-nhanh-thu.mjs
// Production thì làm tay theo đúng thứ tự: sao-luu-sql.mjs -> npx prisma migrate deploy.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const thu = process.env.DATABASE_URL_THU;
const hostCua = (u) => (u.match(/@([^/]+)/) || [, ''])[1];
if (!thu) { console.error('✕ Thiếu DATABASE_URL_THU'); process.exit(1); }
if (hostCua(thu) === hostCua(process.env.DATABASE_URL || '')) { console.error('✕ DATABASE_URL_THU đang trỏ production. Dừng.'); process.exit(1); }

console.log('Migrate nhánh thử:', hostCua(thu));
const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit', shell: true,
  env: { ...process.env, DATABASE_URL: thu, DATABASE_URL_CHO: '' },
});
process.exit(r.status ?? 1);
