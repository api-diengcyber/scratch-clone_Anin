// Tes endpoint streak & kehadiran mentoring.
// Jalankan: node test-attendance.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 3114;
const TMPDB = path.join(os.tmpdir(), `dcc-test-attendance-${process.pid}.sqlite`);
const PLUGIN_DIR = path.join(os.tmpdir(), `dcc-test-attendance-plugins-${process.pid}`);

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
db.pragma("busy_timeout = 5000");

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
function wibDay(ms) {
  return new Date(ms + WIB_OFFSET_MS).toISOString().slice(0, 10);
}
function wibHm(ms) {
  return new Date(ms + WIB_OFFSET_MS).toISOString().slice(11, 16);
}

function addUser(username, role, grades, fullName) {
  const info = db.prepare(`INSERT INTO users (username, email, full_name, role, allowed_grades, status, must_change_password)
    VALUES (?, ?, ?, ?, ?, 'active', 0)`).run(
    username,
    `${username}@example.com`,
    fullName || null,
    role,
    grades === undefined || grades === null ? null : JSON.stringify(grades)
  );
  return Number(info.lastInsertRowid);
}

function insertSchedule({ judul, tanggal, mulai, selesai, grades, createdBy }) {
  const info = db.prepare(`INSERT INTO mentoring_schedules
    (judul, jenis, tanggal, mulai, selesai, grades, created_by)
    VALUES (?, 'Live Mentoring', ?, ?, ?, ?, ?)`).run(
    judul, tanggal, mulai, selesai, JSON.stringify(grades || []), createdBy
  );
  return Number(info.lastInsertRowid);
}

const adminId = addUser("att-admin", "admin");
const instructorId = addUser("att-instruktur", "instruktur", ["SD", "SMP", "SMK"], "Instruktur Absen");
const sdId = addUser("att-sd", "student", ["SD"], "Anak SD");
const smpId = addUser("att-smp", "student", ["SMP"], "Anak SMP");
const allId = addUser("att-semua", "student", [], "Anak Semua");

const adminToken = auth.createSession(adminId);
const instructorToken = auth.createSession(instructorId);
const sdToken = auth.createSession(sdId);
const smpToken = auth.createSession(smpId);
const allToken = auth.createSession(allId);

const TODAY = attendance.jakartaToday();
const YESTERDAY = attendance.dayShift(TODAY, -1);
const TOMORROW = attendance.dayShift(TODAY, 1);
const REPORT_MONTH = attendance.addMonth(attendance.currentMonth(), -2);
const REPORT_DAY = (day) => `${REPORT_MONTH}-${day}`;

const s10 = insertSchedule({ judul: "Kelas SD", tanggal: REPORT_DAY("10"), mulai: "09:00", selesai: "10:00", grades: ["SD"], createdBy: adminId });
const s11 = insertSchedule({ judul: "Kelas Semua", tanggal: REPORT_DAY("11"), mulai: "11:00", selesai: "12:00", grades: [], createdBy: instructorId });
const s12 = insertSchedule({ judul: "Kelas SMP", tanggal: REPORT_DAY("12"), mulai: "13:00", selesai: "14:00", grades: ["SMP"], createdBy: adminId });

const closedId = insertSchedule({ judul: "Kelas SMK Kemarin", tanggal: YESTERDAY, mulai: "10:00", selesai: "11:00", grades: ["SMK"], createdBy: adminId });
const openId = insertSchedule({ judul: "Kelas Hari Ini", tanggal: TODAY, mulai: "00:00", selesai: "23:59", grades: [], createdBy: adminId });
const beforeId = insertSchedule({ judul: "Kelas Besok", tanggal: TOMORROW, mulai: "10:00", selesai: "11:00", grades: [], createdBy: adminId });

function insertAttendance(studentId, jadwalId, checkedInAt) {
  db.prepare("INSERT INTO mentoring_attendance (student_user_id, jadwal_id, checked_in_at) VALUES (?, ?, ?)")
    .run(studentId, jadwalId, checkedInAt);
}
insertAttendance(sdId, s10, "2026-01-10T01:00:00.000Z");
insertAttendance(sdId, s11, "2026-01-11T03:00:00.000Z");
insertAttendance(smpId, s11, "2026-01-11T03:05:00.000Z");

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

  // Server non-produksi membuat akun "dev" untuk endpoint /api/dev/*.
  // Tes ini tidak memakainya, dan roster rekap harus hanya berisi murid
  // yang dibuat di sini.
  db.prepare("DELETE FROM users WHERE username = 'dev'").run();

  // ----------------------------------------------------------
  // Streak
  // ----------------------------------------------------------
  await t("streak: tanpa token -> 401", async () => {
    const { r, d } = await api("GET", "/api/streak");
    eq(r.status, 401, "status");
    eq(d.code, "UNAUTHORIZED", "code");
  });

  await t("streak: awal kosong", async () => {
    const { r, d } = await api("GET", "/api/streak", { token: sdToken });
    eq(r.status, 200, "status");
    eq(d.current, 0, "current");
    eq(d.longest, 0, "longest");
    eq(d.today, false, "today");
    eq(d.days, [], "days");
  });

  await t("streak: klaim hari ini idempoten", async () => {
    let res = await api("POST", "/api/streak/checkin", { token: sdToken });
    eq(res.r.status, 200, "status klaim");
    eq(res.d.today, true, "today");
    eq(res.d.current, 1, "current");
    eq(res.d.longest, 1, "longest");
    ok(res.d.days.includes(TODAY), "hari ini ada di days");

    res = await api("POST", "/api/streak/checkin", { token: sdToken });
    eq(res.r.status, 200, "status klaim ulang");
    eq(res.d.current, 1, "current tidak bertambah");
    eq(res.d.days.length, 1, "hanya satu baris hari ini");
  });

  await t("streak: hari beruntun dan rekor dihitung dari riwayat", async () => {
    const insert = db.prepare("INSERT OR IGNORE INTO study_streak_days (user_id, day) VALUES (?, ?)");
    insert.run(sdId, attendance.dayShift(TODAY, -1));
    insert.run(sdId, attendance.dayShift(TODAY, -2));
    // Rangkaian lama lima hari, terpisah dari rangkaian sekarang.
    for (let i = 6; i <= 10; i += 1) insert.run(sdId, attendance.dayShift(TODAY, -i));

    const { r, d } = await api("GET", "/api/streak", { token: sdToken });
    eq(r.status, 200, "status");
    eq(d.current, 3, "current 3 hari");
    eq(d.longest, 5, "longest 5 hari");
    eq(d.today, true, "today");
    const days = d.days.slice();
    eq(days, days.slice().sort(), "days urut naik");
    ok(days.includes(TODAY), "hari ini ada");
  });

  // ----------------------------------------------------------
  // Absen sesi
  // ----------------------------------------------------------
  await t("absen: tanpa token -> 401", async () => {
    const { r, d } = await api("GET", `/api/attendance?bulan=${REPORT_MONTH}`);
    eq(r.status, 401, "status");
    eq(d.code, "UNAUTHORIZED", "code");
  });

  await t("absen: bulan tidak sah -> 400", async () => {
    const { r, d } = await api("GET", "/api/attendance?bulan=2026-13", { token: sdToken });
    eq(r.status, 400, "status");
    eq(d.code, "VALIDATION_ERROR", "code");
  });

  await t("absen: catatan kehadiran murid per bulan", async () => {
    const { r, d } = await api("GET", `/api/attendance?bulan=${REPORT_MONTH}`, { token: sdToken });
    eq(r.status, 200, "status");
    eq(d.bulan, REPORT_MONTH, "bulan");
    eq(d.items.length, 2, "dua kehadiran");
    eq(d.items.map((item) => item.jadwalId).sort((a, b) => a - b), [s10, s11].sort((a, b) => a - b), "jadwal");
    ok(d.items.every((item) => /^\d{4}-\d{2}-\d{2}T.*Z$/.test(item.checkedInAt)), "checkedInAt ISO UTC");
  });

  await t("absen: murid hadir dalam jendela waktu -> 201, ulang -> 409", async () => {
    let res = await api("POST", "/api/attendance", { token: sdToken, body: { jadwalId: openId } });
    eq(res.r.status, 201, "status");
    eq(res.d.item.jadwalId, openId, "jadwalId");
    ok(/^\d{4}-\d{2}-\d{2}T.*Z$/.test(res.d.item.checkedInAt), "checkedInAt ISO UTC");

    res = await api("POST", "/api/attendance", { token: sdToken, body: { jadwalId: openId } });
    eq(res.r.status, 409, "status ulang");
    eq(res.d.code, "ALREADY_CHECKED_IN", "code ulang");

    const list = await api("GET", `/api/attendance?bulan=${attendance.currentMonth()}`, { token: sdToken });
    eq(list.r.status, 200, "status daftar");
    ok(list.d.items.some((item) => item.jadwalId === openId), "kehadiran hari ini tampil");
  });

  await t("absen: sebelum dibuka, sudah lewat, dan jenjang lain ditolak", async () => {
    let res = await api("POST", "/api/attendance", { token: sdToken, body: { jadwalId: beforeId } });
    eq(res.r.status, 403, "belum dibuka");
    eq(res.d.code, "ATTENDANCE_NOT_OPEN", "code belum");

    res = await api("POST", "/api/attendance", { token: sdToken, body: { jadwalId: closedId } });
    eq(res.r.status, 404, "jenjang lain tidak terlihat");
    eq(res.d.code, "NOT_FOUND", "code jenjang");

    res = await api("POST", "/api/attendance", { token: allToken, body: { jadwalId: closedId } });
    eq(res.r.status, 403, "sudah lewat");
    eq(res.d.code, "ATTENDANCE_CLOSED", "code lewat");
  });

  await t("absen: validasi input dan peran", async () => {
    let res = await api("POST", "/api/attendance", { token: sdToken, body: {} });
    eq(res.r.status, 400, "tanpa jadwalId");
    res = await api("POST", "/api/attendance", { token: sdToken, body: { jadwalId: 999999 } });
    eq(res.r.status, 404, "jadwal tidak ada");
    res = await api("POST", "/api/attendance", { token: adminToken, body: { jadwalId: openId } });
    eq(res.r.status, 403, "admin bukan murid");
    eq(res.d.code, "STUDENT_ONLY", "code peran");
  });

  // ----------------------------------------------------------
  // Rekap siswa
  // ----------------------------------------------------------
  await t("rekap siswa: ringkasan bulan, keseluruhan, perBulan, dan sesi", async () => {
    const { r, d } = await api("GET", `/api/attendance/report?bulan=${REPORT_MONTH}`, { token: sdToken });
    eq(r.status, 200, "status");
    eq(d.bulan, REPORT_MONTH, "bulan");
    eq(d.siswa.id, sdId, "siswa");
    eq(d.ringkasan, { hadir: 2, total: 2, pct: 100 }, "ringkasan");
    eq(d.keseluruhan, { hadir: 2, total: 2, pct: 100 }, "keseluruhan");
    eq(d.perBulan.length, 12, "12 bulan");
    const m = d.perBulan.find((x) => x.bulan === REPORT_MONTH);
    eq(m, { bulan: REPORT_MONTH, hadir: 2, total: 2, pct: 100 }, "bulan berjalan");
    eq(d.sesi.length, 2, "dua sesi");
    eq(d.sesi.map((x) => x.hadir), [true, true], "semua hadir");
    eq(d.sesi.map((x) => x.jadwalId), [s10, s11], "sesi urut tanggal");
  });

  await t("rekap siswa: sesi jenjang lain tidak ikut", async () => {
    const { r, d } = await api("GET", `/api/attendance/report?bulan=${REPORT_MONTH}`, { token: smpToken });
    eq(r.status, 200, "status");
    eq(d.ringkasan, { hadir: 1, total: 2, pct: 50 }, "ringkasan SMP");
    eq(d.sesi.map((x) => x.jadwalId), [s11, s12], "hanya SMP + semua");
    eq(d.sesi.map((x) => x.hadir), [true, false], "hadir hanya sesi umum");
  });

  await t("rekap siswa: tanpa sesi -> persen null", async () => {
    const empty = attendance.addMonth(REPORT_MONTH, -6);
    const { r, d } = await api("GET", `/api/attendance/report?bulan=${empty}`, { token: allToken });
    eq(r.status, 200, "status");
    eq(d.ringkasan, { hadir: 0, total: 0, pct: null }, "ringkasan kosong");
    eq(d.sesi, [], "tidak ada sesi");
  });

  await t("rekap siswa: admin bisa membaca, murid lain tidak", async () => {
    let res = await api("GET", `/api/attendance/report?bulan=${REPORT_MONTH}`, { token: adminToken });
    eq(res.r.status, 403, "murid saja");
    eq(res.d.code, "STUDENT_ONLY", "code");

    res = await api("GET", `/api/admin/users/${sdId}/attendance?bulan=${REPORT_MONTH}`, { token: adminToken });
    eq(res.r.status, 200, "admin boleh");
    eq(res.d.ringkasan, { hadir: 2, total: 2, pct: 100 }, "rekap admin");
    eq(res.d.siswa.id, sdId, "siswa admin");

    res = await api("GET", `/api/admin/users/${sdId}/attendance?bulan=${REPORT_MONTH}`, { token: smpToken });
    eq(res.r.status, 403, "murid tidak boleh");
    res = await api("GET", "/api/admin/users/999999/attendance", { token: adminToken });
    eq(res.r.status, 404, "tidak ada");
  });

  await t("daftar siswa admin memuat persen kehadiran", async () => {
    const { r, d } = await api("GET", "/api/admin/users?limit=100", { token: adminToken });
    eq(r.status, 200, "status");
    const sd = d.users.find((u) => Number(u.id) === sdId);
    ok(sd, "murid SD ada");
    eq(sd.attendance, { hadir: 2, total: 2, pct: 100 }, "kehadiran SD");
    eq(sd.attendancePct, 100, "attendancePct");
    const smp = d.users.find((u) => Number(u.id) === smpId);
    eq(smp.attendance, { hadir: 1, total: 2, pct: 50 }, "kehadiran SMP");
  });

  // ----------------------------------------------------------
  // Rekap instruktur / admin
  // ----------------------------------------------------------
  await t("rekap instruktur: ringkasan, per sesi, dan per murid", async () => {
    const { r, d } = await api("GET", `/api/instruktur/attendance?bulan=${REPORT_MONTH}`, { token: instructorToken });
    eq(r.status, 200, "status");
    eq(d.bulan, REPORT_MONTH, "bulan");
    eq(d.total, 3, "tiga murid aktif");
    eq(d.ringkasan, { hadir: 3, total: 7, pct: 43 }, "ringkasan");
    eq(d.sesi.length, 3, "tiga sesi");
    const first = d.sesi.find((x) => x.jadwalId === s10);
    eq(first.total, 2, "eligible SD + semua");
    eq(first.hadir, 1, "hadir SD");
    eq(first.siswaTidakHadir, ["Anak Semua"], "tidak hadir");
    const second = d.sesi.find((x) => x.jadwalId === s11);
    eq(second.total, 3, "semua murid");
    eq(second.hadir, 2, "dua hadir");
    const third = d.sesi.find((x) => x.jadwalId === s12);
    eq(third.total, 2, "eligible SMP + semua");
    eq(third.hadir, 0, "belum ada yang absen");
    eq(d.perBulan.length, 12, "12 bulan");
    const rowSd = d.items.find((x) => Number(x.id) === sdId);
    eq(rowSd.ringkasan === undefined ? { hadir: rowSd.hadir, total: rowSd.total, pct: rowSd.pct } : rowSd.ringkasan,
      { hadir: 2, total: 2, pct: 100 }, "baris SD");
    ok(Array.isArray(rowSd.sesi) && rowSd.sesi.length === 2, "sesi per murid");
  });

  await t("rekap instruktur: cari, urut, dan paging di server", async () => {
    let res = await api("GET", `/api/instruktur/attendance?bulan=${REPORT_MONTH}&q=smp`, { token: instructorToken });
    eq(res.r.status, 200, "status cari");
    eq(res.d.items.length, 1, "hasil cari");
    eq(res.d.items[0].id, smpId, "murid SMP");
    eq(res.d.total, 1, "total filter");

    res = await api("GET", `/api/instruktur/attendance?bulan=${REPORT_MONTH}&urut=nama`, { token: instructorToken });
    eq(res.r.status, 200, "status urut");
    eq(res.d.items.map((x) => x.nama), ["Anak SD", "Anak Semua", "Anak SMP"], "urut nama");

    res = await api("GET", `/api/instruktur/attendance?bulan=${REPORT_MONTH}&limit=2`, { token: instructorToken });
    eq(res.r.status, 200, "status paging");
    eq(res.d.total, 3, "total paging");
    eq(res.d.pages, 2, "halaman");
    eq(res.d.items.length, 2, "dua baris");
    eq(res.d.items.map((x) => x.pct), [0, 50], "urut kehadiran terendah");

    res = await api("GET", `/api/instruktur/attendance?bulan=${REPORT_MONTH}&limit=2&page=2`, { token: instructorToken });
    eq(res.d.items.length, 1, "halaman dua");
    eq(res.d.items[0].id, sdId, "sisa baris");
  });

  await t("rekap instruktur: tanpa izin atau bulan salah ditolak", async () => {
    let res = await api("GET", `/api/instruktur/attendance?bulan=${REPORT_MONTH}`, { token: sdToken });
    eq(res.r.status, 403, "murid");
    res = await api("GET", "/api/instruktur/attendance?bulan=2026-13", { token: instructorToken });
    eq(res.r.status, 400, "bulan");
  });

  // ----------------------------------------------------------
  // Absen per sesi (portal instruktur)
  // ----------------------------------------------------------
  const SESI_RANGE = `dari=${REPORT_DAY("10")}&sampai=${REPORT_DAY("12")}`;

  await t("sesi: daftar sesi dengan hadir dan tidak hadir", async () => {
    const { r, d } = await api("GET", `/api/instruktur/sesi?${SESI_RANGE}`, { token: instructorToken });
    eq(r.status, 200, "status");
    eq(d.total, 3, "tiga murid");
    eq(d.sesi.map((s) => s.id), [s10, s11, s12], "urut tanggal");
    const first = d.sesi.find((s) => s.id === s10);
    eq(first.status, "done", "sesi selesai");
    eq(first.total, 2, "eligible SD + semua");
    eq(first.hadir.map((x) => x.siswaId), [sdId], "hadir SD");
    eq(first.tidakHadir.map((x) => x.siswaId), [allId], "tidak hadir");
    eq(first.pct, 50, "persen sesi");
    ok(/^\d{4}-\d{2}-\d{2}T.*Z$/.test(first.hadir[0].checkedInAt), "checkedInAt ISO UTC");
    const second = d.sesi.find((s) => s.id === s11);
    eq(second.hadir.length, 2, "dua hadir di sesi semua");
    ok(second.hadir.every((x) => x.nama), "hadir memuat nama");
  });

  await t("sesi: ringkasan bulanan dan murid yang perlu perhatian", async () => {
    const { r, d } = await api("GET", `/api/instruktur/sesi/ringkasan?bulan=${REPORT_MONTH}`, { token: instructorToken });
    eq(r.status, 200, "status");
    eq(d.bulan, REPORT_MONTH, "bulan");
    eq(d.rataRata, 38.9, "rata-rata sesi");
    eq(d.rataRataBulanLalu, null, "belum ada sesi bulan lalu");
    eq(d.perhatian.map((x) => Number(x.siswaId)), [allId, smpId], "urut kehadiran terendah");
    eq(d.perhatian[0].hadir, 0, "hadir murid semua");
    eq(d.perhatian[0].total, 3, "total sesi eligible");
    eq(d.perhatian[0].pct, 0, "persen murid semua");

    const bad = await api("GET", "/api/instruktur/sesi/ringkasan?bulan=2026-13", { token: instructorToken });
    eq(bad.r.status, 400, "bulan salah");
  });

  await t("sesi: tanpa izin dan rentang tanggal salah ditolak", async () => {
    let res = await api("GET", `/api/instruktur/sesi?${SESI_RANGE}`, { token: sdToken });
    eq(res.r.status, 403, "murid tidak boleh");
    res = await api("GET", "/api/instruktur/sesi?dari=2026-02-01&sampai=2026-01-01", { token: instructorToken });
    eq(res.r.status, 400, "rentang terbalik");
    res = await api("GET", "/api/instruktur/sesi?dari=2026-01-01&sampai=2026-12-31", { token: instructorToken });
    eq(res.r.status, 400, "rentang terlalu panjang");
  });

  await t("sesi: murid binaan membatasi hadir/tidak hadir", async () => {
    let res = await api("PATCH", `/api/admin/instructors/${instructorId}`, {
      token: adminToken,
      body: {
        assignments: [{ grade: "SD", tahap: 1, studentIds: [sdId] }],
        studentIds: [sdId]
      }
    });
    eq(res.r.status, 200, "penugasan disimpan");

    const list = await api("GET", `/api/instruktur/sesi?${SESI_RANGE}`, { token: instructorToken });
    eq(list.r.status, 200, "status daftar");
    eq(list.d.total, 1, "hanya murid binaan");
    const first = list.d.sesi.find((s) => s.id === s10);
    eq(first.total, 1, "eligible murid binaan");
    eq(first.hadir.map((x) => x.siswaId), [sdId], "murid binaan hadir");
    eq(first.tidakHadir.length, 0, "tidak ada murid lain");

    const summary = await api("GET", `/api/instruktur/sesi/ringkasan?bulan=${REPORT_MONTH}`, { token: instructorToken });
    eq(summary.r.status, 200, "status ringkasan");
    eq(summary.d.rataRata, 100, "semua sesi dihadiri murid binaan");
    eq(summary.d.perhatian.length, 0, "tidak ada yang perlu perhatian");

    // Kembalikan tanpa penugasan agar tes lain tetap melihat semua murid.
    res = await api("PATCH", `/api/admin/instructors/${instructorId}`, {
      token: adminToken,
      body: { assignments: [], studentIds: [] }
    });
    eq(res.r.status, 200, "penugasan dibersihkan");
    eq(res.d.item.assignments.length, 0, "tanpa tahap");
    eq(res.d.item.studentIds.length, 0, "tanpa murid");
  });

  const fails = results.filter((r) => r[0] === "FAIL");
  console.log("");
  for (const [status, name] of results) console.log(`${status}  ${name}`);
  console.log(`\n${results.length - fails.length}/${results.length} lolos`);
  child.kill();
  db.close();
  for (const file of [TMPDB, TMPDB + "-shm", TMPDB + "-wal"]) {
    try { fs.unlinkSync(file); } catch {}
  }
  fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
  process.exit(fails.length ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  try { child.kill(); } catch {}
  try { db.close(); } catch {}
  process.exit(2);
});
