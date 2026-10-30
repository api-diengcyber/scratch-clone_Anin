"use strict";

// ------------------------------------------------------------
// MATRIKS HAK AKSES (permission)
//
// Peran yang tersedia: admin, instruktur, siswa, ortu.
// Permission yang dipakai UI Admin (Akses & Hak Pengguna):
//   siswa.kelola            Kelola siswa
//   kurikulum.kelola        Kelola kurikulum & tahap
//   codelab.kelola          Kelola Code Lab
//   tugas.kelola            Buat & ubah tugas
//   tugas.nilai             Menilai tugas
//   badge.kelola            Kelola badge
//   plugin.kelola           Kelola plugin
//   pengaturan.ubah         Ubah pengaturan instansi
//   akses.kelola            Kelola pengguna & hak akses
//   materi.akses            Akses materi & studio coding
//   tugas.kumpul            Mengerjakan & mengumpulkan tugas
//   anak.lihat              Pantau perkembangan siswa
// ------------------------------------------------------------

const PERMISSIONS = [
  "siswa.kelola",
  "kurikulum.kelola",
  "codelab.kelola",
  "tugas.kelola",
  "tugas.nilai",
  "badge.kelola",
  "plugin.kelola",
  "pengaturan.ubah",
  "akses.kelola",
  "materi.akses",
  "tugas.kumpul",
  "anak.lihat"
];

const ROLE_KEYS = ["admin", "instruktur", "siswa", "ortu"];

const DEFAULT_ROLE_PERMISSIONS = {
  admin: [...PERMISSIONS],
  instruktur: ["siswa.kelola", "kurikulum.kelola", "codelab.kelola", "tugas.kelola", "tugas.nilai", "badge.kelola"],
  siswa: ["materi.akses", "tugas.kumpul"],
  ortu: ["anak.lihat"]
};

function permissionsForRole(db, role) {
  const all = { ...DEFAULT_ROLE_PERMISSIONS };
  for (const key of ROLE_KEYS) all[key] = [...(DEFAULT_ROLE_PERMISSIONS[key] || [])];
  all.admin = [...PERMISSIONS]; // admin selalu punya semua hak

  if (role === "admin" || role === "instruktur" || role === "siswa" || role === "ortu") {
    try {
      const row = db.prepare("SELECT permissions FROM admin_role_permissions WHERE role = ?").get(role);
      if (row) {
        let parsed = [];
        try { parsed = JSON.parse(row.permissions); } catch (_) { parsed = []; }
        const list = Array.isArray(parsed) ? parsed.filter((p) => PERMISSIONS.includes(p)) : [];
        if (list.length) all[role] = list;
      }
    } catch (_) { /* tabel belum ada / db error -> pakai default */ }
  }

  if (role === "admin") return [...PERMISSIONS];
  const allowed = Array.isArray(all[role]) ? all[role] : [];
  return [...new Set(allowed)];
}

// Membaca seluruh matrix, dipakai GET /api/admin/roles.
function readRolePermissions(db) {
  const out = {};
  for (const key of ROLE_KEYS) {
    const list = permissionsForRole(db, key);
    out[key] = key === "admin" ? [...PERMISSIONS] : list;
  }
  return out;
}

function normalizeRolePermissions(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    const err = new Error("Body hak akses harus berupa objek peran.");
    err.code = "ADMIN_DATA_INVALID";
    err.field = "roles";
    throw err;
  }
  const out = {};
  for (const role of ["admin", "instruktur", "siswa", "ortu"]) {
    const rawList = Array.isArray(input[role]) ? input[role] : (role === "admin" ? [...PERMISSIONS] : []);
    const clean = [];
    for (const p of rawList) {
      if (typeof p !== "string" || !PERMISSIONS.includes(p)) {
        const err = new Error("Permission tidak dikenal: " + String(p));
        err.code = "ADMIN_DATA_INVALID";
        err.field = "permissions";
        throw err;
      }
      if (!clean.includes(p)) clean.push(p);
    }
    out[role] = role === "admin" ? [...PERMISSIONS] : clean;
  }
  // Instruktur/siswa/ortu tidak boleh hak aksesnya dikosongkan total.
  if (out.instruktur.length === 0) out.instruktur = [...DEFAULT_ROLE_PERMISSIONS.instruktur];
  if (out.siswa.length === 0) out.siswa = [...DEFAULT_ROLE_PERMISSIONS.siswa];
  if (out.ortu.length === 0) out.ortu = [...DEFAULT_ROLE_PERMISSIONS.ortu];
  return out;
}

function roleCan(role, permissions, permission) {
  if (role === "admin") return true;
  if (role !== "instruktur" && role !== "siswa" && role !== "ortu") return false;
  return Array.isArray(permissions) && permissions.includes(permission);
}

module.exports = {
  PERMISSIONS,
  ROLE_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  permissionsForRole,
  readRolePermissions,
  normalizeRolePermissions,
  roleCan
};
