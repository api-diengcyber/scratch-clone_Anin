// Tes tanggal mulai berlangganan + catatan pengiriman email laporan.
// Tanpa server: langsung ke modul dan database sementara.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const TMP = path.join(os.tmpdir(), `dcc-deliveries-${process.pid}`);
process.env.DB_PATH = `${TMP}.sqlite`;
process.env.PLUGIN_DIR = `${TMP}-plugins`;
process.env.NODE_ENV = "test";

const Database = require("better-sqlite3");
const db = require("./database");
const D = require("./report-deliveries");
const reports = require("./reports");

const results = [];
function record(name, pass, detail) {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : ` — ${detail}`}`);
}
const eq = (name, got, want) => record(name, JSON.stringify(got) === JSON.stringify(want),
  `dapat ${JSON.stringify(got)}, harap ${JSON.stringify(want)}`);
const ok = (name, value, detail = "kondisi salah") => record(name, Boolean(value), detail);
function throws(name, fn) {
  try { fn(); record(name, false, "tidak melempar error"); } catch (_) { record(name, true); }
}

let seq = 0;
function addStudent() {
  seq += 1;
  return Number(db.prepare("INSERT INTO users (username, email, role) VALUES (?, ?, 'student')")
    .run(`siswa-kirim-${seq}`, `siswa-kirim-${seq}@example.com`).lastInsertRowid);
}
const row = (id) => db.prepare("SELECT * FROM report_deliveries WHERE id = ?").get(id);

function main() {
  // ---------- tanggal ----------
  eq("addMonths: 31 Jan + 1 bulan = 28 Feb", D.addMonths("2026-01-31", 1), "2026-02-28");
  eq("addMonths: tahun kabisat 31 Jan + 1 = 29 Feb", D.addMonths("2028-01-31", 1), "2028-02-29");
  eq("addMonths: pindah tahun", D.addMonths("2026-12-15", 1), "2027-01-15");
  eq("addMonths: 31 Mar + 1 = 30 Apr", D.addMonths("2026-03-31", 1), "2026-04-30");
  eq("firstReportDueDate: 4 Nov -> 4 Des", D.firstReportDueDate("2026-11-04"), "2026-12-04");
  eq("firstReportDueDate: null -> null", D.firstReportDueDate(null), null);
  eq("reportDueDate: laporan bulan ke-3", D.reportDueDate("2026-11-04", 3), "2027-02-04");
  eq("subscriptionEndDate: 3 bulan berakhir 3 Feb", D.subscriptionEndDate("2026-11-04", 3), "2027-02-03");
  eq("addDays: 1 Mar - 1 hari = 28 Feb", D.addDays("2026-03-01", -1), "2026-02-28");
  eq("kindForMonth / monthOfKind", [D.kindForMonth(2), D.monthOfKind("month2"), D.monthOfKind("month37")], ["month2", 2, null]);
  eq("normalizeMonths: nilai kosong = 1 bulan",
    [D.normalizeMonths(undefined), D.normalizeMonths(null), D.normalizeMonths(""), D.normalizeMonths("3")], [1, 1, 1, 3]);
  throws("normalizeMonths: 0 ditolak", () => D.normalizeMonths(0));
  throws("normalizeMonths: 37 ditolak", () => D.normalizeMonths(37));
  throws("normalizeMonths: pecahan ditolak", () => D.normalizeMonths(2.5));
  throws("normalizeMonths: boolean ditolak", () => D.normalizeMonths(true));
  eq("addMonths: tanggal tidak valid -> null", D.addMonths("2026-02-30", 1), null);

  const valid = ["2028-02-29", "2026-11-04", "2000-01-01", "2100-12-31"];
  const invalid = ["2027-02-29", "2026-02-30", "2026-13-01", "2026-00-10", "1999-12-31", "2101-01-01",
    "2026-1-1", "2026-11-04 ", " 2026-11-04", "04-11-2026", "", null, undefined, 20261104, {}];
  eq("isValidDateOnly: tanggal sah diterima", valid.map(D.isValidDateOnly), valid.map(() => true));
  eq("isValidDateOnly: format/tanggal salah ditolak", invalid.map(D.isValidDateOnly), invalid.map(() => false));

  // ---------- batasan database ----------
  const sid0 = addStudent();
  throws("DB menolak subscription_started_at berformat salah",
    () => db.prepare("UPDATE users SET subscription_started_at = ? WHERE id = ?").run("bukan-tanggal", sid0));
  db.prepare("UPDATE users SET subscription_started_at = ? WHERE id = ?").run("2026-11-04", sid0);
  eq("DB menerima tanggal sah", db.prepare("SELECT subscription_started_at s FROM users WHERE id = ?").get(sid0).s, "2026-11-04");
  db.prepare("UPDATE users SET subscription_started_at = NULL WHERE id = ?").run(sid0);
  eq("DB menerima NULL", db.prepare("SELECT subscription_started_at s FROM users WHERE id = ?").get(sid0).s, null);
  throws("DB menolak subscription_months 0",
    () => db.prepare("UPDATE users SET subscription_months = ? WHERE id = ?").run(0, sid0));
  throws("DB menolak subscription_months 37",
    () => db.prepare("UPDATE users SET subscription_months = ? WHERE id = ?").run(37, sid0));
  db.prepare("UPDATE users SET subscription_months = ? WHERE id = ?").run(3, sid0);
  eq("DB menerima durasi 3 bulan",
    db.prepare("SELECT subscription_months m FROM users WHERE id = ?").get(sid0).m, 3);
  db.prepare("UPDATE users SET subscription_months = NULL WHERE id = ?").run(sid0);

  // ---------- antrean idempoten ----------
  const sid = addStudent();
  const base = { studentId: sid, recipientEmail: "ibu@example.com", recipientName: "Ibu", dueDate: "2026-12-04" };
  const first = D.queueDelivery(db, base);
  eq("queue: pertama kali dibuat berstatus pending", [first.created, first.status], [true, "pending"]);
  const again = D.queueDelivery(db, base);
  eq("queue: kedua kali tidak membuat baris baru", [again.created, again.id], [false, first.id]);
  const caseVariant = D.queueDelivery(db, { ...base, recipientEmail: "IBU@Example.COM" });
  eq("queue: email beda huruf besar dianggap sama", [caseVariant.created, caseVariant.id], [false, first.id]);
  eq("queue: baris tetap satu untuk penerima itu",
    db.prepare("SELECT COUNT(*) n FROM report_deliveries WHERE student_user_id = ?").get(sid).n, 1);
  const other = D.queueDelivery(db, { ...base, recipientEmail: "ayah@example.com" });
  ok("queue: email lain dibuat sebagai baris baru", other.created && other.id !== first.id);
  eq("queue: email disimpan huruf kecil", row(caseVariant.id).recipient_email, "ibu@example.com");
  throws("queue: kind tidak dikenal ditolak", () => D.queueDelivery(db, { ...base, kind: "weekly" }));
  throws("queue: bulan di luar durasi maksimum ditolak", () => D.queueDelivery(db, { ...base, kind: "month37" }));
  throws("queue: email kosong ditolak", () => D.queueDelivery(db, { ...base, recipientEmail: "  " }));
  throws("queue: dueDate tidak valid ditolak", () => D.queueDelivery(db, { ...base, recipientEmail: "x@example.com", dueDate: "2026-02-30" }));

  // ---------- status ----------
  ok("failed: pending -> failed", D.markFailed(db, first.id, new Error("SMTP timeout")));
  eq("failed: attempts=1 dan pesan tersimpan", [row(first.id).status, row(first.id).attempts, row(first.id).last_error], ["failed", 1, "SMTP timeout"]);
  ok("failed: boleh dicoba gagal lagi", D.markFailed(db, first.id, "SMTP timeout lagi"));
  eq("failed: attempts bertambah", row(first.id).attempts, 2);
  ok("sent: failed -> sent", D.markSent(db, first.id));
  const sent = row(first.id);
  eq("sent: status, attempts, error dibersihkan", [sent.status, sent.attempts, sent.last_error], ["sent", 3, null]);
  ok("sent: sent_at terisi", sent.sent_at);
  eq("sent final: tidak bisa ditandai failed/skipped/sent lagi",
    [D.markFailed(db, first.id, "x"), D.markSkipped(db, first.id, "x"), D.markSent(db, first.id)], [false, false, false]);
  const requeued = D.queueDelivery(db, base);
  eq("sent final: queue ulang tidak membuat atau menghidupkan lagi",
    [requeued.created, requeued.revived, requeued.status], [false, false, "sent"]);
  eq("sent final: baris tetap sent", row(first.id).status, "sent");

  const dirty = D.queueDelivery(db, { ...base, recipientEmail: "kotor@example.com" });
  D.markFailed(db, dirty.id, `bad\u0000\u0007${"x".repeat(1000)}`);
  const cleaned = row(dirty.id).last_error;
  ok("error dipotong 500 karakter", cleaned.length <= 500, `panjang ${cleaned.length}`);
  ok("karakter kontrol dibuang dari error", !/[\u0000-\u0008]/.test(cleaned));

  // ---------- skipped bisa dihidupkan lagi ----------
  const sk = D.queueDelivery(db, { ...base, recipientEmail: "skip@example.com" });
  ok("skip: pending -> skipped", D.markSkipped(db, sk.id, "dibatalkan admin"));
  const revived = D.queueDelivery(db, { ...base, recipientEmail: "skip@example.com", dueDate: "2027-01-10" });
  eq("skip: queue ulang menghidupkan lagi", [revived.created, revived.revived, revived.status, revived.id], [false, true, "pending", sk.id]);
  eq("skip: due_date baru dan error dibersihkan", [row(sk.id).due_date, row(sk.id).last_error], ["2027-01-10", null]);

  // ---------- sinkron saat tanggal berlangganan berubah ----------
  const sid2 = addStudent();
  const p = D.queueDelivery(db, { studentId: sid2, recipientEmail: "p@example.com", dueDate: "2026-12-04" });
  const s = D.queueDelivery(db, { studentId: sid2, recipientEmail: "s@example.com", dueDate: "2026-12-04" });
  D.markSent(db, s.id);
  eq("sync: tanggal baru menggeser jatuh tempo yang pending saja",
    D.syncPendingForSubscription(db, sid2, "2027-01-31"), { rescheduled: 1, skipped: 0 });
  eq("sync: pending digeser (31 Jan + 1 bulan = 28 Feb)", row(p.id).due_date, "2027-02-28");
  eq("sync: yang sudah sent tidak disentuh", [row(s.id).status, row(s.id).due_date], ["sent", "2026-12-04"]);
  eq("sync: tanggal dihapus membatalkan yang belum terkirim",
    D.syncPendingForSubscription(db, sid2, null), { rescheduled: 0, skipped: 1 });
  eq("sync: pending jadi skipped, sent tetap sent", [row(p.id).status, row(s.id).status], ["skipped", "sent"]);
  const back = D.queueDelivery(db, { studentId: sid2, recipientEmail: "p@example.com", dueDate: "2027-03-01" });
  eq("sync: tanggal diisi lagi, queue menghidupkan kembali yang dibatalkan", [back.revived, back.status], [true, "pending"]);
  eq("sync: siswa tanpa pengiriman aman",
    D.syncPendingForSubscription(db, addStudent(), "2026-11-04"), { rescheduled: 0, skipped: 0 });
  throws("sync: tanggal mulai tidak sah ditolak",
    () => D.syncPendingForSubscription(db, sid2, "2026-02-30"));
  throws("sync: durasi tidak sah ditolak",
    () => D.syncPendingForSubscription(db, sid2, "2026-11-04", 0));

  // ---------- sinkron durasi bulanan ----------
  const sidM = addStudent();
  const m1 = D.queueDelivery(db, { studentId: sidM, recipientEmail: "m1@example.com", kind: "month1", dueDate: "2026-12-04" });
  const m2 = D.queueDelivery(db, { studentId: sidM, recipientEmail: "m2@example.com", kind: "month2", dueDate: "2027-01-04" });
  const m3 = D.queueDelivery(db, { studentId: sidM, recipientEmail: "m3@example.com", kind: "month3", dueDate: "2027-02-04" });
  eq("sync durasi: tanggal baru menggeser semua bulan sesuai urutannya",
    D.syncPendingForSubscription(db, sidM, "2027-01-31", 3), { rescheduled: 3, skipped: 0 });
  eq("sync durasi: bulan 1-3 memakai tanggal 31 Jan",
    [row(m1.id).due_date, row(m2.id).due_date, row(m3.id).due_date], ["2027-02-28", "2027-03-31", "2027-04-30"]);
  eq("sync durasi: 3 -> 2 membatalkan bulan ke-3 saja",
    D.syncPendingForSubscription(db, sidM, "2027-01-31", 2), { rescheduled: 2, skipped: 1 });
  eq("sync durasi: bulan 3 dibatalkan, bulan 1-2 tetap pending",
    [row(m3.id).status, row(m3.id).last_error, row(m1.id).status, row(m2.id).status],
    ["skipped", "Melebihi durasi langganan", "pending", "pending"]);
  eq("sync durasi: tanggal dihapus membatalkan semua bulan yang belum terkirim",
    D.syncPendingForSubscription(db, sidM, null, 3), { rescheduled: 0, skipped: 2 });
  eq("sync durasi: semua pending jadi skipped", [row(m1.id).status, row(m2.id).status], ["skipped", "skipped"]);

  // ---------- antrean bulanan untuk wali ----------
  const sidQ = addStudent();
  reports.replaceGuardians(db, sidQ, [{ name: "Ibu Bulanan", email: "ibu-bulanan@example.com", relation: "ibu" }], null);
  const queued3 = reports.queueGuardianDeliveries(db, sidQ, "2026-11-04", 3);
  eq("queue wali: 3 bulan diantrekan", [queued3.queued, queued3.months, queued3.created], [3, 3, 3]);
  const monthlyRows = db.prepare(`
    SELECT kind, due_date, status FROM report_deliveries
    WHERE student_user_id = ? ORDER BY kind ASC
  `).all(sidQ);
  eq("queue wali: jenis dan jatuh tempo tiap bulan",
    monthlyRows.map((r) => [r.kind, r.due_date, r.status]),
    [["month1", "2026-12-04", "pending"], ["month2", "2027-01-04", "pending"], ["month3", "2027-02-04", "pending"]]);
  const queuedAgain = reports.queueGuardianDeliveries(db, sidQ, "2026-11-04", 3);
  eq("queue wali: aman dipanggil ulang", [queuedAgain.created, queuedAgain.revived], [0, 0]);
  const queuedLess = reports.queueGuardianDeliveries(db, sidQ, "2026-11-04", 1);
  eq("queue wali: durasi lebih kecil tidak menghapus baris lama", [queuedLess.created, queuedLess.months], [0, 1]);

  // ---------- wali dihapus ----------
  const sid3 = addStudent();
  const gs = reports.replaceGuardians(db, sid3, [
    { name: "Ayah", email: "ayah3@example.com", relation: "ayah" },
    { name: "Ibu", email: "ibu3@example.com", relation: "ibu" }
  ], null);
  const ayah = gs.find((g) => g.email === "ayah3@example.com");
  const ibu = gs.find((g) => g.email === "ibu3@example.com");
  const dAyah = D.queueDelivery(db, { studentId: sid3, guardianId: ayah.id, recipientEmail: ayah.email, dueDate: "2026-12-04" });
  const dIbu = D.queueDelivery(db, { studentId: sid3, guardianId: ibu.id, recipientEmail: ibu.email, dueDate: "2026-12-04" });
  reports.replaceGuardians(db, sid3, [{ name: "Ibu", email: "ibu3@example.com", relation: "ibu" }], null);
  eq("wali dihapus: pengiriman wali itu dibatalkan", [row(dAyah.id).status, row(dAyah.id).last_error], ["skipped", "Wali dihapus dari daftar"]);
  eq("wali dihapus: pengiriman wali lain tetap pending", row(dIbu.id).status, "pending");
  const sentBefore = D.queueDelivery(db, { studentId: sid3, recipientEmail: "lama@example.com", dueDate: "2026-12-04" });
  D.markSent(db, sentBefore.id);
  eq("wali dihapus: riwayat yang sudah sent tidak diubah", row(sentBefore.id).status, "sent");

  // ---------- daftar ----------
  const sid4 = addStudent();
  for (let i = 0; i < 3; i += 1) D.queueDelivery(db, { studentId: sid4, recipientEmail: `w${i}@example.com`, dueDate: "2026-12-04" });
  const all = D.listDeliveries(db, { studentId: sid4, limit: 2 });
  eq("list: total, halaman, jumlah item", [all.total, all.pages, all.items.length], [3, 2, 2]);
  eq("list: urutan terbaru dulu", all.items[0].recipientEmail, "w2@example.com");
  eq("list: halaman 2 berisi sisanya", D.listDeliveries(db, { studentId: sid4, limit: 2, page: 2 }).items.length, 1);
  eq("list: filter status", D.listDeliveries(db, { studentId: sid4, status: "sent" }).total, 0);
  ok("list: memuat nama siswa", all.items[0].studentName === `siswa-kirim-${seq}` || typeof all.items[0].studentName === "string");

  // ---------- migrasi: kolom tidak hilang pada database lama ----------
  // Rebuild tabel users (migrasi role) menyalin kolom dengan daftar eksplisit.
  // Kolom yang ditambahkan SEBELUM rebuild akan hilang diam-diam di DB lama.
  const legacy = `${TMP}-legacy.sqlite`;
  const ldb = new Database(legacy);
  ldb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin', 'ortu'))
    );
    INSERT INTO users (username) VALUES ('anak-lama');
  `);
  ldb.close();
  const script = `
    const db = require("./database");
    const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
    db.prepare("UPDATE users SET subscription_started_at = '2026-11-04', subscription_months = 3 WHERE username = 'anak-lama'").run();
    const row = db.prepare("SELECT username, role, subscription_started_at AS s, subscription_months AS m FROM users").get();
    console.log("RESULT:" + JSON.stringify({ cols, row, rebuilt: db.prepare("SELECT sql FROM sqlite_master WHERE name='users'").get().sql.includes("'instruktur'") }));
  `;
  const child = spawnSync(process.execPath, ["-e", script], {
    cwd: __dirname,
    env: { ...process.env, DB_PATH: legacy, PLUGIN_DIR: `${TMP}-plugins-legacy` },
    encoding: "utf8"
  });
  const line = String(child.stdout || "").split("\n").find((l) => l.startsWith("RESULT:"));
  const legacyResult = line ? JSON.parse(line.slice(7)) : null;
  ok("migrasi DB lama: database terbuka tanpa error", legacyResult, (child.stderr || "").slice(0, 200));
  if (legacyResult) {
    ok("migrasi DB lama: rebuild role benar-benar terjadi", legacyResult.rebuilt);
    ok("migrasi DB lama: kolom subscription_started_at ada setelah rebuild", legacyResult.cols.includes("subscription_started_at"));
    ok("migrasi DB lama: kolom subscription_months ada setelah rebuild", legacyResult.cols.includes("subscription_months"));
    eq("migrasi DB lama: data lama utuh dan tanggal/durasi bisa disimpan",
      [legacyResult.row.username, legacyResult.row.role, legacyResult.row.s, legacyResult.row.m], ["anak-lama", "student", "2026-11-04", 3]);
  }
}

try {
  main();
} catch (error) {
  record("tes berjalan tanpa exception", false, error && error.stack ? error.stack.split("\n").slice(0, 3).join(" | ") : String(error));
} finally {
  try { db.close(); } catch (_) {}
  for (const f of [".sqlite", ".sqlite-wal", ".sqlite-shm", "-legacy.sqlite", "-legacy.sqlite-wal", "-legacy.sqlite-shm"]) {
    try { fs.unlinkSync(`${TMP}${f}`); } catch (_) {}
  }
  for (const d of ["-plugins", "-plugins-legacy"]) {
    try { fs.rmSync(`${TMP}${d}`, { recursive: true, force: true }); } catch (_) {}
  }
  const passed = results.filter(Boolean).length;
  console.log(`${passed}/${results.length} lolos`);
  process.exit(passed === results.length ? 0 : 1);
}