// Thu tron luong: host khai can (app noi bo 3201) -> sales nhin thay gi (cho 3202).
// CA HAI deu tro vao NHANH THU. Khong dung toi du lieu that.
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const NOI_BO = 'http://localhost:3201';
const CHO = 'http://localhost:3202';
const tien = (n) => (n == null ? '—' : Number(n).toLocaleString('vi-VN') + 'đ');

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });

// Lay mot can THAT cua host #1 tren nhanh thu de thu (khong tao rac moi).
const can = await db.home.findFirst({ where: { choTrangThai: 'DANG_BAN', hostId: { not: null } }, orderBy: { id: 'asc' } });
if (!can) { console.error('Khong tim thay can nao dang ban'); process.exit(1); }
const cu = { ...can };
console.log(`Can thu: #${can.id} ${can.name} (host ${can.hostId})\n`);

const tokenHost = jwt.sign({ id: 4, role: 'HOST', hostId: can.hostId }, process.env.JWT_SECRET, { expiresIn: '10m' });
const tokenSales = jwt.sign({ id: 9, role: 'SALES', hostId: null }, process.env.JWT_SECRET, { expiresIn: '10m' });
const H = (t) => ({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' });

// ───── 1. Host khai: link Maps + gia cuoi tuan/le + nguon lich ─────
const than = {
  ward: can.ward, salesTitle: can.salesTitle, bedrooms: can.bedrooms,
  albumUrl: can.albumUrl, salesInfo: can.salesInfo || 'bai gioi thieu thu',
  caretakerPhone: can.caretakerPhone || '0900000000',
  amenities: ['Sân BBQ + lò nướng', 'Hồ bơi', 'Lò sưởi', 'Cho mang thú cưng'],
  coCheHoaHong: 'GIA_SAN',
  floorPrice: 2000000, floorPriceWeekend: 2500000, floorPriceHoliday: 4000000,
  markupMin: 300000, markupMax: 800000, markupHoliday: 600000,
  mapLink: 'https://www.google.com/maps/place/X/@11.9500,108.4300,17z/data=!3m1!4b1!4m5!3m4!1s0x0:0x0!8m2!3d11.9500!4d108.4300',
  lichNguon: 'APP',
};
const r1 = await fetch(`${NOI_BO}/v1/homes/${can.id}/cho`, { method: 'PATCH', headers: H(tokenHost), body: JSON.stringify(than) });
const sau = await r1.json();
console.log('1. Host luu khai can:', r1.status, sau.canhBaoViTri ? '· canh bao: ' + sau.canhBaoViTri : '· khong canh bao');
console.log('   toa do luu duoc :', sau.lat, sau.lng, '· km:', sau.kmTrungTam, '· uoc chung:', sau.viTriUocChung);
console.log('   nguon lich      :', sau.lichNguon);

// ───── 2. Doi kieu gop cuoi tuan (tab 1) ─────
const r2 = await fetch(`${NOI_BO}/v1/homes/${can.id}`, {
  method: 'PATCH', headers: H(tokenHost),
  body: JSON.stringify({ cuoiTuanGom: 'T7_CN' }),
});
console.log('2. Doi kieu gop cuoi tuan:', r2.status, (await r2.json()).cuoiTuanGom);

// ───── 3. Sales nhin thay gi ngoai cho ─────
const ct = await (await fetch(`${CHO}/v1/cho/${can.id}`, { headers: H(tokenSales) })).json();
console.log('\n3. Ngoai cho, sales thay:');
console.log('   km             :', ct.kmTrungTam, ct.viTriUocChung ? '(uoc chung)' : '(chinh xac)');
console.log('   muc lich       :', ct.lich?.muc, ct.lich?.ten);
console.log('   gom cuoi tuan  :', ct.gia?.cuoiTuanGom);
console.log('   dem thuong     :', tien(ct.gia?.dem?.thuong?.khachTra), '· hh', tien(ct.gia?.dem?.thuong?.hoaHong), '· host', tien(ct.gia?.dem?.thuong?.hostNhan));
console.log('   dem cuoi tuan  :', tien(ct.gia?.dem?.cuoiTuan?.khachTra), '· hh', tien(ct.gia?.dem?.cuoiTuan?.hoaHong), '· host', tien(ct.gia?.dem?.cuoiTuan?.hostNhan));
console.log('   dem le         :', tien(ct.gia?.dem?.le?.khachTra), '· hh', tien(ct.gia?.dem?.le?.hoaHong), '· host', tien(ct.gia?.dem?.le?.hostNhan));
console.log('   tien ich       :', (ct.amenities || []).join(' · '));
for (const k of ['mapLink', 'lat', 'lng', 'address', 'caretakerPhone', 'floorPrice']) {
  if (k in ct) console.log(`   ✕ BI LO: ${k} =`, ct[k]);
}
console.log('   (khong co truong nao bi lo neu khong thay dong ✕ nao)');

// ───── 4. Bo loc tien ich moi co an khong ─────
const ds = await (await fetch(`${CHO}/v1/cho/tien-ich`, { headers: H(tokenSales) })).json();
console.log('\n4. Chip tien ich ngoai cho:', ds.filter((t) => t.soCan).map((t) => `${t.ten}(${t.soCan})`).join(' · '));
const loc = await (await fetch(`${CHO}/v1/cho?tienIch=${encodeURIComponent('lò sưởi')}`, { headers: H(tokenSales) })).json();
console.log('   loc "lò sưởi":', loc.soCan, 'can');

// ───── 5. Tra can ve nhu cu ─────
await db.home.update({
  where: { id: can.id },
  data: {
    amenities: cu.amenities, coCheHoaHong: cu.coCheHoaHong,
    floorPrice: cu.floorPrice, floorPriceWeekend: cu.floorPriceWeekend, floorPriceHoliday: cu.floorPriceHoliday,
    markupMin: cu.markupMin, markupMax: cu.markupMax, markupHoliday: cu.markupHoliday,
    mapLink: cu.mapLink, lat: cu.lat, lng: cu.lng, kmTrungTam: cu.kmTrungTam, viTriUocChung: cu.viTriUocChung,
    lichNguon: cu.lichNguon, cuoiTuanGom: cu.cuoiTuanGom, salesInfo: cu.salesInfo, caretakerPhone: cu.caretakerPhone,
  },
});
console.log('\n5. Da tra can ve nguyen trang.');
await db.$disconnect();
