// In hinh dang mot tab trong bang tinh cong khai (tai ve .xlsx roi doc).
//   node scripts/soi-tab-xlsx.mjs <id> "<ten tab>" [soDong] [soCot]
import { taiVaDoc, chuoiO } from '../src/lib/lich-sheet.js';

const [, , id, ten, soDong = '16', soCot = '16'] = process.argv;
const wb = await taiVaDoc(id);
const ws = wb.worksheets.find((w) => w.name === ten) || wb.worksheets[0];
console.log(`Tab "${ws.name}" · ${ws.rowCount} hang · ${ws.columnCount} cot\n`);
const R = Math.min(+soDong, ws.rowCount), C = Math.min(+soCot, ws.columnCount, 40);
for (let r = 1; r <= R; r++) {
  const h = ws.getRow(r);
  const o = [];
  for (let c = 1; c <= C; c++) {
    const cell = h.getCell(c);
    const v = chuoiO(cell.value).replace(/\s+/g, ' ').slice(0, 13);
    const f = cell.fill;
    const mau = f && f.type === 'pattern' && f.pattern === 'solid' && f.fgColor && f.fgColor.argb
      ? f.fgColor.argb.slice(2, 8) : '';
    o.push((v || (mau ? '[' + mau + ']' : '')).padEnd(14));
  }
  console.log(String(r).padStart(3) + '|' + o.join('|'));
}
