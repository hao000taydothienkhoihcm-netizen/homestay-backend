// Đổi mọi file route sang routerAnToan() — chạy MỘT LẦN, giữ lại để đọc hiểu
// đã đổi những gì, và để nếu sau này thêm file route thì chạy lại là xong.
//
// Đổi đúng 2 dòng mỗi file:
//   import { Router } from 'express';   ->  bỏ (nếu không còn chỗ nào dùng Router)
//   const router = Router();            ->  const router = routerAnToan();
// và thêm import routerAnToan.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '../src/routes');
let doi = 0;

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
  const duong = path.join(DIR, f);
  let s = fs.readFileSync(duong, 'utf8');
  if (s.includes('routerAnToan')) { console.log(`  (da doi) ${f}`); continue; }
  if (!/const router = Router\(\);/.test(s)) { console.log(`  (bo qua) ${f} — khong thay 'const router = Router();'`); continue; }

  s = s.replace(/const router = Router\(\);/, 'const router = routerAnToan();');

  // Còn chỗ nào dùng Router nữa không (VD Router({ mergeParams: true }))?
  const conDungRouter = /\bRouter\s*\(/.test(s);
  if (conDungRouter) {
    s = s.replace(/^import \{ Router \} from 'express';$/m,
      "import { Router } from 'express';\nimport { routerAnToan } from '../lib/router-an-toan.js';");
  } else {
    s = s.replace(/^import \{ Router \} from 'express';$/m,
      "import { routerAnToan } from '../lib/router-an-toan.js';");
  }

  fs.writeFileSync(duong, s, 'utf8');   // Node ghi utf8 KHÔNG kèm BOM
  console.log(`  doi xong ${f}`);
  doi++;
}

console.log(`\nDa doi ${doi} file.\n`);
