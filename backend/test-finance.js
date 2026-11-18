// Tes endpoint keuangan (ringkasan, transaksi siswa, pengeluaran) di portal admin.
// Jalankan: node test-finance.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 3115;
const TMPDB = path.join(os.tmpdir(), `dcc-test-finance-${process.pid}.sqlite`);
const PLUGIN_DIR = path.join(os.tmpdir(), `dcc-test-finance-plugins-${process.pid}`);

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

const db = require("./database");
const auth = require("./auth");

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

const adminId = addUser("fin-admin", "admin");
const instructorId = addUser("fin-instruktur", "instruktur");
const smpId = addUser("fin-smp", "student", { grades: ["SMP"], fullName: "Siswa SMP" });
const smkId = addUser("fin-smk", "student", { grades: ["SMK"], fullName: "Siswa SMK" });

const adminToken = auth.createSession(adminId);
const instructorToken = auth.createSession(instructorId);

const B = `http://127.0.0.1:${PORT}`;

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
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    throw new Error(`bukan JSON (HTTP ${res.status}): ${text.slice(0, 160)}`);
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

async function main() {
  await waitReady();

  const paidBody = {
    studentId: smpId,
    learningPathId: "SMP|Python Start",
    price: 650000,
    discount: 50000,
    method: "Transfer Bank",
    status: "pending",
    note: "Menunggu bukti transfer"
  };
  let trxPaid = null;
  let trxPending = null;
  let expense = null;

  await t("finance: tanpa token -> 401", async () => {
    const { r, d } = await api("GET", "/api/admin/finance/summary");
    eq(r.status, 401, "status");
    eq(d.code, "UNAUTHORIZED", "code");
  });

  await t("finance: instruktur ditolak (khusus admin)", async () => {
    const { r, d } = await api("GET", "/api/admin/finance/summary", { token: instructorToken });
    eq(r.status, 403, "status");
    eq(d.code, "ADMIN_REQUIRED", "code");
  });

  await t("finance: admin mencatat transaksi pending", async () => {
    const { r, d } = await api("POST", "/api/admin/finance/transactions", {
      token: adminToken,
      body: paidBody
    });
    eq(r.status, 201, "status");
    const item = d.item;
    eq(item.code, "TRX-1001", "kode transaksi");
    eq(item.studentName, "Siswa SMP", "nama siswa");
    eq(item.grade, "SMP", "grade dari learning path");
    eq(item.learningPathName, "Python Start", "nama learning path");
    eq(item.price, 650000, "harga");
    eq(item.discount, 50000, "diskon");
    eq(item.total, 600000, "total");
    eq(item.status, "pending", "status");
    eq(item.paidOn, "", "belum lunas");
    trxPaid = item;
  });

  await t("finance: validasi transaksi ditolak", async () => {
    const cases = [
      [{ ...paidBody, studentId: undefined }, "studentId"],
      [{ ...paidBody, studentId: 999999 }, "studentId"],
      [{ ...paidBody, price: 100000, discount: 200000 }, "discount"],
      [{ ...paidBody, price: -1 }, "price"],
      [{ ...paidBody, price: "abc" }, "price"],
      [{ ...paidBody, status: "lunas" }, "status"],
      [{ ...paidBody, grade: "SMA" }, "grade"],
      [{ ...paidBody, method: "" }, "method"],
      [{ ...paidBody, learningPathId: "" }, "learningPathId"],
      [{ ...paidBody, note: "x".repeat(501) }, "note"]
    ];
    for (const [body, field] of cases) {
      const { r, d } = await api("POST", "/api/admin/finance/transactions", { token: adminToken, body });
      eq(r.status, 400, `status ${field}`);
      eq(d.details && d.details.field, field, `field ${field}`);
    }
  });

  await t("finance: transaksi kedua memakai grade siswa SMK", async () => {
    const { r, d } = await api("POST", "/api/admin/finance/transactions", {
      token: adminToken,
      body: {
        studentId: smkId,
        learningPathId: "Web Development Advanced",
        price: 1000000,
        method: "QRIS",
        status: "pending"
      }
    });
    eq(r.status, 201, "status");
    eq(d.item.code, "TRX-1002", "kode");
    eq(d.item.grade, "SMK", "grade dari akun siswa");
    eq(d.item.total, 1000000, "total tanpa diskon");
    trxPending = d.item;
  });

  await t("finance: daftar transaksi bisa difilter dan dipaging", async () => {
    const semua = await api("GET", "/api/admin/finance/transactions", { token: adminToken });
    eq(semua.r.status, 200, "status");
    eq(semua.d.total, 2, "total");
    eq(semua.d.items.length, 2, "jumlah");
    eq(semua.d.ringkasan.menunggu, 1600000, "menunggu");

    const smp = await api("GET", "/api/admin/finance/transactions?grade=SMP", { token: adminToken });
    eq(smp.d.total, 1, "filter grade");
    eq(smp.d.items[0].code, "TRX-1001", "baris SMP");

    const cari = await api("GET", "/api/admin/finance/transactions?q=smk", { token: adminToken });
    eq(cari.d.total, 1, "cari username");

    const path = await api("GET", "/api/admin/finance/transactions?learningPathId=" + encodeURIComponent("SMP|Python Start"), { token: adminToken });
    eq(path.d.total, 1, "filter learning path");

    const page = await api("GET", "/api/admin/finance/transactions?limit=1&page=2&sort=total&dir=asc", { token: adminToken });
    eq(page.d.items.length, 1, "paging");
    eq(page.d.pages, 2, "jumlah halaman");
    eq(page.d.items[0].total, 1000000, "urut total naik");
  });

  await t("finance: verifikasi pembayaran mengisi tanggal lunas", async () => {
    const { r, d } = await api("PATCH", `/api/admin/finance/transactions/${trxPaid.id}`, {
      token: adminToken,
      body: { status: "paid", paidAt: "2026-11-05", note: "Bukti transfer sesuai" }
    });
    eq(r.status, 200, "status");
    eq(d.item.status, "paid", "status lunas");
    eq(d.item.paidOn, "2026-11-05", "tanggal lunas");
    ok(d.item.paidAt, "timestamp lunas terisi");
    trxPaid = d.item;
  });

  await t("finance: menolak pembayaran mengosongkan tanggal lunas", async () => {
    const { r, d } = await api("PATCH", `/api/admin/finance/transactions/${trxPending.id}`, {
      token: adminToken,
      body: { status: "paid", paidAt: "2026-11-07" }
    });
    eq(r.status, 200, "status lunas");
    eq(d.item.paidOn, "2026-11-07", "tanggal lunas");

    const tolak = await api("PATCH", `/api/admin/finance/transactions/${trxPending.id}`, {
      token: adminToken,
      body: { status: "failed", note: "Bukti tidak sesuai" }
    });
    eq(tolak.r.status, 200, "status tolak");
    eq(tolak.d.item.status, "failed", "status gagal");
    eq(tolak.d.item.paidOn, "", "tanggal lunas dikosongkan");
    eq(tolak.d.item.paidAt, null, "timestamp lunas dikosongkan");
    trxPending = tolak.d.item;
  });

  await t("finance: patch menghitung ulang total", async () => {
    const { r, d } = await api("PATCH", `/api/admin/finance/transactions/${trxPending.id}`, {
      token: adminToken,
      body: { price: 900000, discount: 100000, status: "pending" }
    });
    eq(r.status, 200, "status");
    eq(d.item.total, 800000, "total baru");
    eq(d.item.status, "pending", "status kembali menunggu");

    const salah = await api("PATCH", `/api/admin/finance/transactions/${trxPending.id}`, {
      token: adminToken,
      body: { price: 1000, discount: 5000 }
    });
    eq(salah.r.status, 400, "diskon melebihi harga");
    eq(salah.d.details.field, "discount", "field");
  });

  await t("finance: pengeluaran dibuat dan divalidasi", async () => {
    const { r, d } = await api("POST", "/api/admin/finance/expenses", {
      token: adminToken,
      body: { kategori: "Server & Domain", nominal: 350000, tanggal: "2026-11-06", catatan: "Domain tahunan" }
    });
    eq(r.status, 201, "status");
    eq(d.item.code, "EXP-501", "kode");
    eq(d.item.nominal, 350000, "nominal");
    eq(d.item.tanggal, "2026-11-06", "tanggal");
    expense = d.item;

    const cases = [
      [{ kategori: "", nominal: 1000 }, "kategori"],
      [{ kategori: "Operasional", nominal: 0 }, "nominal"],
      [{ kategori: "Operasional", nominal: -5 }, "nominal"],
      [{ kategori: "Operasional", nominal: 1000, tanggal: "2026-02-30" }, "tanggal"]
    ];
    for (const [body, field] of cases) {
      const res = await api("POST", "/api/admin/finance/expenses", { token: adminToken, body });
      eq(res.r.status, 400, `status ${field}`);
      eq(res.d.details && res.d.details.field, field, `field ${field}`);
    }
  });

  await t("finance: ringkasan menghitung pemasukan, pengeluaran, dan laba", async () => {
    const { r, d } = await api("GET", "/api/admin/finance/summary?from=2026-11-01&to=2026-11-30", { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.pemasukan, 600000, "pemasukan");
    eq(d.pengeluaran, 350000, "pengeluaran");
    eq(d.laba, 250000, "laba");
    eq(d.diskon, 50000, "diskon lunas");
    eq(d.menunggu.total, 800000, "menunggu");
    eq(d.menunggu.count, 1, "jumlah menunggu");
    eq(d.transaksi.paid, 1, "jumlah lunas");
    eq(d.transaksi.pending, 1, "jumlah pending");
    eq(d.perJenjang.find((x) => x.grade === "SMP").total, 600000, "per jenjang");
    eq(d.perJenjang.find((x) => x.grade === "SMK").total, 0, "SMK belum lunas");
    eq(d.pengeluaranKategori[0], { kategori: "Server & Domain", total: 350000, count: 1 }, "kategori");
    const hari = d.harian.find((x) => x.tanggal === "2026-11-05");
    eq([hari.masuk, hari.keluar], [600000, 0], "harian masuk");
    const hariKeluar = d.harian.find((x) => x.tanggal === "2026-11-06");
    eq([hariKeluar.masuk, hariKeluar.keluar], [0, 350000], "harian keluar");
  });

  await t("finance: validasi ringkasan dan daftar menolak input salah", async () => {
    let res = await api("GET", "/api/admin/finance/summary?from=2026-12-01&to=2026-11-01", { token: adminToken });
    eq(res.r.status, 400, "rentang terbalik");
    eq(res.d.details.field, "from", "field from");

    res = await api("GET", "/api/admin/finance/summary?from=2025-01-01&to=2026-12-31", { token: adminToken });
    eq(res.r.status, 400, "rentang terlalu panjang");

    res = await api("GET", "/api/admin/finance/transactions?status=lunas", { token: adminToken });
    eq(res.r.status, 400, "status tidak dikenal");

    res = await api("GET", "/api/admin/finance/transactions?from=2026-02-30", { token: adminToken });
    eq(res.r.status, 400, "tanggal tidak sah");
  });

  await t("finance: daftar pengeluaran difilter", async () => {
    const { r, d } = await api("GET", "/api/admin/finance/expenses?from=2026-11-01&to=2026-11-30", { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.total, 1, "total");
    eq(d.ringkasan.total, 350000, "jumlah nominal");

    const kosong = await api("GET", "/api/admin/finance/expenses?kategori=Operasional", { token: adminToken });
    eq(kosong.d.total, 0, "filter kategori");
  });

  await t("finance: pengeluaran bisa diubah", async () => {
    const { r, d } = await api("PATCH", `/api/admin/finance/expenses/${expense.id}`, {
      token: adminToken,
      body: { nominal: 400000, catatan: "Domain dan hosting" }
    });
    eq(r.status, 200, "status");
    eq(d.item.nominal, 400000, "nominal baru");
    eq(d.item.catatan, "Domain dan hosting", "catatan baru");
    expense = d.item;

    const kosong = await api("PATCH", `/api/admin/finance/expenses/${expense.id}`, {
      token: adminToken,
      body: {}
    });
    eq(kosong.r.status, 400, "tanpa perubahan");
  });

  await t("finance: hapus transaksi dan pengeluaran", async () => {
    let res = await api("DELETE", `/api/admin/finance/transactions/${trxPending.id}`, { token: adminToken });
    eq(res.r.status, 200, "hapus transaksi");
    res = await api("PATCH", `/api/admin/finance/transactions/${trxPending.id}`, { token: adminToken, body: { note: "x" } });
    eq(res.r.status, 404, "transaksi hilang");

    res = await api("DELETE", `/api/admin/finance/expenses/${expense.id}`, { token: adminToken });
    eq(res.r.status, 200, "hapus pengeluaran");
    res = await api("DELETE", `/api/admin/finance/expenses/${expense.id}`, { token: adminToken });
    eq(res.r.status, 404, "pengeluaran hilang");
  });

  await t("finance: audit mencatat create/update/delete", async () => {
    const rows = db.prepare(`SELECT action FROM admin_audit
      WHERE action LIKE 'finance_%' ORDER BY id ASC`).all().map((row) => row.action);
    ok(rows.includes("finance_transaction.create"), "audit create transaksi");
    ok(rows.includes("finance_transaction.update"), "audit update transaksi");
    ok(rows.includes("finance_transaction.delete"), "audit delete transaksi");
    ok(rows.includes("finance_expense.create"), "audit create pengeluaran");
    ok(rows.includes("finance_expense.update"), "audit update pengeluaran");
    ok(rows.includes("finance_expense.delete"), "audit delete pengeluaran");
  });

  // Ringkasan
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
