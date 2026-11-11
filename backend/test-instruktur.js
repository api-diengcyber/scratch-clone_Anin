// Tes endpoint portal instruktur (tugas tambahan, ujian kelulusan, jadwal).
// Jalankan: node test-instruktur.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 3113;
const TMPDB = path.join(os.tmpdir(), `dcc-test-instruktur-${process.pid}.sqlite`);
const PLUGIN_DIR = path.join(os.tmpdir(), `dcc-test-instruktur-plugins-${process.pid}`);

for (const file of [TMPDB, TMPDB + "-shm", TMPDB + "-wal"]) {
  try { fs.unlinkSync(file); } catch {}
}
fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });

process.env.DB_PATH = TMPDB;
process.env.NODE_ENV = "test";
process.env.PORT = String(PORT);
process.env.PLUGIN_DIR = PLUGIN_DIR;
process.env.REPORT_EMAIL_ENABLED = "false";
process.env.LOG_LEVEL = "error";

const db = require("./database");
const auth = require("./auth");

function addUser(username, role, { fullName = "", grades = null } = {}) {
  const info = db.prepare(`INSERT INTO users (username, email, role, allowed_grades, status, must_change_password, full_name)
    VALUES (?, ?, ?, ?, 'active', 0, ?)`).run(
    username,
    `${username}@example.com`,
    role,
    grades ? JSON.stringify(grades) : null,
    fullName || null
  );
  return Number(info.lastInsertRowid);
}

const adminId = addUser("inst-admin", "admin", { fullName: "Admin Ruang KKA" });
const guruA = addUser("inst-guru-a", "instruktur", { fullName: "Kak Anin", grades: ["SMP"] });
const guruB = addUser("inst-guru-b", "instruktur", { fullName: "Kak Budi", grades: ["SMK"] });
const siswaSmp = addUser("inst-siswa-smp", "student", { fullName: "Siswa SMP", grades: ["SMP"] });
const siswaSmk = addUser("inst-siswa-smk", "student", { fullName: "Siswa SMK", grades: ["SMK"] });

const adminToken = auth.createSession(adminId);
const tokenA = auth.createSession(guruA);
const tokenB = auth.createSession(guruB);
const studentSmpToken = auth.createSession(siswaSmp);
const studentSmkToken = auth.createSession(siswaSmk);

const B = `http://127.0.0.1:${PORT}`;

const child = spawn(process.execPath, ["server.js"], {
  cwd: __dirname,
  env: { ...process.env }
});
let out = "";
child.stdout.on("data", (d) => { out += d; });
child.stderr.on("data", (d) => { out += d; });

function waitReady() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (out.includes("DIENG CYBER CODING - SERVER") && out.includes(`API      : http://localhost:${PORT}`)) {
        clearInterval(iv);
        resolve();
      } else if (child.exitCode !== null) {
        clearInterval(iv);
        reject(new Error("Server berhenti sebelum siap. Output:\n" + out));
      } else if (Date.now() - t0 > 60000) {
        clearInterval(iv);
        reject(new Error("Server tidak siap dalam 60 detik. Output:\n" + out));
      }
    }, 100);
  });
}

async function j(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    throw new Error(`bukan JSON (HTTP ${res.status}): ${text.slice(0, 160)}`);
  }
}
async function api(method, url, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(B + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { r, d: await j(r) };
}

const results = [];
async function t(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + " - " + e.message]);
  }
}
function eq(got, want, msg) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${msg}: dapat ${JSON.stringify(got)}, harap ${JSON.stringify(want)}`);
  }
}
function ok(value, msg) {
  if (!value) throw new Error(msg);
}

async function main() {
  await waitReady();

  let tugas = null;
  let ujian = null;
  let jadwal = null;

  // ---------------- identitas ----------------
  await t("me: tanpa token 401", async () => {
    const { r } = await api("GET", "/api/instruktur/me");
    eq(r.status, 401, "status");
  });

  await t("me: instruktur mendapat role dan nama", async () => {
    const { r, d } = await api("GET", "/api/instruktur/me", { token: tokenA });
    eq(r.status, 200, "status");
    eq(d.role, "instruktur", "role");
    eq(d.name, "Kak Anin", "name");
    eq(d.grades, ["SMP"], "grades");
  });

  // ---------------- tugas tambahan ----------------
  await t("tugas: murid ditolak", async () => {
    const { r } = await api("GET", "/api/instruktur/tugas", { token: studentSmpToken });
    eq(r.status, 403, "status");
  });

  await t("tugas: instruktur membuat tugas draft", async () => {
    const { r, d } = await api("POST", "/api/instruktur/tugas", {
      token: tokenA,
      body: {
        title: "Tantangan Perulangan",
        description: "Buat pola bintang memakai for.",
        grade: "SMP",
        type: "kode",
        points: 40,
        due: "2027-01-20",
        status: "draft"
      }
    });
    eq(r.status, 201, "status");
    eq(d.item.title, "Tantangan Perulangan", "title");
    eq(d.item.status, "draft", "status draft");
    eq(d.item.points, 40, "points");
    tugas = d.item;
  });

  await t("tugas: draft tidak tampil di endpoint murid", async () => {
    const { d } = await api("GET", "/api/tugas-tambahan?grade=SMP", { token: studentSmpToken });
    ok(!d.items.some((x) => x.id === tugas.id), "draft bocor ke murid");
  });

  await t("tugas: daftar instruktur hanya miliknya", async () => {
    const a = await api("GET", "/api/instruktur/tugas", { token: tokenA });
    ok(a.d.items.some((x) => x.id === tugas.id), "pemilik tidak melihat tugasnya");
    const b = await api("GET", "/api/instruktur/tugas", { token: tokenB });
    ok(!b.d.items.some((x) => x.id === tugas.id), "instruktur lain melihat tugas orang");
    const admin = await api("GET", "/api/instruktur/tugas", { token: adminToken });
    ok(admin.d.items.some((x) => x.id === tugas.id), "admin tidak melihat semua tugas");
  });

  await t("tugas: instruktur lain tidak bisa ubah/hapus", async () => {
    const patch = await api("PATCH", `/api/instruktur/tugas/${tugas.id}`, {
      token: tokenB,
      body: { title: "Diambil alih" }
    });
    eq(patch.r.status, 404, "patch status");
    const del = await api("DELETE", `/api/instruktur/tugas/${tugas.id}`, { token: tokenB });
    eq(del.r.status, 404, "delete status");
  });

  await t("tugas: terbit muncul untuk murid jenjang yang sesuai", async () => {
    const { r, d } = await api("PATCH", `/api/instruktur/tugas/${tugas.id}`, {
      token: tokenA,
      body: { status: "terbit" }
    });
    eq(r.status, 200, "status patch");
    eq(d.item.status, "terbit", "status terbit");

    const smp = await api("GET", "/api/tugas-tambahan?grade=SMP", { token: studentSmpToken });
    ok(smp.d.items.some((x) => x.id === tugas.id), "murid SMP tidak melihat tugas terbit");
    const smk = await api("GET", "/api/tugas-tambahan?grade=SMK", { token: studentSmkToken });
    ok(!smk.d.items.some((x) => x.id === tugas.id), "murid SMK melihat tugas jenjang lain");
    const all = await api("GET", "/api/tugas-tambahan", { token: studentSmkToken });
    ok(!all.d.items.some((x) => x.id === tugas.id), "filter allowed_grades murid tidak berlaku");
  });

  await t("tugas: validasi input", async () => {
    const cases = [
      [{ title: "", grade: "SMP" }, "title"],
      [{ title: "X", grade: "SMA" }, "grade"],
      [{ title: "X", grade: "SMP", points: 1001 }, "points"],
      [{ title: "X", grade: "SMP", due: "2027-02-30" }, "due"],
      [{ title: "X", grade: "SMP", status: "selesai" }, "status"],
      [{ title: "X", grade: "SMP", type: "video" }, "type"]
    ];
    for (const [body, field] of cases) {
      const { r, d } = await api("POST", "/api/instruktur/tugas", { token: tokenA, body });
      eq(r.status, 400, `status untuk ${field}`);
      eq(d.details && d.details.field, field, `field untuk ${field}`);
    }
  });

  // ---------------- ujian kelulusan ----------------
  await t("ujian: instruktur membuat ujian dengan nilai peserta", async () => {
    const { r, d } = await api("POST", "/api/instruktur/ujian", {
      token: tokenA,
      body: {
        title: "Projek Akhir: Game 2D",
        description: "Kumpulkan game 2D buatan sendiri.",
        grade: "SMP",
        format: "proyek",
        kkm: 75,
        durasi: 90,
        buka: "2026-01-01",
        tutup: "2030-12-31",
        status: "terbit",
        hasil: [
          { nama: "Siswa Satu", nilai: 90 },
          { nama: "Siswa Dua", nilai: 60 },
          { nama: "", nilai: "" }
        ]
      }
    });
    eq(r.status, 201, "status");
    eq(d.item.hasil.map((h) => [h.nama, h.nilai]), [["Siswa Satu", 90], ["Siswa Dua", 60]], "hasil");
    ujian = d.item;
  });

  await t("ujian: PATCH hasil mengganti daftar, bukan menambah", async () => {
    const { r, d } = await api("PATCH", `/api/instruktur/ujian/${ujian.id}`, {
      token: tokenA,
      body: { hasil: [{ nama: "Siswa Satu", nilai: 100 }] }
    });
    eq(r.status, 200, "status");
    eq(d.item.hasil.map((h) => [h.nama, h.nilai]), [["Siswa Satu", 100]], "hasil diganti");
    eq(d.item.title, "Projek Akhir: Game 2D", "field lain dipertahankan");
  });

  await t("ujian: validasi kkm, nilai, dan rentang tanggal", async () => {
    let res = await api("POST", "/api/instruktur/ujian", {
      token: tokenA, body: { title: "X", grade: "SMP", kkm: 101 }
    });
    eq(res.r.status, 400, "kkm");
    eq(res.d.details.field, "kkm", "field kkm");

    res = await api("PATCH", `/api/instruktur/ujian/${ujian.id}`, {
      token: tokenA, body: { hasil: [{ nama: "Siswa", nilai: 101 }] }
    });
    eq(res.r.status, 400, "nilai");

    res = await api("PATCH", `/api/instruktur/ujian/${ujian.id}`, {
      token: tokenA, body: { buka: "2027-05-10", tutup: "2027-05-01" }
    });
    eq(res.r.status, 400, "urutan tanggal");
    eq(res.d.details.field, "tutup", "field tutup");
  });

  await t("ujian: publik tidak membocorkan nilai peserta", async () => {
    const { r, d } = await api("GET", "/api/ujian-kelulusan?grade=SMP", { token: studentSmpToken });
    eq(r.status, 200, "status");
    const item = d.items.find((x) => x.id === ujian.id);
    ok(item, "ujian terbit tidak tampil");
    eq(item.hasil, undefined, "hasil bocor");
    eq(item.title, "Projek Akhir: Game 2D", "title");
  });

  await t("ujian: draft dan ujian di luar jendela tidak tampil", async () => {
    const draft = await api("POST", "/api/instruktur/ujian", {
      token: tokenA,
      body: { title: "Ujian Draft", grade: "SMP", status: "draft" }
    });
    const future = await api("POST", "/api/instruktur/ujian", {
      token: tokenA,
      body: { title: "Ujian Masa Depan", grade: "SMP", status: "terbit", buka: "2099-01-01" }
    });
    const { d } = await api("GET", "/api/ujian-kelulusan", { token: studentSmpToken });
    ok(!d.items.some((x) => x.id === draft.d.item.id), "draft tampil");
    ok(!d.items.some((x) => x.id === future.d.item.id), "ujian masa depan tampil");
    await api("DELETE", `/api/instruktur/ujian/${draft.d.item.id}`, { token: tokenA });
    await api("DELETE", `/api/instruktur/ujian/${future.d.item.id}`, { token: tokenA });
  });

  await t("ujian: hapus ujian ikut menghapus nilai peserta", async () => {
    const created = await api("POST", "/api/instruktur/ujian", {
      token: tokenA,
      body: { title: "Ujian Sementara", grade: "SMK", hasil: [{ nama: "A", nilai: 80 }] }
    });
    const id = created.d.item.id;
    eq(db.prepare("SELECT COUNT(*) AS n FROM instruktur_exam_results WHERE exam_id = ?").get(id).n, 1, "hasil awal");
    const del = await api("DELETE", `/api/instruktur/ujian/${id}`, { token: tokenA });
    eq(del.r.status, 200, "status hapus");
    eq(db.prepare("SELECT COUNT(*) AS n FROM instruktur_exam_results WHERE exam_id = ?").get(id).n, 0, "hasil tersisa");
  });

  // ---------------- jadwal ----------------
  await t("jadwal: instruktur membuat jadwal, mentor terisi otomatis", async () => {
    const { r, d } = await api("POST", "/api/instruktur/jadwal", {
      token: tokenA,
      body: {
        judul: "Live Mentoring: Game Pertamaku",
        jenis: "Live Mentoring",
        tanggal: "2027-03-15",
        mulai: "15:00",
        selesai: "16:30",
        grade: "SMP",
        zoomUrl: "https://zoom.us/j/123456789",
        meetingId: "123 4567 8901",
        passcode: "belajar"
      }
    });
    eq(r.status, 201, "status");
    eq(d.item.judul, "Live Mentoring: Game Pertamaku", "judul");
    eq(d.item.mentor, "Kak Anin", "mentor otomatis");
    eq(d.item.grades, ["SMP"], "grades");
    jadwal = d.item;
  });

  await t("jadwal: tampil juga di endpoint murid /api/jadwal", async () => {
    const { r, d } = await api("GET", "/api/jadwal?bulan=2027-03", { token: studentSmpToken });
    eq(r.status, 200, "status");
    ok(d.jadwal.some((x) => x.id === jadwal.id), "jadwal instruktur tidak sampai ke murid");
  });

  await t("jadwal: daftar instruktur hanya miliknya", async () => {
    const a = await api("GET", "/api/instruktur/jadwal", { token: tokenA });
    ok(a.d.items.some((x) => x.id === jadwal.id), "pemilik tidak melihat jadwalnya");
    const b = await api("GET", "/api/instruktur/jadwal", { token: tokenB });
    ok(!b.d.items.some((x) => x.id === jadwal.id), "instruktur lain melihat jadwal orang");
    const admin = await api("GET", "/api/instruktur/jadwal", { token: adminToken });
    ok(admin.d.items.some((x) => x.id === jadwal.id), "admin tidak melihat semua jadwal");
  });

  await t("jadwal: instruktur lain tidak bisa hapus", async () => {
    const del = await api("DELETE", `/api/instruktur/jadwal/${jadwal.id}`, { token: tokenB });
    eq(del.r.status, 404, "status");
  });

  await t("jadwal: validasi jam dan link Zoom", async () => {
    let res = await api("POST", "/api/instruktur/jadwal", {
      token: tokenA,
      body: { judul: "Salah Jam", tanggal: "2027-03-16", mulai: "16:00", selesai: "15:00" }
    });
    eq(res.r.status, 400, "jam");
    eq(res.d.details.field, "selesai", "field jam");

    res = await api("POST", "/api/instruktur/jadwal", {
      token: tokenA,
      body: { judul: "Link Salah", tanggal: "2027-03-16", mulai: "15:00", selesai: "16:00", zoomUrl: "http://zoom.us/j/1" }
    });
    eq(res.r.status, 400, "zoom");
    eq(res.d.details.field, "zoomUrl", "field zoom");
  });

  await t("jadwal: halaman portal instruktur tersaji", async () => {
    const r = await fetch(`${B}/instruktur/`);
    eq(r.status, 200, "status");
    const html = await r.text();
    ok(html.includes("Portal Instruktur") || html.includes("Instruktur"), "judul halaman");
  });

  // ---------------- audit & batas laju ----------------
  await t("audit mencatat create/update/delete instruktur", async () => {
    const rows = db.prepare("SELECT action FROM admin_audit WHERE action LIKE 'instruktur_%'").all();
    const actions = new Set(rows.map((r) => r.action));
    for (const action of [
      "instruktur_tugas.create", "instruktur_tugas.update",
      "instruktur_ujian.create", "instruktur_ujian.update", "instruktur_ujian.delete",
      "instruktur_jadwal.create"
    ]) {
      ok(actions.has(action), "tidak ada audit " + action);
    }
  });

  await t("batas laju: 60 tulisan per menit per akun", async () => {
    let last = null;
    for (let i = 0; i < 61; i++) {
      last = await api("POST", "/api/instruktur/tugas", { token: tokenB, body: { title: "" } });
    }
    eq(last.r.status, 429, "status terakhir");
    eq(last.d.code, "RATE_LIMITED", "kode");
  });

  await t("tugas: hapus tugas", async () => {
    const del = await api("DELETE", `/api/instruktur/tugas/${tugas.id}`, { token: tokenA });
    eq(del.r.status, 200, "status");
    const list = await api("GET", "/api/instruktur/tugas", { token: tokenA });
    ok(!list.d.items.some((x) => x.id === tugas.id), "masih ada setelah dihapus");
  });

  await t("ujian: hapus ujian utama", async () => {
    const del = await api("DELETE", `/api/instruktur/ujian/${ujian.id}`, { token: tokenA });
    eq(del.r.status, 200, "status");
  });

  const failed = results.filter(([status]) => status === "FAIL");
  for (const [status, name] of results) console.log(`${status}  ${name}`);
  console.log(`\n${results.length - failed.length}/${results.length} lolos`);
  child.kill();
  for (const file of [TMPDB, TMPDB + "-shm", TMPDB + "-wal"]) {
    try { fs.unlinkSync(file); } catch {}
  }
  fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  child.kill();
  process.exit(1);
});
