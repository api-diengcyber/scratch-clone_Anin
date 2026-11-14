// ============================================================
// TAMPILAN JADWAL ZOOM MENTORING (portal Instruktur)
//
// Dipakai oleh crud() di instruktur.js lewat window.DCJadwalUI:
//   html(ctx)     -> string HTML seluruh halaman (ctx = { list, loaded, note })
//   afterDraw(view, redraw) -> pasang listener input/select yang dibuat ulang tiap render
//   click(e, ctx) -> tangani klik elemen [data-jw]  (ctx = { find, redraw, reload })
//
// Tab:
//   Agenda & Sesi Mendatang  daftar sesi per tanggal (filter Semua / Hari Ini / Minggu Ini + Jenjang),
//                            kalender mingguan (klik tanggal untuk menyaring) dan kartu Ruang Zoom Utama
//   Atur Ketersediaan Rutin  jam mengajar rutin per hari (disimpan; endpoint di bawah)
//
// ENDPOINT (belum ada di backend -> otomatis memakai data lokal browser):
//   GET /api/instruktur/ketersediaan   -> { items: [{ hari: 1..7, aktif, mulai, selesai }] }   (1 = Senin ... 7 = Minggu)
//   PUT /api/instruktur/ketersediaan   { items: [...] }
// Ruang Zoom Utama membaca link & passcode dari Pengaturan Profil (DCProfil.peek()).
// ============================================================
(function (root) {
  'use strict';
  if (root.DCJadwalUI) return;

  const GRADES = { SD: 'SD', SMP: 'SMP', SMK: 'SMA/SMK' };
  const GRADE_CLS = {
    SD: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
    SMP: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30',
    SMK: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30'
  };
  const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const DAYS_FULL = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const AV_KEY = 'dci-ketersediaan';

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, t) => (root.showToast ? root.showToast(m, t) : undefined);
  const req = (p, o) => root.DCAdminApi.request(p, o);
  const missing = (e) => e && [0, 404, 405, 501].includes(e.status);

  // ---------- tanggal (zona waktu perangkat) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => new Date(s + 'T00:00:00');
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const mondayOf = (s) => { const d = parse(s); return addDays(s, -((d.getDay() + 6) % 7)); };
  const longDate = (s) => { const d = parse(s); return DAYS_FULL[(d.getDay() + 6) % 7] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
  const shortDate = (s) => { const d = parse(s); return DAYS[(d.getDay() + 6) % 7] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); };
  const at = (tgl, hm) => new Date(tgl + 'T' + (hm || '00:00') + ':00');
  const minutes = (a, b) => { const [h1, m1] = String(a || '0:0').split(':').map(Number), [h2, m2] = String(b || '0:0').split(':').map(Number); return (h2 * 60 + m2) - (h1 * 60 + m1); };

  // ---------- state ----------
  const JW = { tab: 'agenda', filter: 'semua', grade: '', sel: '', week: mondayOf(ymd(new Date())), avail: null, meta: null, availLocal: false, availLoading: false };

  const defaultAvail = () => [1, 2, 3, 4, 5, 6, 7].map((h) => ({ hari: h, aktif: h <= 6, mulai: h === 6 ? '09:00' : '15:00', selesai: h === 6 ? '12:00' : '18:00' }));
  const defaultMeta = () => ({ jenjang: ['SD', 'SMP', 'SMK'], maxSesi: 3, catatan: '' });

  async function loadAvail(redraw) {
    if (JW.avail || JW.availLoading) return;
    JW.availLoading = true;
    let items = null, meta = null;
    try { const r = await req('/api/instruktur/ketersediaan'); items = r.items || null; meta = r; JW.availLocal = false; }
    catch (e) { if (!missing(e)) toast(e.message || 'Gagal memuat ketersediaan.', 'error'); JW.availLocal = true; }
    if (JW.availLocal) {
      let raw = null; try { raw = JSON.parse(localStorage.getItem(AV_KEY)); } catch (_) {}
      if (Array.isArray(raw)) items = raw; else if (raw) { items = raw.items; meta = raw; }
    }
    const base = defaultAvail();
    JW.avail = base.map((b) => ({ ...b, ...((items || []).find((x) => Number(x.hari) === b.hari) || {}) }));
    const dm = defaultMeta();
    JW.meta = { jenjang: Array.isArray(meta && meta.jenjang) ? meta.jenjang.slice() : dm.jenjang, maxSesi: Number(meta && meta.maxSesi) || dm.maxSesi, catatan: String((meta && meta.catatan) || '') };
    JW.availLoading = false; redraw();
  }

  const zoomDefault = () => {
    const p = (root.DCProfil && root.DCProfil.peek && root.DCProfil.peek()) || {};
    const link = p.zoomLink || '';
    const id = ((link.match(/\/j\/(\d{9,11})/) || [])[1] || '').replace(/(\d{3})(\d{4})(\d{3,4})/, '$1 $2 $3');
    return { link, id, pass: p.zoomPasscode || '' };
  };

  // ---------- util sesi ----------
  const sorted = (list) => list.slice().sort((a, b) => (a.tanggal + (a.mulai || '')).localeCompare(b.tanggal + (b.mulai || '')));
  function statusOf(j, now) {
    const s = at(j.tanggal, j.mulai), e = at(j.tanggal, j.selesai);
    if (now < s) return 'akan';
    if (now <= e) return 'live';
    return 'selesai';
  }
  const STATUS = {
    live: ['Berlangsung', 'bg-jade-50 text-jade-700 border-jade-200 dark:bg-jade-500/10 dark:text-jade-300 dark:border-jade-500/30', '<span class="w-1.5 h-1.5 rounded-full bg-jade-500 animate-pulse"></span>'],
    akan: ['Akan Datang', 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30', '<i class="fa-regular fa-clock text-[9px]"></i>'],
    selesai: ['Selesai', 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', '<i class="fa-solid fa-check text-[9px]"></i>']
  };
  const chip = (txt, cls, icon) => `<span class="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg border ${cls}">${icon || ''}${esc(txt)}</span>`;
  const zoomOf = (j) => (/^https:\/\//i.test(j.zoomUrl || '') ? j.zoomUrl : (zoomDefault().link || ''));

  const CARD = 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-card';
  const INPUT = 'bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-jade-500/15 focus:border-jade-400 transition';

  // ---------- bagian agenda ----------
  function filtered(list) {
    const today = ymd(new Date()), wkStart = mondayOf(today), wkEnd = addDays(wkStart, 6);
    return sorted(list).filter((j) => {
      if (!j.tanggal) return false;
      if (JW.grade && j.grade && j.grade !== JW.grade) return false;
      if (JW.grade && !j.grade) return false;
      if (JW.sel) return j.tanggal === JW.sel;
      if (j.tanggal < today) return false;
      if (JW.filter === 'hari') return j.tanggal === today;
      if (JW.filter === 'minggu') return j.tanggal >= wkStart && j.tanggal <= wkEnd;
      return true;
    });
  }

  function sessionCard(j, no, now) {
    const st = STATUS[statusOf(j, now)], dur = minutes(j.mulai, j.selesai), zoom = zoomOf(j);
    const gradeChip = j.grade ? chip('Jenjang ' + (GRADES[j.grade] || j.grade), GRADE_CLS[j.grade] || GRADE_CLS.SD) : chip('Semua Jenjang', 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700');
    const who = [j.level, j.mentor].filter(Boolean).map(esc).join(' — ');
    const live = statusOf(j, now) === 'live';
    return `<article class="rounded-2xl border ${live ? 'border-jade-200 bg-jade-50/50 dark:bg-jade-500/5 dark:border-jade-500/30' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900'} p-4 flex flex-col lg:flex-row lg:items-center gap-4">
      <div class="shrink-0 w-full lg:w-[7.75rem] rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 py-2.5 text-center">
        <p class="text-[9.5px] font-bold tracking-wider text-slate-400">SESI #${no}</p>
        <p class="text-[15px] font-extrabold text-slate-900 dark:text-white mt-0.5">${esc(j.mulai)} – ${esc(j.selesai)}</p>
        <p class="text-[10px] text-slate-400">WIB${dur > 0 ? ` (${dur} mnt)` : ''}</p></div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-1.5">${chip(st[0], st[1], st[2])}${gradeChip}${j.jenis ? chip(j.jenis, 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700') : ''}</div>
        <h3 class="mt-2 text-[15px] font-extrabold text-slate-900 dark:text-white leading-snug">${esc(j.judul)}</h3>
        <p class="mt-1 text-[11.5px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          ${who ? `<span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-user-group"></i>${who}</span>` : ''}
          ${j.keterangan ? `<span class="inline-flex items-center gap-1.5 min-w-0"><i class="fa-regular fa-note-sticky"></i><span class="truncate max-w-[22rem]">${esc(j.keterangan)}</span></span>` : ''}</p></div>
      <div class="flex items-center gap-2 shrink-0 flex-wrap">
        <button type="button" data-jw="detail" data-v="${esc(j.id)}" class="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-3.5 py-2.5 hover:border-jade-300 transition"><i class="fa-regular fa-file-lines text-slate-400"></i>Detail / Catatan</button>
        ${zoom ? `<span class="inline-flex rounded-xl overflow-hidden shadow-soft"><a href="${esc(zoom)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-[12px] font-bold text-white bg-jade-600 hover:bg-jade-700 px-3.5 py-2.5 transition"><i class="fa-solid fa-video"></i>Buka Zoom</a>
          <button type="button" data-jw="salin" data-v="${esc(j.id)}" title="Salin link Zoom" aria-label="Salin link Zoom" class="text-white bg-jade-600 hover:bg-jade-700 border-l border-white/25 px-3 transition"><i class="fa-regular fa-copy text-xs"></i></button></span>`
          : '<span class="text-[11px] text-slate-400 px-2">Tanpa link Zoom</span>'}
        <button type="button" data-edit="${esc(j.id)}" class="dc-ib dc-ib-edit" aria-label="Ubah" title="Ubah"><i class="fa-solid fa-pen"></i></button>
        <button type="button" data-del="${esc(j.id)}" class="dc-ib dc-ib-danger" aria-label="Hapus" title="Hapus"><i class="fa-solid fa-trash-can"></i></button></div></article>`;
  }

  function agendaList(list) {
    const rows = filtered(list), now = new Date(), today = ymd(now);
    if (!rows.length) {
      return `<div class="${CARD} text-center py-14 px-6"><i class="fa-regular fa-calendar-xmark text-3xl text-slate-300 mb-3 block"></i>
        <p class="text-sm font-bold text-slate-700 dark:text-slate-200">Tidak ada sesi yang cocok</p>
        <p class="text-xs text-slate-500 mt-1">${JW.sel || JW.filter !== 'semua' || JW.grade ? 'Coba ubah filter atau pilih tanggal lain.' : 'Belum ada jadwal mendatang. Klik “Tambah Jadwal” untuk membuat sesi baru.'}</p></div>`;
    }
    const groups = [];
    rows.forEach((j) => { const g = groups[groups.length - 1]; if (g && g.date === j.tanggal) g.items.push(j); else groups.push({ date: j.tanggal, items: [j] }); });
    return groups.map((g) => `<section class="${CARD} p-5 sm:p-6">
      <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div class="flex items-center gap-3"><span class="w-8 h-8 rounded-lg bg-jade-50 dark:bg-jade-500/10 text-jade-600 grid place-items-center text-xs"><i class="fa-regular fa-calendar"></i></span>
          <h2 class="text-[14.5px] font-extrabold text-slate-900 dark:text-white">${esc(longDate(g.date))}</h2>${g.date === today ? '<span class="text-[10px] font-bold bg-jade-600 text-white px-2.5 py-0.5 rounded-full">Hari Ini</span>' : ''}</div>
        <span class="text-[10.5px] font-bold px-2.5 py-1 rounded-full ${g.items.length > 1 ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}">${g.items.length} Sesi${g.date === today ? ' Hari Ini' : ''}</span></div>
      <div class="space-y-3">${g.items.map((j, i) => sessionCard(j, i + 1, now)).join('')}</div></section>`).join('<div class="h-5"></div>');
  }

  function calendar(list) {
    const today = ymd(new Date());
    const count = {}; list.forEach((j) => { if (j.tanggal) count[j.tanggal] = (count[j.tanggal] || 0) + 1; });
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(JW.week, i));
    const mid = parse(days[3]);
    const cell = (d, i) => {
      const n = count[d] || 0, isToday = d === today, sel = JW.sel === d;
      const dots = n >= 2 ? '<span class="flex gap-0.5"><i class="w-1.5 h-1.5 rounded-full bg-amber-400"></i><i class="w-1.5 h-1.5 rounded-full bg-amber-400"></i></span>' : n === 1 ? '<span class="w-1.5 h-1.5 rounded-full bg-jade-500"></span>' : '<span class="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"></span>';
      return `<button type="button" data-jw="day" data-v="${d}" aria-pressed="${sel}" aria-label="${esc(longDate(d))}, ${n} sesi" class="flex flex-col items-center gap-1 rounded-xl border py-2.5 transition ${sel ? 'border-jade-500 ring-2 ring-jade-500/25 bg-jade-50 dark:bg-jade-500/10' : isToday ? 'border-jade-200 bg-jade-50/70 dark:bg-jade-500/10 dark:border-jade-500/30' : 'border-slate-100 dark:border-slate-800 hover:border-jade-200'}">
        <span class="text-[9.5px] font-bold text-slate-400">${DAYS[i]}</span><span class="text-[15px] font-extrabold text-slate-900 dark:text-white">${parse(d).getDate()}</span>${dots}</button>`;
    };
    return `<section class="${CARD} p-5">
      <div class="flex items-start justify-between gap-3"><div><h2 class="text-[14.5px] font-extrabold text-slate-900 dark:text-white">Kalender Mingguan</h2>
        <p class="text-[11px] text-slate-400 mt-0.5">${MONTHS[mid.getMonth()]} ${mid.getFullYear()} • Klik tanggal untuk filter</p></div>
        <div class="flex gap-1.5"><button type="button" data-jw="wk-prev" aria-label="Minggu sebelumnya" class="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-jade-300 hover:text-jade-600 grid place-items-center text-[10px]"><i class="fa-solid fa-chevron-left"></i></button>
          <button type="button" data-jw="wk-next" aria-label="Minggu berikutnya" class="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-jade-300 hover:text-jade-600 grid place-items-center text-[10px]"><i class="fa-solid fa-chevron-right"></i></button></div></div>
      <div class="mt-4 grid grid-cols-7 gap-1.5">${days.map(cell).join('')}</div>
      <div class="mt-4 flex items-center justify-between gap-2 text-[10px] text-slate-500 flex-wrap">
        <span class="inline-flex items-center gap-1.5"><i class="w-1.5 h-1.5 rounded-full bg-jade-500"></i>1 Sesi</span>
        <span class="inline-flex items-center gap-1.5"><i class="w-1.5 h-1.5 rounded-full bg-amber-400"></i><i class="w-1.5 h-1.5 rounded-full bg-amber-400 -ml-1"></i>2+ Sesi (Padat)</span>
        <span class="inline-flex items-center gap-1.5"><i class="w-1.5 h-1.5 rounded-full bg-slate-300"></i>Kosong</span></div></section>`;
  }

  function zoomCard() {
    const z = zoomDefault();
    return `<section class="${CARD} p-5">
      <div class="flex items-center gap-3"><span class="w-10 h-10 rounded-xl bg-jade-50 dark:bg-jade-500/10 text-jade-600 grid place-items-center"><i class="fa-solid fa-video"></i></span>
        <div class="min-w-0"><h2 class="text-[14.5px] font-extrabold text-slate-900 dark:text-white">Ruang Zoom Utama Anda</h2>
          <p class="text-[11px] text-slate-400 truncate">${z.id ? 'ID: ' + esc(z.id) : 'ID belum diatur'}${z.pass ? ' • Pass: ' + esc(z.pass) : ''}</p></div></div>
      <div class="mt-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 px-3.5 py-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300 break-all">${z.link ? esc(z.link) : '<span class="text-slate-400">Belum ada link. Atur di Pengaturan Profil.</span>'}</div>
      <div class="mt-3 flex gap-2.5"><button type="button" data-jw="salin-default" ${z.link ? '' : 'disabled'} class="flex-1 inline-flex items-center justify-center gap-2 text-[12px] font-bold text-jade-700 dark:text-jade-300 bg-jade-50 dark:bg-jade-500/10 rounded-xl py-2.5 hover:bg-jade-100 transition disabled:opacity-50"><i class="fa-regular fa-copy"></i>Salin Link</button>
        <button type="button" data-jw="ubah-default" class="text-[12px] font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 hover:border-jade-300 transition">Ubah</button></div></section>`;
  }

  function agendaTab(list) {
    const today = ymd(new Date());
    const pill = (id, label) => `<button type="button" data-jw="filter" data-v="${id}" aria-pressed="${!JW.sel && JW.filter === id}" class="text-[11.5px] font-bold px-4 py-2 rounded-full transition ${!JW.sel && JW.filter === id ? 'bg-jade-600 text-white shadow-soft' : 'bg-jade-50 dark:bg-slate-800 text-jade-700 dark:text-slate-300 hover:bg-jade-100'}">${label}</button>`;
    return `<div class="grid xl:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start">
      <div class="space-y-5 min-w-0">
        <div class="${CARD} px-4 py-3 flex flex-wrap items-center gap-2.5">
          ${pill('semua', 'Semua Sesi')}${pill('hari', 'Hari Ini (' + esc(shortDate(today)) + ')')}${pill('minggu', 'Minggu Ini')}
          ${JW.sel ? `<button type="button" data-jw="clear-day" class="inline-flex items-center gap-1.5 text-[11.5px] font-bold px-3.5 py-2 rounded-full bg-amber-50 text-amber-700 border border-amber-200">${esc(shortDate(JW.sel))}<i class="fa-solid fa-xmark text-[10px]"></i></button>` : ''}
          <div class="ml-auto flex items-center gap-2.5"><label for="jwGrade" class="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Jenjang:</label>
            <select id="jwGrade" class="${INPUT} text-[12px] font-semibold pr-8"><option value="">Semua Jenjang</option>${Object.entries(GRADES).map(([k, l]) => `<option value="${k}" ${JW.grade === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        ${agendaList(list)}</div>
      <div class="space-y-5">${calendar(list)}${zoomCard()}</div></div>`;
  }

  // ---------- ketersediaan rutin ----------
  const R0 = 6 * 60, R1 = 21 * 60;   // rentang bar jam: 06:00 - 21:00
  const toMin = (hm) => { const [h, m] = String(hm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const fmtDur = (m) => (m <= 0 ? '-' : Math.floor(m / 60) + ' jam' + (m % 60 ? ' ' + (m % 60) + ' mnt' : ''));
  const fmtHours = (m) => (Math.round(m / 6) / 10).toString().replace('.', ',');

  function availTab() {
    if (!JW.avail || !JW.meta) return '<div class="text-center text-sm text-slate-500 py-12"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat ketersediaan...</div>';
    const mins = JW.avail.map((a) => (a.aktif ? Math.max(0, minutes(a.mulai, a.selesai)) : 0));
    const total = mins.reduce((x, y) => x + y, 0), activeDays = JW.avail.filter((a) => a.aktif).length;
    const maxI = mins.indexOf(Math.max.apply(null, mins)), maxM = mins[maxI];
    const GRID = 'lg:grid lg:grid-cols-[2.75rem_5rem_17rem_5.5rem_minmax(0,1fr)] lg:items-center';
    const ticks = [6, 9, 12, 15, 18, 21];

    const rows = JW.avail.map((a, i) => {
      const bad = a.aktif && minutes(a.mulai, a.selesai) <= 0;
      const l = Math.max(0, Math.min(100, ((toMin(a.mulai) - R0) / (R1 - R0)) * 100));
      const w = Math.max(0, Math.min(100 - l, ((toMin(a.selesai) - toMin(a.mulai)) / (R1 - R0)) * 100));
      return `<div class="${GRID} flex flex-wrap items-center gap-x-4 gap-y-2 lg:gap-x-3 rounded-2xl border ${bad ? 'border-rose-200' : 'border-slate-100 dark:border-slate-800'} ${a.aktif ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/60 dark:bg-slate-800/40'} px-4 py-3">
        <button type="button" role="switch" aria-checked="${a.aktif}" aria-label="Aktifkan ${DAYS_FULL[i]}" data-jw="av-toggle" data-v="${i}" class="relative shrink-0 w-11 h-6 rounded-full transition ${a.aktif ? 'bg-jade-500' : 'bg-slate-300 dark:bg-slate-600'}"><span class="absolute top-0.5 ${a.aktif ? 'left-[1.375rem]' : 'left-0.5'} w-5 h-5 rounded-full bg-white shadow transition-all"></span></button>
        <span class="text-[13px] font-bold ${a.aktif ? 'text-slate-900 dark:text-white' : 'text-slate-400'}">${DAYS_FULL[i]}</span>
        ${a.aktif ? `<div class="flex items-center gap-2"><input type="time" data-av="${i}" data-k="mulai" value="${esc(a.mulai)}" aria-label="Mulai ${DAYS_FULL[i]}" class="${INPUT} text-[12.5px] w-[6.75rem]"><span class="text-slate-400 text-xs">sampai</span><input type="time" data-av="${i}" data-k="selesai" value="${esc(a.selesai)}" aria-label="Selesai ${DAYS_FULL[i]}" class="${INPUT} text-[12.5px] w-[6.75rem]"></div>
          <span class="text-[11.5px] font-semibold ${bad ? 'text-rose-600' : 'text-slate-500'}">${bad ? 'Jam tidak valid' : fmtDur(minutes(a.mulai, a.selesai))}</span>
          <div class="hidden lg:block relative h-2.5 rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">${bad ? '' : `<span class="absolute top-0 h-full rounded-full bg-gradient-to-r from-jade-400 to-jade-600" style="left:${l}%;width:${w}%"></span>`}</div>`
          : `<span class="text-[12px] text-slate-400 lg:col-span-1">Tidak tersedia</span><span class="hidden lg:block"></span><div class="hidden lg:block h-2.5 rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true"></div>`}</div>`;
    }).join('');

    const presetBtn = (id, icon, label) => `<button type="button" data-jw="${id}" class="inline-flex items-center gap-2 text-[11.5px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-full px-3.5 py-2 hover:border-jade-300 hover:text-jade-700 transition"><i class="fa-solid ${icon} text-[10px] text-jade-500"></i>${label}</button>`;
    const left = `<section class="${CARD}">
      <div class="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800"><h2 class="font-bold text-[15px] text-slate-900 dark:text-white">Ketersediaan Mengajar Rutin</h2>
        <p class="text-[11.5px] text-slate-500 mt-0.5">Atur hari dan jam yang biasanya Anda siap mengajar. Koordinator memakainya saat menyusun jadwal kelas.</p></div>
      <div class="px-6 pt-4 flex flex-wrap items-center gap-2"><span class="text-[10px] font-bold tracking-wider uppercase text-slate-400 mr-1">Atur cepat</span>
        ${presetBtn('av-sore', 'fa-sun', 'Sen–Jum sore')}${presetBtn('av-akhir', 'fa-calendar-week', 'Hanya akhir pekan')}${presetBtn('av-salin', 'fa-copy', 'Samakan dengan Senin')}${presetBtn('av-kosong', 'fa-eraser', 'Kosongkan')}</div>
      <div class="p-6 pt-4 space-y-2.5">
        <div class="hidden lg:grid lg:grid-cols-[2.75rem_5rem_17rem_5.5rem_minmax(0,1fr)] gap-x-3 px-4 text-[10px] font-semibold text-slate-400" aria-hidden="true"><span></span><span></span><span></span><span></span>
          <div class="flex justify-between">${ticks.map((t) => `<span>${pad(t)}:00</span>`).join('')}</div></div>
        ${rows}</div></section>`;

    const bars = mins.map((m, i) => `<div class="flex-1 flex flex-col items-center gap-1.5"><div class="w-full h-24 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-end overflow-hidden"><div class="w-full rounded-lg bg-gradient-to-t from-jade-600 to-jade-400 transition-all" style="height:${Math.min(100, (m / 600) * 100)}%"></div></div><span class="text-[9.5px] font-bold ${m ? 'text-slate-600 dark:text-slate-300' : 'text-slate-300'}">${DAYS[i]}</span></div>`).join('');
    const stat = (v, l) => `<div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 py-2.5 text-center"><p class="text-[15px] font-extrabold text-slate-900 dark:text-white">${v}</p><p class="text-[10px] text-slate-400">${l}</p></div>`;
    const summary = `<section class="${CARD} p-5">
      <div class="flex items-center justify-between"><h2 class="text-[14.5px] font-extrabold text-slate-900 dark:text-white">Ringkasan Minggu Ini</h2><span class="w-8 h-8 rounded-lg bg-jade-50 dark:bg-jade-500/10 text-jade-600 grid place-items-center text-xs"><i class="fa-solid fa-chart-simple"></i></span></div>
      <p class="mt-3 text-3xl font-extrabold text-jade-700 dark:text-jade-300">${fmtHours(total)}<span class="text-sm font-bold text-slate-400 ml-1.5">jam / minggu</span></p>
      <div class="mt-4 flex gap-1.5">${bars}</div>
      <div class="mt-4 grid grid-cols-3 gap-2">${stat(activeDays, 'Hari aktif')}${stat(activeDays ? fmtHours(total / activeDays) : '0', 'Jam / hari')}${stat(maxM ? DAYS[maxI] : '-', 'Terpanjang')}</div></section>`;

    const ch = (k) => JW.meta.jenjang.includes(k);
    const pref = `<section class="${CARD} p-5 space-y-5">
      <div class="flex items-center justify-between"><h2 class="text-[14.5px] font-extrabold text-slate-900 dark:text-white">Preferensi Mengajar</h2><span class="w-8 h-8 rounded-lg bg-jade-50 dark:bg-jade-500/10 text-jade-600 grid place-items-center text-xs"><i class="fa-solid fa-graduation-cap"></i></span></div>
      <div><p class="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-2">Jenjang yang bersedia diampu</p>
        <div class="flex flex-wrap gap-2">${Object.entries(GRADES).map(([k, l]) => `<button type="button" data-jw="meta-jenjang" data-v="${k}" aria-pressed="${ch(k)}" class="inline-flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-2 rounded-xl border transition ${ch(k) ? 'bg-jade-600 text-white border-jade-600 shadow-soft' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-jade-300'}"><i class="fa-solid ${ch(k) ? 'fa-check' : 'fa-plus'} text-[10px]"></i>${l}</button>`).join('')}</div></div>
      <div><label for="avMax" class="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-2">Maksimal sesi per hari</label>
        <select id="avMax" data-meta="maxSesi" class="${INPUT} w-full text-[12.5px] font-semibold">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${JW.meta.maxSesi === n ? 'selected' : ''}>${n} sesi per hari</option>`).join('')}</select></div>
      <div><div class="flex items-center justify-between mb-2"><label for="avCatatan" class="text-[11px] font-bold text-slate-700 dark:text-slate-300">Catatan untuk koordinator</label><span id="avCount" class="text-[10px] text-slate-400">${JW.meta.catatan.length} / 200</span></div>
        <textarea id="avCatatan" data-meta="catatan" rows="3" maxlength="200" placeholder="Contoh: tidak bisa mengajar saat libur nasional, atau butuh jeda 30 menit antar sesi." class="${INPUT} w-full resize-none text-[12.5px]">${esc(JW.meta.catatan)}</textarea></div>
      <div class="flex gap-2.5 pt-1"><button type="button" data-jw="av-reset" class="dc-btn dc-btn-sec">Atur Ulang</button><button type="button" data-jw="av-save" class="dc-btn dc-btn-pri flex-1"><i class="fa-regular fa-circle-check"></i><span>Simpan Ketersediaan</span></button></div></section>`;

    return `<div class="grid 2xl:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start"><div class="min-w-0">${left}</div><div class="space-y-5">${summary}${pref}</div></div>`;
  }

  // ---------- halaman ----------
  function html(ctx) {
    const list = ctx.list || [];
    const tabs = [['agenda', 'Agenda & Sesi Mendatang', 'fa-calendar-days'], ['rutin', 'Atur Ketersediaan Rutin', 'fa-sliders']].map((t) => `<button type="button" role="tab" aria-selected="${JW.tab === t[0]}" data-jw="tab" data-v="${t[0]}" class="inline-flex items-center justify-center gap-2 text-[12.5px] font-bold px-5 py-2.5 rounded-xl transition ${JW.tab === t[0] ? 'bg-jade-600 text-white shadow-soft' : 'text-slate-600 dark:text-slate-300 hover:bg-jade-50 dark:hover:bg-slate-800'}"><i class="fa-solid ${t[2]} text-xs"></i>${t[1]}</button>`).join('');
    return `<div class="page-hero flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><nav class="text-[11px] text-slate-500 flex items-center gap-1.5" aria-label="Breadcrumb"><span>Portal Instruktur</span><i class="fa-solid fa-chevron-right text-[8px]"></i><span class="text-jade-600 font-semibold">Jadwal Zoom</span></nav>
          <h1 class="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Jadwal Zoom Mentoring</h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">Atur kelas Zoom yang muncul di halaman Jadwal Saya milik siswa.</p></div>
        <button type="button" data-add class="dc-btn dc-btn-pri self-start md:self-auto"><i class="fa-solid fa-plus text-xs"></i><span>Tambah Jadwal</span></button></div>
      ${ctx.note || ''}
      <div role="tablist" class="${CARD} p-1.5 inline-flex gap-1.5 max-w-full overflow-x-auto">${tabs}</div>
      ${!ctx.loaded ? '<div class="text-center text-sm text-slate-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat...</div>' : JW.tab === 'rutin' ? availTab() : agendaTab(list)}`;
  }

  function afterDraw(view, redraw) {
    const g = view.querySelector('#jwGrade');
    if (g) g.addEventListener('change', (e) => { JW.grade = e.target.value; redraw(); });
    view.querySelectorAll('input[data-av]').forEach((inp) => inp.addEventListener('input', (e) => { JW.avail[Number(e.target.dataset.av)][e.target.dataset.k] = e.target.value; }));
    view.querySelectorAll('input[data-av]').forEach((inp) => inp.addEventListener('change', () => redraw()));
    view.querySelectorAll('[data-meta]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', (e) => {
      const k = e.target.dataset.meta;
      JW.meta[k] = k === 'maxSesi' ? Number(e.target.value) : e.target.value;
      if (k === 'catatan') { const c = view.querySelector('#avCount'); if (c) c.textContent = e.target.value.length + ' / 200'; }
    }));
    if (JW.tab === 'rutin' && !JW.avail) loadAvail(redraw);
  }

  // ---------- modal detail ----------
  function detail(j) {
    const z = zoomOf(j), el = document.createElement('div');
    el.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Detail sesi');
    const row = (l, v) => (v ? `<div><dt class="text-[10px] font-bold tracking-wider uppercase text-slate-400">${l}</dt><dd class="mt-0.5 text-[13px] font-semibold text-slate-800 dark:text-slate-100 break-words">${v}</dd></div>` : '');
    el.innerHTML = `<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
      <div class="flex items-start justify-between gap-3"><div><p class="text-[11px] text-slate-400">${esc(longDate(j.tanggal))}</p><h3 class="text-lg font-extrabold text-slate-900 dark:text-white leading-snug">${esc(j.judul)}</h3></div>
        <button type="button" data-x class="dc-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div>
      <dl class="grid sm:grid-cols-2 gap-x-5 gap-y-3">
        ${row('Waktu', esc(j.mulai) + ' – ' + esc(j.selesai) + ' WIB')}${row('Jenjang', j.grade ? esc(GRADES[j.grade] || j.grade) : 'Semua jenjang')}
        ${row('Jenis', esc(j.jenis))}${row('Mentor', esc(j.mentor))}${row('Level / Kelas', esc(j.level))}
        ${row('Learning Path', esc([j.learningPathName, j.taskName].filter(Boolean).join(' · ')))}
        ${row('Meeting ID', esc(j.meetingId))}${row('Passcode', esc(j.passcode))}</dl>
      ${j.keterangan ? `<div><p class="text-[10px] font-bold tracking-wider uppercase text-slate-400">Catatan untuk siswa</p><p class="mt-1 text-[13px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line">${esc(j.keterangan)}</p></div>` : ''}
      <div class="flex justify-end gap-2 pt-1"><button type="button" data-x class="dc-btn dc-btn-ghost">Tutup</button>
        ${z ? `<a href="${esc(z)}" target="_blank" rel="noopener noreferrer" class="dc-btn dc-btn-pri"><i class="fa-solid fa-video"></i><span>Buka Zoom</span></a>` : ''}</div></div>`;
    const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', close));
    document.body.appendChild(el);
  }

  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); } catch (_) { toast('Gagal menyalin, salin manual.', 'error'); }
  }

  async function saveAvail(redraw) {
    if (JW.avail.some((a) => a.aktif && minutes(a.mulai, a.selesai) <= 0)) { toast('Gagal: periksa jam yang belum valid.', 'error'); return; }
    if (!JW.meta.jenjang.length) { toast('Gagal: pilih minimal satu jenjang.', 'error'); return; }
    const items = JW.avail.map((a) => ({ hari: a.hari, aktif: !!a.aktif, mulai: a.mulai, selesai: a.selesai }));
    const body = { items, jenjang: JW.meta.jenjang, maxSesi: JW.meta.maxSesi, catatan: JW.meta.catatan.trim() };
    if (!JW.availLocal) {
      try { await req('/api/instruktur/ketersediaan', { method: 'PUT', body }); toast('Ketersediaan disimpan.'); return; }
      catch (e) { if (!missing(e)) { toast('Gagal menyimpan: ' + (e.message || 'coba lagi.'), 'error'); return; } JW.availLocal = true; }
    }
    try { localStorage.setItem(AV_KEY, JSON.stringify(body)); } catch (_) {}
    toast('Ketersediaan disimpan di browser ini (mode contoh).'); redraw();
  }

  // ---------- klik ----------
  function click(e, ctx) {
    const t = e.target.closest('[data-jw]'); if (!t) return;
    const a = t.dataset.jw, v = t.dataset.v, redraw = ctx.redraw;
    switch (a) {
      case 'tab': JW.tab = v; redraw(); break;
      case 'filter': JW.filter = v; JW.sel = ''; redraw(); break;
      case 'day': JW.sel = JW.sel === v ? '' : v; redraw(); break;
      case 'clear-day': JW.sel = ''; redraw(); break;
      case 'wk-prev': JW.week = addDays(JW.week, -7); redraw(); break;
      case 'wk-next': JW.week = addDays(JW.week, 7); redraw(); break;
      case 'detail': { const j = ctx.find(v); if (j) detail(j); break; }
      case 'salin': { const j = ctx.find(v); const z = j && zoomOf(j); if (z) copy(z, 'Link Zoom disalin.'); break; }
      case 'salin-default': copy(zoomDefault().link, 'Link Zoom disalin.'); break;
      case 'ubah-default': if (root.DCProfil) root.DCProfil.setTab('mentoring'); location.hash = '#profil'; break;
      case 'av-toggle': { const i = Number(v); JW.avail[i].aktif = !JW.avail[i].aktif; redraw(); break; }
      case 'av-reset': JW.avail = defaultAvail(); JW.meta = defaultMeta(); redraw(); break;
      case 'av-sore': JW.avail.forEach((a, i) => { a.aktif = i < 5; if (i < 5) { a.mulai = '15:00'; a.selesai = '18:00'; } }); redraw(); break;
      case 'av-akhir': JW.avail.forEach((a, i) => { a.aktif = i >= 5; if (i >= 5) { a.mulai = '09:00'; a.selesai = '15:00'; } }); redraw(); break;
      case 'av-salin': { const s0 = JW.avail[0]; JW.avail.forEach((a) => { if (a.aktif) { a.mulai = s0.mulai; a.selesai = s0.selesai; } }); redraw(); break; }
      case 'av-kosong': JW.avail.forEach((a) => { a.aktif = false; }); redraw(); break;
      case 'meta-jenjang': { const j = JW.meta.jenjang, i = j.indexOf(v); if (i >= 0) j.splice(i, 1); else j.push(v); redraw(); break; }
      case 'av-save': saveAvail(redraw); break;
    }
  }

  root.DCJadwalUI = { html: html, afterDraw: afterDraw, click: click, zoomDefault: zoomDefault };
})(window);
