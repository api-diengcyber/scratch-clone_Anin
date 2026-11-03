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
  const toast = (m, t) => (window.showToast ? window.showToast(m, t) : console.warn(m));
  const $ = (s, r = document) => r.querySelector(s);

  const INPUT = 'w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
  const LABEL = 'block font-mono font-semibold text-slate-600 dark:text-slate-300 mb-1 uppercase tracking-wider text-[11px]';
  const BTN = 'dc-btn dc-btn-pri';
  const BTN_GHOST = 'dc-ib dc-ib-edit';
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
  function modal(title, bodyHtml, onSubmit, submitLabel) {
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50';
    el.innerHTML = `<form class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4" novalidate>
      <div class="flex items-center justify-between"><h3 class="text-lg font-extrabold text-slate-900 dark:text-white">${esc(title)}</h3>
        <button type="button" data-x class="dc-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div>
      ${bodyHtml}
      <p data-err class="hidden text-xs font-medium text-rose-600 dark:text-rose-400" role="alert"></p>
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" data-x class="dc-btn dc-btn-ghost">Batal</button>
        <button type="submit" class="${BTN}"><i class="fa-solid fa-floppy-disk"></i>${esc(submitLabel || 'Simpan')}</button></div></form>`;
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
    return el;
  }
  const field = (label, html) => `<div><label class="${LABEL}">${label}</label>${html}</div>`;
  const hero = (crumb, title, countId, sub, btnAttr, btnLabel, extraBtns) => `
    <div class="page-hero flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-xs font-mono text-slate-400 dark:text-slate-500 mb-1"><span>Portal Admin</span><span>/</span><span class="text-sky-600 dark:text-sky-400 font-medium">${crumb}</span></div>
        <h1 class="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2.5">${title}
          <span id="${countId}" class="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border border-sky-300/60 dark:border-sky-500/30">0</span></h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">${sub}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2 self-start md:self-auto">${extraBtns || ''}${btnAttr ? `<button type="button" ${btnAttr} class="${BTN}"><i class="fa-solid fa-plus text-xs"></i><span>${btnLabel}</span></button>` : ''}</div>
    </div>`;
  const demoNote = (store, path) => store.isLocal() ? `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"><i class="fa-solid fa-flask mt-0.5"></i><span><b>Mode contoh.</b> Server belum punya <code class="font-mono">${path}</code>, jadi data hanya tersimpan di browser ini.</span></div>` : '';
  const radioGroup = (name, items, cur, render) => items.map((k) => `<label class="cursor-pointer"><input type="radio" name="${name}" value="${k}" class="peer sr-only" ${k === cur ? 'checked' : ''}>${render(k)}</label>`).join('');
  const ruleText = (b) => b.rule === 'tasks' ? `Selesai ${b.threshold} tugas` : b.rule === 'points' ? `${b.threshold} poin` : 'Diberikan manual';
  const fmtDate = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return d || '-'; } };

  // ---------- HALAMAN SERTIFIKAT & BADGES ----------
  // Tiga tab: Lencana Jalur (sama dengan yang dilihat siswa, dibaca dari server),
  // Sertifikat (cetak untuk siswa yang sudah menyelesaikan satu jalur), dan Badge Kustom (buatan admin).
  let badgeList = [];
  let bdTab = 'lencana';                       // lencana | sertifikat | badge
  let lencanaList = [], lencanaErr = '';
  let certKey = '', certStudents = [], certErr = '', certLoading = false, orgSettings = null;
  const apiGet = (p) => window.DCAdminApi.request(p);
  const SIGN_KEY = 'dc-cert-signer';
  const getSigner = () => {
    const base = { name: '', title: 'Kepala Program' };
    try { return Object.assign(base, JSON.parse(localStorage.getItem(SIGN_KEY)) || {}); } catch (_) { return base; }
  };
  const setSigner = (s) => { try { localStorage.setItem(SIGN_KEY, JSON.stringify(s)); } catch (_) {} };
  const BD_TABS = [['lencana', 'Lencana Jalur', 'fa-medal'], ['sertifikat', 'Sertifikat', 'fa-certificate'], ['badge', 'Badge Kustom', 'fa-award']];
  const GRADE_KEYS = ['SD', 'SMP', 'SMK'];
  const CHIP = 'px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
  const longDateTime = (v) => {
    if (!v) return '-';
    const d = new Date(String(v).includes('T') ? v : String(v).replace(' ', 'T') + 'Z');
    return isNaN(d) ? '-' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const emptyCard = (msg, cls) => `<div class="${CARD} text-center py-12 px-6 text-sm ${cls || 'text-slate-500 dark:text-slate-400'}">${msg}</div>`;

  const tabBar = () => `<div class="${CARD} p-2 flex flex-wrap gap-1.5">${BD_TABS.map(([k, label, ic]) =>
    `<button type="button" data-b="tab" data-tab="${k}" class="dc-pill-tab ${bdTab === k ? 'is-active' : ''} px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2"><i class="fa-solid ${ic}"></i>${label}</button>`).join('')}</div>`;

  function lencanaPanel() {
    if (lencanaErr) return emptyCard(esc(lencanaErr), 'text-rose-600 dark:text-rose-400');
    if (!lencanaList.length) return emptyCard('Belum ada lencana jalur belajar.');
    const info = `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30"><i class="fa-solid fa-circle-info mt-0.5"></i><span>Daftar ini sama persis dengan lencana yang dilihat siswa. Lencana terbuka kalau <b>semua task</b> di satu jalur selesai <b>dan</b> Project Akhir / Capstone selesai. Nama lencana diatur di data jalur belajar siswa.</span></div>`;
    const groups = GRADE_KEYS.map((g) => {
      const rows = lencanaList.filter((x) => x.grade === g);
      if (!rows.length) return '';
      const cards = rows.map((x) => `
        <div class="${CARD} p-5 flex flex-col gap-3">
          <div class="flex items-start gap-4">
            <div class="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-2xl shadow-md" style="background:${esc(x.warna)}">${esc(x.emoji)}</div>
            <div class="min-w-0 flex-1">
              <p class="font-bold text-slate-900 dark:text-white">${esc(x.label)}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Jalur: ${esc(x.jalur)}${x.tahap ? ' · ' + esc(x.tahap) : ''}</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span class="${CHIP}">${esc(x.syarat)} (${x.totalTasks} langkah)</span>
            <span class="px-2 py-0.5 rounded-full border ${x.awarded ? STATUS.terbit[1] : STATUS.draft[1]}">${x.awarded} siswa meraih</span>
          </div>
          <div class="flex justify-end pt-2 mt-auto border-t border-slate-100 dark:border-slate-800">
            <button type="button" data-b="cert" data-key="${esc(x.key)}" class="dc-btn dc-btn-sec dc-btn-sm"><i class="fa-solid fa-certificate text-xs"></i><span>Sertifikat</span></button>
          </div>
        </div>`).join('');
      return `<div class="space-y-3"><h2 class="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">${esc(GRADES[g])}<span class="text-[11px] font-mono font-semibold text-slate-400">${rows.length} lencana</span></h2><div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${cards}</div></div>`;
    }).join('');
    return info + groups;
  }

  function badgePanel() {
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
          <span class="${CHIP}">${esc(ruleText(b))}</span>
          <span class="px-2 py-0.5 rounded-full border ${b.active ? STATUS.terbit[1] : STATUS.draft[1]}">${b.active ? 'Aktif' : 'Nonaktif'}</span>
        </div>
        <div class="flex justify-end gap-1 mt-auto pt-1 border-t border-slate-100 dark:border-slate-800">
          <button type="button" data-b="edit" data-id="${b.id}" class="${BTN_GHOST}" title="Ubah"><i class="fa-solid fa-pen"></i></button>
          <button type="button" data-b="del" data-id="${b.id}" class="dc-ib dc-ib-danger" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>`).join('');
    return `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700"><i class="fa-solid fa-circle-info mt-0.5"></i><span>Badge kustom adalah penghargaan tambahan buatanmu, misalnya untuk tugas tertentu. Lencana jalur belajar ada di tab <b>Lencana Jalur</b>.</span></div>` +
      demoNote(badges, '/api/admin/badges') +
      (badgeList.length ? `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${cards}</div>` :
        emptyCard('Belum ada badge kustom. Klik <b>Badge Baru</b> untuk membuat yang pertama.'));
  }

  function certPanel() {
    if (lencanaErr) return emptyCard(esc(lencanaErr), 'text-rose-600 dark:text-rose-400');
    if (!lencanaList.length) return emptyCard('Belum ada jalur belajar, jadi belum ada sertifikat.');
    const signer = getSigner();
    const options = GRADE_KEYS.map((g) => {
      const rows = lencanaList.filter((x) => x.grade === g);
      return rows.length ? `<optgroup label="${esc(GRADES[g])}">${rows.map((x) => `<option value="${esc(x.key)}" ${x.key === certKey ? 'selected' : ''}>${esc(x.jalur)} (${x.awarded} berhak)</option>`).join('')}</optgroup>` : '';
    }).join('');
    const rows = certStudents.map((s, i) => `
      <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
        <td class="py-3 px-5 text-xs text-slate-400 font-mono">${i + 1}</td>
        <td class="py-3 px-4"><div class="font-semibold text-slate-900 dark:text-white">${esc(s.fullName || s.username)}</div><div class="text-xs text-slate-500 dark:text-slate-400">@${esc(s.username)}</div></td>
        <td class="py-3 px-4 text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">${esc(longDateTime(s.completedAt))}</td>
        <td class="py-3 px-4 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">${esc(s.certificateNo)}</td>
        <td class="py-3 px-5 text-right"><button type="button" data-b="print" data-i="${i}" class="dc-btn dc-btn-sec dc-btn-sm"><i class="fa-solid fa-print text-xs"></i><span>Cetak</span></button></td>
      </tr>`).join('');
    const body = certLoading ? emptyCard('Memuat siswa...') : certErr ? emptyCard(esc(certErr), 'text-rose-600 dark:text-rose-400') :
      !certStudents.length ? emptyCard('Belum ada siswa yang menyelesaikan jalur ini. Pratinjau contoh tetap bisa dicetak untuk melihat tampilannya.') :
      `<div class="${CARD} overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left border-collapse">
        <thead><tr class="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"><th class="py-3 px-5 w-12">#</th><th class="py-3 px-4">Siswa</th><th class="py-3 px-4">Selesai</th><th class="py-3 px-4">No. Sertifikat</th><th class="py-3 px-5 text-right">Aksi</th></tr></thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-sm">${rows}</tbody></table></div></div>`;
    return `
      <div class="${CARD} p-5 space-y-4">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
          ${field('Jalur belajar', `<select id="certKey" class="${INPUT}">${options}</select>`)}
          ${field('Nama penandatangan', `<input id="certSignName" maxlength="60" value="${esc(signer.name)}" class="${INPUT}" placeholder="Contoh: Budi Santoso, S.Kom">`)}
          ${field('Jabatan', `<input id="certSignTitle" maxlength="60" value="${esc(signer.title)}" class="${INPUT}" placeholder="Contoh: Kepala Program">`)}
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" data-b="sample" class="dc-btn dc-btn-sec"><i class="fa-solid fa-eye text-xs"></i><span>Pratinjau contoh</span></button>
          <button type="button" data-b="printall" class="${BTN}" ${certStudents.length ? '' : 'disabled'}><i class="fa-solid fa-print text-xs"></i><span>Cetak semua (${certStudents.length})</span></button>
          <span class="text-[11px] text-slate-500 dark:text-slate-400">Nama instansi dan logo diambil dari menu Pengaturan. Di jendela cetak, pilih <i>Simpan sebagai PDF</i> kalau ingin berkas digital.</span>
        </div>
      </div>` + body;
  }

  const certTotal = () => lencanaList.reduce((n, x) => n + (x.awarded || 0), 0);
  function drawBadge() {
    const sub = 'Lencana jalur belajar sama dengan yang dilihat siswa, sertifikat bisa dicetak untuk siswa yang berhak, dan badge kustom bisa kamu buat sendiri.';
    const panel = bdTab === 'lencana' ? lencanaPanel() : bdTab === 'sertifikat' ? certPanel() : badgePanel();
    vBadge.innerHTML = hero('Sertifikat &amp; Badges', 'Sertifikat &amp; Badges', 'bdCount', sub, bdTab === 'badge' ? 'data-b="new"' : '', 'Badge Baru') + tabBar() + panel;
    $('#bdCount').textContent = bdTab === 'badge' ? badgeList.length + ' Badge' : bdTab === 'sertifikat' ? certTotal() + ' Berhak' : lencanaList.length + ' Lencana';
  }
  async function loadCertStudents() {
    if (!certKey) return;
    const key = certKey;
    certLoading = true; certErr = ''; certStudents = [];
    if (bdTab === 'sertifikat') drawBadge();
    try { const r = await apiGet('/api/admin/lencana/' + encodeURIComponent(key) + '/students'); if (key !== certKey) return; certStudents = r.students || []; }
    catch (e) { if (key !== certKey) return; certErr = (e && e.message) || 'Gagal memuat siswa.'; }
    certLoading = false;
    if (bdTab === 'sertifikat') drawBadge();
  }
  async function renderBadge() {
    try { badgeList = await badges.list(); } catch (e) { return toast(e.message || 'Gagal memuat badge.', 'error'); }
    try { const r = await apiGet('/api/admin/lencana'); lencanaList = r.items || []; lencanaErr = ''; }
    catch (e) {
      lencanaList = [];
      lencanaErr = (e && e.status === 404) ? 'Server belum punya endpoint /api/admin/lencana. Perbarui backend lalu muat ulang halaman.' : ((e && e.message) || 'Gagal memuat lencana jalur.');
    }
    if (!certKey || !lencanaList.some((x) => x.key === certKey)) {
      const first = lencanaList.find((x) => x.awarded > 0) || lencanaList[0];
      certKey = first ? first.key : ''; certStudents = [];
    }
    drawBadge();
    if (bdTab === 'sertifikat') loadCertStudents();
  }

  // ---------- CETAK SERTIFIKAT ----------
  async function getOrg() {
    if (orgSettings) return orgSettings;
    try { const r = await apiGet('/api/admin/settings'); orgSettings = r.settings || {}; } catch (_) { orgSettings = {}; }
    return orgSettings;
  }
  function certPages(item, list, org, signer) {
    const accent = /^#[0-9a-f]{3,8}$/i.test(item.warna || '') ? item.warna : '#0ea5e9';
    const orgName = org.name || 'Dieng Cyber Coding';
    const logo = org.logo && /^(data:image\/|\/)/i.test(org.logo) ? `<img class="logo" src="${esc(org.logo)}" alt="">` : '';
    const akhir = item.grade === 'SD' ? 'Project Akhir' : 'Capstone';
    return list.map((s) => `
      <section class="page" style="--a:${accent}">
        <div class="f1"></div><div class="f2"></div>
        <div class="in">
          <div class="org">${logo}<div><b>${esc(orgName)}</b>${org.tagline ? `<small>${esc(org.tagline)}</small>` : ''}</div></div>
          <h1>SERTIFIKAT</h1>
          <p class="sub">Penyelesaian Jalur Belajar</p>
          <p class="lead">Diberikan kepada</p>
          <h2>${esc(s.fullName || s.username)}</h2>
          <p class="txt">atas keberhasilannya menyelesaikan seluruh task dan ${akhir} pada jalur belajar<br><b>${esc(item.jalur)}</b> (${esc(GRADES[item.grade] || item.grade)}),<br>serta berhak menyandang <span class="len">${esc(item.emoji)} ${esc(item.label)}</span></p>
          <div class="foot">
            <div class="l"><div>${esc(longDateTime(s.completedAt))}</div><small>No. ${esc(s.certificateNo)}</small></div>
            <div class="r"><div class="line"></div><b>${esc(signer.name || '________________')}</b><small>${esc(signer.title || '')}</small></div>
          </div>
        </div>
      </section>`).join('');
  }
  function certDocument(item, list, org, signer, autoPrint) {
    return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Sertifikat ${esc(item.label)}</title><style>
      @page{size:A4 landscape;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      html,body{margin:0;background:#e5e7eb}
      .page{width:297mm;height:210mm;margin:0 auto 8mm;background:#fff;position:relative;overflow:hidden;page-break-after:always;font-family:Georgia,'Times New Roman',serif;color:#1e293b}
      .f1{position:absolute;inset:8mm;border:2.4mm solid var(--a)}.f2{position:absolute;inset:14mm;border:.4mm solid var(--a)}
      .in{position:absolute;inset:20mm 24mm;display:flex;flex-direction:column;align-items:center;text-align:center}
      .org{display:flex;align-items:center;gap:4mm;text-align:left;font-family:Arial,sans-serif}.org b{display:block;font-size:13pt}.org small{display:block;font-size:9pt;color:#64748b}
      .logo{height:16mm;width:auto;max-width:40mm;object-fit:contain}
      h1{margin:7mm 0 0;font-size:40pt;letter-spacing:.35em;color:var(--a);font-weight:700;padding-left:.35em}
      .sub{margin:1mm 0 0;font-size:13pt;letter-spacing:.12em;text-transform:uppercase;color:#64748b;font-family:Arial,sans-serif}
      .lead{margin:9mm 0 0;font-size:12pt;font-style:italic;color:#64748b}
      h2{margin:3mm 0 0;font-size:32pt;font-weight:700;padding:0 12mm 2mm;border-bottom:.5mm solid var(--a);max-width:100%}
      .txt{margin:6mm 0 0;font-size:13pt;line-height:1.6;max-width:210mm}.len{display:inline-block;margin-top:1mm;font-weight:700;color:var(--a)}
      .foot{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;align-items:flex-end;text-align:left;font-family:Arial,sans-serif;font-size:10pt}
      .foot small{display:block;color:#64748b;font-size:8.5pt;margin-top:1mm}.foot .r{text-align:center;min-width:62mm}.foot .line{border-top:.35mm solid #334155;margin-bottom:1.5mm}
      @media print{html,body{background:#fff}.page{margin:0}}
    </style></head><body>${certPages(item, list, org, signer)}${autoPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})<\/script>' : ''}</body></html>`;
  }
  async function printCerts(list, autoPrint) {
    const item = lencanaList.find((x) => x.key === certKey);
    if (!item || !list.length) return;
    const w = window.open('', '_blank');
    if (!w) return toast('Jendela cetak diblokir browser. Izinkan pop-up untuk halaman ini.', 'error');
    w.document.write('<p style="font-family:sans-serif;padding:24px">Menyiapkan sertifikat...</p>');
    const org = await getOrg();
    w.document.open(); w.document.write(certDocument(item, list, org, getSigner(), autoPrint)); w.document.close();
  }
  const sampleStudent = () => ({ fullName: 'Nama Siswa', username: 'contoh', completedAt: new Date().toISOString(), certificateNo: 'DCC/' + new Date().getFullYear() + '/CONTOH/0001' });

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
    if (a.dataset.b === 'tab') { bdTab = a.dataset.tab; drawBadge(); if (bdTab === 'sertifikat') loadCertStudents(); return; }
    if (a.dataset.b === 'cert') { bdTab = 'sertifikat'; if (certKey !== a.dataset.key) { certKey = a.dataset.key; certStudents = []; } drawBadge(); loadCertStudents(); return; }
    if (a.dataset.b === 'sample') return printCerts([sampleStudent()], false);
    if (a.dataset.b === 'print') { const st = certStudents[+a.dataset.i]; return st && printCerts([st], true); }
    if (a.dataset.b === 'printall') return printCerts(certStudents, true);
    const b = badgeList.find((x) => String(x.id) === a.dataset.id);
    if (a.dataset.b === 'new') return badgeForm();
    if (a.dataset.b === 'edit' && b) return badgeForm(b);
    if (a.dataset.b === 'del' && b) {
      if (!(await window.dcConfirm({ title: 'Hapus badge?', message: 'Badge ini akan hilang dari daftar dan dari siswa yang sudah meraihnya.', detail: b.name, confirmText: 'Hapus', tone: 'danger' }))) return;
      try { await badges.remove(b.id); toast('Badge dihapus.'); renderBadge(); } catch (ex) { toast(ex.message || 'Gagal menghapus badge.', 'error'); }
    }
  });

  vBadge.addEventListener('change', (e) => {
    if (e.target.id === 'certKey') { certKey = e.target.value; certStudents = []; drawBadge(); loadCertStudents(); }
  });
  vBadge.addEventListener('input', (e) => {
    if (e.target.id === 'certSignName' || e.target.id === 'certSignTitle') setSigner({ name: ($('#certSignName') || {}).value || '', title: ($('#certSignTitle') || {}).value || '' });
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
    const ACT = 'dc-ib dc-ib-edit';
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
            <button type="button" data-t="dup" data-id="${t.id}" class="dc-ib dc-ib-mute" title="Salin sebagai draft"><i class="fa-regular fa-copy"></i></button>
            <button type="button" data-t="edit" data-id="${t.id}" class="dc-ib dc-ib-edit" title="Ubah"><i class="fa-solid fa-pen"></i></button>
            <button type="button" data-t="del" data-id="${t.id}" class="dc-ib dc-ib-danger" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </td></tr>`;
    }).join('') : `<tr><td colspan="8" class="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">${taskList.length ? 'Tidak ada tugas yang cocok dengan filter.' : 'Belum ada tugas. Klik Tugas Baru untuk membuat.'}</td></tr>`;
  }
  // Dua tab: "Tugas Admin" (tugas tambahan buatan admin, tabel admin_tasks) dan
  // "Tugas Kurikulum" (tugas yang dilihat siswa di jalur belajar, hanya untuk dilihat).
  let tgTab = 'admin';
  let curList = [], curErr = '';
  const curFilt = { q: '', grade: '', jalur: '' };
  const TG_TABS = [['admin', 'Tugas Admin', 'fa-list-check'], ['kurikulum', 'Tugas Kurikulum', 'fa-book-open']];
  const tugasTabs = () => `<div class="${CARD} p-2 flex flex-wrap gap-1.5">${TG_TABS.map(([k, label, ic]) =>
    `<button type="button" data-t="tab" data-tab="${k}" class="dc-pill-tab ${tgTab === k ? 'is-active' : ''} px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2"><i class="fa-solid ${ic}"></i>${label}</button>`).join('')}</div>`;

  function adminTugasPanel() {
    const opt = (o, cur, all) => (all ? `<option value="">${all}</option>` : '') + Object.entries(o).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(Array.isArray(v) ? v[0] : v)}</option>`).join('');
    return demoNote(tasks, '/api/admin/tasks') + `
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
  }

  function curPanel() {
    if (curErr) return emptyCard(esc(curErr), 'text-rose-600 dark:text-rose-400');
    const total = curList.length, projects = curList.filter((t) => t.isProject).length, done = curList.reduce((n, t) => n + t.completed, 0);
    const stat = (label, val) => `<div class="${CARD} px-5 py-4"><p class="text-[10px] font-mono uppercase tracking-wider text-slate-400">${label}</p><p class="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">${val}</p></div>`;
    const jalurOpts = [...new Set(curList.filter((t) => !curFilt.grade || t.grade === curFilt.grade).map((t) => t.jalur))];
    return `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30"><i class="fa-solid fa-circle-info mt-0.5"></i><span>Ini semua tugas yang dilihat siswa di jalur belajar. Daftar ini <b>hanya untuk dilihat</b>; isinya diatur di data kurikulum. Untuk tugas tambahan yang bisa kamu ubah dan nilai, pakai tab <b>Tugas Admin</b>.</span></div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">${stat('Total tugas', total)}${stat('Project / Capstone', projects)}${stat('Penyelesaian siswa', done)}</div>
      <div class="${CARD} p-2.5 flex flex-col lg:flex-row gap-2.5">
        <div class="relative flex-1"><span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-xs pointer-events-none"><i class="fa-solid fa-magnifying-glass"></i></span>
          <input id="curQ" value="${esc(curFilt.q)}" class="${INPUT} pl-9" placeholder="Cari judul tugas..."></div>
        <select id="curGrade" class="${INPUT} lg:w-44"><option value="">Semua jenjang</option>${Object.entries(GRADES).map(([k, v]) => `<option value="${k}" ${k === curFilt.grade ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
        <select id="curJalur" class="${INPUT} lg:w-64"><option value="">Semua jalur</option>${jalurOpts.map((j) => `<option value="${esc(j)}" ${j === curFilt.jalur ? 'selected' : ''}>${esc(j)}</option>`).join('')}</select></div>
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left border-collapse">
        <thead><tr class="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <th class="py-4 px-6 min-w-[280px]">Tugas</th><th class="py-4 px-4 min-w-[110px]">Jenjang</th><th class="py-4 px-4 min-w-[220px]">Jalur</th><th class="py-4 px-4 min-w-[80px]">Poin</th><th class="py-4 px-6 min-w-[130px]">Selesai</th></tr></thead>
        <tbody id="curBody" class="divide-y divide-slate-100 dark:divide-slate-800 text-sm"></tbody></table></div></div>
      <p id="curInfo" class="text-[11px] text-slate-400 dark:text-slate-500 font-mono"></p>`;
  }
  function renderCurRows() {
    const q = curFilt.q.trim().toLowerCase();
    const rows = curList.filter((t) => (!curFilt.grade || t.grade === curFilt.grade) && (!curFilt.jalur || t.jalur === curFilt.jalur) && (!q || t.title.toLowerCase().includes(q)));
    const body = $('#curBody'); if (!body) return;
    const GRADE_DOT = { SD: 'bg-emerald-500', SMP: 'bg-sky-500', SMK: 'bg-indigo-500' };
    body.innerHTML = rows.length ? rows.slice(0, 400).map((t) => `<tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
        <td class="py-3 px-6"><div class="font-semibold text-slate-900 dark:text-white">${esc(t.title)}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${t.isProject ? '<span class="font-semibold text-amber-600 dark:text-amber-400">Project Akhir / Capstone</span>' : 'Task ' + t.no}</div></td>
        <td class="py-3 px-4"><span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 whitespace-nowrap"><span class="w-1.5 h-1.5 rounded-full ${GRADE_DOT[t.grade] || 'bg-slate-400'}"></span>${esc(GRADES[t.grade] || t.grade)}</span></td>
        <td class="py-3 px-4 text-xs text-slate-700 dark:text-slate-200">${esc(t.jalur)}</td>
        <td class="py-3 px-4 text-xs font-bold text-slate-800 dark:text-slate-100">${t.points}</td>
        <td class="py-3 px-6 text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">${t.completed} siswa</td></tr>`).join('')
      : `<tr><td colspan="5" class="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">${curList.length ? 'Tidak ada tugas yang cocok dengan filter.' : 'Belum ada tugas kurikulum di database. Jalankan <code>npm run seed</code> di folder backend.'}</td></tr>`;
    const info = $('#curInfo'); if (info) info.textContent = rows.length > 400 ? `Menampilkan 400 dari ${rows.length} tugas. Persempit dengan filter.` : `Menampilkan ${rows.length} dari ${curList.length} tugas.`;
  }
  async function loadCur() {
    try { const r = await apiGet('/api/admin/curriculum-tasks'); curList = r.items || []; curErr = ''; }
    catch (e) {
      curList = [];
      curErr = (e && e.status === 404) ? 'Server belum punya endpoint /api/admin/curriculum-tasks. Perbarui backend lalu muat ulang halaman.' : ((e && e.message) || 'Gagal memuat tugas kurikulum.');
    }
  }
  function drawTugas() {
    const adminTab = tgTab === 'admin';
    const importBtn = adminTab ? `<button type="button" data-t="import" class="dc-btn dc-btn-sec"><i class="fa-solid fa-file-import text-xs"></i><span>Impor dari File</span></button>` : '';
    vTugas.innerHTML = hero('Tugas &amp; Review Kode', 'Tugas &amp; Review Kode', 'tgCount',
      'Buat tugas per jenjang, pantau siapa yang sudah mengumpulkan, lihat jawaban siswa, dan beri nilai. Tab Tugas Kurikulum menampilkan tugas yang dilihat siswa.',
      adminTab ? 'data-t="new"' : '', 'Tugas Baru', importBtn) + tugasTabs() + (adminTab ? adminTugasPanel() : curPanel());
    if (adminTab) renderTugasRows(); else { $('#tgCount').textContent = curList.length + ' Tugas'; renderCurRows(); }
  }
  async function renderTugas() {
    try { [taskList, badgeList] = await Promise.all([tasks.list(), badges.list()]); } catch (e) { return toast(e.message || 'Gagal memuat tugas.', 'error'); }
    subCount = await subs.counts(taskList).catch(() => ({}));
    if (tgTab === 'kurikulum') await loadCur();
    drawTugas();
  }

  // ---------- IMPOR TUGAS DARI FILE (CSV / JSON) ----------
  const MAX_IMPORT = 50;
  const TEMPLATE_HEADERS = ['title', 'description', 'grade', 'type', 'points', 'due', 'status', 'badge'];
  const HEAD_ALIAS = { judul: 'title', nama: 'title', deskripsi: 'description', instruksi: 'description', jenjang: 'grade', jenis: 'type', tipe: 'type', poin: 'points', tenggat: 'due', deadline: 'due', lencana: 'badge', badgeid: 'badgeId' };
  const normKey = (k) => { const s = String(k || '').trim().toLowerCase().replace(/[\s_-]+/g, ''); return HEAD_ALIAS[s] || s; };

  function parseCsv(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    const endRow = () => { row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
      else cur += c;
    }
    if (cur !== '' || row.length) endRow();
    return rows;
  }
  // Hasil: { records, csv } — csv=true bila nomor baris di pesan galat perlu ditambah baris judul.
  function parseImport(name, text) {
    if (/\.json$/i.test(name) || /^\s*[\[{]/.test(text)) {
      let data; try { data = JSON.parse(text); } catch (_) { throw new Error('File JSON tidak valid.'); }
      const list = Array.isArray(data) ? data : data && (data.tasks || data.items || data.tugas);
      if (!Array.isArray(list)) throw new Error('JSON harus berupa daftar tugas, atau objek dengan kunci "tasks".');
      return { csv: false, records: list.map((o) => { const r = {}; Object.keys(o && typeof o === 'object' ? o : {}).forEach((k) => { r[normKey(k)] = o[k]; }); return r; }) };
    }
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('CSV harus punya baris judul kolom dan minimal satu tugas.');
    const heads = rows[0].map(normKey);
    if (!heads.includes('title')) throw new Error('Kolom "title" (atau "judul") tidak ditemukan di baris pertama.');
    return { csv: true, records: rows.slice(1).map((cells) => { const r = {}; heads.forEach((h, i) => { r[h] = cells[i]; }); return r; }) };
  }
  function importRow(raw) {
    const g = (k) => String(raw[k] === undefined || raw[k] === null ? '' : raw[k]).trim();
    const err = (error) => ({ error });
    const title = g('title');
    if (!title) return err('judul kosong');
    if (title.length > 80) return err('judul lebih dari 80 karakter');
    const description = g('description');
    if (description.length > 500) return err('deskripsi lebih dari 500 karakter');
    let grade = g('grade').toUpperCase().replace(/\s+/g, '');
    if (['SMA/SMK', 'SMA', 'SMAK'].includes(grade)) grade = 'SMK';
    if (!GRADES[grade]) return err('jenjang harus SD, SMP, atau SMK');
    const type = g('type').toLowerCase();
    if (!TYPES[type]) return err('jenis harus kode, proyek, atau kuis');
    const pr = g('points'), points = pr === '' ? 0 : Number(pr);
    if (!Number.isInteger(points) || points < 0 || points > 1000) return err('poin harus bilangan bulat 0-1000');
    let due = g('due');
    if (!due) due = inDays(7);
    else {
      const m = due.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
      if (m) due = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      const p = due.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const ok = p && (() => { const d = new Date(Date.UTC(+p[1], +p[2] - 1, +p[3])); return d.getUTCFullYear() === +p[1] && d.getUTCMonth() === +p[2] - 1 && d.getUTCDate() === +p[3]; })();
      if (!ok) return err('tenggat harus berformat YYYY-MM-DD');
    }
    const status = g('status').toLowerCase() || 'draft';
    if (!STATUS[status]) return err('status harus draft, terbit, atau ditutup');
    let badgeId = null;
    const bn = g('badge'), bid = g('badgeId');
    if (bn) {
      const b = badgeList.find((x) => String(x.name).toLowerCase() === bn.toLowerCase());
      if (!b) return err('badge "' + bn + '" tidak ditemukan');
      badgeId = b.id;
    } else if (bid) {
      const b = badgeList.find((x) => String(x.id) === bid);
      if (!b) return err('badgeId tidak ditemukan');
      badgeId = b.id;
    }
    return { row: { title, description, grade, type, points, due, status, badgeId } };
  }
  function downloadTemplate() {
    const rows = [TEMPLATE_HEADERS,
      ['Perulangan For & While', 'Buat program yang mencetak angka 1 sampai 10.', 'SMP', 'kode', '50', inDays(7), 'draft', ''],
      ['Halaman Profil Pribadi', 'Rancang halaman profil sederhana dengan HTML dan CSS.', 'SMP', 'proyek', '80', inDays(14), 'terbit', ''],
      ['Susun Blok Perulangan', 'Selesaikan 5 level tentang perulangan.', 'SD', 'kuis', '30', inDays(3), 'draft', '']];
    const csv = '\uFEFF' + rows.map((r) => r.map((c) => (/[",\n;]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'template-tugas.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function openImport() {
    let valid = [];
    const el = modal('Impor Tugas dari File', `
      <p class="text-xs text-slate-500 dark:text-slate-400">Unggah file <b>CSV</b> (bisa diekspor dari Excel atau Google Sheets) atau <b>JSON</b>. Satu baris sama dengan satu tugas, maksimal ${MAX_IMPORT} tugas per file.</p>
      <div><button type="button" data-im="tpl" class="dc-btn dc-btn-sec dc-btn-sm"><i class="fa-solid fa-download text-xs"></i><span>Unduh template CSV</span></button></div>
      ${field('Pilih file', `<input id="imFile" type="file" accept=".csv,.json,.txt,text/csv,application/json" class="${INPUT}">`)}
      <div id="imPreview" class="text-xs space-y-2"></div>
      <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">Kolom: <code>title</code>, <code>description</code>, <code>grade</code> (SD/SMP/SMK), <code>type</code> (kode/proyek/kuis), <code>points</code>, <code>due</code> (YYYY-MM-DD; kosong = 7 hari lagi), <code>status</code> (draft/terbit/ditutup; kosong = draft), <code>badge</code> (nama badge kustom, boleh kosong).</p>`,
      async () => {
        if (!valid.length) return 'Pilih file yang berisi minimal satu tugas yang valid.';
        let ok = 0; const failed = [];
        for (const r of valid) {
          try { await tasks.save({ ...r, submissions: 0 }); ok++; }
          catch (ex) { failed.push(r.title + ': ' + ((ex && ex.message) || 'gagal')); }
        }
        toast(`${ok} tugas diimpor` + (failed.length ? `, ${failed.length} gagal (${failed[0]})` : '.'), failed.length ? 'error' : undefined);
        renderTugas();
      }, 'Impor');
    const prev = el.querySelector('#imPreview');
    el.addEventListener('click', (e) => { if (e.target.closest('[data-im="tpl"]')) downloadTemplate(); });
    el.querySelector('#imFile').addEventListener('change', async (e) => {
      valid = []; prev.innerHTML = '';
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const fail = (m) => { prev.innerHTML = `<p class="font-medium text-rose-600 dark:text-rose-400">${esc(m)}</p>`; };
      if (file.size > 1024 * 1024) return fail('File terlalu besar (maksimal 1 MB).');
      try {
        const { csv, records } = parseImport(file.name, await file.text());
        if (!records.length) throw new Error('File tidak berisi tugas.');
        if (records.length > MAX_IMPORT) throw new Error(`Maksimal ${MAX_IMPORT} tugas per file (file ini berisi ${records.length}).`);
        const bad = [];
        records.forEach((r, i) => { const res = importRow(r); if (res.row) valid.push(res.row); else bad.push(`${csv ? 'Baris' : 'Item'} ${i + (csv ? 2 : 1)}: ${res.error}`); });
        const sample = valid.slice(0, 5).map((r) => `<tr><td class="py-1 pr-3 font-medium text-slate-800 dark:text-slate-100">${esc(r.title)}</td><td class="py-1 pr-3">${esc(GRADES[r.grade])}</td><td class="py-1 pr-3">${esc(TYPES[r.type])}</td><td class="py-1 pr-3">${r.points} poin</td><td class="py-1">${esc(fmtDate(r.due))}</td></tr>`).join('');
        prev.innerHTML = `<div class="flex flex-wrap gap-2 font-mono text-[11px]"><span class="px-2 py-0.5 rounded-full border ${STATUS.terbit[1]}">${valid.length} tugas siap diimpor</span>${bad.length ? `<span class="px-2 py-0.5 rounded-full border ${STATUS.ditutup[1]}">${bad.length} dilewati</span>` : ''}</div>` +
          (sample ? `<table class="text-[11px] text-slate-600 dark:text-slate-300"><tbody>${sample}</tbody></table>${valid.length > 5 ? `<p class="text-slate-400">...dan ${valid.length - 5} lainnya</p>` : ''}` : '') +
          (bad.length ? `<ul class="list-disc pl-4 text-rose-600 dark:text-rose-400">${bad.slice(0, 6).map((m) => `<li>${esc(m)}</li>`).join('')}${bad.length > 6 ? `<li>...dan ${bad.length - 6} baris lain</li>` : ''}</ul>` : '');
      } catch (ex) { fail(ex.message || 'File tidak bisa dibaca.'); }
    });
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
    if (e.target.id === 'curQ') { curFilt.q = e.target.value; renderCurRows(); }
  });
  vTugas.addEventListener('change', (e) => {
    if (e.target.id === 'tgGrade') { filt.grade = e.target.value; renderTugasRows(); }
    if (e.target.id === 'tgStatus') { filt.status = e.target.value; renderTugasRows(); }
    if (e.target.id === 'curGrade') { curFilt.grade = e.target.value; curFilt.jalur = ''; drawTugas(); }
    if (e.target.id === 'curJalur') { curFilt.jalur = e.target.value; renderCurRows(); }
  });
  vTugas.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-t]'); if (!a) return;
    const t = taskList.find((x) => String(x.id) === a.dataset.id);
    if (a.dataset.t === 'tab') { tgTab = a.dataset.tab; renderTugas(); return; }
    if (a.dataset.t === 'import') return openImport();
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
    return `<td class="py-4 px-4"><button type="button" data-t="review" data-id="${t.id}" class="dc-btn dc-btn-ghost" title="Pantau &amp; nilai pengumpulan">
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
      <button type="button" data-r="close" class="dc-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div>`;

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
        <div class="flex gap-1.5 overflow-x-auto">${tabs.map(([k, l, c]) => `<button type="button" data-r="tab" data-v="${k}" class="dc-pill-tab ${k === tab ? 'is-active' : ''}">${l} <span class="opacity-70 font-mono">${c}</span></button>`).join('')}</div>
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
          <button type="button" data-r="save" data-s="revisi" class="dc-btn dc-btn-warn"><i class="fa-solid fa-rotate-left mr-1.5"></i>Minta revisi</button>
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
