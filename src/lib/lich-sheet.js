// Đọc lịch trống/bận từ bảng Google Sheet của chủ nhà.
//
// VÌ SAO PHẢI TẢI .XLSX CHỨ KHÔNG PHẢI CSV
// Chủ nhà ở Đà Lạt không gõ chữ "đã đặt" vào ô — họ **tô màu ô**. Bản CSV không mang
// theo màu, tải CSV về là thấy cả tháng trống trơn. Bản .xlsx thì giữ nguyên màu nền.
// Đây là điểm khiến mọi cách đọc "cho nhanh" đều sai, nên chép lại đây cho rõ.
//
// HÌNH DẠNG BẢNG THẬT (khảo sát bảng của 22 chủ nhà, 09/2026)
//   · Một BẢNG TÍNH = một chủ nhà · một TAB = một tháng ("Tháng 92026", "THÁNG 1.2026", "92026"…)
//   · Kiểu A — mỗi căn một khối 5 cột lặp ngang:
//         Thứ | Ngày/Tháng | Giá thu về | Saler | Ghi chú ‖ Thứ | Ngày/Tháng | …
//   · Kiểu B — một cột ngày dùng chung, mỗi căn một cột giá:
//         Thứ | Ngày | Căn 1 | Căn 2 | Căn 3 | …
//   · Trạng thái nằm ở MÀU NỀN ô giá:
//         trắng / không tô → trống
//         vàng             → tạm giữ chờ cọc   (chú giải in ngay trong bảng)
//         cam              → tạm khoá (chụp ảnh, cải tạo)
//         màu khác (đỏ…)   → đã bán
//     Chữ trong ô ("IN", tên khách…) chỉ là ghi chú của chủ nhà, KHÔNG dùng để suy trạng thái.
//
// NGUYÊN TẮC: đọc không chắc thì báo "không đọc được", TUYỆT ĐỐI không coi là trống.
// Sales tin "còn trống" rồi chốt trúng ngày bận là mất khách thật.
import ExcelJS from 'exceljs';

export const TRANG_THAI = {
  trong: 'Còn trống',
  ban: 'Đã bán',
  giu: 'Đang giữ chờ cọc',
  khoa: 'Chủ nhà khoá',
};

/** Đổi màu nền ô thành trạng thái. */
export function phanLoaiMau(argb) {
  if (!argb || typeof argb !== 'string') return 'trong';
  const s = argb.length === 8 ? argb.slice(2) : argb;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return 'trong';
  if (r > 240 && g > 240 && b > 240) return 'trong';        // trắng
  if (Math.max(r, g, b) - Math.min(r, g, b) < 24) return 'trong';  // xám -> coi như chưa tô
  if (r > 200 && g > 200 && b < 140) return 'giu';          // vàng
  if (r > 200 && g >= 120 && g < 200 && b < 120) return 'khoa';    // cam
  return 'ban';                                             // đỏ / hồng / tím / xanh…
}

function mauNen(o) {
  const f = o && o.fill;
  if (!f || f.type !== 'pattern' || f.pattern !== 'solid') return null;
  const c = f.fgColor || {};
  // Màu theo "theme" của Google không có mã ARGB — coi như chưa tô.
  return c.argb || null;
}

// Ô trong exceljs có nhiều hình dạng: chuỗi, số, chữ nhiều định dạng (richText),
// ô có link (text + hyperlink), ô công thức (result). Gom về một chỗ — nếu không
// thì tên căn ra "[object Object]" (đã dính đúng lỗi này khi đọc bảng thật).
export function chuoiO(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v.richText)) return v.richText.map((x) => x.text || '').join('');
  if (typeof v.text === 'string') return v.text;
  if (v.result != null) return chuoiO(v.result);
  if (typeof v.hyperlink === 'string') return v.hyperlink;
  return '';
}

const CHUAN = (v) => chuoiO(v).replace(/\s+/g, ' ').trim().toLowerCase();
const ymd = (d) => new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString().slice(0, 10);

/** Nhiều bảng dựng ngày và giá bằng CÔNG THỨC ("=B5+1"). Phải bóc `result` ra trước. */
export function loiO(v) {
  return v && typeof v === 'object' && !(v instanceof Date) && 'result' in v ? v.result : v;
}
/** Số trong ô, kể cả ô công thức. */
export function soO(v) {
  const x = loiO(v);
  return typeof x === 'number' ? x : null;
}

/** Bóc ngày từ ô: Date thật, ô công thức trả Date, chuỗi "01/09/2026" hoặc "2026-09-01". */
function docNgay(v) {
  const x = loiO(v);
  if (x instanceof Date && !Number.isNaN(x.getTime())) {
    return { d: x.getUTCDate(), m: x.getUTCMonth() + 1, y: x.getUTCFullYear() };
  }
  const s = chuoiO(x).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { d: +iso[3], m: +iso[2], y: +iso[1] };
  const k = s.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\s*$/);
  if (!k) return null;
  return { d: +k[1], m: +k[2], y: k[3] ? (+k[3] < 100 ? 2000 + +k[3] : +k[3]) : null };
}

// `namRo` = tên tab có ghi rõ năm. Tab chỉ ghi "THÁNG 9" là tháng 9 của năm nào đó —
// thường là năm cũ, vì bảng nào cũng bắt đầu không ghi năm rồi mới thêm năm vào sau.
// Đừng lấy tab không ghi năm để nói "lịch tháng này": rất dễ đọc nhầm sang năm ngoái.
export function thangCuaTab(ten, namMacDinh = new Date().getUTCFullYear()) {
  const s = CHUAN(ten).replace(/tháng|thang/g, ' ').replace(/[^\d]+/g, ' ').trim();
  const so = s.split(/\s+/).filter(Boolean).map(Number);
  if (!so.length) return null;
  if (so.length === 1) {
    const n = so[0];
    if (n >= 1 && n <= 12) return { m: n, y: namMacDinh, namRo: false };
    const t = String(n);                       // "92026" · "122026"
    if (t.length === 5) return { m: +t.slice(0, 1), y: +t.slice(1), namRo: true };
    if (t.length === 6) return { m: +t.slice(0, 2), y: +t.slice(2), namRo: true };
    return null;
  }
  const [a, b] = so;
  if (a >= 1 && a <= 12 && b > 1900) return { m: a, y: b, namRo: true };
  return null;
}

/** Chọn tab đúng tháng/năm cần. Ưu tiên tab GHI RÕ NĂM. */
export function chonTab(wb, m, y) {
  const hop = wb.worksheets.map((w) => ({ w, t: thangCuaTab(w.name, y) })).filter((x) => x.t);
  const roNam = hop.find((x) => x.t.namRo && x.t.m === m && x.t.y === y);
  if (roNam) return roNam;
  // Chỉ chấp nhận tab không ghi năm khi trong bảng KHÔNG có tab nào ghi rõ năm đó.
  const coNamKhac = hop.some((x) => x.t.namRo && x.t.y === y);
  if (coNamKhac) return null;
  return hop.find((x) => !x.t.namRo && x.t.m === m) || null;
}

const NHAN_BO = /saler|sale|ghi ch|note/i;
const NHAN_GIA = /giá|gia thu|^gia$/i;
const KHONG_PHAI_TEN = /địa chỉ|cơ cấu|tiện ích|link|group|thứ|a\/c saler|giá|ghi ch|saler|lưu ý|thời gian|liên hệ|đt|sđt/i;

/**
 * Đọc một tab, trả về các khối căn: { ten, cot, ngay: [...] }.
 * Cách nhận cả hai kiểu bảng mà không đoán mò: tìm CỘT NGÀY trước (cột nào có nhiều
 * ô đọc ra ngày), rồi các cột bên phải nó tới cột ngày kế tiếp chính là các cột căn.
 * Không nhận ra được thì trả mảng rỗng — nơi gọi phải báo "chưa đọc được".
 */
export function docTab(sheet, tenTab) {
  const moc = thangCuaTab(tenTab);
  const COT = Math.min(sheet.columnCount || 40, 120);
  const HANG = Math.min(sheet.rowCount || 60, 400);

  // ── 1. Cột nào là cột ngày ──
  // Hai kiểu cột ngày gặp thật:
  //   'ngay'   — ô chứa ngày đầy đủ (01/09/2026, hoặc công thức =B5+1)
  //   'songay' — ô chỉ ghi SỐ NGÀY trong tháng: 1, 2, 3… Tháng/năm lấy từ tên tab.
  // Cột "số ngày" dễ nhầm với cột số khách / số phòng, nên bắt buộc phải TĂNG DẦN
  // liên tiếp ít nhất 6 lần thì mới nhận.
  const soNgayCuaO = (v) => {
    const n = soO(v);
    if (n != null) return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
    const s = chuoiO(v).trim();
    return /^\d{1,2}$/.test(s) && +s >= 1 && +s <= 31 ? +s : null;
  };

  const cotNgay = [];
  for (let c = 1; c <= COT; c++) {
    let demNgay = 0, dauNgay = 0, demSo = 0, dauSo = 0, truoc = 0, tang = 0;
    for (let r = 1; r <= HANG; r++) {
      const v = sheet.getRow(r).getCell(c).value;
      if (docNgay(v)) { demNgay++; if (!dauNgay) dauNgay = r; continue; }
      const n = soNgayCuaO(v);
      if (n != null) {
        demSo++; if (!dauSo) dauSo = r;
        if (n === truoc + 1) tang++;
        truoc = n;
      }
    }
    if (demNgay >= 8) cotNgay.push({ c, hangDau: dauNgay, kieu: 'ngay' });
    else if (moc && demSo >= 8 && tang >= 6) cotNgay.push({ c, hangDau: dauSo, kieu: 'songay' });
  }
  if (!cotNgay.length) return [];

  const khoi = [];
  for (let i = 0; i < cotNgay.length; i++) {
    const d = cotNgay[i];
    // Cột ngày cuối cùng thì quét tới hết bảng: kiểu "một cột ngày dùng chung" có thể
    // có hơn chục căn xếp sau nó. Cột thừa sẽ bị loại ở bước kiểm "có gì không".
    const het = i + 1 < cotNgay.length ? Math.min(cotNgay[i + 1].c - 1, COT) : COT;
    const hangTieuDe = Math.max(1, d.hangDau - 1);

    const timTen = (cot) => {
      for (let r = 1; r < d.hangDau; r++) {
        const v = chuoiO(sheet.getRow(r).getCell(cot).value)
          .replace(/\s*[-–]\s*lịch booking.*$/i, '').replace(/\s+/g, ' ').trim();
        if (v && v.length >= 2 && v.length < 80 && !KHONG_PHAI_TEN.test(v) && !docNgay(v)) return v;
      }
      return '';
    };

    for (let c = d.c + 1; c <= het; c++) {
      const tieuDe = chuoiO(sheet.getRow(hangTieuDe).getCell(c).value).trim();
      const laGia = NHAN_GIA.test(tieuDe);
      if (tieuDe && NHAN_BO.test(tieuDe) && !laGia) continue;   // cột Saler / Ghi chú

      let ten = timTen(c);
      if (!ten && laGia) ten = timTen(d.c) || timTen(d.c - 1);  // kiểu A: tên lệch trái
      if (!ten && !laGia) continue;                             // cột trống

      const ngay = [];
      for (let r = d.hangDau; r <= HANG; r++) {
        const hang = sheet.getRow(r);
        const oNgay = hang.getCell(d.c).value;
        let n = null;
        if (d.kieu === 'songay') {
          const x = soNgayCuaO(oNgay);
          if (x != null) n = { d: x, m: moc.m, y: moc.y };
        } else {
          n = docNgay(oNgay);
        }
        if (!n) { if (ngay.length) break; continue; }
        if (n.d < 1 || n.d > 31) continue;
        // Năm/tháng gõ sai trong ô rất hay gặp ("01/09/0206"). Tên tab đáng tin hơn.
        const m = moc ? moc.m : n.m;
        const y = moc ? moc.y : (n.y || new Date().getUTCFullYear());
        const o = hang.getCell(c);
        const mau = mauNen(o);
        const so = soO(o.value);
        const chu = chuoiO(o.value).trim();
        ngay.push({
          ngay: ymd({ d: n.d, m, y }),
          trangThai: phanLoaiMau(mau),
          mau: mau || null,
          gia: so,
          saler: laGia ? (chuoiO(hang.getCell(c + 1).value).trim() || null) : null,
          ghiChu: (laGia ? chuoiO(hang.getCell(c + 2).value).trim() : (so == null ? chu : '')) || null,
        });
      }
      // Cột phải THỰC SỰ có gì đó mới tính là căn: có ô giá, có màu, hoặc có ghi chú.
      // Chỉ có mỗi cái tên (do ô tên bị gộp ô tràn sang) là cột ma — bỏ.
      const coGi = ngay.some((x) => x.gia || x.trangThai !== 'trong' || x.ghiChu);
      if (ngay.length && (laGia || coGi)) {
        khoi.push({ ten: ten || '(không rõ tên)', cot: c, cotNgay: d.c, ngay });
      }
    }
  }
  return khoi;
}

/** Tải bảng tính công khai về dạng .xlsx rồi đọc. */
export async function taiVaDoc(spreadsheetId, hetHan = 75000) {
  const bo = new AbortController();
  const h = setTimeout(() => bo.abort(), hetHan);
  try {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`, {
      redirect: 'follow', signal: bo.signal,
    });
    if (r.status === 401 || r.status === 403) {
      throw new Error('Bảng chưa mở chia sẻ "bất kỳ ai có link đều xem được"');
    }
    if (!r.ok) throw new Error(`Google trả về ${r.status}`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await r.arrayBuffer()));
    return wb;
  } finally {
    clearTimeout(h);
  }
}

/** Lấy id bảng tính từ một đường link bất kỳ. */
export function idBangTinh(url) {
  return (String(url || '').match(/\/d\/([\w-]{20,})/) || [, null])[1];
}

/**
 * Đọc lịch của MỘT căn: tải bảng, chọn tab theo tháng, tìm khối khớp tên căn.
 * `tenCan` khớp lỏng (bỏ dấu, bỏ khoảng trắng) vì tên trong bảng và tên trong app
 * gần như không bao giờ trùng từng ký tự.
 */
const bo_dau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd').replace(/[^a-z0-9]/gi, '').toLowerCase();

export function chonKhoi(khoi, tenCan) {
  if (!khoi.length) return null;
  if (!tenCan) return khoi.length === 1 ? khoi[0] : null;
  const t = bo_dau(tenCan);
  return khoi.find((k) => bo_dau(k.ten) === t)
    || khoi.find((k) => bo_dau(k.ten).includes(t) || t.includes(bo_dau(k.ten)))
    || null;
}
