// ═══════════════════════════════════════
// Xóa TOÀN BỘ booking (và charge kèm theo)
// Chạy: node scripts/clear-bookings.js
// ═══════════════════════════════════════
import { prisma } from '../src/prisma.js';

async function main() {
  const before = await prisma.booking.count();
  console.log(`Đang có ${before} booking. Bắt đầu xóa...`);

  // Charge sẽ tự xóa theo cascade, nhưng xóa tường minh cho chắc
  const delCharges = await prisma.charge.deleteMany({});
  const delBookings = await prisma.booking.deleteMany({});

  console.log(`✔ Đã xóa ${delCharges.count} charge`);
  console.log(`✔ Đã xóa ${delBookings.count} booking`);

  const after = await prisma.booking.count();
  console.log(`Còn lại: ${after} booking`);
}

main()
  .catch((e) => { console.error('Lỗi:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
