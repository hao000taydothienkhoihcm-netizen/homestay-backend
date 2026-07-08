// ═══════════════════════════════════════
// SEED DATABASE — Sample data
// ═══════════════════════════════════════
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const today = new Date();
const addDays = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d;
};

async function main() {
  console.log('🌱 Bắt đầu seed database...');

  // Xóa data cũ (thứ tự quan trọng vì foreign key)
  await prisma.charge.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.home.deleteMany();
  await prisma.user.deleteMany();
  await prisma.chargeTemplate.deleteMany();

  // ───── USERS ─────
  const hashPw = (pw) => bcrypt.hashSync(pw, 10);
  const users = await prisma.user.createMany({
    data: [
      { username: 'admin',    password: hashPw('admin123'),   name: 'Nguyễn Minh Admin', role: 'ADMIN',   email: 'admin@homestay.vn',   active: true },
      { username: 'manager',  password: hashPw('manager123'), name: 'Trần Quản Lý',      role: 'MANAGER', email: 'manager@homestay.vn', active: true },
      { username: 'quanggia', password: hashPw('qg123'),      name: 'Lê Quản Gia',       role: 'STAFF',   email: 'qg@homestay.vn',      active: true },
      { username: 'staff1',   password: hashPw('staff123'),   name: 'Phạm Nhân Viên',    role: 'STAFF',   email: 'staff@homestay.vn',   active: false }
    ]
  });
  console.log(`  ✓ Created ${users.count} users`);

  // ───── HOMES ─────
  const home1 = await prisma.home.create({ data: { name: 'Villa Hồ Bơi',   address: '12 Nguyễn Trãi, Q.1',   price: 3500000, maxGuests: 10, emoji: '🏡', desc: 'Hồ bơi riêng, BBQ' }});
  const home2 = await prisma.home.create({ data: { name: 'Nhà Vườn Xanh',  address: '45 Lê Lợi, Q.3',         price: 2200000, maxGuests: 8,  emoji: '🌿', desc: 'Sân vườn rộng, yên tĩnh' }});
  const home3 = await prisma.home.create({ data: { name: 'Homestay Biển', address: '88 Trần Phú, Vũng Tàu', price: 4000000, maxGuests: 12, emoji: '🌊', desc: 'View biển, gần bãi tắm' }});
  console.log(`  ✓ Created 3 homes`);

  // ───── BOOKINGS ─────
  const b1 = await prisma.booking.create({
    data: {
      guest: 'Nguyễn Văn An', phone: '0901234567', homeId: home1.id,
      checkIn: today, checkInTime: '14:00',
      checkOut: addDays(3), checkOutTime: '12:00',
      guests: 6, totalAmount: 10500000, deposit: 3000000, paidAtCheckIn: 7500000,
      status: 'CHECKEDIN', notes: 'Kỷ niệm 10 năm',
      actualCheckIn: new Date(today.getTime() + 14 * 3600 * 1000 + 10 * 60 * 1000)
    }
  });
  const b2 = await prisma.booking.create({
    data: {
      guest: 'Trần Thị Bình', phone: '0912345678', homeId: home2.id,
      checkIn: addDays(1), checkInTime: '15:00',
      checkOut: addDays(4), checkOutTime: '11:00',
      guests: 5, totalAmount: 6600000, deposit: 2000000,
      status: 'CONFIRMED', notes: 'Tiệc sinh nhật'
    }
  });
  const b3 = await prisma.booking.create({
    data: {
      guest: 'Lê Minh Cường', phone: '0923456789', homeId: home3.id,
      checkIn: addDays(-4), checkInTime: '14:00',
      checkOut: today, checkOutTime: '12:00',
      guests: 8, totalAmount: 16000000, deposit: 5000000, paidAtCheckIn: 11000000,
      status: 'CHECKOUT_TODAY'
    }
  });
  // Booking đã trả với phụ thu
  const b4 = await prisma.booking.create({
    data: {
      guest: 'Phạm Thu Dung', phone: '0934567890', homeId: home1.id,
      checkIn: addDays(-6), checkInTime: '14:00',
      checkOut: addDays(-3), checkOutTime: '12:00',
      guests: 4, totalAmount: 10500000, deposit: 3000000, paidAtCheckIn: 7500000,
      chargesTotal: 0, status: 'CHECKEDOUT',
      actualCheckIn: addDays(-6), actualCheckOut: addDays(-3), waterMeter: 24.5
    }
  });
  const b5 = await prisma.booking.create({
    data: {
      guest: 'Hoàng Gia Bảo', phone: '0945678901', homeId: home2.id,
      checkIn: addDays(5), checkInTime: '14:00',
      checkOut: addDays(8), checkOutTime: '12:00',
      guests: 7, totalAmount: 6600000, deposit: 2000000,
      status: 'CONFIRMED', notes: 'Đến muộn ~22h'
    }
  });
  const b6 = await prisma.booking.create({
    data: {
      guest: 'Đặng Minh Tuấn', phone: '0967890123', homeId: home1.id,
      checkIn: addDays(-15), checkInTime: '14:00',
      checkOut: addDays(-12), checkOutTime: '12:00',
      guests: 9, totalAmount: 10500000, deposit: 3000000, paidAtCheckIn: 7500000,
      chargesTotal: 500000, status: 'CHECKEDOUT',
      actualCheckIn: addDays(-15), actualCheckOut: addDays(-12), waterMeter: 18.2,
      charges: {
        create: [{ name: 'Ói mửa / dọn dẹp đặc biệt', unit: 500000, qty: 1, amount: 500000 }]
      }
    }
  });
  console.log(`  ✓ Created 6 bookings`);

  // ───── EXPENSES ─────
  await prisma.expense.createMany({
    data: [
      { date: addDays(-3), category: 'Điện nước', desc: 'Hóa đơn điện tháng 5', amount: 800000, homeId: home1.id },
      { date: addDays(-5), category: 'Dọn dẹp',   desc: 'Vệ sinh sau khách',    amount: 500000, homeId: home3.id },
      { date: addDays(-2), category: 'Sửa chữa',  desc: 'Sửa máy lạnh',          amount: 700000, homeId: home2.id },
      { date: addDays(-1), category: 'Vật tư',    desc: 'Mua đồ tiêu hao',       amount: 300000, homeId: home1.id }
    ]
  });
  console.log(`  ✓ Created 4 expenses`);

  // ───── CHARGE TEMPLATES ─────
  await prisma.chargeTemplate.createMany({
    data: [
      // Rules (phạt — 1 lần)
      { name: 'Ói mửa / dọn dẹp đặc biệt', amount: 500000, type: 'RULE' },
      { name: 'Không rửa chén / chén nhiều', amount: 350000, type: 'RULE' },
      { name: 'Mất thẻ từ',                 amount: 250000, type: 'RULE' },
      // Quick (tiêu thụ — có qty)
      { name: 'Nước suối 500ml',  amount: 10000, type: 'QUICK' },
      { name: 'Nước suối 1.5L',   amount: 15000, type: 'QUICK' },
      { name: 'Nước ngọt (lon)',  amount: 15000, type: 'QUICK' },
      { name: 'Bia lon',          amount: 25000, type: 'QUICK' },
      { name: 'Mì gói',           amount: 10000, type: 'QUICK' },
      { name: 'Khăn tắm',         amount: 30000, type: 'QUICK' },
      { name: 'Giặt khăn',        amount: 20000, type: 'QUICK' }
    ]
  });
  console.log(`  ✓ Created charge templates`);

  console.log('\n✅ Seed hoàn tất!\n');
  console.log('Demo accounts:');
  console.log('  admin / admin123');
  console.log('  manager / manager123');
  console.log('  quanggia / qg123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
