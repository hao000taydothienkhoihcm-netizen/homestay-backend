// Sales mở chợ ra thì thấy gì — soi đúng mấy cột quyết định căn hiện ra sao.
// CHỈ ĐỌC.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const THU = process.argv.includes('--thu');
const url = THU ? process.env.DATABASE_URL_THU : process.env.DATABASE_URL;
const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });
const may = (u) => (String(u).match(/@([^/?]+)/) || [, '?'])[1].split('.')[0];
console.log(`${THU ? 'NHÁNH THỬ' : 'PRODUCTION'}: ${may(url)}\n`);

const ds = await db.home.findMany({ where: { choTrangThai: 'DANG_BAN' }, orderBy: { id: 'asc' } });
console.log(`${ds.length} căn đang bán trên chợ:\n`);
for (const c of ds) {
  const thieu = [];
  if (!c.coCheHoaHong) thieu.push('CƠ CHẾ HOA HỒNG (chợ ghi "chủ nhà chưa cấu hình giá")');
  else if (c.coCheHoaHong === 'GIA_SAN' && !c.floorPrice) thieu.push('giá sàn');
  else if (c.coCheHoaHong === 'PHAN_TRAM' && (!c.listPrice || c.commissionPct == null)) thieu.push('giá bán + %');
  if (!(c.coverImages || []).length) thieu.push('ảnh bìa');
  if (!c.lichNguon) thieu.push('nối lịch');
  if (!c.rules) thieu.push('quy định');
  if (!c.salesInfo) thieu.push('bài chào khách');
  console.log(`#${c.id} ${c.name}`);
  console.log(`   tiêu đề : ${c.salesTitle || '(chưa có)'}`);
  console.log(`   cơ chế  : ${c.coCheHoaHong || '— CHƯA CHỌN —'} · sàn ${c.floorPrice?.toLocaleString('vi-VN') ?? '—'} · kê ${c.markupMin?.toLocaleString('vi-VN') ?? '—'}`);
  console.log(`   ảnh     : ${(c.coverImages || []).length} · lịch: ${c.lichNguon || 'chưa nối'} · km ${c.kmTrungTam ?? '—'}`);
  console.log(`   thiếu   : ${thieu.length ? thieu.join(' · ') : 'không thiếu gì'}\n`);
}
await db.$disconnect();
