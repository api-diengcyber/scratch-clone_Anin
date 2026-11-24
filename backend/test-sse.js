"use strict";

// Test suite untuk Server-Sent Events (SSE) notification hub dan endpoint /api/notifications/stream
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");

const TMPDB = path.join(os.tmpdir(), `dcc-test-sse-${process.pid}.sqlite`);
process.env.DB_PATH = TMPDB;

const db = require("./database");
const auth = require("./auth");
const sseHub = require("./sse-hub");
const notifications = require("./notifications");
const studentNotifications = require("./student-notifications");

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS  ${message}`);
}

function eq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    console.error(`FAIL: ${message}`);
    console.error(`  aktual:   ${a}`);
    console.error(`  ekspektasi: ${b}`);
    process.exit(1);
  }
  console.log(`PASS  ${message}`);
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

  studentNotifications.registerStudentNotificationApi(app, {
    db,
    auth,
    sendApiError,
    sendApiSuccess
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. Setup user student & admin
    const studentId = Number(db.prepare("INSERT INTO users (username, email, role, status) VALUES (?, ?, ?, ?)").run("student_sse", "student_sse@example.com", "student", "active").lastInsertRowid);
    const studentToken = auth.createSession(studentId);

    const adminId = Number(db.prepare("INSERT INTO users (username, email, role, status) VALUES (?, ?, ?, ?)").run("admin_sse", "admin_sse@example.com", "admin", "active").lastInsertRowid);
    const adminToken = auth.createSession(adminId);

    // 2. Hub test unit level
    eq(sseHub.clientCount(), 0, "SSE hub awalnya kosong");

    // 3. Tes streaming via HTTP GET /api/notifications/stream
    const streamEvents = [];
    const clientReq = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/api/notifications/stream",
      method: "GET",
      headers: {
        Authorization: `Bearer ${studentToken}`
      }
    }, (res) => {
      eq(res.statusCode, 200, "SSE stream status 200");
      eq(res.headers["content-type"], "text/event-stream", "Content-Type text/event-stream");

      res.on("data", (chunk) => {
        const text = chunk.toString();
        streamEvents.push(text);
      });
    });

    clientReq.end();

    // Tunggu koneksi terdaftar
    await new Promise((r) => setTimeout(r, 100));
    eq(sseHub.clientCount(studentId), 1, "Siswa terhubung ke SSE hub");

    // Kirim notifikasi ke siswa
    const notifCount = studentNotifications.notifyStudent(db, studentId, {
      kind: "task.graded",
      title: "Tugas Dinilai",
      body: "Nilai kamu 100",
      tone: "emerald"
    });
    eq(notifCount, 1, "Notifikasi siswa tersimpan di DB");

    // Tunggu event terkirim lewat socket
    await new Promise((r) => setTimeout(r, 100));

    const allOutput = streamEvents.join("");
    ok(allOutput.includes("event: connected"), "Menerima event connected awal");
    ok(allOutput.includes("event: notification"), "Menerima event notification");
    ok(allOutput.includes("Tugas Dinilai"), "Data notifikasi memuat judul yang benar");

    // Putuskan koneksi klien dan cek pembersihan di hub
    clientReq.destroy();
    await new Promise((r) => setTimeout(r, 100));
    eq(sseHub.clientCount(studentId), 0, "Klien otomatis dibersihkan saat koneksi terputus");

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
