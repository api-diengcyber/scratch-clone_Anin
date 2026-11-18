// Tes endpoint publik halaman orang tua/wali (token laporan, jadwal, absen).
// Jalankan: node test-parent.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 3116;
const TMPDB = path.join(os.tmpdir(), `dcc-test-parent-${process.pid}.sqlite`);
const PLUGIN_DIR = path.join(os.tmpdir(), `dcc-test-parent-plugins-${process.pid}`);

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
const attendance = require("./attendance-service");
const reports = require("./reports");
db.pragma("busy_timeout = 5000");

function addUser(username, role, { grades = null, fullName = "" } = {}) {
  const info = db.prepare(`INSERT INTO users (username, email, full_name, role, allowed_grades, status, must_change_password)
    VALUES (?, ?, ?, ?, ?, 'active', 0)`).run(
    username,
    `${username}@example.com`,
    fullName || null,
    role,
    grades === null ? null : JSON.stringify(grades)
  );
  return Number(info.lastInsertRowid);
}

function insertSchedule({ judul, tanggal, mulai, selesai, grades = [], createdBy = null }) {
  const info = db.prepare(`INSERT INTO mentoring_schedules
    (judul, jenis, tanggal, mulai, selesai, grades, created_by)
    VALUES (?, 'Live Mentoring', ?, ?, ?, ?, ?)`).run(
    judul, tanggal, mulai, selesai, JSON.stringify(grades), createdBy
  );
  return Number(info.lastInsertRowid);
}

const adminId = addUser("wali-admin", "admin");
const smpId = addUser("wali-smp", "student", { grades: ["SMP"], fullName: "Anak Wali" });

// Bulan laporan dipilih dua bulan ke belakang supaya semua sesi pasti sudah
// selesai (completedSchedules menyaring sesi yang belum berakhir).
const REPORT_MONTH = attendance.addMonth(attendance.currentMonth(), -2);
const day = (n) => `${REPORT_MONTH}-${n}`;

const sSD = insertSchedule({ judul: "Kelas SD", tanggal: day("05"), mulai: "09:00", selesai: "10:00", grades: ["SD"], createdBy: adminId });
const sSMP = insertSchedule({ judul: "Kelas SMP", tanggal: day("06"), mulai: "10:00", selesai: "11:00", grades: ["SMP"], createdBy: adminId });
const sAll = insertSchedule({ judul: "Kelas Semua", tanggal: day("07"), mulai: "11:00", selesai: "12:00", grades: [], createdBy: adminId });

db.prepare("INSERT INTO mentoring_attendance (student_user_id, jadwal_id, checked_in_at) VALUES (?, ?, ?)")
  .run(smpId, sSMP, `${REPORT_MONTH}-06T03:00:00.000Z`);

const activeLink = reports.createReportLink(db, smpId, { expiresInDays: 7, createdBy: adminId });
const revokedLink = reports.createReportLink(db, smpId, { expiresInDays: 7, createdBy: adminId });
db.prepare("UPDATE report_links SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?").run(revokedLink.id);
const expiredLink = reports.createReportLink(db, smpId, { expiresInDays: 7, createdBy: adminId });
db.prepare("UPDATE report_links SET expires_at = datetime('now', '-1 day') WHERE id = ?").run(expiredLink.id);

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
async function api(url) {
  const r = await fetch(B + url);
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
function accessCount(linkId) {
  return Number(db.prepare("SELECT access_count FROM report_links WHERE id = ?").get(linkId).access_count);
}

async function main() {
  await waitReady();

  const token = activeLink.token;

  await t("wali: token tidak sah -> 404 tanpa membocorkan detail", async () => {
    const { r, d } = await api(`/api/reports/${"a".repeat(43)}`);
    eq(r.status, 404, "status");
    eq(d.code, "REPORT_NOT_FOUND", "code");
  });

  await t("wali: token cacat format ditolak", async () => {
    const { r, d } = await api("/api/reports/pendek");
    eq(r.status, 404, "status");
    eq(d.code, "REPORT_NOT_FOUND", "code");
  });

  await t("wali: laporan utama mengembalikan data anak dan menambah access_count", async () => {
    eq(accessCount(activeLink.id), 0, "awal");
    const { r, d } = await api(`/api/reports/${token}`);
    eq(r.status, 200, "status");
    ok(d.ok === true, "ok");
    eq(d.report.student, { name: "Anak Wali", grades: ["SMP"] }, "identitas anak tanpa username/ID");
    ok(d.report.generatedAt, "generatedAt");
    ok(d.report.summary && typeof d.report.summary.totalTasks === "number", "ringkasan");
    ok(Array.isArray(d.report.grades), "per jenjang");
    ok(Array.isArray(d.report.completedTasks), "tugas selesai");
    ok(Array.isArray(d.report.submissions), "pengumpulan");
    ok(Array.isArray(d.progress), "progress");
    ok(Array.isArray(d.attempts), "attempts");
    ok(d.link && d.link.expiresAt, "link.expiresAt");
    eq(accessCount(activeLink.id), 1, "access_count naik sekali");
  });

  await t("wali: header respons tidak di-cache dan tidak diindeks", async () => {
    const { r } = await api(`/api/reports/${token}`);
    ok(/no-store/.test(r.headers.get("cache-control") || ""), "cache-control");
    ok(/noindex/.test(r.headers.get("x-robots-tag") || ""), "x-robots-tag");
    eq(r.headers.get("referrer-policy"), "no-referrer", "referrer-policy");
  });

  await t("wali: jadwal disaring menurut jenjang anak", async () => {
    const { r, d } = await api(`/api/reports/${token}/jadwal?bulan=${REPORT_MONTH}`);
    eq(r.status, 200, "status");
    eq(d.bulan, REPORT_MONTH, "bulan");
    ok(Array.isArray(d.jadwal), "jadwal array");
    const judul = d.jadwal.map((x) => x.judul);
    eq(judul, ["Kelas SMP", "Kelas Semua"], "hanya jadwal SMP dan umum");
    const smp = d.jadwal.find((x) => x.judul === "Kelas SMP");
    ok(smp.id === sSMP && smp.mulai === "10:00" && smp.selesai === "11:00", "bentuk jadwal");
    ok(!d.jadwal.some((x) => x.id === sSD), "jadwal SD tersaring");
    ok(!d.jadwal.some((x) => x.id === sAll && x.judul !== "Kelas Semua"), "jadwal umum tetap tampil");
  });

  await t("wali: jadwal tanpa bulan memakai bulan berjalan", async () => {
    const { r, d } = await api(`/api/reports/${token}/jadwal`);
    eq(r.status, 200, "status");
    eq(d.bulan, attendance.currentMonth(), "bulan default");
    ok(Array.isArray(d.jadwal), "jadwal array");
  });

  await t("wali: bulan jadwal tidak sah ditolak", async () => {
    for (const bulan of ["2026-13", "2026-1", "besok"]) {
      const { r, d } = await api(`/api/reports/${token}/jadwal?bulan=${encodeURIComponent(bulan)}`);
      eq(r.status, 400, `status ${bulan}`);
      eq(d.code, "VALIDATION_ERROR", "code");
      eq(d.details && d.details.field, "bulan", "field");
    }
  });

  await t("wali: absen hanya memuat nama anak, tanpa username/ID", async () => {
    const { r, d } = await api(`/api/reports/${token}/attendance?bulan=${REPORT_MONTH}`);
    eq(r.status, 200, "status");
    eq(d.bulan, REPORT_MONTH, "bulan");
    eq(d.siswa, { nama: "Anak Wali" }, "siswa tanpa data internal");
    ok(!("username" in d.siswa) && !("id" in d.siswa), "tanpa username/id");
    eq(d.ringkasan.hadir, 1, "hadir bulan ini");
    eq(d.ringkasan.total, 2, "total sesi bulan ini");
    eq(d.keseluruhan.total, 2, "total keseluruhan");
    ok(Array.isArray(d.perBulan), "perBulan");
    const sesi = d.sesi.find((x) => x.jadwalId === sSMP);
    ok(sesi && sesi.hadir === true && sesi.checkedInAt, "sesi SMP hadir");
    const umum = d.sesi.find((x) => x.jadwalId === sAll);
    ok(umum && umum.hadir === false, "sesi umum belum absen");
    ok(!d.sesi.some((x) => x.jadwalId === sSD), "sesi SD tidak masuk");
  });

  await t("wali: bulan absen tidak sah ditolak", async () => {
    const { r, d } = await api(`/api/reports/${token}/attendance?bulan=2026-00`);
    eq(r.status, 400, "status");
    eq(d.details && d.details.field, "bulan", "field");
  });

  await t("wali: jadwal dan absen tidak menambah access_count", async () => {
    const before = accessCount(activeLink.id);
    await api(`/api/reports/${token}/jadwal?bulan=${REPORT_MONTH}`);
    await api(`/api/reports/${token}/attendance?bulan=${REPORT_MONTH}`);
    eq(accessCount(activeLink.id), before, "setelah");
  });

  await t("wali: token dicabut ditolak di semua endpoint", async () => {
    const t2 = revokedLink.token;
    for (const suffix of ["", "/jadwal", `/jadwal?bulan=${REPORT_MONTH}`, `/attendance?bulan=${REPORT_MONTH}`]) {
      const { r, d } = await api(`/api/reports/${t2}${suffix}`);
      eq(r.status, 404, `status ${suffix}`);
      eq(d.code, "REPORT_NOT_FOUND", `code ${suffix}`);
    }
    eq(accessCount(revokedLink.id), 0, "access_count tidak naik");
  });

  await t("wali: token kedaluwarsa ditolak di semua endpoint", async () => {
    const t3 = expiredLink.token;
    for (const suffix of ["", `/jadwal?bulan=${REPORT_MONTH}`, `/attendance?bulan=${REPORT_MONTH}`]) {
      const { r, d } = await api(`/api/reports/${t3}${suffix}`);
      eq(r.status, 404, `status ${suffix}`);
      eq(d.code, "REPORT_NOT_FOUND", `code ${suffix}`);
    }
    eq(accessCount(expiredLink.id), 0, "access_count tidak naik");
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
