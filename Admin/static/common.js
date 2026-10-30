/* Helper bersama: modal kredensial (bisa disalin), Esc menutup modal, aria-label otomatis. */
(function () {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.dcEsc = window.dcEsc || esc;

  // Modal "akun dibuat" dengan tombol Salin; ditutup lewat tombol, klik latar, atau Esc.
  window.dcShowCredentials = function (username, password) {
    const prev = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Akun siswa dibuat');
    wrap.innerHTML = `<div class="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-xl text-sm text-slate-800 dark:text-slate-100">
      <h3 class="font-bold text-base mb-1">Siswa berhasil dibuat</h3>
      <p class="text-slate-500 text-xs mb-3">Catat sekarang: password ini tidak ditampilkan lagi. Minta siswa menggantinya setelah login.</p>
      <div class="rounded-xl bg-slate-100 dark:bg-slate-800 p-3 font-mono text-xs space-y-1">
        <div>Username: <b>${esc(username)}</b></div><div>Password: <b>${esc(password)}</b></div></div>
      <div class="flex justify-end gap-2 mt-4">
        <button type="button" data-copy class="px-3 py-2 rounded-xl text-xs font-semibold bg-sky-600 text-white">Salin</button>
        <button type="button" data-close class="px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">Tutup</button></div></div>`;
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
    wrap.querySelector('[data-copy]').addEventListener('click', async (e) => {
      const text = `Username: ${username}\nPassword: ${password}`;
      try { await navigator.clipboard.writeText(text); e.target.textContent = 'Tersalin ✓'; }
      catch (_) { e.target.textContent = 'Salin manual'; }
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-copy]').focus();
  };

  // Esc menutup modal #modal* yang sedang terbuka.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = Array.from(document.querySelectorAll('[id^="modal"]:not(.hidden)')).pop();
    if (open && typeof toggleModal === 'function') toggleModal(open.id);
  });

  // Tombol berikon tanpa teks: pakai title sebagai aria-label.
  const label = (root) => root.querySelectorAll('button:not([aria-label]), a[title]:not([aria-label])').forEach((b) => {
    const t = (b.getAttribute('title') || b.getAttribute('data-tip') || '').trim();
    if (t) b.setAttribute('aria-label', t);
  });
  const start = () => { label(document); new MutationObserver((m) => m.forEach((r) => r.addedNodes.forEach((n) => n.nodeType === 1 && label(n)))).observe(document.body, { childList: true, subtree: true }); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
