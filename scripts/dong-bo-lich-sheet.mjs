// Đổ lịch từ bảng Google Sheet của chủ nhà vào NHÁNH THỬ, để chợ hiện lịch mức ③.
//
//   node scripts/dong-bo-lich-sheet.mjs          -> xem trước, KHÔNG ghi
//   node scripts/dong-bo-lich-sheet.mjs --ghi    -> ghi thật vào nhánh thử
//
// LUẬT GHI (bắt buộc, chép từ ghi chú trong schema):
//   · Chỉ thêm/xoá dòng LichKhoa nguồn SHEET. TUYỆT ĐỐI không đụng dòng MANUAL —
//     đó là host tự khoá tay, đồng bộ không được quyền xoá.
//   · Chỉ đụng từ HÔM NAY trở đi. Quá khứ để yên, không ai cần và dễ xoá nhầm.
//   · Ghép tên căn KHÔNG CHẮC thì BỎ QUA, không ghi. Ghi nhầm lịch của căn khác
//     còn tệ hơn không có lịch: sales sẽ chốt trúng ngày bận rồi mất khách.
import 'dotenv/config';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { taiVaDoc, docTab, chonTab, idBangTinh } from '../src/lib/lich-sheet.js';

const GHI = process.argv.includes('--ghi');
const SO_THANG = 3;                       // tháng này + 2 tháng tới

const url = process.env.DATABASE_URL_THU;
if (!url) { console.error('✕ Thiếu DATABASE_URL_THU'); process.exit(1); }
const host = (u) => (u.match(/@([^/]+)/) || [, '?'])[1];
if (host(url) === host(process.env.DATABASE_URL || '')) {
  console.error('✕ DATABASE_URL_THU cùng endpoint với production. Dừng.'); process.exit(1);
}
const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });

const homNay = new Date().toISOString().slice(0, 10);
const ngayUTC = (s) => new Date(s + 'T00:00:00.000Z');
const thangCanDoc = [];
{
  const d = new Date(homNay + 'T00:00:00Z');
  for (let i = 0; i < SO_THANG; i++) {
    thangCanDoc.push({ m: d.getUTCMonth() + 1, y: d.getUTCFullYear() });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
}

// ───── Ghép tên: bỏ dấu, bỏ emoji, bỏ mọi thứ không phải chữ số ─────
const gon = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd').replace(/[^a-z0-9]/gi, '').toLowerCase();
const tuKhoa = (s) => new Set(String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd').toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 2));

/** Giá hay gặp nhất trong một khối — dùng làm bằng chứng phụ khi tên không khớp. */
function giaHayGap(khoi) {
  const dem = new Map();
  for (const n of khoi.ngay) if (n.gia) dem.set(n.gia, (dem.get(n.gia) || 0) + 1);
  if (!dem.size) return null;
  return [...dem].sort((a, b) => b[1] - a[1])[0][0];
}
const lech = (a, b) => (a && b ? Math.abs(a - b) / Math.max(a, b) : 1);

/**
 * Trả { khoi, doChac } — 'chac' | 'kha' | 'mo' | null
 *
 * VÌ SAO PHẢI CÓ GIÁ Ở ĐÂY: nhiều link lịch không trỏ tới bảng của chủ nhà mà tới bảng
 * của một đơn vị tổng hợp khác, và bên đó đặt tên căn theo kiểu của họ. Tên lệch hẳn,
 * nhưng GIÁ THÌ GIỐNG — vì cùng bán một căn. Tên khớp lỏng + giá khớp = hai bằng chứng
 * độc lập cùng chỉ một chỗ, đủ tin. Còn giá khớp một mình thì KHÔNG đủ: cả chục căn
 * ở Đà Lạt cùng để 2.000.000/đêm.
 */
function ghep(tenCan, dsKhoi, giaCan) {
  if (!dsKhoi.length) return { khoi: null, doChac: null };
  const t = gon(tenCan);
  const bang = dsKhoi.filter((k) => gon(k.ten) === t);
  if (bang.length === 1) return { khoi: bang[0], doChac: 'chac' };

  const chua = dsKhoi.filter((k) => {
    const g = gon(k.ten);
    return g.length >= 4 && t.length >= 4 && (g.includes(t) || t.includes(g));
  });
  if (chua.length === 1) return { khoi: chua[0], doChac: 'kha' };

  const tk = tuKhoa(tenCan);
  const diem = tk.size ? dsKhoi.map((k) => {
    const b = tuKhoa(k.ten);
    let chung = 0;
    for (const x of tk) if (b.has(x)) chung++;
    return { k, d: chung / tk.size };
  }).sort((a, b) => b.d - a.d) : [];

  if (diem.length && diem[0].d >= 0.6 && (diem.length === 1 || diem[0].d - diem[1].d >= 0.2)) {
    return { khoi: diem[0].k, doChac: 'mo' };
  }

  // ── Bằng chứng phụ: giá ──
  if (giaCan) {
    const gan = dsKhoi.map((k) => ({ k, l: lech(giaHayGap(k), giaCan) })).sort((a, b) => a.l - b.l);
    const motMinh = gan[0].l <= 0.05 && (gan.length === 1 || gan[1].l >= 0.15);
    if (motMinh) {
      // Tên còn dính chút nào không? Dính là đủ hai bằng chứng, tin được.
      const dTen = (diem.find((x) => x.k === gan[0].k) || {}).d || 0;
      return { khoi: gan[0].k, doChac: dTen >= 0.4 ? 'kha' : 'mo' };
    }
  }
  return { khoi: null, doChac: null };
}

// ───── Gom căn theo bảng tính ─────
const F = new URL('./du-lieu/link-lich-goodstay.json', import.meta.url);
const linkTheoMa = new Map(JSON.parse(fs.readFileSync(F, 'utf8')).map((x) => [x.ma, x.link.booking]));

// Ghép tay: { "G-021": "tên khối trong bảng" }. Máy không đoán ra thì người chỉ,
// chỉ một lần cho mỗi căn, và lần sau đồng bộ vẫn nhớ.
const F_TAY = new URL('./du-lieu/ghep-lich-tay.json', import.meta.url);
const GHEP_TAY = fs.existsSync(F_TAY) ? JSON.parse(fs.readFileSync(F_TAY, 'utf8')) : {};

// Luật màu riêng của từng bảng — xem ghi chú trong chính file đó.
const F_MAU = new URL('./du-lieu/luat-mau.json', import.meta.url);
const LUAT_MAU = fs.existsSync(F_MAU) ? JSON.parse(fs.readFileSync(F_MAU, 'utf8')) : {};
const luatCua = (id) => {
  const x = LUAT_MAU[id];
  if (!x) return null;
  const ra = {};
  for (const [k, v] of Object.entries(x)) if (!k.startsWith('_')) ra[k] = v;
  return ra;
};

const canDb = await db.home.findMany({
  where: { desc: { startsWith: 'GOODSTAY' }, choTrangThai: 'DANG_BAN' },
  select: { id: true, hostId: true, name: true, desc: true, salesTitle: true, price: true, floorPrice: true, lichSheetCot: true, lichLink: true },
  orderBy: { id: 'asc' },
});
const theoBang = new Map();
for (const c of canDb) {
  const ma = (c.desc.match(/G-\d+/) || [])[0];
  // Link chủ nhà tự dán trong màn khai căn THẮNG link trong rổ GOODSTAY: rổ là bản
  // sao chép lại của bên tổng hợp, chủ nhà mới là người biết bảng thật của mình ở đâu.
  const link = c.lichLink || (ma ? linkTheoMa.get(ma) : null);
  const id = link ? idBangTinh(link) : null;
  if (!id) continue;
  if (!theoBang.has(id)) theoBang.set(id, []);
  theoBang.get(id).push({ ...c, ma });
}
console.log(`${canDb.length} căn GOODSTAY đang bán · ${theoBang.size} bảng tính`);
console.log(`Đọc ${SO_THANG} tháng: ${thangCanDoc.map((t) => t.m + '/' + t.y).join(' · ')}`);
console.log(GHI ? 'CHẾ ĐỘ: GHI THẬT vào nhánh thử\n' : 'CHẾ ĐỘ: xem trước, không ghi\n');

const baoCao = [];
let i = 0;
for (const [idBang, dsCan] of theoBang) {
  i++;
  let wb = null, loi = null;
  try { wb = await taiVaDoc(idBang); } catch (e) { loi = e.message; }

  // Đọc tất cả tháng cần, gộp lại thành một danh sách khối theo tên
  const khoiTheoThang = [];
  if (wb) {
    for (const t of thangCanDoc) {
      const chon = chonTab(wb, t.m, t.y);
      if (!chon) continue;
      khoiTheoThang.push({ t, tab: chon.w.name, khoi: docTab(chon.w, chon.w.name, luatCua(idBang)) });
    }
    if (!khoiTheoThang.some((x) => x.khoi.length)) loi = loi || 'Không nhận ra bảng lịch trong tab nào';
  }

  console.log(`${String(i).padStart(3)}/${theoBang.size} ${idBang.slice(0, 10)} · ${dsCan.length} căn · ${loi ? '✕ ' + loi : khoiTheoThang.map((x) => x.tab + '(' + x.khoi.length + ')').join(' ')}`);

  for (const can of dsCan) {
    const muc = { ma: can.ma, id: can.id, ten: can.name, idBang, loi, doChac: null, tenBang: null, dem: 0, thang: [] };

    if (!loi) {
      // Ghép ở tháng đầu tiên đọc được, rồi dùng cùng tên đó cho các tháng sau.
      // Ưu tiên 1: chính chủ nhà đã chọn khối trong màn khai căn (lưu ở lichSheetCot).
      // Đó là người biết rõ nhất căn của mình nằm ở cột nào — hơn mọi thuật toán ghép tên.
      // Ưu tiên 2: bảng ghép tay do Sabi chỉ. Ưu tiên 3: máy tự ghép theo tên + giá.
      let tenKhop = (typeof can.lichSheetCot === 'string' && can.lichSheetCot.trim() ? can.lichSheetCot.trim() : null);
      if (tenKhop) { muc.doChac = 'host'; muc.tenBang = tenKhop; }
      if (!tenKhop) tenKhop = (typeof GHEP_TAY[can.ma] === 'string' ? GHEP_TAY[can.ma] : null);
      if (tenKhop) { muc.doChac = 'tay'; muc.tenBang = tenKhop; }
      for (const x of khoiTheoThang) {
        if (tenKhop || !x.khoi.length) continue;
        const g = ghep(can.name, x.khoi, can.floorPrice || can.price);
        if (!g.khoi) continue;
        tenKhop = g.khoi.ten; muc.doChac = g.doChac; muc.tenBang = g.khoi.ten;
      }
      if (!tenKhop) {
        muc.loi = 'Không ghép được tên căn với khối nào trong bảng';
        // Ghi lại các khối CÓ THẬT trong bảng để bạn chọn tay — máy chịu thì người chọn.
        const ds = new Map();
        for (const x of khoiTheoThang) {
          for (const k of x.khoi) {
            const ban = k.ngay.filter((n) => n.trangThai !== 'trong').length;
            if (!ds.has(k.ten) || ds.get(k.ten) < ban) ds.set(k.ten, ban);
          }
        }
        muc.ungVien = [...ds].map(([ten, ban]) => ({ ten, ban }));
      }
      else {
        for (const x of khoiTheoThang) {
          const k = x.khoi.find((z) => z.ten === tenKhop);
          if (!k) continue;
          const ban = k.ngay.filter((n) => n.trangThai !== 'trong' && n.ngay >= homNay);
          muc.thang.push({ tab: x.tab, tong: k.ngay.length, ban: ban.length });
          muc.ban = (muc.ban || []).concat(ban.map((n) => ({ ngay: n.ngay, tt: n.trangThai })));
        }
        muc.dem = (muc.ban || []).length;
      }
    }
    baoCao.push(muc);
  }
}

// ───── Ghi ─────
const GHI_DUOC = new Set(['chac', 'kha', 'tay', 'host']);   // 'mo' phải người duyệt, không tự ghi
let soGhi = 0, soXoa = 0, soCanGhi = 0;
if (GHI) {
  for (const m of baoCao) {
    if (m.loi || !GHI_DUOC.has(m.doChac)) continue;
    const den = new Date(homNay + 'T00:00:00Z');
    den.setUTCMonth(den.getUTCMonth() + SO_THANG);
    const denS = den.toISOString().slice(0, 10);

    const can = canDb.find((c) => c.id === m.id);
    // Chỉ đụng dòng nguồn SHEET, chỉ trong khoảng đã đọc, chỉ từ hôm nay trở đi.
    const cu = await db.lichKhoa.findMany({
      where: { homeId: m.id, nguon: 'SHEET', ngay: { gte: ngayUTC(homNay), lt: ngayUTC(denS) } },
      select: { id: true, ngay: true },
    });
    const muon = new Set((m.ban || []).map((x) => x.ngay));
    const dangCo = new Map(cu.map((x) => [x.ngay.toISOString().slice(0, 10), x.id]));

    const themVao = [...muon].filter((d) => !dangCo.has(d));
    const boDi = [...dangCo].filter(([d]) => !muon.has(d)).map(([, id]) => id);

    if (boDi.length) { await db.lichKhoa.deleteMany({ where: { id: { in: boDi } } }); soXoa += boDi.length; }
    for (const d of themVao) {
      const tt = (m.ban.find((x) => x.ngay === d) || {}).tt;
      try {
        await db.lichKhoa.create({
          data: {
            hostId: can.hostId, homeId: m.id, ngay: ngayUTC(d), nguon: 'SHEET',
            ghiChu: tt === 'giu' ? 'Sheet: giữ chờ cọc' : tt === 'khoa' ? 'Sheet: chủ nhà khoá' : 'Sheet: đã bán',
          },
        });
        soGhi++;
      } catch { /* đã có dòng MANUAL cho đêm đó -> tôn trọng, bỏ qua */ }
    }
    await db.home.update({
      where: { id: m.id },
      data: {
        lichNguon: 'SHEET', lichDongBoLuc: new Date(), lichLoiTu: null,
        // Ghi lại đọc từ đâu — KHÔNG ra chợ (không nằm trong CHON_CHO), chỉ để dò khi sai.
        lichLink: `https://docs.google.com/spreadsheets/d/${m.idBang}`,
        lichSheetTab: (m.thang[0] && m.thang[0].tab) || null,
        lichSheetCot: m.tenBang || null,
      },
    });
    soCanGhi++;
  }
  // Căn đọc hỏng: đánh dấu lỗi để chợ tự hạ xuống mức ④ sau 24h
  for (const m of baoCao) {
    if (!m.loi) continue;
    await db.home.update({ where: { id: m.id }, data: { lichLoiTu: new Date() } }).catch(() => {});
  }
}

// ───── Tổng kết ─────
const dem = (d) => baoCao.filter((x) => !x.loi && x.doChac === d).length;
console.log(`\n${baoCao.length} căn · chủ nhà tự chọn khối ${dem('host')} · Sabi chỉ tay ${dem('tay')} · máy ghép chắc ${dem('chac')} · khá ${dem('kha')} · mờ ${dem('mo')} (cần bạn duyệt) · hỏng ${baoCao.filter((x) => x.loi).length}`);
if (GHI) console.log(`Đã ghi lịch cho ${soCanGhi} căn · thêm ${soGhi} đêm bận · gỡ ${soXoa} đêm không còn bận`);
else console.log('Thêm --ghi để ghi thật.');

fs.writeFileSync('_ghep-lich.json', JSON.stringify({ homNay, baoCao }, null, 1), 'utf8');
console.log('Đã ghi _ghep-lich.json');
await db.$disconnect();
