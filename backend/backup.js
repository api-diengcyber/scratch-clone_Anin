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

    // Verifikasi hasil backup, bukan hanya ukurannya. Backup yang rusak lebih
    // berbahaya daripada tidak punya backup karena memberi rasa aman palsu.
    if (String(process.env.BACKUP_VERIFY || "true").trim().toLowerCase() !== "false") {
        const check = new Database(destination, { readonly: true, fileMustExist: true });
        try {
            const integrity = String(check.pragma("integrity_check", { simple: true }) || "");
            if (integrity.toLowerCase() !== "ok") {
                throw new Error(`integrity_check gagal: ${integrity}`);
            }
            const violations = check.pragma("foreign_key_check");
            if (violations.length) {
                throw new Error(`foreign_key_check menemukan ${violations.length} pelanggaran`);
            }
            console.log("Backup diverifikasi: integrity_check ok, foreign_key_check bersih.");
        } catch (error) {
            try { fs.unlinkSync(destination); } catch (_) {}
            throw new Error(`Backup tidak valid dan dihapus: ${error.message}`);
        } finally {
            check.close();
        }
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
