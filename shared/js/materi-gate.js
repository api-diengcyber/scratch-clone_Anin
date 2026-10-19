// ============================================================
// GERBANG MATERI — pelacak "sudah dibaca sampai selesai"
// Dimuat di SEMUA halaman materi (SD, SMP, SMA/SMK):
//   <script src="/shared/js/materi-gate.js"></script>   (di akhir <body>)
//
// Dua jenis halaman materi, dikenali otomatis:
//   • Halaman gulir (SMP & SMA/SMK)  → harus digulir sampai bawah DAN dibaca cukup lama.
//   • Halaman slide (SD: .scene)     → semua slide harus sempat ditampilkan DAN cukup lama.
//
// Kalau syarat terpenuhi, alamat halaman dicatat di localStorage "materiRead_<user>".
// Mesin LP (kurikulum/core/jalur-belajar.js → LP.materiDibaca) membaca catatan yang SAMA,
// sehingga task baru bisa dikerjakan setelah materinya selesai dibaca.
//
// PENTING: fungsi materiKey() di sini harus selalu sama dengan LP.materiKey().
// ============================================================
(function () {
  if (window.__materiGate) return;
  window.__materiGate = true;

  // Jaring pengaman: halaman materi wajib login. Normalnya /shared/js/auth-guard.js sudah dimuat di <head>;
  // kalau ada halaman materi baru yang lupa memasangnya, gerbang ini memuatnya sendiri.
  if (!window.__authGuard) {
    var ag = document.createElement("script");
    ag.src = "/shared/js/auth-guard.js?v=20261019";
    document.head.appendChild(ag);
  }

  // ---------- PENGATURAN (ubah di sini) ----------
  var DETIK_PER_KATA = 1 / 15;     // halaman gulir: waktu baca minimal = jumlah kata / 15 detik ...
  var MIN_DETIK = 8;               // ... tapi tidak kurang dari ini
  var MAX_DETIK = 30;              // ... dan tidak lebih dari ini
  var DETIK_PER_SLIDE = 2.5;       // halaman slide: waktu minimal per slide
  var MARGIN_BAWAH = 60;           // dianggap "sudah sampai bawah" kalau sisa gulir kurang dari ini (px)
  var SAFE_BACK = /^\/belajar(-smp|-smk)?\.html(\?[\w=&.%:-]*)?$/;   // hanya boleh kembali ke halaman belajar

  // ---------- penyimpanan (sama dengan LP._get/_set) ----------
  function user() {
    try { return localStorage.getItem("username") || localStorage.getItem("scratch_user") || "tamu"; } catch (e) { return "tamu"; }
  }
  function storeKey() { return "materiRead_" + user(); }
  function readMap() {
    try { return JSON.parse(localStorage.getItem(storeKey())) || {}; } catch (e) { return {}; }
  }
  // kunci = alamat halaman (tanpa query), kecuali ?task= (dipakai materi SD: /SD/materi/sd.html?task=<id>)
  function materiKey(url) {
    try {
      var u = new URL(url, location.origin), p = decodeURIComponent(u.pathname), t = u.searchParams.get("task");
      return p + (t ? "?task=" + t : "");
    } catch (e) { return String(url || ""); }
  }
  var KEY = materiKey(location.href);

  function sudahDibaca() { return !!readMap()[KEY]; }
  function tandaiDibaca() {
    var m = readMap();
    if (m[KEY]) return true;
    m[KEY] = new Date().toISOString();
    try { localStorage.setItem(storeKey(), JSON.stringify(m)); } catch (e) { return false; }
    try { window.dispatchEvent(new CustomEvent("materi:dibaca", { detail: { key: KEY } })); } catch (e) {}
    return true;
  }
  window.MateriGate = { key: KEY, sudahDibaca: sudahDibaca, materiKey: materiKey };

  // ---------- tampilan ----------
  function init() {
    // halaman slide = punya elemen .scene (SD). Dicek tiap kali, karena slide sd.html dibuat sesudah halaman dimuat.
    function isSlide() { return !!document.getElementById("scenes") || document.querySelectorAll(".scene").length > 0; }
    var bar = document.createElement("div");
    bar.setAttribute("style", "position:fixed;top:0;left:0;height:5px;width:0;background:#10b981;z-index:2147483000;transition:width .25s;pointer-events:none");
    var pill = document.createElement("div");
    pill.setAttribute("role", "status");
    pill.setAttribute("aria-live", "polite");
    pill.setAttribute("style", "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483000;max-width:92vw;" +
      "background:#1e293b;color:#fff;padding:9px 16px;border-radius:999px;font:700 13px/1.3 'Plus Jakarta Sans',Arial,sans-serif;" +
      "box-shadow:0 6px 18px rgba(0,0,0,.28);display:flex;gap:10px;align-items:center;white-space:nowrap");
    document.body.appendChild(bar);
    document.body.appendChild(pill);

    // alamat kembali ke halaman belajar: ?kembali= → tombol kembali yang sudah ada di halaman
    function backHref() {
      var kb = new URLSearchParams(location.search).get("kembali");
      if (kb && SAFE_BACK.test(kb)) return kb;
      var el = document.getElementById("btnKembali") || document.getElementById("back");
      var h = el && el.getAttribute("href");
      return h && SAFE_BACK.test(h) ? h : "";
    }
    function selesaiUI() {
      bar.style.width = "100%";
      var h = backHref();
      pill.style.background = "#047857";
      pill.innerHTML = "<span>✅ Materi selesai dibaca! Task sudah terbuka.</span>" +
        (h ? '<a href="' + h.replace(/"/g, "&quot;") + '" style="background:#fff;color:#047857;text-decoration:none;padding:5px 12px;border-radius:999px">Ke task →</a>' : "");
    }

    if (sudahDibaca()) { selesaiUI(); pill.firstChild.textContent = "✅ Materi sudah kamu baca"; return; }

    var terbaca = 0;               // detik halaman benar-benar terbuka & terlihat
    var sampaiBawah = false;       // halaman gulir: pernah mencapai bawah
    var dilihat = {};              // halaman slide: nomor slide yang sudah tampil
    var jumlahSlide = 0, perlu = MIN_DETIK, dihitung = false;

    function hitungKebutuhan() {
      if (isSlide()) {
        jumlahSlide = document.querySelectorAll(".scene").length;
        perlu = jumlahSlide * DETIK_PER_SLIDE;
        dihitung = jumlahSlide > 0;
      } else {
        var kata = ((document.body.innerText || "").match(/\S+/g) || []).length;
        perlu = Math.min(MAX_DETIK, Math.max(MIN_DETIK, Math.round(kata * DETIK_PER_KATA)));
        dihitung = true;
      }
    }

    function tick() {
      if (!dihitung) hitungKebutuhan();
      if (!dihitung) return;                       // slide belum selesai dibuat
      if (!document.hidden) terbaca += 0.5;

      var pctBaca, kurang;
      if (isSlide()) {
        var sc = document.querySelectorAll(".scene");
        for (var i = 0; i < sc.length; i++) if (sc[i].classList.contains("on")) dilihat[i] = 1;
        var n = Object.keys(dilihat).length;
        pctBaca = Math.round(n / sc.length * 100);
        if (n < sc.length) kurang = "👀 Lihat semua slide (" + n + "/" + sc.length + ")";
      } else {
        var root = document.documentElement;
        var sisa = root.scrollHeight - (window.scrollY + window.innerHeight);
        if (sisa <= MARGIN_BAWAH) sampaiBawah = true;
        var total = Math.max(1, root.scrollHeight - window.innerHeight);
        pctBaca = sampaiBawah ? 100 : Math.min(99, Math.round(window.scrollY / total * 100));
        if (!sampaiBawah) kurang = "📖 Baca sampai bawah (" + pctBaca + "%)";
      }
      bar.style.width = pctBaca + "%";

      var sisaDetik = Math.ceil(perlu - terbaca);
      if (!kurang && sisaDetik > 0) kurang = "⏳ Baca dengan teliti… " + sisaDetik + " dtk lagi";
      if (kurang) { pill.textContent = kurang; return; }

      clearInterval(timer);
      if (tandaiDibaca()) selesaiUI();
      else pill.textContent = "⚠️ Gagal menyimpan. Penyimpanan browser penuh atau dimatikan.";
    }
    var timer = setInterval(tick, 500);
    tick();
  }

  if (document.body) init(); else document.addEventListener("DOMContentLoaded", init);
})();
