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

// ── 5. Tên căn + mã có ra chợ không, và CÓ GÌ LỌT RA KHÔNG ──
// Danh sách trắng CHON_CHO là lớp chặn số 2. Thêm cột mới mà quên rà là lộ dữ liệu
// host — nên kiểm bằng máy, đừng tin mắt.
const CAM = ['desc', 'address', 'caretakerPhone', 'rules', 'mapLink', 'lat', 'lng',
  'lichLink', 'lichSheetTab', 'lichSheetCot', 'lichKey', 'lichNhatKy',
  'floorPrice', 'markupMin', 'markupMax', 'listPrice', 'commissionPct', 'coCheHoaHong',
  'floorPriceWeekend', 'floorPriceHoliday', 'markupHoliday', 'listPriceWeekend', 'listPriceHoliday',
  'price', 'weekendPrice', 'holidayPrice', 'street', 'choTrangThai', 'active'];
const mau = motPhat.can[0] || {};
const lot = CAM.filter((k) => k in mau);
console.log(`\nTên căn ra chợ: ${motPhat.can.filter((c) => c.name).length}/${motPhat.can.length} · có mã: ${motPhat.can.filter((c) => c.ma).length}/${motPhat.can.length}`);
console.log(`  ví dụ: "${mau.name}" (${mau.ma}) — tiêu đề: "${String(mau.salesTitle || '').slice(0, 44)}"`);
console.log(`  ${lot.length === 0 ? '✓ không có cột cấm nào lọt ra' : '✕ LỌT RA: ' + lot.join(', ')}`);
console.log(`  cột thật sự trả về: ${Object.keys(mau).sort().join(' ')}`);

// Tìm theo TÊN căn phải ra
const timTen = String(mau.name || '').split(' ').slice(-1)[0];
if (timTen && timTen.length >= 3) {
  const rt = await lay(`q=${encodeURIComponent(timTen)}`);
  console.log(`  tìm "${timTen}" -> ${rt.soCan} căn ${rt.soCan > 0 ? '✓' : '✕ gõ tên căn mà không ra'}`);
}

// ── 6. Bộ lọc vẫn đếm trên toàn bộ, không phải trên trang ──
const loc = await lay('pnMin=3&trang=1');
console.log(`\nLọc "từ 3 phòng ngủ": soCan=${loc.soCan} · trang này ${loc.can.length} căn · ${loc.soTrang} trang · tổng đang bán ${loc.tongCan}`);
console.log(`  ${loc.soCan >= loc.can.length ? '✓' : '✕'} soCan là TỔNG khớp lọc, không phải số căn trang này`);

p.kill();
await db.$disconnect();
