// Sau khi khoi phuc, tao ban ghi MOI co bi dung id cu khong?
//
// Postgres khong tu day bo dem id len theo du lieu chen tay. Khong sua thi ban
// ghi moi lay id 1, 2, 3... trung voi id da co -> loi trung khoa, app gay ngay
// khi host tao booking dau tien sau khi khoi phuc. phuc-hoi.mjs co buoc setval
// de xu ly, script nay kiem xem buoc do co that su chay khong.
//
// Chay tren NHANH NHAP, va tu xoa ban ghi vua tao.
//   set TEST_DB_URL=<chuoi ket noi nhanh nhap>
//   node scripts/thu-bo-dem-id.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const URL_THU = process.env.TEST_DB_URL;
if (!URL_THU) { console.log('\nThieu TEST_DB_URL.\n'); process.exit(1); }

const host = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const dinhDanh = (h) => (h.split('.')[0] || '').replace(/-pooler$/, '');
if (dinhDanh(host(URL_THU)) === dinhDanh(host(process.env.DATABASE_URL || ''))) {
  console.log('\n  DUNG LAI: TEST_DB_URL trung endpoint voi DATABASE_URL that.\n');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: URL_THU } } });
let loi = 0;
const bao = (ok, msg) => { if (!ok) loi++; console.log(`${ok ? '  OK  ' : ' SAI  '} ${msg}`); };

console.log(`\nNhanh nhap: ${host(URL_THU)}\n`);

const maxHost = (await prisma.host.aggregate({ _max: { id: true } }))._max.id;
const maxHome = (await prisma.home.aggregate({ _max: { id: true } }))._max.id;
console.log(`  id lon nhat dang co:  host ${maxHost}   home ${maxHome}\n`);

// Thu tao mot Host moi
let hostMoi = null;
try {
  hostMoi = await prisma.host.create({ data: { name: 'ZZZ thu bo dem', active: false } });
  bao(hostMoi.id > maxHost, `tao Host moi -> id ${hostMoi.id} (phai lon hon ${maxHost})`);
} catch (e) {
  bao(false, `tao Host moi that bai: ${String(e.message).split('\n').find((l) => l.trim())}`);
}

// Thu tao mot Home moi (bang co nhieu dong hon, de lo neu setval sai)
let homeMoi = null;
try {
  homeMoi = await prisma.home.create({
    data: { name: 'ZZZ thu bo dem', address: 'thu', price: 1, maxGuests: 1, hostId: maxHost },
  });
  bao(homeMoi.id > maxHome, `tao Home moi -> id ${homeMoi.id} (phai lon hon ${maxHome})`);
} catch (e) {
  bao(false, `tao Home moi that bai: ${String(e.message).split('\n').find((l) => l.trim())}`);
}

// Don sach
if (homeMoi) await prisma.home.delete({ where: { id: homeMoi.id } }).catch(() => {});
if (hostMoi) await prisma.host.delete({ where: { id: hostMoi.id } }).catch(() => {});
const conRac = await prisma.host.count({ where: { name: 'ZZZ thu bo dem' } })
             + await prisma.home.count({ where: { name: 'ZZZ thu bo dem' } });
bao(conRac === 0, `da don sach ban ghi thu (con ${conRac})`);

console.log('\n' + '='.repeat(58));
console.log(loi === 0
  ? '  BO DEM ID DUNG — khoi phuc xong tao ban ghi moi binh thuong.'
  : `  CO ${loi} MUC SAI — khoi phuc xong se gay khi tao ban ghi moi.`);
console.log('='.repeat(58) + '\n');

await prisma.$disconnect();
process.exit(loi === 0 ? 0 : 1);
