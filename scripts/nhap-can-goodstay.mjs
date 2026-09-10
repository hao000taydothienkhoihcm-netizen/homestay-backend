// NHẬP RỔ HÀNG GOODSTAY VÀO NHÁNH THỬ.
//
// ⚠ Script này CHỈ chạy trên nhánh thử (DATABASE_URL_THU) và tự chặn nếu chuỗi
//   trùng production. Dữ liệu này là bảng của GOODSTAY (xuannguyen2891@gmail.com)
//   chia sẻ cho Sabi, có tên và số điện thoại của ~69 chủ nhà — không đưa vào
//   database thật khi chưa có sự đồng ý của họ.
//
// Chạy:  node scripts/nhap-can-goodstay.mjs          -> xem trước, KHÔNG ghi
//        node scripts/nhap-can-goodstay.mjs --ghi     -> ghi thật vào nhánh thử
//        node scripts/nhap-can-goodstay.mjs --xoa     -> gỡ hết căn đã nhập
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const GHI = process.argv.includes('--ghi');
const XOA = process.argv.includes('--xoa');

const url = process.env.DATABASE_URL_THU;
if (!url) { console.error('✕ Thiếu DATABASE_URL_THU trong .env'); process.exit(1); }
if (url === process.env.DATABASE_URL) {
  console.error('✕ DATABASE_URL_THU trùng production. Dừng.'); process.exit(1);
}
const host = (u) => (u.match(/@([^/]+)/) || [, '?'])[1];
if (host(url) === host(process.env.DATABASE_URL || '')) {
  console.error('✕ Hai chuỗi cùng endpoint — không phải nhánh riêng. Dừng.'); process.exit(1);
}

const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });
console.log('NHÁNH THỬ:', host(url));
console.log('Chế độ  :', XOA ? 'XOÁ' : GHI ? 'GHI THẬT' : 'XEM TRƯỚC (không ghi)', '\n');

const CAN = JSON.parse(fs.readFileSync(new URL('./du-lieu/can-goodstay.json', import.meta.url), 'utf8'));
const NHAN = 'GOODSTAY';   // dấu để nhận ra căn nhập từ bảng này mà gỡ đi

if (XOA) {
  const n = await db.home.deleteMany({ where: { desc: { startsWith: NHAN } } });
  const h = await db.host.deleteMany({ where: { brand: NHAN } });
  console.log(`Đã xoá ${n.count} căn và ${h.count} chủ nhà.`);
  await db.$disconnect();
  process.exit(0);
}

// ───── Gom chủ nhà theo SỐ ĐIỆN THOẠI ─────
// Tên viết mỗi chỗ một kiểu ("C Thi", "Chị Thi") nên số điện thoại mới là danh tính.
const chu = new Map();
for (const c of CAN) {
  const k = c.sdtChu || ('khong-sdt-' + c.ma);
  if (!chu.has(k)) chu.set(k, { ten: c.chuNha || 'Chủ nhà ' + k, sdt: c.sdtChu, can: [] });
  chu.get(k).can.push(c);
}
console.log(`${CAN.length} căn · ${chu.size} chủ nhà`);

const A = CAN.filter((c) => c.coChe === 'PHAN_TRAM');
const B = CAN.filter((c) => c.coChe === 'GIA_SAN');
console.log(`Cơ chế A (≥5tr, 10%): ${A.length} căn · cơ chế B (kê cố định): ${B.length} căn`);
console.log(`Có phường: ${CAN.filter((c) => c.phuong).length} · có tiện ích: ${CAN.filter((c) => c.tienIch.length).length}`);

const tien = (n) => (n == null ? '—' : Number(n).toLocaleString('vi-VN') + 'đ');
console.log('\nVài căn mẫu — số sales sẽ thấy trên chợ:');
for (const c of [A[0], B[0], B[B.length - 1]].filter(Boolean)) {
  if (c.coChe === 'PHAN_TRAM') {
    const hh = Math.round(c.listPrice * 0.1);
    console.log(`  ${c.ma} ${c.ten}  [A]  khách trả ${tien(c.listPrice)} · sales ${tien(hh)} · host ${tien(c.listPrice - hh)} (bảng ghi ${tien(c.giaHostThuong)})`);
  } else {
    console.log(`  ${c.ma} ${c.ten}  [B]  khách trả ${tien(c.floorPrice + c.markupMin)} · sales ${tien(c.markupMin)} · host ${tien(c.floorPrice)}`);
  }
}

if (!GHI) {
  console.log('\nXem trước xong. Thêm --ghi để nhập thật vào NHÁNH THỬ.');
  await db.$disconnect();
  process.exit(0);
}

// ───── Ghi ─────
let soHost = 0, soCan = 0, boQua = 0;
for (const [, h] of chu) {
  const hostRow = await db.host.create({
    data: { name: h.ten, brand: NHAN, phone: h.sdt || null, plan: 'FREE', internalAppEnabled: false,
      internalAppNote: 'Nhập từ bảng GOODSTAY để thử chợ — không phải host thật của Sabi' },
  });
  soHost++;
  for (const c of h.can) {
    const da = await db.home.findFirst({ where: { hostId: hostRow.id, name: c.ten } });
    if (da) { boQua++; continue; }
    await db.home.create({
      data: {
        name: c.ten,
        address: c.diaChi || 'Đà Lạt',
        // price / weekendPrice / holidayPrice là giá NỘI BỘ của host — giữ đúng số trong bảng
        price: c.giaHostThuong,
        weekendPrice: c.giaHostCT ?? null,
        holidayPrice: c.giaHostLe ?? null,
        // Bảng GOODSTAY ghi rõ "Ngày thường (T2-T5 & CN)" — đêm CN KHÔNG tính giá cuối tuần
        cuoiTuanGom: 'T6_T7',
        maxGuests: c.maxGuests,
        emoji: c.loai === 'VILLA' ? '🏘️' : c.loai === 'ROOM' ? '🛏️' : '🏡',
        desc: `${NHAN} · ${c.ma} · ${c.loai}`,
        hostId: hostRow.id,
        // ───── phần lên chợ ─────
        choTrangThai: 'DANG_BAN',
        salesTitle: c.ten,
        street: [c.soNha, c.duong].filter(Boolean).join(' ') || null,
        ward: c.phuong,
        // Khoảng cách đã có cột riêng — đừng nhét vào landmark nữa, thẻ căn sẽ nói hai lần.
        landmark: null,
        kmTrungTam: Number.isFinite(c.km) ? c.km : null,
        bedrooms: c.bedrooms,
        minGuests: null,
        amenities: c.tienIch,
        albumUrl: c.link,
        caretakerPhone: c.sdtChu,
        coCheHoaHong: c.coChe,
        listPrice: c.listPrice ?? null,
        listPriceWeekend: c.listPriceWeekend ?? null,
        listPriceHoliday: c.listPriceHoliday ?? null,
        commissionPct: c.commissionPct ?? null,
        floorPrice: c.floorPrice ?? null,
        floorPriceWeekend: c.floorPriceWeekend ?? null,
        floorPriceHoliday: c.floorPriceHoliday ?? null,
        markupMin: c.markupMin ?? null,
        markupHoliday: c.markupHoliday ?? null,
        // Chưa nối lịch -> chợ hiện mức ④, đúng thực tế: bảng này không có lịch
        lichNguon: null,
      },
    });
    soCan++;
  }
}

console.log(`\n✅ Đã tạo ${soHost} chủ nhà và ${soCan} căn (bỏ qua ${boQua} căn đã có).`);
console.log('Gỡ hết:  node scripts/nhap-can-goodstay.mjs --xoa');
await db.$disconnect();
