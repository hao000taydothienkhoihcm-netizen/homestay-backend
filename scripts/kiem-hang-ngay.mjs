// KIỂM TRA HÀNG NGÀY — chạy 7h sáng, gửi kết quả về mail.
//
// Thứ tự cố ý: ĐỐI CHIẾU trước, SAO LƯU sau.
// Nếu sao lưu trước thì bản mới đè lên làm mất mốc so sánh — dữ liệu mất đêm qua
// sẽ không ai phát hiện, vì bản sao lưu sáng nay cũng đã thiếu y như database.
//
// Chạy: node scripts/kiem-hang-ngay.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const THU_MUC_SAO_LUU = 'E:/project/homestay/_sao-luu';
const DICH_VU = [
  ['App nội bộ', 'https://homestay-backend-n61g.onrender.com/health'],
  ['Chợ căn', 'https://sabi-marketplace.onrender.com/health'],
];
const BANG = ['home', 'booking', 'expense', 'user', 'charge', 'stockEntry', 'holiday'];

const dong = [];
const canh = [];
const ghi = (s) => { dong.push(s); console.log(s); };
const bao = (s) => { canh.push(s); };

const gio = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
ghi(`SABI HOME — kiểm tra hàng ngày · ${gio}`);
ghi('');

// ───── 1. Hai service còn sống không ─────
ghi('DỊCH VỤ');
for (const [ten, url] of DICH_VU) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
    const ms = Date.now() - t0;
    if (r.ok) {
      ghi(`  OK   ${ten} · ${ms}ms` + (ms > 15000 ? '  (đang ngủ dậy — bình thường với gói Free)' : ''));
    } else {
      ghi(`  ✕    ${ten} · HTTP ${r.status}`);
      bao(`${ten} trả HTTP ${r.status}`);
    }
  } catch (e) {
    ghi(`  ✕    ${ten} · không gọi được (${e.name})`);
    bao(`${ten} KHÔNG PHẢN HỒI`);
  }
}

// ───── 2. Đối chiếu dữ liệu với bản sao lưu gần nhất ─────
ghi('');
ghi('DỮ LIỆU');
const db = new PrismaClient({ log: ['error'] });
let dem = {};
try {
  for (const b of BANG) dem[b] = await db[b].count();
} catch (e) {
  ghi('  ✕    không nối được database: ' + e.message.split('\n')[0]);
  bao('KHÔNG NỐI ĐƯỢC DATABASE');
}

let tenCu = null;
try {
  const ds = fs.readdirSync(THU_MUC_SAO_LUU).filter((f) => f.endsWith('.json.gz')).sort();
  tenCu = ds[ds.length - 1];
  const cu = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(THU_MUC_SAO_LUU, tenCu)))).bang || {};
  const tuoi = Math.round((Date.now() - fs.statSync(path.join(THU_MUC_SAO_LUU, tenCu)).mtimeMs) / 3600e3);
  ghi(`  Đối chiếu với ${tenCu} (${tuoi} giờ trước)`);
  for (const b of BANG) {
    const truoc = (cu[b] || []).length;
    const nay = dem[b] ?? 0;
    const d = nay - truoc;
    const dau = d > 0 ? `+${d}` : d < 0 ? `${d}` : 'không đổi';
    ghi(`  ${d < 0 ? '✕ ' : '  '} ${b.padEnd(11)} ${String(nay).padStart(4)}   (${dau})`);
    if (d < 0) bao(`${b}: mất ${-d} dòng so với hôm qua`);
  }
} catch (e) {
  ghi('  ⚠    không đọc được bản sao lưu cũ để đối chiếu');
  bao('Không đối chiếu được với bản sao lưu cũ');
}
await db.$disconnect();

// ───── 3. Sao lưu mới ─────
ghi('');
ghi('SAO LƯU');
const r = spawnSync('node', ['scripts/sao-luu.mjs'], { encoding: 'utf8', shell: true });
const out = (r.stdout || '') + (r.stderr || '');
if (r.status === 0) {
  for (const l of out.split('\n')) {
    const t = l.trim();
    if (t.startsWith('OK') || t.includes('->')) ghi('  ' + t);
  }
} else {
  ghi('  ✕    SAO LƯU HỎNG');
  ghi('  ' + out.split('\n').slice(-4).join('\n  '));
  bao('SAO LƯU HỎNG — không có bản mới cho hôm nay');
}

// ───── 4. Kết luận ─────
ghi('');
if (canh.length) {
  ghi('⚠ CẦN XEM: ' + canh.length + ' việc');
  for (const c of canh) ghi('   · ' + c);
} else {
  ghi('✅ Mọi thứ bình thường. Không có gì phải làm.');
}

process.exit(canh.length ? 1 : 0);
