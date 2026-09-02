// Quản lý các HOST (workspace) — CHỈ ADMIN.
//
// Khác hẳn routes/users.js: chỗ đó tạo NHÂN SỰ bên trong một workspace đã có,
// còn chỗ này MỞ workspace mới. Trước đây không có route này nên admin không
// xem, sửa hay khoá host được; host chỉ sinh ra qua /auth/register.
//
// KHÔNG có route xoá. Xoá một host là kéo theo toàn bộ booking, thu chi, kho,
// bảng giá của họ — mất là không lấy lại được. Cần "dừng" một host thì KHOÁ
// (active = false); middleware xác thực sẽ chặn mọi tài khoản thuộc host đó.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// Toàn bộ file chỉ ADMIN. Cố ý KHÔNG dùng CHU_WORKSPACE: host mà vào được đây
// là họ thấy tên và mở/khoá được các host khác.
router.use(requireRole('ADMIN'));

const chuoi = (v) => (v == null ? null : String(v).trim() || null);

// ───── DANH SÁCH ─────
// Kèm số căn / booking / tài khoản để admin nhìn phát biết host nào đang chạy thật,
// host nào đăng ký xong bỏ đó.
router.get('/', async (req, res) => {
  const hosts = await prisma.host.findMany({
    orderBy: { id: 'asc' },
    include: {
      _count: { select: { homes: true, bookings: true, users: true } },
      users: {
        where: { role: 'HOST' },
        select: { id: true, username: true, name: true, status: true, active: true },
        orderBy: { id: 'asc' },
      },
    },
  });

  res.json(hosts.map((h) => ({
    id: h.id,
    name: h.name,
    brand: h.brand,
    phone: h.phone,
    active: h.active,
    createdAt: h.createdAt,
    soCan: h._count.homes,
    soBooking: h._count.bookings,
    soTaiKhoan: h._count.users,
    chuNha: h.users,          // các tài khoản vai HOST của workspace này
  })));
});

// ───── XEM 1 HOST ─────
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const h = await prisma.host.findUnique({
    where: { id },
    include: {
      _count: { select: { homes: true, bookings: true, users: true, expenses: true } },
      users: { select: { id: true, username: true, name: true, role: true, status: true, active: true }, orderBy: { id: 'asc' } },
    },
  });
  if (!h) return res.status(404).json({ error: 'Không tìm thấy chủ nhà' });
  res.json(h);
});

// ───── MỞ HOST MỚI ─────
// Tạo Host + tài khoản chủ trong CÙNG một giao dịch. Tách ra hai bước thì lúc
// bước sau hỏng sẽ để lại một workspace không ai vào được, phải dọn tay.
router.post('/', async (req, res) => {
  try {
    const { name, brand, phone, username, password, ownerName, email } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ error: 'Thiếu tên chủ nhà / username / mật khẩu' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    }

    const uname = String(username).trim().toLowerCase();
    const trung = await prisma.user.findUnique({ where: { username: uname } });
    if (trung) return res.status(400).json({ error: 'Username đã tồn tại' });

    const kq = await prisma.$transaction(async (tx) => {
      const host = await tx.host.create({
        data: {
          name: String(name).trim(),
          brand: chuoi(brand),
          phone: chuoi(phone),
          active: true,           // admin tạo tay thì bật luôn, không phải chờ duyệt
        },
      });
      const chu = await tx.user.create({
        data: {
          username: uname,
          password: bcrypt.hashSync(String(password), 10),
          name: chuoi(ownerName) || String(name).trim(),
          email: chuoi(email),
          role: 'HOST',
          status: 'ACTIVE',
          active: true,
          hostId: host.id,        // điểm khác biệt so với POST /users
        },
        select: { id: true, username: true, name: true, role: true, status: true, hostId: true },
      });
      return { host, chu };
    });

    res.status(201).json(kq);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tạo chủ nhà' });
  }
});

// ───── SỬA THÔNG TIN ─────
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, brand, phone } = req.body;
    const data = {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Tên không được để trống' });
      data.name = String(name).trim();
    }
    if (brand !== undefined) data.brand = chuoi(brand);
    if (phone !== undefined) data.phone = chuoi(phone);

    const n = await prisma.host.updateMany({ where: { id }, data });
    if (!n.count) return res.status(404).json({ error: 'Không tìm thấy chủ nhà' });
    res.json(await prisma.host.findUnique({ where: { id } }));
  } catch (err) {
    res.status(500).json({ error: 'Lỗi cập nhật chủ nhà' });
  }
});

// ───── KHOÁ / MỞ ─────
// Khoá là chặn cả workspace: mọi tài khoản thuộc host đó không đăng nhập được nữa
// (xem authMiddleware). Dữ liệu giữ nguyên, mở lại là chạy tiếp.
router.patch('/:id/active', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const bat = req.body.active !== false;

    // Không cho khoá chính workspace mình đang đứng — tự khoá mình ra ngoài.
    if (!bat && id === req.user.hostId) {
      return res.status(400).json({ error: 'Không thể khoá chính workspace bạn đang dùng' });
    }

    const n = await prisma.host.updateMany({ where: { id }, data: { active: bat } });
    if (!n.count) return res.status(404).json({ error: 'Không tìm thấy chủ nhà' });
    res.json(await prisma.host.findUnique({ where: { id } }));
  } catch (err) {
    res.status(500).json({ error: 'Lỗi đổi trạng thái chủ nhà' });
  }
});

export default router;
