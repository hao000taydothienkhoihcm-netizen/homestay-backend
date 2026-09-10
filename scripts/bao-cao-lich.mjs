// Quét toàn bộ bảng lịch của các chủ nhà trong rổ GOODSTAY, đọc tháng đang xét,
// rồi xuất ra một trang HTML để CHỦ NHÀ SOI BẰNG MẮT xem máy đọc có đúng không.
//
//   node scripts/bao-cao-lich.mjs            -> tháng này
//   node scripts/bao-cao-lich.mjs 2026-10    -> tháng khác
//
// Ra hai file: _lich-doc-duoc.json (số liệu) và _lich-doc-duoc.html (trang xem).
import fs from 'node:fs';
import { taiVaDoc, docTab, chonTab, idBangTinh } from '../src/lib/lich-sheet.js';

const THANG = process.argv[2] || new Date().toISOString().slice(0, 7);
const [NAM, THANG_SO] = THANG.split('-').map(Number);
const soNgayTrongThang = new Date(Date.UTC(NAM, THANG_SO, 0)).getUTCDate();

const F = new URL('./du-lieu/link-lich-goodstay.json', import.meta.url);
if (!fs.existsSync(F)) { console.error('Chạy trước: node scripts/boc-link-lich.mjs'); process.exit(1); }
const canGoodstay = JSON.parse(fs.readFileSync(F, 'utf8'));

// Gom căn theo bảng tính — mỗi bảng chỉ tải MỘT lần dù có 10 căn dùng chung.
const theoBang = new Map();
for (const x of canGoodstay) {
  const id = idBangTinh(x.link.booking);
  if (!id) continue;
  if (!theoBang.has(id)) theoBang.set(id, []);
  theoBang.get(id).push(x);
}
console.log(`${canGoodstay.length} căn · ${theoBang.size} bảng tính · đọc tháng ${THANG_SO}/${NAM}\n`);

const ketQua = [];
let i = 0;
for (const [id, dsCan] of theoBang) {
  i++;
  const nhan = dsCan.map((c) => c.ma).join(',');
  const muc = { id, can: dsCan.map((c) => ({ ma: c.ma, ten: c.ten })), khoi: [], loi: null };
  try {
    const wb = await taiVaDoc(id);
    muc.soTab = wb.worksheets.length;
    const chon = chonTab(wb, THANG_SO, NAM);
    if (!chon) { muc.loi = `Không có tab cho tháng ${THANG_SO}/${NAM}`; }
    else {
      muc.tab = chon.w.name;
      muc.khoi = docTab(chon.w, chon.w.name).map((k) => ({
        ten: k.ten,
        ngay: k.ngay.map((n) => ({ ngay: n.ngay, tt: n.trangThai, gia: n.gia, saler: n.saler })),
      }));
      if (!muc.khoi.length) muc.loi = 'Đọc được tab nhưng không nhận ra bảng lịch';
    }
  } catch (e) {
    muc.loi = e.message;
  }
  ketQua.push(muc);
  console.log(`${String(i).padStart(3)}/${theoBang.size} ${id.slice(0, 10)} ${nhan.slice(0, 28).padEnd(28)} ${muc.loi ? '✕ ' + muc.loi : '✓ ' + muc.khoi.length + ' căn'}`);
}

fs.writeFileSync('_lich-doc-duoc.json', JSON.stringify({ thang: THANG, ketQua }, null, 1), 'utf8');

// ───── Trang xem ─────
const MAU = { trong: '#4a6b52', ban: '#b4553f', giu: '#c9a227', khoa: '#d2691e' };
const TEN_TT = { trong: 'Còn trống', ban: 'Đã bán', giu: 'Giữ chờ cọc', khoa: 'Chủ nhà khoá' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const soBang = ketQua.length;
const bangDoc = ketQua.filter((x) => x.khoi.length).length;
const soKhoi = ketQua.reduce((s, x) => s + x.khoi.length, 0);
const soLoi = ketQua.filter((x) => x.loi).length;

const oNgay = (khoi) => {
  const map = new Map(khoi.ngay.map((n) => [n.ngay, n]));
  let o = '';
  for (let d = 1; d <= soNgayTrongThang; d++) {
    const k = `${NAM}-${String(THANG_SO).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const n = map.get(k);
    const m = n ? MAU[n.tt] : '#e3d8c4';
    const nhac = n ? `${d}/${THANG_SO} · ${TEN_TT[n.tt]}${n.gia ? ' · ' + n.gia.toLocaleString('vi-VN') + 'đ' : ''}${n.saler ? ' · ' + n.saler : ''}` : `${d}/${THANG_SO} · không có dòng này`;
    o += `<i style="background:${m}" title="${esc(nhac)}"></i>`;
  }
  return o;
};

const than = ketQua.map((x) => {
  const ma = x.can.map((c) => c.ma).join(' ');
  const dau = `<div class="ma">${esc(ma)}</div>`;
  if (x.loi) {
    return `<section class="bang loi">${dau}
      <div class="ten">${esc(x.can.map((c) => c.ten).join(' · ')).slice(0, 160)}</div>
      <p class="canhbao">✕ ${esc(x.loi)}</p></section>`;
  }
  const hang = x.khoi.map((k) => {
    const dem = { trong: 0, ban: 0, giu: 0, khoa: 0 };
    for (const n of k.ngay) dem[n.tt]++;
    return `<div class="can">
      <div class="tenCan">${esc(k.ten)}</div>
      <div class="dai">${oNgay(k)}</div>
      <div class="dem">trống <b>${dem.trong}</b> · bán ${dem.ban}${dem.giu ? ' · giữ ' + dem.giu : ''}${dem.khoa ? ' · khoá ' + dem.khoa : ''}</div>
    </div>`;
  }).join('');
  return `<section class="bang">${dau}
    <div class="ten">Tab đọc: <b>${esc(x.tab)}</b> · ${x.khoi.length} căn trong bảng</div>
    ${hang}</section>`;
}).join('');

const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lịch đọc từ bảng chủ nhà — tháng ${THANG_SO}/${NAM}</title>
<style>
:root{--bg:#f4efe6;--card:#fffdf9;--line:#e3d8c4;--ink:#3d352a;--muted:#8a7a5c;--brown:#6b4f2a;--pine:#4a6b52;--red:#b4553f}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font:15px/1.5 'Be Vietnam Pro',system-ui,sans-serif;padding:20px 16px 60px}
.khung{max-width:920px;margin:0 auto}
h1{font-family:Georgia,serif;font-size:24px;line-height:1.25;margin-bottom:4px}
h1 span{display:block;font:13px/1.5 'Be Vietnam Pro',system-ui,sans-serif;color:var(--muted);font-weight:400;margin-top:4px}
.tong{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
.o{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;flex:1;min-width:130px}
.o b{display:block;font-size:22px;font-variant-numeric:tabular-nums;color:var(--brown)}
.o span{font-size:12px;color:var(--muted)}
.chugiai{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-bottom:18px}
.chugiai i{width:11px;height:11px;border-radius:2px;display:inline-block;margin-right:5px;vertical-align:-1px}
.bang{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:12px}
.bang.loi{border-left:4px solid var(--red)}
.ma{font:11px ui-monospace,Menlo,Consolas,monospace;color:var(--muted);background:rgba(107,79,42,.09);display:inline-block;padding:2px 7px;border-radius:4px;margin-bottom:6px}
.ten{font-size:12.5px;color:var(--muted);margin-bottom:10px}
.canhbao{color:var(--red);font-size:13px;font-weight:600}
.can{padding:9px 0;border-top:1px solid var(--line)}
.tenCan{font-weight:600;font-size:13.5px;margin-bottom:5px}
.dai{display:flex;gap:2px}
.dai i{flex:1;height:20px;border-radius:2px;min-width:5px}
.dem{font-size:11.5px;color:var(--muted);margin-top:4px}
.dem b{color:var(--pine)}
footer{font-size:12px;color:var(--muted);margin-top:24px;line-height:1.6}
@media(prefers-color-scheme:dark){:root{--bg:#1f1a14;--card:#2a241c;--line:#3d352a;--ink:#f4efe6;--muted:#a89878;--brown:#d9b98a}}
</style></head><body><div class="khung">
<h1>Lịch đọc từ bảng của chủ nhà<span>Tháng ${THANG_SO}/${NAM} · rổ hàng GOODSTAY · máy đọc tự động, chưa ai kiểm bằng mắt</span></h1>
<div class="tong">
  <div class="o"><b>${bangDoc}/${soBang}</b><span>bảng đọc được</span></div>
  <div class="o"><b>${soKhoi}</b><span>căn có lịch</span></div>
  <div class="o"><b>${soLoi}</b><span>bảng còn hỏng</span></div>
</div>
<div class="chugiai">
  <span><i style="background:${MAU.trong}"></i>Còn trống</span>
  <span><i style="background:${MAU.ban}"></i>Đã bán</span>
  <span><i style="background:${MAU.giu}"></i>Giữ chờ cọc</span>
  <span><i style="background:${MAU.khoa}"></i>Chủ nhà khoá</span>
  <span><i style="background:#e3d8c4"></i>Bảng không có dòng cho ngày đó</span>
</div>
${than}
<footer>Mỗi ô là một đêm, từ ngày 1 tới ngày ${soNgayTrongThang}. Rê chuột lên ô để xem ngày, trạng thái, giá và tên sales ghi trong bảng.<br>
Cách đọc: tải bản .xlsx của bảng rồi lấy <b>màu nền ô</b> làm trạng thái — đúng cách chủ nhà đang dùng. Bản CSV không mang màu nên không dùng được.</footer>
</div></body></html>`;

fs.writeFileSync('_lich-doc-duoc.html', html, 'utf8');
console.log(`\n${bangDoc}/${soBang} bảng đọc được · ${soKhoi} căn có lịch · ${soLoi} bảng hỏng`);
console.log('Đã ghi _lich-doc-duoc.html và _lich-doc-duoc.json');
