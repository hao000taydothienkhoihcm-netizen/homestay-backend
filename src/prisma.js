import { PrismaClient } from '@prisma/client';

// ───── Chợ chạy bằng một tài khoản Postgres CHỈ ĐỌC ─────
// Service "chợ" (src/server-cho.js) đặt SABI_SERVICE=cho và nối bằng DATABASE_URL_CHO —
// một role Neon chỉ có quyền SELECT. Nhờ vậy dù chợ có bug hay bị khai thác thì cũng
// KHÔNG THỂ ghi vào booking / thu chi / kho của host. Đây là hàng rào thật, không phải
// lời hứa trong code: quyền nằm ở tầng cơ sở dữ liệu.
//
// Thiếu biến thì NÉM LỖI ngay lúc khởi động. Im lặng quay về DATABASE_URL nghĩa là chợ
// chạy bằng quyền chủ sở hữu mà không ai biết — đúng cái mình đang muốn tránh.
const laCho = process.env.SABI_SERVICE === 'cho';
if (laCho && !process.env.DATABASE_URL_CHO) {
  throw new Error(
    'SABI_SERVICE=cho nhưng thiếu DATABASE_URL_CHO. Chợ phải nối bằng role chỉ-đọc, ' +
    'không được dùng chung chuỗi kết nối của app nội bộ.'
  );
}

const goc = new PrismaClient({
  ...(laCho ? { datasources: { db: { url: process.env.DATABASE_URL_CHO } } } : {}),
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

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

export const prisma = goc.$extends({
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

// Client KHÔNG lọc — chỉ cho việc dọn thùng rác / sao lưu. Đừng dùng trong route.
export const prismaGoc = goc;
