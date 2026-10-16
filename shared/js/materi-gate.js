// Kunci "materi harus dibaca sampai selesai" untuk jalur SD, SMP & SMA/SMK.
//
// Satu file, dua peran:
//   1. API  window.MateriGate  — dipakai halaman modul (belajar-smp / belajar-smk), kartu task, dan panel task di editor
//      untuk tahu apakah sebuah task masih terkunci karena materinya belum selesai dibaca.
//   2. Pelacak baca — otomatis aktif di halaman materi (/SMP/materi/... dan /SMK/materi/...). Materi dianggap
//      SELESAI DIBACA kalau siswa (a) sudah menggulir sampai bagian paling bawah DAN (b) sudah cukup lama berada di
//      halaman itu (sebanding dengan panjang teks, 10–30 detik, hanya dihitung saat tab terlihat).
//      Ini pendekatan praktis, bukan bukti 100% bahwa anak benar-benar membaca.
//
// Status disimpan di localStorage per akun:  materiRead_<username>  =  { "<alamat halaman materi>": waktu }
// Kuncinya adalah ALAMAT halaman materi (huruf kecil, tanpa query), jadi beberapa task yang memakai satu halaman
// materi yang sama (mis. satu modul satu halaman) otomatis terbuka bersama-sama.
//
// Task TANPA halaman materi ("Materi segera hadir") dan Kumpulkan Final Project TIDAK dikunci,
// karena tidak ada yang bisa dibaca.
(function () {
  "use strict";
  if (window.MateriGate) return;

  var DETIK_MIN = 10, DETIK_MAX = 30, KATA_PER_DETIK = 15;

  // ---------- penyimpanan ----------
  function user() {
    return localStorage.getItem("username") || localStorage.getItem("scratch_user") || "tamu";
  }
  function storeKey() { return "materiRead_" + user(); }
  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(storeKey()));
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch (e) { return {}; }
  }
  function save(map) {
    try { localStorage.setItem(storeKey(), JSON.stringify(map)); return true; } catch (e) { return false; }
  }

  // alamat → kunci: hanya path, tanpa query/hash, huruf kecil, URL-decoded
  function norm(href) {
    if (!href) return "";
    var u;
    try { u = new URL(String(href), location.origin); } catch (e) { return ""; }
    var p = u.pathname;
    try { p = decodeURIComponent(p); } catch (e) {}
    p = p.toLowerCase();
    // Materi SD: satu halaman pemutar (sd.html) dipakai semua task, dibedakan lewat ?task=<id>
    var t = u.searchParams.get("task");
    if (t && /^\/sd\/materi\//.test(p)) p += "?task=" + t.toLowerCase();
    return p;
  }

  // ---------- API ----------
  var API = {
    key: norm,
    isRead: function (href) { var k = norm(href); return !!k && !!load()[k]; },
    mark: function (href) {
      var k = norm(href);
      if (!k) return false;
      var m = load(); m[k] = Date.now();
      return save(m);
    },
    // task ini punya materi yang wajib dibaca?
    needs: function (task) { return !!(task && !task.kumpul && task.halamanMateri); },
    // task ini TERKUNCI karena materinya belum selesai dibaca?
    locked: function (task) { return API.needs(task) && !API.isRead(task.halamanMateri); },
    // alamat halaman materi + tombol kembali ke halaman asal
    href: function (task, kembali) {
      var h = String((task && task.halamanMateri) || "");
      if (!h) return "";
      return kembali ? h + (h.indexOf("?") > -1 ? "&" : "?") + "kembali=" + encodeURIComponent(kembali) : h;
    }
  };
  // Untuk halaman materi SD yang berupa slideshow. Materi dianggap SELESAI DIBACA kalau siswa sudah sampai di slide
  // terakhir DAN sudah menonton cukup lama (±3 detik per slide, minimal 10 detik, hanya dihitung saat tab terlihat),
  // supaya tidak bisa dilewati hanya dengan menekan tombol ▶ berkali-kali.
  //   var g = MateriGate.slide(jumlahSlide, function (s) { ...perbarui tampilan... });
  //   g.lihat(indexSlideYangTampil);      // panggil setiap pindah slide
  // Callback menerima { selesai, sampaiAkhir, sisa } (sisa = detik menonton yang masih kurang).
  API.slide = function (total, ui) {
    var key = location.href, detik = 0, akhir = false, selesai = API.isRead(key);
    var perlu = Math.max(DETIK_MIN, 3 * Math.max(0, total - 1));
    function state() { return { selesai: selesai, sampaiAkhir: akhir, sisa: Math.max(0, perlu - detik) }; }
    function cek() {
      if (!selesai && akhir && detik >= perlu) { selesai = true; API.mark(key); }
      if (ui) ui(state());
    }
    setInterval(function () { if (!document.hidden && !selesai) { detik++; cek(); } }, 1000);
    if (ui) ui(state());
    return {
      lihat: function (i) { if (i >= total - 1) akhir = true; cek(); },
      state: state
    };
  };

  window.MateriGate = API;

  // ============================================================
  // PELACAK BACA — hanya di halaman materi SMP / SMA-SMK
  // ============================================================
  var path = location.pathname;
  try { path = decodeURIComponent(path); } catch (e) {}
  // Materi SD berbentuk slideshow (tidak digulir), jadi pelacak gulir di bawah TIDAK dipakai di sana:
  // halaman materi SD menandai sendiri lewat MateriGate.mark() setelah siswa menonton sampai slide terakhir.
  if (!/^\/(smp|smk)\/materi\//i.test(path)) return;

  function start() {
    var key = norm(location.href);
    if (!key || document.getElementById("materiGate")) return;

    var kata = ((document.body && document.body.innerText) || "").trim().split(/\s+/).length;
    var perlu = Math.max(DETIK_MIN, Math.min(DETIK_MAX, Math.round(kata / KATA_PER_DETIK)));

    // ---------- gaya + bar ----------
    var st = document.createElement("style");
    st.textContent =
      "#materiGate{position:fixed;left:0;right:0;bottom:0;z-index:55;background:#0f172a;color:#fff;" +
        "font:600 14px/1.4 'Plus Jakarta Sans','Trebuchet MS',Arial,sans-serif;box-shadow:0 -6px 20px rgba(0,0,0,.25)}" +
      "#materiGate .mg-in{max-width:860px;margin:0 auto;padding:10px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}" +
      "#materiGate .mg-txt{flex:1 1 220px;min-width:0}" +
      "#materiGate .mg-track{flex:1 1 140px;height:8px;border-radius:8px;background:rgba(255,255,255,.2);overflow:hidden}" +
      "#materiGate .mg-track i{display:block;height:100%;width:0;background:#fbbf24;transition:width .4s}" +
      "#materiGate.ok{background:#047857}" +
      "#materiGate.ok .mg-track i{background:#a7f3d0}" +
      "#materiGate a{background:#fff;color:#047857;text-decoration:none;font-weight:800;padding:8px 14px;border-radius:12px;white-space:nowrap}" +
      "#materiGate a:focus-visible{outline:3px solid #fde68a;outline-offset:2px}";
    document.head.appendChild(st);

    var bar = document.createElement("div");
    bar.id = "materiGate";
    bar.innerHTML = '<div class="mg-in"><div class="mg-txt"></div><div class="mg-track"><i></i></div><a hidden></a></div>';
    document.body.appendChild(bar);
    document.body.style.paddingBottom = "96px";   // supaya baris terakhir materi tidak tertutup bar

    var txt = bar.querySelector(".mg-txt"), fill = bar.querySelector("i"), go = bar.querySelector("a");

    function kembaliHref() {
      var b = document.getElementById("btnKembali");
      return (b && b.getAttribute("href")) || "/";
    }
    function tampilSelesai(pesan) {
      bar.className = "ok";
      bar.setAttribute("role", "status");
      txt.textContent = pesan;
      fill.style.width = "100%";
      var b = document.getElementById("btnKembali");
      go.textContent = ((b && b.textContent) || "Kembali").replace(/^[←\s]+/, "") + " →";
      go.setAttribute("href", kembaliHref());
      go.hidden = false;
      // alamat tombol kembali bisa baru ditentukan beberapa saat kemudian oleh materi-back.js
      go.addEventListener("click", function () { go.setAttribute("href", kembaliHref()); });
    }

    // sudah pernah dibaca → cukup beri tahu
    if (API.isRead(key)) { tampilSelesai("✅ Materi ini sudah kamu baca. Task-nya sudah bisa dikerjakan."); return; }

    // ---------- pelacak ----------
    var detik = 0, maxPct = 0, timer = null;

    function pctNow() {
      var d = document.documentElement, b = document.body;
      var h = Math.max(d.scrollHeight, b.scrollHeight), vh = window.innerHeight || d.clientHeight;
      var max = h - vh;
      if (max <= 24) return 100;                       // halaman pendek: tidak ada yang perlu digulir
      var y = window.pageYOffset || d.scrollTop || 0;
      if (max - y <= 24) return 100;                   // sudah di dasar halaman
      return Math.max(0, Math.min(100, Math.round(y / max * 100)));
    }
    function selesai() {
      if (timer) { clearInterval(timer); timer = null; }
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      API.mark(location.href);
      tampilSelesai("✅ Materi selesai dibaca! Sekarang task-nya terbuka.");
    }
    function gambar() {
      var pctWaktu = Math.round(Math.min(detik, perlu) / perlu * 100);
      fill.style.width = Math.min(maxPct, pctWaktu) + "%";
      if (maxPct < 100) {
        txt.textContent = "📖 Baca sampai bagian paling bawah dulu (" + maxPct + "%)";
      } else if (detik < perlu) {
        txt.textContent = "⏳ Hampir selesai — baca pelan-pelan, " + (perlu - detik) + " detik lagi";
      } else {
        selesai();
      }
    }
    function onScroll() { var p = pctNow(); if (p > maxPct) { maxPct = p; gambar(); } }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    timer = setInterval(function () { if (!document.hidden) { detik++; gambar(); } }, 1000);
    maxPct = pctNow();
    gambar();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
