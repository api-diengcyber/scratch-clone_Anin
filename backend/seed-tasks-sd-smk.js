const fs = require("fs");
const path = require("path");
const vm = require("vm");
const db = require("./database");

// ============================================================
// LOAD FILE DATA KURIKULUM
// ============================================================

function loadData(filename) {
    const filePath = path.join(
        __dirname,
        "..",
        "kurikulum",
        "data",
        filename
    );

    const source = fs.readFileSync(filePath, "utf8");
    const sandbox = { window: {} };

    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, {
        filename
    });

    return sandbox.window;
}

const sdData = loadData("jalur-data.js");
const smkData = loadData("jalur-data-smak.js");

if (!sdData.LP_DATA?.tahap) {
    throw new Error("Data kurikulum SD tidak ditemukan.");
}

if (!Array.isArray(smkData.LP_SMAK)) {
    throw new Error("Data kurikulum SMK tidak ditemukan.");
}

// ============================================================
// KUMPULKAN DATA TASK
// ============================================================

const rows = [];
const modules = new Set();

// ------------------------------------------------------------
// SD
// ------------------------------------------------------------

for (const tahap of sdData.LP_DATA.tahap) {
    for (const modul of tahap.pembelajaran || []) {
        modules.add(`SD:${modul.id}`);

        const tasks = modul.tasks || [];

        tasks.forEach((task, index) => {
            rows.push([
                "SD",
                modul.id,
                `${modul.id}-t${index + 1}`,
                index,
                task.title || `Task ${index + 1}`,
                JSON.stringify(
                    Array.isArray(task.langkah)
                        ? task.langkah
                        : Array.isArray(task.steps)
                            ? task.steps
                            : []
                ),
                0,
                0,
                null
            ]);
        });

        // Project akhir memiliki ID sendiri.
        if (modul.project) {
            const project = modul.project;

            rows.push([
                "SD",
                modul.id,
                `${modul.id}-project`,
                tasks.length,
                project.title || "Project Akhir",
                JSON.stringify(
                    Array.isArray(project.steps)
                        ? project.steps
                        : Array.isArray(project.langkah)
                            ? project.langkah
                            : []
                ),
                1,
                Array.isArray(project.kumpul) &&
                    project.kumpul.length > 0
                    ? 1
                    : 0,
                null
            ]);
        }
    }
}

// ------------------------------------------------------------
// SMK
// ------------------------------------------------------------

for (const tahap of smkData.LP_SMAK) {
    for (const modul of tahap.nodes || []) {
        modules.add(`SMK:${modul.id}`);

        (modul.tasks || []).forEach((task, index) => {
            rows.push([
                "SMK",
                modul.id,
                `${modul.id}:${index}`,
                index,
                task.judul || `Task ${index + 1}`,
                JSON.stringify(
                    Array.isArray(task.langkah)
                        ? task.langkah
                        : []
                ),
                task.project ? 1 : 0,
                task.kumpul ? 1 : 0,
                modul.urlEditor || null
            ]);
        });
    }
}

// ============================================================
// INSERT TANPA MENGHAPUS DATA LAMA
// ============================================================

const insert = db.prepare(`
    INSERT OR IGNORE INTO tasks (
        grade,
        module_id,
        task_id,
        task_index,
        title,
        steps,
        is_project,
        requires_submission,
        editor_url
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const seed = db.transaction(() => {
    for (const row of rows) {
        insert.run(...row);
    }
});

seed();

// ============================================================
// LAPORAN HASIL
// ============================================================

console.log("");
console.log("==========================================");
console.log(" TASK SEEDER — SD & SMK");
console.log("==========================================");
console.log(`Modul diproses : ${modules.size}`);
console.log(`Task diproses  : ${rows.length}`);
console.log("");
console.log("Total task di database:");

console.table(
    db.prepare(`
        SELECT grade, COUNT(*) AS total
        FROM tasks
        GROUP BY grade
        ORDER BY grade
    `).all()
);

console.log("==========================================");