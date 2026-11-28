"use strict";

// ------------------------------------------------------------
// TEST BATCH ENTERPRISE EXPANSION
//
// 1. Filter dan konversi akun trial di Admin (/api/admin/users)
// 2. Export CSV Transaksi Finance & Subscription
// 3. Rate-limiter endpoint publik (Certificates & Invoices)
// 4. Filter materi per track (?track=)
// 5. Manajemen penghapusan notifikasi siswa
// ------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

process.env.NODE_ENV = "test";
process.env.PORT = "3199";
process.env.SESSION_SECRET = "test-secret-expansion-2026";
const TMPDB = path.join(require("os").tmpdir(), `dcc-test-expansion-${Date.now()}.sqlite`);
process.env.DB_PATH = TMPDB;

const results = [];
function t(name, fn) {
  return fn()
    .then(() => results.push(["PASS", name]))
    .catch((err) => {
      results.push(["FAIL", `${name}: ${err.message}`]);
      console.error(`FAIL: ${name}`, err);
    });
}
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: dapat ${JSON.stringify(actual)}, mau ${JSON.stringify(expected)}`);
}
function ok(val, msg) {
  if (!val) throw new Error(`${msg}: bernilai falsy`);
}

async function api(method, urlPath, { token, body } = {}) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(`http://127.0.0.1:3199${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let d = {};
  try { d = JSON.parse(text); } catch (_) { d = text; }
  return { r, d, text };
}

async function main() {
  const db = require("./database");
  const child = spawn("node", ["server.js"], {
    cwd: __dirname,
    env: { ...process.env, DB_PATH: TMPDB, PORT: "3199" },
    stdio: "ignore"
  });

  // Tunggu server up
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:3199/api/health");
      if (res.ok) break;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }

  // Siapkan akun admin
  const auth = require("./auth");
  const adminSaltHash = auth.hashPassword("AdminPass123!");
  const adminId = db.prepare(`
    INSERT INTO users (username, email, password_hash, password_salt, role, status)
    VALUES ('admin_exp', 'admin_exp@diengcyber.com', ?, ?, 'admin', 'active')
  `).run(adminSaltHash.hash, adminSaltHash.salt).lastInsertRowid;
  const adminToken = auth.createSession(adminId);

  // Siapkan siswa trial
  const studentSaltHash = auth.hashPassword("TrialStudent123!");
  const trialId = db.prepare(`
    INSERT INTO users (username, email, password_hash, password_salt, role, status, account_type, trial_track_id, trial_course)
    VALUES ('siswa_trial', 'siswa_trial@diengcyber.com', ?, ?, 'student', 'active', 'trial', 'sd_basic', 'SD Basic')
  `).run(studentSaltHash.hash, studentSaltHash.salt).lastInsertRowid;
  const trialToken = auth.createSession(trialId);

  await t("admin: filter users ?accountType=trial mengembalikan siswa trial", async () => {
    const res = await api("GET", "/api/admin/users?accountType=trial", { token: adminToken });
    eq(res.r.status, 200, "status");
    ok(res.d.users.some(u => u.id === Number(trialId)), "siswa trial ditemukan");
    const found = res.d.users.find(u => u.id === Number(trialId));
    eq(found.accountType, "trial", "accountType terverifikasi");
    eq(found.trialTrackId, "sd_basic", "trialTrackId terverifikasi");
  });

  await t("admin: convert-to-paid meng-upgrade akun trial menjadi paid_subscription", async () => {
    const res = await api("POST", `/api/admin/users/${trialId}/convert-to-paid`, {
      token: adminToken,
      body: { months: 3 }
    });
    eq(res.r.status, 200, "status convert");
    eq(res.d.accountType, "paid_subscription", "accountType berubah");
    const checkUser = db.prepare("SELECT account_type, subscription_months FROM users WHERE id = ?").get(trialId);
    eq(checkUser.account_type, "paid_subscription", "db account_type paid");
    eq(checkUser.subscription_months, 3, "db months 3");
  });

  await t("finance & subscription: export CSV mengembalikan konten berkas valid", async () => {
    const resFin = await api("GET", "/api/admin/finance/export", { token: adminToken });
    eq(resFin.r.status, 200, "finance export 200");
    ok(resFin.r.headers.get("content-type").includes("text/csv"), "content type csv finance");
    ok(resFin.text.includes("Kode Transaksi"), "header csv finance ada");

    const resSub = await api("GET", "/api/admin/subscription/export", { token: adminToken });
    eq(resSub.r.status, 200, "subscription export 200");
    ok(resSub.r.headers.get("content-type").includes("text/csv"), "content type csv subscription");
    ok(resSub.text.includes("Invoice"), "header csv subscription ada");
  });

  await t("materials: filter ?track=sd_basic hanya mengembalikan modul p1-p5", async () => {
    db.prepare("INSERT OR IGNORE INTO modules (grade, module_id) VALUES ('SD', 'p1')").run();
    db.prepare("INSERT OR IGNORE INTO modules (grade, module_id) VALUES ('SD', 'g1')").run();
    db.prepare("INSERT OR REPLACE INTO materials (grade, module_id, lesson_index, path, judul, status) VALUES ('SD', 'p1', 0, '/m/p1.html', 'P1', 'terbit')").run();
    db.prepare("INSERT OR REPLACE INTO materials (grade, module_id, lesson_index, path, judul, status) VALUES ('SD', 'g1', 0, '/m/g1.html', 'G1', 'terbit')").run();

    const res = await api("GET", "/api/materials?grade=SD&track=sd_basic");
    eq(res.r.status, 200, "status materials");
    ok(Array.isArray(res.d.materials), "array materials");
    for (const m of res.d.materials) {
      ok(["p1", "p2", "p3", "p4", "p5"].includes(m.module_id), `modul ${m.module_id} sah untuk sd_basic`);
    }
  });

  await t("notifications: siswa dapat menghapus dan membersihkan notifikasi terbaca", async () => {
    const notifService = require("./student-notifications");
    notifService.notifyStudent(db, trialId, {
      kind: "test.notif",
      title: "Notifikasi Uji 1",
      body: "Isi Uji"
    });
    notifService.notifyStudent(db, trialId, {
      kind: "test.notif",
      title: "Notifikasi Uji 2",
      body: "Isi Uji"
    });

    let listRes = await api("GET", "/api/notifications", { token: trialToken });
    eq(listRes.r.status, 200, "status notif");
    const notifs = listRes.d.notifications;
    ok(notifs.length >= 2, "dua notif ada");

    // Hapus satu notif
    const delRes = await api("DELETE", `/api/notifications/${notifs[0].id}`, { token: trialToken });
    eq(delRes.r.status, 200, "hapus notif 200");

    // Tandai semua dibaca lalu clear-read
    await api("POST", "/api/notifications/read-all", { token: trialToken });
    const clearRes = await api("DELETE", "/api/notifications/clear-read", { token: trialToken });
    eq(clearRes.r.status, 200, "clear read 200");
  });

  await t("payment-settings: admin dapat membaca dan menyimpan konfigurasi pembayaran", async () => {
    const getRes = await api("GET", "/api/admin/finance/payment-settings", { token: adminToken });
    eq(getRes.r.status, 200, "get settings status");
    eq(getRes.d.settings.bankName, "Bank BCA", "default bankName");

    const putRes = await api("PUT", "/api/admin/finance/payment-settings", {
      token: adminToken,
      body: {
        bankName: "Bank Mandiri",
        bankAccount: "13700-112233-4",
        gatewayProvider: "midtrans",
        gatewayEnvironment: "production"
      }
    });
    eq(putRes.r.status, 200, "put settings status");
    eq(putRes.d.settings.bankName, "Bank Mandiri", "updated bankName");

    const pubRes = await api("GET", "/api/payment/methods");
    eq(pubRes.r.status, 200, "public methods status");
    eq(pubRes.d.methods.bank.name, "Bank Mandiri", "public bank name cocok");
    eq(pubRes.d.methods.gateway.provider, "midtrans", "public gateway cocok");
  });

  await t("webhook: simulasi callback payment gateway menyelesaikan invoice & aktivasi langganan", async () => {
    // Siapkan paket langganan di database
    const pkgInfo = db.prepare(`
      INSERT INTO subscription_packages (grade, path_key, path_name, months, price, aktif)
      VALUES ('SD', 'sd_basic', 'SD Basic', 1, 150000, 1)
    `).run();
    const pkgId = Number(pkgInfo.lastInsertRowid);

    // Siapkan invoice pending untuk siswa trial
    const checkoutRes = await api("POST", "/api/subscription/checkout", {
      token: trialToken,
      body: {
        packageId: pkgId,
        method: "QRIS"
      }
    });
    eq(checkoutRes.r.status, 201, "checkout status 201");
    const orderCode = checkoutRes.d.item.code;

    // Panggil webhook simulator dengan payload settlement
    const webhookRes = await api("POST", "/api/subscription/payments/webhook", {
      body: {
        order_id: orderCode,
        transaction_status: "settlement",
        fraud_status: "accept",
        provider: "midtrans"
      }
    });
    eq(webhookRes.r.status, 200, "webhook status 200");
    eq(webhookRes.d.status, "paid", "webhook status paid");

    // Periksa status invoice setelah webhook
    const checkInvoice = db.prepare("SELECT status FROM subscription_payments WHERE code = ?").get(orderCode);
    eq(checkInvoice.status, "paid", "invoice database lunas");
  });

  await t("gallery: siswa dapat mempublikasikan karya Scratch, melihat daftar, detail, dan like", async () => {
    // 1. Siswa upload/publish karya ke galeri
    const pubRes = await api("POST", "/api/gallery/projects", {
      token: trialToken,
      body: {
        title: "Kucing Menari di Pantai",
        category: "Animations",
        description: "Animasi kucing menari di pantai Dieng",
        instructions: "Klik bendera hijau untuk mulai",
        projectData: { targets: [{ name: "Stage" }, { name: "Sprite1" }] }
      }
    });
    eq(pubRes.r.status, 200, "publish project 200");
    const projId = pubRes.d.id;
    ok(projId > 0, "id proyek valid");

    // 2. Publik list galeri
    const listRes = await api("GET", "/api/gallery/projects?category=Animations");
    eq(listRes.r.status, 200, "gallery list 200");
    ok(listRes.d.items.some(p => p.id === projId), "proyek ada di list");

    // 3. Detail proyek
    const detailRes = await api("GET", `/api/gallery/projects/${projId}`);
    eq(detailRes.r.status, 200, "detail project 200");
    eq(detailRes.d.item.title, "Kucing Menari di Pantai", "judul cocok");
    eq(detailRes.d.item.views_count, 1, "view bertambah 1");

    // 4. Like proyek
    const likeRes = await api("POST", `/api/gallery/projects/${projId}/like`, { token: trialToken });
    eq(likeRes.r.status, 200, "like status 200");
    eq(likeRes.d.liked, true, "status liked true");
    eq(likeRes.d.likesCount, 1, "jumlah like 1");
  });

  await t("qris-dynamic: checkout dengan metode QRIS menghasilkan string EMVCo dan URL barcode dinamis", async () => {
    // Siapkan paket jenjang SD
    const pkgRow = db.prepare("SELECT id FROM subscription_packages WHERE grade = 'SD' AND path_key = 'sd_basic'").get();
    const qrisCheckout = await api("POST", "/api/subscription/checkout", {
      token: trialToken,
      body: {
        packageId: pkgRow.id,
        method: "QRIS"
      }
    });
    eq(qrisCheckout.r.status, 201, "checkout qris status 201");
    const inst = qrisCheckout.d.instructions;
    eq(inst.method, "QRIS", "metode instruksi QRIS");
    ok(inst.qrisPayload && inst.qrisPayload.length > 20, "payload QRIS dinamis terbentuk");
    ok(inst.qrImageUrl && inst.qrImageUrl.includes("api.qrserver.com"), "URL gambar barcode QRIS tersedia");
    ok(inst.paymentUrl && inst.paymentUrl.includes("simulator"), "URL pembayaran simulator gateway tersedia");
  });

  const passed = results.filter((r) => r[0] === "PASS").length;
  for (const [status, name] of results) console.log(`${status}  ${name}`);
  console.log(`\n${passed}/${results.length} lolos`);
  child.kill();
  db.close();
  try { fs.unlinkSync(TMPDB); } catch {}
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
