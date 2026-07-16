import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// Chuẩn hoá key map: obj[a][b]
function bump(map, a, b, val) {
  if (!map[a]) map[a] = {};
  map[a][b] = (map[a][b] || 0) + val;
}

// Biên tháng [start, end] từ ?month=YYYY-MM (mặc định tháng hiện tại)
function monthBounds(monthStr) {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  if (monthStr && /^\d{4}-\d{1,2}$/.test(monthStr)) {
    const [yy, mm] = monthStr.split('-').map(Number);
    y = yy; m = mm;
  }
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end, label: `${String(m).padStart(2, '0')}/${y}` };
}

// Đầu ngày hôm nay (00:00) để so ngày quá khứ
function startOfToday() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}
// Ngày (từ input) có thuộc quá khứ so với hôm nay không?
function isPastDate(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return dd < startOfToday();
}
// Chỉ ADMIN được thao tác trên ngày quá khứ; NV/QL chỉ hôm nay + tương lai
function canTouchPast(user) {
  return user && user.role === 'ADMIN';
}

// ───── TỒN KHO + BÁO CÁO THÁNG ─────
// GET /v1/inventory?month=YYYY-MM&homeId=optional
// Trả về: { month, homes[], products[ { ...meta, rows:[{homeId,onHand,imported,sold,low}] } ] }
router.get('/', async (req, res) => {
  const { month, homeId } = req.query;
  const { start, end, label } = monthBounds(month);
  const homeFilter = homeId ? parseInt(homeId) : null;

  const [products, homes, entries, charges] = await Promise.all([
    prisma.chargeTemplate.findMany({
      where: { type: 'QUICK', trackStock: true, active: true },
      orderBy: { id: 'asc' }
    }),
    prisma.home.findMany({ where: { active: true }, orderBy: { id: 'asc' } }),
    prisma.stockEntry.findMany(),
    prisma.charge.findMany({
      include: { booking: { select: { homeId: true, checkIn: true, checkOut: true } } }
    })
  ]);

  const prodByName = {};
  products.forEach(p => { prodByName[p.name] = p; });

  // ── Sổ kho theo tháng: Tồn đầu + Nhập − Bán (± Điều chỉnh) = Tồn cuối ──
  // Bán ra (từ Charge): tách trước tháng / trong tháng. Bỏ qua bán ở tương lai (sau tháng).
  const soldBefore = {};   // bán trước [start]
  const soldMonth = {};    // bán trong [start,end]
  for (const c of charges) {
    const p = prodByName[c.name];
    if (!p || !c.booking) continue;
    const hid = c.booking.homeId;
    const attr = c.phase === 'CHECKIN' ? c.booking.checkIn : c.booking.checkOut;
    const d = attr ? new Date(attr) : null;
    if (!d) continue;
    if (d < start) bump(soldBefore, p.id, hid, c.qty);
    else if (d <= end) bump(soldMonth, p.id, hid, c.qty);
    // d > end: bỏ qua (chưa tính vào tháng này)
  }

  // Nhập / điều chỉnh (từ StockEntry): tách trước tháng / trong tháng.
  const inBefore = {};        // net (IMPORT + ADJUST) trước [start]
  const importedMonth = {};   // chỉ IMPORT trong tháng
  const adjustMonth = {};     // chỉ ADJUST trong tháng (có thể âm)
  for (const e of entries) {
    const d = new Date(e.date);
    if (d < start) bump(inBefore, e.templateId, e.homeId, e.qty);
    else if (d <= end) {
      if (e.type === 'ADJUST') bump(adjustMonth, e.templateId, e.homeId, e.qty);
      else bump(importedMonth, e.templateId, e.homeId, e.qty);
    }
    // d > end: bỏ qua
  }

  const visibleHomes = homeFilter ? homes.filter(h => h.id === homeFilter) : homes;

  const result = products.map(p => {
    const rows = visibleHomes.map(h => {
      const opening = ((inBefore[p.id]?.[h.id]) || 0) - ((soldBefore[p.id]?.[h.id]) || 0);
      const imported = (importedMonth[p.id]?.[h.id]) || 0;
      const sold = (soldMonth[p.id]?.[h.id]) || 0;
      const adjust = (adjustMonth[p.id]?.[h.id]) || 0;
      const onHand = opening + imported + adjust - sold; // tồn cuối
      return {
        homeId: h.id,
        opening,
        imported,
        sold,
        adjust,
        onHand,
        low: p.lowStock > 0 && onHand <= p.lowStock
      };
    });
    return {
      id: p.id,
      name: p.name,
      amount: p.amount,
      unitLabel: p.unitLabel,
      packLabel: p.packLabel,
      packSize: p.packSize,
      lowStock: p.lowStock,
      costPrice: p.costPrice || 0,   // giá vốn 1 đơn vị lẻ (tính lợi nhuận)
      rows
    };
  });

  res.json({
    month: label,
    homes: visibleHomes.map(h => ({ id: h.id, name: h.name, emoji: h.emoji })),
    products: result
  });
});

// ───── LỊCH SỬ NHẬP / ĐIỀU CHỈNH ─────
// GET /v1/inventory/entries?month=&homeId=&templateId=
router.get('/entries', async (req, res) => {
  const { month, homeId, templateId } = req.query;
  const where = {};
  if (month) {
    const { start, end } = monthBounds(month);
    where.date = { gte: start, lte: end };
  }
  if (homeId) where.homeId = parseInt(homeId);
  if (templateId) where.templateId = parseInt(templateId);
  const entries = await prisma.stockEntry.findMany({
    where,
    include: { template: { select: { name: true, unitLabel: true } }, home: { select: { name: true, emoji: true } } },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: 200
  });
  res.json(entries);
});

// ───── NHẬP HÀNG ─────
// POST /v1/inventory/import { templateId, homeId, packs, units, date, note }
router.post('/import', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  const { templateId, homeId, packs, units, date, note } = req.body;
  const tid = parseInt(templateId);
  const hid = parseInt(homeId);
  if (!tid || !hid) return res.status(400).json({ error: 'Thiếu mặt hàng hoặc căn nhà' });

  // NV/QL chỉ được nhập cho hôm nay/tương lai; nhập bù quá khứ chỉ ADMIN
  if (isPastDate(date) && !canTouchPast(req.user)) {
    return res.status(403).json({ error: 'Chỉ Admin được nhập bù ngày đã qua' });
  }

  const tpl = await prisma.chargeTemplate.findUnique({ where: { id: tid } });
  if (!tpl || tpl.type !== 'QUICK') return res.status(404).json({ error: 'Mặt hàng không hợp lệ' });

  // Nhập hàng nghĩa là bắt đầu theo dõi kho món này
  if (!tpl.trackStock) {
    await prisma.chargeTemplate.update({ where: { id: tid }, data: { trackStock: true } });
  }

  const p = Math.max(0, parseInt(packs) || 0);
  const u = Math.max(0, parseInt(units) || 0);
  const qty = p * (tpl.packSize || 1) + u;
  if (qty <= 0) return res.status(400).json({ error: 'Số lượng nhập phải > 0' });

  const entry = await prisma.stockEntry.create({
    data: {
      templateId: tid,
      homeId: hid,
      qty,
      type: 'IMPORT',
      note: note ? String(note).trim() : null,
      date: date ? new Date(date) : new Date()
    },
    include: { template: { select: { name: true, unitLabel: true } }, home: { select: { name: true, emoji: true } } }
  });
  res.status(201).json(entry);
});

// ───── ĐIỀU CHỈNH / KIỂM KÊ ─────
// POST /v1/inventory/adjust { templateId, homeId, qty (số lệch, có thể âm), date, note }
router.post('/adjust', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { templateId, homeId, qty, date, note } = req.body;
  const tid = parseInt(templateId);
  const hid = parseInt(homeId);
  const q = parseInt(qty);
  if (!tid || !hid) return res.status(400).json({ error: 'Thiếu mặt hàng hoặc căn nhà' });
  if (!q) return res.status(400).json({ error: 'Số điều chỉnh không hợp lệ' });
  if (isPastDate(date) && !canTouchPast(req.user)) {
    return res.status(403).json({ error: 'Chỉ Admin được điều chỉnh ngày đã qua' });
  }

  const entry = await prisma.stockEntry.create({
    data: {
      templateId: tid,
      homeId: hid,
      qty: q,
      type: 'ADJUST',
      note: note ? String(note).trim() : null,
      date: date ? new Date(date) : new Date()
    }
  });
  res.status(201).json(entry);
});

// ───── SỬA PHIẾU NHẬP / ĐIỀU CHỈNH ─────
// PATCH /v1/inventory/entries/:id { packs, units, qty, date, note }
router.patch('/entries/:id', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  const id = parseInt(req.params.id);
  const cur = await prisma.stockEntry.findUnique({ where: { id }, include: { template: true } });
  if (!cur) return res.status(404).json({ error: 'Không tìm thấy phiếu' });

  const { packs, units, qty, date, note } = req.body;
  // NV/QL không được đụng phiếu quá khứ, và không được dời sang ngày quá khứ
  if (!canTouchPast(req.user) && (isPastDate(cur.date) || (date && isPastDate(date)))) {
    return res.status(403).json({ error: 'Chỉ Admin được sửa phiếu ngày đã qua' });
  }

  const data = {};
  if (note !== undefined) data.note = note ? String(note).trim() : null;
  if (date) data.date = new Date(date);
  // Số lượng: nhận theo packs/units (IMPORT) hoặc qty thẳng (ADJUST cho phép âm)
  if (packs !== undefined || units !== undefined) {
    const pk = Math.max(0, parseInt(packs) || 0);
    const un = Math.max(0, parseInt(units) || 0);
    const total = pk * (cur.template.packSize || 1) + un;
    if (total <= 0) return res.status(400).json({ error: 'Số lượng phải > 0' });
    data.qty = total;
  } else if (qty !== undefined) {
    const q = parseInt(qty);
    if (cur.type === 'ADJUST') { if (!q) return res.status(400).json({ error: 'Số điều chỉnh không hợp lệ' }); }
    else if (!(q > 0)) return res.status(400).json({ error: 'Số lượng phải > 0' });
    data.qty = q;
  }

  const entry = await prisma.stockEntry.update({
    where: { id }, data,
    include: { template: { select: { name: true, unitLabel: true } }, home: { select: { name: true, emoji: true } } }
  });
  res.json(entry);
});

// ───── XOÁ PHIẾU NHẬP / ĐIỀU CHỈNH ─────
router.delete('/entries/:id', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  const id = parseInt(req.params.id);
  const cur = await prisma.stockEntry.findUnique({ where: { id } });
  if (!cur) return res.json({ ok: true });
  if (!canTouchPast(req.user) && isPastDate(cur.date)) {
    return res.status(403).json({ error: 'Chỉ Admin được xoá phiếu ngày đã qua' });
  }
  await prisma.stockEntry.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
