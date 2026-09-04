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
};

// Đổi cấu hình hoa hồng của host thành thứ sales cần thấy.
//   A (PHAN_TRAM): host niêm yết giá bán, trích % -> sales biết giá bán + hoa hồng tối đa.
//   B (GIA_SAN):   host chốt giá sàn, sales tự kê -> giá bán gợi ý = sàn + mức kê chuẩn.
// Cả hai đều KHÔNG trả giá host nhận thành một trường riêng để tránh sales lỡ gửi nhầm
// cho khách; ai cần thì tự trừ ra được, nhưng không bày sẵn.
function giaChoSales(h) {
  if (h.coCheHoaHong === 'PHAN_TRAM' && h.listPrice) {
    const hoaHong = Math.round(h.listPrice * (h.commissionPct || 0) / 100);
    return { coChe: 'A', giaBan: h.listPrice, hoaHongToiDa: hoaHong, phanTram: h.commissionPct || 0 };
  }
  if (h.coCheHoaHong === 'GIA_SAN' && h.floorPrice) {
    const keChuan = h.markupMin || 0;
    return {
      coChe: 'B', giaSan: h.floorPrice, keTu: h.markupMin || 0, keDen: h.markupMax || null,
      giaBanGoiY: h.floorPrice + keChuan, hoaHongToiDa: keChuan,
    };
  }
  return { coChe: null };   // host duyệt xong mà xoá cấu hình — hiếm, nhưng đừng nổ
}

function goiCan(h) {
  const { coCheHoaHong, listPrice, commissionPct, floorPrice, markupMin, markupMax, ...con } = h;
  return { ...con, gia: giaChoSales(h) };
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
  res.json(goiCan(h));
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
