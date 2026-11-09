/* Jadwal Mentoring
   Halaman admin untuk membuat, mengubah, dan menghapus jadwal Zoom yang
   tampil di portal murid (GET /api/jadwal). Memakai endpoint:
   GET/POST /api/admin/jadwal dan PATCH/DELETE /api/admin/jadwal/:id. */
(function () {
  'use strict';

  const view = document.getElementById('view-jadwal');
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

  const now = new Date();
  let month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let items = [];
  let loading = false;
  let loadedMonth = null;

  function monthLabel(key) {
    const [year, m] = String(key || '').split('-').map(Number);
    if (!year || !m) return key || '-';
    return new Date(year, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  }

  function dateParts(tanggal) {
    const d = new Date(String(tanggal) + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return { day: '-', month: '-', weekday: '' };
    return {
      day: d.getDate(),
      month: d.toLocaleDateString('id-ID', { month: 'short' }),
      weekday: d.toLocaleDateString('id-ID', { weekday: 'short' })
    };
  }

  function gradeBadges(grades) {
    const list = Array.isArray(grades) ? grades : [];
    if (!list.length) {
      return '<span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">Semua jenjang</span>';
    }
    return list.map((g) => `<span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300 border border-sky-200/70 dark:border-sky-500/30">${esc(GRADE_LABEL[g] || g)}</span>`).join(' ');
  }

  function shell() {
    view.innerHTML = `
      <div class="page-hero flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 text-xs font-mono text-slate-400 dark:text-slate-500 mb-1"><span>Portal Admin</span><span>/</span><span class="text-sky-600 dark:text-sky-400 font-medium">Jadwal</span></div>
          <h1 class="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2.5">Jadwal Mentoring
            <span id="jwCount" class="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border border-sky-300/60 dark:border-sky-500/30">0</span></h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">Atur kelas Zoom yang muncul di halaman Jadwal Saya murid.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <input id="jwMonth" type="month" value="${esc(month)}" class="${INPUT} w-auto" aria-label="Bulan jadwal">
          <button id="jwAdd" type="button" class="${BTN}"><i class="fa-solid fa-plus text-xs"></i><span>Tambah Jadwal</span></button>
        </div>
      </div>
      <div id="jwNotice"></div>
      <div id="jwList" class="grid gap-3"></div>`;

    $('#jwMonth').addEventListener('change', (e) => {
      const value = String(e.target.value || '');
      if (!/^\d{4}-\d{2}$/.test(value)) return;
      month = value;
      load(true);
    });
    $('#jwAdd').addEventListener('click', () => openForm(null));
    $('#jwList').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-edit]');
      if (edit) {
        const item = items.find((x) => Number(x.id) === Number(edit.dataset.edit));
        if (item) openForm(item);
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        const item = items.find((x) => Number(x.id) === Number(del.dataset.del));
        if (item) remove(item);
      }
    });
  }

  function notice(html, tone) {
    const box = $('#jwNotice');
    if (!box) return;
    if (!html) { box.innerHTML = ''; return; }
    const cls = tone === 'error'
      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30'
      : 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30';
    box.innerHTML = `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 border ${cls}"><i class="fa-solid fa-circle-info mt-0.5"></i><span>${html}</span></div>`;
  }

  function renderList() {
    const count = $('#jwCount');
    if (count) count.textContent = String(items.length);
    const list = $('#jwList');
    if (!list) return;

    if (loading) {
      list.innerHTML = `<div class="text-center text-sm text-slate-500 dark:text-slate-400 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat jadwal...</div>`;
      return;
    }
    if (!items.length) {
      list.innerHTML = `<div class="text-center text-sm text-slate-500 dark:text-slate-400 py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <i class="fa-regular fa-calendar-xmark text-2xl mb-2 block"></i>
        Belum ada jadwal di ${esc(monthLabel(month))}.<br><span class="text-xs">Klik "Tambah Jadwal" untuk membuat kelas Zoom.</span>
      </div>`;
      return;
    }

    list.innerHTML = items.map((item) => {
      const d = dateParts(item.tanggal);
      const zoom = item.zoomUrl
        ? `<a href="${esc(item.zoomUrl)}" target="_blank" rel="noopener noreferrer" class="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"><i class="fa-solid fa-video mr-1"></i>Link Zoom</a>`
        : '<span class="text-xs text-slate-400">Tanpa link Zoom</span>';
      return `<article class="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-card p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-4">
        <div class="flex-none w-16 text-center rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200/70 dark:border-sky-500/25 py-2">
          <div class="text-[10px] font-mono font-bold uppercase text-sky-600 dark:text-sky-300">${esc(d.month)}</div>
          <div class="text-2xl font-extrabold leading-tight text-slate-900 dark:text-white">${esc(d.day)}</div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400">${esc(d.weekday)}</div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-bold text-slate-900 dark:text-white">${esc(item.judul)}</h3>
            ${gradeBadges(item.grades)}
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            <i class="fa-regular fa-clock mr-1"></i>${esc(item.mulai)}–${esc(item.selesai)} WIB
            ${item.mentor ? ` &middot; <i class="fa-solid fa-user-tie mr-1"></i>${esc(item.mentor)}` : ''}
            ${item.jenis ? ` &middot; ${esc(item.jenis)}` : ''}
          </p>
          ${item.keterangan ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">${esc(item.keterangan)}</p>` : ''}
          <div class="mt-2">${zoom}</div>
        </div>
        <div class="flex md:flex-col gap-2 shrink-0">
          <button type="button" data-edit="${esc(item.id)}" class="dc-ib dc-ib-edit" aria-label="Ubah jadwal ${esc(item.judul)}"><i class="fa-solid fa-pen"></i></button>
          <button type="button" data-del="${esc(item.id)}" class="dc-ib dc-ib-danger" aria-label="Hapus jadwal ${esc(item.judul)}"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </article>`;
    }).join('');
  }

  async function load(force) {
    if (loading) return;
    if (!force && loadedMonth === month) return;
    loading = true;
    notice('');
    renderList();
    try {
      const res = await window.DCAdminApi.request('/api/admin/jadwal?bulan=' + encodeURIComponent(month));
      items = Array.isArray(res.items) ? res.items : [];
      loadedMonth = month;
      loading = false;
      renderList();
    } catch (err) {
      loading = false;
      items = [];
      renderList();
      if (err.status === 403) notice('Akun ini tidak punya izin <b>kurikulum.kelola</b> untuk mengelola jadwal.', 'error');
      else notice(esc(err.message || 'Gagal memuat jadwal.'), 'error');
    }
  }

  function field(label, html) {
    return `<div><label class="${LABEL}">${label}</label>${html}</div>`;
  }

  function openForm(item) {
    const editing = Boolean(item && item.id);
    const grades = editing && Array.isArray(item.grades) ? item.grades : [];
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50';
    el.innerHTML = `<form class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4" novalidate>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-extrabold text-slate-900 dark:text-white">${editing ? 'Ubah Jadwal' : 'Tambah Jadwal'}</h3>
        <button type="button" data-x class="dc-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="grid sm:grid-cols-2 gap-3">
        ${field('Judul', `<input name="judul" required maxlength="120" value="${esc(item ? item.judul : '')}" placeholder="Contoh: Live Mentoring: Game Pertamaku" class="${INPUT}">`)}
        ${field('Jenis', `<input name="jenis" maxlength="60" value="${esc(item ? item.jenis : 'Live Mentoring')}" placeholder="Live Mentoring" class="${INPUT}">`)}
        ${field('Tanggal', `<input name="tanggal" type="date" required value="${esc(item ? item.tanggal : '')}" class="${INPUT}">`)}
        <div class="grid grid-cols-2 gap-3">
          ${field('Mulai', `<input name="mulai" type="time" required value="${esc(item ? item.mulai : '')}" class="${INPUT}">`)}
          ${field('Selesai', `<input name="selesai" type="time" required value="${esc(item ? item.selesai : '')}" class="${INPUT}">`)}
        </div>
        ${field('Level / Kelas', `<input name="level" maxlength="80" value="${esc(item ? item.level : '')}" placeholder="Scratch Level 1" class="${INPUT}">`)}
        ${field('Mentor', `<input name="mentor" maxlength="80" value="${esc(item ? item.mentor : '')}" placeholder="Kak Mentor" class="${INPUT}">`)}
        ${field('Link Zoom (https)', `<input name="zoomUrl" type="url" maxlength="500" value="${esc(item ? item.zoomUrl : '')}" placeholder="https://zoom.us/j/..." class="${INPUT}">`)}
        ${field('Meeting ID', `<input name="meetingId" maxlength="80" value="${esc(item ? item.meetingId : '')}" placeholder="123 4567 8901" class="${INPUT}">`)}
        ${field('Passcode', `<input name="passcode" maxlength="80" value="${esc(item ? item.passcode : '')}" placeholder="belajar" class="${INPUT}">`)}
      </div>
      ${field('Jenjang', `<div class="flex flex-wrap gap-3 mt-1">
        ${GRADES.map((g) => `<label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" name="grades" value="${g}" ${grades.includes(g) ? 'checked' : ''} class="rounded border-slate-300 text-sky-600 focus:ring-sky-500">${esc(GRADE_LABEL[g])}</label>`).join('')}
      </div><p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Kosongkan semua centang agar jadwal berlaku untuk semua jenjang.</p>`)}
      ${field('Keterangan', `<textarea name="keterangan" maxlength="500" rows="3" placeholder="Persiapan atau catatan untuk murid..." class="${INPUT}">${esc(item ? item.keterangan : '')}</textarea>`)}
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
      const data = {
        judul: String(fd.get('judul') || '').trim(),
        jenis: String(fd.get('jenis') || '').trim() || 'Live Mentoring',
        tanggal: String(fd.get('tanggal') || '').trim(),
        mulai: String(fd.get('mulai') || '').trim(),
        selesai: String(fd.get('selesai') || '').trim(),
        level: String(fd.get('level') || '').trim(),
        mentor: String(fd.get('mentor') || '').trim(),
        zoomUrl: String(fd.get('zoomUrl') || '').trim(),
        meetingId: String(fd.get('meetingId') || '').trim(),
        passcode: String(fd.get('passcode') || '').trim(),
        keterangan: String(fd.get('keterangan') || '').trim(),
        grades: Array.from(form.querySelectorAll('input[name="grades"]:checked')).map((x) => x.value)
      };
      if (!data.judul) return setError('Judul wajib diisi.');
      if (!data.tanggal) return setError('Tanggal wajib diisi.');
      if (!data.mulai || !data.selesai) return setError('Jam mulai dan selesai wajib diisi.');
      if (data.selesai <= data.mulai) return setError('Jam selesai harus lebih lambat dari jam mulai.');
      if (data.zoomUrl && !/^https:\/\//i.test(data.zoomUrl)) return setError('Link Zoom harus memakai https://.');

      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        if (editing) {
          await window.DCAdminApi.request('/api/admin/jadwal/' + encodeURIComponent(item.id), { method: 'PATCH', body: data });
        } else {
          await window.DCAdminApi.request('/api/admin/jadwal', { method: 'POST', body: data });
        }
        close();
        toast(editing ? 'Jadwal diperbarui.' : 'Jadwal ditambahkan.');
        await load(true);
      } catch (ex) {
        submit.disabled = false;
        setError(ex.message || 'Gagal menyimpan jadwal.');
      }
    });

    document.body.appendChild(el);
    const first = form.querySelector('input,textarea,select');
    if (first) first.focus();
  }

  async function remove(item) {
    const ok = await window.dcConfirm({
      title: 'Hapus jadwal?',
      message: 'Jadwal ini akan hilang dari halaman Jadwal Saya murid.',
      detail: `${item.tanggal} ${item.mulai} - ${item.judul}`,
      confirmText: 'Hapus',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      await window.DCAdminApi.request('/api/admin/jadwal/' + encodeURIComponent(item.id), { method: 'DELETE' });
      toast('Jadwal dihapus.');
      await load(true);
    } catch (err) {
      toast(err.message || 'Gagal menghapus jadwal.', 'error');
    }
  }

  shell();
  window.addEventListener('dc:view', (e) => {
    if (e.detail === 'jadwal') load(false);
  });
  if (!view.classList.contains('hidden')) load(false);
})();
