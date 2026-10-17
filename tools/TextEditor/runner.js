// ============================================================
// RUNNER — menjalankan kode Python & PHP LANGSUNG DI BROWSER (bukan di server)
//
//  • Python → Pyodide (WebAssembly) di Web Worker  → py-worker.js
//  • PHP    → php-wasm (WebAssembly)               → dimuat dari CDN
//
// Kenapa di browser? Kode anak tidak pernah menyentuh server, file backend, atau database,
// jadi aman. Konsekuensinya: butuh internet saat PERTAMA kali memuat mesinnya
// (setelah itu disimpan cache browser).
//
// API (dipakai editor.js):
//   DCCRunner.python.run(kode, inputText, cb) → Promise<{ output, error, stopped }>
//   DCCRunner.python.stop(pesan)               → hentikan program yang sedang jalan
//   DCCRunner.python.warmup()                  → muat mesin lebih awal
//   DCCRunner.php.run(kode, cb)                → Promise<{ output, error }>
//   DCCRunner.php.warmup()
//   cb = { onOutput(teks, isError), onStatus(teks) }
// ============================================================
(function () {

  // ---------- PENGATURAN (ubah di sini) ----------
  const PHP_URL = "https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs";   // untuk mengunci versi: ".../php-wasm@x.y.z/PhpWeb.mjs"
  const PY_TIMEOUT_MS = 20000;                                          // program Python dihentikan kalau jalan lebih lama dari ini
  const MAX_OUTPUT = 200000;                                            // batas jumlah karakter output (cegah print tanpa akhir)

  const HERE = document.currentScript ? document.currentScript.src : window.location.href;
  const noop = () => {};

  // ============================================================
  // PESAN ERROR YANG RAMAH
  // ============================================================
  const PY_HINT = [
    [/EOFError/, "Program meminta input, tetapi kotak Input kosong. Isi kotak Input di bawah (satu baris untuk setiap input())."],
    [/IndentationError/, "Rata kiri (spasi di awal baris) belum benar. Baris di dalam if / for / def harus menjorok ke dalam."],
    [/SyntaxError/, "Ada tulisan yang salah aturan. Periksa tanda kurung, tanda kutip, dan titik dua ( : ) di akhir if / for / def."],
    [/ModuleNotFoundError: No module named '(turtle|tkinter|pygame)'/, "Library ini butuh jendela gambar, jadi belum bisa dipakai di editor ini. Coba latihan dengan teks dulu."],
    [/ModuleNotFoundError/, "Library itu belum tersedia di editor ini."],
    [/NameError/, "Python belum kenal nama itu. Periksa ejaannya, atau pastikan variabelnya sudah dibuat sebelum dipakai."],
    [/ZeroDivisionError/, "Angka tidak bisa dibagi dengan nol."],
    [/TypeError/, "Jenis datanya tidak cocok. Contoh: menjumlah teks dengan angka. Coba ubah dengan int() atau str()."],
    [/ValueError/, "Nilainya tidak bisa diubah. Contoh: int('abc') gagal karena 'abc' bukan angka."],
    [/IndexError/, "Nomor urutan (index) melebihi isi list."],
    [/KeyError/, "Kunci itu tidak ada di dictionary."],
    [/AttributeError/, "Benda ini tidak punya fitur dengan nama itu. Periksa ejaan nama setelah tanda titik."],
    [/FileNotFoundError/, "File itu tidak ditemukan. Di editor ini, file hanya ada di memori selama program berjalan."],
    [/RecursionError/, "Fungsi memanggil dirinya terus tanpa berhenti. Periksa kasus dasar (kondisi berhenti)-nya."]
  ];

  // buang baris internal Pyodide dari traceback, ganti <exec> menjadi main.py, tambahkan 💡 petunjuk
  function formatPyError(raw) {
    const lines = String(raw || "").replace(/\r/g, "").split("\n");
    const keep = [];
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (/^\s+File "(\/lib\/python|[^"]*_pyodide)/.test(ln)) {            // 1 baris "File ..." + baris kode di bawahnya
        while (i + 1 < lines.length && /^\s{4,}\S/.test(lines[i + 1]) && !/^\s+File /.test(lines[i + 1])) i++;
        continue;
      }
      keep.push(ln.replace(/File "<exec>"/g, 'File "main.py"'));
    }
    const text = keep.join("\n").trim();
    const hint = PY_HINT.find((h) => h[0].test(text));
    return text + (hint ? "\n\n💡 " + hint[1] : "");
  }

  const LOAD_FAIL_PY = "Tidak bisa memuat mesin Python. Pastikan internet menyala, lalu klik ▶ Jalankan lagi.";
  const LOAD_FAIL_PHP = "Tidak bisa memuat mesin PHP. Pastikan internet menyala, lalu klik ▶ Jalankan lagi.";

  // ============================================================
  // PYTHON (Web Worker)
  // ============================================================
  const python = (function () {
    let worker = null, cur = null, timer = null;

    function ensure() {
      if (worker) return worker;
      const w = new Worker(new URL("py-worker.js?v=1", HERE));
      w.onmessage = (ev) => onMsg(w, ev.data || {});
      w.onerror = (ev) => {                                    // biasanya: script Pyodide gagal diunduh (offline)
        if (w !== worker) return;
        kill();
        finish({ error: LOAD_FAIL_PY });
      };
      worker = w;
      return w;
    }
    function kill() { clearTimeout(timer); timer = null; if (worker) { worker.terminate(); worker = null; } }

    function finish(res) {
      clearTimeout(timer); timer = null;
      const c = cur; cur = null;
      if (!c) return;
      if (res.error) c.cb.onOutput((c.out && !/\n$/.test(c.out) ? "\n" : "") + res.error + "\n", true);
      c.resolve({ output: c.out, error: res.error || null, stopped: !!res.stopped });
    }

    function onMsg(w, m) {
      if (w !== worker) return;
      if (m.type === "status") { if (cur) cur.cb.onStatus(m.text); else if (statusCb) statusCb(m.text); return; }
      if (!cur) return;
      if (m.type === "started") {
        timer = setTimeout(() => stop("⏱️ Programmu berjalan lebih dari " + (PY_TIMEOUT_MS / 1000) + " detik, jadi dihentikan.\n💡 Mungkin ada perulangan yang tidak pernah berhenti (misalnya while True tanpa break)."), PY_TIMEOUT_MS);
      } else if (m.type === "out") {
        if (!m.err) cur.out += m.text;
        cur.total += m.text.length;
        if (cur.total > MAX_OUTPUT) return stop("Output terlalu banyak, program dihentikan.\n💡 Mungkin ada print() di dalam perulangan yang tidak berhenti.");
        cur.cb.onOutput(m.text, m.err);
      } else if (m.type === "done") {
        if (m.id !== cur.id) return;
        if (m.error && m.error.indexOf("[LOAD]") === 0) { kill(); return finish({ error: LOAD_FAIL_PY }); }
        finish({ error: m.error ? formatPyError(m.error) : null });
      }
    }

    let statusCb = null, seq = 0;
    function stop(msg) {
      if (!worker) return;
      kill();                                                  // worker baru dibuat otomatis saat Jalankan berikutnya
      finish({ error: msg || "⏹ Program dihentikan.", stopped: true });
    }

    return {
      run(code, stdin, cb) {
        cb = Object.assign({ onOutput: noop, onStatus: noop }, cb);
        if (cur) return Promise.resolve({ output: "", error: "Program lain masih berjalan.", stopped: true });
        return new Promise((resolve) => {
          cur = { id: ++seq, resolve: resolve, cb: cb, out: "", total: 0 };
          try { ensure().postMessage({ type: "run", id: cur.id, code: String(code), stdin: String(stdin || "") }); }
          catch (e) { finish({ error: LOAD_FAIL_PY }); }
        });
      },
      stop: stop,
      warmup(onStatus) { statusCb = onStatus || null; try { ensure().postMessage({ type: "warmup" }); } catch (e) { /* abaikan */ } },
      get running() { return !!cur; }
    };
  })();

  // ============================================================
  // PHP (php-wasm, di thread utama)
  // PHP tidak bisa dihentikan di tengah jalan; latihan PHP anak umumnya pendek.
  // Tiap Jalankan memakai mesin baru supaya bersih dari sisa program sebelumnya.
  // ============================================================
  const php = (function () {
    let modPromise = null, busy = false;
    const loadMod = () => (modPromise = modPromise || import(PHP_URL).catch((e) => { modPromise = null; throw e; }));
    const norm = (d) => Array.isArray(d) ? d.join("") : (d == null ? "" : String(d));
    const PHP_FATAL = /(^|\n)\s*(PHP\s+)?(Parse error|Fatal error)/i;

    return {
      async run(code, cb) {
        cb = Object.assign({ onOutput: noop, onStatus: noop }, cb);
        if (busy) return { output: "", error: "Program lain masih berjalan." };
        busy = true;
        let out = "";
        try {
          cb.onStatus("⏳ Menyiapkan PHP… (pertama kali butuh beberapa detik dan internet)");
          let mod;
          try { mod = await loadMod(); } catch (e) { cb.onOutput(LOAD_FAIL_PHP + "\n", true); return { output: "", error: LOAD_FAIL_PHP }; }
          const engine = new mod.PhpWeb();
          engine.addEventListener("output", (ev) => { const t = norm(ev.detail); out += t; cb.onOutput(t, false); });
          engine.addEventListener("error", (ev) => { cb.onOutput(norm(ev.detail), true); });
          try { if (engine.binary && typeof engine.binary.then === "function") await engine.binary; }
          catch (e) { cb.onOutput(LOAD_FAIL_PHP + "\n", true); return { output: "", error: LOAD_FAIL_PHP }; }
          cb.onStatus("▶ Menjalankan…");
          try { await engine.run(String(code)); }
          catch (e) { const msg = String(e && e.message || e); cb.onOutput("\n" + msg + "\n", true); return { output: out, error: msg }; }
          if (PHP_FATAL.test(out)) {                                // error PHP sudah tampil di output; tambahkan petunjuk saja
            cb.onOutput("\n\n💡 Periksa titik koma ( ; ) di akhir baris, tanda kurung, dan tanda kutip, lalu klik ▶ Jalankan lagi.\n", true);
            return { output: out, error: "Ada error di kode PHP-mu." };
          }
          return { output: out, error: null };
        } finally { busy = false; }
      },
      warmup() { loadMod().catch(noop); },
      get running() { return busy; }
    };
  })();

  window.DCCRunner = { python: python, php: php };
})();
