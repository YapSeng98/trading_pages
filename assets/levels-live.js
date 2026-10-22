// The key-level boxes on news.html and risk.html (.lvls) are written at the 10:10 SGT refresh, against that
// morning's price. This marks them against the live price from assets/gold-bar.js ("goldbar:update"): the price box
// shows the price now and how far it has moved since the text was written, and every other box says which of its
// levels price has broken through since then and how far the nearest one is. The written text is not changed.
(function () {
  "use strict";
  var box = document.querySelector(".lvls"); if (!box) return;
  var st = document.createElement("style");
  st.textContent = ".lvl .lv-x{font:600 11.5px/1.5 'Noto Sans SC',sans-serif;margin-top:7px;color:var(--text,#C9C4BD)}" +
    ".lvl .lv-x .dn{color:var(--bear,#F87171)} .lvl .lv-x .up{color:var(--bull,#34D399)} .lvl .lv-x .dim{color:var(--dim,#8A857E);font-weight:500}" +
    ".lvl.lv-gone{opacity:.72} .lvl.lv-cur{border-color:rgba(212,167,44,.45)}";
  document.head.appendChild(st);
  function fmt(v) { return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function nums(s) { return (String(s || "").replace(/,/g, "").match(/\$\s*\d+(?:\.\d+)?/g) || []).map(function (x) { return +x.replace(/[^\d.]/g, ""); }); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  var cells = [].slice.call(box.querySelectorAll(".lvl")).map(function (c) {
    var k = c.querySelector(".k"), v = c.querySelector(".v");
    return { c: c, k: k, v: v, cur: !!(k && /现价/.test(k.textContent)), levels: v ? nums(v.textContent) : [], v0: v ? v.textContent : "", k0: k ? k.textContent : "" };
  }).filter(function (x) { return x.v; });
  var curCell = cells.filter(function (x) { return x.cur; })[0];
  var W = curCell && curCell.levels.length ? curCell.levels[0] : null;
  if (W === null) return;
  var written = (curCell.k0.match(/\d{1,2}:\d{2}/) || [""])[0];
  document.addEventListener("goldbar:update", function (e) {
    var L = e.detail && e.detail.price; if (typeof L !== "number" || !isFinite(L)) return;
    var d = L - W;
    curCell.c.classList.add("lv-cur");
    curCell.k.textContent = "⭐ 现价（实时）";
    curCell.v.textContent = "$" + fmt(L);
    var cx = curCell.c.querySelector(".lv-x") || curCell.c.appendChild(el("div", "lv-x"));
    cx.innerHTML = "";
    cx.appendChild(el("span", "dim", "写稿时" + (written ? " " + written : "") + " $" + fmt(W) + "，之后 "));
    cx.appendChild(el("span", d >= 0 ? "up" : "dn", (d >= 0 ? "▲ +$" : "▼ −$") + fmt(Math.abs(d))));
    cells.forEach(function (x) {
      if (x.cur || !x.levels.length) return;
      var crossed = x.levels.filter(function (lv) { return (lv - W) * (lv - L) < 0; });
      var near = x.levels.slice().sort(function (a, b) { return Math.abs(a - L) - Math.abs(b - L); })[0];
      var t = x.c.querySelector(".lv-x") || x.c.appendChild(el("div", "lv-x"));
      t.innerHTML = "";
      if (crossed.length) t.appendChild(el("span", d < 0 ? "dn" : "up", (d < 0 ? "已跌破 " : "已突破 ") + crossed.map(function (v) { return "$" + fmt(v); }).join("、") + " · "));
      t.appendChild(el("span", "dim", (crossed.length === x.levels.length ? "现在在现价" + (d < 0 ? "上方" : "下方") + "，" : "") + "最近的离现价 " + (near - L >= 0 ? "+$" : "−$") + fmt(Math.abs(near - L))));
      x.c.classList.toggle("lv-gone", crossed.length === x.levels.length);
    });
  });
})();
