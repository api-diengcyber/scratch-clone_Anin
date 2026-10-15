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

const lastClose = source.lastIndexOf("})();");

if (lastClose === -1) {
    throw new Error(
        "Penutup IIFE jalur-data-smp.js tidak ditemukan."
    );
}

// Expose LP_SMP ke Node tanpa mengubah file asli.
source =
    source.slice(0, lastClose) +
    "\nwindow.__LP_SMP = window.LP_SMP;\n" +
    source.slice(lastClose);

// ============================================================
// JALANKAN FILE
// ============================================================

const sandbox = {
    window: {}
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const LP_SMP = sandbox.window.__LP_SMP;

if (!LP_SMP) {
    throw new Error(
        "LP_SMP tidak berhasil dibaca."
    );
}

// ============================================================
// DATABASE INSERT
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

// ============================================================
// GENERATE SEMUA TASK
// ============================================================

const tasks = [];

for (const tahap of LP_SMP) {
    for (const node of tahap.nodes) {
        for (let i = 0; i < node.tasks.length; i++) {

            const task = node.tasks[i];

            tasks.push([
                "SMP",
                node.id,
                `${node.id}:${i}`,
                i,
                task.judul,
                JSON.stringify(task.langkah),
                task.project ? 1 : 0,
                task.kumpul ? 1 : 0,
                task.project ? 50 : 10,
                node.urlEditor
            ]);
        }
    }
}

// ============================================================
// INSERT TRANSACTION
// ============================================================

const refreshPoints = db.prepare(`UPDATE tasks SET points = ? WHERE grade = ? AND task_id = ?`);
const seed = db.transaction(() => {
    const insertModule = db.prepare(`INSERT OR IGNORE INTO modules (grade, module_id) VALUES (?, ?)`);
    for (const tahap of LP_SMP) {
        for (const node of tahap.nodes) insertModule.run("SMP", node.id);
    }

    for (const task of tasks) {
        insert.run(...task);
        refreshPoints.run(task[8], task[0], task[2]);
    }
});

seed();

// ============================================================
// OUTPUT
// ============================================================

console.log("");
console.log("==========================================");
console.log(" TASK SEEDER");
console.log("==========================================");
console.log(`Modul : ${new Set(tasks.map((t) => t[1])).size}`);
console.log(`Task  : ${tasks.length}`);
console.log("Grade : SMP");
console.log("==========================================");
console.log("");