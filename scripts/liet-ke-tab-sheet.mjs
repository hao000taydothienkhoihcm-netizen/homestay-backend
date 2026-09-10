// Liet ke cac tab (sheet) cua mot Google Sheet cong khai, KHONG can dang nhap.
// Trang htmlview cua bang lon rat nang, nen doc theo dong chay va DUNG NGAY khi
// da lay du menu tab, thay vi tai het ca tram MB.
//
//   node scripts/liet-ke-tab-sheet.mjs [spreadsheetId]
import fs from 'node:fs';

const ID = process.argv[2] || '1OMYcVyyq-VtIPBF7T8oNsLdDTIqP0Hg4u5tc-UVLZTM';
const TOI_DA = 60 * 1024 * 1024;     // doc toi da 60 MB roi bo cuoc

const r = await fetch(`https://docs.google.com/spreadsheets/d/${ID}/htmlview`);
console.log('HTTP', r.status, '·', r.headers.get('content-type'));
if (!r.ok) process.exit(1);

const doc = new TextDecoder('utf-8');
let dem = 0, kho = '', xong = false;
for await (const cuc of r.body) {
  dem += cuc.length;
  kho += doc.decode(cuc, { stream: true });
  if (kho.includes('</ul>') && kho.includes('sheet-menu')) { xong = true; break; }
  if (dem > TOI_DA) break;
  // giu kho khong phinh vo han: chi can phan sau cung
  if (kho.length > 8e6 && !kho.includes('sheet-menu')) kho = kho.slice(-2e6);
}
console.log('Doc', (dem / 1048576).toFixed(1), 'MB ·', xong ? 'tim thay menu' : 'chua thay menu');

const ds = [];
const re = /id=["']sheet-button-(\d+)["'][^>]*>(?:\s*<a[^>]*>)?([^<]*)/g;
let m;
while ((m = re.exec(kho))) ds.push({ gid: m[1], ten: m[2].trim() });

if (!ds.length) {
  fs.writeFileSync('_sheet-dau.html', kho.slice(0, 400000));
  console.log('Khong boc duoc ten tab. Luu tam _sheet-dau.html de soi.');
} else {
  console.log(`\n${ds.length} tab:`);
  ds.forEach((x, i) => console.log(`  ${String(i + 1).padStart(3)}. gid ${x.gid.padEnd(12)} ${x.ten}`));
  fs.mkdirSync('scripts/du-lieu', { recursive: true });
  fs.writeFileSync('scripts/du-lieu/tab-sheet-goodstay.json', JSON.stringify(ds, null, 1));
  console.log('\nDa luu scripts/du-lieu/tab-sheet-goodstay.json');
}
