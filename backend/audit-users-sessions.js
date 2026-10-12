const db = require("./database");

console.log("\n=== KOLOM USERS ===");
console.table(
    db.prepare("PRAGMA table_info(users)").all()
);

console.log("\n=== DATA USERS ===");
// Jangan tampilkan password_hash atau password_salt.
console.table(
    db.prepare(`
        SELECT username, created_at
        FROM users
        ORDER BY username
    `).all()
);

console.log("\n=== KOLOM SESSIONS ===");
console.table(
    db.prepare("PRAGMA table_info(sessions)").all()
);

console.log("\n=== FOREIGN KEY SESSIONS ===");
console.table(
    db.prepare("PRAGMA foreign_key_list(sessions)").all()
);

console.log("\n=== RINGKASAN SESSION ===");
console.table(
    db.prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(
                CASE
                    WHEN datetime(expires_at) > datetime('now')
                    THEN 1 ELSE 0
                END
            ) AS active,
            SUM(
                CASE
                    WHEN datetime(expires_at) <= datetime('now')
                    THEN 1 ELSE 0
                END
            ) AS expired
        FROM sessions
    `).all()
);

console.log("\n=== SESSION TANPA USER ===");
console.table(
    db.prepare(`
        SELECT s.username
        FROM sessions s
        LEFT JOIN users u ON u.username = s.username
        WHERE u.username IS NULL
    `).all()
);

console.log("\n=== FOREIGN KEY CHECK ===");
console.table(db.pragma("foreign_key_check"));

db.close();