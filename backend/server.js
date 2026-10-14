const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
    path: path.join(__dirname, ".env")
});

const express = require("express");
const { askTutor, hasApiKey } = require("./ai-tutor-api");
const cors = require("cors");

const db = require("./database");
const auth = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// API ERROR HELPER
// ============================================================

function sendApiError(res, status, message, code = "API_ERROR", details = null) {
    const body = { ok: false, code, message };
    if (details) body.details = details;
    return res.status(status).json(body);
}

function sendApiSuccess(res, data, message = "OK") {
    return res.json({ ok: true, message, ...data });
}

function requireDevelopmentMode(req, res, next) {
    if (process.env.NODE_ENV === "production") {
        return sendApiError(res, 404, "Endpoint tidak ditemukan", "NOT_FOUND");
    }
    next();
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

function validateRequired(body, fields) {
    const missing = fields.filter(f => !body || body[f] === undefined || body[f] === null || body[f] === "");
    return missing.length === 0 ? null : `Field wajib: ${missing.join(", ")}`;
}

function sanitizeString(str, maxLen = 1000) {
    if (typeof str !== "string") return "";
    return str.slice(0, maxLen).trim();
}

// ============================================================
// RATE LIMITING (simple in-memory for AI Tutor)
// ============================================================

const aiRequestCounts = new Map();
const AI_RATE_LIMIT = 30; // requests per window
const AI_RATE_WINDOW_MS = 60 * 1000; // 1 minute

function checkAiRateLimit(ip) {
    const now = Date.now();
    const entry = aiRequestCounts.get(ip);
    if (!entry || now - entry.windowStart > AI_RATE_WINDOW_MS) {
        aiRequestCounts.set(ip, { count: 1, windowStart: now });
        return true;
    }
    if (entry.count >= AI_RATE_LIMIT) return false;
    entry.count++;
    return true;
}

// ============================================================
// PATH PROJECT
// ============================================================

const PROJECT_ROOT = path.join(__dirname, "..");

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ============================================================
// FRONTEND FILE SERVER
// ============================================================

app.use((req, res, next) => {
    if (
        req.path === "/backend" ||
        req.path.startsWith("/backend/") ||
        req.path.startsWith("/node_modules") ||
        req.path === "/package.json" ||
        req.path === "/package-lock.json"
    ) {
        return res.status(404).send("Not Found");
    }
    next();
});

app.use(
    express.static(PROJECT_ROOT, {
        index: false
    })
);

// ============================================================
// HALAMAN UTAMA
// ============================================================

app.get("/", (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "index.html"));
});

// ============================================================
// HALAMAN FRONTEND
// ============================================================

// Dashboard
app.get("/dashboard.html", (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "dashboard", "dashboard.html"));
});

// Alias lama untuk halaman belajar SD
app.get("/belajar.html", (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "SD", "belajar.html"));
});

// Halaman belajar SMP
app.get("/belajar-smp.html", (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "SMP", "belajar-smp.html"));
});

// Halaman belajar SMK
app.get("/belajar-smk.html", (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "SMK", "belajar-smk.html"));
});

// Alias untuk halaman kurikulum SMP lama
app.get("/smp.html", (req, res) => {
    res.redirect("/belajar-smp.html");
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
    sendApiSuccess(res, {
        status: "ok",
        message: "Backend Scratch Anin berjalan",
        time: new Date().toISOString(),
        version: "1.0.0"
    });
});

// ============================================================
// MATERIALS API
// ============================================================

// Ambil semua materi
app.get("/api/materials/:grade/:moduleId", (req, res) => {
    try {
        const grade = sanitizeString(req.params.grade);
        const moduleId = sanitizeString(req.params.moduleId);

        if (!grade || !moduleId) {
            return sendApiError(res, 400, "grade dan moduleId wajib diisi", "VALIDATION_ERROR");
        }

        const materials = db.prepare(`
            SELECT id, grade, module_id, lesson_index, path, created_at
            FROM materials
            WHERE grade = ? AND module_id = ?
            ORDER BY lesson_index ASC
        `).all(grade, moduleId);

        sendApiSuccess(res, { materials });
    } catch (error) {
        console.error("Gagal mengambil materi task:", error);
        sendApiError(res, 500, "Gagal mengambil data materi", "INTERNAL_ERROR");
    }
});

// GET ALL MATERIALS
app.get("/api/materials", (req, res) => {
    try {
        const materials = db.prepare(`
            SELECT id, grade, module_id, lesson_index, path, created_at
            FROM materials
            ORDER BY grade ASC, module_id ASC, lesson_index ASC
        `).all();
        sendApiSuccess(res, { materials });
    } catch (error) {
        console.error("Gagal mengambil semua materi:", error);
        sendApiError(res, 500, "Gagal mengambil data materi", "INTERNAL_ERROR");
    }
});

// ============================================================
// TASKS API
// ============================================================

// GET TASKS BY MODULE
app.get("/api/tasks/:grade/:moduleId", (req, res) => {
    try {
        const grade = sanitizeString(req.params.grade);
        const moduleId = sanitizeString(req.params.moduleId);

        if (!grade || !moduleId) {
            return sendApiError(res, 400, "grade dan moduleId wajib diisi", "VALIDATION_ERROR");
        }

        const rows = db.prepare(`
            SELECT id, grade, module_id, task_id, task_index, title, steps,
                   is_project, requires_submission, editor_url, created_at
            FROM tasks
            WHERE grade = ? AND module_id = ?
            ORDER BY task_index ASC
        `).all(grade, moduleId);

        const tasks = rows.map((task) => ({
            ...task,
            steps: JSON.parse(task.steps || "[]")
        }));

        sendApiSuccess(res, { tasks });
    } catch (error) {
        console.error("Gagal mengambil data task:", error);
        sendApiError(res, 500, "Gagal mengambil data task", "INTERNAL_ERROR");
    }
});

// GET ALL TASKS (for admin/debug)
app.get("/api/tasks", (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT id, grade, module_id, task_id, task_index, title, steps,
                   is_project, requires_submission, editor_url, created_at
            FROM tasks
            ORDER BY grade ASC, module_id ASC, task_index ASC
        `).all();
        const tasks = rows.map((task) => ({
            ...task,
            steps: JSON.parse(task.steps || "[]")
        }));
        sendApiSuccess(res, { tasks });
    } catch (error) {
        console.error("Gagal mengambil semua task:", error);
        sendApiError(res, 500, "Gagal mengambil data task", "INTERNAL_ERROR");
    }
});

// ============================================================
// MODULES API
// ============================================================

app.get("/api/modules/:grade", (req, res) => {
    try {
        const grade = sanitizeString(req.params.grade);
        if (!grade) return sendApiError(res, 400, "grade wajib diisi", "VALIDATION_ERROR");

        const modules = db.prepare(`
            SELECT m.id, m.grade, m.module_id, m.created_at,
                   COUNT(DISTINCT t.id) as task_count,
                   COUNT(DISTINCT a.id) as material_count
            FROM modules m
            LEFT JOIN tasks t ON t.grade = m.grade AND t.module_id = m.module_id
            LEFT JOIN materials a ON a.grade = m.grade AND a.module_id = m.module_id
            WHERE m.grade = ?
            GROUP BY m.grade, m.module_id
            ORDER BY m.module_id ASC
        `).all(grade);

        sendApiSuccess(res, { modules });
    } catch (error) {
        console.error("Gagal mengambil modul:", error);
        sendApiError(res, 500, "Gagal mengambil data modul", "INTERNAL_ERROR");
    }
});

// ============================================================
// AUTH (LOGIN) - Username/Password (Legacy)
// ============================================================

app.post("/api/auth/login", (req, res) => {
    const username = sanitizeString(req.body.username, 32);
    const password = req.body.password;

    const validation = validateRequired(req.body, ["username", "password"]);
    if (validation) return sendApiError(res, 400, validation, "VALIDATION_ERROR");
    if (username.length > 32) return sendApiError(res, 400, "Username maksimal 32 karakter", "VALIDATION_ERROR");
    if (password.length < 4) return sendApiError(res, 400, "Password minimal 4 karakter", "VALIDATION_ERROR");

    const attemptKey = req.ip + "|" + username;

    if (auth.isBlocked(attemptKey)) {
        return sendApiError(res, 429, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.", "RATE_LIMITED");
    }

    const user = db.prepare(`
        SELECT username, password_hash, password_salt
        FROM users
        WHERE username = ?
    `).get(username);

    let status = "login";

    if (!user) {
        auth.recordFail(attemptKey);
        return sendApiError(res, 401, "Username atau password salah", "INVALID_CREDENTIALS");
    }

    if (!user.password_hash) {
        // Akun lama dari sebelum sistem password dibuat
        const { salt, hash } = auth.hashPassword(password);
        db.prepare(`
            UPDATE users SET password_hash = ?, password_salt = ? WHERE username = ?
        `).run(hash, salt, username);
        status = "claimed";
    } else if (!auth.verifyPassword(password, user.password_salt, user.password_hash)) {
        auth.recordFail(attemptKey);
        return sendApiError(res, 401, "Username atau password salah", "INVALID_CREDENTIALS");
    }

    auth.clearFails(attemptKey);

    const token = auth.createSession(username);
    sendApiSuccess(res, { username, token, status }, "Login berhasil");
});

// ============================================================
// AUTH - FIREBASE LOGIN (Existing user)
// ============================================================

app.post("/api/auth/firebase-login", async (req, res) => {
    try {
        const idToken = sanitizeString(req.body.idToken);
        const validation = validateRequired(req.body, ["idToken"]);
        if (validation) return sendApiError(res, 400, validation, "VALIDATION_ERROR");

        const firebaseUser = await auth.verifyFirebaseToken(idToken);
        const username = firebaseUser.username;

        // Pastikan user tersedia di SQLite
        db.prepare(`
            INSERT INTO users (username, email, firebase_uid)
            VALUES (?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
                email = excluded.email,
                firebase_uid = excluded.firebase_uid
        `).run(username, firebaseUser.email, firebaseUser.uid);

        const token = auth.createSession(username);
        sendApiSuccess(res, { username, token, email: firebaseUser.email }, "Login Firebase berhasil");
    } catch (error) {
        console.error("Firebase login error:", error);
        sendApiError(res, 401, "Login Firebase gagal: " + error.message, "FIREBASE_AUTH_ERROR");
    }
});

// ============================================================
// AUTH - REGISTER (Username/Password - Legacy)
// ============================================================

app.post("/api/auth/register", (req, res) => {
    const username = sanitizeString(req.body.username, 32);
    const password = req.body.password;

    const validation = validateRequired(req.body, ["username", "password"]);
    if (validation) return sendApiError(res, 400, validation, "VALIDATION_ERROR");
    if (username.length > 32) return sendApiError(res, 400, "Username maksimal 32 karakter", "VALIDATION_ERROR");
    if (password.length < 4) return sendApiError(res, 400, "Password minimal 4 karakter", "VALIDATION_ERROR");

    // Cek apakah username sudah ada
    const existing = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
    if (existing) {
        return sendApiError(res, 409, "Username sudah terdaftar", "USERNAME_EXISTS");
    }

    // Buat user baru
    const { salt, hash } = auth.hashPassword(password);
    db.prepare(`
        INSERT INTO users (username, password_hash, password_salt)
        VALUES (?, ?, ?)
    `).run(username, hash, salt);

    const token = auth.createSession(username);
    sendApiSuccess(res, { username, token }, "Registrasi berhasil", 201);
});

// ============================================================
// AUTH - REGISTER FIREBASE (New user via Firebase)
// ============================================================

app.post("/api/auth/firebase-register", async (req, res) => {
    try {
        const idToken = sanitizeString(req.body.idToken);
        const validation = validateRequired(req.body, ["idToken"]);
        if (validation) return sendApiError(res, 400, validation, "VALIDATION_ERROR");

        const firebaseUser = await auth.verifyFirebaseToken(idToken);
        const username = firebaseUser.username;

        // Cek apakah username sudah ada
        const existing = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
        if (existing) {
            return sendApiError(res, 409, "Akun ini sudah terdaftar. Silakan login.", "USERNAME_EXISTS");
        }

        // Buat user baru dengan Firebase UID
        db.prepare(`
            INSERT INTO users (username, email, firebase_uid)
            VALUES (?, ?, ?)
        `).run(username, firebaseUser.email, firebaseUser.uid);

        const token = auth.createSession(username);
        sendApiSuccess(res, { username, token, email: firebaseUser.email }, "Registrasi Firebase berhasil", 201);
    } catch (error) {
        console.error("Firebase register error:", error);
        sendApiError(res, 401, "Registrasi Firebase gagal: " + error.message, "FIREBASE_AUTH_ERROR");
    }
});

// ============================================================
// AUTH - ME / LOGOUT
// ============================================================

app.get("/api/auth/me", auth.requireAuth, (req, res) => {
    sendApiSuccess(res, { username: req.user });
});

app.post("/api/auth/logout", auth.requireAuth, (req, res) => {
    auth.deleteSession(req.token);
    sendApiSuccess(res, {}, "Logout berhasil");
});

// ============================================================
// USER PROFILE API
// ============================================================

app.get("/api/profile", auth.requireAuth, (req, res) => {
    const user = db.prepare(`
        SELECT username, email, firebase_uid, created_at
        FROM users WHERE username = ?
    `).get(req.user);
    if (!user) return sendApiError(res, 404, "User tidak ditemukan", "NOT_FOUND");
    sendApiSuccess(res, { profile: user });
});

app.put("/api/profile", auth.requireAuth, (req, res) => {
    const { fullName, avatar } = req.body;
    // Simpan ke localStorage via frontend, tapi bisa juga ke DB kalau perlu
    sendApiSuccess(res, { fullName, avatar }, "Profil diperbarui (simpan di frontend)");
});

// ============================================================
// ALLOWED GRADES PER USER (for dashboard grade tabs)
// ============================================================

app.get("/api/user/allowed-grades", auth.requireAuth, (req, res) => {
    // Default: semua grade. Bisa di-extend nanti dengan kolom di users table.
    sendApiSuccess(res, { grades: ["sd", "smp", "smak"] });
});

app.put("/api/user/allowed-grades", auth.requireAuth, (req, res) => {
    // Admin only - untuk set grade yang diizinkan per user
    // Implementasi nanti kalau butuh role admin
    sendApiError(res, 501, "Belum diimplementasikan", "NOT_IMPLEMENTED");
});

// ============================================================
// DEVELOPMENT PROGRESS (untuk testing tanpa auth)
// ============================================================

const DEV_USERNAME = "dev";

db.prepare(`
    INSERT INTO users (username) VALUES (?) ON CONFLICT(username) DO NOTHING
`).run(DEV_USERNAME);

app.get("/api/dev/progress", requireDevelopmentMode, (req, res) => {
    try {
        const progress = db.prepare(`
            SELECT task_id, completed, completed_at
            FROM progress WHERE username = ? ORDER BY id ASC
        `).all(DEV_USERNAME);
        sendApiSuccess(res, { username: DEV_USERNAME, progress });
    } catch (error) {
        console.error("Gagal mengambil progress dev:", error);
        sendApiError(res, 500, "Gagal mengambil progress");
    }
});

app.post("/api/dev/progress", requireDevelopmentMode, (req, res) => {
    try {
        const { taskId, completed } = req.body || {};
        if (!taskId) return sendApiError(res, 400, "taskId wajib diisi", "VALIDATION_ERROR");
        if (typeof completed !== "boolean") return sendApiError(res, 400, "completed harus true/false", "VALIDATION_ERROR");

        const taskExists = db.prepare("SELECT 1 FROM tasks WHERE task_id = ?").get(taskId);
        if (!taskExists) return sendApiError(res, 404, "Task tidak ditemukan", "NOT_FOUND");

        const completedAt = completed ? new Date().toISOString() : null;
        db.prepare(`
            INSERT INTO progress (username, task_id, completed, completed_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(username, task_id) DO UPDATE SET
                completed = excluded.completed, completed_at = excluded.completed_at
        `).run(DEV_USERNAME, taskId, completed ? 1 : 0, completedAt);

        sendApiSuccess(res, { username: DEV_USERNAME, taskId, completed }, "Progress disimpan");
    } catch (error) {
        console.error("Gagal menyimpan progress dev:", error);
        sendApiError(res, 500, "Gagal menyimpan progress");
    }
});

app.get("/api/dev/points", requireDevelopmentMode, (req, res) => {
    try {
        const row = db.prepare("SELECT total FROM points WHERE username = ?").get(DEV_USERNAME);
        sendApiSuccess(res, { username: DEV_USERNAME, total: row ? row.total : 0 });
    } catch (error) {
        console.error("Gagal mengambil points dev:", error);
        sendApiError(res, 500, "Gagal mengambil points");
    }
});

app.post("/api/dev/points", requireDevelopmentMode, (req, res) => {
    try {
        const total = req.body?.total;
        if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
            return sendApiError(res, 400, "total points harus bilangan bulat non-negatif", "VALIDATION_ERROR");
        }
        db.prepare(`
            INSERT INTO points (username, total, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(username) DO UPDATE SET total = excluded.total, updated_at = CURRENT_TIMESTAMP
        `).run(DEV_USERNAME, total);
        sendApiSuccess(res, { username: DEV_USERNAME, total }, "Points disimpan");
    } catch (error) {
        console.error("Gagal menyimpan points dev:", error);
        sendApiError(res, 500, "Gagal menyimpan points");
    }
});

// ============================================================
// GET PROGRESS (Per User - Auth Required)
// ============================================================

app.get("/api/progress/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    const username = req.params.username.trim();
    if (!username) return sendApiError(res, 400, "Username wajib diisi", "VALIDATION_ERROR");

    const progress = db.prepare(`
        SELECT task_id, completed, completed_at
        FROM progress WHERE username = ? ORDER BY id ASC
    `).all(username);
    sendApiSuccess(res, { progress });
});

// ============================================================
// SAVE PROGRESS (Per User - Auth Required)
// ============================================================

app.post("/api/progress/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    const username = req.params.username.trim();
    const { taskId, completed } = req.body;

    if (!username) return sendApiError(res, 400, "Username wajib diisi", "VALIDATION_ERROR");
    if (!taskId) return sendApiError(res, 400, "taskId wajib diisi", "VALIDATION_ERROR");

    db.prepare(`INSERT INTO users (username) VALUES (?) ON CONFLICT(username) DO NOTHING`).run(username);

    const isCompleted = completed === true;
    db.prepare(`
        INSERT INTO progress (username, task_id, completed, completed_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username, task_id) DO UPDATE SET
            completed = excluded.completed, completed_at = excluded.completed_at
    `).run(username, taskId, isCompleted ? 1 : 0, isCompleted ? new Date().toISOString() : null);

    sendApiSuccess(res, { username, taskId, completed: isCompleted }, "Progress berhasil disimpan");
});

// ============================================================
// GET POINTS (Per User - Auth Required)
// ============================================================

app.get("/api/points/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    const username = req.params.username.trim();
    if (!username) return sendApiError(res, 400, "Username wajib diisi", "VALIDATION_ERROR");

    const row = db.prepare("SELECT total FROM points WHERE username = ?").get(username);
    sendApiSuccess(res, { username, total: row ? row.total : 0 });
});

// ============================================================
// SAVE POINTS (Per User - Auth Required)
// ============================================================

app.post("/api/points/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    const username = req.params.username.trim();
    const total = Number(req.body.total);

    if (!username) return sendApiError(res, 400, "Username wajib diisi", "VALIDATION_ERROR");
    if (!Number.isFinite(total) || total < 0) return sendApiError(res, 400, "total points tidak valid", "VALIDATION_ERROR");

    db.prepare(`INSERT INTO users (username) VALUES (?) ON CONFLICT(username) DO NOTHING`).run(username);

    db.prepare(`
        INSERT INTO points (username, total, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(username) DO UPDATE SET total = excluded.total, updated_at = CURRENT_TIMESTAMP
    `).run(username, Math.floor(total));

    sendApiSuccess(res, { username, total: Math.floor(total) }, "Points berhasil disimpan");
});

// ============================================================
// AI TUTOR (With Rate Limit & Auth)
// ============================================================

app.post("/api/ai/tutor", auth.requireAuth, async (req, res) => {
    try {
        // Rate limiting by IP
        if (!checkAiRateLimit(req.ip)) {
            return sendApiError(res, 429, "Terlalu banyak permintaan ke AI. Tunggu sebentar.", "RATE_LIMITED");
        }

        const {
            message,
            taskId, taskTitle, taskDescription, taskSteps, taskMaterial, taskHint,
            editorHtml, editorCss, editorLanguage, editorCode,
            smpTask,
        } = req.body || {};

        if (typeof message !== "string" || !message.trim()) {
            return sendApiError(res, 400, "Pesan tidak boleh kosong.", "VALIDATION_ERROR");
        }
        if (message.length > 4000) {
            return sendApiError(res, 400, "Pesan terlalu panjang (maks 4000 karakter).", "VALIDATION_ERROR");
        }

        if (!hasApiKey()) {
            console.error("GROQ_API_KEY belum diatur di backend/.env");
            return sendApiError(res, 500, "AI Tutor belum dikonfigurasi.", "CONFIGURATION_ERROR");
        }

        const result = await askTutor({
            message: message.trim(),
            taskId, taskTitle, taskDescription, taskSteps, taskMaterial, taskHint,
            editorHtml, editorCss, editorLanguage, editorCode, smpTask,
        });

        sendApiSuccess(res, result);
    } catch (error) {
        console.error("AI Tutor error:", error);
        sendApiError(res, 500, "AI Tutor gagal merespons: " + error.message, "INTERNAL_ERROR");
    }
});

// ============================================================
// 404
// ============================================================

app.use((req, res) => {
    sendApiError(res, 404, "Route tidak ditemukan", "NOT_FOUND", { path: req.path });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log("");
    console.log("==========================================");
    console.log("  DIENG CYBER CODING - SERVER");
    console.log("==========================================");
    console.log("");
    console.log(`Frontend : http://localhost:${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}/dashboard.html`);
    console.log(`Belajar  : http://localhost:${PORT}/belajar.html`);
    console.log(`API      : http://localhost:${PORT}/api`);
    console.log("");
    console.log("Server siap digunakan.");
    console.log("");
});