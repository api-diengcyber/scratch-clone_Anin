// Wali siswa + tautan laporan hasil belajar.
//
// Prinsip:
// - Wali bukan akun login. Mereka hanya menerima tautan laporan.
// - Token tautan disimpan sebagai hash, bukan plaintext.
// - Tautan bisa kedaluwarsa dan dicabut kapan saja oleh admin.
"use strict";

const crypto = require("crypto");
const learningService = require("./learning-service");
const reportDeliveries = require("./report-deliveries");

const RELATIONS = ["ayah", "ibu", "wali", "lainnya"];
const MAX_GUARDIANS = 5;
const DEFAULT_EXPIRY_DAYS = 30;
const MAX_EXPIRY_DAYS = 365;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
// Halaman wali. Token ditaruh setelah '#': bagian itu tidak ikut dikirim browser ke
// server, jadi tidak masuk log, riwayat server, maupun header Referer.
const REPORT_PAGE_PATH = "/orangtua/laporan.html";

function reportPageUrl(baseUrl, token) {
  return `${String(baseUrl).replace(/\/+$/, "")}${REPORT_PAGE_PATH}#${token}`;
}
const GRADES = ["SD", "SMP", "SMK"];

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function sqliteTimestamp(date) {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function isoFromSqlite(value) {
  if (!value) return null;
  const text = String(value);
  if (text.includes("T")) return text;
  return text.replace(" ", "T") + "Z";
}

function parseGrades(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((g) => String(g).toUpperCase()).filter((g) => GRADES.includes(g)))];
  } catch (_) {
    return [];
  }
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function listGuardians(db, studentId) {
  return db.prepare(`
    SELECT id, name, email, relation, created_at, updated_at
    FROM student_guardians
    WHERE student_user_id = ?
    ORDER BY id ASC
  `).all(studentId).map((row) => ({
    id: Number(row.id),
    name: row.name,
    email: row.email,
    relation: row.relation,
    createdAt: isoFromSqlite(row.created_at),
    updatedAt: isoFromSqlite(row.updated_at)
  }));
}

function getGuardian(db, guardianId, studentId) {
  const row = db.prepare(`
    SELECT id, name, email, relation
    FROM student_guardians
    WHERE id = ? AND student_user_id = ?
  `).get(guardianId, studentId);
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    relation: row.relation
  };
}

// Mengganti daftar wali berdasarkan selisih email (bukan hapus-lalu-insert semua):
// - wali yang dipertahankan memakai id yang sama, jadi tautannya tetap terhubung;
// - wali yang dihapus: tautannya dicabut dulu, baru barisnya dihapus
//   (guardian_id pada tautan menjadi NULL oleh FK, jadi harus dicabut sebelum itu);
// - wali baru di-insert.
// Urutan daftar mengikuti id (wali lama dulu, lalu yang baru).
function replaceGuardians(db, studentId, guardians, createdBy) {
  const tx = db.transaction(() => {
    const existing = db.prepare(`
      SELECT id, email FROM student_guardians WHERE student_user_id = ?
    `).all(studentId);
    const existingByEmail = new Map(existing.map((row) => [String(row.email).toLowerCase(), row]));
    const wanted = new Set(guardians.map((g) => g.email.toLowerCase()));

    const revokeLinks = db.prepare(`
      UPDATE report_links SET revoked_at = CURRENT_TIMESTAMP
      WHERE guardian_id = ? AND revoked_at IS NULL
    `);
    const remove = db.prepare("DELETE FROM student_guardians WHERE id = ?");
    for (const row of existing) {
      if (wanted.has(String(row.email).toLowerCase())) continue;
      revokeLinks.run(row.id);
      // Email laporan yang belum terkirim ke wali ini juga dibatalkan.
      reportDeliveries.skipPendingForGuardian(db, row.id, "Wali dihapus dari daftar");
      remove.run(row.id);
    }

    const update = db.prepare(`
      UPDATE student_guardians
      SET name = ?, email = ?, relation = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND (name <> ? OR email <> ? OR relation <> ?)
    `);
    const insert = db.prepare(`
      INSERT INTO student_guardians (student_user_id, name, email, relation, created_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const guardian of guardians) {
      const found = existingByEmail.get(guardian.email.toLowerCase());
      if (found) {
        update.run(
          guardian.name, guardian.email, guardian.relation,
          found.id, guardian.name, guardian.email, guardian.relation
        );
      } else {
        insert.run(studentId, guardian.name, guardian.email, guardian.relation, createdBy || null);
      }
    }
  });
  tx();
  return listGuardians(db, studentId);
}

function createReportLink(db, studentId, { guardianId = null, expiresInDays = DEFAULT_EXPIRY_DAYS, createdBy = null } = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + Number(expiresInDays) * 86400000);
  const info = db.prepare(`
    INSERT INTO report_links
      (token_hash, student_user_id, guardian_id, created_by, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(hashToken(token), studentId, guardianId, createdBy, sqliteTimestamp(expires));

  return {
    id: Number(info.lastInsertRowid),
    token,
    studentId: Number(studentId),
    guardianId: guardianId === null ? null : Number(guardianId),
    expiresAt: expires.toISOString(),
    createdAt: new Date().toISOString()
  };
}

function listReportLinks(db, studentId) {
  return db.prepare(`
    SELECT rl.id, rl.guardian_id, rl.expires_at, rl.revoked_at,
           rl.last_accessed_at, rl.access_count, rl.created_at,
           g.name AS guardian_name, g.email AS guardian_email
    FROM report_links rl
    LEFT JOIN student_guardians g ON g.id = rl.guardian_id
    WHERE rl.student_user_id = ?
    ORDER BY rl.id DESC
  `).all(studentId).map((row) => {
    const expiresMs = new Date(isoFromSqlite(row.expires_at)).getTime();
    const status = row.revoked_at
      ? "revoked"
      : (Number.isFinite(expiresMs) && expiresMs <= Date.now() ? "expired" : "active");
    return {
      id: Number(row.id),
      guardianId: row.guardian_id === null ? null : Number(row.guardian_id),
      guardianName: row.guardian_name || null,
      guardianEmail: row.guardian_email || null,
      status,
      expiresAt: isoFromSqlite(row.expires_at),
      revokedAt: isoFromSqlite(row.revoked_at),
      lastAccessedAt: isoFromSqlite(row.last_accessed_at),
      accessCount: Number(row.access_count || 0),
      createdAt: isoFromSqlite(row.created_at)
    };
  });
}

function revokeReportLink(db, studentId, linkId) {
  const row = db.prepare(`
    SELECT id, revoked_at FROM report_links
    WHERE id = ? AND student_user_id = ?
  `).get(linkId, studentId);
  if (!row) return null;
  if (!row.revoked_at) {
    db.prepare("UPDATE report_links SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?").run(linkId);
  }
  return { id: Number(linkId), revoked: true };
}

function readSettings(db) {
  try {
    const row = db.prepare("SELECT payload_json FROM admin_settings WHERE id = 1").get();
    if (!row) return {};
    const parsed = JSON.parse(row.payload_json || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function buildStudentReport(db, studentId) {
  const student = db.prepare(`
    SELECT id, username, full_name, allowed_grades
    FROM users
    WHERE id = ? AND role = 'student' AND status <> 'deleted'
  `).get(studentId);
  if (!student) return null;

  const grades = parseGrades(student.allowed_grades);
  const gradeFilter = grades.length ? grades : [...GRADES];
  const marks = gradeFilter.map(() => "?").join(",");

  const totals = db.prepare(`
    SELECT grade, COUNT(*) AS total
    FROM tasks
    WHERE grade IN (${marks})
    GROUP BY grade
  `).all(...gradeFilter);
  const completed = db.prepare(`
    SELECT t.grade, COUNT(*) AS total
    FROM progress pr
    JOIN tasks t ON t.task_id = pr.task_id
    WHERE pr.user_id = ? AND pr.completed = 1 AND t.grade IN (${marks})
    GROUP BY t.grade
  `).all(studentId, ...gradeFilter);

  const totalByGrade = new Map(totals.map((row) => [row.grade, Number(row.total || 0)]));
  const completedByGrade = new Map(completed.map((row) => [row.grade, Number(row.total || 0)]));
  const gradeSummary = gradeFilter.map((grade) => {
    const totalTasks = totalByGrade.get(grade) || 0;
    const completedTasks = completedByGrade.get(grade) || 0;
    return {
      grade,
      totalTasks,
      completedTasks,
      completionRate: totalTasks ? round1((completedTasks / totalTasks) * 100) : 0
    };
  });

  const totalTasks = gradeSummary.reduce((sum, row) => sum + row.totalTasks, 0);
  const completedTasks = gradeSummary.reduce((sum, row) => sum + row.completedTasks, 0);

  const points = db.prepare("SELECT COALESCE(total, 0) AS total FROM points WHERE user_id = ?").get(studentId);
  const analytics = learningService.buildLearningAnalytics(db, studentId);
  const mentorNote = learningService.getMentorNote(db, studentId);
  if (!analytics) return null;
  const recent = db.prepare(`
    SELECT pr.task_id, t.title, t.grade, t.points, pr.completed_at
    FROM progress pr
    LEFT JOIN tasks t ON t.task_id = pr.task_id
    WHERE pr.user_id = ? AND pr.completed = 1
    ORDER BY datetime(pr.completed_at) DESC, pr.id DESC
    LIMIT 100
  `).all(studentId).map((row) => ({
    taskId: row.task_id,
    title: row.title || row.task_id,
    grade: row.grade || null,
    points: row.points === null ? null : Number(row.points),
    completedAt: isoFromSqlite(row.completed_at)
  }));

  const submissions = db.prepare(`
    SELECT s.id, s.task_id, t.title, t.grade, s.status, s.score,
           s.feedback, s.submitted_at, s.graded_at
    FROM admin_task_submissions s
    LEFT JOIN admin_tasks t ON t.id = s.task_id
    WHERE s.user_id = ?
    ORDER BY s.id DESC
    LIMIT 50
  `).all(studentId).map((row) => ({
    id: Number(row.id),
    taskId: Number(row.task_id),
    title: row.title || `Tugas #${row.task_id}`,
    grade: row.grade || null,
    status: row.status,
    score: row.score === null ? null : Number(row.score),
    feedback: row.feedback || "",
    submittedAt: isoFromSqlite(row.submitted_at),
    gradedAt: isoFromSqlite(row.graded_at)
  }));

  const graded = submissions.filter((row) => row.status === "dinilai" && row.score !== null);
  const averageScore = graded.length
    ? round1(graded.reduce((sum, row) => sum + row.score, 0) / graded.length)
    : null;

  const settings = readSettings(db);
  return {
    generatedAt: new Date().toISOString(),
    institution: {
      name: settings.name || "Dieng Cyber Coding",
      year: settings.year || null,
      semester: settings.semester || null,
      kkm: settings.kkm === undefined ? null : settings.kkm
    },
    // Laporan ini dibuka siapa pun yang memegang tautan, jadi isinya WHITELIST eksplisit:
    // tidak ada username/ID/email, tidak ada data lencana, dan `analytics` utuh tidak
    // dikirim (tiap modul di dalamnya membawa data lencana sendiri). Siswa tanpa
    // nama lengkap tampil tanpa nama; username adalah separuh kredensial login.
    student: {
      name: student.full_name || null,
      grades: gradeFilter
    },
    summary: {
      points: Number(points ? points.total : 0),
      totalTasks,
      completedTasks,
      completionRate: totalTasks ? round1((completedTasks / totalTasks) * 100) : 0,
      gradedSubmissions: graded.length,
      averageScore,
      completedModules: analytics.summary.completedModules,
      failedAttempts: analytics.summary.failedAttempts,
      timeSpentSeconds: analytics.summary.timeSpentSeconds
    },
    grades: gradeSummary,
    completedTasks: recent,
    submissions,
    // Pesan mentor boleh dilihat wali; ID internal penulisnya tidak ikut.
    mentorNote: mentorNote
      ? { text: mentorNote.text, authorName: mentorNote.authorName || null, updatedAt: mentorNote.updatedAt }
      : null
  };
}

// Data mentah untuk halaman wali: halaman menghitung tampilannya di browser dengan mesin
// yang sama seperti "Laporan Saya", jadi ia butuh baris progres dan percobaan.
// Sengaja minimal: tanpa username, tanpa waktu selesai, tanpa baris yang belum selesai.
const MAX_CHILD_ROWS = 5000;

function buildChildData(db, studentId, fullName) {
  const progress = db.prepare(`
    SELECT task_id FROM progress
    WHERE user_id = ? AND completed = 1
    ORDER BY id ASC LIMIT ?
  `).all(studentId, MAX_CHILD_ROWS).map((row) => ({ task_id: row.task_id, completed: true }));

  const attempts = db.prepare(`
    SELECT task_id, fails, time_spent FROM attempts
    WHERE user_id = ?
    ORDER BY id ASC LIMIT ?
  `).all(studentId, MAX_CHILD_ROWS).map((row) => ({
    task_id: row.task_id,
    fails: Number(row.fails || 0),
    time_spent: Number(row.time_spent || 0)
  }));

  return { child: { fullName: fullName || null }, progress, attempts };
}

function resolveReportToken(db, token) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const row = db.prepare(`
    SELECT rl.id, rl.student_user_id, rl.guardian_id, rl.expires_at,
           rl.access_count, g.name AS guardian_name
    FROM report_links rl
    JOIN users u ON u.id = rl.student_user_id
    LEFT JOIN student_guardians g ON g.id = rl.guardian_id
    WHERE rl.token_hash = ?
      AND rl.revoked_at IS NULL
      AND datetime(rl.expires_at) > CURRENT_TIMESTAMP
      AND u.role = 'student'
      AND u.status <> 'deleted'
  `).get(hashToken(token));
  if (!row) return null;

  const report = buildStudentReport(db, Number(row.student_user_id));
  if (!report) return null;

  db.prepare(`
    UPDATE report_links
    SET access_count = access_count + 1, last_accessed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(row.id);

  return {
    ...buildChildData(db, Number(row.student_user_id), report.student.name),
    report,
    link: {
      expiresAt: isoFromSqlite(row.expires_at),
      guardianName: row.guardian_name || null
    }
  };
}

module.exports = {
  RELATIONS,
  MAX_GUARDIANS,
  DEFAULT_EXPIRY_DAYS,
  MAX_EXPIRY_DAYS,
  listGuardians,
  getGuardian,
  replaceGuardians,
  createReportLink,
  listReportLinks,
  revokeReportLink,
  buildStudentReport,
  resolveReportToken,
  buildChildData,
  REPORT_PAGE_PATH,
  reportPageUrl
};