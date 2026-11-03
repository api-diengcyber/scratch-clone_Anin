"use strict";

// ------------------------------------------------------------
// KATALOG LENCANA JALUR BELAJAR
//
// Lencana di sisi siswa didefinisikan di file data jalur belajar:
//   users/kurikulum/data/jalur-data.js        (SD,  window.LP_DATA)
//   users/kurikulum/data/jalur-data-smp.js    (SMP, window.LP_SMP)
//   users/kurikulum/data/jalur-data-smak.js   (SMA/SMK, window.LP_SMAK)
//
// Aturan yang sama dengan halaman Laporan siswa: lencana sebuah jalur
// terbuka kalau SEMUA task di jalur itu selesai, termasuk Project Akhir /
// Capstone. Modul ini membaca file yang sama supaya admin selalu melihat
// lencana yang persis sama dengan yang dilihat siswa (tanpa salinan data).
//
// Sertifikat memakai kriteria yang sama: siswa yang berhak mendapat
// lencana sebuah jalur juga berhak mendapat sertifikat jalur itu.
// ------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DATA_DIRS = [
  path.join(__dirname, "..", "users", "kurikulum", "data"),
  path.join(__dirname, "..", "kurikulum", "data")
];
const FILES = {
  SD: "jalur-data.js",
  SMP: "jalur-data-smp.js",
  SMK: "jalur-data-smak.js"
};

function dataDir() {
  return DATA_DIRS.find((dir) => fs.existsSync(path.join(dir, FILES.SD))) || null;
}

function loadWindow(dir, file) {
  const source = fs.readFileSync(path.join(dir, file), "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: file, timeout: 2000 });
  return sandbox.window;
}

// Pisahkan emoji di depan nama lencana: "🐍 Lencana Python" -> { emoji, label }.
function splitEmoji(text, fallbackEmoji) {
  const raw = String(text || "").trim();
  const m = raw.match(/^((?:\p{Extended_Pictographic}|\u200d|\ufe0f)+)\s*(.*)$/u);
  if (m) return { emoji: m[1], label: m[2] || raw };
  return { emoji: fallbackEmoji || "🏅", label: raw };
}

function buildCatalog(dir) {
  const items = [];

  // ---------- SD: tahap -> pembelajaran -> tasks + project ----------
  const sd = loadWindow(dir, FILES.SD).LP_DATA;
  for (const tahap of (sd && sd.tahap) || []) {
    for (const modul of tahap.pembelajaran || []) {
      const taskIds = (modul.tasks || []).map((_, i) => `${modul.id}-t${i + 1}`);
      if (modul.project) taskIds.push(`${modul.id}-project`);
      const lencana = (modul.project && modul.project.lencana) || `🏅 Lencana ${modul.judul}`;
      const { emoji, label } = splitEmoji(lencana, "🏅");
      items.push({
        key: `SD:${modul.id}`,
        grade: "SD",
        jalurId: String(modul.id),
        jalur: String(modul.judul || modul.id),
        tahap: String(tahap.nama || ""),
        warna: modul.warna || "#0ea5e9",
        emoji,
        label,
        syarat: modul.project ? "Semua task + Project Akhir" : "Semua task",
        taskIds
      });
    }
  }

  // ---------- SMP & SMA/SMK: jalur -> nodes -> tasks ("modul:nomor") ----------
  const tracks = [
    ["SMP", loadWindow(dir, FILES.SMP).LP_SMP],
    ["SMK", loadWindow(dir, FILES.SMK).LP_SMAK]
  ];
  for (const [grade, list] of tracks) {
    for (const tr of list || []) {
      const taskIds = [];
      for (const node of tr.nodes || []) {
        (node.tasks || []).forEach((_, i) => taskIds.push(`${node.id}:${i}`));
      }
      const { emoji, label } = splitEmoji(tr.lencana || `🏅 Lencana ${tr.nama}`, "🏅");
      items.push({
        key: `${grade}:${tr.id}`,
        grade,
        jalurId: String(tr.id),
        jalur: String(tr.nama || tr.id),
        tahap: "",
        warna: tr.c || "#0ea5e9",
        emoji,
        label,
        syarat: "Semua task + Capstone",
        taskIds
      });
    }
  }

  return items.filter((item) => item.taskIds.length > 0);
}

let cache = null;
function mtimeSignature(dir) {
  return Object.values(FILES)
    .map((f) => { try { return fs.statSync(path.join(dir, f)).mtimeMs; } catch (_) { return 0; } })
    .join("|");
}

// Katalog di-cache selama file data tidak berubah.
function getCatalog() {
  const dir = dataDir();
  if (!dir) {
    const err = new Error("File data jalur belajar (users/kurikulum/data) tidak ditemukan.");
    err.code = "LENCANA_DATA_MISSING";
    throw err;
  }
  const sig = mtimeSignature(dir);
  if (cache && cache.dir === dir && cache.sig === sig) return cache.items;
  const items = buildCatalog(dir);
  cache = { dir, sig, items };
  return items;
}

function findItem(key) {
  return getCatalog().find((item) => item.key === key) || null;
}

// Siswa yang SELURUH task jalurnya sudah selesai.
function eligibleStudents(db, item) {
  const ids = item.taskIds;
  const marks = ids.map(() => "?").join(",");
  return db.prepare(`
    SELECT u.id AS userId, u.username AS username, u.full_name AS fullName,
           COUNT(*) AS done, MAX(p.completed_at) AS completedAt
    FROM progress p
    JOIN users u ON u.username = p.username
    WHERE p.completed = 1 AND u.role = 'student' AND p.task_id IN (${marks})
    GROUP BY u.id
    HAVING COUNT(*) = ?
    ORDER BY completedAt DESC, u.username ASC
  `).all(...ids, ids.length).map((row) => ({
    userId: Number(row.userId),
    username: row.username,
    fullName: row.fullName || "",
    completedAt: row.completedAt || null,
    certificateNo: certificateNo(item, row)
  }));
}

// Nomor sertifikat deterministik (tanpa tabel baru): sama untuk siswa & jalur yang sama.
function certificateNo(item, student) {
  const year = String(student.completedAt || new Date().toISOString()).slice(0, 4);
  const jalur = String(item.jalurId).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `DCC/${year}/${item.grade}/${jalur}/${String(student.userId).padStart(4, "0")}`;
}

function publicItem(item, awarded) {
  const { taskIds, ...rest } = item;
  return { ...rest, totalTasks: taskIds.length, awarded: awarded === undefined ? 0 : awarded };
}

module.exports = { getCatalog, findItem, eligibleStudents, certificateNo, publicItem, splitEmoji };
