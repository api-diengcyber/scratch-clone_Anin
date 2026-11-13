// ============================================================
// TUGAS TAMBAHAN INSTRUKTUR — pembaca & pengumpul bersama untuk halaman siswa
// Dimuat lewat <script src="/shared/js/tugas-tambahan.js"></script> (setelah utils.js).
//
// MEMBACA dari server:  GET /api/tugas-tambahan -> { ok, items: [...] }
// Tiap item berisi: id, title, description, grade, type, points, due, status,
//                   learningPathId, taskId (kosong = tidak ditentukan),
//                   submission (jawaban siswa yang sedang login, null/tidak ada bila belum mengumpulkan):
//                     { id, text, link, status: "dikumpulkan"|"dinilai", submittedAt, nilai, feedback, gradedAt }
// MENGIRIM jawaban:     PUT /api/tugas-tambahan/:id/submission  { text, link } -> { ok, submission }
//                       (membuat jawaban baru atau memperbarui yang sudah ada; ditolak server bila sudah dinilai / ditutup)
// Tidak ada data cadangan di browser: kalau server tidak terjangkau, forTask() menolak (reject)
// dan halaman yang memanggil menampilkan pesan + tombol "Coba lagi". Jawaban siswa juga TIDAK disimpan
// di browser; kalau pengiriman gagal, siswa diberi pesan dan boleh mencoba lagi.
//
// Aturan tampil di halaman sebuah task:
//   • item dengan taskId      → tampil hanya di task itu (dan jalur yang cocok, kalau jalurnya diisi)
//   • item hanya learningPath → tampil di SEMUA task jalur itu
//   • item tanpa jalur & task → TIDAK tampil di halaman task; tetap ada di halaman Tugas
//   • jenjang item harus sama dengan jenjang task (item tanpa jenjang cocok ke semua)
// Item berstatus "draft" tidak pernah dikirim ke siswa.
//
// API:
//   DCTugasTambahan.forTask({ grade: "SD"|"SMP"|"SMK", pathId (string atau array), taskId }) -> Promise<item[]>
//   DCTugasTambahan.meta(item)        -> teks "30 poin · Tenggat 20 Nov 2026" (sudah di-escape)
//   DCTugasTambahan.reload()          -> buang cache, permintaan berikutnya mengambil ulang
//   DCTugasTambahan.state(item)       -> "none" | "submitted" | "graded" | "closed"
//   DCTugasTambahan.statusHtml(item)  -> label status kecil (HTML siap pakai, sudah di-escape)
//   DCTugasTambahan.actionHtml(item, cls) -> tombol "Kumpulkan" / "Lihat jawaban" / "Lihat nilai" ("" bila tidak ada aksi)
//   DCTugasTambahan.handle(event, items, onChange) -> true bila klik itu milik tombol di atas dan form sudah dibuka;
//                                     onChange(item) dipanggil setelah jawaban terkirim, supaya halaman menggambar ulang
//   DCTugasTambahan.openSubmit(item, onChange) -> membuka form pengumpulan langsung
// ============================================================
(function (root) {
  "use strict";
  var esc = (root.DCUtils && root.DCUtils.esc) || function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  };
  var pending = null;   // satu permintaan dipakai bersama semua task di halaman yang sama

  function fetchAll() {
    var token = ""; try { token = localStorage.getItem("authToken") || ""; } catch (e) {}
    return fetch("/api/tugas-tambahan", { headers: { Authorization: "Bearer " + token }, cache: "no-store" }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (d) {
        if (!res.ok || (d && d.ok === false)) {
          var e = new Error((d && d.message) || ("Server bermasalah (HTTP " + res.status + ")")); e.status = res.status; throw e;
        }
        var l = Array.isArray(d) ? d : (d && (d.items || (d.data && (d.data.items || d.data)))) || [];
        return Array.isArray(l) ? l.filter(function (x) { return x && x.title && x.status !== "draft"; }) : [];
      });
    }, function () { var e = new Error("Tidak dapat terhubung ke server."); e.status = 0; throw e; });
  }

  function all() {
    if (!pending) {
      pending = fetchAll();
      pending.catch(function () { pending = null; });   // gagal → panggilan berikutnya mencoba lagi
    }
    return pending;
  }

  var same = function (a, b) { return String(a) === String(b); };
  // pathId boleh berupa array (mis. [id modul, id jalur]) agar item lama yang tersimpan dengan id jalur tetap cocok
  var samePath = function (a, b) { return Array.isArray(b) ? b.some(function (v) { return same(a, v); }) : same(a, b); };
  var dueKey = function (x) { return /^\d{4}-\d{2}-\d{2}/.test(x.due || "") ? x.due.slice(0, 10) : "9999"; };

  function forTask(o) {
    o = o || {};
    return all().then(function (list) {
      return list.filter(function (x) {
        if (x.grade && o.grade && String(x.grade).toUpperCase() !== String(o.grade).toUpperCase()) return false;
        if (x.taskId) return same(x.taskId, o.taskId) && (!x.learningPathId || samePath(x.learningPathId, o.pathId));
        return !!x.learningPathId && samePath(x.learningPathId, o.pathId);
      }).sort(function (a, b) { var A = dueKey(a), B = dueKey(b); return A < B ? -1 : A > B ? 1 : 0; });
    });
  }

  function meta(x) {
    var out = [];
    if (x.points != null && x.points !== "" && Number(x.points) > 0) out.push(esc(x.points) + " poin");
    if (x.status === "ditutup") out.push("Ditutup");
    else if (/^\d{4}-\d{2}-\d{2}/.test(x.due || "")) {
      try { out.push("Tenggat " + esc(new Date(x.due.slice(0, 10) + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }))); }
      catch (e) { out.push("Tenggat " + esc(x.due)); }
    } else out.push("Tanpa tenggat");
    return out.join(" · ");
  }

  // ============================================================
  // PENGUMPULAN JAWABAN SISWA
  // ============================================================
  var STATE_LABEL = { none: "Belum dikumpulkan", submitted: "Sudah dikumpulkan · menunggu nilai", closed: "Ditutup", graded: "Dinilai" };
  var CSS_ID = "dctt-style";

  function subOf(x) { return x && x.submission && typeof x.submission === "object" ? x.submission : null; }
  function scored(sub) { return !!sub && sub.nilai != null && sub.nilai !== ""; }
  function maxOf(x) { return Number(x && x.points) > 0 ? Number(x.points) : null; }
  function state(x) {
    var sub = subOf(x);
    if (scored(sub)) return "graded";
    if (sub) return "submitted";
    return x && x.status === "ditutup" ? "closed" : "none";
  }
  function statusHtml(x) {
    var st = state(x), sub = subOf(x), label = STATE_LABEL[st];
    if (st === "graded") label = "Nilai " + sub.nilai + (maxOf(x) ? "/" + maxOf(x) : "");
    ensureStyle();
    return '<span class="dctt-st dctt-st-' + st + '">' + esc(label) + "</span>";
  }
  function actionHtml(x, cls) {
    var st = state(x);
    if (st === "closed") return "";                                   // ditutup & belum mengumpulkan: tidak ada yang bisa dilakukan
    var label = st === "graded" ? "Lihat nilai" : st === "submitted" ? "Lihat / ubah jawaban" : "📤 Kumpulkan";
    return '<button type="button" class="' + esc(cls || "") + '" data-tt-act="' + esc(x.id) + '">' + label + "</button>";
  }
  function handle(ev, items, onChange) {
    var t = ev && ev.target, b = t && t.closest ? t.closest("[data-tt-act]") : null;
    if (!b) return false;
    var id = b.getAttribute("data-tt-act");
    var item = (items || []).filter(function (x) { return String(x.id) === String(id); })[0];
    if (!item) return false;
    openSubmit(item, onChange);
    return true;
  }

  function fmtTime(iso) {
    try { return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return ""; }
  }
  function fail(msg, status) { var e = new Error(msg); e.status = status; return e; }

  function putSubmission(item, body) {
    var token = ""; try { token = localStorage.getItem("authToken") || ""; } catch (e) {}
    return fetch("/api/tugas-tambahan/" + encodeURIComponent(item.id) + "/submission", {
      method: "PUT",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (d) {
        if (res.status === 401) throw fail("Sesi login habis. Silakan masuk lagi.", 401);
        if ([404, 405, 501].indexOf(res.status) >= 0 && !(d && d.message)) throw fail("Fitur pengumpulan belum aktif di server.", res.status);
        if (!res.ok || (d && d.ok === false)) throw fail((d && d.message) || ("Server bermasalah (HTTP " + res.status + ")"), res.status);
        var s = d && (d.submission || d.item || (d.data && (d.data.submission || d.data)));
        return s && typeof s === "object" ? s : null;
      });
    }, function () { throw fail("Tidak dapat terhubung ke server. Periksa koneksi internet.", 0); });
  }

  function ensureStyle() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement("style");
    st.id = CSS_ID;
    st.textContent =
      ".dctt-st{display:inline-block;padding:2px 9px;border-radius:10px;font:700 11px/1.5 'Trebuchet MS',Arial,sans-serif}" +
      ".dctt-st-none{background:#fff4d6;color:#8a5a00}.dctt-st-submitted{background:#dfe9ff;color:#2a4fa8}" +
      ".dctt-st-graded{background:#e3f8ec;color:#1a7f45}.dctt-st-closed{background:#eceff6;color:#5b6480}" +
      ".dctt-ov{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(20,26,60,.55)}" +
      ".dctt-box{position:relative;width:100%;max-width:520px;max-height:92vh;overflow:auto;background:#fff;color:#2b3350;border-radius:20px;padding:18px 20px;" +
        "font:14px/1.5 'Trebuchet MS',Arial,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.35)}" +
      ".dctt-box h3{margin:0 28px 4px 0;font-size:18px}.dctt-box p{margin:4px 0}" +
      ".dctt-x{position:absolute;top:10px;right:12px;border:0;background:#eef1ff;color:#5a6bd8;width:30px;height:30px;border-radius:50%;font-size:15px;cursor:pointer}" +
      ".dctt-meta{color:#6b7494;font-size:12px}.dctt-desc{white-space:pre-wrap;background:#f4f7ff;border-radius:12px;padding:9px 11px;font-size:13px}" +
      ".dctt-box label{display:block;margin-top:12px;font-weight:700;font-size:13px}" +
      ".dctt-box textarea,.dctt-box input{display:block;width:100%;margin-top:4px;padding:9px 11px;border:2px solid #d9e0ff;border-radius:12px;font:inherit;color:inherit;background:#fff}" +
      ".dctt-box textarea{resize:vertical;min-height:110px}" +
      ".dctt-box textarea:focus,.dctt-box input:focus{outline:3px solid #8fb4ff;outline-offset:1px;border-color:#5a8df0}" +
      ".dctt-box [readonly]{background:#f4f6fb}" +
      ".dctt-err{color:#b3261e;font-size:13px;font-weight:700}" +
      ".dctt-res{margin-top:12px;padding:10px 12px;border-radius:12px;background:#e3f8ec;color:#14663a}" +
      ".dctt-res b{font-size:16px}.dctt-res p{white-space:pre-wrap;color:#2b3350;margin-top:6px}" +
      ".dctt-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}" +
      ".dctt-foot button{border:0;border-radius:12px;padding:9px 16px;font:700 14px 'Trebuchet MS',Arial,sans-serif;cursor:pointer;background:#eef1ff;color:#5a6bd8}" +
      ".dctt-foot button[type=submit]{background:#2d8cff;color:#fff}.dctt-foot button:disabled{opacity:.55;cursor:wait}" +
      ".dctt-box button:focus-visible{outline:3px solid #2d8cff;outline-offset:2px}";
    document.head.appendChild(st);
  }

  function openSubmit(item, onChange) {
    ensureStyle();
    var opener = document.activeElement;
    var sub = subOf(item), st = state(item), locked = st === "graded" || st === "closed";
    var ov = document.createElement("div");
    ov.className = "dctt-ov";
    var res = "";
    if (st === "graded") {
      res = '<div class="dctt-res"><b>Nilaimu: ' + esc(sub.nilai) + (maxOf(item) ? " / " + esc(maxOf(item)) : "") + "</b>" +
        (sub.feedback ? "<p>💬 " + esc(sub.feedback) + "</p>" : "") + "</div>";
    }
    ov.innerHTML =
      '<form class="dctt-box" role="dialog" aria-modal="true" aria-labelledby="dcttT" novalidate>' +
        '<button type="button" class="dctt-x" data-x aria-label="Tutup">✕</button>' +
        '<h3 id="dcttT">' + esc(item.title) + "</h3>" +
        '<p class="dctt-meta">' + meta(item) + (sub && sub.submittedAt ? " · Dikumpulkan " + esc(fmtTime(sub.submittedAt)) : "") + "</p>" +
        (item.description ? '<p class="dctt-desc">' + esc(item.description) + "</p>" : "") +
        res +
        '<label for="dcttText">Jawabanmu</label>' +
        '<textarea id="dcttText" name="text" maxlength="3000" placeholder="Tulis jawaban atau ceritakan hasil kerjamu…"' + (locked ? " readonly" : "") + ">" + esc(sub && sub.text || "") + "</textarea>" +
        '<label for="dcttLink">Link hasil kerja (boleh dikosongkan)</label>' +
        '<input id="dcttLink" name="link" type="url" maxlength="500" placeholder="https://…" value="' + esc(sub && sub.link || "") + '"' + (locked ? " readonly" : "") + ">" +
        '<p class="dctt-err" role="alert" hidden></p>' +
        (st === "closed" ? '<p class="dctt-meta">Tugas ini sudah ditutup.</p>' : "") +
        '<div class="dctt-foot"><button type="button" data-x>Tutup</button>' +
          (locked ? "" : '<button type="submit">' + (sub ? "Simpan perubahan" : "Kirim jawaban") + "</button>") + "</div>" +
      "</form>";

    var form = ov.firstChild, err = form.querySelector(".dctt-err");
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
      if (locked) return;
      var text = form.elements.text.value.trim(), link = form.elements.link.value.trim();
      if (!text && !link) return showErr("Isi jawaban atau link hasil kerjamu dulu ya.");
      if (link && !/^https?:\/\/\S+$/i.test(link)) return showErr("Link harus diawali http:// atau https://");
      showErr("");
      var btn = form.querySelector("[type=submit]"), label = btn.textContent;
      btn.disabled = true; btn.textContent = "Mengirim…";
      putSubmission(item, { text: text, link: link }).then(function (s) {
        item.submission = s || { text: text, link: link, status: "dikumpulkan", submittedAt: new Date().toISOString() };
        close();
        if (typeof onChange === "function") onChange(item);
      }, function (ex) {
        btn.disabled = false; btn.textContent = label;
        showErr(ex.message || "Gagal mengirim. Coba lagi.");
      });
    });

    document.body.appendChild(ov);
    document.addEventListener("keydown", onKey, true);
    var first = locked ? form.querySelector("[data-x]") : form.elements.text;
    if (first) first.focus();
  }

  root.DCTugasTambahan = {
    forTask: forTask, meta: meta, reload: function () { pending = null; },
    state: state, statusHtml: statusHtml, actionHtml: actionHtml, handle: handle, openSubmit: openSubmit
  };
})(window);
