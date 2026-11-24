"use strict";

// ------------------------------------------------------------
// MIGRASI SKEMA BERVERSI
//
// Sebelumnya semua perubahan skema ditulis berurutan di database.js dengan
// pola "CREATE TABLE IF NOT EXISTS + PRAGMA table_info + ALTER TABLE".
// Pola itu tetap dipakai untuk bootstrap, tetapi perubahan BERIKUTNYA
// sebaiknya lewat folder migrations/ supaya:
//   - urutan jelas (nama file bernomor),
//   - ada catatan kapan sebuah migrasi diterapkan,
//   - file yang sudah diterapkan tidak diam-diam berubah (checksum).
//
// Baseline: database lama yang sudah punya tabel `users` dicatat sebagai
// `0000_baseline` supaya migrasi 0001 ke atas tidak mencoba membuat ulang
// skema yang sudah ada.
//
// Setiap file migrasi mengekspor `up(db)`. Jangan memulai transaksi sendiri:
// runner sudah membungkus tiap migrasi dalam satu transaksi.
// ------------------------------------------------------------

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_DIR = path.join(__dirname, "migrations");
const BASELINE_VERSION = "0000_baseline";
const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.js$/;

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function appliedMap(db) {
  const map = new Map();
  for (const row of db.prepare("SELECT version, name, checksum FROM schema_migrations").all()) {
    map.set(row.version, row);
  }
  return map;
}

function hasCoreSchema(db) {
  const row = db.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'users'"
  ).get();
  return Boolean(row);
}

function checksumOf(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function listMigrations(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => FILE_PATTERN.test(name))
    .sort()
    .map((name) => ({
      version: name.slice(0, -3),
      name,
      file: path.join(dir, name)
    }));
}

// Menjalankan migrasi yang belum tercatat. Aman dipanggil berulang.
// options.dir       folder migrasi (default backend/migrations)
// options.logger    default console
// options.baseline  false untuk melewati pencatatan baseline (dipakai tes)
function runMigrations(db, options = {}) {
  const dir = options.dir || DEFAULT_DIR;
  const logger = options.logger || console;
  const allowBaseline = options.baseline !== false;
  const result = { applied: [], baseline: false, warnings: [] };

  ensureTable(db);

  let applied = appliedMap(db);
  if (applied.size === 0 && allowBaseline && hasCoreSchema(db)) {
    db.prepare(
      "INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)"
    ).run(BASELINE_VERSION, "baseline", null);
    result.baseline = true;
    logger.log("[MIGRASI] Baseline skema lama dicatat.");
    applied = appliedMap(db);
  }

  const files = listMigrations(dir);
  if (!files.length) return result;

  const known = new Set(files.map((m) => m.version));
  for (const version of applied.keys()) {
    if (version === BASELINE_VERSION) continue;
    if (!known.has(version)) {
      const warning = `Migrasi ${version} tercatat tetapi filenya tidak ada di ${dir}.`;
      result.warnings.push(warning);
      logger.warn("[MIGRASI] " + warning);
    }
  }

  for (const migration of files) {
    const checksum = checksumOf(migration.file);
    const row = applied.get(migration.version);

    if (row) {
      if (row.checksum && row.checksum !== checksum) {
        const warning = `Migrasi ${migration.version} sudah diterapkan tetapi isinya berubah.`;
        result.warnings.push(warning);
        logger.warn("[MIGRASI] " + warning + " Jangan ubah migrasi yang sudah jalan; buat migrasi baru.");
      }
      continue;
    }

    let mod;
    try {
      mod = require(migration.file);
    } catch (error) {
      throw new Error(`Migrasi ${migration.version} gagal dimuat: ${error.message}`);
    }
    if (!mod || typeof mod.up !== "function") {
      throw new Error(`Migrasi ${migration.version} tidak mengekspor fungsi up(db).`);
    }

    const apply = db.transaction(() => {
      mod.up(db);
      db.prepare(
        "INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)"
      ).run(migration.version, migration.name, checksum);
    });

    try {
      apply();
    } catch (error) {
      throw new Error(`Migrasi ${migration.version} gagal: ${error.message}`);
    }

    result.applied.push(migration.version);
    logger.log(`[MIGRASI] ${migration.version} diterapkan.`);
  }

  return result;
}

module.exports = {
  BASELINE_VERSION,
  DEFAULT_DIR,
  runMigrations,
  listMigrations
};
