// Bảng "căn nào còn thiếu gì" — để chủ nhà đi bổ sung, không phải đoán.
// Gộp ba nguồn: rổ hàng gom được, kết quả ghép lịch, và dữ liệu đang nằm trong chợ.
//
//   node scripts/can-thieu-thong-tin.mjs   -> _can-thieu.xlsx
import 'dotenv/config';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });

const ro = JSON.parse(fs.readFileSync(new URL('./du-lieu/ro-hang-goodstay.json', import.meta.url), 'utf8'));
const ghep = fs.existsSync('_ghep-lich.json') ? JSON.parse(fs.readFileSync('_ghep-lich.json', 'utf8')).baoCao : [];
const ghepTheoMa = new Map(ghep.map((x) => [x.ma, x]));

const can = await db.home.findMany({
  where: { desc: { startsWith: 'GOODSTAY' } },
  select: {
    id: true, name: true, desc: true, ward: true, bedrooms: true, maxGuests: true,
    kmTrungTam: true, viTriUocChung: true, lat: true, amenities: true,
    floorPrice: true, floorPriceWeekend: true, floorPriceHoliday: true,
    lichNguon: true, lichDongBoLuc: true,
  },
});
const dbTheoMa = new Map(can.map((c) => [(c.desc.match(/G-\d+/) || [])[0], c]));

const LY_DO_GON = {
  'Bảng chưa mở chia sẻ "bất kỳ ai có link đều xem được"': 'Bảng chưa mở chia sẻ',
  'Không ghép được tên căn với khối nào trong bảng': 'Tên căn không khớp bảng',
  'Không nhận ra bảng lịch trong tab nào': 'Bố cục bảng chưa đọc được',
};

const dong = ro.map((x) => {
  const g = ghepTheoMa.get(x.ma);
  const c = dbTheoMa.get(x.ma);
  const viec = [];

  // ── Lịch ──
  let lich;
  if (g && !g.loi && ['chac', 'kha', 'tay'].includes(g.doChac)) lich = `Đang chạy · ${g.dem} đêm bận`;
  else if (g && !g.loi && g.doChac === 'mo') { lich = 'Chờ bạn duyệt tên'; viec.push('duyệt tên căn trong bảng lịch'); }
  else if (g && g.loi) {
    lich = LY_DO_GON[g.loi] || g.loi;
    if (/chia sẻ/.test(g.loi)) viec.push('xin chủ nhà mở chia sẻ bảng');
    else if (/ghép/.test(g.loi)) viec.push('chỉ giúp căn này ứng với tên nào trong bảng');
    else viec.push('bảng lịch bố cục lạ, cần xem tay');
  } else { lich = 'Chưa nối'; viec.push('nối lịch'); }

  // ── Vị trí ──
  let viTri;
  if (!c || c.kmTrungTam == null) { viTri = 'Chưa có'; viec.push('lấy toạ độ'); }
  else if (c.viTriUocChung) { viTri = `≈ ${c.kmTrungTam} km (máy dò)`; viec.push('xin link Google Maps để có km chuẩn'); }
  else viTri = `${c.kmTrungTam} km`;

  // ── Link ──
  const thieuLink = [];
  if (!x.linkMaps) thieuLink.push('Maps');
  if (!x.linkAnh) thieuLink.push('ảnh');
  if (!x.linkZalo) thieuLink.push('Zalo');
  if (thieuLink.length) viec.push('xin link ' + thieuLink.join(', '));

  // ── Giá theo loại đêm ──
  const thieuGia = [];
  if (!x.giaCuoiTuan) thieuGia.push('cuối tuần');
  if (!x.giaLe) thieuGia.push('lễ');
  if (thieuGia.length) viec.push('hỏi giá ' + thieuGia.join(' + '));

  // ── Quy mô & tiện ích ──
  const soTienIch = c ? (c.amenities || []).length : 0;
  if (!x.phongNgu) viec.push('hỏi số phòng ngủ');
  if (!x.phuong) viec.push('hỏi phường');
  if (soTienIch <= 1) viec.push('khai tiện ích (đang gần như trống)');

  return {
    ma: x.ma,
    ten: x.ten,
    soViec: viec.length,
    canLam: viec.join(' · '),
    lich,
    viTri,
    thieuLink: thieuLink.join(', '),
    thieuGia: thieuGia.join(', '),
    phongNgu: x.phongNgu ?? '',
    khach: x.toiDaKhach ?? '',
    phuong: x.phuong,
    soTienIch,
    giaThuong: x.giaThuong ?? null,
    chuNha: x.chuNha,
    sdtChu: x.sdtChu,
    linkZalo: x.linkZalo,
    linkBooking: x.linkBooking,
  };
}).sort((a, b) => b.soViec - a.soViec || a.ma.localeCompare(b.ma));

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Cần bổ sung', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
const COT = [
  ['ma', 'Mã', 8], ['ten', 'Tên căn', 28], ['soViec', 'Số việc', 8],
  ['canLam', 'Cần làm gì', 58], ['lich', 'Lịch', 24], ['viTri', 'Vị trí', 18],
  ['thieuLink', 'Thiếu link', 14], ['thieuGia', 'Thiếu giá', 14],
  ['phongNgu', 'PN', 5], ['khach', 'Khách', 6], ['phuong', 'Phường', 16],
  ['soTienIch', 'Tiện ích', 9], ['giaThuong', 'Giá thường', 12],
  ['chuNha', 'Chủ nhà', 14], ['sdtChu', 'SĐT', 13], ['linkZalo', 'Zalo', 10], ['linkBooking', 'Bảng lịch', 10],
];
ws.columns = COT.map(([key, header, width]) => ({ key, header, width }));
const h = ws.getRow(1);
h.font = { bold: true, color: { argb: 'FFFFFDF9' } };
h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B4F2A' } };
h.height = 22;

for (const d of dong) {
  const r = ws.addRow(d);
  r.getCell('giaThuong').numFmt = '#,##0';
  for (const k of ['linkZalo', 'linkBooking']) {
    const o = r.getCell(k);
    if (o.value) { o.value = { text: 'mở', hyperlink: String(o.value) }; o.font = { color: { argb: 'FF0563C1' }, underline: true }; }
  }
  // Càng nhiều việc càng đậm — nhìn phát biết nên gọi ai trước.
  const m = d.soViec >= 4 ? 'FFF4D5CE' : d.soViec >= 2 ? 'FFFAECD8' : d.soViec === 1 ? 'FFF1F4EC' : 'FFE4EDE3';
  r.getCell('soViec').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: m } };
  r.getCell('soViec').alignment = { horizontal: 'center' };
  if (/Đang chạy/.test(d.lich)) r.getCell('lich').font = { color: { argb: 'FF3C5843' } };
  else r.getCell('lich').font = { color: { argb: 'FFB4553F' } };
}
ws.autoFilter = { from: 'A1', to: { row: 1, column: COT.length } };

await wb.xlsx.writeFile('_can-thieu.xlsx');

const dem = (f) => dong.filter(f).length;
console.log(`${dong.length} căn · không thiếu gì: ${dem((x) => x.soViec === 0)} · thiếu 1 việc: ${dem((x) => x.soViec === 1)} · 2-3 việc: ${dem((x) => x.soViec >= 2 && x.soViec < 4)} · từ 4 việc: ${dem((x) => x.soViec >= 4)}`);
console.log(`Lịch đang chạy: ${dem((x) => /Đang chạy/.test(x.lich))} · chờ duyệt tên: ${dem((x) => /duyệt/.test(x.lich))} · tên không khớp: ${dem((x) => /không khớp/.test(x.lich))} · bảng chưa chia sẻ: ${dem((x) => /chia sẻ/.test(x.lich))}`);
console.log(`Vị trí chuẩn: ${dem((x) => /^\d/.test(x.viTri))} · ước chừng: ${dem((x) => x.viTri.startsWith('≈'))} · chưa có: ${dem((x) => x.viTri === 'Chưa có')}`);
console.log('Đã ghi _can-thieu.xlsx');
await db.$disconnect();
