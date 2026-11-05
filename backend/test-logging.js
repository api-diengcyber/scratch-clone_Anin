// Regresi logging request:
//  1. Log request benar-benar tertulis (dulu method pino dipanggil tanpa `this`,
//     TypeError-nya ditelan catch kosong, jadi tidak ada log sama sekali).
//  2. Token tautan laporan wali tidak pernah muncul di log.
"use strict";

const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { redactPathForLog } = require("./log-redact");

const PORT = 3112;
const TMP = path.join(os.tmpdir(), `dcc-logging-${process.pid}`);
const results = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function record(name, pass, detail) {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : ` — ${detail}`}`);
}
const eq = (name, got, want) => record(name, got === want, `dapat ${JSON.stringify(got)}, harap ${JSON.stringify(want)}`);

async function main() {
  // --- unit: fungsi penyaring ---
  eq("redact: token diganti placeholder", redactPathForLog("/api/reports/abc123"), "/api/reports/:token");
  eq("redact: huruf besar-kecil path tidak menghindari", redactPathForLog("/API/Reports/abc123"), "/API/Reports/:token");
  eq("redact: bagian setelah token dipertahankan", redactPathForLog("/api/reports/abc123/extra"), "/api/reports/:token/extra");
  eq("redact: path lain tidak diubah", redactPathForLog("/api/progress/budi"), "/api/progress/budi");
  eq("redact: awalan mirip tidak diubah", redactPathForLog("/api/reportsx/abc"), "/api/reportsx/abc");
  eq("redact: nilai kosong aman", redactPathForLog(undefined), "");

  // --- end-to-end: jalankan server dengan LOG_LEVEL=info ---
  let out = "";
  const child = spawn(process.execPath, ["server.js"], {
    cwd: __dirname,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      DB_PATH: `${TMP}.sqlite`,
      PLUGIN_DIR: `${TMP}-plugins`,
      LOG_LEVEL: "info"
    }
  });
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { out += d; });

  try {
    let up = false;
    for (let i = 0; i < 80 && !up; i++) {
      try { up = (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok; } catch (_) { await sleep(250); }
    }
    record("server hidup dengan LOG_LEVEL=info", up, "server tidak merespons");
    if (!up) return;

    const token = crypto.randomBytes(32).toString("base64url");
    const res = await fetch(`http://127.0.0.1:${PORT}/api/reports/${token}`, { headers: { Accept: "application/json" } });
    const reqId = res.headers.get("x-request-id");
    await sleep(500);

    const lines = out.split("\n").filter((line) => line.startsWith("{") && line.includes('"reqId"'));
    const parsed = lines.map((line) => { try { return JSON.parse(line); } catch (_) { return null; } }).filter(Boolean);
    const entry = parsed.find((row) => row.reqId === reqId);

    record("log request tertulis (ada baris dengan reqId)", Boolean(entry), "tidak ada baris log untuk request ini");
    if (entry) {
      eq("log: status 404 dicatat", entry.status, 404);
      eq("log: level warn untuk status >= 400", entry.level, 40);
      eq("log: path memakai placeholder", entry.path, "/api/reports/:token");
    }
    record("token tidak muncul di output server", !out.includes(token), "token mentah ada di log");

    const health = parsed.find((row) => row.path === "/api/health");
    record("request 200 dicatat di level info", Boolean(health) && health.level === 30 && health.status === 200,
      "baris /api/health (info, 200) tidak ada");
  } finally {
    child.kill();
    await sleep(300);
    for (const f of [`${TMP}.sqlite`, `${TMP}.sqlite-wal`, `${TMP}.sqlite-shm`]) { try { fs.unlinkSync(f); } catch (_) {} }
    try { fs.rmSync(`${TMP}-plugins`, { recursive: true, force: true }); } catch (_) {}
  }
}

main().catch((error) => { record("test berjalan tanpa exception", false, error.message); }).finally(() => {
  const passed = results.filter(Boolean).length;
  console.log(`${passed}/${results.length} lolos`);
  process.exit(passed === results.length ? 0 : 1);
});