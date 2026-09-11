// Vị trí căn trên bản đồ: bóc toạ độ từ link Google Maps, tính khoảng cách tới trung tâm.
//
// VÌ SAO KHÔNG DÙNG ĐỊA CHỈ ĐỂ TÍNH KHOẢNG CÁCH
// Địa chỉ hẻm ở Đà Lạt ("32/28 Trần Thái Tông") máy dò ra sai vài trăm mét tới vài km.
// Host dán link Google Maps thì đúng tới từng căn, không tốn tiền, không phụ thuộc ai.
// Dò từ địa chỉ chỉ là đường lui, và luôn bị đánh dấu `viTriUocChung` để sales biết là số tạm.
//
// KHOẢNG CÁCH LÀ ĐƯỜNG CHIM BAY, không phải quãng đường xe chạy. Đà Lạt nhiều đèo dốc nên
// đường xe thường dài hơn 1,3–1,6 lần. Cố ý chọn chim bay: nó ổn định, không cần dịch vụ
// ngoài, và sales chỉ cần "gần hay xa" để loại nhanh chứ không cần số km chính xác.

/** Chợ Đà Lạt — mốc "trung tâm" cho toàn bộ chợ căn (nguồn: Wikipedia, Da Lat Market). */
export const TRUNG_TAM = { lat: 11.94155, lng: 108.437214, ten: 'Chợ Đà Lạt' };

/** Đà Lạt và vùng lân cận — chặn toạ độ vô lý (dò nhầm sang tỉnh khác, hoặc gõ ngược lat/lng). */
const HOP_DA_LAT = { latTu: 11.5, latDen: 12.4, lngTu: 108.0, lngDen: 108.9 };

export function trongDaLat(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= HOP_DA_LAT.latTu && lat <= HOP_DA_LAT.latDen
    && lng >= HOP_DA_LAT.lngTu && lng <= HOP_DA_LAT.lngDen;
}

/** Khoảng cách đường chim bay (km), làm tròn 0,1 km. */
export function khoangCachKm(lat1, lng1, lat2 = TRUNG_TAM.lat, lng2 = TRUNG_TAM.lng) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lng1)) return null;
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

// Các dạng link/toạ độ đã gặp thật khi host dán vào:
//   .../maps/@11.9415,108.4372,17z                        -> vị trí camera
//   .../maps/place/Ten/@11.9415,108.4372,17z/data=...!3d11.9415!4d108.4372
//   .../maps?q=11.9415,108.4372   ·   ...?ll=11.94,108.43   ·   ...&daddr=11.94,108.43
//   11.9415, 108.4372   (dán thẳng toạ độ)
//   https://maps.app.goo.gl/xxxx  (link rút gọn — phải mở ra mới thấy, xem moLinkNgan)
//
// !3d!4d là ĐIỂM ĐƯỢC GHIM, còn @ chỉ là chỗ camera đang nhìn. Nên ưu tiên !3d!4d.
const MAU = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  /[?&](?:q|ll|daddr|destination|center)=(-?\d+\.\d+)%2C\s*(-?\d+\.\d+)/i,
  /[?&](?:q|ll|daddr|destination|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/i,
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/,
];

/**
 * Bóc toạ độ từ chuỗi host dán vào. Trả null nếu không thấy hoặc nằm ngoài vùng Đà Lạt.
 * KHÔNG tự đảo lat/lng: 108 độ vĩ là không tồn tại, nhưng đoán mò thì có ngày đoán sai.
 */
export function bocToaDo(s) {
  if (typeof s !== 'string' || !s.trim()) return null;
  for (const m of MAU) {
    const k = s.match(m);
    if (!k) continue;
    const lat = parseFloat(k[1]);
    const lng = parseFloat(k[2]);
    if (trongDaLat(lat, lng)) return { lat, lng };
    // Gõ ngược thứ tự là lỗi rất hay gặp — nói rõ cho host sửa, đừng im lặng bỏ qua.
    if (trongDaLat(lng, lat)) return { lat: lng, lng: lat, daDao: true };
  }
  return null;
}

/**
 * Link rút gọn chỉ lộ toạ độ sau khi mở ra. KHÔNG liệt kê từng nhà rút gọn:
 * rổ hàng thật có cả maps.app.goo.gl, goo.gl/maps VÀ bit.ly. Cứ là link mà trong
 * chuỗi chưa thấy toạ độ thì mở thử — mở hụt chỉ tốn một lần gọi mạng.
 */
export function laLinkNgan(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s) && !bocToaDo(s);
}

/**
 * Mở link rút gọn để lấy link đầy đủ. Cần mạng — máy chủ Render có, máy dưới nhà có.
 * Hỏng mạng thì trả null chứ không ném lỗi: mất toạ độ còn hơn hỏng cả việc lưu căn.
 */
export async function moLinkNgan(url, hetHan = 6000) {
  const bo = new AbortController();
  const h = setTimeout(() => bo.abort(), hetHan);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: bo.signal });
    return r.url || null;
  } catch {
    return null;
  } finally {
    clearTimeout(h);
  }
}

/** Gộp một bước: nhận thứ host dán, trả { lat, lng, km } hoặc null. */
export async function docViTri(s) {
  let chuoi = s;
  if (laLinkNgan(s)) chuoi = (await moLinkNgan(s)) || s;
  const t = bocToaDo(chuoi);
  if (!t) return null;
  return { lat: t.lat, lng: t.lng, km: khoangCachKm(t.lat, t.lng), daDao: !!t.daDao };
}
