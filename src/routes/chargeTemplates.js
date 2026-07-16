import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const { type } = req.query;
  const where = { active: true };
  if (type) where.type = type;
  const templates = await prisma.chargeTemplate.findMany({
    where, orderBy: { id: 'asc' }
  });
  res.json(templates);
});

// Chuẩn hoá các trường cấu hình kho (chỉ dùng cho QUICK)
function stockFields(body) {
  const out = {};
  if (body.trackStock !== undefined) out.trackStock = !!body.trackStock;
  if (body.packSize !== undefined) out.packSize = Math.max(1, parseInt(body.packSize) || 1);
  if (body.packLabel !== undefined) out.packLabel = String(body.packLabel).trim() || 'thùng';
  if (body.unitLabel !== undefined) out.unitLabel = String(body.unitLabel).trim() || 'cái';
  if (body.lowStock !== undefined) out.lowStock = Math.max(0, parseInt(body.lowStock) || 0);
  if (body.costPrice !== undefined) out.costPrice = Math.max(0, parseInt(body.costPrice) || 0);
  return out;
}

router.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { name, amount, type } = req.body;
  if (!name || !amount || !type) return res.status(400).json({ error: 'Thiếu thông tin' });
  if (!['RULE', 'QUICK'].includes(type)) return res.status(400).json({ error: 'Type không hợp lệ' });

  const tpl = await prisma.chargeTemplate.create({
    data: { name, amount: parseInt(amount), type, ...(type === 'QUICK' ? stockFields(req.body) : {}) }
  });
  res.status(201).json(tpl);
});

router.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, amount } = req.body;
  const tpl = await prisma.chargeTemplate.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(amount !== undefined && { amount: parseInt(amount) }),
      ...stockFields(req.body)
    }
  });
  res.json(tpl);
});

router.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  await prisma.chargeTemplate.update({
    where: { id: parseInt(req.params.id) },
    data: { active: false }
  });
  res.json({ ok: true });
});

export default router;
