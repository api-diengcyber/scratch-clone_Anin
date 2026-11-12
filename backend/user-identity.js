"use strict";

// ------------------------------------------------------------
// IDENTITAS AKUN YANG SUDAH DIHAPUS
//
// Hapus pengguna di Admin bersifat soft delete (`users.status = 'deleted'`)
// supaya histori poin, progres, dan audit tetap utuh. Konsekuensinya, baris
// lama masih memegang email dan unique index `idx_users_email_unique` akan
// menolak email tersebut dipakai akun baru.
//
// Helper ini melepas email dari baris yang sudah dihapus tepat saat email itu
// dipakai lagi, sehingga admin atau pendaftar baru tidak menemui
// "Email sudah digunakan" padahal akun pemiliknya sudah tidak ada.
// ------------------------------------------------------------

function releaseDeletedEmail(db, email) {
  if (!email || typeof email !== "string") return 0;
  const clean = email.trim();
  if (!clean) return 0;
  const info = db.prepare(
    "UPDATE users SET email = NULL WHERE email = ? COLLATE NOCASE AND status = 'deleted'"
  ).run(clean);
  return Number(info.changes) || 0;
}

module.exports = { releaseDeletedEmail };
