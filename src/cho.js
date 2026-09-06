// Điểm khởi động của service CHỢ CĂN.  Chạy: node src/cho.js
//
// File này chỉ làm đúng một việc: đặt SABI_SERVICE=cho TRƯỚC khi nạp bất cứ thứ gì
// chạm tới prisma.js. Trong ESM, mọi câu `import` được nâng lên chạy trước phần thân
// module — nên nếu đặt biến trong chính server-cho.js thì prisma.js đã kịp tạo client
// bằng chuỗi kết nối của app nội bộ (quyền chủ sở hữu). Dùng import động để ép đúng
// thứ tự: đặt biến xong mới nạp server.
import 'dotenv/config';

process.env.SABI_SERVICE = 'cho';

await import('./server-cho.js');
