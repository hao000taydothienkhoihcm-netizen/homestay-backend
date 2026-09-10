// So danh sach tai khoan giua ban chinh va nhanh thu, de biet vi sao dang nhap
// duoc o cho nay ma khong duoc o cho kia. KHONG in mat khau, chi in vai ky tu dau
// cua chuoi bam de so hai ben co giong nhau khong.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const noi = async (url, ten) => {
  const p = new PrismaClient({ datasources: { db: { url } } });
  const rows = await p.user.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, username: true, name: true, role: true, active: true, status: true, password: true },
  });
  await p.$disconnect();
  console.log(`\n=== ${ten} — ${rows.length} tai khoan ===`);
  for (const u of rows) {
    console.log(
      `  #${String(u.id).padEnd(3)} ${String(u.username).padEnd(18)} ${String(u.role).padEnd(8)} ` +
      `${u.active ? 'bat ' : 'TAT '} ${String(u.status).padEnd(8)} ${String(u.password).slice(0, 12)} ${u.name}`,
    );
  }
  return rows;
};

const chinh = await noi(process.env.DATABASE_URL, 'BAN CHINH (production)');
const thu = await noi(process.env.DATABASE_URL_CHO, 'NHANH THU (cho duoi may doc)');

const bam = (u) => String(u.password).slice(0, 12);
const mapThu = new Map(thu.map((u) => [u.username, u]));
console.log('\n=== Khac nhau ===');
let khac = 0;
for (const u of chinh) {
  const t = mapThu.get(u.username);
  if (!t) { console.log(`  ${u.username}: CO o ban chinh, KHONG co o nhanh thu`); khac++; }
  else if (bam(t) !== bam(u)) { console.log(`  ${u.username}: mat khau KHAC nhau giua hai ben`); khac++; }
  else if (t.active !== u.active || t.status !== u.status) { console.log(`  ${u.username}: trang thai bat/tat khac nhau`); khac++; }
}
for (const u of thu) if (!chinh.some((c) => c.username === u.username)) {
  console.log(`  ${u.username}: chi co o nhanh thu`); khac++;
}
if (!khac) console.log('  (giong het nhau)');
