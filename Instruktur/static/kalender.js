/*
 * Kalender Aktivitas (panel Instruktur). Dipasang lewat DCKalender.mount(elemen, ctx) dari instruktur.js (view "kalender").
 *
 * HANYA MEMBACA data yang sudah ada; tidak menyimpan jadwal sendiri (jadi tidak ada jadwal ganda):
 *   Jadwal Zoom / agenda mentoring -> stores.jadwal  (tanggal, mulai, selesai, judul, jenis, grade)
 *   Tenggat tugas                  -> stores.tugas   (due, title, points, status)
 *   Ujian                          -> stores.ujian   (buka, tutup, title, status)
 * Mengubah jadwal tetap dilakukan di halaman masing-masing (tombol "Buka").
 * Kalau salah satu sumber gagal dimuat, sumber lain tetap tampil dengan peringatan.
 */
(function () {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CARD = 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-card';
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const GR = { SD: 'SD', SMP: 'SMP', SMK: 'SMA/SMK' };
  const TYPES = {
    zoom: { label: 'Zoom mentoring', dot: 'bg-emerald-500', bar: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200', view: 'jadwal' },
    tugas: { label: 'Tenggat tugas', dot: 'bg-amber-500', bar: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200', view: 'tugas' },
    ujian: { label: 'Ujian', dot: 'bg-rose-500', bar: 'bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200', view: 'ujian' }
  };
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const day10 = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');
  const S = { el: null, ctx: null, y: 0, m: 0, sel: '', events: null, off: new Set(), warn: [], local: false };
  const $ = (s) => S.el.querySelector(s);

  // ---------- data ----------
  async function load() {
    S.warn = []; S.local = false;
    const names = { jadwal: 'jadwal Zoom', tugas: 'tugas', ujian: 'ujian' }, st = S.ctx.stores;
    const got = await Promise.allSettled(Object.keys(names).map((k) => st[k].list()));
    const ev = [];
    got.forEach((r, i) => {
      const k = Object.keys(names)[i];
      if (r.status !== 'fulfilled') { S.warn.push(names[k]); return; }
      if (st[k].isLocal && st[k].isLocal()) S.local = true;
      (r.value || []).forEach((x) => {
        if (k === 'jadwal') { const d = day10(x.tanggal); if (d) ev.push({ id: 'z' + x.id, type: 'zoom', date: d, time: x.mulai || '', end: x.selesai || '', title: x.judul || 'Zoom mentoring', sub: [x.jenis, GR[x.grade] || (x.grade ? x.grade : 'Semua jenjang')].filter(Boolean).join(' · ') }); }
        else if (k === 'tugas') { const d = day10(x.due); if (d) ev.push({ id: 't' + x.id, type: 'tugas', date: d, time: '', title: x.title || 'Tugas', sub: 'Tenggat' + (x.points ? ' · ' + x.points + ' poin' : '') + (x.status === 'draft' ? ' · draf' : ''), draft: x.status === 'draft' }); }
        else { [['buka', 'dibuka'], ['tutup', 'ditutup']].forEach(([f, w]) => { const d = day10(x[f]); if (d) ev.push({ id: 'u' + x.id + f, type: 'ujian', date: d, time: '', title: x.title || 'Ujian', sub: 'Ujian ' + w + (x.status === 'draft' ? ' · draf' : ''), draft: x.status === 'draft' }); }); }
      });
    });
    S.events = ev;
  }

  const inMonth = (e) => e.date.startsWith(S.y + '-' + pad(S.m + 1));
  const byDay = (date) => (S.events || []).filter((e) => e.date === date && !S.off.has(e.type)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));

  // ---------- tampilan ----------
  function mount(el, ctx) {
    S.ctx = ctx; if (S.el !== el) { S.el = el; bind(el); }
    const now = new Date(); S.y = now.getFullYear(); S.m = now.getMonth(); S.sel = ymd(now); S.events = null;
    el.innerHTML = `<div class="space-y-5"><div><h1 class="text-2xl font-bold text-slate-900 dark:text-white">Kalender aktivitas</h1><p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Semua jadwal Zoom, tenggat tugas, dan ujian dalam satu tampilan.</p></div><div id="kalNote"></div><div id="kalBody"><div class="text-center text-sm text-slate-500 py-16"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat kalender...</div></div></div>`;
    load().then(draw);
  }

  function draw() {
    const note = [];
    if (S.warn.length) note.push(`<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30" role="alert"><i class="fa-solid fa-triangle-exclamation mt-0.5"></i><span>Data ${esc(S.warn.join(', '))} gagal dimuat, jadi belum tampil di kalender. <button type="button" data-kal="retry" class="font-semibold underline">Coba lagi</button></span></div>`);
    if (S.local) note.push(`<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"><i class="fa-solid fa-flask mt-0.5"></i><span><b>Mode contoh:</b> sebagian data jadwal berasal dari penyimpanan di browser ini, bukan dari server.</span></div>`);
    $('#kalNote').innerHTML = `<div class="space-y-2">${note.join('')}</div>`;
    if (S.warn.length === 3) { $('#kalBody').innerHTML = ''; return; }
    $('#kalBody').innerHTML = `<div class="xl:grid xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start space-y-5 xl:space-y-0"><section class="${CARD} p-4 sm:p-5" id="kalGrid"></section><section class="${CARD} p-4 sm:p-5" id="kalAgenda"></section></div>`;
    drawGrid(); drawAgenda();
  }

  function drawGrid() {
    const first = new Date(S.y, S.m, 1), total = new Date(S.y, S.m + 1, 0).getDate(), off = (first.getDay() + 6) % 7, today = ymd(new Date());
    const monthEv = (S.events || []).filter(inMonth), cnt = (t) => monthEv.filter((e) => e.type === t).length;
    const chips = Object.entries(TYPES).map(([k, v]) => `<button type="button" data-kal="type" data-t="${k}" aria-pressed="${!S.off.has(k)}" class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border transition-colors ${S.off.has(k) ? 'bg-white border-slate-200 text-slate-400 line-through dark:bg-slate-900 dark:border-slate-700' : 'bg-white border-slate-300 text-slate-700 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200'}"><span class="w-2 h-2 rounded-full ${v.dot}"></span>${v.label}<b>${cnt(k)}</b></button>`).join('');
    let cells = '';
    for (let i = 0; i < off; i++) cells += '<div class="min-h-[56px] xl:min-h-[84px]"></div>';
    for (let d = 1; d <= total; d++) {
      const date = S.y + '-' + pad(S.m + 1) + '-' + pad(d), list = byDay(date), on = date === S.sel, td = date === today;
      const bars = list.slice(0, 3).map((e) => `<span class="hidden xl:block truncate rounded px-1.5 py-0.5 text-[11px] leading-tight ${TYPES[e.type].bar} ${e.draft ? 'opacity-60' : ''}">${e.time ? esc(e.time) + ' ' : ''}${esc(e.title)}</span>`).join('');
      const dots = list.slice(0, 4).map((e) => `<span class="w-1.5 h-1.5 rounded-full ${TYPES[e.type].dot}"></span>`).join('');
      cells += `<button type="button" data-kal="day" data-date="${date}" aria-label="${d} ${MONTHS[S.m]}, ${list.length ? list.length + ' agenda' : 'tidak ada agenda'}" aria-pressed="${on}" class="min-h-[56px] xl:min-h-[84px] p-1.5 text-left rounded-xl border flex flex-col gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${on ? 'border-sky-400 bg-sky-50 dark:bg-sky-500/10 dark:border-sky-500/50' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'}"><span class="text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${td ? 'bg-sky-600 text-white' : 'text-slate-700 dark:text-slate-200'}">${d}</span>${bars}${list.length > 3 ? `<span class="hidden xl:block text-[11px] text-slate-500 px-1">+${list.length - 3} lagi</span>` : ''}<span class="flex gap-1 flex-wrap xl:hidden">${dots}</span></button>`;
    }
    $('#kalGrid').innerHTML = `<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div class="flex items-center gap-2"><button type="button" data-kal="prev" class="dc-btn dc-btn-sec dc-btn-sm" aria-label="Bulan sebelumnya"><i class="fa-solid fa-chevron-left text-xs"></i></button><h2 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white min-w-[9.5rem] text-center" aria-live="polite">${MONTHS[S.m]} ${S.y}</h2><button type="button" data-kal="next" class="dc-btn dc-btn-sec dc-btn-sm" aria-label="Bulan berikutnya"><i class="fa-solid fa-chevron-right text-xs"></i></button></div>
      <button type="button" data-kal="today" class="dc-btn dc-btn-ghost dc-btn-sm">Hari ini</button></div>
      <div class="flex flex-wrap gap-2 mb-4">${chips}</div>
      <div class="grid grid-cols-7 gap-1 mb-1">${DAYS.map((d) => `<div class="text-center text-[11px] font-medium text-slate-500 dark:text-slate-400 py-1">${d}</div>`).join('')}</div>
      <div class="grid grid-cols-7 gap-1">${cells}</div>`;
  }

  function drawAgenda() {
    const d = new Date(S.sel + 'T00:00:00'), list = byDay(S.sel);
    const head = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#kalAgenda').innerHTML = `<h2 class="text-base font-bold text-slate-900 dark:text-white">${esc(head)}</h2><p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${list.length ? list.length + ' agenda' : 'Tidak ada agenda'}</p>
      ${list.length ? `<ul class="mt-4 space-y-3">${list.map((e) => `<li class="flex gap-3"><span class="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${TYPES[e.type].dot}"></span><div class="min-w-0 flex-1"><p class="text-sm font-semibold text-slate-900 dark:text-white break-words">${esc(e.title)}${e.draft ? ' <span class="text-[11px] font-normal text-slate-400">(draf)</span>' : ''}</p><p class="text-xs text-slate-500 dark:text-slate-400">${e.time ? '<i class="fa-regular fa-clock mr-1"></i>' + esc(e.time) + (e.end ? ' - ' + esc(e.end) : '') + ' · ' : ''}${esc(e.sub)}</p></div><button type="button" data-view="${TYPES[e.type].view}" class="dc-btn dc-btn-ghost dc-btn-sm shrink-0">Buka</button></li>`).join('')}</ul>`
      : `<div class="mt-6 text-center py-8"><span class="mx-auto w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center"><i class="fa-regular fa-calendar"></i></span><p class="text-sm text-slate-500 dark:text-slate-400 mt-3">Hari ini kosong. Pilih tanggal lain atau tambahkan jadwal dari halaman Jadwal Zoom, Tugas, atau Ujian.</p></div>`}`;
  }

  // ---------- event ----------
  function shift(n) { const d = new Date(S.y, S.m + n, 1); S.y = d.getFullYear(); S.m = d.getMonth(); const t = ymd(new Date()); S.sel = t.startsWith(S.y + '-' + pad(S.m + 1)) ? t : S.y + '-' + pad(S.m + 1) + '-01'; drawGrid(); drawAgenda(); }
  function bind(el) {
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-kal]'); if (!b) return;
      const a = b.dataset.kal;
      if (a === 'prev') shift(-1); else if (a === 'next') shift(1);
      else if (a === 'today') { const n = new Date(); S.y = n.getFullYear(); S.m = n.getMonth(); S.sel = ymd(n); drawGrid(); drawAgenda(); }
      else if (a === 'day') { S.sel = b.dataset.date; drawGrid(); drawAgenda(); const g = $('#kalGrid [data-kal=day][aria-pressed=true]'); if (g) g.focus(); }
      else if (a === 'type') { const t = b.dataset.t; S.off.has(t) ? S.off.delete(t) : S.off.add(t); drawGrid(); drawAgenda(); }
      else if (a === 'retry') { $('#kalBody').innerHTML = '<div class="text-center text-sm text-slate-500 py-16"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat kalender...</div>'; await load(); draw(); }
    });
  }

  window.DCKalender = { mount };
})();
