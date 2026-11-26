/*
 * Tab di halaman Tugas Tambahan: Tugas Aktif | Pengumpulan Siswa | Bank Tugas.
 * Dipasang dari instruktur.js lewat hook afterDraw: DCBankTugas.enhance(view, ctx). Tampilan "Tugas Aktif" tidak diubah.
 *
 * Bank Tugas = template tugas yang bisa dipakai ulang.
 *   GET/POST /api/instruktur/bank-tugas   PATCH/DELETE /api/instruktur/bank-tugas/:id
 *   item: { id, title, category, difficulty: "mudah"|"sedang"|"sulit", grade ("" = semua jenjang), type, points, description, instructions }
 *   Endpoint belum ada -> Mode contoh (disimpan di browser ini saja, ditandai banner).
 * "Gunakan template" membuka form Tambah Tugas yang sudah ada dengan isian terisi; tugas baru berstatus draft.
 * Tab Pengumpulan Siswa hanya menggabungkan data yang sudah ada (submissions per tugas); tidak ada endpoint baru.
 */
(function () {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const INPUT = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
  const CARD = 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-card';
  const TONE = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-300/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
    warn: 'bg-amber-50 text-amber-800 border-amber-300/70 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
    bad: 'bg-rose-50 text-rose-700 border-rose-300/70 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
    mute: 'bg-slate-100 text-slate-600 border-slate-300/70 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    info: 'bg-sky-50 text-sky-700 border-sky-200/70 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30'
  };
  const pill = (t, c) => `<span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${c}">${esc(t)}</span>`;
  const CATS = ['Dasar Pemrograman', 'Logika dan Algoritma', 'Game dan Animasi', 'Web', 'Proyek', 'Lainnya'];
  const LEVEL = { mudah: ['Mudah', TONE.ok], sedang: ['Sedang', TONE.warn], sulit: ['Sulit', TONE.bad] };
  const TABS = [['aktif', 'Tugas Aktif'], ['pengumpulan', 'Pengumpulan Siswa'], ['bank', 'Bank Tugas']];
  const S = { tab: 'aktif', q: '', cat: '', lvl: '', bank: null, subs: null, subF: 'todo', ctx: null, view: null };
  const waktu = (iso) => { try { return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };
  const demoNote = (path) => `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"><i class="fa-solid fa-flask mt-0.5"></i><span><b>Mode contoh:</b> endpoint <code>${path}</code> belum tersedia. Data disimpan di browser ini saja.</span></div>`;
  const empty = (icon, title, msg, btn) => `<div class="${CARD} px-6 py-14 text-center"><span class="mx-auto w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-lg"><i class="fa-solid ${icon}"></i></span><h3 class="mt-4 font-bold text-slate-800 dark:text-white">${esc(title)}</h3><p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">${esc(msg)}</p>${btn || ''}</div>`;
  const loading = '<div class="text-center text-sm text-slate-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat...</div>';

  // ---------- kerangka tab ----------
  function enhance(view, ctx) {
    S.ctx = ctx; S.view = view; bind(view);
    const hero = view.firstElementChild; if (!hero) return;
    const tabs = document.createElement('div'); tabs.id = 'tgTabs'; hero.after(tabs);
    const panel = document.createElement('div'); panel.id = 'tgPanel'; panel.className = 'hidden'; view.appendChild(panel);
    S.bank = null; S.subs = null;   // data dimuat ulang tiap halaman digambar ulang (mis. setelah menilai)
    apply();
  }

  function apply() {
    const view = S.view, hero = view.firstElementChild, panel = view.querySelector('#tgPanel');
    view.querySelector('#tgTabs').innerHTML = `<div role="tablist" aria-label="Tugas Tambahan" class="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800">${TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${S.tab === k}" data-tg="tab" data-tab="${k}" class="px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors focus:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800/50 ${S.tab === k ? 'border-sky-500 text-sky-700 dark:text-sky-300 font-semibold' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}">${l}</button>`).join('')}</div>`;
    [...view.children].forEach((c) => { if (c !== hero && c.id !== 'tgTabs' && c !== panel) c.classList.toggle('hidden', S.tab !== 'aktif'); });
    const add = hero.querySelector('[data-add]'); if (add) add.classList.toggle('hidden', S.tab !== 'aktif');
    panel.classList.toggle('hidden', S.tab === 'aktif');
    if (S.tab === 'bank') renderBank(); else if (S.tab === 'pengumpulan') renderSubs();
  }

  // ---------- Bank Tugas ----------
  async function loadBank() {
    if (S.bank) return S.bank;
    try { S.bank = await S.ctx.store.list(); } catch (e) { S.bank = []; S.ctx.h.toast(e.message || 'Gagal memuat Bank Tugas.', 'error'); }
    return S.bank;
  }

  async function renderBank() {
    const panel = S.view.querySelector('#tgPanel'); panel.innerHTML = loading;
    await loadBank(); if (S.tab !== 'bank') return;
    const sel = `${INPUT} pr-8 cursor-pointer`, opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
    panel.innerHTML = `<div class="space-y-4">${S.ctx.store.isLocal() ? demoNote('/api/instruktur/bank-tugas') : ''}
      <div class="flex flex-col xl:flex-row gap-2.5 xl:items-center">
        <label class="relative flex-1"><span class="sr-only">Cari template</span><input data-tgf="q" type="search" value="${esc(S.q)}" placeholder="Cari template tugas" class="${INPUT} w-full"></label>
        <select data-tgf="cat" aria-label="Filter kategori" class="${sel}">${opt('', 'Semua kategori', S.cat)}${CATS.map((c) => opt(c, c, S.cat)).join('')}</select>
        <select data-tgf="lvl" aria-label="Filter tingkat kesulitan" class="${sel}">${opt('', 'Semua tingkat', S.lvl)}${Object.entries(LEVEL).map(([k, v]) => opt(k, v[0], S.lvl)).join('')}</select>
        <button type="button" data-tg="add" class="dc-btn dc-btn-pri shrink-0"><i class="fa-solid fa-plus text-xs"></i><span>Tambah Template</span></button></div>
      <div id="tgBankList"></div></div>`;
    renderBankList();
  }

  function renderBankList() {
    const box = S.view.querySelector('#tgBankList'); if (!box) return;
    const q = S.q.trim().toLowerCase(), H = S.ctx.h;
    const list = (S.bank || []).filter((t) => (!q || (t.title + ' ' + (t.description || '')).toLowerCase().includes(q)) && (!S.cat || t.category === S.cat) && (!S.lvl || t.difficulty === S.lvl));
    if (!(S.bank || []).length) { box.innerHTML = empty('fa-box-archive', 'Bank Tugas masih kosong', 'Simpan tugas yang sering dipakai sebagai template, lalu gunakan lagi kapan saja.', '<button type="button" data-tg="add" class="dc-btn dc-btn-pri mt-5">Tambah Template</button>'); return; }
    if (!list.length) { box.innerHTML = empty('fa-magnifying-glass', 'Tidak ada template yang cocok', 'Coba ubah kata kunci atau filter.'); return; }
    box.innerHTML = `<p class="text-xs text-slate-500 dark:text-slate-400 mb-2.5" aria-live="polite">${list.length} template</p><div class="grid gap-3 lg:grid-cols-2">${list.map((t) => `<article class="${CARD} p-4 sm:p-5 flex flex-col gap-3">
      <div class="min-w-0"><h3 class="font-bold text-slate-900 dark:text-white">${esc(t.title)}</h3>
        <div class="flex flex-wrap gap-1.5 mt-2">${t.category ? pill(t.category, TONE.info) : ''}${LEVEL[t.difficulty] ? pill(LEVEL[t.difficulty][0], LEVEL[t.difficulty][1]) : ''}${pill(H.GRADES[t.grade] || 'Semua jenjang', TONE.mute)}${pill(H.TYPES[t.type] || t.type || '-', TONE.mute)}</div>
        ${t.description ? `<p class="text-sm text-slate-600 dark:text-slate-300 mt-2.5 line-clamp-2">${esc(t.description)}</p>` : ''}
        ${t.instructions ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2">${esc(t.instructions)}</p>` : ''}</div>
      <div class="flex items-center gap-2 mt-auto pt-1"><span class="text-xs text-slate-500 dark:text-slate-400 mr-auto"><i class="fa-solid fa-star mr-1"></i>${esc(t.points || 0)} poin</span>
        <button type="button" data-tg="use" data-id="${esc(t.id)}" class="dc-btn dc-btn-sec dc-btn-sm"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Gunakan</span></button>
        <button type="button" data-tg="edit" data-id="${esc(t.id)}" class="dc-ib dc-ib-edit" aria-label="Ubah template" title="Ubah"><i class="fa-solid fa-pen"></i></button>
        <button type="button" data-tg="del" data-id="${esc(t.id)}" class="dc-ib dc-ib-danger" aria-label="Hapus template" title="Hapus"><i class="fa-solid fa-trash-can"></i></button></div></article>`).join('')}</div>`;
  }

  function openTemplateForm(ctx, item, preset) {
    const H = ctx.h, pre = item || preset || {};
    const fields = [
      { n: 'title', l: 'Judul template', full: true, ph: 'Contoh: Pola Bintang dengan Perulangan' },
      { n: 'category', l: 'Kategori', t: 'select', o: CATS.map((c) => [c, c]), def: CATS[0] },
      { n: 'difficulty', l: 'Tingkat kesulitan', t: 'select', o: Object.entries(LEVEL).map(([k, v]) => [k, v[0]]), def: 'sedang' },
      { n: 'grade', l: 'Jenjang', t: 'select', o: [['', 'Semua jenjang'], ...Object.entries(H.GRADES)], def: '' },
      { n: 'type', l: 'Jenis', t: 'select', o: Object.entries(H.TYPES), def: 'kode' },
      { n: 'points', l: 'Poin', t: 'number', min: 0, maxv: 1000, def: 30 },
      { n: 'description', l: 'Deskripsi singkat', t: 'textarea', full: true, max: 200, ph: 'Ringkasan tugas dalam satu atau dua kalimat' },
      { n: 'instructions', l: 'Instruksi untuk siswa', t: 'textarea', full: true, max: 400, ph: 'Langkah-langkah yang harus dikerjakan...' }
    ];
    H.modal(item ? 'Ubah Template' : 'Tambah Template', `<div class="grid sm:grid-cols-2 gap-3">${fields.map((f) => H.fieldHtml(f, pre[f.n])).join('')}</div>`, async (f) => {
      if (!f.title.trim()) return 'Judul wajib diisi.';
      const data = { title: f.title.trim(), category: f.category, difficulty: f.difficulty, grade: f.grade, type: f.type, points: Number(f.points) || 0, description: f.description.trim(), instructions: f.instructions.trim() };
      await ctx.store.save(item ? { ...item, ...data } : data);
      S.bank = null; H.toast(item ? 'Template diperbarui.' : 'Template disimpan ke Bank Tugas.');
      if (S.tab === 'bank') renderBank();
    }, item ? 'Simpan Perubahan' : 'Simpan Template', true);
  }

  // ---------- Pengumpulan Siswa (gabungan dari semua tugas) ----------
  async function renderSubs() {
    const panel = S.view.querySelector('#tgPanel'), ctx = S.ctx; panel.innerHTML = loading;
    if (!S.subs) {
      const tugas = ctx.tugas();
      try { S.subs = (await Promise.all(tugas.map(async (t) => (await ctx.subs.list(t.id)).map((s) => ({ ...s, _t: t }))))).flat(); }
      catch (e) { S.subs = []; ctx.h.toast(e.message || 'Gagal memuat pengumpulan.', 'error'); }
    }
    if (S.tab !== 'pengumpulan') return;
    const P = window.DCPenilaian, keyOf = (s) => (P ? P.keyOf(s) : (s.nilai != null && s.nilai !== '' ? 'selesai' : 'menunggu'));
    const need = (s) => ['menunggu', 'sedang_dinilai'].includes(keyOf(s));
    const F = { todo: ['Perlu dinilai', need], revisi: ['Perlu revisi', (s) => keyOf(s) === 'revisi'], selesai: ['Selesai', (s) => keyOf(s) === 'selesai'], all: ['Semua', () => true] };
    const list = S.subs.filter(F[S.subF][1]).sort((a, b) => (Date.parse(b.submittedAt) || 0) - (Date.parse(a.submittedAt) || 0));
    const chips = Object.entries(F).map(([k, [l, fn]]) => `<button type="button" data-tg="subf" data-f="${k}" aria-pressed="${S.subF === k}" class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm border transition-colors ${S.subF === k ? 'bg-sky-50 border-sky-300 text-sky-800 font-semibold dark:bg-sky-500/15 dark:border-sky-500/40 dark:text-sky-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'}">${l}<b>${S.subs.filter(fn).length}</b></button>`).join('');
    const meta = (s) => (P ? P.meta(s) : [keyOf(s) === 'selesai' ? 'Selesai' : 'Menunggu Penilaian', keyOf(s) === 'selesai' ? TONE.ok : TONE.warn]);
    panel.innerHTML = `<div class="space-y-4">${ctx.subs.isLocal() ? demoNote('/api/instruktur/tugas/:id/submissions') : ''}<div class="flex flex-wrap gap-2">${chips}</div>
      ${!ctx.tugas().length ? empty('fa-clipboard', 'Belum ada tugas', 'Buat tugas di tab Tugas Aktif, lalu pengumpulan siswa akan muncul di sini.')
      : !list.length ? empty('fa-inbox', 'Tidak ada pengumpulan', S.subF === 'todo' ? 'Semua pengumpulan sudah ditangani.' : 'Belum ada data untuk filter ini.')
      : `<div class="border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-card divide-y divide-slate-100 dark:divide-slate-800">${list.map((s) => { const m = meta(s); return `<div class="bg-white dark:bg-slate-900 px-4 sm:px-5 py-3.5 flex items-center gap-3 flex-wrap"><div class="min-w-0 flex-1"><p class="font-semibold text-sm text-slate-900 dark:text-white truncate">${esc(s.nama || s.username || 'Siswa')}</p><p class="text-xs text-slate-500 dark:text-slate-400 truncate">${esc(s._t.title)}${s.submittedAt ? ' · ' + esc(waktu(s.submittedAt)) : ''}</p></div>${s.nilai != null && s.nilai !== '' ? `<b class="text-sm text-slate-800 dark:text-slate-100">${esc(s.nilai)}</b>` : ''}${pill(m[0], m[1])}<button type="button" data-tg="sub-open" data-tid="${esc(s._t.id)}" class="dc-btn dc-btn-sec dc-btn-sm">Buka</button></div>`; }).join('')}</div>`}</div>`;
  }

  // ---------- event (dipasang sekali per elemen view) ----------
  function bind(view) {
    if (view.__tgBound) return; view.__tgBound = true;
    view.addEventListener('input', (e) => { if (e.target.dataset.tgf === 'q') { S.q = e.target.value; renderBankList(); } });
    view.addEventListener('change', (e) => { const f = e.target.dataset.tgf; if (f === 'cat' || f === 'lvl') { S[f] = e.target.value; renderBankList(); } });
    view.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-tg]'); if (!b) return;
      const a = b.dataset.tg, ctx = S.ctx, H = ctx.h, tpl = () => (S.bank || []).find((x) => String(x.id) === String(b.dataset.id));
      if (a === 'tab') { S.tab = b.dataset.tab; apply(); }
      else if (a === 'add') openTemplateForm(ctx, null);
      else if (a === 'edit') { const t = tpl(); if (t) openTemplateForm(ctx, t); }
      else if (a === 'use') { const t = tpl(); if (!t) return; S.tab = 'aktif'; apply(); ctx.useTemplate(t); }
      else if (a === 'del') {
        const t = tpl(); if (!t) return;
        if (!(await H.confirm({ title: 'Hapus template?', message: 'Template ini hilang dari Bank Tugas. Tugas yang sudah dibuat darinya tidak terpengaruh.', detail: t.title, confirmText: 'Hapus', tone: 'danger' }))) return;
        try { await ctx.store.remove(t.id); S.bank = null; H.toast('Template dihapus.'); renderBank(); } catch (ex) { H.toast(ex.message || 'Gagal menghapus.', 'error'); }
      }
      else if (a === 'subf') { S.subF = b.dataset.f; renderSubs(); }
      else if (a === 'sub-open') { const t = ctx.tugas().find((x) => String(x.id) === b.dataset.tid); if (t) ctx.openJawaban(t); }
    });
  }

  window.DCBankTugas = {
    enhance,
    // dipanggil dari kartu tugas: simpan tugas yang sudah ada sebagai template
    saveFromTugas(ctx, t) { openTemplateForm(ctx, null, { title: t.title, grade: t.grade, type: t.type, points: t.points, description: String(t.description || '').slice(0, 200) }); }
  };
})();
