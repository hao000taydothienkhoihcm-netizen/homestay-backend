// ═══════════════════════════════════════════════════════════════
// KHÔI PHỤC DỮ LIỆU TỪ BẢN SAO LƯU.
//
// ⚠️ ĐÂY LÀ SCRIPT DUY NHẤT TRONG DỰ ÁN GHI ĐÈ DATABASE THẬT.
//    Đọc hết phần này trước khi chạy.
//
// Xem trước, KHÔNG ghi gì (nên chạy cái này trước):
//   node scripts/phuc-hoi.mjs <file.json.gz>
//
// Ghi thật:
//   node scripts/phuc-hoi.mjs <file.json.gz> --ghi-that
//
// Nó làm gì: XOÁ SẠCH mọi bảng rồi chèn lại từ file. Dữ liệu phát sinh SAU
// thời điểm sao lưu sẽ mất. Nên trước khi khôi phục, hãy sao lưu tình trạng
// hiện tại trước (node scripts/sao-luu.mjs) — lỡ chọn nhầm file còn quay lại.
//
// Toàn bộ nằm trong MỘT giao dịch: hỏng giữa chừng thì Postgres quay đầu,
// không để lại database nửa vời.
// ═══════════════════════════════════════════════════════════════
import 'dotenv/config';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { PrismaClient } from '@prisma/client';

const duong = process.argv[2];
const ghiThat = process.argv.includes('--ghi-that');

if (!duong) {
  console.log('\nThiếu tên file.\n');
  console.log('  Xem trước:  node scripts/phuc-hoi.mjs <file.json.gz>');
  console.log('  Ghi thật :  node scripts/phuc-hoi.mjs <file.json.gz> --ghi-that\n');
  process.exit(1);
}
if (!fs.existsSync(duong)) { console.log(`\nKhông thấy file: ${duong}\n`); process.exit(1); }

const prisma = new PrismaClient();

// Cha trước con — chèn theo đúng thứ tự này thì khoá ngoại không gãy.
const BANG = [
  ['host', (t) => t.host],
  ['user', (t) => t.user],
  ['home', (t) => t.home],
  ['homeMonthlyPrice', (t) => t.homeMonthlyPrice],
  ['homeDatePrice', (t) => t.homeDatePrice],
  ['holiday', (t) => t.holiday],
  ['chargeTemplate', (t) => t.chargeTemplate],
  ['booking', (t) => t.booking],
  ['charge', (t) => t.charge],
  ['stockEntry', (t) => t.stockEntry],
  ['expense', (t) => t.expense],
];

const dl = JSON.parse(zlib.gunzipSync(fs.readFileSync(duong)).toString('utf8'));

// Nói rõ đang nhắm vào database NÀO trước khi làm gì. Khôi phục nhầm vào nhánh
// chính trong khi tưởng đang thử trên nhánh nháp là hỏng không cứu được.
let moTa = '(không đọc được DATABASE_URL)';
try {
  const u = new URL(process.env.DATABASE_URL);
  moTa = `${u.hostname}${u.pathname}`;
} catch { /* để nguyên dòng mặc định */ }
console.log(`\nĐANG NHẮM VÀO: ${moTa}`);
console.log(`Bản sao lưu tạo lúc: ${dl.taoLuc}\n`);
console.log('  bảng                trong file    đang có');
console.log('  ' + '─'.repeat(45));

let tongFile = 0;
for (const [ten, lay] of BANG) {
  const trongFile = (dl.bang[ten] || []).length;
  const dangCo = await lay(prisma).count();
  tongFile += trongFile;
  const dau = trongFile === dangCo ? ' ' : (trongFile > dangCo ? '+' : '-');
  console.log(`  ${ten.padEnd(18)} ${String(trongFile).padStart(8)} ${String(dangCo).padStart(10)}  ${dau}`);
}

if (!ghiThat) {
  console.log(`\n  Tổng ${tongFile} dòng trong file. CHƯA GHI GÌ.`);
  console.log('  Muốn khôi phục thật thì chạy lại kèm  --ghi-that\n');
  console.log('  Nhớ sao lưu tình trạng hiện tại trước:  node scripts/sao-luu.mjs\n');
  await prisma.$disconnect();
  process.exit(0);
}

console.log('\n  ĐANG GHI ĐÈ DATABASE…\n');

await prisma.$transaction(async (tx) => {
  // Xoá ngược thứ tự: con trước, cha sau.
  for (const [ten, lay] of [...BANG].reverse()) {
    const r = await lay(tx).deleteMany({});
    console.log(`  xoá  ${ten.padEnd(18)} ${r.count}`);
  }
  for (const [ten, lay] of BANG) {
    const rows = dl.bang[ten] || [];
    if (!rows.length) continue;
    await lay(tx).createMany({ data: rows });
    console.log(`  chèn ${ten.padEnd(18)} ${rows.length}`);
  }
}, { timeout: 120000, maxWait: 60000 });

// Postgres không tự đẩy bộ đếm id lên theo dữ liệu chèn tay. Không sửa thì
// bản ghi mới tạo sẽ đụng id đã tồn tại và báo lỗi trùng khoá.
console.log('\n  Đẩy lại bộ đếm id…');
for (const [ten] of BANG) {
  const bang = ten.replace(/([A-Z])/g, '_$1');   // homeMonthlyPrice -> home_Monthly_Price
  try {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${ten[0].toUpperCase() + ten.slice(1)}"', 'id'),
       COALESCE((SELECT MAX(id) FROM "${ten[0].toUpperCase() + ten.slice(1)}"), 1))`
    );
  } catch (e) {
    console.log(`     (bỏ qua ${ten}: ${String(e.message).split('\n')[0].slice(0, 60)})`);
  }
}

const sau = {};
for (const [ten, lay] of BANG) sau[ten] = await lay(prisma).count();
const tongSau = Object.values(sau).reduce((a, b) => a + b, 0);

console.log(`\n  Xong: ${tongSau}/${tongFile} dòng.`);
console.log(tongSau === tongFile ? '  Khớp với bản sao lưu.\n' : '  ⚠ KHÔNG KHỚP — kiểm tra lại.\n');

await prisma.$disconnect();
process.exit(tongSau === tongFile ? 0 : 1);
