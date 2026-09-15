// Kiểm HÀNG RÀO của chợ sau khi chợ có hai mặt (Sales chỉ đọc · chủ nhà khai căn).
// Chạy trên NHÁNH THỬ, không đụng production.
//
//   node scripts/kiem-hang-rao-cho.mjs
//
// Sáu điều phải đúng, sai một điều là không được deploy:
//   1. SALES đọc được chợ           GET  /v1/cho           -> 200
//   2. SALES không ghi được gì ở chợ PATCH /v1/cho/...      -> 405
//   3. SALES không vào cửa chủ nhà  GET  /v1/homes         -> 403
//   4. HOST thấy căn của mình        GET  /v1/homes         -> 200, đúng hostId
//   5. HOST lưu được khai căn        PATCH /v1/homes/:id/cho -> 200 (rồi trả lại như cũ)
//   6. Role chỉ-đọc thật sự chỉ đọc  UPDATE bằng cho_chi_doc -> permission denied
import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const thu = process.env.DATABASE_URL_THU;
const cho = process.env.DATABASE_URL_CHO;
if (!thu || !cho) { console.error('✕ Cần DATABASE_URL_THU và DATABASE_URL_CHO trong .env'); process.exit(1); }
const hostCua = (u) => (u.match(/@([^/]+)/) || [, ''])[1];
if (hostCua(thu) === hostCua(process.env.DATABASE_URL || '')) { console.error('✕ DATABASE_URL_THU đang trỏ production. Dừng.'); process.exit(1); }
// Chuỗi chỉ-đọc nhưng trỏ nhánh thử (cùng role cho_chi_doc, khác endpoint).
const choThu = cho.replace('@' + hostCua(cho), '@' + hostCua(thu));

const CONG = '3298';
const G = `http://localhost:${CONG}`;
const db = new PrismaClient({ datasources: { db: { url: thu } }, log: ['error'] });

const sales = await db.user.findFirst({ where: { role: 'SALES' }, select: { id: true, username: true } });
const host = await db.user.findFirst({ where: { role: 'HOST', hostId: { not: null } }, select: { id: true, username: true, hostId: true } });
if (!sales || !host) { console.error('✕ Nhánh thử thiếu tài khoản SALES hoặc HOST'); process.exit(1); }
const can = await db.home.findFirst({ where: { hostId: host.hostId }, select: { id: true, name: true, rules: true } });
if (!can) { console.error(`✕ Host ${host.username} chưa có căn nào trên nhánh thử`); process.exit(1); }

const ky = (u, role, hostId) => ({ authorization: 'Bearer ' + jwt.sign({ id: u.id, role, hostId }, process.env.JWT_SECRET, { expiresIn: '10m' }), 'content-type': 'application/json' });
const HS = ky(sales, 'SALES', null);
const HH = ky(host, 'HOST', host.hostId);

const p = spawn(process.execPath, ['src/cho.js'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, DATABASE_URL: thu, DATABASE_URL_CHO: choThu, PORT: CONG, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = ''; p.stdout.on('data', (d) => { log += d; }); p.stderr.on('data', (d) => { log += d; });
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
let song = false;
for (let i = 0; i < 25; i++) { await nghi(700); try { if ((await fetch(`${G}/health`)).ok) { song = true; break; } } catch { /* chưa dậy */ } }
if (!song) { console.error('✕ Chợ không boot:\n' + log.slice(-1500)); process.exit(1); }

let loi = 0;
const ok = (dung, chu) => { console.log(`  ${dung ? '✓' : '✕'} ${chu}`); if (!dung) loi++; };
const goi = async (cach, duong, headers, body) => {
  const r = await fetch(G + duong, { method: cach, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* không phải json */ }
  return { ma: r.status, j };
};

console.log(`Sales: ${sales.username} · Host: ${host.username} (hostId ${host.hostId}) · căn thử: #${can.id} ${can.name}\n`);

try {
  // 1 + 2: mặt Sales
  let r = await goi('GET', '/v1/cho?moiTrang=4', HS);
  ok(r.ma === 200 && Array.isArray(r.j?.can), `1. SALES đọc chợ -> ${r.ma}, ${r.j?.soCan ?? '?'} căn`);
  r = await goi('PATCH', `/v1/cho/${can.id}`, HS, { rules: 'x' });
  ok(r.ma === 405, `2. SALES ghi vào /v1/cho -> ${r.ma} (mong 405)`);

  // 3: Sales không qua cửa chủ nhà
  r = await goi('GET', '/v1/homes', HS);
  ok(r.ma === 403, `3. SALES gọi /v1/homes -> ${r.ma} (mong 403)`);
  r = await goi('PATCH', `/v1/homes/${can.id}/cho`, HS, { rules: 'x' });
  ok(r.ma === 403, `   SALES ghi /v1/homes/:id/cho -> ${r.ma} (mong 403)`);

  // 4: Host thấy đúng căn của mình
  r = await goi('GET', '/v1/homes', HH);
  const laCuaMinh = Array.isArray(r.j) && r.j.length > 0 && r.j.every((h) => h.hostId === host.hostId);
  ok(r.ma === 200 && laCuaMinh, `4. HOST xem /v1/homes -> ${r.ma}, ${Array.isArray(r.j) ? r.j.length : '?'} căn, đều hostId ${host.hostId}`);
  r = await goi('GET', '/v1/homes/phuong', HH);
  ok(r.ma === 200 && Array.isArray(r.j), `   HOST lấy danh sách phường -> ${r.ma}`);
  r = await goi('GET', '/v1/holidays', HH);
  ok(r.ma === 200, `   HOST xem ngày lễ -> ${r.ma}`);

  // 5: Host lưu khai căn (đổi quy định rồi trả lại)
  const dau = `Kiểm hàng rào ${Date.now()}`;
  r = await goi('PATCH', `/v1/homes/${can.id}/cho`, HH, { rules: dau });
  const sau = await db.home.findUnique({ where: { id: can.id }, select: { rules: true } });
  ok(r.ma === 200 && sau?.rules === dau, `5. HOST lưu quy định qua chợ -> ${r.ma}, DB nhánh thử ${sau?.rules === dau ? 'đã đổi' : 'KHÔNG đổi'}`);
  await db.home.update({ where: { id: can.id }, data: { rules: can.rules } });

  // 6: role chỉ-đọc không ghi được — kiểm thẳng ở tầng DB
  const chiDoc = new PrismaClient({ datasources: { db: { url: choThu } }, log: [] });
  let chan = false, chu = '';
  try { await chiDoc.home.update({ where: { id: can.id }, data: { rules: 'lén' } }); }
  catch (e) { chan = /permission denied|42501/i.test(String(e.message)); chu = chan ? 'permission denied' : String(e.message).slice(0, 80); }
  await chiDoc.$disconnect();
  ok(chan, `6. cho_chi_doc UPDATE Home -> ${chu || 'GHI ĐƯỢC (SAI!)'}`);
} finally {
  p.kill();
  await db.$disconnect();
}

console.log(`\n${loi === 0 ? '✓ Hàng rào đủ 6/6.' : `✕ ${loi} điều sai — KHÔNG deploy.`}`);
process.exit(loi === 0 ? 0 : 1);
