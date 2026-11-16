/*
 * Data CONTOH modul Finance. Bukan data keuangan sebenarnya.
 * Saat backend siap, ganti isi window.DCFinanceData dengan hasil API
 * (bentuk transaksi/pengeluaran di bawah = bentuk yang dibaca finance.js).
 * Kunci paket "Jenjang|Nama jalur" mengikuti kunci di kurikulum.js. Harga hanya contoh.
 */
(function () {
  'use strict';
  const PAKET = {
    'SD|Animasi Sederhana': 350000, 'SD|Seni dari Komputer': 350000, 'SD|Memahat Tanah Liat': 400000,
    'SD|Mendesain Rumah': 400000, 'SD|Animasi ala Peppa Pig': 400000, 'SD|Game Development': 450000,
    'SD|3D & Roblox': 450000, 'SD|Website Development': 450000,
    'SMP|Python Start': 650000, 'SMP|AI & Creative Tech': 750000, 'SMP|Game Dev 3D Lanjutan': 800000,
    'SMK|Python Lanjutan & Algoritma': 900000, 'SMK|Web Development Advanced': 1000000, 'SMK|Data & AI Terapan': 1100000
  };
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const keys = Object.keys(PAKET);
  const METODE = ['Transfer Bank', 'QRIS', 'Tunai', 'Virtual Account'];
  const STATUS = ['paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'pending', 'pending', 'failed', 'refunded'];

  const transaksi = [];
  for (let i = 0; i < 64; i++) {
    const path = pick(keys);
    transaksi.push({
      id: 'TRX-' + (1001 + i), path, harga: PAKET[path],
      diskon: rnd() < 0.25 ? Math.round(PAKET[path] * 0.1 / 1000) * 1000 : 0,
      metode: pick(METODE), status: pick(STATUS), daysAgo: Math.floor(rnd() * 150), pick: Math.floor(rnd() * 1000)
    });
  }

  const KAT = { 'Gaji & Honor': [1500000, 4000000], 'Server & Domain': [250000, 900000], 'Operasional': [150000, 700000], 'Pemasaran': [300000, 1200000], 'Sewa': [1500000, 1500000] };
  const pengeluaran = [];
  for (let i = 0; i < 28; i++) {
    const kat = pick(Object.keys(KAT)), r = KAT[kat];
    pengeluaran.push({ id: 'EXP-' + (501 + i), kategori: kat, nominal: Math.round((r[0] + rnd() * (r[1] - r[0])) / 10000) * 10000, daysAgo: Math.floor(rnd() * 150) });
  }

  // Dipakai hanya bila data siswa asli tidak bisa dimuat (backend belum ada).
  const siswaContoh = ['Alvaro Kenzo', 'Dina Oktavia', 'Fadly Naufal', 'Ayu Lestari', 'Raditya Pratama', 'Bima Saputra', 'Citra Maharani', 'Dimas Prakoso', 'Eka Wulandari', 'Farhan Hidayat']
    .map((nama, i) => ({ id: 'contoh-' + (i + 1), nama, username: nama.toLowerCase().replace(/ /g, '.'), email: '', grades: [['SD'], ['SMP'], ['SMK']][i % 3] }));

  window.DCFinanceData = { simulasi: true, paket: PAKET, transaksi, pengeluaran, siswaContoh };
})();
