"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const MAX_ZIP_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 500;
const MAX_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".html", ".css", ".js", ".json", ".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function bad(message, code = "INVALID_PLUGIN_ZIP") {
  const err = new Error(message); err.code = code; throw err;
}
function safeEntryName(name) {
  if (!name || name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) return false;
  const parts = name.split("/");
  if (parts.some((p) => p === ".." || p === "." || p === "")) return false;
  return true;
}
function extractZipSafely(buffer, destination) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > MAX_ZIP_BYTES) bad("ZIP kosong atau melampaui batas 20 MB.");
  const minEocd = Math.max(0, buffer.length - 65557);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= minEocd; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) bad("Struktur ZIP tidak valid (EOCD tidak ditemukan).");
  const disk = buffer.readUInt16LE(eocd + 4);
  const cdDisk = buffer.readUInt16LE(eocd + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (disk !== 0 || cdDisk !== 0 || entriesOnDisk !== totalEntries || totalEntries === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) bad("ZIP multi-disk/ZIP64 belum didukung; buat ZIP standar.");
  if (totalEntries < 1 || totalEntries > MAX_FILES) bad(`Jumlah file ZIP harus 1-${MAX_FILES}.`);
  if (cdOffset + cdSize > eocd || cdOffset < 0) bad("Directory ZIP di luar batas file.");
  fs.mkdirSync(destination, { recursive: true });
  const seen = new Set();
  const contentMap = new Map();
  let pos = cdOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < totalEntries; index++) {
    if (pos + 46 > eocd || buffer.readUInt32LE(pos) !== 0x02014b50) bad("Central directory ZIP rusak.");
    const madeBy = buffer.readUInt16LE(pos + 4);
    const flags = buffer.readUInt16LE(pos + 8);
    const method = buffer.readUInt16LE(pos + 10);
    const expectedCrc = buffer.readUInt32LE(pos + 16);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const uncompressedSize = buffer.readUInt32LE(pos + 24);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const externalAttrs = buffer.readUInt32LE(pos + 38);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const next = pos + 46 + nameLen + extraLen + commentLen;
    if (next > eocd) bad("Central directory ZIP terpotong.");
    const nameBytes = buffer.subarray(pos + 46, pos + 46 + nameLen);
    const name = nameBytes.toString((flags & 0x800) ? "utf8" : "latin1");
    pos = next;
    if ((flags & 1) !== 0) bad(`File terenkripsi tidak diperbolehkan: ${name}`);
    if (flags & 0x40) bad(`ZIP strong-encryption tidak diperbolehkan: ${name}`);
    if (method !== 0 && method !== 8) bad(`Metode kompresi tidak didukung: ${name}`);
    const normalizedName = name.endsWith("/") ? name.slice(0, -1) : name;
    if (!safeEntryName(normalizedName)) bad(`Path ZIP tidak aman: ${name}`);
    if (seen.has(name.toLowerCase())) bad(`Nama/path file duplikat: ${name}`);
    seen.add(name.toLowerCase());
    const isDir = name.endsWith("/");
    const unixPlatform = (madeBy >>> 8) === 3;
    const unixMode = externalAttrs >>> 16;
    const fileType = unixMode & 0xf000;
    if (unixPlatform && fileType && fileType !== 0x8000 && fileType !== 0x4000) bad(`Symlink atau special file tidak diperbolehkan: ${name}`);
    if (isDir) continue;
    const ext = path.posix.extname(name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) bad(`Ekstensi file tidak diizinkan (${ext || "tanpa ekstensi"}): ${name}`);
    if (uncompressedSize > MAX_UNCOMPRESSED_BYTES || totalUncompressed + uncompressedSize > MAX_UNCOMPRESSED_BYTES) bad("Total ukuran hasil ekstrak melewati 30 MB.");
    totalUncompressed += uncompressedSize;
    if (compressedSize === 0 && uncompressedSize > 0) bad(`Ukuran ZIP mencurigakan: ${name}`);
    if (compressedSize > 0 && uncompressedSize / compressedSize > 250) bad(`Rasio kompresi terlalu tinggi (potensi ZIP bomb): ${name}`);
    if (localOffset + 30 > cdOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) bad(`Local header rusak: ${name}`);
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const localName = buffer.subarray(localOffset + 30, localOffset + 30 + localNameLen).toString((flags & 0x800) ? "utf8" : "latin1");
    if (localName !== name) bad(`Nama file pada header ZIP tidak cocok: ${name}`);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataStart < localOffset || dataEnd > cdOffset || dataEnd > buffer.length) bad(`Data file di luar batas ZIP: ${name}`);
    const compressed = buffer.subarray(dataStart, dataEnd);
    let content;
    try {
      content = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_BYTES });
    } catch { bad(`Gagal mengekstrak file: ${name}`); }
    if (content.length !== uncompressedSize || crc32(content) !== expectedCrc) bad(`Checksum/ukuran file tidak cocok: ${name}`);
    const target = path.resolve(destination, ...name.split("/"));
    const root = path.resolve(destination) + path.sep;
    if (!target.startsWith(root)) bad(`Path traversal terdeteksi: ${name}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, { flag: "wx", mode: 0o640 });
    contentMap.set(name, content);
  }
  if (pos !== cdOffset + cdSize) bad("Ukuran central directory ZIP tidak konsisten.");
  const rawManifest = contentMap.get("manifest.json");
  if (!rawManifest) bad("manifest.json wajib berada di root ZIP.");
  let manifest;
  try { manifest = JSON.parse(rawManifest.toString("utf8")); } catch { bad("manifest.json bukan JSON valid."); }
  validateManifest(manifest, contentMap);
  const findings = scanStatic(contentMap);
  return { manifest, entries: [...contentMap.keys()], totalUncompressed, findings };
}
function validateManifest(m, files) {
  if (!m || typeof m !== "object" || Array.isArray(m)) bad("manifest.json harus berupa object.");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(String(m.id || ""))) bad("manifest.id wajib lowercase dengan angka/strip, panjang 2-63.");
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(String(m.version || ""))) bad("manifest.version harus format semver, contoh 1.0.0.");
  if (m.sdk !== 1) bad("manifest.sdk harus bernilai 1.");
  if (typeof m.name !== "string" || !m.name.trim() || m.name.length > 100) bad("manifest.name wajib diisi (maksimal 100 karakter).");
  if (typeof m.entry !== "string" || !safeEntryName(m.entry) || !m.entry.toLowerCase().endsWith(".html") || !files.has(m.entry)) bad("manifest.entry harus menunjuk file HTML yang ada di ZIP.");
  if (!m.category || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(String(m.category.id || "")) || typeof m.category.name !== "string" || !m.category.name.trim()) bad("manifest.category.id/name tidak valid.");
  if (!Array.isArray(m.grades) || m.grades.length < 1 || m.grades.some(g => !["SD", "SMP", "SMK"].includes(g))) bad("manifest.grades harus array berisi SD/SMP/SMK.");
  if (!Array.isArray(m.permissions) || m.permissions.some(p => !["progress:complete"].includes(p))) bad("manifest.permissions hanya boleh berisi progress:complete pada SDK 1.");
  if (!m.network) m.network = { allow: [] };
  if (!Array.isArray(m.network.allow)) bad("manifest.network.allow harus array domain; gunakan [] jika tidak perlu jaringan.");
  for (const domain of m.network.allow) {
    if (typeof domain !== "string" || domain.length > 253 || domain.includes("*") || domain.includes("/") || domain.includes(":") || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain.toLowerCase())) bad(`Domain network.allow tidak valid: ${String(domain)}`);
  }
}
function scanStatic(files) {
  const findings = [];
  const tests = [
    ["dynamic_code", /\beval\s*\(|\bnew\s+Function\s*\(/i, "Kode dinamis eval/new Function perlu ditinjau."],
    ["storage_or_parent", /document\.cookie|localStorage|sessionStorage|window\.(?:top|parent)/i, "Akses cookie/storage/window parent/top perlu ditinjau."],
    ["network_api", /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/i, "API jaringan terdeteksi; default plugin tidak boleh mengakses jaringan luar."],
    ["external_url", /https?:\/\//i, "URL absolut terdeteksi pada source; cek domain/link saat review."],
    ["navigation", /window\.open|location\.(?:href|assign|replace)|target\s*=\s*["']_blank["']/i, "Navigasi/popup terdeteksi dan perlu ditinjau."],
    ["string_timer", /setTimeout\s*\(\s*["']|setInterval\s*\(\s*["']/i, "Timer dengan string terdeteksi; perlu ditinjau."]
  ];
  for (const [name, content] of files) {
    if (!/\.(html|css|js|json)$/i.test(name)) continue;
    const src = content.toString("utf8");
    for (const [code, rx, message] of tests) if (rx.test(src)) findings.push({ severity: "warning", code, file: name, message });
    if (/\.css$/i.test(name) && /url\s*\(\s*["']?https?:/i.test(src)) findings.push({ severity: "warning", code: "external_css_asset", file: name, message: "CSS memuat aset eksternal." });
  }
  return { scanner: "basic-static-v1", findings, note: "Ini filter awal saja; bukan jaminan aman. Manual review tetap wajib. Dynamic scan, OCR, QR, reputasi URL, dan dependency CVE ada di M6." };
}
function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
module.exports = { extractZipSafely, sha256, MAX_ZIP_BYTES, MAX_UNCOMPRESSED_BYTES };
