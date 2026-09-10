// Thu tung bo loc chuyen sau cua /v1/cho tren may (cong 3202).
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const token = jwt.sign({ id: 1, role: 'SALES', hostId: null }, process.env.JWT_SECRET, { expiresIn: '10m' });
const H = { Authorization: 'Bearer ' + token };
const G = 'http://localhost:3202';
const goi = async (qs) => (await fetch(G + '/v1/cho' + (qs ? '?' + qs : ''), { headers: H })).json();
const tien = (n) => (n == null ? '—' : Number(n).toLocaleString('vi-VN') + 'đ');

const ti = await (await fetch(G + '/v1/cho/tien-ich', { headers: H })).json();
console.log('Tien ich co that:', ti.map((t) => `${t.ten} (${t.soCan})`).join(' · '));

const goc = await goi('');
console.log('\nKhong loc      :', goc.soCan, '/', goc.tongCan, 'can · sap:', goc.sap,
  '· dai 14 dem tu', goc.dai.tu);
const coBan = goc.can.filter((c) => c.ban.length);
console.log('  Can co dem ban trong 14 dem toi:', coBan.length,
  coBan.slice(0, 3).map((c) => `#${c.id}(${c.ban.length})`).join(' '));

const thu = [
  ['pnMin=4', 'Tu 4 phong ngu'],
  ['kmMax=3', 'Trong 3 km'],
  ['kmMax=1', 'Trong 1 km'],
  ['giaMin=2000000&giaMax=3000000', 'Host nhan 2–3 trieu'],
  ['giaMax=1000000', 'Host nhan duoi 1 trieu'],
  ['tienIch=bbq', 'Co BBQ'],
  ['tienIch=bbq,hồ bơi', 'Co ca BBQ + ho boi'],
  ['pnMin=3&kmMax=5&tienIch=bbq', 'Ket hop 3 dieu kien'],
  ['khach=12', '12 khach'],
];
for (const [qs, ten] of thu) {
  const r = await goi(qs);
  const them = r.chuaDoKm ? ` (${r.chuaDoKm} can chua do km bi loai)` : '';
  console.log(`  ${ten.padEnd(26)} ${String(r.soCan).padStart(3)} can${them}`);
}

console.log('\nO tim — go ten duong (truoc day bi sot vi chi quet tieu de):');
for (const t of ['Trần Thái Tông', 'Nguyễn Công Trứ', 'Hùng Vương', 'view đồi']) {
  const r = await goi('q=' + encodeURIComponent(t));
  console.log(`  "${t}"`.padEnd(24), r.soCan, 'can', r.can.slice(0, 2).map((c) => c.salesTitle).join(' · '));
}

console.log('\nSap xep:');
for (const s of ['muc', 'giaAsc', 'giaDesc', 'sucChua', 'km']) {
  const r = await goi('sap=' + s);
  const d = r.can.slice(0, 3).map((c) => {
    const g = c.gia.dem?.thuong?.khachTra;
    return `${(c.salesTitle || '?').slice(0, 18)} [${tien(g)}·${c.maxGuests}k·${c.kmTrungTam ?? '?'}km·muc${c.lich.muc}]`;
  });
  console.log(`  ${s.padEnd(8)} ${d.join('  ')}`);
}

const ct = await (await fetch(G + `/v1/cho/${goc.can[0].id}`, { headers: H })).json();
console.log('\nChi tiet can dau — truong KHONG duoc lo:');
for (const k of ['address', 'street', 'caretakerPhone', 'rules', 'floorPrice', 'name', 'lat', 'lng', 'mapLink']) {
  console.log(`  ${k.padEnd(16)} ${k in ct ? '✕ BI LO' : '✓ khong co'}`);
}
console.log('  kmTrungTam       ', 'kmTrungTam' in ct ? '✓ co (duoc phep)' : '— khong co');
