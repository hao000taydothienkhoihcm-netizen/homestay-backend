// Thu ket noi 1 chuoi DB bang Prisma, in ro loi. Chi doc, khong ghi.
import { PrismaClient } from '@prisma/client';
const url = process.env.THU_URL || process.argv[2];
if (!url) { console.log('thieu url'); process.exit(1); }
const p = new PrismaClient({ datasourceUrl: url });
try {
  const homes = await p.home.count();
  const users = await p.user.count();
  console.log('OK homes=' + homes + ' users=' + users);
} catch (e) {
  console.log('LOI:', e.message.split('\n').slice(0, 6).join(' | '));
} finally { await p.$disconnect(); }
