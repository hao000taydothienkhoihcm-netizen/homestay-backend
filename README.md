# 🏡 HomeStay Manager — Backend

Node.js + Express + PostgreSQL + Prisma backend cho hệ thống quản lý homestay.

---

## 📋 Mục lục

1. [Cài đặt prerequisites](#1-cài-đặt-prerequisites)
2. [Cài backend](#2-cài-backend)
3. [Setup database](#3-setup-database)
4. [Chạy server](#4-chạy-server)
5. [Expose ra internet bằng Cloudflare Tunnel](#5-expose-ra-internet)
6. [Auto-start khi khởi động Windows](#6-auto-start-windows)
7. [API endpoints](#7-api-endpoints)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Cài đặt prerequisites

### a) Node.js 20+

Tải từ https://nodejs.org/ (chọn LTS).

Kiểm tra:
```cmd
node -v
npm -v
```

### b) PostgreSQL 16

1. Tải từ https://www.postgresql.org/download/windows/
2. Cài đặt:
   - **Nhớ password** của user `postgres` (sẽ dùng sau)
   - Port: `5432` (mặc định)
   - Locale: `Vietnamese, Vietnam` hoặc `default`
3. Sau khi cài, mở **pgAdmin 4** (đi kèm) để tạo database

**Tạo database `homestay`:**
1. Mở pgAdmin → đăng nhập với password đã đặt
2. Click chuột phải vào `Databases` → `Create` → `Database`
3. Đặt tên: `homestay` → Save

### c) Git (tùy chọn, để clone code)

Tải từ https://git-scm.com/download/win

---

## 2. Cài backend

Mở **Command Prompt** hoặc **PowerShell**, copy folder backend này về máy. Ví dụ:

```cmd
cd C:\projects
mkdir homestay
cd homestay
:: Copy folder homestay-backend vào đây
cd homestay-backend
```

Cài dependencies:

```cmd
npm install
```

---

## 3. Setup database

### a) Tạo file `.env`

Copy `.env.example` thành `.env`:

```cmd
copy .env.example .env
```

Mở `.env` bằng Notepad, sửa:

```env
DATABASE_URL="postgresql://postgres:MAT_KHAU_CUA_BAN@localhost:5432/homestay?schema=public"
JWT_SECRET="hommanagervn2025randomstring_change_me_to_something_long"
PORT=3000
NODE_ENV=development
CORS_ORIGIN="*"
```

> ⚠️ Đổi `MAT_KHAU_CUA_BAN` thành password PostgreSQL của bạn.

### b) Tạo bảng & seed data

```cmd
npm run db:push
npm run db:seed
```

Bạn sẽ thấy:
```
🌱 Bắt đầu seed database...
  ✓ Created 4 users
  ✓ Created 3 homes
  ✓ Created 6 bookings
  ✓ Created 4 expenses
  ✓ Created charge templates

✅ Seed hoàn tất!

Demo accounts:
  admin / admin123
  manager / manager123
  quanggia / qg123
```

### c) (Tùy chọn) Mở Prisma Studio để xem data

```cmd
npm run db:studio
```

Tự động mở trình duyệt tại http://localhost:5555 — giao diện xem/sửa data như Excel.

---

## 4. Chạy server

### Development (auto-reload khi code thay đổi):

```cmd
npm run dev
```

### Production:

```cmd
npm start
```

Bạn sẽ thấy:
```
🏡 HomeStay Backend chạy tại http://localhost:3000
   API base: http://localhost:3000/v1
   Health:   http://localhost:3000/
```

### Test:

Mở trình duyệt: http://localhost:3000

Hoặc test login bằng PowerShell:
```powershell
$body = @{ username = "admin"; password = "admin123" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/v1/auth/login" -Method Post -Body $body -ContentType "application/json"
```

---

## 5. Expose ra internet (Cloudflare Tunnel)

### a) Cài cloudflared

1. Tải từ https://github.com/cloudflare/cloudflared/releases/latest
2. File `cloudflared-windows-amd64.exe`
3. Đổi tên thành `cloudflared.exe`, copy vào `C:\Windows\System32\` (hoặc PATH bất kỳ)

Kiểm tra:
```cmd
cloudflared --version
```

### b) Chạy tunnel tạm thời (không cần đăng ký)

Mở Command Prompt mới (giữ backend đang chạy):

```cmd
cloudflared tunnel --url http://localhost:3000
```

Sau ~5 giây bạn sẽ thấy:
```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable): |
|  https://random-words-xyz.trycloudflare.com                                                 |
+--------------------------------------------------------------------------------------------+
```

→ **App điện thoại có thể dùng URL này để gọi API**. URL đổi mỗi lần restart tunnel.

### c) Tunnel có URL cố định (khuyến nghị)

1. Đăng ký Cloudflare miễn phí: https://dash.cloudflare.com/sign-up
2. Đăng nhập cloudflared:
   ```cmd
   cloudflared tunnel login
   ```
   Trình duyệt mở → đăng nhập → chọn domain (hoặc tạo subdomain miễn phí của Cloudflare)

3. Tạo tunnel:
   ```cmd
   cloudflared tunnel create homestay
   ```
   Note lại UUID hiện ra (vd: `abc-123-def`).

4. Tạo file config tại `C:\Users\YOUR_USER\.cloudflared\config.yml`:
   ```yaml
   tunnel: abc-123-def
   credentials-file: C:\Users\YOUR_USER\.cloudflared\abc-123-def.json
   ingress:
     - hostname: homestay.yourdomain.com
       service: http://localhost:3000
     - service: http_status:404
   ```

5. Trỏ DNS:
   ```cmd
   cloudflared tunnel route dns homestay homestay.yourdomain.com
   ```

6. Chạy tunnel:
   ```cmd
   cloudflared tunnel run homestay
   ```

→ Truy cập `https://homestay.yourdomain.com` từ bất cứ đâu.

---

## 6. Auto-start Windows

Để backend + tunnel tự chạy khi mở máy:

### Cách 1: Task Scheduler (dễ)

1. Mở **Task Scheduler** (Windows + R → `taskschd.msc`)
2. **Create Task...** → đặt tên `HomeStay Backend`
3. Tab **Triggers** → New → `At startup`
4. Tab **Actions** → New:
   - Program: `cmd.exe`
   - Arguments: `/c cd C:\projects\homestay\homestay-backend && npm start`
5. Tab **Settings** → ✓ `Allow task to be run on demand`

Làm tương tự cho `cloudflared tunnel run homestay`.

### Cách 2: Cài như Windows Service (chuyên nghiệp hơn)

```cmd
npm install -g pm2
pm2 start npm --name "homestay-backend" -- start
pm2 startup
pm2 save
```

Cho cloudflared:
```cmd
cloudflared service install
```

---

## 7. API endpoints

Base URL: `http://localhost:3000/v1` hoặc `https://homestay.yourdomain.com/v1`

### Auth
- `POST /auth/login` — `{ username, password }` → `{ token, user }`
- `GET  /auth/me` — yêu cầu Bearer token

### Bookings
- `GET    /bookings` — query: `?status=&homeId=&from=&to=&search=`
- `GET    /bookings/today` — nhận/trả hôm nay
- `GET    /bookings/calendar?year=&month=`
- `GET    /bookings/:id`
- `POST   /bookings` — body: `{ guest, phone, homeId, checkIn, checkOut, ... }`
- `PATCH  /bookings/:id`
- `DELETE /bookings/:id`
- `POST   /bookings/:id/checkin` — `{ actualTime, note }`
- `POST   /bookings/:id/checkout` — `{ actualTime, water, inspectionNote, charges: [{name, unit, qty}] }`

### Homes
- `GET    /homes`
- `GET    /homes/:id`
- `POST   /homes` (admin)
- `PATCH  /homes/:id` (admin)
- `DELETE /homes/:id` (admin)

### Expenses
- `GET    /expenses?from=&to=&category=&homeId=`
- `POST   /expenses` (manager+)
- `PATCH  /expenses/:id`
- `DELETE /expenses/:id`

### Users (admin)
- `GET    /users`
- `POST   /users`
- `PATCH  /users/:id`
- `DELETE /users/:id`

### Charge Templates (RULES + QUICK)
- `GET    /charge-templates?type=RULE|QUICK`
- `POST   /charge-templates` (manager+)
- `PATCH  /charge-templates/:id`
- `DELETE /charge-templates/:id`

### Statistics
- `GET    /stats/dashboard`
- `GET    /stats/monthly?months=6`
- `GET    /stats/by-home`
- `GET    /stats/finance?month=&year=`

**Mọi endpoint (trừ `/auth/login`) cần header:**
```
Authorization: Bearer <JWT_TOKEN>
```

---

## 8. Troubleshooting

### ❌ `Can't reach database server at localhost:5432`
- PostgreSQL chưa chạy. Mở **Services** (Windows + R → `services.msc`) → tìm `postgresql-x64-16` → Start.

### ❌ `Error: P1000 — Authentication failed`
- Sai password trong `DATABASE_URL`. Kiểm tra lại `.env`.

### ❌ `Error: P3009` khi `db:push`
- Database `homestay` chưa tồn tại. Quay lại Section 1.b để tạo.

### ❌ Port 3000 đã được dùng
- Đổi `PORT=3001` trong `.env`, hoặc kill process đang dùng port 3000.

### ❌ Cloudflare tunnel chậm hoặc lỗi
- Kiểm tra firewall Windows có chặn `cloudflared.exe` không.
- Tunnel mất ~5-30 giây để propagate sau khi start.

### ❌ Frontend không gọi được API (CORS)
- Trong `.env` đặt `CORS_ORIGIN="*"` cho dev.
- Production: đặt `CORS_ORIGIN="https://your-frontend-domain.com"`.

---

## 📂 Cấu trúc thư mục

```
homestay-backend/
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── seed.js             # Sample data
├── src/
│   ├── server.js           # Entry point
│   ├── prisma.js           # Prisma client
│   ├── middleware/
│   │   └── auth.js         # JWT verify + role check
│   ├── routes/
│   │   ├── auth.js
│   │   ├── bookings.js
│   │   ├── homes.js
│   │   ├── expenses.js
│   │   ├── users.js
│   │   ├── chargeTemplates.js
│   │   └── stats.js
│   └── services/
│       └── bookingService.js  # Conflict check, helpers
├── .env                    # Config (KHÔNG commit Git)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 💡 Lệnh hữu ích

```cmd
npm run dev          # Dev mode auto-reload
npm start            # Production mode
npm run db:push      # Cập nhật schema lên DB
npm run db:seed      # Seed sample data
npm run db:reset     # Reset DB + seed lại
npm run db:studio    # Mở Prisma Studio (GUI cho DB)
```

---

## 🚀 Bước tiếp theo

Sau khi backend chạy OK:
1. **Frontend web**: Update file `homestay-manager.html` để gọi API thay vì dùng sample data
2. **Mobile app**: Build React Native app theo mockup đã thiết kế
3. **Deploy**: Khi cần, đổi `DATABASE_URL` sang Postgres cloud (Railway, Supabase, Neon...)

Chúc bạn thành công! 🏡
