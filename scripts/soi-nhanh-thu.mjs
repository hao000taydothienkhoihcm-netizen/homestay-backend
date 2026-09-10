// Xem nhanh thu (DATABASE_URL_THU) co nhung tai khoan nao va bao nhieu can.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } } });
console.log('Can:', await p.home.count(), '· dang ban:', await p.home.count({ where: { choTrangThai: 'DANG_BAN' } }));
const us = await p.user.findMany({ orderBy: { id: 'asc' }, select: { id: true, username: true, role: true, name: true } });
console.log('Tai khoan tren nhanh thu:');
for (const u of us) console.log(`  #${String(u.id).padEnd(3)} ${String(u.username).padEnd(14)} ${String(u.role).padEnd(8)} ${u.name}`);
await p.$disconnect();
