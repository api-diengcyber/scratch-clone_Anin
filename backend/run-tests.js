"use strict";
const fs = require("fs");
const { execSync } = require("child_process");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const tests = pkg.scripts.test
  .split("&&")
  .map(s => s.trim().replace(/^node\s+/, ""));

console.log(`Menjalankan ${tests.length} test files...`);
let failed = 0;

for (let i = 0; i < tests.length; i++) {
  const t = tests[i];
  process.stdout.write(`[${i + 1}/${tests.length}] ${t} ... `);
  const start = Date.now();
  try {
    execSync(`node ${t}`, { stdio: "ignore" });
    const dur = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`OK (${dur}s)`);
  } catch (err) {
    console.log("FAILED");
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} test file GAGAL!`);
  process.exit(1);
} else {
  console.log(`\nSEMUA ${tests.length} TEST SUITE LOLOS 100%!`);
}
