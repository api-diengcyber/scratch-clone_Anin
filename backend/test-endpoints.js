// backend/test-endpoints.js — langkah 3: testing endpoint utama (mode dummy, tanpa Firebase).
// Membuat DB temp, seed 1 modul+task, spawn server di port temp, lalu uji endpoint.
// Jalankan: node backend/test-endpoints.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const BACKEND = __dirname;
const PORT = 3101;
const TMPDB = path.join(os.tmpdir(), `dcc-test-${process.pid}.sqlite`);
try { fs.unlinkSync(TMPDB); } catch (e) {}

process.env.DB_PATH = TMPDB;
process.env.PORT = String(PORT);
process.env.NODE_ENV = "test";

// Seed minimal langsung via better-sqlite3 (schema dibuat otomatis oleh database.js)
const db = require("./database");
db.prepare("INSERT OR IGNORE INTO modules (grade, module_id) VALUES (?, ?)").run("SMP", "testmod");
db.prepare(`INSERT OR IGNORE INTO tasks (grade, module_id, task_id, task_index, title, steps, is_project, requires_submission, editor_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run("SMP", "testmod", "testmod:0", 0, "Task Uji", JSON.stringify(["langkah 1"]), 0, 0, null);
db.prepare("INSERT OR IGNORE INTO materials (grade, module_id, lesson_index, path) VALUES (?, ?, ?, ?)").run("SMP", "testmod", 0, "/SMP/materi/uji.html");

const child = spawn("node", ["server.js"], { cwd: BACKEND, env: { ...process.env, DB_PATH: TMPDB, PORT: String(PORT), NODE_ENV: "test" } });
let out = "";
child.stdout.on("data", (d) => { out += d; });
child.stderr.on("data", (d) => { out += d; });

function waitReady() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (out.includes("Server siap digunakan")) { clearInterval(iv); resolve(); }
      else if (Date.now() - t0 > 20000) { clearInterval(iv); reject(new Error("Server tidak siap. Output:\n" + out)); }
    }, 200);
  });
}

const results = [];
async function t(name, fn) {
  try { await fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + " — " + e.message]); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: dapat ${JSON.stringify(a)}, harap ${JSON.stringify(b)}`); }
async function j(res) { const txt = await res.text(); try { return JSON.parse(txt); } catch (e) { throw new Error(`bukan JSON (HTTP ${res.status}): ${txt.slice(0, 120)}`); } }
const B = `http://localhost:${PORT}`;

(async () => {
  await waitReady();

  await t("health 200 envelope", async () => {
    const r = await fetch(`${B}/api/health`); const d = await j(r);
    eq(r.status, 200, "status"); eq(d.ok, true, "ok");
  });
  await t("modules uppercase", async () => {
    const r = await fetch(`${B}/api/modules/SMP`); const d = await j(r);
    eq(r.status, 200, "status"); eq(Array.isArray(d.modules), true, "modules array");
  });
  await t("modules lowercase dinormalisasi", async () => {
    const r = await fetch(`${B}/api/modules/smp`); eq(r.status, 200, "status");
  });
  await t("modules grade ngawur -> 400", async () => {
    const r = await fetch(`${B}/api/modules/XXX`); const d = await j(r);
    eq(r.status, 400, "status"); eq(d.ok, false, "ok"); eq(d.code, "VALIDATION_ERROR", "code");
  });
  await t("tasks by module shape", async () => {
    const r = await fetch(`${B}/api/tasks/SMP/testmod`); const d = await j(r);
    eq(r.status, 200, "status"); eq(d.tasks.length, 1, "jumlah"); eq(d.tasks[0].task_id, "testmod:0", "task_id");
  });
  await t("materials by module shape", async () => {
    const r = await fetch(`${B}/api/materials/SMP/testmod`); const d = await j(r);
    eq(r.status, 200, "status"); eq(d.materials[0].path, "/SMP/materi/uji.html", "path");
  });
  await t("progress tanpa token -> 401 envelope", async () => {
    const r = await fetch(`${B}/api/progress/budi`); const d = await j(r);
    eq(r.status, 401, "status"); eq(d.ok, false, "ok");
  });
  await t("ai tanpa token -> 401", async () => {
    const r = await fetch(`${B}/api/ai/tutor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "halo" }) });
    eq(r.status, 401, "status");
  });
  await t("login kosong -> 400 (bukan 500 HTML)", async () => {
    const r = await fetch(`${B}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const d = await j(r); eq(r.status, 400, "status"); eq(d.code, "VALIDATION_ERROR", "code");
  });
  await t("login password non-string -> 400 (regresi TypeError)", async () => {
    const r = await fetch(`${B}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "budi", password: 123 }) });
    const d = await j(r); eq(r.status, 400, "status"); eq(d.code, "VALIDATION_ERROR", "code");
  });
  await t("register kosong -> 400", async () => {
    const r = await fetch(`${B}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "u1" }) });
    eq(r.status, 400, "status");
  });
  await t("route ngawur -> 404 envelope", async () => {
    const r = await fetch(`${B}/api/tidak-ada`); const d = await j(r);
    eq(r.status, 404, "status"); eq(d.code, "NOT_FOUND", "code");
  });
  await t("dev progress GET (mode dummy)", async () => {
    const r = await fetch(`${B}/api/dev/progress`); const d = await j(r);
    eq(r.status, 200, "status"); eq(d.username, "dev", "user");
  });
  await t("dev progress POST valid", async () => {
    const r = await fetch(`${B}/api/dev/progress`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: "testmod:0", completed: true }) });
    const d = await j(r); eq(r.status, 200, "status"); eq(d.completed, true, "completed");
  });
  await t("dev progress task ngawur -> 404", async () => {
    const r = await fetch(`${B}/api/dev/progress`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: "ngawur:0", completed: true }) });
    const d = await j(r); eq(r.status, 404, "status"); eq(d.code, "NOT_FOUND", "code");
  });
  await t("dev progress completed non-boolean -> 400", async () => {
    const r = await fetch(`${B}/api/dev/progress`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: "testmod:0", completed: "ya" }) });
    eq(r.status, 400, "status");
  });
  await t("dev points POST negatif -> 400", async () => {
    const r = await fetch(`${B}/api/dev/points`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ total: -5 }) });
    eq(r.status, 400, "status");
  });
  await t("dev points roundtrip", async () => {
    let r = await fetch(`${B}/api/dev/points`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ total: 42 }) });
    eq(r.status, 200, "post");
    r = await fetch(`${B}/api/dev/points`); const d = await j(r);
    eq(d.total, 42, "total");
  });
  await t("ai tanpa smpTask -> 403 (bukan 500)", async () => {
    // register user dummy untuk token
    let r = await fetch(`${B}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "aitest", password: "abcd1234" }) });
    let d = await j(r);
    const hdr = { Authorization: "Bearer " + d.token, "Content-Type": "application/json" };
    r = await fetch(`${B}/api/ai/tutor`, { method: "POST", headers: hdr, body: JSON.stringify({ message: "halo" }) });
    d = await j(r); eq(r.status, 403, "status"); eq(d.code, "TUTOR_NOT_ALLOWED", "code");
  });
  await t("ai modul non-AI (py1) -> 403", async () => {
    let r = await fetch(`${B}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "aitest", password: "abcd1234" }) });
    let d = await j(r);
    const hdr = { Authorization: "Bearer " + d.token, "Content-Type": "application/json" };
    r = await fetch(`${B}/api/ai/tutor`, { method: "POST", headers: hdr, body: JSON.stringify({ message: "halo", smpTask: { nodeId: "py1", taskIndex: 0, judul: "x", langkah: ["a"] } }) });
    d = await j(r); eq(r.status, 403, "status"); eq(d.code, "TUTOR_NOT_ALLOWED", "code");
  });
  await t("ai modul ai1 lolos gate (gagal di key/mock, bukan 403)", async () => {
    let r = await fetch(`${B}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "aitest", password: "abcd1234" }) });
    let d = await j(r);
    const hdr = { Authorization: "Bearer " + d.token, "Content-Type": "application/json" };
    r = await fetch(`${B}/api/ai/tutor`, { method: "POST", headers: hdr, body: JSON.stringify({ message: "halo", smpTask: { nodeId: "ai1", taskIndex: 0, judul: "x", langkah: ["a"] } }) });
    if (r.status === 403) throw new Error("ai1 ikut ditolak");
  });
  await t("register sukses -> 201", async () => {
    const r = await fetch(`${B}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "tester1", password: "abcd1234" }) });
    const d = await j(r); eq(r.status, 201, "status"); eq(d.ok, true, "ok");
    var token = d.token; var user = d.username;
    // auth-me + per-user progress/points + 403 + logout
    let m = await fetch(`${B}/api/auth/me`, { headers: { Authorization: "Bearer " + token } });
    eq(m.status, 200, "me");
    let p = await fetch(`${B}/api/progress/${user}`, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ taskId: "testmod:0", completed: true }) });
    eq(p.status, 200, "save progress");
    let g = await fetch(`${B}/api/progress/${user}`, { headers: { Authorization: "Bearer " + token } });
    let gd = await j(g); eq(gd.progress.length, 1, "progress rows");
    let f = await fetch(`${B}/api/progress/oranglain`, { headers: { Authorization: "Bearer " + token } });
    eq(f.status, 403, "same-user 403");
    let bad = await fetch(`${B}/api/progress/${user}`, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ taskId: "ngawur:0", completed: true }) });
    eq(bad.status, 404, "task 404");
    let pt = await fetch(`${B}/api/points/${user}`, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ total: 10.9 }) });
    eq(pt.status, 400, "points float 400");
    let lo = await fetch(`${B}/api/auth/logout`, { method: "POST", headers: { Authorization: "Bearer " + token } });
    eq(lo.status, 200, "logout");
    let m2 = await fetch(`${B}/api/auth/me`, { headers: { Authorization: "Bearer " + token } });
    eq(m2.status, 401, "me pasca-logout");
  });

  const fails = results.filter((r) => r[0] === "FAIL");
  console.log("");
  for (const [st, nm] of results) console.log(`${st === "PASS" ? "PASS" : "FAIL"}  ${nm}`);
  console.log(`\n${results.length - fails.length}/${results.length} lolos`);
  child.kill(); db.close();
  try { fs.unlinkSync(TMPDB); } catch (e) {}
  try { fs.unlinkSync(TMPDB + "-shm"); } catch (e) {}
  try { fs.unlinkSync(TMPDB + "-wal"); } catch (e) {}
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e.message); try { child.kill(); } catch (x) {} process.exit(2); });
