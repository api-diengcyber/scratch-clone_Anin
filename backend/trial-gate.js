"use strict";

// ------------------------------------------------------------
// TRIAL ACCESS CONTROL (SERVER-SIDE TRIAL GATE)
//
// Memvalidasi apakah modul/tugas yang diakses siswa trial
// sesuai dengan learning track yang didaftarkan.
// Sinkron dengan aturan frontend di users/shared/js/trial-gate.js
// ------------------------------------------------------------

function isTaskAllowedForTrial(trialTrackId, grade, moduleId) {
  // Jika akun bukan trial / tidak ada batasan track, diizinkan
  if (!trialTrackId) return true;

  const track = String(trialTrackId).trim();
  const mod = String(moduleId || "").toLowerCase();
  const g = String(grade || "").toUpperCase();

  // 🎒 Jenjang SD
  if (track === "sd_basic") {
    // Hanya boleh jenjang SD dan modul p1-p5
    if (g && g !== "SD") return false;
    return ["p1", "p2", "p3", "p4", "p5"].includes(mod);
  }

  if (track === "sd_explore_game") {
    if (g && g !== "SD") return false;
    return ["g1", "g2", "g3"].includes(mod);
  }

  if (track === "sd_explore_3d") {
    if (g && g !== "SD") return false;
    return ["p8", "d1"].includes(mod);
  }

  if (track === "sd_explore_web") {
    if (g && g !== "SD") return false;
    return ["p9", "wb1"].includes(mod);
  }

  // 🎮 Jenjang SMP
  if (track === "smp_python") {
    if (g && g !== "SMP") return false;
    return mod.startsWith("py");
  }

  if (track === "smp_ai") {
    if (g && g !== "SMP") return false;
    return mod.startsWith("ai");
  }

  if (track === "smp_gamedev3d") {
    if (g && g !== "SMP") return false;
    return mod.startsWith("d");
  }

  // 💻 Jenjang SMA / SMK
  if (track === "smk_algo") {
    if (g && g !== "SMK") return false;
    return mod.startsWith("pl");
  }

  if (track === "smk_web") {
    if (g && g !== "SMK") return false;
    return mod.startsWith("wb");
  }

  if (track === "smk_data") {
    if (g && g !== "SMK") return false;
    return mod.startsWith("da");
  }

  // Fallback: izinkan jika track tidak dikenali
  return true;
}

module.exports = {
  isTaskAllowedForTrial
};
