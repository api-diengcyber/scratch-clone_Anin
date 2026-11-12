// Tes endpoint jadwal mentoring (murid + admin).
// Jalankan: node test-jadwal.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 3106;
const TMPDB = path.join(os.tmpdir(), `dcc-test-jadwal-${process.pid}.sqlite`);
const PLUGIN_DIR = path.join(os.tmpdir(), `dcc-test-jadwal-plugins-${process.pid}`);

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

function addUser(username, role, grades) {
  const info = db.prepare(`INSERT INTO users (username, email, role, allowed_grades, status, must_change_password)
    VALUES (?, ?, ?, ?, 'active', 0)`).run(
    username,
    `${username}@example.com`,
    role,
    grades === undefined ? null : JSON.stringify(grades)
  );
  return Number(info.lastInsertRowid);
}

const adminId = addUser("jadwal-admin", "admin");
const instructorId = addUser("jadwal-instruktur", "instruktur");
const sdId = addUser("jadwal-sd", "student", ["SD"]);
const smpId = addUser("jadwal-smp", "student", ["SMP"]);
const allId = addUser("jadwal-semua", "student", []);

const adminToken = auth.createSession(adminId);
const instructorToken = auth.createSession(instructorId);
const sdToken = auth.createSession(sdId);
const smpToken = auth.createSession(smpId);
const allToken = auth.createSession(allId);

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

const validBody = {
  judul: "Kelas Semua Jenjang",
  jenis: "Live Mentoring",
  level: "Scratch Level 1",
  mentor: "Kak Mentor",
  keterangan: "Siapkan Scratch sebelum mulai.",
  tanggal: "2026-11-10",
  mulai: "15:00",
  selesai: "16:30",
  zoomUrl: "https://zoom.us/j/1234567890",
  meetingId: "123 4567 8901",
  passcode: "belajar",
  grades: []
};

async function main() {
  await waitReady();
  const BULAN = "2026-11";
  let createdAll = null;
  let createdSd = null;
  let createdSmp = null;
  let createdDecember = null;

  await t("jadwal: tanpa token -> 401", async () => {
    const { r, d } = await api("GET", `/api/jadwal?bulan=${BULAN}`);
    eq(r.status, 401, "status");
    eq(d.code, "UNAUTHORIZED", "code");
  });

  await t("jadwal: murid tidak boleh membuat jadwal", async () => {
    const { r, d } = await api("POST", "/api/admin/jadwal", { token: sdToken, body: validBody });
    eq(r.status, 403, "status");
    eq(d.code, "ADMIN_REQUIRED", "code");
  });

  await t("jadwal: murid tidak boleh membaca daftar admin", async () => {
    const { r } = await api("GET", "/api/admin/jadwal", { token: sdToken });
    eq(r.status, 403, "status");
  });

  await t("jadwal: instruktur dengan kurikulum.kelola boleh membuat", async () => {
    const body = { ...validBody, judul: "Kelas Semua Jenjang", grades: [] };
    const { r, d } = await api("POST", "/api/admin/jadwal", { token: instructorToken, body });
    eq(r.status, 201, "status");
    eq(d.item.judul, body.judul, "judul");
    eq(d.item.grades, [], "grades kosong = semua");
    eq(d.item.zoomUrl, "https://zoom.us/j/1234567890", "zoomUrl");
    eq(d.item.tanggal, "2026-11-10", "tanggal");
    createdAll = d.item;
  });

  await t("jadwal: admin membuat jadwal khusus SD", async () => {
    const body = { ...validBody, judul: "Kelas SD", tanggal: "2026-11-11", mulai: "09:00", selesai: "10:00", grades: ["SD"] };
    const { r, d } = await api("POST", "/api/admin/jadwal", { token: adminToken, body });
    eq(r.status, 201, "status");
    eq(d.item.grades, ["SD"], "grades");
    createdSd = d.item;
  });

  await t("jadwal: admin membuat jadwal SMP/SMK", async () => {
    const body = { ...validBody, judul: "Kelas SMP", tanggal: "2026-11-12", mulai: "13:00", selesai: "14:00", grades: ["SMP", "SMK"], zoomUrl: "" };
    const { r, d } = await api("POST", "/api/admin/jadwal", { token: adminToken, body });
    eq(r.status, 201, "status");
    eq(d.item.grades, ["SMP", "SMK"], "grades");
    eq(d.item.zoomUrl, "", "zoomUrl kosong");
    createdSmp = d.item;
  });

  await t("jadwal: jadwal bulan lain tetap bisa dibuat", async () => {
    const body = { ...validBody, judul: "Kelas Desember", tanggal: "2026-12-01", mulai: "10:00", selesai: "11:00", grades: ["SD"] };
    const { r, d } = await api("POST", "/api/admin/jadwal", { token: adminToken, body });
    eq(r.status, 201, "status");
    createdDecember = d.item;
  });

  await t("jadwal: tanggal tidak sah ditolak", async () => {
    const { r, d } = await api("POST", "/api/admin/jadwal", {
      token: adminToken, body: { ...validBody, tanggal: "2026-02-30" }
    });
    eq(r.status, 400, "status");
    eq(d.details && d.details.field, "tanggal", "field");
  });

  await t("jadwal: jam tidak sah ditolak", async () => {
    let res = await api("POST", "/api/admin/jadwal", { token: adminToken, body: { ...validBody, mulai: "25:00" } });
    eq(res.r.status, 400, "mulai");
    res = await api("POST", "/api/admin/jadwal", { token: adminToken, body: { ...validBody, selesai: "16:60" } });
    eq(res.r.status, 400, "selesai");
  });

  await t("jadwal: selesai harus setelah mulai", async () => {
    const { r, d } = await api("POST", "/api/admin/jadwal", {
      token: adminToken, body: { ...validBody, mulai: "15:00", selesai: "15:00" }
    });
    eq(r.status, 400, "status");
    eq(d.details && d.details.field, "selesai", "field");
  });

  await t("jadwal: zoomUrl wajib https", async () => {
    const { r } = await api("POST", "/api/admin/jadwal", {
      token: adminToken, body: { ...validBody, zoomUrl: "http://zoom.us/j/1" }
    });
    eq(r.status, 400, "status");
  });

  await t("jadwal: jenjang asing ditolak", async () => {
    const { r } = await api("POST", "/api/admin/jadwal", {
      token: adminToken, body: { ...validBody, grades: ["SMA"] }
    });
    eq(r.status, 400, "status");
  });

  await t("jadwal: judul wajib dan dibatasi", async () => {
    let res = await api("POST", "/api/admin/jadwal", { token: adminToken, body: { ...validBody, judul: "   " } });
    eq(res.r.status, 400, "kosong");
    res = await api("POST", "/api/admin/jadwal", { token: adminToken, body: { ...validBody, judul: "x".repeat(121) } });
    eq(res.r.status, 400, "terlalu panjang");
  });

  await t("jadwal: murid SD hanya melihat jadwal semua + SD", async () => {
    const { r, d } = await api("GET", `/api/jadwal?bulan=${BULAN}`, { token: sdToken });
    eq(r.status, 200, "status");
    eq(d.bulan, BULAN, "bulan");
    eq(d.jadwal.map((x) => x.judul), ["Kelas Semua Jenjang", "Kelas SD"], "isi");
  });

  await t("jadwal: murid SMP hanya melihat jadwal semua + SMP/SMK", async () => {
    const { r, d } = await api("GET", `/api/jadwal?bulan=${BULAN}`, { token: smpToken });
    eq(r.status, 200, "status");
    eq(d.jadwal.map((x) => x.judul), ["Kelas Semua Jenjang", "Kelas SMP"], "isi");
  });

  await t("jadwal: murid tanpa jenjang melihat semua jadwal", async () => {
    const { d } = await api("GET", `/api/jadwal?bulan=${BULAN}`, { token: allToken });
    eq(d.jadwal.map((x) => x.judul), ["Kelas Semua Jenjang", "Kelas SD", "Kelas SMP"], "isi");
  });

  await t("jadwal: jadwal bulan lain tidak ikut", async () => {
    const { d } = await api("GET", `/api/jadwal?bulan=${BULAN}`, { token: allToken });
    ok(d.jadwal.every((x) => x.tanggal.startsWith(BULAN)), "semua tanggal di bulan yang diminta");
    ok(d.jadwal.every((x) => x.judul !== "Kelas Desember"), "desember tidak bocor");
  });

  await t("jadwal: instruktur melihat semua jenjang", async () => {
    const { d } = await api("GET", `/api/jadwal?bulan=${BULAN}`, { token: instructorToken });
    eq(d.jadwal.length, 3, "jumlah");
  });

  await t("jadwal: bulan tidak valid ditolak", async () => {
    const { r, d } = await api("GET", "/api/jadwal?bulan=2026-13", { token: allToken });
    eq(r.status, 400, "status");
    eq(d.details && d.details.field, "bulan", "field");
  });

  await t("jadwal: daftar admin bisa difilter bulan", async () => {
    const { r, d } = await api("GET", `/api/admin/jadwal?bulan=${BULAN}`, { token: instructorToken });
    eq(r.status, 200, "status");
    eq(d.items.length, 3, "jumlah bulan");
    eq(d.total, 3, "total");
  });

  await t("jadwal: daftar admin tanpa bulan memuat semua", async () => {
    const { d } = await api("GET", "/api/admin/jadwal", { token: adminToken });
    ok(d.items.length >= 4, "semua jadwal");
    ok(d.items.some((x) => x.judul === "Kelas Desember"), "termasuk desember");
  });

  await t("jadwal: respons tidak membocorkan kolom internal", async () => {
    const { d } = await api("GET", `/api/admin/jadwal?bulan=${BULAN}`, { token: adminToken });
    const item = d.items[0];
    eq(item.created_by, undefined, "created_by");
    eq(item.createdBy, undefined, "createdBy");
    eq(item.zoom_url, undefined, "zoom_url");
    ok(Object.prototype.hasOwnProperty.call(item, "createdAt"), "createdAt ada");
  });

  await t("jadwal: admin bisa mengubah judul dan jam", async () => {
    const { r, d } = await api("PATCH", `/api/admin/jadwal/${createdSmp.id}`, {
      token: adminToken,
      body: { judul: "Kelas SMP Revisi", mulai: "13:30", selesai: "15:00" }
    });
    eq(r.status, 200, "status");
    eq(d.item.judul, "Kelas SMP Revisi", "judul");
    eq([d.item.mulai, d.item.selesai], ["13:30", "15:00"], "jam");
    eq(d.item.grades, ["SMP", "SMK"], "grades tidak berubah");
  });

  await t("jadwal: ubah jam menjadi tidak valid ditolak", async () => {
    const { r, d } = await api("PATCH", `/api/admin/jadwal/${createdSmp.id}`, {
      token: adminToken,
      body: { selesai: "13:00" }
    });
    eq(r.status, 400, "status");
    eq(d.details && d.details.field, "selesai", "field");
  });

  await t("jadwal: ubah data yang tidak ada -> 404", async () => {
    const { r } = await api("PATCH", "/api/admin/jadwal/999999", { token: adminToken, body: { judul: "X" } });
    eq(r.status, 404, "status");
  });

  await t("jadwal: admin bisa menghapus jadwal", async () => {
    const { r, d } = await api("DELETE", `/api/admin/jadwal/${createdSd.id}`, { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.id, createdSd.id, "id");

    const after = await api("GET", `/api/jadwal?bulan=${BULAN}`, { token: sdToken });
    eq(after.d.jadwal.map((x) => x.judul), ["Kelas Semua Jenjang"], "jadwal SD hilang");

    const again = await api("DELETE", `/api/admin/jadwal/${createdSd.id}`, { token: adminToken });
    eq(again.r.status, 404, "hapus dua kali");
  });

  await t("jadwal: audit mencatat create/update/delete", async () => {
    const rows = db.prepare(`SELECT action FROM admin_audit
      WHERE target_type = 'mentoring_schedule' ORDER BY id ASC`).all();
    const counts = rows.reduce((acc, row) => {
      acc[row.action] = (acc[row.action] || 0) + 1;
      return acc;
    }, {});
    ok(counts["jadwal.create"] >= 4, "create tercatat");
    eq(counts["jadwal.update"], 1, "update tercatat");
    eq(counts["jadwal.delete"], 1, "delete tercatat");
  });

  await t("jadwal: instruktur tanpa kurikulum.kelola ditolak", async () => {
    db.prepare(`INSERT INTO admin_role_permissions (role, permissions, updated_at)
      VALUES ('instruktur', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(role) DO UPDATE SET permissions = excluded.permissions, updated_at = CURRENT_TIMESTAMP`)
      .run(JSON.stringify(["tugas.kelola"]));
    const blocked = await api("POST", "/api/admin/jadwal", {
      token: instructorToken, body: { ...validBody, judul: "Tidak Boleh" }
    });
    eq(blocked.r.status, 403, "status");
    eq(blocked.d.code, "PERMISSION_DENIED", "code");

    db.prepare(`INSERT INTO admin_role_permissions (role, permissions, updated_at)
      VALUES ('instruktur', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(role) DO UPDATE SET permissions = excluded.permissions, updated_at = CURRENT_TIMESTAMP`)
      .run(JSON.stringify(["siswa.kelola", "kurikulum.kelola", "tugas.kelola", "tugas.nilai", "badge.kelola"]));
    const allowed = await api("GET", `/api/admin/jadwal?bulan=${BULAN}`, { token: instructorToken });
    eq(allowed.r.status, 200, "pulih");
  });

  await t("jadwal: hasil tetap urut tanggal lalu jam", async () => {
    const { d } = await api("GET", `/api/jadwal?bulan=${BULAN}`, { token: allToken });
    const keys = d.jadwal.map((x) => `${x.tanggal} ${x.mulai}`);
    const sorted = [...keys].sort();
    eq(keys, sorted, "urutan");
  });

  await t("jadwal: URL admin /admin/jadwal membuka halaman admin", async () => {
    const r = await fetch(B + "/admin/jadwal");
    eq(r.status, 200, "status");
    const html = await r.text();
    // Sejak menu jadwal dirender oleh static/jadwal.js, cek kerangka SPA Admin.
    ok(html.includes("Ruang KKA"), "halaman admin dimuat");
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
