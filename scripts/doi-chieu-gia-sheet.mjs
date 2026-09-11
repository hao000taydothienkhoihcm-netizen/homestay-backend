// ĐỐI CHIẾU GIÁ: bảng lịch của chính chủ nhà  vs  con số đang nằm trong chợ.
//
// Vì sao cần: rổ hàng GOODSTAY là bản chép lại của một bên tổng hợp. Qua mỗi lần chép,
// giá thu về bị cộng thêm phần của bên đó, còn mức cho kê thì bị cắt bớt. Kết quả là chợ
// báo một con số không phải ý chủ nhà — Chú Cuội bảng ghi thu về 1.600.000 + cho kê 500.000,
// chợ hiện sàn 1.800.000 + kê 300.000; riêng ngày lễ chợ hét 4.100.000 trong khi chủ nhà
// chỉ định bán 3.500.000. Sales chào giá đó là mất khách.
//
// Bảng của chủ nhà là NGUỒN GỐC: cột "Giá thu về" từng đêm + dòng băng-rôn ghi luật kê.
//
//   node scripts/doi-chieu-gia-sheet.mjs         -> báo cáo, KHÔNG ghi
//   node scripts/doi-chieu-gia-sheet.mjs --ghi   -> sửa vào NHÁNH THỬ
import 'dotenv/config';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { taiVaDoc, chonTab, docTab, idBangTinh, luatKeCuaTab } from '../src/lib/lich-sheet.js';

const GHI = process.argv.includes('--ghi');
const SO_THANG = 3;
const url = process.env.DATABASE_URL_THU;
if (!url) { console.error('✕ Thiếu DATABASE_URL_THU'); process.exit(1); }
const host = (u) => (u.match(/@([^/]+)/) || [, '?'])[1];
if (host(url) === host(process.env.DATABASE_URL || '')) { console.error('✕ Cùng endpoint với production. Dừng.'); process.exit(1); }
const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });

const F_MAU = new URL('./du-lieu/luat-mau.json', import.meta.url);
const LUAT_MAU = fs.existsSync(F_MAU) ? JSON.parse(fs.readFileSync(F_MAU, 'utf8')) : {};
const luatCua = (id) => {
  const x = LUAT_MAU[id]; if (!x) return null;
  const ra = {}; for (const [k, v] of Object.entries(x)) if (!k.startsWith('_')) ra[k] = v;
  return ra;
};
const F_LINK = new URL('./du-lieu/link-lich-goodstay.json', import.meta.url);
const linkTheoMa = new Map(JSON.parse(fs.readFileSync(F_LINK, 'utf8')).map((x) => [x.ma, x.link.booking]));

const DEM_CT = { T6_T7: [5, 6], T6_T7_CN: [5, 6, 0], T7_CN: [6, 0], T7: [6] };
const le = await db.holiday.findMany({ select: { startDate: true, endDate: true } });
const laLe = (s) => le.some((h) => s >= h.startDate.toISOString().slice(0, 10) && s <= h.endDate.toISOString().slice(0, 10));

/** Mức HAY GẶP NHẤT, không phải trung bình: bảng thật có đêm khuyến mãi, đêm gõ nhầm. */
const hayGap = (ds) => {
  const d = new Map();
  for (const x of ds) if (x) d.set(x, (d.get(x) || 0) + 1);
  if (!d.size) return null;
  const [gt, n] = [...d].sort((a, b) => b[1] - a[1])[0];
  return { gia: gt, lan: n, tong: ds.filter(Boolean).length };
};

const thangCanDoc = [];
{
  const d = new Date();
  for (let i = 0; i < SO_THANG; i++) { thangCanDoc.push({ m: d.getUTCMonth() + 1, y: d.getUTCFullYear() }); d.setUTCMonth(d.getUTCMonth() + 1); }
}

const canDb = await db.home.findMany({
  where: { desc: { startsWith: 'GOODSTAY' }, choTrangThai: 'DANG_BAN', coCheHoaHong: 'GIA_SAN' },
  orderBy: { id: 'asc' },
});
const theoBang = new Map();
for (const c of canDb) {
  const ma = (c.desc.match(/G-\d+/) || [])[0];
  const id = idBangTinh(c.lichLink || (ma ? linkTheoMa.get(ma) : '') || '');
  if (!id) continue;
  if (!theoBang.has(id)) theoBang.set(id, []);
  theoBang.get(id).push({ ...c, ma });
}
console.log(`${canDb.length} căn cơ chế giá sàn · ${theoBang.size} bảng tính\n`);

const bc = [];
let i = 0;
for (const [idBang, ds] of theoBang) {
  i++;
  let wb = null;
  try { wb = await taiVaDoc(idBang); } catch { /* bảng chưa mở chia sẻ */ }
  if (!wb) { console.log(`${String(i).padStart(3)}/${theoBang.size} ${idBang.slice(0, 10)} ✕ không mở được`); continue; }

  const tabs = [];
  for (const t of thangCanDoc) { const ch = chonTab(wb, t.m, t.y); if (ch) tabs.push(ch.w); }
  if (!tabs.length) { console.log(`${String(i).padStart(3)}/${theoBang.size} ${idBang.slice(0, 10)} ✕ không có tab tháng nào`); continue; }

  // Luật kê: quét cả 3 tab, lấy dòng đầu tiên bóc được.
  let luat = null;
  for (const w of tabs) { luat = luatKeCuaTab(w); if (luat) break; }

  // BĂNG-RÔN CÓ THỂ CHỈ NÓI VỀ VÀI CĂN, không phải cả bảng:
  //   "NCB 01,02 kê ko quá 500k/ đêm"  — bảng này có 18 căn, luật chỉ cho 2 căn.
  // Áp cho cả bảng là gán sai mức kê cho 16 căn còn lại. Nên: nếu trong câu có nhắc
  // tên một khối nào đó của chính bảng này, thì luật chỉ dành cho những khối được nhắc.
  let rieng = null;
  if (luat) {
    const tenKhoi = new Set();
    for (const w of tabs) for (const k of docTab(w, w.name, luatCua(idBang))) if (k.ten) tenKhoi.add(k.ten);
    // So theo TỪNG TỪ chứ không so cả cụm: băng-rôn viết tắt "NCB 01,02" còn tên khối
    // đầy đủ là "NCB 01 (Căn trước)" — so nguyên cụm thì không bao giờ khớp.
    // Hai từ trùng trở lên mới tính là có nhắc tên (một từ "NCB" thì căn NCB 03 cũng dính).
    const tu = (x) => new Set(String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2));
    const cau = tu(luat.nguyenVan);
    const nhac = [...tenKhoi].filter((n) => [...tu(n)].filter((w) => cau.has(w)).length >= 2);
    if (nhac.length) rieng = new Set(nhac);
  }
  console.log(`${String(i).padStart(3)}/${theoBang.size} ${idBang.slice(0, 10)} · ${ds.length} căn · luật kê: ${luat ? `thường ${luat.thuong ?? '—'} lễ ${luat.le ?? '—'}${rieng ? ` [CHỈ cho ${[...rieng].join(', ')}]` : ''}  ← "${luat.nguyenVan.slice(0, 70)}"` : 'bảng không ghi'}`);

  for (const can of ds) {
    const ten = can.lichSheetCot;
    const gomCT = DEM_CT[can.cuoiTuanGom] || DEM_CT.T6_T7_CN;
    const thuong = [], ct = [], leGia = [];
    let thayKhoi = false;
    for (const w of tabs) {
      const khoi = docTab(w, w.name, luatCua(idBang));
      const k = ten ? khoi.find((x) => x.ten === ten) : null;
      if (!k) continue;
      thayKhoi = true;
      for (const n of k.ngay) {
        if (laLe(n.ngay)) leGia.push(n.gia);
        else (gomCT.includes(new Date(n.ngay + 'T00:00:00Z').getUTCDay()) ? ct : thuong).push(n.gia);
      }
    }
    if (!thayKhoi) { bc.push({ ...can, boQua: ten ? 'không thấy khối trong bảng' : 'chưa chốt khối lịch' }); continue; }
    bc.push({
      ...can,
      sheetThuong: hayGap(thuong), sheetCT: hayGap(ct), sheetLe: hayGap(leGia),
      ...(luat && (!rieng || rieng.has(ten))
        ? { luatThuong: luat.thuong ?? null, luatLe: luat.le ?? null, luatChu: luat.nguyenVan }
        : { luatThuong: null, luatLe: null, luatChu: rieng ? `(băng-rôn chỉ nói về ${[...rieng].join(', ')}) ${luat.nguyenVan}` : null }),
    });
  }
}

// ───── Báo cáo ─────
const t = (x) => (x == null ? '—' : x.toLocaleString('vi-VN'));
const lech = (a, b) => a != null && b != null && a !== b;
const co = bc.filter((x) => !x.boQua);
const saiSan = co.filter((x) => lech(x.sheetThuong?.gia, x.floorPrice) || lech(x.sheetCT?.gia, x.floorPriceWeekend));
const saiKe = co.filter((x) => lech(x.luatThuong, x.markupMin) || lech(x.luatLe, x.markupHoliday));
const coLuat = co.filter((x) => x.luatThuong != null || x.luatLe != null);

console.log(`\n══ ${co.length} căn đối chiếu được · ${bc.length - co.length} căn bỏ qua ══`);
console.log(`Bảng có ghi luật kê: ${coLuat.length} căn`);
console.log(`Giá sàn lệch bảng  : ${saiSan.length} căn`);
console.log(`Mức kê lệch bảng   : ${saiKe.length} căn`);

// GIÁ LỄ: không đối chiếu được nếu kho chưa khai kỳ lễ nào rơi vào 3 tháng đang đọc.
// Đây không phải lỗi vặt: kho trống ngày lễ thì CHỢ CŨNG không biết đêm nào là lễ,
// nên đêm Tết vẫn đang tính giá cuối tuần, và cột "giá lễ" trên màn sales chỉ là con
// số nằm đó chứ không bao giờ được dùng.
const leTrong3Thang = le.filter((h) => {
  const a = h.startDate.toISOString().slice(0, 10), b = h.endDate.toISOString().slice(0, 10);
  return thangCanDoc.some((t) => { const k = `${t.y}-${String(t.m).padStart(2, '0')}`; return a.slice(0, 7) <= k && b.slice(0, 7) >= k; });
});
const soLeSau = co.filter((x) => x.sheetLe).length;
console.log(`Giá lễ đối chiếu   : ${soLeSau} căn` + (leTrong3Thang.length ? '' : `  ⚠ kho chưa khai kỳ lễ nào trong ${thangCanDoc.map((t) => t.m + '/' + t.y).join(', ')} — không có đêm nào để so, và chợ cũng đang tính đêm lễ như đêm thường`));

console.log('\n── Lệch giá sàn (bảng chủ nhà ≠ chợ) ──');
for (const x of saiSan.slice(0, 40)) {
  const d = [];
  if (lech(x.sheetThuong?.gia, x.floorPrice)) d.push(`thường ${t(x.floorPrice)} -> ${t(x.sheetThuong.gia)} (gặp ${x.sheetThuong.lan}/${x.sheetThuong.tong} đêm)`);
  if (lech(x.sheetCT?.gia, x.floorPriceWeekend)) d.push(`CT ${t(x.floorPriceWeekend)} -> ${t(x.sheetCT.gia)} (gặp ${x.sheetCT.lan}/${x.sheetCT.tong})`);
  console.log(`  ${x.ma} ${x.name.slice(0, 24).padEnd(24)} ${d.join(' · ')}`);
}
console.log('\n── Lệch mức kê ──');
for (const x of saiKe.slice(0, 40)) {
  const d = [];
  if (lech(x.luatThuong, x.markupMin)) d.push(`kê thường ${t(x.markupMin)} -> ${t(x.luatThuong)}`);
  if (lech(x.luatLe, x.markupHoliday)) d.push(`kê lễ ${t(x.markupHoliday)} -> ${t(x.luatLe)}`);
  console.log(`  ${x.ma} ${x.name.slice(0, 24).padEnd(24)} ${d.join(' · ')}`);
}

// ───── Xuất bảng cho người đọc ─────
const wbr = new ExcelJS.Workbook();
const ws = wbr.addWorksheet('Đối chiếu giá', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
ws.columns = [
  { key: 'ma', header: 'Mã', width: 8 }, { key: 'ten', header: 'Tên căn', width: 26 },
  { key: 'sanCho', header: 'Sàn thường (chợ)', width: 15 }, { key: 'sanSheet', header: 'Sàn thường (bảng)', width: 16 },
  { key: 'ctCho', header: 'Sàn CT (chợ)', width: 13 }, { key: 'ctSheet', header: 'Sàn CT (bảng)', width: 14 },
  { key: 'keCho', header: 'Kê thường (chợ)', width: 14 }, { key: 'keSheet', header: 'Kê thường (bảng)', width: 15 },
  { key: 'keLeCho', header: 'Kê lễ (chợ)', width: 12 }, { key: 'keLeSheet', header: 'Kê lễ (bảng)', width: 13 },
  { key: 'banCu', header: 'Giá bán đang hiện', width: 16 }, { key: 'banMoi', header: 'Giá bán đúng bảng', width: 16 },
  { key: 'luat', header: 'Nguyên văn luật kê trong bảng', width: 62 }, { key: 'ghi', header: 'Ghi chú', width: 26 },
];
ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFDF9' } };
ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B4F2A' } };
ws.getRow(1).height = 24;
for (const x of bc) {
  const sanMoi = x.sheetThuong?.gia ?? x.floorPrice, keMoi = x.luatThuong ?? x.markupMin;
  const r = ws.addRow({
    ma: x.ma, ten: x.name,
    sanCho: x.floorPrice, sanSheet: x.sheetThuong?.gia ?? null,
    ctCho: x.floorPriceWeekend, ctSheet: x.sheetCT?.gia ?? null,
    keCho: x.markupMin, keSheet: x.luatThuong, keLeCho: x.markupHoliday, keLeSheet: x.luatLe,
    banCu: (x.floorPrice || 0) + (x.markupMin || 0), banMoi: (sanMoi || 0) + (keMoi || 0),
    luat: x.luatChu || '', ghi: x.boQua || '',
  });
  for (const k of ['sanCho', 'sanSheet', 'ctCho', 'ctSheet', 'keCho', 'keSheet', 'keLeCho', 'keLeSheet', 'banCu', 'banMoi']) r.getCell(k).numFmt = '#,##0';
  for (const [a, b] of [['sanCho', 'sanSheet'], ['ctCho', 'ctSheet'], ['keCho', 'keSheet'], ['keLeCho', 'keLeSheet']]) {
    if (lech(r.getCell(b).value, r.getCell(a).value)) {
      r.getCell(a).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4D5CE' } };
      r.getCell(b).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EDE3' } };
    }
  }
}
ws.autoFilter = { from: 'A1', to: { row: 1, column: 14 } };
await wbr.xlsx.writeFile('_doi-chieu-gia.xlsx');
console.log('\nĐã ghi _doi-chieu-gia.xlsx');

// Chỉ sửa giá sàn khi BẰNG CHỨNG ĐỦ MẠNH: mức đó phải lặp lại ít nhất 8 đêm và chiếm
// từ 60% số đêm có giá. Bảng thật có đêm khuyến mãi, đêm gõ nhầm, đêm bán cho người quen —
// thấy "gặp 2/2 đêm" mà đi sửa giá cả căn là lấy cái ngoại lệ làm luật.
const chacChan = (h) => h && h.lan >= 8 && h.lan / h.tong >= 0.6;
const yeu = co.filter((x) => (lech(x.sheetThuong?.gia, x.floorPrice) && !chacChan(x.sheetThuong))
  || (lech(x.sheetCT?.gia, x.floorPriceWeekend) && !chacChan(x.sheetCT)));
console.log(`\n(${yeu.length} căn có lệch nhưng bằng chứng mỏng — chỉ báo, KHÔNG tự sửa: ${yeu.map((x) => x.ma).join(' ')})`);

if (GHI) {
  // Đọc 21 bảng tính mất cả chục phút; trong lúc đó Neon đóng kết nối rảnh.
  // Nối lại trước khi ghi, không thì cả mẻ sửa rơi hết ở dòng đầu tiên.
  try { await db.$disconnect(); } catch { /* kệ */ }
  await db.$connect();
  let n = 0;
  for (const x of co) {
    const d = {};
    if (lech(x.sheetThuong?.gia, x.floorPrice) && chacChan(x.sheetThuong)) { d.floorPrice = x.sheetThuong.gia; d.price = x.sheetThuong.gia; }
    if (lech(x.sheetCT?.gia, x.floorPriceWeekend) && chacChan(x.sheetCT)) { d.floorPriceWeekend = x.sheetCT.gia; d.weekendPrice = x.sheetCT.gia; }
    if (lech(x.luatThuong, x.markupMin)) { d.markupMin = x.luatThuong; d.markupMax = x.luatThuong; }
    if (lech(x.luatLe, x.markupHoliday)) d.markupHoliday = x.luatLe;
    if (!Object.keys(d).length) continue;
    try {
      await db.home.update({ where: { id: x.id }, data: d });
    } catch {
      await db.$connect();                       // đứt giữa chừng thì nối lại, thử đúng một lần nữa
      await db.home.update({ where: { id: x.id }, data: d });
    }
    n++;
  }
  console.log(`Đã sửa ${n} căn theo bảng của chủ nhà.`);
} else console.log('Thêm --ghi để sửa thật.');
await db.$disconnect();
