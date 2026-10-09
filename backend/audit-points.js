const db = require("./database");

console.log("\n=== FOREIGN KEY POINTS ===");

console.table(
    db.prepare("PRAGMA foreign_key_list(points)").all()
);

console.log("\n=== DATA POINTS ===");

console.table(
    db.prepare(`
        SELECT username, total, updated_at
        FROM points
        ORDER BY username
    `).all()
);

console.log("\n=== TOTAL POINTS TIDAK VALID ===");

console.table(
    db.prepare(`
        SELECT username, total
        FROM points
        WHERE total < 0
    `).all()
);

console.log("\n=== FOREIGN KEY CHECK ===");

console.table(
    db.pragma("foreign_key_check")
);

db.close();