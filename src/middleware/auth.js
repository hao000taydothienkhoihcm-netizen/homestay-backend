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

// ───── Nhóm vai trò ─────
// HOST là CHỦ workspace của chính họ: quyền thao tác ngang ADMIN, nhưng mọi câu truy vấn
// vẫn đi qua hostWhere() nên chỉ đụng được dữ liệu host của mình. ADMIN là super-role,
// hostWhere() bỏ lọc nên thấy toàn bộ host.
//
// Dùng 3 nhóm này thay vì viết tay từng danh sách vai trò — thêm/bớt một vai sau này
// chỉ sửa một chỗ, không phải rà lại 26 route.
export const CHU_WORKSPACE = ['ADMIN', 'HOST'];                    // căn nhà, thu chi, ngày lễ, nhân sự
export const QUAN_LY = ['ADMIN', 'HOST', 'MANAGER'];               // bảng giá, sửa/xoá booking, điều chỉnh kho
export const VAN_HANH = ['ADMIN', 'HOST', 'MANAGER', 'STAFF'];     // thao tác hằng ngày: đặt phòng, nhập kho

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

// ───── Kiểm chủ sở hữu cho thao tác THEO ID ─────
// hostWhere() lo phần ĐỌC DANH SÁCH. Nhưng sửa/xoá theo id thì Prisma bắt buộc
// dùng khoá duy nhất (`where: { id }`) nên không nhét hostId vào được — đó chính là
// lỗ hổng: host B đoán id là sửa/xoá được bản ghi của host A.
//
// Cách bịt: dùng updateMany/deleteMany (nhận where tự do) rồi đọc số bản ghi đụng tới.
// count = 0 nghĩa là "không tồn tại HOẶC không phải của mình" — trả 404 cho cả hai
// trường hợp, cố tình không phân biệt để không lộ ra là id đó có tồn tại.
// ADMIN là super-role nên hostWhere() tự bỏ lọc, không ảnh hưởng.

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
