// Tách Sabi Home ra khỏi tài khoản admin.
//
// Trước: `admin` mang hostId = 1 (bị coi là nhân sự của Sabi), `haotran` là ADMIN
// thứ hai cũng hostId = 1. Đăng nhập admin là thấy booking mọi host trộn lẫn.
//
// Sau:  `admin`   -> hostId = null   (chủ nền tảng, không thuộc host nào)
//       `haotran` -> role HOST, hostId = 1   (chủ Sabi Home, làm việc hằng ngày)
//
// Chạy trong MỘT giao dịch. Xem trước mặc định, --ghi-that mới ghi.
//   node scripts/tach-sabi-khoi-admin.mjs            (xem)
//   node scripts/tach-sabi-khoi-admin.mjs --ghi-that
// Trỏ vào database nào là do DATABASE_URL (đặt TEST_DB_URL để thử trên nhánh nháp).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const url = process.env.TEST_DB_URL || process.env.DATABASE_URL;
const ghiThat = process.argv.includes('--ghi-that');
const prisma = new PrismaClient({ datasources: { db: { url } } });

const host = (u) => { try { return new URL(u).hostname; } catch { return '?'; } };
console.log(`\nĐANG NHẮM VÀO: ${host(url)}${process.env.TEST_DB_URL ? '   (nhánh nháp)' : '   (DATABASE_URL)'}\n`);

const admin = await prisma.user.findUnique({ where: { username: 'admin' }, select: { id: true, role: true, hostId: true } });
const haotran = await prisma.user.findUnique({ where: { username: 'haotran' }, select: { id: true, role: true, hostId: true } });
const sabi = await prisma.host.findUnique({ where: { id: 1 }, select: { id: true, name: true } });

if (!admin || !haotran || !sabi) {
  console.log('  Thiếu admin / haotran / host #1 — không đúng database này. Dừng.\n');
  await prisma.$disconnect(); process.exit(1);
}

console.log('  Hiện tại:');
console.log(`    admin     role=${admin.role.padEnd(7)} hostId=${admin.hostId}`);
console.log(`    haotran   role=${haotran.role.padEnd(7)} hostId=${haotran.hostId}`);
console.log(`    host #1   ${sabi.name}`);

const daXong = admin.hostId === null && haotran.role === 'HOST' && haotran.hostId === 1;
if (daXong) { console.log('\n  Đã tách rồi, không cần làm gì.\n'); await prisma.$disconnect(); process.exit(0); }

// Không cho phép nếu sẽ làm mất ADMIN cuối cùng.
const soAdminSau = await prisma.user.count({ where: { role: 'ADMIN', id: { not: haotran.id } } });
if (soAdminSau < 1) {
  console.log('\n  DỪNG: sau khi đổi sẽ không còn tài khoản ADMIN nào. Không làm.\n');
  await prisma.$disconnect(); process.exit(1);
}

console.log('\n  Sẽ đổi thành:');
console.log('    admin     role=ADMIN   hostId=null   (chủ nền tảng)');
console.log('    haotran   role=HOST    hostId=1      (chủ Sabi Home)');

if (!ghiThat) {
  console.log('\n  CHƯA GHI GÌ. Chạy lại kèm --ghi-that để ghi.\n');
  await prisma.$disconnect(); process.exit(0);
}

await prisma.$transaction([
  prisma.user.update({ where: { id: admin.id }, data: { hostId: null } }),
  prisma.user.update({ where: { id: haotran.id }, data: { role: 'HOST', hostId: 1 } }),
]);

const a2 = await prisma.user.findUnique({ where: { id: admin.id }, select: { role: true, hostId: true } });
const h2 = await prisma.user.findUnique({ where: { id: haotran.id }, select: { role: true, hostId: true } });
const ok = a2.hostId === null && a2.role === 'ADMIN' && h2.role === 'HOST' && h2.hostId === 1;
console.log(`\n  ${ok ? 'XONG' : 'SAI'}: admin role=${a2.role} hostId=${a2.hostId} | haotran role=${h2.role} hostId=${h2.hostId}\n`);
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
