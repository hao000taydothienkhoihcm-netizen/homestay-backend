// Dien tap mat du lieu tren MOT NHANH NHAP cua Neon.
//
// Mot ban sao luu chua tung khoi phuc thu thi chua goi la ban sao luu.
// Script nay dien tap dung kich ban that:
//   1. Ghi lai "dau van tay" du lieu dang co (dem tung bang + noi dung 5 booking)
//   2. XOA SACH booking va charge — gia lap mat du lieu
//   3. Chung minh no mat that
//   4. (nguoi dung chay phuc-hoi.mjs --ghi-that)
//   5. Doi chieu dau van tay sau khi khoi phuc voi truoc khi xoa
//
// Chay:
//   set TEST_DB_URL=<chuoi ket noi cua NHANH NHAP>
//   node scripts/thu-kich-ban-mat-du-lieu.mjs truoc     -> ghi dau van tay + xoa
//   node scripts/thu-kich-ban-mat-du-lieu.mjs sau       -> doi chieu
//
// AN TOAN: tu choi chay neu TEST_DB_URL trung endpoint voi DATABASE_URL trong .env.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const buoc = process.argv[2];
if (!['truoc', 'sau'].includes(buoc)) {
  console.log('\nDung: node scripts/thu-kich-ban-mat-du-lieu.mjs truoc|sau\n');
  process.exit(1);
}

const URL_THU = process.env.TEST_DB_URL;
if (!URL_THU) { console.log('\nThieu TEST_DB_URL (chuoi ket noi cua nhanh nhap).\n'); process.exit(1); }

// ───── Chot an toan ─────
const host = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const hostThu = host(URL_THU);
const hostThat = host(process.env.DATABASE_URL || '');
// Neon dat endpoint id o dau hostname: ep-<ten>-<id>[-pooler].<vung>...
const dinhDanh = (h) => (h.split('.')[0] || '').replace(/-pooler$/, '');

if (!hostThu) { console.log('\nTEST_DB_URL khong hop le.\n'); process.exit(1); }
if (dinhDanh(hostThu) === dinhDanh(hostThat)) {
  console.log('\n  DUNG LAI: TEST_DB_URL tro vao CUNG endpoint voi DATABASE_URL that.');
  console.log(`     that : ${hostThat}`);
  console.log(`     thu  : ${hostThu}`);
  console.log('  Dien tap phai chay tren NHANH NHAP. Khong chay tiep.\n');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: URL_THU } } });
const FILE_DAU = path.resolve(import.meta.dirname, '../dau-van-tay.json');

const BANG = ['host', 'user', 'home', 'homeMonthlyPrice', 'homeDatePrice',
              'holiday', 'chargeTemplate', 'booking', 'charge', 'stockEntry', 'expense'];

async function dauVanTay() {
  const dem = {};
  for (const b of BANG) dem[b] = await prisma[b].count();
  // Lay ca NOI DUNG vai booking de doi chieu tung truong, khong chi dem so dong.
  const mau = await prisma.booking.findMany({
    orderBy: { id: 'asc' }, take: 5,
    select: { id: true, guest: true, phone: true, checkIn: true, checkOut: true,
              totalAmount: true, deposit: true, discount: true, status: true, hostId: true },
  });
  const tongTien = await prisma.booking.aggregate({ _sum: { totalAmount: true, deposit: true } });
  return { dem, mau, tongTien };
}

console.log(`\nNhanh nhap: ${hostThu}`);
console.log(`Nhanh that: ${hostThat}  (khong dung toi)\n`);

if (buoc === 'truoc') {
  const truoc = await dauVanTay();
  fs.writeFileSync(FILE_DAU, JSON.stringify(truoc, null, 2), 'utf8');
  console.log('  Dau van tay TRUOC khi xoa:');
  for (const b of BANG) console.log(`    ${b.padEnd(18)} ${String(truoc.dem[b]).padStart(5)}`);
  console.log(`    tong tien phong    ${Number(truoc.tongTien._sum.totalAmount || 0).toLocaleString('vi-VN')} d`);
  console.log(`    tong tien coc      ${Number(truoc.tongTien._sum.deposit || 0).toLocaleString('vi-VN')} d`);

  console.log('\n  GIA LAP MAT DU LIEU: xoa sach charge + booking…');
  const c = await prisma.charge.deleteMany({});      // charge tro toi booking, xoa truoc
  const b = await prisma.booking.deleteMany({});
  console.log(`    da xoa ${c.count} charge, ${b.count} booking`);

  const conB = await prisma.booking.count();
  const conC = await prisma.charge.count();
  console.log(`    kiem lai: con ${conB} booking, ${conC} charge`);
  console.log(conB === 0 && conC === 0 ? '    -> mat that roi.\n' : '    -> XOA CHUA SACH?\n');

  console.log('  Buoc tiep: chay phuc-hoi.mjs --ghi-that voi DATABASE_URL tro vao nhanh nhap,');
  console.log('  roi chay lai script nay voi tham so "sau".\n');
} else {
  if (!fs.existsSync(FILE_DAU)) { console.log('  Chua co dau-van-tay.json. Chay buoc "truoc" da.\n'); process.exit(1); }
  const truoc = JSON.parse(fs.readFileSync(FILE_DAU, 'utf8'));
  const sau = await dauVanTay();

  let loi = 0;
  const bao = (ok, msg) => { if (!ok) loi++; console.log(`${ok ? '  OK  ' : ' SAI  '} ${msg}`); };

  console.log('  So dong tung bang:');
  for (const b of BANG) {
    bao(truoc.dem[b] === sau.dem[b], `${b.padEnd(18)} ${String(truoc.dem[b]).padStart(5)} -> ${String(sau.dem[b]).padStart(5)}`);
  }

  console.log('\n  Tien bac:');
  const t1 = Number(truoc.tongTien._sum.totalAmount || 0), s1 = Number(sau.tongTien._sum.totalAmount || 0);
  const t2 = Number(truoc.tongTien._sum.deposit || 0), s2 = Number(sau.tongTien._sum.deposit || 0);
  bao(t1 === s1, `tong tien phong  ${t1.toLocaleString('vi-VN')} -> ${s1.toLocaleString('vi-VN')} d`);
  bao(t2 === s2, `tong tien coc    ${t2.toLocaleString('vi-VN')} -> ${s2.toLocaleString('vi-VN')} d`);

  console.log('\n  Doi chieu tung truong cua 5 booking dau:');
  bao(truoc.mau.length === sau.mau.length, `so booking mau ${truoc.mau.length} -> ${sau.mau.length}`);
  for (let i = 0; i < Math.min(truoc.mau.length, sau.mau.length); i++) {
    const a = truoc.mau[i], b = sau.mau[i];
    const khop = JSON.stringify(a) === JSON.stringify(b);
    bao(khop, `#${a.id} ${String(a.guest).slice(0, 18).padEnd(18)} ${new Date(a.checkIn).toISOString().slice(0, 10)} ${Number(a.totalAmount).toLocaleString('vi-VN')}d`);
    if (!khop) { console.log('        truoc: ' + JSON.stringify(a)); console.log('        sau  : ' + JSON.stringify(b)); }
  }

  console.log('\n' + '='.repeat(58));
  console.log(loi === 0
    ? '  KHOI PHUC DUNG NGUYEN VEN — ban sao luu dung duoc that.'
    : `  CO ${loi} CHO KHONG KHOP — ban sao luu CHUA dung duoc.`);
  console.log('='.repeat(58) + '\n');
  fs.unlinkSync(FILE_DAU);
  await prisma.$disconnect();
  process.exit(loi === 0 ? 0 : 1);
}

await prisma.$disconnect();
