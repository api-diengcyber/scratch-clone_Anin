/*
 * DATA CONTOH (DUMMY) untuk halaman "Pantau Siswa".
 * Dipakai HANYA kalau endpoint /api/instruktur/siswa belum tersedia (404/405/501).
 * Isinya bukan data siswa sungguhan. Hapus file ini kalau backend sudah siap.
 *
 * Bentuk yang diharapkan dari backend (supaya mudah dicocokkan nanti):
 *   GET /api/instruktur/siswa      -> { items: [{ id, nama, username, avatarUrl, grade: "SD"|"SMP"|"SMK",
 *                                                 pathId, pathName, progress (0-100), tasksDone, tasksTotal,
 *                                                 lastActive (ISO), pendingReview, status? }] }
 *   GET /api/instruktur/siswa/:id  -> { item, aktivitas: [{ at, teks }],
 *                                       tugas: [{ id, judul, status: "menunggu"|"sedang_dinilai"|"revisi"|"selesai", nilai, submittedAt }],
 *                                       kehadiran: { hadir, izin, alpa, riwayat: [{ tanggal, judul, status: "hadir"|"izin"|"alpa" }] } }
 *   Backend yang menentukan siswa mana yang boleh dilihat instruktur (hanya yang menjadi tanggung jawabnya).
 */
(function () {
  'use strict';
  const daysAgo = (n, h) => new Date(Date.now() - n * 864e5 - (h || 0) * 36e5).toISOString();
  const S = (id, nama, grade, pathId, pathName, progress, done, total, last, pending) =>
    ({ id, nama, username: nama.toLowerCase().replace(/\s+/g, '_'), avatarUrl: '', grade, pathId, pathName, progress, tasksDone: done, tasksTotal: total, lastActive: last, pendingReview: pending });

  const DATA = () => [
    S('c1', 'Aulia Rahma',    'SMP', 'python', 'Python Start',               72, 26, 36, daysAgo(0, 2), 2),
    S('c2', 'Bima Pratama',   'SMP', 'python', 'Python Start',               18,  6, 36, daysAgo(9),    0),
    S('c3', 'Citra Lestari',  'SMK', 'pl',     'Python Lanjutan & Algoritma', 55, 20, 36, daysAgo(1),    1),
    S('c4', 'Dimas Saputra',  'SMK', 'pl',     'Python Lanjutan & Algoritma',  8,  3, 36, daysAgo(18),   0),
    S('c5', 'Evi Maharani',   'SD',  'basic',  'Animasi Sederhana',           90, 18, 20, daysAgo(0, 5), 0),
    S('c6', 'Fajar Nugroho',  'SD',  'basic',  'Animasi Sederhana',           40,  8, 20, daysAgo(3),    1),
    S('c7', 'Galih Ramadhan', 'SMP', 'python', 'Python Start',               100, 36, 36, daysAgo(2),    0),
    S('c8', 'Hana Safitri',   'SMK', 'pl',     'Python Lanjutan & Algoritma', 63, 23, 36, daysAgo(6),    3)
  ];

  window.DCSiswaMock = {
    list() { return DATA(); },
    detail(id) {
      const item = DATA().find((x) => x.id === id) || DATA()[0];
      const n = Math.min(6, Math.max(item.pendingReview + 2, item.tasksDone > 0 ? 2 : 0));
      const tugas = Array.from({ length: n }, (_, i) => {
        const p = item.pendingReview, status = i < p ? 'menunggu' : (i === p && item.progress < 60) ? 'revisi' : (i === p + 1 && item.progress < 80) ? 'sedang_dinilai' : 'selesai';
        return { id: item.id + '-t' + (i + 1), judul: 'Task ' + (item.tasksDone - i) + ' · ' + item.pathName, status,
          nilai: status === 'selesai' ? 70 + ((i * 7 + item.progress) % 30) : null, submittedAt: daysAgo(i * 2 + 1) };
      });
      const aktivitas = Array.from({ length: 6 }, (_, i) => ({ at: daysAgo(i * 2, i), teks: i % 3 === 0 ? 'Menyelesaikan Task ' + (item.tasksDone - i) : i % 3 === 1 ? 'Membuka materi ' + item.pathName : 'Mengumpulkan tugas tambahan' }));
      const riwayat = Array.from({ length: 6 }, (_, i) => ({ tanggal: daysAgo(i * 7).slice(0, 10), judul: 'Mentoring Zoom pertemuan ' + (6 - i), status: i === 2 && item.progress < 30 ? 'alpa' : i === 4 ? 'izin' : 'hadir' }));
      const c = (s) => riwayat.filter((r) => r.status === s).length;
      return { item, aktivitas, tugas, kehadiran: { hadir: c('hadir'), izin: c('izin'), alpa: c('alpa'), riwayat } };
    }
  };
})();
