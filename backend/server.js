const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");

dotenv.config({
    path: path.join(__dirname, ".env")
});

const pino = require("pino");
const { redactPathForLog } = require("./log-redact");
const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    base: { service: "dcc-backend" }
});

// Global error handlers (before express)
process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
    logger.fatal({ reason }, "Unhandled rejection");
});

const express = require("express");
const { askTutor, hasApiKey } = require("./ai-tutor-api");
const cors = require("cors");
const compression = require("compression");

const db = require("./database");
const auth = require("./auth");
const shop = require("./shop-catalog");
const { notifyAdmins } = require("./notifications");
const { releaseDeletedEmail } = require("./user-identity");
const learningService = require("./learning-service");
const reportScheduler = require("./report-scheduler");
const mentoringScheduler = require("./mentoring-reminder-scheduler");
const subscriptionService = require("./subscription-service");

const app = express();
const PORT = process.env.PORT || 3000;

// Jangan bocorkan teknologi server.
app.disable("x-powered-by");

// Di balik reverse proxy hosting (Railway/Render/VPS + Nginx), tanpa ini
// req.ip selalu IP proxy → rate limit login jadi satu bucket untuk semua user.
if (process.env.NODE_ENV === "production") {
    // 1 = Nginx/Caddy langsung; 2 = Cloudflare + Nginx.
    const rawTrustProxy = process.env.TRUST_PROXY;
    const trustProxyHops = rawTrustProxy === undefined || rawTrustProxy === ""
        ? 1
        : Number(rawTrustProxy);
    app.set("trust proxy", Number.isInteger(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1);
}

// ============================================================
// API ERROR HELPER
// ============================================================

function sendApiError(res, status, message, code = "API_ERROR", details = null) {
    const body = { ok: false, code, message };
    if (details) body.details = details;
    return res.status(status).json(body);
}

function sendApiSuccess(res, data, message = "OK", status = 200) {
    return res.status(status).json({ ok: true, message, ...data });
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

function normalizeTaskId(value) {
    if (typeof value !== "string") return null;
    const taskId = value.trim();
    return taskId && taskId.length <= 128 ? taskId : null;
}

// Email disimpan lowercase supaya "Budi@Mail.com" dan "budi@mail.com" dianggap sama.
function normalizeEmail(email) {
    return sanitizeString(email, 255).toLowerCase();
}

// Validasi bentuk email sederhana: ada teks, @, domain, dan titik di domain.
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Kebijakan keamanan dari pengaturan instansi (admin_settings): masa sesi
// login dan password minimal baru diambil dari nilai admin yang disimpan.
function sessionHoursFromSettings() {
    try {
        const row = db.prepare("SELECT payload_json FROM admin_settings WHERE id = 1").get();
        if (row) {
            const settings = JSON.parse(row.payload_json || "{}");
            const hours = Number(settings.sessionHours);
            if (Number.isFinite(hours) && hours > 0) return Math.min(168, Math.max(1, Math.floor(hours)));
        }
    } catch (_) { /* default */ }
    return 12;
}
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

// Grade canonical: SD/SMP/SMK (huruf besar). Seeds + frontend SMP memakai huruf besar.
const VALID_GRADES = ["SD", "SMP", "SMK"];
function normalizeGrade(g) { return sanitizeString(g, 16).toUpperCase(); }
function isValidGrade(g) { return VALID_GRADES.includes(g); }
// Pemotong string/array agar field opsional AI tidak bisa membengkakkan request.
function capStr(v, max) { return typeof v === "string" ? v.slice(0, max) : undefined; }
function capStrArray(a, maxItems, maxLen) {
    if (!Array.isArray(a)) return undefined;
    return a.slice(0, maxItems).map((x) => String(x).slice(0, maxLen));
}

// ============================================================
// RATE LIMITING (simple in-memory for AI Tutor)
// ============================================================

const aiRequestCounts = new Map();
const AI_TUTOR_MODULES = String(process.env.AI_TUTOR_ALLOWED_MODULES || "ai1,ai2,ai3,ai4")
    .split(",").map((x) => x.trim()).filter(Boolean);
// Tutor AI hanya untuk modul AI & Creative Tech SMP (ai1-ai4). SD/SMK/mode bebas ditolak.
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

const PROJECT_ROOT = path.join(__dirname, "..", "users"); // frontend siswa
const ADMIN_ROOT = path.join(__dirname, "..", "Admin");   // frontend admin
const INSTRUKTUR_ROOT = path.join(__dirname, "..", "Instruktur"); // frontend instruktur

// ============================================================
// MIDDLEWARE
// ============================================================

// FRONTEND_ORIGIN boleh berisi beberapa origin dipisah koma, mis.
// "https://app.example.com,https://admin.example.com".
const FRONTEND_ORIGINS = String(process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

if (FRONTEND_ORIGINS.length) {
    app.use(cors({ origin: FRONTEND_ORIGINS.length === 1 ? FRONTEND_ORIGINS[0] : FRONTEND_ORIGINS }));
} else if (process.env.NODE_ENV === "production") {
    // Gagal-tertutup: frontend produksi disajikan dari origin yang sama, jadi
    // tidak butuh CORS. Jangan pernah membuka "*" di production.
    console.warn("[WARN] FRONTEND_ORIGIN belum diset; CORS lintas-origin dimatikan (same-origin only).");
} else {
    app.use(cors());
}
// Kompresi response teks (HTML/CSS/JS/JSON) agar lebih cepat di jaringan lambat.
app.use(compression({ threshold: 1024 }));

// Respons API yang membawa token jangan disimpan di cache browser/proxy.
// Endpoint auth juga selalu no-store karena respons login/register memuat
// token tanpa header Authorization.
app.use("/api", (req, res, next) => {
    if (req.headers.authorization || req.path.startsWith("/auth/")) {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Pragma", "no-cache");
    }
    next();
});

app.use("/api/instruktur/profil", express.json({ limit: "4mb" }));
app.use(express.json({ limit: "1mb" }));

// Request ID + structured logging per request
app.use((req, res, next) => {
    req.id = require("crypto").randomUUID().slice(0, 8);
    res.setHeader("X-Request-ID", req.id);
    const start = Date.now();
    res.on("finish", () => {
        try {
            const ms = Date.now() - start;
            // Panggil lewat logger[level]: method pino tidak boleh dilepas dari objeknya
            // (tanpa `this` ia melempar TypeError yang lalu ditelan catch di bawah, sehingga
            // dulu tidak ada satu pun log request yang tertulis).
            const level = res.statusCode >= 400 ? "warn" : "info";
            const safePath = redactPathForLog(req.path);
            logger[level]({ reqId: req.id, method: req.method, path: safePath, status: res.statusCode, ms },
                `${req.method} ${safePath} ${res.statusCode} ${ms}ms`);
        } catch (e) {
            // Logger errors should never crash the request
        }
    });
    next();
});

// ============================================================
// RATE LIMITING (in-memory, sederhana) — auth endpoints
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 menit
const rateMap = new Map();

function rateKey(req, endpoint) {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    return endpoint + ":" + ip;
}

function checkRate(key, max) {
    const now = Date.now();
    const entry = rateMap.get(key);
    if (!entry || now - entry.first > RATE_WINDOW_MS) {
        rateMap.set(key, { count: 1, first: now });
        return { allowed: true, remaining: max - 1 };
    }
    if (entry.count >= max) {
        return { allowed: false, retryAfter: Math.ceil((RATE_WINDOW_MS - (now - entry.first)) / 1000) };
    }
    entry.count++;
    return { allowed: true, remaining: max - entry.count };
}

function rateLimitMiddleware(max) {
    return (req, res, next) => {
        const result = checkRate(rateKey(req, req.path), max);
        if (!result.allowed) {
            res.setHeader("Retry-After", String(result.retryAfter));
            return sendApiError(res, 429, "Terlalu banyak percobaan. Coba lagi beberapa saat lagi.", "RATE_LIMITED");
        }
        res.setHeader("X-RateLimit-Remaining", String(result.remaining));
        next();
    };
}

setInterval(() => {
    const now = Date.now();
    for (const [k, e] of rateMap) {
        if (now - e.first > RATE_WINDOW_MS) rateMap.delete(k);
    }
}, 5 * 60 * 1000).unref();

// ============================================================
// SECURITY HEADERS (dasar, tanpa dependensi tambahan)
app.use((req, res, next) => {
    const lowerPath = req.path.toLowerCase();
    const isAdminPage = lowerPath === "/admin" || lowerPath.startsWith("/admin/") ||
                        lowerPath === "/instruktur" || lowerPath.startsWith("/instruktur/");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");

    // HSTS hanya dikirim lewat HTTPS. Di balik proxy, trust proxy + header
    // X-Forwarded-Proto membuat req.secure bernilai true.
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    if (req.secure || forwardedProto === "https") {
        res.setHeader("Strict-Transport-Security", "max-age=31536000");
    }

    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://www.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com" +
        (isAdminPage ? " https://cdn.tailwindcss.com https://unpkg.com" : "") + "; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
        "img-src 'self' data: blob: https://cdn.jsdelivr.net; " +
        "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
        "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://dieng-cyber-coding.firebaseapp.com https://cdn.jsdelivr.net; " +
        "worker-src 'self' blob: https://cdn.jsdelivr.net; " +
        "child-src 'self' blob: https://cdn.jsdelivr.net; " +
        "frame-src 'self' https://dieng-cyber-coding.firebaseapp.com " + (process.env.PLUGIN_PUBLIC_ORIGIN || "https://plugins.domain.com") + ";"
    );
    next();
});

// ============================================================
// FRONTEND FILE SERVER
// ============================================================

app.use((req, res, next) => {
    // Bandingkan lowercase: di Windows filesystem tidak case-sensitive,
    // sehingga /Backend/... bisa membuka file yang sama dengan /backend/...
    const lower = req.path.toLowerCase();
    if (
        lower === "/backend" ||
        lower.startsWith("/backend/") ||
        lower.startsWith("/node_modules") ||
        lower === "/package.json" ||
        lower === "/package-lock.json" ||
        lower === "/.env" ||
        lower.startsWith("/.env.") ||
        lower === "/.git" ||
        lower.startsWith("/.git/") ||
        /\.sqlite(-shm|-wal)?$/.test(lower)
    ) {
        return res.status(404).send("Not Found");
    }
    next();
});

// Gambar/font tidak berubah tiap request: cache 1 jam, tapi HTML/CSS/JS tetap
// revalidasi supaya perubahan tampilan langsung terlihat.
const STATIC_CACHE_EXT = /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)$/i;
app.use(
    express.static(PROJECT_ROOT, {
        index: false,
        setHeaders(res, filePath) {
            if (STATIC_CACHE_EXT.test(filePath)) {
                res.setHeader("Cache-Control", "public, max-age=3600");
            }
        }
    })
);

// Halaman admin: http://localhost:3000/admin/
app.use("/admin", express.static(ADMIN_ROOT, { index: "index.html" }));

// Halaman instruktur: http://localhost:3000/instruktur/
app.use("/instruktur", express.static(INSTRUKTUR_ROOT, { index: "index.html" }));

// URL bersih antar-halaman admin (mis. /admin/finance-invoice) tetap membuka
// SPA Admin, termasuk saat halaman di-refresh. Hanya nama view yang dikenal;
// daftarnya di admin-views.js agar sinkron dengan VIEWS di kurikulum.js.
const ADMIN_VIEWS = new Set(require("./admin-views"));
app.get("/admin/:view", (req, res, next) => {
    if (ADMIN_VIEWS.has(req.params.view)) {
        return res.sendFile(path.join(ADMIN_ROOT, "index.html"));
    }
    next();
});

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
    let dbOk = false;
    try {
        db.prepare("SELECT 1 AS ok").get();
        dbOk = true;
    } catch (e) {
        dbOk = false;
    }
    sendApiSuccess(res, {
        status: dbOk ? "ok" : "degraded",
        info: dbOk ? "Backend Scratch Anin berjalan" : "Database tidak terjangkau",
        time: new Date().toISOString(),
        version: "1.0.0",
        database: dbOk ? "connected" : "disconnected"
    }, dbOk ? 200 : 503);
});

// ============================================================
// MATERIALS API
// ============================================================

// Ambil materi satu modul. Hanya materi berstatus 'terbit' yang dikirim
// ke portal murid; draft tetap tersimpan untuk Admin.
app.get("/api/materials/:grade/:moduleId", (req, res) => {
    try {
        const grade = normalizeGrade(req.params.grade);
        const moduleId = sanitizeString(req.params.moduleId, 64);

        if (!grade || !moduleId) {
            return sendApiError(res, 400, "grade dan moduleId wajib diisi", "VALIDATION_ERROR");
        }
        if (!isValidGrade(grade)) {
            return sendApiError(res, 400, "grade tidak valid (SD/SMP/SMK)", "VALIDATION_ERROR");
        }

        const materials = db.prepare(`
            SELECT id, grade, module_id, lesson_index, path, judul, status, created_at, updated_at
            FROM materials
            WHERE grade = ? AND module_id = ? AND status = 'terbit' AND path <> ''
            ORDER BY lesson_index ASC
        `).all(grade, moduleId);

        sendApiSuccess(res, { materials });
    } catch (error) {
        console.error("Gagal mengambil materi task:", error);
        sendApiError(res, 500, "Gagal mengambil data materi", "INTERNAL_ERROR");
    }
});

// GET ALL MATERIALS
// Default hanya materi terbit. Filter opsional ?grade=SD|SMP|SMK.
app.get("/api/materials", (req, res) => {
    try {
        const grade = req.query.grade ? normalizeGrade(req.query.grade) : null;
        if (grade && !isValidGrade(grade)) {
            return sendApiError(res, 400, "grade tidak valid (SD/SMP/SMK)", "VALIDATION_ERROR");
        }

        const conditions = ["status = 'terbit'", "path <> ''"];
        const params = [];
        if (grade) {
            conditions.push("grade = ?");
            params.push(grade);
        }

        const materials = db.prepare(`
            SELECT id, grade, module_id, lesson_index, path, judul, status, created_at, updated_at
            FROM materials
            WHERE ${conditions.join(" AND ")}
            ORDER BY grade ASC, module_id ASC, lesson_index ASC
        `).all(...params);

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
        const grade = normalizeGrade(req.params.grade);
        const moduleId = sanitizeString(req.params.moduleId, 64);

        if (!grade || !moduleId) {
            return sendApiError(res, 400, "grade dan moduleId wajib diisi", "VALIDATION_ERROR");
        }
        if (!isValidGrade(grade)) {
            return sendApiError(res, 400, "grade tidak valid (SD/SMP/SMK)", "VALIDATION_ERROR");
        }

        const rows = db.prepare(`
            SELECT id, grade, module_id, task_id, task_index, title, steps,
                   is_project, requires_submission, points, editor_url, created_at
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
                   is_project, requires_submission, points, editor_url, created_at
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
        const grade = normalizeGrade(req.params.grade);
        if (!grade) return sendApiError(res, 400, "grade wajib diisi", "VALIDATION_ERROR");
        if (!isValidGrade(grade)) return sendApiError(res, 400, "grade tidak valid (SD/SMP/SMK)", "VALIDATION_ERROR");

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

// Batas percobaan login per IP per 15 menit. Bisa dinaikkan lewat env untuk
// pengujian atau instansi dengan banyak pengguna di satu IP (mis. lab sekolah).
const LOGIN_RATE_LIMIT = Math.max(1, Number.parseInt(process.env.LOGIN_RATE_LIMIT || "10", 10) || 10);

app.post("/api/auth/login", rateLimitMiddleware(LOGIN_RATE_LIMIT), (req, res) => {
    const body = req.body || {};
    const emailInput = normalizeEmail(body.email);
    const usernameInput = sanitizeString(body.username, 32);
    const identifier = emailInput || usernameInput;
    const password = body.password;

    if (!identifier) {
        return sendApiError(res, 400, "Email atau username wajib diisi", "VALIDATION_ERROR");
    }
    if (usernameInput.length > 32) return sendApiError(res, 400, "Username maksimal 32 karakter", "VALIDATION_ERROR");
    if (emailInput && !isValidEmail(emailInput)) return sendApiError(res, 400, "Email tidak valid", "VALIDATION_ERROR");
    const minPassword = minPasswordFromSettings();
    if (typeof password !== "string" || password.length < minPassword) return sendApiError(res, 400, "Password minimal " + minPassword + " karakter", "VALIDATION_ERROR");

    const loginByEmail = Boolean(emailInput);
    const attemptKey = req.ip + "|" + (loginByEmail ? "email:" : "user:") + identifier.toLowerCase();

    if (auth.isBlocked(attemptKey)) {
        return sendApiError(res, 429, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.", "RATE_LIMITED");
    }

    const user = loginByEmail
        ? db.prepare(`
            SELECT id, username, email, password_hash, password_salt, firebase_uid, role, status, must_change_password
            FROM users
            WHERE email = ? COLLATE NOCASE
        `).get(identifier)
        : db.prepare(`
            SELECT id, username, email, password_hash, password_salt, firebase_uid, role, status, must_change_password
            FROM users
            WHERE username = ?
        `).get(identifier);

    let status = "login";

    if (!user) {
        auth.recordFail(attemptKey);
        return sendApiError(res, 401, "Email/username atau password salah", "INVALID_CREDENTIALS");
    }

    if (user.status === "suspended") {
        return sendApiError(res, 403, "Akun sedang ditangguhkan", "ACCOUNT_SUSPENDED");
    }
    if (user.status !== "active") {
        return sendApiError(res, 403, "Akun tidak aktif", "ACCOUNT_INACTIVE");
    }

    if (!user.password_hash) {
        // Akun Firebase (punya email/firebase_uid) tidak boleh "diklaim" lewat login biasa:
        // siapa pun yang tahu emailnya bisa membajak akun. Pemilik harus login Firebase dulu,
        // lalu mengatur password lewat POST /api/auth/change-password.
        if (user.email || user.firebase_uid) {
            auth.recordFail(attemptKey);
            return sendApiError(
                res,
                401,
                "Akun ini belum punya password. Login lewat Firebase dulu, lalu atur password.",
                "PASSWORD_NOT_SET"
            );
        }

        // Akun legacy (sebelum sistem password dibuat) boleh mengklaim password saat login pertama.
        const { salt, hash } = auth.hashPassword(password);
        db.prepare(`
            UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?
        `).run(hash, salt, user.id);
        status = "claimed";
    } else if (!auth.verifyPassword(password, user.password_salt, user.password_hash)) {
        auth.recordFail(attemptKey);
        return sendApiError(res, 401, "Email/username atau password salah", "INVALID_CREDENTIALS");
    }

    auth.clearFails(attemptKey);
    db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    const token = auth.createSession(user.id, {
        sessionHours: sessionHoursFromSettings(),
        userAgent: req.get("user-agent"),
        ip: req.ip
    });
    sendApiSuccess(res, {
        id: user.id,
        username: user.username,
        email: user.email || null,
        token,
        status,
        role: user.role || "student",
        accountStatus: user.status || "active",
        mustChangePassword: Boolean(user.must_change_password)
    }, "Login berhasil");
});

// ============================================================
// AUTH - FIREBASE LOGIN (Existing user)
// ============================================================

app.post("/api/auth/firebase-login", async (req, res) => {
    try {
        const rawToken = req.body ? req.body.idToken : undefined;
        const validation = validateRequired(req.body, ["idToken"]);
        if (validation) return sendApiError(res, 400, validation, "VALIDATION_ERROR");
        if (typeof rawToken !== "string" || !rawToken.trim()) return sendApiError(res, 400, "idToken wajib diisi", "VALIDATION_ERROR");
        if (rawToken.length > 8000) return sendApiError(res, 400, "idToken terlalu panjang", "VALIDATION_ERROR");
        const idToken = rawToken.trim();

        const firebaseUser = await auth.verifyFirebaseToken(idToken);
        const username = firebaseUser.username;

        // Pastikan user tersedia di SQLite
        if (firebaseUser.email) releaseDeletedEmail(db, firebaseUser.email);
        db.prepare(`
            INSERT INTO users (username, email, firebase_uid)
            VALUES (?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
                email = excluded.email,
                firebase_uid = excluded.firebase_uid
        `).run(username, firebaseUser.email, firebaseUser.uid);

        const user = db.prepare(`
            SELECT id, username, email, role, status, must_change_password FROM users WHERE username = ?
        `).get(username);
        if (!user) return sendApiError(res, 401, "User Firebase tidak ditemukan", "FIREBASE_AUTH_ERROR");
        if (user.status === "suspended") return sendApiError(res, 403, "Akun sedang ditangguhkan", "ACCOUNT_SUSPENDED");
        if (user.status !== "active") return sendApiError(res, 403, "Akun tidak aktif", "ACCOUNT_INACTIVE");

        db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

        const token = auth.createSession(user.id, {
            sessionHours: sessionHoursFromSettings(),
            userAgent: req.get("user-agent"),
            ip: req.ip
        });
        sendApiSuccess(res, {
            id: user.id,
            username: user.username,
            token,
            email: firebaseUser.email,
            role: user.role || "student",
            accountStatus: user.status || "active",
            mustChangePassword: Boolean(user.must_change_password)
        }, "Login Firebase berhasil");
    } catch (error) {
        console.error("Firebase login error:", error);
        sendApiError(res, 401, "Login Firebase gagal: " + error.message, "FIREBASE_AUTH_ERROR");
    }
});

// ============================================================
// AUTH - REGISTER (Username/Password - Legacy)
// ============================================================

app.post("/api/auth/register", rateLimitMiddleware(5), (req, res) => {
    const email = normalizeEmail(req.body && req.body.email);
    const usernameInput = sanitizeString(req.body && req.body.username, 32);
    const password = req.body && req.body.password;

    // Terima email (baru) atau username (legacy). Satu di antaranya wajib.
    if (!email && !usernameInput) {
        return sendApiError(res, 400, "Email atau username wajib diisi", "VALIDATION_ERROR");
    }
    if (typeof password !== "string" || password.length < minPasswordFromSettings()) return sendApiError(res, 400, "Password minimal " + minPasswordFromSettings() + " karakter", "VALIDATION_ERROR");

    let username = usernameInput;
    let finalEmail = email || null;

    if (email) {
        if (!isValidEmail(email)) {
            return sendApiError(res, 400, "Email tidak valid", "VALIDATION_ERROR");
        }
        // Email akun yang sudah dihapus (soft delete) dilepas agar bisa daftar lagi.
        releaseDeletedEmail(db, email);
        // Cek apakah email sudah terdaftar (case-insensitive).
        const existingEmail = db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").get(email);
        if (existingEmail) {
            return sendApiError(res, 409, "Email sudah terdaftar", "EMAIL_EXISTS");
        }
        // Generate username dari email kalau username tidak dikirim
        if (!usernameInput) {
            let baseUsername = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 28);
            if (!baseUsername) baseUsername = "user";
            username = baseUsername;
            let counter = 1;
            while (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
                username = baseUsername.slice(0, 30 - String(counter).length) + counter;
                counter++;
            }
        } else {
            // Username dikirim + email dikirim: cek username tidak bentrok
            const existingUser = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
            if (existingUser) {
                return sendApiError(res, 409, "Username sudah terdaftar", "USERNAME_EXISTS");
            }
        }
    } else {
        // Hanya username (legacy mode): cek username tidak bentrok
        const existingUser = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
        if (existingUser) {
            return sendApiError(res, 409, "Username sudah terdaftar", "USERNAME_EXISTS");
        }
    }

    // Buat user baru
    const { salt, hash } = auth.hashPassword(password);
    let userId;
    try {
        const info = db.prepare(`
            INSERT INTO users (username, email, password_hash, password_salt)
            VALUES (?, ?, ?, ?)
        `).run(username, finalEmail, hash, salt);
        userId = Number(info.lastInsertRowid);
    } catch (error) {
        // Jaga-jaga kalau ada request bersamaan yang lolos cek duplikat.
        if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) {
            const code = /email/i.test(error.message) ? "EMAIL_EXISTS" : "USERNAME_EXISTS";
            return sendApiError(res, 409, code === "EMAIL_EXISTS" ? "Email sudah terdaftar" : "Username sudah terdaftar", code);
        }
        throw error;
    }

    db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId);
    const token = auth.createSession(userId, {
        sessionHours: sessionHoursFromSettings(),
        userAgent: req.get("user-agent"),
        ip: req.ip
    });
    sendApiSuccess(res, { id: userId, username, token, email: finalEmail, role: "student", accountStatus: "active" }, "Registrasi berhasil", 201);
});

// ============================================================
// AUTH - REGISTER FIREBASE (New user via Firebase)
// ============================================================

app.post("/api/auth/firebase-register", async (req, res) => {
    try {
        const rawToken = req.body ? req.body.idToken : undefined;
        const validation = validateRequired(req.body, ["idToken"]);
        if (validation) return sendApiError(res, 400, validation, "VALIDATION_ERROR");
        if (typeof rawToken !== "string" || !rawToken.trim()) return sendApiError(res, 400, "idToken wajib diisi", "VALIDATION_ERROR");
        if (rawToken.length > 8000) return sendApiError(res, 400, "idToken terlalu panjang", "VALIDATION_ERROR");
        const idToken = rawToken.trim();

        const firebaseUser = await auth.verifyFirebaseToken(idToken);
        const username = firebaseUser.username;

        // Cek apakah username sudah ada
        const existing = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
        if (existing) {
            return sendApiError(res, 409, "Akun ini sudah terdaftar. Silakan login.", "USERNAME_EXISTS");
        }

        // Buat user baru dengan Firebase UID
        // Email akun lokal yang sudah dihapus dilepas agar tidak bentrok unique index.
        if (firebaseUser.email) releaseDeletedEmail(db, firebaseUser.email);
        const info = db.prepare(`
            INSERT INTO users (username, email, firebase_uid)
            VALUES (?, ?, ?)
        `).run(username, firebaseUser.email, firebaseUser.uid);
        const userId = Number(info.lastInsertRowid);

        db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId);
        const token = auth.createSession(userId, {
            sessionHours: sessionHoursFromSettings(),
            userAgent: req.get("user-agent"),
            ip: req.ip
        });
        sendApiSuccess(res, {
            id: userId,
            username,
            token,
            email: firebaseUser.email,
            role: "student",
            accountStatus: "active"
        }, "Registrasi Firebase berhasil", 201);
    } catch (error) {
        console.error("Firebase register error:", error);
        sendApiError(res, 401, "Registrasi Firebase gagal: " + error.message, "FIREBASE_AUTH_ERROR");
    }
});

// ============================================================
// AUTH - ME / LOGOUT
// ============================================================

app.get("/api/auth/me", auth.requireAuth, (req, res) => {
    const user = db.prepare(`
        SELECT id, username, email, full_name, password_hash, role, status,
               must_change_password, last_login_at
        FROM users WHERE id = ?
    `).get(req.userId);

    if (!user) return sendApiError(res, 404, "User tidak ditemukan", "NOT_FOUND");

    sendApiSuccess(res, {
        id: user.id,
        username: user.username,
        email: user.email || null,
        fullName: user.full_name || null,
        role: user.role || "student",
        status: user.status || "active",
        mustChangePassword: Boolean(user.must_change_password),
        lastLoginAt: user.last_login_at || null,
        hasPassword: Boolean(user.password_hash)
    });
});

app.post("/api/auth/logout", auth.requireAuth, (req, res) => {
    auth.deleteSession(req.token);
    sendApiSuccess(res, {}, "Logout berhasil");
});

// ------------------------------------------------------------
// SESI AKTIF
// Pengguna bisa melihat perangkat yang sedang login dan mencabut yang tidak
// dikenal. Kunci sesi hanya 16 karakter pertama hash token, bukan tokennya.
// ------------------------------------------------------------
app.get("/api/auth/sessions", auth.requireAuth, (req, res) => {
    sendApiSuccess(res, { sessions: auth.listSessions(req.userId, req.token) });
});

app.post("/api/auth/sessions/revoke-others", auth.requireAuth, rateLimitMiddleware(30), (req, res) => {
    const revoked = auth.deleteOtherSessions(req.userId, req.token);
    sendApiSuccess(res, { revoked }, "Sesi di perangkat lain dicabut.");
});

app.delete("/api/auth/sessions/:key", auth.requireAuth, rateLimitMiddleware(30), (req, res) => {
    const key = String(req.params.key || "").trim().toLowerCase();
    if (auth.sessionKey(req.token) === key) {
        return sendApiError(res, 409, "Sesi yang sedang dipakai tidak bisa dicabut dari sini. Gunakan logout.", "CANNOT_REVOKE_CURRENT");
    }
    const revoked = auth.revokeSession(req.userId, key);
    if (!revoked) return sendApiError(res, 404, "Sesi tidak ditemukan.", "NOT_FOUND");
    sendApiSuccess(res, { key }, "Sesi dicabut.");
});

app.post("/api/auth/logout-all", auth.requireAuth, (req, res) => {
    const revoked = auth.deleteAllSessions(req.userId);
    sendApiSuccess(res, { revoked }, "Semua sesi dicabut. Silakan login lagi.");
});

// ============================================================
// AUTH - CHANGE PASSWORD
// ============================================================
// Pengganti "reset password" ala Firebase: user yang sudah login bisa
// mengatur/mengganti password DB-nya tanpa perlu email service.
app.post("/api/auth/change-password", auth.requireAuth, rateLimitMiddleware(10), (req, res) => {
    const body = req.body || {};
    const currentPassword = body.currentPassword;
    const newPassword = body.newPassword;

    const minPassword = minPasswordFromSettings();
    if (typeof newPassword !== "string" || newPassword.length < minPassword) {
        return sendApiError(res, 400, "Password baru minimal " + minPassword + " karakter", "VALIDATION_ERROR");
    }
    if (newPassword.length > 128) {
        return sendApiError(res, 400, "Password baru maksimal 128 karakter", "VALIDATION_ERROR");
    }

    const user = db.prepare(`
        SELECT password_hash, password_salt FROM users WHERE id = ?
    `).get(req.userId);
    if (!user) return sendApiError(res, 404, "User tidak ditemukan", "NOT_FOUND");

    const pwKey = req.ip + "|pw:" + req.user;
    if (auth.isBlocked(pwKey)) {
        return sendApiError(res, 429, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.", "RATE_LIMITED");
    }

    // Kalau sudah punya password, wajib verifikasi password lama.
    if (user.password_hash) {
        if (typeof currentPassword !== "string" || !auth.verifyPassword(currentPassword, user.password_salt, user.password_hash)) {
            auth.recordFail(pwKey);
            return sendApiError(res, 401, "Password saat ini salah", "INVALID_CREDENTIALS");
        }
    }

    auth.clearFails(pwKey);

    const { salt, hash } = auth.hashPassword(newPassword);
    db.prepare(`
        UPDATE users
        SET password_hash = ?, password_salt = ?, must_change_password = 0
        WHERE id = ?
    `).run(hash, salt, req.userId);

    // Sesi di perangkat lain dicabut; sesi yang sedang dipakai tetap hidup.
    auth.deleteOtherSessions(req.userId, req.token);

    sendApiSuccess(res, { id: req.userId, username: req.user }, "Password berhasil diubah");
});

// ============================================================
// USER PROFILE API
// ============================================================

app.get("/api/profile", auth.requireAuth, (req, res) => {
    try {
        const user = db.prepare(`
            SELECT username, email, full_name, bio, avatar_url, equipped_frame, equipped_title, firebase_uid, created_at
            FROM users WHERE id = ?
        `).get(req.userId);
        if (!user) return sendApiError(res, 404, "User tidak ditemukan", "NOT_FOUND");
        sendApiSuccess(res, {
            profile: {
                username: user.username,
                email: user.email,
                fullName: user.full_name,
                bio: user.bio,
                avatarUrl: user.avatar_url,
                equippedFrame: user.equipped_frame,
                equippedTitle: user.equipped_title,
                firebaseUid: user.firebase_uid,
                createdAt: user.created_at,
                subscription: req.role === "student"
                    ? subscriptionService.subscriptionState(db, req.userId)
                    : null,
            }
        });
    } catch (error) {
        console.error("Gagal mengambil profil:", error);
        sendApiError(res, 500, "Gagal mengambil profil", "INTERNAL_ERROR");
    }
});

app.put("/api/profile", auth.requireAuth, (req, res) => {
    try {
        const body = req.body || {};
        const fullName = typeof body.fullName === "string" ? body.fullName.slice(0, 100).trim() : undefined;
        // Email kosong diabaikan (tidak menghapus email lama).
        const email = typeof body.email === "string" && body.email.trim() ? normalizeEmail(body.email) : undefined;
        const bio = typeof body.bio === "string" ? body.bio.slice(0, 1000).trim() : undefined;
        const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.slice(0, 500000) : undefined;
        const avatar = typeof body.avatar === "string" ? body.avatar.slice(0, 500000) : undefined;

        if (email !== undefined && !isValidEmail(email)) {
            return sendApiError(res, 400, "Email tidak valid", "VALIDATION_ERROR");
        }

        if (email !== undefined) {
            // Email akun terhapus dilepas agar bisa dipakai profil baru.
            releaseDeletedEmail(db, email);
            const taken = db.prepare(`
                SELECT 1 FROM users
                WHERE email = ? COLLATE NOCASE AND id <> ?
            `).get(email, req.userId);
            if (taken) {
                return sendApiError(res, 409, "Email sudah dipakai akun lain", "EMAIL_EXISTS");
            }
        }

        db.prepare(`
            UPDATE users
            SET full_name = COALESCE(?, full_name),
                email = COALESCE(?, email),
                bio = COALESCE(?, bio),
                avatar_url = COALESCE(?, avatar_url, ?)
            WHERE id = ?
        `).run(fullName, email, bio, avatarUrl, avatar, req.userId);

        const updated = db.prepare(`
            SELECT username, email, full_name, bio, avatar_url, equipped_frame, equipped_title, firebase_uid, created_at
            FROM users WHERE id = ?
        `).get(req.userId);

        sendApiSuccess(res, {
            profile: {
                username: updated.username,
                email: updated.email,
                fullName: updated.full_name,
                bio: updated.bio,
                avatarUrl: updated.avatar_url,
                equippedFrame: updated.equipped_frame,
                equippedTitle: updated.equipped_title,
                firebaseUid: updated.firebase_uid,
                createdAt: updated.created_at,
                subscription: req.role === "student"
                    ? subscriptionService.subscriptionState(db, req.userId)
                    : null,
            }
        }, "Profil diperbarui");
    } catch (error) {
        console.error("Gagal menyimpan profil:", error);
        sendApiError(res, 500, "Gagal menyimpan profil", "INTERNAL_ERROR");
    }
});

// ============================================================
// ALLOWED GRADES PER USER (for dashboard grade tabs)
// ============================================================

app.get("/api/user/allowed-grades", auth.requireAuth, (req, res) => {
    try {
        const row = db.prepare("SELECT allowed_grades FROM users WHERE id = ?").get(req.userId);
        if (!row) return sendApiError(res, 404, "User tidak ditemukan", "NOT_FOUND");
        let grades = ["SD", "SMP", "SMK"];
        if (row.allowed_grades) {
            try {
                const parsed = JSON.parse(row.allowed_grades);
                if (Array.isArray(parsed) && parsed.length) {
                    const valid = parsed.filter((g) => ["SD", "SMP", "SMK"].includes(String(g)));
                    if (valid.length) grades = valid;
                }
            } catch (e) {
                // ignore parse error, fallback ke default
            }
        }
        sendApiSuccess(res, { grades });
    } catch (error) {
        console.error("Gagal mengambil allowed-grades:", error);
        sendApiError(res, 500, "Gagal mengambil allowed-grades", "INTERNAL_ERROR");
    }
});

app.put("/api/user/allowed-grades", auth.requireAuth, (req, res) => {
    try {
        const { grades } = req.body || {};
        if (!Array.isArray(grades) || grades.length === 0) {
            return sendApiError(res, 400, "grades harus berupa array non-kosong", "VALIDATION_ERROR");
        }
        const valid = grades.filter((g) => ["SD", "SMP", "SMK"].includes(String(g)));
        if (valid.length !== grades.length) {
            return sendApiError(res, 400, "Grade tidak valid (boleh SD, SMP, SMK)", "VALIDATION_ERROR");
        }
        db.prepare("UPDATE users SET allowed_grades = ? WHERE id = ?").run(JSON.stringify(valid), req.userId);
        sendApiSuccess(res, { grades: valid }, "Allowed grades diperbarui");
    } catch (error) {
        console.error("Gagal menyimpan allowed-grades:", error);
        sendApiError(res, 500, "Gagal menyimpan allowed-grades", "INTERNAL_ERROR");
    }
});

// ============================================================
// TOKO HADIAH — KOIN BELAJAR (bingkai avatar & gelar)
// ============================================================
// Katalog awal diisi dari `shop-catalog.js`; setelah itu tabel `shop_rewards`
// menjadi sumber data sehingga perubahan di menu Lencana & Hadiah dipakai
// server saat memvalidasi pembelian.
shop.seedItems(db);

// Model saldo sama dengan frontend (LP.saldo):
//   saldo = max(0, total koin - harga item yang sudah dibeli)
// `points.total` TIDAK dikurangi saat belanja supaya level & riwayat tetap utuh.
// Harga disimpan sebagai snapshot di user_items saat pembelian.

function getShopState(userId) {
    const pointsRow = db.prepare("SELECT total FROM points WHERE user_id = ?").get(userId);
    const earned = pointsRow ? Number(pointsRow.total) || 0 : 0;
    const ownedRows = db.prepare(`
        SELECT item_id, harga FROM user_items WHERE user_id = ? ORDER BY id ASC
    `).all(userId);
    const owned = ownedRows.map((row) => row.item_id);
    const spent = ownedRows.reduce((sum, row) => sum + (Number(row.harga) || 0), 0);
    const user = db.prepare("SELECT equipped_frame, equipped_title FROM users WHERE id = ?").get(userId);
    return {
        owned,
        equipped: {
            bingkai: (user && user.equipped_frame) || null,
            gelar: (user && user.equipped_title) || null
        },
        earned,
        spent,
        balance: Math.max(0, earned - spent)
    };
}

function shopColumnFor(jenis) {
    return jenis === "bingkai" ? "equipped_frame" : "equipped_title";
}

// Katalog item (id, jenis, nama, harga, frameClass, desc, orn).
// Frontend boleh memakai ini sebagai pengganti LP.HADIAH yang di-hardcode.
app.get("/api/shop/items", auth.requireAuth, (req, res) => {
    sendApiSuccess(res, { items: shop.listItems(db) });
});

// Status toko user: katalog + item dimiliki + yang dipakai + saldo koin.
app.get("/api/shop", auth.requireAuth, (req, res) => {
    try {
        sendApiSuccess(res, {
            items: shop.listItems(db),
            ...getShopState(req.userId)
        });
    } catch (error) {
        console.error("Gagal mengambil data toko:", error);
        sendApiError(res, 500, "Gagal mengambil data toko", "INTERNAL_ERROR");
    }
});

app.post("/api/shop/buy", auth.requireAuth, rateLimitMiddleware(30), (req, res) => {
    try {
        const itemId = sanitizeString(req.body && req.body.itemId, 64);
        if (!itemId) return sendApiError(res, 400, "itemId wajib diisi", "VALIDATION_ERROR");

        const item = shop.findItem(db, itemId);
        if (!item) return sendApiError(res, 404, "Hadiah tidak ditemukan", "ITEM_NOT_FOUND");

        // Transaksi: cek kepemilikan + saldo + catat pembelian + pasang item.
        const result = db.transaction(() => {
            const owned = db.prepare(`
                SELECT 1 FROM user_items WHERE user_id = ? AND item_id = ?
            `).get(req.userId, item.id);
            if (owned) {
                return { error: { status: 409, code: "ALREADY_OWNED", message: "Hadiah ini sudah kamu punya." } };
            }

            const state = getShopState(req.userId);
            if (state.balance < item.harga) {
                return {
                    error: {
                        status: 400,
                        code: "INSUFFICIENT_COINS",
                        message: `Koin belajar belum cukup. Butuh ${item.harga}, saldo kamu ${state.balance}.`
                    }
                };
            }

            db.prepare(`
                INSERT INTO user_items (user_id, item_id, jenis, harga)
                VALUES (?, ?, ?, ?)
            `).run(req.userId, item.id, item.jenis, item.harga);

            // Sama seperti frontend: item yang dibeli langsung dipasang.
            db.prepare(`
                UPDATE users SET ${shopColumnFor(item.jenis)} = ? WHERE id = ?
            `).run(item.id, req.userId);

            return { state: getShopState(req.userId) };
        })();

        if (result.error) {
            return sendApiError(res, result.error.status, result.error.message, result.error.code);
        }
        sendApiSuccess(res, result.state, "Hadiah berhasil dibeli");
    } catch (error) {
        console.error("Gagal membeli hadiah:", error);
        sendApiError(res, 500, "Gagal membeli hadiah", "INTERNAL_ERROR");
    }
});

app.post("/api/shop/equip", auth.requireAuth, (req, res) => {
    try {
        const itemId = sanitizeString(req.body && req.body.itemId, 64);
        if (!itemId) return sendApiError(res, 400, "itemId wajib diisi", "VALIDATION_ERROR");

        const item = shop.findItem(db, itemId);
        if (!item) return sendApiError(res, 404, "Hadiah tidak ditemukan", "ITEM_NOT_FOUND");

        const owned = db.prepare(`
            SELECT 1 FROM user_items WHERE user_id = ? AND item_id = ?
        `).get(req.userId, item.id);
        if (!owned) return sendApiError(res, 400, "Kamu belum memiliki hadiah ini", "NOT_OWNED");

        db.prepare(`
            UPDATE users SET ${shopColumnFor(item.jenis)} = ? WHERE id = ?
        `).run(item.id, req.userId);

        sendApiSuccess(res, { equipped: getShopState(req.userId).equipped }, "Hadiah dipasang");
    } catch (error) {
        console.error("Gagal memasang hadiah:", error);
        sendApiError(res, 500, "Gagal memasang hadiah", "INTERNAL_ERROR");
    }
});

app.post("/api/shop/unequip", auth.requireAuth, (req, res) => {
    try {
        const jenis = sanitizeString(req.body && req.body.jenis, 16);
        if (!shop.SHOP_TYPES.includes(jenis)) {
            return sendApiError(res, 400, "jenis harus 'bingkai' atau 'gelar'", "VALIDATION_ERROR");
        }

        db.prepare(`
            UPDATE users SET ${shopColumnFor(jenis)} = NULL WHERE id = ?
        `).run(req.userId);

        sendApiSuccess(res, { equipped: getShopState(req.userId).equipped }, "Hadiah dilepas");
    } catch (error) {
        console.error("Gagal melepas hadiah:", error);
        sendApiError(res, 500, "Gagal melepas hadiah", "INTERNAL_ERROR");
    }
});

// ============================================================
// DEVELOPMENT PROGRESS (untuk testing tanpa auth)
// ============================================================

const DEV_USERNAME = "dev";

if (process.env.NODE_ENV !== "production") {
    db.prepare(`
        INSERT INTO users (username) VALUES (?) ON CONFLICT(username) DO NOTHING
    `).run(DEV_USERNAME);
}

function getDevUserId() { const row = db.prepare("SELECT id FROM users WHERE username = ?").get(DEV_USERNAME); return row ? row.id : null; }

app.get("/api/dev/progress", requireDevelopmentMode, (req, res) => {
    try {
        const progress = db.prepare(`
            SELECT task_id, completed, completed_at, bonus_awarded
                FROM progress WHERE user_id = ? ORDER BY id ASC
            `).all(getDevUserId());
        sendApiSuccess(res, { username: DEV_USERNAME, progress });
    } catch (error) {
        console.error("Gagal mengambil progress dev:", error);
        sendApiError(res, 500, "Gagal mengambil progress", "INTERNAL_ERROR");
    }
});

app.post("/api/dev/progress", requireDevelopmentMode, (req, res) => {
    try {
        const body = req.body || {};
        const taskId = normalizeTaskId(body.taskId);
        const { completed } = body;
        if (!taskId) return sendApiError(res, 400, "taskId wajib berupa teks (maksimal 128 karakter)", "VALIDATION_ERROR");
        if (typeof completed !== "boolean") return sendApiError(res, 400, "completed harus true/false", "VALIDATION_ERROR");

        const taskExists = db.prepare("SELECT 1 FROM tasks WHERE task_id = ?").get(taskId);
        if (!taskExists) return sendApiError(res, 404, "Task tidak ditemukan", "NOT_FOUND");

        const devResult = applyProgress(getDevUserId(), taskId, completed);
        if (devResult.error) return sendApiError(res, 404, "Task tidak ditemukan", "NOT_FOUND");
        sendApiSuccess(res, { username: DEV_USERNAME, taskId, completed, points: devResult.points, earned: devResult.earned }, "Progress disimpan");
    } catch (error) {
        console.error("Gagal menyimpan progress dev:", error);
        sendApiError(res, 500, "Gagal menyimpan progress", "INTERNAL_ERROR");
    }
});

app.get("/api/dev/points", requireDevelopmentMode, (req, res) => {
    try {
        const row = db.prepare("SELECT total FROM points WHERE user_id = ?").get(getDevUserId());
        sendApiSuccess(res, { username: DEV_USERNAME, total: row ? row.total : 0 });
    } catch (error) {
        console.error("Gagal mengambil points dev:", error);
        sendApiError(res, 500, "Gagal mengambil points", "INTERNAL_ERROR");
    }
});

app.post("/api/dev/points", requireDevelopmentMode, (req, res) => {
    try {
        const total = req.body?.total;
        if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
            return sendApiError(res, 400, "total points harus bilangan bulat non-negatif", "VALIDATION_ERROR");
        }
        db.prepare(`
            INSERT INTO points (user_id, total, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET total = excluded.total, updated_at = CURRENT_TIMESTAMP
        `).run(getDevUserId(), total);
        sendApiSuccess(res, { username: DEV_USERNAME, total }, "Points disimpan");
    } catch (error) {
        console.error("Gagal menyimpan points dev:", error);
        sendApiError(res, 500, "Gagal menyimpan points", "INTERNAL_ERROR");
    }
});

// ============================================================
// GET PROGRESS (Per User - Auth Required)
// ============================================================

app.get("/api/progress/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    try {
        const username = String(req.params.username || "").trim();
        if (!username) return sendApiError(res, 400, "Username wajib diisi", "VALIDATION_ERROR");
        const fGrade = req.query.grade ? normalizeGrade(req.query.grade) : null;
        const fModule = req.query.module ? sanitizeString(req.query.module, 64) : null;
        if (fGrade && !isValidGrade(fGrade)) return sendApiError(res, 400, "grade tidak valid (SD/SMP/SMK)", "VALIDATION_ERROR");
        let progress;
        if (fGrade || fModule) {
            progress = db.prepare(`
                SELECT p.task_id, p.completed, p.completed_at, p.bonus_awarded
                FROM progress p JOIN tasks t ON t.task_id = p.task_id
                WHERE p.user_id = ?
                  AND (? IS NULL OR t.grade = ?)
                  AND (? IS NULL OR t.module_id = ?)
                ORDER BY p.id ASC
            `).all(req.userId, fGrade, fGrade, fModule, fModule);
        } else {
            progress = db.prepare(`
                SELECT task_id, completed, completed_at, bonus_awarded
                FROM progress WHERE user_id = ? ORDER BY id ASC
            `).all(req.userId);
        }
        sendApiSuccess(res, { progress });
    } catch (error) {
        console.error("Gagal mengambil progress:", error);
        sendApiError(res, 500, "Gagal mengambil progress", "INTERNAL_ERROR");
    }
});

// ============================================================
// Progress dan points dikelola satu service agar transaksi user biasa dan user dev
// memakai aturan yang sama. Points dihitung ulang dari progress aktif + bonus.
function applyProgress(userId, taskId, completed) {
    return learningService.applyProgress(db, userId, taskId, completed);
}

// SAVE PROGRESS (Per User - Auth Required)
// ============================================================

app.post("/api/progress/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    try {
        const username = String(req.params.username || "").trim();
        const body = req.body || {};
        const taskId = normalizeTaskId(body.taskId);
        const { completed } = body;
        if (!username) return sendApiError(res, 400, "Username wajib diisi", "VALIDATION_ERROR");
        if (!taskId) return sendApiError(res, 400, "taskId wajib berupa teks (maksimal 128 karakter)", "VALIDATION_ERROR");
        if (typeof completed !== "boolean") return sendApiError(res, 400, "completed harus true/false", "VALIDATION_ERROR");
        const result = applyProgress(req.userId, taskId, completed);
        if (result.error) return sendApiError(res, 404, "Task tidak ditemukan", "NOT_FOUND");
        if (completed && result.earned && result.earned.base > 0) {
            const student = db.prepare("SELECT username, full_name FROM users WHERE id = ?").get(req.userId);
            const task = db.prepare("SELECT title FROM tasks WHERE task_id = ?").get(taskId);
            if (student && task) {
                const points = result.earned.base + result.earned.bonus;
                notifyAdmins(db, {
                    kind: "progress.complete",
                    title: `${student.full_name || student.username} menyelesaikan task`,
                    body: `${task.title} · +${points} poin`,
                    view: "dashboard",
                    icon: "fa-solid fa-circle-check",
                    tone: "emerald",
                    dedupeKey: `progress.complete:${req.userId}:${taskId}`
                });
            }
        }
        sendApiSuccess(res, { username, taskId, completed, points: result.points, earned: result.earned, reconciledDifference: result.reconciledDifference }, "Progress berhasil disimpan");
    } catch (error) {
        console.error("Gagal menyimpan progress:", error);
        sendApiError(res, 500, "Gagal menyimpan progress", "INTERNAL_ERROR");
    }
});

// ============================================================
// ============================================================
// RECORD ATTEMPT (gagal cek misi → sumber bonus percobaan pertama)
// ============================================================

app.post("/api/attempts/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    try {
        const username = String(req.params.username || "").trim();
        const body = req.body || {};
        const taskId = normalizeTaskId(body.taskId);
        const timeSpent = body.timeSpent;
        if (!username) return sendApiError(res, 400, "Username wajib diisi", "VALIDATION_ERROR");
        if (!taskId) return sendApiError(res, 400, "taskId wajib berupa teks (maksimal 128 karakter)", "VALIDATION_ERROR");
        if (timeSpent !== undefined && (!Number.isSafeInteger(timeSpent) || timeSpent < 0 || timeSpent > 86400)) {
            return sendApiError(res, 400, "timeSpent harus bilangan bulat 0-86400 detik", "VALIDATION_ERROR");
        }
        const taskExists = db.prepare("SELECT 1 FROM tasks WHERE task_id = ?").get(taskId);
        if (!taskExists) return sendApiError(res, 404, "Task tidak ditemukan", "NOT_FOUND");
        const ts = timeSpent === undefined ? 0 : timeSpent;
        const rec = db.transaction(() => {
            db.prepare(`INSERT INTO attempts (user_id, task_id, fails, time_spent, updated_at) VALUES (?, ?, 0, 0, CURRENT_TIMESTAMP) ON CONFLICT(user_id, task_id) DO NOTHING`).run(req.userId, taskId);
            db.prepare(`UPDATE attempts SET fails = fails + 1, time_spent = time_spent + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND task_id = ?`).run(ts, req.userId, taskId);
            return db.prepare("SELECT fails, time_spent FROM attempts WHERE user_id = ? AND task_id = ?").get(req.userId, taskId);
        })();
        sendApiSuccess(res, { username, taskId: taskId, fails: rec.fails, timeSpent: rec.time_spent }, "Percobaan dicatat");
    } catch (error) {
        console.error("Gagal mencatat attempt:", error);
        sendApiError(res, 500, "Gagal mencatat attempt", "INTERNAL_ERROR");
    }
});

// GET ATTEMPTS (baca jumlah gagal dan waktu per task)
app.get("/api/attempts/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    try {
        const username = String(req.params.username || "").trim();
        if (!username) return sendApiError(res, 400, "Username wajib diisi", "VALIDATION_ERROR");
        const rows = db.prepare(`
            SELECT task_id, fails, time_spent, updated_at
            FROM attempts WHERE user_id = ?
            ORDER BY updated_at DESC
        `).all(req.userId);
        sendApiSuccess(res, { username, attempts: rows }, "Daftar percobaan");
    } catch (error) {
        console.error("Gagal mengambil attempts:", error);
        sendApiError(res, 500, "Gagal mengambil attempts", "INTERNAL_ERROR");
    }
});

app.post("/api/dev/attempts", requireDevelopmentMode, (req, res) => {
    try {
        const body = req.body || {};
        const taskId = normalizeTaskId(body.taskId);
        const timeSpent = body.timeSpent;
        if (!taskId) return sendApiError(res, 400, "taskId wajib berupa teks (maksimal 128 karakter)", "VALIDATION_ERROR");
        if (timeSpent !== undefined && (!Number.isSafeInteger(timeSpent) || timeSpent < 0 || timeSpent > 86400)) {
            return sendApiError(res, 400, "timeSpent harus bilangan bulat 0-86400 detik", "VALIDATION_ERROR");
        }
        const taskExists = db.prepare("SELECT 1 FROM tasks WHERE task_id = ?").get(taskId);
        if (!taskExists) return sendApiError(res, 404, "Task tidak ditemukan", "NOT_FOUND");
        const ts = timeSpent === undefined ? 0 : timeSpent;
        const rec = db.transaction(() => {
            db.prepare(`INSERT INTO attempts (user_id, task_id, fails, time_spent, updated_at) VALUES (?, ?, 0, 0, CURRENT_TIMESTAMP) ON CONFLICT(user_id, task_id) DO NOTHING`).run(getDevUserId(), taskId);
            db.prepare(`UPDATE attempts SET fails = fails + 1, time_spent = time_spent + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND task_id = ?`).run(ts, getDevUserId(), taskId);
            return db.prepare("SELECT fails, time_spent FROM attempts WHERE user_id = ? AND task_id = ?").get(getDevUserId(), taskId);
        })();
        sendApiSuccess(res, { username: DEV_USERNAME, taskId: taskId, fails: rec.fails, timeSpent: rec.time_spent }, "Percobaan dicatat");
    } catch (error) {
        console.error("Gagal mencatat attempt dev:", error);
        sendApiError(res, 500, "Gagal mencatat attempt", "INTERNAL_ERROR");
    }
});

// GET POINTS (Per User - Auth Required)
// ============================================================

app.get("/api/points/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    try {
        const username = String(req.params.username || "").trim();
        if (!username) return sendApiError(res, 400, "Username wajib diisi", "VALIDATION_ERROR");
        const state = getShopState(req.userId);
        sendApiSuccess(res, {
            username,
            total: state.earned,
            earned: state.earned,
            spent: state.spent,
            balance: state.balance
        });
    } catch (error) {
        console.error("Gagal mengambil points:", error);
        sendApiError(res, 500, "Gagal mengambil points", "INTERNAL_ERROR");
    }
});

// ============================================================
// SAVE POINTS (Per User - Auth Required)
// ============================================================

app.post("/api/points/:username", auth.requireAuth, auth.requireSameUser, (req, res) => {
    // Fase 2: total koin dihitung server dari task selesai (adjustPointsForProgress).
    // Tulis manual dimatikan; testing pakai POST /api/dev/points (non-production).
    return sendApiError(res, 410, "Total koin dihitung server dari task selesai. Gunakan POST /api/progress.", "GONE");
});

// ============================================================
// AI TUTOR (With Rate Limit & Auth)
// ============================================================

app.post("/api/ai/tutor", auth.requireAuth, async (req, res) => {
    try {
        // Gerbang modul: hanya nodeId SMP yang butuh AI (default ai1-ai4).
        const smpNode = req.body && req.body.smpTask ? req.body.smpTask.nodeId : undefined;
        if (!smpNode || !AI_TUTOR_MODULES.includes(String(smpNode))) {
            return sendApiError(res, 403, "Tutor AI hanya tersedia di modul AI & Creative Tech (Prompt Engineering, Web via AI, Tools AI, Aset Kreatif).", "TUTOR_NOT_ALLOWED");
        }

        // Rate limiting by IP
        if (!checkAiRateLimit(req.ip)) {
            return sendApiError(res, 429, "Terlalu banyak permintaan ke AI. Tunggu sebentar.", "RATE_LIMITED");
        }

        const body = req.body || {};
        const {
            message,
            taskId, taskTitle, taskDescription, taskSteps, taskMaterial, taskHint,
            editorHtml, editorCss, editorLanguage, editorCode,
            smpTask,
        } = body;

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

        let cleanSmpTask = null;
        if (smpTask && typeof smpTask === "object") {
            cleanSmpTask = {
                nodeId: capStr(smpTask.nodeId, 64),
                taskIndex: Number.isSafeInteger(smpTask.taskIndex) ? smpTask.taskIndex : undefined,
                judul: capStr(smpTask.judul, 500),
                langkah: capStrArray(smpTask.langkah, 50, 500) || [],
            };
        }

        const result = await askTutor({
            message: message.trim(),
            taskId: capStr(taskId, 128),
            taskTitle: capStr(taskTitle, 500),
            taskDescription: capStr(taskDescription, 2000),
            taskSteps: capStrArray(taskSteps, 50, 500),
            taskMaterial: capStrArray(taskMaterial, 50, 500),
            taskHint: capStr(taskHint, 2000),
            editorHtml: capStr(editorHtml, 200000),
            editorCss: capStr(editorCss, 200000),
            editorLanguage: capStr(editorLanguage, 20),
            editorCode: capStr(editorCode, 200000),
            smpTask: cleanSmpTask,
        });

        sendApiSuccess(res, result);
    } catch (error) {
        console.error("AI Tutor error:", error);
        sendApiError(res, 500, "AI Tutor gagal merespons: " + error.message, "INTERNAL_ERROR");
    }
});

// ============================================================
// ADMIN API (M1-M4): semua endpoint terlindungi di modul terpisah.
// Harus didaftarkan SEBELUM handler 404, kalau tidak semua route admin
// akan dianggap route tidak ditemukan.
// ============================================================
require("./admin-api").registerAdminApi(app, {
    db, auth, express, sendApiError, sendApiSuccess,
    rateLimitMiddleware, sanitizeString, normalizeEmail, isValidEmail
});
require("./jadwal-api").registerJadwalApi(app, {
    db, auth, sendApiError, sendApiSuccess
});
require("./finance-api").registerFinanceApi(app, {
    db, auth, sendApiError, sendApiSuccess
});
require("./subscription-api").registerSubscriptionApi(app, {
    db, auth, sendApiError, sendApiSuccess, rateLimitMiddleware
});
require("./rewards-api").registerRewardsApi(app, {
    db, auth, sendApiError, sendApiSuccess
});
require("./instruktur-api").registerInstrukturApi(app, {
    db, auth, sendApiError, sendApiSuccess
});
require("./attendance-api").registerAttendanceApi(app, {
    db, auth, sendApiError, sendApiSuccess
});
require("./report-api").registerReportApi(app, {
    db, rateLimitMiddleware, sendApiError, sendApiSuccess
});
require("./learning-api").registerLearningApi(app, {
    db, auth, sendApiError, sendApiSuccess
});
require("./student-notifications").registerStudentNotificationApi(app, {
    db, auth, sendApiError, sendApiSuccess
});

// ============================================================
// 404
// ============================================================

app.use((req, res) => {
    // Halaman HTML yang tidak ada sebaiknya tetap 404 teks agar tidak membingungkan browser.
    if (req.path.endsWith(".html")) return res.status(404).send("Not Found");
    sendApiError(res, 404, "Route tidak ditemukan", "NOT_FOUND", { path: req.path });
});

// Global error handler: jaga kontrak envelope JSON (termasuk body JSON rusak).
app.use((err, req, res, next) => {
    if (err && (err.type === "entity.parse.failed" || err instanceof SyntaxError)) {
        return sendApiError(res, 400, "Body JSON tidak valid", "VALIDATION_ERROR");
    }
    if (err && (err.status === 404 || err.code === "ENOENT")) {
        return res.status(404).send("Not Found");
    }
    console.error("Unhandled error:", err);
    if (res.headersSent) return next(err);
    sendApiError(res, 500, "Terjadi kesalahan server", "INTERNAL_ERROR");
});

// ============================================================
// HOUSEKEEPING (interval, tidak menahan proses keluar)
// ============================================================

// Bersihkan sesi kedaluwarsa tiap jam.
setInterval(() => {
    try {
        const r = db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
        if (r.changes) console.log(`Sesi kedaluwarsa dibersihkan: ${r.changes}`);
    } catch (e) { console.error("Gagal membersihkan sesi:", e.message); }
}, 60 * 60 * 1000).unref();

// Retensi notifikasi (opsional). Default 0 = simpan selamanya. Kalau diisi,
// notifikasi yang lebih tua dari N hari dibuang supaya tabel tidak tumbuh
// tanpa batas. Audit admin sengaja TIDAK ikut dihapus otomatis.
const NOTIFICATION_RETENTION_DAYS = Number.parseInt(process.env.NOTIFICATION_RETENTION_DAYS || "0", 10);
if (Number.isSafeInteger(NOTIFICATION_RETENTION_DAYS) && NOTIFICATION_RETENTION_DAYS > 0) {
    setInterval(() => {
        try {
            const cutoff = `-${NOTIFICATION_RETENTION_DAYS} days`;
            const student = db.prepare(
                "DELETE FROM student_notifications WHERE created_at <= datetime('now', ?)"
            ).run(cutoff).changes;
            const admin = db.prepare(
                "DELETE FROM admin_notifications WHERE created_at <= datetime('now', ?)"
            ).run(cutoff).changes;
            if (student + admin) console.log(`Notifikasi lama dibersihkan: ${student + admin}`);
        } catch (e) { console.error("Gagal membersihkan notifikasi:", e.message); }
    }, 6 * 60 * 60 * 1000).unref();
}

// Tandai invoice langganan yang lewat masa berlaku. Endpoint juga memeriksa
// saat dibaca; sapuan ini menjaga status tetap benar walau tidak ada akses.
setInterval(() => {
    try {
        const expired = subscriptionService.expirePending(db);
        if (expired) console.log(`Invoice langganan kedaluwarsa: ${expired}`);
        const reminded = subscriptionService.remindExpiring(db, {
            days: Number(process.env.SUBSCRIPTION_REMINDER_DAYS)
        });
        if (reminded) console.log(`Pengingat langganan berakhir terkirim: ${reminded}`);
    } catch (e) { console.error("Gagal memeriksa invoice langganan:", e.message); }
}, 60 * 60 * 1000).unref();

// Pangkas tabel rate-limit AI agar tidak tumbuh tanpa batas.
setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of aiRequestCounts) {
        if (now - e.windowStart > AI_RATE_WINDOW_MS) aiRequestCounts.delete(ip);
    }
}, 5 * 60 * 1000).unref();

// Penjadwal email laporan ke wali. Default mati; aktifkan dengan
// REPORT_EMAIL_ENABLED=true setelah provider email dikonfigurasi.
const reportSchedulerHandle = reportScheduler.startReportScheduler(db);

// Penjadwal email pengingat mentoring Zoom. Default mati; aktifkan dengan
// MENTORING_REMINDER_ENABLED=true di .env.
const mentoringSchedulerHandle = mentoringScheduler.startMentoringReminderScheduler(db);

// ============================================================
// START SERVER
// ============================================================
const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("==========================================");
    console.log("  DIENG CYBER CODING - SERVER");
    console.log("==========================================");
    console.log("");
    console.log(`Frontend : http://localhost:${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}/dashboard.html`);
    console.log(`Belajar  : http://localhost:${PORT}/belajar.html`);
    console.log(`Admin    : http://localhost:${PORT}/admin/`);
    console.log(`Instruktur: http://localhost:${PORT}/instruktur/`);
    console.log(`API      : http://localhost:${PORT}/api`);
    console.log("");
    logger.info("Server siap digunakan.");
    console.log("");
});

// Di balik reverse proxy, koneksi keep-alive jangan ditutup lebih cepat dari proxy.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.on("close", () => {
    if (reportSchedulerHandle) reportSchedulerHandle.stop();
    if (mentoringSchedulerHandle) clearInterval(mentoringSchedulerHandle);
});

server.on("error", (err) => {
    logger.fatal({ err }, "Server listen error");
    console.error("SERVER LISTEN ERROR:", err);
    process.exit(1);
});