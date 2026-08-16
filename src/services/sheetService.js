// ═══════════════════════════════════════════════════════════════
// sheetService.js — Nhập lịch từ Google Sheet công khai (màu -> trạng thái)
// Host chia sẻ Sheet "ai có link đều xem được", dán link vào app.
// Backend tải bản .xlsx (giữ được màu nền ô) rồi bóc màu từng ô.
//
// KHÔNG cần Google Cloud / API key. Chỉ cần link công khai.
// Lõi phân loại màu port từ sabihome/src/lib/sheet-import.ts.
// ═══════════════════════════════════════════════════════════════

import ExcelJS from 'exceljs';

// ───── Nhãn trạng thái ─────
export const STATUS_LABEL = {
  TRONG: 'Trống',
  CO_KHACH: 'Có khách',
  DOI_COC: 'Đợi cọc',
  KHONG_RO: 'Chưa rõ',
};

// ───── Màu -> RGB ─────
export function hexToRgb(hex) {
  if (!hex) return null;
  let h = String(hex).replace('#', '').trim();
  if (h.length === 8) h = h.slice(2); // bỏ alpha AARRGGBB
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function isWhitish(c) {
  return c.r > 245 && c.g > 245 && c.b > 245;
}

// ───── Luật mặc định (host Sabi Home #1 đã xác nhận) ─────
// trắng -> Trống · vàng (kem/tươi/sậm) -> Có khách · cyan -> Đợi cọc
export function classifyDefault(hex) {
  const c = hexToRgb(hex);
  if (!c || isWhitish(c)) return 'TRONG';
  if (c.r < 120 && c.g > 150 && c.b > 150) return 'DOI_COC';
  if (c.r > 140 && c.g > 110 && c.b < c.r) return 'CO_KHACH';
  return 'KHONG_RO';
}

// ───── Phân loại theo legend host (nearest-color) ─────
export function classify(hex, rule) {
  const c = hexToRgb(hex);
  if (!c || isWhitish(c)) return { status: 'TRONG', sure: true };

  if (!rule || !rule.legend || rule.legend.length === 0) {
    const s = classifyDefault(hex);
    return { status: s, sure: s !== 'KHONG_RO' };
  }

  const tol = rule.tolerance ?? 60;
  let best = null;
  let bestD = Infinity;
  for (const e of rule.legend) {
    const ec = hexToRgb(e.hex);
    if (!ec) continue;
    const d = colorDistance(c, ec);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) return { status: 'KHONG_RO', sure: false };
  return {
    status: best.status,
    sure: bestD <= tol,
    matchedHex: best.hex,
    distance: Math.round(bestD),
  };
}

// ═══════════════════════════════════════════════════════════════
// Tải & đọc Google Sheet công khai
// ═══════════════════════════════════════════════════════════════

/** Bóc spreadsheetId + gid từ link Google Sheet. */
export function parseSheetUrl(url) {
  if (!url) return null;
  const s = String(url).trim();
  const idM = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idM) return null;
  const spreadsheetId = idM[1];
  let gid = null;
  const gidM = s.match(/[#&?]gid=(\d+)/);
  if (gidM) gid = gidM[1];
  return { spreadsheetId, gid };
}

/** ARGB của exceljs -> hex '#RRGGBB'. Trả null nếu không có màu. */
function fillToHex(cell) {
  const fill = cell && cell.fill;
  if (!fill || fill.type !== 'pattern') return null;
  const fg = fill.fgColor;
  if (!fg) return null;
  // theme color / indexed color -> exceljs không cho ARGB trực tiếp, bỏ qua
  if (typeof fg.argb !== 'string') return null;
  let h = fg.argb;
  if (h.length === 8) h = h.slice(2);
  if (h.length !== 6) return null;
  return '#' + h.toUpperCase();
}

/** Tải bản .xlsx của sheet công khai về buffer. */
export async function downloadSheetXlsx(spreadsheetId, gid) {
  let url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
  if (gid != null) url += `&gid=${gid}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    const err = new Error(`Không tải được Sheet (HTTP ${res.status}). Kiểm tra link đã chia sẻ công khai chưa.`);
    err.status = 400;
    throw err;
  }
  const ct = res.headers.get('content-type') || '';
  // Sheet chưa công khai -> Google trả về trang HTML đăng nhập, không phải xlsx
  if (ct.includes('text/html')) {
    const err = new Error('Sheet chưa được chia sẻ công khai. Vào Chia sẻ -> "Bất kỳ ai có đường liên kết" -> Người xem.');
    err.status = 400;
    throw err;
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Đọc 1 tab của sheet -> danh sách ô có màu/nội dung.
 * Trả về cells: [{row, col, text, hex}] để tầng trên tự bố cục.
 */
export async function readSheetCells(buffer, gid) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // Chọn worksheet theo gid nếu khớp, không thì lấy sheet đầu.
  let ws = null;
  if (gid != null) {
    ws = wb.worksheets.find((w) => String(w.id) === String(gid))
      || wb.worksheets.find((w) => String(w.state?.gid) === String(gid));
  }
  if (!ws) ws = wb.worksheets[0];
  if (!ws) {
    const err = new Error('Sheet rỗng.');
    err.status = 400;
    throw err;
  }

  const cells = [];
  ws.eachRow({ includeEmpty: false }, (rowObj, rowNumber) => {
    rowObj.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const hex = fillToHex(cell);
      let text = cell.text != null ? String(cell.text).trim() : '';
      if (!hex && !text) return;
      cells.push({ row: rowNumber, col: colNumber, text, hex });
    });
  });

  return { tab: ws.name, cells };
}

/**
 * Phát hiện legend (chú thích màu) trong sheet:
 * ô có màu nằm cạnh ô chữ chứa từ khoá trạng thái.
 */
const LEGEND_KEYWORDS = [
  { re: /tr[oố]ng|empty|available/i, status: 'TRONG' },
  { re: /kh[aá]ch|booked|đ[aã]\s*đ[aặ]t|full/i, status: 'CO_KHACH' },
  { re: /c[oọ]c|deposit|gi[uữ]\s*ch[oỗ]|hold/i, status: 'DOI_COC' },
];

export function detectLegend(cells) {
  const legend = [];
  const seen = new Set();
  for (const c of cells) {
    if (!c.hex) continue;
    // tìm ô chữ GẦN NHẤT cùng hàng (trong 2 cột), không phải ô đầu mảng
    let neighbor = null;
    let nd = Infinity;
    for (const o of cells) {
      if (o.row !== c.row || o.hex || !o.text) continue;
      const d = Math.abs(o.col - c.col);
      if (d >= 1 && d <= 2 && d < nd) { nd = d; neighbor = o; }
    }
    if (!neighbor) continue;
    for (const kw of LEGEND_KEYWORDS) {
      if (kw.re.test(neighbor.text)) {
        const key = c.hex + kw.status;
        if (seen.has(key)) break;
        seen.add(key);
        legend.push({ hex: c.hex, status: kw.status, label: neighbor.text });
        break;
      }
    }
  }
  return legend;
}

/**
 * Toàn bộ luồng: từ link -> danh sách ô đã phân loại trạng thái.
 * rule (tuỳ chọn): legend host tự khai đè lên auto-detect.
 */
export async function importFromUrl(url, rule) {
  const parsed = parseSheetUrl(url);
  if (!parsed) {
    const err = new Error('Link Google Sheet không hợp lệ.');
    err.status = 400;
    throw err;
  }
  const buffer = await downloadSheetXlsx(parsed.spreadsheetId, parsed.gid);
  const { tab, cells } = await readSheetCells(buffer, parsed.gid);

  // legend: ưu tiên host khai, không thì tự dò trong sheet
  const legend = (rule && rule.legend && rule.legend.length)
    ? rule.legend
    : detectLegend(cells);
  const effectiveRule = legend.length ? { legend, tolerance: rule?.tolerance } : undefined;

  const counts = { TRONG: 0, CO_KHACH: 0, DOI_COC: 0, KHONG_RO: 0 };
  let unsure = 0;
  const colored = [];
  for (const c of cells) {
    if (!c.hex) continue; // chỉ phân loại ô có màu
    const cl = classify(c.hex, effectiveRule);
    counts[cl.status]++;
    if (!cl.sure) unsure++;
    colored.push({
      row: c.row, col: c.col, text: c.text,
      hex: c.hex, status: cl.status, sure: cl.sure,
      label: STATUS_LABEL[cl.status],
    });
  }

  return {
    tab,
    spreadsheetId: parsed.spreadsheetId,
    gid: parsed.gid,
    legend,
    cells: colored,
    counts,
    unsure,
    total: colored.length,
  };
}
