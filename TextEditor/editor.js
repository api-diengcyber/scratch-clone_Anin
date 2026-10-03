// ============================================================
// TEXT EDITOR — HTML & CSS (Dieng Cyber Coding)
// Data task ada di ../jalur-data.js (task berjenis kode(...)).
// Poin, kunci, dan progres dikelola oleh LP di ../jalur-belajar.js.
//
//  ?task=g3-t2   → membuka task dari Learning Path (dicek otomatis)
//  ?dari=g3-t1   → 🚀 Mulai Praktik dari Task biasa (kuis/external): mode bebas, tanpa poin, tombol kembali ke Task itu
//  (tanpa task)  → mode bebas: bereksperimen tanpa poin
//
// Keamanan: preview memakai <iframe sandbox=""> (tanpa JavaScript) + CSP,
// dan kode anak diparse dengan DOMParser (tidak pernah dijalankan di halaman ini).
// ============================================================
(function () {

  if (localStorage.getItem("isLoggedIn") !== "true") { window.location.replace("../index.html"); return; }
  if (typeof LP === "undefined") { document.body.textContent = "Data jalur belajar belum termuat."; return; }

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- TASK atau MODE BEBAS ----------
  const params = new URLSearchParams(window.location.search);
  const taskId = params.get("task");
  let info = null, task = null;
  if (taskId) {
    info = LP.find(taskId);
    if (!info || info.task.kind !== "code") { window.location.replace("../belajar.html" + (info ? "?task=" + taskId : "")); return; }
    if (!LP.isUnlocked(taskId)) { window.location.replace("../belajar.html?p=" + info.pemb.id); return; }   // belum terbuka → balik
    task = info.task;
  }

  const BEBAS = {
    html: '<!DOCTYPE html>\n<html>\n<head>\n  <title>Websiteku</title>\n</head>\n<body>\n  <h1>Halo, Dunia!</h1>\n  <p>Ini percobaan pertamaku.</p>\n</body>\n</html>\n',
    css: "h1 {\n  color: tomato;\n}\n"
  };
  const TABS = { html: "📄 index.html", css: "🎨 style.css" };

  const bahasa = (task && task.bahasa) || ["html", "css"];
  const awal = Object.assign({ html: "", css: "" }, task ? task.awal : BEBAS);
  const dari = params.get("dari");               // dibuka lewat 🚀 Mulai Praktik dari sebuah Task → mode bebas, tombol kembali ke Task itu
  const draftKey = taskId || (dari && LP.find(dari) ? "dari-" + dari : "bebas");
  const draft = LP._get("codingDraft", {})[draftKey] || {};
  const code = { html: draft.html != null ? draft.html : awal.html, css: draft.css != null ? draft.css : awal.css };
  if (bahasa.indexOf("css") < 0) code.css = "";
  let tab = bahasa[0];
  let ranOk = false;

  // ---------- elemen ----------
  const ta = $("src"), hl = $("hl"), frame = $("preview"), note = $("prevNote");
  const refreshPoints = () => { $("pointsValue").textContent = LP.points(); };
  refreshPoints();
  if (task) { $("backLink").href = "../belajar.html?p=" + info.pemb.id; $("backLink").textContent = "← Jalur belajar"; }
  const projectId = params.get("project");      // dibuka dari Project Akhir → kembali ke halaman project-nya
  if (!task && dari && LP.find(dari)) { $("backLink").href = "../belajar.html?task=" + dari; $("backLink").textContent = "← Kembali ke Task"; }
  if (!task && projectId && LP.find(projectId)) { $("backLink").href = "../belajar.html?task=" + projectId; $("backLink").textContent = "← Project Akhir"; }

  // ---------- popup ----------
  function popup(o) {
    const old = document.querySelector(".mission-overlay");
    if (old) old.remove();
    const ov = document.createElement("div");
    ov.className = "mission-overlay";
    ov.innerHTML =
      '<div class="mission-popup ' + (o.type || "ok") + '">' +
        '<div class="mp-emoji">' + o.emoji + "</div><h2>" + esc(o.title) + "</h2>" +
        (o.name ? '<p class="mp-name">' + esc(o.name) + "</p>" : "") + (o.html || "") +
        (o.unmet && o.unmet.length ? '<ul class="mp-unmet">' + o.unmet.map((u) => "<li>" + esc(u) + "</li>").join("") + "</ul>" : "") +
        '<div class="mp-actions"></div></div>';
    const box = ov.querySelector(".mp-actions");
    (o.buttons || []).forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = b.cls || "mp-secondary"; btn.textContent = b.label;
      btn.addEventListener("click", () => { ov.remove(); if (b.fn) b.fn(); });
      box.appendChild(btn);
    });
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }

  // ============================================================
  // PREVIEW AMAN
  // ============================================================
  // CSP: tanpa script, tanpa permintaan jaringan selain gambar/font. Disisipkan ke dalam dokumen preview.
  const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data: http: https:; font-src data: https:; media-src data: http: https:";

  function buildDoc(html, css) {
    const doc = new DOMParser().parseFromString(html, "text/html");      // tidak menjalankan script
    doc.querySelectorAll("meta[http-equiv], base").forEach((n) => n.remove());   // cegah redirect & pembelokan alamat
    const head = doc.head;
    const csp = doc.createElement("meta"); csp.setAttribute("http-equiv", "Content-Security-Policy"); csp.setAttribute("content", CSP);
    const base = doc.createElement("base"); base.setAttribute("target", "_blank");
    head.insertBefore(base, head.firstChild); head.insertBefore(csp, head.firstChild);
    if (css.trim()) { const st = doc.createElement("style"); st.textContent = css; head.appendChild(st); }   // isi style.css
    return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
  }

  function render() {
    syncCode();
    frame.srcdoc = buildDoc(code.html, code.css);
    note.textContent = "✓ Preview diperbarui"; note.classList.add("flash");
    clearTimeout(render.t); render.t = setTimeout(() => { note.textContent = "Berubah otomatis saat kamu mengetik"; note.classList.remove("flash"); }, 1500);
  }

  // ============================================================
  // EDITOR (textarea + pewarna)
  // ============================================================
  function syncCode() { code[tab] = ta.value; }
  function paint() { hl.innerHTML = window.Highlight[tab](ta.value) + "\n"; hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; }

  function showTab(t) {
    syncCode(); tab = t;
    ta.value = code[tab]; ta.scrollTop = 0; ta.scrollLeft = 0;
    paint();
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
  }
  if (bahasa.length > 1) {
    $("tabs").innerHTML = bahasa.map((b) => '<button type="button" data-t="' + b + '">' + TABS[b] + "</button>").join("");
    $("tabs").addEventListener("click", (e) => { if (e.target.dataset.t) showTab(e.target.dataset.t); });
  } else {
    $("tabs").innerHTML = '<span class="ph-note">' + TABS[bahasa[0]] + "</span>";
  }
  ta.value = code[tab]; paint();
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === tab));

  ta.addEventListener("scroll", () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; });

  function insertText(txt) {
    ta.focus();
    if (!document.execCommand || !document.execCommand("insertText", false, txt)) {     // execCommand menjaga fitur Undo (Ctrl+Z)
      ta.setRangeText(txt, ta.selectionStart, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input"));
    }
  }
  ta.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); insertText("  "); }         // Tab = 2 spasi
    else if (e.key === "Enter") {                                                           // rata kiri otomatis
      e.preventDefault();
      const before = ta.value.slice(0, ta.selectionStart);
      const line = before.slice(before.lastIndexOf("\n") + 1);
      const indent = /^[ \t]*/.exec(line)[0] + (/\{\s*$/.test(line) ? "  " : "");
      insertText("\n" + indent);
    }
  });

  // simpan draft supaya kode tidak hilang kalau halaman dimuat ulang
  function saveDraft() {
    syncCode();
    try { const d = LP._get("codingDraft", {}); d[draftKey] = { html: code.html, css: code.css }; LP._set("codingDraft", d); } catch (e) {}
  }
  let tPrev, tSave;
  ta.addEventListener("input", () => {
    paint();
    clearTimeout(tPrev); tPrev = setTimeout(render, 600);       // preview langsung
    clearTimeout(tSave); tSave = setTimeout(() => { saveDraft(); updateGoals(); }, 400);
  });

  // ============================================================
  // CEK OTOMATIS (task dari Learning Path)
  // Syarat ditulis sebagai data di jalur-data.js:  cek: [ { teks, tag | css | uji } ]
  // ============================================================
  function parseCss(text) {
    let sheet;
    try { sheet = new CSSStyleSheet(); sheet.replaceSync(text); }
    catch (e) {
      try { const d = document.implementation.createHTMLDocument(""); const s = d.createElement("style"); s.textContent = text; d.head.appendChild(s); sheet = s.sheet; }
      catch (e2) { return []; }
    }
    return Array.from(sheet.cssRules).filter((r) => r.type === 1);
  }
  function cssCount(q, rules) {
    let n = 0;
    rules.forEach((r) => {
      const sels = r.selectorText.split(",").map((s) => s.trim().toLowerCase());
      const okSel = q.kelas ? sels.some((s) => /^\.[\w-]+/.test(s)) : q.pada ? sels.indexOf(q.pada.toLowerCase()) >= 0 : true;
      if (!okSel) return;
      const props = [].concat(q.prop || []);
      if (!props.length ? r.style.length > 0 : props.some((p) => r.style.getPropertyValue(p))) n++;
    });
    return n;
  }
  function passes(c, ctx) {
    try {
      if (c.uji) return !!c.uji(ctx);
      if (c.tag) {
        let els = Array.from(ctx.doc.querySelectorAll(c.tag));
        if (c.isi) els = els.filter((e) => e.textContent.trim());
        return els.length >= (c.min || 1);
      }
      if (c.css) return cssCount(c.css, ctx.rules) >= (c.css.min || 1);
    } catch (e) {}
    return false;
  }
  const goals = task ? (task.cek || []).map((c) => ({ teks: c.teks, test: (ctx) => passes(c, ctx) }))
    .concat([{ teks: "Klik ▶ Jalankan", test: () => ranOk }]) : [];
  function context() {
    syncCode();
    return { doc: new DOMParser().parseFromString(code.html, "text/html"), rules: parseCss(code.css), html: code.html, css: code.css };
  }
  function evaluate() { const ctx = context(); return goals.map((g) => { try { return !!g.test(ctx); } catch (e) { return false; } }); }

  // ---------- kartu misi ----------
  let goalLis = [];
  function updateGoals() {
    if (!task) return;
    const r = evaluate();
    goalLis.forEach((li, i) => { li.classList.toggle("done", r[i]); li.firstChild.textContent = r[i] ? "✅" : "☐"; });
  }
  if (task) {
    const kond = LP.kondisi(task);
    const m = $("mission");
    m.hidden = false;
    m.innerHTML =
      '<div class="m-top"><div><div class="m-tag"></div><h2></h2><p></p></div>' +
      '<button type="button" class="m-info-btn" id="infoBtn">📖 Materi &amp; petunjuk</button></div>' +
      '<ul class="m-goals"></ul>' +
      '<div class="m-info" id="mInfo" hidden></div>';
    m.querySelector(".m-tag").textContent = "🎯 TASK " + task.no + " • " + task.label.toUpperCase() + "  •  ⭐ " + LP.poinOf(task) + " poin";
    m.querySelector("h2").textContent = task.title;
    m.querySelector("p").textContent = task.desc;
    const ul = m.querySelector(".m-goals");
    goalLis = goals.map((g) => { const li = document.createElement("li"); li.innerHTML = "<span>☐</span><span></span>"; li.lastChild.textContent = g.teks; ul.appendChild(li); return li; });
    let infoHtml = "";
    if (task.langkah && task.langkah.length) infoHtml += '<div class="m-box steps"><h4>📝 Langkah-langkah</h4><ol>' + task.langkah.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol></div>";   // tampil langsung agar siswa ingat harus ngapain
    if (task.materi && task.materi.length) infoHtml += '<div class="m-box"><h4>📖 Yang kamu pelajari</h4><ul>' + task.materi.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul></div>";
    if (task.hint) infoHtml += '<div class="m-box tip"><h4>💡 Petunjuk</h4>' + esc(task.hint) + "</div>";
    infoHtml += '<div class="m-box ok"><h4>✅ Berhasil jika</h4>' + esc(kond.sukses) + '</div><div class="m-box bad"><h4>❌ Belum berhasil jika</h4>' + esc(kond.gagal) + "</div>";
    $("mInfo").innerHTML = infoHtml;
    if (task.langkah && task.langkah.length) {
      $("infoBtn").textContent = "📝 Langkah & petunjuk";
      $("mInfo").hidden = LP.isDone(taskId);              // task baru: langkah terbuka; task yang sudah selesai: tertutup
    }
    $("infoBtn").addEventListener("click", () => { $("mInfo").hidden = !$("mInfo").hidden; });
    if (LP.isDone(taskId)) {
      const d = document.createElement("div"); d.className = "m-done"; d.textContent = "✅ Sudah selesai! Mengulang tidak memberi poin tambahan.";
      m.appendChild(d);
    }
    updateGoals();
  }

  // ============================================================
  // TOMBOL: Jalankan, Reset, Kosongkan
  // ============================================================
  function run() {
    render();
    if (!task) return;                                    // mode bebas: hanya preview
    const before = evaluate();
    const metOthers = before.slice(0, -1).every(Boolean);
    const already = LP.isDone(taskId);
    let attemptNo = 0;
    if (!metOthers && !already) attemptNo = LP.addAttempt(taskId);
    if (metOthers) { ranOk = true; updateGoals(); }
    saveDraft();
    if (metOthers) return success(already);
    if (attemptNo) fail(attemptNo, goals.filter((g, i) => i < before.length - 1 && !before[i]).map((g) => g.teks).slice(0, 3));
  }

  function fail(n, unmet) {
    popup({ type: "fail", emoji: "❌", title: "Belum berhasil!",
      html: '<p class="mp-info">Ini percobaan ke-' + n + ". Coba periksa lagi kodemu, lalu klik ▶ Jalankan.</p>",
      unmet: unmet, buttons: [{ label: "Coba lagi", cls: "mp-primary" }] });
  }

  function success(already) {
    const nameLine = "Task " + task.no + " — " + task.title;
    const nx = LP.next(taskId);
    const buttons = [];
    if (nx) buttons.push({ label: nx.type === "project" ? "Lanjut ke Project Akhir 🏆" : "Task berikutnya →", cls: "mp-primary", fn: () => { window.location.href = LP.href(nx.id, "TextEditor"); } });
    buttons.push({ label: "Kembali ke jalur belajar", cls: "mp-secondary", fn: () => { window.location.href = "../belajar.html?p=" + info.pemb.id; } });
    buttons.push({ label: "Lanjut bereksperimen", cls: "mp-secondary" });
    if (already) {
      return popup({ type: "info", emoji: "✅", title: "Sudah selesai!", name: nameLine,
        html: '<p class="mp-info">Kamu sudah pernah menyelesaikan task ini, jadi tidak ada tambahan poin.</p>', buttons: buttons });
    }
    const r = LP.complete(taskId, LP.attempts(taskId) === 0);
    refreshPoints();
    let html = '<div class="mp-points"><b>+' + r.earned + "</b> poin</div>";
    if (r.bonus) html += '<div class="mp-bonus">⚡ Bonus percobaan pertama +' + r.bonus + "</div>";
    html += '<p class="mp-info">Total poinmu: <b>⭐ ' + r.total + "</b></p>";
    popup({ type: "ok", emoji: "🎉", title: "Hore, berhasil!", name: nameLine, html: html, buttons: buttons });
  }

  function reset() {
    popup({ type: "info", emoji: "🔄", title: "Mulai dari awal?",
      html: '<p class="mp-info">Semua kode yang kamu tulis akan diganti dengan kode awal.</p>',
      buttons: [{ label: "Ya, reset", cls: "mp-primary", fn: () => {
        code.html = awal.html; code.css = bahasaCss() ? awal.css : "";
        ta.value = code[tab]; paint(); render(); saveDraft(); updateGoals();
      } }, { label: "Batal", cls: "mp-secondary" }] });
  }
  function bahasaCss() { return bahasa.indexOf("css") >= 0; }

  function clearTab() {
    popup({ type: "info", emoji: "🧹", title: "Kosongkan " + TABS[tab].replace(/^\S+\s/, "") + "?",
      html: '<p class="mp-info">Semua tulisan di bagian ini akan dihapus.</p>',
      buttons: [{ label: "Ya, kosongkan", cls: "mp-primary", fn: () => {
        ta.value = ""; paint(); render(); saveDraft(); updateGoals(); ta.focus();
      } }, { label: "Batal", cls: "mp-secondary" }] });
  }

  $("runBtn").addEventListener("click", run);
  $("resetBtn").addEventListener("click", reset);
  $("clearBtn").addEventListener("click", clearTab);
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); } });   // Ctrl+Enter = Jalankan

  render();
})();
