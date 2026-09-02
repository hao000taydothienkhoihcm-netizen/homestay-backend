import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireRole, hostWhere, ownHostId, findOwn, updateOwn, deleteOwn, ownsRecord, notFound, CHU_WORKSPACE } from '../middleware/auth.js';

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

router.post('/', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const { date, category, desc, amount, homeId } = req.body;
  if (!date || !category || !desc || !amount) return res.status(400).json({ error: 'Thiếu thông tin' });

  // homeId đến từ body -> phải là căn của host mình, không thì gắn chi phí sang nhà người khác được.
  if (!(await ownsRecord(prisma.home, req, homeId))) return notFound(res, 'căn nhà');

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

router.patch('/:id', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const id = parseInt(req.params.id);
  const { date, category, desc, amount, homeId } = req.body;

  if (homeId !== undefined && !(await ownsRecord(prisma.home, req, homeId))) {
    return notFound(res, 'căn nhà');
  }

  const n = await updateOwn(prisma.expense, req, id, {
    ...(date && { date: new Date(date) }),
    ...(category && { category }),
    ...(desc && { desc }),
    ...(amount !== undefined && { amount: parseInt(amount) }),
    ...(homeId !== undefined && { homeId: homeId ? parseInt(homeId) : null })
  });
  if (!n) return notFound(res, 'khoản thu chi');

  res.json(await findOwn(prisma.expense, req, id, { include: { home: true } }));
});

router.delete('/:id', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const n = await deleteOwn(prisma.expense, req, req.params.id);
  if (!n) return notFound(res, 'khoản thu chi');
  res.json({ ok: true });
});

export default router;
