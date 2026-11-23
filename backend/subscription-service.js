"use strict";

// ------------------------------------------------------------
// LANGGANAN & PEMBAYARAN (MANUAL)
//
// Modul ini menyiapkan seluruh logika backend supaya frontend tinggal
// memanggil API:
//   1. admin mendaftarkan paket (jalur + durasi + harga),
//   2. siswa membuat invoice (checkout) -> baris Finance berstatus pending,
//   3. siswa transfer manual, admin mengonfirmasi,
//   4. konfirmasi mengaktifkan/memperpanjang langganan dan mengantrekan
//      email laporan bulanan.
//
// Gateway pembayaran nanti cukup memanggil confirmPayment() dari webhook,
// jadi kontrak API untuk frontend tidak perlu berubah.
// ------------------------------------------------------------

const reportDeliveries = require("./report-deliveries");
const reports = require("./reports");
const paymentGateway = require("./payment-gateway");
const { notifyAdmins } = require("./notifications");
const { notifyStudent } = require("./student-notifications");

const MAX_MONTHS = reportDeliveries.MAX_MONTHS;
const MAX_MONEY = 1_000_000_000;
const GRADES = ["SD", "SMP", "SMK"];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "cancelled", "expired", "refunded"];
const DEFAULT_INVOICE_DAYS = 3;
const MAX_INVOICE_DAYS = 30;

// Bukti transfer disimpan base64 di database. Batas 600 KB cukup untuk foto
// struk/PDF dan tetap di bawah limit body JSON 1 MB.
const MAX_PROOF_BYTES = 600 * 1024;
const PROOF_MIMES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf"
};

const JAKARTA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function todayWib(now = new Date()) {
  const parts = {};
  for (const part of JAKARTA_DATE.formatToParts(now)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function invalid(message, field) {
  const error = new Error(message);
  error.code = "SUBSCRIPTION_INVALID";
  error.field = field || null;
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.code = "SUBSCRIPTION_CONFLICT";
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.code = "SUBSCRIPTION_NOT_FOUND";
  return error;
}

// Notifikasi bersifat pelengkap: kegagalan menulis notifikasi tidak boleh
// membatalkan invoice atau aktivasi langganan.
function safeNotify(fn) {
  try {
    return fn();
  } catch (error) {
    console.error("[LANGGANAN] Gagal membuat notifikasi:", error && error.message ? error.message : error);
    return 0;
  }
}

function rupiah(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

function studentLabel(row) {
  return row.student_name || row.student_username || `Siswa #${row.student_user_id || row.id || ""}`;
}

function text(value, field, max, required = false) {
  if (value === undefined || value === null) {
    if (required) throw invalid(`${field} wajib diisi.`, field);
    return "";
  }
  if (typeof value !== "string") throw invalid(`${field} harus berupa teks.`, field);
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (required && !clean) throw invalid(`${field} wajib diisi.`, field);
  if (clean.length > max) throw invalid(`${field} maksimal ${max} karakter.`, field);
  return clean;
}

function money(value, field) {
  if (value === undefined || value === null || value === "") {
    throw invalid(`${field} wajib diisi.`, field);
  }
  const raw = typeof value === "string" ? value.replace(/[\s.]/g, "").replace(/,/g, ".") : value;
  const num = Number(raw);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    throw invalid(`${field} harus berupa angka bulat rupiah.`, field);
  }
  if (num < 0 || num > MAX_MONEY) {
    throw invalid(`${field} harus antara 0 dan ${MAX_MONEY}.`, field);
  }
  return num;
}

function monthsOf(value) {
  try {
    return reportDeliveries.normalizeMonths(value);
  } catch (_) {
    throw invalid(`months harus bilangan bulat 1-${MAX_MONTHS}.`, "months");
  }
}

function activeFlag(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === 0) return value === 1;
  const clean = String(value).trim().toLowerCase();
  if (["1", "true", "ya", "aktif", "on"].includes(clean)) return true;
  if (["0", "false", "tidak", "nonaktif", "off"].includes(clean)) return false;
  throw invalid("aktif harus berupa boolean.", "aktif");
}

function idOf(value) {
  const num = Number(value);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

function invoiceDays(env, override) {
  const raw = override === undefined
    ? Number.parseInt(env.SUBSCRIPTION_INVOICE_DAYS, 10)
    : Number(override);
  const days = Number.isSafeInteger(raw) && raw > 0 ? raw : DEFAULT_INVOICE_DAYS;
  return Math.max(1, Math.min(MAX_INVOICE_DAYS, days));
}

function daysBetween(from, to) {
  const parse = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };
  const a = parse(from);
  const b = parse(to);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / 86400000);
}

// ------------------------------------------------------------
// Paket harga
// ------------------------------------------------------------

function normalizePackageKey(value) {
  const clean = text(value, "key", 160, true);
  const parts = clean.split("|");
  const rawGrade = String(parts.shift() || "").trim().toUpperCase();
  const name = parts.join("|").trim();
  if (rawGrade && !GRADES.includes(rawGrade)) {
    throw invalid("Jenjang pada key harus SD, SMP, SMK, atau kosong.", "key");
  }
  if (!name) throw invalid("key harus berformat 'Jenjang|Nama jalur'.", "key");
  return { key: `${rawGrade}|${name}`, grade: rawGrade, name };
}

function packageDto(row) {
  return {
    id: Number(row.id),
    key: row.path_key,
    pathName: row.path_name,
    grade: row.grade,
    months: Number(row.months),
    price: Number(row.price),
    active: !!row.aktif,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function findPackage(db, id) {
  const num = idOf(id);
  if (!num) return null;
  return db.prepare("SELECT * FROM subscription_packages WHERE id = ?").get(num) || null;
}

function findPackageByKey(db, key, months) {
  return db.prepare("SELECT * FROM subscription_packages WHERE path_key = ? AND months = ?").get(key, months) || null;
}

function listPackages(db, options = {}) {
  const where = [];
  const params = [];
  if (options.activeOnly !== false) where.push("aktif = 1");
  if (options.grade !== undefined && options.grade !== null && options.grade !== "") {
    where.push("(grade = ? OR grade = '')");
    params.push(String(options.grade).toUpperCase());
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM subscription_packages ${clause}
    ORDER BY (grade = '') ASC, grade ASC, path_name COLLATE NOCASE ASC, months ASC`).all(...params);
  return { items: rows.map(packageDto), total: rows.length };
}

function upsertPackage(db, input = {}, actor = {}) {
  const parsed = normalizePackageKey(input.key);
  const months = monthsOf(input.months);
  const price = money(input.price, "price");
  if (price <= 0) throw invalid("price harus lebih dari 0.", "price");
  const aktif = activeFlag(input.aktif, true) ? 1 : 0;

  return db.transaction(() => {
    const current = findPackageByKey(db, parsed.key, months);
    if (current) {
      db.prepare(`UPDATE subscription_packages
        SET path_name = ?, grade = ?, price = ?, aktif = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(parsed.name, parsed.grade, price, aktif, actor.actorId || null, current.id);
    } else {
      db.prepare(`INSERT INTO subscription_packages
        (path_key, path_name, grade, months, price, aktif, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        parsed.key, parsed.name, parsed.grade, months, price, aktif,
        actor.actorId || null, actor.actorId || null
      );
    }
    const row = findPackageByKey(db, parsed.key, months);
    writeAudit(db, {
      ...actor,
      action: current ? "subscription_package.update" : "subscription_package.create",
      targetType: "subscription_package",
      targetId: row.id,
      details: { key: parsed.key, months, price, aktif: !!aktif }
    });
    return { item: packageDto(row), created: !current };
  })();
}

function deletePackage(db, id, actor = {}) {
  const num = idOf(id);
  if (!num) return null;
  return db.transaction(() => {
    const row = findPackage(db, num);
    if (!row) return null;
    db.prepare("DELETE FROM subscription_packages WHERE id = ?").run(row.id);
    writeAudit(db, {
      ...actor,
      action: "subscription_package.delete",
      targetType: "subscription_package",
      targetId: row.id,
      details: { key: row.path_key, months: Number(row.months) }
    });
    return { id: row.id };
  })();
}

// ------------------------------------------------------------
// Status langganan
// ------------------------------------------------------------

function findStudent(db, id) {
  const num = idOf(id);
  if (!num) return null;
  const row = db.prepare(`SELECT id, username, full_name, role, status, allowed_grades,
      subscription_started_at, subscription_months
    FROM users WHERE id = ?`).get(num);
  return row && row.role === "student" ? row : null;
}

function subscriptionState(db, studentId, options = {}) {
  const user = findStudent(db, studentId);
  if (!user) return null;
  const today = options.today || todayWib();
  const startedAt = user.subscription_started_at || null;
  const months = startedAt ? (Number(user.subscription_months) || reportDeliveries.DEFAULT_MONTHS) : null;
  const endsAt = months ? reportDeliveries.subscriptionEndDate(startedAt, months) : null;
  const active = !!(endsAt && endsAt >= today);
  return {
    startedAt,
    months,
    endsAt,
    active,
    daysLeft: active ? daysBetween(today, endsAt) + 1 : 0,
    firstReportDueDate: months ? reportDeliveries.reportDueDate(startedAt, 1) : null,
    lastReportDueDate: months ? reportDeliveries.reportDueDate(startedAt, months) : null
  };
}

// ------------------------------------------------------------
// Invoice / pembayaran
// ------------------------------------------------------------

function paymentDto(row, options = {}) {
  const hasProof = row.has_proof === undefined
    ? Boolean(row.proof_data)
    : Boolean(Number(row.has_proof));
  const dto = {
    id: Number(row.id),
    code: row.code,
    status: row.status,
    key: row.path_key,
    pathName: row.path_name,
    grade: row.grade,
    months: Number(row.months),
    price: Number(row.price),
    discount: Number(row.discount),
    total: Number(row.total),
    method: row.method,
    note: row.note,
    paidOn: row.paid_on || null,
    expiresOn: row.expires_on || null,
    hasProof,
    proof: hasProof ? {
      name: row.proof_name || "",
      mime: row.proof_mime || "",
      size: Number(row.proof_size) || 0,
      uploadedAt: row.proof_at || null
    } : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
  if (options.admin) {
    dto.studentId = Number(row.student_user_id);
    dto.studentName = row.student_name || null;
    dto.studentUsername = row.student_username || null;
    dto.financeTransactionId = row.finance_transaction_id === null ? null : Number(row.finance_transaction_id);
    dto.confirmedBy = row.confirmed_by === null || row.confirmed_by === undefined ? null : Number(row.confirmed_by);
  }
  return dto;
}

// proof_data tidak pernah ikut di daftar agar respons tetap ringan; detail
// admin membacanya terpisah lewat proofDataUrl().
const PAYMENT_COLUMNS = `p.id, p.code, p.student_user_id, p.package_id, p.path_key, p.path_name,
  p.grade, p.months, p.price, p.discount, p.total, p.method, p.status, p.note, p.paid_on,
  p.paid_at, p.confirmed_by, p.finance_transaction_id, p.expires_on, p.created_at, p.updated_at,
  p.proof_name, p.proof_mime, p.proof_size, p.proof_at,
  CASE WHEN p.proof_data <> '' THEN 1 ELSE 0 END AS has_proof`;

const PAYMENT_SELECT = `
  SELECT ${PAYMENT_COLUMNS},
         COALESCE(NULLIF(u.full_name, ''), u.username) AS student_name, u.username AS student_username
  FROM subscription_payments p
  LEFT JOIN users u ON u.id = p.student_user_id
`;

function proofDataUrl(db, paymentId) {
  const row = db.prepare("SELECT proof_mime, proof_data FROM subscription_payments WHERE id = ?").get(Number(paymentId) || 0);
  if (!row || !row.proof_data) return null;
  return `data:${row.proof_mime || "application/octet-stream"};base64,${row.proof_data}`;
}

function findPayment(db, id) {
  const num = idOf(id);
  if (!num) return null;
  return db.prepare(`${PAYMENT_SELECT} WHERE p.id = ?`).get(num) || null;
}

function expirePending(db, options = {}) {
  const today = options.today || todayWib();
  const where = ["status = 'pending'", "expires_on <> ''", "expires_on < ?"];
  const params = [today];
  if (options.studentId) {
    where.push("student_user_id = ?");
    params.push(Number(options.studentId));
  }
  if (options.paymentId) {
    where.push("id = ?");
    params.push(Number(options.paymentId));
  }
  const rows = db.prepare(`SELECT id, code, student_user_id, finance_transaction_id, expires_on
    FROM subscription_payments WHERE ${where.join(" AND ")}`).all(...params);
  for (const row of rows) {
    db.prepare(`UPDATE subscription_payments SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'`).run(row.id);
    if (row.finance_transaction_id) {
      db.prepare(`UPDATE finance_transactions SET status = 'failed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'`).run(row.finance_transaction_id);
    }
    safeNotify(() => notifyStudent(db, row.student_user_id, {
      kind: "subscription.expired",
      title: "Invoice langganan kedaluwarsa",
      body: `${row.code || "Invoice"} kedaluwarsa pada ${row.expires_on}. Silakan buat invoice baru bila masih ingin berlangganan.`,
      view: "langganan",
      icon: "fa-solid fa-hourglass-end",
      tone: "amber",
      dedupeKey: `subscription.expired:${row.id}`
    }));
  }
  return rows.length;
}

// Pengingat sekali per siklus untuk siswa yang langganannya hampir habis.
// Dijalankan sapuan tiap jam; dedupeKey memakai tanggal berakhir agar tidak
// berulang setiap jam dan tetap terkirim lagi pada siklus berikutnya.
function remindExpiring(db, options = {}) {
  const today = options.today || todayWib();
  const rawDays = Number(options.days);
  const days = Number.isSafeInteger(rawDays) && rawDays > 0 ? Math.min(30, rawDays) : 7;

  const rows = db.prepare(`SELECT id, subscription_started_at, subscription_months
    FROM users
    WHERE role = 'student' AND status = 'active'
      AND subscription_started_at IS NOT NULL AND subscription_started_at <> ''
      AND COALESCE(subscription_months, 1) > 0`).all();

  let sent = 0;
  for (const row of rows) {
    const months = Number(row.subscription_months) || 1;
    const endsAt = reportDeliveries.subscriptionEndDate(row.subscription_started_at, months);
    if (!endsAt || endsAt < today) continue;
    const left = daysBetween(today, endsAt);
    if (left > days) continue;

    sent += safeNotify(() => notifyStudent(db, row.id, {
      kind: "subscription.expiring",
      title: "Langganan akan berakhir",
      body: left === 0
        ? `Langganan berakhir hari ini (${endsAt}). Perpanjang agar laporan bulanan tetap berjalan.`
        : `Langganan berakhir ${endsAt} (${left + 1} hari lagi). Perpanjang agar laporan bulanan tetap berjalan.`,
      view: "langganan",
      icon: "fa-solid fa-hourglass-half",
      tone: "amber",
      dedupeKey: `subscription.expiring:${row.id}:${endsAt}`
    }));
  }
  return sent;
}

function resolvePackage(db, input) {
  if (input.packageId !== undefined && input.packageId !== null && input.packageId !== "") {
    return findPackage(db, input.packageId);
  }
  const parsed = normalizePackageKey(input.key);
  const months = monthsOf(input.months);
  return findPackageByKey(db, parsed.key, months);
}

function instructionsFor(payment, env) {
  return paymentGateway.instructionsFor(payment, env);
}

// ------------------------------------------------------------
// Bukti transfer
// ------------------------------------------------------------

function matchesMagic(buffer, mime) {
  if (mime === "image/png") {
    return buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mime === "image/jpeg") {
    return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === "image/webp") {
    return buffer.length > 12
      && buffer.toString("ascii", 0, 4) === "RIFF"
      && buffer.toString("ascii", 8, 12) === "WEBP";
  }
  if (mime === "application/pdf") {
    return buffer.toString("ascii", 0, 4) === "%PDF";
  }
  return false;
}

function parseProofImage(value) {
  if (typeof value !== "string") {
    throw invalid("Bukti transfer wajib berupa data URL base64.", "image");
  }
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value.trim());
  if (!match) throw invalid("Format bukti transfer harus data URL base64.", "image");

  const mime = match[1].toLowerCase();
  const ext = PROOF_MIMES[mime];
  if (!ext) throw invalid("Bukti transfer harus PNG, JPEG, WEBP, atau PDF.", "image");

  const base64 = match[2].replace(/\s+/g, "");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) throw invalid("Bukti transfer kosong.", "image");
  if (buffer.length > MAX_PROOF_BYTES) {
    throw invalid(`Bukti transfer maksimal ${Math.round(MAX_PROOF_BYTES / 1024)} KB.`, "image");
  }
  if (!matchesMagic(buffer, mime)) {
    throw invalid("Isi file tidak cocok dengan tipe bukti transfer.", "image");
  }
  return { mime, ext, base64, size: buffer.length };
}

function attachProof(db, paymentId, studentId, input = {}, options = {}) {
  return db.transaction(() => {
    const payment = findPayment(db, paymentId);
    if (!payment || Number(payment.student_user_id) !== Number(studentId)) return { found: false };
    if (payment.status !== "pending") {
      throw conflict("Bukti transfer hanya bisa diunggah untuk invoice yang masih menunggu pembayaran.");
    }

    const parsed = parseProofImage(input.image);
    const name = text(input.name, "name", 120) || `bukti-transfer.${parsed.ext}`;
    const uploadedAt = new Date().toISOString();

    db.prepare(`UPDATE subscription_payments
      SET proof_data = ?, proof_mime = ?, proof_name = ?, proof_size = ?, proof_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(parsed.base64, parsed.mime, name, parsed.size, uploadedAt, payment.id);

    writeAudit(db, {
      actorId: studentId,
      actorUsername: options.actorUsername || "student",
      ip: options.ip || null,
      action: "subscription_payment.proof",
      targetType: "subscription_payment",
      targetId: payment.id,
      details: { code: payment.code, mime: parsed.mime, size: parsed.size, name }
    });

    safeNotify(() => notifyAdmins(db, {
      kind: "subscription.proof",
      title: `Bukti transfer langganan: ${studentLabel(payment)}`,
      body: `${payment.code} - ${payment.path_name} ${payment.months} bulan - Rp${rupiah(payment.total)}`,
      view: "langganan",
      icon: "fa-solid fa-receipt",
      tone: "sky",
      dedupeKey: `subscription.proof:${payment.id}`
    }));

    return { found: true, item: paymentDto(findPayment(db, payment.id)) };
  })();
}

function createCheckout(db, studentId, input = {}, options = {}) {
  const student = findStudent(db, studentId);
  if (!student) throw notFound("Murid tidak ditemukan.");
  if (student.status !== "active") throw conflict("Akun murid tidak aktif.");

  const env = options.env || process.env;
  const today = options.today || todayWib();
  const pkg = resolvePackage(db, input);
  if (!pkg) throw notFound("Paket langganan tidak ditemukan.");
  if (!pkg.aktif) throw invalid("Paket langganan sedang tidak aktif.", "packageId");

  const state = subscriptionState(db, studentId, { today });
  if (state.active && state.months + Number(pkg.months) > MAX_MONTHS) {
    throw invalid(`Total langganan tidak boleh melebihi ${MAX_MONTHS} bulan.`, "packageId");
  }

  const expiresOn = reportDeliveries.addDays(today, invoiceDays(env, options.invoiceDays));

  return db.transaction(() => {
    expirePending(db, { studentId, today });

    const existing = db.prepare(`SELECT * FROM subscription_payments
      WHERE student_user_id = ? AND package_id = ? AND status = 'pending' AND expires_on >= ?
      ORDER BY id DESC LIMIT 1`).get(studentId, pkg.id, today);
    if (existing) {
      return { item: paymentDto(existing), reused: true, instructions: instructionsFor(existing, env) };
    }

    const info = db.prepare(`INSERT INTO subscription_payments
      (student_user_id, package_id, path_key, path_name, grade, months, price, discount, total,
       method, status, expires_on)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'Transfer Bank', 'pending', ?)`).run(
      studentId, pkg.id, pkg.path_key, pkg.path_name, pkg.grade,
      Number(pkg.months), Number(pkg.price), Number(pkg.price), expiresOn
    );
    const id = Number(info.lastInsertRowid);
    const code = `SUB-${1000 + id}`;
    db.prepare("UPDATE subscription_payments SET code = ? WHERE id = ?").run(code, id);

    // Pemasukan ikut tercatat di modul Finance. Saat transaksi ini ditandai
    // lunas (dari sini atau dari UI Finance), langganan aktif otomatis.
    const finance = db.prepare(`INSERT INTO finance_transactions
      (student_user_id, learning_path_key, learning_path_name, grade, price, discount, total,
       method, status, note, created_by)
      VALUES (?, ?, ?, ?, ?, 0, ?, 'Transfer Bank', 'pending', ?, ?)`).run(
      studentId, pkg.path_key, pkg.path_name, pkg.grade,
      Number(pkg.price), Number(pkg.price), `Langganan ${pkg.months} bulan (${code})`, studentId
    );
    const financeId = Number(finance.lastInsertRowid);
    db.prepare("UPDATE finance_transactions SET code = ? WHERE id = ?").run(`TRX-${1000 + financeId}`, financeId);
    db.prepare("UPDATE subscription_payments SET finance_transaction_id = ? WHERE id = ?").run(financeId, id);

    const row = findPayment(db, id);
    writeAudit(db, {
      actorId: studentId,
      actorUsername: student.username,
      ip: options.ip || null,
      action: "subscription_payment.create",
      targetType: "subscription_payment",
      targetId: id,
      details: { code, packageId: pkg.id, months: Number(pkg.months), total: Number(pkg.price) }
    });

    safeNotify(() => notifyStudent(db, studentId, {
      kind: "subscription.invoice",
      title: `Invoice langganan: ${pkg.path_name}`,
      body: `${code} - ${pkg.months} bulan - Rp${rupiah(pkg.price)}. Bayar sebelum ${expiresOn}.`,
      view: "langganan",
      icon: "fa-solid fa-file-invoice-dollar",
      tone: "sky",
      dedupeKey: `subscription.invoice:${id}`
    }));
    safeNotify(() => notifyAdmins(db, {
      kind: "subscription.checkout",
      title: `Pembayaran langganan baru: ${studentLabel({ student_name: student.full_name, student_username: student.username, student_user_id: studentId })}`,
      body: `${code} - ${pkg.path_name} ${pkg.months} bulan - Rp${rupiah(pkg.price)}`,
      view: "langganan",
      icon: "fa-solid fa-money-check-dollar",
      tone: "amber",
      dedupeKey: `subscription.checkout:${id}`
    }));

    return { item: paymentDto(row), reused: false, instructions: instructionsFor(row, env) };
  })();
}

function activateSubscription(db, studentId, months, options = {}) {
  const count = monthsOf(months);
  const today = options.today || todayWib();
  const user = findStudent(db, studentId);
  if (!user) throw notFound("Murid tidak ditemukan.");

  const currentStart = user.subscription_started_at || null;
  const currentMonths = currentStart ? (Number(user.subscription_months) || reportDeliveries.DEFAULT_MONTHS) : 0;
  const currentEnd = currentStart ? reportDeliveries.subscriptionEndDate(currentStart, currentMonths) : null;
  const active = !!(currentEnd && currentEnd >= today);

  let startedAt;
  let totalMonths;
  if (active) {
    // Masih aktif: durasi baru ditambahkan setelah masa yang sedang berjalan,
    // jadwal laporan bulanan lama tidak diubah.
    startedAt = currentStart;
    totalMonths = currentMonths + count;
  } else {
    // Sudah habis / belum pernah: mulai siklus baru hari ini. Baris laporan
    // siklus lama diberi penanda periode agar tidak bentrok dengan siklus baru.
    startedAt = today;
    totalMonths = count;
    if (currentStart) {
      db.prepare(`UPDATE report_deliveries SET period = ?, updated_at = CURRENT_TIMESTAMP
        WHERE student_user_id = ? AND period = ''`).run(`cycle:${currentStart}`, studentId);
    }
  }

  if (totalMonths > MAX_MONTHS) {
    throw invalid(`Total langganan tidak boleh melebihi ${MAX_MONTHS} bulan.`, "months");
  }

  db.prepare("UPDATE users SET subscription_started_at = ?, subscription_months = ? WHERE id = ? AND role = 'student'")
    .run(startedAt, totalMonths, studentId);
  const queued = reports.queueGuardianDeliveries(db, studentId, startedAt, totalMonths);

  writeAudit(db, {
    actorId: options.actorId || null,
    actorUsername: options.actorUsername || "system",
    ip: options.ip || null,
    action: "subscription.activate",
    targetType: "user",
    targetId: studentId,
    details: {
      source: options.source || "manual",
      from: currentStart,
      to: startedAt,
      fromMonths: currentMonths || null,
      toMonths: totalMonths,
      extended: active,
      queued: { created: queued.created, revived: queued.revived, total: queued.queued }
    }
  });

  return {
    startedAt,
    months: totalMonths,
    endsAt: reportDeliveries.subscriptionEndDate(startedAt, totalMonths),
    extended: active,
    previousStartedAt: currentStart,
    previousMonths: currentMonths || null,
    queued
  };
}

// Inti konfirmasi. Dipanggil dari endpoint admin dan dari hook Finance.
// `skipFinanceUpdate` dipakai saat transaksi Finance sudah lebih dulu lunas.
function settlePayment(db, paymentId, options = {}) {
  const payment = findPayment(db, paymentId);
  if (!payment) return { found: false };

  if (payment.status === "paid") {
    return {
      found: true,
      alreadyPaid: true,
      item: paymentDto(payment, { admin: options.admin }),
      subscription: subscriptionState(db, payment.student_user_id)
    };
  }
  if (!["pending", "expired", "failed"].includes(payment.status)) {
    throw conflict(`Pembayaran berstatus ${payment.status} tidak bisa dikonfirmasi.`);
  }

  const today = options.today || todayWib();
  const paidOn = options.paidOn || today;
  if (!reportDeliveries.isValidDateOnly(paidOn)) throw invalid("paidAt harus tanggal YYYY-MM-DD.", "paidAt");
  if (paidOn > today) throw invalid("paidAt tidak boleh di masa depan.", "paidAt");

  const nowIso = new Date().toISOString();
  db.prepare(`UPDATE subscription_payments
    SET status = 'paid', paid_on = ?, paid_at = ?, confirmed_by = ?, note = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`).run(paidOn, nowIso, options.actorId || null, options.note || payment.note || "", payment.id);

  if (!options.skipFinanceUpdate && payment.finance_transaction_id) {
    db.prepare(`UPDATE finance_transactions
      SET status = 'paid', paid_on = ?, paid_at = ?, verified_by = ?, verified_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status <> 'paid'`).run(paidOn, nowIso, options.actorId || null, nowIso, payment.finance_transaction_id);
  }

  const activation = activateSubscription(db, payment.student_user_id, payment.months, {
    today: paidOn,
    actorId: options.actorId || null,
    actorUsername: options.actorUsername || "system",
    ip: options.ip || null,
    source: options.source || "manual"
  });

  writeAudit(db, {
    actorId: options.actorId || null,
    actorUsername: options.actorUsername || "system",
    ip: options.ip || null,
    action: "subscription_payment.confirm",
    targetType: "subscription_payment",
    targetId: payment.id,
    details: {
      code: payment.code,
      studentId: payment.student_user_id,
      months: Number(payment.months),
      total: Number(payment.total),
      paidOn,
      source: options.source || "manual",
      extended: activation.extended
    }
  });

  safeNotify(() => notifyStudent(db, payment.student_user_id, {
    kind: "subscription.active",
    title: `Langganan aktif: ${payment.path_name}`,
    body: `${payment.code} lunas. Berlaku sampai ${activation.endsAt} (total ${activation.months} bulan).`,
    view: "langganan",
    icon: "fa-solid fa-circle-check",
    tone: "emerald",
    dedupeKey: `subscription.active:${payment.id}`
  }));

  return {
    found: true,
    alreadyPaid: false,
    item: paymentDto(findPayment(db, payment.id), { admin: options.admin }),
    subscription: subscriptionState(db, payment.student_user_id),
    activation
  };
}

function confirmPayment(db, id, options = {}) {
  return db.transaction(() => settlePayment(db, id, options))();
}

// Pembayaran yang diterima langsung oleh admin (tunai/transfer di kantor).
// Invoice langsung lunas, transaksi Finance ikut tercatat, dan langganan aktif
// tanpa harus menunggu siswa checkout.
function createManualPayment(db, input = {}, options = {}) {
  const studentId = idOf(input.studentId);
  if (!studentId) throw invalid("studentId wajib diisi.", "studentId");
  const student = findStudent(db, studentId);
  if (!student) throw notFound("Murid tidak ditemukan.");
  if (student.status !== "active") throw conflict("Akun murid tidak aktif.");

  const today = options.today || todayWib();
  const pkg = resolvePackage(db, input);
  if (!pkg) throw notFound("Paket langganan tidak ditemukan.");
  if (!pkg.aktif) throw invalid("Paket langganan sedang tidak aktif.", "packageId");

  const state = subscriptionState(db, studentId, { today });
  if (state.active && state.months + Number(pkg.months) > MAX_MONTHS) {
    throw invalid(`Total langganan tidak boleh melebihi ${MAX_MONTHS} bulan.`, "packageId");
  }

  const paidOn = options.paidOn || input.paidAt || today;
  if (!reportDeliveries.isValidDateOnly(paidOn)) throw invalid("paidAt harus tanggal YYYY-MM-DD.", "paidAt");
  if (paidOn > today) throw invalid("paidAt tidak boleh di masa depan.", "paidAt");

  const method = text(input.method, "method", 40) || "Tunai";
  const note = text(input.note, "note", 300) || "Pembayaran manual oleh admin";
  const nowIso = new Date().toISOString();

  return db.transaction(() => {
    expirePending(db, { studentId, today });

    const info = db.prepare(`INSERT INTO subscription_payments
      (student_user_id, package_id, path_key, path_name, grade, months, price, discount, total,
       method, status, note, paid_on, paid_at, confirmed_by, expires_on)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'paid', ?, ?, ?, ?, '')`).run(
      studentId, pkg.id, pkg.path_key, pkg.path_name, pkg.grade,
      Number(pkg.months), Number(pkg.price), Number(pkg.price), method, note,
      paidOn, nowIso, options.actorId || null
    );
    const id = Number(info.lastInsertRowid);
    const code = `SUB-${1000 + id}`;
    db.prepare("UPDATE subscription_payments SET code = ? WHERE id = ?").run(code, id);

    const finance = db.prepare(`INSERT INTO finance_transactions
      (student_user_id, learning_path_key, learning_path_name, grade, price, discount, total,
       method, status, note, created_by, paid_on, paid_at, verified_by, verified_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'paid', ?, ?, ?, ?, ?, ?)`).run(
      studentId, pkg.path_key, pkg.path_name, pkg.grade,
      Number(pkg.price), Number(pkg.price), method,
      `Langganan ${pkg.months} bulan (${code})`, options.actorId || null,
      paidOn, nowIso, options.actorId || null, nowIso
    );
    const financeId = Number(finance.lastInsertRowid);
    db.prepare("UPDATE finance_transactions SET code = ? WHERE id = ?").run(`TRX-${1000 + financeId}`, financeId);
    db.prepare("UPDATE subscription_payments SET finance_transaction_id = ? WHERE id = ?").run(financeId, id);

    const activation = activateSubscription(db, studentId, pkg.months, {
      today: paidOn,
      actorId: options.actorId || null,
      actorUsername: options.actorUsername || "system",
      ip: options.ip || null,
      source: "manual"
    });

    writeAudit(db, {
      actorId: options.actorId || null,
      actorUsername: options.actorUsername || "system",
      ip: options.ip || null,
      action: "subscription_payment.manual",
      targetType: "subscription_payment",
      targetId: id,
      details: {
        code,
        studentId,
        packageId: pkg.id,
        months: Number(pkg.months),
        total: Number(pkg.price),
        method,
        paidOn,
        extended: activation.extended
      }
    });

    safeNotify(() => notifyStudent(db, studentId, {
      kind: "subscription.active",
      title: `Langganan aktif: ${pkg.path_name}`,
      body: `${code} lunas. Berlaku sampai ${activation.endsAt} (total ${activation.months} bulan).`,
      view: "langganan",
      icon: "fa-solid fa-circle-check",
      tone: "emerald",
      dedupeKey: `subscription.active:${id}`
    }));

    return {
      item: paymentDto(findPayment(db, id), { admin: true }),
      subscription: subscriptionState(db, studentId),
      activation
    };
  })();
}

// Dipanggil finance-api saat transaksi berubah menjadi lunas. Aman kalau
// transaksi itu bukan pembayaran langganan (tidak ada baris tertaut).
function activateForFinanceTransaction(db, financeTransactionId, options = {}) {
  const financeId = idOf(financeTransactionId);
  if (!financeId) return { activated: false, reason: "invalid_finance_id" };
  const linked = db.prepare(`SELECT id FROM subscription_payments
    WHERE finance_transaction_id = ? AND status <> 'paid'
    ORDER BY id DESC LIMIT 1`).get(financeId);
  if (!linked) return { activated: false, reason: "no_linked_payment" };
  try {
    const result = db.transaction(() => settlePayment(db, linked.id, {
      ...options,
      skipFinanceUpdate: true,
      source: "finance"
    }))();
    return { activated: true, ...result };
  } catch (error) {
    return { activated: false, reason: "activation_failed", error: error && error.message ? error.message : String(error) };
  }
}

function rejectPayment(db, id, options = {}) {
  return db.transaction(() => {
    const payment = findPayment(db, id);
    if (!payment) return { found: false };
    if (payment.status === "paid") throw conflict("Pembayaran yang sudah lunas tidak bisa ditolak.");
    if (!["pending", "expired", "failed"].includes(payment.status)) {
      throw conflict(`Pembayaran berstatus ${payment.status} tidak bisa ditolak.`);
    }
    db.prepare(`UPDATE subscription_payments SET status = 'failed', note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(options.reason || payment.note || "", payment.id);
    if (payment.finance_transaction_id) {
      db.prepare(`UPDATE finance_transactions SET status = 'failed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status <> 'paid'`).run(payment.finance_transaction_id);
    }
    writeAudit(db, {
      actorId: options.actorId || null,
      actorUsername: options.actorUsername || "system",
      ip: options.ip || null,
      action: "subscription_payment.reject",
      targetType: "subscription_payment",
      targetId: payment.id,
      details: { code: payment.code, reason: options.reason || "" }
    });
    safeNotify(() => notifyStudent(db, payment.student_user_id, {
      kind: "subscription.rejected",
      title: `Pembayaran langganan ditolak: ${payment.path_name}`,
      body: `${payment.code}${options.reason ? ` - ${options.reason}` : ""}. Silakan hubungi admin atau buat invoice baru.`,
      view: "langganan",
      icon: "fa-solid fa-circle-xmark",
      tone: "rose",
      dedupeKey: `subscription.rejected:${payment.id}`
    }));
    return { found: true, item: paymentDto(findPayment(db, payment.id), { admin: true }) };
  })();
}

function cancelPayment(db, id, studentId, options = {}) {
  return db.transaction(() => {
    const payment = findPayment(db, id);
    if (!payment || Number(payment.student_user_id) !== Number(studentId)) return { found: false };
    if (payment.status !== "pending") throw conflict("Hanya pembayaran yang masih menunggu yang bisa dibatalkan.");
    db.prepare(`UPDATE subscription_payments SET status = 'cancelled', note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(options.reason || "Dibatalkan siswa.", payment.id);
    if (payment.finance_transaction_id) {
      db.prepare(`UPDATE finance_transactions SET status = 'failed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'`).run(payment.finance_transaction_id);
    }
    writeAudit(db, {
      actorId: studentId,
      actorUsername: options.actorUsername || "student",
      ip: options.ip || null,
      action: "subscription_payment.cancel",
      targetType: "subscription_payment",
      targetId: payment.id,
      details: { code: payment.code }
    });
    return { found: true, item: paymentDto(findPayment(db, payment.id)) };
  })();
}

function getStudentPayment(db, id, studentId) {
  return db.transaction(() => {
    expirePending(db, { paymentId: id, studentId });
    const payment = findPayment(db, id);
    if (!payment || Number(payment.student_user_id) !== Number(studentId)) return null;
    return paymentDto(payment);
  })();
}

function listStudentPayments(db, studentId, limit = 20) {
  return db.transaction(() => {
    expirePending(db, { studentId });
    const size = Math.max(1, Math.min(100, Number(limit) || 20));
    const rows = db.prepare(`${PAYMENT_SELECT} WHERE p.student_user_id = ?
      ORDER BY p.id DESC LIMIT ?`).all(studentId, size);
    return rows.map((row) => paymentDto(row));
  })();
}

function getStudentOverview(db, studentId, options = {}) {
  const payments = listStudentPayments(db, studentId, 20);
  const pending = payments.find((item) => item.status === "pending") || null;
  return {
    subscription: subscriptionState(db, studentId, options),
    pendingPayment: pending,
    instructions: pending ? instructionsFor(pending, options.env || process.env) : null,
    payments
  };
}

function listPayments(db, query = {}) {
  const where = [];
  const params = [];
  if (query.status !== undefined && query.status !== null && query.status !== "") {
    const status = String(query.status).trim().toLowerCase();
    if (!PAYMENT_STATUSES.includes(status)) {
      throw invalid(`status harus salah satu dari: ${PAYMENT_STATUSES.join(", ")}.`, "status");
    }
    where.push("p.status = ?");
    params.push(status);
  }
  if (query.studentId !== undefined && query.studentId !== null && query.studentId !== "") {
    const studentId = idOf(query.studentId);
    if (!studentId) throw invalid("studentId tidak valid.", "studentId");
    where.push("p.student_user_id = ?");
    params.push(studentId);
  }
  const q = query.q === undefined || query.q === null ? "" : String(query.q).trim();
  if (q) {
    if (q.length > 160) throw invalid("q maksimal 160 karakter.", "q");
    const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
    where.push("(p.code LIKE ? ESCAPE '\\' OR u.full_name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\')");
    params.push(like, like, like);
  }
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, Number.parseInt(query.limit, 10) || 20));
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = db.prepare(`SELECT COUNT(*) AS n FROM subscription_payments p
    LEFT JOIN users u ON u.id = p.student_user_id ${clause}`).get(...params).n;
  const rows = db.prepare(`${PAYMENT_SELECT} ${clause}
    ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit);
  return {
    items: rows.map((row) => paymentDto(row, { admin: true })),
    total: Number(total),
    page,
    limit,
    pages: Math.ceil(Number(total) / limit)
  };
}

function getAdminPayment(db, id) {
  return db.transaction(() => {
    expirePending(db, { paymentId: id });
    const payment = findPayment(db, id);
    if (!payment) return null;
    const dto = paymentDto(payment, { admin: true });
    if (dto.hasProof) dto.proofDataUrl = proofDataUrl(db, payment.id);
    return dto;
  })();
}

function writeAudit(db, entry) {
  try {
    db.prepare(`INSERT INTO admin_audit
      (actor_user_id, actor_username, action, target_type, target_id, details, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      entry.actorId || null,
      entry.actorUsername || "system",
      entry.action,
      entry.targetType || "subscription",
      String(entry.targetId === undefined || entry.targetId === null ? "" : entry.targetId),
      JSON.stringify(entry.details || {}),
      entry.ip || null
    );
  } catch (_) {
    // Audit bersifat pelengkap; jangan menggagalkan alur pembayaran.
  }
}

module.exports = {
  MAX_MONTHS,
  MAX_PROOF_BYTES,
  PAYMENT_STATUSES,
  todayWib,
  normalizePackageKey,
  packageDto,
  findPackage,
  listPackages,
  upsertPackage,
  deletePackage,
  findStudent,
  subscriptionState,
  paymentDto,
  findPayment,
  proofDataUrl,
  createCheckout,
  createManualPayment,
  confirmPayment,
  rejectPayment,
  cancelPayment,
  attachProof,
  activateForFinanceTransaction,
  activateSubscription,
  getStudentPayment,
  listStudentPayments,
  getStudentOverview,
  listPayments,
  getAdminPayment,
  expirePending,
  remindExpiring,
  instructionsFor
};
