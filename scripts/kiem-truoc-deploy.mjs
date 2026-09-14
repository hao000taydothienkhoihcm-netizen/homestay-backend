// KIỂM TRƯỚC KHI DEPLOY — dựng server y như Render rồi gõ vào từng màn.
//
// Vì sao cần: deploy hỏng thì Render chỉ báo "Build failed" hoặc tệ hơn là deploy
// XONG mà một màn nào đó lặng lẽ trả 500. Bản 06/09 nằm trên Render 8 ngày mà không
// ai biết nó cũ. Bài kiểm này chạy dưới máy, mất ~20 giây, bắt được ba loại lỗi hay gặp:
//   1. Thiếu gói chạy thật (đưa nhầm vào devDependencies) -> server không boot nổi
//   2. Cột chưa có trong DB -> route trả 500
//   3. Quên chép bản build web -> index.html trỏ tới asset không tồn tại
//
//   node scripts/kiem-truoc-deploy.mjs           -> chạy trên NHÁNH THỬ (mặc định)
//   node scripts/kiem-truoc-deploy.mjs --that    -> chạy trên PRODUCTION (chỉ đọc)
import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const THAT = process.argv.includes('--that');
const url = THAT ? process.env.DATABASE_URL : process.env.DATABASE_URL_THU;
if (!url) { console.error('✕ Thiếu chuỗi kết nối'); process.exit(1); }
const may = (u) => (String(u).match(/@([^/?]+)/) || [, '?'])[1].split('.')[0];
const CONG = process.env.CONG_KIEM || '3299';
const G = `http://localhost:${CONG}`;

console.log(`Dựng server như Render · NODE_ENV=production · DB ${THAT ? 'PRODUCTION' : 'nhánh thử'}: ${may(url)}\n`);

// ───── Vé admin: ký thẳng, không gõ mật khẩu của ai ─────
const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });
const ad = await db.user.findFirst({ where: { role: 'ADMIN', active: true }, select: { id: true } });
const can = await db.home.findFirst({ select: { id: true, hostId: true }, orderBy: { id: 'asc' } });
if (!ad || !can) { console.error('✕ DB chưa có tài khoản ADMIN hoặc chưa có căn nào để thử.'); process.exit(1); }
const ve = jwt.sign({ id: ad.id, role: 'ADMIN', hostId: null }, process.env.JWT_SECRET, { expiresIn: '10m' });
const hoTro = jwt.sign({ loai: 'ho-tro', adminId: ad.id, hostId: can.hostId }, process.env.JWT_SECRET, { expiresIn: '10m' });
const H = { authorization: 'Bearer ' + ve, 'x-ho-tro': hoTro };
await db.$disconnect();

const may_chu = spawn(process.execPath, ['src/server.js'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, DATABASE_URL: url, PORT: CONG, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let nhatKy = '';
may_chu.stdout.on('data', (d) => { nhatKy += d; });
may_chu.stderr.on('data', (d) => { nhatKy += d; });

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
let song = false;
for (let i = 0; i < 30; i++) {
  await nghi(700);
  try { const r = await fetch(`${G}/health`, { signal: AbortSignal.timeout(3000) }); if (r.ok) { song = true; break; } } catch { /* chưa dậy */ }
  if (may_chu.exitCode != null) break;
}
if (!song) {
  console.error('✕ SERVER KHÔNG BOOT ĐƯỢC. Nhật ký:\n' + nhatKy.slice(-2500));
  may_chu.kill(); process.exit(1);
}

const BAI = [
  ['GET', '/health', null],
  ['GET', '/build-info.json', null],
  ['GET', '/', null],
  ['GET', '/v1/homes', H],
  ['GET', '/v1/homes/phuong', H],
  ['GET', '/v1/homes/anh/trang-thai', H],
  ['GET', `/v1/homes/${can.id}`, H],
  ['GET', `/v1/homes/${can.id}/lich`, H],
  ['GET', `/v1/homes/${can.id}/lich-khoa`, H],
  ['GET', `/v1/homes/${can.id}/prices?year=${new Date().getFullYear()}`, H],
  ['GET', '/v1/bookings', H],
  ['GET', '/v1/holidays', H],
  ['GET', '/v1/expenses', H],
  ['GET', '/v1/users', H],
  ['GET', '/v1/charge-templates', H],
  ['GET', '/v1/inventory', H],
  ['GET', '/v1/stats/dashboard', H],
  ['GET', '/v1/stats/monthly', H],
  ['GET', '/v1/stats/by-home', H],
  ['GET', '/v1/stats/finance', H],
  ['GET', '/v1/homes', null],           // KHÔNG có vé -> phải bị chặn 401
];

let hong = 0;
console.log('MÀN / API');
for (const [pp, duong, head] of BAI) {
  const mongDoi = head === null && duong.startsWith('/v1') ? 401 : 200;
  try {
    const r = await fetch(G + duong, { method: pp, headers: head || {}, signal: AbortSignal.timeout(25000) });
    const ok = r.status === mongDoi;
    if (!ok) hong++;
    let them = '';
    if (!ok) them = '  ' + (await r.text()).slice(0, 120).replace(/\s+/g, ' ');
    console.log(`  ${ok ? '✓' : '✕'} ${String(r.status).padEnd(4)} ${duong}${head === null && duong.startsWith('/v1') ? '  (không vé, phải 401)' : ''}${them}`);
  } catch (e) {
    hong++;
    console.log(`  ✕ ---  ${duong}  ${String(e.message).slice(0, 80)}`);
  }
}

// ───── Bản web: index.html có trỏ đúng asset đang nằm trên đĩa không ─────
// Đây là lỗi đã dính một lần: deploy xong web vẫn chạy bản cũ, không ai báo gì.
console.log('\nBẢN WEB');
try {
  const html = await (await fetch(G + '/')).text();
  const canAsset = [...html.matchAll(/\/assets\/([\w.-]+)/g)].map((m) => m[1]);
  const coTrenDia = new Set(fs.existsSync('public/assets') ? fs.readdirSync('public/assets') : []);
  if (!canAsset.length) { hong++; console.log('  ✕ index.html không trỏ tới asset nào — bản build hỏng?'); }
  for (const a of canAsset) {
    const ok = coTrenDia.has(a);
    if (!ok) hong++;
    console.log(`  ${ok ? '✓' : '✕'} ${a}${ok ? '' : '  KHÔNG CÓ trong public/assets — quên chạy deploy-web.mjs?'}`);
  }
  const bi = JSON.parse(fs.readFileSync('public/build-info.json', 'utf8'));
  console.log(`  · build-info: ${bi.web_commit_ngan} (${bi.repo || 'sabihome'}) lúc ${String(bi.build_luc).slice(0, 16).replace('T', ' ')}`);
  for (const a of bi.assets || []) {
    if (!coTrenDia.has(a)) { hong++; console.log(`  ✕ build-info khai asset ${a} nhưng không có trên đĩa`); }
  }
} catch (e) { hong++; console.log('  ✕ ' + e.message); }

may_chu.kill();
console.log(hong ? `\n✕ ${hong} chỗ hỏng — ĐỪNG deploy cho tới khi sửa xong.` : '\n✓ Tất cả đạt — deploy được.');
process.exit(hong ? 1 : 0);
