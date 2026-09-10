// Thu xem may nay goi duoc nhung dich vu nao (de biet co do toa do duoc khong).
const thu = async (ten, url) => {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'SabiHome/1.0 (noi bo)' } });
    console.log(ten.padEnd(28), r.status, (await r.text()).slice(0, 90).replace(/\s+/g, ' '));
  } catch (e) {
    console.log(ten.padEnd(28), 'LOI:', e.cause?.code || e.message);
  }
};
await thu('nominatim (OSM)', 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=Da+Lat');
await thu('photon (Komoot)', 'https://photon.komoot.io/api/?limit=1&q=Da+Lat');
await thu('google.com', 'https://www.google.com/generate_204');
