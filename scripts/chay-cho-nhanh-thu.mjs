// Chạy service CHỢ dưới máy, đọc NHÁNH THỬ thay vì production.
// Dùng để xem chợ với 116 căn GOODSTAY mà không đụng dữ liệu thật.
//
//   node scripts/chay-cho-nhanh-thu.mjs      -> http://localhost:3202
//
// Cách làm: lấy chuỗi chỉ-đọc (DATABASE_URL_CHO) rồi thay HOST bằng host của
// nhánh thử. Role cho_chi_doc có sẵn trên nhánh vì nhánh chép từ production
// sau khi tạo role — cùng mật khẩu, khác endpoint.
import 'dotenv/config';
import { spawn } from 'node:child_process';

const cho = process.env.DATABASE_URL_CHO;
const thu = process.env.DATABASE_URL_THU;
if (!cho || !thu) {
  console.error('✕ Cần cả DATABASE_URL_CHO và DATABASE_URL_THU trong .env');
  process.exit(1);
}
const hostCua = (u) => (u.match(/@([^/]+)/) || [, ''])[1];
const hostThu = hostCua(thu);
const url = cho.replace('@' + hostCua(cho), '@' + hostThu);

if (hostCua(url) === hostCua(process.env.DATABASE_URL || '')) {
  console.error('✕ Vẫn đang trỏ production. Dừng.');
  process.exit(1);
}

console.log('Chợ đọc NHÁNH THỬ:', hostThu);
console.log('Vai trò Sales     :', (url.match(/\/\/([^:]+):/) || [, '?'])[1], '(chỉ đọc)');
console.log('Vai trò chủ nhà   : DATABASE_URL cũng trỏ nhánh thử (ghi được, nhưng vào nhánh)');
console.log('Mở                : http://localhost:3202\n');

spawn('node', ['src/cho.js'], {
  stdio: 'inherit',
  shell: true,
  // QUAN TRỌNG: từ khi chợ có mặt chủ nhà (/v1/homes ghi bằng client chủ), phải đổi
  // CẢ DATABASE_URL sang nhánh thử. Chỉ đổi DATABASE_URL_CHO thì Sales đọc nhánh thử
  // mà chủ nhà bấm "Lưu" lại ghi thẳng vào production.
  env: { ...process.env, DATABASE_URL: thu, DATABASE_URL_CHO: url, PORT: '3202' },
});
