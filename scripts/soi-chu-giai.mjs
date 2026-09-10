// In phan cuoi tab + moi o co chu VA co mau, de tim chu giai mau cua bang.
//   node scripts/soi-chu-giai.mjs <id> "<ten tab>" [tuHang]
import { taiVaDoc, chuoiO } from '../src/lib/lich-sheet.js';

const [, , id, ten, tu = '25'] = process.argv;
const wb = await taiVaDoc(id);
const ws = wb.worksheets.find((w) => w.name === ten) || wb.worksheets[0];
console.log(`Tab "${ws.name}" · ${ws.rowCount} hang · ${ws.columnCount} cot\n`);

const mau = (cell) => {
  const f = cell.fill;
  return f && f.type === 'pattern' && f.pattern === 'solid' && f.fgColor && f.fgColor.argb
    ? f.fgColor.argb.slice(2) : '';
};

console.log('--- o vua co chu vua co mau (co the la chu giai) ---');
for (let r = +tu; r <= Math.min(ws.rowCount, +tu + 25); r++) {
  for (let c = 1; c <= Math.min(ws.columnCount, 20); c++) {
    const cell = ws.getRow(r).getCell(c);
    const v = chuoiO(cell.value).replace(/\s+/g, ' ').trim();
    const m = mau(cell);
    if (v) console.log(`  R${r}C${c} ${m ? '[' + m + '] ' : ''}${v.slice(0, 80)}`);
  }
}

console.log('\n--- dem mau trong vung du lieu ---');
const dem = new Map();
for (let r = 1; r <= Math.min(ws.rowCount, 60); r++) {
  for (let c = 1; c <= Math.min(ws.columnCount, 20); c++) {
    const m = mau(ws.getRow(r).getCell(c));
    if (m) dem.set(m, (dem.get(m) || 0) + 1);
  }
}
[...dem].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([m, n]) => console.log(`  ${m}  x${n}`));
