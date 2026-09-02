// Ra soat BOM (EF BB BF) o dau cac file JSON.
//
// Vi sao co script nay: PowerShell `Set-Content -Encoding utf8` tren Windows
// chen BOM vao dau file. Node doc package.json van chay duoc, npm install cung
// khong sao — nhung `npx prisma` thi bao:
//     Unexpected token "﻿", "{ "na"... is not valid JSON
// va Render bao "Build failed" sau 11 giay, khong noi ro file nao.
// Da dinh mot lan o commit dc6bde6, mat mot lan deploy moi tim ra.
//
// Quy tac: KHONG bao gio ghi file JSON bang PowerShell. Dung Node (fs.writeFileSync)
// hoac tool ghi file, ca hai deu khong chen BOM.
//
// Chi doc file, khong sua gi. Co BOM thi thoat ma 1.
import fs from 'node:fs';
import path from 'node:path';

const GOC = path.resolve(import.meta.dirname, '..');
const BO_QUA = new Set(['node_modules', '.git', 'dist']);

const dinh = [];
let daRa = 0;

function quet(thuMuc) {
  for (const m of fs.readdirSync(thuMuc, { withFileTypes: true })) {
    if (BO_QUA.has(m.name)) continue;
    const duong = path.join(thuMuc, m.name);
    if (m.isDirectory()) { quet(duong); continue; }
    if (!m.name.endsWith('.json')) continue;
    daRa++;
    const b = fs.readFileSync(duong);
    if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) {
      dinh.push(path.relative(GOC, duong));
    }
  }
}

quet(GOC);

console.log(`\nDa ra ${daRa} file JSON.\n`);
if (dinh.length === 0) {
  console.log('OK - khong file nao dinh BOM.\n');
  process.exit(0);
}
console.log(`LOI - ${dinh.length} file dinh BOM, Render se build that bai:\n`);
for (const f of dinh) console.log(`   ${f}`);
console.log('\nSua bang Node:');
console.log("   node -e \"const fs=require('fs');const p='<file>';let s=fs.readFileSync(p,'utf8');if(s.charCodeAt(0)===0xFEFF)fs.writeFileSync(p,s.slice(1));\"\n");
process.exit(1);
