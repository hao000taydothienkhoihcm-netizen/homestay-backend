// Chung minh routerAnToan() giu duoc app song khi handler async nem loi.
//
// Dung mot app Express rieng, KHONG dung database, KHONG dung route that.
// Chay: node scripts/thu-boc-loi.mjs
import express from 'express';
import { routerAnToan } from '../src/lib/router-an-toan.js';
import { Router } from 'express';

let loi = 0;
const bao = (ok, msg) => { if (!ok) loi++; console.log(`${ok ? '  OK  ' : ' SAI  '} ${msg}`); };

// Router thuong o duoi se lam Node nem unhandledRejection va GIET script nay —
// dung y cai ta muon chung minh. Bat lai de con chay tiep ma so sanh.
let soLanThoatRaNgoai = 0;
process.on('unhandledRejection', () => { soLanThoatRaNgoai++; });

// ─── App 1: Router thuong (de doi chieu) ───
const appThuong = express();
const rThuong = Router();
rThuong.get('/no', async () => { throw new Error('vo tinh'); });
appThuong.use(rThuong);
let batDuocThuong = false;
appThuong.use((err, req, res, next) => { batDuocThuong = true; res.status(500).json({ e: 1 }); });

// ─── App 2: routerAnToan ───
const appAnToan = express();
const rAn = routerAnToan();
rAn.get('/no-async', async () => { throw new Error('async nem loi'); });
rAn.get('/no-sync', () => { throw new Error('dong bo nem loi'); });
rAn.get('/no-reject', () => Promise.reject(new Error('promise bi tu choi')));
rAn.get('/ok', async (req, res) => res.json({ ok: true }));
rAn.get('/co-status', async () => { const e = new Error('khong du quyen'); e.status = 403; throw e; });
appAnToan.use(rAn);
let batDuoc = 0; let lanCuoi = null;
appAnToan.use((err, req, res, next) => {
  batDuoc++; lanCuoi = err;
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Loi he thong' });
});

const sv1 = appThuong.listen(0);
const sv2 = appAnToan.listen(0);
const cong1 = sv1.address().port;
const cong2 = sv2.address().port;

// PHAI co han gio: router thuong khong gui phan hoi nao ca (loi thoat ra ngoai
// Express nen khong ai tra loi), fetch se cho mai mai. Do cung la mot trieu chung:
// nguoi dung ngoi nhin vong xoay khong bao gio dung.
const goi = async (cong, duong, han = 2500) => {
  try {
    const r = await fetch(`http://127.0.0.1:${cong}${duong}`, { signal: AbortSignal.timeout(han) });
    return { ma: r.status, body: await r.json().catch(() => null) };
  } catch (e) {
    return { ma: 0, treo: e.name === 'TimeoutError', loi: e.message };
  }
};

console.log('\n=== Router THUONG cua Express (de doi chieu) ===');
const a = await goi(cong1, '/no').catch(() => ({ ma: 0 }));
await new Promise((r) => setTimeout(r, 300));   // cho Node kip bao unhandledRejection
bao(batDuocThuong === false,
    `handler async nem loi -> error handler KHONG he chay (chay=${batDuocThuong})`);
bao(soLanThoatRaNgoai > 0,
    `loi THOAT RA NGOAI Express thanh unhandledRejection (${soLanThoatRaNgoai} lan)`);
bao(a.treo === true, `request bi TREO, khong co phan hoi nao (nguoi dung cho mai)`);
console.log('       ^ tren Render, day chinh la luc ca tien trinh bi giet.');

console.log('\n=== routerAnToan ===');
const b = await goi(cong2, '/no-async');
bao(b.ma === 500, `async nem loi -> tra 500 dang hoang (ma ${b.ma})`);
bao(b.body?.error === 'Loi he thong', `khong lo chi tiet loi ra ngoai (thay: "${b.body?.error}")`);

const c = await goi(cong2, '/no-sync');
bao(c.ma === 500, `dong bo nem loi -> tra 500 (ma ${c.ma})`);

const d = await goi(cong2, '/no-reject');
bao(d.ma === 500, `promise bi tu choi -> tra 500 (ma ${d.ma})`);

const e = await goi(cong2, '/co-status');
bao(e.ma === 403, `loi co status -> giu dung status (ma ${e.ma})`);
bao(e.body?.error === 'khong du quyen', `loi co status -> van noi that ly do`);

bao(batDuoc === 4, `error handler chay du 4 lan (thuc te ${batDuoc})`);

// Quan trong nhat: sau tat ca cac loi tren, app CON SONG khong?
const f = await goi(cong2, '/ok');
bao(f.ma === 200 && f.body?.ok === true, `sau ${batDuoc} loi lien tiep, app VAN PHUC VU BINH THUONG`);
bao(soLanThoatRaNgoai === 1,
    `routerAnToan khong de loi nao thoat ra ngoai (tong ${soLanThoatRaNgoai}, ca 1 lan do router thuong)`);

console.log('\n' + '='.repeat(55));
console.log(loi === 0 ? '  TAT CA DEU DUNG.' : `  CO ${loi} MUC SAI.`);
console.log('='.repeat(55) + '\n');

// Dong hai server roi cho mot nhip cho socket cua request bi treo o tren kip
// dong han. Goi process.exit() ngay se lam libuv bao "Assertion failed" tren
// Windows — khong anh huong san pham, nhung de nguoi doc tuong test hong.
sv1.closeAllConnections?.(); sv2.closeAllConnections?.();
sv1.close(); sv2.close();
await new Promise((r) => setTimeout(r, 200));
process.exitCode = loi === 0 ? 0 : 1;
