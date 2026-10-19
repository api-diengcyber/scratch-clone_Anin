#!/usr/bin/env node
// ============================================================
// Migrasi sekali jalan:
//   1) Halaman materi: ganti blok <style>...</style> yang identik dengan
//      shared/css/materi.css (atau shared/css/materi-3d.css) menjadi <link>.
//   2) Referensi gambar: Assets/logo.png -> logo.webp, belajar-bermain.jpg -> .webp
//
// Pakai (dari folder proyek):
//   node scripts/migrate-materi-css.js --dry    -> hanya tampilkan yang akan berubah
//   node scripts/migrate-materi-css.js          -> terapkan
//
// Aman dijalankan ulang. Blok <style> yang berbeda dari daftar di bawah TIDAK disentuh
// (dilaporkan sebagai "dilewati"). Kode akhir baris (CRLF/LF) dipertahankan.
// ============================================================
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");
const VERSION = "20261019"; // samakan dengan versi ?v= yang dipakai sekarang
const SKIP_DIRS = new Set(["node_modules", ".git", "backend", "archive", "scripts"]);

// md5 (12 karakter pertama) dari isi <style> dengan whitespace dipadatkan
const KNOWN = {
  cf7dc76411a1: "materi.css",
  c2b411319f0f: "materi.css",
  be6a53b60dc8: "materi.css",
  "71c40023dbcf": "materi.css",
  "572358c27458": "materi-3d.css",
};

const hash = (t) => crypto.createHash("md5").update(t.split(/\s+/).filter(Boolean).join(" ")).digest("hex").slice(0, 12);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(path.join(dir, e.name));
    } else if (/\.html$/i.test(e.name)) yield path.join(dir, e.name);
  }
}

for (const f of ["materi.css", "materi-3d.css"]) {
  if (!fs.existsSync(path.join(ROOT, "shared/css", f))) {
    console.error("shared/css/" + f + " belum ada. Salin dulu filenya.");
    process.exit(1);
  }
}

let cssDone = 0, imgDone = 0, skipped = [];
const STYLE_RE = /([ \t]*)<style[^>]*>([\s\S]*?)<\/style>[ \t]*(\r?\n)?/i;

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const orig = fs.readFileSync(file, "utf8");
  let text = orig;

  // 1) <style> -> <link> (hanya halaman materi)
  if (/(^|\/)materi\//.test(rel)) {
    const m = text.match(STYLE_RE);
    if (m) {
      const target = KNOWN[hash(m[2])];
      if (target) {
        const nl = text.includes("\r\n") ? "\r\n" : "\n";
        const link = m[1] + '<link rel="stylesheet" href="/shared/css/' + target + "?v=" + VERSION + '">' + nl;
        text = text.replace(STYLE_RE, () => link);
        cssDone++;
      } else skipped.push(rel);
    }
  }

  // 2) gambar
  text = text
    .replace(/(["'(])(\/?Assets\/)logo\.png(["')])/g, "$1$2logo.webp$3")
    .replace(/(["'(])(\/?Assets\/)belajar-bermain\.jpg(["')])/g, "$1$2belajar-bermain.webp$3")
    .replace(/(<link rel="icon" type=")image\/png(" href="\/Assets\/logo\.webp")/g, "$1image/webp$2");
  const imgChanged = /Assets\/(logo|belajar-bermain)\.webp/.test(text) && !/Assets\/(logo|belajar-bermain)\.webp/.test(orig);
  if (imgChanged) imgDone++;
  if (text !== orig && !DRY) fs.writeFileSync(file, text, "utf8");
}

console.log((DRY ? "[DRY] " : "") + "halaman materi dialihkan ke CSS bersama:", cssDone);
console.log((DRY ? "[DRY] " : "") + "file dengan referensi gambar diperbarui:", imgDone);
if (skipped.length) {
  console.log("dilewati (blok <style> unik, dibiarkan inline):", skipped.length);
  skipped.forEach((s) => console.log("  - " + s));
}
