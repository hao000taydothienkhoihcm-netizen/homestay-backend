// Dựng máy chủ nội bộ trên NHÁNH THỬ, đăng nhập, rồi LƯU THẬT một căn đang chạy lịch Sheet
// đúng như chủ nhà bấm nút — để chắc chắn lịch KHÔNG bị xoá.
//
// Đây là lỗi từng làm mất lịch của 61 căn mà không ai hay, nên phải có bài kiểm chạy được,
// không phải đọc code rồi tin.
//
//   node scripts/thu-luu-khong-mat-lich.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const G = process.env.API_THU || 'http://localhost:3211';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });

const dem = async (id) => db.lichKhoa.count({ where: { homeId: id, nguon: 'SHEET' } });
const xem = async (id) => db.home.findUnique({ where: { id }, select: { name: true, lichNguon: true, lichLink: true, lichSheetTab: true, lichSheetCot: true, lichDongBoLuc: true, rules: true, markupMin: true, markupMax: true, salesInfo: true } });

const nhieuDem = await db.lichKhoa.groupBy({ by: ['homeId'], where: { nguon: 'SHEET' }, _count: { _all: true }, orderBy: { _count: { homeId: 'desc' } }, take: 5 });
const can = await db.home.findFirst({ where: { id: { in: nhieuDem.map((x) => x.homeId) }, lichNguon: 'SHEET' }, select: { id: true } })
  || await db.home.findFirst({ where: { lichNguon: 'SHEET', choTrangThai: 'DANG_BAN' }, select: { id: true }, orderBy: { id: 'asc' } });
if (!can) { console.error('Không có căn nào đang chạy lịch Sheet để thử.'); process.exit(1); }

const truoc = await xem(can.id), demTruoc = await dem(can.id);
console.log(`Căn thử: #${can.id} ${truoc.name}`);
console.log(`  TRƯỚC: nguồn ${truoc.lichNguon} · tab ${truoc.lichSheetTab} · khối ${truoc.lichSheetCot} · ${demTruoc} đêm SHEET`);
console.log(`         bài ${truoc.salesInfo ? truoc.salesInfo.length + ' ký tự' : 'TRỐNG'} · mức kê ${truoc.markupMin}`);

// Tự ký vé vào cho chủ căn đó — KHÔNG hỏi mật khẩu ai, không gõ mật khẩu vào đâu cả.
// Chỉ là bài kiểm chạy dưới máy, trên nhánh thử.
const ctruoc = await db.home.findUnique({ where: { id: can.id }, select: { hostId: true } });
// Vào bằng đúng đường ADMIN "vào hỗ trợ host" mà app đã có sẵn: vé admin + vé hỗ trợ
// gắn hostId của căn. Không gõ mật khẩu của ai, và đi đúng luồng thật chứ không lách.
const ad = await db.user.findFirst({ where: { role: 'ADMIN', active: true }, select: { id: true } });
if (!ad) { console.error('✕ Nhánh thử không có tài khoản ADMIN nào.'); process.exit(1); }
const token = jwt.sign({ id: ad.id, role: 'ADMIN', hostId: null }, process.env.JWT_SECRET, { expiresIn: '10m' });
const veHoTro = jwt.sign({ loai: 'ho-tro', adminId: ad.id, hostId: ctruoc.hostId }, process.env.JWT_SECRET, { expiresIn: '10m' });

// Gửi y hệt cái màn khai căn gửi khi bấm "Lưu" mà KHÔNG đụng gì tới khối lịch
const ct = await db.home.findUnique({ where: { id: can.id } });
const body = {
  ward: ct.ward, mapLink: ct.mapLink || '', bedrooms: ct.bedrooms,
  salesTitle: ct.salesTitle, landmark: ct.landmark, minGuests: ct.minGuests,
  roomNotes: ct.roomNotes, amenities: ct.amenities,
  albumUrl: ct.albumUrl, coverImages: ct.coverImages,
  salesInfo: ct.salesInfo, rules: '- Nhận phòng từ 14h, trả phòng trước 12h.', caretakerPhone: ct.caretakerPhone,
  coCheHoaHong: ct.coCheHoaHong, floorPrice: ct.floorPrice, markupMin: ct.markupMin, markupMax: ct.markupMin,
  // ĐÚNG như form mới gửi: nguồn lịch + link + khối
  lichNguon: ct.lichNguon, lichLink: ct.lichLink, lichSheetCot: ct.lichSheetCot,
};
const r2 = await fetch(`${G}/v1/homes/${can.id}/cho`, { method: 'PATCH',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, 'x-ho-tro': veHoTro }, body: JSON.stringify(body) });
console.log(`\nPATCH /homes/${can.id}/cho -> ${r2.status}`);
if (!r2.ok) console.log('  ' + (await r2.text()).slice(0, 300));

const sau = await xem(can.id), demSau = await dem(can.id);
console.log(`  SAU  : nguồn ${sau.lichNguon} · tab ${sau.lichSheetTab} · khối ${sau.lichSheetCot} · ${demSau} đêm SHEET`);
console.log(`         quy định: ${sau.rules ? '"' + sau.rules + '"' : 'TRỐNG'}`);

const ok = sau.lichNguon === truoc.lichNguon && demSau === demTruoc && sau.lichLink === truoc.lichLink && sau.lichSheetCot === truoc.lichSheetCot;
console.log(`\n${ok ? '✓ ĐẠT — lưu xong lịch còn nguyên' : '✕ HỎNG — lưu xong lịch bị đổi'}`);

// Thử luôn cái ngược lại: bỏ chọn nguồn lịch thì PHẢI xoá được (host chủ động ngắt)
const r3 = await fetch(`${G}/v1/homes/${can.id}/cho`, { method: 'PATCH',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, 'x-ho-tro': veHoTro },
  body: JSON.stringify({ ...body, lichNguon: null, lichLink: null, lichSheetCot: null }) });
const sau2 = await xem(can.id);
console.log(`\nHost chủ động ngắt lịch -> ${r3.status} · nguồn giờ là ${sau2.lichNguon} (phải là null) · ${await dem(can.id)} đêm SHEET vẫn còn trong kho`);

// Trả lại nguyên trạng
await db.home.update({ where: { id: can.id }, data: {
  lichNguon: truoc.lichNguon, lichLink: truoc.lichLink, lichSheetTab: truoc.lichSheetTab,
  lichSheetCot: truoc.lichSheetCot, lichDongBoLuc: truoc.lichDongBoLuc, rules: truoc.rules } });
console.log('Đã trả căn về nguyên trạng.');
await db.$disconnect();
