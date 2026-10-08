// Panel "Task aktif" di editor (Text Editor / 3D Editor) untuk jalur SMP & SMA/SMK.
// Dibuka dari tombol "Mulai →" di halaman modul:  <editor>?smp=<id modul>&t=<nomor task>
//
// Panel ini yang mengurus:
//   • menampilkan langkah-langkah task,
//   • tombol "✓ Tandai task selesai" (status disimpan di kunci yang SAMA dengan halaman modul: smpTasks_<user>),
//   • tombol "← Kembali ke modul" yang benar (modul asal, bukan daftar tahap).
//
// API untuk AI Tutor (window.SMPTaskPanel: getTask / getSteps / setSteps) tidak berubah.
(function () {

  const q = new URLSearchParams(location.search);
  const nid = q.get("smp");

  if (!nid) return;

  const esc = (t) =>
    String(t).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

  const load = (src, cb) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  };

  load(
    "/kurikulum/data/jalur-data-smp.js?v=1",
    () => load("/kurikulum/data/jalur-data-smak.js?v=1", start)
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

    let ti = Math.min(Math.max(+q.get("t") || 0, 0), last);
    while (ti > 0 && !isOpen(ti)) ti--;      // alamat task yang masih terkunci → mundur ke task yang boleh dikerjakan

    let shut = false;
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
      ".smpP label{display:flex;gap:8px;margin:6px 0;cursor:default;user-select:none}" +
      ".smpP label input{cursor:default;pointer-events:none;accent-color:#34c06f;opacity:1}" +
      ".smpP label.done{color:#5dff8a;font-weight:700;text-shadow:0 0 8px rgba(93,255,138,.18)}" +
      ".smpP button,.smpP a{border:0;border-radius:10px;padding:6px 10px;background:#232b66;color:#cbd3ff;" +
        "text-decoration:none;font:inherit;cursor:pointer}" +
      ".smpP button:disabled{opacity:.45;cursor:not-allowed}" +
      ".smpP button:focus-visible,.smpP a:focus-visible{outline:3px solid #8fa2ff;outline-offset:2px}" +
      ".smpP .r{display:flex;gap:6px;justify-content:space-between;align-items:center;margin-top:8px}" +
      ".smpP small{opacity:.75}" +
      ".smpP .full{display:block;width:100%;text-align:center;margin-top:8px;padding:9px 10px;font-weight:700}" +
      ".smpP .ok{background:#34c06f;color:#fff}" +
      ".smpP .undo{background:#232b66;color:#cbd3ff;font-weight:600}" +
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
    document.body.appendChild(p);

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
        : '<button type="button" class="full ' + (dn ? "undo" : "ok") + '" data-d>' +
            (dn ? "↩ Batalkan selesai" : "✓ Tandai task selesai") + "</button>";

      p.innerHTML =
        '<div class="r"><small>' + esc(node.title) + '</small>' +
          '<button data-c aria-label="Tutup panel">—</button></div>' +
        "<h4>Task " + (ti + 1) + " dari " + node.tasks.length + ": " + esc(k.judul) +
          (dn ? '<span class="chip">✓ Selesai</span>' : "") + "</h4>" +
        langkah.map((l, i) =>
          '<label class="' + (c.includes(i) ? "done" : "") + '">' +
            '<input type="checkbox" data-i="' + i + '" aria-readonly="true"' + (c.includes(i) ? " checked" : "") + ">" +
            "<span>Langkah " + (i + 1) + ": " + esc(l) + "</span></label>"
        ).join("") +
        '<div class="r">' +
          '<button data-p' + (ti ? "" : " disabled") + ' aria-label="Task sebelumnya">◀</button>' +
          "<small>" + (ti + 1) + " / " + node.tasks.length + "</small>" +
          '<button data-n' + (canNext ? "" : " disabled") +
            ' aria-label="Task berikutnya"' +
            (ti < last && !dn ? ' title="Tandai task ini selesai dulu"' : "") + ">▶</button>" +
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

      // Tandai selesai / batalkan selesai
      if (b.closest("[data-d]")) {
        if (!isOpen(ti)) return;
        const mau = !isDone(ti);
        if (!setDone(ti, mau)) {
          notice = "⚠️ Gagal menyimpan. Penyimpanan browser penuh atau dimatikan.";
        } else if (mau) {
          notice = ti < last
            ? "🎉 Task selesai! Task berikutnya sudah terbuka."
            : "🎉 Task selesai! Semua task di modul ini sudah dikerjakan.";
        } else {
          notice = "Status selesai dibatalkan.";
        }
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

        // Gambar ulang panel supaya checkbox berubah.
        draw();

        console.log("✅ SMP checklist diperbarui:", { nodeId: nid, taskIndex: ti, steps: results, checked });
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
    // DEBUG
    // ============================================================
    console.log("✅ SMPTaskPanel siap:", window.SMPTaskPanel.getTask());

    // ============================================================
    // INITIAL RENDER
    // ============================================================
    draw();
  }

})();
