// Tes endpoint materi per task (publik + admin).
// Jalankan: node test-materials.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 3107;
const TMPDB = path.join(os.tmpdir(), `dcc-test-materials-${process.pid}.sqlite`);
const PLUGIN_DIR = path.join(os.tmpdir(), `dcc-test-materials-plugins-${process.pid}`);

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
const auth = require("./auth");

function addUser(username, role) {
  const info = db.prepare(`INSERT INTO users (username, email, role, allowed_grades, status, must_change_password)
    VALUES (?, ?, ?, NULL, 'active', 0)`).run(username, `${username}@example.com`, role);
  return Number(info.lastInsertRowid);
}

const adminId = addUser("materi-admin", "admin");
const instructorId = addUser("materi-instruktur", "instruktur");
const studentId = addUser("materi-siswa", "student");

const adminToken = auth.createSession(adminId);
const instructorToken = auth.createSession(instructorId);
const studentToken = auth.createSession(studentId);

// Modul + materi awal
for (const grade of ["SD", "SMP", "SMK"]) {
  db.prepare("INSERT INTO modules (grade, module_id) VALUES (?, ?)").run(grade, grade.toLowerCase() + "mod");
}
db.prepare("INSERT INTO materials (grade, module_id, lesson_index, path, judul, status) VALUES (?, ?, ?, ?, ?, ?)")
  .run("SMP", "smpmod", 0, "/SMP/materi/a.html", "Materi A", "terbit");
db.prepare("INSERT INTO materials (grade, module_id, lesson_index, path, judul, status) VALUES (?, ?, ?, ?, ?, ?)")
  .run("SMP", "smpmod", 1, "/SMP/materi/draft.html", "Materi Draft", "draft");
db.prepare("INSERT INTO materials (grade, module_id, lesson_index, path, judul, status) VALUES (?, ?, ?, ?, ?, ?)")
  .run("SD", "sdmod", 0, "/SD/materi/sd.html?task=sdmod-t1", "Materi SD", "terbit");

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

async function j(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    throw new Error(`bukan JSON (HTTP ${res.status}): ${text.slice(0, 160)}`);
  }
}
async function api(method, url, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(B + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { r, d: await j(r) };
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

async function main() {
  await waitReady();
  let created = null;

  await t("materi publik: hanya status terbit", async () => {
    const { r, d } = await api("GET", "/api/materials/SMP/smpmod");
    eq(r.status, 200, "status");
    eq(d.materials.map((m) => m.judul), ["Materi A"], "isi");
    eq(d.materials[0].status, "terbit", "status terbit");
  });

  await t("materi publik: draft tidak bocor", async () => {
    const { d } = await api("GET", "/api/materials/SMP/smpmod");
    ok(!d.materials.some((m) => m.path.includes("draft")), "draft tidak boleh muncul");
  });

  await t("materi publik: filter grade", async () => {
    const { r, d } = await api("GET", "/api/materials?grade=SD");
    eq(r.status, 200, "status");
    eq(d.materials.map((m) => m.grade), ["SD"], "hanya SD");
    eq(d.materials[0].judul, "Materi SD", "judul");
  });

  await t("materi publik: grade tidak sah ditolak", async () => {
    const { r, d } = await api("GET", "/api/materials?grade=SMA");
    eq(r.status, 400, "status");
    eq(d.code, "VALIDATION_ERROR", "code");
  });

  await t("materi admin: tanpa token 401", async () => {
    const { r } = await api("GET", "/api/admin/materials");
    eq(r.status, 401, "status");
  });

  await t("materi admin: murid ditolak", async () => {
    const { r, d } = await api("GET", "/api/admin/materials", { token: studentToken });
    eq(r.status, 403, "status");
    eq(d.code, "ADMIN_REQUIRED", "code");
  });

  await t("materi admin: melihat draft dan terbit", async () => {
    const { r, d } = await api("GET", "/api/admin/materials?grade=SMP", { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.total, 2, "total");
    eq(d.items.map((m) => m.status).sort(), ["draft", "terbit"], "status");
    eq(d.items[0].moduleId, "smpmod", "moduleId");
  });

  await t("materi admin: buat materi draft", async () => {
    const body = { grade: "SMP", moduleId: "smpmod", lessonIndex: 2, path: "/SMP/materi/baru.html", judul: "Materi Baru", status: "draft" };
    const { r, d } = await api("POST", "/api/admin/materials", { token: adminToken, body });
    eq(r.status, 201, "status");
    eq(d.item.status, "draft", "status draft");
    eq(d.item.lessonIndex, 2, "lessonIndex");
    created = d.item;

    const pub = await api("GET", "/api/materials/SMP/smpmod");
    ok(!pub.d.materials.some((m) => m.id === created.id), "draft belum tampil di publik");
  });

  await t("materi admin: terbitkan materi", async () => {
    const { r, d } = await api("PATCH", `/api/admin/materials/${created.id}`, {
      token: adminToken, body: { status: "terbit", judul: "Materi Baru Terbit" }
    });
    eq(r.status, 200, "status");
    eq(d.item.status, "terbit", "status");
    eq(d.item.judul, "Materi Baru Terbit", "judul");

    const pub = await api("GET", "/api/materials/SMP/smpmod");
    ok(pub.d.materials.some((m) => m.id === created.id), "materi terbit tampil di publik");
  });

  await t("materi admin: path eksternal ditolak", async () => {
    const { r, d } = await api("PATCH", `/api/admin/materials/${created.id}`, {
      token: adminToken, body: { path: "https://contoh.test/materi" }
    });
    eq(r.status, 400, "status");
    eq(d.details && d.details.field, "path", "field");
  });

  await t("materi admin: grade asing ditolak", async () => {
    const { r } = await api("POST", "/api/admin/materials", {
      token: adminToken,
      body: { grade: "SMA", moduleId: "smpmod", lessonIndex: 9, path: "/x.html" }
    });
    eq(r.status, 400, "status");
  });

  await t("materi admin: modul tidak ada ditolak", async () => {
    const { r, d } = await api("POST", "/api/admin/materials", {
      token: adminToken,
      body: { grade: "SMK", moduleId: "tidakada", lessonIndex: 0, path: "/SMK/materi/x.html" }
    });
    eq(r.status, 404, "status");
    eq(d.code, "MODULE_NOT_FOUND", "code");
  });

  await t("materi admin: duplikat ditolak", async () => {
    const { r, d } = await api("POST", "/api/admin/materials", {
      token: adminToken,
      body: { grade: "SMP", moduleId: "smpmod", lessonIndex: 0, path: "/SMP/materi/lain.html" }
    });
    eq(r.status, 409, "status");
    eq(d.code, "MATERIAL_EXISTS", "code");
  });

  await t("materi admin: hapus materi", async () => {
    const { r, d } = await api("DELETE", `/api/admin/materials/${created.id}`, { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.id, created.id, "id");
    const pub = await api("GET", "/api/materials/SMP/smpmod");
    ok(!pub.d.materials.some((m) => m.id === created.id), "materi hilang dari publik");
    const again = await api("DELETE", `/api/admin/materials/${created.id}`, { token: adminToken });
    eq(again.r.status, 404, "hapus dua kali");
  });

  await t("materi admin: audit create/update/delete", async () => {
    const rows = db.prepare(`SELECT action FROM admin_audit WHERE target_type = 'material' ORDER BY id ASC`).all();
    const counts = rows.reduce((acc, row) => {
      acc[row.action] = (acc[row.action] || 0) + 1;
      return acc;
    }, {});
    eq(counts["materi.create"], 1, "create");
    eq(counts["materi.update"], 1, "update");
    eq(counts["materi.delete"], 1, "delete");
  });

  await t("materi admin: instruktur tanpa kurikulum.kelola ditolak", async () => {
    db.prepare(`INSERT INTO admin_role_permissions (role, permissions, updated_at)
      VALUES ('instruktur', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(role) DO UPDATE SET permissions = excluded.permissions, updated_at = CURRENT_TIMESTAMP`)
      .run(JSON.stringify(["tugas.kelola"]));
    const blocked = await api("GET", "/api/admin/materials", { token: instructorToken });
    eq(blocked.r.status, 403, "status");
    eq(blocked.d.code, "PERMISSION_DENIED", "code");

    db.prepare(`INSERT INTO admin_role_permissions (role, permissions, updated_at)
      VALUES ('instruktur', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(role) DO UPDATE SET permissions = excluded.permissions, updated_at = CURRENT_TIMESTAMP`)
      .run(JSON.stringify(["kurikulum.kelola"]));
    const allowed = await api("GET", "/api/admin/materials", { token: instructorToken });
    eq(allowed.r.status, 200, "pulih");
  });

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
