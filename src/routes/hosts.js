// Quản lý các HOST (workspace) — CHỈ ADMIN.
//
// Khác hẳn routes/users.js: chỗ đó tạo NHÂN SỰ bên trong một workspace đã có,
// còn chỗ này MỞ workspace mới. Trước đây không có route này nên admin không
// xem, sửa hay khoá host được; host chỉ sinh ra qua /auth/register.
//
// KHÔNG có route xoá. Xoá một host là kéo theo toàn bộ booking, thu chi, kho,
// bảng giá của họ — mất là không lấy lại được. Cần "dừng" một host thì KHOÁ
// (active = false); middleware xác thực sẽ chặn mọi tài khoản thuộc host đó.
import { routerAnToan } from '../lib/router-an-toan.js';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { requireRole, kyTokenHoTro } from '../middleware/auth.js';

const router = routerAnToan();

// Toàn bộ file chỉ ADMIN. Cố ý KHÔNG dùng CHU_WORKSPACE: host mà vào được đây
// là họ thấy tên và mở/khoá được các host khác.
router.use(requireRole('ADMIN'));

const chuoi = (v) => (v == null ? null : String(v).trim() || null);

// ───── DANH SÁCH ─────
// Kèm số căn / booking / tài khoản để admin nhìn phát biết host nào đang chạy thật,
// host nào đăng ký xong bỏ đó.
//
// ⚠️ CĂN NHÀ LÀ XOÁ MỀM: DELETE /homes/:id chỉ đặt active = false, và GET /homes
// lọc active: true. Nên KHÔNG được dùng _count.homes — nó đếm cả căn đã xoá.
// (Đã sai một lần: host #1 hiện có 2 căn đang dùng nhưng _count trả 8.)
// Booking và tài khoản thì xoá thật, đếm thẳng được.
router.get('/', async (req, res) => {
  const [hosts, canDangDung, canDaXoa] = await Promise.all([
    prisma.host.findMany({
      orderBy: { id: 'asc' },
      include: {
        // Booking cũng xoá mềm từ 09/2026 -> đếm có lọc, không thì gộp cả thùng rác.
        _count: { select: { bookings: { where: { deletedAt: null } }, users: true } },
        users: {
          where: { role: 'HOST' },
          select: { id: true, username: true, name: true, status: true, active: true },
          orderBy: { id: 'asc' },
        },
      },
    }),
    prisma.home.groupBy({ by: ['hostId'], where: { active: true }, _count: { _all: true } }),
    prisma.home.groupBy({ by: ['hostId'], where: { active: false }, _count: { _all: true } }),
  ]);

  const dem = (bang, hostId) =>
    bang.find((r) => r.hostId === hostId)?._count._all ?? 0;

  res.json(hosts.map((h) => ({
    id: h.id,
    name: h.name,
    brand: h.brand,
    phone: h.phone,
    active: h.active,
    createdAt: h.createdAt,
    soCan: dem(canDangDung, h.id),     // chỉ căn đang dùng — khớp với màn Căn nhà
    soCanDaXoa: dem(canDaXoa, h.id),   // căn đã xoá mềm, vẫn nằm trong DB
    soBooking: h._count.bookings,
    soTaiKhoan: h._count.users,
    chuNha: h.users,                   // các tài khoản vai HOST của workspace này
  })));
});

// ───── XEM 1 HOST ─────
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const h = await prisma.host.findUnique({
    where: { id },
    include: {
      _count: { select: { bookings: { where: { deletedAt: null } }, users: true, expenses: true } },
      users: { select: { id: true, username: true, name: true, role: true, status: true, active: true }, orderBy: { id: 'asc' } },
    },
  });
  if (!h) return res.status(404).json({ error: 'Không tìm thấy chủ nhà' });

  // Căn nhà xoá mềm — đếm riêng, không lấy _count.homes (xem ghi chú ở GET /).
  const [soCan, soCanDaXoa] = await Promise.all([
    prisma.home.count({ where: { hostId: id, active: true } }),
    prisma.home.count({ where: { hostId: id, active: false } }),
  ]);
  res.json({ ...h, soCan, soCanDaXoa });
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

// ───── VÀO HỖ TRỢ ─────
// Đây là "tính năng ẩn" duy nhất để admin nhìn thấy dữ liệu của một host.
// Thứ tự bắt buộc: GHI NHẬT KÝ TRƯỚC, cấp token SAU. Token là thứ duy nhất mở
// được hostWhere() cho admin, và không có đường nào lấy token mà không đi qua
// đây — nên không thể vào hỗ trợ mà không để lại dấu vết. Host xem được nhật ký
// qua GET /users/nhat-ky-ho-tro.
router.post('/:id/ho-tro', async (req, res) => {
  const id = parseInt(req.params.id);
  const host = await prisma.host.findUnique({ where: { id }, select: { id: true, name: true, brand: true } });
  if (!host) return res.status(404).json({ error: 'Không tìm thấy chủ nhà' });

  await prisma.hoTroLog.create({
    data: { adminId: req.user.id, hostId: id, lyDo: chuoi(req.body?.lyDo) },
  });

  res.json({
    token: kyTokenHoTro(req.user.id, id),
    host,
    hetHanSau: '2h',
  });
});

// Nhật ký hỗ trợ của một host — admin xem để tự soi lại mình đã vào khi nào.
router.get('/:id/ho-tro-log', async (req, res) => {
  const id = parseInt(req.params.id);
  const logs = await prisma.hoTroLog.findMany({
    where: { hostId: id },
    orderBy: { luc: 'desc' },
    take: 100,
    include: { admin: { select: { name: true, username: true } } },
  });
  res.json(logs.map((l) => ({ id: l.id, luc: l.luc, lyDo: l.lyDo, admin: l.admin.name || l.admin.username })));
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

// ═══════════════════ GĐ3: DUYỆT CĂN LÊN CHỢ ═══════════════════
// Admin KHÔNG thấy booking/thu chi của host, nhưng thông tin đăng chợ thì host CHỦ ĐỘNG
// đưa ra công khai để bán — nên admin đọc được để duyệt, không cần chế độ hỗ trợ.
// Chỉ trả về các cột đăng chợ + tên host; không kèm booking.

const CHON_CAN_CHO = {
  id: true, name: true, address: true, emoji: true, maxGuests: true, price: true, weekendPrice: true,
  choTrangThai: true, salesTitle: true, street: true, ward: true, landmark: true,
  bedrooms: true, bedroomsSingle: true, bedroomsDouble: true, minGuests: true,
  amenities: true, coverImages: true, albumUrl: true, salesInfo: true, caretakerPhone: true,
  coCheHoaHong: true, listPrice: true, commissionPct: true, floorPrice: true, markupMin: true, markupMax: true,
  updatedAt: true, hostId: true,
  host: { select: { id: true, name: true, brand: true, phone: true } },
};

const bo = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

// Nghi trùng: cùng phường và (tên gần giống hoặc cùng số nhà & đường). Chỉ so với căn host KHÁC.
function timTrung(can, tatCa) {
  const ten = bo(can.name), duong = bo(can.street);
  return tatCa.filter((k) => k.id !== can.id && k.hostId !== can.hostId && k.ward && k.ward === can.ward && (
    (ten && bo(k.name) && (bo(k.name).includes(ten) || ten.includes(bo(k.name)))) ||
    (duong && bo(k.street) && bo(k.street) === duong)
  )).map((k) => ({ id: k.id, name: k.name, street: k.street, ward: k.ward, host: k.host?.name, choTrangThai: k.choTrangThai }));
}

// Căn chờ duyệt (mọi host) + gợi ý trùng.
router.get('/can/cho-duyet', async (_req, res) => {
  const cho = await prisma.home.findMany({ where: { active: true, choTrangThai: 'CHO_DUYET' }, select: CHON_CAN_CHO, orderBy: { updatedAt: 'asc' } });
  if (!cho.length) return res.json([]);
  const tatCa = await prisma.home.findMany({
    where: { active: true, ward: { in: [...new Set(cho.map((c) => c.ward).filter(Boolean))] } },
    select: { id: true, name: true, street: true, ward: true, hostId: true, choTrangThai: true, host: { select: { name: true } } },
  });
  res.json(cho.map((c) => ({ ...c, nghiTrung: timTrung(c, tatCa) })));
});

// Toàn cảnh chợ: đếm theo trạng thái + danh sách đang bán (để admin nhìn tổng quan).
router.get('/can/tong-quan', async (_req, res) => {
  const dem = await prisma.home.groupBy({ by: ['choTrangThai'], where: { active: true }, _count: { _all: true } });
  const dangBan = await prisma.home.findMany({ where: { active: true, choTrangThai: { in: ['DANG_BAN', 'AN'] } }, select: CHON_CAN_CHO, orderBy: { updatedAt: 'desc' } });
  res.json({ dem: Object.fromEntries(dem.map((d) => [d.choTrangThai, d._count._all])), dangBan });
});

// Duyệt / từ chối / gỡ khỏi chợ. body: { quyetDinh: 'DUYET' | 'TU_CHOI' | 'GO' }
router.post('/can/:id/duyet', async (req, res) => {
  const id = parseInt(req.params.id);
  const can = await prisma.home.findFirst({ where: { id, active: true }, select: { id: true, choTrangThai: true, name: true } });
  if (!can) return res.status(404).json({ error: 'Không tìm thấy căn' });
  const qd = req.body?.quyetDinh;
  let moi;
  if (qd === 'DUYET' && can.choTrangThai === 'CHO_DUYET') moi = 'DANG_BAN';
  else if (qd === 'TU_CHOI' && can.choTrangThai === 'CHO_DUYET') moi = 'NHAP';
  else if (qd === 'GO' && (can.choTrangThai === 'DANG_BAN' || can.choTrangThai === 'AN')) moi = 'NHAP';
  else return res.status(400).json({ error: `Không áp dụng được "${qd}" cho căn đang ${can.choTrangThai}` });
  const h = await prisma.home.update({ where: { id }, data: { choTrangThai: moi }, select: { id: true, name: true, choTrangThai: true } });
  res.json(h);
});

export default router;
