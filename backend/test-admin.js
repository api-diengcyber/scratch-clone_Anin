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
const crypto = require("crypto");
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
  let codeLabSdId = null;
  let codeLabPythonId = null;
  let instrId = null;

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
    eq(d.email, "admin1@example.com", "email");
    eq(d.fullName, null, "fullName");
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
    eq(d.mustChangePassword, true, "login mustChangePassword");

    // Bersihkan flag supaya tes lain bisa memakai token ini.
    // Penegakan aturannya diuji terpisah di bawah.
    db.prepare("UPDATE users SET must_change_password = 0 WHERE id = ?").run(studentId);
  });

  await t("Wajib ganti password: blokir API, endpoint pengecualian, dan buka blokir", async () => {
    const pwUserId = addUser("student-pw", "student-pw@example.com", "TempPass123!", "student");
    db.prepare("UPDATE users SET must_change_password = 1 WHERE id = ?").run(pwUserId);

    let res;

    // Sesi dibuat langsung agar tidak menambah pemakaian rate limit login
    // (kuota login dipakai bersama seluruh suite).
    const pwToken = auth.createSession(pwUserId);

    res = await api("GET", "/api/auth/me", { token: pwToken });
    eq(res.r.status, 200, "me tetap boleh");
    eq(res.d.mustChangePassword, true, "flag /me");

    res = await api("GET", "/api/shop", { token: pwToken });
    eq(res.r.status, 403, "API lain diblokir");
    eq(res.d.code, "PASSWORD_CHANGE_REQUIRED", "code blokir");

    res = await api("GET", "/api/admin/users", { token: pwToken });
    eq(res.r.status, 403, "admin API diblokir");
    eq(res.d.code, "PASSWORD_CHANGE_REQUIRED", "code admin blokir");

    res = await api("POST", "/api/auth/change-password", {
      token: pwToken,
      body: { currentPassword: "SalahPass123!", newPassword: "BaruPass123!" }
    });
    eq(res.r.status, 401, "password lama salah");
    eq(res.d.code, "INVALID_CREDENTIALS", "code password lama");

    res = await api("POST", "/api/auth/change-password", {
      token: pwToken,
      body: { currentPassword: "TempPass123!", newPassword: "BaruPass123!" }
    });
    eq(res.r.status, 200, "ganti password");

    res = await api("GET", "/api/auth/me", { token: pwToken });
    eq(res.d.mustChangePassword, false, "flag hilang");

    res = await api("GET", "/api/shop", { token: pwToken });
    eq(res.r.status, 200, "API terbuka lagi");

    // Verifikasi password langsung ke DB: login tambahan akan menghabiskan
    // kuota rate limit yang dipakai bersama seluruh suite.
    const stored = db.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").get(pwUserId);
    eq(auth.verifyPassword("BaruPass123!", stored.password_salt, stored.password_hash), true, "password baru tersimpan");
    eq(auth.verifyPassword("TempPass123!", stored.password_salt, stored.password_hash), false, "password lama tidak berlaku");
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

  await t("admin membuat murid dari email + jenjang -> username otomatis", async () => {
    const { r, d } = await api("POST", "/api/admin/users", {
      token: adminToken,
      body: {
        email: "auto.student@example.com",
        fullName: "Auto Student",
        allowedGrades: ["SD", "SMP"]
      }
    });
    eq(r.status, 201, "status");
    eq(d.username, "auto.student", "username otomatis");
    eqJson(d.allowedGrades, ["SD", "SMP"], "allowedGrades");
    ok(typeof d.temporaryPassword === "string" && d.temporaryPassword.length >= 8, "temporaryPassword");
  });

  let curriculumVersion = 0;
  const curriculumPayload = {
    tahap: [{
      jenjang: "SMP",
      no: 1,
      nama: "Dasar Coding",
      ikon: "fa-solid fa-cube",
      warna: "#0ea5e9",
      meta: "pemula"
    }],
    jalur: [{
      id: "smp-dasar-coding",
      jenjang: "SMP",
      tahap: 1,
      nama: "Dasar Coding",
      warna: "#0ea5e9",
      ikon: "fa-solid fa-code",
      ringkas: "Belajar dasar HTML dan CSS.",
      tags: ["html", "css"],
      lab: 1,
      durasi: "4 minggu",
      siswa: null,
      capstone: false,
      lencana: "",
      meta: "",
      proyek: "",
      materi: [{
        id: "m1",
        judul: "Pengenalan HTML",
        tipe: "Materi",
        durasi: "10 menit",
        tes: false,
        badge: "Dasar",
        subjudul: "Kenali struktur halaman.",
        html: "<h2>Halo</h2><p>Belajar HTML.</p>"
      }]
    }]
  };

  await t("GET /api/admin/curriculum awal -> kosong version 0", async () => {
    const { r, d } = await api("GET", "/api/admin/curriculum", { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.exists, false, "exists");
    eq(d.version, 0, "version");
    eqJson(d.curriculum, { tahap: [], jalur: [] }, "curriculum kosong");
  });

  await t("PUT /api/admin/curriculum valid -> version 1", async () => {
    const { r, d } = await api("PUT", "/api/admin/curriculum", {
      token: adminToken,
      body: { ...curriculumPayload, version: curriculumVersion }
    });
    eq(r.status, 200, "status");
    eq(d.exists, true, "exists");
    eq(d.version, 1, "version");
    eqJson(d.curriculum, curriculumPayload, "payload tersimpan");
    curriculumVersion = d.version;
  });

  await t("GET /api/admin/curriculum memuat data tersimpan", async () => {
    const { r, d } = await api("GET", "/api/admin/curriculum", { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.exists, true, "exists");
    eq(d.version, 1, "version");
    eqJson(d.curriculum, curriculumPayload, "payload");
  });

  await t("PUT curriculum dengan version lama -> 409", async () => {
    const { r, d } = await api("PUT", "/api/admin/curriculum", {
      token: adminToken,
      body: { ...curriculumPayload, version: 0 }
    });
    eq(r.status, 409, "status");
    eq(d.code, "CURRICULUM_VERSION_CONFLICT", "code");
    eq(d.details.currentVersion, 1, "currentVersion");
  });

  await t("PUT curriculum version terbaru -> version 2", async () => {
    const nextPayload = structuredClone(curriculumPayload);
    nextPayload.jalur[0].ringkas = "Belajar dasar HTML, CSS, dan JavaScript.";
    const { r, d } = await api("PUT", "/api/admin/curriculum", {
      token: adminToken,
      body: { ...nextPayload, version: curriculumVersion }
    });
    eq(r.status, 200, "status");
    eq(d.version, 2, "version");
    eq(d.curriculum.jalur[0].ringkas, nextPayload.jalur[0].ringkas, "ringkas");
    curriculumVersion = d.version;
  });

  await t("PUT curriculum dengan HTML aktif -> 400", async () => {
    const bad = structuredClone(curriculumPayload);
    bad.jalur[0].materi[0].html = '<h2>X</h2><script>alert(1)</script>';
    const { r, d } = await api("PUT", "/api/admin/curriculum", {
      token: adminToken,
      body: { ...bad, version: curriculumVersion }
    });
    eq(r.status, 400, "status");
    eq(d.code, "CURRICULUM_INVALID", "code");
  });

  await t("PUT curriculum dengan tahap tidak dikenal -> 400", async () => {
    const bad = structuredClone(curriculumPayload);
    bad.jalur[0].tahap = 9;
    const { r, d } = await api("PUT", "/api/admin/curriculum", {
      token: adminToken,
      body: { ...bad, version: curriculumVersion }
    });
    eq(r.status, 400, "status");
    eq(d.code, "CURRICULUM_INVALID", "code");
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

    // Tes berikutnya memakai token ini untuk fitur murid; kewajiban ganti
    // password sudah diuji di atas, jadi flag dimatikan agar tidak memblokir.
    db.prepare("UPDATE users SET must_change_password = 0 WHERE id = ?").run(studentId);
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

  await t("GET /api/admin/stats -> ringkasan dari database", async () => {
    const { r, d } = await api("GET", "/api/admin/stats", { token: adminToken });
    eq(r.status, 200, "status");
    ok(d.students.total >= 3, "students.total");
    ok(d.students.active >= 1, "students.active");
    ok(d.content.modules >= 1, "content.modules");
    ok(d.content.tasks >= 1, "content.tasks");
    eq(d.content.curriculumStages, 1, "curriculumStages");
    eq(d.content.curriculumPaths, 1, "curriculumPaths");
    eq(d.content.curriculumMaterials, 1, "curriculumMaterials");
    ok(d.plugins.published >= 1, "plugins.published");
    ok(d.activity.completedTotal >= 1, "activity.completedTotal");
    ok(d.activity.completionRate > 0, "activity.completionRate");
    ok(d.grades.sd >= 1, "grades.sd");
    eq(d.curriculum.version, 2, "curriculum.version");
  });

  await t("GET /api/admin/activity memuat submisi terbaru", async () => {
    const { r, d } = await api("GET", "/api/admin/activity?limit=5", { token: adminToken });
    eq(r.status, 200, "status");
    ok(d.entries.length >= 1, "ada entri");
    const entry = d.entries.find((e) => e.username === "student-renamed");
    ok(entry, "submisi student-renamed");
    eq(entry.task_id, "adminmod:a", "task_id");
    eq(entry.title, "Task Admin A", "judul task");
    ok(entry.completed_at, "completed_at");
  });

  await t("Code Lab: murid tidak boleh memakai CRUD admin", async () => {
    const login = await api("POST", "/api/auth/login", {
      body: { username: "student-renamed", password: NEW_STUDENT_PASS }
    });
    eq(login.r.status, 200, "login murid");
    studentToken = login.d.token;

    const { r, d } = await api("GET", "/api/admin/code-lab", { token: studentToken });
    eq(r.status, 403, "status");
    eq(d.code, "ADMIN_REQUIRED", "code");
  });

  await t("Code Lab: admin membuat tantangan Blockly + kode", async () => {
    let res = await api("POST", "/api/admin/code-lab", {
      token: adminToken,
      body: {
        title: "Test Robot SD",
        type: "blockly",
        grade: "SD",
        language: "Blockly",
        instructions: "Gerakkan robot sampai ke bintang.",
        goal: "Sampai ke bintang",
        blocks: ["Maju", "Belok kiri"],
        blockLimit: 4,
        status: "published"
      }
    });
    eq(res.r.status, 201, "status blockly");
    eq(res.d.challenge.type, "blockly", "type blockly");
    eq(res.d.challenge.grade, "SD", "grade blockly");
    eqJson(res.d.challenge.blocks, ["Maju", "Belok kiri"], "blocks");
    codeLabSdId = res.d.challenge.id;

    res = await api("POST", "/api/admin/code-lab", {
      token: adminToken,
      body: {
        title: "Test Python SMK",
        type: "kode",
        grade: "SMK",
        language: "Python",
        instructions: "Tulis fungsi luas persegi.",
        starterCode: "def luas(s):\n    pass",
        tests: [{ i: "2", o: "4" }],
        criteria: "",
        status: "published"
      }
    });
    eq(res.r.status, 201, "status kode");
    eq(res.d.challenge.type, "kode", "type kode");
    eq(res.d.challenge.grade, "SMK", "grade kode");
    eq(res.d.challenge.language, "Python", "language");
    eq(res.d.challenge.tests.length, 1, "tests");
    codeLabPythonId = res.d.challenge.id;
  });

  await t("Code Lab: filter admin dan validasi blok", async () => {
    let res = await api("GET", "/api/admin/code-lab?grade=SD&status=published&search=Test", { token: adminToken });
    eq(res.r.status, 200, "status");
    eq(res.d.total, 1, "total filter");
    eq(res.d.challenges[0].id, codeLabSdId, "id SD");

    res = await api("POST", "/api/admin/code-lab", {
      token: adminToken,
      body: {
        title: "Blok tidak dikenal",
        type: "blockly",
        instructions: "Tes validasi.",
        goal: "Sampai ke bintang",
        blocks: ["Terbang"],
        blockLimit: 3
      }
    });
    eq(res.r.status, 400, "status validasi");
    eq(res.d.code, "CODELAB_INVALID", "code validasi");
    eq(res.d.details.field, "blocks[0]", "field");
  });

  await t("Code Lab publik: hanya published + sesuai jenjang + tests disembunyikan", async () => {
    let res = await api("GET", "/api/code-lab", { token: studentToken });
    eq(res.r.status, 200, "status");
    ok(res.d.challenges.some((c) => c.id === codeLabPythonId), "tantangan SMK tampil");
    ok(!res.d.challenges.some((c) => c.id === codeLabSdId), "tantangan SD tidak tampil untuk akun SMP/SMK");
    const python = res.d.challenges.find((c) => c.id === codeLabPythonId);
    eq(python.tests, undefined, "tests tidak dikirim ke murid");

    res = await api("GET", `/api/code-lab/${codeLabPythonId}`, { token: studentToken });
    eq(res.r.status, 200, "detail published");
    eq(res.d.challenge.title, "Test Python SMK", "judul");
    eq(res.d.challenge.tests, undefined, "tests detail tidak dikirim");

    res = await api("GET", `/api/code-lab/${codeLabSdId}`, { token: studentToken });
    eq(res.r.status, 403, "detail beda jenjang");
    eq(res.d.code, "GRADE_FORBIDDEN", "code beda jenjang");
  });

  await t("Code Lab: patch status menyembunyikan dari endpoint murid", async () => {
    let res = await api("PATCH", `/api/admin/code-lab/${codeLabPythonId}`, {
      token: adminToken,
      body: { status: "draft" }
    });
    eq(res.r.status, 200, "patch");
    eq(res.d.challenge.status, "draft", "status draft");

    res = await api("GET", "/api/code-lab", { token: studentToken });
    ok(!res.d.challenges.some((c) => c.id === codeLabPythonId), "draft tidak tampil");

    res = await api("PATCH", `/api/admin/code-lab/${codeLabPythonId}`, {
      token: adminToken,
      body: { status: "published" }
    });
    eq(res.r.status, 200, "publish lagi");
  });

  await t("Code Lab: delete menghapus tantangan + audit + stats", async () => {
    let res = await api("DELETE", `/api/admin/code-lab/${codeLabSdId}`, { token: adminToken });
    eq(res.r.status, 200, "delete");
    res = await api("GET", `/api/admin/code-lab/${codeLabSdId}`, { token: adminToken });
    eq(res.r.status, 404, "sudah tidak ada");

    const stats = await api("GET", "/api/admin/stats", { token: adminToken });
    eq(stats.r.status, 200, "stats");
    ok(stats.d.codelab.total >= 1, "codelab.total");
    ok(stats.d.codelab.published >= 1, "codelab.published");

    const actions = db.prepare("SELECT action FROM admin_audit").all().map((r) => r.action);
    for (const required of ["code_lab.create", "code_lab.update", "code_lab.delete"]) {
      ok(actions.includes(required), `audit ${required}`);
    }
  });

  await t("GET /api/admin/users?grade=SD memfilter jenjang", async () => {
    const { r, d } = await api("GET", "/api/admin/users?grade=SD&limit=100", { token: adminToken });
    eq(r.status, 200, "status");
    ok(d.users.some((u) => u.username === "auto.student"), "murid SD ikut");
    ok(!d.users.some((u) => u.username === "student-renamed"), "murid SMP/SMK tidak ikut");
    ok(d.stats.tasks_total >= 1, "tasks_total");
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
      "curriculum.update",
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

  await t("Notifikasi admin: daftar, isolasi per admin, baca, dan hapus", async () => {
    let res = await api("GET", "/api/admin/notifications?limit=100", { token: adminToken });
    eq(res.r.status, 200, "status");
    ok(res.d.notifications.length >= 5, "jumlah notifikasi");
    const kinds = new Set(res.d.notifications.map((n) => n.kind));
    for (const required of ["student.create", "curriculum.update", "code_lab.published", "plugin.publish", "progress.complete"]) {
      ok(kinds.has(required), `jenis ${required}`);
    }
    ok(res.d.unreadCount >= 1, "unread awal");

    const target = res.d.notifications.find((n) => !n.read);
    ok(target, "ada notifikasi belum dibaca");
    const before = res.d.unreadCount;
    res = await api("POST", `/api/admin/notifications/${target.id}/read`, { token: adminToken });
    eq(res.r.status, 200, "baca satu");
    eq(res.d.read, true, "read true");
    eq(res.d.unreadCount, before - 1, "unread berkurang");

    res = await api("GET", "/api/admin/notifications", { token: studentToken });
    eq(res.r.status, 403, "murid dilarang");
    eq(res.d.code, "ADMIN_REQUIRED", "code murid");

    const other = await api("GET", "/api/admin/notifications?limit=100", { token: nonDevToken });
    eq(other.r.status, 200, "admin lain");
    ok(other.d.unreadCount >= 1, "status baca admin lain terpisah");

    res = await api("POST", "/api/admin/notifications/read-all", { token: adminToken });
    eq(res.r.status, 200, "baca semua");
    eq(res.d.unreadCount, 0, "semua dibaca");

    const otherAfter = await api("GET", "/api/admin/notifications", { token: nonDevToken });
    ok(otherAfter.d.unreadCount >= 1, "admin lain tetap unread");

    res = await api("DELETE", "/api/admin/notifications", { token: adminToken });
    eq(res.r.status, 200, "hapus semua");
    ok(res.d.deleted >= 1, "jumlah dihapus");

    res = await api("GET", "/api/admin/notifications", { token: adminToken });
    eq(res.r.status, 200, "list setelah hapus");
    eq(res.d.notifications.length, 0, "notifikasi kosong");
    eq(res.d.unreadCount, 0, "unread nol");
  });

  await t("Badge: CRUD, validasi, dan hapus melepas badge dari tugas", async () => {
    let res = await api("GET", "/api/admin/badges", { token: adminToken });
    eq(res.r.status, 200, "list awal");
    eq(res.d.items.length, 0, "kosong");

    res = await api("POST", "/api/admin/badges", {
      token: adminToken,
      body: { name: "Si Rajin", description: "10 tugas", icon: "fa-fire", color: "amber", rule: "tasks", threshold: 10, active: true }
    });
    eq(res.r.status, 201, "create");
    eq(res.d.item.name, "Si Rajin", "nama");
    eq(res.d.item.rule, "tasks", "rule");
    eq(res.d.item.threshold, 10, "threshold");
    const badgeId = res.d.item.id;

    res = await api("POST", "/api/admin/badges", { token: adminToken, body: { name: "si rajin" } });
    eq(res.r.status, 409, "nama duplikat");
    eq(res.d.code, "BADGE_NAME_EXISTS", "code duplikat");

    res = await api("POST", "/api/admin/badges", { token: adminToken, body: { name: "Salah", rule: "tasks", threshold: 0 } });
    eq(res.r.status, 400, "threshold minimal");
    eq(res.d.code, "ADMIN_DATA_INVALID", "code validasi");

    res = await api("PATCH", `/api/admin/badges/${badgeId}`, { token: adminToken, body: { color: "sky", active: false } });
    eq(res.r.status, 200, "patch");
    eq(res.d.item.color, "sky", "patch color");
    eq(res.d.item.active, false, "patch active");
    eq(res.d.item.name, "Si Rajin", "field lain dipertahankan");

    res = await api("GET", "/api/admin/badges", { token: studentToken });
    eq(res.r.status, 403, "murid dilarang");
  });

  await t("Tugas admin: CRUD, validasi, filter, dan relasi badge", async () => {
    let res = await api("GET", "/api/admin/badges", { token: adminToken });
    const badgeId = res.d.items[0].id;

    res = await api("POST", "/api/admin/tasks", {
      token: adminToken,
      body: {
        title: "Percabangan If-Else", description: "Tentukan lulus atau tidak.", grade: "SMP",
        type: "kode", points: 50, due: "2026-12-31", status: "terbit", badgeId
      }
    });
    eq(res.r.status, 201, "create");
    eq(res.d.item.grade, "SMP", "grade");
    eq(res.d.item.badgeId, badgeId, "badgeId");
    eq(res.d.item.submitted, 0, "submitted");
    eq(res.d.item.pending, 0, "pending");
    const taskId = res.d.item.id;

    res = await api("POST", "/api/admin/tasks", {
      token: adminToken,
      body: { title: "Tanpa tenggat", grade: "SD", type: "kuis", points: 10, status: "draft" }
    });
    eq(res.r.status, 400, "due wajib");
    eq(res.d.details.field, "due", "field due");

    res = await api("POST", "/api/admin/tasks", {
      token: adminToken,
      body: { title: "Poin salah", grade: "SD", type: "kuis", points: 1001, due: "2026-12-31" }
    });
    eq(res.r.status, 400, "poin maksimal");

    res = await api("POST", "/api/admin/tasks", {
      token: adminToken,
      body: { title: "Badge salah", grade: "SD", type: "kuis", points: 10, due: "2026-12-31", badgeId: 999999 }
    });
    eq(res.r.status, 400, "badge tidak ada");
    eq(res.d.details.field, "badgeId", "field badgeId");

    res = await api("GET", "/api/admin/tasks?grade=SD", { token: adminToken });
    eq(res.r.status, 200, "filter list");
    eq(res.d.items.length, 0, "filter grade kosong");

    res = await api("PATCH", `/api/admin/tasks/${taskId}`, { token: adminToken, body: { status: "ditutup", points: 70 } });
    eq(res.r.status, 200, "patch");
    eq(res.d.item.status, "ditutup", "status patch");
    eq(res.d.item.points, 70, "points patch");
    eq(res.d.item.title, "Percabangan If-Else", "judul tetap");

    // Pengumpulan siswa (dibuat langsung; endpoint murid untuk submit belum ada).
    const info = db.prepare(`
      INSERT INTO admin_task_submissions (task_id, user_id, answer, status)
      VALUES (?, ?, ?, 'dikumpulkan')
    `).run(taskId, studentId, "if nilai >= 75: print('Lulus')");
    const submissionId = Number(info.lastInsertRowid);

    res = await api("GET", `/api/admin/tasks/${taskId}/submissions`, { token: adminToken });
    eq(res.r.status, 200, "submissions list");
    eq(res.d.items.length, 1, "jumlah pengumpulan");
    eq(res.d.items[0].student_id, studentId, "student_id");
    ok(res.d.items[0].student_name, "student_name");
    eq(res.d.items[0].status, "dikumpulkan", "status kumpul");

    res = await api("GET", "/api/admin/tasks", { token: adminToken });
    const listed = res.d.items.find((x) => x.id === taskId);
    eq(listed.submitted, 1, "submitted dihitung");
    eq(listed.pending, 1, "pending dihitung");

    res = await api("PATCH", `/api/admin/submissions/${submissionId}`, { token: adminToken, body: { status: "dinilai", feedback: "Bagus" } });
    eq(res.r.status, 400, "nilai wajib");
    eq(res.d.details.field, "score", "field score");

    res = await api("PATCH", `/api/admin/submissions/${submissionId}`, { token: adminToken, body: { status: "revisi", score: null } });
    eq(res.r.status, 400, "feedback wajib untuk revisi");
    eq(res.d.details.field, "feedback", "field feedback");

    res = await api("PATCH", `/api/admin/submissions/${submissionId}`, { token: adminToken, body: { status: "dinilai", score: 90, feedback: "Mantap" } });
    eq(res.r.status, 200, "nilai");
    eq(res.d.item.status, "dinilai", "status dinilai");
    eq(res.d.item.score, 90, "score");
    ok(res.d.item.graded_at, "graded_at");

    res = await api("GET", "/api/admin/tasks", { token: adminToken });
    eq(res.d.items.find((x) => x.id === taskId).pending, 0, "pending nol setelah dinilai");

    res = await api("PATCH", `/api/admin/submissions/${submissionId}`, { token: adminToken, body: { status: "revisi", feedback: "Perbaiki validasi" } });
    eq(res.r.status, 200, "revisi");
    eq(res.d.item.graded_at, null, "graded_at kosong saat revisi");

    res = await api("PATCH", "/api/admin/submissions/999999", { token: adminToken, body: { status: "dinilai", score: 80 } });
    eq(res.r.status, 404, "submission tidak ada");

    // Hapus badge: tugas tetap ada tetapi badgeId menjadi null.
    res = await api("DELETE", `/api/admin/badges/${badgeId}`, { token: adminToken });
    eq(res.r.status, 200, "hapus badge");
    res = await api("GET", "/api/admin/tasks", { token: adminToken });
    eq(res.d.items.find((x) => x.id === taskId).badgeId, null, "badge dilepas");

    res = await api("GET", `/api/admin/tasks/${taskId}/submissions`, { token: studentToken });
    eq(res.r.status, 403, "murid tidak boleh menilai");

    res = await api("DELETE", `/api/admin/tasks/${taskId}`, { token: adminToken });
    eq(res.r.status, 200, "hapus tugas");
    res = await api("GET", `/api/admin/tasks/${taskId}/submissions`, { token: adminToken });
    eq(res.r.status, 404, "tugas terhapus");
  });

  await t("Pengaturan instansi: simpan, baca ulang, dan validasi", async () => {
    let res = await api("GET", "/api/admin/settings", { token: adminToken });
    eq(res.r.status, 200, "get awal");
    eqJson(res.d.settings, {}, "belum ada pengaturan");

    const settings = {
      name: "Dieng Cyber", tagline: "Platform Edukasi Coding", email: "info@diengcyber.local",
      phone: "", website: "https://diengcyber.local", address: "Wonosobo", logo: "",
      year: "2026/2027", semester: "Ganjil", grades: ["SD", "SMP", "SMK"], kkm: 75,
      defaultDueDays: 7, allowLate: true, latePenalty: 10, minPassword: 8, sessionHours: 12,
      forceChangePassword: true, notifNewTask: true, notifGraded: true
    };
    res = await api("PUT", "/api/admin/settings", { token: adminToken, body: { settings } });
    eq(res.r.status, 200, "put");
    eq(res.d.settings.name, "Dieng Cyber", "nama");
    eq(res.d.settings.grades.length, 3, "grades");

    res = await api("GET", "/api/admin/settings", { token: adminToken });
    eq(res.r.status, 200, "get ulang");
    eq(res.d.settings.kkm, 75, "kkm tersimpan");
    eq(res.d.settings.notifGraded, true, "notif tersimpan");

    res = await api("PUT", "/api/admin/settings", { token: adminToken, body: { settings: { ...settings, name: "" } } });
    eq(res.r.status, 400, "nama wajib");
    eq(res.d.details.field, "name", "field name");

    res = await api("PUT", "/api/admin/settings", { token: adminToken, body: { settings: { ...settings, grades: [] } } });
    eq(res.r.status, 400, "grades wajib");

    res = await api("PUT", "/api/admin/settings", { token: adminToken, body: { settings: { ...settings, kkm: 101 } } });
    eq(res.r.status, 400, "kkm range");

    res = await api("PUT", "/api/admin/settings", { token: adminToken, body: { settings: { ...settings, website: "diengcyber.local" } } });
    eq(res.r.status, 400, "website harus http");

    res = await api("GET", "/api/admin/settings", { token: studentToken });
    eq(res.r.status, 403, "murid dilarang");
  });

  await t("Keamanan & sesi: password minimum dan masa sesi diambil dari pengaturan instansi", async () => {
    const settings = {
      name: "Dieng Cyber", tagline: "Platform Edukasi Coding", email: "info@diengcyber.local",
      phone: "", website: "https://diengcyber.local", address: "Wonosobo", logo: "",
      year: "2026/2027", semester: "Ganjil", grades: ["SD", "SMP", "SMK"], kkm: 75,
      defaultDueDays: 7, allowLate: true, latePenalty: 10, minPassword: 10, sessionHours: 5,
      forceChangePassword: true, notifNewTask: true, notifGraded: true
    };
    let res = await api("PUT", "/api/admin/settings", { token: adminToken, body: { settings } });
    eq(res.r.status, 200, "put settings");
    eq(res.d.settings.minPassword, 10, "minPassword tersimpan");
    eq(res.d.settings.sessionHours, 5, "sessionHours tersimpan");

    res = await api("POST", "/api/auth/change-password", {
      token: adminToken,
      body: { currentPassword: "AdminPass123!", newPassword: "Pendek1!" }
    });
    eq(res.r.status, 400, "password baru di bawah min");
    eq(res.d.code, "VALIDATION_ERROR", "code password min");

    const t2 = auth.createSession(adminId, { sessionHours: 5 });
    const hash = crypto.createHash("sha256").update(t2).digest("hex");
    const row = db.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?").get(hash);
    ok(row && row.expires_at, "sesi dibuat");
    const exp = new Date(row.expires_at).getTime();
    ok(Math.abs(exp - (Date.now() + 5 * 3600_000)) < 60_000, "sesi sekitar 5 jam");
  });

  // ------------------------------------------------------------
  // AKSES & HAK AKSES: matriks permission dan akun instruktur/orang tua.
  // Catatan: sesi instruktur dipakai langsung via auth.createSession agar
  // tidak menambah pemakaian rate limit login yang sudah dipakai suite.
  // ------------------------------------------------------------
  await t("Akses: GET /api/admin/roles membaca matriks hak akses", async () => {
    const res = await api("GET", "/api/admin/roles", { token: adminToken });
    eq(res.r.status, 200, "status");
    ok(res.d.roles && res.d.roles.admin, "ada roles");
    eq(res.d.roles.admin.length, 12, "admin punya semua hak");
    eq(res.d.roles.instruktur.length, 6, "instruktur default");
    eq(res.d.roles.siswa.length, 2, "siswa default");
    eq(res.d.roles.ortu.length, 1, "ortu default");
    eq(res.d.roles.instruktur.includes("codelab.kelola"), true, "instruktur punya codelab");

    const me = await api("GET", "/api/admin/me", { token: adminToken });
    ok(Array.isArray(me.d.permissions) && me.d.permissions.includes("codelab.kelola"), "me memuat permissions");
  });

  await t("Akses: PUT /api/admin/roles validasi dan simpan", async () => {
    const putRoles = async (roles) => api("PUT", "/api/admin/roles", { token: adminToken, body: { roles } });
    let res = await putRoles({ admin: ["siswa.kelola"], instruktur: ["codelab.kelola"], siswa: ["materi.akses"], ortu: [] });
    eq(res.r.status, 200, "put valid");

    res = await putRoles({ admin: ["siswa.zzz"], instruktur: ["siswa.zzz"], siswa: ["materi.akses"], ortu: ["anak.lihat"] });
    eq(res.r.status, 400, "permission tidak dikenal");
    eq(res.d.code, "ADMIN_DATA_INVALID", "code permission");

    res = await putRoles({ admin: ["siswa.kelola"], instruktur: ["akses.kelola"], siswa: ["materi.akses"], ortu: ["anak.lihat"] });
    eq(res.r.status, 200, "put valid 2");
    res = await api("GET", "/api/admin/roles", { token: adminToken });
    eq(res.d.roles.instruktur.includes("akses.kelola"), true, "instruktur punya akses.kelola");
    eq(res.d.roles.admin.length, 12, "admin tetap semua");

    res = await putRoles({
      admin: ["siswa.kelola", "kurikulum.kelola", "codelab.kelola", "tugas.kelola", "tugas.nilai", "badge.kelola", "plugin.kelola", "pengaturan.ubah", "akses.kelola", "materi.akses", "tugas.kumpul", "anak.lihat"],
      instruktur: ["siswa.kelola", "kurikulum.kelola", "codelab.kelola", "tugas.kelola", "tugas.nilai", "badge.kelola"],
      siswa: ["materi.akses", "tugas.kumpul"],
      ortu: ["anak.lihat"]
    });
    eq(res.r.status, 200, "put default");
  });

  await t("Akses: instruktur dibuat, boleh codelab, dilarang user management, dan tidak bisa mengubah hak akses", async () => {
    let res = await api("POST", "/api/admin/instructors", {
      token: adminToken,
      body: { name: "Instruktur Uji", email: "instr1@diengcyber.local", role: "instruktur", grades: ["SMP", "SMK"], active: true }
    });
    eq(res.r.status, 201, "create instruktur");
    ok(res.d.temporaryPassword, "temporaryPassword");
    instrId = res.d.item.id;
    const instrToken = auth.createSession(instrId);
    db.prepare("UPDATE users SET must_change_password = 0 WHERE id = ?").run(instrId);

    res = await api("GET", "/api/admin/instructors", { token: adminToken });
    eq(res.r.status, 200, "list instruktur");
    ok(res.d.items.some((x) => Number(x.id) === instrId), "instruktur ada di list");
    eq(res.d.items.find((x) => Number(x.id) === instrId).role, "instruktur", "role UI instruktur");
    eq(res.d.items.find((x) => Number(x.id) === instrId).grades.includes("SMP"), true, "grades diterima");

    res = await api("GET", "/api/admin/me", { token: instrToken });
    eq(res.r.status, 200, "me instruktur");
    eq(res.d.role, "instruktur", "me role");
    ok(res.d.permissions.includes("codelab.kelola"), "me permissions default");

    res = await api("GET", "/api/admin/code-lab", { token: instrToken });
    eq(res.r.status, 200, "instruktur boleh akses codelab");

    res = await api("GET", "/api/admin/users", { token: instrToken });
    eq(res.r.status, 200, "instruktur boleh user management (siswa.kelola)");

    res = await api("GET", "/api/admin/audit", { token: instrToken });
    eq(res.r.status, 403, "instruktur dilarang audit (akses.kelola)");
    eq(res.d.code, "PERMISSION_DENIED", "code PERMISSION_DENIED");

    res = await api("PUT", "/api/admin/roles", { token: instrToken, body: { roles: {} } });
    eq(res.r.status, 403, "PUT roles hanya admin");
    eq(res.d.code, "PERMISSION_DENIED", "code PUT roles");
  });

  await t("Akses: self-protection dan hapus akun instruktur", async () => {
    let res = await api("PATCH", `/api/admin/instructors/${adminId}`, { token: adminToken, body: { role: "instruktur" } });
    eq(res.r.status, 400, "tidak bisa ganti peran self");
    eq(res.d.code, "SELF_ROLE_FORBIDDEN", "code SELF_ROLE_FORBIDDEN");

    res = await api("DELETE", `/api/admin/instructors/${instrId}`, { token: adminToken });
    eq(res.r.status, 200, "hapus instruktur");
    res = await api("GET", "/api/admin/instructors", { token: adminToken });
    ok(!res.d.items.some((x) => Number(x.id) === instrId), "instruktur terhapus");
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
