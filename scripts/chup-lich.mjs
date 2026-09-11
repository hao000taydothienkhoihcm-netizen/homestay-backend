// Chụp lại lịch (nguồn SHEET) đang nằm trong nhánh thử, để so hai lần đồng bộ.
//
//   node scripts/chup-lich.mjs truoc   -> ghi _lich-truoc.json
//   node scripts/chup-lich.mjs sau     -> ghi _lich-sau.json VÀ in ra khác nhau chỗ nào
//
// Dùng để trả lời câu "lịch hôm nay có khác hôm qua không" — nếu chạy đồng bộ mà
// không có gì đổi thì hoặc là thật sự không ai đặt thêm, hoặc là đồng bộ đang hỏng
// mà im lặng. Phải nhìn thấy số mới biết.
import 'dotenv/config';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const KHI = process.argv[2] === 'sau' ? 'sau' : 'truoc';
const F = `_lich-${KHI}.json`;

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_THU } }, log: ['error'] });

const can = await db.home.findMany({
  where: { desc: { startsWith: 'GOODSTAY' } },
  select: { id: true, name: true, desc: true, lichNguon: true, lichDongBoLuc: true, lichLoiTu: true },
});
const tenCua = new Map(can.map((c) => [c.id, c.name]));

const rows = await db.lichKhoa.findMany({
  where: { nguon: 'SHEET', homeId: { in: can.map((c) => c.id) } },
  select: { homeId: true, ngay: true, ghiChu: true },
  orderBy: [{ homeId: 'asc' }, { ngay: 'asc' }],
});
const theoCan = {};
for (const r of rows) {
  const k = String(r.homeId);
  (theoCan[k] = theoCan[k] || []).push(r.ngay.toISOString().slice(0, 10));
}
const anh = {
  luc: new Date().toISOString(),
  homNay: new Date().toISOString().slice(0, 10),
  soCanCoLich: Object.keys(theoCan).length,
  soDem: rows.length,
  ten: Object.fromEntries(can.map((c) => [c.id, c.name])),
  lich: theoCan,
};
fs.writeFileSync(F, JSON.stringify(anh, null, 1), 'utf8');
console.log(`Đã chụp ${F} · ${anh.soCanCoLich} căn · ${anh.soDem} đêm bận · lúc ${anh.luc.slice(0, 16).replace('T', ' ')}`);

if (KHI === 'sau' && fs.existsSync('_lich-truoc.json')) {
  const truoc = JSON.parse(fs.readFileSync('_lich-truoc.json', 'utf8'));
  console.log(`\nSO VỚI LẦN TRƯỚC (chụp ${truoc.luc.slice(0, 16).replace('T', ' ')})`);
  console.log(`  căn có lịch: ${truoc.soCanCoLich} -> ${anh.soCanCoLich}`);
  console.log(`  đêm bận    : ${truoc.soDem} -> ${anh.soDem}`);

  const moiCan = new Set([...Object.keys(truoc.lich), ...Object.keys(theoCan)]);
  const doi = [];
  for (const id of moiCan) {
    const a = new Set(truoc.lich[id] || []);
    const b = new Set(theoCan[id] || []);
    // Bỏ qua đêm đã trôi vào quá khứ — mất đi là đúng, không phải thay đổi thật.
    const them = [...b].filter((d) => !a.has(d));
    const mat = [...a].filter((d) => !b.has(d) && d >= anh.homNay);
    const quaKhu = [...a].filter((d) => !b.has(d) && d < anh.homNay);
    if (them.length || mat.length) {
      doi.push({ id, ten: tenCua.get(+id) || truoc.ten[id] || '?', them, mat, quaKhu: quaKhu.length });
    }
  }
  if (!doi.length) {
    console.log('\n  Không có đêm nào đổi trạng thái.');
  } else {
    console.log(`\n  ${doi.length} căn có thay đổi:`);
    for (const d of doi) {
      const t = d.them.length ? `+${d.them.length} đêm bận (${d.them.slice(0, 6).join(' ')}${d.them.length > 6 ? '…' : ''})` : '';
      const m = d.mat.length ? `−${d.mat.length} đêm được nhả ra (${d.mat.slice(0, 6).join(' ')}${d.mat.length > 6 ? '…' : ''})` : '';
      console.log(`   #${d.id} ${d.ten.slice(0, 26).padEnd(26)} ${[t, m].filter(Boolean).join(' · ')}`);
    }
  }
  const roiQK = [...moiCan].reduce((s, id) => s + (truoc.lich[id] || []).filter((d) => d < anh.homNay).length, 0);
  if (roiQK) console.log(`\n  (${roiQK} đêm đã trôi vào quá khứ — vẫn nằm trong kho nhưng chợ không dùng tới)`);
}

// Sức khoẻ đồng bộ — thứ dễ hỏng âm thầm nhất
const cu = can.filter((c) => c.lichNguon && c.lichDongBoLuc
  && Date.now() - new Date(c.lichDongBoLuc).getTime() > 24 * 3600e3);
const loi = can.filter((c) => c.lichLoiTu);
console.log(`\nSỨC KHOẺ: ${can.filter((c) => c.lichNguon).length} căn có nối lịch · ${cu.length} căn quá 24h chưa đồng bộ lại · ${loi.length} căn đang mang dấu lỗi`);
await db.$disconnect();
