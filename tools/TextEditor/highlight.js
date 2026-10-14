// ============================================================
// PEWARNA KODE SEDERHANA — HTML, CSS, Python & PHP
// Mengubah teks kode menjadi HTML berwarna (<span class="tk-...">).
// Bahasa yang ada: html, css, python, php. Bahasa baru: tambahkan satu fungsi lagi di bawah.
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

  // ---------- PYTHON ----------
  const PY_KW = new Set("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
  const PY_CONST = new Set(["True", "False", "None"]);
  const PY_BUILTIN = new Set("print input len range int float str bool list dict set tuple sum min max abs round sorted reversed enumerate zip map filter open type isinstance super self".split(" "));

  function python(src) {
    const re = /(#[^\n]*)|((?:[rRbBfFuU]{0,2})(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?))|(@[A-Za-z_][\w.]*)|(\b\d+\.?\d*(?:[eE][+-]?\d+)?\b|\.\d+\b)|([A-Za-z_]\w*)/g;
    let out = "", last = 0, prev = "", m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      last = m.index + m[0].length;
      if (m[1]) out += span("com", m[0]);
      else if (m[2]) out += span("str", m[0]);
      else if (m[3]) out += span("fn", m[0]);
      else if (m[4]) out += span("num", m[0]);
      else {
        const w = m[5];
        if (PY_KW.has(w)) out += span("kw", w);
        else if (PY_CONST.has(w)) out += span("cn", w);
        else if (prev === "def" || prev === "class") out += span("fn", w);
        else if (PY_BUILTIN.has(w)) out += span("bi", w);
        else if (src[last] === "(") out += span("fn", w);
        else out += esc(w);
        prev = w;
        continue;
      }
      prev = "";
    }
    return out + esc(src.slice(last));
  }

  // ---------- PHP ----------
  // Di luar <?php ... ?> dianggap HTML biasa, di dalamnya diwarnai sebagai PHP.
  const PHP_KW = new Set("echo print if else elseif while for foreach as function return class new public private protected static const array isset empty unset include require require_once include_once switch case break continue default try catch throw finally extends implements namespace use fn match abstract interface trait global do list and or xor".split(" "));
  const PHP_CONST = new Set(["true", "false", "null"]);

  function phpCode(src) {
    const re = /((?:\/\/|#)(?:(?!\?>)[^\n])*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\]|\\[\s\S])*"?|'(?:[^'\\]|\\[\s\S])*'?)|(\$[A-Za-z_]\w*)|(\b\d+\.?\d*\b)|([A-Za-z_]\w*)/g;
    let out = "", last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      last = m.index + m[0].length;
      if (m[1]) out += span("com", m[0]);
      else if (m[2]) out += span("str", m[0]);
      else if (m[3]) out += span("var", m[0]);
      else if (m[4]) out += span("num", m[0]);
      else {
        const w = m[5], lw = w.toLowerCase();
        if (PHP_KW.has(lw)) out += span("kw", w);
        else if (PHP_CONST.has(lw)) out += span("cn", w);
        else if (/^\s*\(/.test(src.slice(last, last + 8))) out += span("fn", w);
        else out += esc(w);
      }
    }
    return out + esc(src.slice(last));
  }

  function php(src) {
    const re = /<\?(?:php|=)?[\s\S]*?(?:\?>|$)/g;
    let out = "", last = 0, m;
    while ((m = re.exec(src))) {
      out += html(src.slice(last, m.index));
      last = m.index + m[0].length;
      const open = /^<\?(?:php|=)?/.exec(m[0])[0];
      let body = m[0].slice(open.length), close = "";
      if (body.endsWith("?>")) { close = "?>"; body = body.slice(0, -2); }
      out += span("doc", open) + phpCode(body) + span("doc", close);
    }
    return out + html(src.slice(last));
  }

  window.Highlight = { html: html, css: css, python: python, php: php };
})();
