// Tiêu đề bán TRÙNG tên căn thì thẻ ngoài chợ hiện hai dòng y hệt nhau — vừa xấu,
// vừa mất luôn tác dụng của tiêu đề (câu chào hàng). CHỈ ĐỌC.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });
const gon = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]/gi, '').toLowerCase();
const ds = await db.home.findMany({ where: { choTrangThai: 'DANG_BAN' }, select: { id: true, name: true, salesTitle: true } });
const trung = ds.filter((c) => c.salesTitle && gon(c.salesTitle) === gon(c.name));
const chua = ds.filter((c) => !c.salesTitle);
const rieng = ds.filter((c) => c.salesTitle && gon(c.salesTitle) !== gon(c.name));
console.log(`${ds.length} căn đang bán`);
console.log(`  tiêu đề TRÙNG tên căn : ${trung.length}`);
console.log(`  tiêu đề riêng, tử tế  : ${rieng.length}`);
console.log(`  chưa có tiêu đề       : ${chua.length}`);
console.log('\nVài căn có tiêu đề riêng (mẫu để thấy tiêu đề tốt trông thế nào):');
for (const c of rieng.slice(0, 5)) console.log(`  ${c.name}\n     -> "${c.salesTitle}"`);
await db.$disconnect();
