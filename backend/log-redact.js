"use strict";

// Beberapa URL membawa kredensial di path-nya. Jangan sampai tertulis di log:
// siapa pun yang bisa membaca log (atau tool monitoring) akan memegang akses yang masih berlaku.
//   /api/reports/<token>  -> token tautan laporan wali (berlaku sampai 365 hari)
const REDACTIONS = [
  [/^(\/api\/reports\/)[^/?#]+/i, "$1:token"]
];

function redactPathForLog(value) {
  let out = String(value == null ? "" : value);
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out;
}

module.exports = { redactPathForLog };