// Thử kho ảnh R2 từ đầu đến cuối: tạo một tấm ảnh thật, đẩy lên, tải lại về, rồi xoá.
// Không đụng tới database, không đụng tới căn nào.
//
//   node scripts/thu-kho-anh.mjs          -> thử rồi xoá sạch
//   node scripts/thu-kho-anh.mjs --giu    -> thử và GIỮ lại ảnh để bạn mở link xem
import 'dotenv/config';
import zlib from 'node:zlib';
import { DA_BAT, viSaoChuaBat, dayAnhLen, xoaAnh, loaiAnh } from '../src/lib/anh.js';

const GIU = process.argv.includes('--giu');

if (!DA_BAT) {
  console.error('✕ Kho ảnh chưa bật: ' + viSaoChuaBat());
  console.error('  Kiểm lại 5 dòng R2_* trong .env (không dấu nháy, không khoảng trắng quanh dấu =).');
  process.exit(1);
}
console.log('✓ Đã đọc đủ 5 biến R2 trong .env');
console.log(`  bucket    : ${process.env.R2_BUCKET}`);
console.log(`  tên miền  : ${process.env.R2_PUBLIC_URL}`);
console.log(`  khoá      : ${String(process.env.R2_ACCESS_KEY_ID).slice(0, 6)}…${String(process.env.R2_ACCESS_KEY_ID).slice(-4)} (chỉ in đầu/cuối)\n`);

// ───── Vẽ một tấm PNG thật 96×96 để mở link ra còn thấy được ─────
function taoPng(w, h, mau) {
  const crcBang = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = crcBang[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const khoi = (ten, data) => {
    const d = Buffer.concat([Buffer.from(ten, 'ascii'), data]);
    const ra = Buffer.alloc(8 + data.length + 4);
    ra.writeUInt32BE(data.length, 0); d.copy(ra, 4); ra.writeUInt32BE(crc(d), 8 + data.length);
    return ra;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;                                   // 8 bit, màu RGB
  const tho = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const d = y * (1 + w * 3);
    for (let x = 0; x < w; x++) {
      const i = d + 1 + x * 3;
      tho[i] = mau[0]; tho[i + 1] = mau[1]; tho[i + 2] = mau[2];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    khoi('IHDR', ihdr), khoi('IDAT', zlib.deflateSync(tho)), khoi('IEND', Buffer.alloc(0)),
  ]);
}

const anh = taoPng(96, 96, [107, 79, 42]);                    // màu nâu Sabi
console.log(`Ảnh thử: PNG 96×96 · ${anh.length} byte · nhận dạng: ${loaiAnh(anh)?.mime}`);

// ───── Đẩy lên ─────
let ket;
try {
  const t0 = Date.now();
  ket = await dayAnhLen(0, anh);                              // homeId 0 = ảnh thử, không thuộc căn nào
  console.log(`✓ Đẩy lên xong trong ${Date.now() - t0}ms`);
  console.log(`  ${ket.url}`);
} catch (e) {
  console.error('✕ ĐẨY LÊN HỎNG: ' + e.message);
  console.error('\n  Hay gặp:');
  console.error('   · "InvalidAccessKeyId" -> R2_ACCESS_KEY_ID sai, hoặc chép thiếu ký tự');
  console.error('   · "SignatureDoesNotMatch" -> R2_SECRET_ACCESS_KEY sai');
  console.error('   · "NoSuchBucket" -> R2_BUCKET không đúng tên, hoặc R2_ACCOUNT_ID của tài khoản khác');
  console.error('   · "AccessDenied" -> token không được gán bucket này, hoặc chọn nhầm mức quyền');
  process.exit(1);
}

// ───── Tải lại về qua tên miền công khai ─────
// Đây mới là phép thử thật: đẩy lên được nhưng chưa bật Public Development URL thì
// sales mở ảnh vẫn ra 401, mà lỗi đó chỉ lộ ra đúng ở bước này.
try {
  const r = await fetch(ket.url, { signal: AbortSignal.timeout(20000) });
  const buf = Buffer.from(await r.arrayBuffer());
  if (!r.ok) {
    console.error(`\n✕ TẢI VỀ HỎNG: HTTP ${r.status}`);
    if (r.status === 401 || r.status === 403) {
      console.error('  Chưa bật Public Development URL cho bucket, hoặc R2_PUBLIC_URL dán nhầm.');
      console.error('  Vào bucket -> Settings -> Public Development URL -> Enable (gõ "allow").');
    }
    process.exit(1);
  }
  const khop = buf.length === anh.length && buf.equals(anh);
  console.log(`✓ Tải về được · HTTP ${r.status} · ${buf.length} byte · ${khop ? 'khớp từng byte với ảnh gốc' : '⚠ KHÁC ảnh gốc'}`);
  console.log(`  kiểu nội dung : ${r.headers.get('content-type')}`);
  console.log(`  bộ nhớ đệm    : ${r.headers.get('cache-control')}`);
  if (!khop) process.exit(1);
} catch (e) {
  console.error('✕ TẢI VỀ HỎNG: ' + e.message);
  process.exit(1);
}

// ───── Dọn ─────
if (GIU) {
  console.log(`\n(giữ lại ảnh thử — mở link trên trình duyệt xem thử, sau đó chạy lại không kèm --giu để xoá)`);
} else {
  const daXoa = await xoaAnh(ket.url);
  console.log(`✓ Đã xoá ảnh thử khỏi kho: ${daXoa}`);
  const r2 = await fetch(ket.url).catch(() => null);
  console.log(`  Kiểm lại: ${r2 ? 'HTTP ' + r2.status + (r2.status === 404 ? ' (đúng, đã mất)' : ' ⚠ vẫn còn?') : 'không gọi được'}`);
}
console.log('\n✓ KHO ẢNH CHẠY ĐƯỢC.');
