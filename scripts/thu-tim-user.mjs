// Lam DUNG y nhu route /auth/login lam, tren nhanh thu, de xem vi sao bao khong tim thay.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const uname = (process.argv[2] || 'nuheo1').trim().toLowerCase();
const p = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_CHO } } });

console.log('Tim username =', JSON.stringify(uname));
try {
  const u = await p.user.findUnique({
    where: { username: uname },
    include: { host: { select: { active: true } } },
  });
  console.log('Ket qua:', u ? `#${u.id} ${u.role} active=${u.active} status=${u.status}` : 'KHONG CO');
} catch (e) {
  console.log('LOI khi tim:', e.message.split('\n').slice(0, 6).join(' | '));
}

const all = await p.user.findMany({ select: { id: true, username: true } });
console.log('\nTat ca username (dat trong ngoac de thay khoang trang thua):');
for (const u of all) console.log(`  #${u.id} ${JSON.stringify(u.username)}`);
await p.$disconnect();
