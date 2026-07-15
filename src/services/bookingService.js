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

// Booking đã nhận nhà (hoặc muộn hơn) → phụ thu NHẬN nhà đã được thu.
function isCheckedIn(b) {
  return b.status === 'CHECKEDIN' || b.status === 'CHECKOUT_TODAY' || b.status === 'CHECKEDOUT';
}

/**
 * Tổng tiền thực đã thu vào tay.
 * - Phụ thu NHẬN nhà (checkinCharges): thu ngay lúc nhận nhà → tính khi đã CHECKEDIN trở đi.
 * - Phụ thu TRẢ nhà (chargesTotal): chỉ tính là ĐÃ THU khi khách đã trả nhà (CHECKEDOUT).
 */
export function actualReceived(b) {
  const chIn  = isCheckedIn(b) ? (b.checkinCharges || 0) : 0;
  const chOut = b.status === 'CHECKEDOUT' ? (b.chargesTotal || 0) : 0;
  return (b.deposit || 0) + (b.paidAtCheckIn || 0) + chIn + chOut;
}

/**
 * Tiền còn phải thu (khi chưa trả nhà).
 * Nghĩa vụ = tiền phòng sau giảm + phụ thu nhận nhà + phụ thu trả nhà.
 * Đã thu = cọc + thu khi nhận nhà (tiền phòng) + phụ thu nhận nhà (nếu đã nhận nhà).
 */
export function stillOwed(b) {
  if (b.status === 'CHECKEDOUT') return 0;
  const chInReceived = isCheckedIn(b) ? (b.checkinCharges || 0) : 0;
  return Math.max(0,
    b.totalAmount - (b.discount || 0)
    + (b.checkinCharges || 0) + (b.chargesTotal || 0)
    - (b.deposit || 0) - (b.paidAtCheckIn || 0) - chInReceived
  );
}
