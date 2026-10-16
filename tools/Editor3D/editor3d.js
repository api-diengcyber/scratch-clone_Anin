// ============================================================
// 3D EDITOR — Dieng Cyber Coding (gaya Roblox Studio, versi ringan)
//  ?task=g2-t1   → task dari Learning Path (dicek otomatis & langsung selesai saat semua ✅)
//  ?project=...  → Project Akhir (petunjuk + tombol Screenshot)
//  (tanpa)       → mode bebas
// Data task ada di ../jalur-data.js (task berjenis model3d(...)).
// ============================================================
(async function () {

  const authToken = localStorage.getItem("authToken");

  if (!authToken) {
    window.location.replace("/index.html");
    return;
  }

  try {
    const response = await fetch("/api/auth/me", {
      headers: {
        Authorization: "Bearer " + authToken
      }
    });

    if (!response.ok) {
      localStorage.removeItem("isLoggedIn");
      localStorage.removeItem("username");
      localStorage.removeItem("scratch_user");
      localStorage.removeItem("authToken");

      window.location.replace("/index.html");
      return;
    }

    const user = await response.json();

    localStorage.setItem("username", user.username);
    localStorage.setItem("scratch_user", user.username);
    localStorage.setItem("isLoggedIn", "true");

  } catch (error) {
    console.error("Gagal memeriksa sesi:", error);
    window.location.replace("/index.html");
    return;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  if (typeof LP === "undefined") { document.body.textContent = "Data jalur belajar belum termuat."; return; }
  if (typeof THREE === "undefined") { $("vp").innerHTML = '<p style="padding:20px">⚠️ Mesin 3D belum termuat. Pastikan komputer terhubung ke internet, lalu muat ulang halaman.</p>'; return; }

  // ---------- task / project / mode bebas ----------
  const Q = new URLSearchParams(location.search), taskId = Q.get("task"), projectId = Q.get("project"), dari = Q.get("dari");
  let info = null, task = null, proj = null;
  if (taskId) {
    info = LP.find(taskId);
    if (!info || info.task.kind !== "model3d") { location.replace("/SD/belajar.html" + (info ? "?task=" + taskId : "")); return; }
    if (!LP.isUnlocked(taskId)) { location.replace("/SD/belajar.html?p=" + info.pemb.id); return; }
    task = info.task;
    $("backLink").href = "/SD/belajar.html?p=" + info.pemb.id; $("backLink").textContent = "← Jalur belajar";
  } else if (projectId && LP.find(projectId)) {
    proj = LP.find(projectId).task;
    $("backLink").href = "/SD/belajar.html?task=" + projectId; $("backLink").textContent = "← Project Akhir";
  } else if (dari && LP.find(dari)) {
    $("backLink").href = "/SD/belajar.html?task=" + dari; $("backLink").textContent = "← Kembali ke Task";
  }
  const key = taskId || (projectId ? "p-" + projectId : "bebas");
  const nowPoints = () => (LP.saldo ? LP.saldo() : LP.points()); const refreshPoints = () => { $("pointsValue").textContent = nowPoints(); }; refreshPoints();
  if (LP.loadFromServer) LP.loadFromServer().then((ok) => { if (ok) refreshPoints(); }).catch(() => {});

  function popup(o) {
    const old = document.querySelector(".mission-overlay"); if (old) old.remove();
    const ov = document.createElement("div"); ov.className = "mission-overlay";
    ov.innerHTML = '<div class="mission-popup ' + (o.type || "ok") + '"><div class="mp-emoji">' + o.emoji + "</div><h2>" + esc(o.title) + "</h2>" +
      (o.name ? '<p class="mp-name">' + esc(o.name) + "</p>" : "") + (o.html || "") + '<div class="mp-actions"></div></div>';
    (o.buttons || []).forEach((b) => {
      const btn = document.createElement("button"); btn.type = "button"; btn.className = b.cls || "mp-secondary"; btn.textContent = b.label;
      btn.addEventListener("click", () => { ov.remove(); if (b.fn) b.fn(); }); ov.querySelector(".mp-actions").appendChild(btn);
    });
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }

  // ---------- dunia 3D ----------
  const SHAPES = { box: { n: "Balok", i: "🟦" }, sphere: { n: "Bola", i: "⚪" }, cyl: { n: "Tabung", i: "🥫" }, cone: { n: "Kerucut", i: "🔺" }, spawn: { n: "Tempat Muncul", i: "⭐" } };
  const COLORS = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#4dabf7", "#9775fa", "#f783ac", "#a0663c", "#ffffff", "#495057"];
  const GEO = { box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(.5, 24, 16), cyl: new THREE.CylinderGeometry(.5, .5, 1, 24), cone: new THREE.ConeGeometry(.5, 1, 24) };
  GEO.spawn = GEO.box;
  const vp = $("vp"), R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }), cv = R.domElement;
  vp.appendChild(cv);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfe8ff);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa88, .95));
  const sun = new THREE.DirectionalLight(0xffffff, .55); sun.position.set(6, 12, 8); scene.add(sun);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: 0x8fd18f })); base.rotation.x = -Math.PI / 2; scene.add(base);
  scene.add(new THREE.GridHelper(40, 40, 0x6fb36f, 0x7cc27c));
  const cam = new THREE.PerspectiveCamera(55, 1, .1,300); let th = .7, ph = 1.0, rad = 18;
  const selBox = new THREE.BoxHelper(new THREE.Mesh(GEO.box), 0xff8a00); selBox.visible = false; scene.add(selBox);
  const me = new THREE.Group(); me.visible = false; scene.add(me);
  const body = new THREE.Mesh(new THREE.BoxGeometry(.6, .9, .4), new THREE.MeshLambertMaterial({ color: 0x4c9aff })); body.position.y = .75; me.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.3, 16, 12), new THREE.MeshLambertMaterial({ color: 0xffd9a8 })); head.position.y = 1.5; me.add(head);

  let parts = [], sel = null, uid = 1, tool = "select", mode = "edit", curColor = COLORS[0], playSnap = "";
  const S = { played: false, walked: false, orbited: false, jumped: false };
  const byId = (id) => parts.find((p) => p.id === id);
  function sync(p) { const m = p.mesh; m.scale.set(p.size[0], p.size[1], p.size[2]); m.position.set(p.pos[0], p.pos[1], p.pos[2]); m.rotation.y = p.rot * Math.PI / 180; m.material.color.set(p.color); }
  function mk(d) {
    const p = { id: uid++, shape: d.shape, name: d.name, color: d.color, size: d.size.slice(), pos: d.pos.slice(), rot: d.rot || 0, anchored: d.anchored !== false, vy: 0 };
    p.mesh = new THREE.Mesh(GEO[p.shape], new THREE.MeshLambertMaterial({ color: p.color })); p.mesh.userData.id = p.id;
    scene.add(p.mesh); sync(p); parts.push(p); return p;
  }
  function drop(p) { scene.remove(p.mesh); p.mesh.material.dispose(); parts.splice(parts.indexOf(p), 1); if (sel === p) select(null); }
  const snap = () => JSON.stringify(parts.map((p) => ({ shape: p.shape, name: p.name, color: p.color, size: p.size, pos: p.pos, rot: p.rot, anchored: p.anchored })));
  function restore(s) { parts.slice().forEach(drop); sel = null; JSON.parse(s).forEach(mk); select(null); }

  // ---------- riwayat (undo/redo) & simpan ----------
  let hist = [], hi = -1;
  function commit() {
    const s = snap(); if (s === hist[hi]) { check(); return; }
    hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 60) hist.shift(); hi = hist.length - 1;
    try { const d = LP._get("model3dDraft", {}); d[key] = s; LP._set("model3dDraft", d); } catch (e) {}
    buildExpl(); check();
  }
  function undo(d) { const n = hi + d; if (mode !== "edit" || n < 0 || n >= hist.length) return; hi = n; restore(hist[hi]); buildExpl(); check(); }

  // ---------- explorer & properties ----------
  function buildExpl() {
    $("expl").innerHTML = '<div class="hint">🌍 Baseplate</div>' + parts.map((p) => '<div class="ex' + (p === sel ? " on" : "") + '" data-id="' + p.id + '">' + SHAPES[p.shape].i + " " + esc(p.name) + "</div>").join("");
  }
  const vec3 = (lbl, k, v, st) => "<label>" + lbl + '</label><div class="v3">' + [0, 1, 2].map((i) => '<input type="number" id="' + k + i + '" step="' + st + '" value="' + v[i] + '">').join("") + "</div>";
  function buildProps() {
    const el = $("props");
    if (!sel) { el.innerHTML = '<p class="hint">Klik sebuah benda di dunia 3D atau di Explorer untuk melihat Properties-nya.</p>'; return; }
    const p = sel;
    el.innerHTML = '<label>NAMA</label><input type="text" id="pName" value="' + esc(p.name) + '">' +
      "<label>WARNA</label><div class=\"pal\">" + COLORS.map((c) => '<span data-c="' + c + '" style="background:' + c + '"></span>').join("") + '<input type="color" id="pColor" value="' + p.color + '"></div>' +
      vec3("SIZE (ukuran: lebar, tinggi, panjang)", "s", p.size, .5) + vec3("POSITION (posisi: kiri-kanan, naik-turun, maju-mundur)", "p", p.pos, .5) +
      '<label>ROTATION (putaran)</label><input type="number" id="rot" step="15" value="' + p.rot + '">' +
      (p.shape === "spawn" ? "" : '<label><input type="checkbox" id="pAnch"' + (p.anchored ? " checked" : "") + "> ⚓ Anchored (dipaku, tidak jatuh)</label>");
  }
  function refreshProps() { if (!sel) return; [0, 1, 2].forEach((i) => { const a = $("s" + i), b = $("p" + i); if (a) a.value = sel.size[i]; if (b) b.value = sel.pos[i]; }); if ($("rot")) $("rot").value = sel.rot; }
  function select(p) { sel = p; if (p) selBox.setFromObject(p.mesh); selBox.visible = !!p && mode === "edit"; buildProps(); buildExpl(); }
  function apply(el) {
    if (!sel || mode !== "edit") return; const id = el.id, v = el.value;
    if (id === "pName") sel.name = v.slice(0, 20) || SHAPES[sel.shape].n;
    else if (id === "pColor") sel.color = v;
    else if (id === "pAnch") sel.anchored = el.checked;
    else if (id === "rot") { if (v === "") return; sel.rot = +v; }
    else if (/^[sp][0-2]$/.test(id)) { if (v === "" || isNaN(+v)) return; const i = +id[1]; if (id[0] === "s") sel.size[i] = Math.max(.2, +v); else sel.pos[i] = +v; }
    sync(sel); selBox.setFromObject(sel.mesh);
  }
  $("props").addEventListener("input", (e) => { if (e.target.id !== "pName") apply(e.target); });
  $("props").addEventListener("change", (e) => { apply(e.target); commit(); if (e.target.id === "pName") buildExpl(); });
  $("props").addEventListener("click", (e) => { const c = e.target.dataset && e.target.dataset.c; if (!c) return; curColor = c; if (sel) { sel.color = c; sync(sel); $("pColor").value = c; commit(); } });
  $("expl").addEventListener("click", (e) => { const r = e.target.closest(".ex"); if (r && mode === "edit") select(byId(+r.dataset.id)); });

  // ---------- tombol ----------
  function insert(shape) {
    if (mode !== "edit") return;
    if (shape === "spawn") { const o = parts.find((p) => p.shape === "spawn"); if (o) drop(o); }
    const n = parts.length, sz = shape === "spawn" ? [4, .4, 4] : [2, 2, 2], c = parts.filter((p) => p.shape === shape).length + 1;
    const p = mk({ shape, name: SHAPES[shape].n + (shape === "spawn" ? "" : " " + c), color: shape === "spawn" ? "#ffd43b" : curColor, size: sz, pos: [((n % 5) - 2) * 3, sz[1] / 2, Math.floor(n / 5) * 3 - 3] });
    select(p); commit();
  }
  function setTool(t) { tool = t; document.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === t)); tip(); }
  function tip() {
    $("tip").textContent = mode === "play" ? "Jalan: W A S D / panah • Lompat: Spasi • Seret = putar pandangan" :
      { select: "Klik benda untuk memilih • Seret = putar pandangan", move: "Seret benda untuk menggesernya", scale: "Seret benda ke atas / bawah untuk mengubah ukuran", rotate: "Seret benda ke kiri / kanan untuk memutarnya" }[tool];
  }
  document.querySelector(".tb").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.tool) return setTool(b.dataset.tool);
    if (b.dataset.ins) return insert(b.dataset.ins);
    const a = b.dataset.act;
    if (a === "play") return mode === "edit" ? startPlay() : stopPlay();
    if (a === "shot") { R.render(scene, cam); const l = document.createElement("a"); l.href = cv.toDataURL("image/png"); l.download = "dunia-3d.png"; l.click(); return; }
    if (mode !== "edit") return;
    if (a === "undo") undo(-1); else if (a === "redo") undo(1);
    else if (a === "del" && sel) { drop(sel); commit(); }
    else if (a === "dup" && sel) { const d = sel, p = mk({ shape: d.shape, name: d.name, color: d.color, size: d.size, pos: [d.pos[0] + 1, d.pos[1], d.pos[2] + 1], rot: d.rot, anchored: d.anchored }); select(p); commit(); }
  });
  addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA/.test((e.target.tagName || ""));
    if (mode === "play") { K[e.key.toLowerCase()] = true; if (!typing && (e.key === " " || e.key.indexOf("Arrow") === 0)) e.preventDefault(); return; }
    if (typing) return;
    if ((e.key === "Delete" || e.key === "Backspace") && sel) { drop(sel); commit(); }
    else if (e.ctrlKey && e.key.toLowerCase() === "z") undo(-1);
    else if (e.ctrlKey && e.key.toLowerCase() === "y") undo(1);
    else if (e.ctrlKey && e.key.toLowerCase() === "d" && sel) { e.preventDefault(); document.querySelector('[data-act="dup"]').click(); }
  });
  addEventListener("keyup", (e) => { K[e.key.toLowerCase()] = false; });
  const K = {};

  // ---------- mouse: putar kamera & alat Geser / Ukuran / Putar ----------
  const ray = new THREE.Raycaster(), V2 = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt = new THREE.Vector3();
  const aim = (e) => { const r = cv.getBoundingClientRect(); V2.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(V2, cam); };
  const snapTo = (v, s) => Math.round(v / s) * s;
  let drag = null;
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, mv: 0, kind: "orbit", hit: null };
    if (mode !== "edit" || e.button === 2) return;
    aim(e); const h = ray.intersectObjects(parts.map((p) => p.mesh))[0]; drag.hit = h ? byId(h.object.userData.id) : null;
    if (drag.hit && tool !== "select") {
      select(drag.hit); drag.kind = tool; drag.size = drag.hit.size.slice(); drag.rot = drag.hit.rot;
      plane.constant = -drag.hit.pos[1]; ray.ray.intersectPlane(plane, pt); drag.off = [drag.hit.pos[0] - pt.x, drag.hit.pos[2] - pt.z]; drag.y0 = e.clientY; drag.x0 = e.clientX;
    }
  });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.mv += Math.abs(dx) + Math.abs(dy);
    if (drag.kind === "orbit") { th -= dx * .008; ph = Math.min(1.5, Math.max(.15, ph - dy * .006)); drag.x = e.clientX; drag.y = e.clientY; if (drag.mv > 25 && !S.orbited) { S.orbited = true; check(); } return; }
    const p = drag.hit;
    if (drag.kind === "move") { aim(e); if (ray.ray.intersectPlane(plane, pt)) { p.pos[0] = Math.max(-19, Math.min(19, snapTo(pt.x + drag.off[0], .5))); p.pos[2] = Math.max(-19, Math.min(19, snapTo(pt.z + drag.off[1], .5))); } }
    else if (drag.kind === "scale") { const f = 1 + (drag.y0 - e.clientY) * .01; p.size = drag.size.map((v) => Math.max(.5, snapTo(v * f, .5))); }
    else if (drag.kind === "rotate") p.rot = snapTo(drag.rot + (e.clientX - drag.x0) * .7, 15);
    sync(p); selBox.setFromObject(p.mesh); refreshProps();
  });
  cv.addEventListener("pointerup", () => {
    if (!drag) return;
    if (drag.kind !== "orbit") { if (drag.mv > 3) commit(); }
    else if (mode === "edit" && drag.mv < 5) select(drag.hit);
    drag = null;
  });
  cv.addEventListener("wheel", (e) => { e.preventDefault(); rad = Math.min(40, Math.max(4, rad + e.deltaY * .02)); }, { passive: false });

  // ---------- Play: fisika ringan ----------
  const pl = { x: 0, y: 0, z: 0, vy: 0, on: false }; let dist = 0;
  const AB = (p) => { const r = p.rot * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)), hx = (c * p.size[0] + s * p.size[2]) / 2, hz = (s * p.size[0] + c * p.size[2]) / 2, hy = p.size[1] / 2;
    return { x0: p.pos[0] - hx, x1: p.pos[0] + hx, z0: p.pos[2] - hz, z1: p.pos[2] + hz, y0: p.pos[1] - hy, y1: p.pos[1] + hy }; };
  const over = (b, x, z, r) => b.x0 < x + r && b.x1 > x - r && b.z0 < z + r && b.z1 > z - r;
  function startPlay() {
    playSnap = snap(); mode = "play"; select(null); S.played = true; dist = 0;
    const sp = parts.find((p) => p.shape === "spawn");
    pl.x = sp ? sp.pos[0] : 0; pl.z = sp ? sp.pos[2] : 0; pl.y = sp ? sp.pos[1] + sp.size[1] / 2 : 0; pl.vy = 0; pl.on = false;
    parts.forEach((p) => { p.vy = 0; }); me.visible = true;
    $("playBtn").textContent = "⏹ Berhenti"; $("playBtn").classList.add("stop"); tip(); check();
  }
  function stopPlay() {
    mode = "edit"; me.visible = false; restore(playSnap); if (hist[hi] !== snap()) commit(); else check();
    $("playBtn").textContent = "▶ Main"; $("playBtn").classList.remove("stop"); tip();
  }
  function physics(dt) {
    parts.forEach((p) => {
      if (p.anchored || p.shape === "spawn") return;
      p.vy -= 25 * dt; const h = p.size[1] / 2, a = AB(p), old = p.pos[1] - h; let ny = p.pos[1] + p.vy * dt, lim = h;
      parts.forEach((o) => { if (o === p) return; const b = AB(o); if (a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0 && old >= b.y1 - .05 && ny - h < b.y1) lim = Math.max(lim, b.y1 + h); });
      if (ny <= lim) { ny = lim; p.vy = 0; } p.pos[1] = ny; sync(p);
    });
    const f = (K.w || K.arrowup ? 1 : 0) - (K.s || K.arrowdown ? 1 : 0), s = (K.d || K.arrowright ? 1 : 0) - (K.a || K.arrowleft ? 1 : 0);
    const hit = (x, y, z) => parts.some((o) => { const b = AB(o); return over(b, x, z, .3) && y + 1.8 > b.y0 && y < b.y1 - .45; });
    if (f || s) {
      const fx = -Math.sin(th), fz = -Math.cos(th); let vx = f * fx + s * -fz, vz = f * fz + s * fx; const l = Math.hypot(vx, vz); vx /= l; vz /= l;
      const ox = pl.x, oz = pl.z, st = 6 * dt;
      if (!hit(pl.x + vx * st, pl.y, pl.z)) pl.x += vx * st; if (!hit(pl.x, pl.y, pl.z + vz * st)) pl.z += vz * st;
      pl.x = Math.max(-19.5, Math.min(19.5, pl.x)); pl.z = Math.max(-19.5, Math.min(19.5, pl.z));
      me.rotation.y = Math.atan2(vx, vz); dist += Math.hypot(pl.x - ox, pl.z - oz);
      if (dist >= 5 && !S.walked) { S.walked = true; check(); }
    }
    if (K[" "] && pl.on) { pl.vy = 9; pl.on = false; if (!S.jumped) { S.jumped = true; check(); } }
    pl.vy -= 25 * dt; let ny = pl.y + pl.vy * dt, g = 0;
    parts.forEach((o) => { const b = AB(o); if (over(b, pl.x, pl.z, .3) && pl.y >= b.y1 - .45 && ny < b.y1) g = Math.max(g, b.y1); });
    if (ny <= g) { ny = g; pl.vy = 0; pl.on = true; } else pl.on = false;
    pl.y = ny; me.position.set(pl.x, pl.y, pl.z);
  }

  // ---------- render ----------
  let last = performance.now();
  function frame(t) {
    requestAnimationFrame(frame); const dt = Math.min(.05, (t - last) / 1000); last = t;
    const w = vp.clientWidth, h = vp.clientHeight;
    if (w && h && (cv.width !== Math.floor(w * R.getPixelRatio()) || cv.height !== Math.floor(h * R.getPixelRatio()))) { R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    let tx = 0, ty = 0, tz = 0;
    if (mode === "play") { physics(dt); tx = pl.x; ty = pl.y + 1; tz = pl.z; }
    else if (sel) selBox.update();
    cam.position.set(tx + rad * Math.sin(ph) * Math.sin(th), ty + rad * Math.cos(ph), tz + rad * Math.sin(ph) * Math.cos(th)); cam.lookAt(tx, ty, tz);
    R.render(scene, cam);
  }

  // ---------- kartu misi & pengecekan otomatis ----------
  let goalLis = [], doneNow = false;
  const goals = task ? task.cek || [] : [];
  function ctx() { const src = mode === "play" ? JSON.parse(playSnap) : JSON.parse(snap()); return Object.assign({ parts: src.map((p) => ({ shape: p.shape, color: String(p.color).toLowerCase(), size: p.size, pos: p.pos, anchored: p.anchored })) }, S); }
  function check() {
    if (!task || !goalLis.length) return;
    const c = ctx(), r = goals.map((g) => { try { return !!g.uji(c); } catch (e) { return false; } });
    goalLis.forEach((li, i) => { li.classList.toggle("done", r[i]); li.firstChild.textContent = r[i] ? "✅" : "☐"; });
    if (r.every(Boolean) && !LP.isDone(taskId) && !doneNow) { doneNow = true; success(); }
  }
  async function success() {
    const nameLine = "Task " + task.no + " — " + task.title, nx = LP.next(taskId), buttons = [];
    if (nx) buttons.push({ label: nx.type === "project" ? "Lanjut ke Project Akhir 🏆" : "Task berikutnya →", cls: "mp-primary", fn: () => { location.href = LP.href(nx.id, "Editor3D"); } });
    buttons.push({ label: "Kembali ke jalur belajar", cls: "mp-secondary", fn: () => { location.href = "/SD/belajar.html?p=" + info.pemb.id; } }, { label: "Lanjut bereksperimen", cls: "mp-secondary" });
    const r = LP.complete(taskId, true);
    if (r && r.blocked) {                       // gerbang materi: materi belum dibaca sampai selesai
      return popup({ type: "info", emoji: "📖", title: "Baca materinya dulu ya!", name: nameLine,
        html: '<p class="mp-info">Task ini baru bisa diselesaikan setelah kamu membaca materinya sampai selesai.</p>',
        buttons: [{ label: "Baca Materi 📖", cls: "mp-primary", fn: () => { location.href = LP.materiHref(task, "/belajar.html?task=" + taskId); } },
                  { label: "Nanti saja", cls: "mp-secondary" }] });
    }
    const s = await r.ready;                    // poin & bonus dari jawaban server
    refreshPoints();
    popup({ type: "ok", emoji: "🎉", title: "Hore, berhasil!", name: nameLine, html: '<div class="mp-points"><b>+' + s.earned + '</b> poin</div>' + (s.bonus ? '<div class="mp-bonus">⚡ Bonus percobaan pertama +' + s.bonus + '</div>' : "") + '<p class="mp-info">Poinmu sekarang: <b>⭐ ' + nowPoints() + "</b></p>", buttons });
  }
  function missionCard() {
    const t = task || proj; if (!t) return;
    const m = $("mission"); m.hidden = false;
    m.innerHTML = '<div class="m-top"><div><div class="m-tag"></div><h2></h2><p></p></div><button type="button" class="m-info-btn" id="infoBtn">📝 Langkah &amp; petunjuk</button></div><ul class="m-goals"></ul><div class="m-info" id="mInfo"></div>';
    m.querySelector(".m-tag").textContent = task ? "🎯 TASK " + task.no + " • " + task.label.toUpperCase() + "  •  ⭐ " + LP.poinOf(task) + " poin" : "🏆 PROJECT AKHIR  •  ⭐ " + LP.poinOf(proj) + " poin";
    m.querySelector("h2").textContent = t.title; m.querySelector("p").textContent = t.desc;
    const list = task ? goals.map((g) => g.teks) : (proj.checklist || []);
    goalLis = list.map((x) => { const li = document.createElement("li"); li.innerHTML = "<span>☐</span><span></span>"; li.lastChild.textContent = x; m.querySelector(".m-goals").appendChild(li); return li; });
    const steps = task ? task.langkah : proj.steps, kond = task && LP.kondisi(task);
    let h = steps && steps.length ? '<div class="m-box steps"><h4>📝 Langkah-langkah</h4><ol>' + steps.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol></div>" : "";
    if (task && task.materi) h += '<div class="m-box"><h4>📖 Yang kamu pelajari</h4><ul>' + task.materi.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul></div>";
    if (task && task.hint) h += '<div class="m-box tip"><h4>💡 Petunjuk</h4>' + esc(task.hint) + "</div>";
    if (kond) h += '<div class="m-box ok"><h4>✅ Berhasil jika</h4>' + esc(kond.sukses) + "</div>";
    if (proj) h += '<div class="m-box ok"><h4>📸 Setelah selesai</h4>Klik tombol 📸 Screenshot, lalu unggah gambarnya di halaman Project.</div>';
    $("mInfo").innerHTML = h; $("mInfo").hidden = task ? LP.isDone(taskId) : false;
    $("infoBtn").addEventListener("click", () => { $("mInfo").hidden = !$("mInfo").hidden; });
    if (task && LP.isDone(taskId)) { const d = document.createElement("div"); d.className = "m-done"; d.textContent = "✅ Sudah selesai! Mengulang tidak memberi poin tambahan."; m.appendChild(d); }
  }

  // ---------- mulai ----------
  try { const s = (LP._get("model3dDraft", {}) || {})[key]; if (s) restore(s); } catch (e) {}
  hist = [snap()]; hi = 0;
  missionCard(); buildProps(); buildExpl(); tip(); check();
  requestAnimationFrame(frame);
})();
