// Headlines that keep coming in between the daily refreshes: data/news.json, collected by scripts/update_news.py
// every time the market job runs (every few hours). Original language, newest first, each linked to its source.
(function () {
  "use strict";
  var host = document.getElementById("news-live"); if (!host) return;
  var css = ".nlive{background:var(--bg2,#15151C);border:1px solid var(--border,#282833);border-radius:14px;overflow:hidden;margin-bottom:26px}" +
    ".nlive .hd{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--dim,#8A857E);padding:11px 16px;border-bottom:1px solid var(--border,#282833)}" +
    ".nlive a.it{display:grid;grid-template-columns:86px 104px minmax(0,1fr);gap:4px 12px;padding:10px 16px;border-bottom:1px solid var(--border,#282833);color:var(--text,#C9C4BD);text-decoration:none;font-size:13px;line-height:1.5}" +
    ".nlive a.it:last-child{border-bottom:0} .nlive a.it:hover{background:var(--bg3,#1E1E27)}" +
    ".nlive .tm{font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--dim,#8A857E);white-space:nowrap}" +
    ".nlive .src{font-size:11.5px;color:var(--gold-dk,#C2A055);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".nlive .tt{color:var(--white,#F6F5F3)} .nlive .new{color:var(--gold-lt,#E6BE55);font-weight:700;margin-right:6px}" +
    "@media(max-width:640px){.nlive a.it{grid-template-columns:auto minmax(0,1fr)}.nlive .tt{grid-column:1/-1}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  function ago(ms) { var m = Math.round((Date.now() - ms) / 60000); if (m < 60) return Math.max(1, m) + " 分钟前"; var h = Math.round(m / 60); return h < 48 ? h + " 小时前" : Math.round(h / 24) + " 天前"; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  fetch("data/news.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    var items = (d && d.items) || []; if (!items.length) return;
    host.appendChild(el("div", "sec-eyebrow", "实时头条 · 自动更新 · Live Headlines"));
    var box = el("div", "nlive"), hd = el("div", "hd");
    hd.appendChild(el("span", null, "服务器每次取数时自动抓取（约 3–4 小时一次），英文原文，点开看全文"));
    hd.appendChild(el("span", null, "上次抓取 " + String(d.updated || "").slice(5)));
    box.appendChild(hd);
    items.slice(0, 12).forEach(function (x) {
      if (!/^https:\/\//.test(String(x.url || ""))) return;
      var a = el("a", "it"); a.href = x.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.appendChild(el("span", "tm", ago(x.ms)));
      a.appendChild(el("span", "src", x.src || ""));
      var tt = el("span", "tt"); if (Date.now() - x.ms < 3 * 3600000) tt.appendChild(el("span", "new", "新")); tt.appendChild(document.createTextNode(x.t)); a.appendChild(tt);
      box.appendChild(a);
    });
    host.appendChild(box);
  }).catch(function () {});
})();
