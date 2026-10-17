const db = require("./database");

console.log("\n=== SCHEMA PROGRESS ===");

const schema = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'progress'
`).get();

console.log(schema?.sql || "Tabel progress tidak ditemukan.");

console.log("\n=== DATA PROGRESS ===");

console.table(
    db.prepare(`
        SELECT username, task_id, completed, completed_at
        FROM progress
        ORDER BY username, task_id
    `).all()
);

console.log("\n=== NILAI COMPLETED TIDAK VALID ===");

console.table(
    db.prepare(`
        SELECT username, task_id, completed
        FROM progress
        WHERE completed NOT IN (0, 1)
           OR typeof(completed) <> 'integer'
    `).all()
);

console.log("\n=== FOREIGN KEY CHECK ===");
console.table(db.pragma("foreign_key_check"));

db.close();