# 🎨 Setup VS Code cho HomeStay Manager

Toàn bộ project (backend + frontend + mobile sau này) làm trong VS Code.

---

## 1. Cài VS Code

Tải tại: https://code.visualstudio.com/ → cài bản Windows 64-bit.

---

## 2. Extensions cần thiết

Mở VS Code → bấm `Ctrl+Shift+X` (Extensions) → cài các extension sau:

### ⭐ Bắt buộc

| Extension | Tác dụng |
|-----------|----------|
| **Prisma** (Prisma) | Highlight syntax cho `schema.prisma`, auto-format, hover info |
| **ESLint** (Microsoft) | Báo lỗi cú pháp JS realtime |
| **Prettier - Code formatter** | Tự động format code đẹp khi save |
| **DotENV** (mikestead) | Highlight cho file `.env` |
| **Thunder Client** (Ranga Vadhineni) | Test API ngay trong VS Code (thay Postman) |

### 💎 Khuyến nghị thêm

| Extension | Tác dụng |
|-----------|----------|
| **GitLens** | Xem lịch sử git từng dòng code |
| **Error Lens** | Hiện lỗi ngay trên dòng code |
| **Auto Rename Tag** | Đổi tag HTML đầu là tag cuối tự đổi theo |
| **Path Intellisense** | Auto-complete đường dẫn file |
| **Material Icon Theme** | Icon đẹp cho file/folder |
| **PostgreSQL** (Chris Kolkman) | Xem/query Postgres ngay trong VS Code |
| **Live Server** (Ritwick Dey) | Chạy file HTML với auto-reload |

### Cách cài nhanh tất cả:

Mở **Terminal trong VS Code** (`Ctrl+\``), paste:

```cmd
code --install-extension Prisma.prisma
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension mikestead.dotenv
code --install-extension rangav.vscode-thunder-client
code --install-extension eamodio.gitlens
code --install-extension usernamehw.errorlens
code --install-extension formulahendry.auto-rename-tag
code --install-extension christian-kohler.path-intellisense
code --install-extension PKief.material-icon-theme
code --install-extension ckolkman.vscode-postgres
code --install-extension ritwickdey.LiveServer
```

---

## 3. Mở project

### Cách 1: Mở folder

1. Giải nén `homestay-backend.zip` ra `C:\projects\homestay\`
2. Mở VS Code → **File → Open Folder** → chọn `C:\projects\homestay\homestay-backend`

### Cách 2: Workspace nhiều folder (khuyến nghị)

Tạo folder cha chứa cả backend + frontend + mobile:

```
C:\projects\homestay\
├── homestay-backend\        ← Backend
├── homestay-web\            ← Frontend (sau này tạo)
└── homestay-mobile\         ← Mobile app (sau này tạo)
```

Mở VS Code → **File → Add Folder to Workspace** → thêm cả 3 folder → Lưu workspace.

---

## 4. Setup integrated terminal

VS Code có **Terminal tích hợp** — không cần mở Command Prompt riêng.

- Mở: `Ctrl+\`` (backtick)
- Hoặc: **Terminal → New Terminal**
- Tabs nhiều terminal: bấm `+` ở góc phải

**Khuyến nghị:** đổi default shell thành **Git Bash** (nếu cài Git) cho cmd Unix-like hoặc giữ **PowerShell**.

Setup: `Ctrl+Shift+P` → gõ `Terminal: Select Default Profile` → chọn shell ưa thích.

---

## 5. Workflow trong VS Code

### Terminal split để chạy nhiều thứ song song

Bạn sẽ cần 3 terminal cùng lúc:

| Terminal | Lệnh |
|----------|------|
| **1** | `npm run dev` — backend |
| **2** | `npm run db:studio` — Prisma Studio xem data |
| **3** | `cloudflared tunnel --url http://localhost:3000` — Cloudflare Tunnel |

**Cách split:** Trong terminal, bấm icon **split** (góc phải) hoặc `Ctrl+Shift+5`.

### Snippet hay

VS Code có **Command Palette** (`Ctrl+Shift+P`) — gõ tên lệnh để thực hiện nhanh:
- `Prisma: Format` — format file schema
- `ESLint: Fix all auto-fixable problems` — sửa lỗi linting
- `Format Document` (`Shift+Alt+F`) — format file

---

## 6. Test API với Thunder Client (trong VS Code)

Thay vì dùng Postman, **Thunder Client** chạy ngay trong VS Code.

1. Bấm icon Thunder bên sidebar trái
2. **New Request** → chọn `POST`
3. URL: `http://localhost:3000/v1/auth/login`
4. Tab **Body** → JSON:
   ```json
   {
     "username": "admin",
     "password": "admin123"
   }
   ```
5. Send → copy `token` từ response

**Lưu token cho request sau:**
- Click vào response → Right click trên `token` → `Set Env Variable` → tên `TOKEN`
- Request tiếp theo: tab **Auth** → **Bearer** → `{{TOKEN}}`

### Collection sẵn — Import vào Thunder Client

Tôi tạo file `thunder-collection.json` (có sẵn trong zip) — import vào để có tất cả endpoints test sẵn:

1. Thunder Client → **Collections** tab
2. Click `...` → **Import** → chọn file

---

## 7. Debug Node.js trong VS Code

Đặt breakpoint, debug step-by-step:

1. Mở `src/server.js`
2. Click bên trái số dòng để đặt **breakpoint** (chấm đỏ)
3. `F5` để start debug → chọn `Node.js`
4. Khi request gọi đến → tự dừng tại breakpoint
5. Hover lên biến để xem giá trị, dùng **Watch panel** để theo dõi

Tạo file `.vscode/launch.json` (đã có sẵn trong setup) để cấu hình debug.

---

## 8. Settings.json đề xuất

Tạo file `.vscode/settings.json` trong workspace:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.tabSize": 2,
  "editor.bracketPairColorization.enabled": true,
  "files.autoSave": "onFocusChange",
  "files.exclude": {
    "node_modules": true,
    ".env": false
  },
  "prisma.format": true,
  "[prisma]": {
    "editor.defaultFormatter": "Prisma.prisma"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "terminal.integrated.defaultProfile.windows": "PowerShell",
  "workbench.iconTheme": "material-icon-theme"
}
```

---

## 9. Git trong VS Code

VS Code có Git tích hợp:

- Tab **Source Control** (icon nhánh cây bên trái) — xem thay đổi
- Stage file: click `+`
- Commit: gõ message + `Ctrl+Enter`
- Push: bấm icon đám mây phía dưới

**Khởi tạo Git repo:**

```cmd
git init
git add .
git commit -m "Initial backend setup"
```

---

## 10. Tips & shortcuts hay dùng

| Shortcut | Tác dụng |
|----------|----------|
| `Ctrl+P` | Mở file nhanh theo tên |
| `Ctrl+Shift+P` | Command Palette (mọi chức năng) |
| `Ctrl+\`` | Toggle terminal |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+/` | Comment dòng |
| `Alt+↑/↓` | Di chuyển dòng lên xuống |
| `Shift+Alt+↑/↓` | Copy dòng lên xuống |
| `Ctrl+D` | Select cùng từ tiếp theo (multi-cursor) |
| `Ctrl+Shift+F` | Tìm trong toàn project |
| `F2` | Rename (đổi tên biến/hàm khắp nơi) |
| `Shift+Alt+F` | Format file |
| `Ctrl+K Ctrl+0` | Fold tất cả code blocks |
| `Ctrl+K Ctrl+J` | Unfold tất cả |

---

## 11. Mobile app (sau này)

Khi làm React Native:

- VS Code có **React Native Tools** extension
- Debug ngay trên simulator/máy thật trong VS Code
- Hot reload tự động

---

## 🎯 Quy trình hằng ngày

1. Mở VS Code → workspace project
2. `Ctrl+\`` mở terminal → `npm run dev`
3. Sửa code → save (auto format)
4. Test API bằng Thunder Client
5. Commit code bằng Source Control tab
6. Repeat

---

## ✅ Tóm lại

**Hoàn toàn có thể làm cả project trong VS Code:**
- Edit code (backend, frontend, mobile)
- Chạy terminal (npm, cloudflared)
- Test API (Thunder Client)
- Xem database (Prisma Studio mở browser, nhưng quản lý từ terminal VS Code)
- Debug Node.js
- Git
- Mở nhiều folder cùng workspace

→ **Không cần phần mềm khác** ngoài VS Code + Node.js + PostgreSQL.

Chúc bạn làm việc thuận tay! 🚀
