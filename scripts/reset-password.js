// Đặt lại mật khẩu + mở khóa 1 tài khoản
// Chạy: node scripts/reset-password.js <username> <mật khẩu mới>
// VD:   node scripts/reset-password.js haotran 251144825
import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma.js';

async function main() {
  const [, , rawUser, newPass] = process.argv;
  if (!rawUser || !newPass) {
    console.log('Cách dùng: node scripts/reset-password.js <username> <mật khẩu mới>');
    process.exit(1);
  }
  const username = rawUser.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.log(`Không tìm thấy user "${username}".`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { username },
    data: { password: bcrypt.hashSync(newPass, 10), active: true }
  });
  console.log(`✔ Đã đặt lại mật khẩu & mở khóa cho "${username}" (${user.name}).`);
}

main()
  .catch((e) => { console.error('Lỗi:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
