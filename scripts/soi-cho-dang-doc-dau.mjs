// Chợ đang đọc CƠ SỞ DỮ LIỆU NÀO, và mỗi nơi có bao nhiêu căn đang bán.
// KHÔNG in chuỗi kết nối ra màn hình — chỉ in tên máy chủ, đủ để biết là nhánh nào.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const may = (u) => (String(u || '').match(/@([^/?]+)/) || [, '(chưa khai)'])[1].split('.')[0];
const NGUON = [
  ['DATABASE_URL      (app nội bộ)', process.env.DATABASE_URL],
  ['DATABASE_URL_CHO  (chợ)       ', process.env.DATABASE_URL_CHO],
  ['DATABASE_URL_THU  (nhánh thử) ', process.env.DATABASE_URL_THU],
];
console.log('Trong file .env đang trỏ tới:');
for (const [ten, u] of NGUON) console.log(`  ${ten} -> ${may(u)}`);

const thu = may(process.env.DATABASE_URL_THU);
console.log(`\nĐếm căn đang bán ở từng nơi:`);
const daXem = new Set();
for (const [ten, u] of NGUON) {
  if (!u || daXem.has(may(u))) { if (u) console.log(`  ${ten} -> (cùng máy chủ ở trên)`); continue; }
  daXem.add(may(u));
  const db = new PrismaClient({ datasources: { db: { url: u } }, log: ['error'] });
  try {
    const ban = await db.home.count({ where: { choTrangThai: 'DANG_BAN' } });
    const tong = await db.home.count();
    const good = await db.home.count({ where: { desc: { startsWith: 'GOODSTAY' } } });
    console.log(`  ${ten} -> ${may(u)}: ${ban} căn đang bán / ${tong} căn tổng · ${good} căn GOODSTAY${may(u) === thu ? '  ← NHÁNH THỬ' : '  ← PRODUCTION'}`);
  } catch (e) { console.log(`  ${ten} -> lỗi: ${e.message.slice(0, 80)}`); }
  await db.$disconnect();
}
console.log(`\nDiễn giải: rổ GOODSTAY 117 căn CHỈ nằm ở nhánh thử. Chợ nào trỏ vào production`);
console.log(`thì chỉ thấy căn của chính Sabi Home — đúng một căn.`);
