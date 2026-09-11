// Soi MỘT căn trong bảng lịch của chủ nhà: mấy dòng thông tin phía trên (cơ cấu phòng,
// địa chỉ) + giá ngày thường / cuối tuần suy từ chính bảng + lịch bận.
//
//   node scripts/soi-can-trong-bang.mjs <idBang> "<tên khối>" [thang] [nam]
//
// Giá KHÔNG lấy trung bình mà lấy MỨC HAY GẶP NHẤT của từng loại đêm — bảng thật
// có đêm lễ, đêm khuyến mãi, đêm gõ nhầm; trung bình sẽ ra một con số không tồn tại.
import fs from 'node:fs';
import { taiVaDoc, chonTab, docTab, chuoiO, thangCuaTab } from '../src/lib/lich-sheet.js';

const [, , ID, TEN, THANG = '9', NAM = '2026'] = process.argv;
if (!ID || !TEN) { console.error('Cần: <idBang> "<tên khối>"'); process.exit(1); }

const F_MAU = new URL('./du-lieu/luat-mau.json', import.meta.url);
const LUAT = fs.existsSync(F_MAU) ? JSON.parse(fs.readFileSync(F_MAU, 'utf8')) : {};
const luat = LUAT[ID] ? Object.fromEntries(Object.entries(LUAT[ID]).filter(([k]) => !k.startsWith('_'))) : null;
console.log('Luật màu của bảng này:', luat ? JSON.stringify(luat) : 'CHƯA KHAI (có tô màu = không trống)');

const wb = await taiVaDoc(ID);
const chon = chonTab(wb, +THANG, +NAM);
if (!chon) { console.error('Không có tab tháng', THANG + '/' + NAM); process.exit(1); }
const ws = chon.w;
const khoi = docTab(ws, ws.name, luat);
const k = khoi.find((x) => x.ten === TEN) || khoi.find((x) => x.ten.toLowerCase().includes(TEN.toLowerCase()));
if (!k) {
  console.error(`Không thấy khối "${TEN}". Các khối có trong tab:`);
  khoi.forEach((x) => console.error('  -', JSON.stringify(x.ten)));
  process.exit(1);
}

console.log(`\nBảng "${ws.name}" · khối "${k.ten}" ở cột ${k.cot}\n`);
console.log('── Mấy dòng thông tin phía trên (cột này và cột kế) ──');
for (let r = 1; r < 8; r++) {
  for (const c of [k.cot, k.cot + 1]) {
    const v = chuoiO(ws.getRow(r).getCell(c).value).replace(/\s+/g, ' ').trim();
    if (v) console.log(`  R${r}C${c}: ${v.slice(0, 120)}`);
  }
}

// ── Giá theo loại đêm, suy từ chính bảng ──
// Đêm tính theo NGÀY NHẬN: T6, T7, CN là cuối tuần (kiểu hay gặp nhất ở Đà Lạt).
const hayGap = (ds) => {
  const d = new Map();
  for (const x of ds) if (x) d.set(x, (d.get(x) || 0) + 1);
  if (!d.size) return null;
  const [gt, n] = [...d].sort((a, b) => b[1] - a[1])[0];
  return { gia: gt, lan: n, tong: ds.filter(Boolean).length };
};
const thuong = [], cuoiTuan = [];
for (const n of k.ngay) {
  const t = new Date(n.ngay + 'T00:00:00Z').getUTCDay();   // 0=CN 5=T6 6=T7
  ([5, 6, 0].includes(t) ? cuoiTuan : thuong).push(n.gia);
}
const gThuong = hayGap(thuong), gCuoiTuan = hayGap(cuoiTuan);
const tien = (x) => (x ? `${x.gia.toLocaleString('vi-VN')}đ (gặp ${x.lan}/${x.tong} đêm)` : '—');
console.log('\n── Giá suy từ bảng ──');
console.log('  Ngày thường T2–T5 :', tien(gThuong));
console.log('  Cuối tuần T6,T7,CN:', tien(gCuoiTuan));
const khac = [...new Set(k.ngay.map((n) => n.gia).filter(Boolean))].sort((a, b) => a - b);
console.log('  Các mức giá xuất hiện:', khac.map((x) => x.toLocaleString('vi-VN')).join(' · '));

// ── Lịch ──
const ban = k.ngay.filter((n) => n.trangThai !== 'trong');
console.log(`\n── Lịch tháng ${THANG}/${NAM} ──`);
console.log(`  ${k.ngay.length} đêm · trống ${k.ngay.length - ban.length} · không trống ${ban.length}`);
const O = { trong: '·', ban: '█', giu: '▒', khoa: '▓' };
console.log('  ' + k.ngay.map((n) => O[n.trangThai] || '?').join(''));
if (ban.length) console.log('  Đêm không trống:', ban.map((n) => `${n.ngay.slice(8)}${n.ghiChu ? '(' + n.ghiChu.slice(0, 12) + ')' : ''}`).join(' '));
