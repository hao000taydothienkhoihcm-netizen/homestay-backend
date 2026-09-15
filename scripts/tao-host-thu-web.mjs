// Tạo / xoá một tài khoản HOST tạm trên NHÁNH THỬ để mở web chợ xem bằng mắt.
//   node scripts/tao-host-thu-web.mjs        -> tạo, gắn vào host có nhiều căn nhất
//   node scripts/tao-host-thu-web.mjs --xoa  -> xoá
// Tuyệt đối không chạy vào production: guard host như mọi script khác.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const thu = process.env.DATABASE_URL_THU;
const hostCua = (u) => (u.match(/@([^/]+)/) || [, ''])[1];
if (!thu || hostCua(thu) === hostCua(process.env.DATABASE_URL || '')) { console.error('✕ DATABASE_URL_THU thiếu hoặc trỏ production'); process.exit(1); }
const db = new PrismaClient({ datasources: { db: { url: thu } }, log: ['error'] });
const U = 'thuweb.host';

if (process.argv.includes('--xoa')) {
  const r = await db.user.deleteMany({ where: { username: U } });
  console.log(`đã xoá ${r.count} tài khoản ${U}`);
} else {
  const nhom = await db.home.groupBy({ by: ['hostId'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 1 });
  const hostId = nhom[0]?.hostId;
  if (!hostId) { console.error('✕ Nhánh thử không có căn nào'); process.exit(1); }
  await db.user.upsert({
    where: { username: U },
    update: { hostId, status: 'ACTIVE', active: true, role: 'HOST', password: bcrypt.hashSync('thuweb123', 10) },
    create: { username: U, password: bcrypt.hashSync('thuweb123', 10), name: 'Chủ nhà thử', role: 'HOST', status: 'ACTIVE', active: true, hostId },
  });
  console.log(`tài khoản ${U} / thuweb123 -> hostId ${hostId} (${nhom[0]._count.id} căn) — CHỈ trên nhánh thử`);
}
await db.$disconnect();
