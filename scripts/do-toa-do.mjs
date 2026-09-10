// Dò toạ độ cho căn trên NHÁNH THỬ, từ địa chỉ, bằng Photon (nền OpenStreetMap).
//
// CHỈ LÀ ĐƯỜNG LUI. Toạ độ dò từ địa chỉ luôn được đánh dấu `viTriUocChung = true`
// để sales biết là số tạm. Số chuẩn phải do host dán link Google Maps ở màn khai căn.
//
// Ba mức thử, dừng ở mức đầu tiên ra kết quả nằm trong vùng Đà Lạt:
//   1. số nhà + đường   -> đúng nhất
//   2. đường            -> ra giữa con đường, lệch vài trăm mét
//   3. phường           -> ra giữa phường, chỉ đủ để "gần hay xa"
// Mức nào khớp có ghi lại, để biết con số đáng tin tới đâu.
//
//   node scripts/do-toa-do.mjs          -> dò và ghi vào nhánh thử
//   node scripts/do-toa-do.mjs --xem    -> chỉ dò, in ra, không ghi
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import { trongDaLat, khoangCachKm } from '../src/lib/vitri.js';

const XEM = process.argv.includes('--xem');
const url = process.env.DATABASE_URL_THU;
if (!url) { console.error('✕ Thieu DATABASE_URL_THU'); process.exit(1); }
const host = (u) => (u.match(/@([^/]+)/) || [, '?'])[1];
if (host(url) === host(process.env.DATABASE_URL || '')) {
  console.error('✕ Cung endpoint voi production. Dung.'); process.exit(1);
}

const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });
const BO_NHO = new URL('./du-lieu/toado-da-do.json', import.meta.url);
const nho = fs.existsSync(BO_NHO) ? JSON.parse(fs.readFileSync(BO_NHO, 'utf8')) : {};

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

async function hoiPhoton(q) {
  const u = 'https://photon.komoot.io/api/?limit=5&lang=default'
    + '&lat=11.9415&lon=108.4372'                       // ưu tiên kết quả quanh Đà Lạt
    + '&bbox=108.0,11.5,108.9,12.4'
    + '&q=' + encodeURIComponent(q);
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'SabiHome/1.0 (noi bo, thu nghiem)' } });
    if (!r.ok) return null;
    const j = await r.json();
    for (const f of j.features || []) {
      const [lng, lat] = f.geometry?.coordinates || [];
      if (trongDaLat(lat, lng)) return { lat, lng, ten: f.properties?.name || '' };
    }
  } catch { /* mạng lỗi thì bỏ qua căn này, chạy lại sau */ }
  return null;
}

/** Bỏ phần trong ngoặc ("( P.10 cũ)") và mấy chữ thừa làm máy dò lạc. */
const don = (s) => String(s || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

const rows = await db.home.findMany({
  where: { desc: { startsWith: 'GOODSTAY' } },
  select: { id: true, name: true, address: true, street: true, ward: true, lat: true, lng: true },
  orderBy: { id: 'asc' },
});
console.log(`${rows.length} can can do toa do${XEM ? ' (chi xem)' : ''}\n`);

const dem = { soNha: 0, duong: 0, phuong: 0, khong: 0, sanCo: 0 };
let i = 0;
for (const r of rows) {
  i++;
  if (r.lat != null && r.lng != null) { dem.sanCo++; continue; }

  const duong = don(r.street);
  const phuong = don(r.ward);
  const thu = [
    duong ? [`${duong}, Da Lat, Lam Dong`, 'soNha'] : null,
    duong ? [`${duong.replace(/^[\d/]+\s*/, '')}, Da Lat, Lam Dong`, 'duong'] : null,
    phuong ? [`${phuong}, Da Lat, Lam Dong`, 'phuong'] : null,
  ].filter(Boolean);

  let ket = null, mucKhop = 'khong';
  for (const [q, muc] of thu) {
    if (nho[q] === null) continue;                       // đã hỏi, không có kết quả
    if (nho[q]) { ket = nho[q]; mucKhop = muc; break; }
    await nghi(1100);                                    // lịch sự với máy chủ miễn phí
    const t = await hoiPhoton(q);
    nho[q] = t;
    fs.writeFileSync(BO_NHO, JSON.stringify(nho, null, 1));
    if (t) { ket = t; mucKhop = muc; break; }
  }

  dem[mucKhop]++;
  const km = ket ? khoangCachKm(ket.lat, ket.lng) : null;
  console.log(`${String(i).padStart(3)}. #${r.id} ${r.name.slice(0, 26).padEnd(26)} ${mucKhop.padEnd(7)} ${km == null ? '—' : km + ' km'}`);

  if (!XEM && ket) {
    await db.home.update({
      where: { id: r.id },
      data: { lat: ket.lat, lng: ket.lng, viTriUocChung: true, kmTrungTam: km },
    });
  }
}

console.log('\nKhop theo so nha:', dem.soNha, '· theo duong:', dem.duong,
  '· theo phuong:', dem.phuong, '· khong ra:', dem.khong, '· da co san:', dem.sanCo);
await db.$disconnect();
