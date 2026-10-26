#!/usr/bin/env node
// ============================================================
// Bangun tools/Scratch/script.bundle.js dari tools/Scratch/src/*.js
//
// Kenapa: script Scratch dulu satu berkas ±330 KB. Sekarang kodenya dipecah per fitur
// di tools/Scratch/src/ (01-state, 02-sound, ... 15-mission). Skrip ini menggabungkannya
// BERURUTAN (sesuai nomor di nama berkas) lalu meminify untuk produksi.
// Berkas tetap satu script klasik biasa, jadi lingkup global, urutan, dan hoisting fungsi
// sama persis seperti sebelum dipecah. index.html memuat script.bundle.js.
//
// Pakai (dari folder proyek, bukan folder backend):
//   npm run build:scratch          → hasil minify untuk produksi
//   npm run build:scratch -- --dev → gabungan TANPA minify (mudah dibaca saat debug)
//   npm run watch:scratch          → bangun ulang (mode --dev) tiap berkas src/ berubah
//
// Edit hanya berkas di src/. script.bundle.js adalah hasil build, jangan diedit langsung.
// Jalankan build (mode produksi) sebelum deploy, lalu: npm run bump:version
// ============================================================
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "..", "tools", "Scratch");
const SRC = path.join(DIR, "src");
const OUT = path.join(DIR, "script.bundle.js");
const args = process.argv.slice(2);
const DEV = args.includes("--dev") || args.includes("--watch");

function build() {
  const files = fs.readdirSync(SRC).filter((f) => /^\d+-.+\.js$/.test(f)).sort();
  if (!files.length) throw new Error("Tidak ada berkas di " + SRC);
  const code = files.map((f) => fs.readFileSync(path.join(SRC, f), "utf8")).join("");
  const banner = "/* HASIL BUILD dari tools/Scratch/src/*.js, jangan diedit langsung. Bangun ulang: npm run build:scratch */\n";
  let out;
  if (DEV) {
    out = banner + code;
  } else {
    const esbuild = require("esbuild");
    // Script klasik: nama global tingkat atas tidak diubah, jadi aman dipakai halaman / script lain.
    out = banner + esbuild.transformSync(code, { minify: true, charset: "utf8", legalComments: "none" }).code;
  }
  fs.writeFileSync(OUT, out);
  const kb = (n) => (n / 1024).toFixed(1) + " KB";
  console.log("✔ " + files.length + " berkas → " + path.relative(process.cwd(), OUT) + " (" + (DEV ? "dev" : "minify") + ", " + kb(Buffer.byteLength(code)) + " → " + kb(Buffer.byteLength(out)) + ")");
}

build();
if (args.includes("--watch")) {
  console.log("Memantau " + path.relative(process.cwd(), SRC) + " …");
  let t = null;
  fs.watch(SRC, () => { clearTimeout(t); t = setTimeout(() => { try { build(); } catch (e) { console.error(e.message); } }, 150); });
}
