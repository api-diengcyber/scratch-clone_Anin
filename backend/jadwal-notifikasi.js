"use strict";
// ============================================================
// PENGINGAT JADWAL MENTORING → EMAIL ORANG TUA
//
// Setiap 5 menit modul ini mengecek jadwal mentoring yang akan datang, lalu mengirim email ke
// email orang tua dari tiap murid peserta:
//   • "besok"/"hari ini" : sekali, saat jadwal tinggal ≤ 24 jam (dan masih > 1 jam)
//   • "1 jam lagi" : sekali, saat jadwal tinggal ≤ 1 jam
// Tiap email dicatat di tabel jadwal_notif_log, jadi tidak pernah terkirim dobel
// (aman walau server restart). Kalau pengiriman gagal, otomatis dicoba lagi di pengecekan berikutnya.
//
// PEMASANGAN (di backend/server.js):
//   npm i nodemailer
//   const { buatTabel, mulaiPengingat } = require("./jadwal-notifikasi");
//   buatTabel(db);            // db = koneksi SQLite yang sudah dipakai server (better-sqlite3 / node:sqlite)
//   mulaiPengingat({ db });   // setelah app.listen(...)
//
// ENV (file .env): SMTP_HOST, SMTP_PORT (587), SMTP_SECURE (true untuk port 465), SMTP_USER, SMTP_PASS,
//                  MAIL_FROM ("Dieng Cyber Coding <no-reply@domain.com>"), SITE_URL (https://domain.com)
//
// YANG PERLU DISESUAIKAN: nama tabel/kolom murid di OPSI_USER (sesuaikan dengan skema SQLite Anda).
// ============================================================

const OPSI_USER = {
  tabel: "users",
  kolomUsername: "username",
  kolomNama: "full_name",
  kolomEmailOrtu: "parent_email",
};
const INTERVAL_MENIT = 5;
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

function ident(nama) {   // nama tabel/kolom disisipkan ke SQL → hanya huruf, angka, underscore
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nama)) throw new Error("Nama tabel/kolom tidak valid: " + nama);
  return nama;
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const satuBaris = (s) => String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim();   // cegah header injection di subjek
function safeUrl(u) { try { const x = new URL(String(u)); return x.protocol === "https:" ? x.href : ""; } catch (e) { return ""; } }

function buatTabel(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jadwal_mentoring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT NOT NULL,          -- YYYY-MM-DD (WIB)
      mulai TEXT NOT NULL,            -- HH:MM (WIB)
      selesai TEXT,
      judul TEXT NOT NULL,
      jenis TEXT, level TEXT, keterangan TEXT, mentor TEXT,
      zoom_url TEXT, meeting_id TEXT, passcode TEXT
    );
    CREATE TABLE IF NOT EXISTS jadwal_peserta (
      jadwal_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      PRIMARY KEY (jadwal_id, username)
    );
    CREATE TABLE IF NOT EXISTS jadwal_notif_log (
      jadwal_id INTEGER NOT NULL,
      jenis TEXT NOT NULL,
      username TEXT NOT NULL,
      dikirim_at TEXT NOT NULL,
      PRIMARY KEY (jadwal_id, jenis, username)
    );
  `);
}

function waktuMulai(j) {   // jam di database = WIB (UTC+7), hasilnya tidak bergantung zona waktu server
  const d = new Date(`${j.tanggal}T${j.mulai}:00+07:00`);
  return isNaN(d) ? null : d;
}
function tanggalIndo(tanggal) {
  const [y, m, d] = tanggal.split("-").map(Number);
  return `${HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${BULAN[m - 1]} ${y}`;
}

function buatEmail(j, murid, jenis, siteUrl, sekarang = new Date()) {
  const hariIniWib = new Date(sekarang.getTime() + 7 * 36e5).toISOString().slice(0, 10);
  const label = jenis === "1jam" ? "1 jam lagi" : j.tanggal === hariIniWib ? "hari ini" : "besok";
  const nama = satuBaris(murid.nama || murid.username);
  const url = safeUrl(j.zoom_url);
  const waktu = `${tanggalIndo(j.tanggal)}, pukul ${j.mulai}${j.selesai ? "–" + j.selesai : ""} WIB`;
  const linkJadwal = (siteUrl || "").replace(/\/+$/, "") + "/orangtua/jadwal.html";
  const baris = [
    ["Jadwal", waktu], ["Mentoring", j.judul], j.jenis && ["Jenis", j.jenis], j.level && ["Level", j.level],
    j.mentor && ["Mentor", j.mentor], j.meeting_id && ["Meeting ID", j.meeting_id], j.passcode && ["Kode akses", j.passcode],
  ].filter(Boolean);

  const text = [
    `Yth. Bapak/Ibu,`, ``,
    `Mengingatkan: ananda ${nama} ada jadwal mentoring ${label}.`, ``,
    ...baris.map(([k, v]) => `${k}: ${satuBaris(v)}`),
    url ? `Link Zoom: ${url}` : "",
    j.keterangan ? `\nCatatan: ${satuBaris(j.keterangan)}` : "",
    ``, `Tips: bantu ananda membuka Zoom 5 menit sebelum mulai dan temani di dekatnya ya.`,
    `Lihat jadwal ananda: ${linkJadwal}`, ``,
    `Email ini dikirim karena alamat Bapak/Ibu terdaftar sebagai email orang tua di Dieng Cyber Coding.`,
  ].filter((x) => x !== "").join("\n");

  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b;line-height:1.5">
  <h2 style="margin:0 0 8px;color:#2f6df6">Pengingat mentoring ananda</h2>
  <p>Yth. Bapak/Ibu, ananda <b>${esc(nama)}</b> ada jadwal mentoring <b>${esc(label)}</b>.</p>
  <table style="border-collapse:collapse;width:100%;margin:12px 0">${baris.map(([k, v]) =>
    `<tr><td style="padding:6px 10px;background:#f1f5ff;font-weight:bold;width:110px;border:1px solid #e3e9ff">${esc(k)}</td><td style="padding:6px 10px;border:1px solid #e3e9ff">${esc(v)}</td></tr>`).join("")}</table>
  ${j.keterangan ? `<p style="color:#64748b">${esc(j.keterangan)}</p>` : ""}
  ${url ? `<p><a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:10px">Buka Link Zoom</a></p>` : ""}
  <p style="background:#fffbea;border-left:5px solid #ffc94d;padding:10px 12px">👨‍👩‍👧 <b>Tips:</b> bantu ananda membuka Zoom 5 menit sebelum mulai dan temani di dekatnya ya.</p>
  <p><a href="${esc(linkJadwal)}">Lihat jadwal ananda</a></p>
  <p style="font-size:12px;color:#94a3b8">Email ini dikirim karena alamat Bapak/Ibu terdaftar sebagai email orang tua di Dieng Cyber Coding.</p>
</div>`;
  return { subject: satuBaris(`Pengingat mentoring ${nama}: ${j.judul} (${label})`), text, html };
}

// Satu putaran pengecekan. Mengembalikan jumlah email yang berhasil dikirim.
async function kirimPengingat({ db, kirim, sekarang = new Date(), siteUrl = process.env.SITE_URL || "", log = console }) {
  const U = OPSI_USER, T = ident(U.tabel), kUser = ident(U.kolomUsername), kNama = ident(U.kolomNama), kMail = ident(U.kolomEmailOrtu);
  const ymd = (d) => d.toISOString().slice(0, 10);
  const jadwal = db.prepare("SELECT * FROM jadwal_mentoring WHERE tanggal >= ? AND tanggal <= ?")
    .all(ymd(new Date(sekarang.getTime() - 864e5)), ymd(new Date(sekarang.getTime() + 2 * 864e5)));
  let terkirim = 0;

  for (const j of jadwal) {
    const mulai = waktuMulai(j); if (!mulai) continue;
    const menit = (mulai - sekarang) / 6e4;
    const jenis = menit > 60 && menit <= 24 * 60 ? "h1" : menit > 0 && menit <= 60 ? "1jam" : null;
    if (!jenis) continue;

    const peserta = db.prepare(
      `SELECT u.${kUser} AS username, u.${kNama} AS nama, u.${kMail} AS email FROM jadwal_peserta p JOIN ${T} u ON u.${kUser} = p.username WHERE p.jadwal_id = ?`
    ).all(j.id);

    for (const m of peserta) {
      const email = String(m.email || "").trim();
      if (!EMAIL_RE.test(email)) continue;                       // tanpa email orang tua yang valid → lewati
      const r = db.prepare("INSERT OR IGNORE INTO jadwal_notif_log (jadwal_id, jenis, username, dikirim_at) VALUES (?, ?, ?, ?)")
        .run(j.id, jenis, m.username, sekarang.toISOString());
      if (!r.changes) continue;                                  // sudah pernah dikirim
      try {
        await kirim({ to: email, ...buatEmail(j, m, jenis, siteUrl, sekarang) });
        terkirim++;
      } catch (e) {
        db.prepare("DELETE FROM jadwal_notif_log WHERE jadwal_id = ? AND jenis = ? AND username = ?").run(j.id, jenis, m.username);   // coba lagi nanti
        log.error("[jadwal-notifikasi] gagal kirim ke", email, "-", e && e.message);
      }
    }
  }
  return terkirim;
}

function buatKirimSmtp(env = process.env) {
  let nodemailer;
  try { nodemailer = require("nodemailer"); } catch (e) { throw new Error("Pasang dulu: npm i nodemailer"); }
  if (!env.SMTP_HOST) throw new Error("SMTP_HOST belum diisi di .env");
  const t = nodemailer.createTransport({
    host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  const from = env.MAIL_FROM || env.SMTP_USER;
  return (pesan) => t.sendMail({ from, ...pesan });
}

function mulaiPengingat({ db, kirim, siteUrl, log = console } = {}) {
  if (!db) throw new Error("mulaiPengingat butuh { db }");
  const kirimEmail = kirim || buatKirimSmtp();
  let jalan = false;
  const putaran = async () => {
    if (jalan) return;   // jangan tumpang tindih kalau SMTP lambat
    jalan = true;
    try { const n = await kirimPengingat({ db, kirim: kirimEmail, siteUrl, log }); if (n) log.log("[jadwal-notifikasi] terkirim:", n); }
    catch (e) { log.error("[jadwal-notifikasi] error:", e && e.message); }
    finally { jalan = false; }
  };
  putaran();
  const timer = setInterval(putaran, INTERVAL_MENIT * 60 * 1000);
  if (timer.unref) timer.unref();
  return () => clearInterval(timer);
}

module.exports = { buatTabel, kirimPengingat, mulaiPengingat, buatEmail, buatKirimSmtp };
