// Dựng trang để CHỦ NHÀ DUYỆT việc ghép lịch: căn nào đã đổ lịch, căn nào máy
// đoán chưa chắc, căn nào chưa ghép được và trong bảng của họ có sẵn những tên nào.
//   node scripts/trang-ghep-lich.mjs   -> _ghep-lich.html
import fs from 'node:fs';

const j = JSON.parse(fs.readFileSync('_ghep-lich.json', 'utf8'));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const daGhep = j.baoCao.filter((x) => !x.loi && ['chac', 'kha', 'tay'].includes(x.doChac));
const mo = j.baoCao.filter((x) => !x.loi && x.doChac === 'mo');
const hong = j.baoCao.filter((x) => x.loi);
const nhomHong = new Map();
for (const x of hong) {
  const k = x.loi;
  if (!nhomHong.has(k)) nhomHong.set(k, []);
  nhomHong.get(k).push(x);
}
const tongDem = daGhep.reduce((s, x) => s + x.dem, 0);

const NHAN = { chac: 'khớp đúng tên', kha: 'tên chứa nhau', tay: 'bạn chỉ định', mo: 'máy đoán' };

const dong = (x) => `<tr>
  <td class="ma">${esc(x.ma)}</td>
  <td>${esc(x.ten)}</td>
  <td class="mui">${x.tenBang ? esc(x.tenBang) : '<i>—</i>'}</td>
  <td class="nho">${NHAN[x.doChac] || ''}</td>
  <td class="so">${x.dem || 0}</td>
</tr>`;

const dongHong = (x) => `<tr>
  <td class="ma">${esc(x.ma)}</td>
  <td>${esc(x.ten)}</td>
  <td colspan="3" class="nho">${x.ungVien && x.ungVien.length
    ? 'Trong bảng của chủ nhà này có: ' + x.ungVien.map((u) => `<b>${esc(u.ten)}</b> <span class="mo">(${u.ban} đêm bận)</span>`).join(' · ')
    : '<i>không có gợi ý</i>'}</td>
</tr>`;

const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ghép lịch chủ nhà vào chợ</title><style>
:root{--bg:#f4efe6;--card:#fffdf9;--line:#e3d8c4;--ink:#3d352a;--muted:#8a7a5c;--brown:#6b4f2a;--pine:#3c5843;--red:#b4553f;--gold:#c9a227}
@media(prefers-color-scheme:dark){:root{--bg:#1f1a14;--card:#2a241c;--line:#3d352a;--ink:#f4efe6;--muted:#a89878;--brown:#d9b98a;--pine:#8ab89a}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font:15px/1.55 'Be Vietnam Pro',system-ui,sans-serif;padding:22px 16px 60px}
.k{max-width:900px;margin:0 auto}
h1{font-family:Georgia,serif;font-size:25px;line-height:1.25}
h1 span{display:block;font:13px/1.5 system-ui,sans-serif;color:var(--muted);font-weight:400;margin-top:5px}
h2{font-family:Georgia,serif;font-size:18px;margin:26px 0 4px;color:var(--brown)}
h2 small{font:12px/1.5 system-ui,sans-serif;color:var(--muted);font-weight:400;display:block;margin-top:3px}
.tong{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 4px}
.o{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:11px 14px;flex:1;min-width:120px}
.o b{display:block;font-size:23px;font-variant-numeric:tabular-nums;color:var(--brown)}
.o span{font-size:12px;color:var(--muted)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-top:10px}
th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);padding:9px 10px;border-bottom:1px solid var(--line);font-weight:600}
td{padding:9px 10px;border-bottom:1px solid var(--line);font-size:13.5px;vertical-align:top}
tr:last-child td{border-bottom:0}
.ma{font:11px ui-monospace,Menlo,Consolas,monospace;color:var(--muted);white-space:nowrap}
.mui{color:var(--pine)}
.so{text-align:right;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
.nho{font-size:12px;color:var(--muted)}
.mo{opacity:.7}
.nhac{border:1px solid var(--line);border-left:3px solid var(--brown);background:var(--card);border-radius:8px;padding:11px 13px;font-size:13px;margin-top:10px;line-height:1.6}
.nhac.canh{border-left-color:var(--gold)}
footer{font-size:12px;color:var(--muted);margin-top:28px;line-height:1.65}
</style></head><body><div class="k">
<h1>Ghép lịch chủ nhà vào chợ<span>Đọc ngày ${esc(j.homNay)} · 3 tháng tới · rổ hàng GOODSTAY trên nhánh thử</span></h1>

<div class="tong">
  <div class="o"><b>${daGhep.length}</b><span>căn đã có lịch</span></div>
  <div class="o"><b>${tongDem}</b><span>đêm bận đổ vào</span></div>
  <div class="o"><b>${mo.length}</b><span>chờ bạn duyệt</span></div>
  <div class="o"><b>${hong.length}</b><span>chưa ghép được</span></div>
</div>

<h2>1 · Đã đổ lịch vào chợ<small>Những căn này giờ hiện nhãn ③ Tham khảo, và bị loại khỏi kết quả tìm nếu bận đúng ngày sales chọn.</small></h2>
<table><thead><tr><th>Mã</th><th>Tên trong chợ</th><th>Tên trong bảng chủ nhà</th><th>Ghép kiểu</th><th>Đêm bận</th></tr></thead>
<tbody>${daGhep.map(dong).join('')}</tbody></table>

<h2>2 · Máy đoán nhưng chưa chắc — chờ bạn duyệt<small>Cố ý KHÔNG đổ lịch mấy căn này. Ghép nhầm lịch của căn khác còn tệ hơn không có lịch: sales sẽ chốt trúng ngày bận rồi mất khách.</small></h2>
${mo.length ? `<table><thead><tr><th>Mã</th><th>Tên trong chợ</th><th>Máy đoán là</th><th></th><th>Đêm bận</th></tr></thead>
<tbody>${mo.map(dong).join('')}</tbody></table>` : '<div class="nhac">Không có căn nào ở nhóm này.</div>'}

<h2>3 · Chưa ghép được<small>Nhóm theo lý do. Chỗ nào có gợi ý là tên các bảng lịch CÓ THẬT trong bảng tính của chính chủ nhà đó — bạn chỉ cần nói căn nào ứng với tên nào.</small></h2>
${[...nhomHong].map(([ly, ds]) => `<h2 style="font-size:15px;margin:18px 0 2px">${esc(ly)} <small>${ds.length} căn</small></h2>
<table><tbody>${ds.map(dongHong).join('')}</tbody></table>`).join('')}

<div class="nhac canh"><b>Luật ghi lịch đang áp dụng</b><br>
Chỉ thêm/xoá dòng lịch <b>nguồn Sheet</b> — dòng chủ nhà tự khoá tay không bao giờ bị đụng tới.
Chỉ ghi từ hôm nay trở đi, quá khứ để yên. Căn ghép không chắc thì bỏ qua, không ghi.
Căn đọc hỏng bị đánh dấu lỗi; quá 24 giờ không đọc được thì chợ tự hạ xuống nhãn ④ và bảo sales gọi hỏi chủ nhà.</div>

<footer>Cách đọc: tải bản .xlsx của bảng rồi lấy <b>màu nền ô</b> làm trạng thái — đúng cách chủ nhà đang dùng. Bản CSV không mang màu nên không dùng được.<br>
Vàng là giữ chờ cọc, cam là chủ nhà khoá, tô màu gì khác cũng coi là đã bán. Sai về phía an toàn: thà báo bận nhầm còn hơn báo trống rồi sales chốt trúng ngày kín.</footer>
</div></body></html>`;

fs.writeFileSync('_ghep-lich.html', html, 'utf8');
console.log(`Đã ghi _ghep-lich.html · ${daGhep.length} căn có lịch · ${tongDem} đêm bận · ${mo.length} chờ duyệt · ${hong.length} chưa ghép`);
