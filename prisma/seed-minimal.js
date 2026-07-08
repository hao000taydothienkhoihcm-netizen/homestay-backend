// ═══════════════════════════════════════
// SEED MINIMAL — Chỉ tạo admin
// Dùng để test thêm data thủ công
// ═══════════════════════════════════════
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Đang xóa hết data cũ...');

  // Xóa theo thứ tự foreign key
  await prisma.charge.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.home.deleteMany();
  await prisma.user.deleteMany();
  await prisma.chargeTemplate.deleteMany();
  console.log('  ✓ Đã xóa hết bookings, charges, expenses, homes, users, templates');

  console.log('\n🌱 Tạo admin duy nhất...');

  // Chỉ 1 admin
  await prisma.user.create({
    data: {
      username: 'admin',
      password: bcrypt.hashSync('admin123', 10),
      name: 'Nguyễn Minh Admin',
      email: 'admin@homestay.vn',
      role: 'ADMIN',
      active: true
    }
  });
  console.log('  ✓ Created admin user');

  // Charge templates mặc định (để khi trả nhà có sẵn các phụ thu)
  await prisma.chargeTemplate.createMany({
    data: [
      // Rules (phạt)
      { name: 'Ói mửa / dọn dẹp đặc biệt', amount: 500000, type: 'RULE' },
      { name: 'Không rửa chén / chén nhiều', amount: 350000, type: 'RULE' },
      { name: 'Mất thẻ từ', amount: 250000, type: 'RULE' },
      // Quick (tiêu thụ)
      { name: 'Nước suối 500ml',  amount: 10000, type: 'QUICK' },
      { name: 'Nước suối 1.5L',   amount: 15000, type: 'QUICK' },
      { name: 'Nước ngọt (lon)',  amount: 15000, type: 'QUICK' },
      { name: 'Bia lon',          amount: 25000, type: 'QUICK' },
      { name: 'Mì gói',           amount: 10000, type: 'QUICK' },
      { name: 'Khăn tắm',         amount: 30000, type: 'QUICK' },
      { name: 'Giặt khăn',        amount: 20000, type: 'QUICK' }
    ]
  });
  console.log('  ✓ Created charge templates (RULES + QUICK)');

  console.log('\n✅ Hoàn tất! Database sạch.');
  console.log('\n📋 Đăng nhập với:');
  console.log('   admin / admin123');
  console.log('\n💡 Giờ bạn tự thêm:');
  console.log('   - Căn nhà (trang Căn nhà)');
  console.log('   - Booking (trang Booking)');
  console.log('   - Chi phí (trang Thu chi)');
  console.log('   → Xem thống kê có khớp không\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
