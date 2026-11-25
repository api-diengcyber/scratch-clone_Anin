"use strict";

// Test suite untuk pengingat mentoring Zoom via email (mentoring-reminder-scheduler.js)
const path = require("path");
const fs = require("fs");
const os = require("os");

const TMPDB = path.join(os.tmpdir(), `dcc-test-reminder-${process.pid}.sqlite`);
process.env.DB_PATH = TMPDB;
process.env.NODE_ENV = "test";

const db = require("./database");
const scheduler = require("./mentoring-reminder-scheduler");
const { composeMentoringReminderEmail } = require("./mentoring-email");

function ok(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS  ${msg}`);
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    console.error(`FAIL: ${msg}`);
    console.error(`  aktual:   ${a}`);
    console.error(`  ekspektasi: ${b}`);
    process.exit(1);
  }
  console.log(`PASS  ${msg}`);
}

async function run() {
  try {
    // 1. Uji template email
    const emailSample = composeMentoringReminderEmail({
      recipientName: "Budi Santoso",
      schedule: {
        judul: "Logika Algoritma Dasar",
        mentor: "Kak Rizky",
        tanggal: "2026-11-25",
        mulai: "16:00",
        selesai: "17:30",
        zoom_url: "https://zoom.us/j/123456789",
        meeting_id: "123 456 789",
        passcode: "KODING123",
        keterangan: "Bawa laptop dan sudah instal Python."
      },
      minutesBefore: 30
    });

    ok(emailSample.subject.includes("30 Menit Lagi"), "Subjek memuat 30 menit lagi");
    ok(emailSample.subject.includes("Logika Algoritma Dasar"), "Subjek memuat judul sesi");
    ok(emailSample.text.includes("Budi Santoso"), "Teks memuat nama penerima");
    ok(emailSample.text.includes("https://zoom.us/j/123456789"), "Teks memuat tautan Zoom");
    ok(emailSample.html.includes("Gabung Sesi Zoom Sekarang"), "HTML memuat tombol call-to-action Zoom");

    // 2. Setup mock data users & guardians
    const student1Id = Number(db.prepare(`
      INSERT INTO users (username, email, full_name, role, allowed_grades, status)
      VALUES (?, ?, ?, 'student', ?, 'active')
    `).run("siswa_smp", "siswa_smp@example.com", "Siswa SMP 1", JSON.stringify(["SMP"])).lastInsertRowid);

    const student2Id = Number(db.prepare(`
      INSERT INTO users (username, email, full_name, role, allowed_grades, status)
      VALUES (?, ?, ?, 'student', ?, 'active')
    `).run("siswa_sd", "siswa_sd@example.com", "Siswa SD 1", JSON.stringify(["SD"])).lastInsertRowid);

    db.prepare(`
      INSERT INTO student_guardians (student_user_id, name, email, relation)
      VALUES (?, ?, ?, 'ayah')
    `).run(student1Id, "Ayah Siswa SMP", "ayah_smp@example.com");

    // 3. Setup mock mentoring schedule
    // Buat jadwal yang mulai 30 menit dari "now"
    const mockNow = new Date("2026-11-25T07:30:00.000Z"); // Jam 14:30 WIB
    const wibNow = scheduler.getWibDateTime(mockNow);
    eq(wibNow.tanggal, "2026-11-25", "WIB tanggal cocok");
    eq(wibNow.jam, "14:30", "WIB jam cocok (14:30)");

    // Sesi 1: Mulai jam 15:00 WIB (tepat 30 menit lagi) khusus SMP
    const sched1Id = Number(db.prepare(`
      INSERT INTO mentoring_schedules (
        judul, jenis, mentor, tanggal, mulai, selesai, zoom_url, grades
      ) VALUES (?, 'Live Mentoring', 'Kak Rizky', '2026-11-25', '15:00', '16:30', 'https://zoom.us/j/111', ?)
    `).run("Web Development SMP", JSON.stringify(["SMP"])).lastInsertRowid);

    // Sesi 2: Mulai jam 18:00 WIB (masih 3.5 jam lagi, tidak masuk jendela 30m)
    const sched2Id = Number(db.prepare(`
      INSERT INTO mentoring_schedules (
        judul, jenis, mentor, tanggal, mulai, selesai, zoom_url, grades
      ) VALUES (?, 'Live Mentoring', 'Kak Anin', '2026-11-25', '18:00', '19:30', 'https://zoom.us/j/222', ?)
    `).run("Scratch Game SD", JSON.stringify(["SD"])).lastInsertRowid);

    // 4. Uji findUpcomingSchedules
    const upcoming = scheduler.findUpcomingSchedules(db, { now: mockNow, windowMinutes: 30 });
    eq(upcoming.length, 1, "Hanya menemukan 1 jadwal dalam jendela 30 menit");
    eq(upcoming[0].schedule.id, sched1Id, "Jadwal yang cocok adalah Sesi SMP 15:00");
    eq(upcoming[0].diffMinutes, 30, "Selisih tepat 30 menit");

    // 5. Uji getEligibleRecipients
    const recipients = scheduler.getEligibleRecipients(db, upcoming[0].schedule);
    eq(recipients.length, 2, "2 penerima (1 siswa SMP + 1 wali)");
    const emails = recipients.map((r) => r.email).sort();
    eq(emails, ["ayah_smp@example.com", "siswa_smp@example.com"], "Penerima siswa dan wali tepat");

    // 6. Uji sendScheduleReminders dengan mock mailer
    const sentEmails = [];
    const mockMailer = {
      send: async (payload) => {
        sentEmails.push(payload);
        return { messageId: `mock-${sentEmails.length}` };
      }
    };

    const res1 = await scheduler.sendScheduleReminders(db, {
      now: mockNow,
      windowMinutes: 30,
      mailer: mockMailer
    });

    eq(res1.sent, 2, "Dua email berhasil terkirim");
    eq(res1.failed, 0, "Nol kegagalan");
    eq(res1.skipped, 0, "Nol dilewati pada pengiriman pertama");
    eq(sentEmails.length, 2, "Mock mailer menerima 2 email");
    ok(sentEmails[0].subject.includes("[Pengingat Mentoring] 30 Menit Lagi"), "Subjek email pengingat sesuai");

    // 7. Uji Idempotensi (Deduplication) - Panggilan kedua harus diskip
    const res2 = await scheduler.sendScheduleReminders(db, {
      now: mockNow,
      windowMinutes: 30,
      mailer: mockMailer
    });

    eq(res2.sent, 0, "Tidak ada email tambahan terkirim pada run kedua");
    eq(res2.skipped, 2, "Dua penerima dilewati karena sudah pernah menerima");
    eq(sentEmails.length, 2, "Jumlah email di mailer tetap 2 (tidak dobel)");

    // 8. Cek pencatatan di database mentoring_reminders
    const logs = db.prepare("SELECT * FROM mentoring_reminders WHERE jadwal_id = ?").all(sched1Id);
    eq(logs.length, 2, "Dua baris log tersimpan di mentoring_reminders");
    eq(logs.every((l) => l.status === "sent"), true, "Semua berstatus sent");

    console.log("\nSemua pengujian reminder mentoring via email BERHASIL!");
  } finally {
    try {
      db.close();
      if (fs.existsSync(TMPDB)) fs.unlinkSync(TMPDB);
      const wal = `${TMPDB}-wal`;
      const shm = `${TMPDB}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch (_) {}
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
