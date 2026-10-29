/* Pengaturan Instansi & Akses/Hak Pengguna
   Endpoint yang dipakai (jika belum ada / 404, otomatis memakai data contoh di browser):
     GET  /api/admin/settings            -> { settings: {...} }       PUT /api/admin/settings { settings }
     GET  /api/admin/roles               -> { roles: { admin:[], instruktur:[], siswa:[], ortu:[] } }   PUT /api/admin/roles { roles }
     GET/POST /api/admin/instructors     PATCH/DELETE /api/admin/instructors/:id
   Catatan: tampilan ini hanya mengatur data. Pembatasan hak akses yang sebenarnya HARUS dicek di server. */
(function () {
  'use strict';
  const U = window.DCUI;
  const vSet = document.getElementById('view-pengaturan');
  const vAk = document.getElementById('view-akses');
  if (!U || !vSet || !vAk) return;
  const { esc, toast, INPUT, LABEL, BTN, BTN_GHOST, CARD, modal, field, makeStore } = U;
  const $ = (s, r = document) => r.querySelector(s);
  const missing = (e) => e && [0, 404, 405, 501].includes(e.status);
  const req = (p, o) => window.DCAdminApi.request(p, o);
  const GRADES = { SD: 'SD', SMP: 'SMP', SMK: 'SMA/SMK' };
  const GHOST_BTN = 'px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed';
  const BTN_OFF = ' disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100';

  // ---------- penyimpanan objek (pengaturan & peran) ----------
  function objStore(path, name, key, defaults) {
    let useLocal = false;
    const load = () => { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } };
    return {
      isLocal: () => useLocal,
      async get() {
        if (!useLocal) {
          try { const r = await req(path); const v = r[name] || r.data; return v ? { ...defaults(), ...v } : defaults(); }
          catch (e) { if (!missing(e)) throw e; useLocal = true; }
        }
        return { ...defaults(), ...(load() || {}) };
      },
      async put(v) {
        if (!useLocal) { try { await req(path, { method: 'PUT', body: { [name]: v } }); return; } catch (e) { if (!missing(e)) throw e; useLocal = true; } }
        try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) {}
      }
    };
  }
  const demoNote = (store, path) => store.isLocal() ? `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"><i class="fa-solid fa-flask mt-0.5"></i><span><b>Mode contoh.</b> Server belum punya <code class="font-mono">${path}</code>, jadi data hanya tersimpan di browser ini.</span></div>` : '';
  const crumb = (name) => `<div class="flex items-center gap-2 text-xs font-mono text-slate-400 dark:text-slate-500 mb-1"><span>Portal Admin</span><span>/</span><span>Konfigurasi</span><span>/</span><span class="text-sky-600 dark:text-sky-400 font-medium">${name}</span></div>`;
  const H1 = 'text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2.5';
  const SUB = 'text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1';

  /* =====================================================================
     PENGATURAN INSTANSI
     ===================================================================== */
  const SET_DEF = () => ({
    name: 'Dieng Cyber', tagline: 'Platform Edukasi Coding', email: '', phone: '', website: '', address: '', logo: '',
    year: String(new Date().getFullYear()) + '/' + (new Date().getFullYear() + 1), semester: 'Ganjil', grades: ['SD', 'SMP', 'SMK'],
    kkm: 75, defaultDueDays: 7, allowLate: true, latePenalty: 10,
    minPassword: 8, sessionHours: 12, forceChangePassword: true,
    notifNewTask: true, notifGraded: true
  });
  const settings = objStore('/api/admin/settings', 'settings', 'dc-settings', SET_DEF);
  let saved = null;

  const norm = (v) => JSON.stringify({ ...v, grades: (v.grades || []).slice().sort() });
  function readSettings() {
    const fd = new FormData($('#setForm'));
    const g = (n) => String(fd.get(n) || '').trim(), num = (n) => Number(fd.get(n)), on = (n) => fd.get(n) !== null;
    return { name: g('name'), tagline: g('tagline'), email: g('email'), phone: g('phone'), website: g('website'), address: g('address'), logo: g('logo'),
      year: g('year'), semester: g('semester'), grades: fd.getAll('grades'), kkm: num('kkm'), defaultDueDays: num('defaultDueDays'),
      allowLate: on('allowLate'), latePenalty: num('latePenalty'), minPassword: num('minPassword'), sessionHours: num('sessionHours'),
      forceChangePassword: on('forceChangePassword'), notifNewTask: on('notifNewTask'), notifGraded: on('notifGraded') };
  }
  function validateSettings(v) {
    const inRange = (x, a, b) => Number.isFinite(x) && x >= a && x <= b;
    if (!v.name) return 'Nama instansi harus diisi.';
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return 'Format email kontak tidak valid.';
    if (v.website && !/^https?:\/\/.+\..+/.test(v.website)) return 'Alamat website harus diawali http:// atau https://.';
    if (!v.year) return 'Tahun ajaran harus diisi.';
    if (!v.grades.length) return 'Pilih minimal satu jenjang aktif.';
    if (!inRange(v.kkm, 0, 100)) return 'Nilai minimum lulus harus antara 0 sampai 100.';
    if (!inRange(v.defaultDueDays, 1, 365)) return 'Tenggat bawaan harus antara 1 sampai 365 hari.';
    if (!inRange(v.latePenalty, 0, 100)) return 'Potongan nilai terlambat harus antara 0 sampai 100 persen.';
    if (!inRange(v.minPassword, 6, 32)) return 'Panjang password minimal harus antara 6 sampai 32 karakter.';
    if (!inRange(v.sessionHours, 1, 168)) return 'Masa sesi harus antara 1 sampai 168 jam.';
    return '';
  }
  function syncSettingsUi() {
    const dirty = norm(readSettings()) !== norm(saved);
    $('#stSave').disabled = !dirty; $('#stReset').disabled = !dirty;
    $('#stDirty').classList.toggle('hidden', !dirty);
    const late = $('#setForm [name=allowLate]').checked;
    $('#setForm [name=latePenalty]').disabled = !late;
    $('#setForm [name=latePenalty]').classList.toggle('opacity-50', !late);
  }
  /* ---- tampilan: layout satu kolom + tab navigasi, kartu logo, input berikon (logika baca/simpan tetap di atas) ---- */
  const FIELD = 'w-full py-2.5 bg-white dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 transition outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed ';
  const lab = (t, req, hint) => `<label class="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">${t}${req ? ' <span class="text-rose-500">*</span>' : ''}${hint ? ` <span class="normal-case tracking-normal font-medium text-slate-400">${hint}</span>` : ''}</label>`;
  // input dengan ikon di kiri dan/atau satuan di kanan
  const inp = (name, label, val, attrs, o) => { o = o || {}; return `<div>${lab(label, o.req)}<div class="relative">
    ${o.icon ? `<i class="fa-regular ${o.icon} absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none"></i>` : ''}
    <input name="${name}" value="${esc(val)}" class="${FIELD}${o.icon ? 'pl-10' : 'pl-3.5'}${o.unit ? ' pr-20' : ' pr-3.5'}" ${attrs || ''}>
    ${o.unit ? `<span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">${o.unit}</span>` : ''}</div></div>`; };
  const tog = (name, label, desc, on) => `<label class="flex items-center justify-between gap-4 p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/70 dark:border-slate-700/60 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition">
    <span><span class="block text-sm font-semibold text-slate-800 dark:text-slate-100">${label}</span><span class="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">${desc}</span></span>
    <span class="relative shrink-0"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} class="peer sr-only">
      <span class="block w-11 h-6 rounded-full bg-slate-300 dark:bg-slate-700 peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-indigo-500/50 dark:peer-focus-visible:ring-offset-slate-900 transition-colors"></span>
      <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></span></span></label>`;
  const sec = (id, tab, icon, title, sub, inner, badge) => `<section id="st-${id}" data-tab="${tab}" class="${CARD} p-6 sm:p-8 scroll-mt-36">
    <div class="flex items-start justify-between gap-4 pb-4 mb-6 border-b border-slate-100 dark:border-slate-800">
      <div><h2 class="flex items-center gap-2.5 font-bold text-slate-900 dark:text-white text-base sm:text-lg"><i class="fa-solid ${icon} text-indigo-500 text-base"></i>${title}</h2><p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${sub}</p></div>
      ${badge ? `<span class="shrink-0 font-mono text-[10px] font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">${badge}</span>` : ''}</div>
    <div class="space-y-5">${inner}</div></section>`;
  const GRADE_UI = {
    SD:  ['Visual Blocks', 'peer-checked:border-emerald-500 peer-checked:bg-emerald-50 peer-checked:text-emerald-800 dark:peer-checked:bg-emerald-500/10 dark:peer-checked:text-emerald-300', 'text-emerald-600 dark:text-emerald-400'],
    SMP: ['HTML/CSS/JS', 'peer-checked:border-sky-500 peer-checked:bg-sky-50 peer-checked:text-sky-800 dark:peer-checked:bg-sky-500/10 dark:peer-checked:text-sky-300', 'text-sky-600 dark:text-sky-400'],
    SMK: ['Fullstack Dev', 'peer-checked:border-purple-500 peer-checked:bg-purple-50 peer-checked:text-purple-800 dark:peer-checked:bg-purple-500/10 dark:peer-checked:text-purple-300', 'text-purple-600 dark:text-purple-400']
  };
  const gradeCards = (sel) => `<div class="grid grid-cols-3 gap-3">${Object.entries(GRADES).map(([k, l]) => `<label class="relative cursor-pointer"><input type="checkbox" name="grades" value="${k}" ${sel.includes(k) ? 'checked' : ''} class="peer sr-only">
    <span class="flex flex-col items-center justify-center p-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 ${GRADE_UI[k][1]} peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500/50 hover:shadow-sm transition"><span class="text-xs font-bold uppercase tracking-wider">${l}</span><span class="text-[10px] mt-0.5 opacity-80">${GRADE_UI[k][0]}</span></span>
    <i class="fa-solid fa-circle-check absolute top-1.5 right-1.5 text-[11px] opacity-0 peer-checked:opacity-100 transition ${GRADE_UI[k][2]}"></i></label>`).join('')}</div>`;
  const initialsOf = (n) => (String(n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || 'DC').toUpperCase();
  const logoBox = (logo, name) => logo
    ? `<img src="${esc(logo)}" alt="Logo instansi" class="w-16 h-16 rounded-2xl object-contain p-1 bg-white border border-slate-200 dark:border-slate-700">`
    : `<div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-2xl font-extrabold shadow-md shadow-indigo-500/25">${esc(initialsOf(name))}</div>`;
  const TABS = [['profil', 'fa-building', 'Profil Instansi'], ['tahun', 'fa-graduation-cap', 'Tahun Ajaran & Jenjang'], ['nilai', 'fa-clipboard-list', 'Penilaian & Tugas'], ['keamanan', 'fa-shield-halved', 'Keamanan & Notifikasi']];
  const TAB_ON = ['text-indigo-600', 'dark:text-indigo-400', 'border-indigo-600', 'dark:border-indigo-400'], TAB_OFF = ['text-slate-500', 'dark:text-slate-400', 'border-transparent'];
  let spyOff = null;

  function fileToLogo(file) {
    return new Promise((res, rej) => {
      if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) return rej(new Error('Format logo harus SVG, PNG, atau JPG.'));
      if (file.size > 2 * 1024 * 1024) return rej(new Error('Ukuran logo maksimal 2 MB.'));
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('Gagal membaca file logo.'));
      fr.onload = () => {
        if (file.type === 'image/svg+xml') return res(String(fr.result));
        const img = new Image();
        img.onerror = () => rej(new Error('File gambar tidak dapat dibuka.'));
        img.onload = () => { // perkecil maks. 512px agar ringan disimpan
          const k = Math.min(1, 512 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9));
        };
        img.src = String(fr.result);
      };
      fr.readAsDataURL(file);
    });
  }
  function setLogo(data) {
    const f = $('#setForm'); f.elements.logo.value = data || '';
    $('#stLogoBox').innerHTML = logoBox(data, f.elements.name.value);
    $('#stLogoDel').classList.toggle('hidden', !data);
    syncSettingsUi();
  }
  function setActiveTab(id) {
    vSet.querySelectorAll('[data-tabbtn]').forEach((b) => { const on = b.dataset.tabbtn === id; b.classList.remove(...TAB_ON, ...TAB_OFF); b.classList.add(...(on ? TAB_ON : TAB_OFF)); });
  }

  async function renderSettings() {
    try { saved = await settings.get(); } catch (e) { return toast(e.message || 'Gagal memuat pengaturan.', 'error'); }
    const v = saved, yr = (String(v.year).match(/\d{4}/) || [new Date().getFullYear()])[0];
    vSet.innerHTML = `
      <div class="space-y-6">
      <div class="page-hero flex flex-col md:flex-row md:items-center justify-between gap-4"><div>
        ${crumb('Pengaturan Instansi')}<h1 class="${H1}">Pengaturan Instansi<span id="stDirty" class="hidden text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-300/60 dark:border-amber-500/30">Belum disimpan</span></h1>
        <p class="${SUB}">Kelola profil lembaga, tahun ajaran, aturan penilaian, keamanan akun, dan notifikasi.</p></div>
        <div class="flex items-center gap-3 self-start md:self-auto">
          <button type="button" id="stReset" class="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed" disabled>Reset</button>
          <button type="button" id="stSave" class="${BTN} !px-5 !py-2 !text-sm${BTN_OFF}" disabled><i class="fa-solid fa-floppy-disk"></i>Simpan Perubahan</button></div></div>
      <nav id="stTabs" class="sticky top-16 z-20 -mx-1 px-1 flex items-center gap-1 sm:gap-2 overflow-x-auto whitespace-nowrap bg-[#e9edf4]/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        ${TABS.map(([id, ic, t]) => `<button type="button" data-tabbtn="${id}" class="flex items-center gap-2 px-3 sm:px-4 py-3 text-xs sm:text-[13px] font-semibold border-b-2 -mb-px transition hover:text-slate-800 dark:hover:text-slate-200 ${id === 'profil' ? TAB_ON.join(' ') : TAB_OFF.join(' ')}"><i class="fa-solid ${ic}"></i>${t}</button>`).join('')}</nav>
      ${demoNote(settings, '/api/admin/settings')}
      <p id="stErr" class="hidden text-xs font-medium rounded-xl px-4 py-3 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30" role="alert"></p>
      <form id="setForm" class="space-y-6" novalidate>
        <input type="hidden" name="logo" value="${esc(v.logo)}">
        ${sec('profil', 'profil', 'fa-building', 'Identitas Lembaga Edukasi', 'Informasi ini akan tampil pada header portal, sertifikat kelulusan siswa, dan kuitansi.',
          `<div class="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60">
            <div id="stLogoBox" class="shrink-0">${logoBox(v.logo, v.name)}</div>
            <div class="min-w-0"><p class="text-sm font-bold text-slate-800 dark:text-slate-100">Logo Portal Instansi</p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Format yang direkomendasikan: SVG, PNG transparan atau JPG minimal 512×512px (Maks. 2MB).</p>
              <div class="flex items-center gap-3 mt-2.5">
                <button type="button" id="stLogoUp" class="px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-sm">Unggah Logo Baru</button>
                <button type="button" id="stLogoDel" class="${v.logo ? '' : 'hidden '}text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400">Hapus</button>
                <input type="file" id="stLogoFile" accept="image/png,image/jpeg,image/svg+xml" class="hidden"></div></div></div>` +
          `<div class="grid grid-cols-1 sm:grid-cols-2 gap-5">${inp('name', 'Nama instansi', v.name, 'maxlength="60"', { req: 1 })}${inp('tagline', 'Tagline / Slogan', v.tagline, 'maxlength="100"')}</div>` +
          `<div class="grid grid-cols-1 sm:grid-cols-2 gap-5">${inp('email', 'Email kontak lembaga', v.email, 'type="email" placeholder="info@instansi.id"', { req: 1, icon: 'fa-envelope' })}${inp('phone', 'No. Telepon / WhatsApp', v.phone, 'placeholder="+62 812-0000-0000"', { icon: 'fa-phone' })}</div>` +
          inp('website', 'Alamat website resmi', v.website, 'placeholder="https://"', { icon: 'fa-globe' }) +
          `<div>${lab('Alamat fisik kampus / kantor')}<textarea name="address" rows="2" maxlength="200" class="${FIELD}px-3.5 resize-none">${esc(v.address)}</textarea></div>`,
          'INST-' + yr + '-' + initialsOf(v.name))}
        ${sec('tahun', 'tahun', 'fa-graduation-cap', 'Tahun Ajaran & Target Jenjang Edukasi', 'Tentukan kurikulum yang aktif dan jenjang peserta didik yang diizinkan mendaftar modul praktikum.',
          `<div class="grid grid-cols-1 sm:grid-cols-2 gap-5">${inp('year', 'Tahun akademik aktif', v.year, 'placeholder="2026/2027"', { icon: 'fa-calendar' })}<div>${lab('Semester')}<select name="semester" class="${FIELD}px-3 bg-white dark:bg-slate-800/60">${[['Ganjil', 'Semester 1 (Ganjil)'], ['Genap', 'Semester 2 (Genap)']].map(([x, l]) => `<option value="${x}" ${x === v.semester ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>` +
          `<div>${lab('Jenjang yang diselenggarakan', 0, '(klik untuk aktif / nonaktifkan)')}${gradeCards(v.grades)}<p class="text-[11px] text-slate-400 dark:text-slate-500 mt-2">Mempengaruhi pembagian level materi dan studio coding siswa.</p></div>`)}
        ${sec('nilai', 'nilai', 'fa-clipboard-list', 'Penilaian & Tugas', 'Aturan standar kelulusan dan pengumpulan tugas siswa.',
          `<div class="grid grid-cols-1 sm:grid-cols-2 gap-5">${inp('kkm', 'Nilai minimum lulus (KKM)', v.kkm, 'type="number" min="0" max="100"', { unit: '/ 100' })}${inp('defaultDueDays', 'Tenggat default', v.defaultDueDays, 'type="number" min="1" max="365"', { unit: 'Hari' })}</div>` +
          tog('allowLate', 'Izinkan pengumpulan terlambat', 'Siswa tetap dapat mengumpulkan dengan flag terlambat.', v.allowLate) +
          `<div class="sm:max-w-[calc(50%-0.625rem)]">${inp('latePenalty', 'Potongan nilai terlambat', v.latePenalty, 'type="number" min="0" max="100"', { unit: '%' })}</div>`)}
        ${sec('keamanan', 'keamanan', 'fa-shield-halved', 'Keamanan & Sesi', 'Kebijakan autentikasi akun instruktur dan siswa.',
          `<div class="grid grid-cols-1 sm:grid-cols-2 gap-5">${inp('minPassword', 'Password minimal', v.minPassword, 'type="number" min="6" max="32"', { unit: 'Karakter' })}${inp('sessionHours', 'Masa sesi login', v.sessionHours, 'type="number" min="1" max="168"', { unit: 'Jam' })}</div>` +
          tog('forceChangePassword', 'Wajib ganti password pertama', 'Akun baru siswa/guru harus ganti password default saat login pertama.', v.forceChangePassword))}
        ${sec('notif', 'keamanan', 'fa-bell', 'Notifikasi & Broadcast Siswa', 'Pemberitahuan otomatis ke akun siswa di platform.',
          `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${tog('notifNewTask', 'Tugas baru terbit', 'Kirim notifikasi langsung saat instruktur mempublikasikan materi/tugas baru.', v.notifNewTask)}${tog('notifGraded', 'Hasil review & nilai', 'Beri tahu siswa saat review kode dan nilai tugas sudah selesai diperiksa.', v.notifGraded)}</div>`)}
      </form></div>`;
    syncSettingsUi();
    // sorot tab sesuai posisi scroll
    if (spyOff) spyOff();
    const main = vSet.closest('main');
    if (main) {
      const onScroll = () => {
        const secs = [...vSet.querySelectorAll('section[data-tab]')]; let cur = secs.length ? secs[0].dataset.tab : 'profil';
        secs.forEach((s) => { if (s.getBoundingClientRect().top <= 170) cur = s.dataset.tab; });
        if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4 && secs.length) cur = secs[secs.length - 1].dataset.tab;
        setActiveTab(cur);
      };
      main.addEventListener('scroll', onScroll, { passive: true }); spyOff = () => main.removeEventListener('scroll', onScroll);
    }
  }
  vSet.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tabbtn]');
    if (t) { const s = $('#st-' + (t.dataset.tabbtn === 'keamanan' ? 'keamanan' : t.dataset.tabbtn), vSet); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActiveTab(t.dataset.tabbtn); return; }
    if (e.target.closest('#stLogoUp')) return $('#stLogoFile').click();
    if (e.target.closest('#stLogoDel')) setLogo('');
  });
  vSet.addEventListener('change', async (e) => {
    if (e.target.id !== 'stLogoFile') return;
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    try { setLogo(await fileToLogo(f)); } catch (ex) { toast(ex.message || 'Gagal memuat logo.', 'error'); }
  });
  vSet.addEventListener('input', (e) => { if (e.target.closest('#setForm')) syncSettingsUi(); });
  vSet.addEventListener('change', (e) => { if (e.target.closest('#setForm')) syncSettingsUi(); });
  vSet.addEventListener('submit', (e) => e.preventDefault());
  vSet.addEventListener('click', async (e) => {
    const b = e.target.closest('#stSave, #stReset'); if (!b || b.disabled) return;
    if (b.id === 'stReset') return renderSettings();
    const v = readSettings(), err = $('#stErr'), msg = validateSettings(v);
    if (msg) { err.textContent = msg; err.classList.remove('hidden'); err.scrollIntoView({ block: 'nearest' }); return; }
    err.classList.add('hidden'); b.disabled = true;
    try { await settings.put(v); saved = v; toast('Pengaturan disimpan.'); syncSettingsUi(); }
    catch (ex) { b.disabled = false; err.textContent = ex.message || 'Gagal menyimpan pengaturan.'; err.classList.remove('hidden'); }
  });

  /* =====================================================================
     AKSES & HAK INSTRUKTUR
     ===================================================================== */
  const PERMS = [
    ['siswa.kelola', 'Kelola siswa', 'Tambah, ubah, suspend, dan hapus akun siswa', 'fa-user-graduate'],
    ['kurikulum.kelola', 'Kelola kurikulum & tahap', 'Atur modul, jalur belajar, dan tahap', 'fa-book-open'],
    ['codelab.kelola', 'Kelola Code Lab', 'Buat dan ubah tantangan koding', 'fa-flask'],
    ['tugas.kelola', 'Buat & ubah tugas', 'Tambah, ubah, salin, dan hapus tugas', 'fa-list-check'],
    ['tugas.nilai', 'Menilai tugas', 'Lihat jawaban siswa, beri nilai dan revisi', 'fa-clipboard-check'],
    ['badge.kelola', 'Kelola badge', 'Buat dan atur badge penghargaan', 'fa-award'],
    ['plugin.kelola', 'Kelola plugin', 'Unggah, review, dan terbitkan plugin', 'fa-puzzle-piece'],
    ['pengaturan.ubah', 'Ubah pengaturan instansi', 'Profil, penilaian, dan keamanan akun', 'fa-sliders'],
    ['akses.kelola', 'Kelola pengguna & hak akses', 'Tambah akun dan atur peran', 'fa-shield-halved'],
    ['materi.akses', 'Akses materi & studio coding', 'Belajar lewat materi, tahap, dan Code Lab sesuai jenjang', 'fa-laptop-code'],
    ['tugas.kumpul', 'Mengerjakan & mengumpulkan tugas', 'Kirim jawaban tugas dan melihat nilai sendiri', 'fa-paper-plane'],
    ['anak.lihat', 'Pantau perkembangan siswa', 'Lihat progres, nilai, dan badge siswa yang ditautkan ke akun orang tua', 'fa-chart-line']
  ];
  const ROLES = {
    admin: ['Admin', 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30'],
    instruktur: ['Instruktur', 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30'],
    siswa: ['Siswa', 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30'],
    ortu: ['Orang Tua', 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30']
  };
  const roleStore = objStore('/api/admin/roles', 'roles', 'dc-roles', () => ({
    admin: PERMS.map((p) => p[0]),
    instruktur: ['siswa.kelola', 'kurikulum.kelola', 'codelab.kelola', 'tugas.kelola', 'tugas.nilai', 'badge.kelola'],
    siswa: ['materi.akses', 'tugas.kumpul'],
    ortu: ['anak.lihat']
  }));
  const meInfo = () => { const m = window.DCAdminMe || {}, u = m.user || m; return { name: u.full_name || u.fullName || u.name || u.username || 'Admin', email: u.email || 'admin@diengcyber.local' }; };
  const instr = makeStore('/api/admin/instructors', 'dc-instructors', () => [
    { id: 1, ...meInfo(), role: 'admin', grades: ['SD', 'SMP', 'SMK'], active: true },
    { id: 2, name: 'Nurul Hidayah', email: 'nurul@diengcyber.local', role: 'instruktur', grades: ['SMP', 'SMK'], active: true },
    { id: 3, name: 'Rizky Pratama', email: 'rizky@diengcyber.local', role: 'instruktur', grades: ['SD'], active: true },
    { id: 4, name: 'Salsa Amelia', email: 'salsa@diengcyber.local', role: 'siswa', grades: ['SMP'], active: false },
    { id: 5, name: 'Siti Aminah', email: 'siti@diengcyber.local', role: 'ortu', grades: ['SD'], active: true }
  ]);
  let people = [], rolesSaved = null, rolesNow = null;
  const isSelf = (p) => !!(p.email && p.email.toLowerCase() === meInfo().email.toLowerCase());
  const initials = (n) => { const w = String(n || '?').trim().split(/\s+/); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const rolesDirty = () => JSON.stringify(Object.keys(rolesNow).sort().map((k) => [k, rolesNow[k].slice().sort()])) !== JSON.stringify(Object.keys(rolesSaved).sort().map((k) => [k, rolesSaved[k].slice().sort()]));

  function drawMatrix() {
    $('#rlBody').innerHTML = PERMS.map(([k, label, desc, icon]) => `<tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
      <td class="py-3.5 px-6"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center text-xs"><i class="fa-solid ${icon}"></i></div>
        <div><p class="font-semibold text-slate-900 dark:text-white text-sm">${label}</p><p class="text-xs text-slate-500 dark:text-slate-400">${desc}</p></div></div></td>
      ${Object.keys(ROLES).map((r) => `<td class="py-3.5 px-4 text-center"><label class="inline-flex ${r === 'admin' ? 'cursor-not-allowed' : 'cursor-pointer'}"><input type="checkbox" data-role="${r}" data-perm="${k}" ${rolesNow[r].includes(k) || r === 'admin' ? 'checked' : ''} ${r === 'admin' ? 'disabled' : ''} class="peer sr-only">
        <span class="w-6 h-6 rounded-lg border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center text-transparent peer-checked:bg-sky-600 peer-checked:border-sky-600 peer-checked:text-white peer-disabled:opacity-60 transition"><i class="fa-solid fa-check text-[10px]"></i></span></label></td>`).join('')}</tr>`).join('');
    const d = rolesDirty(); $('#rlSave').disabled = !d; $('#rlReset').disabled = !d;
  }
  function drawPeople() {
    $('#akCount').textContent = people.length + ' Akun';
    $('#akBody').innerHTML = people.length ? people.map((p) => {
      const self = isSelf(p), role = ROLES[p.role] || [String(p.role || '-'), 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'];
      return `<tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 ${p.active ? '' : 'opacity-60'}">
        <td class="py-3.5 px-6"><div class="flex items-center gap-3"><div class="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white text-xs font-bold flex items-center justify-center">${esc(initials(p.name))}</div>
          <div class="min-w-0"><p class="font-semibold text-slate-900 dark:text-white truncate">${esc(p.name)}${self ? ' <span class="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500">Anda</span>' : ''}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">${esc(p.email)}</p></div></div></td>
        <td class="py-3.5 px-4"><span class="text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap ${role[1]}">${role[0]}</span></td>
        <td class="py-3.5 px-4"><div class="flex flex-wrap gap-1">${(p.grades || []).length ? p.grades.map((g) => `<span class="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${esc(GRADES[g] || g)}</span>`).join('') : '<span class="text-xs text-slate-300 dark:text-slate-600">—</span>'}</div></td>
        <td class="py-3.5 px-4"><span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${p.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30' : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}"><span class="w-1.5 h-1.5 rounded-full ${p.active ? 'bg-emerald-500' : 'bg-slate-400'}"></span>${p.active ? 'Aktif' : 'Nonaktif'}</span></td>
        <td class="py-3.5 px-6 text-right"><div class="inline-flex items-center gap-1">
          <button type="button" data-a="edit" data-id="${p.id}" class="${BTN_GHOST}" title="Ubah"><i class="fa-solid fa-pencil text-sm"></i></button>
          <button type="button" data-a="toggle" data-id="${p.id}" ${self ? 'disabled' : ''} class="${BTN_GHOST} disabled:opacity-30 disabled:cursor-not-allowed" title="${self ? 'Akun Anda sendiri tidak bisa dinonaktifkan' : p.active ? 'Nonaktifkan' : 'Aktifkan'}"><i class="fa-solid ${p.active ? 'fa-user-slash' : 'fa-user-check'} text-sm"></i></button>
          <button type="button" data-a="del" data-id="${p.id}" ${self ? 'disabled' : ''} class="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition disabled:opacity-30 disabled:cursor-not-allowed" title="${self ? 'Akun Anda sendiri tidak bisa dihapus' : 'Hapus'}"><i class="fa-regular fa-trash-can text-sm"></i></button></div></td></tr>`;
    }).join('') : '<tr><td colspan="5" class="py-10 px-6 text-center text-sm text-slate-500 dark:text-slate-400">Belum ada pengguna. Klik Tambah Pengguna.</td></tr>';
  }
  async function renderAkses() {
    try { [people, rolesSaved] = await Promise.all([instr.list(), roleStore.get()]); } catch (e) { return toast(e.message || 'Gagal memuat data akses.', 'error'); }
    // data contoh lama di browser belum punya orang tua: tambahkan satu kali (hanya mode lokal)
    try {
      if (instr.isLocal() && !people.some((x) => x.role === 'ortu') && !localStorage.getItem('dc-seed-ortu')) {
        localStorage.setItem('dc-seed-ortu', '1');
        await instr.save({ name: 'Siti Aminah', email: 'siti@diengcyber.local', role: 'ortu', grades: ['SD'], active: true });
        people = await instr.list();
      }
    } catch (_) {}
    ['super', 'asisten'].forEach((k) => { delete rolesSaved[k]; }); // data lama: 'super' kini 'admin', 'asisten' diganti 'siswa'
    Object.keys(ROLES).forEach((r) => { if (!Array.isArray(rolesSaved[r])) rolesSaved[r] = []; });
    people = people.map((x) => (x.role === 'super' ? { ...x, role: 'admin' } : x.role === 'asisten' ? { ...x, role: 'siswa' } : x));
    rolesNow = clone(rolesSaved);
    const th = 'py-4 px-4 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
    vAk.innerHTML = `
      <div class="page-hero flex flex-col md:flex-row md:items-center justify-between gap-4"><div>
        ${crumb('Akses &amp; Hak Pengguna')}<h1 class="${H1}">Akses &amp; Hak Pengguna<span id="akCount" class="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border border-sky-300/60 dark:border-sky-500/30">0 Akun</span></h1>
        <p class="${SUB}">Atur akun admin, instruktur, siswa, dan orang tua, serta apa yang boleh dilakukan tiap peran.</p></div>
        <button type="button" data-a="new" class="${BTN} self-start md:self-auto"><i class="fa-solid fa-plus text-xs"></i><span>Tambah Pengguna</span></button></div>
      ${demoNote(instr, '/api/admin/instructors')}
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left border-collapse">
        <thead><tr class="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800"><th class="${th} px-6 min-w-[260px]">Pengguna</th><th class="${th} min-w-[130px]">Peran</th><th class="${th} min-w-[150px]">Jenjang</th><th class="${th} min-w-[110px]">Status</th><th class="${th} px-6 text-right min-w-[130px]">Aksi</th></tr></thead>
        <tbody id="akBody" class="divide-y divide-slate-100 dark:divide-slate-800 text-sm"></tbody></table></div></div>

      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div><h3 class="font-bold text-slate-900 dark:text-white">Hak Akses per Peran</h3><p class="text-xs text-slate-500 dark:text-slate-400">Centang fitur yang boleh dipakai tiap peran. Admin selalu punya semua hak.</p></div>
          <div class="flex items-center gap-2"><button type="button" id="rlReset" class="${GHOST_BTN}" disabled>Kembalikan</button>
            <button type="button" id="rlSave" class="${BTN}${BTN_OFF}" disabled><i class="fa-solid fa-floppy-disk"></i>Simpan Hak Akses</button></div></div>
        <div class="overflow-x-auto"><table class="w-full text-left border-collapse">
          <thead><tr class="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800"><th class="${th} px-6 min-w-[300px]">Fitur</th>${Object.entries(ROLES).map(([k, r]) => `<th class="${th} text-center min-w-[110px]">${r[0]}</th>`).join('')}</tr></thead>
          <tbody id="rlBody" class="divide-y divide-slate-100 dark:divide-slate-800"></tbody></table></div></div>`;
    drawPeople(); drawMatrix();
  }

  function personForm(p) {
    p = p || { name: '', email: '', role: 'instruktur', grades: ['SMP'], active: true };
    const self = p.id && isSelf(p);
    modal(p.id ? 'Ubah Pengguna' : 'Tambah Pengguna', `
      ${field('Nama lengkap', `<input name="name" maxlength="60" value="${esc(p.name)}" class="${INPUT}" placeholder="Contoh: Nurul Hidayah">`)}
      ${field('Email', `<input name="email" type="email" value="${esc(p.email)}" class="${INPUT}" placeholder="nama@instansi.id">`)}
      ${field('Peran', `<select name="role" class="${INPUT}" ${self ? 'disabled' : ''}>${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${k === p.role ? 'selected' : ''}>${r[0]}</option>`).join('')}</select>${self ? '<p class="text-[11px] text-slate-400 mt-1">Peran akun Anda sendiri tidak bisa diubah.</p>' : ''}`)}
      ${field('Jenjang terkait', `<div class="flex flex-wrap gap-2">${Object.entries(GRADES).map(([k, l]) => `<label class="cursor-pointer"><input type="checkbox" name="grades" value="${k}" ${(p.grades || []).includes(k) ? 'checked' : ''} class="peer sr-only"><span class="inline-flex px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 peer-checked:bg-sky-600 peer-checked:text-white peer-checked:border-sky-600 transition">${l}</span></label>`).join('')}</div>`)}
      ${self ? '' : `<label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" name="active" value="1" ${p.active ? 'checked' : ''} class="rounded"> Akun aktif (boleh login)</label>`}`,
      async (f, form) => {
        const name = (f.name || '').trim(), email = (f.email || '').trim().toLowerCase();
        const role = self ? p.role : (f.role || 'instruktur');
        const grades = Array.from(form.querySelectorAll('[name=grades]:checked')).map((x) => x.value);
        if (!name) return 'Nama harus diisi.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Format email tidak valid.';
        if (people.some((x) => x.id !== p.id && (x.email || '').toLowerCase() === email)) return 'Email sudah dipakai pengguna lain.';
        if (!['admin', 'ortu'].includes(role) && !grades.length) return 'Pilih minimal satu jenjang yang diampu.';
        const res = await instr.save({ ...(p.id ? { id: p.id } : {}), name, email, role, grades, active: self ? true : f.active === '1' });
        toast(p.id ? 'Data pengguna diperbarui.' : 'Pengguna ditambahkan.');
        await renderAkses();
        if (res && res.temporaryPassword) await window.dcConfirm({ title: 'Akun pengguna dibuat', message: 'Berikan password sementara ini ke pengguna. Password hanya ditampilkan sekali.', detail: res.temporaryPassword, confirmText: 'Sudah dicatat', cancelText: 'Tutup', tone: 'success' });
      });
  }
  vAk.addEventListener('click', async (e) => {
    const rs = e.target.closest('#rlSave, #rlReset');
    if (rs && !rs.disabled) {
      if (rs.id === 'rlReset') { rolesNow = clone(rolesSaved); return drawMatrix(); }
      rs.disabled = true;
      try { await roleStore.put(rolesNow); rolesSaved = clone(rolesNow); toast('Hak akses disimpan.'); drawMatrix(); }
      catch (ex) { rs.disabled = false; toast(ex.message || 'Gagal menyimpan hak akses.', 'error'); }
      return;
    }
    const a = e.target.closest('[data-a]'); if (!a || a.disabled) return;
    const p = people.find((x) => String(x.id) === a.dataset.id);
    if (a.dataset.a === 'new') return personForm();
    if (a.dataset.a === 'edit' && p) return personForm(p);
    if (a.dataset.a === 'toggle' && p) {
      try { await instr.save({ id: p.id, active: !p.active }); toast(p.active ? 'Akun dinonaktifkan.' : 'Akun diaktifkan.'); renderAkses(); } catch (ex) { toast(ex.message || 'Gagal mengubah status akun.', 'error'); }
    }
    if (a.dataset.a === 'del' && p) {
      if (!(await window.dcConfirm({ title: 'Hapus pengguna?', message: 'Akun ini tidak akan bisa login lagi ke panel admin.', detail: p.name + ' (' + p.email + ')', confirmText: 'Hapus', tone: 'danger' }))) return;
      try { await instr.remove(p.id); toast('Pengguna dihapus.'); renderAkses(); } catch (ex) { toast(ex.message || 'Gagal menghapus pengguna.', 'error'); }
    }
  });
  vAk.addEventListener('change', (e) => {
    const c = e.target.closest('[data-role]'); if (!c) return;
    const list = rolesNow[c.dataset.role], k = c.dataset.perm, i = list.indexOf(k);
    if (c.checked && i < 0) list.push(k); else if (!c.checked && i >= 0) list.splice(i, 1);
    const d = rolesDirty(); $('#rlSave').disabled = !d; $('#rlReset').disabled = !d;
  });

  // ---------- muat saat halaman dibuka ----------
  window.addEventListener('dc:view', (e) => {
    if (e.detail === 'pengaturan') renderSettings();
    if (e.detail === 'akses') renderAkses();
  });
})();
