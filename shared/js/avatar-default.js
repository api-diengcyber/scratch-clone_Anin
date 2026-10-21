// ============================================================
// DefaultAvatar — avatar robot buatan sendiri (SVG data URL).
// Menggantikan gambar dari api.dicebear.com yang diblokir CSP (img-src 'self' data:),
// jadi tidak butuh internet dan tidak perlu mengubah server.
//
//   DefaultAvatar.robot(seed)   -> data URL SVG robot (seed sama = robot sama)
//   DefaultAvatar.normalize(u)  -> kalau u masih URL dicebear lama, ubah jadi robot lokal
//                                  dengan seed yang sama; selain itu dikembalikan apa adanya
// ============================================================
(function () {
  const PALET = [
    ['#7181ec', '#e0e7ff'], ['#0ea5e9', '#e0f2fe'], ['#10b981', '#d1fae5'],
    ['#f59e0b', '#fef3c7'], ['#ec4899', '#fce7f3'], ['#8b5cf6', '#ede9fe']
  ];

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function robot(seed) {
    const h = hash(String(seed));
    const p = PALET[h % PALET.length];
    const bg = p[0], terang = p[1];
    const mata = 7 + ((h >> 3) % 3) * 2;          // jari-jari mata: 7 / 9 / 11
    const mulut = (h >> 5) % 3;                    // 0 senyum, 1 datar, 2 kotak
    let m;
    if (mulut === 0) m = '<path d="M42 78 Q60 92 78 78" fill="none" stroke="' + bg + '" stroke-width="5" stroke-linecap="round"/>';
    else if (mulut === 1) m = '<line x1="44" y1="82" x2="76" y2="82" stroke="' + bg + '" stroke-width="5" stroke-linecap="round"/>';
    else m = '<rect x="44" y="76" width="32" height="12" rx="3" fill="' + bg + '"/>';

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
      '<rect width="120" height="120" fill="' + bg + '"/>' +
      '<line x1="60" y1="14" x2="60" y2="28" stroke="' + terang + '" stroke-width="4"/>' +
      '<circle cx="60" cy="12" r="6" fill="' + terang + '"/>' +
      '<rect x="22" y="28" width="76" height="72" rx="16" fill="' + terang + '"/>' +
      '<circle cx="42" cy="56" r="' + mata + '" fill="' + bg + '"/>' +
      '<circle cx="78" cy="56" r="' + mata + '" fill="' + bg + '"/>' +
      m +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function normalize(url) {
    if (typeof url !== 'string') return url;
    const m = url.match(/^https?:\/\/api\.dicebear\.com\/[^?]*\?(?:[^#]*&)?seed=([^&#]+)/);
    if (!m) return url;
    let seed = m[1];
    try { seed = decodeURIComponent(seed); } catch (e) {}
    return robot(seed);
  }

  window.DefaultAvatar = { robot: robot, normalize: normalize };
})();
