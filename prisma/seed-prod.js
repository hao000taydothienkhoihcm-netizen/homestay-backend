// ═══════════════════════════════════════
// SEED PROD — An toàn cho cloud
// Chỉ tạo admin + charge templates NẾU database còn trống.
// KHÔNG xóa dữ liệu. Chạy lại nhiều lần vẫn an toàn.
// ═══════════════════════════════════════
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log(`✓ Đã có ${userCount} user, bỏ qua seed (giữ nguyên dữ liệu).`);
    return;
  }

  console.log('🌱 Database trống — tạo admin mặc định...');
  await prisma.user.create({
    data: {
      username: 'admin',
      password: bcrypt.hashSync('admin123', 10),
      name: 'Admin',
      email: 'admin@homestay.vn',
      role: 'ADMIN',
      active: true
    }
  });

  await prisma.chargeTemplate.createMany({
    data: [
      { name: 'Ói mửa / dọn dẹp đặc biệt', amount: 500000, type: 'RULE' },
      { name: 'Không rửa chén / chén nhiều', amount: 350000, type: 'RULE' },
      { name: 'Mất thẻ từ', amount: 250000, type: 'RULE' },
      { name: 'Nước suối 500ml', amount: 10000, type: 'QUICK' },
      { name: 'Nước suối 1.5L', amount: 15000, type: 'QUICK' },
      { name: 'Nước ngọt (lon)', amount: 15000, type: 'QUICK' },
      { name: 'Bia lon', amount: 25000, type: 'QUICK' },
      { name: 'Mì gói', amount: 10000, type: 'QUICK' },
      { name: 'Khăn tắm', amount: 30000, type: 'QUICK' },
      { name: 'Giặt khăn', amount: 20000, type: 'QUICK' }
    ]
  });

  console.log('✅ Đã tạo admin / admin123 và các mẫu phụ thu.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
