// Soi xem cot nao trong tab duoc coi la "cot ngay", va o ngay thuc su la kieu gi.
//   node scripts/soi-cot-ngay.mjs <id> "<ten tab>"
import { taiVaDoc, chuoiO } from '../src/lib/lich-sheet.js';

const [, , id, ten] = process.argv;
const wb = await taiVaDoc(id);
const ws = wb.worksheets.find((w) => w.name === ten) || wb.worksheets[0];
console.log(`Tab "${ws.name}" · ${ws.rowCount} hang · ${ws.columnCount} cot\n`);

for (let r = 4; r <= 9; r++) {
  const h = ws.getRow(r);
  for (let c = 1; c <= 8; c++) {
    const v = h.getCell(c).value;
    if (v == null || v === '') continue;
    console.log(`R${r}C${c} type=${typeof v} ctor=${v && v.constructor && v.constructor.name} val=${JSON.stringify(chuoiO(v)).slice(0, 40)} raw=${JSON.stringify(v).slice(0, 60)}`);
  }
  console.log('  ---');
}
