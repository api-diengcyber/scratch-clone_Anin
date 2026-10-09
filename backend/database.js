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

// ============================================================
// MIGRASI POINTS — CONSTRAINT TOTAL
// ============================================================

const pointsSchemaRow = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'points'
`).get();

const pointsSchema = String(pointsSchemaRow?.sql || "")
    .replace(/\s+/g, " ")
    .toLowerCase();

const hasPointsConstraints =
    pointsSchema.includes("check (total >= 0") &&
    pointsSchema.includes("typeof(total) = 'integer'");

if (!hasPointsConstraints) {
    // Tolak migrasi jika data lama tidak cocok dengan schema baru.
    const invalidPoints = db.prepare(`
        SELECT username, total
        FROM points
        WHERE total < 0
           OR typeof(total) <> 'integer'
    `).all();

    if (invalidPoints.length > 0) {
        throw new Error(
            "Migrasi points dibatalkan: ditemukan total yang tidak valid."
        );
    }

    const migrationTableExists = db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'points_migration_new'
    `).get();

    if (migrationTableExists) {
        throw new Error(
            "Tabel points_migration_new sudah ada. Periksa database sebelum melanjutkan."
        );
    }

    const migratePoints = db.transaction(() => {
        db.exec(`
            CREATE TABLE points_migration_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                total INTEGER NOT NULL DEFAULT 0
                    CHECK (
                        total >= 0
                        AND typeof(total) = 'integer'
                    ),
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY(username)
                    REFERENCES users(username)
            )
        `);

        db.exec(`
            INSERT INTO points_migration_new (
                id,
                username,
                total,
                updated_at
            )
            SELECT
                id,
                username,
                total,
                updated_at
            FROM points
        `);

        db.exec("DROP TABLE points");
        db.exec(
            "ALTER TABLE points_migration_new RENAME TO points"
        );
    });

    migratePoints();

    console.log("Migrasi constraint points berhasil.");
}
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

const CREATE_MATERIALS_TABLE = `
    CREATE TABLE materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grade TEXT NOT NULL,
        task_id TEXT NOT NULL,
        lesson_index INTEGER NOT NULL DEFAULT 0,
        path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(grade, task_id, lesson_index)
    )
`;

const materialsTableExists = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'materials'
`).get();

if (!materialsTableExists) {
    // Database baru: langsung buat schema yang benar.
    db.exec(CREATE_MATERIALS_TABLE);
} else {
    const materialColumns = db
        .prepare("PRAGMA table_info(materials)")
        .all()
        .map((column) => column.name);

    if (!materialColumns.includes("lesson_index")) {
        // Database lama: migrasikan tanpa sengaja membuang data.
        const oldRows = db.prepare(`
            SELECT id, grade, task_id, path, created_at
            FROM materials
            ORDER BY id ASC
        `).all();

        const migrateMaterials = db.transaction(() => {
            db.exec(`
                ALTER TABLE materials
                RENAME TO materials_legacy
            `);

            db.exec(CREATE_MATERIALS_TABLE);

            const insert = db.prepare(`
                INSERT OR IGNORE INTO materials (
                    id,
                    grade,
                    task_id,
                    lesson_index,
                    path,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (const row of oldRows) {
                // Contoh: py1:2 → modul py1, index 2.
                const match = /^(.*):(\d+)$/.exec(row.task_id);

                const taskId = match ? match[1] : row.task_id;
                const lessonIndex = match
                    ? Number(match[2])
                    : 0;

                insert.run(
                    row.id,
                    row.grade,
                    taskId,
                    lessonIndex,
                    row.path,
                    row.created_at
                );
            }

            db.exec("DROP TABLE materials_legacy");
        });

        migrateMaterials();
        console.log("Migrasi schema materials berhasil.");
    }
}
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
// ============================================================
// MIGRASI PROGRESS — RELASI KE TASKS
// ============================================================

// Pastikan task_id unik secara global sebelum dijadikan FK.
const duplicateTaskId = db.prepare(`
    SELECT task_id, COUNT(*) AS total
    FROM tasks
    GROUP BY task_id
    HAVING COUNT(*) > 1
    LIMIT 1
`).get();

if (duplicateTaskId) {
    throw new Error(
        `Migrasi progress dibatalkan: task_id "${duplicateTaskId.task_id}" duplikat.`
    );
}

// SQLite membutuhkan kolom tujuan FK yang unik.
db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_id_unique
    ON tasks(task_id)
`);

// Cek apakah FK ke tasks sudah terpasang.
const progressForeignKeys = db
    .prepare("PRAGMA foreign_key_list(progress)")
    .all();

const hasTaskForeignKey = progressForeignKeys.some(
    (fk) =>
        fk.table === "tasks" &&
        fk.from === "task_id" &&
        fk.to === "task_id"
);

if (!hasTaskForeignKey) {
    // Jangan migrasikan jika ada progress yang tidak punya task.
    const orphanProgress = db.prepare(`
        SELECT p.username, p.task_id
        FROM progress p
        LEFT JOIN tasks t ON t.task_id = p.task_id
        WHERE t.task_id IS NULL
    `).all();

    if (orphanProgress.length > 0) {
        throw new Error(
            "Migrasi progress dibatalkan: ada progress yang tidak cocok dengan task."
        );
    }

    const migrateProgress = db.transaction(() => {
        db.exec(`
            CREATE TABLE progress_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                task_id TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0
                    CHECK (completed IN (0, 1)),
                completed_at DATETIME,

                UNIQUE(username, task_id),

                FOREIGN KEY(username)
                    REFERENCES users(username),

                FOREIGN KEY(task_id)
                    REFERENCES tasks(task_id)
            )
        `);

        db.exec(`
            INSERT INTO progress_new (
                id,
                username,
                task_id,
                completed,
                completed_at
            )
            SELECT
                id,
                username,
                task_id,
                completed,
                completed_at
            FROM progress
        `);

        db.exec("DROP TABLE progress");
        db.exec("ALTER TABLE progress_new RENAME TO progress");
    });

    migrateProgress();

    console.log("Migrasi foreign key progress → tasks berhasil.");
}

console.log("Database berhasil terhubung.");
console.log("Lokasi database:", dbPath);

module.exports = db;