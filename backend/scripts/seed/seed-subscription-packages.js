"use strict";

// ------------------------------------------------------------
// SEED SUBSCRIPTION PACKAGES & PROMOS
//
// Mengisi katalog paket langganan resmi dan kode promo
// sesuai konfigurasi checkout frontend (users/checkout.html).
// Idempoten: aman dijalankan berkali-kali.
// ------------------------------------------------------------

const db = require("../../database");

const PACKAGES = [
  // Jenjang SD
  {
    grade: "SD",
    name: "SD Basic",
    monthlyPrice: 350000
  },
  {
    grade: "SD",
    name: "SD Explore",
    monthlyPrice: 450000
  },
  {
    grade: "SD",
    name: "SD All-in-One",
    monthlyPrice: 600000
  },

  // Jenjang SMP
  {
    grade: "SMP",
    name: "Python Start (SMP)",
    monthlyPrice: 550000
  },
  {
    grade: "SMP",
    name: "AI & Creative Tech (SMP)",
    monthlyPrice: 650000
  },
  {
    grade: "SMP",
    name: "Game Dev 3D Lanjutan (SMP)",
    monthlyPrice: 700000
  },
  {
    grade: "SMP",
    name: "Semua Learning Path (SMP)",
    monthlyPrice: 950000
  },

  // Jenjang SMK / SMA
  {
    grade: "SMK",
    name: "Python Lanjutan (SMA/K)",
    monthlyPrice: 750000
  },
  {
    grade: "SMK",
    name: "Web Development (SMA/K)",
    monthlyPrice: 800000
  },
  {
    grade: "SMK",
    name: "Data & AI Terapan (SMA/K)",
    monthlyPrice: 850000
  },
  {
    grade: "SMK",
    name: "Semua Learning Path (SMA/K)",
    monthlyPrice: 1150000
  }
];

// Diskon durasi sesuai users/checkout.html:
// 1 bulan: 0%
// 3 bulan: 10%
// 6 bulan: 20%
// 12 bulan: 25%
const DURATION_DISCOUNTS = {
  1: 0,
  3: 0.10,
  6: 0.20,
  12: 0.25
};

// Kode promo resmi checkout
const PROMOS = [
  {
    kode: "HEMAT10",
    nama: "Diskon Durasi 10%",
    tipe: "persen",
    nilai: 10,
    jenjang: "",
    mulai: "2026-01-01",
    selesai: "2027-12-31",
    kuota: null,
    aktif: 1
  },
  {
    kode: "SD25K",
    nama: "Potongan Siswa SD Rp 25.000",
    tipe: "nominal",
    nilai: 25000,
    jenjang: "SD",
    mulai: "2026-01-01",
    selesai: "2027-12-31",
    kuota: null,
    aktif: 1
  },
  {
    kode: "DIENGCYBER",
    nama: "Diskon Spesial Dieng Cyber 15%",
    tipe: "persen",
    nilai: 15,
    jenjang: "",
    mulai: "2026-01-01",
    selesai: "2027-12-31",
    kuota: null,
    aktif: 1
  },
  {
    kode: "RUANGKKA",
    nama: "Voucher Siswa Ruang KKA Rp 50.000",
    tipe: "nominal",
    nilai: 50000,
    jenjang: "",
    mulai: "2026-01-01",
    selesai: "2027-12-31",
    kuota: null,
    aktif: 1
  }
];

function seedPackages(database = db) {
  const durations = [1, 3, 6, 12];
  let packageCount = 0;

  const stmtFind = database.prepare(`
    SELECT id FROM subscription_packages WHERE path_key = ? AND months = ?
  `);
  const stmtInsert = database.prepare(`
    INSERT INTO subscription_packages (path_key, path_name, grade, months, price, aktif)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  const stmtUpdate = database.prepare(`
    UPDATE subscription_packages
    SET path_name = ?, grade = ?, price = ?, aktif = 1
    WHERE id = ?
  `);

  database.transaction(() => {
    for (const pkg of PACKAGES) {
      const key = `${pkg.grade}|${pkg.name}`;

      for (const months of durations) {
        const discount = DURATION_DISCOUNTS[months] || 0;
        const baseTotal = pkg.monthlyPrice * months;
        const discountedTotal = Math.round(baseTotal * (1 - discount));

        const existing = stmtFind.get(key, months);
        if (existing) {
          stmtUpdate.run(pkg.name, pkg.grade, discountedTotal, existing.id);
        } else {
          stmtInsert.run(key, pkg.name, pkg.grade, months, discountedTotal);
        }
        packageCount++;
      }
    }
  })();

  return packageCount;
}

function seedPromos(database = db) {
  let promoCount = 0;
  const stmtFind = database.prepare(`
    SELECT id FROM finance_promos WHERE kode = ? COLLATE NOCASE
  `);
  const stmtInsert = database.prepare(`
    INSERT INTO finance_promos (kode, nama, tipe, nilai, jenjang, mulai, selesai, kuota, aktif)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const stmtUpdate = database.prepare(`
    UPDATE finance_promos
    SET nama = ?, tipe = ?, nilai = ?, jenjang = ?, mulai = ?, selesai = ?, kuota = ?, aktif = ?
    WHERE id = ?
  `);

  database.transaction(() => {
    for (const promo of PROMOS) {
      const existing = stmtFind.get(promo.kode);
      if (existing) {
        stmtUpdate.run(
          promo.nama,
          promo.tipe,
          promo.nilai,
          promo.jenjang,
          promo.mulai,
          promo.selesai,
          promo.kuota,
          promo.aktif,
          existing.id
        );
      } else {
        stmtInsert.run(
          promo.kode,
          promo.nama,
          promo.tipe,
          promo.nilai,
          promo.jenjang,
          promo.mulai,
          promo.selesai,
          promo.kuota,
          promo.aktif
        );
      }
      promoCount++;
    }
  })();

  return promoCount;
}

if (require.main === module) {
  try {
    const pkgs = seedPackages();
    const prms = seedPromos();
    console.log(`[SEED] Berhasil menginjeksi ${pkgs} paket langganan dan ${prms} kode promo checkout.`);
  } catch (err) {
    console.error("[SEED] Gagal seeding paket langganan:", err);
    process.exit(1);
  }
}

module.exports = {
  seedPackages,
  seedPromos,
  PACKAGES,
  DURATION_DISCOUNTS,
  PROMOS
};
