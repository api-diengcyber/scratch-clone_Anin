// Endpoint publik untuk laporan orang tua/wali.
// Tidak memakai sesi/login: akses diberikan lewat token acak yang hanya
// diketahui pemegang tautan. Token disimpan sebagai hash di database.
"use strict";

// Batas akses per IP. Kuncinya HANYA IP (bukan path): path endpoint ini memuat
// token, jadi limiter berbasis path memberi bucket baru untuk setiap tebakan
// token dan tidak pernah membatasi siapa pun yang mengganti token tiap request.
const REPORT_RATE_MAX = 60;
const REPORT_RATE_WINDOW_MS = 60 * 1000;
const reportHits = new Map();

function checkReportRate(ip) {
  const now = Date.now();
  const entry = reportHits.get(ip);
  if (!entry || now - entry.first > REPORT_RATE_WINDOW_MS) {
    reportHits.set(ip, { count: 1, first: now });
    return { allowed: true };
  }
  if (entry.count >= REPORT_RATE_MAX) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((REPORT_RATE_WINDOW_MS - (now - entry.first)) / 1000))
    };
  }
  entry.count += 1;
  return { allowed: true };
}

// Pangkas entri lama supaya Map tidak tumbuh tanpa batas.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of reportHits) {
    if (now - entry.first > REPORT_RATE_WINDOW_MS) reportHits.delete(ip);
  }
}, 60 * 1000).unref();

function registerReportApi(app, deps) {
  const { db, sendApiError, sendApiSuccess } = deps;
  const reports = require("./reports");

  app.get("/api/reports/:token", (req, res) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");

    const rate = checkReportRate(req.ip || (req.socket && req.socket.remoteAddress) || "unknown");
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfter));
      return sendApiError(res, 429, "Terlalu banyak permintaan. Coba lagi sebentar lagi.", "RATE_LIMITED");
    }

    const result = reports.resolveReportToken(db, req.params.token);
    if (!result) {
      return sendApiError(
        res,
        404,
        "Laporan tidak ditemukan atau tautan sudah kedaluwarsa.",
        "REPORT_NOT_FOUND"
      );
    }
    return sendApiSuccess(res, result);
  });
}

module.exports = { registerReportApi };