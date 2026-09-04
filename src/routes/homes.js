import { routerAnToan } from '../lib/router-an-toan.js';
import { prisma } from '../prisma.js';
import { requireRole, hostWhere, ownHostId, findOwn, updateOwn, notFound, CHU_WORKSPACE, QUAN_LY } from '../middleware/auth.js';
import { loadPriceTable, stayTotal } from '../services/bookingService.js';

const router = routerAnToan();

// '' hoặc null hoặc <= 0  ->  null (nghĩa là "để trống, lùi về mức dưới")
function optPrice(v) {
  if (v === '' || v == null) return null;
  const n = parseInt(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
const ymdUTC = (d) => new Date(d).toISOString().split('T')[0];

router.get('/', async (req, res) => {
  const homes = await prisma.home.findMany({
    where: hostWhere(req, { active: true }),
    orderBy: { id: 'asc' }
  });
  res.json(homes);
});

// Danh sách phường/xã cho form đăng chợ (phải đứng TRƯỚC /:id). Hằng số khai ở mục "ĐĂNG CĂN LÊN CHỢ".
router.get('/phuong', (_req, res) => res.json(PHUONG_DA_LAT));

router.get('/:id', async (req, res) => {
  const home = await findOwn(prisma.home, req, req.params.id);
  if (!home) return notFound(res, 'căn nhà');
  res.json(home);
});

router.post('/', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const { name, address, price, weekendPrice, holidayPrice, maxGuests, emoji, desc } = req.body;
  if (!name || !address || !price) return res.status(400).json({ error: 'Thiếu thông tin' });

  const wk = (weekendPrice === '' || weekendPrice == null) ? null : parseInt(weekendPrice);
  const hol = (holidayPrice === '' || holidayPrice == null) ? null : parseInt(holidayPrice);
  const home = await prisma.home.create({
    data: {
      name, address, price: parseInt(price),
      weekendPrice: (wk && wk > 0) ? wk : null,
      holidayPrice: (hol && hol > 0) ? hol : null,
      maxGuests: parseInt(maxGuests) || 8, emoji: emoji || '🏡', desc,
      hostId: ownHostId(req)
    }
  });
  res.status(201).json(home);
});

router.patch('/:id', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, address, price, weekendPrice, holidayPrice, maxGuests, emoji, desc } = req.body;

  // Căn đã lên chợ thì TÊN + ĐỊA CHỈ là danh tính chống trùng — đổi phải qua admin.
  // (Chỉ chặn khi đổi thật; gửi lại đúng giá trị cũ vẫn cho qua để form khỏi vướng.)
  const cu = await findOwn(prisma.home, req, id, { select: { name: true, address: true, choTrangThai: true } });
  if (!cu) return notFound(res, 'căn nhà');
  if (cu.choTrangThai === 'DANG_BAN' || cu.choTrangThai === 'AN') {
    const doiTen = name !== undefined && String(name).trim() !== cu.name;
    const doiDc = address !== undefined && String(address).trim() !== cu.address;
    if (doiTen || doiDc) {
      return res.status(400).json({ error: 'Căn đang trên chợ — đổi tên / địa chỉ phải báo Sabi Home (tránh trùng với căn khác).' });
    }
  }

  const n = await updateOwn(prisma.home, req, id, {
      ...(name !== undefined && { name }),
      ...(address !== undefined && { address }),
      ...(price !== undefined && { price: parseInt(price) }),
      ...(weekendPrice !== undefined && {
        weekendPrice: (weekendPrice === '' || weekendPrice == null || parseInt(weekendPrice) <= 0)
          ? null : parseInt(weekendPrice)
      }),
      ...(holidayPrice !== undefined && {
        holidayPrice: (holidayPrice === '' || holidayPrice == null || parseInt(holidayPrice) <= 0)
          ? null : parseInt(holidayPrice)
      }),
      ...(maxGuests !== undefined && { maxGuests: parseInt(maxGuests) }),
      ...(emoji !== undefined && { emoji }),
      ...(desc !== undefined && { desc })
  });
  if (!n) return notFound(res, 'căn nhà');
  res.json(await findOwn(prisma.home, req, id));
});

router.delete('/:id', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const id = parseInt(req.params.id);

  // Phải xác nhận là căn của mình TRƯỚC, không thì số booking đang ở của host khác bị lộ.
  const home = await findOwn(prisma.home, req, id);
  if (!home) return notFound(res, 'căn nhà');

  // Check if có booking active
  const active = await prisma.booking.count({
    where: { homeId: id, status: { not: 'CHECKEDOUT' } }
  });
  if (active > 0) {
    return res.status(400).json({ error: `Còn ${active} booking active, không thể xóa` });
  }
  // Soft delete
  await updateOwn(prisma.home, req, id, { active: false });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// BẢNG GIÁ THEO THÁNG  —  /v1/homes/:id/prices
// ═══════════════════════════════════════════════════════

// Danh sách 12 tháng của 1 năm. Tháng chưa nhập -> trả về ô rỗng (price = null)
// để giao diện chỉ việc đổ thẳng vào lưới.
router.get('/:id/prices', async (req, res) => {
  const homeId = parseInt(req.params.id);
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const home = await prisma.home.findFirst({ where: hostWhere(req, { id: homeId }) });
  if (!home) return res.status(404).json({ error: 'Không tìm thấy căn nhà' });

  const rows = await prisma.homeMonthlyPrice.findMany({
    where: { homeId, year },
    orderBy: { month: 'asc' }
  });
  const byMonth = {};
  for (const r of rows) byMonth[r.month] = r;

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const r = byMonth[m];
    months.push({
      year, month: m,
      price: r?.price ?? null,
      weekendPrice: r?.weekendPrice ?? null,
      holidayPrice: r?.holidayPrice ?? null,
      note: r?.note ?? null,
      filled: !!r
    });
  }
  // Kèm giá mặc định của căn để giao diện hiện làm placeholder
  res.json({
    homeId, year, months,
    defaults: { price: home.price, weekendPrice: home.weekendPrice, holidayPrice: home.holidayPrice }
  });
});

// Lưu giá 1 tháng. Gửi cả 3 ô rỗng -> xoá dòng (tháng đó quay về giá mặc định của căn).
router.put('/:id/prices', requireRole(...QUAN_LY), async (req, res) => {
  const homeId = parseInt(req.params.id);
  const { year, month, price, weekendPrice, holidayPrice, note } = req.body;
  const y = parseInt(year), m = parseInt(month);
  if (!y || !m || m < 1 || m > 12) return res.status(400).json({ error: 'Năm / tháng không hợp lệ' });

  const home = await prisma.home.findFirst({ where: hostWhere(req, { id: homeId }) });
  if (!home) return res.status(404).json({ error: 'Không tìm thấy căn nhà' });

  const data = {
    price: optPrice(price),
    weekendPrice: optPrice(weekendPrice),
    holidayPrice: optPrice(holidayPrice),
    note: note || null
  };

  if (data.price == null && data.weekendPrice == null && data.holidayPrice == null) {
    await prisma.homeMonthlyPrice.deleteMany({ where: { homeId, year: y, month: m } });
    return res.json({ ok: true, cleared: true, year: y, month: m });
  }

  const row = await prisma.homeMonthlyPrice.upsert({
    where: { homeId_year_month: { homeId, year: y, month: m } },
    create: { homeId, year: y, month: m, hostId: ownHostId(req), ...data },
    update: data
  });
  res.json(row);
});

// Chép giá cả năm sang năm khác (VD nhân bản 2026 -> 2027 rồi sửa)
router.post('/:id/prices/copy-year', requireRole(...QUAN_LY), async (req, res) => {
  const homeId = parseInt(req.params.id);
  const from = parseInt(req.body.fromYear), to = parseInt(req.body.toYear);
  if (!from || !to || from === to) return res.status(400).json({ error: 'Năm nguồn / năm đích không hợp lệ' });

  const home = await prisma.home.findFirst({ where: hostWhere(req, { id: homeId }) });
  if (!home) return res.status(404).json({ error: 'Không tìm thấy căn nhà' });

  const rows = await prisma.homeMonthlyPrice.findMany({ where: { homeId, year: from } });
  if (!rows.length) return res.status(400).json({ error: `Năm ${from} chưa có bảng giá nào` });

  await prisma.$transaction(rows.map(r => prisma.homeMonthlyPrice.upsert({
    where: { homeId_year_month: { homeId, year: to, month: r.month } },
    create: {
      homeId, year: to, month: r.month, hostId: ownHostId(req),
      price: r.price, weekendPrice: r.weekendPrice, holidayPrice: r.holidayPrice, note: r.note
    },
    update: { price: r.price, weekendPrice: r.weekendPrice, holidayPrice: r.holidayPrice, note: r.note }
  })));
  res.json({ ok: true, copied: rows.length, fromYear: from, toYear: to });
});

// ═══════════════════════════════════════════════════════
// GIÁ GHI ĐÈ TỪNG ĐÊM  —  /v1/homes/:id/date-prices
// ═══════════════════════════════════════════════════════

router.get('/:id/date-prices', async (req, res) => {
  const homeId = parseInt(req.params.id);
  const { from, to } = req.query;

  const home = await findOwn(prisma.home, req, homeId);
  if (!home) return notFound(res, 'căn nhà');

  const where = { homeId };
  if (from && to) where.date = { gte: new Date(from), lte: new Date(to) };

  const rows = await prisma.homeDatePrice.findMany({ where, orderBy: { date: 'asc' } });
  res.json(rows.map(r => ({ ...r, date: ymdUTC(r.date) })));
});

router.put('/:id/date-prices', requireRole(...QUAN_LY), async (req, res) => {
  const homeId = parseInt(req.params.id);
  const { date, price, note } = req.body;
  if (!date) return res.status(400).json({ error: 'Thiếu ngày' });

  const home = await prisma.home.findFirst({ where: hostWhere(req, { id: homeId }) });
  if (!home) return res.status(404).json({ error: 'Không tìm thấy căn nhà' });

  const d = new Date(date);
  const p = optPrice(price);
  // Giá rỗng = bỏ ghi đè, đêm đó quay về giá theo tháng
  if (p == null) {
    await prisma.homeDatePrice.deleteMany({ where: { homeId, date: d } });
    return res.json({ ok: true, cleared: true, date: ymdUTC(d) });
  }

  const row = await prisma.homeDatePrice.upsert({
    where: { homeId_date: { homeId, date: d } },
    create: { homeId, date: d, price: p, note: note || null, hostId: ownHostId(req) },
    update: { price: p, note: note || null }
  });
  res.json({ ...row, date: ymdUTC(row.date) });
});

// ═══════════════════════════════════════════════════════
// XEM TRƯỚC GIÁ TỪNG ĐÊM  —  /v1/homes/:id/price-preview
// Dùng cho giao diện (và để đối chiếu với Google Sheet).
// ═══════════════════════════════════════════════════════
router.get('/:id/price-preview', async (req, res) => {
  const homeId = parseInt(req.params.id);
  const { checkIn, checkOut } = req.query;
  if (!checkIn || !checkOut) return res.status(400).json({ error: 'Thiếu checkIn / checkOut' });

  const home = await prisma.home.findFirst({ where: hostWhere(req, { id: homeId }) });
  if (!home) return res.status(404).json({ error: 'Không tìm thấy căn nhà' });

  const holidays = await prisma.holiday.findMany({ where: hostWhere(req) });
  const priceTable = await loadPriceTable(homeId, checkIn, checkOut);

  const nightsList = [];
  const start = new Date(checkIn).getTime();
  const end = new Date(checkOut).getTime();
  for (let t = start; t < end; t += 86400000) {
    const d = new Date(t);
    const next = new Date(t + 86400000);
    const ds = ymdUTC(d);
    const overridden = priceTable?.dates?.[ds] != null;
    const holiday = holidays.some(h =>
      ds >= ymdUTC(h.startDate) && ds <= ymdUTC(h.endDate));
    const wd = d.getUTCDay();
    nightsList.push({
      date: ds,
      weekday: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][wd],
      kind: overridden ? 'ghi-de' : holiday ? 'le' : (wd === 5 || wd === 6 || wd === 0) ? 'cuoi-tuan' : 'thuong',
      // tính đúng bằng chính công thức thật, cho 1 đêm
      price: stayTotal(home, d, next, holidays, priceTable)
    });
  }

  res.json({
    homeId, checkIn, checkOut,
    nights: nightsList.length,
    total: stayTotal(home, checkIn, checkOut, holidays, priceTable),
    detail: nightsList
  });
});

// ═══════════════════ GĐ3: ĐĂNG CĂN LÊN CHỢ ═══════════════════
// Host khai thông tin bán hàng (mockup marketplace-final màn "addhome") rồi Gửi duyệt.
// Admin duyệt ở routes/hosts.js (kiểm trùng căn). Trạng thái: NHAP -> CHO_DUYET -> DANG_BAN / AN.
// Tên căn + số nhà + phường là "danh tính" chống trùng: đã DANG_BAN thì host không tự đổi nữa.

const PHUONG_DA_LAT = ['Phường 1', 'Phường 2', 'Phường 3', 'Phường 4', 'Phường 5', 'Phường 6', 'Phường 7',
  'Phường 8', 'Phường 9', 'Phường 10', 'Phường 11', 'Phường 12', 'Phường Xuân Hương', 'Phường Cam Ly',
  'Phường Trại Mát', 'Xã Xuân Trường', 'Xã Xuân Thọ', 'Khác'];
const CHILD_U6 = ['MIEN_PHI', 'PHU_THU_NHE'];
const CHILD_6 = ['NHU_NGUOI_LON', 'PHU_THU_50', 'MIEN_PHI'];

const chuoi = (v, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const soNguyen = (v) => { const n = parseInt(v); return Number.isFinite(n) && n >= 0 ? n : null; };
const mangChuoi = (v, max = 20, len = 120) =>
  Array.isArray(v) ? [...new Set(v.map((s) => chuoi(s, len)).filter(Boolean))].slice(0, max) : [];

// (GET /phuong khai ở đầu file, TRƯỚC /:id — không thì "phuong" bị hiểu là id.)

// Lưu nháp / cập nhật thông tin chợ. body.guiDuyet = true -> chuyển CHO_DUYET (nếu đủ điều kiện).
router.patch('/:id/cho', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const id = parseInt(req.params.id);
  const cu = await findOwn(prisma.home, req, id);
  if (!cu) return notFound(res, 'căn nhà');
  const b = req.body || {};

  const data = {
    salesTitle: chuoi(b.salesTitle, 150),
    landmark: chuoi(b.landmark, 200),
    bedrooms: soNguyen(b.bedrooms), bedroomsSingle: soNguyen(b.bedroomsSingle), bedroomsDouble: soNguyen(b.bedroomsDouble),
    minGuests: soNguyen(b.minGuests),
    roomNotes: mangChuoi(b.roomNotes, 20, 200),
    amenities: mangChuoi(b.amenities, 40, 60),
    parkingFree: chuoi(b.parkingFree, 120), parkingFee: chuoi(b.parkingFee, 120), parkingNote: chuoi(b.parkingNote, 200),
    childUnder6: CHILD_U6.includes(b.childUnder6) ? b.childUnder6 : null,
    childFrom6: CHILD_6.includes(b.childFrom6) ? b.childFrom6 : null,
    albumUrl: chuoi(b.albumUrl, 500),
    coverImages: mangChuoi(b.coverImages, 8, 500),
    salesInfo: chuoi(b.salesInfo, 5000),
    rules: chuoi(b.rules, 3000),
    caretakerPhone: chuoi(b.caretakerPhone, 30),
    coCheHoaHong: ['PHAN_TRAM', 'GIA_SAN'].includes(b.coCheHoaHong) ? b.coCheHoaHong : null,
    listPrice: soNguyen(b.listPrice), commissionPct: soNguyen(b.commissionPct),
    floorPrice: soNguyen(b.floorPrice), markupMin: soNguyen(b.markupMin), markupMax: soNguyen(b.markupMax),
  };
  // Địa chỉ chính xác dùng chung cột `address` của căn (nhập ở tab "Thông tin căn"),
  // KHÔNG có ô riêng ở đây — trước có cột `street` trùng chức năng, nay bỏ không dùng.
  // Phường là danh tính chống trùng: chỉ sửa khi chưa lên chợ, đang bán thì báo admin.
  if (cu.choTrangThai === 'NHAP' || cu.choTrangThai === 'CHO_DUYET') {
    data.ward = PHUONG_DA_LAT.includes(b.ward) ? b.ward : null;
  }
  if (data.commissionPct != null && data.commissionPct > 50) return res.status(400).json({ error: '% hoa hồng tối đa 50' });
  if (data.coCheHoaHong === 'GIA_SAN' && data.markupMin != null && data.markupMax != null && data.markupMin > data.markupMax) {
    return res.status(400).json({ error: 'Mức kê "từ" phải nhỏ hơn "đến"' });
  }

  if (b.guiDuyet === true) {
    const thieu = [];
    if (!data.salesTitle) thieu.push('tiêu đề bán hàng');
    if (!cu.address) thieu.push('địa chỉ (tab Thông tin căn)');
    if (!(data.ward ?? cu.ward)) thieu.push('phường / xã');
    if (!data.salesInfo) thieu.push('bài giới thiệu');
    if (!data.coCheHoaHong) thieu.push('cơ chế hoa hồng');
    if (data.coCheHoaHong === 'PHAN_TRAM' && (!data.listPrice || data.commissionPct == null)) thieu.push('giá bán niêm yết + % hoa hồng');
    if (data.coCheHoaHong === 'GIA_SAN' && !data.floorPrice) thieu.push('giá sàn');
    if (thieu.length) return res.status(400).json({ error: 'Chưa đủ để gửi duyệt: ' + thieu.join(', '), thieu });
    if (cu.choTrangThai !== 'DANG_BAN') data.choTrangThai = 'CHO_DUYET';
  } else if (b.an === true && cu.choTrangThai === 'DANG_BAN') {
    data.choTrangThai = 'AN';           // host tự tạm ẩn khỏi chợ
  } else if (b.an === false && cu.choTrangThai === 'AN') {
    data.choTrangThai = 'DANG_BAN';     // đã được duyệt rồi thì mở lại không cần duyệt lại
  }

  const n = await updateOwn(prisma.home, req, id, data);
  if (!n) return notFound(res, 'căn nhà');
  res.json(await findOwn(prisma.home, req, id));
});

// ═══════════════════ GĐ3: LỊCH KHOÁ TAY ═══════════════════
// Một dòng LichKhoa = một ĐÊM bị khoá ngoài booking (khách nhà, bảo trì, đã bán ngoài...).
// Host bấm khoá/mở ngay trên lịch. Nguồn MANUAL là của host; SHEET/ICAL do đồng bộ ghi —
// và đồng bộ KHÔNG được đụng dòng MANUAL (quy tắc "khoá tay thắng sheet").

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ngayUTC = (s) => new Date(s + 'T00:00:00.000Z');
const ymd = (d) => new Date(d).toISOString().slice(0, 10);

// Khoảng ngày mặc định: từ đầu tháng này tới hết 3 tháng sau.
function khoangNgay(q) {
  const now = new Date();
  const tu = YMD.test(q.tu) ? q.tu : ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const den = YMD.test(q.den) ? q.den : ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 4, 0)));
  return { tu, den };
}

// Chỉ ngày khoá tay / sheet / ical của căn — dùng cho màn "Khoá lịch tay".
router.get('/:id/lich-khoa', async (req, res) => {
  const home = await findOwn(prisma.home, req, req.params.id, { select: { id: true } });
  if (!home) return notFound(res, 'căn nhà');
  const { tu, den } = khoangNgay(req.query);
  const rows = await prisma.lichKhoa.findMany({
    where: { homeId: home.id, ngay: { gte: ngayUTC(tu), lte: ngayUTC(den) } },
    orderBy: { ngay: 'asc' },
    select: { ngay: true, nguon: true, ghiChu: true, createdAt: true },
  });
  res.json({ tu, den, ngay: rows.map((r) => ({ ...r, ngay: ymd(r.ngay) })) });
});

// Lịch tổng hợp từng ngày: trống / booking / khoá — nguồn sự thật duy nhất cho lịch,
// sau này màn chợ (public: chỉ trống/bận) và sales (giá) đều đọc từ đây.
router.get('/:id/lich', async (req, res) => {
  const home = await findOwn(prisma.home, req, req.params.id, { select: { id: true } });
  if (!home) return notFound(res, 'căn nhà');
  const { tu, den } = khoangNgay(req.query);
  const [khoa, bks] = await Promise.all([
    prisma.lichKhoa.findMany({
      where: { homeId: home.id, ngay: { gte: ngayUTC(tu), lte: ngayUTC(den) } },
      select: { ngay: true, nguon: true, ghiChu: true },
    }),
    prisma.booking.findMany({
      where: { homeId: home.id, checkIn: { lte: ngayUTC(den) }, checkOut: { gt: ngayUTC(tu) } },
      select: { id: true, guest: true, checkIn: true, checkOut: true, status: true },
    }),
  ]);
  const map = {};
  for (const b of bks) {
    // booking chiếm các đêm [checkIn, checkOut)
    for (let d = new Date(b.checkIn); d < b.checkOut; d.setUTCDate(d.getUTCDate() + 1)) {
      map[ymd(d)] = { trangThai: 'booking', bookingId: b.id, guest: b.guest, status: b.status };
    }
  }
  for (const k of khoa) {
    const key = ymd(k.ngay);
    if (!map[key]) map[key] = { trangThai: 'khoa', nguon: k.nguon, ghiChu: k.ghiChu };
    else map[key].khoaThem = k.nguon; // vừa booking vừa khoá — hiếm, nhưng phải thấy
  }
  const ngay = [];
  for (let d = ngayUTC(tu); d <= ngayUTC(den); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = ymd(d);
    ngay.push({ ngay: key, ...(map[key] || { trangThai: 'trong' }) });
  }
  res.json({ tu, den, ngay });
});

// Host bấm khoá / mở. body: { khoa: ['2026-09-10', ...], mo: ['2026-09-12', ...], ghiChu?: string }
// - khoa: thêm dòng MANUAL (đã có thì bỏ qua — kể cả đã khoá bởi SHEET/ICAL).
// - mo: chỉ xoá dòng MANUAL. Ngày do SHEET/ICAL khoá thì trả về trong `khongMoDuoc`,
//   vì mở tay xong lần đồng bộ sau lại khoá — phải sửa ở nguồn (sheet/ical).
// - Không khoá ngày đã có booking: booking đã chiếm rồi, khoá thêm chỉ gây rối.
router.put('/:id/lich-khoa', requireRole(...QUAN_LY), async (req, res) => {
  const home = await findOwn(prisma.home, req, req.params.id, { select: { id: true, hostId: true } });
  if (!home) return notFound(res, 'căn nhà');
  const hostId = ownHostId(req);

  // Đúng dạng YYYY-MM-DD VÀ là ngày có thật (2026-13-99 khớp regex nhưng Date ra NaN -> 500).
  const chuan = (arr) => [...new Set((Array.isArray(arr) ? arr : []).map(String)
    .filter((s) => YMD.test(s) && !Number.isNaN(ngayUTC(s).getTime()) && ymd(ngayUTC(s)) === s))];
  const khoa = chuan(req.body?.khoa);
  const mo = chuan(req.body?.mo);
  const ghiChu = typeof req.body?.ghiChu === 'string' && req.body.ghiChu.trim() ? req.body.ghiChu.trim().slice(0, 200) : null;
  if (!khoa.length && !mo.length) return res.status(400).json({ error: 'Không có ngày nào để khoá/mở' });
  if (khoa.length + mo.length > 400) return res.status(400).json({ error: 'Mỗi lần tối đa 400 ngày' });

  // Ngày đã có booking thì không khoá thêm.
  const daCoBooking = new Set();
  if (khoa.length) {
    const ds = khoa.map(ngayUTC);
    const min = new Date(Math.min(...ds)), max = new Date(Math.max(...ds));
    const bks = await prisma.booking.findMany({
      where: { homeId: home.id, checkIn: { lte: max }, checkOut: { gt: min } },
      select: { checkIn: true, checkOut: true },
    });
    for (const b of bks) {
      for (let d = new Date(b.checkIn); d < b.checkOut; d.setUTCDate(d.getUTCDate() + 1)) daCoBooking.add(ymd(d));
    }
  }
  const khoaThat = khoa.filter((s) => !daCoBooking.has(s));

  const ketQua = await prisma.$transaction(async (tx) => {
    let daKhoa = 0;
    if (khoaThat.length) {
      const r = await tx.lichKhoa.createMany({
        data: khoaThat.map((s) => ({ hostId, homeId: home.id, ngay: ngayUTC(s), nguon: 'MANUAL', ghiChu, createdById: req.user.id })),
        skipDuplicates: true,
      });
      daKhoa = r.count;
    }
    let daMo = 0, khongMoDuoc = [];
    if (mo.length) {
      const ds = mo.map(ngayUTC);
      const conLai = await tx.lichKhoa.findMany({
        where: { homeId: home.id, ngay: { in: ds }, nguon: { not: 'MANUAL' } },
        select: { ngay: true, nguon: true },
      });
      khongMoDuoc = conLai.map((k) => ({ ngay: ymd(k.ngay), nguon: k.nguon }));
      const r = await tx.lichKhoa.deleteMany({ where: { homeId: home.id, ngay: { in: ds }, nguon: 'MANUAL' } });
      daMo = r.count;
    }
    return { daKhoa, daMo, khongMoDuoc };
  }, { maxWait: 15000, timeout: 30000 }); // Neon ở US: mặc định 5s là đứt khi mạng chậm

  res.json({ ...ketQua, boQuaViCoBooking: khoa.filter((s) => daCoBooking.has(s)) });
});

export default router;
