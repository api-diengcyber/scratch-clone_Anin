/* Dialog konfirmasi & input bergaya Tailwind (pengganti confirm() / prompt() bawaan browser).
   Pakai:
     if (await dcConfirm({ title, message, detail, confirmText, cancelText, tone })) { ... }
     const nilai = await dcPrompt({ title, message, placeholder, value, confirmText, validate });  // null jika dibatalkan
   copyable: true -> kotak 'detail' dilengkapi tombol Salin (mis. untuk password sementara).
   tone: 'danger' | 'warning' | 'info' | 'success'.  Esc = batal, Enter = ya, klik latar = batal. */
(function () {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const TONES = {
    danger:  { icon: 'fa-solid fa-trash-can',            badge: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',     btn: 'dc-btn-danger-solid' },
    warning: { icon: 'fa-solid fa-triangle-exclamation', badge: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400', btn: 'dc-btn-warn-solid' },
    info:    { icon: 'fa-solid fa-circle-question',      badge: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',         btn: 'dc-btn-pri' },
    success: { icon: 'fa-solid fa-circle-check',         badge: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400', btn: 'dc-btn-pri' },
  };

  let host = null;
  let queue = Promise.resolve(); // dialog ditampilkan satu per satu

  function ensureHost() {
    if (host) return host;
    host = document.createElement('div');
    host.id = 'dcDialog';
    host.className = 'hidden fixed inset-0 z-[80] flex items-center justify-center p-4';
    document.body.appendChild(host);
    return host;
  }

  function show(cfg) {
    return new Promise((resolve) => {
      const h = ensureHost();
      const t = TONES[cfg.tone] || TONES.info;
      const isPrompt = cfg.type === 'prompt';
      const prev = document.activeElement;

      h.innerHTML = `
        <div data-dcd-bd class="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-150 opacity-0"></div>
        <div data-dcd-panel role="${isPrompt ? 'dialog' : 'alertdialog'}" aria-modal="true" aria-labelledby="dcdTitle" aria-describedby="dcdMsg"
             class="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 transition-all duration-150 opacity-0 scale-95">
          <div class="flex items-start gap-4">
            <div class="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-lg ${t.badge}"><i class="${cfg.icon || t.icon}"></i></div>
            <div class="min-w-0 flex-1">
              <h3 id="dcdTitle" class="text-base font-bold text-slate-900 dark:text-white leading-snug">${esc(cfg.title)}</h3>
              ${cfg.message ? `<p id="dcdMsg" class="mt-1.5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">${esc(cfg.message)}</p>` : '<p id="dcdMsg" class="sr-only">Dialog</p>'}
              ${cfg.detail && cfg.copyable ? `<div class="mt-3 flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                  <code data-dcd-detail class="min-w-0 flex-1 text-sm font-mono font-semibold text-slate-800 dark:text-slate-100 break-all select-all">${esc(cfg.detail)}</code>
                  <button type="button" data-dcd-copy class="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition" aria-label="Salin ke clipboard"><i class="fa-regular fa-copy" data-dcd-copy-ic></i><span data-dcd-copy-tx>Salin</span></button>
                </div>` : cfg.detail ? `<div class="mt-3 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate" title="${esc(cfg.detail)}">${esc(cfg.detail)}</div>` : ''}
              ${isPrompt ? `
                <input data-dcd-input type="text" autocomplete="off" spellcheck="false" value="${esc(cfg.value || '')}" placeholder="${esc(cfg.placeholder || '')}"
                       class="mt-3 w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20">
                <p data-dcd-err class="hidden mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400"></p>` : ''}
            </div>
          </div>
          <div class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" data-dcd-no class="dc-btn dc-btn-sec">${esc(cfg.cancelText || 'Batal')}</button>
            <button type="button" data-dcd-ok class="dc-btn ${t.btn}">${esc(cfg.confirmText || 'Ya, lanjutkan')}</button>
          </div>
        </div>`;

      const bd = h.querySelector('[data-dcd-bd]'), panel = h.querySelector('[data-dcd-panel]');
      const ok = h.querySelector('[data-dcd-ok]'), no = h.querySelector('[data-dcd-no]');
      const input = h.querySelector('[data-dcd-input]'), err = h.querySelector('[data-dcd-err]');
      const copyBtn = h.querySelector('[data-dcd-copy]');
      let done = false, copyTimer = null;

      const copyText = async (text) => {
        try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
        try { // cadangan untuk http / browser lama
          const ta = document.createElement('textarea');
          ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
          panel.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
          const okc = document.execCommand('copy'); ta.remove(); return okc;
        } catch (_) { return false; }
      };
      if (copyBtn) copyBtn.addEventListener('click', async () => {
        const okc = await copyText(String(cfg.detail));
        const tx = copyBtn.querySelector('[data-dcd-copy-tx]'), ic = copyBtn.querySelector('[data-dcd-copy-ic]');
        tx.textContent = okc ? 'Tersalin' : 'Gagal, salin manual';
        ic.className = okc ? 'fa-solid fa-check text-emerald-500' : 'fa-solid fa-xmark text-rose-500';
        clearTimeout(copyTimer);
        copyTimer = setTimeout(() => { tx.textContent = 'Salin'; ic.className = 'fa-regular fa-copy'; }, 2000);
      });

      const finish = (result) => {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey, true); clearTimeout(copyTimer);
        bd.classList.add('opacity-0'); panel.classList.add('opacity-0', 'scale-95'); panel.classList.remove('opacity-100', 'scale-100');
        setTimeout(() => {
          h.classList.add('hidden'); h.innerHTML = '';
          if (prev && prev.isConnected && prev.focus) { try { prev.focus(); } catch (_) {} }
          resolve(result);
        }, 130);
      };

      const submit = () => {
        if (!isPrompt) return finish(true);
        const v = input.value.trim();
        const msg = cfg.validate ? cfg.validate(v) : (v ? '' : 'Isi dulu ya.');
        if (msg) {
          err.textContent = msg; err.classList.remove('hidden');
          input.classList.add('border-rose-400'); input.focus();
          return;
        }
        finish(v);
      };

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return finish(isPrompt ? null : false); }
        if (e.key === 'Enter' && !(e.target.closest && e.target.closest('[data-dcd-no], [data-dcd-copy]'))) { e.preventDefault(); e.stopImmediatePropagation(); return submit(); }
        if (e.key === 'Tab') { // fokus berputar di dalam dialog
          const f = [...panel.querySelectorAll('input, button')].filter((x) => !x.disabled);
          const i = f.indexOf(document.activeElement);
          e.preventDefault();
          f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
        }
      }
      document.addEventListener('keydown', onKey, true);
      ok.addEventListener('click', submit);
      no.addEventListener('click', () => finish(isPrompt ? null : false));
      bd.addEventListener('click', () => finish(isPrompt ? null : false));
      if (input) input.addEventListener('input', () => { err.classList.add('hidden'); input.classList.remove('border-rose-400'); });

      h.classList.remove('hidden');
      requestAnimationFrame(() => {
        bd.classList.remove('opacity-0'); panel.classList.remove('opacity-0', 'scale-95'); panel.classList.add('opacity-100', 'scale-100');
        // aksi berbahaya: fokus awal di "Batal" supaya Enter tidak langsung menghapus
        (input || (cfg.tone === 'danger' ? no : ok)).focus();
        if (input) input.select();
      });
    });
  }

  const enqueue = (cfg) => { const p = queue.then(() => show(cfg)); queue = p.catch(() => {}); return p; };
  window.dcConfirm = (cfg) => enqueue({ ...cfg, type: 'confirm' });
  window.dcPrompt = (cfg) => enqueue({ ...cfg, type: 'prompt' });
})();
