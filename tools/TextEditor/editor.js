// ============================================================
// TEXT EDITOR — HTML, CSS, Python & PHP (Dieng Cyber Coding)
// Data task ada di ../jalur-data.js (task berjenis kode(...)).
// Poin, kunci, dan progres dikelola oleh LP di ../jalur-belajar.js.
//
//  ?task=g3-t2   → membuka task dari Learning Path (dicek otomatis)
//  ?dari=g3-t1   → 🚀 Mulai Praktik dari Task biasa (kuis/external): mode bebas, tanpa poin, tombol kembali ke Task itu
//  (tanpa task)  → mode bebas: bereksperimen tanpa poin
//  ?bahasa=python | php | html → membuka mode bebas langsung di bahasa itu
//                  (tanpa ?bahasa, Python dipilih otomatis kalau ?dari= dari jalur Python: py1, pl2, da3, ...)
//
// Tiga mode:  web (HTML+CSS, preview otomatis)  •  python  •  php
//  - task memilih modenya lewat  bahasa: ["html","css"] | ["python"] | ["php"]  di jalur-data.js
//  - python & php dijalankan di browser oleh runner.js (kode anak tidak menyentuh server)
//
// Keamanan: preview memakai <iframe sandbox=""> (tanpa JavaScript) + CSP,
// dan kode HTML anak diparse dengan DOMParser (tidak pernah dijalankan di halaman ini).
// Python & PHP berjalan di dalam WebAssembly browser (runner.js), terpisah dari halaman ini.
// ============================================================
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

  } catch (error) {
    console.error("Gagal memeriksa sesi:", error);
    window.location.replace("/index.html");
    return;
  }

  if (typeof LP === "undefined") {
    document.body.textContent = "Data jalur belajar belum termuat.";
    return;
  }

  const $ = (id) => document.getElementById(id);
  const esc = window.DCUtils.esc;

  // ---------- TASK atau MODE BEBAS ----------
  const params = new URLSearchParams(window.location.search);
  const taskId = params.get("task");
  let info = null, task = null;
  if (taskId) {
    info = LP.find(taskId);
    if (!info || info.task.kind !== "code") { window.location.replace("/belajar.html" + (info ? "?task=" + taskId : "")); return; }
    if (!LP.isUnlocked(taskId)) { window.location.replace("/belajar.html?p=" + info.pemb.id); return; }   // belum terbuka → balik
    task = info.task;
    if (LP.mulaiTask) LP.mulaiTask(taskId);   // mulai hitung waktu pengerjaan
  }

  const BEBAS = {
    html: '<!DOCTYPE html>\n<html>\n<head>\n  <title>Websiteku</title>\n</head>\n<body>\n  <h1>Halo, Dunia!</h1>\n  <p>Ini percobaan pertamaku.</p>\n</body>\n</html>\n',
    css: "h1 {\n  color: tomato;\n}\n",
    python: '# Tulis kode Python di sini, lalu klik \u25B6 Jalankan\nprint("Halo, Dunia!")\n\nfor i in range(1, 4):\n    print("Hitungan ke", i)\n',
    php: '<?php\n// Tulis kode PHP di sini, lalu klik \u25B6 Jalankan\n$nama = "Dunia";\necho "<h1>Halo, $nama!</h1>";\n\nfor ($i = 1; $i <= 3; $i++) {\n  echo "<p>Hitungan ke $i</p>";\n}\n'
  };
  const TABS = { html: "📄 index.html", css: "🎨 style.css", python: "🐍 main.py", php: "🐘 index.php" };
  const KEYS = ["html", "css", "python", "php"];
  const MODES = { web: ["html", "css"], python: ["python"], php: ["php"] };      // mode → tab yang tampil
  const ALIAS = { html: "web", css: "web", web: "web", py: "python", python: "python", php: "php" };
  const modeOf = (list) => list.indexOf("python") >= 0 ? "python" : list.indexOf("php") >= 0 ? "php" : "web";
  const isRun = () => mode !== "web";                                               // python/php: dijalankan dulu, hasilnya di kotak Output

  const dari = params.get("dari");               // dibuka lewat 🚀 Mulai Praktik dari sebuah Task → mode bebas, tombol kembali ke Task itu
  const draftKey = taskId || (dari && LP.find(dari) ? "dari-" + dari : "bebas");
  const draft = LP._get("codingDraft", {})[draftKey] || {};

  // bahasa: task menentukan sendiri; mode bebas → ?bahasa= → pilihan terakhir → tebakan dari jalur → web
  let bahasa, mode;
  if (task) {
    bahasa = (task.bahasa || ["html", "css"]).map((b) => (b === "py" ? "python" : b));
    mode = modeOf(bahasa);
  } else {
    // Task SMP/SMA-K (?smp=<id modul>) menentukan bahasanya dari id modul: py/pl/da → Python, ai/wb → web.
    // Ini harus menang atas "pilihan terakhir" (draft), kalau tidak task Python terbuka di mode HTML dan AI Tutor memeriksa tab yang salah.
    const smpId = params.get("smp") || "";
    const smpMode = /^(py|pl|da)\d/.test(smpId) ? "python" : /^(ai|wb)\d/.test(smpId) ? "web" : "";
    mode = ALIAS[(params.get("bahasa") || "").toLowerCase()] || smpMode || ALIAS[draft.mode] || (/^(py|pl|da)\d/.test(dari || "") ? "python" : "web");
    bahasa = MODES[mode];
  }
  const awal = Object.assign({ html: "", css: "", python: "", php: "" }, task ? task.awal : BEBAS);
  const code = {};
  KEYS.forEach((k) => { code[k] = draft[k] != null ? draft[k] : awal[k]; });
  if (task && bahasa.indexOf("css") < 0) code.css = "";
  let tab = bahasa[0];
  let ranOk = false;
  let lastRun = null;                            // hasil Jalankan terakhir (python/php): { output, error }
  let running = false;
  let phpView = "view";                          // PHP: "view" (tampilan web) | "text"

  // ---------- elemen ----------
  const ta = $("src"), hl = $("hl"), frame = $("preview"), note = $("prevNote");
  const consoleEl = $("console"), outPre = $("consoleOut"), stdinEl = $("stdin"), stdinBox = $("stdinBox");
  const runBtn = $("runBtn"), stopBtn = $("stopBtn");
  if (draft.stdin != null) stdinEl.value = draft.stdin;
  const nowPoints = () => (LP.saldo ? LP.saldo() : LP.points());   // saldo: sama dengan dashboard, halaman poin & laporan
  const refreshPoints = () => { $("pointsValue").textContent = nowPoints(); };
  refreshPoints();
  if (LP.loadFromServer) LP.loadFromServer().then((ok) => { if (ok) refreshPoints(); }).catch(() => {});   // poin terbaru dari server
  if (task) { $("backLink").href = "/belajar.html?p=" + info.pemb.id; $("backLink").textContent = "← Jalur belajar"; }
  const projectId = params.get("project");      // dibuka dari Project Akhir → kembali ke halaman project-nya
  if (!task && dari && LP.find(dari)) { $("backLink").href = "/belajar.html?task=" + dari; $("backLink").textContent = "← Kembali ke Task"; }
  if (!task && projectId && LP.find(projectId)) { $("backLink").href = "/belajar.html?task=" + projectId; $("backLink").textContent = "← Project Akhir"; }

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
    doc.querySelectorAll('link[rel="stylesheet"], link[rel~="stylesheet"]').forEach((n) => n.remove());   // CSS sudah disisip inline di bawah; <link href="style.css"> hanya memicu pelanggaran CSP + request sia-sia   // cegah redirect & pembelokan alamat
    const head = doc.head;
    const csp = doc.createElement("meta"); csp.setAttribute("http-equiv", "Content-Security-Policy"); csp.setAttribute("content", CSP);
    const base = doc.createElement("base"); base.setAttribute("target", "_blank");
    head.insertBefore(base, head.firstChild); head.insertBefore(csp, head.firstChild);
    if (css.trim()) { const st = doc.createElement("style"); st.textContent = css; head.appendChild(st); }   // isi style.css
    return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
  }

  const defaultNote = () => mode === "web" ? "Berubah otomatis saat kamu mengetik" : "Klik ▶ Jalankan untuk melihat hasilnya";
  function flashNote(text) {
    note.textContent = text; note.classList.add("flash");
    clearTimeout(flashNote.t); flashNote.t = setTimeout(() => { note.textContent = defaultNote(); note.classList.remove("flash"); }, 1500);
  }

  function render() {
    syncCode();
    if (isRun()) return;                                                  // python/php hanya berjalan lewat tombol Jalankan
    frame.srcdoc = buildDoc(code.html, code.css);
    flashNote("✓ Preview diperbarui");
  }

  // ============================================================
  // EDITOR (textarea + pewarna)
  // ============================================================
  function syncCode() { code[tab] = ta.value; }
  function paint() { hl.innerHTML = window.Highlight[tab](ta.value) + "\n"; hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; }

  function markTabs() { document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === tab)); }
  function showTab(t) {
    syncCode(); tab = t;
    ta.value = code[tab]; ta.scrollTop = 0; ta.scrollLeft = 0;
    paint(); markTabs();
  }
  function buildTabs() {
    if (bahasa.length > 1) {
      $("tabs").innerHTML = bahasa.map((b) => '<button type="button" data-t="' + b + '">' + TABS[b] + "</button>").join("");
    } else {
      $("tabs").innerHTML = '<span class="ph-note">' + TABS[bahasa[0]] + "</span>";
    }
    markTabs();
  }
  $("tabs").addEventListener("click", (e) => { if (e.target.dataset.t) showTab(e.target.dataset.t); });
  buildTabs();
  ta.value = code[tab]; paint();

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
    const unit = mode === "python" ? "    " : "  ";                                       // Python: 4 spasi, lainnya 2 spasi
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); insertText(unit); }         // Tab = spasi
    else if (e.key === "Enter") {                                                         // rata kiri otomatis
      e.preventDefault();
      const before = ta.value.slice(0, ta.selectionStart);
      const line = before.slice(before.lastIndexOf("\n") + 1);
      const opens = mode === "python" ? /:\s*(#.*)?$/.test(line) : /\{\s*$/.test(line);   // Python: baris berakhiran ":" → masuk satu tingkat
      insertText("\n" + /^[ \t]*/.exec(line)[0] + (opens ? unit : ""));
    }
  });

  // simpan draft supaya kode tidak hilang kalau halaman dimuat ulang
  function saveDraft() {
    syncCode();
    try { const d = LP._get("codingDraft", {}); d[draftKey] = { html: code.html, css: code.css, python: code.python, php: code.php, mode: mode, stdin: stdinEl.value }; LP._set("codingDraft", d); } catch (e) {}
  }
  let tPrev, tSave;
  ta.addEventListener("input", () => {
    paint();
    if (isRun()) lastRun = null;                                // kode berubah → hasil lama tidak berlaku lagi (centang syarat berbasis output kembali ☐)
    clearTimeout(tPrev); tPrev = setTimeout(render, 600);       // preview langsung (hanya mode web)
    clearTimeout(tSave); tSave = setTimeout(() => { saveDraft(); updateGoals(); }, 400);
  });
  stdinEl.addEventListener("input", () => { stdinBox.classList.remove("need"); clearTimeout(tSave); tSave = setTimeout(saveDraft, 400); });

  // ============================================================
  // CEK OTOMATIS (task dari Learning Path)
  // Syarat ditulis sebagai data di jalur-data.js:  cek: [ { teks, tag | css | kode | keluaran | uji } ]
  //   tag / css  → untuk HTML & CSS (lihat penjelasan di jalur-data.js)
  //   kode       → tulisan (atau /regex/) yang harus ada di KODE anak, mis. kode: "def " atau kode: /for .+ in range/
  //   keluaran   → tulisan (atau /regex/) yang harus muncul di OUTPUT program (Python/PHP) setelah ▶ Jalankan
  //   uji        → fungsi bebas: uji(ctx) → true/false. ctx = { doc, rules, html, css, python, php, kode, output, error }
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
  const has = (hay, q) => q instanceof RegExp ? q.test(hay) : String(hay).toLowerCase().indexOf(String(q).toLowerCase()) >= 0;
  function passes(c, ctx) {
    try {
      if (c.uji) return !!c.uji(ctx);
      if (c.kode != null) return [].concat(c.kode).every((q) => has(ctx.kode, q));
      if (c.keluaran != null) return [].concat(c.keluaran).every((q) => has(ctx.output, q));
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
    .concat([isRun() ? { teks: "Program berjalan tanpa error", test: () => !!(lastRun && !lastRun.error) }
                     : { teks: "Klik ▶ Jalankan", test: () => ranOk }]) : [];
  function context() {
    syncCode();
    return { doc: new DOMParser().parseFromString(code.html, "text/html"), rules: parseCss(code.css), html: code.html, css: code.css,
             python: code.python, php: code.php, kode: code[tab], output: lastRun ? lastRun.output : "", error: lastRun ? lastRun.error : null };
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
      $("mInfo").hidden = LP.isDone(taskId) || window.matchMedia("(max-width: 820px), (max-height: 560px)").matches;   // layar kecil: ciut dulu, buka lewat tombol              // task baru: langkah terbuka; task yang sudah selesai: tertutup
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
  // ============================================================
  // PYTHON & PHP: kotak Output, tombol Jalankan/Stop, pilihan bahasa
  // Mesinnya ada di runner.js (berjalan di browser). Di sini hanya urusan tampilan.
  // ============================================================
  let sysEl = null;                                                   // baris status sementara ("Menyiapkan Python…")
  let pend = [], raf = 0;                                             // output menunggu ditulis ke layar (dikelompokkan per frame)
  function flushConsole() {
    raf = 0;
    if (!pend.length) return;
    const frag = document.createDocumentFragment();
    let cls = null, buf = "";
    const put = () => { if (!buf) return; const sp = document.createElement("span"); if (cls) sp.className = cls; sp.textContent = buf; frag.appendChild(sp); buf = ""; };
    pend.forEach((p) => { if (p[1] !== cls) { put(); cls = p[1]; } buf += p[0]; });
    put(); pend = [];
    outPre.appendChild(frag);
    consoleEl.scrollTop = consoleEl.scrollHeight;                     // satu kali per frame, bukan per baris (print di dalam loop tetap lancar)
  }
  function sysLine(t) { flushConsole(); if (!sysEl) { sysEl = document.createElement("span"); sysEl.className = "sys"; outPre.appendChild(sysEl); } sysEl.textContent = t + "\n"; }
  function dropSys() { if (sysEl) { sysEl.remove(); sysEl = null; } }
  function clearOutput() { pend = []; outPre.textContent = ""; sysEl = null; }
  function consoleAdd(text, cls) {
    if (!text) return;
    dropSys();
    pend.push([text, cls || ""]);
    if (!raf) raf = requestAnimationFrame(flushConsole);
  }
  const looksHtml = (t) => /<[a-z!\/]/i.test(t);

  function showOutput() {
    const php = mode === "php";
    frame.hidden = !(mode === "web" || (php && phpView === "view"));
    consoleEl.hidden = !(mode === "python" || (php && phpView === "text"));
    document.querySelectorAll("#outTabs button").forEach((b) => b.classList.toggle("on", b.dataset.v === phpView));
  }
  $("outTabs").addEventListener("click", (e) => { if (e.target.dataset.v) { phpView = e.target.dataset.v; showOutput(); } });

  // PHP: hasil echo ditampilkan sebagai halaman web (di iframe yang sama aman dengan preview HTML)
  function renderPhp() {
    const out = lastRun ? lastRun.output : "";
    const pre = (txt, color) => '<pre style="margin:0;white-space:pre-wrap;font:15px/1.5 Consolas,Menlo,monospace;color:' + color + '">' + esc(txt) + "</pre>";
    frame.srcdoc = buildDoc(looksHtml(out) ? out : pre(out, "#2b3350"), "");
  }

  function setRunning(on) {
    running = on;
    runBtn.disabled = on;
    runBtn.textContent = on ? "⏳ Berjalan…" : "▶ Jalankan";
    stopBtn.hidden = !(on && mode === "python");                       // PHP tidak bisa dihentikan di tengah jalan
  }

  async function execute() {
    if (!window.DCCRunner) {
      clearOutput(); consoleAdd("Mesin Python/PHP belum termuat. Muat ulang halaman ini.\n", "err");
      lastRun = { output: "", error: "runner belum termuat" }; showOutput(); return;
    }
    saveDraft();                                                       // simpan dulu supaya kode aman kalau tab macet
    lastRun = null; clearOutput(); stdinBox.classList.remove("need");
    setRunning(true);
    const cb = { onOutput: (t, err) => consoleAdd(t, err ? "err" : ""), onStatus: (t) => sysLine(t) };
    let res;
    try {
      res = mode === "python" ? await DCCRunner.python.run(code.python, stdinEl.value, cb) : await DCCRunner.php.run(code.php, cb);
    } catch (e) {
      res = { output: "", error: String(e && e.message || e) };
      consoleAdd(res.error + "\n", "err");
    }
    flushConsole(); dropSys();
    lastRun = { output: res.output || "", error: res.error || null };
    setRunning(false);
    if (!res.error && !lastRun.output) consoleAdd("(Program selesai, tetapi belum menampilkan tulisan apa pun. Coba pakai " + (mode === "python" ? "print()" : "echo") + ".)\n", "sys");
    flushConsole();
    if (res.error && /EOFError/.test(res.error)) stdinBox.classList.add("need");
    if (mode === "php") { phpView = looksHtml(lastRun.output) ? "view" : "text"; renderPhp(); showOutput(); }
    flashNote(res.stopped ? "⏹ Dihentikan" : res.error ? "⚠️ Ada error" : "✓ Selesai");
  }

  function warmup() { if (window.DCCRunner && isRun()) DCCRunner[mode].warmup(); }      // muat mesin lebih awal supaya Jalankan pertama tidak lama

  function applyModeUI() {
    const web = mode === "web";
    $("outTitle").textContent = web ? "🌐 Preview" : mode === "python" ? "🐍 Output" : "🐘 Hasil PHP";
    $("prevFoot").textContent = web ? "🔗 Tautan di preview tidak bisa diklik di sini. Itu normal, kodenya tetap benar!"
      : mode === "python" ? "🐍 Python berjalan di browsermu dan butuh internet saat pertama kali dimuat. turtle, pygame, dan tkinter belum bisa dipakai."
      : "🐘 PHP berjalan di browsermu dan butuh internet saat pertama kali dimuat. Belum terhubung ke database atau internet.";
    stdinBox.hidden = mode !== "python";
    $("outTabs").hidden = mode !== "php";
    note.textContent = defaultNote();
    document.querySelectorAll("#langs button").forEach((b) => b.classList.toggle("on", b.dataset.m === mode));
    if (mode === "python" && !outPre.textContent && !pend.length) consoleAdd("Klik ▶ Jalankan untuk melihat hasil programmu di sini.\n", "sys");
    if (mode === "php" && !lastRun) frame.srcdoc = buildDoc('<p style="font-family:sans-serif;color:#8a93b4">Klik ▶ Jalankan untuk melihat hasil PHP-mu di sini.</p>', "");
    showOutput();
  }

  // pilihan bahasa hanya di mode bebas; task dari jalur belajar sudah punya bahasanya sendiri
  $("langs").hidden = !!task;
  function switchMode(m) {
    if (task || running || m === mode || !MODES[m]) return;
    syncCode();
    mode = m; bahasa = MODES[m]; tab = bahasa[0]; lastRun = null;
    clearOutput(); buildTabs();
    ta.value = code[tab]; ta.scrollTop = 0; ta.scrollLeft = 0; paint();
    applyModeUI(); warmup();
    if (mode === "web") render();
    saveDraft();
  }
  $("langs").addEventListener("click", (e) => { if (e.target.dataset.m) switchMode(e.target.dataset.m); });

  async function run() {
    if (running) return;
    syncCode();
    if (isRun()) await execute(); else render();
    // Task SMP / SMA-SMK: program Python yang sudah jalan diperiksa → langkah yang sesuai dicentang otomatis
    if (mode === "python" && lastRun && window.SMPTaskPanel && typeof window.SMPTaskPanel.autoCheck === "function") {
      let maju = false;
      try { maju = !!window.SMPTaskPanel.autoCheck({ language: "python", code: code.python, output: lastRun.output, error: lastRun.error }); } catch (e) { console.warn("autoCheck gagal:", e); }
      // Task SMP / SMA-SMK: ▶ Jalankan ditekan tapi tidak ada langkah baru yang terpenuhi (atau programnya error)
      // = cek misi gagal → lapor ke server (dipakai untuk bonus percobaan pertama). Task yang sudah selesai tidak dilaporkan.
      try {
        const st = typeof window.SMPTaskPanel.getTask === "function" ? window.SMPTaskPanel.getTask() : null;
        const sid = st && st.nodeId + ":" + st.taskIndex;
        if (!maju && sid && !LP._get("smpTasks", {})[sid]) LP.laporGagal(sid);
      } catch (e) { console.warn("lapor gagal SMP:", e); }
    }
    if (!task) return;                                    // mode bebas: hanya preview / hasil
    const before = evaluate();
    const metOthers = before.slice(0, -1).every(Boolean);
    const runOk = !isRun() || !!(lastRun && !lastRun.error);      // python/php: programnya harus jalan tanpa error
    const pass = metOthers && runOk;
    const already = LP.isDone(taskId);
    let attemptNo = 0;
    if (!pass && !already) attemptNo = LP.addAttempt(taskId);
    if (pass) { ranOk = true; updateGoals(); }
    saveDraft();
    if (pass) return success(already);
    if (attemptNo) {
      const unmet = goals.filter((g, i) => i < before.length - 1 && !before[i]).map((g) => g.teks);
      if (!runOk) unmet.unshift("Programmu masih error. Baca pesan merah di kotak Output");
      fail(attemptNo, unmet.slice(0, 3));
    }
  }

  function fail(n, unmet) {
    popup({ type: "fail", emoji: "❌", title: "Belum berhasil!",
      html: '<p class="mp-info">Ini percobaan ke-' + n + ". Coba periksa lagi kodemu, lalu klik ▶ Jalankan.</p>",
      unmet: unmet, buttons: [{ label: "Coba lagi", cls: "mp-primary" }] });
  }

  async function success(already) {
    const nameLine = "Task " + task.no + " — " + task.title;
    const nx = LP.next(taskId);
    const buttons = [];
    if (nx) buttons.push({ label: nx.type === "project" ? "Lanjut ke Project Akhir 🏆" : "Task berikutnya →", cls: "mp-primary", fn: () => { window.location.href = LP.href(nx.id, "TextEditor"); } });
    buttons.push({ label: "Kembali ke jalur belajar", cls: "mp-secondary", fn: () => { window.location.href = "/belajar.html?p=" + info.pemb.id; } });
    buttons.push({ label: "Lanjut bereksperimen", cls: "mp-secondary" });
    if (already) {
      return popup({ type: "info", emoji: "✅", title: "Sudah selesai!", name: nameLine,
        html: '<p class="mp-info">Kamu sudah pernah menyelesaikan task ini, jadi tidak ada tambahan poin.</p>', buttons: buttons });
    }
    const r = LP.complete(taskId, LP.attempts(taskId) === 0);
    if (r && r.blocked) {                       // gerbang materi: materi belum dibaca sampai selesai
      return popup({ type: "info", emoji: "📖", title: "Baca materinya dulu ya!", name: nameLine,
        html: '<p class="mp-info">Task ini baru bisa diselesaikan setelah kamu membaca materinya sampai selesai.</p>',
        buttons: [{ label: "Baca Materi 📖", cls: "mp-primary", fn: () => { window.location.href = LP.materiHref(task, "/belajar.html?task=" + taskId); } },
                  { label: "Nanti saja", cls: "mp-secondary" }] });
    }
    const s = await r.ready;                    // poin & bonus dari jawaban server
    refreshPoints();
    let html = '<div class="mp-points"><b>+' + s.earned + "</b> poin</div>";
    if (s.bonus) html += '<div class="mp-bonus">⚡ Bonus percobaan pertama +' + s.bonus + "</div>";
    html += '<p class="mp-info">Poinmu sekarang: <b>⭐ ' + nowPoints() + "</b></p>";
    popup({ type: "ok", emoji: "🎉", title: "Hore, berhasil!", name: nameLine, html: html, buttons: buttons });
  }

  function reset() {
    popup({ type: "info", emoji: "🔄", title: "Mulai dari awal?",
      html: '<p class="mp-info">Semua kode yang kamu tulis akan diganti dengan kode awal.</p>',
      buttons: [{ label: "Ya, reset", cls: "mp-primary", fn: () => {
        bahasa.forEach((k) => { code[k] = awal[k]; });
        if (task && !bahasaCss()) code.css = "";
        lastRun = null; clearOutput();
        ta.value = code[tab]; paint(); render(); saveDraft(); updateGoals();
      } }, { label: "Batal", cls: "mp-secondary" }] });
  }
  function bahasaCss() { return bahasa.indexOf("css") >= 0; }

  function clearTab() {
    popup({ type: "info", emoji: "🧹", title: "Kosongkan " + TABS[tab].replace(/^\S+\s/, "") + "?",
      html: '<p class="mp-info">Semua tulisan di bagian ini akan dihapus.</p>',
      buttons: [{ label: "Ya, kosongkan", cls: "mp-primary", fn: () => {
        ta.value = ""; if (isRun()) { lastRun = null; clearOutput(); } paint(); render(); saveDraft(); updateGoals(); ta.focus();
      } }, { label: "Batal", cls: "mp-secondary" }] });
  }

    runBtn.addEventListener("click", run);
    stopBtn.addEventListener("click", () => { if (window.DCCRunner) DCCRunner.python.stop("⏹ Program dihentikan."); });
    $("resetBtn").addEventListener("click", reset);
    $("clearBtn").addEventListener("click", clearTab);

    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        run();
      }
    });   // Ctrl+Enter = Jalankan


    // ============================================================
    // AI TUTOR BRIDGE
    // ============================================================
    // Membuka akses terbatas agar ai-tutor.js bisa:
    // 1. membaca kode yang sedang ada di editor
    // 2. memasukkan kode hasil AI ke editor
    //
    // AI tidak bisa mengakses fungsi internal lainnya.
    // ============================================================

    window.DCCEditor = {
      getCode() {
        syncCode();

        return {
          html: code.html,
          css: code.css,
          python: code.python,
          php: code.php,
          tab: tab,
          mode: mode
        };
      },

      applyCode(next) {
        if (!next || typeof next !== "object") return;

        // Terapkan HTML hanya kalau AI mengirim HTML
        if (typeof next.html === "string") {
          code.html = next.html;
        }

        // Terapkan CSS hanya kalau AI mengirim CSS
        if (typeof next.css === "string") {
          code.css = next.css;
        }

        // Python / PHP (hanya kalau dikirim)
        if (typeof next.python === "string") code.python = next.python;
        if (typeof next.php === "string") code.php = next.php;

        // Sinkronkan kembali dengan textarea
        ta.value = code[tab] || "";

        // Perbarui editor + preview
        paint();
        render();

        // Simpan draft
        saveDraft();

        // Perbarui checklist task
        updateGoals();
      }
    };


    applyModeUI();
    warmup();
    render();
  })();
