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

// Nơi lưu. Đặt ngoài repo để không lỡ tay commit dữ liệu thật lên GitHub.
//
// Lưu MỘT chỗ trên chính máy đang chạy thì chưa gọi là backup: máy hỏng hoặc đổi
// máy là mất luôn cả dữ liệu lẫn bản sao lưu. Nên mặc định script tự tìm thư mục
// Google Drive; thấy thì lưu thêm một bản vào đó, không thấy thì nhắc.
//
// Muốn chỉ định tay (nhiều chỗ, ngăn bằng dấu chấm phẩy) thì đặt BACKUP_DIR —
// lúc đó script dùng đúng danh sách đó, không tự dò nữa:
//
//   set BACKUP_DIR=E:\project\homestay\_sao-luu;D:\o-cung-ngoai\sao-luu
//
const GIU_LAI = parseInt(process.env.BACKUP_KEEP || '30');   // giữ bao nhiêu bản gần nhất
const TEN_TM = 'SabiHome - Sao luu du lieu';

// Tự dò thư mục Google Drive.
// Drive for desktop gắn thành một ổ riêng, NHƯNG chữ cái ổ không cố định (máy này
// đang dùng tới F:, nên Drive sẽ nhận G: hoặc chữ khác), và nếu cài kiểu "thư mục"
// thì lại nằm trong hồ sơ người dùng. Đoán cứng "G:\My Drive" là sai — dò thật.
// Chưa cài Drive thì trả null, script vẫn chạy và chỉ nhắc.
function timGoogleDrive() {
  const ung = [];
  for (const o of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    ung.push(`${o}:\\My Drive`, `${o}:\\Drive của tôi`, `${o}:\\Drive cua toi`);
  }
  const nha = process.env.USERPROFILE || '';
  if (nha) ung.push(path.join(nha, 'Google Drive', 'My Drive'), path.join(nha, 'Google Drive'));
  for (const d of ung) {
    try { if (fs.statSync(d).isDirectory()) return d; } catch { /* không có thì thôi */ }
  }
  return null;
}

let THU_MUC;
if (process.env.BACKUP_DIR) {
  THU_MUC = process.env.BACKUP_DIR.split(';').map((s) => s.trim()).filter(Boolean);
} else {
  THU_MUC = [path.resolve(import.meta.dirname, '../../_sao-luu')];
  const gd = timGoogleDrive();
  if (gd) THU_MUC.push(path.join(gd, TEN_TM));   // có Drive thì tự lưu thêm vào đó
}

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

const ten = tenFile();
console.log(`\n  ${tongDong} dòng  ->  ${(nen.length / 1024).toFixed(1)} KB\n`);

let soChoGhiDuoc = 0;
for (const thuMuc of THU_MUC) {
  try {
    fs.mkdirSync(thuMuc, { recursive: true });
    const duong = path.join(thuMuc, ten);
    fs.writeFileSync(duong, nen);

    // Đọc lại NGAY tại chỗ vừa ghi. Ghi xong mà không đọc lại thì không biết
    // file có dùng được không — bản sao lưu hỏng mà tưởng là có mới là tình
    // huống tệ nhất. Với thư mục Google Drive thì bước này còn bắt được cả
    // trường hợp Drive chưa gắn ổ.
    const docLai = JSON.parse(zlib.gunzipSync(fs.readFileSync(duong)).toString('utf8'));
    const demLai = Object.values(docLai.bang).reduce((s, r) => s + r.length, 0);
    if (demLai !== tongDong) throw new Error(`đọc lại chỉ thấy ${demLai}/${tongDong} dòng`);

    // Dọn bản cũ, tính riêng từng chỗ.
    const cu = fs.readdirSync(thuMuc)
      .filter((f) => f.startsWith('sabi-') && f.endsWith('.json.gz'))
      .sort().reverse();
    const xoa = cu.slice(GIU_LAI);
    for (const f of xoa) fs.unlinkSync(path.join(thuMuc, f));

    soChoGhiDuoc++;
    console.log(`  OK   ${duong}`);
    console.log(`       giữ ${Math.min(cu.length, GIU_LAI)} bản` + (xoa.length ? `, dọn ${xoa.length} bản cũ` : '') + `, đọc lại khớp ${demLai} dòng`);
  } catch (e) {
    console.log(`  HỎNG ${thuMuc}`);
    console.log(`       ${e.message}`);
  }
}

await prisma.$disconnect();

if (soChoGhiDuoc === 0) {
  console.log('\n  KHÔNG ghi được chỗ nào. Chưa có bản sao lưu nào cả.\n');
  process.exit(1);
}
if (soChoGhiDuoc < THU_MUC.length) {
  // Vẫn coi là thành công nhưng phải kêu lên: chạy tự động hằng đêm mà im lặng
  // bỏ qua một chỗ thì vài tháng sau mới phát hiện chỗ đó rỗng.
  console.log(`\n  ⚠ Chỉ ghi được ${soChoGhiDuoc}/${THU_MUC.length} chỗ. Xem lại chỗ HỎNG ở trên.\n`);
} else if (THU_MUC.length === 1) {
  console.log('\n  ⚠ Mới lưu ở MỘT chỗ, ngay trên máy này. Máy hỏng là mất cả.');
  console.log('    Không tìm thấy Google Drive trên máy. Cài Drive for desktop từ');
  console.log('    https://www.google.com/drive/download/ rồi chạy lại — script tự');
  console.log('    dò ra và lưu thêm một bản vào đó, không phải sửa gì.\n');
} else {
  console.log('');
}
