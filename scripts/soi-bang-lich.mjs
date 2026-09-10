// Tai mot bang tinh lich cua chu nha (cong khai) va in ra hinh dang.
//   node scripts/soi-bang-lich.mjs <spreadsheetId|url> [gid] [soDongIn]
import fs from 'node:fs';

const vao = process.argv[2];
if (!vao) { console.error('Thieu id hoac url'); process.exit(1); }
const ID = (vao.match(/\/d\/([\w-]{20,})/) || [, vao])[1];
const GID = process.argv[3] && process.argv[3] !== '-' ? process.argv[3] : null;
const IN = parseInt(process.argv[4] || '45');

const url = `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv${GID ? '&gid=' + GID : ''}`;
const r = await fetch(url, { redirect: 'follow' });
console.log('HTTP', r.status, '·', r.headers.get('content-type'));
if (!r.ok) { console.error('Khong doc duoc — bang co the chua bat chia se "bat ky ai co link".'); process.exit(1); }
const csv = await r.text();
fs.mkdirSync('_sheet', { recursive: true });
const ten = `_sheet/${ID.slice(0, 8)}${GID ? '-' + GID : ''}.csv`;
fs.writeFileSync(ten, csv, 'utf8');

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

const h = tach(csv);
console.log(`${h.length} hang · rong nhat ${Math.max(...h.map((x) => x.length))} cot · da luu ${ten}\n`);
for (let i = 0; i < Math.min(IN, h.length); i++) {
  const o = (h[i] || []).map((x) => (x || '').replace(/\s+/g, ' ').slice(0, 14));
  console.log(String(i + 1).padStart(4) + '|' + o.slice(0, 16).map((x) => x.padEnd(14)).join('|'));
}
