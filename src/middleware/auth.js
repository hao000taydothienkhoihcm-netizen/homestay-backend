import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';

export async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Thiếu token đăng nhập' });
  }

  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user?.active) return res.status(401).json({ error: 'Tài khoản không hoạt động' });
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token không hợp lệ' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Không đủ quyền thao tác' });
    }
    next();
  };
}
