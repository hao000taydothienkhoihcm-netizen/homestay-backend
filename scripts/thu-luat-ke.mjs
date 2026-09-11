// Bài kiểm cho bộ đọc luật kê — chạy trước khi đem đi đối chiếu 117 căn.
import { docLuatKe, soTien } from '../src/lib/lich-sheet.js';
const CA = [
  ['A/c Saler vui lòng nâng không quá 500.000/đêm ngày thường, tối đa 1.000.000/đêm Lễ Tết', 500000, 1000000],
  ['CHÊNH TỐI ĐA 1TR/ĐÊM', 1000000, null],
  ['Saler kê tối đa 300k/đêm', 300000, null],
  ['Kê không quá 500k ngày thường, lễ tết tối đa 1tr5', 500000, 1500000],
  ['Chênh tối đa 2 triệu/đêm dịp Tết', null, 2000000],
  ['Giá thu về 1.600.000 đ', null, null],            // không có từ chặn -> không phải luật
  ['Home có 5 phòng, tối đa 12 khách', null, null],  // số nhỏ, không phải tiền
  ['Nhận phòng 14h trả phòng 12h', null, null],
  // Ba ca đã bắt nhầm ngoài đời thật (bảng của chủ nhà), giữ lại làm bài kiểm hồi quy:
  ['Phòng Karaoke + 1tr/đêm', null, null],
  // Hai bảng thật viết NGƯỢC thứ tự (lễ đứng trước số của nó) — từng bị đọc lộn:
  ['Ngày thường chênh tối đa 700k, lễ/ Tết tối đa 1tr', 700000, 1000000],
  ['CHÊNH TỐI ĐA 500K/ ĐÊM - Lễ tết chênh tối đa 1.000.000đ/ đêm', 500000, 1000000],
  ['GIÁ THU VỀ, chênh 300-500k/đêm ngày thường, không quá 1tr/đêm Tết', 500000, 1000000],
  ['CHÊNH MAX 200K', 200000, null],
  ['CHÊNH =< 1000K', 1000000, null],
  ['KO NÂNG QUÁ 500K / ĐÊM', 500000, null],
  ['2 phòng (1p đơn, 1p đôi), 1 wc bồn tắm Giá tiêu chuẩn 6 khách Tối đa 7 khách, phụ thu 100.000', null, null],
  ['Số 5 Lý Tự Trọng, P1. Đà Lạt 6 phòng : 3 đơn và 3 phòng căn hộ, thêm người 100.000', null, null],
];
let tach = 0;
for (const [s, t, l] of CA) {
  const r = docLuatKe(s);
  const ok = (r?.thuong ?? null) === t && (r?.le ?? null) === l;
  if (!ok) tach++;
  console.log(`${ok ? '✓' : '✕'} ${s.slice(0, 62).padEnd(64)} thường=${r?.thuong ?? '—'} lễ=${r?.le ?? '—'}${ok ? '' : `  (mong đợi ${t}/${l})`}`);
}
console.log('\nsoTien:', ['1.600.000', '1tr', '1tr5', '2tr3', '500k', '2 triệu', '500000', '12'].map((x) => `${x}=${soTien(x)}`).join(' · '));
console.log(tach ? `\n✕ ${tach} ca sai` : '\n✓ Tất cả đạt');
