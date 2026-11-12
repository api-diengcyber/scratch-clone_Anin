// ============================================================
// ABSEN PER SESI (portal Instruktur, menu "Rekap Absen")
//
// Tampilan:
//   Daftar Sesi        strip 7 hari + kartu statistik + kartu sesi yang bisa dibuka
//                      (siapa yang hadir / tidak hadir, cari siswa, follow-up lewat WhatsApp)
//   Visual Time Track  jalur waktu 7 hari: tiap sesi satu balok, warnanya mengikuti persentase hadir
//   Rekap Bulanan      rekap per siswa per bulan yang sudah ada (DCRekap.instruktur)
//
// MODE CONTOH (window.DC_REKAP_DEMO = true, sama seperti rekap-absen.js): tidak ada request ke server.
// Siswa, sesi, dan kehadiran diambil dari data percobaan DCRekap (50 siswa contoh), ditambah satu sesi
// yang sedang live hari ini dan dua sesi mendatang, jadi angkanya sama dengan tab Rekap Bulanan.
//
// ENDPOINT (nanti, hanya MEMBACA; server yang menghitung hadir/tidak hadir):
//   GET /api/instruktur/sesi?dari=YYYY-MM-DD&sampai=YYYY-MM-DD
//     -> { ok, total: <jumlah siswa>, sesi: [{ id, judul, tanggal, mulai, selesai, mentor, ruang,
//                                              hadir: [{ siswaId, nama, checkedInAt }],
//                                              tidakHadir: [{ siswaId, nama, whatsapp? }] }] }
//   GET /api/instruktur/sesi/ringkasan?bulan=YYYY-MM
//     -> { ok, rataRata, rataRataBulanLalu, perhatian: [{ siswaId, nama, hadir, total }] }
// Nomor WhatsApp BELUM dipakai: tombol Follow-up membuka WhatsApp dengan pesan siap kirim lalu
// instruktur memilih kontaknya sendiri (aman: tidak ada nomor yang tertebak/salah kirim).
// ============================================================
(function (root) {
  'use strict';
  if (root.DCSesi) return;

  const WIB = 7 * 36e5, TARGET = 70, GOOD = 80, LOW = 60;
  const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const BLN3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d) => Number(n).toLocaleString('id-ID', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const todayWib = () => new Date(Date.now() + WIB).toISOString().slice(0, 10);
  const parts = (ymd) => ymd.split('-').map(Number);
  const shift = (ymd, n) => { const [y, m, d] = parts(ymd); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const dow = (ymd) => { const [y, m, d] = parts(ymd); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const epoch = (ymd, hm) => { const [y, m, d] = parts(ymd), [h, mi] = hm.split(':').map(Number); return Date.UTC(y, m - 1, d, h, mi) - WIB; };
  const hmOf = (ms) => new Date(ms + WIB).toISOString().slice(11, 16);
  const ymdOf = (ms) => new Date(ms + WIB).toISOString().slice(0, 10);
  const minutes = (hm) => { const t = hm.split(':'); return +t[0] * 60 + +t[1]; };
  const addMonth = (ym, n) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5) - 1 + n, 1)).toISOString().slice(0, 7);
  const fmtDate = (ymd) => { const [y, m, d] = parts(ymd); return HARI[dow(ymd)] + ', ' + d + ' ' + BLN3[m - 1] + ' ' + y; };
  const initials = (n) => { const w = String(n).trim().split(/\s+/); return ((w[0] || '?')[0] + (w.length > 1 ? w[1][0] : '')).toUpperCase(); };
  const hash = (str) => { let h = 7; str = String(str); for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; };
  const level = (p) => (p == null ? 'na' : p > GOOD ? 'good' : p >= LOW ? 'mid' : 'low');
  const demoOn = () => !!root.DC_REKAP_DEMO;
  const weekOfMonth = (ymd) => { const [y, m, d] = parts(ymd); const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; return Math.ceil((d + first) / 7); };
  const waLink = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);

  // ---------- data contoh ----------
  let cache = null;
  function data() {
    const day = todayWib();
    if (cache && cache.day === day) return cache;
    const R = root.DCRekap;
    if (!R || !R._roster || !R._record) return null;
    const names = R._roster();
    const recs = names.map((n) => R._record(n, false));
    const att = {};
    const sessions = recs[0].map((s, i) => {
      const set = new Set();
      names.forEach((n, k) => { if (recs[k][i].hadir) set.add(n); });
      att[s.id] = set;
      return { id: s.id, judul: s.judul, tanggal: s.tanggal, mulai: s.mulai, selesai: s.selesai, s0: epoch(s.tanggal, s.mulai), s1: epoch(s.tanggal, s.selesai) };
    });
    const now = Date.now();
    // satu sesi yang sedang live sekarang, dan dua sesi mendatang
    const live0 = now - 30 * 6e4;
    sessions.push({ id: 'x-live', judul: 'Kelas Zoom: Game Pertamaku', tanggal: ymdOf(live0), mulai: hmOf(live0), selesai: hmOf(live0 + 90 * 6e4), s0: live0, s1: live0 + 90 * 6e4 });
    att['x-live'] = new Set(names.filter((n) => hash(n + 'live') % 100 < 82));
    [[1, '15:00', '16:30', 'Kelas Zoom: Percabangan'], [2, '10:00', '11:00', 'Tanya Jawab Coding']].forEach((x, i) => {
      const t = shift(day, x[0]);
      sessions.push({ id: 'x-next' + i, judul: x[3], tanggal: t, mulai: x[1], selesai: x[2], s0: epoch(t, x[1]), s1: epoch(t, x[2]) });
      att['x-next' + i] = new Set();
    });
    sessions.sort((a, b) => a.s0 - b.s0);
    sessions.forEach((s, i) => { s.mentor = 'Kak Mentor'; s.room = 'Zoom Room #0' + ((i % 3) + 1); s.att = att[s.id]; });
    cache = { day, names, sessions };
    return cache;
  }
  const statusOf = (s, now) => { now = now || Date.now(); return now < s.s0 ? 'next' : now <= s.s1 ? 'live' : 'done'; };
  const pctOf = (d, s) => (statusOf(s) === 'next' ? null : Math.round(s.att.size * 100 / d.names.length));

  function monthStats(d, ym) {
    const done = d.sessions.filter((s) => s.tanggal.slice(0, 7) === ym && statusOf(s) === 'done');
    const avg = done.length ? done.reduce((a, s) => a + s.att.size * 100 / d.names.length, 0) / done.length : null;
    const students = d.names.map((n) => {
      const h = done.filter((s) => s.att.has(n)).length;
      return { nama: n, hadir: h, total: done.length, pct: done.length ? Math.round(h * 100 / done.length) : null };
    });
    return { done: done.length, avg, low: students.filter((x) => x.pct != null && x.pct < LOW).sort((a, b) => a.pct - b.pct) };
  }

  // ---------- state ----------
  const S = { host: null, tab: 'daftar', start: null, sel: null, filter: 'all', open: new Set(), q: {}, modal: false, init: false };
  const resetWeek = () => { S.sel = todayWib(); S.start = shift(S.sel, -4); };
  const windowDays = () => Array.from({ length: 7 }, (_, i) => shift(S.start, i));
  const sessionsIn = (d, days) => d.sessions.filter((s) => days.includes(s.tanggal));

  // ---------- css ----------
  let cssDone = false;
  function injectCss() {
    if (cssDone) return; cssDone = true;
    const st = document.createElement('style'); st.id = 'dc-sesi-css';
    st.textContent = `
.sa{--acc:#4f46e5;--acc2:#4338ca;--acc-soft:#eef0ff;--tx:#1e2340;--mut:#6b7494;--bd:#e6e9f5;--bg:#fff;--soft:#f5f6fc;--good:#16a34a;--good-bg:#e8f8ef;--mid:#d97706;--mid-bg:#fff4d6;--low:#e11d48;--low-bg:#ffe9ed;--live:#2563eb;--live-bg:#e4eeff;color:var(--tx);font-family:inherit;display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.sa>*{min-width:0}
html.dark .sa{--acc:#818cf8;--acc2:#6366f1;--acc-soft:rgba(129,140,248,.14);--tx:#e8ebf7;--mut:#99a2c0;--bd:#2a3150;--bg:#141a2e;--soft:#1a2138;--good:#4ade80;--good-bg:rgba(74,222,128,.13);--mid:#fbbf24;--mid-bg:rgba(251,191,36,.14);--low:#fb7185;--low-bg:rgba(251,113,133,.14);--live:#60a5fa;--live-bg:rgba(96,165,250,.16)}
.sa *{box-sizing:border-box}.sa button,.sa input{font:inherit}.sa [hidden]{display:none!important}
.sa-card{background:var(--bg);border:1px solid var(--bd);border-radius:20px;padding:16px;box-shadow:0 4px 18px rgba(40,50,110,.06)}
.sa-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;margin-bottom:14px}
.sa-seg{display:inline-flex;gap:2px;padding:4px;background:var(--soft);border-radius:14px;max-width:100%;overflow-x:auto}
.sa-seg button{border:0;background:transparent;color:var(--mut);font-weight:700;font-size:13px;padding:8px 14px;border-radius:11px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.sa-seg button.on{background:var(--bg);color:var(--acc);box-shadow:0 1px 4px rgba(40,50,110,.12)}
.sa-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--mut)}.sa-legend span{display:inline-flex;align-items:center;gap:6px}
.sa-legend i{width:8px;height:8px;border-radius:50%}.sa-legend .g{background:var(--good)}.sa-legend .m{background:#f59e0b}.sa-legend .r{background:var(--low)}.sa-legend .b{background:var(--live)}
.sa-navr{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sa-month{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border:1px solid var(--bd);border-radius:12px;font-size:13px;font-weight:800}.sa-month i{color:var(--acc)}
.sa-month em{font-style:normal;font-weight:700;font-size:11px;padding:3px 9px;border-radius:8px;background:var(--acc-soft);color:var(--acc)}
.sa-pager{display:inline-flex;align-items:center;border:1px solid var(--bd);border-radius:12px;overflow:hidden}
.sa-pager button{border:0;background:transparent;color:var(--tx);cursor:pointer;height:34px;min-width:34px;padding:0 10px;font-weight:700;font-size:12px}.sa-pager button:hover{background:var(--soft)}
.sa-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}
.sa-day{border:1px solid var(--bd);background:var(--bg);color:var(--mut);border-radius:14px;padding:12px 4px 10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.sa-day small{font-size:11px;font-weight:700;letter-spacing:.04em}.sa-day b{font-size:19px;color:var(--tx);line-height:1.1}
.sa-day.has{background:var(--soft)}.sa-day.has b{color:var(--tx)}
.sa-day.today:not(.sel) small{color:var(--acc)}.sa-day.today:not(.sel) b{color:var(--acc)}
.sa-day.sel{background:linear-gradient(135deg,var(--acc),var(--acc2));border-color:transparent;color:#e0e3ff;box-shadow:0 8px 18px rgba(79,70,229,.32)}.sa-day.sel b{color:#fff}
.sa-dots{display:flex;align-items:center;justify-content:center;gap:3px;min-height:12px;font-size:10px;font-weight:700}
.sa-dots i{width:6px;height:6px;border-radius:50%;background:var(--bd)}.sa-dots i.good{background:#22c55e}.sa-dots i.mid{background:#f59e0b}.sa-dots i.low{background:#f43f5e}.sa-dots i.live{background:#3b82f6}.sa-dots i.next{background:#b6bdd8}
.sa-day.sel .sa-dots i{box-shadow:0 0 0 1.5px rgba(255,255,255,.7)}
.sa-day:focus-visible,.sa-seg button:focus-visible,.sa-pager button:focus-visible,.sa-chev:focus-visible,.sa-f button:focus-visible,.sa-tool:focus-visible,.sa-cp:focus-visible,.sa-wa:focus-visible,.sa-blk:focus-visible,.sa-link:focus-visible,.sa-q:focus-visible{outline:3px solid #2d8cff;outline-offset:2px}
.sa-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.sa-stat{background:var(--bg);border:1px solid var(--bd);border-radius:18px;padding:16px 18px;display:flex;flex-direction:column;gap:10px}
.sa-stat-t{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.sa-lbl{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
.sa-big{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-top:4px;font-size:30px;font-weight:800;line-height:1.1}.sa-big small{font-size:12px;font-weight:600;color:var(--mut)}
.sa-delta{font-size:11px;font-weight:700;padding:3px 8px;border-radius:8px;background:var(--good-bg);color:var(--good)}.sa-delta.down{background:var(--low-bg);color:var(--low)}
.sa-sico{flex:none;width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:17px;background:var(--acc-soft);color:var(--acc)}
.sa-sfoot{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:auto;padding-top:10px;border-top:1px solid var(--bd);font-size:12px;color:var(--mut)}
.sa-ok{color:var(--good);font-weight:700}.sa-warn{color:var(--mid);font-weight:700}.sa-sfoot b{color:var(--tx)}
.sa-stat.alert{background:var(--low-bg);border-color:rgba(225,29,72,.25)}.sa-stat.alert .sa-lbl{color:var(--low)}.sa-stat.alert .sa-sico{background:rgba(225,29,72,.14);color:var(--low)}.sa-stat.alert .sa-big{color:var(--low)}
.sa-link{border:0;background:transparent;color:var(--low);font-weight:800;font-size:12px;text-decoration:underline;cursor:pointer;padding:2px}
.sa-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.sa-f{display:inline-flex;gap:2px;padding:4px;background:var(--soft);border-radius:12px}.sa-f button{border:0;background:transparent;color:var(--mut);font-weight:700;font-size:12px;padding:7px 12px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.sa-f button.on{background:var(--bg);color:var(--tx);box-shadow:0 1px 3px rgba(40,50,110,.12)}.sa-f i{width:6px;height:6px;border-radius:50%;background:#22c55e}
.sa-tools{display:inline-flex;gap:8px}.sa-tool{border:1px solid var(--bd);background:var(--bg);color:var(--mut);font-weight:700;font-size:12px;padding:7px 12px;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}.sa-tool:hover{background:var(--soft)}
.sa-list{display:grid;gap:12px}
.sa-sess{background:var(--bg);border:1px solid var(--bd);border-radius:20px;overflow:hidden;box-shadow:0 2px 10px rgba(40,50,110,.04)}.sa-sess.open{border-color:rgba(79,70,229,.35);box-shadow:0 8px 24px rgba(40,50,110,.09)}
.sa-sh{display:flex;align-items:center;gap:14px;padding:16px 18px;cursor:pointer;flex-wrap:wrap}
.sa-ico{flex:none;width:44px;height:44px;border-radius:13px;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;display:flex;align-items:center;justify-content:center;font-size:17px}
.sa-info{flex:1;min-width:220px}.sa-info h3{margin:0;font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sa-meta{margin:6px 0 0;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--mut)}.sa-meta span{display:inline-flex;align-items:center;gap:6px}.sa-meta i{color:var(--acc);opacity:.75;font-size:11px}.sa-meta .room{color:var(--live);font-weight:600}.sa-meta .room i{color:var(--live)}
.sa-pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;display:inline-flex;align-items:center;gap:5px}
.sa-pill.done{background:var(--good-bg);color:var(--good)}.sa-pill.live{background:var(--live-bg);color:var(--live)}.sa-pill.next{background:var(--soft);color:var(--mut)}
.sa-pill.live:before{content:'';width:6px;height:6px;border-radius:50%;background:var(--live);animation:sa-pulse 1.4s ease-in-out infinite}
@keyframes sa-pulse{50%{opacity:.25}}@media(prefers-reduced-motion:reduce){.sa-pill.live:before{animation:none}}
.sa-att{min-width:190px;margin-left:auto}.sa-attn{font-size:12px;color:var(--mut);display:flex;align-items:center;gap:8px;justify-content:flex-end;white-space:nowrap}.sa-attn b{color:var(--tx);font-size:13px}
.sa-pct{font-weight:800;font-size:11px;padding:2px 8px;border-radius:7px}.sa-pct.good{background:var(--good-bg);color:var(--good)}.sa-pct.mid{background:var(--mid-bg);color:var(--mid)}.sa-pct.low{background:var(--low-bg);color:var(--low)}
.sa-prog{display:flex;height:7px;border-radius:99px;overflow:hidden;background:var(--bd);margin-top:8px}.sa-prog .y{background:#22c55e}.sa-prog .n{background:#fb7185}.sa-prog.live .y{background:#3b82f6}
.sa-na{font-size:12px;color:var(--mut)}
.sa-chev{flex:none;width:34px;height:34px;border:0;border-radius:50%;background:var(--soft);color:var(--mut);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s}.sa-sess.open .sa-chev{transform:rotate(180deg)}
.sa-sb{padding:0 18px 18px;border-top:1px solid var(--bd);margin-top:0}
.sa-bt{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;padding:14px 0}
.sa-q{flex:1;min-width:200px;max-width:340px;padding:9px 12px 9px 34px;border:1px solid var(--bd);border-radius:11px;background:var(--bg) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' stroke='%239aa3c4' stroke-width='2' viewBox='0 0 24 24'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E") no-repeat 11px center;color:var(--tx);font-size:13px}
.sa-btr{display:inline-flex;gap:8px;align-items:center}
.sa-wa{display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:11px;border:1px solid rgba(225,29,72,.3);background:var(--low-bg);color:var(--low);font-weight:700;font-size:12px;text-decoration:none;white-space:nowrap}.sa-wa:hover{filter:brightness(.97)}
.sa-wa.ok{border-color:rgba(22,163,74,.3);background:var(--good-bg);color:var(--good);cursor:default}
.sa-cp{width:36px;height:34px;border:1px solid var(--bd);background:var(--bg);color:var(--mut);border-radius:10px;cursor:pointer}
.sa-cols{display:grid;grid-template-columns:1fr 1.25fr;gap:14px}
.sa-col{border-radius:16px;padding:14px;border:1px solid}.sa-col.no{background:var(--low-bg);border-color:rgba(225,29,72,.22)}.sa-col.yes{background:var(--good-bg);border-color:rgba(22,163,74,.25)}
.sa-ch{display:flex;justify-content:space-between;align-items:center;gap:8px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid rgba(120,130,170,.2);font-size:13px;font-weight:800}
.sa-ch span{display:inline-flex;align-items:center;gap:8px}.sa-ch i{width:30px;height:30px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;font-size:13px}
.sa-col.no .sa-ch{color:var(--low)}.sa-col.no .sa-ch i{background:rgba(225,29,72,.14)}.sa-col.yes .sa-ch{color:var(--good)}.sa-col.yes .sa-ch i{background:rgba(22,163,74,.16)}
.sa-ch small{font-size:11px;font-weight:600;color:var(--mut)}
.sa-rows{display:grid;gap:8px;max-height:330px;overflow-y:auto;padding-right:4px}.sa-col.yes .sa-rows{grid-template-columns:repeat(2,minmax(0,1fr))}
.sa-row{display:flex;align-items:center;gap:9px;padding:8px 10px;background:var(--bg);border:1px solid var(--bd);border-radius:12px;font-size:13px;min-width:0}
.sa-av{flex:none;width:30px;height:30px;border-radius:9px;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center}.no .sa-av{background:var(--low-bg);color:var(--low)}.yes .sa-av{background:var(--good-bg);color:var(--good)}
.sa-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.sa-ck{color:var(--good);font-size:11px}
.sa-fu{flex:none;display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:4px 9px;border-radius:9px;border:1px solid rgba(225,29,72,.3);background:var(--low-bg);color:var(--low);text-decoration:none}
.sa-empty{padding:22px 10px;text-align:center;font-size:13px;color:var(--mut)}
.sa-note{margin:0;font-size:12px;color:#a86a00}
.sa-track{overflow-x:auto}.sa-tr{min-width:680px}
.sa-axis,.sa-trow{display:grid;grid-template-columns:70px 1fr;align-items:center}
.sa-axis{margin-bottom:6px;font-size:11px;color:var(--mut)}.sa-axis div{position:relative;height:16px}.sa-axis span{position:absolute;transform:translateX(-50%)}
.sa-trow{padding:5px 0;border-top:1px dashed var(--bd)}.sa-trow>b{font-size:12px;font-weight:800}.sa-trow>b small{display:block;font-size:10px;color:var(--mut);font-weight:700}.sa-trow.sel>b{color:var(--acc)}
.sa-lane{position:relative;height:46px;border-radius:10px;background:repeating-linear-gradient(90deg,transparent 0,transparent calc(var(--hw) - 1px),var(--bd) calc(var(--hw) - 1px),var(--bd) var(--hw))}
.sa-blk{position:absolute;top:4px;bottom:4px;border:0;border-radius:10px;padding:0 9px;display:flex;flex-direction:column;justify-content:center;gap:1px;color:#fff;font-size:11px;font-weight:700;text-align:left;cursor:pointer;overflow:hidden;white-space:nowrap}
.sa-blk b{font-weight:800}.sa-blk small{font-size:10px;font-weight:600;opacity:.92}
.sa-blk.good{background:#22c55e}.sa-blk.mid{background:#f59e0b}.sa-blk.low{background:#f43f5e}.sa-blk.live{background:#3b82f6}.sa-blk.next{background:var(--soft);color:var(--mut);border:1.5px dashed var(--bd)}
.sa-modalbg{position:fixed;inset:0;z-index:80;background:rgba(15,20,45,.5);display:flex;align-items:center;justify-content:center;padding:16px}
.sa-modal{background:var(--bg);color:var(--tx);border-radius:20px;width:100%;max-width:520px;max-height:84vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.sa-mh{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 20px 10px}.sa-mh h3{margin:0;font-size:16px;font-weight:800}.sa-mh p{margin:4px 0 0;font-size:12px;color:var(--mut)}
.sa-mx{flex:none;width:34px;height:34px;border:0;border-radius:50%;background:var(--soft);color:var(--mut);cursor:pointer}.sa-mx:focus-visible{outline:3px solid #2d8cff;outline-offset:2px}
.sa-mb{padding:6px 20px 20px;overflow-y:auto;display:grid;gap:8px}
.sa-mrow{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--bd);border-radius:12px;font-size:13px}.sa-mrow .sa-nm{font-weight:700}.sa-mrow small{display:block;font-size:11px;color:var(--mut);font-weight:500}
.sa-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media(max-width:900px){.sa-stats{grid-template-columns:1fr}.sa-cols{grid-template-columns:1fr}.sa-att{margin-left:0;width:100%}.sa-attn{justify-content:flex-start}.sa-navr{margin-left:0}}
@media(max-width:560px){.sa-seg{display:flex;width:100%}.sa-seg button{flex:1;justify-content:center;padding:8px 6px;font-size:12px}.sa-seg button i{display:none}.sa-week{gap:5px}.sa-day{padding:9px 2px 8px}.sa-day b{font-size:16px}.sa-col.yes .sa-rows{grid-template-columns:1fr}.sa-q{max-width:none}}`;
    document.head.appendChild(st);
  }

  // ---------- potongan tampilan ----------
  function pill(st) { return st === 'live' ? '<span class="sa-pill live">Sedang Live</span>' : st === 'done' ? '<span class="sa-pill done"><i class="fa-solid fa-check"></i>Selesai</span>' : '<span class="sa-pill next">Terjadwal</span>'; }

  function headerHtml(d, days) {
    const seg = [['daftar', 'fa-list-check', 'Daftar Sesi'], ['track', 'fa-diagram-project', 'Visual Time Track'], ['rekap', 'fa-chart-column', 'Rekap Bulanan']]
      .map((t) => `<button type="button" role="tab" data-sa-tab="${t[0]}" aria-selected="${S.tab === t[0]}" class="${S.tab === t[0] ? 'on' : ''}"><i class="fa-solid ${t[1]}" aria-hidden="true"></i>${t[2]}</button>`).join('');
    if (S.tab === 'rekap') return `<section class="sa-card"><div class="sa-toolbar" style="margin:0"><div class="sa-seg" role="tablist" aria-label="Tampilan absen">${seg}</div></div></section>`;
    const [y, m] = parts(S.sel), strip = days.map((day) => {
      const list = d ? d.sessions.filter((s) => s.tanggal === day) : [];
      const dots = list.slice(0, 3).map((s) => { const st = statusOf(s); return `<i class="${st === 'done' ? level(pctOf(d, s)) : st}"></i>`; }).join('');
      const cl = 'sa-day' + (list.length ? ' has' : '') + (day === S.sel ? ' sel' : '') + (day === todayWib() ? ' today' : '');
      return `<button type="button" class="${cl}" data-sa-day="${day}" aria-pressed="${day === S.sel}" aria-label="${esc(fmtDate(day))}, ${list.length} sesi"><small>${HARI[dow(day)].toUpperCase()}</small><b>${parts(day)[2]}</b><span class="sa-dots">${dots}${list.length ? '<span>(' + list.length + ')</span>' : ''}</span></button>`;
    }).join('');
    return `<section class="sa-card"><div class="sa-toolbar"><div class="sa-seg" role="tablist" aria-label="Tampilan absen">${seg}</div>
      <div class="sa-legend"><span><i class="g"></i>Presensi Baik (&gt;80%)</span><span><i class="m"></i>Cukup</span><span><i class="r"></i>Kurang (&lt;60%)</span><span><i class="b"></i>Sesi Live</span></div>
      <div class="sa-navr"><span class="sa-month"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i>${BLN[m - 1]} ${y}<em>Minggu ke-${weekOfMonth(S.sel)}</em></span>
        <div class="sa-pager"><button type="button" data-sa-wk="-1" aria-label="Minggu sebelumnya"><i class="fa-solid fa-chevron-left"></i></button><button type="button" data-sa-today>Hari Ini</button><button type="button" data-sa-wk="1" aria-label="Minggu berikutnya"><i class="fa-solid fa-chevron-right"></i></button></div></div></div>
      <div class="sa-week">${strip}</div></section>`;
  }

  function statsHtml(d, inWin) {
    const ym = S.sel.slice(0, 7), cur = monthStats(d, ym), prev = monthStats(d, addMonth(ym, -1));
    const inMonth = d.sessions.filter((s) => s.tanggal.slice(0, 7) === ym);
    const live = inMonth.filter((s) => statusOf(s) === 'live').length;
    const delta = cur.avg != null && prev.avg != null ? cur.avg - prev.avg : null;
    const above = cur.avg != null && cur.avg >= TARGET;
    return `<div class="sa-stats">
      <div class="sa-stat"><div class="sa-stat-t"><div><div class="sa-lbl">Rata-rata kehadiran sesi</div><div class="sa-big">${cur.avg == null ? '–' : num(cur.avg, 1) + '%'}${delta == null ? '' : `<span class="sa-delta${delta < 0 ? ' down' : ''}"><i class="fa-solid ${delta < 0 ? 'fa-arrow-trend-down' : 'fa-arrow-trend-up'}"></i> ${delta < 0 ? '' : '+'}${num(delta, 1)}%</span>`}</div></div><div class="sa-sico"><i class="fa-solid fa-chart-pie" aria-hidden="true"></i></div></div>
        <div class="sa-sfoot"><span>Target kehadiran minimal: ${TARGET}%</span>${cur.avg == null ? '' : above ? '<span class="sa-ok"><i class="fa-solid fa-circle-check"></i> Di Atas Target</span>' : '<span class="sa-warn"><i class="fa-solid fa-triangle-exclamation"></i> Di Bawah Target</span>'}</div></div>
      <div class="sa-stat"><div class="sa-stat-t"><div><div class="sa-lbl">Total sesi bulan ini</div><div class="sa-big">${inMonth.length} Sesi<small>(${inWin.length} aktif ditampilkan)</small></div></div><div class="sa-sico"><i class="fa-solid fa-video" aria-hidden="true"></i></div></div>
        <div class="sa-sfoot"><span>Telah Selesai: <b>${cur.done}</b></span><span class="${live ? 'sa-warn' : ''}">${live} Berlangsung</span></div></div>
      <div class="sa-stat alert"><div class="sa-stat-t"><div><div class="sa-lbl">&#9679; Siswa perlu perhatian</div><div class="sa-big">${cur.low.length}<small style="color:var(--low)">siswa sering absen (&lt; ${LOW}%)</small></div></div><div class="sa-sico"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div></div>
        <div class="sa-sfoot"><span>Prioritas follow-up mentor</span><button type="button" class="sa-link" data-sa-modal="open">Lihat daftar <i class="fa-solid fa-arrow-right-long"></i></button></div></div></div>`;
  }

  function listsHtml(d, s) {
    const q = (S.q[s.id] || '').trim().toLowerCase(), st = statusOf(s);
    const names = d.names.filter((n) => !q || n.toLowerCase().includes(q));
    const no = names.filter((n) => !s.att.has(n)), yes = names.filter((n) => s.att.has(n));
    const fu = (n) => waLink(`Halo ${n}, kakak lihat kamu belum hadir di sesi "${s.judul}" (${fmtDate(s.tanggal)}, ${s.mulai} WIB). Ada kendala? Kabari kakak ya, nanti kita bantu kejar materinya. Semangat! 💪`);
    return `<div class="sa-col no"><div class="sa-ch"><span><i class="fa-solid fa-user-xmark" aria-hidden="true"></i>${st === 'live' ? 'Belum Hadir' : 'Tidak Hadir'} (${no.length})</span><small>Perlu Penanganan</small></div>
        <div class="sa-rows">${no.length ? no.map((n) => `<div class="sa-row"><span class="sa-av">${esc(initials(n))}</span><span class="sa-nm" title="${esc(n)}">${esc(n)}</span><a class="sa-fu" href="${esc(fu(n))}" target="_blank" rel="noopener noreferrer" aria-label="Follow-up ${esc(n)} lewat WhatsApp"><i class="fa-brands fa-whatsapp"></i>Follow-up</a></div>`).join('') : '<div class="sa-empty">Tidak ada.</div>'}</div></div>
      <div class="sa-col yes"><div class="sa-ch"><span><i class="fa-solid fa-user-check" aria-hidden="true"></i>Hadir (${yes.length})</span><small>Terverifikasi Zoom</small></div>
        <div class="sa-rows">${yes.length ? yes.map((n) => `<div class="sa-row"><span class="sa-av">${esc(initials(n))}</span><span class="sa-nm" title="${esc(n)}">${esc(n)}</span><i class="fa-solid fa-check sa-ck" aria-label="hadir"></i></div>`).join('') : '<div class="sa-empty">Tidak ada.</div>'}</div></div>`;
  }

  function bodyHtml(d, s) {
    const st = statusOf(s);
    if (st === 'next') return `<div class="sa-empty">Sesi belum dimulai. Siswa bisa absen lewat halaman Jadwal Saya mulai 15 menit sebelum kelas.</div>`;
    const absent = d.names.filter((n) => !s.att.has(n)).length;
    const msg = st === 'live' ? `Sesi Zoom mentoring "${s.judul}" sedang berlangsung sekarang (${s.room}). Yuk segera gabung ya!` : `Pengingat: sesi Zoom mentoring "${s.judul}" (${fmtDate(s.tanggal)}, ${s.mulai} WIB). Yang belum hadir, silakan hubungi mentor untuk mengejar materi. Terima kasih!`;
    return `<div class="sa-bt"><input type="search" class="sa-q" data-sa-q="${esc(s.id)}" value="${esc(S.q[s.id] || '')}" placeholder="Cari siswa di sesi ini..." aria-label="Cari siswa di sesi ${esc(s.judul)}" autocomplete="off">
        <div class="sa-btr">${absent ? `<a class="sa-wa" href="${esc(waLink(msg))}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i>Ingatkan ${absent} Siswa Absen</a><button type="button" class="sa-cp" data-sa-copy="${esc(s.id)}" title="Salin daftar siswa yang absen" aria-label="Salin daftar siswa yang absen"><i class="fa-regular fa-copy"></i></button>` : '<span class="sa-wa ok"><i class="fa-solid fa-circle-check"></i>Semua siswa hadir</span>'}</div></div>
      <div class="sa-cols" data-sa-lists="${esc(s.id)}">${listsHtml(d, s)}</div>`;
  }

  function cardHtml(d, s) {
    const st = statusOf(s), open = S.open.has(s.id), total = d.names.length, h = s.att.size, p = pctOf(d, s);
    const att = st === 'next' ? '<span class="sa-na">Belum dimulai</span>'
      : `<div class="sa-attn">${st === 'live' ? 'Hadir sejauh ini:' : 'Kehadiran:'} <b>${h}</b> / ${total} Siswa <span class="sa-pct ${level(p)}">${p}%</span></div><div class="sa-prog${st === 'live' ? ' live' : ''}" role="img" aria-label="${h} dari ${total} siswa hadir"><i class="y" style="width:${h * 100 / total}%"></i><i class="n" style="width:${(total - h) * 100 / total}%"></i></div>`;
    return `<article class="sa-sess${open ? ' open' : ''}" data-sid="${esc(s.id)}">
      <div class="sa-sh" data-sa-t="${esc(s.id)}"><div class="sa-ico" aria-hidden="true"><i class="fa-solid fa-chalkboard-user"></i></div>
        <div class="sa-info"><h3>${esc(s.judul)} ${pill(st)}</h3><p class="sa-meta"><span><i class="fa-solid fa-user-tie"></i>${esc(s.mentor)}</span><span><i class="fa-regular fa-calendar"></i>${esc(fmtDate(s.tanggal))}</span><span><i class="fa-regular fa-clock"></i>${s.mulai} - ${s.selesai} WIB</span><span class="room"><i class="fa-solid fa-video"></i>${esc(s.room)}</span></p></div>
        <div class="sa-att">${att}</div>
        <button type="button" class="sa-chev" data-sa-t="${esc(s.id)}" aria-expanded="${open}" aria-label="${open ? 'Tutup' : 'Buka'} detail ${esc(s.judul)}"><i class="fa-solid fa-chevron-down"></i></button></div>
      <div class="sa-sb"${open ? '' : ' hidden'} data-sa-body="${esc(s.id)}" ${open ? 'data-f="1"' : ''}>${open ? bodyHtml(d, s) : ''}</div></article>`;
  }

  function daftarHtml(d, inWin) {
    const counts = { all: inWin.length, done: inWin.filter((s) => statusOf(s) === 'done').length, live: inWin.filter((s) => statusOf(s) === 'live').length };
    const list = inWin.filter((s) => S.filter === 'all' || statusOf(s) === S.filter);
    const f = (k, label, dot) => `<button type="button" data-sa-f="${k}" class="${S.filter === k ? 'on' : ''}" aria-pressed="${S.filter === k}">${dot ? '<i></i>' : ''}${label} (${counts[k]})</button>`;
    return statsHtml(d, inWin) + `<div class="sa-bar"><div class="sa-f" role="group" aria-label="Filter sesi">${f('all', 'Semua Sesi')}${f('done', 'Selesai')}${f('live', 'Sedang Live', true)}</div>
      <div class="sa-tools"><button type="button" class="sa-tool" data-sa-all="open"><i class="fa-solid fa-angles-down"></i>Buka Semua</button><button type="button" class="sa-tool" data-sa-all="close"><i class="fa-solid fa-angles-up"></i>Tutup Semua</button></div></div>
      <div class="sa-list">${list.length ? list.map((s) => cardHtml(d, s)).join('') : '<div class="sa-card sa-empty">Tidak ada sesi pada pekan ini dengan filter tersebut.</div>'}</div>`;
  }

  function trackHtml(d, days, inWin) {
    let lo = 8, hi = 18;
    inWin.forEach((s) => { lo = Math.min(lo, Math.floor(minutes(hmOf(s.s0)) / 60)); hi = Math.max(hi, Math.ceil(minutes(hmOf(s.s1)) / 60)); });
    const span = (hi - lo) * 60, hw = 100 / (hi - lo);
    const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => `<span style="left:${i * hw}%">${('0' + (lo + i)).slice(-2)}:00</span>`).join('');
    const rows = days.map((day) => {
      const blks = d.sessions.filter((s) => s.tanggal === day).map((s) => {
        const st = statusOf(s), p = pctOf(d, s), a = minutes(hmOf(s.s0)), b = minutes(hmOf(s.s1));
        const left = Math.max(0, (a - lo * 60) / span * 100), width = Math.max(4, Math.min(100 - left, (b - a) / span * 100));
        const c = st === 'done' ? level(p) : st;
        return `<button type="button" class="sa-blk ${c}" style="left:${left}%;width:${width}%" data-sa-go="${esc(s.id)}" title="${esc(s.judul)} · ${s.mulai}-${s.selesai} WIB"><b>${s.mulai} ${esc(s.judul)}</b><small>${st === 'next' ? 'Terjadwal' : s.att.size + '/' + d.names.length + ' hadir (' + p + '%)'}</small></button>`;
      }).join('');
      return `<div class="sa-trow${day === S.sel ? ' sel' : ''}"><b>${HARI[dow(day)].toUpperCase()} ${parts(day)[2]}<small>${BLN3[parts(day)[1] - 1]}</small></b><div class="sa-lane" style="--hw:${hw}%">${blks}</div></div>`;
    }).join('');
    return `<section class="sa-card sa-track"><div class="sa-tr"><div class="sa-axis"><span></span><div>${ticks}</div></div>${rows}</div>${inWin.length ? '' : '<div class="sa-empty">Tidak ada sesi pada pekan ini.</div>'}</section>`;
  }

  function modalHtml(d) {
    const ym = S.sel.slice(0, 7), cur = monthStats(d, ym);
    const rows = cur.low.map((x) => `<div class="sa-mrow"><span class="sa-av" style="background:var(--low-bg);color:var(--low)">${esc(initials(x.nama))}</span><span class="sa-nm"><span>${esc(x.nama)}</span><small>Hadir ${x.hadir} dari ${x.total} sesi bulan ini</small></span><span class="sa-pct low">${x.pct}%</span><a class="sa-fu" href="${esc(waLink(`Halo ${x.nama}, kakak lihat kehadiranmu di sesi mentoring bulan ini baru ${x.pct}%. Ada kendala? Kabari kakak ya, kita cari solusinya bareng. Semangat! 💪`))}" target="_blank" rel="noopener noreferrer" aria-label="Follow-up ${esc(x.nama)} lewat WhatsApp"><i class="fa-brands fa-whatsapp"></i>Follow-up</a></div>`).join('');
    return `<div class="sa-modalbg" data-sa-modal="bg"><div class="sa-modal" role="dialog" aria-modal="true" aria-labelledby="saMt"><div class="sa-mh"><div><h3 id="saMt">Siswa perlu perhatian</h3><p>Kehadiran di bawah ${LOW}% pada sesi selesai bulan ${BLN[parts(S.sel)[1] - 1]} ${parts(S.sel)[0]}.</p></div><button type="button" class="sa-mx" data-sa-modal="close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="sa-mb">${rows || '<div class="sa-empty">Tidak ada siswa di bawah batas. 🎉</div>'}</div></div></div>`;
  }

  // ---------- render ----------
  function render(afterFocus) {
    const host = S.host; if (!host) return;
    injectCss();
    const d = demoOn() ? data() : null;
    let html = '<div class="sa" data-tab="' + S.tab + '">';
    if (S.tab === 'rekap') {
      html += headerHtml(d, []) + '<div data-sa-rekap></div>';
    } else if (!d) {
      html += headerHtml(null, windowDays()) + `<div class="sa-card sa-empty">${demoOn() ? 'Modul rekap belum termuat.' : 'Data sesi belum terhubung ke server.'}</div>`;
    } else {
      const days = windowDays(), inWin = sessionsIn(d, days);
      html += headerHtml(d, days) + (S.tab === 'track' ? trackHtml(d, days, inWin) : daftarHtml(d, inWin));
      html += `<p class="sa-note">Mode contoh: ini data percobaan (${d.names.length} siswa contoh), belum terhubung ke server.</p>`;
      if (S.modal) html += modalHtml(d);
    }
    html += '<div class="sa-live" role="status" aria-live="polite"></div></div>';
    host.innerHTML = html;
    if (S.tab === 'rekap' && root.DCRekap) root.DCRekap.instruktur(host.querySelector('[data-sa-rekap]'));
    if (S.modal) { const x = host.querySelector('.sa-mx'); if (x) x.focus(); }
    if (afterFocus) afterFocus();
  }

  function say(msg) { const el = S.host && S.host.querySelector('.sa-live'); if (el) el.textContent = msg; }
  function find(id) { const d = data(); return d && d.sessions.find((s) => s.id === id); }
  function cardEl(id) { return S.host && Array.from(S.host.querySelectorAll('.sa-sess')).find((a) => a.dataset.sid === id); }

  function setOpen(id, open) {
    const art = cardEl(id), d = data(), s = find(id); if (!art || !d || !s) return;
    open ? S.open.add(id) : S.open.delete(id);
    art.classList.toggle('open', open);
    const body = art.querySelector('.sa-sb'), chev = art.querySelector('.sa-chev');
    body.hidden = !open; chev.setAttribute('aria-expanded', String(open));
    if (open && !body.dataset.f) { body.innerHTML = bodyHtml(d, s); body.dataset.f = '1'; }
  }

  function copyAbsent(id, btn) {
    const d = data(), s = find(id); if (!d || !s) return;
    const text = 'Siswa tidak hadir - ' + s.judul + ' (' + fmtDate(s.tanggal) + ')\n' + d.names.filter((n) => !s.att.has(n)).map((n, i) => (i + 1) + '. ' + n).join('\n');
    const ok = () => { say('Daftar siswa yang absen disalin.'); const ic = btn.querySelector('i'); ic.className = 'fa-solid fa-check'; setTimeout(() => { ic.className = 'fa-regular fa-copy'; }, 1600); };
    const fallback = () => { const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (e) { say('Tidak bisa menyalin otomatis.'); } t.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  }

  function bind(host) {
    if (host.__sa) return; host.__sa = true;
    host.addEventListener('click', (e) => {
      const t = e.target, g = (sel) => t.closest(sel);
      let b;
      if ((b = g('[data-sa-tab]'))) { S.tab = b.dataset.saTab; S.modal = false; return render(); }
      if ((b = g('[data-sa-wk]'))) { const n = +b.dataset.saWk * 7; S.start = shift(S.start, n); S.sel = shift(S.sel, n); return render(); }
      if (g('[data-sa-today]')) { resetWeek(); return render(); }
      if ((b = g('[data-sa-day]'))) {
        S.sel = b.dataset.saDay; const d = data(), first = d && d.sessions.find((s) => s.tanggal === S.sel);
        if (first && S.tab === 'daftar') { S.filter = 'all'; S.open.add(first.id); }
        return render(() => { const a = first && S.tab === 'daftar' && cardEl(first.id); if (a) a.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
      }
      if ((b = g('[data-sa-f]'))) { S.filter = b.dataset.saF; return render(); }
      if ((b = g('[data-sa-all]'))) {
        const d = data(); if (!d) return;
        const open = b.dataset.saAll === 'open';
        host.querySelectorAll('.sa-sess').forEach((a) => setOpen(a.dataset.sid, open));
        return;
      }
      if ((b = g('[data-sa-copy]'))) return copyAbsent(b.dataset.saCopy, b);
      if ((b = g('[data-sa-go]'))) { const id = b.dataset.saGo; S.tab = 'daftar'; S.filter = 'all'; S.open.add(id); return render(() => { const a = cardEl(id); if (a) a.scrollIntoView({ block: 'start' }); }); }
      if ((b = g('[data-sa-modal]'))) {
        const k = b.dataset.saModal;
        if (k === 'open') { S.modal = true; return render(); }
        if (k === 'close' || (k === 'bg' && t === b)) { S.modal = false; return render(() => { const l = host.querySelector('[data-sa-modal="open"]'); if (l) l.focus(); }); }
        return;
      }
      if ((b = g('[data-sa-t]'))) {
        if (t.closest('a,input,.sa-bt,.sa-cols')) return;
        const id = b.dataset.saT; return setOpen(id, !S.open.has(id));
      }
    });
    host.addEventListener('input', (e) => {
      const el = e.target; if (!el.matches || !el.matches('[data-sa-q]')) return;
      const id = el.dataset.saQ, d = data(), s = find(id); if (!d || !s) return;
      S.q[id] = el.value;
      const box = Array.from(host.querySelectorAll('[data-sa-lists]')).find((x) => x.dataset.saLists === id);
      if (box) box.innerHTML = listsHtml(d, s);
    });
    host.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.modal) { S.modal = false; render(() => { const l = host.querySelector('[data-sa-modal="open"]'); if (l) l.focus(); }); } });
  }

  function mount(host) {
    if (typeof host === 'string') host = document.querySelector(host);
    if (!host) return;
    S.host = host; bind(host);
    if (!S.init) {
      S.init = true; resetWeek();
      const d = demoOn() ? data() : null;
      if (d) {
        const inWin = sessionsIn(d, windowDays());
        const pick = inWin.find((s) => statusOf(s) === 'live') || inWin.filter((s) => statusOf(s) === 'done').pop();
        if (pick) S.open.add(pick.id);
      }
    }
    render();
  }

  root.DCSesi = { mount: mount, _state: S };
})(window);
