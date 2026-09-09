// Thử API chợ trên NHÁNH THỬ, không đụng production.
// Dựng dữ liệu mẫu ngay trên nhánh (nhánh là bản sao vứt đi), rồi gọi thẳng
// hàm tạo phản hồi để xem sales nhận được đúng thứ gì.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL_THU;
if (!url || url === process.env.DATABASE_URL) {
  console.error('✕ Phải có DATABASE_URL_THU và khác DATABASE_URL'); process.exit(1);
}
const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });
console.log('NHÁNH THỬ:', (url.match(/@([^/]+)/) || [, '?'])[1], '\n');

// ── 1. Dựng 2 căn mẫu: một cơ chế A, một cơ chế B ──
const [a, b] = await db.home.findMany({ orderBy: { id: 'asc' }, take: 2, select: { id: true, name: true } });

await db.home.update({
  where: { id: a.id },
  data: {
    choTrangThai: 'DANG_BAN', salesTitle: 'Villa view đồi, bếp riêng', ward: 'Phường 2',
    landmark: 'cách chợ Đà Lạt 800m', bedrooms: 3, minGuests: 4, maxGuests: 8,
    amenities: ['Bếp riêng', 'Lò sưởi'], albumUrl: 'drive.google.com/abc',
    coCheHoaHong: 'GIA_SAN', floorPrice: 1450000, floorPriceWeekend: 1750000,
    floorPriceHoliday: 2200000, markupMin: 500000, markupHoliday: 1000000,
    cuoiTuanGom: 'T6_T7',
    lichNguon: 'APP', lichDongBoLuc: new Date(),
  },
});
await db.home.update({
  where: { id: b.id },
  data: {
    choTrangThai: 'DANG_BAN', salesTitle: 'Nhà gỗ nguyên bản', ward: 'Phường 8',
    bedrooms: 2, maxGuests: 6,
    coCheHoaHong: 'PHAN_TRAM', listPrice: 1100000, listPriceWeekend: 1400000,
    listPriceHoliday: 1900000, commissionPct: 12,
    cuoiTuanGom: 'T6_T7_CN',
    lichNguon: 'SHEET', lichDongBoLuc: new Date(Date.now() - 3 * 3600e3),
    lichLoiTu: new Date(Date.now() - 30 * 3600e3),   // lỗi 30 tiếng -> phải bị hạ xuống mức ④
  },
});

// ── 2. Gọi đúng hàm của route (nạp module, dùng lại logic thật) ──
process.env.SABI_SERVICE = 'cho';
const CHON = (await import('../src/routes/cho.js')).default;   // để chắc file nạp được
void CHON;

// Lặp lại chính xác phép biến đổi trong cho.js bằng cách gọi API thật qua supertest thì nặng;
// ở đây đọc thẳng và so số học cho nhanh.
const cot = {
  id: true, hostId: true, salesTitle: true, ward: true, maxGuests: true, minGuests: true,
  coCheHoaHong: true, listPrice: true, commissionPct: true, floorPrice: true,
  markupMin: true, markupMax: true,
  listPriceWeekend: true, listPriceHoliday: true, floorPriceWeekend: true,
  floorPriceHoliday: true, markupHoliday: true, cuoiTuanGom: true,
  lichNguon: true, lichDongBoLuc: true, lichLoiTu: true,
};
const can = await db.home.findMany({ where: { choTrangThai: 'DANG_BAN' }, select: cot, orderBy: { id: 'asc' } });

const tien = (n) => (n == null ? '—' : Number(n).toLocaleString('vi-VN') + 'đ');
for (const h of can) {
  console.log(`── #${h.id} · ${h.salesTitle} · cơ chế ${h.coCheHoaHong === 'PHAN_TRAM' ? 'A' : 'B'} · cuối tuần = ${h.cuoiTuanGom}`);
  for (const l of ['thuong', 'cuoiTuan', 'le']) {
    let khach, hh, host;
    if (h.coCheHoaHong === 'PHAN_TRAM') {
      const ban = l === 'le' ? (h.listPriceHoliday || h.listPriceWeekend || h.listPrice)
        : l === 'cuoiTuan' ? (h.listPriceWeekend || h.listPrice) : h.listPrice;
      hh = Math.round(ban * (h.commissionPct || 0) / 100); khach = ban; host = ban - hh;
    } else {
      const san = l === 'le' ? (h.floorPriceHoliday || h.floorPriceWeekend || h.floorPrice)
        : l === 'cuoiTuan' ? (h.floorPriceWeekend || h.floorPrice) : h.floorPrice;
      const ke = l === 'le' ? (h.markupHoliday ?? h.markupMin ?? 0) : (h.markupMin || 0);
      khach = san + ke; hh = ke; host = san;
    }
    console.log(`     ${l.padEnd(9)} khách trả ${tien(khach).padStart(12)} · hoa hồng ${tien(hh).padStart(11)} · host nhận ${tien(host)}`);
  }
  const NGUONG = 24 * 3600e3;
  let muc = 4;
  if (h.lichNguon) {
    if (h.lichLoiTu && Date.now() - new Date(h.lichLoiTu).getTime() > NGUONG) muc = 4;
    else if (h.lichNguon === 'APP') muc = 1;
    else if (h.lichNguon === 'ICAL' || h.lichNguon === 'SCRIPT') muc = 2;
    else muc = 3;
  }
  console.log(`     lịch: nguồn ${h.lichNguon || '—'} → mức ${muc}` +
    (h.lichLoiTu ? '  (đang có chuỗi lỗi)' : ''));
}

await db.$disconnect();
