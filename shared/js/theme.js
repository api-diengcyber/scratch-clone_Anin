// ============================================================
// Mode Gelap (dark mode) — satu file untuk SEMUA halaman.
//
// Cara kerja: pilihan disimpan di localStorage ("dc-theme" = "dark" / "light"),
// lalu atribut data-theme="dark" dipasang di <html>. Ada DUA cara menggelapkan:
//
//  1) MANUAL (halaman utama: login, register, dashboard, halaman belajar)
//     Halaman memasang <html data-dark="manual"> dan memuat /shared/css/dark.css.
//     Warnanya ditentukan satu per satu di dark.css, tanpa filter, jadi tombol
//     berwarna tetap berteks putih dan emoji tetap cerah.
//
//  2) OTOMATIS (halaman lain: materi, poin, laporan, profil, tools)
//     Warna halaman dibalik lewat satu aturan CSS (filter), jadi tidak perlu
//     mengubah CSS tiap halaman. Gambar, video, canvas, iframe, banner berwarna,
//     dan bingkai avatar dibalik sekali lagi supaya warnanya tetap asli.
//     Halaman otomatis bisa "naik kelas" ke manual kapan saja: tambahkan
//     data-dark="manual" + aturan di dark.css.
//
// Wajib dimuat di <head> (sinkron, tanpa defer) supaya tidak ada kedipan putih:
//   <script src="/shared/js/theme.js"></script>
//
// API:
//   DCTheme.get()         -> "dark" | "light"
//   DCTheme.set("dark")   -> ganti + simpan
//   DCTheme.toggle()
//   DCTheme.bind(el)      -> jadikan <button> sebagai saklar (mengatur aria-checked + klik)
//
// Markup saklar:
//   <button type="button" role="switch" aria-checked="false" id="themeSwitch">
//     Mode Gelap <span class="dc-sw" aria-hidden="true"></span>
//   </button>
//
// Ada elemen berwarna yang ingin dijaga warna aslinya di mode gelap?
// Tambahkan class "dc-keep" atau tambahkan selector-nya ke KEEP di bawah.
// ============================================================
(function (root) {
  "use strict";
  if (root.DCTheme) return;

  var KEY = "dc-theme";
  var html = root.document.documentElement;
  var memory = "light";   // cadangan kalau localStorage tidak bisa dipakai
  var bound = [];

  function read() {
    try { return root.localStorage.getItem(KEY) === "dark" ? "dark" : "light"; }
    catch (e) { return memory; }
  }

  function paint(mode) {
    if (mode === "dark") html.setAttribute("data-theme", "dark");
    else html.removeAttribute("data-theme");
    for (var i = 0; i < bound.length; i++) bound[i].setAttribute("aria-checked", String(mode === "dark"));
  }

  function set(mode) {
    mode = mode === "dark" ? "dark" : "light";
    memory = mode;
    try { root.localStorage.setItem(KEY, mode); } catch (e) { /* abaikan */ }
    paint(mode);
    try { root.dispatchEvent(new CustomEvent("dc-theme-change", { detail: { mode: mode } })); } catch (e) { /* abaikan */ }
  }

  // ---------- CSS ----------
  var D = 'html[data-theme="dark"]';
  var MEDIA = ["img", "video", "canvas", "iframe"];
  // Elemen yang warna aslinya dijaga: banner gradasi, bingkai & avatar,
  // header materi, blok kode / layar output, dan editor kode (yang memang sudah gelap).
  var KEEP = [
    ".tahap-banner", ".tahap-hero", ".af-wrap", ".um-avatar", ".dc-keep",
    ".container>.header", ".hd", ".code-block", ".output-screen", ".playground", ".step-num",
    ".code-wrap", ".console", ".ai-tutor"
  ];
  var FLIP = "filter:invert(1) hue-rotate(180deg)";

  function list(items, make) { return items.map(make).join(","); }

  // Halaman dengan palet manual (data-dark="manual") dikecualikan dari filter.
  var DF = D + ':not([data-dark="manual"])';

  var css = [
    // 1) seluruh halaman dibalik (putih -> abu gelap lembut, hue dijaga)
    DF + "{background:#fff;filter:invert(.9) hue-rotate(180deg)}",
    DF + " body{min-height:100vh}",
    // 1b) halaman manual: cukup latar <html> gelap (area overscroll tidak putih)
    D + '[data-dark="manual"]{background:#0e1322}',
    // 2) media & elemen berwarna dibalik lagi = warna asli
    list(MEDIA, function (m) { return DF + " " + m; }) + "," + list(KEEP, function (k) { return DF + " " + k; }) + "{" + FLIP + "}",
    // 3) jangan dibalik dua kali kalau bersarang (mis. foto di dalam bingkai)
    DF + " :is(" + KEEP.join(",") + ") :is(" + KEEP.concat(MEDIA).join(",") + "){filter:none}",
    // 4) cetak (laporan) tetap terang
    "@media print{" + D + "{filter:none;background:none}" + D + " img," + D + " video," + D + " canvas," + D + " iframe{filter:none}}",
    // 5) saklar
    ".dc-sw{position:relative;display:inline-block;flex:none;width:40px;height:22px;border-radius:999px;background:#cbd5e1;vertical-align:middle;transition:background .2s}",
    ".dc-sw::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .2s}",
    "[aria-checked='true'] .dc-sw,[aria-checked='true'].dc-sw{background:#5a6bd8}",
    "[aria-checked='true'] .dc-sw::after,[aria-checked='true'].dc-sw::after{transform:translateX(18px)}",
    "@media (prefers-reduced-motion:reduce){.dc-sw,.dc-sw::after{transition:none}}"
  ].join("\n");

  var style = root.document.createElement("style");
  style.id = "dc-theme-css";
  style.textContent = css;
  (root.document.head || html).appendChild(style);

  // ---------- terapkan sedini mungkin ----------
  paint(read());

  // tab/halaman lain mengganti tema -> ikut berubah; juga saat kembali lewat tombol Back (bfcache)
  root.addEventListener("storage", function (e) { if (e.key === KEY) paint(read()); });
  root.addEventListener("pageshow", function (e) { if (e.persisted) paint(read()); });

  root.DCTheme = {
    get: read,
    set: set,
    toggle: function () { set(read() === "dark" ? "light" : "dark"); },
    bind: function (el) {
      if (!el || bound.indexOf(el) !== -1) return;
      bound.push(el);
      el.setAttribute("aria-checked", String(read() === "dark"));
      el.addEventListener("click", function () { root.DCTheme.toggle(); });
    }
  };
})(window);
