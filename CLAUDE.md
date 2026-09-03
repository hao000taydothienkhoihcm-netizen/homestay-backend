# HOMESTAY MANAGER — Ghi chú dự án (đọc trước khi làm tiếp)

> File này để Claude (và người dùng) đọc là nắm lại toàn bộ dự án khi mở ở máy khác.
> Chủ dự án: **Haotran House** — quản lý homestay/cho thuê tại Việt Nam. Trả lời bằng **tiếng Việt**, ngắn gọn. Tiền tệ luôn là **VNĐ**.

---

## 1. Dự án là gì

Phần mềm quản lý homestay cho thuê theo đêm: đặt phòng, nhận/trả nhà, thu chi, phụ thu & phạt, quản lý kho (đồ tiêu thụ trong phòng), thống kê doanh thu/lợi nhuận. Gồm 3 phần dùng chung 1 database:

- **Backend API** — Node/Express (ES modules) + Prisma + PostgreSQL. Đây là repo này.
- **Web quản lý** — ĐANG CHUYỂN sang **React** (repo riêng `sabihome`, ở `D:\projects\sabihome`,
  xem `sabihome/CLAUDE.md`). Bản React chạy ở `/`; **bản cũ 1 file vẫn giữ ở `/cu`** làm dự phòng.
  `public/index.html` bây giờ là **file BUILD của React** — KHÔNG sửa tay (xem mục 6).
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
│  ├─ server.js              # Khởi động Express + SPA fallback cho React (mọi path ≠ /v1,/health → index.html)
│  ├─ prisma.js              # Prisma client
│  ├─ middleware/            # Auth JWT, phân quyền (JWT mang role + hostId)
│  ├─ services/bookingService.js
│  └─ routes/
│     ├─ auth.js             # Đăng nhập
│     ├─ homes.js            # CRUD căn nhà
│     ├─ bookings.js         # Đặt phòng, nhận/trả nhà, phụ thu
│     ├─ chargeTemplates.js  # Mẫu phụ thu & phạt + cấu hình kho
│     ├─ inventory.js        # Nhập kho + báo cáo tồn kho tháng
│     ├─ expenses.js         # Thu chi vận hành
│     ├─ stats.js            # Thống kê doanh thu/chi phí
│     ├─ users.js            # CRUD tài khoản
│     └─ sheet.js            # Nhập lịch từ Google Sheet: POST /v1/sheet/preview (bóc màu ô → trạng thái)
├─ public/                   # Web tĩnh do backend phục vụ:
│  ├─ index.html + assets/   #   ← BUILD React (từ repo sabihome). KHÔNG sửa tay.
│  ├─ cu/index.html          #   ← bản web CŨ 1 file, giữ ở /cu làm dự phòng
│  └─ _old-backup/           #   ← file rác cũ, bỏ qua
└─ render.yaml               # Cấu hình Render
```

---

## 5. Mô hình dữ liệu (Prisma) — điểm cần nhớ

- **User**: role `ADMIN` / `MANAGER` / `STAFF`. Nhân viên (STAFF) bị ẩn Thống kê + Thu/Chi.
- **Home** (căn nhà): `price` = giá ngày thường (T2–T5), `weekendPrice` = giá cuối tuần (T6,T7,CN), `holidayPrice` = giá lễ. Đây là giá **mặc định**, dùng khi tháng đó chưa có bảng giá riêng.
- **HomeMonthlyPrice**: bảng giá theo **từng tháng của từng năm** cho mỗi căn (`price` / `weekendPrice` / `holidayPrice`, đều nullable). Ô trống → lùi về giá mặc định của căn.
- **HomeDatePrice**: giá ghi đè cho **một đêm** cụ thể. Ưu tiên cao nhất, thắng cả giá lễ.

### ⚠️ GIÁ CHỈ ĐƯỢC TÍNH Ở BACKEND
Thứ tự tra giá mỗi đêm (`services/bookingService.js` → `stayTotal`):
**1.** ghi đè từng đêm → **2.** giá lễ của tháng → giá lễ của căn → **3.** giá cuối tuần của tháng → của căn → **4.** giá thường của tháng → của căn.

Trước đây công thức được chép ở 3 nơi (backend, web, mobile) và bắt "phải khớp nhau" — chính đó là nguồn sai số. **Nay bỏ quy tắc đó.** Web và mobile KHÔNG tự tính giá nữa mà gọi:
```
GET /v1/homes/:id/price-preview?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
→ { total, nights, detail: [{ date, weekday, kind, price }] }
   kind = thuong | cuoi-tuan | le | ghi-de
```
Hàm `stayTotal` còn sót ở web (`BookingScreen.tsx`) và mobile (`utils/index.js`) chỉ để hiện tạm trong lúc chờ mạng — đã ghi chú cảnh báo trong code. `sabihome/src/lib/pricing.ts` đã bỏ hoang, đừng dùng lại.

API bảng giá: `GET|PUT /v1/homes/:id/prices` (theo tháng, kèm `?year=`), `POST /v1/homes/:id/prices/copy-year`, `GET|PUT /v1/homes/:id/date-prices`.
- **Booking**: 2 mức giá theo đêm, có `discount` (giảm giá), `deposit` (cọc), `paidAtCheckIn`. Trạng thái: `CONFIRMED → CHECKEDIN → CHECKOUT_TODAY → CHECKEDOUT`.
- **Charge** (phụ thu từng booking): có `phase` = `CHECKIN` (thu lúc nhận nhà) hoặc `CHECKOUT` (thu lúc trả nhà). Doanh thu phụ thu nhận nhà tính ngay khi CHECKEDIN; phụ thu trả nhà tính khi CHECKEDOUT.
- **ChargeTemplate** (mẫu phụ thu/phạt): `type` = `RULE` (phạt, không số lượng) hoặc `QUICK` (đồ tiêu thụ, có số lượng). Nếu `trackStock=true` thì theo dõi kho: `packSize`, `packLabel`, `unitLabel`, `lowStock`, `costPrice` (giá vốn để tính lợi nhuận).
- **StockEntry**: nhập kho / điều chỉnh tồn theo từng căn (`IMPORT` / `ADJUST`).
- **Expense**: chi phí vận hành theo ngày/căn/danh mục.

### ⚠️ MULTI-TENANT: THAO TÁC THEO ID PHẢI KIỂM CHỦ SỞ HỮU
Mỗi bảng đều có cột `hostId`. `hostWhere(req)` lo phần **đọc danh sách** — nhưng thao tác
**theo id** thì Prisma bắt buộc dùng khoá duy nhất (`where: { id }`), nên không nhét `hostId`
vào được. Đó từng là lỗ hổng: host B gõ đại id là sửa/xoá được bản ghi của host A.

Bốn helper trong `middleware/auth.js` — **bắt buộc dùng, đừng viết `where: { id }` trần**:

| Dùng thay cho | Helper | Trả về |
|---|---|---|
| `findUnique({ where: { id } })` | `findOwn(model, req, id, opts?)` | bản ghi, hoặc `null` |
| `update({ where: { id } })` | `updateOwn(model, req, id, data)` | số dòng đã sửa (`0` = từ chối) |
| `delete({ where: { id } })` | `deleteOwn(model, req, id)` | số dòng đã xoá (`0` = từ chối) |
| id nhận **từ body** (VD `homeId`) | `ownsRecord(model, req, id)` | `true` / `false` |

Cả bốn đều đi qua `hostWhere()` nên **ADMIN không bị lọc** (super-role thấy mọi host).
Không tìm thấy và không phải của mình đều trả **404 giống hệt nhau** (`notFound(res, '...')`) —
cố tình không phân biệt, để không lộ ra là id đó có tồn tại.

Ba quy tắc kèm theo:
1. **Kiểm quyền sở hữu TRƯỚC khi trả lỗi có kèm dữ liệu.** VD `POST /bookings` phải xác nhận
   căn nhà là của mình rồi mới kiểm trùng lịch — vì lỗi 409 trùng lịch có kèm **tên khách và tiền cọc**.
2. **Handler đọc `existing` bằng `findOwn` ngay đầu thì cả handler được bảo vệ theo** —
   `update({ where: { id } })` phía sau đã an toàn vì id đã được chứng minh là của mình.
3. **Chỉ ADMIN được cấp vai trò ADMIN** (`canAssignRole` trong `users.js`). Thiếu chốt này thì
   ngày HOST được vào trang tài khoản, họ tự nâng mình lên super-role là thấy toàn bộ 100 host.

Kiểm lại bất cứ lúc nào (script **chỉ đọc**, không ghi gì vào DB thật):
```
node scripts/kiem-tra-cach-ly.mjs        # đếm theo hostWhere, mô phỏng xoá/sửa của host lạ
$env:SMOKE_PASS='...'; powershell -File scripts/smoke-http.ps1   # 40 test qua HTTP
```

### Bản sửa gần nhất — "Mức 2: liên kết phụ thu–kho bằng templateId"
Vấn đề: khi xoá 1 mẫu phụ thu (đồ trong kho), báo cáo kho bị mất phần đã bán của mặt hàng đó (vì trước đây khớp theo **tên**).
Cách sửa: thêm khoá ngoại **`Charge.templateId → ChargeTemplate.id`** với `onDelete: SetNull`.
- Xoá mẫu → chỉ gỡ liên kết (set null), **không** xoá lịch sử phụ thu.
- Báo cáo kho khớp theo **ID** trước, rồi mới tới tên → mặt hàng đã "ngừng bán" nhưng còn lịch sử bán/nhập vẫn hiện (VD 16 "ly mỳ ly" bán trong tháng 7), có nhãn đỏ **"ngừng bán"** trên web.
File liên quan: `prisma/schema.prisma` (model Charge), `src/routes/bookings.js` (gán templateId khi tạo/sửa/checkout), `src/routes/inventory.js` (báo cáo gồm mặt hàng ngừng-bán-còn-lịch-sử), `public/index.html` (nhãn "ngừng bán"). Đã commit & deploy xong.

### Đang làm dở (tính tới 16/08/2026)
- **Chuyển web sang React** (repo `sabihome`): 13 màn đã xong, chạy song song `/` (React) + `/cu` (cũ),
  đã push + deploy. Việc tiếp: ổn định React, đối chiếu từng màn với `/cu`. Chi tiết ở `sabihome/CLAUDE.md`.
- **Nhập lịch Google Sheet (#152, BẮT BUỘC):** backend `POST /v1/sheet/preview` ĐÃ XONG (host dán link
  Sheet công khai → bóc màu ô → trả legend + lịch, chỉ lấy ngày từ hôm nay). Còn thiếu **UI React**.
  Đang chờ chủ nhà đưa **link Sheet thật** để map màu.
- **Lộ trình marketplace multi-tenant** (đọc skill `homestay-manager-full`): đã bắt đầu ở backend —
  thêm `hostId` (commit c004137) + tài khoản Sales/Host/Admin, duyệt PENDING→ACTIVE (commit 46dc5fb).
  JWT đã mang `role` + `hostId`. Các bước sau: chợ host đăng căn → giữ chỗ → duyệt → chốt booking.

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

**Web (React) — dùng MỘT LỆNH, đừng làm tay:**
```bash
cd /d/projects/homestay-backend
npm run deploy:web        # build sabihome + chép vào public/ + ghi build-info.json
git add public && git commit -m "..." && git push
```
Rồi Render → Manual Deploy. Xong mở `https://<domain>/build-info.json` để đối chiếu:
`web_commit_ngan` phải khớp commit hiện tại của `sabihome`.

⚠️ **Render deploy từ repo NÀY, không phải từ `sabihome`.** Push `sabihome` không làm
Render đổi gì. Bước chép `dist/` → `public/` từng bị quên (01/09/2026): deploy "thành công"
nhưng web vẫn chạy bản cũ, không có lỗi nào báo. Script `deploy:web` sinh ra để bịt đúng
chỗ đó, và `build-info.json` để luôn trả lời được "web thật đang chạy code nào".

KHÔNG sửa trực tiếp `public/index.html` (là file build, sẽ bị đè).
Bản cũ ở `public/cu/index.html` — phao dự phòng, script không đụng tới. Đừng gitignore
cả thư mục `public/`, sẽ mất phao này.

---

## 6b. Việc phải làm khi bước vào GĐ3 (marketplace)

Hai món nợ kiến trúc dưới đây **làm cùng lúc, ngay đầu GĐ3**, trước khi thêm bảng
`Customer` / `RatePlan` / `Listing`. Làm sau sẽ đắt hơn nhiều.

**1. Gộp `sabihome` thành thư mục `web/` trong repo này (monorepo).**
Đây vốn là kiến trúc đã vạch trong `mockup/KE-HOACH-REACT.md`, lúc làm bị tách ra.
Lợi: hết bước chép, không còn file build trong git, một commit sửa được cả API lẫn web,
rollback một phát về cả hai. Cần khi mỗi tính năng marketplace đều đụng cả hai bên.

Năm chỗ dễ vỡ, đã rà 01/09/2026:
- `render.yaml` đang đặt `NODE_ENV=production` → `npm install` **bỏ qua devDependencies**,
  mà `vite`/`typescript` của web nằm đúng ở đó → build Render sẽ hỏng. Phải dùng
  `npm ci --include=dev` cho bước build web. (Lỗi này đã từng xảy ra trên máy local.)
- **Đừng gitignore cả `public/`** — sẽ mất `public/cu` (283 KB, phao dự phòng) và
  `public/_old-backup`. Chỉ ignore `public/index.html` + `public/assets/`.
- Chép tay thì mất lịch sử git của web → dùng `git subtree` để giữ.
- Repo `sabihome` cũ phải archive trên GitHub, kèm README trỏ sang chỗ mới, không thì
  có ngày commit nhầm vào đó.
- Build lâu thêm ~2 phút. Chấp nhận được.
- Đường lùi: giữ nguyên `sabihome`, không xoá gì cho tới khi Render build xanh.
- App mobile **không** import code từ `sabihome` (đã kiểm) → gộp repo không ảnh hưởng.

**2. Bỏ `prisma db push`, chuyển sang `prisma migrate deploy`.**
`render.yaml` đang chạy `db push` mỗi lần deploy → không có lịch sử, không quay lui được,
không biết lần nào đổi gì. Chịu được khi schema nhỏ và chỉ có một môi trường; hỏng khi
GĐ3 thêm 3 bảng mới và cần rollback.
(`seed-prod.js` chạy kèm thì AN TOÀN — thấy có user là bỏ qua ngay, không xoá gì.)

---

## 7. ⚠️ Cấm làm (vì DB dùng chung dữ liệu thật)

KHÔNG chạy các lệnh sau trên bất kỳ máy nào — chúng **xoá sạch dữ liệu thật** trên Neon:
- `npm run db:reset` / `npm run db:clean`
- `npx prisma db push --force-reset`
- `npx prisma migrate reset`
- `node prisma/seed.js` (seed đè dữ liệu)

An toàn: `npm start`, `npm run dev`, `npx prisma studio` (chỉ xem), `npx prisma generate`.
Đổi schema thật thì dùng `npx prisma db push` (không có `--force-reset`) — thêm cột nullable là an toàn.

## 8. Sao lưu dữ liệu

Neon Free chỉ giữ lịch sử khôi phục **6 tiếng**. Phát hiện mất dữ liệu sau một ngày
là hết đường lùi. Đây là bản sao duy nhất của toàn bộ booking / thu chi / kho của các host.

Máy này **không có `pg_dump`**, và bắt cài PostgreSQL chỉ để sao lưu thì lần sau đổi
máy lại vướng. Nên sao lưu bằng Node — chỗ nào chạy được app là chạy được nó.

```
node scripts/sao-luu.mjs
```

- Ghi ra `../_sao-luu/sabi-YYYYMMDD-HHMM.json.gz` (ngoài repo, đã gitignore).
- Giữ 30 bản gần nhất, tự dọn bản cũ. Đổi bằng `BACKUP_KEEP`.

### Lưu ra NGOÀI máy này — đã bật

Lưu một chỗ ngay trên máy đang chạy là **chưa phải backup**: máy hỏng, mất máy, hay
đổi máy là mất luôn cả dữ liệu lẫn bản sao lưu.

Script **tự dò thư mục Google Drive**, thấy thì lưu thêm một bản vào đó. Cố ý không
ghi cứng `G:\My Drive`: chữ cái ổ của Drive for desktop không cố định (tuỳ máy đã
dùng tới ổ nào), và nếu cài kiểu "thư mục" thì nó lại nằm trong hồ sơ người dùng.
Dò cả ổ D:–Z: (`My Drive` / `Drive của tôi`) lẫn `%USERPROFILE%\Google Drive`.

Máy hiện tại (03/09/2026): Drive for desktop đã cài, gắn ở **ổ G:**, nên mỗi lần
sao lưu ra **2 bản**:

    E:\project\homestay\_sao-luu\                      (khôi phục nhanh)
    G:\My Drive\SabiHome - Sao luu du lieu\             (Drive tự đồng bộ lên mây)

Đổi máy thì chỉ cần cài Drive, đăng nhập `haotran12380@gmail.com`, thư mục đó hiện
ra là có lại đủ bản sao lưu.

Muốn chỉ định tay (VD thêm ổ cứng ngoài) thì đặt `BACKUP_DIR`, nhiều chỗ ngăn bằng
dấu chấm phẩy — lúc đó script dùng đúng danh sách đó, không tự dò nữa:

    set BACKUP_DIR=E:\project\homestay\_sao-luu;D:\o-cung-ngoai\sao-luu

Script đọc lại kiểm chứng **riêng từng chỗ** và báo riêng chỗ nào hỏng — chạy tự
động hằng đêm mà im lặng bỏ qua một chỗ thì vài tháng sau mới phát hiện chỗ đó rỗng.
- Ghi xong **tự đọc lại kiểm chứng** — bản sao lưu hỏng mà tưởng là có mới là tình huống tệ nhất.
- Chỉ sao lưu DỮ LIỆU. Cấu trúc bảng nằm ở `prisma/schema.prisma`, đã có trong git.

**Hẹn giờ chạy hằng đêm** (Windows, chạy PowerShell dưới quyền admin một lần):

```powershell
$hd = "E:\project\homestay\homestay-backend"
schtasks /create /tn "SabiHome sao luu" /tr "cmd /c cd /d $hd && node scripts\sao-luu.mjs" /sc daily /st 02:00 /f
```

Máy phải bật lúc 2 giờ sáng. Nếu hay tắt máy thì đổi `/sc daily /st 02:00` thành
`/sc onlogon` để chạy mỗi lần đăng nhập.

### Khôi phục

```
node scripts/phuc-hoi.mjs ..\_sao-luu\<file>.json.gz              # xem trước, KHÔNG ghi
node scripts/phuc-hoi.mjs ..\_sao-luu\<file>.json.gz --ghi-that   # ghi đè thật
```

`--ghi-that` **xoá sạch mọi bảng rồi chèn lại từ file**. Dữ liệu phát sinh sau thời điểm
sao lưu sẽ mất. Luôn chạy `sao-luu.mjs` trước khi khôi phục — lỡ chọn nhầm file còn quay lại được.

### Đường khôi phục ĐÃ diễn tập thật (03/09/2026)

Một bản sao lưu chưa từng khôi phục thử thì chưa gọi là bản sao lưu. Đã diễn tập
đủ kịch bản trên **nhánh nháp** của Neon (nhánh chính không đụng tới):

    xoá sạch 51 booking + 88 charge   -> mất thật, còn 0
    chạy phuc-hoi.mjs --ghi-that      -> 274/274 dòng
    đối chiếu dấu vân tay             -> 18/18 khớp

Không chỉ đếm số dòng — đối chiếu cả **tổng tiền phòng 534.000.000đ**, **tổng tiền
cọc 194.600.000đ**, và **từng trường của 5 booking** (tên khách, SĐT, ngày nhận/trả,
tiền, trạng thái). Kèm một phép nữa: sau khi khôi phục, tạo bản ghi mới có bị đụng
id cũ không — Postgres không tự đẩy bộ đếm id lên theo dữ liệu chèn tay, không sửa
thì host tạo booking đầu tiên sau khôi phục là gãy ngay. `phuc-hoi.mjs` có bước
`setval`, đã kiểm: Host mới lấy id 4 (max cũ 3), Home mới lấy id 10 (max cũ 9).

Muốn diễn tập lại (nên làm sau mỗi lần đổi schema):

1. Neon Console → project → **Branches** → **New Branch**, đặt tên `thu-phuc-hoi`,
   Auto-delete **After 1 day**, kiểu **Branch data and schema**.
2. **Connect** → chọn nhánh vừa tạo → copy chuỗi kết nối.
3. Chạy:

       set TEST_DB_URL=<chuỗi của nhánh nháp>
       node scripts/thu-kich-ban-mat-du-lieu.mjs truoc

       set DATABASE_URL=<chuỗi của nhánh nháp>
       node scripts/phuc-hoi.mjs ..\_sao-luu\<file>.json.gz --ghi-that

       set DATABASE_URL=            (trả lại, để khỏi lỡ tay chạy tiếp trên nhánh nháp)
       node scripts/thu-kich-ban-mat-du-lieu.mjs sau
       node scripts/thu-bo-dem-id.mjs

Cả hai script thử đều **tự từ chối chạy** nếu `TEST_DB_URL` trùng endpoint với
`DATABASE_URL` thật — đã thử cố tình đưa URL thật vào, nó dừng đúng.
`phuc-hoi.mjs` cũng in **ĐANG NHẮM VÀO: \<host\>** trước khi làm gì: khôi phục nhầm
vào nhánh chính trong khi tưởng đang thử trên nhánh nháp là hỏng không cứu được.

## 9. Lỗi trong route không còn giết được app

Express 4 **không bắt lỗi trong hàm async**. Trước đây 46/55 route async không có
try/catch, nên chỉ cần Neon chớp một nhịp là lời hứa bị từ chối mà không ai bắt →
Node giết luôn tiến trình → Render Free chỉ có một instance nên cả app sập.

`src/lib/router-an-toan.js` bọc ở tầng Router: mọi file route dùng `routerAnToan()`
thay cho `Router()`, từ đó handler async ném lỗi là tự chuyển sang `next(err)` →
rơi vào error handler ở `server.js`.

**Viết route mới thì cứ viết async bình thường, không cần try/catch.** Nhưng nhớ
file route mới phải dùng `routerAnToan()`; chạy `node scripts/doi-router.mjs` là nó
tự đổi giúp.

`server.js` còn bắt `unhandledRejection` / `uncaughtException` và **cố ý không tắt máy** —
app chỉ có một instance, sai một request còn hơn sập cả app.

Kiểm chứng: `node scripts/thu-boc-loi.mjs` (12 phép, không đụng database).
