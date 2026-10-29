"use strict";

// Notifikasi admin disimpan per akun admin. Helper ini dipakai route admin
// dan route murid (misalnya saat task selesai) tanpa harus menduplikasi SQL.
function safeText(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

function notifyAdmins(db, payload = {}) {
  const kind = safeText(payload.kind, 60);
  const title = safeText(payload.title, 200);
  if (!kind || !title) return 0;
  const body = safeText(payload.body, 500);
  const view = safeText(payload.view, 40) || "dashboard";
  const icon = safeText(payload.icon, 80) || "fa-solid fa-bell";
  const tone = safeText(payload.tone, 20) || "sky";
  const dedupeKey = safeText(payload.dedupeKey, 200) || null;

  try {
    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active'").all();
    if (!admins.length) return 0;

    const insert = db.prepare(`
      INSERT OR IGNORE INTO admin_notifications
        (user_id, kind, title, body, view, icon, tone, dedupe_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let inserted = 0;
    const tx = db.transaction(() => {
      for (const admin of admins) {
        inserted += insert.run(admin.id, kind, title, body, view, icon, tone, dedupeKey).changes;
      }
    });
    tx();
    return inserted;
  } catch (error) {
    // Notifikasi bersifat non-kritis: jangan gagalkan aksi utama hanya karena ini.
    console.error("Gagal membuat notifikasi admin:", error.message);
    return 0;
  }
}

module.exports = { notifyAdmins };
