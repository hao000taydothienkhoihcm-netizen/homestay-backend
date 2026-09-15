// routes/cho.js — CHỢ CĂN cho vai SALES (GĐ3 tầng 2).
//
// ⚠ ĐÂY LÀ NGOẠI LỆ THỨ HAI CỦA hostWhere() (sau hostWhereTaiKhoan cho bảng User).
// Chợ CỐ Ý không lọc theo hostId: sales là tài khoản cấp nền tảng, phải thấy căn của
// MỌI host. Bù lại, an toàn nằm ở 3 lớp:
//   1. Chỉ căn `choTrangThai = DANG_BAN` — host tự bấm gửi, Sabi duyệt rồi mới lên đây.
//   2. Danh sách cột trả về là DANH SÁCH TRẮNG cứng (CHON_CHO), không dùng `include`
//      hay trải nguyên bản ghi — thêm cột mới vào Home cũng không tự lọt ra chợ.
//   3. Không bao giờ trả: address (địa chỉ chính xác), caretakerPhone (SĐT quản gia),
//      rules, tên/SĐT host, floorPrice, và tên khách trong lịch. Mấy thứ đó chỉ lộ
//      SAU KHI host duyệt giữ chỗ (GĐ4).
//
// Giá cho sales tính theo cơ chế hoa hồng host chọn — xem `giaChoSales()`.
import { routerAnToan } from '../lib/router-an-toan.js';
import { prismaChiDoc } from '../prisma.js';
import { requireRole } from '../middleware/auth.js';

// Mặt sales CHỈ cầm kết nối chỉ-đọc. Từ 15/09/2026 chợ gánh thêm mặt chủ nhà (ghi được)
// trong cùng tiến trình, nên không thể dựa vào "cả tiến trình chỉ đọc" nữa — phải ghim
// ngay tại đây. Thiếu client thì gãy lúc nạp module, đừng để rơi xuống quyền chủ sở hữu.
if (!prismaChiDoc) {
  throw new Error('routes/cho.js cần DATABASE_URL_CHO (role chỉ-đọc). Không được chạy chợ bằng quyền chủ sở hữu.');
}
const prisma = prismaChiDoc;

const router = routerAnToan();

// Sales là vai chính. ADMIN vào được để kiểm tra chợ đang hiện gì cho sales —
// đây là dữ liệu host CHỦ ĐỘNG công khai để bán, không phải dữ liệu kinh doanh riêng.
const XEM_CHO = ['SALES', 'ADMIN'];

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ngayUTC = (s) => new Date(s + 'T00:00:00.000Z');
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const ngayHopLe = (s) => typeof s === 'string' && YMD.test(s) && !Number.isNaN(ngayUTC(s).getTime()) && ymd(ngayUTC(s)) === s;

// DANH SÁCH TRẮNG — chỉ những cột này ra khỏi hệ thống cho sales.
const CHON_CHO = {
  id: true, hostId: true,
  // TÊN CĂN được ra chợ — quyết định đã chốt: sales nắm thị trường nhìn TÊN mới biết
  // căn đó có hay không; chỉ đưa mã thì họ không biết căn nào nên ngại bán. Chợ bắt
  // đăng nhập vai SALES nên đây không phải nơi công khai.
  // CẨN THẬN: tên căn CHỈ dành cho sales. Bài chào gửi khách tuyệt đối không được có
  // tên căn — xem baiChao() bên sabicho.
  name: true,
  // desc lấy vào ĐỂ BÓC MÃ G-xxx rồi vứt, KHÔNG trả ra ngoài: đó là ghi chú nội bộ
  // của chủ nhà, họ gõ gì trong đó là việc của họ.
  desc: true,
  // kmTrungTam + viTriUocChung được phép ra chợ. lat/lng/mapLink/address thì KHÔNG:
  // toạ độ chính là địa chỉ chính xác, chỉ lộ sau khi host duyệt giữ chỗ (GĐ4).
  salesTitle: true, ward: true, landmark: true, kmTrungTam: true, viTriUocChung: true,
  maxGuests: true, minGuests: true,
  bedrooms: true, bedroomsSingle: true, bedroomsDouble: true, roomNotes: true,
  amenities: true,
  parkingFree: true, parkingFee: true, parkingNote: true,
  childUnder6: true, childFrom6: true,
  coverImages: true, albumUrl: true, salesInfo: true,
  coCheHoaHong: true, listPrice: true, commissionPct: true,
  floorPrice: true, markupMin: true, markupMax: true,
  // Giá theo loại đêm + luật cuối tuần của chính căn đó
  listPriceWeekend: true, listPriceHoliday: true,
  floorPriceWeekend: true, floorPriceHoliday: true, markupHoliday: true,
  cuoiTuanGom: true,
  // Nguồn lịch — để tính mức tin cậy. KHÔNG trả link/tab/key: đó là cấu hình riêng của host.
  lichNguon: true, lichDongBoLuc: true, lichLoiTu: true,
};

// ───── Mức tin cậy lịch ─────
// Không lưu thành cột: suy từ nguồn + chuỗi lỗi, để không bao giờ có chuyện
// cột ghi mức ① mà thực tế đã hai ngày không đọc được lịch.
const MUC_LICH = {
  1: { ten: 'Lịch thật', ghi: 'Chủ nhà dùng app nội bộ Sabi — lịch cập nhật tức thì.', canhBao: false },
  2: { ten: 'Tự động', ghi: 'Đồng bộ tự động từ lịch của chủ nhà.', canhBao: false },
  // Cố ý KHÔNG nói "của chủ nhà": khảo sát rổ hàng thật cho thấy nhiều link lịch trỏ
  // sang bảng của một ĐƠN VỊ TỔNG HỢP khác, tức là bản sao của bản sao. Ghi sai nguồn
  // là sales tin quá mức rồi chốt trúng ngày đã bận.
  3: { ten: 'Tham khảo', ghi: 'Đọc từ bảng Google Sheet — có thể là bảng của bên tổng hợp chứ không phải chủ nhà, nên chậm hơn thực tế. Gọi xác nhận trước khi chốt.', canhBao: true },
  4: { ten: 'Chưa có lịch', ghi: 'Chưa nối lịch. Bắt buộc gọi chủ nhà hỏi ngày trống.', canhBao: true },
};
const NGUONG_LOI = 24 * 60 * 60 * 1000;   // lỗi liên tục quá 24h thì hạ xuống mức ④

function tinhMucLich(h, bayGio = Date.now()) {
  if (!h.lichNguon) return 4;
  // Lịch KHÔNG ĐỔI là bình thường (mùa ế thì trống là câu trả lời đúng).
  // Chỉ ĐỌC KHÔNG ĐƯỢC liên tục mới bị hạ mức.
  if (h.lichLoiTu && bayGio - new Date(h.lichLoiTu).getTime() > NGUONG_LOI) return 4;
  if (h.lichNguon === 'APP') return 1;
  if (h.lichNguon === 'ICAL' || h.lichNguon === 'SCRIPT') return 2;
  return 3;   // SHEET
}
function goiLich(h) {
  const muc = tinhMucLich(h);
  return { muc, ...MUC_LICH[muc], dongBoLuc: muc === 1 ? null : (h.lichDongBoLuc || null) };
}

// Đổi cấu hình hoa hồng của host thành thứ sales cần thấy, cho CẢ BA loại đêm.
//
//   A (PHAN_TRAM): host niêm yết giá bán từng loại đêm, trích một mức % dùng chung.
//       Đêm lễ giá cao thì hoa hồng tự cao — cố ý không có % riêng cho lễ.
//   B (GIA_SAN):   host chốt giá sàn từng loại đêm + mức kê. Ngày lễ có mức kê riêng
//       vì lễ host thường cho kê nhiều hơn. Sales KHÔNG tự đặt mức kê, chỉ được CẮT bớt.
//
// Trả cả `hostNhan` — mockup đã chốt là sales nhìn thấy phần chia tiền (nằm trong
// khối gập lại, kèm nhắc đừng mở trước mặt khách). Giấu số đó chỉ khiến sales tự
// tính nhẩm sai rồi cãi nhau với chủ nhà.
const LOAI_DEM = ['thuong', 'cuoiTuan', 'le'];

function motDem(h, loai) {
  if (h.coCheHoaHong === 'PHAN_TRAM') {
    const ban = loai === 'le' ? (h.listPriceHoliday || h.listPriceWeekend || h.listPrice)
      : loai === 'cuoiTuan' ? (h.listPriceWeekend || h.listPrice)
        : h.listPrice;
    if (!ban) return null;
    const hh = Math.round(ban * (h.commissionPct || 0) / 100);
    return { khachTra: ban, hoaHong: hh, hostNhan: ban - hh };
  }
  const san = loai === 'le' ? (h.floorPriceHoliday || h.floorPriceWeekend || h.floorPrice)
    : loai === 'cuoiTuan' ? (h.floorPriceWeekend || h.floorPrice)
      : h.floorPrice;
  if (!san) return null;
  const ke = loai === 'le' ? (h.markupHoliday ?? h.markupMin ?? 0) : (h.markupMin || 0);
  return { khachTra: san + ke, hoaHong: ke, hostNhan: san };
}

function giaChoSales(h) {
  const co = (h.coCheHoaHong === 'PHAN_TRAM' && h.listPrice)
    || (h.coCheHoaHong === 'GIA_SAN' && h.floorPrice);
  if (!co) return { coChe: null };   // host duyệt xong mà xoá cấu hình — hiếm, nhưng đừng nổ

  const dem = {};
  for (const l of LOAI_DEM) dem[l] = motDem(h, l);
  return {
    coChe: h.coCheHoaHong === 'PHAN_TRAM' ? 'A' : 'B',
    phanTram: h.coCheHoaHong === 'PHAN_TRAM' ? (h.commissionPct || 0) : null,
    cuoiTuanGom: h.cuoiTuanGom,
    dem,
    tuGia: dem.thuong ? dem.thuong.khachTra : null,   // số hiện trên thẻ ngoài chợ
  };
}

/**
 * Mã căn để sales gọi tên khi trao đổi với nhau và với Sabi.
 * Căn nhập từ rổ GOODSTAY mang sẵn mã G-xxx trong desc; căn host tự khai thì chưa có
 * mã nào nên ghép từ id. KHÔNG bịa mã đẹp hơn sự thật: hai loại nhìn là phân biệt được.
 */
function maCan(h) {
  return (String(h.desc || '').match(/\bG-\d+\b/) || [])[0] || `SH-${h.id}`;
}

function goiCan(h) {
  const {
    coCheHoaHong, listPrice, commissionPct, floorPrice, markupMin, markupMax,
    listPriceWeekend, listPriceHoliday, floorPriceWeekend, floorPriceHoliday, markupHoliday,
    cuoiTuanGom, lichNguon, lichDongBoLuc, lichLoiTu,
    desc,                       // chỉ dùng để bóc mã ở trên, không ra chợ
    ...con
  } = h;
  return { ...con, ma: maCan(h), gia: giaChoSales(h), lich: goiLich(h) };
}

// ───────────────────────────────────────────────
// GET /v1/cho  — danh sách căn đang bán
//
// Lọc cơ bản : ?ward= &khach= (= người lớn) &q= &tu=&den= (còn trống trọn khoảng)
// Lọc sâu    : &pnMin= (phòng ngủ tối thiểu) &kmMax= &giaMin=&giaMax= (VNĐ, GIÁ HOST NHẬN)
//              &tienIch=a,b,c (phải có ĐỦ) &sap= muc|giaAsc|giaDesc|sucChua|km
//
// VÌ SAO LỌC GIÁ THEO GIÁ HOST NHẬN, KHÔNG PHẢI GIÁ KHÁCH TRẢ:
// khách nói "tầm 2 triệu" là nói giá họ trả, nhưng sales còn cắt bớt hoa hồng được.
// Lọc theo giá sàn host mới ra đúng rổ căn sales có thể xoay xở. Mockup chốt vậy.
//
// Trẻ dưới 6 tuổi CỐ Ý không gửi lên đây: chỉ người lớn tính vào sức chứa, nên
// lọc bằng `khach` là đủ — web chỉ dùng số trẻ để nhắc sales.
// ───────────────────────────────────────────────
const SAP_HOP_LE = ['muc', 'giaAsc', 'giaDesc', 'sucChua', 'km'];
const DAI_SO_DEM = 14;               // dải lịch hiện trên thẻ căn
// Số căn trả về mỗi lần. 20 thẻ vừa đủ một màn cuộn trên điện thoại mà chưa nặng.
const MOI_TRANG = 20;

const soDuong = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

router.get('/', requireRole(...XEM_CHO), async (req, res) => {
  const { ward, khach, q, tu, den, pnMin, kmMax, giaMin, giaMax, tienIch, sap } = req.query;

  const where = { choTrangThai: 'DANG_BAN', active: true };
  if (ward && String(ward).trim()) where.ward = String(ward).trim();
  const soKhach = parseInt(khach);
  if (Number.isFinite(soKhach) && soKhach > 0) where.maxGuests = { gte: soKhach };
  if (q && String(q).trim()) {
    const s = String(q).trim();
    // Quét cả `street` và `address`: sales gõ "Trần Thái Tông" hay "hẻm Nguyễn Công Trứ"
    // là ra căn ngay, thay vì sót chỉ vì tiêu đề bán hàng không nhắc tên đường.
    // TÌM trên hai cột đó KHÔNG làm lộ chúng — danh sách cột trả về vẫn là CHON_CHO.
    where.OR = [
      // Tên căn đứng đầu: sales nhớ căn theo TÊN ("Chú Cuội", "Nhà của Gấu"),
      // gõ tên mà không ra thì họ nghĩ chợ không có hàng.
      { name: { contains: s, mode: 'insensitive' } },
      { salesTitle: { contains: s, mode: 'insensitive' } },
      { landmark: { contains: s, mode: 'insensitive' } },
      { ward: { contains: s, mode: 'insensitive' } },
      { street: { contains: s, mode: 'insensitive' } },
      { address: { contains: s, mode: 'insensitive' } },
    ];
  }
  const soPn = soDuong(pnMin);
  if (soPn) where.bedrooms = { gte: soPn };

  const [tongCan, thoBan] = await Promise.all([
    prisma.home.count({ where: { choTrangThai: 'DANG_BAN', active: true } }),
    prisma.home.findMany({ where, select: CHON_CHO, orderBy: { id: 'asc' } }),
  ]);
  let rows = thoBan;

  // ───── Cách trung tâm ─────
  // Căn CHƯA ĐO km bị loại khi bộ lọc này bật — không thể khẳng định nó trong bán kính.
  // Đếm riêng để nói thẳng với sales, đỡ tưởng hết hàng.
  const kmToiDa = soDuong(kmMax);
  let chuaDoKm = 0;
  if (kmToiDa) {
    chuaDoKm = rows.filter((r) => r.kmTrungTam == null).length;
    rows = rows.filter((r) => r.kmTrungTam != null && r.kmTrungTam <= kmToiDa);
  }

  // ───── Tiện ích: phải có ĐỦ, khớp lỏng ─────
  // Host gõ "Sân BBQ", "BBQ ngoài trời"… nên so kiểu chứa-chuỗi thay vì bằng tuyệt đối.
  const canTienIch = String(tienIch || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (canTienIch.length) {
    rows = rows.filter((r) => canTienIch.every((t) => khopTienIch(r.amenities, t)));
  }

  // ───── Khoảng giá (VNĐ / đêm, giá host nhận, đêm thường) ─────
  const gMin = soDuong(giaMin), gMax = soDuong(giaMax);
  if (gMin || gMax) {
    rows = rows.filter((r) => {
      const h = motDem(r, 'thuong');
      if (!h) return false;
      if (gMin && h.hostNhan < gMin) return false;
      if (gMax && h.hostNhan > gMax) return false;
      return true;
    });
  }

  // ───── Khoảng ngày: chỉ giữ căn TRỐNG TRỌN VẸN [tu, den) — một đêm bận là loại ─────
  let khoang = null;
  if (ngayHopLe(tu) && ngayHopLe(den) && tu < den) {
    khoang = { tu, den };
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const [bks, khoa] = await Promise.all([
        prisma.booking.findMany({
          where: { homeId: { in: ids }, checkIn: { lt: ngayUTC(den) }, checkOut: { gt: ngayUTC(tu) } },
          select: { homeId: true },
        }),
        prisma.lichKhoa.findMany({
          where: { homeId: { in: ids }, ngay: { gte: ngayUTC(tu), lt: ngayUTC(den) } },
          select: { homeId: true },
        }),
      ]);
      const ban = new Set([...bks.map((b) => b.homeId), ...khoa.map((k) => k.homeId)]);
      rows = rows.filter((r) => !ban.has(r.id));
    }
  }

  // Lọc theo "nhận từ … khách": căn yêu cầu tối thiểu 6 khách thì đoàn 4 người không hợp.
  if (Number.isFinite(soKhach) && soKhach > 0) {
    rows = rows.filter((r) => !r.minGuests || soKhach >= r.minGuests);
  }

  // ───── Sắp xếp ─────
  // Xếp TRƯỚC khi cắt trang: cắt trước rồi mới xếp thì trang 2 lại có căn đáng lẽ
  // phải nằm ở trang 1 — sales cuộn xuống thấy căn rẻ hơn ở dưới, hết tin bộ sắp xếp.
  const kieu = SAP_HOP_LE.includes(String(sap)) ? String(sap) : 'muc';
  const giaThuong = (r) => { const d = motDem(r, 'thuong'); return d ? d.khachTra : Number.MAX_SAFE_INTEGER; };
  rows.sort((a, b) => (
    kieu === 'giaAsc' ? giaThuong(a) - giaThuong(b)
      : kieu === 'giaDesc' ? giaThuong(b) - giaThuong(a)
        : kieu === 'sucChua' ? b.maxGuests - a.maxGuests
          : kieu === 'km' ? (a.kmTrungTam ?? 1e9) - (b.kmTrungTam ?? 1e9)
            : tinhMucLich(a) - tinhMucLich(b)
  ) || a.id - b.id);

  // ───── Cắt trang ─────
  // Rổ hàng đang đi từ 9 căn lên trăm mấy. Trả hết một lượt thì mỗi lần mở chợ là
  // tải cả trăm thẻ KÈM dải 14 đêm của từng căn — nặng, mà sales chỉ nhìn chục thẻ đầu.
  // Lọc và xếp vẫn chạy trên TOÀN BỘ để con số "tìm thấy N căn" luôn đúng, chỉ phần
  // trả về là cắt.
  const soCan = rows.length;
  const moiTrang = Math.min(Math.max(soDuong(req.query.moiTrang) || MOI_TRANG, 4), 50);
  const soTrang = Math.max(1, Math.ceil(soCan / moiTrang));
  const trang = Math.min(Math.max(soDuong(req.query.trang) || 1, 1), soTrang);
  rows = rows.slice((trang - 1) * moiTrang, trang * moiTrang);

  // ───── Dải 14 đêm cho từng thẻ ─────
  // Sales lướt danh sách là thấy ngay căn nào sắp kín — đúng việc họ cần.
  // Chạy SAU khi cắt trang: chỉ hỏi lịch của mấy căn thật sự trả về, thay vì cả trăm căn.
  const homNay = ymd(new Date());
  const daiTu = ngayHopLe(tu) && tu > homNay ? tu : homNay;
  const daiDen = ymd(new Date(ngayUTC(daiTu).getTime() + DAI_SO_DEM * 864e5));
  const banTheoCan = new Map();
  const idsTrang = rows.map((r) => r.id);
  if (idsTrang.length) {
    const [bks, khoa] = await Promise.all([
      prisma.booking.findMany({
        where: { homeId: { in: idsTrang }, checkIn: { lt: ngayUTC(daiDen) }, checkOut: { gt: ngayUTC(daiTu) } },
        select: { homeId: true, checkIn: true, checkOut: true },
      }),
      prisma.lichKhoa.findMany({
        where: { homeId: { in: idsTrang }, ngay: { gte: ngayUTC(daiTu), lt: ngayUTC(daiDen) } },
        select: { homeId: true, ngay: true },
      }),
    ]);
    const them = (idCan, s) => {
      if (s < daiTu || s >= daiDen) return;
      if (!banTheoCan.has(idCan)) banTheoCan.set(idCan, new Set());
      banTheoCan.get(idCan).add(s);
    };
    for (const b of bks) {
      for (let d = new Date(b.checkIn); d < b.checkOut; d.setUTCDate(d.getUTCDate() + 1)) them(b.homeId, ymd(d));
    }
    for (const k of khoa) them(k.homeId, ymd(k.ngay));
  }

  res.json({
    khoang,
    tongCan,                       // tổng căn đang bán, để web nói "x căn bị loại"
    chuaDoKm,                      // căn rớt vì chưa đo km — nói cho sales biết, đừng giấu
    sap: kieu,
    dai: { tu: daiTu, soDem: DAI_SO_DEM },
    soCan,                         // tổng căn KHỚP bộ lọc (không phải số căn trang này)
    trang, moiTrang, soTrang,
    conNua: trang < soTrang,       // web dựa vào đây để biết còn tải tiếp được không
    can: rows.map((r) => ({ ...goiCan(r), ban: [...(banTheoCan.get(r.id) || [])].sort() })),
  });
});


// Danh sách phường CÓ CĂN ĐANG BÁN — để ô lọc chỉ hiện phường thật sự có hàng.
router.get('/phuong', requireRole(...XEM_CHO), async (_req, res) => {
  const rows = await prisma.home.findMany({
    where: { choTrangThai: 'DANG_BAN', active: true, ward: { not: null } },
    select: { ward: true }, distinct: ['ward'], orderBy: { ward: 'asc' },
  });
  res.json(rows.map((r) => r.ward));
});

// ───── Tiện ích để lọc ─────
// Trả ĐỦ danh sách chuẩn kèm số căn thật, kể cả loại đang 0 căn. Web làm mờ cái 0 lại.
// Cố ý không giấu: chip mờ nói "chưa host nào khai", còn giấu đi thì sales tưởng app thiếu.
// Khớp lỏng theo từ khoá vì host gõ mỗi người một kiểu ("Sân BBQ", "BBQ ngoài trời").
const TIEN_ICH_CHUAN = [
  { khoa: 'hồ bơi', ten: 'Hồ bơi', tu: ['hồ bơi', 'ho boi', 'bể bơi', 'pool'] },
  { khoa: 'bbq', ten: 'BBQ', tu: ['bbq', 'nướng'] },
  { khoa: 'bếp', ten: 'Bếp', tu: ['bếp', 'bep', 'kitchen'] },
  { khoa: 'lò sưởi', ten: 'Lò sưởi', tu: ['lò sưởi', 'lo suoi', 'fireplace'] },
  { khoa: 'máy giặt', ten: 'Máy giặt', tu: ['máy giặt', 'may giat'] },
  { khoa: 'sân vườn', ten: 'Sân vườn', tu: ['sân vườn', 'san vuon', 'vườn'] },
  { khoa: 'karaoke', ten: 'Karaoke', tu: ['karaoke', 'loa kẹo'] },
  { khoa: 'view', ten: 'View đẹp', tu: ['view', 'tầm nhìn'] },
  { khoa: 'máy lạnh', ten: 'Máy lạnh', tu: ['máy lạnh', 'may lanh', 'điều hoà', 'điều hòa'] },
  { khoa: 'bồn tắm', ten: 'Bồn tắm', tu: ['bồn tắm', 'bon tam', 'jacuzzi'] },
  { khoa: 'thang máy', ten: 'Thang máy', tu: ['thang máy', 'thang may'] },
  { khoa: 'thú cưng', ten: 'Cho mang thú cưng', tu: ['thú cưng', 'thu cung', 'pet'] },
];

/** Dùng chung cho cả bộ lọc lẫn phần đếm — một luật khớp duy nhất, không lệch nhau. */
export function khopTienIch(amenities, khoa) {
  const nhom = TIEN_ICH_CHUAN.find((x) => x.khoa === khoa);
  const tu = nhom ? nhom.tu : [String(khoa).toLowerCase()];
  return (amenities || []).some((a) => {
    const s = String(a).toLowerCase();
    return tu.some((t) => s.includes(t));
  });
}

router.get('/tien-ich', requireRole(...XEM_CHO), async (_req, res) => {
  const rows = await prisma.home.findMany({
    where: { choTrangThai: 'DANG_BAN', active: true },
    select: { amenities: true },
  });
  res.json(TIEN_ICH_CHUAN.map(({ khoa, ten }) => ({
    khoa, ten, soCan: rows.filter((r) => khopTienIch(r.amenities, khoa)).length,
  })));
});

// ───────────────────────────────────────────────
// GET /v1/cho/:id  — chi tiết một căn
// ───────────────────────────────────────────────
router.get('/:id', requireRole(...XEM_CHO), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(404).json({ error: 'Không tìm thấy căn nhà' });
  const h = await prisma.home.findFirst({
    where: { id, choTrangThai: 'DANG_BAN', active: true },
    select: CHON_CHO,
  });
  if (!h) return res.status(404).json({ error: 'Không tìm thấy căn nhà' });

  // Ngày lễ do host tự khai — sales cần để biết đêm nào ăn giá lễ.
  // Chỉ trả khoảng ngày và tên, không có gì riêng tư.
  const le = await prisma.holiday.findMany({
    where: { hostId: h.hostId },
    select: { name: true, startDate: true, endDate: true },
    orderBy: { startDate: 'asc' },
  });
  res.json({
    ...goiCan(h),
    ngayLe: le.map((x) => ({ ten: x.name, tu: ymd(x.startDate), den: ymd(x.endDate) })),
  });
});

// ───────────────────────────────────────────────
// GET /v1/cho/:id/lich?tu&den — lịch TRỐNG / BẬN
// Chỉ 2 trạng thái. Sales KHÔNG được biết bận vì booking hay vì host khoá tay,
// càng không được biết tên khách — đó là chuyện riêng của host.
// ───────────────────────────────────────────────
router.get('/:id/lich', requireRole(...XEM_CHO), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(404).json({ error: 'Không tìm thấy căn nhà' });
  const h = await prisma.home.findFirst({
    where: { id, choTrangThai: 'DANG_BAN', active: true }, select: { id: true },
  });
  if (!h) return res.status(404).json({ error: 'Không tìm thấy căn nhà' });

  const now = new Date();
  const tu = ngayHopLe(req.query.tu) ? req.query.tu : ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const den = ngayHopLe(req.query.den) ? req.query.den : ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 4, 0)));

  const [bks, khoa] = await Promise.all([
    prisma.booking.findMany({
      where: { homeId: id, checkIn: { lte: ngayUTC(den) }, checkOut: { gt: ngayUTC(tu) } },
      select: { checkIn: true, checkOut: true },      // KHÔNG lấy guest / id / status
    }),
    prisma.lichKhoa.findMany({
      where: { homeId: id, ngay: { gte: ngayUTC(tu), lte: ngayUTC(den) } },
      select: { ngay: true },                          // KHÔNG lấy nguon / ghiChu
    }),
  ]);

  const ban = new Set();
  for (const b of bks) {
    for (let d = new Date(b.checkIn); d < b.checkOut; d.setUTCDate(d.getUTCDate() + 1)) ban.add(ymd(d));
  }
  for (const k of khoa) ban.add(ymd(k.ngay));

  const ngay = [];
  for (let d = ngayUTC(tu); d <= ngayUTC(den); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = ymd(d);
    ngay.push({ ngay: key, trangThai: ban.has(key) ? 'ban' : 'trong' });
  }
  res.json({ tu, den, ngay });
});

export default router;
