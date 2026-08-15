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
    if (user.status === 'PENDING') return res.status(403).json({ error: 'Tài khoản đang chờ duyệt' });
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

// ───── Multi-tenant helper ─────
// Điều kiện lọc theo host để nhét vào Prisma `where`.
// ADMIN = super-role thấy toàn bộ host (không lọc). Còn lại chỉ thấy host của mình.
// hostId null (chưa gán) -> trả -1 để không khớp gì, tránh lộ dữ liệu host khác.
export function hostWhere(req, extra = {}) {
  if (req.user.role === 'ADMIN') return { ...extra };
  return { ...extra, hostId: req.user.hostId ?? -1 };
}

// hostId để GẮN vào bản ghi mới. Lấy đúng host của người tạo (admin cũng có host #1).
export function ownHostId(req) {
  return req.user.hostId ?? null;
}
