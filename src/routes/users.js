import { routerAnToan } from '../lib/router-an-toan.js';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { requireRole, hostWhere, ownHostId, findOwn, updateOwn, deleteOwn, notFound, CHU_WORKSPACE } from '../middleware/auth.js';

const router = routerAnToan();

const VALID_ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'HOST', 'SALES'];
const normRole = (r) => {
  if (r == null) return undefined;
  const up = String(r).toUpperCase();
  return VALID_ROLES.includes(up) ? up : null; // null = giá trị không hợp lệ
};

// HOST tự quản nhân sự trong workspace của mình. hostWhere() lo phần cách ly:
// ADMIN thấy toàn bộ, HOST chỉ thấy/sửa/xoá tài khoản cùng hostId.
router.use(requireRole(...CHU_WORKSPACE));

// Vai trò nào được cấp vai trò nào. Thiếu bảng này thì HOST tự nâng mình lên ADMIN
// là thấy toàn bộ 100 host, hoặc tự đẻ ra tài khoản SALES (tài khoản cấp nền tảng,
// không thuộc workspace nào).
const ROLE_DUOC_CAP = {
  ADMIN: ['ADMIN', 'MANAGER', 'STAFF', 'HOST', 'SALES'],
  HOST: ['MANAGER', 'STAFF'],   // muốn thêm HOST đồng sở hữu thì phải qua ADMIN
};
function canAssignRole(req, role) {
  return (ROLE_DUOC_CAP[req.user.role] || []).includes(role);
}

// Không phải ADMIN thì không được đụng vào tài khoản ADMIN — kể cả khi cùng hostId.
// Admin gốc đang mang hostId = 1, nên nếu không chặn, một HOST của host #1
// sẽ sửa/xoá được chính tài khoản admin.
async function laAdminKhac(req, id) {
  if (req.user.role === 'ADMIN') return false;
  const u = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  return u?.role === 'ADMIN';
}

router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    where: hostWhere(req),
    select: {
      id: true, username: true, name: true, email: true, role: true,
      active: true, status: true, hostId: true,
      host: { select: { name: true, brand: true } },
      createdAt: true
    },
    orderBy: { id: 'asc' }
  });
  res.json(users);
});

// Duyệt tài khoản (Host/Sales) đang chờ: chuyển PENDING -> ACTIVE, bật luôn workspace host.
router.patch('/:id/approve', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (await laAdminKhac(req, id)) return notFound(res, 'tài khoản');
    const n = await updateOwn(prisma.user, req, id, { status: 'ACTIVE' });
    if (!n) return notFound(res, 'tài khoản');
    const user = await findOwn(prisma.user, req, id, {
      select: { id: true, username: true, name: true, role: true, status: true, hostId: true }
    });
    if (user.role === 'HOST' && user.hostId) {
      await prisma.host.update({ where: { id: user.hostId }, data: { active: true } });
    }
    res.json(user);
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    res.status(500).json({ error: 'Lỗi duyệt tài khoản' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { username, password, name, email, role, active } = req.body;
    if (!username || !password || !name) return res.status(400).json({ error: 'Thiếu thông tin' });

    const nRole = normRole(role);
    if (nRole === null) return res.status(400).json({ error: 'Vai trò không hợp lệ' });
    const roleCap = nRole || 'STAFF';   // không gửi role -> STAFF, nhưng vẫn phải qua bảng quyền
    if (!canAssignRole(req, roleCap)) return res.status(403).json({ error: 'Không đủ quyền cấp vai trò này' });

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(400).json({ error: 'Username đã tồn tại' });

    // Tài khoản admin tạo tay -> ACTIVE ngay. Gán hostId theo body, mặc định host của người tạo.
    // Chỉ ADMIN được chỉ định host khác; người khác luôn tạo trong host của chính mình.
    const hostId = (req.user.role === 'ADMIN' && req.body.hostId != null)
      ? parseInt(req.body.hostId)
      : ownHostId(req);
    const user = await prisma.user.create({
      data: {
        username, password: bcrypt.hashSync(password, 10),
        name, email: email || null,
        role: roleCap,
        active: active !== false,
        status: 'ACTIVE',
        hostId
      },
      select: { id: true, username: true, name: true, email: true, role: true, active: true, status: true, hostId: true }
    });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tạo tài khoản' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (await laAdminKhac(req, id)) return notFound(res, 'tài khoản');
    const { password, name, email, role, active } = req.body;
    const data = {};
    if (password) data.password = bcrypt.hashSync(password, 10);
    if (name) data.name = name;
    if (email !== undefined) data.email = email;
    if (role !== undefined) {
      const nRole = normRole(role);
      if (nRole === null) return res.status(400).json({ error: 'Vai trò không hợp lệ' });
      if (nRole && !canAssignRole(req, nRole)) {
        return res.status(403).json({ error: 'Không đủ quyền cấp vai trò này' });
      }
      if (nRole) data.role = nRole;
    }
    if (active !== undefined) data.active = active;

    const n = await updateOwn(prisma.user, req, id, data);
    if (!n) return notFound(res, 'tài khoản');
    res.json(await findOwn(prisma.user, req, id, {
      select: { id: true, username: true, name: true, email: true, role: true, active: true }
    }));
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    res.status(500).json({ error: 'Lỗi cập nhật tài khoản' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'Không thể xóa chính mình' });
    if (await laAdminKhac(req, id)) return notFound(res, 'tài khoản');
    const n = await deleteOwn(prisma.user, req, id);
    if (!n) return notFound(res, 'tài khoản');
    res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    res.status(500).json({ error: 'Lỗi xóa tài khoản' });
  }
});

export default router;
