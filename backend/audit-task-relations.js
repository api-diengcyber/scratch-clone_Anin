"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const db = require("./database");

console.log("\n=== ID TASK YANG MUNCUL DI BEBERAPA JENJANG ===");
console.table(db.prepare(`
  SELECT task_id, COUNT(DISTINCT grade) AS jumlah_jenjang,
         GROUP_CONCAT(DISTINCT grade) AS jenjang
  FROM tasks
  GROUP BY task_id
  HAVING COUNT(DISTINCT grade) > 1
  ORDER BY task_id
`).all());

console.log("\n=== KECOCOKAN PROGRESS DENGAN TASK ===");
console.table(db.prepare(`
  SELECT p.user_id, u.username, p.task_id,
         COUNT(t.id) AS jumlah_task_cocok,
         GROUP_CONCAT(DISTINCT t.grade) AS jenjang
  FROM progress p
  LEFT JOIN users u ON u.id = p.user_id
  LEFT JOIN tasks t ON t.task_id = p.task_id
  GROUP BY p.user_id, u.username, p.task_id
  ORDER BY p.user_id, p.task_id
`).all());

db.close();
