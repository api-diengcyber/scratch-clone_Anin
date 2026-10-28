/* Manajemen Siswa
   Halaman penuh untuk mengelola akun siswa: daftar + filter + pencarian, tampilan tabel/kartu,
   aksi massal, panel detail (ringkasan, progres, akun), tambah/edit, reset password,
   suspend, cabut sesi, hapus, impor CSV, dan ekspor CSV.
   Memakai DCAdminApi (admin-api.js) dan helper global dari admin.js. */
(function () {
  'use strict';

  const view = document.getElementById('view-siswa');
  if (!view) return;
  // MODE DATA: false = data contoh di browser (localStorage), true = backend (DCAdminApi).
  // Bentuk respons LocalStore sengaja sama dengan API asli, jadi cukup ubah flag ini setelah backend siap.
  const USE_BACKEND = false;
  const api = () => (USE_BACKEND ? window.DCAdminApi : LocalStore);
  const esc = escHtml; // helper global dari admin.js
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));


  // ---------- PENYIMPANAN LOKAL (sementara, tanpa backend) ----------
  const LOCAL_KEY = 'dc-siswa-data';
  const LocalStore = (function () {
    const NAMES = ['Alvaro Kenzo', 'Dina Oktavia', 'Fadly Naufal', 'Ayu Lestari', 'Raditya Pratama', 'Bima Saputra', 'Citra Maharani', 'Dimas Prakoso', 'Eka Wulandari', 'Farhan Hidayat', 'Gita Permata', 'Hafidz Ramadhan', 'Indah Safitri', 'Joko Santoso', 'Kirana Putri', 'Lukman Hakim', 'Mira Anggraini', 'Naufal Rizky', 'Olivia Handayani', 'Putra Wijaya', 'Qonita Azzahra', 'Rangga Mahendra', 'Salsabila Nur', 'Tegar Firmansyah', 'Umi Kalsum', 'Vino Aditya', 'Wulan Sari', 'Yoga Pratama'];
    const TASKS = ['Tipe Data String, Int & Float', 'Percabangan If-Else', 'Perulangan For & While', 'Fungsi dan Return', 'List dan Dictionary', 'Class dan Object', 'Struktur HTML Dasar', 'Flexbox Layout', 'CSS Grid', 'Responsive Design', 'Form dan Validasi', 'DOM Events', 'Robot Menuju Bintang', 'Blok Ulangi', 'Logika IF-ELSE Blockly', 'Game Loop Pygame', 'Collision Detection', 'Deploy ke GitHub Pages', 'Hitung Luas Persegi', 'Cek Bilangan Prima'];
    const GRADES = [['SMP'], ['SMK'], ['SD'], ['SMP', 'SMK'], ['SMP'], ['SD'], ['SMK'], [], ['SMP'], ['SMK']];
    const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();

    function seed() {
      const users = NAMES.map((name, i) => {
        const done = (i * 7 + 3) % 21;
        const slug = name.toLowerCase().replace(/[^a-z ]/g, '').replace(/ /g, '.');
        return {
          id: i + 1, username: slug, email: slug + '@diengcyber.sch.id', full_name: name,
          status: i === 5 || i === 17 ? 'suspended' : 'active', allowedGrades: GRADES[i % GRADES.length].slice(),
          completed_tasks: done, points_total: done * 10 + (i % 5) * 5, item_count: i % 4,
          created_at: ago(24 * (60 - i)), last_login_at: i % 6 === 0 ? '' : ago(1 + ((i * 13) % 200)), suspend_reason: i === 5 ? 'Contoh: pelanggaran tata tertib lab' : '',
        };
      });
      return { users, nextId: users.length + 1 };
    }

    let db = (function () {
      try { const r = JSON.parse(localStorage.getItem(LOCAL_KEY)); if (r && Array.isArray(r.users)) return r; } catch (_) {}
      return seed();
    })();
    const save = () => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(db)); } catch (_) {} };
    const wait = () => new Promise((r) => setTimeout(r, 90));
    const fail = (msg, status) => { const e = new Error(msg); e.status = status || 400; throw e; };
    const find = (id) => db.users.find((u) => Number(u.id) === Number(id)) || fail('Siswa tidak ditemukan.', 404);
    const live = (u) => u.status !== 'deleted';
    function tempPassword() {
      const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
      const buf = new Uint32Array(10); crypto.getRandomValues(buf);
      return Array.from(buf, (n) => abc[n % abc.length]).join('');
    }
    const clean = (g) => (Array.isArray(g) ? g.filter((x) => GRADE_KEYS.includes(x)) : []);
    const mailTaken = (email, exceptId) => db.users.some((u) => live(u) && u.email.toLowerCase() === email.toLowerCase() && Number(u.id) !== Number(exceptId));

    return {
      async stats() {
        await wait();
        const all = db.users, on = all.filter(live);
        const g = (k) => on.filter((u) => u.allowedGrades.includes(k)).length;
        return { ok: true, students: { total: on.length, active: on.filter((u) => u.status === 'active').length, suspended: on.filter((u) => u.status === 'suspended').length, deleted: all.length - on.length },
          grades: { sd: g('SD'), smp: g('SMP'), smk: g('SMK'), unassigned: on.filter((u) => !u.allowedGrades.length).length },
          content: { tasks: TASKS.length, modules: 0, curriculumPaths: 0, materials: 0 }, activity: {} };
      },
      async users(p = {}) {
        await wait();
        let list = db.users.filter((u) => (p.status ? u.status === p.status : live(u)));
        if (p.grade) list = list.filter((u) => u.allowedGrades.includes(p.grade));
        if (p.search) { const q = String(p.search).toLowerCase(); list = list.filter((u) => (u.full_name + ' ' + u.email + ' ' + u.username).toLowerCase().includes(q)); }
        list = list.slice().sort((a, b) => b.id - a.id);
        const limit = Math.max(1, Number(p.limit) || 10), pages = Math.max(1, Math.ceil(list.length / limit));
        const page = Math.min(Math.max(1, Number(p.page) || 1), pages);
        return { ok: true, users: list.slice((page - 1) * limit, page * limit).map((u) => ({ ...u })), total: list.length, page, pages, limit, stats: { tasks_total: TASKS.length } };
      },
      async user(id) {
        await wait();
        const u = find(id);
        const rows = TASKS.map((title, i) => ({ task_id: 't' + (i + 1), title })).slice(0, Math.min(TASKS.length, u.completed_tasks + 2))
          .map((r, i) => (i < u.completed_tasks ? { ...r, completed_at: ago(6 + i * 20 + (u.id % 5)), points: 10 } : { ...r, completed_at: null }));
        return { ok: true, user: { ...u }, progress: { completed: u.completed_tasks }, points: { total: u.points_total }, progressRows: rows };
      },
      async createUser(b) {
        await wait();
        const fullName = String(b.fullName || '').trim(), email = String(b.email || '').trim().toLowerCase();
        if (!fullName || !email) fail('Nama dan email wajib diisi.');
        if (mailTaken(email)) fail('Email sudah terdaftar.', 409);
        let username = email.split('@')[0].replace(/[^a-z0-9._-]/g, '') || 'siswa', n = 1, base = username;
        while (db.users.some((u) => u.username === username)) username = base + (++n);
        const password = tempPassword();
        db.users.push({ id: db.nextId++, username, email, full_name: fullName, status: 'active', allowedGrades: clean(b.allowedGrades), completed_tasks: 0, points_total: 0, item_count: 0, created_at: new Date().toISOString(), last_login_at: '', suspend_reason: '' });
        save();
        return { ok: true, username, temporaryPassword: password };
      },
      async updateUser(id, b) {
        await wait();
        const u = find(id);
        if (b.email && mailTaken(String(b.email).trim(), id)) fail('Email sudah dipakai siswa lain.', 409);
        if (b.fullName) u.full_name = String(b.fullName).trim();
        if (b.email) u.email = String(b.email).trim().toLowerCase();
        if (b.allowedGrades) u.allowedGrades = clean(b.allowedGrades);
        save(); return { ok: true };
      },
      async resetPassword(id) { await wait(); const u = find(id); return { ok: true, username: u.username, temporaryPassword: tempPassword() }; },
      async suspendUser(id, b = {}) {
        await wait();
        const u = find(id);
        u.status = b.suspended === false ? 'active' : 'suspended';
        u.suspend_reason = u.status === 'suspended' ? String(b.reason || '') : '';
        save(); return { ok: true };
      },
      async revokeSessions(id) { await wait(); find(id); return { ok: true }; },
      async deleteUser(id) { await wait(); find(id).status = 'deleted'; save(); return { ok: true }; },
      reset() { db = seed(); save(); },
    };
  })();

  // ---------- KONFIGURASI ----------
  // Bentuk body untuk endpoint suspend. Ubah di sini kalau backend memakai nama field lain.
  const suspendBody = (on, reason) => (on ? { suspended: true, reason: reason || '' } : { suspended: false });

  const PREF_KEY = 'dc-siswa-pref';
  const GRADE_KEYS = ['SD', 'SMP', 'SMK'];
  const STATUS_OPTIONS = [['', 'Semua status'], ['active', 'Aktif'], ['suspended', 'Suspend'], ['deleted', 'Dihapus']];
  const SORT_OPTIONS = [['default', 'Urutan server'], ['name', 'Nama A–Z'], ['progress', 'Progres tertinggi'], ['points', 'Poin tertinggi']];
  const LIMITS = [10, 25, 50, 100];

  const INPUT = 'w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20';
  const LBL = 'block font-mono font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider';
  const BTN_PRI = 'flex items-center gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-md shadow-sky-600/20 active:scale-95 transition disabled:opacity-50 disabled:pointer-events-none';
  const BTN_SEC = 'px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold shadow-xs flex items-center gap-2 transition disabled:opacity-50 disabled:pointer-events-none';
  const CARD = 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-card';

  const TONE = {
    sky: 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10',
    amber: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10',
    emerald: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
    rose: 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10',
    slate: 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800',
  };
  const STATUS_PILL = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    suspended: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    deleted: 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  };

  // ---------- STATE ----------
  const S = {
    page: 1, limit: 10, pages: 1, total: 0,
    search: '', grade: '', status: '', sort: 'default', mode: 'table',
    users: [], selected: new Set(), loading: false, error: '',
    stats: null, totalTasks: 0,
    drawer: { id: null, tab: 'ringkasan', data: null, loading: false },
    busy: false, importRows: [], importRunning: false, importStop: false, formUser: null,
  };
  let listReq = 0, detailReq = 0, started = false, searchTimer = null;

  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if (p.mode === 'cards' || p.mode === 'table') S.mode = p.mode;
    if (LIMITS.includes(p.limit)) S.limit = p.limit;
  } catch (_) {}
  const savePref = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ mode: S.mode, limit: S.limit })); } catch (_) {} };

  // ---------- HELPER ----------
  const nameOf = (u) => u.full_name || u.username || ('Siswa #' + u.id);
  const nisOf = (u) => '#DC-' + String(u.id).padStart(4, '0');
  const lastSeen = (u) => u.last_login_at || u.last_seen_at || u.last_active_at || u.last_login || '';
  const pctOf = (done) => (S.totalTasks ? Math.min(100, Math.round((Number(done || 0) / S.totalTasks) * 100)) : 0);
  const metaOf = (u) => GRADE_META[primaryGrade(u)] || GRADE_META.ALL;
  const findUser = (id) => S.users.find((u) => Number(u.id) === Number(id)) || (S.drawer.data && S.drawer.data.user && Number(S.drawer.data.user.id) === Number(id) ? S.drawer.data.user : null);
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const isOpen = (node) => node && !node.classList.contains('hidden');

  function gradeBadges(u) {
    const gs = gradeOrder(u.allowedGrades);
    if (!gs.length) return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border font-mono ' + GRADE_META.ALL.badge + '">Belum diatur</span>';
    return gs.map((g) => '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border font-mono ' + GRADE_META[g].badge + '"><i class="' + GRADE_META[g].icon + ' text-[10px]"></i>' + esc(GRADE_META[g].label) + '</span>').join(' ');
  }
  function statusPill(status) {
    const m = statusMeta(status);
    return '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ' + (STATUS_PILL[status] || STATUS_PILL.active) + '"><i class="' + m.icon + ' text-[10px]"></i>' + esc(m.text) + '</span>';
  }
  function avatar(u, size) {
    const m = metaOf(u);
    return '<div class="' + (size || 'w-9 h-9 text-xs') + ' rounded-xl ' + m.avatar + ' font-bold flex items-center justify-center border shrink-0">' + esc(initials(nameOf(u))) + '</div>';
  }
  function iconBtn(act, id, icon, title, tone) {
    return '<button type="button" data-sw="' + act + '" data-id="' + id + '" title="' + esc(title) + '" aria-label="' + esc(title) + '" class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-xs transition ' + (TONE[tone] || TONE.slate) + '"><i class="' + icon + '"></i></button>';
  }
  function rowActions(u) {
    const id = Number(u.id);
    let h = iconBtn('view', id, 'fa-solid fa-eye', 'Lihat detail', 'sky');
    if (u.status === 'deleted') return h;
    h += iconBtn('edit', id, 'fa-solid fa-pen', 'Edit data', 'slate');
    h += iconBtn('reset', id, 'fa-solid fa-key', 'Reset password', 'amber');
    h += u.status === 'suspended'
      ? iconBtn('unsuspend', id, 'fa-solid fa-circle-play', 'Aktifkan kembali', 'emerald')
      : iconBtn('suspend', id, 'fa-solid fa-circle-pause', 'Suspend akun', 'amber');
    h += iconBtn('delete', id, 'fa-solid fa-trash-can', 'Hapus siswa', 'rose');
    return h;
  }
  function progressBar(u) {
    const m = metaOf(u);
    const done = Number(u.completed_tasks || 0), pct = pctOf(done);
    return '<div class="w-full min-w-[7rem]"><div class="flex justify-between text-xs mb-1"><span class="font-semibold text-slate-700 dark:text-slate-300">' + pct + '%</span>' +
      '<span class="text-slate-500 dark:text-slate-400 font-mono text-[11px]">' + fmtNum(done) + '/' + fmtNum(S.totalTasks) + '</span></div>' +
      '<div class="w-full bg-slate-200/80 dark:bg-slate-800 rounded-full h-1.5"><div class="' + m.bar + ' h-1.5 rounded-full transition-all" style="width:' + pct + '%"></div></div></div>';
  }

  // ---------- KERANGKA HALAMAN ----------
  function buildShell() {
    view.innerHTML = `
      <div class="page-hero flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 text-xs font-mono text-slate-400 dark:text-slate-500 mb-1">
            <span>Portal Admin</span><span>/</span>
            <span class="text-sky-600 dark:text-sky-400 font-medium">Siswa &amp; Kelas Coding</span>
          </div>
          <h1 class="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2.5">
            Manajemen Siswa
            <span id="swCount" class="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border border-sky-300/60 dark:border-sky-500/30">0 Siswa</span>
          </h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">Kelola akun, jenjang, progres belajar, dan keamanan akun siswa dalam satu tempat.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <button type="button" data-sw="refresh" class="${BTN_SEC}" title="Muat ulang dari server"><i class="fa-solid fa-arrows-rotate text-sky-600 dark:text-sky-400"></i><span class="hidden sm:inline">Muat Ulang</span></button>
          <button type="button" data-sw="export" class="${BTN_SEC}" title="Ekspor daftar sesuai filter ke CSV"><i class="fa-solid fa-file-arrow-down text-emerald-600 dark:text-emerald-400"></i><span class="hidden sm:inline">Ekspor CSV</span></button>
          <button type="button" data-sw="import" class="${BTN_SEC}"><i class="fa-solid fa-file-import text-indigo-600 dark:text-indigo-400"></i><span>Impor CSV</span></button>
          <button type="button" data-sw="new" class="${BTN_PRI}"><i class="fa-solid fa-user-plus text-xs"></i><span>Tambah Siswa</span></button>
        </div>
      </div>

      ${USE_BACKEND ? '' : `<div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
        <span class="font-semibold"><i class="fa-solid fa-flask mr-1.5"></i>Mode data contoh</span>
        <span class="text-amber-700/90 dark:text-amber-300/80">Data siswa tersimpan di browser ini dan belum terhubung ke backend.</span>
        <button type="button" data-sw="reset-local" class="underline font-semibold hover:text-amber-950 dark:hover:text-amber-100 sm:ml-auto">Kembalikan data contoh</button>
      </div>`}

      <div id="swStats" class="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4"></div>

      <div id="swDist" class="${CARD} p-4 sm:p-5"></div>

      <div class="${CARD} p-2.5 flex flex-col gap-2.5">
        <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
          <div id="swFilter" class="flex items-center gap-1.5 overflow-x-auto p-0.5"></div>
          <div class="flex flex-wrap items-center gap-2 px-1">
            <div class="relative flex-1 min-w-[12rem] xl:w-64">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 text-xs"><i class="fa-solid fa-magnifying-glass"></i></span>
              <input id="swSearch" type="search" placeholder="Cari nama, email, atau username..." class="w-full bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs rounded-xl pl-8 pr-3 py-2 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500">
            </div>
            <select id="swStatus" aria-label="Filter status" class="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500">${STATUS_OPTIONS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
            <select id="swSort" aria-label="Urutkan" class="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500">${SORT_OPTIONS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
            <div class="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-0.5" role="group" aria-label="Mode tampilan">
              <button type="button" data-sw-mode="table" title="Tampilan tabel" class="w-8 h-8 rounded-lg text-xs transition"><i class="fa-solid fa-table-list"></i></button>
              <button type="button" data-sw-mode="cards" title="Tampilan kartu" class="w-8 h-8 rounded-lg text-xs transition"><i class="fa-solid fa-table-cells-large"></i></button>
            </div>
          </div>
        </div>
      </div>

      <div id="swBulk" class="hidden sticky top-[4.5rem] z-20 rounded-2xl border border-sky-200 dark:border-sky-500/30 bg-sky-50/95 dark:bg-slate-900/95 backdrop-blur px-4 py-2.5 shadow-soft-hover flex flex-wrap items-center gap-2 text-xs"></div>

      <div id="swList" class="${CARD} overflow-hidden"></div>

      <div id="swFoot" class="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400"></div>`;

    $('#swStatus').value = S.status;
    $('#swSort').value = S.sort;
    renderMode();
  }

  // ---------- RENDER: STATISTIK, FILTER ----------
  function renderStats() {
    const st = S.stats || {};
    const stu = st.students || {}, gr = st.grades || {};
    const cards = [
      ['', 'Total Siswa', stu.total, 'Semua akun siswa terdaftar', 'fa-solid fa-users', 'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400'],
      ['active', 'Siswa Aktif', stu.active, 'Dapat login dan belajar', 'fa-solid fa-user-check', 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'],
      ['suspended', 'Disuspend', stu.suspended, 'Akses sementara dihentikan', 'fa-solid fa-user-lock', 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'],
      ['', 'Belum Ada Jenjang', gr.unassigned, 'Perlu diatur jenjangnya', 'fa-solid fa-user-tag', 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'],
    ];
    $('#swStats').innerHTML = cards.map(([status, label, val, note, icon, tone], i) => {
      const clickable = i <= 2;
      const active = (i === 1 || i === 2) && S.status === status;
      return `<button type="button" ${clickable ? `data-sw-stat="${status}"` : 'tabindex="-1"'} class="text-left ${CARD} p-4 sm:p-5 hover:shadow-soft-hover transition-all ${active ? 'ring-2 ring-sky-500/40' : ''} ${clickable ? '' : 'cursor-default'}">
        <div class="flex items-center justify-between mb-3">
          <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-mono tracking-wider uppercase">${label}</span>
          <div class="w-9 h-9 rounded-xl ${tone} flex items-center justify-center text-sm"><i class="${icon}"></i></div>
        </div>
        <span class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">${S.stats ? fmtNum(val) : '—'}</span>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1.5">${note}</p>
      </button>`;
    }).join('');

    const sd = Number(gr.sd || 0), smp = Number(gr.smp || 0), smk = Number(gr.smk || 0), un = Number(gr.unassigned || 0);
    const sum = sd + smp + smk + un;
    const seg = (n, cls, label) => n && sum ? `<div class="${cls} h-full transition-all" style="width:${(n / sum) * 100}%" title="${label}: ${fmtNum(n)}"></div>` : '';
    const leg = (n, cls, label) => `<span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full ${cls}"></span><span class="font-semibold text-slate-700 dark:text-slate-300">${label}</span><span class="font-mono text-slate-500 dark:text-slate-400">${S.stats ? fmtNum(n) : '—'}${sum ? ' · ' + Math.round((n / sum) * 100) + '%' : ''}</span></span>`;
    $('#swDist').innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><i class="fa-solid fa-chart-simple text-indigo-600 dark:text-indigo-400"></i>Komposisi Jenjang</h3>
        <span class="text-[11px] font-mono text-slate-400">${S.stats ? fmtNum(sum) + ' siswa' : ''}</span>
      </div>
      <div class="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">${seg(sd, 'bg-amber-500', 'SD')}${seg(smp, 'bg-sky-500', 'SMP')}${seg(smk, 'bg-indigo-600', 'SMA/SMK')}${seg(un, 'bg-slate-400', 'Belum diatur')}</div>
      <div class="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-xs">${leg(sd, 'bg-amber-500', 'SD')}${leg(smp, 'bg-sky-500', 'SMP')}${leg(smk, 'bg-indigo-600', 'SMA/SMK')}${leg(un, 'bg-slate-400', 'Belum diatur')}</div>`;
  }

    function renderFilter() {
    const gr = (S.stats && S.stats.grades) || {};
    const total = S.stats && S.stats.students ? S.stats.students.total : null;
    const items = [['', 'Semua Jenjang', total], ['SD', 'SD', gr.sd], ['SMP', 'SMP', gr.smp], ['SMK', 'SMA / SMK', gr.smk]];
    const base = 'shrink-0 w-36 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center justify-center gap-2 transition ';
    const on = base + 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-600/25';
    const off = base + 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60';
    $('#swFilter').innerHTML = items.map(([k, label, n]) => {
      const active = S.grade === k;
      const badge = n == null ? '' : `<span class="min-w-[1.25rem] px-1.5 py-0.5 rounded-md text-[10px] leading-none font-mono font-bold text-center ${active ? 'bg-white/20 text-white' : 'bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}">${fmtNum(n)}</span>`;
      return `<button type="button" data-sw-grade="${k}" class="${active ? on : off}">${esc(label)}${badge}</button>`;
    }).join('');
  }

  function renderMode() {
    $$('[data-sw-mode]').forEach((b) => {
      const active = b.dataset.swMode === S.mode;
      b.className = 'w-8 h-8 rounded-lg text-xs transition ' + (active ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100');
    });
  }

  // ---------- RENDER: DAFTAR ----------
  function sortedUsers() {
    const list = S.users.slice();
    if (S.sort === 'name') list.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'id'));
    else if (S.sort === 'progress') list.sort((a, b) => Number(b.completed_tasks || 0) - Number(a.completed_tasks || 0));
    else if (S.sort === 'points') list.sort((a, b) => Number(b.points_total || 0) - Number(a.points_total || 0));
    return list;
  }

  function skeleton() {
    const row = '<div class="flex items-center gap-4 px-5 py-4 animate-pulse"><div class="w-4 h-4 rounded bg-slate-200 dark:bg-slate-800"></div><div class="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800"></div><div class="flex-1 space-y-2"><div class="h-3 w-40 rounded bg-slate-200 dark:bg-slate-800"></div><div class="h-2.5 w-56 max-w-full rounded bg-slate-100 dark:bg-slate-800/70"></div></div><div class="hidden md:block h-3 w-24 rounded bg-slate-200 dark:bg-slate-800"></div><div class="hidden md:block h-3 w-28 rounded bg-slate-200 dark:bg-slate-800"></div></div>';
    return '<div class="divide-y divide-slate-100 dark:divide-slate-800">' + row.repeat(Math.min(S.limit, 6)) + '</div>';
  }

  function emptyState() {
    const filtered = S.search || S.grade || S.status;
    return `<div class="px-6 py-14 text-center">
      <div class="w-14 h-14 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-xl mb-3"><i class="fa-solid ${filtered ? 'fa-user-slash' : 'fa-user-graduate'}"></i></div>
      <h3 class="text-sm font-bold text-slate-900 dark:text-white">${filtered ? 'Tidak ada siswa yang cocok' : 'Belum ada siswa'}</h3>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">${filtered ? 'Coba ubah kata kunci atau filter yang sedang dipakai.' : 'Tambahkan siswa satu per satu atau impor banyak siswa sekaligus dari file CSV.'}</p>
      <div class="flex items-center justify-center gap-2 mt-4">
        ${filtered ? '<button type="button" data-sw="clear-filter" class="' + BTN_SEC + '"><i class="fa-solid fa-filter-circle-xmark"></i>Reset filter</button>' : '<button type="button" data-sw="import" class="' + BTN_SEC + '"><i class="fa-solid fa-file-import"></i>Impor CSV</button>'}
        <button type="button" data-sw="new" class="${BTN_PRI}"><i class="fa-solid fa-user-plus"></i>Tambah Siswa</button>
      </div></div>`;
  }

  function errorState() {
    return `<div class="px-6 py-12 text-center">
      <div class="w-14 h-14 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 flex items-center justify-center text-xl mb-3"><i class="fa-solid fa-triangle-exclamation"></i></div>
      <h3 class="text-sm font-bold text-slate-900 dark:text-white">Gagal memuat data siswa</h3>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${esc(S.error)}</p>
      <button type="button" data-sw="refresh" class="${BTN_SEC} mx-auto mt-4"><i class="fa-solid fa-arrows-rotate"></i>Coba lagi</button></div>`;
  }

  function tableRow(u) {
    const id = Number(u.id);
    const seen = lastSeen(u);
    const dim = u.status === 'active' ? '' : 'opacity-70';
    return `<tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition ${S.selected.has(id) ? 'bg-sky-50/60 dark:bg-sky-500/5' : ''}">
      <td class="pl-5 pr-2 py-3.5 w-8"><input type="checkbox" data-sw-check="${id}" ${S.selected.has(id) ? 'checked' : ''} aria-label="Pilih ${esc(nameOf(u))}" class="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500/40 cursor-pointer"></td>
      <td class="px-3 py-3.5 ${dim}">
        <button type="button" data-sw="view" data-id="${id}" class="flex items-center gap-3 text-left group">
          ${avatar(u)}
          <span class="min-w-0"><span class="block font-bold text-slate-900 dark:text-white text-sm truncate max-w-[14rem] group-hover:text-sky-600 dark:group-hover:text-sky-400 transition">${esc(nameOf(u))}</span>
          <span class="block text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-[14rem]">${esc(u.email || u.username || '-')}</span></span>
        </button>
      </td>
      <td class="px-3 py-3.5 ${dim}"><div class="flex flex-wrap gap-1">${gradeBadges(u)}</div></td>
      <td class="px-3 py-3.5">${statusPill(u.status)}</td>
      <td class="px-3 py-3.5 w-44 ${dim}">${progressBar(u)}</td>
      <td class="px-3 py-3.5 hidden lg:table-cell ${dim}"><span class="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">${fmtNum(u.points_total)}</span><span class="block text-[11px] text-slate-400">${fmtNum(u.item_count)} item</span></td>
      <td class="px-3 py-3.5 hidden xl:table-cell text-xs text-slate-500 dark:text-slate-400 font-mono ${dim}">${seen ? esc(relativeTime(seen)) : '—'}</td>
      <td class="pl-3 pr-4 py-3.5 text-right whitespace-nowrap">${rowActions(u)}</td>
    </tr>`;
  }

  function tableHtml(list) {
    const all = list.length && list.every((u) => S.selected.has(Number(u.id)));
    const some = list.some((u) => S.selected.has(Number(u.id)));
    return `<div class="overflow-x-auto"><table class="w-full text-left text-sm text-slate-700 dark:text-slate-200">
      <thead class="bg-slate-50 dark:bg-slate-950/50 text-[11px] font-mono uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
        <tr>
          <th class="pl-5 pr-2 py-3.5 w-8"><input type="checkbox" id="swCheckAll" ${all ? 'checked' : ''} data-some="${some && !all ? '1' : ''}" aria-label="Pilih semua di halaman ini" class="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500/40 cursor-pointer"></th>
          <th class="px-3 py-3.5 font-semibold">Siswa</th><th class="px-3 py-3.5 font-semibold">Jenjang</th><th class="px-3 py-3.5 font-semibold">Status</th>
          <th class="px-3 py-3.5 font-semibold">Progres</th><th class="px-3 py-3.5 font-semibold hidden lg:table-cell">Poin</th>
          <th class="px-3 py-3.5 font-semibold hidden xl:table-cell">Terakhir Aktif</th><th class="pl-3 pr-4 py-3.5 font-semibold text-right">Aksi</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">${list.map(tableRow).join('')}</tbody></table></div>`;
  }

  function cardHtml(u) {
    const id = Number(u.id);
    const seen = lastSeen(u);
    return `<div class="relative rounded-2xl border ${S.selected.has(id) ? 'border-sky-400 dark:border-sky-500/60 bg-sky-50/50 dark:bg-sky-500/5' : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900'} p-4 hover:shadow-card-hover transition-all ${u.status === 'active' ? '' : 'opacity-80'}">
      <input type="checkbox" data-sw-check="${id}" ${S.selected.has(id) ? 'checked' : ''} aria-label="Pilih ${esc(nameOf(u))}" class="absolute top-3.5 right-3.5 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500/40 cursor-pointer">
      <button type="button" data-sw="view" data-id="${id}" class="flex items-center gap-3 text-left w-full pr-7 group">
        ${avatar(u, 'w-11 h-11 text-sm')}
        <span class="min-w-0"><span class="block font-bold text-slate-900 dark:text-white text-sm truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition">${esc(nameOf(u))}</span>
        <span class="block text-xs text-slate-500 dark:text-slate-400 font-mono truncate">${esc(u.email || u.username || '-')}</span></span>
      </button>
      <div class="flex flex-wrap items-center gap-1.5 mt-3">${gradeBadges(u)}${statusPill(u.status)}</div>
      <div class="mt-3.5">${progressBar(u)}</div>
      <div class="flex items-center justify-between mt-3 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
        <span><i class="fa-solid fa-star text-amber-500 mr-1"></i>${fmtNum(u.points_total)} poin</span><span>${seen ? esc(relativeTime(seen)) : nisOf(u)}</span>
      </div>
      <div class="flex items-center justify-end gap-0.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">${rowActions(u)}</div>
    </div>`;
  }

  function renderList() {
    const box = $('#swList');
    if (!box) return;
    const list = sortedUsers();
    const asCards = S.mode === 'cards' && list.length > 0 && !(S.error && !S.users.length);
    const dim = S.loading && S.users.length ? ' opacity-60 pointer-events-none' : '';
    box.className = (asCards ? '' : CARD + ' overflow-hidden') + dim;
    if (S.loading && !S.users.length) box.innerHTML = skeleton();
    else if (S.error && !S.users.length) box.innerHTML = errorState();
    else if (!list.length) box.innerHTML = emptyState();
    else {
      box.innerHTML = asCards
        ? '<div class="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3.5">' + list.map(cardHtml).join('') + '</div>'
        : tableHtml(list);
      const ca = $('#swCheckAll');
      if (ca && ca.dataset.some) ca.indeterminate = true;
    }
    renderFoot(); renderBulk();
  }

  function pageWindow(p, n) {
    if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
    const out = [1];
    if (p > 3) out.push('…');
    for (let i = Math.max(2, p - 1); i <= Math.min(n - 1, p + 1); i++) out.push(i);
    if (p < n - 2) out.push('…');
    out.push(n);
    return out;
  }

  function renderFoot() {
    const foot = $('#swFoot');
    if (!foot) return;
    const from = S.total ? (S.page - 1) * S.limit + 1 : 0;
    const to = Math.min(S.total, S.page * S.limit);
    const btn = 'min-w-[2rem] h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono';
    foot.innerHTML = `
      <div class="flex items-center gap-3">
        <span>${S.total ? `Menampilkan ${fmtNum(from)}–${fmtNum(to)} dari ${fmtNum(S.total)} siswa` : 'Belum ada data'}</span>
        <label class="flex items-center gap-1.5">Per halaman
          <select id="swLimit" class="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500">${LIMITS.map((n) => `<option value="${n}" ${n === S.limit ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </label>
      </div>
      <div class="flex items-center gap-1">
        <button type="button" data-sw-page="${S.page - 1}" class="${btn}" ${S.page <= 1 ? 'disabled' : ''} aria-label="Halaman sebelumnya"><i class="fa-solid fa-chevron-left text-[10px]"></i></button>
        ${pageWindow(S.page, S.pages).map((p) => p === '…' ? '<span class="px-1 text-slate-400">…</span>' : `<button type="button" data-sw-page="${p}" class="${p === S.page ? 'min-w-[2rem] h-8 px-2 rounded-lg bg-sky-600 text-white font-bold text-xs font-mono' : btn}">${p}</button>`).join('')}
        <button type="button" data-sw-page="${S.page + 1}" class="${btn}" ${S.page >= S.pages ? 'disabled' : ''} aria-label="Halaman berikutnya"><i class="fa-solid fa-chevron-right text-[10px]"></i></button>
      </div>`;
    setText('swCount', fmtNum(S.stats && S.stats.students ? S.stats.students.total : S.total) + ' Siswa');
  }

  function renderBulk() {
    const bar = $('#swBulk');
    if (!bar) return;
    const n = S.selected.size;
    bar.classList.toggle('hidden', n === 0);
    if (!n) return;
    const b = (act, icon, label, tone) => `<button type="button" data-sw-bulk="${act}" ${S.busy ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition disabled:opacity-50 ${tone}"><i class="${icon}"></i><span>${label}</span></button>`;
    bar.innerHTML = `<span class="font-bold text-sky-700 dark:text-sky-300 mr-1"><i class="fa-solid fa-square-check mr-1.5"></i>${fmtNum(n)} dipilih</span>
      ${b('activate', 'fa-solid fa-circle-play', 'Aktifkan', 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10')}
      ${b('suspend', 'fa-solid fa-circle-pause', 'Suspend', 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10')}
      ${b('reset', 'fa-solid fa-key', 'Reset password', 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700')}
      ${b('delete', 'fa-solid fa-trash-can', 'Hapus', 'bg-white dark:bg-slate-800 border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10')}
      <button type="button" data-sw-bulk="clear" class="ml-auto text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white font-medium">Batal pilih</button>`;
  }

  // ---------- PEMUATAN DATA ----------
  async function loadStats() {
    try {
      S.stats = await api().stats();
      S.totalTasks = Number((S.stats.content && S.stats.content.tasks) || S.totalTasks || 0);
    } catch (e) { /* kartu tetap menampilkan strip */ }
    renderStats(); renderFilter();
  }

  async function loadList() {
    const id = ++listReq;
    S.loading = true; S.error = '';
    renderList();
    try {
      const data = await api().users({ page: S.page, limit: S.limit, search: S.search, grade: S.grade, status: S.status });
      if (id !== listReq) return;
      S.users = Array.isArray(data.users) ? data.users : [];
      S.total = Number(data.total || 0);
      S.pages = Math.max(1, Number(data.pages || 1));
      S.page = Number(data.page || S.page);
      S.limit = Number(data.limit || S.limit);
      const t = Number(data.stats && data.stats.tasks_total);
      if (t) S.totalTasks = t;
    } catch (e) {
      if (id !== listReq) return;
      if (e.status === 401) return;
      S.error = e.message || 'Terjadi kesalahan.';
      S.users = [];
    } finally {
      if (id === listReq) { S.loading = false; renderList(); }
    }
  }

  async function reloadAll() {
    await Promise.all([loadStats(), loadList()]);
    if (S.drawer.id && isOpen($('#swDrawer'))) loadDetail(S.drawer.id, true);
  }

  function resetSelection() { S.selected.clear(); }
  function goPage(p) { S.page = Math.min(Math.max(1, p), S.pages); loadList(); }
  function applyFilters() { S.page = 1; resetSelection(); loadList(); renderFilter(); renderStats(); }

  // ---------- PANEL DETAIL ----------
  function ensureDrawer() {
    let d = $('#swDrawer');
    if (d) return d;
    d = el(`<div id="swDrawer" class="hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Detail siswa">
      <div data-sw-close-drawer class="absolute inset-0 bg-slate-900/60 backdrop-blur-xs opacity-0 transition-opacity duration-200"></div>
      <aside id="swDrawerPanel" class="absolute right-0 top-0 h-full w-full sm:max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col translate-x-full transition-transform duration-200"></aside>
    </div>`);
    document.body.appendChild(d);
    return d;
  }

  function openDrawer(id, tab) {
    const d = ensureDrawer();
    S.drawer = { id: Number(id), tab: tab || 'ringkasan', data: null, loading: true };
    d.classList.remove('hidden');
    requestAnimationFrame(() => {
      d.firstElementChild.classList.remove('opacity-0');
      $('#swDrawerPanel').classList.remove('translate-x-full');
    });
    renderDrawer();
    loadDetail(id);
  }

  function closeDrawer() {
    const d = $('#swDrawer');
    if (!d || d.classList.contains('hidden')) return;
    d.firstElementChild.classList.add('opacity-0');
    $('#swDrawerPanel').classList.add('translate-x-full');
    S.drawer.id = null;
    setTimeout(() => d.classList.add('hidden'), 200);
  }

  async function loadDetail(id, silent) {
    const req = ++detailReq;
    if (!silent) { S.drawer.loading = true; renderDrawer(); }
    try {
      const data = await api().user(id);
      if (req !== detailReq || S.drawer.id !== Number(id)) return;
      S.drawer.data = data; S.drawer.loading = false;
    } catch (e) {
      if (req !== detailReq) return;
      S.drawer.loading = false;
      if (!silent) { showToast(e.message || 'Gagal memuat detail siswa.'); closeDrawer(); return; }
    }
    renderDrawer();
  }

  function infoRow(label, value, mono) {
    return `<div class="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0"><span class="text-xs text-slate-500 dark:text-slate-400 shrink-0">${label}</span><span class="text-xs text-right text-slate-800 dark:text-slate-100 font-medium break-all ${mono ? 'font-mono' : ''}">${value}</span></div>`;
  }

  function actionRow(act, icon, title, desc, tone) {
    const tones = {
      sky: 'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400',
      amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
      emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400',
    };
    return `<button type="button" data-sw="${act}" data-id="${S.drawer.id}" class="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left transition">
      <span class="w-9 h-9 shrink-0 rounded-lg ${tones[tone]} flex items-center justify-center text-sm"><i class="${icon}"></i></span>
      <span class="min-w-0"><span class="block text-sm font-semibold ${tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}">${title}</span><span class="block text-xs text-slate-500 dark:text-slate-400">${desc}</span></span>
      <i class="fa-solid fa-chevron-right text-[10px] text-slate-300 dark:text-slate-600 ml-auto"></i></button>`;
  }

  function renderDrawer() {
    const panel = $('#swDrawerPanel');
    if (!panel) return;
    const D = S.drawer;
    const head = (inner) => `<div class="shrink-0 flex items-center justify-between px-5 h-14 border-b border-slate-200 dark:border-slate-800"><h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><i class="fa-solid fa-user-graduate text-cyan-600 dark:text-cyan-400"></i>Detail Siswa</h3><button type="button" data-sw-close-drawer class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition" aria-label="Tutup"><i class="fa-solid fa-xmark text-lg"></i></button></div>${inner}`;
    if (D.loading || !D.data) {
      panel.innerHTML = head('<div class="p-5 space-y-4 animate-pulse"><div class="flex items-center gap-4"><div class="w-16 h-16 rounded-2xl bg-slate-200 dark:bg-slate-800"></div><div class="flex-1 space-y-2"><div class="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800"></div><div class="h-3 w-52 rounded bg-slate-100 dark:bg-slate-800/70"></div></div></div><div class="grid grid-cols-3 gap-3"><div class="h-16 rounded-xl bg-slate-100 dark:bg-slate-800"></div><div class="h-16 rounded-xl bg-slate-100 dark:bg-slate-800"></div><div class="h-16 rounded-xl bg-slate-100 dark:bg-slate-800"></div></div><div class="h-40 rounded-xl bg-slate-100 dark:bg-slate-800/70"></div></div>');
      return;
    }
    const data = D.data, u = data.user || {};
    const rows = Array.isArray(data.progressRows) ? data.progressRows : [];
    const completed = Number((data.progress && data.progress.completed) ?? rows.filter((r) => r.completed_at).length);
    const pct = pctOf(completed);
    const pts = Number((data.points && data.points.total) ?? u.points_total ?? 0);
    const m = metaOf(u);
    const tabs = [['ringkasan', 'Ringkasan', 'fa-solid fa-id-card'], ['progres', 'Progres', 'fa-solid fa-list-check'], ['akun', 'Akun', 'fa-solid fa-shield-halved']];

    let body = '';
    if (D.tab === 'ringkasan') {
      body = `<div class="rounded-xl border border-slate-200/90 dark:border-slate-800 px-4">
          ${infoRow('Nama lengkap', esc(nameOf(u)))}
          ${infoRow('Username', esc(u.username || '-'), true)}
          ${infoRow('Email', esc(u.email || '-'), true)}
          ${infoRow('NIS', nisOf(u), true)}
          ${infoRow('Jenjang', gradeBadges(u))}
          ${infoRow('Status', statusPill(u.status))}
          ${infoRow('Terdaftar', u.created_at ? esc(formatDate(u.created_at)) : '—')}
          ${infoRow('Terakhir aktif', lastSeen(u) ? esc(formatDate(lastSeen(u))) : '—')}
        </div>
        ${u.suspend_reason || u.suspended_reason ? `<div class="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/20 text-xs text-amber-800 dark:text-amber-300"><i class="fa-solid fa-circle-info mr-1.5"></i>Alasan suspend: ${esc(u.suspend_reason || u.suspended_reason)}</div>` : ''}`;
    } else if (D.tab === 'progres') {
      const done = rows.filter((r) => r.completed_at);
      const last = done[0];
      body = `<div class="rounded-xl border border-slate-200/90 dark:border-slate-800 p-4 mb-3">
          <div class="flex justify-between text-xs mb-1.5"><span class="font-semibold text-slate-700 dark:text-slate-300">Ketuntasan keseluruhan</span><span class="font-mono text-slate-500 dark:text-slate-400">${fmtNum(completed)}/${fmtNum(S.totalTasks)} task</span></div>
          <div class="w-full bg-slate-200/80 dark:bg-slate-800 rounded-full h-2"><div class="${m.bar} h-2 rounded-full transition-all" style="width:${pct}%"></div></div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2">${last ? 'Submisi terakhir: ' + esc(formatDate(last.completed_at)) : 'Belum ada task yang diselesaikan.'}</p>
        </div>
        ${rows.length ? `<ul class="space-y-2">${rows.slice(0, 100).map((r) => `<li class="flex items-center gap-3 p-3 rounded-xl border border-slate-200/90 dark:border-slate-800">
            <span class="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-xs ${r.completed_at ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}"><i class="fa-solid ${r.completed_at ? 'fa-check' : 'fa-hourglass-half'}"></i></span>
            <span class="min-w-0 flex-1"><span class="block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">${esc(r.title || r.task_id || '-')}</span><span class="block text-[11px] font-mono text-slate-400">${r.completed_at ? esc(formatDate(r.completed_at)) : 'Belum selesai'}</span></span>
            ${r.points != null ? `<span class="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">+${fmtNum(r.points)}</span>` : ''}</li>`).join('')}</ul>
          ${rows.length > 100 ? `<p class="text-[11px] text-slate-400 mt-2 text-center">Menampilkan 100 dari ${fmtNum(rows.length)} entri.</p>` : ''}`
          : '<div class="py-10 text-center text-xs text-slate-500 dark:text-slate-400"><i class="fa-solid fa-inbox text-2xl text-slate-300 dark:text-slate-600 block mb-2"></i>Belum ada riwayat pengerjaan.</div>'}`;
    } else {
      const del = u.status === 'deleted';
      body = `<div class="space-y-2.5">
          ${del ? '<div class="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200/80 dark:border-rose-500/20 text-xs text-rose-700 dark:text-rose-300"><i class="fa-solid fa-circle-info mr-1.5"></i>Akun ini sudah dihapus. Tidak ada aksi yang tersedia.</div>' : `
          ${actionRow('edit', 'fa-solid fa-pen', 'Edit data siswa', 'Ubah nama, email, dan jenjang', 'sky')}
          ${actionRow('reset', 'fa-solid fa-key', 'Reset password', 'Buat password sementara yang baru', 'amber')}
          ${actionRow('revoke', 'fa-solid fa-right-from-bracket', 'Cabut semua sesi', 'Paksa keluar dari semua perangkat', 'sky')}
          ${u.status === 'suspended' ? actionRow('unsuspend', 'fa-solid fa-circle-play', 'Aktifkan kembali', 'Izinkan siswa login lagi', 'emerald') : actionRow('suspend', 'fa-solid fa-circle-pause', 'Suspend akun', 'Hentikan akses sementara', 'amber')}
          <div class="pt-3 mt-3 border-t border-dashed border-rose-200 dark:border-rose-500/30"><p class="text-[11px] font-mono font-semibold uppercase tracking-wider text-rose-500 mb-2">Zona berbahaya</p>
          ${actionRow('delete', 'fa-solid fa-trash-can', 'Hapus siswa', 'Akun dinonaktifkan dan hilang dari daftar', 'rose')}</div>`}
        </div>`;
    }

    panel.innerHTML = head(`
      <div class="shrink-0 px-5 pt-5 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div class="flex items-center gap-4">
          ${avatar(u, 'w-16 h-16 text-xl')}
          <div class="min-w-0"><h2 class="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight truncate">${esc(nameOf(u))}</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">${esc(u.email || u.username || '-')}</p>
          <div class="flex flex-wrap items-center gap-1.5 mt-2">${gradeBadges(u)}${statusPill(u.status)}</div></div>
        </div>
        <div class="grid grid-cols-3 gap-2.5 mt-4">
          ${[['Ketuntasan', pct + '%', 'text-sky-600 dark:text-sky-400'], ['Total Poin', fmtNum(pts), 'text-emerald-600 dark:text-emerald-400'], ['Task Selesai', fmtNum(completed), 'text-indigo-600 dark:text-indigo-400']].map(([l, v, c]) => `<div class="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 px-3 py-2.5 text-center"><div class="text-base font-extrabold font-mono ${c}">${v}</div><div class="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono mt-0.5">${l}</div></div>`).join('')}
        </div>
      </div>
      <div class="shrink-0 flex gap-1 px-4 pt-3 border-b border-slate-200/80 dark:border-slate-800">
        ${tabs.map(([k, label, icon]) => `<button type="button" data-sw-tab="${k}" class="px-3 py-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 -mb-px transition ${D.tab === k ? 'border-sky-600 text-sky-700 dark:text-sky-300 dark:border-sky-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}"><i class="${icon}"></i>${label}</button>`).join('')}
      </div>
      <div class="flex-1 overflow-y-auto p-5">${body}</div>`);
  }

  // ---------- FORM TAMBAH / EDIT ----------
  function ensureForm() {
    let m = $('#swForm');
    if (m) return m;
    m = el(`<div id="swForm" class="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[60] flex items-center justify-center p-4">
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <h3 id="swFormTitle" class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"></h3>
          <button type="button" data-sw-close-form class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1" aria-label="Tutup"><i class="fa-solid fa-xmark text-lg"></i></button>
        </div>
        <form id="swFormEl" class="space-y-4 pt-4 text-xs" novalidate>
          <div><label class="${LBL}" for="swfName">Nama Lengkap</label><input id="swfName" name="fullName" type="text" required maxlength="80" placeholder="Contoh: Raditya Pratama" class="${INPUT}"></div>
          <div><label class="${LBL}" for="swfEmail">Email Akun Belajar</label><input id="swfEmail" name="email" type="email" required placeholder="siswa@diengcyber.sch.id" class="${INPUT}"></div>
          <div><span class="${LBL}">Jenjang</span>
            <div class="grid grid-cols-3 gap-2">${GRADE_KEYS.map((g) => `<label class="cursor-pointer"><input type="checkbox" name="grade" value="${g}" class="peer sr-only"><span class="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[11px] font-semibold text-center transition peer-checked:border-sky-500 peer-checked:bg-sky-50 dark:peer-checked:bg-sky-500/10 peer-checked:text-sky-700 dark:peer-checked:text-sky-300 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500/40 hover:bg-slate-50 dark:hover:bg-slate-800"><i class="${GRADE_META[g].icon} text-sm"></i>${esc(GRADE_META[g].label)}</span></label>`).join('')}</div>
            <p class="text-[11px] text-slate-400 mt-1.5">Boleh memilih lebih dari satu jenjang.</p>
          </div>
          <p id="swFormNote" class="text-[11px] text-slate-500 dark:text-slate-400 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800"></p>
          <p id="swFormErr" class="hidden text-xs font-medium text-rose-600 dark:text-rose-400"></p>
          <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button type="button" data-sw-close-form class="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-100 dark:hover:bg-slate-800">Batal</button>
            <button type="submit" id="swFormSubmit" class="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold disabled:opacity-50"></button>
          </div>
        </form>
      </div></div>`);
    document.body.appendChild(m);
    $('#swFormEl', m).addEventListener('submit', submitForm);
    return m;
  }

  function openForm(user) {
    const m = ensureForm();
    S.formUser = user || null;
    const f = $('#swFormEl', m);
    f.reset();
    $('#swFormErr').classList.add('hidden');
    $('#swFormTitle').innerHTML = user ? '<i class="fa-solid fa-user-pen text-sky-600 dark:text-sky-400"></i>Edit Data Siswa' : '<i class="fa-solid fa-user-plus text-sky-600 dark:text-sky-400"></i>Pendaftaran Siswa Baru';
    $('#swFormSubmit').textContent = user ? 'Simpan Perubahan' : 'Daftarkan Siswa';
    $('#swFormNote').innerHTML = user ? '<i class="fa-solid fa-circle-info mr-1.5"></i>Perubahan email tidak mengubah password siswa.' : '<i class="fa-solid fa-circle-info mr-1.5"></i>Password sementara dibuat otomatis dan ditampilkan sekali setelah akun dibuat.';
    if (user) {
      f.fullName.value = user.full_name || '';
      f.email.value = user.email || '';
      const gs = gradeOrder(user.allowedGrades);
      $$('input[name="grade"]', f).forEach((c) => { c.checked = gs.includes(c.value); });
    } else {
      $$('input[name="grade"]', f).forEach((c) => { c.checked = c.value === 'SMP'; });
    }
    m.classList.remove('hidden');
    setTimeout(() => f.fullName.focus(), 30);
  }
  function closeForm() { const m = $('#swForm'); if (m) m.classList.add('hidden'); }

  async function submitForm(e) {
    e.preventDefault();
    const f = e.target;
    const err = $('#swFormErr');
    const fail = (msg) => { err.textContent = msg; err.classList.remove('hidden'); };
    err.classList.add('hidden');
    const fullName = f.fullName.value.trim();
    const email = f.email.value.trim();
    const grades = $$('input[name="grade"]:checked', f).map((c) => c.value);
    if (fullName.length < 2) return fail('Nama lengkap minimal 2 huruf.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Format email belum benar.');
    if (!grades.length) return fail('Pilih minimal satu jenjang.');
    const btn = $('#swFormSubmit');
    btn.disabled = true;
    try {
      if (S.formUser) {
        await api().updateUser(S.formUser.id, { fullName, email, allowedGrades: grades });
        closeForm();
        showToast('Data siswa diperbarui.');
      } else {
        const r = await api().createUser({ fullName, email, allowedGrades: grades });
        closeForm();
        S.page = 1;
        if (r.temporaryPassword) showCred({ title: 'Siswa berhasil dibuat', note: 'Simpan password sementara ini sekarang. Minta siswa menggantinya setelah login pertama.', entries: [{ name: fullName, username: r.username, password: r.temporaryPassword }] });
        else showToast('Siswa ' + (r.username || fullName) + ' berhasil dibuat.');
      }
      await reloadAll();
    } catch (ex) {
      fail(ex.message || 'Gagal menyimpan data.');
    } finally { btn.disabled = false; }
  }

  // ---------- MODAL KREDENSIAL ----------
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise((res, rej) => {
      const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? res() : rej(); } catch (x) { rej(x); } t.remove();
    });
  }

  let credEntries = [];
  function showCred({ title, note, entries }) {
    credEntries = entries;
    let m = $('#swCred');
    if (!m) {
      m = el('<div id="swCred" class="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[70] flex items-center justify-center p-4"></div>');
      document.body.appendChild(m);
    }
    m.innerHTML = `<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl max-h-[92vh] flex flex-col">
      <div class="flex items-start gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div class="w-11 h-11 shrink-0 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400 flex items-center justify-center text-lg"><i class="fa-solid fa-key"></i></div>
        <div class="min-w-0 flex-1"><h3 class="text-base font-bold text-slate-900 dark:text-white">${esc(title)}</h3><p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${esc(note)}</p></div>
        <button type="button" data-sw-close-cred class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1" aria-label="Tutup"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>
      <div class="py-4 space-y-2 overflow-y-auto">
        ${entries.map((en, i) => `<div class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
          <div class="min-w-0 flex-1"><p class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(en.name)}</p>
          <p class="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">Username: ${esc(en.username || '-')}</p>
          <p class="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400 select-all">${esc(en.password)}</p></div>
          <button type="button" data-sw-copy="${i}" class="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition"><i class="fa-regular fa-copy mr-1"></i>Salin</button></div>`).join('')}
      </div>
      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
        ${entries.length > 1 ? `<button type="button" data-sw-cred-csv class="${BTN_SEC} justify-center"><i class="fa-solid fa-file-arrow-down"></i>Unduh CSV</button>` : ''}
        <button type="button" data-sw-copy="all" class="${BTN_SEC} justify-center"><i class="fa-regular fa-copy"></i>Salin ${entries.length > 1 ? 'semua' : 'username & password'}</button>
        <button type="button" data-sw-close-cred class="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold">Selesai</button>
      </div></div>`;
    m.classList.remove('hidden');
  }
  function closeCred() { const m = $('#swCred'); if (m) m.classList.add('hidden'); credEntries = []; }

  // ---------- CSV ----------
  function csvCell(v, raw) {
    let s = String(v ?? '');
    if (!raw && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // cegah injeksi rumus di Excel/Sheets
    return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadCsv(filename, rows, rawCols) {
    const text = '\uFEFF' + rows.map((r) => r.map((c, i) => csvCell(c, rawCols && rawCols.includes(i))).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function parseCSV(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
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
    endRow();
    return rows.map((r) => r.map((x) => x.trim()));
  }
  function normGrades(raw) {
    const out = new Set();
    String(raw || '').toUpperCase().split(/[|/+&;]| DAN /).forEach((p) => {
      p = p.trim();
      if (/^SD\b/.test(p)) out.add('SD');
      else if (/^SMP\b/.test(p)) out.add('SMP');
      else if (/^(SMA|SMK)\b/.test(p)) out.add('SMK');
    });
    return GRADE_KEYS.filter((g) => out.has(g));
  }

  async function exportCsv() {
    if (S.busy) return;
    S.busy = true;
    showToast('Menyiapkan file ekspor...', 'warning');
    try {
      const all = [];
      let page = 1, pages = 1;
      do {
        const d = await api().users({ page, limit: 100, search: S.search, grade: S.grade, status: S.status });
        all.push(...(d.users || []));
        pages = Math.max(1, Number(d.pages || 1));
        page++;
      } while (page <= pages && page <= 200);
      if (!all.length) { showToast('Belum ada siswa yang cocok untuk diekspor.'); return; }
      const rows = [['ID', 'NIS', 'Nama', 'Username', 'Email', 'Jenjang', 'Status', 'Task Selesai', 'Poin']];
      all.forEach((u) => rows.push([u.id, nisOf(u), u.full_name || '', u.username || '', u.email || '', gradeText(u), statusMeta(u.status).text, u.completed_tasks || 0, u.points_total || 0]));
      downloadCsv('siswa-dieng-cyber-' + new Date().toISOString().slice(0, 10) + '.csv', rows);
      showToast(fmtNum(all.length) + ' siswa diekspor ke CSV.', 'success');
    } catch (e) { showToast(e.message || 'Gagal mengekspor data.', 'error'); }
    finally { S.busy = false; }
  }

  // ---------- IMPOR CSV ----------
  function ensureImport() {
    let m = $('#swImport');
    if (m) return m;
    m = el('<div id="swImport" class="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[60] flex items-center justify-center p-4"></div>');
    document.body.appendChild(m);
    return m;
  }

  function openImport() {
    S.importRows = []; S.importRunning = false; S.importStop = false;
    ensureImport().classList.remove('hidden');
    renderImport();
  }
  function closeImport() {
    if (S.importRunning) return showToast('Impor sedang berjalan. Hentikan dulu kalau ingin menutup.', 'warning');
    ensureImport().classList.add('hidden');
  }

  function buildImportRows(text) {
    const rows = parseCSV(text);
    if (!rows.length) return [];
    let map = { name: 0, email: 1, grade: 2 };
    const head = rows[0].map((c) => c.toLowerCase());
    if (head.some((c) => /^(nama|name|email|jenjang|grade)/.test(c))) {
      const idx = (re) => head.findIndex((c) => re.test(c));
      map = { name: idx(/nama|name/), email: idx(/email|surel/), grade: idx(/jenjang|grade|kelas|tingkat/) };
      rows.shift();
    }
    const seen = new Set();
    return rows.slice(0, 500).map((r, i) => {
      const name = (map.name >= 0 ? r[map.name] : '') || '';
      const email = ((map.email >= 0 ? r[map.email] : '') || '').toLowerCase();
      const grades = normGrades(map.grade >= 0 ? r[map.grade] : '');
      let error = '';
      if (name.length < 2) error = 'Nama kosong';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Email tidak valid';
      else if (!grades.length) error = 'Jenjang tidak dikenali (pakai SD, SMP, atau SMA/SMK)';
      else if (seen.has(email)) error = 'Email dobel di file';
      if (!error) seen.add(email);
      return { n: i + 1, name, email, grades, error, state: error ? 'invalid' : 'ready', msg: '' };
    });
  }

  function renderImport() {
    const m = ensureImport();
    const sc0 = m.querySelector('.max-h-72');
    const keepTop = sc0 ? sc0.scrollTop : 0;
    const rows = S.importRows;
    const valid = rows.filter((r) => !r.error);
    const done = rows.filter((r) => r.state === 'ok').length;
    const failed = rows.filter((r) => r.state === 'fail').length;
    const processed = done + failed;
    const finished = rows.length && !S.importRunning && processed > 0 && processed >= valid.length;
    const stateBadge = (r) => ({
      invalid: '<span class="text-rose-600 dark:text-rose-400"><i class="fa-solid fa-circle-xmark mr-1"></i>' + esc(r.error) + '</span>',
      ready: '<span class="text-slate-400">Siap</span>',
      run: '<span class="text-sky-600 dark:text-sky-400"><i class="fa-solid fa-circle-notch fa-spin mr-1"></i>Memproses</span>',
      ok: '<span class="text-emerald-600 dark:text-emerald-400"><i class="fa-solid fa-circle-check mr-1"></i>Berhasil</span>',
      fail: '<span class="text-rose-600 dark:text-rose-400"><i class="fa-solid fa-circle-xmark mr-1"></i>' + esc(r.msg || 'Gagal') + '</span>',
    }[r.state]);

    m.innerHTML = `<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl max-h-[92vh] flex flex-col">
      <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"><i class="fa-solid fa-file-import text-indigo-600 dark:text-indigo-400"></i>Impor Siswa dari CSV</h3>
        <button type="button" data-sw-close-import class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1" aria-label="Tutup"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>
      <div class="py-4 space-y-4 overflow-y-auto text-xs">
        ${!rows.length ? `
          <label for="swImportFile" id="swDrop" class="flex flex-col items-center justify-center gap-2 px-4 py-9 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-sky-400 dark:hover:border-sky-500 hover:bg-sky-50/50 dark:hover:bg-sky-500/5 text-center cursor-pointer transition">
            <span class="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl"><i class="fa-solid fa-cloud-arrow-up"></i></span>
            <span class="text-sm font-semibold text-slate-800 dark:text-slate-100">Pilih atau seret file CSV ke sini</span>
            <span class="text-slate-500 dark:text-slate-400">Kolom: <span class="font-mono">nama, email, jenjang</span> · maksimal 500 baris</span>
            <input id="swImportFile" type="file" accept=".csv,text/csv,text/plain" class="sr-only">
          </label>
          <div><label class="${LBL}" for="swImportText">Atau tempel isi CSV</label>
            <textarea id="swImportText" rows="4" placeholder="nama,email,jenjang&#10;Raditya Pratama,radit@sekolah.sch.id,SMP" class="${INPUT} font-mono resize-y"></textarea>
            <div class="flex items-center justify-between mt-2"><button type="button" data-sw-import-tpl class="text-sky-600 dark:text-sky-400 font-semibold hover:underline"><i class="fa-solid fa-download mr-1"></i>Unduh template CSV</button>
            <button type="button" data-sw-import-parse class="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold">Periksa Data</button></div></div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">Jenjang yang dikenali: <span class="font-mono">SD</span>, <span class="font-mono">SMP</span>, <span class="font-mono">SMA</span>/<span class="font-mono">SMK</span>. Untuk lebih dari satu jenjang, pisahkan dengan <span class="font-mono">|</span>, misalnya <span class="font-mono">SMP|SMK</span>.</p>`
        : `
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2.5 py-1 rounded-full font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">${fmtNum(rows.length)} baris</span>
            <span class="px-2.5 py-1 rounded-full font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">${fmtNum(valid.length)} valid</span>
            ${rows.length - valid.length ? `<span class="px-2.5 py-1 rounded-full font-semibold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400">${fmtNum(rows.length - valid.length)} bermasalah (dilewati)</span>` : ''}
            ${processed ? `<span class="px-2.5 py-1 rounded-full font-semibold bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400">${fmtNum(done)} berhasil${failed ? ' · ' + fmtNum(failed) + ' gagal' : ''}</span>` : ''}
          </div>
          ${S.importRunning || processed ? `<div class="w-full bg-slate-200/80 dark:bg-slate-800 rounded-full h-2"><div class="bg-gradient-to-r from-sky-500 to-indigo-600 h-2 rounded-full transition-all" style="width:${valid.length ? Math.round((processed / valid.length) * 100) : 0}%"></div></div>` : ''}
          <div class="rounded-xl border border-slate-200/90 dark:border-slate-800 overflow-hidden"><div class="max-h-72 overflow-auto"><table class="w-full text-left">
            <thead class="bg-slate-50 dark:bg-slate-950/50 text-[11px] font-mono uppercase text-slate-500 dark:text-slate-400 sticky top-0"><tr><th class="px-3 py-2 w-10">#</th><th class="px-3 py-2">Nama</th><th class="px-3 py-2">Email</th><th class="px-3 py-2">Jenjang</th><th class="px-3 py-2">Status</th></tr></thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">${rows.map((r) => `<tr class="${r.error ? 'bg-rose-50/40 dark:bg-rose-500/5' : ''}"><td class="px-3 py-2 font-mono text-slate-400">${r.n}</td><td class="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">${esc(r.name || '—')}</td><td class="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">${esc(r.email || '—')}</td><td class="px-3 py-2 font-mono">${esc(r.grades.map((g) => GRADE_META[g].label).join(' / ') || '—')}</td><td class="px-3 py-2">${stateBadge(r)}</td></tr>`).join('')}</tbody></table></div></div>`}
      </div>
      <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
        ${rows.length && !S.importRunning && !processed ? `<button type="button" data-sw-import-back class="px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800">Ganti file</button>` : ''}
        ${S.importRunning ? `<button type="button" data-sw-import-stop class="${BTN_SEC} justify-center text-rose-600"><i class="fa-solid fa-hand"></i>Hentikan</button>` : ''}
        ${done ? `<button type="button" data-sw-import-creds class="${BTN_SEC} justify-center"><i class="fa-solid fa-file-arrow-down"></i>Unduh kredensial</button>` : ''}
        ${rows.length && !processed && !S.importRunning ? `<button type="button" data-sw-import-run ${valid.length ? '' : 'disabled'} class="${BTN_PRI} justify-center"><i class="fa-solid fa-user-plus"></i>Impor ${fmtNum(valid.length)} Siswa</button>` : ''}
        ${finished || (!S.importRunning && processed) ? `<button type="button" data-sw-close-import class="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold">Selesai</button>` : ''}
      </div></div>`;

    const sc1 = m.querySelector('.max-h-72');
    if (sc1) sc1.scrollTop = keepTop;
    const file = $('#swImportFile', m);
    if (file) file.addEventListener('change', async () => { if (file.files[0]) loadImportFile(file.files[0]); });
    const drop = $('#swDrop', m);
    if (drop) {
      ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('border-sky-500'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('border-sky-500'); }));
      drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) loadImportFile(f); });
    }
  }

  async function loadImportFile(file) {
    if (file.size > 1024 * 1024) return showToast('File terlalu besar (maksimal 1 MB).', 'warning');
    setImportText(await file.text());
  }
  function setImportText(text) {
    S.importRows = buildImportRows(text);
    if (!S.importRows.length) return showToast('Tidak ada baris data yang terbaca.', 'warning');
    renderImport();
  }

  async function runImport() {
    const todo = S.importRows.filter((r) => !r.error);
    if (!todo.length) return;
    S.importRunning = true; S.importStop = false;
    renderImport();
    const creds = [];
    for (const r of todo) {
      if (S.importStop) break;
      r.state = 'run'; renderImport();
      try {
        const res = await api().createUser({ fullName: r.name, email: r.email, allowedGrades: r.grades });
        r.state = 'ok';
        creds.push({ name: r.name, username: res.username || r.email, password: res.temporaryPassword || '' });
      } catch (e) {
        r.state = 'fail'; r.msg = e.message || 'Gagal';
      }
    }
    S.importRows.forEach((r) => { if (r.state === 'run' || r.state === 'ready') r.state = r.error ? 'invalid' : 'ready'; });
    S.importRunning = false;
    S.importCreds = creds;
    renderImport();
    S.page = 1;
    reloadAll();
    showToast(fmtNum(creds.length) + ' siswa berhasil diimpor.', 'success');
  }

  // ---------- AKSI ----------
  async function doReset(id) {
    const u = findUser(id); if (!u) return;
    const ok = await dcConfirm({ title: 'Reset password siswa?', message: 'Password lama langsung tidak berlaku dan password sementara baru dibuat.', detail: nameOf(u), confirmText: 'Reset password', tone: 'warning' });
    if (!ok) return;
    try {
      const r = await api().resetPassword(id, {});
      if (r.temporaryPassword) showCred({ title: 'Password berhasil direset', note: 'Berikan password sementara ini kepada siswa. Password tidak akan ditampilkan lagi.', entries: [{ name: nameOf(u), username: r.username || u.username, password: r.temporaryPassword }] });
      else showToast('Password ' + nameOf(u) + ' direset.');
    } catch (e) { showToast(e.message || 'Gagal mereset password.', 'error'); }
  }

  async function doSuspend(id, on) {
    const u = findUser(id); if (!u) return;
    let reason = '';
    if (on) {
      reason = await dcPrompt({ title: 'Suspend akun siswa?', message: 'Siswa tidak bisa login sampai akunnya diaktifkan kembali. Alasan boleh dikosongkan.', placeholder: 'Contoh: pelanggaran tata tertib lab', confirmText: 'Suspend', validate: () => '', tone: 'warning' });
      if (reason === null) return;
    } else {
      const ok = await dcConfirm({ title: 'Aktifkan akun kembali?', message: 'Siswa bisa login dan belajar seperti biasa.', detail: nameOf(u), confirmText: 'Aktifkan', tone: 'success' });
      if (!ok) return;
    }
    try {
      await api().suspendUser(id, suspendBody(on, reason));
      showToast(on ? 'Akun ' + nameOf(u) + ' disuspend.' : 'Akun ' + nameOf(u) + ' diaktifkan kembali.', on ? 'warning' : 'success');
      await reloadAll();
    } catch (e) { showToast(e.message || 'Gagal mengubah status akun.', 'error'); }
  }

  async function doRevoke(id) {
    const u = findUser(id); if (!u) return;
    const ok = await dcConfirm({ title: 'Cabut semua sesi?', message: 'Siswa akan otomatis keluar dari semua perangkat dan harus login ulang.', detail: nameOf(u), confirmText: 'Cabut sesi', tone: 'warning' });
    if (!ok) return;
    try { await api().revokeSessions(id); showToast('Semua sesi ' + nameOf(u) + ' dicabut.'); }
    catch (e) { showToast(e.message || 'Gagal mencabut sesi.', 'error'); }
  }

  async function doDelete(id) {
    const u = findUser(id); if (!u) return;
    const ok = await dcConfirm({ title: 'Hapus siswa ini?', message: 'Akun akan dinonaktifkan dan hilang dari daftar siswa aktif.', detail: nameOf(u), confirmText: 'Ya, hapus', tone: 'danger' });
    if (!ok) return;
    try {
      await api().deleteUser(id);
      showToast('Siswa ' + nameOf(u) + ' dihapus.');
      S.selected.delete(Number(id));
      if (S.drawer.id === Number(id)) closeDrawer();
      await reloadAll();
    } catch (e) { showToast(e.message || 'Gagal menghapus siswa.', 'error'); }
  }

  async function bulk(action) {
    if (action === 'clear') { resetSelection(); return renderList(); }
    const ids = Array.from(S.selected);
    if (!ids.length || S.busy) return;
    const count = fmtNum(ids.length) + ' siswa';
    const names = new Map(S.users.map((u) => [Number(u.id), nameOf(u)]));
    let fn, doneMsg;
    if (action === 'delete') {
      const word = await dcPrompt({ title: 'Hapus ' + count + '?', message: 'Tindakan ini menonaktifkan semua akun yang dipilih. Ketik HAPUS untuk melanjutkan.', placeholder: 'HAPUS', confirmText: 'Hapus semua', tone: 'danger', validate: (v) => (v === 'HAPUS' ? '' : 'Ketik HAPUS (huruf besar) untuk konfirmasi.') });
      if (word === null) return;
      fn = (id) => api().deleteUser(id); doneMsg = 'dihapus';
    } else if (action === 'suspend') {
      const reason = await dcPrompt({ title: 'Suspend ' + count + '?', message: 'Semua siswa terpilih tidak bisa login. Alasan boleh dikosongkan.', placeholder: 'Alasan (opsional)', confirmText: 'Suspend', validate: () => '', tone: 'warning' });
      if (reason === null) return;
      fn = (id) => api().suspendUser(id, suspendBody(true, reason)); doneMsg = 'disuspend';
    } else if (action === 'activate') {
      if (!(await dcConfirm({ title: 'Aktifkan ' + count + '?', message: 'Semua siswa terpilih bisa login kembali.', confirmText: 'Aktifkan', tone: 'success' }))) return;
      fn = (id) => api().suspendUser(id, suspendBody(false)); doneMsg = 'diaktifkan';
    } else if (action === 'reset') {
      if (!(await dcConfirm({ title: 'Reset password ' + count + '?', message: 'Password sementara baru dibuat untuk tiap siswa dan ditampilkan sekali.', confirmText: 'Reset semua', tone: 'warning' }))) return;
      fn = (id) => api().resetPassword(id, {}); doneMsg = 'direset passwordnya';
    } else return;

    S.busy = true; renderBulk();
    let ok = 0, bad = 0; const creds = [];
    for (let i = 0; i < ids.length; i++) {
      showToast('Memproses ' + (i + 1) + ' dari ' + ids.length + '...', 'warning');
      try {
        const r = await fn(ids[i]); ok++;
        if (action === 'reset' && r && r.temporaryPassword) creds.push({ name: names.get(ids[i]) || ('Siswa #' + ids[i]), username: r.username || '', password: r.temporaryPassword });
      } catch (e) { bad++; }
    }
    S.busy = false; resetSelection();
    showToast(fmtNum(ok) + ' siswa ' + doneMsg + (bad ? ', ' + fmtNum(bad) + ' gagal.' : '.'), bad ? 'warning' : 'success');
    await reloadAll();
    if (creds.length) showCred({ title: 'Password berhasil direset', note: 'Unduh atau salin daftar ini sekarang. Password tidak akan ditampilkan lagi.', entries: creds });
  }

  // ---------- EVENT ----------
  document.addEventListener('click', (e) => {
    const t = e.target;
    const c = (sel) => t.closest(sel);
    let n;

    if ((n = c('[data-sw]'))) {
      const id = n.dataset.id;
      switch (n.dataset.sw) {
        case 'new': return openForm(null);
        case 'import': return openImport();
        case 'export': return exportCsv();
        case 'refresh': return reloadAll().then(() => showToast('Data siswa dimuat ulang dari server.'));
        case 'clear-filter': S.search = ''; S.grade = ''; S.status = ''; $('#swSearch').value = ''; $('#swStatus').value = ''; return applyFilters();
        case 'reset-local': return dcConfirm({ title: 'Kembalikan data contoh?', message: 'Semua perubahan data siswa di browser ini akan diganti dengan data contoh.', confirmText: 'Kembalikan', tone: 'warning' })
          .then((ok) => { if (!ok) return; LocalStore.reset(); resetSelection(); closeDrawer(); S.page = 1; reloadAll().then(() => showToast('Data contoh dikembalikan.')); });
        case 'view': return openDrawer(id);
        case 'edit': { const u = findUser(id); if (u) { if (S.drawer.id) closeDrawer(); openForm(u); } return; }
        case 'reset': return doReset(id);
        case 'suspend': return doSuspend(id, true);
        case 'unsuspend': return doSuspend(id, false);
        case 'revoke': return doRevoke(id);
        case 'delete': return doDelete(id);
      }
    }
    if ((n = c('[data-goto="siswa"]'))) { const nav = document.querySelector('aside [data-view="siswa"]'); if (nav) nav.click(); return; }
    if ((n = c('[data-sw-grade]'))) { S.grade = n.dataset.swGrade; return applyFilters(); }
    if ((n = c('[data-sw-stat]'))) { S.status = n.dataset.swStat; $('#swStatus').value = S.status; return applyFilters(); }
    if ((n = c('[data-sw-mode]'))) { S.mode = n.dataset.swMode; savePref(); renderMode(); return renderList(); }
    if ((n = c('[data-sw-page]'))) { if (!n.disabled) goPage(Number(n.dataset.swPage)); return; }
    if ((n = c('[data-sw-bulk]'))) return bulk(n.dataset.swBulk);
    if ((n = c('[data-sw-tab]'))) { S.drawer.tab = n.dataset.swTab; return renderDrawer(); }
    if (c('[data-sw-close-drawer]')) return closeDrawer();
    if (c('[data-sw-close-form]')) return closeForm();
    if (c('[data-sw-close-cred]')) return closeCred();
    if (c('[data-sw-close-import]')) return closeImport();
    if ((n = c('[data-sw-copy]'))) {
      const k = n.dataset.swCopy;
      const text = k === 'all' ? credEntries.map((x) => x.name + ' | ' + x.username + ' | ' + x.password).join('\n') : (credEntries[k] ? 'Username: ' + credEntries[k].username + '\nPassword: ' + credEntries[k].password : '');
      return copyText(text).then(() => showToast('Disalin ke clipboard.'), () => showToast('Gagal menyalin. Salin manual dari layar.', 'error'));
    }
    if (c('[data-sw-cred-csv]')) return downloadCsv('kredensial-siswa.csv', [['Nama', 'Username', 'Password']].concat(credEntries.map((x) => [x.name, x.username, x.password])), [2]);
    if (c('[data-sw-import-tpl]')) return downloadCsv('template-impor-siswa.csv', [['nama', 'email', 'jenjang'], ['Raditya Pratama', 'radit@sekolah.sch.id', 'SMP'], ['Ayu Lestari', 'ayu@sekolah.sch.id', 'SD'], ['Bima Saputra', 'bima@sekolah.sch.id', 'SMA']]);
    if (c('[data-sw-import-parse]')) return setImportText(($('#swImportText') || {}).value || '');
    if (c('[data-sw-import-back]')) { S.importRows = []; return renderImport(); }
    if (c('[data-sw-import-run]')) return runImport();
    if (c('[data-sw-import-stop]')) { S.importStop = true; return showToast('Impor dihentikan setelah baris ini selesai.', 'warning'); }
    if (c('[data-sw-import-creds]')) return downloadCsv('kredensial-impor-siswa.csv', [['Nama', 'Username', 'Password']].concat((S.importCreds || []).map((x) => [x.name, x.username, x.password])), [2]);
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-sw-check]')) {
      const id = Number(t.dataset.swCheck);
      t.checked ? S.selected.add(id) : S.selected.delete(id);
      return renderList();
    }
    if (t.id === 'swCheckAll') {
      sortedUsers().forEach((u) => (t.checked ? S.selected.add(Number(u.id)) : S.selected.delete(Number(u.id))));
      return renderList();
    }
    if (t.id === 'swStatus') { S.status = t.value; return applyFilters(); }
    if (t.id === 'swSort') { S.sort = t.value; return renderList(); }
    if (t.id === 'swLimit') { S.limit = Number(t.value); S.page = 1; savePref(); return loadList(); }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id !== 'swSearch') return;
    clearTimeout(searchTimer);
    const v = e.target.value.trim();
    searchTimer = setTimeout(() => { if (v === S.search) return; S.search = v; applyFilters(); }, 300);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const dlg = document.getElementById('dcDialog');
    if (dlg && !dlg.classList.contains('hidden')) return;
    if (isOpen($('#swCred'))) return closeCred();
    if (isOpen($('#swImport'))) return closeImport();
    if (isOpen($('#swForm'))) return closeForm();
    if (isOpen($('#swDrawer'))) return closeDrawer();
  });

  // ---------- INISIALISASI ----------
  function start() {
    if (!started) {
      started = true;
      buildShell();
      renderStats(); renderFilter();
    }
    // Muat ulang tiap kali halaman dibuka agar data selalu segar.
    reloadAll();
  }

  window.addEventListener('dc:view', (e) => { if (e.detail === 'siswa') start(); });
  if (location.hash === '#siswa' && !view.classList.contains('hidden')) start();
})();
