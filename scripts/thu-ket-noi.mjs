// Thử kết nối database theo vài biến thể chuỗi kết nối, để biết vì sao không vào được.
// CHỈ ĐỌC: chỉ đếm số căn nhà. Không ghi gì.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const goc = process.env.DATABASE_URL || '';
if (!goc) { console.log('KHONG co DATABASE_URL trong .env'); process.exit(1); }

const boCB = goc.replace(/[?&]channel_binding=require/, (m) => (m[0] === '?' ? '?' : ''));

const THU = [
  ['nguyen ban (co channel_binding)', goc],
  ['GIU channel_binding + connect_timeout=30', goc + '&connect_timeout=30'],
  ['bo channel_binding', boCB],
  ['bo channel_binding + connect_timeout=30', boCB + (boCB.includes('?') ? '&' : '?') + 'connect_timeout=30'],
];

let thanhCong = null;
for (const [ten, url] of THU) {
  const p = new PrismaClient({ datasources: { db: { url } } });
  try {
    const n = await p.home.count();
    console.log(`OK   ${ten}  ->  dem duoc ${n} can nha`);
    thanhCong = ten;
    await p.$disconnect();
    break;
  } catch (e) {
    const dong = String(e.message).split('\n').map((s) => s.trim()).filter(Boolean);
    const gon = dong.find((l) => /Can't reach|authentication|does not exist|password|Error|error/i.test(l)) || dong[0];
    console.log(`SAI  ${ten}  ->  ${gon}`);
    await p.$disconnect().catch(() => {});
  }
}

console.log('');
console.log(thanhCong ? `Dung duoc voi: ${thanhCong}` : 'Khong bien the nao ket noi duoc.');
process.exit(thanhCong ? 0 : 1);
