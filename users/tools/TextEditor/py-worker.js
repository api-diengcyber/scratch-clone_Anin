// ============================================================
// PYTHON WORKER — menjalankan Python di browser memakai Pyodide
// Dijalankan di thread terpisah (Web Worker) supaya halaman tidak macet
// kalau kode anak punya perulangan tanpa akhir: runner.js tinggal menghentikan worker ini.
//
// Pesan dari runner.js : { type: "warmup" } | { type: "run", id, code, stdin }
// Pesan ke runner.js   : { type: "status", text } | { type: "started" }
//                        { type: "out", text, err } | { type: "done", id, error }
//
// Mengganti versi Pyodide: ubah PYODIDE_BASE di bawah.
// ============================================================
const PYODIDE_BASE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
importScripts(PYODIDE_BASE + "pyodide.js");

let pyodide = null;
let loading = null;
let queue = [];                                   // jawaban untuk input(), satu baris = satu input()

const post = (m) => self.postMessage(m);

// ---------- output: byte -> teks, dikirim per baris ----------
function makeSink(isErr) {
  const dec = new TextDecoder();
  let bytes = [];
  const flush = () => {
    if (!bytes.length) return;
    const text = dec.decode(Uint8Array.from(bytes), { stream: true });
    bytes = [];
    if (text) post({ type: "out", text: text, err: isErr });
  };
  return { raw: (b) => { bytes.push(b & 0xff); if (b === 10 || bytes.length >= 256) flush(); }, flush: flush };
}
const sinkOut = makeSink(false), sinkErr = makeSink(true);
const flushAll = () => { sinkOut.flush(); sinkErr.flush(); };

// input() versi editor ini: mengambil jawaban dari kotak "Input", lalu menampilkannya
// seperti di terminal (pertanyaan + jawaban). Kalau kotak input habis -> EOFError.
const SETUP = [
  "import builtins, sys",
  "def _dcc_input(prompt=''):",
  "    sys.stdout.flush()",
  "    v = __dcc_input(str(prompt))",
  "    if v is None:",
  "        raise EOFError('EOF when reading a line')",
  "    return v",
  "builtins.input = _dcc_input"
].join("\n");

async function init() {
  post({ type: "status", text: "⏳ Menyiapkan Python… (pertama kali butuh beberapa detik dan internet)" });
  pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
  pyodide.setStdout({ raw: sinkOut.raw });
  pyodide.setStderr({ raw: sinkErr.raw });
  pyodide.setStdin({ stdin: () => (queue.length ? queue.shift() : undefined) });
  pyodide.globals.set("__dcc_input", (prompt) => {
    flushAll();
    if (!queue.length) { post({ type: "out", text: String(prompt), err: false }); return undefined; }
    const v = queue.shift();
    post({ type: "out", text: String(prompt) + v + "\n", err: false });
    return v;
  });
  pyodide.runPython(SETUP);
  post({ type: "status", text: "✓ Python siap" });
}
const ready = () => (loading = loading || init().catch((e) => { loading = null; throw e; }));

function parseStdin(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();     // baris kosong di ujung = hanya Enter terakhir
  return lines;
}

async function run(msg) {
  try {
    await ready();
  } catch (e) {
    return post({ type: "done", id: msg.id, error: "[LOAD] " + (e && e.message || e) });
  }
  queue = parseStdin(msg.stdin);
  let error = null;
  try {
    // library yang di-import (mis. numpy) diunduh otomatis kalau tersedia di Pyodide
    try { await pyodide.loadPackagesFromImports(msg.code, { messageCallback: () => {}, errorCallback: () => {} }); } catch (e) { /* biar error asli muncul saat import */ }
    post({ type: "started" });
    const ns = pyodide.globals.get("dict")();               // ruang nama baru tiap kali Jalankan
    ns.set("__name__", "__main__");                         // supaya if __name__ == "__main__": jalan
    try { await pyodide.runPythonAsync(msg.code, { globals: ns }); }
    finally { ns.destroy(); }
  } catch (e) {
    error = String(e && e.message || e);
  }
  try { pyodide.runPython("import sys; sys.stdout.flush(); sys.stderr.flush()"); } catch (e) { /* abaikan */ }
  flushAll();
  post({ type: "done", id: msg.id, error: error });
}

self.onmessage = (ev) => {
  const m = ev.data || {};
  if (m.type === "warmup") ready().catch((e) => post({ type: "status", text: "⚠️ Python gagal dimuat: " + (e && e.message || e) }));
  else if (m.type === "run") run(m);
};
