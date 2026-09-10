// Thu ham boc toa do tu link Google Maps. Khong can mang (tru link rut gon).
import { bocToaDo, khoangCachKm, TRUNG_TAM } from '../src/lib/vitri.js';

const CA = [
  ['Link place day du (co !3d!4d)',
    'https://www.google.com/maps/place/Cho+Da+Lat/@11.9415,108.4372,17z/data=!3m1!4b1!4m6!3m5!1s0x317112:0x9!8m2!3d11.9424!4d108.4378',
    { lat: 11.9424, lng: 108.4378 }],
  ['Link chi co @', 'https://www.google.com/maps/@11.9500,108.4400,15z', { lat: 11.95, lng: 108.44 }],
  ['Link ?q=', 'https://maps.google.com/?q=11.9333,108.4200', { lat: 11.9333, lng: 108.42 }],
  ['Link ?ll=', 'https://maps.google.com/maps?ll=11.9600,108.4500&z=16', { lat: 11.96, lng: 108.45 }],
  ['Dan thang toa do', '11.9415, 108.4372', { lat: 11.9415, lng: 108.4372 }],
  ['Toa do go nguoc thu tu', '108.4372, 11.9415', { lat: 11.9415, lng: 108.4372 }],
  ['Ngoai vung Da Lat (Ha Noi)', 'https://maps.google.com/?q=21.0285,105.8542', null],
  ['Khong phai link ban do', 'https://docs.google.com/spreadsheets/d/abc', null],
  ['Rong', '', null],
];

let sai = 0;
for (const [ten, vao, mong] of CA) {
  const ra = bocToaDo(vao);
  const ok = mong === null
    ? ra === null
    : ra && Math.abs(ra.lat - mong.lat) < 1e-6 && Math.abs(ra.lng - mong.lng) < 1e-6;
  if (!ok) sai++;
  console.log(`${ok ? '✓' : '✕'} ${ten.padEnd(32)} ${ra ? `${ra.lat}, ${ra.lng}${ra.daDao ? ' (da dao lai)' : ''}` : 'khong ra'}`);
}

console.log(`\nMoc trung tam: ${TRUNG_TAM.ten} ${TRUNG_TAM.lat}, ${TRUNG_TAM.lng}`);
const KC = [
  ['Ngay tai cho', 11.94155, 108.437214, 0],
  ['Ho Xuan Huong (~700m)', 11.9435, 108.4450, 0.9],
  ['Ga Da Lat (~2km)', 11.9425, 108.4550, 1.9],
];
for (const [ten, la, ln, mong] of KC) {
  const km = khoangCachKm(la, ln);
  const ok = Math.abs(km - mong) <= 0.4;
  if (!ok) sai++;
  console.log(`${ok ? '✓' : '✕'} ${ten.padEnd(32)} ${km} km (mong ~${mong})`);
}

console.log(sai ? `\n✕ ${sai} truong hop sai` : '\n✓ Tat ca deu dung');
process.exit(sai ? 1 : 0);
