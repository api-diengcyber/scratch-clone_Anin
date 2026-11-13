// ============================================================
// PROJEK AKHIR / UJIAN KELULUSAN — pengumpulan & hasil penilaian untuk halaman siswa
// Dimuat lewat <script src="/shared/js/ujian-kelulusan.js"></script> (setelah utils.js).
//
// ALUR STATUS (per siswa, per ujian berformat "proyek"):
//   Terkunci (task belum selesai) → Belum dikumpulkan → Menunggu penilaian → Revisi (nilai < KKM) ⟲ → Lulus (nilai ≥ KKM)
//   "Revisi" bukan gagal: siswa memperbaiki lalu mengumpulkan lagi, statusnya kembali "Menunggu penilaian".
//
// MEMBACA dari server:  GET /api/ujian-kelulusan -> { ok, items: [...] }
//   Tiap item: id, title, description, grade, format, kkm, durasi, buka, tutup, status,
//     learningPathId   (opsional) syarat: semua task di Learning Path itu harus selesai dulu
//     syarat           (opsional) { selesai, total, terpenuhi } bila server yang menghitung; kalau tidak ada,
//                      halaman ini menghitung sendiri dari progres siswa di browser
//     kriteria         (opsional) [{ k, l, d, max }] rubrik khusus ujian ini; default 4 kriteria × 25
//     submission       (jawaban siswa yang sedang login; null bila belum mengumpulkan):
//                      { id, text, link, status: "menunggu"|"revisi"|"lulus", attempt, submittedAt,
//                        rubrik: { fungsi, kreativitas, kerapian, penjelasan }, nilai, feedback, gradedAt }
// MENGIRIM jawaban:     PUT /api/ujian-kelulusan/:id/submission  { text, link } -> { ok, submission }
//                       (membuat jawaban baru atau mengumpulkan ulang saat Revisi; server mengembalikan status
//                        ke "menunggu". Ditolak server bila sudah Lulus, ujian ditutup, atau syarat task belum terpenuhi.)
// Tidak ada data cadangan di browser: jawaban siswa hanya tersimpan bila server menerimanya.
//
// API:
//   DCUjian.prepare(items)           -> Promise<items>  menghitung syarat task (bila perlu) sebelum digambar
//   DCUjian.state(item)              -> "locked"|"soon"|"closed"|"belum"|"menunggu"|"revisi"|"lulus"
//   DCUjian.statusHtml(item)         -> label status kecil (HTML sudah di-escape)
//   DCUjian.actionHtml(item, cls)    -> tombol aksi ("" bila tidak ada)
//   DCUjian.extraHtml(item)          -> ringkasan nilai rubrik + komentar instruktur (HTML) atau ""
//   DCUjian.handle(event, items, onChange) -> true bila klik itu milik tombol aksi
//   DCUjian.openSubmit(item, onChange)
// ============================================================
(function (root) {
  "use strict";
  var esc = (root.DCUtils && root.DCUtils.esc) || function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  };

  var RUBRIK = [
    { k: "fungsi", l: "Fungsi berjalan", d: "Karya berjalan sesuai tujuan", max: 25 },
    { k: "kreativitas", l: "Kreativitas", d: "Ide dan tampilan karya", max: 25 },
    { k: "kerapian", l: "Kerapian kode", d: "Kode rapi dan mudah dibaca", max: 25 },
    { k: "penjelasan", l: "Penjelasan", d: "Bisa menjelaskan cara kerja karya", max: 25 }
  ];
  function kriteria(u) {
    var k = u && Array.isArray(u.kriteria) && u.kriteria.length ? u.kriteria : RUBRIK;
    return k.map(function (x) { return { k: String(x.k), l: String(x.l || x.k), d: x.d || "", max: Number(x.max) > 0 ? Number(x.max) : 25 }; });
  }

  // ---------- syarat: semua task di Learning Path selesai (dihitung dari progres siswa) ----------
  var curP = null;
  function loadScript(src) {
    return new Promise(function (ok) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ok; document.head.appendChild(s); });
  }
  function ensureCurriculum() {
    if (curP) return curP;
    var chain = Promise.resolve();
    [["LP_DATA", "/kurikulum/data/jalur-data.js"], ["LP", "/kurikulum/core/jalur-belajar.js"],
     ["LP_SMP", "/kurikulum/data/jalur-data-smp.js"], ["LP_SMAK", "/kurikulum/data/jalur-data-smak.js"]].forEach(function (f) {
      chain = chain.then(function () { return root[f[0]] ? null : loadScript(f[1]); });
    });
    curP = chain; return curP;
  }
  // SD: id task "<jalur>-t<n>" (LP.isDone). SMP & SMA/SMK: kunci "<modul>:<n>" di penyimpanan smpTasks.
  function hitungSyarat(u) {
    var pid = u && u.learningPathId, L = root.LP;
    if (!pid || !L || typeof L._get !== "function") return null;
    var g = String(u.grade || "").toUpperCase(), total = 0, selesai = 0, nama = "";
    if (g === "SD") {
      var D = root.LP_DATA; if (!D || !D.tahap) return null;
      D.tahap.forEach(function (th) { (th.pembelajaran || []).forEach(function (pb) {
        if (String(pb.id) !== String(pid)) return; nama = pb.judul || pb.id;
        (pb.tasks || []).forEach(function (t, i) { total++; if (L.isDone(pb.id + "-t" + (i + 1))) selesai++; });
      }); });
    } else {
      var tracks = g === "SMP" ? root.LP_SMP : root.LP_SMAK, done = L._get("smpTasks", {}) || {};
      (tracks || []).forEach(function (tr) { (tr.nodes || []).forEach(function (n) {
        if (String(n.id) !== String(pid)) return; nama = n.title || n.id;
        (n.tasks || []).forEach(function (t, i) { if (t.project) return; total++; if (done[n.id + ":" + i]) selesai++; });
      }); });
    }
    return total ? { selesai: selesai, total: total, terpenuhi: selesai >= total, nama: nama } : null;
  }
  function syaratOf(u) {
    var s = u && u.syarat;
    if (s && typeof s === "object" && (s.total != null || s.terpenuhi != null)) {
      var total = Number(s.total) || 0, selesai = Number(s.selesai) || 0;
      return { selesai: selesai, total: total, terpenuhi: typeof s.terpenuhi === "boolean" ? s.terpenuhi : selesai >= total, nama: s.nama || u.learningPathName || "" };
    }
    return u && u._syarat || null;
  }
  function prepare(items) {
    var need = (items || []).filter(function (u) { return u && u.format !== "tes" && u.learningPathId && !(u.syarat && typeof u.syarat === "object"); });
    if (!need.length) return Promise.resolve(items);
    return ensureCurriculum().then(function () {
      need.forEach(function (u) { var s = hitungSyarat(u); if (s) { s.nama = s.nama || u.learningPathName || ""; u._syarat = s; } });
      return items;
    }, function () { return items; });
  }

  // ---------- status ----------
  function subOf(u) { return u && u.submission && typeof u.submission === "object" ? u.submission : null; }
  function subStatus(sub, u) {
    if (!sub) return null;
    if (sub.status === "lulus" || sub.status === "revisi" || sub.status === "menunggu") return sub.status;
    if (sub.nilai != null && sub.nilai !== "") return Number(sub.nilai) >= Number(u.kkm) ? "lulus" : "revisi";
    return "menunggu";   // "dikumpulkan" (format lama) dianggap menunggu penilaian
  }
  var valid = function (s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s); };
  function windowState(u) {
    var today = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
    if (u.status === "ditutup") return "closed";
    if (valid(u.buka) && today < u.buka.slice(0, 10)) return "soon";
    if (valid(u.tutup) && today > u.tutup.slice(0, 10)) return "closed";
    return "open";
  }
  function state(u) {
    var st = subStatus(subOf(u), u);
    if (st) return st;
    var w = windowState(u);
    if (w !== "open") return w;
    var sy = syaratOf(u);
    return sy && sy.terpenuhi === false ? "locked" : "belum";
  }
  var LABEL = { belum: "Belum dikumpulkan", menunggu: "Menunggu penilaian", revisi: "Revisi", lulus: "Lulus 🎉", locked: "Terkunci", soon: "Segera dibuka", closed: "Ditutup" };
  function statusHtml(u) {
    var st = state(u), sub = subOf(u), label = LABEL[st], sy = syaratOf(u);
    if (st === "revisi" && sub && sub.nilai != null) label = "Revisi · nilai " + sub.nilai + " (KKM " + u.kkm + ")";
    if (st === "lulus" && sub && sub.nilai != null) label = "Lulus 🎉 · nilai " + sub.nilai;
    if (st === "locked" && sy) label = "Terkunci · selesaikan task " + sy.selesai + "/" + sy.total + " dulu";
    if (st === "menunggu" && sub && sub.attempt > 1) label += " (pengumpulan ke-" + sub.attempt + ")";
    ensureStyle();
    return '<span class="dcuj-st dcuj-st-' + st + '">' + esc(label) + "</span>";
  }
  function actionHtml(u, cls) {
    var st = state(u);
    if (st === "locked" || st === "soon" || st === "closed") return "";
    var label = st === "lulus" ? "Lihat nilai" : st === "menunggu" ? "Lihat / ubah jawaban" : st === "revisi" ? "🔁 Perbaiki & kumpulkan lagi" : "📤 Kumpulkan projek";
    return '<button type="button" class="' + esc(cls || "") + '" data-uj-act="' + esc(u.id) + '">' + label + "</button>";
  }
  function handle(ev, items, onChange) {
    var t = ev && ev.target, b = t && t.closest ? t.closest("[data-uj-act]") : null;
    if (!b) return false;
    var id = b.getAttribute("data-uj-act");
    var item = (items || []).filter(function (x) { return String(x.id) === String(id); })[0];
    if (!item) return false;
    openSubmit(item, onChange); return true;
  }

  function nilaiRows(u, sub) {
    var r = sub && sub.rubrik && typeof sub.rubrik === "object" ? sub.rubrik : null;
    if (!r) return "";
    return '<table class="dcuj-rub"><tbody>' + kriteria(u).map(function (c) {
      return "<tr><td>" + esc(c.l) + "</td><td><b>" + esc(r[c.k] != null ? r[c.k] : "–") + "</b> / " + esc(c.max) + "</td></tr>";
    }).join("") + "</tbody></table>";
  }
  function extraHtml(u) {
    var sub = subOf(u), st = state(u);
    if (!sub || (st !== "lulus" && st !== "revisi" && !(sub.feedback))) return "";
    ensureStyle();
    return '<div class="dcuj-res dcuj-res-' + (st === "lulus" ? "ok" : "rev") + '">' +
      (sub.nilai != null && sub.nilai !== "" ? "<b>Nilai " + esc(sub.nilai) + " / 100</b> · KKM " + esc(u.kkm) : "") +
      nilaiRows(u, sub) + (sub.feedback ? "<p>💬 " + esc(sub.feedback) + "</p>" : "") +
      (st === "revisi" ? "<p><b>Belum lulus bukan berarti gagal.</b> Perbaiki karyamu sesuai komentar, lalu kumpulkan lagi.</p>" : "") + "</div>";
  }

  function fmtTime(iso) {
    try { return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
  }
  function fail(msg, status) { var e = new Error(msg); e.status = status; return e; }
  function putSubmission(u, body) {
    var token = ""; try { token = localStorage.getItem("authToken") || ""; } catch (e) {}
    return fetch("/api/ujian-kelulusan/" + encodeURIComponent(u.id) + "/submission", {
      method: "PUT", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store"
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (d) {
        if (res.status === 401) throw fail("Sesi login habis. Silakan masuk lagi.", 401);
        if ([404, 405, 501].indexOf(res.status) >= 0 && !(d && d.message)) throw fail("Fitur pengumpulan projek belum aktif di server.", res.status);
        if (!res.ok || (d && d.ok === false)) throw fail((d && d.message) || ("Server bermasalah (HTTP " + res.status + ")"), res.status);
        var s = d && (d.submission || d.item || (d.data && (d.data.submission || d.data)));
        return s && typeof s === "object" ? s : null;
      });
    }, function () { throw fail("Tidak dapat terhubung ke server. Periksa koneksi internet.", 0); });
  }

  var CSS_ID = "dcuj-style";
  function ensureStyle() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement("style"); st.id = CSS_ID;
    st.textContent =
      ".dcuj-st{display:inline-block;padding:2px 9px;border-radius:10px;font:700 11px/1.5 'Trebuchet MS',Arial,sans-serif}" +
      ".dcuj-st-belum{background:#fff4d6;color:#8a5a00}.dcuj-st-menunggu{background:#dfe9ff;color:#2a4fa8}" +
      ".dcuj-st-revisi{background:#ffe9d6;color:#a54a00}.dcuj-st-lulus{background:#e3f8ec;color:#1a7f45}" +
      ".dcuj-st-locked,.dcuj-st-soon,.dcuj-st-closed{background:#eceff6;color:#5b6480}" +
      ".dcuj-res{margin-top:10px;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.5}" +
      ".dcuj-res-ok{background:#e3f8ec;color:#14663a}.dcuj-res-rev{background:#fff1e3;color:#8a4300}" +
      ".dcuj-res p{margin:6px 0 0;white-space:pre-wrap;color:#2b3350}" +
      ".dcuj-rub{border-collapse:collapse;margin-top:6px;font-size:12px}.dcuj-rub td{padding:1px 14px 1px 0;color:#2b3350}" +
      ".dcuj-ov{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(20,26,60,.55)}" +
      ".dcuj-box{position:relative;width:100%;max-width:540px;max-height:92vh;overflow:auto;background:#fff;color:#2b3350;border-radius:20px;padding:18px 20px;font:14px/1.5 'Trebuchet MS',Arial,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.35)}" +
      ".dcuj-box h3{margin:0 28px 4px 0;font-size:18px}.dcuj-box p{margin:4px 0}.dcuj-box h4{margin:14px 0 4px;font-size:13px}" +
      ".dcuj-x{position:absolute;top:10px;right:12px;border:0;background:#eef1ff;color:#5a6bd8;width:30px;height:30px;border-radius:50%;font-size:15px;cursor:pointer}" +
      ".dcuj-meta{color:#6b7494;font-size:12px}.dcuj-desc{white-space:pre-wrap;background:#f4f7ff;border-radius:12px;padding:9px 11px;font-size:13px}" +
      ".dcuj-kri{margin:4px 0 0;padding-left:18px;font-size:12px}.dcuj-kri li{margin:1px 0}" +
      ".dcuj-box label{display:block;margin-top:12px;font-weight:700;font-size:13px}" +
      ".dcuj-box textarea,.dcuj-box input{display:block;width:100%;margin-top:4px;padding:9px 11px;border:2px solid #d9e0ff;border-radius:12px;font:inherit;color:inherit;background:#fff}" +
      ".dcuj-box textarea{resize:vertical;min-height:110px}.dcuj-box [readonly]{background:#f4f6fb}" +
      ".dcuj-box textarea:focus,.dcuj-box input:focus{outline:3px solid #8fb4ff;outline-offset:1px;border-color:#5a8df0}" +
      ".dcuj-err{color:#b3261e;font-size:13px;font-weight:700}" +
      ".dcuj-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}" +
      ".dcuj-foot button{border:0;border-radius:12px;padding:9px 16px;font:700 14px 'Trebuchet MS',Arial,sans-serif;cursor:pointer;background:#eef1ff;color:#5a6bd8}" +
      ".dcuj-foot button[type=submit]{background:#2d8cff;color:#fff}.dcuj-foot button:disabled{opacity:.55;cursor:wait}" +
      ".dcuj-box button:focus-visible{outline:3px solid #2d8cff;outline-offset:2px}";
    document.head.appendChild(st);
  }

  function openSubmit(item, onChange) {
    ensureStyle();
    var opener = document.activeElement;
    var sub = subOf(item), st = state(item), readOnly = st === "lulus";
    var ov = document.createElement("div"); ov.className = "dcuj-ov";
    var win = (valid(item.buka) ? item.buka.slice(0, 10) : "") + (valid(item.tutup) ? " s.d. " + item.tutup.slice(0, 10) : "");
    ov.innerHTML =
      '<form class="dcuj-box" role="dialog" aria-modal="true" aria-labelledby="dcujT" novalidate>' +
        '<button type="button" class="dcuj-x" data-x aria-label="Tutup">✕</button>' +
        '<h3 id="dcujT">' + esc(item.title) + "</h3>" +
        '<p class="dcuj-meta">' + statusHtml(item) + " · KKM " + esc(item.kkm) + (win ? " · " + esc(win) : "") +
          (sub && sub.submittedAt ? " · Dikumpulkan " + esc(fmtTime(sub.submittedAt)) : "") + "</p>" +
        (item.description ? '<p class="dcuj-desc">' + esc(item.description) + "</p>" : "") +
        "<h4>Dinilai dari (total 100):</h4><ul class=\"dcuj-kri\">" + kriteria(item).map(function (c) { return "<li><b>" + esc(c.l) + "</b> (" + esc(c.max) + ")" + (c.d ? " — " + esc(c.d) : "") + "</li>"; }).join("") + "</ul>" +
        extraHtml(item) +
        '<label for="dcujText">Penjelasan karyamu</label>' +
        '<textarea id="dcujText" name="text" maxlength="3000" placeholder="Ceritakan apa yang kamu buat dan bagaimana cara kerjanya…"' + (readOnly ? " readonly" : "") + ">" + esc(sub && sub.text || "") + "</textarea>" +
        '<label for="dcujLink">Link karya (boleh dikosongkan bila sudah menjelaskan)</label>' +
        '<input id="dcujLink" name="link" type="url" maxlength="500" placeholder="https://…" value="' + esc(sub && sub.link || "") + '"' + (readOnly ? " readonly" : "") + ">" +
        '<p class="dcuj-err" role="alert" hidden></p>' +
        '<div class="dcuj-foot"><button type="button" data-x>Tutup</button>' +
          (readOnly ? "" : '<button type="submit">' + (st === "revisi" ? "Kumpulkan ulang" : sub ? "Simpan perubahan" : "Kirim projek") + "</button>") + "</div>" +
      "</form>";

    var form = ov.firstChild, err = form.querySelector(".dcuj-err");
    function close() { document.removeEventListener("keydown", onKey, true); ov.remove(); if (opener && opener.isConnected && opener.focus) opener.focus(); }
    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); close(); return; }
      if (e.key !== "Tab") return;
      var f = [].slice.call(form.querySelectorAll("button,textarea,input")).filter(function (n) { return !n.disabled; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
    function showErr(m) { err.textContent = m; err.hidden = !m; }
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    [].forEach.call(form.querySelectorAll("[data-x]"), function (b) { b.addEventListener("click", close); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (readOnly) return;
      var text = form.elements.text.value.trim(), link = form.elements.link.value.trim();
      if (!text && !link) return showErr("Isi penjelasan atau link karyamu dulu ya.");
      if (link && !/^https?:\/\/\S+$/i.test(link)) return showErr("Link harus diawali http:// atau https://");
      showErr("");
      var btn = form.querySelector("[type=submit]"), label = btn.textContent;
      btn.disabled = true; btn.textContent = "Mengirim…";
      putSubmission(item, { text: text, link: link }).then(function (s) {
        var prev = sub || {};
        item.submission = s || { text: text, link: link, status: "menunggu", attempt: (Number(prev.attempt) || 0) + 1, submittedAt: new Date().toISOString() };
        close(); if (typeof onChange === "function") onChange(item);
      }, function (ex) {
        btn.disabled = false; btn.textContent = label; showErr(ex.message || "Gagal mengirim. Coba lagi.");
      });
    });
    document.body.appendChild(ov);
    document.addEventListener("keydown", onKey, true);
    var first = readOnly ? form.querySelector("[data-x]") : form.elements.text; if (first) first.focus();
  }

  root.DCUjian = { RUBRIK: RUBRIK, prepare: prepare, state: state, statusHtml: statusHtml, actionHtml: actionHtml, extraHtml: extraHtml, handle: handle, openSubmit: openSubmit };
})(window);
