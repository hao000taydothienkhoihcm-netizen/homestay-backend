// ═══════════════════════════════════════════════════════════════
// SAO LƯU TOÀN BỘ DỮ LIỆU RA FILE — CHỈ ĐỌC DATABASE.
//
//   node scripts/sao-luu.mjs
//
// VÌ SAO CẦN: Neon Free chỉ giữ lịch sử khôi phục 6 TIẾNG. Phát hiện mất dữ
// liệu sau một ngày là hết đường lùi. Toàn bộ booking, thu chi, kho của các
// host hiện chỉ tồn tại ở một nơi duy nhất.
//
// VÌ SAO KHÔNG DÙNG pg_dump: máy này không có pg_dump, mà bắt cài PostgreSQL
// chỉ để sao lưu thì lần sau đổi máy lại vướng. Script này chỉ cần Node —
// chỗ nào chạy được app là chạy được nó.
//
// Sao lưu DỮ LIỆU, không sao lưu cấu trúc bảng: cấu trúc nằm ở
// prisma/schema.prisma và đã có trong git rồi.
//
// Khôi phục: xem scripts/phuc-hoi.mjs
// ═══════════════════════════════════════════════════════════════
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Thư mục lưu. Đặt ngoài repo để không lỡ tay commit dữ liệu thật lên GitHub.
const THU_MUC = process.env.BACKUP_DIR
  || path.resolve(import.meta.dirname, '../../_sao-luu');
const GIU_LAI = parseInt(process.env.BACKUP_KEEP || '30');   // giữ bao nhiêu bản gần nhất

// Thứ tự không quan trọng khi sao lưu, nhưng giữ đúng thứ tự cha-trước-con
// để lúc khôi phục đọc lại theo đúng thứ tự này là chèn được ngay.
const BANG = [
  ['host', () => prisma.host],
  ['user', () => prisma.user],
  ['home', () => prisma.home],
  ['homeMonthlyPrice', () => prisma.homeMonthlyPrice],
  ['homeDatePrice', () => prisma.homeDatePrice],
  ['holiday', () => prisma.holiday],
  ['chargeTemplate', () => prisma.chargeTemplate],
  ['booking', () => prisma.booking],
  ['charge', () => prisma.charge],
  ['stockEntry', () => prisma.stockEntry],
  ['expense', () => prisma.expense],
];

const hai = (n) => String(n).padStart(2, '0');
function tenFile(d = new Date()) {
  return `sabi-${d.getFullYear()}${hai(d.getMonth() + 1)}${hai(d.getDate())}`
       + `-${hai(d.getHours())}${hai(d.getMinutes())}.json.gz`;
}

fs.mkdirSync(THU_MUC, { recursive: true });

console.log('\nĐang sao lưu…\n');
const duLieu = { taoLuc: new Date().toISOString(), bang: {} };
let tongDong = 0;

for (const [ten, m] of BANG) {
  const rows = await m().findMany();
  duLieu.bang[ten] = rows;
  tongDong += rows.length;
  console.log(`  ${ten.padEnd(18)} ${String(rows.length).padStart(5)} dòng`);
}

// Mật khẩu đã băm bằng bcrypt nên bản sao lưu vẫn không đọc ra được mật khẩu
// gốc — nhưng file này vẫn là dữ liệu thật của khách: tên, số điện thoại,
// tiền bạc. Để ngoài repo và đừng gửi qua chat/email.
const json = JSON.stringify(duLieu, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
const nen = zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 });

const duong = path.join(THU_MUC, tenFile());
fs.writeFileSync(duong, nen);

console.log(`\n  ${tongDong} dòng  ->  ${(nen.length / 1024).toFixed(1)} KB`);
console.log(`  ${duong}`);

// ───── Dọn bản cũ ─────
const cu = fs.readdirSync(THU_MUC)
  .filter((f) => f.startsWith('sabi-') && f.endsWith('.json.gz'))
  .sort()
  .reverse();
const xoa = cu.slice(GIU_LAI);
for (const f of xoa) fs.unlinkSync(path.join(THU_MUC, f));

console.log(`  Đang giữ ${Math.min(cu.length, GIU_LAI)} bản` + (xoa.length ? `, đã dọn ${xoa.length} bản cũ` : ''));

// ───── Tự kiểm: đọc lại file vừa ghi ─────
// Ghi xong mà không đọc lại thì không biết file có dùng được không. Bản sao lưu
// hỏng mà tưởng là có mới là tình huống tệ nhất.
const docLai = JSON.parse(zlib.gunzipSync(fs.readFileSync(duong)).toString('utf8'));
const demLai = Object.values(docLai.bang).reduce((s, r) => s + r.length, 0);
if (demLai !== tongDong) {
  console.log(`\n  LỖI: đọc lại chỉ thấy ${demLai}/${tongDong} dòng. Bản sao lưu này KHÔNG dùng được.\n`);
  await prisma.$disconnect();
  process.exit(1);
}
console.log(`  Đã đọc lại kiểm chứng: ${demLai} dòng, file dùng được.\n`);

await prisma.$disconnect();
