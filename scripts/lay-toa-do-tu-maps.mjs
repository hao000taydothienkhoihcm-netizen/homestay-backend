// Lấy toạ độ CHÍNH XÁC từ link Google Maps mà chủ nhà đã ghi sẵn trong rổ hàng,
// thay cho toạ độ máy tự dò từ địa chỉ (đang mang dấu ≈ trên chợ).
//
//   node scripts/lay-toa-do-tu-maps.mjs         -> xem trước
//   node scripts/lay-toa-do-tu-maps.mjs --ghi   -> ghi vào NHÁNH THỬ
import 'dotenv/config';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { docViTri, khoangCachKm, TRUNG_TAM } from '../src/lib/vitri.js';

const GHI = process.argv.includes('--ghi');
const url = process.env.DATABASE_URL_THU;
if (!url) { console.error('✕ Thiếu DATABASE_URL_THU'); process.exit(1); }
const host = (u) => (u.match(/@([^/]+)/) || [, '?'])[1];
if (host(url) === host(process.env.DATABASE_URL || '')) {
  console.error('✕ Cùng endpoint với production. Dừng.'); process.exit(1);
}
const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });

const ro = JSON.parse(fs.readFileSync(new URL('./du-lieu/ro-hang-goodstay.json', import.meta.url), 'utf8'));
const mapsTheoMa = new Map(ro.filter((x) => x.linkMaps).map((x) => [x.ma, x.linkMaps]));

const can = await db.home.findMany({
  where: { desc: { startsWith: 'GOODSTAY' } },
  select: { id: true, name: true, desc: true, kmTrungTam: true, viTriUocChung: true },
  orderBy: { id: 'asc' },
});
console.log(`${can.length} căn · ${mapsTheoMa.size} căn có link Maps · mốc: ${TRUNG_TAM.ten}\n`);

let ra = 0, hong = 0, doiNhieu = 0;
for (const c of can) {
  const ma = (c.desc.match(/G-\d+/) || [])[0];
  const link = ma ? mapsTheoMa.get(ma) : null;
  if (!link) continue;

  const t = await docViTri(link);
  if (!t) { hong++; console.log(`  ${ma} ${c.name.slice(0, 24).padEnd(24)} ✕ không bóc được toạ độ`); continue; }
  ra++;
  const cu = c.kmTrungTam;
  const lechNhieu = cu != null && Math.abs(cu - t.km) >= 1;
  if (lechNhieu) doiNhieu++;
  console.log(`  ${ma} ${c.name.slice(0, 24).padEnd(24)} ${String(t.km).padStart(5)} km ${cu != null ? `(trước ≈${cu})` : ''}${lechNhieu ? '  ← lệch nhiều' : ''}${t.daDao ? ' [toạ độ bị đảo, đã sửa]' : ''}`);

  if (GHI) {
    await db.home.update({
      where: { id: c.id },
      data: { mapLink: link, lat: t.lat, lng: t.lng, kmTrungTam: t.km, viTriUocChung: false },
    });
  }
}

const conUoc = await db.home.count({ where: { desc: { startsWith: 'GOODSTAY' }, viTriUocChung: true } });
console.log(`\nLấy được toạ độ thật: ${ra} · không bóc được: ${hong} · lệch trên 1 km so với số dò: ${doiNhieu}`);
console.log(GHI ? `Đã ghi. Còn ${conUoc} căn vẫn là số ước chừng.` : 'Thêm --ghi để ghi thật.');
await db.$disconnect();
