"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const db = require("./database");

console.log("=== PROGRESS ===");
console.table(db.prepare(`
  SELECT p.user_id, u.username, p.task_id, p.completed, p.completed_at, p.bonus_awarded
  FROM progress p
  LEFT JOIN users u ON u.id = p.user_id
  ORDER BY p.user_id, p.task_id
`).all());

console.log("=== TASK COUNT ===");
console.table(db.prepare(`
  SELECT grade, COUNT(*) AS total
  FROM tasks
  GROUP BY grade
  ORDER BY grade
`).all());

console.log("=== RINGKASAN PROGRESS PER SISWA ===");
console.table(db.prepare(`
  SELECT u.id AS user_id, u.username,
         COUNT(p.id) AS tracked_tasks,
         SUM(CASE WHEN p.completed = 1 THEN 1 ELSE 0 END) AS completed_tasks
  FROM users u
  LEFT JOIN progress p ON p.user_id = u.id
  WHERE u.role = 'student'
  GROUP BY u.id, u.username
  ORDER BY u.username
`).all());

db.close();
