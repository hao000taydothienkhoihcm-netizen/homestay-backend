// Thử luồng ĐĂNG KÝ trên chợ (nhánh thử): đăng ký host + sales -> đăng nhập phải bị
// chặn "chờ duyệt" (403) -> duyệt thẳng trong DB -> đăng nhập được -> dọn sạch.
//   node scripts/thu-dang-ky-cho.mjs
import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const thu = process.env.DATABASE_URL_THU;
const cho = process.env.DATABASE_URL_CHO;
const hostCua = (u) => (u.match(/@([^/]+)/) || [, ''])[1];
if (!thu || !cho) { console.error('✕ Cần DATABASE_URL_THU và DATABASE_URL_CHO'); process.exit(1); }
if (hostCua(thu) === hostCua(process.env.DATABASE_URL || '')) { console.error('✕ DATABASE_URL_THU đang trỏ production. Dừng.'); process.exit(1); }
const choThu = cho.replace('@' + hostCua(cho), '@' + hostCua(thu));

const CONG = '3299';
const G = `http://localhost:${CONG}`;
const db = new PrismaClient({ datasources: { db: { url: thu } }, log: ['error'] });
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
const goi = async (duong, body) => {
  const r = await fetch(G + duong, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { ma: r.status, j };
};
const tag = 'thudk' + Date.now().toString(36);
const uHost = `${tag}.host`, uSales = `${tag}.sales`;

try {
  let r = await goi('/v1/auth/register', { username: uHost, password: 'matkhau123', name: 'Chủ Thử', role: 'HOST', phone: '0901234567', brand: 'Thử Villa', gioiThieu: 'anh Hào' });
  ok(r.ma === 201 && r.j?.user?.status === 'PENDING', `1. Đăng ký HOST -> ${r.ma} ${r.j?.user?.status || r.j?.error || ''}`);
  const uh = await db.user.findUnique({ where: { username: uHost }, include: { host: true } });
  ok(uh?.phone === '0901234567' && uh?.gioiThieu === 'anh Hào' && uh?.host?.brand === 'Thử Villa' && uh?.host?.active === false,
    `   DB: phone/giới thiệu lưu đúng, workspace "${uh?.host?.name}" tạo ở trạng thái chưa kích hoạt`);

  r = await goi('/v1/auth/register', { username: uSales, password: 'matkhau123', name: 'Sales Thử', role: 'SALES', phone: '0907654321' });
  ok(r.ma === 201 && r.j?.user?.hostId == null, `2. Đăng ký SALES -> ${r.ma}, không gắn host`);

  r = await goi('/v1/auth/register', { username: uHost, password: 'matkhau123', name: 'Trùng', role: 'HOST' });
  ok(r.ma === 400, `3. Đăng ký trùng tên -> ${r.ma} (mong 400)`);
  r = await goi('/v1/auth/register', { username: 'x', password: '123', name: 'Ngắn', role: 'HOST' });
  ok(r.ma === 400, `   Tên/mật khẩu quá ngắn -> ${r.ma} (mong 400)`);
  r = await goi('/v1/auth/register', { username: tag + '.admin', password: 'matkhau123', name: 'Lén', role: 'ADMIN' });
  ok(r.ma === 400, `   Đòi vai ADMIN -> ${r.ma} (mong 400)`);

  r = await goi('/v1/auth/login', { username: uHost, password: 'matkhau123' });
  ok(r.ma === 403 && /duyệt/i.test(r.j?.error || ''), `4. Đăng nhập khi chưa duyệt -> ${r.ma} "${r.j?.error}"`);

  // Duyệt thẳng trong DB (admin làm việc này bên app nội bộ)
  await db.user.update({ where: { username: uHost }, data: { status: 'ACTIVE' } });
  await db.host.update({ where: { id: uh.hostId }, data: { active: true } });
  r = await goi('/v1/auth/login', { username: uHost, password: 'matkhau123' });
  ok(r.ma === 200 && r.j?.user?.role === 'HOST' && r.j?.user?.hostId === uh.hostId, `5. Duyệt xong đăng nhập -> ${r.ma}, vai ${r.j?.user?.role}, hostId ${r.j?.user?.hostId}`);

  // Host mới vào chợ thấy 0 căn, tạo được căn đầu tiên
  const H = { authorization: 'Bearer ' + r.j.token, 'content-type': 'application/json' };
  let rr = await fetch(`${G}/v1/homes`, { headers: H }); let ds = await rr.json();
  ok(rr.status === 200 && Array.isArray(ds) && ds.length === 0, `6. Host mới xem /v1/homes -> ${rr.status}, ${Array.isArray(ds) ? ds.length : '?'} căn`);
  rr = await fetch(`${G}/v1/homes`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Căn thử', address: '1 Thử', price: '1000000', maxGuests: '4' }) });
  const can = await rr.json();
  ok(rr.status === 201 || rr.status === 200, `   Tạo căn đầu tiên -> ${rr.status} #${can?.id}`);
  if (can?.id) {
    rr = await fetch(`${G}/v1/homes/${can.id}/cho`, { method: 'PATCH', headers: H, body: JSON.stringify({ ward: 'Phường 1', bedrooms: 2 }) });
    ok(rr.status === 200, `   Khai phường + phòng ngủ -> ${rr.status}`);
    await db.home.delete({ where: { id: can.id } });
  }
} finally {
  // Dọn: xoá user + host thử
  const us = await db.user.findMany({ where: { username: { startsWith: tag } }, select: { id: true, hostId: true } });
  await db.user.deleteMany({ where: { username: { startsWith: tag } } });
  for (const u of us) if (u.hostId) await db.host.delete({ where: { id: u.hostId } }).catch(() => {});
  console.log(`  · đã dọn ${us.length} tài khoản thử`);
  p.kill();
  await db.$disconnect();
}
console.log(`\n${loi === 0 ? '✓ Luồng đăng ký chạy đủ.' : `✕ ${loi} điều sai.`}`);
process.exit(loi === 0 ? 0 : 1);
