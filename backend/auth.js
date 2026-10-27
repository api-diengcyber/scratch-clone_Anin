const crypto = require("crypto");
const db = require("./database");

// Firebase dimuat hanya saat endpoint Firebase dipakai. Tanpa ini, server
// menunggu inisialisasi Firebase/Firestore di setiap boot (lambat di hosting).
let firebaseAuthCache;

function getFirebaseAuth() {
    if (firebaseAuthCache !== undefined) return firebaseAuthCache;
    try {
        firebaseAuthCache = require("./firebase-admin").firebaseAuth || null;
    } catch (e) {
        console.warn("[WARN] Firebase Admin gagal dimuat:", e.message);
        firebaseAuthCache = null;
    }
    return firebaseAuthCache;
}

// Tiket login berlaku 30 hari.
const SESSION_DAYS = 30;

// ============================================================
// PASSWORD
// ============================================================

function hashPassword(password, salt) {
    const useSalt = salt || crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, useSalt, 64).toString("hex");
    return { salt: useSalt, hash };
}

function verifyPassword(password, salt, expectedHash) {
    const { hash } = hashPassword(password, salt);
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(expectedHash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ============================================================
// FIREBASE
// ============================================================

// Verifikasi Firebase ID Token.
// Format email yang didukung: <username>@diengcyber.local
async function verifyFirebaseToken(idToken) {
    if (typeof idToken !== "string" || !idToken.trim()) {
        throw new Error("Firebase ID token tidak tersedia.");
    }

    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) throw new Error("Login Firebase belum dikonfigurasi di server.");
    const decoded = await firebaseAuth.verifyIdToken(idToken);

    const email = String(decoded.email || "").trim().toLowerCase();
    if (!email) throw new Error("Akun Firebase tidak memiliki email.");

    const suffix = "@diengcyber.local";
    if (!email.endsWith(suffix)) {
        throw new Error("Format email Firebase tidak dikenali. Gunakan domain @diengcyber.local");
    }

    const username = email.slice(0, -suffix.length);
    if (!username) throw new Error("Username Firebase tidak valid.");

    return { uid: decoded.uid, email, username };
}

// ============================================================
// SESSION
// ============================================================

function sha256(text) {
    return crypto.createHash("sha256").update(text).digest("hex");
}

function createSession(userId) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!user) throw new Error("User tidak ditemukan saat membuat sesi.");

    db.prepare(`
        INSERT INTO sessions (token_hash, user_id, expires_at)
        VALUES (?, ?, ?)
    `).run(sha256(token), userId, expiresAt);

    return token;
}

function readToken(req) {
    const header = req.headers.authorization || "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : null;
}

function deleteSession(token) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

// Cabut semua sesi user, kecuali token yang sedang dipakai (kalau ada).
// Dipakai setelah ganti password supaya sesi lama di perangkat lain ikut mati.
function deleteOtherSessions(userId, keepToken) {
    if (keepToken) {
        db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?")
            .run(userId, sha256(keepToken));
    } else {
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    }
}

function deleteAllSessions(userId) {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

// ============================================================
// ERROR HELPER (consistent with server.js)
// ============================================================

function authError(res, status, message, code) {
    return res.status(status).json({ ok: false, code, message });
}

// ============================================================
// MIDDLEWARE
// ============================================================

// "Satpam": wajib membawa session token dari backend.
function requireAuth(req, res, next) {
    const token = readToken(req);
    if (!token) return authError(res, 401, "Belum login", "UNAUTHORIZED");

    const session = db.prepare(`
        SELECT s.user_id, s.expires_at,
               u.username, u.role, u.status, u.must_change_password
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?
    `).get(sha256(token));

    if (!session || new Date(session.expires_at) < new Date()) {
        return authError(res, 401, "Sesi habis, silakan login lagi", "SESSION_EXPIRED");
    }

    if (session.status === "suspended") {
        return authError(res, 403, "Akun sedang ditangguhkan", "ACCOUNT_SUSPENDED");
    }
    if (session.status !== "active") {
        return authError(res, 403, "Akun tidak aktif", "ACCOUNT_INACTIVE");
    }

    const role = session.role || "student";
    if (role !== "student" && role !== "admin") {
        return authError(res, 403, "Role akun belum didukung. Gunakan student atau admin.", "ROLE_NOT_SUPPORTED");
    }
    req.userId = session.user_id;
    req.user = session.username;
    req.role = role;
    req.status = session.status;
    req.mustChangePassword = Boolean(session.must_change_password);
    req.token = token;
    next();
}

function requireAdmin(req, res, next) {
    if (req.role !== "admin") {
        return authError(res, 403, "Akses admin diperlukan", "ADMIN_REQUIRED");
    }
    next();
}

// Reserved untuk fase berikutnya. Schema role saat ini hanya student/admin;
// akses developer plugin memakai allowlist PLUGIN_DEVELOPER_USER_IDS.
function requireSuperadmin(req, res, next) {
    if (req.role !== "superadmin") {
        return authError(res, 403, "Akses superadmin diperlukan", "SUPERADMIN_REQUIRED");
    }
    next();
}

// "Satpam kedua": tiket Budi hanya boleh membuka data Budi.
function requireSameUser(req, res, next) {
    // Route lama masih menerima username agar frontend lama tetap kompatibel,
    // tetapi otorisasi tetap membandingkan users.id, bukan teks username.
    let requestedId = null;
    if (req.params.userId !== undefined) {
        const value = String(req.params.userId).trim();
        if (/^\d+$/.test(value)) requestedId = Number(value);
    } else {
        const requestedUsername = String(req.params.username || "").trim();
        if (requestedUsername) {
            const target = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(requestedUsername);
            requestedId = target ? Number(target.id) : null;
        }
    }
    if (!requestedId || requestedId !== Number(req.userId)) {
        return authError(res, 403, "Tidak boleh mengakses data user lain", "FORBIDDEN");
    }
    next();
}

// ============================================================
// BATAS PERCOBAAN LOGIN (in-memory)
// ============================================================

const failedLogins = new Map();
const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 menit

function isBlocked(key) {
    const entry = failedLogins.get(key);
    if (!entry) return false;
    if (Date.now() - entry.first > WINDOW_MS) {
        failedLogins.delete(key);
        return false;
    }
    return entry.count >= MAX_FAILS;
}

function recordFail(key) {
    const entry = failedLogins.get(key);
    if (!entry || Date.now() - entry.first > WINDOW_MS) {
        failedLogins.set(key, { count: 1, first: Date.now() });
    } else {
        entry.count += 1;
    }
}

function clearFails(key) {
    failedLogins.delete(key);
}

// Pangkas entri rate-limit yang sudah lewat jendelanya (tiap 5 menit).
setInterval(() => {
    const now = Date.now();
    for (const [k, e] of failedLogins) {
        if (now - e.first > WINDOW_MS) failedLogins.delete(k);
    }
}, 5 * 60 * 1000).unref();

// ============================================================
// EXPORT
// ============================================================

module.exports = {
    hashPassword,
    verifyPassword,
    verifyFirebaseToken,
    createSession,
    deleteSession,
    deleteOtherSessions,
    deleteAllSessions,
    requireAuth,
    requireAdmin,
    requireSuperadmin,
    requireSameUser,
    isBlocked,
    recordFail,
    clearFails,
    authError
};