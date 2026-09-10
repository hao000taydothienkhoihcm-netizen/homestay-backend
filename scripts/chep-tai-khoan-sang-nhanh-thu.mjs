// Chep nhung tai khoan CO o ban chinh nhung THIEU o nhanh thu, sang nhanh thu.
// CHI GHI VAO NHANH THU (DATABASE_URL_THU). Khong bao gio dung toi ban chinh.
// Ly do can: nhanh thu duoc tao truoc khi tai khoan moi ra doi, nen dang nhap
// duoi may bao "Tai khoan khong ton tai" du ten/mat khau dung.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const GHI = process.argv.includes('--ghi-that');

const chinhUrl = process.env.DATABASE_URL;
const thuUrl = process.env.DATABASE_URL_THU;
if (!thuUrl) throw new Error('Thieu DATABASE_URL_THU trong .env');
if (new URL(thuUrl).host === new URL(chinhUrl).host) {
  throw new Error('DATABASE_URL_THU dang tro cung endpoint voi ban chinh — dung lai cho chac.');
}

const chinh = new PrismaClient({ datasources: { db: { url: chinhUrl } } });
const thu = new PrismaClient({ datasources: { db: { url: thuUrl } } });

const dsChinh = await chinh.user.findMany({ orderBy: { id: 'asc' } });
const coO = new Set((await thu.user.findMany({ select: { username: true } })).map((u) => u.username));
const thieu = dsChinh.filter((u) => !coO.has(u.username));

console.log(`Ban chinh ${dsChinh.length} tai khoan · nhanh thu thieu ${thieu.length}`);
for (const u of thieu) console.log(`  se chep: #${u.id} ${u.username} (${u.role}) ${u.name}`);

if (!thieu.length) { console.log('Khong co gi phai chep.'); }
else if (!GHI) { console.log('\nMoi chi CHAY THU. Them --ghi-that de chep that.'); }
else {
  for (const u of thieu) {
    // Giu nguyen id + chuoi bam mat khau, de dang nhap bang dung mat khau dang dung.
    await thu.user.create({ data: { ...u } });
    console.log(`  da chep #${u.id} ${u.username}`);
  }
  // Day bo dem id cua Postgres len qua id lon nhat, khong thi tao user moi se dung id.
  const max = await thu.user.aggregate({ _max: { id: true } });
  await thu.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"User"','id'), ${max._max.id})`);
  console.log('Xong.');
}

await chinh.$disconnect();
await thu.$disconnect();
