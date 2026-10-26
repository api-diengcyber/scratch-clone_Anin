// ============================================================
// Perayaan task berhasil: confetti + animasi popup "Hore, berhasil!"
//
// Satu berkas untuk semua jenjang. Dua jalur kerja:
//
//  1) Popup yang SUDAH ADA (Scratch, Text Editor, Editor 3D, halaman SD/belajar):
//     modul ini mengamati kemunculan  .mission-overlay > .mission-popup  yang berhasil
//     (emoji 🎉 / 📤, bukan .fail / .info / "Sudah selesai" ✅). Begitu muncul →
//     confetti + animasi pop + angka koin naik dari 0. Tidak ada kode editor yang diubah.
//
//  2) Task SMP & SMA/SMK (LP.completeSmp) yang sebelumnya hanya menampilkan teks kecil:
//     modul ini membungkus LP.completeSmp. Begitu server membalas koin, tampil popup
//     yang sama persis dengan editor lain + confetti. Penyelesaian otomatis saat halaman
//     dibuka (LP.syncSmpFromSteps) sengaja TIDAK memunculkan popup.
//
// Pasang SETELAH /kurikulum/core/jalur-belajar.js:
//   <script src="/shared/js/task-celebration.js?v=..."></script>
//
// API manual (opsional): TaskCelebration.confetti() · TaskCelebration.celebrate(overlayEl)
// ============================================================
(function () {
  "use strict";
  if (window.TaskCelebration) return;

  var STYLE_ID = "tc-style";
  var COLORS = ["#855cd6", "#ff5fa2", "#ffc83d", "#34b6ff", "#4cd08a", "#ff8a4c"];
  var reduceMotion = function () {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  // ---------- CSS tambahan (hanya animasi; tampilan dasar tetap dari CSS popup masing-masing halaman) ----------
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent =
      ".tc-confetti{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100000}" +
      ".mission-overlay.tc-celebrate{backdrop-filter:blur(2px);animation:tcFade .25s ease-out}" +
      ".mission-overlay.tc-celebrate .mission-popup{animation:tcPop .55s cubic-bezier(.2,1.4,.4,1) both}" +
      ".mission-overlay.tc-celebrate .mp-emoji{display:inline-block;transform-origin:50% 90%;animation:tcWiggle .9s .25s ease-in-out both}" +
      ".mission-overlay.tc-celebrate .mp-bonus{animation:tcBonus .5s .8s cubic-bezier(.2,1.5,.4,1) both}" +
      "@keyframes tcFade{from{opacity:0}to{opacity:1}}" +
      "@keyframes tcPop{0%{transform:scale(.7) translateY(24px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}" +
      "@keyframes tcWiggle{0%{transform:scale(.4) rotate(-20deg)}40%{transform:scale(1.25) rotate(12deg)}65%{transform:scale(.95) rotate(-8deg)}100%{transform:scale(1) rotate(0)}}" +
      "@keyframes tcBonus{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}" +
      "@media (prefers-reduced-motion:reduce){.mission-overlay.tc-celebrate,.mission-overlay.tc-celebrate .mission-popup,.mission-overlay.tc-celebrate .mp-emoji,.mission-overlay.tc-celebrate .mp-bonus{animation:none}}";
    document.head.appendChild(s);
  }

  // ---------- Confetti (canvas, tanpa library) ----------
  function confetti() {
    if (reduceMotion()) return function () {};
    injectStyle();

    var canvas = document.createElement("canvas");
    canvas.className = "tc-confetti";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    var parts = [];
    function rand(a, b) { return a + Math.random() * (b - a); }
    function spawn(x, y, angle, spread, power, count) {
      for (var i = 0; i < count; i++) {
        var a = angle + rand(-spread, spread), v = rand(power * 0.45, power);
        parts.push({
          x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          w: rand(7, 13), h: rand(4, 8), rot: rand(0, 6.28), vr: rand(-0.3, 0.3),
          wobble: rand(0, 6.28), vw: rand(0.05, 0.15),
          color: COLORS[(Math.random() * COLORS.length) | 0],
          round: Math.random() < 0.25, life: 0, max: rand(140, 230)
        });
      }
    }

    var t0 = performance.now(), stage = 0, raf = 0, stopped = false;
    function schedule() {
      var el = performance.now() - t0;
      if (stage === 0) { spawn(0, H * 0.85, -1.05, 0.35, 22, 70); spawn(W, H * 0.85, -2.09, 0.35, 22, 70); stage = 1; }
      if (stage === 1 && el > 350) { spawn(W * 0.5, H * 0.55, -1.57, 0.6, 20, 60); stage = 2; }
      if (stage === 2 && el > 700) { spawn(0, H * 0.7, -0.9, 0.4, 18, 40); spawn(W, H * 0.7, -2.24, 0.4, 18, 40); stage = 3; }
      if (el > 400 && el < 2200 && Math.random() < 0.5) spawn(rand(0, W), -10, 1.57, 0.5, 4, 3);
    }
    function stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
    function frame() {
      if (stopped) return;
      schedule();
      ctx.clearRect(0, 0, W, H);
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.35;
        p.x += p.vx + Math.sin(p.wobble) * 0.6; p.y += p.vy;
        p.rot += p.vr; p.wobble += p.vw; p.life++;
        if (p.life >= p.max || p.y > H + 30) { parts.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = p.life > p.max - 40 ? Math.max(0, (p.max - p.life) / 40) : 1;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.h * 0.6, 0, 6.28); ctx.fill(); }
        else { ctx.scale(1, Math.cos(p.wobble)); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        ctx.restore();
      }
      if (stage === 3 && !parts.length && performance.now() - t0 > 2400) return stop();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    setTimeout(stop, 7000);                        // pengaman: canvas pasti dibuang
    return stop;
  }

  // ---------- Angka koin naik dari 0 ----------
  function countUp(el) {
    var m = /^(\D*)(\d+)(\D*)$/.exec((el.textContent || "").trim());
    if (!m || reduceMotion()) return;
    var pre = m[1], to = +m[2], post = m[3], start = performance.now(), dur = 700;
    el.textContent = pre + "0" + post;
    (function step(now) {
      var k = Math.min(1, (now - start) / dur);
      el.textContent = pre + Math.round(to * (1 - Math.pow(1 - k, 3))) + post;
      if (k < 1) requestAnimationFrame(step);
    })(start);
  }

  function celebrate(overlay) {
    if (!overlay || overlay.__tc) return;
    overlay.__tc = true;
    injectStyle();
    overlay.classList.add("tc-celebrate");
    var pts = overlay.querySelector(".mp-points b");
    if (pts) countUp(pts);
    confetti();
  }

  // ---------- Jalur 1: amati popup berhasil yang sudah ada ----------
  function isSuccess(popup) {
    if (!popup || popup.classList.contains("fail") || popup.classList.contains("info")) return false;
    var em = popup.querySelector(".mp-emoji");
    var t = em ? em.textContent : "";
    return t.indexOf("🎉") > -1 || t.indexOf("📤") > -1;      // ✅ = "Sudah selesai" (tanpa koin) → tanpa confetti
  }
  function inspect(node) {
    if (!node || node.nodeType !== 1) return;
    var ov = node.classList && node.classList.contains("mission-overlay") ? node : (node.querySelector && node.querySelector(".mission-overlay"));
    if (!ov) return;
    var popup = ov.querySelector(".mission-popup");
    if (isSuccess(popup)) celebrate(ov);
  }
  function observe() {
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var added = list[i].addedNodes;
        for (var j = 0; j < added.length; j++) inspect(added[j]);
      }
    }).observe(document.body, { childList: true });
  }

  // ---------- Jalur 2: task SMP & SMA/SMK ----------
  function esc(t) { var d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML; }

  function findNode(nodeId) {
    var tracks = (window.LP_SMP || []).concat(window.LP_SMAK || []);
    for (var i = 0; i < tracks.length; i++) {
      var nodes = tracks[i].nodes || [];
      for (var j = 0; j < nodes.length; j++) if (nodes[j].id === nodeId) return { track: tracks[i], node: nodes[j] };
    }
    return null;
  }

  function showSmpPopup(nodeId, index, info, s, fallbackEarned) {
    var old = document.querySelector(".mission-overlay");
    if (old) old.remove();

    var found = findNode(nodeId);
    var inEditor = new URLSearchParams(location.search).get("smp") === nodeId;
    var modUrl = found ? ((found.track.grade === "smak" ? "/belajar-smk.html" : "/belajar-smp.html") + "?p=" + encodeURIComponent(nodeId)) : null;
    var hasNext = !!(found && index + 1 < (found.node.tasks || []).length);
    var isProject = !!info.project;
    var earned = s.earned != null ? s.earned : fallbackEarned;
    var total = s.total != null ? s.total : (window.LP && LP.saldo ? LP.saldo() : null);

    var html = '<div class="mp-points"><b>+' + earned + "</b> koin</div>";
    if (s.bonus) html += '<div class="mp-bonus">⚡ Bonus percobaan pertama +' + s.bonus + "</div>";
    if (total != null) html += '<p class="mp-info">Koinmu sekarang: <b>⭐ ' + total + "</b></p>";
    if (found && !hasNext) html += '<div class="mp-all">🎓 Modul "' + esc(found.node.title) + '" selesai!</div>';

    var ov = document.createElement("div");
    ov.className = "mission-overlay";
    ov.innerHTML =
      '<div class="mission-popup ok" role="dialog" aria-modal="true">' +
        '<div class="mp-emoji">' + (isProject ? "📤" : "🎉") + "</div>" +
        "<h2>" + (isProject ? "Project berhasil dikirim!" : "Hore, berhasil!") + "</h2>" +
        (info.judul ? '<p class="mp-name">' + esc(info.judul) + "</p>" : "") +
        html +
        '<div class="mp-actions"></div>' +
      "</div>";

    var box = ov.querySelector(".mp-actions");
    function btn(label, cls, fn) {
      var b = document.createElement("button");
      b.type = "button"; b.className = cls; b.textContent = label;
      b.addEventListener("click", function () { ov.remove(); if (fn) fn(); });
      box.appendChild(b);
      return b;
    }
    var primary;
    if (inEditor && found) {
      if (hasNext) {
        primary = btn("Task berikutnya →", "mp-primary", function () {
          var u = new URL(location.href);
          u.searchParams.set("t", String(index + 1));          // t = nomor urut task (mulai 0), sama seperti smp-taskpanel.js
          location.href = u.toString();
        });
        btn("Kembali ke modul", "mp-secondary", function () { location.href = modUrl; });
      } else {
        primary = btn("Kembali ke modul", "mp-primary", function () { location.href = modUrl; });
      }
      btn("Lanjut bereksperimen", "mp-link");
    } else {
      primary = btn("Oke, lanjut", "mp-primary");
    }
    var link = box.querySelector(".mp-link");
    if (link) link.style.cssText = "background:transparent;color:#8791a5;font-weight:normal";

    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);                              // observer ikut memicu confetti
    if (primary) primary.focus({ preventScroll: true });
  }

  function hookLP() {
    var LP = window.LP;
    if (!LP || typeof LP.completeSmp !== "function") return false;
    if (LP.__tcHooked) return true;
    LP.__tcHooked = true;

    var syncing = 0, origSync = LP.syncSmpFromSteps;
    if (typeof origSync === "function") {
      LP.syncSmpFromSteps = function () {
        syncing++;
        try { return origSync.apply(this, arguments); } finally { syncing--; }
      };
    }
    var orig = LP.completeSmp;
    LP.completeSmp = function (nodeId, index, info) {
      var r = orig.apply(this, arguments);
      if (!syncing && r && !r.blocked && !r.already && r.ready && typeof r.ready.then === "function") {
        r.ready.then(function (s) { showSmpPopup(nodeId, index, info || {}, s || {}, r.earned); }).catch(function () {});
      }
      return r;
    };
    return true;
  }

  function init() {
    injectStyle();
    observe();
    if (!hookLP()) {                                           // LP belum siap (urutan script) → coba lagi sebentar
      var n = 0, t = setInterval(function () { if (hookLP() || ++n > 40) clearInterval(t); }, 250);
    }
  }
  if (document.body) init(); else document.addEventListener("DOMContentLoaded", init);

  window.TaskCelebration = { confetti: confetti, celebrate: celebrate };
})();
