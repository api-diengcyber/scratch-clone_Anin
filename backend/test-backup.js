// backend/test-backup.js
// Memastikan backup.sqlite benar-benar bisa dibuka, lolos integrity_check,
// dan retensi BACKUP_KEEP bekerja.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const Database = require("better-sqlite3");

const results = [];
function t(name, fn) {
  try { fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + " — " + e.message]); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: dapat ${JSON.stringify(a)}, harap ${JSON.stringify(b)}`); }
function ok(v, msg) { if (!v) throw new Error(msg); }

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "dcc-backup-"));
const dbPath = path.join(workDir, "source.sqlite");
const backupDir = path.join(workDir, "backups");

function makeSource() {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE siswa (id INTEGER PRIMARY KEY, nama TEXT NOT NULL)");
    db.prepare("INSERT INTO siswa (nama) VALUES (?)").run("Budi");
  } finally { db.close(); }
}

function runBackup() {
  return spawnSync(process.execPath, ["backup.js"], {
    cwd: __dirname,
    env: { ...process.env, DB_PATH: dbPath, BACKUP_DIR: backupDir, BACKUP_KEEP: "2", BACKUP_VERIFY: "true" },
    encoding: "utf8"
  });
}

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir).filter((name) => /^database-.*\.sqlite$/.test(name));
}

makeSource();

t("backup: berhasil dan terverifikasi", () => {
  const result = runBackup();
  eq(result.status, 0, "exit code (stderr: " + (result.stderr || "").trim() + ")");
  ok(result.stdout.includes("Backup diverifikasi"), "log verifikasi");
  const files = listBackups();
  eq(files.length, 1, "satu file backup");
});

t("backup: isi bisa dibuka dan datanya utuh", () => {
  const files = listBackups();
  const latest = files.sort().pop();
  const db = new Database(path.join(backupDir, latest), { readonly: true, fileMustExist: true });
  try {
    eq(String(db.pragma("integrity_check", { simple: true })).toLowerCase(), "ok", "integrity_check");
    eq(db.prepare("SELECT nama FROM siswa").get().nama, "Budi", "baris tersalin");
  } finally { db.close(); }
});

t("backup: retensi BACKUP_KEEP=2", () => {
  runBackup();
  runBackup();
  const files = listBackups();
  eq(files.length, 2, "hanya dua backup tersimpan");
});

fs.rmSync(workDir, { recursive: true, force: true });

const fails = results.filter((r) => r[0] === "FAIL");
console.log("");
for (const [st, nm] of results) console.log(`${st}  ${nm}`);
console.log(`\n${results.length - fails.length}/${results.length} lolos`);
process.exit(fails.length ? 1 : 0);
