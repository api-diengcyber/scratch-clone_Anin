"use strict";

// ------------------------------------------------------------
// PENGIRIM EMAIL
//
// Tiga provider:
//   mock   -> tidak mengirim apa pun; isi email dicetak ke log (dry-run untuk development/test)
//   resend -> HTTP API Resend (butuh RESEND_API_KEY)
//   smtp   -> SMTP biasa lewat nodemailer (opsional; require malas)
//
// Modul ini sengaja tidak menyimpan konfigurasi global saat require supaya
// test bisa membuat mailer dengan provider/fetch/transport sendiri.
// ------------------------------------------------------------

const PROVIDERS = ["mock", "resend", "smtp"];
const DEFAULT_FROM = "Dieng Cyber Coding <no-reply@diengcyber.local>";
const DEFAULT_TIMEOUT_MS = 15000;

function normalizeProvider(value) {
  const provider = String(value || "mock").trim().toLowerCase();
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`Provider email tidak dikenal: ${provider}. Pilih mock, resend, atau smtp.`);
  }
  return provider;
}

function normalizeRecipients(to) {
  const list = Array.isArray(to) ? to : [to];
  const cleaned = list
    .map((item) => String(item == null ? "" : item).trim())
    .filter(Boolean);
  if (!cleaned.length) throw new Error("Penerima email (to) wajib diisi.");
  // Satu alamat per elemen: baris baru atau koma bisa dipakai menyelipkan penerima/header lain.
  if (cleaned.some((item) => /[\r\n,;<>]/.test(item))) throw new Error("Penerima email tidak valid.");
  return cleaned;
}

function assertMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new Error("Pesan email harus berupa objek.");
  }
  const to = normalizeRecipients(message.to);
  // Subjek satu baris: CR/LF di header bisa dipakai menyelipkan header lain (mis. Bcc).
  const subject = String(message.subject == null ? "" : message.subject)
    .replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, " ")
    .trim();
  if (!subject) throw new Error("Subjek email wajib diisi.");
  const text = message.text == null ? "" : String(message.text);
  const html = message.html == null ? "" : String(message.html);
  if (!text && !html) throw new Error("Isi email (text atau html) wajib diisi.");
  return { to, subject, text, html };
}

function smtpConfig(env) {
  const port = Number.parseInt(env.SMTP_PORT || "587", 10);
  const secureValue = String(env.SMTP_SECURE || "").toLowerCase();
  return {
    host: String(env.SMTP_HOST || "").trim(),
    port: Number.isSafeInteger(port) && port > 0 ? port : 587,
    secure: secureValue === "true" || secureValue === "1" || port === 465,
    user: String(env.SMTP_USER || "").trim(),
    pass: String(env.SMTP_PASS || "")
  };
}

function defaultTransportFactory(env) {
  let nodemailer;
  try {
    // Dependensi opsional: hanya dibutuhkan kalau provider smtp dipakai.
    nodemailer = require("nodemailer");
  } catch (_) {
    throw new Error("Provider smtp membutuhkan paket nodemailer. Jalankan: npm install nodemailer");
  }
  const config = smtpConfig(env);
  if (!config.host) throw new Error("SMTP_HOST belum diatur.");
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined
  });
}

function createMailer(options = {}) {
  const env = options.env || process.env;
  const provider = normalizeProvider(options.provider || env.REPORT_EMAIL_PROVIDER || env.EMAIL_PROVIDER);
  const from = String(options.from || env.REPORT_EMAIL_FROM || DEFAULT_FROM).trim() || DEFAULT_FROM;
  const replyTo = String(options.replyTo || env.REPORT_EMAIL_REPLY_TO || "").trim() || null;
  const fetchImpl = options.fetch || (typeof fetch === "function" ? fetch : null);
  const transportFactory = options.transportFactory || defaultTransportFactory;
  const timeoutMs = Math.max(1000, Number.parseInt(options.timeoutMs, 10) || DEFAULT_TIMEOUT_MS);
  const allowMockInProduction = options.allowMockInProduction === true;
  const logger = options.logger || console;

  let transport = null;
  function getTransport() {
    if (!transport) transport = transportFactory(env);
    return transport;
  }

  async function sendResend(payload) {
    if (!fetchImpl) throw new Error("fetch tidak tersedia untuk provider resend.");
    const apiKey = String(env.RESEND_API_KEY || "").trim();
    if (!apiKey) throw new Error("RESEND_API_KEY belum diatur.");

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => {
      try { controller.abort(); } catch (_) { /* abaikan */ }
    }, timeoutMs) : null;

    let response;
    try {
      response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from,
          to: payload.to,
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          ...(replyTo ? { reply_to: replyTo } : {})
        }),
        signal: controller ? controller.signal : undefined
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    let body = null;
    try { body = await response.json(); } catch (_) { body = null; }
    if (!response.ok) {
      const detail = body && (body.message || body.error || body.name);
      throw new Error(`Resend gagal (HTTP ${response.status})${detail ? `: ${detail}` : ""}`);
    }
    return {
      provider: "resend",
      id: body && body.id ? String(body.id) : null,
      to: payload.to
    };
  }

  async function sendSmtp(payload) {
    const transporter = getTransport();
    const info = await transporter.sendMail({
      from,
      to: payload.to.join(", "),
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      ...(replyTo ? { replyTo } : {})
    });
    return {
      provider: "smtp",
      id: info && info.messageId ? String(info.messageId) : null,
      to: payload.to
    };
  }

  async function send(message) {
    const payload = assertMessage(message);
    if (provider === "mock") {
      if (String(env.NODE_ENV || "").toLowerCase() === "production" && !allowMockInProduction) {
        throw new Error("Provider email mock tidak boleh dipakai di production. Atur REPORT_EMAIL_PROVIDER=resend atau smtp.");
      }
      // Dry-run: tidak ada yang dikirim; isi email dicetak supaya bisa diperiksa. Isinya memuat
      // tautan laporan yang asli, jadi mock hanya untuk development (ditolak di production).
      logger.log([
        `[EMAIL MOCK] tidak dikirim. Kepada: ${payload.to.join(", ")}`,
        `Subjek: ${payload.subject}`,
        payload.text || "(email hanya berisi HTML)"
      ].join("\n"));
      return {
        provider: "mock",
        id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        to: payload.to
      };
    }
    if (provider === "resend") return sendResend(payload);
    return sendSmtp(payload);
  }

  return { provider, from, replyTo, send };
}

module.exports = {
  PROVIDERS,
  DEFAULT_FROM,
  normalizeProvider,
  createMailer
};