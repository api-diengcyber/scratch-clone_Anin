// Jalur Belajar SMP. ?t=<tahap> = daftar modul tahap itu · ?p=<modul> = daftar task modul (seperti halaman task SD).
(function () {
  const T = window.LP_SMP, S = window.SMP, M = window.SMP_META, LP = window.LP, app = document.getElementById("app"), q = new URLSearchParams(location.search);
  const esc = (t) => String(t).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  document.getElementById("pointsValue").textContent = LP.points();
  const tr = T.find((t) => t.nodes.some((n) => n.id === q.get("p"))), node = tr && tr.nodes.find((n) => n.id === q.get("p"));
  const crumbs = (a) => '<div class="crumbs">' + a.map((c, i) => (i ? "<span>›</span>" : "") + '<button data-href="' + c[1] + '">' + c[0] + "</button>").join("") + "</div>";
  let lastBtn = null;
  function render() {
    if (!node) { app.innerHTML = crumbs([["🏠 Dashboard", "dashboard.html"]]) + '<div class="smp-over" id="ov"></div>'; window.renderSMPTahap(document.getElementById("ov"), q.get("t")); return; }
    const m = M[tr.id], idx = tr.nodes.indexOf(node), p = S.prog(node), pct = Math.round(p.done / p.total * 100), cur = node.tasks.findIndex((_, i) => !S.isDone(node.id, i));
    app.innerHTML = crumbs([["🏠 Dashboard", "dashboard.html"], [m.e + " " + esc(tr.nama), "belajar-smp.html?t=" + tr.id], [m.em[idx] + " " + esc(node.title), "#"]]) +
      '<div style="--c:' + tr.c + '"><div class="phead"><div class="pe">' + m.em[idx] + "</div><div><h2>" + esc(node.title) + "</h2><p>" + esc(node.deskripsi) + " Pertemuan " + node.pertemuan + " • " + esc(node.level) + '</p><div class="bar"><i style="width:' + pct + '%"></i></div><div class="bar-text">' + p.done + " dari " + p.total + " task selesai</div></div></div>" +
      '<section class="tcard"><h3>📖 Ringkasan &amp; Teori Singkat</h3><p class="desc">' + esc(node.ringkasan) + "</p><ul>" + node.teori.map((s) => "<li>" + esc(s) + "</li>").join("") + '</ul><div class="chips">' + node.materi.map((s) => '<span class="chip">' + esc(s) + "</span>").join("") + "</div></section>" +
      '<div class="path">' + node.tasks.map((k, i) => { const dn = S.isDone(node.id, i), op = i === 0 || S.isDone(node.id, i - 1), cu = i === cur;
        return '<div class="node ' + (dn ? "done " : "") + (!op ? "locked " : "") + (cu ? "current" : "") + '"><div class="circle">' + (!op ? "🔒" : dn ? "✓" : i + 1) + '</div><div class="ncard"><div><div class="nlabel">TASK ' + (i + 1) + (cu ? " • 👉 AYO MULAI!" : "") + "</div><h3>" + esc(k.judul) + "</h3><p>" + k.langkah.length + " langkah praktik</p></div>" +
          '<div class="nacts"><button class="btn ' + (!op ? "grey" : dn ? "ghost" : "green") + '" data-k="' + i + '"' + (!op ? " disabled" : "") + ">" + (!op ? "🔒 Terkunci" : dn ? "Ulangi" : "Mulai →") + "</button></div></div></div>"; }).join("") + "</div></div>";
  }
  function modal(i) {
    const k = node.tasks[i], ov = document.createElement("div"); ov.className = "smp-overlay";
    const draw = () => { const dn = S.isDone(node.id, i);
      ov.innerHTML = '<div class="smp-modal" role="dialog" aria-modal="true" aria-labelledby="mt" style="--c:' + tr.c + '"><button class="xbtn" data-x aria-label="Tutup">✕</button><h2 id="mt">Task ' + (i + 1) + ": " + esc(k.judul) + '</h2><p class="sub">' + esc(node.title) + " • Pertemuan " + node.pertemuan + "</p>" +
        "<h3>📖 Ringkasan &amp; Teori Singkat</h3><p>" + esc(node.ringkasan) + "</p><ul>" + node.teori.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>" +
        "<h3>🛠️ Instruksi Praktik</h3><ol>" + k.langkah.map((s) => "<li><b>Langkah " + (k.langkah.indexOf(s) + 1) + ":</b> " + esc(s) + "</li>").join("") + "</ol>" +
        '<a class="btn" href="' + esc(node.urlEditor) + "?smp=" + node.id + "&t=" + i + '">Buka Editor ' + (node.urlEditor.indexOf("3D") > -1 ? "3D 🧊" : "💻") + '</a><div class="mfoot"><button class="btn ' + (dn ? "ghost" : "green") + '" data-done>' + (dn ? "↩ Batalkan selesai" : "✓ Tandai task selesai") + '</button><button class="btn ghost" data-x>Tutup</button></div></div>'; };
    const close = () => { document.removeEventListener("keydown", key); ov.remove(); if (lastBtn && document.contains(lastBtn)) lastBtn.focus(); };
    const key = (e) => { if (e.key === "Escape") close(); else if (e.key === "Tab") { const f = [...ov.querySelectorAll("a,button")]; if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); } } };
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-x]")) close(); else if (e.target.closest("[data-done]")) { S.toggle(node.id, i); draw(); render(); ov.querySelector("[data-done]").focus(); } });
    draw(); document.body.appendChild(ov); document.addEventListener("keydown", key); ov.querySelector(".xbtn").focus();
  }
  app.addEventListener("click", (e) => { const c = e.target.closest("[data-href]"), b = e.target.closest("[data-k]"); if (c && c.dataset.href !== "#") location.href = c.dataset.href; else if (b && !b.disabled) { lastBtn = b; modal(+b.dataset.k); } });
  render();
})();
