/* Modul Finance (frontend): Ringkasan Finance + Transaksi Siswa. Data dari finance-data.js (contoh). */
(function () {
  'use strict';
  const D = window.DCFinanceData;
  if (!D) return;

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rp = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const toast = (m, t) => { if (typeof showToast === 'function') showToast(m, t); };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const shift = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const fmt = (s) => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const GRADE = { SD: 'SD', SMP: 'SMP', SMK: 'SMA / SMK' };
  const ST = {
    paid: ['Lunas', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'],
    pending: ['Menunggu', 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'],
    failed: ['Gagal', 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'],
    refunded: ['Dikembalikan', 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300']
  };
  const badge = (s) => '<span class="inline-block px-2.5 py-1 rounded-full text-xs font-semibold ' + ST[s][1] + '">' + ST[s][0] + '</span>';
  const CARD = 'rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900';
  const BTN = 'px-3.5 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-jade-50 dark:hover:bg-slate-800';
  const AB = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-400';
  const AB_VIEW = AB + ' border-jade-200 dark:border-jade-500/40 text-jade-700 dark:text-jade-300 hover:bg-jade-50 dark:hover:bg-jade-500/10';
  const AB_OK = AB + ' border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700';
  const AB_NO = AB + ' border-rose-200 dark:border-rose-500/40 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10';
  const btnDetail = (id) => '<button type="button" data-fin-detail="' + id + '" class="' + AB_VIEW + '"><i class="fa-solid fa-eye"></i>Detail</button>';
  const FIELD = 'px-3 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200';

  // ---------- data ----------
  let siswa = [], trx = [], exp = [], siswaDemo = false, ready = null;
  const OV_KEY = 'dc-finance-status', MANUAL = ['Transfer Bank', 'Tunai'];
  let OV = (function () { try { return JSON.parse(localStorage.getItem(OV_KEY)) || {}; } catch (_) { return {}; } })();
  const saveOv = () => { try { localStorage.setItem(OV_KEY, JSON.stringify(OV)); } catch (_) {} };

  async function loadSiswa() {
    let list = [];
    try { const r = await window.DCAdminApi.users({ limit: 200 }); list = r.users || r.items || r.data || []; } catch (_) {}
    if (!list.length) { try { list = (JSON.parse(localStorage.getItem('dc-siswa-data')) || {}).users || []; } catch (_) {} }
    list = list.filter((u) => u.status !== 'deleted').map((u) => ({ id: u.id, nama: u.full_name || u.username || 'Siswa #' + u.id, username: u.username || '', email: u.email || '', grades: u.allowedGrades || [] }));
    if (!list.length) { list = D.siswaContoh; siswaDemo = true; }
    return list;
  }

  function resolve() {
    const t = today();
    trx = D.transaksi.map((x) => {
      const jenjang = x.path.split('|')[0];
      const pool = siswa.filter((s) => s.grades.includes(jenjang));
      const s = (pool.length ? pool : siswa)[x.pick % (pool.length || siswa.length)];
      const o = OV[x.id];
      return { ...x, status: o ? o.status : x.status, catatan: o ? o.note : '', tanggal: iso(shift(t, -x.daysAgo)), jenjang, jalur: x.path.split('|')[1], siswa: s, total: Math.max(0, x.harga - x.diskon) };
    });
    exp = D.pengeluaran.map((e) => ({ ...e, tanggal: iso(shift(t, -e.daysAgo)) }));
  }

  function init() {
    if (!ready) ready = loadSiswa().then((l) => { siswa = l; resolve(); });
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
  const banner = () => '<div class="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"><i class="fa-solid fa-flask mr-2"></i><b>Data contoh.</b> Belum terhubung ke backend, jadi angka di halaman ini bukan data keuangan sebenarnya.' + (siswaDemo ? ' Nama siswa memakai daftar contoh karena data siswa belum bisa dimuat.' : '') + '</div>';
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

  function chart(r) {
    const a = new Date(r[0] + 'T00:00:00'), b = new Date(r[1] + 'T00:00:00');
    const daily = (b - a) / 864e5 <= 45, B = [], idx = {};
    for (let d = new Date(a); d <= b; d = daily ? shift(d, 1) : new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const k = iso(d).slice(0, daily ? 10 : 7);
      if (idx[k] === undefined) { idx[k] = B.length; B.push({ k, label: daily ? d.getDate() + '/' + (d.getMonth() + 1) : d.toLocaleDateString('id-ID', { month: 'short' }), in: 0, out: 0 }); }
    }
    const key = (s) => s.slice(0, daily ? 10 : 7);
    trx.forEach((x) => { if (x.status === 'paid' && within(x.tanggal, r) && B[idx[key(x.tanggal)]]) B[idx[key(x.tanggal)]].in += x.total; });
    exp.forEach((x) => { if (within(x.tanggal, r) && B[idx[key(x.tanggal)]]) B[idx[key(x.tanggal)]].out += x.nominal; });
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

  function drawOverview() {
    const v = $('#view-finance'), r = range();
    const bad = P.key === 'custom' && (!r[0] || !r[1] || r[0] > r[1]);
    const T = bad ? [] : trx.filter((x) => within(x.tanggal, r)), E = bad ? [] : exp.filter((x) => within(x.tanggal, r));
    const sum = (a, f) => a.reduce((s, x) => s + f(x), 0), paid = T.filter((x) => x.status === 'paid'), pend = T.filter((x) => x.status === 'pending');
    const inc = sum(paid, (x) => x.total), out = sum(E, (x) => x.nominal), laba = inc - out;
    const card = (label, val, tone, icon) => '<div class="' + CARD + ' p-4"><div class="flex items-center justify-between"><span class="text-sm text-slate-500 dark:text-slate-400">' + label + '</span><i class="fa-solid ' + icon + ' ' + tone + '"></i></div><div class="mt-2 text-xl font-extrabold text-slate-900 dark:text-white">' + val + '</div></div>';
    const byJ = ['SD', 'SMP', 'SMK'].map((j) => [j, sum(paid.filter((x) => x.jenjang === j), (x) => x.total)]);
    const byK = {}; E.forEach((x) => { byK[x.kategori] = (byK[x.kategori] || 0) + x.nominal; });
    const dist = (rows, total, color) => rows.map((q) => '<div class="mb-2"><div class="flex justify-between text-sm"><span class="text-slate-600 dark:text-slate-300">' + esc(q[0]) + '</span><span class="font-semibold text-slate-800 dark:text-slate-100">' + rp(q[1]) + '</span></div><div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 mt-1"><div class="h-2 rounded-full" style="width:' + (total ? Math.round(q[1] / total * 100) : 0) + '%;background:' + color + '"></div></div></div>').join('') || '<p class="text-sm text-slate-400">Belum ada data pada periode ini.</p>';
    const recent = T.slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id)).slice(0, 8);
    v.innerHTML = head('Ringkasan Finance', 'Pemasukan = pembayaran siswa berstatus Lunas. Laba bersih = pemasukan dikurangi pengeluaran pada periode.',
      '<button type="button" data-fin="export-overview" class="' + BTN + '"><i class="fa-solid fa-file-arrow-down mr-1.5"></i>Export laporan</button>') + banner() +
      '<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Periode">' + PERIODS.map((p) => '<button type="button" data-fin-period="' + p[0] + '" aria-pressed="' + (P.key === p[0]) + '" class="px-3.5 py-2 rounded-xl text-sm font-semibold ' + (P.key === p[0] ? 'bg-jade-600 text-white' : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-jade-50 dark:hover:bg-slate-800') + '">' + p[1] + '</button>').join('') +
      (P.key === 'custom' ? '<input type="date" data-fin-date="from" value="' + esc(P.from) + '" class="' + FIELD + '" aria-label="Dari tanggal"><span class="text-slate-400">–</span><input type="date" data-fin-date="to" value="' + esc(P.to) + '" class="' + FIELD + '" aria-label="Sampai tanggal">' : '') + '</div>' +
      (bad ? '<p class="text-sm text-rose-600">Isi kedua tanggal, dan pastikan tanggal akhir tidak lebih awal dari tanggal awal.</p>' : '') +
      '<div class="grid grid-cols-2 xl:grid-cols-4 gap-3">' + card('Total pemasukan', rp(inc), 'text-emerald-500', 'fa-arrow-trend-up') + card('Total pengeluaran', rp(out), 'text-rose-500', 'fa-arrow-trend-down') +
      card('Laba bersih', (laba < 0 ? '−' : '') + rp(Math.abs(laba)), laba < 0 ? 'text-rose-500' : 'text-jade-600', 'fa-scale-balanced') + card('Pembayaran menunggu', rp(sum(pend, (x) => x.total)) + ' <span class="text-sm font-semibold text-slate-400">(' + pend.length + ')</span>', 'text-amber-500', 'fa-hourglass-half') + '</div>' +
      '<div class="grid lg:grid-cols-3 gap-3"><div class="' + CARD + ' p-4 lg:col-span-2"><div class="flex items-center justify-between mb-2"><h2 class="font-bold text-slate-800 dark:text-white">Pemasukan dan pengeluaran</h2><span class="text-xs text-slate-500"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 mr-1"></span>Masuk <span class="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400 ml-3 mr-1"></span>Keluar</span></div>' + (bad ? '' : chart(r)) + '</div>' +
      '<div class="' + CARD + ' p-4"><h2 class="font-bold text-slate-800 dark:text-white mb-3">Sumber pemasukan per jenjang</h2>' + dist(byJ.map((q) => [GRADE[q[0]], q[1]]), inc, '#10b981') + '</div></div>' +
      '<div class="grid md:grid-cols-2 gap-3"><div class="' + CARD + ' p-4"><h2 class="font-bold text-slate-800 dark:text-white mb-3">Student Finance</h2><dl class="grid grid-cols-2 gap-y-2 text-sm"><dt class="text-slate-500">Transaksi</dt><dd class="font-semibold text-right">' + T.length + '</dd><dt class="text-slate-500">Lunas</dt><dd class="font-semibold text-right">' + paid.length + '</dd><dt class="text-slate-500">Menunggu</dt><dd class="font-semibold text-right">' + pend.length + '</dd><dt class="text-slate-500">Gagal / dikembalikan</dt><dd class="font-semibold text-right">' + T.filter((x) => x.status === 'failed' || x.status === 'refunded').length + '</dd><dt class="text-slate-500">Total diskon (lunas)</dt><dd class="font-semibold text-right">' + rp(sum(paid, (x) => x.diskon)) + '</dd></dl></div>' +
      '<div class="' + CARD + ' p-4"><h2 class="font-bold text-slate-800 dark:text-white mb-3">Company Finance: pengeluaran per kategori</h2>' + dist(Object.entries(byK).sort((a, b) => b[1] - a[1]), out, '#fb7185') + '</div></div>' +
      '<div class="' + CARD + ' p-4"><div class="flex items-center justify-between mb-3"><h2 class="font-bold text-slate-800 dark:text-white">Transaksi terbaru</h2><a href="#" data-view="finance-siswa" class="text-sm font-semibold text-jade-600">Lihat semua</a></div><div class="overflow-x-auto"><table class="w-full text-sm min-w-[640px]"><thead><tr class="text-left text-slate-500"><th class="py-2 pr-3 font-semibold">ID</th><th class="pr-3 font-semibold">Tanggal</th><th class="pr-3 font-semibold">Nama</th><th class="pr-3 font-semibold">Keterangan</th><th class="pr-3 font-semibold">Kategori</th><th class="pr-3 font-semibold text-right">Nominal</th><th class="font-semibold">Status</th></tr></thead><tbody>' +
      (recent.map((x) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2 pr-3 font-mono text-xs">' + x.id + '</td><td class="pr-3 whitespace-nowrap">' + fmt(x.tanggal) + '</td><td class="pr-3">' + esc(x.siswa.nama) + '</td><td class="pr-3">' + esc(x.jalur) + '</td><td class="pr-3">Student Finance</td><td class="pr-3 text-right whitespace-nowrap">' + rp(x.total) + '</td><td>' + badge(x.status) + '</td></tr>').join('') || '<tr><td colspan="7" class="py-6 text-center text-slate-400">Belum ada transaksi pada periode ini.</td></tr>') + '</tbody></table></div></div>';
    v._rows = T;
  }

  // ================= TRANSAKSI SISWA =================
  const S = { q: '', status: '', jenjang: '', path: '', from: '', to: '', sort: 'tanggal', dir: -1, page: 1, size: 10 };
  const COLS = [['id', 'ID Transaksi'], ['tanggal', 'Tanggal'], ['nama', 'Nama Siswa'], ['jenjang', 'Jenjang'], ['jalur', 'Learning Path'], ['total', 'Total'], ['metode', 'Metode'], ['status', 'Status']];
  const val = (x, k) => (k === 'nama' ? x.siswa.nama : x[k]);

  function filtered() {
    const q = S.q.trim().toLowerCase();
    const rows = trx.filter((x) => (!q || (x.id + ' ' + x.siswa.nama + ' ' + x.jalur).toLowerCase().includes(q)) && (!S.status || x.status === S.status) && (!S.jenjang || x.jenjang === S.jenjang) && (!S.path || x.path === S.path) && (!S.from || x.tanggal >= S.from) && (!S.to || x.tanggal <= S.to));
    return rows.sort((a, b) => { const x = val(a, S.sort), y = val(b, S.sort); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'id')) * S.dir || a.id.localeCompare(b.id); });
  }

  function drawTable() {
    const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / S.size));
    S.page = Math.min(S.page, pages);
    const slice = rows.slice((S.page - 1) * S.size, S.page * S.size);
    $('#finTable').innerHTML = '<thead><tr class="text-left text-slate-500">' + COLS.map((c) => '<th class="py-2 pr-3 font-semibold whitespace-nowrap" aria-sort="' + (S.sort === c[0] ? (S.dir > 0 ? 'ascending' : 'descending') : 'none') + '"><button type="button" data-fin-sort="' + c[0] + '" class="font-semibold hover:text-jade-600">' + c[1] + (S.sort === c[0] ? (S.dir > 0 ? ' ↑' : ' ↓') : '') + '</button></th>').join('') + '<th class="py-2 font-semibold">Aksi</th></tr></thead><tbody>' +
      (slice.map((x) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2.5 pr-3 font-mono text-xs">' + x.id + '</td><td class="pr-3 whitespace-nowrap">' + fmt(x.tanggal) + '</td><td class="pr-3">' + esc(x.siswa.nama) + '</td><td class="pr-3">' + GRADE[x.jenjang] + '</td><td class="pr-3">' + esc(x.jalur) + '</td><td class="pr-3 whitespace-nowrap font-semibold">' + rp(x.total) + '</td><td class="pr-3 whitespace-nowrap">' + esc(x.metode) + '</td><td class="pr-3">' + badge(x.status) + '</td><td>' + btnDetail(x.id) + '</td></tr>').join('') ||
        '<tr><td colspan="9" class="py-10 text-center text-slate-400">Tidak ada transaksi yang cocok. <button type="button" data-fin="reset" class="text-jade-600 font-semibold">Reset filter</button></td></tr>') + '</tbody>';
    $('#finPager').innerHTML = '<span class="text-sm text-slate-500">' + rows.length + ' transaksi · halaman ' + S.page + ' dari ' + pages + '</span><span class="flex gap-2"><button type="button" data-fin-page="-1" class="' + BTN + '" ' + (S.page <= 1 ? 'disabled style="opacity:.4"' : '') + '>Sebelumnya</button><button type="button" data-fin-page="1" class="' + BTN + '" ' + (S.page >= pages ? 'disabled style="opacity:.4"' : '') + '>Berikutnya</button></span>';
  }

  function drawSiswa() {
    const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>';
    $('#view-finance-siswa').innerHTML = head('Transaksi Siswa', 'Pembelian Learning Path oleh siswa. Data siswa dan jalur diambil dari modul yang sudah ada.', '<button type="button" data-fin="export-trx" class="' + BTN + '"><i class="fa-solid fa-file-arrow-down mr-1.5"></i>Export CSV</button>') + banner() +
      '<div class="' + CARD + ' p-4 space-y-3"><div class="grid sm:grid-cols-2 lg:grid-cols-6 gap-2">' +
      '<input type="search" data-fin-f="q" value="' + esc(S.q) + '" placeholder="Cari ID, nama, atau jalur" aria-label="Cari transaksi" class="' + FIELD + ' lg:col-span-2">' +
      '<select data-fin-f="status" aria-label="Status" class="' + FIELD + '">' + opt('', 'Semua status', S.status) + Object.keys(ST).map((k) => opt(k, ST[k][0], S.status)).join('') + '</select>' +
      '<select data-fin-f="jenjang" aria-label="Jenjang" class="' + FIELD + '">' + opt('', 'Semua jenjang', S.jenjang) + Object.keys(GRADE).map((k) => opt(k, GRADE[k], S.jenjang)).join('') + '</select>' +
      '<select data-fin-f="path" aria-label="Learning Path" class="' + FIELD + ' lg:col-span-2">' + opt('', 'Semua Learning Path', S.path) + Object.keys(D.paket).map((k) => opt(k, GRADE[k.split('|')[0]] + ' · ' + k.split('|')[1], S.path)).join('') + '</select>' +
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
    m.innerHTML = '<div role="dialog" aria-modal="true" aria-label="Detail transaksi" class="' + CARD + ' w-full max-w-md max-h-[90vh] overflow-y-auto p-5"><div class="flex items-start justify-between mb-3"><div><div class="font-mono text-xs text-slate-500">' + x.id + '</div><h2 class="text-lg font-extrabold text-slate-900 dark:text-white">Detail transaksi</h2></div><button type="button" data-fin="close" aria-label="Tutup" class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-xmark"></i></button></div>' +
      row('Nama siswa', esc(x.siswa.nama)) + row('Username', esc(x.siswa.username || '–')) + row('Email', esc(x.siswa.email || '–')) + row('Jenjang', GRADE[x.jenjang]) + row('Learning Path', esc(x.jalur)) + row('Tanggal', fmt(x.tanggal)) + row('Harga awal', rp(x.harga)) + row('Diskon', x.diskon ? '− ' + rp(x.diskon) : '–') + row('Total pembayaran', rp(x.total)) + row('Metode', esc(x.metode)) + row('Status', badge(x.status)) + (x.catatan ? row('Catatan', esc(x.catatan)) : '') +
      '<p class="mt-3 text-xs text-slate-400">Data contoh. Status diubah lewat menu Pembayaran.</p></div>';
    const c = $('[data-fin="close"]', m); if (c) c.focus();
  }
  const closeDetail = () => { const m = $('#finModal'); if (m) { m.className = 'hidden'; m.innerHTML = ''; } };


  // ================= PEMBAYARAN (verifikasi manual) =================
  const B = { q: '', status: 'pending', page: 1, size: 15 };
  function drawBayar() {
    const sum = (a) => a.reduce((n, x) => n + x.total, 0);
    const pm = trx.filter((x) => x.status === 'pending' && MANUAL.includes(x.metode)), pg = trx.filter((x) => x.status === 'pending' && !MANUAL.includes(x.metode));
    const card = (l, v, sub2) => '<div class="' + CARD + ' p-4"><div class="text-sm text-slate-500 dark:text-slate-400">' + l + '</div><div class="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">' + v + '</div><div class="text-xs text-slate-400 mt-0.5">' + sub2 + '</div></div>';
    const opt = (v, l) => '<option value="' + v + '"' + (B.status === v ? ' selected' : '') + '>' + l + '</option>';
    $('#view-finance-bayar').innerHTML = head('Pembayaran', 'Verifikasi pembayaran manual (transfer bank dan tunai). Pembayaran lewat gateway menunggu konfirmasi otomatis dari penyedia.', '<button type="button" data-fin="reset-demo" class="' + BTN + '">Reset status contoh</button>') + banner() +
      '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' + card('Menunggu verifikasi admin', pm.length, rp(sum(pm))) + card('Menunggu gateway', pg.length, 'Gateway belum terhubung ke backend') + card('Sudah diproses admin', Object.keys(OV).length, 'Diverifikasi atau ditolak') + '</div>' +
      '<div class="' + CARD + ' p-4 space-y-3"><div class="grid sm:grid-cols-3 gap-2"><input type="search" data-fin-b="q" value="' + esc(B.q) + '" placeholder="Cari ID, nama, atau jalur" aria-label="Cari pembayaran" class="' + FIELD + ' sm:col-span-2"><select data-fin-b="status" aria-label="Status" class="' + FIELD + '">' + opt('pending', 'Menunggu') + opt('', 'Semua status') + opt('paid', 'Lunas') + opt('failed', 'Gagal') + opt('refunded', 'Dikembalikan') + '</select></div>' +
      '<div class="overflow-x-auto"><table id="finPay" class="w-full text-sm min-w-[960px]"></table></div><div id="finPayPager" class="flex flex-wrap items-center justify-between gap-2"></div></div>';
    drawPay();
  }
  function drawPay() {
    const q = B.q.trim().toLowerCase();
    const rows = trx.filter((x) => (!B.status || x.status === B.status) && (!q || (x.id + ' ' + x.siswa.nama + ' ' + x.jalur).toLowerCase().includes(q))).sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id));
    const pages = Math.max(1, Math.ceil(rows.length / B.size)); B.page = Math.min(B.page, pages);
    const act = (x) => '<div class="flex flex-wrap items-center gap-1.5">' + btnDetail(x.id) + (x.status === 'pending' ? (MANUAL.includes(x.metode)
      ? '<button type="button" data-fin-verify="' + x.id + '" class="' + AB_OK + '"><i class="fa-solid fa-check"></i>Verifikasi</button><button type="button" data-fin-reject="' + x.id + '" class="' + AB_NO + '"><i class="fa-solid fa-xmark"></i>Tolak</button>'
      : '<span class="text-xs text-slate-400">Menunggu gateway</span>') : '') + '</div>';
    $('#finPay').innerHTML = '<thead><tr class="text-left text-slate-500"><th class="py-2 pr-3 font-semibold">ID</th><th class="pr-3 font-semibold">Tanggal</th><th class="pr-3 font-semibold">Nama Siswa</th><th class="pr-3 font-semibold">Learning Path</th><th class="pr-3 font-semibold">Total</th><th class="pr-3 font-semibold">Metode</th><th class="pr-3 font-semibold">Status</th><th class="font-semibold">Aksi</th></tr></thead><tbody>' +
      (rows.slice((B.page - 1) * B.size, B.page * B.size).map((x) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2.5 pr-3 font-mono text-xs">' + x.id + '</td><td class="pr-3 whitespace-nowrap">' + fmt(x.tanggal) + '</td><td class="pr-3">' + esc(x.siswa.nama) + '</td><td class="pr-3">' + esc(x.jalur) + '</td><td class="pr-3 whitespace-nowrap font-semibold">' + rp(x.total) + '</td><td class="pr-3 whitespace-nowrap">' + esc(x.metode) + '</td><td class="pr-3">' + badge(x.status) + '</td><td>' + act(x) + '</td></tr>').join('') || '<tr><td colspan="8" class="py-10 text-center text-slate-400">Tidak ada pembayaran pada filter ini.</td></tr>') + '</tbody>';
    $('#finPayPager').innerHTML = '<span class="text-sm text-slate-500">' + rows.length + ' pembayaran · halaman ' + B.page + ' dari ' + pages + '</span><span class="flex gap-2"><button type="button" data-fin-bpage="-1" class="' + BTN + '" ' + (B.page <= 1 ? 'disabled style="opacity:.4"' : '') + '>Sebelumnya</button><button type="button" data-fin-bpage="1" class="' + BTN + '" ' + (B.page >= pages ? 'disabled style="opacity:.4"' : '') + '>Berikutnya</button></span>';
  }
  async function decide(id, ok) {
    const x = trx.find((t) => t.id === id); if (!x || x.status !== 'pending' || !MANUAL.includes(x.metode)) return;
    const info = x.id + ' · ' + x.siswa.nama + ' · ' + rp(x.total);
    let note = 'Diverifikasi admin';
    if (ok) { if (!(await window.dcConfirm({ title: 'Verifikasi pembayaran?', message: info, detail: 'Status berubah menjadi Lunas dan masuk ke pemasukan.', confirmText: 'Ya, verifikasi', cancelText: 'Batal', tone: 'success' }))) return; }
    else { const r = await window.dcPrompt({ title: 'Tolak pembayaran', message: info, placeholder: 'Alasan penolakan, mis. bukti transfer tidak sesuai', confirmText: 'Tolak pembayaran' }); if (r === null) return; if (!String(r).trim()) return toast('Alasan penolakan wajib diisi.', 'error'); note = 'Ditolak: ' + String(r).trim(); }
    OV[id] = { status: ok ? 'paid' : 'failed', note, at: iso(today()) }; saveOv(); resolve(); drawBayar();
    toast(ok ? 'Pembayaran ' + id + ' diverifikasi.' : 'Pembayaran ' + id + ' ditolak.');
  }

  // ================= MENU DROPDOWN SIDEBAR =================
  const st = document.createElement('style');
  st.textContent = '.fin-chev{transition:transform .2s}[aria-expanded="true"] .fin-chev{transform:rotate(180deg)}body.sb-collapsed [data-fin-toggle]{display:none}body.sb-collapsed .fin-sub{display:block!important;padding-left:0}';
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

  // ================= EVENT =================
  document.addEventListener('click', async (e) => {
    const t = e.target;
    const tg = t.closest('[data-fin-toggle]'); if (tg) return setOpen(tg.getAttribute('aria-expanded') !== 'true', true);
    const vf = t.closest('[data-fin-verify]'); if (vf) return decide(vf.dataset.finVerify, true);
    const rj = t.closest('[data-fin-reject]'); if (rj) return decide(rj.dataset.finReject, false);
    const bp = t.closest('[data-fin-bpage]'); if (bp) { B.page += Number(bp.dataset.finBpage); return drawPay(); }
    const pe = t.closest('[data-fin-period]');
    if (pe) { P.key = pe.dataset.finPeriod; return drawOverview(); }
    const so = t.closest('[data-fin-sort]');
    if (so) { const k = so.dataset.finSort; S.dir = S.sort === k ? -S.dir : 1; S.sort = k; return drawTable(); }
    const pg = t.closest('[data-fin-page]'); if (pg) { S.page += Number(pg.dataset.finPage); return drawTable(); }
    const dt = t.closest('[data-fin-detail]'); if (dt) return openDetail(dt.dataset.finDetail);
    const a = t.closest('[data-fin]'); const act = a ? a.dataset.fin : (t.id === 'finModal' ? 'close' : '');
    if (act === 'close') return closeDetail();
    if (act === 'reset-demo') { if (await window.dcConfirm({ title: 'Reset status contoh?', message: 'Semua hasil verifikasi dan penolakan dikembalikan ke data contoh awal.', confirmText: 'Ya, reset', cancelText: 'Batal', tone: 'warning' })) { OV = {}; saveOv(); resolve(); drawBayar(); toast('Status contoh direset.'); } return; }
    if (act === 'reset') { Object.assign(S, { q: '', status: '', jenjang: '', path: '', from: '', to: '', page: 1 }); return drawSiswa(); }
    if (act === 'export-trx') { const r = filtered(); if (!r.length) return toast('Tidak ada data untuk diexport.', 'error'); download('transaksi-siswa-' + iso(today()) + '.csv', csv(r, TRX_COLS)); return toast('Export CSV: ' + r.length + ' transaksi (data contoh).'); }
    if (act === 'export-overview') { const r = $('#view-finance')._rows || []; if (!r.length) return toast('Tidak ada transaksi pada periode ini.', 'error'); download('ringkasan-finance-' + iso(today()) + '.csv', csv(r, TRX_COLS)); toast('Export CSV: ' + r.length + ' transaksi (data contoh).'); }
  });
  document.addEventListener('input', (e) => { const f = e.target.closest('[data-fin-f="q"]'); if (f) { S.q = f.value; S.page = 1; drawTable(); } const b = e.target.closest('[data-fin-b="q"]'); if (b) { B.q = b.value; B.page = 1; drawPay(); } });
  document.addEventListener('change', (e) => {
    const f = e.target.closest('[data-fin-f]'); if (f && f.dataset.finF !== 'q') { S[f.dataset.finF] = f.value; S.page = 1; drawTable(); }
    const bs = e.target.closest('[data-fin-b="status"]'); if (bs) { B.status = bs.value; B.page = 1; drawPay(); }
    const d = e.target.closest('[data-fin-date]'); if (d) { P[d.dataset.finDate] = d.value; drawOverview(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });
  window.addEventListener('dc:view', (e) => {
    syncGroup(e.detail);
    if (e.detail === 'finance') init().then(drawOverview);
    else if (e.detail === 'finance-siswa') init().then(drawSiswa);
    else if (e.detail === 'finance-bayar') init().then(drawBayar);
  });
})();
