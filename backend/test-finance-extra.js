// Tes backend finance tambahan: keterangan pengeluaran, kode promo pada
// transaksi, CRUD promo, paket & harga, dan audit trail finance di server.
// Jalankan: node test-finance-extra.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 3120;
const TMPDB = path.join(os.tmpdir(), `dcc-test-finance-extra-${process.pid}.sqlite`);
const PLUGIN_DIR = path.join(os.tmpdir(), `dcc-test-finance-extra-plugins-${process.pid}`);

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

const adminId = addUser("fx-admin", "admin");
const instructorId = addUser("fx-instruktur", "instruktur");
const studentId = addUser("fx-siswa", "student", { grades: ["SMP"], fullName: "Siswa Extra" });

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

function jakartaToday() {
  const parts = {};
  for (const part of new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date())) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const TODAY = jakartaToday();
const state = { promoId: 0, trxId: 0, packageId: 0 };

async function main() {
  await waitReady();

  await t("promo/paket/audit: butuh login admin", async () => {
    let { r } = await api("GET", "/api/admin/finance/promos");
    eq(r.status, 401, "tanpa token");
    ({ r } = await api("GET", "/api/admin/finance/packages", { token: instructorToken }));
    eq(r.status, 403, "instruktur ditolak");
    ({ r } = await api("GET", "/api/admin/finance/audit", { token: instructorToken }));
    eq(r.status, 403, "audit instruktur ditolak");
  });

  await t("expenses: keterangan tersimpan dan bisa dicari", async () => {
    let { r, d } = await api("POST", "/api/admin/finance/expenses", {
      token: adminToken,
      body: {
        kategori: "Operasional", nominal: 150000, tanggal: TODAY,
        keterangan: "Beli tinta printer", catatan: "Nota toko", status: "submitted"
      }
    });
    eq(r.status, 201, "status");
    eq(d.item.keterangan, "Beli tinta printer", "keterangan");
    eq(d.item.catatan, "Nota toko", "catatan terpisah");

    ({ d } = await api("GET", "/api/admin/finance/expenses?q=tinta", { token: adminToken }));
    eq(d.total, 1, "cari dari keterangan");
    eq(d.items[0].keterangan, "Beli tinta printer", "item");

    const id = d.items[0].id;
    ({ r, d } = await api("PATCH", `/api/admin/finance/expenses/${id}`, {
      token: adminToken, body: { keterangan: "Beli tinta dan kertas" }
    }));
    eq(r.status, 200, "ubah");
    eq(d.item.keterangan, "Beli tinta dan kertas", "keterangan baru");
    eq(d.item.catatan, "Nota toko", "catatan tetap");
  });

  await t("promo: validasi kode, jenis diskon, dan tanggal", async () => {
    let { r, d } = await api("POST", "/api/admin/finance/promos", {
      token: adminToken,
      body: { kode: "ab", nama: "Terlalu pendek", tipe: "persen", nilai: 10, mulai: TODAY, selesai: TODAY }
    });
    eq(r.status, 400, "kode pendek");
    eq(d.details.field, "kode", "field kode");

    ({ r, d } = await api("POST", "/api/admin/finance/promos", {
      token: adminToken,
      body: { kode: "BESAR", nama: "Diskon besar", tipe: "persen", nilai: 150, mulai: TODAY, selesai: TODAY }
    }));
    eq(r.status, 400, "persen lebih dari 100");
    eq(d.details.field, "nilai", "field nilai");

    ({ r, d } = await api("POST", "/api/admin/finance/promos", {
      token: adminToken,
      body: { kode: "MUNDUR", nama: "Tanggal terbalik", tipe: "nominal", nilai: 10000, mulai: TODAY, selesai: "2000-01-01" }
    }));
    eq(r.status, 400, "tanggal terbalik");
    eq(d.details.field, "selesai", "field selesai");
  });

  await t("promo: buat, ubah, dan baca daftar", async () => {
    let { r, d } = await api("POST", "/api/admin/finance/promos", {
      token: adminToken,
      body: {
        kode: "hemat10", nama: "Diskon Pembelajaran 10%", tipe: "persen", nilai: 10,
        jenjang: "", mulai: TODAY, selesai: TODAY, kuota: 2, aktif: true
      }
    });
    eq(r.status, 201, "status");
    eq(d.item.kode, "HEMAT10", "kode huruf besar");
    eq(d.item.aktif, true, "aktif");
    eq(d.item.dipakai, 0, "belum dipakai");
    state.promoId = d.item.id;

    ({ r, d } = await api("POST", "/api/admin/finance/promos", {
      token: adminToken,
      body: { kode: "HEMAT10", nama: "Duplikat", tipe: "persen", nilai: 5, mulai: TODAY, selesai: TODAY }
    }));
    eq(r.status, 409, "duplikat");
    eq(d.code, "CONFLICT", "kode konflik");

    ({ r, d } = await api("PATCH", `/api/admin/finance/promos/${state.promoId}`, {
      token: adminToken, body: { nama: "Diskon 10 persen", kuota: 5, aktif: false }
    }));
    eq(r.status, 200, "ubah");
    eq(d.item.nama, "Diskon 10 persen", "nama baru");
    eq(d.item.kuota, 5, "kuota baru");
    eq(d.item.aktif, false, "nonaktif");

    ({ d } = await api("GET", "/api/admin/finance/promos?q=10", { token: adminToken }));
    eq(d.total, 1, "cari");
    eq(d.items[0].kode, "HEMAT10", "item");
  });

  await t("transaksi: promo tersimpan dan pemakaian terhitung", async () => {
    let { r, d } = await api("POST", "/api/admin/finance/transactions", {
      token: adminToken,
      body: {
        studentId, learningPathId: "SMP|Python Start", price: 650000, discount: 65000,
        method: "Transfer Bank", status: "paid", paidAt: TODAY, promo: "TIDAKADA"
      }
    });
    eq(r.status, 400, "promo tidak dikenal");
    eq(d.details.field, "promo", "field promo");

    ({ r, d } = await api("POST", "/api/admin/finance/transactions", {
      token: adminToken,
      body: {
        studentId, learningPathId: "SMP|Python Start", price: 650000, discount: 65000,
        method: "Transfer Bank", status: "paid", paidAt: TODAY, promo: "hemat10"
      }
    }));
    eq(r.status, 201, "status");
    eq(d.item.promo, "HEMAT10", "promo dinormalisasi");
    state.trxId = d.item.id;

    ({ d } = await api("GET", "/api/admin/finance/promos", { token: adminToken }));
    eq(d.items[0].dipakai, 1, "pemakaian promo");

    ({ r, d } = await api("PATCH", `/api/admin/finance/promos/${state.promoId}`, {
      token: adminToken, body: { kuota: 1 }
    }));
    eq(r.status, 200, "kuota sama dengan pemakaian masih boleh");

    ({ r, d } = await api("PATCH", `/api/admin/finance/promos/${state.promoId}`, {
      token: adminToken, body: { kuota: 1, nilai: 20 }
    }));
    eq(r.status, 200, "ubah nilai");
    eq(d.item.nilai, 20, "nilai baru");

    ({ r, d } = await api("DELETE", `/api/admin/finance/promos/${state.promoId}`, { token: adminToken }));
    eq(r.status, 409, "hapus promo terpakai");
    eq(d.code, "PROMO_DIPAKAI", "kode promo terpakai");
  });

  await t("promo: kuota tidak boleh di bawah pemakaian", async () => {
    // Buat pemakaian kedua supaya batasnya jelas.
    const { r } = await api("POST", "/api/admin/finance/transactions", {
      token: adminToken,
      body: {
        studentId, learningPathId: "SMP|AI & Creative Tech", price: 750000, discount: 75000,
        method: "Tunai", status: "pending", promo: "HEMAT10"
      }
    });
    eq(r.status, 201, "transaksi kedua");

    let { d } = await api("GET", "/api/admin/finance/promos", { token: adminToken });
    eq(d.items[0].dipakai, 2, "dua pemakaian");

    const res = await api("PATCH", `/api/admin/finance/promos/${state.promoId}`, {
      token: adminToken, body: { kuota: 1 }
    });
    eq(res.r.status, 400, "kuota terlalu kecil");
    eq(res.d.details.field, "kuota", "field kuota");
  });

  await t("promo: hapus setelah transaksi dilepas", async () => {
    let { r } = await api("PATCH", `/api/admin/finance/transactions/${state.trxId}`, {
      token: adminToken, body: { promo: "" }
    });
    eq(r.status, 200, "lepas promo transaksi pertama");

    const list = await api("GET", "/api/admin/finance/transactions?status=pending", { token: adminToken });
    const second = list.d.items.find((x) => x.promo === "HEMAT10");
    ok(second, "transaksi kedua ditemukan");
    ({ r } = await api("PATCH", `/api/admin/finance/transactions/${second.id}`, {
      token: adminToken, body: { promo: "" }
    }));
    eq(r.status, 200, "lepas promo transaksi kedua");

    ({ r } = await api("DELETE", `/api/admin/finance/promos/${state.promoId}`, { token: adminToken }));
    eq(r.status, 200, "hapus promo");
    const after = await api("GET", "/api/admin/finance/promos", { token: adminToken });
    eq(after.d.total, 0, "promo terhapus");
  });

  await t("paket: simpan (upsert), ubah, dan kembalikan", async () => {
    let { r, d } = await api("GET", "/api/admin/finance/packages", { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.total, 0, "awal kosong");

    ({ r, d } = await api("POST", "/api/admin/finance/packages", {
      token: adminToken, body: { key: "SMP|Python Start", harga: 700000, aktif: true }
    }));
    eq(r.status, 201, "buat");
    eq(d.item.key, "SMP|Python Start", "key");
    eq(d.item.harga, 700000, "harga");
    state.packageId = db.prepare("SELECT id FROM finance_packages WHERE path_key = ?").get("SMP|Python Start").id;

    ({ r, d } = await api("POST", "/api/admin/finance/packages", {
      token: adminToken, body: { key: "SMP|Python Start", harga: 750000, aktif: false }
    }));
    eq(r.status, 200, "upsert jadi update");
    eq(d.item.harga, 750000, "harga baru");
    eq(d.item.aktif, false, "nonaktif");

    ({ r, d } = await api("POST", "/api/admin/finance/packages", {
      token: adminToken, body: { key: "TanpaPemisah", harga: 100000, aktif: true }
    }));
    eq(r.status, 400, "key tanpa jenjang");
    eq(d.details.field, "key", "field key");

    ({ r } = await api("DELETE", `/api/admin/finance/packages/${state.packageId}`, { token: adminToken }));
    eq(r.status, 200, "hapus");
    const after = await api("GET", "/api/admin/finance/packages", { token: adminToken });
    eq(after.d.total, 0, "kembali kosong");
  });

  await t("audit: mencatat aktivitas finance dan bisa difilter", async () => {
    let { r, d } = await api("GET", "/api/admin/finance/audit", { token: adminToken });
    eq(r.status, 200, "status");
    ok(d.total > 0, "ada entri");
    const modules = new Set(d.items.map((x) => x.module));
    for (const m of ["pengeluaran", "promo", "paket", "siswa"]) {
      ok(modules.has(m), "modul " + m + " tidak muncul");
    }
    const promo = d.items.find((x) => x.module === "promo" && x.action === "create");
    ok(promo, "audit promo create tidak ada");
    eq(promo._src, "server", "sumber server");
    ok(promo.entityId, "target id");

    ({ d } = await api("GET", "/api/admin/finance/audit?module=promo", { token: adminToken }));
    ok(d.items.length > 0, "filter modul");
    ok(d.items.every((x) => x.module === "promo"), "semua promo");

    ({ d } = await api("GET", "/api/admin/finance/audit?action=delete&q=HEMAT10", { token: adminToken }));
    ok(d.items.some((x) => x.action === "delete"), "filter aksi + kata kunci");

    ({ d } = await api("GET", "/api/admin/finance/audit?from=2000-01-01&to=2000-01-02", { token: adminToken }));
    eq(d.total, 0, "filter tanggal");

    ({ d } = await api("GET", "/api/admin/finance/audit?module=tidakada", { token: adminToken }));
    eq(d.code, "VALIDATION_ERROR", "modul tidak dikenal");
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
