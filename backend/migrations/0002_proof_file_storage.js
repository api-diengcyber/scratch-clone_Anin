"use strict";

const fs = require("fs");
const path = require("path");

// Tambahkan kolom proof_path pada subscription_payments untuk menyimpan path berkas bukti transfer di disk.
// Migrasikan isi proof_data lama (base64) ke berkas fisik jika ada, lalu kosongkan proof_data
// agar basis data SQLite tetap ramping.
module.exports.up = (db) => {
  const cols = db.prepare("PRAGMA table_info(subscription_payments)").all().map((c) => c.name);
  if (!cols.includes("proof_path")) {
    db.exec("ALTER TABLE subscription_payments ADD COLUMN proof_path TEXT NOT NULL DEFAULT ''");
  }

  // Cari berkas proof_data yang masih tersimpan langsung sebagai base64 di database
  const rows = db.prepare(`
    SELECT id, proof_name, proof_mime, proof_data
    FROM subscription_payments
    WHERE proof_data <> '' AND (proof_path = '' OR proof_path IS NULL)
  `).all();

  if (rows.length > 0) {
    const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads", "proofs");
    fs.mkdirSync(uploadDir, { recursive: true });

    const EXT_MAP = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "application/pdf": "pdf"
    };

    const update = db.prepare(`
      UPDATE subscription_payments
      SET proof_path = ?, proof_data = ''
      WHERE id = ?
    `);

    for (const row of rows) {
      try {
        const ext = EXT_MAP[row.proof_mime] || "bin";
        const filename = `proof-${row.id}-${Date.now()}.${ext}`;
        const filePath = path.join(uploadDir, filename);
        const buffer = Buffer.from(row.proof_data, "base64");
        fs.writeFileSync(filePath, buffer);
        update.run(filename, row.id);
      } catch (err) {
        console.warn(`[MIGRASI] Gagal memindahkan bukti transfer pembayaran #${row.id}:`, err.message);
      }
    }
  }
};
