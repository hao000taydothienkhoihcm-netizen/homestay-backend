// Chạy một lần: thêm cột "cuối tuần gồm những đêm nào" cho từng căn.
// Mặc định T6_T7_CN — đúng cách bookingService đang tính, nên 9 căn hiện tại không đổi giá.
import fs from 'fs';

const p = 'prisma/schema.prisma';
let s = fs.readFileSync(p, 'utf8');

if (s.includes('enum CuoiTuanGom')) { console.log('da co roi, bo qua'); process.exit(0); }

s = s.replace(`enum ChoNguonLich {`,
`enum CuoiTuanGom {
  T6_T7 // tối thứ 6 + thứ 7. Đêm CN tính giá ngày thường (khách về sớm đi làm)
  T6_T7_CN // tối thứ 6 + 7 + chủ nhật — cách app nội bộ tính từ đầu, mặc định
  T7_CN // tối thứ 7 + chủ nhật
  T7 // chỉ tối thứ 7
}

enum ChoNguonLich {`);

s = s.replace(
  `  price        Int // VND/đêm (giá ngày thường T2–T5)
  weekendPrice Int? // VND/đêm cuối tuần (T6, T7, CN). Null = dùng price`,
  `  price        Int // VND/đêm (giá ngày thường)
  weekendPrice Int? // VND/đêm cuối tuần. Đêm nào là cuối tuần do cuoiTuanGom quyết định. Null = dùng price`);

s = s.replace(`  markupHoliday     Int? // B: mức kê ngày lễ. Null = dùng markupMin`,
`  markupHoliday     Int? // B: mức kê ngày lễ. Null = dùng markupMin

  // Đêm nào tính giá cuối tuần — mỗi căn một kiểu khách nên host tự chọn.
  // Dùng chung cho CẢ app nội bộ lẫn chợ: hai bên phải ra cùng một con số.
  cuoiTuanGom CuoiTuanGom @default(T6_T7_CN)`);

fs.writeFileSync(p, s);
console.log('OK — them enum CuoiTuanGom + cot cuoiTuanGom');
