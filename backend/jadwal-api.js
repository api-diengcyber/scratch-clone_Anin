"use strict";

// ============================================================
// JADWAL MENTORING
//
// Sumber data halaman "Jadwal Saya" (murid) dan endpoint admin untuk
// membuat/mengubah jadwal Zoom. Tanggal & jam disimpan apa adanya sebagai
// waktu lokal WIB (YYYY-MM-DD dan HH:MM), sama seperti yang dikirim frontend.
//
// Endpoint murid:
//   GET /api/jadwal?bulan=YYYY-MM
// Endpoint admin (permission kurikulum.kelola):
//   GET    /api/admin/jadwal?bulan=YYYY-MM
//   POST   /api/admin/jadwal
//   PATCH  /api/admin/jadwal/:id
//   DELETE /api/admin/jadwal/:id
// ============================================================

const GRADES = ["SD", "SMP", "SMK"];
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const JAKARTA_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function pad2(value) {
  return String(value).padStart(2, "0");
}

function jakartaToday() {
  const parts = {};
  for (const part of JAKARTA_DATE.formatToParts(new Date())) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function currentMonth() {
  return jakartaToday().slice(0, 7);
}

function isMonth(value) {
  return typeof value === "string" && MONTH_RE.test(value);
}

function isValidDateOnly(value) {
  if (typeof value !== "string") return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isTime(value) {
  return typeof value === "string" && TIME_RE.test(value);
}

function invalid(message, field) {
  const err = new Error(message);
  err.code = "JADWAL_INVALID";
  err.field = field || null;
  throw err;
}

function cleanText(value, field, max, required = false) {
  if (value === undefined || value === null) {
    if (required) invalid(`${field} wajib diisi.`, field);
    return "";
  }
  if (typeof value !== "string") invalid(`${field} harus berupa teks.`, field);
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (required && !text) invalid(`${field} wajib diisi.`, field);
  if (text.length > max) invalid(`${field} maksimal ${max} karakter.`, field);
  return text;
}

function cleanGrades(value) {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  const out = [];
  for (const raw of list) {
    const grade = String(raw || "").trim().toUpperCase();
    if (!GRADES.includes(grade)) {
      invalid("grades hanya boleh berisi SD, SMP, atau SMK.", "grades");
    }
    if (!out.includes(grade)) out.push(grade);
  }
  return out;
}

function cleanZoomUrl(value) {
  const text = cleanText(value, "zoomUrl", 500);
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch (_) {
    invalid("zoomUrl harus berupa URL https yang sah.", "zoomUrl");
  }
  if (url.protocol !== "https:") {
    invalid("zoomUrl harus memakai https.", "zoomUrl");
  }
  if (url.username || url.password) {
    invalid("zoomUrl tidak boleh memuat kredensial.", "zoomUrl");
  }
  return url.href;
}

function normalizeSchedule(body, options = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid("Body jadwal harus berupa objek.", "body");
  }
  const partial = Boolean(options.partial);
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  const judul = has("judul")
    ? cleanText(body.judul, "judul", 120, true)
    : (partial ? undefined : invalid("judul wajib diisi.", "judul"));

  const tanggal = has("tanggal")
    ? String(body.tanggal || "").trim()
    : (partial ? undefined : invalid("tanggal wajib diisi.", "tanggal"));
  if (tanggal !== undefined && !isValidDateOnly(tanggal)) {
    invalid("tanggal harus tanggal sah YYYY-MM-DD.", "tanggal");
  }

  const mulai = has("mulai")
    ? String(body.mulai || "").trim()
    : (partial ? undefined : invalid("mulai wajib diisi.", "mulai"));
  if (mulai !== undefined && !isTime(mulai)) {
    invalid("mulai harus jam sah HH:MM.", "mulai");
  }

  const selesai = has("selesai")
    ? String(body.selesai || "").trim()
    : (partial ? undefined : invalid("selesai wajib diisi.", "selesai"));
  if (selesai !== undefined && !isTime(selesai)) {
    invalid("selesai harus jam sah HH:MM.", "selesai");
  }

  if (tanggal !== undefined && mulai !== undefined && selesai !== undefined) {
    if (selesai <= mulai) invalid("selesai harus lebih lambat dari mulai.", "selesai");
  }

  const jenis = has("jenis")
    ? (cleanText(body.jenis, "jenis", 60) || "Live Mentoring")
    : (partial ? undefined : "Live Mentoring");
  const level = has("level") ? cleanText(body.level, "level", 80) : (partial ? undefined : "");
  const mentor = has("mentor") ? cleanText(body.mentor, "mentor", 80) : (partial ? undefined : "");
  const keterangan = has("keterangan") ? cleanText(body.keterangan, "keterangan", 500) : (partial ? undefined : "");
  const meetingId = has("meetingId") ? cleanText(body.meetingId, "meetingId", 80) : (partial ? undefined : "");
  const passcode = has("passcode") ? cleanText(body.passcode, "passcode", 80) : (partial ? undefined : "");
  const zoomUrl = has("zoomUrl") ? cleanZoomUrl(body.zoomUrl) : (partial ? undefined : null);
  const grades = has("grades") || has("grade")
    ? cleanGrades(has("grades") ? body.grades : body.grade)
    : (partial ? undefined : []);

  return {
    judul,
    jenis,
    level,
    mentor,
    keterangan,
    tanggal,
    mulai,
    selesai,
    zoomUrl,
    meetingId,
    passcode,
    grades
  };
}

function parseGrades(raw) {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((grade) => GRADES.includes(grade)) : [];
  } catch (_) {
    return [];
  }
}

function scheduleDto(row) {
  return {
    id: Number(row.id),
    judul: row.judul,
    jenis: row.jenis || "",
    level: row.level || "",
    mentor: row.mentor || "",
    keterangan: row.keterangan || "",
    tanggal: row.tanggal,
    mulai: row.mulai,
    selesai: row.selesai,
    zoomUrl: row.zoom_url || "",
    meetingId: row.meeting_id || "",
    passcode: row.passcode || "",
    grades: parseGrades(row.grades),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function visibleForGrades(scheduleGrades, allowedGrades) {
  if (!scheduleGrades.length) return true;
  if (!allowedGrades.length) return true;
  return scheduleGrades.some((grade) => allowedGrades.includes(grade));
}

function readStudentGrades(db, userId) {
  const row = db.prepare("SELECT allowed_grades FROM users WHERE id = ?").get(userId);
  if (!row || !row.allowed_grades) return [];
  try {
    const value = JSON.parse(row.allowed_grades);
    return Array.isArray(value) ? value.map((grade) => String(grade).toUpperCase()) : [];
  } catch (_) {
    return [];
  }
}

function findRow(db, id) {
  const num = Number(id);
  if (!Number.isSafeInteger(num) || num < 1) return null;
  return db.prepare("SELECT * FROM mentoring_schedules WHERE id = ?").get(num) || null;
}

function registerJadwalApi(app, deps) {
  const { db, auth, sendApiError, sendApiSuccess } = deps;

  function validationResponse(res, err) {
    return sendApiError(res, 400, err.message, "VALIDATION_ERROR", err.field ? { field: err.field } : undefined);
  }

  function dataResponse(res, fn) {
    try {
      return fn();
    } catch (err) {
      if (err && err.code === "JADWAL_INVALID") return validationResponse(res, err);
      throw err;
    }
  }

  function audit(req, action, id, details) {
    db.prepare(`INSERT INTO admin_audit (actor_user_id, actor_username, action, target_type, target_id, details, ip)
      VALUES (?, ?, ?, 'mentoring_schedule', ?, ?, ?)`).run(
      req.userId,
      req.user || "unknown",
      action,
      String(id),
      JSON.stringify(details || {}),
      req.ip || null
    );
  }

  const adminGuard = [
    auth.requireAuth,
    auth.requireStaff,
    auth.requirePermission("kurikulum.kelola")
  ];

  // ----------------------------------------------------------
  // Murid / pengguna login: jadwal bulanan.
  // ----------------------------------------------------------
  app.get("/api/jadwal", auth.requireAuth, (req, res) => {
    const month = req.query.bulan === undefined || req.query.bulan === ""
      ? currentMonth()
      : String(req.query.bulan);
    if (!isMonth(month)) {
      return sendApiError(res, 400, "bulan harus berformat YYYY-MM.", "VALIDATION_ERROR", { field: "bulan" });
    }

    const rows = db.prepare(`SELECT * FROM mentoring_schedules
      WHERE tanggal LIKE ? ORDER BY tanggal ASC, mulai ASC, id ASC`).all(`${month}-%`);

    let list = rows.map(scheduleDto);
    if (req.role === "student") {
      const allowed = readStudentGrades(db, req.userId);
      list = list.filter((item) => visibleForGrades(item.grades, allowed));
    }

    return sendApiSuccess(res, { jadwal: list, bulan: month });
  });

  // ----------------------------------------------------------
  // Admin / instruktur: kelola jadwal.
  // ----------------------------------------------------------
  app.get("/api/admin/jadwal", adminGuard, (req, res) => {
    const month = req.query.bulan === undefined || req.query.bulan === ""
      ? ""
      : String(req.query.bulan);
    if (month && !isMonth(month)) {
      return sendApiError(res, 400, "bulan harus berformat YYYY-MM.", "VALIDATION_ERROR", { field: "bulan" });
    }
    const limit = Math.max(1, Math.min(500, Number.parseInt(req.query.limit, 10) || 200));
    const rows = month
      ? db.prepare(`SELECT * FROM mentoring_schedules WHERE tanggal LIKE ?
          ORDER BY tanggal ASC, mulai ASC, id ASC LIMIT ?`).all(`${month}-%`, limit)
      : db.prepare(`SELECT * FROM mentoring_schedules
          ORDER BY tanggal DESC, mulai DESC, id DESC LIMIT ?`).all(limit);
    return sendApiSuccess(res, { items: rows.map(scheduleDto), total: rows.length, bulan: month || null });
  });

  app.post("/api/admin/jadwal", adminGuard, (req, res) => dataResponse(res, () => {
    const item = normalizeSchedule(req.body || {});
    const info = db.prepare(`INSERT INTO mentoring_schedules
      (judul, jenis, level, mentor, keterangan, tanggal, mulai, selesai,
       zoom_url, meeting_id, passcode, grades, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      item.judul,
      item.jenis,
      item.level || null,
      item.mentor || null,
      item.keterangan || null,
      item.tanggal,
      item.mulai,
      item.selesai,
      item.zoomUrl,
      item.meetingId || null,
      item.passcode || null,
      JSON.stringify(item.grades),
      req.userId
    );
    const id = Number(info.lastInsertRowid);
    audit(req, "jadwal.create", id, {
      judul: item.judul,
      tanggal: item.tanggal,
      mulai: item.mulai,
      grades: item.grades
    });
    return sendApiSuccess(res, { item: scheduleDto(findRow(db, id)) }, "Jadwal dibuat.", 201);
  }));

  app.patch("/api/admin/jadwal/:id", adminGuard, (req, res) => dataResponse(res, () => {
    const current = findRow(db, req.params.id);
    if (!current) return sendApiError(res, 404, "Jadwal tidak ditemukan.", "NOT_FOUND");
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return sendApiError(res, 400, "Body jadwal harus berupa objek.", "VALIDATION_ERROR", { field: "body" });
    }
    const merged = normalizeSchedule({ ...scheduleDto(current), ...body }, { partial: true });
    const next = { ...scheduleDto(current), ...merged };
    if (next.selesai <= next.mulai) {
      return sendApiError(res, 400, "selesai harus lebih lambat dari mulai.", "VALIDATION_ERROR", { field: "selesai" });
    }
    db.prepare(`UPDATE mentoring_schedules SET judul=?, jenis=?, level=?, mentor=?, keterangan=?,
      tanggal=?, mulai=?, selesai=?, zoom_url=?, meeting_id=?, passcode=?, grades=?,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      next.judul,
      next.jenis || "Live Mentoring",
      next.level || null,
      next.mentor || null,
      next.keterangan || null,
      next.tanggal,
      next.mulai,
      next.selesai,
      next.zoomUrl || null,
      next.meetingId || null,
      next.passcode || null,
      JSON.stringify(next.grades || []),
      current.id
    );
    audit(req, "jadwal.update", current.id, {
      judul: next.judul,
      tanggal: next.tanggal,
      mulai: next.mulai,
      fields: Object.keys(body)
    });
    return sendApiSuccess(res, { item: scheduleDto(findRow(db, current.id)) }, "Jadwal diperbarui.");
  }));

  app.delete("/api/admin/jadwal/:id", adminGuard, (req, res) => {
    const current = findRow(db, req.params.id);
    if (!current) return sendApiError(res, 404, "Jadwal tidak ditemukan.", "NOT_FOUND");
    db.prepare("DELETE FROM mentoring_schedules WHERE id = ?").run(current.id);
    audit(req, "jadwal.delete", current.id, {
      judul: current.judul,
      tanggal: current.tanggal,
      mulai: current.mulai
    });
    return sendApiSuccess(res, { id: current.id }, "Jadwal dihapus.");
  });
}

module.exports = {
  GRADES,
  registerJadwalApi,
  isValidDateOnly,
  isTime,
  isMonth,
  normalizeSchedule,
  scheduleDto,
  visibleForGrades
};
