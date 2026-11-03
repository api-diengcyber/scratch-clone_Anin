"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const db = require("./database");

console.log("\n=== SCHEMA PROGRESS ===");
const schema = db.prepare(`
  SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'progress'
`).get();
console.log(schema?.sql || "Tabel progress tidak ditemukan.");

console.log("\n=== DATA PROGRESS ===");
console.table(db.prepare(`
  SELECT p.id, p.user_id, u.username, p.task_id, p.completed,
         p.completed_at, p.bonus_awarded
  FROM progress p
  LEFT JOIN users u ON u.id = p.user_id
  ORDER BY p.user_id, p.task_id
`).all());

console.log("\n=== PROGRESS TIDAK VALID ===");
console.table(db.prepare(`
  SELECT p.user_id, u.username, p.task_id, p.completed, p.bonus_awarded
  FROM progress p
  LEFT JOIN users u ON u.id = p.user_id
  WHERE p.completed NOT IN (0, 1)
     OR typeof(p.completed) <> 'integer'
     OR p.bonus_awarded NOT IN (0, 1)
     OR typeof(p.bonus_awarded) <> 'integer'
`).all());

console.log("\n=== TASK YANG TIDAK DITEMUKAN ===");
console.table(db.prepare(`
  SELECT p.user_id, u.username, p.task_id
  FROM progress p
  LEFT JOIN users u ON u.id = p.user_id
  LEFT JOIN tasks t ON t.task_id = p.task_id
  WHERE t.id IS NULL
`).all());

console.log("\n=== FOREIGN KEY CHECK ===");
console.table(db.pragma("foreign_key_check"));
db.close();
