"use strict";

// ============================================================
// API PORTAL INSTRUKTUR
//
// Portal /instruktur sebelumnya bekerja dalam "Mode contoh": semua data
// disimpan di localStorage karena endpoint di bawah ini belum ada. Modul ini
// menyediakan sumber data server untuk tiga menu portal tersebut:
//
//   GET    /api/instruktur/me
//   GET    /api/instruktur/tugas            (daftar)
//   POST   /api/instruktur/tugas
//   PATCH  /api/instruktur/tugas/:id
//   DELETE /api/instruktur/tugas/:id
//   GET    /api/instruktur/ujian
//   POST   /api/instruktur/ujian
//   PATCH  /api/instruktur/ujian/:id
//   DELETE /api/instruktur/ujian/:id
//   GET    /api/instruktur/jadwal
//   POST   /api/instruktur/jadwal
//   PATCH  /api/instruktur/jadwal/:id
//   DELETE /api/instruktur/jadwal/:id
//
// Endpoint baca untuk murid (hanya data berstatus terbit):
//   GET /api/tugas-tambahan?grade=SD|SMP|SMK
//   GET /api/ujian-kelulusan?grade=SD|SMP|SMK
//
// Cakupan data: instruktur hanya mengelola baris miliknya (owner_user_id /
// jadwal.created_by). Admin melihat dan mengelola semua baris. Jadwal memakai
// tabel `mentoring_schedules` yang sama dengan halaman "Jadwal Saya" murid.
// ============================================================

const { normalizeSchedule, scheduleDto, isMonth } = require("./jadwal-api");

const GRADES = ["SD", "SMP", "SMK"];
const TASK_TYPES = ["kode", "blok", "kuis", "proyek"];
const EXAM_FORMATS = ["proyek", "tes"];
const STATUSES = ["draft", "terbit", "ditutup"];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const JAKARTA_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function jakartaToday() {
  const parts = {};
  for (const part of JAKARTA_DATE.formatToParts(new Date())) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function invalid(message, field) {
  const err = new Error(message);
  err.code = "INSTRUKTUR_INVALID";
  err.field = field || null;
  throw err;
}

// Menghapus karakter kontrol tetapi mempertahankan tab, newline, dan CR
// supaya instruksi tugas/ujian tetap bisa berparagraf.
function text(value, field, max, required = false) {
  if (value === undefined || value === null) {
    if (required) invalid(`${field} wajib diisi.`, field);
    return "";
  }
  if (typeof value !== "string") invalid(`${field} harus berupa teks.`, field);
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (required && !clean) invalid(`${field} wajib diisi.`, field);
  if (clean.length > max) invalid(`${field} maksimal ${max} karakter.`, field);
  return clean;
}

function dateOnly(value, field) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const match = DATE_RE.exec(raw);
  if (!match) invalid(`${field} harus tanggal YYYY-MM-DD.`, field);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100) invalid(`${field} di luar rentang yang didukung.`, field);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    invalid(`${field} bukan tanggal yang sah.`, field);
  }
  return raw;
}

function integer(value, field, min, max, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || !Number.isSafeInteger(num)) {
    invalid(`${field} harus bilangan bulat.`, field);
  }
  if (num < min || num > max) invalid(`${field} harus ${min}-${max}.`, field);
  return num;
}

function oneOf(value, field, allowed, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  if (!allowed.includes(clean)) invalid(`${field} harus salah satu dari: ${allowed.join(", ")}.`, field);
  return clean;
}

function gradeOf(value, field = "grade") {
  const clean = String(value == null ? "" : value).trim().toUpperCase();
  if (!GRADES.includes(clean)) invalid(`${field} harus SD, SMP, atau SMK.`, field);
  return clean;
}

function parseRowId(value) {
  const num = Number(value);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

// ------------------------------------------------------------
// Bentuk data yang dikirim ke frontend
// ------------------------------------------------------------

function taskDto(row) {
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description || "",
    grade: row.grade,
    type: row.type || "kode",
    points: Number(row.points) || 0,
    due: row.due || "",
    status: row.status || "draft",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function examDto(row, results) {
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description || "",
    grade: row.grade,
    format: row.format || "proyek",
    kkm: Number(row.kkm) || 0,
    durasi: Number(row.durasi) || 0,
    buka: row.buka || "",
    tutup: row.tutup || "",
    status: row.status || "draft",
    hasil: (results || []).map((r) => ({
      id: Number(r.id),
      nama: r.student_name,
      nilai: Number(r.score)
    })),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

// ------------------------------------------------------------
// Validasi body
// ------------------------------------------------------------

function normalizeTask(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid("Body tugas harus berupa objek.", "body");
  }
  return {
    title: text(body.title, "title", 200, true),
    description: text(body.description, "description", 1000),
    grade: gradeOf(body.grade),
    type: oneOf(body.type, "type", TASK_TYPES, "kode"),
    points: integer(body.points, "points", 0, 1000, 0),
    due: dateOnly(body.due, "due"),
    status: oneOf(body.status, "status", STATUSES, "draft")
  };
}

function normalizeResults(value) {
  if (!Array.isArray(value)) invalid("hasil harus berupa array peserta.", "hasil");
  if (value.length > 500) invalid("hasil maksimal 500 peserta.", "hasil");
  const out = [];
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (row === null || row === undefined) continue;
    if (typeof row !== "object" || Array.isArray(row)) {
      invalid(`hasil[${i}] harus berupa objek { nama, nilai }.`, "hasil");
    }
    const nama = String(row.nama === undefined || row.nama === null ? "" : row.nama).trim();
    const nilaiRaw = row.nilai === undefined || row.nilai === null ? "" : row.nilai;
    // Baris kosong dari tabel penilaian diabaikan, bukan ditolak.
    if (!nama && (nilaiRaw === "" || nilaiRaw === undefined)) continue;
    if (!nama) invalid(`hasil[${i}].nama wajib diisi.`, "hasil");
    if (nama.length > 100) invalid(`hasil[${i}].nama maksimal 100 karakter.`, "hasil");
    const nilai = integer(nilaiRaw, `hasil[${i}].nilai`, 0, 100, null);
    if (nilai === null) invalid(`hasil[${i}].nilai wajib diisi 0-100.`, "hasil");
    out.push({ nama, nilai });
  }
  return out;
}

function normalizeExam(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid("Body ujian harus berupa objek.", "body");
  }
  const item = {
    title: text(body.title, "title", 200, true),
    description: text(body.description, "description", 1000),
    grade: gradeOf(body.grade),
    format: oneOf(body.format, "format", EXAM_FORMATS, "proyek"),
    kkm: integer(body.kkm, "kkm", 0, 100, 75),
    durasi: integer(body.durasi, "durasi", 0, 600, 0),
    buka: dateOnly(body.buka, "buka"),
    tutup: dateOnly(body.tutup, "tutup"),
    status: oneOf(body.status, "status", STATUSES, "draft")
  };
  if (item.buka && item.tutup && item.tutup < item.buka) {
    invalid("tutup harus setelah buka.", "tutup");
  }
  if (body.hasil !== undefined) item.hasil = normalizeResults(body.hasil);
  return item;
}

// ------------------------------------------------------------
// Registrasi route
// ------------------------------------------------------------

function registerInstrukturApi(app, deps) {
  const { db, auth, sendApiError, sendApiSuccess } = deps;

  function validationResponse(res, err) {
    return sendApiError(res, 400, err.message, "VALIDATION_ERROR", err.field ? { field: err.field } : undefined);
  }

  function guard(res, fn) {
    try {
      return fn();
    } catch (err) {
      if (err && err.code === "INSTRUKTUR_INVALID") return validationResponse(res, err);
      throw err;
    }
  }

  function audit(req, action, targetType, id, details) {
    db.prepare(`INSERT INTO admin_audit (actor_user_id, actor_username, action, target_type, target_id, details, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      req.userId,
      req.user || "unknown",
      action,
      targetType,
      String(id),
      JSON.stringify(details || {}),
      req.ip || null
    );
  }

  // Batas sederhana untuk endpoint tulis: 60 permintaan/menit per akun.
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

  const taskGuard = [auth.requireAuth, auth.requireStaff, auth.requirePermission("tugas.kelola")];
  const examGuard = [auth.requireAuth, auth.requireStaff, auth.requirePermission("tugas.nilai")];
  const jadwalGuard = [auth.requireAuth, auth.requireStaff, auth.requirePermission("kurikulum.kelola")];

  function canSeeAll(req) {
    return req.role === "admin";
  }

  function ownedWhere(req) {
    return canSeeAll(req) ? "" : " WHERE owner_user_id = ?";
  }

  function ownedParams(req) {
    return canSeeAll(req) ? [] : [req.userId];
  }

  function findTask(req, id) {
    const rowId = parseRowId(id);
    if (!rowId) return null;
    const row = db.prepare("SELECT * FROM instruktur_tasks WHERE id = ?").get(rowId);
    if (!row) return null;
    if (!canSeeAll(req) && Number(row.owner_user_id) !== Number(req.userId)) return null;
    return row;
  }

  function findExam(req, id) {
    const rowId = parseRowId(id);
    if (!rowId) return null;
    const row = db.prepare("SELECT * FROM instruktur_exams WHERE id = ?").get(rowId);
    if (!row) return null;
    if (!canSeeAll(req) && Number(row.owner_user_id) !== Number(req.userId)) return null;
    return row;
  }

  function findSchedule(req, id) {
    const rowId = parseRowId(id);
    if (!rowId) return null;
    const row = db.prepare("SELECT * FROM mentoring_schedules WHERE id = ?").get(rowId);
    if (!row) return null;
    if (!canSeeAll(req) && Number(row.created_by) !== Number(req.userId)) return null;
    return row;
  }

  function resultsFor(examId) {
    return db.prepare("SELECT id, student_name, score FROM instruktur_exam_results WHERE exam_id = ? ORDER BY id ASC")
      .all(examId);
  }

  function replaceResults(examId, results) {
    const del = db.prepare("DELETE FROM instruktur_exam_results WHERE exam_id = ?");
    const ins = db.prepare("INSERT INTO instruktur_exam_results (exam_id, student_name, score) VALUES (?, ?, ?)");
    const run = db.transaction(() => {
      del.run(examId);
      for (const row of results) ins.run(examId, row.nama, row.nilai);
    });
    run();
  }

  // ----------------------------------------------------------
  // Identitas
  // ----------------------------------------------------------
  app.get("/api/instruktur/me", auth.requireAuth, (req, res) => {
    const row = db.prepare("SELECT username, full_name, role, allowed_grades FROM users WHERE id = ?").get(req.userId);
    if (!row) return sendApiError(res, 404, "Akun tidak ditemukan.", "NOT_FOUND");
    const name = String(row.full_name || "").trim() || row.username;
    return sendApiSuccess(res, {
      role: req.role,
      name,
      username: row.username,
      grades: parseJsonArray(row.allowed_grades).map((grade) => String(grade).toUpperCase())
    });
  });

  // ----------------------------------------------------------
  // Tugas tambahan
  // ----------------------------------------------------------
  app.get("/api/instruktur/tugas", taskGuard, (req, res) => {
    const limit = Math.max(1, Math.min(500, Number.parseInt(req.query.limit, 10) || 200));
    const grade = req.query.grade === undefined || req.query.grade === ""
      ? ""
      : String(req.query.grade).toUpperCase();
    if (grade && !GRADES.includes(grade)) {
      return sendApiError(res, 400, "grade harus SD, SMP, atau SMK.", "VALIDATION_ERROR", { field: "grade" });
    }
    const where = [];
    const params = [];
    if (!canSeeAll(req)) {
      where.push("owner_user_id = ?");
      params.push(req.userId);
    }
    if (grade) {
      where.push("grade = ?");
      params.push(grade);
    }
    const sql = `SELECT * FROM instruktur_tasks${where.length ? " WHERE " + where.join(" AND ") : ""}
      ORDER BY id DESC LIMIT ?`;
    const rows = db.prepare(sql).all(...params, limit);
    return sendApiSuccess(res, { items: rows.map(taskDto), total: rows.length });
  });

  app.post("/api/instruktur/tugas", taskGuard, writeLimit, (req, res) => guard(res, () => {
    const item = normalizeTask(req.body || {});
    const info = db.prepare(`INSERT INTO instruktur_tasks
      (owner_user_id, title, description, grade, type, points, due, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      req.userId,
      item.title,
      item.description,
      item.grade,
      item.type,
      item.points,
      item.due,
      item.status
    );
    const id = Number(info.lastInsertRowid);
    audit(req, "instruktur_tugas.create", "instruktur_task", id, {
      title: item.title, grade: item.grade, type: item.type, status: item.status
    });
    const row = db.prepare("SELECT * FROM instruktur_tasks WHERE id = ?").get(id);
    return sendApiSuccess(res, { item: taskDto(row) }, "Tugas tambahan dibuat.", 201);
  }));

  app.patch("/api/instruktur/tugas/:id", taskGuard, writeLimit, (req, res) => {
    const current = findTask(req, req.params.id);
    if (!current) return sendApiError(res, 404, "Tugas tambahan tidak ditemukan.", "NOT_FOUND");
    return guard(res, () => {
      const next = normalizeTask({ ...taskDto(current), ...(req.body || {}) });
      db.prepare(`UPDATE instruktur_tasks
        SET title = ?, description = ?, grade = ?, type = ?, points = ?, due = ?, status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(
        next.title, next.description, next.grade, next.type, next.points, next.due, next.status, current.id
      );
      audit(req, "instruktur_tugas.update", "instruktur_task", current.id, {
        title: next.title, status: next.status, fields: Object.keys(req.body || {})
      });
      return sendApiSuccess(res, {
        item: taskDto(db.prepare("SELECT * FROM instruktur_tasks WHERE id = ?").get(current.id))
      }, "Tugas tambahan diperbarui.");
    });
  });

  app.delete("/api/instruktur/tugas/:id", taskGuard, writeLimit, (req, res) => {
    const current = findTask(req, req.params.id);
    if (!current) return sendApiError(res, 404, "Tugas tambahan tidak ditemukan.", "NOT_FOUND");
    db.prepare("DELETE FROM instruktur_tasks WHERE id = ?").run(current.id);
    audit(req, "instruktur_tugas.delete", "instruktur_task", current.id, { title: current.title });
    return sendApiSuccess(res, { id: current.id }, "Tugas tambahan dihapus.");
  });

  // ----------------------------------------------------------
  // Ujian kelulusan + hasil
  // ----------------------------------------------------------
  app.get("/api/instruktur/ujian", examGuard, (req, res) => {
    const limit = Math.max(1, Math.min(500, Number.parseInt(req.query.limit, 10) || 200));
    const grade = req.query.grade === undefined || req.query.grade === ""
      ? ""
      : String(req.query.grade).toUpperCase();
    if (grade && !GRADES.includes(grade)) {
      return sendApiError(res, 400, "grade harus SD, SMP, atau SMK.", "VALIDATION_ERROR", { field: "grade" });
    }
    const where = [];
    const params = [];
    if (!canSeeAll(req)) {
      where.push("owner_user_id = ?");
      params.push(req.userId);
    }
    if (grade) {
      where.push("grade = ?");
      params.push(grade);
    }
    const sql = `SELECT * FROM instruktur_exams${where.length ? " WHERE " + where.join(" AND ") : ""}
      ORDER BY id DESC LIMIT ?`;
    const rows = db.prepare(sql).all(...params, limit);
    return sendApiSuccess(res, {
      items: rows.map((row) => examDto(row, resultsFor(row.id))),
      total: rows.length
    });
  });

  app.post("/api/instruktur/ujian", examGuard, writeLimit, (req, res) => guard(res, () => {
    const item = normalizeExam(req.body || {});
    const info = db.prepare(`INSERT INTO instruktur_exams
      (owner_user_id, title, description, grade, format, kkm, durasi, buka, tutup, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      req.userId,
      item.title,
      item.description,
      item.grade,
      item.format,
      item.kkm,
      item.durasi,
      item.buka,
      item.tutup,
      item.status
    );
    const id = Number(info.lastInsertRowid);
    if (item.hasil) replaceResults(id, item.hasil);
    audit(req, "instruktur_ujian.create", "instruktur_exam", id, {
      title: item.title, grade: item.grade, format: item.format, status: item.status
    });
    const row = db.prepare("SELECT * FROM instruktur_exams WHERE id = ?").get(id);
    return sendApiSuccess(res, { item: examDto(row, resultsFor(id)) }, "Ujian dibuat.", 201);
  }));

  app.patch("/api/instruktur/ujian/:id", examGuard, writeLimit, (req, res) => {
    const current = findExam(req, req.params.id);
    if (!current) return sendApiError(res, 404, "Ujian tidak ditemukan.", "NOT_FOUND");
    return guard(res, () => {
      const body = { ...examDto(current, resultsFor(current.id)), ...(req.body || {}) };
      const next = normalizeExam(body);
      db.prepare(`UPDATE instruktur_exams
        SET title = ?, description = ?, grade = ?, format = ?, kkm = ?, durasi = ?,
            buka = ?, tutup = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(
        next.title, next.description, next.grade, next.format, next.kkm,
        next.durasi, next.buka, next.tutup, next.status, current.id
      );
      if (next.hasil) replaceResults(current.id, next.hasil);
      audit(req, "instruktur_ujian.update", "instruktur_exam", current.id, {
        title: next.title,
        status: next.status,
        fields: Object.keys(req.body || {}),
        hasilCount: next.hasil ? next.hasil.length : undefined
      });
      return sendApiSuccess(res, {
        item: examDto(
          db.prepare("SELECT * FROM instruktur_exams WHERE id = ?").get(current.id),
          resultsFor(current.id)
        )
      }, "Ujian diperbarui.");
    });
  });

  app.delete("/api/instruktur/ujian/:id", examGuard, writeLimit, (req, res) => {
    const current = findExam(req, req.params.id);
    if (!current) return sendApiError(res, 404, "Ujian tidak ditemukan.", "NOT_FOUND");
    const run = db.transaction(() => {
      db.prepare("DELETE FROM instruktur_exam_results WHERE exam_id = ?").run(current.id);
      db.prepare("DELETE FROM instruktur_exams WHERE id = ?").run(current.id);
    });
    run();
    audit(req, "instruktur_ujian.delete", "instruktur_exam", current.id, { title: current.title });
    return sendApiSuccess(res, { id: current.id }, "Ujian dan nilai peserta dihapus.");
  });

  // ----------------------------------------------------------
  // Jadwal Zoom (tabel mentoring_schedules yang sama dengan portal murid)
  // ----------------------------------------------------------
  app.get("/api/instruktur/jadwal", jadwalGuard, (req, res) => {
    const month = req.query.bulan === undefined || req.query.bulan === ""
      ? ""
      : String(req.query.bulan);
    if (month && !isMonth(month)) {
      return sendApiError(res, 400, "bulan harus berformat YYYY-MM.", "VALIDATION_ERROR", { field: "bulan" });
    }
    const limit = Math.max(1, Math.min(500, Number.parseInt(req.query.limit, 10) || 200));
    const where = [];
    const params = [];
    if (!canSeeAll(req)) {
      where.push("created_by = ?");
      params.push(req.userId);
    }
    if (month) {
      where.push("tanggal LIKE ?");
      params.push(`${month}-%`);
    }
    const sql = `SELECT * FROM mentoring_schedules${where.length ? " WHERE " + where.join(" AND ") : ""}
      ORDER BY tanggal DESC, mulai DESC, id DESC LIMIT ?`;
    const rows = db.prepare(sql).all(...params, limit);
    return sendApiSuccess(res, { items: rows.map(scheduleDto), total: rows.length, bulan: month || null });
  });

  app.post("/api/instruktur/jadwal", jadwalGuard, writeLimit, (req, res) => {
    let item;
    try {
      item = normalizeSchedule(req.body || {});
    } catch (err) {
      return validationResponse(res, err);
    }
    if (!item.mentor) {
      const owner = db.prepare("SELECT username, full_name FROM users WHERE id = ?").get(req.userId);
      item.mentor = String((owner && (owner.full_name || owner.username)) || "").trim();
    }
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
    audit(req, "instruktur_jadwal.create", "mentoring_schedule", id, {
      judul: item.judul, tanggal: item.tanggal, mulai: item.mulai, grades: item.grades
    });
    return sendApiSuccess(res, {
      item: scheduleDto(db.prepare("SELECT * FROM mentoring_schedules WHERE id = ?").get(id))
    }, "Jadwal dibuat.", 201);
  });

  app.patch("/api/instruktur/jadwal/:id", jadwalGuard, writeLimit, (req, res) => {
    const current = findSchedule(req, req.params.id);
    if (!current) return sendApiError(res, 404, "Jadwal tidak ditemukan.", "NOT_FOUND");
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return sendApiError(res, 400, "Body jadwal harus berupa objek.", "VALIDATION_ERROR", { field: "body" });
    }
    let next;
    try {
      const merged = normalizeSchedule({ ...scheduleDto(current), ...body }, { partial: true });
      next = { ...scheduleDto(current), ...merged };
    } catch (err) {
      return validationResponse(res, err);
    }
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
    audit(req, "instruktur_jadwal.update", "mentoring_schedule", current.id, {
      judul: next.judul, tanggal: next.tanggal, mulai: next.mulai, fields: Object.keys(body)
    });
    return sendApiSuccess(res, {
      item: scheduleDto(db.prepare("SELECT * FROM mentoring_schedules WHERE id = ?").get(current.id))
    }, "Jadwal diperbarui.");
  });

  app.delete("/api/instruktur/jadwal/:id", jadwalGuard, writeLimit, (req, res) => {
    const current = findSchedule(req, req.params.id);
    if (!current) return sendApiError(res, 404, "Jadwal tidak ditemukan.", "NOT_FOUND");
    db.prepare("DELETE FROM mentoring_schedules WHERE id = ?").run(current.id);
    audit(req, "instruktur_jadwal.delete", "mentoring_schedule", current.id, {
      judul: current.judul, tanggal: current.tanggal, mulai: current.mulai
    });
    return sendApiSuccess(res, { id: current.id }, "Jadwal dihapus.");
  });

  // ----------------------------------------------------------
  // Bacaan murid: hanya konten terbit, tanpa data nilai peserta.
  // ----------------------------------------------------------
  function studentGrades(req) {
    const row = db.prepare("SELECT allowed_grades FROM users WHERE id = ?").get(req.userId);
    return parseJsonArray(row && row.allowed_grades).map((grade) => String(grade).toUpperCase());
  }

  function scopeGrades(req, rows) {
    if (req.role !== "student") return rows;
    const allowed = studentGrades(req);
    if (!allowed.length) return rows;
    return rows.filter((row) => allowed.includes(row.grade));
  }

  app.get("/api/tugas-tambahan", auth.requireAuth, (req, res) => {
    const grade = req.query.grade === undefined || req.query.grade === ""
      ? ""
      : String(req.query.grade).toUpperCase();
    if (grade && !GRADES.includes(grade)) {
      return sendApiError(res, 400, "grade harus SD, SMP, atau SMK.", "VALIDATION_ERROR", { field: "grade" });
    }
    const rows = grade
      ? db.prepare(`SELECT * FROM instruktur_tasks WHERE status = 'terbit' AND grade = ? ORDER BY id DESC`).all(grade)
      : db.prepare(`SELECT * FROM instruktur_tasks WHERE status = 'terbit' ORDER BY id DESC`).all();
    const items = scopeGrades(req, rows).map(taskDto);
    return sendApiSuccess(res, { items, total: items.length });
  });

  app.get("/api/ujian-kelulusan", auth.requireAuth, (req, res) => {
    const grade = req.query.grade === undefined || req.query.grade === ""
      ? ""
      : String(req.query.grade).toUpperCase();
    if (grade && !GRADES.includes(grade)) {
      return sendApiError(res, 400, "grade harus SD, SMP, atau SMK.", "VALIDATION_ERROR", { field: "grade" });
    }
    const rows = grade
      ? db.prepare(`SELECT * FROM instruktur_exams WHERE status = 'terbit' AND grade = ? ORDER BY id DESC`).all(grade)
      : db.prepare(`SELECT * FROM instruktur_exams WHERE status = 'terbit' ORDER BY id DESC`).all();
    const today = jakartaToday();
    const items = scopeGrades(req, rows)
      .filter((row) => (!row.buka || row.buka <= today) && (!row.tutup || row.tutup >= today))
      .map((row) => {
        // Metadata saja: nama & nilai peserta tidak boleh bocor ke sesama murid.
        const { hasil, ...meta } = examDto(row, []);
        return meta;
      });
    return sendApiSuccess(res, { items, total: items.length });
  });
}

module.exports = {
  GRADES,
  TASK_TYPES,
  EXAM_FORMATS,
  STATUSES,
  registerInstrukturApi
};
