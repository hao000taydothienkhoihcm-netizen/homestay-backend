// Áp migration lên NHÁNH THỬ, không bao giờ lên production.
//
// Cách dùng:
//   1. Neon → Branches → New Branch → tên `thu-migration`, parent `production`
//   2. Lấy chuỗi kết nối của nhánh đó, thêm vào .env:  DATABASE_URL_THU=postgresql://...
//   3. node scripts/thu-migration.mjs
//
// Script tự chặn nếu chuỗi thử trùng chuỗi production.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const thu = process.env.DATABASE_URL_THU;
const that = process.env.DATABASE_URL;

if (!thu) {
  console.error('✕ Chưa có DATABASE_URL_THU trong .env');
  console.error('  Tạo nhánh trên Neon rồi dán chuỗi kết nối của NHÁNH vào .env.');
  process.exit(1);
}
if (thu === that) {
  console.error('✕ DATABASE_URL_THU trùng y hệt DATABASE_URL — đó là production, không phải nhánh thử.');
  process.exit(1);
}
const host = (u) => (u.match(/@([^/]+)/) || [, '?'])[1];
if (host(thu) === host(that)) {
  console.error('✕ Hai chuỗi cùng một endpoint:', host(thu));
  console.error('  Nhánh Neon phải có endpoint riêng (ep-… khác). Kiểm lại chuỗi đã copy đúng nhánh chưa.');
  process.exit(1);
}

console.log('Nhánh thử :', host(thu));
console.log('Production:', host(that), '(KHÔNG đụng tới)\n');

const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: thu },
});
process.exit(r.status ?? 1);
