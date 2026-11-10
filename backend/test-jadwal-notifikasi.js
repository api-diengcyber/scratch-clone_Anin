"use strict";
// Uji otomatis: node test-jadwal-notifikasi.js   (Node 22+, tanpa pustaka tambahan)
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { buatTabel, kirimPengingat } = require("./jadwal-notifikasi");

const db = new DatabaseSync(":memory:");
buatTabel(db);
db.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, full_name TEXT, parent_email TEXT);
  INSERT INTO users VALUES ('budi','Budi Santoso','ortu.budi@mail.com'),('sari','Sari "Kecil" <b>','ortu.sari@mail.com'),
    ('dodi','Dodi','bukan-email'),('eka','Eka',''),('eka2','Eka Dua','ortu.eka@mail.com');`);

const WIB = (offsetMenit, base) => {   // {tanggal, mulai} dalam WIB untuk "base + offsetMenit"
  const t = new Date(base.getTime() + offsetMenit * 6e4 + 7 * 36e5);
  return { tanggal: t.toISOString().slice(0, 10), mulai: t.toISOString().slice(11, 16) };
};
const sekarang = new Date("2026-11-10T03:00:00Z");   // 10:00 WIB
const tambah = (menit, judul, zoom, peserta) => {
  const w = WIB(menit, sekarang);
  const id = db.prepare("INSERT INTO jadwal_mentoring (tanggal, mulai, judul, jenis, level, keterangan, zoom_url, passcode) VALUES (?,?,?,?,?,?,?,?)")
    .run(w.tanggal, w.mulai, judul, "Live Mentoring 1-on-1", "Scratch Level 1", "Siapkan project\r\nBcc: x@y.z", zoom, "belajar").lastInsertRowid;
  peserta.forEach((u) => db.prepare("INSERT INTO jadwal_peserta VALUES (?,?)").run(id, u));
  return id;
};
const A = tambah(20 * 60, "Game <script>alert(1)</script>", "javascript:alert(1)", ["budi", "sari", "dodi", "eka"]);   // 20 jam lagi → "besok"
const B = tambah(30, "Mentoring B\r\nBcc: jahat@x.com", "https://zoom.us/j/123", ["budi"]);                              // 30 menit lagi → "1 jam"
const H = tambah(5 * 60, "Sesi sore", "https://zoom.us/j/9", ["eka2"]);   // 5 jam lagi, masih hari yang sama → "hari ini"
tambah(3 * 24 * 60, "Terlalu jauh", "https://zoom.us/j/1", ["budi"]);
tambah(-120, "Sudah lewat", "https://zoom.us/j/1", ["budi"]);

const terkirim = []; let gagalSekali = true;
const kirim = async (m) => { if (m.to === "ortu.sari@mail.com" && gagalSekali) { gagalSekali = false; throw new Error("SMTP down"); } terkirim.push(m); };
const log = { log() {}, error() {} };
const jalan = (t) => kirimPengingat({ db, kirim, sekarang: t, siteUrl: "https://diengcyber.id/", log });

(async () => {
  // 1. putaran pertama: A (budi, sari*) dan B (budi). sari gagal sekali → belum terkirim
  let n = await jalan(sekarang);
  assert.equal(n, 3, "budi-A, budi-B, eka2-H terkirim; sari gagal; dodi/eka dilewati");
  assert.deepEqual(terkirim.map((m) => m.to).sort(), ["ortu.budi@mail.com", "ortu.budi@mail.com", "ortu.eka@mail.com"]);

  // 2. putaran kedua: sari dicoba ulang (hanya sari), yang lain tidak dobel
  n = await jalan(sekarang);
  assert.equal(n, 1); assert.equal(terkirim.at(-1).to, "ortu.sari@mail.com");

  // 3. putaran ketiga: tidak ada yang dobel
  assert.equal(await jalan(sekarang), 0);

  // 4. isi email
  const emailA = terkirim.find((m) => m.to === "ortu.sari@mail.com");
  assert.ok(!emailA.html.includes("<script>"), "judul harus di-escape");
  assert.ok(!emailA.html.includes("javascript:"), "link non-https dibuang");
  assert.ok(emailA.html.includes("Sari &quot;Kecil&quot; &lt;b&gt;"), "nama di-escape");
  assert.ok(emailA.subject.includes("(besok)") && !/[\r\n]/.test(emailA.subject), "subjek satu baris");
  assert.ok(emailA.text.includes("WIB") && emailA.text.includes("https://diengcyber.id/orangtua/jadwal.html"));
  const emailB = terkirim.find((m) => m.subject.includes("1 jam lagi"));
  assert.ok(emailB && !/[\r\n]/.test(emailB.subject), "subjek B aman dari header injection");
  assert.ok(emailB.html.includes('href="https://zoom.us/j/123"') && emailB.html.includes("belajar"));
  assert.ok(!emailB.text.includes("Bcc: x@y.z") || !/^Bcc:/m.test(emailB.text), "keterangan tidak bisa menyisipkan header");

  // 4b. jadwal di hari yang sama dilabeli "hari ini", bukan "besok"
  assert.ok(terkirim.find((m) => m.to === "ortu.eka@mail.com").subject.includes("(hari ini)"));

  // 5. waktu maju ke 30 menit sebelum A → pengingat "1 jam" untuk A (budi & sari), B tidak dobel
  const nanti = new Date(sekarang.getTime() + (20 * 60 - 30) * 6e4);
  n = await jalan(nanti);
  assert.equal(n, 2, "A dapat pengingat '1 jam lagi' untuk budi & sari");
  assert.ok(terkirim.slice(-2).every((m) => m.subject.includes("1 jam lagi")));

  console.log("SEMUA TES LULUS (" + terkirim.length + " email terkirim dalam simulasi)");
  console.log("\nContoh subjek:", emailA.subject, "\n\n" + emailA.text);
})().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
