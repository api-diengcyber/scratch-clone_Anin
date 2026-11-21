"use strict";

// ------------------------------------------------------------
// CATATAN PENGIRIMAN EMAIL LAPORAN KE WALI
//
// Modul ini hanya mengurus DATA: kapan email jatuh tempo, antrean yang aman
// dari kiriman ganda, dan status tiap pengiriman. Pengiriman email dilakukan
// `mailer.js` dan penjadwalnya ada di `report-scheduler.js`.
//
// Siklus status:
//   pending -> sent       (final: tidak pernah bisa dibatalkan atau dikirim ulang)
//   pending -> failed     (boleh dicoba lagi: failed -> sent / failed -> failed)
//   pending/failed -> skipped (dibatalkan; boleh dihidupkan lagi lewat queueDelivery)
// ------------------------------------------------------------

// Setiap laporan bulanan memakai kind 'monthN' (N = bulan ke-1, ke-2, ...).
// Durasi langganan menentukan N terakhir yang diantrekan.
const MAX_MONTHS = 36;
const DEFAULT_MONTHS = 1;
const DEFAULT_KIND = "month1";
const KIND_RE = /^month([1-9]|[12][0-9]|3[0-6])$/;
const STATUSES = ["pending", "sent", "failed", "skipped"];
const MAX_ERROR_LENGTH = 500;

// ------------------------------------------------------------
// Tanggal (tanggal saja, 'YYYY-MM-DD'). Dihitung sebagai teks/angka, bukan
// lewat Date lokal, supaya hasilnya tidak bergeser karena zona waktu server.
// ------------------------------------------------------------

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value, length) {
  return String(value).padStart(length, "0");
}

function parseDateOnly(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function isValidDateOnly(value) {
  return parseDateOnly(value) !== null;
}

// Tambah bulan kalender. Kalau tanggalnya tidak ada di bulan tujuan, dipotong
// ke hari terakhir bulan itu: 31 Jan + 1 bulan = 28 Feb (29 Feb di tahun kabisat).
function addMonths(value, months) {
  const parsed = parseDateOnly(value);
  if (!parsed || !Number.isInteger(months)) return null;
  const total = parsed.year * 12 + (parsed.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const day = Math.min(parsed.day, daysInMonth(year, month));
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

// Tambah/kurangi hari pada tanggal saja. Dipakai untuk menghitung hari terakhir
// langganan (tanggal mulai + durasi - 1 hari).
function addDays(value, days) {
  const parsed = parseDateOnly(value);
  if (!parsed || !Number.isInteger(days)) return null;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return `${pad(year, 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

// Email laporan pertama jatuh tempo 1 bulan setelah mulai berlangganan.
function firstReportDueDate(startedAt) {
  return addMonths(startedAt, 1);
}

// Jatuh tempo laporan bulan ke-`month` (1..MAX_MONTHS).
function reportDueDate(startedAt, month) {
  const n = normalizeMonths(month);
  return addMonths(startedAt, n);
}

// Durasi langganan dalam bulan. Nilai kosong memakai 1 bulan supaya data lama
// (hanya punya subscription_started_at) tetap berperilaku seperti dulu.
function normalizeMonths(value, fallback = DEFAULT_MONTHS) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "number" && typeof value !== "string") {
    throw new TypeError(`months harus bilangan bulat 1-${MAX_MONTHS}`);
  }
  const months = typeof value === "string" ? Number(value.trim()) : value;
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    throw new TypeError(`months harus bilangan bulat 1-${MAX_MONTHS}`);
  }
  return months;
}

function monthOfKind(kind) {
  const match = KIND_RE.exec(String(kind === undefined || kind === null ? "" : kind));
  return match ? Number(match[1]) : null;
}

function isKind(kind) {
  return monthOfKind(kind) !== null;
}

function kindForMonth(month) {
  return `month${normalizeMonths(month)}`;
}

// Hari terakhir langganan (inklusif). Laporan bulan ke-N tetap jatuh tempo pada
// tanggal ulang bulan ke-N, yaitu sehari setelah masa langganan bulan itu habis.
function subscriptionEndDate(startedAt, months) {
  const count = normalizeMonths(months);
  const due = addMonths(startedAt, count);
  return due ? addDays(due, -1) : null;
}

// ------------------------------------------------------------
// Antrean & status
// ------------------------------------------------------------

function cleanError(error) {
  const text = String(error && error.message ? error.message : error || "Pengiriman gagal")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .trim();
  return (text || "Pengiriman gagal").slice(0, MAX_ERROR_LENGTH);
}

// Masukkan satu pengiriman ke antrean. Aman dipanggil berkali-kali untuk
// penerima yang sama: indeks unik (siswa + email + jenis + periode) mencegah baris ganda.
//   - belum ada            -> dibuat 'pending'                  { created: true }
//   - ada, status 'skipped' -> dihidupkan lagi jadi 'pending'    { revived: true }
//   - ada, status lain      -> tidak diubah (termasuk 'sent')    { created: false, revived: false }
function queueDelivery(db, input = {}) {
  const kind = input.kind || DEFAULT_KIND;
  if (!isKind(kind)) throw new TypeError(`kind tidak dikenal: ${kind}`);
  const studentId = Number(input.studentId);
  if (!Number.isSafeInteger(studentId) || studentId < 1) throw new TypeError("studentId tidak valid");
  const email = String(input.recipientEmail || "").trim().toLowerCase();
  if (!email) throw new TypeError("recipientEmail wajib diisi");
  const period = String(input.period || "");
  const dueDate = input.dueDate === undefined || input.dueDate === null ? null : String(input.dueDate);
  if (dueDate !== null && !isValidDateOnly(dueDate)) throw new TypeError("dueDate harus YYYY-MM-DD");
  const guardianId = input.guardianId === undefined || input.guardianId === null ? null : Number(input.guardianId);
  const name = input.recipientName ? String(input.recipientName).trim().slice(0, 100) : null;

  return db.transaction(() => {
    const info = db.prepare(`
      INSERT OR IGNORE INTO report_deliveries
        (student_user_id, guardian_id, recipient_email, recipient_name, kind, period, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(studentId, guardianId, email, name, kind, period, dueDate);
    if (info.changes === 1) {
      return { id: Number(info.lastInsertRowid), created: true, revived: false, status: "pending" };
    }

    const existing = db.prepare(`
      SELECT id, status FROM report_deliveries
      WHERE student_user_id = ? AND recipient_email = ? COLLATE NOCASE AND kind = ? AND period = ?
    `).get(studentId, email, kind, period);

    if (existing.status === "skipped") {
      db.prepare(`
        UPDATE report_deliveries
        SET status = 'pending', guardian_id = ?, recipient_name = ?, due_date = ?,
            last_error = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(guardianId, name, dueDate, existing.id);
      return { id: existing.id, created: false, revived: true, status: "pending" };
    }
    return { id: existing.id, created: false, revived: false, status: existing.status };
  })();
}

// 'sent' bersifat final: hanya baris pending/failed yang bisa berubah.
function markSent(db, id, options = {}) {
  const reportLinkId = options.reportLinkId === undefined || options.reportLinkId === null
    ? null
    : Number(options.reportLinkId);
  return db.prepare(`
    UPDATE report_deliveries
    SET status = 'sent', attempts = attempts + 1, last_error = NULL,
        sent_at = CURRENT_TIMESTAMP, report_link_id = COALESCE(?, report_link_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN ('pending', 'failed')
  `).run(reportLinkId, id).changes === 1;
}

function markFailed(db, id, error) {
  return db.prepare(`
    UPDATE report_deliveries
    SET status = 'failed', attempts = attempts + 1, last_error = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN ('pending', 'failed')
  `).run(cleanError(error), id).changes === 1;
}

function markSkipped(db, id, reason) {
  return db.prepare(`
    UPDATE report_deliveries
    SET status = 'skipped', last_error = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN ('pending', 'failed')
  `).run(cleanError(reason || "Dibatalkan"), id).changes === 1;
}

// Wali dihapus dari daftar: email yang belum terkirim ke wali itu dibatalkan,
// sejalan dengan tautan laporannya yang ikut dicabut.
function skipPendingForGuardian(db, guardianId, reason) {
  return db.prepare(`
    UPDATE report_deliveries
    SET status = 'skipped', last_error = ?, updated_at = CURRENT_TIMESTAMP
    WHERE guardian_id = ? AND status IN ('pending', 'failed')
  `).run(cleanError(reason || "Wali dihapus"), guardianId).changes;
}

// Tanggal mulai/durasi langganan berubah: sesuaikan pengiriman bulanan yang
// belum terkirim.
//   tanggal baru  -> jatuh tempo 'pending' digeser ke tanggal mulai + N bulan
//   durasi mengecil -> bulan di luar durasi dibatalkan
//   tanggal dihapus -> semua 'pending'/'failed' dibatalkan (bisa dihidupkan lagi
//                      lewat queueDelivery kalau tanggal diisi kembali)
// Pengiriman yang sudah 'sent' tidak pernah disentuh.
function syncPendingForSubscription(db, studentId, startedAt, months = DEFAULT_MONTHS) {
  if (startedAt && !isValidDateOnly(startedAt)) throw new TypeError("startedAt harus YYYY-MM-DD");
  const count = startedAt ? normalizeMonths(months) : DEFAULT_MONTHS;
  const rows = db.prepare(`
    SELECT id, kind, status FROM report_deliveries
    WHERE student_user_id = ? AND status IN ('pending', 'failed')
  `).all(studentId);

  let rescheduled = 0;
  let skipped = 0;
  for (const row of rows) {
    const month = monthOfKind(row.kind);
    if (month === null) continue;

    if (!startedAt || month > count) {
      const reason = startedAt ? "Melebihi durasi langganan" : "Tanggal berlangganan dihapus";
      if (markSkipped(db, row.id, reason)) skipped += 1;
      continue;
    }

    if (row.status === "pending") {
      const dueDate = addMonths(startedAt, month);
      if (dueDate && db.prepare(`
        UPDATE report_deliveries
        SET due_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).run(dueDate, row.id).changes === 1) {
        rescheduled += 1;
      }
    }
  }
  return { rescheduled, skipped };
}

function toItem(row) {
  return {
    id: Number(row.id),
    studentId: Number(row.student_user_id),
    studentName: row.student_name || null,
    guardianId: row.guardian_id === null ? null : Number(row.guardian_id),
    recipientName: row.recipient_name || null,
    recipientEmail: row.recipient_email,
    kind: row.kind,
    month: monthOfKind(row.kind),
    period: row.period || "",
    status: row.status,
    attempts: Number(row.attempts),
    lastError: row.last_error || null,
    reportLinkId: row.report_link_id === null ? null : Number(row.report_link_id),
    dueDate: row.due_date || null,
    sentAt: row.sent_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function dateOnlyToday(now = new Date()) {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}

function getDelivery(db, id) {
  const num = Number(id);
  if (!Number.isSafeInteger(num) || num < 1) return null;
  const row = db.prepare(`
    SELECT d.*, COALESCE(NULLIF(u.full_name, ''), u.username) AS student_name
    FROM report_deliveries d
    LEFT JOIN users u ON u.id = d.student_user_id
    WHERE d.id = ?
  `).get(num);
  return row ? toItem(row) : null;
}

// Dipakai endpoint admin "coba lagi": baris yang gagal/dibatalkan dikembalikan
// ke pending dan jatuh temponya dimajukan ke hari ini supaya langsung diproses
// pada penjadwalan berikutnya. Baris 'sent' tetap final.
function retryDelivery(db, id, options = {}) {
  const num = Number(id);
  if (!Number.isSafeInteger(num) || num < 1) return { found: false, sent: false, changed: false };
  const row = db.prepare("SELECT id, status FROM report_deliveries WHERE id = ?").get(num);
  if (!row) return { found: false, sent: false, changed: false };
  if (row.status === "sent") return { found: true, sent: true, changed: false };

  let dueDate = options.dueDate === undefined ? dateOnlyToday() : options.dueDate;
  if (dueDate !== null && !isValidDateOnly(dueDate)) dueDate = dateOnlyToday();

  const changed = db.prepare(`
    UPDATE report_deliveries
    SET status = 'pending', attempts = 0, last_error = NULL, due_date = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN ('pending', 'failed', 'skipped')
  `).run(dueDate, num).changes === 1;
  return { found: true, sent: false, changed };
}

function listDeliveries(db, options = {}) {
  const where = [];
  const params = [];
  if (options.studentId !== undefined && options.studentId !== null) {
    where.push("d.student_user_id = ?");
    params.push(Number(options.studentId));
  }
  if (options.status) {
    where.push("d.status = ?");
    params.push(String(options.status));
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(100, Number.parseInt(options.limit, 10) || 25));
  const page = Math.max(1, Math.min(100000, Number.parseInt(options.page, 10) || 1));

  const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM report_deliveries d ${clause}`).get(...params).n);
  const rows = db.prepare(`
    SELECT d.*, COALESCE(NULLIF(u.full_name, ''), u.username) AS student_name
    FROM report_deliveries d
    LEFT JOIN users u ON u.id = d.student_user_id
    ${clause}
    ORDER BY d.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, (page - 1) * limit);

  return { items: rows.map(toItem), total, page, limit, pages: Math.ceil(total / limit) };
}

module.exports = {
  MAX_MONTHS,
  DEFAULT_MONTHS,
  DEFAULT_KIND,
  STATUSES,
  isValidDateOnly,
  addMonths,
  addDays,
  firstReportDueDate,
  reportDueDate,
  subscriptionEndDate,
  normalizeMonths,
  monthOfKind,
  kindForMonth,
  isKind,
  dateOnlyToday,
  queueDelivery,
  markSent,
  markFailed,
  markSkipped,
  skipPendingForGuardian,
  syncPendingForSubscription,
  getDelivery,
  retryDelivery,
  listDeliveries
};