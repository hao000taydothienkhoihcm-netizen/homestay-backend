# Kế hoạch chuyển web sang React + 4 tính năng mới

> Bản mockup xem tại `mockup/index.html`. File này là phần "đằng sau mockup":
> kiến trúc, những gì backend phải sửa, và thứ tự làm.

---

## 1. Kiến trúc đã chốt

```
E:\project\
├─ src/                  # backend Express (giữ nguyên)
├─ prisma/schema.prisma
├─ public/               # ĐÍCH build — Express phục vụ file ở đây
│   └─ index.html        # web cũ (vanilla) — giữ tới khi React chạy đủ
├─ web/                  # ⬅ APP REACT MỚI (Vite + React + Tailwind)
│   ├─ src/
│   └─ vite.config.js    # build.outDir = '../public'
└─ mockup/               # bản thiết kế (không deploy, đã .gitignore bản copy)
```

**Vì sao đặt trong repo này:** backend Express đã `express.static('../public')` sẵn, Render
đã cấu hình xong — chỉ cần thêm `npm run build` vào bước build của Render là web React
lên thẳng, không phải dựng thêm hosting, không phải xử lý CORS.

**Đề xuất thư viện:**

| Việc | Chọn | Lý do |
|---|---|---|
| Khung | Vite + React 19 | giống `my-hotel-app` bạn đã làm, quen tay |
| CSS | Tailwind v4 + `sabi-tokens.css` | token màu/chữ giữ nguyên, Tailwind chỉ lo layout |
| Router | React Router v7 | 10+ trang, cần URL riêng để F5 không mất chỗ |
| Data | TanStack Query | tự cache + tự refetch, hợp app nhiều người dùng chung |
| Form | React Hook Form + Zod | Zod backend đã dùng rồi → dùng chung schema |
| Excel | SheetJS (`xlsx`) | xuất file ngay ở trình duyệt, không đụng backend |
| Kéo thả | `@dnd-kit/core` | nhẹ, hỗ trợ cảm ứng (nhân viên dùng iPad) |

---

## 2. Hệ thống thiết kế

Mockup dùng **token Sabi Home** (`mockup/sabi-tokens.css`) — khác web cũ một chút:

| | Web cũ | Mockup mới |
|---|---|---|
| Nền | `#F1EEE3` | `#f4efe6` |
| Nhấn | `#7C6A4E` | `#6b4f2a` (đậm hơn, tương phản 6.6 — đọc rõ ngoài nắng) |
| Tiêu đề | Playfair Display (tải từ Google) | Georgia (có sẵn máy, không tốn request) |
| Nội dung | DM Sans | Be Vietnam Pro (đủ dấu tiếng Việt) |
| Icon | emoji 🏠💰📦 | sprite 36 icon Phosphor |

Đổi emoji sang icon là thay đổi dễ thấy nhất — emoji mỗi máy hiển thị một kiểu (Windows
khác iPhone khác Android), icon SVG thì ở đâu cũng như nhau và đổi màu theo chữ.

**Đã kiểm tra trên trình duyệt:** không tràn ngang ở 380px · dấu tiếng Việt (`Ồ ĐỀ Ự ẴNG ễ ộ`)
không bị cắt ở cỡ 28px · nền tối bật được · 36 icon nạp đủ · không lỗi console.

---

## 3. Bốn tính năng mới — cần sửa gì ở backend

### 3.1 Lịch timeline kéo-thả

Hàng = căn nhà, cột = ngày, thanh ngang = booking. Kéo ngang dời ngày, kéo mép đổi số đêm,
kéo dọc chuyển căn, bấm ô trống đặt nhanh.

**Backend cần thêm:**
```js
PATCH /v1/bookings/:id/move   // body: { homeId, checkIn, checkOut }
```
Phải kiểm tra trùng lịch trước khi lưu (`homeId` + khoảng ngày giao nhau) và chặn dời booking
đã `CHECKEDOUT`. `GET /v1/bookings/calendar` hiện có rồi, chỉ cần trả thêm `guests`, `phone`,
`deposit` để hiện tooltip mà không phải gọi thêm API.

**Lưu ý:** giá đã chốt lúc đặt nằm ở `Booking.totalAmount`. Dời sang ngày cuối tuần hoặc mùa
cao điểm thì **giá có tự tính lại không?** → mình đề xuất **không tự đổi**, chỉ hiện cảnh báo
"giá ngày mới cao hơn 100.000đ, có cập nhật không?" để bạn quyết.

### 3.2 CRM khách hàng

Hiện `Booking.guest` + `Booking.phone` là 2 chuỗi rời — cùng một khách đặt 6 lần là 6 bản ghi
không liên quan gì nhau.

**Backend cần thêm:**
```prisma
model Customer {
  id        Int      @id @default(autoincrement())
  name      String
  phone     String   @unique      // khoá gộp khách trùng
  idCard    String?               // CCCD
  notes     String?
  tag       CustomerTag @default(MOI)   // MOI | QUEN | VIP | HAN_CHE
  bookings  Booking[]
  createdAt DateTime @default(now())
}
```
+ `Booking.customerId Int?` với `onDelete: SetNull` (giống cách đã làm cho `Charge.templateId`
— xoá khách không được mất lịch sử booking).

**Di trú dữ liệu cũ:** viết script chạy 1 lần, gom `Booking` theo `phone`, tạo `Customer`,
gán ngược `customerId`. Script này **chỉ thêm, không xoá** — an toàn với dữ liệu thật trên Neon.

Tag VIP/quay lại nên **tính động** (đếm booking) chứ đừng lưu cứng, tránh lệch số.

### 3.3 Giá theo mùa & khuyến mãi

Hiện `Home.price` + `Home.weekendPrice` là hai số cứng, không diễn tả được "hè +20%" hay
"lễ 2/9 giá 900k".

**Backend cần thêm:**
```prisma
model RatePlan {
  id       Int      @id @default(autoincrement())
  homeId   Int?              // null = áp cho mọi căn
  name     String            // "Cao điểm hè", "Lễ 2/9"
  fromDate DateTime @db.Date
  toDate   DateTime @db.Date
  kind     RateKind          // PHAN_TRAM | CO_DINH
  value    Int               // +20 (%)  hoặc  900000 (đ)
  priority Int      @default(0)   // số lớn thắng khi nhiều luật chồng nhau
}

model PromoCode {
  id       Int      @id @default(autoincrement())
  code     String   @unique
  kind     RateKind
  value    Int
  minNights Int?    @default(0)
  expiresAt DateTime?
  active   Boolean  @default(true)
  usedCount Int     @default(0)
}
```
+ endpoint `GET /v1/rates/quote?homeId=&checkIn=&checkOut=&promo=` trả về giá từng đêm và tổng.
Web gọi endpoint này khi tạo booking, **không tự tính giá ở frontend** — nếu tính hai nơi thì
sớm muộn cũng lệch.

Booking cũ không ảnh hưởng: `totalAmount` đã lưu là giá đã chốt.

### 3.4 Xuất Excel / báo cáo

**Không cần sửa backend cho bản đầu.** Web đã có sẵn dữ liệu từ `/v1/stats/*`, `/v1/bookings`,
`/v1/inventory`, `/v1/expenses` — dùng SheetJS gộp lại thành 4 sheet rồi tải xuống.

Chỉ khi nào muốn *gửi báo cáo tự động qua email hàng tháng* thì mới cần
`GET /v1/reports/export` chạy ở server.

---

## 4. Thứ tự làm đề xuất

| Bước | Việc | Ước tính |
|---|---|---|
| 0 | Bạn duyệt mockup — chốt màu/bố cục | — |
| 1 | Dựng khung `web/`: Vite, Tailwind, token Sabi, router, auth (JWT localStorage), API client, layout sidebar+topbar | 1 buổi |
| 2 | Port 4 trang xương sống: Tổng quan · Booking · Nhận&Trả nhà · Lịch (bản tháng như cũ) | 2–3 buổi |
| 3 | Port nốt 6 trang: Thống kê, Thu chi, Kho, Phụ thu, Căn nhà, Tài khoản | 2–3 buổi |
| 4 | **Xuất Excel** (không đụng backend → làm được ngay, thấy kết quả liền) | 1 buổi |
| 5 | **Lịch timeline kéo-thả** + `PATCH /bookings/:id/move` | 2 buổi |
| 6 | **CRM khách hàng** + model `Customer` + script gộp khách cũ | 2 buổi |
| 7 | **Giá theo mùa & KM** + `RatePlan`/`PromoCode` + `/rates/quote` | 2–3 buổi |
| 8 | Đổi build Render, chạy song song, xoá `public/index.html` cũ | 1 buổi |

Làm **Excel trước** rồi mới tới timeline/CRM/giá là cố ý: nó không cần đổi database nên thấy
kết quả ngay, còn 3 cái kia đều phải `prisma db push` trên database thật.

---

## 5. Rủi ro cần biết trước

1. **Deploy Render** hiện chỉ chạy `prisma generate && prisma db push`. Thêm React thì build
   phải có `npm --prefix web ci && npm --prefix web run build`. Bản Free của Render build chậm,
   dự kiến lâu hơn ~2 phút.
2. **Chạy song song web cũ và mới.** Đề xuất: React build ra `public/app/`, giữ
   `public/index.html` cũ nguyên vẹn. Ai muốn thử bản mới vào `/app/`. Khi chạy ổn mới đổi chỗ.
   Như vậy nếu bản React lỗi, bạn vẫn có web cũ dùng được ngay — không gián đoạn kinh doanh.
3. **`prisma db push` với 3 model mới** đều là *thêm bảng mới* + *thêm cột nullable* → an toàn,
   không mất dữ liệu. Nhưng vẫn nên đổi schema vào lúc vắng khách.
4. **Mockup hiện thiên về màn hình lớn.** Nhân viên dùng điện thoại thì bước 1 phải làm luôn
   phần responsive (sidebar thành ngăn kéo), đừng để cuối mới sửa.
