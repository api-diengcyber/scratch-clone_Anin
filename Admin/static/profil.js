/* Profil Admin: ubah nama & email, ganti password.
   Endpoint: GET /api/admin/me, PATCH /api/admin/me {fullName,email}, POST /api/admin/me/password {currentPassword,newPassword}.
   Bila endpoint PATCH/POST belum ada di server, tampil pesan "belum tersedia" (tidak menyimpan data palsu). */
(function () {
  'use strict';
  const view = document.getElementById('view-profil');
  if (!view) return;
  const esc = window.dcEsc;
  const toast = (m, t) => (window.showToast ? window.showToast(m, t) : console.warn(m));
  const INPUT = 'w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
  const LABEL = 'block font-mono font-semibold text-slate-600 dark:text-slate-300 mb-1 uppercase tracking-wider text-[11px]';
  const BTN = 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-md active:scale-95 transition disabled:opacity-50';
  const CARD = 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5';
  const missing = (e) => e && [0, 404, 405, 501].includes(e.status);
  let loaded = false;

  const IN = 'w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none text-slate-800 dark:text-slate-100 font-medium';
  const LB = 'block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5';
  const ico = (i) => `<i class="fa-solid ${i} absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden="true"></i>`;
  const field = (id, label, icon, type, val, extra) => `<div><label for="${id}" class="${LB}">${label}</label><div class="relative">${ico(icon)}<input id="${id}" type="${type}" value="${esc(val)}" class="${IN}" ${extra || ''}></div></div>`;
  const pw = (id, label, extra) => `<div><label for="${id}" class="${LB}">${label}</label><div class="relative"><input id="${id}" type="password" class="${IN.replace('pl-10', 'pl-3.5 pr-10')}" ${extra}><button type="button" data-eye="${id}" aria-label="Tampilkan/sembunyikan password" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><i class="fa-solid fa-eye text-sm"></i></button></div></div>`;
  const ROLE = { admin: 'Administrator', instruktur: 'Instruktur' };
  const CARD2 = 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm';

  async function render() {
    view.innerHTML = `<div class="${CARD} text-sm text-slate-500" role="status">Memuat profil…</div>`;
    let me;
    try { me = await window.DCAdminApi.me(); }
    catch (e) {
      view.innerHTML = `<div class="${CARD} text-sm"><p class="text-rose-600 mb-3">${esc(e.message || 'Gagal memuat profil.')}</p><button type="button" data-retry class="${BTN}">Coba lagi</button></div>`;
      return;
    }
    const u = Object.assign({}, me.user || me);
    // Cadangan: data yang disimpan saat login (jika respons server tidak membawanya).
    let sv = {}; try { sv = JSON.parse(localStorage.getItem('scratch_user')) || {}; } catch (_) {}
    const ls = (k) => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };
    u.email = u.email || sv.email || ls('email');
    u.username = u.username || sv.username || ls('username');
    const name = u.full_name || u.fullName || u.name || sv.full_name || sv.fullName || sv.name || '';
    const initial = esc((name || u.username || 'A').trim().charAt(0).toUpperCase());
    const role = ROLE[u.role || me.role] || 'Administrator';
    const d = new Date(u.created_at || u.createdAt || '');
    const joined = isNaN(d) ? '' : `<span><i class="fa-regular fa-calendar"></i> Bergabung ${d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })}</span>`;
    view.innerHTML = `
      <div><nav aria-label="Breadcrumb" class="flex items-center gap-2 text-xs text-slate-400 font-medium mb-1"><span>Pengaturan</span><i class="fa-solid fa-chevron-right text-[9px]" aria-hidden="true"></i><span class="text-sky-600" aria-current="page">Profil Saya</span></nav>
        <h2 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Profil Admin</h2>
        <p class="text-sm text-slate-500">Kelola identitas akun, informasi kontak, dan keamanan Anda.</p></div>
      <div class="grid grid-cols-1 gap-6 w-full">
        <div class="${CARD2} overflow-hidden">
          <div class="h-28 bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 relative">
            <span class="absolute top-4 right-4 bg-white/20 text-white text-xs font-medium px-2.5 py-1 rounded-lg border border-white/20"><i class="fa-solid fa-shield-halved"></i> ${esc(role)}</span></div>
          <div class="px-6 pb-6">
            <div class="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 mb-6">
              <div class="relative group w-24 h-24 rounded-2xl ring-4 ring-white dark:ring-slate-900 bg-sky-600 text-white overflow-hidden shadow-md flex items-center justify-center text-3xl font-bold" id="pfAvatar">${initial}
                <label for="pfAvatarIn" class="absolute inset-0 bg-slate-900/50 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition cursor-pointer text-[10px] font-medium"><i class="fa-solid fa-camera text-base mb-0.5"></i>Ubah Foto</label>
                <input type="file" id="pfAvatarIn" class="sr-only" accept="image/*"></div>
              <div><h3 class="text-lg font-bold text-slate-900 dark:text-white">${esc(name || u.username || 'Admin')}</h3>
                ${joined ? `<p class="text-xs text-slate-500">${joined}</p>` : ''}</div>
            </div>
            <form id="profilForm" class="space-y-4" novalidate>
              ${field('pfName', 'Nama Lengkap', 'fa-user', 'text', name, 'required maxlength="80" autocomplete="name"')}
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                ${field('pfEmail', 'Email Akun', 'fa-envelope', 'email', u.email || '', 'required autocomplete="email"')}
                ${field('pfPhone', 'Nomor WhatsApp / Telp', 'fa-phone', 'tel', u.phone || '', 'placeholder="+62 8..." autocomplete="tel"')}
              </div>
              <div><span class="${LB}">Peran &amp; Hak Akses</span>
                <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div class="flex items-center gap-3"><div class="p-2 rounded-lg bg-sky-100 text-sky-600"><i class="fa-solid fa-key text-sm"></i></div>
                    <div><p class="text-xs font-bold text-slate-800 dark:text-slate-100">${esc(role)}</p><p class="text-[11px] text-slate-500">Peran hanya bisa diubah dari menu Akses &amp; Hak Pengguna.</p></div></div>
                  <span class="text-[10px] font-semibold text-slate-500 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-600">Terkunci</span></div></div>
              <p id="pfErr" class="text-xs text-rose-600 min-h-[1rem]" role="alert"></p>
              <div class="flex justify-end"><button type="submit" class="${BTN}"><i class="fa-solid fa-floppy-disk"></i> Simpan Profil</button></div>
            </form>
          </div>
        </div>
        <div class="space-y-6">
          <form id="passForm" class="${CARD2} p-6 space-y-4" novalidate>
            <div class="pb-3 border-b border-slate-100 dark:border-slate-800"><h3 class="text-base font-bold text-slate-900 dark:text-white"><i class="fa-solid fa-lock text-sky-600"></i> Ganti Kata Sandi</h3>
              <p class="text-xs text-slate-400 mt-0.5">Perbarui kata sandi secara berkala demi keamanan.</p></div>
            ${pw('pwOld', 'Password Saat Ini', 'autocomplete="current-password"')}
            ${pw('pwNew', 'Password Baru (min. 8 karakter)', 'autocomplete="new-password"')}
            <div><div class="flex justify-between text-[11px] mb-1"><span class="text-slate-500 font-medium">Kekuatan sandi:</span><span id="pwText" class="font-bold text-slate-400">-</span></div>
              <div class="flex gap-1 h-1.5" aria-hidden="true">${[1, 2, 3, 4].map((n) => `<div data-bar class="flex-1 rounded-full bg-slate-200 dark:bg-slate-700 transition-all"></div>`).join('')}</div></div>
            ${pw('pwNew2', 'Ulangi Password Baru', 'autocomplete="new-password"')}
            <p id="pwErr" class="text-xs text-rose-600 min-h-[1rem]" role="alert"></p>
            <button type="submit" class="w-full ${BTN}"><i class="fa-solid fa-key"></i> Perbarui Kata Sandi</button>
          </form>
          <div class="rounded-2xl p-5 flex items-start justify-between gap-3 shadow-sm border bg-slate-900 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-200">
            <div><span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 dark:bg-sky-200 dark:text-sky-800">Segera hadir</span>
              <h3 class="text-sm font-bold mt-1">Autentikasi Dua Langkah (2FA)</h3>
              <p class="text-xs text-slate-400 dark:text-slate-500">Butuh dukungan backend sebelum bisa diaktifkan.</p></div>
            <input type="checkbox" disabled aria-label="2FA belum tersedia" class="mt-1"></div>
        </div>
      </div>`;
    loaded = true;
  }

  function strength(v) {
    const s = (v.length >= 8) + /[A-Z]/.test(v) + /[0-9]/.test(v) + /[^A-Za-z0-9]/.test(v);
    const L = [['-', 'text-slate-400', ''], ['Lemah', 'text-rose-500', 'bg-rose-500'], ['Cukup', 'text-amber-500', 'bg-amber-500'], ['Kuat', 'text-blue-600', 'bg-blue-500'], ['Sangat kuat', 'text-emerald-600', 'bg-emerald-500']][v ? Math.max(s, 1) : 0];
    const t = view.querySelector('#pwText'); t.textContent = L[0]; t.className = 'font-bold ' + L[1];
    view.querySelectorAll('[data-bar]').forEach((b, i) => { b.className = 'flex-1 rounded-full transition-all ' + (i < (v ? Math.max(s, 1) : 0) ? L[2] : 'bg-slate-200 dark:bg-slate-700'); });
  }

  async function submit(form, errId, check, call, okMsg, after) {
    const err = view.querySelector(errId), btn = form.querySelector('button[type=submit]');
    const msg = check(); err.textContent = msg || '';
    if (msg) return;
    btn.disabled = true;
    try { await call(); toast(okMsg); after && after(); }
    catch (e) { err.textContent = missing(e) ? 'Fitur ini belum tersedia di server (endpoint belum dibuat).' : (e.message || 'Gagal menyimpan.'); }
    finally { btn.disabled = false; }
  }
  const val = (id) => view.querySelector(id).value.trim();

  view.addEventListener('click', (e) => {
    if (e.target.closest('[data-retry]')) return render();
    const eye = e.target.closest('[data-eye]');
    if (eye) { const i = view.querySelector('#' + eye.dataset.eye), on = i.type === 'password'; i.type = on ? 'text' : 'password'; eye.firstElementChild.className = 'fa-solid text-sm ' + (on ? 'fa-eye-slash' : 'fa-eye'); }
  });
  view.addEventListener('input', (e) => { if (e.target.id === 'pwNew') strength(e.target.value); });
  view.addEventListener('change', (e) => {
    if (e.target.id !== 'pfAvatarIn') return;
    const f = e.target.files[0]; if (!f) return;
    if (!/^image\//.test(f.type) || f.size > 2 * 1024 * 1024) return toast('Pilih gambar maksimal 2 MB.');
    const r = new FileReader();
    r.onload = () => { const a = view.querySelector('#pfAvatar'); let im = a.querySelector('img'); if (!im) { im = document.createElement('img'); im.alt = 'Foto profil'; im.className = 'w-full h-full object-cover'; a.prepend(im); a.firstChild.nodeType === 3 || (a.childNodes.forEach((n) => n.nodeType === 3 && n.remove())); } im.src = r.result; toast('Pratinjau foto saja: belum disimpan ke server.'); };
    r.readAsDataURL(f);
  });
  view.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'profilForm') {
      submit(e.target, '#pfErr',
        () => !val('#pfName') ? 'Nama wajib diisi.' : !/^\S+@\S+\.\S+$/.test(val('#pfEmail')) ? 'Format email tidak valid.' : (val('#pfPhone') && !/^[+0-9\s-]{8,20}$/.test(val('#pfPhone'))) ? 'Nomor telepon tidak valid.' : '',
        () => window.DCAdminApi.request('/api/admin/me', { method: 'PATCH', body: { fullName: val('#pfName'), email: val('#pfEmail'), phone: val('#pfPhone') } }),
        'Profil berhasil disimpan.',
        () => window.DCAdminApi.me().then((m) => { window.DCAdminMe = m; if (typeof renderSidebarAccount === 'function') renderSidebarAccount(m); }).catch(() => {}));
    } else if (e.target.id === 'passForm') {
      const v = (id) => view.querySelector(id).value;
      submit(e.target, '#pwErr',
        () => !v('#pwOld') ? 'Password saat ini wajib diisi.' : v('#pwNew').length < 8 ? 'Password baru minimal 8 karakter.' : v('#pwNew') !== v('#pwNew2') ? 'Ulangi password tidak sama.' : v('#pwNew') === v('#pwOld') ? 'Password baru harus berbeda.' : '',
        () => window.DCAdminApi.request('/api/admin/me/password', { method: 'POST', body: { currentPassword: v('#pwOld'), newPassword: v('#pwNew') } }),
        'Password berhasil diganti.',
        () => e.target.reset());
    }
  });
  // Klik avatar / nama / peran di sidebar membuka halaman profil.
  const go = () => { const a = document.getElementById('goProfil'); if (a) a.click(); };
  ['sidebarAvatar', 'sidebarName'].forEach((id) => {
    const el = document.getElementById(id); if (!el) return;
    const t = id === 'sidebarName' ? el.closest('.flex-1') || el : el;
    t.classList.add('cursor-pointer'); t.setAttribute('role', 'button'); t.setAttribute('tabindex', '0'); t.setAttribute('aria-label', 'Buka profil saya');
    t.addEventListener('click', go);
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  window.addEventListener('dc:view', (e) => { if (e.detail === 'profil' && !loaded) render(); });
  if (!view.classList.contains('hidden')) render();
})();
