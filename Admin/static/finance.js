/* Modul Finance (frontend): Ringkasan Finance, Transaksi Siswa, dan Pembayaran.
   Sumber data: /api/admin/finance/summary, /transactions, dan /expenses.
   Bila server tidak bisa dihubungi, halaman memakai data contoh finance-data.js
   dan menampilkan penanda "Data contoh" (verifikasi/pengeluaran hanya lokal). */
(function () {
  'use strict';
  const D = window.DCFinanceData || null;

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rp = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const toast = (m, t) => { if (typeof showToast === 'function') showToast(m, t); };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const shift = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const shiftIso = (s, n) => { const x = new Date(s + 'T00:00:00'); x.setDate(x.getDate() + n); return iso(x); };
  const wibDate = (v) => {
    try { return new Date(v).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }
    catch (_) { return iso(today()); }
  };
  const fmt = (s) => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const GRADE = { SD: 'SD', SMP: 'SMP', SMK: 'SMA / SMK' };
  const ST = {
    paid: ['Lunas', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'],
    pending: ['Menunggu', 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'],
    failed: ['Gagal', 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'],
    refunded: ['Dikembalikan', 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300']
  };
  // BD = gaya badge yang dipakai tabel Pembayaran/Invoice (memisahkan pending manual vs gateway).
  const BD = {
    paid: ['Lunas', 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30', 'bg-emerald-500'],
    verif: ['Menunggu Verifikasi', 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30', 'bg-amber-500'],
    gateway: ['Menunggu Gateway', 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe] dark:bg-[#3b82f6]/10 dark:text-[#93c5fd] dark:border-[#3b82f6]/30', 'bg-[#3b82f6]'],
    failed: ['Gagal', 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30', 'bg-rose-500'],
    refunded: ['Dikembalikan', 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600', 'bg-slate-400']
  };
  // Menerima status (string) maupun objek transaksi.
  const badge = (x) => {
    const s = typeof x === 'string' ? x : x.status;
    const k = s === 'pending' ? (MANUAL.includes(typeof x === 'string' ? '' : x.metode) ? 'verif' : 'gateway') : s;
    const d = BD[k] || BD.refunded;
    return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap ' + d[1] + '"><span class="w-1.5 h-1.5 rounded-full ' + d[2] + '"></span>' + d[0] + '</span>';
  };
  const CARD = 'rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900';
  const BTN = 'px-3.5 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-jade-50 dark:hover:bg-slate-800';
  const AB = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-400';
  const AB_VIEW = AB + ' border-jade-200 dark:border-jade-500/40 text-jade-700 dark:text-jade-300 hover:bg-jade-50 dark:hover:bg-jade-500/10';
  const AB_OK = AB + ' border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700';
  const AB_NO = AB + ' border-rose-200 dark:border-rose-500/40 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10';
  const btnDetail = (id) => '<button type="button" data-fin-detail="' + esc(id) + '" class="' + AB_VIEW + '"><i class="fa-solid fa-eye"></i>Detail</button>';
  const IB = 'inline-flex items-center justify-center w-9 h-9 rounded-xl border text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-400';
  const ib = (attr, id, icon, cls, label) => '<button type="button" ' + attr + '="' + esc(id) + '" title="' + label + '" aria-label="' + label + ' ' + esc(id) + '" class="' + IB + ' ' + cls + '"><i class="fa-solid ' + icon + '"></i></button>';
  const IBTN = 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800';
  const btnOk = (id) => ib('data-fin-verify', id, 'fa-check', 'bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/30', 'Verifikasi');
  const btnNo = (id) => ib('data-fin-reject', id, 'fa-xmark', 'bg-rose-50 border-rose-100 text-rose-500 hover:bg-rose-100 dark:bg-rose-500/10 dark:border-rose-500/30', 'Tolak');
  const actions = (x) => '<div class="flex items-center justify-end gap-1.5">' + ib('data-fin-detail', x.id, 'fa-eye', IBTN, 'Lihat detail') + (x.status === 'pending' && MANUAL.includes(x.metode) ? btnOk(x.id) + btnNo(x.id) : '') + '</div>';
  const FIELD = 'px-3 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200';
  const iconBtn = (attr, id, icon, title) => '<button type="button" data-fin-' + attr + '="' + esc(id) + '" title="' + title + '" aria-label="' + title + '" class="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"><i class="fa-solid ' + icon + '"></i></button>';

  // ---------- data ----------
  let siswa = [], trx = [], exp = [], demoMode = false, demoReason = '', ready = null, activeView = '';
  let byId = new Map();
  const OV_KEY = 'dc-finance-status', MANUAL = ['Transfer Bank', 'Tunai'];
  let OV = (function () { try { return JSON.parse(localStorage.getItem(OV_KEY)) || {}; } catch (_) { return {}; } })();
  const saveOv = () => { try { localStorage.setItem(OV_KEY, JSON.stringify(OV)); } catch (_) {} };
  const api = (p, o) => window.DCAdminApi.request(p, o);
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  async function loadUsers() {
    let list = [];
    try { const r = await api('/api/admin/users?limit=100'); list = r.users || r.items || r.data || []; } catch (_) {}
    return list.filter((u) => u.status !== 'deleted').map((u) => ({
      id: u.id,
      nama: u.full_name || u.username || 'Siswa #' + u.id,
      username: u.username || '',
      email: u.email || '',
      grades: (u.allowedGrades || []).map(String)
    }));
  }

  function mapTrx(x) {
    const s = byId.get(String(x.studentId)) || {};
    return {
      rid: x.id,
      id: x.code || ('TRX-' + x.id),
      tanggal: x.paidOn || (x.createdAt ? wibDate(x.createdAt) : iso(today())),
      // Tanggal pencatatan/invoice: tetap memakai waktu transaksi dibuat, bukan tanggal bayar.
      dibuat: x.createdAt ? wibDate(x.createdAt) : iso(today()),
      siswa: {
        id: x.studentId,
        nama: x.studentName || s.nama || ('Siswa #' + x.studentId),
        username: x.studentUsername || s.username || '',
        email: s.email || ''
      },
      jenjang: x.grade || '',
      jalur: x.learningPathName || x.learningPathId || '',
      path: x.learningPathId || '',
      harga: Number(x.price || 0),
      diskon: Number(x.discount || 0),
      total: Number(x.total || 0),
      metode: x.method || '',
      status: x.status || 'pending',
      catatan: x.note || ''
    };
  }

  function mapExp(x) {
    return {
      rid: x.id,
      id: x.code || ('EXP-' + x.id),
      kategori: x.kategori || '',
      nominal: Number(x.nominal || 0),
      tanggal: x.tanggal || '',
      catatan: x.catatan || ''
    };
  }

  async function fetchAll(pathname, params = {}) {
    const out = [];
    for (let page = 1; page <= 50; page++) {
      const qs = new URLSearchParams({ ...params, page: String(page), limit: '100' });
      const r = await api(pathname + '?' + qs.toString());
      const items = r.items || [];
      out.push(...items);
      if (!items.length || page >= (r.pages || 1)) break;
    }
    return out;
  }

  function resolveDemo() {
    if (!D) { siswa = []; trx = []; exp = []; return; }
    siswa = (D.siswaContoh || []).slice();
    const t = today();
    trx = (D.transaksi || []).map((x) => {
      const jenjang = x.path.split('|')[0];
      const pool = siswa.filter((s) => s.grades.includes(jenjang));
      const s = (pool.length ? pool : siswa)[x.pick % (pool.length || siswa.length)];
      const o = OV[x.id];
      const dibuat = iso(shift(t, -x.daysAgo));
      return {
        ...x, rid: x.id, status: o ? o.status : x.status, catatan: o ? o.note : '',
        tanggal: dibuat, dibuat, jenjang, jalur: x.path.split('|')[1] || '',
        siswa: s, total: Math.max(0, x.harga - x.diskon)
      };
    });
    exp = (D.pengeluaran || []).map((e) => ({ ...e, rid: e.id, tanggal: iso(shift(t, -e.daysAgo)) }));
  }

  async function loadData() {
    if (!window.DCAdminApi) {
      demoMode = true;
      demoReason = 'Klien API Admin tidak termuat.';
      resolveDemo();
      return;
    }
    try {
      const [users, txRows, expRows] = await Promise.all([
        loadUsers(),
        fetchAll('/api/admin/finance/transactions'),
        fetchAll('/api/admin/finance/expenses')
      ]);
      siswa = users;
      byId = new Map(siswa.map((s) => [String(s.id), s]));
      trx = txRows.map(mapTrx);
      exp = expRows.map(mapExp);
      demoMode = false;
      demoReason = '';
    } catch (err) {
      demoMode = true;
      demoReason = 'Data keuangan server tidak bisa dimuat (' + (err.message || 'tidak diketahui') + ').';
      resolveDemo();
    }
  }

  async function reloadExpenses() {
    if (demoMode) return;
    exp = (await fetchAll('/api/admin/finance/expenses')).map(mapExp);
  }

  function init() {
    if (!ready) ready = loadData();
    return ready;
  }

  // ---------- util ----------
  function csv(rows, cols) {
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    return '\ufeff' + [cols.map((c) => q(c[0])).join(',')].concat(rows.map((r) => cols.map((c) => q(c[1](r))).join(','))).join('\r\n');
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const TRX_COLS = [['ID Transaksi', (r) => r.id], ['Tanggal', (r) => r.tanggal], ['Nama Siswa', (r) => r.siswa.nama], ['Jenjang', (r) => GRADE[r.jenjang]], ['Learning Path', (r) => r.jalur],
    ['Harga Awal', (r) => r.harga], ['Diskon', (r) => r.diskon], ['Total Pembayaran', (r) => r.total], ['Metode', (r) => r.metode], ['Status', (r) => ST[r.status][0]]];
  const banner = () => demoMode
    ? '<div class="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"><i class="fa-solid fa-flask mr-2"></i><b>Data contoh.</b> ' + esc(demoReason || 'Server finance belum bisa dihubungi.') + ' Angka di halaman ini bukan data keuangan sebenarnya, dan perubahan hanya tersimpan di browser ini. <button type="button" data-fin="reload" class="font-semibold underline ml-1">Coba lagi</button></div>'
    : '';
  const head = (title, sub, extra) => '<div class="flex flex-wrap items-end justify-between gap-3"><div><h1 class="text-xl font-extrabold text-slate-900 dark:text-white">' + title + '</h1><p class="text-sm text-slate-500 dark:text-slate-400">' + sub + '</p></div>' + (extra || '') + '</div>';

  // ================= RINGKASAN FINANCE =================
  const P = { key: 'month', from: '', to: '' };
  const PERIODS = [['today', 'Hari ini'], ['week', 'Minggu ini'], ['month', 'Bulan ini'], ['year', 'Tahun ini'], ['custom', 'Pilih tanggal']];

  function range() {
    const t = today();
    if (P.key === 'today') return [iso(t), iso(t)];
    if (P.key === 'week') return [iso(shift(t, -((t.getDay() + 6) % 7))), iso(t)];
    if (P.key === 'month') return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(t)];
    if (P.key === 'year') return [iso(new Date(t.getFullYear(), 0, 1)), iso(t)];
    return [P.from, P.to];
  }
  const within = (d, r) => d >= r[0] && d <= r[1];

  function chartBuckets(r, masuk, keluar) {
    const a = new Date(r[0] + 'T00:00:00'), b = new Date(r[1] + 'T00:00:00');
    const daily = (b - a) / 864e5 <= 45, B = [], idx = {};
    for (let d = new Date(a); d <= b; d = daily ? shift(d, 1) : new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const k = iso(d).slice(0, daily ? 10 : 7);
      if (idx[k] === undefined) { idx[k] = B.length; B.push({ k, label: daily ? d.getDate() + '/' + (d.getMonth() + 1) : d.toLocaleDateString('id-ID', { month: 'short' }), in: 0, out: 0 }); }
    }
    const key = (s) => s.slice(0, daily ? 10 : 7);
    masuk.forEach((v, d) => { const i = idx[key(d)]; if (i !== undefined) B[i].in += v; });
    keluar.forEach((v, d) => { const i = idx[key(d)]; if (i !== undefined) B[i].out += v; });
    const max = Math.max(1, ...B.map((x) => Math.max(x.in, x.out))), W = 640, H = 220, pad = 28, bw = (W - pad * 2) / B.length;
    const step = Math.ceil(B.length / 12);
    const bars = B.map((x, i) => {
      const h1 = (x.in / max) * (H - 50), h2 = (x.out / max) * (H - 50), bx = pad + i * bw, w = Math.max(2, bw * 0.34);
      return '<rect x="' + (bx + bw * 0.12) + '" y="' + (H - 24 - h1) + '" width="' + w + '" height="' + h1 + '" rx="2" fill="#10b981"><title>' + x.label + ' · masuk ' + rp(x.in) + '</title></rect>' +
        '<rect x="' + (bx + bw * 0.12 + w + 1) + '" y="' + (H - 24 - h2) + '" width="' + w + '" height="' + h2 + '" rx="2" fill="#fb7185"><title>' + x.label + ' · keluar ' + rp(x.out) + '</title></rect>' +
        (i % step === 0 ? '<text x="' + (bx + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="#94a3b8">' + x.label + '</text>' : '');
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="w-full h-auto" role="img" aria-label="Grafik pemasukan dan pengeluaran">' +
      '<text x="' + pad + '" y="12" font-size="10" fill="#94a3b8">Maks. ' + rp(max) + '</text><line x1="' + pad + '" y1="' + (H - 24) + '" x2="' + (W - pad) + '" y2="' + (H - 24) + '" stroke="#e2e8f0"/>' + bars + '</svg>';
  }

  // Bentuk data sama dengan respons /api/admin/finance/summary, dipakai saat
  // server belum bisa dihubungi atau saat ringkasan server gagal dimuat.
  function localSummary(r) {
    const T = trx.filter((x) => within(x.tanggal, r));
    const E = exp.filter((x) => within(x.tanggal, r));
    const paid = T.filter((x) => x.status === 'paid'), pend = T.filter((x) => x.status === 'pending');
    const pemasukan = sum(paid, (x) => x.total), pengeluaran = sum(E, (x) => x.nominal);
    const kat = {}, masuk = {}, keluar = {};
    E.forEach((x) => {
      kat[x.kategori] = (kat[x.kategori] || 0) + x.nominal;
      keluar[x.tanggal] = (keluar[x.tanggal] || 0) + x.nominal;
    });
    paid.forEach((x) => { masuk[x.tanggal] = (masuk[x.tanggal] || 0) + x.total; });
    const harian = [];
    for (let d = r[0]; d <= r[1]; d = shiftIso(d, 1)) harian.push({ tanggal: d, masuk: masuk[d] || 0, keluar: keluar[d] || 0 });
    const count = (s) => T.filter((x) => x.status === s).length;
    return {
      from: r[0], to: r[1], pemasukan, pengeluaran, laba: pemasukan - pengeluaran,
      diskon: sum(paid, (x) => x.diskon),
      transaksi: {
        total: T.length, paid: count('paid'), pending: count('pending'),
        failed: count('failed'), refunded: count('refunded'),
        pemasukan, menunggu: sum(pend, (x) => x.total)
      },
      menunggu: { total: sum(pend, (x) => x.total), count: pend.length },
      perJenjang: ['SD', 'SMP', 'SMK'].map((grade) => ({
        grade,
        total: sum(paid.filter((x) => x.jenjang === grade), (x) => x.total),
        count: paid.filter((x) => x.jenjang === grade).length
      })),
      pengeluaranKategori: Object.entries(kat).sort((a, b) => b[1] - a[1]).map(([kategori, total]) => ({
        kategori, total, count: E.filter((x) => x.kategori === kategori).length
      })),
      harian
    };
  }

  async function summaryFor(r) {
    if (!demoMode) {
      try {
        return await api('/api/admin/finance/summary?from=' + encodeURIComponent(r[0]) + '&to=' + encodeURIComponent(r[1]));
      } catch (err) {
        toast('Ringkasan server gagal dimuat: ' + err.message, 'error');
      }
    }
    return localSummary(r);
  }

  async function drawOverview() {
    const v = $('#view-finance'), r = range();
    const bad = P.key === 'custom' && (!r[0] || !r[1] || r[0] > r[1]);
    const S = bad ? null : await summaryFor(r);
    const inc = S ? S.pemasukan : 0, out = S ? S.pengeluaran : 0, laba = S ? S.laba : 0;
    const trxSum = S ? S.transaksi : { total: 0, paid: 0, pending: 0, failed: 0, refunded: 0, pemasukan: 0, menunggu: 0 };
    const pend = S ? S.menunggu : { total: 0, count: 0 };
    const byJ = S ? S.perJenjang : ['SD', 'SMP', 'SMK'].map((grade) => ({ grade, total: 0, count: 0 }));
    const byK = S ? S.pengeluaranKategori : [];
    const masuk = new Map(), keluar = new Map();
    (S ? S.harian : []).forEach((x) => { masuk.set(x.tanggal, x.masuk); keluar.set(x.tanggal, x.keluar); });
    const card = (label, val, tone, icon) => '<div class="' + CARD + ' p-4"><div class="flex items-center justify-between"><span class="text-sm text-slate-500 dark:text-slate-400">' + label + '</span><i class="fa-solid ' + icon + ' ' + tone + '"></i></div><div class="mt-2 text-xl font-extrabold text-slate-900 dark:text-white">' + val + '</div></div>';
    const dist = (rows, total, color) => rows.map((q) => '<div class="mb-2"><div class="flex justify-between text-sm"><span class="text-slate-600 dark:text-slate-300">' + esc(q[0]) + '</span><span class="font-semibold text-slate-800 dark:text-slate-100">' + rp(q[1]) + '</span></div><div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 mt-1"><div class="h-2 rounded-full" style="width:' + (total ? Math.round(q[1] / total * 100) : 0) + '%;background:' + color + '"></div></div></div>').join('') || '<p class="text-sm text-slate-400">Belum ada data pada periode ini.</p>';
    const recent = trx.filter((x) => within(x.tanggal, r)).sort((a, b) => b.tanggal.localeCompare(a.tanggal) || String(b.id).localeCompare(String(a.id))).slice(0, 8);
    const listExp = exp.filter((x) => within(x.tanggal, r)).sort((a, b) => b.tanggal.localeCompare(a.tanggal) || String(b.rid).localeCompare(String(a.rid)));
    v.innerHTML = head('Ringkasan Finance', 'Pemasukan = pembayaran siswa berstatus Lunas. Laba bersih = pemasukan dikurangi pengeluaran pada periode.',
      '<button type="button" data-fin="export-overview" class="' + BTN + '"><i class="fa-solid fa-file-arrow-down mr-1.5"></i>Export laporan</button>') + banner() +
      '<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Periode">' + PERIODS.map((p) => '<button type="button" data-fin-period="' + p[0] + '" aria-pressed="' + (P.key === p[0]) + '" class="px-3.5 py-2 rounded-xl text-sm font-semibold ' + (P.key === p[0] ? 'bg-jade-600 text-white' : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-jade-50 dark:hover:bg-slate-800') + '">' + p[1] + '</button>').join('') +
      (P.key === 'custom' ? '<input type="date" data-fin-date="from" value="' + esc(P.from) + '" class="' + FIELD + '" aria-label="Dari tanggal"><span class="text-slate-400">–</span><input type="date" data-fin-date="to" value="' + esc(P.to) + '" class="' + FIELD + '" aria-label="Sampai tanggal">' : '') + '</div>' +
      (bad ? '<p class="text-sm text-rose-600">Isi kedua tanggal, dan pastikan tanggal akhir tidak lebih awal dari tanggal awal.</p>' : '') +
      '<div class="grid grid-cols-2 xl:grid-cols-4 gap-3">' + card('Total pemasukan', rp(inc), 'text-emerald-500', 'fa-arrow-trend-up') + card('Total pengeluaran', rp(out), 'text-rose-500', 'fa-arrow-trend-down') +
      card('Laba bersih', (laba < 0 ? '−' : '') + rp(Math.abs(laba)), laba < 0 ? 'text-rose-500' : 'text-jade-600', 'fa-scale-balanced') + card('Pembayaran menunggu', rp(pend.total) + ' <span class="text-sm font-semibold text-slate-400">(' + pend.count + ')</span>', 'text-amber-500', 'fa-hourglass-half') + '</div>' +
      '<div class="grid lg:grid-cols-3 gap-3"><div class="' + CARD + ' p-4 lg:col-span-2"><div class="flex items-center justify-between mb-2"><h2 class="font-bold text-slate-800 dark:text-white">Pemasukan dan pengeluaran</h2><span class="text-xs text-slate-500"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 mr-1"></span>Masuk <span class="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400 ml-3 mr-1"></span>Keluar</span></div>' + (bad ? '' : chartBuckets(r, masuk, keluar)) + '</div>' +
      '<div class="' + CARD + ' p-4"><h2 class="font-bold text-slate-800 dark:text-white mb-3">Sumber pemasukan per jenjang</h2>' + dist(byJ.map((q) => [GRADE[q.grade], q.total]), inc, '#10b981') + '</div></div>' +
      '<div class="grid md:grid-cols-2 gap-3"><div class="' + CARD + ' p-4"><h2 class="font-bold text-slate-800 dark:text-white mb-3">Student Finance</h2><dl class="grid grid-cols-2 gap-y-2 text-sm"><dt class="text-slate-500">Transaksi</dt><dd class="font-semibold text-right">' + trxSum.total + '</dd><dt class="text-slate-500">Lunas</dt><dd class="font-semibold text-right">' + trxSum.paid + '</dd><dt class="text-slate-500">Menunggu</dt><dd class="font-semibold text-right">' + trxSum.pending + '</dd><dt class="text-slate-500">Gagal / dikembalikan</dt><dd class="font-semibold text-right">' + (trxSum.failed + trxSum.refunded) + '</dd><dt class="text-slate-500">Total diskon (lunas)</dt><dd class="font-semibold text-right">' + rp(S ? S.diskon : 0) + '</dd></dl></div>' +
      '<div class="' + CARD + ' p-4"><h2 class="font-bold text-slate-800 dark:text-white mb-3">Company Finance: pengeluaran per kategori</h2>' + dist(byK.map((q) => [q.kategori, q.total]), out, '#fb7185') + '</div></div>' +
      '<div class="' + CARD + ' p-4"><div class="flex items-center justify-between mb-3"><h2 class="font-bold text-slate-800 dark:text-white">Transaksi terbaru</h2><a href="#" data-view="finance-siswa" class="text-sm font-semibold text-jade-600">Lihat semua</a></div><div class="overflow-x-auto"><table class="w-full text-sm min-w-[640px]"><thead><tr class="text-left text-slate-500"><th class="py-2 pr-3 font-semibold">ID</th><th class="pr-3 font-semibold">Tanggal</th><th class="pr-3 font-semibold">Nama</th><th class="pr-3 font-semibold">Keterangan</th><th class="pr-3 font-semibold">Kategori</th><th class="pr-3 font-semibold text-right">Nominal</th><th class="font-semibold">Status</th></tr></thead><tbody>' +
      (recent.map((x) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2 pr-3 font-mono text-xs">' + esc(x.id) + '</td><td class="pr-3 whitespace-nowrap">' + fmt(x.tanggal) + '</td><td class="pr-3">' + esc(x.siswa.nama) + '</td><td class="pr-3">' + esc(x.jalur) + '</td><td class="pr-3">Student Finance</td><td class="pr-3 text-right whitespace-nowrap">' + rp(x.total) + '</td><td>' + badge(x.status) + '</td></tr>').join('') || '<tr><td colspan="7" class="py-6 text-center text-slate-400">Belum ada transaksi pada periode ini.</td></tr>') + '</tbody></table></div></div>' +
      '<div class="' + CARD + ' p-4"><div class="flex flex-wrap items-center justify-between gap-2 mb-3"><div><h2 class="font-bold text-slate-800 dark:text-white">Pengeluaran operasional</h2><p class="text-xs text-slate-500 dark:text-slate-400">Tambah, ubah, atau hapus pengeluaran pada periode ini.</p></div><button type="button" data-fin-expense="new" class="' + BTN + '"><i class="fa-solid fa-plus mr-1.5"></i>Tambah pengeluaran</button></div><div class="overflow-x-auto"><table class="w-full text-sm min-w-[680px]"><thead><tr class="text-left text-slate-500"><th class="py-2 pr-3 font-semibold">ID</th><th class="pr-3 font-semibold">Tanggal</th><th class="pr-3 font-semibold">Kategori</th><th class="pr-3 font-semibold">Catatan</th><th class="pr-3 font-semibold text-right">Nominal</th><th class="font-semibold">Aksi</th></tr></thead><tbody>' +
      (listExp.map((x) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2.5 pr-3 font-mono text-xs">' + esc(x.id) + '</td><td class="pr-3 whitespace-nowrap">' + fmt(x.tanggal) + '</td><td class="pr-3">' + esc(x.kategori) + '</td><td class="pr-3 text-slate-500 dark:text-slate-400">' + esc(x.catatan || '–') + '</td><td class="pr-3 text-right whitespace-nowrap font-semibold">' + rp(x.nominal) + '</td><td><div class="flex gap-1">' + iconBtn('expense-edit', x.rid, 'fa-pen', 'Ubah') + iconBtn('expense-del', x.rid, 'fa-trash-can', 'Hapus') + '</div></td></tr>').join('') || '<tr><td colspan="6" class="py-6 text-center text-slate-400">Belum ada pengeluaran pada periode ini.</td></tr>') + '</tbody></table></div></div>';
    v._rows = trx.filter((x) => within(x.tanggal, r));
  }

  // ================= TRANSAKSI SISWA =================
  const S = { q: '', status: '', jenjang: '', path: '', from: '', to: '', sort: 'tanggal', dir: -1, page: 1, size: 10 };
  const COLS = [['id', 'ID Transaksi'], ['tanggal', 'Tanggal'], ['nama', 'Nama Siswa'], ['jenjang', 'Jenjang'], ['jalur', 'Learning Path'], ['total', 'Total'], ['metode', 'Metode'], ['status', 'Status']];
  const val = (x, k) => (k === 'nama' ? x.siswa.nama : x[k]);

  function pathOptions() {
    const m = new Map();
    trx.forEach((x) => { if (x.path) m.set(x.path, (x.jenjang ? GRADE[x.jenjang] : '') + ' · ' + (x.jalur || x.path)); });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'id'));
  }

  function filtered() {
    const q = S.q.trim().toLowerCase();
    const rows = trx.filter((x) => (!q || (x.id + ' ' + x.siswa.nama + ' ' + x.jalur).toLowerCase().includes(q)) && (!S.status || x.status === S.status) && (!S.jenjang || x.jenjang === S.jenjang) && (!S.path || x.path === S.path) && (!S.from || x.tanggal >= S.from) && (!S.to || x.tanggal <= S.to));
    return rows.sort((a, b) => { const x = val(a, S.sort), y = val(b, S.sort); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'id')) * S.dir || String(a.id).localeCompare(String(b.id)); });
  }

  function drawTable() {
    const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / S.size));
    S.page = Math.min(S.page, pages);
    const slice = rows.slice((S.page - 1) * S.size, S.page * S.size);
    $('#finTable').innerHTML = '<thead><tr class="text-left text-slate-500">' + COLS.map((c) => '<th class="py-2 pr-3 font-semibold whitespace-nowrap" aria-sort="' + (S.sort === c[0] ? (S.dir > 0 ? 'ascending' : 'descending') : 'none') + '"><button type="button" data-fin-sort="' + c[0] + '" class="font-semibold hover:text-jade-600">' + c[1] + (S.sort === c[0] ? (S.dir > 0 ? ' ↑' : ' ↓') : '') + '</button></th>').join('') + '<th class="py-2 font-semibold">Aksi</th></tr></thead><tbody>' +
      (slice.map((x) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2.5 pr-3 font-mono text-xs">' + esc(x.id) + '</td><td class="pr-3 whitespace-nowrap">' + fmt(x.tanggal) + '</td><td class="pr-3">' + esc(x.siswa.nama) + '</td><td class="pr-3">' + GRADE[x.jenjang] + '</td><td class="pr-3">' + esc(x.jalur) + '</td><td class="pr-3 whitespace-nowrap font-semibold">' + rp(x.total) + '</td><td class="pr-3 whitespace-nowrap">' + esc(x.metode) + '</td><td class="pr-3">' + badge(x.status) + '</td><td>' + btnDetail(x.id) + '</td></tr>').join('') ||
        '<tr><td colspan="9" class="py-10 text-center text-slate-400">Tidak ada transaksi yang cocok. <button type="button" data-fin="reset" class="text-jade-600 font-semibold">Reset filter</button></td></tr>') + '</tbody>';
    $('#finPager').innerHTML = '<span class="text-sm text-slate-500">' + rows.length + ' transaksi · halaman ' + S.page + ' dari ' + pages + '</span><span class="flex gap-2"><button type="button" data-fin-page="-1" class="' + BTN + '" ' + (S.page <= 1 ? 'disabled style="opacity:.4"' : '') + '>Sebelumnya</button><button type="button" data-fin-page="1" class="' + BTN + '" ' + (S.page >= pages ? 'disabled style="opacity:.4"' : '') + '>Berikutnya</button></span>';
  }

  function drawSiswa() {
    const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>';
    $('#view-finance-siswa').innerHTML = head('Transaksi Siswa', 'Pembelian Learning Path oleh siswa. Data diambil dari catatan keuangan di server.', '<button type="button" data-fin="export-trx" class="' + BTN + '"><i class="fa-solid fa-file-arrow-down mr-1.5"></i>Export CSV</button>') + banner() +
      '<div class="' + CARD + ' p-4 space-y-3"><div class="grid sm:grid-cols-2 lg:grid-cols-6 gap-2">' +
      '<input type="search" data-fin-f="q" value="' + esc(S.q) + '" placeholder="Cari ID, nama, atau jalur" aria-label="Cari transaksi" class="' + FIELD + ' lg:col-span-2">' +
      '<select data-fin-f="status" aria-label="Status" class="' + FIELD + '">' + opt('', 'Semua status', S.status) + Object.keys(ST).map((k) => opt(k, ST[k][0], S.status)).join('') + '</select>' +
      '<select data-fin-f="jenjang" aria-label="Jenjang" class="' + FIELD + '">' + opt('', 'Semua jenjang', S.jenjang) + Object.keys(GRADE).map((k) => opt(k, GRADE[k], S.jenjang)).join('') + '</select>' +
      '<select data-fin-f="path" aria-label="Learning Path" class="' + FIELD + ' lg:col-span-2">' + opt('', 'Semua Learning Path', S.path) + pathOptions().map(([k, l]) => opt(k, l, S.path)).join('') + '</select>' +
      '</div><div class="flex flex-wrap items-center gap-2 text-sm text-slate-500"><span>Tanggal</span><input type="date" data-fin-f="from" value="' + esc(S.from) + '" aria-label="Dari tanggal" class="' + FIELD + '"><span>–</span><input type="date" data-fin-f="to" value="' + esc(S.to) + '" aria-label="Sampai tanggal" class="' + FIELD + '"><button type="button" data-fin="reset" class="text-jade-600 font-semibold ml-1">Reset filter</button></div></div>' +
      '<div class="' + CARD + ' p-4"><div class="overflow-x-auto"><table id="finTable" class="w-full text-sm min-w-[860px]"></table></div><div id="finPager" class="flex flex-wrap items-center justify-between gap-2 mt-3"></div></div>';
    drawTable();
  }

  function openDetail(id) {
    const x = trx.find((t) => t.id === id); if (!x) return;
    let m = $('#finModal');
    if (!m) { m = document.createElement('div'); m.id = 'finModal'; document.body.appendChild(m); }
    const row = (k, v) => '<div class="flex justify-between gap-4 py-2 border-t border-slate-100 dark:border-slate-800 text-sm"><span class="text-slate-500">' + k + '</span><span class="font-semibold text-right text-slate-800 dark:text-slate-100">' + v + '</span></div>';
    m.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50';
    m.innerHTML = '<div role="dialog" aria-modal="true" aria-label="Detail transaksi" class="' + CARD + ' w-full max-w-md max-h-[90vh] overflow-y-auto p-5"><div class="flex items-start justify-between mb-3"><div><div class="font-mono text-xs text-slate-500">' + esc(x.id) + '</div><h2 class="text-lg font-extrabold text-slate-900 dark:text-white">Detail transaksi</h2></div><button type="button" data-fin="close" aria-label="Tutup" class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-xmark"></i></button></div>' +
      row('Nama siswa', esc(x.siswa.nama)) + row('Username', esc(x.siswa.username || '–')) + row('Email', esc(x.siswa.email || '–')) + row('Jenjang', GRADE[x.jenjang]) + row('Learning Path', esc(x.jalur)) + row('Tanggal', fmt(x.tanggal)) + row('Harga awal', rp(x.harga)) + row('Diskon', x.diskon ? '− ' + rp(x.diskon) : '–') + row('Total pembayaran', rp(x.total)) + row('Metode', esc(x.metode)) + row('Status', badge(x)) + (x.catatan ? row('Catatan', esc(x.catatan)) : '') +
      '<p class="mt-3 text-xs text-slate-400">' + (demoMode ? 'Data contoh; perubahan status hanya tersimpan di browser ini.' : 'Status pembayaran diubah lewat menu Pembayaran.') + '</p></div>';
    const c = $('[data-fin="close"]', m); if (c) c.focus();
  }
  const closeDetail = () => { const m = $('#finModal'); if (m) { m.className = 'hidden'; m.innerHTML = ''; } };

  // ================= PENGELUARAN =================
  const closeExpense = () => { const m = $('#finExpModal'); if (m) { m.className = 'hidden'; m.innerHTML = ''; } };

  function openExpense(id) {
    const cur = id ? exp.find((x) => String(x.rid) === String(id)) : null;
    let m = $('#finExpModal');
    if (!m) { m = document.createElement('div'); m.id = 'finExpModal'; document.body.appendChild(m); }
    const field = (name, label, value, type = 'text', extra = '') => '<label class="block"><span class="text-xs font-semibold text-slate-500 dark:text-slate-400">' + label + '</span><input name="' + name + '" type="' + type + '" value="' + esc(value == null ? '' : value) + '" ' + extra + ' class="' + FIELD + ' w-full mt-1"></label>';
    m.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50';
    m.innerHTML = '<div role="dialog" aria-modal="true" aria-label="Pengeluaran" class="' + CARD + ' w-full max-w-md max-h-[90vh] overflow-y-auto p-5"><div class="flex items-start justify-between mb-3"><div><div class="font-mono text-xs text-slate-500">' + esc(cur ? cur.id : 'Pengeluaran baru') + '</div><h2 class="text-lg font-extrabold text-slate-900 dark:text-white">' + (cur ? 'Ubah pengeluaran' : 'Tambah pengeluaran') + '</h2></div><button type="button" data-fin="close-exp" aria-label="Tutup" class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<form data-fin-expform data-id="' + esc(cur ? String(cur.rid) : '') + '" class="space-y-3">' +
      field('kategori', 'Kategori', cur ? cur.kategori : '', 'text', 'placeholder="mis. Gaji & Honor" required') +
      field('nominal', 'Nominal (Rp)', cur ? cur.nominal : '', 'number', 'min="1" step="1" required') +
      field('tanggal', 'Tanggal', cur ? cur.tanggal : iso(today()), 'date', 'required') +
      field('catatan', 'Catatan (opsional)', cur ? cur.catatan : '', 'text', 'maxlength="500"') +
      '<div class="flex justify-end gap-2 pt-2"><button type="button" data-fin="close-exp" class="' + BTN + '">Batal</button><button type="submit" class="px-3.5 py-2 rounded-xl text-sm font-semibold bg-jade-600 text-white hover:bg-jade-700">' + (cur ? 'Simpan' : 'Tambah') + '</button></div></form></div>';
    const first = $('[name="kategori"]', m); if (first) first.focus();
  }

  async function saveExpense(form) {
    const body = {
      kategori: (form.kategori.value || '').trim(),
      nominal: Number(form.nominal.value),
      tanggal: form.tanggal.value || iso(today()),
      catatan: (form.catatan.value || '').trim()
    };
    if (!body.kategori) return toast('Kategori wajib diisi.', 'error');
    if (!Number.isInteger(body.nominal) || body.nominal < 1) return toast('Nominal harus angka bulat lebih dari 0.', 'error');
    const id = form.dataset.id;
    try {
      if (demoMode) {
        if (id) { const x = exp.find((e) => String(e.rid) === String(id)); if (x) Object.assign(x, body); }
        else exp.push({ rid: 'local-' + Date.now(), id: 'EXP-' + (9000 + exp.length), ...body });
      } else if (id) {
        await api('/api/admin/finance/expenses/' + encodeURIComponent(id), { method: 'PATCH', body });
        await reloadExpenses();
      } else {
        await api('/api/admin/finance/expenses', { method: 'POST', body });
        await reloadExpenses();
      }
      closeExpense();
      await drawOverview();
      toast(id ? 'Pengeluaran diperbarui.' : 'Pengeluaran ditambahkan.');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function deleteExpense(id) {
    const x = exp.find((e) => String(e.rid) === String(id)); if (!x) return;
    if (!(await window.dcConfirm({ title: 'Hapus pengeluaran?', message: 'Catatan pengeluaran ini akan hilang dari laporan.', detail: fmt(x.tanggal) + ' · ' + x.kategori + ' · ' + rp(x.nominal), confirmText: 'Hapus', tone: 'danger' }))) return;
    try {
      if (demoMode) exp = exp.filter((e) => String(e.rid) !== String(id));
      else { await api('/api/admin/finance/expenses/' + encodeURIComponent(id), { method: 'DELETE' }); await reloadExpenses(); }
      await drawOverview();
      toast('Pengeluaran dihapus.');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ================= PEMBAYARAN (verifikasi manual) =================
  const B = { q: '', status: 'pending', page: 1, size: 15 };
  function drawBayar() {
    const sumTotal = (a) => a.reduce((n, x) => n + x.total, 0);
    const pm = trx.filter((x) => x.status === 'pending' && MANUAL.includes(x.metode)), pg = trx.filter((x) => x.status === 'pending' && !MANUAL.includes(x.metode));
    const processed = demoMode ? Object.keys(OV).length : trx.filter((x) => x.status !== 'pending').length;
    const card = (l, v, sub2) => '<div class="' + CARD + ' p-4"><div class="text-sm text-slate-500 dark:text-slate-400">' + l + '</div><div class="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">' + v + '</div><div class="text-xs text-slate-400 mt-0.5">' + sub2 + '</div></div>';
    const opt = (v, l) => '<option value="' + v + '"' + (B.status === v ? ' selected' : '') + '>' + l + '</option>';
    $('#view-finance-bayar').innerHTML = head('Pembayaran', 'Verifikasi pembayaran manual (transfer bank dan tunai). Pembayaran lewat gateway menunggu konfirmasi otomatis dari penyedia.',
      demoMode ? '<button type="button" data-fin="reset-demo" class="' + BTN + '">Reset status contoh</button>' : '') + banner() +
      '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' + card('Menunggu verifikasi admin', pm.length, rp(sumTotal(pm))) + card('Menunggu gateway', pg.length, 'Konfirmasi otomatis dari penyedia') + card('Sudah diproses', processed, 'Lunas, gagal, atau dikembalikan') + '</div>' +
      '<div class="' + CARD + ' p-4 space-y-3"><div class="grid sm:grid-cols-3 gap-2"><input type="search" data-fin-b="q" value="' + esc(B.q) + '" placeholder="Cari ID, nama, atau jalur" aria-label="Cari pembayaran" class="' + FIELD + ' sm:col-span-2"><select data-fin-b="status" aria-label="Status" class="' + FIELD + '">' + opt('pending', 'Menunggu') + opt('', 'Semua status') + opt('paid', 'Lunas') + opt('failed', 'Gagal') + opt('refunded', 'Dikembalikan') + '</select></div>' +
      '<div class="overflow-x-auto"><table id="finPay" class="w-full text-sm min-w-[960px]"></table></div><div id="finPayPager" class="flex flex-wrap items-center justify-between gap-2"></div></div>';
    drawPay();
  }
  function drawPay() {
    const q = B.q.trim().toLowerCase();
    const rows = trx.filter((x) => (!B.status || x.status === B.status) && (!q || (x.id + ' ' + x.siswa.nama + ' ' + x.jalur).toLowerCase().includes(q))).sort((a, b) => b.tanggal.localeCompare(a.tanggal) || String(b.id).localeCompare(String(a.id)));
    const pages = Math.max(1, Math.ceil(rows.length / B.size)); B.page = Math.min(B.page, pages);
    $('#finPay').innerHTML = '<thead><tr class="text-left text-slate-500"><th class="py-2 pr-3 font-semibold">ID</th><th class="pr-3 font-semibold">Tanggal</th><th class="pr-3 font-semibold">Nama Siswa</th><th class="pr-3 font-semibold">Learning Path</th><th class="pr-3 font-semibold">Total</th><th class="pr-3 font-semibold">Metode</th><th class="pr-3 font-semibold">Status</th><th class="font-semibold text-right">Aksi</th></tr></thead><tbody>' +
      (rows.slice((B.page - 1) * B.size, B.page * B.size).map((x) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2.5 pr-3 font-mono text-xs">' + esc(x.id) + '</td><td class="pr-3 whitespace-nowrap">' + fmt(x.tanggal) + '</td><td class="pr-3">' + esc(x.siswa.nama) + '</td><td class="pr-3">' + esc(x.jalur) + '</td><td class="pr-3 whitespace-nowrap font-semibold">' + rp(x.total) + '</td><td class="pr-3 whitespace-nowrap">' + esc(x.metode) + '</td><td class="pr-3">' + badge(x) + '</td><td>' + actions(x) + '</td></tr>').join('') || '<tr><td colspan="8" class="py-10 text-center text-slate-400">Tidak ada pembayaran pada filter ini.</td></tr>') + '</tbody>';
    $('#finPayPager').innerHTML = '<span class="text-sm text-slate-500">' + rows.length + ' pembayaran · halaman ' + B.page + ' dari ' + pages + '</span><span class="flex gap-2"><button type="button" data-fin-bpage="-1" class="' + BTN + '" ' + (B.page <= 1 ? 'disabled style="opacity:.4"' : '') + '>Sebelumnya</button><button type="button" data-fin-bpage="1" class="' + BTN + '" ' + (B.page >= pages ? 'disabled style="opacity:.4"' : '') + '>Berikutnya</button></span>';
  }
  async function decide(id, ok) {
    const x = trx.find((t) => t.id === id); if (!x || x.status !== 'pending' || !MANUAL.includes(x.metode)) return;
    const info = x.id + ' · ' + x.siswa.nama + ' · ' + rp(x.total);
    let note = 'Diverifikasi admin';
    if (ok) { if (!(await window.dcConfirm({ title: 'Verifikasi pembayaran?', message: info, detail: 'Status berubah menjadi Lunas dan masuk ke pemasukan.', confirmText: 'Ya, verifikasi', cancelText: 'Batal', tone: 'success' }))) return; }
    else { const r = await window.dcPrompt({ title: 'Tolak pembayaran', message: info, placeholder: 'Alasan penolakan, mis. bukti transfer tidak sesuai', confirmText: 'Tolak pembayaran' }); if (r === null) return; if (!String(r).trim()) return toast('Alasan penolakan wajib diisi.', 'error'); note = 'Ditolak: ' + String(r).trim(); }
    try {
      if (demoMode) {
        OV[id] = { status: ok ? 'paid' : 'failed', note, at: iso(today()) };
        saveOv(); resolveDemo();
      } else {
        const res = await api('/api/admin/finance/transactions/' + encodeURIComponent(x.rid), { method: 'PATCH', body: ok ? { status: 'paid' } : { status: 'failed', note } });
        Object.assign(x, mapTrx(res.item));
      }
      drawBayar();
      if ($('#finInv')) drawInv();
      toast(ok ? 'Pembayaran ' + id + ' diverifikasi.' : 'Pembayaran ' + id + ' ditolak.');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ================= INVOICE & TAGIHAN =================
  // Satu invoice per transaksi. Statusnya diturunkan dari status transaksi, jadi selalu
  // sinkron dengan menu Pembayaran. Jatuh tempo 7 hari setelah tanggal transaksi.
  const DUE_DAYS = 7, I = { q: '', status: '', page: 1, size: 10 };
  const INV = { open: ['Belum Dibayar', 'verif'], overdue: ['Jatuh Tempo', 'failed'], paid: ['Lunas', 'paid'], void: ['Dibatalkan', 'refunded'], refunded: ['Dikembalikan', 'refunded'] };
  const invBadge = (k) => { const d = BD[INV[k][1]]; return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap ' + d[1] + '"><span class="w-1.5 h-1.5 rounded-full ' + d[2] + '"></span>' + INV[k][0] + '</span>'; };
  function invoices() {
    const t = iso(today());
    return trx.map((x) => {
      const terbit = x.dibuat || x.tanggal;
      const due = shiftIso(terbit, DUE_DAYS);
      const k = x.status === 'paid' ? 'paid' : x.status === 'pending' ? (due < t ? 'overdue' : 'open') : x.status === 'failed' ? 'void' : 'refunded';
      return { no: 'INV-' + String(x.id).replace(/^TRX-/, ''), trx: x, terbit, due, k, sisa: k === 'open' || k === 'overdue' ? x.total : 0 };
    });
  }
  const invActions = (v) => '<div class="flex items-center justify-end gap-1.5">' + ib('data-fin-inv', v.trx.id, 'fa-eye', IBTN, 'Lihat invoice') + ib('data-fin-print', v.trx.id, 'fa-print', IBTN, 'Cetak invoice') + '</div>';
  const invFiltered = () => { const q = I.q.trim().toLowerCase(); return invoices().filter((v) => (!I.status || v.k === I.status) && (!q || (v.no + ' ' + v.trx.siswa.nama + ' ' + v.trx.jalur).toLowerCase().includes(q))).sort((a, b) => b.terbit.localeCompare(a.terbit) || b.no.localeCompare(a.no)); };

  function drawInvoice() {
    const all = invoices(), sum2 = (a, f) => a.reduce((n, v) => n + f(v), 0), od = all.filter((v) => v.k === 'overdue'), op = all.filter((v) => v.k === 'open');
    const card = (l, v, sub2) => '<div class="' + CARD + ' p-4"><div class="text-sm text-slate-500 dark:text-slate-400">' + l + '</div><div class="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">' + v + '</div><div class="text-xs text-slate-400 mt-0.5">' + sub2 + '</div></div>';
    const opt = (v, l) => '<option value="' + v + '"' + (I.status === v ? ' selected' : '') + '>' + l + '</option>';
    $('#view-finance-invoice').innerHTML = head('Invoice & Tagihan', 'Satu invoice untuk setiap transaksi siswa. Jatuh tempo ' + DUE_DAYS + ' hari setelah tanggal terbit.', '<button type="button" data-fin="export-inv" class="' + BTN + '"><i class="fa-solid fa-file-arrow-down mr-1.5"></i>Export CSV</button>') + banner() +
      '<div class="grid grid-cols-2 xl:grid-cols-4 gap-3">' + card('Sisa tagihan terbuka', rp(sum2(all, (v) => v.sisa)), (op.length + od.length) + ' invoice belum lunas') + card('Jatuh tempo', od.length, rp(sum2(od, (v) => v.sisa))) + card('Belum dibayar', op.length, 'Masih dalam masa tagihan') + card('Lunas', all.filter((v) => v.k === 'paid').length, 'Dari ' + all.length + ' invoice') + '</div>' +
      '<div class="' + CARD + ' p-4 space-y-3"><div class="grid sm:grid-cols-3 gap-2"><input type="search" data-fin-i="q" value="' + esc(I.q) + '" placeholder="Cari no. invoice, nama, atau jalur" aria-label="Cari invoice" class="' + FIELD + ' sm:col-span-2"><select data-fin-i="status" aria-label="Status invoice" class="' + FIELD + '">' + opt('', 'Semua status') + opt('open', 'Belum Dibayar') + opt('overdue', 'Jatuh Tempo') + opt('paid', 'Lunas') + opt('void', 'Dibatalkan') + opt('refunded', 'Dikembalikan') + '</select></div>' +
      '<div class="overflow-x-auto"><table id="finInv" class="w-full text-sm min-w-[1000px]"></table></div><div id="finInvPager" class="flex flex-wrap items-center justify-between gap-2"></div></div>';
    drawInv();
  }
  function drawInv() {
    const rows = invFiltered(), pages = Math.max(1, Math.ceil(rows.length / I.size)); I.page = Math.min(I.page, pages);
    $('#finInv').innerHTML = '<thead><tr class="text-slate-500">' + ['No. Invoice', 'Nama Siswa', 'Learning Path', 'Terbit', 'Jatuh Tempo', 'Total', 'Sisa Tagihan', 'Status', 'Aksi'].map((h) => '<th class="py-2 font-semibold whitespace-nowrap">' + h + '</th>').join('') + '</tr></thead><tbody>' +
      (rows.slice((I.page - 1) * I.size, I.page * I.size).map((v) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2.5 font-mono text-xs">' + esc(v.no) + '</td><td>' + esc(v.trx.siswa.nama) + '</td><td>' + esc(v.trx.jalur) + '</td><td class="whitespace-nowrap">' + fmt(v.terbit) + '</td><td class="whitespace-nowrap' + (v.k === 'overdue' ? ' text-rose-600 font-semibold' : '') + '">' + fmt(v.due) + '</td><td class="whitespace-nowrap font-semibold">' + rp(v.trx.total) + '</td><td class="whitespace-nowrap">' + (v.sisa ? rp(v.sisa) : '–') + '</td><td>' + invBadge(v.k) + '</td><td>' + invActions(v) + '</td></tr>').join('') || '<tr><td colspan="9" class="py-10 text-center text-slate-400">Tidak ada invoice pada filter ini.</td></tr>') + '</tbody>';
    $('#finInvPager').innerHTML = '<span class="text-sm text-slate-500">' + rows.length + ' invoice · halaman ' + I.page + ' dari ' + pages + '</span><span class="flex gap-2"><button type="button" data-fin-ipage="-1" class="' + BTN + '" ' + (I.page <= 1 ? 'disabled style="opacity:.4"' : '') + '>Sebelumnya</button><button type="button" data-fin-ipage="1" class="' + BTN + '" ' + (I.page >= pages ? 'disabled style="opacity:.4"' : '') + '>Berikutnya</button></span>';
  }
  const invOf = (id) => invoices().find((v) => v.trx.id === id);
  function openInvoice(id) {
    const v = invOf(id); if (!v) return; const x = v.trx;
    let m = $('#finModal'); if (!m) { m = document.createElement('div'); m.id = 'finModal'; document.body.appendChild(m); }
    const row = (k, val, b) => '<div class="flex justify-between gap-4 py-2 border-t border-slate-100 dark:border-slate-800 text-sm"><span class="text-slate-500">' + k + '</span><span class="text-right ' + (b ? 'font-extrabold text-slate-900 dark:text-white' : 'font-semibold text-slate-800 dark:text-slate-100') + '">' + val + '</span></div>';
    m.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50';
    m.innerHTML = '<div role="dialog" aria-modal="true" aria-label="Invoice" class="' + CARD + ' w-full max-w-md max-h-[90vh] overflow-y-auto p-5"><div class="flex items-start justify-between mb-3"><div><div class="font-mono text-xs text-slate-500">' + esc(v.no) + '</div><h2 class="text-lg font-extrabold text-slate-900 dark:text-white">Invoice</h2></div><button type="button" data-fin="close" aria-label="Tutup" class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-xmark"></i></button></div>' +
      row('Ditagihkan kepada', esc(x.siswa.nama)) + row('Email', esc(x.siswa.email || '–')) + row('Jenjang', GRADE[x.jenjang]) + row('Learning Path', esc(x.jalur)) + row('Tanggal terbit', fmt(v.terbit)) + row('Jatuh tempo', fmt(v.due)) + row('Harga program', rp(x.harga)) + row('Diskon', x.diskon ? '− ' + rp(x.diskon) : '–') + row('Total tagihan', rp(x.total), true) + row('Sisa tagihan', v.sisa ? rp(v.sisa) : 'Rp 0', true) + row('Status', invBadge(v.k)) + row('Ref. transaksi', esc(x.id)) +
      '<div class="flex items-center justify-between mt-4"><p class="text-xs text-slate-400">' + (demoMode ? 'Data contoh.' : 'Dokumen ini mengikuti data transaksi di server.') + '</p><button type="button" data-fin-print="' + esc(x.id) + '" class="' + BTN + '"><i class="fa-solid fa-print mr-1.5"></i>Cetak</button></div></div>';
    const c = $('[data-fin="close"]', m); if (c) c.focus();
  }
  function printInvoice(id) {
    const v = invOf(id); if (!v) return; const x = v.trx;
    const w = window.open('', '_blank'); if (!w) return toast('Pop-up diblokir browser. Izinkan pop-up untuk mencetak.', 'error');
    const r = (k, val) => '<tr><td style="padding:6px 0;color:#64748b">' + k + '</td><td style="padding:6px 0;text-align:right;font-weight:600">' + val + '</td></tr>';
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(v.no) + '</title></head><body style="font-family:Arial,sans-serif;max-width:560px;margin:32px auto;color:#0f172a"><h1 style="margin:0">Invoice</h1><p style="margin:4px 0 20px;color:#64748b">' + esc(v.no) + ' · Ref. ' + esc(x.id) + '</p><table style="width:100%;border-collapse:collapse;font-size:14px">' +
      r('Ditagihkan kepada', esc(x.siswa.nama)) + r('Jenjang', GRADE[x.jenjang]) + r('Learning Path', esc(x.jalur)) + r('Tanggal terbit', fmt(v.terbit)) + r('Jatuh tempo', fmt(v.due)) + r('Harga program', rp(x.harga)) + r('Diskon', x.diskon ? '− ' + rp(x.diskon) : '–') +
      '<tr><td style="padding:10px 0;border-top:2px solid #0f172a;font-weight:700">Total tagihan</td><td style="padding:10px 0;border-top:2px solid #0f172a;text-align:right;font-weight:700">' + rp(x.total) + '</td></tr>' + r('Sisa tagihan', rp(v.sisa)) + r('Status', INV[v.k][0]) +
      '</table><p style="margin-top:24px;font-size:12px;color:#94a3b8">' + (demoMode ? 'Dokumen contoh, bukan bukti pembayaran resmi.' : 'Dicetak dari portal Admin Ruang KKA.') + '</p></body></html>');
    w.document.close(); w.focus(); w.print();
  }

  // ================= PAKET & HARGA PROGRAM =================
  // Learning Path berasal dari kurikulum (kunci "Jenjang|Nama jalur"); halaman ini hanya mengatur
  // harga & status. Transaksi lama menyimpan harga saat dibeli, jadi mengubah harga tidak
  // mengubah riwayat.
  const PK_KEY = 'dc-finance-paket', P2 = { q: '', jenjang: '' };
  let PK = (function () { try { return JSON.parse(localStorage.getItem(PK_KEY)) || {}; } catch (_) { return {}; } })();
  const savePk = () => { try { localStorage.setItem(PK_KEY, JSON.stringify(PK)); } catch (_) {} };
  const PK_DEF = (D && D.paket) || {};
  const pkBadge = (on) => { const d = BD[on ? 'paid' : 'refunded']; return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap ' + d[1] + '"><span class="w-1.5 h-1.5 rounded-full ' + d[2] + '"></span>' + (on ? 'Aktif' : 'Nonaktif') + '</span>'; };
  const trxCount = (key) => trx.filter((x) => x.jalur === key.split('|')[1] && (!x.jenjang || !key.split('|')[0] || x.jenjang === key.split('|')[0])).length;
  function paketList() {
    return Object.keys(PK_DEF).map((key) => { const o = PK[key] || {}, def = PK_DEF[key];
      return { key, jenjang: key.split('|')[0], jalur: key.split('|')[1], def, harga: o.harga != null ? o.harga : def, aktif: o.aktif !== false, at: o.at || '', n: trxCount(key) }; });
  }
  function drawPaket() {
    const all = paketList(), on = all.filter((x) => x.aktif);
    const card = (l, v, sub2) => '<div class="' + CARD + ' p-4"><div class="text-sm text-slate-500 dark:text-slate-400">' + l + '</div><div class="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">' + v + '</div><div class="text-xs text-slate-400 mt-0.5">' + sub2 + '</div></div>';
    const avg = on.length ? on.reduce((n, x) => n + x.harga, 0) / on.length : 0;
    const opt = (v, l) => '<option value="' + v + '"' + (P2.jenjang === v ? ' selected' : '') + '>' + l + '</option>';
    $('#view-finance-paket').innerHTML = head('Paket & Harga Program', 'Harga tiap Learning Path. Daftar jalur mengikuti modul kurikulum, jadi di sini hanya harga dan status yang diatur.') + banner() +
      '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' + card('Paket aktif', on.length, 'Dari ' + all.length + ' Learning Path') + card('Paket nonaktif', all.length - on.length, 'Tidak ditawarkan ke siswa') + card('Rata-rata harga (aktif)', rp(avg), 'Harga setelah diatur di sini') + '</div>' +
      '<div class="' + CARD + ' p-4 space-y-3"><div class="grid sm:grid-cols-3 gap-2"><input type="search" data-fin-p="q" value="' + esc(P2.q) + '" placeholder="Cari Learning Path" aria-label="Cari paket" class="' + FIELD + ' sm:col-span-2"><select data-fin-p="jenjang" aria-label="Jenjang" class="' + FIELD + '">' + opt('', 'Semua jenjang') + Object.keys(GRADE).map((k) => opt(k, GRADE[k])).join('') + '</select></div>' +
      '<div class="overflow-x-auto"><table id="finPaket" class="w-full text-sm min-w-[860px]"><thead><tr class="text-slate-500">' + ['Jenjang', 'Learning Path', 'Harga', 'Status', 'Transaksi', 'Terakhir Diubah', 'Aksi'].map((h) => '<th class="py-2 font-semibold whitespace-nowrap">' + h + '</th>').join('') + '</tr></thead><tbody id="finPaketBody"></tbody></table></div></div>';
    drawPkBody();
  }
  // Hanya body tabel yang digambar ulang saat filter berubah agar fokus kotak cari tidak hilang.
  function drawPkBody() {
    const q = P2.q.trim().toLowerCase();
    const rows = paketList().filter((x) => (!P2.jenjang || x.jenjang === P2.jenjang) && (!q || x.jalur.toLowerCase().includes(q)));
    const b = $('#finPaketBody'); if (!b) return;
    b.innerHTML = rows.map((x) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2.5">' + GRADE[x.jenjang] + '</td><td>' + esc(x.jalur) + '</td><td class="font-semibold whitespace-nowrap">' + rp(x.harga) + (x.harga !== x.def ? '<div class="text-xs font-normal text-slate-400">Awal ' + rp(x.def) + '</div>' : '') + '</td><td>' + pkBadge(x.aktif) + '</td><td>' + x.n + '</td><td class="whitespace-nowrap">' + (x.at ? fmt(x.at) : '–') + '</td><td><div class="flex items-center justify-end gap-1.5">' +
      ib('data-fin-paket-edit', x.key, 'fa-pen', IBTN, 'Ubah harga dan status') + ib('data-fin-paket-toggle', x.key, 'fa-power-off', x.aktif ? 'border-rose-100 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-100' : 'border-emerald-100 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 hover:bg-emerald-100', x.aktif ? 'Nonaktifkan paket' : 'Aktifkan paket') + '</div></td></tr>').join('') || '<tr><td colspan="7" class="py-10 text-center text-slate-400">Tidak ada paket yang cocok.</td></tr>';
  }
  function openPaket(key) {
    const x = paketList().find((p) => p.key === key); if (!x) return;
    let m = $('#finModal'); if (!m) { m = document.createElement('div'); m.id = 'finModal'; document.body.appendChild(m); }
    m.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50';
    m.innerHTML = '<div role="dialog" aria-modal="true" aria-label="Ubah paket" class="' + CARD + ' w-full max-w-md max-h-[90vh] overflow-y-auto p-5"><div class="flex items-start justify-between mb-4"><div><div class="text-xs text-slate-500">' + GRADE[x.jenjang] + '</div><h2 class="text-lg font-extrabold text-slate-900 dark:text-white">' + esc(x.jalur) + '</h2></div><button type="button" data-fin="close" aria-label="Tutup" class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<label class="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1" for="finPaketHarga">Harga (Rp)</label><input id="finPaketHarga" type="text" inputmode="numeric" autocomplete="off" value="' + x.harga + '" class="' + FIELD + ' w-full"><div class="flex items-center justify-between mt-1 text-xs text-slate-400"><span>Harga awal ' + rp(x.def) + '</span><button type="button" data-fin-paket-default="' + x.def + '" class="text-jade-600 font-semibold">Kembalikan harga awal</button></div>' +
      '<label class="block text-sm font-semibold text-slate-700 dark:text-slate-200 mt-4 mb-1" for="finPaketStatus">Status</label><select id="finPaketStatus" class="' + FIELD + ' w-full"><option value="1"' + (x.aktif ? ' selected' : '') + '>Aktif</option><option value="0"' + (x.aktif ? '' : ' selected') + '>Nonaktif</option></select>' +
      '<p id="finPaketErr" class="mt-3 text-sm text-rose-600" role="alert"></p><p class="mt-1 text-xs text-slate-400">Harga baru berlaku untuk transaksi berikutnya. Transaksi dan invoice lama tidak berubah.</p>' +
      '<div class="flex justify-end gap-2 mt-4"><button type="button" data-fin="close" class="' + BTN + '">Batal</button><button type="button" data-fin-paket-save="' + esc(key) + '" class="px-3.5 py-2 rounded-xl text-sm font-semibold bg-jade-600 text-white hover:bg-jade-700">Simpan</button></div></div>';
    const i = $('#finPaketHarga', m); if (i && i.focus) i.focus();
  }
  function savePaket(key) {
    const el = $('#finPaketHarga'), err = $('#finPaketErr'), raw = String(el.value == null ? '' : el.value).trim();
    const fail = (t) => { err.textContent = t; };
    if (!raw) return fail('Harga wajib diisi.');
    if (/[^\d.\s]/.test(raw)) return fail('Harga hanya boleh berisi angka.');
    const n = parseInt(raw.replace(/[.\s]/g, ''), 10);
    if (!Number.isFinite(n) || n < 10000) return fail('Harga minimal Rp 10.000.');
    if (n > 50000000) return fail('Harga maksimal Rp 50.000.000.');
    const aktif = $('#finPaketStatus').value === '1', def = PK_DEF[key];
    if (n === def && aktif) delete PK[key]; else PK[key] = { harga: n, aktif, at: iso(today()) };
    savePk(); closeDetail(); drawPaket(); toast('Paket diperbarui.');
  }
  async function togglePaket(key) {
    const x = paketList().find((p) => p.key === key); if (!x) return;
    if (x.aktif && !(await window.dcConfirm({ title: 'Nonaktifkan paket?', message: GRADE[x.jenjang] + ' · ' + x.jalur, detail: 'Paket tidak ditawarkan lagi ke siswa. Transaksi lama tetap aman.', confirmText: 'Ya, nonaktifkan', cancelText: 'Batal', tone: 'warning' }))) return;
    const o = PK[key] || {}, aktif = !x.aktif;
    if (aktif && (o.harga == null || o.harga === PK_DEF[key])) delete PK[key]; else PK[key] = { harga: x.harga, aktif, at: iso(today()) };
    savePk(); drawPaket(); toast(aktif ? 'Paket diaktifkan.' : 'Paket dinonaktifkan.');
  }

  // ================= MENU DROPDOWN SIDEBAR =================
  const st = document.createElement('style');
  st.textContent = '#view-finance th,#view-finance-siswa th,#view-finance-bayar th,#view-finance th button,#view-finance-siswa th button,#view-finance-bayar th button{font-size:.7rem;text-transform:uppercase;letter-spacing:.04em}.fin-chev{transition:transform .2s}[aria-expanded="true"] .fin-chev{transform:rotate(180deg)}body.sb-collapsed [data-fin-toggle]{display:none}body.sb-collapsed .fin-sub{display:block!important;padding-left:0}'
    + '#finTable th,#finTable td,#finPay th,#finPay td,#finInv th,#finInv td,#finPaket th,#finPaket td{text-align:center;padding-left:.75rem;padding-right:.75rem}#finTable .justify-end,#finPay .justify-end,#finInv .justify-end,#finPaket .justify-end{justify-content:center}';
  document.head.appendChild(st);
  function setOpen(open, persist) {
    const g = $('[data-fin-group]'); if (!g) return;
    $('.fin-sub', g).classList.toggle('hidden', !open); $('[data-fin-toggle]', g).setAttribute('aria-expanded', String(open));
    if (persist) { try { localStorage.setItem('dc-fin-open', open ? '1' : '0'); } catch (_) {} }
  }
  function syncGroup(view) {
    const g = $('[data-fin-group]'); if (!g) return;
    const child = !!$('[data-view="' + view + '"]', g.querySelector('.fin-sub'));
    if (child) setOpen(true, false);
    const b = $('[data-fin-toggle]', g); b.classList.toggle('text-sky-700', child); b.classList.toggle('font-semibold', child);
  }
  try { setOpen(localStorage.getItem('dc-fin-open') === '1', false); } catch (_) {}

  function redraw() {
    if (activeView === 'finance-siswa') return drawSiswa();
    if (activeView === 'finance-bayar') return drawBayar();
    if (activeView === 'finance-invoice') return drawInvoice();
    if (activeView === 'finance-paket') return drawPaket();
    return drawOverview();
  }

  // ================= EVENT =================
  document.addEventListener('click', async (e) => {
    const t = e.target;
    const tg = t.closest('[data-fin-toggle]'); if (tg) return setOpen(tg.getAttribute('aria-expanded') !== 'true', true);
    const vf = t.closest('[data-fin-verify]'); if (vf) return decide(vf.dataset.finVerify, true);
    const rj = t.closest('[data-fin-reject]'); if (rj) return decide(rj.dataset.finReject, false);
    const ee = t.closest('[data-fin-expense-edit]'); if (ee) return openExpense(ee.dataset.finExpenseEdit);
    const ed = t.closest('[data-fin-expense-del]'); if (ed) return deleteExpense(ed.dataset.finExpenseDel);
    const en = t.closest('[data-fin-expense="new"]'); if (en) return openExpense('');
    const bp = t.closest('[data-fin-bpage]'); if (bp) { B.page += Number(bp.dataset.finBpage); return drawPay(); }
    const pk1 = t.closest('[data-fin-paket-edit]'); if (pk1) return openPaket(pk1.dataset.finPaketEdit);
    const pk2 = t.closest('[data-fin-paket-toggle]'); if (pk2) return togglePaket(pk2.dataset.finPaketToggle);
    const pk3 = t.closest('[data-fin-paket-save]'); if (pk3) return savePaket(pk3.dataset.finPaketSave);
    const pk4 = t.closest('[data-fin-paket-default]'); if (pk4) { $('#finPaketHarga').value = pk4.dataset.finPaketDefault; return; }
    const iv = t.closest('[data-fin-inv]'); if (iv) return openInvoice(iv.dataset.finInv);
    const pr = t.closest('[data-fin-print]'); if (pr) return printInvoice(pr.dataset.finPrint);
    const ip = t.closest('[data-fin-ipage]'); if (ip) { I.page += Number(ip.dataset.finIpage); return drawInv(); }
    const pe = t.closest('[data-fin-period]');
    if (pe) { P.key = pe.dataset.finPeriod; return drawOverview(); }
    const so = t.closest('[data-fin-sort]');
    if (so) { const k = so.dataset.finSort; S.dir = S.sort === k ? -S.dir : 1; S.sort = k; return drawTable(); }
    const pg = t.closest('[data-fin-page]'); if (pg) { S.page += Number(pg.dataset.finPage); return drawTable(); }
    const dt = t.closest('[data-fin-detail]'); if (dt) return openDetail(dt.dataset.finDetail);
    const a = t.closest('[data-fin]'); const act = a ? a.dataset.fin : (t.id === 'finModal' ? 'close' : '');
    if (act === 'close') return closeDetail();
    if (act === 'close-exp' || t.id === 'finExpModal') return closeExpense();
    if (act === 'reload') { ready = null; toast('Memuat data keuangan...'); await init(); return redraw(); }
    if (act === 'reset-demo') { if (await window.dcConfirm({ title: 'Reset status contoh?', message: 'Semua hasil verifikasi dan penolakan dikembalikan ke data contoh awal.', confirmText: 'Ya, reset', cancelText: 'Batal', tone: 'warning' })) { OV = {}; saveOv(); resolveDemo(); drawBayar(); toast('Status contoh direset.'); } return; }
    if (act === 'reset') { Object.assign(S, { q: '', status: '', jenjang: '', path: '', from: '', to: '', page: 1 }); return drawSiswa(); }
    if (act === 'export-trx') { const r = filtered(); if (!r.length) return toast('Tidak ada data untuk diexport.', 'error'); download('transaksi-siswa-' + iso(today()) + '.csv', csv(r, TRX_COLS)); return toast('Export CSV: ' + r.length + ' transaksi' + (demoMode ? ' (data contoh)' : '') + '.'); }
    if (act === 'export-overview') { const r = $('#view-finance')._rows || []; if (!r.length) return toast('Tidak ada transaksi pada periode ini.', 'error'); download('ringkasan-finance-' + iso(today()) + '.csv', csv(r, TRX_COLS)); toast('Export CSV: ' + r.length + ' transaksi' + (demoMode ? ' (data contoh)' : '') + '.'); }
    if (act === 'export-inv') { const r = invFiltered(); if (!r.length) return toast('Tidak ada data untuk diexport.', 'error'); download('invoice-' + iso(today()) + '.csv', csv(r, [['No. Invoice', (v) => v.no], ['Ref. Transaksi', (v) => v.trx.id], ['Nama Siswa', (v) => v.trx.siswa.nama], ['Learning Path', (v) => v.trx.jalur], ['Terbit', (v) => v.terbit], ['Jatuh Tempo', (v) => v.due], ['Total', (v) => v.trx.total], ['Sisa Tagihan', (v) => v.sisa], ['Status', (v) => INV[v.k][0]]])); return toast('Export CSV: ' + r.length + ' invoice' + (demoMode ? ' (data contoh)' : '') + '.'); }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-fin-expform]');
    if (!f) return;
    e.preventDefault();
    saveExpense(f);
  });
  document.addEventListener('input', (e) => {
    const f = e.target.closest('[data-fin-f="q"]'); if (f) { S.q = f.value; S.page = 1; drawTable(); }
    const b = e.target.closest('[data-fin-b="q"]'); if (b) { B.q = b.value; B.page = 1; drawPay(); }
    const iq = e.target.closest('[data-fin-i="q"]'); if (iq) { I.q = iq.value; I.page = 1; drawInv(); }
    const pq = e.target.closest('[data-fin-p="q"]'); if (pq) { P2.q = pq.value; drawPkBody(); }
  });
  document.addEventListener('change', (e) => {
    const f = e.target.closest('[data-fin-f]'); if (f && f.dataset.finF !== 'q') { S[f.dataset.finF] = f.value; S.page = 1; drawTable(); }
    const bs = e.target.closest('[data-fin-b="status"]'); if (bs) { B.status = bs.value; B.page = 1; drawPay(); }
    const is = e.target.closest('[data-fin-i="status"]'); if (is) { I.status = is.value; I.page = 1; drawInv(); }
    const pj = e.target.closest('[data-fin-p="jenjang"]'); if (pj) { P2.jenjang = pj.value; drawPaket(); }
    const d = e.target.closest('[data-fin-date]'); if (d) { P[d.dataset.finDate] = d.value; drawOverview(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDetail(); closeExpense(); } });
  window.addEventListener('dc:view', (e) => {
    activeView = e.detail;
    syncGroup(e.detail);
    if (e.detail === 'finance') init().then(drawOverview);
    else if (e.detail === 'finance-siswa') init().then(drawSiswa);
    else if (e.detail === 'finance-bayar') init().then(drawBayar);
    else if (e.detail === 'finance-invoice') init().then(drawInvoice);
    else if (e.detail === 'finance-paket') init().then(drawPaket);
  });
})();
