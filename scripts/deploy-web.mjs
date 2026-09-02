// ═══════════════════════════════════════════════════════════════
// deploy-web.mjs — Gộp 3 bước đưa web React lên Render vào 1 lệnh.
//
//   npm run deploy:web
//
// VÌ SAO CẦN: Render deploy từ repo homestay-backend, còn code web nằm ở
// repo sabihome. Push sabihome KHÔNG làm Render đổi gì. Phải build sabihome
// rồi chép dist/ vào public/ và commit ở đây. Bước chép này từng bị quên
// một lần (01/09/2026) — deploy xong web vẫn chạy bản cũ mà không báo lỗi gì.
//
// Script này còn ghi public/build-info.json để về sau luôn trả lời được câu
// "web thật đang chạy code nào": mở https://<domain>/build-info.json là thấy.
//
// KHÔNG tự commit, không tự push — chỉ chuẩn bị file rồi in ra việc cần làm.
// ═══════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..');
const WEB = path.resolve(BACKEND, '../sabihome');
const PUBLIC = path.join(BACKEND, 'public');

// git gọi thẳng được. Còn npm thì trên Windows là npm.cmd — Node 24 không cho
// spawn .cmd nếu không bật shell:true, mà bật shell:true lại dính cảnh báo
// DEP0190. Nên bỏ npm luôn: gọi trực tiếp tsc và vite bằng chính node đang chạy.
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const chayNode = (script, args, cwd) =>
  execFileSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' });

function thoat(msg) { console.error('\n  DỪNG: ' + msg + '\n'); process.exit(1); }

// ───── 0. Chặn BOM trong file JSON ─────
// PowerShell `Set-Content -Encoding utf8` chèn BOM. npm install vẫn chạy, nhưng
// `npx prisma` thì gãy với "Unexpected token ... is not valid JSON" và Render chỉ
// báo "Build failed" sau 11 giây, không nói file nào. Đã mất một lần deploy vì
// chuyện này (commit dc6bde6) nên chặn ngay tại đây.
try {
  chayNode(path.join(HERE, 'ra-bom.mjs'), [], BACKEND);
} catch (e) {
  thoat('Có file JSON dính BOM — Render sẽ build thất bại.\n'
      + '  Chạy: node scripts/ra-bom.mjs   để xem file nào và cách sửa.');
}

// ───── 1. Kiểm tra repo web ─────
if (!fs.existsSync(WEB)) {
  thoat(`Không thấy repo web ở ${WEB}\n`
      + `  Script này cần sabihome nằm cạnh homestay-backend.`);
}

let ban, nhanh, ban_ngan;
try {
  ban = git(['rev-parse', 'HEAD'], WEB);
  ban_ngan = ban.slice(0, 7);
  nhanh = git(['rev-parse', '--abbrev-ref', 'HEAD'], WEB);
} catch {
  thoat('Không đọc được git của sabihome.');
}

const ban_nhap = git(['status', '--porcelain'], WEB);
if (ban_nhap) {
  console.error('\n  Repo sabihome đang có thay đổi CHƯA COMMIT:\n');
  console.error(ban_nhap.split('\n').map(l => '    ' + l).join('\n'));
  thoat('Commit hoặc bỏ chúng đi trước đã — không thì build-info.json sẽ ghi\n'
      + '  một commit không đúng với code thực sự được build.');
}

console.log(`\n  Web:  sabihome @ ${ban_ngan} (${nhanh})`);

// ───── 2. Build ─────
const TSC = path.join(WEB, 'node_modules', 'typescript', 'bin', 'tsc');
const VITE = path.join(WEB, 'node_modules', 'vite', 'bin', 'vite.js');

// vite + typescript nằm trong devDependencies. Nếu máy đang đặt
// NODE_ENV=production thì `npm install` bỏ qua chúng — đúng lỗi đã gặp
// trên máy này trước đây. Bắt lỗi sớm và nói rõ cách chữa.
for (const [ten, p] of [['typescript', TSC], ['vite', VITE]]) {
  if (!fs.existsSync(p)) {
    thoat(`sabihome thiếu ${ten}.\n`
        + `  Chạy trong thư mục sabihome:  npm install --include=dev\n`
        + `  (thiếu là do NODE_ENV=production làm npm bỏ qua devDependencies)`);
  }
}

console.log('  Đang build…');
try {
  chayNode(TSC, ['-b'], WEB);
  chayNode(VITE, ['build'], WEB);
} catch (e) {
  const ra = [e.stdout, e.stderr].filter(Boolean).join('\n').trim();
  console.error('\n' + (ra || String(e.message || e)));
  thoat('Build hỏng — xem lỗi ngay trên.');
}

const DIST = path.join(WEB, 'dist');
const DIST_ASSETS = path.join(DIST, 'assets');
if (!fs.existsSync(path.join(DIST, 'index.html')) || !fs.existsSync(DIST_ASSETS)) {
  thoat('Build xong nhưng không thấy dist/index.html hoặc dist/assets.');
}

// ───── 3. Chép — CHỈ đụng index.html và assets/ ─────
// public/cu (web vanilla cũ, phao dự phòng) và public/_old-backup phải còn nguyên.
const GIU_LAI = ['cu', '_old-backup'];
const truoc = fs.readdirSync(PUBLIC);

fs.rmSync(path.join(PUBLIC, 'assets'), { recursive: true, force: true });
fs.mkdirSync(path.join(PUBLIC, 'assets'), { recursive: true });
for (const f of fs.readdirSync(DIST_ASSETS)) {
  fs.copyFileSync(path.join(DIST_ASSETS, f), path.join(PUBLIC, 'assets', f));
}
fs.copyFileSync(path.join(DIST, 'index.html'), path.join(PUBLIC, 'index.html'));

for (const g of GIU_LAI) {
  if (truoc.includes(g) && !fs.existsSync(path.join(PUBLIC, g))) {
    thoat(`public/${g} biến mất sau khi chép — đây là phao dự phòng, không được mất.`);
  }
}

// ───── 4. Ghi dấu vết phiên bản ─────
const info = {
  web_commit: ban,
  web_commit_ngan: ban_ngan,
  web_nhanh: nhanh,
  build_luc: new Date().toISOString(),
  assets: fs.readdirSync(path.join(PUBLIC, 'assets')).sort(),
};
fs.writeFileSync(path.join(PUBLIC, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');

// ───── 5. Báo việc còn lại ─────
const doi = git(['status', '--porcelain', 'public'], BACKEND);
console.log('\n  Đã chép xong. Thay đổi trong homestay-backend/public:\n');
console.log(doi ? doi.split('\n').map(l => '    ' + l).join('\n') : '    (không có gì đổi — web vốn đã là bản mới nhất)');

if (doi) {
  console.log(`\n  Còn lại 2 bước, làm trong homestay-backend:\n`);
  console.log(`    git add public`);
  console.log(`    git commit -m "Cap nhat ban build web tu sabihome @ ${ban_ngan}"`);
  console.log(`    git push\n`);
  console.log(`  Rồi vào Render bấm Manual Deploy (auto-deploy đang TẮT).`);
  console.log(`  Deploy xong mở /build-info.json để đối chiếu: phải thấy ${ban_ngan}\n`);
} else {
  console.log('\n  Không cần commit gì thêm.\n');
}
