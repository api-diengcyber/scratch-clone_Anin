"use strict";

// ------------------------------------------------------------
// NOTIFIKASI SISWA
//
// Notifikasi per siswa (bukan per admin) untuk kejadian yang menyangkut
// dirinya sendiri, saat ini: tugas dinilai dan permintaan revisi.
// `dedupe_key` mencegah kejadian yang sama masuk dua kali.
// ------------------------------------------------------------

const MAX_TITLE = 200;
const MAX_BODY = 500;
const MAX_KIND = 60;
const MAX_VIEW = 40;
const MAX_ICON = 80;
const MAX_TONE = 20;
const MAX_DEDUPE = 200;

function safeText(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

function notifyStudent(db, userId, payload = {}) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id < 1) return 0;

  const kind = safeText(payload.kind, MAX_KIND);
  const title = safeText(payload.title, MAX_TITLE);
  if (!kind || !title) return 0;

  const student = db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'student' AND status <> 'deleted'").get(id);
  if (!student) return 0;

  const body = safeText(payload.body, MAX_BODY);
  const view = safeText(payload.view, MAX_VIEW) || "tugas";
  const icon = safeText(payload.icon, MAX_ICON) || "fa-solid fa-bell";
  const tone = safeText(payload.tone, MAX_TONE) || "sky";
  const dedupeKey = safeText(payload.dedupeKey, MAX_DEDUPE) || null;

  const info = db.prepare(`
    INSERT OR IGNORE INTO student_notifications
      (user_id, kind, title, body, view, icon, tone, dedupe_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, kind, title, body, view, icon, tone, dedupeKey);

  return info.changes === 1 ? 1 : 0;
}

function toItem(row) {
  return {
    id: Number(row.id),
    kind: row.kind,
    title: row.title,
    body: row.body || "",
    view: row.view || "tugas",
    icon: row.icon || "fa-solid fa-bell",
    tone: row.tone || "sky",
    read: Boolean(row.read_at),
    readAt: row.read_at || null,
    createdAt: row.created_at || null
  };
}

function listStudentNotifications(db, userId, options = {}) {
  const limit = Math.max(1, Math.min(100, Number.parseInt(options.limit, 10) || 20));
  const rows = db.prepare(`
    SELECT id, kind, title, body, view, icon, tone, read_at, created_at
    FROM student_notifications
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(userId, limit);
  return rows.map(toItem);
}

function unreadCount(db, userId) {
  return Number(db.prepare(
    "SELECT COUNT(*) AS n FROM student_notifications WHERE user_id = ? AND read_at IS NULL"
  ).get(userId).n || 0);
}

function markRead(db, userId, notificationId) {
  const id = Number(notificationId);
  if (!Number.isSafeInteger(id) || id < 1) return { found: false, changed: false };
  const result = db.prepare(
    "UPDATE student_notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND read_at IS NULL"
  ).run(id, userId);
  if (result.changes > 0) return { found: true, changed: true };
  const exists = db.prepare("SELECT 1 FROM student_notifications WHERE id = ? AND user_id = ?").get(id, userId);
  return { found: Boolean(exists), changed: false };
}

function markAllRead(db, userId) {
  return db.prepare(
    "UPDATE student_notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL"
  ).run(userId).changes;
}

function registerStudentNotificationApi(app, deps) {
  const { db, auth, sendApiError, sendApiSuccess } = deps;

  function requireStudent(req, res, next) {
    if (req.role !== "student") {
      return sendApiError(res, 403, "Endpoint ini khusus akun siswa.", "STUDENT_REQUIRED");
    }
    next();
  }

  app.get("/api/notifications", auth.requireAuth, requireStudent, (req, res) => {
    const notifications = listStudentNotifications(db, req.userId, { limit: req.query.limit });
    return sendApiSuccess(res, {
      notifications,
      unreadCount: unreadCount(db, req.userId)
    });
  });

  app.post("/api/notifications/read-all", auth.requireAuth, requireStudent, (req, res) => {
    const updated = markAllRead(db, req.userId);
    return sendApiSuccess(res, { updated, unreadCount: 0 }, "Semua notifikasi ditandai sudah dibaca.");
  });

  app.post("/api/notifications/:id/read", auth.requireAuth, requireStudent, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return sendApiError(res, 400, "ID notifikasi tidak valid.", "VALIDATION_ERROR");
    }
    const result = markRead(db, req.userId, id);
    if (!result.found) {
      return sendApiError(res, 404, "Notifikasi tidak ditemukan.", "NOT_FOUND");
    }
    return sendApiSuccess(res, {
      id,
      read: true,
      unreadCount: unreadCount(db, req.userId)
    }, "Notifikasi ditandai sudah dibaca.");
  });
}

module.exports = {
  notifyStudent,
  listStudentNotifications,
  unreadCount,
  markRead,
  markAllRead,
  registerStudentNotificationApi
};
