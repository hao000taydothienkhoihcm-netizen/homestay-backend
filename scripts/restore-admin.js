// ═══════════════════════════════════════
// RESTORE ADMIN — An toàn, KHÔNG xoá gì cả
// Liệt kê users hiện có; nếu thiếu admin thì tạo lại admin/admin123
// Chạy: node scripts/restore-admin.js
// ═══════════════════════════════════════
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
  console.log(`\n📋 Hiện có ${users.length} tài khoản:`);
  users.forEach(u => console.log(`   - ${u.username} | ${u.name} | ${u.role} | ${u.active ? 'active' : 'khoá'}`));

  const existing = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (existing) {
    // Đảm bảo admin đúng quyền + mở khoá + reset mật khẩu về admin123
    await prisma.user.update({
      where: { username: 'admin' },
      data: { password: bcrypt.hashSync('admin123', 10), role: 'ADMIN', active: true }
    });
    console.log('\n✓ Tài khoản "admin" đã có — đã reset mật khẩu về admin123 và mở khoá.');
  } else {
    await prisma.user.create({
      data: {
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        name: 'Quản trị viên',
        email: 'admin@homestay.vn',
        role: 'ADMIN',
        active: true
      }
    });
    console.log('\n✓ Đã tạo lại tài khoản admin.');
  }

  console.log('\n📌 Đăng nhập: admin / admin123');
  console.log('   (Không có dữ liệu nào khác bị đụng tới.)\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
