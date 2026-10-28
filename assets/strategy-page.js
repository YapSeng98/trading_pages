// strategy.html: the one rule the site trades, and every number about it read from the replay and record files, so
// the page can never quote a figure the research does not have. Rewritten 2026-10-28: the old page was a textbook
// handbook (patterns as "the most reliable" signals, range trading, Fibonacci pullbacks, 1-2% risk a trade) that the
// replay contradicted.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) { var v = attrs[k]; if (v === null || v === undefined || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v); }
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  var R = function (v) { return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "R"; };
  var pct = function (v, d) { return (Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0)) + "%"; };
  var ym = function (s) { var p = String(s).split("-"); return p[0] + " 年 " + +p[1] + " 月"; };
  var get = function (u) { return fetch(u, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  function table(el, head, rows) {
    clear(el);
    el.appendChild(h("thead", null, [h("tr", null, head.map(function (x) { return h("th", { text: x }); }))]));
    el.appendChild(h("tbody", null, rows));
  }
  // green only where there is an edge: the "no edge" table shows losses in red and the rest plain
  function cellR(v, extra, plain) { return h("td", { class: "n " + (v > 0 && !plain ? "up" : v < 0 ? "dn" : "") }, [R(v), extra ? h("small", { text: extra }) : null]); }

  Promise.all([get("data/xau-backtest.json"), get("data/xau-signals.json"), get("data/btc-backtest.json"), get("research/forex/result.json")]).then(function (res) {
    var bt = res[0], rec = res[1], btc = res[2], fx = res[3];
    if (!bt || !bt.rules || !bt.rules.go3r) { $("pf-main").textContent = "回放结果读取失败，刷新一下再试。"; return; }
    var g = bt.rules.go3r, t = bt.rules.gotrail, pr = bt.proof || {};
    // ---- the evidence ----
    $("pf-main").textContent = "回放 " + bt.from + " 到 " + bt.to + "（" + bt.years + " 年，真实现货金 1 分钟数据，含点差和隔夜利息）：" + g.n + " 笔，赢 " + pct(g.win) + "，平均每笔 " + R(g.avgR) +
      "（95% 范围 " + R(g.lo) + " 到 " + R(g.hi) + "），一年约 " + Math.round(g.perYear) + " 笔、" + R(g.rPerYear).replace("R", "R/年") + "；最深回撤 " + g.maxDD + "R，最长连亏 " + g.streak + " 笔。";
    table($("pf-seg"), ["阶段", "笔数", "胜率", "平均每笔"], g.segments.map(function (s) {
      return h("tr", null, [h("td", { text: s.label }), h("td", { class: "n", text: String(s.n) }), h("td", { class: "n", text: pct(s.win) }), cellR(s.avgR)]);
    }).concat(t ? [h("tr", { class: "main" }, [h("td", { text: "跟踪止损出场（全部年份）" }), h("td", { class: "n", text: String(t.n) }), h("td", { class: "n", text: pct(t.win) }), cellR(t.avgR)])] : []));
    var notes = clear($("pf-notes")), add = function (s) { notes.appendChild(h("li", { text: s })); };
    add("胜率只有三成左右：靠少数几笔赚到 3R，大多数是小亏（赚的那些平均 " + R(g.avgWin) + "，亏的那些平均 " + R(g.avgLoss) + "）。");
    if (pr.pValue) add("检验：随机进场 400 次，" + (pr.randomBeat ? Math.round(pr.randomBeat * 100) + "% 比它好" : "没有一次比它好") + "；只随机选方向，" + Math.round(pr.sideBeat * 100) + "% 比它好；只随机选时机，" + Math.round(pr.timingBeat * 100) + "% 比它好。p = " + pr.pValue + "。考虑到一共看过约 50 个变体，可信度约 " + Math.round(pr.deflatedSharpe * 100) + "%：小优势，没有完全证明。");
    add("优势主要来自强趋势的年份：定规则前没看过的 " + g.segments[0].label.split("（")[0] + " 只有 " + R(g.segments[0].avgR) + "，不显著；2024–2026 年金价大涨，这条规则赚得最多。");
    if (rec && rec.summary) { var z = rec.summary; add("实盘纸面记录（" + String(rec.since).slice(0, 10) + " 起，没有回放的事后之明）：" + z.signals + " 个信号，" + z.taken + " 笔开仓，" + z.closed + " 笔已结束" + (z.closed ? "，合计 " + R(z.totalR) : "") + (z.open ? "，" + z.open + " 笔持有中" : "") + "。" ); }
    // ---- risk per trade ----
    $("rk-main").textContent = "回放里最深回撤 " + g.maxDD + "R、最长连亏 " + g.streak + " 笔。按每笔冒的风险，换算成账户会经历的回撤：";
    table($("rk-tab"), ["每笔风险", "连亏 " + g.streak + " 笔", "最深回撤", ""], [0.25, 0.5, 1, 2].map(function (r) {
      var dd = g.maxDD * r, note = r === 0.5 ? "黄金页默认" : dd > 33 ? "账户回撤超过三分之一" : "";
      return h("tr", { class: r === 0.5 ? "main" : null }, [h("td", { text: r + "%" }), h("td", { class: "n", text: "−" + pct(g.streak * r, 1) }), h("td", { class: "n" + (dd > 33 ? " dn" : ""), text: "−" + pct(dd, 1) }), h("td", { text: note })]);
    }));
    $("disc-stop").lastChild.textContent = "：纸面记录从高点回落超过 " + (pr.maxDD || g.maxDD) + "R（回放里最深的回撤），就先停止用真钱做，查清楚原因。黄金页的「成绩记录」里有健康检查。";
    // ---- what did not work ----
    var Q = bt.rules, st = bt.shortTerm && bt.shortTerm.rules || {}, own = bt.patterns && bt.patterns.own && bt.patterns.own["1H"], rows = [];
    var row = function (name, v, n, extra) { if (typeof v !== "number") return; rows.push(h("tr", null, [h("td", null, [name, extra ? h("small", { text: extra }) : null]), cellR(v, n ? n + " 笔" : null, true)])); };
    if (Q.against) row("逆着三个大周期做（抄底、摸顶）", Q.against.avgR, Q.against.n);
    if (Q.early) row("大方向一致就进，不等小周期转过来", Q.early.avgR, Q.early.n);
    if (Q.tight) row("止损放小（1.5 倍小时波幅）", Q.tight.avgR, Q.tight.n, "笔数多了，平均几乎是零");
    if (Q.d4) row("只看日线和 4 小时，不管周线", Q.d4.avgR, Q.d4.n);
    if (Q.old) row("区间 / 缺口回调 + 15 分钟转折（网站以前的信号）", Q.old.avgR, Q.old.n, "胜率 " + pct(Q.old.win) + "，照样亏");
    if (own) row("图表形态，按形态自己的入场、止损和目标", own.avgR, own.n, "胜率 " + pct(own.win) + "，赚得少、亏得多");
    if (st.ST1) row("短线：15 分钟顺势", st.ST1.avgR, st.ST1.n);
    if (st.ST2) row("短线：亚洲盘区间突破", st.ST2.avgR, st.ST2.n);
    if (st.ST3) row("短线：昨日高低点突破", st.ST3.avgR, st.ST3.n);
    rows.push(h("tr", null, [h("td", null, ["8 种常见指标做确认", h("small", { text: "均线排列、RSI、MACD、ADX 各两个周期" })]), h("td", { class: "n", text: "没有一个通过" })]));
    if (fx && fx.n) row("同一规则用在外汇（11 个货币对，" + ym(fx.from) + "起）", fx.avgR, fx.n, fx.positive + " 个货币对是正的；同期黄金 " + R(fx.gold.fourTfHourly.avgR));
    if (btc && btc.rules && btc.rules.go3r) row("同一规则用在比特币", btc.rules.go3r.avgR, btc.rules.go3r.n, "范围 " + R(btc.rules.go3r.lo) + " 到 " + R(btc.rules.go3r.hi) + "，含零：只作观察");
    if (Q.long) row("对照：不看任何条件，一直做多黄金", Q.long.avgR, Q.long.n, "说明规则赚的不只是金价上涨");
    table($("no-tab"), ["做法", "回放平均每笔"], rows);
    if (own) $("pat-num").textContent = "回放里形态本身没有优势：按形态自己的价位做，" + own.n.toLocaleString("en-US") + " 个 1 小时形态胜率 " + pct(own.win) + "，平均每笔 " + R(own.avgR) + "。";
  });
})();
