const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// DB_PATH dipakai di production (volume persistent) dan testing otomatis.
const dbPath = process.env.DB_PATH || path.join(__dirname, "database.sqlite");

if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}
if (process.env.NODE_ENV === "production" && !process.env.DB_PATH) {
    console.warn("[WARN] DB_PATH belum diset di production. Database berada di folder aplikasi dan bisa hilang saat redeploy.");
}

const db = new Database(dbPath);

db.pragma("foreign_keys = ON");
// Performa & ketahanan saat ada beberapa request bersamaan.
db.pragma("busy_timeout = 5000");
db.pragma("temp_store = MEMORY");
db.pragma("cache_size = -16000"); // ~16 MB cache halaman

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
// KEPUTUSAN IDENTITAS FINAL (M2):
// - users.id = identitas kanonis untuk semua relasi.
// - firebase_uid = tautan stabil ke Firebase Auth untuk akun Firebase.
// - email = atribut unik (case-insensitive), bukan kunci relasi.
// - username = nama login/display; boleh diubah admin tanpa memutus relasi.
// - Tabel anak (sessions/progress/points/attempts/user_items) memakai user_id.
//   Database lama dimigrasikan otomatis oleh migrateIdentityToUserId() di bawah.

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
if (!existingUserColumns.includes("role")) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin', 'instruktur', 'ortu'))");
}
if (!existingUserColumns.includes("status")) {
    db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted'))");
}
if (!existingUserColumns.includes("must_change_password")) {
    db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1))");
}
if (!existingUserColumns.includes("last_login_at")) {
    db.exec("ALTER TABLE users ADD COLUMN last_login_at DATETIME");
}

// ============================================================
// MIGRASI NILAI ROLE
// ============================================================
// SQLite tidak bisa mengubah CHECK lewat ALTER TABLE, jadi tabel users
// dibangun ulang dengan definisi role yang baru. `id` dipertahankan sehingga
// relasi tabel anak (sessions, progress, points, dst.) tetap utuh.
(function migrateUserRoles() {
    const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
    if (!table || !table.sql || table.sql.includes("'instruktur'")) return;

    db.pragma("foreign_keys = OFF");
    try {
        db.transaction(() => {
            db.exec(`
                CREATE TABLE users_role_migration (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    password_hash TEXT,
                    password_salt TEXT,
                    email TEXT,
                    firebase_uid TEXT,
                    allowed_grades TEXT,
                    full_name TEXT,
                    bio TEXT,
                    avatar_url TEXT,
                    equipped_frame TEXT,
                    equipped_title TEXT,
                    role TEXT NOT NULL DEFAULT 'student'
                        CHECK (role IN ('student', 'admin', 'instruktur', 'ortu')),
                    status TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'suspended', 'deleted')),
                    must_change_password INTEGER NOT NULL DEFAULT 0
                        CHECK (must_change_password IN (0, 1)),
                    last_login_at DATETIME
                )
            `);
            db.exec(`
                INSERT INTO users_role_migration
                    (id, username, created_at, password_hash, password_salt, email, firebase_uid,
                     allowed_grades, full_name, bio, avatar_url, equipped_frame, equipped_title,
                     role, status, must_change_password, last_login_at)
                SELECT id, username, created_at, password_hash, password_salt, email, firebase_uid,
                     allowed_grades, full_name, bio, avatar_url, equipped_frame, equipped_title,
                     role, status, must_change_password, last_login_at
                FROM users
            `);
            db.exec("DROP TABLE users");
            db.exec("ALTER TABLE users_role_migration RENAME TO users");
            db.exec(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
                    ON users(email COLLATE NOCASE)
                    WHERE email IS NOT NULL AND email <> '';
                CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid_unique
                    ON users(firebase_uid)
                    WHERE firebase_uid IS NOT NULL AND firebase_uid <> '';
            `);
        })();
    } finally {
        db.pragma("foreign_keys = ON");
    }

    const broken = db.prepare("PRAGMA foreign_key_check").all();
    if (broken.length) throw new Error("Migrasi role users meninggalkan relasi yang rusak.");
    console.log("[MIGRASI] Role users diperluas: student, admin, instruktur, ortu.");
})();

// ============================================================
// ADMIN AUDIT
// ============================================================
// actor_user_id sengaja tidak memakai FK: audit harus tetap ada walaupun
// akun admin-nya kelak dihapus. actor_username disimpan sebagai snapshot.
db.exec(`
    CREATE TABLE IF NOT EXISTS admin_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_user_id INTEGER,
        actor_username TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        details TEXT,
        ip TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at DESC);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit(actor_user_id, created_at DESC);`);

// Dokumen kurikulum admin (tahap, jalur, materi). Disimpan sebagai satu
// dokumen berversi agar perubahan dari UI Admin bersifat atomik dan tidak
// kehilangan update saat dua admin mengedit bersamaan.
db.exec(`
    CREATE TABLE IF NOT EXISTS curriculum_documents (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL,
        updated_by INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(updated_by) REFERENCES users(id)
    );
`);

// ============================================================
// CODE LAB & BLOCKLY
// ============================================================
// Tantangan dikelola Admin. `status` draft/published menentukan apakah
// tantangan boleh muncul di endpoint murid. Data tes disimpan JSON agar
// fleksibel, tetapi divalidasi ketat sebelum masuk DB.
db.exec(`
    CREATE TABLE IF NOT EXISTS code_lab_challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('blockly', 'kode')),
        grade TEXT NOT NULL CHECK (grade IN ('SD', 'SMP', 'SMK')),
        language TEXT NOT NULL,
        instructions TEXT NOT NULL,
        goal TEXT NOT NULL DEFAULT '',
        blocks_json TEXT NOT NULL DEFAULT '[]',
        block_limit INTEGER,
        starter_code TEXT NOT NULL DEFAULT '',
        tests_json TEXT NOT NULL DEFAULT '[]',
        criteria TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
        completions INTEGER NOT NULL DEFAULT 0 CHECK (completions >= 0),
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(created_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_code_lab_status_grade
        ON code_lab_challenges(status, grade, id DESC);
`);

// ============================================================
// NOTIFIKASI ADMIN
// ============================================================
// Notifikasi disimpan per admin supaya status baca/hapus tidak saling
// mengganggu antar akun admin. `dedupe_key` mencegah notifikasi yang sama
// masuk berulang untuk admin yang sama.
db.exec(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        view TEXT NOT NULL DEFAULT 'dashboard',
        icon TEXT NOT NULL DEFAULT 'fa-solid fa-bell',
        tone TEXT NOT NULL DEFAULT 'sky',
        dedupe_key TEXT,
        read_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_admin_notifications_user
        ON admin_notifications(user_id, id DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_notifications_dedupe
        ON admin_notifications(user_id, dedupe_key)
        WHERE dedupe_key IS NOT NULL AND dedupe_key <> '';
`);

// ============================================================
// BADGE, TUGAS, PENGUMPULAN, PENGATURAN INSTANSI
// ============================================================
// Badge dan tugas di sini adalah fitur Admin (penghargaan & penugasan),
// terpisah dari tabel `tasks` yang menyimpan langkah materi kurikulum.
// Semua data disimpan di SQLite supaya tidak hilang saat browser dibersihkan.
db.exec(`
    CREATE TABLE IF NOT EXISTS admin_badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'fa-star',
        color TEXT NOT NULL DEFAULT 'sky' CHECK (color IN ('sky', 'indigo', 'emerald', 'amber', 'rose')),
        rule TEXT NOT NULL DEFAULT 'manual' CHECK (rule IN ('manual', 'tasks', 'points')),
        threshold INTEGER NOT NULL DEFAULT 0 CHECK (threshold >= 0),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_badges_name
        ON admin_badges(name COLLATE NOCASE);
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS admin_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        grade TEXT NOT NULL CHECK (grade IN ('SD', 'SMP', 'SMK')),
        type TEXT NOT NULL CHECK (type IN ('kode', 'proyek', 'kuis')),
        points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0 AND points <= 1000),
        due TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'terbit', 'ditutup')),
        badge_id INTEGER,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(badge_id) REFERENCES admin_badges(id) ON DELETE SET NULL,
        FOREIGN KEY(created_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_admin_tasks_status_grade
        ON admin_tasks(status, grade, id DESC);
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS admin_task_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        answer TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'dikumpulkan' CHECK (status IN ('dikumpulkan', 'revisi', 'dinilai')),
        score INTEGER CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
        feedback TEXT NOT NULL DEFAULT '',
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        graded_at DATETIME,
        UNIQUE(task_id, user_id),
        FOREIGN KEY(task_id) REFERENCES admin_tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_admin_task_submissions_task
        ON admin_task_submissions(task_id, status);
    CREATE INDEX IF NOT EXISTS idx_admin_task_submissions_user
        ON admin_task_submissions(user_id);
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS admin_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload_json TEXT NOT NULL DEFAULT '{}',
        updated_by INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(updated_by) REFERENCES users(id)
    );
`);

// Hak akses per peran (permission matrix): fitur mana yang bisa dipakai
// tiap peran. Disimpan agar perubahan dari Admin UI bersifat server-side.
db.exec(`
    CREATE TABLE IF NOT EXISTS admin_role_permissions (
        role TEXT PRIMARY KEY CHECK (role IN ('admin', 'instruktur', 'siswa', 'ortu')),
        permissions TEXT NOT NULL DEFAULT '[]',
        updated_by INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(updated_by) REFERENCES users(id)
    );
`);

// ============================================================
// PLUGIN REGISTRY (M4) — tidak menyajikan file karantina ke publik
// ============================================================
db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS plugins (
        plugin_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category_id TEXT NOT NULL,
        category_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'quarantine'
            CHECK (status IN ('quarantine', 'published', 'disabled')),
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS plugin_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_id TEXT NOT NULL UNIQUE,
        plugin_id TEXT NOT NULL,
        version TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'uploaded'
            CHECK (status IN ('uploaded','validating','rejected','needs_review','approved','published','disabled','rolled_back')),
        zip_sha256 TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        scan_report_json TEXT NOT NULL DEFAULT '{}',
        quarantine_path TEXT NOT NULL,
        live_path TEXT,
        uploaded_by INTEGER NOT NULL,
        reviewed_by INTEGER,
        reviewed_at DATETIME,
        published_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(plugin_id, version),
        FOREIGN KEY(plugin_id) REFERENCES plugins(plugin_id)
    );
    CREATE INDEX IF NOT EXISTS idx_plugin_versions_status ON plugin_versions(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_plugin_versions_plugin ON plugin_versions(plugin_id, created_at DESC);
`);


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

// ============================================================
// MIGRASI IDENTITAS: username -> users.id
// ============================================================
// Semua tabel anak memakai user_id sebagai FK. Username tetap unik untuk
// login/display, tetapi boleh berubah tanpa menyentuh progress/points/items.
function tableExists(table) {
    return Boolean(db.prepare(`
        SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
    `).get(table));
}

function tableColumns(table) {
    if (!tableExists(table)) return [];
    return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function migrateIdentityToUserId() {
    const tables = ["sessions", "progress", "points", "attempts", "user_items"];
    const legacyTables = tables.filter((table) => {
        const columns = tableColumns(table);
        return columns.includes("username");
    });

    // Database baru/ sudah termigrasi: tidak ada kolom username di tabel anak.
    if (legacyTables.length === 0) return false;

    for (const table of legacyTables) {
        const columns = tableColumns(table);
        if (!columns.includes("user_id")) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER`);
        }
        db.exec(`
            UPDATE ${table}
            SET user_id = (SELECT id FROM users WHERE users.username = ${table}.username)
            WHERE user_id IS NULL
        `);
    }

    // Sesi tanpa user valid tidak bisa dipakai lagi; hapus daripada menggagalkan boot.
    const orphanSessions = db.prepare("SELECT COUNT(*) AS total FROM sessions WHERE user_id IS NULL").get().total;
    if (orphanSessions) {
        db.prepare("DELETE FROM sessions WHERE user_id IS NULL").run();
        console.log(`Migrasi identitas: ${orphanSessions} sesi lama tanpa user dihapus.`);
    }

    for (const table of ["progress", "points", "attempts", "user_items"]) {
        const orphan = db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE user_id IS NULL`).get().total;
        if (orphan) {
            throw new Error(`Migrasi identitas dibatalkan: ${orphan} baris ${table} tidak punya user yang cocok.`);
        }
    }

    db.pragma("foreign_keys = OFF");
    try {
        const migrate = db.transaction(() => {
            if (legacyTables.includes("sessions")) {
                db.exec(`
                    CREATE TABLE sessions_new (
                        token_hash TEXT PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        expires_at DATETIME NOT NULL,
                        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                `);
                db.exec(`
                    INSERT INTO sessions_new (token_hash, user_id, created_at, expires_at)
                    SELECT token_hash, user_id, created_at, expires_at FROM sessions
                `);
                db.exec("DROP TABLE sessions");
                db.exec("ALTER TABLE sessions_new RENAME TO sessions");
            }

            if (legacyTables.includes("progress")) {
                db.exec(`
                    CREATE TABLE progress_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        task_id TEXT NOT NULL,
                        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
                        completed_at DATETIME,
                        bonus_awarded INTEGER NOT NULL DEFAULT 0 CHECK (bonus_awarded IN (0, 1)),
                        UNIQUE(user_id, task_id),
                        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY(task_id) REFERENCES tasks(task_id)
                    )
                `);
                db.exec(`
                    INSERT INTO progress_new (id, user_id, task_id, completed, completed_at, bonus_awarded)
                    SELECT id, user_id, task_id, completed, completed_at, bonus_awarded FROM progress
                `);
                db.exec("DROP TABLE progress");
                db.exec("ALTER TABLE progress_new RENAME TO progress");
            }

            if (legacyTables.includes("points")) {
                db.exec(`
                    CREATE TABLE points_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER UNIQUE NOT NULL,
                        total INTEGER NOT NULL DEFAULT 0
                            CHECK (total >= 0 AND typeof(total) = 'integer'),
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                `);
                db.exec(`
                    INSERT INTO points_new (id, user_id, total, updated_at)
                    SELECT id, user_id, total, updated_at FROM points
                `);
                db.exec("DROP TABLE points");
                db.exec("ALTER TABLE points_new RENAME TO points");
            }

            if (legacyTables.includes("attempts")) {
                db.exec(`
                    CREATE TABLE attempts_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        task_id TEXT NOT NULL,
                        fails INTEGER NOT NULL DEFAULT 0 CHECK (fails >= 0),
                        time_spent INTEGER NOT NULL DEFAULT 0 CHECK (time_spent >= 0),
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(user_id, task_id),
                        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY(task_id) REFERENCES tasks(task_id)
                    )
                `);
                db.exec(`
                    INSERT INTO attempts_new (id, user_id, task_id, fails, time_spent, updated_at)
                    SELECT id, user_id, task_id, fails, time_spent, updated_at FROM attempts
                `);
                db.exec("DROP TABLE attempts");
                db.exec("ALTER TABLE attempts_new RENAME TO attempts");
            }

            if (legacyTables.includes("user_items")) {
                db.exec(`
                    CREATE TABLE user_items_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        item_id TEXT NOT NULL,
                        jenis TEXT NOT NULL CHECK (jenis IN ('bingkai', 'gelar')),
                        harga INTEGER NOT NULL CHECK (harga >= 0),
                        purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(user_id, item_id),
                        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                `);
                db.exec(`
                    INSERT INTO user_items_new (id, user_id, item_id, jenis, harga, purchased_at)
                    SELECT id, user_id, item_id, jenis, harga, purchased_at FROM user_items
                `);
                db.exec("DROP TABLE user_items");
                db.exec("ALTER TABLE user_items_new RENAME TO user_items");
            }
        });
        migrate();

        const violations = db.pragma("foreign_key_check");
        if (violations.length) {
            throw new Error("Migrasi identitas gagal foreign key check: " + JSON.stringify(violations));
        }
    } finally {
        db.pragma("foreign_keys = ON");
    }

    console.log("Migrasi identitas user -> users.id berhasil.");
    return true;
}

migrateIdentityToUserId();

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_progress_task ON progress(task_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_user_updated ON attempts(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_items_user ON user_items(user_id);
`);

console.log("Database berhasil terhubung.");
console.log("Lokasi database:", dbPath);

module.exports = db;