const fs = require("fs");
const path = require("path");
const vm = require("vm");

const db = require("./database");

// ============================================================
// LOAD DATA SMP
// ============================================================

const dataFile = path.join(
    __dirname,
    "..",
    "kurikulum",
    "data",
    "jalur-data-smp.js"
);

let source = fs.readFileSync(dataFile, "utf8");

// ------------------------------------------------------------
// MATERI di jalur-data-smp.js adalah const lokal di dalam IIFE.
// Kita titipkan nilainya ke window sebelum IIFE selesai.
// File aslinya TIDAK diubah.
// ------------------------------------------------------------

const lastClose = source.lastIndexOf("})();");

if (lastClose === -1) {
    throw new Error(
        "Format jalur-data-smp.js tidak sesuai: penutup IIFE tidak ditemukan."
    );
}

source =
    source.slice(0, lastClose) +
    "\nwindow.__MATERI = MATERI;\n" +
    source.slice(lastClose);

// ============================================================
// JALANKAN FILE DALAM VM
// ============================================================

const sandbox = {
    window: {}
};

vm.createContext(sandbox);

vm.runInContext(source, sandbox);

// ============================================================
// AMBIL DATA
// ============================================================

const LP_SMP = sandbox.window.LP_SMP;
const MATERI = sandbox.window.__MATERI;

if (!LP_SMP) {
    throw new Error(
        "LP_SMP tidak berhasil dibaca dari jalur-data-smp.js"
    );
}

if (!MATERI) {
    throw new Error(
        "MATERI tidak berhasil dibaca dari jalur-data-smp.js"
    );
}

// ============================================================
// DATABASE INSERT
// ============================================================

const insert = db.prepare(`
    INSERT OR IGNORE INTO materials (
        grade,
        module_id,
        lesson_index,
        path
    )
    VALUES (?, ?, ?, ?)
`);

// ============================================================
// GENERATE MATERIALS
// ============================================================
//
// Mengikuti logika frontend:
//
// MATERI[n.id + ":" + i] || MATERI[n.id] || ""
//
// Jadi fallback tetap sama persis.
// ============================================================

const materials = [];

for (const modul of LP_SMP) {
    for (const node of modul.nodes) {
        for (let i = 0; i < node.tasks.length; i++) {

            const keySpecific = `${node.id}:${i}`;
            const keyDefault = node.id;

            const materialPath =
                MATERI[keySpecific] ||
                (node.id === "py1" ? "" : MATERI[keyDefault] || "");

            if (!materialPath) {
                continue;
            }

            materials.push([
                "SMP",
                node.id,
                i,
                materialPath
            ]);
        }
    }
}

// ============================================================
// INSERT
// ============================================================
const seed = db.transaction(() => {
    const insertModule = db.prepare(`INSERT OR IGNORE INTO modules (grade, module_id) VALUES (?, ?)`);
    for (const modul of LP_SMP) {
        for (const node of modul.nodes) insertModule.run("SMP", node.id);
    }

    // Sinkronkan ulang materi modul py1 dari sumber kurikulum.
    db.prepare(`
        DELETE FROM materials
        WHERE grade = ? AND module_id = ?
    `).run("SMP", "py1");

    for (const material of materials) {
        insert.run(...material);
    }
});

seed();

console.log("");
console.log("==========================================");
console.log(" MATERIAL SEEDER");
console.log("==========================================");
console.log(`Data materi ditemukan : ${materials.length}`);
console.log("Grade                 : SMP");
console.log("==========================================");
console.log("");