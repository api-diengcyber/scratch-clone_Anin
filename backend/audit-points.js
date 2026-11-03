"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const db = require("./database");

console.log("\n=== POINTS PER USER ===");
console.table(db.prepare(`
  SELECT p.user_id, u.username, p.total, p.updated_at
  FROM points p
  LEFT JOIN users u ON u.id = p.user_id
  ORDER BY p.user_id
`).all());

console.log("\n=== TOTAL POINTS TIDAK VALID ===");
console.table(db.prepare(`
  SELECT p.user_id, u.username, p.total, typeof(p.total) AS value_type
  FROM points p
  LEFT JOIN users u ON u.id = p.user_id
  WHERE p.total < 0 OR typeof(p.total) <> 'integer'
`).all());

console.log("\n=== PERBANDINGAN DENGAN PROGRESS AKTIF ===");
const bonusRaw = Number(process.env.FIRST_TRY_BONUS);
const bonus = Number.isSafeInteger(bonusRaw) && bonusRaw >= 0 ? bonusRaw : 5;
console.table(db.prepare(`
  SELECT
    u.id AS user_id,
    u.username,
    COALESCE(p.total, 0) AS stored_total,
    COALESCE(SUM(CASE WHEN pr.completed = 1 THEN t.points ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN pr.completed = 1 AND pr.bonus_awarded = 1 THEN ? ELSE 0 END), 0) AS expected_total
  FROM users u
  LEFT JOIN points p ON p.user_id = u.id
  LEFT JOIN progress pr ON pr.user_id = u.id
  LEFT JOIN tasks t ON t.task_id = pr.task_id
  GROUP BY u.id, u.username, p.total
  HAVING stored_total <> expected_total
`).all(bonus));

console.log("\n=== FOREIGN KEY CHECK ===");
console.table(db.pragma("foreign_key_check"));
db.close();
