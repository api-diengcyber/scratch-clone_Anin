"use strict";

// ------------------------------------------------------------
// TEMPLATE EMAIL PENGINGAT SESI MENTORING ZOOM
//
// Menyusun subjek, versi teks (plain text), dan HTML yang ramah seluler
// untuk pengingat sesi kelas mentoring online.
// ------------------------------------------------------------

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function cleanText(value, max = 200) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, " ")
    .trim()
    .slice(0, max);
}

function formatTanggalIndo(tanggalStr) {
  // Format YYYY-MM-DD -> Hari, DD Bulan YYYY
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tanggalStr))) return tanggalStr;
  const [year, month, day] = tanggalStr.split("-").map(Number);
  const bulanIndo = [
    "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  return `${day} ${bulanIndo[month] || month} ${year}`;
}

function composeMentoringReminderEmail({ recipientName, schedule, minutesBefore = 30 }) {
  const name = cleanText(recipientName || "Siswa", 80);
  const judul = cleanText(schedule.judul || "Sesi Mentoring Koding", 120);
  const mentor = cleanText(schedule.mentor || "Instruktur DCC", 80);
  const tanggal = formatTanggalIndo(schedule.tanggal);
  const jamMulai = cleanText(schedule.mulai, 10);
  const jamSelesai = cleanText(schedule.selesai, 10);
  const zoomUrl = String(schedule.zoom_url || "").trim();
  const meetingId = cleanText(schedule.meeting_id, 50);
  const passcode = cleanText(schedule.passcode, 50);
  const keterangan = cleanText(schedule.keterangan, 300);

  const subject = `[Pengingat Mentoring] ${minutesBefore} Menit Lagi: ${judul}`;

  // Plain Text Version
  const textLines = [
    `Halo ${name},`,
    "",
    `Sesi mentoring online kamu akan dimulai dalam waktu ${minutesBefore} menit lagi!`,
    "",
    "--- RINCIAN SESI ---",
    `Judul   : ${judul}`,
    `Mentor  : ${mentor}`,
    `Waktu   : ${tanggal}, ${jamMulai} - ${jamSelesai} WIB`,
    ...(keterangan ? [`Catatan : ${keterangan}`] : []),
    "",
    "--- AKSES ZOOM MEETING ---",
    `Tautan Masuk : ${zoomUrl || "Dapat diakses di portal Ruang KKA"}`,
    ...(meetingId ? [`Meeting ID   : ${meetingId}`] : []),
    ...(passcode ? [`Passcode     : ${passcode}`] : []),
    "",
    "Mohon persiapkan perangkat, koneksi internet, dan modul pembelajaran kamu.",
    "Sampai jumpa di kelas!",
    "",
    "--",
    "Dieng Cyber Coding (Ruang KKA)",
    "Belajar Koding Interaktif untuk Masa Depan Digital"
  ];

  // Responsive HTML Version
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);">
    <!-- Header -->
    <tr>
      <td style="padding: 28px 24px; background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); text-align: center;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
          Ruang KKA &bull; Dieng Cyber Coding
        </h1>
        <p style="margin: 6px 0 0; font-size: 14px; color: #e0e7ff; font-weight: 500;">
          Pengingat Sesi Mentoring Online
        </p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding: 32px 24px;">
        <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #cbd5e1;">
          Halo <strong style="color: #ffffff;">${escapeHtml(name)}</strong>,
        </p>
        <p style="margin: 0 0 24px; font-size: 15px; line-height: 24px; color: #94a3b8;">
          Kelas mentoring koding kamu akan segera dimulai dalam waktu <strong style="color: #38bdf8;">${minutesBefore} menit</strong>. Pastikan kamu sudah bersiap sebelum jam masuk!
        </p>

        <!-- Sesi Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; border: 1px solid #334155; margin-bottom: 24px;">
          <tr>
            <td style="padding: 20px;">
              <h2 style="margin: 0 0 12px; font-size: 18px; color: #ffffff; font-weight: 700;">
                ${escapeHtml(judul)}
              </h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px; color: #cbd5e1;">
                <tr>
                  <td style="padding: 4px 0; width: 90px; color: #64748b;">Mentor</td>
                  <td style="padding: 4px 0; font-weight: 600; color: #f1f5f9;">${escapeHtml(mentor)}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #64748b;">Waktu</td>
                  <td style="padding: 4px 0; font-weight: 600; color: #38bdf8;">${escapeHtml(tanggal)}, ${escapeHtml(jamMulai)} - ${escapeHtml(jamSelesai)} WIB</td>
                </tr>
                ${keterangan ? `
                <tr>
                  <td style="padding: 4px 0; color: #64748b; vertical-align: top;">Catatan</td>
                  <td style="padding: 4px 0; color: #cbd5e1;">${escapeHtml(keterangan)}</td>
                </tr>` : ""}
              </table>
            </td>
          </tr>
        </table>

        <!-- Zoom Action -->
        ${zoomUrl ? `
        <div style="text-align: center; margin: 32px 0 24px;">
          <a href="${escapeHtml(zoomUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0284c7; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);">
            Gabung Sesi Zoom Sekarang
          </a>
        </div>
        ` : ""}

        ${(meetingId || passcode) ? `
        <div style="background-color: #1e293b; padding: 12px 16px; border-radius: 8px; border: 1px dashed #475569; font-size: 13px; color: #94a3b8; text-align: center; margin-bottom: 24px;">
          ${meetingId ? `<span>Meeting ID: <strong style="color: #f8fafc;">${escapeHtml(meetingId)}</strong></span>` : ""}
          ${(meetingId && passcode) ? ` &bull; ` : ""}
          ${passcode ? `<span>Passcode: <strong style="color: #f8fafc;">${escapeHtml(passcode)}</strong></span>` : ""}
        </div>
        ` : ""}

        <p style="margin: 0; font-size: 13px; line-height: 20px; color: #64748b; text-align: center;">
          Jika tombol tidak berfungsi, salin dan buka tautan berikut di browsermu:<br>
          <span style="color: #38bdf8; word-break: break-all;">${escapeHtml(zoomUrl || "-")}</span>
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 20px 24px; background-color: #0f172a; border-top: 1px solid #334155; text-align: center; font-size: 12px; color: #64748b;">
        <p style="margin: 0 0 4px;">Email ini dikirim otomatis oleh sistem <strong>Ruang KKA &bull; Dieng Cyber Coding</strong>.</p>
        <p style="margin: 0;">&copy; ${new Date().getFullYear()} Dieng Cyber Coding. Seluruh hak cipta dilindungi.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    text: textLines.join("\n"),
    html
  };
}

module.exports = {
  composeMentoringReminderEmail,
  formatTanggalIndo
};
