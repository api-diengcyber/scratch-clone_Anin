"use strict";

// ------------------------------------------------------------
// DATABASE MAINTENANCE WORKER
//
// Melakukan pemeliharaan rutin SQLite di latar belakang:
// 1. WAL Checkpoint (TRUNCATE) untuk mencegah berkas -wal membengkak.
// 2. Backup terverifikasi otomatis berkala ke folder BACKUP_DIR.
// 3. Purge data sementara/lama yang kedaluwarsa.
// ------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// Menjalankan checkpoint WAL secara aman
function checkpointWal(db) {
  try {
    // PRAGMA wal_checkpoint(TRUNCATE) mengembalikan { busy, log, checkpointed }
    const result = db.pragma("wal_checkpoint(TRUNCATE)");
    return {
      ok: true,
      result: Array.isArray(result) && result[0] ? result[0] : result
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message
    };
  }
}

// Menjalankan backup otomatis dari instance db yang aktif
async function createAutomatedBackup(db, options = {}) {
  const dbPath = process.env.DB_PATH || path.join(__dirname, "database.sqlite");
  if (dbPath === ":memory:") {
    return { skipped: true, reason: "in-memory database" };
  }

  const backupDir = options.backupDir || process.env.BACKUP_DIR || path.join(__dirname, "backups");
  const keep = Math.max(1, Number.parseInt(options.keep || process.env.BACKUP_KEEP || "7", 10) || 7);
  const verify = options.verify !== undefined
    ? Boolean(options.verify)
    : String(process.env.BACKUP_VERIFY || "true").trim().toLowerCase() !== "false";

  try {
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const destination = path.join(backupDir, `database-${stamp}.sqlite`);

    // Backup via SQLite online backup API
    await db.backup(destination);
    const size = fs.statSync(destination).size;

    // Verifikasi integritas
    if (verify) {
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
      } catch (err) {
        try { fs.unlinkSync(destination); } catch (_) {}
        throw new Error(`Backup verifikasi gagal: ${err.message}`);
      } finally {
        check.close();
      }
    }

    // Rotasi backup lama
    const backups = fs.readdirSync(backupDir)
      .filter((name) => /^database-.*\.sqlite$/.test(name))
      .map((name) => ({
        name,
        mtime: fs.statSync(path.join(backupDir, name)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime);

    let pruned = 0;
    for (const old of backups.slice(keep)) {
      try {
        fs.unlinkSync(path.join(backupDir, old.name));
        pruned++;
      } catch (_) {}
    }

    return {
      ok: true,
      destination,
      size,
      pruned
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message
    };
  }
}

// Inisialisasi maintenance scheduler
function startMaintenanceScheduler(db, options = {}) {
  // Flag enable / disable (default aktif)
  const enabled = options.enabled !== undefined
    ? Boolean(options.enabled)
    : String(process.env.DB_MAINTENANCE_ENABLED || "true").trim().toLowerCase() !== "false";

  if (!enabled) {
    return null;
  }

  // Interval checkpoint WAL (default setiap 6 jam)
  const walIntervalMs = Math.max(
    60 * 1000,
    Number.parseInt(options.walIntervalMs || process.env.DB_WAL_INTERVAL_MS || String(6 * 60 * 60 * 1000), 10)
  );

  // Interval automated backup (default setiap 24 jam)
  const backupIntervalMs = Math.max(
    60 * 1000,
    Number.parseInt(options.backupIntervalMs || process.env.DB_BACKUP_INTERVAL_MS || String(24 * 60 * 60 * 1000), 10)
  );

  const walTimer = setInterval(() => {
    const res = checkpointWal(db);
    if (!res.ok) {
      console.error("[MAINTENANCE] Gagal checkpoint WAL:", res.error);
    }
  }, walIntervalMs).unref();

  const backupTimer = setInterval(async () => {
    try {
      const res = await createAutomatedBackup(db);
      if (res.ok) {
        console.log(`[MAINTENANCE] Backup otomatis berhasil: ${path.basename(res.destination)} (${(res.size / 1024).toFixed(1)} KB)`);
      } else if (!res.skipped) {
        console.error("[MAINTENANCE] Backup otomatis gagal:", res.error);
      }
    } catch (e) {
      console.error("[MAINTENANCE] Exception backup otomatis:", e.message);
    }
  }, backupIntervalMs).unref();

  return {
    walTimer,
    backupTimer,
    stop() {
      clearInterval(walTimer);
      clearInterval(backupTimer);
    }
  };
}

module.exports = {
  checkpointWal,
  createAutomatedBackup,
  startMaintenanceScheduler
};
