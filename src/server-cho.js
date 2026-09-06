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

import { authMiddleware } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import choRouter from './routes/cho.js';

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

app.get('/health', (req, res) => res.json({
  ok: true,
  name: 'Sabi — Chợ căn',
  service: 'cho',
  chiDoc: true,
  time: new Date().toISOString()
}));

// ───── Chặn mọi thao tác GHI ngay ở cửa ─────
// Hàng rào số 2. Cấp DB đã chặn rồi, nhưng chặn ở đây cho ra thông báo tử tế thay vì
// một lỗi Postgres khó hiểu — và để lỡ ai cấp nhầm quyền ghi thì vẫn còn một lớp.
// Ngoại lệ: POST /v1/auth/login (đăng nhập chỉ đọc User rồi ký JWT, không ghi gì).
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.method === 'POST' && req.path === '/v1/auth/login') return next();
  return res.status(405).json({
    error: 'Chợ đang ở chế độ chỉ đọc. Mọi thao tác ghi làm bên app nội bộ.'
  });
});

// Đăng nhập (chỉ đọc User + ký JWT). CỐ Ý không mount /register: tạo tài khoản là
// thao tác ghi, để admin làm bên app nội bộ cho tới khi chợ có bảng riêng.
app.use('/v1/auth', authRouter);

app.use('/v1', authMiddleware);
app.use('/v1/cho', choRouter);

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
  console.log(`   Chế độ:   CHỈ ĐỌC (role Neon riêng, không ghi được vào dữ liệu host)\n`);
});
