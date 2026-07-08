import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Thiếu username/password' });

  const uname = String(username).trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { username: uname } });
  if (!user) return res.status(401).json({ error: 'Tài khoản không tồn tại' });
  if (!user.active) return res.status(401).json({ error: 'Tài khoản đã bị khóa' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Sai mật khẩu' });

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email }
  });
});

router.get('/me', authMiddleware, (req, res) => {
  const { password, ...user } = req.user;
  res.json({ user });
});

export default router;
