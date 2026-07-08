// Xem toàn bộ user trong DB — chạy: node scripts/list-users.js
import { prisma } from '../src/prisma.js';

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, name: true, role: true, active: true },
    orderBy: { id: 'asc' }
  });
  console.log(`Tổng ${users.length} tài khoản:\n`);
  users.forEach(u => {
    console.log(`#${u.id}  username="${u.username}"  tên="${u.name}"  vai trò=${u.role}  ${u.active ? 'ĐANG HOẠT ĐỘNG' : '⛔ BỊ KHÓA'}`);
  });
}

main()
  .catch((e) => { console.error('Lỗi:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
