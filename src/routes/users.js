import { routerAnToan } from '../lib/router-an-toan.js';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { requireRole, hostWhereTaiKhoan, hostHieuLuc, ownHostId, notFound, CHU_WORKSPACE } from '../middleware/auth.js';

const router = routerAnToan();

const VALID_ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'HOST', 'SALES'];
const normRole = (r) => {
  if (r == null) return undefined;
  const up = String(r).toUpperCase();
  return VALID_ROLES.includes(up) ? up : null; // null = giá trị không hợp lệ
};

// HOST tự quản nhân sự trong workspace của mình. hostWhereTaiKhoan() lo phần cách ly:
// ADMIN ngoài hỗ trợ thấy TOÀN BỘ tài khoản (việc cấp nền tảng: duyệt, khoá, đổi mật
// khẩu — không phải dữ liệu kinh doanh); ADMIN đang hỗ trợ host nào thì thấy host đó;
// HOST chỉ thấy/sửa/xoá tài khoản cùng hostId.
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

// ───── Nhật ký admin vào hỗ trợ workspace này ─────
// Đây là bằng chứng cho lời hứa với host: "ngày thường tôi không nhìn; khi bạn cần
// hỗ trợ tôi phải bật chế độ riêng, và mỗi lần bật đều ghi lại — bạn xem được".
// HOST xem của host mình; ADMIN đang hỗ trợ host nào thì xem host đó.
router.get('/nhat-ky-ho-tro', async (req, res) => {
  const h = hostHieuLuc(req);
  if (h == null) return res.json([]);
  const logs = await prisma.hoTroLog.findMany({
    where: { hostId: h },
    orderBy: { luc: 'desc' },
    take: 100,
    include: { admin: { select: { name: true, username: true } } },
  });
  res.json(logs.map((l) => ({ id: l.id, luc: l.luc, lyDo: l.lyDo, admin: l.admin.name || l.admin.username })));
});

router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    where: hostWhereTaiKhoan(req),
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
    const n = (await prisma.user.updateMany({ where: hostWhereTaiKhoan(req, { id }), data: { status: 'ACTIVE' } })).count;
    if (!n) return notFound(res, 'tài khoản');
    const user = await prisma.user.findFirst({ where: hostWhereTaiKhoan(req, { id }),
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

router.post('/', async (req, res, next) => {
  try {
    const { username, password, name, email, role, active } = req.body;
    if (!username || !password || !name) return res.status(400).json({ error: 'Thiếu thông tin' });

    const nRole = normRole(role);
    if (nRole === null) return res.status(400).json({ error: 'Vai trò không hợp lệ' });
    const roleCap = nRole || 'STAFF';   // không gửi role -> STAFF, nhưng vẫn phải qua bảng quyền
    if (!canAssignRole(req, roleCap)) return res.status(403).json({ error: 'Không đủ quyền cấp vai trò này' });

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(400).json({ error: 'Username đã tồn tại' });

    // Tài khoản admin tạo tay -> ACTIVE ngay.
    //
    // hostId: SALES và ADMIN là tài khoản CẤP NỀN TẢNG, KHÔNG thuộc workspace nào -> hostId = null.
    // (Trước đây code gọi ownHostId() cho mọi vai, nên admin ngoài chế độ hỗ trợ tạo tài khoản
    // Sales là ném lỗi "phải vào chế độ hỗ trợ" — mà lỗi lại bị catch nuốt thành "Lỗi tạo tài
    // khoản" chung chung, không ai biết vì sao. Sales mà gán hostId thì cũng sai bản chất:
    // sales phải thấy căn của MỌI host.)
    // Các vai còn lại nằm trong workspace: mặc định host của người tạo, ADMIN được chỉ định host khác.
    const VAI_NEN_TANG = ['SALES', 'ADMIN'];
    const hostId = VAI_NEN_TANG.includes(roleCap)
      ? null
      : (req.user.role === 'ADMIN' && req.body.hostId != null)
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
    // KHÔNG nuốt lỗi thành câu chung chung: lỗi mình chủ động ném (có .status) mang lý do
    // thật cho người dùng — nuốt đi là màn hình chỉ hiện "Lỗi tạo tài khoản", không ai
    // đoán được vì sao. Đẩy về error handler ở server.js, nó lo phân loại.
    next(err);
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

    const n = (await prisma.user.updateMany({ where: hostWhereTaiKhoan(req, { id }), data })).count;
    if (!n) return notFound(res, 'tài khoản');
    res.json(await prisma.user.findFirst({ where: hostWhereTaiKhoan(req, { id }),
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
    const n = (await prisma.user.deleteMany({ where: hostWhereTaiKhoan(req, { id }) })).count;
    if (!n) return notFound(res, 'tài khoản');
    res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    res.status(500).json({ error: 'Lỗi xóa tài khoản' });
  }
});

export default router;
