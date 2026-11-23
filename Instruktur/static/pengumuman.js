/*
 * Pengumuman Kelas (panel Instruktur). Dipasang lewat DCPengumuman.mount(elemen, ctx) dari instruktur.js (view "pengumuman").
 *
 * Data: /api/instruktur/pengumuman (GET, POST, PATCH /:id, DELETE /:id). Belum ada -> Mode contoh (disimpan di browser ini saja).
 *   item: { id, title, body, status: "draft"|"terjadwal"|"terbit", publishAt (ISO, untuk terjadwal), publishedAt (ISO),
 *           targetScope: "semua"|"jenjang"|"path", grade, learningPathId, learningPathName, createdAt, updatedAt }
 * Backend yang bertugas menerbitkan pengumuman terjadwal tepat waktu dan menentukan siapa penerimanya.
 * Di sini, pengumuman "terjadwal" yang waktunya sudah lewat hanya DITAMPILKAN sebagai terbit; tidak ada yang dikirim dari browser.
 * Target "kelas atau kelompok" belum tersedia karena belum ada datanya di proyek.
 */
(function () {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const INPUT = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
  const CARD = 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-card';
  const TONE = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-300/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
    proc: 'bg-indigo-50 text-indigo-700 border-indigo-200/70 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30',
    mute: 'bg-slate-100 text-slate-600 border-slate-300/70 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    info: 'bg-sky-50 text-sky-700 border-sky-200/70 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30'
  };
  const ST = { draft: ['Draf', TONE.mute], terjadwal: ['Terjadwal', TONE.proc], terbit: ['Terbit', TONE.ok] };
  const pill = (t, c) => `<span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${c}">${esc(t)}</span>`;
  const S = { el: null, ctx: null, items: [], f: 'all', q: '' };

  const effective = (a) => (a.status === 'terjadwal' && Date.parse(a.publishAt) <= Date.now() ? 'terbit' : ST[a.status] ? a.status : 'draft');
  const fmt = (iso) => { try { return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };
  const toInput = (iso) => { const d = new Date(iso); if (isNaN(d)) return ''; d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const sortKey = (a) => Date.parse(a.publishAt || a.publishedAt || a.updatedAt || a.createdAt) || 0;
  const target = (a) => { const G = S.ctx.h.GRADES; return a.targetScope === 'path' ? (G[a.grade] || a.grade || '') + ' · ' + (a.learningPathName || a.learningPathId || '') : a.targetScope === 'jenjang' ? 'Jenjang ' + (G[a.grade] || a.grade || '') : 'Semua siswa'; };
  const when = (a) => { const e = effective(a); return e === 'terbit' ? 'Terbit ' + fmt(a.publishedAt || a.publishAt || a.updatedAt) : e === 'terjadwal' ? 'Terbit otomatis ' + fmt(a.publishAt) : 'Draf · diubah ' + fmt(a.updatedAt || a.createdAt); };
  const empty = (icon, title, msg, btn) => `<div class="${CARD} px-6 py-14 text-center"><span class="mx-auto w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-lg"><i class="fa-solid ${icon}"></i></span><h3 class="mt-4 font-bold text-slate-800 dark:text-white">${esc(title)}</h3><p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">${esc(msg)}</p>${btn || ''}</div>`;

  // ---------- daftar ----------
  async function load() {
    const box = S.el.querySelector('#pgList'); if (box) box.innerHTML = '<div class="text-center text-sm text-slate-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat...</div>';
    try { S.items = await S.ctx.store.list(); }
    catch (e) { S.items = null; if (box) box.innerHTML = empty('fa-triangle-exclamation', 'Pengumuman gagal dimuat', e.message || 'Terjadi kesalahan. Coba lagi.', '<button type="button" data-pg="retry" class="dc-btn dc-btn-pri mt-5">Coba lagi</button>'); return; }
    drawChips(); drawList();
  }

  function mount(el, ctx) {
    S.ctx = ctx;
    if (S.el !== el) { S.el = el; bind(el); }
    el.innerHTML = `<div class="space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-3"><div><h1 class="text-2xl font-bold text-slate-900 dark:text-white">Pengumuman kelas</h1><p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Sampaikan informasi ke siswa yang kamu dampingi.</p></div>
        <button type="button" data-pg="add" class="dc-btn dc-btn-pri"><i class="fa-solid fa-plus text-xs"></i><span>Buat pengumuman</span></button></div>
      <div id="pgBanner"></div><div id="pgChips"></div>
      <label class="relative block"><span class="sr-only">Cari pengumuman</span><input data-pf="q" type="search" value="${esc(S.q)}" placeholder="Cari judul atau isi pengumuman" class="${INPUT} w-full"></label>
      <div id="pgList"></div></div>`;
    ctx.store.list && load().then(() => { const b = el.querySelector('#pgBanner'); if (b && ctx.store.isLocal()) b.innerHTML = `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"><i class="fa-solid fa-flask mt-0.5"></i><span><b>Mode contoh:</b> endpoint <code>/api/instruktur/pengumuman</code> belum tersedia. Pengumuman disimpan di browser ini saja dan belum dikirim ke siswa.</span></div>`; });
  }

  function drawChips() {
    const c = (k) => (k === 'all' ? S.items.length : S.items.filter((a) => effective(a) === k).length);
    const chip = (k, l) => `<button type="button" data-pg="chip" data-f="${k}" aria-pressed="${S.f === k}" class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${S.f === k ? 'bg-sky-50 border-sky-300 text-sky-800 font-semibold dark:bg-sky-500/15 dark:border-sky-500/40 dark:text-sky-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'}">${l}<b>${c(k)}</b></button>`;
    S.el.querySelector('#pgChips').innerHTML = `<div class="flex flex-wrap gap-2">${chip('all', 'Semua')}${chip('terbit', 'Terbit')}${chip('terjadwal', 'Terjadwal')}${chip('draft', 'Draf')}</div>`;
  }

  function drawList() {
    const box = S.el.querySelector('#pgList'), q = S.q.trim().toLowerCase();
    if (!S.items.length) { box.innerHTML = empty('fa-bullhorn', 'Belum ada pengumuman', 'Buat pengumuman pertamamu. Kamu bisa menyimpannya sebagai draf atau menjadwalkan waktu terbitnya.', '<button type="button" data-pg="add" class="dc-btn dc-btn-pri mt-5">Buat pengumuman</button>'); return; }
    const list = S.items.filter((a) => (S.f === 'all' || effective(a) === S.f) && (!q || ((a.title || '') + ' ' + (a.body || '')).toLowerCase().includes(q))).sort((a, b) => sortKey(b) - sortKey(a));
    if (!list.length) { box.innerHTML = empty('fa-magnifying-glass', 'Tidak ada pengumuman yang cocok', 'Coba ubah kata kunci atau pilih filter lain.'); return; }
    box.innerHTML = `<div class="border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-card divide-y divide-slate-100 dark:divide-slate-800">${list.map((a) => { const e = effective(a); return `<article class="bg-white dark:bg-slate-900 px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3">
      <div class="min-w-0 flex-1"><div class="flex items-center gap-2 flex-wrap"><h3 class="font-bold text-slate-900 dark:text-white">${esc(a.title)}</h3>${pill(ST[e][0], ST[e][1])}</div>
        ${a.body ? `<p class="text-sm text-slate-600 dark:text-slate-300 mt-1.5 line-clamp-2 whitespace-pre-line">${esc(a.body)}</p>` : '<p class="text-sm text-slate-400 mt-1.5">Belum ada isi.</p>'}
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5 text-xs text-slate-500 dark:text-slate-400">${pill(target(a), TONE.info)}<span><i class="fa-regular fa-clock mr-1"></i>${esc(when(a))}</span></div></div>
      <div class="flex items-center gap-2 shrink-0">${e === 'draft' ? `<button type="button" data-pg="publish" data-id="${esc(a.id)}" class="dc-btn dc-btn-sec dc-btn-sm"><i class="fa-solid fa-paper-plane"></i><span>Terbitkan</span></button>` : ''}
        <button type="button" data-pg="edit" data-id="${esc(a.id)}" class="dc-ib dc-ib-edit" aria-label="Ubah pengumuman" title="Ubah"><i class="fa-solid fa-pen"></i></button>
        <button type="button" data-pg="del" data-id="${esc(a.id)}" class="dc-ib dc-ib-danger" aria-label="Hapus pengumuman" title="Hapus"><i class="fa-solid fa-trash-can"></i></button></div></article>`; }).join('')}</div>`;
  }

  // ---------- form ----------
  function openForm(item) {
    const H = S.ctx.h, pre = item || {}, e = item ? effective(item) : 'draft';
    const pubOpts = e === 'terbit' ? [['terbit', 'Tetap terbit'], ['draft', 'Tarik kembali jadi draf']] : [['draft', 'Simpan sebagai draf'], ['terbit', 'Terbitkan sekarang'], ['terjadwal', 'Jadwalkan terbit']];
    const el = H.modal(item ? 'Ubah Pengumuman' : 'Buat Pengumuman', `<div class="grid sm:grid-cols-2 gap-3">
      ${H.fieldHtml({ n: 'title', l: 'Judul', full: true, max: 120, ph: 'Contoh: Jadwal mentoring minggu ini' }, pre.title)}
      ${H.fieldHtml({ n: 'body', l: 'Isi pengumuman', t: 'textarea', full: true, max: 2000, ph: 'Tulis informasi yang ingin disampaikan ke siswa...' }, pre.body)}
      ${H.fieldHtml({ n: 'targetScope', l: 'Kirim ke', t: 'select', o: [['semua', 'Semua siswa saya'], ['jenjang', 'Jenjang tertentu'], ['path', 'Learning Path tertentu']], def: 'semua' }, pre.targetScope)}
      <div data-w="grade">${H.fieldHtml({ n: 'grade', l: 'Jenjang', t: 'select', o: [['', 'Pilih jenjang'], ...Object.entries(H.GRADES)] }, pre.grade)}</div>
      <div data-w="path" class="sm:col-span-2">${H.fieldHtml({ n: 'learningPathId', l: 'Learning Path', t: 'select', o: [['', 'Pilih jenjang dulu']] }, '')}</div>
      ${H.fieldHtml({ n: 'publish', l: 'Publikasi', t: 'select', o: pubOpts, def: pubOpts[0][0] }, e === 'terjadwal' ? 'terjadwal' : e)}
      <div data-w="when">${H.fieldHtml({ n: 'publishAt', l: 'Waktu terbit', t: 'datetime-local' }, pre.publishAt ? toInput(pre.publishAt) : '')}</div></div>`, async (f) => {
      const title = f.title.trim(), body = f.body.trim(), scope = f.targetScope, pub = f.publish;
      if (!title) return 'Judul wajib diisi.';
      if (pub !== 'draft' && !body) return 'Isi pengumuman wajib diisi sebelum diterbitkan atau dijadwalkan.';
      if (scope !== 'semua' && !f.grade) return 'Pilih jenjang tujuan pengumuman.';
      if (scope === 'path' && !f.learningPathId) return 'Pilih Learning Path tujuan pengumuman.';
      let publishAt = null;
      if (pub === 'terjadwal') {
        const t = Date.parse(f.publishAt);
        if (!f.publishAt || isNaN(t)) return 'Isi waktu terbit untuk pengumuman terjadwal.';
        if (t < Date.now() + 60000) return 'Waktu terbit harus di masa depan.';
        publishAt = new Date(t).toISOString();
      }
      const path = scope === 'path' ? H.catalogPaths(f.grade).find((p) => String(p.id) === String(f.learningPathId)) : null, now = new Date().toISOString();
      const data = { title, body, status: pub, targetScope: scope, grade: scope === 'semua' ? '' : f.grade, learningPathId: scope === 'path' ? f.learningPathId : '', learningPathName: path ? path.name : '',
        publishAt, publishedAt: pub === 'terbit' ? (item && item.publishedAt) || now : null, updatedAt: now };
      await S.ctx.store.save(item ? { ...item, ...data } : { ...data, createdAt: now });
      H.toast(pub === 'terbit' ? 'Pengumuman diterbitkan.' : pub === 'terjadwal' ? 'Pengumuman dijadwalkan.' : 'Draf disimpan.');
      load();
    }, item ? 'Simpan Perubahan' : 'Simpan', true);
    const form = el.firstElementChild, w = (n) => form.querySelector('[data-w=' + n + ']');
    const sync = () => { w('grade').classList.toggle('hidden', form.elements.targetScope.value === 'semua'); w('path').classList.toggle('hidden', form.elements.targetScope.value !== 'path'); w('when').classList.toggle('hidden', form.elements.publish.value !== 'terjadwal'); };
    H.refreshTargetFields(form, 'init', { path: pre.learningPathId, pathName: pre.learningPathName });
    form.elements.grade.addEventListener('change', () => H.refreshTargetFields(form, 'grade'));
    form.elements.targetScope.addEventListener('change', sync); form.elements.publish.addEventListener('change', sync);
    form.elements.body.rows = 6; sync();
  }

  // ---------- event ----------
  function bind(el) {
    el.addEventListener('input', (e) => { if (e.target.dataset.pf === 'q') { S.q = e.target.value; if (S.items) drawList(); } });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pg]'); if (!b) return;
      const a = b.dataset.pg, H = S.ctx.h, item = () => (S.items || []).find((x) => String(x.id) === String(b.dataset.id));
      if (a === 'add') openForm(null);
      else if (a === 'retry') load();
      else if (a === 'chip') { S.f = b.dataset.f; drawChips(); drawList(); }
      else if (a === 'edit') { const x = item(); if (x) openForm(x); }
      else if (a === 'del') {
        const x = item(); if (!x) return;
        if (!(await H.confirm({ title: 'Hapus pengumuman?', message: 'Pengumuman ini akan dihapus dan tidak bisa dikembalikan.', detail: x.title, confirmText: 'Hapus', tone: 'danger' }))) return;
        try { await S.ctx.store.remove(x.id); H.toast('Pengumuman dihapus.'); load(); } catch (ex) { H.toast(ex.message || 'Gagal menghapus.', 'error'); }
      }
      else if (a === 'publish') {
        const x = item(); if (!x) return;
        if (!x.body || !String(x.body).trim()) { H.toast('Isi pengumuman masih kosong. Ubah dulu sebelum diterbitkan.', 'error'); return; }
        if (!(await H.confirm({ title: 'Terbitkan pengumuman?', message: 'Pengumuman akan terlihat oleh: ' + target(x) + '.', detail: x.title, confirmText: 'Terbitkan' }))) return;
        const now = new Date().toISOString();
        try { await S.ctx.store.save({ ...x, status: 'terbit', publishedAt: now, publishAt: null, updatedAt: now }); H.toast('Pengumuman diterbitkan.'); load(); } catch (ex) { H.toast(ex.message || 'Gagal menerbitkan.', 'error'); }
      }
    });
  }

  window.DCPengumuman = { mount };
})();
