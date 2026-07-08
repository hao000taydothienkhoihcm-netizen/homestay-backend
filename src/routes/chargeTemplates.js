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

router.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { name, amount, type } = req.body;
  if (!name || !amount || !type) return res.status(400).json({ error: 'Thiếu thông tin' });
  if (!['RULE', 'QUICK'].includes(type)) return res.status(400).json({ error: 'Type không hợp lệ' });

  const tpl = await prisma.chargeTemplate.create({
    data: { name, amount: parseInt(amount), type }
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
      ...(amount !== undefined && { amount: parseInt(amount) })
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
