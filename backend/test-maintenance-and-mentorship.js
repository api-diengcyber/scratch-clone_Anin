"use strict";

// Test suite untuk:
// 1. Instructor Student Assignment & Submission Scope (Opsi 1)
// 2. DB Maintenance Worker - WAL Checkpoint & Automated Backup (Opsi 3)

const path = require("path");
const fs = require("fs");
const os = require("os");

const TMPDB = path.join(os.tmpdir(), `dcc-test-maint-${process.pid}.sqlite`);
const TMP_BACKUP_DIR = path.join(os.tmpdir(), `dcc-test-backups-${process.pid}`);
process.env.DB_PATH = TMPDB;
process.env.BACKUP_DIR = TMP_BACKUP_DIR;
process.env.NODE_ENV = "test";

const db = require("./database");
const auth = require("./auth");
const dbMaintenance = require("./db-maintenance");

function ok(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS  ${msg}`);
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    console.error(`FAIL: ${msg}`);
    console.error(`  aktual:   ${a}`);
    console.error(`  ekspektasi: ${b}`);
    process.exit(1);
  }
  console.log(`PASS  ${msg}`);
}

async function run() {
  try {
    // --------------------------------------------------------
    // BAGIAN 1: DATABASE MAINTENANCE (WAL & AUTOMATED BACKUP)
    // --------------------------------------------------------
    console.log("\n--- Menguji DB Maintenance Worker ---");

    // 1. Uji WAL Checkpoint
    const checkpointRes = dbMaintenance.checkpointWal(db);
    ok(checkpointRes.ok, "checkpointWal berhasil dieksekusi");

    // 2. Uji Automated Backup
    const backupRes = await dbMaintenance.createAutomatedBackup(db, {
      backupDir: TMP_BACKUP_DIR,
      keep: 2,
      verify: true
    });
    ok(backupRes.ok, "createAutomatedBackup berhasil");
    ok(fs.existsSync(backupRes.destination), "File backup fisik berhasil dibuat");
    ok(backupRes.size > 0, "Ukuran file backup valid");

    // 3. Uji Rotasi Backup (Keep = 2)
    await dbMaintenance.createAutomatedBackup(db, { backupDir: TMP_BACKUP_DIR, keep: 2 });
    await dbMaintenance.createAutomatedBackup(db, { backupDir: TMP_BACKUP_DIR, keep: 2 });
    const backupFiles = fs.readdirSync(TMP_BACKUP_DIR).filter((f) => /^database-.*\.sqlite$/.test(f));
    eq(backupFiles.length, 2, "Rotasi backup menjaga tepat 2 file terakhir");

    // 4. Uji Scheduler Lifecycle
    const scheduler = dbMaintenance.startMaintenanceScheduler(db, {
      walIntervalMs: 60000,
      backupIntervalMs: 60000
    });
    ok(scheduler && typeof scheduler.stop === "function", "startMaintenanceScheduler aktif");
    scheduler.stop();

    // --------------------------------------------------------
    // BAGIAN 2: ALUR TUGAS SISWA BINAAN INSTRUKTUR
    // --------------------------------------------------------
    console.log("\n--- Menguji Alur Penugasan & Submisi Siswa Binaan ---");

    // Setup Instruktur 1 & 2
    const instr1 = Number(db.prepare("INSERT INTO users (username, role, status) VALUES ('instr_bina1', 'instruktur', 'active')").run().lastInsertRowid);
    const instr2 = Number(db.prepare("INSERT INTO users (username, role, status) VALUES ('instr_bina2', 'instruktur', 'active')").run().lastInsertRowid);

    // Setup Siswa A & B
    const studentA = Number(db.prepare("INSERT INTO users (username, role, status) VALUES ('siswa_a', 'student', 'active')").run().lastInsertRowid);
    const studentB = Number(db.prepare("INSERT INTO users (username, role, status) VALUES ('siswa_b', 'student', 'active')").run().lastInsertRowid);

    // Tetapkan Siswa A sebagai murid binaan Instruktur 1 (tahap integer 1..99)
    db.prepare(`
      INSERT INTO instructor_students (instructor_user_id, student_user_id, grade, tahap)
      VALUES (?, ?, 'SMP', 1)
    `).run(instr1, studentA);

    // Buat Tugas Tambahan
    const taskId = Number(db.prepare(`
      INSERT INTO instruktur_tasks (owner_user_id, title, grade, type, points, status)
      VALUES (?, 'Tugas Algoritma Loop', 'SMP', 'proyek', 50, 'terbit')
    `).run(instr1).lastInsertRowid);

    // Siswa A & B kumpulkan tugas
    db.prepare(`
      INSERT INTO instruktur_task_submissions (task_id, student_user_id, text, status)
      VALUES (?, ?, 'Jawaban Siswa A', 'dikumpulkan')
    `).run(taskId, studentA);

    db.prepare(`
      INSERT INTO instruktur_task_submissions (task_id, student_user_id, text, status)
      VALUES (?, ?, 'Jawaban Siswa B', 'dikumpulkan')
    `).run(taskId, studentB);

    // Query submissions dengan scope 'all' untuk Instr 1
    const allSubs = db.prepare(`
      SELECT s.*, u.username, u.full_name,
             CASE WHEN ins.instructor_user_id IS NOT NULL THEN 1 ELSE 0 END AS is_my_student
      FROM instruktur_task_submissions s
      LEFT JOIN users u ON u.id = s.student_user_id
      LEFT JOIN instructor_students ins ON ins.student_user_id = s.student_user_id AND ins.instructor_user_id = ?
      WHERE s.task_id = ?
      ORDER BY is_my_student DESC, s.submitted_at DESC
    `).all(instr1, taskId);

    eq(allSubs.length, 2, "Instruktur 1 melihat total 2 submisi pada daftar all");
    eq(allSubs[0].student_user_id, studentA, "Siswa binaan sendiri diprioritaskan di paling atas");
    eq(allSubs[0].is_my_student, 1, "Flag is_my_student bernilai 1 untuk Siswa A");
    eq(allSubs[1].is_my_student, 0, "Flag is_my_student bernilai 0 untuk Siswa B");

    // Query submissions dengan scope 'mine' untuk Instr 1
    const mineSubs = db.prepare(`
      SELECT s.*, u.username, u.full_name,
             CASE WHEN ins.instructor_user_id IS NOT NULL THEN 1 ELSE 0 END AS is_my_student
      FROM instruktur_task_submissions s
      LEFT JOIN users u ON u.id = s.student_user_id
      LEFT JOIN instructor_students ins ON ins.student_user_id = s.student_user_id AND ins.instructor_user_id = ?
      WHERE s.task_id = ? AND ins.instructor_user_id IS NOT NULL
      ORDER BY s.submitted_at DESC
    `).all(instr1, taskId);

    eq(mineSubs.length, 1, "Filter scope=mine hanya menampilkan 1 submisi siswa binaan");
    eq(mineSubs[0].student_user_id, studentA, "Submisi yang muncul tepat Siswa A");

    // Query submissions dengan scope 'mine' untuk Instr 2 (tidak punya siswa binaan)
    const instr2MineSubs = db.prepare(`
      SELECT s.*, u.username, u.full_name,
             CASE WHEN ins.instructor_user_id IS NOT NULL THEN 1 ELSE 0 END AS is_my_student
      FROM instruktur_task_submissions s
      LEFT JOIN users u ON u.id = s.student_user_id
      LEFT JOIN instructor_students ins ON ins.student_user_id = s.student_user_id AND ins.instructor_user_id = ?
      WHERE s.task_id = ? AND ins.instructor_user_id IS NOT NULL
      ORDER BY s.submitted_at DESC
    `).all(instr2, taskId);

    eq(instr2MineSubs.length, 0, "Instruktur 2 tidak melihat submisi siswa binaan di scope=mine");

    console.log("\nSemua verifikasi Maintenance & Penugasan Siswa Binaan SUKSES!");
  } finally {
    try {
      db.close();
      if (fs.existsSync(TMPDB)) fs.unlinkSync(TMPDB);
      const wal = `${TMPDB}-wal`;
      const shm = `${TMPDB}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);

      if (fs.existsSync(TMP_BACKUP_DIR)) {
        fs.rmSync(TMP_BACKUP_DIR, { recursive: true, force: true });
      }
    } catch (_) {}
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
