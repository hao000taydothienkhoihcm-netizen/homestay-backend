import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireRole, hostWhere, ownHostId } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const { from, to, category, homeId } = req.query;
  const where = hostWhere(req);
  if (from && to) where.date = { gte: new Date(from), lte: new Date(to) };
  if (category) where.category = category;
  if (homeId) where.homeId = parseInt(homeId);

  const expenses = await prisma.expense.findMany({
    where,
    include: { home: true },
    orderBy: { date: 'desc' }
  });
  res.json(expenses);
});

router.post('/', requireRole('ADMIN'), async (req, res) => {
  const { date, category, desc, amount, homeId } = req.body;
  if (!date || !category || !desc || !amount) return res.status(400).json({ error: 'Thiếu thông tin' });

  const expense = await prisma.expense.create({
    data: {
      date: new Date(date),
      category, desc,
      amount: parseInt(amount),
      homeId: homeId ? parseInt(homeId) : null,
      hostId: ownHostId(req)
    }
  });
  res.status(201).json(expense);
});

router.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { date, category, desc, amount, homeId } = req.body;
  const expense = await prisma.expense.update({
    where: { id },
    data: {
      ...(date && { date: new Date(date) }),
      ...(category && { category }),
      ...(desc && { desc }),
      ...(amount !== undefined && { amount: parseInt(amount) }),
      ...(homeId !== undefined && { homeId: homeId ? parseInt(homeId) : null })
    }
  });
  res.json(expense);
});

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  await prisma.expense.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ ok: true });
});

export default router;
