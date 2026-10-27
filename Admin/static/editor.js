/* Editor materi WYSIWYG: tampilan sama dengan halaman siswa (/shared/css/materi.css).
   Klik langsung di halaman untuk mengedit. Foto/video/file disimpan di IndexedDB browser.
   API: DCEditor.open({ jalurOptions, jalur, data, onSave }) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX = 100 * 1024 * 1024;

  // ---------- penyimpanan media (IndexedDB) ----------
  const db = () => new Promise((ok, no) => {
    const r = indexedDB.open('dc_admin_media', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' });
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
  const tx = async (mode, fn) => { const d = await db(); return new Promise((ok, no) => { const q = fn(d.transaction('files', mode).objectStore('files')); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); }); };
  const putMedia = (rec) => tx('readwrite', (s) => s.put(rec));
  const getMedia = (id) => tx('readonly', (s) => s.get(id));
  const size = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  // ---------- DOM modal ----------
  const B = 'px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition';
  const IN = 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-sky-500';
  const tb = (cmd, html, title) => `<button type="button" data-cmd="${cmd}" title="${title}" aria-label="${title}" class="${B}">${html}</button>`;
  document.body.insertAdjacentHTML('beforeend', `
  <div id="dcEditor" class="hidden fixed inset-0 z-[60] flex flex-col bg-slate-100 dark:bg-slate-950" role="dialog" aria-modal="true" aria-label="Editor materi">
    <div class="flex flex-wrap items-center gap-2 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
      <strong class="text-sm text-slate-900 dark:text-white mr-2"><i class="fa-solid fa-pen-ruler text-sky-600 mr-1.5"></i><span id="dceTitle">Tambah Materi</span></strong>
      <select id="dceJalur" class="${IN} max-w-[16rem]" aria-label="Jalur belajar"></select>
      <select id="dceTipe" class="${IN}" aria-label="Tipe"><option>Materi</option><option>Lab Praktik</option><option>Proyek Akhir</option></select>
      <span id="dceStatus" class="text-[10px] font-mono font-bold px-2 py-1 rounded-md"></span>
      <span class="flex-1"></span>
      <button type="button" id="dcePreview" class="${B}" title="Lihat materi persis seperti yang dilihat siswa"><i class="fa-solid fa-eye mr-1"></i>Pratinjau Siswa</button>
      <button type="button" id="dceCancel" class="${B}">Batal</button>
      <button type="button" id="dceDraft" class="${B}"></button>
      <button type="button" id="dceSave" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"></button>
    </div>
    <div class="flex flex-wrap items-center gap-1.5 px-4 py-2 bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
      ${tb('bold', '<b>B</b>', 'Tebal')}${tb('italic', '<i>I</i>', 'Miring')}
      <select id="dceSize" class="${IN}" aria-label="Ukuran teks" title="Ukuran teks (blok teks dulu)">
        <option value="" selected disabled>Ukuran</option><option value="13px">Kecil</option><option value="normal">Normal</option>
        <option value="19px">Besar</option><option value="25px">Judul</option><option value="34px">Sangat besar</option>
      </select>${tb('ul', '<i class="fa-solid fa-list-ul"></i>', 'Daftar poin')}${tb('ol', '<i class="fa-solid fa-list-ol"></i>', 'Daftar angka')}${tb('link', '<i class="fa-solid fa-link"></i>', 'Tautan')}
      <span class="w-px h-5 bg-slate-300 dark:bg-slate-700 mx-1"></span>
      ${tb('section', '<i class="fa-solid fa-heading mr-1"></i>Bagian', 'Tambah bagian baru')}${tb('highlight', 'Kotak Sorot', 'Kotak sorot')}${tb('code', '<i class="fa-solid fa-code mr-1"></i>Kode', 'Blok kode')}
      <span class="w-px h-5 bg-slate-300 dark:bg-slate-700 mx-1"></span>
      <span class="w-px h-5 bg-slate-300 dark:bg-slate-700 mx-1"></span>
      <select id="dceCard" class="${IN}" aria-label="Warna header" title="Ubah warna header biru di atas materi">
        <option value="" selected disabled>Warna header</option><option value="reset">Bawaan</option><option value="#dbeafe|#60a5fa">Biru</option><option value="#dcfce7|#4ade80">Hijau</option>
        <option value="#fef08a|#facc15">Kuning</option><option value="#ffe4e6|#fb7185">Merah muda</option><option value="#ede9fe|#a78bfa">Ungu</option><option value="#e2e8f0|#64748b">Abu-abu</option>
      </select>
      <label class="${B} flex items-center gap-1.5 cursor-pointer" title="Pilih warna header sendiri">Kustom <input type="color" id="dceCardColor" value="#dbeafe" class="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer"></label>
      <span class="w-px h-5 bg-slate-300 dark:bg-slate-700 mx-1"></span>
      ${tb('image', '<i class="fa-regular fa-image mr-1"></i>Foto', 'Sisipkan foto')}${tb('video', '<i class="fa-solid fa-film mr-1"></i>Video', 'Sisipkan video')}${tb('file', '<i class="fa-solid fa-paperclip mr-1"></i>File', 'Lampirkan file')}
      <span class="text-[11px] text-slate-500 dark:text-slate-400 ml-2 hidden lg:inline">Klik langsung di halaman untuk mengedit teks.</span>
    </div>
    <iframe id="dceFrame" title="Pratinjau dan editor" class="flex-1 w-full border-0 bg-white"></iframe>
    <input type="file" id="dceFile" class="hidden" multiple>
  </div>`);

  document.body.insertAdjacentHTML('beforeend', `
  <div id="dcPreview" class="hidden fixed inset-0 z-[65] flex flex-col bg-slate-200 dark:bg-slate-950" role="dialog" aria-modal="true" aria-label="Pratinjau tampilan siswa">
    <div class="flex flex-wrap items-center gap-2 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
      <strong class="text-sm text-slate-900 dark:text-white"><i class="fa-solid fa-eye text-sky-600 mr-1.5"></i>Pratinjau Tampilan Siswa</strong>
      <span id="dcpStatus" class="text-[10px] font-mono font-bold px-2 py-1 rounded-md"></span>
      <span class="flex-1"></span>
      <div class="flex items-center gap-1" role="group" aria-label="Ukuran layar">
        <button type="button" data-dcp-w="100%" class="${B}"><i class="fa-solid fa-desktop mr-1"></i>Komputer</button>
        <button type="button" data-dcp-w="768px" class="${B}"><i class="fa-solid fa-tablet-screen-button mr-1"></i>Tablet</button>
        <button type="button" data-dcp-w="390px" class="${B}"><i class="fa-solid fa-mobile-screen-button mr-1"></i>HP</button>
      </div>
      <button type="button" id="dcpClose" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white">Tutup Pratinjau</button>
    </div>
    <div class="flex-1 overflow-auto flex justify-center p-3">
      <iframe id="dcpFrame" title="Tampilan materi untuk siswa" sandbox="allow-same-origin allow-popups" class="h-full border-0 bg-white rounded-xl shadow-xl transition-all" style="width:100%"></iframe>
    </div>
  </div>`);

  const frameCss = `body{margin:0;padding:24px 12px 80px}[contenteditable]:hover{outline:1px dashed #93c5fd;outline-offset:3px}.dce-active{box-shadow:0 0 0 3px #4361ee55!important}.header.dce-active{box-shadow:inset 0 0 0 4px #ffffffaa!important}[data-ph]:empty:before{content:attr(data-ph);opacity:.55}[contenteditable]:focus{outline:2px solid #4361ee;outline-offset:3px}
  .content img,.content video{max-width:100%;border-radius:12px;display:block;margin:10px 0}.file-chip{display:inline-flex;gap:8px;align-items:center;padding:8px 14px;margin:6px 6px 6px 0;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;color:#1e293b;font-size:13px;font-weight:600;text-decoration:none}`;
  const tpl = () => `<!doctype html><html lang="id"><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/shared/css/materi.css"><style>${frameCss}</style></head><body>
  <div class="container"><div class="header"><span class="badge" id="eBadge" data-ph="Label modul" contenteditable="true"></span><h1 id="eJudul" data-ph="Klik untuk menulis judul materi" contenteditable="true"></h1><p id="eSub" data-ph="Ringkasan singkat" contenteditable="true"></p></div>
  <div class="content" id="eBody" contenteditable="true"></div></div></body></html>`;

  const DEFAULT = `<h2 class="section-title">Materi Lengkap</h2><div class="card"><p>Tulis penjelasan materi di sini.</p></div>
  <h2 class="section-title">Contoh Sederhana</h2><div class="card"><p>Tulis contoh di sini.</p></div>
  <h2 class="section-title">Hal yang Perlu Diperhatikan</h2><div class="card"><ul><li>Poin penting pertama</li></ul></div>`;

  // ---------- PRATINJAU TAMPILAN SISWA (hanya baca) ----------
  const pvTpl = (d) => `<!doctype html><html lang="id"><head><meta charset="utf-8"><base target="_blank">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/shared/css/materi.css"><style>${frameCss.split('\n')[1] || ''}body{margin:0;padding:24px 12px 60px}</style></head><body>
  <div class="container"><div class="header"${d.headerStyle ? ` style="${esc(d.headerStyle)}"` : ''}>${d.badge ? `<span class="badge">${esc(d.badge)}</span>` : ''}<h1>${esc(d.judul || 'Tanpa judul')}</h1>${d.subjudul ? `<p>${esc(d.subjudul)}</p>` : ''}</div>
  <div class="content">${d.html || '<div class="card"><p><em>Materi ini belum punya isi.</em></p></div>'}</div></div></body></html>`;

  let pvUrls = [];
  const statusChip = (el, terbit) => {
    el.textContent = terbit ? 'TERSEDIA · terlihat siswa' : 'DRAFT · belum terlihat siswa';
    el.className = 'text-[10px] font-mono font-bold px-2 py-1 rounded-md ' + (terbit ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40' : 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40');
  };
  function openPreview(d, terbit) {
    const f = $('#dcpFrame');
    statusChip($('#dcpStatus'), terbit);
    $('#dcPreview').classList.remove('hidden');
    f.onload = async () => { // media (foto/video/file) diambil dari IndexedDB
      const r = f.contentDocument;
      for (const el of r.querySelectorAll('[data-mid]')) {
        const rec = await getMedia(el.dataset.mid).catch(() => null);
        if (!rec) { el.setAttribute('title', 'Media tidak ditemukan di browser ini'); continue; }
        const u = URL.createObjectURL(rec.blob); pvUrls.push(u);
        if (el.tagName === 'A') { el.href = u; el.download = rec.name; } else el.src = u;
      }
    };
    f.srcdoc = pvTpl(d);
  }
  const closePreview = () => { $('#dcPreview').classList.add('hidden'); pvUrls.forEach((u) => URL.revokeObjectURL(u)); pvUrls = []; };
  $('#dcpClose').addEventListener('click', closePreview);
  $('#dcPreview').addEventListener('click', (e) => { const b = e.target.closest('[data-dcp-w]'); if (b) $('#dcpFrame').style.width = b.dataset.dcpW; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#dcPreview').classList.contains('hidden')) closePreview(); });

  let frame, doc, cfg, objUrls = [], terbit = false;
  const $f = (s) => doc.querySelector(s);

  async function hydrate(root) { // pasang kembali blob URL dari IndexedDB
    for (const el of root.querySelectorAll('[data-mid]')) {
      const rec = await getMedia(el.dataset.mid).catch(() => null);
      if (!rec) { el.setAttribute('title', 'Media tidak ditemukan di browser ini'); continue; }
      const u = URL.createObjectURL(rec.blob); objUrls.push(u);
      if (el.tagName === 'A') { el.href = u; el.download = rec.name; } else el.src = u;
    }
  }

  function serialize() {
    const c = $f('#eBody').cloneNode(true);
    c.querySelectorAll('[data-mid]').forEach((el) => { el.removeAttribute('src'); if (el.tagName === 'A') el.removeAttribute('href'); });
    c.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
    c.querySelectorAll('.dce-active').forEach((el) => { el.classList.remove('dce-active'); if (!el.className) el.removeAttribute('class'); });
    return c.innerHTML.trim();
  }

  function insert(html) {
    const body = $f('#eBody'), sel = doc.getSelection();
    if (!sel.rangeCount || !body.contains(sel.anchorNode)) { body.focus(); const r = doc.createRange(); r.selectNodeContents(body); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
    frame.contentWindow.focus(); doc.execCommand('insertHTML', false, html);
  }

  function insertBlock(html) {
    const body = $f('#eBody'), sel = doc.getSelection();
    let n = sel.rangeCount ? sel.anchorNode : null;
    while (n && n.parentNode !== body) n = n.parentNode;
    const tmp = doc.createElement('div'); tmp.innerHTML = html;
    const nodes = [...tmp.childNodes];
    nodes.forEach((x) => (n ? n.after(x) : body.append(x)));
    if (n) n = nodes[nodes.length - 1];
    const first = nodes.find((x) => x.nodeType === 1);
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Warna header biru di atas materi (satu-satunya yang bisa diwarnai lewat toolbar)
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };
  const shade = (h, k) => { const n = parseInt(h.slice(1), 16), f = (x) => Math.round(x * k).toString(16).padStart(2, '0'); return '#' + f(n >> 16 & 255) + f(n >> 8 & 255) + f(n & 255); };
  function applyCard(v) {
    const head = $f('.header');
    if (v === 'reset') {
      ['background', 'color'].forEach((k) => head.style.removeProperty(k));
      if (!head.getAttribute('style')) head.removeAttribute('style');
      return showToast('Warna header dikembalikan.');
    }
    const [bg, bd] = v.split('|'), base = bd || bg; // preset: pakai warna aksen (lebih pekat)
    if (!/^#[0-9a-f]{6}$/i.test(base)) return;
    head.style.setProperty('background', `linear-gradient(135deg, ${base}, ${shade(base, 0.6)})`, 'important');
    head.style.setProperty('color', lum(base) > 0.7 ? '#0f172a' : '#ffffff', 'important'); // teks tetap terbaca
    showToast('Warna header diubah.');
  }

  let pick = '';
  const accept = { image: 'image/*', video: 'video/*', file: '*/*' };
  async function onFiles(files) {
    for (const f of files) {
      if (f.size > MAX) { showToast(`${f.name} terlalu besar (maks ${size(MAX)}).`); continue; }
      const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      try { await putMedia({ id, name: f.name, type: f.type, blob: f }); } catch (_) { showToast('Gagal menyimpan ' + f.name); continue; }
      const u = URL.createObjectURL(f); objUrls.push(u);
      if (pick === 'image') insert(`<p><img data-mid="${id}" src="${u}" alt="${esc(f.name)}"></p>`);
      else if (pick === 'video') insert(`<p><video data-mid="${id}" src="${u}" controls preload="metadata"></video></p>`);
      else insert(`<a class="file-chip" data-mid="${id}" href="${u}" download="${esc(f.name)}" contenteditable="false">📎 ${esc(f.name)} · ${size(f.size)}</a>&nbsp;`);
    }
  }

  // Ubah ukuran teks yang diblok -> <span style="font-size:..">
  function setSize(v) {
    const sel = doc.getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !$f('#eBody').contains(sel.anchorNode)) return showToast('Blok dulu teks yang mau diubah ukurannya.');
    const normal = v === 'normal';
    frame.contentWindow.focus();
    doc.execCommand('styleWithCSS', false, false);
    doc.execCommand('fontSize', false, '7');
    const made = [];
    doc.querySelectorAll('#eBody font[size="7"]').forEach((f) => {
      const sp = doc.createElement('span'); if (!normal) sp.style.fontSize = v;
      while (f.firstChild) sp.appendChild(f.firstChild);
      f.replaceWith(sp); made.push(sp);
    });
    if (normal) { // hapus ukuran yang pernah dipasang pada bagian yang diblok
      const r = sel.getRangeAt(0);
      doc.querySelectorAll('#eBody span[style]').forEach((sp) => { if (r.intersectsNode(sp) && sp.style.fontSize) sp.style.fontSize = ''; });
    }
    doc.querySelectorAll('#eBody span').forEach((sp) => { if (!sp.getAttribute('style') && !sp.className) sp.replaceWith(...sp.childNodes); }); // buang span kosong
    const live = made.filter((m) => m.isConnected);
    if (live.length) { const r = doc.createRange(); r.setStartBefore(live[0]); r.setEndAfter(live[live.length - 1]); sel.removeAllRanges(); sel.addRange(r); }
  }

  const cmds = {
    bold: () => doc.execCommand('bold'), italic: () => doc.execCommand('italic'),
    ul: () => doc.execCommand('insertUnorderedList'), ol: () => doc.execCommand('insertOrderedList'),
    link: async () => {
      const sel = doc.getSelection(), saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      if (!saved || saved.collapsed || !$f('#eBody').contains(saved.commonAncestorContainer)) return showToast('Blok dulu teks yang mau dijadikan tautan.');
      const u = await dcPrompt({ title: 'Tambah tautan', message: 'Teks yang kamu blok akan menjadi tautan.', placeholder: 'https://contoh.com atau /halaman', confirmText: 'Pasang tautan', tone: 'info', icon: 'fa-solid fa-link',
        validate: (v) => (/^(https?:\/\/|\/)/i.test(v) ? '' : 'Alamat harus diawali https:// atau /') });
      if (!u) return;
      frame.contentWindow.focus(); sel.removeAllRanges(); sel.addRange(saved); // kembalikan blok teks setelah dialog
      doc.execCommand('createLink', false, u);
    },
    section: () => insertBlock('<h2 class="section-title">Judul Bagian</h2><div class="card"><p>Isi bagian ini…</p></div><p><br></p>'),
    highlight: () => insertBlock('<div class="highlight-box"><p>Teks yang ingin disorot…</p></div><p><br></p>'),
    code: () => insertBlock('<div class="code-block">tulis kode di sini</div><p><br></p>'),
  };

  const root = $('#dcEditor');
  root.addEventListener('mousedown', (e) => { if (e.target.closest('[data-cmd]')) e.preventDefault(); }); // jaga seleksi teks
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]'); if (!b || !doc) return;
    const c = b.dataset.cmd;
    if (accept[c]) { pick = c; const i = $('#dceFile'); i.accept = accept[c]; i.value = ''; return i.click(); }
    cmds[c] && cmds[c]();
  });
  $('#dceCard').addEventListener('change', (e) => { applyCard(e.target.value); e.target.selectedIndex = 0; });
  $('#dceCardColor').addEventListener('input', (e) => applyCard(e.target.value));
  $('#dceSize').addEventListener('change', (e) => { if (doc) setSize(e.target.value); e.target.selectedIndex = 0; });
  $('#dceFile').addEventListener('change', (e) => onFiles([...e.target.files]));
  const close = () => { root.classList.add('hidden'); document.body.style.overflow = ''; objUrls.forEach((u) => URL.revokeObjectURL(u)); objUrls = []; };
  let initial = '';
  $('#dceCancel').addEventListener('click', async () => {
    const dirty = doc && JSON.stringify(snapshot()) !== initial; // tanya hanya kalau memang ada perubahan
    if (dirty && !(await dcConfirm({ title: 'Tutup editor?', message: 'Perubahan yang belum disimpan akan hilang.', confirmText: 'Tutup tanpa simpan', cancelText: 'Lanjut mengedit', tone: 'warning' }))) return;
    close();
  });
  const PLACEHOLDER = ['Tulis penjelasan materi di sini.', 'Tulis contoh di sini.', 'Poin penting pertama'];
  const snapshot = () => ({ headerStyle: $f('.header').getAttribute('style') || '', badge: $f('#eBadge').textContent.trim(), judul: $f('#eJudul').textContent.trim(), subjudul: $f('#eSub').textContent.trim(), html: serialize() });

  function refreshButtons() { // tombol menyesuaikan status materi
    statusChip($('#dceStatus'), terbit);
    $('#dceSave').innerHTML = terbit ? '<i class="fa-solid fa-floppy-disk mr-1.5"></i>Simpan Perubahan' : '<i class="fa-solid fa-cloud-arrow-up mr-1.5"></i>Unggah ke Siswa';
    $('#dceDraft').innerHTML = terbit ? '<i class="fa-solid fa-eye-slash mr-1"></i>Tarik ke Draft' : '<i class="fa-regular fa-floppy-disk mr-1"></i>Simpan Draft';
  }

  async function simpan(publish) {
    const d = snapshot();
    if (!d.judul) return showToast('Judul materi belum diisi.');
    if (publish) { // cek kelayakan sebelum tampil ke siswa
      if (!doc.querySelector('#eBody').textContent.trim() && !doc.querySelector('#eBody [data-mid]')) return showToast('Isi materi masih kosong, belum bisa diunggah.');
      const body = $f('#eBody').textContent;
      if (PLACEHOLDER.some((t) => body.includes(t)) && !(await dcConfirm({ title: 'Masih ada teks contoh', message: 'Teks bawaan seperti “Tulis penjelasan materi di sini.” belum diganti. Tetap unggah ke siswa?', confirmText: 'Tetap unggah', cancelText: 'Kembali mengedit', tone: 'warning' }))) return;
    }
    await cfg.onSave({ jalur: $('#dceJalur').value, tipe: $('#dceTipe').value, ...d, publish });
    close();
  }
  // Primary: Unggah (draft) / Simpan Perubahan (sudah tersedia). Secondary: Simpan Draft / Tarik ke Draft.
  $('#dceSave').addEventListener('click', () => simpan(true));
  $('#dceDraft').addEventListener('click', () => simpan(false));
  $('#dcePreview').addEventListener('click', () => { const d = snapshot(); if (!d.judul && !d.html) return showToast('Belum ada isi untuk dipratinjau.'); openPreview(d, terbit); });

  window.DCEditor = {
    preview(d, isTerbit) { openPreview(d, isTerbit); },
    open(c) {
      cfg = c; const d = c.data || {};
      terbit = c.data ? (c.data.status || 'terbit') === 'terbit' : false; // materi lama tanpa status dianggap sudah tersedia
      $('#dceTitle').textContent = c.data ? 'Edit Materi' : 'Tambah Materi';
      $('#dceJalur').innerHTML = c.jalurOptions.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
      $('#dceJalur').value = c.jalur; $('#dceTipe').value = d.tipe || 'Materi';
      root.classList.remove('hidden'); document.body.style.overflow = 'hidden';
      refreshButtons();
      frame = $('#dceFrame');
      frame.onload = () => {
        doc = frame.contentDocument;
        $f('#eBadge').textContent = d.badge || 'MODUL KODING';
        $f('#eJudul').textContent = d.judul || '';
        $f('#eSub').textContent = d.subjudul || 'Ringkasan singkat materi';
        $f('#eBody').innerHTML = d.html || DEFAULT;
        hydrate($f('#eBody')); (d.judul ? $f('#eBody') : $f('#eJudul')).focus();
        initial = JSON.stringify(snapshot()); // acuan untuk mendeteksi perubahan
        if (d.headerStyle) $f('.header').setAttribute('style', d.headerStyle);
        doc.addEventListener('paste', (ev) => { const t = ev.clipboardData && ev.clipboardData.getData('text/plain'); if (t) { ev.preventDefault(); doc.execCommand('insertText', false, t); } }); // tempel sebagai teks polos
      };
      frame.srcdoc = tpl();
    },
  };
})();
