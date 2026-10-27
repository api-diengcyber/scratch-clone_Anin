// backend/test-admin.js — regression M1-M4.
// Cakupan: otorisasi admin, CRUD murid, rename tanpa memutus relasi,
// reset password/suspend/soft-delete, audit, dan alur plugin ZIP.
// Jalankan: node backend/test-admin.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const http = require("http");
const { spawn } = require("child_process");

const BACKEND = __dirname;
const PORT = 3104;
const PLUGIN_PORT = 3105;
const TMPDB = path.join(os.tmpdir(), `dcc-test-admin-${process.pid}.sqlite`);
const PLUGIN_DIR = path.join(os.tmpdir(), `dcc-test-admin-plugins-${process.pid}`);

for (const file of [TMPDB, TMPDB + "-shm", TMPDB + "-wal"]) {
  try { fs.unlinkSync(file); } catch {}
}
fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });

process.env.DB_PATH = TMPDB;
process.env.NODE_ENV = "test";
process.env.PORT = String(PORT);

const db = require("./database");
const auth = require("./auth");

// ------------------------------------------------------------
// Seed
// ------------------------------------------------------------
db.prepare("INSERT OR IGNORE INTO modules (grade, module_id) VALUES (?, ?)").run("SMP", "adminmod");
db.prepare(`
  INSERT OR IGNORE INTO tasks
    (grade, module_id, task_id, task_index, title, steps, is_project, requires_submission, points, editor_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run("SMP", "adminmod", "adminmod:a", 0, "Task Admin A", JSON.stringify(["langkah"]), 0, 0, 100, null);

function addUser(username, email, password, role) {
  const { salt, hash } = auth.hashPassword(password);
  const info = db.prepare(`
    INSERT INTO users (username, email, full_name, password_hash, password_salt, role, status, must_change_password)
    VALUES (?, ?, ?, ?, ?, ?, 'active', 0)
  `).run(username, email, null, hash, salt, role);
  return Number(info.lastInsertRowid);
}

const ADMIN_PASS = "AdminPass123!";
const STUDENT_PASS = "StudentPass123!";
const NEW_STUDENT_PASS = "NewStudentPass123!";
const adminId = addUser("admin1", "admin1@example.com", ADMIN_PASS, "admin");
const nonDevAdminId = addUser("admin2", "admin2@example.com", "AdminTwoPass123!", "admin");
const nonDevToken = auth.createSession(nonDevAdminId);

// Hanya admin1 yang boleh upload/review/publish plugin.
process.env.PLUGIN_DEVELOPER_USER_IDS = String(adminId);
process.env.PLUGIN_PREVIEW_SECRET = "test-preview-secret-0123456789abcdef";
process.env.PLUGIN_PUBLIC_ORIGIN = "https://plugins.test";
process.env.PLUGIN_DIR = PLUGIN_DIR;
process.env.LOG_LEVEL = "error";

// ------------------------------------------------------------
// ZIP helper (sama dengan test-m0-m5)
// ------------------------------------------------------------
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(text);
    const compressed = zlib.deflateRawSync(raw);
    const crc = crc32(raw);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(20, 4);
    l.writeUInt16LE(0x800, 6);
    l.writeUInt16LE(8, 8);
    l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(compressed.length, 18);
    l.writeUInt32LE(raw.length, 22);
    l.writeUInt16LE(nameBuf.length, 26);
    l.writeUInt16LE(0, 28);
    locals.push(l, nameBuf, compressed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(0x0314, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(compressed.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt16LE(0, 30);
    c.writeUInt16LE(0, 32);
    c.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    c.writeUInt32LE(offset, 42);
    centrals.push(c, nameBuf);
    offset += l.length + nameBuf.length + compressed.length;
  }
  const cd = Buffer.concat(centrals);
  const local = Buffer.concat(locals);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(Object.keys(files).length, 8);
  e.writeUInt16LE(Object.keys(files).length, 10);
  e.writeUInt32LE(cd.length, 12);
  e.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, cd, e]);
}

const manifest = {
  id: "sample-game",
  name: "Sample Game",
  version: "1.0.0",
  sdk: 1,
  entry: "index.html",
  category: { id: "learning-games", name: "Learning Games" },
  grades: ["SMP"],
  permissions: ["progress:complete"],
  network: { allow: [] }
};
const validZip = makeZip({
  "manifest.json": JSON.stringify(manifest),
  "index.html": '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>Sample</h1><script src="app.js"></script></body></html>',
  "app.js": "document.body.dataset.ready='true';"
});
const traversalZip = makeZip({
  "../evil.js": "alert(1)",
  "manifest.json": JSON.stringify(manifest)
});

// ------------------------------------------------------------
// Server child
// ------------------------------------------------------------
const child = spawn(process.execPath, ["server.js"], {
  cwd: BACKEND,
  env: { ...process.env }
});
let out = "";
child.stdout.on("data", (d) => { out += d; });
child.stderr.on("data", (d) => { out += d; });

const runtimeChild = spawn(process.execPath, ["plugin-runtime-server.js"], {
  cwd: BACKEND,
  env: {
    ...process.env,
    PLUGIN_PORT: String(PLUGIN_PORT),
    APP_PUBLIC_ORIGIN: "http://localhost:3000"
  }
});
let runtimeOut = "";
runtimeChild.stdout.on("data", (d) => { runtimeOut += d; });
runtimeChild.stderr.on("data", (d) => { runtimeOut += d; });

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
        reject(new Error("Server tidak siap. Output:\n" + out));
      }
    }, 200);
  });
}

function waitRuntimeReady() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (runtimeOut.includes(`Plugin runtime berjalan di port ${PLUGIN_PORT}`)) {
        clearInterval(iv);
        resolve();
      } else if (runtimeChild.exitCode !== null) {
        clearInterval(iv);
        reject(new Error("Plugin runtime berhenti sebelum siap. Output:\n" + runtimeOut));
      } else if (Date.now() - t0 > 30000) {
        clearInterval(iv);
        reject(new Error("Plugin runtime tidak siap. Output:\n" + runtimeOut));
      }
    }, 200);
  });
}

function rawGet(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port: PLUGIN_PORT,
      path: pathname,
      method: "GET"
    }, (res) => {
      let body = "";
      res.on("data", (d) => { body += d; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

const results = [];
async function t(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + " — " + e.message]);
  }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: dapat ${JSON.stringify(a)}, harap ${JSON.stringify(b)}`);
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eqJson(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg}: dapat ${JSON.stringify(a)}, harap ${JSON.stringify(b)}`);
  }
}

const B = `http://127.0.0.1:${PORT}`;

async function j(res) {
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error(`bukan JSON (HTTP ${res.status}): ${txt.slice(0, 160)}`);
  }
}

async function api(method, url, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(B + url, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { r, d: await j(r) };
}

async function uploadZip(token, buffer) {
  const r = await fetch(B + "/api/admin/plugins/upload", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/zip"
    },
    body: buffer
  });
  return { r, d: await j(r) };
}

async function stopChild(c) {
  if (!c) return;
  try { c.kill(); } catch {}
  await new Promise((resolve) => {
    if (c.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 1500);
    c.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function cleanup() {
  await stopChild(child);
  await stopChild(runtimeChild);
  try { db.close(); } catch {}
  for (const file of [TMPDB, TMPDB + "-shm", TMPDB + "-wal"]) {
    try { fs.unlinkSync(file); } catch {}
  }
  try { fs.rmSync(PLUGIN_DIR, { recursive: true, force: true }); } catch {}
}

// ------------------------------------------------------------
// Tests
// ------------------------------------------------------------
(async () => {
  await waitReady();
  await waitRuntimeReady();

  let adminToken = null;
  let studentToken = null;
  let student2Token = null;
  let studentId = null;
  let student2Id = null;
  let student2TempPassword = null;
  let uploadedVersionId = null;
  let uploadedVersionNumber = null;
  let previewPath = null;

  await t("GET /api/admin/users tanpa token -> 401", async () => {
    const { r, d } = await api("GET", "/api/admin/users");
    eq(r.status, 401, "status");
    eq(d.code, "UNAUTHORIZED", "code");
  });

  await t("login admin -> 200 role admin", async () => {
    const { r, d } = await api("POST", "/api/auth/login", {
      body: { username: "admin1", password: ADMIN_PASS }
    });
    eq(r.status, 200, "status");
    eq(d.role, "admin", "role");
    ok(d.token, "token ada");
    adminToken = d.token;
  });

  await t("GET /api/admin/me -> identitas admin", async () => {
    const { r, d } = await api("GET", "/api/admin/me", { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.id, adminId, "id");
    eq(d.username, "admin1", "username");
    eq(d.role, "admin", "role");
    eq(d.status, "active", "status akun");
  });

  await t("admin membuat murid -> 201", async () => {
    const { r, d } = await api("POST", "/api/admin/users", {
      token: adminToken,
      body: {
        username: "student1",
        email: "student1@example.com",
        fullName: "Student One",
        password: STUDENT_PASS
      }
    });
    eq(r.status, 201, "status");
    ok(Number.isSafeInteger(d.id), "id murid");
    eq(d.username, "student1", "username");
    studentId = d.id;
  });

  await t("murid login; /me memuat role/status/mustChangePassword", async () => {
    const { r, d } = await api("POST", "/api/auth/login", {
      body: { username: "student1", password: STUDENT_PASS }
    });
    eq(r.status, 200, "login");
    eq(d.role, "student", "role");
    eq(d.accountStatus, "active", "status");
    studentToken = d.token;

    const me = await api("GET", "/api/auth/me", { token: studentToken });
    eq(me.r.status, 200, "me");
    eq(me.d.role, "student", "role /me");
    eq(me.d.status, "active", "status /me");
    eq(me.d.mustChangePassword, true, "mustChangePassword");
  });

  await t("murid membuka /api/admin/users -> 403 ADMIN_REQUIRED", async () => {
    const { r, d } = await api("GET", "/api/admin/users", { token: studentToken });
    eq(r.status, 403, "status");
    eq(d.code, "ADMIN_REQUIRED", "code");
  });

  await t("admin list + pencarian + stats -> 200", async () => {
    const { r, d } = await api("GET", "/api/admin/users?search=student1", { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.users.length, 1, "jumlah hasil");
    eq(d.users[0].id, studentId, "id");
    eqJson(d.users[0].allowedGrades, [], "allowedGrades awal");
    ok(d.stats && d.stats.total >= 1, "stats.total");
  });

  await t("admin membuat murid tanpa password -> temporaryPassword", async () => {
    const { r, d } = await api("POST", "/api/admin/users", {
      token: adminToken,
      body: { username: "student2", email: "student2@example.com" }
    });
    eq(r.status, 201, "status");
    ok(typeof d.temporaryPassword === "string" && d.temporaryPassword.length >= 8, "temporaryPassword");
    student2Id = d.id;
    student2TempPassword = d.temporaryPassword;

    const login = await api("POST", "/api/auth/login", {
      body: { username: "student2", password: student2TempPassword }
    });
    eq(login.r.status, 200, "login temp");
    student2Token = login.d.token;
    const me = await api("GET", "/api/auth/me", { token: student2Token });
    eq(me.d.mustChangePassword, true, "wajib ganti password");
  });

  await t("username/email duplikat -> 409", async () => {
    let res = await api("POST", "/api/admin/users", {
      token: adminToken,
      body: { username: "student1", email: "other@example.com", password: STUDENT_PASS }
    });
    eq(res.r.status, 409, "username");
    eq(res.d.code, "USERNAME_EXISTS", "code username");

    res = await api("POST", "/api/admin/users", {
      token: adminToken,
      body: { username: "student3", email: "student2@example.com", password: STUDENT_PASS }
    });
    eq(res.r.status, 409, "email");
    eq(res.d.code, "EMAIL_EXISTS", "code email");
  });

  await t("rename murid mempertahankan progress/poin/attempt/item/sesi", async () => {
    let res = await api("POST", "/api/progress/student1", {
      token: studentToken,
      body: { taskId: "adminmod:a", completed: true }
    });
    eq(res.r.status, 200, "progress");
    eq(res.d.points, 105, "poin awal");

    res = await api("POST", "/api/shop/buy", {
      token: studentToken,
      body: { itemId: "bg_gold" }
    });
    eq(res.r.status, 200, "beli item");
    eq(res.d.balance, 55, "saldo setelah beli");
    ok(res.d.owned.includes("bg_gold"), "item dimiliki");

    res = await api("POST", "/api/attempts/student1", {
      token: studentToken,
      body: { taskId: "adminmod:a", timeSpent: 12 }
    });
    eq(res.r.status, 200, "attempt");
    eq(res.d.fails, 1, "fails");

    res = await api("PATCH", `/api/admin/users/${studentId}`, {
      token: adminToken,
      body: { username: "student-renamed", fullName: "Renamed Student", allowedGrades: ["SMP", "SMK"] }
    });
    eq(res.r.status, 200, "rename");
    eq(res.d.user.username, "student-renamed", "username baru");
    eqJson(res.d.user.allowedGrades, ["SMP", "SMK"], "allowedGrades");

    res = await api("GET", "/api/auth/me", { token: studentToken });
    eq(res.r.status, 200, "sesi lama tetap hidup");
    eq(res.d.username, "student-renamed", "username sesi");

    res = await api("GET", "/api/progress/student-renamed", { token: studentToken });
    eq(res.r.status, 200, "progress baru");
    eq(res.d.progress.length, 1, "jumlah progress");
    eq(res.d.progress[0].completed, 1, "completed");

    res = await api("GET", "/api/points/student-renamed", { token: studentToken });
    eq(res.r.status, 200, "points");
    eq(res.d.total, 105, "total");
    eq(res.d.spent, 50, "spent");
    eq(res.d.balance, 55, "balance");

    res = await api("GET", "/api/attempts/student-renamed", { token: studentToken });
    eq(res.r.status, 200, "attempts");
    eq(res.d.attempts.length, 1, "jumlah attempt");
    eq(res.d.attempts[0].task_id, "adminmod:a", "task attempt");

    res = await api("GET", "/api/shop", { token: studentToken });
    eq(res.r.status, 200, "shop");
    ok(res.d.owned.includes("bg_gold"), "item tetap dimiliki");
    eq(res.d.equipped.bingkai, "bg_gold", "item tetap terpasang");

    res = await api("GET", "/api/user/allowed-grades", { token: studentToken });
    eq(res.r.status, 200, "allowed-grades");
    eqJson(res.d.grades, ["SMP", "SMK"], "grades");

    res = await api("GET", `/api/admin/users/${studentId}`, { token: adminToken });
    eq(res.r.status, 200, "detail admin");
    eq(res.d.user.username, "student-renamed", "detail username");
    eq(res.d.points.total, 105, "detail poin");
    eq(res.d.progress.completed, 1, "detail progress");
    eq(res.d.items.length, 1, "detail item");
    ok(res.d.activeSessions >= 1, "sesi aktif");

    const login = await api("POST", "/api/auth/login", {
      body: { username: "student-renamed", password: STUDENT_PASS }
    });
    eq(login.r.status, 200, "login username baru");
    studentToken = login.d.token;
  });

  await t("reset password mencabut sesi lama dan mewajibkan ganti password", async () => {
    let res = await api("POST", `/api/admin/users/${studentId}/reset-password`, {
      token: adminToken,
      body: { password: NEW_STUDENT_PASS }
    });
    eq(res.r.status, 200, "reset");

    res = await api("GET", "/api/auth/me", { token: studentToken });
    eq(res.r.status, 401, "sesi lama");

    res = await api("POST", "/api/auth/login", {
      body: { username: "student-renamed", password: STUDENT_PASS }
    });
    eq(res.r.status, 401, "password lama");

    res = await api("POST", "/api/auth/login", {
      body: { username: "student-renamed", password: NEW_STUDENT_PASS }
    });
    eq(res.r.status, 200, "password baru");
    studentToken = res.d.token;

    res = await api("GET", "/api/auth/me", { token: studentToken });
    eq(res.d.mustChangePassword, true, "mustChangePassword");
  });

  await t("suspend menolak login; reactivate mengizinkan lagi", async () => {
    let res = await api("POST", `/api/admin/users/${studentId}/suspend`, {
      token: adminToken,
      body: {}
    });
    eq(res.r.status, 200, "suspend");
    eq(res.d.status, "suspended", "status suspend");

    res = await api("POST", "/api/auth/login", {
      body: { username: "student-renamed", password: NEW_STUDENT_PASS }
    });
    eq(res.r.status, 403, "login suspended");
    eq(res.d.code, "ACCOUNT_SUSPENDED", "code suspended");

    res = await api("POST", `/api/admin/users/${studentId}/suspend`, {
      token: adminToken,
      body: { status: "active" }
    });
    eq(res.r.status, 200, "reactivate");
    eq(res.d.status, "active", "status active");

    res = await api("POST", "/api/auth/login", {
      body: { username: "student-renamed", password: NEW_STUDENT_PASS }
    });
    eq(res.r.status, 200, "login active");
    studentToken = res.d.token;
  });

  await t("revoke-sessions mencabut token murid", async () => {
    const res = await api("POST", `/api/admin/users/${studentId}/revoke-sessions`, {
      token: adminToken
    });
    eq(res.r.status, 200, "revoke");
    ok(res.d.revoked >= 1, "jumlah sesi dicabut");

    const me = await api("GET", "/api/auth/me", { token: studentToken });
    eq(me.r.status, 401, "token lama");
  });

  await t("soft-delete menolak login dan PATCH berikutnya", async () => {
    let res = await api("DELETE", `/api/admin/users/${student2Id}`, { token: adminToken });
    eq(res.r.status, 200, "delete");
    eq(res.d.status, "deleted", "status delete");

    res = await api("POST", "/api/auth/login", {
      body: { username: "student2", password: student2TempPassword }
    });
    eq(res.r.status, 403, "login deleted");
    eq(res.d.code, "ACCOUNT_INACTIVE", "code deleted");

    res = await api("GET", `/api/admin/users/${student2Id}`, { token: adminToken });
    eq(res.r.status, 200, "detail soft-delete tetap untuk audit");
    eq(res.d.user.status, "deleted", "status detail");

    res = await api("PATCH", `/api/admin/users/${student2Id}`, {
      token: adminToken,
      body: { fullName: "Tidak boleh" }
    });
    eq(res.r.status, 409, "patch deleted");
    eq(res.d.code, "ACCOUNT_DELETED", "code patch deleted");

    res = await api("GET", "/api/admin/users?status=deleted", { token: adminToken });
    eq(res.r.status, 200, "list deleted");
    ok(res.d.users.some((u) => u.id === student2Id), "murid deleted ada di list");
  });

  await t("upload plugin non-developer -> 403 PLUGIN_DEVELOPER_REQUIRED", async () => {
    const { r, d } = await uploadZip(nonDevToken, validZip);
    eq(r.status, 403, "status");
    eq(d.code, "PLUGIN_DEVELOPER_REQUIRED", "code");
  });

  await t("upload ZIP valid -> quarantine needs_review", async () => {
    const { r, d } = await uploadZip(adminToken, validZip);
    eq(r.status, 201, "status");
    eq(d.status, "needs_review", "status plugin");
    eq(d.pluginId, "sample-game", "pluginId");
    eq(d.version, "1.0.0", "version");
    eq(d.report.findings.length, 0, "finding statis");
    ok(d.uploadId, "uploadId");
  });

  await t("list plugin admin memuat scan report", async () => {
    const { r, d } = await api("GET", "/api/admin/plugins", { token: adminToken });
    eq(r.status, 200, "status");
    const row = d.plugins.find((p) => p.plugin_id === "sample-game" && p.version === "1.0.0");
    ok(row, "plugin ditemukan");
    eq(row.status, "needs_review", "status");
    eq(row.scanReport.outcome, "needs_review", "outcome");
    uploadedVersionId = row.id;
    uploadedVersionNumber = row.version;
  });

  await t("preview ticket dibuat tanpa token sesi", async () => {
    const { r, d } = await api("POST", `/api/admin/plugins/${uploadedVersionId}/preview-ticket`, {
      token: adminToken
    });
    eq(r.status, 200, "status");
    ok(d.url.startsWith("https://plugins.test/preview/"), "url preview");
    eq(d.expiresInSeconds, 300, "expiry");
    previewPath = new URL(d.url).pathname;
  });

  await t("runtime menyajikan preview quarantine dengan CSP", async () => {
    const r = await fetch(`http://127.0.0.1:${PLUGIN_PORT}${previewPath}`);
    eq(r.status, 200, "status");
    const body = await r.text();
    ok(body.includes("Sample"), "body");
    const csp = r.headers.get("content-security-policy") || "";
    ok(csp.includes("default-src 'self'"), "csp default-src");
    ok(csp.includes("frame-ancestors http://localhost:3000"), "csp frame-ancestors");
    eq(r.headers.get("cache-control"), "no-store", "cache preview");
  });

  await t("approve -> publish -> live file tersedia", async () => {
    let res = await api("POST", `/api/admin/plugins/${uploadedVersionId}/approve`, {
      token: adminToken
    });
    eq(res.r.status, 200, "approve");
    eq(res.d.status, "approved", "status approved");

    res = await api("POST", `/api/admin/plugins/${uploadedVersionId}/publish`, {
      token: adminToken
    });
    eq(res.r.status, 200, "publish");
    eq(res.d.status, "published", "status published");
    ok(res.d.url.includes("/sample-game/1.0.0/index.html"), "url publish");

    const liveFile = path.join(PLUGIN_DIR, "live", "sample-game", uploadedVersionNumber, "index.html");
    ok(fs.existsSync(liveFile), "file live ada");
  });

  await t("plugin published tampil di endpoint publik", async () => {
    let res = await api("GET", "/api/plugins");
    eq(res.r.status, 200, "list publik");
    const plugin = res.d.plugins.find((p) => p.id === "sample-game");
    ok(plugin, "plugin publik");
    eq(plugin.version, "1.0.0", "version");
    eq(plugin.entry, "index.html", "entry");
    eq(plugin.origin, "https://plugins.test", "origin");
    eqJson(plugin.network.allow, [], "network allow");

    res = await api("GET", "/api/plugins/sample-game");
    eq(res.r.status, 200, "detail publik");
    eq(res.d.plugin.id, "sample-game", "id");
  });

  await t("runtime menyajikan live asset, CSP, dan menolak traversal", async () => {
    let r = await fetch(`http://127.0.0.1:${PLUGIN_PORT}/sample-game/1.0.0/index.html`);
    eq(r.status, 200, "live");
    const body = await r.text();
    ok(body.includes("Sample"), "body live");
    const csp = r.headers.get("content-security-policy") || "";
    ok(csp.includes("connect-src 'none'"), "csp connect-src");
    ok(csp.includes("frame-ancestors http://localhost:3000"), "csp frame-ancestors");
    eq(r.headers.get("cache-control"), "public, max-age=31536000, immutable", "cache live");

    r = await fetch(`http://127.0.0.1:${PLUGIN_PORT}/sample-game/1.0.0/missing.js`);
    eq(r.status, 404, "asset tidak ada");

    const traversal = await rawGet("/sample-game/1.0.0/%2e%2e/%2e%2e/secret.txt");
    eq(traversal.status, 400, "traversal");
  });

  await t("disable menyembunyikan plugin dari publik", async () => {
    let res = await api("POST", `/api/admin/plugins/${uploadedVersionId}/disable`, {
      token: adminToken
    });
    eq(res.r.status, 200, "disable");
    eq(res.d.status, "disabled", "status disabled");

    res = await api("GET", "/api/plugins/sample-game");
    eq(res.r.status, 404, "detail publik");
    eq(res.d.code, "NOT_FOUND", "code");

    res = await api("GET", "/api/plugins");
    eq(res.r.status, 200, "list publik");
    ok(!res.d.plugins.some((p) => p.id === "sample-game"), "plugin tidak tampil");

    const live = await fetch(`http://127.0.0.1:${PLUGIN_PORT}/sample-game/1.0.0/index.html`);
    eq(live.status, 404, "runtime live setelah disable");
  });

  await t("rollback mengaktifkan kembali versi yang dinonaktifkan", async () => {
    let res = await api("POST", `/api/admin/plugins/${uploadedVersionId}/rollback`, {
      token: adminToken
    });
    eq(res.r.status, 200, "rollback");
    eq(res.d.status, "published", "status rollback");

    res = await api("GET", "/api/plugins/sample-game");
    eq(res.r.status, 200, "plugin publik aktif lagi");
    eq(res.d.plugin.version, "1.0.0", "versi aktif");

    const live = await fetch(`http://127.0.0.1:${PLUGIN_PORT}/sample-game/1.0.0/index.html`);
    eq(live.status, 200, "runtime live setelah rollback");
  });

  await t("rollback versi yang sudah aktif -> 409", async () => {
    const { r, d } = await api("POST", `/api/admin/plugins/${uploadedVersionId}/rollback`, {
      token: adminToken
    });
    eq(r.status, 409, "status");
    eq(d.code, "PLUGIN_ALREADY_ACTIVE", "code");
  });

  await t("upload versi duplikat -> 409", async () => {
    const { r, d } = await uploadZip(adminToken, validZip);
    eq(r.status, 409, "status");
    eq(d.code, "PLUGIN_VERSION_EXISTS", "code");
  });

  await t("ZIP path traversal -> 400", async () => {
    const { r, d } = await uploadZip(adminToken, traversalZip);
    eq(r.status, 400, "status");
    eq(d.code, "INVALID_PLUGIN_ZIP", "code");
  });

  await t("audit admin mencatat aksi penting", async () => {
    const actions = db.prepare("SELECT action FROM admin_audit").all().map((r) => r.action);
    for (const required of [
      "student.create",
      "student.update",
      "student.password_reset",
      "student.suspend",
      "student.reactivate",
      "student.sessions_revoked",
      "student.soft_delete",
      "plugin.upload",
      "plugin.approve",
      "plugin.publish",
      "plugin.disable",
      "plugin.rollback"
    ]) {
      ok(actions.includes(required), `audit ${required}`);
    }
  });

  await t("GET /api/admin/audit memfilter dan mem-parse details", async () => {
    let res = await api("GET", "/api/admin/audit?action=plugin.publish&limit=5", { token: adminToken });
    eq(res.r.status, 200, "status");
    ok(res.d.entries.length >= 1, "ada entri publish");
    ok(res.d.entries.every((e) => e.action === "plugin.publish"), "filter action");
    ok(res.d.entries[0].details && typeof res.d.entries[0].details === "object", "details ter-parse");
    eq(res.d.limit, 5, "limit");
    eq(res.d.page, 1, "page");

    res = await api("GET", "/api/admin/audit?actor=admin1&targetType=plugin_version&limit=100", { token: adminToken });
    eq(res.r.status, 200, "filter actor/target");
    ok(res.d.entries.length >= 1, "entri plugin");
    ok(res.d.entries.every((e) => e.actor_username === "admin1" && e.target_type === "plugin_version"), "filter cocok");

    res = await api("GET", "/api/admin/audit?action=tidak.ada", { token: adminToken });
    eq(res.r.status, 200, "filter kosong");
    eq(res.d.entries.length, 0, "tanpa hasil");
    eq(res.d.total, 0, "total nol");
  });

  const fails = results.filter((r) => r[0] === "FAIL");
  console.log("");
  for (const [status, name] of results) console.log(`${status}  ${name}`);
  console.log(`\n${results.length - fails.length}/${results.length} lolos`);

  await cleanup();
  process.exit(fails.length ? 1 : 0);
})().catch(async (e) => {
  console.error("FATAL:", e.stack || e.message);
  await cleanup();
  process.exit(2);
});
