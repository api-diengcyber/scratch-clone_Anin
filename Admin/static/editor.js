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
      <span class="flex-1"></span>
      <button type="button" id="dceCancel" class="${B}">Batal</button>
      <button type="button" id="dceSave" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white">Simpan Materi</button>
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
      <select id="dceCard" class="${IN}" aria-label="Warna kartu" title="Warna kartu (klik di dalam kartu dulu)">
        <option value="" selected disabled>Warna kartu</option><option value="reset">Bawaan</option><option value="#dbeafe|#60a5fa">Biru</option><option value="#dcfce7|#4ade80">Hijau</option>
        <option value="#fef08a|#facc15">Kuning</option><option value="#ffe4e6|#fb7185">Merah muda</option><option value="#ede9fe|#a78bfa">Ungu</option><option value="#e2e8f0|#64748b">Abu-abu</option>
      </select>
      <label class="${B} flex items-center gap-1.5 cursor-pointer" title="Pilih warna kartu sendiri">Kustom <input type="color" id="dceCardColor" value="#dbeafe" class="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer"></label>
      <span class="w-px h-5 bg-slate-300 dark:bg-slate-700 mx-1"></span>
      ${tb('image', '<i class="fa-regular fa-image mr-1"></i>Foto', 'Sisipkan foto')}${tb('video', '<i class="fa-solid fa-film mr-1"></i>Video', 'Sisipkan video')}${tb('file', '<i class="fa-solid fa-paperclip mr-1"></i>File', 'Lampirkan file')}
      <span class="text-[11px] text-slate-500 dark:text-slate-400 ml-2 hidden lg:inline">Klik langsung di halaman untuk mengedit teks.</span>
    </div>
    <iframe id="dceFrame" title="Pratinjau dan editor" class="flex-1 w-full border-0 bg-white"></iframe>
    <input type="file" id="dceFile" class="hidden" multiple>
  </div>`);

  const frameCss = `body{margin:0;padding:24px 12px 80px}[contenteditable]:hover{outline:1px dashed #93c5fd;outline-offset:3px}.dce-active{box-shadow:0 0 0 3px #4361ee55!important}[data-ph]:empty:before{content:attr(data-ph);opacity:.55}[contenteditable]:focus{outline:2px solid #4361ee;outline-offset:3px}
  .content img,.content video{max-width:100%;border-radius:12px;display:block;margin:10px 0}.file-chip{display:inline-flex;gap:8px;align-items:center;padding:8px 14px;margin:6px 6px 6px 0;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;color:#1e293b;font-size:13px;font-weight:600;text-decoration:none}`;
  const tpl = () => `<!doctype html><html lang="id"><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/shared/css/materi.css"><style>${frameCss}</style></head><body>
  <div class="container"><div class="header"><span class="badge" id="eBadge" data-ph="Label modul" contenteditable="true"></span><h1 id="eJudul" data-ph="Klik untuk menulis judul materi" contenteditable="true"></h1><p id="eSub" data-ph="Ringkasan singkat" contenteditable="true"></p></div>
  <div class="content" id="eBody" contenteditable="true"></div></div></body></html>`;

  const DEFAULT = `<h2 class="section-title">Materi Lengkap</h2><div class="card"><p>Tulis penjelasan materi di sini.</p></div>
  <h2 class="section-title">Contoh Sederhana</h2><div class="card"><p>Tulis contoh di sini.</p></div>
  <h2 class="section-title">Hal yang Perlu Diperhatikan</h2><div class="card"><ul><li>Poin penting pertama</li></ul></div>`;

  let frame, doc, cfg, objUrls = [];
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

  // warna kartu: terapkan ke kartu tempat kursor berada
  let curCard = null;
  function applyCard(v) {
    const n = doc.getSelection().anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement), c = el && el.closest && el.closest('.card, .highlight-box');
    if (c && $f('#eBody').contains(c)) curCard = c;
    if (!curCard || !curCard.isConnected) return showToast('Klik dulu di dalam teks kartu yang mau diwarnai (kartu akan bersinar biru), baru pilih warna.');
    if (v === 'reset') { curCard.style.background = ''; curCard.style.borderColor = ''; if (!curCard.getAttribute('style')) curCard.removeAttribute('style'); return showToast('Warna kartu dikembalikan.'); }
    const [bg, bd] = v.split('|');
    curCard.style.background = bg; curCard.style.borderColor = bd || bg;
    showToast('Warna kartu diubah.');
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
    link: () => { const u = prompt('Alamat tautan (https://… atau /halaman):'); if (u && /^(https?:\/\/|\/)/i.test(u.trim())) doc.execCommand('createLink', false, u.trim()); else if (u) showToast('Tautan harus diawali https:// atau /'); },
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
  $('#dceCancel').addEventListener('click', () => { if (confirm('Tutup editor? Perubahan yang belum disimpan akan hilang.')) close(); });
  $('#dceSave').addEventListener('click', async () => {
    const judul = $f('#eJudul').textContent.trim();
    if (!judul) return showToast('Judul materi belum diisi.');
    await cfg.onSave({ jalur: $('#dceJalur').value, tipe: $('#dceTipe').value, judul, badge: $f('#eBadge').textContent.trim(), subjudul: $f('#eSub').textContent.trim(), html: serialize() });
    close();
  });

  window.DCEditor = {
    open(c) {
      cfg = c; const d = c.data || {};
      $('#dceTitle').textContent = c.data ? 'Edit Materi' : 'Tambah Materi';
      $('#dceJalur').innerHTML = c.jalurOptions.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
      $('#dceJalur').value = c.jalur; $('#dceTipe').value = d.tipe || 'Materi';
      root.classList.remove('hidden'); document.body.style.overflow = 'hidden';
      frame = $('#dceFrame');
      frame.onload = () => {
        doc = frame.contentDocument;
        $f('#eBadge').textContent = d.badge || 'MODUL KODING';
        $f('#eJudul').textContent = d.judul || '';
        $f('#eSub').textContent = d.subjudul || 'Ringkasan singkat materi';
        $f('#eBody').innerHTML = d.html || DEFAULT;
        hydrate($f('#eBody')); (d.judul ? $f('#eBody') : $f('#eJudul')).focus();
        doc.addEventListener('selectionchange', () => {
          const n = doc.getSelection().anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement), c = el && el.closest && el.closest('.card, .highlight-box');
          if (c && $f('#eBody').contains(c)) { if (curCard) curCard.classList.remove('dce-active'); curCard = c; c.classList.add('dce-active'); } // ingat kartu terakhir saat fokus pindah ke toolbar
        });
        doc.addEventListener('paste', (ev) => { const t = ev.clipboardData && ev.clipboardData.getData('text/plain'); if (t) { ev.preventDefault(); doc.execCommand('insertText', false, t); } }); // tempel sebagai teks polos
      };
      frame.srcdoc = tpl();
    },
  };
})();
