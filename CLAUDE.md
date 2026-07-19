# HOMESTAY MANAGER — Ghi chú dự án (đọc trước khi làm tiếp)

> File này để Claude (và người dùng) đọc là nắm lại toàn bộ dự án khi mở ở máy khác.
> Chủ dự án: **Haotran House** — quản lý homestay/cho thuê tại Việt Nam. Trả lời bằng **tiếng Việt**, ngắn gọn. Tiền tệ luôn là **VNĐ**.

---

## 1. Dự án là gì

Phần mềm quản lý homestay cho thuê theo đêm: đặt phòng, nhận/trả nhà, thu chi, phụ thu & phạt, quản lý kho (đồ tiêu thụ trong phòng), thống kê doanh thu/lợi nhuận. Gồm 3 phần dùng chung 1 database:

- **Backend API** — Node/Express (ES modules) + Prisma + PostgreSQL. Đây là repo này.
- **Web quản lý** — 1 file `public/index.html` (SPA thuần, không build), backend phục vụ luôn.
- **App điện thoại** — React Native (nằm ở repo/thư mục riêng, không nằm trong repo này).

---

## 2. Hạ tầng & liên kết quan trọng

| Thành phần | Giá trị |
|---|---|
| GitHub repo | https://github.com/hao000taydothienkhoihcm-netizen/homestay-backend (nhánh **main**) |
| Web chạy thật (live) | https://homestay-backend-n61g.onrender.com/index.html |
| Hosting backend | **Render Free** — service ID `srv-d970p958nd3s73bt01a0`, project `prj-d970p8t8nd3s73bt0140` |
| Database | **Neon PostgreSQL** (free tier), trên cloud — chung cho mọi máy + Render |
| Tài khoản admin mặc định | `admin` / `admin123` |

**Auto-deploy trên Render đang TẮT.** Muốn cập nhật web/backend thật phải deploy tay: Render Dashboard → service → **Manual Deploy** → *Deploy latest commit* (hoặc *Clear build cache & deploy* khi đổi schema).
Build của Render tự chạy `prisma generate` + `prisma db push` (thêm cột kiểu nullable, không phá dữ liệu).

---

## 3. Chạy dự án trên máy mới (VD máy Sài Gòn)

```bash
# 1. Lấy code
cd /d/projects
git clone https://github.com/hao000taydothienkhoihcm-netizen/homestay-backend.git
cd homestay-backend

# 2. Tạo file .env (KHÔNG có trong git — phải tạo tay)
#    Copy nội dung dưới, riêng DATABASE_URL lấy từ Render → Environment → DATABASE_URL (chuỗi Neon)

# 3. Cài & chạy
npm install
npx prisma generate
npm start          # server chạy ở cổng 3000
```

Nội dung `.env` (các khoá cần có):
```
DATABASE_URL="<chuỗi Neon lấy từ Render, dạng postgresql://...neon.tech/...?sslmode=require>"
JWT_SECRET="<chuỗi ngẫu nhiên dài >= 32 ký tự>"
PORT=3000
NODE_ENV=development
CORS_ORIGIN="*"
```

> **Lưu ý bảo mật:** `.env` chứa mật khẩu DB, **không** commit lên git (đã bị `.gitignore` chặn). Chỉ copy tay giữa các máy.

**Git Bash trên Windows:** dùng đường dẫn gạch xuôi `/d/projects/...`, KHÔNG dùng `D:\projects\...`.

---

## 4. Cấu trúc code

```
homestay-backend/
├─ prisma/schema.prisma      # Toàn bộ mô hình dữ liệu (xem mục 5)
├─ src/
│  ├─ server.js              # Khởi động Express
│  ├─ prisma.js              # Prisma client
│  ├─ middleware/            # Auth JWT, phân quyền
│  ├─ services/bookingService.js
│  └─ routes/
│     ├─ auth.js             # Đăng nhập
│     ├─ homes.js            # CRUD căn nhà
│     ├─ bookings.js         # Đặt phòng, nhận/trả nhà, phụ thu
│     ├─ chargeTemplates.js  # Mẫu phụ thu & phạt + cấu hình kho
│     ├─ inventory.js        # Nhập kho + báo cáo tồn kho tháng
│     ├─ expenses.js         # Thu chi vận hành
│     ├─ stats.js            # Thống kê doanh thu/chi phí
│     └─ users.js            # CRUD tài khoản
├─ public/index.html         # WEB quản lý (SPA 1 file) — deploy = sửa file này
└─ render.yaml               # Cấu hình Render
```

Web bản làm việc (chưa deploy) còn 1 bản ở `D:\projects\homestay-web\index.html`; khi deploy thì đưa nội dung vào `public/index.html` của repo này rồi commit.

---

## 5. Mô hình dữ liệu (Prisma) — điểm cần nhớ

- **User**: role `ADMIN` / `MANAGER` / `STAFF`. Nhân viên (STAFF) bị ẩn Thống kê + Thu/Chi.
- **Home** (căn nhà): `price` = giá ngày thường (T2–T5), `weekendPrice` = giá cuối tuần (T6,T7,CN). Tự động chọn giá theo đêm.
- **Booking**: 2 mức giá theo đêm, có `discount` (giảm giá), `deposit` (cọc), `paidAtCheckIn`. Trạng thái: `CONFIRMED → CHECKEDIN → CHECKOUT_TODAY → CHECKEDOUT`.
- **Charge** (phụ thu từng booking): có `phase` = `CHECKIN` (thu lúc nhận nhà) hoặc `CHECKOUT` (thu lúc trả nhà). Doanh thu phụ thu nhận nhà tính ngay khi CHECKEDIN; phụ thu trả nhà tính khi CHECKEDOUT.
- **ChargeTemplate** (mẫu phụ thu/phạt): `type` = `RULE` (phạt, không số lượng) hoặc `QUICK` (đồ tiêu thụ, có số lượng). Nếu `trackStock=true` thì theo dõi kho: `packSize`, `packLabel`, `unitLabel`, `lowStock`, `costPrice` (giá vốn để tính lợi nhuận).
- **StockEntry**: nhập kho / điều chỉnh tồn theo từng căn (`IMPORT` / `ADJUST`).
- **Expense**: chi phí vận hành theo ngày/căn/danh mục.

### Bản sửa gần nhất — "Mức 2: liên kết phụ thu–kho bằng templateId"
Vấn đề: khi xoá 1 mẫu phụ thu (đồ trong kho), báo cáo kho bị mất phần đã bán của mặt hàng đó (vì trước đây khớp theo **tên**).
Cách sửa: thêm khoá ngoại **`Charge.templateId → ChargeTemplate.id`** với `onDelete: SetNull`.
- Xoá mẫu → chỉ gỡ liên kết (set null), **không** xoá lịch sử phụ thu.
- Báo cáo kho khớp theo **ID** trước, rồi mới tới tên → mặt hàng đã "ngừng bán" nhưng còn lịch sử bán/nhập vẫn hiện (VD 16 "ly mỳ ly" bán trong tháng 7), có nhãn đỏ **"ngừng bán"** trên web.
File liên quan: `prisma/schema.prisma` (model Charge), `src/routes/bookings.js` (gán templateId khi tạo/sửa/checkout), `src/routes/inventory.js` (báo cáo gồm mặt hàng ngừng-bán-còn-lịch-sử), `public/index.html` (nhãn "ngừng bán"). Đã commit & deploy xong.

---

## 6. Quy trình deploy (mỗi lần sửa)

**Backend/code:**
```bash
cd /d/projects/homestay-backend
git add .
git commit -m "mô tả thay đổi"
git push
```
Rồi vào Render → Manual Deploy → *Deploy latest commit* (đổi schema thì *Clear build cache & deploy*).

**Web:** sửa `public/index.html` → commit/push như trên → deploy Render. (Nếu sửa ở `D:\projects\homestay-web\index.html` thì copy nội dung sang `public/index.html` trước.)

---

## 7. ⚠️ Cấm làm (vì DB dùng chung dữ liệu thật)

KHÔNG chạy các lệnh sau trên bất kỳ máy nào — chúng **xoá sạch dữ liệu thật** trên Neon:
- `npm run db:reset` / `npm run db:clean`
- `npx prisma db push --force-reset`
- `npx prisma migrate reset`
- `node prisma/seed.js` (seed đè dữ liệu)

An toàn: `npm start`, `npm run dev`, `npx prisma studio` (chỉ xem), `npx prisma generate`.
Đổi schema thật thì dùng `npx prisma db push` (không có `--force-reset`) — thêm cột nullable là an toàn.
