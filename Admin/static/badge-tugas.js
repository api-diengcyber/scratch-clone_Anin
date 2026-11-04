/* Lencana & Hadiah + Tugas
   Dua halaman admin: Lencana & Hadiah (lencana jalur dari kurikulum, badge penghargaan, bingkai avatar, gelar julukan)
   dan Tugas (penugasan per jenjang, bisa diimpor dari file CSV/JSON).
   Memakai endpoint /api/admin/badges, /api/admin/rewards, dan /api/admin/tasks (GET, POST, PATCH /:id, DELETE /:id).
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
  const TYPES = { kode: 'Kode (Python/teks)', blok: 'Block Coding', kuis: 'Kuis', proyek: 'Proyek' };
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
  function modal(title, bodyHtml, onSubmit, wide, submitLabel) {
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50';
    el.innerHTML = `<form class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto p-6 space-y-4" novalidate>
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
  const hero = (crumb, title, countId, sub, btnAttr, btnLabel, extra = '') => `
    <div class="page-hero flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-xs font-mono text-slate-400 dark:text-slate-500 mb-1"><span>Portal Admin</span><span>/</span><span class="text-sky-600 dark:text-sky-400 font-medium">${crumb}</span></div>
        <h1 class="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2.5">${title}
          <span id="${countId}" class="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border border-sky-300/60 dark:border-sky-500/30">0</span></h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">${sub}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2 self-start md:self-auto">${extra}<button type="button" ${btnAttr} class="${BTN}"><i class="fa-solid fa-plus text-xs"></i><span>${btnLabel}</span></button></div>
    </div>`;
  const demoNote = (store, path) => store.isLocal() ? `<div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"><i class="fa-solid fa-flask mt-0.5"></i><span><b>Mode contoh.</b> Server belum punya <code class="font-mono">${path}</code>, jadi data hanya tersimpan di browser ini.</span></div>` : '';
  const radioGroup = (name, items, cur, render) => items.map((k) => `<label class="cursor-pointer"><input type="radio" name="${name}" value="${k}" class="peer sr-only" ${k === cur ? 'checked' : ''}>${render(k)}</label>`).join('');
  const ruleText = (b) => b.rule === 'tasks' ? `Selesai ${b.threshold} tugas` : b.rule === 'points' ? `${b.threshold} poin` : 'Diberikan manual';
  const fmtDate = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return d || '-'; } };

  // ---------- KURIKULUM: sumber lencana jalur & tahap ----------
  // Dibaca langsung dari /api/admin/curriculum supaya selalu sama dengan menu Modul & Kurikulum.
  const JENJANG_URUT = ['SD', 'SMP', 'SMK'];
  let cur = { jalur: [], tahap: [] };
  async function loadCurriculum() {
    try {
      const r = await window.DCAdminApi.curriculum();
      const c = r.curriculum || r;
      cur = { jalur: Array.isArray(c.jalur) ? c.jalur : [], tahap: Array.isArray(c.tahap) ? c.tahap : [] };
      if (window.DCLencana) window.DCLencana.fill(cur);
    } catch (_) { cur = { jalur: [], tahap: [] }; }
  }
  const tahapNama = (jn, no) => { const t = cur.tahap.find((x) => x.jenjang === jn && Number(x.no) === Number(no)); return t ? t.nama : ''; };
  const jalurLabel = (j) => `${j.nama} (${GRADES[j.jenjang] || j.jenjang} · Tahap ${j.tahap || 1})`;
  const tahapLabel = (jn, no) => `${GRADES[jn] || jn} · Tahap ${no}${tahapNama(jn, no) ? ' — ' + tahapNama(jn, no) : ''}`;
  function allTahap() {
    const seen = new Map();
    cur.tahap.forEach((t) => seen.set(t.jenjang + '|' + Number(t.no), { jenjang: t.jenjang, no: Number(t.no) }));
    cur.jalur.forEach((j) => seen.set(j.jenjang + '|' + (j.tahap || 1), { jenjang: j.jenjang, no: j.tahap || 1 }));
    return [...seen.values()].sort((a, b) => (JENJANG_URUT.indexOf(a.jenjang) - JENJANG_URUT.indexOf(b.jenjang)) || (a.no - b.no));
  }
  const safeIcon = (v) => (/^[a-z0-9 -]+$/i.test(v || '') ? v : 'fa-solid fa-medal');
  const safeHex = (v) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : '#14875b');
  // ---------- HALAMAN LENCANA & BADGE ----------
  let badgeList = [];

  // Sama dengan portal siswa: SD = lencana per jalur; SMP & SMA/SMK = lencana per tahap (track).
  // Didapat jika SEMUA task selesai DAN Project Akhir / Capstone selesai.
  function lencanaItems() {
    const out = [];
    cur.jalur.filter((j) => j.jenjang === 'SD').sort((a, b) => (a.tahap || 1) - (b.tahap || 1))
      .forEach((j) => out.push({ jenjang: 'SD', text: String(j.lencana || '').trim(), title: j.nama, sub: 'Tahap ' + (j.tahap || 1) + (tahapNama('SD', j.tahap || 1) ? ' · ' + tahapNama('SD', j.tahap || 1) : ''), color: safeHex(j.warna), icon: safeIcon(j.ikon), syarat: 'Semua task + Project Akhir' }));
    ['SMP', 'SMK'].forEach((jn) => allTahap().filter((t) => t.jenjang === jn).forEach((t) => {
      const info = cur.tahap.find((x) => x.jenjang === jn && Number(x.no) === t.no) || {};
      out.push({ jenjang: jn, text: String(info.lencana || '').trim() || (window.DCLencana ? window.DCLencana.byNo(jn, t.no) : ''), title: info.nama || 'Tahap ' + t.no, sub: 'Tahap ' + t.no, color: safeHex(info.warna), icon: safeIcon(info.ikon), syarat: 'Semua task + Capstone' });
    }));
    return out;
  }
  function lencanaJalurHtml() {
    const items = lencanaItems(), kosong = items.filter((x) => !x.text).length;
    const cards = JENJANG_URUT.map((jn) => {
      const rows = items.filter((x) => x.jenjang === jn && x.text);
      if (!rows.length) return '';
      return `<div class="space-y-2.5"><p class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">${esc(GRADES[jn])} · ${jn === 'SD' ? 'per jalur' : 'per tahap'}</p>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${rows.map((x) => {
          const m = x.text.match(/^(\p{Extended_Pictographic}\uFE0F?)\s*(.*)$/u);
          const face = m ? m[1] : '', label = m ? (m[2] || x.title) : x.text;
          return `<div class="${CARD} p-5 flex items-center gap-4">
            <div class="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-white text-2xl shadow-md" style="background:${x.color}">${face ? esc(face) : `<i class="${esc(x.icon)} text-xl"></i>`}</div>
            <div class="min-w-0 flex-1"><p class="font-bold text-slate-900 dark:text-white truncate">${esc(label)}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400 truncate">${esc(x.title)}</p>
              <p class="text-[11px] text-slate-400 mt-0.5 truncate">${esc(x.sub)} · ${esc(x.syarat)}</p></div></div>`;
        }).join('')}</div></div>`;
    }).join('');
    return `<section class="space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div><h2 class="text-base font-extrabold text-slate-900 dark:text-white">Lencana Jalur &amp; Tahap</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">Sama dengan portal siswa: didapat jika semua task dan Project Akhir/Capstone selesai${kosong ? ` · ${kosong} belum punya lencana` : ''}.</p></div>
        <div class="flex gap-2"><a href="#" data-view="kurikulum" class="dc-btn dc-btn-ghost dc-btn-sm"><i class="fa-solid fa-pen text-[11px]"></i>Lencana SD (Kurikulum)</a>
          <a href="#" data-view="tahap" class="dc-btn dc-btn-ghost dc-btn-sm"><i class="fa-solid fa-pen text-[11px]"></i>Lencana SMP &amp; SMK (Tahap)</a></div></div>
      ${cards || `<div class="${CARD} text-center py-10 text-sm text-slate-500 dark:text-slate-400">Belum ada lencana. Isi kolom <b>Lencana</b> di jalur SD (Modul &amp; Kurikulum) atau di tahap SMP/SMA/SMK (Kelola Tahap).</div>`}</section>`;
  }
  function badgeCardsHtml() {
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
          <button type="button" data-b="edit" data-id="${b.id}" class="${BTN_GHOST}" title="Ubah"><i class="fa-solid fa-pen"></i></button>
          <button type="button" data-b="del" data-id="${b.id}" class="dc-ib dc-ib-danger" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>`).join('');
    return `<section class="space-y-4">
      <div><h2 class="text-base font-extrabold text-slate-900 dark:text-white">Badge Penghargaan</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">Otomatis dari tugas atau poin, atau diberikan manual oleh instruktur.</p></div>
      ${demoNote(badges, '/api/admin/badges')}
      ${badgeList.length ? `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${cards}</div>` :
        `<div class="${CARD} text-center py-10 text-sm text-slate-500 dark:text-slate-400">Belum ada badge. Klik <b>Badge Baru</b> untuk membuat yang pertama.</div>`}</section>`;
  }
  // ---------- HADIAH: BINGKAI AVATAR & GELAR JULUKAN ----------
  // Sama dengan LP.HADIAH di portal siswa (Toko Hadiah). Dikelola di halaman yang sama dengan lencana.
  const FRAME_STYLES = [
    ['frame-gold', 'Emas', '#f59e0b,#fde68a'], ['frame-neon', 'Neon', '#0ea5e9,#67e8f9'], ['frame-matrix', 'Matrix', '#16a34a,#4ade80'],
    ['frame-fire', 'Api', '#ea580c,#fbbf24'], ['frame-cat', 'Kucing', '#ec4899,#f9a8d4'], ['frame-sea', 'Laut', '#0d9488,#5eead4'],
    ['frame-rainbow', 'Pelangi', '#f43f5e,#f59e0b,#22c55e,#3b82f6,#a855f7'], ['frame-space', 'Antariksa', '#4f46e5,#a5b4fc'],
    ['frame-galaxy', 'Galaksi', '#7c3aed,#c084fc'], ['frame-nature', 'Alam', '#65a30d,#bef264']
  ];
  const ORN_POS = [['top', 'Atas'], ['tl', 'Kiri atas'], ['tr', 'Kanan atas'], ['bl', 'Kiri bawah'], ['br', 'Kanan bawah'], ['orbit', 'Mengitari']];
  const ORN_ANIM = [['', 'Diam'], ['peek', 'Mengintip'], ['wiggle', 'Bergoyang']];
  const REWARD_SEED = () => [
    { id: 'bg_gold', jenis: 'bingkai', emoji: '👑', nama: 'Bingkai Mahkota Emas', harga: 50, frameClass: 'frame-gold', desc: 'Mahkota emas berkilau di atas kepala avatarmu.', orn: [{ e: '👑', p: 'top', a: 'peek', s: 1.6 }] },
    { id: 'bg_neon', jenis: 'bingkai', emoji: '💫', nama: 'Bingkai Neon Cyber', harga: 75, frameClass: 'frame-neon', desc: 'Laser neon biru pendar murni berdenyut tajam.', orn: [{ e: '💫', p: 'tl', a: 'wiggle', s: 1.3 }] },
    { id: 'bg_matrix', jenis: 'bingkai', emoji: '🤖', nama: 'Bingkai Matrix Terminal', harga: 100, frameClass: 'frame-matrix', desc: 'Neon hacker hijau digital dengan kode terminal.', orn: [{ e: '⚡', p: 'tr', a: 'wiggle', s: 1 }, { e: '0101', p: 'bl', code: true }] },
    { id: 'bg_fire', jenis: 'bingkai', emoji: '🔥', nama: 'Kobaran Api Petualang', harga: 120, frameClass: 'frame-fire', desc: 'Api membara dengan letupan energi koding penuh semangat.', orn: [{ e: '🔥', p: 'tr', a: 'peek', s: 1.6 }, { e: '💥', p: 'bl', s: 1.2 }] },
    { id: 'bg_cat', jenis: 'bingkai', emoji: '🐱', nama: 'Kucing Mengintip Ceria', harga: 130, frameClass: 'frame-cat', desc: 'Kucing imut yang selalu mengintip dari atas bingkai neon.', orn: [{ e: '🐱', p: 'top', a: 'peek', s: 1.6 }, { e: '🐾', p: 'br', s: 1 }] },
    { id: 'bg_sea', jenis: 'bingkai', emoji: '🐬', nama: 'Akuarium Lumba-lumba', harga: 140, frameClass: 'frame-sea', desc: 'Gelembung laut toska dengan lumba-lumba yang ceria melompat.', orn: [{ e: '🐬', p: 'tr', a: 'wiggle', s: 1.6 }, { e: '🫧', p: 'bl', s: 1 }] },
    { id: 'bg_rainbow', jenis: 'bingkai', emoji: '🍭', nama: 'Bingkai Permen Pelangi', harga: 150, frameClass: 'frame-rainbow', desc: 'Gradasi pelangi neon lengkap dengan permen manis.', orn: [{ e: '🍭', p: 'tr', a: 'wiggle', s: 1.5 }, { e: '⭐', p: 'bl', a: 'peek', s: 1.2 }] },
    { id: 'bg_space', jenis: 'bingkai', emoji: '🚀', nama: 'Roket Orbit Antariksa', harga: 180, frameClass: 'frame-space', desc: 'Roket luar angkasa yang terbang mengitari lingkaran avatarmu.', orn: [{ e: '🚀', p: 'orbit', s: 1.2 }, { e: '🪐', p: 'br', s: 1 }] },
    { id: 'bg_galaxy', jenis: 'bingkai', emoji: '🔮', nama: 'Bingkai Galaksi Kosmik', harga: 200, frameClass: 'frame-galaxy', desc: 'Aura kosmik ungu dengan taburan bintang bercahaya.', orn: [{ e: '✨', p: 'tl', a: 'wiggle', s: 1.6 }, { e: '🔮', p: 'br', a: 'peek', s: 1.4 }] },
    { id: 'gl_star', jenis: 'gelar', emoji: '⭐', nama: 'Bintang Kelas', harga: 80 },
    { id: 'gl_python', jenis: 'gelar', emoji: '🐍', nama: 'Pawang Python', harga: 120 },
    { id: 'gl_bug', jenis: 'gelar', emoji: '🕵️', nama: 'Detektif Bug', harga: 150 },
    { id: 'gl_web', jenis: 'gelar', emoji: '🌐', nama: 'Arsitek Web', harga: 180 },
    { id: 'gl_robot', jenis: 'gelar', emoji: '🤖', nama: 'Sahabat Robot', harga: 250 },
    { id: 'gl_master', jenis: 'gelar', emoji: '⚡', nama: 'Master Algoritma', harga: 300 }
  ];
  const rewards = makeStore('/api/admin/rewards', 'dc-rewards', REWARD_SEED);
  let rewardList = [];
  const byHarga = (a, b) => (Number(a.harga) || 0) - (Number(b.harga) || 0);
  const frames = () => rewardList.filter((r) => r.jenis === 'bingkai').sort(byHarga);
  const titles = () => rewardList.filter((r) => r.jenis === 'gelar').sort(byHarga);
  const frameColors = (cls) => (FRAME_STYLES.find((f) => f[0] === cls) || FRAME_STYLES[0])[2].split(',');
  const frameName = (cls) => (FRAME_STYLES.find((f) => f[0] === cls) || [cls, cls])[1];
  const hargaChip = (h) => `<span class="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30">💰 ${Number(h) || 0} koin</span>`;
  const rewardActions = (r) => `<div class="flex justify-end gap-1 mt-auto pt-1 border-t border-slate-100 dark:border-slate-800">
      <button type="button" data-b="redit" data-id="${esc(r.id)}" class="${BTN_GHOST}" title="Ubah"><i class="fa-solid fa-pen"></i></button>
      <button type="button" data-b="rdel" data-id="${esc(r.id)}" class="dc-ib dc-ib-danger" title="Hapus"><i class="fa-solid fa-trash-can"></i></button></div>`;

  function frameCardsHtml() {
    const list = frames();
    const cards = list.map((r) => {
      const cs = frameColors(r.frameClass), ring = cs.length > 1 ? `conic-gradient(${cs.concat(cs[0]).join(',')})` : cs[0];
      const orn = (r.orn || []).filter((o) => o && o.e && !o.code).slice(0, 3).map((o) => esc(o.e)).join(' ');
      return `<div class="${CARD} p-5 flex flex-col gap-3">
        <div class="flex items-start gap-4">
          ${window.AvatarFrame
            ? `<div class="w-20 h-20 shrink-0 flex items-center justify-center">${window.AvatarFrame.markup(esc(r.emoji), r, { size: 56, fs: '1.5rem' })}</div>`
            : `<div class="w-16 h-16 shrink-0 rounded-full p-[3px] shadow-md" style="background:${ring}"><div class="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center text-2xl">${esc(r.emoji)}</div></div>`}
          <div class="min-w-0 flex-1">
            <p class="font-bold text-slate-900 dark:text-white truncate">${esc(r.nama)}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">${esc(r.desc) || 'Tanpa deskripsi'}</p></div></div>
        <div class="flex flex-wrap items-center gap-2 text-[11px] font-mono">${hargaChip(r.harga)}
          <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">Gaya ${esc(frameName(r.frameClass))}</span>
          ${orn ? `<span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" title="Hiasan">${orn}</span>` : ''}</div>
        ${rewardActions(r)}</div>`;
    }).join('');
    return `<section class="space-y-4">
      <div><h2 class="text-base font-extrabold text-slate-900 dark:text-white">Bingkai Avatar</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">Bingkai foto profil yang bisa ditukar siswa dengan Koin Belajar di Toko Hadiah.</p></div>
      ${demoNote(rewards, '/api/admin/rewards')}
      ${list.length ? `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${cards}</div>` :
        `<div class="${CARD} text-center py-10 text-sm text-slate-500 dark:text-slate-400">Belum ada bingkai. Klik <b>Bingkai Baru</b> untuk membuat yang pertama.</div>`}</section>`;
  }
  function titleCardsHtml() {
    const list = titles();
    const cards = list.map((r) => `<div class="${CARD} p-5 flex flex-col gap-3">
        <div class="flex items-start gap-4">
          <div class="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-2xl shadow-md bg-slate-100 dark:bg-slate-800">${esc(r.emoji)}</div>
          <div class="min-w-0 flex-1">
            <p class="font-bold text-slate-900 dark:text-white truncate">${esc(r.nama)}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">Tampil di bawah nama: <b>${esc(r.emoji)} ${esc(r.nama)}</b></p></div></div>
        <div class="flex flex-wrap items-center gap-2 text-[11px] font-mono">${hargaChip(r.harga)}</div>
        ${rewardActions(r)}</div>`).join('');
    return `<section class="space-y-4">
      <div><h2 class="text-base font-extrabold text-slate-900 dark:text-white">Gelar Julukan</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">Julukan di bawah nama siswa, ditukar dengan Koin Belajar di Toko Hadiah.</p></div>
      ${demoNote(rewards, '/api/admin/rewards')}
      ${list.length ? `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${cards}</div>` :
        `<div class="${CARD} text-center py-10 text-sm text-slate-500 dark:text-slate-400">Belum ada gelar. Klik <b>Gelar Baru</b> untuk membuat yang pertama.</div>`}</section>`;
  }
  const optHtml = (arr, cur) => arr.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
  function rewardForm(jenis, r) {
    const isFrame = jenis === 'bingkai';
    r = r || (isFrame ? { jenis, nama: '', emoji: '', harga: 100, frameClass: 'frame-gold', desc: '', orn: [] } : { jenis, nama: '', emoji: '', harga: 100 });
    const o = (r.orn && r.orn[0] && !r.orn[0].code) ? r.orn[0] : { e: '', p: 'top', a: 'peek' };
    const kind = isFrame ? 'Bingkai' : 'Gelar';
    const el = modal(r.id ? `Ubah ${kind}` : `${kind} Baru`, `
      ${isFrame ? '<div data-prev class="flex items-center justify-center py-4 min-h-[6.5rem] rounded-2xl bg-slate-100 dark:bg-slate-800"></div>' : ''}
      <div class="grid grid-cols-3 gap-3">
        <div class="col-span-2">${field('Nama', `<input name="nama" maxlength="40" value="${esc(r.nama)}" class="${INPUT}" placeholder="${isFrame ? 'Contoh: Bingkai Naga Api' : 'Contoh: Pawang Python'}">`)}</div>
        ${field('Emoji', `<input name="emoji" maxlength="8" value="${esc(r.emoji)}" class="${INPUT} text-center" placeholder="🐉">`)}
      </div>
      ${isFrame ? field('Deskripsi', `<textarea name="desc" rows="2" maxlength="160" class="${INPUT}" placeholder="Seperti apa tampilan bingkai ini?">${esc(r.desc)}</textarea>`) : ''}
      <div class="grid grid-cols-2 gap-3">
        ${field('Harga (koin)', `<input name="harga" type="number" min="0" step="1" value="${Number(r.harga) || 0}" class="${INPUT}">`)}
        ${isFrame ? field('Gaya bingkai', `<select name="frameClass" class="${INPUT}">${optHtml(FRAME_STYLES.map((f) => [f[0], f[1]]), r.frameClass)}</select>`) : ''}
      </div>
      ${isFrame ? `<div class="grid grid-cols-3 gap-3">
        ${field('Hiasan (emoji)', `<input name="ornE" maxlength="8" value="${esc(o.e)}" class="${INPUT} text-center" placeholder="Opsional">`)}
        ${field('Posisi', `<select name="ornP" class="${INPUT}">${optHtml(ORN_POS, o.p)}</select>`)}
        ${field('Gerak', `<select name="ornA" class="${INPUT}">${optHtml(ORN_ANIM, o.a || '')}</select>`)}</div>
        <p class="text-[11px] text-slate-400 -mt-2">Gaya bingkai memakai tampilan yang sudah ada di portal siswa. Hiasan kedua dan seterusnya (kalau ada) tidak berubah.</p>` : ''}`,
      async (f) => {
        const nama = (f.nama || '').trim(), emoji = (f.emoji || '').trim();
        if (!nama) return `Nama ${kind.toLowerCase()} harus diisi.`;
        if (!emoji) return 'Emoji harus diisi.';
        const harga = Number(f.harga);
        if (!Number.isInteger(harga) || harga < 0) return 'Harga harus berupa bilangan bulat 0 atau lebih.';
        const item = { ...(r.id ? { id: r.id } : {}), jenis, nama, emoji, harga };
        if (isFrame) {
          const rest = (r.orn || []).slice((r.orn && r.orn[0] && !r.orn[0].code) ? 1 : 0), ornE = (f.ornE || '').trim();
          item.frameClass = f.frameClass || 'frame-gold';
          item.desc = (f.desc || '').trim();
          item.orn = (ornE ? [{ e: ornE, p: f.ornP || 'top', ...(f.ornA ? { a: f.ornA } : {}), s: (o.s || 1.4) }] : []).concat(rest);
        }
        await rewards.save(item);
        toast(r.id ? `${kind} diperbarui.` : `${kind} dibuat.`); renderBadge();
      });
    if (isFrame) {   // pratinjau langsung: ikut berubah saat emoji, gaya, atau hiasan diganti
      const form = el.querySelector('form'), box = el.querySelector('[data-prev]');
      const rest = (r.orn || []).slice((r.orn && r.orn[0] && !r.orn[0].code) ? 1 : 0);
      const draw = () => {
        const e = form.elements, ornE = (e.ornE.value || '').trim();
        const frame = { frameClass: e.frameClass.value, orn: (ornE ? [{ e: ornE, p: e.ornP.value, ...(e.ornA.value ? { a: e.ornA.value } : {}), s: o.s || 1.4 }] : []).concat(rest) };
        box.innerHTML = window.AvatarFrame ? window.AvatarFrame.markup(esc((e.emoji.value || '').trim() || '🙂'), frame, { size: 64, fs: '1.75rem' })
          : '<span class="text-xs text-slate-400">Pratinjau tidak tersedia.</span>';
      };
      form.addEventListener('input', draw); form.addEventListener('change', draw); draw();
    }
  }

  const TABS = [['lencana', 'Lencana & Badge', 'fa-medal'], ['bingkai', 'Bingkai Avatar', 'fa-circle-user'], ['gelar', 'Gelar Julukan', 'fa-tag']];
  let bdTab = 'lencana';
  async function renderBadge() {
    try { [badgeList, rewardList] = await Promise.all([badges.list(), rewards.list(), loadCurriculum()]).then((r) => [r[0], r[1]]); }
    catch (e) { return toast(e.message || 'Gagal memuat lencana & hadiah.', 'error'); }
    const tabs = `<div class="flex gap-1.5 overflow-x-auto">${TABS.map(([k, l, ic]) => `<button type="button" data-b="tab" data-v="${k}" class="dc-pill-tab ${k === bdTab ? 'is-active' : ''}"><i class="fa-solid ${ic} text-[11px]"></i>${l}</button>`).join('')}</div>`;
    const cfg = {
      lencana: ['data-b="new"', 'Badge Baru', badgeList.length + ' Badge', lencanaJalurHtml() + badgeCardsHtml()],
      bingkai: ['data-b="rnew" data-j="bingkai"', 'Bingkai Baru', frames().length + ' Bingkai', frameCardsHtml()],
      gelar: ['data-b="rnew" data-j="gelar"', 'Gelar Baru', titles().length + ' Gelar', titleCardsHtml()]
    }[bdTab];
    vBadge.innerHTML = hero('Lencana &amp; Hadiah', 'Lencana &amp; Hadiah', 'bdCount',
      'Lencana jalur dan tahap, badge penghargaan, serta bingkai avatar dan gelar julukan di Toko Hadiah.',
      cfg[0], cfg[1]) + tabs + cfg[3];
    $('#bdCount').textContent = cfg[2];
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
    const k = a.dataset.b;
    const b = badgeList.find((x) => String(x.id) === a.dataset.id);
    if (k === 'tab') { bdTab = a.dataset.v; return renderBadge(); }
    if (k === 'rnew') return rewardForm(a.dataset.j);
    if (k === 'redit' || k === 'rdel') {
      const r = rewardList.find((x) => String(x.id) === a.dataset.id); if (!r) return;
      if (k === 'redit') return rewardForm(r.jenis, r);
      const kind = r.jenis === 'bingkai' ? 'bingkai' : 'gelar';
      if (!(await window.dcConfirm({ title: `Hapus ${kind}?`, message: `Hadiah ini akan hilang dari Toko Hadiah.`, detail: `${r.emoji} ${r.nama}`, confirmText: 'Hapus', tone: 'danger' }))) return;
      try { await rewards.remove(r.id); toast(`${kind[0].toUpperCase() + kind.slice(1)} dihapus.`); renderBadge(); } catch (ex) { toast(ex.message || 'Gagal menghapus.', 'error'); }
      return;
    }
    if (k === 'new') return badgeForm();
    if (k === 'edit' && b) return badgeForm(b);
    if (k === 'del' && b) {
      if (!(await window.dcConfirm({ title: 'Hapus badge?', message: 'Badge ini akan hilang dari daftar dan dari siswa yang sudah meraihnya.', detail: b.name, confirmText: 'Hapus', tone: 'danger' }))) return;
      try { await badges.remove(b.id); toast('Badge dihapus.'); renderBadge(); } catch (ex) { toast(ex.message || 'Gagal menghapus badge.', 'error'); }
    }
  });

  // ---------- TUGAS KURIKULUM (sama persis dengan portal siswa) ----------
  // Dibaca dari file data yang sama dipakai siswa (/kurikulum/data/*.js), jadi daftar tugas admin
  // otomatis sama dengan yang tampil di sisi siswa, per modul dan per task. Hanya-baca: ubah lewat menu Kurikulum.
  const KUR_SRC = ['/kurikulum/data/jalur-data.js', '/kurikulum/data/jalur-data-smp.js', '/kurikulum/data/jalur-data-smak.js'];
  const KUR_POIN = { task: 10, project: 50 };
  let kurCache = null;
  const loadScript = (src) => new Promise((ok) => {
    const el = document.createElement('script'); el.src = src; el.onload = () => ok(true); el.onerror = () => ok(false); document.head.appendChild(el);
  });
  const kurType = (t) => (t.project || t.type === 'project') ? 'proyek' : (t.kind === 'quiz' ? 'kuis' : (t.kind === 'editor' ? 'blok' : 'kode'));
  async function kurTasks() {
    if (kurCache) return kurCache;
    if (!window.LP_DATA || !window.LP_SMP || !window.LP_SMAK) await Promise.all(KUR_SRC.map(loadScript));
    const out = [];
    const push = (taskId, title, description, grade, t) => out.push({
      id: 'kur:' + taskId, taskId, title: title || 'Task ' + taskId, description, grade, type: kurType(t),
      points: (t.project || t.type === 'project') ? KUR_POIN.project : KUR_POIN.task, due: '', status: 'terbit', badgeId: null, readOnly: true, source: 'kurikulum'
    });
    try {   // SD: tahap > pembelajaran > tasks (+ project). ID sama dengan jalur-belajar.js: <id>-t<no> dan <id>-project
      const D = window.LP_DATA;
      if (D && Array.isArray(D.tahap)) D.tahap.forEach((th) => (th.pembelajaran || []).forEach((pb) => {
        const desc = `${pb.judul} · Tahap ${th.no}`;
        (pb.tasks || []).forEach((t, i) => push(`${pb.id}-t${i + 1}`, t.title, desc, 'SD', t));
        if (pb.project) push(`${pb.id}-project`, pb.project.title || ('Project Akhir: ' + pb.judul), desc, 'SD', { project: true });
      }));
    } catch (_) {}
    const nodes = (list, grade) => (Array.isArray(list) ? list : []).forEach((jl) => (jl.nodes || []).forEach((n) => (n.tasks || []).forEach((t, i) =>
      push(`${n.id}:${i}`, t.judul, `${n.title} · ${jl.nama}`, grade, t))));
    try { nodes(window.LP_SMP, 'SMP'); nodes(window.LP_SMAK, 'SMK'); } catch (_) {}
    return (kurCache = out);
  }

  // ---------- KUNCI JAWABAN (benar / salah) ----------
  // Disimpan di tugas sebagai task.key. Isinya bergantung jenis tugas:
  //   kode  -> { tests: [{ input, output }], must: [teks wajib ada], mustNot: [teks dilarang] }
  //   blok  -> { blocks: [{ name, min }], ordered }
  //   kuis  -> { questions: [{ q, options: [4], answer: indeks benar }] }
  //   proyek-> { rubric }
  const BLOCK_HINTS = ['when 🚩 clicked', 'when key pressed', 'move 10 steps', 'turn 15 degrees', 'go to x y', 'change x by', 'change y by', 'say Hello!', 'think Hmm...', 'switch backdrop to', 'next costume', 'start sound', 'wait 1 seconds', 'repeat 10', 'forever', 'if then', 'if then else', 'touching?', 'set variable to', 'change variable by'];
  const emptyKey = (type) => ({ type, ...(type === 'kode' ? { tests: [{ input: '', output: '' }], must: [], mustNot: [] } : type === 'blok' ? { blocks: [{ name: '', min: 1 }], ordered: false }
    : type === 'kuis' ? { questions: [{ q: '', options: ['', '', '', ''], answer: 0 }] } : { rubric: '' }) });
  const cloneKey = (k) => JSON.parse(JSON.stringify(k));
  const TA = INPUT + ' font-mono text-xs';
  function keyHtml(k) {
    const rm = (a, i) => `<button type="button" data-k="${a}" data-i="${i}" class="dc-ib dc-ib-danger shrink-0" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>`;
    const add = (a, label) => `<button type="button" data-k="${a}" class="dc-btn dc-btn-ghost dc-btn-sm"><i class="fa-solid fa-plus text-[10px]"></i>${label}</button>`;
    const note = (t) => `<p class="text-[11px] text-slate-500 dark:text-slate-400">${t}</p>`;
    if (k.type === 'kode') return `${note('Jawaban dianggap benar kalau hasil cetak (<code>print</code>) programnya sama persis dengan kolom <b>Output benar</b>. Isi <b>Input</b> bila program memakai <code>input()</code> (satu baris per input).')}
      ${k.tests.map((t, i) => `<div class="grid grid-cols-[1fr_1fr_auto] gap-2 items-start"><textarea data-k="t-in" data-i="${i}" rows="2" class="${TA}" placeholder="Input (boleh kosong)">${esc(t.input)}</textarea>
        <textarea data-k="t-out" data-i="${i}" rows="2" class="${TA}" placeholder="Output benar">${esc(t.output)}</textarea>${rm('t-del', i)}</div>`).join('')}
      ${add('t-add', 'Tambah tes')}
      <div class="grid sm:grid-cols-2 gap-3">${field('Kode wajib mengandung', `<textarea data-k="must" rows="3" class="${TA}" placeholder="satu per baris, misal:&#10;for&#10;range(">${esc(k.must.join('\n'))}</textarea>`)}
        ${field('Kode tidak boleh mengandung', `<textarea data-k="mustNot" rows="3" class="${TA}" placeholder="satu per baris, misal:&#10;sum(">${esc(k.mustNot.join('\n'))}</textarea>`)}</div>`;
    if (k.type === 'blok') return `${note('Tentukan blok yang <b>wajib dipakai</b> siswa dan minimal berapa kali. Siswa dianggap benar kalau semua blok ada di program (dan berurutan bila dicentang).')}
      <datalist id="tfBlocks">${BLOCK_HINTS.map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
      ${k.blocks.map((b, i) => `<div class="grid grid-cols-[1fr_5rem_auto] gap-2 items-center"><input data-k="b-name" data-i="${i}" list="tfBlocks" value="${esc(b.name)}" class="${INPUT}" placeholder="Nama blok, misal: repeat 10">
        <input data-k="b-min" data-i="${i}" type="number" min="1" max="99" value="${Number(b.min) || 1}" class="${INPUT}" title="Minimal dipakai">${rm('b-del', i)}</div>`).join('')}
      ${add('b-add', 'Tambah blok')}
      <label class="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200"><input type="checkbox" data-k="ordered" ${k.ordered ? 'checked' : ''}> Urutan blok harus sesuai daftar di atas</label>`;
    if (k.type === 'kuis') return `${note('Pilih satu jawaban yang benar (bulatan) untuk tiap soal. Sisanya dianggap salah.')}
      ${k.questions.map((q, i) => `<div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2"><div class="flex gap-2 items-start"><textarea data-k="q" data-i="${i}" rows="2" class="${INPUT}" placeholder="Soal ${i + 1}">${esc(q.q)}</textarea>${rm('q-del', i)}</div>
        ${q.options.map((o, j) => `<label class="flex items-center gap-2"><input type="radio" name="ans-${i}" data-k="q-ans" data-i="${i}" data-j="${j}" ${q.answer === j ? 'checked' : ''}>
          <input data-k="q-opt" data-i="${i}" data-j="${j}" value="${esc(o)}" class="${INPUT}" placeholder="Pilihan ${String.fromCharCode(65 + j)}"></label>`).join('')}</div>`).join('')}
      ${add('q-add', 'Tambah soal')}`;
    return `${note('Proyek dinilai manual. Tulis kriteria penilaian supaya konsisten saat mereview.')}<textarea data-k="rubric" rows="4" class="${INPUT}" placeholder="Contoh: Ada karakter dan latar (30), ada gerakan (30), ada cerita (40)">${esc(k.rubric || '')}</textarea>`;
  }
  const lines = (v) => String(v || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  function applyKeyInput(k, el) {
    const a = el.dataset.k, i = Number(el.dataset.i), j = Number(el.dataset.j), v = el.type === 'checkbox' ? el.checked : el.value;
    if (a === 't-in') k.tests[i].input = v; else if (a === 't-out') k.tests[i].output = v;
    else if (a === 'must') k.must = lines(v); else if (a === 'mustNot') k.mustNot = lines(v);
    else if (a === 'b-name') k.blocks[i].name = v; else if (a === 'b-min') k.blocks[i].min = Math.max(1, parseInt(v, 10) || 1);
    else if (a === 'ordered') k.ordered = v;
    else if (a === 'q') k.questions[i].q = v; else if (a === 'q-opt') k.questions[i].options[j] = v; else if (a === 'q-ans') k.questions[i].answer = j;
    else if (a === 'rubric') k.rubric = v;
  }
  function keyAction(k, a, i) {
    if (a === 't-add') k.tests.push({ input: '', output: '' }); else if (a === 't-del') k.tests.splice(i, 1);
    else if (a === 'b-add') k.blocks.push({ name: '', min: 1 }); else if (a === 'b-del') k.blocks.splice(i, 1);
    else if (a === 'q-add') k.questions.push({ q: '', options: ['', '', '', ''], answer: 0 }); else if (a === 'q-del') k.questions.splice(i, 1);
    else return false;
    if (k.type === 'kode' && !k.tests.length) k.tests.push({ input: '', output: '' });
    if (k.type === 'blok' && !k.blocks.length) k.blocks.push({ name: '', min: 1 });
    if (k.type === 'kuis' && !k.questions.length) k.questions.push({ q: '', options: ['', '', '', ''], answer: 0 });
    return true;
  }
  function checkKey(k) {   // -> { key } atau { error }
    const out = cloneKey(k);
    if (k.type === 'kode') {
      const bad = k.tests.findIndex((t) => (t.input.trim() || t.output.trim()) && !t.output.trim());
      if (bad >= 0) return { error: `Tes ${bad + 1}: Output benar belum diisi.` };
      out.tests = k.tests.filter((t) => t.output.trim());
    } else if (k.type === 'blok') {
      out.blocks = k.blocks.filter((b) => b.name.trim()).map((b) => ({ name: b.name.trim(), min: Math.max(1, Number(b.min) || 1) }));
    } else if (k.type === 'kuis') {
      for (let i = 0; i < k.questions.length; i++) {
        const q = k.questions[i], filled = q.options.filter((o) => o.trim()).length;
        if (!q.q.trim()) return { error: `Soal ${i + 1}: teks soal kosong.` };
        if (filled < 2) return { error: `Soal ${i + 1}: isi minimal 2 pilihan.` };
        if (!q.options[q.answer] || !q.options[q.answer].trim()) return { error: `Soal ${i + 1}: pilih jawaban benar yang pilihannya terisi.` };
      }
    }
    return { key: out };
  }
  // Ringkasan kunci + cek otomatis sederhana untuk halaman review (kode wajib/dilarang dicek terhadap jawaban siswa)
  function keyReviewHtml(task, answer) {
    const k = task.key; if (!k) return '';
    const has = (txt) => String(answer || '').toLowerCase().includes(String(txt).toLowerCase());
    const row = (ok, text) => `<li class="flex gap-2"><span>${ok === null ? '•' : ok ? '✅' : '❌'}</span><span>${text}</span></li>`;
    let items = '';
    if (k.type === 'kode') {
      items += (k.must || []).map((m) => row(has(m), `Wajib ada: <code>${esc(m)}</code>`)).join('') + (k.mustNot || []).map((m) => row(!has(m), `Dilarang: <code>${esc(m)}</code>`)).join('');
      items += (k.tests || []).map((t, i) => row(null, `Tes ${i + 1}${t.input ? ` · input <code>${esc(t.input.replace(/\n/g, ' ⏎ '))}</code>` : ''} → output <code>${esc(t.output.replace(/\n/g, ' ⏎ '))}</code>`)).join('');
    } else if (k.type === 'blok') {
      items += (k.blocks || []).map((b) => row(null, `${esc(b.name)} · minimal ${b.min}×`)).join('') + (k.ordered ? row(null, 'Urutan harus sesuai') : '');
    } else if (k.type === 'kuis') {
      items += (k.questions || []).map((q, i) => row(null, `Soal ${i + 1}: jawaban benar <b>${String.fromCharCode(65 + q.answer)}. ${esc(q.options[q.answer])}</b>`)).join('');
    } else if (k.rubric) items = `<li>${esc(k.rubric)}</li>`;
    return items ? `<div><label class="${LABEL}">Kunci jawaban</label><ul class="text-xs space-y-1 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">${items}</ul>
      <p class="text-[11px] text-slate-400 mt-1">Tanda ✅/❌ hanya mengecek teks wajib dan larangan pada jawaban. Tes output dan urutan blok tetap diperiksa manual.</p></div>` : '';
  }

  // ---------- HALAMAN TUGAS ----------
  let taskList = [];
  const filt = { q: '', grade: '', status: '', src: '' };
  function renderTugasRows() {
    const today = new Date().toISOString().slice(0, 10);
    const rows = taskList.filter((t) => (!filt.grade || t.grade === filt.grade) && (!filt.status || t.status === filt.status) && (!filt.src || (filt.src === 'kurikulum') === !!t.readOnly) &&
      (!filt.q || (t.title + ' ' + t.description).toLowerCase().includes(filt.q.toLowerCase())));
    $('#tgCount').textContent = (rows.length === taskList.length ? taskList.length : rows.length + ' dari ' + taskList.length) + ' Tugas';
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
        ${t.readOnly ? `<td class="py-4 px-4"><button type="button" data-t="review" data-id="${t.id}" class="dc-btn dc-btn-ghost" title="Lihat siswa yang sudah menyelesaikan"><span class="text-xs font-semibold text-slate-700 dark:text-slate-200">Lihat siswa</span><i class="fa-solid fa-chevron-right text-[9px] text-slate-300"></i></button></td>` : subCell(t)}
        <td class="py-4 px-4">${bd ? `<div class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"><div class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]" style="background:${COLORS[bd.color] || COLORS.sky}"><i class="fa-solid ${esc(bd.icon)}"></i></div>${esc(bd.name)}</div>` : '<span class="text-xs text-slate-300 dark:text-slate-600">—</span>'}</td>
        <td class="py-4 px-4"><span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${st[1]}"><span class="w-1.5 h-1.5 rounded-full ${st[2]}"></span>${st[0]}</span></td>
        <td class="py-4 px-6 text-right">
          ${t.readOnly ? '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400" title="Diubah lewat menu Modul &amp; Kurikulum"><i class="fa-solid fa-lock text-[9px]"></i>Kurikulum</span>' : `<div class="inline-flex items-center gap-1">
            <button type="button" data-t="dup" data-id="${t.id}" class="dc-ib dc-ib-mute" title="Salin sebagai draft"><i class="fa-regular fa-copy"></i></button>
            <button type="button" data-t="edit" data-id="${t.id}" class="dc-ib dc-ib-edit" title="Ubah"><i class="fa-solid fa-pen"></i></button>
            <button type="button" data-t="del" data-id="${t.id}" class="dc-ib dc-ib-danger" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
          </div>`}
        </td></tr>`;
    }).join('') : `<tr><td colspan="8" class="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">${taskList.length ? 'Tidak ada tugas yang cocok dengan filter.' : 'Belum ada tugas. Klik Tugas Baru untuk membuat.'}</td></tr>`;
  }
  async function renderTugas() {
    let manual = [];
    try { [manual, badgeList] = await Promise.all([tasks.list(), badges.list()]); } catch (e) { return toast(e.message || 'Gagal memuat tugas.', 'error'); }
    subCount = await subs.counts(manual).catch(() => ({}));
    taskList = manual.concat(await kurTasks().catch(() => []));
    const opt = (o, cur, all) => (all ? `<option value="">${all}</option>` : '') + Object.entries(o).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(Array.isArray(v) ? v[0] : v)}</option>`).join('');
    vTugas.innerHTML = hero('Tugas &amp; Review Kode', 'Tugas &amp; Review Kode', 'tgCount', 'Buat tugas per jenjang, pantau siapa yang sudah mengumpulkan, lihat jawaban siswa, dan beri nilai.', 'data-t="new"', 'Tugas Baru') +
      demoNote(tasks, '/api/admin/tasks') + `
      <div class="${CARD} p-2.5 flex flex-col lg:flex-row gap-2.5">
        <div class="relative flex-1"><span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-xs pointer-events-none"><i class="fa-solid fa-magnifying-glass"></i></span>
          <input id="tgQ" value="${esc(filt.q)}" class="${INPUT} pl-9" placeholder="Cari judul atau deskripsi tugas..."></div>
        <select id="tgGrade" class="${INPUT} lg:w-44">${opt(GRADES, filt.grade, 'Semua jenjang')}</select>
        <select id="tgStatus" class="${INPUT} lg:w-40">${opt(STATUS, filt.status, 'Semua status')}</select>
        <select id="tgSrc" class="${INPUT} lg:w-40"><option value="">Semua sumber</option><option value="kurikulum" ${filt.src === 'kurikulum' ? 'selected' : ''}>Kurikulum</option><option value="manual" ${filt.src === 'manual' ? 'selected' : ''}>Buatan admin</option></select></div>
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
    let ks = t.key && t.key.type === t.type ? cloneKey(t.key) : emptyKey(t.type);
    const importBox = t.id ? '' : `<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-3 space-y-2">
        <p class="text-xs font-semibold text-slate-700 dark:text-slate-200"><i class="fa-solid fa-file-import mr-1.5 text-sky-600"></i>Impor dari file (CSV / JSON)</p>
        <input id="tfImport" type="file" accept=".csv,.tsv,.txt,.json" class="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-sky-600 file:text-white file:px-3 file:py-1.5 file:text-xs file:font-semibold">
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Satu tugas: formulir di bawah terisi otomatis. Banyak tugas: tampil daftar untuk dicek sebelum diimpor. <button type="button" data-imp="csv" class="text-sky-600 hover:underline">Template CSV</button> · <button type="button" data-imp="json" class="text-sky-600 hover:underline">Template JSON</button></p></div>`;
    const formEl = modal(t.id ? 'Ubah Tugas' : 'Tugas Baru', `
      ${importBox}
      ${field('Judul tugas', `<input name="title" maxlength="80" value="${esc(t.title)}" class="${INPUT}" placeholder="Contoh: Perulangan For & While">`)}
      ${field('Instruksi', `<textarea name="description" rows="3" maxlength="500" class="${INPUT}" placeholder="Apa yang harus dikerjakan siswa?">${esc(t.description)}</textarea>`)}
      <div class="grid grid-cols-2 gap-3">
        ${field('Jenjang', `<select name="grade" class="${INPUT}">${Object.entries(GRADES).map(([k, v]) => `<option value="${k}" ${k === t.grade ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
        ${field('Jenis', `<select name="type" class="${INPUT}">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === t.type ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
        ${field('Tenggat', `<input name="due" type="date" value="${esc(t.due)}" class="${INPUT}">`)}
        ${field('Poin', `<input name="points" type="number" min="0" max="1000" value="${Number(t.points) || 0}" class="${INPUT}">`)}
        ${field('Badge hadiah', `<select name="badgeId" class="${INPUT}"><option value="">Tanpa badge</option>${act.map((b) => `<option value="${b.id}" ${b.id === t.badgeId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`)}
        ${field('Status', `<select name="status" class="${INPUT}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>`)}
      </div>
      <div class="space-y-2.5 rounded-xl border border-slate-200 dark:border-slate-700 p-3.5"><p class="${LABEL} !mb-0">Kunci jawaban &amp; penilaian</p><div id="tfKey" class="space-y-2.5">${keyHtml(ks)}</div></div>`,
      async (f) => {
        const title = (f.title || '').trim(); if (!title) return 'Judul tugas harus diisi.';
        if (!f.due) return 'Tenggat harus diisi.';
        const kc = checkKey(ks); if (kc.error) return kc.error;
        await tasks.save({ ...(t.id ? { id: t.id } : { submissions: 0 }), key: kc.key, title, description: (f.description || '').trim(), grade: f.grade, type: f.type, due: f.due,
          points: Math.max(0, parseInt(f.points, 10) || 0), badgeId: f.badgeId ? (isNaN(+f.badgeId) ? f.badgeId : +f.badgeId) : null, status: f.status });
        toast(t.id ? 'Tugas diperbarui.' : 'Tugas dibuat.'); renderTugas();
      }, true);

    // ----- kunci jawaban: ikut jenis tugas -----
    const keyBox = formEl.querySelector('#tfKey'), typeSel = formEl.querySelector('select[name=type]');
    const redraw = () => { keyBox.innerHTML = keyHtml(ks); };
    typeSel.addEventListener('change', () => { if (ks.type !== typeSel.value) { ks = emptyKey(typeSel.value); redraw(); } });
    keyBox.addEventListener('input', (e) => { if (e.target.dataset.k) applyKeyInput(ks, e.target); });
    keyBox.addEventListener('change', (e) => { if (e.target.dataset.k) applyKeyInput(ks, e.target); });
    keyBox.addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (b && keyAction(ks, b.dataset.k, Number(b.dataset.i))) redraw(); });

    // ----- impor dari file, langsung di form tambah tugas -----
    const imp = formEl.querySelector('#tfImport');
    if (imp) {
      formEl.addEventListener('click', (e) => { const b = e.target.closest('[data-imp]'); if (!b) return; b.dataset.imp === 'csv' ? download('template-tugas.csv', 'text/csv;charset=utf-8', templateCsv()) : download('template-tugas.json', 'application/json', templateJson()); });
      imp.addEventListener('change', async () => {
        const f = imp.files[0]; if (!f) return;
        const errBox = formEl.querySelector('[data-err]'), say = (m) => { errBox.textContent = m; errBox.classList.remove('hidden'); };
        try {
          if (f.size > IMPORT_MAX_BYTES) throw new Error('File lebih dari 1 MB.');
          const recs = readRecords(f.name, await f.text());
          if (!recs.length) throw new Error('Tidak ada baris tugas di file.');
          if (recs.length > IMPORT_MAX_ROWS) throw new Error(`Maksimal ${IMPORT_MAX_ROWS} tugas per file (file ini ${recs.length}).`);
          const items = recs.map((r, i) => ({ n: i + 1, ...checkRecord(r) }));
          if (items.length === 1) {
            const x = items[0]; if (x.errors.length) throw new Error(x.errors.join('; '));
            const form = formEl.querySelector('form'), d = x.data;
            ['title', 'description', 'grade', 'type', 'due', 'points', 'status'].forEach((n) => { if (form.elements[n]) form.elements[n].value = d[n] ?? ''; });
            if (form.elements.badgeId) form.elements.badgeId.value = d.badgeId ?? '';
            typeSel.dispatchEvent(new Event('change')); errBox.classList.add('hidden'); toast('Formulir terisi dari file. Atur kunci jawaban lalu simpan.');
          } else { formEl.querySelector('[data-x]').click(); openImport({ fileName: f.name, items }); }
        } catch (ex) { say(ex.message || 'File tidak bisa dibaca.'); }
      });
    }
  }
  vTugas.addEventListener('input', (e) => {
    if (e.target.id === 'tgQ') { filt.q = e.target.value; renderTugasRows(); }
  });
  vTugas.addEventListener('change', (e) => {
    if (e.target.id === 'tgGrade') { filt.grade = e.target.value; renderTugasRows(); }
    if (e.target.id === 'tgStatus') { filt.status = e.target.value; renderTugasRows(); }
    if (e.target.id === 'tgSrc') { filt.src = e.target.value; renderTugasRows(); }
  });
  vTugas.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-t]'); if (!a) return;
    const t = taskList.find((x) => String(x.id) === a.dataset.id);
    if (a.dataset.t === 'new') return taskForm();
    if (a.dataset.t === 'review' && t) return t.readOnly ? openKurReview(t) : openReview(t);
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

  // ---------- PANTAU SISWA UNTUK TUGAS KURIKULUM ----------
  // Sumber: progres siswa yang sudah ada di server (GET /api/admin/users/:id -> progressRows). Hanya menunjukkan siapa yang
  // sudah menyelesaikan task dan kapan. Isi pekerjaannya (kode, link, foto) belum dikirim portal siswa ke server.
  const progCache = new Map();
  async function studentDone(uid) {
    if (progCache.has(uid)) return progCache.get(uid);
    let m = {};
    try { const r = await window.DCAdminApi.user(uid); (r.progressRows || []).forEach((x) => { if (x.completed_at) m[String(x.task_id ?? x.taskId)] = x.completed_at; }); } catch (_) { m = null; }
    progCache.set(uid, m); return m;
  }
  async function kurRows(task) {
    const r = await window.DCAdminApi.users({ limit: 200, status: 'active' });
    const roster = (r.users || []).filter((u) => (u.allowedGrades || []).map(String).includes(task.grade));
    const rows = []; let next = 0, fail = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (next < roster.length) {
        const u = roster[next++], m = await studentDone(u.id);
        if (m === null) fail++;
        rows.push({ name: u.full_name || u.username || 'Siswa', at: m && m[task.taskId] ? m[task.taskId] : null, unknown: m === null });
      }
    }));
    rows.sort((a, b) => (!!b.at - !!a.at) || (a.at && b.at ? String(b.at).localeCompare(String(a.at)) : 0) || a.name.localeCompare(b.name));
    return { rows, fail };
  }
  function openKurReview(task) {
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50';
    el.innerHTML = '<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"></div>';
    const panel = el.firstElementChild;
    const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    const head = `<div class="flex items-start justify-between gap-3 p-5 border-b border-slate-200 dark:border-slate-800"><div class="min-w-0">
      <h3 class="text-lg font-extrabold text-slate-900 dark:text-white truncate">${esc(task.title)}</h3>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${esc(GRADES[task.grade] || task.grade)} · ${esc(task.description)}</p></div>
      <button type="button" data-r="close" class="dc-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div>`;
    panel.innerHTML = head + '<p class="p-8 text-center text-sm text-slate-500">Memuat progres siswa...</p>';
    panel.addEventListener('click', (e) => { if (e.target.closest('[data-r="close"]')) close(); });
    document.body.appendChild(el);
    kurRows(task).then(({ rows, fail }) => {
      const done = rows.filter((r) => r.at).length;
      panel.innerHTML = head + `<div class="p-5 overflow-y-auto space-y-4">
        <div class="grid grid-cols-2 gap-2.5">
          <div class="rounded-xl px-3 py-2 border ${SUB_STATUS.dinilai[1]}"><p class="text-[10px] font-mono uppercase tracking-wider opacity-80">Sudah selesai</p><p class="text-lg font-extrabold leading-tight">${done}/${rows.length}</p></div>
          <div class="rounded-xl px-3 py-2 border ${SUB_STATUS.belum[1]}"><p class="text-[10px] font-mono uppercase tracking-wider opacity-80">Belum</p><p class="text-lg font-extrabold leading-tight">${rows.length - done}</p></div></div>
        <div class="flex items-start gap-2.5 text-xs rounded-xl px-4 py-3 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30"><i class="fa-solid fa-circle-info mt-0.5"></i>
          <span>Yang tampil hanya status selesai dan waktunya. Isi pekerjaan siswa (kode, link, foto project) belum dikirim portal siswa ke server, jadi belum bisa dilihat atau dinilai di sini.${fail ? ` Progres ${fail} siswa gagal dimuat.` : ''}</span></div>
        <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-sm text-left">
          <thead class="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50"><tr><th class="px-4 py-2.5">Siswa</th><th class="px-4 py-2.5">Status</th><th class="px-4 py-2.5">Selesai pada</th></tr></thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">${rows.length ? rows.map((r) => { const st = r.at ? SUB_STATUS.dinilai : SUB_STATUS.belum; return `<tr><td class="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">${esc(r.name)}</td>
            <td class="px-4 py-2.5"><span class="text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${st[1]}">${r.at ? 'Selesai' : (r.unknown ? 'Tidak diketahui' : 'Belum')}</span></td>
            <td class="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">${r.at ? fmtTime(r.at) : '-'}</td></tr>`; }).join('') : '<tr><td colspan="3" class="px-4 py-8 text-center text-sm text-slate-500">Belum ada siswa aktif di jenjang ini.</td></tr>'}</tbody></table></div></div></div>`;
    }).catch((e) => { panel.innerHTML = head + `<p class="p-8 text-center text-sm text-rose-600">${esc(e.message || 'Gagal memuat progres siswa.')}</p>`; });
  }

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
        ${keyReviewHtml(task, r.answer)}
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

  // ---------- IMPOR TUGAS DARI FILE (CSV / JSON) ----------
  // Kolom: judul, instruksi, jenjang (SD/SMP/SMK), jenis (kode/proyek/kuis), tenggat, poin, status, badge (nama badge).
  const IMPORT_ALIAS = {
    title: ['judul', 'title', 'namatugas', 'tugas'], description: ['instruksi', 'deskripsi', 'description', 'keterangan'],
    grade: ['jenjang', 'grade', 'tingkat'], type: ['jenis', 'type', 'tipe'], due: ['tenggat', 'due', 'deadline', 'batas'],
    points: ['poin', 'points', 'point'], status: ['status'], badge: ['badge', 'lencana']
  };
  const aliasKey = (h) => { const n = String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return Object.keys(IMPORT_ALIAS).find((k) => IMPORT_ALIAS[k].includes(n)) || null; };
  const IMPORT_MAX_ROWS = 200, IMPORT_MAX_BYTES = 1024 * 1024;

  function parseCsv(text) {
    text = text.replace(/^\uFEFF/, '');
    const head = text.split(/\r?\n/, 1)[0] || '';
    const delim = [',', ';', '\t'].map((d) => [d, head.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = '', q = false;
    const endRow = () => { row.push(cell); cell = ''; if (row.some((c) => c.trim() !== '')) rows.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow(); }
      else cell += ch;
    }
    endRow();
    return rows;
  }
  function readRecords(name, text) {
    if (/\.json$/i.test(name) || /^\s*[\[{]/.test(text)) {
      let data; try { data = JSON.parse(text); } catch (_) { throw new Error('File JSON tidak valid.'); }
      const list = Array.isArray(data) ? data : (data.tugas || data.tasks || data.items || []);
      if (!Array.isArray(list)) throw new Error('JSON harus berisi daftar tugas.');
      return list.map((o) => { const r = {}; Object.entries(o || {}).forEach(([k, v]) => { const a = aliasKey(k); if (a) r[a] = v; }); return r; });
    }
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('File kosong atau hanya berisi baris judul kolom.');
    const keys = rows[0].map(aliasKey);
    if (!keys.includes('title')) throw new Error('Kolom "judul" tidak ditemukan di baris pertama.');
    return rows.slice(1).map((cells) => { const r = {}; keys.forEach((k, i) => { if (k) r[k] = (cells[i] ?? '').trim(); }); return r; });
  }
  function parseDue(v) {
    const s = String(v ?? '').trim(); if (!s) return inDays(7);
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/), y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    else return null;
    const t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
    return t.toISOString().slice(0, 10);
  }
  function checkRecord(r) {
    const errors = [], warns = [], out = {};
    out.title = String(r.title ?? '').trim();
    if (!out.title) errors.push('Judul kosong'); else if (out.title.length > 80) errors.push('Judul lebih dari 80 huruf');
    out.description = String(r.description ?? '').trim();
    if (out.description.length > 500) errors.push('Instruksi lebih dari 500 huruf');
    const g = String(r.grade ?? '').toUpperCase().replace(/[^A-Z]/g, '');
    out.grade = g === 'SD' ? 'SD' : g === 'SMP' ? 'SMP' : ['SMK', 'SMA', 'SMASMK', 'SMKSMA'].includes(g) ? 'SMK' : '';
    if (!out.grade) errors.push('Jenjang harus SD, SMP, atau SMK');
    const t = String(r.type ?? '').toLowerCase().trim();
    out.type = !t ? 'kode' : ({ kode: 'kode', code: 'kode', blok: 'blok', block: 'blok', blockcoding: 'blok', proyek: 'proyek', project: 'proyek', kuis: 'kuis', quiz: 'kuis' })[t.replace(/[^a-z]/g, '')] || '';
    if (!out.type) errors.push('Jenis harus kode, blok, kuis, atau proyek');
    out.due = parseDue(r.due); if (!out.due) errors.push('Tenggat tidak valid (pakai 2026-12-31 atau 31/12/2026)');
    const p = String(r.points ?? '').trim();
    out.points = p === '' ? 50 : Number(p);
    if (!Number.isInteger(out.points) || out.points < 0 || out.points > 1000) errors.push('Poin harus angka 0–1000');
    const s = String(r.status ?? '').toLowerCase().trim();
    out.status = !s ? 'draft' : ({ draft: 'draft', terbit: 'terbit', published: 'terbit', ditutup: 'ditutup', closed: 'ditutup' })[s] || '';
    if (!out.status) errors.push('Status harus draft, terbit, atau ditutup');
    out.badgeId = null;
    const bn = String(r.badge ?? '').trim();
    if (bn) { const b = badgeList.find((x) => x.name.toLowerCase() === bn.toLowerCase()); if (b) out.badgeId = b.id; else warns.push(`Badge "${bn}" tidak ditemukan, dilewati`); }
    if (out.title && out.grade && taskList.some((x) => x.title.toLowerCase() === out.title.toLowerCase() && x.grade === out.grade)) warns.push('Judul sama sudah ada');
    return { data: out, errors, warns };
  }
  function download(name, mime, content) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function templateCsv() {
    return '\uFEFFjudul;instruksi;jenjang;jenis;tenggat;poin;status;badge\r\n' +
      `Percabangan If-Else;"Buat program yang menentukan nilai lulus atau tidak.";SMK;kode;${inDays(14)};50;draft;\r\n` +
      `Halaman Profil HTML & CSS;Rancang halaman profil pribadi sederhana.;SMP;proyek;${inDays(21)};80;draft;\r\n` +
      `Susun Blok Perulangan;Selesaikan 5 level Blockly tentang perulangan.;SD;kuis;${inDays(7)};30;terbit;\r\n`;
  }
  function templateJson() {
    return JSON.stringify([
      { judul: 'Percabangan If-Else', instruksi: 'Buat program yang menentukan nilai lulus atau tidak.', jenjang: 'SMK', jenis: 'kode', tenggat: inDays(14), poin: 50, status: 'draft', badge: '' },
      { judul: 'Susun Blok Perulangan', instruksi: 'Selesaikan 5 level Blockly tentang perulangan.', jenjang: 'SD', jenis: 'kuis', tenggat: inDays(7), poin: 30, status: 'terbit', badge: '' }
    ], null, 2);
  }
  function openImport(pre) {
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50';
    el.innerHTML = '<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"></div>';
    const panel = el.firstElementChild;
    let items = pre ? pre.items : [], fileName = pre ? pre.fileName : '', busy = false;
    const close = () => { if (busy) return; el.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    const head = '<div class="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800"><h3 class="text-lg font-extrabold text-slate-900 dark:text-white">Impor Tugas dari File</h3><button type="button" data-i="close" class="dc-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div>';
    function draw(msg) {
      const ok = items.filter((x) => !x.errors.length), bad = items.length - ok.length;
      panel.innerHTML = head + `<div class="p-5 overflow-y-auto space-y-4">
        <div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-3">
          <input id="impFile" type="file" accept=".csv,.tsv,.txt,.json" class="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-sky-600 file:text-white file:px-4 file:py-2 file:text-xs file:font-semibold">
          <p class="text-xs text-slate-500 dark:text-slate-400">Format CSV (dari Excel/Google Sheets) atau JSON. Maksimal ${IMPORT_MAX_ROWS} tugas per file. Baris yang tidak valid dilewati.</p>
          <div class="flex flex-wrap gap-2"><button type="button" data-i="tpl-csv" class="dc-btn dc-btn-ghost dc-btn-sm"><i class="fa-solid fa-download text-[11px]"></i>Template CSV</button>
            <button type="button" data-i="tpl-json" class="dc-btn dc-btn-ghost dc-btn-sm"><i class="fa-solid fa-download text-[11px]"></i>Template JSON</button></div></div>
        ${msg ? `<p class="text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">${esc(msg)}</p>` : ''}
        ${items.length ? `<div class="space-y-2"><p class="text-sm text-slate-700 dark:text-slate-200"><b>${esc(fileName)}</b>: ${ok.length} siap diimpor${bad ? `, ${bad} bermasalah` : ''}. Semua tugas masuk sebagai status yang tertulis di file (kosong = draft).</p>
          <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"><div class="overflow-x-auto max-h-72"><table class="w-full text-xs text-left">
            <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500"><tr><th class="px-3 py-2">#</th><th class="px-3 py-2">Judul</th><th class="px-3 py-2">Jenjang</th><th class="px-3 py-2">Tenggat</th><th class="px-3 py-2">Poin</th><th class="px-3 py-2">Catatan</th></tr></thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">${items.map((x) => `<tr class="${x.errors.length ? 'bg-rose-50/50 dark:bg-rose-500/5' : ''}">
              <td class="px-3 py-2 font-mono text-slate-400">${x.n}</td><td class="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">${esc(x.data.title || '—')}</td>
              <td class="px-3 py-2">${esc(GRADES[x.data.grade] || '—')}</td><td class="px-3 py-2 whitespace-nowrap">${x.data.due ? fmtDate(x.data.due) : '—'}</td><td class="px-3 py-2">${Number.isFinite(x.data.points) ? x.data.points : '—'}</td>
              <td class="px-3 py-2 ${x.errors.length ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}">${esc(x.errors.concat(x.warns).join('; ') || 'OK')}</td></tr>`).join('')}</tbody></table></div></div></div>` : ''}
        <div class="flex justify-end gap-2"><button type="button" data-i="close" class="dc-btn dc-btn-ghost">Batal</button>
          <button type="button" data-i="go" class="${BTN}" ${ok.length ? '' : 'disabled'}><i class="fa-solid fa-file-import"></i>Impor ${ok.length || ''} tugas</button></div></div>`;
    }
    panel.addEventListener('change', async (e) => {
      if (e.target.id !== 'impFile') return;
      const f = e.target.files[0]; if (!f) return;
      if (f.size > IMPORT_MAX_BYTES) { items = []; return draw('File lebih dari 1 MB.'); }
      try {
        const recs = readRecords(f.name, await f.text());
        if (!recs.length) throw new Error('Tidak ada baris tugas di file.');
        if (recs.length > IMPORT_MAX_ROWS) throw new Error(`Maksimal ${IMPORT_MAX_ROWS} tugas per file (file ini ${recs.length}).`);
        fileName = f.name; items = recs.map((r, i) => ({ n: i + 1, ...checkRecord(r) })); draw();
      } catch (ex) { items = []; draw(ex.message || 'File tidak bisa dibaca.'); }
    });
    panel.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-i]'); if (!a) return;
      const k = a.dataset.i;
      if (k === 'close') return close();
      if (k === 'tpl-csv') return download('template-tugas.csv', 'text/csv;charset=utf-8', templateCsv());
      if (k === 'tpl-json') return download('template-tugas.json', 'application/json', templateJson());
      if (k === 'go') {
        const ok = items.filter((x) => !x.errors.length); if (!ok.length) return;
        busy = true; a.disabled = true; let done = 0;
        try {
          for (const x of ok) { a.textContent = `Mengimpor ${done + 1}/${ok.length}...`; await tasks.save({ ...x.data, submissions: 0 }); done++; }
          busy = false; el.remove(); document.removeEventListener('keydown', onKey);
          toast(`${done} tugas diimpor.`); renderTugas();
        } catch (ex) {
          busy = false; if (done) renderTugas();
          items = items.filter((x) => x.errors.length || !ok.slice(0, done).includes(x));
          draw(`Berhenti di tugas ke-${done + 1}: ${ex.message || 'gagal menyimpan'}. ${done} tugas sudah masuk.`);
        }
      }
    });
    draw();
    document.body.appendChild(el);
  }

  // ---------- muat saat halaman dibuka ----------
  window.addEventListener('dc:view', (e) => {
    if (e.detail === 'badge') renderBadge();
    if (e.detail === 'tugas') renderTugas();
  });
  // helper dipakai halaman Pengaturan & Akses (pengaturan-akses.js)
  window.DCUI = { esc, toast, INPUT, LABEL, BTN, BTN_GHOST, CARD, modal, field, makeStore };
})();
