// Chay APP NOI BO duoi may, GHI VAO NHANH THU (khong bao gio production).
// Dung de thu man khai can ma khong dung du lieu that.
//
//   node scripts/chay-noi-bo-nhanh-thu.mjs   -> http://localhost:3201
import 'dotenv/config';
import { spawn } from 'node:child_process';

const thu = process.env.DATABASE_URL_THU;
const that = process.env.DATABASE_URL;
if (!thu) { console.error('✕ Thieu DATABASE_URL_THU'); process.exit(1); }
const host = (u) => (u.match(/@([^/]+)/) || [, '?'])[1];
if (host(thu) === host(that || '')) {
  console.error('✕ DATABASE_URL_THU cung endpoint voi production. Dung lai.');
  process.exit(1);
}
console.log('App noi bo GHI VAO nhanh thu:', host(thu));
console.log('Production                  :', host(that), '(KHONG dung toi)');
console.log('Mo                          : http://localhost:3201\n');

spawn('node', ['src/server.js'], {
  stdio: 'inherit', shell: true,
  env: { ...process.env, DATABASE_URL: thu, PORT: '3201' },
});
