"use strict";
const readline = require("readline");
const crypto = require("crypto");
const db = require("./database");
const auth = require("./auth");

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, (answer) => resolve(answer.trim())));
}
function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error("Jalankan npm run create-admin dari terminal interaktif."));
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(prompt);
    let value = "";
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (chunk) => {
      const s = chunk.toString("utf8");
      if (s === "\u0003") { cleanup(); reject(new Error("Dibatalkan.")); return; }
      if (s === "\r" || s === "\n") { cleanup(); stdout.write("\n"); resolve(value); return; }
      if (s === "\u007f" || s === "\b") { value = value.slice(0, -1); return; }
      if (s >= " " && s !== "\u007f") value += s;
    };
    function cleanup() { stdin.removeListener("data", onData); stdin.setRawMode(Boolean(wasRaw)); }
    stdin.on("data", onData);
  });
}

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("\nBuat akun admin lokal (role admin, tanpa superadmin). Password tidak ditampilkan saat diketik.\n");
    const username = await ask(rl, "Username admin: ");
    const email = (await ask(rl, "Email (boleh kosong): ")).toLowerCase();
    const fullName = await ask(rl, "Nama lengkap (boleh kosong): ");
    rl.close();
    const password = await askHidden("Password awal (min. 8 karakter): ");
    const confirm = await askHidden("Ulangi password: ");
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) throw new Error("Username harus 3-32 karakter (huruf, angka, titik, underscore, atau strip).");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Format email tidak valid.");
    if (password.length < 8 || password.length > 128) throw new Error("Password harus 8-128 karakter.");
    if (password !== confirm) throw new Error("Password tidak sama.");
    if (db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE").get(username)) throw new Error("Username sudah dipakai.");
    if (email && db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").get(email)) throw new Error("Email sudah dipakai.");
    const { salt, hash } = auth.hashPassword(password);
    const id = Number(db.prepare(`INSERT INTO users (username,email,full_name,password_hash,password_salt,role,status,must_change_password)
      VALUES (?,?,?,?,?,'admin','active',1)`).run(username, email || null, fullName || null, hash, salt).lastInsertRowid);
    db.prepare(`INSERT INTO admin_audit (actor_user_id,actor_username,action,target_type,target_id,details)
      VALUES (?,?,?,?,?,?)`).run(id, username, "admin.created.cli", "user", String(id), JSON.stringify({ role: "admin" }));
    console.log(`\nAkun admin berhasil dibuat. users.id=${id}; username=${username}.\nLogin melalui halaman login yang sudah ada. Ganti password setelah masuk.\n`);
    process.exitCode = 0;
  } catch (err) {
    try { rl.close(); } catch {}
    console.error("Gagal membuat admin:", err.message);
    process.exitCode = 1;
  } finally { db.close(); }
})();
