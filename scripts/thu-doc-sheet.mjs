// Thu xem may chu co doc duoc Google Sheet cua GOODSTAY khong (khong dang nhap).
// Neu doc duoc thi bo dong bo lich sau nay cung doc duoc y het.
const ID = '1OMYcVyyq-VtIPBF7T8oNsLdDTIqP0Hg4u5tc-UVLZTM';
const GID = process.argv[2] || '1851932432';

const thu = async (ten, url) => {
  try {
    const r = await fetch(url, { redirect: 'follow' });
    const t = await r.text();
    console.log(`${ten.padEnd(16)} ${r.status} ${r.headers.get('content-type')} · ${t.length} ky tu`);
    if (r.ok) console.log('   dong dau:', t.split('\n').slice(0, 3).map((s) => s.slice(0, 120)).join('\n             '));
    return r.ok ? t : null;
  } catch (e) {
    console.log(`${ten.padEnd(16)} LOI: ${e.cause?.code || e.message}`);
    return null;
  }
};

await thu('export csv', `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=${GID}`);
await thu('gviz csv', `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&gid=${GID}`);
