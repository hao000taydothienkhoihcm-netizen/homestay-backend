// Tai mot tab cua Google Sheet cong khai ve dang CSV va in ra hinh dang cua no,
// de biet bang lich nam o dau, hang nao cot nao.
//
//   node scripts/soi-tab-sheet.mjs [gid] [soDongIn]
import fs from 'node:fs';

const ID = '1OMYcVyyq-VtIPBF7T8oNsLdDTIqP0Hg4u5tc-UVLZTM';
const GID = process.argv[2] || '1851932432';
const IN = parseInt(process.argv[3] || '40');

const r = await fetch(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=${GID}`);
if (!r.ok) { console.error('HTTP', r.status); process.exit(1); }
const csv = await r.text();
fs.mkdirSync('_sheet', { recursive: true });
fs.writeFileSync(`_sheet/gid-${GID}.csv`, csv, 'utf8');

// Tach CSV co dau nhay va xuong dong trong o
function tach(s) {
  const hang = []; let o = '', d = [], trong = false;
  for (let i = 0; i < s.length; i++) {
    const k = s[i];
    if (trong) {
      if (k === '"') { if (s[i + 1] === '"') { o += '"'; i++; } else trong = false; }
      else o += k;
    } else if (k === '"') trong = true;
    else if (k === ',') { d.push(o); o = ''; }
    else if (k === '\n') { d.push(o); hang.push(d); d = []; o = ''; }
    else if (k !== '\r') o += k;
  }
  if (o || d.length) { d.push(o); hang.push(d); }
  return hang;
}

const h = tach(csv);
console.log(`gid ${GID} · ${h.length} hang · rong nhat ${Math.max(...h.map((x) => x.length))} cot · ${csv.length} ky tu`);
console.log(`(da luu _sheet/gid-${GID}.csv)\n`);
for (let i = 0; i < Math.min(IN, h.length); i++) {
  const o = h[i].map((x) => (x || '').replace(/\s+/g, ' ').slice(0, 18));
  console.log(String(i + 1).padStart(4) + ' | ' + o.slice(0, 14).map((x) => x.padEnd(18)).join('|'));
}
