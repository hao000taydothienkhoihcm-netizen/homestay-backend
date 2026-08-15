// ═══════════════════════════════════════════════════════════
// BACKFILL HOST #1 — gán toàn bộ dữ liệu Sabi cũ về 1 host
// Chạy MỘT LẦN sau khi đã `npx prisma db push` (thêm cột hostId).
//   node prisma/backfill-host.mjs
// AN TOÀN: chỉ tạo Host #1 (nếu chưa có) + set hostId cho các dòng đang NULL.
// Không xoá, không đụng dòng đã có hostId. Chạy lại nhiều lần vẫn ổn.
// ═══════════════════════════════════════════════════════════
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1) Tạo Host #1 nếu chưa có
  let host = await prisma.host.findUnique({ where: { id: 1 } });
  if (!host) {
    host = await prisma.host.create({
      data: { id: 1, name: 'Haotran House', brand: 'Sabi Home', active: true },
    });
    console.log('✔ Đã tạo Host #1: Haotran House / Sabi Home');
  } else {
    console.log('• Host #1 đã tồn tại, bỏ qua tạo mới');
  }

  // 2) Gán hostId = 1 cho mọi dòng đang NULL, từng bảng
  const jobs = [
    ['User',           () => prisma.user.updateMany({ where: { hostId: null }, data: { hostId: 1 } })],
    ['Home',           () => prisma.home.updateMany({ where: { hostId: null }, data: { hostId: 1 } })],
    ['Holiday',        () => prisma.holiday.updateMany({ where: { hostId: null }, data: { hostId: 1 } })],
    ['Booking',        () => prisma.booking.updateMany({ where: { hostId: null }, data: { hostId: 1 } })],
    ['ChargeTemplate', () => prisma.chargeTemplate.updateMany({ where: { hostId: null }, data: { hostId: 1 } })],
    ['StockEntry',     () => prisma.stockEntry.updateMany({ where: { hostId: null }, data: { hostId: 1 } })],
    ['Expense',        () => prisma.expense.updateMany({ where: { hostId: null }, data: { hostId: 1 } })],
  ];

  for (const [name, run] of jobs) {
    const r = await run();
    console.log(`✔ ${name}: gán hostId=1 cho ${r.count} dòng`);
  }

  console.log('\n✅ Backfill xong. Toàn bộ dữ liệu cũ giờ thuộc host #1.');
}

main()
  .catch((e) => { console.error('❌ Lỗi backfill:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
