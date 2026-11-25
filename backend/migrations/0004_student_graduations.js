"use strict";

// Migrasi untuk tabel student_graduations (pencatatan resmi kelulusan jalur & sertifikat digital).
// Mengunci snapshot nama siswa, tanggal lulus, nilai ujian proyek, dan nomor sertifikat unik
// agar tidak terpengaruh jika kurikulum diubah di masa depan.
module.exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_graduations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_user_id INTEGER NOT NULL,
      grade TEXT NOT NULL CHECK (grade IN ('SD', 'SMP', 'SMK')),
      learning_path_key TEXT NOT NULL,
      learning_path_name TEXT NOT NULL,
      certificate_number TEXT NOT NULL UNIQUE,
      student_name_snapshot TEXT NOT NULL,
      exam_id INTEGER,
      exam_submission_id INTEGER,
      final_score INTEGER NOT NULL DEFAULT 100,
      graduated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_user_id, learning_path_key),
      FOREIGN KEY(student_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(exam_id) REFERENCES instruktur_exams(id) ON DELETE SET NULL,
      FOREIGN KEY(exam_submission_id) REFERENCES instruktur_exam_submissions(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_student_graduations_student
      ON student_graduations(student_user_id, id DESC);

    CREATE INDEX IF NOT EXISTS idx_student_graduations_cert
      ON student_graduations(certificate_number);
  `);
};
