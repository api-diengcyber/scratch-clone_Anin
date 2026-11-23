// Tes backend langganan & pembayaran manual.
// Cakupan: paket harga, checkout invoice, transaksi Finance, konfirmasi admin,
// aktivasi/perpanjangan, batas durasi, tolak/batal, hook Finance, kedaluwarsa,
// dan siklus baru setelah langganan habis.
// Jalankan: node test-subscription.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 3121;
const TMPDB = path.join(os.tmpdir(), `dcc-test-subscription-${process.pid}.sqlite`);
const PLUGIN_DIR = path.join(os.tmpdir(), `dcc-test-subscription-plugins-${process.pid}`);

for (const file of [TMPDB, TMPDB + "-shm", TMPDB + "-wal"]) {
  try { fs.unlinkSync(file); } catch {}
}
fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });

process.env.DB_PATH = TMPDB;
process.env.NODE_ENV = "test";
process.env.PORT = String(PORT);
process.env.PLUGIN_DIR = PLUGIN_DIR;
process.env.REPORT_EMAIL_ENABLED = "false";
process.env.LOG_LEVEL = "error";
process.env.SUBSCRIPTION_BANK_NAME = "Bank Uji";
process.env.SUBSCRIPTION_BANK_ACCOUNT = "1234567890";
process.env.SUBSCRIPTION_BANK_HOLDER = "Yayasan Uji";
process.env.SUBSCRIPTION_INVOICE_DAYS = "3";

const db = require("./database");
const auth = require("./auth");
const D = require("./report-deliveries");
const service = require("./subscription-service");
const gateway = require("./payment-gateway");

function addUser(username, role, { grades = null, fullName = "" } = {}) {
  const info = db.prepare(`INSERT INTO users (username, email, role, allowed_grades, full_name, status, must_change_password)
    VALUES (?, ?, ?, ?, ?, 'active', 0)`).run(
    username,
    `${username}@example.com`,
    role,
    grades === null ? null : JSON.stringify(grades),
    fullName || null
  );
  return Number(info.lastInsertRowid);
}

function addGuardian(studentId, name, email) {
  db.prepare(`INSERT INTO student_guardians (student_user_id, name, email, relation)
    VALUES (?, ?, ?, 'ibu')`).run(studentId, name, email);
}

const adminId = addUser("sub-admin", "admin", { fullName: "Admin Langganan" });
const studentId = addUser("sub-siswa", "student", { grades: ["SMP"], fullName: "Siswa Langganan" });
const otherId = addUser("sub-lain", "student", { grades: ["SD"], fullName: "Siswa Lain" });
const renewId = addUser("sub-perpanjang", "student", { grades: ["SMK"], fullName: "Siswa Perpanjang" });
const remindId = addUser("sub-pengingat", "student", { grades: ["SD"], fullName: "Siswa Pengingat" });

addGuardian(studentId, "Ibu Langganan", "wali-langganan@example.com");
addGuardian(renewId, "Ibu Perpanjang", "wali-perpanjang@example.com");
addGuardian(otherId, "Ibu Lain", "wali-lain@example.com");

const adminToken = auth.createSession(adminId);
const studentToken = auth.createSession(studentId);
const otherToken = auth.createSession(otherId);
const renewToken = auth.createSession(renewId);

const B = `http://127.0.0.1:${PORT}`;
const today = service.todayWib();

const child = spawn(process.execPath, ["server.js"], {
  cwd: __dirname,
  env: { ...process.env }
});
let out = "";
child.stdout.on("data", (d) => { out += d; });
child.stderr.on("data", (d) => { out += d; });

function waitReady() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (out.includes("DIENG CYBER CODING - SERVER") && out.includes(`API      : http://localhost:${PORT}`)) {
        clearInterval(iv);
        resolve();
      } else if (child.exitCode !== null) {
        clearInterval(iv);
        reject(new Error("Server berhenti sebelum siap. Output:\n" + out));
      } else if (Date.now() - t0 > 60000) {
        clearInterval(iv);
        reject(new Error("Server tidak siap dalam 60 detik. Output:\n" + out));
      }
    }, 100);
  });
}

async function j(res) {
  const body = await res.text();
  try { return JSON.parse(body); } catch {
    throw new Error(`bukan JSON (HTTP ${res.status}): ${body.slice(0, 160)}`);
  }
}
async function api(method, url, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(B + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { r, d: await j(r) };
}

const results = [];
async function t(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + " - " + e.message]);
  }
}
function eq(got, want, msg) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${msg}: dapat ${JSON.stringify(got)}, harap ${JSON.stringify(want)}`);
  }
}
function ok(value, msg) {
  if (!value) throw new Error(msg);
}

function userRow(id) {
  return db.prepare("SELECT subscription_started_at, subscription_months FROM users WHERE id = ?").get(id);
}
function financeFor(studentId, code) {
  return db.prepare(`SELECT * FROM finance_transactions
    WHERE student_user_id = ? AND note LIKE ? ORDER BY id DESC LIMIT 1`).get(studentId, `%${code}%`);
}

async function putPackage(body, token = adminToken) {
  return api("PUT", "/api/admin/subscription/packages", { token, body });
}
async function checkout(token, body) {
  return api("POST", "/api/subscription/checkout", { token, body });
}
async function confirm(id, body = {}) {
  return api("POST", `/api/admin/subscription/payments/${id}/confirm`, { token: adminToken, body });
}

async function main() {
  await waitReady();

  let pkg3;
  await t("langganan: admin menyimpan paket jalur + durasi", async () => {
    let res = await putPackage({ key: "SMP|Python Start", months: 3, price: 650000 });
    eq(res.r.status, 201, "status create");
    eq(res.d.item.key, "SMP|Python Start", "key");
    eq(res.d.item.pathName, "Python Start", "nama jalur");
    eq(res.d.item.grade, "SMP", "jenjang");
    eq(res.d.item.months, 3, "durasi");
    eq(res.d.item.price, 650000, "harga");
    eq(res.d.item.active, true, "aktif");
    pkg3 = res.d.item;

    res = await putPackage({ key: "smp|Python Start", months: 3, price: 675000 });
    eq(res.r.status, 200, "upsert memperbarui");
    eq(res.d.item.id, pkg3.id, "id tetap");
    eq(res.d.item.price, 675000, "harga baru");
    res = await putPackage({ key: "SMP|Python Start", months: 3, price: 650000 });
    eq(res.d.item.price, 650000, "harga dikembalikan");
  });

  await t("langganan: validasi paket dan akses admin", async () => {
    let res = await putPackage({ key: "Tanpa Pemisah", months: 3, price: 100000 });
    eq(res.r.status, 400, "key tanpa | ditolak");
    res = await putPackage({ key: "SMP|X", months: 37, price: 100000 });
    eq(res.r.status, 400, "durasi 37 ditolak");
    res = await putPackage({ key: "SMP|X", months: 3, price: 0 });
    eq(res.r.status, 400, "harga 0 ditolak");
    res = await api("GET", "/api/admin/subscription/packages", { token: studentToken });
    eq(res.r.status, 403, "siswa tidak boleh kelola paket");
    res = await api("GET", "/api/subscription/packages", { token: adminToken });
    eq(res.r.status, 403, "admin bukan siswa");
  });

  await t("langganan: siswa melihat paket aktif", async () => {
    const res = await api("GET", "/api/subscription/packages", { token: studentToken });
    eq(res.r.status, 200, "status");
    ok(res.d.items.some((x) => x.id === pkg3.id), "paket muncul");
    const anon = await api("GET", "/api/subscription/packages");
    eq(anon.r.status, 401, "tanpa login ditolak");
  });

  let payment;
  await t("langganan: checkout membuat invoice + transaksi Finance pending", async () => {
    const res = await checkout(studentToken, { packageId: pkg3.id });
    eq(res.r.status, 201, "status");
    payment = res.d.item;
    eq(payment.status, "pending", "status invoice");
    eq(payment.total, 650000, "total");
    eq(payment.months, 3, "durasi");
    ok(payment.code.startsWith("SUB-"), "kode invoice");
    eq(res.d.instructions.bankName, "Bank Uji", "instruksi bank");
    eq(res.d.instructions.accountNumber, "1234567890", "nomor rekening");
    eq(payment.expiresOn, D.addDays(today, 3), "kedaluwarsa invoice");

    const finance = financeFor(studentId, payment.code);
    ok(finance, "transaksi finance dibuat");
    eq(finance.status, "pending", "finance pending");
    eq(finance.total, 650000, "nominal finance");
    eq(finance.learning_path_key, "SMP|Python Start", "jalur finance");
    ok(finance.code.startsWith("TRX-"), "kode finance");

    const again = await checkout(studentToken, { packageId: pkg3.id });
    eq(again.r.status, 200, "checkout ulang memakai invoice lama");
    eq(again.d.item.id, payment.id, "invoice sama");
    eq(again.d.reused, true, "reused");
  });

  await t("langganan: admin melihat invoice dan konfirmasi mengaktifkan", async () => {
    let res = await api("GET", `/api/admin/subscription/payments?status=pending&studentId=${studentId}`, { token: adminToken });
    eq(res.r.status, 200, "list");
    eq(res.d.total, 1, "satu pending");
    eq(res.d.items[0].studentName, "Siswa Langganan", "nama siswa");

    res = await api("GET", `/api/admin/subscription/payments/${payment.id}`, { token: adminToken });
    eq(res.r.status, 200, "detail");
    eq(res.d.item.code, payment.code, "kode");

    res = await confirm(payment.id, { paidAt: today });
    eq(res.r.status, 200, "konfirmasi");
    eq(res.d.item.status, "paid", "invoice lunas");
    eq(res.d.subscription.startedAt, today, "mulai hari ini");
    eq(res.d.subscription.months, 3, "durasi 3 bulan");
    eq(res.d.subscription.endsAt, D.subscriptionEndDate(today, 3), "akhir langganan");
    eq(res.d.activation.extended, false, "siklus pertama");
    eq(userRow(studentId).subscription_months, 3, "users diperbarui");

    const finance = financeFor(studentId, payment.code);
    eq(finance.status, "paid", "finance ikut lunas");

    const deliveries = db.prepare(`SELECT kind, period, due_date FROM report_deliveries
      WHERE student_user_id = ? ORDER BY id`).all(studentId);
    eq(deliveries.length, 3, "tiga email diantrekan");
    eq(deliveries.map((x) => x.kind), ["month1", "month2", "month3"], "jenis bulanan");
    eq(deliveries.map((x) => x.due_date), [1, 2, 3].map((n) => D.addMonths(today, n)), "jatuh tempo bulanan");
    eq(deliveries.map((x) => x.period), ["", "", ""], "periode siklus pertama");

    res = await confirm(payment.id);
    eq(res.r.status, 200, "konfirmasi ulang aman");
    eq(res.d.alreadyPaid, true, "sudah lunas");
    eq(res.d.subscription.months, 3, "tidak dobel");

    const audits = db.prepare("SELECT action FROM admin_audit WHERE action LIKE 'subscription%'").all().map((x) => x.action);
    ok(audits.includes("subscription_payment.confirm"), "audit konfirmasi");
    ok(audits.includes("subscription.activate"), "audit aktivasi");
  });

  await t("langganan: perpanjangan saat masih aktif menambah durasi", async () => {
    const res = await putPackage({ key: "SMP|Python Start", months: 1, price: 250000 });
    const pkg1 = res.d.item;
    const inv = await checkout(studentToken, { key: "SMP|Python Start", months: 1 });
    eq(inv.r.status, 201, "checkout 1 bulan");
    const done = await confirm(inv.d.item.id, { paidAt: today });
    eq(done.r.status, 200, "konfirmasi");
    eq(done.d.subscription.startedAt, today, "tanggal mulai tidak berubah");
    eq(done.d.subscription.months, 4, "durasi bertambah");
    eq(done.d.activation.extended, true, "ditandai perpanjangan");
    eq(done.d.subscription.endsAt, D.subscriptionEndDate(today, 4), "akhir ikut bergeser");
    const count = db.prepare("SELECT COUNT(*) AS n FROM report_deliveries WHERE student_user_id = ?").get(studentId).n;
    eq(count, 4, "bulan ke-4 diantrekan");
    ok(pkg1.id > 0, "paket 1 bulan ada");
  });

  await t("langganan: total durasi dibatasi 36 bulan", async () => {
    const res = await putPackage({ key: "SMP|Python Start", months: 36, price: 5000000 });
    const pkg36 = res.d.item;
    const inv = await checkout(studentToken, { packageId: pkg36.id });
    eq(inv.r.status, 400, "ditolak");
    eq(inv.d.details.field, "packageId", "field");
  });

  await t("langganan: admin bisa menolak pembayaran", async () => {
    const inv = await checkout(studentToken, { key: "SMP|Python Start", months: 1 });
    const res = await api("POST", `/api/admin/subscription/payments/${inv.d.item.id}/reject`, {
      token: adminToken,
      body: { reason: "Bukti transfer tidak valid" }
    });
    eq(res.r.status, 200, "tolak");
    eq(res.d.item.status, "failed", "status failed");
    eq(res.d.item.note, "Bukti transfer tidak valid", "alasan");
    const finance = financeFor(studentId, inv.d.item.code);
    eq(finance.status, "failed", "finance ikut gagal");
    eq(userRow(studentId).subscription_months, 4, "langganan tidak berubah");
  });

  await t("langganan: siswa bisa membatalkan invoice miliknya", async () => {
    const inv = await checkout(studentToken, { key: "SMP|Python Start", months: 1 });
    const res = await api("POST", `/api/subscription/payments/${inv.d.item.id}/cancel`, {
      token: studentToken,
      body: { reason: "Salah pilih paket" }
    });
    eq(res.r.status, 200, "batal");
    eq(res.d.item.status, "cancelled", "status");
    const finance = financeFor(studentId, inv.d.item.code);
    eq(finance.status, "failed", "finance gagal");

    const stolen = await api("POST", `/api/subscription/payments/${inv.d.item.id}/cancel`, { token: otherToken });
    eq(stolen.r.status, 404, "invoice siswa lain tidak terlihat");
    const detail = await api("GET", `/api/subscription/payments/${inv.d.item.id}`, { token: otherToken });
    eq(detail.r.status, 404, "detail pun 404");
  });

  await t("langganan: melunasi transaksi Finance mengaktifkan otomatis", async () => {
    const inv = await checkout(studentToken, { key: "SMP|Python Start", months: 1 });
    const finance = financeFor(studentId, inv.d.item.code);
    const res = await api("PATCH", `/api/admin/finance/transactions/${finance.id}`, {
      token: adminToken,
      body: { status: "paid" }
    });
    eq(res.r.status, 200, "finance lunas");
    const after = await api("GET", `/api/subscription/payments/${inv.d.item.id}`, { token: studentToken });
    eq(after.d.item.status, "paid", "invoice ikut lunas");
    eq(userRow(studentId).subscription_months, 5, "langganan bertambah");
  });

  await t("langganan: invoice kedaluwarsa tidak bisa dipakai", async () => {
    const inv = await checkout(studentToken, { key: "SMP|Python Start", months: 1 });
    db.prepare("UPDATE subscription_payments SET expires_on = ? WHERE id = ?")
      .run(D.addDays(today, -1), inv.d.item.id);
    const res = await api("GET", `/api/subscription/payments/${inv.d.item.id}`, { token: studentToken });
    eq(res.d.item.status, "expired", "status expired");
    const finance = financeFor(studentId, inv.d.item.code);
    eq(finance.status, "failed", "finance gagal");
    const fresh = await checkout(studentToken, { key: "SMP|Python Start", months: 1 });
    ok(fresh.d.item.id !== inv.d.item.id, "invoice baru dibuat");
    eq(fresh.d.item.status, "pending", "baru masih pending");
  });

  await t("langganan: setelah habis, pembelian memulai siklus baru", async () => {
    const oldStart = D.addMonths(today, -6);
    let res = await api("PUT", `/api/admin/users/${renewId}/subscription`, {
      token: adminToken,
      body: { startedAt: oldStart, months: 2 }
    });
    eq(res.r.status, 200, "langganan lama disiapkan");
    const oldRows = db.prepare(`SELECT kind, period FROM report_deliveries
      WHERE student_user_id = ? ORDER BY id`).all(renewId);
    eq(oldRows.length, 2, "dua email siklus lama");
    eq(oldRows.map((x) => x.period), ["", ""], "periode lama kosong");

    const inv = await checkout(renewToken, { key: "SMP|Python Start", months: 1 });
    const done = await confirm(inv.d.item.id, { paidAt: today });
    eq(done.r.status, 200, "konfirmasi siklus baru");
    eq(done.d.subscription.startedAt, today, "mulai hari ini");
    eq(done.d.subscription.months, 1, "durasi baru");
    eq(done.d.activation.extended, false, "bukan perpanjangan");

    const rows = db.prepare(`SELECT kind, period, due_date FROM report_deliveries
      WHERE student_user_id = ? ORDER BY id`).all(renewId);
    eq(rows.length, 3, "dua lama + satu baru");
    eq(rows.slice(0, 2).map((x) => x.period), [`cycle:${oldStart}`, `cycle:${oldStart}`], "siklus lama ditandai");
    eq(rows[2].period, "", "siklus baru tanpa penanda");
    eq(rows[2].kind, "month1", "mulai dari bulan 1 lagi");
    eq(rows[2].due_date, D.addMonths(today, 1), "jatuh tempo baru");
  });

  await t("langganan: paket nonaktif tidak bisa dibeli", async () => {
    let res = await putPackage({ key: "SD|Game Development", months: 2, price: 800000, aktif: false });
    const off = res.d.item;
    const list = await api("GET", "/api/subscription/packages", { token: otherToken });
    ok(!list.d.items.some((x) => x.id === off.id), "tidak muncul di daftar siswa");
    const inv = await checkout(otherToken, { packageId: off.id });
    eq(inv.r.status, 400, "checkout ditolak");
    res = await putPackage({ key: "SD|Game Development", months: 2, price: 800000, aktif: true });
    const on = await checkout(otherToken, { packageId: res.d.item.id });
    eq(on.r.status, 201, "setelah aktif bisa dibeli");
  });

  await t("langganan: paket bisa dihapus tanpa merusak riwayat", async () => {
    const res = await putPackage({ key: "SD|Animasi Sederhana", months: 1, price: 350000 });
    const id = res.d.item.id;
    const inv = await checkout(otherToken, { packageId: id });
    const del = await api("DELETE", `/api/admin/subscription/packages/${id}`, { token: adminToken });
    eq(del.r.status, 200, "hapus");
    const again = await api("DELETE", `/api/admin/subscription/packages/${id}`, { token: adminToken });
    eq(again.r.status, 404, "sudah hilang");
    const detail = await api("GET", `/api/admin/subscription/payments/${inv.d.item.id}`, { token: adminToken });
    eq(detail.d.item.pathName, "Animasi Sederhana", "snapshot nama jalur tetap");
  });

  await t("langganan: validasi checkout", async () => {
    let res = await checkout(studentToken, { packageId: 999999 });
    eq(res.r.status, 404, "paket tidak ada");
    res = await checkout(studentToken, {});
    eq(res.r.status, 400, "tanpa paket");
    res = await api("POST", "/api/subscription/checkout", { token: adminToken, body: { packageId: 1 } });
    eq(res.r.status, 403, "admin tidak bisa checkout");
  });

  // ----------------------------------------------------------
  // Bukti transfer, notifikasi, pembayaran manual admin
  // ----------------------------------------------------------

  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  let proofPayment;

  await t("langganan: siswa mengunggah bukti transfer", async () => {
    // Invoice pending dari tes kedaluwarsa dipakai ulang (paket sama).
    const inv = await checkout(studentToken, { key: "SMP|Python Start", months: 1 });
    eq(inv.d.item.status, "pending", "invoice pending");
    proofPayment = inv.d.item;
    eq(proofPayment.hasProof, false, "belum ada bukti");

    let res = await api("POST", `/api/subscription/payments/${proofPayment.id}/proof`, {
      token: studentToken,
      body: { image: PNG, name: "struk-transfer.png" }
    });
    eq(res.r.status, 200, "unggah");
    eq(res.d.item.hasProof, true, "hasProof");
    eq(res.d.item.proof.name, "struk-transfer.png", "nama file");
    eq(res.d.item.proof.mime, "image/png", "mime");
    ok(res.d.item.proof.size > 0, "ukuran");
    ok(res.d.item.proof.uploadedAt, "waktu unggah");

    res = await api("GET", `/api/subscription/payments/${proofPayment.id}`, { token: studentToken });
    eq(res.d.item.hasProof, true, "detail siswa");
    ok(!res.d.item.proofDataUrl, "isi file tidak ikut di detail siswa");

    res = await api("GET", `/api/admin/subscription/payments/${proofPayment.id}`, { token: adminToken });
    eq(res.d.item.hasProof, true, "detail admin");
    ok(res.d.item.proofDataUrl.startsWith("data:image/png;base64,"), "admin bisa membuka isi file");

    const list = await api("GET", `/api/admin/subscription/payments?studentId=${studentId}`, { token: adminToken });
    ok(list.d.items.every((x) => !("proofDataUrl" in x)), "daftar tidak membawa isi file");
  });

  await t("langganan: bukti transfer divalidasi", async () => {
    const url = `/api/subscription/payments/${proofPayment.id}/proof`;
    let res = await api("POST", url, { token: studentToken, body: { image: "data:text/plain;base64,aGVsbG8=" } });
    eq(res.r.status, 400, "mime tidak didukung");

    res = await api("POST", url, { token: studentToken, body: { image: "data:image/png;base64,aGVsbG8=" } });
    eq(res.r.status, 400, "isi tidak cocok dengan mime");

    res = await api("POST", url, { token: studentToken, body: { image: "bukan-data-url" } });
    eq(res.r.status, 400, "bukan data URL");

    const big = "data:image/png;base64," + Buffer.alloc(service.MAX_PROOF_BYTES + 1).toString("base64");
    res = await api("POST", url, { token: studentToken, body: { image: big } });
    eq(res.r.status, 400, "melebihi batas ukuran");

    res = await api("POST", url, { token: otherToken, body: { image: PNG } });
    eq(res.r.status, 404, "invoice siswa lain tidak bisa diunggah");
  });

  await t("langganan: ringkasan siswa memuat instruksi transfer", async () => {
    const res = await api("GET", "/api/subscription", { token: studentToken });
    eq(res.r.status, 200, "status");
    eq(res.d.pendingPayment.id, proofPayment.id, "invoice pending");
    eq(res.d.instructions.provider, "manual", "provider");
    eq(res.d.instructions.bankName, "Bank Uji", "bank");
    eq(res.d.instructions.accountNumber, "1234567890", "rekening");
    eq(res.d.instructions.total, proofPayment.total, "total");
    ok(res.d.instructions.paymentUrl === null, "tanpa gateway");
  });

  await t("langganan: admin mencari invoice", async () => {
    let res = await api("GET", `/api/admin/subscription/payments?q=${encodeURIComponent(proofPayment.code)}`, { token: adminToken });
    eq(res.r.status, 200, "cari kode");
    ok(res.d.items.some((x) => x.id === proofPayment.id), "kode ketemu");

    res = await api("GET", `/api/admin/subscription/payments?q=${encodeURIComponent("Siswa Langganan")}`, { token: adminToken });
    ok(res.d.items.length > 0, "cari nama");
    ok(res.d.items.every((x) => x.studentId === studentId), "hanya siswa itu");

    res = await api("GET", `/api/admin/subscription/payments?q=${encodeURIComponent("tidak-ada-xyz")}`, { token: adminToken });
    eq(res.d.total, 0, "tidak ada hasil");
  });

  await t("langganan: notifikasi alur pembayaran dibuat", async () => {
    let res = await api("POST", `/api/admin/subscription/payments/${proofPayment.id}/reject`, {
      token: adminToken,
      body: { reason: "Bukti tidak terbaca" }
    });
    eq(res.r.status, 200, "tolak");

    res = await api("POST", `/api/subscription/payments/${proofPayment.id}/proof`, { token: studentToken, body: { image: PNG } });
    eq(res.r.status, 409, "bukti tidak bisa diunggah setelah ditolak");

    const kinds = db.prepare("SELECT kind FROM student_notifications WHERE user_id = ?").all(studentId).map((x) => x.kind);
    ok(kinds.includes("subscription.invoice"), "notifikasi invoice");
    ok(kinds.includes("subscription.active"), "notifikasi aktif");
    ok(kinds.includes("subscription.expired"), "notifikasi kedaluwarsa");
    ok(kinds.includes("subscription.rejected"), "notifikasi ditolak");

    const adminKinds = db.prepare("SELECT kind FROM admin_notifications").all().map((x) => x.kind);
    ok(adminKinds.includes("subscription.checkout"), "notifikasi admin checkout");
    ok(adminKinds.includes("subscription.proof"), "notifikasi admin bukti");
  });

  await t("langganan: admin mencatat pembayaran manual", async () => {
    const res = await api("POST", "/api/admin/subscription/payments", {
      token: adminToken,
      body: {
        studentId: otherId,
        key: "SD|Game Development",
        months: 2,
        method: "Tunai",
        paidAt: today,
        note: "Diterima di kantor"
      }
    });
    eq(res.r.status, 201, "status");
    eq(res.d.item.status, "paid", "invoice lunas");
    eq(res.d.item.method, "Tunai", "metode");
    eq(res.d.item.note, "Diterima di kantor", "catatan");
    eq(res.d.subscription.startedAt, today, "mulai hari ini");
    eq(res.d.subscription.months, 2, "durasi");
    eq(res.d.activation.extended, false, "siklus pertama");

    const finance = financeFor(otherId, res.d.item.code);
    eq(finance.status, "paid", "finance lunas");
    eq(finance.method, "Tunai", "finance metode");
    eq(finance.paid_on, today, "finance tanggal lunas");
    eq(userRow(otherId).subscription_months, 2, "users diperbarui");

    const deliveries = db.prepare("SELECT kind FROM report_deliveries WHERE student_user_id = ? ORDER BY id").all(otherId);
    eq(deliveries.map((x) => x.kind), ["month1", "month2"], "email bulanan diantrekan");
  });

  await t("langganan: validasi pembayaran manual", async () => {
    let res = await api("POST", "/api/admin/subscription/payments", {
      token: adminToken,
      body: { studentId: otherId, packageId: 999999 }
    });
    eq(res.r.status, 404, "paket tidak ada");

    res = await api("POST", "/api/admin/subscription/payments", {
      token: adminToken,
      body: { studentId: 999999, packageId: pkg3.id }
    });
    eq(res.r.status, 404, "murid tidak ada");

    res = await api("POST", "/api/admin/subscription/payments", {
      token: adminToken,
      body: { studentId: otherId, packageId: pkg3.id, paidAt: D.addDays(today, 1) }
    });
    eq(res.r.status, 400, "tanggal masa depan");

    res = await api("POST", "/api/admin/subscription/payments", {
      token: studentToken,
      body: { studentId: otherId, packageId: pkg3.id }
    });
    eq(res.r.status, 403, "siswa tidak boleh mencatat pembayaran");
  });

  await t("langganan: profil siswa memuat status langganan", async () => {
    let res = await api("GET", "/api/profile", { token: studentToken });
    eq(res.r.status, 200, "status");
    eq(res.d.profile.subscription.months, 5, "durasi");
    eq(res.d.profile.subscription.active, true, "aktif");

    res = await api("GET", "/api/profile", { token: adminToken });
    eq(res.d.profile.subscription, null, "admin tanpa langganan");
  });

  await t("langganan: sapuan kedaluwarsa idempoten", async () => {
    const before = db.prepare("SELECT COUNT(*) AS n FROM subscription_payments WHERE status = 'expired'").get().n;
    const changed = service.expirePending(db);
    const after = db.prepare("SELECT COUNT(*) AS n FROM subscription_payments WHERE status = 'expired'").get().n;
    eq(changed, 0, "tidak ada invoice baru yang kedaluwarsa");
    eq(after, before, "jumlah tetap");
  });

  await t("langganan: pengingat langganan berakhir", async () => {
    const start = D.addDays(today, -27);
    db.prepare("UPDATE users SET subscription_started_at = ?, subscription_months = 1 WHERE id = ?")
      .run(start, remindId);

    eq(service.remindExpiring(db, { days: 7 }), 1, "satu pengingat");
    eq(service.remindExpiring(db, { days: 7 }), 0, "tidak berulang");

    const row = db.prepare("SELECT kind, body FROM student_notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(remindId);
    eq(row.kind, "subscription.expiring", "jenis notifikasi");
    ok(row.body.includes("berakhir"), "isi pengingat");
    const endsAt = D.subscriptionEndDate(start, 1);
    ok(endsAt >= today && endsAt <= D.addDays(today, 7), "berakhir dalam 7 hari");
  });

  await t("langganan: gateway default manual", async () => {
    eq(gateway.providerName({}), "manual", "default");
    eq(gateway.providerName({ SUBSCRIPTION_GATEWAY: "midtrans" }), "manual", "provider asing fallback ke manual");
    const caps = gateway.capabilities({});
    eq([caps.provider, caps.manual, caps.webhook], ["manual", true, false], "kemampuan gateway");
  });

  const passed = results.filter((r) => r[0] === "PASS").length;
  for (const [status, name] of results) console.log(`${status}  ${name}`);
  console.log(`\n${passed}/${results.length} lolos`);
  child.kill();
  db.close();
  for (const file of [TMPDB, TMPDB + "-shm", TMPDB + "-wal"]) {
    try { fs.unlinkSync(file); } catch {}
  }
  fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  try { child.kill(); } catch {}
  process.exitCode = 1;
});
