// Tes notifikasi siswa (modul, bukan HTTP).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = path.join(os.tmpdir(), `dcc-notif-${process.pid}`);
process.env.DB_PATH = `${TMP}.sqlite`;
process.env.PLUGIN_DIR = `${TMP}-plugins`;
process.env.NODE_ENV = "test";

const db = require("./database");
const N = require("./student-notifications");

const results = [];
function record(name, pass, detail) {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : ` — ${detail}`}`);
}
const eq = (name, got, want) => record(name, JSON.stringify(got) === JSON.stringify(want),
  `dapat ${JSON.stringify(got)}, harap ${JSON.stringify(want)}`);
const ok = (name, value, detail = "kondisi salah") => record(name, Boolean(value), detail);

let seq = 0;
function addUser(role) {
  seq += 1;
  return Number(db.prepare("INSERT INTO users (username, email, role) VALUES (?, ?, ?)")
    .run(`notif-${role}-${seq}`, `notif-${role}-${seq}@example.com`, role).lastInsertRowid);
}

function main() {
  const studentId = addUser("student");
  const adminId = addUser("admin");
  const otherStudent = addUser("student");
  const deletedStudent = addUser("student");
  db.prepare("UPDATE users SET status = 'deleted' WHERE id = ?").run(deletedStudent);

  eq("notify: user tidak valid ditolak", N.notifyStudent(db, "x", { kind: "task.graded", title: "Nilai" }), 0);
  eq("notify: kind/title wajib",
    [N.notifyStudent(db, studentId, { title: "Tanpa kind" }), N.notifyStudent(db, studentId, { kind: "x", title: "  " })], [0, 0]);
  eq("notify: admin bukan penerima", N.notifyStudent(db, adminId, { kind: "task.graded", title: "Nilai" }), 0);
  eq("notify: siswa dihapus tidak menerima", N.notifyStudent(db, deletedStudent, { kind: "task.graded", title: "Nilai" }), 0);

  eq("notify: siswa menerima notifikasi",
    N.notifyStudent(db, studentId, {
      kind: "task.graded",
      title: "Nilai tugas keluar: Percabangan",
      body: "Nilai 90/100",
      view: "tugas",
      icon: "fa-solid fa-star",
      tone: "emerald",
      dedupeKey: "task.graded:1:90"
    }), 1);
  eq("notify: dedupe mencegah duplikat",
    N.notifyStudent(db, studentId, {
      kind: "task.graded", title: "Nilai tugas keluar: Percabangan", dedupeKey: "task.graded:1:90"
    }), 0);
  eq("notify: dedupe berbeda membuat baris baru",
    N.notifyStudent(db, studentId, {
      kind: "task.graded", title: "Nilai tugas keluar: Percabangan", dedupeKey: "task.graded:1:95"
    }), 1);
  eq("notify: tanpa dedupe selalu membuat baris",
    [N.notifyStudent(db, studentId, { kind: "info", title: "Satu" }),
      N.notifyStudent(db, studentId, { kind: "info", title: "Dua" })], [1, 1]);

  const clean = N.notifyStudent(db, studentId, {
    kind: "revisi\u0000",
    title: "Judul\u0007 bersih " + "x".repeat(300),
    body: "Isi\u0001 " + "y".repeat(600),
    view: "",
    icon: "",
    tone: ""
  });
  eq("notify: teks kotor tetap disimpan", clean, 1);
  const dirtyRow = db.prepare("SELECT * FROM student_notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(studentId);
  ok("notify: karakter kontrol dibuang", !/[\u0000-\u0008]/.test(dirtyRow.kind + dirtyRow.title + dirtyRow.body));
  eq("notify: judul dipotong 200", dirtyRow.title.length, 200);
  eq("notify: body dipotong 500", dirtyRow.body.length, 500);
  eq("notify: view/icon/tone default", [dirtyRow.view, dirtyRow.icon, dirtyRow.tone], ["tugas", "fa-solid fa-bell", "sky"]);

  const list = N.listStudentNotifications(db, studentId, { limit: 2 });
  eq("list: limit dipakai", list.length, 2);
  eq("list: urutan terbaru dulu", list[0].title.startsWith("Judul"), true);
  eq("list: bentuk item", Object.keys(list[0]),
    ["id", "kind", "title", "body", "view", "icon", "tone", "read", "readAt", "createdAt"]);
  eq("list: masih belum dibaca", list[0].read, false);
  eq("list: limit 0 memakai default", N.listStudentNotifications(db, studentId, { limit: 0 }).length, 5);
  eq("list: limit 1 dipakai", N.listStudentNotifications(db, studentId, { limit: 1 }).length, 1);
  eq("list: limit maksimum 100 tidak error", N.listStudentNotifications(db, studentId, { limit: 5000 }).length <= 100, true);
  eq("list: siswa lain kosong", N.listStudentNotifications(db, otherStudent).length, 0);

  const total = N.listStudentNotifications(db, studentId, { limit: 100 }).length;
  eq("unread: menghitung semua", N.unreadCount(db, studentId), total);
  eq("unread: siswa lain nol", N.unreadCount(db, otherStudent), 0);

  const newest = list[0];
  const read = N.markRead(db, studentId, newest.id);
  eq("read: berhasil pertama kali", [read.found, read.changed], [true, true]);
  eq("read: unread berkurang", N.unreadCount(db, studentId), total - 1);
  const readAgain = N.markRead(db, studentId, newest.id);
  eq("read: kedua kali idempoten", [readAgain.found, readAgain.changed], [true, false]);
  eq("read: notifikasi siswa lain tidak bisa dibaca",
    N.markRead(db, otherStudent, newest.id), { found: false, changed: false });
  eq("read: id tidak valid", N.markRead(db, studentId, "x"), { found: false, changed: false });

  const updated = N.markAllRead(db, studentId);
  eq("read-all: semua baris tersisa ditandai", updated, total - 1);
  eq("read-all: unread nol", N.unreadCount(db, studentId), 0);
  eq("read-all: idempoten", N.markAllRead(db, studentId), 0);

  // FK ON DELETE CASCADE: notifikasi ikut hilang saat siswa benar-benar dihapus.
  const before = Number(db.prepare("SELECT COUNT(*) n FROM student_notifications WHERE user_id = ?").get(studentId).n);
  ok("cascade: ada baris sebelum hapus", before > 0);
  db.prepare("DELETE FROM users WHERE id = ?").run(studentId);
  eq("cascade: notifikasi siswa ikut terhapus",
    Number(db.prepare("SELECT COUNT(*) n FROM student_notifications WHERE user_id = ?").get(studentId).n), 0);
}

try {
  main();
} catch (error) {
  record("tes berjalan tanpa exception", false, error && error.stack ? error.stack.split("\n").slice(0, 3).join(" | ") : String(error));
} finally {
  try { db.close(); } catch (_) {}
  for (const f of [".sqlite", ".sqlite-wal", ".sqlite-shm"]) {
    try { fs.unlinkSync(`${TMP}${f}`); } catch (_) {}
  }
  try { fs.rmSync(`${TMP}-plugins`, { recursive: true, force: true }); } catch (_) {}
  const passed = results.filter(Boolean).length;
  console.log(`${passed}/${results.length} lolos`);
  process.exit(passed === results.length ? 0 : 1);
}
