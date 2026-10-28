/* Halaman Plugin (admin): unggah ZIP, review, setujui/tolak, terbitkan, nonaktifkan, rollback.
   Alur backend: unggah -> karantina (needs_review) -> approved -> published.
   Memakai DCAdminApi (admin-api.js) dan dialog.js (dcConfirm / dcPrompt).
   Halaman dimuat sekali ketika menu "Plugin" dibuka pertama kali. */
(function () {
  'use strict';
  const view = document.getElementById('view-plugin');
  if (!view) return;

  const $ = (s, r = view) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m) => { if (typeof showToast === 'function') showToast(m); };
  const api = () => window.DCAdminApi;
  const MAX_BYTES = 20 * 1024 * 1024;
  const arr = (v) => (Array.isArray(v) ? v : []);

  // ---------- KONSTANTA TAMPILAN ----------
  const STATUS = {
    needs_review: { label: 'Perlu review', cls: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30' },
    approved:     { label: 'Disetujui',    cls: 'bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30' },
    published:    { label: 'Terbit',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30' },
    disabled:     { label: 'Nonaktif',     cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
    rolled_back:  { label: 'Digantikan',   cls: 'bg-violet-50 text-violet-700 border-violet-200/80 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30' },
    rejected:     { label: 'Ditolak',      cls: 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30' },
  };
  const FILTERS = [
    ['all', 'Semua', () => true],
    ['needs_review', 'Perlu review', (v) => v.status === 'needs_review'],
    ['approved', 'Disetujui', (v) => v.status === 'approved'],
    ['published', 'Terbit', (v) => v.status === 'published'],
    ['inactive', 'Nonaktif', (v) => v.status === 'disabled' || v.status === 'rolled_back'],
    ['rejected', 'Ditolak', (v) => v.status === 'rejected'],
  ];
  const BTN = 'px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none ';
  const NEUTRAL = BTN + 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700';
  const ACTIONS = {
    report:   { label: 'Laporan', icon: 'fa-solid fa-file-shield', cls: NEUTRAL },
    preview:  { label: 'Preview', icon: 'fa-solid fa-eye', cls: NEUTRAL },
    approve:  { label: 'Setujui', icon: 'fa-solid fa-check', cls: BTN + 'bg-emerald-600 hover:bg-emerald-500 text-white border-transparent' },
    reject:   { label: 'Tolak', icon: 'fa-solid fa-ban', cls: BTN + 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-950/40' },
    publish:  { label: 'Terbitkan', icon: 'fa-solid fa-rocket', cls: BTN + 'bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white border-transparent' },
    disable:  { label: 'Nonaktifkan', icon: 'fa-solid fa-power-off', cls: BTN + 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-950/30' },
    rollback: { label: 'Aktifkan lagi', icon: 'fa-solid fa-clock-rotate-left', cls: BTN + 'bg-sky-600 hover:bg-sky-500 text-white border-transparent' },
  };
  const BY_STATUS = {
    needs_review: ['report', 'preview', 'approve', 'reject'],
    approved: ['report', 'preview', 'publish', 'reject'],
    published: ['report', 'disable'],
    disabled: ['report', 'rollback'],
    rolled_back: ['report', 'rollback'],
    rejected: ['report'],
  };

  const state = { items: [], filter: 'all', loading: false, loaded: false, error: null, uploading: false, busy: new Set() };

  // ---------- KERANGKA HALAMAN ----------
  view.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-xs font-mono text-slate-400 dark:text-slate-500 mb-1">
          <span>Portal Admin</span><span>/</span><span>Konfigurasi</span><span>/</span>
          <span class="text-sky-600 dark:text-sky-400 font-medium">Plugin</span>
        </div>
        <h1 class="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2.5">
          Plugin
          <span id="plCount" class="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border border-sky-300/60 dark:border-sky-500/30">0 Versi</span>
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">Mini-aplikasi (game dan latihan interaktif) untuk portal siswa. Setiap ZIP masuk karantina dan harus direview sebelum terbit.</p>
      </div>
      <div class="flex items-center gap-2.5 self-start md:self-auto">
        <button type="button" id="plRefresh" class="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/90 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs transition" title="Muat ulang daftar" aria-label="Muat ulang daftar plugin"><i class="fa-solid fa-rotate"></i></button>
        <button type="button" id="plPick" class="flex items-center gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-md shadow-sky-600/20 active:scale-95 transition-all disabled:opacity-60">
          <i class="fa-solid fa-upload text-xs"></i><span id="plPickLabel">Unggah Plugin</span>
        </button>
      </div>
    </div>
    <input id="plFile" type="file" accept=".zip,application/zip,application/x-zip-compressed" class="hidden">

    <div id="plDrop" tabindex="0" role="button" aria-label="Pilih atau seret file ZIP plugin ke sini" class="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 hover:border-sky-400 dark:hover:border-sky-500 px-5 py-5 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer transition">
      <div class="w-11 h-11 shrink-0 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center text-lg"><i class="fa-solid fa-file-zipper"></i></div>
      <div class="min-w-0">
        <p class="text-sm font-bold text-slate-900 dark:text-white">Seret file ZIP plugin ke sini, atau klik untuk memilih</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Maksimal 20 MB. Wajib ada <code class="font-mono">manifest.json</code> dan file <code class="font-mono">entry</code>-nya. Unggah, setujui, terbitkan, dan rollback hanya untuk akun admin developer.</p>
      </div>
    </div>

    <div id="plStats" class="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4"></div>

    <div class="flex items-center bg-white dark:bg-slate-900 p-2.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-card">
      <div id="plFilter" class="flex items-center gap-1.5 overflow-x-auto p-0.5"></div>
    </div>

    <div id="plList" class="space-y-3"></div>`;

  // Modal laporan pemindaian
  document.body.insertAdjacentHTML('beforeend', `
  <div id="modalPluginReport" class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 hidden" role="dialog" aria-modal="true" aria-labelledby="plrTitle">
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col">
      <div class="flex items-start justify-between gap-3 p-5 border-b border-slate-200 dark:border-slate-800">
        <div class="min-w-0">
          <h3 id="plrTitle" class="text-base font-bold text-slate-900 dark:text-white truncate"></h3>
          <p id="plrSub" class="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 break-all"></p>
        </div>
        <button type="button" data-plr-close class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1" aria-label="Tutup"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>
      <div id="plrBody" class="p-5 overflow-y-auto space-y-4 text-xs"></div>
      <div class="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
        <button type="button" data-plr-close class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition">Tutup</button>
      </div>
    </div>
  </div>`);
  const modal = document.getElementById('modalPluginReport');

  // ---------- UTIL ----------
  const fmtBytes = (n) => {
    n = Number(n); if (!Number.isFinite(n)) return '-';
    return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  };
  const fmtDate = (s) => {
    if (!s) return '-';
    const d = new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const counts = (v) => {
    const r = v.scanReport && typeof v.scanReport === 'object' ? v.scanReport : {};
    return { critical: arr(r.critical).length, warnings: arr(r.warnings).length, other: arr(r.findings).length };
  };
  const finding = (f) => {
    if (typeof f === 'string') return esc(f);
    if (!f || typeof f !== 'object') return esc(String(f));
    const msg = f.message || f.msg || f.description || '';
    const where = f.file || f.path || f.entry || '';
    if (!msg && !f.code) return `<code class="font-mono break-all">${esc(JSON.stringify(f))}</code>`;
    return `${f.code ? `<span class="font-mono font-semibold">[${esc(f.code)}]</span> ` : ''}${esc(msg)}${where ? ` <span class="font-mono text-slate-400">(${esc(where)})</span>` : ''}`;
  };

  // ---------- RENDER ----------
  function renderStats() {
    const n = (st) => state.items.filter((v) => v.status === st).length;
    const box = (label, icon, tone, value, note) => `
      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-card">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">${label}</span>
          <div class="w-7 h-7 rounded-lg ${tone} flex items-center justify-center text-xs"><i class="${icon}"></i></div>
        </div>
        <p class="text-2xl font-extrabold text-slate-900 dark:text-white">${value.toLocaleString('id-ID')}</p>
        <span class="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-1 block">${note}</span>
      </div>`;
    $('#plStats').innerHTML =
      box('Total Versi', 'fa-solid fa-puzzle-piece', 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400', state.items.length, `${new Set(state.items.map((v) => v.plugin_id)).size} plugin`) +
      box('Perlu Review', 'fa-solid fa-hourglass-half', 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400', n('needs_review'), 'Menunggu keputusan') +
      box('Terbit', 'fa-solid fa-rocket', 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400', n('published'), 'Terlihat siswa') +
      box('Ditolak', 'fa-solid fa-ban', 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400', n('rejected'), 'Tetap di karantina');
  }

  function renderFilter() {
    const on = 'px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-600/25 whitespace-nowrap flex items-center gap-1.5';
    const off = 'px-4 py-2 rounded-xl text-xs font-semibold bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition whitespace-nowrap flex items-center gap-1.5';
    $('#plFilter').innerHTML = FILTERS.map(([key, label, fn]) =>
      `<button type="button" data-pl-filter="${key}" class="${key === state.filter ? on : off}">${esc(label)}<span class="opacity-70 font-mono">${state.items.filter(fn).length}</span></button>`).join('');
  }

  function message(icon, title, text, retry) {
    return `<div class="text-center py-12 px-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-card">
      <div class="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-xl"><i class="${icon}"></i></div>
      <p class="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">${esc(title)}</p>
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">${esc(text)}</p>
      ${retry ? '<button type="button" data-pl-retry class="mt-4 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold">Coba lagi</button>' : ''}
    </div>`;
  }

  function row(v) {
    const st = STATUS[v.status] || { label: v.status || '-', cls: STATUS.disabled.cls };
    const c = counts(v);
    const busy = state.busy.has(v.id);
    const chip = (text, cls) => `<span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md ${cls}">${text}</span>`;
    const chips = [
      c.critical ? chip(`${c.critical} kritis`, 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300') : '',
      c.warnings ? chip(`${c.warnings} peringatan`, 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300') : '',
      c.other ? chip(`${c.other} temuan`, 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300') : '',
      !(c.critical || c.warnings || c.other) ? chip('Tidak ada temuan', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300') : '',
    ].join('');
    const buttons = (BY_STATUS[v.status] || ['report']).map((k) => {
      const a = ACTIONS[k];
      return `<button type="button" data-pl-act="${k}" data-id="${esc(v.id)}" class="${a.cls}"${busy ? ' disabled' : ''}><i class="${a.icon} text-[11px]"></i>${a.label}</button>`;
    }).join('');
    return `
      <article class="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-card p-4 flex flex-col lg:flex-row lg:items-center gap-4">
        <div class="flex items-center gap-3.5 min-w-0 flex-1">
          <div class="w-11 h-11 shrink-0 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center text-lg"><i class="fa-solid fa-puzzle-piece"></i></div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-bold text-slate-900 dark:text-white text-sm truncate">${esc(v.name || v.plugin_id)}</h3>
              <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${st.cls}">${esc(st.label)}</span>
            </div>
            <p class="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 break-all">${esc(v.plugin_id)} &middot; v${esc(v.version)} &middot; diunggah ${esc(fmtDate(v.created_at))}${v.published_at ? ` &middot; terbit ${esc(fmtDate(v.published_at))}` : ''}</p>
            <div class="flex flex-wrap items-center gap-1.5 mt-2">${chips}${v.zip_sha256 ? `<span class="text-[10px] font-mono text-slate-400" title="SHA-256 ${esc(v.zip_sha256)}">sha256 ${esc(String(v.zip_sha256).slice(0, 10))}&hellip;</span>` : ''}</div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 lg:justify-end">${buttons}</div>
      </article>`;
  }

  function renderList() {
    const box = $('#plList');
    if (state.loading && !state.loaded) return void (box.innerHTML = message('fa-solid fa-spinner fa-spin', 'Memuat daftar plugin…', 'Mengambil data dari server.'));
    if (state.error) {
      const forbidden = state.error.code === 'ADMIN_REQUIRED' || state.error.status === 403;
      return void (box.innerHTML = message('fa-solid fa-lock', forbidden ? 'Akses ditolak' : 'Gagal memuat plugin',
        forbidden ? `${state.error.message} Akun yang sedang login belum berperan admin di server.` : state.error.message, true));
    }
    const fn = (FILTERS.find((f) => f[0] === state.filter) || FILTERS[0])[2];
    const rows = state.items.filter(fn);
    if (!state.items.length) return void (box.innerHTML = message('fa-solid fa-box-open', 'Belum ada plugin', 'Unggah ZIP plugin pertama lewat tombol "Unggah Plugin" di atas.'));
    if (!rows.length) return void (box.innerHTML = message('fa-solid fa-filter', 'Tidak ada versi di filter ini', 'Pilih filter lain untuk melihat versi plugin.'));
    box.innerHTML = rows.map(row).join('');
  }

  function render() {
    renderStats(); renderFilter(); renderList();
    $('#plCount').textContent = `${state.items.length} Versi`;
    $('#plPick').disabled = state.uploading;
    $('#plPickLabel').textContent = state.uploading ? 'Mengunggah…' : 'Unggah Plugin';
  }

  // ---------- DATA ----------
  async function load() {
    state.loading = true; render();
    try {
      const res = await api().plugins();
      state.items = arr(res.plugins);
      state.error = null;
    } catch (err) {
      state.error = { message: err.message || 'Gagal memuat plugin.', code: err.code, status: err.status };
    }
    state.loading = false; state.loaded = true; render();
  }

  // ---------- LAPORAN PEMINDAIAN ----------
  function openReport({ title, sub, report }) {
    const r = report && typeof report === 'object' ? report : {};
    const group = (key, label, tone) => {
      const list = arr(r[key]);
      if (!list.length) return '';
      return `<section>
        <h4 class="font-bold text-slate-800 dark:text-slate-100 mb-1.5">${label} <span class="font-mono font-normal text-slate-400">(${list.length})</span></h4>
        <ul class="space-y-1.5">${list.map((f) => `<li class="px-3 py-2 rounded-lg border ${tone} leading-relaxed">${finding(f)}</li>`).join('')}</ul>
      </section>`;
    };
    const facts = [
      ['Hasil', r.outcome], ['Pemindai', r.scanner], ['Jumlah file', r.fileCount],
      ['Ukuran terurai', r.totalUncompressed != null ? fmtBytes(r.totalUncompressed) : null], ['SHA-256', r.sha256],
    ].filter(([, v]) => v !== undefined && v !== null && v !== '');
    const manual = r.manualReview && typeof r.manualReview === 'object' ? r.manualReview : null;
    const sections = group('critical', 'Temuan kritis', 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200')
      + group('warnings', 'Peringatan', 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200')
      + group('findings', 'Temuan lain', 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200');
    $('#plrTitle', modal).textContent = title || 'Laporan pemindaian';
    $('#plrSub', modal).textContent = sub || '';
    $('#plrBody', modal).innerHTML = `
      ${sections || '<p class="px-3 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">Tidak ada temuan dari pemindaian otomatis. Tetap periksa isi plugin sebelum menyetujui.</p>'}
      ${manual ? `<section><h4 class="font-bold text-slate-800 dark:text-slate-100 mb-1.5">Review manual</h4>
        <p class="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">${esc(manual.status || '')}${manual.reason ? `: ${esc(manual.reason)}` : ''}${manual.reviewedAt ? ` <span class="font-mono text-slate-400">(${esc(fmtDate(manual.reviewedAt))})</span>` : ''}</p></section>` : ''}
      ${facts.length ? `<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">${facts.map(([k, v]) => `<dt class="text-slate-400 font-mono">${esc(k)}</dt><dd class="text-slate-700 dark:text-slate-200 font-mono break-all">${esc(v)}</dd>`).join('')}</dl>` : ''}
      <details class="group"><summary class="cursor-pointer text-slate-500 dark:text-slate-400 font-semibold select-none">Data mentah (JSON)</summary>
        <pre class="mt-2 p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-64">${esc(JSON.stringify(r, null, 2))}</pre></details>`;
    modal.classList.remove('hidden');
  }
  const closeReport = () => modal.classList.add('hidden');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-plr-close]')) closeReport(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeReport(); });

  // ---------- AKSI ----------
  const CONFIRM = {
    approve: { title: 'Setujui versi ini?', message: 'Versi ditandai sudah direview. Belum tampil ke siswa sampai kamu menerbitkannya.', confirmText: 'Ya, setujui', tone: 'info' },
    publish: { title: 'Terbitkan ke siswa?', message: 'Plugin akan tersedia di portal siswa sesuai jenjang di manifest. Versi yang sudah terbit tidak bisa diubah, hanya bisa dinonaktifkan atau diganti versi baru.', confirmText: 'Ya, terbitkan', tone: 'warning' },
    disable: { title: 'Nonaktifkan plugin ini?', message: 'Plugin disembunyikan dari siswa. File tetap disimpan untuk audit dan rollback.', confirmText: 'Ya, nonaktifkan', tone: 'warning' },
    rollback: { title: 'Aktifkan versi ini lagi?', message: 'Versi ini menjadi versi aktif. Versi lain dari plugin yang sama yang masih terbit akan digantikan.', confirmText: 'Ya, aktifkan', tone: 'info' },
  };
  const DONE = { approve: 'Versi disetujui.', reject: 'Versi ditolak.', publish: 'Plugin diterbitkan ke siswa.', disable: 'Plugin dinonaktifkan.', rollback: 'Versi diaktifkan kembali.' };

  async function preview(v) {
    // Buka tab dulu (sinkron) supaya tidak diblokir pop-up blocker, lalu isi URL-nya.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const res = await api().pluginAction(v.id, 'preview-ticket');
      if (!/^https?:\/\//i.test(String(res.url || ''))) throw new Error('Server tidak memberi URL preview yang valid.');
      if (tab) tab.location.href = res.url; else toast('Pop-up diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.');
    } catch (err) {
      if (tab) tab.close();
      toast(err.message || 'Gagal membuat preview.');
    }
  }

  async function act(action, id) {
    const v = state.items.find((x) => String(x.id) === String(id));
    if (!v || state.busy.has(v.id)) return;
    if (action === 'report') return openReport({ title: v.name || v.plugin_id, sub: `${v.plugin_id} · v${v.version} · ${(STATUS[v.status] || {}).label || v.status}`, report: v.scanReport });
    if (action === 'preview') return preview(v);

    let body = {};
    if (action === 'reject') {
      const reason = await dcPrompt({ title: 'Tolak versi ini?', message: 'Tulis alasan singkat supaya tercatat di laporan (boleh dikosongkan).', detail: `${v.plugin_id} v${v.version}`, placeholder: 'Contoh: meminta akses jaringan yang tidak perlu', confirmText: 'Tolak versi', tone: 'danger', icon: 'fa-solid fa-ban', validate: (t) => (t.length > 500 ? 'Maksimal 500 karakter.' : '') });
      if (reason === null) return;
      if (reason) body = { reason };
    } else if (CONFIRM[action]) {
      if (!(await dcConfirm({ ...CONFIRM[action], detail: `${v.plugin_id} v${v.version}` }))) return;
    } else return;

    state.busy.add(v.id); render();
    try {
      await api().pluginAction(v.id, action, body);
      toast(DONE[action] || 'Berhasil.');
      await load();
    } catch (err) {
      toast(err.message || 'Aksi gagal dijalankan.');
    } finally {
      state.busy.delete(v.id); render();
    }
  }

  async function upload(file) {
    if (!file || state.uploading) return;
    if (!/\.zip$/i.test(file.name)) return toast('File harus berformat .zip.');
    if (!file.size || file.size > MAX_BYTES) return toast('Ukuran ZIP harus antara 1 KB dan 20 MB.');
    state.uploading = true; render();
    try {
      const res = await api().uploadPlugin(file);
      toast(res.message || 'ZIP masuk karantina dan menunggu review.');
      await load();
      const fresh = state.items.find((v) => v.upload_id === res.uploadId);
      if (fresh && (counts(fresh).critical || counts(fresh).warnings || counts(fresh).other)) act('report', fresh.id);
    } catch (err) {
      toast(err.message || 'Gagal mengunggah plugin.');
      if (err.details && typeof err.details === 'object') openReport({ title: 'ZIP ditolak', sub: file.name, report: err.details });
    } finally {
      state.uploading = false; render();
    }
  }

  // ---------- EVENT ----------
  const fileInput = $('#plFile'), drop = $('#plDrop');
  $('#plPick').addEventListener('click', () => { if (!state.uploading) fileInput.click(); });
  fileInput.addEventListener('change', () => { const f = fileInput.files[0]; fileInput.value = ''; upload(f); });
  drop.addEventListener('click', () => { if (!state.uploading) fileInput.click(); });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!state.uploading) fileInput.click(); } });
  const hot = (on) => drop.classList.toggle('border-sky-500', on);
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); hot(true); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); hot(false); }));
  drop.addEventListener('drop', (e) => upload(e.dataTransfer && e.dataTransfer.files[0]));
  $('#plRefresh').addEventListener('click', load);

  view.addEventListener('click', (e) => {
    const f = e.target.closest('[data-pl-filter]'); if (f) { state.filter = f.dataset.plFilter; return render(); }
    if (e.target.closest('[data-pl-retry]')) return load();
    const b = e.target.closest('[data-pl-act]'); if (b) act(b.dataset.plAct, b.dataset.id);
  });

  // Muat data saat halaman Plugin pertama kali ditampilkan (lewat menu atau #plugin di URL).
  const ensureLoaded = () => { if (!view.classList.contains('hidden') && !state.loaded && !state.loading) load(); };
  new MutationObserver(ensureLoaded).observe(view, { attributes: true, attributeFilter: ['class'] });
  ensureLoaded();
  render();
})();
