// Thử luồng NHẬN / TRẢ NHÀ trên NHÁNH THỬ — bằng vai STAFF (vai bị hạn chế nhất).
//   node scripts/thu-nhan-tra.mjs
// Kiểm đúng mấy chỗ vừa sửa 15/09/2026:
//   1. Khách ở QUÁ HẠN (checkOut hôm qua): nhận nhà + trả nhà kèm phụ thu vẫn được,
//      phụ thu được ghi (trước đây STAFF trả ngoài ngày là phụ thu bị lặng lẽ bỏ).
//   2. Trả THẲNG không qua nhận: paidAtCheckIn được ghi = tiền nhà − giảm − cọc.
//   3. Nhận lại booking đã trả -> 400. Nhận hai lần -> 400.
//   4. STAFF sửa phụ thu sau khi đã trả (khác ngày trả thực tế) -> phụ thu KHÔNG đổi.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const thu = process.env.DATABASE_URL_THU;
const hostCua = (u) => (u.match(/@([^/]+)/) || [, ''])[1];
if (!thu || hostCua(thu) === hostCua(process.env.DATABASE_URL || '')) { console.error('✕ DATABASE_URL_THU thiếu hoặc trỏ production'); process.exit(1); }
const CONG = '3296';
const G = `http://localhost:${CONG}`;
const db = new PrismaClient({ datasources: { db: { url: thu } }, log: ['error'] });

const host = await db.user.findFirst({ where: { role: 'HOST', hostId: { not: null } }, select: { id: true, hostId: true } });
const can = await db.home.findFirst({ where: { hostId: host?.hostId }, select: { id: true, price: true } });
if (!host || !can) { console.error('✕ Nhánh thử thiếu HOST có căn'); process.exit(1); }
// Vé STAFF ký thẳng (authMiddleware nạp lại user từ DB, nên phải có user STAFF thật; không có thì tạo tạm)
let staff = await db.user.findFirst({ where: { role: 'STAFF', hostId: host.hostId, active: true }, select: { id: true } });
let staffTam = false;
if (!staff) {
  staff = await db.user.create({ data: { username: 'thu.staff.' + Date.now().toString(36), password: 'x', name: 'Staff thử', role: 'STAFF', hostId: host.hostId }, select: { id: true } });
  staffTam = true;
}
const H = { authorization: 'Bearer ' + jwt.sign({ id: staff.id, role: 'STAFF', hostId: host.hostId }, process.env.JWT_SECRET, { expiresIn: '10m' }), 'content-type': 'application/json' };

const p = spawn(process.execPath, ['src/server.js'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, DATABASE_URL: thu, PORT: CONG, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = ''; p.stdout.on('data', (d) => { log += d; }); p.stderr.on('data', (d) => { log += d; });
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
let song = false;
for (let i = 0; i < 30; i++) { await nghi(700); try { if ((await fetch(`${G}/health`)).ok) { song = true; break; } } catch { /* */ } }
if (!song) { console.error('✕ Server không boot:\n' + log.slice(-1500)); process.exit(1); }

let loi = 0;
const ok = (dung, chu) => { console.log(`  ${dung ? '✓' : '✕'} ${chu}`); if (!dung) loi++; };
const goi = async (cach, duong, body) => {
  const r = await fetch(G + duong, { method: cach, headers: H, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { ma: r.status, j };
};
const ymd = (d) => d.toISOString().slice(0, 10);
const homNay = new Date(Date.now() + 7 * 3600 * 1000);
const truoc = (n) => ymd(new Date(homNay.getTime() - n * 86400000));
// Booking quá hạn phải tạo thẳng trong DB: API (đúng luật) không cho tạo booking ngày đã qua.
const taoDon = () => db.booking.create({
  data: {
    homeId: can.id, hostId: host.hostId, guest: 'Khách thử nhận trả', phone: '0900000000', guests: 2,
    checkIn: new Date(truoc(3) + 'T00:00:00.000Z'), checkOut: new Date(truoc(1) + 'T00:00:00.000Z'),
    totalAmount: 3000000, deposit: 1000000, discount: 0, status: 'CONFIRMED', notes: 'thử',
  }, select: { id: true },
});
const ids = [];
try {
  // ── 1. Quá hạn: nhận + trả kèm phụ thu ──
  const id1 = (await taoDon()).id; ids.push(id1);
  console.log(`  · booking thử #${id1} (${truoc(3)} → ${truoc(1)}, quá hạn 1 ngày), vai STAFF`);
  let r = await goi('POST', `/v1/bookings/${id1}/checkin`, { actualTime: truoc(3) + 'T14:00:00.000Z' });
  ok(r.ma === 200 && r.j?.paidAtCheckIn === 2000000, `   Nhận nhà trễ -> ${r.ma}, paidAtCheckIn ${r.j?.paidAtCheckIn} (mong 2.000.000)`);
  r = await goi('POST', `/v1/bookings/${id1}/checkin`, {});
  ok(r.ma === 400, `   Nhận lần hai -> ${r.ma} (mong 400)`);
  r = await goi('POST', `/v1/bookings/${id1}/checkout`, { actualTime: ymd(homNay) + 'T10:00:00.000Z', charges: [{ name: 'Phạt hút thuốc', unit: 200000, qty: 1 }, { name: 'Nước suối', unit: 10000, qty: 3 }] });
  ok(r.ma === 200 && r.j?.status === 'CHECKEDOUT' && r.j?.chargesTotal === 230000 && (r.j?.charges || []).length === 2,
    `   Trả nhà HÔM NAY (quá hạn 1 ngày) kèm phụ thu -> ${r.ma}, chargesTotal ${r.j?.chargesTotal} (mong 230.000), ${(r.j?.charges || []).length} khoản`);
  ok(r.j?.paidAtCheckIn === 2000000, `   paidAtCheckIn giữ nguyên 2.000.000 -> ${r.j?.paidAtCheckIn}`);
  r = await goi('POST', `/v1/bookings/${id1}/checkin`, {});
  ok(r.ma === 400, `3. Nhận lại booking đã trả -> ${r.ma} (mong 400)`);

  // ── 4. STAFF sửa phụ thu sau khi đã trả, ngày trả thực tế là hôm qua -> không đổi ──
  await db.booking.update({ where: { id: id1 }, data: { actualCheckOut: new Date(truoc(1) + 'T10:00:00.000Z') } });
  r = await goi('POST', `/v1/bookings/${id1}/checkout`, { charges: [] });
  ok(r.ma === 200 && r.j?.chargesTotal === 230000 && (r.j?.charges || []).length === 2, `4. STAFF sửa phụ thu qua ngày -> ${r.ma}, phụ thu vẫn ${r.j?.chargesTotal} / ${(r.j?.charges || []).length} khoản (không đổi)`);

  // ── 2. Trả thẳng không qua nhận ──
  const id2 = (await taoDon()).id; ids.push(id2);
  r = await goi('POST', `/v1/bookings/${id2}/checkout`, { actualTime: ymd(homNay) + 'T11:00:00.000Z', charges: [] });
  ok(r.ma === 200 && r.j?.paidAtCheckIn === 2000000 && r.j?.actualCheckIn, `2. Trả thẳng (chưa nhận) -> ${r.ma}, paidAtCheckIn ${r.j?.paidAtCheckIn} (mong 2.000.000), actualCheckIn ${r.j?.actualCheckIn ? 'có' : 'THIẾU'}`);
} finally {
  if (ids.length) { await db.charge.deleteMany({ where: { bookingId: { in: ids } } }); await db.booking.deleteMany({ where: { id: { in: ids } } }); }
  if (staffTam) await db.user.delete({ where: { id: staff.id } });
  console.log(`  · đã dọn ${ids.length} booking thử`);
  p.kill();
  await db.$disconnect();
}
console.log(`\n${loi === 0 ? '✓ Nhận / trả nhà chạy đủ.' : `✕ ${loi} điều sai.`}`);
process.exit(loi === 0 ? 0 : 1);
