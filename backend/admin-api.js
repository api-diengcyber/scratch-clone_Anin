"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { extractZipSafely, sha256, MAX_ZIP_BYTES } = require("./plugin-zip");

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
  function audit(req, action, targetType, targetId, details = {}) {
    db.prepare(`INSERT INTO admin_audit (actor_user_id, actor_username, action, target_type, target_id, details, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(req.userId, req.user || "unknown", action, targetType, String(targetId ?? ""), JSON.stringify(details), req.ip || null);
  }
  function studentTarget(id) {
    const num = Number(id);
    if (!Number.isSafeInteger(num) || num < 1) return null;
    const user = db.prepare(`SELECT id, username, email, full_name, bio, avatar_url, allowed_grades, role, status,
        must_change_password, last_login_at, created_at FROM users WHERE id = ?`).get(num);
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

  app.use("/api/admin", auth.requireAuth, auth.requireAdmin, limit);

  // Identitas admin yang sedang login (dipakai UI admin).
  app.get("/api/admin/me", (req, res) => sendApiSuccess(res, {
    id: req.userId,
    username: req.user,
    role: req.role,
    status: req.status,
    mustChangePassword: req.mustChangePassword
  }));

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
    const limitN = Math.max(1, Math.min(20, Number.parseInt(req.query.limit, 10) || 5));
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
    const saved = db.prepare("SELECT updated_at FROM curriculum_documents WHERE id = 'default'").get();
    return sendApiSuccess(res, {
      exists: true,
      curriculum,
      version: nextVersion,
      updatedAt: saved ? saved.updated_at : null
    }, "Kurikulum disimpan.");
  });

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
    const rows = db.prepare(`SELECT u.id, u.username, u.email, u.full_name, u.status, u.allowed_grades, u.last_login_at, u.created_at,
        COALESCE(p.total,0) AS points_total,
        (SELECT COUNT(*) FROM progress pr WHERE pr.user_id=u.id AND pr.completed=1) AS completed_tasks,
        (SELECT COUNT(*) FROM user_items ui WHERE ui.user_id=u.id) AS item_count
      FROM users u LEFT JOIN points p ON p.user_id=u.id
      WHERE ${clause} ORDER BY u.id DESC LIMIT ? OFFSET ?`).all(...params, limitN, (page - 1) * limitN);
    return sendApiSuccess(res, { users: rows.map(r => ({ ...r, allowedGrades: jsonAllowedGrades(r.allowed_grades), allowed_grades: undefined })), page, limit: limitN, total, pages: Math.ceil(total / limitN), stats: aggregate });
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
}

module.exports = { registerAdminApi };
