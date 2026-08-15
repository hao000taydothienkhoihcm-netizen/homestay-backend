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
    { id: user.id, role: user.role, hostId: user.hostId ?? null },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email, hostId: user.hostId ?? null }
  });
});

// ───── ĐĂNG KÝ (tự đăng ký Host / Sales → PENDING chờ admin duyệt) ─────
router.post('/register', async (req, res) => {
  try {
    const { username, password, name, phone, brand, role } = req.body;
    if (!username || !password || !name) return res.status(400).json({ error: 'Thiếu username/mật khẩu/tên' });

    const wanted = String(role || '').toUpperCase();
    if (!['HOST', 'SALES'].includes(wanted)) {
      return res.status(400).json({ error: 'Chỉ được đăng ký vai Host hoặc Sales' });
    }

    const uname = String(username).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { username: uname } });
    if (existing) return res.status(400).json({ error: 'Username đã tồn tại' });

    // Host: tạo luôn workspace (Host) nhưng để inactive tới khi được duyệt.
    let hostId = null;
    if (wanted === 'HOST') {
      const host = await prisma.host.create({
        data: { name: name, brand: brand || null, phone: phone || null, active: false }
      });
      hostId = host.id;
    }

    const user = await prisma.user.create({
      data: {
        username: uname,
        password: bcrypt.hashSync(password, 10),
        name,
        role: wanted,
        status: 'PENDING',   // chờ admin duyệt
        active: true,
        hostId
      },
      select: { id: true, username: true, name: true, role: true, status: true, hostId: true }
    });
    res.status(201).json({ ok: true, user, message: 'Đăng ký thành công, chờ admin duyệt.' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi đăng ký' });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  const { password, ...user } = req.user;
  res.json({ user });
});

export default router;
