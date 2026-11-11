/* Instruktur (Admin)
   Pengganti menu "Jadwal Mentoring". Fitur:
     - CRUD data instruktur (nama, email, status aktif, jenjang + tahap yang diampu)
     - Detail instruktur: masuk ke jenjang SD / SMP / SMA-SMK mana, tahap berapa, dan siswa siapa saja di tahap itu
   Endpoint (sama dengan halaman Akses & Hak Pengguna, supaya datanya satu):
     GET/POST /api/admin/instructors      PATCH/DELETE /api/admin/instructors/:id
   Bentuk data instruktur:
     { id, name, email, role: 'instruktur', active, grades: ['SMP'],
       assignments: [ { grade: 'SMP', tahap: 1, studentIds: [12, 15] } ],
       studentIds: [12, 15] }                     // gabungan semua murid binaan
   Daftar tahap diambil dari Kurikulum (menu Kelola Tahap) lewat /api/admin/curriculum.
   Murid diambil dari /api/admin/users (allowedGrades dipakai untuk menyaring jenjang).
   Catatan: pembatasan hak akses yang sebenarnya HARUS dicek di server. */
(function () {
  'use strict';

  const U = window.DCUI;
  const view = document.getElementById('view-instruktur');
  // U.instructors disediakan pengaturan-akses.js (satu store dipakai bersama agar cache tidak bentrok).
  if (!U || !U.instructors || !view) return;
  const { esc, toast, INPUT, LABEL, BTN, modal, field } = U;
  const store = U.instructors;
  const $ = (s, r = view) => r.querySelector(s);

  const GRADES = { SD: 'SD', SMP: 'SMP', SMK: 'SMA/SMK' };
  const ORDER = ['SD', 'SMP', 'SMK'];
  const GHOST = 'dc-btn dc-btn-ghost';
  const H1 = 'text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2.5';
  const SUB = 'text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1';
  const PANEL = 'bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800';
  const CHIP = 'text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300 border border-sky-200/70 dark:border-sky-500/30';
  const CHIP_MUTED = 'text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
  const missing = (e) => e && [0, 404, 405, 501].includes(e.status);

  // Cadangan bila kurikulum belum bisa dimuat dari server.
  const DEFAULT_TAHAP = [
    { jenjang: 'SD', no: 1, nama: 'Basic' }, { jenjang: 'SD', no: 2, nama: 'Explore' },
    { jenjang: 'SMP', no: 1, nama: 'Python Start' }, { jenjang: 'SMP', no: 2, nama: 'AI & Creative Tech' }, { jenjang: 'SMP', no: 3, nama: 'Game Dev 3D Lanjutan' },
    { jenjang: 'SMK', no: 1, nama: 'Python Lanjutan & Algoritma' }, { jenjang: 'SMK', no: 2, nama: 'Web Development Advanced' }, { jenjang: 'SMK', no: 3, nama: 'Data & AI Terapan' }
  ];

  const S = { all: [], people: [], students: [], tahap: DEFAULT_TAHAP, q: '', g: '', detail: null, loading: false, loaded: false, error: '' };

  // ---------- helper data ----------
  const normGrade = (v) => {
    const g = String(v || '').toUpperCase().replace(/[^A-Z]/g, '');
    return g === 'SD' ? 'SD' : g === 'SMP' ? 'SMP' : ['SMK', 'SMA', 'SMASMK', 'SMKSMA'].includes(g) ? 'SMK' : '';
  };
  const uniq = (arr) => { const seen = new Set(), out = []; arr.forEach((x) => { const k = String(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }); return out; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const keyOf = (g, t) => g + '|' + t;
  const initials = (n) => { const w = String(n || '?').trim().split(/\s+/); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };
  const studentName = (u) => String(u.full_name || u.fullName || u.username || '');

  function norm(p) {
    const seen = new Set(), assignments = [];
    (Array.isArray(p.assignments) ? p.assignments : []).forEach((a) => {
      const grade = normGrade(a && a.grade), tahap = Number(a && a.tahap);
      if (!grade || !(tahap > 0) || seen.has(keyOf(grade, tahap))) return;
      seen.add(keyOf(grade, tahap));
      assignments.push({ grade, tahap, studentIds: Array.isArray(a.studentIds) ? uniq(a.studentIds) : [] });
    });
    assignments.sort((a, b) => ORDER.indexOf(a.grade) - ORDER.indexOf(b.grade) || a.tahap - b.tahap);
    return { ...p, grades: Array.isArray(p.grades) ? p.grades : [], studentIds: Array.isArray(p.studentIds) ? p.studentIds : [], assignments };
  }
  // Semua murid binaan = studentIds + murid di tiap tahap.
  const allStudentIds = (p) => uniq((p.studentIds || []).concat(...p.assignments.map((a) => a.studentIds)));
  const gradesOf = (p) => ORDER.filter((g) => (p.grades || []).includes(g) || p.assignments.some((a) => a.grade === g));
  const tahapList = (g) => S.tahap.filter((t) => t.jenjang === g).sort((a, b) => a.no - b.no);
  const tahapNama = (g, no) => { const t = S.tahap.find((x) => x.jenjang === g && x.no === no); return t && t.nama ? t.nama : ''; };
  const tahapLabel = (g, no) => { const n = tahapNama(g, no); return 'Tahap ' + no + (n ? ' · ' + n : ''); };
  const studentById = () => new Map(S.students.map((u) => [String(u.id), u]));

  async function loadStudents() {
    const all = [];
    try {
      let page = 1, pages = 1;
      do {
        const d = await window.DCAdminApi.users({ page, limit: 100 });
        all.push(...(Array.isArray(d.users) ? d.users : []));
        pages = Math.max(1, Number(d.pages || 1));
        page++;
      } while (page <= pages && page <= 50);
    } catch (e) {
      if (!missing(e)) throw e;
      try { const r = JSON.parse(localStorage.getItem('dc-siswa-data')); if (r && Array.isArray(r.users)) all.push(...r.users); } catch (_) {}
    }
    return all.filter((u) => u && u.status !== 'deleted');
  }
  async function loadTahap() {
    try {
      const r = await window.DCAdminApi.curriculum();
      const c = r.curriculum || r;
      const list = (Array.isArray(c.tahap) ? c.tahap : [])
        .map((t) => ({ jenjang: normGrade(t.jenjang), no: Number(t.no), nama: String(t.nama || '') }))
        .filter((t) => t.jenjang && t.no > 0);
      if (list.length) return list;
    } catch (_) {}
    return DEFAULT_TAHAP;
  }

  async function load() {
    if (S.loading) return;
    S.loading = true; S.error = '';
    if (!S.loaded) draw();
    try {
      const [all, students, tahap] = await Promise.all([store.list(), loadStudents(), loadTahap()]);
      S.all = all;
      S.people = all.filter((p) => p.role === 'instruktur').map(norm);
      S.students = students;
      S.tahap = tahap;
      S.loaded = true;
      if (S.detail != null && !S.people.some((p) => String(p.id) === String(S.detail))) S.detail = null;
    } catch (e) {
      S.error = (e && e.message) || 'Gagal memuat data instruktur.';
    }
    S.loading = false;
    draw();
  }

  // ---------- tampilan umum ----------
  const crumb = (extra) => `<div class="flex items-center gap-2 text-xs font-mono text-slate-400 dark:text-slate-500 mb-1"><span>Portal Admin</span><span>/</span><span class="${extra ? '' : 'text-sky-600 dark:text-sky-400 font-medium'}">Instruktur</span>${extra ? `<span>/</span><span class="text-sky-600 dark:text-sky-400 font-medium">${esc(extra)}</span>` : ''}</div>`;
  const demoNote = () => store.isLocal() ? `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"><i class="fa-solid fa-flask mt-0.5"></i><span><b>Mode contoh.</b> Server belum punya <code class="font-mono">/api/admin/instructors</code>, jadi data hanya tersimpan di browser ini.</span></div>` : '';
  const errorNote = () => S.error ? `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30" role="alert"><i class="fa-solid fa-circle-info mt-0.5"></i><span>${esc(S.error)}</span></div>` : '';
  const avatar = (name, size) => `<div class="${size || 'w-9 h-9 text-xs'} shrink-0 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white font-bold flex items-center justify-center">${esc(initials(name))}</div>`;
  const statusPill = (active) => `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30' : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}"><span class="w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}"></span>${active ? 'Aktif' : 'Nonaktif'}</span>`;

  function assignmentChips(p) {
    const out = ORDER.map((g) => {
      const ts = p.assignments.filter((a) => a.grade === g);
      if (ts.length) return `<span class="${CHIP}">${esc(GRADES[g])} · ${ts.map((a) => 'T' + a.tahap).join(', ')}</span>`;
      if ((p.grades || []).includes(g)) return `<span class="${CHIP_MUTED}" title="Jenjang ini belum punya tahap">${esc(GRADES[g])} · tahap belum diatur</span>`;
      return '';
    }).filter(Boolean);
    return out.length ? out.join('') : '<span class="text-xs text-slate-300 dark:text-slate-600">—</span>';
  }

  // ---------- daftar ----------
  function filtered() {
    const q = S.q.trim().toLowerCase();
    return S.people.filter((p) => {
      if (S.g && !gradesOf(p).includes(S.g)) return false;
      return !q || [p.name, p.email].join(' ').toLowerCase().includes(q);
    });
  }

  function drawList() {
    const list = filtered();
    const th = 'py-4 px-4 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
    const rows = list.map((p) => `<tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 ${p.active === false ? 'opacity-60' : ''}">
        <td class="py-3.5 px-6"><button type="button" data-a="detail" data-id="${esc(p.id)}" class="flex items-center gap-3 text-left min-w-0">
          ${avatar(p.name)}<div class="min-w-0"><p class="font-semibold text-slate-900 dark:text-white truncate hover:text-sky-600 dark:hover:text-sky-400">${esc(p.name)}</p><p class="text-xs text-slate-500 dark:text-slate-400 truncate">${esc(p.email)}</p></div></button></td>
        <td class="py-3.5 px-4"><div class="flex flex-wrap gap-1">${assignmentChips(p)}</div></td>
        <td class="py-3.5 px-4"><span class="font-mono font-semibold text-slate-700 dark:text-slate-200">${allStudentIds(p).length}</span> <span class="text-xs text-slate-500 dark:text-slate-400">siswa</span></td>
        <td class="py-3.5 px-4">${statusPill(p.active !== false)}</td>
        <td class="py-3.5 px-6 text-right"><div class="inline-flex items-center gap-1">
          <button type="button" data-a="detail" data-id="${esc(p.id)}" class="dc-ib dc-ib-edit" title="Detail" aria-label="Detail ${esc(p.name)}"><i class="fa-solid fa-eye"></i></button>
          <button type="button" data-a="edit" data-id="${esc(p.id)}" class="dc-ib dc-ib-edit" title="Ubah" aria-label="Ubah ${esc(p.name)}"><i class="fa-solid fa-pen"></i></button>
          <button type="button" data-a="del" data-id="${esc(p.id)}" class="dc-ib dc-ib-danger" title="Hapus" aria-label="Hapus ${esc(p.name)}"><i class="fa-regular fa-trash-can text-sm"></i></button></div></td></tr>`).join('');
    const empty = S.people.length
      ? 'Tidak ada instruktur yang cocok dengan pencarian.'
      : 'Belum ada instruktur. Klik Tambah Instruktur.';

    view.innerHTML = `
      <div class="page-hero flex flex-col md:flex-row md:items-center justify-between gap-4"><div>
        ${crumb()}<h1 class="${H1}">Instruktur<span class="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border border-sky-300/60 dark:border-sky-500/30">${S.people.length}</span></h1>
        <p class="${SUB}">Kelola data instruktur, jenjang dan tahap yang diampu, serta siswa di tiap tahap.</p></div>
        <button type="button" data-a="new" class="${BTN} self-start md:self-auto"><i class="fa-solid fa-plus text-xs"></i><span>Tambah Instruktur</span></button></div>
      ${demoNote()}${errorNote()}
      <div class="flex flex-col sm:flex-row gap-2">
        <input type="search" id="inQ" value="${esc(S.q)}" placeholder="Cari nama atau email instruktur" autocomplete="off" aria-label="Cari instruktur" class="${INPUT} sm:max-w-sm">
        <select id="inG" aria-label="Filter jenjang" class="${INPUT} sm:w-48"><option value="">Semua jenjang</option>${ORDER.map((g) => `<option value="${g}" ${S.g === g ? 'selected' : ''}>${esc(GRADES[g])}</option>`).join('')}</select></div>
      <div class="${PANEL} overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left border-collapse">
        <thead><tr class="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800"><th class="${th} px-6 min-w-[260px]">Instruktur</th><th class="${th} min-w-[200px]">Jenjang &amp; Tahap</th><th class="${th} min-w-[100px]">Siswa</th><th class="${th} min-w-[110px]">Status</th><th class="${th} px-6 text-right min-w-[130px]">Aksi</th></tr></thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-sm">${rows || `<tr><td colspan="5" class="py-10 px-6 text-center text-sm text-slate-500 dark:text-slate-400">${empty}</td></tr>`}</tbody></table></div></div>`;
  }

  // ---------- detail ----------
  function studentRow(id, byId) {
    const u = byId.get(String(id));
    if (!u) return `<li class="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800"><div class="w-8 h-8 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs flex items-center justify-center"><i class="fa-solid fa-user"></i></div><span class="text-xs text-slate-500 dark:text-slate-400">Siswa #${esc(id)} (data tidak ditemukan)</span></li>`;
    const gs = ORDER.filter((g) => (u.allowedGrades || []).includes(g));
    const suspended = u.status === 'suspended';
    return `<li class="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800 ${suspended ? 'opacity-70' : ''}">
      <div class="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white text-[11px] font-bold flex items-center justify-center">${esc(initials(studentName(u)))}</div>
      <div class="min-w-0 flex-1"><p class="text-sm font-semibold text-slate-900 dark:text-white truncate">${esc(studentName(u))}${suspended ? ' <span class="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Suspend</span>' : ''}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 truncate">${esc(u.username || u.email || '')}${gs.length ? ' · ' + esc(gs.map((g) => GRADES[g]).join(', ')) : ''}</p></div>
      <div class="shrink-0 text-right"><p class="text-xs font-mono font-semibold text-slate-700 dark:text-slate-200">${Number(u.completed_tasks || 0)} task</p><p class="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">${Number(u.points_total || 0)} poin</p></div></li>`;
  }

  function drawDetail(p) {
    const byId = studentById();
    const total = allStudentIds(p).length;
    const inSlot = new Set(p.assignments.flatMap((a) => a.studentIds.map(String)));
    const orphans = allStudentIds(p).filter((id) => !inSlot.has(String(id)));
    const emptyGrades = gradesOf(p).filter((g) => !p.assignments.some((a) => a.grade === g));

    const stat = (label, value, color) => `<div class="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 px-4 py-3 text-center"><div class="text-xl font-extrabold font-mono ${color}">${value}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono mt-0.5">${label}</div></div>`;

    const sections = ORDER.map((g) => {
      const slots = p.assignments.filter((a) => a.grade === g);
      if (!slots.length) return '';
      return `<section class="space-y-3"><h2 class="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white"><span class="${CHIP}">${esc(GRADES[g])}</span>Jenjang ${esc(GRADES[g])}</h2>
        ${slots.map((a) => `<div class="${PANEL}">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
            <div class="min-w-0"><p class="font-bold text-slate-900 dark:text-white">${esc(tahapLabel(a.grade, a.tahap))}</p><p class="text-xs text-slate-500 dark:text-slate-400">${a.studentIds.length} siswa di tahap ini</p></div>
            <button type="button" data-a="students" data-id="${esc(p.id)}" data-slot="${esc(keyOf(a.grade, a.tahap))}" class="${GHOST} dc-btn-sm self-start sm:self-auto"><i class="fa-solid fa-user-plus text-[11px]"></i>Atur siswa</button></div>
          <div class="p-4">${a.studentIds.length ? `<ul class="space-y-2">${a.studentIds.map((id) => studentRow(id, byId)).join('')}</ul>` : '<p class="py-6 text-center text-xs text-slate-500 dark:text-slate-400"><i class="fa-solid fa-inbox text-xl text-slate-300 dark:text-slate-600 block mb-2"></i>Belum ada siswa di tahap ini.</p>'}</div></div>`).join('')}</section>`;
    }).join('');

    view.innerHTML = `
      <div class="page-hero flex flex-col md:flex-row md:items-center justify-between gap-4"><div>
        ${crumb(p.name)}
        <button type="button" data-a="back" class="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline mb-2"><i class="fa-solid fa-arrow-left mr-1"></i>Semua instruktur</button>
        <div class="flex items-center gap-4">${avatar(p.name, 'w-14 h-14 text-lg')}<div class="min-w-0"><h1 class="${H1}">${esc(p.name)}${statusPill(p.active !== false)}</h1><p class="${SUB}">${esc(p.email)}</p></div></div></div>
        <div class="flex items-center gap-2 self-start md:self-auto">
          <button type="button" data-a="edit" data-id="${esc(p.id)}" class="${GHOST}"><i class="fa-solid fa-pen text-xs"></i>Ubah</button>
          <button type="button" data-a="del" data-id="${esc(p.id)}" class="dc-btn dc-btn-ghost text-rose-600 dark:text-rose-400"><i class="fa-regular fa-trash-can text-xs"></i>Hapus</button></div></div>
      ${demoNote()}${errorNote()}
      <div class="grid grid-cols-3 gap-3 max-w-xl">${stat('Jenjang', gradesOf(p).length, 'text-sky-600 dark:text-sky-400')}${stat('Tahap', p.assignments.length, 'text-indigo-600 dark:text-indigo-400')}${stat('Siswa', total, 'text-emerald-600 dark:text-emerald-400')}</div>
      ${sections || `<div class="${PANEL} py-12 text-center text-sm text-slate-500 dark:text-slate-400"><i class="fa-solid fa-stairs text-2xl text-slate-300 dark:text-slate-600 block mb-2"></i>Instruktur ini belum diberi tahap.<br><button type="button" data-a="edit" data-id="${esc(p.id)}" class="mt-2 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline">Atur jenjang &amp; tahap</button></div>`}
      ${emptyGrades.length ? `<p class="text-xs text-slate-500 dark:text-slate-400"><i class="fa-solid fa-circle-info mr-1"></i>Jenjang ${esc(emptyGrades.map((g) => GRADES[g]).join(', '))} tercatat untuk instruktur ini, tetapi belum ada tahapnya. Atur lewat tombol Ubah.</p>` : ''}
      ${orphans.length ? `<section class="space-y-3"><h2 class="text-sm font-extrabold text-slate-900 dark:text-white">Murid binaan tanpa tahap <span class="${CHIP_MUTED}">${orphans.length}</span></h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">Murid ini terdaftar sebagai binaan (mis. dari menu Akses) tetapi belum dimasukkan ke tahap mana pun. Pilih lewat Atur siswa di salah satu tahap di atas.</p>
        <ul class="space-y-2">${orphans.map((id) => studentRow(id, byId)).join('')}</ul></section>` : ''}`;
  }

  function draw() {
    if (S.loading && !S.loaded) {
      view.innerHTML = `<div class="text-center text-sm text-slate-500 dark:text-slate-400 py-16"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat instruktur...</div>`;
      return;
    }
    const p = S.detail != null ? S.people.find((x) => String(x.id) === String(S.detail)) : null;
    if (p) drawDetail(p); else { S.detail = null; drawList(); }
  }

  // ---------- form tambah / ubah ----------
  function personForm(p) {
    const editing = !!(p && p.id);
    const cur = new Set(editing ? p.assignments.map((a) => keyOf(a.grade, a.tahap)) : []);
    const groups = ORDER.map((g) => {
      const ts = tahapList(g);
      return `<div><p class="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">${esc(GRADES[g])}</p>
        <div class="flex flex-wrap gap-2">${ts.length ? ts.map((t) => `<label class="cursor-pointer"><input type="checkbox" name="slot" value="${esc(keyOf(g, t.no))}" ${cur.has(keyOf(g, t.no)) ? 'checked' : ''} class="peer sr-only"><span class="inline-flex px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 peer-checked:bg-sky-600 peer-checked:text-white peer-checked:border-sky-600 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500/50 transition">Tahap ${t.no}${t.nama ? ' · ' + esc(t.nama) : ''}</span></label>`).join('') : '<span class="text-xs text-slate-400">Belum ada tahap di jenjang ini (tambahkan di Kelola Tahap).</span>'}</div></div>`;
    }).join('');

    modal(editing ? 'Ubah Instruktur' : 'Tambah Instruktur', `
      ${field('Nama lengkap', `<input name="name" maxlength="60" value="${esc(editing ? p.name : '')}" class="${INPUT}" placeholder="Contoh: Nurul Hidayah">`)}
      ${field('Email', `<input name="email" type="email" value="${esc(editing ? p.email : '')}" class="${INPUT}" placeholder="nama@instansi.id">`)}
      ${field('Jenjang &amp; tahap yang diampu', `<div class="space-y-3 mt-1">${groups}</div><p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2">Centang tahap yang diajar instruktur ini. Pilih minimal satu.</p>`)}
      <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" name="active" value="1" ${!editing || p.active !== false ? 'checked' : ''} class="rounded"> Akun aktif (boleh login)</label>`,
      async (f, form) => {
        const name = (f.name || '').trim(), email = (f.email || '').trim().toLowerCase();
        const slots = Array.from(form.querySelectorAll('[name=slot]:checked')).map((c) => { const [g, t] = c.value.split('|'); return { grade: g, tahap: Number(t) }; });
        if (!name) return 'Nama harus diisi.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Format email tidak valid.';
        if (S.all.some((x) => (!editing || String(x.id) !== String(p.id)) && (x.email || '').toLowerCase() === email)) return 'Email sudah dipakai pengguna lain.';
        if (!slots.length) return 'Pilih minimal satu tahap yang diampu.';
        const old = editing ? p.assignments : [];
        const assignments = slots.map((s) => { const o = old.find((a) => a.grade === s.grade && a.tahap === s.tahap); return { grade: s.grade, tahap: s.tahap, studentIds: o ? o.studentIds : [] }; });
        const grades = ORDER.filter((g) => assignments.some((a) => a.grade === g));
        const body = { ...(editing ? { id: p.id } : {}), name, email, role: 'instruktur', grades, active: f.active === '1', assignments, studentIds: editing ? allStudentIds(p) : [] };
        const res = await store.save(body);
        toast(editing ? 'Data instruktur diperbarui.' : 'Instruktur ditambahkan.');
        await load();
        if (res && res.temporaryPassword) await window.dcConfirm({ title: 'Akun instruktur dibuat', message: 'Berikan password sementara ini ke instruktur. Password hanya ditampilkan sekali.', detail: res.temporaryPassword, confirmText: 'Sudah dicatat', cancelText: 'Tutup', tone: 'success' });
      }, true);
  }

  // ---------- atur siswa per tahap ----------
  function studentsForm(p, slotKey) {
    const [grade, tahapStr] = slotKey.split('|');
    const tahap = Number(tahapStr);
    const slot = p.assignments.find((a) => a.grade === grade && a.tahap === tahap);
    if (!slot) return;
    const pool = S.students.filter((u) => (u.allowedGrades || []).includes(grade)).sort((a, b) => studentName(a).localeCompare(studentName(b), 'id'));
    const mine = new Set(slot.studentIds.map(String));

    // pemilik saat ini tiap siswa (satu siswa hanya di satu instruktur dan satu tahap)
    const owner = {};
    S.people.forEach((x) => {
      allStudentIds(x).forEach((id) => { owner[String(id)] = { pid: x.id, name: x.name, slot: null }; });
      x.assignments.forEach((a) => a.studentIds.forEach((id) => { owner[String(id)] = { pid: x.id, name: x.name, slot: keyOf(a.grade, a.tahap) }; }));
    });
    const tag = (o) => {
      if (!o || (String(o.pid) === String(p.id) && o.slot === slotKey)) return '';
      if (String(o.pid) === String(p.id)) return o.slot ? `<span class="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30">Pindah dari T${esc(o.slot.split('|')[1])}</span>` : '';
      return `<span class="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30" title="Akan dipindahkan ke tahap ini">${esc(o.name)}${o.slot ? ' · ' + esc(GRADES[o.slot.split('|')[0]]) + ' T' + esc(o.slot.split('|')[1]) : ''}</span>`;
    };
    const rows = pool.map((u) => `<label data-row data-s="${esc([studentName(u), u.username, u.email].join(' ').toLowerCase())}" class="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <input type="checkbox" name="sid" value="${esc(u.id)}" ${mine.has(String(u.id)) ? 'checked' : ''} class="rounded">
      <div class="min-w-0 flex-1"><p class="text-sm font-semibold text-slate-900 dark:text-white truncate">${esc(studentName(u))}</p><p class="text-xs text-slate-500 dark:text-slate-400 truncate">${esc(u.username || u.email || '')}</p></div>
      ${tag(owner[String(u.id)])}</label>`).join('');

    const el = modal('Siswa: ' + GRADES[grade] + ' Tahap ' + tahap, `
      <p class="text-xs text-slate-500 dark:text-slate-400">Instruktur: <b>${esc(p.name)}</b>. Centang siswa jenjang ${esc(GRADES[grade])} yang ada di ${esc(tahapLabel(grade, tahap))}. Siswa yang sudah ada di tahap atau instruktur lain akan dipindahkan ke sini.</p>
      <input type="search" data-q placeholder="Cari nama, username, atau email" autocomplete="off" class="${INPUT}">
      <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"><span data-n></span><span data-shown></span></div>
      <div data-list class="max-h-[46vh] overflow-y-auto space-y-1 rounded-xl border border-slate-200 dark:border-slate-700 p-1.5">${rows || `<p class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Belum ada siswa di jenjang ${esc(GRADES[grade])}.</p>`}</div>`,
      async (f, form) => {
        const byId = new Map(pool.map((u) => [String(u.id), u.id]));
        const picked = Array.from(form.querySelectorAll('[name=sid]:checked')).map((c) => byId.get(c.value));
        const pick = new Set(picked.map(String));
        const updates = new Map();
        const work = (x) => { if (!updates.has(x.id)) updates.set(x.id, { id: x.id, assignments: clone(x.assignments), studentIds: allStudentIds(x) }); return updates.get(x.id); };

        // instruktur lain kehilangan siswa yang dipindah ke sini
        S.people.forEach((x) => {
          if (String(x.id) === String(p.id) || !allStudentIds(x).some((id) => pick.has(String(id)))) return;
          const w = work(x);
          w.assignments.forEach((a) => { a.studentIds = a.studentIds.filter((id) => !pick.has(String(id))); });
          w.studentIds = w.studentIds.filter((id) => !pick.has(String(id)));
        });
        // instruktur ini
        const w = work(p);
        const kept = slot.studentIds.filter((id) => !byId.has(String(id)));           // siswa di luar daftar termuat tidak ikut terhapus
        const released = new Set(slot.studentIds.filter((id) => byId.has(String(id)) && !pick.has(String(id))).map(String));
        w.assignments.forEach((a) => { a.studentIds = a.studentIds.filter((id) => !pick.has(String(id))); });
        w.assignments.find((a) => a.grade === grade && a.tahap === tahap).studentIds = picked.concat(kept);
        w.studentIds = uniq(w.studentIds.filter((id) => !released.has(String(id))).concat(picked));

        // simpan instruktur lain dulu, instruktur ini terakhir (jika gagal di tengah, tidak ada siswa ganda)
        for (const [id, body] of updates) { if (String(id) !== String(p.id)) await store.save(body); }
        await store.save(updates.get(p.id));
        toast('Siswa ' + GRADES[grade] + ' Tahap ' + tahap + ' disimpan (' + picked.length + ' siswa).');
        await load();
      }, true, 'Simpan siswa');
    const list = el.querySelector('[data-list]');
    const count = () => { el.querySelector('[data-n]').textContent = list.querySelectorAll('[name=sid]:checked').length + ' siswa dipilih'; };
    const apply = () => {
      const q = el.querySelector('[data-q]').value.trim().toLowerCase();
      let shown = 0;
      list.querySelectorAll('[data-row]').forEach((r) => { const ok = !q || r.dataset.s.includes(q); r.style.display = ok ? '' : 'none'; if (ok) shown++; });
      el.querySelector('[data-shown]').textContent = shown + ' ditampilkan';
    };
    el.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) apply(); });
    el.addEventListener('change', (e) => { if (e.target.matches('[name=sid]')) count(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-q]')) e.preventDefault(); });
    count(); apply();
  }

  // ---------- hapus ----------
  async function remove(p) {
    const n = allStudentIds(p).length;
    const ok = await window.dcConfirm({
      title: 'Hapus instruktur?',
      message: 'Akun ini tidak akan bisa login lagi.' + (n ? ' ' + n + ' siswa binaannya menjadi belum punya instruktur.' : ''),
      detail: p.name + ' (' + p.email + ')',
      confirmText: 'Hapus', tone: 'danger'
    });
    if (!ok) return;
    try {
      await store.remove(p.id);
      toast('Instruktur dihapus.');
      if (String(S.detail) === String(p.id)) S.detail = null;
      await load();
    } catch (ex) { toast(ex.message || 'Gagal menghapus instruktur.', 'error'); }
  }

  // ---------- event ----------
  view.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]'); if (!a || a.disabled) return;
    const act = a.dataset.a;
    const p = S.people.find((x) => String(x.id) === a.dataset.id);
    if (act === 'new') return personForm();
    if (act === 'back') { S.detail = null; return draw(); }
    if (act === 'detail' && p) { S.detail = p.id; draw(); window.scrollTo({ top: 0 }); return; }
    if (act === 'edit' && p) return personForm(p);
    if (act === 'del' && p) return remove(p);
    if (act === 'students' && p) return studentsForm(p, a.dataset.slot);
  });
  view.addEventListener('input', (e) => {
    if (e.target.id !== 'inQ') return;
    S.q = e.target.value;
    const pos = e.target.selectionStart;
    drawList();
    const q = $('#inQ'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (_) {} }
  });
  view.addEventListener('change', (e) => { if (e.target.id === 'inG') { S.g = e.target.value; drawList(); } });

  window.addEventListener('dc:view', (e) => { if (e.detail === 'instruktur') load(); });
  if (!view.classList.contains('hidden')) load();
})();
