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

  await t("jadwal: menyimpan learning path dan task tujuan", async () => {
    const created = await api("POST", "/api/instruktur/jadwal", {
      token: tokenA,
      body: {
        judul: "Live Mentoring: Path",
        tanggal: "2027-03-17",
        mulai: "15:00",
        selesai: "16:00",
        grade: "SMP",
        learningPathId: "lp-web",
        learningPathName: "Web Dasar",
        taskId: "task-html",
        taskName: "HTML Pertama"
      }
    });
    eq(created.r.status, 201, "status");
    eq(created.d.item.grade, "SMP", "grade");
    eq(created.d.item.grades, ["SMP"], "grades");
    eq(created.d.item.learningPathId, "lp-web", "learningPathId");
    eq(created.d.item.learningPathName, "Web Dasar", "learningPathName");
    eq(created.d.item.taskId, "task-html", "taskId");
    eq(created.d.item.taskName, "HTML Pertama", "taskName");
    eq(created.d.item.targetScope, "task", "targetScope");

    const patch = await api("PATCH", `/api/instruktur/jadwal/${created.d.item.id}`, {
      token: tokenA,
      body: { taskId: "", taskName: "" }
    });
    eq(patch.r.status, 200, "status patch");
    eq(patch.d.item.taskId, "", "taskId dihapus");
    eq(patch.d.item.targetScope, "path", "scope turun ke path");
    eq(patch.d.item.learningPathName, "Web Dasar", "path name tetap");
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

  // ---------------- jawaban tugas tambahan ----------------
  let tugasJawab = null;
  let submissionTugas = null;

  await t("tugas: murid mengumpulkan jawaban", async () => {
    const created = await api("POST", "/api/instruktur/tugas", {
      token: tokenA,
      body: { title: "Tugas Jawab", description: "Kumpulkan hasil.", grade: "SMP", status: "terbit" }
    });
    eq(created.r.status, 201, "status buat tugas");
    tugasJawab = created.d.item;

    const { r, d } = await api("PUT", `/api/tugas-tambahan/${tugasJawab.id}/submission`, {
      token: studentSmpToken,
      body: { text: "Ini jawaban pertama", link: "https://example.com/karya" }
    });
    eq(r.status, 201, "status kumpul");
    eq(d.submission.status, "dikumpulkan", "status jawaban");
    eq(d.submission.text, "Ini jawaban pertama", "text");
    eq(d.submission.nilai, null, "nilai awal");
    submissionTugas = d.submission;
  });

  await t("tugas: murid memperbarui jawaban sebelum dinilai", async () => {
    const { r, d } = await api("PUT", `/api/tugas-tambahan/${tugasJawab.id}/submission`, {
      token: studentSmpToken,
      body: { text: "Jawaban revisi" }
    });
    eq(r.status, 200, "status perbarui");
    eq(d.submission.id, submissionTugas.id, "baris yang sama dipakai");
    eq(d.submission.text, "Jawaban revisi", "text terbaru");
  });

  await t("tugas: jawaban kosong ditolak", async () => {
    const { r, d } = await api("PUT", `/api/tugas-tambahan/${tugasJawab.id}/submission`, {
      token: studentSmpToken,
      body: { text: "   ", link: "" }
    });
    eq(r.status, 400, "status");
    eq(d.details && d.details.field, "text", "field");
  });

  await t("tugas: jenjang lain tidak bisa mengumpulkan", async () => {
    const list = await api("GET", "/api/tugas-tambahan", { token: studentSmkToken });
    ok(!list.d.items.some((x) => x.id === tugasJawab.id), "tugas SMP terlihat oleh murid SMK");
    const { r } = await api("PUT", `/api/tugas-tambahan/${tugasJawab.id}/submission`, {
      token: studentSmkToken,
      body: { text: "Mencoba" }
    });
    eq(r.status, 404, "status");
  });

  await t("tugas: daftar pengumpulan hanya untuk pemilik", async () => {
    const { r, d } = await api("GET", `/api/instruktur/tugas/${tugasJawab.id}/submissions`, { token: tokenA });
    eq(r.status, 200, "status pemilik");
    eq(d.items.length, 1, "jumlah jawaban");
    eq(d.items[0].nama, "Siswa SMP", "nama siswa");

    const lain = await api("GET", `/api/instruktur/tugas/${tugasJawab.id}/submissions`, { token: tokenB });
    eq(lain.r.status, 404, "instruktur lain");
    const admin = await api("GET", `/api/instruktur/tugas/${tugasJawab.id}/submissions`, { token: adminToken });
    eq(admin.r.status, 200, "admin");
    eq(admin.d.items.length, 1, "admin melihat jawaban");
  });

  await t("tugas: instruktur menilai dan murid tidak bisa mengubah lagi", async () => {
    const { r, d } = await api("PATCH", `/api/instruktur/tugas/${tugasJawab.id}/submissions/${submissionTugas.id}`, {
      token: tokenA,
      body: { nilai: 88, feedback: "Kerja bagus" }
    });
    eq(r.status, 200, "status nilai");
    eq(d.item.status, "dinilai", "status jawaban");
    eq(d.item.nilai, 88, "nilai");
    eq(d.item.feedback, "Kerja bagus", "feedback");
    ok(d.item.gradedAt, "gradedAt terisi");

    const ubah = await api("PUT", `/api/tugas-tambahan/${tugasJawab.id}/submission`, {
      token: studentSmpToken,
      body: { text: "Mencoba ubah" }
    });
    eq(ubah.r.status, 409, "status ubah setelah dinilai");
    eq(ubah.d.code, "SUBMISSION_GRADED", "kode");

    const murid = await api("GET", "/api/tugas-tambahan", { token: studentSmpToken });
    const item = murid.d.items.find((x) => x.id === tugasJawab.id);
    eq(item.submission.status, "dinilai", "status di halaman murid");
    eq(item.submission.nilai, 88, "nilai di halaman murid");

    const kartu = await api("GET", "/api/instruktur/tugas", { token: tokenA });
    const tugasKartu = kartu.d.items.find((x) => x.id === tugasJawab.id);
    eq(tugasKartu.submissionCount, 1, "submissionCount");
    eq(tugasKartu.gradedCount, 1, "gradedCount");
  });

  await t("tugas: instruktur lain tidak bisa menilai jawaban", async () => {
    const { r } = await api("PATCH", `/api/instruktur/tugas/${tugasJawab.id}/submissions/${submissionTugas.id}`, {
      token: tokenB,
      body: { nilai: 100 }
    });
    eq(r.status, 404, "status");
  });

  // ---------------- pengumpulan ujian kelulusan ----------------
  let ujianProjek = null;
  let submissionProjek = null;

  await t("ujian: murid mengumpulkan projek", async () => {
    const created = await api("POST", "/api/instruktur/ujian", {
      token: tokenA,
      body: {
        title: "Projek Jawab",
        description: "Kumpulkan projek.",
        grade: "SMP",
        format: "proyek",
        kkm: 75,
        buka: "2026-01-01",
        tutup: "2030-12-31",
        status: "terbit"
      }
    });
    eq(created.r.status, 201, "status buat ujian");
    ujianProjek = created.d.item;

    const { r, d } = await api("PUT", `/api/ujian-kelulusan/${ujianProjek.id}/submission`, {
      token: studentSmpToken,
      body: { text: "Projek pertama", link: "https://example.com/projek" }
    });
    eq(r.status, 201, "status kumpul");
    eq(d.submission.status, "menunggu", "status");
    eq(d.submission.attempt, 1, "attempt awal");
    submissionProjek = d.submission;

    const daftar = await api("GET", "/api/ujian-kelulusan?grade=SMP", { token: studentSmpToken });
    const item = daftar.d.items.find((x) => x.id === ujianProjek.id);
    eq(item.submission.status, "menunggu", "status di halaman murid");
    eq(item.kriteria, [], "kriteria kosong (frontend memakai rubrik default)");
  });

  await t("ujian: nilai di bawah KKM menjadi revisi", async () => {
    const { r, d } = await api("PATCH", `/api/instruktur/ujian/${ujianProjek.id}/submissions/${submissionProjek.id}`, {
      token: tokenA,
      body: {
        rubrik: { fungsi: 15, kreativitas: 15, kerapian: 15, penjelasan: 15 },
        feedback: "Perbaiki fungsi"
      }
    });
    eq(r.status, 200, "status");
    eq(d.item.status, "revisi", "status revisi");
    eq(d.item.nilai, 60, "nilai total");
    eq(d.item.rubrik.fungsi, 15, "rubrik tersimpan");
  });

  await t("ujian: rubrik tidak lengkap ditolak", async () => {
    const { r, d } = await api("PATCH", `/api/instruktur/ujian/${ujianProjek.id}/submissions/${submissionProjek.id}`, {
      token: tokenA,
      body: { rubrik: { fungsi: 10 } }
    });
    eq(r.status, 400, "status");
    eq(d.details && d.details.field, "rubrik.kreativitas", "field");
  });

  await t("ujian: kumpul ulang menaikkan attempt dan mempertahankan nilai lama", async () => {
    const { r, d } = await api("PUT", `/api/ujian-kelulusan/${ujianProjek.id}/submission`, {
      token: studentSmpToken,
      body: { text: "Projek revisi" }
    });
    eq(r.status, 200, "status");
    eq(d.submission.status, "menunggu", "status kembali menunggu");
    eq(d.submission.attempt, 2, "attempt bertambah");
    eq(d.submission.nilai, 60, "nilai lama dipertahankan");
    eq(d.submission.rubrik.fungsi, 15, "rubrik lama dipertahankan");
  });

  await t("ujian: nilai memenuhi KKM menjadi lulus", async () => {
    const { r, d } = await api("PATCH", `/api/instruktur/ujian/${ujianProjek.id}/submissions/${submissionProjek.id}`, {
      token: tokenA,
      body: { rubrik: { fungsi: 23, kreativitas: 23, kerapian: 22, penjelasan: 22 }, feedback: "Mantap" }
    });
    eq(r.status, 200, "status");
    eq(d.item.status, "lulus", "status lulus");
    eq(d.item.nilai, 90, "nilai");
  });

  await t("ujian: yang sudah lulus tidak bisa mengumpulkan lagi", async () => {
    const { r, d } = await api("PUT", `/api/ujian-kelulusan/${ujianProjek.id}/submission`, {
      token: studentSmpToken,
      body: { text: "Kumpul lagi" }
    });
    eq(r.status, 409, "status");
    eq(d.code, "ALREADY_PASSED", "kode");
  });

  await t("ujian: kartu daftar menghitung pengumpulan dan kelulusan", async () => {
    const { d } = await api("GET", "/api/instruktur/ujian", { token: tokenA });
    const item = d.items.find((x) => x.id === ujianProjek.id);
    eq(item.submissionCount, 1, "submissionCount");
    eq(item.pendingCount, 0, "pendingCount");
    eq(item.lulusCount, 1, "lulusCount");
    eq(item.kriteria.length, 0, "kriteria kosong memakai rubrik default di endpoint pengumpulan");
    const pengumpulan = await api("GET", `/api/instruktur/ujian/${ujianProjek.id}/submissions`, { token: tokenA });
    eq(pengumpulan.d.kriteria.length, 4, "rubrik default pada daftar pengumpulan");
    eq(pengumpulan.d.kkm, 75, "kkm");
  });

  await t("ujian: rubrik kustom dipakai saat menilai", async () => {
    const created = await api("POST", "/api/instruktur/ujian", {
      token: tokenA,
      body: {
        title: "Ujian Rubrik Kustom",
        grade: "SMP",
        format: "proyek",
        kkm: 75,
        buka: "2026-01-01",
        tutup: "2030-12-31",
        status: "terbit",
        kriteria: [
          { k: "desain", l: "Desain", d: "Tampilan", max: 50 },
          { k: "kode", l: "Kode", d: "Logika", max: 50 }
        ]
      }
    });
    eq(created.r.status, 201, "status buat");
    eq(created.d.item.kriteria.map((x) => x.k), ["desain", "kode"], "kriteria tersimpan");
    const exam = created.d.item;

    const kumpul = await api("PUT", `/api/ujian-kelulusan/${exam.id}/submission`, {
      token: studentSmpToken,
      body: { text: "Projek rubrik kustom" }
    });
    eq(kumpul.r.status, 201, "status kumpul");

    const salah = await api("PATCH", `/api/instruktur/ujian/${exam.id}/submissions/${kumpul.d.submission.id}`, {
      token: tokenA,
      body: { rubrik: { desain: 80, kode: 10 } }
    });
    eq(salah.r.status, 400, "nilai melebihi batas kriteria");

    const { r, d } = await api("PATCH", `/api/instruktur/ujian/${exam.id}/submissions/${kumpul.d.submission.id}`, {
      token: tokenA,
      body: { rubrik: { desain: 40, kode: 40 } }
    });
    eq(r.status, 200, "status nilai");
    eq(d.item.nilai, 80, "nilai kustom");
    eq(d.item.status, "lulus", "lulus");
  });

  await t("ujian: kriteria tidak valid ditolak", async () => {
    const total = await api("POST", "/api/instruktur/ujian", {
      token: tokenA,
      body: {
        title: "Kriteria Salah", grade: "SMP",
        kriteria: [{ k: "a", l: "A", max: 40 }, { k: "b", l: "B", max: 40 }]
      }
    });
    eq(total.r.status, 400, "total bukan 100");
    eq(total.d.details.field, "kriteria", "field total");

    const dup = await api("POST", "/api/instruktur/ujian", {
      token: tokenA,
      body: {
        title: "Kriteria Dobel", grade: "SMP",
        kriteria: [{ k: "a", max: 50 }, { k: "a", max: 50 }]
      }
    });
    eq(dup.r.status, 400, "kunci duplikat");
  });

  await t("ujian: syarat learning path dihitung dari progres", async () => {
    db.prepare("INSERT OR IGNORE INTO modules (grade, module_id) VALUES ('SMP', 'mod-syarat')").run();
    const insertTask = db.prepare(`INSERT INTO tasks
      (grade, module_id, task_id, task_index, title, is_project, points)
      VALUES ('SMP', 'mod-syarat', ?, ?, ?, ?, 10)`);
    insertTask.run("syarat-t1", 0, "Tugas 1", 0);
    insertTask.run("syarat-t2", 1, "Tugas 2", 0);
    insertTask.run("syarat-projek", 2, "Projek", 1);

    const created = await api("POST", "/api/instruktur/ujian", {
      token: tokenA,
      body: {
        title: "Ujian Bersyarat",
        grade: "SMP",
        format: "proyek",
        kkm: 75,
        buka: "2026-01-01",
        tutup: "2030-12-31",
        status: "terbit",
        learningPathId: "mod-syarat",
        learningPathName: "Jalur Uji"
      }
    });
    eq(created.r.status, 201, "status buat");
    const exam = created.d.item;

    const awal = await api("GET", "/api/ujian-kelulusan?grade=SMP", { token: studentSmpToken });
    const awalItem = awal.d.items.find((x) => x.id === exam.id);
    eq(awalItem.syarat, { selesai: 0, total: 2, terpenuhi: false, nama: "Jalur Uji" }, "syarat awal");

    const terkunci = await api("PUT", `/api/ujian-kelulusan/${exam.id}/submission`, {
      token: studentSmpToken,
      body: { text: "Belum selesai" }
    });
    eq(terkunci.r.status, 409, "status terkunci");
    eq(terkunci.d.code, "EXAM_LOCKED", "kode terkunci");

    db.prepare(`INSERT INTO progress (user_id, task_id, completed, completed_at)
      VALUES (?, 'syarat-t1', 1, CURRENT_TIMESTAMP)`).run(siswaSmp);
    const separuh = await api("GET", "/api/ujian-kelulusan?grade=SMP", { token: studentSmpToken });
    eq(separuh.d.items.find((x) => x.id === exam.id).syarat.selesai, 1, "progres separuh");

    db.prepare(`INSERT INTO progress (user_id, task_id, completed, completed_at)
      VALUES (?, 'syarat-t2', 1, CURRENT_TIMESTAMP)`).run(siswaSmp);
    const penuh = await api("GET", "/api/ujian-kelulusan?grade=SMP", { token: studentSmpToken });
    const penuhItem = penuh.d.items.find((x) => x.id === exam.id);
    eq(penuhItem.syarat.terpenuhi, true, "syarat terpenuhi");
    eq(penuhItem.syarat.total, 2, "projek tidak dihitung");

    const kumpul = await api("PUT", `/api/ujian-kelulusan/${exam.id}/submission`, {
      token: studentSmpToken,
      body: { text: "Sudah selesai" }
    });
    eq(kumpul.r.status, 201, "status kumpul setelah syarat");
  });

  await t("ujian: instruktur lain tidak bisa menilai pengumpulan", async () => {
    const { r } = await api("PATCH", `/api/instruktur/ujian/${ujianProjek.id}/submissions/${submissionProjek.id}`, {
      token: tokenB,
      body: { rubrik: { fungsi: 25, kreativitas: 25, kerapian: 25, penjelasan: 25 } }
    });
    eq(r.status, 404, "status");
    const daftar = await api("GET", `/api/instruktur/ujian/${ujianProjek.id}/submissions`, { token: tokenB });
    eq(daftar.r.status, 404, "daftar");
  });

  // ---------------- profil instruktur ----------------
  await t("profil: GET mengisi data akun", async () => {
    const { r, d } = await api("GET", "/api/instruktur/profil", { token: tokenA });
    eq(r.status, 200, "status");
    eq(d.item.nama, "Kak Anin", "nama dari akun");
    eq(d.item.email, "inst-guru-a@example.com", "email dari akun");
    eq(d.item.track, [], "track awal");
    eq(d.item.zonaWaktu, "WIB", "zona waktu awal");
    eq(d.item.pengingat, 15, "pengingat awal");
    ok(d.item.statistik && typeof d.item.statistik.sesiZoom === "number", "statistik");
  });

  await t("profil: PATCH menyimpan data baru", async () => {
    const { r, d } = await api("PATCH", "/api/instruktur/profil", {
      token: tokenA,
      body: {
        bio: "Mentor coding",
        track: ["Web", "Game", "Web"],
        linkedin: "https://linkedin.com/in/anin",
        zoomLink: "https://zoom.us/j/999",
        zoomPasscode: "kode123",
        zonaWaktu: "wita",
        pengingat: 30,
        terimaTugas: false,
        notifWa: false
      }
    });
    eq(r.status, 200, "status");
    eq(d.item.bio, "Mentor coding", "bio");
    eq(d.item.track, ["Web", "Game"], "track unik");
    eq(d.item.zonaWaktu, "WITA", "zona waktu");
    eq(d.item.pengingat, 30, "pengingat");
    eq(d.item.terimaTugas, false, "terimaTugas");
    eq(d.item.notifWa, false, "notifWa");
    eq(d.item.nama, "Kak Anin", "nama tetap");

    const lagi = await api("GET", "/api/instruktur/profil", { token: tokenA });
    eq(lagi.d.item.zoomLink, "https://zoom.us/j/999", "tersimpan");
    eq(lagi.d.item.zoomPasscode, "kode123", "passcode tersimpan");
  });

  await t("profil: foto data URL diterima dan validasi menolak input salah", async () => {
    const foto = "data:image/png;base64,iVBORw0KGgo=";
    const okFoto = await api("PATCH", "/api/instruktur/profil", { token: tokenA, body: { fotoUrl: foto } });
    eq(okFoto.r.status, 200, "foto data URL");
    eq(okFoto.d.item.fotoUrl, foto, "foto tersimpan");

    const cases = [
      [{ email: "bukan-email" }, "email"],
      [{ whatsapp: "abc" }, "whatsapp"],
      [{ zoomLink: "zoom.us/j/1" }, "zoomLink"],
      [{ pengingat: 7 }, "pengingat"],
      [{ fotoUrl: "ftp://example.com/foto.gif" }, "fotoUrl"],
      [{ zonaWaktu: "XYZ" }, "zonaWaktu"]
    ];
    for (const [body, field] of cases) {
      const { r, d } = await api("PATCH", "/api/instruktur/profil", { token: tokenA, body });
      eq(r.status, 400, `status ${field}`);
      eq(d.details && d.details.field, field, `field ${field}`);
    }
  });

  await t("profil: ganti password menolak format lemah lalu berhasil", async () => {
    const lemah = await api("POST", "/api/instruktur/profil/password", {
      token: tokenA,
      body: { lama: "", baru: "pendek" }
    });
    eq(lemah.r.status, 400, "status lemah");
    eq(lemah.d.details.field, "baru", "field");

    const sama = await api("POST", "/api/instruktur/profil/password", {
      token: tokenA,
      body: { lama: "Rahasia123", baru: "Rahasia123" }
    });
    eq(sama.r.status, 400, "sandi sama");

    const { r } = await api("POST", "/api/instruktur/profil/password", {
      token: tokenA,
      body: { lama: "", baru: "Rahasia123" }
    });
    eq(r.status, 200, "status berhasil");
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(guruA);
    ok(row.password_hash, "hash tersimpan");
  });

  // ---------------- sesi login ----------------
  await t("sesi login: menandai sesi aktif dan mengeluarkan perangkat lain", async () => {
    const other = auth.createSession(guruA, {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      ip: "10.1.2.3"
    });
    ok(other, "sesi tambahan dibuat");

    const { r, d } = await api("GET", "/api/instruktur/sesi-login", { token: tokenA });
    eq(r.status, 200, "status");
    const aktif = d.items.find((x) => x.saatIni);
    ok(aktif, "sesi aktif tidak ditandai");
    eq(aktif.terakhir, "Aktif sekarang", "label sesi aktif");
    const lain = d.items.filter((x) => !x.saatIni);
    ok(lain.length >= 1, "sesi lain tidak muncul");

    const kick = await api("POST", `/api/instruktur/sesi-login/${lain[0].id}/keluarkan`, { token: tokenA });
    eq(kick.r.status, 200, "status keluarkan");
    const sesudah = await api("GET", "/api/instruktur/sesi-login", { token: tokenA });
    ok(!sesudah.d.items.some((x) => x.id === lain[0].id), "sesi masih ada setelah dikeluarkan");

    const sendiri = await api("POST", `/api/instruktur/sesi-login/${aktif.id}/keluarkan`, { token: tokenA });
    eq(sendiri.r.status, 400, "keluarkan sesi sendiri");
  });

  await t("sesi login: tidak bisa mengeluarkan sesi akun lain", async () => {
    const sesiB = auth.createSession(guruB);
    ok(sesiB, "sesi B dibuat");
    const listB = await api("GET", "/api/instruktur/sesi-login", { token: tokenB });
    const itemB = listB.d.items.find((x) => !x.saatIni);
    const { r } = await api("POST", `/api/instruktur/sesi-login/${itemB.id}/keluarkan`, { token: tokenA });
    eq(r.status, 404, "status");
  });

  // ---------------- ketersediaan ----------------
  await t("ketersediaan: GET awal kosong dengan preferensi default", async () => {
    const { r, d } = await api("GET", "/api/instruktur/ketersediaan", { token: tokenA });
    eq(r.status, 200, "status");
    eq(d.items, [], "items awal");
    eq(d.jenjang, ["SD", "SMP", "SMK"], "jenjang default");
    eq(d.maxSesi, 3, "maxSesi default");
    eq(d.catatan, "", "catatan default");
  });

  await t("ketersediaan: PUT menyimpan hari dan preferensi", async () => {
    const { r, d } = await api("PUT", "/api/instruktur/ketersediaan", {
      token: tokenA,
      body: {
        items: [
          { hari: 1, aktif: true, mulai: "15:00", selesai: "17:00" },
          { hari: 3, aktif: false, mulai: "16:00", selesai: "18:00" }
        ],
        jenjang: ["SMP", "SMK"],
        maxSesi: 4,
        catatan: "Hindari hari Jumat"
      }
    });
    eq(r.status, 200, "status");
    eq(d.items.length, 2, "jumlah hari");
    eq(d.items[0], { hari: 1, aktif: true, mulai: "15:00", selesai: "17:00" }, "hari 1");
    eq(d.jenjang, ["SMP", "SMK"], "jenjang");
    eq(d.maxSesi, 4, "maxSesi");
    eq(d.catatan, "Hindari hari Jumat", "catatan");

    const lagi = await api("GET", "/api/instruktur/ketersediaan", { token: tokenA });
    eq(lagi.d.items.length, 2, "tersimpan");
  });

  await t("ketersediaan: validasi hari, jam, dan jenjang", async () => {
    const cases = [
      [{ items: [{ hari: 8 }], jenjang: ["SMP"] }, "items[0].hari"],
      [{ items: [{ hari: 1 }, { hari: 1 }], jenjang: ["SMP"] }, "items"],
      [{ items: [{ hari: 2, aktif: true, mulai: "17:00", selesai: "16:00" }], jenjang: ["SMP"] }, "items"],
      [{ items: [], jenjang: [] }, "jenjang"],
      [{ items: [], jenjang: ["SMP"], maxSesi: 0 }, "maxSesi"]
    ];
    for (const [body, field] of cases) {
      const { r, d } = await api("PUT", "/api/instruktur/ketersediaan", { token: tokenA, body });
      eq(r.status, 400, `status ${field}`);
      eq(d.details && d.details.field, field, `field ${field}`);
    }
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
