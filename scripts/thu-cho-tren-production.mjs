// Dựng CHỢ bằng code MỚI NHẤT, đọc PRODUCTION (chỉ đọc), rồi hỏi đúng câu mà sales hỏi.
// Để trả lời: đẩy bản mới lên Render thì hai căn kia có hiện giá đúng không.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const CONG = '3298';
const G = `http://localhost:${CONG}`;
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } }, log: ['error'] });
const sales = await db.user.findFirst({ where: { role: 'SALES' }, select: { id: true, username: true } })
  || await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, username: true } });
const ve = jwt.sign({ id: sales.id, role: 'SALES', hostId: null }, process.env.JWT_SECRET, { expiresIn: '10m' });
console.log(`Chợ (code mới) đọc PRODUCTION · vé của: ${sales.username}\n`);

const p = spawn(process.execPath, ['src/cho.js'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, DATABASE_URL_CHO: process.env.DATABASE_URL, PORT: CONG, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
p.stdout.on('data', (d) => { log += d; }); p.stderr.on('data', (d) => { log += d; });
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
let song = false;
for (let i = 0; i < 25; i++) { await nghi(700); try { if ((await fetch(`${G}/health`)).ok) { song = true; break; } } catch { /* chưa dậy */ } }
if (!song) { console.error('✕ Chợ không boot:\n' + log.slice(-1500)); process.exit(1); }

const r = await fetch(`${G}/v1/cho`, { headers: { authorization: 'Bearer ' + ve } });
const j = await r.json();
console.log(`GET /v1/cho -> ${r.status} · ${j.soCan ?? '?'}/${j.tongCan ?? '?'} căn\n`);
for (const c of j.can || []) {
  console.log(`#${c.id} ${c.salesTitle || '(không tiêu đề)'}`);
  if (!c.gia || !c.gia.coChe) {
    console.log('   ✕ gia.coChe = null  -> chợ sẽ ghi "chủ nhà chưa cấu hình giá"');
  } else {
    console.log(`   ✓ cơ chế ${c.gia.coChe} · từ ${c.gia.tuGia?.toLocaleString('vi-VN')}đ/đêm`);
    if (c.gia.dem) for (const [loai, g] of Object.entries(c.gia.dem)) {
      if (g) console.log(`      ${loai.padEnd(9)} khách trả ${g.khachTra?.toLocaleString('vi-VN')} · hoa hồng ${g.hoaHong?.toLocaleString('vi-VN')} · host nhận ${g.hostNhan?.toLocaleString('vi-VN')}`);
    }
  }
  console.log(`   lịch: ${c.lich?.ten} · ảnh: ${(c.coverImages || []).length}\n`);
}
p.kill();
await db.$disconnect();
