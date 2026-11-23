"use strict";

// ------------------------------------------------------------
// GERBANG PEMBAYARAN — TITIK SAMBUNG UNTUK GATEWAY
//
// Saat ini hanya provider `manual`: siswa transfer ke rekening lembaga lalu
// admin mengonfirmasi. Modul ini memusatkan pembuatan instruksi pembayaran
// supaya gateway (Midtrans/Xendit/Tripay) nanti cukup:
//   1. menambah nama provider di PROVIDERS,
//   2. mengisi `paymentUrl`/`redirectUrl` di instructionsFor(),
//   3. memanggil subscriptionService.confirmPayment() dari webhook.
//
// Kontrak respons ke frontend tidak berubah: `instructions` selalu punya
// bentuk yang sama, hanya `provider` dan `paymentUrl` yang berbeda.
// ------------------------------------------------------------

const PROVIDERS = ["manual"];
const DEFAULT_PROVIDER = "manual";

function providerName(env = process.env) {
  const raw = String(env.SUBSCRIPTION_GATEWAY || DEFAULT_PROVIDER).trim().toLowerCase();
  return PROVIDERS.includes(raw) ? raw : DEFAULT_PROVIDER;
}

function rupiah(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return Math.round(num).toLocaleString("id-ID");
}

function paymentTotal(payment) {
  return Number(payment.total || payment.price || 0);
}

function paymentExpiry(payment) {
  return payment.expiresOn || payment.expires_on || null;
}

// Instruksi transfer manual. Kalau rekening belum diatur di env, siswa diminta
// menghubungi admin agar tidak menampilkan tujuan transfer yang salah.
function manualInstructions(payment, env = process.env) {
  const bankName = String(env.SUBSCRIPTION_BANK_NAME || "").trim();
  const accountNumber = String(env.SUBSCRIPTION_BANK_ACCOUNT || "").trim();
  const accountHolder = String(env.SUBSCRIPTION_BANK_HOLDER || "").trim();
  const custom = String(env.SUBSCRIPTION_PAYMENT_NOTE || "").trim();
  const total = paymentTotal(payment);
  const code = payment.code || "";

  return {
    provider: "manual",
    method: payment.method || "Transfer Bank",
    code,
    total,
    expiresOn: paymentExpiry(payment),
    bankName: bankName || null,
    accountNumber: accountNumber || null,
    accountHolder: accountHolder || null,
    note: custom || (bankName
      ? `Transfer tepat Rp${rupiah(total)} dan cantumkan kode ${code} pada berita transfer.`
      : "Hubungi admin untuk instruksi pembayaran."),
    paymentUrl: null,
    redirectUrl: null
  };
}

function instructionsFor(payment, env = process.env) {
  const provider = providerName(env);
  // Provider gateway ditambahkan di sini saat sudah dipilih. Untuk sekarang
  // semua provider yang belum dikenal tetap memakai instruksi manual.
  switch (provider) {
    case "manual":
    default:
      return manualInstructions(payment, env);
  }
}

function capabilities(env = process.env) {
  const provider = providerName(env);
  return {
    provider,
    manual: provider === "manual",
    redirect: false,
    webhook: false
  };
}

module.exports = {
  PROVIDERS,
  DEFAULT_PROVIDER,
  providerName,
  instructionsFor,
  manualInstructions,
  capabilities
};
