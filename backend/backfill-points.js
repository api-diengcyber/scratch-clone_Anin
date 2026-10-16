// backend/backfill-points.js — hitung ulang points.total dari progress.
// Rumus: SUM(tasks.points task selesai) + FIRST_TRY_BONUS x (selesai & bonus_awarded).
// Satu-kali (deploy fase bonus). Hormati DB_PATH bila di-set.
// Jalankan: node backend/backfill-points.js
const db = require("./database");

const BONUS = (() => {
    const v = Number(process.env.FIRST_TRY_BONUS);
    return Number.isSafeInteger(v) && v >= 0 ? v : 5;
})();

const users = db.prepare(`
    SELECT DISTINCT username FROM progress
    UNION
    SELECT DISTINCT username FROM points
`).all().map((r) => r.username);

let changed = 0;
const report = [];
const fix = db.transaction((username, total) => {
    db.prepare(`INSERT INTO points (username, total, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(username) DO UPDATE SET total = excluded.total, updated_at = CURRENT_TIMESTAMP`).run(username, total);
});

for (const username of users) {
    const row = db.prepare(`
        SELECT COALESCE(SUM(CASE WHEN p.completed = 1 THEN t.points ELSE 0 END), 0) AS base,
               COALESCE(SUM(CASE WHEN p.completed = 1 AND p.bonus_awarded = 1 THEN 1 ELSE 0 END), 0) AS nbonus
        FROM progress p JOIN tasks t ON t.task_id = p.task_id
        WHERE p.username = ?
    `).get(username);
    const want = (row ? row.base : 0) + (row ? row.nbonus : 0) * BONUS;
    const cur = db.prepare("SELECT total FROM points WHERE username = ?").get(username);
    const have = cur ? cur.total : null;
    if (have !== want) {
        fix(username, want);
        changed++;
        report.push({ username, lama: have, baru: want });
    }
}

console.log(`Backfill selesai (bonus=${BONUS}): ${changed}/${users.length} user dikoreksi.`);
if (report.length) console.table(report);
db.close();
