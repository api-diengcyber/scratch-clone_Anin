// ============================================================
// STREAK HARIAN + ABSEN JADWAL MENTORING (portal siswa)
//
// 1) DCStreak  : hitung hari beruntun belajar, ala Dicoding.
//    Sehari dihitung saat siswa menekan tombol "Klaim streak hari ini" di kartu streak
//    (halaman Jadwal Saya). Tidak ada pencatatan otomatis di halaman lain.
//    Hari dihitung menurut WIB, bukan jam perangkat.
//      DCStreak.claim()    -> klaim hari ini, hasil { current, longest, days, today }
//      DCStreak.get()      -> baca saja
//      DCStreak.mount(el)  -> gambar kartu streak (dengan tombol klaim) di dalam elemen
//    Otomatis: kalau ada <div id="streakCard"></div> kartunya digambar di situ.
//
// 2) DCAbsen   : absen hadir untuk kelas mentoring (Zoom) di halaman Jadwal Saya.
//    Tombol absen aktif 15 menit sebelum mulai sampai jam selesai.
//      DCAbsen.load('2026-11') -> muat catatan hadir bulan itu
//      DCAbsen.state(ev)       -> 'belum' | 'buka' | 'hadir' | 'lewat' | 'none'
//      DCAbsen.mark(ev)        -> absen hadir
//      DCAbsen.html(ev)        -> potongan HTML status/tombol absen
//
// ENDPOINT (backend):
//   GET  /api/streak                 -> { ok, current, longest, today, days: ['2026-11-10', ...] }
//   POST /api/streak/checkin         -> bentuk sama; boleh dipanggil berkali-kali di hari yang sama
//   GET  /api/attendance?bulan=YYYY-MM -> { ok, items: [{ jadwalId, checkedInAt }] }
//   POST /api/attendance { jadwalId }  -> { ok, item: { jadwalId, checkedInAt } }
//                                         409 kalau sudah absen, 422/403 kalau di luar jam absen
// PENTING: server yang menentukan tanggal (WIB) dan jam buka/tutup absen. Pengecekan di
// browser hanya untuk tampilan, jadi mudah dilewati kalau server tidak ikut memeriksa.
//
// MODE DEMO (tanpa backend): set window.DC_STREAK_DEMO = true SEBELUM file ini dimuat. Semua data
// streak & absen disimpan di memori halaman saja (tidak ada request ke server, tidak ada localStorage).
// Hapus baris itu kalau backend sudah siap.
//
// MODE CONTOH: kalau endpoint belum ada (404/405/501), data disimpan di browser ini saja
// (localStorage) dan kartu streak memberi catatan. Server yang error/offline TIDAK
// dianggap "belum ada", supaya absen tidak tampak berhasil padahal tidak tersimpan.
// ============================================================
(function (root) {
  "use strict";
  if (root.DCStreak) return;

  var API_STREAK = "/api/streak", API_ABSEN = "/api/attendance";
  var WIB_MS = 7 * 36e5;
  var OPEN_BEFORE_MIN = 15;          // absen dibuka sekian menit sebelum mulai
  var DEFAULT_LEN_MIN = 120;         // kalau jadwal tanpa jam selesai
  var DAY = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

  var esc = (root.DCUtils && root.DCUtils.esc) || function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  };

  // ---------- util ----------
  function token() { try { return localStorage.getItem("authToken") || ""; } catch (e) { return ""; } }
  function user() { try { return localStorage.getItem("username") || localStorage.getItem("scratch_user") || "tamu"; } catch (e) { return "tamu"; } }
  function lget(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function validDay(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  function ymdWib(ms) { return new Date(ms + WIB_MS).toISOString().slice(0, 10); }
  function todayWib() { return ymdWib(Date.now()); }
  function shift(ymd, n) { var p = ymd.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); }
  function dowMon(ymd) { var p = ymd.split("-"); return (new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay() + 6) % 7; }   // 0 = Senin
  function wibEpoch(tanggal, jam) { var p = tanggal.split("-"), t = (jam || "00:00").split(":"); return Date.UTC(+p[0], +p[1] - 1, +p[2], +t[0] || 0, +t[1] || 0) - WIB_MS; }
  function hmWib(iso) { var ms = Date.parse(iso); return isNaN(ms) ? "" : new Date(ms + WIB_MS).toISOString().slice(11, 16); }

  function request(path, opts) {
    opts = opts || {};
    var headers = { Authorization: "Bearer " + token() };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    return fetch(path, { method: opts.method || "GET", headers: headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), cache: "no-store" })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!res.ok || (data && data.ok === false)) {
            var err = new Error((data && data.message) || ("Permintaan gagal (HTTP " + res.status + ")."));
            err.status = res.status; throw err;
          }
          return data || {};
        });
      }, function () { var err = new Error("Tidak dapat terhubung ke server."); err.status = 0; throw err; });
  }
  function endpointMissing(e) { return !!e && (e.status === 404 || e.status === 405 || e.status === 501); }

  var css = false;
  function injectCss() {
    if (css || !root.document) return; css = true;
    var s = document.createElement("style"); s.id = "dc-streak-css";
    s.textContent =
      ".dcs-card{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px 24px;margin:16px 0;padding:16px 20px;border-radius:22px;background:#fff;border:3px solid #ffe2b8;box-shadow:0 6px 16px rgba(60,80,140,.1);color:#2b3350}" +
      ".dcs-main{display:flex;align-items:center;gap:14px;min-width:0}.dcs-flame{font-size:40px;line-height:1}.dcs-flame.off{filter:grayscale(1);opacity:.45}" +
      ".dcs-num{font-size:30px;font-weight:800;line-height:1;color:#e8590c}.dcs-lbl{font-weight:bold;font-size:15px}.dcs-sub{margin:3px 0 0;font-size:13px;color:#6b7494;line-height:1.4}" +
      ".dcs-week{display:flex;gap:8px}.dcs-d{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;font-weight:bold;color:#6b7494}" +
      ".dcs-d i{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:17px;background:#f1f3fa;border:2px solid transparent}" +
      ".dcs-d.on i{background:#fff0dc;border-color:#ffb454}.dcs-d.today i{border-color:#e8590c}.dcs-d.future{opacity:.5}" +
      ".dcs-act{margin-top:8px}.dcs-claim{border:0;cursor:pointer;font:inherit;font-weight:bold;font-size:14px;padding:9px 16px;border-radius:14px;background:#ff8a1f;color:#fff;box-shadow:0 3px 0 #d9690a}.dcs-claim:active{transform:translateY(2px);box-shadow:0 1px 0 #d9690a}.dcs-claim:disabled{opacity:.6;cursor:wait}.dcs-claim:focus-visible{outline:3px solid #2d8cff;outline-offset:2px}" +
      ".dcs-pop{animation:dcsPop .6s ease}@keyframes dcsPop{0%{transform:scale(.6)}60%{transform:scale(1.25)}100%{transform:scale(1)}}@media(prefers-reduced-motion:reduce){.dcs-pop{animation:none}}" +
      ".dcs-best{font-size:13px;color:#6b7494;text-align:right}.dcs-best b{display:block;font-size:18px;color:#2b3350}.dcs-note{flex-basis:100%;margin:0;font-size:12px;color:#a86a00}" +
      "html[data-theme=\"dark\"] .dcs-card{background:var(--d-surface,#1f2433);border-color:#5a4426;color:var(--d-text,#e8ebf5)}" +
      "html[data-theme=\"dark\"] .dcs-sub,html[data-theme=\"dark\"] .dcs-best,html[data-theme=\"dark\"] .dcs-d{color:var(--d-text-3,#9aa3bd)}" +
      "html[data-theme=\"dark\"] .dcs-best b{color:var(--d-text,#e8ebf5)}html[data-theme=\"dark\"] .dcs-d i{background:rgba(255,255,255,.07)}html[data-theme=\"dark\"] .dcs-d.on i{background:rgba(255,180,84,.18)}" +
      "@media(max-width:560px){.dcs-card{padding:14px}.dcs-week{width:100%;justify-content:space-between}.dcs-best{text-align:left}}" +
      ".dca{margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:#6b7494}" +
      ".dca-btn{border:0;cursor:pointer;font:inherit;font-weight:bold;font-size:14px;padding:9px 14px;border-radius:14px;background:#34c06f;color:#fff}.dca-btn:disabled{opacity:.6;cursor:wait}" +
      ".dca-btn:focus-visible{outline:3px solid #2d8cff;outline-offset:2px}" +
      ".dca-ok{font-weight:bold;font-size:13px;padding:4px 10px;border-radius:10px;background:#e3f8ec;color:#1a7f45}.dca-miss{font-size:13px;padding:4px 10px;border-radius:10px;background:#f1f3fa}" +
      "html[data-theme=\"dark\"] .dca-ok{background:rgba(52,192,111,.18);color:#7be0a6}html[data-theme=\"dark\"] .dca-miss{background:rgba(255,255,255,.08)}";
    document.head.appendChild(s);
  }

  // ============================================================
  // STREAK
  // ============================================================
  var streakLocal = false, streakCache = null;

  function calc(days, today) {
    var set = {}; days.forEach(function (d) { if (validDay(d)) set[d] = 1; });
    var list = Object.keys(set).sort(), longest = 0, run = 0, prev = null;
    list.forEach(function (d) { run = prev && shift(prev, 1) === d ? run + 1 : 1; if (run > longest) longest = run; prev = d; });
    var cur = 0, c = set[today] ? today : shift(today, -1);
    while (set[c]) { cur++; c = shift(c, -1); }
    return { current: cur, longest: longest, days: list.slice(-60), today: !!set[today] };
  }
  function shapeStreak(d) {
    var s = (d && d.streak) || d || {}, today = todayWib();
    var c = calc(Array.isArray(s.days) ? s.days : [], today);
    return {
      current: typeof s.current === "number" ? s.current : c.current,
      longest: Math.max(typeof s.longest === "number" ? s.longest : c.longest, typeof s.current === "number" ? s.current : 0),
      days: c.days,
      today: typeof s.today === "boolean" ? s.today : c.today,
      local: streakLocal
    };
  }
  function localStreak(add) {
    var key = "dc-streak-" + user(), o = lget(key) || { days: [] }, t = todayWib();
    if (add && o.days.indexOf(t) < 0) o.days.push(t);
    o.days = o.days.filter(validDay).slice(-400);
    lset(key, o);
    return shapeStreak({ days: o.days });
  }
  // ---- mode demo: data di memori, tanpa fetch ----
  var demoDays = null;
  function demoStreak(add) {
    var t = todayWib();
    if (!demoDays) demoDays = [-9, -8, -5, -4, -3, -2, -1].map(function (n) { return shift(t, n); });   // contoh: rekor lama 2 hari, lalu 5 hari beruntun
    if (add && demoDays.indexOf(t) < 0) demoDays.push(t);
    var r = shapeStreak({ days: demoDays.slice() }); r.demo = true; return r;
  }
  function streak(doCheckin) {
    if (root.DC_STREAK_DEMO) return Promise.resolve(demoStreak(!!doCheckin));
    if (!token()) return Promise.reject(new Error("Belum login."));
    var flag = "dc-streak-ok-" + user(), post = !!doCheckin && sget(flag) !== todayWib();
    if (streakLocal) { var r = localStreak(post); if (post) sset(flag, todayWib()); return Promise.resolve(r); }
    return request(post ? API_STREAK + "/checkin" : API_STREAK, { method: post ? "POST" : "GET" }).then(function (d) {
      if (post) sset(flag, todayWib());
      return shapeStreak(d);
    }, function (e) {
      if (!endpointMissing(e)) throw e;
      streakLocal = true;
      var r2 = localStreak(post); if (post) sset(flag, todayWib());
      return r2;
    });
  }

  function cardHtml(s) {
    var today = todayWib(), start = shift(today, -dowMon(today)), set = {}, week = "", i, d, cls;
    s.days.forEach(function (x) { set[x] = 1; });
    for (i = 0; i < 7; i++) {
      d = shift(start, i); cls = "dcs-d" + (set[d] ? " on" : "") + (d === today ? " today" : "") + (d > today ? " future" : "");
      week += '<span class="' + cls + '" title="' + esc(d) + '"><i aria-hidden="true">' + (set[d] ? "🔥" : "") + "</i>" + DAY[i] + "</span>";
    }
    var msg = s.today ? (s.current === 1 ? "Streak dimulai! Datang lagi besok ya." : "Mantap! Streak hari ini sudah diklaim. Datang lagi besok untuk lanjut.")
      : s.current <= 0 ? "Klaim hari ini untuk memulai streak-mu!" : "Klaim hari ini supaya streak-mu tidak putus.";
    var act = s.today ? '<span class="dca-ok">✔ Sudah diklaim hari ini</span>' : '<button type="button" class="dcs-claim" data-claim="1">🔥 Klaim streak hari ini</button>';
    return '<section class="dcs-card" aria-label="Streak belajar harian">' +
      '<div class="dcs-main"><span class="dcs-flame' + (s.current > 0 && s.today ? "" : " off") + '" aria-hidden="true">🔥</span>' +
      '<div><div><span class="dcs-num">' + esc(s.current) + '</span> <span class="dcs-lbl">hari beruntun</span></div><p class="dcs-sub">' + esc(msg) + '</p><div class="dcs-act">' + act + "</div></div></div>" +
      '<div class="dcs-week" role="img" aria-label="Aktivitas minggu ini">' + week + "</div>" +
      '<div class="dcs-best">Rekor terpanjang<b>' + esc(s.longest) + " hari</b></div>" +
      (s.demo ? '<p class="dcs-note">Mode contoh: ini data percobaan, belum terhubung ke server.</p>' : s.local ? '<p class="dcs-note">Mode contoh: streak baru tersimpan di perangkat ini, belum di server.</p>' : "") +
      "</section>";
  }
  function paint(el, s, pop) {
    streakCache = s; el.innerHTML = cardHtml(s);
    if (pop) { var f = el.querySelector(".dcs-flame"); if (f) f.classList.add("dcs-pop"); }
  }
  function mount(el) {
    if (!el) return Promise.resolve(null);
    injectCss();
    if (!el._dcs) {
      el._dcs = true;
      el.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("[data-claim]"); if (!b) return;
        b.disabled = true;
        streak(true).then(function (s) { paint(el, s, true); }, function (err) {
          b.disabled = false;
          var sec = el.querySelector(".dcs-card"); if (!sec) return;
          var old = sec.querySelector(".dcs-err"); if (old) old.parentNode.removeChild(old);
          var p = document.createElement("p"); p.className = "dcs-note dcs-err"; p.setAttribute("role", "alert");
          p.textContent = (err && err.message) || "Klaim belum berhasil. Coba lagi."; sec.appendChild(p);
        });
      });
    }
    return streak(false).then(function (s) { paint(el, s); return s; }, function () { el.innerHTML = ""; return null; });
  }
  root.DCStreak = {
    claim: function () { return streak(true); },
    checkin: function () { return streak(true); },
    get: function () { return streak(false); },
    mount: mount,
    _calc: calc
  };

  // ============================================================
  // ABSEN
  // ============================================================
  var absenLocal = false, amap = {};

  function normItems(d) {
    var list = Array.isArray(d) ? d : (d && (d.items || d.attendance || d.absen)) || [], out = [];
    list.forEach(function (x) {
      if (!x) return;
      var id = x.jadwalId != null ? x.jadwalId : x.jadwal_id;
      if (id == null) return;
      out.push({ id: String(id), at: x.checkedInAt || x.checked_in_at || x.at || "" });
    });
    return out;
  }
  function absenKey() { return "dc-absen-" + user(); }
  function loadAbsen(bulan) {
    if (root.DC_STREAK_DEMO) return Promise.resolve(amap);
    if (absenLocal) { var o = lget(absenKey()) || {}; Object.keys(o).forEach(function (k) { amap[k] = o[k]; }); return Promise.resolve(amap); }
    return request(API_ABSEN + "?bulan=" + encodeURIComponent(bulan)).then(function (d) {
      normItems(d).forEach(function (x) { amap[x.id] = { at: x.at }; });
      return amap;
    }, function (e) {
      if (endpointMissing(e)) { absenLocal = true; return loadAbsen(bulan); }
      return amap;   // server error: halaman tetap jalan, tombol absen tidak menandai hadir palsu
    });
  }
  function absenState(ev, now) {
    if (!ev || ev.id == null || !/^\d{4}-\d{2}-\d{2}$/.test(ev.tanggal || "")) return "none";
    if (amap[String(ev.id)]) return "hadir";
    now = now || Date.now();
    var s = wibEpoch(ev.tanggal, ev.mulai), e = ev.selesai ? wibEpoch(ev.tanggal, ev.selesai) : s + DEFAULT_LEN_MIN * 6e4;
    if (now < s - OPEN_BEFORE_MIN * 6e4) return "belum";
    return now <= e ? "buka" : "lewat";
  }
  function markAbsen(ev) {
    var st = absenState(ev);
    if (st === "hadir") return Promise.resolve(amap[String(ev.id)]);
    if (st !== "buka") return Promise.reject(new Error(st === "belum" ? "Absen belum dibuka." : "Waktu absen sudah lewat."));
    function done(at) { var rec = { at: at || new Date().toISOString() }; amap[String(ev.id)] = rec; return rec; }
    function local() { var o = lget(absenKey()) || {}, rec = done(); o[String(ev.id)] = rec; lset(absenKey(), o); return rec; }
    if (root.DC_STREAK_DEMO) return Promise.resolve(done());
    if (absenLocal) return Promise.resolve(local());
    return request(API_ABSEN, { method: "POST", body: { jadwalId: ev.id } }).then(function (d) {
      var it = (d && d.item) || d || {};
      return done(it.checkedInAt || it.checked_in_at);
    }, function (e) {
      if (e.status === 409) return done();          // sudah tercatat di server
      if (endpointMissing(e)) { absenLocal = true; return local(); }
      throw e;
    });
  }
  function absenHtml(ev) {
    var st = absenState(ev);
    if (st === "none") return "";
    injectCss();
    if (st === "hadir") { var t = hmWib((amap[String(ev.id)] || {}).at); return '<div class="dca"><span class="dca-ok">✔ Hadir' + (t ? " · " + esc(t) + " WIB" : "") + "</span></div>"; }
    if (st === "buka") return '<div class="dca"><button type="button" class="dca-btn" data-absen="' + esc(ev.id) + '">✅ Absen Hadir</button><span>Absen ditutup saat kelas selesai.</span></div>';
    if (st === "belum") return '<div class="dca">🔒 Absen dibuka ' + OPEN_BEFORE_MIN + " menit sebelum kelas mulai.</div>";
    return '<div class="dca"><span class="dca-miss">Tidak tercatat hadir</span></div>';
  }
  function seedAbsen(map) { Object.keys(map || {}).forEach(function (k) { if (!amap[k]) amap[k] = map[k]; }); }   // hanya untuk demo
  root.DCAbsen = { load: loadAbsen, state: absenState, mark: markAbsen, html: absenHtml, seed: seedAbsen };

  // ---------- otomatis ----------
  function auto() {
    if (!token() && !root.DC_STREAK_DEMO) return;
    var el = document.getElementById("streakCard");
    if (el) mount(el);   // hanya menggambar kartu; streak baru tercatat kalau siswa menekan Klaim
  }
  if (root.document) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto); else auto();
  }
})(window);
