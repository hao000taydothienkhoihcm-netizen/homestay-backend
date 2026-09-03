import { chromium } from 'playwright';
const [,, inp, out] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
await p.goto('file://' + process.cwd() + '/' + inp, { waitUntil: 'load' });
await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await p.screenshot({ path: out.replace('.pdf', '.png'), fullPage: true });
await b.close();
