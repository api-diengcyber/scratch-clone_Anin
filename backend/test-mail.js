// Tes pengirim email, isi email laporan, dan penjadwal pengiriman.
// Tanpa server: modul + database sementara.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = path.join(os.tmpdir(), `dcc-mail-${process.pid}`);
process.env.DB_PATH = `${TMP}.sqlite`;
process.env.PLUGIN_DIR = `${TMP}-plugins`;
process.env.NODE_ENV = "test";
process.env.APP_PUBLIC_ORIGIN = "https://dcc.test";
process.env.REPORT_EMAIL_PROVIDER = "mock";

const db = require("./database");
const D = require("./report-deliveries");
const reports = require("./reports");
const { createMailer, normalizeProvider } = require("./mailer");
const { buildReportEmail } = require("./report-email");
const scheduler = require("./report-scheduler");

const results = [];
function record(name, pass, detail) {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : ` — ${detail}`}`);
}
const eq = (name, got, want) => record(name, JSON.stringify(got) === JSON.stringify(want),
  `dapat ${JSON.stringify(got)}, harap ${JSON.stringify(want)}`);
const ok = (name, value, detail = "kondisi salah") => record(name, Boolean(value), detail);
async function rejects(name, fn) {
  try {
    await fn();
    record(name, false, "tidak melempar error");
  } catch (_) {
    record(name, true);
  }
}

let seq = 0;
function addStudent() {
  seq += 1;
  return Number(db.prepare("INSERT INTO users (username, email, full_name, role) VALUES (?, ?, ?, 'student')")
    .run(`siswa-mail-${seq}`, `siswa-mail-${seq}@example.com`, `Siswa Mail ${seq}`).lastInsertRowid);
}
function addGuardian(studentId, name, email) {
  return Number(db.prepare("INSERT INTO student_guardians (student_user_id, name, email, relation) VALUES (?, ?, ?, 'wali')")
    .run(studentId, name, email).lastInsertRowid);
}
const deliveryRow = (id) => db.prepare("SELECT * FROM report_deliveries WHERE id = ?").get(id);

function sampleReport() {
  return {
    generatedAt: "2026-11-06T08:00:00.000Z",
    institution: { name: "Dieng Cyber <Coding>", year: "2026/2027", semester: "Ganjil", kkm: 75 },
    student: { name: 'Budi <script>alert("x")</script>', grades: ["SMP"] },
    summary: {
      points: 120, totalTasks: 40, completedTasks: 25, completionRate: 62.5,
      gradedSubmissions: 3, averageScore: 85.3, completedModules: 4,
      failedAttempts: 8, timeSpentSeconds: 7200
    },
    grades: [{ grade: "SMP", totalTasks: 40, completedTasks: 25, completionRate: 62.5 }],
    completedTasks: [],
    submissions: [],
    mentorNote: null
  };
}

async function main() {
  // ---------- mailer: validasi & provider ----------
  eq("normalizeProvider: default mock", normalizeProvider(undefined), "mock");
  eq("normalizeProvider: resend", normalizeProvider("ReSeNd"), "resend");
  record("normalizeProvider: provider asing ditolak", (() => {
    try { normalizeProvider("sendgrid"); return false; } catch (_) { return true; }
  })());

  const mock = createMailer({ provider: "mock", env: { ...process.env, NODE_ENV: "test" } });
  const mockResult = await mock.send({ to: "wali@example.com", subject: "Halo", text: "Isi" });
  eq("mailer mock: provider dan penerima", [mockResult.provider, mockResult.to], ["mock", ["wali@example.com"]]);
  ok("mailer mock: punya id semu", typeof mockResult.id === "string" && mockResult.id.startsWith("mock-"));

  await rejects("mailer: penerima kosong ditolak", () => mock.send({ to: "", subject: "x", text: "x" }));
  await rejects("mailer: subjek kosong ditolak", () => mock.send({ to: "a@example.com", subject: " ", text: "x" }));
  await rejects("mailer: isi kosong ditolak", () => mock.send({ to: "a@example.com", subject: "x" }));
  await rejects("mailer: penerima dengan baris baru ditolak", () => mock.send({ to: "a@example.com\r\nBcc: x@example.com", subject: "x", text: "x" }));
  await rejects("mailer: beberapa alamat dalam satu elemen ditolak", () => mock.send({ to: "a@example.com, x@example.com", subject: "x", text: "x" }));

  const prodMock = createMailer({ provider: "mock", env: { ...process.env, NODE_ENV: "production" } });
  await rejects("mailer: mock ditolak di production (tidak diam-diam menandai terkirim)",
    () => prodMock.send({ to: "a@example.com", subject: "x", text: "x" }));

  let captured = null;
  const resendFetch = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return { ok: true, status: 200, json: async () => ({ id: "resend-123" }) };
  };
  const resend = createMailer({
    provider: "resend",
    fetch: resendFetch,
    env: { ...process.env, NODE_ENV: "test", RESEND_API_KEY: "re_test", REPORT_EMAIL_FROM: "DCC <no-reply@dcc.test>" }
  });
  const resendResult = await resend.send({ to: ["wali@example.com"], subject: "Laporan", text: "Teks", html: "<p>Teks</p>" });
  eq("mailer resend: hasil", [resendResult.provider, resendResult.id], ["resend", "resend-123"]);
  eq("mailer resend: endpoint", captured.url, "https://api.resend.com/emails");
  eq("mailer resend: header Authorization", captured.options.headers.Authorization, "Bearer re_test");
  eq("mailer resend: isi body", [captured.body.from, captured.body.to, captured.body.subject],
    ["DCC <no-reply@dcc.test>", ["wali@example.com"], "Laporan"]);

  const failingResend = createMailer({
    provider: "resend",
    fetch: async () => ({ ok: false, status: 422, json: async () => ({ message: "from invalid" }) }),
    env: { ...process.env, NODE_ENV: "test", RESEND_API_KEY: "re_test" }
  });
  await rejects("mailer resend: respons gagal dilempar",
    () => failingResend.send({ to: "a@example.com", subject: "x", text: "x" }));

  let smtpMessage = null;
  const smtp = createMailer({
    provider: "smtp",
    transportFactory: () => ({
      sendMail: async (message) => { smtpMessage = message; return { messageId: "smtp-1" }; }
    }),
    env: { ...process.env, NODE_ENV: "test", SMTP_HOST: "smtp.test" }
  });
  const smtpResult = await smtp.send({ to: "wali@example.com", subject: "Laporan", text: "Teks" });
  eq("mailer smtp: hasil", [smtpResult.provider, smtpResult.id], ["smtp", "smtp-1"]);
  eq("mailer smtp: penerima digabung", smtpMessage.to, "wali@example.com");

  // ---------- isi email ----------
  const email = buildReportEmail({
    report: sampleReport(),
    guardianName: 'Ibu <b>"Wali"</b>',
    pageUrl: "https://dcc.test/orangtua/laporan.html#token-rahasia",
    expiresAt: "2026-12-06T00:00:00.000Z"
  });
  ok("email: subjek memuat nama siswa", email.subject.includes('Budi <script>alert("x")</script>'));
  ok("email: teks memuat tautan", email.text.includes("https://dcc.test/orangtua/laporan.html#token-rahasia"));
  ok("email: teks memuat ringkasan", email.text.includes("Tugas selesai: 25 dari 40 (62.5%)"));
  ok("email: html memuat tautan", email.html.includes("https://dcc.test/orangtua/laporan.html#token-rahasia"));
  ok("email: HTML di-escape", email.html.includes("&lt;script&gt;") && !email.html.includes("<script>"));
  ok("email: kutip nama wali di-escape", email.html.includes("&lt;b&gt;") && !email.html.includes("<b>\"Wali\"</b>"));
  ok("email: batas berlaku disebut", email.text.includes("2026-12-06"));
  record("email: pageUrl wajib", (() => {
    try { buildReportEmail({ report: sampleReport() }); return false; } catch (_) { return true; }
  })());

  // ---------- penjadwal ----------
  const today = "2026-11-06";
  const baseUrl = "https://dcc.test";

  const sid = addStudent();
  const gid = addGuardian(sid, "Ibu Kirim", "ibu-kirim@example.com");
  const gidFuture = addGuardian(sid, "Ayah Nanti", "ayah-nanti@example.com");
  const due = D.queueDelivery(db, {
    studentId: sid, guardianId: gid, recipientEmail: "ibu-kirim@example.com",
    recipientName: "Ibu Kirim", dueDate: today
  });
  const future = D.queueDelivery(db, {
    studentId: sid, guardianId: gidFuture, recipientEmail: "ayah-nanti@example.com",
    recipientName: "Ayah Nanti", dueDate: "2099-01-01"
  });

  const sent = [];
  const okMailer = { provider: "test", send: async (message) => { sent.push(message); return { id: `t${sent.length}` }; } };
  const summary = await scheduler.processDueDeliveries(db, {
    today, baseUrl, mailer: okMailer, studentId: sid
  });
  eq("jadwal: ringkasan", [summary.processed, summary.sent, summary.failed, summary.skipped], [1, 1, 0, 0]);
  eq("jadwal: baris jatuh tempo menjadi sent", deliveryRow(due.id).status, "sent");
  eq("jadwal: baris masa depan tetap pending", deliveryRow(future.id).status, "pending");
  ok("jadwal: report_link_id terisi", deliveryRow(due.id).report_link_id !== null);
  eq("jadwal: email dikirim ke wali", sent[0].to, "ibu-kirim@example.com");
  ok("jadwal: email memuat tautan halaman wali", sent[0].text.includes(`${baseUrl}/orangtua/laporan.html#`));

  const link = db.prepare("SELECT * FROM report_links WHERE id = ?").get(deliveryRow(due.id).report_link_id);
  ok("jadwal: tautan tersimpan sebagai hash (bukan token mentah)",
    link && typeof link.token_hash === "string" && link.token_hash.length === 64);
  eq("jadwal: tautan terhubung ke wali", Number(link.guardian_id), gid);
  ok("jadwal: tautan punya masa berlaku", Boolean(link.expires_at));

  // Wali berganti email setelah antrean dibuat: kiriman lama tidak boleh dikirim.
  const sid2 = addStudent();
  const gid2 = addGuardian(sid2, "Ayah Lama", "ayah-lama@example.com");
  const changed = D.queueDelivery(db, {
    studentId: sid2, guardianId: gid2, recipientEmail: "ayah-lama@example.com", dueDate: today
  });
  db.prepare("UPDATE student_guardians SET email = 'ayah-baru@example.com' WHERE id = ?").run(gid2);
  let res = await scheduler.processDueDeliveries(db, { today, baseUrl, mailer: okMailer, studentId: sid2 });
  eq("jadwal: email wali berubah -> dilewati", [res.skipped, deliveryRow(changed.id).status], [1, "skipped"]);
  eq("jadwal: alasan dilewati", deliveryRow(changed.id).last_error, "Email wali berubah");

  // Wali dihapus (langsung di DB): guardian_id menjadi NULL dan tidak dikirim.
  const sid3 = addStudent();
  const gid3 = addGuardian(sid3, "Wali Hapus", "wali-hapus@example.com");
  const orphan = D.queueDelivery(db, {
    studentId: sid3, guardianId: gid3, recipientEmail: "wali-hapus@example.com", dueDate: today
  });
  db.prepare("DELETE FROM student_guardians WHERE id = ?").run(gid3);
  const sid3Guardian = db.prepare("SELECT guardian_id FROM report_deliveries WHERE id = ?").get(orphan.id);
  eq("jadwal: FK wali terhapus menjadi NULL", sid3Guardian.guardian_id, null);
  res = await scheduler.processDueDeliveries(db, { today, baseUrl, mailer: okMailer, studentId: sid3 });
  eq("jadwal: wali hilang -> dilewati", [res.skipped, deliveryRow(orphan.id).status], [1, "skipped"]);

  // Siswa dihapus (soft delete).
  const sid4 = addStudent();
  const gid4 = addGuardian(sid4, "Wali Siswa Hapus", "wali-siswa-hapus@example.com");
  const gone = D.queueDelivery(db, {
    studentId: sid4, guardianId: gid4, recipientEmail: "wali-siswa-hapus@example.com", dueDate: today
  });
  db.prepare("UPDATE users SET status = 'deleted' WHERE id = ?").run(sid4);
  res = await scheduler.processDueDeliveries(db, { today, baseUrl, mailer: okMailer, studentId: sid4 });
  eq("jadwal: siswa dihapus -> dilewati", [res.skipped, deliveryRow(gone.id).status], [1, "skipped"]);

  // Kirim gagal: status failed, tautan yang sudah dibuat dicabut.
  const sid5 = addStudent();
  const gid5 = addGuardian(sid5, "Wali Gagal", "wali-gagal@example.com");
  const failing = D.queueDelivery(db, {
    studentId: sid5, guardianId: gid5, recipientEmail: "wali-gagal@example.com", dueDate: today
  });
  const failMailer = { provider: "test", send: async () => { throw new Error("SMTP timeout"); } };
  res = await scheduler.processDueDeliveries(db, { today, baseUrl, mailer: failMailer, studentId: sid5 });
  eq("jadwal: kirim gagal -> failed", [res.failed, deliveryRow(failing.id).status], [1, "failed"]);
  eq("jadwal: alasan gagal tersimpan", deliveryRow(failing.id).last_error, "SMTP timeout");
  eq("jadwal: percobaan bertambah", deliveryRow(failing.id).attempts, 1);
  const failedLink = db.prepare("SELECT * FROM report_links WHERE student_user_id = ? ORDER BY id DESC LIMIT 1").get(sid5);
  ok("jadwal: tautan gagal dicabut", failedLink && failedLink.revoked_at);

  // Retry mengembalikan ke pending dan memajukan jatuh tempo.
  const retry = D.retryDelivery(db, failing.id, { dueDate: today });
  eq("retry: baris dikembalikan ke pending", [retry.changed, deliveryRow(failing.id).status], [true, "pending"]);
  eq("retry: attempts direset dan error dibersihkan",
    [deliveryRow(failing.id).attempts, deliveryRow(failing.id).last_error], [0, null]);
  res = await scheduler.processDueDeliveries(db, { today, baseUrl, mailer: okMailer, studentId: sid5 });
  eq("retry: kiriman berhasil setelah dicoba lagi", [res.sent, deliveryRow(failing.id).status], [1, "sent"]);

  const finalRetry = D.retryDelivery(db, failing.id);
  eq("retry: yang sudah sent tidak bisa diulang", [finalRetry.found, finalRetry.sent, finalRetry.changed], [true, true, false]);
  eq("retry: id tidak dikenal", D.retryDelivery(db, 999999), { found: false, sent: false, changed: false });

  // Filter studentId dan base URL wajib.
  const summaryNoStudent = await scheduler.processDueDeliveries(db, { today, baseUrl, mailer: okMailer, studentId: sid5 });
  eq("jadwal: tidak ada baris tersisa untuk siswa itu", summaryNoStudent.processed, 0);

  const noBase = { processDueDeliveries: scheduler.processDueDeliveries };
  await rejects("jadwal: tanpa base URL menolak jalan", () => noBase.processDueDeliveries(db, {
    today, mailer: okMailer, env: { ...process.env, APP_PUBLIC_ORIGIN: "", PUBLIC_BASE_URL: "" }
  }));

  const disabled = scheduler.startReportScheduler(db, { enabled: false });
  eq("penjadwal: default mati mengembalikan null", disabled, null);
  const handle = scheduler.startReportScheduler(db, {
    enabled: true, intervalMinutes: 60, initialDelayMs: 60 * 60 * 1000,
    baseUrl, mailer: okMailer
  });
  ok("penjadwal: aktif mengembalikan handle", handle && typeof handle.stop === "function");
  eq("penjadwal: interval dipakai", handle.intervalMs, 60 * 60 * 1000);
  if (handle) handle.stop();

  // ---------- ketahanan: antrean tidak boleh tersumbat, retry dibatasi ----------
  {
    const oldIds = [];
    for (let i = 0; i < 4; i += 1) {
      const s = addStudent();
      const g = addGuardian(s, `Wali Lama ${i}`, `wali-lama-${i}@example.com`);
      oldIds.push(D.queueDelivery(db, {
        studentId: s, guardianId: g, recipientEmail: `wali-lama-${i}@example.com`, dueDate: "2026-01-01"
      }).id);
    }
    const sidFresh = addStudent();
    const gidFresh = addGuardian(sidFresh, "Wali Baru", "wali-baru@example.com");
    const fresh = D.queueDelivery(db, {
      studentId: sidFresh, guardianId: gidFresh, recipientEmail: "wali-baru@example.com", dueDate: today
    });
    const picky = {
      provider: "test",
      send: async (message) => {
        if (String(message.to).startsWith("wali-lama-")) throw new Error("SMTP down");
        return { id: "ok" };
      }
    };
    await scheduler.processDueDeliveries(db, { today, baseUrl, mailer: picky, batchSize: 3 });
    await scheduler.processDueDeliveries(db, { today, baseUrl, mailer: picky, batchSize: 3 });
    eq("antrean: pengiriman baru tidak tersumbat kiriman gagal lama", deliveryRow(fresh.id).status, "sent");
    ok("antrean: kiriman gagal lama tetap tercatat gagal", oldIds.some((id) => deliveryRow(id).status === "failed"));
  }

  {
    const s = addStudent();
    const g = addGuardian(s, "Wali Terus Gagal", "terus-gagal@example.com");
    const d = D.queueDelivery(db, {
      studentId: s, guardianId: g, recipientEmail: "terus-gagal@example.com", dueDate: today
    });
    let calls = 0;
    const always = { provider: "test", send: async () => { calls += 1; throw new Error("SMTP down"); } };
    const run = () => scheduler.processDueDeliveries(db, {
      today, baseUrl, mailer: always, studentId: s, maxAttempts: 3, retryAfterMinutes: 0
    });
    for (let i = 0; i < 6; i += 1) await run();
    eq("retry: berhenti setelah maxAttempts", [calls, deliveryRow(d.id).attempts, deliveryRow(d.id).status], [3, 3, "failed"]);
    eq("retry: tautan tidak menumpuk melebihi jumlah percobaan",
      Number(db.prepare("SELECT COUNT(*) n FROM report_links WHERE student_user_id = ?").get(s).n), 3);
    D.retryDelivery(db, d.id, { dueDate: today });
    await run();
    eq("retry: retry manual admin memberi kesempatan baru", calls, 4);
  }

  {
    const s = addStudent();
    const g = addGuardian(s, "Wali Jeda", "wali-jeda@example.com");
    const d = D.queueDelivery(db, {
      studentId: s, guardianId: g, recipientEmail: "wali-jeda@example.com", dueDate: today
    });
    let calls = 0;
    const always = { provider: "test", send: async () => { calls += 1; throw new Error("SMTP down"); } };
    const run = () => scheduler.processDueDeliveries(db, {
      today, baseUrl, mailer: always, studentId: s, retryAfterMinutes: 60
    });
    await run();
    await run();
    eq("retry: jeda antar percobaan dihormati", calls, 1);
    db.prepare("UPDATE report_deliveries SET updated_at = datetime('now', '-2 hours') WHERE id = ?").run(d.id);
    await run();
    eq("retry: setelah jeda lewat dicoba lagi", calls, 2);
  }

  // ---------- mock mencatat payload (dry-run) ----------
  {
    const lines = [];
    const dry = createMailer({
      provider: "mock",
      logger: { log: (line) => lines.push(String(line)) },
      env: { ...process.env, NODE_ENV: "test" }
    });
    await dry.send({ to: "ibu@example.com", subject: "Laporan Budi", text: "Buka https://dcc.test/orangtua/laporan.html#abc" });
    const logged = lines.join("\n");
    ok("mailer mock: penerima dicatat ke log", logged.includes("ibu@example.com"));
    ok("mailer mock: subjek dicatat ke log", logged.includes("Laporan Budi"));
    ok("mailer mock: isi (termasuk tautan) dicatat ke log", logged.includes("laporan.html#abc"));
  }

  // ---------- konfigurasi penjadwal divalidasi saat start ----------
  {
    const errors = [];
    const logger = { log() {}, error: (message) => errors.push(String(message)) };
    eq("penjadwal: tanpa provider eksplisit tidak jalan (mock tidak boleh jadi default diam-diam)",
      scheduler.startReportScheduler(db, { enabled: true, baseUrl, logger, env: { APP_PUBLIC_ORIGIN: baseUrl } }), null);
    eq("penjadwal: resend tanpa RESEND_API_KEY tidak jalan",
      scheduler.startReportScheduler(db, { enabled: true, baseUrl, logger, env: { APP_PUBLIC_ORIGIN: baseUrl, REPORT_EMAIL_PROVIDER: "resend" } }), null);
    eq("penjadwal: tanpa APP_PUBLIC_ORIGIN tidak jalan",
      scheduler.startReportScheduler(db, { enabled: true, logger, env: { REPORT_EMAIL_PROVIDER: "mock" } }), null);
    ok("penjadwal: alasan penolakan dicatat", errors.length >= 3, `hanya ${errors.length} pesan`);
    const good = scheduler.startReportScheduler(db, {
      enabled: true, logger, initialDelayMs: 60 * 60 * 1000,
      env: { APP_PUBLIC_ORIGIN: baseUrl, EMAIL_PROVIDER: "mock" }
    });
    ok("penjadwal: EMAIL_PROVIDER eksplisit diterima", good && typeof good.stop === "function");
    if (good) good.stop();
  }

  // ---------- subjek email tidak boleh memuat baris baru ----------
  {
    const injected = buildReportEmail({
      report: { ...sampleReport(), student: { name: "Budi\r\nBcc: jahat@example.com", grades: [] } },
      pageUrl: "https://dcc.test/orangtua/laporan.html#t",
      expiresAt: null
    });
    ok("email: subjek tidak memuat baris baru", !/[\r\n]/.test(injected.subject), JSON.stringify(injected.subject));
    let seenSubject = null;
    const smtp2 = createMailer({
      provider: "smtp",
      transportFactory: () => ({ sendMail: async (message) => { seenSubject = message.subject; return { messageId: "x" }; } }),
      env: { ...process.env, NODE_ENV: "test", SMTP_HOST: "smtp.test" }
    });
    await smtp2.send({ to: "a@example.com", subject: "Halo\r\nBcc: jahat@example.com", text: "x" });
    ok("mailer: subjek dari pemanggil dibersihkan dari baris baru", !/[\r\n]/.test(seenSubject), JSON.stringify(seenSubject));
  }
}

main()
  .catch((error) => {
    record("tes berjalan tanpa exception", false, error && error.stack ? error.stack.split("\n").slice(0, 3).join(" | ") : String(error));
  })
  .finally(() => {
    try { db.close(); } catch (_) {}
    for (const f of [".sqlite", ".sqlite-wal", ".sqlite-shm"]) {
      try { fs.unlinkSync(`${TMP}${f}`); } catch (_) {}
    }
    try { fs.rmSync(`${TMP}-plugins`, { recursive: true, force: true }); } catch (_) {}
    const passed = results.filter(Boolean).length;
    console.log(`${passed}/${results.length} lolos`);
    process.exit(passed === results.length ? 0 : 1);
  });