// Boc "Link Booking (host)" cua tung can tu tab danh ba GOODSTAY.
// Moi can co MOT BANG TINH RIENG cua chinh chu nha — do moi la lich that.
import fs from 'node:fs';

const CSV = '_sheet/gid-1851932432.csv';
if (!fs.existsSync(CSV)) { console.error('Chay truoc: node scripts/soi-tab-sheet.mjs 1851932432'); process.exit(1); }

function tach(s) {
  const hang = []; let o = '', d = [], trong = false;
  for (let i = 0; i < s.length; i++) {
    const k = s[i];
    if (trong) { if (k === '"') { if (s[i + 1] === '"') { o += '"'; i++; } else trong = false; } else o += k; }
    else if (k === '"') trong = true;
    else if (k === ',') { d.push(o); o = ''; }
    else if (k === '\n') { d.push(o); hang.push(d); d = []; o = ''; }
    else if (k !== '\r') o += k;
  }
  if (o || d.length) { d.push(o); hang.push(d); }
  return hang;
}

const h = tach(fs.readFileSync(CSV, 'utf8'));
const rong = Math.max(...h.map((x) => x.length));
const can = [];

// Bang xep 5 can theo chieu ngang, moi can chiem 3 cot (ma | ten | trong).
for (let c = 0; c + 1 < rong; c += 3) {
  for (let r = 0; r < h.length; r++) {
    const ma = (h[r][c] || '').trim();
    if (!/^G-\d+$/.test(ma)) continue;
    const x = { ma, ten: (h[r][c + 1] || '').trim(), link: {} };
    // Cac dong nhan ngay duoi ma can, toi khi gap ma can khac hoac het khoi
    for (let k = r + 1; k < h.length; k++) {
      const nhan = (h[k][c] || '').trim();
      const gt = (h[k][c + 1] || '').trim();
      if (/^G-\d+$/.test(nhan)) break;
      if (!nhan && !gt) continue;
      if (/booking/i.test(nhan)) x.link.booking = gt;
      else if (/zalo/i.test(nhan)) x.link.zalo = gt;
      else if (/ảnh|anh/i.test(nhan)) x.link.anh = gt;
      else if (/maps/i.test(nhan)) x.link.maps = gt;
    }
    can.push(x);
  }
}

const coBooking = can.filter((x) => /docs\.google\.com/.test(x.link.booking || ''));
console.log(`${can.length} can · ${coBooking.length} can co link bang booking rieng`);
const idCua = (u) => (u.match(/\/d\/([\w-]{20,})/) || [, null])[1];
const gidCua = (u) => (u.match(/gid=(\d+)/) || [, null])[1];
console.log('\n8 can dau:');
for (const x of coBooking.slice(0, 8)) {
  console.log(`  ${x.ma} ${x.ten.slice(0, 24).padEnd(24)} id ${idCua(x.link.booking)} gid ${gidCua(x.link.booking) || '(khong co)'}`);
}
const idKhac = new Set(coBooking.map((x) => idCua(x.link.booking)));
console.log(`\nSo BANG TINH khac nhau: ${idKhac.size} (moi chu nha thuong mot bang)`);

fs.mkdirSync('scripts/du-lieu', { recursive: true });
fs.writeFileSync('scripts/du-lieu/link-lich-goodstay.json', JSON.stringify(coBooking, null, 1));
console.log('Da luu scripts/du-lieu/link-lich-goodstay.json');
