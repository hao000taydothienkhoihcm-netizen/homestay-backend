// Kiểm BẢN THẬT trên Render: đang chạy commit nào, kho ảnh đã nhận khoá chưa.
// Ký vé admin bằng JWT_SECRET trong .env — không gõ mật khẩu của ai.
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const APP = 'https://homestay-backend-n61g.onrender.com';
const CHO = 'https://sabi-marketplace.onrender.com';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } }, log: ['error'] });

const lay = async (u) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(90000) }); return { ok: r.ok, status: r.status, text: await r.text() }; } catch (e) { return { ok: false, status: 0, text: e.message }; } };

console.log('(gói Free ngủ khi không ai dùng — lần gọi đầu có thể chờ ~1 phút)\n');

for (const [ten, u] of [['App nội bộ', APP], ['Chợ căn', CHO]]) {
  const r = await lay(u + '/build-info.json');
  let j = null; try { j = JSON.parse(r.text); } catch { /* trả HTML = chưa có file */ }
  console.log(`${ten} — ${u}`);
  console.log(j
    ? `   build ${j.web_commit_ngan} (${j.repo || 'sabihome'}) lúc ${String(j.build_luc).slice(0, 16).replace('T', ' ')}`
    : `   chưa có build-info.json (HTTP ${r.status}) -> đang chạy bản cũ hơn`);
}

// Kho ảnh: phải có vé mới gọi được
const ad = await db.user.findFirst({ where: { role: 'ADMIN', active: true }, select: { id: true } });
const ve = jwt.sign({ id: ad.id, role: 'ADMIN', hostId: null }, process.env.JWT_SECRET, { expiresIn: '10m' });
const r = await fetch(`${APP}/v1/homes/anh/trang-thai`, { headers: { authorization: 'Bearer ' + ve }, signal: AbortSignal.timeout(90000) });
const t = await r.text();
console.log(`\nKho ảnh trên bản thật -> HTTP ${r.status}`);
console.log('   ' + t.slice(0, 200));
try {
  const j = JSON.parse(t);
  console.log(j.bat
    ? '   ✓ Render đã nhận đủ 5 khoá R2 — nút chọn ảnh sẽ hiện trên bản thật.'
    : '   ✕ Chưa nhận được khoá: ' + (j.viSao || '(không rõ)'));
} catch { console.log('   ✕ Không phải JSON — route chưa có trên bản đang chạy.'); }
await db.$disconnect();
