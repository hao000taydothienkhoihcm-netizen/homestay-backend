import { PrismaClient } from '@prisma/client';

// ───── HAI kết nối, hai mức quyền ─────
//
// Đổi 15/09/2026. Trước đây mỗi TIẾN TRÌNH có một client: app nội bộ cầm quyền chủ sở
// hữu, chợ (SABI_SERVICE=cho) cầm role Neon `cho_chi_doc` chỉ SELECT. Nay chợ gánh
// thêm mặt CHỦ NHÀ (khai căn, ảnh, nối lịch) — là hành động ghi — nên trong cùng tiến
// trình chợ phải có cả hai:
//
//   prisma       quyền chủ sở hữu  -> route host (/homes, /holidays…), lọc theo hostId
//   prismaChiDoc chỉ SELECT         -> route sales (/cho)
//
// Điểm cốt yếu: hàng rào chỉ-đọc chưa bao giờ nằm ở "tiến trình", nó nằm ở "route sales
// cầm kết nối nào". Route /cho vẫn cầm đúng kết nối chỉ-đọc như cũ — có bug hay bị khai
// thác ở mặt sales thì vẫn KHÔNG ghi nổi vào booking / thu chi / kho của host. Quyền
// nằm ở tầng cơ sở dữ liệu, không phải lời hứa trong code.
//
// prismaChiDoc chỉ tồn tại khi có DATABASE_URL_CHO. App nội bộ không cần nó. Service chợ
// thì BẮT BUỘC — server-cho.js kiểm và ném lỗi lúc khởi động, không im lặng quay về
// quyền chủ sở hữu.
const LOG = process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'];

const goc = new PrismaClient({ log: LOG });

const gocChiDoc = process.env.DATABASE_URL_CHO
  ? new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_CHO } }, log: LOG })
  : null;

// ───── Thùng rác cho Booking: tự giấu dòng đã xoá mềm ─────
//
// Booking xoá là chỉ đặt deletedAt, không xoá dòng. Nhưng có 15+ chỗ truy vấn
// booking (danh sách, lịch, thống kê, kiểm trùng lịch, đếm để xoá căn nhà…).
// Đi thêm `deletedAt: null` vào từng chỗ thì thế nào cũng sót một chỗ, và chỗ
// sót đó sẽ cho booking đã xoá hiện lại trong thống kê hoặc chặn ngày trên lịch.
//
// Nên chặn ngay tại client: mọi thao tác ĐỌC/ĐẾM/SỬA-HÀNG-LOẠT trên Booking đều
// tự được thêm `deletedAt: null`, TRỪ KHI câu truy vấn đã nói rõ về deletedAt
// (thùng rác sẽ hỏi `deletedAt: { not: null }`). Route mới viết sau này không
// phải nhớ gì cả.
//
// Không đụng findUnique / update / delete: chúng dùng khoá duy nhất, không nhận
// deletedAt trong where. Các route đều findOwn() trước khi update theo id, và
// findOwn đi qua findFirst — nên vẫn được lọc.
const CO_WHERE = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy',
  'updateMany', 'deleteMany',
]);

// Cùng một bộ lọc thùng rác cho CẢ HAI client — chợ đọc lịch qua booking, nếu client
// chỉ-đọc không lọc thì booking đã xoá vẫn chặn ngày trên chợ.
const themThungRac = (client) => client.$extends({
  name: 'thung-rac-booking',
  query: {
    booking: {
      async $allOperations({ operation, args, query }) {
        if (CO_WHERE.has(operation)) {
          const where = args.where ?? {};
          if (where.deletedAt === undefined) {
            args = { ...args, where: { ...where, deletedAt: null } };
          }
        }
        return query(args);
      },
    },
  },
});

/** Quyền chủ sở hữu, lọc hostId ở tầng route. Dùng cho mọi route trừ /cho. */
export const prisma = themThungRac(goc);

/** Chỉ SELECT (role cho_chi_doc). CHỈ dành cho route /cho. null nếu chưa khai DATABASE_URL_CHO. */
export const prismaChiDoc = gocChiDoc ? themThungRac(gocChiDoc) : null;

// Client KHÔNG lọc — chỉ cho việc dọn thùng rác / sao lưu. Đừng dùng trong route.
export const prismaGoc = goc;
