// Hitung ulang points.total dari progress aktif setelah migrasi identitas users.id.
// Rumus: SUM(tasks.points untuk task selesai) + FIRST_TRY_BONUS per task selesai
// yang memiliki bonus_awarded=1. Script ini aman dijalankan berulang.
// Jalankan: npm run backfill:points
"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const db = require("./database");

const BONUS = (() => {
  const value = Number(process.env.FIRST_TRY_BONUS);
  return Number.isSafeInteger(value) && value >= 0 ? value : 5;
})();

const userIds = db.prepare(`
  SELECT user_id FROM progress
  UNION
  SELECT user_id FROM points
`).all().map((row) => Number(row.user_id));

const current = db.prepare(`
  SELECT total FROM points WHERE user_id = ?
`);
const calculate = db.prepare(`
  SELECT
    COALESCE(SUM(CASE WHEN p.completed = 1 THEN t.points ELSE 0 END), 0) AS base_points,
    COALESCE(SUM(CASE WHEN p.completed = 1 AND p.bonus_awarded = 1 THEN 1 ELSE 0 END), 0) AS bonus_count
  FROM progress p
  JOIN tasks t ON t.task_id = p.task_id
  WHERE p.user_id = ?
`);
const upsert = db.prepare(`
  INSERT INTO points (user_id, total, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET
    total = excluded.total,
    updated_at = CURRENT_TIMESTAMP
`);
const nameOf = db.prepare("SELECT username FROM users WHERE id = ?");

let changed = 0;
const report = [];
const fixMany = db.transaction((items) => {
  for (const item of items) upsert.run(item.userId, item.expected);
});
const fixes = [];

for (const userId of userIds) {
  const row = calculate.get(userId);
  const expected = Math.max(0,
    Number(row.base_points || 0) + Number(row.bonus_count || 0) * BONUS
  );
  const existing = current.get(userId);
  const actual = existing ? Number(existing.total) : null;
  if (actual !== expected) {
    fixes.push({ userId, expected });
    report.push({
      userId,
      username: (nameOf.get(userId) || {}).username || "(user tidak ditemukan)",
      before: actual,
      after: expected
    });
    changed += 1;
  }
}

if (fixes.length) fixMany(fixes);
console.log(`Backfill points selesai (bonus=${BONUS}): ${changed}/${userIds.length} user dikoreksi.`);
if (report.length) console.table(report);
else console.log("Tidak ada perbedaan points.");

db.close();
