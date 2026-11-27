"use strict";

// Migrasi untuk menambahkan kolom promo_code ke tabel subscription_payments
module.exports.up = (db) => {
  const columns = db.prepare("PRAGMA table_info(subscription_payments)").all().map((c) => c.name);
  if (!columns.includes("promo_code")) {
    db.exec("ALTER TABLE subscription_payments ADD COLUMN promo_code TEXT NOT NULL DEFAULT '';");
  }
};
