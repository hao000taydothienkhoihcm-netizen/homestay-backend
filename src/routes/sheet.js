// ═══════════════════════════════════════════════════════════════
// sheet.js — Nhập lịch từ Google Sheet công khai (màu -> trạng thái)
// POST /v1/sheet/preview  { url, legend?, tolerance? }
//   -> xem trước: tab, legend, ô đã phân loại, thống kê, số ô chưa chắc
// Đứng sau authMiddleware (mount ở server.js sau app.use('/v1', authMiddleware)).
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { importFromUrl } from '../services/sheetService.js';

const router = Router();

router.post('/preview', async (req, res) => {
  try {
    const { url, legend, tolerance } = req.body || {};
    if (!url) return res.status(400).json({ error: 'Thiếu link Google Sheet' });

    const rule = (Array.isArray(legend) && legend.length)
      ? { legend, tolerance: tolerance ?? undefined }
      : undefined;

    const result = await importFromUrl(url, rule);
    res.json(result);
  } catch (err) {
    const code = err?.status || 500;
    res.status(code).json({ error: err?.message || 'Lỗi đọc Google Sheet' });
  }
});

export default router;
