import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });
const g = await p.lichKhoa.groupBy({ by: ['ghiChu'], _count: true, where: { nguon: 'SHEET' } });
console.log('Nhan cac dem khong trong:');
g.sort((a, b) => b._count - a._count).forEach((x) => console.log('  ', String(x._count).padStart(4), x.ghiChu));
const ds = await p.home.findMany({
  where: { OR: [{ name: { contains: 'GẤU' } }, { name: { contains: 'BEAU' } }, { name: { contains: 'Beau' } }] },
  select: { id: true, name: true, lichNguon: true, lichSheetCot: true, choTrangThai: true },
});
console.log('\nMot vai can:');
ds.forEach((c) => console.log(`  #${c.id} ${c.name.slice(0, 24).padEnd(24)} ${c.choTrangThai} · lich ${c.lichNguon || '—'} · khoi "${c.lichSheetCot || '—'}"`));
await p.$disconnect();
