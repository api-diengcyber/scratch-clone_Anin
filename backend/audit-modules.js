const db = require("./database");

console.log("\n=== JUMLAH MODUL PER JENJANG ===");

console.table(
    db.prepare(`
        SELECT grade, COUNT(*) AS total
        FROM modules
        GROUP BY grade
        ORDER BY grade
    `).all()
);

console.log("\n=== TOTAL MODUL ===");

console.log(
    db.prepare(`
        SELECT COUNT(*) AS total
        FROM modules
    `).get()
);

console.log("\n=== MODUL TANPA TASK ===");

console.table(
    db.prepare(`
        SELECT m.grade, m.module_id
        FROM modules m
        LEFT JOIN tasks t
          ON t.grade = m.grade
         AND t.module_id = m.module_id
        WHERE t.id IS NULL
        ORDER BY m.grade, m.module_id
    `).all()
);

db.close();