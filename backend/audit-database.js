const db = require("./database");

console.log("=== PROGRESS ===");

console.table(
    db.prepare(`
        SELECT username, task_id, completed
        FROM progress
        ORDER BY username, task_id
    `).all()
);

console.log("=== TASK COUNT ===");

console.table(
    db.prepare(`
        SELECT grade, COUNT(*) AS total
        FROM tasks
        GROUP BY grade
        ORDER BY grade
    `).all()
);

db.close();