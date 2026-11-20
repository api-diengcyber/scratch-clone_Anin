/*
 * Detail Pengumpulan & Feedback/Revisi Tugas (Tugas Tambahan).
 * Dibuka dari tombol "Detail" di modal Jawaban siswa (instruktur.js). Penilaian cepat per baris tetap ada.
 *
 * Status penilaian (key): menunggu | sedang_dinilai | revisi | selesai
 *   Status lama tetap dikenali: "dikumpulkan" -> menunggu, "dinilai" -> selesai.
 *
 * Kontrak backend yang diharapkan (tambahan dari yang sudah ada):
 *   PATCH /api/instruktur/tugas/:id/submissions/:sid  { nilai?, feedback, status }  -> { item }
 *     status "revisi" -> siswa diminta mengumpulkan ulang (server mengembalikan ke "menunggu" saat siswa kumpul ulang)
 *   Item submission boleh membawa:
 *     attempt        : nomor pengumpulan saat ini (1, 2, ...)
 *     riwayat        : [{ tipe: "pengumpulan"|"feedback", at, teks, nilai?, status?, ke? }]  (urut waktu)
 *     feedbackReadAt : ISO tanggal dibaca siswa, atau null kalau belum. Kalau key ini tidak ada, status baca tidak ditampilkan sebagai fakta.
 *   Tanpa "riwayat", riwayat disusun dari data yang ada (submittedAt/text dan gradedAt/feedback/nilai); tidak ada yang dikarang.
 */
(function () {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TONE = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-300/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
    warn: 'bg-amber-50 text-amber-800 border-amber-300/70 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
    bad: 'bg-rose-50 text-rose-700 border-rose-300/70 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
    proc: 'bg-indigo-50 text-indigo-700 border-indigo-200/70 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30'
  };
  const META = { menunggu: ['Menunggu Penilaian', TONE.warn], sedang_dinilai: ['Sedang Dinilai', TONE.proc], revisi: ['Perlu Revisi', TONE.bad], selesai: ['Selesai', TONE.ok] };
  const hasNilai = (s) => s.nilai != null && s.nilai !== '';
  const keyOf = (s) => (META[s.status] ? s.status : s.status === 'dinilai' ? 'selesai' : s.status === 'dikumpulkan' ? 'menunggu' : hasNilai(s) ? 'selesai' : 'menunggu');
  const pillHtml = (k) => `<span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${META[k][1]}">${esc(META[k][0])}</span>`;
  const fmt = (iso) => { try { return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };
  const INPUT = 'w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40';

  function history(s) {
    if (Array.isArray(s.riwayat) && s.riwayat.length) return s.riwayat.map((x) => ({ ...x }));
    const h = [];
    if (s.submittedAt || s.text) h.push({ tipe: 'pengumpulan', at: s.submittedAt, teks: s.text, ke: s.attempt || 1 });
    if (s.feedback || hasNilai(s)) h.push({ tipe: 'feedback', at: s.gradedAt, teks: s.feedback, nilai: s.nilai, status: keyOf(s) });
    return h;
  }

  function open(ctx) {
    const { tugas, sub: s, max, save, toast, onSaved } = ctx;
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60';
    document.body.appendChild(el);
    let busy = false, armed = false, armTimer = null;
    const close = () => { clearTimeout(armTimer); el.remove(); document.removeEventListener('keydown', onKey, true); };
    // capture + stopPropagation: Esc hanya menutup panel ini, bukan modal Jawaban siswa di bawahnya
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });

    function timeline() {
      const h = history(s);
      if (!h.length) return '<p class="text-sm text-slate-500 dark:text-slate-400">Belum ada riwayat.</p>';
      const lastFb = h.map((x) => (x.tipe === 'feedback' && x.status !== 'sedang_dinilai' ? 'f' : '-')).lastIndexOf('f');   // draf tidak dihitung: belum dikirim ke siswa
      let sub = 0;
      return `<ol class="relative ml-1.5 border-l border-slate-200 dark:border-slate-700 space-y-5">${h.slice().map((x, i) => {
        const isSub = x.tipe === 'pengumpulan'; if (isSub) sub++;
        const read = i === lastFb ? ('feedbackReadAt' in s ? (s.feedbackReadAt ? `<p class="text-xs text-emerald-700 dark:text-emerald-300 mt-1"><i class="fa-solid fa-check-double mr-1"></i>Sudah dibaca siswa &middot; ${esc(fmt(s.feedbackReadAt))}</p>` : '<p class="text-xs text-amber-700 dark:text-amber-300 mt-1"><i class="fa-regular fa-eye-slash mr-1"></i>Belum dibaca siswa</p>') : '<p class="text-xs text-slate-400 mt-1">Status baca siswa belum tersedia.</p>') : '';
        const dot = isSub ? 'border-sky-500' : (x.status === 'revisi' ? 'border-rose-500' : 'border-emerald-500');
        return `<li class="pl-5 relative"><span class="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-white dark:bg-slate-900 border-2 ${dot}"></span>
          <div class="flex items-center gap-2 flex-wrap"><span class="text-sm font-semibold text-slate-800 dark:text-slate-100">${isSub ? 'Pengumpulan ke-' + esc(x.ke || sub) : (x.status === 'sedang_dinilai' ? 'Draf penilaian' : 'Feedback instruktur')}</span>${!isSub && META[x.status] ? pillHtml(x.status) : ''}${hasNilai(x) && !isSub ? `<b class="text-sm text-slate-800 dark:text-slate-100">${esc(x.nilai)}/${max}</b>` : ''}</div>
          ${x.at ? `<p class="text-xs text-slate-500 dark:text-slate-400">${esc(fmt(x.at))}</p>` : ''}
          ${x.teks ? `<p class="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap break-words">${esc(isSub && x.teks.length > 160 ? x.teks.slice(0, 160) + '...' : x.teks)}</p>` : ''}${read}</li>`;
      }).reverse().join('')}</ol>`;
    }

    function draw() {
      const k = keyOf(s), h = history(s), n = h.filter((x) => x.tipe === 'pengumpulan').length, drafting = k === 'sedang_dinilai';
      const link = /^https?:\/\//i.test(s.link || '') ? `<a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer" class="dc-btn dc-btn-sec dc-btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i><span>Buka hasil kerja</span></a>` : (s.link ? `<p class="text-xs text-slate-500 break-all">${esc(s.link)}</p>` : '');
      el.innerHTML = `<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Detail pengumpulan">
        <div class="flex items-start justify-between gap-3 p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800">
          <div class="min-w-0"><div class="flex items-center gap-2.5 flex-wrap"><h3 class="text-lg font-extrabold text-slate-900 dark:text-white">${esc(s.nama || s.username || 'Siswa')}</h3>${pillHtml(k)}</div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">${esc(tugas.title)} &middot; nilai maksimal ${max}${n > 1 ? ' &middot; sudah direvisi ' + (n - 1) + ' kali' : ''}</p></div>
          <button type="button" data-x class="dc-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="grid lg:grid-cols-5 gap-6 p-5 sm:p-6">
          <div class="lg:col-span-3 space-y-6 min-w-0">
            <section><h4 class="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">Hasil kerja siswa</h4>
              ${s.text ? `<pre class="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 max-h-72 overflow-auto text-slate-800 dark:text-slate-100">${esc(s.text)}</pre>` : '<p class="text-sm text-slate-500 dark:text-slate-400">Siswa tidak menulis jawaban teks.</p>'}
              <div class="mt-3">${link}</div></section>
            <section><h4 class="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">Riwayat feedback dan revisi</h4>${timeline()}</section></div>
          <form data-form class="lg:col-span-2 space-y-4 lg:border-l lg:border-slate-100 lg:dark:border-slate-800 lg:pl-6" novalidate>
            <h4 class="text-sm font-bold text-slate-800 dark:text-slate-100">Penilaian</h4>
            ${k === 'revisi' ? '<p class="text-xs rounded-xl px-3 py-2.5 border ' + TONE.warn + '"><i class="fa-solid fa-hourglass-half mr-1"></i>Menunggu siswa mengumpulkan ulang. Kamu masih bisa mengubah nilai atau feedback.</p>' : ''}
            <div><label for="pdNilai" class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nilai (0-${max})</label><input id="pdNilai" name="nilai" type="number" min="0" max="${max}" step="any" value="${esc(s.nilai ?? '')}" class="${INPUT}"></div>
            <div><div class="flex justify-between mb-1"><label for="pdFb" class="text-xs font-semibold text-slate-600 dark:text-slate-300">Feedback untuk siswa</label><span data-count class="text-[11px] text-slate-400"></span></div>
              <textarea id="pdFb" name="feedback" rows="6" maxlength="1000" placeholder="Apa yang sudah bagus dan apa yang perlu diperbaiki?" class="${INPUT} resize-y">${drafting ? esc(s.feedback || '') : ''}</textarea></div>
            <p data-msg class="hidden text-xs font-medium text-rose-600 dark:text-rose-400" role="alert"></p>
            <div class="flex flex-col gap-2">
              <button type="button" data-act="selesai" class="dc-btn dc-btn-pri justify-center"><i class="fa-solid fa-circle-check"></i><span>Simpan nilai dan selesai</span></button>
              <button type="button" data-act="revisi" class="dc-btn dc-btn-sec justify-center"><i class="fa-solid fa-rotate-left"></i><span data-lbl>Minta revisi</span></button>
              <button type="button" data-act="sedang_dinilai" class="dc-btn dc-btn-ghost justify-center"><i class="fa-regular fa-pen-to-square"></i><span>Simpan sebagai sedang dinilai</span></button></div>
            <p class="text-[11px] text-slate-400 leading-relaxed">Selesai: nilai wajib diisi. Minta revisi: feedback wajib diisi, siswa diminta mengumpulkan ulang. Sedang dinilai: simpan sementara tanpa mengabari hasil akhir.</p>
          </form></div></div>`;
      const fb = el.querySelector('#pdFb'), cnt = el.querySelector('[data-count]');
      const upd = () => { cnt.textContent = fb.value.length + '/1000'; }; fb.addEventListener('input', upd); upd();
      const first = el.querySelector('#pdNilai'); if (first) first.focus();
    }

    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-x]')) return close();
      const b = e.target.closest('[data-act]'); if (!b || busy) return;
      const act = b.dataset.act, msg = el.querySelector('[data-msg]'), raw = el.querySelector('#pdNilai').value.trim(), fb = el.querySelector('#pdFb').value.trim(), n = Number(raw);
      const fail = (t) => { msg.textContent = t; msg.classList.remove('hidden'); armed = false; };
      msg.classList.add('hidden');
      if (raw !== '' && (!Number.isFinite(n) || n < 0 || n > max)) return fail('Nilai harus angka 0 sampai ' + max + '.');
      if (act === 'selesai' && raw === '') return fail('Isi nilai dulu sebelum menyelesaikan penilaian.');
      if (act === 'revisi' && !fb) return fail('Tulis feedback supaya siswa tahu apa yang perlu direvisi.');
      if (act === 'revisi' && !armed) { armed = true; el.querySelector('[data-lbl]').textContent = 'Yakin? Klik sekali lagi'; clearTimeout(armTimer); armTimer = setTimeout(() => { armed = false; const l = el.querySelector('[data-lbl]'); if (l) l.textContent = 'Minta revisi'; }, 4000); return; }
      busy = true; el.querySelectorAll('[data-act]').forEach((x) => { x.disabled = true; });
      const body = { feedback: fb, status: act }; if (raw !== '') body.nilai = n;
      try {
        const r = await save(body);
        const hadHistory = Array.isArray(s.riwayat) && s.riwayat.length, base = history(s);
        const merged = Object.assign(s, { nilai: raw !== '' ? n : s.nilai, feedback: fb || s.feedback, status: act, gradedAt: new Date().toISOString() }, r && typeof r === 'object' ? r : {});
        if (!(r && Array.isArray(r.riwayat))) { merged.riwayat = (hadHistory ? s.riwayat : base).slice(); merged.riwayat.push({ tipe: 'feedback', at: new Date().toISOString(), teks: fb, nilai: raw !== '' ? n : undefined, status: act }); }
        if ('feedbackReadAt' in s && fb) s.feedbackReadAt = null;
        armed = false; busy = false; if (onSaved) onSaved(s); draw();
        toast(act === 'revisi' ? 'Permintaan revisi dikirim ke ' + (s.nama || 'siswa') + '.' : act === 'selesai' ? 'Nilai ' + (s.nama || 'siswa') + ' disimpan.' : 'Disimpan sebagai sedang dinilai.');
      } catch (ex) { busy = false; el.querySelectorAll('[data-act]').forEach((x) => { x.disabled = false; }); fail(ex.message || 'Gagal menyimpan. Coba lagi.'); }
    });
    draw();
  }

  window.DCPenilaian = { open, keyOf, history, meta: (s) => META[keyOf(s)], needsAction: (s) => ['menunggu', 'sedang_dinilai'].includes(keyOf(s)) };
})();
