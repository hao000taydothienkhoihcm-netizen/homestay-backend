// routes/cho.js — CHỢ CĂN cho vai SALES (GĐ3 tầng 2).
//
// ⚠ ĐÂY LÀ NGOẠI LỆ THỨ HAI CỦA hostWhere() (sau hostWhereTaiKhoan cho bảng User).
// Chợ CỐ Ý không lọc theo hostId: sales là tài khoản cấp nền tảng, phải thấy căn của
// MỌI host. Bù lại, an toàn nằm ở 3 lớp:
//   1. Chỉ căn `choTrangThai = DANG_BAN` — host tự bấm gửi, Sabi duyệt rồi mới lên đây.
//   2. Danh sách cột trả về là DANH SÁCH TRẮNG cứng (CHON_CHO), không dùng `include`
//      hay trải nguyên bản ghi — thêm cột mới vào Home cũng không tự lọt ra chợ.
//   3. Không bao giờ trả: address (địa chỉ chính xác), caretakerPhone (SĐT quản gia),
//      rules, tên/SĐT host, floorPrice, và tên khách trong lịch. Mấy thứ đó chỉ lộ
//      SAU KHI host duyệt giữ chỗ (GĐ4).
//
// Giá cho sales tính theo cơ chế hoa hồng host chọn — xem `giaChoSales()`.
import { routerAnToan } from '../lib/router-an-toan.js';
import { prisma } from '../prisma.js';
import { requireRole } from '../middleware/auth.js';

const router = routerAnToan();

// Sales là vai chính. ADMIN vào được để kiểm tra chợ đang hiện gì cho sales —
// đây là dữ liệu host CHỦ ĐỘNG công khai để bán, không phải dữ liệu kinh doanh riêng.
const XEM_CHO = ['SALES', 'ADMIN'];

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ngayUTC = (s) => new Date(s + 'T00:00:00.000Z');
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const ngayHopLe = (s) => typeof s === 'string' && YMD.test(s) && !Number.isNaN(ngayUTC(s).getTime()) && ymd(ngayUTC(s)) === s;

// DANH SÁCH TRẮNG — chỉ những cột này ra khỏi hệ thống cho sales.
const CHON_CHO = {
  id: true, hostId: true,
  salesTitle: true, ward: true, landmark: true,
  maxGuests: true, minGuests: true,
  bedrooms: true, bedroomsSingle: true, bedroomsDouble: true, roomNotes: true,
  amenities: true,
  parkingFree: true, parkingFee: true, parkingNote: true,
  childUnder6: true, childFrom6: true,
  coverImages: true, albumUrl: true, salesInfo: true,
  coCheHoaHong: true, listPrice: true, commissionPct: true,
  floorPrice: true, markupMin: true, markupMax: true,
  // Giá theo loại đêm + luật cuối tuần của chính căn đó
  listPriceWeekend: true, listPriceHoliday: true,
  floorPriceWeekend: true, floorPriceHoliday: true, markupHoliday: true,
  cuoiTuanGom: true,
  // Nguồn lịch — để tính mức tin cậy. KHÔNG trả link/tab/key: đó là cấu hình riêng của host.
  lichNguon: true, lichDongBoLuc: true, lichLoiTu: true,
};

// ───── Mức tin cậy lịch ─────
// Không lưu thành cột: suy từ nguồn + chuỗi lỗi, để không bao giờ có chuyện
// cột ghi mức ① mà thực tế đã hai ngày không đọc được lịch.
const MUC_LICH = {
  1: { ten: 'Lịch thật', ghi: 'Chủ nhà dùng app nội bộ Sabi — lịch cập nhật tức thì.', canhBao: false },
  2: { ten: 'Tự động', ghi: 'Đồng bộ tự động từ lịch của chủ nhà.', canhBao: false },
  3: { ten: 'Tham khảo', ghi: 'Đọc từ Google Sheet của chủ nhà — có thể chậm hơn thực tế.', canhBao: true },
  4: { ten: 'Chưa có lịch', ghi: 'Chưa nối lịch. Bắt buộc gọi chủ nhà hỏi ngày trống.', canhBao: true },
};
const NGUONG_LOI = 24 * 60 * 60 * 1000;   // lỗi liên tục quá 24h thì hạ xuống mức ④

function tinhMucLich(h, bayGio = Date.now()) {
  if (!h.lichNguon) return 4;
  // Lịch KHÔNG ĐỔI là bình thường (mùa ế thì trống là câu trả lời đúng).
  // Chỉ ĐỌC KHÔNG ĐƯỢC liên tục mới bị hạ mức.
  if (h.lichLoiTu && bayGio - new Date(h.lichLoiTu).getTime() > NGUONG_LOI) return 4;
  if (h.lichNguon === 'APP') return 1;
  if (h.lichNguon === 'ICAL' || h.lichNguon === 'SCRIPT') return 2;
  return 3;   // SHEET
}
function goiLich(h) {
  const muc = tinhMucLich(h);
  return { muc, ...MUC_LICH[muc], dongBoLuc: muc === 1 ? null : (h.lichDongBoLuc || null) };
}

// Đổi cấu hình hoa hồng của host thành thứ sales cần thấy, cho CẢ BA loại đêm.
//
//   A (PHAN_TRAM): host niêm yết giá bán từng loại đêm, trích một mức % dùng chung.
//       Đêm lễ giá cao thì hoa hồng tự cao — cố ý không có % riêng cho lễ.
//   B (GIA_SAN):   host chốt giá sàn từng loại đêm + mức kê. Ngày lễ có mức kê riêng
//       vì lễ host thường cho kê nhiều hơn. Sales KHÔNG tự đặt mức kê, chỉ được CẮT bớt.
//
// Trả cả `hostNhan` — mockup đã chốt là sales nhìn thấy phần chia tiền (nằm trong
// khối gập lại, kèm nhắc đừng mở trước mặt khách). Giấu số đó chỉ khiến sales tự
// tính nhẩm sai rồi cãi nhau với chủ nhà.
const LOAI_DEM = ['thuong', 'cuoiTuan', 'le'];

function motDem(h, loai) {
  if (h.coCheHoaHong === 'PHAN_TRAM') {
    const ban = loai === 'le' ? (h.listPriceHoliday || h.listPriceWeekend || h.listPrice)
      : loai === 'cuoiTuan' ? (h.listPriceWeekend || h.listPrice)
        : h.listPrice;
    if (!ban) return null;
    const hh = Math.round(ban * (h.commissionPct || 0) / 100);
    return { khachTra: ban, hoaHong: hh, hostNhan: ban - hh };
  }
  const san = loai === 'le' ? (h.floorPriceHoliday || h.floorPriceWeekend || h.floorPrice)
    : loai === 'cuoiTuan' ? (h.floorPriceWeekend || h.floorPrice)
      : h.floorPrice;
  if (!san) return null;
  const ke = loai === 'le' ? (h.markupHoliday ?? h.markupMin ?? 0) : (h.markupMin || 0);
  return { khachTra: san + ke, hoaHong: ke, hostNhan: san };
}

function giaChoSales(h) {
  const co = (h.coCheHoaHong === 'PHAN_TRAM' && h.listPrice)
    || (h.coCheHoaHong === 'GIA_SAN' && h.floorPrice);
  if (!co) return { coChe: null };   // host duyệt xong mà xoá cấu hình — hiếm, nhưng đừng nổ

  const dem = {};
  for (const l of LOAI_DEM) dem[l] = motDem(h, l);
  return {
    coChe: h.coCheHoaHong === 'PHAN_TRAM' ? 'A' : 'B',
    phanTram: h.coCheHoaHong === 'PHAN_TRAM' ? (h.commissionPct || 0) : null,
    cuoiTuanGom: h.cuoiTuanGom,
    dem,
    tuGia: dem.thuong ? dem.thuong.khachTra : null,   // số hiện trên thẻ ngoài chợ
  };
}

function goiCan(h) {
  const {
    coCheHoaHong, listPrice, commissionPct, floorPrice, markupMin, markupMax,
    listPriceWeekend, listPriceHoliday, floorPriceWeekend, floorPriceHoliday, markupHoliday,
    cuoiTuanGom, lichNguon, lichDongBoLuc, lichLoiTu, ...con
  } = h;
  return { ...con, gia: giaChoSales(h), lich: goiLich(h) };
}

// ───────────────────────────────────────────────
// GET /v1/cho  — danh sách căn đang bán
// Lọc: ?ward= &khach= &q= &tu=&den= (còn trống trọn khoảng) &trangCanKe (bỏ căn cùng host?)
// ───────────────────────────────────────────────
router.get('/', requireRole(...XEM_CHO), async (req, res) => {
  const { ward, khach, q, tu, den } = req.query;
  const where = { choTrangThai: 'DANG_BAN', active: true };
  if (ward && String(ward).trim()) where.ward = String(ward).trim();
  const soKhach = parseInt(khach);
  if (Number.isFinite(soKhach) && soKhach > 0) where.maxGuests = { gte: soKhach };
  if (q && String(q).trim()) {
    const s = String(q).trim();
    where.OR = [
      { salesTitle: { contains: s, mode: 'insensitive' } },
      { landmark: { contains: s, mode: 'insensitive' } },
      { ward: { contains: s, mode: 'insensitive' } },
    ];
  }

  let rows = await prisma.home.findMany({ where, select: CHON_CHO, orderBy: { id: 'asc' } });

  // Lọc theo khoảng ngày: chỉ giữ căn TRỐNG TRỌN VẸN [tu, den) — một đêm bận là loại.
  let khoang = null;
  if (ngayHopLe(tu) && ngayHopLe(den) && tu < den) {
    khoang = { tu, den };
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const [bks, khoa] = await Promise.all([
        prisma.booking.findMany({
          where: { homeId: { in: ids }, checkIn: { lt: ngayUTC(den) }, checkOut: { gt: ngayUTC(tu) } },
          select: { homeId: true },
        }),
        prisma.lichKhoa.findMany({
          where: { homeId: { in: ids }, ngay: { gte: ngayUTC(tu), lt: ngayUTC(den) } },
          select: { homeId: true },
        }),
      ]);
      const ban = new Set([...bks.map((b) => b.homeId), ...khoa.map((k) => k.homeId)]);
      rows = rows.filter((r) => !ban.has(r.id));
    }
  }

  // Lọc theo "nhận từ … khách": căn yêu cầu tối thiểu 6 khách thì đoàn 4 người không hợp.
  if (Number.isFinite(soKhach) && soKhach > 0) {
    rows = rows.filter((r) => !r.minGuests || soKhach >= r.minGuests);
  }

  res.json({ khoang, soCan: rows.length, can: rows.map(goiCan) });
});

// Danh sách phường CÓ CĂN ĐANG BÁN — để ô lọc chỉ hiện phường thật sự có hàng.
router.get('/phuong', requireRole(...XEM_CHO), async (_req, res) => {
  const rows = await prisma.home.findMany({
    where: { choTrangThai: 'DANG_BAN', active: true, ward: { not: null } },
    select: { ward: true }, distinct: ['ward'], orderBy: { ward: 'asc' },
  });
  res.json(rows.map((r) => r.ward));
});

// ───────────────────────────────────────────────
// GET /v1/cho/:id  — chi tiết một căn
// ───────────────────────────────────────────────
router.get('/:id', requireRole(...XEM_CHO), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(404).json({ error: 'Không tìm thấy căn nhà' });
  const h = await prisma.home.findFirst({
    where: { id, choTrangThai: 'DANG_BAN', active: true },
    select: CHON_CHO,
  });
  if (!h) return res.status(404).json({ error: 'Không tìm thấy căn nhà' });

  // Ngày lễ do host tự khai — sales cần để biết đêm nào ăn giá lễ.
  // Chỉ trả khoảng ngày và tên, không có gì riêng tư.
  const le = await prisma.holiday.findMany({
    where: { hostId: h.hostId },
    select: { name: true, startDate: true, endDate: true },
    orderBy: { startDate: 'asc' },
  });
  res.json({
    ...goiCan(h),
    ngayLe: le.map((x) => ({ ten: x.name, tu: ymd(x.startDate), den: ymd(x.endDate) })),
  });
});

// ───────────────────────────────────────────────
// GET /v1/cho/:id/lich?tu&den — lịch TRỐNG / BẬN
// Chỉ 2 trạng thái. Sales KHÔNG được biết bận vì booking hay vì host khoá tay,
// càng không được biết tên khách — đó là chuyện riêng của host.
// ───────────────────────────────────────────────
router.get('/:id/lich', requireRole(...XEM_CHO), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(404).json({ error: 'Không tìm thấy căn nhà' });
  const h = await prisma.home.findFirst({
    where: { id, choTrangThai: 'DANG_BAN', active: true }, select: { id: true },
  });
  if (!h) return res.status(404).json({ error: 'Không tìm thấy căn nhà' });

  const now = new Date();
  const tu = ngayHopLe(req.query.tu) ? req.query.tu : ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const den = ngayHopLe(req.query.den) ? req.query.den : ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 4, 0)));

  const [bks, khoa] = await Promise.all([
    prisma.booking.findMany({
      where: { homeId: id, checkIn: { lte: ngayUTC(den) }, checkOut: { gt: ngayUTC(tu) } },
      select: { checkIn: true, checkOut: true },      // KHÔNG lấy guest / id / status
    }),
    prisma.lichKhoa.findMany({
      where: { homeId: id, ngay: { gte: ngayUTC(tu), lte: ngayUTC(den) } },
      select: { ngay: true },                          // KHÔNG lấy nguon / ghiChu
    }),
  ]);

  const ban = new Set();
  for (const b of bks) {
    for (let d = new Date(b.checkIn); d < b.checkOut; d.setUTCDate(d.getUTCDate() + 1)) ban.add(ymd(d));
  }
  for (const k of khoa) ban.add(ymd(k.ngay));

  const ngay = [];
  for (let d = ngayUTC(tu); d <= ngayUTC(den); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = ymd(d);
    ngay.push({ ngay: key, trangThai: ban.has(key) ? 'ban' : 'trong' });
  }
  res.json({ tu, den, ngay });
});

export default router;
