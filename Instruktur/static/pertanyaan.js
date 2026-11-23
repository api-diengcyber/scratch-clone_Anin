/*
 * Pertanyaan Siswa (inbox sederhana, bukan live chat). Dipasang lewat DCPertanyaan.mount(elemen, ctx) dari instruktur.js (view "pertanyaan").
 *
 * Data: /api/instruktur/pertanyaan (GET, PATCH /:id). Belum ada -> Mode contoh (disimpan di browser ini saja).
 *   item: { id, judul, isi, siswaNama, grade, learningPathName, tahap, taskName, createdAt,
 *           lampiran?: [{ nama, url }], status: "belum"|"dijawab"|"selesai",
 *           balasan: [{ by: "siswa"|"instruktur", teks, at }] }
 * Membalas = PATCH { status: "dijawab", balasan: [...semua balasan] }. Tandai selesai / buka kembali = PATCH { status }.
 * Backend bisa menyediakan endpoint balasan sendiri; cukup ganti pemanggilan save() di bawah.
 * Pertanyaan masuk dari form "Tanya Mentor" di sisi siswa (belum dibuat). Instruktur hanya melihat pertanyaan siswa yang ditugaskan padanya (diatur backend).
 */
(function () {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const INPUT = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
  const CARD = 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-card';
  const TONE = {
    warn: 'bg-amber-50 text-amber-800 border-amber-300/70 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
    proc: 'bg-indigo-50 text-indigo-700 border-indigo-200/70 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30',
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-300/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
    info: 'bg-sky-50 text-sky-700 border-sky-200/70 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30'
  };
  const ST = { belum: ['Belum Dijawab', TONE.warn, 'bg-amber-500'], dijawab: ['Sudah Dijawab', TONE.proc, 'bg-indigo-500'], selesai: ['Selesai', TONE.ok, 'bg-emerald-500'] };
  const GR = { SD: 'SD', SMP: 'SMP', SMK: 'SMA/SMK' };
  const pill = (t, c) => `<span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${c}">${esc(t)}</span>`;
  const S = { el: null, ctx: null, items: null, f: 'belum', q: '', sel: null, drafts: {}, busy: false };

  const key = (x) => (ST[x.status] ? x.status : 'belum');
  const last = (x) => { const b = (x.balasan || []).slice(-1)[0]; return Date.parse((b && b.at) || x.createdAt) || 0; };
  const ago = (iso) => { const t = Date.parse(iso); if (isNaN(t)) return ''; const m = Math.floor((Date.now() - t) / 60000); if (m < 1) return 'Baru saja'; if (m < 60) return m + ' menit lalu'; const h = Math.floor(m / 60); if (h < 24) return h + ' jam lalu'; const d = Math.floor(h / 24); return d === 1 ? 'Kemarin' : d < 7 ? d + ' hari lalu' : new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); };
  const fmt = (iso) => { try { return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };
  const initials = (n) => { const p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
  const avatar = (n, s) => `<span class="${s || 'w-9 h-9 text-xs'} shrink-0 rounded-full bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 font-bold flex items-center justify-center">${esc(initials(n))}</span>`;
  const empty = (icon, title, msg, btn) => `<div class="px-6 py-14 text-center"><span class="mx-auto w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-lg"><i class="fa-solid ${icon}"></i></span><h3 class="mt-4 font-bold text-slate-800 dark:text-white">${esc(title)}</h3><p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">${esc(msg)}</p>${btn || ''}</div>`;
  const $ = (s) => S.el.querySelector(s);

  // ---------- kerangka ----------
  function mount(el, ctx) {
    S.ctx = ctx; if (S.el !== el) { S.el = el; bind(el); }
    el.innerHTML = `<div class="space-y-5">
      <div><h1 class="text-2xl font-bold text-slate-900 dark:text-white">Pertanyaan siswa</h1><p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Jawab pertanyaan siswa seputar materi dan tugas.</p></div>
      <div id="pqBanner"></div>
      <div class="lg:grid lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] gap-5 items-start">
        <section id="pqListPane" class="${CARD} overflow-hidden"><div id="pqTools" class="p-3 space-y-2.5 border-b border-slate-100 dark:border-slate-800"></div><div id="pqList" class="max-h-[70vh] overflow-y-auto"></div></section>
        <section id="pqDetail" class="hidden lg:block ${CARD} min-h-[320px]"></section></div></div>`;
    S.items = null; S.sel = null; $('#pqList').innerHTML = '<div class="text-center text-sm text-slate-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat...</div>';
    load();
  }

  async function load() {
    try { S.items = await S.ctx.store.list(); }
    catch (e) { S.items = null; $('#pqList').innerHTML = empty('fa-triangle-exclamation', 'Pertanyaan gagal dimuat', e.message || 'Terjadi kesalahan. Coba lagi.', '<button type="button" data-pq="retry" class="dc-btn dc-btn-pri mt-5">Coba lagi</button>'); return; }
    if (S.ctx.store.isLocal()) $('#pqBanner').innerHTML = `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"><i class="fa-solid fa-flask mt-0.5"></i><span><b>Mode contoh:</b> endpoint <code>/api/instruktur/pertanyaan</code> belum tersedia. Yang tampil adalah pertanyaan contoh, dan balasanmu belum sampai ke siswa.</span></div>`;
    if (!S.sel && window.matchMedia('(min-width:1024px)').matches) { const f = visible()[0]; if (f) S.sel = String(f.id); }
    drawTools(); drawList(); drawDetail();
  }

  const visible = () => {
    const q = S.q.trim().toLowerCase();
    return (S.items || []).filter((x) => (S.f === 'all' || key(x) === S.f) && (!q || ((x.siswaNama || '') + ' ' + (x.judul || '') + ' ' + (x.isi || '')).toLowerCase().includes(q))).sort((a, b) => last(b) - last(a));
  };

  function drawTools() {
    const n = (k) => (k === 'all' ? S.items.length : S.items.filter((x) => key(x) === k).length);
    const chip = (k, l) => `<button type="button" data-pq="chip" data-f="${k}" aria-pressed="${S.f === k}" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-colors ${S.f === k ? 'bg-sky-50 border-sky-300 text-sky-800 font-semibold dark:bg-sky-500/15 dark:border-sky-500/40 dark:text-sky-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'}">${l}<b>${n(k)}</b></button>`;
    $('#pqTools').innerHTML = `<div class="flex flex-wrap gap-1.5">${chip('belum', 'Belum dijawab')}${chip('dijawab', 'Sudah dijawab')}${chip('selesai', 'Selesai')}${chip('all', 'Semua')}</div>
      <label class="block"><span class="sr-only">Cari pertanyaan</span><input data-pqf="q" type="search" value="${esc(S.q)}" placeholder="Cari siswa atau pertanyaan" class="${INPUT} w-full"></label>`;
  }

  function drawList() {
    const box = $('#pqList'), list = visible();
    if (!S.items.length) { box.innerHTML = empty('fa-inbox', 'Belum ada pertanyaan', 'Pertanyaan dari siswa akan muncul di sini.'); return; }
    if (!list.length) { box.innerHTML = empty('fa-magnifying-glass', 'Tidak ada pertanyaan', S.f === 'belum' && !S.q ? 'Semua pertanyaan sudah kamu jawab.' : 'Coba ubah filter atau kata kunci.'); return; }
    box.innerHTML = `<div class="divide-y divide-slate-100 dark:divide-slate-800">${list.map((x) => { const k = key(x), on = String(x.id) === S.sel; return `<article data-pq="open" data-id="${esc(x.id)}" class="bg-white dark:bg-slate-900 flex gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${on ? '!bg-sky-50 dark:!bg-sky-500/10' : ''}">
      ${avatar(x.siswaNama)}<div class="min-w-0 flex-1"><div class="flex items-baseline justify-between gap-2"><button type="button" data-pq="open" data-id="${esc(x.id)}" class="text-left text-sm truncate focus:outline-none focus-visible:underline ${k === 'belum' ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-200'}">${esc(x.siswaNama || 'Siswa')}</button><span class="text-[11px] text-slate-400 shrink-0">${esc(ago(x.createdAt))}</span></div>
        <p class="text-sm truncate ${k === 'belum' ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}">${esc(x.judul)}</p>
        <div class="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500 dark:text-slate-400"><span class="w-1.5 h-1.5 rounded-full ${ST[k][2]}"></span>${esc(ST[k][0])}${x.learningPathName ? '<span class="truncate">&middot; ' + esc(x.learningPathName) + '</span>' : ''}</div></div></article>`; }).join('')}</div>`;
  }

  function drawDetail() {
    const pane = $('#pqDetail'), x = (S.items || []).find((i) => String(i.id) === S.sel);
    $('#pqListPane').classList.toggle('hidden', !!x && !window.matchMedia('(min-width:1024px)').matches);
    pane.classList.toggle('hidden', !x && !window.matchMedia('(min-width:1024px)').matches);
    if (!x) { pane.innerHTML = empty('fa-comments', 'Pilih pertanyaan', 'Pilih salah satu pertanyaan di daftar untuk membaca dan membalasnya.'); return; }
    const k = key(x), fact = (l, v) => `<div class="min-w-0"><p class="text-[11px] text-slate-500 dark:text-slate-400">${l}</p><p class="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">${esc(v || '-')}</p></div>`;
    const bubble = (b, q) => { const mine = b.by === 'instruktur'; return `<div class="flex ${mine ? 'justify-end' : ''}"><div class="max-w-[92%] sm:max-w-[80%] rounded-2xl px-4 py-3 ${mine ? 'bg-sky-50 dark:bg-sky-500/10 border border-sky-200/70 dark:border-sky-500/30' : 'bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700'}"><p class="text-[11px] font-semibold ${mine ? 'text-sky-700 dark:text-sky-300' : 'text-slate-500 dark:text-slate-400'}">${mine ? 'Kamu' : esc(x.siswaNama || 'Siswa')} &middot; <span class="font-normal">${esc(fmt(b.at))}</span></p>${q ? `<p class="text-sm font-bold text-slate-900 dark:text-white mt-1">${esc(x.judul)}</p>` : ''}<p class="text-sm text-slate-800 dark:text-slate-100 mt-1 whitespace-pre-wrap break-words">${esc(b.teks)}</p></div></div>`; };
    const lamp = (x.lampiran || []).filter((l) => l && l.nama).map((l) => (/^https?:\/\//i.test(l.url || '') ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300 hover:underline"><i class="fa-solid fa-paperclip"></i>${esc(l.nama)}</a>` : `<span class="inline-flex items-center gap-1.5 text-xs text-slate-500"><i class="fa-solid fa-paperclip"></i>${esc(l.nama)}</span>`)).join('');
    pane.innerHTML = `<div class="p-5 sm:p-6 space-y-5">
      <div><button type="button" data-pq="back" class="lg:hidden inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-3"><i class="fa-solid fa-arrow-left text-xs"></i>Semua pertanyaan</button>
        <div class="flex items-start justify-between gap-3 flex-wrap"><h2 class="text-lg font-bold text-slate-900 dark:text-white">${esc(x.judul)}</h2>${pill(ST[k][0], ST[k][1])}</div>
        <div class="flex items-center gap-2.5 mt-2.5">${avatar(x.siswaNama)}<div class="min-w-0"><p class="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">${esc(x.siswaNama || 'Siswa')}</p><p class="text-xs text-slate-500 dark:text-slate-400">${esc(GR[x.grade] || 'Jenjang belum diisi')}</p></div></div></div>
      <div class="grid sm:grid-cols-3 gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-3.5">${fact('Learning Path', x.learningPathName)}${fact('Tahap', x.tahap)}${fact('Task terkait', x.taskName)}</div>
      <div class="space-y-3">${bubble({ by: 'siswa', teks: x.isi, at: x.createdAt }, true)}${lamp ? `<div class="flex flex-wrap gap-3 px-1">${lamp}</div>` : ''}${(x.balasan || []).map((b) => bubble(b)).join('')}</div>
      <form data-pq-form class="space-y-2.5 pt-1 border-t border-slate-100 dark:border-slate-800" novalidate>
        <label for="pqReply" class="block text-xs font-semibold text-slate-600 dark:text-slate-300 pt-3">${k === 'belum' ? 'Balasanmu' : 'Tambah balasan'}</label>
        <textarea id="pqReply" rows="4" maxlength="1500" placeholder="Tulis jawaban yang mudah dipahami siswa..." class="${INPUT} w-full resize-y">${esc(S.drafts[x.id] || '')}</textarea>
        <p data-pq-err class="hidden text-xs font-medium text-rose-600 dark:text-rose-400" role="alert"></p>
        <div class="flex flex-wrap items-center gap-2"><button type="submit" class="dc-btn dc-btn-pri"><i class="fa-solid fa-paper-plane text-xs"></i><span>Kirim balasan</span></button>
          ${k === 'selesai' ? '<button type="button" data-pq="reopen" class="dc-btn dc-btn-sec"><i class="fa-solid fa-rotate-left text-xs"></i><span>Buka kembali</span></button>' : '<button type="button" data-pq="done" class="dc-btn dc-btn-sec"><i class="fa-solid fa-circle-check text-xs"></i><span>Tandai selesai</span></button>'}</div></form></div>`;
  }

  async function patch(x, data, okMsg) {
    if (S.busy) return; S.busy = true;
    try { await S.ctx.store.save({ ...x, ...data }); S.items = await S.ctx.store.list(); S.ctx.h.toast(okMsg); }
    catch (e) { S.ctx.h.toast(e.message || 'Gagal menyimpan. Coba lagi.', 'error'); }
    finally { S.busy = false; }
    drawTools(); drawList(); drawDetail();
  }

  // ---------- event ----------
  function bind(el) {
    el.addEventListener('input', (e) => {
      if (e.target.dataset.pqf === 'q') { S.q = e.target.value; if (S.items) drawList(); }
      else if (e.target.id === 'pqReply' && S.sel) S.drafts[S.sel] = e.target.value;
    });
    el.addEventListener('submit', async (e) => {
      if (!e.target.matches('[data-pq-form]')) return; e.preventDefault();
      const x = (S.items || []).find((i) => String(i.id) === S.sel); if (!x) return;
      const teks = $('#pqReply').value.trim(), err = $('[data-pq-err]');
      if (!teks) { err.textContent = 'Tulis balasan dulu sebelum mengirim.'; err.classList.remove('hidden'); return; }
      const now = new Date().toISOString(); delete S.drafts[x.id];
      await patch(x, { status: 'dijawab', balasan: [...(x.balasan || []), { by: 'instruktur', teks, at: now }] }, 'Balasan terkirim.');
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pq]'); if (!b) return;
      const a = b.dataset.pq, cur = (S.items || []).find((i) => String(i.id) === S.sel);
      if (a === 'open') { S.sel = String(b.dataset.id); drawList(); drawDetail(); const d = $('#pqDetail'); if (!window.matchMedia('(min-width:1024px)').matches) d.scrollIntoView({ block: 'start' }); }
      else if (a === 'back') { S.sel = null; drawList(); drawDetail(); }
      else if (a === 'retry') mount(S.el, S.ctx);
      else if (a === 'chip') { S.f = b.dataset.f; drawTools(); drawList(); }
      else if (a === 'done' && cur) patch(cur, { status: 'selesai' }, 'Pertanyaan ditandai selesai.');
      else if (a === 'reopen' && cur) patch(cur, { status: 'dijawab' }, 'Pertanyaan dibuka kembali.');
    });
  }

  window.DCPertanyaan = { mount };
})();
