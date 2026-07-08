// ═══════════════════════════════════════
// BOOKING SERVICE — Business logic
// ═══════════════════════════════════════
import { prisma } from '../prisma.js';

/**
 * Kiểm tra trùng lịch
 * Quy tắc:
 *   - Nhận nhà 14:00, trả nhà 12:00
 *   - Khách A trả 12/5 12:00 → Khách B nhận 12/5 14:00 = OK ✓
 *   - co_A === ci_B → không tính là trùng (vì giờ khác nhau)
 *   - Bỏ qua booking đã CHECKEDOUT
 */
export async function checkBookingConflict(homeId, checkIn, checkOut, excludeId = null) {
  const ci = new Date(checkIn);
  const co = new Date(checkOut);
  const ciStr = ci.toISOString().split('T')[0];
  const coStr = co.toISOString().split('T')[0];

  const candidates = await prisma.booking.findMany({
    where: {
      homeId: parseInt(homeId),
      id: excludeId ? { not: parseInt(excludeId) } : undefined,
      status: { not: 'CHECKEDOUT' },
      AND: [
        { checkIn: { lt: co } },
        { checkOut: { gt: ci } }
      ]
    },
    include: { home: true }
  });

  // Filter out same-day swap
  const real = candidates.filter(b => {
    const bCi = b.checkIn.toISOString().split('T')[0];
    const bCo = b.checkOut.toISOString().split('T')[0];
    return !(bCo === ciStr || bCi === coStr);
  });

  return real.length > 0 ? real[0] : null;
}

/**
 * Tính số đêm
 */
export function nights(checkIn, checkOut) {
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(1, Math.ceil(diff / 86400000));
}

/**
 * Một đêm là "cuối tuần" nếu tối bắt đầu rơi vào T6, T7 hoặc CN.
 * getUTCDay: 0=CN, 5=T6, 6=T7
 */
function isWeekendNight(date) {
  const d = new Date(date).getUTCDay();
  return d === 5 || d === 6 || d === 0;
}

/**
 * Tổng tiền phòng theo 2 mức giá (ngày thường / cuối tuần).
 * Đếm từng đêm theo ngày nhận của đêm đó. Nếu home.weekendPrice trống -> dùng price.
 */
export function stayTotal(home, checkIn, checkOut) {
  const wkPrice = (home.weekendPrice != null && home.weekendPrice > 0)
    ? home.weekendPrice : home.price;
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  let total = 0, count = 0;
  // Duyệt từng đêm: từ ngày nhận đến trước ngày trả
  for (let t = start.getTime(); t < end.getTime(); t += 86400000) {
    total += isWeekendNight(t) ? wkPrice : home.price;
    count++;
  }
  if (count === 0) total = home.price; // an toàn: tối thiểu 1 đêm
  return total;
}

/**
 * Tổng tiền thực đã thu vào tay
 */
export function actualReceived(b) {
  return (b.deposit || 0) + (b.paidAtCheckIn || 0) + (b.chargesTotal || 0);
}

/**
 * Tiền còn phải thu (khi chưa nhận nhà)
 */
export function stillOwed(b) {
  if (b.status === 'CHECKEDOUT') return 0;
  return Math.max(0, b.totalAmount - (b.discount || 0) - (b.deposit || 0) - (b.paidAtCheckIn || 0));
}
