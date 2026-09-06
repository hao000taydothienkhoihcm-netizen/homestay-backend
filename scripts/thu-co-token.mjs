// Chứng minh: có token hợp lệ rồi thì các route của app nội bộ vẫn KHÔNG tồn tại
// trên service chợ (404), chứ không phải chỉ bị chặn vì thiếu đăng nhập (401).
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const G = 'http://localhost:3201';
const token = jwt.sign({ id: 1, role: 'ADMIN', hostId: null }, process.env.JWT_SECRET, { expiresIn: '5m' });
const h = { Authorization: 'Bearer ' + token };

const duong = ['/v1/cho', '/v1/cho/phuong', '/v1/bookings', '/v1/expenses', '/v1/inventory', '/v1/homes', '/v1/hosts', '/v1/users'];
for (const d of duong) {
  try {
    const r = await fetch(G + d, { headers: h });
    console.log('  GET ' + d.padEnd(18) + ' -> ' + r.status);
  } catch (e) {
    console.log('  GET ' + d.padEnd(18) + ' -> LOI ' + e.message);
  }
}
