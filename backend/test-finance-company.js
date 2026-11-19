// Tes backend keuangan perusahaan: pemasukan lain, status pengeluaran,
// payroll (gaji & honor), anggaran operasional, dan ringkasan perusahaan.
// Jalankan: node test-finance-company.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 3119;
const TMPDB = path.join(os.tmpdir(), `dcc-test-finance-company-${process.pid}.sqlite`);
const PLUGIN_DIR = path.join(os.tmpdir(), `dcc-test-finance-company-plugins-${process.pid}`);

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

const adminId = addUser("fc-admin", "admin");
const instructorId = addUser("fc-instruktur", "instruktur", { fullName: "Bu Instruktur" });
const studentId = addUser("fc-siswa", "student", { grades: ["SMP"], fullName: "Siswa Finance" });

const adminToken = auth.createSession(adminId);
const instructorToken = auth.createSession(instructorId);
const studentToken = auth.createSession(studentId);

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

function jakartaToday() {
  const parts = {};
  for (const part of new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date())) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function prevMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const TODAY = jakartaToday();
const PERIODE = TODAY.slice(0, 7);
const PREV = prevMonth(PERIODE);

const resultsState = { incomeId: 0, expenseId: 0, payrollId: 0, staffPayrollId: 0, serverBudgetId: 0, payrollBudgetId: 0 };

async function main() {
  await waitReady();

  await t("company: butuh login admin", async () => {
    let { r } = await api("GET", "/api/admin/finance/income");
    eq(r.status, 401, "tanpa token");
    ({ r } = await api("GET", "/api/admin/finance/income", { token: instructorToken }));
    eq(r.status, 403, "instruktur ditolak");
    ({ r } = await api("GET", "/api/admin/finance/company", { token: studentToken }));
    eq(r.status, 403, "siswa ditolak");
  });

  await t("income: buat pemasukan perusahaan", async () => {
    const { r, d } = await api("POST", "/api/admin/finance/income", {
      token: adminToken,
      body: { kategori: "Sponsor", keterangan: "Sponsor lomba coding", nominal: 2500000, tanggal: TODAY, bukti: "sponsor.pdf" }
    });
    eq(r.status, 201, "status");
    ok(d.item.code.startsWith("INC-"), "kode INC-");
    eq(d.item.nominal, 2500000, "nominal");
    eq(d.item.tanggal, TODAY, "tanggal");
    eq(d.item.bukti, "sponsor.pdf", "bukti");
    resultsState.incomeId = d.item.id;
  });

  await t("income: validasi nominal dan tanggal", async () => {
    let { r, d } = await api("POST", "/api/admin/finance/income", {
      token: adminToken, body: { kategori: "Donasi", nominal: 0 }
    });
    eq(r.status, 400, "nominal nol");
    eq(d.details.field, "nominal", "field nominal");

    ({ r, d } = await api("POST", "/api/admin/finance/income", {
      token: adminToken, body: { kategori: "Donasi", nominal: 100000, tanggal: "2026-02-30" }
    }));
    eq(r.status, 400, "tanggal tidak sah");
    eq(d.details.field, "tanggal", "field tanggal");
  });

  await t("income: daftar, filter, ubah, dan hapus", async () => {
    let { r, d } = await api("GET", `/api/admin/finance/income?kategori=Sponsor&from=${PERIODE}-01&to=${TODAY}`, { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.total, 1, "jumlah");
    eq(d.ringkasan.total, 2500000, "ringkasan");
    eq(d.items[0].id, resultsState.incomeId, "id");

    ({ r, d } = await api("PATCH", `/api/admin/finance/income/${resultsState.incomeId}`, {
      token: adminToken, body: { nominal: 3000000, keterangan: "Sponsor utama" }
    }));
    eq(r.status, 200, "ubah");
    eq(d.item.nominal, 3000000, "nominal baru");
    eq(d.item.keterangan, "Sponsor utama", "keterangan baru");

    ({ r } = await api("DELETE", `/api/admin/finance/income/${resultsState.incomeId}`, { token: adminToken }));
    eq(r.status, 200, "hapus");
    ({ d } = await api("GET", "/api/admin/finance/income", { token: adminToken }));
    eq(d.total, 0, "tersisa");
  });

  await t("expenses: status pengajuan tersimpan dan hanya Dibayar masuk ringkasan", async () => {
    const from = `${PERIODE}-01`;
    let { r, d } = await api("POST", "/api/admin/finance/expenses", {
      token: adminToken,
      body: { kategori: "Server & Domain", nominal: 800000, tanggal: TODAY, status: "submitted", catatan: "Perpanjangan domain" }
    });
    eq(r.status, 201, "status");
    eq(d.item.status, "submitted", "status awal");
    resultsState.expenseId = d.item.id;

    ({ d } = await api("GET", `/api/admin/finance/summary?from=${from}&to=${TODAY}`, { token: adminToken }));
    eq(d.pengeluaran, 0, "belum dihitung");
    eq(d.pengeluaranStatus.submitted.total, 800000, "submitted");

    ({ r, d } = await api("PATCH", `/api/admin/finance/expenses/${resultsState.expenseId}`, {
      token: adminToken, body: { status: "approved", bukti: "invoice.pdf" }
    }));
    eq(r.status, 200, "approve");
    eq(d.item.status, "approved", "status approved");
    eq(d.item.bukti, "invoice.pdf", "bukti");

    ({ d } = await api("GET", `/api/admin/finance/summary?from=${from}&to=${TODAY}`, { token: adminToken }));
    eq(d.pengeluaran, 0, "approved belum dibayar");
    eq(d.pengeluaranStatus.approved.total, 800000, "komitmen");

    ({ r, d } = await api("PATCH", `/api/admin/finance/expenses/${resultsState.expenseId}`, {
      token: adminToken, body: { status: "paid" }
    }));
    eq(r.status, 200, "bayar");
    ({ d } = await api("GET", `/api/admin/finance/summary?from=${from}&to=${TODAY}`, { token: adminToken }));
    eq(d.pengeluaran, 800000, "sudah dibayar");

    ({ d } = await api("GET", "/api/admin/finance/expenses?status=paid", { token: adminToken }));
    eq(d.total, 1, "filter status");
    eq(d.ringkasan.dibayar, 800000, "ringkasan dibayar");
  });

  await t("payroll: buat gaji instruktur dari data user", async () => {
    const { r, d } = await api("POST", "/api/admin/finance/payroll", {
      token: adminToken,
      body: { refUserId: instructorId, periode: PERIODE, pokok: 2000000, tunjangan: 300000, bonus: 200000, potongan: 100000 }
    });
    eq(r.status, 201, "status");
    eq(d.item.tipe, "Instruktur", "tipe");
    eq(d.item.nama, "Bu Instruktur", "nama dari user");
    eq(d.item.total, 2400000, "total bersih");
    eq(d.item.status, "draft", "status draft");
    ok(d.item.code.startsWith("PAY-"), "kode PAY-");
    resultsState.payrollId = d.item.id;
  });

  await t("payroll: tolak duplikat periode dan potongan berlebih", async () => {
    let { r, d } = await api("POST", "/api/admin/finance/payroll", {
      token: adminToken, body: { refUserId: instructorId, periode: PERIODE, pokok: 1000000 }
    });
    eq(r.status, 409, "duplikat");
    eq(d.code, "CONFLICT", "kode konflik");

    ({ r, d } = await api("POST", "/api/admin/finance/payroll", {
      token: adminToken, body: { nama: "Staf Baru", periode: PERIODE, pokok: 1000000, potongan: 1500000 }
    }));
    eq(r.status, 400, "potongan");
    eq(d.details.field, "potongan", "field potongan");

    ({ r, d } = await api("POST", "/api/admin/finance/payroll", {
      token: adminToken, body: { refUserId: instructorId, periode: "2999-01", pokok: 1000000 }
    }));
    eq(r.status, 400, "periode masa depan");
  });

  await t("payroll: staf lain, ubah komponen, dan hitung ulang total", async () => {
    let { r, d } = await api("POST", "/api/admin/finance/payroll", {
      token: adminToken, body: { nama: "Staf Admin", periode: PERIODE, pokok: 1000000, tunjangan: 0, bonus: 0, potongan: 0 }
    });
    eq(r.status, 201, "status");
    eq(d.item.tipe, "Staf", "tipe");
    resultsState.staffPayrollId = d.item.id;

    const dup = await api("POST", "/api/admin/finance/payroll", {
      token: adminToken, body: { nama: "staf admin", periode: PERIODE, pokok: 1200000 }
    });
    eq(dup.r.status, 409, "duplikat nama tanpa beda huruf");

    ({ r, d } = await api("PATCH", `/api/admin/finance/payroll/${resultsState.payrollId}`, {
      token: adminToken, body: { pokok: 2200000, bonus: 250000 }
    }));
    eq(r.status, 200, "ubah");
    eq(d.item.total, 2650000, "total ulang");
  });

  await t("payroll: catat pembayaran dan kunci data", async () => {
    let { r, d } = await api("POST", `/api/admin/finance/payroll/${resultsState.payrollId}/pay`, {
      token: adminToken, body: { tanggal: `${PREV}-15` }
    });
    eq(r.status, 400, "tanggal sebelum periode");
    eq(d.details.field, "tanggal", "field tanggal");

    ({ r, d } = await api("POST", `/api/admin/finance/payroll/${resultsState.payrollId}/pay`, {
      token: adminToken, body: { tanggal: TODAY, metode: "Transfer Bank" }
    }));
    eq(r.status, 200, "bayar");
    eq(d.item.status, "paid", "status paid");
    eq(d.item.tanggalBayar, TODAY, "tanggal bayar");

    ({ r, d } = await api("PATCH", `/api/admin/finance/payroll/${resultsState.payrollId}`, {
      token: adminToken, body: { pokok: 1000000 }
    }));
    eq(r.status, 409, "ubah setelah bayar");
    eq(d.code, "PAYROLL_LOCKED", "kode terkunci");

    ({ r, d } = await api("DELETE", `/api/admin/finance/payroll/${resultsState.payrollId}`, { token: adminToken }));
    eq(r.status, 409, "hapus setelah bayar");
  });

  await t("payroll: daftar dan ringkasan periode", async () => {
    const { r, d } = await api("GET", `/api/admin/finance/payroll?periode=${PERIODE}`, { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.total, 2, "dua penerima");
    eq(d.ringkasan.paid.total, 2650000, "total dibayar");
    eq(d.ringkasan.draft.total, 1000000, "total draft");
    eq(d.ringkasan.draft.count, 1, "jumlah draft");
  });

  await t("budgets: buat, tolak duplikat, ubah, dan hapus", async () => {
    let { r, d } = await api("POST", "/api/admin/finance/budgets", {
      token: adminToken, body: { periode: PERIODE, kategori: "Server & Domain", jumlah: 1000000 }
    });
    eq(r.status, 201, "status");
    resultsState.serverBudgetId = d.item.id;

    ({ r, d } = await api("POST", "/api/admin/finance/budgets", {
      token: adminToken, body: { periode: PERIODE, kategori: "Server & Domain", jumlah: 2000000 }
    }));
    eq(r.status, 409, "duplikat");

    ({ r, d } = await api("POST", "/api/admin/finance/budgets", {
      token: adminToken, body: { periode: PERIODE, kategori: "Gaji & Honor", jumlah: 3000000 }
    }));
    eq(r.status, 201, "gaji");
    resultsState.payrollBudgetId = d.item.id;

    ({ r, d } = await api("PATCH", `/api/admin/finance/budgets/${resultsState.serverBudgetId}`, {
      token: adminToken, body: { jumlah: 1200000 }
    }));
    eq(r.status, 200, "ubah");
    eq(d.item.jumlah, 1200000, "jumlah baru");

    ({ d } = await api("GET", `/api/admin/finance/budgets?periode=${PERIODE}`, { token: adminToken }));
    eq(d.total, 2, "jumlah kategori");
    eq(d.ringkasan.total, 4200000, "total anggaran");
  });

  await t("company: ringkasan bulanan menghitung realisasi dan anggaran", async () => {
    const { r, d } = await api("GET", `/api/admin/finance/company?periode=${PERIODE}`, { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.periode, PERIODE, "periode");
    eq(d.pemasukanLain.total, 0, "pemasukan lain sudah dihapus");
    eq(d.pengeluaran.paid.total, 800000, "pengeluaran dibayar");
    eq(d.pengeluaran.approved.total, 0, "approved sudah dibayar");
    eq(d.payroll.paid.total, 2650000, "payroll periode");
    eq(d.payroll.draft.total, 1000000, "draft periode");
    eq(d.payroll.dibayarBulanIni.total, 2650000, "payroll dibayar bulan ini");

    const server = d.anggaran.rows.find((row) => row.kategori === "Server & Domain");
    ok(server, "baris server ada");
    eq(server.anggaran, 1200000, "anggaran server");
    eq(server.realisasi, 800000, "realisasi server");
    eq(server.status, "ok", "status server");

    const gaji = d.anggaran.rows.find((row) => row.kategori === "Gaji & Honor");
    ok(gaji, "baris gaji ada");
    eq(gaji.realisasi, 2650000, "realisasi gaji dari payroll");
    eq(gaji.status, "warn", "80-100 persen");
    eq(gaji.pct, 88, "persentase");
    eq(d.anggaran.total, 4200000, "total anggaran");
    eq(d.anggaran.realisasi, 3450000, "total realisasi");
    eq(d.anggaran.sisa, 750000, "sisa");
  });

  await t("summary: pemasukan lain, payroll, dan laba bersih", async () => {
    const tx = await api("POST", "/api/admin/finance/transactions", {
      token: adminToken,
      body: { studentId, learningPathId: "SMP|Python Start", price: 650000, method: "Transfer Bank", status: "paid", paidAt: TODAY }
    });
    eq(tx.r.status, 201, "transaksi lunas");

    const inc = await api("POST", "/api/admin/finance/income", {
      token: adminToken, body: { kategori: "Donasi", keterangan: "Donasi orang tua", nominal: 500000, tanggal: TODAY }
    });
    eq(inc.r.status, 201, "pemasukan lain");

    const { r, d } = await api("GET", `/api/admin/finance/summary?from=${PERIODE}-01&to=${TODAY}`, { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.pemasukan, 650000, "pemasukan siswa");
    eq(d.pemasukanLain, 500000, "pemasukan lain");
    eq(d.pengeluaran, 800000, "pengeluaran");
    eq(d.payroll.total, 2650000, "payroll dibayar");
    eq(d.laba, 650000 + 500000 - 800000 - 2650000, "laba bersih");
    eq(d.labaOperasional, 650000 - 800000, "laba operasional");
  });

  await t("audit: perubahan keuangan perusahaan tercatat", async () => {
    const rows = db.prepare(`SELECT action FROM admin_audit
      WHERE action LIKE 'finance_%' GROUP BY action`).all().map((row) => row.action);
    for (const action of [
      "finance_income.create",
      "finance_income.update",
      "finance_income.delete",
      "finance_expense.create",
      "finance_expense.update",
      "finance_payroll.create",
      "finance_payroll.update",
      "finance_payroll.pay",
      "finance_budget.create",
      "finance_budget.update"
    ]) {
      ok(rows.includes(action), `audit ${action} tidak ada`);
    }
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
