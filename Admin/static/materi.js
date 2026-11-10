/* Kelola Materi
   Halaman admin untuk tabel `materials` (daftar materi per jenjang & modul).
   BUKAN editor WYSIWYG: konten kurikulum tetap dikelola di view "Modul & Kurikulum"
   (/api/admin/curriculum). File ini hanya memakai:
   GET/POST /api/admin/materials dan PATCH/DELETE /api/admin/materials/:id. */
(function () {
  'use strict';

  const view = document.getElementById('view-materi');
  if (!view) return;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, r = view) => r.querySelector(s);
  const toast = (m, t) => (typeof window.showToast === 'function' ? window.showToast(m, t) : console.warn(m));
  const INPUT = 'w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
  const LABEL = 'block font-mono font-semibold text-slate-600 dark:text-slate-300 mb-1 uppercase tracking-wider text-[11px]';
  const BTN = 'dc-btn dc-btn-pri';
  const BTN_GHOST = 'dc-btn dc-btn-ghost';
  const GRADES = ['SD', 'SMP', 'SMK'];
  const GRADE_LABEL = { SD: 'SD', SMP: 'SMP', SMK: 'SMA/SMK' };
  const STATUS = { terbit: 'Terbit', draft: 'Draft' };

  // Nama field di tabel `materials`. Kunci PERTAMA dipakai saat mengirim ke server;
  // kunci lain hanya alternatif saat membaca respons. Sesuaikan di sini bila skema backend berbeda.
  const F = {
    id: ['id'],
    judul: ['title', 'judul'],
    grade: ['grade'],
    modul: ['moduleId', 'module_id'],
    status: ['status'],
    urutan: ['lessonIndex', 'lesson_index', 'order'],   // 0-based: 0 = task pertama
    keterangan: ['description', 'keterangan'],
    path: ['path', 'link']
  };
  const key = (k) => F[k][0];
  const get = (item, k) => {
    if (!item) return undefined;
    for (const n of F[k]) if (item[n] !== undefined && item[n] !== null) return item[n];
    return undefined;
  };
  // Urutan di UI mulai dari 1; server memakai 0-based (lessonIndex).
  const urutanUi = (item) => { const n = Number(get(item, 'urutan')); return Number.isFinite(n) ? n + 1 : '-'; };
  const safePath = (p) => typeof p === 'string' && /^\/(?!\/)[^\s]*$/.test(p) && !p.includes('..');

  let items = [];
  let loading = false;
  let loaded = false;
  const filter = { q: '', grade: '', modul: '', status: '' };

  const statusOf = (item) => String(get(item, 'status') || 'terbit').toLowerCase();

  function statusBadge(status) {
    const cls = status === 'terbit'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
      : 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30';
    return `<span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${cls}">${esc(STATUS[status] || status)}</span>`;
  }

  function gradeBadge(grade) {
    return `<span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300 border border-sky-200/70 dark:border-sky-500/30">${esc(GRADE_LABEL[grade] || grade || '-')}</span>`;
  }

  function shell() {
    view.innerHTML = `
      <div class="page-hero flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 text-xs font-mono text-slate-400 dark:text-slate-500 mb-1"><span>Portal Admin</span><span>/</span><span class="text-sky-600 dark:text-sky-400 font-medium">Materi</span></div>
          <h1 class="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2.5">Kelola Materi
            <span id="mtCount" class="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border border-sky-300/60 dark:border-sky-500/30">0</span></h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">Daftar materi per jenjang dan modul. Konten materi (WYSIWYG) tetap diatur di Modul &amp; Kurikulum.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button id="mtAdd" type="button" class="${BTN}"><i class="fa-solid fa-plus text-xs"></i><span>Tambah Materi</span></button>
        </div>
      </div>
      <div id="mtNotice"></div>
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input id="mtQ" type="search" placeholder="Cari judul materi..." class="${INPUT}" aria-label="Cari materi">
        <select id="mtGrade" class="${INPUT}" aria-label="Filter jenjang"></select>
        <select id="mtModul" class="${INPUT}" aria-label="Filter modul"></select>
        <select id="mtStatus" class="${INPUT}" aria-label="Filter status">
          <option value="">Semua status</option>
          ${Object.keys(STATUS).map((s) => `<option value="${s}">${esc(STATUS[s])}</option>`).join('')}
        </select>
      </div>
      <div id="mtList"></div>`;

    $('#mtAdd').addEventListener('click', () => openForm(null));
    $('#mtQ').addEventListener('input', (e) => { filter.q = e.target.value.trim().toLowerCase(); renderList(); });
    $('#mtGrade').addEventListener('change', (e) => {
      filter.grade = e.target.value;
      filter.modul = '';
      renderFilters();
      renderList();
    });
    $('#mtModul').addEventListener('change', (e) => { filter.modul = e.target.value; renderList(); });
    $('#mtStatus').addEventListener('change', (e) => { filter.status = e.target.value; renderList(); });
    $('#mtList').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-edit]');
      if (edit) {
        const item = items.find((x) => String(get(x, 'id')) === edit.dataset.edit);
        if (item) openForm(item);
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        const item = items.find((x) => String(get(x, 'id')) === del.dataset.del);
        if (item) remove(item);
      }
    });
    renderFilters();
  }

  function notice(html, tone) {
    const box = $('#mtNotice');
    if (!box) return;
    if (!html) { box.innerHTML = ''; return; }
    const cls = tone === 'error'
      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30'
      : 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30';
    box.innerHTML = `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 border ${cls}"><i class="fa-solid fa-circle-info mt-0.5"></i><span>${html}</span></div>`;
  }

  // Opsi filter jenjang & modul. Modul diambil dari data, dipersempit oleh jenjang terpilih.
  function renderFilters() {
    const g = $('#mtGrade');
    const m = $('#mtModul');
    if (!g || !m) return;
    g.innerHTML = '<option value="">Semua jenjang</option>' + GRADES.map((x) => `<option value="${x}">${esc(GRADE_LABEL[x])}</option>`).join('');
    g.value = filter.grade;
    const moduls = Array.from(new Set(items
      .filter((x) => !filter.grade || get(x, 'grade') === filter.grade)
      .map((x) => String(get(x, 'modul') ?? ''))
      .filter(Boolean))).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
    m.innerHTML = '<option value="">Semua modul</option>' + moduls.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    m.value = moduls.includes(filter.modul) ? filter.modul : '';
    if (m.value !== filter.modul) filter.modul = m.value;
  }

  function filtered() {
    return items.filter((x) => {
      if (filter.grade && get(x, 'grade') !== filter.grade) return false;
      if (filter.modul && String(get(x, 'modul') ?? '') !== filter.modul) return false;
      if (filter.status && statusOf(x) !== filter.status) return false;
      if (filter.q && !String(get(x, 'judul') || '').toLowerCase().includes(filter.q)) return false;
      return true;
    }).sort((a, b) =>
      String(get(a, 'grade') || '').localeCompare(String(get(b, 'grade') || '')) ||
      String(get(a, 'modul') || '').localeCompare(String(get(b, 'modul') || ''), 'id', { numeric: true }) ||
      (Number(get(a, 'urutan')) || 0) - (Number(get(b, 'urutan')) || 0));
  }

  function linkCell(path) {
    const p = String(path ?? '').trim();
    if (!p) return '<span class="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30" title="Tanpa link, materi tidak tampil di portal murid"><i class="fa-solid fa-triangle-exclamation"></i>Belum ada link</span>';
    return safePath(p)
      ? `<a href="${esc(p)}" target="_blank" rel="noopener noreferrer" title="${esc(p)}" class="block truncate font-mono text-xs text-sky-600 dark:text-sky-400 hover:underline">${esc(p)}</a>`
      : `<span class="block truncate font-mono text-xs text-slate-500" title="${esc(p)}">${esc(p)}</span>`;
  }

  function renderList() {
    const rows = filtered();
    const count = $('#mtCount');
    if (count) count.textContent = rows.length === items.length ? String(items.length) : `${rows.length}/${items.length}`;
    const list = $('#mtList');
    if (!list) return;

    if (loading) {
      list.innerHTML = '<div class="text-center text-sm text-slate-500 dark:text-slate-400 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat materi...</div>';
      return;
    }
    if (!rows.length) {
      const empty = items.length ? 'Tidak ada materi yang cocok dengan filter.' : 'Belum ada materi.';
      list.innerHTML = `<div class="text-center text-sm text-slate-500 dark:text-slate-400 py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <i class="fa-regular fa-folder-open text-2xl mb-2 block"></i>${empty}
        ${items.length ? '' : '<br><span class="text-xs">Klik "Tambah Materi" untuk membuat entri pertama.</span>'}
      </div>`;
      return;
    }

    const TH = 'text-left font-mono font-semibold uppercase tracking-wider text-[11px] text-slate-500 dark:text-slate-400 px-4 py-3';
    list.innerHTML = `<div class="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-card overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b border-slate-200 dark:border-slate-800"><tr>
          <th class="${TH}">Judul</th><th class="${TH}">Jenjang</th><th class="${TH}">Modul</th><th class="${TH}">Link</th><th class="${TH}">Urutan</th><th class="${TH}">Status</th><th class="${TH} text-right">Aksi</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          ${rows.map((item) => {
            const id = get(item, 'id');
            const judul = get(item, 'judul') || '(tanpa judul)';
            const ket = get(item, 'keterangan');
            return `<tr>
              <td class="px-4 py-3 min-w-[14rem]"><div class="font-semibold text-slate-900 dark:text-white">${esc(judul)}</div>${ket ? `<div class="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">${esc(ket)}</div>` : ''}</td>
              <td class="px-4 py-3">${gradeBadge(get(item, 'grade'))}</td>
              <td class="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">${esc(get(item, 'modul') ?? '-')}</td>
              <td class="px-4 py-3 max-w-[16rem]">${linkCell(get(item, 'path'))}</td>
              <td class="px-4 py-3 text-slate-600 dark:text-slate-300">${esc(urutanUi(item))}</td>
              <td class="px-4 py-3">${statusBadge(statusOf(item))}</td>
              <td class="px-4 py-3"><div class="flex justify-end gap-2">
                <button type="button" data-edit="${esc(id)}" class="dc-ib dc-ib-edit" aria-label="Ubah materi ${esc(judul)}"><i class="fa-solid fa-pen"></i></button>
                <button type="button" data-del="${esc(id)}" class="dc-ib dc-ib-danger" aria-label="Hapus materi ${esc(judul)}"><i class="fa-solid fa-trash-can"></i></button>
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;
  }

  async function load(force) {
    if (loading) return;
    if (!force && loaded) return;
    loading = true;
    notice('');
    renderList();
    try {
      const res = await window.DCAdminApi.request('/api/admin/materials');
      items = Array.isArray(res.materials) ? res.materials : (Array.isArray(res.items) ? res.items : []);
      loaded = true;
      const noLink = items.filter((x) => !String(get(x, 'path') ?? '').trim()).length;
      if (noLink) notice(`<b>${noLink} materi belum punya link</b> sehingga tidak tampil di portal murid. Cari tanda "Belum ada link" di tabel lalu isi lewat tombol ubah.`);
    } catch (err) {
      items = [];
      if (err.status === 403) notice('Akun ini tidak punya izin <b>kurikulum.kelola</b> untuk mengelola materi.', 'error');
      else notice(esc(err.message || 'Gagal memuat materi.'), 'error');
    }
    loading = false;
    renderFilters();
    renderList();
  }

  function field(label, html) {
    return `<div><label class="${LABEL}">${label}</label>${html}</div>`;
  }

  // Modul diambil dari GET /api/modules/:grade supaya ID modul selalu valid (hindari 404 MODULE_NOT_FOUND).
  const modCache = {};
  async function loadModules(grade) {
    if (modCache[grade]) return modCache[grade];
    const r = await window.DCAdminApi.request('/api/modules/' + encodeURIComponent(grade));
    const list = (Array.isArray(r.modules) ? r.modules : []).map((m) => String(m.module_id ?? m.moduleId ?? m.id ?? '')).filter(Boolean);
    modCache[grade] = list;
    return list;
  }
  async function fillModul(wrap, grade, current) {
    wrap.innerHTML = field('Modul', `<select name="modul" class="${INPUT}" disabled><option>Memuat modul...</option></select>`);
    let list = null;
    try { list = await loadModules(grade); } catch (_) { list = null; }
    if (!wrap.isConnected) return;
    if (!list || !list.length) {   // cadangan: server tak bisa dihubungi / belum ada modul → ketik manual
      wrap.innerHTML = field('Modul (ID)', `<input name="modul" required maxlength="80" value="${esc(current || '')}" placeholder="Contoh: da1" class="${INPUT}">`);
      return;
    }
    const opts = !current || list.includes(current) ? list : [current, ...list];
    wrap.innerHTML = field('Modul', `<select name="modul" class="${INPUT}">${current ? '' : '<option value="">Pilih modul...</option>'}${opts.map((m) => `<option value="${esc(m)}" ${m === current ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`);
  }

  function openForm(item) {
    const editing = Boolean(item && get(item, 'id') !== undefined);
    const grade = editing ? get(item, 'grade') : (filter.grade || 'SD');
    const status = editing ? statusOf(item) : 'draft';
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50';
    el.innerHTML = `<form class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4" novalidate>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-extrabold text-slate-900 dark:text-white">${editing ? 'Ubah Materi' : 'Tambah Materi'}</h3>
        <button type="button" data-x class="dc-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>
      </div>
      ${field('Judul', `<input name="judul" required maxlength="160" value="${esc(editing ? get(item, 'judul') : '')}" placeholder="Contoh: Mengenal Variabel" class="${INPUT}">`)}
      <div class="grid sm:grid-cols-2 gap-3">
        ${field('Jenjang', `<select name="grade" class="${INPUT}">${GRADES.map((g) => `<option value="${g}" ${g === grade ? 'selected' : ''}>${esc(GRADE_LABEL[g])}</option>`).join('')}</select>`)}
        <div data-modul-wrap></div>
        ${field('Urutan task', `<input name="urutan" type="number" min="1" step="1" value="${esc(editing && Number.isFinite(Number(urutanUi(item))) ? urutanUi(item) : '')}" placeholder="1 = task pertama" class="${INPUT}">`)}
        ${field('Status', `<select name="status" class="${INPUT}">${Object.keys(STATUS).map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${esc(STATUS[s])}</option>`).join('')}</select>`)}
      </div>
      ${field('Link materi (path)', `<input name="path" maxlength="300" value="${esc(editing ? (get(item, 'path') || '') : '')}" placeholder="/SMP/materi/AI/ai1-t1.html" class="${INPUT} font-mono" spellcheck="false"><p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Alamat file materi di portal murid, diawali <code>/</code>. Materi tanpa link tidak tampil di portal.</p>`)}
      ${field('Keterangan', `<textarea name="keterangan" maxlength="500" rows="3" placeholder="Catatan singkat (opsional)..." class="${INPUT}">${esc(editing ? (get(item, 'keterangan') || '') : '')}</textarea>`)}
      <p data-err class="hidden text-xs font-medium text-rose-600 dark:text-rose-400" role="alert"></p>
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" data-x class="${BTN_GHOST}">Batal</button>
        <button type="submit" class="${BTN}"><i class="fa-solid fa-floppy-disk"></i>${editing ? 'Simpan Perubahan' : 'Simpan'}</button>
      </div>
    </form>`;

    const close = () => {
      el.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', close));

    const form = el.firstElementChild;
    const err = $('[data-err]', el);
    const setError = (message) => {
      err.textContent = message;
      err.classList.remove('hidden');
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.classList.add('hidden');
      const fd = new FormData(form);
      const urutanRaw = String(fd.get('urutan') || '').trim();
      const data = {
        [key('judul')]: String(fd.get('judul') || '').trim(),
        [key('grade')]: String(fd.get('grade') || '').trim(),
        [key('modul')]: String(fd.get('modul') || '').trim(),
        [key('status')]: String(fd.get('status') || '').trim(),
        [key('keterangan')]: String(fd.get('keterangan') || '').trim(),
        [key('path')]: String(fd.get('path') || '').trim()
      };
      if (urutanRaw !== '') data[key('urutan')] = Number(urutanRaw) - 1;   // UI 1-based → server 0-based
      if (!data[key('judul')]) return setError('Judul wajib diisi.');
      if (!GRADES.includes(data[key('grade')])) return setError('Pilih jenjang.');
      if (!data[key('modul')]) return setError('Pilih modul terlebih dulu.');
      if (urutanRaw !== '' && (!Number.isInteger(Number(urutanRaw)) || Number(urutanRaw) < 1)) return setError('Urutan task harus bilangan bulat 1 atau lebih.');
      const pth = data[key('path')];
      if (pth && !safePath(pth)) return setError('Link harus diawali / dan tanpa spasi, mis. /SMP/materi/AI/ai1-t1.html');
      if (!pth && data[key('status')] === 'terbit') return setError('Materi berstatus Terbit wajib punya link agar tampil di portal murid.');

      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        if (editing) {
          await window.DCAdminApi.request('/api/admin/materials/' + encodeURIComponent(get(item, 'id')), { method: 'PATCH', body: data });
        } else {
          await window.DCAdminApi.request('/api/admin/materials', { method: 'POST', body: data });
        }
        close();
        toast(editing ? 'Materi diperbarui.' : 'Materi ditambahkan.');
        await load(true);
      } catch (ex) {
        submit.disabled = false;
        setError(ex.message || 'Gagal menyimpan materi.');
      }
    });

    document.body.appendChild(el);
    const wrap = form.querySelector('[data-modul-wrap]');
    fillModul(wrap, grade, editing ? String(get(item, 'modul') ?? '') : filter.modul);
    form.querySelector('[name="grade"]').addEventListener('change', (e) => fillModul(wrap, e.target.value, ''));
    const first = form.querySelector('input,textarea,select');
    if (first) first.focus();
  }

  async function remove(item) {
    const ok = await window.dcConfirm({
      title: 'Hapus materi?',
      message: 'Materi ini akan dihapus dari daftar materi dan tidak tampil lagi di portal siswa.',
      detail: `${get(item, 'grade') || ''} ${get(item, 'modul') || ''} - ${get(item, 'judul') || ''}`.trim(),
      confirmText: 'Hapus',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      await window.DCAdminApi.request('/api/admin/materials/' + encodeURIComponent(get(item, 'id')), { method: 'DELETE' });
      toast('Materi dihapus.');
      await load(true);
    } catch (err) {
      toast(err.message || 'Gagal menghapus materi.', 'error');
    }
  }

  shell();
  window.addEventListener('dc:view', (e) => {
    if (e.detail === 'materi') load(false);
  });
  if (!view.classList.contains('hidden')) load(false);
})();
