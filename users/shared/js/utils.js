// ============================================================
// UTILITAS BERSAMA — dimuat lewat <script src="/shared/js/utils.js"></script>
// SEBELUM script lain yang memakainya.
//
// Satu-satunya implementasi esc() di seluruh proyek. Jangan menulis ulang
// di file lain; pakai:  const esc = window.DCUtils.esc;
//
// esc() meng-escape & < > " ' sehingga aman dipakai di dalam konten elemen
// maupun di dalam atribut HTML (bertanda kutip ganda atau tunggal).
// null / undefined menjadi string kosong.
// ============================================================
(function (root) {
  "use strict";

  var ESC_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ESC_MAP[ch];
    });
  }

  root.DCUtils = root.DCUtils || {};
  root.DCUtils.esc = esc;
})(window);
