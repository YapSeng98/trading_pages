// The gold page's "驱动因素 · What's moving gold" card: gold next to the usual drivers (dollar, yields, real yield, oil,
// silver, S&P 500) from data/drivers.json (scripts/update_drivers.py, daily closes): this week's headwinds and
// tailwinds in one line, then each driver's latest close, 1-day / 1-week / 1-month change, its last 60 closes, and how
// gold's daily moves lined up with it over 60 trading days. Context, never a signal: research/world (T4) found that
// trading the rule only when real yields agreed did not help. Also published as window.GoldDrivers for 问 Claude.
(function () {
  "use strict";
  var box = document.getElementById("drivers"); if (!box) return;
  var EN = window.LANG === "en", tx = function (zh, en) { return EN ? en : zh; };
  var NAME = {
    gold: [tx("黄金（期货）", "Gold (futures)"), "$"], dxy: [tx("美元指数", "US dollar index"), ""], us10y: [tx("美债 10 年收益率", "US 10-year yield"), "%"],
    real10y: [tx("10 年实际收益率（扣通胀）", "10-year real yield (after inflation)"), "%"], oil: [tx("原油（WTI）", "Crude oil (WTI)"), "$"],
    silver: [tx("白银", "Silver"), "$"], spx: [tx("标普 500", "S&P 500"), ""]
  };
  // the textbook pressure on gold when the driver rises: dollar and yields up weigh on gold; silver usually moves with it
  var PUSH = { dxy: -1, us10y: -1, real10y: -1 };
  var css = "#drivers .drv-read{font-size:14px;line-height:1.7;color:var(--white,#F6F5F3);margin:2px 0 14px}" +
    "#drivers .drv-read b.up{color:var(--bull,#34D399)}#drivers .drv-read b.dn{color:var(--bear,#F87171)}" +
    "#drivers .drv-rows{display:grid;gap:2px}" +
    "#drivers .drv-row{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,.9fr) repeat(3,minmax(0,.65fr)) minmax(0,1fr) minmax(0,1.3fr);align-items:center;gap:10px;padding:9px 10px;border-radius:12px}" +
    "#drivers .drv-row:not(.drv-head):hover{background:rgba(255,255,255,.03)}" +
    "#drivers .drv-head{font-size:11px;color:var(--dim,#8A857E);padding-top:0;padding-bottom:4px}" +
    "#drivers .drv-nm b{display:block;font-size:13.5px;color:var(--white,#F6F5F3);font-weight:600}#drivers .drv-nm small{font:400 11px var(--f-m,'IBM Plex Mono',monospace);color:var(--dim,#8A857E)}" +
    "#drivers .drv-v{font:600 14px var(--f-m,'IBM Plex Mono',monospace);color:var(--white,#F6F5F3);font-variant-numeric:tabular-nums}" +
    "#drivers .drv-c{font:500 12.5px var(--f-m,'IBM Plex Mono',monospace);font-variant-numeric:tabular-nums;color:var(--text,#C9C4BD)}#drivers .drv-c.up{color:var(--bull,#34D399)}#drivers .drv-c.dn{color:var(--bear,#F87171)}" +
    "#drivers .drv-sp svg{display:block;width:100%;height:28px}" +
    "#drivers .drv-k{display:grid;grid-template-columns:minmax(0,1fr);gap:4px}#drivers .drv-k .bar{position:relative;height:6px;border-radius:3px;background:rgba(255,255,255,.07)}" +
    "#drivers .drv-k .bar::after{content:'';position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:rgba(255,255,255,.25)}#drivers .drv-k .bar i{position:absolute;top:0;bottom:0;border-radius:3px}" +
    "#drivers .drv-k span{font-size:11px;color:var(--dim,#8A857E)}#drivers .drv-k span b{color:var(--text,#C9C4BD);font-weight:600}" +
    "#drivers .drv-gold{background:rgba(212,167,44,.06);border:1px solid rgba(212,167,44,.18)}" +
    "#drivers .drv-ft{font-size:11.5px;line-height:1.65;color:var(--dim,#8A857E);margin-top:12px}" +
    "@media(max-width:760px){#drivers .drv-head{display:none}#drivers .drv-row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:'nm v' 'ch ch' 'sp k';row-gap:6px;padding:12px 10px;border-top:1px solid rgba(255,255,255,.05)}" +
    "#drivers .drv-nm{grid-area:nm}#drivers .drv-v{grid-area:v;text-align:right}#drivers .drv-chs{grid-area:ch;display:flex;gap:14px}#drivers .drv-sp{grid-area:sp}#drivers .drv-k{grid-area:k;min-width:120px}" +
    "#drivers .drv-c::before{content:attr(data-l);color:var(--dim,#8A857E);margin-right:4px;font-family:inherit}}" +
    "@media(min-width:761px){#drivers .drv-chs{display:contents}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) { var v = attrs[k]; if (v === null || v === undefined) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v); }
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  var NF = {}; function nf(d) { return NF[d] || (NF[d] = new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })); }
  function val(s) { var u = NAME[s.id] ? NAME[s.id][1] : "", d = s.last >= 1000 ? 0 : s.last >= 100 ? 1 : 2; return (u === "$" ? "$" : "") + nf(d).format(s.last) + (u === "%" ? "%" : ""); }
  function chg(s, v) {
    if (typeof v !== "number") return { t: "—", c: "" };
    if (s.kind === "pp") { var bp = Math.round(v * 100); return { t: (bp > 0 ? "+" : bp < 0 ? "−" : "") + Math.abs(bp) + " bp", c: bp > 0 ? "up" : bp < 0 ? "dn" : "" }; }
    return { t: (v > 0 ? "+" : v < 0 ? "−" : "") + nf(Math.abs(v) >= 10 ? 1 : 2).format(Math.abs(v)) + "%", c: v > 0 ? "up" : v < 0 ? "dn" : "" };
  }
  function link(c) {
    if (typeof c !== "number") return tx("数据不足", "not enough data");
    return c >= 0.5 ? tx("和金价同向，很紧", "moves with gold, closely") : c >= 0.2 ? tx("和金价同向", "moves with gold") : c > -0.2 ? tx("关系很弱", "little link") : c > -0.5 ? tx("和金价反向", "moves against gold") : tx("和金价反向，很紧", "moves against gold, closely");
  }
  function spark(vals) {
    var NS = "http://www.w3.org/2000/svg", W = 120, H = 28, svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("aria-hidden", "true");
    if (!vals || vals.length < 2) return svg;
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), r = hi - lo || 1;
    var pts = vals.map(function (v, i) { return (i * W / (vals.length - 1)).toFixed(1) + "," + (2 + (H - 4) * (1 - (v - lo) / r)).toFixed(1); });
    var pl = document.createElementNS(NS, "polyline"); pl.setAttribute("points", pts.join(" ")); pl.setAttribute("fill", "none"); pl.setAttribute("stroke", "var(--gold-lt,#E6BE55)"); pl.setAttribute("stroke-width", "1.5"); pl.setAttribute("vector-effect", "non-scaling-stroke"); pl.setAttribute("stroke-linejoin", "round");
    svg.appendChild(pl); return svg;
  }
  function read(gold, rows) {      // this week: which drivers pushed against gold and which helped, by the textbook direction
    var head = [], tail = [];
    rows.forEach(function (s) {
      var p = PUSH[s.id]; if (!p || typeof s.chg1w !== "number" || s.chg1w === 0) return;
      var item = NAME[s.id][0] + " " + chg(s, s.chg1w).t;
      if (s.chg1w * p < 0) head.push(item); else tail.push(item);
    });
    var g = chg(gold, gold.chg1w), out = [tx("这一周金价 ", "This week gold "), h("b", { class: g.c, text: g.t })];
    if (head.length) out.push(tx("。不利因素：", ". Headwinds: ") + head.join(tx("、", ", ")));
    if (tail.length) out.push(tx(head.length ? "；有利因素：" : "。有利因素：", head.length ? "; tailwinds: " : ". Tailwinds: ") + tail.join(tx("、", ", ")));
    out.push(tx("（按教科书的方向：美元和收益率上升通常压金价）。", " (by the textbook direction: a rising dollar and rising yields usually weigh on gold)."));
    return out;
  }
  function render(d) {
    var rows = (d.series || []).filter(function (s) { return NAME[s.id]; }), gold = rows.filter(function (s) { return s.id === "gold"; })[0];
    if (!gold) return;
    var dates = rows.map(function (s) { return s.date; }).sort();
    var chip = document.getElementById("drv-at"); if (chip) chip.textContent = tx("收盘到 ", "closes to ") + dates[dates.length - 1];
    var body = document.getElementById("drv-body"); while (body.firstChild) body.removeChild(body.firstChild);
    body.appendChild(h("p", { class: "drv-read" }, read(gold, rows)));
    var list = h("div", { class: "drv-rows", role: "table", "aria-label": tx("黄金和它的驱动因素", "Gold and its drivers") });
    list.appendChild(h("div", { class: "drv-row drv-head", role: "row" }, [tx("品种", "Market"), tx("最新收盘", "Latest close"), tx("1 天", "1 day"), tx("1 周", "1 week"), tx("1 个月", "1 month"), tx("近 60 天", "Last 60 days"), tx("和金价的关系（60 天）", "Link with gold (60 days)")].map(function (t) { return h("span", { role: "columnheader", text: t }); })));
    [gold].concat(rows.filter(function (s) { return s.id !== "gold"; })).forEach(function (s) {
      var c1 = chg(s, s.chg1d), c2 = chg(s, s.chg1w), c3 = chg(s, s.chg1m), isG = s.id === "gold";
      var k = isG ? h("div", { class: "drv-k" }, [h("span", { text: tx("参照", "the reference") })]) : (function () {
        var c = s.corr60, bar = h("div", { class: "bar" }), i = h("i");
        if (typeof c === "number") { var w = Math.min(1, Math.abs(c)) * 50; i.style.width = w + "%"; i.style.left = c >= 0 ? "50%" : (50 - w) + "%"; i.style.background = c >= 0 ? "var(--gold,#D4A72C)" : "#7CC4FF"; bar.appendChild(i); }
        return h("div", { class: "drv-k", title: tx("相关系数：60 天 ", "Correlation: 60 days ") + (c === null || c === undefined ? "—" : c) + tx("，250 天 ", ", 250 days ") + (typeof s.corr250 === "number" ? s.corr250 : "—") }, [bar, h("span", null, [h("b", { text: typeof c === "number" ? (c > 0 ? "+" : "") + c.toFixed(2) : "—" }), " " + link(c)])]);
      })();
      list.appendChild(h("div", { class: "drv-row" + (isG ? " drv-gold" : ""), role: "row" }, [
        h("div", { class: "drv-nm" }, [h("b", { text: NAME[s.id][0] }), h("small", { text: s.symbol + " · " + s.date + (s.stale ? tx(" · 未更新", " · not updated") : "") })]),
        h("div", { class: "drv-v", text: val(s) }),
        h("div", { class: "drv-chs" }, [h("span", { class: "drv-c " + c1.c, "data-l": tx("1天", "1d"), text: c1.t }), h("span", { class: "drv-c " + c2.c, "data-l": tx("1周", "1w"), text: c2.t }), h("span", { class: "drv-c " + c3.c, "data-l": tx("1月", "1m"), text: c3.t })]),
        h("div", { class: "drv-sp" }, [spark(s.spark)]), k]));
    });
    body.appendChild(list);
    body.appendChild(h("p", { class: "drv-ft", text: tx("参考，不是信号。「和金价的关系」是过去 60 个交易日里金价和它每天涨跌的相关系数（−1 到 +1，鼠标停在上面可看 250 天的），这种关系会变：回放里只在实际收益率配合时才做，并没有让规则更好（2011–2018 年配合的单子平均 −0.08R，其余 +0.46R；research/world T4），金价和实际收益率的关系在 2022–2023 年基本断了。数据：Yahoo Finance 日收盘（黄金用 COMEX 期货 GC=F，和现货每天差不多），实际收益率用 FRED 的 DFII10；更新于 ",
      "Context, not a signal. «Link with gold» is the correlation of gold's daily moves with each driver's over the last 60 trading days (−1 to +1; hover for 250 days), and these links change: in the replay, trading only when real yields agreed did not make the rule better (2011–2018: −0.08R a trade for those against +0.46R for the rest; research/world T4), and gold's link with real yields largely broke in 2022–2023. Data: Yahoo Finance daily closes (gold is COMEX futures GC=F, close to spot day to day), real yield from FRED DFII10; updated ") + d.updated + tx("。", ".") }));
  }
  fetch("data/drivers.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    window.GoldDrivers = d; render(d);
  }).catch(function () { var b = document.getElementById("drv-body"); if (b) b.textContent = tx("驱动因素的数据暂时读不到。", "The drivers data cannot be read right now."); });
})();
