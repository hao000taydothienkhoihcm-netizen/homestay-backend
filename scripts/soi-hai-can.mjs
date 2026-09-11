// Kiểm lại sau khi ẩn G-030 và thêm G-081.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });
const can = await db.home.findMany({
  where: { desc: { startsWith: 'GOODSTAY' } },
  select: { id: true, name: true, desc: true, choTrangThai: true, active: true, price: true,
            weekendPrice: true, lichNguon: true, lichDongBoLuc: true, lichLoiTu: true, lichSheetTab: true },
});
for (const ma of ['G-030', 'G-092', 'G-035', 'G-081']) {
  const c = can.find((x) => x.desc.includes(ma));
  if (!c) { console.log(`${ma}: không có trong nhánh thử`); continue; }
  const dem = await db.lichKhoa.count({ where: { homeId: c.id, nguon: 'SHEET', ngay: { gte: new Date(new Date().toISOString().slice(0,10)) } } });
  console.log(`${ma} #${c.id} ${c.name.slice(0,26).padEnd(26)} chợ:${String(c.choTrangThai).padEnd(9)} active:${String(c.active).padEnd(5)} giá ${c.price?.toLocaleString('vi-VN')}/${c.weekendPrice?.toLocaleString('vi-VN') ?? '—'} · lịch ${c.lichNguon ?? '—'}${c.lichLoiTu ? ' (LỖI)' : ''} · ${dem} đêm bận từ hôm nay`);
}
console.log('\nTổng căn đang bán trên chợ:', can.filter((c) => c.choTrangThai === 'DANG_BAN').length);
await db.$disconnect();
