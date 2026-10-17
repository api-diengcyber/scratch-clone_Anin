// Mengganti emoji bawaan perangkat (yang tampilannya beda-beda di tiap HP/laptop) dengan ikon 3D berwarna
// (Fluent Emoji 3D, Microsoft, lisensi MIT) yang sama di semua perangkat.
// Cara kerja: setelah halaman dimuat, tiap emoji di teks diganti <img class="ic3d">. Teks di dalam kode, textarea,
// dan area editor tidak disentuh. Kalau gambar gagal dimuat (mis. tanpa internet), emoji aslinya dikembalikan.
// Mau pakai ikon dari folder sendiri (offline)? Ubah BASE ke folder gambar, mis. "Assets/emoji/" dengan nama file 1f680_3d.png
(function () {
  if (window.__dccIcons) return; window.__dccIcons = true;

  var BASE = "https://cdn.jsdelivr.net/gh/shuding/fluentui-emoji-unicode/assets/";
  var SUFFIX = "_3d.png";
  // Emoji bergambar (bukan panah/tanda teks biasa). Simbol seperti → ← ✓ ✕ tidak ikut diganti.
  var RE = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)(?:\uFE0F|\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?|[\u{1F3FB}-\u{1F3FF}])*/gu;
  var SKIP = "script,style,textarea,pre,code,input,select,option,title,svg,[contenteditable],.no-icon,.hl,.src";
  var OK = {}, BAD = {};   // OK: emoji → alamat yang berhasil · BAD: emoji yang tidak punya gambar

  function candidates(emoji) {   // nama file bisa dengan/tanpa FE0F, jadi dicoba beberapa kemungkinan
    var cps = Array.from(emoji).map(function (c) { return c.codePointAt(0).toString(16); });
    var stripped = cps.filter(function (c) { return c !== "fe0f"; }), list = [cps.join("-"), stripped.join("-")];
    if (stripped.length === 1) list.push(stripped[0] + "-fe0f");
    return list.filter(function (v, i) { return list.indexOf(v) === i; }).map(function (n) { return BASE + n + SUFFIX; });
  }

  function makeImg(emoji) {
    var img = document.createElement("img"), c = candidates(emoji), i = 0;
    img.className = "ic3d"; img.alt = emoji; img.draggable = false; img.decoding = "async";
    img.addEventListener("load", function () { OK[emoji] = img.src; });
    img.addEventListener("error", function () {
      if (++i < c.length) { img.src = c[i]; return; }
      BAD[emoji] = true;   // semua kemungkinan gagal → kembalikan emoji aslinya
      if (img.parentNode) img.parentNode.replaceChild(document.createTextNode(emoji), img);
    });
    img.src = OK[emoji] || c[0];
    return img;
  }

  var css = document.createElement("style");
  css.textContent = ".ic3d{display:inline-block;width:1.25em;height:1.25em;margin:0 .04em;vertical-align:-.28em;object-fit:contain;" +
    "user-select:none;-webkit-user-drag:none;filter:drop-shadow(0 1px 1px rgba(0,0,0,.18))}";
  document.head.appendChild(css);

  function convertText(t) {
    var p = t.parentElement; if (!p || p.closest(SKIP)) return;
    var d = t.data; RE.lastIndex = 0; if (!RE.test(d)) return; RE.lastIndex = 0;
    var frag = document.createDocumentFragment(), last = 0, m, changed = false;
    while ((m = RE.exec(d))) {
      if (BAD[m[0]]) continue;
      if (m.index > last) frag.appendChild(document.createTextNode(d.slice(last, m.index)));
      frag.appendChild(makeImg(m[0])); last = m.index + m[0].length; changed = true;
    }
    if (!changed) return;
    if (last < d.length) frag.appendChild(document.createTextNode(d.slice(last)));
    t.parentNode.replaceChild(frag, t);
  }

  function convert(node) {
    if (node.nodeType === 3) return convertText(node);
    if (node.nodeType !== 1 || node.closest(SKIP)) return;
    var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null), list = [], n;
    while ((n = w.nextNode())) list.push(n);
    list.forEach(convertText);
  }

  var queue = new Set(), planned = false, mo;
  function flush() {
    planned = false;
    queue.forEach(function (n) { if (n.isConnected) convert(n); }); queue.clear();
    mo.takeRecords();   // abaikan perubahan yang kita buat sendiri
  }
  function start() {
    convert(document.body);
    mo = new MutationObserver(function (recs) {
      recs.forEach(function (r) {
        if (r.type === "characterData") queue.add(r.target);
        else r.addedNodes.forEach(function (n) { queue.add(n); });
      });
      if (!planned) { planned = true; requestAnimationFrame(flush); }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
