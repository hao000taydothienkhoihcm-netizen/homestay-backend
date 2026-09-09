// Chạy một lần: thêm cột chợ (giá theo loại đêm + nguồn lịch) vào schema.prisma.
// Toàn bộ là cột MỚI và nullable — không đụng cột cũ, không xoá gì.
import fs from 'fs';

const p = 'prisma/schema.prisma';
let s = fs.readFileSync(p, 'utf8');

const them = (a, b) => {
  if (s.includes(b.trim().split('\n')[0].trim())) { console.log('bo qua (da co):', b.trim().slice(0, 40)); return; }
  if (!s.includes(a)) throw new Error('khong tim thay moc: ' + a.slice(0, 60));
  s = s.replace(a, b, 1);
};

// ───── enum nguồn lịch ─────
them(`enum NguonLichKhoa {`,
`enum ChoNguonLich {
  APP // dùng app nội bộ Sabi — lịch thật, mức ①
  ICAL // host dán link iCal, Sabi đọc lại mỗi 30 phút — mức ②
  SCRIPT // Apps Script trong Sheet của host tự đẩy sang — mức ②
  SHEET // Sabi tự đọc Google Sheet — dễ gãy, mức ③
}

enum NguonLichKhoa {`);

// ───── cột mới trên Home ─────
them(`  markupMax      Int? // B: cho kê đến
`,
`  markupMax      Int? // B: cho kê đến — GIỮ LẠI cho dữ liệu cũ, mô hình mới không dùng:
  // host quy định MỘT mức kê (markupMin), sales chỉ được CẮT bớt phần của mình.

  // ───── Giá chợ theo loại đêm (chốt 09/2026) ─────
  // A: % hoa hồng dùng chung mọi loại đêm — đêm lễ giá cao thì hoa hồng tự cao,
  //    không cần % riêng. B: mức kê ngày lễ khai riêng vì lễ host cho kê nhiều hơn.
  listPriceWeekend  Int? // A: giá bán cuối tuần (T6, T7)
  listPriceHoliday  Int? // A: giá bán ngày lễ
  floorPriceWeekend Int? // B: giá sàn cuối tuần
  floorPriceHoliday Int? // B: giá sàn ngày lễ
  markupHoliday     Int? // B: mức kê ngày lễ. Null = dùng markupMin

  // ───── Nguồn lịch & mức tin cậy (① lịch thật · ② tự động · ③ tham khảo · ④ chưa có) ─────
  // Mức KHÔNG lưu thành cột: suy từ lichNguon + lichLoiTu, tránh hai chỗ lệch nhau.
  lichNguon     ChoNguonLich?
  lichLink      String? // link iCal hoặc link Google Sheet
  lichSheetTab  String? // tên tab (chỉ SHEET)
  lichSheetCot  String? // cột chứa ngày (chỉ SHEET)
  lichKey       String? // khoá để Apps Script của host đẩy dữ liệu vào
  lichDongBoLuc DateTime? // lần ĐỌC THÀNH CÔNG gần nhất — không phải "lịch đổi lần cuối"
  lichLoiTu     DateTime? // mốc bắt đầu chuỗi đọc lỗi; quá 24h thì hạ xuống mức ④
  lichNhatKy    Json? // 4 dòng gần nhất: [{ luc, ok, ghi }]
`);

fs.writeFileSync(p, s);
console.log('OK — da them cot vao schema.prisma');
