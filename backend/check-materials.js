const fs = require("fs");
const path = require("path");

const db = require("./database");

const PROJECT_ROOT = path.join(__dirname, "..");

const materials = db.prepare(`
    SELECT
        id,
        grade,
        task_id,
        lesson_index,
        path
    FROM materials
    ORDER BY grade, task_id, lesson_index
`).all();

let missing = 0;

console.log("");
console.log("==========================================");
console.log(" CHECK MATERIAL PATH");
console.log("==========================================");

for (const material of materials) {
    const relativePath = material.path.replace(/^[/\\]+/, "");
    const filePath = path.join(PROJECT_ROOT, relativePath);

    const exists = fs.existsSync(filePath);

    if (!exists) {
        missing++;

        console.log(
            `❌ ID ${material.id} | ${material.grade}/${material.task_id}:${material.lesson_index}`
        );

        console.log(
            `   ${material.path}`
        );
    }
}

console.log("");
console.log(`Total materi : ${materials.length}`);
console.log(`File hilang  : ${missing}`);

if (missing === 0) {
    console.log("✅ Semua path materi valid.");
} else {
    console.log("⚠️ Ada path materi yang tidak ditemukan.");
}

console.log("");