// ============================================================
// PENJAGA LOGIN (sisi klien) — dipakai bersama oleh semua halaman yang wajib login
//
// Cara pakai: muat di <head>, SEBELUM script lain, supaya halaman tidak sempat tampil
// kalau pengunjung belum login:
//   <script src="/shared/js/auth-guard.js"></script>
//
// Yang dilakukan:
//   1. Tidak ada authToken di localStorage → halaman disembunyikan lalu langsung ke /index.html.
//   2. Ada token → halaman tampil seperti biasa, sambil token diperiksa ke /api/auth/me.
//        • 401 / 403 (sesi habis atau tidak sah) → data login dibersihkan, lalu ke /index.html.
//        • Berhasil → username disinkronkan dari server (sama seperti dashboard & halaman SD).
//        • Jaringan putus / server error → halaman dibiarkan; API tetap menolak di backend.
//   3. Halaman yang dibuka lewat tombol Back (bfcache) setelah logout ikut diperiksa ulang.
//
// Ini lapisan UX saja. Penolakan yang sebenarnya tetap ada di backend (auth.requireAuth).
// ============================================================
(function () {
  if (window.__authGuard) return;
  window.__authGuard = true;

  var LOGIN_URL = "/index.html";
  var CLEAR_KEYS = ["isLoggedIn", "username", "scratch_user", "authToken"];   // sama dengan logout di dashboard

  function getToken() {
    try { return localStorage.getItem("authToken"); } catch (e) { return null; }
  }

  function hidePage() {
    try { document.documentElement.style.visibility = "hidden"; } catch (e) {}
  }

  function toLogin() {
    hidePage();
    window.location.replace(LOGIN_URL);
  }

  function clearSession() {
    try {
      for (var i = 0; i < CLEAR_KEYS.length; i++) localStorage.removeItem(CLEAR_KEYS[i]);
    } catch (e) {}
  }

  var token = getToken();
  if (!token) { toLogin(); return; }

  // Setelah logout, tombol Back bisa memulihkan halaman dari cache tanpa menjalankan script lagi.
  window.addEventListener("pageshow", function (ev) {
    if (ev.persisted && !getToken()) toLogin();
  });

  if (typeof fetch !== "function") return;

  fetch("/api/auth/me", { headers: { Authorization: "Bearer " + token } })
    .then(function (res) {
      if (res.status === 401 || res.status === 403) {
        clearSession();
        toLogin();
        return null;
      }
      return res.ok ? res.json() : null;
    })
    .then(function (user) {
      if (!user) return;
      try {
        if (user.username) {
          localStorage.setItem("username", user.username);
          localStorage.setItem("scratch_user", user.username);
        }
        localStorage.setItem("isLoggedIn", "true");
      } catch (e) {}
    })
    .catch(function () { /* jaringan putus: biarkan halaman terbuka */ });
})();
