// Bu cot kmTrungTam cho nhung can GOODSTAY da nhap truoc khi co cot nay.
// CHI chay tren NHANH THU. Doi chieu theo ma G-xxx nam trong truong desc.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const url = process.env.DATABASE_URL_THU;
if (!url) { console.error('✕ Thieu DATABASE_URL_THU'); process.exit(1); }
const host = (u) => (u.match(/@([^/]+)/) || [, '?'])[1];
if (host(url) === host(process.env.DATABASE_URL || '')) {
  console.error('✕ Cung endpoint voi production. Dung.'); process.exit(1);
}

const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });
const CAN = JSON.parse(fs.readFileSync(new URL('./du-lieu/can-goodstay.json', import.meta.url), 'utf8'));
const kmTheoMa = new Map(CAN.filter((c) => Number.isFinite(c.km)).map((c) => [c.ma, c.km]));

const rows = await db.home.findMany({
  where: { desc: { startsWith: 'GOODSTAY' } },
  select: { id: true, desc: true, kmTrungTam: true, landmark: true },
});
let sua = 0, thieu = 0;
for (const r of rows) {
  const ma = (r.desc.match(/G-\d+/) || [])[0];
  const km = ma ? kmTheoMa.get(ma) : undefined;
  if (km === undefined) { thieu++; continue; }
  // landmark cu ghi "cach cho Da Lat X km" — gio da co cot rieng nen bo di,
  // khong the de the can noi hai lan cung mot thu.
  const boLandmark = { landmark: null };
  if (r.kmTrungTam === km && r.landmark == null) continue;
  await db.home.update({ where: { id: r.id }, data: { kmTrungTam: km, ...boLandmark } });
  sua++;
}
console.log(`Can GOODSTAY: ${rows.length} · da ghi km cho ${sua} can · ${thieu} can bang khong ghi km`);
const co = await db.home.count({ where: { kmTrungTam: { not: null } } });
console.log('Tong can co km:', co);
await db.$disconnect();
