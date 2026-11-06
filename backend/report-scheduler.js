"use strict";

// ------------------------------------------------------------
// PENJADWAL EMAIL LAPORAN
//
// Mengambil report_deliveries yang jatuh tempo, membuat tautan laporan baru,
// menyusun email, lalu mengirimnya lewat mailer. Satu baris yang gagal tidak
// menghentikan baris lain.
//
// Penjadwal hanya aktif bila REPORT_EMAIL_ENABLED=true. Endpoint admin
// "run" memakai fungsi yang sama untuk menjalankan sekali secara manual.
//
// Kebijakan percobaan ulang (supaya penyedia email yang sedang down tidak
// menyumbat antrean atau menumpuk tautan):
//   - baris 'pending' selalu didahulukan; baris 'failed' hanya mengisi sisa kuota batch
//   - baris 'failed' dicoba lagi paling cepat REPORT_EMAIL_RETRY_MINUTES (default 60) setelah gagal
//   - setelah REPORT_EMAIL_MAX_ATTEMPTS percobaan (default 5) berhenti otomatis;
//     admin bisa mengulang lewat endpoint retry (attempts direset)
// ------------------------------------------------------------

const reports = require("./reports");
const reportDeliveries = require("./report-deliveries");
const reportEmail = require("./report-email");
const { createMailer, normalizeProvider } = require("./mailer");

const DEFAULT_INTERVAL_MINUTES = 60;
const MIN_INTERVAL_MINUTES = 1;
const MAX_BATCH = 200;
const DEFAULT_BATCH = 25;
const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_ATTEMPTS_LIMIT = 20;
const DEFAULT_RETRY_MINUTES = 60;
const MAX_RETRY_MINUTES = 24 * 60;

let running = false;

function todayDate(now = new Date()) {
  return reportDeliveries.dateOnlyToday(now);
}

function configuredBaseUrl(env = process.env) {
  return String(env.APP_PUBLIC_ORIGIN || env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
}

function linkExpiryDays(env = process.env, override) {
  const raw = override === undefined ? Number.parseInt(env.REPORT_LINK_EXPIRY_DAYS, 10) : Number(override);
  const days = Number.isSafeInteger(raw) ? raw : reports.DEFAULT_EXPIRY_DAYS;
  return Math.max(1, Math.min(reports.MAX_EXPIRY_DAYS, days));
}

function batchSize(env = process.env, override) {
  const raw = override === undefined ? Number.parseInt(env.REPORT_EMAIL_BATCH_SIZE, 10) : Number(override);
  const size = Number.isSafeInteger(raw) && raw > 0 ? raw : DEFAULT_BATCH;
  return Math.max(1, Math.min(MAX_BATCH, size));
}

function maxAttempts(env = process.env, override) {
  const raw = override === undefined ? Number.parseInt(env.REPORT_EMAIL_MAX_ATTEMPTS, 10) : Number(override);
  const value = Number.isSafeInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_ATTEMPTS;
  return Math.max(1, Math.min(MAX_ATTEMPTS_LIMIT, value));
}

function retryAfterMinutes(env = process.env, override) {
  const raw = override === undefined ? Number.parseInt(env.REPORT_EMAIL_RETRY_MINUTES, 10) : Number(override);
  const value = Number.isSafeInteger(raw) && raw >= 0 ? raw : DEFAULT_RETRY_MINUTES;
  return Math.min(MAX_RETRY_MINUTES, value);
}

function configurationError(message) {
  const error = new Error(message);
  error.code = "CONFIGURATION_ERROR";
  return error;
}

// options:
//   today       'YYYY-MM-DD' (untuk test/simulasi)
//   baseUrl     origin publik aplikasi
//   mailer      objek { provider, send(message) }
//   studentId   batasi ke satu siswa (dipakai endpoint run manual)
//   batchSize   maksimum baris per putaran
//   expiresInDays umur tautan laporan
//   maxAttempts / retryAfterMinutes  kebijakan percobaan ulang (lihat atas)
//   logger      { log, error } untuk mailer mock (default console)
async function processDueDeliveries(db, options = {}) {
  if (running) {
    return { busy: true, processed: 0, sent: 0, failed: 0, skipped: 0, errors: [] };
  }

  const env = options.env || process.env;
  const baseUrl = String(options.baseUrl || configuredBaseUrl(env)).trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw configurationError("APP_PUBLIC_ORIGIN (atau PUBLIC_BASE_URL) belum diatur; tautan laporan tidak bisa dibuat.");
  }

  const today = options.today === undefined ? todayDate() : String(options.today);
  if (!reportDeliveries.isValidDateOnly(today)) {
    throw new TypeError("today harus tanggal YYYY-MM-DD.");
  }

  const mailer = options.mailer || createMailer({ env, provider: options.provider, logger: options.logger });
  const limit = batchSize(env, options.batchSize);
  const expiresInDays = linkExpiryDays(env, options.expiresInDays);
  const attemptsLimit = maxAttempts(env, options.maxAttempts);
  const retryMinutes = retryAfterMinutes(env, options.retryAfterMinutes);

  // 'pending' selalu layak diproses. 'failed' hanya bila belum melewati batas percobaan
  // dan jeda sejak kegagalan terakhir sudah lewat.
  const where = [
    `(d.status = 'pending'
      OR (d.status = 'failed'
          AND d.attempts < ?
          AND COALESCE(d.updated_at, '1970-01-01 00:00:00') <= datetime('now', ?)))`,
    "d.due_date IS NOT NULL",
    "d.due_date <= ?"
  ];
  const params = [attemptsLimit, `-${retryMinutes} minutes`, today];
  if (options.studentId !== undefined && options.studentId !== null) {
    const studentId = Number(options.studentId);
    if (!Number.isSafeInteger(studentId) || studentId < 1) throw new TypeError("studentId tidak valid.");
    where.push("d.student_user_id = ?");
    params.push(studentId);
  }

  const rows = db.prepare(`
    SELECT d.*,
           COALESCE(NULLIF(u.full_name, ''), u.username) AS student_name,
           u.username AS student_username,
           u.role AS student_role,
           u.status AS student_status,
           g.name AS guardian_name,
           g.email AS guardian_email
    FROM report_deliveries d
    LEFT JOIN users u ON u.id = d.student_user_id
    LEFT JOIN student_guardians g ON g.id = d.guardian_id
    WHERE ${where.join(" AND ")}
    ORDER BY (d.status = 'failed') ASC, d.due_date ASC, d.id ASC
    LIMIT ?
  `).all(...params, limit);

  const summary = {
    today,
    provider: mailer.provider || null,
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  running = true;
  try {
    for (const row of rows) {
      const id = Number(row.id);

      // Baris bisa berubah sejak SELECT (mis. dibatalkan admin). Baca ulang.
      const fresh = db.prepare("SELECT status FROM report_deliveries WHERE id = ?").get(id);
      if (!fresh || (fresh.status !== "pending" && fresh.status !== "failed")) continue;
      summary.processed += 1;

      let link = null;
      try {
        if (!row.student_role || row.student_role !== "student" || row.student_status === "deleted") {
          reportDeliveries.markSkipped(db, id, "Siswa tidak aktif");
          summary.skipped += 1;
          continue;
        }

        // Semua pengiriman produk dibuat dari baris wali. Wali yang sudah
        // dihapus membuat guardian_id menjadi NULL (FK ON DELETE SET NULL),
        // jadi baris tanpa wali aktif tidak boleh dikirim.
        if (row.guardian_id === null || row.guardian_id === undefined || !row.guardian_email) {
          reportDeliveries.markSkipped(db, id, "Wali sudah tidak ada");
          summary.skipped += 1;
          continue;
        }
        if (String(row.guardian_email).trim().toLowerCase() !== String(row.recipient_email).trim().toLowerCase()) {
          reportDeliveries.markSkipped(db, id, "Email wali berubah");
          summary.skipped += 1;
          continue;
        }

        const report = reports.buildStudentReport(db, Number(row.student_user_id));
        if (!report) {
          reportDeliveries.markSkipped(db, id, "Laporan siswa tidak tersedia");
          summary.skipped += 1;
          continue;
        }

        link = reports.createReportLink(db, Number(row.student_user_id), {
          guardianId: row.guardian_id === null ? null : Number(row.guardian_id),
          expiresInDays
        });
        const email = reportEmail.buildReportEmail({
          report,
          studentName: report.student.name,
          guardianName: row.guardian_name || row.recipient_name,
          institutionName: report.institution.name,
          pageUrl: reports.reportPageUrl(baseUrl, link.token),
          expiresAt: link.expiresAt
        });

        await mailer.send({
          to: row.recipient_email,
          subject: email.subject,
          text: email.text,
          html: email.html
        });

        const marked = reportDeliveries.markSent(db, id, { reportLinkId: link.id });
        if (!marked) {
          // Ada proses lain yang lebih dulu menyelesaikan baris ini.
          db.prepare("UPDATE report_links SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL").run(link.id);
          summary.skipped += 1;
          continue;
        }
        summary.sent += 1;
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        // Tautan yang sudah dibuat tapi gagal dikirim tidak boleh menggantung.
        if (link) {
          try {
            db.prepare("UPDATE report_links SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL")
              .run(link.id);
          } catch (_) { /* tautan mungkin sudah tidak ada */ }
        }
        reportDeliveries.markFailed(db, id, message);
        summary.failed += 1;
        if (summary.errors.length < 20) summary.errors.push({ id, message });
      }
    }
  } finally {
    running = false;
  }

  return summary;
}

// Masalah konfigurasi yang membuat penjadwal tidak boleh dijalankan. Diperiksa saat start
// supaya salah konfigurasi langsung terlihat, bukan gagal diam-diam tiap putaran.
// Provider TIDAK punya default di sini: mock menandai email "terkirim" tanpa mengirim apa pun,
// jadi harus dipilih dengan sengaja.
function configurationProblems(env, options) {
  const problems = [];
  if (!String(options.baseUrl || configuredBaseUrl(env)).trim()) {
    problems.push("APP_PUBLIC_ORIGIN (atau PUBLIC_BASE_URL) belum diatur; tautan laporan tidak bisa dibuat");
  }
  if (options.mailer) return problems;

  const explicit = String(options.provider || env.REPORT_EMAIL_PROVIDER || env.EMAIL_PROVIDER || "").trim();
  if (!explicit) {
    problems.push("REPORT_EMAIL_PROVIDER belum diatur (pilih mock, resend, atau smtp; tidak ada default)");
    return problems;
  }
  let provider = null;
  try { provider = normalizeProvider(explicit); } catch (error) { problems.push(error.message); }
  if (provider === "resend" && !String(env.RESEND_API_KEY || "").trim()) {
    problems.push("RESEND_API_KEY belum diatur untuk provider resend");
  }
  if (provider === "smtp" && !String(env.SMTP_HOST || "").trim()) {
    problems.push("SMTP_HOST belum diatur untuk provider smtp");
  }
  if (provider === "mock" && String(env.NODE_ENV || "").toLowerCase() === "production" && options.allowMockInProduction !== true) {
    problems.push("provider mock tidak boleh dipakai di production (email akan ditandai terkirim tanpa dikirim)");
  }
  return problems;
}

// options.enabled default dari REPORT_EMAIL_ENABLED. Mengembalikan null bila
// penjadwal tidak aktif atau konfigurasinya belum lengkap (supaya pemanggil tidak
// perlu memeriksa env sendiri).
function startReportScheduler(db, options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const enabled = options.enabled === undefined
    ? String(env.REPORT_EMAIL_ENABLED || "").trim().toLowerCase() === "true"
    : Boolean(options.enabled);
  if (!enabled) return null;

  const problems = configurationProblems(env, options);
  if (problems.length) {
    for (const problem of problems) logger.error(`[EMAIL LAPORAN] penjadwal TIDAK dijalankan: ${problem}.`);
    return null;
  }

  const rawInterval = options.intervalMinutes === undefined
    ? Number.parseInt(env.REPORT_EMAIL_INTERVAL_MINUTES, 10)
    : Number(options.intervalMinutes);
  const intervalMinutes = Number.isSafeInteger(rawInterval) && rawInterval >= MIN_INTERVAL_MINUTES
    ? rawInterval
    : DEFAULT_INTERVAL_MINUTES;
  const intervalMs = intervalMinutes * 60 * 1000;
  const initialDelayMs = options.initialDelayMs === undefined
    ? Math.min(5000, intervalMs)
    : Math.max(0, Number(options.initialDelayMs) || 0);

  let stopped = false;
  let intervalTimer = null;
  let initialTimer = null;

  async function runNow() {
    if (stopped) return null;
    try {
      const summary = await processDueDeliveries(db, options);
      if (summary.processed || summary.errors.length) {
        logger.log(`[EMAIL LAPORAN] diproses=${summary.processed} terkirim=${summary.sent} gagal=${summary.failed} dilewati=${summary.skipped}`);
      }
      return summary;
    } catch (error) {
      logger.error(`[EMAIL LAPORAN] gagal menjalankan penjadwal: ${error && error.message ? error.message : error}`);
      return null;
    }
  }

  intervalTimer = setInterval(() => { void runNow(); }, intervalMs);
  if (typeof intervalTimer.unref === "function") intervalTimer.unref();
  initialTimer = setTimeout(() => { void runNow(); }, initialDelayMs);
  if (typeof initialTimer.unref === "function") initialTimer.unref();

  logger.log(`[EMAIL LAPORAN] penjadwal aktif setiap ${intervalMinutes} menit (provider: ${String(options.provider || env.REPORT_EMAIL_PROVIDER || env.EMAIL_PROVIDER || "kustom")}).`);

  return {
    intervalMs,
    runNow,
    stop() {
      stopped = true;
      if (intervalTimer) clearInterval(intervalTimer);
      if (initialTimer) clearTimeout(initialTimer);
      intervalTimer = null;
      initialTimer = null;
    }
  };
}

module.exports = {
  todayDate,
  configuredBaseUrl,
  processDueDeliveries,
  startReportScheduler
};