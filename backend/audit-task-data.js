const db = require("./database");

console.log("\n=== JUMLAH TASK PER JENJANG ===");

console.table(
    db.prepare(`
        SELECT grade, COUNT(*) AS total
        FROM tasks
        GROUP BY grade
        ORDER BY grade
    `).all()
);

const tasks = db.prepare(`
    SELECT
        grade,
        module_id,
        task_id,
        title,
        steps,
        is_project,
        requires_submission
    FROM tasks
    ORDER BY grade, module_id, task_index
`).all();

const invalidSteps = [];
const invalidFlags = [];
const invalidRequiredFields = [];

for (const task of tasks) {
    try {
        const steps = JSON.parse(task.steps);

        if (!Array.isArray(steps)) {
            invalidSteps.push(task.task_id);
        }
    } catch {
        invalidSteps.push(task.task_id);
    }

    if (
        ![0, 1].includes(task.is_project) ||
        ![0, 1].includes(task.requires_submission)
    ) {
        invalidFlags.push(task.task_id);
    }

    if (
        !task.grade ||
        !task.module_id ||
        !task.task_id ||
        !task.title
    ) {
        invalidRequiredFields.push(task.task_id);
    }
}

console.log("\n=== VALIDASI TASK ===");
console.log("Total task:", tasks.length);
console.log("Steps JSON tidak valid:", invalidSteps.length);
console.log("Flag tidak valid:", invalidFlags.length);
console.log("Field wajib kosong:", invalidRequiredFields.length);

if (invalidSteps.length) {
    console.log("Task dengan steps bermasalah:", invalidSteps);
}

if (invalidFlags.length) {
    console.log("Task dengan flag bermasalah:", invalidFlags);
}

if (invalidRequiredFields.length) {
    console.log("Task dengan field kosong:", invalidRequiredFields);
}

db.close();
