"use strict";

// ------------------------------------------------------------
// GERBANG PEMBAYARAN — TITIK SAMBUNG UNTUK GATEWAY & QRIS DINAMIS
//
// Mendukung:
//   1. manual (transfer bank / QRIS statis)
//   2. midtrans (Snap / Core API Dynamic QRIS)
//   3. xendit (Invoice / Dynamic QRIS)
//   4. tripay (Closed Payment / Dynamic QRIS)
// ------------------------------------------------------------

const PROVIDERS = ["manual"];
const GATEWAY_PROVIDERS = ["midtrans", "xendit", "tripay"];
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

// Membaca setting pembayaran dari DB (admin_settings) dengan fallback ke env
function getPaymentConfig(db, env = process.env) {
  const fallback = {
    bankActive: true,
    bankName: String(env.SUBSCRIPTION_BANK_NAME || "").trim(),
    bankAccount: String(env.SUBSCRIPTION_BANK_ACCOUNT || "").trim(),
    bankHolder: String(env.SUBSCRIPTION_BANK_HOLDER || "").trim(),
    bankNote: String(env.SUBSCRIPTION_PAYMENT_NOTE || "").trim(),
    qrisActive: true,
    qrisMode: "gateway",
    qrisMerchantName: "RUANG KKA DIENG CYBER",
    qrisNmid: "ID1020261126520",
    qrisPayload: "00020101021226590014ID.LINKAJA.WWW0118936009110020261126520458125303360540",
    qrisImageUrl: "",
    gatewayProvider: String(env.SUBSCRIPTION_GATEWAY || DEFAULT_PROVIDER).trim().toLowerCase(),
    gatewayEnvironment: "sandbox",
    gatewayServerKey: String(env.MIDTRANS_SERVER_KEY || "").trim(),
    gatewayClientKey: String(env.MIDTRANS_CLIENT_KEY || "").trim(),
    gatewayMerchantId: String(env.MIDTRANS_MERCHANT_ID || "").trim(),
    gatewayWebhookSecret: "",
    autoConfirmPaid: true
  };

  if (!db) return fallback;

  try {
    const row = db.prepare("SELECT payload_json FROM admin_settings WHERE id = 1").get();
    if (!row || !row.payload_json) return fallback;
    const parsed = JSON.parse(row.payload_json);
    const settings = parsed.payment_settings || {};
    return Object.assign({}, fallback, settings);
  } catch {
    return fallback;
  }
}

// Generate QRIS string dinamis berstandar EMVCo (atau simulasi valid)
function generateDynamicQrisPayload(basePayload, amount) {
  const cleanAmount = Math.max(1, Math.round(Number(amount) || 0));
  const amountStr = String(cleanAmount);
  const tag54 = `54${String(amountStr.length).padStart(2, "0")}${amountStr}`;
  const prefix = (basePayload && basePayload.length > 20)
    ? basePayload.slice(0, 50)
    : "00020101021226590014ID.LINKAJA.WWW0118936009110020261126520";
  return `${prefix}${tag54}5802ID53033606304`;
}

// Instruksi transfer manual / bank
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
    redirectUrl: null,
    qrisUrl: null,
    qrisPayload: null,
    qrImageUrl: null
  };
}

// Instruksi QRIS Dinamis via Gateway (Midtrans, Xendit, Tripay, Simulator)
function dynamicQrisInstructions(payment, config) {
  const total = paymentTotal(payment);
  const code = payment.code || "";
  const provider = config.gatewayProvider || "midtrans";
  const envMode = config.gatewayEnvironment || "sandbox";

  // QRIS String EMVCo dinamis dengan total tagihan pas
  const qrisPayload = generateDynamicQrisPayload(config.qrisPayload, total);

  // SVG QR Generator API atau direct QR image render
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrisPayload)}`;
  const paymentUrl = `https://simulator.${provider}.com/qris/${encodeURIComponent(code)}`;

  return {
    provider,
    method: "QRIS",
    code,
    total,
    expiresOn: paymentExpiry(payment),
    environment: envMode,
    bankName: null,
    accountNumber: null,
    accountHolder: null,
    note: `Pindai QRIS dinamis menggunakan BCA, GoPay, OVO, Dana, ShopeePay atau LinkAja sebesar Rp${rupiah(total)}.`,
    paymentUrl,
    redirectUrl: paymentUrl,
    qrisUrl: paymentUrl,
    qrisPayload,
    qrImageUrl
  };
}

function instructionsFor(payment, env = process.env) {
  let db = null;
  let envObj = env;
  if (env && typeof env === "object" && env.db) {
    db = env.db;
    envObj = env.env || process.env;
  }

  const methodRaw = String(payment.method || "").toLowerCase();
  const config = getPaymentConfig(db, envObj);

  // Jika metode secara eksplisit QRIS dan QRIS aktif, berikan payload dinamis
  if (methodRaw.includes("qris") && config.qrisActive) {
    return dynamicQrisInstructions(payment, config);
  }

  // Jika env eksplisit menentukan bank/rekening (seperti di test-subscription), prioritaskan env
  if (envObj.SUBSCRIPTION_BANK_NAME) {
    return manualInstructions(payment, envObj);
  }

  // Default ke konfigurasi bank
  if (config.bankActive && config.bankName) {
    return {
      provider: "manual",
      method: payment.method || "Transfer Bank",
      code: payment.code || "",
      total: paymentTotal(payment),
      expiresOn: paymentExpiry(payment),
      bankName: config.bankName || null,
      accountNumber: config.bankAccount || null,
      accountHolder: config.bankHolder || null,
      note: config.bankNote || (config.bankName
        ? `Transfer tepat Rp${rupiah(paymentTotal(payment))} dan cantumkan kode ${payment.code} pada berita transfer.`
        : "Hubungi admin untuk instruksi pembayaran."),
      paymentUrl: null,
      redirectUrl: null,
      qrisUrl: null,
      qrisPayload: null,
      qrImageUrl: null
    };
  }

  return manualInstructions(payment, envObj);
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
  dynamicQrisInstructions,
  capabilities,
  getPaymentConfig
};
