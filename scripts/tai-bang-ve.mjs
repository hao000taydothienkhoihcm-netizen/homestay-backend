// TẢI BẢNG VỀ MÁY, không phân tích gì cả.
//
// Vì sao tách riêng: Google thỉnh thoảng TREO LUÔN yêu cầu xuất .xlsx của một bảng —
// không báo lỗi, không trả gì, chờ 5 phút vẫn im. Gộp chung với bước phân tích thì một
// bảng treo là cả mẻ 21 bảng đứng hình, chạy lại từ đầu, rồi lại treo ở chỗ khác.
// Tách ra: bước này chỉ lo LẤY ĐƯỢC BYTE, hỏng thì bỏ qua, vòng sau quay lại lấy tiếp.
// Bảng nào lấy được thì nằm luôn trong _dem-sheet/ và không bao giờ phải tải lại.
//
//   node scripts/tai-bang-ve.mjs [số vòng] [giây nghỉ giữa 2 bảng] [giây chờ mỗi bảng]
//   node scripts/tai-bang-ve.mjs 6 20 25
import fs from 'node:fs';
import path from 'node:path';

const [, , SO_VONG = '6', NGHI = '20', HAN = '25'] = process.argv;
const THU_MUC = process.env.SHEET_DEM_THU_MUC || '_dem-sheet';
const NGHI_VONG = 180000;                      // nghỉ 3 phút giữa hai vòng

const ds = JSON.parse(fs.readFileSync(new URL('./du-lieu/link-lich-goodstay.json', import.meta.url), 'utf8'));
const bang = new Map();
for (const x of ds) {
  const m = String(x.link?.booking || '').match(/\/d\/([\w-]{20,})/);
  if (m && !bang.has(m[1])) bang.set(m[1], x.ten || x.ma);
}
fs.mkdirSync(THU_MUC, { recursive: true });

const coRoi = (id) => { try { return fs.statSync(path.join(THU_MUC, `${id}.xlsx`)).size > 1000; } catch { return false; } };
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

const khongCuu = new Set();                    // bảng chưa mở chia sẻ — chờ mấy cũng vậy
console.log(`${bang.size} bảng · đã có sẵn ${[...bang.keys()].filter(coRoi).length}\n`);

for (let vong = 1; vong <= +SO_VONG; vong++) {
  const con = [...bang.keys()].filter((id) => !coRoi(id) && !khongCuu.has(id));
  if (!con.length) { console.log('\n✓ Đã lấy đủ những bảng lấy được.'); break; }
  console.log(`── Vòng ${vong}/${SO_VONG} · còn ${con.length} bảng ──`);

  for (const id of con) {
    const bo = new AbortController();
    const h = setTimeout(() => bo.abort(), +HAN * 1000);
    const t0 = Date.now();
    try {
      const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`, { redirect: 'follow', signal: bo.signal });
      const giay = ((Date.now() - t0) / 1000).toFixed(1);
      if (r.status === 401 || r.status === 403) {
        khongCuu.add(id);
        console.log(`  ✕ ${id.slice(0, 10)} ${String(bang.get(id)).slice(0, 24).padEnd(24)} chưa mở chia sẻ — bỏ hẳn`);
      } else if (!r.ok) {
        console.log(`  … ${id.slice(0, 10)} ${String(bang.get(id)).slice(0, 24).padEnd(24)} HTTP ${r.status} (${giay}s) — vòng sau thử lại`);
      } else {
        const buf = Buffer.from(await r.arrayBuffer());
        fs.writeFileSync(path.join(THU_MUC, `${id}.xlsx`), buf);
        console.log(`  ✓ ${id.slice(0, 10)} ${String(bang.get(id)).slice(0, 24).padEnd(24)} ${(buf.length / 1024).toFixed(0)} KB (${giay}s)`);
      }
    } catch (e) {
      console.log(`  … ${id.slice(0, 10)} ${String(bang.get(id)).slice(0, 24).padEnd(24)} ${/abort/i.test(e.message) ? 'Google treo, không trả lời' : e.message.slice(0, 40)} — vòng sau thử lại`);
    } finally { clearTimeout(h); }
    await nghi(+NGHI * 1000);
  }

  const xong = [...bang.keys()].filter(coRoi).length;
  console.log(`  => ${xong}/${bang.size} bảng đã có · ${khongCuu.size} bảng chưa mở chia sẻ\n`);
  if (vong < +SO_VONG && [...bang.keys()].some((id) => !coRoi(id) && !khongCuu.has(id))) {
    console.log(`  (nghỉ ${NGHI_VONG / 60000} phút cho Google dịu lại)\n`);
    await nghi(NGHI_VONG);
  }
}

const xong = [...bang.keys()].filter(coRoi);
console.log(`\nKẾT: ${xong.length}/${bang.size} bảng nằm trong ${THU_MUC}/`);
const thieu = [...bang.keys()].filter((id) => !coRoi(id));
if (thieu.length) console.log('Chưa lấy được: ' + thieu.map((id) => `${id.slice(0, 10)} (${bang.get(id)})`).join(' · '));
