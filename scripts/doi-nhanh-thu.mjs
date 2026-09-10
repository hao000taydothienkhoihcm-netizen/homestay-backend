// Doi chuoi ket noi NHANH THU trong .env — KHONG phai go tay, KHONG lo dan nham dong.
//
//   Buoc 1: tren Neon bam nut Copy chuoi ket noi cua nhanh thu.
//   Buoc 2: chay   node scripts/doi-nhanh-thu.mjs
//
// Script tu lay chuoi trong clipboard, kiem tra dung dinh dang, sao luu .env cu,
// roi chi thay DUY NHAT dong DATABASE_URL_THU=... Cac dong khac khong dung toi.
// Man hinh chi in user@host/db — mat khau khong bao gio hien ra.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const KHOA = 'DATABASE_URL_THU';
const F = path.join(process.cwd(), '.env');

const layClipboard = () => {
  try {
    return execSync('powershell -NoProfile -Command "Get-Clipboard -Raw"', {
      encoding: 'utf8', windowsHide: true,
    });
  } catch { return ''; }
};

const chuoi = (process.argv[2] || layClipboard() || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');

if (!chuoi) {
  console.error('✕ Clipboard trong. Sang Neon bam Copy chuoi ket noi cua nhanh thu roi chay lai.');
  process.exit(1);
}
let u;
try { u = new URL(chuoi); } catch {
  console.error('✕ Cai trong clipboard khong phai chuoi ket noi. Copy lai cho dung.');
  process.exit(1);
}
if (!/^postgres(ql)?:$/.test(u.protocol) || !u.username || !u.hostname) {
  console.error('✕ Chuoi khong dung dang postgresql://user:mat-khau@host/db');
  process.exit(1);
}
if (!fs.existsSync(F)) { console.error('✕ Khong thay .env o', F); process.exit(1); }

const cu = fs.readFileSync(F, 'utf8');
const hostCua = (s) => { try { return new URL(s).host; } catch { return ''; } };
const dongCu = cu.split(/\r?\n/).find((d) => d.startsWith('DATABASE_URL=')) || '';
const hostChinh = hostCua(dongCu.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, ''));

if (hostChinh && u.host === hostChinh) {
  console.error('✕ Chuoi nay tro cung noi voi BAN CHINH. Nhanh thu phai la endpoint khac. Dung lai.');
  process.exit(1);
}

// Sao luu truoc khi sua — de con duong lui neu co gi sai.
const luu = F + '.bak-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
fs.writeFileSync(luu, cu, 'utf8');

const dong = `${KHOA}=${chuoi}`;
const co = new RegExp(`^${KHOA}=.*$`, 'm');
const moi = co.test(cu)
  ? cu.replace(co, dong)
  : cu.replace(/\s*$/, '\n') + dong + '\n';
fs.writeFileSync(F, moi, 'utf8');

console.log('✓ Da cap nhat', KHOA);
console.log('  tro toi   :', `${u.username}@${u.host}${u.pathname}`);
console.log('  sao luu   :', path.basename(luu));
console.log('\nGio chay:  node scripts/soi-nhanh-thu.mjs   (xem nhanh thu co gi)');
