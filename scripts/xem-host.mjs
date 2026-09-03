// Xem nhanh tinh trang cac host + tai khoan. CHI DOC.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const hosts = await p.host.findMany({ orderBy: { id: 'asc' } });
for (const h of hosts) {
  const [can, canXoa, bk, us] = await Promise.all([
    p.home.count({ where: { hostId: h.id, active: true } }),
    p.home.count({ where: { hostId: h.id, active: false } }),
    p.booking.count({ where: { hostId: h.id } }),
    p.user.findMany({ where: { hostId: h.id }, select: { id: true, username: true, role: true, status: true, active: true }, orderBy: { id: 'asc' } }),
  ]);
  console.log(`\nHOST #${h.id}  ${h.name}${h.brand ? ' / ' + h.brand : ''}   ${h.active ? '[dang chay]' : '[DA KHOA]'}`);
  console.log(`  can dang dung ${can}  |  can da xoa ${canXoa}  |  booking ${bk}  |  tai khoan ${us.length}`);
  for (const u of us) {
    console.log(`    - ${u.username.padEnd(20)} ${u.role.padEnd(8)} ${u.status}${u.active ? '' : ' (bi khoa)'}`);
  }
}

const langThang = await p.user.count({ where: { hostId: null } });
if (langThang) console.log(`\nCanh bao: ${langThang} tai khoan chua gan host nao.`);
console.log('');
await p.$disconnect();
