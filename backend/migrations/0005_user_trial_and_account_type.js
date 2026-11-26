"use strict";

// Migrasi untuk metadata profil siswa (trial track, phone, parent name, account type).
module.exports.up = (db) => {
  // Tambah kolom ke tabel users jika belum ada
  const columns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);

  if (!columns.includes("trial_track_id")) {
    db.exec("ALTER TABLE users ADD COLUMN trial_track_id TEXT;");
  }
  if (!columns.includes("trial_course")) {
    db.exec("ALTER TABLE users ADD COLUMN trial_course TEXT;");
  }
  if (!columns.includes("trial_registered_at")) {
    db.exec("ALTER TABLE users ADD COLUMN trial_registered_at DATETIME;");
  }
  if (!columns.includes("parent_name")) {
    db.exec("ALTER TABLE users ADD COLUMN parent_name TEXT;");
  }
  if (!columns.includes("account_type")) {
    db.exec("ALTER TABLE users ADD COLUMN account_type TEXT DEFAULT 'free' CHECK (account_type IN ('free', 'trial', 'paid_subscription'));");
  }
};
