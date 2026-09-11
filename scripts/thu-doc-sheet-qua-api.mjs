// Gọi thật /homes/:id/lich/thu-doc — cái nút "🔍 Thử đọc bảng ngay" trong màn khai căn.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
const G = process.env.API_THU || 'http://localhost:3201';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });
const id = parseInt(process.argv[2] || '0');
const can = id ? await db.home.findUnique({ where: { id }, select: { id: true, name: true, hostId: true, lichLink: true, lichSheetCot: true } })
  : await db.home.findFirst({ where: { lichNguon: 'SHEET' }, select: { id: true, name: true, hostId: true, lichLink: true, lichSheetCot: true }, orderBy: { id: 'asc' } });
const ad = await db.user.findFirst({ where: { role: 'ADMIN', active: true }, select: { id: true } });
const h = {
  'content-type': 'application/json',
  authorization: 'Bearer ' + jwt.sign({ id: ad.id, role: 'ADMIN', hostId: null }, process.env.JWT_SECRET, { expiresIn: '10m' }),
  'x-ho-tro': jwt.sign({ loai: 'ho-tro', adminId: ad.id, hostId: can.hostId }, process.env.JWT_SECRET, { expiresIn: '10m' }),
};
console.log(`Căn #${can.id} ${can.name} · khối đang lưu: ${can.lichSheetCot || '(chưa có)'}`);
const t0 = Date.now();
const r = await fetch(`${G}/v1/homes/${can.id}/lich/thu-doc`, { method: 'POST', headers: h, body: JSON.stringify({ lichLink: can.lichLink }) });
const j = await r.json();
console.log(`HTTP ${r.status} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!r.ok) { console.log(j); process.exit(1); }
console.log(`tab: ${j.tab} · ${j.khoi.length} khối trong bảng · khớp: ${j.khop || '✕ KHÔNG KHỚP'}`);
if (j.lyDo) console.log('  ' + j.lyDo);
console.log(`${j.ngay.length} đêm tới:`);
console.log('  ' + j.ngay.map((n) => (n.trong ? '·' : '█')).join(''));
console.log('  bận: ' + j.ngay.filter((n) => !n.trong).map((n) => n.ngay.slice(5)).join(' '));
console.log('Vài khối khác trong bảng:', j.khoi.slice(0, 8).join(' | '));
await db.$disconnect();
