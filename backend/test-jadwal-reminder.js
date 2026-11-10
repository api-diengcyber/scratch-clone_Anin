"use strict";
// Uji otomatis: node test-jadwal-reminder.js
// Memakai better-sqlite3 (seperti server) bila terpasang; kalau tidak, SQLite bawaan Node 22+.
const assert = require("node:assert/strict");
let db;
try { const Database = require("better-sqlite3"); db = new Database(":memory:"); }
catch (e) { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(":memory:"); }
db.exec("PRAGMA foreign_keys = ON");

// Skema dipakai sama persis dengan database.js (kolom users disederhanakan).
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, full_name TEXT, role TEXT NOT NULL DEFAULT 'student',
                      status TEXT NOT NULL DEFAULT 'active', allowed_grades TEXT);
  CREATE TABLE student_guardians (
      id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id INTEGER NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'wali' CHECK (relation IN ('ayah', 'ibu', 'wali', 'lainnya')),
      created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_user_id, email), FOREIGN KEY(student_user_id) REFERENCES users(id) ON DELETE CASCADE);
  CREATE TABLE mentoring_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      judul TEXT NOT NULL CHECK (length(trim(judul)) BETWEEN 1 AND 120),
      jenis TEXT NOT NULL DEFAULT 'Live Mentoring', level TEXT, mentor TEXT, keterangan TEXT,
      tanggal TEXT NOT NULL CHECK (tanggal GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      mulai TEXT NOT NULL CHECK (mulai GLOB '[0-9][0-9]:[0-9][0-9]'),
      selesai TEXT NOT NULL CHECK (selesai GLOB '[0-9][0-9]:[0-9][0-9]'),
      zoom_url TEXT, meeting_id TEXT, passcode TEXT, grades TEXT NOT NULL DEFAULT '[]', created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
`);
const { processReminders } = require("./jadwal-reminder");

const user = (u, nama, status, grades) => db.prepare("INSERT INTO users (username, full_name, status, allowed_grades) VALUES (?,?,?,?)").run(u, nama, status, grades).lastInsertRowid;
const wali = (sid, nama, email) => db.prepare("INSERT INTO student_guardians (student_user_id, name, email, relation) VALUES (?,?,?, 'ibu')").run(sid, nama, email).lastInsertRowid;
const budi = user("budi", 'Budi "Kecil" <b>', "active", '["SD"]');
const sari = user("sari", "Sari", "active", '["SMP"]');
const dodi = user("dodi", "Dodi", "suspended", '["SD"]');
const umum = user("umum", "Umum", "active", null);   // tanpa batas jenjang → melihat semua
wali(budi, "Ibu Budi", "ibu.budi@mail.com"); wali(budi, "Ayah Budi", "ayah.budi@mail.com"); wali(budi, "Salah", "bukan-email");
wali(sari, "Ibu Sari", "ibu.sari@mail.com"); wali(dodi, "Ibu Dodi", "ibu.dodi@mail.com"); wali(umum, "Ibu Umum", "ibu.umum@mail.com");

const sekarang = new Date("2026-11-10T03:00:00Z");   // 10:00 WIB
const wib = (menit) => { const t = new Date(sekarang.getTime() + menit * 6e4 + 7 * 36e5); return { tanggal: t.toISOString().slice(0, 10), mulai: t.toISOString().slice(11, 16), selesai: new Date(t.getTime() + 90 * 6e4).toISOString().slice(11, 16) }; };
const jadwal = (menit, judul, grades, zoom = "https://zoom.us/j/1") => {
  const w = wib(menit);
  return db.prepare("INSERT INTO mentoring_schedules (judul, tanggal, mulai, selesai, grades, zoom_url, keterangan, passcode) VALUES (?,?,?,?,?,?,?,?)")
    .run(judul, w.tanggal, w.mulai, w.selesai, JSON.stringify(grades), zoom, "Siapkan project\r\nBcc: jahat@x.com", "belajar").lastInsertRowid;
};
const A = jadwal(20 * 60, "Game <script>alert(1)</script>", ["SD"], "javascript:alert(1)");   // besok, hanya SD
const B = jadwal(30, "Mentoring B\r\nBcc: jahat@x.com", []);                                   // 30 menit lagi, semua jenjang
const C = jadwal(5 * 60, "Sesi sore SMP", ["SMP"]);                                             // hari ini, hanya SMP
jadwal(3 * 24 * 60, "Terlalu jauh", []); jadwal(-120, "Sudah lewat", []); jadwal(20 * 60, "Khusus SMK", ["SMK"]);

const terkirim = []; let gagal = new Set();
const mailer = { send: async (m) => { if (gagal.has(m.to)) throw new Error("SMTP down"); terkirim.push(m); } };
const log = { log() {}, error() {} };
const jalan = (t = sekarang) => processReminders(db, { mailer, now: t, logger: log });
const tujuan = (re) => terkirim.filter((m) => re.test(m.subject)).map((m) => m.to).sort();
const status = () => db.prepare("SELECT status, attempts, COUNT(*) n FROM mentoring_reminders GROUP BY status, attempts").all();

(async () => {
  // 1. Putaran pertama
  let r = await jalan();
  assert.equal(r.failed, 0);
  // A (besok, SD): wali budi (2 valid) + wali "umum" (tanpa batas) ; sari (SMP) tidak; dodi (suspended) tidak
  assert.deepEqual(tujuan(/Game .*\(besok\)/), ["ayah.budi@mail.com", "ibu.budi@mail.com", "ibu.umum@mail.com"]);
  // "Khusus SMK": hanya murid tanpa batas jenjang (umum) yang berhak melihatnya, sama seperti GET /api/jadwal
  assert.deepEqual(tujuan(/Khusus SMK/), ["ibu.umum@mail.com"]);
  // B (1 jam, semua jenjang): budi x2, sari, umum — dodi (suspended) tidak
  assert.deepEqual(tujuan(/\(1 jam lagi\)/), ["ayah.budi@mail.com", "ibu.budi@mail.com", "ibu.sari@mail.com", "ibu.umum@mail.com"]);
  // C (hari ini, SMP): sari + umum, bukan budi (SD)
  assert.deepEqual(tujuan(/\(hari ini\)/), ["ibu.sari@mail.com", "ibu.umum@mail.com"]);
  assert.equal(terkirim.length, 10, "tidak ada email untuk jadwal jauh / lewat / murid suspended / email tidak valid / jenjang tidak cocok");

  // 2. Putaran kedua: tidak ada duplikat
  assert.equal((await jalan()).sent, 0);

  // 3. Isi email aman
  const a = terkirim.find((m) => m.to === "ibu.budi@mail.com" && m.subject.includes("(besok)"));
  assert.ok(!a.html.includes("<script>") && !a.html.includes("javascript:"), "judul di-escape, link non-https dibuang");
  assert.ok(a.html.includes("Budi &quot;Kecil&quot; &lt;b&gt;"), "nama anak di-escape");
  assert.ok(a.text.includes("WIB") && a.text.includes("Ibu Budi") && a.text.includes("Kode akses: belajar"));
  const b = terkirim.find((m) => m.subject.includes("1 jam lagi"));
  for (const m of terkirim) assert.ok(!/[\r\n]/.test(m.subject), "subjek satu baris (anti header injection)");
  assert.ok(b.html.includes('href="https://zoom.us/j/1"'));
  assert.ok(!terkirim.some((m) => /^Bcc:/m.test(m.text)), "keterangan tidak bisa menyisipkan header");

  // 4. Gagal kirim → dicoba ulang setelah jeda, berhenti setelah 3 percobaan
  const D = jadwal(30 + 1, "Sesi D", ["SD"]);
  gagal = new Set(["ibu.budi@mail.com"]);
  r = await jalan(); assert.equal(r.failed, 1); assert.equal(tujuan(/Sesi D/).includes("ibu.budi@mail.com"), false);
  r = await jalan(); assert.equal(r.failed + r.sent, 0, "belum waktunya mencoba ulang (jeda 10 menit)");
  const lampau = () => db.prepare("UPDATE mentoring_reminders SET updated_at = datetime('now', '-30 minutes') WHERE status = 'failed'").run();
  lampau(); r = await jalan(); assert.equal(r.failed, 1, "percobaan ke-2 gagal lagi");
  lampau(); r = await jalan(); assert.equal(r.failed, 1, "percobaan ke-3 gagal lagi");
  lampau(); r = await jalan(); assert.equal(r.failed + r.sent, 0, "sudah 3 kali → berhenti");
  assert.ok(db.prepare("SELECT attempts FROM mentoring_reminders WHERE status = 'failed'").get().attempts === 3);
  // percobaan ulang yang berhasil
  const E = jadwal(40, "Sesi E", ["SD"]); gagal = new Set(["ayah.budi@mail.com"]);
  r = await jalan(); assert.equal(r.failed, 1);
  gagal = new Set(); lampau(); r = await jalan(); assert.equal(r.sent, 1, "percobaan ulang berhasil setelah SMTP pulih");
  assert.ok(tujuan(/Sesi E/).includes("ayah.budi@mail.com"));

  // 5. Jadwal dipindah admin → pengingat untuk waktu baru dikirim lagi
  const sebelum = terkirim.length, w = wib(45);
  db.prepare("UPDATE mentoring_schedules SET tanggal = ?, mulai = ?, selesai = ? WHERE id = ?").run(w.tanggal, w.mulai, w.selesai, B);
  r = await jalan(); assert.ok(r.sent >= 3, "B dipindah ke 45 menit lagi → dikirim ulang ke wali yang berhak");
  assert.ok(terkirim.length > sebelum);

  // 6. Jadwal dihapus → catatan pengingat ikut terhapus (CASCADE), tidak ada sisa
  db.prepare("DELETE FROM mentoring_schedules WHERE id = ?").run(C);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mentoring_reminders WHERE schedule_id = ?").get(C).n, 0);

  console.log("SEMUA TES LULUS —", terkirim.length, "email dalam simulasi. Status log:", JSON.stringify(status()));
  console.log("\nContoh email teks:\n\n" + a.text);
})().catch((e) => { console.error("GAGAL:", e.stack || e.message); process.exit(1); });
