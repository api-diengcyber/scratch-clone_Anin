// Panel "Task aktif" di samping editor. Aktif hanya jika URL editor punya ?smp=<id node>&t=<nomor task> (dikirim dari belajar-smp.html).
(function () {
  const q = new URLSearchParams(location.search), nid = q.get("smp"); if (!nid) return;
  const s = document.createElement("script"); s.src = "../jalur-data-smp.js?v=1"; s.onload = start; document.head.appendChild(s);
  const esc = (t) => String(t).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  function start() {
    const tr = (window.LP_SMP || []).find((t) => t.nodes.some((n) => n.id === nid)); if (!tr) return;
    const node = tr.nodes.find((n) => n.id === nid); let ti = Math.min(Math.max(+q.get("t") || 0, 0), node.tasks.length - 1), shut = false;
    const st = document.createElement("style");
    st.textContent = ".smpP{position:fixed;top:64px;right:12px;width:290px;max-height:76vh;overflow:auto;z-index:9000;background:#161c47;color:#e8ecff;border:2px solid " + tr.c + ";border-radius:18px;padding:12px 14px;font:14px/1.45 'Trebuchet MS',Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4)}.smpP h4{margin:2px 0 6px}.smpP label{display:flex;gap:8px;margin:6px 0;cursor:pointer}.smpP button,.smpP a{border:0;border-radius:10px;padding:6px 10px;background:#232b66;color:#cbd3ff;text-decoration:none;font:inherit;cursor:pointer}.smpP .r{display:flex;gap:6px;justify-content:space-between;align-items:center;margin-top:8px}.smpP small{opacity:.75}.smpP.min{width:auto;padding:8px 12px}";
    document.head.appendChild(st);
    const p = document.createElement("aside"); p.className = "smpP"; p.setAttribute("aria-label", "Task aktif"); document.body.appendChild(p);
    const key = () => "smpSteps_" + nid + "_" + ti, get = () => { try { return JSON.parse(localStorage.getItem(key())) || []; } catch (e) { return []; } };
    function draw() {
      if (shut) { p.className = "smpP min"; p.innerHTML = '<button data-o aria-label="Buka panel task">📋 Task aktif</button>'; return; }
      p.className = "smpP"; const k = node.tasks[ti], c = get();
      p.innerHTML = '<div class="r"><small>' + esc(node.title) + '</small><button data-c aria-label="Tutup panel">—</button></div><h4>Task ' + (ti + 1) + " dari " + node.tasks.length + ": " + esc(k.judul) + "</h4>" +
        k.langkah.map((l, i) => '<label><input type="checkbox" data-i="' + i + '"' + (c.includes(i) ? " checked" : "") + "><span>Langkah " + (i + 1) + ": " + esc(l) + "</span></label>").join("") +
        '<div class="r"><button data-p' + (ti ? "" : " disabled") + '>◀</button><button data-n' + (ti < node.tasks.length - 1 ? "" : " disabled") + '>▶</button><a href="../belajar-smp.html?p=' + tr.id + '">← Jalur SMP</a></div>';
    }
    p.addEventListener("click", (e) => { const b = e.target; if (b.closest("[data-c]")) { shut = true; draw(); p.querySelector("button").focus(); } else if (b.closest("[data-o]")) { shut = false; draw(); }
      else if (b.closest("[data-p]") && ti > 0) { ti--; draw(); } else if (b.closest("[data-n]") && ti < node.tasks.length - 1) { ti++; draw(); } });
    p.addEventListener("change", (e) => { if (!e.target.matches("[data-i]")) return; const c = get(), i = +e.target.dataset.i, j = c.indexOf(i);
      if (e.target.checked && j < 0) c.push(i); else if (!e.target.checked && j > -1) c.splice(j, 1); try { localStorage.setItem(key(), JSON.stringify(c)); } catch (x) {} });
    draw();
  }
})();
