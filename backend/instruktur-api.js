"use strict";

// ============================================================
// API PORTAL INSTRUKTUR
//
// Portal /instruktur sebelumnya bekerja dalam "Mode contoh": semua data
// disimpan di localStorage karena endpoint di bawah ini belum ada. Modul ini
// kini menjadi sumber data server untuk tiga menu portal tersebut:
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
const attendanceService = require("./attendance-service");
const graduationService = require("./graduation-service");
const crypto = require("crypto");

const GRADES = ["SD", "SMP", "SMK"];
const TASK_TYPES = ["kode", "blok", "kuis", "proyek"];
const EXAM_FORMATS = ["proyek", "tes"];
const STATUSES = ["draft", "terbit", "ditutup"];
const ZONA_WAKTU = ["WIB", "WITA", "WIT"];
const PENGINGAT_OPTIONS = [5, 10, 15, 30, 60];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_RE = /^[+\d][\d\s-]{7,}$/;

// Rubrik bawaan projek akhir: 4 kriteria x 25 = 100. Ujian boleh menyimpan
// `kriteria` sendiri (lihat kolom instruktur_exams.kriteria).
const RUBRIK = [
  { k: "fungsi", l: "Fungsi berjalan", d: "Karya berjalan sesuai tujuan", max: 25 },
  { k: "kreativitas", l: "Kreativitas", d: "Ide dan tampilan karya", max: 25 },
  { k: "kerapian", l: "Kerapian kode", d: "Kode rapi dan mudah dibaca", max: 25 },
  { k: "penjelasan", l: "Penjelasan", d: "Siswa bisa menjelaskan cara kerja karya", max: 25 }
];

const JAKARTA_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const JAKARTA_TIME = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
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

function parseJsonObject(raw) {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_) {
    return {};
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// SQLite menyimpan DATETIME sebagai "YYYY-MM-DD HH:MM:SS" (UTC). Browser
// menganggap string itu waktu lokal, jadi ubah ke ISO UTC agar tidak meleset.
function sqliteIso(value) {
  if (!value) return null;
  const text = String(value);
  if (text.includes("T")) return text;
  return text.replace(" ", "T") + "Z";
}

function idText(value, field, max) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" && typeof value !== "number") {
    invalid(`${field} harus berupa teks.`, field);
  }
  const clean = String(value).trim();
  if (clean.length > max) invalid(`${field} maksimal ${max} karakter.`, field);
  return clean;
}

function boolValue(value, field, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === 0 || value === 1) return value === 1;
  const clean = String(value).trim().toLowerCase();
  if (clean === "true" || clean === "1") return true;
  if (clean === "false" || clean === "0") return false;
  invalid(`${field} harus bernilai true atau false.`, field);
}

function timeOnly(value, field, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const clean = String(value).trim();
  if (!TIME_RE.test(clean)) invalid(`${field} harus berformat HH:MM.`, field);
  return clean;
}

function normalizeTracks(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) invalid("track harus berupa array.", "track");
  if (value.length > 12) invalid("track maksimal 12 pilihan.", "track");
  const out = [];
  for (let i = 0; i < value.length; i++) {
    const clean = text(value[i], `track[${i}]`, 60, true);
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
}

function criteriaOf(exam) {
  const custom = parseJsonArray(exam && exam.kriteria)
    .filter((item) => isPlainObject(item) && item.k)
    .map((item) => ({
      k: String(item.k),
      l: String(item.l || item.k),
      d: String(item.d || ""),
      max: integer(item.max, `kriteria.${item.k}.max`, 1, 100, 25)
    }));
  return custom.length ? custom : RUBRIK;
}

function normalizeKriteria(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) invalid("kriteria harus berupa array.", "kriteria");
  if (value.length === 0) return [];
  if (value.length > 8) invalid("kriteria maksimal 8 butir.", "kriteria");
  const out = [];
  const seen = new Set();
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!isPlainObject(row)) invalid(`kriteria[${i}] harus berupa objek { k, l, d, max }.`, "kriteria");
    const key = idText(row.k, `kriteria[${i}].k`, 30).toLowerCase();
    if (!key) invalid(`kriteria[${i}].k wajib diisi.`, "kriteria");
    if (!/^[a-z0-9_-]+$/.test(key)) invalid(`kriteria[${i}].k hanya boleh huruf kecil, angka, _ atau -.`, "kriteria");
    if (seen.has(key)) invalid(`kriteria[${i}].k duplikat: ${key}.`, "kriteria");
    seen.add(key);
    out.push({
      k: key,
      l: text(row.l, `kriteria[${i}].l`, 80) || key,
      d: text(row.d, `kriteria[${i}].d`, 200),
      max: integer(row.max, `kriteria[${i}].max`, 1, 100, 25)
    });
  }
  const total = out.reduce((sum, item) => sum + item.max, 0);
  if (total !== 100) invalid("total maksimal kriteria harus 100.", "kriteria");
  return out;
}

function normalizeRubrik(value, exam) {
  if (!isPlainObject(value)) invalid("rubrik harus berupa objek kriteria.", "rubrik");
  const criteria = criteriaOf(exam);
  const out = {};
  for (const item of criteria) {
    const raw = value[item.k];
    if (raw === undefined || raw === null || raw === "") {
      invalid(`rubrik.${item.k} wajib diisi.`, `rubrik.${item.k}`);
    }
    const score = integer(raw, `rubrik.${item.k}`, 0, item.max, null);
    if (score === null) invalid(`rubrik.${item.k} wajib diisi 0-${item.max}.`, `rubrik.${item.k}`);
    out[item.k] = score;
  }
  const known = new Set(criteria.map((item) => item.k));
  const extra = Object.keys(value).filter((key) => !known.has(key));
  if (extra.length) invalid("rubrik memuat kriteria tidak dikenal: " + extra.join(", "), "rubrik");
  return out;
}

function sessionHash(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function deviceLabel(userAgent) {
  const ua = String(userAgent || "");
  if (!ua) return "Perangkat tidak dikenal";
  const os = /Windows NT 10|Windows/i.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/i.test(ua) ? "macOS"
      : /Android/i.test(ua) ? "Android"
        : /iPhone|iPad|iOS/i.test(ua) ? "iOS"
          : /Linux/i.test(ua) ? "Linux"
            : "Perangkat lain";
  const browser = /Edg\//i.test(ua) ? "Microsoft Edge"
    : /OPR\/|Opera/i.test(ua) ? "Opera"
      : /Chrome\//i.test(ua) ? "Google Chrome"
        : /Firefox\//i.test(ua) ? "Firefox"
          : /Safari\//i.test(ua) ? "Safari"
            : "Peramban";
  return `${os} • ${browser}`;
}

function locationLabel(ip) {
  const clean = String(ip || "").replace(/^::ffff:/i, "").trim();
  if (!clean) return "Lokasi tidak diketahui";
  if (clean === "::1" || clean === "127.0.0.1" || /^10\./.test(clean) || /^192\.168\./.test(clean)) {
    return "Jaringan lokal";
  }
  return "IP " + clean;
}

function jakartaStamp(value) {
  if (!value) return "Tidak diketahui";
  const date = new Date(sqliteIso(value));
  if (!Number.isFinite(date.getTime())) return "Tidak diketahui";
  try {
    return JAKARTA_TIME.format(date) + " WIB";
  } catch (_) {
    return "Tidak diketahui";
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
    learningPathId: row.learning_path_id || "",
    learningPathName: row.learning_path_name || "",
    taskId: row.task_id || "",
    taskName: row.task_name || "",
    targetScope: row.target_scope || "grade",
    submissionCount: row.submission_count == null ? undefined : Number(row.submission_count),
    gradedCount: row.graded_count == null ? undefined : Number(row.graded_count),
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
    learningPathId: row.learning_path_id || "",
    learningPathName: row.learning_path_name || "",
    kriteria: parseJsonArray(row.kriteria),
    hasil: (results || []).map((r) => ({
      id: Number(r.id),
      nama: r.student_name,
      nilai: Number(r.score)
    })),
    submissionCount: row.submission_count == null ? undefined : Number(row.submission_count),
    pendingCount: row.pending_count == null ? undefined : Number(row.pending_count),
    lulusCount: row.lulus_count == null ? undefined : Number(row.lulus_count),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function taskSubmissionDto(row, withStudent) {
  const out = {
    id: Number(row.id),
    text: row.text || "",
    link: row.link || "",
    status: row.status || "dikumpulkan",
    nilai: row.nilai == null ? null : Number(row.nilai),
    feedback: row.feedback || "",
    submittedAt: sqliteIso(row.submitted_at),
    gradedAt: sqliteIso(row.graded_at)
  };
  if (withStudent) {
    out.nama = row.full_name || row.username || "Siswa";
    out.username = row.username || "";
  }
  return out;
}

function examSubmissionDto(row, withStudent) {
  const out = {
    id: Number(row.id),
    text: row.text || "",
    link: row.link || "",
    status: row.status || "menunggu",
    attempt: Number(row.attempt) || 1,
    rubrik: parseJsonObject(row.rubrik),
    nilai: row.nilai == null ? null : Number(row.nilai),
    feedback: row.feedback || "",
    submittedAt: sqliteIso(row.submitted_at),
    gradedAt: sqliteIso(row.graded_at)
  };
  if (withStudent) {
    out.nama = row.full_name || row.username || "Siswa";
    out.username = row.username || "";
  }
  return out;
}

// ------------------------------------------------------------
// Validasi body
// ------------------------------------------------------------

function normalizeTask(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid("Body tugas harus berupa objek.", "body");
  }
  const learningPathId = idText(body.learningPathId, "learningPathId", 120);
  const taskId = idText(body.taskId, "taskId", 120);
  return {
    title: text(body.title, "title", 200, true),
    description: text(body.description, "description", 1000),
    grade: gradeOf(body.grade),
    type: oneOf(body.type, "type", TASK_TYPES, "kode"),
    points: integer(body.points, "points", 0, 1000, 0),
    due: dateOnly(body.due, "due"),
    status: oneOf(body.status, "status", STATUSES, "draft"),
    learningPathId,
    learningPathName: text(body.learningPathName, "learningPathName", 200),
    taskId,
    taskName: text(body.taskName, "taskName", 200),
    targetScope: taskId ? "task" : learningPathId ? "path" : "grade"
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
    status: oneOf(body.status, "status", STATUSES, "draft"),
    learningPathId: idText(body.learningPathId, "learningPathId", 120),
    learningPathName: text(body.learningPathName, "learningPathName", 200)
  };
  if (item.buka && item.tutup && item.tutup < item.buka) {
    invalid("tutup harus setelah buka.", "tutup");
  }
  if (body.hasil !== undefined) item.hasil = normalizeResults(body.hasil);
  if (body.kriteria !== undefined) item.kriteria = normalizeKriteria(body.kriteria);
  return item;
}

function normalizeProfile(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid("Body profil harus berupa objek.", "body");
  }
  const email = text(body.email, "email", 160);
  if (email && !EMAIL_RE.test(email)) invalid("Format email tidak valid.", "email");
  const whatsapp = text(body.whatsapp, "whatsapp", 30);
  if (whatsapp && !WHATSAPP_RE.test(whatsapp)) invalid("Nomor WhatsApp tidak valid.", "whatsapp");
  const zoomLink = text(body.zoomLink, "zoomLink", 500);
  if (zoomLink && !/^https?:\/\//i.test(zoomLink)) invalid("Link Zoom harus diawali http:// atau https://.", "zoomLink");
  const pengingat = integer(body.pengingat, "pengingat", 0, 1440, 15);
  if (!PENGINGAT_OPTIONS.includes(pengingat)) {
    invalid(`pengingat harus salah satu dari: ${PENGINGAT_OPTIONS.join(", ")} menit.`, "pengingat");
  }
  const fotoUrl = text(body.fotoUrl, "fotoUrl", 3_000_000);
  if (fotoUrl && !/^https?:\/\//i.test(fotoUrl) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(fotoUrl)) {
    invalid("fotoUrl harus URL http(s) atau data URL gambar PNG/JPEG/WebP.", "fotoUrl");
  }
  return {
    nama: text(body.nama, "nama", 120, true),
    peran: text(body.peran, "peran", 120),
    email,
    whatsapp,
    bio: text(body.bio, "bio", 240),
    track: normalizeTracks(body.track),
    linkedin: text(body.linkedin, "linkedin", 200),
    github: text(body.github, "github", 200),
    portofolio: text(body.portofolio, "portofolio", 200),
    zoomLink,
    zoomPasscode: text(body.zoomPasscode, "zoomPasscode", 60),
    zonaWaktu: oneOf(body.zonaWaktu, "zonaWaktu", ["wib", "wita", "wit"], "wib").toUpperCase(),
    pengingat,
    terimaTugas: boolValue(body.terimaTugas, "terimaTugas", true),
    notifWa: boolValue(body.notifWa, "notifWa", true),
    fotoUrl
  };
}

function normalizeAvailability(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid("Body ketersediaan harus berupa objek.", "body");
  }
  if (!Array.isArray(body.items)) invalid("items harus berupa array.", "items");
  if (body.items.length > 7) invalid("items maksimal 7 hari.", "items");
  const seen = new Set();
  const items = [];
  for (let i = 0; i < body.items.length; i++) {
    const row = body.items[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      invalid(`items[${i}] harus berupa objek { hari, aktif, mulai, selesai }.`, "items");
    }
    const hari = integer(row.hari, `items[${i}].hari`, 1, 7, null);
    if (hari === null) invalid(`items[${i}].hari wajib diisi 1-7.`, "items");
    if (seen.has(hari)) invalid(`items[${i}].hari duplikat: ${hari}.`, "items");
    seen.add(hari);
    const aktif = boolValue(row.aktif, `items[${i}].aktif`, false);
    const mulai = timeOnly(row.mulai, `items[${i}].mulai`, "15:00");
    const selesai = timeOnly(row.selesai, `items[${i}].selesai`, "18:00");
    if (aktif && selesai <= mulai) invalid(`items[${i}].selesai harus lebih lambat dari mulai.`, "items");
    items.push({ hari, aktif, mulai, selesai });
  }
  if (!Array.isArray(body.jenjang)) invalid("jenjang harus berupa array.", "jenjang");
  const jenjang = [...new Set(body.jenjang
    .map((value) => String(value).toUpperCase())
    .filter((value) => GRADES.includes(value)))];
  if (!jenjang.length) invalid("jenjang minimal satu dari SD, SMP, SMK.", "jenjang");
  return {
    items,
    jenjang,
    maxSesi: integer(body.maxSesi, "maxSesi", 1, 7, 3),
    catatan: text(body.catatan, "catatan", 200)
  };
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
  // Helper data murid, pengumpulan, profil, dan ketersediaan
  // ----------------------------------------------------------
  function allowedGradesOf(userId) {
    const row = db.prepare("SELECT allowed_grades FROM users WHERE id = ?").get(userId);
    return parseJsonArray(row && row.allowed_grades)
      .map((grade) => String(grade).toUpperCase())
      .filter((grade) => GRADES.includes(grade));
  }

  function studentCanSee(userId, grade) {
    const allowed = allowedGradesOf(userId);
    return !allowed.length || allowed.includes(grade);
  }

  function taskSubmissionFor(taskId, studentId) {
    const row = db.prepare(`SELECT * FROM instruktur_task_submissions
      WHERE task_id = ? AND student_user_id = ?`).get(taskId, studentId);
    return row ? taskSubmissionDto(row, false) : null;
  }

  function examSubmissionFor(examId, studentId) {
    const row = db.prepare(`SELECT * FROM instruktur_exam_submissions
      WHERE exam_id = ? AND student_user_id = ?`).get(examId, studentId);
    return row ? examSubmissionDto(row, false) : null;
  }

  // Syarat ujian: semua task non-projek di Learning Path harus selesai.
  // `tasks.module_id` memakai id Learning Path yang sama dengan katalog
  // kurikulum (SD: modul.id, SMP/SMK: node.id). Bila modul belum ada di tabel
  // tasks, syarat dianggap tidak dapat dihitung (bukan otomatis terkunci).
  function syaratFor(studentId, exam) {
    const pathId = exam && exam.learning_path_id;
    if (!pathId) return null;
    const row = db.prepare(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN p.completed = 1 THEN 1 ELSE 0 END), 0) AS selesai
      FROM tasks t
      LEFT JOIN progress p ON p.user_id = ? AND p.task_id = t.task_id
      WHERE t.grade = ? AND t.module_id = ? AND t.is_project = 0
    `).get(studentId, exam.grade, pathId);
    const total = Number(row && row.total) || 0;
    if (!total) return null;
    const selesai = Number(row && row.selesai) || 0;
    return {
      selesai,
      total,
      terpenuhi: selesai >= total,
      nama: exam.learning_path_name || ""
    };
  }

  function profileStats(userId) {
    const sesiZoom = db.prepare("SELECT COUNT(*) AS n FROM mentoring_schedules WHERE created_by = ?").get(userId);
    const stages = db.prepare(`
      SELECT COUNT(*) AS n FROM (
        SELECT grade, tahap FROM instructor_stages WHERE instructor_user_id = ?
        UNION
        SELECT grade, tahap FROM instructor_students
        WHERE instructor_user_id = ? AND grade IS NOT NULL AND tahap IS NOT NULL
      )
    `).get(userId, userId);
    return {
      sesiZoom: Number(sesiZoom && sesiZoom.n) || 0,
      kelasAktif: Number(stages && stages.n) || 0,
      rating: 0
    };
  }

  function profileItem(userId) {
    const user = db.prepare("SELECT username, email, full_name, bio, phone FROM users WHERE id = ?").get(userId);
    if (!user) return null;
    const row = db.prepare("SELECT * FROM instruktur_profile WHERE user_id = ?").get(userId);
    const item = {
      nama: (row && row.nama) || user.full_name || user.username,
      email: (row && row.email) || user.email || "",
      whatsapp: (row && row.whatsapp) || user.phone || "",
      bio: (row && row.bio) || user.bio || "",
      track: parseJsonArray(row && row.track),
      linkedin: (row && row.linkedin) || "",
      github: (row && row.github) || "",
      portofolio: (row && row.portofolio) || "",
      zoomLink: (row && row.zoom_link) || "",
      zoomPasscode: (row && row.zoom_passcode) || "",
      zonaWaktu: (row && row.zona_waktu) || "WIB",
      pengingat: row ? Number(row.pengingat) : 15,
      terimaTugas: row ? Boolean(row.terima_tugas) : true,
      notifWa: row ? Boolean(row.notif_wa) : true,
      fotoUrl: (row && row.foto_url) || "",
      statistik: profileStats(userId)
    };
    if (row && row.peran) item.peran = row.peran;
    return item;
  }

  function availabilityPayload(userId) {
    const items = db.prepare(`SELECT hari, aktif, mulai, selesai FROM instruktur_availability
      WHERE user_id = ? ORDER BY hari ASC`).all(userId).map((row) => ({
      hari: Number(row.hari),
      aktif: Boolean(row.aktif),
      mulai: row.mulai,
      selesai: row.selesai
    }));
    const settings = db.prepare("SELECT * FROM instruktur_availability_settings WHERE user_id = ?").get(userId);
    const jenjang = parseJsonArray(settings && settings.jenjang)
      .map((grade) => String(grade).toUpperCase())
      .filter((grade) => GRADES.includes(grade));
    return {
      items,
      jenjang: jenjang.length ? jenjang : [...GRADES],
      maxSesi: settings ? Number(settings.max_sesi) : 3,
      catatan: (settings && settings.catatan) || ""
    };
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
  // Profil, keamanan akun, dan ketersediaan instruktur
  // ----------------------------------------------------------
  const profilGuard = [auth.requireAuth, auth.requireStaff];

  app.get("/api/instruktur/profil", profilGuard, (req, res) => {
    const item = profileItem(req.userId);
    if (!item) return sendApiError(res, 404, "Akun tidak ditemukan.", "NOT_FOUND");
    return sendApiSuccess(res, { item });
  });

  app.patch("/api/instruktur/profil", profilGuard, writeLimit, (req, res) => guard(res, () => {
    const current = profileItem(req.userId);
    if (!current) return sendApiError(res, 404, "Akun tidak ditemukan.", "NOT_FOUND");
    const next = normalizeProfile({ ...current, ...(req.body || {}) });
    db.prepare(`INSERT INTO instruktur_profile
      (user_id, nama, peran, email, whatsapp, bio, track, linkedin, github, portofolio,
       zoom_link, zoom_passcode, zona_waktu, pengingat, terima_tugas, notif_wa, foto_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        nama = excluded.nama, peran = excluded.peran, email = excluded.email,
        whatsapp = excluded.whatsapp, bio = excluded.bio, track = excluded.track,
        linkedin = excluded.linkedin, github = excluded.github, portofolio = excluded.portofolio,
        zoom_link = excluded.zoom_link, zoom_passcode = excluded.zoom_passcode,
        zona_waktu = excluded.zona_waktu, pengingat = excluded.pengingat,
        terima_tugas = excluded.terima_tugas, notif_wa = excluded.notif_wa,
        foto_url = excluded.foto_url, updated_at = CURRENT_TIMESTAMP`).run(
      req.userId,
      next.nama,
      next.peran,
      next.email,
      next.whatsapp,
      next.bio,
      JSON.stringify(next.track),
      next.linkedin,
      next.github,
      next.portofolio,
      next.zoomLink,
      next.zoomPasscode,
      next.zonaWaktu,
      next.pengingat,
      next.terimaTugas ? 1 : 0,
      next.notifWa ? 1 : 0,
      next.fotoUrl
    );
    audit(req, "instruktur_profil.update", "instruktur_profile", req.userId, {
      fields: Object.keys(req.body || {})
    });
    return sendApiSuccess(res, { item: profileItem(req.userId) }, "Profil diperbarui.");
  }));

  app.post("/api/instruktur/profil/password", profilGuard, writeLimit, (req, res) => {
    const body = req.body || {};
    const lama = typeof body.lama === "string" ? body.lama : "";
    const baru = typeof body.baru === "string" ? body.baru : "";
    if (baru.length < 8 || baru.length > 128 || !/[a-z]/.test(baru) || !/[A-Z]/.test(baru) || !/\d/.test(baru)) {
      return sendApiError(res, 400, "Kata sandi baru minimal 8 karakter, berisi huruf besar, huruf kecil, dan angka.", "VALIDATION_ERROR", { field: "baru" });
    }
    if (baru === lama) {
      return sendApiError(res, 400, "Kata sandi baru tidak boleh sama dengan yang lama.", "VALIDATION_ERROR", { field: "baru" });
    }
    const user = db.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").get(req.userId);
    if (!user) return sendApiError(res, 404, "Akun tidak ditemukan.", "NOT_FOUND");

    const attemptKey = req.ip + "|instruktur-pw:" + req.user;
    if (auth.isBlocked(attemptKey)) {
      return sendApiError(res, 429, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.", "RATE_LIMITED");
    }
    if (user.password_hash) {
      if (!lama || !auth.verifyPassword(lama, user.password_salt, user.password_hash)) {
        auth.recordFail(attemptKey);
        return sendApiError(res, 401, "Kata sandi saat ini salah.", "INVALID_CREDENTIALS", { field: "lama" });
      }
    }
    auth.clearFails(attemptKey);

    const { salt, hash } = auth.hashPassword(baru);
    db.prepare(`UPDATE users
      SET password_hash = ?, password_salt = ?, must_change_password = 0
      WHERE id = ?`).run(hash, salt, req.userId);
    // Sesi lain dicabut; sesi yang sedang dipakai tetap hidup.
    auth.deleteOtherSessions(req.userId, req.token);
    audit(req, "instruktur_profil.password", "user", req.userId, {});
    return sendApiSuccess(res, {}, "Kata sandi berhasil diperbarui.");
  });

  app.get("/api/instruktur/sesi-login", auth.requireAuth, (req, res) => {
    const currentHash = sessionHash(req.token);
    const now = Date.now();
    const rows = db.prepare(`SELECT rowid AS id, token_hash, user_agent, ip, created_at, last_seen_at, expires_at
      FROM sessions WHERE user_id = ?
      ORDER BY COALESCE(last_seen_at, created_at) DESC`).all(req.userId)
      .filter((row) => {
        const expires = new Date(row.expires_at).getTime();
        return !Number.isFinite(expires) || expires > now;
      });
    const items = rows.map((row) => {
      const current = row.token_hash === currentHash;
      return {
        id: Number(row.id),
        perangkat: deviceLabel(row.user_agent),
        lokasi: locationLabel(row.ip),
        terakhir: current ? "Aktif sekarang" : jakartaStamp(row.last_seen_at || row.created_at),
        saatIni: current
      };
    }).sort((a, b) => Number(b.saatIni) - Number(a.saatIni));
    return sendApiSuccess(res, { items });
  });

  app.post("/api/instruktur/sesi-login/:id/keluarkan", auth.requireAuth, writeLimit, (req, res) => {
    const rowId = parseRowId(req.params.id);
    if (!rowId) return sendApiError(res, 404, "Sesi tidak ditemukan.", "NOT_FOUND");
    const row = db.prepare("SELECT rowid AS id, token_hash FROM sessions WHERE rowid = ? AND user_id = ?")
      .get(rowId, req.userId);
    if (!row) return sendApiError(res, 404, "Sesi tidak ditemukan.", "NOT_FOUND");
    if (row.token_hash === sessionHash(req.token)) {
      return sendApiError(res, 400, "Tidak bisa mengeluarkan sesi yang sedang dipakai.", "VALIDATION_ERROR", { field: "id" });
    }
    db.prepare("DELETE FROM sessions WHERE rowid = ?").run(rowId);
    audit(req, "instruktur_sesi.keluarkan", "session", rowId, {});
    return sendApiSuccess(res, { id: rowId }, "Perangkat dikeluarkan.");
  });

  app.get("/api/instruktur/ketersediaan", profilGuard, (req, res) => {
    return sendApiSuccess(res, availabilityPayload(req.userId));
  });

  app.put("/api/instruktur/ketersediaan", profilGuard, writeLimit, (req, res) => guard(res, () => {
    const next = normalizeAvailability(req.body || {});
    const save = db.transaction(() => {
      db.prepare("DELETE FROM instruktur_availability WHERE user_id = ?").run(req.userId);
      const insert = db.prepare(`INSERT INTO instruktur_availability
        (user_id, hari, aktif, mulai, selesai) VALUES (?, ?, ?, ?, ?)`);
      for (const item of next.items) {
        insert.run(req.userId, item.hari, item.aktif ? 1 : 0, item.mulai, item.selesai);
      }
      db.prepare(`INSERT INTO instruktur_availability_settings
        (user_id, jenjang, max_sesi, catatan, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          jenjang = excluded.jenjang, max_sesi = excluded.max_sesi,
          catatan = excluded.catatan, updated_at = CURRENT_TIMESTAMP`).run(
        req.userId,
        JSON.stringify(next.jenjang),
        next.maxSesi,
        next.catatan
      );
    });
    save();
    audit(req, "instruktur_ketersediaan.update", "instruktur_availability", req.userId, {
      hari: next.items.length, jenjang: next.jenjang, maxSesi: next.maxSesi
    });
    return sendApiSuccess(res, availabilityPayload(req.userId), "Ketersediaan disimpan.");
  }));

  // ----------------------------------------------------------
  // Absen per sesi (hanya baca)
  // ----------------------------------------------------------
  const sesiGuard = [auth.requireAuth, auth.requireStaff, auth.requirePermission("kurikulum.kelola")];

  function sesiGrades(req) {
    if (canSeeAll(req)) return [];
    const row = db.prepare("SELECT allowed_grades FROM users WHERE id = ?").get(req.userId);
    return parseJsonArray(row && row.allowed_grades)
      .map((grade) => String(grade).toUpperCase())
      .filter((grade) => GRADES.includes(grade));
  }

  app.get("/api/instruktur/sesi", sesiGuard, (req, res) => guard(res, () => {
    const today = attendanceService.jakartaToday();
    const dari = dateOnly(req.query.dari, "dari") || attendanceService.dayShift(today, -3);
    const sampai = dateOnly(req.query.sampai, "sampai") || attendanceService.dayShift(today, 3);
    if (dari > sampai) invalid("dari harus sebelum atau sama dengan sampai.", "dari");
    const span = Math.round((Date.parse(`${sampai}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86400000);
    if (span > 62) invalid("Rentang tanggal maksimal 63 hari.", "sampai");

    const result = attendanceService.buildSessionList(db, {
      dari,
      sampai,
      grades: sesiGrades(req),
      instructorId: canSeeAll(req) ? null : req.userId,
      restrict: !canSeeAll(req)
    });
    return sendApiSuccess(res, result);
  }));

  app.get("/api/instruktur/sesi/ringkasan", sesiGuard, (req, res) => guard(res, () => {
    const raw = req.query.bulan === undefined || req.query.bulan === ""
      ? attendanceService.currentMonth()
      : String(req.query.bulan);
    if (!isMonth(raw)) invalid("bulan harus berformat YYYY-MM.", "bulan");
    const result = attendanceService.buildSessionSummary(db, {
      month: raw,
      grades: sesiGrades(req),
      instructorId: canSeeAll(req) ? null : req.userId,
      restrict: !canSeeAll(req)
    });
    return sendApiSuccess(res, result);
  }));

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
      where.push("t.owner_user_id = ?");
      params.push(req.userId);
    }
    if (grade) {
      where.push("t.grade = ?");
      params.push(grade);
    }
    const sql = `SELECT t.*,
        (SELECT COUNT(*) FROM instruktur_task_submissions s WHERE s.task_id = t.id) AS submission_count,
        (SELECT COUNT(*) FROM instruktur_task_submissions s WHERE s.task_id = t.id AND s.status = 'dinilai') AS graded_count
      FROM instruktur_tasks t${where.length ? " WHERE " + where.join(" AND ") : ""}
      ORDER BY t.id DESC LIMIT ?`;
    const rows = db.prepare(sql).all(...params, limit);
    return sendApiSuccess(res, { items: rows.map(taskDto), total: rows.length });
  });

  app.post("/api/instruktur/tugas", taskGuard, writeLimit, (req, res) => guard(res, () => {
    const item = normalizeTask(req.body || {});
    const info = db.prepare(`INSERT INTO instruktur_tasks
      (owner_user_id, title, description, grade, type, points, due, status,
       learning_path_id, learning_path_name, task_id, task_name, target_scope)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      req.userId,
      item.title,
      item.description,
      item.grade,
      item.type,
      item.points,
      item.due,
      item.status,
      item.learningPathId,
      item.learningPathName,
      item.taskId,
      item.taskName,
      item.targetScope
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
            learning_path_id = ?, learning_path_name = ?, task_id = ?, task_name = ?, target_scope = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(
        next.title, next.description, next.grade, next.type, next.points, next.due, next.status,
        next.learningPathId, next.learningPathName, next.taskId, next.taskName, next.targetScope,
        current.id
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

  // Daftar & penilaian jawaban siswa untuk satu tugas tambahan.
  app.get("/api/instruktur/tugas/:id/submissions", taskGuard, (req, res) => {
    const task = findTask(req, req.params.id);
    if (!task) return sendApiError(res, 404, "Tugas tambahan tidak ditemukan.", "NOT_FOUND");
    const rows = db.prepare(`
      SELECT s.*, u.username, u.full_name
      FROM instruktur_task_submissions s
      LEFT JOIN users u ON u.id = s.student_user_id
      WHERE s.task_id = ?
      ORDER BY s.submitted_at DESC, s.id DESC
    `).all(task.id);
    const items = rows.map((row) => taskSubmissionDto(row, true));
    return sendApiSuccess(res, { items, total: items.length });
  });

  app.patch("/api/instruktur/tugas/:id/submissions/:sid", taskGuard, writeLimit, (req, res) => guard(res, () => {
    const task = findTask(req, req.params.id);
    if (!task) return sendApiError(res, 404, "Tugas tambahan tidak ditemukan.", "NOT_FOUND");
    const sid = parseRowId(req.params.sid);
    if (!sid) return sendApiError(res, 404, "Jawaban siswa tidak ditemukan.", "NOT_FOUND");
    const submission = db.prepare(`SELECT * FROM instruktur_task_submissions
      WHERE id = ? AND task_id = ?`).get(sid, task.id);
    if (!submission) return sendApiError(res, 404, "Jawaban siswa tidak ditemukan.", "NOT_FOUND");

    const body = req.body || {};
    const nilai = integer(body.nilai, "nilai", 0, 100, null);
    if (nilai === null) invalid("nilai wajib diisi 0-100.", "nilai");
    const feedback = text(body.feedback, "feedback", 500);

    db.prepare(`UPDATE instruktur_task_submissions
      SET nilai = ?, feedback = ?, status = 'dinilai', graded_at = CURRENT_TIMESTAMP,
          graded_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(nilai, feedback, req.userId, submission.id);

    audit(req, "instruktur_tugas.nilai", "instruktur_task_submission", submission.id, {
      taskId: task.id, studentUserId: submission.student_user_id, nilai
    });
    const row = db.prepare(`
      SELECT s.*, u.username, u.full_name
      FROM instruktur_task_submissions s
      LEFT JOIN users u ON u.id = s.student_user_id
      WHERE s.id = ?
    `).get(submission.id);
    return sendApiSuccess(res, { item: taskSubmissionDto(row, true) }, "Nilai jawaban disimpan.");
  }));

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
      where.push("e.owner_user_id = ?");
      params.push(req.userId);
    }
    if (grade) {
      where.push("e.grade = ?");
      params.push(grade);
    }
    const sql = `SELECT e.*,
        (SELECT COUNT(*) FROM instruktur_exam_submissions s WHERE s.exam_id = e.id) AS submission_count,
        (SELECT COUNT(*) FROM instruktur_exam_submissions s WHERE s.exam_id = e.id AND s.status = 'menunggu') AS pending_count,
        (SELECT COUNT(*) FROM instruktur_exam_submissions s WHERE s.exam_id = e.id AND s.status = 'lulus') AS lulus_count
      FROM instruktur_exams e${where.length ? " WHERE " + where.join(" AND ") : ""}
      ORDER BY e.id DESC LIMIT ?`;
    const rows = db.prepare(sql).all(...params, limit);
    return sendApiSuccess(res, {
      items: rows.map((row) => examDto(row, resultsFor(row.id))),
      total: rows.length
    });
  });

  app.post("/api/instruktur/ujian", examGuard, writeLimit, (req, res) => guard(res, () => {
    const item = normalizeExam(req.body || {});
    const info = db.prepare(`INSERT INTO instruktur_exams
      (owner_user_id, title, description, grade, format, kkm, durasi, buka, tutup, status,
       learning_path_id, learning_path_name, kriteria)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      req.userId,
      item.title,
      item.description,
      item.grade,
      item.format,
      item.kkm,
      item.durasi,
      item.buka,
      item.tutup,
      item.status,
      item.learningPathId,
      item.learningPathName,
      JSON.stringify(item.kriteria || [])
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
            buka = ?, tutup = ?, status = ?, learning_path_id = ?, learning_path_name = ?,
            kriteria = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(
        next.title, next.description, next.grade, next.format, next.kkm,
        next.durasi, next.buka, next.tutup, next.status,
        next.learningPathId, next.learningPathName,
        JSON.stringify(next.kriteria || []), current.id
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

  // Pengumpulan & penilaian rubrik untuk ujian format "proyek".
  app.get("/api/instruktur/ujian/:id/submissions", examGuard, (req, res) => {
    const exam = findExam(req, req.params.id);
    if (!exam) return sendApiError(res, 404, "Ujian tidak ditemukan.", "NOT_FOUND");
    if (exam.format !== "proyek") {
      return sendApiError(res, 400, "Ujian tes tidak memakai pengumpulan projek.", "VALIDATION_ERROR", { field: "format" });
    }
    const rows = db.prepare(`
      SELECT s.*, u.username, u.full_name
      FROM instruktur_exam_submissions s
      LEFT JOIN users u ON u.id = s.student_user_id
      WHERE s.exam_id = ?
      ORDER BY s.submitted_at DESC, s.id DESC
    `).all(exam.id);
    const items = rows.map((row) => examSubmissionDto(row, true));
    return sendApiSuccess(res, { items, total: items.length, kkm: Number(exam.kkm), kriteria: criteriaOf(exam) });
  });

  app.patch("/api/instruktur/ujian/:id/submissions/:sid", examGuard, writeLimit, (req, res) => guard(res, () => {
    const exam = findExam(req, req.params.id);
    if (!exam) return sendApiError(res, 404, "Ujian tidak ditemukan.", "NOT_FOUND");
    if (exam.format !== "proyek") {
      return sendApiError(res, 400, "Ujian tes tidak memakai pengumpulan projek.", "VALIDATION_ERROR", { field: "format" });
    }
    const sid = parseRowId(req.params.sid);
    if (!sid) return sendApiError(res, 404, "Pengumpulan siswa tidak ditemukan.", "NOT_FOUND");
    const submission = db.prepare(`SELECT * FROM instruktur_exam_submissions
      WHERE id = ? AND exam_id = ?`).get(sid, exam.id);
    if (!submission) return sendApiError(res, 404, "Pengumpulan siswa tidak ditemukan.", "NOT_FOUND");

    const body = req.body || {};
    const rubrik = normalizeRubrik(body.rubrik, exam);
    const nilai = Object.values(rubrik).reduce((sum, value) => sum + Number(value), 0);
    const feedback = text(body.feedback, "feedback", 500);
    const status = nilai >= Number(exam.kkm) ? "lulus" : "revisi";

    db.prepare(`UPDATE instruktur_exam_submissions
      SET rubrik = ?, nilai = ?, status = ?, feedback = ?, graded_at = CURRENT_TIMESTAMP,
          graded_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(JSON.stringify(rubrik), nilai, status, feedback, req.userId, submission.id);

    // Kunci kelulusan resmi & sertifikat bila status lulus
    if (status === "lulus") {
      try {
        const pathKey = exam.learning_path_id || `${exam.grade}|${exam.judul}`;
        const pathName = exam.learning_path_name || exam.judul;
        graduationService.recordGraduation(db, {
          studentUserId: submission.student_user_id,
          grade: exam.grade,
          learningPathKey: pathKey,
          learningPathName: pathName,
          examId: exam.id,
          examSubmissionId: submission.id,
          finalScore: nilai
        });
      } catch (_) {}
    }

    audit(req, "instruktur_ujian.nilai", "instruktur_exam_submission", submission.id, {
      examId: exam.id, studentUserId: submission.student_user_id, nilai, status
    });
    const row = db.prepare(`
      SELECT s.*, u.username, u.full_name
      FROM instruktur_exam_submissions s
      LEFT JOIN users u ON u.id = s.student_user_id
      WHERE s.id = ?
    `).get(submission.id);
    return sendApiSuccess(res, { item: examSubmissionDto(row, true) }, "Penilaian projek disimpan.");
  }));

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
       zoom_url, meeting_id, passcode, grades,
       learning_path_id, learning_path_name, task_id, task_name, target_scope, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
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
      item.learningPathId || "",
      item.learningPathName || "",
      item.taskId || "",
      item.taskName || "",
      item.targetScope || (item.taskId ? "task" : item.learningPathId ? "path" : "grade"),
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
      // Sama seperti PATCH admin/jadwal: targetScope lama tidak boleh memblokir
      // penghapusan taskId, jadi nilai itu dihitung ulang setelah merge.
      const base = scheduleDto(current);
      delete base.targetScope;
      const merged = normalizeSchedule({ ...base, ...body }, { partial: true });
      next = { ...scheduleDto(current), ...merged };
    } catch (err) {
      return validationResponse(res, err);
    }
    if (!Object.prototype.hasOwnProperty.call(body, "targetScope")) {
      next.targetScope = next.taskId ? "task" : next.learningPathId ? "path" : "grade";
    }
    if (next.selesai <= next.mulai) {
      return sendApiError(res, 400, "selesai harus lebih lambat dari mulai.", "VALIDATION_ERROR", { field: "selesai" });
    }
    db.prepare(`UPDATE mentoring_schedules SET judul=?, jenis=?, level=?, mentor=?, keterangan=?,
      tanggal=?, mulai=?, selesai=?, zoom_url=?, meeting_id=?, passcode=?, grades=?,
      learning_path_id=?, learning_path_name=?, task_id=?, task_name=?, target_scope=?,
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
      next.learningPathId || "",
      next.learningPathName || "",
      next.taskId || "",
      next.taskName || "",
      next.targetScope || (next.taskId ? "task" : next.learningPathId ? "path" : "grade"),
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
    const items = scopeGrades(req, rows).map((row) => ({
      ...taskDto(row),
      submission: taskSubmissionFor(row.id, req.userId)
    }));
    return sendApiSuccess(res, { items, total: items.length });
  });

  app.put("/api/tugas-tambahan/:id/submission", auth.requireAuth, writeLimit, (req, res) => guard(res, () => {
    if (req.role !== "student") {
      return sendApiError(res, 403, "Hanya akun siswa yang bisa mengumpulkan jawaban.", "FORBIDDEN");
    }
    const id = parseRowId(req.params.id);
    if (!id) return sendApiError(res, 404, "Tugas tambahan tidak ditemukan.", "NOT_FOUND");
    const task = db.prepare("SELECT * FROM instruktur_tasks WHERE id = ?").get(id);
    if (!task || task.status === "draft") {
      return sendApiError(res, 404, "Tugas tambahan tidak ditemukan.", "NOT_FOUND");
    }
    if (!studentCanSee(req.userId, task.grade)) {
      return sendApiError(res, 404, "Tugas tambahan tidak ditemukan.", "NOT_FOUND");
    }
    if (task.status === "ditutup") {
      return sendApiError(res, 409, "Tugas ini sudah ditutup.", "TASK_CLOSED");
    }

    const body = req.body || {};
    const answer = text(body.text, "text", 3000);
    const link = text(body.link, "link", 500);
    if (link && !/^https?:\/\/\S+$/i.test(link)) {
      invalid("Link harus diawali http:// atau https://.", "link");
    }
    if (!answer && !link) invalid("Isi jawaban atau link hasil kerjamu dulu.", "text");

    const current = db.prepare(`SELECT * FROM instruktur_task_submissions
      WHERE task_id = ? AND student_user_id = ?`).get(task.id, req.userId);
    if (current && current.status === "dinilai") {
      return sendApiError(res, 409, "Jawaban sudah dinilai dan tidak bisa diubah lagi.", "SUBMISSION_GRADED");
    }

    if (current) {
      db.prepare(`UPDATE instruktur_task_submissions
        SET text = ?, link = ?, status = 'dikumpulkan', submitted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(answer, link, current.id);
    } else {
      db.prepare(`INSERT INTO instruktur_task_submissions
        (task_id, student_user_id, text, link, status, submitted_at, updated_at)
        VALUES (?, ?, ?, ?, 'dikumpulkan', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(
        task.id, req.userId, answer, link
      );
    }
    return sendApiSuccess(
      res,
      { submission: taskSubmissionFor(task.id, req.userId) },
      current ? "Jawaban diperbarui." : "Jawaban dikumpulkan.",
      current ? 200 : 201
    );
  }));

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
        return {
          ...meta,
          syarat: syaratFor(req.userId, row),
          submission: examSubmissionFor(row.id, req.userId)
        };
      });
    return sendApiSuccess(res, { items, total: items.length });
  });

  app.put("/api/ujian-kelulusan/:id/submission", auth.requireAuth, writeLimit, (req, res) => guard(res, () => {
    if (req.role !== "student") {
      return sendApiError(res, 403, "Hanya akun siswa yang bisa mengumpulkan projek.", "FORBIDDEN");
    }
    const id = parseRowId(req.params.id);
    if (!id) return sendApiError(res, 404, "Ujian tidak ditemukan.", "NOT_FOUND");
    const exam = db.prepare("SELECT * FROM instruktur_exams WHERE id = ?").get(id);
    if (!exam || exam.status === "draft") {
      return sendApiError(res, 404, "Ujian tidak ditemukan.", "NOT_FOUND");
    }
    if (!studentCanSee(req.userId, exam.grade)) {
      return sendApiError(res, 404, "Ujian tidak ditemukan.", "NOT_FOUND");
    }
    if (exam.format !== "proyek") {
      return sendApiError(res, 400, "Ujian ini bukan projek akhir yang dikumpulkan siswa.", "VALIDATION_ERROR", { field: "format" });
    }
    if (exam.status === "ditutup") {
      return sendApiError(res, 409, "Ujian ini sudah ditutup.", "EXAM_CLOSED");
    }
    const today = jakartaToday();
    if (exam.buka && today < exam.buka) {
      return sendApiError(res, 409, "Ujian belum dibuka.", "EXAM_NOT_OPEN");
    }
    if (exam.tutup && today > exam.tutup) {
      return sendApiError(res, 409, "Ujian sudah ditutup.", "EXAM_CLOSED");
    }
    const syarat = syaratFor(req.userId, exam);
    if (syarat && !syarat.terpenuhi) {
      const label = syarat.nama || "Learning Path";
      return sendApiError(
        res,
        409,
        `Selesaikan semua task di ${label} dulu (${syarat.selesai}/${syarat.total}).`,
        "EXAM_LOCKED",
        { field: "learningPathId", selesai: syarat.selesai, total: syarat.total }
      );
    }

    const body = req.body || {};
    const answer = text(body.text, "text", 3000);
    const link = text(body.link, "link", 500);
    if (link && !/^https?:\/\/\S+$/i.test(link)) {
      invalid("Link harus diawali http:// atau https://.", "link");
    }
    if (!answer && !link) invalid("Isi penjelasan atau link karyamu dulu.", "text");

    const current = db.prepare(`SELECT * FROM instruktur_exam_submissions
      WHERE exam_id = ? AND student_user_id = ?`).get(exam.id, req.userId);
    if (current && current.status === "lulus") {
      return sendApiError(res, 409, "Projek sudah lulus dan tidak perlu dikumpulkan lagi.", "ALREADY_PASSED");
    }
    const attempt = current
      ? (current.status === "revisi" ? Number(current.attempt) + 1 : Number(current.attempt))
      : 1;
    if (attempt > 99) {
      return sendApiError(res, 409, "Batas pengumpulan ulang tercapai. Hubungi instruktur.", "ATTEMPT_LIMIT");
    }

    if (current) {
      // Rubrik, nilai, dan komentar terakhir dipertahankan agar instruktur
      // masih bisa melihat nilai sebelumnya saat menilai ulang.
      db.prepare(`UPDATE instruktur_exam_submissions
        SET text = ?, link = ?, status = 'menunggu', attempt = ?, submitted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(answer, link, attempt, current.id);
    } else {
      db.prepare(`INSERT INTO instruktur_exam_submissions
        (exam_id, student_user_id, text, link, status, attempt, submitted_at, updated_at)
        VALUES (?, ?, ?, ?, 'menunggu', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(
        exam.id, req.userId, answer, link
      );
    }
    return sendApiSuccess(
      res,
      { submission: examSubmissionFor(exam.id, req.userId) },
      current ? "Projek dikumpulkan ulang." : "Projek dikumpulkan.",
      current ? 200 : 201
    );
  }));
}

module.exports = {
  GRADES,
  TASK_TYPES,
  EXAM_FORMATS,
  STATUSES,
  registerInstrukturApi
};
