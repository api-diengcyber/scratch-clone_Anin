"use strict";

// Index untuk query yang rutin jalan di latar belakang:
//   - expirePending(): subscription_payments(status, expires_on)
//   - remindExpiring(): users(role, status, subscription_started_at)
//   - pembersihan sesi idle: sessions(last_seen_at)
// Index lama tetap dipertahankan; yang ini melengkapi kolom kedua.
module.exports.up = (db) => {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_subscription_payments_expires
      ON subscription_payments(status, expires_on);

    CREATE INDEX IF NOT EXISTS idx_users_subscription_active
      ON users(role, status, subscription_started_at)
      WHERE subscription_started_at IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_sessions_last_seen
      ON sessions(last_seen_at);
  `);
};
