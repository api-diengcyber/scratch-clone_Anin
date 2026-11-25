"use strict";

// Test suite untuk graduation-service.js dan endpoint sertifikat
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");

const TMPDB = path.join(os.tmpdir(), `dcc-test-grad-${process.pid}.sqlite`);
process.env.DB_PATH = TMPDB;
process.env.NODE_ENV = "test";

const db = require("./database");
const auth = require("./auth");
const graduationService = require("./graduation-service");

function ok(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS  ${msg}`);
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    console.error(`FAIL: ${msg}`);
    console.error(`  aktual:   ${a}`);
    console.error(`  ekspektasi: ${b}`);
    process.exit(1);
  }
  console.log(`PASS  ${msg}`);
}

function sendApiSuccess(res, data = {}, message = "", status = 200) {
  return res.status(status).json({ ok: true, ...(message ? { message } : {}), ...data });
}

function sendApiError(res, status = 400, message = "Terjadi kesalahan.", code = "ERROR", details = null) {
  return res.status(status).json({ ok: false, code, message, ...(details ? { details } : {}) });
}

async function run() {
  const app = express();
  app.use(express.json());

  // Daftarkan endpoint sertifikat (mendukung via param atau query string)
  const verifyHandler = (req, res) => {
    const certNumber = String(req.params.certNumber || req.query.number || req.query.certNumber || "").trim();
    if (!certNumber) return sendApiError(res, 400, "Nomor sertifikat wajib diisi.", "VALIDATION_ERROR");
    const result = graduationService.verifyCertificate(db, certNumber);
    if (!result) return sendApiError(res, 404, "Sertifikat tidak ditemukan.", "NOT_FOUND");
    return sendApiSuccess(res, { certificate: result });
  };
  app.get("/api/certificates/verify", verifyHandler);
  app.get("/api/certificates/verify/:certNumber", verifyHandler);

  app.get("/api/certificates/my-certificates", auth.requireAuth, (req, res) => {
    if (req.role !== "student") return sendApiError(res, 403, "Khusus akun siswa.", "STUDENT_REQUIRED");
    graduationService.checkAndGraduateEligible(db, req.userId);
    const certificates = graduationService.listStudentGraduations(db, req.userId);
    return sendApiSuccess(res, { certificates, total: certificates.length });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  function api(method, urlPath, { token, body } = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(urlPath, `http://127.0.0.1:${port}`);
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const req = http.request(u, { method, headers }, (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let json = {};
          try { json = JSON.parse(raw); } catch (_) {}
          resolve({ status: res.statusCode, body: json });
        });
      });
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  try {
    // 1. Setup akun siswa
    const studentId = Number(db.prepare(`
      INSERT INTO users (username, email, full_name, role, status)
      VALUES (?, ?, ?, 'student', 'active')
    `).run("siswa_lulus", "siswa_lulus@example.com", "Ananda Juara").lastInsertRowid);
    const studentToken = auth.createSession(studentId);

    // 2. Format nomor sertifikat deterministik
    const certNo = graduationService.generateCertificateNo("SMP", "SMP|Python Start", studentId, "2026-11-25");
    eq(certNo, `DCC/2026/SMP/PYTHONSTART/${String(studentId).padStart(4, "0")}`, "Format nomor sertifikat cocok");

    // 3. Rekam kelulusan resmi
    const grad = graduationService.recordGraduation(db, {
      studentUserId: studentId,
      grade: "SMP",
      learningPathKey: "SMP|Python Start",
      learningPathName: "Python Start (SMP)",
      finalScore: 95,
      graduatedAt: "2026-11-25T10:00:00.000Z"
    });

    ok(grad && grad.id > 0, "Kelulusan berhasil dicatat di database");
    eq(grad.certificate_number, certNo, "Nomor sertifikat tersimpan benar");
    eq(grad.student_name_snapshot, "Ananda Juara", "Snapshot nama siswa tersimpan");

    // 4. Idempotensi - Memanggil ulang dengan siswa & jalur yang sama tidak membuat duplikat
    const grad2 = graduationService.recordGraduation(db, {
      studentUserId: studentId,
      grade: "SMP",
      learningPathKey: "SMP|Python Start",
      learningPathName: "Python Start (SMP)",
      finalScore: 100
    });
    eq(grad2.id, grad.id, "Idempotensi: mengembalikan baris yang sama");

    // 5. Verifikasi Publik (Tanpa Token)
    let res = await api("GET", `/api/certificates/verify?number=${encodeURIComponent(certNo)}`);
    eq(res.status, 200, "Verifikasi publik status 200 via query");
    eq(res.body.certificate.valid, true, "Sertifikat valid");
    eq(res.body.certificate.studentName, "Ananda Juara", "Nama siswa snapshot sesuai");
    eq(res.body.certificate.finalScore, 95, "Nilai akhir sesuai");

    res = await api("GET", `/api/certificates/verify/${encodeURIComponent(certNo)}`);
    eq(res.status, 200, "Verifikasi publik status 200 via param");

    // Case-insensitive nomor sertifikat
    res = await api("GET", `/api/certificates/verify?number=${encodeURIComponent(certNo.toLowerCase())}`);
    eq(res.status, 200, "Verifikasi publik case-insensitive");

    // Sertifikat ngawur -> 404
    res = await api("GET", `/api/certificates/verify?number=DCC-NGARANG-1234`);
    eq(res.status, 404, "Sertifikat tidak dikenal -> 404");
    eq(res.status, 404, "Sertifikat tidak dikenal -> 404");

    // 6. Endpoint Siswa: /api/certificates/my-certificates
    res = await api("GET", "/api/certificates/my-certificates", { token: studentToken });
    eq(res.status, 200, "my-certificates status 200");
    eq(res.body.total, 1, "Siswa memiliki 1 sertifikat");
    eq(res.body.certificates[0].certificateNumber, certNo, "Nomor sertifikat siswa cocok");

    // Akses tanpa token -> 401
    res = await api("GET", "/api/certificates/my-certificates");
    eq(res.status, 401, "Tanpa token ditolak 401");

    // 7. Notifikasi siswa terbit saat lulus
    const notifs = db.prepare("SELECT * FROM student_notifications WHERE user_id = ?").all(studentId);
    ok(notifs.some((n) => n.kind === "path.graduated"), "Notifikasi siswa path.graduated dibuat");

  } finally {
    server.close();
    try {
      db.close();
      if (fs.existsSync(TMPDB)) fs.unlinkSync(TMPDB);
      const wal = `${TMPDB}-wal`;
      const shm = `${TMPDB}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch (_) {}
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
