/* Badge & Tugas
   Dua halaman admin: kelola Badge (penghargaan siswa) dan Tugas (penugasan per jenjang).
   Memakai endpoint /api/admin/badges dan /api/admin/tasks (GET, POST, PATCH /:id, DELETE /:id).
   Jika server belum punya endpoint itu (404), otomatis memakai data contoh di browser (localStorage)
   dan menampilkan penanda "Mode contoh". Begitu endpoint tersedia, langsung beralih ke server. */
(function () {
  'use strict';
  const vBadge = document.getElementById('view-badge');
  const vTugas = document.getElementById('view-tugas');
  if (!vBadge || !vTugas) return;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, t) => (window.showToast ? window.showToast(m, t) : alert(m));
  const $ = (s, r = document) => r.querySelector(s);

  const INPUT = 'w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
  const LABEL = 'block font-mono font-semibold text-slate-600 dark:text-slate-300 mb-1 uppercase tracking-wider text-[11px]';
  const BTN = 'flex items-center gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-md shadow-sky-600/20 active:scale-95 transition';
  const BTN_GHOST = 'p-2 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition';
  const CARD = 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-card';

  const COLORS = { sky: 'var(--sc-sky)', indigo: 'var(--sc-indigo)', emerald: 'var(--sc-emerald)', amber: 'var(--sc-amber)', rose: 'var(--sc-rose)' };
  const ICONS = ['fa-flag', 'fa-star', 'fa-fire', 'fa-rocket', 'fa-bolt', 'fa-trophy', 'fa-medal', 'fa-crown', 'fa-code', 'fa-bug', 'fa-brain', 'fa-puzzle-piece', 'fa-shield-halved', 'fa-lightbulb', 'fa-heart', 'fa-gem'];
  const GRADES = { SD: 'SD', SMP: 'SMP', SMK: 'SMA/SMK' };
  const TYPES = { kode: 'Kode', proyek: 'Proyek', kuis: 'Kuis' };
  const STATUS = {
    draft: ['Draft', 'bg-slate-100 text-slate-600 border-slate-300/70 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'],
    terbit: ['Terbit', 'bg-emerald-50 text-emerald-700 border-emerald-300/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'],
    ditutup: ['Ditutup', 'bg-rose-50 text-rose-700 border-rose-300/70 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30']
  };

  // ---------- DATA: server dulu, cadangan lokal ----------
  function makeStore(path, key, seed) {
    let useLocal = false, local = null;
    const load = () => { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } };
    const persist = () => { try { localStorage.setItem(key, JSON.stringify(local)); } catch (_) {} };
    const ensure = () => { if (!local) { local = load() || { next: seed().length + 1, items: seed() }; } };
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
            const it = r.item || r; if (r.temporaryPassword) it.temporaryPassword = r.temporaryPassword; return it;
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
  const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const badges = makeStore('/api/admin/badges', 'dc-badges', () => [
    { id: 1, name: 'Langkah Pertama', description: 'Menyelesaikan tugas pertama.', icon: 'fa-flag', color: 'sky', rule: 'tasks', threshold: 1, active: true, awarded: 0 },
    { id: 2, name: 'Si Rajin', description: 'Menyelesaikan 10 tugas.', icon: 'fa-fire', color: 'amber', rule: 'tasks', threshold: 10, active: true, awarded: 0 },
    { id: 3, name: 'Kolektor Poin', description: 'Mengumpulkan 500 poin belajar.', icon: 'fa-star', color: 'indigo', rule: 'points', threshold: 500, active: true, awarded: 0 },
    { id: 4, name: 'Bug Hunter', description: 'Diberikan instruktur untuk penemu bug.', icon: 'fa-bug', color: 'emerald', rule: 'manual', threshold: 0, active: true, awarded: 0 }
  ]);
  const tasks = makeStore('/api/admin/tasks', 'dc-tugas', () => [
    { id: 1, title: 'Percabangan If-Else', description: 'Buat program yang menentukan nilai lulus atau tidak.', grade: 'SMK', type: 'kode', points: 50, due: inDays(7), status: 'terbit', badgeId: 1, submissions: 0 },
    { id: 2, title: 'Halaman Profil dengan HTML & CSS', description: 'Rancang halaman profil pribadi sederhana.', grade: 'SMP', type: 'proyek', points: 80, due: inDays(14), status: 'draft', badgeId: null, submissions: 0 },
    { id: 3, title: 'Susun Blok Perulangan', description: 'Selesaikan 5 level Blockly tentang perulangan.', grade: 'SD', type: 'kuis', points: 30, due: inDays(3), status: 'terbit', badgeId: null, submissions: 0 }
  ]);

  // ---------- MODAL ----------
  function modal(title, bodyHtml, onSubmit) {
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50';
    el.innerHTML = `<form class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4" novalidate>
      <div class="flex items-center justify-between"><h3 class="text-lg font-extrabold text-slate-900 dark:text-white">${esc(title)}</h3>
        <button type="button" data-x class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div>
      ${bodyHtml}
      <p data-err class="hidden text-xs font-medium text-rose-600 dark:text-rose-400" role="alert"></p>
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" data-x class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Batal</button>
        <button type="submit" class="${BTN}"><i class="fa-solid fa-floppy-disk"></i>Simpan</button></div></form>`;
    const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', close));
    const form = el.firstElementChild, err = $('[data-err]', el);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form).entries());
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try { const msg = await onSubmit(f, form); if (msg) { err.textContent = msg; err.classList.remove('hidden'); btn.disabled = false; return; } close(); }
      catch (ex) { err.textContent = ex.message || 'Gagal menyimpan.'; err.classList.remove('hidden'); btn.disabled = false; }
    });
    document.body.appendChild(el);
    const first = form.querySelector('input:not([type=radio]),textarea,select'); if (first) first.focus();
  }
  const field = (label, html) => `<div><label class="${LABEL}">${label}</label>${html}</div>`;
  const hero = (crumb, title, countId, sub, btnAttr, btnLabel) => `
    <div class="page-hero flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-xs font-mono text-slate-400 dark:text-slate-500 mb-1"><span>Portal Admin</span><span>/</span><span class="text-sky-600 dark:text-sky-400 font-medium">${crumb}</span></div>
        <h1 class="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2.5">${title}
          <span id="${countId}" class="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border border-sky-300/60 dark:border-sky-500/30">0</span></h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">${sub}</p>
      </div>
      <button type="button" ${btnAttr} class="${BTN} self-start md:self-auto"><i class="fa-solid fa-plus text-xs"></i><span>${btnLabel}</span></button>
    </div>`;
  const demoNote = (store, path) => store.isLocal() ? `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"><i class="fa-solid fa-flask mt-0.5"></i><span><b>Mode contoh.</b> Server belum punya <code class="font-mono">${path}</code>, jadi data hanya tersimpan di browser ini.</span></div>` : '';
  const radioGroup = (name, items, cur, render) => items.map((k) => `<label class="cursor-pointer"><input type="radio" name="${name}" value="${k}" class="peer sr-only" ${k === cur ? 'checked' : ''}>${render(k)}</label>`).join('');
  const ruleText = (b) => b.rule === 'tasks' ? `Selesai ${b.threshold} tugas` : b.rule === 'points' ? `${b.threshold} poin` : 'Diberikan manual';
  const fmtDate = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return d || '-'; } };

  // ---------- HALAMAN BADGE ----------
  let badgeList = [];
  async function renderBadge() {
    try { badgeList = await badges.list(); } catch (e) { return toast(e.message || 'Gagal memuat badge.', 'error'); }
    const cards = badgeList.map((b) => `
      <div class="${CARD} p-5 flex flex-col gap-3 ${b.active ? '' : 'opacity-60'}">
        <div class="flex items-start gap-4">
          <div class="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-white text-xl shadow-md" style="background:${COLORS[b.color] || COLORS.sky}"><i class="fa-solid ${esc(b.icon)}"></i></div>
          <div class="min-w-0 flex-1">
            <p class="font-bold text-slate-900 dark:text-white truncate">${esc(b.name)}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">${esc(b.description) || 'Tanpa deskripsi'}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${esc(ruleText(b))}</span>
          <span class="px-2 py-0.5 rounded-full border ${b.active ? STATUS.terbit[1] : STATUS.draft[1]}">${b.active ? 'Aktif' : 'Nonaktif'}</span>
        </div>
        <div class="flex justify-end gap-1 mt-auto pt-1 border-t border-slate-100 dark:border-slate-800">
          <button type="button" data-b="edit" data-id="${b.id}" class="${BTN_GHOST}" title="Ubah"><i class="fa-solid fa-pen text-xs"></i></button>
          <button type="button" data-b="del" data-id="${b.id}" class="${BTN_GHOST} hover:!text-rose-600" title="Hapus"><i class="fa-solid fa-trash-can text-xs"></i></button>
        </div>
      </div>`).join('');
    vBadge.innerHTML = hero('Sertifikat &amp; Badges', 'Sertifikat &amp; Badges', 'bdCount', 'Penghargaan yang bisa diraih siswa: otomatis dari tugas atau poin, atau diberikan manual.', 'data-b="new"', 'Badge Baru') +
      demoNote(badges, '/api/admin/badges') +
      (badgeList.length ? `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${cards}</div>` :
        `<div class="${CARD} text-center py-12 text-sm text-slate-500 dark:text-slate-400">Belum ada badge. Klik <b>Badge Baru</b> untuk membuat yang pertama.</div>`);
    $('#bdCount').textContent = badgeList.length + ' Badge';
  }
  function badgeForm(b) {
    b = b || { name: '', description: '', icon: 'fa-star', color: 'sky', rule: 'manual', threshold: 1, active: true };
    modal(b.id ? 'Ubah Badge' : 'Badge Baru', `
      ${field('Nama badge', `<input name="name" maxlength="40" value="${esc(b.name)}" class="${INPUT}" placeholder="Contoh: Si Rajin">`)}
      ${field('Deskripsi', `<textarea name="description" rows="2" maxlength="160" class="${INPUT}" placeholder="Apa yang membuat siswa meraih badge ini?">${esc(b.description)}</textarea>`)}
      ${field('Ikon', `<div class="grid grid-cols-8 gap-1.5">${radioGroup('icon', ICONS, b.icon, (k) => `<span class="flex items-center justify-center h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 peer-checked:bg-sky-600 peer-checked:text-white peer-checked:border-sky-600"><i class="fa-solid ${k} text-sm"></i></span>`)}</div>`)}
      ${field('Warna', `<div class="flex gap-2">${radioGroup('color', Object.keys(COLORS), b.color, (k) => `<span class="block w-9 h-9 rounded-xl peer-checked:ring-2 peer-checked:ring-offset-2 peer-checked:ring-slate-700 dark:peer-checked:ring-white dark:ring-offset-slate-900" style="background:${COLORS[k]}"></span>`)}</div>`)}
      <div class="grid grid-cols-2 gap-3">
        ${field('Cara meraih', `<select name="rule" class="${INPUT}"><option value="manual" ${b.rule === 'manual' ? 'selected' : ''}>Diberikan manual</option><option value="tasks" ${b.rule === 'tasks' ? 'selected' : ''}>Jumlah tugas selesai</option><option value="points" ${b.rule === 'points' ? 'selected' : ''}>Jumlah poin</option></select>`)}
        ${field('Batas (angka)', `<input name="threshold" type="number" min="0" value="${Number(b.threshold) || 0}" class="${INPUT}">`)}
      </div>
      <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" name="active" value="1" ${b.active ? 'checked' : ''} class="rounded"> Badge aktif (bisa diraih siswa)</label>`,
      async (f) => {
        const name = (f.name || '').trim(); if (!name) return 'Nama badge harus diisi.';
        const rule = f.rule || 'manual', threshold = Math.max(0, parseInt(f.threshold, 10) || 0);
        if (rule !== 'manual' && threshold < 1) return 'Batas harus diisi minimal 1.';
        await badges.save({ ...(b.id ? { id: b.id } : {}), name, description: (f.description || '').trim(), icon: f.icon || 'fa-star', color: f.color || 'sky', rule, threshold: rule === 'manual' ? 0 : threshold, active: f.active === '1' });
        toast(b.id ? 'Badge diperbarui.' : 'Badge dibuat.'); renderBadge();
      });
  }
  vBadge.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-b]'); if (!a) return;
    const b = badgeList.find((x) => String(x.id) === a.dataset.id);
    if (a.dataset.b === 'new') return badgeForm();
    if (a.dataset.b === 'edit' && b) return badgeForm(b);
    if (a.dataset.b === 'del' && b) {
      if (!(await window.dcConfirm({ title: 'Hapus badge?', message: 'Badge ini akan hilang dari daftar dan dari siswa yang sudah meraihnya.', detail: b.name, confirmText: 'Hapus', tone: 'danger' }))) return;
      try { await badges.remove(b.id); toast('Badge dihapus.'); renderBadge(); } catch (ex) { toast(ex.message || 'Gagal menghapus badge.', 'error'); }
    }
  });

  // ---------- HALAMAN TUGAS ----------
  let taskList = [];
  const filt = { q: '', grade: '', status: '' };
  function renderTugasRows() {
    const today = new Date().toISOString().slice(0, 10);
    const rows = taskList.filter((t) => (!filt.grade || t.grade === filt.grade) && (!filt.status || t.status === filt.status) &&
      (!filt.q || (t.title + ' ' + t.description).toLowerCase().includes(filt.q.toLowerCase())));
    $('#tgCount').textContent = taskList.length + ' Tugas';
    const GRADE_DOT = { SD: 'bg-emerald-500', SMP: 'bg-sky-500', SMK: 'bg-indigo-500' };
    const STATUS_UI = {
      terbit: ['Terbit', 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30', 'bg-emerald-500'],
      draft: ['Draft', 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', 'bg-slate-400'],
      ditutup: ['Ditutup', 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30', 'bg-rose-500']
    };
    const ACT = 'p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors';
    const longDate = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return d || '-'; } };
    $('#tgBody').innerHTML = rows.length ? rows.map((t) => {
      const bd = badgeList.find((x) => x.id === t.badgeId), st = STATUS_UI[t.status] || STATUS_UI.draft;
      const late = t.status === 'terbit' && t.due && t.due < today;
      return `<tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors group">
        <td class="py-4 px-6">
          <div class="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${esc(t.title)}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">${esc(t.description)}</div>
        </td>
        <td class="py-4 px-4">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 whitespace-nowrap">
            <span class="w-1.5 h-1.5 rounded-full ${GRADE_DOT[t.grade] || 'bg-slate-400'}"></span>
            <span>${esc(GRADES[t.grade] || t.grade)}</span><span class="text-slate-400">•</span><span class="text-slate-500 dark:text-slate-400">${esc(TYPES[t.type] || t.type)}</span>
          </span>
        </td>
        <td class="py-4 px-4 text-xs font-medium ${late ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}">
          <div class="flex items-center gap-1.5 whitespace-nowrap"><i class="fa-regular fa-calendar text-[11px] ${late ? '' : 'text-slate-400'}"></i>${t.due ? longDate(t.due) : '-'}${late ? ' (lewat)' : ''}</div>
        </td>
        <td class="py-4 px-4"><span class="inline-flex items-center font-bold text-xs text-slate-800 dark:text-slate-100">${Number(t.points) || 0}</span></td>
        ${subCell(t)}
        <td class="py-4 px-4">${bd ? `<div class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"><div class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]" style="background:${COLORS[bd.color] || COLORS.sky}"><i class="fa-solid ${esc(bd.icon)}"></i></div>${esc(bd.name)}</div>` : '<span class="text-xs text-slate-300 dark:text-slate-600">—</span>'}</td>
        <td class="py-4 px-4"><span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${st[1]}"><span class="w-1.5 h-1.5 rounded-full ${st[2]}"></span>${st[0]}</span></td>
        <td class="py-4 px-6 text-right">
          <div class="inline-flex items-center gap-1">
            <button type="button" data-t="dup" data-id="${t.id}" class="${ACT}" title="Salin sebagai draft"><i class="fa-regular fa-copy text-sm"></i></button>
            <button type="button" data-t="edit" data-id="${t.id}" class="${ACT}" title="Ubah"><i class="fa-solid fa-pencil text-sm"></i></button>
            <button type="button" data-t="del" data-id="${t.id}" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors" title="Hapus"><i class="fa-regular fa-trash-can text-sm"></i></button>
          </div>
        </td></tr>`;
    }).join('') : `<tr><td colspan="8" class="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">${taskList.length ? 'Tidak ada tugas yang cocok dengan filter.' : 'Belum ada tugas. Klik Tugas Baru untuk membuat.'}</td></tr>`;
  }
  async function renderTugas() {
    try { [taskList, badgeList] = await Promise.all([tasks.list(), badges.list()]); } catch (e) { return toast(e.message || 'Gagal memuat tugas.', 'error'); }
    subCount = await subs.counts(taskList).catch(() => ({}));
    const opt = (o, cur, all) => (all ? `<option value="">${all}</option>` : '') + Object.entries(o).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(Array.isArray(v) ? v[0] : v)}</option>`).join('');
    vTugas.innerHTML = hero('Tugas &amp; Review Kode', 'Tugas &amp; Review Kode', 'tgCount', 'Buat tugas per jenjang, pantau siapa yang sudah mengumpulkan, lihat jawaban siswa, dan beri nilai.', 'data-t="new"', 'Tugas Baru') +
      demoNote(tasks, '/api/admin/tasks') + `
      <div class="${CARD} p-2.5 flex flex-col lg:flex-row gap-2.5">
        <div class="relative flex-1"><span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-xs pointer-events-none"><i class="fa-solid fa-magnifying-glass"></i></span>
          <input id="tgQ" value="${esc(filt.q)}" class="${INPUT} pl-9" placeholder="Cari judul atau deskripsi tugas..."></div>
        <select id="tgGrade" class="${INPUT} lg:w-44">${opt(GRADES, filt.grade, 'Semua jenjang')}</select>
        <select id="tgStatus" class="${INPUT} lg:w-40">${opt(STATUS, filt.status, 'Semua status')}</select></div>
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left border-collapse">
        <thead><tr class="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <th class="py-4 px-6 min-w-[280px]">Tugas &amp; Deskripsi</th><th class="py-4 px-4 min-w-[140px]">Jenjang</th><th class="py-4 px-4 min-w-[130px]">Tenggat</th><th class="py-4 px-4 min-w-[90px]">Poin</th>
          <th class="py-4 px-4 min-w-[180px]">Pengumpulan</th><th class="py-4 px-4 min-w-[170px]">Badge</th><th class="py-4 px-4 min-w-[110px]">Status</th><th class="py-4 px-6 text-right min-w-[120px]">Aksi</th></tr></thead>
        <tbody id="tgBody" class="divide-y divide-slate-100 dark:divide-slate-800 text-sm"></tbody></table></div></div>`;
    renderTugasRows();
  }
  function taskForm(t) {
    t = t || { title: '', description: '', grade: 'SMP', type: 'kode', points: 50, due: inDays(7), status: 'draft', badgeId: null };
    const act = badgeList.filter((b) => b.active || b.id === t.badgeId);
    modal(t.id ? 'Ubah Tugas' : 'Tugas Baru', `
      ${field('Judul tugas', `<input name="title" maxlength="80" value="${esc(t.title)}" class="${INPUT}" placeholder="Contoh: Perulangan For & While">`)}
      ${field('Instruksi', `<textarea name="description" rows="3" maxlength="500" class="${INPUT}" placeholder="Apa yang harus dikerjakan siswa?">${esc(t.description)}</textarea>`)}
      <div class="grid grid-cols-2 gap-3">
        ${field('Jenjang', `<select name="grade" class="${INPUT}">${Object.entries(GRADES).map(([k, v]) => `<option value="${k}" ${k === t.grade ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
        ${field('Jenis', `<select name="type" class="${INPUT}">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === t.type ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
        ${field('Tenggat', `<input name="due" type="date" value="${esc(t.due)}" class="${INPUT}">`)}
        ${field('Poin', `<input name="points" type="number" min="0" max="1000" value="${Number(t.points) || 0}" class="${INPUT}">`)}
        ${field('Badge hadiah', `<select name="badgeId" class="${INPUT}"><option value="">Tanpa badge</option>${act.map((b) => `<option value="${b.id}" ${b.id === t.badgeId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`)}
        ${field('Status', `<select name="status" class="${INPUT}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>`)}
      </div>`,
      async (f) => {
        const title = (f.title || '').trim(); if (!title) return 'Judul tugas harus diisi.';
        if (!f.due) return 'Tenggat harus diisi.';
        await tasks.save({ ...(t.id ? { id: t.id } : { submissions: 0 }), title, description: (f.description || '').trim(), grade: f.grade, type: f.type, due: f.due,
          points: Math.max(0, parseInt(f.points, 10) || 0), badgeId: f.badgeId ? (isNaN(+f.badgeId) ? f.badgeId : +f.badgeId) : null, status: f.status });
        toast(t.id ? 'Tugas diperbarui.' : 'Tugas dibuat.'); renderTugas();
      });
  }
  vTugas.addEventListener('input', (e) => {
    if (e.target.id === 'tgQ') { filt.q = e.target.value; renderTugasRows(); }
  });
  vTugas.addEventListener('change', (e) => {
    if (e.target.id === 'tgGrade') { filt.grade = e.target.value; renderTugasRows(); }
    if (e.target.id === 'tgStatus') { filt.status = e.target.value; renderTugasRows(); }
  });
  vTugas.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-t]'); if (!a) return;
    const t = taskList.find((x) => String(x.id) === a.dataset.id);
    if (a.dataset.t === 'new') return taskForm();
    if (a.dataset.t === 'review' && t) return openReview(t);
    if (a.dataset.t === 'dup' && t) {
      try {
        await tasks.save({ title: t.title + ' (Salinan)', description: t.description, grade: t.grade, type: t.type, due: t.due, points: t.points, badgeId: t.badgeId, status: 'draft', submissions: 0 });
        toast('Tugas disalin sebagai draft.'); renderTugas();
      } catch (ex) { toast(ex.message || 'Gagal menyalin tugas.', 'error'); }
    }
    if (a.dataset.t === 'edit' && t) return taskForm(t);
    if (a.dataset.t === 'del' && t) {
      if (!(await window.dcConfirm({ title: 'Hapus tugas?', message: 'Tugas ini akan dihapus dari daftar tugas siswa.', detail: t.title, confirmText: 'Hapus', tone: 'danger' }))) return;
      try { await tasks.remove(t.id); toast('Tugas dihapus.'); renderTugas(); } catch (ex) { toast(ex.message || 'Gagal menghapus tugas.', 'error'); }
    }
  });

  // ---------- PENGUMPULAN, JAWABAN & PENILAIAN ----------
  // Server: GET /api/admin/tasks/:id/submissions  ->  { items: [{ id, student_id, student_name, status, submitted_at, answer, score, feedback }] }
  //         PATCH /api/admin/submissions/:id      ->  body { score, feedback, status }  (status: dinilai | revisi)
  // Tanpa endpoint itu, dipakai data contoh di browser. Daftar siswa "belum mengumpulkan" diambil dari /api/admin/users.
  const SUB_STATUS = {
    belum: ['Belum mengumpulkan', 'bg-slate-100 text-slate-600 border-slate-300/70 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'],
    dikumpulkan: ['Perlu dinilai', 'bg-sky-50 text-sky-700 border-sky-300/70 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30'],
    revisi: ['Revisi', 'bg-amber-50 text-amber-700 border-amber-300/70 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30'],
    dinilai: ['Sudah dinilai', STATUS.terbit[1]]
  };
  const SUB_ORDER = { dikumpulkan: 0, revisi: 1, dinilai: 2, belum: 3 };
  let subCount = {};

  const subs = (function () {
    const KEY = 'dc-submissions';
    let loc = null, useLocal = false;
    const missing = (e) => e && [0, 404, 405, 501].includes(e.status);
    const req = (p, o) => window.DCAdminApi.request(p, o);
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(loc)); } catch (_) {} };
    const localStudents = () => {
      try {
        const d = JSON.parse(localStorage.getItem('dc-siswa-data'));
        if (d && Array.isArray(d.users)) return d.users.filter((u) => u.status === 'active').map((u) => ({ id: u.id, name: u.full_name || u.username, grades: (u.allowedGrades || []).map(String) }));
      } catch (_) {}
      return ['Alvaro Kenzo', 'Dina Oktavia', 'Fadly Naufal', 'Ayu Lestari', 'Raditya Pratama', 'Bima Saputra', 'Citra Maharani', 'Dimas Prakoso'].map((n, i) => ({ id: 'd' + i, name: n, grades: [['SMK', 'SMP', 'SD'][i % 3]] }));
    };
    function ensure() {
      if (loc) return;
      try { loc = JSON.parse(localStorage.getItem(KEY)); } catch (_) {}
      if (loc) return;
      loc = { next: 1, items: [] };
      const code = 'nilai = int(input("Masukkan nilai: "))\nif nilai >= 75:\n    print("Lulus")\nelse:\n    print("Belum lulus")';
      const mk = (taskId, grade, list) => localStudents().filter((s) => s.grades.includes(grade)).slice(0, list.length).forEach((s, i) => {
        const a = list[i];
        loc.items.push({ id: loc.next++, taskId, studentId: s.id, studentName: s.name, status: a.status, submittedAt: new Date(Date.now() - (i + 1) * 5.4e6).toISOString(),
          answer: a.answer, score: a.score ?? null, feedback: a.feedback || '', gradedAt: a.score != null ? new Date().toISOString() : null });
      });
      mk(1, 'SMK', [{ status: 'dikumpulkan', answer: code }, { status: 'dinilai', answer: code.replace('75', '70'), score: 90, feedback: 'Bagus, logikanya benar. Coba tambahkan validasi input.' }, { status: 'dikumpulkan', answer: code.replace('>=', '>') }]);
      mk(3, 'SD', [{ status: 'dikumpulkan', answer: 'Saya memakai blok "ulangi 4 kali" lalu maju 10 langkah.' }, { status: 'dinilai', answer: 'Blok ulangi 5 kali, di dalamnya ada putar kanan.', score: 80, feedback: 'Hampir tepat, kurang satu langkah.' }]);
      persist();
    }
    const norm = (s) => ({
      id: s.id, studentId: s.student_id ?? s.studentId ?? s.user_id, studentName: s.student_name ?? s.studentName ?? s.full_name ?? s.username ?? 'Siswa',
      status: s.status || 'dikumpulkan', submittedAt: s.submitted_at ?? s.submittedAt ?? null, answer: s.answer ?? s.content ?? '', score: s.score ?? null, feedback: s.feedback ?? ''
    });
    const sort = (rows) => rows.sort((a, b) => (SUB_ORDER[a.status] - SUB_ORDER[b.status]) || String(a.studentName).localeCompare(String(b.studentName)));
    return {
      async list(task) {
        let done = [], roster = [];
        if (!useLocal && !tasks.isLocal()) {
          try { const r = await req('/api/admin/tasks/' + encodeURIComponent(task.id) + '/submissions'); done = (r.items || r.data || []).map(norm); }
          catch (e) { if (!missing(e)) throw e; useLocal = true; }
        } else useLocal = true;
        if (useLocal) { ensure(); done = loc.items.filter((x) => x.taskId === task.id).map(norm); roster = localStudents().filter((s) => s.grades.includes(task.grade)); }
        else { try { const r = await window.DCAdminApi.users({ limit: 200, status: 'active' }); roster = (r.users || []).filter((u) => (u.allowedGrades || []).map(String).includes(task.grade)).map((u) => ({ id: u.id, name: u.full_name || u.username })); } catch (_) {} }
        const have = new Set(done.map((d) => String(d.studentId)));
        const rows = done.concat(roster.filter((s) => !have.has(String(s.id))).map((s) => ({ id: null, studentId: s.id, studentName: s.name, status: 'belum', submittedAt: null, answer: '', score: null, feedback: '' })));
        return sort(rows);
      },
      async counts(list) {
        const out = {};
        if (tasks.isLocal() || useLocal) {
          ensure();
          list.forEach((t) => { const m = loc.items.filter((x) => x.taskId === t.id); out[t.id] = { submitted: m.length, pending: m.filter((x) => x.status === 'dikumpulkan').length }; });
        } else list.forEach((t) => { out[t.id] = { submitted: Number(t.submitted ?? t.submissions ?? 0), pending: Number(t.pending ?? 0) }; });
        return out;
      },
      async grade(id, patch) {
        if (!useLocal && !tasks.isLocal()) {
          try { return await req('/api/admin/submissions/' + encodeURIComponent(id), { method: 'PATCH', body: patch }); } catch (e) { if (!missing(e)) throw e; useLocal = true; }
        }
        ensure(); const i = loc.items.findIndex((x) => x.id === id); if (i < 0) throw new Error('Pengumpulan tidak ditemukan.');
        loc.items[i] = { ...loc.items[i], ...patch, gradedAt: new Date().toISOString() }; persist(); return loc.items[i];
      }
    };
  })();

  function subCell(t) {
    const c = subCount[t.id] || { submitted: 0, pending: 0 };
    return `<td class="py-4 px-4"><button type="button" data-t="review" data-id="${t.id}" class="group/s flex items-center gap-2 whitespace-nowrap rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Pantau &amp; nilai pengumpulan">
      ${c.submitted ? `<span class="text-xs font-semibold text-slate-700 dark:text-slate-200">${c.submitted} terkumpul</span>` : '<span class="text-xs text-slate-400">0 terkumpul</span>'}
      ${c.pending ? `<span class="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-600 border border-blue-200/60 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30">${c.pending} perlu dinilai</span>` : ''}
      <i class="fa-solid fa-chevron-right text-[9px] text-slate-300 group-hover/s:text-sky-500 transition-colors"></i></button></td>`;
  }
  const fmtTime = (iso) => { try { return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { return '-'; } };

  function openReview(task) {
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50';
    el.innerHTML = '<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col"></div>';
    const panel = el.firstElementChild;
    let rows = [], tab = 'semua', cur = null, changed = false;
    const close = () => { el.remove(); document.removeEventListener('keydown', onKey); if (changed) renderTugas(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    const head = (extra) => `<div class="flex items-start justify-between gap-3 p-5 border-b border-slate-200 dark:border-slate-800">
      <div class="min-w-0">${extra || ''}<h3 class="text-lg font-extrabold text-slate-900 dark:text-white truncate">${esc(task.title)}</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${esc(GRADES[task.grade] || task.grade)} · ${esc(TYPES[task.type] || task.type)} · ${Number(task.points) || 0} poin · tenggat ${task.due ? fmtDate(task.due) : '-'}</p></div>
      <button type="button" data-r="close" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div>`;

    function drawList() {
      const n = (s) => rows.filter((r) => r.status === s).length;
      const graded = rows.filter((r) => r.score != null);
      const avg = graded.length ? Math.round(graded.reduce((a, r) => a + Number(r.score), 0) / graded.length) : null;
      const chip = (label, val, cls) => `<div class="rounded-xl px-3 py-2 border ${cls}"><p class="text-[10px] font-mono uppercase tracking-wider opacity-80">${label}</p><p class="text-lg font-extrabold leading-tight">${val}</p></div>`;
      const tabs = [['semua', 'Semua', rows.length], ['belum', 'Belum', n('belum')], ['dikumpulkan', 'Perlu dinilai', n('dikumpulkan')], ['revisi', 'Revisi', n('revisi')], ['dinilai', 'Dinilai', n('dinilai')]];
      const shown = rows.filter((r) => tab === 'semua' || r.status === tab);
      panel.innerHTML = head() + `<div class="p-5 overflow-y-auto space-y-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          ${chip('Terkumpul', rows.length - n('belum') + '/' + rows.length, SUB_STATUS.dikumpulkan[1])}
          ${chip('Belum', n('belum'), SUB_STATUS.belum[1])}
          ${chip('Dinilai', n('dinilai'), SUB_STATUS.dinilai[1])}
          ${chip('Rata-rata nilai', avg == null ? '-' : avg, SUB_STATUS.revisi[1])}</div>
        <div class="flex gap-1.5 overflow-x-auto">${tabs.map(([k, l, c]) => `<button type="button" data-r="tab" data-v="${k}" class="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${k === tab ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}">${l} <span class="opacity-70 font-mono">${c}</span></button>`).join('')}</div>
        <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-sm text-left">
          <thead class="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50"><tr><th class="px-4 py-2.5">Siswa</th><th class="px-4 py-2.5">Status</th><th class="px-4 py-2.5">Dikumpulkan</th><th class="px-4 py-2.5">Nilai</th><th class="px-4 py-2.5"></th></tr></thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">${shown.length ? shown.map((r) => { const st = SUB_STATUS[r.status] || SUB_STATUS.dikumpulkan; return `<tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
            <td class="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">${esc(r.studentName)}</td>
            <td class="px-4 py-2.5"><span class="text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${st[1]}">${st[0]}</span></td>
            <td class="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">${r.submittedAt ? fmtTime(r.submittedAt) : '-'}</td>
            <td class="px-4 py-2.5 font-mono text-xs">${r.score == null ? '-' : esc(r.score)}</td>
            <td class="px-4 py-2.5 text-right">${r.status === 'belum' ? '' : `<button type="button" data-r="open" data-i="${rows.indexOf(r)}" class="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap">${r.status === 'dinilai' ? 'Lihat' : 'Lihat &amp; nilai'}</button>`}</td></tr>`; }).join('')
            : '<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Tidak ada data di tab ini.</td></tr>'}</tbody></table></div></div>
        ${rows.length ? '' : '<p class="text-xs text-slate-500 dark:text-slate-400">Belum ada siswa di jenjang ini atau belum ada pengumpulan.</p>'}</div>`;
    }
    function drawDetail() {
      const r = cur, st = SUB_STATUS[r.status] || SUB_STATUS.dikumpulkan;
      const earned = (v) => Math.round((Number(v) || 0) / 100 * (Number(task.points) || 0));
      panel.innerHTML = head(`<button type="button" data-r="back" class="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline mb-1"><i class="fa-solid fa-arrow-left mr-1"></i>Daftar siswa</button>`) + `<div class="p-5 overflow-y-auto space-y-4">
        <div class="flex flex-wrap items-center gap-2"><p class="font-bold text-slate-900 dark:text-white">${esc(r.studentName)}</p>
          <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full border ${st[1]}">${st[0]}</span>
          <span class="text-xs text-slate-500 dark:text-slate-400">Dikumpulkan ${r.submittedAt ? fmtTime(r.submittedAt) : '-'}</span></div>
        <div><label class="${LABEL}">Jawaban siswa</label>
          ${r.answer ? `<pre class="whitespace-pre-wrap break-words text-xs leading-relaxed rounded-xl p-4 max-h-72 overflow-auto ${task.type === 'kode' ? 'font-mono bg-slate-900 text-slate-100' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'}">${esc(r.answer)}</pre>` : '<p class="text-sm text-slate-500">Jawaban kosong.</p>'}</div>
        <div class="grid sm:grid-cols-[8rem_1fr] gap-3">
          <div><label class="${LABEL}" for="rvScore">Nilai (0-100)</label><input id="rvScore" type="number" min="0" max="100" value="${r.score ?? ''}" class="${INPUT}">
            <p id="rvPts" class="text-[11px] font-mono text-slate-400 mt-1">${r.score != null ? earned(r.score) + ' / ' + (Number(task.points) || 0) + ' poin' : ''}</p></div>
          <div><label class="${LABEL}" for="rvFb">Komentar untuk siswa</label><textarea id="rvFb" rows="3" maxlength="600" class="${INPUT}" placeholder="Tulis masukan, apa yang sudah bagus dan apa yang perlu diperbaiki...">${esc(r.feedback)}</textarea></div></div>
        <p id="rvErr" class="hidden text-xs font-medium text-rose-600 dark:text-rose-400" role="alert"></p>
        <div class="flex flex-wrap justify-end gap-2">
          <button type="button" data-r="save" data-s="revisi" class="px-4 py-2 rounded-xl text-xs font-semibold border border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10"><i class="fa-solid fa-rotate-left mr-1.5"></i>Minta revisi</button>
          <button type="button" data-r="save" data-s="dinilai" class="${BTN}"><i class="fa-solid fa-check"></i>Simpan nilai</button></div></div>`;
    }
    async function load() {
      panel.innerHTML = head() + '<p class="p-8 text-center text-sm text-slate-500">Memuat pengumpulan...</p>';
      try { rows = await subs.list(task); drawList(); } catch (e) { panel.innerHTML = head() + `<p class="p-8 text-center text-sm text-rose-600">${esc(e.message || 'Gagal memuat pengumpulan.')}</p>`; }
    }
    panel.addEventListener('input', (e) => {
      if (e.target.id !== 'rvScore') return; const p = panel.querySelector('#rvPts'); const v = e.target.value;
      p.textContent = v === '' ? '' : Math.round(Number(v) / 100 * (Number(task.points) || 0)) + ' / ' + (Number(task.points) || 0) + ' poin';
    });
    panel.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-r]'); if (!a) return;
      const k = a.dataset.r;
      if (k === 'close') return close();
      if (k === 'tab') { tab = a.dataset.v; return drawList(); }
      if (k === 'back') { cur = null; return drawList(); }
      if (k === 'open') { cur = rows[Number(a.dataset.i)]; return drawDetail(); }
      if (k === 'save') {
        const err = panel.querySelector('#rvErr'), status = a.dataset.s;
        const scoreRaw = panel.querySelector('#rvScore').value, feedback = panel.querySelector('#rvFb').value.trim();
        const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
        let score = scoreRaw === '' ? null : Number(scoreRaw);
        if (status === 'dinilai' && (score == null || isNaN(score) || score < 0 || score > 100)) return fail('Nilai harus diisi antara 0 sampai 100.');
        if (status === 'revisi' && !feedback) return fail('Komentar harus diisi supaya siswa tahu apa yang perlu direvisi.');
        a.disabled = true;
        try { await subs.grade(cur.id, { score, feedback, status }); changed = true; toast(status === 'dinilai' ? 'Nilai disimpan.' : 'Siswa diminta merevisi.'); cur = null; await load(); }
        catch (ex) { a.disabled = false; fail(ex.message || 'Gagal menyimpan nilai.'); }
      }
    });
    document.body.appendChild(el);
    load();
  }

  // ---------- muat saat halaman dibuka ----------
  window.addEventListener('dc:view', (e) => {
    if (e.detail === 'badge') renderBadge();
    if (e.detail === 'tugas') renderTugas();
  });
  // helper dipakai halaman Pengaturan & Akses (pengaturan-akses.js)
  window.DCUI = { esc, toast, INPUT, LABEL, BTN, BTN_GHOST, CARD, modal, field, makeStore };
})();
