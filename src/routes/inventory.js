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

  // Bán ra: gom theo (templateId, homeId). soldAll = mọi thời điểm; soldMonth = trong tháng.
  const soldAll = {};
  const soldMonth = {};
  for (const c of charges) {
    const p = prodByName[c.name];
    if (!p || !c.booking) continue;
    const hid = c.booking.homeId;
    bump(soldAll, p.id, hid, c.qty);
    const attr = c.phase === 'CHECKIN' ? c.booking.checkIn : c.booking.checkOut;
    const d = attr ? new Date(attr) : null;
    if (d && d >= start && d <= end) bump(soldMonth, p.id, hid, c.qty);
  }

  // Nhập / điều chỉnh: gom theo (templateId, homeId).
  const stockAll = {};       // tổng nhập + điều chỉnh mọi thời điểm
  const importedMonth = {};  // chỉ IMPORT trong tháng
  for (const e of entries) {
    bump(stockAll, e.templateId, e.homeId, e.qty);
    const d = new Date(e.date);
    if (e.type === 'IMPORT' && d >= start && d <= end) bump(importedMonth, e.templateId, e.homeId, e.qty);
  }

  const visibleHomes = homeFilter ? homes.filter(h => h.id === homeFilter) : homes;

  const result = products.map(p => {
    const rows = visibleHomes.map(h => {
      const imported = (importedMonth[p.id]?.[h.id]) || 0;
      const sold = (soldMonth[p.id]?.[h.id]) || 0;
      const onHand = ((stockAll[p.id]?.[h.id]) || 0) - ((soldAll[p.id]?.[h.id]) || 0);
      return {
        homeId: h.id,
        onHand,
        imported,
        sold,
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

  const tpl = await prisma.chargeTemplate.findUnique({ where: { id: tid } });
  if (!tpl || tpl.type !== 'QUICK') return res.status(404).json({ error: 'Mặt hàng không hợp lệ' });

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

// ───── XOÁ PHIẾU NHẬP / ĐIỀU CHỈNH ─────
router.delete('/entries/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  await prisma.stockEntry.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ ok: true });
});

export default router;
