// ============================================================
// PENJAGA EDITOR — gerbang materi untuk Block Editor, Text Editor, dan 3D Editor
//
// Editor bisa dibuka langsung lewat alamat, misalnya:
//   /tools/TextEditor/index.html?task=g1-t1        (task SD)
//   /tools/TextEditor/index.html?smp=py1&t=0       (task SMP / SMA-SMK)
// Kalau materi task itu belum dibaca sampai selesai, editor ditutup layar
// "Baca materinya dulu ya!" dengan tombol menuju halaman materinya.
//
// Tanpa ?task= / ?smp= (mode bebas) editor tetap terbuka seperti biasa.
// Ini lapisan tampilan. Penolakan yang sebenarnya ada di LP.complete / LP.completeSmp
// (kurikulum/core/jalur-belajar.js), jadi poin tidak bisa didapat tanpa membaca materi.
//
// Dimuat di akhir <body> editor, SESUDAH jalur-data.js dan jalur-belajar.js:
//   <script src="/shared/js/materi-guard.js"></script>
// ============================================================
(function () {
  var q = new URLSearchParams(location.search);
  var sdId = q.get("task"), nid = q.get("smp"), reqT = parseInt(q.get("t"), 10) || 0;
  if (!sdId && !nid) return;

  function esc(t) { return String(t).replace(/[&<>"]/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]; }); }
  function load(src, cb) {
    var s = document.createElement("script");
    s.src = src; s.onload = cb; s.onerror = cb;
    document.head.appendChild(s);
  }

  // tunggu sampai LP + data jenjang tersedia (maksimal ±4 detik), lalu periksa
  var tries = 0;
  (function tunggu() {
    var siap = window.LP && typeof window.LP.materiTerkunci === "function" && (sdId || (window.LP_SMP && window.LP_SMAK));
    if (siap) return periksa();
    if (++tries === 8 && window.LP && nid) {            // data SMP/SMAK belum ada → muat sendiri
      load("/kurikulum/data/jalur-data-smp.js?v=1", function () { load("/kurikulum/data/jalur-data-smak.js?v=1", tunggu); });
      return;
    }
    if (tries < 16) setTimeout(tunggu, 250);
  })();

  function periksa() {
    var LP = window.LP, task, judul, kembali, terkunci = false;

    if (sdId) {
      var f = LP.find(sdId);
      if (!f) return;
      task = f.task; judul = f.task.title;
      kembali = "/belajar.html?task=" + f.task.id;
      terkunci = LP.materiTerkunciId(sdId);
      var keJalur = "/belajar.html?p=" + f.pemb.id;
    } else {
      var tr = [].concat(window.LP_SMP || [], window.LP_SMAK || []).filter(function (t) { return t.nodes.some(function (n) { return n.id === nid; }); })[0];
      if (!tr) return;
      var node = tr.nodes.filter(function (n) { return n.id === nid; })[0];
      var halaman = tr.grade === "smak" ? "/belajar-smk.html" : "/belajar-smp.html";
      // task aktif = aturan yang sama dengan panel task: mundur ke task yang sudah terbuka
      var done = LP._get("smpTasks", {}), ti = Math.min(Math.max(reqT, 0), node.tasks.length - 1);
      while (ti > 0 && !done[nid + ":" + (ti - 1)]) ti--;
      task = node.tasks[ti]; judul = task.judul || ("Task " + (ti + 1));
      kembali = halaman + "?p=" + encodeURIComponent(nid);
      keJalur = kembali;
      terkunci = LP.materiTerkunciSmp(nid, ti);
    }
    if (!terkunci) return;

    var ov = document.createElement("div");
    ov.id = "materiGuard";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("style", "position:fixed;inset:0;z-index:2147483600;background:rgba(15,23,42,.94);display:grid;place-items:center;padding:20px;font-family:'Plus Jakarta Sans','Trebuchet MS',Arial,sans-serif");
    ov.innerHTML =
      '<div style="background:#fff;color:#1e293b;max-width:420px;width:100%;border-radius:22px;padding:28px 24px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.4)">' +
        '<div style="font-size:56px;line-height:1">📖</div>' +
        '<h2 style="margin:10px 0 6px;font-size:22px">Baca materinya dulu ya!</h2>' +
        '<p style="margin:0 0 18px;line-height:1.55;color:#475569">Task <b>' + esc(judul) + '</b> baru bisa dikerjakan setelah kamu membaca materinya <b>sampai selesai</b>.</p>' +
        '<a href="' + esc(LP.materiHref(task, kembali)) + '" style="display:block;background:#10b981;color:#fff;text-decoration:none;font-weight:800;padding:13px;border-radius:14px;margin-bottom:10px">Baca Materi 📖</a>' +
        '<a href="' + esc(keJalur) + '" style="display:block;color:#4361ee;text-decoration:none;font-weight:700;padding:8px">← Kembali ke jalur belajar</a>' +
      '</div>';
    document.body.appendChild(ov);
    var utama = ov.querySelector("a");
    if (utama) utama.focus();
  }
})();
