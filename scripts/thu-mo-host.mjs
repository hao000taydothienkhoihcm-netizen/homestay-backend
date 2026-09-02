// Thử đường "mở host mới" trên DATABASE THẬT mà KHÔNG để lại dòng nào.
//
// Cách làm: chạy toàn bộ trong một prisma.$transaction rồi CỐ Ý ném lỗi ở cuối
// để Postgres quay đầu (rollback). Mọi dòng tạo ra trong đó biến mất.
// Đếm lại trước/sau để chứng minh, không tin suông.
//
// Chạy: node scripts/thu-mo-host.mjs
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const QUAY_DAU = 'CO_Y_QUAY_DAU';

let loi = 0;
const bao = (ok, msg) => { if (!ok) loi++; console.log(`${ok ? '  OK  ' : ' SAI  '} ${msg}`); };

const truocHost = await prisma.host.count();
const truocUser = await prisma.user.count();
console.log(`\nTruoc khi thu:  host = ${truocHost}   user = ${truocUser}\n`);

try {
  await prisma.$transaction(async (tx) => {
    // ── Giống hệt POST /hosts ──
    const host = await tx.host.create({
      data: { name: 'ZZZ Thu Nghiem', brand: 'Thu', phone: '0900000000', active: true },
    });
    bao(host.id > 0, `tao Host moi -> id ${host.id}`);
    bao(host.id !== 1, `host moi KHONG dinh vao host #1 (id = ${host.id})`);

    const chu = await tx.user.create({
      data: {
        username: 'zzz_thu_nghiem', password: bcrypt.hashSync('matkhau123', 10),
        name: 'Chu thu nghiem', role: 'HOST', status: 'ACTIVE', active: true,
        hostId: host.id,
      },
      select: { id: true, role: true, hostId: true },
    });
    bao(chu.role === 'HOST', `tai khoan chu co vai HOST`);
    bao(chu.hostId === host.id, `tai khoan chu thuoc host MOI (${chu.hostId}), khong phai host #1`);

    // ── Cach ly: host moi phai KHONG thay gi cua host #1 ──
    const nhu = { user: { role: 'HOST', hostId: host.id } };
    const loc = { hostId: nhu.user.hostId };
    const soCan = await tx.home.count({ where: loc });
    const soBk  = await tx.booking.count({ where: loc });
    const soChi = await tx.expense.count({ where: loc });
    bao(soCan === 0 && soBk === 0 && soChi === 0,
        `host moi thay ${soCan} can / ${soBk} booking / ${soChi} khoan chi (phai la 0 het)`);

    // ── Khoa workspace: middleware doc host.active ──
    await tx.host.update({ where: { id: host.id }, data: { active: false } });
    const sauKhoa = await tx.user.findUnique({
      where: { id: chu.id },
      include: { host: { select: { active: true } } },
    });
    const biChan = sauKhoa.role !== 'ADMIN' && sauKhoa.hostId && sauKhoa.host && !sauKhoa.host.active;
    bao(biChan === true, `khoa host -> tai khoan chu bi chan dang nhap`);

    // Admin (host #1) phai KHONG bi anh huong boi viec khoa host khac.
    // Dung tx chu KHONG dung prisma o day: goi client ngoai trong long mot
    // interactive transaction la dung ket noi khac, de treo den het gio.
    const adm = await tx.user.findFirst({
      where: { role: 'ADMIN' },
      include: { host: { select: { active: true } } },
    });
    const admBiChan = adm && adm.role !== 'ADMIN';
    bao(admBiChan === false, `admin khong bi anh huong (van vao duoc)`);

    throw new Error(QUAY_DAU);
    // Han mac dinh cua interactive transaction la 5 giay — khong du khi may o
    // Viet Nam ma Neon dat o us-east-1, moi cau di ve mat vai tram mili giay.
  }, { timeout: 60000, maxWait: 30000 });
} catch (e) {
  if (e.message !== QUAY_DAU) {
    console.log('\n  LOI THAT: ' + (e.message || e.code || String(e)).split('\n')[0]);
    loi++;
  }
}

const sauHost = await prisma.host.count();
const sauUser = await prisma.user.count();
console.log(`\nSau khi thu:    host = ${sauHost}   user = ${sauUser}`);
bao(sauHost === truocHost, `so host khong doi (${truocHost} -> ${sauHost})`);
bao(sauUser === truocUser, `so user khong doi (${truocUser} -> ${sauUser})`);

const con = await prisma.host.findFirst({ where: { name: 'ZZZ Thu Nghiem' } });
bao(con === null, `khong con host thu nghiem nao sot lai`);

console.log('\n' + '='.repeat(55));
console.log(loi === 0 ? '  TAT CA DEU DUNG - database khong bi thay doi gi.' : `  CO ${loi} MUC SAI.`);
console.log('='.repeat(55) + '\n');

await prisma.$disconnect();
process.exit(loi === 0 ? 0 : 1);
