const db = require("./database");

console.log("\n=== ID TASK YANG MUNCUL DI BEBERAPA JENJANG ===");

const duplicates = db.prepare(`
    SELECT
        task_id,
        COUNT(DISTINCT grade) AS jumlah_jenjang,
        GROUP_CONCAT(DISTINCT grade) AS jenjang
    FROM tasks
    GROUP BY task_id
    HAVING COUNT(DISTINCT grade) > 1
    ORDER BY task_id
`).all();

console.table(duplicates);

console.log("\n=== KECOCOKAN PROGRESS DENGAN TASK ===");

const progressAudit = db.prepare(`
    SELECT
        p.username,
        p.task_id,
        COUNT(t.id) AS jumlah_task_cocok,
        GROUP_CONCAT(DISTINCT t.grade) AS jenjang
    FROM progress p
    LEFT JOIN tasks t
        ON t.task_id = p.task_id
    GROUP BY p.username, p.task_id
    ORDER BY p.username, p.task_id
`).all();

console.table(progressAudit);

db.close();