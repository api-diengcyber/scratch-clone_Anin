#!/usr/bin/env node
// Backup konsisten SQLite (aman walau server sedang jalan).
//   npm run backup
//   BACKUP_DIR=/data/backups BACKUP_KEEP=7 npm run backup

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.DB_PATH || path.join(__dirname, "database.sqlite");
const backupDir = process.env.BACKUP_DIR || path.join(__dirname, "backups");
const keep = Math.max(1, Number.parseInt(process.env.BACKUP_KEEP || "7", 10) || 7);

if (!fs.existsSync(dbPath)) {
    console.error(`Database tidak ditemukan: ${dbPath}`);
    process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.join(backupDir, `database-${stamp}.sqlite`);

(async () => {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
        await db.backup(destination);
        const size = fs.statSync(destination).size;
        console.log(`Backup dibuat: ${destination} (${(size / 1024).toFixed(1)} KB)`);
    } finally {
        db.close();
    }

    const backups = fs.readdirSync(backupDir)
        .filter((name) => /^database-.*\.sqlite$/.test(name))
        .map((name) => ({
            name,
            mtime: fs.statSync(path.join(backupDir, name)).mtimeMs
        }))
        .sort((a, b) => b.mtime - a.mtime);

    for (const old of backups.slice(keep)) {
        fs.unlinkSync(path.join(backupDir, old.name));
        console.log(`Backup lama dihapus: ${old.name}`);
    }
})().catch((err) => {
    console.error("Backup gagal:", err.message);
    process.exit(1);
});
