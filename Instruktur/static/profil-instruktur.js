// ============================================================
// PENGATURAN PROFIL INSTRUKTUR (portal Instruktur)
//
// Halaman ini TIDAK ada di menu sidebar. Dibuka lewat avatar di topbar / kartu akun di sidebar
// (atribut data-view="profil") atau langsung lewat alamat  #profil.
//
// Tab:
//   Profil & Keahlian     info pribadi, bio, track mengajar, tautan LinkedIn/GitHub/Portofolio
//   Preferensi Mentoring  link Zoom default, passcode, zona waktu, pengingat, toggle
//   Keamanan Akun         ubah kata sandi + riwayat sesi login aktif
//
// ENDPOINT (belum ada di backend -> otomatis memakai data lokal browser, sama seperti modul lain):
//   GET   /api/instruktur/profil   -> { ok, item: { nama, peran, email, whatsapp, bio, track: [..], linkedin, github, portofolio,
//                                                    zoomLink, zoomPasscode, zonaWaktu, pengingat, terimaTugas, notifWa,
//                                                    fotoUrl?, statistik?: { sesiZoom, kelasAktif, rating } } }
//   PATCH /api/instruktur/profil   { ...field di atas }  -> { item }
//   POST  /api/instruktur/profil/password  { lama, baru }  -> { ok }
//   GET   /api/instruktur/sesi-login       -> { items: [{ id, perangkat, lokasi, terakhir, saatIni }] }
//   POST  /api/instruktur/sesi-login/:id/keluarkan
// ============================================================
(function (root) {
  'use strict';
  if (root.DCProfil) return;

  const KEY = 'dci-profil';
  const TRACKS = ['Scratch Jr', 'Python', '3D Roblox', 'AI & Creative Tech', 'Web Dev', 'App Inventor', 'Robotika & IoT'];
  const TABS = [
    { id: 'profil', label: 'Profil & Keahlian', icon: 'fa-user' },
    { id: 'mentoring', label: 'Preferensi Mentoring', icon: 'fa-video' },
    { id: 'keamanan', label: 'Keamanan Akun', icon: 'fa-shield-halved' }
  ];
  const ZONA = [
    ['WIB', 'WIB (UTC+07:00) — Jakarta'],
    ['WITA', 'WITA (UTC+08:00) — Makassar'],
    ['WIT', 'WIT (UTC+09:00) — Jayapura']
  ];
  const PENGINGAT = [[5, '5 menit sebelum mulai'], [10, '10 menit sebelum mulai'], [15, '15 menit sebelum mulai'], [30, '30 menit sebelum mulai'], [60, '1 jam sebelum mulai']];
  const BIO_MAX = 240;

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const req = (p, o) => root.DCAdminApi.request(p, o);
  const missing = (e) => e && [0, 404, 405, 501].includes(e.status);
  const toast = (m, t) => (root.showToast ? root.showToast(m, t) : undefined);

  const defaults = () => ({
    nama: 'Instruktur RuangKKA',
    peran: 'Instruktur Koding & AI — Dieng Cyber',
    email: 'instruktur@ruangkka.id',
    whatsapp: '+62 812-3456-7890',
    bio: 'Membimbing siswa mengenal logika pemrograman visual, Python dasar, dan kecerdasan artifisial secara kreatif dan interaktif.',
    track: ['Scratch Jr', 'Python', '3D Roblox', 'AI & Creative Tech'],
    linkedin: 'linkedin.com/in/instruktur-kka',
    github: 'github.com/ruangkka-mentor',
    portofolio: 'ruangkka.id/mentor',
    zoomLink: 'https://zoom.us/j/98421057731?pwd=ruangkka2026',
    zoomPasscode: 'KKA2026',
    zonaWaktu: 'WIB',
    pengingat: 15,
    terimaTugas: true,
    notifWa: true,
    fotoUrl: '',
    statistik: { sesiZoom: 24, kelasAktif: 4, rating: 4.9 }
  });

  const S = {
    host: null, init: false, local: false, tab: 'profil',
    saved: null,   // salinan terakhir yang tersimpan (untuk Batalkan & deteksi perubahan)
    draft: null,   // salinan yang sedang diedit
    show: {},      // status tampil/sembunyi kolom sandi
    sessions: null
  };

  // ---------- penyimpanan: server dulu, cadangan lokal ----------
  const readLocal = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (_) { return null; } };
  const writeLocal = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };

  async function load(me) {
    let item = null;
    try { const r = await req('/api/instruktur/profil'); item = r.item || r.data || null; S.local = false; }
    catch (e) { if (!missing(e)) { toast(e.message || 'Gagal memuat profil.', 'error'); } S.local = true; }
    const base = { ...defaults(), ...(me && me.name ? { nama: me.name } : {}) };
    item = { ...base, ...(S.local ? (readLocal() || {}) : (item || {})) };
    item.track = Array.isArray(item.track) ? item.track.slice() : [];
    item.statistik = { ...base.statistik, ...(item.statistik || {}) };
    S.saved = item; S.draft = JSON.parse(JSON.stringify(item));
  }

  async function persist(body) {
    if (!S.local) {
      try { const r = await req('/api/instruktur/profil', { method: 'PATCH', body }); return r.item || body; }
      catch (e) { if (!missing(e)) throw e; S.local = true; }
    }
    writeLocal(body); return body;
  }

  async function loadSessions() {
    if (S.sessions) return S.sessions;
    try { const r = await req('/api/instruktur/sesi-login'); S.sessions = r.items || []; return S.sessions; }
    catch (e) {
      if (!missing(e)) toast(e.message || 'Gagal memuat sesi login.', 'error');
      const ua = navigator.userAgent || '';
      const os = /Windows/.test(ua) ? 'Windows 11' : /Mac/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'Perangkat ini';
      const br = /Edg\//.test(ua) ? 'Microsoft Edge' : /Chrome\//.test(ua) ? 'Google Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Peramban';
      S.sessions = [
        { id: 'now', perangkat: os + ' • ' + br, lokasi: 'Wonosobo, Jawa Tengah', terakhir: 'Aktif sekarang', saatIni: true },
        { id: 'demo-2', perangkat: 'Android • Chrome Mobile', lokasi: 'Jawa Tengah', terakhir: 'Login kemarin, 19:42 WIB', saatIni: false }
      ];
      return S.sessions;
    }
  }

  // ---------- util tampilan ----------
  const initials = (name) => { const p = String(name || 'I').trim().split(/\s+/); return ((p[0] || 'I')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
  const dirty = () => JSON.stringify(S.draft) !== JSON.stringify(S.saved);
  const completeness = (d) => {
    const checks = [d.nama, d.peran, d.email, d.whatsapp, d.bio, d.track.length, d.linkedin || d.github || d.portofolio, d.zoomLink, d.fotoUrl];
    const ok = checks.filter(Boolean).length;
    return Math.round((ok / checks.length) * 100);
  };
  const strength = (pw) => {
    if (!pw) return { n: 0, label: 'Belum diisi', tone: 'text-slate-400' };
    let n = 0;
    if (pw.length >= 8) n++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++;
    if (/\d/.test(pw)) n++;
    if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) n++;
    const L = [['Lemah', 'text-rose-500'], ['Lemah', 'text-rose-500'], ['Cukup', 'text-amber-500'], ['Kuat', 'text-jade-600'], ['Sangat kuat', 'text-jade-600']];
    return { n, label: L[n][0], tone: L[n][1] };
  };

  const CARD = 'bg-white dark:bg-slate-900 rounded-3xl shadow-card border border-jade-50 dark:border-slate-800';
  const INPUT = 'w-full bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-jade-500/15 focus:border-jade-400 transition';
  const LABEL = 'block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5';

  const field = (label, name, val, opt) => {
    opt = opt || {};
    const icon = opt.icon ? `<i class="fa-solid ${opt.icon} absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>` : '';
    return `<div class="${opt.span || ''}"><label class="${LABEL}" for="pf-${name}">${label}</label>
      <div class="relative">${icon}<input id="pf-${name}" data-f="${name}" type="${opt.type || 'text'}" value="${esc(val)}" placeholder="${esc(opt.ph || '')}" autocomplete="${opt.ac || 'off'}" class="${INPUT} ${opt.icon ? 'pl-9' : ''}"></div></div>`;
  };

  const panelHead = (title, sub, icon) => `<div class="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
    <div><h2 class="font-bold text-[15px] text-slate-900 dark:text-white">${title}</h2><p class="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">${sub}</p></div>
    <span class="w-9 h-9 shrink-0 rounded-xl bg-jade-50 dark:bg-jade-500/10 text-jade-600 dark:text-jade-300 grid place-items-center text-sm"><i class="fa-solid ${icon}"></i></span></div>`;

  const toggleRow = (name, title, desc, on) => `<div class="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 px-4 py-3.5">
    <div class="min-w-0"><p class="text-[13px] font-bold text-slate-900 dark:text-white">${title}</p><p class="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">${desc}</p></div>
    <button type="button" role="switch" aria-checked="${on}" aria-label="${esc(title)}" data-toggle="${name}" class="relative shrink-0 w-11 h-6 rounded-full transition ${on ? 'bg-jade-500' : 'bg-slate-300 dark:bg-slate-600'}">
      <span class="absolute top-0.5 ${on ? 'left-[1.375rem]' : 'left-0.5'} w-5 h-5 rounded-full bg-white shadow transition-all"></span></button></div>`;

  // ---------- kartu kiri ----------
  function cardLeft() {
    const d = S.draft, pct = completeness(d), st = d.statistik;
    const avatar = d.fotoUrl
      ? `<img src="${esc(d.fotoUrl)}" alt="Foto profil" class="w-full h-full object-cover rounded-[1.1rem]">`
      : `<span class="text-3xl font-extrabold">${esc(initials(d.nama))}</span>`;
    return `<aside class="space-y-5 lg:sticky lg:top-24 self-start">
      <article class="${CARD} overflow-hidden">
        <div class="h-20 bg-gradient-to-r from-jade-600 to-jade-400 relative"><span class="absolute top-3 right-3 inline-flex items-center gap-1.5 bg-white/95 text-jade-700 text-[10.5px] font-bold px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-jade-500"></span>Aktif Mengajar</span></div>
        <div class="px-5 pb-5">
          <div class="flex items-end justify-between -mt-9">
            <div class="relative"><div class="w-20 h-20 rounded-[1.25rem] bg-gradient-to-br from-jade-500 to-jade-700 text-white grid place-items-center ring-4 ring-white dark:ring-slate-900 shadow-soft overflow-hidden">${avatar}</div>
              <button type="button" data-act="foto" title="Ganti foto" class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-slate-900 text-white grid place-items-center text-[11px] ring-2 ring-white dark:ring-slate-900"><i class="fa-solid fa-camera"></i></button></div>
            <button type="button" data-act="foto" class="text-[11px] font-bold text-jade-700 dark:text-jade-300 bg-jade-50 dark:bg-jade-500/10 px-3 py-1.5 rounded-full hover:bg-jade-100 transition">Ganti Foto</button>
            <input type="file" id="pf-foto" accept="image/png,image/jpeg,image/webp" class="hidden">
          </div>
          <h3 class="mt-4 text-[17px] font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">${esc(d.nama || 'Instruktur')}<i class="fa-regular fa-circle-check text-jade-500 text-sm" title="Terverifikasi"></i></h3>
          <p class="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">${esc(d.peran)}</p>
          <p class="mt-4 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3.5">${esc(d.bio) || '<span class="text-slate-400">Bio belum diisi.</span>'}</p>
          <p class="mt-4 text-[10px] font-bold tracking-wider uppercase text-slate-400">Track mengajar aktif</p>
          <div class="mt-2 flex flex-wrap gap-1.5">${d.track.length ? d.track.map((t) => `<span class="text-[10.5px] font-bold text-jade-700 dark:text-jade-300 bg-jade-50 dark:bg-jade-500/10 border border-jade-100 dark:border-jade-500/20 px-2.5 py-1 rounded-lg">${esc(t)}</span>`).join('') : '<span class="text-[11px] text-slate-400">Belum ada track dipilih.</span>'}</div>
          <div class="mt-5 grid grid-cols-3 gap-2.5">
            <div class="rounded-xl bg-jade-50/80 dark:bg-jade-500/10 border border-jade-100 dark:border-jade-500/20 py-3 text-center"><p class="text-lg font-extrabold text-jade-700 dark:text-jade-300">${esc(st.sesiZoom)}</p><p class="text-[10px] text-slate-500">Sesi Zoom</p></div>
            <div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 py-3 text-center"><p class="text-lg font-extrabold text-slate-800 dark:text-slate-100">${esc(st.kelasAktif)}</p><p class="text-[10px] text-slate-500">Kelas Aktif</p></div>
            <div class="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 py-3 text-center"><p class="text-lg font-extrabold text-amber-600">${esc(st.rating)}<span class="text-sm">★</span></p><p class="text-[10px] text-slate-500">Rating Siswa</p></div>
          </div>
        </div>
      </article>
      <article class="${CARD} p-5">
        <div class="flex items-center justify-between text-[12px] font-bold text-slate-900 dark:text-white"><span>Kelengkapan Profil Instruktur</span><span class="text-jade-600">${pct}%</span></div>
        <div class="mt-2.5 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full bg-jade-600 transition-all" style="width:${pct}%"></div></div>
        ${pct < 100 ? `<p class="mt-2.5 text-[11px] text-slate-500 flex items-center gap-1.5"><i class="fa-regular fa-circle-question"></i>${d.fotoUrl ? 'Lengkapi data yang masih kosong untuk mencapai 100% kelengkapan.' : 'Unggah foto profil formal untuk mencapai 100% kelengkapan.'}</p>` : ''}
      </article></aside>`;
  }

  // ---------- panel kanan per tab ----------
  function tabProfil() {
    const d = S.draft, len = (d.bio || '').length;
    return `<section class="${CARD}">${panelHead('Informasi Pribadi &amp; Akademik', 'Informasi ini ditampilkan pada kartu instruktur di kelas siswa.', 'fa-id-card')}
      <div class="p-6 grid sm:grid-cols-2 gap-x-5 gap-y-4">
        ${field('Nama Lengkap &amp; Gelar', 'nama', d.nama, { ac: 'name' })}
        ${field('Peran / Afiliasi Mengajar', 'peran', d.peran)}
        ${field('Email Institusi', 'email', d.email, { type: 'email', icon: 'fa-envelope', ac: 'email' })}
        ${field('Nomor WhatsApp Aktif', 'whatsapp', d.whatsapp, { type: 'tel', icon: 'fa-phone', ac: 'tel' })}
        <div class="sm:col-span-2"><div class="flex items-center justify-between"><label class="${LABEL}" for="pf-bio">Bio Singkat Instruktur</label><span id="pfBioCount" class="text-[10.5px] text-slate-400 mb-1.5">${len} / ${BIO_MAX} karakter</span></div>
          <textarea id="pf-bio" data-f="bio" rows="3" maxlength="${BIO_MAX}" class="${INPUT} resize-none">${esc(d.bio)}</textarea></div>
      </div></section>
      <section class="${CARD}">${panelHead('Spesialisasi &amp; Track Mengajar', 'Klik untuk memilih atau menghapus topik kurikulum yang Anda ampu.', 'fa-microchip')}
        <div class="p-6 space-y-5">
          <div class="flex flex-wrap gap-2">${TRACKS.map((t) => { const on = d.track.includes(t); return `<button type="button" data-track="${esc(t)}" aria-pressed="${on}" class="inline-flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-2 rounded-xl border transition ${on ? 'bg-jade-600 text-white border-jade-600 shadow-soft' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-jade-300'}"><i class="fa-solid ${on ? 'fa-check' : 'fa-plus'} text-[10px]"></i>${esc(t)}</button>`; }).join('')}</div>
          <div class="grid sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            ${field('LinkedIn', 'linkedin', d.linkedin, { icon: 'fa-brands fa-linkedin' })}
            ${field('GitHub', 'github', d.github, { icon: 'fa-brands fa-github' })}
            ${field('Portofolio / Web', 'portofolio', d.portofolio, { icon: 'fa-globe' })}
          </div></div></section>`;
  }

  function tabMentoring() {
    const d = S.draft;
    const sel = (name, opts, cur) => `<select id="pf-${name}" data-f="${name}" class="${INPUT} pr-8">${opts.map((o) => `<option value="${esc(o[0])}" ${String(o[0]) === String(cur) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    return `<section class="${CARD}">${panelHead('Konfigurasi Ruang Zoom Mentoring', 'Tautan default ini otomatis terisi saat Anda membuat Jadwal Zoom baru.', 'fa-video')}
      <div class="p-6 space-y-4">
        <div><label class="${LABEL}" for="pf-zoomLink">Default Link Personal Meeting Room (Zoom)</label>
          <div class="flex gap-2.5"><div class="relative flex-1 min-w-0"><i class="fa-solid fa-link absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input id="pf-zoomLink" data-f="zoomLink" type="url" value="${esc(d.zoomLink)}" placeholder="https://zoom.us/j/..." class="${INPUT} pl-9"></div>
            <button type="button" data-act="salin" class="dc-btn dc-btn-sec shrink-0"><i class="fa-regular fa-copy"></i><span>Salin</span></button></div></div>
        <div class="grid sm:grid-cols-3 gap-4">
          ${field('Passcode Default', 'zoomPasscode', d.zoomPasscode)}
          <div><label class="${LABEL}" for="pf-zonaWaktu">Zona Waktu Mengajar</label>${sel('zonaWaktu', ZONA, d.zonaWaktu)}</div>
          <div><label class="${LABEL}" for="pf-pengingat">Pengingat Sebelum Sesi</label>${sel('pengingat', PENGINGAT, d.pengingat)}</div>
        </div>
        <div class="pt-2 space-y-3">
          ${toggleRow('terimaTugas', 'Ketersediaan Menerima Tugas Tambahan', 'Izinkan koordinator kurikulum menugaskan kelas pengganti atau review tugas tambahan.', d.terimaTugas)}
          ${toggleRow('notifWa', 'Notifikasi WhatsApp Otomatis', 'Kirim pengingat jadwal mentoring dan rekap absensi siswa ke WhatsApp Anda.', d.notifWa)}
        </div></div></section>`;
  }

  function pwField(name, label, ph, ac) {
    const shown = !!S.show[name];
    return `<div><label class="${LABEL}" for="pw-${name}">${label}</label><div class="relative">
      <input id="pw-${name}" data-pw="${name}" type="${shown ? 'text' : 'password'}" placeholder="${ph}" autocomplete="${ac}" class="${INPUT} pr-10">
      <button type="button" data-eye="${name}" aria-label="${shown ? 'Sembunyikan' : 'Tampilkan'} kata sandi" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-jade-600 text-xs"><i class="fa-regular ${shown ? 'fa-eye-slash' : 'fa-eye'}"></i></button></div></div>`;
  }

  function tabKeamanan() {
    const ss = S.sessions;
    const sessions = !ss ? '<p class="text-sm text-slate-500 py-2">Memuat sesi login…</p>' : ss.map((s) => {
      const mobile = /android|ios|iphone|mobile/i.test(s.perangkat);
      return `<div class="flex items-center gap-3.5 rounded-2xl border ${s.saatIni ? 'border-jade-200 bg-jade-50/60 dark:bg-jade-500/10 dark:border-jade-500/30' : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'} px-4 py-3.5">
        <span class="w-9 h-9 shrink-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 text-jade-600 grid place-items-center text-sm"><i class="fa-solid ${mobile ? 'fa-mobile-screen' : 'fa-laptop'}"></i></span>
        <div class="min-w-0 flex-1"><p class="text-[13px] font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">${esc(s.perangkat)}${s.saatIni ? '<span class="text-[9.5px] font-bold bg-jade-600 text-white px-2 py-0.5 rounded-full">Perangkat ini</span>' : ''}</p>
          <p class="text-[11px] text-slate-500 mt-0.5">${esc(s.lokasi)} • ${esc(s.terakhir)}</p></div>
        ${s.saatIni ? '' : `<button type="button" data-kick="${esc(s.id)}" class="text-[11.5px] font-bold text-rose-600 hover:text-rose-700 px-2 py-1">Keluarkan</button>`}</div>`;
    }).join('');
    return `<section class="${CARD}">${panelHead('Ubah Kata Sandi', 'Gunakan kombinasi minimal 8 karakter huruf besar, kecil, dan angka.', 'fa-key')}
      <div class="p-6 max-w-md space-y-4">
        ${pwField('lama', 'Kata Sandi Saat Ini', 'Masukkan kata sandi lama', 'current-password')}
        <div>${pwField('baru', 'Kata Sandi Baru', 'Buat kata sandi baru', 'new-password')}
          <div class="mt-2 grid grid-cols-4 gap-1.5" id="pwBars">${[0, 1, 2, 3].map(() => '<span class="h-1 rounded-full bg-slate-200 dark:bg-slate-700"></span>').join('')}</div>
          <p class="mt-1.5 text-[10.5px] text-slate-500">Kekuatan kata sandi: <b id="pwLabel" class="text-slate-400">Belum diisi</b></p></div>
        ${pwField('konfirmasi', 'Konfirmasi Kata Sandi Baru', 'Ulangi kata sandi baru', 'new-password')}
        <p id="pwErr" class="hidden text-[11.5px] font-semibold text-rose-600"></p>
        <button type="button" data-act="ubah-sandi" class="dc-btn dc-btn-pri"><i class="fa-solid fa-key"></i><span>Perbarui Kata Sandi</span></button>
      </div></section>
      <section class="${CARD}">${panelHead('Riwayat Sesi Login Aktif', 'Perangkat yang saat ini masuk menggunakan akun instruktur Anda.', 'fa-shield-halved')}
        <div class="p-6 space-y-3" id="pfSessions">${sessions}</div></section>`;
  }

  // ---------- render ----------
  function render() {
    if (!S.host || !S.draft) return;
    const scroll = root.scrollY;
    const tabs = TABS.map((t) => `<button type="button" role="tab" aria-selected="${S.tab === t.id}" data-tab="${t.id}" class="flex-1 inline-flex items-center justify-center gap-2 text-[12.5px] font-bold px-4 py-2.5 rounded-xl transition ${S.tab === t.id ? 'bg-jade-600 text-white shadow-soft' : 'text-slate-600 dark:text-slate-300 hover:bg-jade-50 dark:hover:bg-slate-800'}"><i class="fa-solid ${t.icon} text-xs"></i><span class="hidden sm:inline">${t.label}</span></button>`).join('');
    const body = S.tab === 'mentoring' ? tabMentoring() : S.tab === 'keamanan' ? tabKeamanan() : tabProfil();
    S.host.innerHTML = `<div class="flex flex-wrap items-end justify-between gap-4">
        <div><nav class="text-[11px] text-slate-500 flex items-center gap-1.5" aria-label="Breadcrumb"><a href="#dashboard" data-view="dashboard" class="hover:text-jade-600">Dashboard</a><i class="fa-solid fa-chevron-right text-[8px]"></i><span class="text-jade-600 font-semibold">Pengaturan Profil</span></nav>
          <h1 class="mt-1 text-2xl md:text-[1.7rem] font-extrabold tracking-tight text-slate-900 dark:text-white">Pengaturan Profil <span class="text-jade-600 dark:text-jade-400">Instruktur</span></h1>
          <p class="text-[12.5px] text-slate-500 dark:text-slate-400 mt-1">Kelola identitas pengajar, bidang keahlian Koding &amp; AI, tautan ruang Zoom, serta keamanan akun Anda.</p></div>
        <div class="flex items-center gap-2.5"><button type="button" data-act="batal" class="dc-btn dc-btn-sec">Batalkan</button>
          <button type="button" data-act="simpan" class="dc-btn dc-btn-pri"><i class="fa-regular fa-circle-check"></i><span>Simpan Perubahan</span></button></div></div>
      ${S.local ? '<p class="text-[11px] font-mono text-amber-600 dark:text-amber-400"><i class="fa-solid fa-flask mr-1"></i>Mode contoh: perubahan disimpan di browser ini sampai endpoint profil tersedia.</p>' : ''}
      <div class="grid lg:grid-cols-[22rem_minmax(0,1fr)] gap-6 items-start">${cardLeft()}
        <div class="space-y-5 min-w-0"><div role="tablist" class="${CARD} p-1.5 flex gap-1.5">${tabs}</div>${body}</div></div>`;
    root.scrollTo(0, scroll);
    if (S.tab === 'keamanan' && !S.sessions) loadSessions().then(() => { if (S.tab === 'keamanan') render(); });
  }

  // kartu kiri + tombol hanya perlu segar saat data berubah; ringkas: render penuh dengan menjaga fokus
  function rerenderKeepFocus() {
    const a = document.activeElement, id = a && a.id, pos = a && a.selectionStart;
    render();
    if (id) { const el = document.getElementById(id); if (el) { el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch (_) {} } }
  }

  // ---------- aksi ----------
  function validate(d) {
    if (!d.nama.trim()) return 'Nama lengkap wajib diisi.';
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return 'Format email tidak valid.';
    if (d.whatsapp && !/^[+\d][\d\s-]{7,}$/.test(d.whatsapp)) return 'Nomor WhatsApp tidak valid.';
    if (d.zoomLink && !/^https?:\/\//i.test(d.zoomLink)) return 'Link Zoom harus diawali https://';
    return '';
  }

  async function save() {
    const err = validate(S.draft);
    if (err) { toast('Gagal: ' + err, 'error'); return; }
    if (!dirty()) { toast('Tidak ada perubahan untuk disimpan.'); return; }
    try {
      const item = await persist(S.draft);
      S.saved = { ...S.draft, ...item }; S.draft = JSON.parse(JSON.stringify(S.saved));
      if (root.DCProfil && typeof root.DCProfil.onSaved === 'function') root.DCProfil.onSaved(S.saved);
      toast('Perubahan profil disimpan.'); render();
    } catch (e) { toast('Gagal menyimpan: ' + (e.message || 'coba lagi.'), 'error'); }
  }

  async function cancel() {
    if (dirty()) {
      const ok = await root.dcConfirm({ title: 'Batalkan perubahan?', message: 'Semua perubahan yang belum disimpan akan dibuang.', confirmText: 'Buang perubahan', tone: 'warning' });
      if (!ok) return;
    }
    S.draft = JSON.parse(JSON.stringify(S.saved)); render();
  }

  async function changePassword() {
    const v = (n) => (document.getElementById('pw-' + n) || {}).value || '';
    const lama = v('lama'), baru = v('baru'), konf = v('konfirmasi');
    const box = document.getElementById('pwErr');
    const fail = (m) => { box.textContent = m; box.classList.remove('hidden'); };
    box.classList.add('hidden');
    if (!lama) return fail('Masukkan kata sandi saat ini.');
    if (baru.length < 8 || !/[a-z]/.test(baru) || !/[A-Z]/.test(baru) || !/\d/.test(baru)) return fail('Kata sandi baru minimal 8 karakter, berisi huruf besar, huruf kecil, dan angka.');
    if (baru === lama) return fail('Kata sandi baru tidak boleh sama dengan yang lama.');
    if (baru !== konf) return fail('Konfirmasi kata sandi tidak cocok.');
    try {
      await req('/api/instruktur/profil/password', { method: 'POST', body: { lama, baru } });
      ['lama', 'baru', 'konfirmasi'].forEach((n) => { const el = document.getElementById('pw-' + n); if (el) el.value = ''; });
      updateStrength('');
      toast('Kata sandi berhasil diperbarui.');
    } catch (e) {
      if (missing(e)) fail('Fitur ubah kata sandi belum tersedia di server.');
      else fail(e.message || 'Gagal memperbarui kata sandi.');
    }
  }

  function updateStrength(pw) {
    const s = strength(pw), bars = document.querySelectorAll('#pwBars span'), lab = document.getElementById('pwLabel');
    const colors = ['bg-rose-500', 'bg-rose-500', 'bg-amber-500', 'bg-jade-500', 'bg-jade-600'];
    bars.forEach((b, i) => {
      b.className = 'h-1 rounded-full ' + (i < s.n ? colors[s.n] : 'bg-slate-200 dark:bg-slate-700');
    });
    if (lab) { lab.textContent = s.label; lab.className = s.tone; }
  }

  function bind(host) {
    if (host._pfBound) return; host._pfBound = true;

    host.addEventListener('input', (e) => {
      const f = e.target.dataset && e.target.dataset.f;
      if (f) {
        S.draft[f] = f === 'pengingat' ? Number(e.target.value) : e.target.value;
        if (f === 'bio') { const c = document.getElementById('pfBioCount'); if (c) c.textContent = e.target.value.length + ' / ' + BIO_MAX + ' karakter'; }
        if (['nama', 'peran', 'bio', 'linkedin', 'github', 'portofolio', 'zoomLink'].includes(f)) {
          clearTimeout(S._t); S._t = setTimeout(rerenderKeepFocus, 350);   // kartu kiri ikut diperbarui
        }
        return;
      }
      if (e.target.dataset && e.target.dataset.pw === 'baru') updateStrength(e.target.value);
    });
    host.addEventListener('change', (e) => {
      const f = e.target.dataset && e.target.dataset.f;
      if (f && e.target.tagName === 'SELECT') S.draft[f] = f === 'pengingat' ? Number(e.target.value) : e.target.value;
      if (e.target.id === 'pf-foto' && e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (file.size > 2 * 1024 * 1024) { toast('Gagal: ukuran foto maksimal 2 MB.', 'error'); return; }
        const rd = new FileReader();
        rd.onload = () => { S.draft.fotoUrl = String(rd.result); render(); };
        rd.readAsDataURL(file);
      }
    });
    host.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-tab],[data-track],[data-toggle],[data-act],[data-eye],[data-kick]');
      if (!t) return;
      if (t.dataset.tab) { S.tab = t.dataset.tab; render(); return; }
      if (t.dataset.track) {
        const n = t.dataset.track, i = S.draft.track.indexOf(n);
        if (i >= 0) S.draft.track.splice(i, 1); else S.draft.track.push(n);
        S.draft.track.sort((a, b) => TRACKS.indexOf(a) - TRACKS.indexOf(b)); render(); return;
      }
      if (t.dataset.toggle) { S.draft[t.dataset.toggle] = !S.draft[t.dataset.toggle]; render(); return; }
      if (t.dataset.eye) {
        const n = t.dataset.eye, inp = document.getElementById('pw-' + n);
        S.show[n] = !S.show[n]; inp.type = S.show[n] ? 'text' : 'password';
        t.innerHTML = '<i class="fa-regular ' + (S.show[n] ? 'fa-eye-slash' : 'fa-eye') + '"></i>'; return;
      }
      if (t.dataset.kick) {
        const ok = await root.dcConfirm({ title: 'Keluarkan perangkat ini?', message: 'Perangkat tersebut harus login ulang untuk mengakses akun Anda.', confirmText: 'Keluarkan', tone: 'warning' });
        if (!ok) return;
        try { await req('/api/instruktur/sesi-login/' + encodeURIComponent(t.dataset.kick) + '/keluarkan', { method: 'POST' }); }
        catch (ex) { if (!missing(ex)) { toast('Gagal mengeluarkan perangkat.', 'error'); return; } }
        S.sessions = (S.sessions || []).filter((s) => String(s.id) !== t.dataset.kick);
        toast('Perangkat dikeluarkan.'); render(); return;
      }
      switch (t.dataset.act) {
        case 'simpan': save(); break;
        case 'batal': cancel(); break;
        case 'ubah-sandi': changePassword(); break;
        case 'foto': document.getElementById('pf-foto').click(); break;
        case 'salin':
          try { await navigator.clipboard.writeText(S.draft.zoomLink || ''); toast('Link Zoom disalin.'); }
          catch (_) { toast('Gagal menyalin, salin manual.', 'error'); }
          break;
      }
    });
  }

  async function mount(host, me) {
    if (typeof host === 'string') host = document.querySelector(host);
    if (!host) return;
    S.host = host; bind(host);
    if (!S.init) { S.init = true; await load(me); }
    render();
  }

  root.DCProfil = { mount: mount, onSaved: null, peek: () => S.saved || { ...defaults(), ...(readLocal() || {}) }, setTab: (t) => { if (TABS.some((x) => x.id === t)) S.tab = t; }, _state: S };
})(window);
