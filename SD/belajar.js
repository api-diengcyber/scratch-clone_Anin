(async function () {

  const authToken = localStorage.getItem("authToken");

  if (!authToken) {
    window.location.replace("/index.html");
    return;
  }

  try {
    const response = await fetch("/api/auth/me", {
      headers: {
        Authorization: "Bearer " + authToken
      }
    });

    if (!response.ok) {
      localStorage.removeItem("isLoggedIn");
      localStorage.removeItem("username");
      localStorage.removeItem("scratch_user");
      localStorage.removeItem("authToken");

      window.location.replace("/index.html");
      return;
    }

    const user = await response.json();

    localStorage.setItem("username", user.username);
    localStorage.setItem("scratch_user", user.username);
    localStorage.setItem("isLoggedIn", "true");

    // Samakan koin & progres dengan server (sama seperti dashboard dan halaman Koin)
    if (typeof LP !== "undefined" && typeof LP.loadFromServer === "function") {
      await LP.loadFromServer();
    }

  } catch (error) {
    console.error("Gagal memeriksa sesi:", error);
    window.location.replace("/index.html");
    return;
  }

  const app = document.getElementById("app");
  let tahap = LP.tahap[0];                         // tahap yang sedang dibuka (berubah sesuai task / jalur)
  const $points = document.getElementById("pointsValue");
  // Tampilkan saldo koin (total koin − hadiah yang dibeli), sama dengan dashboard & halaman Koin
  const refreshPoints = () => { $points.textContent = LP.saldo(); };
  const esc = window.DCUtils.esc;
  refreshPoints();

  // ---------- POPUP (berhasil / gagal / info — satu desain) ----------
  function popup(o) {
    const old = document.querySelector(".mission-overlay");
    if (old) old.remove();
    const ov = document.createElement("div");
    ov.className = "mission-overlay";
    ov.innerHTML =
      '<div class="mission-popup ' + (o.type || "ok") + '">' +
        '<div class="mp-emoji">' + o.emoji + "</div>" +
        "<h2>" + esc(o.title) + "</h2>" +
        (o.name ? '<p class="mp-name">' + esc(o.name) + "</p>" : "") +
        (o.html || "") +
        (o.unmet && o.unmet.length ? '<ul class="mp-unmet">' + o.unmet.map((u) => "<li>" + esc(u) + "</li>").join("") + "</ul>" : "") +
        '<div class="mp-actions"></div>' +
      "</div>";
    const box = ov.querySelector(".mp-actions");
    (o.buttons || []).forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = b.cls || "mp-secondary";
      btn.textContent = b.label;
      btn.addEventListener("click", () => { ov.remove(); if (b.fn) b.fn(); });
      box.appendChild(btn);
    });
    document.body.appendChild(ov);
  }

  // ---------- GERBANG MATERI ----------
  // Task baru boleh dikerjakan setelah halaman materinya dibaca sampai selesai (dicatat oleh shared/js/materi-gate.js).
  const materiBack = (t) => "/belajar.html?task=" + t.id;
  function popupMateri(t) {
    popup({ type: "info", emoji: "📖", title: "Baca materinya dulu ya!",
      html: '<p class="mp-info">Task <b>' + esc(t.title) + '</b> baru bisa dikerjakan kalau kamu sudah membaca materinya <b>sampai selesai</b>.</p>',
      buttons: [{ label: "Baca Materi 📖", cls: "mp-primary", fn: () => { window.location.href = LP.materiHref(t, materiBack(t)); } },
                { label: "Nanti saja", cls: "mp-secondary" }] });
  }

  // ---------- 1. PETA TAHAP ----------
  function showTahap() {
    if (tahap.mode === "pilih-jalur") return showJalur();   // Tahap 2: anak memilih satu jalur
    const prog = LP.progressOfTahap(tahap);
    const pct = Math.round((prog.done / prog.total) * 100);

    const cards = tahap.pembelajaran.map((pb) => {
      const p = LP.progressOf(pb);
      const dots = pb.tasks.map((t) => '<i class="' + (LP.isDone(t.id) ? "on" : "") + '">' + (LP.isDone(t.id) ? "✓" : "") + "</i>").join("") +
                   '<i class="trophy ' + (p.projectDone ? "on" : "") + '">🏆</i>';
      const label = p.done === 0 ? "Mulai belajar" : p.done === p.total ? "Lihat lagi" : "Lanjutkan";
      return '<button class="pcard" data-p="' + pb.id + '" style="--c:' + pb.warna + '">' +
        '<div class="pe">' + pb.emoji + "</div><h3>" + esc(pb.judul) + "</h3><p>" + esc(pb.desc) + "</p>" +
        '<div class="dots">' + dots + "</div>" +
        '<div class="pcount">' + p.taskDone + " dari " + pb.tasks.length + " task" + (p.projectDone ? " • Project selesai!" : "") + "</div>" +
        '<span class="go">' + label + " →</span></button>";
    }).join("");

    app.innerHTML =
      '<div class="tahap-hero' + (tahap.no === 2 ? ' t2' : '') + '">' +
        "<h1>" + esc(tahap.nama) + "</h1>" +
        "<p>Untuk anak usia " + esc(tahap.usia) + ". " + esc(tahap.desc) + "</p>" +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="bar-text">' + prog.done + " dari " + prog.total + " langkah selesai</div></div>" +
      '<div class="flow"><b>Tahap ' + tahap.no + '</b><span>→</span><b>📚 Pilih Pembelajaran</b><span>→</span><b>🧩 Task 1–5</b><span>→</span><b>🏆 Project Akhir</b><span>→</span><b>📤 Submit</b></div>' +
      '<h2 class="sec-title">📚 Pilih pembelajaran</h2><div class="pgrid">' + cards + "</div>";

    app.querySelectorAll(".pcard").forEach((c) => c.addEventListener("click", () => showPemb(c.dataset.p)));
    window.scrollTo(0, 0);
  }

  // ---------- 1b. PILIH JALUR (Tahap 2) ----------
  function showJalur() {
    const chosen = LP.chosen(tahap.id);
    const cards = tahap.pembelajaran.map((pb) => {
      const p = LP.progressOf(pb);
      const dots = pb.tasks.map((t) => '<i class="' + (LP.isDone(t.id) ? "on" : "") + '">' + (LP.isDone(t.id) ? "✓" : "") + "</i>").join("") +
                   '<i class="trophy ' + (p.projectDone ? "on" : "") + '">🏆</i>';
      const label = p.done === 0 ? "Pilih jalur ini" : p.done === p.total ? "Lihat lagi" : "Lanjutkan";
      const topik = pb.topik.map((t) => "<li>" + esc(t) + "</li>").join("");
      return '<button class="jcard' + (chosen === pb.id ? " mine" : "") + '" type="button" data-p="' + pb.id + '" style="--c:' + pb.warna + '">' +
        (chosen === pb.id ? '<span class="j-chip">⭐ Jalurmu</span>' : "") +
        '<div class="j-emoji">' + pb.emoji + "</div><h3>" + esc(pb.judul) + '</h3><p class="j-tag">“' + esc(pb.tagline) + "”</p>" +
        '<ul class="j-topics">' + topik + "</ul>" +
        '<div class="dots">' + dots + "</div>" +
        '<div class="pcount">' + p.taskDone + " dari " + pb.tasks.length + " task" + (p.projectDone ? " • Project selesai!" : "") + "</div>" +
        '<span class="go">' + label + " →</span></button>";
    }).join("");

    app.innerHTML =
      '<div class="tahap-hero t2">' +
        "<h1>" + esc(tahap.nama) + "</h1>" +
        "<p>Untuk anak usia " + esc(tahap.usia) + ". Pilih satu jalur yang paling kamu suka. Kamu boleh ganti jalur kapan saja, progresmu tetap tersimpan!</p></div>" +
      '<div class="flow"><b>Tahap 2</b><span>→</span><b>🧭 Pilih Jalur</b><span>→</span><b>🧩 Task 1–5</b><span>→</span><b>🏆 Project Akhir</b><span>→</span><b>📤 Submit</b></div>' +
      '<h2 class="sec-title">🧭 Pilih jalurmu</h2><div class="jgrid">' + cards + "</div>";

    app.querySelectorAll(".jcard").forEach((c) => c.addEventListener("click", () => showPemb(c.dataset.p)));
    window.scrollTo(0, 0);
  }

  // ---------- label status & koin (dipakai di daftar task dan detail task) ----------
  function statusChip(t) {
    if (t.type === "project" && LP.isUnlocked(t.id)) {          // Project Akhir: Belum dikerjakan / Sedang dikerjakan / Sudah dikumpulkan
      const ps = LP.projectStatus(t.id), pst = LP.PROJECT_STATUS[ps];
      return '<span class="badge st-' + ps + '">' + pst.icon + " " + pst.nama + "</span>";
    }
    const st = LP.status(t.id), s = LP.STATUS[st];
    return '<span class="badge st-' + st + '">' + s.icon + " " + s.nama + "</span>";
  }
  function toolChip(t) {
    const ed = LP.editorOf(t);
    if (ed) return '<span class="badge tool">' + ed.icon + " " + ed.nama + "</span>";
    const pr = LP.praktikOf(t);                                  // kuis/external yang punya praktik di editor atau aktivitas nyata
    return pr && pr.key !== "external" ? '<span class="badge tool">' + pr.icon + " " + pr.nama + "</span>" : "";
  }

  // ---------- 🚀 MULAI PRAKTIK (block → Block Editor, text → Text Editor, external/physical → petunjuk) ----------
  function praktikBox(t, pb) {
    const pr = LP.praktikOf(t);
    if (!pr) return "";
    const u = LP.upload(t.id), app = esc(LP.aplikasiOf(t, pb));
    const info = pr.key === "text" ? "Buka <b>Text Editor</b> untuk menulis kode HTML dan CSS. Hasilnya langsung terlihat di sebelah kanan. Kalau sudah, kembali ke halaman ini."
      : pr.key === "block" ? "Buka <b>Block Editor</b> untuk menyusun blok. Kalau sudah, kembali ke halaman ini."
      : pr.key === "physical" ? "Siapkan bahan-bahannya dan buat karyamu langsung. Kalau sudah, kembali ke halaman ini."
      : "Buka <b>" + app + "</b> dan ikuti langkah-langkah di bawah. Kalau sudah, kembali ke halaman ini.";
    const label = pr.folder ? (u.mulai ? "Lanjutkan Praktik di " + pr.nama + " ▶" : "🚀 Mulai Praktik") : (u.mulai ? "✅ Praktik sudah dimulai" : "🚀 Mulai Praktik");
    return '<div class="box mulai"><h4>' + pr.icon + " Praktik: " + (pr.key === "external" ? app : pr.nama) + '</h4><p class="mp-info" style="text-align:left;margin-top:0">' + info + "</p>" +
      '<button type="button" class="btn green" id="praktikBtn">' + label + "</button></div>";
  }
  function bindPraktik(f) {
    const btn = document.getElementById("praktikBtn"), pr = LP.praktikOf(f.task);
    if (!btn || !pr) return;
    btn.addEventListener("click", () => {
      LP.saveUpload(f.task.id, { mulai: true });
      if (pr.folder) { window.location.href = LP.praktikHref(f.task.id, false); return; }   // block / text → buka editor
      btn.textContent = "✅ Praktik sudah dimulai";                                          // external / physical → petunjuk + checklist
      const app = esc(LP.aplikasiOf(f.task, f.pemb));
      popup({ type: "info", emoji: pr.icon, title: "Selamat berpraktik!",
        html: '<p class="mp-info">' + (pr.key === "physical"
          ? "Siapkan bahan dan kerjakan langkah-langkah di bawah. Kalau sudah, foto karyamu, lalu centang checklist."
          : "Buka <b>" + app + "</b> dan ikuti langkah-langkahnya. Kalau sudah, kembali ke halaman ini lalu centang checklist.") + "</p>",
        buttons: [{ label: "Siap!", cls: "mp-primary", fn: () => { const el = document.getElementById("stepsBox"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); } }] });
    });
  }
  function pointChip(t) { return '<span class="badge pts">⭐ ' + LP.poinOf(t) + " koin</span>"; }
  function listBox(title, items, cls, tag) {
    if (!items || !items.length) return "";
    tag = tag || "ul";
    return '<div class="box ' + (cls || "") + '"><h4>' + title + "</h4><" + tag + ">" + items.map((i) => "<li>" + esc(i) + "</li>").join("") + "</" + tag + "></div>";
  }

  // ---------- 2. JALUR SATU PEMBELAJARAN ----------
  function findPemb(id) {
    for (const th of LP.tahap) { const pb = th.pembelajaran.find((p) => p.id === id); if (pb) return pb; }
    return null;
  }
  function tahapOf(pb) { return LP.tahap.find((th) => th.pembelajaran.includes(pb)); }
  function tahapCrumb() { return { go: "tahap", text: "Tahap " + tahap.no }; }

  function crumbs(parts) {
    return '<div class="crumbs">' + parts.map((p, i) => (i ? "<span>›</span>" : "") +
      '<button type="button" data-go="' + p.go + '">' + p.text + "</button>").join("") + "</div>";
  }
  function bindCrumbs(pbId) {
    app.querySelectorAll(".crumbs button").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.go === "tahap") showTahap(); else showPemb(pbId);
    }));
  }

  function showPemb(pbId) {
    const pb = findPemb(pbId);
    if (!pb) return showTahap();
    tahap = tahapOf(pb);
    if (tahap.mode === "pilih-jalur") LP.choose(tahap.id, pb.id);   // ingat jalur yang dipilih
    const p = LP.progressOf(pb);
    const pct = Math.round((p.done / p.total) * 100);
    const items = LP.items(pb);

    const nodes = items.map((t) => {
      const done = LP.isDone(t.id);
      const open = LP.isUnlocked(t.id);
      const current = !done && open;
      const isProject = t.type === "project";
      const tipe = LP.TIPE[t.type];
      const cls = ["node", done ? "done" : "", !open ? "locked" : "", current ? "current" : "", isProject ? "trophy" : ""].join(" ");
      const circle = !open ? "🔒" : isProject ? (done ? "✓" : "🏆") : (done ? "✓" : t.no);
      const label = isProject ? "PROJECT AKHIR" : "TASK " + t.no + " • " + t.label.toUpperCase();
      const mKunci = open && LP.materiTerkunciId(t.id);   // materi belum dibaca sampai selesai
      const btn = !open ? '<button class="btn grey" data-id="' + t.id + '">🔒 Terkunci</button>'
        : mKunci ? '<button class="btn green" data-id="' + t.id + '">📖 Baca materi dulu</button>'
        : done ? '<button class="btn ghost" data-id="' + t.id + '">' + (isProject ? "Lihat Project" : "Ulangi") + "</button>"
        : '<button class="btn ' + (isProject ? "gold" : "green") + '" data-id="' + t.id + '">' + (isProject ? (LP.projectStatus(t.id) === "dikerjakan" ? "Lanjutkan Project 🏆" : "Mulai Project 🏆") : "Mulai →") + "</button>";
      // tombol materi (opsional): hanya task yang punya `halamanMateri` di jalur-data.js, dan hanya kalau task sudah terbuka
      const materiBtn = (t.halamanMateri && open && !mKunci) ? '<a class="btn ghost mlink" href="' + esc(LP.materiHref(t, materiBack(t))) + '">📺 Materi</a>' : "";
      return '<div class="' + cls + '"><div class="circle">' + circle + "</div>" +
        '<div class="ncard"><div><div class="nlabel">' + label + (current ? " • 👉 AYO MULAI!" : "") + "</div>" +
        "<h3>" + esc(t.title) + "</h3><p>" + esc(t.desc) + "</p>" +
        '<span class="badge">' + tipe.icon + " " + tipe.nama + "</span>" + toolChip(t) + statusChip(t) + pointChip(t) + "</div>" + '<div class="nacts">' + materiBtn + btn + "</div></div></div>";
    }).join("");

    app.innerHTML =
      crumbs([tahapCrumb(), { go: "pemb", text: pb.emoji + " " + esc(pb.judul) }]) +
      '<div style="--c:' + pb.warna + '">' +
      '<div class="phead"><div class="pe">' + pb.emoji + "</div><div><h1>" + esc(pb.judul) + "</h1><p>" + esc(pb.desc) + "</p>" +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="bar-text">' + p.done + " dari " + p.total + " selesai</div></div>" +
        (tahap.mode === "pilih-jalur" ? '<button class="btn ghost swap" id="swapBtn" type="button">🔄 Ganti jalur</button>' : "") + "</div>" +
      '<div class="path">' + nodes + "</div></div>";

    bindCrumbs(pbId);
    const swap = document.getElementById("swapBtn");
    if (swap) swap.addEventListener("click", showTahap);
    app.querySelectorAll(".node .btn[data-id]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.id;
      if (!LP.isUnlocked(id)) {
        const f = LP.find(id);
        const prev = LP.items(f.pemb)[f.index - 1];
        return popup({ type: "info", emoji: "🔒", title: "Masih terkunci!",
          html: '<p class="mp-info">Selesaikan <b>' + esc(prev.type === "project" ? "Project" : "Task " + prev.no) + " — " + esc(prev.title) + "</b> dulu ya, baru ini terbuka.</p>",
          buttons: [{ label: "Oke, mengerti", cls: "mp-primary" }] });
      }
      openItem(id);
    }));
    window.scrollTo(0, 0);
  }

  // task yang memakai editor (Block Editor / Text Editor) dibuka di halaman editornya; selain itu dibuka di sini
  function openItem(id) {
    if (LP.materiTerkunciId(id)) return popupMateri(LP.find(id).task);     // gerbang materi
    if (LP.editorOf(LP.find(id).task)) window.location.href = LP.href(id, false);
    else showTask(id);
  }

  // ---------- 3. DETAIL TASK ----------
  function showTask(id) {
    const f = LP.find(id);
    if (!f) return showTahap();
    tahap = f.tahap;
    if (!LP.isUnlocked(id)) return showPemb(f.pemb.id);
    if (LP.materiTerkunciId(id)) { showPemb(f.pemb.id); return popupMateri(f.task); }   // gerbang materi
    const t = f.task, pb = f.pemb, tipe = LP.TIPE[t.type], done = LP.isDone(id);
    const saved = LP.upload(id);
    if (!done && t.type !== "project" && LP.mulaiTask) LP.mulaiTask(id);   // mulai hitung waktu pengerjaan
    const isProject = t.type === "project";
    let body = "";

    const kond = LP.kondisi(t);
    const kondBox = kond
      ? '<div class="box ok"><h4>✅ Berhasil jika</h4>' + esc(kond.sukses) + "</div>" +
        '<div class="box bad"><h4>❌ Belum berhasil jika</h4>' + esc(kond.gagal) + "</div>"
      : "";
    // Tombol ke halaman materi (opsional): hanya muncul kalau task punya field `halamanMateri` di jalur-data.js
    const materiLink = t.halamanMateri
      ? '<a class="materi-link" href="' + esc(LP.materiHref(t, materiBack(t))) + '"><span class="ml-icon">📺</span><span class="ml-text"><b>Lihat Materi</b><small>Belajar dulu sebelum mengerjakan</small></span><span class="ml-go">→</span></a>'
      : "";
    const materiBox = listBox("📖 Yang akan kamu pelajari", t.materi, "materi") + materiLink;

    const ed = LP.editorOf(t);
    if (ed) {
      body += materiBox + '<div class="box tip"><h4>' + (t.kind === "editor" ? "🚩" : ed.icon) + ' Cara mengerjakan</h4><ol>' + ed.cara.map((c) => "<li>" + c + "</li>").join("") + "</ol></div>" +
              '<div class="box"><h4>💡 Petunjuk</h4>' + esc(t.hint) + "</div>" + kondBox;
    } else if (t.kind === "quiz") {
      body += materiBox + praktikBox(t, pb) + kondBox + t.quiz.map((q, qi) => '<div class="q"><b>' + (qi + 1) + ". " + esc(q.q) + "</b>" +
        q.options.map((o, oi) => '<label class="opt"><input type="radio" name="q' + qi + '" value="' + oi + '"> ' + esc(o) + "</label>").join("") + "</div>").join("");
    } else if (isProject) {
      body += projectBody(t, pb, saved);
    } else {
      if (isProject) body += '<div class="box goal"><h4>🎯 Tujuan project</h4>' + esc(t.tujuan || t.desc) + "</div>";
      body += materiBox + praktikBox(t, pb) +
        '<div class="box" id="stepsBox"><h4>📝 Langkah-langkah</h4><ol>' + t.steps.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ol></div>" +
        '<div class="box"><h4>✅ Checklist ' + (isProject ? "Project" : "") + "</h4>" +
        t.checklist.map((c) => '<label class="check"><input type="checkbox"> ' + esc(c) + "</label>").join("") + "</div>";
      if (isProject) {
        body += '<div class="box tip">💡 Ingat: kamu boleh memakai lagi semua yang sudah dipelajari di <b>Task 1–' + pb.tasks.length + "</b>!</div>" +
                listBox("📮 Cara mengumpulkan hasil", LP.kumpul(t), "kumpul", "ol");
      }
      body += '<div class="box upload"><h4>📸 ' + (isProject ? "Hasil karyamu" : "Foto hasilmu (boleh dilewati)") + "</h4>" +
        '<input type="file" accept="image/*" id="fileInput">' +
        '<img class="preview" id="preview" ' + (saved.img ? 'src="' + saved.img + '"' : 'style="display:none"') + ' alt="">' +
        (isProject ? '<div style="margin-top:10px">🔗 Link project (jika ada)</div><input type="text" id="linkInput" placeholder="Tempel link di sini" value="' + esc(saved.link || "") + '">' : "") + "</div>";
    }

    const mainBtn = ed ? '<button class="btn green" id="mainBtn">' + ed.tombol + "</button>"
      : t.kind === "quiz" ? '<button class="btn green" id="mainBtn">Periksa Jawaban ✅</button>'
      : isProject ? '<button class="btn gold" id="mainBtn">' + (done ? "Perbarui Pengumpulan 📤" : "Kumpulkan Project 📤") + "</button>"
      : '<button class="btn green" id="mainBtn">Sudah selesai ✅</button>';

    app.innerHTML =
      crumbs([tahapCrumb(), { go: "pemb", text: pb.emoji + " " + esc(pb.judul) }, { go: "task", text: isProject ? "🏆 Project" : "🧩 Task " + t.no }]) +
      '<div class="tcard" style="--c:' + pb.warna + '">' +
        '<div class="nlabel">' + (isProject ? "PROJECT AKHIR" : "TASK " + t.no + " • " + t.label.toUpperCase()) + "</div>" +
        "<h1>" + esc(t.title) + '</h1><span class="badge">' + (isProject ? LP.JENIS[LP.jenisOf(t)].icon + " " + LP.JENIS[LP.jenisOf(t)].nama + " — " + LP.JENIS[LP.jenisOf(t)].info : tipe.icon + " " + tipe.nama + " — " + tipe.info) + "</span>" + toolChip(t) +
          (isProject ? '<span id="pStatus">' + statusChip(t) + "</span>" : statusChip(t)) + pointChip(t) +
        (isProject && t.lencana ? '<span class="badge reward">' + esc(t.lencana) + "</span>" : "") +
        '<p class="desc" style="margin-top:12px">' + esc(t.desc) + "</p>" +
        (done ? (isProject
          ? '<div class="done-note">📤 Project sudah dikumpulkan' + (saved.tgl ? " pada " + new Date(saved.tgl).toLocaleString("id-ID") : "") + '. Kamu boleh memperbarui hasilnya, tapi koin tidak bertambah.</div>'
          : '<div class="done-note">✅ Task ini sudah selesai! Mengulang tidak memberi koin tambahan.</div>') : "") +
        body + '<div class="actions">' + mainBtn + '<button class="btn ghost" id="backBtn">← Kembali ke jalur</button></div></div>';

    // crumbs "task" tidak perlu pindah halaman
    app.querySelectorAll(".crumbs button").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.go === "tahap") showTahap(); else if (b.dataset.go === "pemb") showPemb(pb.id);
    }));
    document.getElementById("backBtn").addEventListener("click", () => showPemb(pb.id));
    document.getElementById("mainBtn").addEventListener("click", () => submit(f));
    bindUpload(id);
    bindPraktik(f);
    if (isProject) bindProject(f);
    window.scrollTo(0, 0);
  }

  // ---------- 3b. PROJECT AKHIR: halaman, mulai, pengumpulan ----------
  // Urutan: Tujuan → Hadiah → Mulai → Langkah → Checklist → Kumpulkan hasil
  function projectBody(t, pb, u) {
    const jn = LP.jenisOf(t), J = LP.JENIS[jn];
    const cek = u.cek || [];
    const petunjuk = jn === "external"
      ? "Buka <b>" + esc(t.aplikasi || "aplikasi pilihanmu") + "</b>, kerjakan project-mu, lalu kembali ke sini untuk mengirim screenshot, foto, atau link hasilnya."
      : J.petunjuk;
    const perlu = J.bukti.map((b) => LP.BUKTI_NAMA[b]).join(" / ");
    const adaFile = !!J.file, fisik = jn === "fisik";
    const startLabel = J.folder ? (u.mulai ? "Lanjutkan di " + J.nama + " ▶" : J.mulai) : (u.mulai ? "✅ Sudah dimulai (lihat petunjuk)" : J.mulai);

    return '<div class="box goal"><h4>🎯 Tujuan project</h4>' + esc(t.tujuan || t.desc) + "</div>" +
      '<div class="box reward-box"><h4>🎁 Hadiah</h4>⭐ <b>' + LP.poinOf(t) + " koin</b>" + (t.lencana ? " + " + esc(t.lencana) : "") + "</div>" +
      '<div class="box mulai"><h4>🚀 Mulai mengerjakan</h4><p class="mp-info" style="text-align:left;margin-top:0">' + petunjuk + "</p>" +
        '<button type="button" class="btn green" id="startBtn">' + startLabel + "</button></div>" +
      '<div class="box"><h4>📝 Langkah-langkah</h4><ol>' + t.steps.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol></div>" +
      '<div class="box"><h4>✅ Checklist Project</h4>' +
        t.checklist.map((c, i) => '<label class="check"><input type="checkbox"' + (cek[i] ? " checked" : "") + "> " + esc(c) + "</label>").join("") + "</div>" +
      '<div class="box tip">💡 Ingat: kamu boleh memakai lagi semua yang sudah dipelajari di <b>Task 1–' + pb.tasks.length + "</b>!</div>" +
      listBox("📮 Cara mengumpulkan hasil", LP.kumpul(t), "kumpul", "ol") +
      '<div class="box upload"><h4>📤 Kumpulkan hasilmu</h4>' +
        '<p class="mp-info" style="text-align:left;margin-top:0">Isi minimal salah satu: <b>' + perlu + "</b>.</p>" +
        (adaFile ? '<div>' + (fisik ? "📸🎬 Foto atau video karyamu" : "📸 Foto atau screenshot hasilmu") + '</div><input type="file" accept="' + J.file + '" id="fileInput">' +
          '<img class="preview" id="preview" ' + (u.img ? 'src="' + u.img + '"' : 'style="display:none"') + ' alt="">' +
          '<div class="file-info" id="fileInfo">' + videoInfo(u) + "</div>" : "") +
        (J.link ? '<div style="margin-top:10px">🔗 Link project (jika ada)</div><input type="text" id="linkInput" placeholder="https://..." value="' + esc(u.link || "") + '">' : "") +
        '<div style="margin-top:10px">📝 Catatan tentang hasilmu</div>' +
        '<textarea id="noteInput" rows="3" maxlength="500" placeholder="Ceritakan karyamu: apa yang kamu buat dan bagian mana yang paling kamu suka?">' + esc(u.note || "") + "</textarea></div>";
  }
  function videoInfo(u) { return u.video ? "🎬 " + esc(u.video.nama) + " (" + u.video.mb + " MB) — video sudah dicatat" : ""; }

  function refreshStatus(id) {
    const el = document.getElementById("pStatus");
    if (el) el.innerHTML = statusChip(LP.find(id).task);
  }

  function bindProject(f) {
    const t = f.task, id = t.id, J = LP.JENIS[LP.jenisOf(t)];
    const mark = (data) => { LP.saveUpload(id, Object.assign({ mulai: true }, data)); refreshStatus(id); };
    const boxes = Array.from(document.querySelectorAll(".check input"));
    boxes.forEach((b) => b.addEventListener("change", () => mark({ cek: boxes.map((x) => x.checked) })));
    const note = document.getElementById("noteInput");
    if (note) note.addEventListener("input", () => mark({ note: note.value.trim() }));
    const link = document.getElementById("linkInput");
    if (link) link.addEventListener("input", () => mark({ link: link.value.trim() }));

    document.getElementById("startBtn").addEventListener("click", () => {
      mark({});
      if (J.folder) { window.location.href = J.folder + "/index.html?project=" + id; return; }   // editor yang sudah ada, mode bebas
      document.getElementById("startBtn").textContent = "✅ Sudah dimulai (lihat petunjuk)";
      popup({ type: "info", emoji: "🚀", title: "Selamat mengerjakan!",
        html: '<p class="mp-info">' + (LP.jenisOf(t) === "external"
          ? "Buka <b>" + esc(t.aplikasi || "aplikasi pilihanmu") + "</b> dan kerjakan project-mu. Kalau sudah selesai, kembali ke halaman ini lalu klik <b>Kumpulkan Project</b>."
          : "Siapkan bahan dan buat karyamu. Kalau sudah selesai, foto atau rekam karyamu, lalu kembali ke halaman ini dan klik <b>Kumpulkan Project</b>.") + "</p>",
        buttons: [{ label: "Siap!", cls: "mp-primary" }] });
    });
  }

  // ---------- upload foto & link ----------
  function bindUpload(id) {
    const file = document.getElementById("fileInput");
    const link = document.getElementById("linkInput");
    if (file) file.addEventListener("change", () => {
      const fl = file.files[0];
      if (!fl) return;
      if (fl.type.indexOf("video/") === 0) {      // video tidak muat di penyimpanan browser → hanya dicatat nama & ukurannya
        LP.saveUpload(id, { video: { nama: fl.name, mb: Math.round(fl.size / 104857.6) / 10 }, img: null, mulai: true });
        const pv = document.getElementById("preview"), fi = document.getElementById("fileInfo");
        if (pv) pv.style.display = "none";
        if (fi) fi.innerHTML = videoInfo(LP.upload(id));
        return refreshStatus(id);
      }
      const reader = new FileReader();
      reader.onload = () => {
        const im = new Image();
        im.onload = () => {
          const k = Math.min(1, 800 / Math.max(im.width, im.height));
          const c = document.createElement("canvas");
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          const data = c.toDataURL("image/jpeg", 0.7);
          try { LP.saveUpload(id, { img: data, video: null, mulai: true }); } catch (e) {
            return popup({ type: "fail", emoji: "😅", title: "Fotonya terlalu besar", html: '<p class="mp-info">Coba pilih foto lain yang lebih kecil.</p>', buttons: [{ label: "Oke", cls: "mp-primary" }] });
          }
          const pv = document.getElementById("preview"), fi = document.getElementById("fileInfo");
          pv.src = data; pv.style.display = "block"; if (fi) fi.innerHTML = "";
          if (document.getElementById("pStatus")) refreshStatus(id);
        };
        im.src = reader.result;
      };
      reader.readAsDataURL(fl);
    });
    if (link) link.addEventListener("change", () => LP.saveUpload(id, { link: link.value.trim() }));
  }

  // ---------- periksa & selesai ----------
  function submit(f) {
    const t = f.task, id = t.id;
    if (LP.materiTerkunciId(id)) return popupMateri(t);     // gerbang materi
    if (LP.editorOf(t)) return openItem(id);
    if (t.type === "project") return submitProject(f);

    if (LP.isDone(id)) {                        // sudah pernah selesai → tidak ada koin tambahan
      return popup({ type: "info", emoji: "✅", title: "Task ini sudah selesai!",
        html: '<p class="mp-info">Kamu sudah menyelesaikannya, jadi mengulang lagi <b>tidak memberi koin tambahan</b>.</p>',
        buttons: [{ label: "Kembali ke jalur", cls: "mp-primary", fn: () => showPemb(f.pemb.id) }] });
    }

    if (t.kind === "quiz") {
      const wrong = [];
      t.quiz.forEach((q, qi) => {
        const sel = document.querySelector('input[name="q' + qi + '"]:checked');
        if (!sel || Number(sel.value) !== q.answer) wrong.push((qi + 1) + ". " + q.q);
      });
      if (wrong.length) return fail(f, "Kamu benar " + (t.quiz.length - wrong.length) + " dari " + t.quiz.length + ". Coba periksa lagi jawabanmu.", wrong);
      return success(f);
    }

    const boxes = Array.from(document.querySelectorAll(".check input"));
    const unchecked = boxes.filter((b) => !b.checked).map((b) => b.parentElement.textContent.trim());
    if (unchecked.length) return fail(f, "Masih ada langkah di checklist yang belum dicentang.", unchecked);

    if (t.type === "project") {
      const u = LP.upload(id);
      const linkEl = document.getElementById("linkInput");
      const link = linkEl ? linkEl.value.trim() : "";
      if (link) LP.saveUpload(id, { link });
      if (!u.img && !link) return fail(f, "Kamu belum menambahkan hasil karyamu. Unggah foto atau tempel link project-mu ya!", []);
    }
    success(f);
  }

  // ---------- kumpulkan Project Akhir ----------
  function submitProject(f) {
    const t = f.task, id = t.id, J = LP.JENIS[LP.jenisOf(t)];
    const val = (i) => { const el = document.getElementById(i); return el ? el.value.trim() : ""; };
    const link = val("linkInput"), note = val("noteInput");
    LP.saveUpload(id, { link, note });

    const unchecked = Array.from(document.querySelectorAll(".check input")).filter((b) => !b.checked).map((b) => b.parentElement.textContent.trim());
    if (unchecked.length) return fail(f, "Masih ada langkah di checklist yang belum dicentang.", unchecked);
    if (link && !/^https?:\/\/\S+$/i.test(link)) return fail(f, "Link harus diawali http:// atau https:// ya. Coba salin lagi dari aplikasinya.", []);

    const u = LP.upload(id);
    if (!J.bukti.some((b) => u[b])) {
      return fail(f, "Kamu belum menambahkan hasil karyamu. Isi minimal salah satu: " + J.bukti.map((b) => LP.BUKTI_NAMA[b]).join(", ") + ".", []);
    }
    LP.saveUpload(id, { tgl: Date.now() });

    if (LP.isDone(id)) {                        // sudah pernah dikumpulkan → hanya memperbarui, tanpa koin tambahan
      refreshStatus(id);
      return popup({ type: "ok", emoji: "📤", title: "Pengumpulan diperbarui!",
        html: '<p class="mp-info">Hasil project-mu sudah diperbarui. Koin tidak bertambah karena project ini sudah pernah dikumpulkan.</p>',
        buttons: [{ label: "Kembali ke jalur", cls: "mp-primary", fn: () => showPemb(f.pemb.id) }] });
    }
    success(f);
    refreshStatus(id);
  }

  function fail(f, msg, unmet) {
    const n = LP.addAttempt(f.task.id);
    popup({ type: "fail", emoji: "❌", title: "Belum berhasil!",
      html: '<p class="mp-info">Ini percobaan ke-' + n + ". " + esc(msg) + "</p>",
      unmet: unmet, buttons: [{ label: "Coba lagi", cls: "mp-primary" }] });
  }

  async function success(f) {
    const t = f.task, pb = f.pemb;
    const r = LP.complete(t.id, LP.attempts(t.id) === 0);
    if (r && r.blocked) return popupMateri(t);               // materi belum dibaca → tidak ada koin
    const s = await r.ready;                                 // koin & bonus dari jawaban server
    refreshPoints();
    const nx = LP.next(t.id);
    const isProject = t.type === "project";

    let html = isProject ? '<p class="mp-info"><b>Project-mu berhasil dikirim!</b> Kerja bagus, karyamu sudah dikumpulkan. 🎉</p>' : "";
    html += '<div class="mp-points"><b>+' + s.earned + "</b> koin</div>";
    if (s.bonus) html += '<div class="mp-bonus">⚡ Bonus percobaan pertama +' + s.bonus + "</div>";
    html += '<p class="mp-info">Total koinmu: <b>⭐ ' + s.total + "</b></p>";
    if (isProject && t.lencana) html += '<div class="mp-bonus">' + esc(t.lencana) + " didapat!</div>";
    if (isProject) html += '<div class="mp-all">🎓 Pembelajaran "' + esc(pb.judul) + '" selesai!</div>';

    const buttons = [];
    if (nx) buttons.push({ label: nx.type === "project" ? "Lanjut ke Project Akhir 🏆" : "Task berikutnya →", cls: "mp-primary", fn: () => openItem(nx.id) });
    else buttons.push({ label: tahap.mode === "pilih-jalur" ? "Pilih jalur lain" : "Pilih pembelajaran lain", cls: "mp-primary", fn: showTahap });
    buttons.push({ label: "Kembali ke jalur", cls: "mp-secondary", fn: () => showPemb(pb.id) });

    popup({ type: "ok", emoji: isProject ? "📤" : "🎉", title: isProject ? "Project berhasil dikirim!" : "Hore, berhasil!",
      name: (isProject ? "Project" : "Task " + t.no) + " — " + t.title, html: html, buttons: buttons });
  }

  // ---------- MULAI ----------
  const params = new URLSearchParams(window.location.search);
  const startTask = params.get("task"), startP = params.get("p"), startT = params.get("t");
  if (startTask && LP.find(startTask)) showTask(startTask);
  else if (startP && findPemb(startP)) showPemb(startP);
  else if (startT && LP.tahap.some((th) => th.id === startT)) {
    tahap = LP.tahap.find((th) => th.id === startT);
    const ch = tahap.mode === "pilih-jalur" ? LP.chosen(tahap.id) : null;      // sudah punya jalur → langsung ke Learning Path
    if (ch && findPemb(ch)) showPemb(ch); else showTahap();
  } else showTahap();

})();
