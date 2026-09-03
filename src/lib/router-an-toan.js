// Router tự bọc lỗi cho handler async.
//
// VẤN ĐỀ: Express 4 KHÔNG bắt lỗi trong hàm async. Handler viết kiểu
//     router.get('/', async (req, res) => { ... })
// mà bên trong ném lỗi (Neon chớp một nhịp, Prisma hết giờ chờ…) thì lời hứa
// bị từ chối mà không ai bắt. Node 15 trở lên coi đó là lỗi chí mạng và
// GIẾT LUÔN TIẾN TRÌNH. Render Free chạy đúng một instance, nên cả app sập
// tới khi tự khởi động lại — khách đang xem lịch thì trắng màn hình.
//
// Dự án có 55 route async, chỉ 9 route tự bọc try/catch.
//
// CÁCH SỬA: thay vì đi thêm try/catch vào 46 chỗ (dễ sót, và người viết route
// mới sau này lại quên), bọc ngay ở tầng Router. Mỗi file route chỉ đổi một
// dòng `Router()` thành `routerAnToan()`, từ đó về sau mọi handler async đều
// tự động chuyển lỗi sang next(err) → rơi vào error handler ở server.js.
//
// Handler nào đã có try/catch riêng vẫn chạy y như cũ, không đụng gì tới.
import { Router } from 'express';

const PHUONG_THUC = ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'];

// Bọc 1 handler. Chỉ bọc hàm thường (req, res, next);
// error handler của Express có 4 tham số — bọc vào là hỏng, phải chừa ra.
function boc(fn) {
  if (typeof fn !== 'function' || fn.length >= 4) return fn;
  return function (req, res, next) {
    try {
      const kq = fn.call(this, req, res, next);
      // Chỉ bám vào khi handler thật sự trả về lời hứa.
      if (kq && typeof kq.then === 'function') kq.catch(next);
      return kq;
    } catch (e) {
      next(e);   // lỗi ném đồng bộ ngay trong handler
    }
  };
}

export function routerAnToan(opts) {
  const r = Router(opts);
  for (const pt of PHUONG_THUC) {
    const goc = r[pt].bind(r);
    r[pt] = (...args) => goc(...args.map(boc));
  }
  return r;
}

export default routerAnToan;
