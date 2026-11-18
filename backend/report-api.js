// Endpoint publik untuk laporan orang tua/wali.
// Tidak memakai sesi/login: akses diberikan lewat token acak yang hanya
// diketahui pemegang tautan. Token disimpan sebagai hash di database.
"use strict";

// Batas akses per IP. Kuncinya HANYA IP (bukan path): path endpoint ini memuat
// token, jadi limiter berbasis path memberi bucket baru untuk setiap tebakan
// token dan tidak pernah membatasi siapa pun yang mengganti token tiap request.
const REPORT_RATE_MAX = 60;
const REPORT_RATE_WINDOW_MS = 60 * 1000;
const reportHits = new Map();

function checkReportRate(ip) {
  const now = Date.now();
  const entry = reportHits.get(ip);
  if (!entry || now - entry.first > REPORT_RATE_WINDOW_MS) {
    reportHits.set(ip, { count: 1, first: now });
    return { allowed: true };
  }
  if (entry.count >= REPORT_RATE_MAX) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((REPORT_RATE_WINDOW_MS - (now - entry.first)) / 1000))
    };
  }
  entry.count += 1;
  return { allowed: true };
}

// Pangkas entri lama supaya Map tidak tumbuh tanpa batas.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of reportHits) {
    if (now - entry.first > REPORT_RATE_WINDOW_MS) reportHits.delete(ip);
  }
}, 60 * 1000).unref();

function registerReportApi(app, deps) {
  const { db, sendApiError, sendApiSuccess } = deps;
  const reports = require("./reports");
  const jadwal = require("./jadwal-api");
  const attendance = require("./attendance-service");

  // Header yang sama untuk semua respons ber-token: jangan di-cache dan jangan
  // diindeks mesin pencari.
  function noStore(res) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  }

  // Mengembalikan true bila permintaan boleh lanjut. Respons 429 sudah dikirim
  // bila batas terlampaui.
  function allowRate(req, res) {
    const rate = checkReportRate(req.ip || (req.socket && req.socket.remoteAddress) || "unknown");
    if (rate.allowed) return true;
    res.setHeader("Retry-After", String(rate.retryAfter));
    sendApiError(res, 429, "Terlalu banyak permintaan. Coba lagi sebentar lagi.", "RATE_LIMITED");
    return false;
  }

  function notFound(res) {
    return sendApiError(
      res,
      404,
      "Laporan tidak ditemukan atau tautan sudah kedaluwarsa.",
      "REPORT_NOT_FOUND"
    );
  }

  function monthFrom(req, res) {
    const raw = req.query.bulan === undefined || req.query.bulan === ""
      ? jadwalMonth()
      : String(req.query.bulan);
    if (!jadwal.isMonth(raw)) {
      sendApiError(res, 400, "bulan harus berformat YYYY-MM.", "VALIDATION_ERROR", { field: "bulan" });
      return null;
    }
    return raw;
  }

  function jadwalMonth() {
    return attendance.currentMonth();
  }

  function studentFor(link) {
    return db.prepare(`SELECT id, username, full_name, allowed_grades FROM users
      WHERE id = ? AND role = 'student' AND status <> 'deleted'`).get(Number(link.student_user_id));
  }

  app.get("/api/reports/:token", (req, res) => {
    noStore(res);
    if (!allowRate(req, res)) return;

    const result = reports.resolveReportToken(db, req.params.token);
    if (!result) return notFound(res);
    return sendApiSuccess(res, result);
  });

  // Jadwal mentoring anak, disaring menurut jenjang yang diizinkan. Token yang
  // sama dengan halaman laporan; access_count tidak dinaikkan karena halaman
  // ini bisa berpindah bulan berkali-kali.
  app.get("/api/reports/:token/jadwal", (req, res) => {
    noStore(res);
    if (!allowRate(req, res)) return;

    const link = reports.resolveReportLink(db, req.params.token);
    if (!link) return notFound(res);
    const month = monthFrom(req, res);
    if (!month) return;

    const student = studentFor(link);
    if (!student) return notFound(res);
    const allowed = jadwal.parseGrades(student.allowed_grades);

    const rows = db.prepare(`SELECT * FROM mentoring_schedules
      WHERE tanggal LIKE ? ORDER BY tanggal ASC, mulai ASC, id ASC`).all(`${month}-%`);
    const list = rows.map(jadwal.scheduleDto)
      .filter((item) => jadwal.visibleForGrades(item.grades, allowed));

    return sendApiSuccess(res, { bulan: month, jadwal: list });
  });

  // Rekap kehadiran anak. Bentuk data sama dengan /api/attendance/report milik
  // siswa, tetapi tanpa username atau ID internal.
  app.get("/api/reports/:token/attendance", (req, res) => {
    noStore(res);
    if (!allowRate(req, res)) return;

    const link = reports.resolveReportLink(db, req.params.token);
    if (!link) return notFound(res);
    const month = monthFrom(req, res);
    if (!month) return;

    const student = studentFor(link);
    if (!student) return notFound(res);
    const data = attendance.buildStudentReport(db, student, month);
    const nama = String(student.full_name || "").trim() || null;

    return sendApiSuccess(res, {
      bulan: data.bulan,
      siswa: { nama },
      ringkasan: data.ringkasan,
      keseluruhan: data.keseluruhan,
      perBulan: data.perBulan,
      sesi: data.sesi
    });
  });
}

module.exports = { registerReportApi };
