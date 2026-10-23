const path = require("path");
const Database = require("better-sqlite3");

// Database selalu berada di folder backend.
// (DB_PATH hanya dipakai untuk testing otomatis.)
const dbPath = process.env.DB_PATH || path.join(__dirname, "database.sqlite");

const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

// ============================================================
// USERS — FINAL SCHEMA
// ============================================================
//
// IDENTITY DECISION:
// - `id` (INTEGER PRIMARY KEY) = internal DB primary key
// - `firebase_uid` (TEXT UNIQUE) = stable link to Firebase Auth (nullable for legacy)
// - `email` (TEXT UNIQUE) = user's email attribute (nullable for legacy)
// - `username` (TEXT UNIQUE) = legacy display name, kept for compatibility
// - `password_hash`, `password_salt` = for legacy username/password auth
//
// All new users via Firebase get firebase_uid + email + username (from email prefix).
// Legacy users have username + password_hash only.
// All nullable to support gradual migration.
//
// KEPUTUSAN IDENTITAS FINAL (langkah 2):
// - firebase_uid = identitas kanonis untuk user baru (stabil, dari Firebase).
// - email = atribut unik (case-insensitive), bukan kunci relasi.
// - username = kompatibilitas legacy + target FK saat ini (jangan rename).
// - Migrasi FK username -> firebase_uid DITUNDA sampai langkah 5 (butuh backfill + ganti auth).

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        firebase_uid TEXT,
        password_hash TEXT,
        password_salt TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Migrasi kolom lama (aman dijalankan berulang)
const existingUserColumns = db
    .prepare("PRAGMA table_info(users)")
    .all()
    .map((column) => column.name);

if (!existingUserColumns.includes("email")) {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT");
}
if (!existingUserColumns.includes("firebase_uid")) {
    db.exec("ALTER TABLE users ADD COLUMN firebase_uid TEXT");
}
if (!existingUserColumns.includes("password_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
}
if (!existingUserColumns.includes("password_salt")) {
    db.exec("ALTER TABLE users ADD COLUMN password_salt TEXT");
}
if (!existingUserColumns.includes("allowed_grades")) {
    db.exec("ALTER TABLE users ADD COLUMN allowed_grades TEXT");
}
if (!existingUserColumns.includes("full_name")) {
    db.exec("ALTER TABLE users ADD COLUMN full_name TEXT");
}
if (!existingUserColumns.includes("bio")) {
    db.exec("ALTER TABLE users ADD COLUMN bio TEXT");
}
if (!existingUserColumns.includes("avatar_url")) {
    db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT");
}
if (!existingUserColumns.includes("equipped_frame")) {
    db.exec("ALTER TABLE users ADD COLUMN equipped_frame TEXT");
}
if (!existingUserColumns.includes("equipped_title")) {
    db.exec("ALTER TABLE users ADD COLUMN equipped_title TEXT");
}

// Unique indexes (hanya untuk non-null, non-empty)
db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users(email COLLATE NOCASE)
    WHERE email IS NOT NULL AND email <> ''
`);
db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid_unique
    ON users(firebase_uid)
    WHERE firebase_uid IS NOT NULL AND firebase_uid <> ''
`);

// ============================================================
// ITEM TOKO (Koin Belajar) — bingkai avatar & gelar
// ============================================================
// Harga disimpan saat pembelian (snapshot), sehingga perubahan harga
// di katalog tidak mengubah saldo yang sudah pernah dibelanjakan.
db.exec(`
    CREATE TABLE IF NOT EXISTS user_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        item_id TEXT NOT NULL,
        jenis TEXT NOT NULL CHECK (jenis IN ('bingkai', 'gelar')),
        harga INTEGER NOT NULL CHECK (harga >= 0),
        purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(username, item_id),
        FOREIGN KEY(username) REFERENCES users(username)
    )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_user_items_username ON user_items(username);`);

// ============================================================
// SESSIONS (tiket login — simpan HASH token)
// ============================================================

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
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        completed_at DATETIME,
        UNIQUE(username, task_id),
        FOREIGN KEY(username) REFERENCES users(username),
        FOREIGN KEY(task_id) REFERENCES tasks(task_id)
    )
`);

// ============================================================
// POINTS
// ============================================================

// Schema final dengan constraint
const pointsSchemaRow = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'points'
`).get();

const pointsSchema = String(pointsSchemaRow?.sql || "").replace(/\s+/g, " ").toLowerCase();
const hasPointsConstraints = /check\s*\(\s*total\s*>=\s*0/i.test(pointsSchema) && /typeof\s*\(\s*total\s*\)\s*=\s*'integer'/i.test(pointsSchema);

if (!pointsSchemaRow) {
    db.exec(`
        CREATE TABLE points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            total INTEGER NOT NULL DEFAULT 0
                CHECK (total >= 0 AND typeof(total) = 'integer'),
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(username) REFERENCES users(username)
        )
    `);
} else if (!hasPointsConstraints) {
    const invalidPoints = db.prepare(`
        SELECT username, total FROM points WHERE total < 0 OR typeof(total) <> 'integer'
    `).all();

    if (invalidPoints.length > 0) {
        throw new Error("Migrasi points dibatalkan: ditemukan total yang tidak valid.");
    }

    const migrationTableExists = db.prepare(`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'points_migration_new'
    `).get();

    if (migrationTableExists) {
        throw new Error("Tabel points_migration_new sudah ada. Periksa database sebelum melanjutkan.");
    }

    const migratePoints = db.transaction(() => {
        db.exec(`
            CREATE TABLE points_migration_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                total INTEGER NOT NULL DEFAULT 0
                    CHECK (total >= 0 AND typeof(total) = 'integer'),
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(username) REFERENCES users(username)
            )
        `);
        db.exec(`
            INSERT INTO points_migration_new (id, username, total, updated_at)
            SELECT id, username, total, updated_at FROM points
        `);
        db.exec("DROP TABLE points");
        db.exec("ALTER TABLE points_migration_new RENAME TO points");
    });
    migratePoints();
    console.log("Migrasi constraint points berhasil.");
}

// ============================================================
// MATERIALS
// ============================================================

const CREATE_MATERIALS_TABLE = `
    CREATE TABLE materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grade TEXT NOT NULL,
        module_id TEXT NOT NULL,
        lesson_index INTEGER NOT NULL DEFAULT 0,
        path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(grade, module_id, lesson_index),
        FOREIGN KEY (grade, module_id) REFERENCES modules(grade, module_id)
    )
`;

const materialsTableExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'materials'
`).get();

if (!materialsTableExists) {
    db.exec(CREATE_MATERIALS_TABLE);
} else {
    const columns = db.prepare("PRAGMA table_info(materials)").all().map((c) => c.name);
    if (!columns.includes("lesson_index")) {
        const legacyColumn = columns.includes("module_id") ? "module_id" : columns.includes("task_id") ? "task_id" : null;
        if (!legacyColumn) throw new Error("Migrasi materials dibatalkan: kolom ID modul tidak ditemukan.");

        const oldRows = db.prepare(`
            SELECT id, grade, ${legacyColumn} AS legacy_key, path, created_at
            FROM materials ORDER BY id ASC
        `).all();

        const migrateMaterials = db.transaction(() => {
            db.exec("ALTER TABLE materials RENAME TO materials_legacy");
            db.exec(CREATE_MATERIALS_TABLE);
            const insert = db.prepare(`
                INSERT OR IGNORE INTO materials (id, grade, module_id, lesson_index, path, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            for (const row of oldRows) {
                const match = /^(.*):(\d+)$/.exec(row.legacy_key);
                insert.run(row.id, row.grade, match ? match[1] : row.legacy_key, match ? Number(match[2]) : 0, row.path, row.created_at);
            }
            db.exec("DROP TABLE materials_legacy");
        });
        migrateMaterials();
        console.log("Migrasi schema materials berhasil.");
    } else if (columns.includes("task_id") && !columns.includes("module_id")) {
        db.exec("ALTER TABLE materials RENAME COLUMN task_id TO module_id");
        console.log("Kolom materials.task_id diganti menjadi module_id.");
    } else if (!columns.includes("module_id")) {
        throw new Error("Tabel materials tidak memiliki kolom module_id yang valid.");
    }
}

// ============================================================
// TASKS
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
        points INTEGER NOT NULL DEFAULT 10,
        editor_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(grade, task_id),
        FOREIGN KEY (grade, module_id) REFERENCES modules(grade, module_id)
    )
`);

// ============================================================
// MODULES
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS modules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grade TEXT NOT NULL,
        module_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(grade, module_id)
    )
`);

// Daftarkan modul dari data tasks dan materials yang sudah ada
db.exec(`
    INSERT OR IGNORE INTO modules (grade, module_id)
    SELECT grade, module_id FROM tasks
    UNION
    SELECT grade, module_id FROM materials
`);

// ============================================================
// MIGRASI PROGRESS — FK ke TASKS (sudah ada di atas)
// ============================================================
// Pastikan task_id unik secara global sebelum dijadikan FK
const duplicateTaskId = db.prepare(`
    SELECT task_id, COUNT(*) AS total FROM tasks GROUP BY task_id HAVING COUNT(*) > 1 LIMIT 1
`).get();

if (duplicateTaskId) {
    throw new Error(`Migrasi progress dibatalkan: task_id "${duplicateTaskId.task_id}" duplikat.`);
}

db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_id_unique ON tasks(task_id)`);

const progressForeignKeys = db.prepare("PRAGMA foreign_key_list(progress)").all();
const hasTaskForeignKey = progressForeignKeys.some(fk => fk.table === "tasks" && fk.from === "task_id" && fk.to === "task_id");

if (!hasTaskForeignKey) {
    const orphanProgress = db.prepare(`
        SELECT p.username, p.task_id FROM progress p
        LEFT JOIN tasks t ON t.task_id = p.task_id WHERE t.task_id IS NULL
    `).all();

    if (orphanProgress.length > 0) {
        throw new Error("Migrasi progress dibatalkan: ada progress yang tidak cocok dengan task.");
    }

    const migrateProgress = db.transaction(() => {
        db.exec(`
            CREATE TABLE progress_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                task_id TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
                completed_at DATETIME,
                UNIQUE(username, task_id),
                FOREIGN KEY(username) REFERENCES users(username),
                FOREIGN KEY(task_id) REFERENCES tasks(task_id)
            )
        `);
        db.exec(`
            INSERT INTO progress_new (id, username, task_id, completed, completed_at)
            SELECT id, username, task_id, completed, completed_at FROM progress
        `);
        db.exec("DROP TABLE progress");
        db.exec("ALTER TABLE progress_new RENAME TO progress");
    });
    migrateProgress();
    console.log("Migrasi foreign key progress -> tasks berhasil.");
}

// ============================================================
// MIGRASI FOREIGN KEY: TASKS & MATERIALS -> MODULES
// ============================================================

function hasModuleForeignKey(table) {
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${table})`).all();
    const hasGrade = foreignKeys.some(fk => fk.table === "modules" && fk.from === "grade" && fk.to === "grade");
    const hasModuleId = foreignKeys.some(fk => fk.table === "modules" && fk.from === "module_id" && fk.to === "module_id");
    return hasGrade && hasModuleId;
}

const tasksHaveModuleFK = hasModuleForeignKey("tasks");
const materialsHaveModuleFK = hasModuleForeignKey("materials");

if (!tasksHaveModuleFK || !materialsHaveModuleFK) {
    const orphanTasks = db.prepare(`
        SELECT t.grade, t.module_id FROM tasks t
        LEFT JOIN modules m ON m.grade = t.grade AND m.module_id = t.module_id
        WHERE m.module_id IS NULL
    `).all();

    const orphanMaterials = db.prepare(`
        SELECT a.grade, a.module_id FROM materials a
        LEFT JOIN modules m ON m.grade = a.grade AND m.module_id = a.module_id
        WHERE m.module_id IS NULL
    `).all();

    if (orphanTasks.length || orphanMaterials.length) {
        throw new Error("Migrasi dibatalkan: ada task atau materi tanpa modul.");
    }

    const duplicateTaskIds = db.prepare(`
        SELECT task_id, COUNT(*) AS total FROM tasks GROUP BY task_id HAVING COUNT(*) > 1
    `).all();

    if (duplicateTaskIds.length) {
        throw new Error("Migrasi dibatalkan: ditemukan task_id duplikat.");
    }

    db.pragma("foreign_keys = OFF");
    try {
        const migrateModuleRelations = db.transaction(() => {
            db.exec(`
                CREATE TABLE tasks_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    grade TEXT NOT NULL, module_id TEXT NOT NULL, task_id TEXT NOT NULL,
                    task_index INTEGER NOT NULL, title TEXT NOT NULL, steps TEXT NOT NULL DEFAULT '[]',
                    is_project INTEGER NOT NULL DEFAULT 0, requires_submission INTEGER NOT NULL DEFAULT 0,
                    points INTEGER NOT NULL DEFAULT 10,
                    editor_url TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(grade, task_id),
                    FOREIGN KEY (grade, module_id) REFERENCES modules(grade, module_id)
                );
                CREATE TABLE materials_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    grade TEXT NOT NULL, module_id TEXT NOT NULL, lesson_index INTEGER NOT NULL DEFAULT 0,
                    path TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(grade, module_id, lesson_index),
                    FOREIGN KEY (grade, module_id) REFERENCES modules(grade, module_id)
                );
            `);
            db.exec(`
                INSERT INTO tasks_new (id, grade, module_id, task_id, task_index, title, steps, is_project, requires_submission, points, editor_url, created_at)
                SELECT id, grade, module_id, task_id, task_index, title, steps, is_project, requires_submission, points, editor_url, created_at FROM tasks;
                INSERT INTO materials_new (id, grade, module_id, lesson_index, path, created_at)
                SELECT id, grade, module_id, lesson_index, path, created_at FROM materials;
                DROP TABLE materials; DROP TABLE tasks;
                ALTER TABLE tasks_new RENAME TO tasks;
                ALTER TABLE materials_new RENAME TO materials;
            `);
            db.exec(`CREATE UNIQUE INDEX idx_tasks_task_id_unique ON tasks(task_id)`);
            const violations = db.pragma("foreign_key_check");
            if (violations.length) throw new Error("Foreign key check gagal: " + JSON.stringify(violations));
        });
        migrateModuleRelations();
        console.log("Migrasi foreign key tasks/materials -> modules berhasil.");
    } finally {
        db.pragma("foreign_keys = ON");
    }
}

// Nilai koin per task (fase 2). Default ikut jenis; seed menyegarkan dari kurikulum.
const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
if (!taskCols.includes("points")) {
    db.exec("ALTER TABLE tasks ADD COLUMN points INTEGER NOT NULL DEFAULT 10");
    db.prepare("UPDATE tasks SET points = 50 WHERE is_project = 1").run();
    console.log("Migrasi kolom tasks.points berhasil.");
}

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username);
    CREATE INDEX IF NOT EXISTS idx_progress_username ON progress(username);
    CREATE INDEX IF NOT EXISTS idx_progress_task ON progress(task_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_grade_module ON tasks(grade, module_id);
    CREATE INDEX IF NOT EXISTS idx_materials_grade_module ON materials(grade, module_id);
`);

// Percobaan gagal per task (sumber bonus percobaan pertama, semua task).
db.exec(`
    CREATE TABLE IF NOT EXISTS attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        task_id TEXT NOT NULL,
        fails INTEGER NOT NULL DEFAULT 0 CHECK (fails >= 0),
        time_spent INTEGER NOT NULL DEFAULT 0 CHECK (time_spent >= 0),
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(username, task_id),
        FOREIGN KEY(username) REFERENCES users(username),
        FOREIGN KEY(task_id) REFERENCES tasks(task_id)
    )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_attempts_username ON attempts(username);`);

// Migrasi kolom attempts.time_spent (aman dijalankan berulang)
const attemptCols = db.prepare("PRAGMA table_info(attempts)").all().map((c) => c.name);
if (!attemptCols.includes("time_spent")) {
    db.exec("ALTER TABLE attempts ADD COLUMN time_spent INTEGER NOT NULL DEFAULT 0 CHECK (time_spent >= 0)");
    console.log("Migrasi kolom attempts.time_spent berhasil.");
}

// Flag bonus per progres (bonus hanya sekali seumur task).
const progressCols = db.prepare("PRAGMA table_info(progress)").all().map((c) => c.name);
if (!progressCols.includes("bonus_awarded")) {
    db.exec("ALTER TABLE progress ADD COLUMN bonus_awarded INTEGER NOT NULL DEFAULT 0 CHECK (bonus_awarded IN (0, 1))");
    console.log("Migrasi kolom progress.bonus_awarded berhasil.");
}

console.log("Database berhasil terhubung.");
console.log("Lokasi database:", dbPath);

module.exports = db;