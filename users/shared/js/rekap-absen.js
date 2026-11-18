// ============================================================
// REKAP ABSEN MENTORING (Zoom): satu modul untuk 4 tempat
//
//   Siswa      -> Laporan Saya            DCRekap.mount(el, { nama, audience: "siswa" })
//   Orang tua  -> Perkembangan Anak       DCRekap.mount(el, { nama, audience: "ortu", token })
//   Instruktur -> menu "Rekap Absen"      DCRekap.instruktur(el)
//   Admin      -> Siswa (tab Kehadiran)   DCRekap.html(nama, { audience: "admin", studentId })
//
// TAMPILAN: selalu per bulan (navigasi ‹ ›, atau klik batang di deret 12 bulan), jadi daftar tidak
// memanjang walau sesinya sudah setahun. Di atasnya ada ringkasan keseluruhan.
// Instruktur: pencarian + "hanya yang perlu perhatian" + urut + "Tampilkan lagi" (10 per tampilan),
// jadi tetap ringkas walau siswanya 50 atau lebih.
//
// SUMBER DATA (semua hanya MEMBACA):
//   Siswa      GET /api/attendance/report?bulan=YYYY-MM
//   Orang tua  GET /api/reports/:token/attendance?bulan=YYYY-MM
//   Instruktur GET /api/instruktur/attendance?bulan=YYYY-MM&page=&limit=
//   Admin      GET /api/admin/users/:id/attendance?bulan=YYYY-MM
//   Server yang menghitung hadir/tidak hadir; browser hanya menampilkan.
//
// MODE DEMO (tanpa backend): set window.DC_REKAP_DEMO = true SEBELUM file ini dimuat.
// Semua data di bawah jadi data percobaan yang dibuat di browser, tanpa request ke server.
//
// File ini ada 3 salinan sama persis: users/shared/js, Admin/static, Instruktur/static
// (karena tiap aplikasi punya folder statisnya sendiri). Kalau diubah, ubah ketiganya.
// ============================================================
(function (root) {
  "use strict";
  if (root.DCRekap) return;

  var WIB_MS = 7 * 36e5;
  var HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  var BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  var BLN_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  var LOW = 60, PAGE = 10;   // di bawah LOW% = "perlu perhatian"; 10 siswa per tampilan

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad2(n) { return ("0" + n).slice(-2); }
  function todayWib() { return new Date(Date.now() + WIB_MS).toISOString().slice(0, 10); }
  function shift(ymd, n) { var p = ymd.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); }
  function fmtDate(ymd) { var p = ymd.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return HARI[d.getUTCDay()] + ", " + (+p[2]) + " " + BLN[+p[1] - 1]; }
  function addMin(hm, n) { var t = hm.split(":"), m = Math.max(0, (+t[0]) * 60 + (+t[1]) + n); return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); }
  function addMonth(ym, n) { return new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5) - 1 + n, 1)).toISOString().slice(0, 7); }
  function monthLabel(ym) { return BLN_FULL[+ym.slice(5) - 1] + " " + ym.slice(0, 4); }
  function hash(str) { var h = 7; str = String(str); for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
  function demo() { return !!root.DC_REKAP_DEMO; }
  function pctOf(h, n) { return n ? Math.round(h * 100 / n) : null; }
  function hhmmWib(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var w = new Date(d.getTime() + WIB_MS);
    return pad2(w.getUTCHours()) + ":" + pad2(w.getUTCMinutes());
  }

  // ---------- akses server ----------
  function authToken() { try { return root.localStorage.getItem("authToken") || ""; } catch (_) { return ""; } }
  function request(url, auth) {
    if (root.DCAdminApi && root.DCAdminApi.request) return root.DCAdminApi.request(url);
    var headers = { Accept: "application/json" };
    if (auth) headers.Authorization = "Bearer " + auth;
    return fetch(url, { headers: headers, cache: "no-store" }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (body) {
        if (!res.ok || !body || body.ok === false) {
          var err = new Error((body && body.message) || ("HTTP " + res.status));
          err.status = res.status;
          err.code = body && body.code;
          throw err;
        }
        return body;
      });
    });
  }
  function errorText(err) {
    if (err && (err.status === 404 || err.code === "REPORT_NOT_FOUND")) return "Tautan laporan tidak ditemukan atau sudah kedaluwarsa.";
    if (err && err.status === 401) return "Sesi berakhir. Silakan masuk lagi.";
    if (err && err.status === 403) return "Akun ini tidak punya akses ke rekap kehadiran.";
    return "Data kehadiran belum bisa dimuat dari server. Coba muat ulang halaman.";
  }
  function sessDto(s) {
    return { tanggal: s.tanggal, mulai: s.mulai, selesai: s.selesai, judul: s.judul, hadir: !!s.hadir, at: s.checkedInAt ? hhmmWib(s.checkedInAt) : "" };
  }
  function targetFor(e) {
    var who = e.opt.audience || "siswa";
    if (e.kind === "instr") return { url: "/api/instruktur/attendance", auth: "", instr: true };
    if (who === "siswa") {
      var t = authToken();
      return t ? { url: "/api/attendance/report", auth: t } : null;
    }
    if (who === "ortu") {
      return e.opt.token ? { url: "/api/reports/" + encodeURIComponent(e.opt.token) + "/attendance", auth: "" } : null;
    }
    if (who === "admin") {
      return e.opt.studentId ? { url: "/api/admin/users/" + encodeURIComponent(e.opt.studentId) + "/attendance", auth: "" } : null;
    }
    return null;
  }
  function fetchInstructor(ym) {
    var base = "/api/instruktur/attendance?bulan=" + encodeURIComponent(ym) + "&limit=100&urut=rendah&page=";
    function page(n, acc) {
      return request(base + n, "").then(function (body) {
        if (n === 1) acc = body;
        else {
          acc.items = (acc.items || []).concat(body.items || []);
          acc.total = body.total;
          acc.pages = body.pages;
        }
        return (n < (body.pages || 1) && n < 10) ? page(n + 1, acc) : acc;
      });
    }
    return page(1, null);
  }

  // ---------- data contoh ----------
  // Sesi 12 bulan terakhir (sekitar 90 sesi); 5 sesi paling baru sama dengan data contoh di halaman Jadwal Saya.
  var TITLES = ["Kelas Zoom: Mengenal Sprite", "Tanya Jawab Coding", "Kelas Zoom: Gerak Karakter", "Konsultasi Projek Akhir", "Kelas Zoom: Suara dan Musik", "Kelas Zoom: Percabangan", "Kelas Zoom: Kloning Sprite", "Kelas Zoom: Animasi Karakter"];
  var RECENT = [[-5, "15:00", "16:30", "Kelas Zoom: Mengenal Scratch"], [-3, "10:00", "11:00", "Tanya Jawab Coding"], [-3, "16:00", "17:00", "Konsultasi Projek Akhir"], [-2, "15:00", "16:00", "Kelas Zoom: Variabel"], [-1, "15:00", "16:30", "Kelas Zoom: Game Pertamaku"]];
  var PIN_RECENT = [1, 1, 1, 0, 1];   // siswa/ortu: hadir, hadir, hadir, TIDAK hadir "Variabel", hadir (cocok dengan Jadwal Saya)
  var FIRST = ["Aisyah", "Budi", "Citra", "Dimas", "Eka", "Fajar", "Gita", "Hadi", "Intan", "Joko"];
  var LAST = ["Putri", "Santoso", "Lestari", "Pratama", "Wulandari", "Nugroho", "Maharani", "Kurniawan", "Ramadhan"];

  var sesiCache = null;
  function sesi() {
    var t = todayWib();
    if (sesiCache && sesiCache.t === t) return sesiCache.list;
    var list = [], k = 0, d, i;
    for (d = -364; d <= -6; d++) {
      if ((-d) % 4 !== 1) continue;
      list.push({ tanggal: shift(t, d), mulai: k % 2 ? "10:00" : "15:00", selesai: k % 2 ? "11:00" : "16:30", judul: TITLES[k % TITLES.length] }); k++;
    }
    for (i = 0; i < RECENT.length; i++) list.push({ tanggal: shift(t, RECENT[i][0]), mulai: RECENT[i][1], selesai: RECENT[i][2], judul: RECENT[i][3] });
    list.forEach(function (s, j) { s.id = "s" + j; });
    sesiCache = { t: t, list: list }; return list;
  }
  function roster() {
    var out = [], seen = {}, i, n;
    for (i = 0; i < 50; i++) { n = FIRST[i % 10] + " " + LAST[(i * 7 + Math.floor(i / 10)) % 9]; if (seen[n]) n += " " + (Math.floor(i / 10) + 1); seen[n] = 1; out.push(n); }
    return out;
  }
  function rateOf(name) { return 0.45 + (hash(name) % 56) / 100; }   // 45%..100%
  function record(name, pin) {
    var S = sesi(), r = pin ? 0.85 : rateOf(name), off = S.length - PIN_RECENT.length;
    return S.map(function (s, i) {
      var h = hash(name + "#" + i), hadir = pin && i >= off ? !!PIN_RECENT[i - off] : (h % 100) / 100 < r;
      return { id: s.id, tanggal: s.tanggal, mulai: s.mulai, selesai: s.selesai, judul: s.judul, hadir: hadir, at: hadir ? addMin(s.mulai, (h % 9) - 4) : "" };
    });
  }
  function sum(rec) { var h = rec.filter(function (x) { return x.hadir; }).length; return { total: rec.length, hadir: h, tidak: rec.length - h, pct: pctOf(h, rec.length) }; }
  function inMonth(rec, ym) { return rec.filter(function (x) { return x.tanggal.slice(0, 7) === ym; }); }

  var rosterCache = null;
  function rosterRecs() {
    var t = todayWib();
    if (rosterCache && rosterCache.t === t) return rosterCache.list;
    var list = roster().map(function (n) { var rec = record(n, false); return { nama: n, rec: rec, all: sum(rec) }; });
    rosterCache = { t: t, list: list }; return list;
  }

  // perBulan 12 bulan terakhir untuk data contoh satu siswa
  function last12(rec, cur) {
    var out = [];
    for (var i = -11; i <= 0; i++) {
      var ym = addMonth(cur, i), x = sum(inMonth(rec, ym));
      out.push({ bulan: ym, hadir: x.hadir, total: x.total, pct: x.total ? x.pct : null });
    }
    return out;
  }

  // ---------- css ----------
  var cssDone = false;
  function injectCss() {
    if (!root.document) return;
    bind();
    if (cssDone) return; cssDone = true;
    var s = document.createElement("style"); s.id = "dc-rekap-css";
    s.textContent =
      ".rk{color:#2b3350;font-family:inherit}.rk *{box-sizing:border-box}" +
      ".rk-top{display:flex;align-items:center;gap:16px;flex-wrap:wrap}" +
      ".rk-ring{--p:0;flex:none;width:76px;height:76px;border-radius:50%;background:conic-gradient(#34c06f calc(var(--p)*1%),#e7ebf6 0);display:flex;align-items:center;justify-content:center;position:relative}" +
      ".rk-ring:before{content:'';position:absolute;inset:8px;border-radius:50%;background:#fff}.rk-ring span{position:relative;font-weight:800;font-size:18px}" +
      ".rk-ring.low{background:conic-gradient(#f59e0b calc(var(--p)*1%),#e7ebf6 0)}" +
      ".rk-ttl{font-weight:800;font-size:16px;margin:0}.rk-sub{margin:3px 0 0;font-size:13px;color:#6b7494;line-height:1.45}" +
      ".rk-all{margin:0 0 12px;font-size:13px;color:#6b7494}.rk-all b{color:inherit;font-size:15px}" +
      ".rk-bar{height:8px;border-radius:99px;background:#e7ebf6;overflow:hidden;margin:12px 0 4px}.rk-bar i{display:block;height:100%;border-radius:99px;background:#34c06f}.rk-bar.low i{background:#f59e0b}" +
      ".rk-nav{display:flex;align-items:center;justify-content:center;gap:12px;margin:0 0 6px}.rk-nav b{min-width:150px;text-align:center;font-size:15px}" +
      ".rk-nav button{border:0;cursor:pointer;font:inherit;font-weight:800;font-size:16px;width:34px;height:34px;border-radius:12px;background:#eef1ff;color:#5a6bd8}.rk-nav button:disabled{opacity:.4;cursor:default}" +
      ".rk-strip{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:3px;margin:0 0 14px}" +
      ".rk-mb{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;border:0;background:transparent;cursor:pointer;height:64px;padding:0;font:inherit;min-width:0}" +
      ".rk-mb i{display:block;width:100%;max-width:22px;border-radius:5px 5px 2px 2px;background:#bfe9d1;min-height:3px}.rk-mb i.low{background:#fcd9a0}" +
      ".rk-mb.on i{background:#34c06f}.rk-mb.on i.low{background:#f59e0b}.rk-mb span{font-size:10px;color:#6b7494}.rk-mb.on span{font-weight:800;color:#2b3350}" +
      ".rk-mb:disabled{cursor:default}.rk-mb:disabled i{background:#e7ebf6;height:3px}" +
      ".rk-list{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px}" +
      ".rk-list li{display:flex;align-items:center;gap:10px;padding:9px 11px;border:2px solid #eef1ff;border-radius:14px}" +
      ".rk-mk{flex:none;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;background:#34c06f}" +
      ".rk-list li.miss .rk-mk{background:#d6dbec;color:#6b7494}" +
      ".rk-list b{display:block;font-size:14px}.rk-list small{display:block;font-size:12px;color:#6b7494}" +
      ".rk-note{margin:12px 0 0;font-size:12px;color:#a86a00}.rk-ro{margin:0 0 12px;padding:8px 11px;border-radius:12px;background:#eef1ff;color:#5a6bd8;font-size:12px;font-weight:600}" +
      ".rk-empty{padding:18px 8px;text-align:center;color:#6b7494;font-size:13px}" +
      ".rk-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}" +
      ".rk-kpi{padding:12px 14px;border-radius:16px;border:2px solid #eef1ff;background:#fff}.rk-kpi b{display:block;font-size:22px;font-weight:800}.rk-kpi span{font-size:12px;color:#6b7494}" +
      ".rk-tabs{display:flex;gap:6px;margin-bottom:12px}.rk-tab{border:0;cursor:pointer;font:inherit;font-weight:700;font-size:13px;padding:8px 14px;border-radius:12px;background:#eef1ff;color:#5a6bd8}.rk-tab.on{background:#5a6bd8;color:#fff}" +
      ".rk-nav button:focus-visible,.rk-mb:focus-visible,.rk-tab:focus-visible,.rk summary:focus-visible,.rk-more:focus-visible,.rk-in:focus-visible{outline:3px solid #2d8cff;outline-offset:2px}" +
      ".rk-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}.rk-in{font:inherit;font-size:13px;padding:8px 11px;border-radius:12px;border:2px solid #e3e9ff;background:#fff;color:inherit;min-width:0}input.rk-in{flex:1;min-width:150px}" +
      ".rk-chk{display:flex;align-items:center;gap:6px;font-size:13px;white-space:nowrap}.rk-cnt{font-size:12px;color:#6b7494;margin:0 0 8px}" +
      ".rk-more{display:block;width:100%;margin-top:4px;border:0;cursor:pointer;font:inherit;font-weight:700;font-size:13px;padding:10px;border-radius:12px;background:#eef1ff;color:#5a6bd8}" +
      ".rk-det{border:2px solid #eef1ff;border-radius:16px;margin-bottom:8px;background:#fff}" +
      ".rk-det>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px}.rk-det>summary::-webkit-details-marker{display:none}" +
      ".rk-det>summary:before{content:'›';font-weight:800;color:#6b7494;transition:transform .15s}.rk-det[open]>summary:before{transform:rotate(90deg)}" +
      ".rk-det .rk-main{flex:1;min-width:150px}.rk-det .rk-main b{display:block;font-size:14px}.rk-det .rk-main small{font-size:12px;color:#6b7494}" +
      ".rk-pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;background:#e3f8ec;color:#1a7f45;white-space:nowrap}.rk-pill.low{background:#fff4d6;color:#a86a00}.rk-pill.na{background:#eef1ff;color:#6b7494}" +
      ".rk-mini{width:90px;height:6px;border-radius:99px;background:#e7ebf6;overflow:hidden}.rk-mini i{display:block;height:100%;background:#34c06f}.rk-mini.low i{background:#f59e0b}" +
      ".rk-det .rk-body{padding:0 14px 12px}.rk-lbl{margin:8px 0 6px;font-size:12px;font-weight:700;color:#6b7494}" +
      ".rk-names{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}.rk-names li{display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 9px 3px 4px;border-radius:99px;background:#f4f6fc}" +
      ".rk-names .rk-mk{width:16px;height:16px;font-size:9px}.rk-names li.miss{background:#f1f3fa;color:#6b7494}" +
      ".rk-det .rk-list{margin-top:0}.rk-sub2{margin:8px 0 0}.rk-sub2>summary{cursor:pointer;font-size:12px;font-weight:700;color:#5a6bd8}" +
      "@media(max-width:560px){.rk-kpis{grid-template-columns:1fr}.rk-ring{width:64px;height:64px}.rk-mini{display:none}.rk-nav b{min-width:120px}}" +
      ".dark .rk,html[data-theme=\"dark\"] .rk{color:#e8ebf5}" +
      ".dark .rk-ring:before,html[data-theme=\"dark\"] .rk-ring:before{background:#0f172a}" +
      ".dark .rk-ring,.dark .rk-bar,.dark .rk-mini,html[data-theme=\"dark\"] .rk-ring,html[data-theme=\"dark\"] .rk-bar,html[data-theme=\"dark\"] .rk-mini{background-color:#1e293b}" +
      ".dark .rk-sub,.dark .rk-all,.dark .rk-cnt,.dark .rk-lbl,.dark .rk-mb span,.dark .rk-list small,.dark .rk-kpi span,.dark .rk-det .rk-main small,.dark .rk-empty,html[data-theme=\"dark\"] .rk-sub,html[data-theme=\"dark\"] .rk-all,html[data-theme=\"dark\"] .rk-cnt,html[data-theme=\"dark\"] .rk-lbl,html[data-theme=\"dark\"] .rk-mb span,html[data-theme=\"dark\"] .rk-list small,html[data-theme=\"dark\"] .rk-kpi span,html[data-theme=\"dark\"] .rk-det .rk-main small{color:#94a3b8}" +
      ".dark .rk-mb.on span,html[data-theme=\"dark\"] .rk-mb.on span{color:#e8ebf5}" +
      ".dark .rk-list li,.dark .rk-kpi,.dark .rk-det,html[data-theme=\"dark\"] .rk-list li,html[data-theme=\"dark\"] .rk-kpi,html[data-theme=\"dark\"] .rk-det{border-color:#1e293b;background:transparent}" +
      ".dark .rk-in,html[data-theme=\"dark\"] .rk-in{background:#0f172a;border-color:#334155}" +
      ".dark .rk-tab,.dark .rk-nav button,.dark .rk-more,html[data-theme=\"dark\"] .rk-tab,html[data-theme=\"dark\"] .rk-nav button,html[data-theme=\"dark\"] .rk-more{background:#1e293b;color:#a5b4fc}.dark .rk-tab.on,html[data-theme=\"dark\"] .rk-tab.on{background:#6366f1;color:#fff}" +
      ".dark .rk-ro,html[data-theme=\"dark\"] .rk-ro{background:#1e293b;color:#a5b4fc}" +
      ".dark .rk-pill,html[data-theme=\"dark\"] .rk-pill{background:rgba(52,192,111,.18);color:#7be0a6}.dark .rk-pill.low,html[data-theme=\"dark\"] .rk-pill.low{background:rgba(245,158,11,.18);color:#fbbf24}.dark .rk-pill.na,html[data-theme=\"dark\"] .rk-pill.na{background:#1e293b;color:#94a3b8}" +
      ".dark .rk-names li,html[data-theme=\"dark\"] .rk-names li{background:#1e293b}.dark .rk-names li.miss,html[data-theme=\"dark\"] .rk-names li.miss{color:#94a3b8}" +
      ".dark .rk-list li.miss .rk-mk,.dark .rk-names li.miss .rk-mk,html[data-theme=\"dark\"] .rk-list li.miss .rk-mk,html[data-theme=\"dark\"] .rk-names li.miss .rk-mk{background:#334155;color:#94a3b8}";
    document.head.appendChild(s);
  }

  // ---------- potongan html ----------
  function listHtml(rec, empty) {
    if (!rec.length) return '<div class="rk-empty">' + (empty || "Belum ada sesi mentoring yang tercatat.") + "</div>";
    return '<ul class="rk-list">' + rec.slice().reverse().map(function (x) {
      var info = fmtDate(x.tanggal) + " · " + esc(x.mulai) + "–" + esc(x.selesai) + " WIB" + (x.hadir ? " · Hadir " + esc(x.at) : " · Tidak hadir");
      return '<li class="' + (x.hadir ? "ok" : "miss") + '"><span class="rk-mk" aria-hidden="true">' + (x.hadir ? "✔" : "✕") + '</span><span><b>' + esc(x.judul) + "</b><small>" + info + "</small></span></li>";
    }).join("") + "</ul>";
  }
  function pesan(pct, who) {
    var a = who === "siswa";
    if (pct >= 90) return a ? "Luar biasa! Kehadiranmu sangat baik." : "Kehadiran sangat baik.";
    if (pct >= 75) return a ? "Bagus! Pertahankan ya." : "Kehadiran baik.";
    if (pct >= LOW) return a ? "Lumayan. Yuk usahakan hadir di sesi berikutnya." : "Kehadiran cukup. Perlu didorong untuk hadir lebih rutin.";
    return a ? "Kamu cukup sering melewatkan sesi. Yuk hadir di sesi berikutnya!" : "Kehadiran rendah, perlu perhatian.";
  }
  function navHtml(m, first, cur) {
    return '<div class="rk-nav"><button type="button" data-rk-step="-1" aria-label="Bulan sebelumnya"' + (m <= first ? " disabled" : "") + '>‹</button><b aria-live="polite">' + esc(monthLabel(m)) + '</b><button type="button" data-rk-step="1" aria-label="Bulan berikutnya"' + (m >= cur ? " disabled" : "") + ">›</button></div>";
  }
  function stripHtml(m, first, cur, pctFn) {
    var out = '<div class="rk-strip" role="group" aria-label="Kehadiran 12 bulan terakhir">', i, ym, p, h;
    for (i = -11; i <= 0; i++) {
      ym = addMonth(cur, i); p = ym < first ? null : pctFn(ym); h = p == null ? 3 : Math.max(3, Math.round(p * 0.46));
      out += '<button type="button" class="rk-mb' + (ym === m ? " on" : "") + '" data-rk-m="' + ym + '"' + (p == null ? " disabled" : "") + ' title="' + esc(monthLabel(ym)) + (p == null ? ": tidak ada sesi" : ": " + p + "%") + '" aria-label="' + esc(monthLabel(ym)) + (p == null ? ", tidak ada sesi" : ", " + p + " persen") + '"' + (ym === m ? ' aria-current="true"' : "") + '><i class="' + (p != null && p < LOW ? "low" : "") + '" style="height:' + h + 'px"></i><span>' + BLN[+ym.slice(5) - 1] + "</span></button>";
    }
    return out + "</div>";
  }
  function loadingInner(e) { return '<div class="rk-empty">' + esc(e.err || "Memuat kehadiran…") + "</div>"; }

  // ---------- registri tampilan ----------
  var REG = {}, UID = 0;
  function entry(key, opts, kind) {
    var e = REG[key];
    if (!e) e = REG[key] = { key: key, st: {}, cache: {}, err: "", loading: "", opt: {}, kind: kind || "student" };
    if (opts) for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) e.opt[k] = opts[k];
    if (kind) e.kind = kind;
    e.st.m = e.st.m || todayWib().slice(0, 7);
    e.buildInner = function () { return e.kind === "instr" ? instrInner(e) : studentInner(e); };
    return e;
  }
  function wrapper(e) {
    return '<div class="rk" data-rk-key="' + esc(e.key) + '" data-rk-slot="' + esc(e.wrapId) + '">' + e.buildInner() + "</div>";
  }
  function findWrap(e) {
    if (!e.wrapId) return null;
    var scope = e.host && e.host.isConnected ? e.host : root.document;
    return scope.querySelector('[data-rk-slot="' + e.wrapId + '"]') || root.document.querySelector('[data-rk-slot="' + e.wrapId + '"]');
  }
  function paint(e) {
    var w = findWrap(e);
    if (!w) return;
    var act = root.document.activeElement, caret = null;
    if (act && w.contains(act) && act.hasAttribute("data-rk-q")) caret = [act.selectionStart, act.selectionEnd];
    w.innerHTML = e.buildInner();
    if (caret) { var qi = w.querySelector("[data-rk-q]"); if (qi) { qi.focus(); try { qi.setSelectionRange(caret[0], caret[1]); } catch (_) {} } }
  }
  function ensure(e) {
    if (demo()) return;
    var ym = e.st.m, t = targetFor(e);
    if (!t) {
      e.err = e.kind === "instr" ? "Data kehadiran belum bisa dimuat." : "Identitas siswa atau tautan laporan tidak lengkap.";
      paint(e);
      return;
    }
    if (e.cache[ym] || e.loading === ym) return;
    e.loading = ym; e.err = "";
    var work = t.instr ? fetchInstructor(ym) : request(t.url + "?bulan=" + encodeURIComponent(ym), t.auth);
    work.then(function (body) { e.cache[ym] = body; })
      .catch(function (err) { e.err = errorText(err); })
      .then(function () {
        if (e.loading === ym) e.loading = "";
        if (e.st.m === ym) paint(e);
      });
  }
  function activate(e) {
    if (demo()) { paint(e); return; }
    if (!findWrap(e)) {
      // html() dipanggil sebelum markup masuk ke DOM.
      setTimeout(function () { if (findWrap(e)) ensure(e); }, 0);
      return;
    }
    ensure(e);
  }

  // ---------- per siswa (siswa / orang tua / admin) ----------
  function studentInner(e) {
    var who = e.opt.audience || "siswa", nm = String(e.opt.nama || "Siswa");
    var cur = todayWib().slice(0, 7), perBulan, all, sesi;
    if (demo()) {
      var rec = record(nm, who === "siswa" || who === "ortu");
      perBulan = last12(rec, cur); all = sum(rec); sesi = inMonth(rec, e.st.m);
    } else {
      var d = e.cache[e.st.m];
      if (!d) return loadingInner(e);
      perBulan = d.perBulan || [];
      all = d.keseluruhan || { hadir: 0, total: 0, pct: null };
      sesi = (d.sesi || []).map(sessDto);
    }
    var first = cur;
    for (var i = 0; i < perBulan.length; i++) { if (perBulan[i].total) { first = perBulan[i].bulan; break; } }
    var m = e.st.m || cur; if (m < first) m = first; if (m > cur) m = cur; e.st.m = m;
    var s = sum(sesi), low = s.pct != null && s.pct < LOW;
    var pctMap = {}; perBulan.forEach(function (x) { pctMap[x.bulan] = x.total ? x.pct : null; });
    var judul = who === "siswa" ? s.hadir + " dari " + s.total + " sesi hadir di " + monthLabel(m) : esc(nm) + " hadir " + s.hadir + " dari " + s.total + " sesi di " + monthLabel(m);
    var top = s.total
      ? '<div class="rk-top"><div class="rk-ring' + (low ? " low" : "") + '" style="--p:' + s.pct + '" role="img" aria-label="Kehadiran ' + s.pct + ' persen"><span>' + s.pct + '%</span></div><div><p class="rk-ttl">' + (who === "siswa" ? esc(judul) : judul) + '</p><p class="rk-sub">' + esc(pesan(s.pct, who)) + '</p></div></div><div class="rk-bar' + (low ? " low" : "") + '"><i style="width:' + s.pct + '%"></i></div>'
      : "";
    return (who === "admin" ? '<p class="rk-ro">Hanya lihat. Jadwal dan absen dikelola oleh instruktur.</p>' : "") +
      '<p class="rk-all">Keseluruhan 12 bulan: <b>' + (all.pct == null ? "–" : all.pct + "%") + '</b> · ' + all.hadir + " dari " + all.total + " sesi</p>" +
      navHtml(m, first, cur) +
      stripHtml(m, first, cur, function (ym) { return pctMap[ym] == null ? null : pctMap[ym]; }) +
      top + listHtml(sesi, "Tidak ada sesi mentoring di " + esc(monthLabel(m)) + ".") +
      (demo() ? '<p class="rk-note">Mode contoh: ini data percobaan, belum terhubung ke server.</p>' : "");
  }
  function studentKey(opts) {
    var who = opts.audience || "siswa";
    var who2 = who === "ortu" ? "t:" + hash(opts.token || "") : who === "admin" ? "s:" + String(opts.studentId || "") : "auth";
    return "st:" + who + ":" + who2 + ":" + hash(opts.nama || "");
  }
  function html(name, opts) {
    opts = opts || {}; injectCss();
    var o = { audience: opts.audience || "siswa", nama: String(name || "Siswa"), token: opts.token, studentId: opts.studentId };
    var e = entry(studentKey(o), o);
    e.wrapId = "rk" + (++UID);
    var out = wrapper(e);
    activate(e);
    return out;
  }
  function mount(el, opts) {
    if (typeof el === "string") el = document.querySelector(el);
    if (!el) return;
    opts = opts || {};
    injectCss();
    var o = { audience: opts.audience || "siswa", nama: opts.nama, token: opts.token, studentId: opts.studentId };
    if (typeof o.nama === "function") o.nama = o.nama();
    var e = entry(studentKey(o), o);
    e.wrapId = "rk" + (++UID);
    e.host = el;
    el.innerHTML = wrapper(e);
    activate(e);
  }
  function pct(name) { return demo() ? sum(record(String(name || "Siswa"), false)).pct : null; }

  // ---------- instruktur ----------
  function instrModel(e) {
    var cur = todayWib().slice(0, 7), perBulan, rows, sesiM;
    if (demo()) {
      var S = sesi(), R = rosterRecs();
      perBulan = [];
      for (var i = -11; i <= 0; i++) {
        var ym = addMonth(cur, i), t = 0, h = 0;
        R.forEach(function (r) { var x = sum(inMonth(r.rec, ym)); t += x.total; h += x.hadir; });
        perBulan.push({ bulan: ym, hadir: h, total: t, pct: pctOf(h, t) });
      }
      var m = e.st.m || cur; if (m < perBulan[0].bulan) m = perBulan[0].bulan; if (m > cur) m = cur; e.st.m = m;
      rows = R.map(function (r) { var mm = inMonth(r.rec, m), x = sum(mm); return { nama: r.nama, rec: mm, m: x, all: r.all }; });
      sesiM = S.filter(function (s) { return s.tanggal.slice(0, 7) === m; }).map(function (s) {
        var hadir = [], tidak = [];
        R.forEach(function (r) {
          var x = null;
          for (var j = 0; j < r.rec.length; j++) if (r.rec[j].id === s.id) { x = r.rec[j]; break; }
          (x && x.hadir ? hadir : tidak).push(r.nama);
        });
        return { judul: s.judul, tanggal: s.tanggal, mulai: s.mulai, selesai: s.selesai, hadir: hadir.length, total: R.length, pct: pctOf(hadir.length, R.length), siswaHadir: hadir, siswaTidakHadir: tidak };
      });
    } else {
      var d = e.cache[e.st.m];
      if (!d) return null;
      perBulan = d.perBulan || [];
      var first = cur;
      for (var k = 0; k < perBulan.length; k++) { if (perBulan[k].total) { first = perBulan[k].bulan; break; } }
      var mm2 = e.st.m || cur; if (mm2 < first) mm2 = first; if (mm2 > cur) mm2 = cur; e.st.m = mm2;
      rows = (d.items || []).map(function (it) {
        var total = Number(it.total || 0), hadir = Number(it.hadir || 0);
        return {
          nama: it.nama,
          rec: (it.sesi || []).map(sessDto),
          m: { hadir: hadir, total: total, tidak: total - hadir, pct: it.pct },
          all: it.keseluruhan || { hadir: 0, total: 0, pct: null }
        };
      });
      sesiM = (d.sesi || []).map(function (s) {
        return { judul: s.judul, tanggal: s.tanggal, mulai: s.mulai, selesai: s.selesai, hadir: Number(s.hadir || 0), total: Number(s.total || 0), pct: s.pct, siswaHadir: s.siswaHadir || [], siswaTidakHadir: s.siswaTidakHadir || [] };
      });
    }
    return { m: e.st.m, perBulan: perBulan, rows: rows, sesiM: sesiM };
  }
  function instrInner(e) {
    var model = instrModel(e);
    if (!model) return loadingInner(e);
    var m = model.m, perBulan = model.perBulan, R = model.rows, sesiM = model.sesiM;
    var cur = todayWib().slice(0, 7);
    var first = cur;
    for (var i = 0; i < perBulan.length; i++) { if (perBulan[i].total) { first = perBulan[i].bulan; break; } }
    var pctMap = {}; perBulan.forEach(function (x) { pctMap[x.bulan] = x.total ? x.pct : null; });
    var tab = e.st.tab || "sesi", q = (e.st.q || "").trim().toLowerCase(), shown = e.st.shown || PAGE;

    // ringkasan bulan ini per siswa
    var tot = 0, hdr = 0, perhatian = 0;
    R.forEach(function (r) { tot += r.m.total; hdr += r.m.hadir; if (r.m.pct != null && r.m.pct < LOW) perhatian++; });
    var avg = pctOf(hdr, tot);
    var kpi = function (v, l) { return '<div class="rk-kpi"><b>' + v + "</b><span>" + l + "</span></div>"; };

    // per sesi (bulan terpilih)
    var perSesi = sesiM.length ? sesiM.slice().reverse().map(function (x) {
      var absen = x.siswaTidakHadir, hadir = x.siswaHadir, p = x.pct, low = p < LOW, chip = function (n, ok) { return '<li class="' + (ok ? "ok" : "miss") + '"><span class="rk-mk" aria-hidden="true">' + (ok ? "✔" : "✕") + "</span>" + esc(n) + "</li>"; };
      return '<details class="rk-det"><summary><span class="rk-main"><b>' + esc(x.judul) + "</b><small>" + fmtDate(x.tanggal) + " · " + esc(x.mulai) + "–" + esc(x.selesai) + " WIB</small></span>" +
        '<span class="rk-mini' + (low ? " low" : "") + '"><i style="width:' + (p || 0) + '%"></i></span><span class="rk-pill' + (low ? " low" : "") + '">' + hadir.length + "/" + x.total + " hadir</span></summary>" +
        '<div class="rk-body">' +
        (absen.length ? '<p class="rk-lbl">Tidak hadir (' + absen.length + ')</p><ul class="rk-names">' + absen.map(function (n) { return chip(n, false); }).join("") + "</ul>" : '<p class="rk-lbl">Semua siswa hadir 🎉</p>') +
        (hadir.length ? '<details class="rk-sub2"><summary>Lihat yang hadir (' + hadir.length + ')</summary><ul class="rk-names" style="margin-top:8px">' + hadir.map(function (n) { return chip(n, true); }).join("") + "</ul></details>" : "") +
        "</div></details>";
    }).join("") : '<div class="rk-empty">Tidak ada sesi mentoring di ' + esc(monthLabel(m)) + ".</div>";

    // per siswa: cari, filter, urut, paging
    var list = R.filter(function (r) { return (!q || r.nama.toLowerCase().indexOf(q) >= 0) && (!e.st.low || (r.m.pct != null && r.m.pct < LOW)); });
    var key2 = function (r) { return r.m.pct == null ? 999 : r.m.pct; };
    if (e.st.sort === "nama") list.sort(function (a, b) { return a.nama < b.nama ? -1 : 1; });
    else list.sort(function (a, b) { return key2(a) - key2(b) || (a.nama < b.nama ? -1 : 1); });
    var page = list.slice(0, shown);
    var perSiswa = '<div class="rk-tools"><input type="search" class="rk-in" data-rk-q placeholder="Cari nama siswa…" aria-label="Cari nama siswa" value="' + esc(e.st.q || "") + '">' +
      '<label class="rk-chk"><input type="checkbox" data-rk-low' + (e.st.low ? " checked" : "") + '> Hanya yang perlu perhatian</label>' +
      '<select class="rk-in" data-rk-sort aria-label="Urutkan"><option value="rendah"' + (e.st.sort === "nama" ? "" : " selected") + '>Kehadiran terendah dulu</option><option value="nama"' + (e.st.sort === "nama" ? " selected" : "") + ">Nama A–Z</option></select></div>" +
      '<p class="rk-cnt" aria-live="polite">Menampilkan ' + page.length + " dari " + list.length + " siswa" + (list.length !== R.length ? " (total " + R.length + ")" : "") + "</p>" +
      (page.length ? page.map(function (r) {
        var low = r.m.pct != null && r.m.pct < LOW, p = r.m.pct;
        return '<details class="rk-det"><summary><span class="rk-main"><b>' + esc(r.nama) + "</b><small>" + (r.m.total ? r.m.hadir + " dari " + r.m.total + " sesi di bulan ini" : "Tidak ada sesi di bulan ini") + " · keseluruhan " + (r.all.pct == null ? "–" : r.all.pct + "%") + "</small></span>" +
          '<span class="rk-mini' + (low ? " low" : "") + '"><i style="width:' + (p || 0) + '%"></i></span><span class="rk-pill' + (p == null ? " na" : low ? " low" : "") + '">' + (p == null ? "–" : (low ? "Perlu perhatian · " : "") + p + "%") + "</span></summary>" +
          '<div class="rk-body">' + listHtml(r.rec, "Tidak ada sesi di " + esc(monthLabel(m)) + ".") + "</div></details>";
      }).join("") : '<div class="rk-empty">Tidak ada siswa yang cocok.</div>') +
      (list.length > page.length ? '<button type="button" class="rk-more" data-rk-more>Tampilkan ' + Math.min(PAGE, list.length - page.length) + " lagi (sisa " + (list.length - page.length) + ")</button>" : "");

    return '<div class="rk-kpis">' + kpi(avg == null ? "–" : avg + "%", "Rata-rata kehadiran " + esc(monthLabel(m))) + kpi(sesiM.length, "Sesi di bulan ini") + kpi(perhatian, "Siswa perlu perhatian (di bawah " + LOW + "%)") + "</div>" +
      navHtml(m, first, cur) +
      stripHtml(m, first, cur, function (ym) { return pctMap[ym] == null ? null : pctMap[ym]; }) +
      '<div class="rk-tabs" role="tablist"><button type="button" class="rk-tab' + (tab === "sesi" ? " on" : "") + '" role="tab" data-rk-tab="sesi" aria-selected="' + (tab === "sesi") + '">Per sesi</button><button type="button" class="rk-tab' + (tab === "siswa" ? " on" : "") + '" role="tab" data-rk-tab="siswa" aria-selected="' + (tab === "siswa") + '">Per siswa</button></div>' +
      (tab === "sesi" ? perSesi : perSiswa) +
      (demo() ? '<p class="rk-note">Mode contoh: ini data percobaan (' + R.length + " siswa contoh), belum terhubung ke server.</p>" : "");
  }
  function instruktur(el) {
    if (typeof el === "string") el = document.querySelector(el);
    if (!el) return;
    injectCss();
    var head = '<section class="rk-wrap"><h2 style="margin:0 0 4px;font-size:20px;font-weight:800">Rekap Absen Mentoring</h2><p style="margin:0 0 14px;font-size:13px;opacity:.7">Kehadiran siswa di kelas Zoom mentoring. Hanya lihat.</p>';
    var e = entry("instr", null, "instr");
    e.wrapId = "rk" + (++UID);
    e.host = el;
    el.innerHTML = head + wrapper(e) + "</section>";
    activate(e);
  }

  // ---------- interaksi (satu penangan untuk semua tampilan) ----------
  var bound = false;
  function ctx(target) {
    var node = target.closest && target.closest(".rk[data-rk-key]"); if (!node) return null;
    var e = REG[node.getAttribute("data-rk-key")]; return e && e.buildInner ? { node: node, e: e } : null;
  }
  function bind() {
    if (bound || !root.document) return; bound = true;
    document.addEventListener("click", function (ev) {
      var t = ev.target, c = ctx(t); if (!c) return;
      var b = t.closest("[data-rk-step],[data-rk-m],[data-rk-tab],[data-rk-more]"); if (!b || b.disabled) return;
      var e = c.e, st = e.st, cur = todayWib().slice(0, 7);
      if (b.hasAttribute("data-rk-step")) { st.m = addMonth(st.m || cur, +b.getAttribute("data-rk-step")); st.shown = PAGE; paint(e); ensure(e); }
      else if (b.hasAttribute("data-rk-m")) { st.m = b.getAttribute("data-rk-m"); st.shown = PAGE; paint(e); ensure(e); }
      else if (b.hasAttribute("data-rk-tab")) { st.tab = b.getAttribute("data-rk-tab"); paint(e); }
      else if (b.hasAttribute("data-rk-more")) { st.shown = (st.shown || PAGE) + PAGE; paint(e); }
    });
    document.addEventListener("input", function (ev) {
      var t = ev.target; if (!t.hasAttribute || !t.hasAttribute("data-rk-q")) return;
      var c = ctx(t); if (!c) return; c.e.st.q = t.value; c.e.st.shown = PAGE; paint(c.e);
    });
    document.addEventListener("change", function (ev) {
      var t = ev.target; if (!t.hasAttribute) return;
      var c = ctx(t); if (!c) return;
      if (t.hasAttribute("data-rk-low")) { c.e.st.low = t.checked; c.e.st.shown = PAGE; paint(c.e); }
      else if (t.hasAttribute("data-rk-sort")) { c.e.st.sort = t.value; c.e.st.shown = PAGE; paint(c.e); }
    });
  }

  root.DCRekap = { html: html, mount: mount, instruktur: instruktur, pct: pct, _record: record, _sum: sum, _roster: roster, _reg: REG };
})(window);
