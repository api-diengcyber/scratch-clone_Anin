// ============================================================
// NOTIF JADWAL MENTORING DI DASHBOARD
//
// Kalau hari ini (atau besok) ada jadwal mentoring Zoom yang belum selesai:
//   1. Banner di atas dashboard (judul, jam, tombol Gabung Zoom)
//   2. Titik merah di tombol burger menu
//   3. Badge LIVE / HARI INI / BESOK di samping menu "Jadwal Saya"
//
// Data dari GET /api/jadwal?bulan=YYYY-MM (sama dengan halaman Jadwal Saya).
// Gagal / kosong → tidak menampilkan apa-apa (tidak mengganggu dashboard).
//
// Data asli dari GET /api/jadwal. Mode contoh hanya aktif jika diminta
// lewat URL: ?demo=live | soon | besok | none
//            ?demo=0  → paksa pakai data asli dari server
// ============================================================
(function () {
  "use strict";
  if (window.__jadwalBadge) return;
  window.__jadwalBadge = true;

  var USE_DEMO = false;   // endpoint /api/jadwal sudah tersedia

  var token = ""; try { token = localStorage.getItem("authToken") || ""; } catch (e) {}
  if (!token) return;

  var esc = (window.DCUtils && window.DCUtils.esc) || function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var ymd = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var hm = function (d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); };

  var m = location.search.match(/[?&]demo=?([a-z0-9]*)/), param = m ? (m[1] === "" ? "live" : m[1]) : null;
  var demo = USE_DEMO ? (param === "0" ? null : (param || "soon")) : (param && param !== "0" ? param : null);

  function at(tanggal, jam) { var p = tanggal.split("-"), t = (jam || "00:00").split(":"); return new Date(+p[0], +p[1] - 1, +p[2], +t[0] || 0, +t[1] || 0); }
  function safeUrl(u) { try { var x = new URL(String(u)); return x.protocol === "https:" ? x.href : ""; } catch (e) { return ""; } }

  function demoEvents() {
    var now = new Date(), s, e;
    if (demo === "none") return [];
    if (demo === "besok") { s = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 15, 0); e = new Date(s.getTime() + 90 * 6e4); }
    else if (demo === "live") { s = new Date(now.getTime() - 10 * 6e4); e = new Date(now.getTime() + 60 * 6e4); }
    else { s = new Date(now.getTime() + 30 * 6e4); e = new Date(s.getTime() + 90 * 6e4); }   // soon (default)
    return [{ id: "demo", tanggal: ymd(s), mulai: hm(s), selesai: hm(e), judul: "Mentoring: Game Pertamaku", jenis: "Live Mentoring 1-on-1", level: "Scratch Level 1", keterangan: "Siapkan project animasi atau game yang sudah kamu buat sebelum gabung ya!", mentor: "Kak Mentor", zoomUrl: "https://zoom.us/j/1234567890" }];
  }
  function monthKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
  function fetchMonth(key) {
    return fetch("/api/jadwal?bulan=" + key, { headers: { Authorization: "Bearer " + token }, cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { var l = Array.isArray(d) ? d : (d && (d.jadwal || d.schedules || d.events)) || []; return l.filter(function (x) { return x && /^\d{4}-\d{2}-\d{2}$/.test(x.tanggal || ""); }); })
      .catch(function () { return []; });
  }
  function fetchEvents() {
    if (demo) return Promise.resolve(demoEvents());
    var n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1), keys = [monthKey(n)];
    if (monthKey(t) !== keys[0]) keys.push(monthKey(t));   // besok bisa jatuh di bulan berikutnya
    return Promise.all(keys.map(fetchMonth)).then(function (r) { return [].concat.apply([], r); });
  }

  var ICON = {
    cam: '<svg viewBox="0 0 24 24" width="26" height="26" fill="#fff" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h8A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 16.5v-9Zm14 3.2 3.6-2.4c.7-.5 1.4 0 1.4.8v6.8c0 .8-.7 1.3-1.4.8L17 13.3v-2.6Z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    ext: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M8 14h2"/></svg>'
  };

  function css() {
    var s = document.createElement("style"); s.id = "zoomBadgeCss";
    s.textContent =
      ".zb{--zg:linear-gradient(90deg,#2f6df6,#8b5cf6);display:flex;align-items:center;gap:16px;flex-wrap:wrap;max-width:1100px;margin:14px auto 18px;padding:18px 22px;border:1.5px solid transparent;border-radius:22px;" +
        "background:linear-gradient(90deg,#fff,#f6f4ff) padding-box,var(--zg) border-box;box-shadow:0 8px 24px rgba(79,70,229,.12);font-family:'Plus Jakarta Sans','Trebuchet MS',Nunito,Arial,sans-serif;color:#1e293b}" +
      ".zb.live{--zg:linear-gradient(90deg,#10b981,#2f6df6)}.zb.besok{--zg:linear-gradient(90deg,#f59e0b,#fb923c)}" +
      ".zic{position:relative;flex:none;width:56px;height:56px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,#2f6df6,#5b4de0);box-shadow:0 6px 14px rgba(47,109,246,.35)}" +
      ".zal{position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;background:#ef4444;color:#fff;border:2px solid #fff;font:800 11px/16px Arial,sans-serif;text-align:center}.zb.live .zal{background:#10b981}.zb.besok .zal{background:#f59e0b}" +
      ".zbody{flex:1;min-width:220px}.zrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}" +
      ".zp{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;letter-spacing:.2px;padding:3px 10px;border-radius:999px;border:1px solid}" +
      ".zp-day{background:#fff0f3;color:#e11d48;border-color:#fecdd3}.zp-day i{width:7px;height:7px;border-radius:50%;background:#fb7185}" +
      ".zb.live .zp-day{background:#ecfdf5;color:#059669;border-color:#a7f3d0}.zb.live .zp-day i{background:#10b981}" +
      ".zb.besok .zp-day{background:#fff7e6;color:#b45309;border-color:#fde68a}.zb.besok .zp-day i{background:#f59e0b}" +
      ".zp-time{background:#fff7e0;color:#b45309;border-color:#fde68a}" +
      ".zmeta{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#64748b}.zmeta i{width:5px;height:5px;border-radius:50%;background:#cbd5e1}" +
      ".ztitle{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ztitle b{font-size:20px;line-height:1.25;font-weight:800}" +
      ".ztag{font-size:12px;font-weight:700;color:#4338ca;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:2px 9px}" +
      ".zdesc{margin:4px 0 0;font-size:14px;color:#64748b;line-height:1.45}" +
      ".zact{display:flex;align-items:center;gap:18px;flex-wrap:wrap}" +
      ".zlink{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#475569;text-decoration:none;padding:8px 4px}.zlink:hover{color:#2f6df6}" +
      ".zbtn{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:#fff;text-decoration:none;white-space:nowrap;padding:11px 18px;border-radius:12px;background:linear-gradient(90deg,#2563eb,#4f46e5);box-shadow:0 6px 14px rgba(79,70,229,.35)}.zbtn:hover{filter:brightness(1.07)}" +
      ".zb a:focus-visible{outline:3px solid #8b5cf6;outline-offset:2px}" +
      ".profile .zdot{margin:0;position:absolute;top:2px;right:2px;width:12px;height:12px;border-radius:50%;background:#ef4444;border:2px solid #fff}" +
      "#userMenu .um-item.zm-on{background:#eef4ff;color:#2563eb}" +
      "#userMenu .zbadge{margin:0 0 0 auto;font-size:10px;font-weight:800;letter-spacing:.4px;line-height:1.3;border-radius:999px;padding:3px 10px;background:#ef4444;color:#fff}#userMenu .zbadge.live{background:#10b981}#userMenu .zbadge.besok{background:#f59e0b}" +
      "html[data-theme='dark'] .zb{background:linear-gradient(90deg,#1b2340,#221d45) padding-box,var(--zg) border-box;color:#e8ecff;box-shadow:0 8px 24px rgba(0,0,0,.4)}" +
      "html[data-theme='dark'] .zdesc,html[data-theme='dark'] .zmeta,html[data-theme='dark'] .zlink{color:#a9b4d8}" +
      "html[data-theme='dark'] .ztag{background:#2a2f63;color:#c7d2fe;border-color:#454c9a}html[data-theme='dark'] .zal{border-color:#1b2340}" +
      "html[data-theme='dark'] #userMenu .um-item.zm-on{background:#1f2a52;color:#8ab4ff}" +
      "@media(max-width:640px){.zb{margin:12px 12px 14px;padding:14px;gap:12px}.zic{width:48px;height:48px}.ztitle b{font-size:17px}.zact{width:100%;justify-content:space-between}.zbtn{flex:1;justify-content:center}}";
    document.head.appendChild(s);
  }

  function render(events) {
    var now = new Date(), tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var today = ymd(now), besok = ymd(tomorrow);
    var list = events.filter(function (e) { return (e.tanggal === today || e.tanggal === besok) && at(e.tanggal, e.selesai || e.mulai || "23:59") >= now; })
      .sort(function (a, b) { return at(a.tanggal, a.mulai) - at(b.tanggal, b.mulai); });
    var old = document.getElementById("zoomBanner"); if (old) old.remove();
    ["zdot", "zbadge"].forEach(function (c) { document.querySelectorAll("." + c).forEach(function (n) { n.remove(); }); });
    document.querySelectorAll(".zm-on").forEach(function (n) { n.classList.remove("zm-on"); });
    if (!list.length) return;

    var ev = list[0], isToday = ev.tanggal === today, live = isToday && at(ev.tanggal, ev.mulai) <= now, url = safeUrl(ev.zoomUrl);
    var label = live ? "LIVE" : isToday ? "HARI INI" : "BESOK";
    if (!document.getElementById("zoomBadgeCss")) css();

    var main = document.querySelector("main");
    if (main) {
      var b = document.createElement("section");
      b.id = "zoomBanner"; b.className = "zb" + (live ? " live" : !isToday ? " besok" : ""); b.setAttribute("role", "status");
      b.setAttribute("aria-label", (live ? "Mentoring sedang berlangsung" : isToday ? "Ada jadwal mentoring hari ini" : "Besok ada jadwal mentoring") + ": " + (ev.judul || "Mentoring Zoom"));
      b.innerHTML =
        '<div class="zic">' + ICON.cam + '<span class="zal" aria-hidden="true">!</span></div>' +
        '<div class="zbody"><div class="zrow">' +
          '<span class="zp zp-day"><i></i>' + label + "</span>" +
          '<span class="zp zp-time">' + ICON.clock + esc(ev.mulai || "") + " WIB</span>" +
          (ev.jenis ? '<span class="zmeta"><i></i>' + esc(ev.jenis) + "</span>" : "") +
          (list.length > 1 ? '<span class="zmeta"><i></i>+' + (list.length - 1) + " jadwal lain</span>" : "") +
        '</div><div class="ztitle"><b>' + esc(ev.judul || "Mentoring Zoom") + "</b>" + (ev.level ? '<span class="ztag">' + esc(ev.level) + "</span>" : "") + "</div>" +
        (ev.keterangan ? '<p class="zdesc">' + esc(ev.keterangan) + "</p>" : "") + "</div>" +
        '<div class="zact"><a class="zlink" href="/jadwal/jadwal.html">' + ICON.cal + "Lihat Jadwal</a>" +
          (url && isToday ? '<a class="zbtn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + ICON.ext + (live ? "Gabung Sekarang" : "Buka Link Zoom") + "</a>" : "") + "</div>";
      main.insertBefore(b, main.firstChild);
    }
    var btn = document.getElementById("menuBtn");
    if (btn) { btn.style.position = btn.style.position || "relative"; var d = document.createElement("span"); d.className = "zdot"; d.setAttribute("aria-hidden", "true"); btn.appendChild(d); }
    var link = document.querySelector('#userMenu a[href="/jadwal/jadwal.html"]');
    if (link) { link.classList.add("zm-on"); var g = document.createElement("span"); g.className = "zbadge" + (live ? " live" : !isToday ? " besok" : ""); g.textContent = label; link.appendChild(g); }
  }

  function start() { fetchEvents().then(render); setInterval(function () { fetchEvents().then(render); }, 60000); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
