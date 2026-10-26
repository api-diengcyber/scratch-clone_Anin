// Panel "Task aktif" di editor (Text Editor / 3D Editor) untuk jalur SMP & SMA/SMK.
// Dibuka dari tombol "Mulai →" di halaman modul:  <editor>?smp=<id modul>&t=<nomor task>
//
// Panel ini yang mengurus:
//   • menampilkan langkah-langkah task,
//   • penyelesaian task OTOMATIS: begitu semua langkah tercentang (oleh AI Tutor), task ditandai selesai
//     (status disimpan di kunci yang SAMA dengan halaman modul: smpTasks_<user>). Tidak ada tombol tandai selesai manual.
//   • tombol "← Kembali ke modul" yang benar (modul asal, bukan daftar tahap).
//
// API untuk AI Tutor (window.SMPTaskPanel: getTask / getSteps / setSteps) tidak berubah.
(function () {

  const q = new URLSearchParams(location.search);
  const nid = q.get("smp");

  if (!nid) return;

  const esc = window.DCUtils.esc;

  const load = (src, cb) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  };

  load(
    "/kurikulum/data/jalur-data-smp.js?v=20261019",
    () => load("/kurikulum/data/jalur-data-smak.js?v=20261019", start)
  );

  function start() {

    const tr = (window.LP_SMP || [])
      .concat(window.LP_SMAK || [])
      .find((t) => t.nodes.some((n) => n.id === nid));

    if (!tr) {
      console.warn("SMPTaskPanel: jalur untuk node tidak ditemukan:", nid);
      return;
    }

    const node = tr.nodes.find((n) => n.id === nid);

    if (!node || !Array.isArray(node.tasks) || !node.tasks.length) {
      console.warn("SMPTaskPanel: task tidak ditemukan:", nid);
      return;
    }

    // Halaman modul asal (alamat ABSOLUT — alamat relatif dari /tools/... akan salah arah)
    const modUrl = (tr.grade === "smak" ? "/belajar-smk.html" : "/belajar-smp.html") + "?p=" + encodeURIComponent(nid);
    const last = node.tasks.length - 1;

    // ============================================================
    // STATUS TASK (sama dengan LP._get/_set("smpTasks") di halaman modul)
    // ============================================================
    const user = () =>
      localStorage.getItem("username") || localStorage.getItem("scratch_user") || "tamu";
    const doneKey = () => "smpTasks_" + user();
    const doneMap = () => {
      try { return JSON.parse(localStorage.getItem(doneKey())) || {}; } catch (e) { return {}; }
    };
    const isDone = (i) => !!doneMap()[nid + ":" + i];
    const setDone = (i, v) => {
      const m = doneMap();
      if (v) m[nid + ":" + i] = 1; else delete m[nid + ":" + i];
      try { localStorage.setItem(doneKey(), JSON.stringify(m)); return true; } catch (e) { return false; }
    };
    // Task terbuka kalau task pertama atau task sebelumnya sudah selesai (aturan yang sama dengan halaman modul)
    const isOpen = (i) => i === 0 || isDone(i - 1);

    // Tandai selesai task yang semua langkahnya sudah tercentang tapi belum tertandai (sebelum panel menentukan task aktif)
    try { if (window.LP && typeof window.LP.syncSmpFromSteps === "function") window.LP.syncSmpFromSteps([tr]); } catch (e) { console.warn("SMPTaskPanel: sinkron status gagal.", e); }

    let ti = Math.min(Math.max(+q.get("t") || 0, 0), last);
    while (ti > 0 && !isOpen(ti)) ti--;      // alamat task yang masih terkunci → mundur ke task yang boleh dikerjakan

    let shut = window.matchMedia("(max-width: 1099px)").matches;   // layar kecil: mulai diciutkan agar tidak menutupi editor
    let notice = "";                           // pesan singkat setelah menandai selesai

    // ============================================================
    // STYLE
    // ============================================================
    const st = document.createElement("style");
    st.textContent =
      ".smpP{position:fixed;top:64px;right:12px;width:290px;max-height:76vh;overflow:auto;z-index:9000;" +
        "background:#161c47;color:#e8ecff;border:2px solid " + tr.c + ";border-radius:18px;padding:12px 14px;" +
        "font:14px/1.45 'Trebuchet MS',Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4)}" +
      ".smpP h4{margin:2px 0 6px}" +
      // Checkbox hanya visual (diubah lewat setSteps oleh AI Tutor).
      ".smpP .stp{display:flex;gap:8px;margin:6px 0;cursor:default;user-select:none}" +
      ".smpP .stp input{cursor:default;pointer-events:none;accent-color:#34c06f;opacity:1;flex:none}" +
      ".smpP .stp.done{color:#5dff8a;font-weight:700;text-shadow:0 0 8px rgba(93,255,138,.18)}" +
      ".smpP button,.smpP a{border:0;border-radius:10px;padding:6px 10px;background:#232b66;color:#cbd3ff;" +
        "text-decoration:none;font:inherit;cursor:pointer}" +
      ".smpP button:disabled{opacity:.45;cursor:not-allowed}" +
      ".smpP button:focus-visible,.smpP a:focus-visible{outline:3px solid #8fa2ff;outline-offset:2px}" +
      ".smpP .r{display:flex;gap:6px;justify-content:space-between;align-items:center;margin-top:8px}" +
      ".smpP small{opacity:.75}" +
      ".smpP .full{display:block;width:100%;text-align:center;margin-top:8px;padding:9px 10px;font-weight:700}" +
      ".smpP .ok{background:#34c06f;color:#fff}" +
      ".smpP .auto{margin-top:8px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.06);font-size:13px;text-align:center;opacity:.85}" +
      ".smpP .back{background:#eef1ff;color:#3d4bb8}" +
      ".smpP .note{background:rgba(52,192,111,.16);color:#7dffa6;border-radius:10px;padding:8px 10px;margin-top:8px;font-weight:700}" +
      ".smpP .chip{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:10px;background:rgba(52,192,111,.2);color:#7dffa6;font-size:12px;font-weight:700}" +
      ".smpP.min{width:auto;padding:8px 12px}" +
      "@media (max-width:640px){.smpP{top:auto;bottom:10px;left:10px;right:10px;width:auto;max-height:46vh}}";
    document.head.appendChild(st);

    // ============================================================
    // PANEL
    // ============================================================
    const p = document.createElement("aside");
    p.className = "smpP";
    p.setAttribute("aria-label", "Task aktif");
    (document.getElementById("editorDock") || document.body).appendChild(p);   // editor yang punya #editorDock menata panel ini bersama Tutor AI

    // ============================================================
    // STORAGE (centang langkah — hanya visual)
    // ============================================================
    const key = () => "smpSteps_" + nid + "_" + ti;
    const get = () => {
      try {
        const value = JSON.parse(localStorage.getItem(key()));
        return Array.isArray(value) ? value : [];
      } catch (e) {
        return [];
      }
    };

    // ============================================================
    // PEMERIKSA LANGKAH OTOMATIS (Python) — dipanggil editor setelah ▶ Jalankan
    // ============================================================
    // Sebuah langkah dicentang otomatis HANYA kalau teksnya menyebut sesuatu yang bisa diperiksa dari kode
    // (variabel, print(), input(), if, for, def, class, dst.) dan semua yang disebut itu memang ada di kode,
    // dan programnya jalan tanpa error. Langkah yang tidak bisa diperiksa mesin (menulis kesimpulan, mencatat,
    // dll.) tidak disentuh — itu tetap dinilai Tutor AI. Centang yang sudah ada tidak pernah dicabut.
    const stripComments = (src) => String(src || "").split("\n").map((line) => {
      let q = null;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) { if (ch === "\\") i++; else if (ch === q) q = null; }
        else if (ch === '"' || ch === "'") q = ch;
        else if (ch === "#") return line.slice(0, i);
      }
      return line;
    }).join("\n");

    const NAMA_BUKAN_VARIABEL = ["bertipe", "lalu", "di", "yang", "untuk", "dengan", "dalam", "sebagai", "berisi", "baru", "bawaan"];
    const RULES = [
      { re: /variabel/i, test: (c, o, t) => {
          const m = t.match(/variabel\s+([a-z_][a-z_0-9]*)/i);
          const n = m && NAMA_BUKAN_VARIABEL.indexOf(m[1].toLowerCase()) < 0 ? m[1] : null;
          return n ? new RegExp("\\b" + n + "\\s*=(?!=)").test(c) : /(^|\n)\s*[A-Za-z_]\w*\s*=(?!=)/.test(c);
        } },
      { re: /print\(\)|\bcetak\b|\btampilkan\b/i, test: (c, o) => /\bprint\s*\(/.test(c) && !!String(o || "").trim() },
      { re: /input\(\)|\bminta\b.*\b(pengguna|input)\b/i, test: (c) => /\binput\s*\(/.test(c) },
      { re: /\bint\(\)|\bke int\b/i, test: (c) => /\bint\s*\(/.test(c) },
      { re: /\bfloat\b/i, test: (c) => /\bfloat\s*\(|\d+\.\d+/.test(c) },
      { re: /\btype\(\)/i, test: (c) => /\btype\s*\(/.test(c) },
      { re: /f-string/i, test: (c) => /\bf(["'])/.test(c) },
      { re: /if\/elif|\bif\b.*\belse\b/i, test: (c) => /\bif\b/.test(c) && /\belif\b/.test(c) && /\belse\b/.test(c) },
      { re: /\bwhile\b/i, test: (c) => /\bwhile\b/.test(c) },
      { re: /\bfor\b/i, test: (c) => /\bfor\b/.test(c) },
      { re: /perulangan/i, test: (c) => /\b(for|while)\b/.test(c) },
      { re: /\brange\(\)/i, test: (c) => /\brange\s*\(/.test(c) },
      { re: /\b(buat|tulis)\s+(fungsi\s+)?([a-z_]\w*)\(/i, test: (c, o, t) => {
          const m = t.match(/\b(?:buat|tulis)\s+(?:fungsi\s+)?([a-z_]\w*)\(/i);
          return new RegExp("\\bdef\\s+" + m[1] + "\\s*\\(").test(c);
        } },
      { re: /\bmethod\s+[a-z_]\w*\(/i, test: (c, o, t) => {
          const m = t.match(/\bmethod\s+([a-z_]\w*)\(/i);
          return new RegExp("\\bdef\\s+" + m[1] + "\\s*\\(").test(c);
        } },
      { re: /\bclass\s+[A-Z]\w*/, test: (c, o, t) => {
          const m = t.match(/\bclass\s+([A-Z]\w*)/);
          return new RegExp("\\bclass\\s+" + m[1] + "\\b").test(c);
        } },
      { re: /\bclass\b(?!\s+[A-Z])/i, test: (c) => /\bclass\s+\w+/.test(c) },
      { re: /\breturn\b/i, test: (c) => /\breturn\b/.test(c) },
      { re: /\blambda\b/i, test: (c) => /\blambda\b/.test(c) },
      { re: /comprehension/i, test: (c) => /\[[^\]]*\bfor\b[^\]]*\]/.test(c) },
      { re: /math\.pi/i, test: (c) => /math\.pi\b/.test(c) },
      { re: /math\.sqrt/i, test: (c) => /math\.sqrt\s*\(/.test(c) },
      { re: /impor modul statistics/i, test: (c) => /\b(import\s+statistics|from\s+statistics\s+import)/.test(c) },
      { re: /try\/except/i, test: (c) => /\btry\b/.test(c) && /\bexcept\b/.test(c) },
      { re: /json\.dump/i, test: (c) => /json\.dump/.test(c) },
      { re: /json\.load/i, test: (c) => /json\.load/.test(c) },
      { re: /\bsum\(\)/i, test: (c) => /\bsum\s*\(/.test(c) },
      { re: /\blen\(\)/i, test: (c) => /\blen\s*\(/.test(c) },
      { re: /\bmax\(\)/i, test: (c) => /\bmax\s*\(/.test(c) },
      { re: /\bappend\(\)/i, test: (c) => /\.append\s*\(/.test(c) },
      { re: /\binsert\(\)/i, test: (c) => /\.insert\s*\(/.test(c) },
      { re: /\bremove\(\)/i, test: (c) => /\.remove\s*\(/.test(c) },
      { re: /\bpop\(\)/i, test: (c) => /\.pop\s*\(/.test(c) },
      { re: /\bsort\(\)/i, test: (c) => /\.sort\s*\(|\bsorted\s*\(/.test(c) },
      { re: /\breverse\(\)/i, test: (c) => /\.reverse\s*\(/.test(c) },
      { re: /\bset\(\)/i, test: (c) => /\bset\s*\(/.test(c) },
      { re: /\bdict\b/i, test: (c) => /\bdict\s*\(|\{[^}]*:[^}]*\}/.test(c) }
    ];
    const checkStep = (text, code, output) => {
      const t = String(text || "");
      const hit = RULES.filter((r) => r.re.test(t));
      return hit.length > 0 && hit.every((r) => { try { return r.test(code, output, t); } catch (e) { return false; } });
    };

    // Hasil centang setelah program dijalankan. Langkah yang punya aturan cek dinilai ketat (kode harus memuatnya).
    // Langkah yang TIDAK bisa dicek mesin (menulis kesimpulan, menghitung, dll.) ikut tercentang kalau programnya
    // menampilkan output dan SEMUA langkah yang bisa dicek sudah lolos — jadi task bisa selesai lewat ▶ Jalankan.
    // Task tanpa satu pun langkah yang bisa dicek tidak pernah dicentang otomatis.
    const decideSteps = (langkah, prev, code, output) => {
      const rulable = langkah.map((t) => RULES.some((r) => r.re.test(String(t || ""))));
      const strict = langkah.map((t, i) => prev.includes(i) || (rulable[i] && checkStep(t, code, output)));
      const lenient = rulable.some(Boolean) && !!String(output || "").trim() && langkah.every((t, i) => !rulable[i] || strict[i]);
      return langkah.map((t, i) => strict[i] || (lenient && !rulable[i]));
    };

    // ============================================================
    // DRAW
    // ============================================================
    function draw() {
      if (shut) {
        p.className = "smpP min";
        p.innerHTML = '<button data-o aria-label="Buka panel task">📋 Task aktif</button>';
        return;
      }

      p.className = "smpP";
      const k = node.tasks[ti];
      const c = get();
      const dn = isDone(ti);
      const langkah = Array.isArray(k.langkah) ? k.langkah : [];
      const canNext = ti < last && dn;           // task berikutnya baru terbuka kalau task ini sudah ditandai selesai

      const aksi = k.kumpul
        // Final Project: pengumpulan (link/catatan) ada di halaman modul
        ? '<a class="full ok" href="' + modUrl + '">📤 Buka halaman pengumpulan</a>'
        // Task biasa: selesai otomatis saat semua langkah tercentang — hanya keterangan, bukan tombol
        : '<div class="auto">' + (dn
            ? "✓ Task selesai"
            : "Task selesai otomatis setelah semua langkah tercentang.") + "</div>";

      p.innerHTML =
        '<div class="r"><small>' + esc(node.title) + '</small>' +
          '<button data-c aria-label="Tutup panel">—</button></div>' +
        "<h4>Task " + (ti + 1) + " dari " + node.tasks.length + ": " + esc(k.judul) +
          (dn ? '<span class="chip">✓ Selesai</span>' : "") + "</h4>" +
        langkah.map((l, i) =>
          '<div class="stp ' + (c.includes(i) ? "done" : "") + '">' +
            // disabled + tabindex -1: siswa tidak bisa mencentang lewat klik, teks, maupun keyboard.
            '<input type="checkbox" disabled tabindex="-1" aria-label="Langkah ' + (i + 1) + (c.includes(i) ? ' selesai' : ' belum selesai') + '"' + (c.includes(i) ? " checked" : "") + ">" +
            "<span>Langkah " + (i + 1) + ": " + esc(l) + "</span></div>"
        ).join("") +
        '<div class="r">' +
          '<button data-p' + (ti ? "" : " disabled") + ' aria-label="Task sebelumnya">◀</button>' +
          "<small>" + (ti + 1) + " / " + node.tasks.length + "</small>" +
          '<button data-n' + (canNext ? "" : " disabled") +
            ' aria-label="Task berikutnya"' +
            (ti < last && !dn ? ' title="Selesaikan semua langkah task ini dulu"' : "") + ">▶</button>" +
        "</div>" +
        (notice ? '<div class="note" role="status">' + notice + "</div>" : "") +
        aksi +
        '<a class="full back" href="' + modUrl + '">← Kembali ke modul</a>';
      notice = "";
    }

    // ============================================================
    // PANEL NAVIGATION
    // ============================================================
    p.addEventListener("click", (e) => {
      const b = e.target;

      // Tutup panel
      if (b.closest("[data-c]")) {
        shut = true;
        draw();
        const btn = p.querySelector("button");
        if (btn) btn.focus();
        return;
      }

      // Buka panel
      if (b.closest("[data-o]")) {
        shut = false;
        draw();
        return;
      }

      // Task sebelumnya
      if (b.closest("[data-p]") && ti > 0) {
        ti--;
        draw();
        return;
      }

      // Task berikutnya (hanya kalau task ini sudah selesai)
      if (b.closest("[data-n]") && ti < last && isDone(ti)) {
        ti++;
        draw();
        return;
      }
    });

    // Kalau status berubah di tab lain (mis. halaman modul), panel ikut segar.
    window.addEventListener("storage", (e) => { if (e.key === doneKey()) { while (ti > 0 && !isOpen(ti)) ti--; draw(); } });

    // ============================================================
    // AI TUTOR API
    // ============================================================
    //
    // TIDAK ADA "change" EVENT.
    //
    // Checkbox tidak pernah membaca klik user.
    // Perubahan checklist HANYA melalui setSteps().
    // ============================================================
    window.SMPTaskPanel = {
      // ----------------------------------------------------------
      // TASK AKTIF
      // ----------------------------------------------------------
      getTask() {
        const current = node.tasks[ti];
        return {
          nodeId: nid,
          taskIndex: ti,
          task: {
            judul: current.judul || "",
            langkah: Array.isArray(current.langkah) ? current.langkah : []
          }
        };
      },

      // ----------------------------------------------------------
      // STATE CHECKLIST
      // ----------------------------------------------------------
      getSteps() {
        return get();
      },

      // ----------------------------------------------------------
      // PERIKSA OTOMATIS dari kode + output (dipanggil editor setelah ▶ Jalankan)
      // ctx: { language, code, output, error }. Hanya menambah centang, tidak pernah mencabut.
      // ----------------------------------------------------------
      autoCheck(ctx) {
        if (!ctx || ctx.error || ctx.language !== "python") return false;
        const code = stripComments(ctx.code);
        if (!code.trim()) return false;
        const langkah = Array.isArray(node.tasks[ti].langkah) ? node.tasks[ti].langkah : [];
        if (!langkah.length) return false;
        const prev = get();
        const next = decideSteps(langkah, prev, code, ctx.output);
        const changed = next.some((v, i) => v !== prev.includes(i));
        if (!changed && !(next.every(Boolean) && !isDone(ti))) return false;
        return window.SMPTaskPanel.setSteps(next);
      },

      // ----------------------------------------------------------
      // SATU-SATUNYA CARA MENGUBAH CHECKLIST
      // ----------------------------------------------------------
      //
      // Contoh:  setSteps([true, false, true])
      //
      // Hasil:   ✅ Langkah 1 · ☐ Langkah 2 · ✅ Langkah 3
      // ----------------------------------------------------------
      setSteps(results) {
        if (!Array.isArray(results)) {
          console.warn("SMPTaskPanel.setSteps: results harus berupa array.");
          return false;
        }

        const langkah = Array.isArray(node.tasks[ti].langkah) ? node.tasks[ti].langkah : [];
        const max = langkah.length;

        const checked = results
          .slice(0, max)
          .map((value, index) => (value === true ? index : null))
          .filter((index) => index !== null);

        try {
          localStorage.setItem(key(), JSON.stringify(checked));
        } catch (e) {
          console.error("SMPTaskPanel: gagal menyimpan checklist.", e);
          return false;
        }

        // Semua langkah tercentang → task otomatis selesai (task Final Project dikumpulkan lewat halaman modul).
        const cur = node.tasks[ti];
        if (max > 0 && checked.length === max && !cur.kumpul && isOpen(ti) && !isDone(ti)) {
          const LPx = window.LP;
          let r = null;
          try {
            // LP.completeSmp = tandai selesai + beri koin (sekali per task) + simpan ke server
            r = LPx && typeof LPx.completeSmp === "function"
              ? LPx.completeSmp(nid, ti, { judul: node.title + " — " + (cur.judul || "Task " + (ti + 1)), project: !!cur.project, poin: cur.poin })
              : null;
          } catch (e) { console.error("SMPTaskPanel: gagal memberi koin.", e); }
          if (!r) setDone(ti, true);          // LP tidak tersedia → minimal status selesai tetap tersimpan

          const pv = document.getElementById("pointsValue");
          if (pv && LPx && typeof LPx.saldo === "function") pv.textContent = LPx.saldo();

          if (isDone(ti)) {
            notice = (ti < last
              ? "🎉 Semua langkah selesai! Task berikutnya sudah terbuka."
              : "🎉 Semua langkah selesai! Semua task di modul ini sudah dikerjakan.");
            // Koin & bonus dari jawaban server: tambahkan ke pesan begitu tiba, lalu segarkan angka koin
            if (r && r.ready) r.ready.then((s) => {
              if (s && s.earned) notice += " +" + s.earned + " koin!" + (s.bonus ? " ⚡ +" + s.bonus + " bonus percobaan pertama!" : "");
              const pv2 = document.getElementById("pointsValue");
              if (pv2 && LPx && typeof LPx.saldo === "function") pv2.textContent = LPx.saldo();
              draw();
            });
          } else if (r && r.blocked) {
            notice = "📖 Semua langkah sudah tercentang, tapi baca materinya sampai selesai dulu ya. Setelah itu task ini otomatis selesai.";
          } else {
            notice = "⚠️ Gagal menyimpan. Penyimpanan browser penuh atau dimatikan.";
          }
        }

        // Gambar ulang panel supaya checkbox berubah.
        draw();

        return true;
      }
    };

    // ============================================================
    // BACK LINK di header editor → modul asal
    // ============================================================
    const bl = document.getElementById("backLink");
    if (bl) {
      bl.href = modUrl;
      bl.textContent = "← Kembali ke modul";
    }

    // ============================================================
    // INITIAL RENDER
    // ============================================================
    draw();
  }

})();
