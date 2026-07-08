import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const VALID_ROLES = ['ADMIN', 'MANAGER', 'STAFF'];
const normRole = (r) => {
  if (r == null) return undefined;
  const up = String(r).toUpperCase();
  return VALID_ROLES.includes(up) ? up : null; // null = giá trị không hợp lệ
};

router.use(requireRole('ADMIN'));

router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { id: 'asc' }
  });
  res.json(users);
});

router.post('/', async (req, res) => {
  try {
    const { username, password, name, email, role, active } = req.body;
    if (!username || !password || !name) return res.status(400).json({ error: 'Thiếu thông tin' });

    const nRole = normRole(role);
    if (nRole === null) return res.status(400).json({ error: 'Vai trò không hợp lệ' });

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(400).json({ error: 'Username đã tồn tại' });

    const user = await prisma.user.create({
      data: {
        username, password: bcrypt.hashSync(password, 10),
        name, email: email || null,
        role: nRole || 'STAFF',
        active: active !== false
      },
      select: { id: true, username: true, name: true, email: true, role: true, active: true }
    });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tạo tài khoản' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { password, name, email, role, active } = req.body;
    const data = {};
    if (password) data.password = bcrypt.hashSync(password, 10);
    if (name) data.name = name;
    if (email !== undefined) data.email = email;
    if (role !== undefined) {
      const nRole = normRole(role);
      if (nRole === null) return res.status(400).json({ error: 'Vai trò không hợp lệ' });
      if (nRole) data.role = nRole;
    }
    if (active !== undefined) data.active = active;

    const user = await prisma.user.update({
      where: { id }, data,
      select: { id: true, username: true, name: true, email: true, role: true, active: true }
    });
    res.json(user);
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    res.status(500).json({ error: 'Lỗi cập nhật tài khoản' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'Không thể xóa chính mình' });
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    res.status(500).json({ error: 'Lỗi xóa tài khoản' });
  }
});

export default router;
