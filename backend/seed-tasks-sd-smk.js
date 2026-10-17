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
            const taskPoin = Number.isSafeInteger(task.poin) ? task.poin : 10;
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
                taskPoin,
                null
            ]);
        });

        // Project akhir memiliki ID sendiri.
        if (modul.project) {
            const project = modul.project;
            const projPoin = Number.isSafeInteger(project.poin) ? project.poin : 50;

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
                projPoin,
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
                task.project ? 50 : 10,
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
        points,
        editor_url
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const refreshPoints = db.prepare(`UPDATE tasks SET points = ? WHERE grade = ? AND task_id = ?`);
const seed = db.transaction(() => {
    const insertModule = db.prepare(`INSERT OR IGNORE INTO modules (grade, module_id) VALUES (?, ?)`);
    for (const key of modules) {
        const i = key.indexOf(":");
        insertModule.run(key.slice(0, i), key.slice(i + 1));
    }

    for (const row of rows) {
        insert.run(...row);
        refreshPoints.run(row[8], row[0], row[2]);
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