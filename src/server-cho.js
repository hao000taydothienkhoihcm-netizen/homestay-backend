// ═══════════════════════════════════════════════════════════════════
// SABI — CHỢ CĂN (service riêng)
//
// VÌ SAO CÓ FILE NÀY
// App nội bộ đang giữ dữ liệu thật: booking, tiền, kho của 100 host. Chợ thì đổi
// mỗi ngày và mở cho người ngoài (sales). Trước đây hai thứ chạy chung MỘT tiến
// trình trên Render Free — nghĩa là: deploy chợ là khởi động lại app nội bộ, và
// một bug ở chợ làm sập luôn app nội bộ.
//
// File này là điểm khởi động THỨ HAI của cùng repo. Render chạy nó thành một
// service riêng: deploy riêng, sập riêng, log riêng.
//
// BA HÀNG RÀO (từ ngoài vào trong)
//   1. Tiến trình riêng   — chợ chết không kéo app nội bộ chết theo.
//   2. Chỉ mount route chợ — không có bookings/expenses/inventory/users/hosts ở đây.
//   3. Tài khoản DB chỉ-đọc — DATABASE_URL_CHO trỏ tới role Neon chỉ có SELECT.
//      Hàng rào này mới là hàng rào thật: hai cái trên là code, cái này là quyền.
//
// Giai đoạn 1 chợ CHỈ ĐỌC. Khi nào làm giữ chỗ / báo cọc (giai đoạn 2-3) thì mới
// cần quyền ghi, và chỉ cấp trên đúng mấy bảng của chợ — không bao giờ trên Booking.
// ═══════════════════════════════════════════════════════════════════
import 'dotenv/config';

// KHỞI ĐỘNG BẰNG `node src/cho.js`, KHÔNG chạy thẳng file này.
// Lý do: import trong ESM được nâng lên chạy TRƯỚC mọi câu lệnh, nên đặt
// process.env.SABI_SERVICE ở đây là quá muộn — prisma.js đã tạo client bằng chuỗi
// của app nội bộ mất rồi. src/cho.js đặt biến xong mới nạp file này.
if (process.env.SABI_SERVICE !== 'cho') {
  throw new Error('Chạy chợ bằng `node src/cho.js`, đừng chạy thẳng server-cho.js');
}

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { authMiddleware, requireRole, QUAN_LY } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import choRouter from './routes/cho.js';
import homesRouter from './routes/homes.js';
import holidaysRouter from './routes/holidays.js';

// Không có tài khoản chỉ-đọc thì KHÔNG khởi động — thà chợ không lên còn hơn chợ
// lặng lẽ chạy bằng tài khoản chủ (prisma.js chỉ trả null, không tự rơi về client chủ).
if (!process.env.DATABASE_URL_CHO) {
  throw new Error('Chợ cần DATABASE_URL_CHO (role cho_chi_doc, chỉ SELECT). Khai trong .env / Render Environment.');
}

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN === '*' ? true : (process.env.CORS_ORIGIN || true),
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));

app.use('/v1/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Quá nhiều lần đăng nhập, thử lại sau 15 phút' }
}));
// Đăng ký mở cho người lạ: 5 lần / giờ / IP là dư cho người thật, đủ chặn bot rải tài khoản.
app.use('/v1/auth/register', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Đăng ký quá nhiều lần, thử lại sau một giờ' }
}));

app.get('/health', (req, res) => res.json({
  ok: true,
  name: 'Sabi — Chợ căn',
  service: 'cho',
  chiDoc: 'sales',        // mặt Sales (/v1/cho) chỉ đọc; mặt chủ nhà (/v1/homes) ghi được
  chuNha: true,
  time: new Date().toISOString()
}));

// ───── HAI MẶT CỦA CHỢ (09/2026) ─────
// Từ nay chợ có hai người dùng, đi hai cửa khác nhau trên cùng một tiến trình:
//   · SALES  → /v1/cho    : chỉ đọc, client prismaChiDoc (role Neon chỉ SELECT).
//   · HOST   → /v1/homes, /v1/holidays : khai căn, nối lịch, tải ảnh — client chủ,
//              lọc hostId y như app nội bộ (cùng file routes, không chép code).
// Chủ nhà mới KHÔNG cần cài app nội bộ: đăng ký trên chợ, khai căn trên chợ.
//
// Cửa Sales vẫn chặn GHI ngay ở đây (hàng rào số 2) — cấp DB đã chặn rồi, nhưng
// chặn ở đây cho ra thông báo tử tế, và lỡ ai cấp nhầm quyền thì còn một lớp.
app.use('/v1/cho', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return res.status(405).json({ error: 'Mặt chợ của Sales chỉ đọc. Không có thao tác ghi ở đây.' });
});

// Đăng nhập (chỉ đọc User + ký JWT). Đăng ký (POST /register) cũng đi qua đây —
// tài khoản mới sinh ra ở trạng thái chờ duyệt, admin duyệt xong mới vào được.
app.use('/v1/auth', authRouter);

app.use('/v1', authMiddleware);
app.use('/v1/cho', choRouter);

// Cửa chủ nhà. SALES bị chặn ngay cửa: hostWhere() của SALES là hostId -1 nên có lọt
// cũng không thấy gì, nhưng trả 403 rõ ràng vẫn hơn trả danh sách rỗng khó hiểu.
app.use(['/v1/homes', '/v1/holidays'], requireRole(...QUAN_LY));
app.use('/v1/homes', homesRouter);
app.use('/v1/holidays', holidaysRouter);

// ───── Web chợ (build từ ../sabicho) ─────
// Đặt SAU các route /v1 để không bao giờ nuốt mất API.
const THU_MUC = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(THU_MUC, '..', 'public-cho');
if (fs.existsSync(path.join(WEB, 'index.html'))) {
  // File băm tên (index-<hash>.js) đổi tên mỗi lần build nên cache lâu được.
  app.use('/assets', express.static(path.join(WEB, 'assets'), {
    maxAge: '1y', immutable: true,
  }));
  app.use(express.static(WEB, { index: false, maxAge: '1h' }));
  // App một trang: mọi đường dẫn còn lại trả index.html, TRỪ /v1 (đã xử lý ở trên
  // và phải để rơi xuống 404 JSON, không thì lỗi gõ sai API lại trả về trang HTML).
  app.get(/^(?!\/v1(\/|$)).*/, (_req, res) => res.sendFile(path.join(WEB, 'index.html')));
} else {
  console.warn('⚠  Chưa có public-cho/index.html — chạy `npm run build` trong ../sabicho');
}

// ───── Error handler ─────
app.use((err, req, res, next) => {
  const ma = Math.random().toString(36).slice(2, 8).toUpperCase();
  console.error(`❌ [${ma}] ${req.method} ${req.originalUrl}`, err);

  // Role chỉ-đọc mà có ai đó cố ghi -> Postgres trả 42501. Nói thẳng cho dễ dò.
  if (err.code === 'P2010' || String(err.message || '').includes('permission denied')) {
    return res.status(403).json({ error: 'Chợ không có quyền ghi vào cơ sở dữ liệu (đúng thiết kế)' });
  }
  if (err.code === 'P1001' || err.code === 'P1002' || err.code === 'P2024') {
    return res.status(503).json({ error: 'Hệ thống đang bận, thử lại sau vài giây' });
  }
  if (err.status) return res.status(err.status).json({ error: err.message });
  res.status(500).json({ error: `Lỗi hệ thống (mã ${ma})` });
});

process.on('unhandledRejection', (ly) => {
  console.error('⚠️  Promise bị từ chối mà không ai bắt — chợ vẫn chạy tiếp:', ly);
});
process.on('uncaughtException', (e) => {
  console.error('⚠️  Lỗi không ai bắt — chợ vẫn chạy tiếp:', e);
});

const PORT = process.env.PORT || 3200;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🛒 Sabi — Chợ căn chạy tại http://localhost:${PORT}`);
  console.log(`   API base: http://localhost:${PORT}/v1`);
  console.log(`   Sales:    /v1/cho chỉ đọc (role cho_chi_doc)`);
  console.log(`   Chủ nhà:  /v1/homes, /v1/holidays ghi được, lọc theo hostId\n`);
});
