// Gom toàn bộ rổ hàng GOODSTAY thành MỘT bảng dùng được: mỗi căn một dòng,
// đủ giá · quy mô · vị trí · chủ nhà · 4 đường link · bài giới thiệu.
//
// Nguồn ghép từ hai chỗ trong cùng bảng tính GOODSTAY:
//   · tab GIÁ (đã bóc sẵn ra scripts/du-lieu/can-goodstay.json): giá, km, phòng, tiện ích, chủ nhà
//   · tab DANH BẠ (gid 1851932432): tên, bài giới thiệu, link booking / Zalo / ảnh / maps
// Khoá ghép là MÃ G-xxx.
//
//   node scripts/gom-ro-hang.mjs
//     -> scripts/du-lieu/ro-hang-goodstay.json  (máy đọc)
//     -> _ro-hang-goodstay.xlsx                 (người đọc)
//
// ⚠ File này có TÊN + SỐ ĐIỆN THOẠI của ~69 chủ nhà bên thứ ba và link nhóm Zalo của họ.
// Thư mục scripts/du-lieu/ đã bị gitignore — đừng đưa lên git, đừng gửi ra ngoài.
import fs from 'node:fs';
import ExcelJS from 'exceljs';

const ID = '1OMYcVyyq-VtIPBF7T8oNsLdDTIqP0Hg4u5tc-UVLZTM';
const GID_DANH_BA = '1851932432';

function tachCsv(s) {
  const hang = []; let o = '', d = [], trong = false;
  for (let i = 0; i < s.length; i++) {
    const k = s[i];
    if (trong) { if (k === '"') { if (s[i + 1] === '"') { o += '"'; i++; } else trong = false; } else o += k; }
    else if (k === '"') trong = true;
    else if (k === ',') { d.push(o); o = ''; }
    else if (k === '\n') { d.push(o); hang.push(d); d = []; o = ''; }
    else if (k !== '\r') o += k;
  }
  if (o || d.length) { d.push(o); hang.push(d); }
  return hang;
}

console.log('Tải tab danh bạ…');
const r = await fetch(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=${GID_DANH_BA}`);
if (!r.ok) { console.error('✕ Không tải được, HTTP', r.status); process.exit(1); }
const h = tachCsv(await r.text());
const rong = Math.max(...h.map((x) => x.length));

// Danh bạ xếp các căn theo chiều ngang, mỗi căn chiếm 3 cột: mã | giá trị | trống.
const danhBa = new Map();
for (let c = 0; c + 1 < rong; c += 3) {
  for (let r0 = 0; r0 < h.length; r0++) {
    const ma = (h[r0][c] || '').trim();
    if (!/^G-\d+$/.test(ma)) continue;
    const x = { ma, ten: (h[r0][c + 1] || '').trim(), gioiThieu: '', link: {} };
    for (let k = r0 + 1; k < h.length; k++) {
      const nhan = (h[k][c] || '').trim();
      const gt = (h[k][c + 1] || '').trim();
      if (/^G-\d+$/.test(nhan)) break;
      if (!nhan && !gt) continue;
      // Dòng ngay dưới tên, không có nhãn: đó là bài giới thiệu dài.
      if (!nhan && gt.length > 40 && !x.gioiThieu) { x.gioiThieu = gt; continue; }
      const laLink = /^https?:\/\//i.test(gt);
      if (/booking/i.test(nhan)) x.link.booking = laLink ? gt : null;
      else if (/zalo/i.test(nhan)) x.link.zalo = laLink ? gt : null;
      else if (/ảnh|anh/i.test(nhan)) x.link.anh = laLink ? gt : null;
      else if (/maps/i.test(nhan)) x.link.maps = laLink ? gt : null;
    }
    danhBa.set(ma, x);
  }
}
console.log(`Danh bạ: ${danhBa.size} căn`);

const F_GIA = new URL('./du-lieu/can-goodstay.json', import.meta.url);
const dsGia = fs.existsSync(F_GIA) ? JSON.parse(fs.readFileSync(F_GIA, 'utf8')) : [];
const theoMa = new Map(dsGia.map((x) => [x.ma, x]));
console.log(`Tab giá   : ${dsGia.length} căn`);

// ───── Ghép ─────
const maTatCa = [...new Set([...danhBa.keys(), ...theoMa.keys()])]
  .sort((a, b) => +a.slice(2) - +b.slice(2));

const ro = maTatCa.map((ma) => {
  const d = danhBa.get(ma) || { ten: '', gioiThieu: '', link: {} };
  const g = theoMa.get(ma) || {};
  return {
    ma,
    ten: g.ten || d.ten || '',
    loai: g.loai || '',
    phongNgu: g.bedrooms ?? null,
    toiDaKhach: g.maxGuests ?? null,
    kmTrungTam: g.km ?? null,
    phuong: g.phuong || '',
    duong: [g.soNha, g.duong].filter(Boolean).join(' '),
    diaChi: g.diaChi || '',
    giaThuong: g.giaHostThuong ?? null,
    giaCuoiTuan: g.giaHostCT ?? null,
    giaLe: g.giaHostLe ?? null,
    coChe: g.coChe || '',
    keToiThieu: g.markupMin ?? null,
    keNgayLe: g.markupHoliday ?? null,
    tienIch: (g.tienIch || []).join(' · '),
    chuNha: g.chuNha || '',
    sdtChu: g.sdtChu || '',
    linkBooking: d.link.booking || '',
    linkZalo: d.link.zalo || '',
    linkAnh: d.link.anh || '',
    linkMaps: d.link.maps || '',
    gioiThieu: d.gioiThieu || '',
    coCaHaiNguon: danhBa.has(ma) && theoMa.has(ma),
  };
});

const dem = (f) => ro.filter((x) => x[f]).length;
console.log(`\nTổng ${ro.length} căn · có cả hai nguồn: ${ro.filter((x) => x.coCaHaiNguon).length}`);
console.log(`  link booking ${dem('linkBooking')} · Zalo ${dem('linkZalo')} · ảnh ${dem('linkAnh')} · maps ${dem('linkMaps')}`);
console.log(`  có giá ${ro.filter((x) => x.giaThuong).length} · có km ${ro.filter((x) => x.kmTrungTam != null).length} · có bài giới thiệu ${dem('gioiThieu')}`);

fs.mkdirSync('scripts/du-lieu', { recursive: true });
fs.writeFileSync('scripts/du-lieu/ro-hang-goodstay.json', JSON.stringify(ro, null, 1), 'utf8');

// ───── Xuất bảng cho người đọc ─────
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Rổ hàng', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
const COT = [
  ['ma', 'Mã', 8], ['ten', 'Tên căn', 30], ['loai', 'Loại', 11],
  ['phongNgu', 'PN', 5], ['toiDaKhach', 'Khách', 6], ['kmTrungTam', 'Km', 6],
  ['phuong', 'Phường', 16], ['duong', 'Đường', 22],
  ['giaThuong', 'Giá thường', 12], ['giaCuoiTuan', 'Cuối tuần', 12], ['giaLe', 'Lễ', 12],
  ['coChe', 'Cơ chế', 10], ['keToiThieu', 'Kê từ', 10], ['keNgayLe', 'Kê lễ', 10],
  ['tienIch', 'Tiện ích', 18], ['chuNha', 'Chủ nhà', 14], ['sdtChu', 'SĐT', 13],
  ['linkBooking', 'Link lịch booking', 34], ['linkZalo', 'Link Zalo', 26],
  ['linkAnh', 'Link ảnh', 26], ['linkMaps', 'Link Maps', 26],
  ['gioiThieu', 'Bài giới thiệu', 60],
];
ws.columns = COT.map(([key, header, width]) => ({ key, header, width }));
ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFDF9' } };
ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B4F2A' } };
ws.getRow(1).alignment = { vertical: 'middle' };
ws.getRow(1).height = 22;

for (const x of ro) {
  const d = ws.addRow(x);
  for (const k of ['giaThuong', 'giaCuoiTuan', 'giaLe', 'keToiThieu', 'keNgayLe']) {
    d.getCell(k).numFmt = '#,##0';
  }
  for (const k of ['linkBooking', 'linkZalo', 'linkAnh', 'linkMaps']) {
    const o = d.getCell(k);
    if (o.value) { o.value = { text: 'mở', hyperlink: String(o.value) }; o.font = { color: { argb: 'FF0563C1' }, underline: true }; }
  }
  d.getCell('gioiThieu').alignment = { wrapText: false };
  // Thiếu link lịch thì tô nhạt cho dễ thấy — đó là căn chợ không đọc lịch được.
  if (!x.linkBooking) d.getCell('ma').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E3DE' } };
}
ws.autoFilter = { from: 'A1', to: { row: 1, column: COT.length } };

await wb.xlsx.writeFile('_ro-hang-goodstay.xlsx');
console.log('\nĐã ghi scripts/du-lieu/ro-hang-goodstay.json và _ro-hang-goodstay.xlsx');
