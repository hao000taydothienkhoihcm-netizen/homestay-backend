// Kho ảnh — Cloudflare R2 (S3-compatible).
//
// VÌ SAO CẦN: form khai căn trước đây bắt host DÁN LINK ẢNH. Nghĩa là chủ nhà phải tự
// upload lên Drive, mở ra, copy link từng tấm. Chủ nhà ở Đà Lạt cầm điện thoại thì gần
// như không ai làm nổi — 0/117 căn có ảnh bìa là hệ quả của cái form, không phải họ lười.
// Nay: chọn ảnh từ máy, trình duyệt thu nhỏ rồi đẩy thẳng lên đây.
//
// VÌ SAO ĐẨY QUA MÁY CHỦ, KHÔNG DÙNG PRESIGNED URL:
// presigned thì trình duyệt bắn thẳng vào R2, nhẹ cho server — nhưng phải bật CORS cho
// bucket, thêm một bước cấu hình mà sai là lỗi câm (trình duyệt chặn, không báo gì rõ).
// Ảnh đã thu nhỏ còn ~200KB, mỗi căn 4 tấm; đi qua server hoàn toàn gánh được, mà khoá
// R2 thì không bao giờ rời máy chủ.
//
// CHƯA KHAI KHOÁ R2 thì mọi thứ vẫn chạy bình thường, chỉ riêng nút tải ảnh báo chưa bật.
// Tuyệt đối không để thiếu biến môi trường làm sập cả server.
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'node:crypto';

// Dán khoá từ trang Cloudflare vào .env là chỗ dễ dính rác nhất: dấu ngoặc nhọn còn
// sót lại từ chỗ điền mẫu, dấu nháy, khoảng trắng đầu cuối. Mấy ký tự đó làm khoá dài
// thêm vài ký tự và R2 trả về lỗi chẳng liên quan gì ("length 34, should be 32"), dò mệt.
// Nên cắt sạch ngay từ đây thay vì bắt người dùng đoán.
const docBien = (ten) => {
  let v = String(process.env[ten] ?? '').trim();
  v = v.replace(/^[<"']+/, '').replace(/[>"']+$/, '').trim();
  return v;
};

const TK = docBien('R2_ACCOUNT_ID');
const KHOA = docBien('R2_ACCESS_KEY_ID');
const BIMAT = docBien('R2_SECRET_ACCESS_KEY');
const THUNG = docBien('R2_BUCKET') || 'sabi-anh';
// Tên miền công khai của bucket: hoặc <hash>.r2.dev, hoặc tên miền riêng.
// Không có cái này thì ảnh tải lên xong không ai xem được.
const MIEN = docBien('R2_PUBLIC_URL').replace(/\/+$/, '');

export const DA_BAT = Boolean(TK && KHOA && BIMAT && MIEN);

export function viSaoChuaBat() {
  const thieu = [];
  if (!TK) thieu.push('R2_ACCOUNT_ID');
  if (!KHOA) thieu.push('R2_ACCESS_KEY_ID');
  if (!BIMAT) thieu.push('R2_SECRET_ACCESS_KEY');
  if (!MIEN) thieu.push('R2_PUBLIC_URL');
  return thieu.length ? `Chưa khai ${thieu.join(', ')} trong .env` : null;
}

const s3 = DA_BAT
  ? new S3Client({
    region: 'auto',
    endpoint: `https://${TK}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: KHOA, secretAccessKey: BIMAT },
  })
  : null;

// Chỉ nhận ảnh thật. Kiểm bằng CHỮ KÝ ĐẦU FILE chứ không tin content-type client gửi —
// đổi content-type là việc ai cũng làm được, còn sửa mấy byte đầu thì file hỏng luôn.
const CHU_KY = [
  { duoi: 'jpg', mime: 'image/jpeg', byte: [0xFF, 0xD8, 0xFF] },
  { duoi: 'png', mime: 'image/png', byte: [0x89, 0x50, 0x4E, 0x47] },
  { duoi: 'webp', mime: 'image/webp', byte: [0x52, 0x49, 0x46, 0x46] },   // RIFF….WEBP
];

export function loaiAnh(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  for (const k of CHU_KY) {
    if (k.byte.every((b, i) => buf[i] === b)) {
      if (k.duoi === 'webp' && buf.subarray(8, 12).toString('ascii') !== 'WEBP') continue;
      return k;
    }
  }
  return null;
}

/**
 * Đẩy một tấm ảnh lên R2, trả về link công khai.
 * Đường dẫn: can/<homeId>/<ngày>-<ngẫu nhiên>.<đuôi> — nhìn là biết của căn nào,
 * và tên ngẫu nhiên nên không ai đoán được link ảnh của căn khác.
 */
export async function dayAnhLen(homeId, buf) {
  if (!DA_BAT) throw new Error(viSaoChuaBat());
  const k = loaiAnh(buf);
  if (!k) throw new Error('File này không phải ảnh JPG / PNG / WEBP.');

  const ngay = new Date().toISOString().slice(0, 10);
  const ten = `can/${homeId}/${ngay}-${crypto.randomBytes(8).toString('hex')}.${k.duoi}`;
  await s3.send(new PutObjectCommand({
    Bucket: THUNG,
    Key: ten,
    Body: buf,
    ContentType: k.mime,
    // Ảnh căn không đổi nội dung (tên file có phần ngẫu nhiên), cho trình duyệt giữ lâu.
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return { url: `${MIEN}/${ten}`, key: ten, bytes: buf.length };
}

/** Gỡ ảnh khỏi kho. Chỉ gỡ được ảnh nằm trong tên miền của chính mình. */
export async function xoaAnh(url) {
  if (!DA_BAT) return false;
  const u = String(url || '');
  if (!u.startsWith(MIEN + '/')) return false;      // link ngoài -> không đụng
  const key = u.slice(MIEN.length + 1).split('?')[0];
  if (!key.startsWith('can/')) return false;
  await s3.send(new DeleteObjectCommand({ Bucket: THUNG, Key: key }));
  return true;
}
