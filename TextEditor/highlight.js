// ============================================================
// PEWARNA KODE SEDERHANA — HTML & CSS
// Mengubah teks kode menjadi HTML berwarna (<span class="tk-...">).
// Untuk bahasa baru (misalnya PHP): tambahkan satu fungsi lagi di bawah.
// ============================================================
(function () {

  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const span = (cls, s) => s ? '<span class="tk-' + cls + '">' + esc(s) + "</span>" : "";

  // ---------- HTML ----------
  function htmlTag(t) {
    if (t.startsWith("<!--")) return span("com", t);
    if (/^<!doctype/i.test(t)) return span("doc", t);
    const m = /^(<\/?)([a-zA-Z][^\s\/>]*)([\s\S]*?)(\/?>?)$/.exec(t);
    if (!m) return esc(t);
    let attrs = "", a;
    const re = /(\s+)|([^\s=]+)(\s*=\s*)?("[^"]*"?|'[^']*'?|[^\s"'=]+)?/g;
    while ((a = re.exec(m[3])) && a[0] !== "") {
      if (a[1]) attrs += esc(a[1]);
      else attrs += span("attr", a[2]) + (a[3] ? span("pun", a[3]) : "") + (a[4] ? span("str", a[4]) : "");
    }
    return span("tag", m[1] + m[2]) + attrs + span("tag", m[4]);
  }

  function html(src) {
    const re = /<!--[\s\S]*?(?:-->|$)|<!doctype[^>]*>?|<\/?[a-zA-Z][^>]*>?/gi;
    let out = "", last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index)) + htmlTag(m[0]);
      last = m.index + m[0].length;
    }
    return out + esc(src.slice(last));
  }

  // ---------- CSS ----------
  function cssValue(t) {
    const re = /(#[0-9a-fA-F]{3,8}\b)|(-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg)?)/g;
    let out = "", last = 0, m;
    while ((m = re.exec(t))) {
      out += span("val", t.slice(last, m.index)) + span("num", m[0]);
      last = m.index + m[0].length;
    }
    return out + span("val", t.slice(last));
  }

  function css(src) {
    const re = /(\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|([{};:])|([^{};:"'\/]+|\/)/g;
    let out = "", inBlock = false, inValue = false, m;
    while ((m = re.exec(src)) && m[0] !== "") {
      if (m[1]) out += span("com", m[1]);
      else if (m[2]) out += span("str", m[2]);
      else if (m[3]) {
        const c = m[3];
        if (c === "{") { inBlock = true; inValue = false; }
        else if (c === "}") { inBlock = false; inValue = false; }
        else if (c === ";") { inValue = false; }
        else if (c === ":" && inBlock && !inValue) { inValue = true; }
        out += span(!inBlock && c === ":" ? "sel" : "pun", c);
      } else {
        out += !inBlock ? span("sel", m[4]) : !inValue ? span("prop", m[4]) : cssValue(m[4]);
      }
    }
    return out;
  }

  window.Highlight = { html: html, css: css };
})();
