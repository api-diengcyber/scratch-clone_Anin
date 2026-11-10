const fs = require("fs");
const path = require("path");
const vm = require("vm");

const db = require("./database");

// ============================================================
// SINKRONISASI MATERI — SD, SMP, SMK
// ------------------------------------------------------------
// Tabel `materials` adalah sumber data materi per task untuk portal
// murid dan ringkasan Admin. Script ini mengisi baris yang belum ada
// dari data kurikulum statis (users/kurikulum/data).
//
// Penting:
//   • INSERT OR IGNORE  -> edit Admin (path/status/judul) tidak ditimpa.
//   • judul hanya diisi kalau masih kosong.
//   • tidak menghapus baris yang sudah ada.
// Dengan begitu script aman dijalankan ulang (idempotent).
// ============================================================

function loadWindow(filename) {
    const filePath = path.join(__dirname, "..", "users", "kurikulum", "data", filename);
    const source = fs.readFileSync(filePath, "utf8");
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename });
    return sandbox.window;
}

// ------------------------------------------------------------
// SD — jalur-data.js
// Semua task SD punya halaman materi. Kalau halamanMateri tidak
// diisi, mesin frontend memakai halaman materi generik:
//   /SD/materi/sd.html?task=<id>
// Logika ini disalin persis dari kurikulum/core/jalur-belajar.js.
// ------------------------------------------------------------
const sdWindow = loadWindow("jalur-data.js");
if (!sdWindow.LP_DATA || !Array.isArray(sdWindow.LP_DATA.tahap)) {
    throw new Error("Data kurikulum SD (LP_DATA) tidak ditemukan di jalur-data.js");
}

// ------------------------------------------------------------
// SMP & SMK — halamanMateri sudah dihitung di dalam file datanya
// (MATERI[id:index] || MATERI[id] || "").
// ------------------------------------------------------------
const smpWindow = loadWindow("jalur-data-smp.js");
const smkWindow = loadWindow("jalur-data-smak.js");

if (!Array.isArray(smpWindow.LP_SMP)) {
    throw new Error("LP_SMP tidak ditemukan di jalur-data-smp.js");
}
if (!Array.isArray(smkWindow.LP_SMAK)) {
    throw new Error("LP_SMAK tidak ditemukan di jalur-data-smak.js");
}

// ============================================================
// KUMPULKAN BARIS
// ============================================================

const rows = [];
const modules = new Map(); // "GRADE|moduleId" -> [grade, moduleId]

function addModule(grade, moduleId) {
    modules.set(`${grade}|${moduleId}`, [grade, moduleId]);
}

function addRow(grade, moduleId, lessonIndex, task) {
    const materialPath = task && task.halamanMateri;
    if (!materialPath) return;

    const title = task.title || task.judul || "";
    addModule(grade, moduleId);
    rows.push([grade, moduleId, lessonIndex, materialPath, String(title).slice(0, 200)]);
}

// ---------- SD ----------
for (const tahap of sdWindow.LP_DATA.tahap) {
    for (const pembelajaran of tahap.pembelajaran || []) {
        addModule("SD", pembelajaran.id);
        (pembelajaran.tasks || []).forEach((task, index) => {
            if (!task.halamanMateri) {
                task.halamanMateri = "/SD/materi/sd.html?task=" + pembelajaran.id + "-t" + (index + 1);
            }
            addRow("SD", pembelajaran.id, index, task);
        });
    }
}

// ---------- SMP ----------
for (const track of smpWindow.LP_SMP) {
    for (const node of track.nodes || []) {
        addModule("SMP", node.id);
        (node.tasks || []).forEach((task, index) => addRow("SMP", node.id, index, task));
    }
}

// ---------- SMK ----------
for (const track of smkWindow.LP_SMAK) {
    for (const node of track.nodes || []) {
        addModule("SMK", node.id);
        (node.tasks || []).forEach((task, index) => addRow("SMK", node.id, index, task));
    }
}

// Buang duplikat (grade+module+index) agar UNIQUE tidak memicu error.
const unique = new Map();
for (const row of rows) unique.set(`${row[0]}|${row[1]}|${row[2]}`, row);
const materialRows = [...unique.values()];

// ============================================================
// SIMPAN
// ============================================================

const insertModule = db.prepare(`INSERT OR IGNORE INTO modules (grade, module_id) VALUES (?, ?)`);
const insertMaterial = db.prepare(`
    INSERT OR IGNORE INTO materials (grade, module_id, lesson_index, path, judul)
    VALUES (?, ?, ?, ?, ?)
`);
const fillTitle = db.prepare(`
    UPDATE materials SET judul = ?
    WHERE grade = ? AND module_id = ? AND lesson_index = ?
      AND (judul IS NULL OR judul = '')
`);

let inserted = 0;
let existing = 0;
let titled = 0;

const seed = db.transaction(() => {
    for (const [grade, moduleId] of modules.values()) insertModule.run(grade, moduleId);

    for (const row of materialRows) {
        const info = insertMaterial.run(...row);
        if (info.changes > 0) {
            inserted++;
        } else {
            existing++;
            const updated = fillTitle.run(row[4], row[0], row[1], row[2]);
            if (updated.changes > 0) titled++;
        }
    }
});

seed();

// ============================================================
// LAPORAN
// ============================================================

const perGrade = db.prepare(`
    SELECT grade, COUNT(*) AS total
    FROM materials
    GROUP BY grade
    ORDER BY grade ASC
`).all();

console.log("");
console.log("==========================================");
console.log(" MATERIAL SEEDER (SD + SMP + SMK)");
console.log("==========================================");
console.log(`Baris dari kurikulum : ${materialRows.length}`);
console.log(`Baru dimasukkan      : ${inserted}`);
console.log(`Sudah ada (dilewati) : ${existing}`);
console.log(`Judul kosong diisi   : ${titled}`);
console.log("");
console.log("Total materi di DB   :");
for (const row of perGrade) console.log(`  ${row.grade} : ${row.total}`);
console.log("==========================================");
console.log("");
