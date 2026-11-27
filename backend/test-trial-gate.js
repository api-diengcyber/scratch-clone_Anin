"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const trialGate = require("./trial-gate");

test("trial-gate: mengizinkan semua akses jika bukan akun trial (trialTrackId kosong)", () => {
  assert.equal(trialGate.isTaskAllowedForTrial(null, "SD", "p1"), true);
  assert.equal(trialGate.isTaskAllowedForTrial("", "SMP", "py1"), true);
  assert.equal(trialGate.isTaskAllowedForTrial(undefined, "SMK", "wb1"), true);
});

test("trial-gate: aturan sd_basic hanya boleh SD modul p1-p5", () => {
  assert.equal(trialGate.isTaskAllowedForTrial("sd_basic", "SD", "p1"), true);
  assert.equal(trialGate.isTaskAllowedForTrial("sd_basic", "SD", "p5"), true);
  assert.equal(trialGate.isTaskAllowedForTrial("sd_basic", "SD", "g1"), false);
  assert.equal(trialGate.isTaskAllowedForTrial("sd_basic", "SMP", "py1"), false);
});

test("trial-gate: aturan smp_python hanya boleh SMP modul python (py*)", () => {
  assert.equal(trialGate.isTaskAllowedForTrial("smp_python", "SMP", "py1"), true);
  assert.equal(trialGate.isTaskAllowedForTrial("smp_python", "SMP", "py4"), true);
  assert.equal(trialGate.isTaskAllowedForTrial("smp_python", "SMP", "ai1"), false);
  assert.equal(trialGate.isTaskAllowedForTrial("smp_python", "SD", "p1"), false);
});

test("trial-gate: aturan smp_ai hanya boleh SMP modul AI (ai*)", () => {
  assert.equal(trialGate.isTaskAllowedForTrial("smp_ai", "SMP", "ai1"), true);
  assert.equal(trialGate.isTaskAllowedForTrial("smp_ai", "SMP", "ai6"), true);
  assert.equal(trialGate.isTaskAllowedForTrial("smp_ai", "SMP", "py1"), false);
});

test("trial-gate: aturan smk_web hanya boleh SMK modul Web (wb*)", () => {
  assert.equal(trialGate.isTaskAllowedForTrial("smk_web", "SMK", "wb1"), true);
  assert.equal(trialGate.isTaskAllowedForTrial("smk_web", "SMK", "pl1"), false);
});

test("trial-gate: aturan jenjang harus cocok dengan jenjang track", () => {
  assert.equal(trialGate.isTaskAllowedForTrial("smk_algo", "SMK", "pl1"), true);
  assert.equal(trialGate.isTaskAllowedForTrial("smk_algo", "SD", "pl1"), false);
});
