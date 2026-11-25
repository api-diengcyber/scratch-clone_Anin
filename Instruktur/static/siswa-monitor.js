/*
 * Pantau Siswa (Student Monitoring) untuk panel Instruktur.
 * Dipasang lewat window.DCSiswa.mount(elemen) dari instruktur.js (view "siswa").
 *
 * Data: GET /api/instruktur/siswa dan /api/instruktur/siswa/:id.
 * Kalau endpoint belum ada (404/405/501/offline) -> memakai window.DCSiswaMock dan menampilkan banner "Mode contoh".
 * Siswa mana yang boleh dilihat ditentukan backend; halaman ini hanya menampilkan apa yang dikembalikan.
 * Penilaian dan feedback tetap lewat halaman Tugas Tambahan (tidak diduplikasi di sini).
 */
(function () {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const INPUT = 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
  const CARD = 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-card';
  const GRADES = { SD: 'SD', SMP: 'SMP', SMK: 'SMA/SMK' };
  const TONE = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-300/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
    warn: 'bg-amber-50 text-amber-800 border-amber-300/70 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
    bad: 'bg-rose-50 text-rose-700 border-rose-300/70 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
    info: 'bg-sky-50 text-sky-700 border-sky-200/70 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30',
    proc: 'bg-indigo-50 text-indigo-700 border-indigo-200/70 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30',
    mute: 'bg-slate-100 text-slate-600 border-slate-300/70 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
  };
  const STATUS = { aktif: ['Aktif', TONE.ok], perlu_perhatian: ['Perlu perhatian', TONE.warn], tidak_aktif: ['Tidak aktif', TONE.mute] };
  const DOT = { aktif: 'bg-emerald-500', perlu_perhatian: 'bg-amber-500', tidak_aktif: 'bg-slate-400' };
  const dotStatus = (st) => `<span class="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap"><span class="w-2 h-2 rounded-full ${DOT[st]}"></span>${esc(STATUS[st][0])}</span>`;
  const TUGAS = { menunggu: ['Menunggu Penilaian', TONE.warn], sedang_dinilai: ['Sedang Dinilai', TONE.proc], revisi: ['Perlu Revisi', TONE.bad], selesai: ['Selesai', TONE.ok] };
  const TUGAS_ALIAS = { dikumpulkan: 'menunggu', dinilai: 'selesai' };   // status lama dari penilaian cepat
  const tugasKey = (st) => (TUGAS[st] ? st : TUGAS_ALIAS[st] || 'menunggu');
  const HADIR = { hadir: ['Hadir', TONE.ok], izin: ['Izin', TONE.warn], alpa: ['Alpa', TONE.bad] };
  const pill = (pair) => `<span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${pair[1]}">${esc(pair[0])}</span>`;

  // ---------- util ----------
  const dayDiff = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.floor((Date.now() - t) / 864e5) : null; };
  const ago = (iso) => { const d = dayDiff(iso); return d === null ? 'Belum ada aktivitas' : d <= 0 ? 'Hari ini' : d === 1 ? 'Kemarin' : d + ' hari lalu'; };
  const fmt = (iso) => { try { return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return '-'; } };
  const initials = (n) => { const p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
  const safeImg = (u) => (/^(https:\/\/|data:image\/)/i.test(u || '') ? u : '');
  const avatar = (s, size) => `<span class="${size || 'w-10 h-10'} shrink-0 rounded-full overflow-hidden bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 font-bold text-sm flex items-center justify-center">${safeImg(s.avatarUrl) ? `<img src="${esc(safeImg(s.avatarUrl))}" alt="" class="w-full h-full object-cover">` : esc(initials(s.nama))}</span>`;
  const barTone = (p) => (p >= 70 ? 'bg-emerald-500' : p >= 30 ? 'bg-sky-500' : 'bg-amber-500');
  const bar = (p) => `<div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><div class="h-full rounded-full ${barTone(p)}" style="width:${p}%"></div></div>`;

  // Status belajar: pakai dari server kalau ada; kalau tidak, hitung dari aktivitas terakhir (aturan sederhana di frontend).
  function norm(x) {
    const progress = Math.max(0, Math.min(100, Number(x.progress) || 0));
    const d = dayDiff(x.lastActive);
    const status = STATUS[x.status] ? x.status : (d === null || d > 14 ? 'tidak_aktif' : d > 7 ? 'perlu_perhatian' : 'aktif');
    return { ...x, id: String(x.id), nama: String(x.nama || x.username || 'Tanpa nama'), grade: GRADES[x.grade] ? x.grade : '', progress,
      tasksDone: Number(x.tasksDone) || 0, tasksTotal: Number(x.tasksTotal) || 0, pendingReview: Number(x.pendingReview) || 0,
      pathName: x.pathName || '-', pathKey: String(x.pathId || x.pathName || ''), status };
  }

  // ---------- data: server dulu, contoh kalau endpoint belum ada ----------
  const missing = (e) => e && [0, 404, 405, 501].includes(e.status);
  let isMock = false;
  async function fetchOr(path, mockFn) {
    try { const r = await window.DCAdminApi.request(path); isMock = false; return r; }
    catch (e) { if (missing(e) && window.DCSiswaMock) { isMock = true; return mockFn(); } throw e; }
  }
  const loadList = async () => { const r = await fetchOr('/api/instruktur/siswa', () => ({ items: window.DCSiswaMock.list() })); return (r.items || r.siswa || []).map(norm); };
  const loadDetail = (id) => fetchOr('/api/instruktur/siswa/' + encodeURIComponent(id), () => window.DCSiswaMock.detail(id));

  // ---------- state ----------
  const S = { root: null, items: [], q: '', grade: '', path: '', status: '', sort: 'aktivitas', quick: '', tab: 'overview', detail: null };

  const banner = () => (isMock ? `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"><i class="fa-solid fa-flask mt-0.5"></i><span><b>Mode contoh:</b> endpoint <code>/api/instruktur/siswa</code> belum tersedia. Yang tampil adalah data contoh, bukan siswa sungguhan.</span></div>` : '');
  const empty = (icon, title, msg, btn) => `<div class="px-6 py-14 text-center"><span class="mx-auto w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-lg"><i class="fa-solid ${icon}"></i></span><h3 class="mt-4 font-bold text-slate-800 dark:text-white">${esc(title)}</h3><p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">${esc(msg)}</p>${btn || ''}</div>`;
  const skeleton = (n) => `<div class="divide-y divide-slate-100 dark:divide-slate-800" aria-busy="true" aria-label="Memuat">${Array.from({ length: n || 5 }, () => '<div class="flex items-center gap-4 px-5 py-4"><div class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse"></div><div class="flex-1 space-y-2"><div class="h-3 w-1/3 rounded bg-slate-100 dark:bg-slate-800 animate-pulse"></div><div class="h-2.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800 animate-pulse"></div></div></div>').join('')}</div>`;
  const COLS = 'xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1.7fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_1rem]';

  // ---------- daftar ----------
  async function showList() {
    S.detail = null;
    S.root.innerHTML = `<div class="space-y-5"><div><h1 class="text-2xl font-bold text-slate-900 dark:text-white">Pantau siswa</h1><p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Lihat perkembangan siswa yang kamu dampingi dan siapa yang perlu perhatian.</p></div><div id="smBanner"></div><div id="smKpi"></div><div id="smFilters"></div><div id="smResults">${skeleton()}</div></div>`;
    try { S.items = await loadList(); }
    catch (e) { $('#smResults').innerHTML = empty('fa-triangle-exclamation', 'Data siswa gagal dimuat', e.message || 'Terjadi kesalahan. Coba lagi.', '<button type="button" data-sm="retry" class="dc-btn dc-btn-pri mt-5">Coba lagi</button>'); return; }
    $('#smBanner').innerHTML = banner();
    drawFilters(); drawKpi(); drawResults();
  }
  const $ = (s) => S.root.querySelector(s);

  function drawKpi() {
    const a = S.items, n = (f) => a.filter(f).length;
    const chip = (key, label, dot, val) => { const on = S.quick === key; return `<button type="button" data-sm="quick" data-q="${key}" aria-pressed="${on}" class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${on ? 'bg-sky-50 border-sky-300 text-sky-800 font-semibold dark:bg-sky-500/15 dark:border-sky-500/40 dark:text-sky-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white'}"><span class="w-2 h-2 rounded-full ${dot}"></span>${label}<b class="${on ? '' : 'text-slate-900 dark:text-white'}">${val}</b></button>`; };
    $('#smKpi').innerHTML = `<div class="flex flex-wrap gap-2">${chip('', 'Semua', 'bg-slate-400', a.length)}${chip('aktif', 'Aktif', 'bg-emerald-500', n((x) => x.status === 'aktif'))}${chip('menunggu', 'Menunggu penilaian', 'bg-amber-500', n((x) => x.pendingReview > 0))}${chip('perhatian', 'Perlu perhatian', 'bg-rose-500', n((x) => x.status !== 'aktif'))}</div>`;
  }

  const filterCount = () => ['q', 'grade', 'path', 'status', 'quick'].filter((k) => S[k]).length;

  function drawFilters() {
    const grades = [...new Set(S.items.map((x) => x.grade).filter(Boolean))];
    const paths = new Map(); S.items.filter((x) => !S.grade || x.grade === S.grade).forEach((x) => paths.set(x.pathKey, x.pathName));
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
    const ae = document.activeElement, keep = ae && S.root.contains(ae) && ae.dataset ? ae.dataset.f : '', caret = keep === 'q' ? ae.selectionStart : 0;
    const sel = `${INPUT} pr-8 cursor-pointer`;
    $('#smFilters').innerHTML = `<div class="space-y-2.5">
      <label class="relative block"><span class="sr-only">Cari siswa</span><i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i><input data-f="q" type="search" value="${esc(S.q)}" placeholder="Cari nama atau username siswa" class="${INPUT} w-full pl-10 !bg-white dark:!bg-slate-900"></label>
      <div class="flex flex-col sm:flex-row sm:items-center gap-2.5"><div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 flex-1">
        <select data-f="grade" aria-label="Filter jenjang" class="${sel}">${opt('', 'Semua jenjang', S.grade)}${grades.map((g) => opt(g, GRADES[g], S.grade)).join('')}</select>
        <select data-f="path" aria-label="Filter Learning Path" class="${sel} col-span-2 sm:col-span-1">${opt('', 'Semua Learning Path', S.path)}${[...paths].map(([k, l]) => opt(k, l, S.path)).join('')}</select>
        <select data-f="status" aria-label="Filter status belajar" class="${sel}">${opt('', 'Semua status', S.status)}${Object.entries(STATUS).map(([k, v]) => opt(k, v[0], S.status)).join('')}</select>
        <select data-f="sort" aria-label="Urutkan" class="${sel}">${opt('aktivitas', 'Aktivitas terbaru', S.sort)}${opt('progress_desc', 'Progress tertinggi', S.sort)}${opt('progress_asc', 'Progress terendah', S.sort)}${opt('nama', 'Nama A-Z', S.sort)}</select></div>
      ${filterCount() ? `<button type="button" data-sm="reset" class="dc-btn dc-btn-ghost dc-btn-sm shrink-0 self-start sm:self-auto"><i class="fa-solid fa-xmark"></i><span>Reset (${filterCount()})</span></button>` : ''}</div></div>`;
    if (keep) { const el = $('[data-f="' + keep + '"]'); if (el) { el.focus(); if (keep === 'q') try { el.setSelectionRange(caret, caret); } catch (_) {} } }
  }

  function filtered() {
    const q = S.q.trim().toLowerCase();
    const a = S.items.filter((x) =>
      (!q || (x.nama + ' ' + (x.username || '')).toLowerCase().includes(q)) && (!S.grade || x.grade === S.grade) && (!S.path || x.pathKey === S.path) && (!S.status || x.status === S.status) &&
      (S.quick === '' || (S.quick === 'aktif' && x.status === 'aktif') || (S.quick === 'menunggu' && x.pendingReview > 0) || (S.quick === 'perhatian' && x.status !== 'aktif')));
    const t = (x) => Date.parse(x.lastActive) || 0;
    const by = { aktivitas: (x, y) => t(y) - t(x), progress_desc: (x, y) => y.progress - x.progress, progress_asc: (x, y) => x.progress - y.progress, nama: (x, y) => x.nama.localeCompare(y.nama, 'id') };
    return a.sort(by[S.sort] || by.aktivitas);
  }

  function row(s) {
    const pend = s.pendingReview ? `<span class="inline-flex mt-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${TONE.warn} border">${s.pendingReview} perlu dinilai</span>` : '';
    return `<article data-sm="open" data-id="${esc(s.id)}" class="bg-white dark:bg-slate-900 grid grid-cols-2 ${COLS} gap-x-4 gap-y-2.5 items-center px-4 sm:px-5 py-4 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <div class="col-span-2 xl:col-span-1 flex items-center gap-3 min-w-0">${avatar(s)}<div class="min-w-0"><button type="button" data-sm="open" data-id="${esc(s.id)}" class="block max-w-full text-left font-semibold text-slate-900 dark:text-white truncate hover:text-sky-700 dark:hover:text-sky-300 focus:outline-none focus-visible:underline">${esc(s.nama)}</button><p class="text-xs text-slate-500 dark:text-slate-400 truncate">${s.grade ? esc(GRADES[s.grade]) : 'Jenjang belum diisi'}${s.username ? ' · @' + esc(s.username) : ''}</p></div></div>
      <div class="col-span-2 xl:col-span-1 min-w-0"><p class="text-sm text-slate-700 dark:text-slate-200 break-words">${esc(s.pathName)}</p><p class="text-xs text-slate-500 dark:text-slate-400">${s.tasksDone}${s.tasksTotal ? ' dari ' + s.tasksTotal : ''} task selesai</p></div>
      <div class="col-span-2 xl:col-span-1 flex items-center gap-2.5"><div class="flex-1">${bar(s.progress)}</div><b class="w-9 text-right text-sm text-slate-800 dark:text-slate-100">${s.progress}%</b></div>
      <div class="min-w-0"><p class="text-sm text-slate-700 dark:text-slate-200">${esc(ago(s.lastActive))}</p>${pend}</div>
      <div class="justify-self-end xl:justify-self-start">${dotStatus(s.status)}</div>
      <i class="fa-solid fa-chevron-right text-[10px] text-slate-300 dark:text-slate-600 hidden xl:block"></i></article>`;
  }

  function drawResults() {
    const a = filtered();
    if (!S.items.length) { $('#smResults').innerHTML = empty('fa-user-graduate', 'Belum ada siswa', 'Siswa yang kamu dampingi akan muncul di sini setelah ditugaskan oleh admin.'); return; }
    if (!a.length) { $('#smResults').innerHTML = empty('fa-magnifying-glass', 'Tidak ada siswa yang cocok', 'Coba ubah kata kunci atau hapus sebagian filter.', '<button type="button" data-sm="reset" class="dc-btn dc-btn-sec mt-5">Reset filter</button>'); return; }
    $('#smResults').innerHTML = `<p class="text-xs text-slate-500 dark:text-slate-400 mb-2.5" aria-live="polite">${a.length === S.items.length ? a.length + ' siswa' : a.length + ' dari ' + S.items.length + ' siswa'}</p>
      <div class="border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div class="hidden xl:grid ${COLS} gap-x-4 px-5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200/90 dark:border-slate-800"><span>Siswa</span><span>Learning Path</span><span>Progress</span><span>Aktivitas terakhir</span><span>Status</span><span></span></div>
        <div class="divide-y divide-slate-100 dark:divide-slate-800">${a.map(row).join('')}</div></div>`;
  }

  // ---------- detail ----------
  const TABS = [['overview', 'Ringkasan'], ['aktivitas', 'Aktivitas belajar'], ['tugas', 'Tugas dan nilai'], ['hadir', 'Kehadiran']];

  async function openDetail(id) {
    const base = S.items.find((x) => x.id === id);
    S.tab = 'overview';
    S.root.innerHTML = `<div class="space-y-5"><button type="button" data-sm="back" class="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-sky-700 dark:hover:text-sky-300"><i class="fa-solid fa-arrow-left text-xs"></i><span>Pantau siswa</span></button><div id="smDetail">${skeleton(3)}</div></div>`;
    try { const d = await loadDetail(id); S.detail = { ...d, item: norm({ ...(base || {}), ...(d.item || {}) }) }; }
    catch (e) { $('#smDetail').innerHTML = empty('fa-triangle-exclamation', 'Detail siswa gagal dimuat', e.message || 'Terjadi kesalahan. Coba lagi.', `<button type="button" data-sm="open" data-id="${esc(id)}" class="dc-btn dc-btn-pri mt-5">Coba lagi</button>`); return; }
    drawDetail();
  }

  function ring(p) {
    const C = 2 * Math.PI * 36, off = C * (1 - p / 100);
    return `<div class="relative w-24 h-24 shrink-0" role="img" aria-label="Progress ${p} persen"><svg viewBox="0 0 88 88" class="w-24 h-24 -rotate-90"><circle cx="44" cy="44" r="36" fill="none" stroke-width="8" class="stroke-slate-100 dark:stroke-slate-800"/><circle cx="44" cy="44" r="36" fill="none" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" class="stroke-sky-500"/></svg><span class="absolute inset-0 flex flex-col items-center justify-center"><b class="text-xl text-slate-900 dark:text-white leading-none">${p}%</b><span class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">selesai</span></span></div>`;
  }

  const pendOf = (d) => (Array.isArray(d.tugas) ? d.tugas.filter((t) => tugasKey(t.status) === 'menunggu').length : d.item.pendingReview);

  function drawDetail() {
    const d = S.detail, s = d.item, pend = pendOf(d);
    const tabs = TABS.map(([k, l]) => `<button type="button" role="tab" id="smTab-${k}" aria-selected="${S.tab === k}" aria-controls="smPanel" tabindex="${S.tab === k ? 0 : -1}" data-sm="tab" data-tab="${k}" class="px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors focus:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800/50 ${S.tab === k ? 'border-sky-500 text-sky-700 dark:text-sky-300 font-semibold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}">${l}${k === 'tugas' && pend ? ` <span class="ml-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">${pend}</span>` : ''}</button>`).join('');
    $('#smDetail').innerHTML = `${isMock ? '<div class="mb-4">' + banner() + '</div>' : ''}
      <section class="pb-6 flex flex-col sm:flex-row sm:items-center gap-5">${avatar(s, 'w-16 h-16 text-lg')}<div class="min-w-0 flex-1"><h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">${esc(s.nama)}</h1><p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">${esc(s.pathName)}${s.grade ? ' · ' + esc(GRADES[s.grade]) : ''}</p><div class="mt-2.5">${dotStatus(s.status)}</div></div>${ring(s.progress)}</section>
      <div role="tablist" aria-label="Detail siswa" class="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800">${tabs}</div>
      <div id="smPanel" role="tabpanel" aria-labelledby="smTab-${S.tab}" class="mt-5">${panel()}</div>`;
  }

  const stat = (label, val, note) => `<div class="sm:px-6 sm:first:pl-0"><p class="text-xs text-slate-500 dark:text-slate-400">${label}</p><p class="text-2xl font-bold text-slate-900 dark:text-white mt-1">${val}</p>${note ? `<p class="text-xs text-slate-400 mt-0.5">${note}</p>` : ''}</div>`;
  const timeline = (list) => `<ol class="relative ml-1.5 border-l border-slate-200 dark:border-slate-700 space-y-5">${list.map((a) => `<li class="pl-5 relative"><span class="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-white dark:bg-slate-900 border-2 border-sky-500"></span><p class="text-sm text-slate-800 dark:text-slate-100">${esc(a.teks)}</p><p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${esc(ago(a.at))} · ${esc(fmt(a.at))}</p></li>`).join('')}</ol>`;

  function panel() {
    const d = S.detail, s = d.item;
    const tugas = d.tugas || [], akt = d.aktivitas || [], k = d.kehadiran || {};
    const total = (k.hadir || 0) + (k.izin || 0) + (k.alpa || 0), pct = total ? Math.round(((k.hadir || 0) / total) * 100) : null;
    if (S.tab === 'aktivitas') return akt.length ? `<div class="py-2">${timeline(akt)}</div>` : empty('fa-clock-rotate-left', 'Belum ada aktivitas', 'Aktivitas belajar siswa akan muncul di sini.');
    if (S.tab === 'tugas') {
      if (!tugas.length) return empty('fa-list-check', 'Belum ada tugas', 'Tugas yang dikumpulkan siswa akan muncul di sini.');
      const c = (st) => tugas.filter((t) => tugasKey(t.status) === st).length;
      return `<div class="flex flex-wrap gap-2 mb-3">${Object.keys(TUGAS).map((st) => (c(st) ? pill([TUGAS[st][0] + ' · ' + c(st), TUGAS[st][1]]) : '')).join('')}</div>
        <div class="divide-y divide-slate-100 dark:divide-slate-800 border-y border-slate-100 dark:border-slate-800">${tugas.map((t) => `<div class="px-1 py-3.5 flex items-center gap-3 flex-wrap"><div class="min-w-0 flex-1"><p class="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">${esc(t.judul)}</p><p class="text-xs text-slate-500 dark:text-slate-400">Dikumpulkan ${esc(fmt(t.submittedAt))}</p></div>${t.nilai != null && t.nilai !== '' ? `<span class="text-sm font-bold text-slate-800 dark:text-slate-100 w-8 text-right">${esc(t.nilai)}</span>` : '<span class="w-8"></span>'}${pill(TUGAS[tugasKey(t.status)])}</div>`).join('')}</div>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-3">Untuk menilai atau memberi feedback, buka <button type="button" data-view="tugas" class="text-sky-700 dark:text-sky-300 font-semibold hover:underline">Tugas Tambahan</button>.</p>`;
    }
    if (S.tab === 'hadir') {
      if (!total) return empty('fa-user-check', 'Belum ada data kehadiran', 'Kehadiran mentoring akan muncul di sini setelah sesi berlangsung.');
      const seg = (n, c) => (n ? `<div class="${c}" style="width:${(n / total) * 100}%"></div>` : '');
      const leg = (l, n, c) => `<span class="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"><span class="w-2 h-2 rounded-full ${c}"></span>${l} <b>${n}</b></span>`;
      return `<div><div class="flex items-baseline justify-between mb-3"><span class="text-sm font-semibold text-slate-800 dark:text-slate-100">Kehadiran mentoring</span><span class="text-sm text-slate-500 dark:text-slate-400"><b class="text-xl text-slate-900 dark:text-white">${pct}%</b> dari ${total} pertemuan</span></div>
        <div class="flex h-2.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">${seg(k.hadir, 'bg-emerald-500')}${seg(k.izin, 'bg-amber-400')}${seg(k.alpa, 'bg-rose-500')}</div>
        <div class="flex flex-wrap gap-x-5 gap-y-1 mt-3">${leg('Hadir', k.hadir || 0, 'bg-emerald-500')}${leg('Izin', k.izin || 0, 'bg-amber-400')}${leg('Alpa', k.alpa || 0, 'bg-rose-500')}</div></div>
        <div class="divide-y divide-slate-100 dark:divide-slate-800 border-y border-slate-100 dark:border-slate-800 mt-5">${(k.riwayat || []).map((r) => `<div class="px-1 py-3 flex items-center gap-3 text-sm"><span class="flex-1 min-w-0 truncate text-slate-800 dark:text-slate-100">${esc(r.judul)}</span><span class="text-xs text-slate-500 dark:text-slate-400">${esc(fmt(r.tanggal))}</span>${pill(HADIR[r.status] || HADIR.hadir)}</div>`).join('')}</div>`;
    }
    const nilai = tugas.filter((t) => t.nilai != null && t.nilai !== '').map((t) => Number(t.nilai)).filter(Number.isFinite);
    const avg = nilai.length ? Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length) : '-';
    const dd = dayDiff(s.lastActive);
    const alert = s.status !== 'aktif' ? `<div class="flex items-start gap-3 rounded-2xl px-4 py-3.5 text-sm border ${TONE.warn}"><i class="fa-solid fa-circle-exclamation mt-0.5"></i><p>${dd === null ? 'Siswa ini belum punya aktivitas belajar.' : 'Sudah ' + dd + ' hari siswa ini tidak belajar.'} Pertimbangkan menghubungi siswa atau orang tuanya.</p></div>` : '';
    return `<div class="space-y-7">${alert}
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-y-5 sm:divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-100 dark:border-slate-800 pb-6">${stat('Rata-rata nilai', avg, nilai.length ? 'dari ' + nilai.length + ' tugas dinilai' : 'Belum ada nilai')}${stat('Menunggu penilaian', pendOf(d), 'Tugas belum dinilai')}${stat('Kehadiran', pct === null ? '-' : pct + '%', total ? total + ' pertemuan' : 'Belum ada data')}</div>
      <div><div class="flex justify-between text-sm mb-2.5"><span class="font-semibold text-slate-800 dark:text-slate-100">Progress Learning Path</span><span class="text-slate-500 dark:text-slate-400">${s.tasksDone}${s.tasksTotal ? ' dari ' + s.tasksTotal : ''} task selesai</span></div>${bar(s.progress)}</div>
      <div><div class="flex items-center justify-between mb-4"><span class="text-sm font-semibold text-slate-800 dark:text-slate-100">Aktivitas terbaru</span><button type="button" data-sm="tab" data-tab="aktivitas" class="text-xs font-semibold text-sky-700 dark:text-sky-300 hover:underline">Lihat semua</button></div>${akt.length ? timeline(akt.slice(0, 3)) : '<p class="text-sm text-slate-500 dark:text-slate-400">Belum ada aktivitas.</p>'}</div></div>`;
  }

  // ---------- event ----------
  function bind(root) {
    root.addEventListener('input', (e) => { const f = e.target.dataset.f; if (f === 'q') { S.q = e.target.value; drawFilters(); drawResults(); } });
    root.addEventListener('change', (e) => {
      const f = e.target.dataset.f; if (!f || f === 'q') return;
      S[f] = e.target.value; if (f === 'grade') S.path = '';
      drawFilters(); drawResults();
    });
    root.addEventListener('keydown', (e) => {
      const t = e.target.closest('[role=tab]'); if (!t || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      const i = TABS.findIndex((x) => x[0] === S.tab), n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
      S.tab = n; drawDetail(); root.querySelector('#smTab-' + n).focus();
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sm]'); if (!b) return;
      const a = b.dataset.sm;
      if (a === 'open') openDetail(b.dataset.id);
      else if (a === 'back' || a === 'retry') showList();
      else if (a === 'tab') { S.tab = b.dataset.tab; drawDetail(); const t = root.querySelector('#smTab-' + S.tab); if (t) t.focus(); }
      else if (a === 'quick') { S.quick = S.quick === b.dataset.q ? '' : b.dataset.q; drawFilters(); drawKpi(); drawResults(); }
      else if (a === 'reset') { Object.assign(S, { q: '', grade: '', path: '', status: '', quick: '', sort: 'aktivitas' }); drawFilters(); drawKpi(); drawResults(); }
    });
  }

  window.DCSiswa = {
    mount(el) {
      if (!el) return;
      if (S.root !== el) { S.root = el; bind(el); }
      showList();
    }
  };
})();
