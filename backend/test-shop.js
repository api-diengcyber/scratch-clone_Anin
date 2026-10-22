// backend/test-shop.js — testing toko Koin Belajar (bingkai & gelar).
// Server dijalankan di port & DB temp sendiri.
// Jalankan: node backend/test-shop.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const BACKEND = __dirname;
const PORT = 3103;
const TMPDB = path.join(os.tmpdir(), `dcc-test-shop-${process.pid}.sqlite`);
try { fs.unlinkSync(TMPDB); } catch (e) {}

process.env.DB_PATH = TMPDB;
process.env.PORT = String(PORT);
process.env.NODE_ENV = "test";

// Seed minimal: 2 task @100 poin → total 210 setelah bonus percobaan pertama.
const db = require("./database");
db.prepare("INSERT OR IGNORE INTO modules (grade, module_id) VALUES (?, ?)").run("SMP", "shopmod");
const insertTask = db.prepare(`
  INSERT OR IGNORE INTO tasks (grade, module_id, task_id, task_index, title, steps, is_project, requires_submission, points, editor_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
insertTask.run("SMP", "shopmod", "shopmod:a", 0, "Task A", JSON.stringify(["langkah"]), 0, 0, 100, null);
insertTask.run("SMP", "shopmod", "shopmod:b", 1, "Task B", JSON.stringify(["langkah"]), 0, 0, 100, null);

const child = spawn("node", ["server.js"], {
  cwd: BACKEND,
  env: { ...process.env, DB_PATH: TMPDB, PORT: String(PORT), NODE_ENV: "test" }
});
let out = "";
child.stdout.on("data", (d) => { out += d; });
child.stderr.on("data", (d) => { out += d; });

function waitReady() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (out.includes("Server siap digunakan")) { clearInterval(iv); resolve(); }
      else if (Date.now() - t0 > 90000) { clearInterval(iv); reject(new Error("Server tidak siap. Output:\n" + out)); }
    }, 200);
  });
}

const results = [];
async function t(name, fn) {
  try { await fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + " — " + e.message]); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: dapat ${JSON.stringify(a)}, harap ${JSON.stringify(b)}`); }
async function j(res) {
  const txt = await res.text();
  try { return JSON.parse(txt); }
  catch (e) { throw new Error(`bukan JSON (HTTP ${res.status}): ${txt.slice(0, 120)}`); }
}

const B = `http://localhost:${PORT}`;
const JSON_HDR = { "Content-Type": "application/json" };

function auth(token) { return { ...JSON_HDR, Authorization: "Bearer " + token }; }

async function api(method, url, token, body) {
  const r = await fetch(B + url, {
    method,
    headers: token ? auth(token) : JSON_HDR,
    body: body ? JSON.stringify(body) : undefined
  });
  return { r, d: await j(r) };
}

(async () => {
  await waitReady();

  let token = null;

  await t("register user toko -> 201", async () => {
    const { r, d } = await api("POST", "/api/auth/register", null, { username: "shopper", password: "abcd1234" });
    eq(r.status, 201, "status");
    token = d.token;
  });

  await t("selesaikan 2 task -> 210 koin (2x100 + 2x bonus 5)", async () => {
    let res = await api("POST", "/api/progress/shopper", token, { taskId: "shopmod:a", completed: true });
    eq(res.r.status, 200, "task A");
    eq(res.d.points, 105, "total setelah A");
    res = await api("POST", "/api/progress/shopper", token, { taskId: "shopmod:b", completed: true });
    eq(res.d.points, 210, "total setelah B");
  });

  await t("GET /api/shop -> 15 item + saldo awal", async () => {
    const { r, d } = await api("GET", "/api/shop", token);
    eq(r.status, 200, "status");
    eq(d.items.length, 15, "jumlah item");
    eq(d.items.filter((i) => i.jenis === "bingkai").length, 9, "9 bingkai");
    eq(d.items.filter((i) => i.jenis === "gelar").length, 6, "6 gelar");
    eq(d.earned, 210, "earned");
    eq(d.spent, 0, "spent");
    eq(d.balance, 210, "balance");
    eq(d.owned.length, 0, "belum punya item");
    eq(d.equipped.bingkai, null, "bingkai kosong");
    eq(d.equipped.gelar, null, "gelar kosong");
  });

  await t("GET /api/shop/items -> katalog dengan harga benar", async () => {
    const { r, d } = await api("GET", "/api/shop/items", token);
    eq(r.status, 200, "status");
    const gold = d.items.find((i) => i.id === "bg_gold");
    const master = d.items.find((i) => i.id === "gl_master");
    eq(gold.harga, 50, "harga bg_gold");
    eq(master.harga, 300, "harga gl_master");
  });

  await t("beli bg_gold -> saldo 160, otomatis dipasang", async () => {
    const { r, d } = await api("POST", "/api/shop/buy", token, { itemId: "bg_gold" });
    eq(r.status, 200, "status");
    eq(d.balance, 160, "balance");
    eq(d.spent, 50, "spent");
    eq(d.earned, 210, "earned tidak berubah");
    eq(d.owned.includes("bg_gold"), true, "owned");
    eq(d.equipped.bingkai, "bg_gold", "otomatis dipasang");
  });

  await t("beli bg_gold lagi -> 409 ALREADY_OWNED", async () => {
    const { r, d } = await api("POST", "/api/shop/buy", token, { itemId: "bg_gold" });
    eq(r.status, 409, "status");
    eq(d.code, "ALREADY_OWNED", "code");
  });

  await t("beli item ngawur -> 404 ITEM_NOT_FOUND", async () => {
    const { r, d } = await api("POST", "/api/shop/buy", token, { itemId: "bg_hack" });
    eq(r.status, 404, "status");
    eq(d.code, "ITEM_NOT_FOUND", "code");
  });

  await t("beli gl_star -> saldo 80, gelar terpasang", async () => {
    const { r, d } = await api("POST", "/api/shop/buy", token, { itemId: "gl_star" });
    eq(r.status, 200, "status");
    eq(d.balance, 80, "balance");
    eq(d.spent, 130, "spent");
    eq(d.equipped.gelar, "gl_star", "gelar terpasang");
    eq(d.equipped.bingkai, "bg_gold", "bingkai tetap");
  });

  await t("beli bg_neon -> saldo 5", async () => {
    const { r, d } = await api("POST", "/api/shop/buy", token, { itemId: "bg_neon" });
    eq(r.status, 200, "status");
    eq(d.balance, 5, "balance");
    eq(d.spent, 205, "spent");
    eq(d.owned.length, 3, "3 item dimiliki");
  });

  await t("beli bg_matrix (100) dengan saldo 5 -> 400 INSUFFICIENT_COINS", async () => {
    const { r, d } = await api("POST", "/api/shop/buy", token, { itemId: "bg_matrix" });
    eq(r.status, 400, "status");
    eq(d.code, "INSUFFICIENT_COINS", "code");
  });

  await t("GET /api/points -> total/earned/spent/balance konsisten", async () => {
    const { r, d } = await api("GET", "/api/points/shopper", token);
    eq(r.status, 200, "status");
    eq(d.total, 210, "total");
    eq(d.earned, 210, "earned");
    eq(d.spent, 205, "spent");
    eq(d.balance, 5, "balance");
  });

  await t("lepas lalu pasang bingkai", async () => {
    let res = await api("POST", "/api/shop/unequip", token, { jenis: "bingkai" });
    eq(res.r.status, 200, "status lepas");
    eq(res.d.equipped.bingkai, null, "bingkai lepas");

    res = await api("POST", "/api/shop/equip", token, { itemId: "bg_gold" });
    eq(res.r.status, 200, "status pasang");
    eq(res.d.equipped.bingkai, "bg_gold", "bingkai terpasang");
  });

  await t("pasang item yang belum dimiliki -> 400 NOT_OWNED", async () => {
    const { r, d } = await api("POST", "/api/shop/equip", token, { itemId: "bg_matrix" });
    eq(r.status, 400, "status");
    eq(d.code, "NOT_OWNED", "code");
  });

  await t("lepas dengan jenis ngawur -> 400", async () => {
    const { r, d } = await api("POST", "/api/shop/unequip", token, { jenis: "topi" });
    eq(r.status, 400, "status");
    eq(d.code, "VALIDATION_ERROR", "code");
  });

  await t("profil memuat equippedFrame & equippedTitle", async () => {
    const { r, d } = await api("GET", "/api/profile", token);
    eq(r.status, 200, "status");
    eq(d.profile.equippedFrame, "bg_gold", "frame");
    eq(d.profile.equippedTitle, "gl_star", "title");
  });

  await t("kepemilikan bertahan setelah login ulang", async () => {
    const login = await api("POST", "/api/auth/login", null, { username: "shopper", password: "abcd1234" });
    eq(login.r.status, 200, "login");
    const fresh = login.d.token;
    const { r, d } = await api("GET", "/api/shop", fresh);
    eq(r.status, 200, "status");
    eq(d.owned.length, 3, "3 item tetap dimiliki");
    eq(d.equipped.bingkai, "bg_gold", "bingkai tetap");
    eq(d.equipped.gelar, "gl_star", "gelar tetap");
  });

  await t("uncheck task setelah belanja -> saldo mentok 0 (bukan minus)", async () => {
    const { r } = await api("POST", "/api/progress/shopper", token, { taskId: "shopmod:a", completed: false });
    eq(r.status, 200, "status uncheck");
    const { d } = await api("GET", "/api/shop", token);
    eq(d.earned, 105, "earned turun");
    eq(d.spent, 205, "spent tetap");
    eq(d.balance, 0, "saldo 0, bukan negatif");
  });

  await t("saldo 0 -> beli gl_python ditolak", async () => {
    const { r, d } = await api("POST", "/api/shop/buy", token, { itemId: "gl_python" });
    eq(r.status, 400, "status");
    eq(d.code, "INSUFFICIENT_COINS", "code");
  });

  await t("tanpa token -> 401", async () => {
    let res = await api("GET", "/api/shop", null);
    eq(res.r.status, 401, "GET /api/shop");
    res = await api("POST", "/api/shop/buy", null, { itemId: "bg_gold" });
    eq(res.r.status, 401, "POST /api/shop/buy");
  });

  const fails = results.filter((r) => r[0] === "FAIL");
  console.log("");
  for (const [st, nm] of results) console.log(`${st === "PASS" ? "PASS" : "FAIL"}  ${nm}`);
  console.log(`\n${results.length - fails.length}/${results.length} lolos`);
  child.kill(); db.close();
  try { fs.unlinkSync(TMPDB); } catch (e) {}
  try { fs.unlinkSync(TMPDB + "-shm"); } catch (e) {}
  try { fs.unlinkSync(TMPDB + "-wal"); } catch (e) {}
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error("FATAL:", e.message);
  try { child.kill(); } catch (x) {}
  process.exit(2);
});
