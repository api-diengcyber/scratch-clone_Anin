"use strict";

// Migrasi untuk tabel log pengiriman pengingat jadwal mentoring Zoom.
// Menggunakan UNIQUE constraint (jadwal_id, recipient_email, reminder_window)
// sebagai pengaman agar pengingat tidak pernah terkirim dobel.
module.exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mentoring_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jadwal_id INTEGER NOT NULL,
      student_user_id INTEGER,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT,
      recipient_role TEXT NOT NULL DEFAULT 'student' CHECK (recipient_role IN ('student', 'guardian')),
      reminder_window TEXT NOT NULL DEFAULT '30m',
      status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
      last_error TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(jadwal_id) REFERENCES mentoring_schedules(id) ON DELETE CASCADE,
      FOREIGN KEY(student_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_mentoring_reminders_dedupe
      ON mentoring_reminders(jadwal_id, recipient_email COLLATE NOCASE, reminder_window);

    CREATE INDEX IF NOT EXISTS idx_mentoring_reminders_schedule
      ON mentoring_reminders(jadwal_id);
  `);
};
