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
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: { host: { select: { active: true, name: true } } },
    });
    if (!user?.active) return res.status(401).json({ error: 'Tài khoản không hoạt động' });
    if (user.status === 'PENDING') return res.status(403).json({ error: 'Tài khoản đang chờ duyệt' });

    // Workspace bị khoá thì chặn CẢ HOST LẪN NHÂN SỰ của host đó — trước đây cột
    // Host.active chỉ nằm im trong bảng, không ai đọc, nên "khoá host" không có
    // tác dụng gì: họ vẫn đăng nhập và làm việc bình thường.
    // ADMIN được miễn: admin đang mang hostId = 1, khoá nhầm host #1 là admin tự
    // khoá mình ra ngoài, không còn đường vào để mở lại.
    if (user.role !== 'ADMIN' && user.hostId && user.host && !user.host.active) {
      return res.status(403).json({ error: 'Workspace đang tạm khoá, liên hệ quản trị viên' });
    }

    delete user.host;   // chỉ dùng để kiểm ở trên, không để lọt ra req.user
    req.user = user;

    // ───── Chế độ hỗ trợ của ADMIN ─────
    // Admin muốn xem/sửa hộ một host thì gửi kèm header X-Ho-Tro chứa token do
    // POST /hosts/:id/ho-tro cấp. Token đó chỉ được cấp SAU KHI đã ghi nhật ký,
    // nên không có cách nào vào hỗ trợ mà không để lại dấu vết. Token ký bằng
    // JWT_SECRET, hết hạn sau 2 giờ, và gắn với đúng admin đang đăng nhập —
    // admin A không dùng được token của admin B.
    req.hoTroHostId = null;
    const ht = req.headers['x-ho-tro'];
    if (ht && user.role === 'ADMIN') {
      try {
        const p = jwt.verify(String(ht), process.env.JWT_SECRET);
        if (p.loai === 'ho-tro' && p.adminId === user.id && Number.isInteger(p.hostId)) {
          req.hoTroHostId = p.hostId;
        }
      } catch { /* token hỗ trợ hỏng/hết hạn -> coi như không ở chế độ hỗ trợ */ }
    }
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token không hợp lệ' });
  }
}

// Cấp token vào hỗ trợ. Gọi từ routes/hosts.js sau khi đã ghi HoTroLog.
export function kyTokenHoTro(adminId, hostId) {
  return jwt.sign({ loai: 'ho-tro', adminId, hostId }, process.env.JWT_SECRET, { expiresIn: '2h' });
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Không đủ quyền thao tác' });
    }
    next();
  };
}

// ───── Nhóm vai trò ─────
// HOST là CHỦ workspace của chính họ: quyền thao tác ngang ADMIN, nhưng mọi câu truy vấn
// vẫn đi qua hostWhere() nên chỉ đụng được dữ liệu host của mình. ADMIN là chủ nền tảng:
// có mặt trong cả 3 nhóm để KHI VÀO HỖ TRỢ làm được mọi việc thay host, còn ngoài chế
// độ hỗ trợ thì hostWhere() không khớp gì nên có quyền cũng không có dữ liệu để đụng.
//
// Dùng 3 nhóm này thay vì viết tay từng danh sách vai trò — thêm/bớt một vai sau này
// chỉ sửa một chỗ, không phải rà lại 26 route.
export const CHU_WORKSPACE = ['ADMIN', 'HOST'];                    // căn nhà, thu chi, ngày lễ, nhân sự
export const QUAN_LY = ['ADMIN', 'HOST', 'MANAGER'];               // bảng giá, sửa/xoá booking, điều chỉnh kho
export const VAN_HANH = ['ADMIN', 'HOST', 'MANAGER', 'STAFF'];     // thao tác hằng ngày: đặt phòng, nhập kho

// ───── Multi-tenant helper ─────
// Host "hiệu lực" của request này:
//   HOST/MANAGER/STAFF -> host của chính họ
//   ADMIN đang hỗ trợ   -> host được hỗ trợ
//   ADMIN ngày thường   -> null: KHÔNG có host nào
//   SALES               -> null (tài khoản cấp nền tảng)
export function hostHieuLuc(req) {
  if (req.user.role === 'ADMIN') return req.hoTroHostId ?? null;
  return req.user.hostId ?? null;
}

// Điều kiện lọc theo host để nhét vào Prisma `where`.
//
// ĐÃ ĐỔI (09/2026): trước đây ADMIN trả {} — không lọc — nên đăng nhập admin là
// thấy booking của MỌI host trộn vào một danh sách. Chủ nhà nói đúng: "họ mà biết
// tôi thấy hết dữ liệu của họ thì họ không dùng app". Giờ admin ngoài chế độ hỗ trợ
// nhận hostId: -1 -> không khớp dòng nào, y như tài khoản chưa gán host.
export function hostWhere(req, extra = {}) {
  return { ...extra, hostId: hostHieuLuc(req) ?? -1 };
}

// Riêng bảng User: admin cần thấy TẤT CẢ tài khoản để quản lý (duyệt, khoá, đổi
// mật khẩu) — đó là việc cấp nền tảng, không phải dữ liệu kinh doanh của host.
// Đang hỗ trợ một host thì chỉ thấy tài khoản của host đó, cho nhất quán.
export function hostWhereTaiKhoan(req, extra = {}) {
  if (req.user.role === 'ADMIN' && req.hoTroHostId == null) return { ...extra };
  return hostWhere(req, extra);
}

// hostId để GẮN vào bản ghi mới.
// Không có host hiệu lực (admin chưa vào hỗ trợ) thì NÉM LỖI thay vì trả null:
// trả null là tạo ra bản ghi mồ côi không thuộc host nào, không ai thấy, không
// ai xoá được. Lỗi có status nên error handler nói thật lý do cho người dùng.
export function ownHostId(req) {
  const h = hostHieuLuc(req);
  if (h == null) {
    const e = new Error(req.user.role === 'ADMIN'
      ? 'Admin phải vào chế độ hỗ trợ một chủ nhà trước khi thêm dữ liệu'
      : 'Tài khoản chưa thuộc chủ nhà nào');
    e.status = 400;
    throw e;
  }
  return h;
}

// ───── Kiểm chủ sở hữu cho thao tác THEO ID ─────
// hostWhere() lo phần ĐỌC DANH SÁCH. Nhưng sửa/xoá theo id thì Prisma bắt buộc
// dùng khoá duy nhất (`where: { id }`) nên không nhét hostId vào được — đó chính là
// lỗ hổng: host B đoán id là sửa/xoá được bản ghi của host A.
//
// Cách bịt: dùng updateMany/deleteMany (nhận where tự do) rồi đọc số bản ghi đụng tới.
// count = 0 nghĩa là "không tồn tại HOẶC không phải của mình" — trả 404 cho cả hai
// trường hợp, cố tình không phân biệt để không lộ ra là id đó có tồn tại.
// ADMIN đang hỗ trợ host nào thì đụng được đúng host đó; ngoài hỗ trợ thì không gì cả.

const num = (v) => { const n = parseInt(v); return Number.isFinite(n) ? n : null; };

// Đọc 1 bản ghi của host mình. null = không có quyền hoặc không tồn tại.
export async function findOwn(model, req, id, opts = {}) {
  const n = num(id);
  if (n === null) return null;
  return model.findFirst({ where: hostWhere(req, { id: n }), ...opts });
}

// Sửa có kiểm host. Trả số bản ghi đã sửa (0 = từ chối).
export async function updateOwn(model, req, id, data) {
  const n = num(id);
  if (n === null) return 0;
  const r = await model.updateMany({ where: hostWhere(req, { id: n }), data });
  return r.count;
}

// Xoá có kiểm host. Trả số bản ghi đã xoá (0 = từ chối).
export async function deleteOwn(model, req, id) {
  const n = num(id);
  if (n === null) return 0;
  const r = await model.deleteMany({ where: hostWhere(req, { id: n }) });
  return r.count;
}

// Kiểm id NHẬN TỪ BODY có thuộc host mình không (VD homeId khi tạo booking / thu chi).
// null/undefined coi là hợp lệ vì trường đó không bắt buộc.
export async function ownsRecord(model, req, id) {
  if (id === null || id === undefined || id === '') return true;
  const n = num(id);
  if (n === null) return false;
  return (await model.count({ where: hostWhere(req, { id: n }) })) > 0;
}

// Câu trả lời chuẩn khi không tìm thấy / không phải của mình.
export function notFound(res, what = 'bản ghi') {
  return res.status(404).json({ error: `Không tìm thấy ${what}` });
}
