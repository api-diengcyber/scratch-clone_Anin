"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { extractZipSafely, sha256, MAX_ZIP_BYTES } = require("./plugin-zip");
const { notifyAdmins } = require("./notifications");
const { notifyStudent } = require("./student-notifications");
const learningService = require("./learning-service");
const lencana = require("./lencana-catalog");
const reportScheduler = require("./report-scheduler");
const reportEmail = require("./report-email");
const attendanceService = require("./attendance-service");
const { releaseDeletedEmail } = require("./user-identity");
function registerAdminApi(app, deps) {
  const { db, auth, express, sendApiError, sendApiSuccess, sanitizeString, normalizeEmail, isValidEmail } = deps;
  const PLUGIN_DIR = process.env.PLUGIN_DIR || (process.env.NODE_ENV === "production" ? "/data/plugins" : path.join(__dirname, "plugin-data"));
  const quarantineRoot = path.join(PLUGIN_DIR, "quarantine");
  const liveRoot = path.join(PLUGIN_DIR, "live");
  fs.mkdirSync(quarantineRoot, { recursive: true });
  fs.mkdirSync(liveRoot, { recursive: true });

  const adminRate = new Map();
  function limit(req, res, next) {
    const key = `${req.userId}:${req.path}`;
    const now = Date.now();
    const prev = adminRate.get(key);
    if (!prev || now - prev.start > 60_000) { adminRate.set(key, { start: now, count: 1 }); return next(); }
    if (prev.count >= 60) return sendApiError(res, 429, "Terlalu banyak permintaan admin. Coba lagi sebentar.", "RATE_LIMITED");
    prev.count++;
    next();
  }
  function requireAdmin(req, res, next) {
    auth.requireAuth(req, res, (err) => {
      if (err) return next(err);
      return auth.requireAdmin(req, res, next);
    });
  }
  function requireStaffGate(req, res, next) {
    auth.requireAuth(req, res, (err) => {
      if (err) return next(err);
      return auth.requireStaff(req, res, next);
    });
  }
  const permissionsModule = require("./permissions");
  const reports = require("./reports");
  const reportDeliveries = require("./report-deliveries");
  const ADMIN_PATH_RULES = [
    { re: /^\/me(?:\/|$)/, perm: null },
    { re: /^\/notifications/, perm: null },
    { re: /^\/stats\/?$/, perm: null },
    { re: /^\/activity\/?$/, perm: null },
    { re: /^\/audit/, perm: "akses.kelola" },
    { re: /^\/users/, perm: "siswa.kelola" },
    { re: /^\/report-deliveries/, perm: "siswa.kelola" },
    { re: /^\/curriculum-tasks/, perm: "tugas.kelola" },
    { re: /^\/curriculum/, perm: "kurikulum.kelola" },
    { re: /^\/materials/, perm: "kurikulum.kelola" },
    { re: /^\/jadwal/, perm: "kurikulum.kelola" },
    { re: /^\/badges/, perm: "badge.kelola" },
    { re: /^\/lencana/, perm: "badge.kelola" },
    { re: /^\/tasks\/\d+\/submissions/, perm: "tugas.nilai" },
    { re: /^\/submissions/, perm: "tugas.nilai" },
    { re: /^\/tasks/, perm: "tugas.kelola" },
    { re: /^\/plugins/, perm: "plugin.kelola" },
    { re: /^\/settings/, perm: "pengaturan.ubah" },
    { re: /^\/roles\/?$/, perm: "akses.kelola" },
    { re: /^\/instructors(?:\/|$)/, perm: "akses.kelola" }
  ];
  // Gate per route admin: admin -> selalu lolos; instruktur -> harus punya
  // permission dari matriks server. Path sudah di-strip prefix mount /api/admin.
  function adminPermissionGate(req, res, next) {
    const path = String(req.path || "").split("?")[0];
    const match = ADMIN_PATH_RULES.find((r) => r.re.test(path));
    const required = match ? match.perm : null;
    if (!required) return next();
    const allowed = req.role === "admin" || permissionsModule.permissionsForRole(db, req.role).includes(required);
    if (allowed) return next();
    return sendApiError(res, 403, "Permission tidak cukup: " + required, "PERMISSION_DENIED");
  }
  function audit(req, action, targetType, targetId, details = {}) {
    db.prepare(`INSERT INTO admin_audit (actor_user_id, actor_username, action, target_type, target_id, details, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(req.userId, req.user || "unknown", action, targetType, String(targetId ?? ""), JSON.stringify(details), req.ip || null);
  }
  function studentTarget(id) {
    const num = Number(id);
    if (!Number.isSafeInteger(num) || num < 1) return null;
    const user = db.prepare(`SELECT id, username, email, full_name, bio, avatar_url, allowed_grades, role, status,
        must_change_password, last_login_at, created_at, subscription_started_at FROM users WHERE id = ?`).get(num);
    return user && user.role === "student" ? user : null;
  }
  function jsonAllowedGrades(value) {
    if (value == null || value === "") return [];
    try { const v = JSON.parse(value); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  function createTempPassword() { return crypto.randomBytes(9).toString("base64url") + "A7!"; }

  // ------------------------------------------------------------
  // Validasi dokumen kurikulum Admin.
  // UI Admin mengirim tahap + jalur + materi sekaligus, jadi backend
  // menyimpannya sebagai satu dokumen berversi. Validasi dilakukan ketat
  // supaya data yang nanti dipakai halaman murid tidak berisi HTML aktif.
  // ------------------------------------------------------------
  function curriculumError(message, field) {
    const err = new Error(message);
    err.code = "CURRICULUM_INVALID";
    err.field = field || null;
    throw err;
  }
  function plainText(value, field, max, required = false) {
    if (value === undefined || value === null) {
      if (required) curriculumError(`${field} wajib diisi.`, field);
      return "";
    }
    if (typeof value !== "string") curriculumError(`${field} harus berupa teks.`, field);
    const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
    if (required && !text) curriculumError(`${field} wajib diisi.`, field);
    if (text.length > max) curriculumError(`${field} maksimal ${max} karakter.`, field);
    return text;
  }
  function curriculumInteger(value, field, min, max) {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(num) || num < min || num > max) {
      curriculumError(`${field} harus bilangan bulat ${min}-${max}.`, field);
    }
    return num;
  }
  function curriculumBoolean(value, field) {
    if (value === undefined || value === null) return false;
    if (typeof value !== "boolean") curriculumError(`${field} harus boolean.`, field);
    return value;
  }
  function curriculumIcon(value, field) {
    const icon = plainText(value, field, 80);
    if (icon && !/^[a-z0-9 -]+$/i.test(icon)) curriculumError(`${field} tidak valid.`, field);
    return icon;
  }
  function curriculumColor(value, field) {
    const color = typeof value === "string" ? value.trim() : "";
    if (!color) return "#0ea5e9";
    if (!/^#[0-9a-f]{6}$/i.test(color)) curriculumError(`${field} harus warna HEX #rrggbb.`, field);
    return color.toLowerCase();
  }
  function curriculumHtml(value, field) {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") curriculumError(`${field} harus berupa teks HTML.`, field);
    if (value.length > 400_000) curriculumError(`${field} maksimal 400.000 karakter.`, field);
    if (/<\s*(script|iframe|object|embed|link|meta|base)\b/i.test(value)) {
      curriculumError(`${field} mengandung tag HTML yang tidak diizinkan.`, field);
    }
    if (/\bon[a-z]+\s*=/i.test(value)) curriculumError(`${field} mengandung event handler inline.`, field);
    if (/\b(?:javascript|vbscript)\s*:/i.test(value) || /\bsrcdoc\s*=/i.test(value) || /\bdata\s*:\s*text\/html/i.test(value)) {
      curriculumError(`${field} mengandung URL/atribut tidak aman.`, field);
    }
    return value;
  }
  function curriculumSlug(value, field) {
    const slug = plainText(value, field, 80, true);
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) {
      curriculumError(`${field} hanya boleh huruf kecil, angka, dan strip.`, field);
    }
    return slug;
  }
  function normalizeCurriculum(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      curriculumError("Body kurikulum harus berupa objek.", "body");
    }
    if (!Array.isArray(input.tahap)) curriculumError("tahap harus berupa array.", "tahap");
    if (input.tahap.length > 100) curriculumError("tahap maksimal 100 item.", "tahap");
    if (!Array.isArray(input.jalur)) curriculumError("jalur harus berupa array.", "jalur");
    if (input.jalur.length > 500) curriculumError("jalur maksimal 500 item.", "jalur");

    const tahap = [];
    const stageKeys = new Set();
    input.tahap.forEach((raw, index) => {
      const field = `tahap[${index}]`;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) curriculumError(`${field} harus objek.`, field);
      const jenjang = plainText(raw.jenjang, `${field}.jenjang`, 8, true).toUpperCase();
      if (!["SD", "SMP", "SMK"].includes(jenjang)) curriculumError(`${field}.jenjang harus SD/SMP/SMK.`, `${field}.jenjang`);
      const no = curriculumInteger(raw.no, `${field}.no`, 1, 99);
      const key = `${jenjang}|${no}`;
      if (stageKeys.has(key)) curriculumError(`${field} duplikat untuk ${jenjang} tahap ${no}.`, field);
      stageKeys.add(key);
      tahap.push({
        jenjang,
        no,
        nama: plainText(raw.nama, `${field}.nama`, 100, true),
        ikon: curriculumIcon(raw.ikon, `${field}.ikon`),
        warna: curriculumColor(raw.warna, `${field}.warna`),
        meta: plainText(raw.meta, `${field}.meta`, 200)
      });
    });

    const jalur = [];
    const pathIds = new Set();
    input.jalur.forEach((raw, index) => {
      const field = `jalur[${index}]`;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) curriculumError(`${field} harus objek.`, field);
      const id = curriculumSlug(raw.id, `${field}.id`);
      if (pathIds.has(id)) curriculumError(`${field}.id duplikat: ${id}.`, `${field}.id`);
      pathIds.add(id);
      const jenjang = plainText(raw.jenjang, `${field}.jenjang`, 8, true).toUpperCase();
      if (!["SD", "SMP", "SMK"].includes(jenjang)) curriculumError(`${field}.jenjang harus SD/SMP/SMK.`, `${field}.jenjang`);
      const tahapNo = curriculumInteger(raw.tahap, `${field}.tahap`, 1, 99);
      if (!stageKeys.has(`${jenjang}|${tahapNo}`)) {
        curriculumError(`${field}.tahap ${jenjang} ${tahapNo} tidak ada di daftar tahap.`, `${field}.tahap`);
      }
      const rawTags = raw.tags === undefined || raw.tags === null ? [] : raw.tags;
      if (!Array.isArray(rawTags)) curriculumError(`${field}.tags harus array.`, `${field}.tags`);
      if (rawTags.length > 20) curriculumError(`${field}.tags maksimal 20 item.`, `${field}.tags`);
      const tags = [...new Set(rawTags.map((tag, tagIndex) => plainText(tag, `${field}.tags[${tagIndex}]`, 40)).filter(Boolean))];
      let siswa = null;
      if (raw.siswa !== undefined && raw.siswa !== null && raw.siswa !== "") {
        siswa = curriculumInteger(raw.siswa, `${field}.siswa`, 0, 1_000_000_000);
      }
      const rawMateri = raw.materi === undefined || raw.materi === null ? [] : raw.materi;
      if (!Array.isArray(rawMateri)) curriculumError(`${field}.materi harus array.`, `${field}.materi`);
      if (rawMateri.length > 200) curriculumError(`${field}.materi maksimal 200 item.`, `${field}.materi`);
      const materialIds = new Set();
      const materi = rawMateri.map((m, materialIndex) => {
        const mField = `${field}.materi[${materialIndex}]`;
        if (!m || typeof m !== "object" || Array.isArray(m)) curriculumError(`${mField} harus objek.`, mField);
        const materialId = curriculumSlug(m.id, `${mField}.id`);
        if (materialIds.has(materialId)) curriculumError(`${mField}.id duplikat: ${materialId}.`, `${mField}.id`);
        materialIds.add(materialId);
        return {
          id: materialId,
          judul: plainText(m.judul, `${mField}.judul`, 200, true),
          tipe: plainText(m.tipe, `${mField}.tipe`, 40) || "Materi",
          durasi: plainText(m.durasi, `${mField}.durasi`, 40),
          tes: curriculumBoolean(m.tes, `${mField}.tes`),
          badge: plainText(m.badge, `${mField}.badge`, 80),
          subjudul: plainText(m.subjudul, `${mField}.subjudul`, 200),
          html: curriculumHtml(m.html, `${mField}.html`)
        };
      });
      jalur.push({
        id,
        jenjang,
        tahap: tahapNo,
        nama: plainText(raw.nama, `${field}.nama`, 160, true),
        warna: curriculumColor(raw.warna, `${field}.warna`),
        ikon: curriculumIcon(raw.ikon, `${field}.ikon`),
        ringkas: plainText(raw.ringkas, `${field}.ringkas`, 1000),
        tags,
        lab: curriculumInteger(raw.lab === undefined || raw.lab === null || raw.lab === "" ? 0 : raw.lab, `${field}.lab`, 0, 9999),
        durasi: plainText(raw.durasi, `${field}.durasi`, 40),
        siswa,
        capstone: curriculumBoolean(raw.capstone, `${field}.capstone`),
        lencana: plainText(raw.lencana, `${field}.lencana`, 200),
        meta: plainText(raw.meta, `${field}.meta`, 200),
        proyek: plainText(raw.proyek, `${field}.proyek`, 200),
        materi
      });
    });

    return { tahap, jalur };
  }
  function readCurriculum() {
    const row = db.prepare("SELECT version, payload_json, updated_at, updated_by FROM curriculum_documents WHERE id = 'default'").get();
    if (!row) return { exists: false, curriculum: { tahap: [], jalur: [] }, version: 0, updatedAt: null, updatedBy: null };
    let curriculum;
    try { curriculum = JSON.parse(row.payload_json); } catch { curriculum = { tahap: [], jalur: [] }; }
    if (!curriculum || !Array.isArray(curriculum.tahap) || !Array.isArray(curriculum.jalur)) curriculum = { tahap: [], jalur: [] };
    return { exists: true, curriculum, version: row.version, updatedAt: row.updated_at, updatedBy: row.updated_by };
  }
  function uniqueStudentUsername(base) {
    let root = String(base || "").toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[._-]+|[._-]+$/g, "")
      .slice(0, 32);
    if (!root) root = "siswa";
    if (root.length < 3) root = (root + "siswa").slice(0, 32);
    let candidate = root;
    let suffixNumber = 2;
    const exists = db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE");
    while (exists.get(candidate)) {
      const suffix = String(suffixNumber++);
      candidate = root.slice(0, Math.max(1, 32 - suffix.length)) + suffix;
    }
    return candidate;
  }

  function pluginDeveloper(req, res, next) {
    const ids = String(process.env.PLUGIN_DEVELOPER_USER_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
    if (!ids.includes(String(req.userId))) return sendApiError(res, 403, "Upload/review/publish plugin hanya untuk admin developer yang di-allowlist. Set PLUGIN_DEVELOPER_USER_IDS ke users.id tepercaya.", "PLUGIN_DEVELOPER_REQUIRED");
    next();
  }
  function pluginVersionById(id) {
    const num = Number(id);
    if (!Number.isSafeInteger(num) || num < 1) return null;
    return db.prepare("SELECT * FROM plugin_versions WHERE id = ?").get(num) || null;
  }
  function signPreviewTicket(uploadId) {
    const secret = process.env.PLUGIN_PREVIEW_SECRET;
    if (!secret || secret.length < 32) throw new Error("PLUGIN_PREVIEW_SECRET wajib disetel (minimal 32 karakter) untuk preview.");
    const payload = Buffer.from(JSON.stringify({ uploadId, exp: Date.now() + 5 * 60_000 })).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  app.use("/api/admin", auth.requireAuth, requireStaffGate, limit, adminPermissionGate);

  // Identitas admin yang sedang login (dipakai UI admin).
  function adminMeDto(req) {
    const row = db.prepare("SELECT full_name, email, phone, created_at FROM users WHERE id = ?").get(req.userId) || {};
    const permissions = req.role === "admin"
      ? permissionsModule.PERMISSIONS
      : permissionsModule.permissionsForRole(db, req.role);
    return {
      id: req.userId,
      username: req.user,
      fullName: row.full_name || null,
      email: row.email || null,
      phone: row.phone || null,
      role: req.role,
      status: req.status,
      mustChangePassword: req.mustChangePassword,
      createdAt: row.created_at || null,
      permissions
    };
  }

  app.get("/api/admin/me", (req, res) => sendApiSuccess(res, adminMeDto(req)));

  // Profil sendiri: nama, email, dan nomor kontak. Peran tidak bisa diubah
  // lewat endpoint ini; perubahan peran tetap lewat matriks akses admin.
  app.patch("/api/admin/me", (req, res) => adminDataResponse(res, () => {
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      adminDataError("Body profil harus berupa objek.", "body");
    }
    const sets = [];
    const values = [];
    const fields = [];
    if (body.fullName !== undefined) {
      sets.push("full_name = ?");
      values.push(adminText(body.fullName, "fullName", 80, true));
      fields.push("fullName");
    }
    if (body.email !== undefined) {
      const email = normalizeEmail(body.email || "");
      if (!email) adminDataError("Email wajib diisi.", "email");
      if (!isValidEmail(email)) adminDataError("Format email tidak valid.", "email");
      // Email milik akun yang sudah dihapus (soft delete) dilepas agar bisa dipakai lagi.
      releaseDeletedEmail(db, email);
      if (db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE AND id <> ?").get(email, req.userId)) {
        return sendApiError(res, 409, "Email sudah digunakan akun lain.", "EMAIL_EXISTS");
      }
      sets.push("email = ?");
      values.push(email);
      fields.push("email");
    }
    if (body.phone !== undefined) {
      const phone = adminText(body.phone, "phone", 20);
      if (phone && !/^[+0-9\s-]{8,20}$/.test(phone)) adminDataError("Nomor telepon tidak valid.", "phone");
      sets.push("phone = ?");
      values.push(phone || null);
      fields.push("phone");
    }
    if (!fields.length) adminDataError("Tidak ada data profil yang diubah.", "body");

    try {
      db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...values, req.userId);
    } catch (err) {
      if (String(err && err.code).startsWith("SQLITE_CONSTRAINT")) {
        return sendApiError(res, 409, "Email sudah digunakan akun lain.", "EMAIL_EXISTS");
      }
      throw err;
    }
    audit(req, "profile.update", "user", req.userId, { fields });
    return sendApiSuccess(res, adminMeDto(req), "Profil diperbarui.");
  }));

  // Password minimal mengikuti pengaturan instansi (sama dengan login/register).
  function minPasswordFromSettings() {
    try {
      const row = db.prepare("SELECT payload_json FROM admin_settings WHERE id = 1").get();
      if (row) {
        const settings = JSON.parse(row.payload_json || "{}");
        const min = Number(settings.minPassword);
        if (Number.isFinite(min) && min >= 6) return Math.min(32, Math.floor(min));
      }
    } catch (_) { /* default */ }
    return 8;
  }

  // Ganti password akun sendiri. Sesi lain dicabut, sesi yang dipakai tetap hidup.
  app.post("/api/admin/me/password", (req, res) => {
    const body = req.body || {};
    const currentPassword = body.currentPassword;
    const newPassword = body.newPassword;
    if (typeof currentPassword !== "string" || !currentPassword) {
      return sendApiError(res, 400, "Password saat ini wajib diisi.", "VALIDATION_ERROR", { field: "currentPassword" });
    }
    const minPassword = minPasswordFromSettings();
    if (typeof newPassword !== "string" || newPassword.length < minPassword) {
      return sendApiError(res, 400, "Password baru minimal " + minPassword + " karakter.", "VALIDATION_ERROR", { field: "newPassword" });
    }
    if (newPassword.length > 128) {
      return sendApiError(res, 400, "Password baru maksimal 128 karakter.", "VALIDATION_ERROR", { field: "newPassword" });
    }
    const user = db.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").get(req.userId);
    if (!user || !user.password_hash || !user.password_salt) {
      return sendApiError(res, 400, "Akun ini belum memiliki password lokal.", "PASSWORD_NOT_SET");
    }
    if (!auth.verifyPassword(currentPassword, user.password_salt, user.password_hash)) {
      return sendApiError(res, 400, "Password saat ini salah.", "INVALID_PASSWORD", { field: "currentPassword" });
    }
    if (currentPassword === newPassword) {
      return sendApiError(res, 400, "Password baru harus berbeda dari password saat ini.", "PASSWORD_SAME", { field: "newPassword" });
    }
    const { salt, hash } = auth.hashPassword(newPassword);
    db.transaction(() => {
      db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE id = ?").run(hash, salt, req.userId);
      auth.deleteOtherSessions(req.userId, req.token);
    })();
    audit(req, "profile.password_change", "user", req.userId, { sessions_revoked: true });
    return sendApiSuccess(res, { id: req.userId }, "Password berhasil diganti. Sesi lain telah dikeluarkan.");
  });

  // Notifikasi lonceng Admin. Data disimpan per admin, bukan localStorage.
  function notificationDto(row) {
    return {
      id: Number(row.id),
      kind: row.kind,
      title: row.title,
      body: row.body || "",
      view: row.view || "dashboard",
      icon: row.icon || "fa-solid fa-bell",
      tone: row.tone || "sky",
      read: Boolean(row.read_at),
      readAt: row.read_at || null,
      createdAt: row.created_at
    };
  }
  function unreadNotificationCount(userId) {
    return Number(db.prepare("SELECT COUNT(*) AS n FROM admin_notifications WHERE user_id = ? AND read_at IS NULL").get(userId).n || 0);
  }

  app.get("/api/admin/notifications", (req, res) => {
    const limitN = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 20));
    const rows = db.prepare(`SELECT id, kind, title, body, view, icon, tone, read_at, created_at
      FROM admin_notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?`).all(req.userId, limitN);
    return sendApiSuccess(res, {
      notifications: rows.map(notificationDto),
      unreadCount: unreadNotificationCount(req.userId)
    });
  });

  app.post("/api/admin/notifications/read-all", (req, res) => {
    const result = db.prepare("UPDATE admin_notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL").run(req.userId);
    return sendApiSuccess(res, { updated: result.changes, unreadCount: 0 }, "Semua notifikasi ditandai sudah dibaca.");
  });

  app.post("/api/admin/notifications/:id/read", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return sendApiError(res, 400, "ID notifikasi tidak valid.", "VALIDATION_ERROR");
    const result = db.prepare("UPDATE admin_notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND read_at IS NULL").run(id, req.userId);
    if (!result.changes) {
      const exists = db.prepare("SELECT 1 FROM admin_notifications WHERE id = ? AND user_id = ?").get(id, req.userId);
      if (!exists) return sendApiError(res, 404, "Notifikasi tidak ditemukan.", "NOT_FOUND");
    }
    return sendApiSuccess(res, { id, read: true, unreadCount: unreadNotificationCount(req.userId) }, "Notifikasi ditandai sudah dibaca.");
  });

  app.delete("/api/admin/notifications", (req, res) => {
    const result = db.prepare("DELETE FROM admin_notifications WHERE user_id = ?").run(req.userId);
    return sendApiSuccess(res, { deleted: result.changes, unreadCount: 0 }, "Semua notifikasi dihapus.");
  });

  app.delete("/api/admin/notifications/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return sendApiError(res, 400, "ID notifikasi tidak valid.", "VALIDATION_ERROR");
    const result = db.prepare("DELETE FROM admin_notifications WHERE id = ? AND user_id = ?").run(id, req.userId);
    if (!result.changes) return sendApiError(res, 404, "Notifikasi tidak ditemukan.", "NOT_FOUND");
    return sendApiSuccess(res, { id, deleted: 1, unreadCount: unreadNotificationCount(req.userId) }, "Notifikasi dihapus.");
  });

  // M1: audit log admin dengan filter dan pagination.
  app.get("/api/admin/audit", (req, res) => {
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
    const limitN = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 50));
    const action = sanitizeString(String(req.query.action || ""), 80);
    const actor = sanitizeString(String(req.query.actor || ""), 64);
    const targetType = sanitizeString(String(req.query.targetType || ""), 40);
    const targetId = sanitizeString(String(req.query.targetId || ""), 120);
    const where = [];
    const params = [];
    if (action) { where.push("action = ?"); params.push(action); }
    if (actor) { where.push("(actor_username LIKE ? OR CAST(actor_user_id AS TEXT) = ?)"); params.push(`%${actor}%`, actor); }
    if (targetType) { where.push("target_type = ?"); params.push(targetType); }
    if (targetId) { where.push("target_id = ?"); params.push(targetId); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = db.prepare(`SELECT COUNT(*) AS n FROM admin_audit ${clause}`).get(...params).n;
    const rows = db.prepare(`SELECT id, actor_user_id, actor_username, action, target_type, target_id, details, ip, created_at
      FROM admin_audit ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limitN, (page - 1) * limitN);
    const entries = rows.map((row) => {
      let details = {};
      try { details = JSON.parse(row.details || "{}"); } catch { details = {}; }
      return { ...row, details };
    });
    return sendApiSuccess(res, { entries, page, limit: limitN, total, pages: Math.ceil(total / limitN) });
  });

  // Ringkasan untuk kartu dashboard Admin. Semua angka dihitung dari DB,
  // bukan dari data mock di frontend.
  app.get("/api/admin/stats", (req, res) => {
    const students = db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended,
      SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) AS deleted
      FROM users WHERE role = 'student'`).get();
    const content = db.prepare(`SELECT
      (SELECT COUNT(*) FROM modules) AS modules,
      (SELECT COUNT(*) FROM tasks) AS tasks,
      (SELECT COUNT(*) FROM materials) AS materials`).get();
    const plugins = db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN status = 'quarantine' THEN 1 ELSE 0 END) AS quarantine,
      SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled
      FROM plugins`).get();
    const activity = db.prepare(`SELECT
      (SELECT COUNT(*) FROM attempts WHERE date(updated_at) = date('now')) AS attemptsToday,
      (SELECT COUNT(*) FROM progress WHERE completed = 1 AND date(completed_at) = date('now')) AS completedToday,
      (SELECT COUNT(*) FROM progress WHERE completed = 1) AS completedTotal,
      (SELECT COUNT(*) FROM sessions WHERE expires_at > CURRENT_TIMESTAMP) AS activeSessions,
      (SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) END FROM progress) AS completionRate`).get();
    const grades = db.prepare(`SELECT
      SUM(CASE WHEN allowed_grades LIKE '%"SD"%' THEN 1 ELSE 0 END) AS sd,
      SUM(CASE WHEN allowed_grades LIKE '%"SMP"%' THEN 1 ELSE 0 END) AS smp,
      SUM(CASE WHEN allowed_grades LIKE '%"SMK"%' THEN 1 ELSE 0 END) AS smk,
      SUM(CASE WHEN allowed_grades IS NULL OR allowed_grades = '' OR allowed_grades = '[]' THEN 1 ELSE 0 END) AS unassigned
      FROM users WHERE role = 'student'`).get();
    const curriculumDoc = readCurriculum();
    const paths = curriculumDoc.curriculum.jalur;
    const curriculum = {
      exists: curriculumDoc.exists,
      version: curriculumDoc.version,
      updatedAt: curriculumDoc.updatedAt,
      stages: curriculumDoc.curriculum.tahap.length,
      paths: paths.length,
      materials: paths.reduce((sum, jalur) => sum + (Array.isArray(jalur.materi) ? jalur.materi.length : 0), 0)
    };
    const numbers = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)]));
    return sendApiSuccess(res, {
      students: numbers(students),
      content: {
        ...numbers(content),
        curriculumStages: curriculum.stages,
        curriculumPaths: curriculum.paths,
        curriculumMaterials: curriculum.materials
      },
      plugins: numbers(plugins),
      activity: numbers(activity),
      grades: numbers(grades),
      curriculum
    });
  });

  // Feed submisi terbaru untuk panel "Submisi Praktik Terkini" di dashboard.
  app.get("/api/admin/activity", (req, res) => {
    const limitN = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 5));
    const entries = db.prepare(`SELECT pr.completed_at, pr.task_id,
        u.id AS user_id, u.username, u.full_name,
        t.title, t.points
      FROM progress pr
      JOIN users u ON u.id = pr.user_id
      LEFT JOIN tasks t ON t.task_id = pr.task_id
      WHERE pr.completed = 1 AND pr.completed_at IS NOT NULL AND u.role = 'student'
      ORDER BY datetime(pr.completed_at) DESC, pr.id DESC
      LIMIT ?`).all(limitN);
    return sendApiSuccess(res, { entries });
  });

  // Kurikulum Admin: tahap, jalur, dan materi disimpan sebagai satu dokumen.
  // `version` dipakai untuk optimistic concurrency agar dua admin tidak saling
  // menimpa perubahan.
  app.get("/api/admin/curriculum", (req, res) => {
    return sendApiSuccess(res, readCurriculum());
  });

  app.put("/api/admin/curriculum", (req, res) => {
    const body = req.body || {};
    const version = body.version;
    if (!Number.isInteger(version) || version < 0 || version > 1_000_000_000) {
      return sendApiError(res, 400, "version wajib berupa bilangan bulat >= 0.", "VALIDATION_ERROR", { field: "version" });
    }
    const current = db.prepare("SELECT version FROM curriculum_documents WHERE id = 'default'").get();
    const currentVersion = current ? current.version : 0;
    if (version !== currentVersion) {
      return sendApiError(res, 409, "Kurikulum sudah diubah admin lain. Muat ulang data terlebih dahulu.", "CURRICULUM_VERSION_CONFLICT", { currentVersion });
    }
    let curriculum;
    try {
      curriculum = normalizeCurriculum(body);
    } catch (e) {
      if (e.code === "CURRICULUM_INVALID") {
        return sendApiError(res, 400, e.message, "CURRICULUM_INVALID", e.field ? { field: e.field } : undefined);
      }
      throw e;
    }
    const nextVersion = currentVersion + 1;
    const payload = JSON.stringify(curriculum);
    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO curriculum_documents (id, version, payload_json, updated_by)
        VALUES ('default', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET version = excluded.version, payload_json = excluded.payload_json,
          updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`)
        .run(nextVersion, payload, req.userId);
      audit(req, "curriculum.update", "curriculum", "default", {
        version: nextVersion,
        stages: curriculum.tahap.length,
        paths: curriculum.jalur.length,
        materials: curriculum.jalur.reduce((sum, jalur) => sum + jalur.materi.length, 0)
      });
    });
    tx();
    notifyAdmins(db, {
      kind: "curriculum.update",
      title: "Kurikulum diperbarui",
      body: `Versi ${nextVersion}: ${curriculum.tahap.length} tahap, ${curriculum.jalur.length} jalur.`,
      view: "kurikulum",
      icon: "fa-solid fa-book-open",
      tone: "amber",
      dedupeKey: `curriculum.update:${nextVersion}`
    });
    const saved = db.prepare("SELECT updated_at FROM curriculum_documents WHERE id = 'default'").get();
    return sendApiSuccess(res, {
      exists: true,
      curriculum,
      version: nextVersion,
      updatedAt: saved ? saved.updated_at : null
    }, "Kurikulum disimpan.");
  });

  // Code Lab sudah dibuang dari proyek. Tabel code_lab_challenges
  // di-drop saat database start dan endpoint /api/admin/code-lab
  // + /api/code-lab tidak ada lagi.

  // ------------------------------------------------------------
  // Badge, tugas, pengumpulan, dan pengaturan instansi.
  // UI Admin sudah memakai endpoint ini. Sebelumnya UI jatuh ke
  // localStorage; sekarang data tersimpan di SQLite.
  // ------------------------------------------------------------
  function adminDataError(message, field) {
    const err = new Error(message);
    err.code = "ADMIN_DATA_INVALID";
    err.field = field || null;
    throw err;
  }
  function adminDataResponse(res, fn) {
    try {
      return fn();
    } catch (err) {
      if (err && err.code === "ADMIN_DATA_INVALID") {
        return sendApiError(res, 400, err.message, "ADMIN_DATA_INVALID", err.field ? { field: err.field } : undefined);
      }
      throw err;
    }
  }
  function adminText(value, field, max, required = false) {
    if (value === undefined || value === null) {
      if (required) adminDataError(`${field} wajib diisi.`, field);
      return "";
    }
    if (typeof value !== "string") adminDataError(`${field} harus berupa teks.`, field);
    const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
    if (required && !text) adminDataError(`${field} wajib diisi.`, field);
    if (text.length > max) adminDataError(`${field} maksimal ${max} karakter.`, field);
    return text;
  }
  function adminInteger(value, field, min, max) {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(num) || num < min || num > max) {
      adminDataError(`${field} harus bilangan bulat ${min}-${max}.`, field);
    }
    return num;
  }
  function adminBoolean(value, field) {
    if (typeof value !== "boolean") adminDataError(`${field} harus boolean.`, field);
    return value;
  }
  function adminDate(value, field, required = false) {
    if (value === undefined || value === null || value === "") {
      if (required) adminDataError(`${field} wajib diisi.`, field);
      return null;
    }
    const text = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text + "T00:00:00Z"))) {
      adminDataError(`${field} harus tanggal YYYY-MM-DD.`, field);
    }
    return text;
  }
  function adminEnum(value, field, allowed) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!allowed.includes(text)) adminDataError(`${field} harus salah satu: ${allowed.join(", ")}.`, field);
    return text;
  }

  const BADGE_COLORS = ["sky", "indigo", "emerald", "amber", "rose"];
  const BADGE_RULES = ["manual", "tasks", "points"];
  function badgeDto(row) {
    return {
      id: Number(row.id),
      name: row.name,
      description: row.description || "",
      icon: row.icon,
      color: row.color,
      rule: row.rule,
      threshold: Number(row.threshold),
      active: Boolean(row.active),
      awarded: 0
    };
  }
  function normalizeBadge(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      adminDataError("Body badge harus berupa objek.", "body");
    }
    const name = adminText(input.name, "name", 40, true);
    const description = adminText(input.description, "description", 160);
    const icon = adminText(input.icon || "fa-star", "icon", 40, true);
    if (!/^fa-[a-z0-9-]+$/.test(icon)) adminDataError("icon tidak valid.", "icon");
    const color = adminEnum(input.color || "sky", "color", BADGE_COLORS);
    const rule = adminEnum(input.rule || "manual", "rule", BADGE_RULES);
    const threshold = rule === "manual" ? 0 : adminInteger(input.threshold, "threshold", 1, 1_000_000);
    const active = input.active === undefined ? true : adminBoolean(input.active, "active");
    return { name, description, icon, color, rule, threshold, active };
  }

  app.get("/api/admin/badges", (req, res) => {
    const rows = db.prepare("SELECT * FROM admin_badges ORDER BY id ASC LIMIT 500").all();
    return sendApiSuccess(res, { items: rows.map(badgeDto), total: rows.length });
  });

  app.post("/api/admin/badges", (req, res) => adminDataResponse(res, () => {
    const item = normalizeBadge(req.body || {});
    let info;
    try {
      info = db.prepare(`INSERT INTO admin_badges (name, description, icon, color, rule, threshold, active)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        item.name, item.description, item.icon, item.color, item.rule, item.threshold, item.active ? 1 : 0
      );
    } catch (err) {
      if (String(err && err.code).startsWith("SQLITE_CONSTRAINT")) {
        return sendApiError(res, 409, "Nama badge sudah dipakai.", "BADGE_NAME_EXISTS");
      }
      throw err;
    }
    const id = Number(info.lastInsertRowid);
    audit(req, "badge.create", "admin_badge", id, { name: item.name, rule: item.rule, threshold: item.threshold });
    const row = db.prepare("SELECT * FROM admin_badges WHERE id = ?").get(id);
    return sendApiSuccess(res, { item: badgeDto(row) }, "Badge berhasil dibuat.", 201);
  }));

  app.patch("/api/admin/badges/:id", (req, res) => adminDataResponse(res, () => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return sendApiError(res, 400, "ID badge tidak valid.", "VALIDATION_ERROR");
    const current = db.prepare("SELECT * FROM admin_badges WHERE id = ?").get(id);
    if (!current) return sendApiError(res, 404, "Badge tidak ditemukan.", "NOT_FOUND");
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return sendApiError(res, 400, "Body badge harus berupa objek.", "ADMIN_DATA_INVALID", { field: "body" });
    }
    const item = normalizeBadge({ ...badgeDto(current), ...body });
    try {
      db.prepare(`UPDATE admin_badges SET name=?, description=?, icon=?, color=?, rule=?, threshold=?, active=?,
        updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
        item.name, item.description, item.icon, item.color, item.rule, item.threshold, item.active ? 1 : 0, id
      );
    } catch (err) {
      if (String(err && err.code).startsWith("SQLITE_CONSTRAINT")) {
        return sendApiError(res, 409, "Nama badge sudah dipakai.", "BADGE_NAME_EXISTS");
      }
      throw err;
    }
    audit(req, "badge.update", "admin_badge", id, { name: item.name, fields: Object.keys(body) });
    const row = db.prepare("SELECT * FROM admin_badges WHERE id = ?").get(id);
    return sendApiSuccess(res, { item: badgeDto(row) }, "Badge diperbarui.");
  }));

  app.delete("/api/admin/badges/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return sendApiError(res, 400, "ID badge tidak valid.", "VALIDATION_ERROR");
    const row = db.prepare("SELECT * FROM admin_badges WHERE id = ?").get(id);
    if (!row) return sendApiError(res, 404, "Badge tidak ditemukan.", "NOT_FOUND");
    // Tugas yang memakai badge ini otomatis kehilangan badge (ON DELETE SET NULL).
    db.prepare("DELETE FROM admin_badges WHERE id = ?").run(id);
    audit(req, "badge.delete", "admin_badge", id, { name: row.name });
    return sendApiSuccess(res, { id }, "Badge dihapus.");
  });

  // Tugas kurikulum (yang dilihat siswa di jalur belajar), hanya untuk dibaca admin.
  // Beda dengan tabel admin_tasks yang berisi tugas buatan admin.
  app.get("/api/admin/curriculum-tasks", (req, res) => lencanaGuard(res, () => {
    const gradeQ = String(req.query.grade || "").toUpperCase();
    const where = ["SD", "SMP", "SMK"].includes(gradeQ) ? "WHERE t.grade = ?" : "";
    const rows = db.prepare(`
      SELECT t.grade, t.module_id, t.task_id, t.task_index, t.title, t.is_project, t.points,
        (SELECT COUNT(*) FROM progress p WHERE p.task_id = t.task_id AND p.completed = 1) AS completed
      FROM tasks t ${where}
      ORDER BY t.grade, t.module_id, t.task_index LIMIT 3000
    `).all(...(where ? [gradeQ] : []));
    // Nama jalur diambil dari katalog yang sama dengan lencana.
    const jalurOf = new Map();
    try {
      for (const item of lencana.getCatalog()) for (const id of item.taskIds) jalurOf.set(id, item);
    } catch (_) { /* katalog tidak ada: pakai module_id */ }
    const items = rows.map((r) => {
      const j = jalurOf.get(r.task_id);
      return {
        id: r.task_id,
        grade: r.grade,
        module: r.module_id,
        jalur: j ? j.jalur : r.module_id,
        no: Number(r.task_index) + 1,
        title: r.title,
        isProject: Number(r.is_project) === 1,
        points: Number(r.points) || 0,
        completed: Number(r.completed) || 0
      };
    });
    return sendApiSuccess(res, { items, total: items.length });
  }));

  // Lencana jalur belajar: katalog yang sama dengan yang dilihat siswa (dibaca dari
  // users/kurikulum/data) + siswa yang sudah berhak, dipakai untuk cetak sertifikat.
  function lencanaGuard(res, fn) {
    try { return fn(); }
    catch (e) {
      if (e && e.code === "LENCANA_DATA_MISSING") return sendApiError(res, 503, e.message, "LENCANA_DATA_MISSING");
      throw e;
    }
  }
  app.get("/api/admin/lencana", (req, res) => lencanaGuard(res, () => {
    const items = lencana.getCatalog().map((item) => lencana.publicItem(item, lencana.eligibleStudents(db, item).length));
    return sendApiSuccess(res, { items, total: items.length });
  }));

  app.get("/api/admin/lencana/:key/students", (req, res) => lencanaGuard(res, () => {
    const item = lencana.findItem(String(req.params.key || ""));
    if (!item) return sendApiError(res, 404, "Lencana jalur tidak ditemukan.", "NOT_FOUND");
    const students = lencana.eligibleStudents(db, item);
    return sendApiSuccess(res, { item: lencana.publicItem(item, students.length), students, total: students.length });
  }));

  const ADMIN_TASK_GRADES = ["SD", "SMP", "SMK"];
  const ADMIN_TASK_TYPES = ["kode", "proyek", "kuis"];
  const ADMIN_TASK_STATUSES = ["draft", "terbit", "ditutup"];
  function adminTaskDto(row) {
    const submitted = Number(row.submissions || 0);
    return {
      id: Number(row.id),
      title: row.title,
      description: row.description || "",
      grade: row.grade,
      type: row.type,
      points: Number(row.points),
      due: row.due || "",
      status: row.status,
      badgeId: row.badge_id == null ? null : Number(row.badge_id),
      submitted,
      submissions: submitted,
      pending: Number(row.pending || 0)
    };
  }
  function normalizeAdminTask(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      adminDataError("Body tugas harus berupa objek.", "body");
    }
    const title = adminText(input.title, "title", 80, true);
    const description = adminText(input.description, "description", 500);
    const grade = adminEnum(input.grade, "grade", ADMIN_TASK_GRADES);
    const type = adminEnum(input.type, "type", ADMIN_TASK_TYPES);
    const points = adminInteger(input.points === undefined ? 0 : input.points, "points", 0, 1000);
    const due = adminDate(input.due, "due", true);
    const status = adminEnum(input.status || "draft", "status", ADMIN_TASK_STATUSES);
    let badgeId = null;
    if (input.badgeId !== undefined && input.badgeId !== null && input.badgeId !== "" && input.badgeId !== "null") {
      badgeId = adminInteger(input.badgeId, "badgeId", 1, Number.MAX_SAFE_INTEGER);
      const badge = db.prepare("SELECT id FROM admin_badges WHERE id = ?").get(badgeId);
      if (!badge) adminDataError("badgeId tidak ditemukan.", "badgeId");
    }
    return { title, description, grade, type, points, due, status, badgeId };
  }
  function adminTaskById(id) {
    return db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM admin_task_submissions s WHERE s.task_id = t.id) AS submissions,
        (SELECT COUNT(*) FROM admin_task_submissions s WHERE s.task_id = t.id AND s.status = 'dikumpulkan') AS pending
      FROM admin_tasks t WHERE t.id = ?
    `).get(id);
  }

  app.get("/api/admin/tasks", (req, res) => {
    const search = sanitizeString(String(req.query.search || req.query.q || ""), 100);
    const grade = ADMIN_TASK_GRADES.includes(String(req.query.grade || "").toUpperCase())
      ? String(req.query.grade).toUpperCase() : "";
    const status = ADMIN_TASK_STATUSES.includes(String(req.query.status || ""))
      ? String(req.query.status) : "";
    const where = [];
    const params = [];
    if (search) { where.push("(t.title LIKE ? OR t.description LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
    if (grade) { where.push("t.grade = ?"); params.push(grade); }
    if (status) { where.push("t.status = ?"); params.push(status); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM admin_task_submissions s WHERE s.task_id = t.id) AS submissions,
        (SELECT COUNT(*) FROM admin_task_submissions s WHERE s.task_id = t.id AND s.status = 'dikumpulkan') AS pending
      FROM admin_tasks t ${clause} ORDER BY t.id DESC LIMIT 500
    `).all(...params);
    return sendApiSuccess(res, { items: rows.map(adminTaskDto), total: rows.length });
  });

  app.post("/api/admin/tasks", (req, res) => adminDataResponse(res, () => {
    const item = normalizeAdminTask(req.body || {});
    const info = db.prepare(`INSERT INTO admin_tasks
      (title, description, grade, type, points, due, status, badge_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      item.title, item.description, item.grade, item.type, item.points, item.due, item.status, item.badgeId, req.userId
    );
    const id = Number(info.lastInsertRowid);
    audit(req, "admin_task.create", "admin_task", id, { title: item.title, grade: item.grade, status: item.status });
    return sendApiSuccess(res, { item: adminTaskDto(adminTaskById(id)) }, "Tugas berhasil dibuat.", 201);
  }));

  app.patch("/api/admin/tasks/:id", (req, res) => adminDataResponse(res, () => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return sendApiError(res, 400, "ID tugas tidak valid.", "VALIDATION_ERROR");
    const current = adminTaskById(id);
    if (!current) return sendApiError(res, 404, "Tugas tidak ditemukan.", "NOT_FOUND");
    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return sendApiError(res, 400, "Body tugas harus berupa objek.", "ADMIN_DATA_INVALID", { field: "body" });
    }
    const item = normalizeAdminTask({ ...adminTaskDto(current), ...body });
    db.prepare(`UPDATE admin_tasks SET title=?, description=?, grade=?, type=?, points=?, due=?, status=?,
      badge_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      item.title, item.description, item.grade, item.type, item.points, item.due, item.status, item.badgeId, id
    );
    audit(req, "admin_task.update", "admin_task", id, { title: item.title, fields: Object.keys(body) });
    return sendApiSuccess(res, { item: adminTaskDto(adminTaskById(id)) }, "Tugas diperbarui.");
  }));

  app.delete("/api/admin/tasks/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return sendApiError(res, 400, "ID tugas tidak valid.", "VALIDATION_ERROR");
    const row = db.prepare("SELECT id, title FROM admin_tasks WHERE id = ?").get(id);
    if (!row) return sendApiError(res, 404, "Tugas tidak ditemukan.", "NOT_FOUND");
    db.prepare("DELETE FROM admin_tasks WHERE id = ?").run(id);
    audit(req, "admin_task.delete", "admin_task", id, { title: row.title });
    return sendApiSuccess(res, { id }, "Tugas dihapus.");
  });

  function submissionDto(row) {
    return {
      id: Number(row.id),
      task_id: Number(row.task_id),
      student_id: Number(row.user_id),
      student_name: row.full_name || row.username || "Siswa",
      status: row.status,
      submitted_at: row.submitted_at || null,
      answer: row.answer || "",
      score: row.score == null ? null : Number(row.score),
      feedback: row.feedback || "",
      graded_at: row.graded_at || null
    };
  }
  app.get("/api/admin/tasks/:id/submissions", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return sendApiError(res, 400, "ID tugas tidak valid.", "VALIDATION_ERROR");
    const task = db.prepare("SELECT id FROM admin_tasks WHERE id = ?").get(id);
    if (!task) return sendApiError(res, 404, "Tugas tidak ditemukan.", "NOT_FOUND");
    const rows = db.prepare(`
      SELECT s.*, u.username, u.full_name
      FROM admin_task_submissions s
      JOIN users u ON u.id = s.user_id
      WHERE s.task_id = ?
      ORDER BY CASE s.status WHEN 'dikumpulkan' THEN 0 WHEN 'revisi' THEN 1 WHEN 'dinilai' THEN 2 ELSE 3 END, s.id ASC
    `).all(id);
    return sendApiSuccess(res, { items: rows.map(submissionDto), total: rows.length });
  });

  // Pengaturan "Hasil review & nilai" (notifGraded). Default menyala bila belum pernah diatur.
  function notifGradedEnabled() {
    const row = db.prepare("SELECT payload_json FROM admin_settings WHERE id = 1").get();
    if (!row) return true;
    try {
      const settings = JSON.parse(row.payload_json);
      return !settings || settings.notifGraded !== false;
    } catch (_) {
      return true;
    }
  }

  app.patch("/api/admin/submissions/:id", (req, res) => adminDataResponse(res, () => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return sendApiError(res, 400, "ID pengumpulan tidak valid.", "VALIDATION_ERROR");
    const current = db.prepare("SELECT * FROM admin_task_submissions WHERE id = ?").get(id);
    if (!current) return sendApiError(res, 404, "Pengumpulan tidak ditemukan.", "NOT_FOUND");
    const body = req.body || {};
    const status = adminEnum(body.status, "status", ["revisi", "dinilai"]);
    const feedback = adminText(body.feedback, "feedback", 600);
    let score = null;
    if (body.score !== undefined && body.score !== null && body.score !== "") {
      score = adminInteger(body.score, "score", 0, 100);
    }
    if (status === "dinilai" && score === null) adminDataError("score wajib diisi saat status dinilai.", "score");
    if (status === "revisi" && !feedback) adminDataError("feedback wajib diisi saat meminta revisi.", "feedback");
    const task = db.prepare("SELECT title FROM admin_tasks WHERE id = ?").get(current.task_id);
    const taskTitle = task && task.title ? task.title : `Tugas #${current.task_id}`;
    const notifyEnabled = notifGradedEnabled();
    const previousScore = current.score === null || current.score === undefined ? null : Number(current.score);

    // Nilai, audit, dan notifikasi satu transaksi: kalau notifikasi gagal dibuat, nilai ikut batal
    // sehingga percobaan ulang tidak kehilangan notifikasi (perubahan status tidak lagi terdeteksi
    // bila nilainya sudah telanjur tersimpan).
    db.transaction(() => {
      db.prepare(`UPDATE admin_task_submissions SET status=?, score=?, feedback=?,
        graded_at=${status === "dinilai" ? "CURRENT_TIMESTAMP" : "NULL"} WHERE id=?`).run(status, score, feedback, id);
      audit(req, "admin_task.grade", "admin_task_submission", id, { taskId: Number(current.task_id), studentId: Number(current.user_id), status, score });

      // Hanya bila admin tidak mematikan "Hasil review & nilai" di Pengaturan, dan hanya saat benar-benar
      // ada perubahan status/nilai (menyimpan ulang nilai yang sama tidak menumpuk notifikasi).
      // Kunci dedupe memuat waktu: nilai yang kembali ke angka lama (90 -> 80 -> 90) tetap diberitahukan.
      if (!notifyEnabled) return;
      if (status === "dinilai" && (current.status !== "dinilai" || previousScore !== score)) {
        notifyStudent(db, Number(current.user_id), {
          kind: "task.graded",
          title: `Nilai tugas keluar: ${taskTitle}`,
          body: `Nilai ${score}/100${feedback ? ` - ${feedback}` : ""}`,
          view: "tugas",
          icon: "fa-solid fa-star",
          tone: "emerald",
          dedupeKey: `task.graded:${id}:${score}:${Date.now()}`
        });
      }
      if (status === "revisi" && (current.status !== "revisi" || String(current.feedback || "") !== feedback)) {
        notifyStudent(db, Number(current.user_id), {
          kind: "task.revision",
          title: `Revisi tugas: ${taskTitle}`,
          body: feedback,
          view: "tugas",
          icon: "fa-solid fa-rotate-left",
          tone: "amber",
          dedupeKey: `task.revision:${id}:${Date.now()}`
        });
      }
    })();
    const row = db.prepare(`
      SELECT s.*, u.username, u.full_name FROM admin_task_submissions s
      JOIN users u ON u.id = s.user_id WHERE s.id = ?
    `).get(id);
    return sendApiSuccess(res, { item: submissionDto(row) }, status === "dinilai" ? "Nilai disimpan." : "Revisi diminta.");
  }));

  const SETTING_KEYS = [
    "name", "tagline", "email", "phone", "website", "address", "logo", "year", "semester", "grades",
    "kkm", "defaultDueDays", "allowLate", "latePenalty", "minPassword", "sessionHours",
    "forceChangePassword", "notifNewTask", "notifGraded"
  ];
  function normalizeSettings(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      adminDataError("Body pengaturan harus berupa objek.", "body");
    }
    const s = {};
    s.name = adminText(input.name, "name", 60, true);
    s.tagline = adminText(input.tagline, "tagline", 100);
    s.email = adminText(input.email, "email", 120);
    if (s.email && !isValidEmail(s.email)) adminDataError("Format email kontak tidak valid.", "email");
    s.phone = adminText(input.phone, "phone", 40);
    s.website = adminText(input.website, "website", 200);
    if (s.website && !/^https?:\/\/.+\..+/.test(s.website)) adminDataError("website harus diawali http:// atau https://.", "website");
    s.address = adminText(input.address, "address", 200);
    s.logo = adminText(input.logo, "logo", 900_000);
    if (s.logo && !/^data:image\/(png|jpeg|svg\+xml);base64,/i.test(s.logo) && !/^https?:\/\//i.test(s.logo) && !s.logo.startsWith("/")) {
      adminDataError("logo harus data URL gambar atau URL http(s).", "logo");
    }
    s.year = adminText(input.year, "year", 20, true);
    s.semester = adminEnum(input.semester || "Ganjil", "semester", ["Ganjil", "Genap"]);
    if (!Array.isArray(input.grades) || input.grades.length < 1) adminDataError("grades minimal satu jenjang.", "grades");
    s.grades = [...new Set(input.grades.map((g) => adminEnum(String(g).toUpperCase(), "grades", ADMIN_TASK_GRADES)))];
    s.kkm = adminInteger(input.kkm, "kkm", 0, 100);
    s.defaultDueDays = adminInteger(input.defaultDueDays, "defaultDueDays", 1, 365);
    s.allowLate = adminBoolean(input.allowLate, "allowLate");
    s.latePenalty = adminInteger(input.latePenalty, "latePenalty", 0, 100);
    s.minPassword = adminInteger(input.minPassword, "minPassword", 6, 32);
    s.sessionHours = adminInteger(input.sessionHours, "sessionHours", 1, 168);
    s.forceChangePassword = adminBoolean(input.forceChangePassword, "forceChangePassword");
    s.notifNewTask = adminBoolean(input.notifNewTask, "notifNewTask");
    s.notifGraded = adminBoolean(input.notifGraded, "notifGraded");
    return s;
  }
  app.get("/api/admin/settings", (req, res) => {
    const row = db.prepare("SELECT payload_json, updated_at FROM admin_settings WHERE id = 1").get();
    let settings = {};
    if (row) {
      try { settings = JSON.parse(row.payload_json); } catch { settings = {}; }
    }
    return sendApiSuccess(res, { settings, updatedAt: row ? row.updated_at : null });
  });

  app.put("/api/admin/settings", (req, res) => adminDataResponse(res, () => {
    const body = req.body || {};
    const settings = normalizeSettings(body.settings === undefined ? body : body.settings);
    db.prepare(`
      INSERT INTO admin_settings (id, payload_json, updated_by) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json,
        updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
    `).run(JSON.stringify(settings), req.userId);
    audit(req, "settings.update", "admin_settings", 1, { fields: SETTING_KEYS.filter((k) => settings[k] !== undefined) });
    return sendApiSuccess(res, { settings }, "Pengaturan disimpan.");
  }));

  // ------------------------------------------------------------
  // AKSES & HAK AKSES (matriks peran + akun instruktur/orang tua)
  // ------------------------------------------------------------
  // Semua aksi ini ditapis lewat gate adminPermissionGate (permission
  // `akses.kelola`), kecuali GET yang boleh dibaca staff.

  app.get("/api/admin/roles", (req, res) => {
    const roles = permissionsModule.readRolePermissions(db);
    return sendApiSuccess(res, { roles });
  });

  app.put("/api/admin/roles", (req, res) => {
    // Mutasi hak akses murni: hanya admin.
    if (req.role !== "admin") {
      return sendApiError(res, 403, "Hanya admin yang boleh mengubah hak akses.", "ADMIN_REQUIRED");
    }
    const body = req.body || {};
    let roles;
    try {
      roles = permissionsModule.normalizeRolePermissions(body.roles);
    } catch (e) {
      return sendApiError(res, 400, e.message, "ADMIN_DATA_INVALID", e.field ? { field: e.field } : undefined);
    }
    try {
      const tx = db.transaction(() => {
        for (const key of permissionsModule.ROLE_KEYS) {
          db.prepare(`
            INSERT INTO admin_role_permissions (role, permissions, updated_by)
            VALUES (?, ?, ?)
            ON CONFLICT(role) DO UPDATE SET
              permissions = excluded.permissions,
              updated_by = excluded.updated_by,
              updated_at = CURRENT_TIMESTAMP
          `).run(key, JSON.stringify(roles[key]), req.userId);
        }
      });
      tx();
    } catch (e) {
      if (String(e && e.code).startsWith("SQLITE_CONSTRAINT")) {
        return sendApiError(res, 409, "Hak akses tidak valid (duplikat/permission tidak dikenal).", "ADMIN_DATA_INVALID");
      }
      throw e;
    }
    audit(req, "roles.update", "admin_role_permissions", 1, { roles });
    return sendApiSuccess(res, { roles }, "Hak akses diperbarui.");
  });

  // Akun instruktur/orang tua/admin yang dikelola lewat halaman Akses.
  // Catatan: endpoint ini dipakai UI Admin dan menyimpan akun di tabel users.
  const UI_TO_DB = { admin: "admin", instruktur: "instruktur", siswa: "student" };
  const DB_TO_UI = { admin: "admin", instruktur: "instruktur", student: "siswa" };
  const STAFF_GRADE_VALUES = ["SD", "SMP", "SMK"];
  function staffItem(u) {
    return {
      id: Number(u.id),
      username: u.username,
      name: u.full_name || u.username,
      email: u.email || "",
      role: DB_TO_UI[u.role] || "siswa",
      grades: jsonAllowedGrades(u.allowed_grades),
      active: u.status === "active"
    };
  }
  function staffUsernameFor(email) {
    const base = String((email || "").split("@")[0] || "instruktur").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 28);
    let username = base || "instruktur";
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) username = "instruktur";
    const taken = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(username);
    if (taken) username = `${username}${Math.floor(Math.random() * 900 + 100)}`;
    return username;
  }

  app.get("/api/admin/instructors", (req, res) => {
    const rows = db.prepare(`
      SELECT id, username, email, full_name, role, status, allowed_grades, must_change_password, last_login_at, created_at
      FROM users
      WHERE status <> 'deleted'
      ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'instruktur' THEN 1 ELSE 2 END, id ASC
      LIMIT 500
    `).all();
    const items = rows.map(staffItem);
    return sendApiSuccess(res, { items, total: items.length });
  });

  app.post("/api/admin/instructors", (req, res) => adminDataResponse(res, () => {
    const body = req.body || {};
    const name = adminText(body.name, "name", 60, true);
    const email = normalizeEmail(body.email || "") || null;
    if (email && !isValidEmail(email)) adminDataError("Email tidak valid.", "email");
    const dbRole = UI_TO_DB[String(body.role || "instruktur")] || null;
    if (!dbRole) adminDataError("Peran tidak valid.", "role");
    const grades = Array.isArray(body.grades) ? [...new Set(body.grades.map((g) => String(g).toUpperCase()))] : [];
    const gradeList = grades.filter((g) => STAFF_GRADE_VALUES.includes(g));
    if ((dbRole === "instruktur" || dbRole === "student") && gradeList.length < 1) adminDataError("Pilih minimal satu jenjang yang diampu.", "grades");
    if (dbRole === "admin" && gradeList.length > 0) adminDataError("Peran admin tidak perlu jenjang.", "grades");
    // Email akun terhapus dilepas agar tidak menghalangi pembuatan akun baru.
    if (email) releaseDeletedEmail(db, email);
    if (email && db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").get(email)) {
      return sendApiError(res, 409, "Email sudah digunakan.", "EMAIL_EXISTS");
    }
    const username = staffUsernameFor(email);
    if (db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE").get(username)) {
      return sendApiError(res, 409, "Username sudah digunakan.", "USERNAME_EXISTS");
    }
    const password = typeof body.password === "string" && body.password ? body.password : createTempPassword();
    if (password.length < 8 || password.length > 128) adminDataError("Password harus 8-128 karakter.", "password");
    const { salt, hash } = auth.hashPassword(password);
    const info = db.prepare(`
      INSERT INTO users (username, email, full_name, password_hash, password_salt, role, status, must_change_password, allowed_grades)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(username, email, name, hash, salt, dbRole, body.active === false ? "suspended" : "active", JSON.stringify(gradeList));
    const id = Number(info.lastInsertRowid);
    audit(req, "staff.create", "user", id, { username, email, role: dbRole, createdBy: req.userId });
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    return sendApiSuccess(res, { item: staffItem(row), temporaryPassword: body.password ? undefined : password }, "Pengguna berhasil dibuat.", 201);
  }));

  app.patch("/api/admin/instructors/:id", (req, res) => adminDataResponse(res, () => {
    const num = Number(req.params.id);
    if (!Number.isSafeInteger(num) || num < 1) return sendApiError(res, 400, "ID pengguna tidak valid.", "VALIDATION_ERROR");
    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(num);
    if (!target || target.status === "deleted") return sendApiError(res, 404, "Pengguna tidak ditemukan.", "NOT_FOUND");
    if (target.role === "admin" && req.role !== "admin") {
      return sendApiError(res, 403, "Tidak boleh mengubah akun admin.", "ADMIN_REQUIRED");
    }
    if (num === Number(req.userId)) {
      const bSelf = req.body || {};
      if (bSelf.role !== undefined && String(bSelf.role) !== DB_TO_UI[target.role]) {
        return sendApiError(res, 400, "Peran akun Anda sendiri tidak bisa diubah.", "SELF_ROLE_FORBIDDEN");
      }
      if (bSelf.active !== undefined && bSelf.active !== true && target.status === "active") {
        return sendApiError(res, 400, "Akun Anda sendiri tidak bisa dinonaktifkan.", "SELF_DEACTIVATE_FORBIDDEN");
      }
    }
    const b = req.body || {};
    const changes = {};
    if (b.name !== undefined) changes.full_name = adminText(b.name, "name", 60);
    if (b.email !== undefined) {
      const v = normalizeEmail(b.email || "") || null;
      if (v && !isValidEmail(v)) adminDataError("Email tidak valid.", "email");
      if (v) releaseDeletedEmail(db, v);
      if (v && db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE AND id <> ?").get(v, num)) adminDataError("Email sudah digunakan.", "email");
      changes.email = v;
    }
    let nextRole = target.role;
    if (b.role !== undefined) {
      const v = UI_TO_DB[String(b.role)];
      if (!v) adminDataError("Peran tidak valid.", "role");
      if (target.role === "admin" && v !== "admin") {
        return sendApiError(res, 403, "Tidak boleh mengubah akun admin.", "ADMIN_REQUIRED");
      }
      nextRole = v;
      changes.role = v;
    }
    const nextActive = b.active === undefined ? target.status === "active" : Boolean(b.active);
    if (nextActive !== (target.status === "active")) {
      changes.status = nextActive ? "active" : "suspended";
      if (!nextActive) auth.deleteAllSessions(num);
    }
    const grades = Array.isArray(b.grades) ? [...new Set(b.grades.map((g) => String(g).toUpperCase()))] : null;
    if (grades) {
      const gradeList = grades.filter((g) => STAFF_GRADE_VALUES.includes(g));
      if ((nextRole === "instruktur" || nextRole === "student") && gradeList.length < 1) adminDataError("Pilih minimal satu jenjang yang diampu.", "grades");
      changes.allowed_grades = JSON.stringify(gradeList);
    }
    const keys = Object.keys(changes);
    if (keys.length) {
      const sql = keys.map((k) => `${k} = ?`).join(", ");
      db.prepare(`UPDATE users SET ${sql} WHERE id = ?`).run(...keys.map((k) => changes[k]), num);
    }
    audit(req, "staff.update", "user", num, { fields: keys, role: nextRole });
    const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(num);
    return sendApiSuccess(res, { item: staffItem(updated) });
  }));

  app.delete("/api/admin/instructors/:id", (req, res) => {
    const num = Number(req.params.id);
    if (!Number.isSafeInteger(num) || num < 1) return sendApiError(res, 400, "ID pengguna tidak valid.", "VALIDATION_ERROR");
    const target = db.prepare("SELECT id, role, status FROM users WHERE id = ?").get(num);
    if (!target || target.status === "deleted") return sendApiError(res, 404, "Pengguna tidak ditemukan.", "NOT_FOUND");
    if (num === Number(req.userId)) return sendApiError(res, 400, "Tidak dapat menghapus akun sendiri.", "SELF_DELETE_FORBIDDEN");
    if (target.role === "admin" && req.role !== "admin") {
      return sendApiError(res, 403, "Tidak boleh menghapus akun admin.", "ADMIN_REQUIRED");
    }
    const tx = db.transaction(() => {
      db.prepare("UPDATE users SET status = 'deleted' WHERE id = ?").run(num);
      auth.deleteAllSessions(num);
    });
    tx();
    audit(req, "staff.delete", "user", num, { role: target.role });
    return sendApiSuccess(res, { id: num, status: "deleted" });
  });

  // Endpoint murid ala Code Lab sudah dipindahkan ke materi/tahap.
  // M3: daftar user student saja. Pencarian dan pagination dibatasi di server.
  app.get("/api/admin/users", (req, res) => {
    const search = sanitizeString(String(req.query.search || ""), 100);
    const status = ["active", "suspended", "deleted"].includes(String(req.query.status || "")) ? String(req.query.status) : "";
    const grade = ["SD", "SMP", "SMK"].includes(String(req.query.grade || "").toUpperCase()) ? String(req.query.grade).toUpperCase() : "";
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
    const limitN = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 25));
    const where = ["u.role = 'student'"];
    const params = [];
    if (search) { where.push("(u.username LIKE ? OR u.email LIKE ? OR u.full_name LIKE ? OR CAST(u.id AS TEXT) = ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`, search); }
    if (status) { where.push("u.status = ?"); params.push(status); }
    if (grade) {
      // allowed_grades kosong berarti semua jenjang, jadi ikut tampil di filter apa pun.
      where.push("(u.allowed_grades IS NULL OR u.allowed_grades = '' OR u.allowed_grades = '[]' OR u.allowed_grades LIKE ?)");
      params.push(`%"${grade}"%`);
    }
    const clause = where.join(" AND ");
    const total = db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${clause}`).get(...params).n;
    const aggregate = db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status='suspended' THEN 1 ELSE 0 END) AS suspended, (SELECT COUNT(*) FROM tasks) AS tasks_total FROM users WHERE role='student'").get();
    const rows = db.prepare(`SELECT u.id, u.username, u.email, u.full_name, u.status, u.allowed_grades, u.last_login_at, u.created_at, u.subscription_started_at,
        COALESCE(p.total,0) AS points_total,
        (SELECT COUNT(*) FROM progress pr WHERE pr.user_id=u.id AND pr.completed=1) AS completed_tasks,
        (SELECT COUNT(*) FROM user_items ui WHERE ui.user_id=u.id) AS item_count
      FROM users u LEFT JOIN points p ON p.user_id=u.id
      WHERE ${clause} ORDER BY u.id DESC LIMIT ? OFFSET ?`).all(...params, limitN, (page - 1) * limitN);
    const attendanceSummary = attendanceService.summariesForUsers(db, rows);
    return sendApiSuccess(res, {
      users: rows.map(r => {
        const attendance = attendanceSummary.get(Number(r.id)) || { hadir: 0, total: 0, pct: null };
        return {
          ...r,
          allowedGrades: jsonAllowedGrades(r.allowed_grades),
          allowed_grades: undefined,
          subscriptionStartedAt: r.subscription_started_at || null,
          subscription_started_at: undefined,
          attendance,
          attendancePct: attendance.pct
        };
      }),
      page,
      limit: limitN,
      total,
      pages: Math.ceil(total / limitN),
      stats: aggregate
    });
  });

  app.get("/api/admin/users/:id", (req, res) => {
    const u = studentTarget(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    const points = db.prepare("SELECT total, updated_at FROM points WHERE user_id = ?").get(u.id) || { total: 0, updated_at: null };
    const progress = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN completed=1 THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN completed=0 THEN 1 ELSE 0 END) AS incomplete FROM progress WHERE user_id = ?`).get(u.id);
    const items = db.prepare("SELECT item_id, jenis, harga, purchased_at FROM user_items WHERE user_id = ? ORDER BY id DESC").all(u.id);
    const sessionCount = db.prepare("SELECT COUNT(*) AS active FROM sessions WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP").get(u.id);
    const sessions = db.prepare("SELECT created_at, expires_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").all(u.id);
    const progressRows = db.prepare("SELECT task_id, completed, completed_at, bonus_awarded FROM progress WHERE user_id = ? ORDER BY id DESC LIMIT 100").all(u.id);
    const safe = { ...u, allowedGrades: jsonAllowedGrades(u.allowed_grades) }; delete safe.allowed_grades;
    safe.subscriptionStartedAt = u.subscription_started_at || null; delete safe.subscription_started_at;
    safe.firstReportDueDate = reportDeliveries.firstReportDueDate(safe.subscriptionStartedAt);
    return sendApiSuccess(res, { user: safe, points, progress, progressRows, items, sessions, activeSessions: sessionCount.active });
  });

  app.post("/api/admin/users", (req, res) => {
    const body = req.body || {};
    let username = sanitizeString(body.username, 32);
    const usernameProvided = Boolean(username);
    const email = normalizeEmail(body.email || "") || null;
    const fullName = sanitizeString(body.fullName || "", 100) || null;
    let password = typeof body.password === "string" ? body.password : "";
    if (usernameProvided && !/^[a-zA-Z0-9._-]{3,32}$/.test(username)) return sendApiError(res, 400, "Username harus 3-32 karakter (huruf, angka, titik, underscore, strip).", "VALIDATION_ERROR");
    if (!usernameProvided) username = uniqueStudentUsername(email ? email.split("@")[0] : fullName || "siswa");
    if (email && !isValidEmail(email)) return sendApiError(res, 400, "Email tidak valid.", "VALIDATION_ERROR");
    // Email akun terhapus dilepas agar murid baru bisa memakai email yang sama.
    if (email) releaseDeletedEmail(db, email);
    if (email && db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").get(email)) return sendApiError(res, 409, "Email sudah digunakan.", "EMAIL_EXISTS");
    if (db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE").get(username)) return sendApiError(res, 409, "Username sudah digunakan.", "USERNAME_EXISTS");
    let allowedGrades = [];
    if (body.allowedGrades !== undefined) {
      if (!Array.isArray(body.allowedGrades) || body.allowedGrades.some((g) => !["SD", "SMP", "SMK"].includes(String(g).toUpperCase()))) {
        return sendApiError(res, 400, "allowedGrades hanya boleh berisi SD/SMP/SMK.", "VALIDATION_ERROR");
      }
      allowedGrades = [...new Set(body.allowedGrades.map((g) => String(g).toUpperCase()))];
    }
    if (!password) password = createTempPassword();
    if (password.length < 8 || password.length > 128) return sendApiError(res, 400, "Password harus 8-128 karakter.", "VALIDATION_ERROR");
    const { salt, hash } = auth.hashPassword(password);
    try {
      const id = Number(db.prepare(`INSERT INTO users (username,email,full_name,password_hash,password_salt,role,status,must_change_password,allowed_grades)
        VALUES (?,?,?,?,?,'student','active',1,?)`).run(username, email, fullName, hash, salt, JSON.stringify(allowedGrades)).lastInsertRowid);
      audit(req, "student.create", "user", id, { username, email, allowedGrades, autoUsername: !usernameProvided });
      notifyAdmins(db, {
        kind: "student.create",
        title: `Siswa baru: ${fullName || username}`,
        body: `${username}${email ? " Â· " + email : ""}${allowedGrades.length ? " Â· " + allowedGrades.join("/") : ""}`,
        view: "dashboard",
        icon: "fa-solid fa-user-plus",
        tone: "sky",
        dedupeKey: `student.create:${id}`
      });
      return sendApiSuccess(res, { id, username, email, allowedGrades, temporaryPassword: body.password ? undefined : password }, "Murid berhasil dibuat.", 201);
    } catch (e) {
      if (String(e.code || "").startsWith("SQLITE_CONSTRAINT")) return sendApiError(res, 409, "Username/email sudah digunakan.", "DUPLICATE_USER");
      throw e;
    }
  });

  app.patch("/api/admin/users/:id", (req, res) => {
    const u = studentTarget(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    if (u.status === "deleted") return sendApiError(res, 409, "Murid yang sudah soft-delete tidak bisa diedit.", "ACCOUNT_DELETED");
    const b = req.body || {};
    const changes = {};
    if (b.username !== undefined) {
      const v = sanitizeString(b.username, 32);
      if (!/^[a-zA-Z0-9._-]{3,32}$/.test(v)) return sendApiError(res, 400, "Username tidak valid.", "VALIDATION_ERROR");
      const dup = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> ?").get(v, u.id);
      if (dup) return sendApiError(res, 409, "Username sudah digunakan.", "USERNAME_EXISTS");
      changes.username = v;
    }
    if (b.email !== undefined) {
      const v = normalizeEmail(b.email || "") || null;
      if (v && !isValidEmail(v)) return sendApiError(res, 400, "Email tidak valid.", "VALIDATION_ERROR");
      if (v) releaseDeletedEmail(db, v);
      if (v && db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?").get(v, u.id)) return sendApiError(res, 409, "Email sudah digunakan.", "EMAIL_EXISTS");
      changes.email = v;
    }
    if (b.fullName !== undefined) changes.full_name = sanitizeString(b.fullName, 100) || null;
    if (b.bio !== undefined) changes.bio = sanitizeString(b.bio, 1000) || null;
    if (b.avatarUrl !== undefined) changes.avatar_url = sanitizeString(b.avatarUrl, 500) || null;
    if (b.allowedGrades !== undefined) {
      if (!Array.isArray(b.allowedGrades) || b.allowedGrades.some(g => !["SD", "SMP", "SMK"].includes(g))) return sendApiError(res, 400, "allowedGrades hanya boleh berisi SD/SMP/SMK.", "VALIDATION_ERROR");
      changes.allowed_grades = JSON.stringify([...new Set(b.allowedGrades)]);
    }
    const keys = Object.keys(changes);
    if (!keys.length) return sendApiError(res, 400, "Tidak ada field yang dapat diubah.", "VALIDATION_ERROR");
    const sql = keys.map(k => `${k} = ?`).join(", ");
    db.prepare(`UPDATE users SET ${sql} WHERE id = ? AND role = 'student'`).run(...keys.map(k => changes[k]), u.id);
    audit(req, "student.update", "user", u.id, { fields: keys });
    const updated = db.prepare("SELECT id, username, email, full_name, bio, avatar_url, allowed_grades, status FROM users WHERE id = ?").get(u.id);
    return sendApiSuccess(res, { user: { ...updated, allowedGrades: jsonAllowedGrades(updated.allowed_grades) } }, "Data murid diperbarui.");
  });

  app.post("/api/admin/users/:id/reset-password", (req, res) => {
    const u = studentTarget(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    if (u.status === "deleted") return sendApiError(res, 409, "Murid sudah soft-delete.", "ACCOUNT_DELETED");
    const bodyPass = req.body && req.body.password;
    const password = typeof bodyPass === "string" && bodyPass.length ? bodyPass : createTempPassword();
    if (password.length < 8 || password.length > 128) return sendApiError(res, 400, "Password harus 8-128 karakter.", "VALIDATION_ERROR");
    const { salt, hash } = auth.hashPassword(password);
    const tx = db.transaction(() => {
      db.prepare("UPDATE users SET password_hash=?, password_salt=?, must_change_password=1 WHERE id=?").run(hash, salt, u.id);
      auth.deleteAllSessions(u.id);
      audit(req, "student.password_reset", "user", u.id, { must_change_password: true, sessions_revoked: true });
    }); tx();
    return sendApiSuccess(res, { id: u.id, temporaryPassword: bodyPass ? undefined : password }, "Password direset; sesi lama dicabut.");
  });

  app.post("/api/admin/users/:id/suspend", (req, res) => {
    const u = studentTarget(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    if (u.status === "deleted") return sendApiError(res, 409, "Murid sudah soft-delete.", "ACCOUNT_DELETED");
    const suspend = !(req.body && req.body.status === "active");
    db.prepare("UPDATE users SET status=? WHERE id=? AND role='student'").run(suspend ? "suspended" : "active", u.id);
    if (suspend) auth.deleteAllSessions(u.id);
    audit(req, suspend ? "student.suspend" : "student.reactivate", "user", u.id, { status: suspend ? "suspended" : "active" });
    return sendApiSuccess(res, { id: u.id, status: suspend ? "suspended" : "active" }, suspend ? "Murid ditangguhkan." : "Murid diaktifkan kembali.");
  });

  app.post("/api/admin/users/:id/revoke-sessions", (req, res) => {
    const u = studentTarget(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    const result = db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
    audit(req, "student.sessions_revoked", "user", u.id, { count: result.changes });
    return sendApiSuccess(res, { revoked: result.changes }, "Semua sesi murid dicabut.");
  });

  app.delete("/api/admin/users/:id", (req, res) => {
    const u = studentTarget(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    if (u.id === req.userId) return sendApiError(res, 400, "Tidak dapat menonaktifkan akun sendiri.", "SELF_DELETE_FORBIDDEN");
    db.prepare("UPDATE users SET status='deleted' WHERE id=? AND role='student'").run(u.id);
    auth.deleteAllSessions(u.id);
    audit(req, "student.soft_delete", "user", u.id, { status: "deleted" });
    return sendApiSuccess(res, { id: u.id, status: "deleted" }, "Murid dihapus secara soft delete.");
  });

  // ------------------------------------------------------------
  // WALI SISWA & TAUTAN LAPORAN
  // Wali bukan akun login. Admin hanya menyimpan kontak dan membuat tautan
  // yang bisa dikirim lewat email. Tautan disimpan sebagai hash dan bisa
  // kedaluwarsa/dicabut.
  // ------------------------------------------------------------
  function reportStudent(id) {
    const u = studentTarget(id);
    return u && u.status !== "deleted" ? u : null;
  }

  function guardianPayload(body) {
    const raw = body && body.guardians;
    if (!Array.isArray(raw)) adminDataError("guardians harus berupa array.", "guardians");
    if (raw.length > reports.MAX_GUARDIANS) {
      adminDataError(`Maksimal ${reports.MAX_GUARDIANS} wali per siswa.`, "guardians");
    }
    const seen = new Set();
    return raw.map((item, index) => {
      const field = `guardians[${index}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        adminDataError(`${field} harus berupa objek.`, field);
      }
      const name = adminText(item.name, `${field}.name`, 60, true);
      const email = normalizeEmail(item.email || "");
      if (!email || !isValidEmail(email)) adminDataError(`Email wali ke-${index + 1} tidak valid.`, `${field}.email`);
      if (seen.has(email)) adminDataError("Email wali tidak boleh duplikat.", `${field}.email`);
      seen.add(email);
      const relation = item.relation === undefined ? "wali" : String(item.relation).toLowerCase();
      if (!reports.RELATIONS.includes(relation)) {
        adminDataError("Hubungan wali harus ayah, ibu, wali, atau lainnya.", `${field}.relation`);
      }
      return { name, email, relation };
    });
  }

  function reportBaseUrl(req) {
    const configured = process.env.APP_PUBLIC_ORIGIN || process.env.PUBLIC_BASE_URL;
    if (configured) return String(configured).replace(/\/+$/, "");
    return `${req.protocol}://${req.get("host")}`;
  }

  app.get("/api/admin/users/:id/guardians", (req, res) => {
    const u = reportStudent(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    const items = reports.listGuardians(db, u.id);
    return sendApiSuccess(res, { items, total: items.length });
  });

  app.put("/api/admin/users/:id/guardians", (req, res) => adminDataResponse(res, () => {
    const u = reportStudent(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    const guardians = guardianPayload(req.body || {});
    const items = reports.replaceGuardians(db, u.id, guardians, req.userId);
    // Wali baru/berubah langsung masuk antrean bila siswa sudah berlangganan.
    const queued = reports.queueGuardianDeliveries(db, u.id, u.subscription_started_at || null);
    audit(req, "guardian.update", "user", u.id, { total: items.length, queued });
    return sendApiSuccess(res, {
      items,
      total: items.length,
      queued: { created: queued.created, revived: queued.revived, total: queued.queued }
    }, "Data wali diperbarui.");
  }));

  app.get("/api/admin/users/:id/report-links", (req, res) => {
    const u = reportStudent(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    const items = reports.listReportLinks(db, u.id);
    return sendApiSuccess(res, { items, total: items.length });
  });

  app.post("/api/admin/users/:id/report-links", (req, res) => adminDataResponse(res, () => {
    const u = reportStudent(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");

    const body = req.body || {};
    const days = body.expiresInDays === undefined ? reports.DEFAULT_EXPIRY_DAYS : Number(body.expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > reports.MAX_EXPIRY_DAYS) {
      adminDataError(`expiresInDays harus bilangan bulat 1-${reports.MAX_EXPIRY_DAYS}.`, "expiresInDays");
    }

    let guardianId = null;
    if (body.guardianId !== undefined && body.guardianId !== null) {
      guardianId = Number(body.guardianId);
      if (!Number.isSafeInteger(guardianId) || guardianId < 1) {
        adminDataError("guardianId tidak valid.", "guardianId");
      }
      if (!reports.getGuardian(db, guardianId, u.id)) {
        return sendApiError(res, 400, "Wali tidak ditemukan pada siswa ini.", "GUARDIAN_NOT_FOUND");
      }
    }

    const link = reports.createReportLink(db, u.id, {
      guardianId,
      expiresInDays: days,
      createdBy: req.userId
    });
    audit(req, "report_link.create", "user", u.id, {
      linkId: link.id,
      guardianId,
      expiresInDays: days
    });

    return sendApiSuccess(res, {
      item: {
        id: link.id,
        studentId: link.studentId,
        guardianId: link.guardianId,
        url: `${reportBaseUrl(req)}/api/reports/${link.token}`,
        pageUrl: reports.reportPageUrl(reportBaseUrl(req), link.token),
        expiresAt: link.expiresAt,
        createdAt: link.createdAt
      }
    }, "Tautan laporan dibuat.", 201);
  }));

  app.delete("/api/admin/users/:id/report-links/:linkId", (req, res) => {
    const u = reportStudent(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    const linkId = Number(req.params.linkId);
    if (!Number.isSafeInteger(linkId) || linkId < 1) {
      return sendApiError(res, 400, "ID tautan tidak valid.", "VALIDATION_ERROR");
    }
    const result = reports.revokeReportLink(db, u.id, linkId);
    if (!result) return sendApiError(res, 404, "Tautan laporan tidak ditemukan.", "NOT_FOUND");
    audit(req, "report_link.revoke", "user", u.id, { linkId });
    return sendApiSuccess(res, result, "Tautan laporan dicabut.");
  });

  // ------------------------------------------------------------
  // BERLANGGANAN & CATATAN PENGIRIMAN EMAIL LAPORAN
  // Email laporan pertama ke wali jatuh tempo 1 bulan setelah tanggal mulai
  // berlangganan. Pengirim email dan penjadwalnya belum ada; endpoint di sini
  // hanya mengatur tanggal dan menampilkan catatan pengiriman.
  // ------------------------------------------------------------
  function subscriptionItem(userId, startedAt) {
    return {
      userId,
      subscriptionStartedAt: startedAt || null,
      firstReportDueDate: reportDeliveries.firstReportDueDate(startedAt || null)
    };
  }

  function deliveryQuery(req) {
    const rawStatus = req.query.status === undefined ? "" : String(req.query.status);
    if (rawStatus && !reportDeliveries.STATUSES.includes(rawStatus)) {
      adminDataError(`status harus salah satu dari: ${reportDeliveries.STATUSES.join(", ")}.`, "status");
    }
    return { status: rawStatus || null, page: req.query.page, limit: req.query.limit };
  }

  app.put("/api/admin/users/:id/subscription", (req, res) => adminDataResponse(res, () => {
    const u = reportStudent(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");

    const body = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(body, "startedAt")) {
      adminDataError("startedAt wajib diisi (YYYY-MM-DD) atau null untuk menghapus.", "startedAt");
    }
    let startedAt = body.startedAt;
    if (startedAt !== null) {
      if (typeof startedAt !== "string" || !reportDeliveries.isValidDateOnly(startedAt.trim())) {
        adminDataError("startedAt harus tanggal yang valid berformat YYYY-MM-DD (tahun 2000-2100) atau null.", "startedAt");
      }
      startedAt = startedAt.trim();
    }

    const previous = u.subscription_started_at || null;
    const sync = db.transaction(() => {
      db.prepare("UPDATE users SET subscription_started_at = ? WHERE id = ? AND role = 'student'").run(startedAt, u.id);
      const result = reportDeliveries.syncPendingForSubscription(db, u.id, startedAt);
      // Email laporan untuk tiap wali ikut diantrekan saat tanggal diisi.
      // Idempoten: baris yang sudah ada (termasuk 'sent') tidak diduplikasi.
      const queued = reports.queueGuardianDeliveries(db, u.id, startedAt);
      audit(req, "subscription.update", "user", u.id, {
        from: previous,
        to: startedAt,
        rescheduled: result.rescheduled,
        skipped: result.skipped,
        queued
      });
      return { ...result, queued };
    })();

    return sendApiSuccess(res, {
      item: subscriptionItem(u.id, startedAt),
      deliveries: { rescheduled: sync.rescheduled, skipped: sync.skipped },
      queued: { created: sync.queued.created, revived: sync.queued.revived, total: sync.queued.queued }
    }, startedAt ? "Tanggal mulai berlangganan disimpan." : "Tanggal mulai berlangganan dihapus.");
  }));

  app.get("/api/admin/users/:id/report-deliveries", (req, res) => adminDataResponse(res, () => {
    const u = reportStudent(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    const result = reportDeliveries.listDeliveries(db, { ...deliveryQuery(req), studentId: u.id });
    return sendApiSuccess(res, {
      ...result,
      subscription: subscriptionItem(u.id, u.subscription_started_at)
    });
  }));

  app.get("/api/admin/report-deliveries", (req, res) => adminDataResponse(res, () => {
    return sendApiSuccess(res, reportDeliveries.listDeliveries(db, deliveryQuery(req)));
  }));

  // Jalankan penjadwal sekali secara manual. Tanpa studentId semua baris yang
  // jatuh tempo diproses; `today` boleh diisi untuk simulasi.
  app.post("/api/admin/report-deliveries/run", async (req, res) => {
    try {
      const body = req.body || {};
      let today;
      if (body.today !== undefined && body.today !== null && body.today !== "") {
        today = String(body.today).trim();
        if (!reportDeliveries.isValidDateOnly(today)) {
          adminDataError("today harus tanggal valid berformat YYYY-MM-DD.", "today");
        }
        // Boleh mundur (simulasi), tidak boleh maju: memajukan tanggal akan mengirim email ke wali
        // sebelum jatuh tempo, dan pengiriman yang sudah 'sent' tidak bisa ditarik kembali.
        if (today > reportDeliveries.dateOnlyToday()) {
          adminDataError("today tidak boleh lebih dari hari ini.", "today");
        }
      }
      let studentId;
      if (body.studentId !== undefined && body.studentId !== null && body.studentId !== "") {
        studentId = Number(body.studentId);
        if (!Number.isSafeInteger(studentId) || studentId < 1) {
          adminDataError("studentId tidak valid.", "studentId");
        }
      }
      let batchSize;
      if (body.limit !== undefined && body.limit !== null && body.limit !== "") {
        batchSize = Number(body.limit);
        if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
          adminDataError("limit harus bilangan bulat positif.", "limit");
        }
      }

      const summary = await reportScheduler.processDueDeliveries(db, {
        baseUrl: reportBaseUrl(req),
        today,
        studentId,
        batchSize
      });
      audit(req, "report_delivery.run", "report_delivery", studentId || "all", {
        today: summary.today,
        processed: summary.processed,
        sent: summary.sent,
        failed: summary.failed,
        skipped: summary.skipped
      });
      return sendApiSuccess(res, { summary }, "Pengiriman email laporan dijalankan.");
    } catch (error) {
      if (error && error.code === "ADMIN_DATA_INVALID") {
        return sendApiError(res, 400, error.message, "ADMIN_DATA_INVALID", error.field ? { field: error.field } : undefined);
      }
      if (error && error.code === "CONFIGURATION_ERROR") {
        return sendApiError(res, 503, error.message, "CONFIGURATION_ERROR");
      }
      console.error("Gagal menjalankan pengiriman laporan:", error);
      return sendApiError(res, 500, "Gagal menjalankan pengiriman laporan.", "INTERNAL_ERROR");
    }
  });

  app.post("/api/admin/report-deliveries/:id/retry", (req, res) => adminDataResponse(res, () => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return sendApiError(res, 400, "ID pengiriman tidak valid.", "VALIDATION_ERROR");
    }
    const result = reportDeliveries.retryDelivery(db, id);
    if (!result.found) return sendApiError(res, 404, "Pengiriman tidak ditemukan.", "NOT_FOUND");
    if (result.sent) {
      return sendApiError(res, 409, "Pengiriman yang sudah terkirim tidak bisa diulang.", "DELIVERY_ALREADY_SENT");
    }
    audit(req, "report_delivery.retry", "report_delivery", id, {});
    return sendApiSuccess(res, {
      item: reportDeliveries.getDelivery(db, id)
    }, "Pengiriman dijadwalkan ulang.");
  }));

  // Pratinjau isi email tanpa membuat tautan asli dan tanpa mengubah status.
  app.post("/api/admin/report-deliveries/:id/preview", (req, res) => adminDataResponse(res, () => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return sendApiError(res, 400, "ID pengiriman tidak valid.", "VALIDATION_ERROR");
    }
    const item = reportDeliveries.getDelivery(db, id);
    if (!item) return sendApiError(res, 404, "Pengiriman tidak ditemukan.", "NOT_FOUND");
    const report = reports.buildStudentReport(db, item.studentId);
    if (!report) return sendApiError(res, 404, "Siswa untuk pengiriman ini tidak ditemukan.", "STUDENT_NOT_FOUND");
    const email = reportEmail.buildReportEmail({
      report,
      studentName: report.student.name,
      guardianName: item.recipientName,
      institutionName: report.institution.name,
      pageUrl: reports.reportPageUrl(reportBaseUrl(req), "x".repeat(43)),
      expiresAt: null
    });
    return sendApiSuccess(res, { item, email, preview: true });
  }));

  // Learning analytics dan achievements untuk dashboard staff.
  // Akses melewati permission siswa.kelola dari adminPermissionGate.
  app.get("/api/admin/users/:id/learning/analytics", (req, res) => {
    const u = reportStudent(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    try {
      const analytics = learningService.buildLearningAnalytics(db, u.id);
      return sendApiSuccess(res, { analytics });
    } catch (error) {
      console.error("Gagal mengambil learning analytics siswa:", error);
      return sendApiError(res, 500, "Gagal mengambil analisis belajar siswa.", "INTERNAL_ERROR");
    }
  });

  app.get("/api/admin/users/:id/achievements", (req, res) => {
    const u = reportStudent(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    try {
      const analytics = learningService.buildLearningAnalytics(db, u.id);
      const achievements = analytics ? analytics.achievements : [];
      return sendApiSuccess(res, {
        achievements,
        total: achievements.length,
        earned: achievements.filter((item) => item.earned).length
      });
    } catch (error) {
      console.error("Gagal mengambil achievement siswa:", error);
      return sendApiError(res, 500, "Gagal mengambil achievement siswa.", "INTERNAL_ERROR");
    }
  });

  // Pesan mentor: hanya admin/instruktur dengan permission siswa.kelola yang dapat mengubah.
  app.get("/api/admin/users/:id/mentor-note", (req, res) => {
    const u = reportStudent(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    try {
      return sendApiSuccess(res, { item: learningService.getMentorNote(db, u.id) });
    } catch (error) {
      console.error("Gagal mengambil pesan mentor:", error);
      return sendApiError(res, 500, "Gagal mengambil pesan mentor.", "INTERNAL_ERROR");
    }
  });

  app.put("/api/admin/users/:id/mentor-note", (req, res) => {
    const u = reportStudent(req.params.id);
    if (!u) return sendApiError(res, 404, "Murid tidak ditemukan.", "NOT_FOUND");
    const raw = req.body && req.body.note;
    if (typeof raw !== "string") {
      return sendApiError(res, 400, "note wajib berupa teks.", "VALIDATION_ERROR");
    }
    const note = raw.replace(/\r\n?/g, "\n").trim();
    const length = Array.from(note).length;
    if (length > 400) {
      return sendApiError(res, 400, "Pesan mentor maksimal 400 karakter.", "VALIDATION_ERROR", { maxLength: 400 });
    }

    try {
      if (!note) {
        db.prepare("DELETE FROM student_mentor_notes WHERE student_user_id = ?").run(u.id);
        audit(req, "mentor_note.clear", "user", u.id, {});
        return sendApiSuccess(res, { item: null }, "Pesan mentor dihapus.");
      }

      db.prepare(`
        INSERT INTO student_mentor_notes (student_user_id, note, author_user_id)
        VALUES (?, ?, ?)
        ON CONFLICT(student_user_id) DO UPDATE SET
          note = excluded.note,
          author_user_id = excluded.author_user_id,
          updated_at = CURRENT_TIMESTAMP
      `).run(u.id, note, req.userId);

      audit(req, "mentor_note.update", "user", u.id, { length });
      return sendApiSuccess(res, { item: learningService.getMentorNote(db, u.id) }, "Pesan mentor tersimpan.");
    } catch (error) {
      console.error("Gagal menyimpan pesan mentor:", error);
      return sendApiError(res, 500, "Gagal menyimpan pesan mentor.", "INTERNAL_ERROR");
    }
  });

  // M4: upload ZIP mentah ke quarantine. Upload dan publish hanya allowlist developer admin.
  app.post("/api/admin/plugins/upload", pluginDeveloper, express.raw({ type: ["application/zip", "application/x-zip-compressed", "application/octet-stream"], limit: "20mb" }), (req, res) => {
    if (!Buffer.isBuffer(req.body)) return sendApiError(res, 415, "Kirim file ZIP sebagai request body dengan Content-Type application/zip.", "ZIP_REQUIRED");
    if (!req.body.length || req.body.length > MAX_ZIP_BYTES) return sendApiError(res, 413, "ZIP kosong atau melampaui 20 MB.", "ZIP_TOO_LARGE");
    const uploadId = crypto.randomUUID();
    const qDir = path.join(quarantineRoot, uploadId);
    const filesDir = path.join(qDir, "files");
    fs.mkdirSync(filesDir, { recursive: true });
    fs.writeFileSync(path.join(qDir, "source.zip"), req.body, { mode: 0o600, flag: "wx" });
    let result;
    try {
      result = extractZipSafely(req.body, filesDir);
    } catch (e) {
      const report = { scanner: "zip-validation", critical: [{ code: e.code || "INVALID_PLUGIN_ZIP", message: e.message }], warnings: [], outcome: "rejected" };
      fs.writeFileSync(path.join(qDir, "validation-report.json"), JSON.stringify(report, null, 2));
      return sendApiError(res, 400, e.message, e.code || "INVALID_PLUGIN_ZIP", report);
    }
    const m = result.manifest;
    const duplicate = db.prepare("SELECT id FROM plugin_versions WHERE plugin_id=? AND version=?").get(m.id, m.version);
    if (duplicate) { fs.rmSync(qDir, { recursive: true, force: true }); return sendApiError(res, 409, `Plugin ${m.id} versi ${m.version} sudah ada. Versi harus unik.`, "PLUGIN_VERSION_EXISTS"); }
    const report = { ...result.findings, fileCount: result.entries.length, totalUncompressed: result.totalUncompressed, sha256: sha256(req.body), outcome: "needs_review" };
    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO plugin_categories (id,name) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name`).run(m.category.id, m.category.name);
      db.prepare(`INSERT INTO plugins (plugin_id,name,category_id,category_name,status,created_by) VALUES (?,?,?,?, 'quarantine', ?)
        ON CONFLICT(plugin_id) DO UPDATE SET name=excluded.name,category_id=excluded.category_id,category_name=excluded.category_name,updated_at=CURRENT_TIMESTAMP`).run(m.id,m.name,m.category.id,m.category.name,req.userId);
      db.prepare(`INSERT INTO plugin_versions (upload_id,plugin_id,version,status,zip_sha256,manifest_json,scan_report_json,quarantine_path,uploaded_by)
        VALUES (?,?,?,'needs_review',?,?,?,?,?)`).run(uploadId,m.id,m.version,sha256(req.body),JSON.stringify(m),JSON.stringify(report),uploadId,req.userId);
      audit(req,"plugin.upload","plugin_version",`${m.id}@${m.version}`,{uploadId,sha256:report.sha256,fileCount:report.fileCount,findings:report.findings.length});
    });
    try { tx(); } catch (e) {
      if (String(e.code || "").startsWith("SQLITE_CONSTRAINT")) return sendApiError(res, 409, "Plugin/version duplikat.", "PLUGIN_VERSION_EXISTS");
      throw e;
    }
    fs.writeFileSync(path.join(qDir,"validation-report.json"),JSON.stringify(report,null,2));
    notifyAdmins(db, {
      kind: "plugin.upload",
      title: `Plugin menunggu review: ${m.name}`,
      body: `${m.id} v${m.version} Â· ${report.fileCount} file`,
      view: "dashboard",
      icon: "fa-solid fa-plug",
      tone: "amber",
      dedupeKey: `plugin.upload:${uploadId}`
    });
    return sendApiSuccess(res,{ uploadId, pluginId:m.id, version:m.version, status:"needs_review", sha256:report.sha256, report },"ZIP masuk karantina dan menunggu review.",201);
  });

  app.get("/api/admin/plugins", (req, res) => {
    const versions = db.prepare(`SELECT pv.id,pv.upload_id,pv.plugin_id,p.name,pv.version,pv.status,pv.zip_sha256,pv.scan_report_json,
      pv.created_at,pv.published_at,pv.uploaded_by,pv.reviewed_by FROM plugin_versions pv JOIN plugins p ON p.plugin_id=pv.plugin_id
      ORDER BY pv.created_at DESC LIMIT 200`).all();
    return sendApiSuccess(res,{ plugins: versions.map(v => ({...v,scanReport: (()=>{try{return JSON.parse(v.scan_report_json)}catch{return {}}})()})) });
  });

  app.post("/api/admin/plugins/:versionId/approve", pluginDeveloper, (req,res) => {
    const v=pluginVersionById(req.params.versionId);
    if(!v) return sendApiError(res,404,"Versi plugin tidak ditemukan.","NOT_FOUND");
    if(v.status!=="needs_review") return sendApiError(res,409,"Hanya plugin berstatus needs_review yang dapat disetujui.","INVALID_PLUGIN_STATE");
    db.prepare("UPDATE plugin_versions SET status='approved',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(req.userId,v.id);
    audit(req,"plugin.approve","plugin_version",`${v.plugin_id}@${v.version}`,{});
    return sendApiSuccess(res,{id:v.id,status:"approved"},"Review dicatat; versi disetujui.");
  });

  app.post("/api/admin/plugins/:versionId/reject", pluginDeveloper, (req,res) => {
    const v=pluginVersionById(req.params.versionId);
    if(!v) return sendApiError(res,404,"Versi plugin tidak ditemukan.","NOT_FOUND");
    if(!["needs_review","approved"].includes(v.status)) return sendApiError(res,409,"Hanya versi yang menunggu review atau sudah approved dapat ditolak.","INVALID_PLUGIN_STATE");
    const reason=sanitizeString(req.body?.reason || "Ditolak saat manual review.",500);
    let report = {};
    try { report = JSON.parse(v.scan_report_json || "{}"); } catch { report = {}; }
    report.manualReview = { status: "rejected", reason, reviewerId: req.userId, reviewedAt: new Date().toISOString() };
    db.prepare("UPDATE plugin_versions SET status='rejected',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,scan_report_json=? WHERE id=?").run(req.userId,JSON.stringify(report),v.id);
    audit(req,"plugin.reject","plugin_version",`${v.plugin_id}@${v.version}`,{reason});
    return sendApiSuccess(res,{id:v.id,status:"rejected"},"Versi plugin ditolak; tetap berada di quarantine.");
  });

  app.post("/api/admin/plugins/:versionId/publish", pluginDeveloper, (req,res) => {
    const v=pluginVersionById(req.params.versionId);
    if(!v) return sendApiError(res,404,"Versi plugin tidak ditemukan.","NOT_FOUND");
    if(v.status!=="approved") return sendApiError(res,409,"Hanya versi approved yang boleh dipublish.","INVALID_PLUGIN_STATE");
    const manifest=JSON.parse(v.manifest_json);
    const from=path.join(quarantineRoot,v.quarantine_path,"files");
    const to=path.join(liveRoot,v.plugin_id,v.version);
    if(!fs.existsSync(path.join(from,manifest.entry))) return sendApiError(res,409,"File entry tidak tersedia di quarantine.","PLUGIN_ENTRY_MISSING");
    fs.mkdirSync(path.dirname(to),{recursive:true});
    if(fs.existsSync(to)) return sendApiError(res,409,"Direktori versi live sudah ada. Versi bersifat immutable.","LIVE_VERSION_EXISTS");
    fs.cpSync(from,to,{recursive:true,errorOnExist:true,force:false});
    const tx=db.transaction(()=>{
      db.prepare("UPDATE plugin_versions SET status='published',live_path=?,published_at=CURRENT_TIMESTAMP WHERE id=? AND status='approved'").run(`${v.plugin_id}/${v.version}`,v.id);
      db.prepare("UPDATE plugins SET status='published',updated_at=CURRENT_TIMESTAMP WHERE plugin_id=?").run(v.plugin_id);
      audit(req,"plugin.publish","plugin_version",`${v.plugin_id}@${v.version}`,{livePath:`${v.plugin_id}/${v.version}`});
    });
    try{tx();}catch(e){try{fs.rmSync(to,{recursive:true,force:true});}catch{} throw e;}
    notifyAdmins(db, {
      kind: "plugin.publish",
      title: `Plugin dipublikasikan: ${manifest.name || v.plugin_id}`,
      body: `${v.plugin_id} v${v.version} Â· ${manifest.category?.name || "Tanpa kategori"}`,
      view: "dashboard",
      icon: "fa-solid fa-rocket",
      tone: "emerald",
      dedupeKey: `plugin.publish:${v.id}`
    });
    return sendApiSuccess(res,{id:v.id,status:"published",url:`${process.env.PLUGIN_PUBLIC_ORIGIN || "https://plugins.domain.com"}/${v.plugin_id}/${v.version}/${manifest.entry}`},"Versi plugin dipublikasikan.");
  });

  app.post("/api/admin/plugins/:versionId/preview-ticket", (req,res) => {
    const v=pluginVersionById(req.params.versionId);
    if(!v || !["needs_review","approved"].includes(v.status)) return sendApiError(res,404,"Versi karantina tidak tersedia untuk preview.","NOT_FOUND");
    try {
      const ticket=signPreviewTicket(v.upload_id);
      const manifest=JSON.parse(v.manifest_json);
      const origin=process.env.PLUGIN_PUBLIC_ORIGIN || "https://plugins.domain.com";
      const url=`${origin}/preview/${ticket}/${manifest.entry}`;
      audit(req,"plugin.preview_ticket","plugin_version",`${v.plugin_id}@${v.version}`,{expiresInSeconds:300});
      return sendApiSuccess(res,{url,expiresInSeconds:300},"Preview ticket dibuat. Tidak mengandung token sesi API.");
    } catch(e) { return sendApiError(res,503,e.message,"PREVIEW_NOT_CONFIGURED"); }
  });

  // Hanya plugin published yang dapat ditemukan player publik.
  app.get("/api/plugins", (req,res) => {
    const rows = db.prepare(`SELECT p.plugin_id,p.name,p.category_id,p.category_name,pv.version,pv.manifest_json,pv.published_at
      FROM plugins p JOIN plugin_versions pv ON pv.plugin_id=p.plugin_id AND pv.status='published'
      WHERE p.status='published' AND pv.id=(SELECT MAX(pv2.id) FROM plugin_versions pv2 WHERE pv2.plugin_id=p.plugin_id AND pv2.status='published')
      ORDER BY p.name COLLATE NOCASE`).all();
    const origin = process.env.PLUGIN_PUBLIC_ORIGIN || "https://plugins.domain.com";
    return sendApiSuccess(res,{ plugins: rows.map(r => { const m=JSON.parse(r.manifest_json); return { id:r.plugin_id,name:r.name,category:{id:r.category_id,name:r.category_name},version:r.version,entry:m.entry,grades:m.grades,permissions:m.permissions,network:{allow:m.network?.allow||[]},origin,url:`${origin}/${r.plugin_id}/${r.version}/${m.entry}`,publishedAt:r.published_at }; }) });
  });
  app.get("/api/plugins/:pluginId", (req,res) => {
    const r=db.prepare(`SELECT p.plugin_id,p.name,p.category_id,p.category_name,pv.version,pv.manifest_json,pv.published_at
      FROM plugins p JOIN plugin_versions pv ON pv.plugin_id=p.plugin_id AND pv.status='published'
      WHERE p.plugin_id=? AND p.status='published' AND pv.id=(SELECT MAX(pv2.id) FROM plugin_versions pv2 WHERE pv2.plugin_id=p.plugin_id AND pv2.status='published')`).get(String(req.params.pluginId));
    if(!r) return sendApiError(res,404,"Plugin tidak ditemukan.","NOT_FOUND");
    const m=JSON.parse(r.manifest_json), origin=process.env.PLUGIN_PUBLIC_ORIGIN||"https://plugins.domain.com";
    return sendApiSuccess(res,{plugin:{id:r.plugin_id,name:r.name,category:{id:r.category_id,name:r.category_name},version:r.version,entry:m.entry,grades:m.grades,permissions:m.permissions,network:{allow:m.network?.allow||[]},origin,url:`${origin}/${r.plugin_id}/${r.version}/${m.entry}`,publishedAt:r.published_at}});
  });

  // Mengaktifkan kembali versi published/disabled/rolled_back yang file live-nya masih ada.
  // Versi published lain untuk plugin yang sama ditandai rolled_back agar hanya satu versi aktif.
  app.post("/api/admin/plugins/:versionId/rollback", pluginDeveloper, (req,res)=>{
    const v=pluginVersionById(req.params.versionId);
    if(!v) return sendApiError(res,404,"Versi plugin tidak ditemukan.","NOT_FOUND");
    if(!["published","disabled","rolled_back"].includes(v.status) || !v.live_path) return sendApiError(res,409,"Hanya versi yang pernah dipublish yang dapat di-rollback.","INVALID_PLUGIN_STATE");
    const active=db.prepare("SELECT id,version FROM plugin_versions WHERE plugin_id=? AND status='published' ORDER BY id DESC LIMIT 1").get(v.plugin_id);
    if(active && active.id===v.id) return sendApiError(res,409,"Versi ini sudah aktif.","PLUGIN_ALREADY_ACTIVE");
    const manifest=JSON.parse(v.manifest_json);
    const root=path.join(liveRoot,v.plugin_id,v.version);
    if(!fs.existsSync(path.join(root,manifest.entry))) return sendApiError(res,409,"File live versi tujuan tidak tersedia.","PLUGIN_ENTRY_MISSING");
    const tx=db.transaction(()=>{
      db.prepare("UPDATE plugin_versions SET status='rolled_back' WHERE plugin_id=? AND status='published' AND id<>?").run(v.plugin_id,v.id);
      db.prepare("UPDATE plugin_versions SET status='published' WHERE id=?").run(v.id);
      db.prepare("UPDATE plugins SET status='published',updated_at=CURRENT_TIMESTAMP WHERE plugin_id=?").run(v.plugin_id);
      audit(req,"plugin.rollback","plugin_version",`${v.plugin_id}@${v.version}`,{fromVersion:active?active.version:null,toVersion:v.version});
    });
    tx();
    const origin=process.env.PLUGIN_PUBLIC_ORIGIN||"https://plugins.domain.com";
    return sendApiSuccess(res,{id:v.id,status:"published",version:v.version,url:`${origin}/${v.plugin_id}/${v.version}/${manifest.entry}`},"Rollback berhasil; versi lama aktif kembali.");
  });

  app.post("/api/admin/plugins/:versionId/disable", pluginDeveloper, (req,res)=>{
    const v=pluginVersionById(req.params.versionId);
    if(!v) return sendApiError(res,404,"Versi plugin tidak ditemukan.","NOT_FOUND");
    if(v.status!=="published") return sendApiError(res,409,"Hanya versi published yang dapat dinonaktifkan.","INVALID_PLUGIN_STATE");
    db.prepare("UPDATE plugin_versions SET status='disabled' WHERE id=?").run(v.id);
    const stillLive=db.prepare("SELECT COUNT(*) AS n FROM plugin_versions WHERE plugin_id=? AND status='published'").get(v.plugin_id).n;
    if(!stillLive) db.prepare("UPDATE plugins SET status='disabled',updated_at=CURRENT_TIMESTAMP WHERE plugin_id=?").run(v.plugin_id);
    audit(req,"plugin.disable","plugin_version",`${v.plugin_id}@${v.version}`,{});
    return sendApiSuccess(res,{id:v.id,status:"disabled"},"Versi plugin dinonaktifkan; file tidak dihapus untuk audit/rollback.");
  });

  // ------------------------------------------------------------
  // MATERI — tautan materi per task (tabel `materials`).
  // Sumber data yang sama dipakai portal murid. Endpoint publik hanya
  // mengirim status 'terbit'; Admin bisa melihat dan mengubah draft.
  // ------------------------------------------------------------
  const MATERIAL_GRADES = ["SD", "SMP", "SMK"];

  function materialDto(row) {
    const judul = row.judul || "";
    const keterangan = row.keterangan || "";
    return {
      id: row.id,
      grade: row.grade,
      moduleId: row.module_id,
      lessonIndex: row.lesson_index,
      path: row.path,
      judul,
      keterangan,
      status: row.status || "terbit",
      // Alias untuk kompatibilitas UI Admin (static/materi.js).
      title: judul,
      order: row.lesson_index,
      description: keterangan,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  // Ambil field kanonik; kalau tidak ada, pakai alias lama dari UI Admin.
  function materialField(body, canonical, alias) {
    return body[canonical] !== undefined ? body[canonical] : body[alias];
  }
  function materialInvalid(res, message, field) {
    return sendApiError(res, 400, message, "MATERIAL_INVALID", field ? { field } : undefined);
  }
  function parseMaterialGrade(value) {
    const grade = String(value == null ? "" : value).trim().toUpperCase();
    return MATERIAL_GRADES.includes(grade) ? grade : null;
  }
  function parseMaterialModuleId(value) {
    const moduleId = String(value == null ? "" : value).trim();
    return /^[A-Za-z0-9_-]{1,64}$/.test(moduleId) ? moduleId : null;
  }
  function parseMaterialLessonIndex(value) {
    const num = typeof value === "number" ? value : Number(value);
    return Number.isInteger(num) && num >= 0 && num <= 999 ? num : null;
  }
  function parseMaterialPath(value) {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") return null;
    const p = value.trim();
    if (p === "") return "";   // boleh kosong: materi tersimpan tetapi belum punya tautan
    if (p.length > 500) return null;
    if (!p.startsWith("/") || p.startsWith("//")) return null;
    if (/[\\\u0000-\u001F\u007F]/.test(p)) return null;
    if (p.split("/").some((segment) => segment === "..")) return null;
    return p;
  }
  function parseMaterialTitle(value) {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") return null;
    const title = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
    return title.length <= 200 ? title : null;
  }
  function parseMaterialNote(value) {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") return null;
    const note = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
    return note.length <= 500 ? note : null;
  }
  function parseMaterialStatus(value) {
    if (value === undefined || value === null || value === "") return "terbit";
    const status = String(value).trim().toLowerCase();
    return status === "terbit" || status === "draft" ? status : null;
  }
  function materialModuleExists(grade, moduleId) {
    return !!db.prepare("SELECT 1 FROM modules WHERE grade = ? AND module_id = ?").get(grade, moduleId);
  }

  app.get("/api/admin/materials", (req, res) => {
    const where = [];
    const params = [];
    if (req.query.grade !== undefined && req.query.grade !== "") {
      const grade = parseMaterialGrade(req.query.grade);
      if (!grade) return materialInvalid(res, "grade harus SD/SMP/SMK.", "grade");
      where.push("grade = ?");
      params.push(grade);
    }
    if (req.query.moduleId !== undefined && req.query.moduleId !== "") {
      const moduleId = parseMaterialModuleId(req.query.moduleId);
      if (!moduleId) return materialInvalid(res, "moduleId tidak valid.", "moduleId");
      where.push("module_id = ?");
      params.push(moduleId);
    }
    if (req.query.status !== undefined && req.query.status !== "") {
      const status = parseMaterialStatus(req.query.status);
      if (!status) return materialInvalid(res, "status harus terbit atau draft.", "status");
      where.push("status = ?");
      params.push(status);
    }
    const sql = `SELECT * FROM materials${where.length ? " WHERE " + where.join(" AND ") : ""}
      ORDER BY grade ASC, module_id ASC, lesson_index ASC`;
    const items = db.prepare(sql).all(...params).map(materialDto);
    return sendApiSuccess(res, { items, total: items.length });
  });

  app.post("/api/admin/materials", (req, res) => {
    const body = req.body || {};
    const grade = parseMaterialGrade(body.grade);
    if (!grade) return materialInvalid(res, "grade harus SD/SMP/SMK.", "grade");
    const moduleIdRaw = materialField(body, "moduleId", "modul");
    const moduleId = parseMaterialModuleId(moduleIdRaw);
    if (!moduleId) return materialInvalid(res, "moduleId wajib diisi (huruf, angka, - atau _).", "moduleId");
    const lessonIndexRaw = materialField(body, "lessonIndex", "order");
    const lessonIndex = lessonIndexRaw === undefined ? 0 : parseMaterialLessonIndex(lessonIndexRaw);
    if (lessonIndex === null) return materialInvalid(res, "lessonIndex harus bilangan bulat 0-999.", "lessonIndex");
    const materialPath = parseMaterialPath(materialField(body, "path", "link"));
    if (materialPath === null) return materialInvalid(res, "path harus diawali / dan berupa alamat internal.", "path");
    const judul = parseMaterialTitle(materialField(body, "judul", "title"));
    if (judul === null) return materialInvalid(res, "judul maksimal 200 karakter.", "judul");
    const keterangan = parseMaterialNote(materialField(body, "keterangan", "description"));
    if (keterangan === null) return materialInvalid(res, "keterangan maksimal 500 karakter.", "keterangan");
    const status = parseMaterialStatus(body.status);
    if (!status) return materialInvalid(res, "status harus terbit atau draft.", "status");
    if (!materialModuleExists(grade, moduleId)) {
      return sendApiError(res, 404, "Modul tidak ditemukan untuk jenjang tersebut.", "MODULE_NOT_FOUND", { field: "moduleId" });
    }

    let info;
    try {
      info = db.prepare(`INSERT INTO materials (grade, module_id, lesson_index, path, judul, keterangan, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(grade, moduleId, lessonIndex, materialPath, judul, keterangan, status);
    } catch (err) {
      if (String(err && err.code).startsWith("SQLITE_CONSTRAINT")) {
        return sendApiError(res, 409, "Materi untuk modul dan nomor task itu sudah ada.", "MATERIAL_EXISTS", { field: "lessonIndex" });
      }
      throw err;
    }
    const id = Number(info.lastInsertRowid);
    audit(req, "materi.create", "material", id, { grade, moduleId, lessonIndex, path: materialPath, status });
    const row = db.prepare("SELECT * FROM materials WHERE id = ?").get(id);
    return sendApiSuccess(res, { item: materialDto(row) }, "Materi berhasil dibuat.", 201);
  });

  app.patch("/api/admin/materials/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return materialInvalid(res, "ID materi tidak valid.", "id");
    const current = db.prepare("SELECT * FROM materials WHERE id = ?").get(id);
    if (!current) return sendApiError(res, 404, "Materi tidak ditemukan.", "NOT_FOUND");

    const body = req.body || {};
    const grade = body.grade === undefined ? current.grade : parseMaterialGrade(body.grade);
    if (!grade) return materialInvalid(res, "grade harus SD/SMP/SMK.", "grade");
    const moduleIdRaw = materialField(body, "moduleId", "modul");
    const moduleId = moduleIdRaw === undefined ? current.module_id : parseMaterialModuleId(moduleIdRaw);
    if (!moduleId) return materialInvalid(res, "moduleId tidak valid.", "moduleId");
    const lessonIndexRaw = materialField(body, "lessonIndex", "order");
    const lessonIndex = lessonIndexRaw === undefined ? current.lesson_index : parseMaterialLessonIndex(lessonIndexRaw);
    if (lessonIndex === null) return materialInvalid(res, "lessonIndex harus bilangan bulat 0-999.", "lessonIndex");
    const pathRaw = materialField(body, "path", "link");
    const materialPath = pathRaw === undefined ? current.path : parseMaterialPath(pathRaw);
    if (materialPath === null) return materialInvalid(res, "path harus diawali / dan berupa alamat internal.", "path");
    const judulRaw = materialField(body, "judul", "title");
    const judul = judulRaw === undefined ? (current.judul || "") : parseMaterialTitle(judulRaw);
    if (judul === null) return materialInvalid(res, "judul maksimal 200 karakter.", "judul");
    const keteranganRaw = materialField(body, "keterangan", "description");
    const keterangan = keteranganRaw === undefined ? (current.keterangan || "") : parseMaterialNote(keteranganRaw);
    if (keterangan === null) return materialInvalid(res, "keterangan maksimal 500 karakter.", "keterangan");
    const status = body.status === undefined ? (current.status || "terbit") : parseMaterialStatus(body.status);
    if (!status) return materialInvalid(res, "status harus terbit atau draft.", "status");
    if (!materialModuleExists(grade, moduleId)) {
      return sendApiError(res, 404, "Modul tidak ditemukan untuk jenjang tersebut.", "MODULE_NOT_FOUND", { field: "moduleId" });
    }

    try {
      db.prepare(`UPDATE materials
        SET grade = ?, module_id = ?, lesson_index = ?, path = ?, judul = ?, keterangan = ?, status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(grade, moduleId, lessonIndex, materialPath, judul, keterangan, status, id);
    } catch (err) {
      if (String(err && err.code).startsWith("SQLITE_CONSTRAINT")) {
        return sendApiError(res, 409, "Materi untuk modul dan nomor task itu sudah ada.", "MATERIAL_EXISTS", { field: "lessonIndex" });
      }
      throw err;
    }
    audit(req, "materi.update", "material", id, { fields: Object.keys(body), grade, moduleId, lessonIndex, status });
    const row = db.prepare("SELECT * FROM materials WHERE id = ?").get(id);
    return sendApiSuccess(res, { item: materialDto(row) }, "Materi diperbarui.");
  });

  app.delete("/api/admin/materials/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return materialInvalid(res, "ID materi tidak valid.", "id");
    const current = db.prepare("SELECT * FROM materials WHERE id = ?").get(id);
    if (!current) return sendApiError(res, 404, "Materi tidak ditemukan.", "NOT_FOUND");
    db.prepare("DELETE FROM materials WHERE id = ?").run(id);
    audit(req, "materi.delete", "material", id, {
      grade: current.grade,
      moduleId: current.module_id,
      lessonIndex: current.lesson_index,
      path: current.path
    });
    return sendApiSuccess(res, { id }, "Materi dihapus.");
  });
}

module.exports = { registerAdminApi };
