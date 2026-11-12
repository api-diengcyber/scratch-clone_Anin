"use strict";

// ============================================================
// API STREAK & KEHADIRAN MENTORING
//
// Murid (login):
//   GET  /api/streak
//   POST /api/streak/checkin
//   GET  /api/attendance?bulan=YYYY-MM
//   POST /api/attendance { jadwalId }
//   GET  /api/attendance/report?bulan=YYYY-MM
//
// Admin / instruktur:
//   GET  /api/admin/users/:id/attendance?bulan=YYYY-MM   (siswa.kelola)
//   GET  /api/instruktur/attendance?bulan=&q=&page=&urut= (kurikulum.kelola)
//
// Server yang menentukan status absen (WIB), bukan browser:
// absen dibuka 15 menit sebelum mulai dan ditutup saat jam selesai.
// ============================================================

const { isMonth, parseGrades, visibleForGrades } = require("./jadwal-api");
const attendance = require("./attendance-service");

function registerAttendanceApi(app, deps) {
  const { db, auth, sendApiError, sendApiSuccess } = deps;

  // Batas tulis sederhana per akun: 60 permintaan/menit.
  const hits = new Map();
  function writeLimit(req, res, next) {
    const key = String(req.userId);
    const now = Date.now();
    const prev = hits.get(key);
    if (!prev || now - prev.start > 60_000) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    if (prev.count >= 60) {
      return sendApiError(res, 429, "Terlalu banyak permintaan. Coba lagi sebentar.", "RATE_LIMITED");
    }
    prev.count += 1;
    next();
  }
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.start > 60_000) hits.delete(key);
    }
  }, 60_000).unref();

  function monthFrom(req, res) {
    const raw = req.query.bulan === undefined || req.query.bulan === ""
      ? attendance.currentMonth()
      : String(req.query.bulan);
    if (!isMonth(raw)) {
      sendApiError(res, 400, "bulan harus berformat YYYY-MM.", "VALIDATION_ERROR", { field: "bulan" });
      return null;
    }
    return raw;
  }

  function studentRow(userId) {
    return db.prepare("SELECT id, username, full_name, allowed_grades FROM users WHERE id = ? AND role = 'student'")
      .get(userId) || null;
  }

  function requireStudent(req, res) {
    if (req.role !== "student") {
      sendApiError(res, 403, "Endpoint ini khusus murid.", "STUDENT_ONLY");
      return null;
    }
    const user = studentRow(req.userId);
    if (!user) {
      sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
      return null;
    }
    return user;
  }

  function validId(value) {
    const num = Number(value);
    return Number.isSafeInteger(num) && num > 0 ? num : null;
  }

  // ----------------------------------------------------------
  // Streak harian (WIB)
  // ----------------------------------------------------------
  app.get("/api/streak", auth.requireAuth, (req, res) => {
    return sendApiSuccess(res, attendance.readStreak(db, req.userId));
  });

  app.post("/api/streak/checkin", auth.requireAuth, writeLimit, (req, res) => {
    const streak = attendance.claimStreak(db, req.userId);
    return sendApiSuccess(res, streak, streak.today ? "Streak hari ini tercatat." : "Streak hari ini sudah tercatat.");
  });

  // ----------------------------------------------------------
  // Absen sesi mentoring milik murid yang login
  // ----------------------------------------------------------
  app.get("/api/attendance", auth.requireAuth, (req, res) => {
    const month = monthFrom(req, res);
    if (!month) return;
    const rows = db.prepare(`SELECT a.jadwal_id, a.checked_in_at
      FROM mentoring_attendance a
      JOIN mentoring_schedules s ON s.id = a.jadwal_id
      WHERE a.student_user_id = ? AND substr(s.tanggal, 1, 7) = ?
      ORDER BY s.tanggal ASC, s.mulai ASC, s.id ASC`).all(req.userId, month);
    const items = rows.map((row) => ({
      jadwalId: Number(row.jadwal_id),
      checkedInAt: attendance.toIsoUtc(row.checked_in_at)
    }));
    return sendApiSuccess(res, { bulan: month, items, total: items.length });
  });

  app.post("/api/attendance", auth.requireAuth, writeLimit, (req, res) => {
    const user = requireStudent(req, res);
    if (!user) return;

    const body = req.body || {};
    const jadwalId = validId(body.jadwalId);
    if (!jadwalId) {
      return sendApiError(res, 400, "jadwalId wajib berupa angka positif.", "VALIDATION_ERROR", { field: "jadwalId" });
    }

    const schedule = db.prepare("SELECT * FROM mentoring_schedules WHERE id = ?").get(jadwalId);
    if (!schedule) return sendApiError(res, 404, "Jadwal mentoring tidak ditemukan.", "NOT_FOUND");

    const grades = attendance.allowedGrades(user);
    if (!visibleForGrades(parseGrades(schedule.grades), grades)) {
      return sendApiError(res, 404, "Jadwal mentoring tidak ditemukan.", "NOT_FOUND");
    }

    const existing = db.prepare(`SELECT jadwal_id, checked_in_at FROM mentoring_attendance
      WHERE student_user_id = ? AND jadwal_id = ?`).get(req.userId, jadwalId);
    if (existing) {
      return res.status(409).json({
        ok: false,
        code: "ALREADY_CHECKED_IN",
        message: "Kehadiran untuk sesi ini sudah tercatat.",
        item: {
          jadwalId: Number(existing.jadwal_id),
          checkedInAt: attendance.toIsoUtc(existing.checked_in_at)
        }
      });
    }

    const now = Date.now();
    const start = attendance.scheduleStartMs(schedule);
    const end = attendance.scheduleEndMs(schedule);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return sendApiError(res, 400, "Jadwal mentoring tidak memiliki waktu yang sah.", "VALIDATION_ERROR");
    }
    const openAt = start - attendance.ATTENDANCE_OPEN_MIN * 60000;
    if (now < openAt) {
      return sendApiError(
        res,
        403,
        `Absen dibuka ${attendance.ATTENDANCE_OPEN_MIN} menit sebelum kelas mulai.`,
        "ATTENDANCE_NOT_OPEN",
        { opensAt: new Date(openAt).toISOString() }
      );
    }
    if (now > end) {
      return sendApiError(res, 403, "Waktu absen sudah lewat.", "ATTENDANCE_CLOSED", {
        closedAt: new Date(end).toISOString()
      });
    }

    const checkedInAt = new Date(now).toISOString();
    try {
      db.prepare(`INSERT INTO mentoring_attendance (student_user_id, jadwal_id, checked_in_at)
        VALUES (?, ?, ?)`).run(req.userId, jadwalId, checkedInAt);
    } catch (err) {
      if (String(err && err.code).startsWith("SQLITE_CONSTRAINT")) {
        return sendApiError(res, 409, "Kehadiran untuk sesi ini sudah tercatat.", "ALREADY_CHECKED_IN");
      }
      throw err;
    }

    return sendApiSuccess(res, {
      item: { jadwalId, checkedInAt }
    }, "Absen kehadiran tercatat.", 201);
  });

  // ----------------------------------------------------------
  // Rekap murid yang login
  // ----------------------------------------------------------
  app.get("/api/attendance/report", auth.requireAuth, (req, res) => {
    const user = requireStudent(req, res);
    if (!user) return;
    const month = monthFrom(req, res);
    if (!month) return;
    return sendApiSuccess(res, attendance.buildStudentReport(db, user, month));
  });

  // ----------------------------------------------------------
  // Admin: rekap satu murid (read-only). Permission siswa.kelola
  // juga dipasang oleh gate /api/admin di admin-api.js.
  // ----------------------------------------------------------
  app.get("/api/admin/users/:id/attendance", auth.requireAuth, auth.requireStaff,
    auth.requirePermission("siswa.kelola"), (req, res) => {
      const id = validId(req.params.id);
      const user = id ? db.prepare(`SELECT id, username, full_name, allowed_grades, role, status
        FROM users WHERE id = ?`).get(id) : null;
      if (!user || user.role !== "student" || user.status === "deleted") {
        return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
      }
      const month = monthFrom(req, res);
      if (!month) return;
      return sendApiSuccess(res, attendance.buildStudentReport(db, user, month));
    });

  // ----------------------------------------------------------
  // Instruktur / admin: rekap seluruh murid aktif, dipaging di server.
  // ----------------------------------------------------------
  app.get("/api/instruktur/attendance", auth.requireAuth, auth.requireStaff,
    auth.requirePermission("kurikulum.kelola"), (req, res) => {
      const month = monthFrom(req, res);
      if (!month) return;
      const report = attendance.buildStaffReport(db, {
        month,
        q: req.query.q,
        page: req.query.page,
        limit: req.query.limit === undefined ? 10 : req.query.limit,
        urut: req.query.urut
      });
      return sendApiSuccess(res, report);
    });
}

module.exports = { registerAttendanceApi };
