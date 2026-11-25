"use strict";

// ------------------------------------------------------------
// PENJADWAL & PENGIRIM PENGINGAT MENTORING ZOOM
//
// 1. Memindai sesi mentoring di tabel `mentoring_schedules`
//    yang akan mulai dalam jendela waktu tertentu (default: 30 menit).
// 2. Mengambil daftar murid yang berhak hadir sesuai jenjang (SD, SMP, SMK)
//    beserta kontak email wali murid (jika ada).
// 3. Mengirimkan email notifikasi via `mailer.js` dan mencatat ke tabel
//    `mentoring_reminders` agar tidak pernah terkirim dobel.
// ------------------------------------------------------------

const { createMailer } = require("./mailer");
const { composeMentoringReminderEmail } = require("./mentoring-email");

// Konversi tanggal & jam lokal WIB (Asia/Jakarta)
function getWibDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const map = {};
  for (const p of parts) map[p.type] = p.value;

  const tanggal = `${map.year}-${map.month}-${map.day}`;
  const jam = `${map.hour}:${map.minute}`;
  return { tanggal, jam, epochMs: date.getTime() };
}

// Menghitung selisih menit antara waktu sekarang (WIB) dengan waktu mulai jadwal
function diffMinutesWib(targetTanggal, targetMulai, wibNow) {
  // Parsing target YYYY-MM-DD HH:MM di WIB (UTC+7)
  const [tY, tM, tD] = targetTanggal.split("-").map(Number);
  const [jH, jM] = targetMulai.split(":").map(Number);
  const targetUtc = Date.UTC(tY, tM - 1, tD, jH - 7, jM, 0);

  return Math.round((targetUtc - wibNow.epochMs) / (60 * 1000));
}

function findUpcomingSchedules(db, options = {}) {
  const now = options.now || new Date();
  const wibNow = getWibDateTime(now);
  const windowMinutes = Number.isInteger(options.windowMinutes) ? options.windowMinutes : 30;
  const toleranceMinutes = Number.isInteger(options.toleranceMinutes) ? options.toleranceMinutes : 15;

  // Cari jadwal untuk hari ini di WIB
  const schedules = db.prepare(`
    SELECT id, judul, jenis, level, mentor, keterangan, tanggal, mulai, selesai,
           zoom_url, meeting_id, passcode, grades, target_scope
    FROM mentoring_schedules
    WHERE tanggal = ?
    ORDER BY mulai ASC
  `).all(wibNow.tanggal);

  const matched = [];
  for (const s of schedules) {
    const diff = diffMinutesWib(s.tanggal, s.mulai, wibNow);
    // Masuk kriteria jika berada dalam jendela [windowMinutes - tolerance, windowMinutes + tolerance]
    // dan belum dimulai (diff > 0)
    if (diff > 0 && Math.abs(diff - windowMinutes) <= toleranceMinutes) {
      matched.push({ schedule: s, diffMinutes: diff });
    }
  }

  return matched;
}

function getEligibleRecipients(db, schedule) {
  let targetGrades = [];
  try {
    targetGrades = JSON.parse(schedule.grades || "[]");
  } catch (_) {
    targetGrades = [];
  }

  // Ambil semua siswa aktif yang memiliki email
  const allStudents = db.prepare(`
    SELECT id, username, email, full_name, allowed_grades
    FROM users
    WHERE role = 'student' AND status = 'active' AND email <> '' AND email IS NOT NULL
  `).all();

  const studentRows = allStudents.filter((s) => {
    // Jika jadwal tidak menentukan batasan jenjang (array kosong), semua siswa diikutsertakan
    if (!Array.isArray(targetGrades) || targetGrades.length === 0) return true;

    // Cek allowed_grades siswa
    let studentGrades = [];
    try {
      studentGrades = JSON.parse(s.allowed_grades || "[]");
    } catch (_) {
      studentGrades = [];
    }

    // Jika allowed_grades siswa kosong, dia berhak mengikuti semua jenjang
    if (!Array.isArray(studentGrades) || studentGrades.length === 0) return true;

    // Cek irisan antara targetGrades jadwal dengan studentGrades
    return targetGrades.some((g) => studentGrades.includes(g));
  });

  const recipients = [];

  // Ambil data siswa
  for (const s of studentRows) {
    const studentName = s.full_name || s.username || "Siswa";
    recipients.push({
      studentUserId: s.id,
      email: s.email,
      name: studentName,
      role: "student"
    });

    // Ambil juga wali siswa jika ada
    const guardians = db.prepare(`
      SELECT id, name, email
      FROM student_guardians
      WHERE student_user_id = ? AND email <> '' AND email IS NOT NULL
    `).all(s.id);

    for (const g of guardians) {
      recipients.push({
        studentUserId: s.id,
        email: g.email,
        name: g.name || `Wali dari ${studentName}`,
        role: "guardian"
      });
    }
  }

  return recipients;
}

async function sendScheduleReminders(db, options = {}) {
  const mailer = options.mailer || createMailer(options);
  const windowMinutes = Number.isInteger(options.windowMinutes) ? options.windowMinutes : 30;
  const reminderWindowTag = `${windowMinutes}m`;
  const upcoming = findUpcomingSchedules(db, options);

  let sentCount = 0;
  let skipCount = 0;
  let failCount = 0;

  const insertLog = db.prepare(`
    INSERT OR IGNORE INTO mentoring_reminders
      (jadwal_id, student_user_id, recipient_email, recipient_name, recipient_role, reminder_window, status, last_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of upcoming) {
    const { schedule } = item;
    const recipients = getEligibleRecipients(db, schedule);

    for (const recipient of recipients) {
      // Cek apakah sudah pernah terkirim untuk jadwal + email + reminderWindowTag ini
      const alreadySent = db.prepare(`
        SELECT 1 FROM mentoring_reminders
        WHERE jadwal_id = ? AND recipient_email = ? COLLATE NOCASE AND reminder_window = ? AND status = 'sent'
      `).get(schedule.id, recipient.email, reminderWindowTag);

      if (alreadySent) {
        skipCount++;
        continue;
      }

      const emailContent = composeMentoringReminderEmail({
        recipientName: recipient.name,
        schedule,
        minutesBefore: windowMinutes
      });

      try {
        await mailer.send({
          to: recipient.email,
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html
        });

        insertLog.run(
          schedule.id,
          recipient.studentUserId,
          recipient.email,
          recipient.name,
          recipient.role,
          reminderWindowTag,
          "sent",
          null
        );
        sentCount++;
      } catch (err) {
        failCount++;
        insertLog.run(
          schedule.id,
          recipient.studentUserId,
          recipient.email,
          recipient.name,
          recipient.role,
          reminderWindowTag,
          "failed",
          String(err.message || err).slice(0, 500)
        );
      }
    }
  }

  return {
    matchedSchedules: upcoming.length,
    sent: sentCount,
    skipped: skipCount,
    failed: failCount
  };
}

// Runner otomatis berbasis interval timer
function startMentoringReminderScheduler(db, options = {}) {
  const env = options.env || process.env;
  const enabled = String(env.MENTORING_REMINDER_ENABLED || "").trim().toLowerCase() === "true";
  if (!enabled) return null;

  const intervalMinutes = Math.max(1, Number.parseInt(env.MENTORING_REMINDER_INTERVAL_MINUTES, 10) || 5);
  const windowMinutes = Math.max(5, Number.parseInt(env.MENTORING_REMINDER_WINDOW_MINUTES, 10) || 30);
  const logger = options.logger || console;

  logger.log(`[MENTORING REMINDER] Penjadwal aktif setiap ${intervalMinutes} menit (jendela ${windowMinutes}m).`);

  const timer = setInterval(async () => {
    try {
      const result = await sendScheduleReminders(db, { ...options, windowMinutes });
      if (result.sent > 0 || result.failed > 0) {
        logger.log(`[MENTORING REMINDER] Sesi diproses: ${result.matchedSchedules}, terkirim: ${result.sent}, gagal: ${result.failed}, dilewati: ${result.skipped}`);
      }
    } catch (err) {
      logger.error("[MENTORING REMINDER] Terjadi kesalahan pada loop pengingat:", err.message);
    }
  }, intervalMinutes * 60 * 1000);

  return timer;
}

module.exports = {
  getWibDateTime,
  diffMinutesWib,
  findUpcomingSchedules,
  getEligibleRecipients,
  sendScheduleReminders,
  startMentoringReminderScheduler
};
