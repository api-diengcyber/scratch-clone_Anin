"use strict";

// ------------------------------------------------------------
// GRADUATION & CERTIFICATE SERVICE
//
// Mengelola proses kelulusan resmi jalur belajar (learning path),
// penguncian snapshot sertifikat, serta verifikasi publik sertifikat digital.
// ------------------------------------------------------------

const lencana = require("./lencana-catalog");
const { notifyStudent } = require("./student-notifications");
const { notifyAdmins } = require("./notifications");

function generateCertificateNo(grade, pathKey, studentId, dateStr = new Date().toISOString()) {
  const year = String(dateStr).slice(0, 4);
  const cleanGrade = String(grade || "DCC").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Ambil bagian kode jalur, misalnya SD|Game Development -> GAMEDEVELOPMENT
  const pathPart = String(pathKey || "GENERAL").split("|").pop().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const idPart = String(Number(studentId) || 0).padStart(4, "0");
  return `DCC/${year}/${cleanGrade}/${pathPart}/${idPart}`;
}

// Mengecek apakah seluruh task wajib pada catalog item sudah diselesaikan siswa
function checkPathTaskCompletion(db, studentId, catalogItem) {
  if (!catalogItem || !Array.isArray(catalogItem.taskIds) || catalogItem.taskIds.length === 0) {
    return { completed: false, done: 0, total: 0 };
  }

  const ids = catalogItem.taskIds;
  const marks = ids.map(() => "?").join(",");
  const row = db.prepare(`
    SELECT COUNT(*) AS done
    FROM progress
    WHERE user_id = ? AND completed = 1 AND task_id IN (${marks})
  `).get(Number(studentId), ...ids);

  const done = Number(row?.done || 0);
  return {
    completed: done === ids.length,
    done,
    total: ids.length
  };
}

// Rekonsiliasi & pendaftaran kelulusan resmi
function recordGraduation(db, {
  studentUserId,
  grade,
  learningPathKey,
  learningPathName,
  examId = null,
  examSubmissionId = null,
  finalScore = 100,
  graduatedAt = new Date().toISOString()
}) {
  const student = db.prepare(`
    SELECT id, username, full_name, role, status
    FROM users
    WHERE id = ? AND role = 'student' AND status <> 'deleted'
  `).get(Number(studentUserId));

  if (!student) return null;

  // Cek apakah sudah pernah lulus jalur ini
  const existing = db.prepare(`
    SELECT * FROM student_graduations
    WHERE student_user_id = ? AND learning_path_key = ?
  `).get(student.id, learningPathKey);

  if (existing) {
    return existing;
  }

  const studentName = String(student.full_name || student.username || "Siswa DCC").trim();
  const certNumber = generateCertificateNo(grade, learningPathKey, student.id, graduatedAt);

  const info = db.prepare(`
    INSERT INTO student_graduations (
      student_user_id, grade, learning_path_key, learning_path_name,
      certificate_number, student_name_snapshot, exam_id, exam_submission_id,
      final_score, graduated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    student.id,
    grade,
    learningPathKey,
    learningPathName,
    certNumber,
    studentName,
    examId,
    examSubmissionId,
    Number(finalScore) || 100,
    graduatedAt
  );

  const created = db.prepare(`
    SELECT * FROM student_graduations WHERE id = ?
  `).get(info.lastInsertRowid);

  // Kirim notifikasi selamat ke siswa
  try {
    notifyStudent(db, student.id, {
      kind: "path.graduated",
      title: "🎉 Selamat! Kamu Telah Lulus!",
      body: `Kamu berhasil menuntaskan seluruh materi & proyek pada jalur "${learningPathName}". Sertifikat digital kamu telah diterbitkan (${certNumber}).`,
      view: "sertifikat",
      icon: "fa-solid fa-graduation-cap",
      tone: "emerald",
      dedupeKey: `grad:${student.id}:${learningPathKey}`
    });

    notifyAdmins(db, {
      kind: "student.graduated",
      title: "Siswa Lulus Jalur Belajar",
      body: `${studentName} telah menyelesaikan jalur "${learningPathName}" dengan nomor sertifikat ${certNumber}.`,
      view: "siswa",
      icon: "fa-solid fa-graduation-cap",
      tone: "emerald",
      dedupeKey: `admin:grad:${student.id}:${learningPathKey}`
    });
  } catch (_) {}

  return created;
}

// Verifikasi publik nomor sertifikat (bisa diakses siapa saja tanpa login)
function verifyCertificate(db, certNumber) {
  const cleanCert = String(certNumber || "").trim().toUpperCase();
  if (!cleanCert) return null;

  const row = db.prepare(`
    SELECT g.*, u.username AS current_username
    FROM student_graduations g
    LEFT JOIN users u ON u.id = g.student_user_id
    WHERE UPPER(g.certificate_number) = ?
  `).get(cleanCert);

  if (!row) return null;

  return {
    valid: true,
    certificateNumber: row.certificate_number,
    studentName: row.student_name_snapshot,
    grade: row.grade,
    learningPath: {
      key: row.learning_path_key,
      name: row.learning_path_name
    },
    finalScore: row.final_score,
    graduatedAt: row.graduated_at,
    issuedBy: "Dieng Cyber Coding (Ruang KKA)"
  };
}

// Menampilkan sertifikat milik siswa tertentu
function listStudentGraduations(db, studentId) {
  const rows = db.prepare(`
    SELECT id, grade, learning_path_key, learning_path_name, certificate_number,
           student_name_snapshot, final_score, graduated_at, created_at
    FROM student_graduations
    WHERE student_user_id = ?
    ORDER BY id DESC
  `).all(Number(studentId));

  return rows.map((r) => ({
    id: r.id,
    grade: r.grade,
    pathKey: r.learning_path_key,
    pathName: r.learning_path_name,
    certificateNumber: r.certificate_number,
    studentName: r.student_name_snapshot,
    finalScore: r.final_score,
    graduatedAt: r.graduated_at
  }));
}

// Memeriksa dan otomatis meluluskan siswa yang telah menyelesaikan seluruh task lencana catalog
function checkAndGraduateEligible(db, studentId) {
  const catalog = lencana.getCatalog();
  const graduations = [];

  for (const item of catalog) {
    const check = checkPathTaskCompletion(db, studentId, item);
    if (check.completed) {
      const grad = recordGraduation(db, {
        studentUserId: studentId,
        grade: item.grade,
        learningPathKey: item.key,
        learningPathName: `${item.title} (${item.grade})`,
        finalScore: 100
      });
      if (grad) graduations.push(grad);
    }
  }

  return graduations;
}

module.exports = {
  generateCertificateNo,
  checkPathTaskCompletion,
  recordGraduation,
  verifyCertificate,
  listStudentGraduations,
  checkAndGraduateEligible
};
