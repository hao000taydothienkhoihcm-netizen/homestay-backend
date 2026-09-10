// So km may do duoc voi km bang GOODSTAY ghi tay — de biet do tin cua viec do tu dia chi.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });
const CAN = JSON.parse(fs.readFileSync(new URL('./du-lieu/can-goodstay.json', import.meta.url), 'utf8'));
const kmBang = new Map(CAN.map((c) => [c.ma, c.km]));

const rows = await db.home.findMany({
  where: { desc: { startsWith: 'GOODSTAY' } },
  select: { id: true, name: true, desc: true, kmTrungTam: true, lat: true, viTriUocChung: true },
  orderBy: { id: 'asc' },
});

let khop = 0, lech = 0, khong = 0;
const xa = [];
for (const r of rows) {
  const ma = (r.desc.match(/G-\d+/) || [])[0];
  const bang = kmBang.get(ma);
  if (r.lat == null) { khong++; continue; }
  if (bang == null) continue;
  const d = Math.abs(r.kmTrungTam - bang);
  if (d <= 1.5) khop++;
  else { lech++; xa.push({ id: r.id, ten: r.name, bang, may: r.kmTrungTam, d: Math.round(d * 10) / 10 }); }
}
console.log(`Co toa do: ${rows.length - khong}/${rows.length} · lech <=1,5km so voi bang: ${khop} · lech nhieu: ${lech}`);
console.log('\n10 can lech nhieu nhat (bang ghi vs may do):');
xa.sort((a, b) => b.d - a.d).slice(0, 10)
  .forEach((x) => console.log(`  #${x.id} ${x.ten.slice(0, 26).padEnd(26)} bang ${x.bang} km · may ${x.may} km · lech ${x.d}`));

const q = await db.home.groupBy({ by: ['viTriUocChung'], _count: true });
console.log('\nTheo do tin:', q.map((x) => `${x.viTriUocChung ? 'uoc chung' : 'chinh xac'}: ${x._count}`).join(' · '));
await db.$disconnect();
