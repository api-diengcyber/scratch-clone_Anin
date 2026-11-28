"use strict";

const subscriptionService = require("./subscription-service");

// ============================================================
// KEUANGAN (FINANCE) — portal admin
//
// Modul ini menjadi sumber data menu Finance di portal admin: ringkasan
// pemasukan/pengeluaran, daftar transaksi pembelian learning path oleh siswa,
// verifikasi pembayaran manual, dan pengeluaran operasional.
//
// Semua endpoint di bawah khusus admin. Nominal memakai integer rupiah.
// Tanggal laporan (`paid_on`, `spent_on`) disimpan sebagai YYYY-MM-DD WIB agar
// pengelompokan harian tidak bergeser oleh zona waktu server.
//
// Endpoint:
//   GET    /api/admin/finance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
//   GET    /api/admin/finance/transactions?q=&status=&grade=&learningPathId=
//          &from=&to=&sort=&dir=&page=&limit=
//   POST   /api/admin/finance/transactions
//   PATCH  /api/admin/finance/transactions/:id
//   DELETE /api/admin/finance/transactions/:id
//   GET    /api/admin/finance/expenses?from=&to=&kategori=&q=&page=&limit=
//   POST   /api/admin/finance/expenses
//   PATCH  /api/admin/finance/expenses/:id
//   DELETE /api/admin/finance/expenses/:id
//
//   GET    /api/admin/finance/income?from=&to=&kategori=&q=&page=&limit=
//   POST   /api/admin/finance/income
//   PATCH  /api/admin/finance/income/:id
//   DELETE /api/admin/finance/income/:id
//
//   GET    /api/admin/finance/payroll?periode=&status=&q=&page=&limit=
//   POST   /api/admin/finance/payroll
//   PATCH  /api/admin/finance/payroll/:id
//   POST   /api/admin/finance/payroll/:id/pay
//   DELETE /api/admin/finance/payroll/:id
//
//   GET    /api/admin/finance/budgets?periode=
//   POST   /api/admin/finance/budgets
//   PATCH  /api/admin/finance/budgets/:id
//   DELETE /api/admin/finance/budgets/:id
//
//   GET    /api/admin/finance/company?periode=YYYY-MM
// ============================================================

const GRADES = ["SD", "SMP", "SMK"];
const STATUSES = ["paid", "pending", "failed", "refunded"];
const EXPENSE_STATUSES = ["submitted", "approved", "paid", "rejected"];
const PAYROLL_STATUSES = ["draft", "paid"];
const PAYROLL_TYPES = ["Instruktur", "Staf"];
const PROMO_TIPES = ["persen", "nominal"];
const PROMO_RE = /^[A-Z0-9]{3,20}$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const SORTS = ["tanggal", "total", "nama", "status", "code"];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_MONEY = 1_000_000_000;
const MAX_RANGE_DAYS = 400;

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

function isDateOnly(value) {
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

function invalid(message, field) {
  const err = new Error(message);
  err.code = "FINANCE_INVALID";
  err.field = field || null;
  throw err;
}

function text(value, field, max, required = false) {
  if (value === undefined || value === null) {
    if (required) invalid(`${field} wajib diisi.`, field);
    return "";
  }
  if (typeof value !== "string") invalid(`${field} harus berupa teks.`, field);
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (required && !clean) invalid(`${field} wajib diisi.`, field);
  if (clean.length > max) invalid(`${field} maksimal ${max} karakter.`, field);
  return clean;
}

function money(value, field, { required = false, allowZero = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) invalid(`${field} wajib diisi.`, field);
    return null;
  }
  const raw = typeof value === "string" ? value.replace(/[\s.]/g, "").replace(/,/g, ".") : value;
  const num = Number(raw);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    invalid(`${field} harus berupa angka bulat rupiah.`, field);
  }
  if (num < 0 || (!allowZero && num === 0) || num > MAX_MONEY) {
    invalid(`${field} harus antara ${allowZero ? 0 : 1} dan ${MAX_MONEY}.`, field);
  }
  return num;
}

function dateOnly(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (!isDateOnly(raw)) invalid(`${field} harus tanggal sah YYYY-MM-DD.`, field);
  return raw;
}

function statusOf(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  if (!STATUSES.includes(clean)) {
    invalid(`status harus salah satu dari: ${STATUSES.join(", ")}.`, "status");
  }
  return clean;
}

function gradeOf(value) {
  const clean = String(value === undefined || value === null ? "" : value).trim().toUpperCase();
  if (!clean) return "";
  if (!GRADES.includes(clean)) invalid("grade harus SD, SMP, atau SMK.", "grade");
  return clean;
}

function dayShift(ymd, days) {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function rangeFrom(query) {
  const today = jakartaToday();
  const from = dateOnly(query.from, "from") || `${today.slice(0, 7)}-01`;
  const to = dateOnly(query.to, "to") || today;
  if (from > to) invalid("from harus sebelum atau sama dengan to.", "from");
  const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
  if (span > MAX_RANGE_DAYS) invalid(`Rentang tanggal maksimal ${MAX_RANGE_DAYS + 1} hari.`, "to");
  return { from, to };
}

function pageFrom(query, defaultLimit = 20) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit };
}

function monthOf(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) invalid(`${field} wajib diisi dengan format YYYY-MM.`, field);
    return "";
  }
  const raw = String(value).trim();
  const match = MONTH_RE.exec(raw);
  if (!match) invalid(`${field} harus bulan sah dengan format YYYY-MM.`, field);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) {
    invalid(`${field} harus bulan sah dengan format YYYY-MM.`, field);
  }
  return raw;
}

function periodBounds(periode) {
  const [year, month] = periode.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${periode}-01`, to: `${periode}-${String(last).padStart(2, "0")}` };
}

function currentMonth() {
  return jakartaToday().slice(0, 7);
}

function expenseStatusOf(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  if (!EXPENSE_STATUSES.includes(clean)) {
    invalid(`status harus salah satu dari: ${EXPENSE_STATUSES.join(", ")}.`, "status");
  }
  return clean;
}

function payrollStatusOf(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  if (!PAYROLL_STATUSES.includes(clean)) {
    invalid(`status harus salah satu dari: ${PAYROLL_STATUSES.join(", ")}.`, "status");
  }
  return clean;
}

function payrollTypeOf(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  const found = PAYROLL_TYPES.find((t) => t.toLowerCase() === clean);
  if (!found) invalid(`tipe harus salah satu dari: ${PAYROLL_TYPES.join(", ")}.`, "tipe");
  return found;
}

function promoTypeOf(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  if (!PROMO_TIPES.includes(clean)) {
    invalid(`tipe harus salah satu dari: ${PROMO_TIPES.join(", ")}.`, "tipe");
  }
  return clean;
}

// Kode promo disimpan huruf besar tanpa spasi. String kosong berarti transaksi
// tidak memakai promo.
function promoCodeOf(value) {
  if (value === undefined || value === null || value === "") return "";
  const clean = String(value).trim().toUpperCase();
  if (!PROMO_RE.test(clean)) {
    invalid("promo harus 3-20 karakter huruf/angka.", "promo");
  }
  return clean;
}

function idOf(value) {
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num < 1) return null;
  return num;
}

// Tanggal tampilan transaksi: tanggal pembayaran bila sudah lunas, selain itu
// tanggal pencatatan (dikonversi ke WIB karena created_at memakai UTC).
const TX_DATE = "COALESCE(NULLIF(t.paid_on, ''), date(t.created_at, '+7 hours'))";

function txDto(row) {
  return {
    id: Number(row.id),
    code: row.code || "",
    studentId: row.student_user_id === null || row.student_user_id === undefined
      ? null
      : Number(row.student_user_id),
    studentName: row.student_name || "",
    studentUsername: row.student_username || "",
    grade: row.grade || "",
    learningPathId: row.learning_path_key || "",
    learningPathName: row.learning_path_name || "",
    price: Number(row.price || 0),
    discount: Number(row.discount || 0),
    total: Number(row.total || 0),
    method: row.method || "",
    status: row.status,
    note: row.note || "",
    promo: row.promo_code || "",
    paidAt: row.paid_at || null,
    paidOn: row.paid_on || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function expenseDto(row) {
  return {
    id: Number(row.id),
    code: row.code || "",
    kategori: row.kategori || "",
    nominal: Number(row.nominal || 0),
    tanggal: row.spent_on || "",
    status: row.status || "paid",
    bukti: row.bukti || "",
    keterangan: row.keterangan || "",
    catatan: row.catatan || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function incomeDto(row) {
  return {
    id: Number(row.id),
    code: row.code || "",
    tanggal: row.received_on || "",
    kategori: row.kategori || "",
    keterangan: row.keterangan || "",
    nominal: Number(row.nominal || 0),
    bukti: row.bukti || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function payrollDto(row) {
  return {
    id: Number(row.id),
    code: row.code || "",
    refUserId: row.ref_user_id === null || row.ref_user_id === undefined
      ? null
      : Number(row.ref_user_id),
    nama: row.nama || "",
    tipe: row.tipe || "Staf",
    periode: row.periode || "",
    pokok: Number(row.pokok || 0),
    tunjangan: Number(row.tunjangan || 0),
    bonus: Number(row.bonus || 0),
    potongan: Number(row.potongan || 0),
    total: Number(row.total || 0),
    status: row.status || "draft",
    tanggalBayar: row.paid_on || "",
    metode: row.metode || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function budgetDto(row) {
  return {
    id: Number(row.id),
    periode: row.periode || "",
    kategori: row.kategori || "",
    jumlah: Number(row.jumlah || 0),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function promoDto(row, dipakai) {
  return {
    id: Number(row.id),
    kode: row.kode || "",
    nama: row.nama || "",
    tipe: row.tipe || "persen",
    nilai: Number(row.nilai || 0),
    jenjang: row.jenjang || "",
    mulai: row.mulai || "",
    selesai: row.selesai || "",
    kuota: row.kuota === null || row.kuota === undefined ? null : Number(row.kuota),
    aktif: !!row.aktif,
    dipakai: dipakai === undefined ? 0 : Number(dipakai),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function packageDto(row) {
  return {
    id: Number(row.id),
    key: row.path_key || "",
    harga: Number(row.harga || 0),
    aktif: !!row.aktif,
    updatedAt: row.updated_at || null
  };
}

function registerFinanceApi(app, deps) {
  const { db, auth, sendApiError, sendApiSuccess } = deps;

  const guard = [auth.requireAuth, auth.requireAdmin];

  function dataResponse(res, fn) {
    try {
      return fn();
    } catch (err) {
      if (err && err.code === "FINANCE_INVALID") {
        return sendApiError(res, 400, err.message, "VALIDATION_ERROR", err.field ? { field: err.field } : undefined);
      }
      throw err;
    }
  }

  function audit(req, action, id, details) {
    db.prepare(`INSERT INTO admin_audit (actor_user_id, actor_username, action, target_type, target_id, details, ip)
      VALUES (?, ?, ?, 'finance', ?, ?, ?)`).run(
      req.userId,
      req.user || "unknown",
      action,
      String(id ?? ""),
      JSON.stringify(details || {}),
      req.ip || null
    );
  }

  function findTransaction(id) {
    const num = Number(id);
    if (!Number.isSafeInteger(num) || num < 1) return null;
    return db.prepare("SELECT * FROM finance_transactions WHERE id = ?").get(num) || null;
  }

  function findExpense(id) {
    const num = Number(id);
    if (!Number.isSafeInteger(num) || num < 1) return null;
    return db.prepare("SELECT * FROM finance_expenses WHERE id = ?").get(num) || null;
  }

  function findIncome(id) {
    const num = idOf(id);
    if (!num) return null;
    return db.prepare("SELECT * FROM finance_incomes WHERE id = ?").get(num) || null;
  }

  function findPayroll(id) {
    const num = idOf(id);
    if (!num) return null;
    return db.prepare("SELECT * FROM finance_payroll WHERE id = ?").get(num) || null;
  }

  function findBudget(id) {
    const num = idOf(id);
    if (!num) return null;
    return db.prepare("SELECT * FROM finance_budgets WHERE id = ?").get(num) || null;
  }

  function findPromo(id) {
    const num = idOf(id);
    if (!num) return null;
    return db.prepare("SELECT * FROM finance_promos WHERE id = ?").get(num) || null;
  }

  function findPackage(key) {
    const clean = String(key === undefined || key === null ? "" : key).trim();
    if (!clean) return null;
    return db.prepare("SELECT * FROM finance_packages WHERE path_key = ?").get(clean) || null;
  }

  // Pemakaian promo dihitung dari transaksi yang masih berlaku (lunas atau
  // menunggu). Dipakai untuk kuota dan untuk mencegah hapus promo terpakai.
  function promoUsage(kode) {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM finance_transactions
      WHERE promo_code = ? COLLATE NOCASE AND status IN ('paid', 'pending')`).get(kode);
    return Number(row.n || 0);
  }

  function validPromoCode(code) {
    if (!code) return true;
    return !!db.prepare("SELECT 1 FROM finance_promos WHERE kode = ? COLLATE NOCASE").get(code);
  }

  function txWithStudent(id) {
    return db.prepare(`SELECT t.*, u.full_name AS student_name, u.username AS student_username
      FROM finance_transactions t
      LEFT JOIN users u ON u.id = t.student_user_id
      WHERE t.id = ?`).get(id);
  }

  // ----------------------------------------------------------
  // Ringkasan periode
  // ----------------------------------------------------------
  app.get("/api/admin/finance/summary", guard, (req, res) => dataResponse(res, () => {
    const { from, to } = rangeFrom(req.query);

    const income = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total,
        COALESCE(SUM(discount), 0) AS diskon
      FROM finance_transactions
      WHERE status = 'paid' AND paid_on BETWEEN ? AND ?`).get(from, to);

    const expense = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(nominal), 0) AS total
      FROM finance_expenses
      WHERE status = 'paid' AND spent_on BETWEEN ? AND ?`).get(from, to);

    const expenseStatusRows = db.prepare(`SELECT status, COUNT(*) AS n, COALESCE(SUM(nominal), 0) AS total
      FROM finance_expenses
      WHERE spent_on BETWEEN ? AND ?
      GROUP BY status`).all(from, to);
    const expenseStatus = { submitted: { count: 0, total: 0 }, approved: { count: 0, total: 0 }, paid: { count: 0, total: 0 }, rejected: { count: 0, total: 0 } };
    for (const row of expenseStatusRows) {
      if (!expenseStatus[row.status]) continue;
      expenseStatus[row.status] = { count: Number(row.n || 0), total: Number(row.total || 0) };
    }

    const statusRows = db.prepare(`SELECT t.status, COUNT(*) AS n, COALESCE(SUM(t.total), 0) AS total
      FROM finance_transactions t
      WHERE ${TX_DATE} BETWEEN ? AND ?
      GROUP BY t.status`).all(from, to);

    const statusCount = { paid: 0, pending: 0, failed: 0, refunded: 0 };
    const statusTotal = { paid: 0, pending: 0, failed: 0, refunded: 0 };
    for (const row of statusRows) {
      if (statusCount[row.status] === undefined) continue;
      statusCount[row.status] = Number(row.n || 0);
      statusTotal[row.status] = Number(row.total || 0);
    }

    const perJenjang = GRADES.map((grade) => {
      const row = db.prepare(`SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS n
        FROM finance_transactions
        WHERE status = 'paid' AND paid_on BETWEEN ? AND ? AND grade = ?`).get(from, to, grade);
      return { grade, total: Number(row.total || 0), count: Number(row.n || 0) };
    });

    const pengeluaranKategori = db.prepare(`SELECT kategori, COALESCE(SUM(nominal), 0) AS total, COUNT(*) AS n
      FROM finance_expenses
      WHERE status = 'paid' AND spent_on BETWEEN ? AND ?
      GROUP BY kategori
      ORDER BY total DESC, kategori ASC`).all(from, to).map((row) => ({
      kategori: row.kategori || "",
      total: Number(row.total || 0),
      count: Number(row.n || 0)
    }));

    const lain = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(nominal), 0) AS total
      FROM finance_incomes
      WHERE received_on BETWEEN ? AND ?`).get(from, to);

    const payroll = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total
      FROM finance_payroll
      WHERE status = 'paid' AND paid_on BETWEEN ? AND ?`).get(from, to);

    const masukHarian = new Map(db.prepare(`SELECT paid_on AS tanggal, COALESCE(SUM(total), 0) AS total
      FROM finance_transactions
      WHERE status = 'paid' AND paid_on BETWEEN ? AND ?
      GROUP BY paid_on`).all(from, to).map((row) => [row.tanggal, Number(row.total || 0)]));
    const keluarHarian = new Map(db.prepare(`SELECT spent_on AS tanggal, COALESCE(SUM(nominal), 0) AS total
      FROM finance_expenses
      WHERE status = 'paid' AND spent_on BETWEEN ? AND ?
      GROUP BY spent_on`).all(from, to).map((row) => [row.tanggal, Number(row.total || 0)]));

    const harian = [];
    for (let day = from; day <= to; day = dayShift(day, 1)) {
      harian.push({ tanggal: day, masuk: masukHarian.get(day) || 0, keluar: keluarHarian.get(day) || 0 });
    }

    const pemasukan = Number(income.total || 0);
    const pemasukanLain = Number(lain.total || 0);
    const pengeluaran = Number(expense.total || 0);
    const payrollDibayar = Number(payroll.total || 0);
    return sendApiSuccess(res, {
      from,
      to,
      pemasukan,
      pemasukanLain,
      pengeluaran,
      payroll: { count: Number(payroll.n || 0), total: payrollDibayar },
      laba: pemasukan + pemasukanLain - pengeluaran - payrollDibayar,
      labaOperasional: pemasukan - pengeluaran,
      diskon: Number(income.diskon || 0),
      transaksi: {
        total: Object.values(statusCount).reduce((sum, n) => sum + n, 0),
        paid: statusCount.paid,
        pending: statusCount.pending,
        failed: statusCount.failed,
        refunded: statusCount.refunded,
        pemasukan,
        menunggu: statusTotal.pending
      },
      menunggu: { total: statusTotal.pending, count: statusCount.pending },
      perJenjang,
      pengeluaranKategori,
      pengeluaranStatus: expenseStatus,
      harian
    });
  }));

  // ----------------------------------------------------------
  // Transaksi siswa
  // ----------------------------------------------------------
  app.get("/api/admin/finance/transactions", guard, (req, res) => dataResponse(res, () => {
    const { page, limit } = pageFrom(req.query);
    const where = [];
    const params = [];

    const q = text(req.query.q, "q", 100);
    if (q) {
      const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
      where.push(`(t.code LIKE ? ESCAPE '\\' OR u.full_name LIKE ? ESCAPE '\\'
        OR u.username LIKE ? ESCAPE '\\' OR t.learning_path_name LIKE ? ESCAPE '\\')`);
      params.push(like, like, like, like);
    }
    const status = req.query.status ? statusOf(req.query.status) : "";
    if (status) { where.push("t.status = ?"); params.push(status); }
    const grade = req.query.grade ? gradeOf(req.query.grade) : "";
    if (grade) { where.push("t.grade = ?"); params.push(grade); }
    const path = text(req.query.learningPathId, "learningPathId", 160);
    if (path) { where.push("t.learning_path_key = ?"); params.push(path); }
    const from = dateOnly(req.query.from, "from");
    const to = dateOnly(req.query.to, "to");
    if (from && to && from > to) invalid("from harus sebelum atau sama dengan to.", "from");
    if (from) { where.push(`${TX_DATE} >= ?`); params.push(from); }
    if (to) { where.push(`${TX_DATE} <= ?`); params.push(to); }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const sort = SORTS.includes(String(req.query.sort || "").toLowerCase())
      ? String(req.query.sort).toLowerCase()
      : "tanggal";
    const dir = String(req.query.dir || "").toLowerCase() === "asc" ? "ASC" : "DESC";
    const orderColumn = {
      tanggal: TX_DATE,
      total: "t.total",
      nama: "u.full_name COLLATE NOCASE",
      status: "t.status",
      code: "t.code"
    }[sort];
    const order = `ORDER BY ${orderColumn} ${dir}, t.id ${dir}`;

    const totalRow = db.prepare(`SELECT COUNT(*) AS n FROM finance_transactions t
      LEFT JOIN users u ON u.id = t.student_user_id ${clause}`).get(...params);
    const total = Number(totalRow.n || 0);
    const pages = Math.ceil(total / limit) || 1;
    const safePage = Math.min(page, pages);
    const offset = (safePage - 1) * limit;

    const rows = db.prepare(`SELECT t.*, u.full_name AS student_name, u.username AS student_username
      FROM finance_transactions t
      LEFT JOIN users u ON u.id = t.student_user_id
      ${clause}
      ${order}
      LIMIT ? OFFSET ?`).all(...params, limit, offset);

    const ringkasanRow = db.prepare(`SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN t.status = 'paid' THEN t.total ELSE 0 END), 0) AS pemasukan,
        COALESCE(SUM(CASE WHEN t.status = 'pending' THEN t.total ELSE 0 END), 0) AS menunggu,
        COALESCE(SUM(CASE WHEN t.status = 'paid' THEN t.discount ELSE 0 END), 0) AS diskon,
        COALESCE(SUM(CASE WHEN t.status = 'paid' THEN 1 ELSE 0 END), 0) AS paid,
        COALESCE(SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
        COALESCE(SUM(CASE WHEN t.status = 'refunded' THEN 1 ELSE 0 END), 0) AS refunded
      FROM finance_transactions t
      LEFT JOIN users u ON u.id = t.student_user_id ${clause}`).get(...params);

    return sendApiSuccess(res, {
      items: rows.map(txDto),
      total,
      page: safePage,
      pages,
      limit,
      ringkasan: {
        total: Number(ringkasanRow.total || 0),
        pemasukan: Number(ringkasanRow.pemasukan || 0),
        menunggu: Number(ringkasanRow.menunggu || 0),
        diskon: Number(ringkasanRow.diskon || 0),
        paid: Number(ringkasanRow.paid || 0),
        pending: Number(ringkasanRow.pending || 0),
        failed: Number(ringkasanRow.failed || 0),
        refunded: Number(ringkasanRow.refunded || 0)
      }
    });
  }));

  app.post("/api/admin/finance/transactions", guard, (req, res) => dataResponse(res, () => {
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      invalid("Body transaksi harus berupa objek.", "body");
    }

    const studentId = Number(body.studentId);
    if (!Number.isSafeInteger(studentId) || studentId < 1) invalid("studentId wajib diisi.", "studentId");
    const student = db.prepare(`SELECT id, full_name, username, allowed_grades FROM users
      WHERE id = ? AND role = 'student' AND status <> 'deleted'`).get(studentId);
    if (!student) invalid("Siswa tidak ditemukan.", "studentId");

    const learningPathId = text(body.learningPathId, "learningPathId", 160, true);
    const fallbackName = learningPathId.includes("|")
      ? learningPathId.split("|").slice(1).join("|").trim()
      : learningPathId;
    const learningPathName = text(body.learningPathName, "learningPathName", 200) || fallbackName;

    let grade = gradeOf(body.grade);
    if (!grade) {
      const prefix = learningPathId.split("|")[0].trim().toUpperCase();
      if (GRADES.includes(prefix)) grade = prefix;
    }
    if (!grade) {
      try {
        const allowed = JSON.parse(student.allowed_grades || "[]");
        if (Array.isArray(allowed) && GRADES.includes(String(allowed[0] || "").toUpperCase())) {
          grade = String(allowed[0]).toUpperCase();
        }
      } catch (_) { /* biarkan kosong */ }
    }

    const price = money(body.price, "price", { required: true });
    const discount = money(body.discount, "discount") ?? 0;
    if (discount > price) invalid("discount tidak boleh melebihi price.", "discount");
    const total = price - discount;
    const method = text(body.method, "method", 60, true);
    const status = statusOf(body.status, "pending");
    const note = text(body.note, "note", 500);
    const promo = promoCodeOf(body.promo);
    if (promo && !validPromoCode(promo)) invalid("Kode promo tidak ditemukan.", "promo");
    const paidAt = dateOnly(body.paidAt, "paidAt");
    const isPaid = status === "paid";

    const info = db.prepare(`INSERT INTO finance_transactions
      (student_user_id, learning_path_key, learning_path_name, grade, price, discount, total,
       method, status, note, promo_code, paid_at, paid_on, verified_by, verified_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      studentId,
      learningPathId,
      learningPathName,
      grade,
      price,
      discount,
      total,
      method,
      status,
      note,
      promo,
      isPaid ? new Date().toISOString() : null,
      isPaid ? (paidAt || jakartaToday()) : "",
      isPaid ? req.userId : null,
      isPaid ? new Date().toISOString() : null,
      req.userId
    );

    const id = Number(info.lastInsertRowid);
    const code = `TRX-${1000 + id}`;
    db.prepare("UPDATE finance_transactions SET code = ? WHERE id = ?").run(code, id);
    audit(req, "finance_transaction.create", id, {
      code,
      studentId,
      total,
      status
    });
    return sendApiSuccess(res, { item: txDto(txWithStudent(id)) }, "Transaksi dibuat.", 201);
  }));

  app.patch("/api/admin/finance/transactions/:id", guard, (req, res) => dataResponse(res, () => {
    const current = findTransaction(req.params.id);
    if (!current) return sendApiError(res, 404, "Transaksi tidak ditemukan.", "NOT_FOUND");
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      invalid("Body transaksi harus berupa objek.", "body");
    }

    const next = { ...current };
    const fields = [];

    if (body.price !== undefined) {
      next.price = money(body.price, "price", { required: true });
      fields.push("price");
    }
    if (body.discount !== undefined) {
      next.discount = money(body.discount, "discount") ?? 0;
      fields.push("discount");
    }
    if (next.discount > next.price) invalid("discount tidak boleh melebihi price.", "discount");
    next.total = next.price - next.discount;

    if (body.method !== undefined) {
      next.method = text(body.method, "method", 60, true);
      fields.push("method");
    }
    if (body.note !== undefined) {
      next.note = text(body.note, "note", 500);
      fields.push("note");
    }
    if (body.promo !== undefined) {
      next.promo_code = promoCodeOf(body.promo);
      if (next.promo_code && !validPromoCode(next.promo_code)) invalid("Kode promo tidak ditemukan.", "promo");
      fields.push("promo");
    }

    if (body.status !== undefined) {
      next.status = statusOf(body.status, current.status);
      fields.push("status");
      if (next.status === "paid" && !current.paid_on) {
        next.paid_on = dateOnly(body.paidAt, "paidAt") || jakartaToday();
        next.paid_at = new Date().toISOString();
        next.verified_by = req.userId;
        next.verified_at = new Date().toISOString();
      } else if (next.status === "paid") {
        next.paid_at = current.paid_at || new Date().toISOString();
        next.verified_by = current.verified_by || req.userId;
        next.verified_at = current.verified_at || new Date().toISOString();
      } else {
        next.paid_on = "";
        next.paid_at = null;
        next.verified_by = null;
        next.verified_at = null;
      }
    } else if (body.paidAt !== undefined && next.status === "paid") {
      next.paid_on = dateOnly(body.paidAt, "paidAt") || jakartaToday();
      fields.push("paidAt");
    }

    if (!fields.length) invalid("Tidak ada perubahan yang dikirim.", "body");

    db.prepare(`UPDATE finance_transactions SET price = ?, discount = ?, total = ?, method = ?,
        status = ?, note = ?, promo_code = ?, paid_at = ?, paid_on = ?, verified_by = ?, verified_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(
      next.price,
      next.discount,
      next.total,
      next.method,
      next.status,
      next.note,
      next.promo_code || "",
      next.paid_at || null,
      next.paid_on || "",
      next.verified_by || null,
      next.verified_at || null,
      current.id
    );
    audit(req, "finance_transaction.update", current.id, {
      code: current.code,
      fields,
      status: next.status,
      total: next.total
    });

    // Kalau transaksi ini tertaut ke invoice langganan, menandai lunas di sini
    // (mis. lewat UI Finance) langsung mengaktifkan/memperpanjang langganan.
    if (next.status === "paid" && current.status !== "paid") {
      const activation = subscriptionService.activateForFinanceTransaction(db, current.id, {
        actorId: req.userId,
        actorUsername: req.user,
        ip: req.ip || null
      });
      if (!activation.activated && activation.reason === "activation_failed") {
        console.error("[LANGGANAN] Gagal mengaktifkan langganan dari transaksi finance:", activation.error);
      }
    }

    return sendApiSuccess(res, { item: txDto(txWithStudent(current.id)) }, "Transaksi diperbarui.");
  }));

  app.delete("/api/admin/finance/transactions/:id", guard, (req, res) => {
    const current = findTransaction(req.params.id);
    if (!current) return sendApiError(res, 404, "Transaksi tidak ditemukan.", "NOT_FOUND");
    db.prepare("DELETE FROM finance_transactions WHERE id = ?").run(current.id);
    audit(req, "finance_transaction.delete", current.id, {
      code: current.code,
      status: current.status,
      total: current.total
    });
    return sendApiSuccess(res, { id: current.id }, "Transaksi dihapus.");
  });

  // ----------------------------------------------------------
  // Pengeluaran
  // ----------------------------------------------------------
  app.get("/api/admin/finance/expenses", guard, (req, res) => dataResponse(res, () => {
    const { page, limit } = pageFrom(req.query, 20);
    const where = [];
    const params = [];

    const q = text(req.query.q, "q", 100);
    if (q) {
      const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
      where.push("(kategori LIKE ? ESCAPE '\\' OR keterangan LIKE ? ESCAPE '\\' OR catatan LIKE ? ESCAPE '\\')");
      params.push(like, like, like);
    }
    const kategori = text(req.query.kategori, "kategori", 80);
    if (kategori) { where.push("kategori = ?"); params.push(kategori); }
    // Total "dibayar" dihitung tanpa filter status, jadi tetap informatif saat
    // daftar sedang difilter ke status lain.
    const paidWhere = where.slice();
    const paidParams = params.slice();
    const status = req.query.status ? expenseStatusOf(req.query.status) : "";
    if (status) { where.push("status = ?"); params.push(status); }
    const from = dateOnly(req.query.from, "from");
    const to = dateOnly(req.query.to, "to");
    if (from && to && from > to) invalid("from harus sebelum atau sama dengan to.", "from");
    if (from) { where.push("spent_on >= ?"); params.push(from); }
    if (to) { where.push("spent_on <= ?"); params.push(to); }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const totalRow = db.prepare(`SELECT COUNT(*) AS n FROM finance_expenses ${clause}`).get(...params);
    const total = Number(totalRow.n || 0);
    const pages = Math.ceil(total / limit) || 1;
    const safePage = Math.min(page, pages);

    const rows = db.prepare(`SELECT * FROM finance_expenses ${clause}
      ORDER BY spent_on DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, (safePage - 1) * limit);
    const sumRow = db.prepare(`SELECT COALESCE(SUM(nominal), 0) AS total FROM finance_expenses ${clause}`)
      .get(...params);
    const paidRow = db.prepare(`SELECT COALESCE(SUM(nominal), 0) AS total FROM finance_expenses
      WHERE status = 'paid' ${paidWhere.length ? "AND " + paidWhere.join(" AND ") : ""}`).get(...paidParams);

    return sendApiSuccess(res, {
      items: rows.map(expenseDto),
      total,
      page: safePage,
      pages,
      limit,
      ringkasan: {
        total: Number(sumRow.total || 0),
        dibayar: Number(paidRow.total || 0)
      }
    });
  }));

  app.post("/api/admin/finance/expenses", guard, (req, res) => dataResponse(res, () => {
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      invalid("Body pengeluaran harus berupa objek.", "body");
    }
    const kategori = text(body.kategori, "kategori", 80, true);
    const nominal = money(body.nominal, "nominal", { required: true, allowZero: false });
    const tanggal = dateOnly(body.tanggal, "tanggal") || jakartaToday();
    const keterangan = text(body.keterangan, "keterangan", 200);
    const catatan = text(body.catatan, "catatan", 500);
    const status = expenseStatusOf(body.status, "paid");
    const bukti = text(body.bukti, "bukti", 200);

    const info = db.prepare(`INSERT INTO finance_expenses
      (kategori, nominal, spent_on, keterangan, catatan, status, bukti, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      kategori, nominal, tanggal, keterangan, catatan, status, bukti, req.userId
    );
    const id = Number(info.lastInsertRowid);
    const code = `EXP-${500 + id}`;
    db.prepare("UPDATE finance_expenses SET code = ? WHERE id = ?").run(code, id);
    audit(req, "finance_expense.create", id, { code, kategori, nominal, tanggal, status });
    return sendApiSuccess(res, { item: expenseDto(findExpense(id)) }, "Pengeluaran dibuat.", 201);
  }));

  app.patch("/api/admin/finance/expenses/:id", guard, (req, res) => dataResponse(res, () => {
    const current = findExpense(req.params.id);
    if (!current) return sendApiError(res, 404, "Pengeluaran tidak ditemukan.", "NOT_FOUND");
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      invalid("Body pengeluaran harus berupa objek.", "body");
    }
    const next = { ...current };
    const fields = [];
    if (body.kategori !== undefined) {
      next.kategori = text(body.kategori, "kategori", 80, true);
      fields.push("kategori");
    }
    if (body.nominal !== undefined) {
      next.nominal = money(body.nominal, "nominal", { required: true, allowZero: false });
      fields.push("nominal");
    }
    if (body.tanggal !== undefined) {
      next.spent_on = dateOnly(body.tanggal, "tanggal") || jakartaToday();
      fields.push("tanggal");
    }
    if (body.keterangan !== undefined) {
      next.keterangan = text(body.keterangan, "keterangan", 200);
      fields.push("keterangan");
    }
    if (body.catatan !== undefined) {
      next.catatan = text(body.catatan, "catatan", 500);
      fields.push("catatan");
    }
    if (body.status !== undefined) {
      next.status = expenseStatusOf(body.status, next.status || "paid");
      fields.push("status");
    }
    if (body.bukti !== undefined) {
      next.bukti = text(body.bukti, "bukti", 200);
      fields.push("bukti");
    }
    if (!fields.length) invalid("Tidak ada perubahan yang dikirim.", "body");

    db.prepare(`UPDATE finance_expenses SET kategori = ?, nominal = ?, spent_on = ?,
        keterangan = ?, catatan = ?, status = ?, bukti = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(next.kategori, next.nominal, next.spent_on, next.keterangan || "",
      next.catatan, next.status || "paid", next.bukti || "", current.id);
    audit(req, "finance_expense.update", current.id, { code: current.code, fields });
    return sendApiSuccess(res, { item: expenseDto(findExpense(current.id)) }, "Pengeluaran diperbarui.");
  }));

  app.delete("/api/admin/finance/expenses/:id", guard, (req, res) => {
    const current = findExpense(req.params.id);
    if (!current) return sendApiError(res, 404, "Pengeluaran tidak ditemukan.", "NOT_FOUND");
    db.prepare("DELETE FROM finance_expenses WHERE id = ?").run(current.id);
    audit(req, "finance_expense.delete", current.id, {
      code: current.code,
      kategori: current.kategori,
      nominal: current.nominal
    });
    return sendApiSuccess(res, { id: current.id }, "Pengeluaran dihapus.");
  });

  // ----------------------------------------------------------
  // Pemasukan perusahaan (donasi, sponsor, penjualan, dsb.)
  // ----------------------------------------------------------
  app.get("/api/admin/finance/income", guard, (req, res) => dataResponse(res, () => {
    const { page, limit } = pageFrom(req.query, 20);
    const where = [];
    const params = [];

    const q = text(req.query.q, "q", 100);
    if (q) {
      const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
      where.push(`(code LIKE ? ESCAPE '\\' OR kategori LIKE ? ESCAPE '\\' OR keterangan LIKE ? ESCAPE '\\')`);
      params.push(like, like, like);
    }
    const kategori = text(req.query.kategori, "kategori", 80);
    if (kategori) { where.push("kategori = ?"); params.push(kategori); }
    const from = dateOnly(req.query.from, "from");
    const to = dateOnly(req.query.to, "to");
    if (from && to && from > to) invalid("from harus sebelum atau sama dengan to.", "from");
    if (from) { where.push("received_on >= ?"); params.push(from); }
    if (to) { where.push("received_on <= ?"); params.push(to); }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const totalRow = db.prepare(`SELECT COUNT(*) AS n FROM finance_incomes ${clause}`).get(...params);
    const total = Number(totalRow.n || 0);
    const pages = Math.ceil(total / limit) || 1;
    const safePage = Math.min(page, pages);
    const rows = db.prepare(`SELECT * FROM finance_incomes ${clause}
      ORDER BY received_on DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, (safePage - 1) * limit);
    const sumRow = db.prepare(`SELECT COALESCE(SUM(nominal), 0) AS total FROM finance_incomes ${clause}`)
      .get(...params);

    return sendApiSuccess(res, {
      items: rows.map(incomeDto),
      total,
      page: safePage,
      pages,
      limit,
      ringkasan: { total: Number(sumRow.total || 0) }
    });
  }));

  app.post("/api/admin/finance/income", guard, (req, res) => dataResponse(res, () => {
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      invalid("Body pemasukan harus berupa objek.", "body");
    }
    const kategori = text(body.kategori, "kategori", 80, true);
    const keterangan = text(body.keterangan, "keterangan", 200);
    const nominal = money(body.nominal, "nominal", { required: true, allowZero: false });
    const tanggal = dateOnly(body.tanggal, "tanggal") || jakartaToday();
    const bukti = text(body.bukti, "bukti", 200);

    const info = db.prepare(`INSERT INTO finance_incomes
      (kategori, keterangan, nominal, received_on, bukti, created_by)
      VALUES (?, ?, ?, ?, ?, ?)`).run(kategori, keterangan, nominal, tanggal, bukti, req.userId);
    const id = Number(info.lastInsertRowid);
    const code = `INC-${300 + id}`;
    db.prepare("UPDATE finance_incomes SET code = ? WHERE id = ?").run(code, id);
    audit(req, "finance_income.create", id, { code, kategori, nominal, tanggal });
    return sendApiSuccess(res, { item: incomeDto(findIncome(id)) }, "Pemasukan dibuat.", 201);
  }));

  app.patch("/api/admin/finance/income/:id", guard, (req, res) => dataResponse(res, () => {
    const current = findIncome(req.params.id);
    if (!current) return sendApiError(res, 404, "Pemasukan tidak ditemukan.", "NOT_FOUND");
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      invalid("Body pemasukan harus berupa objek.", "body");
    }
    const next = { ...current };
    const fields = [];
    if (body.kategori !== undefined) {
      next.kategori = text(body.kategori, "kategori", 80, true);
      fields.push("kategori");
    }
    if (body.keterangan !== undefined) {
      next.keterangan = text(body.keterangan, "keterangan", 200);
      fields.push("keterangan");
    }
    if (body.nominal !== undefined) {
      next.nominal = money(body.nominal, "nominal", { required: true, allowZero: false });
      fields.push("nominal");
    }
    if (body.tanggal !== undefined) {
      next.received_on = dateOnly(body.tanggal, "tanggal") || jakartaToday();
      fields.push("tanggal");
    }
    if (body.bukti !== undefined) {
      next.bukti = text(body.bukti, "bukti", 200);
      fields.push("bukti");
    }
    if (!fields.length) invalid("Tidak ada perubahan yang dikirim.", "body");

    db.prepare(`UPDATE finance_incomes SET kategori = ?, keterangan = ?, nominal = ?,
        received_on = ?, bukti = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(next.kategori, next.keterangan, next.nominal,
      next.received_on, next.bukti, current.id);
    audit(req, "finance_income.update", current.id, { code: current.code, fields });
    return sendApiSuccess(res, { item: incomeDto(findIncome(current.id)) }, "Pemasukan diperbarui.");
  }));

  app.delete("/api/admin/finance/income/:id", guard, (req, res) => {
    const current = findIncome(req.params.id);
    if (!current) return sendApiError(res, 404, "Pemasukan tidak ditemukan.", "NOT_FOUND");
    db.prepare("DELETE FROM finance_incomes WHERE id = ?").run(current.id);
    audit(req, "finance_income.delete", current.id, {
      code: current.code,
      kategori: current.kategori,
      nominal: current.nominal
    });
    return sendApiSuccess(res, { id: current.id }, "Pemasukan dihapus.");
  });

  // ----------------------------------------------------------
  // Payroll (gaji & honor)
  // ----------------------------------------------------------
  function payrollMember(refUserId) {
    const row = db.prepare(`SELECT id, full_name, username, role FROM users
      WHERE id = ? AND status <> 'deleted'`).get(refUserId);
    if (!row) invalid("Penerima tidak ditemukan.", "refUserId");
    if (row.role !== "instruktur") invalid("Penerima harus user berstatus instruktur.", "refUserId");
    return { id: Number(row.id), nama: row.full_name || row.username || `Instruktur #${row.id}` };
  }

  function payrollDuplicate(periode, refUserId, nama, excludeId) {
    if (refUserId) {
      return db.prepare(`SELECT id FROM finance_payroll
        WHERE periode = ? AND ref_user_id = ? AND id <> ?`).get(periode, refUserId, excludeId) || null;
    }
    return db.prepare(`SELECT id FROM finance_payroll
      WHERE periode = ? AND tipe = 'Staf' AND nama = ? COLLATE NOCASE AND id <> ?`)
      .get(periode, nama, excludeId) || null;
  }

  function payrollConflict(res, periode, refUserId, nama, excludeId) {
    if (!payrollDuplicate(periode, refUserId, nama, excludeId)) return false;
    sendApiError(res, 409, `${nama} sudah punya payroll untuk periode ${periode}.`, "CONFLICT");
    return true;
  }

  app.get("/api/admin/finance/payroll", guard, (req, res) => dataResponse(res, () => {
    const { page, limit } = pageFrom(req.query, 20);
    const where = [];
    const params = [];

    const periode = monthOf(req.query.periode, "periode");
    if (periode) { where.push("periode = ?"); params.push(periode); }
    const q = text(req.query.q, "q", 100);
    if (q) {
      const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
      where.push(`(code LIKE ? ESCAPE '\\' OR nama LIKE ? ESCAPE '\\')`);
      params.push(like, like);
    }
    // Ringkasan dihitung tanpa filter status agar kartu Draft/Dibayar tetap
    // menampilkan total periode yang sedang difilter.
    const summaryWhere = where.slice();
    const summaryParams = params.slice();
    const status = req.query.status ? payrollStatusOf(req.query.status) : "";
    if (status) { where.push("status = ?"); params.push(status); }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const totalRow = db.prepare(`SELECT COUNT(*) AS n FROM finance_payroll ${clause}`).get(...params);
    const total = Number(totalRow.n || 0);
    const pages = Math.ceil(total / limit) || 1;
    const safePage = Math.min(page, pages);
    const rows = db.prepare(`SELECT * FROM finance_payroll ${clause}
      ORDER BY periode DESC, nama COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?`)
      .all(...params, limit, (safePage - 1) * limit);

    const summaryClause = summaryWhere.length ? `WHERE ${summaryWhere.join(" AND ")}` : "";
    const sumRow = db.prepare(`SELECT
        COALESCE(SUM(total), 0) AS total,
        COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS draft_n,
        COALESCE(SUM(CASE WHEN status = 'draft' THEN total ELSE 0 END), 0) AS draft_total,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) AS paid_n,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0) AS paid_total
      FROM finance_payroll ${summaryClause}`).get(...summaryParams);

    return sendApiSuccess(res, {
      items: rows.map(payrollDto),
      total,
      page: safePage,
      pages,
      limit,
      ringkasan: {
        total: Number(sumRow.total || 0),
        draft: { count: Number(sumRow.draft_n || 0), total: Number(sumRow.draft_total || 0) },
        paid: { count: Number(sumRow.paid_n || 0), total: Number(sumRow.paid_total || 0) }
      }
    });
  }));

  app.post("/api/admin/finance/payroll", guard, (req, res) => dataResponse(res, () => {
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      invalid("Body payroll harus berupa objek.", "body");
    }
    const periode = monthOf(body.periode, "periode", { required: true });
    if (periode > currentMonth()) invalid("periode tidak boleh di masa depan.", "periode");

    const refRaw = body.refUserId;
    const refUserId = refRaw === undefined || refRaw === null || refRaw === ""
      ? null
      : idOf(refRaw);
    if (refRaw !== undefined && refRaw !== null && refRaw !== "" && !refUserId) {
      invalid("refUserId tidak valid.", "refUserId");
    }
    let tipe = "Staf";
    let nama = "";
    let refId = null;
    if (refUserId) {
      const member = payrollMember(refUserId);
      tipe = "Instruktur";
      nama = member.nama;
      refId = member.id;
    } else {
      tipe = payrollTypeOf(body.tipe, "Staf");
      if (tipe === "Instruktur") invalid("Pilih penerima instruktur dari refUserId.", "refUserId");
      nama = text(body.nama, "nama", 60, true);
      if (nama.length < 2) invalid("nama minimal 2 karakter.", "nama");
    }

    const pokok = money(body.pokok, "pokok", { required: true, allowZero: false });
    const tunjangan = money(body.tunjangan, "tunjangan") ?? 0;
    const bonus = money(body.bonus, "bonus") ?? 0;
    const potongan = money(body.potongan, "potongan") ?? 0;
    if (potongan > pokok + tunjangan + bonus) {
      invalid("potongan tidak boleh melebihi pokok + tunjangan + bonus.", "potongan");
    }
    const total = pokok + tunjangan + bonus - potongan;

    if (payrollConflict(res, periode, refId, nama, 0)) return;

    const info = db.prepare(`INSERT INTO finance_payroll
      (code, ref_user_id, nama, tipe, periode, pokok, tunjangan, bonus, potongan, total,
       status, paid_on, metode, created_by)
      VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', '', '', ?)`).run(
      refId, nama, tipe, periode, pokok, tunjangan, bonus, potongan, total, req.userId
    );
    const id = Number(info.lastInsertRowid);
    const code = `PAY-${100 + id}`;
    db.prepare("UPDATE finance_payroll SET code = ? WHERE id = ?").run(code, id);
    audit(req, "finance_payroll.create", id, { code, periode, nama, total });
    return sendApiSuccess(res, { item: payrollDto(findPayroll(id)) }, "Payroll dibuat.", 201);
  }));

  app.patch("/api/admin/finance/payroll/:id", guard, (req, res) => dataResponse(res, () => {
    const current = findPayroll(req.params.id);
    if (!current) return sendApiError(res, 404, "Payroll tidak ditemukan.", "NOT_FOUND");
    if (current.status !== "draft") {
      return sendApiError(res, 409, "Payroll yang sudah dibayar tidak bisa diubah.", "PAYROLL_LOCKED");
    }
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      invalid("Body payroll harus berupa objek.", "body");
    }

    const next = { ...current };
    const fields = [];

    if (body.periode !== undefined) {
      next.periode = monthOf(body.periode, "periode", { required: true });
      if (next.periode > currentMonth()) invalid("periode tidak boleh di masa depan.", "periode");
      fields.push("periode");
    }
    if (body.refUserId !== undefined) {
      const raw = body.refUserId;
      if (raw === null || raw === "") {
        next.ref_user_id = null;
        next.tipe = "Staf";
      } else {
        const member = payrollMember(idOf(raw));
        next.ref_user_id = member.id;
        next.tipe = "Instruktur";
        next.nama = member.nama;
      }
      fields.push("refUserId");
    }
    if (body.tipe !== undefined && !next.ref_user_id) {
      next.tipe = payrollTypeOf(body.tipe, "Staf");
      if (next.tipe === "Instruktur") invalid("Pilih penerima instruktur dari refUserId.", "refUserId");
      fields.push("tipe");
    }
    if (body.nama !== undefined && !next.ref_user_id) {
      next.nama = text(body.nama, "nama", 60, true);
      if (next.nama.length < 2) invalid("nama minimal 2 karakter.", "nama");
      fields.push("nama");
    }
    if (body.pokok !== undefined) {
      next.pokok = money(body.pokok, "pokok", { required: true, allowZero: false });
      fields.push("pokok");
    }
    if (body.tunjangan !== undefined) {
      next.tunjangan = money(body.tunjangan, "tunjangan") ?? 0;
      fields.push("tunjangan");
    }
    if (body.bonus !== undefined) {
      next.bonus = money(body.bonus, "bonus") ?? 0;
      fields.push("bonus");
    }
    if (body.potongan !== undefined) {
      next.potongan = money(body.potongan, "potongan") ?? 0;
      fields.push("potongan");
    }
    if (next.potongan > next.pokok + next.tunjangan + next.bonus) {
      invalid("potongan tidak boleh melebihi pokok + tunjangan + bonus.", "potongan");
    }
    next.total = next.pokok + next.tunjangan + next.bonus - next.potongan;
    if (!fields.length) invalid("Tidak ada perubahan yang dikirim.", "body");

    if (payrollConflict(res, next.periode, next.ref_user_id, next.nama, current.id)) return;

    db.prepare(`UPDATE finance_payroll SET ref_user_id = ?, nama = ?, tipe = ?, periode = ?,
        pokok = ?, tunjangan = ?, bonus = ?, potongan = ?, total = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(next.ref_user_id, next.nama, next.tipe, next.periode,
      next.pokok, next.tunjangan, next.bonus, next.potongan, next.total, current.id);
    audit(req, "finance_payroll.update", current.id, { code: current.code, fields, total: next.total });
    return sendApiSuccess(res, { item: payrollDto(findPayroll(current.id)) }, "Payroll diperbarui.");
  }));

  app.post("/api/admin/finance/payroll/:id/pay", guard, (req, res) => dataResponse(res, () => {
    const current = findPayroll(req.params.id);
    if (!current) return sendApiError(res, 404, "Payroll tidak ditemukan.", "NOT_FOUND");
    if (current.status !== "draft") {
      return sendApiError(res, 409, "Payroll ini sudah dibayar.", "PAYROLL_LOCKED");
    }
    const body = req.body || {};
    const tanggal = dateOnly(body.tanggal, "tanggal") || jakartaToday();
    if (tanggal < `${current.periode}-01`) {
      invalid("tanggal pembayaran tidak boleh sebelum awal periode.", "tanggal");
    }
    if (tanggal > jakartaToday()) invalid("tanggal pembayaran tidak boleh di masa depan.", "tanggal");
    const metode = text(body.metode, "metode", 60) || "Transfer Bank";

    db.prepare(`UPDATE finance_payroll SET status = 'paid', paid_on = ?, metode = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(tanggal, metode, current.id);
    audit(req, "finance_payroll.pay", current.id, { code: current.code, tanggal, metode });
    return sendApiSuccess(res, { item: payrollDto(findPayroll(current.id)) }, "Pembayaran payroll dicatat.");
  }));

  app.delete("/api/admin/finance/payroll/:id", guard, (req, res) => {
    const current = findPayroll(req.params.id);
    if (!current) return sendApiError(res, 404, "Payroll tidak ditemukan.", "NOT_FOUND");
    if (current.status !== "draft") {
      return sendApiError(res, 409, "Payroll yang sudah dibayar tidak bisa dihapus.", "PAYROLL_LOCKED");
    }
    db.prepare("DELETE FROM finance_payroll WHERE id = ?").run(current.id);
    audit(req, "finance_payroll.delete", current.id, {
      code: current.code,
      periode: current.periode,
      total: current.total
    });
    return sendApiSuccess(res, { id: current.id }, "Payroll dihapus.");
  });

  // ----------------------------------------------------------
  // Anggaran operasional
  // ----------------------------------------------------------
  app.get("/api/admin/finance/budgets", guard, (req, res) => dataResponse(res, () => {
    const periode = monthOf(req.query.periode, "periode");
    const where = periode ? "WHERE periode = ?" : "";
    const params = periode ? [periode] : [];
    const rows = db.prepare(`SELECT * FROM finance_budgets ${where}
      ORDER BY periode DESC, kategori COLLATE NOCASE ASC`).all(...params);
    const total = rows.reduce((sum, row) => sum + Number(row.jumlah || 0), 0);
    return sendApiSuccess(res, {
      items: rows.map(budgetDto),
      total: rows.length,
      ringkasan: { total }
    });
  }));

  app.post("/api/admin/finance/budgets", guard, (req, res) => dataResponse(res, () => {
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      invalid("Body anggaran harus berupa objek.", "body");
    }
    const periode = monthOf(body.periode, "periode", { required: true });
    const kategori = text(body.kategori, "kategori", 80, true);
    const jumlah = money(body.jumlah, "jumlah", { required: true, allowZero: false });

    const dup = db.prepare("SELECT id FROM finance_budgets WHERE periode = ? AND kategori = ?")
      .get(periode, kategori);
    if (dup) {
      return sendApiError(res, 409, `Anggaran ${kategori} untuk ${periode} sudah ada.`, "CONFLICT");
    }

    const info = db.prepare(`INSERT INTO finance_budgets (periode, kategori, jumlah, created_by)
      VALUES (?, ?, ?, ?)`).run(periode, kategori, jumlah, req.userId);
    const id = Number(info.lastInsertRowid);
    audit(req, "finance_budget.create", id, { periode, kategori, jumlah });
    return sendApiSuccess(res, { item: budgetDto(findBudget(id)) }, "Anggaran dibuat.", 201);
  }));

  app.patch("/api/admin/finance/budgets/:id", guard, (req, res) => dataResponse(res, () => {
    const current = findBudget(req.params.id);
    if (!current) return sendApiError(res, 404, "Anggaran tidak ditemukan.", "NOT_FOUND");
    const body = req.body || {};
    if (body.jumlah === undefined) invalid("Tidak ada perubahan yang dikirim.", "body");
    const jumlah = money(body.jumlah, "jumlah", { required: true, allowZero: false });
    db.prepare("UPDATE finance_budgets SET jumlah = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(jumlah, current.id);
    audit(req, "finance_budget.update", current.id, {
      periode: current.periode,
      kategori: current.kategori,
      jumlah
    });
    return sendApiSuccess(res, { item: budgetDto(findBudget(current.id)) }, "Anggaran diperbarui.");
  }));

  app.delete("/api/admin/finance/budgets/:id", guard, (req, res) => {
    const current = findBudget(req.params.id);
    if (!current) return sendApiError(res, 404, "Anggaran tidak ditemukan.", "NOT_FOUND");
    db.prepare("DELETE FROM finance_budgets WHERE id = ?").run(current.id);
    audit(req, "finance_budget.delete", current.id, {
      periode: current.periode,
      kategori: current.kategori,
      jumlah: current.jumlah
    });
    return sendApiSuccess(res, { id: current.id }, "Anggaran dihapus.");
  });

  // ----------------------------------------------------------
  // Ringkasan perusahaan per bulan (pemasukan lain + realisasi anggaran)
  // ----------------------------------------------------------
  app.get("/api/admin/finance/company", guard, (req, res) => dataResponse(res, () => {
    const periode = monthOf(req.query.periode, "periode") || currentMonth();
    const { from, to } = periodBounds(periode);

    const pemasukanSiswa = db.prepare(`SELECT COALESCE(SUM(total), 0) AS total
      FROM finance_transactions
      WHERE status = 'paid' AND paid_on BETWEEN ? AND ?`).get(from, to);
    const pemasukanLain = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(nominal), 0) AS total
      FROM finance_incomes WHERE received_on BETWEEN ? AND ?`).get(from, to);

    const statusRows = db.prepare(`SELECT status, COUNT(*) AS n, COALESCE(SUM(nominal), 0) AS total
      FROM finance_expenses WHERE spent_on BETWEEN ? AND ? GROUP BY status`).all(from, to);
    const pengeluaran = {
      submitted: { count: 0, total: 0 },
      approved: { count: 0, total: 0 },
      paid: { count: 0, total: 0 },
      rejected: { count: 0, total: 0 }
    };
    for (const row of statusRows) {
      if (!pengeluaran[row.status]) continue;
      pengeluaran[row.status] = { count: Number(row.n || 0), total: Number(row.total || 0) };
    }

    const kategoriRows = db.prepare(`SELECT kategori, status, COALESCE(SUM(nominal), 0) AS total
      FROM finance_expenses WHERE spent_on BETWEEN ? AND ? GROUP BY kategori, status`).all(from, to);
    const real = {}; const komit = {};
    for (const row of kategoriRows) {
      const key = row.kategori || "";
      if (row.status === "paid") real[key] = (real[key] || 0) + Number(row.total || 0);
      else if (row.status === "approved") komit[key] = (komit[key] || 0) + Number(row.total || 0);
    }

    const payrollPeriode = db.prepare(`SELECT
        COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS draft_n,
        COALESCE(SUM(CASE WHEN status = 'draft' THEN total ELSE 0 END), 0) AS draft_total,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) AS paid_n,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0) AS paid_total
      FROM finance_payroll WHERE periode = ?`).get(periode);
    const payrollDibayar = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total
      FROM finance_payroll WHERE status = 'paid' AND paid_on BETWEEN ? AND ?`).get(from, to);
    if (Number(payrollDibayar.total || 0) > 0) {
      real["Gaji & Honor"] = (real["Gaji & Honor"] || 0) + Number(payrollDibayar.total || 0);
    }

    const budgets = db.prepare(`SELECT * FROM finance_budgets WHERE periode = ?
      ORDER BY kategori COLLATE NOCASE ASC`).all(periode);
    const byKategori = new Map(budgets.map((b) => [b.kategori, b]));
    const categories = [...new Set([
      ...budgets.map((b) => b.kategori),
      ...Object.keys(real),
      ...Object.keys(komit)
    ])];
    const anggaranRows = categories.map((kategori) => {
      const budget = byKategori.get(kategori);
      const anggaran = budget ? Number(budget.jumlah || 0) : 0;
      const realisasi = real[kategori] || 0;
      const komitmen = komit[kategori] || 0;
      const pct = anggaran ? Math.round((realisasi / anggaran) * 100) : 0;
      return {
        id: budget ? Number(budget.id) : null,
        kategori,
        anggaran,
        realisasi,
        komitmen,
        sisa: anggaran - realisasi,
        pct,
        status: !budget ? "none" : pct > 100 ? "over" : pct >= 80 ? "warn" : "ok"
      };
    });

    const totals = anggaranRows.reduce((acc, row) => ({
      anggaran: acc.anggaran + row.anggaran,
      realisasi: acc.realisasi + row.realisasi,
      komitmen: acc.komitmen + row.komitmen
    }), { anggaran: 0, realisasi: 0, komitmen: 0 });

    return sendApiSuccess(res, {
      periode,
      from,
      to,
      pemasukanSiswa: Number(pemasukanSiswa.total || 0),
      pemasukanLain: { count: Number(pemasukanLain.n || 0), total: Number(pemasukanLain.total || 0) },
      pemasukan: Number(pemasukanSiswa.total || 0) + Number(pemasukanLain.total || 0),
      pengeluaran,
      payroll: {
        periode,
        draft: { count: Number(payrollPeriode.draft_n || 0), total: Number(payrollPeriode.draft_total || 0) },
        paid: { count: Number(payrollPeriode.paid_n || 0), total: Number(payrollPeriode.paid_total || 0) },
        dibayarBulanIni: { count: Number(payrollDibayar.n || 0), total: Number(payrollDibayar.total || 0) }
      },
      anggaran: {
        total: totals.anggaran,
        realisasi: totals.realisasi,
        komitmen: totals.komitmen,
        sisa: totals.anggaran - totals.realisasi,
        rows: anggaranRows
      }
    });
  }));

  // ----------------------------------------------------------
  // Diskon & promo
  // ----------------------------------------------------------
  function activeFlag(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    const clean = String(value).trim().toLowerCase();
    if (["1", "true", "ya", "aktif", "on"].includes(clean)) return true;
    if (["0", "false", "tidak", "nonaktif", "off"].includes(clean)) return false;
    invalid("aktif harus bernilai true atau false.", "aktif");
  }

  function promoFields(body, current) {
    const next = current ? { ...current } : {
      kode: "",
      nama: "",
      tipe: "persen",
      nilai: 0,
      jenjang: "",
      mulai: "",
      selesai: "",
      kuota: null,
      aktif: 1
    };
    const fields = [];

    if (!current || body.kode !== undefined) {
      const kode = String(body.kode === undefined || body.kode === null ? "" : body.kode)
        .trim().toUpperCase();
      if (!PROMO_RE.test(kode)) invalid("kode promo 3-20 karakter huruf/angka.", "kode");
      next.kode = kode;
      if (!current) fields.push("kode");
    }
    if (!current || body.nama !== undefined) {
      next.nama = text(body.nama, "nama", 60, true);
      fields.push("nama");
    }
    if (!current || body.tipe !== undefined) {
      next.tipe = promoTypeOf(body.tipe, current ? next.tipe : "persen");
      fields.push("tipe");
    }
    if (!current || body.nilai !== undefined) {
      const nilai = money(body.nilai, "nilai", { required: true, allowZero: false });
      if (next.tipe === "persen" && nilai > 100) invalid("diskon persen maksimal 100.", "nilai");
      if (next.tipe === "nominal" && nilai > 5_000_000) invalid("diskon nominal maksimal 5000000.", "nilai");
      next.nilai = nilai;
      fields.push("nilai");
    }
    if (!current || body.jenjang !== undefined) {
      const jenjang = String(body.jenjang === undefined || body.jenjang === null ? "" : body.jenjang)
        .trim().toUpperCase();
      if (jenjang && !GRADES.includes(jenjang)) invalid("jenjang harus SD, SMP, atau SMK.", "jenjang");
      next.jenjang = jenjang;
      fields.push("jenjang");
    }
    if (!current || body.mulai !== undefined) {
      const mulai = dateOnly(body.mulai, "mulai");
      if (!mulai) invalid("mulai wajib diisi.", "mulai");
      next.mulai = mulai;
      fields.push("mulai");
    }
    if (!current || body.selesai !== undefined) {
      const selesai = dateOnly(body.selesai, "selesai");
      if (!selesai) invalid("selesai wajib diisi.", "selesai");
      next.selesai = selesai;
      fields.push("selesai");
    }
    if (next.mulai && next.selesai && next.selesai < next.mulai) {
      invalid("selesai tidak boleh sebelum mulai.", "selesai");
    }
    if (!current || body.kuota !== undefined) {
      if (body.kuota === undefined || body.kuota === null || body.kuota === "") {
        next.kuota = null;
      } else {
        const kuota = Number(body.kuota);
        if (!Number.isSafeInteger(kuota) || kuota < 1) {
          invalid("kuota harus bilangan bulat minimal 1 atau kosong.", "kuota");
        }
        next.kuota = kuota;
      }
      fields.push("kuota");
    }
    if (!current || body.aktif !== undefined) {
      next.aktif = activeFlag(body.aktif, true) ? 1 : 0;
      fields.push("aktif");
    }
    return { next, fields };
  }

  app.get("/api/admin/finance/promos", guard, (req, res) => dataResponse(res, () => {
    const { page, limit } = pageFrom(req.query, 50);
    const where = [];
    const params = [];
    const q = text(req.query.q, "q", 100);
    if (q) {
      const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
      where.push("(kode LIKE ? ESCAPE '\\' OR nama LIKE ? ESCAPE '\\')");
      params.push(like, like);
    }
    if (req.query.aktif !== undefined && req.query.aktif !== "") {
      where.push("aktif = ?");
      params.push(activeFlag(req.query.aktif, true) ? 1 : 0);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const totalRow = db.prepare(`SELECT COUNT(*) AS n FROM finance_promos ${clause}`).get(...params);
    const total = Number(totalRow.n || 0);
    const pages = Math.ceil(total / limit) || 1;
    const safePage = Math.min(page, pages);
    const rows = db.prepare(`SELECT p.*,
        (SELECT COUNT(*) FROM finance_transactions t
          WHERE t.promo_code = p.kode COLLATE NOCASE AND t.status IN ('paid', 'pending')) AS dipakai
      FROM finance_promos p ${clause}
      ORDER BY p.mulai DESC, p.id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, (safePage - 1) * limit);
    return sendApiSuccess(res, {
      items: rows.map((row) => promoDto(row, row.dipakai)),
      total,
      page: safePage,
      pages,
      limit
    });
  }));

  app.post("/api/admin/finance/promos", guard, (req, res) => dataResponse(res, () => {
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      invalid("Body promo harus berupa objek.", "body");
    }
    const { next } = promoFields(body, null);
    const dup = db.prepare("SELECT id FROM finance_promos WHERE kode = ? COLLATE NOCASE").get(next.kode);
    if (dup) return sendApiError(res, 409, `Kode promo ${next.kode} sudah dipakai.`, "CONFLICT");

    const info = db.prepare(`INSERT INTO finance_promos
      (kode, nama, tipe, nilai, jenjang, mulai, selesai, kuota, aktif, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      next.kode, next.nama, next.tipe, next.nilai, next.jenjang, next.mulai, next.selesai,
      next.kuota, next.aktif, req.userId
    );
    const id = Number(info.lastInsertRowid);
    audit(req, "finance_promo.create", id, { kode: next.kode, nilai: next.nilai });
    return sendApiSuccess(res, { item: promoDto(findPromo(id), 0) }, "Promo dibuat.", 201);
  }));

  app.patch("/api/admin/finance/promos/:id", guard, (req, res) => dataResponse(res, () => {
    const current = findPromo(req.params.id);
    if (!current) return sendApiError(res, 404, "Promo tidak ditemukan.", "NOT_FOUND");
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      invalid("Body promo harus berupa objek.", "body");
    }
    const { next, fields } = promoFields(body, current);
    if (!fields.length) invalid("Tidak ada perubahan yang dikirim.", "body");
    const used = promoUsage(current.kode);
    if (next.kuota !== null && next.kuota < used) {
      invalid(`kuota tidak boleh lebih kecil dari pemakaian saat ini (${used}).`, "kuota");
    }
    db.prepare(`UPDATE finance_promos SET nama = ?, tipe = ?, nilai = ?, jenjang = ?,
        mulai = ?, selesai = ?, kuota = ?, aktif = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(
      next.nama, next.tipe, next.nilai, next.jenjang, next.mulai, next.selesai,
      next.kuota, next.aktif, current.id
    );
    audit(req, "finance_promo.update", current.id, { kode: current.kode, fields });
    return sendApiSuccess(res, { item: promoDto(findPromo(current.id), used) }, "Promo diperbarui.");
  }));

  app.delete("/api/admin/finance/promos/:id", guard, (req, res) => {
    const current = findPromo(req.params.id);
    if (!current) return sendApiError(res, 404, "Promo tidak ditemukan.", "NOT_FOUND");
    const used = promoUsage(current.kode);
    if (used > 0) {
      return sendApiError(res, 409,
        `Promo sudah dipakai ${used} transaksi. Nonaktifkan saja.`, "PROMO_DIPAKAI");
    }
    db.prepare("DELETE FROM finance_promos WHERE id = ?").run(current.id);
    audit(req, "finance_promo.delete", current.id, { kode: current.kode });
    return sendApiSuccess(res, { id: current.id }, "Promo dihapus.");
  });

  // ----------------------------------------------------------
  // Paket & harga program
  // ----------------------------------------------------------
  app.get("/api/admin/finance/packages", guard, (req, res) => dataResponse(res, () => {
    const q = text(req.query.q, "q", 160);
    const clause = q ? "WHERE path_key LIKE ? ESCAPE '\\'" : "";
    const params = q ? [`%${q.replace(/[%_]/g, (m) => "\\" + m)}%`] : [];
    const rows = db.prepare(`SELECT * FROM finance_packages ${clause}
      ORDER BY path_key COLLATE NOCASE ASC`).all(...params);
    return sendApiSuccess(res, { items: rows.map(packageDto), total: rows.length });
  }));

  // Upsert: satu baris per Learning Path. Frontend cukup mengirim keinginan
  // akhir (harga + aktif) tanpa perlu tahu id barisnya.
  app.post("/api/admin/finance/packages", guard, (req, res) => dataResponse(res, () => {
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      invalid("Body paket harus berupa objek.", "body");
    }
    const key = text(body.key, "key", 160, true);
    if (!key.includes("|")) invalid("key harus berformat 'Jenjang|Nama jalur'.", "key");
    const harga = money(body.harga, "harga", { required: true });
    const aktif = activeFlag(body.aktif, true) ? 1 : 0;
    const current = findPackage(key);
    if (current) {
      db.prepare(`UPDATE finance_packages SET harga = ?, aktif = ?, updated_by = ?,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(harga, aktif, req.userId, current.id);
    } else {
      db.prepare(`INSERT INTO finance_packages (path_key, harga, aktif, updated_by)
        VALUES (?, ?, ?, ?)`).run(key, harga, aktif, req.userId);
    }
    const row = findPackage(key);
    audit(req, current ? "finance_package.update" : "finance_package.create", row.id, {
      key, harga, aktif: !!aktif
    });
    return sendApiSuccess(res, { item: packageDto(row) }, current ? "Paket diperbarui." : "Paket disimpan.",
      current ? 200 : 201);
  }));

  app.delete("/api/admin/finance/packages/:id", guard, (req, res) => {
    const row = db.prepare("SELECT * FROM finance_packages WHERE id = ?").get(idOf(req.params.id) || 0);
    if (!row) return sendApiError(res, 404, "Paket tidak ditemukan.", "NOT_FOUND");
    db.prepare("DELETE FROM finance_packages WHERE id = ?").run(row.id);
    audit(req, "finance_package.delete", row.id, { key: row.path_key, harga: row.harga });
    return sendApiSuccess(res, { id: row.id }, "Paket dikembalikan ke harga kurikulum.");
  });

  // ----------------------------------------------------------
  // Aktivitas finance (audit trail server)
  // ----------------------------------------------------------
  // Dipetakan ke bentuk entri DCFinanceAudit agar UI bisa menampilkan log lokal
  // dan log server dengan bentuk yang sama.
  const AUDIT_MODULES = {
    finance_transaction: { module: "siswa", entity: "Transaksi" },
    finance_expense: { module: "pengeluaran", entity: "Pengeluaran" },
    finance_income: { module: "pemasukan", entity: "Pemasukan" },
    finance_payroll: { module: "payroll", entity: "Payroll" },
    finance_budget: { module: "anggaran", entity: "Anggaran" },
    finance_promo: { module: "promo", entity: "Promo" },
    finance_package: { module: "paket", entity: "Paket" }
  };
  const AUDIT_VERBS = {
    create: "Tambah", update: "Ubah", delete: "Hapus", pay: "Bayar"
  };

  app.get("/api/admin/finance/audit", guard, (req, res) => dataResponse(res, () => {
    const { page, limit } = pageFrom(req.query, 50);
    const where = ["target_type = 'finance'"];
    const params = [];

    const moduleName = text(req.query.module, "module", 40);
    if (moduleName) {
      const prefix = Object.keys(AUDIT_MODULES)
        .find((key) => AUDIT_MODULES[key].module === moduleName);
      if (!prefix) invalid("module tidak dikenal.", "module");
      where.push("action LIKE ?");
      params.push(`${prefix}.%`);
    }
    const action = text(req.query.action, "action", 20);
    if (action) { where.push("action LIKE ?"); params.push(`%.${action}`); }
    const actor = text(req.query.actor, "actor", 64);
    if (actor) { where.push("actor_username LIKE ?"); params.push(`%${actor}%`); }
    const q = text(req.query.q, "q", 100);
    if (q) {
      const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
      where.push("(action LIKE ? ESCAPE '\\' OR details LIKE ? ESCAPE '\\' OR actor_username LIKE ? ESCAPE '\\')");
      params.push(like, like, like);
    }
    const from = dateOnly(req.query.from, "from");
    const to = dateOnly(req.query.to, "to");
    if (from && to && from > to) invalid("from harus sebelum atau sama dengan to.", "from");
    if (from) { where.push("date(created_at) >= ?"); params.push(from); }
    if (to) { where.push("date(created_at) <= ?"); params.push(to); }

    const clause = `WHERE ${where.join(" AND ")}`;
    const totalRow = db.prepare(`SELECT COUNT(*) AS n FROM admin_audit ${clause}`).get(...params);
    const total = Number(totalRow.n || 0);
    const pages = Math.ceil(total / limit) || 1;
    const safePage = Math.min(page, pages);
    const rows = db.prepare(`SELECT * FROM admin_audit ${clause}
      ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, (safePage - 1) * limit);

    const items = rows.map((row) => {
      const [prefix, verb] = String(row.action || "").split(".");
      const meta = AUDIT_MODULES[prefix] || { module: "sistem", entity: "Finance" };
      let details = {};
      try { details = JSON.parse(row.details || "{}"); } catch { details = {}; }
      const label = details.code || details.kode || details.key || row.target_id || "";
      return {
        id: "SRV-" + row.id,
        ts: row.created_at ? String(row.created_at).replace(" ", "T") + "Z" : "",
        actorId: row.actor_user_id == null ? "" : String(row.actor_user_id),
        actorName: row.actor_username || "",
        actorKnown: !!(row.actor_username || row.actor_user_id),
        action: verb || row.action,
        module: meta.module,
        entityType: meta.entity,
        entityId: row.target_id == null ? "" : String(row.target_id),
        summary: (AUDIT_VERBS[verb] || verb || "Aktivitas") + " " + meta.entity + (label ? " " + label : ""),
        before: null,
        after: null,
        changes: Object.keys(details).filter((k) => k !== "code" && k !== "kode" && k !== "key"),
        _src: "server"
      };
    });

    return sendApiSuccess(res, { items, entries: items, total, page: safePage, pages, limit });
  }));

  // Export transaksi keuangan ke format CSV
  app.get("/api/admin/finance/export", guard, (req, res) => {
    try {
      const from = req.query.from || "2000-01-01";
      const to = req.query.to || "2099-12-31";
      const rows = db.prepare(`
        SELECT t.code, COALESCE(u.full_name, u.username) AS student_name, u.email,
               t.grade, t.learning_path_name, t.price, t.discount, t.total,
               t.promo_code, t.method, t.status, t.paid_on, t.created_at
        FROM finance_transactions t
        LEFT JOIN users u ON u.id = t.student_user_id
        WHERE (t.paid_on BETWEEN ? AND ? OR (t.paid_on = '' AND SUBSTR(t.created_at, 1, 10) BETWEEN ? AND ?))
        ORDER BY t.id DESC
      `).all(from, to, from, to);

      const header = ["Kode Transaksi", "Nama Siswa", "Email", "Jenjang", "Learning Path", "Harga Asli", "Diskon", "Total Bayar", "Promo Code", "Metode", "Status", "Tanggal Bayar", "Dibuat Pada"];
      const escapeCsv = (str) => `"${String(str ?? "").replace(/"/g, '""')}"`;
      
      const csvLines = [
        header.join(","),
        ...rows.map(r => [
          escapeCsv(r.code),
          escapeCsv(r.student_name),
          escapeCsv(r.email),
          escapeCsv(r.grade),
          escapeCsv(r.learning_path_name),
          r.price,
          r.discount,
          r.total,
          escapeCsv(r.promo_code),
          escapeCsv(r.method),
          escapeCsv(r.status),
          escapeCsv(r.paid_on),
          escapeCsv(r.created_at)
        ].join(","))
      ];

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="transaksi-finance-${from}-to-${to}.csv"`);
      return res.status(200).send("\uFEFF" + csvLines.join("\r\n"));
    } catch (err) {
      console.error("[FINANCE] Gagal export CSV:", err);
      return sendApiError(res, 500, "Gagal mengekspor data transaksi.", "INTERNAL_ERROR");
    }
  });

  // ------------------------------------------------------------
  // PENGATURAN METODE PEMBAYARAN & PAYMENT GATEWAY (SERVER-SIDE)
  // ------------------------------------------------------------
  const DEFAULT_PAYMENT_SETTINGS = {
    bankActive: true,
    bankName: "Bank BCA",
    bankAccount: "8210-9988-77",
    bankHolder: "PT Ruang KKA Dieng Cyber",
    bankNote: "Sertakan kode invoice unik saat melakukan transfer agar otomatis terverifikasi.",
    qrisActive: true,
    qrisMode: "gateway",
    qrisMerchantName: "RUANG KKA DIENG CYBER",
    qrisNmid: "ID1020261126520",
    qrisPayload: "00020101021226590014ID.LINKAJA.WWW0118936009110020261126520458125303360540",
    qrisImageUrl: "",
    gatewayProvider: "midtrans",
    gatewayEnvironment: "sandbox",
    gatewayServerKey: "",
    gatewayClientKey: "",
    gatewayMerchantId: "",
    gatewayWebhookSecret: "",
    autoConfirmPaid: true
  };

  function readPaymentSettingsFromDb() {
    const row = db.prepare("SELECT payload_json FROM admin_settings WHERE id = 1").get();
    if (!row || !row.payload_json) return { ...DEFAULT_PAYMENT_SETTINGS };
    try {
      const parsed = JSON.parse(row.payload_json);
      return Object.assign({}, DEFAULT_PAYMENT_SETTINGS, parsed.payment_settings || {});
    } catch {
      return { ...DEFAULT_PAYMENT_SETTINGS };
    }
  }

  // GET konfigurasi pembayaran untuk Admin (memuat semua kredensial)
  app.get("/api/admin/finance/payment-settings", guard, (req, res) => {
    const settings = readPaymentSettingsFromDb();
    return sendApiSuccess(res, { settings });
  });

  // PUT simpan konfigurasi pembayaran Admin
  app.put("/api/admin/finance/payment-settings", guard, (req, res) => {
    const body = req.body || {};
    const input = body.settings || body;
    const currentSettings = readPaymentSettingsFromDb();
    const updated = Object.assign({}, currentSettings, {
      bankActive: input.bankActive !== undefined ? Boolean(input.bankActive) : currentSettings.bankActive,
      bankName: String(input.bankName || currentSettings.bankName).slice(0, 80),
      bankAccount: String(input.bankAccount || currentSettings.bankAccount).slice(0, 60),
      bankHolder: String(input.bankHolder || currentSettings.bankHolder).slice(0, 100),
      bankNote: String(input.bankNote || currentSettings.bankNote).slice(0, 300),
      qrisActive: input.qrisActive !== undefined ? Boolean(input.qrisActive) : currentSettings.qrisActive,
      qrisMode: ["gateway", "static"].includes(input.qrisMode) ? input.qrisMode : currentSettings.qrisMode,
      qrisMerchantName: String(input.qrisMerchantName || currentSettings.qrisMerchantName).slice(0, 100),
      qrisNmid: String(input.qrisNmid || currentSettings.qrisNmid).slice(0, 60),
      qrisPayload: String(input.qrisPayload || currentSettings.qrisPayload).slice(0, 500),
      qrisImageUrl: String(input.qrisImageUrl || currentSettings.qrisImageUrl).slice(0, 500),
      gatewayProvider: ["midtrans", "xendit", "tripay", "manual"].includes(input.gatewayProvider) ? input.gatewayProvider : currentSettings.gatewayProvider,
      gatewayEnvironment: ["sandbox", "production"].includes(input.gatewayEnvironment) ? input.gatewayEnvironment : currentSettings.gatewayEnvironment,
      gatewayServerKey: String(input.gatewayServerKey ?? currentSettings.gatewayServerKey).slice(0, 200),
      gatewayClientKey: String(input.gatewayClientKey ?? currentSettings.gatewayClientKey).slice(0, 200),
      gatewayMerchantId: String(input.gatewayMerchantId ?? currentSettings.gatewayMerchantId).slice(0, 100),
      gatewayWebhookSecret: String(input.gatewayWebhookSecret ?? currentSettings.gatewayWebhookSecret).slice(0, 200),
      autoConfirmPaid: input.autoConfirmPaid !== undefined ? Boolean(input.autoConfirmPaid) : currentSettings.autoConfirmPaid
    });

    const row = db.prepare("SELECT payload_json FROM admin_settings WHERE id = 1").get();
    let rootSettings = {};
    if (row && row.payload_json) {
      try { rootSettings = JSON.parse(row.payload_json); } catch { rootSettings = {}; }
    }
    rootSettings.payment_settings = updated;

    db.prepare(`
      INSERT INTO admin_settings (id, payload_json, updated_by) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json,
        updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
    `).run(JSON.stringify(rootSettings), req.userId);

    audit(req, "settings.update_payment", 1, { provider: updated.gatewayProvider, env: updated.gatewayEnvironment });
    return sendApiSuccess(res, { settings: updated }, "Pengaturan metode pembayaran berhasil disimpan.");
  });

  // GET Publik metode pembayaran aktif (aman untuk frontend siswa checkout / portal umum)
  app.get("/api/payment/methods", (req, res) => {
    const s = readPaymentSettingsFromDb();
    const publicMethods = {
      bank: {
        active: s.bankActive,
        name: s.bankName,
        account: s.bankAccount,
        holder: s.bankHolder,
        note: s.bankNote
      },
      qris: {
        active: s.qrisActive,
        mode: s.qrisMode,
        merchantName: s.qrisMerchantName,
        nmid: s.qrisNmid,
        payload: s.qrisPayload,
        imageUrl: s.qrisImageUrl
      },
      gateway: {
        active: s.gatewayProvider !== "manual",
        provider: s.gatewayProvider,
        environment: s.gatewayEnvironment,
        clientKey: s.gatewayClientKey
      }
    };
    return sendApiSuccess(res, { methods: publicMethods });
  });
}

module.exports = {
  GRADES,
  STATUSES,
  registerFinanceApi
};
