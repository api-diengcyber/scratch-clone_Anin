#!/usr/bin/env node
// ============================================================
// Seragamkan versi cache (?v=...) untuk SEMUA file .js / .css lokal di frontend.
//
// Kenapa: kalau satu file dimuat dengan ?v=10 di satu halaman dan ?v=16 di halaman lain,
// browser menyimpan dua salinan berbeda dan halaman bisa berperilaku tidak sinkron.
// Dengan skrip ini semuanya selalu memakai SATU versi yang sama.
//
// Pakai (dari folder proyek, bukan folder backend):
//   npm run bump:version                 → versi otomatis dari waktu sekarang (YYYYMMDDHHmm)
//   npm run bump:version -- 20261019     → versi yang kamu tentukan sendiri
//   npm run bump:version -- --dry        → hanya tampilkan apa yang akan berubah
//
// Jalankan setiap kali ada file .js/.css frontend yang diubah, lalu deploy.
//
// Yang diproses:
//   • HTML: atribut src / href ke file .js / .css lokal (versi ditambahkan kalau belum ada)
//   • JS  : string "/path/file.js?v=N" yang dipakai untuk memuat script secara dinamis
// Tidak disentuh: URL eksternal (CDN), folder backend, archive, node_modules, .git.
// Kode akhir baris (CRLF/LF) dan BOM tiap file dipertahankan apa adanya.
// ============================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "backend", "archive", "scripts"]);

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const given = args.find((a) => !a.startsWith("--"));

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes());
}
const VERSION = given || stamp();
if (!/^[\w.-]+$/.test(VERSION)) {
  console.error("Versi hanya boleh berisi huruf, angka, titik, strip, atau underscore:", VERSION);
  process.exit(1);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name));
    } else if (/\.(html|js)$/i.test(entry.name)) {
      yield path.join(dir, entry.name);
    }
  }
}

const isExternal = (u) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(u) || /^(?:data|mailto|javascript):/i.test(u);

// alamat -> path file di disk ("/x/y.js" dihitung dari ROOT, selain itu dari folder file yang memuatnya)
function resolveLocal(fromFile, url) {
  let clean = url;
  try { clean = decodeURIComponent(url); } catch (e) {}
  return clean.startsWith("/") ? path.join(ROOT, clean) : path.resolve(path.dirname(fromFile), clean);
}

let filesChanged = 0, refsChanged = 0, refsAdded = 0;

for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, "utf8");   // BOM & CRLF ikut terbaca apa adanya
  let text = original;

  // 1) string "…/file.js?v=N" atau "…/file.css?v=N" (HTML maupun JS) → ganti N
  text = text.replace(/(["'])([^"'\s?#]+\.(?:js|css))\?v=[\w.-]*\1/g, (m, q, url) => {
    if (isExternal(url)) return m;
    refsChanged++;
    return q + url + "?v=" + VERSION + q;
  });

  // 2) HTML saja: src/href ke file .js/.css lokal yang BELUM punya ?v= → tambahkan (hanya kalau filenya ada)
  if (/\.html$/i.test(file)) {
    text = text.replace(/\b(src|href)=(["'])([^"'?#]+\.(?:js|css))\2/g, (m, attr, q, url) => {
      if (isExternal(url) || !fs.existsSync(resolveLocal(file, url))) return m;
      refsAdded++;
      return attr + "=" + q + url + "?v=" + VERSION + q;
    });
  }

  if (text !== original) {
    filesChanged++;
    if (!DRY) fs.writeFileSync(file, text, "utf8");
  }
}

console.log((DRY ? "[DRY RUN] " : "") + "Versi: " + VERSION);
console.log("File berubah     :", filesChanged);
console.log("?v= diseragamkan :", refsChanged);
console.log("?v= ditambahkan  :", refsAdded);
