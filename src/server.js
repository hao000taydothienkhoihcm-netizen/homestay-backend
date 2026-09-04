// ═══════════════════════════════════════
// HOMESTAY MANAGER — BACKEND SERVER
// ═══════════════════════════════════════
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { authMiddleware } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import bookingsRouter from './routes/bookings.js';
import homesRouter from './routes/homes.js';
import holidaysRouter from './routes/holidays.js';
import expensesRouter from './routes/expenses.js';
import usersRouter from './routes/users.js';
import hostsRouter from './routes/hosts.js';
import chargeTemplatesRouter from './routes/chargeTemplates.js';
import statsRouter from './routes/stats.js';
import inventoryRouter from './routes/inventory.js';
import sheetRouter from './routes/sheet.js';
import choRouter from './routes/cho.js';

const app = express();

// ───── Middleware ─────
app.use(cors({
  origin: process.env.CORS_ORIGIN === '*' ? true : (process.env.CORS_ORIGIN || true),
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));

// Rate limit (chống brute force login)
app.use('/v1/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Quá nhiều lần đăng nhập, thử lại sau 15 phút' }
}));

// ───── Health check ─────
app.get('/health', (req, res) => res.json({
  ok: true,
  name: 'HomeStay Manager API',
  version: '1.0.0',
  time: new Date().toISOString()
}));

// ───── Serve web (public/index.html) ─────
app.use(express.static(path.join(__dirname, '../public')));

// ───── Public routes ─────
app.use('/v1/auth', authRouter);

// ───── Protected routes ─────
app.use('/v1', authMiddleware);
app.use('/v1/bookings', bookingsRouter);
app.use('/v1/homes', homesRouter);
app.use('/v1/holidays', holidaysRouter);
app.use('/v1/expenses', expensesRouter);
app.use('/v1/users', usersRouter);
app.use('/v1/hosts', hostsRouter);
app.use('/v1/charge-templates', chargeTemplatesRouter);
app.use('/v1/stats', statsRouter);
app.use('/v1/inventory', inventoryRouter);
app.use('/v1/sheet', sheetRouter);
app.use('/v1/cho', choRouter);      // chợ căn cho SALES — CỐ Ý không lọc hostId, xem routes/cho.js

// ───── SPA fallback cho React (BrowserRouter) ─────
// Mọi đường dẫn không phải API/health/file tĩnh → trả index.html của React ở root.
// Bản cũ nằm ở /cu (đã được express.static phục vụ, không rơi vào đây).
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/v1') || req.path.startsWith('/health')) return next();
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ───── Error handler ─────
// Nhờ routerAnToan() (src/lib/router-an-toan.js) mà lỗi trong handler async
// giờ mới chạy được tới đây. Trước đó nó thoát ra ngoài Express và giết tiến trình.
app.use((err, req, res, next) => {
  const ma = Math.random().toString(36).slice(2, 8).toUpperCase();   // mã để dò log
  console.error(`❌ [${ma}] ${req.method} ${req.originalUrl}`, err);

  if (err.code === 'P2002') return res.status(400).json({ error: 'Dữ liệu trùng lặp' });
  if (err.code === 'P2025') return res.status(404).json({ error: 'Không tìm thấy bản ghi' });

  // Prisma không nối được database (Neon đang ngủ / mạng chớp). Nói đúng bệnh
  // để người dùng biết chờ một nhịp rồi thử lại, thay vì tưởng app hỏng.
  if (err.code === 'P1001' || err.code === 'P1002' || err.code === 'P2024') {
    return res.status(503).json({ error: 'Hệ thống đang bận, thử lại sau vài giây' });
  }

  // Lỗi CÓ status là lỗi mình chủ động ném ra -> nói thật cho người dùng.
  // Lỗi không có status là lỗi ngoài dự tính -> KHÔNG đưa err.message ra ngoài,
  // vì nó hay kèm câu truy vấn, tên cột, đường dẫn file.
  if (err.status) return res.status(err.status).json({ error: err.message });
  res.status(500).json({ error: `Lỗi hệ thống (mã ${ma})` });
});

// ───── Lưới an toàn cuối cùng ─────
// routerAnToan() lo phần trong route. Nhưng còn lỗi sinh ra NGOÀI route:
// setTimeout, sự kiện, thư viện gọi ngược lại… Node mặc định giết tiến trình
// khi gặp promise bị từ chối mà không ai bắt.
//
// Ở đây CỐ Ý không tắt máy: app chỉ có một instance trên Render, chết là cả
// nhà cùng mất dịch vụ. Ghi log rồi chạy tiếp — sai một request còn hơn sập cả app.
process.on('unhandledRejection', (ly, o) => {
  console.error('⚠️  Promise bị từ chối mà không ai bắt — app vẫn chạy tiếp:', ly);
});
process.on('uncaughtException', (e) => {
  console.error('⚠️  Lỗi không ai bắt — app vẫn chạy tiếp:', e);
});

// ───── Start ─────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏡 HomeStay Backend chạy tại http://localhost:${PORT}`);
  console.log(`   API base: http://localhost:${PORT}/v1`);
  console.log(`   Health:   http://localhost:${PORT}/`);
  console.log(`\n   Demo: POST /v1/auth/login với { username: "admin", password: "admin123" }\n`);
});
