// Thử NÚT "Chọn ảnh từ máy" — đi đúng đường form khai căn đi: qua API, có kiểm quyền,
// ghi vào coverImages của căn, rồi gỡ ra. Chạy trên NHÁNH THỬ.
import 'dotenv/config';
import zlib from 'node:zlib';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const G = process.env.API_THU || 'http://localhost:3201';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });

const can = await db.home.findFirst({ where: { desc: { startsWith: 'GOODSTAY' } }, select: { id: true, name: true, hostId: true, coverImages: true }, orderBy: { id: 'asc' } });
const ad = await db.user.findFirst({ where: { role: 'ADMIN', active: true }, select: { id: true } });
const H = {
  authorization: 'Bearer ' + jwt.sign({ id: ad.id, role: 'ADMIN', hostId: null }, process.env.JWT_SECRET, { expiresIn: '10m' }),
  'x-ho-tro': jwt.sign({ loai: 'ho-tro', adminId: ad.id, hostId: can.hostId }, process.env.JWT_SECRET, { expiresIn: '10m' }),
};
console.log(`Căn thử: #${can.id} ${can.name} · đang có ${(can.coverImages || []).length} ảnh\n`);

// Ảnh giả 96×96 (cùng cách vẽ với thu-kho-anh.mjs)
function taoPng(w, h, mau) {
  const B = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = B[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const khoi = (t, d0) => { const d = Buffer.concat([Buffer.from(t, 'ascii'), d0]); const r = Buffer.alloc(8 + d0.length + 4); r.writeUInt32BE(d0.length, 0); d.copy(r, 4); r.writeUInt32BE(crc(d), 8 + d0.length); return r; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const t = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) { const d = y * (1 + w * 3); for (let x = 0; x < w; x++) { const i = d + 1 + x * 3; t[i] = mau[0]; t[i + 1] = mau[1]; t[i + 2] = mau[2]; } }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), khoi('IHDR', ih), khoi('IDAT', zlib.deflateSync(t)), khoi('IEND', Buffer.alloc(0))]);
}

const goi = (p, o) => fetch(G + p, { ...o, headers: { ...H, ...(o?.headers || {}) } });

// 1. Kho đã bật chưa (form hỏi câu này để quyết hiện nút hay hiện ô dán link)
const tt = await (await goi('/v1/homes/anh/trang-thai')).json();
console.log(`1. /anh/trang-thai -> bật: ${tt.bat}${tt.viSao ? ' · ' + tt.viSao : ''}`);
if (!tt.bat) { console.error('   ✕ Máy chủ chưa đọc được khoá R2 — nhớ khởi động lại server sau khi sửa .env.'); process.exit(1); }

// 2. Đẩy một tấm
const anh = taoPng(96, 96, [74, 107, 82]);
const r2 = await goi(`/v1/homes/${can.id}/anh`, { method: 'POST', body: anh, headers: { 'content-type': 'image/png' } });
const j2 = await r2.json();
console.log(`2. POST /anh -> ${r2.status} ${r2.ok ? '✓' : '✕ ' + j2.error}`);
if (!r2.ok) process.exit(1);
console.log(`   ${j2.url}`);
console.log(`   căn giờ có ${j2.coverImages.length} ảnh`);

// 3. Ảnh có mở được thật không
const r3 = await fetch(j2.url);
console.log(`3. Mở link -> HTTP ${r3.status} · ${r3.headers.get('content-type')}`);

// 4. Chặn file không phải ảnh
const r4 = await goi(`/v1/homes/${can.id}/anh`, { method: 'POST', body: Buffer.from('%PDF-1.7 day khong phai anh'), headers: { 'content-type': 'image/png' } });
console.log(`4. Đẩy file giả mạo (PDF khai là image/png) -> ${r4.status} ${r4.status === 400 ? '✓ chặn đúng' : '✕ LỌT'}`);

// 5. Không có vé thì phải bị chặn
const r5 = await fetch(`${G}/v1/homes/${can.id}/anh`, { method: 'POST', body: anh, headers: { 'content-type': 'image/png' } });
console.log(`5. Đẩy khi chưa đăng nhập -> ${r5.status} ${r5.status === 401 ? '✓ chặn đúng' : '✕ LỌT'}`);

// 6. Gỡ ảnh
const r6 = await goi(`/v1/homes/${can.id}/anh?url=${encodeURIComponent(j2.url)}`, { method: 'DELETE' });
const j6 = await r6.json();
console.log(`6. DELETE /anh -> ${r6.status} · còn ${j6.coverImages.length} ảnh · xoá khỏi kho: ${j6.daXoaKho}`);
const r7 = await fetch(j2.url);
console.log(`7. Mở lại link đã gỡ -> HTTP ${r7.status} ${r7.status === 404 ? '✓ đã mất' : '⚠ vẫn còn'}`);

const sau = await db.home.findUnique({ where: { id: can.id }, select: { coverImages: true } });
console.log(`\nHồ sơ căn sau cùng: ${sau.coverImages.length} ảnh (ban đầu ${(can.coverImages || []).length})`);
console.log(sau.coverImages.length === (can.coverImages || []).length ? '✓ TRẢ VỀ NGUYÊN TRẠNG — luồng ảnh chạy đúng.' : '⚠ số ảnh lệch so với ban đầu');
await db.$disconnect();
