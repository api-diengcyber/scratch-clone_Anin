#!/usr/bin/env node
"use strict";

// Audit konsistensi data langganan (READ-ONLY).
//   node audit-subscription-consistency.js
//   DB_PATH=/data/database.sqlite npm run audit:subscription
//
// Fokus pada hal yang bisa membuat laporan/keuangan salah:
//   - tanggal/durasi langganan tidak valid,
//   - invoice lunas tetapi transaksi Finance belum lunas (atau sebaliknya),
//   - invoice yatim (siswa/transaksi tidak ada),
//   - beberapa invoice pending sekaligus untuk satu siswa,
//   - langganan lama tanpa jejak pembayaran (informasional).
// Skrip ini tidak mengubah apa pun. Exit 1 bila ada masalah kritis.

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.DB_PATH || path.join(__dirname, "database.sqlite");
if (!fs.existsSync(dbPath)) {
  console.error(`Database tidak ditemukan: ${dbPath}`);
  process.exit(2);
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
db.pragma("busy_timeout = 5000");

function rows(sql, ...params) {
  try {
    return db.prepare(sql).all(...params);
  } catch (error) {
    console.error("Query gagal:", error.message);
    return [];
  }
}

const checks = [
  {
    key: "invalid_subscription_date",
    label: "Tanggal mulai langganan tidak valid",
    critical: true,
    sql: `SELECT id, username, subscription_started_at FROM users
          WHERE subscription_started_at IS NOT NULL
            AND subscription_started_at NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`
  },
  {
    key: "invalid_subscription_months",
    label: "Durasi langganan di luar 1-36 bulan",
    critical: true,
    sql: `SELECT id, username, subscription_months FROM users
          WHERE subscription_months IS NOT NULL
            AND (subscription_months < 1 OR subscription_months > 36)`
  },
  {
    key: "orphan_payment_student",
    label: "Invoice langganan tanpa siswa",
    critical: true,
    sql: `SELECT p.id, p.code, p.student_user_id FROM subscription_payments p
          LEFT JOIN users u ON u.id = p.student_user_id
          WHERE u.id IS NULL`
  },
  {
    key: "paid_payment_unpaid_finance",
    label: "Invoice lunas tetapi transaksi Finance belum lunas",
    critical: true,
    sql: `SELECT p.id, p.code, p.finance_transaction_id, f.status AS finance_status
          FROM subscription_payments p
          LEFT JOIN finance_transactions f ON f.id = p.finance_transaction_id
          WHERE p.status = 'paid' AND p.finance_transaction_id IS NOT NULL
            AND (f.id IS NULL OR f.status <> 'paid')`
  },
  {
    key: "paid_finance_unpaid_payment",
    label: "Transaksi Finance lunas tetapi invoice langganan belum lunas",
    critical: true,
    sql: `SELECT f.id, f.code, p.id AS payment_id, p.status AS payment_status
          FROM finance_transactions f
          JOIN subscription_payments p ON p.finance_transaction_id = f.id
          WHERE f.status = 'paid' AND p.status <> 'paid'`
  },
  {
    key: "multiple_pending_invoices",
    label: "Siswa punya lebih dari satu invoice pending",
    critical: false,
    sql: `SELECT student_user_id, COUNT(*) AS total
          FROM subscription_payments
          WHERE status = 'pending'
          GROUP BY student_user_id
          HAVING total > 1`
  },
  {
    key: "subscription_without_payment",
    label: "Langganan aktif tanpa jejak pembayaran (data lama/manual)",
    critical: false,
    sql: `SELECT u.id, u.username, u.subscription_started_at, u.subscription_months
          FROM users u
          WHERE u.role = 'student'
            AND u.subscription_started_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM subscription_payments p
              WHERE p.student_user_id = u.id AND p.status = 'paid'
            )`
  }
];

let criticalCount = 0;
let warningCount = 0;

console.log(`Audit konsistensi langganan: ${dbPath}`);
console.log("");

for (const check of checks) {
  const found = rows(check.sql);
  if (found.length) {
    if (check.critical) criticalCount += found.length;
    else warningCount += found.length;
    console.log(`[${check.critical ? "KRITIS" : "INFO"}] ${check.label}: ${found.length}`);
    for (const row of found.slice(0, 5)) {
      console.log("   " + JSON.stringify(row));
    }
    if (found.length > 5) console.log(`   ... dan ${found.length - 5} baris lain`);
  } else {
    console.log(`[OK] ${check.label}`);
  }
}

db.close();

console.log("");
console.log(`Ringkasan: ${criticalCount} masalah kritis, ${warningCount} catatan informasi.`);
process.exit(criticalCount ? 1 : 0);
