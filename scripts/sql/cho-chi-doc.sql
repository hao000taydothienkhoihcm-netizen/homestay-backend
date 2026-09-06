-- ═══════════════════════════════════════════════════════════════════
-- TÀI KHOẢN CHỈ-ĐỌC CHO SERVICE CHỢ CĂN
--
-- Chạy MỘT LẦN trong Neon → SQL Editor, chọn database `neondb`, chạy bằng
-- role chủ sở hữu (neondb_owner).
--
-- VÌ SAO: service chợ (src/cho.js) nối bằng tài khoản này. Chợ mở cho người
-- ngoài (sales) và đổi mỗi ngày. Nếu nó nối bằng chuỗi của app nội bộ thì một
-- bug hay một lỗ hổng ở chợ là ghi thẳng được vào booking, thu chi, kho của
-- 100 host. Cấp quyền ở tầng cơ sở dữ liệu là hàng rào duy nhất không phụ
-- thuộc vào việc code có đúng hay không.
--
-- LƯU Ý: tự đặt mật khẩu ở dòng dưới, đừng dùng mật khẩu trong ví dụ, và
-- ĐỪNG dán chuỗi kết nối vào chat hay commit vào git — chỉ điền thẳng vào
-- biến môi trường DATABASE_URL_CHO trên Render.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Tạo role. Đổi <MAT_KHAU_MANH> thành mật khẩu do bạn tự đặt.
CREATE ROLE cho_chi_doc WITH LOGIN PASSWORD '<MAT_KHAU_MANH>';

-- 2) Cho phép nối vào database và nhìn thấy schema public.
GRANT CONNECT ON DATABASE neondb TO cho_chi_doc;
GRANT USAGE   ON SCHEMA   public TO cho_chi_doc;

-- 3) Chỉ SELECT. KHÔNG cấp INSERT / UPDATE / DELETE / TRUNCATE.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cho_chi_doc;

-- 4) Bảng tạo sau này (migration mới) cũng tự có SELECT — nếu quên dòng này thì
--    vài tháng nữa thêm bảng mới, chợ đọc không được và không ai nhớ vì sao.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO cho_chi_doc;

-- 5) KHÔNG cấp quyền trên sequence. Không có sequence thì không INSERT được,
--    kể cả lỡ tay cấp nhầm INSERT ở đâu đó.

-- ───── Kiểm lại sau khi chạy ─────
-- Đăng nhập bằng cho_chi_doc rồi thử, phải ra lỗi "permission denied":
--   INSERT INTO "Expense" (date, category, "desc", amount) VALUES (now(), 'test', 'test', 1);
--
-- Và câu này phải chạy được:
--   SELECT count(*) FROM "Home";

-- ───── Chuỗi kết nối để dán vào Render ─────
-- Lấy host y hệt chuỗi DATABASE_URL đang dùng (nhớ giữ đuôi -pooler và các tham số
-- connect_timeout / pool_timeout — Neon ngủ đông, thiếu là Prisma bỏ cuộc sau 5 giây):
--
--   postgresql://cho_chi_doc:<MAT_KHAU_MANH>@<host>-pooler.<vung>.aws.neon.tech/neondb
--     ?sslmode=require&connect_timeout=30&pool_timeout=30
--
-- Đặt vào Render → service "sabi-cho" → Environment → DATABASE_URL_CHO.

-- ───── Khi chợ cần quyền GHI (giai đoạn 2-3) ─────
-- Đừng cấp lại toàn bộ. Chỉ cấp trên đúng bảng của chợ, ví dụ:
--   GRANT SELECT, INSERT, UPDATE ON "ChoYeuCau" TO cho_chi_doc;
--   GRANT USAGE, SELECT ON SEQUENCE "ChoYeuCau_id_seq" TO cho_chi_doc;
--
-- Bảng "Booking", "Expense", "InventoryEntry" thì KHÔNG BAO GIỜ cấp quyền ghi cho chợ.
-- Chợ muốn tạo booking thì gọi API của app nội bộ, để app nội bộ tự kiểm rồi tự ghi —
-- xem mục E3 trong tach-cho-chay-rieng.html.
