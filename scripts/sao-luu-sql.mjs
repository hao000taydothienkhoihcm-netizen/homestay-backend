// SAO LƯU BẰNG SQL THUẦN — CHỈ ĐỌC.
//
// VÌ SAO CẦN BẢN NÀY bên cạnh sao-luu.mjs: bản kia đi qua Prisma Client, mà client
// được sinh từ schema MỚI. Khi production còn thiếu migration (đúng lúc cần sao lưu
// nhất — ngay trước khi chạy migration!) thì client hỏi cột chưa tồn tại và gãy:
//   "The column Home.mapLink does not exist in the current database"
// Con gà và quả trứng. SQL thuần đọc bảng có gì lấy nấy, không quan tâm schema.
//
//   node scripts/sao-luu-sql.mjs           -> sao lưu PRODUCTION
//   node scripts/sao-luu-sql.mjs --thu     -> sao lưu nhánh thử
//
// ⚠ File sao lưu chứa dữ liệu khách thật: tên, số điện thoại, tiền.
//   Ghi ra ngoài repo (_sao-luu/, đã gitignore). Đừng gửi qua chat/email.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PrismaClient } from '@prisma/client';

const THU = process.argv.includes('--thu');
const url = THU ? process.env.DATABASE_URL_THU : process.env.DATABASE_URL;
if (!url) { console.error('✕ Thiếu chuỗi kết nối'); process.exit(1); }
const may = (u) => (String(u).match(/@([^/?]+)/) || [, '?'])[1].split('.')[0];
console.log(`Sao lưu ${THU ? 'NHÁNH THỬ' : 'PRODUCTION'}: ${may(url)}\n`);

const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });

const bang = (await db.$queryRawUnsafe(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`)).map((r) => r.table_name);

const kho = { luc: new Date().toISOString(), nguon: may(url), loai: THU ? 'nhanh-thu' : 'production', bang: {} };
let tongDong = 0;
for (const t of bang) {
  // Tên bảng lấy từ chính information_schema nên an toàn, nhưng vẫn chặn ký tự lạ.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) { console.log(`  ${t} — tên lạ, bỏ qua`); continue; }
  const rows = await db.$queryRawUnsafe(`SELECT * FROM "${t}"`);
  // BigInt và Date không tự thành JSON được.
  kho.bang[t] = JSON.parse(JSON.stringify(rows, (_k, v) =>
    (typeof v === 'bigint' ? String(v) : v instanceof Date ? v.toISOString() : v)));
  tongDong += rows.length;
  console.log(`  ${t.padEnd(24)} ${String(rows.length).padStart(6)} dòng`);
}

const ten = `sao-luu-${kho.loai}-${kho.luc.slice(0, 19).replace(/[:T]/g, '-')}.json.gz`;
const thuMuc = process.env.BACKUP_DIR || path.resolve(import.meta.dirname, '../../_sao-luu');
fs.mkdirSync(thuMuc, { recursive: true });
const duong = path.join(thuMuc, ten);
fs.writeFileSync(duong, zlib.gzipSync(Buffer.from(JSON.stringify(kho), 'utf8')));

console.log(`\n✓ ${bang.length} bảng · ${tongDong} dòng · ${(fs.statSync(duong).size / 1024).toFixed(0)} KB`);
console.log(`  ${duong}`);
await db.$disconnect();
