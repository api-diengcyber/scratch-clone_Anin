// backend/test-auth.js — testing auth email+password murni DB (tanpa Firebase).
// Server dijalankan di port & DB temp sendiri supaya tidak bentrok dengan test-endpoints.js.
// Jalankan: node backend/test-auth.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const BACKEND = __dirname;
const PORT = 3102;
const TMPDB = path.join(os.tmpdir(), `dcc-test-auth-${process.pid}.sqlite`);
try { fs.unlinkSync(TMPDB); } catch (e) {}

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
const json = { "Content-Type": "application/json" };

async function register(body) {
  const r = await fetch(`${B}/api/auth/register`, { method: "POST", headers: json, body: JSON.stringify(body) });
  return { r, d: await j(r) };
}
async function login(body) {
  const r = await fetch(`${B}/api/auth/login`, { method: "POST", headers: json, body: JSON.stringify(body) });
  return { r, d: await j(r) };
}
async function me(token) {
  const r = await fetch(`${B}/api/auth/me`, { headers: { Authorization: "Bearer " + token } });
  return { r, d: await j(r) };
}

const EMAIL = "Budi.Santoso@Example.com";
const EMAIL_NORM = "budi.santoso@example.com";
const PASS = "rahasia1";
const PASS2 = "barubaru1";

(async () => {
  await waitReady();

  let emailToken = null;

  await t("register email -> 201, username otomatis, email lowercase", async () => {
    const { r, d } = await register({ email: EMAIL, password: PASS });
    eq(r.status, 201, "status");
    eq(d.ok, true, "ok");
    eq(d.username, "budisantoso", "username dari prefix email");
    eq(d.email, EMAIL_NORM, "email dinormalisasi lowercase");
    eq(typeof d.token, "string", "token ada");
    emailToken = d.token;
  });

  await t("register email duplikat beda kapital -> 409 EMAIL_EXISTS", async () => {
    const { r, d } = await register({ email: "BUDI.SANTOSO@example.com", password: PASS });
    eq(r.status, 409, "status");
    eq(d.code, "EMAIL_EXISTS", "code");
  });

  await t("register email tidak valid -> 400", async () => {
    const { r, d } = await register({ email: "bukan-email", password: PASS });
    eq(r.status, 400, "status");
    eq(d.code, "VALIDATION_ERROR", "code");
  });

  await t("login pakai email (case-insensitive) -> 200", async () => {
    const { r, d } = await login({ email: "BUDI.SANTOSO@EXAMPLE.COM", password: PASS });
    eq(r.status, 200, "status");
    eq(d.username, "budisantoso", "username");
    eq(d.email, EMAIL_NORM, "email");
  });

  await t("login pakai username tetap jalan (backward compatible)", async () => {
    const { r, d } = await login({ username: "budisantoso", password: PASS });
    eq(r.status, 200, "status");
    eq(d.username, "budisantoso", "username");
  });

  await t("login password salah -> 401 INVALID_CREDENTIALS", async () => {
    const { r, d } = await login({ email: EMAIL_NORM, password: "salahbanget" });
    eq(r.status, 401, "status");
    eq(d.code, "INVALID_CREDENTIALS", "code");
  });

  await t("login email tidak valid -> 400", async () => {
    const { r, d } = await login({ email: "bukan-email", password: PASS });
    eq(r.status, 400, "status");
    eq(d.code, "VALIDATION_ERROR", "code");
  });

  await t("auth/me mengembalikan email + hasPassword", async () => {
    const { r, d } = await me(emailToken);
    eq(r.status, 200, "status");
    eq(d.username, "budisantoso", "username");
    eq(d.email, EMAIL_NORM, "email");
    eq(d.hasPassword, true, "hasPassword");
  });

  await t("ganti password tanpa password lama -> 401", async () => {
    const r = await fetch(`${B}/api/auth/change-password`, {
      method: "POST",
      headers: { ...json, Authorization: "Bearer " + emailToken },
      body: JSON.stringify({ newPassword: PASS2 })
    });
    const d = await j(r);
    eq(r.status, 401, "status");
    eq(d.code, "INVALID_CREDENTIALS", "code");
  });

  await t("ganti password sukses + sesi perangkat lain dicabut", async () => {
    // Sesi B: login kedua dari "perangkat lain".
    const second = await login({ email: EMAIL_NORM, password: PASS });
    eq(second.r.status, 200, "login sesi kedua");
    const secondToken = second.d.token;

    const r = await fetch(`${B}/api/auth/change-password`, {
      method: "POST",
      headers: { ...json, Authorization: "Bearer " + emailToken },
      body: JSON.stringify({ currentPassword: PASS, newPassword: PASS2 })
    });
    const d = await j(r);
    eq(r.status, 200, "status ganti password");

    const sesiA = await me(emailToken);
    eq(sesiA.r.status, 200, "sesi yang dipakai tetap hidup");

    const sesiB = await me(secondToken);
    eq(sesiB.r.status, 401, "sesi lain dicabut");
  });

  await t("password lama tidak berlaku -> 401", async () => {
    const { r, d } = await login({ email: EMAIL_NORM, password: PASS });
    eq(r.status, 401, "status");
    eq(d.code, "INVALID_CREDENTIALS", "code");
  });

  await t("password baru berlaku -> 200", async () => {
    const { r, d } = await login({ email: EMAIL_NORM, password: PASS2 });
    eq(r.status, 200, "status");
    eq(d.username, "budisantoso", "username");
    emailToken = d.token;
  });

  await t("register user kedua (email) -> 201", async () => {
    const { r, d } = await register({ email: "siti@example.com", password: PASS });
    eq(r.status, 201, "status");
    eq(d.email, "siti@example.com", "email");
  });

  await t("profile: email milik akun lain -> 409 EMAIL_EXISTS", async () => {
    const r = await fetch(`${B}/api/profile`, {
      method: "PUT",
      headers: { ...json, Authorization: "Bearer " + emailToken },
      body: JSON.stringify({ email: "siti@example.com" })
    });
    const d = await j(r);
    eq(r.status, 409, "status");
    eq(d.code, "EMAIL_EXISTS", "code");
  });

  await t("profile: email baru disimpan lowercase", async () => {
    const r = await fetch(`${B}/api/profile`, {
      method: "PUT",
      headers: { ...json, Authorization: "Bearer " + emailToken },
      body: JSON.stringify({ email: "Budi.Baru@Example.com", fullName: "Budi Santoso" })
    });
    const d = await j(r);
    eq(r.status, 200, "status");
    eq(d.profile.email, "budi.baru@example.com", "email lowercase");
    eq(d.profile.fullName, "Budi Santoso", "fullName");
  });

  await t("login pakai email baru -> 200", async () => {
    const { r, d } = await login({ email: "budi.baru@example.com", password: PASS2 });
    eq(r.status, 200, "status");
    eq(d.username, "budisantoso", "username");
  });

  const fails = results.filter((r) => r[0] === "FAIL");
  console.log("");
  for (const [st, nm] of results) console.log(`${st === "PASS" ? "PASS" : "FAIL"}  ${nm}`);
  console.log(`\n${results.length - fails.length}/${results.length} lolos`);
  child.kill();
  try { fs.unlinkSync(TMPDB); } catch (e) {}
  try { fs.unlinkSync(TMPDB + "-shm"); } catch (e) {}
  try { fs.unlinkSync(TMPDB + "-wal"); } catch (e) {}
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error("FATAL:", e.message);
  try { child.kill(); } catch (x) {}
  process.exit(2);
});
