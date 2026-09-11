// BẢNG FORM CHUẨN — một dòng một căn, đủ mọi ô mà màn khai căn cần, kèm cột "thiếu gì".
//
// Đây là bản đồ để ngồi khai lại 117 căn: mở bảng ra, lọc theo cột "Việc", gọi chủ nhà
// hỏi đúng thứ đang thiếu, rồi vào màn khai căn điền. Không phải để máy tự điền — mấy ô
// còn trống đều là thứ chỉ chủ nhà mới biết.
//
//   node scripts/bang-khai-can.mjs   -> _form-khai-can.xlsx
import 'dotenv/config';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });

const doc = (f) => { try { return JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8')); } catch { return null; } };
const ro = doc('./du-lieu/ro-hang-goodstay.json') || [];
const roTheoMa = new Map(ro.map((x) => [x.ma, x]));

const can = await db.home.findMany({ where: { desc: { startsWith: 'GOODSTAY' } }, orderBy: { id: 'asc' } });
const demLich = new Map();
for (const r of await db.lichKhoa.groupBy({ by: ['homeId'], where: { nguon: 'SHEET' }, _count: { _all: true } })) {
  demLich.set(r.homeId, r._count._all);
}

const gon = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]/gi, '').toLowerCase();

/** Y HỆT luật trong màn khai căn (CanNhaModal · loBai) — hai bên phải đếm giống nhau. */
function soiLoBai(bai, ten, diaChi) {
  if (!bai) return [];
  const ra = [];
  if (gon(ten).length >= 5 && gon(bai).includes(gon(ten))) ra.push('tên căn');
  const soNha = (String(diaChi || '').match(/\b\d+[A-Za-z]?(\s*\/\s*\d+[A-Za-z]?)*\b/) || [])[0];
  if (soNha && soNha.length >= 2) {
    const re = new RegExp('(^|[^\\d])' + soNha.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*') + '([^\\d]|$)');
    if (re.test(bai)) ra.push('số nhà');
  }
  if ((bai.match(/https?:\/\/\S+/gi) || []).some((u) => /maps|goo\.gl|geo|g\.page/i.test(u))) ra.push('link bản đồ');
  if ((bai.match(/(?:^|[^\d])(0\d{8,10})(?![\d])/g) || []).length) ra.push('số điện thoại');
  return ra;
}

const dong = can.map((c) => {
  const ma = (c.desc.match(/G-\d+/) || [])[0] || '';
  const r = roTheoMa.get(ma) || {};
  const viec = [];

  // ── Lịch: thứ quan trọng nhất, sales nhìn đầu tiên ──
  let lich;
  if (c.lichNguon === 'APP') lich = '① App Sabi';
  else if (c.lichNguon === 'SHEET' && !c.lichLoiTu) lich = `② Sheet · ${demLich.get(c.id) || 0} đêm bận`;
  else if (c.lichNguon === 'SHEET') { lich = '② Sheet nhưng ĐANG LỖI'; viec.push('sửa nối lịch'); }
  else { lich = '④ Chưa nối'; viec.push('nối lịch'); }
  if (c.lichNguon === 'SHEET' && !c.lichSheetCot) viec.push('chốt khối lịch trong bảng');

  // ── Vị trí ──
  let viTri;
  if (c.kmTrungTam == null) { viTri = 'Chưa có'; viec.push('lấy toạ độ'); }
  else if (c.viTriUocChung) { viTri = `≈ ${c.kmTrungTam} km`; viec.push('xin link Maps để km chuẩn'); }
  else viTri = `${c.kmTrungTam} km`;

  // ── Hoa hồng ──
  let hh = '';
  if (c.coCheHoaHong === 'GIA_SAN') {
    hh = `Sàn ${(c.floorPrice || 0).toLocaleString('vi-VN')} + kê ${(c.markupMin || 0).toLocaleString('vi-VN')}`;
    if (!c.floorPrice) viec.push('giá sàn');
    if (!c.markupMin) viec.push('mức kê cho Sales');
  } else if (c.coCheHoaHong === 'PHAN_TRAM') {
    hh = `Bán ${(c.listPrice || 0).toLocaleString('vi-VN')} · HH ${c.commissionPct ?? '?'}%`;
    if (!c.listPrice || c.commissionPct == null) viec.push('giá bán + % hoa hồng');
  } else viec.push('chọn cơ chế hoa hồng');

  // ── Bài chào khách ──
  const lo = soiLoBai(c.salesInfo, c.name, c.address);
  if (!c.salesInfo) viec.push('viết bài chào khách');
  else if (lo.length) viec.push('bài LỘ ' + lo.join('+'));

  // ── Còn lại ──
  if (!c.rules) viec.push('quy định căn');
  if (!c.ward) viec.push('phường');
  if (!c.bedrooms) viec.push('số phòng ngủ');
  if (!(c.amenities || []).length) viec.push('tiện ích');
  if (!(c.coverImages || []).length) viec.push('ảnh bìa');
  if (!c.albumUrl) viec.push('link album');
  if (!c.caretakerPhone) viec.push('SĐT đón khách');
  if (!c.salesTitle) viec.push('tiêu đề bán');
  if (!c.landmark) viec.push('điểm mốc');
  if (!c.parkingFree && !c.parkingFee) viec.push('đậu xe');
  if (!(c.roomNotes || []).length) viec.push('chi tiết phòng');
  if (!c.holidayPrice && !c.floorPriceHoliday) viec.push('giá ngày lễ');

  return {
    ma, ten: c.name, trangThai: c.choTrangThai,
    soViec: viec.length, viec: viec.join(' · '),
    lich, khoiLich: c.lichSheetCot || '', linkLich: c.lichLink || '',
    viTri, phuong: c.ward || '', diaChi: c.address,
    pn: c.bedrooms ?? '', pnDon: c.bedroomsSingle ?? '', pnDoi: c.bedroomsDouble ?? '',
    khachMin: c.minGuests ?? '', khachMax: c.maxGuests,
    giaThuong: c.price, giaCT: c.weekendPrice, giaLe: c.holidayPrice,
    coChe: c.coCheHoaHong === 'GIA_SAN' ? 'B · giá sàn' : c.coCheHoaHong === 'PHAN_TRAM' ? 'A · %' : '',
    hoaHong: hh, keThuong: c.markupMin, keLe: c.markupHoliday,
    soTienIch: (c.amenities || []).length, tienIch: (c.amenities || []).join(' · '),
    dauXe: [c.parkingFree, c.parkingFee].filter(Boolean).join(' / '),
    baiDaiBaoNhieu: c.salesInfo ? c.salesInfo.length : 0, baiLo: lo.join(', '),
    quyDinh: c.rules ? 'có' : '', anhBia: (c.coverImages || []).length, album: c.albumUrl ? 'có' : '',
    sdt: c.caretakerPhone || '', chuNha: r.chuNha || '', sdtChu: r.sdtChu || '', zalo: r.linkZalo || '',
  };
}).sort((a, b) => b.soViec - a.soViec || a.ma.localeCompare(b.ma));

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Khai căn', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
const COT = [
  ['ma', 'Mã', 8], ['ten', 'Tên căn', 26], ['trangThai', 'Chợ', 11],
  ['soViec', 'Việc', 6], ['viec', 'CẦN LÀM GÌ', 64],
  ['lich', 'Lịch', 22], ['khoiLich', 'Khối trong bảng', 20], ['linkLich', 'Link bảng lịch', 12],
  ['viTri', 'Cách trung tâm', 13], ['phuong', 'Phường', 14], ['diaChi', 'Địa chỉ', 30],
  ['pn', 'PN', 4], ['pnDon', 'Đơn', 5], ['pnDoi', 'Đôi', 5], ['khachMin', 'Từ', 4], ['khachMax', 'Tối đa', 6],
  ['giaThuong', 'Giá thường', 12], ['giaCT', 'Cuối tuần', 12], ['giaLe', 'Ngày lễ', 12],
  ['coChe', 'Cơ chế', 11], ['hoaHong', 'Hoa hồng', 26], ['keThuong', 'Kê thường', 11], ['keLe', 'Kê lễ', 10],
  ['soTienIch', 'SL tiện ích', 10], ['tienIch', 'Tiện ích', 34], ['dauXe', 'Đậu xe', 22],
  ['baiDaiBaoNhieu', 'Bài (ký tự)', 11], ['baiLo', 'Bài LỘ gì', 22], ['quyDinh', 'Quy định', 9],
  ['anhBia', 'Ảnh bìa', 8], ['album', 'Album', 7], ['sdt', 'SĐT đón khách', 14],
  ['chuNha', 'Chủ nhà', 16], ['sdtChu', 'SĐT chủ', 13], ['zalo', 'Zalo', 8],
];
ws.columns = COT.map(([key, header, width]) => ({ key, header, width }));
const h = ws.getRow(1);
h.font = { bold: true, color: { argb: 'FFFFFDF9' } };
h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B4F2A' } };
h.alignment = { vertical: 'middle', wrapText: true };
h.height = 26;

for (const d of dong) {
  const r = ws.addRow(d);
  for (const k of ['giaThuong', 'giaCT', 'giaLe', 'keThuong', 'keLe']) r.getCell(k).numFmt = '#,##0';
  for (const k of ['linkLich', 'zalo']) {
    const o = r.getCell(k);
    if (o.value) { o.value = { text: 'mở', hyperlink: String(o.value) }; o.font = { color: { argb: 'FF0563C1' }, underline: true }; }
  }
  // Càng nhiều việc càng đậm — nhìn phát biết nên gọi ai trước.
  const m = d.soViec >= 6 ? 'FFF4D5CE' : d.soViec >= 3 ? 'FFFAECD8' : d.soViec >= 1 ? 'FFF1F4EC' : 'FFE4EDE3';
  r.getCell('soViec').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: m } };
  r.getCell('soViec').alignment = { horizontal: 'center' };
  r.getCell('lich').font = { color: { argb: /LỖI|Chưa nối/.test(d.lich) ? 'FFB4553F' : 'FF3C5843' } };
  if (d.baiLo) r.getCell('baiLo').font = { color: { argb: 'FFB4553F' }, bold: true };
  if (!d.quyDinh) r.getCell('quyDinh').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4D5CE' } };
  if (!d.anhBia) r.getCell('anhBia').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4D5CE' } };
}
ws.autoFilter = { from: 'A1', to: { row: 1, column: COT.length } };

// ───── Trang 2: đếm xem cả rổ đang thiếu gì ─────
const w2 = wb.addWorksheet('Tổng kết');
w2.columns = [{ key: 'x', header: 'Hạng mục', width: 34 }, { key: 'co', header: 'Đã có', width: 9 }, { key: 'thieu', header: 'Còn thiếu', width: 11 }];
w2.getRow(1).font = { bold: true, color: { argb: 'FFFFFDF9' } };
w2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B4F2A' } };
const N = dong.length;
const dem = (f) => dong.filter(f).length;
for (const [x, n] of [
  ['Lịch đang chạy', dem((d) => /②|①/.test(d.lich) && !/LỖI/.test(d.lich))],
  ['Vị trí chuẩn (không ước chừng)', dem((d) => /^\d/.test(d.viTri))],
  ['Có phường', dem((d) => d.phuong)], ['Có số phòng ngủ', dem((d) => d.pn !== '')],
  ['Có giá ngày lễ', dem((d) => d.giaLe)], ['Có cơ chế hoa hồng', dem((d) => d.coChe)],
  ['Có tiện ích', dem((d) => d.soTienIch > 0)], ['Có đậu xe', dem((d) => d.dauXe)],
  ['Có bài chào khách', dem((d) => d.baiDaiBaoNhieu > 0)], ['Bài KHÔNG lộ thông tin', dem((d) => d.baiDaiBaoNhieu > 0 && !d.baiLo)],
  ['Có quy định căn', dem((d) => d.quyDinh)], ['Có ảnh bìa', dem((d) => d.anhBia > 0)],
  ['Có link album', dem((d) => d.album)], ['Có SĐT đón khách', dem((d) => d.sdt)],
  ['Có chi tiết từng phòng', dem((d) => !/chi tiết phòng/.test(d.viec))],
]) w2.addRow({ x, co: n, thieu: N - n });
w2.addRow({});
w2.addRow({ x: `TỔNG ${N} căn · sạch hết: ${dem((d) => d.soViec === 0)} · 1-2 việc: ${dem((d) => d.soViec >= 1 && d.soViec < 3)} · 3-5 việc: ${dem((d) => d.soViec >= 3 && d.soViec < 6)} · từ 6 việc: ${dem((d) => d.soViec >= 6)}` });

await wb.xlsx.writeFile('_form-khai-can.xlsx');
console.log(`${N} căn · sạch hết ${dem((d) => d.soViec === 0)} · 1-2 việc ${dem((d) => d.soViec >= 1 && d.soViec < 3)} · 3-5 việc ${dem((d) => d.soViec >= 3 && d.soViec < 6)} · từ 6 việc ${dem((d) => d.soViec >= 6)}`);
console.log('Đã ghi _form-khai-can.xlsx');
await db.$disconnect();
