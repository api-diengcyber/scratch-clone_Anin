/* Daftar nama view SPA Admin yang boleh dibuka lewat URL bersih /admin/<view>.
   Dipakai server.js untuk menyajikan Admin/index.html saat halaman di-refresh
   atau dibuka langsung (deep link). Daftar ini harus memuat semua nama di
   VIEWS pada Admin/static/kurikulum.js; test-spa.js memeriksa keduanya agar
   tidak kembali tidak sinkron (mis. view finance baru yang lupa didaftarkan). */
"use strict";

module.exports = [
  "dashboard",
  "kurikulum",
  "materi",
  "tahap",
  "plugin",
  "siswa",
  "badge",
  "tugas",
  "instruktur",
  "pengaturan",
  "akses",
  "profil",
  "finance",
  "finance-siswa",
  "finance-bayar",
  "finance-invoice",
  "finance-paket",
  "finance-promo",
  "finance-pemasukan",
  "finance-pengeluaran",
  "finance-payroll",
  "finance-anggaran",
  "finance-setting",
  // Legacy: URL lama /admin/jadwal tetap membuka SPA (tidak ada view khusus).
  "jadwal"
];
