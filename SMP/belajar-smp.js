// Jalur Belajar SMP (khusus SMP; SMA/SMK ada di belajar-smk.js). ?t=<tahap> = daftar modul tahap itu · ?p=<modul> = daftar task modul (seperti halaman task SD).
(function () {
  const T = window.LP_SMP || [], S = window.SMP, M = window.SMP_META, LP = window.LP, app = document.getElementById("app"), q = new URLSearchParams(location.search);
  const esc = (t) => String(t).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const paintPoints = () => { document.getElementById("pointsValue").textContent = LP.saldo(); };   // saldo = sama dengan dashboard & halaman Poin
  paintPoints();
  const tr = T.find((t) => t.nodes.some((n) => n.id === q.get("p"))), node = tr && tr.nodes.find((n) => n.id === q.get("p"));

    // ============================================================
  // LOAD MATERIAL DARI API
  // ============================================================

  async function loadMaterialsFromAPI() {
    if (!node) return;

    try {
      const response = await fetch(
        "/api/materials/SMP/" + encodeURIComponent(node.id)
      );

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const body = await response.json();
      // server membalas { ok, materials: [...] }; tetap terima array polos kalau formatnya lama
      const materials = Array.isArray(body) ? body : (body.materials || []);

      for (const material of materials) {
        const index = Number(material.lesson_index);
        const task = node.tasks[index];

        if (task && material.path) {
          task.halamanMateri = material.path;
        }
      }

      console.log(
        "Materi API berhasil dimuat:",
        node.id,
        materials.length,
        "halaman"
      );

    } catch (error) {
      console.error(
        "Gagal memuat materi dari API:",
        node.id,
        error
      );
    }
  }

    // ============================================================
  // LOAD TASK DARI API
  // ============================================================

  async function loadTasksFromAPI() {
    if (!node) return;

    try {
      const response = await fetch(
        "/api/tasks/SMP/" + encodeURIComponent(node.id)
      );

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const body = await response.json();
      // server membalas { ok, tasks: [...] }; tetap terima array polos kalau formatnya lama
      const tasks = Array.isArray(body) ? body : (body.tasks || []);

      for (const task of tasks) {
        const index = Number(task.task_index);
        const oldTask = node.tasks[index];

        if (!oldTask) continue;

        // API menjadi sumber baru.
        // Data JS lama tetap menjadi fallback.
        if (typeof task.title === "string") {
          oldTask.judul = task.title;
        }

        if (Array.isArray(task.steps)) {
          oldTask.langkah = task.steps;
        }

        oldTask.project = Boolean(task.is_project);
        oldTask.kumpul = Boolean(task.requires_submission);
      }

      // editor_url berada di level module
      const editorUrl = tasks.find(
        (task) => task.editor_url
      )?.editor_url;

      if (editorUrl) {
        node.urlEditor = editorUrl;
      }

      console.log(
        "Task API berhasil dimuat:",
        node.id,
        tasks.length,
        "task"
      );

    } catch (error) {
      console.error(
        "Gagal memuat task dari API:",
        node.id,
        error
      );
    }
  }

  const crumbs = (a) => '<div class="crumbs">' + a.map((c, i) => (i ? "<span>›</span>" : "") + '<button data-href="' + c[1] + '">' + c[0] + "</button>").join("") + "</div>";
  // Warna ikon/tombol per modul (seperti kartu SD yang tiap kartunya beda warna)
  const COL = ["#4c9aff", "#3fbf7f", "#ff8a5c", "#8f6bff", "#ff6fa5", "#1fb5d6"];
  const col = (t, i) => COL[(T.indexOf(t) * 2 + i) % COL.length];
  // Daftar modul satu tahap: tampilan sama dengan halaman "Pilih pembelajaran" SD (hero, alur, kartu).
  function renderTahap() {
    const only = q.get("t");
    app.innerHTML = T.filter((t) => !only || t.id === only).map((t) => {
      const m = M[t.id], tp = S.track(t), pct = tp.total ? Math.round(tp.done / tp.total * 100) : 0;
      const cards = t.nodes.map((n, i) => { const p = S.prog(n), full = p.total > 0 && p.done === p.total;
        const dots = n.tasks.map((k, j) => { const d = S.isDone(n.id, j); return k.project ? '<i class="trophy ' + (d ? "on" : "") + '">🏆</i>' : '<i class="' + (d ? "on" : "") + '">' + (d ? "✓" : "") + "</i>"; }).join("") + (n.tasks.some((k) => k.project) ? "" : '<i class="trophy ' + (full ? "on" : "") + '">🏆</i>');
        const label = p.done === 0 ? "Mulai belajar" : full ? "Lihat lagi" : "Lanjutkan";
        return '<a class="pcard" href="/belajar-smp.html?p=' + n.id + '" style="--c:' + col(t, i) + '"><div class="pe">' + m.em[i] + "</div><h3>" + esc(n.title) + "</h3><p>" + esc(n.deskripsi) + '</p><div class="dots">' + dots + '</div><div class="pcount">' + p.done + " dari " + p.total + " task" + (full ? " • Selesai!" : "") + '</div><span class="go">' + label + " →</span></a>"; }).join("");
      return '<section class="smp-tahap"><div class="tahap-hero ' + m.cls + '"><h1>' + esc(m.n) + "</h1><p>Untuk siswa usia " + (m.usia || "12–15 tahun") + ". " + esc(m.slogan) + '</p><div class="bar"><i style="width:' + pct + '%"></i></div><div class="bar-text">' + tp.done + " dari " + tp.total + " langkah selesai</div></div>" +
        '<div class="flow"><b>' + esc(m.n.split(" — ")[0]) + "</b><span>→</span><b>📚 Pilih Pembelajaran</b><span>→</span><b>🧩 Task</b><span>→</span><b>✅ Tandai Selesai</b></div>" +
        '<h2 class="sec-title">📚 Pilih pembelajaran</h2><div class="pgrid">' + cards + "</div></section>"; }).join("");
    window.scrollTo(0, 0);
  }
  let lastBtn = null;
  // Tombol materi: tiap task punya halamanMateri (diisi di jalur-data-*.js). Kalau kosong → tampil "segera hadir".
  const mhref = (k) => k.halamanMateri + (k.halamanMateri.indexOf("?") > -1 ? "&" : "?") + "kembali=" + encodeURIComponent("/belajar-smp.html?p=" + node.id);
  const matBtn = (k, op) => !op || k.kumpul ? "" : k.halamanMateri ? '<a class="btn ghost mlink" href="' + esc(mhref(k)) + '">📺 Materi</a>' : '<button class="btn grey mlink" type="button" disabled title="Materi segera hadir">📺 Segera hadir</button>';
  const matCard = (k) => k.kumpul ? "" : k.halamanMateri ? '<a class="materi-link" href="' + esc(mhref(k)) + '"><span class="ml-icon">📺</span><span class="ml-text"><b>Lihat Materi</b><small>Belajar dulu sebelum mengerjakan</small></span><span class="ml-go">→</span></a>' : '<div class="materi-link soon" aria-disabled="true"><span class="ml-icon">📺</span><span class="ml-text"><b>Materi segera hadir</b><small>Materi untuk task ini sedang disiapkan</small></span></div>';

  // Alamat editor untuk satu task. Panel task di editor membaca ?smp=<modul>&t=<nomor task>.
  const edHref = (i) => node.urlEditor + "?smp=" + node.id + "&t=" + i;
  // "Mulai →" LANGSUNG membuka editor (bukan popup). Popup hanya untuk Kumpulkan Final Project, karena butuh form link/catatan.
  const startBtn = (k, i, op, dn) => !op ? '<button class="btn grey" type="button" disabled>🔒 Terkunci</button>'
    : k.kumpul ? '<button class="btn ' + (dn ? "ghost" : "green") + '" type="button" data-k="' + i + '">' + (dn ? "Lihat pengumpulan" : "📤 Kumpulkan →") + "</button>"
    : '<a class="btn ' + (dn ? "ghost" : "green") + '" href="' + esc(edHref(i)) + '">' + (dn ? "Ulangi" : "Mulai →") + "</a>";

  function render() {
    if (!node) return renderTahap();
    const m = M[tr.id], idx = tr.nodes.indexOf(node), p = S.prog(node), pct = Math.round(p.done / p.total * 100), cur = node.tasks.findIndex((_, i) => !S.isDone(node.id, i)), mc = col(tr, idx);
    app.innerHTML = crumbs([[esc(tr.nama), "/belajar-smp.html?t=" + tr.id], [m.em[idx] + " " + esc(node.title), "#"]]) +
      '<div style="--c:' + mc + '"><div class="phead"><div class="pe">' + m.em[idx] + "</div><div><h2>" + esc(node.title) + "</h2><p>" + esc(node.deskripsi) + " Pertemuan " + node.pertemuan + " • " + esc(node.level) + '</p><div class="bar"><i style="width:' + pct + '%"></i></div><div class="bar-text">' + p.done + " dari " + p.total + " task selesai</div></div></div>" +
      '<section class="tcard"><h3>📖 Ringkasan &amp; Teori Singkat</h3><p class="desc">' + esc(node.ringkasan) + "</p><ul>" + node.teori.map((s) => "<li>" + esc(s) + "</li>").join("") + '</ul><div class="chips">' + node.materi.map((s) => '<span class="chip">' + esc(s) + "</span>").join("") + "</div></section>" +
      '<div class="path">' + node.tasks.map((k, i) => { const dn = S.isDone(node.id, i), op = i === 0 || S.isDone(node.id, i - 1), cu = i === cur;
        return '<div class="node ' + (dn ? "done " : "") + (!op ? "locked " : "") + (cu ? "current" : "") + '"><div class="circle">' + (!op ? "🔒" : dn ? "✓" : i + 1) + '</div><div class="ncard"><div><div class="nlabel">' + (k.kumpul ? "🏆 KUMPULKAN FINAL PROJECT" : k.project ? "🏆 PROJECT AKHIR" : "TASK " + (i + 1)) + (cu ? " • 👉 AYO MULAI!" : "") + "</div><h3>" + esc(k.judul) + "</h3><p>" + k.langkah.length + " langkah praktik</p></div>" +
          '<div class="nacts">' + matBtn(k, op) + startBtn(k, i, op, dn) + "</div></div></div>"; }).join("") + "</div></div>";
  }
  function modal(i) {
    const k = node.tasks[i], ov = document.createElement("div"); ov.className = "smp-overlay";
    const sk = "proj:" + node.id + ":" + i;   // kunci simpanan link/catatan pengumpulan
    const draw = () => { const dn = S.isDone(node.id, i), sub = k.kumpul ? LP.upload(sk) : {};
      ov.innerHTML = '<div class="smp-modal" role="dialog" aria-modal="true" aria-labelledby="mt" style="--c:' + col(tr, tr.nodes.indexOf(node)) + '"><button class="xbtn" data-x aria-label="Tutup">✕</button><h2 id="mt">' + (k.kumpul ? "Kumpulkan Final Project" : k.project ? "Project Akhir" : "Task " + (i + 1)) + ": " + esc(k.judul) + '</h2><p class="sub">' + esc(node.title) + " • Pertemuan " + node.pertemuan + "</p>" +
        "<h3>📖 Ringkasan &amp; Teori Singkat</h3><p>" + esc(node.ringkasan) + "</p><ul>" + node.teori.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>" +
        matCard(k) + "<h3>🛠️ Instruksi Praktik</h3><ol>" + k.langkah.map((s) => "<li><b>Langkah " + (k.langkah.indexOf(s) + 1) + ":</b> " + esc(s) + "</li>").join("") + "</ol>" + (k.kumpul ? '<h3>📤 Kumpulkan Final Project</h3><label class="kf">Link karya (boleh dikosongkan jika mengisi catatan)<input type="url" data-f="link" placeholder="https://..." value="' + esc(sub.link || "") + '"></label><label class="kf">Catatan tentang karyamu<textarea data-f="note" rows="3" placeholder="Ceritakan singkat karya yang kamu kumpulkan">' + esc(sub.note || "") + '</textarea></label><p class="warn" data-warn hidden>⚠️ Isi link karya atau catatan dulu sebelum mengumpulkan.</p>' : "") + 
        '<a class="btn" href="' + esc(edHref(i)) + '">Buka Editor ' + (node.urlEditor.indexOf("3D") > -1 ? "3D 🧊" : "💻") + '</a><div class="mfoot"><button class="btn ' + (dn ? "ghost" : "green") + '" data-done>' + (dn ? "↩ Batalkan selesai" : k.kumpul ? "📤 Kumpulkan sekarang" : "✓ Tandai task selesai") + '</button><button class="btn ghost" data-x>Tutup</button></div></div>'; };
    const close = () => { document.removeEventListener("keydown", key); ov.remove(); if (lastBtn && document.contains(lastBtn)) lastBtn.focus(); };
    const key = (e) => { if (e.key === "Escape") close(); else if (e.key === "Tab") { const f = [...ov.querySelectorAll("a,button")]; if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); } } };
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-x]")) close(); else if (e.target.closest("[data-done]")) { if (k.kumpul && !S.isDone(node.id, i)) { const u = LP.upload(sk); if (!String(u.link || "").trim() && !String(u.note || "").trim()) { ov.querySelector("[data-warn]").hidden = false; return; } } S.toggle(node.id, i); draw(); render(); ov.querySelector("[data-done]").focus(); } });
    ov.addEventListener("input", (e) => { const fl = e.target.dataset && e.target.dataset.f; if (!fl) return; LP.saveUpload(sk, { [fl]: e.target.value }); const w = ov.querySelector("[data-warn]"); if (w) w.hidden = true; });
    draw(); document.body.appendChild(ov); document.addEventListener("keydown", key); ov.querySelector(".xbtn").focus();
  }
  app.addEventListener("click", (e) => { const c = e.target.closest("[data-href]"), b = e.target.closest("[data-k]"); if (c && c.dataset.href !== "#") location.href = c.dataset.href; else if (b && !b.disabled) { lastBtn = b; modal(+b.dataset.k); } });
      async function init() {
    const sync = LP.loadFromServer().catch(() => false);   // ambil poin & progres terbaru dari server
    await loadMaterialsFromAPI();
    await loadTasksFromAPI();
    await sync;
    paintPoints();
    render();
  }

  init();

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      paintPoints();
      init();
    }
  });
})();
