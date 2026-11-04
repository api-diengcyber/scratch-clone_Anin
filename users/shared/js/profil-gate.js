// ============================================================
// GERBANG DATA DIRI — course hanya bisa diakses setelah data diri lengkap
// Simpan di: users/shared/js/profil-gate.js
//
// Data diri dianggap lengkap bila: Nama Lengkap, Email, dan Email Orangtua terisi (format email valid).
//
// Yang dilakukan:
//   1. Dashboard  → banner "Lengkapi data diri" di atas daftar course. Klik kartu/tombol course
//                   (tautan ke /belajar*.html) dicegat dan memunculkan pop up "Data diri belum dilengkapi".
//   2. Halaman belajar / materi / editor → bila data belum lengkap, pop up muncul dan halaman diblokir
//                   (tidak bisa ditutup; pilihan: "Lengkapi Sekarang" atau "Kembali ke Dashboard").
//
// Cara pakai (SESUDAH jalur-belajar.js / LP dimuat, di akhir <body>):
//   <script src="/shared/js/profil-gate.js?v=20261019"></script>
//   Di halaman dashboard tambahkan  data-mode="banner"  → lihat dashboard.html.
//   (alternatif tanpa atribut: halaman yang alamatnya /dashboard.html otomatis memakai mode banner)
//
// Ini lapisan tampilan saja. Penolakan yang sebenarnya harus ada di backend (lihat catatan: 403 PROFILE_INCOMPLETE).
// ============================================================
(function () {
  "use strict";
  if (window.__profilGate) return;
  window.__profilGate = true;

  var PROFIL_URL = "/profil/profil.html?lengkapi=1";
  var DASHBOARD_URL = "/dashboard.html";
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var me = document.currentScript;
  var isDashboard = (me && me.getAttribute("data-mode") === "banner") || /\/dashboard(\.html)?$/.test(location.pathname);
  var isProfil = /\/profil(\.html)?$/.test(location.pathname);
  if (isProfil) return;   // halaman pengaturan profil harus selalu bisa dibuka

  function user() {
    try { return localStorage.getItem("username") || localStorage.getItem("scratch_user") || "tamu"; } catch (e) { return "tamu"; }
  }
  function cache() {
    try { return JSON.parse(localStorage.getItem("profile_" + user())) || {}; } catch (e) { return {}; }
  }
  function lengkap(p) {
    p = p || {};
    return !!(String(p.fullName || "").trim() && EMAIL_RE.test(String(p.email || "").trim()) && EMAIL_RE.test(String(p.parentEmail || "").trim()));
  }
  function butuhLogin() {
    try { return !localStorage.getItem("authToken") || user() === "tamu"; } catch (e) { return true; }
  }

  // status terakhir: true / false / null (belum diketahui). Cache lokal dipakai dulu, lalu dikoreksi dari server.
  var status = butuhLogin() ? true : lengkap(cache());
  var diperiksaServer = false;

  // ---------- Pop up ----------
  var overlay = null;
  function popup(blokir) {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "pgTitle");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif";
    overlay.innerHTML =
      '<div style="background:#fff;color:#1e293b;max-width:420px;width:100%;border-radius:24px;padding:28px 24px;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,.35)">' +
        '<div style="font-size:44px;line-height:1">📝</div>' +
        '<h2 id="pgTitle" style="margin:12px 0 6px;font-size:20px;font-weight:800">Data diri belum dilengkapi</h2>' +
        '<p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#475569">Lengkapi dulu <b>nama lengkap</b>, <b>email</b>, dan <b>email orangtua</b> di Pengaturan Profil sebelum mulai belajar ya.</p>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
          '<a href="' + PROFIL_URL + '" id="pgGo" style="display:block;padding:12px 16px;border-radius:14px;background:#0284c7;color:#fff;font-weight:700;font-size:14px;text-decoration:none">Lengkapi Sekarang</a>' +
          (blokir
            ? '<a href="' + DASHBOARD_URL + '" style="display:block;padding:12px 16px;border-radius:14px;background:#f1f5f9;color:#334155;font-weight:700;font-size:14px;text-decoration:none">Kembali ke Dashboard</a>'
            : '<button type="button" id="pgClose" style="padding:12px 16px;border:0;border-radius:14px;background:#f1f5f9;color:#334155;font-weight:700;font-size:14px;cursor:pointer">Nanti dulu</button>') +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    var tutup = overlay.querySelector("#pgClose");
    if (tutup) tutup.addEventListener("click", sembunyi);
    overlay.querySelector("#pgGo").focus();
    if (blokir) {
      document.documentElement.style.overflow = "hidden";
      // tab/escape tidak boleh keluar dari pop up pada mode blokir
      overlay.addEventListener("keydown", function (e) { if (e.key === "Escape") e.preventDefault(); });
    } else {
      document.addEventListener("keydown", escTutup);
    }
  }
  function escTutup(e) { if (e.key === "Escape") sembunyi(); }
  function sembunyi() {
    if (overlay) { overlay.remove(); overlay = null; }
    document.removeEventListener("keydown", escTutup);
    document.documentElement.style.overflow = "";
  }

  // ---------- Banner (dashboard) ----------
  function banner() {
    if (document.getElementById("pgBanner")) return;
    var area = document.getElementById("tahapArea");
    if (!area || !area.parentNode) return;
    var b = document.createElement("div");
    b.id = "pgBanner";
    b.setAttribute("role", "alert");
    b.style.cssText = "margin:0 0 16px;padding:14px 16px;border-radius:16px;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;font-size:14px;font-weight:600";
    b.innerHTML = '<span>⚠️ <b>Lengkapi data diri</b> dulu sebelum mulai belajar (nama lengkap, email, dan email orangtua).</span>' +
      '<a href="' + PROFIL_URL + '" style="padding:8px 14px;border-radius:12px;background:#f59e0b;color:#fff;font-weight:700;text-decoration:none">Lengkapi sekarang →</a>';
    area.parentNode.insertBefore(b, area);
  }
  function hapusBanner() { var b = document.getElementById("pgBanner"); if (b) b.remove(); }

  // ---------- Dashboard: cegat klik ke halaman course ----------
  function cegatKlik(e) {
    if (status !== false) return;
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (!/(^|\/)belajar(-smp|-smk)?\.html/.test(href) && href.indexOf("/tools/") !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    popup(false);
  }

  function terapkan() {
    if (isDashboard) {
      if (status === false) { banner(); } else { hapusBanner(); sembunyi(); }
    } else if (status === false) {
      popup(true);   // halaman belajar / materi / editor: blokir
    } else {
      sembunyi();
    }
  }

  // ---------- Mulai ----------
  if (!butuhLogin()) {
    if (isDashboard) document.addEventListener("click", cegatKlik, true);

    var siap = function () {
      terapkan();
      // koreksi dari server (nilai server menang). Gagal jaringan → pakai status cache.
      if (window.LP && typeof LP.loadProfile === "function") {
        LP.loadProfile().then(function (p) {
          if (p) { status = lengkap(p); diperiksaServer = true; terapkan(); }
        }).catch(function () {});
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", siap); else siap();

    // dashboard menggambar ulang #tahapArea saat ganti jenjang → pasang banner lagi bila hilang
    if (isDashboard) {
      var t = setInterval(function () { if (status === false) banner(); }, 1000);
      window.addEventListener("pagehide", function () { clearInterval(t); });
    }

    // halaman dibuka lewat tombol Back (bfcache) setelah profil diisi → periksa ulang
    window.addEventListener("pageshow", function (ev) { if (ev.persisted) { status = lengkap(cache()); terapkan(); } });
    // profil disimpan di tab lain
    window.addEventListener("storage", function (ev) { if (ev.key === "profile_" + user()) { status = lengkap(cache()); terapkan(); } });
  }

  window.ProfilGate = { lengkap: lengkap, status: function () { return status; } };
})();
