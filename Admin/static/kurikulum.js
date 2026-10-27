/* Modul & Kurikulum: CRUD Jalur Belajar + Materi, tampilan kartu bergaya baru.
   Data disimpan di backend lewat /api/admin/curriculum. Seed awal hanya dipakai
   saat server belum punya dokumen kurikulum. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // `teks` di antara backtick tampil sebagai <code>
  const fmt = (v) => esc(v).replace(/`([^`]+)`/g, '<code class="mc-code">$1</code>');
  const hex = (w) => (/^#[0-9a-f]{6}$/i.test(w) ? w : '#3d8bf5');
  const slugify = (v) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'jalur';

  // ---------- KONSTANTA TAMPILAN ----------
  const JENJANG = {
    SD:  { urut: 1, label: 'SD (Blockly & Scratch)', dot: '#f59e0b' },
    SMP: { urut: 2, label: 'SMP (Python & Web)', dot: '#0ea5e9' },
    SMK: { urut: 3, label: 'SMA / SMK (Fullstack)', dot: '#6366f1' },
  };
  const TAHAP_PALET = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#ef4444', '#84cc16'];
  const TAHAP_WARNA = new Proxy({}, { get: (_, t) => TAHAP_PALET[(((Number(t) || 1) - 1) % TAHAP_PALET.length + TAHAP_PALET.length) % TAHAP_PALET.length] });
  // Judul & ikon tiap tahap (header grup: "SMP • TAHAP 1  Python Start")
  const TAHAP_INFO = {
    'SD|1': { nama: 'Basic', ikon: 'fa-solid fa-seedling', warna: '#f59e0b' },
    'SD|2': { nama: 'Explore', ikon: 'fa-solid fa-compass', warna: '#0ea5e9' },
    'SMP|1': { nama: 'Python Start', ikon: 'fa-brands fa-python', warna: '#2563eb' },
    'SMP|2': { nama: 'Web Advanced', ikon: 'fa-brands fa-html5', warna: '#10b981' },
    'SMP|3': { nama: 'Game Dev 3D Lanjutan', ikon: 'fa-solid fa-cube', warna: '#f97316' },
    'SMK|1': { nama: 'Python Lanjutan & Algoritma', ikon: 'fa-brands fa-python', warna: '#0f9b8e', meta: 'Usia 15–18 tahun · 36 Pertemuan · 90 Menit/Sesi' },
    'SMK|2': { nama: 'Web Development Advanced', ikon: 'fa-brands fa-html5', warna: '#e11d48', meta: 'Usia 15–18 tahun · 36 Pertemuan · 90 Menit/Sesi' },
    'SMK|3': { nama: 'Data & AI Terapan', ikon: 'fa-solid fa-brain', warna: '#7c3aed', meta: 'Usia 15–18 tahun · 36 Pertemuan · 90 Menit/Sesi' },
  };
  const IKON_DEFAULT = 'fa-solid fa-cube';

  // ---------- DATA LAYER ----------
  // mk(jenjang, tahap, nama, warna, ikon, ringkas, {tags, lab, durasi, siswa, capstone, proyek, lencana, meta, materi})
  const mk = (jenjang, tahap, nama, warna, ikon, ringkas = '', x = {}) => ({
    id: slugify(jenjang + ' ' + nama), jenjang, tahap, nama, warna, ikon, ringkas,
    tags: [], lab: 0, durasi: '', siswa: null, capstone: false,
    lencana: '', meta: '', proyek: '', materi: [], ...x,
  });
  const lab = (judul, tipe, durasi, tes = false) => ({ id: slugify(judul), judul, tipe, durasi, tes });

  const SEED = [
    // ===== SD =====
    mk('SD', 1, 'Animasi Sederhana', '#f59e0b', 'fa-solid fa-film'),
    mk('SD', 1, 'Seni dari Komputer', '#f59e0b', 'fa-solid fa-palette'),
    mk('SD', 1, 'Memahat Tanah Liat', '#f59e0b', 'fa-solid fa-hands'),
    mk('SD', 1, 'Mendesain Rumah', '#f59e0b', 'fa-solid fa-house'),
    mk('SD', 1, 'Animasi ala Peppa Pig', '#f59e0b', 'fa-solid fa-tv'),
    mk('SD', 2, 'Game Development', '#0ea5e9', 'fa-solid fa-gamepad'),
    mk('SD', 2, '3D & Roblox', '#0ea5e9', 'fa-solid fa-cube'),
    mk('SD', 2, 'Website Development', '#0ea5e9', 'fa-solid fa-globe'),

    // ===== SMP · Tahap 1 — Python Start =====
    mk('SMP', 1, 'Dasar Python & Variabel', '#2563eb', 'fa-brands fa-python',
      'Sintaks `print()` pertama, manajemen variabel memori, tipe data primitif, dan interaktivitas `input()`.',
      { tags: ['Syntax', 'Variables', 'Data Types'], lab: 8, durasi: '3.5 Jam', siswa: 420,
        lencana: '🐍 Lencana Programmer Python', meta: '36 Pertemuan · 90 Menit/Sesi',
        materi: [
          lab('Pengenalan Lingkungan Code Lab', 'Hands-on', '15 Mnt'),
          lab('Variabel & Penamaan Identifier', 'Live Compiler', '25 Mnt'),
          lab('Tipe Data String, Int & Float', 'Evaluasi Otomatis', '30 Mnt'),
          lab('Tantangan Logika Mini: Kalkulator Umur', 'Quiz Praktikum', '40 Mnt', true),
        ] }),
    mk('SMP', 1, 'Struktur Kontrol', '#2563eb', 'fa-solid fa-code-branch',
      'Logika percabangan kompleks `if/elif/else`, operator boolean, serta looping `for` dan `while`.',
      { tags: ['If-Else', 'Loops', 'Logic Flow'], lab: 8, durasi: '4.0 Jam', siswa: 388 }),
    mk('SMP', 1, 'Fungsi & Modul Math', '#2563eb', 'fa-solid fa-calculator',
      'Modularitas kode dengan keyword `def`, parameter passing, nilai return, serta modul math standar.',
      { tags: ['Functions', 'Return Value', 'Modul Math'], lab: 8, durasi: '3.8 Jam', siswa: 352 }),
    mk('SMP', 1, 'OOP: Kelas & Inheritance', '#2563eb', 'fa-solid fa-shapes',
      'Dasar pemrograman berorientasi objek: kelas, instansiasi object, konstruktor `__init__`, dan pewarisan sifat.',
      { tags: ['Class', 'Object', 'Inheritance'], lab: 8, durasi: '4.5 Jam', siswa: 290 }),
    mk('SMP', 1, 'Game 2D Python', '#2563eb', 'fa-solid fa-gamepad',
      'Membangun game arcade 2D dari awal: game loop, deteksi tabrakan (collision), sprite animasi, dan sound effect.',
      { tags: ['Game Loop', 'Pygame', 'Collision'], lab: 8, durasi: '5.0 Jam', siswa: 275, proyek: 'Game 2D buatan sendiri' }),
    mk('SMP', 1, 'Hackathon Finale', '#2563eb', 'fa-solid fa-trophy',
      'Proyek tim penutup Tahap 1: tantangan coding nyata secara kolaboratif dengan Git dan presentasi kode.',
      { tags: ['Teamwork', 'Portfolio', 'Review'], capstone: true, durasi: '6.0 Jam', siswa: 260, proyek: 'Karya tim' }),

    // ===== SMP · Tahap 2 — Web Advanced =====
    mk('SMP', 2, 'HTML Semantik & Struktur Halaman', '#10b981', 'fa-brands fa-html5',
      'Pondasi web modern: tag `<header>`, `<nav>`, `<main>`, `<section>`, dan optimasi SEO.',
      { tags: ['Semantic', 'Accessibility', 'SEO Dasar'], lab: 8, durasi: '3.2 Jam', siswa: 310 }),
    mk('SMP', 2, 'Layout CSS: Flexbox & Grid', '#10b981', 'fa-brands fa-css3-alt',
      'Menyusun tata letak halaman modern secara presisi: alignment flexbox, multi-column grid, gap system, tanpa float.',
      { tags: ['Flexbox', 'CSS Grid', 'Modern Layout'], lab: 8, durasi: '4.2 Jam', siswa: 295 }),
    mk('SMP', 2, 'Responsif & Media Query', '#10b981', 'fa-solid fa-mobile-screen-button',
      'Tampilan adaptif di HP, tablet, dan desktop memakai `@media` queries dan fluid typography.',
      { tags: ['Responsive', 'Mobile-First', 'Breakpoints'], lab: 8, durasi: '3.5 Jam', siswa: 280 }),
    mk('SMP', 2, 'Form & Aksesibilitas', '#10b981', 'fa-solid fa-square-pen',
      'Form interaktif yang benar, validasi input HTML5, label semantik, dan standar aksesibilitas pembaca layar.',
      { tags: ['Forms', 'Validation', 'A11y'], lab: 8, durasi: '3.0 Jam', siswa: 250 }),
    mk('SMP', 2, 'JavaScript Dasar & DOM', '#10b981', 'fa-brands fa-js',
      'Menghidupkan halaman web: selector DOM, event klik dan input, perubahan style dinamis, mini kalkulator.',
      { tags: ['DOM Events', 'Functions', 'Interactivity'], lab: 8, durasi: '4.5 Jam', siswa: 240 }),
    mk('SMP', 2, 'Portofolio Web Pribadi', '#10b981', 'fa-solid fa-globe',
      'Mempublikasikan website portofolio interaktif ke GitHub Pages dengan custom domain gratis dari Dieng Cyber.',
      { tags: ['Deployment', 'GitHub Pages', 'Showcase'], capstone: true, durasi: '5.5 Jam', siswa: 230, proyek: 'Website portofolio pribadi' }),

    // ===== SMP · Tahap 3 — Game Dev 3D Lanjutan =====
    mk('SMP', 3, 'World Building & Transformasi', '#f97316', 'fa-solid fa-earth-asia', 'Membangun dunia 3D dan memindah/memutar objek.'),
    mk('SMP', 3, 'Kontrol Karakter', '#f97316', 'fa-solid fa-person-running', 'Menggerakkan karakter dengan keyboard dan mouse.'),
    mk('SMP', 3, 'Fisika & Raycast', '#f97316', 'fa-solid fa-atom', 'Gravitasi, tabrakan, dan raycast.'),
    mk('SMP', 3, 'Game Loop, Audio & AI Musuh', '#f97316', 'fa-solid fa-volume-high', 'Alur game, suara, dan musuh yang bergerak sendiri.'),
    mk('SMP', 3, 'Optimasi Performa', '#f97316', 'fa-solid fa-gauge-high', 'Membuat game 3D tetap lancar.'),
    mk('SMP', 3, '3D Game Showcase', '#f97316', 'fa-solid fa-trophy', 'Pameran game 3D akhir tahap.', { capstone: true, proyek: 'Game 3D showcase' }),

    // ===== SMA/SMK (usia 15-18) · Tahap 1 — Python Lanjutan & Algoritma =====
    mk('SMK', 1, 'Struktur Data: List, Dict & Set', '#0f9b8e', 'fa-solid fa-box', 'List, tuple, dict, set, dan kapan memakainya.'),
    mk('SMK', 1, 'Algoritma Pencarian & Pengurutan', '#0f9b8e', 'fa-solid fa-magnifying-glass', 'Linear search, binary search, bubble sort.'),
    mk('SMK', 1, 'Fungsi Lanjut & Rekursi', '#0f9b8e', 'fa-solid fa-repeat', 'Parameter default, lambda, comprehension, rekursi.'),
    mk('SMK', 1, 'File, JSON & Penanganan Error', '#0f9b8e', 'fa-solid fa-floppy-disk', 'Membaca dan menulis file, JSON, try/except.'),
    mk('SMK', 1, 'OOP Lanjutan', '#0f9b8e', 'fa-solid fa-cubes', 'Enkapsulasi, polimorfisme, method khusus.'),
    mk('SMK', 1, 'Capstone: Aplikasi Python', '#0f9b8e', 'fa-solid fa-trophy', 'Aplikasi lengkap dari rencana sampai presentasi.', { capstone: true }),
    // ===== SMA/SMK · Tahap 2 — Web Development Advanced =====
    mk('SMK', 2, 'HTML Semantik & Layout CSS', '#e11d48', 'fa-solid fa-compass', 'Header, main, section, flexbox, grid.'),
    mk('SMK', 2, 'Responsif & Aksesibilitas', '#e11d48', 'fa-solid fa-mobile-screen-button', 'Media query, ukuran relatif, web untuk semua orang.'),
    mk('SMK', 2, 'JavaScript Dasar & DOM', '#e11d48', 'fa-solid fa-bolt', 'Variabel, fungsi, mengubah halaman lewat kode.'),
    mk('SMK', 2, 'JavaScript Interaktif & Data', '#e11d48', 'fa-solid fa-note-sticky', 'Event, array, localStorage, dan data JSON.'),
    mk('SMK', 2, 'Web App Mini & Kerapian Kode', '#e11d48', 'fa-solid fa-puzzle-piece', 'Menyatukan HTML, CSS, JS jadi aplikasi yang rapi.'),
    mk('SMK', 2, 'Capstone: Aplikasi Web', '#e11d48', 'fa-solid fa-rocket', 'Aplikasi web interaktif dari rancangan sampai demo.', { capstone: true }),
    // ===== SMA/SMK · Tahap 3 — Data & AI Terapan =====
    mk('SMK', 3, 'Berpikir dengan Data', '#7c3aed', 'fa-solid fa-magnifying-glass-chart', 'Mengumpulkan, merapikan, dan membaca data.'),
    mk('SMK', 3, 'Statistik Dasar dengan Python', '#7c3aed', 'fa-solid fa-chart-line', 'Rata-rata, median, modus, dan sebaran.'),
    mk('SMK', 3, 'Visualisasi & Bercerita dengan Data', '#7c3aed', 'fa-solid fa-chart-pie', 'Memilih grafik yang tepat dan menceritakannya.'),
    mk('SMK', 3, 'Konsep Machine Learning', '#7c3aed', 'fa-solid fa-robot', 'Klasifikasi, data latih, data uji, akurasi.'),
    mk('SMK', 3, 'AI Bertanggung Jawab', '#7c3aed', 'fa-solid fa-scale-balanced', 'Bias, privasi, hoaks, dan etika.'),
    mk('SMK', 3, 'Capstone: Proyek Data & AI', '#7c3aed', 'fa-solid fa-graduation-cap', 'Proyek dari pertanyaan sampai kesimpulan.', { capstone: true }),
  ];

  const seedTahap = () => Object.entries(TAHAP_INFO).map(([k, v]) => {
    const [jenjang, no] = k.split('|');
    return { jenjang, no: Number(no), nama: v.nama, ikon: v.ikon || IKON_DEFAULT, warna: v.warna || TAHAP_WARNA[no], meta: v.meta || '' };
  });
  const seedJalur = () => structuredClone(SEED);

  const doc = { exists: false, version: 0, tahap: [], jalur: [], loaded: false };
  let loadPromise = null;
  let saveChain = Promise.resolve(true);

  function client() {
    if (!window.DCAdminApi) throw new Error('Klien API Admin belum dimuat.');
    return window.DCAdminApi;
  }
  function setDocument(data) {
    const curriculum = data.curriculum || data;
    doc.exists = Boolean(data.exists);
    doc.version = Number(data.version) || 0;
    doc.tahap = Array.isArray(curriculum.tahap) ? curriculum.tahap : [];
    doc.jalur = Array.isArray(curriculum.jalur) ? curriculum.jalur : [];
    doc.loaded = true;
    if (doc.exists) {
      try {
        window.dispatchEvent(new CustomEvent('dc:curriculum-updated', {
          detail: { version: doc.version, paths: doc.jalur.length }
        }));
      } catch (_) {}
    }
    return doc;
  }
  async function loadDocument() {
    if (doc.loaded) return doc;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const res = await client().curriculum();
        if (res.exists) return setDocument(res);
        // Server belum punya dokumen: unggah seed sekali agar semua admin
        // berikutnya melihat data yang sama.
        const saved = await client().saveCurriculum({
          version: Number(res.version) || 0,
          tahap: seedTahap(),
          jalur: seedJalur()
        });
        return setDocument(saved);
      } catch (err) {
        if (err.code === 'CURRICULUM_VERSION_CONFLICT') {
          try { return setDocument(await client().curriculum()); } catch (_) {}
        }
        console.error('Gagal memuat kurikulum:', err);
        if (typeof showToast === 'function') showToast(err.message || 'Gagal memuat kurikulum dari server.');
        // Tetap tampilkan seed agar halaman tidak kosong; simpan berikutnya
        // akan mencoba lagi dan melaporkan error bila server tetap gagal.
        return setDocument({ exists: false, version: 0, curriculum: { tahap: seedTahap(), jalur: seedJalur() } });
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  }
  async function persistDocument(jalurList, tahapListData) {
    await loadDocument();
    const run = saveChain.then(async () => {
      try {
        const res = await client().saveCurriculum({
          version: doc.version,
          tahap: structuredClone(tahapListData),
          jalur: structuredClone(jalurList)
        });
        setDocument(res);
        return true;
      } catch (err) {
        const message = err.code === 'CURRICULUM_VERSION_CONFLICT'
          ? 'Kurikulum sudah diubah admin lain. Muat ulang halaman sebelum menyimpan lagi.'
          : (err.message || 'Gagal menyimpan kurikulum.');
        if (typeof showToast === 'function') showToast(message);
        return false;
      }
    });
    saveChain = run.catch(() => false);
    return run;
  }

  const api = {
    async list() { await loadDocument(); return structuredClone(doc.jalur); },
    async listTahap() { await loadDocument(); return structuredClone(doc.tahap); },
    async saveAll(list) {
      await loadDocument();
      return persistDocument(list, doc.tahap);
    },
    async saveTahap(list) {
      await loadDocument();
      return persistDocument(doc.jalur, list);
    },
    async saveDocument(jalurList, tahapListData) {
      await loadDocument();
      return persistDocument(jalurList, tahapListData);
    },
  };

  // ---------- STATE ----------
  let jalur = [];
  let tahapList = [];
  let filter = 'all';
  let query = '';
  let sortBy = 'default';
  let previewId = '';

  const labCount = (j) => Math.max(j.lab || 0, (j.materi || []).length);
  const tahapOf = (j) => j.tahap || 1;
  const tahapKey = (t) => t.jenjang + '|' + t.no;
  const tahapInfo = (jenjang, no) => tahapList.find((t) => t.jenjang === jenjang && t.no === Number(no));
  const nextTahapNo = (jenjang) => Math.max(0, ...tahapList.filter((t) => t.jenjang === jenjang).map((t) => t.no), ...jalur.filter((j) => j.jenjang === jenjang).map(tahapOf)) + 1;

  // ---------- RENDER: STATISTIK, FILTER ----------
  function renderStats() {
    const totalLab = jalur.reduce((n, j) => n + labCount(j), 0);
    const totalSiswa = jalur.reduce((n, j) => n + (j.siswa || 0), 0);
    const capstone = jalur.filter((j) => j.capstone).length;
    const box = (label, icon, tone, value, unit, note) => `
      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-card">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">${label}</span>
          <div class="w-7 h-7 rounded-lg ${tone} flex items-center justify-center text-xs"><i class="${icon}"></i></div>
        </div>
        <p class="text-2xl font-extrabold text-slate-900 dark:text-white">${value.toLocaleString('id-ID')} <span class="text-xs font-normal text-slate-400">${unit}</span></p>
        <span class="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-1 block">${note}</span>
      </div>`;
    $('#kurStats').innerHTML =
      box('Total Modul', 'fa-solid fa-cube', 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400', jalur.length, 'Modul', `${Object.keys(JENJANG).filter((k) => jalur.some((j) => j.jenjang === k)).length} jenjang`) +
      box('Total Code Lab', 'fa-solid fa-code', 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400', totalLab, 'Lab', 'Praktikum interaktif') +
      box('Siswa Aktif', 'fa-solid fa-users', 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400', totalSiswa, 'Siswa', 'Jumlah per modul') +
      box('Proyek Akhir', 'fa-solid fa-trophy', 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400', capstone, 'Capstone', 'Penutup tiap tahap');
    $('#kurCount').textContent = `${jalur.length} Modul Aktif`;
  }

  function renderFilter() {
    const on = 'filter-btn px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-600/25 whitespace-nowrap flex items-center gap-1.5';
    const off = 'filter-btn px-4 py-2 rounded-xl text-xs font-semibold bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition whitespace-nowrap flex items-center gap-1.5';
    const items = [['all', 'Semua Jenjang', '']].concat(Object.entries(JENJANG).map(([k, v]) => [k, v.label, v.dot]));
    $('#jalurFilter').innerHTML = items.map(([k, label, dot]) =>
      `<button data-filter="${k}" class="${k === filter ? on : off}">${dot ? `<span class="w-2 h-2 rounded-full" style="background:${k === filter ? '#fff' : dot}"></span>` : ''}${esc(label)}</button>`).join('');
  }

  // ---------- RENDER: KARTU ----------
  function card(j) {
    const c = hex(j.warna);
    const tint = `background:${c}1a;color:${c};border:1px solid ${c}33`;
    const tags = (j.tags || []).length
      ? `<div class="flex flex-wrap gap-1.5 pt-1">${j.tags.map((t) => `<span class="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${esc(t)}</span>`).join('')}</div>` : '';
    const n = labCount(j);
    const metrics = [
      j.capstone ? ['PROYEK', '1 Akhir', ''] : ['MATERI', n ? `${n} Lab` : '—', ''],
      ['DURASI', j.durasi || '—', ''],
      [j.capstone ? 'TIM' : 'SISWA', j.siswa ? `${j.siswa.toLocaleString('id-ID')} ${j.capstone ? 'Tim' : 'Aktif'}` : '—', `style="color:${c}"`],
    ];
    return `
    <div class="module-card group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-card hover:shadow-card-hover transition-all flex flex-col justify-between overflow-hidden" style="--c:${c}">
      <div class="p-5 space-y-3.5">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-lg shadow-xs" style="${tint}"><i class="${esc(j.ikon || IKON_DEFAULT)}"></i></div>
            <div class="min-w-0">
              <span class="inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded-md" style="${tint}">${esc(j.jenjang)} • ${j.capstone ? 'Capstone' : 'Tahap ' + tahapOf(j)}</span>
              <h3 class="mc-title font-bold text-slate-900 dark:text-white text-base mt-0.5 leading-snug transition-colors">${esc(j.nama)}</h3>
            </div>
          </div>
          <span class="w-2.5 h-2.5 shrink-0 mt-1 rounded-full bg-emerald-500 ring-4 ring-emerald-50 dark:ring-emerald-950/50" title="Aktif di portal siswa"></span>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">${j.ringkas ? fmt(j.ringkas) : '<em>Belum ada ringkasan.</em>'}</p>
        ${tags}
        <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
          ${metrics.map(([l, v, st]) => `<div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50"><span class="text-[10px] text-slate-400 block font-mono">${l}</span><span class="text-xs font-bold ${st ? '' : 'text-slate-800 dark:text-slate-200'}" ${st}>${esc(v)}</span></div>`).join('')}
        </div>
      </div>
      <div class="px-5 py-3.5 bg-slate-50/60 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
        <button data-prev="${esc(j.id)}" class="text-xs font-semibold flex items-center gap-1.5 hover:opacity-80 transition" style="color:${c}">
          <i class="fa-solid fa-eye text-xs"></i><span>Silabus &amp; Lab</span>
        </button>
        <div class="flex items-center gap-1.5">
          <button data-edit="${esc(j.id)}" class="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-xs transition flex items-center gap-1.5">
            <i class="fa-solid fa-pen text-[11px] text-slate-400"></i><span>Edit</span>
          </button>
          <button data-del="${esc(j.id)}" class="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition" title="Hapus modul" aria-label="Hapus ${esc(j.nama)}">
            <i class="fa-regular fa-trash-can text-xs"></i>
          </button>
        </div>
      </div>
    </div>`;
  }

  function sectionHead(jenjang, tahap, rows) {
    const info = tahapInfo(jenjang, tahap);
    const c = (info && info.warna) || TAHAP_WARNA[tahap] || '#0ea5e9';
    const label = jenjang === 'SMK' ? 'SMA/SMK' : jenjang;
    const totalLab = rows.reduce((n, j) => n + labCount(j), 0);
    return `
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-2.5">
        <div class="flex items-center gap-2.5">
          <span class="px-2.5 py-1 rounded-md font-mono text-[11px] font-bold uppercase tracking-wider" style="background:${c}1f;color:${c}">${esc(label)} • TAHAP ${tahap}</span>
          ${info ? `<h2 class="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono flex items-center gap-2"><i class="${esc(info.ikon || IKON_DEFAULT)}" style="color:${c}"></i>${esc(info.nama)}</h2>` : ''}
        </div>
        <span class="text-xs font-mono text-slate-500 dark:text-slate-400">${rows.length} Modul${totalLab ? ` • ${totalLab} Code Lab` : ''}${info && info.meta ? ` • ${esc(info.meta)}` : ''}</span>
      </div>`;
  }

  function render() {
    renderTahap();
    renderStats();
    renderFilter();
    const q = query.trim().toLowerCase();
    let rows = jalur.filter((j) => (filter === 'all' || j.jenjang === filter) &&
      (!q || [j.nama, j.ringkas, ...(j.tags || [])].join(' ').toLowerCase().includes(q)));

    // kelompokkan per jenjang + tahap (urutan tetap, lalu urutkan di dalam grup)
    const groups = new Map();
    rows.slice().sort((x, y) => (JENJANG[x.jenjang]?.urut || 9) - (JENJANG[y.jenjang]?.urut || 9) || tahapOf(x) - tahapOf(y))
      .forEach((j) => { const g = j.jenjang + '|' + tahapOf(j); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(j); });

    let html = '';
    groups.forEach((list, g) => {
      if (sortBy === 'lab') list.sort((a, b) => labCount(b) - labCount(a));
      if (sortBy === 'siswa') list.sort((a, b) => (b.siswa || 0) - (a.siswa || 0));
      const [jenjang, tahap] = g.split('|');
      html += `<section class="space-y-4">${sectionHead(jenjang, Number(tahap), list)}<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">${list.map(card).join('')}</div></section>`;
    });
    $('#jalurGrid').innerHTML = html || `<div class="text-center text-sm text-slate-500 py-12">${jalur.length ? 'Tidak ada modul yang cocok.' : 'Belum ada jalur belajar. Klik "Tambah Jalur" untuk membuat.'}</div>`;
    fillMateriSelect();
    if (previewId && !$('#modalPreview').classList.contains('hidden')) renderPreview();
  }

  // ---------- PRATINJAU SILABUS & LAB ----------
  function renderPreview() {
    const j = jalur.find((x) => x.id === previewId);
    if (!j) return;
    const c = hex(j.warna);
    const badge = $('#prevBadge');
    badge.textContent = `${j.jenjang === 'SMK' ? 'SMA/SMK' : j.jenjang} • ${j.capstone ? 'Capstone' : 'Tahap ' + tahapOf(j)}`;
    badge.style.cssText = `background:${c}1f;color:${c}`;
    $('#prevTitle').textContent = j.nama;
    $('#prevSub').textContent = [j.lencana, j.meta, j.proyek && 'Proyek: ' + j.proyek].filter(Boolean).join(' • ') || 'Dieng Runner Test Aktif';
    const list = j.materi || [];
    $('#prevList').innerHTML = list.length ? list.map((m, i) => `
      <div class="group p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="w-6 h-6 shrink-0 rounded-lg font-mono font-bold text-xs flex items-center justify-center" style="background:${c}1f;color:${c}">${i + 1}</span>
          <div class="min-w-0">
            <p class="font-bold text-slate-900 dark:text-white truncate">${esc(m.judul)}</p>
            <span class="text-[11px] text-slate-400 font-mono">${esc([m.tipe, m.durasi].filter(Boolean).join(' • '))}</span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${m.tes ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'}">${m.tes ? 'Mini Test' : 'Tersedia'}</span>
          <button data-emat="${esc(j.id)}|${esc(m.id)}" class="text-sky-600 px-1 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Edit materi ${esc(m.judul)}" title="Edit materi"><i class="fa-solid fa-pen"></i></button>
          <button data-delmat="${esc(j.id)}|${esc(m.id)}" class="text-rose-500 px-1 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Hapus materi ${esc(m.judul)}"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>`).join('')
      : '<div class="text-center text-slate-400 py-8">Belum ada materi di modul ini.<br>Klik “Tambah Materi” untuk menambahkan.</div>';
    $('#prevFoot').textContent = `${list.length} materi${j.lab && j.lab > list.length ? ` dari ${j.lab} lab` : ''}`;
  }

  function openPreview(id) {
    previewId = id;
    renderPreview();
    $('#modalPreview').classList.remove('hidden');
  }


  // ---------- PEMILIH IKON (gambar, tanpa hafal kode) ----------
  const IKON_LIST = [
    ['fa-solid fa-cube', 'Kubus 3D', '3d kubus roblox blok'],
    ['fa-solid fa-gamepad', 'Game', 'game permainan main'],
    ['fa-solid fa-dice', 'Dadu', 'dadu acak game'],
    ['fa-solid fa-puzzle-piece', 'Puzzle', 'puzzle teka-teki kerapian'],
    ['fa-solid fa-chess', 'Catur', 'catur strategi'],
    ['fa-solid fa-ghost', 'Hantu', 'hantu musuh game'],
    ['fa-solid fa-code', 'Kode', 'kode coding program'],
    ['fa-solid fa-laptop-code', 'Laptop Kode', 'laptop komputer coding'],
    ['fa-solid fa-terminal', 'Terminal', 'terminal command baris perintah'],
    ['fa-solid fa-file-code', 'File Kode', 'file kode dokumen'],
    ['fa-solid fa-bug', 'Bug', 'bug error debug'],
    ['fa-solid fa-keyboard', 'Keyboard', 'keyboard ketik'],
    ['fa-brands fa-python', 'Python', 'python ular'],
    ['fa-brands fa-html5', 'HTML5', 'html web halaman'],
    ['fa-brands fa-css3-alt', 'CSS3', 'css desain gaya'],
    ['fa-brands fa-js', 'JavaScript', 'javascript js'],
    ['fa-brands fa-java', 'Java', 'java'],
    ['fa-brands fa-php', 'PHP', 'php'],
    ['fa-brands fa-react', 'React', 'react'],
    ['fa-brands fa-node-js', 'Node.js', 'node server'],
    ['fa-brands fa-github', 'GitHub', 'github git'],
    ['fa-brands fa-git-alt', 'Git', 'git versi'],
    ['fa-brands fa-android', 'Android', 'android aplikasi hp'],
    ['fa-solid fa-globe', 'Website', 'website web internet dunia'],
    ['fa-solid fa-earth-asia', 'Dunia', 'dunia bumi world'],
    ['fa-solid fa-mobile-screen-button', 'Ponsel', 'hp ponsel mobile responsif'],
    ['fa-solid fa-desktop', 'Komputer', 'komputer desktop layar'],
    ['fa-solid fa-server', 'Server', 'server backend'],
    ['fa-solid fa-cloud', 'Awan', 'awan cloud'],
    ['fa-solid fa-wifi', 'Internet', 'wifi internet jaringan'],
    ['fa-solid fa-database', 'Database', 'database data penyimpanan'],
    ['fa-solid fa-box', 'Kotak', 'kotak struktur data'],
    ['fa-solid fa-cubes', 'Tumpukan Kubus', 'kubus oop objek'],
    ['fa-solid fa-sitemap', 'Struktur', 'struktur bagan sitemap'],
    ['fa-solid fa-diagram-project', 'Diagram', 'diagram alur proyek'],
    ['fa-solid fa-layer-group', 'Lapisan', 'lapisan layer tahap'],
    ['fa-solid fa-stairs', 'Tangga', 'tangga tahap tingkat'],
    ['fa-solid fa-repeat', 'Ulangi', 'ulang loop rekursi'],
    ['fa-solid fa-bolt', 'Petir', 'petir cepat javascript'],
    ['fa-solid fa-gears', 'Roda Gigi', 'mesin pengaturan gear'],
    ['fa-solid fa-wrench', 'Kunci Inggris', 'perbaiki alat'],
    ['fa-solid fa-microchip', 'Chip', 'chip prosesor elektronik'],
    ['fa-solid fa-robot', 'Robot', 'robot ai mesin'],
    ['fa-solid fa-brain', 'Otak', 'otak ai pikir'],
    ['fa-solid fa-atom', 'Atom', 'atom fisika sains'],
    ['fa-solid fa-flask', 'Labu Sains', 'sains lab percobaan'],
    ['fa-solid fa-chart-line', 'Grafik Garis', 'grafik statistik data'],
    ['fa-solid fa-chart-pie', 'Grafik Pie', 'grafik pie visualisasi'],
    ['fa-solid fa-magnifying-glass', 'Cari', 'cari pencarian'],
    ['fa-solid fa-magnifying-glass-chart', 'Analisis Data', 'analisis data cari grafik'],
    ['fa-solid fa-calculator', 'Kalkulator', 'hitung matematika'],
    ['fa-solid fa-shield-halved', 'Perisai', 'keamanan privasi etika'],
    ['fa-solid fa-lock', 'Gembok', 'kunci keamanan'],
    ['fa-solid fa-scale-balanced', 'Timbangan', 'adil etika bertanggung jawab'],
    ['fa-solid fa-palette', 'Palet Warna', 'warna seni desain'],
    ['fa-solid fa-paintbrush', 'Kuas', 'kuas lukis seni'],
    ['fa-solid fa-pen', 'Pena', 'pena tulis'],
    ['fa-solid fa-image', 'Gambar', 'gambar foto'],
    ['fa-solid fa-camera', 'Kamera', 'kamera foto'],
    ['fa-solid fa-film', 'Film', 'film animasi video'],
    ['fa-solid fa-tv', 'Televisi', 'tv animasi tayangan'],
    ['fa-solid fa-music', 'Musik', 'musik nada'],
    ['fa-solid fa-volume-high', 'Suara', 'suara audio volume'],
    ['fa-solid fa-headphones', 'Headphone', 'headphone audio'],
    ['fa-solid fa-person-running', 'Berlari', 'karakter lari gerak'],
    ['fa-solid fa-gauge-high', 'Kecepatan', 'performa cepat optimasi'],
    ['fa-solid fa-house', 'Rumah', 'rumah desain'],
    ['fa-solid fa-hands', 'Tangan', 'tangan memahat kreatif'],
    ['fa-solid fa-seedling', 'Tunas', 'tunas dasar pemula basic'],
    ['fa-solid fa-compass', 'Kompas', 'kompas jelajah explore'],
    ['fa-solid fa-map', 'Peta', 'peta rute'],
    ['fa-solid fa-route', 'Rute', 'rute jalur'],
    ['fa-solid fa-flag', 'Bendera', 'bendera target'],
    ['fa-solid fa-rocket', 'Roket', 'roket peluncuran proyek'],
    ['fa-solid fa-lightbulb', 'Lampu Ide', 'ide lampu kreatif'],
    ['fa-solid fa-star', 'Bintang', 'bintang favorit poin'],
    ['fa-solid fa-heart', 'Hati', 'hati suka'],
    ['fa-solid fa-fire', 'Api', 'api semangat'],
    ['fa-solid fa-trophy', 'Piala', 'piala juara capstone'],
    ['fa-solid fa-medal', 'Medali', 'medali lencana'],
    ['fa-solid fa-award', 'Penghargaan', 'penghargaan sertifikat'],
    ['fa-solid fa-crown', 'Mahkota', 'mahkota raja'],
    ['fa-solid fa-graduation-cap', 'Toga', 'toga lulus wisuda'],
    ['fa-solid fa-book', 'Buku', 'buku materi'],
    ['fa-solid fa-book-open', 'Buku Terbuka', 'buku baca belajar'],
    ['fa-solid fa-note-sticky', 'Catatan', 'catatan memo'],
    ['fa-solid fa-floppy-disk', 'Simpan', 'simpan disket file'],
    ['fa-solid fa-folder-open', 'Folder', 'folder berkas'],
    ['fa-solid fa-list-check', 'Daftar Tugas', 'tugas checklist'],
    ['fa-solid fa-clipboard-check', 'Papan Ceklis', 'ceklis tugas selesai'],
    ['fa-solid fa-users', 'Tim', 'tim kelompok kolaborasi'],
    ['fa-solid fa-chalkboard-user', 'Guru', 'guru mengajar kelas'],
    ['fa-solid fa-shapes', 'Bentuk', 'bentuk geometri'],
    ['fa-solid fa-infinity', 'Tak Hingga', 'tak hingga loop'],
    ['fa-solid fa-cat', 'Kucing', 'kucing hewan'],
    ['fa-solid fa-dragon', 'Naga', 'naga fantasi'],
  ];
  let ikonForm = null;
  function syncIkon(f) {
    const box = f.querySelector('[data-ikon-picker]'); if (!box) return;
    const v = (f.ikon.value || '').trim();
    const found = IKON_LIST.find((i) => i[0] === v);
    box.querySelector('[data-ikon-preview]').className = v || IKON_DEFAULT;
    box.querySelector('[data-ikon-label]').textContent = v ? (found ? found[1] : v) : 'Bawaan (kubus)';
  }
  function renderIkon(q = '') {
    const s = q.trim().toLowerCase(), cur = ikonForm ? ikonForm.ikon.value.trim() : '';
    const list = IKON_LIST.filter((i) => !s || (i[1] + ' ' + i[2]).toLowerCase().includes(s));
    $('#ikonGrid').innerHTML = list.map((i) => `<button type="button" data-ikon-pick="${esc(i[0])}" title="${esc(i[1])}" class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl border text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 ${i[0] === cur ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'border-slate-200 dark:border-slate-700'}"><i class="${esc(i[0])} text-lg"></i><span class="text-[10px] leading-tight w-full truncate text-center">${esc(i[1])}</span></button>`).join('')
      || '<div class="col-span-full text-center text-xs text-slate-500 py-6">Ikon tidak ditemukan. Coba kata lain, atau ketik kode di bawah.</div>';
  }
  function openIkon(f) {
    ikonForm = f; $('#ikonSearch').value = ''; $('#ikonManual').value = '';
    renderIkon(); toggleModal('modalIkon'); setTimeout(() => $('#ikonSearch').focus(), 50);
  }
  function pickIkon(cls) {
    if (!ikonForm) return;
    ikonForm.ikon.value = cls; syncIkon(ikonForm); toggleModal('modalIkon');
  }
  $('#ikonSearch').addEventListener('input', (e) => renderIkon(e.target.value));
  const pakaiManual = () => {
    const v = $('#ikonManual').value.trim();
    if (!/^[a-z0-9 -]+$/i.test(v)) return showToast('Kode ikon tidak valid. Contoh: fa-solid fa-dragon');
    pickIkon(v);
  };
  $('#ikonManualBtn').addEventListener('click', pakaiManual);
  $('#ikonManual').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); pakaiManual(); } });

  // ---------- JALUR: CREATE / UPDATE / DELETE ----------
  // Pilihan Tahap di form jalur diambil dari daftar tahap menurut jenjang yang dipilih
  function fillTahapSelect(selected) {
    const f = $('#jalurForm'), jn = f.jenjang.value;
    const nos = new Set(tahapList.filter((t) => t.jenjang === jn).map((t) => t.no));
    if (selected) nos.add(Number(selected));
    const arr = [...nos].sort((a, b) => a - b);
    f.tahap.innerHTML = arr.length
      ? arr.map((n) => { const t = tahapInfo(jn, n); return `<option value="${n}">${n}${t ? ' · ' + esc(t.nama) : ''}</option>`; }).join('')
      : '<option value="">Belum ada tahap (buat di Kelola Tahap)</option>';
    if (selected) f.tahap.value = String(selected);
  }
  $('#jalurForm').jenjang.addEventListener('change', () => fillTahapSelect());

  function openJalur(id) {
    const f = $('#jalurForm'); f.reset();
    f.ikon.value = ''; // input hidden tidak ikut reset
    const j = jalur.find((x) => x.id === id);
    f.jid.value = j ? j.id : '';
    if (j) {
      ['nama', 'jenjang', 'lencana', 'warna', 'meta', 'ringkas', 'proyek', 'durasi', 'ikon', 'lab'].forEach((k) => (f[k].value = j[k] ?? ''));
      f.tags.value = (j.tags || []).join(', ');
      f.capstone.checked = !!j.capstone;
    }
    fillTahapSelect(j ? tahapOf(j) : null);
    syncIkon(f);
    $('#jalurModalTitle').lastChild.textContent = j ? ' Edit Jalur Belajar' : ' Tambah Jalur Belajar';
    toggleModal('modalJalur');
  }

  $('#jalurForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.tahap.value) return showToast('Buat tahap dulu di menu Konfigurasi > Kelola Tahap.');
    const ikon = f.ikon.value.trim();
    const data = {
      jenjang: f.jenjang.value, tahap: Number(f.tahap.value), nama: f.nama.value.trim(), warna: f.warna.value,
      lencana: f.lencana.value.trim(), meta: f.meta.value.trim(), ringkas: f.ringkas.value.trim(), proyek: f.proyek.value.trim(),
      lab: Math.max(0, Number(f.lab.value) || 0), durasi: f.durasi.value.trim(),
      ikon: /^[a-z0-9 -]+$/i.test(ikon) ? ikon : IKON_DEFAULT,
      tags: f.tags.value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6),
      capstone: f.capstone.checked,
    };
    if (!data.nama) return;
    const existing = jalur.find((x) => x.id === f.jid.value);
    if (existing) Object.assign(existing, data);
    else {
      let id = slugify(data.jenjang + ' ' + data.nama), n = 2;
      const base = id;
      while (jalur.some((x) => x.id === id)) id = base + '-' + n++;
      jalur.push({ id, siswa: null, materi: [], ...data });
    }
    if (!(await api.saveAll(jalur))) return;
    toggleModal('modalJalur'); render();
    showToast(existing ? 'Jalur belajar diperbarui.' : 'Jalur belajar baru ditambahkan.');
  });


  // ---------- TAHAP: CREATE / UPDATE / DELETE (Konfigurasi > Kelola Tahap) ----------
  function renderTahap() {
    const box = $('#tahapList'); if (!box) return;
    box.innerHTML = Object.entries(JENJANG).sort((a, b) => a[1].urut - b[1].urut).map(([jn, jm]) => {
      const rows = tahapList.filter((t) => t.jenjang === jn).sort((a, b) => a.no - b.no);
      const items = rows.map((t) => {
        const c = hex(t.warna);
        const n = jalur.filter((j) => j.jenjang === jn && tahapOf(j) === t.no).length;
        return `<div class="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 shadow-card">
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:${c}1f;color:${c}"><i class="${esc(t.ikon || IKON_DEFAULT)}"></i></span>
            <div class="min-w-0">
              <div class="text-[11px] font-mono font-bold uppercase tracking-wider" style="color:${c}">Tahap ${t.no}</div>
              <div class="text-sm font-bold text-slate-900 dark:text-white truncate">${esc(t.nama)}</div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400">${n} jalur${t.meta ? ' • ' + esc(t.meta) : ''}</div>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button data-tedit="${esc(tahapKey(t))}" title="Edit" class="p-2 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-pen"></i></button>
            <button data-tdel="${esc(tahapKey(t))}" title="Hapus" class="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>`;
      }).join('');
      return `<section class="space-y-3">
        <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:${jm.dot}"></span>
          <h2 class="text-sm font-bold text-slate-900 dark:text-white">${esc(jm.label)}</h2>
          <span class="text-xs font-mono text-slate-400">${rows.length} tahap</span></div>
        ${items ? `<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">${items}</div>` : '<div class="text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-4">Belum ada tahap untuk jenjang ini.</div>'}
      </section>`;
    }).join('');
  }

  function openTahap(key) {
    const f = $('#tahapForm'); f.reset();
    f.ikon.value = ''; // input hidden tidak ikut reset
    const t = key ? tahapList.find((x) => tahapKey(x) === key) : null;
    f.tid.value = t ? key : '';
    f.jenjang.disabled = !!t; // jenjang tidak diubah saat edit
    if (t) {
      f.jenjang.value = t.jenjang; f.no.value = t.no; f.nama.value = t.nama;
      f.ikon.value = t.ikon || ''; f.warna.value = hex(t.warna); f.meta.value = t.meta || '';
    } else {
      f.no.value = nextTahapNo(f.jenjang.value);
      f.warna.value = TAHAP_WARNA[f.no.value];
    }
    syncIkon(f);
    $('#tahapModalTitle').lastChild.textContent = t ? ' Edit Tahap' : ' Tambah Tahap';
    toggleModal('modalTahap');
  }
  $('#tahapForm').jenjang.addEventListener('change', (e) => {
    const f = $('#tahapForm');
    if (!f.tid.value) { f.no.value = nextTahapNo(e.target.value); f.warna.value = TAHAP_WARNA[f.no.value]; }
  });

  $('#tahapForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const ikon = f.ikon.value.trim();
    const oldKey = f.tid.value;
    const jenjang = oldKey ? oldKey.split('|')[0] : f.jenjang.value;
    const t = {
      jenjang, no: Math.min(99, Math.max(1, Math.round(Number(f.no.value)) || 1)), nama: f.nama.value.trim(),
      ikon: /^[a-z0-9 -]+$/i.test(ikon) ? ikon : IKON_DEFAULT, warna: hex(f.warna.value), meta: f.meta.value.trim(),
    };
    if (!t.nama) return;
    const newKey = tahapKey(t);
    if (newKey !== oldKey && tahapList.some((x) => tahapKey(x) === newKey)) return showToast(`Tahap ${t.no} untuk jenjang itu sudah ada.`);
    const previousJalur = structuredClone(jalur);
    let nextTahapList;
    if (oldKey) {
      const old = tahapList.find((x) => tahapKey(x) === oldKey);
      if (old && old.no !== t.no) { // nomor berubah: jalur yang memakai tahap ini ikut pindah
        jalur.forEach((j) => { if (j.jenjang === jenjang && tahapOf(j) === old.no) j.tahap = t.no; });
      }
      nextTahapList = tahapList.map((x) => (tahapKey(x) === oldKey ? t : x));
    } else {
      nextTahapList = [...tahapList, t];
    }
    // Simpan tahap dan jalur sekaligus agar nomor tahap yang berubah tidak
    // sempat divalidasi terhadap daftar tahap lama.
    if (!(await api.saveDocument(jalur, nextTahapList))) {
      jalur = previousJalur;
      render();
      return;
    }
    tahapList = nextTahapList;
    toggleModal('modalTahap'); render();
    showToast(oldKey ? 'Tahap diperbarui.' : 'Tahap baru ditambahkan.');
  });

  async function removeTahap(key) {
    const t = tahapList.find((x) => tahapKey(x) === key); if (!t) return;
    const n = jalur.filter((j) => j.jenjang === t.jenjang && tahapOf(j) === t.no).length;
    if (n) return showToast(`Tahap ${t.no} masih dipakai ${n} jalur. Pindahkan atau hapus jalurnya dulu.`);
    if (!confirm(`Hapus Tahap ${t.no} "${t.nama}"?`)) return;
    tahapList = tahapList.filter((x) => tahapKey(x) !== key);
    if (!(await api.saveTahap(tahapList))) return;
    render();
    showToast('Tahap dihapus.');
  }

  async function removeJalur(id) {
    const j = jalur.find((x) => x.id === id);
    if (!j || !confirm(`Hapus jalur "${j.nama}"? Materi di dalamnya ikut terhapus.`)) return;
    jalur = jalur.filter((x) => x.id !== id);
    if (!(await api.saveAll(jalur))) return;
    render();
    showToast('Jalur belajar dihapus.');
  }

  // ---------- MATERI (di dalam jalur) ----------
  function fillMateriSelect() {
    const sel = $('#courseForm select');
    if (!sel) return;
    const cur = sel.value;
    sel.previousElementSibling.textContent = 'Jalur Belajar';
    sel.innerHTML = jalur.map((j) => `<option value="${esc(j.id)}">${esc(j.nama)} (${esc(j.jenjang === 'SMK' ? 'SMA/SMK' : j.jenjang)} · Tahap ${tahapOf(j)})</option>`).join('') || '<option value="">Buat jalur dulu</option>';
    if (cur && jalur.some((j) => j.id === cur)) sel.value = cur;
  }

  const jenjangLabel = (j) => (j.jenjang === 'SMK' ? 'SMA/SMK' : j.jenjang);

  // Tambah materi baru / edit materi yang sudah ada (editor WYSIWYG: static/editor.js)
  function openMateri(preselect, materiId) {
    if (!jalur.length) return showToast('Buat jalur belajar dulu.');
    const first = jalur.find((x) => x.id === preselect) || jalur[0];
    const cur = materiId ? first.materi.find((m) => m.id === materiId) : null;
    DCEditor.open({
      jalur: first.id,
      data: cur || null,
      jalurOptions: jalur.map((j) => ({ value: j.id, label: `${j.nama} (${jenjangLabel(j)} · Tahap ${tahapOf(j)})` })),
      onSave: async (d) => {
        const target = jalur.find((x) => x.id === d.jalur);
        if (!target) return;
        const rec = { judul: d.judul, tipe: d.tipe, badge: d.badge, subjudul: d.subjudul, html: d.html };
        if (cur) {
          first.materi = first.materi.filter((m) => m.id !== cur.id);
          target.materi.push(Object.assign(cur, rec));
        } else target.materi.push({ id: Date.now().toString(36), durasi: '', tes: false, ...rec });
        if (!(await api.saveAll(jalur))) return;
        render();
        if (typeof renderPreview === 'function' && !$('#modalPreview').classList.contains('hidden')) renderPreview();
        showToast(cur ? 'Materi diperbarui.' : 'Materi ditambahkan ke ' + target.nama + '.');
      },
    });
  }

  // ---------- EXPORT ----------
  function exportKurikulum() {
    const blob = new Blob([JSON.stringify({ tahap: tahapList, jalur }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kurikulum-dieng-cyber.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('Kurikulum diexport ke JSON.');
  }

  // ---------- VIEW SWITCH ----------
  const ON = ['text-sky-700', 'dark:text-sky-300', 'bg-sky-50', 'dark:bg-sky-500/10', 'font-semibold', 'border', 'border-sky-200/80', 'dark:border-sky-500/20'];
  const OFF = ['text-slate-600', 'dark:text-slate-400', 'font-medium'];
  function showView(name) {
    $('#view-dashboard').classList.toggle('hidden', name !== 'dashboard');
    $('#view-kurikulum').classList.toggle('hidden', name !== 'kurikulum');
    $('#view-tahap').classList.toggle('hidden', name !== 'tahap');
    document.querySelectorAll('[data-view]').forEach((a) => {
      const active = a.dataset.view === name;
      a.classList.remove(...(active ? OFF : ON)); a.classList.add(...(active ? ON : OFF));
    });
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    if (window.innerWidth < 768) $('#sidebar').classList.add('hidden');
  }

  document.addEventListener('click', async (e) => {
    const v = e.target.closest('[data-view]'); if (v) { e.preventDefault(); return showView(v.dataset.view); }
    const io = e.target.closest('[data-ikon-open]'); if (io) return openIkon(io.closest('form'));
    const ip = e.target.closest('[data-ikon-pick]'); if (ip) return pickIkon(ip.dataset.ikonPick);
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'new-jalur') return openJalur();
      if (act === 'new-tahap') return openTahap();
      if (act === 'export') return exportKurikulum();
      if (act === 'new-materi') {
        const inPreview = !$('#modalPreview').classList.contains('hidden');
        if (inPreview) toggleModal('modalPreview');
        return openMateri(inPreview ? previewId : '');
      }
    }
    const pv = e.target.closest('[data-prev]'); if (pv) return openPreview(pv.dataset.prev);
    const te = e.target.closest('[data-tedit]'); if (te) return openTahap(te.dataset.tedit);
    const td = e.target.closest('[data-tdel]'); if (td) return removeTahap(td.dataset.tdel);
    const ed = e.target.closest('[data-edit]'); if (ed) return openJalur(ed.dataset.edit);
    const dl = e.target.closest('[data-del]'); if (dl) return removeJalur(dl.dataset.del);
    const em = e.target.closest('[data-emat]');
    if (em) { const [jid, mid] = em.dataset.emat.split('|'); return openMateri(jid, mid); }
    const dm = e.target.closest('[data-delmat]');
    if (dm) {
      const [jid, mid] = dm.dataset.delmat.split('|');
      const j = jalur.find((x) => x.id === jid);
      if (j && confirm('Hapus materi ini?')) {
        j.materi = j.materi.filter((m) => m.id !== mid);
        if (!(await api.saveAll(jalur))) return;
        render();
        showToast('Materi dihapus.');
      }
      return;
    }
    const fl = e.target.closest('[data-filter]'); if (fl) { filter = fl.dataset.filter; render(); }
  });

  $('#kurSearch').addEventListener('input', (e) => { query = e.target.value; render(); });
  $('#kurSort').addEventListener('change', (e) => { sortBy = e.target.value; render(); });

  // ---------- INIT ----------
  Promise.all([api.list(), api.listTahap()]).then(([list, tl]) => {
    jalur = list; tahapList = tl; render();
    const h = location.hash.slice(1);
    showView(['kurikulum', 'tahap'].includes(h) ? h : 'dashboard');
  });
})();
