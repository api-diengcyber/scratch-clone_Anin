#!/usr/bin/env node
// Smoke test production. Jalankan dari folder backend:
//   BASE_URL=https://domain-anda npm run smoke
// Lokal (mode dev, tanpa cek /api/dev/*): EXPECT_PROD=0 BASE_URL=http://localhost:3001 npm run smoke

const BASE_URL = (process.argv[2] || process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const EXPECT_PROD = process.env.EXPECT_PROD !== "0";
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 10000);

let failed = 0;
let passed = 0;
let skipped = 0;

function check(name, ok, detail = "") {
    if (ok) {
        passed++;
        console.log(`PASS  ${name}`);
    } else {
        failed++;
        console.log(`FAIL  ${name}${detail ? ` (${detail})` : ""}`);
    }
}

function skip(name, reason) {
    skipped++;
    console.log(`SKIP  ${name} (${reason})`);
}

async function get(path) {
    const res = await fetch(BASE_URL + path, {
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res;
}

(async () => {
    console.log(`Smoke test: ${BASE_URL}${EXPECT_PROD ? " (production)" : " (dev)"}\n`);

    const health = await get("/api/health");
    let healthBody = {};
    try { healthBody = await health.json(); } catch { /* bukan JSON */ }
    check("GET /api/health -> 200", health.status === 200, `HTTP ${health.status}`);
    check("health.database = connected", healthBody.database === "connected", String(healthBody.database));

    const root = await get("/");
    check("GET / -> 200", root.status === 200, `HTTP ${root.status}`);

    if (EXPECT_PROD) {
        const dev = await get("/api/dev/progress");
        check("GET /api/dev/progress -> 404", dev.status === 404, `HTTP ${dev.status}`);
    } else {
        skip("GET /api/dev/progress -> 404", "EXPECT_PROD=0");
    }

    for (const path of ["/backend/.env", "/backend/database.sqlite", "/.git/config"]) {
        const res = await get(path);
        check(`GET ${path} -> 404`, res.status === 404, `HTTP ${res.status}`);
    }

    const shop = await get("/api/shop");
    check("GET /api/shop tanpa token -> 401", shop.status === 401, `HTTP ${shop.status}`);

    console.log(`\n${passed} lolos, ${failed} gagal, ${skipped} dilewati.`);
    process.exit(failed ? 1 : 0);
})().catch((err) => {
    console.error("Smoke test error:", err.message);
    process.exit(1);
});
