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
process.env.REPORT_EMAIL_ENABLED = "false";
process.env.REPORT_EMAIL_PROVIDER = "mock";

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

  await t("PATCH /api/admin/me -> profil (nama, email, telepon) tersimpan", async () => {
    let res = await api("PATCH", "/api/admin/me", {
      token: adminToken,
      body: {
        fullName: "Admin Satu",
        email: "admin1.changed@example.com",
        phone: "+62 812-3456-7890"
      }
    });
    eq(res.r.status, 200, "status");
    eq(res.d.fullName, "Admin Satu", "fullName");
    eq(res.d.email, "admin1.changed@example.com", "email");
    eq(res.d.phone, "+62 812-3456-7890", "phone");

    res = await api("GET", "/api/admin/me", { token: adminToken });
    eq(res.r.status, 200, "GET status");
    eq(res.d.fullName, "Admin Satu", "GET fullName");
    eq(res.d.email, "admin1.changed@example.com", "GET email");
    eq(res.d.phone, "+62 812-3456-7890", "GET phone");
    ok(res.d.createdAt, "createdAt ada");
  });

  await t("PATCH /api/admin/me -> validasi email/telepon dan email unik", async () => {
    let res = await api("PATCH", "/api/admin/me", {
      token: adminToken,
      body: { email: "bukan-email" }
    });
    eq(res.r.status, 400, "email tidak valid");
    eq(res.d.code, "ADMIN_DATA_INVALID", "code email");
    eq(res.d.details.field, "email", "field email");

    res = await api("PATCH", "/api/admin/me", {
      token: adminToken,
      body: { phone: "123" }
    });
    eq(res.r.status, 400, "telepon tidak valid");
    eq(res.d.details.field, "phone", "field phone");

    res = await api("PATCH", "/api/admin/me", {
      token: adminToken,
      body: { email: "admin2@example.com" }
    });
    eq(res.r.status, 409, "email dipakai akun lain");
    eq(res.d.code, "EMAIL_EXISTS", "code email unik");

    res = await api("PATCH", "/api/admin/me", { token: adminToken, body: {} });
    eq(res.r.status, 400, "body kosong");
    eq(res.d.code, "ADMIN_DATA_INVALID", "code body kosong");

    // Kembalikan email/telepon awal agar tes lain tidak terpengaruh.
    res = await api("PATCH", "/api/admin/me", {
      token: adminToken,
      body: { email: "admin1@example.com", phone: "" }
    });
    eq(res.r.status, 200, "restore profil");
    eq(res.d.phone, null, "phone kosong -> null");
  });

  await t("POST /api/admin/me/password -> validasi, ganti password, cabut sesi lain", async () => {
    const otherToken = auth.createSession(adminId);
    let res = await api("POST", "/api/admin/me/password", {
      token: adminToken,
      body: { currentPassword: "salah", newPassword: "NewAdminPass123!" }
    });
    eq(res.r.status, 400, "password lama salah");
    eq(res.d.code, "INVALID_PASSWORD", "code password lama");

    res = await api("POST", "/api/admin/me/password", {
      token: adminToken,
      body: { currentPassword: ADMIN_PASS, newPassword: "pendek" }
    });
    eq(res.r.status, 400, "password baru terlalu pendek");
    eq(res.d.code, "VALIDATION_ERROR", "code minimal");
    eq(res.d.details.field, "newPassword", "field newPassword");

    res = await api("POST", "/api/admin/me/password", {
      token: adminToken,
      body: { currentPassword: ADMIN_PASS, newPassword: ADMIN_PASS }
    });
    eq(res.r.status, 400, "password sama");
    eq(res.d.code, "PASSWORD_SAME", "code password sama");

    res = await api("POST", "/api/admin/me/password", {
      token: adminToken,
      body: { currentPassword: ADMIN_PASS, newPassword: "NewAdminPass123!" }
    });
    eq(res.r.status, 200, "ganti password");
    const row = db.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").get(adminId);
    eq(auth.verifyPassword("NewAdminPass123!", row.password_salt, row.password_hash), true, "hash baru");
    eq(auth.verifyPassword(ADMIN_PASS, row.password_salt, row.password_hash), false, "hash lama");

    res = await api("GET", "/api/admin/me", { token: adminToken });
    eq(res.r.status, 200, "sesi yang dipakai tetap aktif");

    res = await api("GET", "/api/admin/me", { token: otherToken });
    eq(res.r.status, 401, "sesi lain dicabut");

    // Kembalikan password awal untuk tes berikutnya.
    const restored = auth.hashPassword(ADMIN_PASS);
    db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
      .run(restored.hash, restored.salt, adminId);
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

  await t("Murid login ulang dan tidak boleh memakai endpoint admin", async () => {
    const login = await api("POST", "/api/auth/login", {
      body: { username: "student-renamed", password: NEW_STUDENT_PASS }
    });
    eq(login.r.status, 200, "login murid");
    studentToken = login.d.token;

    const { r, d } = await api("GET", "/api/admin/badges", { token: studentToken });
    eq(r.status, 403, "status");
    eq(d.code, "ADMIN_REQUIRED", "code");
  });

  await t("Lencana jalur dan tugas kurikulum: katalog, hak akses, dan 404", async () => {
    let res = await api("GET", "/api/admin/lencana", { token: studentToken });
    eq(res.r.status, 403, "murid dilarang");

    res = await api("GET", "/api/admin/lencana", { token: adminToken });
    eq(res.r.status, 200, "admin boleh");
    ok(Array.isArray(res.d.items) && res.d.items.length >= 1, "ada lencana jalur");
    const item = res.d.items[0];
    for (const field of ["key", "grade", "jalur", "emoji", "label", "totalTasks", "awarded"]) {
      ok(field in item, `field ${field}`);
    }
    ok(!("taskIds" in item), "daftar task tidak ikut dikirim");

    res = await api("GET", `/api/admin/lencana/${encodeURIComponent(item.key)}/students`, { token: adminToken });
    eq(res.r.status, 200, "daftar siswa berhak");
    ok(Array.isArray(res.d.students), "students berupa array");

    res = await api("GET", "/api/admin/lencana/ZZZ%3Anope/students", { token: adminToken });
    eq(res.r.status, 404, "jalur tidak ada");

    res = await api("GET", "/api/admin/curriculum-tasks", { token: adminToken });
    eq(res.r.status, 200, "tugas kurikulum");
    ok(Array.isArray(res.d.items), "items berupa array");
    res = await api("GET", "/api/admin/curriculum-tasks", { token: studentToken });
    eq(res.r.status, 403, "murid dilarang tugas kurikulum");
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
    ok(res.d.notifications.length >= 4, "jumlah notifikasi");
    const kinds = new Set(res.d.notifications.map((n) => n.kind));
    for (const required of ["student.create", "curriculum.update", "plugin.publish", "progress.complete"]) {
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

    // Siswa menerima notifikasi saat tugas dinilai dan saat diminta revisi.
    let notif = await api("GET", "/api/notifications", { token: studentToken });
    eq(notif.r.status, 200, "notifikasi siswa");
    const gradedNotif = notif.d.notifications.find((n) => n.kind === "task.graded" && n.title.includes("Percabangan If-Else"));
    ok(gradedNotif, "notifikasi nilai muncul");
    eq(gradedNotif.read, false, "notifikasi nilai belum dibaca");
    ok(gradedNotif.body.includes("90/100"), "isi notifikasi memuat nilai");
    ok(notif.d.unreadCount >= 1, "unread siswa");

    notif = await api("POST", `/api/notifications/${gradedNotif.id}/read`, { token: studentToken });
    eq(notif.r.status, 200, "baca notifikasi");
    eq(notif.d.read, true, "notifikasi ditandai dibaca");

    // Menyimpan ulang nilai yang sama tidak membuat notifikasi ganda.
    res = await api("PATCH", `/api/admin/submissions/${submissionId}`, { token: adminToken, body: { status: "dinilai", score: 90, feedback: "Mantap" } });
    eq(res.r.status, 200, "nilai ulang");
    notif = await api("GET", "/api/notifications?limit=100", { token: studentToken });
    eq(notif.d.notifications.filter((n) => n.kind === "task.graded" && n.title.includes("Percabangan If-Else")).length, 1, "tidak ada notifikasi ganda");

    notif = await api("GET", "/api/notifications", { token: adminToken });
    eq(notif.r.status, 403, "admin tidak memakai endpoint notifikasi siswa");
    eq(notif.d.code, "STUDENT_REQUIRED", "code khusus siswa");
    notif = await api("GET", "/api/notifications");
    eq(notif.r.status, 401, "notifikasi tanpa token");

    res = await api("GET", "/api/admin/tasks", { token: adminToken });
    eq(res.d.items.find((x) => x.id === taskId).pending, 0, "pending nol setelah dinilai");

    res = await api("PATCH", `/api/admin/submissions/${submissionId}`, { token: adminToken, body: { status: "revisi", feedback: "Perbaiki validasi" } });
    eq(res.r.status, 200, "revisi");
    eq(res.d.item.graded_at, null, "graded_at kosong saat revisi");

    notif = await api("GET", "/api/notifications", { token: studentToken });
    const revisionNotif = notif.d.notifications.find((n) => n.kind === "task.revision");
    ok(revisionNotif, "notifikasi revisi muncul");
    ok(revisionNotif.body.includes("Perbaiki validasi"), "isi notifikasi revisi");
    notif = await api("POST", "/api/notifications/read-all", { token: studentToken });
    eq(notif.r.status, 200, "baca semua notifikasi siswa");
    eq(notif.d.unreadCount, 0, "unread siswa nol");

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
  // AKSES & HAK AKSES: matriks permission dan akun instruktur.
  // Catatan: sesi instruktur dipakai langsung via auth.createSession agar
  // tidak menambah pemakaian rate limit login yang sudah dipakai suite.
  // ------------------------------------------------------------
  await t("Akses: GET /api/admin/roles membaca matriks hak akses", async () => {
    const res = await api("GET", "/api/admin/roles", { token: adminToken });
    eq(res.r.status, 200, "status");
    ok(res.d.roles && res.d.roles.admin, "ada roles");
    eq(res.d.roles.admin.length, 10, "admin punya semua hak");
    eq(res.d.roles.ortu, undefined, "role ortu sudah dihapus");
    eq(res.d.roles.instruktur.includes("codelab.kelola"), false, "instruktur tidak lagi punya codelab");
    eq(res.d.roles.instruktur.includes("tugas.kelola"), true, "instruktur punya tugas.kelola");
    eq(res.d.roles.instruktur.length, 5, "instruktur default");
    eq(res.d.roles.siswa.length, 2, "siswa default");

    const me = await api("GET", "/api/admin/me", { token: adminToken });
    ok(Array.isArray(me.d.permissions) && me.d.permissions.includes("kurikulum.kelola"), "me memuat permissions");
  });

  await t("Akses: PUT /api/admin/roles validasi dan simpan", async () => {
    const putRoles = async (roles) => api("PUT", "/api/admin/roles", { token: adminToken, body: { roles } });
    let res = await putRoles({
      admin: ["siswa.kelola"],
      instruktur: ["tugas.kelola"],
      siswa: ["materi.akses"]
    });
    eq(res.r.status, 200, "put valid");

    res = await putRoles({ admin: ["siswa.zzz"], instruktur: ["siswa.zzz"], siswa: ["materi.akses"] });
    eq(res.r.status, 400, "permission tidak dikenal");
    eq(res.d.code, "ADMIN_DATA_INVALID", "code permission");

    res = await putRoles({ admin: ["siswa.kelola"], instruktur: ["akses.kelola"], siswa: ["materi.akses"] });
    eq(res.r.status, 200, "put valid 2");
    res = await api("GET", "/api/admin/roles", { token: adminToken });
    eq(res.d.roles.instruktur.includes("akses.kelola"), true, "instruktur punya akses.kelola");
    eq(res.d.roles.admin.length, 10, "admin tetap semua");

    res = await putRoles({
      admin: ["siswa.kelola", "kurikulum.kelola", "tugas.kelola", "tugas.nilai", "badge.kelola", "plugin.kelola", "pengaturan.ubah", "akses.kelola", "materi.akses", "tugas.kumpul"],
      instruktur: ["siswa.kelola", "kurikulum.kelola", "tugas.kelola", "tugas.nilai", "badge.kelola"],
      siswa: ["materi.akses", "tugas.kumpul"]
    });
    eq(res.r.status, 200, "put default");
  });

  await t("Akses: instruktur dibuat, boleh badge, dilarang user management, dan tidak bisa mengubah hak akses", async () => {
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
    ok(res.d.permissions.includes("kurikulum.kelola"), "me permissions default");

    res = await api("GET", "/api/admin/badges", { token: instrToken });
    eq(res.r.status, 200, "instruktur boleh akses badge");

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

  await t("Akses: email akun terhapus bisa dipakai lagi, duplikat aktif tetap ditolak", async () => {
    const email = "reuse.staff@diengcyber.local";
    let res = await api("POST", "/api/admin/instructors", {
      token: adminToken,
      body: { name: "Reuse Satu", email, role: "instruktur", grades: ["SD"] }
    });
    eq(res.r.status, 201, "create staff pertama");
    const firstId = res.d.item.id;
    eq(db.prepare("SELECT email FROM users WHERE id = ?").get(firstId).email, email, "email tersimpan");

    res = await api("DELETE", `/api/admin/instructors/${firstId}`, { token: adminToken });
    eq(res.r.status, 200, "hapus staff pertama");
    eq(db.prepare("SELECT email FROM users WHERE id = ?").get(firstId).email, email, "email masih di akun terhapus sampai dipakai ulang");

    // Beda kapitalisasi tetap dianggap email yang sama.
    res = await api("POST", "/api/admin/instructors", {
      token: adminToken,
      body: { name: "Reuse Dua", email: "ReUse.Staff@DiengCyber.Local", role: "instruktur", grades: ["SD"] }
    });
    eq(res.r.status, 201, "create staff ulang dengan email sama");
    const secondId = res.d.item.id;
    eq(db.prepare("SELECT email FROM users WHERE id = ?").get(firstId).email, null, "email dilepas dari akun terhapus");
    eq(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = ? COLLATE NOCASE").get(email).n, 1, "hanya satu pemilik email");

    res = await api("POST", "/api/admin/instructors", {
      token: adminToken,
      body: { name: "Reuse Tiga", email, role: "instruktur", grades: ["SD"] }
    });
    eq(res.r.status, 409, "duplikat akun aktif ditolak");
    eq(res.d.code, "EMAIL_EXISTS", "kode EMAIL_EXISTS");

    // PATCH email juga melepas email milik akun yang sudah dihapus.
    const patchEmail = "reuse.staff.patch@diengcyber.local";
    res = await api("POST", "/api/admin/instructors", {
      token: adminToken,
      body: { name: "Reuse Patch", email: patchEmail, role: "instruktur", grades: ["SD"] }
    });
    eq(res.r.status, 201, "create staff untuk patch");
    res = await api("DELETE", `/api/admin/instructors/${res.d.item.id}`, { token: adminToken });
    eq(res.r.status, 200, "hapus staff patch");
    res = await api("PATCH", `/api/admin/instructors/${secondId}`, {
      token: adminToken,
      body: { email: patchEmail.toUpperCase() }
    });
    eq(res.r.status, 200, "patch staff ke email akun terhapus");
    eq(db.prepare("SELECT email FROM users WHERE id = ?").get(secondId).email, patchEmail, "email baru tersimpan huruf kecil");
    eq(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = ? COLLATE NOCASE").get(patchEmail).n, 1, "satu pemilik email patch");
  });

  await t("Murid: email akun terhapus bisa dipakai lagi", async () => {
    const email = "reuse.siswa@diengcyber.local";
    let res = await api("POST", "/api/admin/users", {
      token: adminToken,
      body: { fullName: "Murid Reuse", email, allowedGrades: ["SD"] }
    });
    eq(res.r.status, 201, "create murid pertama");
    const firstId = res.d.id;

    res = await api("DELETE", `/api/admin/users/${firstId}`, { token: adminToken });
    eq(res.r.status, 200, "hapus murid pertama");

    res = await api("POST", "/api/admin/users", {
      token: adminToken,
      body: { fullName: "Murid Reuse Dua", email: email.toUpperCase(), allowedGrades: ["SD"] }
    });
    eq(res.r.status, 201, "create murid ulang dengan email sama");
    eq(db.prepare("SELECT email FROM users WHERE id = ?").get(firstId).email, null, "email murid terhapus dilepas");

    res = await api("POST", "/api/admin/users", {
      token: adminToken,
      body: { fullName: "Murid Reuse Tiga", email, allowedGrades: ["SD"] }
    });
    eq(res.r.status, 409, "duplikat murid aktif ditolak");
    eq(res.d.code, "EMAIL_EXISTS", "kode duplikat murid");
  });

  // ------------------------------------------------------------
  // WALI SISWA & TAUTAN LAPORAN
  // Wali bukan akun login: hanya kontak yang menerima tautan laporan.
  // ------------------------------------------------------------
  let guardianId = null;

  await t("Wali: admin mengelola kontak wali siswa", async () => {
    const put = (body, id = studentId) =>
      api("PUT", `/api/admin/users/${id}/guardians`, { token: adminToken, body });

    let res = await put({
      guardians: [
        { name: "Ayah Siswa", email: "Ayah.Siswa@Example.com", relation: "ayah" },
        { name: "Ibu Siswa", email: "ibu.siswa@example.com", relation: "ibu" }
      ]
    });
    eq(res.r.status, 200, "put wali");
    eq(res.d.total, 2, "dua wali");
    eq(res.d.items[0].email, "ayah.siswa@example.com", "email dinormalisasi");
    eq(res.d.items[1].relation, "ibu", "hubungan wali");
    ok(Number.isSafeInteger(res.d.items[0].id), "id wali");
    guardianId = res.d.items[0].id;

    res = await api("GET", `/api/admin/users/${studentId}/guardians`, { token: adminToken });
    eq(res.r.status, 200, "get wali");
    eq(res.d.total, 2, "get wali total");

    // Default relation = wali.
    res = await put({ guardians: [{ name: "Wali Siswa", email: "wali.siswa@example.com" }] });
    eq(res.r.status, 200, "put wali default");
    eq(res.d.items[0].relation, "wali", "default hubungan");

    res = await put({ guardians: "bukan-array" });
    eq(res.r.status, 400, "guardians harus array");
    eq(res.d.code, "ADMIN_DATA_INVALID", "code array wali");
    eq(res.d.details.field, "guardians", "field array wali");

    res = await put({ guardians: [{ name: "Tanpa Email", email: "bukan-email" }] });
    eq(res.r.status, 400, "email wali tidak valid");
    eq(res.d.details.field, "guardians[0].email", "field email wali");

    res = await put({
      guardians: [
        { name: "Sama", email: "sama@example.com" },
        { name: "Sama 2", email: "SAMA@example.com" }
      ]
    });
    eq(res.r.status, 400, "email wali duplikat");
    eq(res.d.details.field, "guardians[1].email", "field duplikat");

    res = await put({ guardians: [{ name: "Hubungan", email: "hub@example.com", relation: "tetangga" }] });
    eq(res.r.status, 400, "hubungan tidak valid");
    eq(res.d.details.field, "guardians[0].relation", "field hubungan");

    res = await put({
      guardians: Array.from({ length: 6 }, (_, i) => ({
        name: "Wali " + (i + 1),
        email: `wali${i + 1}@example.com`
      }))
    });
    eq(res.r.status, 400, "maksimal lima wali");
    ok(/Maksimal 5/.test(res.d.message), "pesan batas wali");

    res = await put({ guardians: [] }, 999999);
    eq(res.r.status, 404, "siswa tidak ditemukan");
    eq(res.d.code, "NOT_FOUND", "code siswa hilang");

    // Kembalikan dua wali untuk tes tautan laporan.
    res = await put({
      guardians: [
        { name: "Ayah Siswa", email: "ayah.siswa@example.com", relation: "ayah" },
        { name: "Ibu Siswa", email: "ibu.siswa@example.com", relation: "ibu" }
      ]
    });
    eq(res.r.status, 200, "put ulang wali");
    guardianId = res.d.items[0].id;
  });

  await t("Tautan laporan: dibuat admin, bisa dibaca publik, dan dipantau aksesnya", async () => {
    const created = await api("POST", `/api/admin/users/${studentId}/report-links`, {
      token: adminToken,
      body: { guardianId, expiresInDays: 7 }
    });
    eq(created.r.status, 201, "buat tautan");
    ok(Number.isSafeInteger(created.d.item.id), "id tautan");
    eq(created.d.item.guardianId, guardianId, "guardian tautan");
    ok(/\/api\/reports\/[A-Za-z0-9_-]{43}$/.test(created.d.item.url), "url tautan");
    ok(/^https?:\/\/[^/]+\/orangtua\/laporan\.html#[A-Za-z0-9_-]{43}$/.test(created.d.item.pageUrl), "pageUrl halaman wali (token setelah #)");
    eq(created.d.item.pageUrl.split("#")[1], created.d.item.url.split("/").pop(), "token pageUrl sama dengan url API");
    ok(created.d.item.expiresAt, "expiresAt tautan");

    const token = created.d.item.url.split("/").pop();
    const linkId = created.d.item.id;

    let res = await api("GET", `/api/admin/users/${studentId}/report-links`, { token: adminToken });
    eq(res.r.status, 200, "list tautan");
    eq(res.d.items[0].id, linkId, "tautan terbaru");
    eq(res.d.items[0].status, "active", "status aktif");
    eq(res.d.items[0].guardianName, "Ayah Siswa", "nama wali tautan");

    // Akses publik tanpa sesi.
    res = await api("GET", `/api/reports/${token}`);
    eq(res.r.status, 200, "akses publik");
    eq(res.d.ok, true, "ok publik");
    // Siswa ini di-rename lebih awal (fullName "Renamed Student"); laporan memakai full_name.
    eq(res.d.report.student.name, "Renamed Student", "nama siswa laporan");
    eq(res.d.link.guardianName, "Ayah Siswa", "wali pada laporan");
    // Whitelist: daftar kunci dikunci persis. Menambah field ke laporan publik (yang bisa dibuka
    // siapa pun pemegang tautan) harus keputusan sadar, bukan kebetulan.
    eqJson(Object.keys(res.d.report), ["generatedAt", "institution", "student", "summary", "grades", "completedTasks", "submissions", "mentorNote"], "kunci laporan publik");
    eqJson(Object.keys(res.d.report.summary), ["points", "totalTasks", "completedTasks", "completionRate", "gradedSubmissions", "averageScore", "completedModules", "failedAttempts", "timeSpentSeconds"], "kunci summary publik");
    eqJson(Object.keys(res.d.link), ["expiresAt", "guardianName"], "kunci link publik");
    eqJson(Object.keys(res.d.child), ["fullName"], "kunci child");
    ok(Array.isArray(res.d.progress) && Array.isArray(res.d.attempts), "progress dan attempts berupa array");
    const owner = db.prepare("SELECT username, email FROM users WHERE id = ?").get(studentId);
    const publicBody = JSON.stringify(res.d);
    ok(!publicBody.includes(owner.username), "username siswa tidak bocor");
    if (owner.email) ok(!publicBody.includes(owner.email), "email siswa tidak bocor");
    ok(!/achievement|lencana|analytics/i.test(publicBody), "tidak ada data lencana/analytics");
    ok(Array.isArray(res.d.report.grades), "grades laporan");
    ok(Array.isArray(res.d.report.completedTasks), "completedTasks laporan");
    ok(Array.isArray(res.d.report.submissions), "submissions laporan");
    eq(res.r.headers.get("cache-control"), "no-store, max-age=0", "cache-control");
    eq(res.r.headers.get("referrer-policy"), "no-referrer", "referrer-policy");
    ok(/noindex/.test(res.r.headers.get("x-robots-tag") || ""), "x-robots-tag");

    res = await api("GET", `/api/admin/users/${studentId}/report-links`, { token: adminToken });
    eq(res.d.items[0].accessCount, 1, "akses tercatat");
    ok(res.d.items[0].lastAccessedAt, "waktu akses tercatat");

    res = await api("GET", "/api/reports/" + "x".repeat(43));
    eq(res.r.status, 404, "token tidak dikenal");
    eq(res.d.code, "REPORT_NOT_FOUND", "code token");
  });

  await t("Tautan laporan: isolasi siswa, pencabutan, dan kedaluwarsa", async () => {
    // Username/email baru: "student2" sudah dipakai tes sebelumnya (soft-deleted, tapi barisnya tetap ada).
    const otherStudent = addUser("siswa-laporan", "siswa-laporan@example.com", STUDENT_PASS, "student");
    let res = await api("PUT", `/api/admin/users/${otherStudent}/guardians`, {
      token: adminToken,
      body: { guardians: [{ name: "Wali Dua", email: "wali.dua@example.com", relation: "wali" }] }
    });
    eq(res.r.status, 200, "wali siswa 2");

    const first = await api("POST", `/api/admin/users/${studentId}/report-links`, {
      token: adminToken,
      body: { expiresInDays: 30 }
    });
    const second = await api("POST", `/api/admin/users/${otherStudent}/report-links`, {
      token: adminToken,
      body: { guardianId: res.d.items[0].id, expiresInDays: 30 }
    });
    eq(first.r.status, 201, "tautan siswa 1");
    eq(second.r.status, 201, "tautan siswa 2");

    const firstToken = first.d.item.url.split("/").pop();
    const secondToken = second.d.item.url.split("/").pop();
    ok(firstToken !== secondToken, "token berbeda");

    res = await api("GET", `/api/reports/${secondToken}`);
    eq(res.r.status, 200, "akses siswa 2");
    eq(res.d.report.student.name, null, "siswa tanpa nama lengkap tidak memakai username sebagai nama");
    eq(res.d.child.fullName, null, "child.fullName kosong, bukan username");
    ok(!JSON.stringify(res.d).includes("siswa-laporan"), "username siswa 2 tidak muncul di laporan");
    eq(res.d.link.guardianName, "Wali Dua", "wali siswa 2");

    // Cabut tautan pertama.
    res = await api("DELETE", `/api/admin/users/${studentId}/report-links/${first.d.item.id}`, {
      token: adminToken
    });
    eq(res.r.status, 200, "cabut tautan");
    eq(res.d.revoked, true, "revoked");
    res = await api("GET", `/api/reports/${firstToken}`);
    eq(res.r.status, 404, "tautan dicabut 404");
    eq(res.d.code, "REPORT_NOT_FOUND", "code dicabut");

    res = await api("GET", `/api/admin/users/${studentId}/report-links`, { token: adminToken });
    ok(res.d.items.some((x) => x.id === first.d.item.id && x.status === "revoked"), "status revoked");

    // Kedaluwarsa: tautan aktif yang lewat masa berlaku harus ditolak.
    const expiring = await api("POST", `/api/admin/users/${studentId}/report-links`, {
      token: adminToken,
      body: { expiresInDays: 1 }
    });
    eq(expiring.r.status, 201, "tautan kedaluwarsa dibuat");
    const expiringToken = expiring.d.item.url.split("/").pop();
    db.prepare("UPDATE report_links SET expires_at = datetime('now', '-1 day') WHERE id = ?")
      .run(expiring.d.item.id);
    res = await api("GET", `/api/reports/${expiringToken}`);
    eq(res.r.status, 404, "tautan kedaluwarsa 404");
    res = await api("GET", `/api/admin/users/${studentId}/report-links`, { token: adminToken });
    ok(res.d.items.some((x) => x.id === expiring.d.item.id && x.status === "expired"), "status expired");

    // Batas expiresInDays dan isolasi admin lain.
    res = await api("POST", `/api/admin/users/${studentId}/report-links`, {
      token: adminToken,
      body: { expiresInDays: 0 }
    });
    eq(res.r.status, 400, "expiresInDays 0 ditolak");
    eq(res.d.details.field, "expiresInDays", "field expiresInDays");

    res = await api("POST", `/api/admin/users/${studentId}/report-links`, {
      token: adminToken,
      body: { guardianId: 999999 }
    });
    eq(res.r.status, 400, "wali bukan milik siswa");
    eq(res.d.code, "GUARDIAN_NOT_FOUND", "code wali salah");

    res = await api("GET", `/api/admin/users/${otherStudent}/report-links`, { token: nonDevToken });
    eq(res.r.status, 200, "admin lain boleh mengelola");
    ok(res.d.items.every((x) => x.guardianName !== "Ayah Siswa"), "tautan tidak tercampur");
  });

  await t("Akses: instruktur dilarang endpoint khusus admin (akses.kelola)", async () => {
    const instrUserId = addUser("instr-link", "instr-link@diengcyber.local", "InstrPass123!", "instruktur");
    db.prepare("UPDATE users SET must_change_password = 0 WHERE id = ?").run(instrUserId);
    const instrToken = auth.createSession(instrUserId);

    let res = await api("GET", "/api/admin/instructors", { token: instrToken });
    eq(res.r.status, 403, "GET instructors instruktur");
    eq(res.d.code, "PERMISSION_DENIED", "code GET instructors");

    // Sebelum regex diperbaiki, PATCH/DELETE /instructors/:id lolos gate permission.
    res = await api("PATCH", `/api/admin/instructors/${adminId}`, {
      token: instrToken,
      body: { role: "admin" }
    });
    eq(res.r.status, 403, "PATCH instruktur kena gate");
    eq(res.d.code, "PERMISSION_DENIED", "code PATCH");

    res = await api("DELETE", `/api/admin/instructors/${adminId}`, { token: instrToken });
    eq(res.r.status, 403, "DELETE instruktur kena gate");
    eq(res.d.code, "PERMISSION_DENIED", "code DELETE");

    // Wali/report-link memakai izin siswa.kelola, jadi instruktur boleh.
    res = await api("GET", `/api/admin/users/${studentId}/guardians`, { token: instrToken });
    eq(res.r.status, 200, "instruktur boleh kelola wali (siswa.kelola)");
  });

  await t("Wali: edit daftar tidak memutus tautan wali yang dipertahankan, wali yang dihapus ikut dicabut", async () => {
    const sid = addUser("siswa-wali", "siswa-wali@example.com", STUDENT_PASS, "student");
    const put = (guardians) => api("PUT", `/api/admin/users/${sid}/guardians`, { token: adminToken, body: { guardians } });
    const AYAH = { name: "Ayah Wali", email: "ayah.wali@example.com", relation: "ayah" };
    const IBU = { name: "Ibu Wali", email: "ibu.wali@example.com", relation: "ibu" };

    let res = await put([AYAH, IBU]);
    eq(res.r.status, 200, "put dua wali");
    const ayah = res.d.items[0];
    const ibu = res.d.items[1];

    const make = (guardian) => api("POST", `/api/admin/users/${sid}/report-links`, {
      token: adminToken,
      body: { guardianId: guardian.id, expiresInDays: 30 }
    });
    const linkAyah = await make(ayah);
    const linkIbu = await make(ibu);
    eq(linkAyah.r.status, 201, "tautan ayah");
    eq(linkIbu.r.status, 201, "tautan ibu");
    const tokenAyah = linkAyah.d.item.url.split("/").pop();
    const tokenIbu = linkIbu.d.item.url.split("/").pop();

    // Edit daftar: Ayah tidak berubah, hanya nama Ibu yang diganti.
    res = await put([AYAH, { ...IBU, name: "Ibu Wali Baru" }]);
    eq(res.r.status, 200, "put edit wali");
    eq(res.d.items[0].id, ayah.id, "id ayah dipertahankan");
    eq(res.d.items[1].id, ibu.id, "id ibu dipertahankan");
    eq(res.d.items[1].name, "Ibu Wali Baru", "nama ibu berubah");

    res = await api("GET", `/api/reports/${tokenAyah}`);
    eq(res.r.status, 200, "tautan ayah tetap hidup setelah edit");
    eq(res.d.link.guardianName, "Ayah Wali", "tautan ayah tetap terhubung ke wali");
    res = await api("GET", `/api/reports/${tokenIbu}`);
    eq(res.r.status, 200, "tautan ibu tetap hidup setelah edit");
    eq(res.d.link.guardianName, "Ibu Wali Baru", "tautan ibu memakai nama terbaru");

    // Hapus Ayah dari daftar: tautannya harus langsung mati, tautan Ibu tidak terpengaruh.
    res = await put([{ ...IBU, name: "Ibu Wali Baru" }]);
    eq(res.r.status, 200, "put hapus ayah");
    eq(res.d.total, 1, "tinggal satu wali");

    res = await api("GET", `/api/reports/${tokenAyah}`);
    eq(res.r.status, 404, "tautan wali yang dihapus ikut dicabut");
    res = await api("GET", `/api/reports/${tokenIbu}`);
    eq(res.r.status, 200, "tautan wali lain tidak terpengaruh");

    res = await api("GET", `/api/admin/users/${sid}/report-links`, { token: adminToken });
    ok(res.d.items.some((x) => x.id === linkAyah.d.item.id && x.status === "revoked"), "status revoked tercatat");
  });

  await t("Berlangganan: admin menyimpan tanggal mulai dan melihat jatuh tempo laporan pertama", async () => {
    const sid = addUser("siswa-langganan", "siswa-langganan@example.com", STUDENT_PASS, "student");
    const put = (body, token = adminToken) => api("PUT", `/api/admin/users/${sid}/subscription`, { token, body });

    let res = await put({ startedAt: "2026-11-04" });
    eq(res.r.status, 200, "simpan tanggal");
    eq(res.d.item.subscriptionStartedAt, "2026-11-04", "tanggal tersimpan");
    eq(res.d.item.firstReportDueDate, "2026-12-04", "jatuh tempo 1 bulan kemudian");

    res = await api("GET", `/api/admin/users/${sid}`, { token: adminToken });
    eq(res.d.user.subscriptionStartedAt, "2026-11-04", "detail user memuat tanggal");
    eq(res.d.user.firstReportDueDate, "2026-12-04", "detail user memuat jatuh tempo");
    ok(!("subscription_started_at" in res.d.user), "tidak ada duplikat snake_case");

    res = await api("GET", "/api/admin/users?search=siswa-langganan", { token: adminToken });
    eq(res.d.users[0].subscriptionStartedAt, "2026-11-04", "daftar user memuat tanggal");

    res = await put({ startedAt: "2026-01-31" });
    eq(res.d.item.firstReportDueDate, "2026-02-28", "31 Jan + 1 bulan = 28 Feb");

    for (const bad of ["2026-02-30", "04-11-2026", "2026-11-04T00:00:00Z", "", "bukan tanggal", 20261104, true, {}]) {
      res = await put({ startedAt: bad });
      eq(res.r.status, 400, `tanggal ditolak: ${JSON.stringify(bad)}`);
      eq(res.d.code, "ADMIN_DATA_INVALID", `code untuk ${JSON.stringify(bad)}`);
    }
    res = await put({});
    eq(res.r.status, 400, "startedAt wajib ada (null harus eksplisit)");
    res = await api("GET", `/api/admin/users/${sid}`, { token: adminToken });
    eq(res.d.user.subscriptionStartedAt, "2026-01-31", "input salah tidak mengubah data");

    res = await put({ startedAt: null });
    eq(res.r.status, 200, "hapus tanggal");
    eq(res.d.item.subscriptionStartedAt, null, "tanggal kosong");
    eq(res.d.item.firstReportDueDate, null, "jatuh tempo kosong");

    res = await api("PUT", "/api/admin/users/999999/subscription", { token: adminToken, body: { startedAt: "2026-11-04" } });
    eq(res.r.status, 404, "siswa tidak ada");
    res = await api("PUT", `/api/admin/users/${adminId}/subscription`, { token: adminToken, body: { startedAt: "2026-11-04" } });
    eq(res.r.status, 404, "akun admin bukan target berlangganan");
    res = await put({ startedAt: "2026-11-04" }, studentToken);
    eq(res.r.status, 403, "siswa dilarang");
    res = await put({ startedAt: "2026-11-04" }, null);
    eq(res.r.status, 401, "tanpa token");

    const audits = db.prepare("SELECT details FROM admin_audit WHERE action = 'subscription.update' AND target_id = ? ORDER BY id").all(String(sid)).map((r) => JSON.parse(r.details));
    eq(audits.length, 3, "tiga perubahan sukses tercatat di audit");
    eqJson([audits[0].from, audits[0].to], [null, "2026-11-04"], "audit: dari kosong ke tanggal");
    eqJson([audits[2].from, audits[2].to], ["2026-01-31", null], "audit: penghapusan tercatat");
  });

  await t("Berlangganan: mengubah tanggal menyesuaikan pengiriman yang belum terkirim", async () => {
    const deliveries = require("./report-deliveries");
    const sid = addUser("siswa-sesuai", "siswa-sesuai@example.com", STUDENT_PASS, "student");
    const put = (startedAt) => api("PUT", `/api/admin/users/${sid}/subscription`, { token: adminToken, body: { startedAt } });
    await put("2026-11-04");
    const pending = deliveries.queueDelivery(db, { studentId: sid, recipientEmail: "belum@example.com", dueDate: "2026-12-04" });
    const sentRow = deliveries.queueDelivery(db, { studentId: sid, recipientEmail: "sudah@example.com", dueDate: "2026-12-04" });
    deliveries.markSent(db, sentRow.id);

    let res = await put("2027-01-31");
    eqJson(res.d.deliveries, { rescheduled: 1, skipped: 0 }, "hanya pending yang digeser");
    res = await api("GET", `/api/admin/users/${sid}/report-deliveries`, { token: adminToken });
    const byEmail = Object.fromEntries(res.d.items.map((x) => [x.recipientEmail, x]));
    eq(byEmail["belum@example.com"].dueDate, "2027-02-28", "pending digeser ke 28 Feb");
    eq(byEmail["sudah@example.com"].dueDate, "2026-12-04", "sent tidak diubah");

    res = await put(null);
    eqJson(res.d.deliveries, { rescheduled: 0, skipped: 1 }, "tanggal dihapus membatalkan yang belum terkirim");
    res = await api("GET", `/api/admin/users/${sid}/report-deliveries`, { token: adminToken });
    const after = Object.fromEntries(res.d.items.map((x) => [x.recipientEmail, x.status]));
    eq(after["belum@example.com"], "skipped", "yang belum terkirim dibatalkan");
    eq(after["sudah@example.com"], "sent", "yang sudah terkirim tetap sent");
    ok(pending.id > 0);
  });

  await t("Catatan pengiriman: daftar per siswa dan global, filter, dan hak akses", async () => {
    const deliveries = require("./report-deliveries");
    const sid = addUser("siswa-catatan", "siswa-catatan@example.com", STUDENT_PASS, "student");
    const a = deliveries.queueDelivery(db, { studentId: sid, recipientEmail: "a@example.com", dueDate: "2026-12-04" });
    const b = deliveries.queueDelivery(db, { studentId: sid, recipientEmail: "b@example.com", dueDate: "2026-12-04" });
    deliveries.markSent(db, a.id);
    deliveries.markFailed(db, b.id, "SMTP timeout");

    let res = await api("GET", `/api/admin/users/${sid}/report-deliveries`, { token: adminToken });
    eq(res.r.status, 200, "daftar per siswa");
    eqJson([res.d.total, res.d.items.length], [2, 2], "dua catatan");
    eq(res.d.items[0].status, "failed", "terbaru dulu");
    eq(res.d.items[0].lastError, "SMTP timeout", "alasan gagal terlihat");

    res = await api("GET", `/api/admin/users/${sid}/report-deliveries?status=sent`, { token: adminToken });
    eqJson([res.d.total, res.d.items[0].recipientEmail], [1, "a@example.com"], "filter status sent");
    res = await api("GET", `/api/admin/users/${sid}/report-deliveries?status=ngawur`, { token: adminToken });
    eq(res.r.status, 400, "status tidak dikenal ditolak");
    res = await api("GET", `/api/admin/users/${sid}/report-deliveries?limit=1&page=2`, { token: adminToken });
    eqJson([res.d.items.length, res.d.pages], [1, 2], "paginasi");
    res = await api("GET", "/api/admin/users/999999/report-deliveries", { token: adminToken });
    eq(res.r.status, 404, "siswa tidak ada");

    res = await api("GET", "/api/admin/report-deliveries?status=failed", { token: adminToken });
    eq(res.r.status, 200, "daftar global");
    ok(res.d.items.length >= 1 && res.d.items.every((x) => x.status === "failed"), "filter global");
    ok(res.d.items.every((x) => typeof x.studentName === "string"), "nama siswa ikut tampil");
    ok(!/token/i.test(JSON.stringify(res.d)), "tidak ada token/hash di respons");

    res = await api("GET", "/api/admin/report-deliveries", { token: studentToken });
    eq(res.r.status, 403, "siswa dilarang (global)");
    res = await api("GET", `/api/admin/users/${sid}/report-deliveries`, { token: studentToken });
    eq(res.r.status, 403, "siswa dilarang (per siswa)");
    res = await api("GET", "/api/admin/report-deliveries", { token: null });
    eq(res.r.status, 401, "tanpa token (global)");

    const instrUserId = addUser("instr-kirim", "instr-kirim@diengcyber.local", "InstrPass123!", "instruktur");
    db.prepare("UPDATE users SET must_change_password = 0 WHERE id = ?").run(instrUserId);
    const instrToken = auth.createSession(instrUserId);
    res = await api("GET", "/api/admin/report-deliveries", { token: instrToken });
    eq(res.r.status, 200, "instruktur dengan siswa.kelola boleh");

    // Route global baru tidak boleh lolos tanpa aturan izin: tanpa siswa.kelola harus 403.
    const previous = db.prepare("SELECT permissions FROM admin_role_permissions WHERE role = 'instruktur'").get();
    db.prepare(`INSERT INTO admin_role_permissions (role, permissions) VALUES ('instruktur', ?)
      ON CONFLICT(role) DO UPDATE SET permissions = excluded.permissions`).run(JSON.stringify(["tugas.kelola"]));
    try {
      res = await api("GET", "/api/admin/report-deliveries", { token: instrToken });
      eq(res.r.status, 403, "instruktur tanpa siswa.kelola dilarang (global)");
      eq(res.d.code, "PERMISSION_DENIED", "code global");
      res = await api("GET", `/api/admin/users/${sid}/report-deliveries`, { token: instrToken });
      eq(res.r.status, 403, "instruktur tanpa siswa.kelola dilarang (per siswa)");
      res = await api("PUT", `/api/admin/users/${sid}/subscription`, { token: instrToken, body: { startedAt: "2026-11-04" } });
      eq(res.r.status, 403, "instruktur tanpa siswa.kelola dilarang ubah tanggal");
    } finally {
      if (previous) db.prepare("UPDATE admin_role_permissions SET permissions = ? WHERE role = 'instruktur'").run(previous.permissions);
      else db.prepare("DELETE FROM admin_role_permissions WHERE role = 'instruktur'").run();
    }
  });

  await t("Email laporan: antre otomatis, pratinjau, kirim manual, dan retry", async () => {
    const deliveries = require("./report-deliveries");
    const sid = addUser("siswa-email", "siswa-email@example.com", STUDENT_PASS, "student");

    // Wali disimpan dulu saat belum berlangganan: belum ada yang diantrekan.
    let res = await api("PUT", `/api/admin/users/${sid}/guardians`, {
      token: adminToken,
      body: { guardians: [{ name: "Ibu Email", email: "ibu-email@example.com", relation: "ibu" }] }
    });
    eq(res.r.status, 200, "simpan wali");
    eq(res.d.queued.total, 0, "belum ada antrean tanpa tanggal");

    res = await api("PUT", `/api/admin/users/${sid}/subscription`, {
      token: adminToken,
      body: { startedAt: "2020-01-01" }
    });
    eq(res.r.status, 200, "simpan tanggal lampau");
    eq(res.d.queued.created, 1, "email wali masuk antrean");
    eq(res.d.queued.total, 1, "satu penerima");

    // Menyimpan ulang tidak menggandakan antrean.
    res = await api("PUT", `/api/admin/users/${sid}/subscription`, {
      token: adminToken,
      body: { startedAt: "2020-01-01" }
    });
    eq(res.d.queued.created, 0, "antrean idempoten");

    res = await api("GET", `/api/admin/users/${sid}/report-deliveries`, { token: adminToken });
    const ibuDelivery = res.d.items.find((x) => x.recipientEmail === "ibu-email@example.com");
    eq(ibuDelivery.status, "pending", "status awal pending");
    eq(ibuDelivery.dueDate, "2020-02-01", "jatuh tempo 1 bulan setelah mulai");

    // Pratinjau memakai token placeholder dan tidak membuat tautan asli.
    const linksBefore = Number(db.prepare("SELECT COUNT(*) n FROM report_links WHERE student_user_id = ?").get(sid).n);
    res = await api("POST", `/api/admin/report-deliveries/${ibuDelivery.id}/preview`, { token: adminToken });
    eq(res.r.status, 200, "pratinjau");
    eq(res.d.preview, true, "penanda pratinjau");
    ok(res.d.email.subject.includes("Laporan belajar"), "subjek pratinjau");
    ok(res.d.email.text.includes("/orangtua/laporan.html#"), "tautan halaman pada pratinjau");
    eq(Number(db.prepare("SELECT COUNT(*) n FROM report_links WHERE student_user_id = ?").get(sid).n), linksBefore, "pratinjau tidak membuat tautan");

    res = await api("GET", `/api/admin/users/${sid}/report-deliveries`, { token: adminToken });
    eq(res.d.items.find((x) => x.id === ibuDelivery.id).status, "pending", "pratinjau tidak mengubah status");

    // Kirim manual hanya untuk siswa ini (provider mock saat tes).
    res = await api("POST", "/api/admin/report-deliveries/run", { token: adminToken, body: { studentId: sid } });
    eq(res.r.status, 200, "run manual");
    eq(res.d.summary.sent, 1, "satu email terkirim");
    eq(res.d.summary.failed, 0, "tanpa gagal");
    res = await api("GET", `/api/admin/users/${sid}/report-deliveries`, { token: adminToken });
    const sentIbu = res.d.items.find((x) => x.id === ibuDelivery.id);
    eq(sentIbu.status, "sent", "status menjadi sent");
    ok(sentIbu.reportLinkId, "tautan laporan tercatat");
    const link = db.prepare("SELECT * FROM report_links WHERE id = ?").get(sentIbu.reportLinkId);
    ok(link && link.token_hash.length === 64, "tautan disimpan sebagai hash");
    ok(link.revoked_at === null, "tautan terkirim masih aktif");

    res = await api("POST", `/api/admin/report-deliveries/${ibuDelivery.id}/retry`, { token: adminToken });
    eq(res.r.status, 409, "yang sudah sent tidak bisa retry");
    eq(res.d.code, "DELIVERY_ALREADY_SENT", "code sent");

    // Tambah wali kedua -> antrean baru; simulasikan gagal lalu retry.
    res = await api("PUT", `/api/admin/users/${sid}/guardians`, {
      token: adminToken,
      body: {
        guardians: [
          { name: "Ibu Email", email: "ibu-email@example.com", relation: "ibu" },
          { name: "Ayah Email", email: "ayah-email@example.com", relation: "ayah" }
        ]
      }
    });
    eq(res.r.status, 200, "tambah wali kedua");
    eq(res.d.queued.created, 1, "wali baru masuk antrean");
    res = await api("GET", `/api/admin/users/${sid}/report-deliveries`, { token: adminToken });
    const ayahDelivery = res.d.items.find((x) => x.recipientEmail === "ayah-email@example.com");
    ok(ayahDelivery, "baris wali kedua ada");
    deliveries.markFailed(db, ayahDelivery.id, "SMTP timeout");

    res = await api("POST", `/api/admin/report-deliveries/${ayahDelivery.id}/retry`, { token: adminToken });
    eq(res.r.status, 200, "retry");
    eq(res.d.item.status, "pending", "kembali pending");
    eq(res.d.item.attempts, 0, "attempts direset");
    eq(res.d.item.lastError, null, "error dibersihkan");

    res = await api("POST", "/api/admin/report-deliveries/run", { token: adminToken, body: { studentId: sid } });
    eq(res.r.status, 200, "run setelah retry");
    eq(res.d.summary.sent, 1, "wali kedua terkirim");
    res = await api("GET", `/api/admin/users/${sid}/report-deliveries`, { token: adminToken });
    eq(res.d.items.find((x) => x.id === ayahDelivery.id).status, "sent", "status wali kedua sent");

    // Validasi & hak akses endpoint aksi.
    res = await api("POST", "/api/admin/report-deliveries/0/retry", { token: adminToken });
    eq(res.r.status, 400, "retry id salah");
    res = await api("POST", "/api/admin/report-deliveries/999999/retry", { token: adminToken });
    eq(res.r.status, 404, "retry tidak ada");
    res = await api("POST", "/api/admin/report-deliveries/999999/preview", { token: adminToken });
    eq(res.r.status, 404, "preview tidak ada");
    res = await api("POST", "/api/admin/report-deliveries/run", { token: adminToken, body: { today: "2026-02-30" } });
    eq(res.r.status, 400, "today tidak valid");
    res = await api("POST", "/api/admin/report-deliveries/run", { token: adminToken, body: { studentId: "x" } });
    eq(res.r.status, 400, "studentId tidak valid");
    res = await api("POST", "/api/admin/report-deliveries/run", { token: studentToken, body: {} });
    eq(res.r.status, 403, "siswa dilarang run");
    res = await api("POST", "/api/admin/report-deliveries/run", { body: {} });
    eq(res.r.status, 401, "tanpa token run");
    res = await api("POST", `/api/admin/report-deliveries/${ibuDelivery.id}/preview`, { token: studentToken });
    eq(res.r.status, 403, "siswa dilarang preview");
  });

  await t("Email laporan: run manual menolak today di masa depan agar jadwal tidak bisa dipercepat", async () => {
    const deliveries = require("./report-deliveries");
    const sid = addUser("siswa-percepat", "siswa-percepat@example.com", STUDENT_PASS, "student");
    const gid = Number(db.prepare(
      "INSERT INTO student_guardians (student_user_id, name, email, relation) VALUES (?, 'Ibu Percepat', 'ibu-percepat@example.com', 'ibu')"
    ).run(sid).lastInsertRowid);
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const queued = deliveries.queueDelivery(db, {
      studentId: sid, guardianId: gid, recipientEmail: "ibu-percepat@example.com", dueDate: nextMonth
    });
    const run = (today) => api("POST", "/api/admin/report-deliveries/run", { token: adminToken, body: { today, studentId: sid } });
    const status = () => db.prepare("SELECT status FROM report_deliveries WHERE id = ?").get(queued.id).status;

    let res = await run("2099-01-01");
    eq(res.r.status, 400, "today masa depan ditolak");
    eq(res.d.code, "ADMIN_DATA_INVALID", "code today masa depan");
    eq(res.d.details.field, "today", "field today");
    eq(status(), "pending", "email yang belum jatuh tempo tidak terkirim");

    res = await run(deliveries.dateOnlyToday());
    eq(res.r.status, 200, "today = hari ini sah");
    eq(res.d.summary.sent, 0, "belum jatuh tempo, tidak terkirim");
    eq(status(), "pending", "tetap pending");

    res = await run("2020-01-01");
    eq(res.r.status, 200, "simulasi mundur tetap boleh");
    eq(res.d.summary.sent, 0, "simulasi mundur tidak mengirim");
  });

  await t("Notifikasi nilai: menghormati notifGraded, atomik dengan penyimpanan nilai, dan nilai kembali ke angka lama tetap diberitahukan", async () => {
    const sid = addUser("siswa-nilai", "siswa-nilai@example.com", STUDENT_PASS, "student");
    db.prepare("UPDATE users SET must_change_password = 0 WHERE id = ?").run(sid);
    const token = auth.createSession(sid);
    let res = await api("POST", "/api/admin/tasks", {
      token: adminToken,
      body: { title: "Tugas Notifikasi", grade: "SMP", type: "kuis", points: 10, due: "2026-12-31" }
    });
    ok(res.d.item && res.d.item.id, "tugas dibuat");
    const submissionId = Number(db.prepare(
      "INSERT INTO admin_task_submissions (task_id, user_id, answer, status) VALUES (?, ?, 'jawaban', 'dikumpulkan')"
    ).run(res.d.item.id, sid).lastInsertRowid);
    const patch = (body) => api("PATCH", `/api/admin/submissions/${submissionId}`, { token: adminToken, body });
    const mine = async () => (await api("GET", "/api/notifications?limit=100", { token })).d.notifications;

    const prior = db.prepare("SELECT payload_json FROM admin_settings WHERE id = 1").get();
    let baseSettings = {};
    try { baseSettings = prior ? JSON.parse(prior.payload_json) : {}; } catch (_) { baseSettings = {}; }
    const setNotifGraded = (value) => db.prepare(`
      INSERT INTO admin_settings (id, payload_json) VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json
    `).run(JSON.stringify({ ...baseSettings, notifGraded: value }));

    try {
      // 1) Dimatikan admin: nilai dan revisi tetap tersimpan, siswa tidak diberi notifikasi.
      setNotifGraded(false);
      res = await patch({ status: "dinilai", score: 70, feedback: "oke" });
      eq(res.r.status, 200, "nilai saat notifGraded mati");
      eq((await mine()).length, 0, "tidak ada notifikasi nilai saat notifGraded dimatikan");
      res = await patch({ status: "revisi", feedback: "perbaiki" });
      eq(res.r.status, 200, "revisi saat notifGraded mati");
      eq((await mine()).length, 0, "tidak ada notifikasi revisi saat notifGraded dimatikan");

      // 2) Dinyalakan: 90 -> 80 -> 90, ketiganya harus diberitahukan.
      setNotifGraded(true);
      for (const score of [90, 80, 90]) {
        res = await patch({ status: "dinilai", score, feedback: "oke" });
        eq(res.r.status, 200, `nilai ${score}`);
      }
      const graded = (await mine()).filter((n) => n.kind === "task.graded");
      eq(graded.length, 3, "setiap perubahan nilai diberitahukan, termasuk kembali ke angka lama");

      // 3) Atomik: kalau notifikasi gagal dibuat, nilai tidak boleh tersimpan setengah jalan.
      db.exec("CREATE TRIGGER trg_test_notif_fail BEFORE INSERT ON student_notifications BEGIN SELECT RAISE(ABORT, 'boom'); END;");
      try {
        res = await patch({ status: "dinilai", score: 55, feedback: "gagal" });
        eq(res.r.status, 500, "gangguan notifikasi menggagalkan permintaan");
        eq(db.prepare("SELECT score FROM admin_task_submissions WHERE id = ?").get(submissionId).score, 90, "nilai tidak berubah ketika notifikasi gagal");
      } finally {
        db.exec("DROP TRIGGER IF EXISTS trg_test_notif_fail");
      }
      res = await patch({ status: "dinilai", score: 55, feedback: "gagal" });
      eq(res.r.status, 200, "percobaan ulang berhasil");
      eq((await mine()).filter((n) => n.kind === "task.graded").length, 4, "percobaan ulang tetap memberi notifikasi");
    } finally {
      if (prior) db.prepare("UPDATE admin_settings SET payload_json = ? WHERE id = 1").run(prior.payload_json);
      else db.prepare("DELETE FROM admin_settings WHERE id = 1").run();
    }
  });

  // Harus paling akhir: setelah ini IP tes terkunci sementara oleh rate limit laporan.
  await t("Tautan laporan: rate limit publik per IP, mengganti token tidak menghindarinya", async () => {
    const statuses = [];
    let limited = null;
    for (let i = 0; i < 80; i++) {
      const res = await api("GET", `/api/reports/${crypto.randomBytes(32).toString("base64url")}`);
      statuses.push(res.r.status);
      if (res.r.status === 429 && !limited) limited = res;
    }
    ok(statuses.includes(429), "token berbeda tetap kena rate limit");
    ok(statuses.includes(404), "sebelum limit, token salah dijawab 404");
    eq(limited.d.code, "RATE_LIMITED", "code RATE_LIMITED");
    ok(Number(limited.r.headers.get("retry-after")) >= 1, "header Retry-After");
    eq(limited.r.headers.get("cache-control"), "no-store, max-age=0", "429 tetap no-store");
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