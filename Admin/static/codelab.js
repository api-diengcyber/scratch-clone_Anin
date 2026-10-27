/* Code Lab & Blockly: daftar tantangan + form tantangan baru.
   Data disimpan di localStorage ('dc-codelab'). Belum ada backend.
   Soal Blockly (SD) dinilai lewat tujuan; soal kode (SMP, SMA/SMK) dinilai lewat kasus uji. */
(function () {
  const KEY = 'dc-codelab';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const JENJANG = { SD: 'SD', SMP: 'SMP', SMA: 'SMA/SMK' };
  const BLOK = ['Maju', 'Belok kiri', 'Belok kanan', 'Ulangi', 'Jika'];
  const TUJUAN = ['Sampai ke bintang', 'Kumpulkan semua koin', 'Gambar sebuah bentuk'];
  const TAG = {
    'Blockly':    'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    'HTML/CSS':   'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    'Python':     'bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
    'JavaScript': 'bg-violet-50 text-violet-700 border-violet-200/80 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
  };

  const blockly = (id, judul, instruksi, tujuan, blok, batas, status, selesai) =>
    ({ id, judul, jenis: 'blockly', bahasa: 'Blockly', jenjang: 'SD', instruksi, tujuan, blok, batas, status, selesai });
  const kode = (id, judul, bahasa, jenjang, instruksi, kodeAwal, tes, syarat, status, selesai) =>
    ({ id, judul, jenis: 'kode', bahasa, jenjang, instruksi, kodeAwal, tes, syarat, status, selesai });

  const SEED = [
    blockly('s1', 'Robot menuju bintang', 'Bantu robot berjalan ke bintang. Susun blok perintah supaya robot sampai.', 'Sampai ke bintang', ['Maju', 'Belok kiri', 'Belok kanan', 'Ulangi'], 6, 'Terbit', 42),
    blockly('s2', 'Logika percabangan IF-ELSE', 'Robot harus memilih jalan. Pakai blok Jika supaya robot tidak menabrak dinding.', 'Kumpulkan semua koin', ['Maju', 'Belok kiri', 'Belok kanan', 'Jika'], 8, 'Terbit', 31),
    kode('s3', 'Membuat kartu profil dengan HTML', 'HTML/CSS', 'SMP', 'Buat kartu profil berisi foto, nama, dan satu paragraf tentang dirimu.', '<!-- tulis HTML kamu di sini -->', [], 'Ada elemen <img>\nAda elemen <h2> berisi nama\nAda minimal satu <p>', 'Terbit', 27),
    kode('s4', 'Menata tombol dengan Flexbox', 'HTML/CSS', 'SMP', 'Susun tiga tombol sejajar dan rata tengah memakai Flexbox.', '', [], 'Container memakai display: flex\nTombol berjumlah tiga', 'Draf', 0),
    kode('s5', 'Hitung luas persegi', 'Python', 'SMA', 'Tulis fungsi luas_persegi(sisi) yang mengembalikan luas persegi.', 'def luas_persegi(sisi):\n    # tulis jawabanmu di sini\n    pass', [{ i: '2', o: '4' }, { i: '3', o: '9' }, { i: '5', o: '25' }], '', 'Terbit', 18),
    kode('s6', 'Cek bilangan prima', 'JavaScript', 'SMA', 'Tulis fungsi isPrima(n) yang mengembalikan true jika n bilangan prima.', 'function isPrima(n) {\n  // tulis jawabanmu di sini\n}', [{ i: '2', o: 'true' }, { i: '9', o: 'false' }, { i: '13', o: 'true' }], '', 'Terbit', 9),
  ];

  let data = load();
  let filter = 'all';
  let q = '';
  let editId = null;

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(raw)) return raw;
    } catch (e) {}
    return JSON.parse(JSON.stringify(SEED));
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  // ---------- DAFTAR ----------
  function renderFilter() {
    const count = (k) => (k === 'all' ? data.length : data.filter((d) => d.jenjang === k).length);
    const items = [['all', 'Semua Jenjang'], ['SD', 'SD'], ['SMP', 'SMP'], ['SMA', 'SMA/SMK']];
    // gaya disamakan dengan filter di halaman Kurikulum; bobot font dan lebar (w-36) sama supaya semua tombol seragam dan tidak bergeser saat dipilih
    const base = 'shrink-0 w-36 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center justify-center gap-2 transition ';
    const on = base + 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-600/25';
    const off = base + 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60';
    const badge = 'min-w-[1.25rem] px-1.5 py-0.5 rounded-md text-[10px] leading-none font-mono font-bold text-center ';
    $('#clFilter').innerHTML = items.map(([k, label]) => {
      const active = filter === k;
      return '<button type="button" data-cl-filter="' + k + '" class="' + (active ? on : off) + '">' + esc(label) +
        '<span class="' + badge + (active ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400') + '">' + count(k) + '</span></button>';
    }).join('');
  }

  function renderList() {
    const rows = data.filter((d) => (filter === 'all' || d.jenjang === filter) && (!q || d.judul.toLowerCase().includes(q)));
    $('#clCount').textContent = data.length + ' Tantangan';
    renderFilter();
    if (!rows.length) {
      $('#clList').innerHTML = '<div class="px-6 py-14 text-center">' +
        '<i class="fa-solid fa-laptop-code text-3xl text-slate-300 dark:text-slate-600"></i>' +
        '<p class="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-3">' + (data.length ? 'Tidak ada tantangan yang cocok' : 'Mulai tantangan pertamamu') + '</p>' +
        '<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">' + (data.length ? 'Ubah filter jenjang atau kata pencarian.' : 'Buat soal Blockly untuk SD atau soal kode untuk SMP dan SMA/SMK.') + '</p>' +
        (data.length ? '' : '<button type="button" data-cl="new" class="mt-4 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold">Tantangan Baru</button>') +
        '</div>';
      return;
    }
    $('#clList').innerHTML = rows.map((d) => {
      const terbit = d.status === 'Terbit';
      return '<div class="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">' +
        '<div class="flex-1 min-w-0">' +
          '<p class="text-sm font-bold text-slate-900 dark:text-white truncate">' + esc(d.judul) + '</p>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Jenjang ' + esc(JENJANG[d.jenjang]) + ' · ' + d.selesai + ' siswa selesai</p>' +
        '</div>' +
        '<span class="hidden sm:inline-flex px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border ' + (TAG[d.bahasa] || TAG.Python) + '">' + esc(d.bahasa) + '</span>' +
        '<button type="button" data-cl="status" data-id="' + esc(d.id) + '" title="Klik untuk ' + (terbit ? 'jadikan draf' : 'terbitkan') + '" class="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border transition ' +
          (terbit ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                  : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20') + '">' + esc(d.status) + '</button>' +
        '<button type="button" data-cl="edit" data-id="' + esc(d.id) + '" aria-label="Ubah ' + esc(d.judul) + '" class="w-8 h-8 rounded-lg text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"><i class="fa-regular fa-pen-to-square text-xs"></i></button>' +
        '<button type="button" data-cl="del" data-id="' + esc(d.id) + '" aria-label="Hapus ' + esc(d.judul) + '" class="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"><i class="fa-regular fa-trash-can text-xs"></i></button>' +
      '</div>';
    }).join('');
  }

  // ---------- FORM ----------
  const INP = 'w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-xs';
  const LBL = 'block font-mono font-semibold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider';
  const opt = (v, label, sel) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>';

  function buildModal() {
    if ($('#modalCodelab')) return;
    const m = document.createElement('div');
    m.id = 'modalCodelab';
    m.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4';
    m.innerHTML =
      '<div role="dialog" aria-modal="true" aria-labelledby="clTitle" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-2xl">' +
        '<div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">' +
          '<h3 id="clTitle" class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"><i class="fa-solid fa-laptop-code text-sky-600 dark:text-sky-400"></i><span id="clTitleText">Tantangan Baru</span></h3>' +
          '<button type="button" data-cl="close" aria-label="Tutup" class="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"><i class="fa-solid fa-xmark text-lg"></i></button>' +
        '</div>' +
        '<form id="clForm" class="space-y-4 pt-4 text-xs" novalidate>' +
          '<div><label class="' + LBL + '" for="clJenis">Jenis soal</label>' +
            '<select id="clJenis" class="' + INP + '">' + opt('blockly', 'Blockly (untuk SD)', true) + opt('kode', 'Kode (untuk SMP dan SMA/SMK)') + '</select></div>' +
          '<div><label class="' + LBL + '" for="clJudul">Judul</label>' +
            '<input id="clJudul" type="text" placeholder="Contoh: Robot menuju bintang" class="' + INP + '"></div>' +
          '<div class="grid grid-cols-2 gap-3">' +
            '<div><label class="' + LBL + '" for="clJenjang">Jenjang</label><select id="clJenjang" class="' + INP + '"></select></div>' +
            '<div id="clBahasaWrap"><label class="' + LBL + '" for="clBahasa">Bahasa</label><select id="clBahasa" class="' + INP + '">' + opt('Python', 'Python') + opt('JavaScript', 'JavaScript') + opt('HTML/CSS', 'HTML/CSS') + '</select></div>' +
          '</div>' +
          '<div><label class="' + LBL + '" for="clInstruksi">Instruksi untuk siswa</label>' +
            '<textarea id="clInstruksi" rows="3" class="' + INP + '"></textarea></div>' +

          '<div id="clSecBlockly" class="space-y-4">' +
            '<div><label class="' + LBL + '" for="clTujuan">Tujuan yang harus dicapai</label><select id="clTujuan" class="' + INP + '">' + TUJUAN.map((t) => opt(t, t)).join('') + '</select></div>' +
            '<div><span class="' + LBL + '">Blok yang boleh dipakai</span><div id="clBlok" class="flex flex-wrap gap-2">' +
              BLOK.map((b) => '<label class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"><input type="checkbox" value="' + esc(b) + '" class="accent-sky-600"> ' + esc(b) + '</label>').join('') +
            '</div></div>' +
            '<div><label class="' + LBL + '" for="clBatas">Batas jumlah blok (untuk bintang 3)</label><input id="clBatas" type="number" min="1" max="50" value="6" class="' + INP + ' !w-28"></div>' +
          '</div>' +

          '<div id="clSecKode" class="space-y-4">' +
            '<div><label class="' + LBL + '" for="clKodeAwal">Kode awal untuk siswa</label>' +
              '<textarea id="clKodeAwal" rows="4" spellcheck="false" class="' + INP + ' font-mono"></textarea></div>' +
            '<div id="clSecTes"><span class="' + LBL + '">Kasus uji</span>' +
              '<p class="text-[11px] text-slate-500 dark:text-slate-400 mb-2">Masukan dan hasil yang benar. Beberapa masukan dipisah koma.</p>' +
              '<div id="clTes" class="space-y-2"></div>' +
              '<button type="button" data-cl="addtes" class="mt-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold"><i class="fa-solid fa-plus mr-1"></i>Tambah kasus uji</button></div>' +
            '<div id="clSecSyarat"><label class="' + LBL + '" for="clSyarat">Syarat lolos (satu per baris)</label>' +
              '<textarea id="clSyarat" rows="3" placeholder="Contoh: Ada elemen &lt;h1&gt;" class="' + INP + '"></textarea></div>' +
          '</div>' +

          '<p id="clErr" role="alert" class="hidden text-rose-600 dark:text-rose-400 font-medium"></p>' +
          '<div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">' +
            '<button type="button" data-cl="close" class="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition font-medium">Batal</button>' +
            '<button type="submit" data-status="Draf" class="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 font-semibold">Simpan sebagai draf</button>' +
            '<button type="submit" data-status="Terbit" class="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-md shadow-sky-600/20 transition">Terbitkan</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(m);

    $('#clJenis').addEventListener('change', syncForm);
    $('#clBahasa').addEventListener('change', syncForm);
    m.addEventListener('mousedown', (e) => { if (e.target === m) closeModal(); });

    let clicked = 'Draf';
    $('#clForm').addEventListener('click', (e) => {
      const b = e.target.closest('button[type="submit"]'); if (b) clicked = b.dataset.status;
    });
    $('#clForm').addEventListener('submit', (e) => { e.preventDefault(); submitForm(clicked); });
  }

  function addTesRow(i, o) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';
    row.innerHTML =
      '<input type="text" data-tes="i" placeholder="Masukan, contoh: 2" value="' + esc(i) + '" class="' + INP + ' font-mono">' +
      '<span class="text-slate-400"><i class="fa-solid fa-arrow-right text-[10px]"></i></span>' +
      '<input type="text" data-tes="o" placeholder="Hasil, contoh: 4" value="' + esc(o) + '" class="' + INP + ' font-mono">' +
      '<button type="button" data-cl="rmtes" aria-label="Hapus kasus uji" class="w-8 h-8 shrink-0 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800"><i class="fa-regular fa-trash-can text-xs"></i></button>';
    $('#clTes').appendChild(row);
  }

  // tampilkan bagian form sesuai jenis soal dan bahasa
  function syncForm() {
    const isB = $('#clJenis').value === 'blockly';
    const bahasa = $('#clBahasa').value;
    const jj = $('#clJenjang');
    const prev = jj.value;
    jj.innerHTML = isB ? opt('SD', 'SD', true) : opt('SMP', 'SMP') + opt('SMA', 'SMA/SMK');
    if (!isB && (prev === 'SMP' || prev === 'SMA')) jj.value = prev;
    jj.disabled = isB;
    $('#clBahasaWrap').classList.toggle('hidden', isB);
    $('#clSecBlockly').classList.toggle('hidden', !isB);
    $('#clSecKode').classList.toggle('hidden', isB);
    const html = bahasa === 'HTML/CSS';
    $('#clSecTes').classList.toggle('hidden', html);
    $('#clSecSyarat').classList.toggle('hidden', !html);
    if (!isB && !html && !$('#clTes').children.length) addTesRow('', '');
  }

  function openModal(id) {
    buildModal();
    editId = id || null;
    const d = id ? data.find((x) => x.id === id) : null;
    $('#clTitleText').textContent = d ? 'Ubah Tantangan' : 'Tantangan Baru';
    $('#clErr').classList.add('hidden');
    $('#clJenis').value = d ? d.jenis : 'blockly';
    $('#clBahasa').value = d && d.jenis === 'kode' ? d.bahasa : 'Python';
    $('#clJudul').value = d ? d.judul : '';
    $('#clInstruksi').value = d ? d.instruksi : '';
    $('#clTujuan').value = d && d.jenis === 'blockly' ? d.tujuan : TUJUAN[0];
    document.querySelectorAll('#clBlok input').forEach((c) => {
      c.checked = d && d.jenis === 'blockly' ? d.blok.includes(c.value) : ['Maju', 'Belok kiri', 'Belok kanan', 'Ulangi'].includes(c.value);
    });
    $('#clBatas').value = d && d.jenis === 'blockly' ? d.batas : 6;
    $('#clKodeAwal').value = d && d.jenis === 'kode' ? d.kodeAwal : '';
    $('#clSyarat').value = d && d.jenis === 'kode' ? d.syarat : '';
    $('#clTes').innerHTML = '';
    if (d && d.jenis === 'kode') (d.tes || []).forEach((t) => addTesRow(t.i, t.o));
    syncForm();
    if (d && d.jenis === 'kode') $('#clJenjang').value = d.jenjang;
    $('#modalCodelab').classList.remove('hidden');
    setTimeout(() => $('#clJudul').focus(), 0);
  }

  function closeModal() {
    const m = $('#modalCodelab'); if (m) m.classList.add('hidden');
    editId = null;
  }

  function fail(msg) {
    const e = $('#clErr'); e.textContent = msg; e.classList.remove('hidden');
  }

  function submitForm(status) {
    const isB = $('#clJenis').value === 'blockly';
    const judul = $('#clJudul').value.trim();
    const instruksi = $('#clInstruksi').value.trim();
    if (!judul) return fail('Isi judul tantangan dulu.');
    if (!instruksi) return fail('Isi instruksi untuk siswa dulu.');

    const old = editId ? data.find((x) => x.id === editId) : null;
    const base = { id: old ? old.id : 'c' + Date.now(), judul, instruksi, status, selesai: old ? old.selesai : 0 };
    let item;

    if (isB) {
      const blok = [...document.querySelectorAll('#clBlok input:checked')].map((c) => c.value);
      const batas = parseInt($('#clBatas').value, 10);
      if (!blok.length) return fail('Pilih minimal satu blok yang boleh dipakai.');
      if (!(batas >= 1)) return fail('Batas jumlah blok minimal 1.');
      item = { ...base, jenis: 'blockly', bahasa: 'Blockly', jenjang: 'SD', tujuan: $('#clTujuan').value, blok, batas };
    } else {
      const bahasa = $('#clBahasa').value;
      let tes = [], syarat = '';
      if (bahasa === 'HTML/CSS') {
        syarat = $('#clSyarat').value.split('\n').map((s) => s.trim()).filter(Boolean).join('\n');
        if (!syarat) return fail('Isi minimal satu syarat lolos.');
      } else {
        const rows = [...document.querySelectorAll('#clTes > div')].map((r) => ({
          i: r.querySelector('[data-tes="i"]').value.trim(),
          o: r.querySelector('[data-tes="o"]').value.trim(),
        }));
        tes = rows.filter((r) => r.i || r.o);
        if (!tes.length) return fail('Isi minimal satu kasus uji.');
        if (tes.some((r) => !r.i || !r.o)) return fail('Setiap kasus uji perlu masukan dan hasil yang benar.');
      }
      item = { ...base, jenis: 'kode', bahasa, jenjang: $('#clJenjang').value, kodeAwal: $('#clKodeAwal').value, tes, syarat };
    }

    if (old) data[data.indexOf(old)] = item; else data.unshift(item);
    save(); renderList(); closeModal();
    showToast(status === 'Terbit' ? 'Tantangan "' + judul + '" diterbitkan' : 'Tantangan "' + judul + '" disimpan sebagai draf');
  }

  // ---------- AKSI ----------
  document.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-cl-filter]');
    if (f) { filter = f.dataset.clFilter; return renderList(); }

    const a = e.target.closest('[data-cl]'); if (!a) return;
    const id = a.dataset.id;
    switch (a.dataset.cl) {
      case 'new': return openModal();
      case 'edit': return openModal(id);
      case 'close': return closeModal();
      case 'addtes': return addTesRow('', '');
      case 'rmtes': return a.closest('div').remove();
      case 'status': {
        const d = data.find((x) => x.id === id); if (!d) return;
        d.status = d.status === 'Terbit' ? 'Draf' : 'Terbit';
        save(); renderList();
        return showToast(d.status === 'Terbit' ? 'Tantangan diterbitkan' : 'Tantangan dijadikan draf');
      }
      case 'del': {
        const d = data.find((x) => x.id === id); if (!d) return;
        const ok = await dcConfirm({
          title: 'Hapus tantangan?', message: '"' + d.judul + '" akan dihapus dari daftar.',
          detail: d.selesai ? d.selesai + ' siswa sudah menyelesaikan tantangan ini.' : '',
          confirmText: 'Hapus', cancelText: 'Batal', tone: 'danger',
        });
        if (!ok) return;
        data = data.filter((x) => x.id !== id);
        save(); renderList();
        return showToast('Tantangan dihapus');
      }
      case 'reset': {
        const ok = await dcConfirm({
          title: 'Kembalikan data contoh?', message: 'Semua perubahan di daftar tantangan akan diganti dengan data contoh.',
          confirmText: 'Kembalikan', cancelText: 'Batal', tone: 'warning',
        });
        if (!ok) return;
        data = JSON.parse(JSON.stringify(SEED));
        save(); renderList();
        return showToast('Data contoh dikembalikan');
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    const m = $('#modalCodelab');
    if (e.key === 'Escape' && m && !m.classList.contains('hidden')) closeModal();
  });

  const search = $('#clSearch');
  if (search) search.addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); renderList(); });

  renderList();
})();
