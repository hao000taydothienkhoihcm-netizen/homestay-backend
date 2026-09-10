// Soi xem DATABASE_URL_CHO trong .env hien tai dang tro toi dau, va tien trinh cho
// dang chay o cong 3202 doc tu dau. Neu hai ben khac nhau thi day chinh la nguyen nhan.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const che = (u) => {
  try {
    const x = new URL(u);
    return `${x.username}@${x.host}${x.pathname}`;
  } catch { return '(khong doc duoc)'; }
};

for (const [ten, url] of [
  ['DATABASE_URL      ', process.env.DATABASE_URL],
  ['DATABASE_URL_CHO  ', process.env.DATABASE_URL_CHO],
]) {
  if (!url) { console.log(ten, '(khong co)'); continue; }
  const p = new PrismaClient({ datasources: { db: { url } } });
  const soCan = await p.home.count();
  const soBan = await p.home.count({ where: { choTrangThai: 'DANG_BAN' } });
  const soUser = await p.user.count();
  const coNuheo1 = await p.user.findUnique({ where: { username: 'nuheo1' } });
  await p.$disconnect();
  console.log(`${ten} ${che(url)}`);
  console.log(`   can: ${soCan} (dang ban ${soBan}) · user: ${soUser} · nuheo1: ${coNuheo1 ? 'CO' : 'KHONG'}`);
}
