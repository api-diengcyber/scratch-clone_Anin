// Pengujian progress, points, learning analytics, achievements, mentor notes,
// dan laporan wali. Semua data dibuat di SQLite sementara; database asli aman.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const BACKEND = __dirname;
const PORT = 3217;
const TMPDB = path.join(os.tmpdir(), `dcc-learning-test-${process.pid}.sqlite`);
const PLUGIN_DIR = path.join(os.tmpdir(), `dcc-learning-plugins-${process.pid}`);
for (const suffix of ["", "-wal", "-shm"]) {
  try { fs.unlinkSync(TMPDB + suffix); } catch (_) { /* belum ada */ }
}

process.env.DB_PATH = TMPDB;
process.env.PORT = String(PORT);
process.env.NODE_ENV = "test";
process.env.PLUGIN_DIR = PLUGIN_DIR;
process.env.FIRST_TRY_BONUS = "5";

const db = require("./database");
const auth = require("./auth");
const reports = require("./reports");

function createUser(username, role = "student") {
  const info = db.prepare(`
    INSERT INTO users (username, role, status, allowed_grades)
    VALUES (?, ?, 'active', ?)
  `).run(username, role, JSON.stringify(["SMP"]));
  return Number(info.lastInsertRowid);
}

const studentId = createUser("learner");
const otherStudentId = createUser("other-learner");
const adminId = createUser("admin-test", "admin");
const studentToken = auth.createSession(studentId);
const otherStudentToken = auth.createSession(otherStudentId);
const adminToken = auth.createSession(adminId);

// Dua task satu modul: satu task biasa dan satu project/capstone.
db.prepare("INSERT OR IGNORE INTO modules (grade, module_id) VALUES ('SMP', 'testmod')").run();
db.prepare(`
  INSERT OR IGNORE INTO tasks
    (grade, module_id, task_id, task_index, title, steps, is_project, requires_submission, points, editor_url)
  VALUES
    ('SMP', 'testmod', 'testmod:0', 0, 'Task Dasar', '[]', 0, 0, 10, NULL),
    ('SMP', 'testmod', 'testmod:1', 1, 'Project Akhir', '[]', 1, 1, 20, NULL)
`).run();

// Token laporan wali dibuat langsung melalui service yang sudah ada.
const reportLink = reports.createReportLink(db, studentId, { expiresInDays: 7, createdBy: adminId });

const child = spawn(process.execPath, ["server.js"], {
  cwd: BACKEND,
  env: { ...process.env },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

const BASE = `http://127.0.0.1:${PORT}`;
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(route, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data;
  try { data = await response.json(); }
  catch (_) { throw new Error(`Respons bukan JSON (${response.status}): ${(await response.text()).slice(0, 160)}`); }
  return { response, data };
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ status: "PASS", name });
  } catch (error) {
    results.push({ status: "FAIL", name: `${name} — ${error.message}` });
  }
}

async function waitReady() {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (output.includes("Server siap digunakan")) return;
    if (child.exitCode !== null) throw new Error(`Server berhenti.\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server tidak siap.\n${output}`);
}

(async () => {
  try {
    await waitReady();

    await test("learning analytics wajib login", async () => {
      const { response, data } = await request("/api/learning/analytics");
      assert(response.status === 401 && data.code === "UNAUTHORIZED", "seharusnya 401");
    });

    await test("analytics awal menampilkan dua task belum selesai", async () => {
      const { response, data } = await request("/api/learning/analytics", { token: studentToken });
      assert(response.status === 200 && data.ok, "request analytics gagal");
      assert(data.analytics.summary.totalTasks === 2, "totalTasks harus 2");
      assert(data.analytics.summary.completedTasks === 0, "completedTasks harus 0");
    });

    await test("complete pertama memberi base + bonus", async () => {
      const { response, data } = await request("/api/progress/learner", {
        method: "POST", token: studentToken,
        body: { taskId: "testmod:0", completed: true }
      });
      assert(response.status === 200 && data.ok, "simpan progress gagal");
      assert(data.points === 15, `points seharusnya 15, aktual ${data.points}`);
      assert(data.earned.base === 10 && data.earned.bonus === 5, "rincian bonus tidak sesuai");
    });

    await test("complete berulang idempoten", async () => {
      const { data } = await request("/api/progress/learner", {
        method: "POST", token: studentToken,
        body: { taskId: "testmod:0", completed: true }
      });
      assert(data.points === 15, "points bertambah saat request diulang");
      assert(data.earned.base === 0 && data.earned.bonus === 0, "earned harus nol pada request duplikat");
    });

    await test("attempt menerima waktu dan membatasi nilai tidak wajar", async () => {
      const good = await request("/api/attempts/learner", {
        method: "POST", token: studentToken,
        body: { taskId: "testmod:1", timeSpent: 120 }
      });
      assert(good.response.status === 200 && good.data.fails === 1, "attempt gagal dicatat");
      assert(good.data.timeSpent === 120, "waktu tidak tersimpan");
      const bad = await request("/api/attempts/learner", {
        method: "POST", token: studentToken,
        body: { taskId: "testmod:1", timeSpent: 999999 }
      });
      assert(bad.response.status === 400 && bad.data.code === "VALIDATION_ERROR", "waktu berlebihan harus ditolak");
    });

    await test("task yang pernah gagal tidak mendapat bonus percobaan pertama", async () => {
      const { response, data } = await request("/api/progress/learner", {
        method: "POST", token: studentToken,
        body: { taskId: "testmod:1", completed: true }
      });
      assert(response.status === 200, "progress project gagal");
      assert(data.earned.base === 20 && data.earned.bonus === 0, "bonus seharusnya 0");
      assert(data.points === 35, `total harus 35, aktual ${data.points}`);
    });

    await test("uncheck mengurangi points dan re-complete tidak menggandakan bonus", async () => {
      const undo = await request("/api/progress/learner", {
        method: "POST", token: studentToken,
        body: { taskId: "testmod:0", completed: false }
      });
      assert(undo.response.status === 200 && undo.data.points === 20, "uncheck tidak menghitung ulang points");
      const redo = await request("/api/progress/learner", {
        method: "POST", token: studentToken,
        body: { taskId: "testmod:0", completed: true }
      });
      assert(redo.response.status === 200 && redo.data.points === 35, "re-complete tidak mengembalikan total yang benar");
      assert(redo.data.earned.bonus === 0, "bonus diberikan dua kali");
    });

    await test("analytics menampilkan attempt, waktu, points, dan modul selesai", async () => {
      const { response, data } = await request("/api/learning/analytics", { token: studentToken });
      assert(response.status === 200, "analytics gagal");
      const a = data.analytics;
      assert(a.summary.completedTasks === 2, "dua task seharusnya selesai");
      assert(a.summary.points.earned === 35, "earned points salah");
      assert(a.summary.failedAttempts === 1, "jumlah gagal salah");
      assert(a.summary.timeSpentSeconds === 120, "total waktu salah");
      assert(a.summary.completedModules === 1, "achievement modul seharusnya tercapai");
      assert(a.achievements[0].earned === true, "achievement belum terbuka");
    });

    await test("achievement endpoint mengembalikan capaian modul", async () => {
      const { response, data } = await request("/api/achievements", { token: studentToken });
      assert(response.status === 200 && data.earned === 1 && data.total === 1, "hasil achievements salah");
    });

    await test("mentor note hanya bisa dibaca siswa lewat endpoint miliknya", async () => {
      const { response, data } = await request("/api/mentor-note", { token: studentToken });
      assert(response.status === 200 && data.item === null, "pesan awal harus kosong");
    });

    await test("siswa tidak bisa mengakses endpoint admin", async () => {
      const { response } = await request(`/api/admin/users/${studentId}/learning/analytics`, { token: studentToken });
      assert(response.status === 403, `akses siswa seharusnya 403, aktual ${response.status}`);
    });

    await test("admin dapat membaca analytics siswa", async () => {
      const { response, data } = await request(`/api/admin/users/${studentId}/learning/analytics`, { token: adminToken });
      assert(response.status === 200 && data.analytics.summary.completedTasks === 2, "admin analytics gagal");
    });

    await test("admin dapat menyimpan pesan mentor", async () => {
      const { response, data } = await request(`/api/admin/users/${studentId}/mentor-note`, {
        method: "PUT", token: adminToken, body: { note: "Bagus! Terus pertahankan konsistensi belajarmu." }
      });
      assert(response.status === 200 && data.item.text.includes("Bagus!"), "pesan tidak tersimpan");
    });

    await test("siswa membaca pesan mentor dari backend", async () => {
      const { response, data } = await request("/api/mentor-note", { token: studentToken });
      assert(response.status === 200 && data.item.text.includes("Bagus!"), "pesan mentor tidak terbaca");
    });

    await test("laporan wali memuat ringkasan dan pesan mentor, tanpa lencana, analytics, dan username", async () => {
      // Siswa ini sudah menyelesaikan satu modul dan punya lencana (dicek lewat endpoint miliknya sendiri),
      // tetapi laporan yang dibuka wali tidak boleh membawa data lencana apa pun.
      const own = await request("/api/achievements", { token: studentToken });
      assert(own.response.status === 200 && JSON.stringify(own.data).match(/"earned":\s*true/), "siswa seharusnya punya lencana");

      const { response, data } = await request(`/api/reports/${reportLink.token}`);
      assert(response.status === 200 && data.ok, "tautan laporan gagal");
      assert(data.report.summary.completedTasks === 2, "ringkasan tugas selesai tidak ada di laporan");
      assert(data.report.mentorNote.text.includes("Bagus!"), "pesan mentor tidak ada di laporan");
      assert(!("authorId" in data.report.mentorNote), "ID penulis pesan mentor bocor");
      assert(data.report.analytics === undefined && data.report.achievements === undefined, "analytics/achievements ikut terkirim");
      assert(!("achievementsEarned" in data.report.summary), "jumlah lencana ikut terkirim");
      const body = JSON.stringify(data);
      assert(!/achievement|lencana/i.test(body), "data lencana bocor ke laporan wali");
      assert(!body.includes("learner"), "username siswa bocor ke laporan wali");
      assert(data.report.student.name === null && data.child.fullName === null, "siswa tanpa nama lengkap tidak boleh memakai username");
    });

    await test("laporan wali memuat data mentah minimal untuk halaman wali (child, progress, attempts)", async () => {
      const { response, data } = await request(`/api/reports/${reportLink.token}`);
      assert(response.status === 200, "tautan laporan gagal");
      assert(JSON.stringify(Object.keys(data.child)) === JSON.stringify(["fullName"]), "child hanya boleh berisi fullName");
      assert(data.progress.length === 2 && data.progress.every((row) => row.completed === true), "progress hanya baris yang selesai");
      assert(data.progress.every((row) => JSON.stringify(Object.keys(row)) === JSON.stringify(["task_id", "completed"])), "bentuk baris progress");
      const attempt = data.attempts.find((row) => row.task_id === "testmod:1");
      assert(attempt && attempt.fails === 1 && attempt.time_spent === 120, "baris attempts tidak sesuai");
      assert(data.attempts.every((row) => JSON.stringify(Object.keys(row)) === JSON.stringify(["task_id", "fails", "time_spent"])), "bentuk baris attempts");
    });

    await test("user tidak bisa membaca progress akun lain", async () => {
      const { response } = await request("/api/progress/other-learner", { token: studentToken });
      assert(response.status === 403, `akses silang seharusnya 403, aktual ${response.status}`);
    });

    await test("taskId dengan tipe tidak valid ditolak", async () => {
      const { response, data } = await request("/api/progress/learner", {
        method: "POST", token: studentToken,
        body: { taskId: { id: "testmod:0" }, completed: true }
      });
      assert(response.status === 400 && data.code === "VALIDATION_ERROR", "taskId non-string tidak ditolak");
    });

    console.table(results);
    const failed = results.filter((item) => item.status === "FAIL");
    console.log(`\n${results.length - failed.length}/${results.length} test passed.`);
    if (failed.length) {
      console.error(output);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    console.error(output);
    process.exitCode = 1;
  } finally {
    if (child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1000);
        child.once("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    try { db.close(); } catch (_) { /* ditutup jika masih terbuka */ }
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.unlinkSync(TMPDB + suffix); } catch (_) { /* ignore */ }
    }
    try { fs.rmSync(PLUGIN_DIR, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
})();