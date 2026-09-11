// Hai việc chủ nhà chỉ ngày 11/09/2026:
//   1. G-030 LE BEAU REVE VILLA là căn cũ của G-092 (cùng một nhà, trước khi cải tạo)
//      -> ẨN khỏi chợ. Ẩn chứ không xoá hẳn: xoá là mất luôn lịch + lịch sử, mà chỉ
//      cần một chữ "xoá hẳn" là làm được, còn đã xoá thì không lấy lại được.
//   2. G-081 NHÀ CỦA GẤU 3 có trong danh bạ nhưng rớt khỏi tab giá.
//      Giá đọc thẳng từ bảng lịch của chủ nhà -> thêm vào chợ.
//
//   node scripts/them-can-tu-bang.mjs         -> xem trước
//   node scripts/them-can-tu-bang.mjs --ghi   -> ghi vào NHÁNH THỬ
import 'dotenv/config';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const GHI = process.argv.includes('--ghi');
const url = process.env.DATABASE_URL_THU;
if (!url) { console.error('✕ Thiếu DATABASE_URL_THU'); process.exit(1); }
const host = (u) => (u.match(/@([^/]+)/) || [, '?'])[1];
if (host(url) === host(process.env.DATABASE_URL || '')) {
  console.error('✕ Cùng endpoint với production. Dừng.'); process.exit(1);
}
const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });

const tien = (x) => (x == null ? '—' : x.toLocaleString('vi-VN') + 'đ');
const timMa = async (ma) => (await db.home.findMany({
  where: { desc: { startsWith: 'GOODSTAY' } },
  select: { id: true, name: true, desc: true, hostId: true, choTrangThai: true, active: true, address: true },
})).find((c) => c.desc.includes(ma));

// ───── 1. Ẩn G-030 ─────
console.log('── 1. G-030 LE BEAU REVE VILLA ──');
const cu = await timMa('G-030');
if (!cu) console.log('  Không thấy trong nhánh thử (có thể đã ẩn/xoá trước đó).');
else {
  const dem = await db.lichKhoa.count({ where: { homeId: cu.id } });
  const bk = await db.booking.count({ where: { homeId: cu.id } });
  console.log(`  #${cu.id} ${cu.name} · chợ: ${cu.choTrangThai} · ${dem} đêm khoá · ${bk} booking`);
  console.log(`  -> đặt choTrangThai = AN, active = false (giữ nguyên lịch, không xoá dòng nào)`);
  if (GHI) {
    await db.home.update({ where: { id: cu.id }, data: { choTrangThai: 'AN', active: false } });
    console.log('  ✓ đã ẩn');
  }
}

// ───── 2. Thêm G-081 ─────
console.log('\n── 2. G-081 NHÀ CỦA GẤU 3 ──');
const [x] = JSON.parse(fs.readFileSync(new URL('./du-lieu/can-them-tay.json', import.meta.url), 'utf8'));
const daCo = await timMa(x.ma);
if (daCo) {
  console.log(`  Đã có sẵn #${daCo.id} ${daCo.name} — không thêm nữa.`);
} else {
  const anh = await timMa(x.hostGiongCan);            // mượn hostId của căn cùng chủ
  if (!anh) { console.log(`  ✕ Không thấy ${x.hostGiongCan} để lấy hostId. Dừng.`); }
  else {
    const data = {
      name: x.ten,
      address: x.diaChi,
      desc: `GOODSTAY · ${x.ma} · ${x.loai}`,
      hostId: anh.hostId,
      emoji: '🏡',
      active: true,
      price: x.giaThuong,
      weekendPrice: x.giaCuoiTuan,
      holidayPrice: x.giaLe,
      maxGuests: x.maxGuests ?? 8,
      minGuests: x.minGuests,
      bedrooms: x.bedrooms,
      street: x.duong,
      ward: x.phuong,
      choTrangThai: 'DANG_BAN',
      coCheHoaHong: x.coChe,
      floorPrice: x.giaThuong,
      floorPriceWeekend: x.giaCuoiTuan,
      floorPriceHoliday: x.giaLe,
      markupMin: x.markupMin,
      markupMax: x.markupMax,
      salesInfo: x.ghiChuKhaiThem,
      cuoiTuanGom: 'T6_T7_CN',
    };
    console.log(`  Tên      : ${data.name}`);
    console.log(`  Chủ nhà  : hostId ${data.hostId} (mượn của ${x.hostGiongCan} ${anh.name})`);
    console.log(`  Địa chỉ  : ${data.address}`);
    console.log(`  Giá      : thường ${tien(data.price)} · cuối tuần ${tien(data.weekendPrice)} · lễ ${tien(data.holidayPrice)}`);
    console.log(`  Cơ chế   : ${data.coCheHoaHong} · kê từ ${tien(data.markupMin)} đến ${tien(data.markupMax)}`);
    console.log(`  Khách    : tối đa ${data.maxGuests} · phòng ngủ ${data.bedrooms ?? 'chưa rõ'} · phường ${data.ward ?? 'CHƯA RÕ'}`);
    if (GHI) {
      const m = await db.home.create({ data, select: { id: true } });
      console.log(`  ✓ đã thêm #${m.id}`);
    }
  }
}

// ───── 3. Ghi thêm cặp ghép lịch tay ─────
const F = new URL('./du-lieu/ghep-lich-tay.json', import.meta.url);
const g = JSON.parse(fs.readFileSync(F, 'utf8'));
if (!g[x.ma]) {
  console.log(`\n── 3. Ghép lịch tay: ${x.ma} -> "${x.tenKhoiLich}" ──`);
  if (GHI) {
    g[x.ma] = x.tenKhoiLich;
    fs.writeFileSync(F, JSON.stringify(g, null, 2) + '\n', 'utf8');
    console.log('  ✓ đã ghi ghep-lich-tay.json');
  }
}

console.log(GHI ? '\nXong. Chạy đồng bộ lịch để căn mới có lịch.' : '\nThêm --ghi để làm thật.');
await db.$disconnect();
