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
 * Kiểm tra trùng với LỊCH KHOÁ TAY (LichKhoa): mỗi dòng là một ĐÊM bị khoá.
 * Booking chiếm các đêm [checkIn, checkOut) — đêm checkOut không tính (khách trả 12h).
 * Trả về dòng khoá đầu tiên đụng phải, hoặc null.
 */
export async function checkLichKhoaConflict(homeId, checkIn, checkOut) {
  return prisma.lichKhoa.findFirst({
    where: {
      homeId: parseInt(homeId),
      ngay: { gte: new Date(checkIn), lt: new Date(checkOut) },
    },
    orderBy: { ngay: 'asc' },
  });
}

export function moTaLichKhoa(k) {
  const d = k.ngay.toISOString().slice(0, 10).split('-').reverse().join('/');
  const nguon = k.nguon === 'MANUAL' ? 'khoá tay' : k.nguon === 'SHEET' ? 'từ Google Sheet' : 'từ iCal';
  return `Ngày ${d} đã bị khoá (${nguon}${k.ghiChu ? ': ' + k.ghiChu : ''})`;
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
 * Nạp bảng giá của 1 căn cho khoảng ngày cần tính:
 *  - giá theo THÁNG  (HomeMonthlyPrice) của mọi tháng mà khoảng ngày chạm tới
 *  - giá GHI ĐÈ từng đêm (HomeDatePrice) trong khoảng đó
 * Trả về object đưa thẳng vào stayTotal(). Không có dữ liệu -> {} -> tính như cũ.
 */
export async function loadPriceTable(homeId, checkIn, checkOut) {
  const hid = parseInt(homeId);
  if (!hid) return null;
  const start = new Date(checkIn);
  const end = new Date(checkOut);

  // Liệt kê các cặp (năm, tháng) mà kỳ ở đi qua
  const yms = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cur <= last) {
    yms.push({ year: cur.getUTCFullYear(), month: cur.getUTCMonth() + 1 });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }

  const [monthlyRows, dateRows] = await Promise.all([
    yms.length
      ? prisma.homeMonthlyPrice.findMany({ where: { homeId: hid, OR: yms } })
      : Promise.resolve([]),
    prisma.homeDatePrice.findMany({ where: { homeId: hid, date: { gte: start, lt: end } } })
  ]);

  const monthly = {};
  for (const r of monthlyRows) monthly[`${r.year}-${r.month}`] = r;
  const dates = {};
  for (const r of dateRows) dates[ymdUTC(r.date)] = r.price;
  return { monthly, dates };
}

/** Số dương mới được coi là "đã nhập giá"; null / 0 = để trống, lùi về mức dưới. */
function pos(v) {
  return v != null && v > 0;
}

/**
 * Tổng tiền phòng, tính từng đêm theo ngày nhận của đêm đó.
 *
 * Thứ tự tra giá cho MỖI đêm (dừng ở mức đầu tiên có số):
 *   1. Giá GHI ĐÈ đúng đêm đó            (HomeDatePrice) — thắng tất cả
 *   2. Đêm là ngày lễ  -> giá lễ của THÁNG -> giá lễ của CĂN -> giá cuối tuần
 *   3. Đêm cuối tuần   -> giá cuối tuần của THÁNG -> giá cuối tuần của CĂN
 *   4. Ngày thường     -> giá thường của THÁNG -> giá thường của CĂN
 *
 * `priceTable` lấy từ loadPriceTable(). Bỏ trống -> tính đúng như trước khi có
 * bảng giá theo tháng, nên căn nào chưa nhập giá tháng không bị ảnh hưởng.
 */
export function stayTotal(home, checkIn, checkOut, holidays = [], priceTable = null) {
  const base = home.price;
  const wkPrice = pos(home.weekendPrice) ? home.weekendPrice : base;
  const holPrice = pos(home.holidayPrice) ? home.holidayPrice : wkPrice;
  const ranges = normalizeHolidays(holidays);
  const monthly = priceTable?.monthly || {};
  const dates = priceTable?.dates || {};
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  let total = 0, count = 0;
  // Duyệt từng đêm: từ ngày nhận đến trước ngày trả
  for (let t = start.getTime(); t < end.getTime(); t += 86400000) {
    count++;
    const ds = ymdUTC(t);

    // 1. Ghi đè từng đêm
    if (pos(dates[ds])) { total += dates[ds]; continue; }

    const d = new Date(t);
    const m = monthly[`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`];
    const mHol = pos(m?.holidayPrice) ? m.holidayPrice : null;
    const mWk = pos(m?.weekendPrice) ? m.weekendPrice : null;
    const mWd = pos(m?.price) ? m.price : null;

    // 2. Ngày lễ
    if (isHolidayNight(t, ranges)) {
      total += mHol ?? (pos(home.holidayPrice) ? home.holidayPrice : (mWk ?? holPrice));
    }
    // 3. Cuối tuần
    else if (isWeekendNight(t)) {
      total += mWk ?? wkPrice;
    }
    // 4. Ngày thường
    else {
      total += mWd ?? base;
    }
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
