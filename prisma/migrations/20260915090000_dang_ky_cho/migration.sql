-- Đăng ký trên chợ: SĐT Zalo + "ai giới thiệu" trên tài khoản.
-- Chỉ THÊM hai cột nullable, không đụng dữ liệu cũ.
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "gioiThieu" TEXT;
