// Tes endpoint hadiah toko (Lencana & Hadiah) dan integrasi katalog /api/shop.
// Jalankan: node test-rewards.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 3117;
const TMPDB = path.join(os.tmpdir(), `dcc-test-rewards-${process.pid}.sqlite`);
const PLUGIN_DIR = path.join(os.tmpdir(), `dcc-test-rewards-plugins-${process.pid}`);

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
db.pragma("busy_timeout = 5000");

function addUser(username, role, { grades = null } = {}) {
  const info = db.prepare(`INSERT INTO users (username, email, role, allowed_grades, status, must_change_password)
    VALUES (?, ?, ?, ?, 'active', 0)`).run(
    username,
    `${username}@example.com`,
    role,
    grades === null ? null : JSON.stringify(grades)
  );
  return Number(info.lastInsertRowid);
}

const adminId = addUser("rew-admin", "admin");
const instructorId = addUser("rew-instruktur", "instruktur", { grades: ["SD", "SMP", "SMK"] });
const studentId = addUser("rew-siswa", "student", { grades: ["SMP"] });

const adminToken = auth.createSession(adminId);
const instructorToken = auth.createSession(instructorId);
const studentToken = auth.createSession(studentId);

db.prepare(`INSERT INTO admin_role_permissions (role, permissions, updated_at)
  VALUES ('instruktur', ?, CURRENT_TIMESTAMP)
  ON CONFLICT(role) DO UPDATE SET permissions = excluded.permissions, updated_at = CURRENT_TIMESTAMP`)
  .run(JSON.stringify(["tugas.kelola"]));

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

  let frame = null;
  let title = null;

  await t("hadiah: tanpa token -> 401", async () => {
    const { r, d } = await api("GET", "/api/admin/rewards");
    eq(r.status, 401, "status");
    eq(d.code, "UNAUTHORIZED", "code");
  });

  await t("hadiah: instruktur tanpa badge.kelola ditolak", async () => {
    const { r, d } = await api("GET", "/api/admin/rewards", { token: instructorToken });
    eq(r.status, 403, "status");
    eq(d.code, "PERMISSION_DENIED", "code");
  });

  await t("hadiah: murid ditolak", async () => {
    const { r } = await api("GET", "/api/admin/rewards", { token: studentToken });
    eq(r.status, 403, "status");
  });

  await t("hadiah: katalog awal berisi 15 item", async () => {
    const { r, d } = await api("GET", "/api/admin/rewards", { token: adminToken });
    eq(r.status, 200, "status");
    eq(d.total, 15, "total");
    eq(d.items.length, 15, "jumlah");
    const gold = d.items.find((x) => x.id === "bg_gold");
    ok(gold, "bg_gold ada");
    eq([gold.jenis, gold.nama, gold.harga], ["bingkai", "Bingkai Mahkota Emas", 50], "isi bg_gold");
    eq(gold.frameClass, "frame-gold", "frameClass");
    ok(Array.isArray(gold.orn) && gold.orn.length === 1, "orn");
    const star = d.items.find((x) => x.id === "gl_star");
    eq([star.jenis, star.harga], ["gelar", 80], "gl_star");
    ok(d.items[0].jenis === "bingkai", "bingkai lebih dulu");
  });

  await t("hadiah: bingkai baru dibuat dan muncul di toko", async () => {
    const { r, d } = await api("POST", "/api/admin/rewards", {
      token: adminToken,
      body: {
        jenis: "bingkai",
        nama: "Bingkai Naga Api",
        emoji: "🐉",
        harga: 123,
        frameClass: "frame-fire",
        desc: "Naga api mengelilingi avatar.",
        orn: [{ e: "🔥", p: "top", a: "peek", s: 1.4 }]
      }
    });
    eq(r.status, 201, "status");
    frame = d.item;
    ok(frame.id.startsWith("bg_"), "id bingkai: " + frame.id);
    eq(frame.nama, "Bingkai Naga Api", "nama");
    eq(frame.harga, 123, "harga");
    eq(frame.frameClass, "frame-fire", "frameClass");
    eq(frame.orn, [{ e: "🔥", p: "top", a: "peek", s: 1.4 }], "orn tervalidasi");

    const toko = await api("GET", "/api/shop/items", { token: studentToken });
    eq(toko.r.status, 200, "status toko");
    const item = toko.d.items.find((x) => x.id === frame.id);
    ok(item, "item baru tampil di toko");
    eq(item.harga, 123, "harga toko");
  });

  await t("hadiah: gelar baru dibuat tanpa atribut bingkai", async () => {
    const { r, d } = await api("POST", "/api/admin/rewards", {
      token: adminToken,
      body: { jenis: "gelar", nama: "Naga Bijak", emoji: "🐲", harga: 0 }
    });
    eq(r.status, 201, "status");
    title = d.item;
    ok(title.id.startsWith("gl_"), "id gelar: " + title.id);
    eq(title.harga, 0, "harga");
    ok(!("frameClass" in title) && !("orn" in title), "tanpa atribut bingkai");
  });

  await t("hadiah: validasi input ditolak dengan field yang jelas", async () => {
    const cases = [
      [{ jenis: "bingkai", emoji: "🔥", harga: 10 }, "nama"],
      [{ jenis: "topi", nama: "X", emoji: "🔥", harga: 10 }, "jenis"],
      [{ jenis: "gelar", nama: "X", emoji: "🔥", harga: -1 }, "harga"],
      [{ jenis: "gelar", nama: "X", emoji: "🔥", harga: 1.5 }, "harga"],
      [{ jenis: "gelar", nama: "X", emoji: "", harga: 10 }, "emoji"],
      [{ jenis: "gelar", nama: "X", emoji: "🔥🔥🔥🔥🔥🔥🔥🔥🔥", harga: 10 }, "emoji"],
      [{ jenis: "bingkai", nama: "X", emoji: "🔥", harga: 10, frameClass: "emas" }, "frameClass"],
      [{ jenis: "bingkai", nama: "X", emoji: "🔥", harga: 10, desc: "x".repeat(161) }, "desc"],
      [{ jenis: "bingkai", nama: "X", emoji: "🔥", harga: 10, orn: [{ e: "🔥", p: "tengah", s: 1 }] }, "orn"],
      [{ jenis: "bingkai", nama: "X", emoji: "🔥", harga: 10, orn: [{ e: "🔥", s: 9 }] }, "orn"]
    ];
    for (const [body, field] of cases) {
      const { r, d } = await api("POST", "/api/admin/rewards", { token: adminToken, body });
      eq(r.status, 400, `status ${field}`);
      eq(d.details && d.details.field, field, `field ${field}`);
    }
  });

  await t("hadiah: id manual duplikat ditolak", async () => {
    const { r, d } = await api("POST", "/api/admin/rewards", {
      token: adminToken,
      body: { id: "bg_gold", jenis: "bingkai", nama: "Duplikat", emoji: "🔥", harga: 10 }
    });
    eq(r.status, 400, "status");
    eq(d.details && d.details.field, "id", "field");
  });

  await t("hadiah: ubah harga langsung dipakai katalog toko", async () => {
    const { r, d } = await api("PATCH", `/api/admin/rewards/${frame.id}`, {
      token: adminToken,
      body: { harga: 999, nama: "Bingkai Naga Api Baru" }
    });
    eq(r.status, 200, "status");
    eq(d.item.harga, 999, "harga baru");
    eq(d.item.nama, "Bingkai Naga Api Baru", "nama baru");
    eq(d.item.emoji, "🐉", "field lain dipertahankan");

    const toko = await api("GET", "/api/shop/items", { token: studentToken });
    const item = toko.d.items.find((x) => x.id === frame.id);
    eq(item.harga, 999, "harga toko ikut berubah");
    frame = d.item;
  });

  await t("hadiah: jenis tidak bisa diubah", async () => {
    const { r, d } = await api("PATCH", `/api/admin/rewards/${frame.id}`, {
      token: adminToken,
      body: { jenis: "gelar" }
    });
    eq(r.status, 400, "status");
    eq(d.details && d.details.field, "jenis", "field");
  });

  await t("hadiah: item baru bisa dibeli siswa dengan harga katalog", async () => {
    const cheap = await api("POST", "/api/admin/rewards", {
      token: adminToken,
      body: { jenis: "gelar", nama: "Gelar Hadiah Gratis", emoji: "🎁", harga: 0 }
    });
    eq(cheap.r.status, 201, "buat gelar gratis");
    const { r, d } = await api("POST", "/api/shop/buy", {
      token: studentToken,
      body: { itemId: cheap.d.item.id }
    });
    eq(r.status, 200, "beli");
    ok(d.owned.includes(cheap.d.item.id), "dimiliki");
    eq(d.equipped.gelar, cheap.d.item.id, "otomatis dipasang");
    title = cheap.d.item;
  });

  await t("hadiah: hapus item melepas dari avatar dan menolak pembelian", async () => {
    let res = await api("DELETE", `/api/admin/rewards/${title.id}`, { token: adminToken });
    eq(res.r.status, 200, "hapus");
    eq(res.d.id, title.id, "id");

    const toko = await api("GET", "/api/shop/items", { token: studentToken });
    ok(!toko.d.items.some((x) => x.id === title.id), "hilang dari katalog");

    const equip = await api("POST", "/api/shop/equip", { token: studentToken, body: { itemId: title.id } });
    eq(equip.r.status, 404, "equip item terhapus");
    eq(equip.d.code, "ITEM_NOT_FOUND", "code");

    const row = db.prepare("SELECT equipped_title FROM users WHERE id = ?").get(studentId);
    eq(row.equipped_title, null, "gelar dilepas dari avatar");
  });

  await t("hadiah: hapus item yang tidak ada -> 404", async () => {
    const { r, d } = await api("DELETE", "/api/admin/rewards/tidak_ada", { token: adminToken });
    eq(r.status, 404, "status");
    eq(d.code, "NOT_FOUND", "code");
  });

  await t("hadiah: instruktur dengan badge.kelola boleh mengelola", async () => {
    db.prepare(`INSERT INTO admin_role_permissions (role, permissions, updated_at)
      VALUES ('instruktur', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(role) DO UPDATE SET permissions = excluded.permissions, updated_at = CURRENT_TIMESTAMP`)
      .run(JSON.stringify(["badge.kelola"]));

    const list = await api("GET", "/api/admin/rewards", { token: instructorToken });
    eq(list.r.status, 200, "list");
    const created = await api("POST", "/api/admin/rewards", {
      token: instructorToken,
      body: { jenis: "gelar", nama: "Gelar Instruktur", emoji: "🎓", harga: 25 }
    });
    eq(created.r.status, 201, "create");
    const del = await api("DELETE", `/api/admin/rewards/${created.d.item.id}`, { token: instructorToken });
    eq(del.r.status, 200, "delete");
  });

  await t("hadiah: audit mencatat create/update/delete", async () => {
    const actions = db.prepare("SELECT action FROM admin_audit WHERE target_type = 'reward' ORDER BY id ASC")
      .all().map((row) => row.action);
    ok(actions.includes("reward.create"), "create");
    ok(actions.includes("reward.update"), "update");
    ok(actions.includes("reward.delete"), "delete");
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
