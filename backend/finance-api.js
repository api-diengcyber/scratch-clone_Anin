"use strict";

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
// ============================================================

const GRADES = ["SD", "SMP", "SMK"];
const STATUSES = ["paid", "pending", "failed", "refunded"];
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
    catatan: row.catatan || "",
    createdAt: row.created_at || null,
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
      WHERE spent_on BETWEEN ? AND ?`).get(from, to);

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
      WHERE spent_on BETWEEN ? AND ?
      GROUP BY kategori
      ORDER BY total DESC, kategori ASC`).all(from, to).map((row) => ({
      kategori: row.kategori || "",
      total: Number(row.total || 0),
      count: Number(row.n || 0)
    }));

    const masukHarian = new Map(db.prepare(`SELECT paid_on AS tanggal, COALESCE(SUM(total), 0) AS total
      FROM finance_transactions
      WHERE status = 'paid' AND paid_on BETWEEN ? AND ?
      GROUP BY paid_on`).all(from, to).map((row) => [row.tanggal, Number(row.total || 0)]));
    const keluarHarian = new Map(db.prepare(`SELECT spent_on AS tanggal, COALESCE(SUM(nominal), 0) AS total
      FROM finance_expenses
      WHERE spent_on BETWEEN ? AND ?
      GROUP BY spent_on`).all(from, to).map((row) => [row.tanggal, Number(row.total || 0)]));

    const harian = [];
    for (let day = from; day <= to; day = dayShift(day, 1)) {
      harian.push({ tanggal: day, masuk: masukHarian.get(day) || 0, keluar: keluarHarian.get(day) || 0 });
    }

    const pemasukan = Number(income.total || 0);
    const pengeluaran = Number(expense.total || 0);
    return sendApiSuccess(res, {
      from,
      to,
      pemasukan,
      pengeluaran,
      laba: pemasukan - pengeluaran,
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
    const paidAt = dateOnly(body.paidAt, "paidAt");
    const isPaid = status === "paid";

    const info = db.prepare(`INSERT INTO finance_transactions
      (student_user_id, learning_path_key, learning_path_name, grade, price, discount, total,
       method, status, note, paid_at, paid_on, verified_by, verified_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
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
        status = ?, note = ?, paid_at = ?, paid_on = ?, verified_by = ?, verified_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(
      next.price,
      next.discount,
      next.total,
      next.method,
      next.status,
      next.note,
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
      where.push("(kategori LIKE ? ESCAPE '\\' OR catatan LIKE ? ESCAPE '\\')");
      params.push(like, like);
    }
    const kategori = text(req.query.kategori, "kategori", 80);
    if (kategori) { where.push("kategori = ?"); params.push(kategori); }
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

    return sendApiSuccess(res, {
      items: rows.map(expenseDto),
      total,
      page: safePage,
      pages,
      limit,
      ringkasan: { total: Number(sumRow.total || 0) }
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
    const catatan = text(body.catatan, "catatan", 500);

    const info = db.prepare(`INSERT INTO finance_expenses
      (kategori, nominal, spent_on, catatan, created_by)
      VALUES (?, ?, ?, ?, ?)`).run(kategori, nominal, tanggal, catatan, req.userId);
    const id = Number(info.lastInsertRowid);
    const code = `EXP-${500 + id}`;
    db.prepare("UPDATE finance_expenses SET code = ? WHERE id = ?").run(code, id);
    audit(req, "finance_expense.create", id, { code, kategori, nominal, tanggal });
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
    if (body.catatan !== undefined) {
      next.catatan = text(body.catatan, "catatan", 500);
      fields.push("catatan");
    }
    if (!fields.length) invalid("Tidak ada perubahan yang dikirim.", "body");

    db.prepare(`UPDATE finance_expenses SET kategori = ?, nominal = ?, spent_on = ?, catatan = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(next.kategori, next.nominal, next.spent_on, next.catatan, current.id);
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
}

module.exports = {
  GRADES,
  STATUSES,
  registerFinanceApi
};
