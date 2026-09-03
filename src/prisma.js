import { PrismaClient } from '@prisma/client';

const goc = new PrismaClient({
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
