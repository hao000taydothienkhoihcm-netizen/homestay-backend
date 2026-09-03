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

export default router;
