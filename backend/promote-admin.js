"use strict";
const db = require("./database");

// Promosikan akun yang SUDAH ada menjadi admin tanpa membuat akun baru
// dan tanpa mengubah password. Idempoten: aman dijalankan berulang kali.
//
// Pemakaian:
//   node promote-admin.js admin@diengcyber.local
//   node promote-admin.js admin
//   npm run promote-admin -- admin@diengcyber.local

const identifier = String(process.argv[2] || "").trim();

function printUsage() {
  console.error("Pemakaian: node promote-admin.js <email-atau-username>");
}

try {
  if (!identifier) {
    printUsage();
    process.exitCode = 1;
  } else {
    const user = db.prepare(`
      SELECT id, username, email, role, status,
             CASE WHEN password_hash IS NULL OR password_hash = '' THEN 0 ELSE 1 END AS has_password
      FROM users
      WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE
      LIMIT 1
    `).get(identifier, identifier);

    if (!user) {
      console.error(`Akun "${identifier}" tidak ditemukan di database ini.`);
      console.error("Kalau akunnya belum ada, buat baru dengan: npm run create-admin");
      process.exitCode = 1;
    } else {
      if (user.role === "admin" && user.status === "active") {
        console.log(`Tidak ada perubahan: users.id=${user.id} (${user.username}) sudah admin dan active.`);
      } else {
        const result = db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
        if (result.changes === 1) {
          db.prepare(`
            INSERT INTO admin_audit (actor_user_id,actor_username,action,target_type,target_id,details)
            VALUES (?,?,?,?,?,?)
          `).run(
            user.id,
            user.username,
            "admin.promoted.cli",
            "user",
            String(user.id),
            JSON.stringify({ role: "admin", previousRole: user.role })
          );
        }
        console.log(`Berhasil: users.id=${user.id} (${user.username}) sekarang role=admin.`);
      }

      if (user.status !== "active") {
        console.warn(`Peringatan: status akun masih "${user.status}", jadi login tetap ditolak.`);
        console.warn("Aktifkan dulu lewat UI admin atau ubah status di database.");
      }
      if (!user.has_password) {
        console.warn("Peringatan: akun ini belum punya password.");
        console.warn("Login lewat Firebase dulu, atau buat akun baru dengan: npm run create-admin");
      }
      console.log("Password tidak diubah. Restart backend lalu login di jendela incognito.");
      process.exitCode = 0;
    }
  }
} catch (err) {
  console.error("Gagal mempromosikan admin:", err.message);
  process.exitCode = 1;
} finally {
  db.close();
}
