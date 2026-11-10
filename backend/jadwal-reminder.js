"use strict";

// ------------------------------------------------------------
// PENGINGAT JADWAL MENTORING → EMAIL WALI
//
// Memakai data yang sudah ada: mentoring_schedules (jadwal), student_guardians (wali),
// users (murid), dan ./mailer (provider email yang sama dengan email laporan).
//
// Setiap putaran (default 5 menit) dicari jadwal yang akan mulai, lalu wali dari murid yang
// berhak melihat jadwal itu (aturan jenjang sama persis dengan GET /api/jadwal) diberi email:
//   - "besok" / "hari ini" : sekali, saat jadwal tinggal <= 24 jam (dan masih > 1 jam)
//   - "1 jam lagi"         : sekali, saat jadwal tinggal <= 1 jam
// Satu email per (jadwal, wali, jenis pengingat, tanggal+jam). Kalau admin memindahkan jadwal,
// pengingat untuk waktu yang baru dikirim lagi.
//
// Gagal kirim dicoba lagi paling cepat 10 menit kemudian, maksimal 3 percobaan.
// Aktif bila REMINDER_EMAIL_ENABLED=true. Provider/kredensial memakai env yang sama dengan
// email laporan (REPORT_EMAIL_PROVIDER, RESEND_API_KEY / SMTP_*).
// ------------------------------------------------------------

const { scheduleDto, visibleForGrades } = require("./jadwal-api");

const DEFAULT_INTERVAL_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const RETRY_MINUTES = 10;
const STALE_SENDING_MINUTES = 15;
const WIB_MS = 7 * 36e5;
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

let running = false;

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const satuBaris = (s) => String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim();   // cegah header injection di subjek
function safeUrl(u) { try { const x = new URL(String(u)); return x.protocol === "https:" ? x.href : ""; } catch (e) { return ""; } }
const wibDate = (d) => new Date(d.getTime() + WIB_MS).toISOString().slice(0, 10);

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mentoring_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        schedule_id INTEGER NOT NULL,
        guardian_id INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('h1', '1jam')),
        tanggal TEXT NOT NULL,
        mulai TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 1,
        last_error TEXT,
        sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(schedule_id, guardian_id, kind, tanggal, mulai),
        FOREIGN KEY(schedule_id) REFERENCES mentoring_schedules(id) ON DELETE CASCADE,
        FOREIGN KEY(guardian_id) REFERENCES student_guardians(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_mentoring_reminders_schedule ON mentoring_reminders(schedule_id);
  `);
}

function startOf(s) {   // tanggal & jam di database = WIB (UTC+7); hasil tidak bergantung zona waktu server
  const d = new Date(`${s.tanggal}T${s.mulai}:00+07:00`);
  return isNaN(d) ? null : d;
}
function tanggalIndo(tanggal) {
  const [y, m, d] = tanggal.split("-").map(Number);
  return `${HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${BULAN[m - 1]} ${y}`;
}
function parseAllowed(raw) {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map((g) => String(g).toUpperCase()) : []; } catch (_) { return []; }
}

function buildReminderEmail({ schedule: s, guardianName, studentName, kind, now = new Date(), institutionName = "Dieng Cyber Coding" }) {
  const label = kind === "1jam" ? "1 jam lagi" : s.tanggal === wibDate(now) ? "hari ini" : "besok";
  const anak = satuBaris(studentName);
  const sapaan = satuBaris(guardianName) || "Bapak/Ibu";
  const url = safeUrl(s.zoomUrl);
  const waktu = `${tanggalIndo(s.tanggal)}, pukul ${s.mulai}–${s.selesai} WIB`;
  const baris = [
    ["Jadwal", waktu], ["Mentoring", s.judul], s.jenis && ["Jenis", s.jenis], s.level && ["Level", s.level],
    s.mentor && ["Mentor", s.mentor], s.meetingId && ["Meeting ID", s.meetingId], s.passcode && ["Kode akses", s.passcode],
  ].filter(Boolean);

  const lines = [`Yth. ${sapaan},`, "", `Mengingatkan: ananda ${anak} ada jadwal mentoring ${label}.`, ""];
  baris.forEach(([k, v]) => lines.push(`${k}: ${satuBaris(v)}`));
  if (url) lines.push(`Link Zoom: ${url}`);
  if (s.keterangan) lines.push("", `Catatan: ${satuBaris(s.keterangan)}`);
  lines.push("", "Tips: bantu ananda membuka Zoom 5 menit sebelum mulai dan temani di dekatnya ya.", "",
    `Email ini dikirim karena Bapak/Ibu terdaftar sebagai wali ananda di ${institutionName}.`);
  const text = lines.join("\n");

  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b;line-height:1.5">
  <h2 style="margin:0 0 8px;color:#2f6df6">Pengingat mentoring ananda</h2>
  <p>Yth. ${esc(sapaan)}, ananda <b>${esc(anak)}</b> ada jadwal mentoring <b>${esc(label)}</b>.</p>
  <table style="border-collapse:collapse;width:100%;margin:12px 0">${baris.map(([k, v]) =>
    `<tr><td style="padding:6px 10px;background:#f1f5ff;font-weight:bold;width:110px;border:1px solid #e3e9ff">${esc(k)}</td><td style="padding:6px 10px;border:1px solid #e3e9ff">${esc(v)}</td></tr>`).join("")}</table>
  ${s.keterangan ? `<p style="color:#64748b">${esc(s.keterangan)}</p>` : ""}
  ${url ? `<p><a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:10px">Buka Link Zoom</a></p>` : ""}
  <p style="background:#fffbea;border-left:5px solid #ffc94d;padding:10px 12px"><b>Tips:</b> bantu ananda membuka Zoom 5 menit sebelum mulai dan temani di dekatnya ya.</p>
  <p style="font-size:12px;color:#94a3b8">Email ini dikirim karena Bapak/Ibu terdaftar sebagai wali ananda di ${esc(institutionName)}.</p>
</div>`;
  return { subject: satuBaris(`Pengingat mentoring ${anak}: ${s.judul} (${label})`), text, html };
}

// Satu penerima, satu jenis pengingat. true = kita yang berhak mengirim (belum pernah / boleh diulang).
function claim(db, scheduleId, guardianId, kind, s) {
  const ins = db.prepare("INSERT OR IGNORE INTO mentoring_reminders (schedule_id, guardian_id, kind, tanggal, mulai) VALUES (?, ?, ?, ?, ?)")
    .run(scheduleId, guardianId, kind, s.tanggal, s.mulai);
  if (ins.changes) return true;
  const upd = db.prepare(`UPDATE mentoring_reminders SET status = 'sending', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
    WHERE schedule_id = ? AND guardian_id = ? AND kind = ? AND tanggal = ? AND mulai = ? AND attempts < ?
      AND ((status = 'failed' AND updated_at <= datetime('now', ?)) OR (status = 'sending' AND updated_at <= datetime('now', ?)))`)
    .run(scheduleId, guardianId, kind, s.tanggal, s.mulai, MAX_ATTEMPTS, `-${RETRY_MINUTES} minutes`, `-${STALE_SENDING_MINUTES} minutes`);
  return upd.changes > 0;
}

// options: { mailer, now, logger, institutionName }
async function processReminders(db, options = {}) {
  const summary = { checked: 0, sent: 0, failed: 0, skipped: 0 };
  if (running) return { ...summary, busy: true };
  const mailer = options.mailer;
  if (!mailer || typeof mailer.send !== "function") throw new TypeError("options.mailer wajib berisi { send(message) }.");
  const now = options.now || new Date();
  const logger = options.logger || console;
  ensureTable(db);

  const dari = wibDate(new Date(now.getTime() - 864e5)), sampai = wibDate(new Date(now.getTime() + 2 * 864e5));
  const jadwal = db.prepare("SELECT * FROM mentoring_schedules WHERE tanggal >= ? AND tanggal <= ? ORDER BY tanggal, mulai, id").all(dari, sampai);

  const due = [];
  for (const row of jadwal) {
    const mulai = startOf(row); if (!mulai) continue;
    const menit = (mulai - now) / 6e4;
    const kind = menit > 60 && menit <= 24 * 60 ? "h1" : menit > 0 && menit <= 60 ? "1jam" : null;
    if (kind) due.push({ dto: scheduleDto(row), kind });
  }
  if (!due.length) return summary;

  const wali = db.prepare(`
    SELECT g.id AS guardian_id, g.name AS guardian_name, g.email AS guardian_email,
           u.id AS student_id, COALESCE(NULLIF(u.full_name, ''), u.username) AS student_name, u.allowed_grades
    FROM student_guardians g JOIN users u ON u.id = g.student_user_id
    WHERE u.role = 'student' AND u.status = 'active'
    ORDER BY g.id`).all();

  running = true;
  try {
    for (const { dto, kind } of due) {
      for (const w of wali) {
        if (!visibleForGrades(dto.grades, parseAllowed(w.allowed_grades))) continue;   // sama dengan aturan GET /api/jadwal
        const email = String(w.guardian_email || "").trim();
        if (!EMAIL_RE.test(email)) { summary.skipped += 1; continue; }
        summary.checked += 1;
        if (!claim(db, dto.id, w.guardian_id, kind, dto)) continue;

        try {
          const msg = buildReminderEmail({ schedule: dto, guardianName: w.guardian_name, studentName: w.student_name, kind, now, institutionName: options.institutionName });
          await mailer.send({ to: email, subject: msg.subject, text: msg.text, html: msg.html });
          db.prepare("UPDATE mentoring_reminders SET status = 'sent', sent_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE schedule_id = ? AND guardian_id = ? AND kind = ? AND tanggal = ? AND mulai = ?")
            .run(dto.id, w.guardian_id, kind, dto.tanggal, dto.mulai);
          summary.sent += 1;
        } catch (error) {
          const message = String((error && error.message) || error).slice(0, 300);
          db.prepare("UPDATE mentoring_reminders SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE schedule_id = ? AND guardian_id = ? AND kind = ? AND tanggal = ? AND mulai = ?")
            .run(message, dto.id, w.guardian_id, kind, dto.tanggal, dto.mulai);
          summary.failed += 1;
          logger.error(`[PENGINGAT JADWAL] gagal kirim (jadwal ${dto.id}, wali ${w.guardian_id}): ${message}`);
        }
      }
    }
  } finally {
    running = false;
  }
  return summary;
}

// Masalah konfigurasi yang membuat penjadwal tidak boleh jalan (aturan sama dengan email laporan).
function configurationProblems(env, options, normalizeProvider) {
  const problems = [];
  if (options.mailer) return problems;
  const explicit = String(options.provider || env.REPORT_EMAIL_PROVIDER || env.EMAIL_PROVIDER || "").trim();
  if (!explicit) { problems.push("REPORT_EMAIL_PROVIDER belum diatur (pilih mock, resend, atau smtp; tidak ada default)"); return problems; }
  let provider = null;
  try { provider = normalizeProvider(explicit); } catch (error) { problems.push(error.message); }
  if (provider === "resend" && !String(env.RESEND_API_KEY || "").trim()) problems.push("RESEND_API_KEY belum diatur untuk provider resend");
  if (provider === "smtp" && !String(env.SMTP_HOST || "").trim()) problems.push("SMTP_HOST belum diatur untuk provider smtp");
  if (provider === "mock" && String(env.NODE_ENV || "").toLowerCase() === "production" && options.allowMockInProduction !== true) {
    problems.push("provider mock tidak boleh dipakai di production (email ditandai terkirim tanpa dikirim)");
  }
  return problems;
}

// Mengembalikan null bila tidak aktif / konfigurasi belum lengkap; selain itu { runNow, stop }.
function startReminderScheduler(db, options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const enabled = options.enabled === undefined ? String(env.REMINDER_EMAIL_ENABLED || "").trim().toLowerCase() === "true" : Boolean(options.enabled);
  if (!enabled) return null;

  const { createMailer, normalizeProvider } = require("./mailer");
  const problems = configurationProblems(env, options, normalizeProvider);
  if (problems.length) {
    for (const p of problems) logger.error(`[PENGINGAT JADWAL] penjadwal TIDAK dijalankan: ${p}.`);
    return null;
  }
  const mailer = options.mailer || createMailer({ env, provider: options.provider, logger });

  const raw = options.intervalMinutes === undefined ? Number.parseInt(env.REMINDER_INTERVAL_MINUTES, 10) : Number(options.intervalMinutes);
  const minutes = Number.isSafeInteger(raw) && raw >= 1 ? raw : DEFAULT_INTERVAL_MINUTES;
  let stopped = false;

  async function runNow() {
    if (stopped) return null;
    try {
      const r = await processReminders(db, { ...options, mailer, logger });
      if (r.sent || r.failed) logger.log(`[PENGINGAT JADWAL] terkirim=${r.sent} gagal=${r.failed}`);
      return r;
    } catch (error) {
      logger.error(`[PENGINGAT JADWAL] error: ${error && error.message ? error.message : error}`);
      return null;
    }
  }
  const interval = setInterval(() => { void runNow(); }, minutes * 60 * 1000);
  const first = setTimeout(() => { void runNow(); }, 5000);
  if (interval.unref) interval.unref();
  if (first.unref) first.unref();
  logger.log(`[PENGINGAT JADWAL] aktif setiap ${minutes} menit.`);

  return { runNow, stop() { stopped = true; clearInterval(interval); clearTimeout(first); } };
}

module.exports = { ensureTable, buildReminderEmail, processReminders, startReminderScheduler };
