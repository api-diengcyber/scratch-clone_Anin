// Tampilan SMA/SMK: banner tahap + kartu modul. KHUSUS SMA/SMK (terpisah dari SMP: smp-tahap.js).
// Data: jalur-data-smak.js (window.LP_SMAK). Pakai: window.renderSMAK(containerElement)
// Catatan: status task masih memakai kunci simpanan "smpTasks" (sama seperti sebelum dipisah),
// supaya progres yang sudah dikerjakan siswa tidak hilang. Id node SMA/SMK unik (pl*, wb*, da*), jadi tidak bentrok dengan SMP.
(function () {
  const T = window.LP_SMAK, LP = window.LP; if (!T || !LP) return;
  const META = {
    pl: { n: "Tahap 1 — Python Lanjutan & Algoritma", cls: "s4", usia: "15–18 tahun", slogan: "Struktur data, algoritma, file, dan OOP sampai aplikasi Python utuh!", em: ["📦", "🔎", "🔁", "💾", "🧱", "🏆"] },
    wb: { n: "Tahap 2 — Web Development Advanced", cls: "s5", usia: "15–18 tahun", slogan: "Dari layout responsif sampai aplikasi web interaktif!", em: ["🧭", "📱", "⚡", "🗂️", "🧩", "🚀"] },
    da: { n: "Tahap 3 — Data & AI Terapan", cls: "s6", usia: "15–18 tahun", slogan: "Olah data, pahami machine learning, dan pakai AI dengan bijak!", em: ["🔍", "📈", "📉", "🤖", "⚖️", "🎓"] } };
  const esc = window.DCUtils.esc;

  // Progres (milik SMA/SMK sendiri)
  const map = () => LP._get("smpTasks", {});
  const isDone = (n, i) => !!map()[n + ":" + i];
  const progNode = (node) => ({ done: node.tasks.filter((_, i) => isDone(node.id, i)).length, total: node.tasks.length });
  const progTrack = (t) => t.nodes.reduce((a, n) => { const p = progNode(n); return { done: a.done + p.done, total: a.total + p.total }; }, { done: 0, total: 0 });

  // Dipakai juga oleh belajar-smk.js (halaman detail SMA/SMK)
  // selesai → beri koin (sekali per task) lewat LP.completeSmp; batal → LP.undoSmp
  const toggle = (n, i) => {
    if (isDone(n, i)) return LP.undoSmp(n, i);
    const nd = T.reduce((a, t) => a || t.nodes.find((x) => x.id === n), null), k = nd && nd.tasks[i];
    return LP.completeSmp(n, i, { judul: nd ? nd.title + " — " + (k.judul || "Task " + (i + 1)) : n, project: !!(k && (k.project || k.kumpul)), poin: k && k.poin });
  };
  window.SMAK = { isDone, prog: progNode, track: progTrack, toggle }; window.SMAK_META = META;

  const st = document.createElement("style");
  st.textContent = ".tahap-banner.s4{background:linear-gradient(120deg,#0ea5a4,#2563eb);box-shadow:0 14px 30px rgba(14,165,164,.32)}.tahap-banner.s5{background:linear-gradient(120deg,#e11d48,#f59e0b);box-shadow:0 14px 30px rgba(225,29,72,.32)}.tahap-banner.s6{background:linear-gradient(120deg,#6d28d9,#06b6d4);box-shadow:0 14px 30px rgba(109,40,217,.32)}";
  document.head.appendChild(st);

  function sec(t) {
    const m = META[t.id], tp = progTrack(t), pct = tp.total ? Math.round(tp.done / tp.total * 100) : 0;
    const btn = tp.done === 0 ? "Mulai Petualangan →" : tp.done === tp.total ? "Lihat Lagi 🎉" : "Lanjutkan Belajar →";
    const cols = t.nodes.length <= 4 ? t.nodes.length : t.nodes.length % 3 === 0 ? 3 : 4;
    const cards = t.nodes.map((n, i) => {
      const p = progNode(n), complete = p.done === p.total;
      const dots = n.tasks.map((_, k) => '<i class="' + (isDone(n.id, k) ? "on" : "") + '"></i>').join("") + '<i class="trophy ' + (complete ? "on" : "") + '">🏆</i>';
      const status = p.done === 0 ? "Belum mulai" : complete ? "✓ Selesai!" : p.done + "/" + p.total + " selesai";
      return '<a class="tg-card ' + (complete ? "complete" : "") + '" href="/belajar-smk.html?p=' + n.id + '" style="--c:' + t.c + "; --d:" + i * 0.07 + 's">' +
        '<div class="tg-emoji">' + m.em[i] + "</div><h3>" + esc(n.title) + "</h3><p>" + esc(n.deskripsi) + "</p>" +
        '<div class="tg-dots">' + dots + '</div><span class="tg-status">' + status + "</span></a>";
    }).join("");
    return '<section class="tahap-section"><div class="tahap-banner ' + m.cls + '"><div class="tb-bubbles"><i></i><i></i><i></i><i></i></div>' +
      '<div class="tb-left"><span class="tb-age">Untuk usia <b>' + m.usia + "</b></span><h2>" + m.n + "</h2><p>" + m.slogan + " " + esc(t.meta) + '.</p>' +
      '<div class="tb-track"><div class="tb-bar"><i style="width:' + pct + '%"></i></div><span class="tb-rocket" style="left:calc(' + pct + '% * 0.94)">🚀</span></div>' +
      "<small>" + tp.done + " dari " + tp.total + " langkah selesai</small></div>" +
      '<a class="tb-btn" href="/belajar-smk.html?t=' + t.id + '">' + btn + "</a></div>" +
      '<div class="tahap-grid smk-fit" style="--n:' + t.nodes.length + "; --cols:" + cols + '">' + cards + "</div></section>";
  }
  window.renderSMAK = function (box, only) { box.innerHTML = T.filter((t) => !only || t.id === only).map(sec).join(""); };
})();
