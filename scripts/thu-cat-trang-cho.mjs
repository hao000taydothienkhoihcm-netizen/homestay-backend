// Kiểm phân trang của chợ trên NHÁNH THỬ (117 căn) — chỗ duy nhất đủ hàng để thử thật.
// Ba thứ phải đúng: không sót căn, không lặp căn, và thứ tự sắp xếp không vỡ khi cắt trang.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const CONG = '3297';
const G = `http://localhost:${CONG}`;
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });
const u = await db.user.findFirst({ where: { role: 'SALES' }, select: { id: true } })
  || await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
const H = { authorization: 'Bearer ' + jwt.sign({ id: u.id, role: 'SALES', hostId: null }, process.env.JWT_SECRET, { expiresIn: '10m' }) };

const p = spawn(process.execPath, ['src/cho.js'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, DATABASE_URL_CHO: process.env.DATABASE_URL_THU, PORT: CONG, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = ''; p.stdout.on('data', (d) => { log += d; }); p.stderr.on('data', (d) => { log += d; });
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
let song = false;
for (let i = 0; i < 25; i++) { await nghi(700); try { if ((await fetch(`${G}/health`)).ok) { song = true; break; } } catch { /* chưa dậy */ } }
if (!song) { console.error('✕ Chợ không boot:\n' + log.slice(-1200)); process.exit(1); }

const lay = async (qs) => (await fetch(`${G}/v1/cho?${qs}`, { headers: H })).json();

// ── 1. Gom hết các trang, so với tổng ──
const sap = 'giaAsc';
let trang = 1, het = false, tatCa = [], moiTrang = 0, soCan = 0, soTrang = 0;
const t0 = Date.now();
while (!het && trang <= 30) {
  const r = await lay(`sap=${sap}&trang=${trang}`);
  if (trang === 1) { soCan = r.soCan; moiTrang = r.moiTrang; soTrang = r.soTrang; }
  tatCa.push(...r.can.map((c) => c.id));
  het = !r.conNua;
  trang++;
}
console.log(`Gom ${trang - 1} trang trong ${Date.now() - t0}ms · mỗi trang ${moiTrang} · máy chủ khai ${soCan} căn / ${soTrang} trang`);
console.log(`  lấy về ${tatCa.length} id`);
const trung = tatCa.length - new Set(tatCa).size;
console.log(`  ${tatCa.length === soCan ? '✓' : '✕'} không sót: ${tatCa.length}/${soCan}`);
console.log(`  ${trung === 0 ? '✓' : '✕'} không lặp: ${trung} id trùng`);

// ── 2. Thứ tự gộp từ nhiều trang phải y hệt lấy một phát ──
const motPhat = await lay(`sap=${sap}&moiTrang=50&trang=1`);
const dauMotPhat = motPhat.can.map((c) => c.id);
const dauNhieuTrang = tatCa.slice(0, dauMotPhat.length);
const khop = JSON.stringify(dauMotPhat) === JSON.stringify(dauNhieuTrang);
console.log(`  ${khop ? '✓' : '✕'} thứ tự khớp với lấy một phát (${dauMotPhat.length} căn đầu)`);

// ── 3. Có trả ảnh bìa không ──
const coAnh = motPhat.can.filter((c) => (c.coverImages || []).length).length;
console.log(`  ảnh bìa: ${coAnh}/${motPhat.can.length} căn trang đầu có ảnh`);

// ── 4. Dải 14 đêm chỉ tính cho căn trong trang ──
const coDai = motPhat.can.filter((c) => Array.isArray(c.ban)).length;
console.log(`  dải 14 đêm: ${coDai}/${motPhat.can.length} căn có mảng ban`);

// ── 5. Bộ lọc vẫn đếm trên toàn bộ, không phải trên trang ──
const loc = await lay('pnMin=3&trang=1');
console.log(`\nLọc "từ 3 phòng ngủ": soCan=${loc.soCan} · trang này ${loc.can.length} căn · ${loc.soTrang} trang · tổng đang bán ${loc.tongCan}`);
console.log(`  ${loc.soCan >= loc.can.length ? '✓' : '✕'} soCan là TỔNG khớp lọc, không phải số căn trang này`);

p.kill();
await db.$disconnect();
