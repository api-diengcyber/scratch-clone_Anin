const crypto = require("crypto");
const db = require("./database");

// Tiket login berlaku 30 hari.
const SESSION_DAYS = 30;

// ============================================================
// PASSWORD
// ============================================================
// Password tidak pernah disimpan apa adanya. Yang disimpan:
// - salt : acakan unik per user
// - hash : hasil "pengacakan satu arah" (scrypt) dari password + salt
// Pakai crypto bawaan Node, jadi tidak perlu install package baru.

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
// SESSION
// ============================================================

function sha256(text) {
    return crypto.createHash("sha256").update(text).digest("hex");
}

function createSession(username) {
    const token = crypto.randomBytes(32).toString("hex");

    const expiresAt = new Date(
        Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

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
// MIDDLEWARE
// ============================================================

// "Satpam": wajib bawa tiket yang valid.
function requireAuth(req, res, next) {
    const token = readToken(req);

    if (!token) {
        return res.status(401).json({ message: "Belum login" });
    }

    const session = db.prepare(`
        SELECT username, expires_at
        FROM sessions
        WHERE token_hash = ?
    `).get(sha256(token));

    if (!session || new Date(session.expires_at) < new Date()) {
        return res.status(401).json({
            message: "Sesi habis, silakan login lagi"
        });
    }

    req.user = session.username;
    req.token = token;
    next();
}

// "Satpam kedua": tiket Budi hanya boleh membuka data Budi.
function requireSameUser(req, res, next) {
    const requested = String(req.params.username || "").trim();

    if (requested !== req.user) {
        return res.status(403).json({
            message: "Tidak boleh mengakses data user lain"
        });
    }

    next();
}

// ============================================================
// BATAS PERCOBAAN LOGIN (anti tebak-tebakan password)
// ============================================================

const failedLogins = new Map();
const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000;

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

module.exports = {
    hashPassword,
    verifyPassword,
    createSession,
    deleteSession,
    requireAuth,
    requireSameUser,
    isBlocked,
    recordFail,
    clearFails
};
