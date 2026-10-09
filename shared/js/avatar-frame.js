// ============================================================
// AvatarFrame — memasang bingkai hadiah (LP.HADIAH) ke avatar.
// Dipakai dashboard, halaman poin, dan halaman profil agar tampilannya SAMA.
// Butuh: /shared/css/frames.css
//
//   AvatarFrame.apply(el, frame, { size: 44, ornaments: true })
//       -> pasang bingkai ke elemen avatar yang sudah ada (foto/huruf tidak berubah)
//   AvatarFrame.markup(innerHTML, frame, { size: 96, fs: '3rem', ornaments: true })
//       -> kembalikan HTML avatar berbingkai (untuk render template string)
//   AvatarFrame.active()
//       -> bingkai yang sedang dipakai user: objek HADIAH atau null
// ============================================================
(function () {
  const FRAME_CLASSES = ['neon', 'gold', 'rainbow', 'galaxy', 'fire', 'matrix', 'cat', 'space', 'sea', 'nature']
    .map(n => 'frame-' + n);

  function ornamentsHTML(frame) {
    return (frame.orn || []).map(o => {
      const s = o.s || 1;
      const anim = o.a ? ' af-a-' + o.a : '';
      if (o.p === 'orbit') {
        return '<span class="af-orn af-p-orbit" style="--s:' + s + '"><span class="af-a-orbit">' + o.e + '</span></span>';
      }
      const cls = o.code ? ' af-code' : '';
      return '<span class="af-orn af-p-' + o.p + anim + cls + '" style="--s:' + s + '">' + o.e + '</span>';
    }).join('');
  }

  function sizeVars(px) {
    return '--af-w:' + px + 'px;--af:' + (px * 0.2).toFixed(1) + 'px;--af-orbit:' + Math.round(px * 0.5) + 'px;';
  }

  const AvatarFrame = {
    active() {
      try {
        return (window.LP && LP.hadiahAktif && LP.hadiahAktif().bingkai) || null;
      } catch (e) { return null; }
    },

    markup(inner, frame, opts) {
      opts = opts || {};
      const px = opts.size || 96;
      const cls = frame ? frame.frameClass : 'af-plain';
      const fs = opts.fs ? 'font-size:' + opts.fs + ';' : '';
      return '<span class="af-wrap' + (px <= 48 ? ' af-sm' : '') + '" style="' + sizeVars(px) + '">' +
        '<span class="af-circle ' + cls + '" style="width:' + px + 'px;height:' + px + 'px;' + fs + '">' + inner + '</span>' +
        (frame && opts.ornaments !== false ? ornamentsHTML(frame) : '') +
        '</span>';
    },

    apply(el, frame, opts) {
      if (!el) return;
      opts = opts || {};
      const px = opts.size || el.offsetWidth || 44;

      // bersihkan bingkai lama
      FRAME_CLASSES.forEach(c => el.classList.remove(c));
      const old = el.parentNode;
      if (old && old.classList.contains('af-wrap')) {
        old.querySelectorAll('.af-orn').forEach(n => n.remove());
      }
      if (!frame) return;

      // bungkus avatar agar hiasan bisa menonjol keluar lingkaran
      let wrap = el.parentNode;
      if (!wrap.classList.contains('af-wrap')) {
        wrap = document.createElement('span');
        wrap.className = 'af-wrap';
        el.parentNode.insertBefore(wrap, el);
        wrap.appendChild(el);
      }
      wrap.style.cssText += sizeVars(px);
      wrap.classList.toggle('af-sm', px <= 48);
      el.classList.add(frame.frameClass);
      if (opts.ornaments !== false) wrap.insertAdjacentHTML('beforeend', ornamentsHTML(frame));
    }
  };

  window.AvatarFrame = AvatarFrame;
})();
