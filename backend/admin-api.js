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

  // M3: daftar user student saja. Pencarian dan pagination dibatasi di server.
  app.get("/api/admin/users", (req, res) => {
    const search = sanitizeString(String(req.query.search || ""), 100);
    const status = ["active", "suspended", "deleted"].includes(String(req.query.status || "")) ? String(req.query.status) : "";
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
    const limitN = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 25));
    const where = ["u.role = 'student'"];
    const params = [];
    if (search) { where.push("(u.username LIKE ? OR u.email LIKE ? OR u.full_name LIKE ? OR CAST(u.id AS TEXT) = ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`, search); }
    if (status) { where.push("u.status = ?"); params.push(status); }
    const clause = where.join(" AND ");
    const total = db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${clause}`).get(...params).n;
    const aggregate = db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status='suspended' THEN 1 ELSE 0 END) AS suspended FROM users WHERE role='student'").get();
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
    const username = sanitizeString(body.username, 32);
    const email = normalizeEmail(body.email || "") || null;
    const fullName = sanitizeString(body.fullName || "", 100) || null;
    let password = typeof body.password === "string" ? body.password : "";
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) return sendApiError(res, 400, "Username harus 3-32 karakter (huruf, angka, titik, underscore, strip).", "VALIDATION_ERROR");
    if (email && !isValidEmail(email)) return sendApiError(res, 400, "Email tidak valid.", "VALIDATION_ERROR");
    if (email && db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").get(email)) return sendApiError(res, 409, "Email sudah digunakan.", "EMAIL_EXISTS");
    if (db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE").get(username)) return sendApiError(res, 409, "Username sudah digunakan.", "USERNAME_EXISTS");
    if (!password) password = createTempPassword();
    if (password.length < 8 || password.length > 128) return sendApiError(res, 400, "Password harus 8-128 karakter.", "VALIDATION_ERROR");
    const { salt, hash } = auth.hashPassword(password);
    try {
      const id = Number(db.prepare(`INSERT INTO users (username,email,full_name,password_hash,password_salt,role,status,must_change_password)
        VALUES (?,?,?,?,?,'student','active',1)`).run(username, email, fullName, hash, salt).lastInsertRowid);
      audit(req, "student.create", "user", id, { username, email });
      return sendApiSuccess(res, { id, username, email, temporaryPassword: body.password ? undefined : password }, "Murid berhasil dibuat.", 201);
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
