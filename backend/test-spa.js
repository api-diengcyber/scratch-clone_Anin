// Tes URL bersih SPA admin: /admin/<view> harus mengembalikan index.html (200)
// walau halaman di-refresh/dibuka langsung, dan daftar view di backend harus
// sinkron dengan VIEWS di Admin/static/kurikulum.js.
// Jalankan: node test-spa.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 3118;
const TMPDB = path.join(os.tmpdir(), `dcc-test-spa-${process.pid}.sqlite`);
const PLUGIN_DIR = path.join(os.tmpdir(), `dcc-test-spa-plugins-${process.pid}`);

for (const file of [TMPDB, TMPDB + "-shm", TMPDB + "-wal"]) {
  try { fs.unlinkSync(file); } catch {}
}
fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });

process.env.DB_PATH = TMPDB;
process.env.NODE_ENV = "test";
process.env.PORT = String(PORT);
process.env.PLUGIN_DIR = PLUGIN_DIR;
process.env.REPORT_EMAIL_ENABLED = "false";
process.env.LOG_LEVEL = "error";

const db = require("./database");
const ADMIN_VIEWS = require("./admin-views");

const B = `http://127.0.0.1:${PORT}`;

const child = spawn(process.execPath, ["server.js"], {
  cwd: __dirname,
  env: { ...process.env }
});
let out = "";
child.stdout.on("data", (d) => { out += d; });
child.stderr.on("data", (d) => { out += d; });

function waitReady() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (out.includes("DIENG CYBER CODING - SERVER") && out.includes(`API      : http://localhost:${PORT}`)) {
        clearInterval(iv);
        resolve();
      } else if (child.exitCode !== null) {
        clearInterval(iv);
        reject(new Error("Server berhenti sebelum siap. Output:\n" + out));
      } else if (Date.now() - t0 > 60000) {
        clearInterval(iv);
        reject(new Error("Server tidak siap dalam 60 detik. Output:\n" + out));
      }
    }, 100);
  });
}

const results = [];
async function t(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + " - " + e.message]);
  }
}
function eq(got, want, msg) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${msg}: dapat ${JSON.stringify(got)}, harap ${JSON.stringify(want)}`);
  }
}
function ok(value, msg) {
  if (!value) throw new Error(msg);
}

// VIEWS pada frontend dibaca langsung dari kurikulum.js supaya tes ini gagal
// bila ada view baru yang lupa didaftarkan di admin-views.js.
function frontendViews() {
  const file = path.join(__dirname, "..", "Admin", "static", "kurikulum.js");
  const src = fs.readFileSync(file, "utf8");
  const m = src.match(/const VIEWS = \[([\s\S]*?)\];/);
  ok(m, "VIEWS tidak ditemukan di kurikulum.js");
  return [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] || x[2]);
}

const LEGACY = new Set(["jadwal"]);

async function main() {
  await waitReady();

  const views = frontendViews();

  await t("spa: VIEWS frontend terbaca", async () => {
    ok(views.length >= 15, `hanya ${views.length} view terbaca`);
    ok(views.includes("finance-invoice") && views.includes("finance-paket"), "view finance baru tidak ada di VIEWS");
  });

  await t("spa: semua VIEWS frontend terdaftar di admin-views.js", async () => {
    const missing = views.filter((v) => !ADMIN_VIEWS.includes(v));
    eq(missing, [], "view belum terdaftar");
  });

  await t("spa: admin-views.js tidak memuat duplikat", async () => {
    const dup = ADMIN_VIEWS.filter((v, i) => ADMIN_VIEWS.indexOf(v) !== i);
    eq(dup, [], "view duplikat");
  });

  for (const view of views) {
    await t(`spa: /admin/${view} membuka SPA`, async () => {
      const r = await fetch(`${B}/admin/${view}`);
      eq(r.status, 200, "status");
      const html = await r.text();
      ok(html.includes("Ruang KKA"), "kerangka SPA admin tidak dimuat");
      // jadwal hanya URL legacy, tidak punya elemen view di index.html.
      if (!LEGACY.has(view)) ok(html.includes(`id="view-${view}"`), `view-${view} tidak ada di index.html`);
    });
  }

  await t("spa: view yang tidak dikenal tetap 404", async () => {
    const r = await fetch(`${B}/admin/tidak-ada-view-ini`);
    eq(r.status, 404, "status");
  });

  await t("spa: aset statis admin tetap disajikan", async () => {
    const r = await fetch(`${B}/admin/static/finance.js`);
    eq(r.status, 200, "status finance.js");
    ok((await r.text()).includes("dc-finance-paket"), "isi finance.js tidak sesuai");
  });

  await t("spa: aset static/ yang dirujuk index.html tersedia", async () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "Admin", "index.html"), "utf8");
    const refs = [...new Set(
      [...html.matchAll(/(?:src|href)="(static\/[^"?#]+)/g)].map((m) => m[1])
    )];
    ok(refs.length >= 15, `hanya ${refs.length} aset terbaca`);
    const missing = [];
    for (const rel of refs) {
      const r = await fetch(`${B}/admin/${rel}`);
      if (r.status !== 200) missing.push(`${rel} (${r.status})`);
    }
    eq(missing, [], "aset yang dirujuk tidak tersedia");
  });

  await t("spa: aset statis yang tidak ada tetap 404", async () => {
    const r = await fetch(`${B}/admin/static/tidak-ada.js`);
    eq(r.status, 404, "status");
  });

  await t("spa: path traversal tidak membocorkan berkas backend", async () => {
    const r = await fetch(`${B}/admin/%2e%2e/backend/server.js`);
    ok(r.status !== 200, `status ${r.status}`);
    ok(!(await r.text()).includes("ADMIN_VIEWS"), "isi server.js terbaca");
  });

  // Ringkasan
  const passed = results.filter((r) => r[0] === "PASS").length;
  for (const [status, name] of results) console.log(`${status}  ${name}`);
  console.log(`\n${passed}/${results.length} lolos`);
  child.kill();
  db.close();
  for (const file of [TMPDB, TMPDB + "-shm", TMPDB + "-wal"]) {
    try { fs.unlinkSync(file); } catch {}
  }
  fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  try { child.kill(); } catch {}
  process.exitCode = 1;
});
