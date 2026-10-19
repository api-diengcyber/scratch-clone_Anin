// Tombol "← Kembali ke Modul" untuk SEMUA halaman materi SMP & SMA/SMK.
//
// Cara kerja (urutan prioritas):
//   1. ?kembali=/belajar-smp.html?p=py2   → dikirim dari halaman modul saat tombol "📺 Materi" diklik
//   2. Dicari dari data kurikulum: modul mana yang memakai halaman materi ini (halamanMateri)
//   3. Ditebak dari nama file, mis. ai3-t2.html → modul "ai3"
//   4. Cadangan: daftar tahap SMP / SMA-SMK
//
// Kalau halaman belum punya tombol #btnKembali, tombolnya dibuatkan. Semua halaman materi cukup memuat file ini
// di akhir <body>:   <script src="/shared/js/materi-back.js"></script>
(function () {

  var path = location.pathname;
  try { path = decodeURIComponent(path); } catch (e) {}

  var grade = /^\/SMK\//i.test(path) ? "smk" : /^\/SMP\//i.test(path) ? "smp" : "";
  if (!grade) return;

  // Kunci materi: tandai materi ini "selesai dibaca" kalau siswa sudah menggulir sampai bawah + cukup lama di halaman.
  // Task yang memakai materi ini baru bisa dimulai setelah itu (lihat /shared/js/materi-gate.js).
  if (!window.MateriGate) {
    var mg = document.createElement("script");
    mg.src = "/shared/js/materi-gate.js?v=20261019";
    document.head.appendChild(mg);
  }

  var home = grade === "smk" ? "/belajar-smk.html" : "/belajar-smp.html";
  var SAFE = /^\/belajar-(smp|smk)\.html(\?[\w=&.%-]*)?$/;     // hanya boleh kembali ke halaman belajar (cegah open-redirect)

  // ---------- tombol ----------
  var btn = document.getElementById("btnKembali");
  if (!btn) {
    btn = document.createElement("a");
    btn.id = "btnKembali";
    btn.setAttribute("style",
      "position:fixed;top:12px;left:12px;z-index:50;text-decoration:none;background:#fff;color:#4361ee;" +
      "padding:8px 14px;border-radius:12px;font-weight:700;font-size:13px;" +
      "box-shadow:0 4px 12px rgba(0,0,0,.12);border:1px solid #e2e8f0;font-family:inherit");
    document.body.insertBefore(btn, document.body.firstChild);
  }

  function aim(href, modul) {
    btn.setAttribute("href", href);
    btn.textContent = modul ? "← Kembali ke Modul" : "← Kembali";
    btn.setAttribute("aria-label", modul ? "Kembali ke halaman modul" : "Kembali ke daftar belajar");
  }

  // ---------- 1. alamat dari halaman modul ----------
  var kb = new URLSearchParams(location.search).get("kembali");
  if (kb && SAFE.test(kb)) { aim(kb, /\?p=/.test(kb)); return; }

  // ---------- 3. tebakan dari nama file (langsung, tanpa menunggu data) ----------
  // (kalau tombol bawaan halaman sudah menunjuk ke sebuah modul, alamat itu dipertahankan)
  var m = /\/([a-z]+\d+)-t\d+\.html$/i.exec(path);
  var bawaan = /\?p=([\w-]+)$/.exec(btn.getAttribute("href") || "");
  if (m) aim(home + "?p=" + m[1].toLowerCase(), true);
  else if (bawaan) aim(home + "?p=" + bawaan[1], true);
  else aim(home, false);

  // ---------- 2. alamat paling tepat dari data kurikulum ----------
  var s = document.createElement("script");
  s.src = grade === "smk" ? "/kurikulum/data/jalur-data-smak.js?v=20261019" : "/kurikulum/data/jalur-data-smp.js?v=20261019";
  s.onload = function () {
    var data = (grade === "smk" ? window.LP_SMAK : window.LP_SMP) || [];
    var low = path.toLowerCase(), found = null;
    data.forEach(function (tr) {
      tr.nodes.forEach(function (n) {
        if (found) return;
        n.tasks.forEach(function (k) {
          if (!found && k.halamanMateri && String(k.halamanMateri).toLowerCase() === low) found = n;
        });
      });
    });
    if (found) aim(home + "?p=" + encodeURIComponent(found.id), true);
  };
  document.head.appendChild(s);

})();
