import { routerAnToan } from '../lib/router-an-toan.js';
import { prisma } from '../prisma.js';
import { requireRole, hostWhere, ownHostId, findOwn, updateOwn, notFound, CHU_WORKSPACE, QUAN_LY } from '../middleware/auth.js';
import { loadPriceTable, stayTotal, isWeekendNight } from '../services/bookingService.js';
import { docViTri } from '../lib/vitri.js';
import { idBangTinh, taiVaDoc, chonTab, docTab } from '../lib/lich-sheet.js';
import express from 'express';
import { dayAnhLen, xoaAnh, DA_BAT as ANH_DA_BAT, viSaoChuaBat } from '../lib/anh.js';
import fs from 'node:fs';

// Luật màu riêng của từng bảng chủ nhà (hai bảng có thể dùng màu NGƯỢC nhau — xanh ở bảng
// này là "đã cọc", ở bảng kia là "tạm giữ"). Không khai thì mặc định: ô có tô màu = không trống.
let LUAT_MAU = null;
function luatMauCua(idBang) {
  if (LUAT_MAU === null) {
    try { LUAT_MAU = JSON.parse(fs.readFileSync(new URL('../../scripts/du-lieu/luat-mau.json', import.meta.url), 'utf8')); }
    catch { LUAT_MAU = {}; }
  }
  const x = LUAT_MAU[idBang];
  if (!x) return null;
  const ra = {};
  for (const [k, v] of Object.entries(x)) if (!k.startsWith('_')) ra[k] = v;
  return ra;
}

const router = routerAnToan();

// '' hoặc null hoặc <= 0  ->  null (nghĩa là "để trống, lùi về mức dưới")
function optPrice(v) {
  if (v === '' || v == null) return null;
  const n = parseInt(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
const ymdUTC = (d) => new Date(d).toISOString().split('T')[0];

// Đêm nào tính giá cuối tuần — host chọn cho từng căn. Giá trị lạ thì bỏ qua,
// giữ nguyên mức đang có, chứ không ném lỗi làm hỏng cả form.
const GOM_HOP_LE = ['T6_T7', 'T6_T7_CN', 'T7_CN', 'T7'];

router.get('/', async (req, res) => {
  const homes = await prisma.home.findMany({
    where: hostWhere(req, { active: true }),
    orderBy: { id: 'asc' }
  });
  res.json(homes);
});

// Danh sách phường/xã cho form đăng chợ (phải đứng TRƯỚC /:id). Hằng số khai ở mục "ĐĂNG CĂN LÊN CHỢ".
router.get('/phuong', (_req, res) => res.json(PHUONG_DA_LAT));

// Form hỏi trước để biết hiện nút "Chọn ảnh từ máy" hay hiện ô dán link.
// PHẢI đứng trước /:id — không thì "anh" bị hiểu là id căn (đúng cái bẫy /phuong đã dính).
router.get('/anh/trang-thai', (_req, res) => res.json({ bat: ANH_DA_BAT, viSao: viSaoChuaBat() }));

router.get('/:id', async (req, res) => {
  const home = await findOwn(prisma.home, req, req.params.id);
  if (!home) return notFound(res, 'căn nhà');
  res.json(home);
});

router.post('/', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const { name, address, price, weekendPrice, holidayPrice, maxGuests, emoji, desc, cuoiTuanGom } = req.body;
  if (!name || !address || !price) return res.status(400).json({ error: 'Thiếu thông tin' });

  const wk = (weekendPrice === '' || weekendPrice == null) ? null : parseInt(weekendPrice);
  const hol = (holidayPrice === '' || holidayPrice == null) ? null : parseInt(holidayPrice);
  const home = await prisma.home.create({
    data: {
      name, address, price: parseInt(price),
      weekendPrice: (wk && wk > 0) ? wk : null,
      holidayPrice: (hol && hol > 0) ? hol : null,
      ...(GOM_HOP_LE.includes(cuoiTuanGom) && { cuoiTuanGom }),
      maxGuests: parseInt(maxGuests) || 8, emoji: emoji || '🏡', desc,
      hostId: ownHostId(req)
    }
  });
  res.status(201).json(home);
});

router.patch('/:id', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, address, price, weekendPrice, holidayPrice, maxGuests, emoji, desc, cuoiTuanGom } = req.body;

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
      ...(GOM_HOP_LE.includes(cuoiTuanGom) && { cuoiTuanGom }),
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
      kind: overridden ? 'ghi-de' : holiday ? 'le'
        : isWeekendNight(d, home.cuoiTuanGom) ? 'cuoi-tuan' : 'thuong',
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
// km tới trung tâm — cho phép lẻ (1,5 km). Trên 100 km là gõ nhầm, bỏ.
const soLe = (v, max = 100) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null;
};
const mangChuoi = (v, max = 20, len = 120) =>
  Array.isArray(v) ? [...new Set(v.map((s) => chuoi(s, len)).filter(Boolean))].slice(0, max) : [];

// (GET /phuong khai ở đầu file, TRƯỚC /:id — không thì "phuong" bị hiểu là id.)

// Lưu nháp / cập nhật thông tin chợ. body.guiDuyet = true -> chuyển CHO_DUYET (nếu đủ điều kiện).
router.patch('/:id/cho', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const id = parseInt(req.params.id);
  const cu = await findOwn(prisma.home, req, id);
  if (!cu) return notFound(res, 'căn nhà');
  const b = req.body || {};

  // ───── Vị trí: host dán link Google Maps thì máy tự ra toạ độ + km ─────
  // Không dán link thì GIỮ NGUYÊN toạ độ cũ (có thể do máy dò từ địa chỉ) và chỉ nhận
  // số km gõ tay. Route này ghi đè cả loạt cột, nên phải nói rõ chỗ nào được giữ lại.
  const mapLink = chuoi(b.mapLink, 800);
  let canhBaoViTri = null;
  let viTri;
  if (mapLink) {
    const t = await docViTri(mapLink);
    if (t) {
      viTri = { mapLink, lat: t.lat, lng: t.lng, viTriUocChung: false, kmTrungTam: t.km };
      if (t.daDao) canhBaoViTri = 'Toạ độ trong link bị đảo thứ tự, đã tự sửa lại giúp bạn.';
    } else {
      // Lưu link để host không mất công dán lại, nhưng không bịa toạ độ.
      viTri = { mapLink, lat: cu.lat, lng: cu.lng, viTriUocChung: cu.viTriUocChung, kmTrungTam: soLe(b.kmTrungTam) ?? cu.kmTrungTam };
      canhBaoViTri = 'Chưa đọc được toạ độ từ link này. Mở Google Maps, bấm Chia sẻ → Sao chép liên kết rồi dán lại.';
    }
  } else {
    viTri = { mapLink: null, lat: cu.lat, lng: cu.lng, viTriUocChung: cu.viTriUocChung, kmTrungTam: soLe(b.kmTrungTam) ?? cu.kmTrungTam };
  }

  const data = {
    salesTitle: chuoi(b.salesTitle, 150),
    landmark: chuoi(b.landmark, 200),
    ...viTri,
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
    // Giá theo LOẠI ĐÊM. Để trống là cố ý: chợ tự lùi lễ -> cuối tuần -> thường,
    // nên host chỉ khai chỗ nào khác biệt, không phải điền đủ ba ô cho mỗi cơ chế.
    listPriceWeekend: soNguyen(b.listPriceWeekend), listPriceHoliday: soNguyen(b.listPriceHoliday),
    floorPriceWeekend: soNguyen(b.floorPriceWeekend), floorPriceHoliday: soNguyen(b.floorPriceHoliday),
    markupHoliday: soNguyen(b.markupHoliday),
  };

  // ───── CHỈ GHI CỘT NÀO FORM GỬI LÊN (15/09/2026) ─────
  // Từ khi phần bán khai trên chợ, app nội bộ chỉ gửi ward / mapLink / bedrooms*. Nếu route
  // này vẫn ghi đè toàn bộ cột chợ như trước thì host bấm Lưu bên app nội bộ là mất sạch
  // ảnh, hoa hồng, bài chào vừa khai trên chợ. Nên: cột KHÔNG có trong body -> không đụng.
  // Form chợ gửi đủ mọi cột nên với nó không có gì đổi (xoá trắng một ô vẫn là xoá).
  const VI_TRI = new Set(['mapLink', 'lat', 'lng', 'viTriUocChung', 'kmTrungTam']);
  const coViTri = 'mapLink' in b || 'kmTrungTam' in b;
  for (const k of Object.keys(data)) {
    if (VI_TRI.has(k) ? !coViTri : !(k in b)) delete data[k];
  }
  if (!coViTri) canhBaoViTri = null;

  // ───── Nguồn lịch ─────
  // LỖI CŨ (sửa 11/09/2026): chỗ này từng ghi `lichNguon: b.lichNguon === 'APP' ? 'APP' : null`,
  // nghĩa là host mở căn ra sửa một chữ rồi bấm Lưu là NGUỒN LỊCH BỊ XOÁ TRẮNG. 61 căn đang
  // chạy lịch từ Google Sheet sẽ lặng lẽ tụt xuống mức ④ "chưa có lịch" mà không ai hay.
  // Nay: form gửi lên cái gì thì nhận cái đó, và form KHÔNG gửi lichNguon thì giữ nguyên.
  if ('lichNguon' in b) {
    const n = b.lichNguon;
    if (n === 'APP') {
      data.lichNguon = 'APP';
      data.lichLink = null; data.lichSheetTab = null; data.lichSheetCot = null; data.lichLoiTu = null;
    } else if (n === 'SHEET') {
      const link = chuoi(b.lichLink, 500);
      const idBang = link ? idBangTinh(link) : null;
      if (!idBang) return res.status(400).json({ error: 'Link Google Sheet không đọc được. Mở bảng lịch → Chia sẻ → Sao chép liên kết rồi dán lại.' });
      data.lichNguon = 'SHEET';
      data.lichLink = link;
      // Đổi sang bảng khác thì mọi thứ máy đã học về bảng cũ (tab nào, cột nào, đọc lúc mấy giờ)
      // đều hết giá trị — xoá đi để lần đồng bộ tới học lại, đừng để số cũ nằm đó đánh lừa.
      if (idBangTinh(cu.lichLink || '') !== idBang) {
        data.lichSheetTab = null; data.lichSheetCot = null; data.lichDongBoLuc = null; data.lichLoiTu = null;
      }
    } else {
      data.lichNguon = null;
      data.lichLink = null; data.lichSheetTab = null; data.lichSheetCot = null; data.lichLoiTu = null;
    }
  }
  // Địa chỉ chính xác dùng chung cột `address` của căn (nhập ở tab "Thông tin căn"),
  // KHÔNG có ô riêng ở đây — trước có cột `street` trùng chức năng, nay bỏ không dùng.
  // Phường là danh tính chống trùng: chỉ sửa khi chưa lên chợ, đang bán thì báo admin.
  if ('ward' in b && (cu.choTrangThai === 'NHAP' || cu.choTrangThai === 'CHO_DUYET')) {
    data.ward = PHUONG_DA_LAT.includes(b.ward) ? b.ward : null;
  }
  if (data.commissionPct != null && data.commissionPct > 50) return res.status(400).json({ error: '% hoa hồng tối đa 50' });
  // Mô hình đã chốt: host ra MỘT mức kê (markupMin), sales chỉ được CẮT bớt phần của mình
  // cho khách, không kê quá. markupMax giữ lại cho dữ liệu cũ, không dùng để kiểm nữa.
  if (data.coCheHoaHong === 'GIA_SAN' && data.markupMin != null && data.markupMin > 5000000) {
    return res.status(400).json({ error: 'Mức kê tối đa 5.000.000đ/đêm — gõ nhầm số 0 rồi?' });
  }

  if (b.guiDuyet === true) {
    const thieu = [];
    // Kiểm trên bản SẼ LƯU: cột form gửi lên lấy từ data, cột form không gửi lấy từ cu.
    // Form chợ gửi đủ mọi cột nên host xoá trắng ô phòng ngủ rồi gửi duyệt vẫn bị chặn.
    const hop = { ...cu, ...data };
    if (!hop.salesTitle) thieu.push('tiêu đề bán hàng');
    if (!hop.address) thieu.push('địa chỉ');
    if (!hop.ward) thieu.push('phường / xã');
    if (!hop.bedrooms) thieu.push('số phòng ngủ');
    // Không ảnh thì Sales không bán được: chấp nhận link album HOẶC ít nhất 1 ảnh bìa.
    if (!hop.albumUrl && !(hop.coverImages || []).length) thieu.push('ảnh (link album hoặc ít nhất 1 ảnh bìa)');
    if (!hop.salesInfo) thieu.push('bài giới thiệu');
    // SĐT/Zalo đón khách: bắt buộc, Sales cần liên hệ sau khi host duyệt giữ chỗ.
    if (String(hop.caretakerPhone || '').replace(/\D/g, '').length < 8) thieu.push('số điện thoại / Zalo đón khách');
    if (!hop.coCheHoaHong) thieu.push('cơ chế hoa hồng');
    if (hop.coCheHoaHong === 'PHAN_TRAM' && (!hop.listPrice || hop.commissionPct == null)) thieu.push('giá bán niêm yết + % hoa hồng');
    if (hop.coCheHoaHong === 'GIA_SAN' && !hop.floorPrice) thieu.push('giá sàn');
    // Không có mức kê thì sales bán xong không được đồng nào — căn sẽ nằm im trên chợ.
    if (hop.coCheHoaHong === 'GIA_SAN' && !hop.markupMin) thieu.push('mức kê cho Sales');
    if (thieu.length) return res.status(400).json({ error: 'Chưa đủ để gửi duyệt: ' + thieu.join(', '), thieu });
    if (cu.choTrangThai !== 'DANG_BAN') data.choTrangThai = 'CHO_DUYET';
  } else if (b.an === true && cu.choTrangThai === 'DANG_BAN') {
    data.choTrangThai = 'AN';           // host tự tạm ẩn khỏi chợ
  } else if (b.an === false && cu.choTrangThai === 'AN') {
    data.choTrangThai = 'DANG_BAN';     // đã được duyệt rồi thì mở lại không cần duyệt lại
  }

  const n = await updateOwn(prisma.home, req, id, data);
  if (!n) return notFound(res, 'căn nhà');
  const sau = await findOwn(prisma.home, req, id);
  res.json(canhBaoViTri ? { ...sau, canhBaoViTri } : sau);
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

// ═══════════════════ ẢNH CĂN ═══════════════════
// Host chọn ảnh từ máy/điện thoại. Trình duyệt đã thu nhỏ trước khi gửi (xem CanNhaModal),
// nên tới đây ảnh chỉ còn vài trăm KB. Nhận BINARY THÔ chứ không multipart: đỡ thêm một
// thư viện, mà bên gửi cũng chỉ cần fetch(body: blob).
router.post('/:id/anh', requireRole(...CHU_WORKSPACE),
  express.raw({ type: ['image/*', 'application/octet-stream'], limit: '8mb' }),
  async (req, res) => {
    if (!ANH_DA_BAT) return res.status(503).json({ error: 'Kho ảnh chưa bật. ' + viSaoChuaBat() });
    const home = await findOwn(prisma.home, req, req.params.id, { select: { id: true, coverImages: true } });
    if (!home) return notFound(res, 'căn nhà');
    if ((home.coverImages || []).length >= 8) return res.status(400).json({ error: 'Mỗi căn tối đa 8 ảnh bìa. Xoá bớt rồi thêm.' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Không nhận được dữ liệu ảnh.' });

    try {
      const { url, bytes } = await dayAnhLen(home.id, req.body);
      // Ghi luôn vào căn: host bấm chọn ảnh là ảnh phải nằm trong hồ sơ ngay, không
      // phải nhớ bấm Lưu nữa. Quên bấm Lưu là ảnh nằm chỏng chơ trên kho, không ai thấy.
      const sau = await prisma.home.update({
        where: { id: home.id },
        data: { coverImages: { push: url } },
        select: { coverImages: true },
      });
      res.status(201).json({ url, bytes, coverImages: sau.coverImages });
    } catch (e) {
      res.status(400).json({ error: String(e.message || e).slice(0, 200) });
    }
  });

// Gỡ một ảnh: bỏ khỏi hồ sơ căn TRƯỚC, xoá khỏi kho sau.
// Thứ tự cố ý: xoá kho mà cập nhật hồ sơ hỏng thì căn còn link trỏ vào ảnh đã mất —
// sales mở ra thấy ô vỡ. Ngược lại thì cùng lắm tốn vài trăm KB nằm không.
router.delete('/:id/anh', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const home = await findOwn(prisma.home, req, req.params.id, { select: { id: true, coverImages: true } });
  if (!home) return notFound(res, 'căn nhà');
  const url = chuoi(req.query?.url || req.body?.url, 500);
  if (!url) return res.status(400).json({ error: 'Thiếu url ảnh cần gỡ' });

  const con = (home.coverImages || []).filter((x) => x !== url);
  await prisma.home.update({ where: { id: home.id }, data: { coverImages: con } });
  let daXoaKho = false;
  try { daXoaKho = await xoaAnh(url); } catch { /* kho lỗi thì thôi, hồ sơ đã sạch */ }
  res.json({ coverImages: con, daXoaKho });
});

// ═══ Thử đọc bảng lịch Google Sheet của chủ nhà, KHÔNG ghi gì ═══
// Đây là chỗ trả lời câu hỏi quan trọng nhất của host: "lịch Sabi đọc về có đúng bảng của
// tôi không". Trả về tab nào đọc được, bảng đó có những KHỐI nào (mỗi khối là một căn),
// khối nào đang khớp với căn này, và 21 đêm tới khối đó bận ngày nào — để host liếc qua
// bảng của mình là biết đúng hay sai ngay, không phải chờ tới lúc mất khách mới biết.
router.post('/:id/lich/thu-doc', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const home = await findOwn(prisma.home, req, req.params.id, { select: { id: true, name: true, lichLink: true, lichSheetCot: true } });
  if (!home) return notFound(res, 'căn nhà');
  const link = chuoi(req.body?.lichLink, 500) || home.lichLink;
  const idBang = link ? idBangTinh(link) : null;
  if (!idBang) return res.status(400).json({ error: 'Chưa có link Google Sheet hợp lệ để thử.' });

  let wb;
  try {
    wb = await taiVaDoc(idBang, 60000);
  } catch (e) {
    // Lý do hay gặp nhất là bảng chưa mở chia sẻ — nói thẳng cách sửa, đừng bắt host đoán.
    return res.status(400).json({
      error: String(e?.message || e).includes('403') || String(e?.message || e).includes('401')
        ? 'Bảng chưa mở chia sẻ. Mở bảng → Chia sẻ → "Bất kỳ ai có đường liên kết" → Người xem, rồi thử lại.'
        : 'Không tải được bảng: ' + String(e?.message || e).slice(0, 180),
    });
  }

  const bg = new Date();
  const chon = chonTab(wb, bg.getUTCMonth() + 1, bg.getUTCFullYear());
  if (!chon) return res.status(400).json({ error: `Bảng không có tab nào cho tháng ${bg.getUTCMonth() + 1}/${bg.getUTCFullYear()}.`, tab: wb.worksheets.map((w) => w.name).slice(0, 40) });

  const dsKhoi = docTab(chon.w, chon.w.name, luatMauCua(idBang));
  const gon = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const muon = chuoi(req.body?.khoi, 120) || home.lichSheetCot || home.name;
  const g = gon(muon);
  const khop = dsKhoi.find((k) => gon(k.ten) === g)
    || dsKhoi.find((k) => g.length >= 4 && gon(k.ten).length >= 4 && (gon(k.ten).includes(g) || g.includes(gon(k.ten))))
    || null;

  const homNay = new Date().toISOString().slice(0, 10);
  const dem = (khop?.ngay || []).filter((n) => n.ngay >= homNay).slice(0, 21)
    .map((n) => ({ ngay: n.ngay, trong: n.trangThai === 'trong', trangThai: n.trangThai, gia: n.gia ?? null }));

  res.json({
    idBang, tab: chon.w.name,
    khoi: dsKhoi.map((k) => k.ten).filter(Boolean),
    khop: khop ? khop.ten : null,
    lyDo: khop ? null : `Bảng đọc được nhưng không có khối nào tên giống "${muon}". Chọn đúng khối trong danh sách rồi Lưu.`,
    ngay: dem,
  });
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
