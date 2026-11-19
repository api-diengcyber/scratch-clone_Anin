/*
 * Finance Calc: SATU-SATUNYA tempat angka keuangan dihitung (fungsi murni, tanpa DOM, tanpa storage).
 * Ringkasan, Laporan, dan Anggaran wajib memanggil modul ini, bukan menghitung sendiri.
 *
 * Masukan (`data`), semua tanggal berformat ISO yyyy-mm-dd:
 *   trx      transaksi siswa  {id, tanggal, status, total, diskon, harga, jenjang, jalur, ...}
 *   expenses pengeluaran perusahaan lokal {id, tanggal, kategori, nominal, status: submitted|approved|paid|rejected}
 *   serverExpenses pengeluaran dari API   {id, tanggal, kategori, nominal, ref?}   (dianggap sudah keluar kas)
 *   income   pemasukan lain {id, tanggal, kategori, nominal}
 *   payroll  {id, periode, status: draft|paid, tanggalBayar, pokok, tunjangan, bonus, potongan, nama}
 *   budget   {id, periode (yyyy-mm), kategori, jumlah}
 *
 * Aturan (dijaga di sini, bukan di UI):
 *  - Pemasukan = transaksi siswa berstatus paid (nilai `total`, sudah setelah diskon) + pemasukan lain.
 *    Pembayaran siswa TIDAK pernah disalin ke pemasukan lain, jadi tidak terhitung ganda.
 *  - Pengeluaran kas = pengeluaran lokal berstatus paid + pengeluaran server + payroll berstatus paid (total bersih).
 *  - Kategori "Gaji & Honor" hanya boleh berasal dari Payroll. Baris kategori itu dari sumber lain diabaikan
 *    dan dilaporkan di `warnings`.
 *  - Pengeluaran server dan lokal yang menunjuk `ref` yang sama dihitung sekali (server diutamakan).
 *  - Baris bertanda _src === 'sample' dikecualikan, kecuali opts.includeSample === true (mode demo).
 *  - Pending, failed, refunded tidak dihitung sebagai pemasukan. Refund sebagian belum dimodelkan.
 *  - Semua nominal dibulatkan ke rupiah utuh.
 */
(function () {
  'use strict';

  const PAYROLL_CAT = 'Gaji & Honor', STUDENT_CAT = 'Pembayaran Siswa';
  const n = (v) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? x : 0; };
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  const arr = (v) => (Array.isArray(v) ? v : []);

  /** Gaji bersih = pokok + tunjangan + bonus − potongan (tidak pernah negatif). */
  const net = (r) => Math.max(0, n(r.pokok) + n(r.tunjangan) + n(r.bonus) - n(r.potongan));

  /** Tanggal valid dan berada dalam [from, to]; batas kosong berarti tidak dibatasi. */
  function inRange(d, from, to) {
    if (!isIso(d)) return false;
    return (!from || d >= from) && (!to || d <= to);
  }

  const usable = (r, opts) => !!r && (opts.includeSample || r._src !== 'sample');

  function resolveOpts(opts) {
    const o = opts || {};
    return { from: o.from || '', to: o.to || '', kategori: o.kategori || '', includeSample: !!o.includeSample };
  }

  /** Daftar arus kas keluar yang sudah dinormalisasi dan bebas duplikat. */
  function expenseLines(data, opts) {
    const o = resolveOpts(opts), warnings = [], lines = [];
    const server = arr(data.serverExpenses).filter((r) => usable(r, o));
    const serverRefs = new Set(server.map((r) => String(r.ref || r.id || '')).filter(Boolean));

    server.forEach((r) => {
      if (r.kategori === PAYROLL_CAT) { warnings.push({ code: 'SERVER_GAJI_DIABAIKAN', id: r.id, nominal: n(r.nominal) }); return; }
      lines.push({ sumber: 'server', id: r.id, tanggal: r.tanggal, kategori: r.kategori || 'Lainnya', nominal: n(r.nominal) });
    });
    arr(data.expenses).filter((r) => usable(r, o) && r.status === 'paid').forEach((r) => {
      if (r.kategori === PAYROLL_CAT) { warnings.push({ code: 'LOKAL_GAJI_DIABAIKAN', id: r.id, nominal: n(r.nominal) }); return; }
      if (r.ref && serverRefs.has(String(r.ref))) { warnings.push({ code: 'DUPLIKAT_DIABAIKAN', id: r.id, nominal: n(r.nominal) }); return; }
      lines.push({ sumber: 'perusahaan', id: r.id, tanggal: r.tanggal, kategori: r.kategori || 'Lainnya', nominal: n(r.nominal) });
    });
    arr(data.payroll).filter((r) => usable(r, o) && r.status === 'paid').forEach((r) => {
      lines.push({ sumber: 'payroll', id: r.id, tanggal: r.tanggalBayar, kategori: PAYROLL_CAT, nominal: net(r) });
    });

    const kept = lines.filter((l) => inRange(l.tanggal, o.from, o.to) && (!o.kategori || l.kategori === o.kategori));
    return { lines: kept, warnings };
  }

  /** Daftar arus kas masuk: pembayaran siswa lunas + pemasukan lain. */
  function incomeLines(data, opts) {
    const o = resolveOpts(opts), lines = [];
    arr(data.trx).filter((r) => usable(r, o) && r.status === 'paid').forEach((r) => {
      lines.push({ sumber: 'siswa', id: r.id, tanggal: r.tanggal, kategori: STUDENT_CAT, nominal: n(r.total) });
    });
    arr(data.income).filter((r) => usable(r, o)).forEach((r) => {
      lines.push({ sumber: 'lain', id: r.id, tanggal: r.tanggal, kategori: r.kategori || 'Lainnya', nominal: n(r.nominal) });
    });
    return lines.filter((l) => inRange(l.tanggal, o.from, o.to) && (!o.kategori || l.kategori === o.kategori));
  }

  function groupBy(lines) {
    const m = {};
    lines.forEach((l) => { const k = m[l.kategori] || (m[l.kategori] = { kategori: l.kategori, total: 0, count: 0 }); k.total += l.nominal; k.count++; });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }

  /** Transaksi siswa pada periode (semua status), untuk laporan transaksi dan hitungan status. */
  function studentTrx(data, opts) {
    const o = resolveOpts(opts);
    return arr(data.trx).filter((r) => usable(r, o) && inRange(r.tanggal, o.from, o.to));
  }

  function summary(data, opts) {
    const inc = incomeLines(data, opts), ex = expenseLines(data, opts), T = studentTrx(data, opts);
    const paid = T.filter((x) => x.status === 'paid'), pend = T.filter((x) => x.status === 'pending');
    const siswa = sum(inc.filter((l) => l.sumber === 'siswa'), (l) => l.nominal);
    const lain = sum(inc.filter((l) => l.sumber === 'lain'), (l) => l.nominal);
    const keluar = sum(ex.lines, (l) => l.nominal);
    const cnt = (s) => T.filter((x) => x.status === s).length;
    return {
      pemasukan: { siswa, lain, total: siswa + lain, perKategori: groupBy(inc) },
      pengeluaran: { total: keluar, perKategori: groupBy(ex.lines), perSumber: { perusahaan: sum(ex.lines.filter((l) => l.sumber === 'perusahaan'), (l) => l.nominal), server: sum(ex.lines.filter((l) => l.sumber === 'server'), (l) => l.nominal), payroll: sum(ex.lines.filter((l) => l.sumber === 'payroll'), (l) => l.nominal) } },
      laba: siswa + lain - keluar,
      diskon: sum(paid, (x) => n(x.diskon)),
      menunggu: { total: sum(pend, (x) => n(x.total)), count: pend.length },
      transaksi: { total: T.length, paid: cnt('paid'), pending: cnt('pending'), failed: cnt('failed'), refunded: cnt('refunded') },
      perJenjang: ['SD', 'SMP', 'SMK'].map((g) => ({ grade: g, total: sum(paid.filter((x) => x.jenjang === g), (x) => n(x.total)), count: paid.filter((x) => x.jenjang === g).length })),
      warnings: ex.warnings
    };
  }

  /** Laporan laba rugi: pendapatan per kategori, beban per kategori, laba bersih. */
  function labaRugi(data, opts) {
    const s = summary(data, opts);
    return {
      pendapatan: s.pemasukan.perKategori, totalPendapatan: s.pemasukan.total,
      beban: s.pengeluaran.perKategori, totalBeban: s.pengeluaran.total,
      labaBersih: s.laba, marginPersen: s.pemasukan.total ? Math.round((s.laba / s.pemasukan.total) * 1000) / 10 : 0,
      warnings: s.warnings
    };
  }

  /** Deret harian/bulanan untuk grafik; kunci memakai tanggal yang sama dengan arus kas. */
  function series(data, opts, bucket) {
    const inc = incomeLines(data, opts), ex = expenseLines(data, opts).lines, len = bucket === 'month' ? 7 : 10, m = {};
    inc.forEach((l) => { const k = l.tanggal.slice(0, len); (m[k] || (m[k] = { key: k, masuk: 0, keluar: 0 })).masuk += l.nominal; });
    ex.forEach((l) => { const k = l.tanggal.slice(0, len); (m[k] || (m[k] = { key: k, masuk: 0, keluar: 0 })).keluar += l.nominal; });
    return Object.values(m).sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Laporan payroll per periode (yyyy-mm). Draft ditampilkan tetapi tidak masuk pengeluaran. */
  function payrollReport(data, opts) {
    const o = resolveOpts(opts), p = opts && opts.periode ? opts.periode : '';
    const rows = arr(data.payroll).filter((r) => usable(r, o) && (!p || r.periode === p) && (!opts || !opts.status || r.status === opts.status))
      .map((r) => ({ ...r, bersih: net(r) }));
    const paid = rows.filter((r) => r.status === 'paid'), draft = rows.filter((r) => r.status !== 'paid');
    return { rows, totalDibayar: sum(paid, (r) => r.bersih), totalDraft: sum(draft, (r) => r.bersih), countDibayar: paid.length, countDraft: draft.length,
      komponen: { pokok: sum(paid, (r) => n(r.pokok)), tunjangan: sum(paid, (r) => n(r.tunjangan)), bonus: sum(paid, (r) => n(r.bonus)), potongan: sum(paid, (r) => n(r.potongan)) } };
  }

  /**
   * Realisasi anggaran per kategori untuk satu bulan (yyyy-mm).
   * Realisasi memakai arus kas keluar yang SAMA dengan summary(); komitmen = pengeluaran lokal berstatus approved.
   */
  function budgetRealization(data, periode, opts) {
    const o = { ...resolveOpts(opts), from: periode + '-01', to: periode + '-31' };
    const real = {}, kom = {};
    expenseLines(data, o).lines.forEach((l) => { real[l.kategori] = (real[l.kategori] || 0) + l.nominal; });
    arr(data.expenses).filter((r) => usable(r, o) && r.status === 'approved' && inRange(r.tanggal, o.from, o.to) && r.kategori !== PAYROLL_CAT)
      .forEach((r) => { kom[r.kategori] = (kom[r.kategori] || 0) + n(r.nominal); });
    const bud = arr(data.budget).filter((b) => usable(b, o) && b.periode === periode);
    const cats = [...new Set(bud.map((b) => b.kategori).concat(Object.keys(real), Object.keys(kom)))];
    const rows = cats.map((k) => {
      const b = bud.find((x) => x.kategori === k), a = b ? n(b.jumlah) : 0, r = real[k] || 0, pct = a ? Math.round((r / a) * 100) : 0;
      return { id: b ? b.id : '', kategori: k, anggaran: a, real: r, komit: kom[k] || 0, sisa: a - r, pct, st: !b ? 'none' : pct > 100 ? 'over' : pct >= 80 ? 'warn' : 'ok' };
    });
    return { rows, totalAnggaran: sum(rows, (r) => r.anggaran), totalRealisasi: sum(rows, (r) => r.real), totalKomitmen: sum(rows, (r) => r.komit) };
  }

  /**
   * Pemeriksaan konsistensi (dipakai pengujian dan halaman Laporan):
   * jumlah rincian harus sama dengan total, id ganda dalam satu sumber, dan baris dengan tanggal tidak valid.
   */
  function reconcile(data, opts) {
    const issues = [], s = summary(data, opts), ex = expenseLines(data, opts);
    const catTotal = sum(s.pengeluaran.perKategori, (k) => k.total), incTotal = sum(s.pemasukan.perKategori, (k) => k.total);
    if (catTotal !== s.pengeluaran.total) issues.push({ code: 'TOTAL_PENGELUARAN_TIDAK_COCOK', selisih: s.pengeluaran.total - catTotal });
    if (incTotal !== s.pemasukan.total) issues.push({ code: 'TOTAL_PEMASUKAN_TIDAK_COCOK', selisih: s.pemasukan.total - incTotal });
    const bySource = (lines, src) => lines.filter((l) => l.sumber === src).map((l) => l.id);
    [['siswa', incomeLines(data, opts)], ['lain', incomeLines(data, opts)], ['perusahaan', ex.lines], ['server', ex.lines], ['payroll', ex.lines]].forEach(([src, lines]) => {
      const ids = bySource(lines, src), dup = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dup.length) issues.push({ code: 'ID_GANDA', sumber: src, ids: [...new Set(dup)] });
    });
    const bad = []
      .concat(arr(data.trx).filter((r) => r.status === 'paid' && !isIso(r.tanggal)).map((r) => r.id))
      .concat(arr(data.expenses).filter((r) => r.status === 'paid' && !isIso(r.tanggal)).map((r) => r.id))
      .concat(arr(data.payroll).filter((r) => r.status === 'paid' && !isIso(r.tanggalBayar)).map((r) => r.id));
    if (bad.length) issues.push({ code: 'TANGGAL_TIDAK_VALID', ids: bad });
    s.warnings.forEach((w) => issues.push({ code: w.code, id: w.id }));
    return { ok: issues.length === 0, issues };
  }

  window.DCFinanceCalc = Object.freeze({ PAYROLL_CAT, STUDENT_CAT, net, inRange, expenseLines, incomeLines, studentTrx, summary, labaRugi, series, payrollReport, budgetRealization, reconcile });
})();
