const crypto = require("crypto");
const db = require("./database");

const {
    firebaseAuth
} = require("./firebase-admin");

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

function createSession(username) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
        INSERT INTO sessions (token_hash, username, expires_at)
        VALUES (?, ?, ?)
    `).run(sha256(token), username, expiresAt);

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
        SELECT username, expires_at FROM sessions WHERE token_hash = ?
    `).get(sha256(token));

    if (!session || new Date(session.expires_at) < new Date()) {
        return authError(res, 401, "Sesi habis, silakan login lagi", "SESSION_EXPIRED");
    }

    req.user = session.username;
    req.token = token;
    next();
}

// "Satpam kedua": tiket Budi hanya boleh membuka data Budi.
function requireSameUser(req, res, next) {
    const requested = String(req.params.username || "").trim();
    if (requested !== req.user) {
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

// ============================================================
// EXPORT
// ============================================================

module.exports = {
    hashPassword,
    verifyPassword,
    verifyFirebaseToken,
    createSession,
    deleteSession,
    requireAuth,
    requireSameUser,
    isBlocked,
    recordFail,
    clearFails,
    authError
};