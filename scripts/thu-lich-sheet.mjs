// Thu doc lich that tu bang cua chu nha GOODSTAY, in ra de doi chieu bang mat.
//
//   node scripts/thu-lich-sheet.mjs            -> thu 4 bang dau
//   node scripts/thu-lich-sheet.mjs <url|id>   -> thu dung mot bang
//   node scripts/thu-lich-sheet.mjs <url> <tenTab>
import fs from 'node:fs';
import { taiVaDoc, docTab, idBangTinh, thangCuaTab, chonTab } from '../src/lib/lich-sheet.js';

const O = { trong: '·', ban: '█', giu: '▒', khoa: '▓', khongRo: '?' };
const homNay = new Date().toISOString().slice(0, 10);
const thangNay = homNay.slice(0, 7);

function veThang(ngay) {
  // Ve mot dai theo ngay trong thang cho de nhin
  const d = new Map(ngay.map((x) => [x.ngay, x]));
  const ds = [...d.keys()].sort();
  if (!ds.length) return '';
  return ds.map((k) => O[d.get(k).trangThai] || '?').join('');
}

async function thuMot(id, tenTabMuon) {
  console.log('\n═══ bang', id, '═══');
  let wb;
  try { wb = await taiVaDoc(id); } catch (e) { console.log('  ✕', e.message); return; }
  const tabs = wb.worksheets.map((w) => w.name);
  console.log('  Tab:', tabs.join(' · '));

  // Chon tab dung thang nay (hoac tab nguoi dung chi dinh)
  let ws = tenTabMuon ? wb.worksheets.find((w) => w.name === tenTabMuon) : null;
  if (!ws) {
    const [y, m] = thangNay.split('-').map(Number);
    const chon = chonTab(wb, m, y);
    ws = chon && chon.w;
  }
  if (!ws) { console.log('  ✕ Khong thay tab cua thang', thangNay); return; }
  const moc = thangCuaTab(ws.name);
  console.log(`  Doc tab "${ws.name}" -> thang ${moc.m}/${moc.y}\n`);

  const khoi = docTab(ws, ws.name);
  if (!khoi.length) { console.log('  ✕ Khong nhan ra bang lich nao trong tab nay'); return; }

  for (const k of khoi) {
    const dem = { trong: 0, ban: 0, giu: 0, khoa: 0, khongRo: 0 };
    for (const n of k.ngay) dem[n.trangThai]++;
    console.log(`  ${(k.ten || '(khong ro ten)').slice(0, 30).padEnd(30)} ${k.ngay.length} ngay`);
    console.log(`    ${veThang(k.ngay)}`);
    console.log(`    trong ${dem.trong} · da ban ${dem.ban} · giu ${dem.giu} · khoa ${dem.khoa}`);
    if (dem.trong === k.ngay.length) console.log('    (ca thang trong — coi chung bang nay khong to mau)');
    const ban = k.ngay.filter((n) => n.trangThai !== 'trong');
    if (ban.length) {
      console.log('    ngay khong trong:', ban.slice(0, 8).map((n) => `${n.ngay.slice(8)}(${O[n.trangThai]}${n.saler ? '·' + n.saler : ''})`).join(' '), ban.length > 8 ? `+${ban.length - 8}` : '');
    }
    const g = k.ngay.map((n) => n.gia).filter(Boolean);
    if (g.length) console.log(`    gia trong bang: ${Math.min(...g).toLocaleString('vi-VN')} – ${Math.max(...g).toLocaleString('vi-VN')}đ`);
  }
}

console.log(`Hom nay ${homNay} · chu giai: ${O.trong} trong · ${O.ban} da ban · ${O.giu} giu cho coc · ${O.khoa} chu nha khoa`);

const doiSo = process.argv[2];
if (doiSo) {
  await thuMot(idBangTinh(doiSo) || doiSo, process.argv[3]);
} else {
  const F = new URL('./du-lieu/link-lich-goodstay.json', import.meta.url);
  if (!fs.existsSync(F)) { console.error('Chay truoc: node scripts/boc-link-lich.mjs'); process.exit(1); }
  const can = JSON.parse(fs.readFileSync(F, 'utf8'));
  const da = new Set();
  let n = 0;
  for (const x of can) {
    const id = idBangTinh(x.link.booking);
    if (!id || da.has(id)) continue;
    da.add(id);
    console.log(`\n(can dai dien: ${x.ma} ${x.ten})`);
    await thuMot(id);
    if (++n >= (parseInt(process.env.SO_BANG) || 4)) break;
  }
}
