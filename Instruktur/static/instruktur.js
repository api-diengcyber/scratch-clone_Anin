/* Dashboard Instruktur — Ruang KKA
   Menu: Ringkasan, Tugas Tambahan, Ujian Kelulusan (di sisi siswa tampil sebagai Projek Akhir), Jadwal Zoom Mentoring.
   Endpoint (belum ada di backend → otomatis memakai data lokal browser + penanda "Mode contoh"):
     GET/POST /api/instruktur/tugas | /ujian | /jadwal     PATCH/DELETE /api/instruktur/<nama>/:id
     GET /api/instruktur/me  -> { role, name }                                                    */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const INPUT = 'w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
  const LABEL = 'block font-mono font-semibold text-slate-600 dark:text-slate-300 mb-1 uppercase tracking-wider text-[11px]';
  const CARD = 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-card';
  const GRADES = { SD: 'SD', SMP: 'SMP', SMK: 'SMA/SMK' };
  const STATUS = {
    draft: ['Draft', 'bg-slate-100 text-slate-600 border-slate-300/70 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'],
    terbit: ['Terbit', 'bg-emerald-50 text-emerald-700 border-emerald-300/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'],
    ditutup: ['Ditutup', 'bg-rose-50 text-rose-700 border-rose-300/70 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30']
  };
  const pill = (t, cls) => `<span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${cls || 'bg-sky-50 text-sky-700 border-sky-200/70 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30'}">${esc(t)}</span>`;
  const statusPill = (s) => { const x = STATUS[s] || STATUS.draft; return pill(x[0], x[1]); };
  const fmtDate = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return d || '-'; } };
  const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  let me = { name: '' };

  // ---------- tema, sidebar, toast ----------
  const savedTheme = localStorage.getItem('dc-theme');
  document.documentElement.classList.toggle('dark', savedTheme === 'dark');
  document.documentElement.classList.toggle('light', savedTheme !== 'dark');
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-theme-toggle]')) return;
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
    try { localStorage.setItem('dc-theme', dark ? 'dark' : 'light'); } catch (_) {}
  });
  $('#mobileMenuBtn').addEventListener('click', () => document.body.classList.toggle('sb-open'));
  $('#sbBackdrop').addEventListener('click', () => document.body.classList.remove('sb-open'));

  let toastTimer;
  function toast(message, type) {
    type = type || (/gagal|error/i.test(message) ? 'error' : 'success');
    const el = $('#toast'), b = $('#toastBadge');
    $('#toastMessage').textContent = message;
    b.className = 'w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs ' + (type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600');
    b.innerHTML = '<i class="fa-solid ' + (type === 'error' ? 'fa-circle-xmark' : 'fa-check') + '"></i>';
    el.classList.remove('translate-y-24', 'opacity-0');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('translate-y-24', 'opacity-0'), 3000);
  }
  window.showToast = toast;

  // ---------- data: server dulu, cadangan lokal ----------
  function makeStore(path, key, seed) {
    let useLocal = false, local = null;
    const load = () => { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } };
    const persist = () => { try { localStorage.setItem(key, JSON.stringify(local)); } catch (_) {} };
    const ensure = () => { if (!local) local = load() || { next: seed().length + 1, items: seed() }; };
    const missing = (e) => e && [0, 404, 405, 501].includes(e.status);
    const req = (p, o) => window.DCAdminApi.request(p, o);
    return {
      isLocal: () => useLocal,
      async list() {
        if (!useLocal) { try { const r = await req(path); return r.items || r.data || []; } catch (e) { if (!missing(e)) throw e; useLocal = true; } }
        ensure(); return local.items.map((x) => ({ ...x }));
      },
      async save(item) {
        if (!useLocal) {
          try {
            const r = item.id ? await req(path + '/' + encodeURIComponent(item.id), { method: 'PATCH', body: item }) : await req(path, { method: 'POST', body: item });
            return r.item || r;
          } catch (e) { if (!missing(e)) throw e; useLocal = true; }
        }
        ensure();
        if (item.id) { const i = local.items.findIndex((x) => x.id === item.id); local.items[i] = { ...local.items[i], ...item }; }
        else { item = { ...item, id: local.next++ }; local.items.push(item); }
        persist(); return item;
      },
      async remove(id) {
        if (!useLocal) { try { await req(path + '/' + encodeURIComponent(id), { method: 'DELETE' }); return; } catch (e) { if (!missing(e)) throw e; useLocal = true; } }
        ensure(); local.items = local.items.filter((x) => x.id !== id); persist();
      }
    };
  }
  const stores = {
    tugas: makeStore('/api/instruktur/tugas', 'dci-tugas', () => [
      { id: 1, title: 'Tantangan Perulangan', description: 'Buat program yang mencetak pola bintang memakai for.', grade: 'SMK', type: 'kode', points: 40, due: inDays(7), status: 'terbit' }
    ]),
    ujian: makeStore('/api/instruktur/ujian', 'dci-ujian', () => [
      { id: 1, title: 'Projek Akhir: Game 2D', description: 'Kumpulkan game 2D buatan sendiri. Dinilai dari kreativitas, fungsi, dan kerapian kode.', grade: 'SMP', format: 'proyek', kkm: 75, durasi: '', buka: inDays(0), tutup: inDays(30), status: 'terbit', hasil: [] }
    ]),
    jadwal: makeStore('/api/instruktur/jadwal', 'dci-jadwal', () => [])
  };

  // ---------- modal & form ----------
  function modal(title, bodyHtml, onSubmit, submitLabel, wide) {
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50';
    el.innerHTML = `<form class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto p-6 space-y-4" novalidate>
      <div class="flex items-center justify-between"><h3 class="text-lg font-extrabold text-slate-900 dark:text-white">${esc(title)}</h3>
        <button type="button" data-x class="dc-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div>
      ${bodyHtml}
      <p data-err class="hidden text-xs font-medium text-rose-600 dark:text-rose-400" role="alert"></p>
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" data-x class="dc-btn dc-btn-ghost">Batal</button>
        <button type="submit" class="dc-btn dc-btn-pri"><i class="fa-solid fa-floppy-disk"></i>${esc(submitLabel || 'Simpan')}</button></div></form>`;
    const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', close));
    const form = el.firstElementChild, err = $('[data-err]', el);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        const msg = await onSubmit(Object.fromEntries(new FormData(form).entries()), form);
        if (msg) { err.textContent = msg; err.classList.remove('hidden'); btn.disabled = false; return; }
        close();
      } catch (ex) { err.textContent = ex.message || 'Gagal menyimpan.'; err.classList.remove('hidden'); btn.disabled = false; }
    });
    document.body.appendChild(el);
    const first = form.querySelector('input,textarea,select'); if (first) first.focus();
    return el;
  }
  function fieldHtml(f, val) {
    const v = val ?? f.def ?? '';
    let input;
    if (f.t === 'select') input = `<select name="${f.n}" class="${INPUT}">${f.o.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else if (f.t === 'textarea') input = `<textarea name="${f.n}" rows="3" maxlength="${f.max || 600}" placeholder="${esc(f.ph || '')}" class="${INPUT}">${esc(v)}</textarea>`;
    else input = `<input name="${f.n}" type="${f.t || 'text'}" value="${esc(v)}" placeholder="${esc(f.ph || '')}" maxlength="${f.max || 160}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.maxv !== undefined ? `max="${f.maxv}"` : ''} class="${INPUT}">`;
    return `<div class="${f.full ? 'sm:col-span-2' : ''}"><label class="${LABEL}">${f.l}</label>${input}</div>`;
  }

  // ---------- halaman CRUD generik ----------
  function crud(cfg) {
    const view = $('#view-' + cfg.view);
    const store = stores[cfg.view];
    let items = [], loaded = false;
    const shown = () => (cfg.visible ? cfg.visible(items) : items);

    function draw() {
      const list = shown();
      const note = store.isLocal() ? `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"><i class="fa-solid fa-flask mt-0.5"></i><span><b>Mode contoh:</b> endpoint <code>/api/instruktur/${cfg.view}</code> belum tersedia, data disimpan di browser ini saja dan belum tampil ke siswa.</span></div>` : '';
      view.innerHTML = `
        <div class="page-hero flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 text-xs font-mono text-slate-400 dark:text-slate-500 mb-1"><span>Portal Instruktur</span><span>/</span><span class="text-sky-600 dark:text-sky-400 font-medium">${esc(cfg.crumb)}</span></div>
            <h1 class="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2.5">${esc(cfg.title)}
              <span class="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border border-sky-300/60 dark:border-sky-500/30">${list.length}</span></h1>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">${esc(cfg.sub)}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 self-start md:self-auto">${cfg.extra ? cfg.extra() : ''}
            <button type="button" data-add class="dc-btn dc-btn-pri"><i class="fa-solid fa-plus text-xs"></i><span>${esc(cfg.addLabel)}</span></button></div>
        </div>
        ${note}
        <div class="grid gap-3">${loaded ? (list.length ? list.map((it) => `<article class="${CARD} p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-4">${cfg.card(it)}
          <div class="flex md:flex-col gap-2 shrink-0">${cfg.actions ? cfg.actions(it) : ''}
            <button type="button" data-edit="${esc(it.id)}" class="dc-ib dc-ib-edit" aria-label="Ubah"><i class="fa-solid fa-pen"></i></button>
            <button type="button" data-del="${esc(it.id)}" class="dc-ib dc-ib-danger" aria-label="Hapus"><i class="fa-solid fa-trash-can"></i></button></div></article>`).join('')
          : `<div class="text-center text-sm text-slate-500 dark:text-slate-400 py-12 ${CARD}"><i class="${cfg.icon} text-2xl mb-2 block"></i>${esc(cfg.empty)}</div>`)
          : '<div class="text-center text-sm text-slate-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat...</div>'}</div>`;
      if (cfg.afterDraw) cfg.afterDraw(view, draw);
    }
    async function load() {
      try { items = await store.list(); } catch (e) { items = []; toast(e.message || 'Gagal memuat data.', 'error'); }
      loaded = true; draw();
    }
    function openForm(item) {
      const pre = item ? (cfg.pre ? cfg.pre(item) : item) : (cfg.blank ? cfg.blank() : {});
      modal((item ? 'Ubah ' : 'Tambah ') + cfg.noun, `<div class="grid sm:grid-cols-2 gap-3">${cfg.fields.map((f) => fieldHtml(f, pre[f.n])).join('')}</div>`, async (f) => {
        const msg = cfg.validate(f); if (msg) return msg;
        const data = cfg.norm(f);
        await store.save(item ? { ...item, ...data } : data);
        toast(item ? cfg.noun + ' diperbarui.' : cfg.noun + ' ditambahkan.');
        await load();
      }, item ? 'Simpan Perubahan' : 'Simpan', true);
    }
    view.addEventListener('click', async (e) => {
      if (e.target.closest('[data-add]')) return openForm(null);
      const ed = e.target.closest('[data-edit]'), dl = e.target.closest('[data-del]');
      const find = (id) => items.find((x) => String(x.id) === String(id));
      if (ed) return openForm(find(ed.dataset.edit));
      if (dl) {
        const it = find(dl.dataset.del); if (!it) return;
        if (!(await window.dcConfirm({ title: 'Hapus ' + cfg.noun.toLowerCase() + '?', message: cfg.delMsg, detail: it.title || it.judul, confirmText: 'Hapus', tone: 'danger' }))) return;
        try { await store.remove(it.id); toast(cfg.noun + ' dihapus.'); await load(); } catch (ex) { toast(ex.message || 'Gagal menghapus.', 'error'); }
        return;
      }
      if (cfg.onClick) cfg.onClick(e, { find, reload: load });
    });
    window.addEventListener('dc:view', (ev) => { if (ev.detail === cfg.view && !loaded) load(); });
    return { load, items: () => items };
  }

  const gradeOpts = Object.entries(GRADES);
  const statusOpts = [['draft', 'Draft'], ['terbit', 'Terbit'], ['ditutup', 'Ditutup']];
  const num = (v) => (v === '' || v == null ? '' : Number(v));

  // ---------- Tugas Tambahan ----------
  const TYPES = { kode: 'Kode', blok: 'Block Coding', kuis: 'Kuis', proyek: 'Proyek' };
  crud({
    view: 'tugas', crumb: 'Tugas Tambahan', title: 'Tugas Tambahan', noun: 'Tugas', addLabel: 'Tambah Tugas', icon: 'fa-regular fa-clipboard',
    sub: 'Beri siswa latihan ekstra di luar materi utama. Tugas terbit akan tampil di halaman siswa.', empty: 'Belum ada tugas tambahan.',
    delMsg: 'Tugas ini akan hilang dari daftar tugas siswa.',
    fields: [
      { n: 'title', l: 'Judul', full: true, ph: 'Contoh: Tantangan Perulangan' },
      { n: 'grade', l: 'Jenjang', t: 'select', o: gradeOpts, def: 'SMP' },
      { n: 'type', l: 'Jenis', t: 'select', o: Object.entries(TYPES), def: 'kode' },
      { n: 'points', l: 'Poin', t: 'number', min: 0, maxv: 1000, def: 30 },
      { n: 'due', l: 'Tenggat', t: 'date' },
      { n: 'status', l: 'Status', t: 'select', o: statusOpts, def: 'draft' },
      { n: 'description', l: 'Deskripsi / Instruksi', t: 'textarea', full: true, ph: 'Jelaskan apa yang harus dikerjakan siswa...' }
    ],
    validate: (f) => (!f.title.trim() ? 'Judul wajib diisi.' : ''),
    norm: (f) => ({ title: f.title.trim(), grade: f.grade, type: f.type, points: Number(f.points) || 0, due: f.due, status: f.status, description: f.description.trim() }),
    card: (t) => `<div class="flex-none w-12 h-12 rounded-xl grid place-items-center bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-300"><i class="fa-solid fa-list-check"></i></div>
      <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><h3 class="font-bold text-slate-900 dark:text-white">${esc(t.title)}</h3>${pill(GRADES[t.grade] || t.grade)}${pill(TYPES[t.type] || t.type, 'bg-slate-100 text-slate-600 border-slate-300/70 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700')}${statusPill(t.status)}</div>
      ${t.description ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">${esc(t.description)}</p>` : ''}
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-1"><i class="fa-solid fa-star mr-1"></i>${esc(t.points)} poin${t.due ? ` &middot; <i class="fa-regular fa-calendar mr-1"></i>Tenggat ${esc(fmtDate(t.due))}` : ''}</p></div>`
  });

  // ---------- Ujian Kelulusan ----------
  const FORMAT = { proyek: 'Projek Akhir', tes: 'Ujian Tes' };
  const hasilStat = (u) => { const h = u.hasil || []; const lulus = h.filter((x) => Number(x.nilai) >= Number(u.kkm)).length; return { total: h.length, lulus }; };
  crud({
    view: 'ujian', crumb: 'Ujian Kelulusan', title: 'Ujian Kelulusan', noun: 'Ujian', addLabel: 'Buat Ujian', icon: 'fa-solid fa-graduation-cap',
    sub: 'Tes penentu lulus atau tidaknya siswa. Format "Projek Akhir" tampil sebagai Projek Akhir di halaman siswa.', empty: 'Belum ada ujian kelulusan.',
    delMsg: 'Ujian beserta nilai peserta akan dihapus.',
    fields: [
      { n: 'title', l: 'Judul Ujian', full: true, ph: 'Contoh: Projek Akhir: Game 2D' },
      { n: 'grade', l: 'Jenjang', t: 'select', o: gradeOpts, def: 'SMP' },
      { n: 'format', l: 'Format', t: 'select', o: [['proyek', 'Projek Akhir (dikumpulkan siswa)'], ['tes', 'Ujian Tes (soal/praktik)']], def: 'proyek' },
      { n: 'kkm', l: 'Nilai Minimal Lulus (KKM)', t: 'number', min: 0, maxv: 100, def: 75 },
      { n: 'durasi', l: 'Durasi (menit, opsional)', t: 'number', min: 0, maxv: 600 },
      { n: 'buka', l: 'Dibuka', t: 'date' },
      { n: 'tutup', l: 'Ditutup', t: 'date' },
      { n: 'status', l: 'Status', t: 'select', o: statusOpts, def: 'draft' },
      { n: 'description', l: 'Instruksi & Kriteria Penilaian', t: 'textarea', full: true, max: 1000, ph: 'Apa yang harus dikerjakan, dan bagaimana dinilai...' }
    ],
    validate: (f) => !f.title.trim() ? 'Judul wajib diisi.' : (f.kkm === '' || +f.kkm < 0 || +f.kkm > 100) ? 'KKM harus 0–100.' : (f.buka && f.tutup && f.tutup < f.buka) ? 'Tanggal tutup harus setelah tanggal buka.' : '',
    norm: (f) => ({ title: f.title.trim(), grade: f.grade, format: f.format, kkm: Number(f.kkm), durasi: num(f.durasi), buka: f.buka, tutup: f.tutup, status: f.status, description: f.description.trim() }),
    card: (u) => { const s = hasilStat(u); return `<div class="flex-none w-12 h-12 rounded-xl grid place-items-center bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300"><i class="fa-solid ${u.format === 'tes' ? 'fa-file-pen' : 'fa-flag-checkered'}"></i></div>
      <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><h3 class="font-bold text-slate-900 dark:text-white">${esc(u.title)}</h3>${pill(GRADES[u.grade] || u.grade)}${pill(FORMAT[u.format] || u.format, 'bg-violet-50 text-violet-700 border-violet-200/70 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30')}${statusPill(u.status)}</div>
      ${u.description ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">${esc(u.description)}</p>` : ''}
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-1"><i class="fa-solid fa-bullseye mr-1"></i>KKM ${esc(u.kkm)}${u.durasi ? ` &middot; ${esc(u.durasi)} menit` : ''}${u.buka ? ` &middot; ${esc(fmtDate(u.buka))}` : ''}${u.tutup ? ` – ${esc(fmtDate(u.tutup))}` : ''} &middot; <b>${s.lulus}</b> lulus dari ${s.total} peserta</p></div>`; },
    actions: (u) => `<button type="button" data-hasil="${esc(u.id)}" class="dc-ib dc-ib-view" aria-label="Penilaian ${esc(u.title)}" title="Penilaian"><i class="fa-solid fa-clipboard-check"></i></button>`,
    onClick: (e, ctx) => {
      const b = e.target.closest('[data-hasil]'); if (!b) return;
      const u = ctx.find(b.dataset.hasil); if (u) openHasil(u, ctx.reload);
    }
  });

  function openHasil(u, reload) {
    const row = (h = {}) => `<tr data-row><td class="py-1.5 pr-2"><input name="nama" value="${esc(h.nama || '')}" placeholder="Nama siswa" maxlength="80" class="${INPUT}"></td>
      <td class="py-1.5 pr-2 w-24"><input name="nilai" type="number" min="0" max="100" value="${esc(h.nilai ?? '')}" placeholder="0-100" class="${INPUT}"></td>
      <td class="py-1.5 pr-2 w-28 text-center" data-st></td>
      <td class="py-1.5 w-9"><button type="button" data-rm class="dc-ib dc-ib-danger" aria-label="Hapus peserta"><i class="fa-solid fa-xmark"></i></button></td></tr>`;
    const el = modal('Penilaian: ' + u.title, `<p class="text-xs text-slate-500 dark:text-slate-400">Siswa dinyatakan <b>Lulus</b> bila nilai ≥ KKM (${esc(u.kkm)}).</p>
      <table class="w-full text-sm"><thead><tr class="text-left font-mono text-[11px] uppercase text-slate-500"><th>Siswa</th><th>Nilai</th><th class="text-center">Hasil</th><th></th></tr></thead>
      <tbody id="hsBody">${(u.hasil && u.hasil.length ? u.hasil : [{}]).map(row).join('')}</tbody></table>
      <button type="button" data-addrow class="dc-btn dc-btn-ghost dc-btn-sm"><i class="fa-solid fa-plus text-xs"></i>Tambah Peserta</button>`,
    async (_f, form) => {
      const hasil = [...form.querySelectorAll('[data-row]')].map((r) => ({ nama: r.querySelector('[name=nama]').value.trim(), nilai: r.querySelector('[name=nilai]').value })).filter((h) => h.nama && h.nilai !== '').map((h) => ({ nama: h.nama, nilai: Math.min(100, Math.max(0, Number(h.nilai))) }));
      await stores.ujian.save({ ...u, hasil });
      toast('Nilai disimpan.'); await reload();
    }, 'Simpan Nilai', true);
    const body = $('#hsBody', el);
    const refresh = () => body.querySelectorAll('[data-row]').forEach((r) => {
      const v = r.querySelector('[name=nilai]').value;
      r.querySelector('[data-st]').innerHTML = v === '' ? '<span class="text-slate-400 text-xs">–</span>' : Number(v) >= Number(u.kkm) ? pill('Lulus', STATUS.terbit[1]) : pill('Belum lulus', STATUS.ditutup[1]);
    });
    el.addEventListener('input', refresh);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-addrow]')) { body.insertAdjacentHTML('beforeend', row()); refresh(); }
      const rm = e.target.closest('[data-rm]'); if (rm) { rm.closest('[data-row]').remove(); }
    });
    refresh();
  }

  // ---------- Jadwal Zoom Mentoring ----------
  const now = new Date();
  const jw = { month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` };
  crud({
    view: 'jadwal', crumb: 'Jadwal Zoom', title: 'Jadwal Zoom Mentoring', noun: 'Jadwal', addLabel: 'Tambah Jadwal', icon: 'fa-regular fa-calendar-xmark',
    sub: 'Atur kelas Zoom yang muncul di halaman Jadwal Saya milik siswa.', empty: 'Belum ada jadwal di bulan ini.',
    delMsg: 'Jadwal ini akan hilang dari halaman Jadwal Saya siswa.',
    visible: (list) => list.filter((x) => String(x.tanggal || '').startsWith(jw.month)).sort((a, b) => (a.tanggal + a.mulai).localeCompare(b.tanggal + b.mulai)),
    extra: () => `<input id="jwMonth" type="month" value="${esc(jw.month)}" class="${INPUT} w-auto" aria-label="Bulan jadwal">`,
    afterDraw: (view, draw) => { const m = $('#jwMonth', view); if (m) m.addEventListener('change', (e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { jw.month = e.target.value; draw(); } }); },
    blank: () => ({ jenis: 'Live Mentoring', mentor: me.name }),
    pre: (it) => ({ ...it, grade: (it.grades && it.grades[0]) || '' }),
    fields: [
      { n: 'judul', l: 'Judul', ph: 'Live Mentoring: Game Pertamaku' },
      { n: 'jenis', l: 'Jenis', ph: 'Live Mentoring' },
      { n: 'tanggal', l: 'Tanggal', t: 'date' },
      { n: 'mulai', l: 'Mulai', t: 'time' },
      { n: 'selesai', l: 'Selesai', t: 'time' },
      { n: 'grade', l: 'Jenjang', t: 'select', o: [['', 'Semua jenjang'], ...gradeOpts] },
      { n: 'mentor', l: 'Mentor', ph: 'Kak Mentor' },
      { n: 'level', l: 'Level / Kelas', ph: 'Scratch Level 1' },
      { n: 'zoomUrl', l: 'Link Zoom (https)', t: 'url', ph: 'https://zoom.us/j/...', max: 500, full: true },
      { n: 'meetingId', l: 'Meeting ID', ph: '123 4567 8901' },
      { n: 'passcode', l: 'Passcode', ph: 'belajar' },
      { n: 'keterangan', l: 'Keterangan', t: 'textarea', full: true, max: 500, ph: 'Persiapan atau catatan untuk siswa...' }
    ],
    validate: (f) => !f.judul.trim() ? 'Judul wajib diisi.' : !f.tanggal ? 'Tanggal wajib diisi.' : (!f.mulai || !f.selesai) ? 'Jam mulai dan selesai wajib diisi.' : f.selesai <= f.mulai ? 'Jam selesai harus lebih lambat dari jam mulai.' : (f.zoomUrl && !/^https:\/\//i.test(f.zoomUrl)) ? 'Link Zoom harus memakai https://.' : '',
    norm: (f) => ({ judul: f.judul.trim(), jenis: f.jenis.trim() || 'Live Mentoring', tanggal: f.tanggal, mulai: f.mulai, selesai: f.selesai, level: f.level.trim(), mentor: f.mentor.trim(), zoomUrl: f.zoomUrl.trim(), meetingId: f.meetingId.trim(), passcode: f.passcode.trim(), keterangan: f.keterangan.trim(), grades: f.grade ? [f.grade] : [] }),
    card: (j) => { const d = new Date(j.tanggal + 'T00:00:00'); return `<div class="flex-none w-16 text-center rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200/70 dark:border-sky-500/25 py-2">
      <div class="text-[10px] font-mono font-bold uppercase text-sky-600 dark:text-sky-300">${esc(d.toLocaleDateString('id-ID', { month: 'short' }))}</div>
      <div class="text-2xl font-extrabold leading-tight text-slate-900 dark:text-white">${d.getDate()}</div>
      <div class="text-[10px] text-slate-500 dark:text-slate-400">${esc(d.toLocaleDateString('id-ID', { weekday: 'short' }))}</div></div>
      <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><h3 class="font-bold text-slate-900 dark:text-white">${esc(j.judul)}</h3>${pill((j.grades && j.grades.length) ? j.grades.map((g) => GRADES[g] || g).join(', ') : 'Semua jenjang')}</div>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-1"><i class="fa-regular fa-clock mr-1"></i>${esc(j.mulai)}–${esc(j.selesai)} WIB${j.mentor ? ` &middot; <i class="fa-solid fa-user-tie mr-1"></i>${esc(j.mentor)}` : ''}${j.jenis ? ` &middot; ${esc(j.jenis)}` : ''}</p>
      ${j.keterangan ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">${esc(j.keterangan)}</p>` : ''}
      <div class="mt-2">${/^https:\/\//i.test(j.zoomUrl || '') ? `<a href="${esc(j.zoomUrl)}" target="_blank" rel="noopener noreferrer" class="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"><i class="fa-solid fa-video mr-1"></i>Link Zoom</a>` : '<span class="text-xs text-slate-400">Tanpa link Zoom</span>'}</div></div>`; }
  });

  // ---------- Ringkasan ----------
  async function drawDashboard() {
    const v = $('#view-dashboard');
    const [t, u, j] = await Promise.all(['tugas', 'ujian', 'jadwal'].map((k) => stores[k].list().catch(() => [])));
    const today = inDays(0);
    const up = j.filter((x) => x.tanggal >= today).sort((a, b) => (a.tanggal + a.mulai).localeCompare(b.tanggal + b.mulai));
    const lulus = u.reduce((n, x) => n + hasilStat(x).lulus, 0), peserta = u.reduce((n, x) => n + hasilStat(x).total, 0);
    const kpi = (label, icon, tone, val, trend, note, go) => `<article class="dc-kpi-card cursor-pointer" data-view="${go}"><div class="dc-kpi-top"><span class="dc-kpi-label">${label}</span><span class="dc-live-indicator"><span></span></span></div>
      <div class="dc-kpi-body"><span class="dc-kpi-icon ${tone}"><i class="fa-solid ${icon}"></i></span><div class="min-w-0"><div class="dc-kpi-value">${val}</div><span class="dc-kpi-trend">${trend}</span></div></div><p class="dc-kpi-note">${note}</p></article>`;
    const first = (me.name || 'Instruktur').split(' ')[0];
    v.innerHTML = `<section class="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div><h1 class="dc-page-title">Selamat datang kembali, <span>${esc(first)}</span>!</h1>
        <p class="dc-page-subtitle">Kelola tugas tambahan, ujian kelulusan, dan jadwal Zoom mentoring Ruang KKA.</p></div>
        <div class="flex flex-wrap items-center gap-2.5">
          <button type="button" data-view="tugas" class="dc-btn dc-btn-sec"><i class="fa-solid fa-list-check"></i><span>Tugas</span></button>
          <button type="button" data-view="jadwal" class="dc-btn dc-btn-pri"><i class="fa-solid fa-video"></i><span>Jadwal Zoom</span></button></div></section>
      <section aria-label="Ringkasan statistik"><div class="dc-kpi-grid">
        ${kpi('Tugas tambahan', 'fa-list-check', 'tone-jade', t.filter((x) => x.status === 'terbit').length, t.length + ' total', t.filter((x) => x.status === 'draft').length + ' draft', 'tugas')}
        ${kpi('Ujian kelulusan', 'fa-graduation-cap', 'tone-teal', u.filter((x) => x.status === 'terbit').length, u.length + ' total', 'Ujian yang sedang terbit', 'ujian')}
        ${kpi('Jadwal Zoom', 'fa-video', 'tone-lime', up.length, 'mendatang', up[0] ? 'Berikutnya ' + fmtDate(up[0].tanggal) : 'Belum ada jadwal', 'jadwal')}
        ${kpi('Siswa lulus', 'fa-circle-check', 'tone-amber', lulus, peserta + ' peserta', 'Berdasarkan nilai ujian', 'ujian')}</div></section>
      <section class="dc-panel"><div class="dc-panel-header"><div><h2 class="font-bold text-slate-900 dark:text-white">Jadwal Zoom terdekat</h2><p class="text-xs text-slate-500 dark:text-slate-400">Kelas mentoring yang akan datang</p></div></div>
        <div class="px-6 pb-5 pt-1">${up.length ? up.slice(0, 5).map((x) => `<div class="flex items-center gap-3 py-2.5 border-t first:border-0 border-slate-100 dark:border-slate-800 text-sm"><i class="fa-regular fa-calendar text-sky-500"></i><span class="font-semibold text-slate-800 dark:text-slate-100 flex-1 min-w-0 truncate">${esc(x.judul)}</span><span class="text-xs text-slate-500 shrink-0">${esc(fmtDate(x.tanggal))} &middot; ${esc(x.mulai)}</span></div>`).join('') : '<p class="text-sm text-slate-500 dark:text-slate-400 py-2">Belum ada jadwal mendatang.</p>'}</div></section>`;
  }

  // ---------- navigasi ----------
  const VIEWS = ['dashboard', 'tugas', 'ujian', 'jadwal', 'rekap'];
  const ON = ['is-active', 'text-sky-700', 'dark:text-sky-300', 'bg-sky-50', 'dark:bg-sky-500/10', 'font-semibold'];
  const OFF = ['text-slate-600', 'dark:text-slate-400', 'font-medium'];
  function showView(name) {
    if (!VIEWS.includes(name)) name = 'dashboard';
    VIEWS.forEach((n) => $('#view-' + n).classList.toggle('hidden', n !== name));
    document.querySelectorAll('aside [data-view]').forEach((a) => {
      const on = a.dataset.view === name;
      a.classList.remove(...(on ? OFF : ON)); a.classList.add(...(on ? ON : OFF));
    });
    document.body.classList.remove('sb-open');
    if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
    if (name === 'dashboard') drawDashboard();
    if (name === 'rekap' && window.DCRekap) window.DCRekap.instruktur($('#view-rekap'));
    window.dispatchEvent(new CustomEvent('dc:view', { detail: name }));
  }
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-view]'); if (a) { e.preventDefault(); showView(a.dataset.view); } });
  window.addEventListener('hashchange', () => showView(location.hash.slice(1)));

  // pencarian: menyaring kartu di halaman yang sedang tampil
  $('#globalSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const cur = VIEWS.map((n) => $('#view-' + n)).find((el) => !el.classList.contains('hidden'));
    if (cur) cur.querySelectorAll('article.' + CARD.split(' ')[0]).forEach((a) => a.classList.toggle('hidden', !!q && !a.textContent.toLowerCase().includes(q)));
  });
  // sidebar: ciutkan jadi rail ikon, tutup kartu promo
  const setCollapsed = (c) => { document.body.classList.toggle('sb-collapsed', c); $('#sbToggle').setAttribute('aria-expanded', String(!c)); try { localStorage.setItem('dc-sb-collapsed', c ? '1' : '0'); } catch (_) {} };
  $('#sbToggle').addEventListener('click', () => setCollapsed(!document.body.classList.contains('sb-collapsed')));
  if (localStorage.getItem('dc-sb-collapsed') === '1' && window.innerWidth >= 768) document.body.classList.add('sb-collapsed');
  $('#promoClose').addEventListener('click', () => $('#sidebarPromo').remove());

  $('#btnLogout').addEventListener('click', async () => {
    if (await window.dcConfirm({ title: 'Keluar dari akun?', message: 'Kamu akan dibawa ke halaman login.', confirmText: 'Keluar', tone: 'warning' })) window.DCAdminApi.logout();
  });

  // ---------- mulai: cek sesi & peran ----------
  (async function init() {
    let token = ''; try { token = localStorage.getItem('authToken') || ''; } catch (_) {}
    if (!token) { location.replace('/index.html'); return; }
    try {
      const r = await window.DCAdminApi.request('/api/instruktur/me');
      if (r.role && !['instruktur', 'admin'].includes(r.role)) { toast('Akun ini bukan instruktur. Mengalihkan...'); setTimeout(() => location.replace('/dashboard/dashboard.html'), 1200); return; }
      me = { name: r.name || (r.user && (r.user.full_name || r.user.name)) || '' };
    } catch (_) { /* backend belum siap: lanjut dengan nama dari sesi lokal */ }
    if (!me.name) { try { me.name = localStorage.getItem('username') || ''; } catch (_) {} }
    const parts = (me.name || 'Instruktur').trim().split(/\s+/);
    $('#sidebarName').textContent = me.name || 'Instruktur';
    const ini = ((parts[0] || 'I')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
    $('#sidebarAvatar').textContent = ini; $('#topAvatar').textContent = ini;
    showView(location.hash.slice(1) || 'dashboard');
  })();
})();
