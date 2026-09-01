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
 *   - TÍNH CẢ booking đã CHECKEDOUT: những đêm đó nhà vẫn có khách, nên khi nhập bù
 *     lịch quá khứ vẫn phải cảnh báo trùng (trước đây bỏ qua → tạo được 2 booking đè ngày).
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

/** Timestamp -> 'YYYY-MM-DD' theo UTC (khớp cách lưu @db.Date) */
function ymdUTC(t) {
  return new Date(t).toISOString().split('T')[0];
}

/**
 * Chuẩn hoá danh sách ngày lễ về mảng {start:'YYYY-MM-DD', end:'YYYY-MM-DD'}.
 * Nhận Holiday từ DB (startDate/endDate là Date) hoặc object đã có chuỗi.
 */
export function normalizeHolidays(holidays) {
  if (!Array.isArray(holidays)) return [];
  return holidays.map(h => {
    const s = h.startDate || h.start;
    const e = h.endDate || h.end || s;
    return { start: ymdUTC(s), end: ymdUTC(e) };
  });
}

/** Một đêm (theo ngày bắt đầu) có rơi vào ngày lễ nào không. */
function isHolidayNight(t, holidayRanges) {
  if (!holidayRanges || !holidayRanges.length) return false;
  const d = ymdUTC(t);
  return holidayRanges.some(r => d >= r.start && d <= r.end);
}

/**
 * Tổng tiền phòng theo 3 mức giá. Ưu tiên: LỄ > CUỐI TUẦN > NGÀY THƯỜNG.
 * - holidayPrice trống -> lùi về giá cuối tuần (mà cuối tuần trống thì về giá thường).
 * - weekendPrice trống -> dùng giá thường.
 * Đếm từng đêm theo ngày nhận của đêm đó. `holidays` = mảng Holiday (DB) hoặc [] .
 */
export function stayTotal(home, checkIn, checkOut, holidays = []) {
  const base = home.price;
  const wkPrice = (home.weekendPrice != null && home.weekendPrice > 0)
    ? home.weekendPrice : base;
  const holPrice = (home.holidayPrice != null && home.holidayPrice > 0)
    ? home.holidayPrice : wkPrice;
  const ranges = normalizeHolidays(holidays);
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  let total = 0, count = 0;
  // Duyệt từng đêm: từ ngày nhận đến trước ngày trả
  for (let t = start.getTime(); t < end.getTime(); t += 86400000) {
    if (isHolidayNight(t, ranges)) total += holPrice;
    else if (isWeekendNight(t)) total += wkPrice;
    else total += base;
    count++;
  }
  if (count === 0) total = base; // an toàn: tối thiểu 1 đêm
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
 * Doanh số PHÒNG đã thực thu = cọc + tiền phòng thu khi nhận nhà.
 * KHÔNG tính phụ thu (đồ tiêu thụ, phạt) — đó là khoản riêng.
 * Giảm giá đã được trừ sẵn: lúc nhận nhà paidAtCheckIn = totalAmount − discount − deposit,
 * nên KHÔNG trừ discount thêm lần nữa ở đây.
 * Booking chưa nhận nhà chỉ tính phần cọc đã cầm.
 */
export function roomRevenue(b) {
  const dep = b.deposit || 0;
  let ci = b.paidAtCheckIn || 0;
  // Dữ liệu cũ: đã trả nhà nhưng chưa ghi paidAtCheckIn → coi như tiền phòng đã thu đủ.
  if (b.status === 'CHECKEDOUT' && !b.paidAtCheckIn && ci === 0) {
    ci = Math.max(0, b.totalAmount - (b.discount || 0) - dep);
  }
  return dep + ci;
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
