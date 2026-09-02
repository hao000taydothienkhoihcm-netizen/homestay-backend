import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireRole, hostWhere, ownHostId, findOwn, updateOwn, deleteOwn, notFound, CHU_WORKSPACE } from '../middleware/auth.js';

const router = Router();

// Ai đăng nhập cũng đọc được (front cần để tính giá booking) — chỉ ngày lễ của host mình.
router.get('/', async (req, res) => {
  const holidays = await prisma.holiday.findMany({
    where: hostWhere(req),
    orderBy: { startDate: 'asc' }
  });
  res.json(holidays);
});

router.post('/', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const { name, startDate, endDate } = req.body;
  if (!name || !startDate) return res.status(400).json({ error: 'Thiếu tên hoặc ngày bắt đầu' });
  const s = new Date(startDate);
  const e = endDate ? new Date(endDate) : s;
  if (isNaN(s) || isNaN(e)) return res.status(400).json({ error: 'Ngày không hợp lệ' });
  if (e < s) return res.status(400).json({ error: 'Ngày kết thúc phải sau ngày bắt đầu' });
  const holiday = await prisma.holiday.create({
    data: { name: String(name).trim(), startDate: s, endDate: e, hostId: ownHostId(req) }
  });
  res.status(201).json(holiday);
});

router.patch('/:id', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, startDate, endDate } = req.body;
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (startDate !== undefined) {
    const s = new Date(startDate);
    if (isNaN(s)) return res.status(400).json({ error: 'Ngày bắt đầu không hợp lệ' });
    data.startDate = s;
  }
  if (endDate !== undefined) {
    const e = new Date(endDate);
    if (isNaN(e)) return res.status(400).json({ error: 'Ngày kết thúc không hợp lệ' });
    data.endDate = e;
  }
  const n = await updateOwn(prisma.holiday, req, id, data);
  if (!n) return notFound(res, 'ngày lễ');
  res.json(await findOwn(prisma.holiday, req, id));
});

router.delete('/:id', requireRole(...CHU_WORKSPACE), async (req, res) => {
  const n = await deleteOwn(prisma.holiday, req, req.params.id);
  if (!n) return notFound(res, 'ngày lễ');
  res.json({ ok: true });
});

export default router;
