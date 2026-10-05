// Tampilan SMP bergaya dashboard SD: banner tahap + kartu modul. Data: jalur-data-smp.js. Status task disimpan lewat LP._get/_set ("smpTasks").
// Dipakai: dashboard.html (tab SMP, menggantikan renderSMP lama) dan belajar-smp.html.
(function () {
  const T = window.LP_SMP, LP = window.LP; if (!T || !LP) return;
  const META = {
    python: { n: "Tahap 1 — Python Start", e: "🐍", cls: "s1", slogan: "Dari print() pertama sampai game 2D dan Hackathon!", em: ["🐍", "🔀", "🧮", "🏗️", "🎮", "🏆"] },
    ai: { n: "Tahap 2 — AI & Creative Tech", e: "🤖", cls: "s2", slogan: "Kuasai prompt, tools AI, dan buat portofolio webmu!", em: ["💬", "🌐", "🧰", "🎨", "📖", "🗂️"] },
    d3: { n: "Tahap 3 — Game Dev 3D Lanjutan", e: "🧊", cls: "s3", slogan: "Bangun dunia 3D, karakter, fisika, dan game utuh!", em: ["🌍", "🕹️", "⚙️", "👾", "⚡", "🎬"] } };
  const esc = (t) => String(t).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const S = { map: () => LP._get("smpTasks", {}), isDone: (n, i) => !!S.map()[n + ":" + i],
    toggle(n, i) { const m = S.map(), k = n + ":" + i; if (m[k]) delete m[k]; else m[k] = 1; LP._set("smpTasks", m); },
    prog(node) { const d = node.tasks.filter((_, i) => S.isDone(node.id, i)).length; return { done: d, total: node.tasks.length }; },
    track(t) { return t.nodes.reduce((a, n) => { const p = S.prog(n); return { done: a.done + p.done, total: a.total + p.total }; }, { done: 0, total: 0 }); } };
  window.SMP = S; window.SMP_META = META;
  const st = document.createElement("style");
  st.textContent = ".tahap-banner.s1{background:linear-gradient(120deg,#3d8bf5,#5b3dff);box-shadow:0 14px 30px rgba(61,139,245,.32)}.tahap-banner.s2{background:linear-gradient(120deg,#8f6bff,#ec5fa8);box-shadow:0 14px 30px rgba(143,107,255,.32)}.tahap-banner.s3{background:linear-gradient(120deg,#ff9f1c,#ef476f);box-shadow:0 14px 30px rgba(255,159,28,.32)}";
  document.head.appendChild(st);
  function sec(t) {
    const m = META[t.id], tp = S.track(t), pct = tp.total ? Math.round(tp.done / tp.total * 100) : 0;
    const btn = tp.done === 0 ? "Mulai Petualangan →" : tp.done === tp.total ? "Lihat Lagi 🎉" : "Lanjutkan Belajar →";
    const cards = t.nodes.map((n, i) => { const p = S.prog(n);
      const dots = n.tasks.map((_, k) => '<i class="' + (S.isDone(n.id, k) ? "on" : "") + '"></i>').join("") + '<i class="trophy ' + (p.done === p.total ? "on" : "") + '">🏆</i>';
      return '<a class="tg-card ' + (p.done === p.total ? "complete" : "") + '" href="belajar-smp.html?p=' + n.id + '" style="--c:' + t.c + "; --d:" + i * 0.07 + 's"><div class="tg-emoji">' + m.em[i] + "</div><h3>" + esc(n.title) + "</h3><p>" + esc(n.deskripsi) + "</p>" +
        '<div class="tg-dots">' + dots + '</div><span class="tg-status">' + (p.done === 0 ? "Belum mulai" : p.done === p.total ? "✓ Selesai!" : p.done + "/" + p.total + " selesai") + "</span></a>"; }).join("");
    return '<section class="tahap-section"><div class="tahap-banner ' + m.cls + '"><div class="tb-bubbles"><i></i><i></i><i></i><i></i></div><div class="tb-left"><span class="tb-age">🎈 Untuk usia <b>12–15 tahun</b></span>' +
      "<h2>" + m.e + " " + m.n + "</h2><p>" + m.slogan + " " + esc(t.meta) + '.</p><div class="tb-track"><div class="tb-bar"><i style="width:' + pct + '%"></i></div><span class="tb-rocket" style="left:calc(' + pct + '% * 0.94)">🚀</span></div>' +
      "<small>" + tp.done + " dari " + tp.total + ' langkah selesai</small></div><a class="tb-btn" href="belajar-smp.html?t=' + t.id + '">' + btn + '</a></div><div class="tahap-grid" style="--n:' + t.nodes.length + '">' + cards + "</div></section>";
  }
  window.renderSMPTahap = function (box, only) { box.innerHTML = T.filter((t) => !only || t.id === only).map(sec).join(""); };
  window.renderSMP = window.renderSMPTahap;   // dashboard memanggil window.renderSMP(area)
})();
