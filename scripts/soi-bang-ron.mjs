// In nguyên văn dòng được coi là luật kê của một bảng (đọc từ bản đệm, không tải lại).
import { taiVaDoc, chonTab, luatKeCuaTab, docLuatKe } from '../src/lib/lich-sheet.js';
const id = process.argv[2];
const wb = await taiVaDoc(id);
const bg = new Date();
const ch = chonTab(wb, bg.getUTCMonth() + 1, bg.getUTCFullYear()) || { w: wb.worksheets[0] };
const k = luatKeCuaTab(ch.w);
console.log('tab:', ch.w.name);
console.log(k ? `ô ${k.o} · thường ${k.thuong} · lễ ${k.le}\nNGUYÊN VĂN:\n"${k.nguyenVan}"` : 'không bóc được luật kê');
