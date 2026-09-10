// Liet ke TEN cac khoa trong cac file .env va endpoint Neon cua tung chuoi ket noi.
// KHONG in mat khau: chi in user@host/db.
import fs from 'node:fs';

const che = (v) => {
  const s = String(v).trim().replace(/^["']|["']$/g, '');
  try { const u = new URL(s); return `${u.username}@${u.host}${u.pathname}`; }
  catch { return s.length > 24 ? '(gia tri khac, ' + s.length + ' ky tu)' : '(gia tri ngan)'; }
};

for (const f of process.argv.slice(2)) {
  console.log('\n=== ' + f + ' ===');
  if (!fs.existsSync(f)) { console.log('  (khong co file)'); continue; }
  for (const d of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = d.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) { if (d.trim().startsWith('#') && d.includes('://')) console.log('  (dong ghi chu co chuoi ket noi)'); continue; }
    const [, k, v] = m;
    console.log('  ' + k.padEnd(22) + (v.includes('://') ? che(v) : '(khong phai chuoi ket noi)'));
  }
}
