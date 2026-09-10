// Gọi thử API chợ đang chạy ở localhost:3202 bằng token SALES tự ký.
// Chỉ dùng dưới máy: token ký bằng JWT_SECRET trong .env, máy chủ thật có secret khác.
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const token = jwt.sign({ id: 1, role: 'SALES', hostId: null }, process.env.JWT_SECRET, { expiresIn: '10m' });
const H = { Authorization: 'Bearer ' + token };
const G = 'http://localhost:3202';
const tien = (n) => (n == null ? '—' : Number(n).toLocaleString('vi-VN') + 'đ');

const ds = await (await fetch(G + '/v1/cho', { headers: H })).json();
console.log('Tổng căn đang bán:', ds.soCan);

const phuong = await (await fetch(G + '/v1/cho/phuong', { headers: H })).json();
console.log('Phường có hàng   :', phuong.join(' · '));

const loc = await (await fetch(G + '/v1/cho?khach=12&ward=' + encodeURIComponent('Phường 5'), { headers: H })).json();
console.log('Lọc 12 khách + Phường 5:', loc.soCan, 'căn');

console.log('\n5 căn đầu:');
for (const c of ds.can.slice(0, 5)) {
  const d = c.gia.dem;
  console.log(`  #${c.id} ${c.salesTitle}`);
  console.log(`     ${c.ward || '—'} · ${c.bedrooms || '?'} PN · tối đa ${c.maxGuests} khách · lịch mức ${c.lich.muc} (${c.lich.ten})`);
  console.log(`     cơ chế ${c.gia.coChe} · cuối tuần ${c.gia.cuoiTuanGom}`);
  console.log(`     thường ${tien(d.thuong?.khachTra)} (hh ${tien(d.thuong?.hoaHong)}) · cuối tuần ${tien(d.cuoiTuan?.khachTra)} · lễ ${tien(d.le?.khachTra)}`);
}

const ct = await (await fetch(G + `/v1/cho/${ds.can[0].id}`, { headers: H })).json();
console.log('\nChi tiết căn đầu — những trường KHÔNG được lộ cho sales:');
for (const k of ['address', 'street', 'caretakerPhone', 'rules', 'floorPrice', 'name']) {
  console.log(`  ${k.padEnd(16)} ${k in ct ? '✕ BỊ LỘ: ' + JSON.stringify(ct[k]) : '✓ không có'}`);
}
