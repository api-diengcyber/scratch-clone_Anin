"use strict";

// ------------------------------------------------------------
// ISI EMAIL LAPORAN UNTUK WALI
//
// Hanya membentuk subjek/teks/HTML dari data laporan yang sudah ada.
// Tidak mengambil data tambahan dari database dan tidak pernah memuat
// username, ID internal, atau token mentah selain tautan halaman wali.
// ------------------------------------------------------------

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

// Teks pendek (nama, jenjang): semua karakter kontrol, termasuk CR/LF/tab, menjadi satu spasi.
function cleanText(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, " ")
    .trim()
    .slice(0, max);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percent(value) {
  const number = numberOrNull(value);
  return number === null ? "-" : `${Math.round(number * 10) / 10}%`;
}

function plainDate(value) {
  const text = cleanText(value, 40);
  return text ? text.slice(0, 10) : null;
}

function summaryLines(report) {
  const summary = (report && report.summary) || {};
  const totalTasks = numberOrNull(summary.totalTasks) || 0;
  const completedTasks = numberOrNull(summary.completedTasks) || 0;
  const points = numberOrNull(summary.points);
  const averageScore = numberOrNull(summary.averageScore);
  const completedModules = numberOrNull(summary.completedModules);

  return [
    points === null ? null : `Poin belajar: ${points}`,
    `Tugas selesai: ${completedTasks} dari ${totalTasks} (${percent(summary.completionRate)})`,
    averageScore === null ? null : `Nilai rata-rata tugas: ${averageScore}`,
    completedModules === null ? null : `Modul selesai: ${completedModules}`
  ].filter(Boolean);
}

function gradeLines(report) {
  const grades = Array.isArray(report && report.grades) ? report.grades : [];
  return grades.map((row) => {
    const name = cleanText(row && row.grade, 20) || "Jenjang";
    const done = numberOrNull(row && row.completedTasks) || 0;
    const total = numberOrNull(row && row.totalTasks) || 0;
    return `${name}: ${done}/${total} tugas (${percent(row && row.completionRate)})`;
  });
}

function buildReportEmail(input = {}) {
  const report = input.report || {};
  const institutionName = cleanText(input.institutionName || (report.institution && report.institution.name), 120)
    || "Dieng Cyber Coding";
  const studentName = cleanText(input.studentName || (report.student && report.student.name), 120)
    || "Ananda";
  const guardianName = cleanText(input.guardianName, 120);
  const pageUrl = String(input.pageUrl || "").trim();
  const expiresAt = plainDate(input.expiresAt || input.linkExpiresAt);

  if (!pageUrl) throw new Error("pageUrl laporan wajib diisi.");

  const greeting = guardianName
    ? `Halo Bapak/Ibu ${guardianName},`
    : "Halo Bapak/Ibu wali murid,";
  const lines = summaryLines(report);
  const grades = gradeLines(report);
  const generated = plainDate(report.generatedAt) || plainDate(new Date().toISOString());

  const subject = `Laporan belajar ${studentName} - ${institutionName}`.replace(/\s+/g, " ");
  const textSections = [
    greeting,
    "",
    `Berikut laporan belajar ${studentName} dari ${institutionName}${generated ? ` per ${generated}` : ""}.`,
    "",
    "Ringkasan:",
    ...lines.map((line) => `- ${line}`),
    ...(grades.length ? ["", "Per jenjang:", ...grades.map((line) => `- ${line}`)] : []),
    "",
    "Laporan lengkap bisa dibuka lewat tautan berikut:",
    pageUrl,
    "",
    expiresAt
      ? `Tautan bersifat pribadi dan berlaku sampai ${expiresAt}. Mohon jangan membagikan tautan ini kepada orang lain.`
      : "Tautan bersifat pribadi. Mohon jangan membagikan tautan ini kepada orang lain.",
    "",
    `Salam,\n${institutionName}`
  ];
  const text = textSections.join("\n");

  const summaryHtml = lines.length
    ? `<ul style="margin:8px 0 0;padding-left:20px;color:#334155">${lines
      .map((line) => `<li style="margin:4px 0">${escapeHtml(line)}</li>`)
      .join("")}</ul>`
    : "";
  const gradesHtml = grades.length
    ? `<h3 style="margin:20px 0 6px;font-size:15px;color:#0f172a">Per jenjang</h3>
       <ul style="margin:8px 0 0;padding-left:20px;color:#334155">${grades
      .map((line) => `<li style="margin:4px 0">${escapeHtml(line)}</li>`)
      .join("")}</ul>`
    : "";

  const html = `<!doctype html>
<html lang="id">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:24px">
      <p style="margin:0 0 12px;font-size:15px">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#334155">
        Berikut laporan belajar <strong>${escapeHtml(studentName)}</strong> dari
        <strong>${escapeHtml(institutionName)}</strong>${generated ? ` per ${escapeHtml(generated)}` : ""}.
      </p>
      <h3 style="margin:20px 0 6px;font-size:15px;color:#0f172a">Ringkasan</h3>
      ${summaryHtml}
      ${gradesHtml}
      <p style="margin:24px 0 10px;font-size:14px;color:#334155">Laporan lengkap bisa dibuka lewat tombol berikut:</p>
      <p style="margin:0 0 20px">
        <a href="${escapeHtml(pageUrl)}"
           style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:10px;font-size:14px;font-weight:bold">
          Buka laporan
        </a>
      </p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b">
        ${expiresAt
          ? `Tautan bersifat pribadi dan berlaku sampai ${escapeHtml(expiresAt)}.`
          : "Tautan bersifat pribadi."}
        Mohon jangan membagikan tautan ini kepada orang lain.
      </p>
    </div>
    <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#94a3b8">${escapeHtml(institutionName)}</p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

module.exports = {
  escapeHtml,
  buildReportEmail
};