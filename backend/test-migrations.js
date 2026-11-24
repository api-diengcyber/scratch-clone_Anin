// backend/test-migrations.js
// Menguji runner migrasi (folder sementara) dan bootstrap database asli:
// baseline tercatat, migrasi 0001 diterapkan, dan WAL aktif.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");
const { runMigrations } = require("./migrations");

const results = [];
async function t(name, fn) {
  try { await fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + " — " + e.message]); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: dapat ${JSON.stringify(a)}, harap ${JSON.stringify(b)}`); }
function ok(v, msg) { if (!v) throw new Error(msg); }

const silent = { log() {}, warn() {}, error() {} };
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dcc-migrations-"));

function writeMigration(name, body) {
  fs.writeFileSync(path.join(tmpDir, name), body, "utf8");
}

(async () => {
  await t("runner: menerapkan migrasi berurutan", async () => {
    writeMigration("0001_alpha.js", `
      module.exports.up = (db) => {
        db.exec("CREATE TABLE alpha (id INTEGER PRIMARY KEY, name TEXT)");
        db.prepare("INSERT INTO alpha (name) VALUES (?)").run("satu");
      };
    `);
    writeMigration("0002_beta.js", `
      module.exports.up = (db) => {
        db.exec("ALTER TABLE alpha ADD COLUMN extra TEXT");
      };
    `);

    const db = new Database(":memory:");
    try {
      const result = runMigrations(db, { dir: tmpDir, logger: silent, baseline: false });
      eq(result.applied.join(","), "0001_alpha,0002_beta", "urutan migrasi");
      eq(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n, 2, "jumlah tercatat");
      eq(db.prepare("SELECT name FROM alpha").get().name, "satu", "data migrasi");
      ok(db.prepare("PRAGMA table_info(alpha)").all().some((c) => c.name === "extra"), "kolom migrasi kedua");
    } finally { db.close(); }
  });

  await t("runner: idempoten saat dijalankan ulang", async () => {
    const db = new Database(":memory:");
    try {
      const first = runMigrations(db, { dir: tmpDir, logger: silent, baseline: false });
      eq(first.applied.length, 2, "run pertama");
      const second = runMigrations(db, { dir: tmpDir, logger: silent, baseline: false });
      eq(second.applied.length, 0, "run kedua tidak mengulang");
      eq(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n, 2, "tetap dua");
    } finally { db.close(); }
  });

  await t("runner: memperingatkan file migrasi yang berubah", async () => {
    // Pakai SATU database yang sama: jalankan dulu, baru ubah file, lalu
    // jalankan ulang. Kalau DB baru, migrasi memang wajar diterapkan lagi.
    const db = new Database(":memory:");
    try {
      const first = runMigrations(db, { dir: tmpDir, logger: silent, baseline: false });
      eq(first.applied.length, 2, "run pertama menerapkan dua migrasi");
      eq(first.warnings.length, 0, "run pertama tanpa peringatan");

      writeMigration("0001_alpha.js", `
        module.exports.up = (db) => {
          db.exec("CREATE TABLE alpha (id INTEGER PRIMARY KEY, name TEXT)");
          db.prepare("INSERT INTO alpha (name) VALUES (?)").run("satu");
        };
        // komentar baru mengubah checksum
      `);

      const result = runMigrations(db, { dir: tmpDir, logger: silent, baseline: false });
      eq(result.applied.length, 0, "tidak menerapkan ulang");
      eq(result.warnings.length, 1, "satu peringatan checksum");
      ok(result.warnings[0].includes("0001_alpha"), "peringatan menyebut versi");
    } finally { db.close(); }
  });

  await t("bootstrap: baseline + migrasi 0001 + WAL", async () => {
    const dbFile = path.join(os.tmpdir(), `dcc-migrations-boot-${process.pid}.sqlite`);
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.unlinkSync(dbFile + suffix); } catch (e) {}
    }
    const previous = process.env.DB_PATH;
    process.env.DB_PATH = dbFile;
    let db;
    try {
      db = require("./database");
      const mode = String(db.pragma("journal_mode", { simple: true })).toLowerCase();
      eq(mode, "wal", "journal_mode WAL");

      const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((r) => r.version);
      ok(versions.includes("0000_baseline"), "baseline tercatat");
      ok(versions.includes("0001_query_indexes"), "migrasi 0001 diterapkan");

      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((r) => r.name);
      ok(indexes.includes("idx_subscription_payments_expires"), "index invoice kedaluwarsa");
      ok(indexes.includes("idx_users_subscription_active"), "index pengingat langganan");
      ok(indexes.includes("idx_sessions_last_seen"), "index sesi idle");
    } finally {
      if (db) db.close();
      process.env.DB_PATH = previous;
      for (const suffix of ["", "-wal", "-shm"]) {
        try { fs.unlinkSync(dbFile + suffix); } catch (e) {}
      }
    }
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });

  const fails = results.filter((r) => r[0] === "FAIL");
  console.log("");
  for (const [st, nm] of results) console.log(`${st}  ${nm}`);
  console.log(`\n${results.length - fails.length}/${results.length} lolos`);
  process.exit(fails.length ? 1 : 0);
})().catch((error) => {
  console.error("FATAL:", error.message);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(2);
});
