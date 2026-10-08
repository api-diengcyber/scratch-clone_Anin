const path = require("path");
const Database = require("better-sqlite3");

// Database selalu berada di folder backend.
// (DB_PATH hanya dipakai untuk testing otomatis.)
const dbPath = process.env.DB_PATH || path.join(__dirname, "database.sqlite");

const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

// ============================================================
// USERS
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Kolom password ditambahkan lewat "migrasi" supaya database lama
// (yang sudah berisi user & progress) tidak rusak dan tidak perlu dihapus.
const userColumns = db
    .prepare("PRAGMA table_info(users)")
    .all()
    .map((column) => column.name);

if (!userColumns.includes("password_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
}

if (!userColumns.includes("password_salt")) {
    db.exec("ALTER TABLE users ADD COLUMN password_salt TEXT");
}

// ============================================================
// SESSIONS (tiket login)
// ============================================================
// Yang disimpan adalah HASH dari token, bukan token aslinya.

db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY(username) REFERENCES users(username)
    )
`);

// ============================================================
// PROGRESS
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        task_id TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        completed_at DATETIME,
        UNIQUE(username, task_id),
        FOREIGN KEY(username) REFERENCES users(username)
    )
`);

// ============================================================
// POINTS
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(username) REFERENCES users(username)
    )
`);

// ============================================================
// MATERIALS
// ============================================================
// Menyimpan hubungan antara task dengan halaman materi.
// Isi halaman HTML-nya masih tetap berupa file di frontend.
// Untuk sekarang kita simpan path-nya dulu.

db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grade TEXT NOT NULL,
        task_id TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(grade, task_id)
    )
`);

// ============================================================
// TASKS
// ============================================================
// Menyimpan definisi task dari Learning Path.
// Status selesai tetap disimpan di tabel progress.
//
// Satu module bisa memiliki banyak task.
// Contoh:
// SMP / py1 / py1:0
// SMP / py1 / py1:1
// dst.
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        grade TEXT NOT NULL,
        module_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        task_index INTEGER NOT NULL,

        title TEXT NOT NULL,
        steps TEXT NOT NULL DEFAULT '[]',

        is_project INTEGER NOT NULL DEFAULT 0,
        requires_submission INTEGER NOT NULL DEFAULT 0,

        editor_url TEXT,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(grade, task_id)
    )
`);

console.log("Database berhasil terhubung.");
console.log("Lokasi database:", dbPath);

module.exports = db;