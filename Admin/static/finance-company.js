/*
 * Company Finance: Pemasukan Perusahaan + Pengeluaran Perusahaan.
 * Memakai helper dari finance.js lewat window.DCFinanceKit. Data diambil dari API finance;
 * bila API gagal, data contoh di localStorage tetap dipakai sebagai fallback.
 * Aturan agar tidak terhitung ganda:
 *  - Pembayaran siswa berstatus Lunas masuk ke pemasukan OTOMATIS (dibaca dari Student Finance, tidak disimpan ulang).
 *  - Hanya pengeluaran berstatus "Dibayar" yang dihitung sebagai kas keluar.
 *  - Kategori "Gaji & Honor" dicatat lewat Payroll, bukan lewat form pengeluaran.
 */
(function () {
  'use strict';
  const K = window.DCFinanceKit, D = window.DCFinanceData;
  if (!K || !D) return;
  const { $, esc, rp, toast, today, shift, iso, fmt, head, banner, CARD, BTN, FIELD, IBTN, ib, BD, actor } = K;

  const load = (k, seed) => { try { const v = JSON.parse(localStorage.getItem(k)); if (Array.isArray(v)) return v; } catch (_) {} return seed(); };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const IK = 'dc-finance-income', EK = 'dc-finance-expense';
  const ago = (n) => iso(shift(today(), -n));

  // Akses API finance. Bila server tidak bisa dipakai, modul tetap berjalan dengan
  // data localStorage seperti sebelumnya (mode contoh).
  const api = (p, o) => (window.DCAdminApi && window.DCAdminApi.request)
    ? window.DCAdminApi.request(p, o)
    : Promise.reject(new Error('API Admin tidak tersedia.'));
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
  // Log lokal untuk tampilan aktivitas. Audit tepercaya tetap dicatat server saat
  // mutasi lewat API, jadi ini tidak menulis ulang ke admin_audit.
  const audit = (module, action, entityType, entityId, summary, before, after) => {
    try {
      const A = window.DCFinanceAudit;
      if (A && typeof A.log === 'function') A.log({ module, action, entityType, entityId, summary, before, after });
    } catch (_) {}
  };

  const seedInc = () => [
    { id: 'INC-001', tanggal: ago(5), kategori: 'Donasi', ket: 'Donasi komunitas orang tua', nominal: 1500000, bukti: '' },
    { id: 'INC-002', tanggal: ago(20), kategori: 'Sponsor', ket: 'Sponsor kegiatan lomba coding', nominal: 2500000, bukti: 'sponsor-lomba.pdf' },
    { id: 'INC-003', tanggal: ago(35), kategori: 'Penjualan Merchandise', ket: 'Penjualan kaos dan stiker', nominal: 350000, bukti: '' },
    { id: 'INC-004', tanggal: ago(60), kategori: 'Hibah', ket: 'Hibah pelatihan guru', nominal: 5000000, bukti: 'hibah-guru.pdf' }
  ];
  const seedExp = () => D.pengeluaran.filter((e) => e.kategori !== 'Gaji & Honor').map((e, i) => {
    const st = e.daysAgo < 10 ? ['submitted', 'approved', 'paid'][i % 3] : (i % 9 === 0 ? 'rejected' : 'paid');
    return { id: e.id, tanggal: ago(e.daysAgo), kategori: e.kategori, ket: 'Biaya ' + e.kategori.toLowerCase(), nominal: e.nominal, status: st,
      bukti: st === 'paid' || st === 'approved' ? 'nota-' + e.id.toLowerCase() + '.pdf' : '', catatan: st === 'rejected' ? 'Ditolak: dokumen belum lengkap' : '' };
  });
  let INC = load(IK, seedInc), EXP = load(EK, seedExp);

  // Bentuk data server -> bentuk yang dipakai UI. `id` tetap kode tampilan
  // (INC-001 / EXP-501), sedangkan `sid` adalah id numerik untuk memanggil API.
  const mapInc = (x) => ({
    id: x.code || ('INC-' + x.id), sid: x.id, tanggal: x.tanggal || '',
    kategori: x.kategori || 'Lainnya', ket: x.keterangan || '',
    nominal: Number(x.nominal || 0), bukti: x.bukti || ''
  });
  const mapExp = (x) => ({
    id: x.code || ('EXP-' + x.id), sid: x.id, tanggal: x.tanggal || '',
    kategori: x.kategori || '', ket: x.keterangan || x.catatan || '',
    nominal: Number(x.nominal || 0), status: x.status || 'paid',
    bukti: x.bukti || '', catatan: x.catatan || ''
  });

  let serverMode = false;
  async function hydrate() {
    if (!window.DCAdminApi) return false;
    try {
      const [inc, exp] = await Promise.all([
        fetchAll('/api/admin/finance/income'),
        fetchAll('/api/admin/finance/expenses')
      ]);
      INC = inc.map(mapInc);
      EXP = exp.map(mapExp);
      serverMode = true;
      save(IK, INC); save(EK, EXP);
      return true;
    } catch (_) {
      serverMode = false;
      return false;
    }
  }
  const readyP = hydrate();

  // dibaca oleh Ringkasan Finance (finance.js)
  // Modul lain (Payroll) mendaftarkan sumber pengeluaran lewat addExpenseSource, jadi hanya ada SATU jalur ke laporan.
  const EXTRA = [];
  window.DCCompany = {
    ready: () => readyP,
    refresh: hydrate,
    serverMode: () => serverMode,
    otherIncome: () => INC.map((x) => ({ tanggal: x.tanggal, kategori: x.kategori, nominal: x.nominal })),
    realizedExpenses: () => EXP.filter((x) => x.status === 'paid').map((x) => ({ tanggal: x.tanggal, kategori: x.kategori, nominal: x.nominal })).concat(...EXTRA.map((f) => f())),
    addExpenseSource: (fn) => { EXTRA.push(fn); },
    expenses: () => EXP.map((x) => ({ ...x }))
  };

  const IKAT = ['Donasi', 'Sponsor', 'Hibah', 'Penjualan Merchandise', 'Lainnya'];
  const EKAT = ['Server & Domain', 'Operasional', 'Pemasaran', 'Sewa', 'Peralatan', 'Lain-lain'];
  const ES = { submitted: ['Diajukan', 'verif'], approved: ['Disetujui', 'gateway'], paid: ['Dibayar', 'paid'], rejected: ['Ditolak', 'failed'] };
  const badge = (key, map) => { const d = BD[map[key][1]]; return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap ' + d[1] + '"><span class="w-1.5 h-1.5 rounded-full ' + d[2] + '"></span>' + map[key][0] + '</span>'; };
  const card = (l, v, s2) => '<div class="' + CARD + ' p-4"><div class="text-sm text-slate-500 dark:text-slate-400">' + l + '</div><div class="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">' + v + '</div><div class="text-xs text-slate-400 mt-0.5">' + s2 + '</div></div>';
  const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);
  const pager = (id, p, pages, n, label) => '<span class="text-sm text-slate-500">' + n + ' ' + label + ' · halaman ' + p + ' dari ' + pages + '</span><span class="flex gap-2"><button type="button" data-co="' + id + '" data-id="-1" class="' + BTN + '" ' + (p <= 1 ? 'disabled style="opacity:.4"' : '') + '>Sebelumnya</button><button type="button" data-co="' + id + '" data-id="1" class="' + BTN + '" ' + (p >= pages ? 'disabled style="opacity:.4"' : '') + '>Berikutnya</button></span>';
  const lab = (id, t) => '<label class="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1" for="' + id + '">' + t + '</label>';
  const sel = (id, opts, cur) => '<select id="' + id + '" class="' + FIELD + ' w-full">' + opts.map((o) => '<option value="' + o + '"' + (o === cur ? ' selected' : '') + '>' + o + '</option>').join('') + '</select>';
  const modal = (html) => {
    let m = $('#finModal'); if (!m) { m = document.createElement('div'); m.id = 'finModal'; document.body.appendChild(m); }
    m.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50';
    m.innerHTML = '<div role="dialog" aria-modal="true" class="' + CARD + ' w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">' + html + '</div>';
  };
  const mhead = (t) => '<div class="flex items-start justify-between mb-4"><h2 class="text-lg font-extrabold text-slate-900 dark:text-white">' + t + '</h2><button type="button" data-fin="close" aria-label="Tutup" class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-xmark"></i></button></div>';
  const mfoot = (saveAttr) => '<p id="coErr" class="mt-3 text-sm text-rose-600" role="alert"></p><div class="flex justify-end gap-2 mt-4"><button type="button" data-fin="close" class="' + BTN + '">Batal</button><button type="button" ' + saveAttr + ' class="px-3.5 py-2 rounded-xl text-sm font-semibold bg-jade-600 text-white hover:bg-jade-700">Simpan</button></div>';
  const val = (id) => { const el = $('#' + id); return String(el && el.value != null ? el.value : '').trim(); };
  const fail = (t) => { const e = $('#coErr'); if (e) e.textContent = t; return null; };
  // Riwayat pengeluaran: setiap perubahan status dicatat bersama admin yang sedang login (bukan dari isian form).
  const NOADMIN = 'Sesi admin belum terbaca. Muat ulang halaman lalu coba lagi.';
  const stamp = (aksi, a) => ({ aksi, oleh: a.nama, uid: a.id, waktu: new Date().toISOString() });
  const jejak = (x) => (x.riwayat || []).map((h) => h.aksi + ' oleh ' + h.oleh + ' (' + h.waktu + ')').join(' | ');
  const closeM = () => K.closeDetail();
  const nextId = (arr, pre) => pre + '-' + String(1 + Math.max(0, ...arr.map((x) => parseInt(x.id.split('-')[1], 10) || 0))).padStart(3, '0');
  function readNominal(min, max) {
    const raw = val('coNominal'); if (!raw) return fail('Nominal wajib diisi.'); if (/[^\d.\s]/.test(raw)) return fail('Nominal hanya boleh berisi angka.');
    const n = parseInt(raw.replace(/[.\s]/g, ''), 10);
    if (!Number.isFinite(n) || n < min) return fail('Nominal minimal ' + rp(min) + '.'); if (n > max) return fail('Nominal maksimal ' + rp(max) + '.'); return n;
  }
  function readFile(required, old) {
    const el = $('#coFile'), f = el && el.files && el.files[0];
    if (!f) { if (required && !old) return fail('Bukti transaksi wajib dilampirkan.'); return old || ''; }
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) return fail('Bukti harus berupa PDF, JPG, atau PNG.');
    if (f.size > 2 * 1024 * 1024) return fail('Ukuran bukti maksimal 2 MB.');
    return f.name;
  }
  const fileField = (cur, req) => '<div class="sm:col-span-2">' + lab('coFile', 'Bukti transaksi' + (req ? '' : ' (opsional)')) + '<input id="coFile" type="file" accept=".pdf,.jpg,.jpeg,.png" class="' + FIELD + ' w-full">' + (cur ? '<p class="text-xs text-slate-400 mt-1">Saat ini: ' + esc(cur) + '. Pilih file baru untuk mengganti.</p>' : '') + '<p class="text-xs text-slate-400 mt-1">Saat ini hanya nama file yang tersimpan; unggah file sebenarnya butuh backend.</p></div>';

  // ================= PEMASUKAN PERUSAHAAN =================
  const PI = { q: '', sumber: '', page: 1, size: 10 };
  function incRows(filtered) {
    const a = K.trxList().filter((x) => x.status === 'paid').map((x) => ({ key: 'S:' + x.id, ref: x.id, tanggal: x.tanggal, sumber: 'siswa', kategori: 'Pembayaran Siswa', ket: x.siswa.nama + ' · ' + x.jalur, nominal: x.total }));
    const m = INC.map((x) => ({ key: 'M:' + x.id, ref: x.id, tanggal: x.tanggal, sumber: 'lain', kategori: x.kategori, ket: x.ket, nominal: x.nominal, bukti: x.bukti }));
    const q = filtered === false ? '' : PI.q.trim().toLowerCase(), src = filtered === false ? '' : PI.sumber;
    return a.concat(m).filter((r) => (!src || r.sumber === src) && (!q || (r.ref + ' ' + r.kategori + ' ' + r.ket).toLowerCase().includes(q))).sort((x, y) => y.tanggal.localeCompare(x.tanggal) || y.ref.localeCompare(x.ref));
  }
  function drawInc() {
    const all = incRows(false), s = all.filter((r) => r.sumber === 'siswa'), l = all.filter((r) => r.sumber === 'lain');
    const opt = (v, t) => '<option value="' + v + '"' + (PI.sumber === v ? ' selected' : '') + '>' + t + '</option>';
    $('#view-finance-pemasukan').innerHTML = head('Pemasukan Perusahaan', 'Gabungan pembayaran siswa yang Lunas (otomatis) dan pemasukan lain yang dicatat manual.',
      '<div class="flex gap-2"><button type="button" data-co="inc-export" class="' + BTN + '"><i class="fa-solid fa-file-arrow-down mr-1.5"></i>Export CSV</button><button type="button" data-co="inc-new" class="px-3.5 py-2 rounded-xl text-sm font-semibold bg-jade-600 text-white hover:bg-jade-700"><i class="fa-solid fa-plus mr-1.5"></i>Tambah pemasukan</button></div>') + banner() +
      '<div class="rounded-2xl border border-jade-200 dark:border-jade-500/30 bg-jade-50 dark:bg-jade-500/10 px-4 py-3 text-sm text-jade-800 dark:text-jade-200"><i class="fa-solid fa-circle-info mr-2"></i>Pembayaran siswa yang Lunas masuk otomatis dari Student Finance dan tidak bisa diubah di sini, jadi tidak pernah terhitung dua kali.</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' + card('Total pemasukan', rp(sum(all, (r) => r.nominal)), all.length + ' catatan') + card('Dari pembayaran siswa', rp(sum(s, (r) => r.nominal)), s.length + ' transaksi Lunas (otomatis)') + card('Pemasukan lain', rp(sum(l, (r) => r.nominal)), l.length + ' catatan manual') + '</div>' +
      '<div class="' + CARD + ' p-4 space-y-3"><div class="grid sm:grid-cols-3 gap-2"><input type="search" data-co-f="pi-q" value="' + esc(PI.q) + '" placeholder="Cari kategori atau keterangan" aria-label="Cari pemasukan" class="' + FIELD + ' sm:col-span-2"><select data-co-f="pi-sumber" aria-label="Sumber" class="' + FIELD + '">' + opt('', 'Semua sumber') + opt('siswa', 'Pembayaran siswa') + opt('lain', 'Pemasukan lain') + '</select></div><div class="overflow-x-auto"><table id="coInc" class="w-full text-sm min-w-[860px]"></table></div><div id="coIncPager" class="flex flex-wrap items-center justify-between gap-2"></div></div>';
    drawIncTable();
  }
  function drawIncTable() {
    const rows = incRows(), pages = Math.max(1, Math.ceil(rows.length / PI.size)); PI.page = Math.min(PI.page, pages);
    $('#coInc').innerHTML = '<thead><tr class="text-slate-500">' + ['Tanggal', 'Sumber', 'Kategori', 'Keterangan', 'Nominal', 'Aksi'].map((h) => '<th class="py-2 font-semibold">' + h + '</th>').join('') + '</tr></thead><tbody>' +
      (rows.slice((PI.page - 1) * PI.size, PI.page * PI.size).map((r) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2.5 whitespace-nowrap">' + fmt(r.tanggal) + '</td><td>' + (r.sumber === 'siswa' ? '<span class="text-xs font-semibold text-jade-700 dark:text-jade-300">Otomatis</span>' : '<span class="text-xs font-semibold text-slate-500">Manual</span>') + '</td><td>' + esc(r.kategori) + '</td><td>' + esc(r.ket) + '</td><td class="font-semibold whitespace-nowrap">' + rp(r.nominal) + '</td><td><div class="flex items-center justify-end gap-1.5">' +
        (r.sumber === 'siswa' ? ib('data-co-inc-detail', r.ref, 'fa-eye', IBTN, 'Lihat transaksi siswa') : ib('data-co-inc-edit', r.ref, 'fa-pen', IBTN, 'Ubah pemasukan') + ib('data-co-inc-del', r.ref, 'fa-trash', 'border-rose-100 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-100', 'Hapus pemasukan')) + '</div></td></tr>').join('') || '<tr><td colspan="6" class="py-10 text-center text-slate-400">Tidak ada pemasukan pada filter ini.</td></tr>') + '</tbody>';
    $('#coIncPager').innerHTML = pager('inc-page', PI.page, pages, rows.length, 'catatan');
  }
  function openInc(id) {
    const o = id ? INC.find((x) => x.id === id) : null; if (id && !o) return;
    const p = o || { tanggal: iso(today()), kategori: IKAT[0], ket: '', nominal: '', bukti: '' };
    modal(mhead(o ? 'Ubah pemasukan' : 'Tambah pemasukan') + '<div class="grid sm:grid-cols-2 gap-3"><div>' + lab('coTanggal', 'Tanggal') + '<input id="coTanggal" type="date" max="' + iso(today()) + '" value="' + esc(p.tanggal) + '" class="' + FIELD + ' w-full"></div><div>' + lab('coKategori', 'Kategori') + sel('coKategori', IKAT, p.kategori) + '</div>' +
      '<div class="sm:col-span-2">' + lab('coKet', 'Keterangan') + '<input id="coKet" type="text" maxlength="120" autocomplete="off" value="' + esc(p.ket) + '" class="' + FIELD + ' w-full"></div><div class="sm:col-span-2">' + lab('coNominal', 'Nominal (Rp)') + '<input id="coNominal" type="text" inputmode="numeric" autocomplete="off" value="' + esc(p.nominal) + '" class="' + FIELD + ' w-full"></div>' + fileField(p.bukti, false) + '</div>' + mfoot('data-co="inc-save" data-id="' + (o ? esc(o.id) : '') + '"'));
  }
  async function saveInc(id) {
    const tanggal = val('coTanggal'), ket = val('coKet'); if (!tanggal) return fail('Tanggal wajib diisi.'); if (tanggal > iso(today())) return fail('Tanggal tidak boleh di masa depan.');
    if (!ket) return fail('Keterangan wajib diisi.'); const nominal = readNominal(1000, 1000000000); if (nominal == null) return;
    const old = id ? INC.find((x) => x.id === id) : null, bukti = readFile(false, old && old.bukti); if (bukti === null) return;
    const kategori = val('coKategori') || IKAT[0];
    const body = { tanggal, kategori, nominal, keterangan: ket, bukti };
    if (serverMode) {
      try {
        const r = old && old.sid
          ? await api('/api/admin/finance/income/' + encodeURIComponent(old.sid), { method: 'PATCH', body })
          : await api('/api/admin/finance/income', { method: 'POST', body });
        const rec = mapInc(r.item);
        INC = old ? INC.map((x) => (x.id === id ? rec : x)) : [rec].concat(INC);
        save(IK, INC); closeM(); drawInc();
        audit('pemasukan', old ? 'update' : 'create', 'Pemasukan', rec.id,
          (old ? 'Ubah pemasukan ' : 'Tambah pemasukan ') + rec.id, old, rec);
        toast(old ? 'Pemasukan diperbarui.' : 'Pemasukan ditambahkan.');
        return;
      } catch (err) {
        toast('Gagal menyimpan ke server: ' + err.message, 'error');
        return;
      }
    }
    const rec = { id: old ? old.id : nextId(INC, 'INC'), tanggal, kategori, ket, nominal, bukti };
    INC = old ? INC.map((x) => (x.id === id ? rec : x)) : [rec].concat(INC);
    save(IK, INC); closeM(); drawInc();
    audit('pemasukan', old ? 'update' : 'create', 'Pemasukan', rec.id,
      (old ? 'Ubah pemasukan ' : 'Tambah pemasukan ') + rec.id, old, rec);
    toast(old ? 'Pemasukan diperbarui.' : 'Pemasukan ditambahkan.');
  }
  async function delInc(id) {
    const o = INC.find((x) => x.id === id); if (!o) return;
    if (!(await window.dcConfirm({ title: 'Hapus pemasukan?', message: o.id + ' · ' + o.ket + ' · ' + rp(o.nominal), detail: 'Data yang dihapus tidak bisa dikembalikan.', confirmText: 'Ya, hapus', cancelText: 'Batal', tone: 'danger' }))) return;
    if (serverMode && o.sid) {
      try { await api('/api/admin/finance/income/' + encodeURIComponent(o.sid), { method: 'DELETE' }); }
      catch (err) { toast('Gagal menghapus di server: ' + err.message, 'error'); return; }
    }
    INC = INC.filter((x) => x.id !== id); save(IK, INC); drawInc();
    audit('pemasukan', 'delete', 'Pemasukan', o.id, 'Hapus pemasukan ' + o.id, o, null);
    toast('Pemasukan dihapus.');
  }

  // ================= PENGELUARAN PERUSAHAAN =================
  const PE = { q: '', status: '', kategori: '', page: 1, size: 10 };
  const expFiltered = () => { const q = PE.q.trim().toLowerCase(); return EXP.filter((x) => (!PE.status || x.status === PE.status) && (!PE.kategori || x.kategori === PE.kategori) && (!q || (x.id + ' ' + x.ket + ' ' + x.kategori).toLowerCase().includes(q))).sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id)); };
  function drawExp() {
    const by = (s) => EXP.filter((x) => x.status === s), opt = (v, t, cur) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + t + '</option>';
    $('#view-finance-pengeluaran').innerHTML = head('Pengeluaran Perusahaan', 'Alur: Diajukan, Disetujui, lalu Dibayar. Hanya yang Dibayar dihitung sebagai kas keluar di laporan.',
      '<div class="flex gap-2"><button type="button" data-co="exp-export" class="' + BTN + '"><i class="fa-solid fa-file-arrow-down mr-1.5"></i>Export CSV</button><button type="button" data-co="exp-new" class="px-3.5 py-2 rounded-xl text-sm font-semibold bg-jade-600 text-white hover:bg-jade-700"><i class="fa-solid fa-plus mr-1.5"></i>Tambah pengeluaran</button></div>') + banner() +
      '<div class="rounded-2xl border border-jade-200 dark:border-jade-500/30 bg-jade-50 dark:bg-jade-500/10 px-4 py-3 text-sm text-jade-800 dark:text-jade-200"><i class="fa-solid fa-circle-info mr-2"></i>Gaji dan honor dicatat lewat menu Payroll, bukan di sini, supaya tidak terhitung dua kali.</div>' +
      '<div class="grid grid-cols-2 xl:grid-cols-4 gap-3">' + card('Menunggu persetujuan', by('submitted').length, rp(sum(by('submitted'), (x) => x.nominal))) + card('Disetujui, belum dibayar', by('approved').length, rp(sum(by('approved'), (x) => x.nominal))) + card('Sudah dibayar', by('paid').length, rp(sum(by('paid'), (x) => x.nominal))) + card('Ditolak', by('rejected').length, 'Tidak dihitung di laporan') + '</div>' +
      '<div class="' + CARD + ' p-4 space-y-3"><div class="grid sm:grid-cols-4 gap-2"><input type="search" data-co-f="pe-q" value="' + esc(PE.q) + '" placeholder="Cari ID atau keterangan" aria-label="Cari pengeluaran" class="' + FIELD + ' sm:col-span-2"><select data-co-f="pe-status" aria-label="Status" class="' + FIELD + '">' + opt('', 'Semua status', PE.status) + Object.keys(ES).map((k) => opt(k, ES[k][0], PE.status)).join('') + '</select><select data-co-f="pe-kategori" aria-label="Kategori" class="' + FIELD + '">' + opt('', 'Semua kategori', PE.kategori) + EKAT.map((k) => opt(k, k, PE.kategori)).join('') + '</select></div><div class="overflow-x-auto"><table id="coExp" class="w-full text-sm min-w-[980px]"></table></div><div id="coExpPager" class="flex flex-wrap items-center justify-between gap-2"></div></div>';
    drawExpTable();
  }
  function expActions(x) {
    const d = ib('data-co-exp-detail', x.id, 'fa-eye', IBTN, 'Lihat detail'), ok = 'border-emerald-100 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 hover:bg-emerald-100', no = 'border-rose-100 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-100';
    if (x.status === 'submitted') return d + ib('data-co-exp-edit', x.id, 'fa-pen', IBTN, 'Ubah') + ib('data-co-exp-approve', x.id, 'fa-check', ok, 'Setujui') + ib('data-co-exp-reject', x.id, 'fa-xmark', no, 'Tolak');
    if (x.status === 'approved') return d + ib('data-co-exp-pay', x.id, 'fa-money-bill-wave', ok, 'Tandai sudah dibayar');
    if (x.status === 'rejected') return d + ib('data-co-exp-edit', x.id, 'fa-pen', IBTN, 'Ubah dan ajukan ulang') + ib('data-co-exp-del', x.id, 'fa-trash', no, 'Hapus');
    return d;
  }
  function drawExpTable() {
    const rows = expFiltered(), pages = Math.max(1, Math.ceil(rows.length / PE.size)); PE.page = Math.min(PE.page, pages);
    $('#coExp').innerHTML = '<thead><tr class="text-slate-500">' + ['ID', 'Tanggal', 'Kategori', 'Keterangan', 'Nominal', 'Bukti', 'Status', 'Aksi'].map((h) => '<th class="py-2 font-semibold">' + h + '</th>').join('') + '</tr></thead><tbody>' +
      (rows.slice((PE.page - 1) * PE.size, PE.page * PE.size).map((x) => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-2.5 font-mono text-xs">' + x.id + '</td><td class="whitespace-nowrap">' + fmt(x.tanggal) + '</td><td>' + esc(x.kategori) + '</td><td>' + esc(x.ket) + '</td><td class="font-semibold whitespace-nowrap">' + rp(x.nominal) + '</td><td>' + (x.bukti ? '<i class="fa-solid fa-paperclip text-slate-400" title="' + esc(x.bukti) + '"></i>' : '<span class="text-slate-300">–</span>') + '</td><td>' + badge(x.status, ES) + '</td><td><div class="flex items-center justify-end gap-1.5">' + expActions(x) + '</div></td></tr>').join('') || '<tr><td colspan="8" class="py-10 text-center text-slate-400">Tidak ada pengeluaran pada filter ini.</td></tr>') + '</tbody>';
    $('#coExpPager').innerHTML = pager('exp-page', PE.page, pages, rows.length, 'pengeluaran');
  }
  function openExp(id) {
    const o = id ? EXP.find((x) => x.id === id) : null; if (id && (!o || (o.status !== 'submitted' && o.status !== 'rejected'))) return;
    const p = o || { tanggal: iso(today()), kategori: EKAT[0], ket: '', nominal: '', bukti: '' };
    modal(mhead(o ? 'Ubah pengeluaran' : 'Tambah pengeluaran') + '<div class="grid sm:grid-cols-2 gap-3"><div>' + lab('coTanggal', 'Tanggal') + '<input id="coTanggal" type="date" max="' + iso(today()) + '" value="' + esc(p.tanggal) + '" class="' + FIELD + ' w-full"></div><div>' + lab('coKategori', 'Kategori') + sel('coKategori', EKAT, p.kategori) + '</div>' +
      '<div class="sm:col-span-2">' + lab('coKet', 'Keterangan') + '<input id="coKet" type="text" maxlength="120" autocomplete="off" value="' + esc(p.ket) + '" class="' + FIELD + ' w-full"></div><div class="sm:col-span-2">' + lab('coNominal', 'Nominal (Rp)') + '<input id="coNominal" type="text" inputmode="numeric" autocomplete="off" value="' + esc(p.nominal) + '" class="' + FIELD + ' w-full"></div>' + fileField(p.bukti, false) + '</div>' +
      '<p class="mt-3 text-xs text-slate-400">' + (o && o.status === 'rejected' ? 'Menyimpan akan mengajukan ulang pengeluaran ini.' : 'Pengeluaran baru berstatus Diajukan sampai disetujui.') + ' Bukti wajib saat ditandai dibayar.</p>' + mfoot('data-co="exp-save" data-id="' + (o ? esc(o.id) : '') + '"'));
  }
  async function saveExp(id) {
    const tanggal = val('coTanggal'), ket = val('coKet'); if (!tanggal) return fail('Tanggal wajib diisi.'); if (tanggal > iso(today())) return fail('Tanggal tidak boleh di masa depan.');
    const kat = val('coKategori'); if (!EKAT.includes(kat)) return fail('Pilih kategori yang tersedia. Gaji dan honor dicatat lewat Payroll.');
    if (!ket) return fail('Keterangan wajib diisi.'); const nominal = readNominal(1000, 500000000); if (nominal == null) return;
    const old = id ? EXP.find((x) => x.id === id) : null, bukti = readFile(false, old && old.bukti); if (bukti === null) return;
    const body = { kategori: kat, nominal, tanggal, keterangan: ket, catatan: '', status: 'submitted', bukti };
    if (serverMode) {
      try {
        const r = old && old.sid
          ? await api('/api/admin/finance/expenses/' + encodeURIComponent(old.sid), { method: 'PATCH', body })
          : await api('/api/admin/finance/expenses', { method: 'POST', body });
        const rec = mapExp(r.item);
        EXP = old ? EXP.map((x) => (x.id === id ? rec : x)) : [rec].concat(EXP);
        save(EK, EXP); closeM(); drawExp();
        audit('pengeluaran', old ? 'update' : 'create', 'Pengeluaran', rec.id,
          (old ? 'Ajukan ulang ' : 'Tambah ') + rec.id, old, rec);
        toast(old ? 'Pengeluaran diajukan ulang.' : 'Pengeluaran diajukan.');
        return;
      } catch (err) {
        toast('Gagal menyimpan ke server: ' + err.message, 'error');
        return;
      }
    }
    const a = actor(); if (!a.nama) return fail(NOADMIN);
    const rec = { id: old ? old.id : nextId(EXP, 'EXP'), tanggal, kategori: kat, ket, nominal, status: 'submitted', bukti, catatan: '',
      dibuatOleh: old && old.dibuatOleh ? old.dibuatOleh : a.nama, riwayat: (old && old.riwayat || []).concat(stamp(old ? 'Diajukan ulang' : 'Diajukan', a)) };
    EXP = old ? EXP.map((x) => (x.id === id ? rec : x)) : [rec].concat(EXP);
    save(EK, EXP); closeM(); drawExp();
    audit('pengeluaran', old ? 'update' : 'create', 'Pengeluaran', rec.id,
      (old ? 'Ajukan ulang ' : 'Tambah ') + rec.id, old, rec);
    toast(old ? 'Pengeluaran diajukan ulang.' : 'Pengeluaran diajukan.');
  }
  async function patchExp(id, patch, aksi) {
    const x = EXP.find((e) => e.id === id); if (!x) return false;
    if (serverMode && x.sid) {
      try {
        const r = await api('/api/admin/finance/expenses/' + encodeURIComponent(x.sid), { method: 'PATCH', body: patch });
        const rec = mapExp(r.item);
        EXP = EXP.map((e) => (e.id === id ? rec : e));
        save(EK, EXP); drawExp();
        audit('pengeluaran', patch.status === 'paid' ? 'pay' : 'update', 'Pengeluaran', rec.id, aksi + ' ' + rec.id, x, rec);
        return true;
      } catch (err) {
        toast('Gagal memperbarui di server: ' + err.message, 'error');
        return false;
      }
    }
    const a = actor(); if (!a.nama) { toast(NOADMIN, 'error'); return false; }
    EXP = EXP.map((e) => (e.id === id ? { ...e, ...patch, riwayat: (e.riwayat || []).concat(stamp(aksi, a)) } : e));
    save(EK, EXP); drawExp();
    audit('pengeluaran', patch.status === 'paid' ? 'pay' : 'update', 'Pengeluaran', x.id, aksi + ' ' + x.id, x, { ...x, ...patch });
    return true;
  }
  async function approveExp(id) {
    const x = EXP.find((e) => e.id === id); if (!x || x.status !== 'submitted') return;
    if (!serverMode && !actor().nama) return toast(NOADMIN, 'error');
    if (!(await window.dcConfirm({ title: 'Setujui pengeluaran?', message: x.id + ' · ' + x.ket + ' · ' + rp(x.nominal), detail: 'Belum dihitung di laporan sampai ditandai dibayar.', confirmText: 'Ya, setujui', cancelText: 'Batal', tone: 'success' }))) return;
    if (await patchExp(id, { status: 'approved', catatan: '' }, 'Disetujui')) toast('Pengeluaran disetujui.');
  }
  async function rejectExp(id) {
    const x = EXP.find((e) => e.id === id); if (!x || x.status !== 'submitted') return;
    if (!serverMode && !actor().nama) return toast(NOADMIN, 'error');
    const r = await window.dcPrompt({ title: 'Tolak pengeluaran', message: x.id + ' · ' + x.ket + ' · ' + rp(x.nominal), placeholder: 'Alasan penolakan', confirmText: 'Tolak' });
    if (r === null) return; if (!String(r).trim()) return toast('Alasan penolakan wajib diisi.', 'error');
    if (await patchExp(id, { status: 'rejected', catatan: 'Ditolak: ' + String(r).trim() }, 'Ditolak')) toast('Pengeluaran ditolak.');
  }
  function openPay(id) {
    const x = EXP.find((e) => e.id === id); if (!x || x.status !== 'approved') return;
    modal(mhead('Tandai sudah dibayar') + '<p class="text-sm text-slate-600 dark:text-slate-300 mb-3">' + esc(x.id) + ' · ' + esc(x.ket) + ' · <b>' + rp(x.nominal) + '</b></p><div class="grid gap-3"><div>' + lab('coTanggal', 'Tanggal pembayaran') + '<input id="coTanggal" type="date" max="' + iso(today()) + '" value="' + iso(today()) + '" class="' + FIELD + ' w-full"></div>' + fileField(x.bukti, true) + '</div><p class="mt-3 text-xs text-slate-400">Setelah dibayar, pengeluaran dihitung di Ringkasan Finance dan laporan, dan tidak bisa diubah lagi.</p>' + mfoot('data-co="exp-pay-save" data-id="' + esc(x.id) + '"'));
  }
  async function savePay(id) {
    const x = EXP.find((e) => e.id === id); if (!x) return; const t = val('coTanggal');
    if (!t) return fail('Tanggal pembayaran wajib diisi.'); if (t > iso(today())) return fail('Tanggal tidak boleh di masa depan.'); if (t < x.tanggal) return fail('Tanggal pembayaran tidak boleh sebelum tanggal pengeluaran.');
    const bukti = readFile(true, x.bukti); if (bukti === null) return;
    closeM();
    if (await patchExp(id, { status: 'paid', bukti, tanggal: t }, 'Dibayar')) toast('Pengeluaran ditandai sudah dibayar.');
  }
  async function delExp(id) {
    const x = EXP.find((e) => e.id === id); if (!x || x.status !== 'rejected') return;
    if (!(await window.dcConfirm({ title: 'Hapus pengeluaran?', message: x.id + ' · ' + x.ket, detail: 'Hanya pengeluaran yang ditolak yang bisa dihapus.', confirmText: 'Ya, hapus', cancelText: 'Batal', tone: 'danger' }))) return;
    if (serverMode && x.sid) {
      try { await api('/api/admin/finance/expenses/' + encodeURIComponent(x.sid), { method: 'DELETE' }); }
      catch (err) { toast('Gagal menghapus di server: ' + err.message, 'error'); return; }
    }
    EXP = EXP.filter((e) => e.id !== id); save(EK, EXP); drawExp();
    audit('pengeluaran', 'delete', 'Pengeluaran', x.id, 'Hapus pengeluaran ' + x.id, x, null);
    toast('Pengeluaran dihapus.');
  }
  function detailExp(id) {
    const x = EXP.find((e) => e.id === id); if (!x) return;
    const row = (k, v) => '<div class="flex justify-between gap-4 py-2 border-t border-slate-100 dark:border-slate-800 text-sm"><span class="text-slate-500">' + k + '</span><span class="font-semibold text-right text-slate-800 dark:text-slate-100">' + v + '</span></div>';
    modal(mhead('Detail pengeluaran') + row('ID', x.id) + row('Tanggal', fmt(x.tanggal)) + row('Kategori', esc(x.kategori)) + row('Keterangan', esc(x.ket)) + row('Nominal', rp(x.nominal)) + row('Bukti', x.bukti ? esc(x.bukti) : '–') + row('Status', badge(x.status, ES)) + (x.dibuatOleh ? row('Diajukan oleh', esc(x.dibuatOleh)) : '') + (x.catatan ? row('Catatan', esc(x.catatan)) : '') +
      '<div class="mt-4 mb-1 text-sm font-extrabold text-slate-900 dark:text-white">Riwayat</div>' +
      ((x.riwayat || []).map((h) => row(esc(h.aksi), esc(h.oleh) + ' · ' + new Date(h.waktu).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }))).join('') || row('Belum tercatat', serverMode ? 'Lihat Audit Finance' : '–')) +
      '<p class="mt-3 text-xs text-slate-400">' + (serverMode ? 'Data tersimpan di server.' : 'Data contoh.') + '</p>');
  }

  window.DCCompany.ui = { card, badge, pager, lab, sel, modal, mhead, mfoot, val, fail, closeM, nextId, sum, load, save, EKAT };

  // ================= EVENT =================
  const csvOut = (name, rows, cols) => { if (!rows.length) return toast('Tidak ada data untuk diexport.', 'error'); K.download(name + '-' + iso(today()) + '.csv', K.csv(rows, cols)); toast('Export CSV: ' + rows.length + ' baris' + (serverMode ? '' : ' (data contoh)') + '.'); };
  const ACT = { 'inc-detail': (id) => K.openDetail(id), 'inc-edit': openInc, 'inc-del': delInc, 'exp-detail': detailExp, 'exp-edit': openExp, 'exp-del': delExp, 'exp-approve': approveExp, 'exp-reject': rejectExp, 'exp-pay': openPay };
  const BTNS = {
    'inc-new': () => openInc(''), 'inc-save': saveInc, 'inc-page': (d) => { PI.page += Number(d); drawIncTable(); },
    'inc-export': () => csvOut('pemasukan-perusahaan', incRows(), [['Tanggal', (r) => r.tanggal], ['Sumber', (r) => (r.sumber === 'siswa' ? 'Pembayaran siswa (otomatis)' : 'Manual')], ['Kategori', (r) => r.kategori], ['Keterangan', (r) => r.ket], ['Nominal', (r) => r.nominal]]),
    'exp-new': () => openExp(''), 'exp-save': saveExp, 'exp-pay-save': savePay, 'exp-page': (d) => { PE.page += Number(d); drawExpTable(); },
    'exp-export': () => csvOut('pengeluaran-perusahaan', expFiltered(), [['ID', (x) => x.id], ['Tanggal', (x) => x.tanggal], ['Kategori', (x) => x.kategori], ['Keterangan', (x) => x.ket], ['Nominal', (x) => x.nominal], ['Status', (x) => ES[x.status][0]], ['Bukti', (x) => x.bukti], ['Diajukan oleh', (x) => x.dibuatOleh || ''], ['Riwayat', jejak]])
  };
  document.addEventListener('click', (e) => {
    for (const a in ACT) { const el = e.target.closest('[data-co-' + a + ']'); if (el) return ACT[a](el.getAttribute('data-co-' + a)); }
    const b = e.target.closest('[data-co]'); if (b && BTNS[b.dataset.co]) BTNS[b.dataset.co](b.dataset.id);
  });
  document.addEventListener('input', (e) => {
    const a = e.target.closest('[data-co-f="pi-q"]'); if (a) { PI.q = a.value; PI.page = 1; drawIncTable(); }
    const b = e.target.closest('[data-co-f="pe-q"]'); if (b) { PE.q = b.value; PE.page = 1; drawExpTable(); }
  });
  document.addEventListener('change', (e) => {
    const a = e.target.closest('[data-co-f="pi-sumber"]'); if (a) { PI.sumber = a.value; PI.page = 1; drawIncTable(); }
    const s = e.target.closest('[data-co-f="pe-status"]'); if (s) { PE.status = s.value; PE.page = 1; drawExpTable(); }
    const k = e.target.closest('[data-co-f="pe-kategori"]'); if (k) { PE.kategori = k.value; PE.page = 1; drawExpTable(); }
  });
  const st = document.createElement('style');
  st.textContent = '#coInc th,#coInc td,#coExp th,#coExp td{text-align:center;padding-left:.75rem;padding-right:.75rem}#coInc .justify-end,#coExp .justify-end{justify-content:center}#coInc th,#coExp th{font-size:.7rem;text-transform:uppercase;letter-spacing:.04em}';
  document.head.appendChild(st);
  window.addEventListener('dc:view', (e) => {
    if (e.detail === 'finance-pemasukan') Promise.all([K.init(), readyP]).then(drawInc);
    else if (e.detail === 'finance-pengeluaran') Promise.all([K.init(), readyP]).then(drawExp);
  });
})();
