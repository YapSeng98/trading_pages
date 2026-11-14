// strategy.html: the one rule the site trades, and every number about it read from the replay and record files, so
// the page can never quote a figure the research does not have. Rewritten 2026-10-28: the old page was a textbook
// handbook (patterns as "the most reliable" signals, range trading, Fibonacci pullbacks, 1-2% risk a trade) that the
// replay contradicted.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var EN = window.LANG === "en", tr = window.T || function (zh) { return zh; };
  // labels the result files write in Chinese
  var seg = function (l) { return !EN ? l : String(l).replace("（定规则前没看过）", " (not seen before the rule was fixed)").replace("（定规则用的）", " (used to fix the rule)").replace("（第一次验证）", " (first check)"); };
  var BOOK = { trail: "same signal, trailing-stop exit", noW: "no weekly trend, 3R target", noWtrail: "no weekly trend, trailing-stop exit" };
  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) { var v = attrs[k]; if (v === null || v === undefined || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v); }
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  var R = function (v) { return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "R"; };
  var pct = function (v, d) { return (Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0)) + "%"; };
  var ym = function (s) { var p = String(s).split("-"); return EN ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+p[1] - 1] + " " + p[0] : p[0] + " 年 " + +p[1] + " 月"; };
  var get = function (u) { return fetch(u, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  function table(el, head, rows) {
    clear(el);
    el.appendChild(h("thead", null, [h("tr", null, head.map(function (x) { return h("th", { text: x }); }))]));
    el.appendChild(h("tbody", null, rows));
  }
  // green only where there is an edge: the "no edge" table shows losses in red and the rest plain
  function cellR(v, extra, plain) { return h("td", { class: "n " + (v > 0 && !plain ? "up" : v < 0 ? "dn" : "") }, [R(v), extra ? h("small", { text: extra }) : null]); }

  Promise.all([get("data/xau-backtest.json"), get("data/xau-signals.json"), get("data/btc-backtest.json"), get("research/forex/result.json"), get("research/forex/edges/result.json"), get("research/xau-replay/speed-result.json"), get("research/xau-replay/speed-result-btc.json"), get("research/forex/speed-result.json"), get("research/futures/result.json")]).then(function (res) {
    var bt = res[0], rec = res[1], btc = res[2], fx = res[3], fe = res[4], sp = res[5], spB = res[6], spF = res[7], fu = res[8];
    if (!bt || !bt.rules || !bt.rules.go3r) { $("pf-main").textContent = tr("回放结果读取失败，刷新一下再试。", "The replay results failed to load; refresh to try again."); return; }
    var g = bt.rules.go3r, t = bt.rules.gotrail, pr = bt.proof || {};
    // ---- the evidence ----
    $("pf-main").textContent = EN ? "Replay " + bt.from + " to " + bt.to + " (" + bt.years + " years of real spot gold 1-minute data, spread and overnight costs included): " + g.n + " trades, " + pct(g.win) + " won, " + R(g.avgR) + " a trade on average" +
      " (95% range " + R(g.lo) + " to " + R(g.hi) + "), about " + Math.round(g.perYear) + " trades and " + R(g.rPerYear).replace("R", "R a year") + "; worst drawdown " + g.maxDD + "R, longest losing run " + g.streak + " trades."
      : "回放 " + bt.from + " 到 " + bt.to + "（" + bt.years + " 年，真实现货金 1 分钟数据，含点差和隔夜利息）：" + g.n + " 笔，赢 " + pct(g.win) + "，平均每笔 " + R(g.avgR) +
      "（95% 范围 " + R(g.lo) + " 到 " + R(g.hi) + "），一年约 " + Math.round(g.perYear) + " 笔、" + R(g.rPerYear).replace("R", "R/年") + "；最深回撤 " + g.maxDD + "R，最长连亏 " + g.streak + " 笔。";
    table($("pf-seg"), EN ? ["Period", "Trades", "Won", "A trade"] : ["阶段", "笔数", "胜率", "平均每笔"], g.segments.map(function (s) {
      return h("tr", null, [h("td", { text: seg(s.label) }), h("td", { class: "n", text: String(s.n) }), h("td", { class: "n", text: pct(s.win) }), cellR(s.avgR)]);
    }).concat(t ? [h("tr", { class: "main" }, [h("td", { text: tr("跟踪止损出场（全部年份）", "Trailing-stop exit (all years)") }), h("td", { class: "n", text: String(t.n) }), h("td", { class: "n", text: pct(t.win) }), cellR(t.avgR)])] : []));
    var notes = clear($("pf-notes")), add = function (s) { notes.appendChild(h("li", { text: s })); };
    add(EN ? "Only about three in ten win: a few trades reach 3R and most are small losses (winners average " + R(g.avgWin) + ", losers " + R(g.avgLoss) + ")." : "胜率只有三成左右：靠少数几笔赚到 3R，大多数是小亏（赚的那些平均 " + R(g.avgWin) + "，亏的那些平均 " + R(g.avgLoss) + "）。");
    if (pr.pValue) add(EN ? "Tests: of 400 random entries, " + (pr.randomBeat ? Math.round(pr.randomBeat * 100) + "% beat it" : "none beat it") + "; random direction only, " + Math.round(pr.sideBeat * 100) + "% beat it; random timing only, " + Math.round(pr.timingBeat * 100) + "% beat it. p = " + pr.pValue + ". Allowing for the roughly 50 variants looked at, confidence is about " + Math.round(pr.deflatedSharpe * 100) + "%: a small edge, not fully proven." : "检验：随机进场 400 次，" + (pr.randomBeat ? Math.round(pr.randomBeat * 100) + "% 比它好" : "没有一次比它好") + "；只随机选方向，" + Math.round(pr.sideBeat * 100) + "% 比它好；只随机选时机，" + Math.round(pr.timingBeat * 100) + "% 比它好。p = " + pr.pValue + "。考虑到一共看过约 50 个变体，可信度约 " + Math.round(pr.deflatedSharpe * 100) + "%：小优势，没有完全证明。");
    add(EN ? "The edge comes mostly from strong-trend years: " + g.segments[0].label.split("（")[0] + ", not seen before the rule was fixed, made only " + R(g.segments[0].avgR) + ", not significant; in 2024–2026 gold rose strongly and the rule made the most." : "优势主要来自强趋势的年份：定规则前没看过的 " + g.segments[0].label.split("（")[0] + " 只有 " + R(g.segments[0].avgR) + "，不显著；2024–2026 年金价大涨，这条规则赚得最多。");
    // the rule away from gold (research/futures, research/forex): if it were a general trend effect it would repeat
    if (fu && fu.series && fx && fx.n) {
      var fr = fu.series.raw, fa = fu.series.adj, si = fu.markets.SI;
      add(EN ? "It did not repeat on other markets: 12 futures markets (crude, stock indices, Treasuries, silver, copper, from " + ym(fu.from) + ") made " + R(fr.avgR) + " a trade together (" + fr.n + " trades; " + R(fa.avgR) + " with roll jumps removed), only silver (" + R(si.raw_rule.avgR) + ") and copper positive; forex " + R(fx.avgR) + "; 7 other coins did not make money either. Gold futures made " + R(fu.gold.futures_raw.avgR) + " over the same dates. So the edge looks more like precious metals' big trend of recent years than a rule that works everywhere: keep the size small and watch the paper record and the stop line." : "换到别的市场没有重现：12 个期货市场（原油、股指、美债、白银、铜，" + ym(fu.from) + "起）合计每笔 " + R(fr.avgR) + "（" + fr.n + " 笔；按换月调整后 " + R(fa.avgR) + "），只有白银（" + R(si.raw_rule.avgR) + "）和铜是正的；外汇 " + R(fx.avgR) + "；7 个其他币种也不赚。同期黄金期货 " + R(fu.gold.futures_raw.avgR) + "。所以这个优势更像是贵金属这几年的大趋势，不是到处都有的规律：仓位要小，盯住纸面记录和停用线。");
    }
    // how late the rule is, and what being later still costs (research/xau-replay/speed_check.js)
    if (sp && sp.part2 && sp.baseline) {
      var late = function (m) { return sp.part2.filter(function (p) { return p.lateMin === m; })[0]; }, cp = sp.baseline.capture;
      add(EN ? "Entering a little late costs little: 2 minutes after the close averaged " + R(late(2).avgR) + " a trade, 15 minutes late " + R(late(15).avgR) + ", 30 minutes " + R(late(30).avgR) + ", within the margin of error. An hour or more late, 2011–2018 (not seen before the rule was fixed) fell to about zero." : "晚一点进场的代价很小：收盘后 2 分钟进平均每笔 " + R(late(2).avgR) + "，晚到 15 分钟 " + R(late(15).avgR) + "，30 分钟 " + R(late(30).avgR) + "，差别在误差之内。晚到 1 小时以上时，定规则前没看过的 2011–2018 就只剩零左右了。");
      add(EN ? "This rule gets into big moves late: of " + cp.legs + " big moves (daily closes covering at least 5 daily ATRs), " + cp.caught + " had a signal, the first about " + Math.round(cp.medianHours / 24) + " days in (median), with about " + Math.round(cp.medianUsedPct) + "% of the move already gone. That is the price of waiting for the weekly to turn." : "这条规则进大行情很晚：" + cp.legs + " 段大行情（日线收盘走了至少 5 倍日波幅）里 " + cp.caught + " 段有信号，第一个信号在行情开始后约 " + Math.round(cp.medianHours / 24) + " 天（中位数），这时行情已走了约 " + Math.round(cp.medianUsedPct) + "%。这是等周线转向的代价。");
    }
    if (rec && rec.summary) { var z = rec.summary; add(EN ? "Live paper record (since " + String(rec.since).slice(0, 10) + ", without a replay's hindsight): " + z.signals + " signals, " + z.taken + " opened, " + z.closed + " finished" + (z.closed ? ", " + R(z.totalR) + " total" : "") + (z.open ? ", " + z.open + " open" : "") + "." : "实盘纸面记录（" + String(rec.since).slice(0, 10) + " 起，没有回放的事后之明）：" + z.signals + " 个信号，" + z.taken + " 笔开仓，" + z.closed + " 笔已结束" + (z.closed ? "，合计 " + R(z.totalR) : "") + (z.open ? "，" + z.open + " 笔持有中" : "") + "。" ); }
    if (rec && rec.shadow && rec.shadow.books) { var sb = rec.shadow.books; add(EN ? "Candidate methods are in the paper record too (since " + String(rec.shadow.since).slice(0, 10) + "; logged only, not signals): " + Object.keys(sb).map(function (id) { var y = sb[id].summary || {}; return (BOOK[id] || sb[id].name) + " " + (y.closed ? y.closed + " trades " + R(y.totalR) : "0 trades"); }).join("; ") + ". The rule is reconsidered only once one has 100 trades and is clearly better than the rule's own record." : "候选做法也在纸面记录（" + String(rec.shadow.since).slice(0, 10) + " 起，只记录，不是信号）：" + Object.keys(sb).map(function (id) { var y = sb[id].summary || {}; return sb[id].name + " " + (y.closed ? y.closed + " 笔 " + R(y.totalR) : "0 笔"); }).join("；") + "。每个攒满 100 笔、并且明显好过规则自己的记录，才会重新考虑规则。"); }
    // ---- risk per trade ----
    $("rk-main").textContent = EN ? "The replay's worst drawdown was " + g.maxDD + "R and its longest losing run " + g.streak + " trades. For each risk a trade, the drawdown your account would go through:" : "回放里最深回撤 " + g.maxDD + "R、最长连亏 " + g.streak + " 笔。按每笔冒的风险，换算成账户会经历的回撤：";
    table($("rk-tab"), EN ? ["Risk a trade", g.streak + " losses in a row", "Worst drawdown", ""] : ["每笔风险", "连亏 " + g.streak + " 笔", "最深回撤", ""], [0.25, 0.5, 1, 2].map(function (r) {
      var dd = g.maxDD * r, note = r === 0.5 ? tr("黄金页默认", "the gold page's default") : dd > 33 ? tr("账户回撤超过三分之一", "over a third of the account") : "";
      return h("tr", { class: r === 0.5 ? "main" : null }, [h("td", { text: r + "%" }), h("td", { class: "n", text: "−" + pct(g.streak * r, 1) }), h("td", { class: "n" + (dd > 33 ? " dn" : ""), text: "−" + pct(dd, 1) }), h("td", { text: note })]);
    }));
    $("disc-stop").lastChild.textContent = EN ? ": when the paper record falls more than " + (pr.maxDD || g.maxDD) + "R from its peak (the replay's worst drawdown), stop trading it with real money and find out why. The gold page's «Record» has the health check." : "：纸面记录从高点回落超过 " + (pr.maxDD || g.maxDD) + "R（回放里最深的回撤），就先停止用真钱做，查清楚原因。黄金页的「成绩记录」里有健康检查。";
    // ---- what did not work ----
    var Q = bt.rules, st = bt.shortTerm && bt.shortTerm.rules || {}, own = bt.patterns && bt.patterns.own && bt.patterns.own["1H"], rows = [];
    var row = function (name, v, n, extra) { if (typeof v !== "number") return; rows.push(h("tr", null, [h("td", null, [name, extra ? h("small", { text: extra }) : null]), cellR(v, n ? n + tr(" 笔", " trades") : null, true)])); };
    if (Q.against) row(tr("逆着三个大周期做（抄底、摸顶）", "Against the three big trends (buying bottoms, selling tops)"), Q.against.avgR, Q.against.n);
    if (Q.early) row(tr("大方向一致就进，不等小周期转过来", "Entering as soon as the big trends agree, without waiting for the small ones"), Q.early.avgR, Q.early.n);
    if (Q.tight) row(tr("止损放小（1.5 倍小时波幅）", "A tight stop (1.5 × the 1-hour ATR)"), Q.tight.avgR, Q.tight.n, tr("笔数多了，平均几乎是零", "more trades, about zero on average"));
    if (Q.d4) row(tr("只看日线和 4 小时，不管周线", "Daily and 4-hour only, ignoring the weekly"), Q.d4.avgR, Q.d4.n);
    // the faster versions (research/xau-replay/SPEED-PLAN.md): 13 tried, none passed; each compared with the rule itself
    var V = sp && sp.versions, near = sp && sp.exploratory && sp.exploratory.nearest;
    if (V && near) {
      var vs = EN ? " The rule: " + R(g.avgR) + "." : " 这条规则 " + R(g.avgR) + "。";
      if (EN) {
        row("Entering as price crosses the level, without waiting for the 15-minute close", V.A1.r3.avgR, V.A1.r3.n, "about " + Math.round(near.A1.medianMin) + " minutes earlier; false breaks lose more than is saved, and the more timeframes taken early the worse (1-hour " + R(V.A2.r3.avgR) + ", 4-hour " + R(V.A3.r3.avgR) + ")." + vs);
        row("A stop order resting at the level, no watching", V.A5.r3.avgR, V.A5.r3.n, "about " + Math.round(near.A5.medianMin) + " minutes earlier, the closest to the rule, but it failed the test, and the level changes about " + Math.round(sp.exploratory.orderMoves.perDay) + " times a day." + vs);
        row("Faster turns on the 1-hour and 15-min (2-bar swings)", V.C1.r3.avgR, V.C1.r3.n, "worst drawdown " + V.C1.r3.maxDD + "R; 3-bar swings " + R(V.C3.r3.avgR) + ", and 2011–2018 negative too.");
        row("Ignoring the weekly, the other four agreeing", V.B3.r3.avgR, V.B3.r3.n, "the first signal in a big move comes about " + Math.round(V.B3.capture.medianHours / 24) + " days in, " + Math.round(V.B3.capture.caughtPct) + "% of big moves get a signal, but each trade makes less; it failed the test" + (fu && fu.series ? "; on 12 futures markets it was no better than the rule either (" + R(fu.series.adj.noW.avgR) + " against " + R(fu.series.adj.avgR) + " with roll jumps removed)" : "") + ".");
        row("Ignoring the weekly and the daily (4-hour, 1-hour, 15-min)", V.B4.r3.avgR, V.B4.r3.n, "the fastest, but negative in 2019–2023.");
      } else {
      row("不等 15 分钟收盘，价格一过线就进", V.A1.r3.avgR, V.A1.r3.n, "早约 " + Math.round(near.A1.medianMin) + " 分钟，假突破亏掉的比省下的多；提前看的周期越多越差（1 小时 " + R(V.A2.r3.avgR) + "，4 小时 " + R(V.A3.r3.avgR) + "）。" + vs);
      row("在价位上挂止损单，不用盯盘", V.A5.r3.avgR, V.A5.r3.n, "早约 " + Math.round(near.A5.medianMin) + " 分钟，最接近这条规则，但没通过测试，价位一天要改约 " + Math.round(sp.exploratory.orderMoves.perDay) + " 次。" + vs);
      row("1 小时和 15 分钟用更快的转折（2 根摆动）", V.C1.r3.avgR, V.C1.r3.n, "最深回撤 " + V.C1.r3.maxDD + "R；3 根摆动 " + R(V.C3.r3.avgR) + "，2011–2018 也是负的。");
      row("不看周线，其余四个周期同向", V.B3.r3.avgR, V.B3.r3.n, "大行情第一个信号提前到约 " + Math.round(V.B3.capture.medianHours / 24) + " 天，" + Math.round(V.B3.capture.caughtPct) + "% 的大行情有信号，但每笔少赚，没通过测试" + (fu && fu.series ? "；在 12 个期货市场上也没有比原规则好（换月调整后 " + R(fu.series.adj.noW.avgR) + " 对 " + R(fu.series.adj.avgR) + "）" : "") + "。");
      row("连周线和日线都不看（4 小时、1 小时、15 分钟）", V.B4.r3.avgR, V.B4.r3.n, "最快，但 2019–2023 是负的。");
      }
    }
    if (Q.old) row(tr("区间 / 缺口回调 + 15 分钟转折（网站以前的信号）", "Range / gap pullback + 15-minute turn (the site's old signal)"), Q.old.avgR, Q.old.n, EN ? pct(Q.old.win) + " won, and still lost" : "胜率 " + pct(Q.old.win) + "，照样亏");
    if (own) row(tr("图表形态，按形态自己的入场、止损和目标", "Chart patterns, with their own entry, stop and target"), own.avgR, own.n, EN ? pct(own.win) + " won; made little, lost more" : "胜率 " + pct(own.win) + "，赚得少、亏得多");
    if (st.ST1) row(tr("短线：15 分钟顺势", "Short-term: 15-minute with the trend"), st.ST1.avgR, st.ST1.n);
    if (st.ST2) row(tr("短线：亚洲盘区间突破", "Short-term: Asian-range breakout"), st.ST2.avgR, st.ST2.n);
    if (st.ST3) row(tr("短线：昨日高低点突破", "Short-term: yesterday's high/low break"), st.ST3.avgR, st.ST3.n);
    rows.push(h("tr", null, [h("td", null, [tr("8 种常见指标做确认", "8 common indicators as confirmation"), h("small", { text: tr("均线排列、RSI、MACD、ADX 各两个周期", "EMA stack, RSI, MACD, ADX, two timeframes each") })]), h("td", { class: "n", text: tr("没有一个通过", "none passed") })]));
    if (fx && fx.n) row(EN ? "The same rule on forex (11 pairs, from " + ym(fx.from) + ")" : "同一规则用在外汇（11 个货币对，" + ym(fx.from) + "起）", fx.avgR, fx.n, EN ? fx.positive + " pairs positive; gold " + R(fx.gold.fourTfHourly.avgR) + " over the same dates" : fx.positive + " 个货币对是正的；同期黄金 " + R(fx.gold.fourTfHourly.avgR));
    if (fu && fu.series) row(EN ? "The same rule on other futures (12 markets, from " + ym(fu.from) + ")" : "同一规则用在其他期货（12 个市场，" + ym(fu.from) + "起）", fu.series.raw.avgR, fu.series.raw.n, EN ? R(fu.series.adj.avgR) + " with roll jumps removed; metals positive (silver " + R(fu.markets.SI.raw_rule.avgR) + "), crude, indices and Treasuries all lost; gold futures " + R(fu.gold.futures_raw.avgR) + " over the same dates" : "按换月调整后 " + R(fu.series.adj.avgR) + "；金属是正的（白银 " + R(fu.markets.SI.raw_rule.avgR) + "），原油、股指、美债都亏；同期黄金期货 " + R(fu.gold.futures_raw.avgR));
    // forex round 2 (research/forex/edges): results in bp or % per occasion, not in R
    var bp = function (v) { return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + " bp"; };
    var rowTxt = function (name, v, txt, extra) { rows.push(h("tr", null, [h("td", null, [name, extra ? h("small", { text: extra }) : null]), h("td", { class: "n " + (v < 0 ? "dn" : ""), text: txt })])); };
    if (fe && fe.A1) rowTxt(tr("外汇：美联储决议日做空美元（2011 年起）", "Forex: shorting the dollar on Fed days (since 2011)"), fe.A1.avgBp, bp(fe.A1.avgBp) + tr(" / 次", " each"), EN ? fe.A1.n + " times; " + bp(fe.A1.paperYears.avgBp) + " in the paper's years (1994–2010), gone once published" : fe.A1.n + " 次；论文那些年（1994–2010）是 " + bp(fe.A1.paperYears.avgBp) + "，公开后就没了");
    if (fe && fe.A2) rowTxt(tr("外汇：欧美时段规律（EUR/USD 欧洲时段做空、美国时段做多）", "Forex: time of day (EUR/USD short in European hours, long in US hours)"), fe.A2.avgBp, bp(fe.A2.avgBp) + tr(" / 天", " a day"), EN ? bp(fe.A2.grossBp) + " before costs, not enough to pay the spread" : "扣点差前 " + bp(fe.A2.grossBp) + "，不够付点差");
    if (fe && fe.A3) rowTxt(tr("外汇：每月买最强、卖最弱的货币", "Forex: each month, buy the strongest and sell the weakest currencies"), fe.A3.avgPct, (fe.A3.avgPct >= 0 ? "+" : "−") + Math.abs(fe.A3.avgPct).toFixed(2) + tr("% / 月", "% a month"), fe.A3.months + tr(" 个月", " months"));
    if (fe && fe.B1) row(tr("外汇：伦敦开盘突破（亚洲盘区间）", "Forex: the London breakout (of the Asian range)"), fe.B1.avgR, fe.B1.n, EN ? "only " + fe.B1.positive + " of 11 pairs positive" : "11 个货币对只有 " + fe.B1.positive + " 个是正的");
    if (spF && spF.versions && spF.versions.pre4h) row(tr("外汇：更快的版本里最好的（4 小时不等收盘）", "Forex: the best faster version (4-hour before its close)"), spF.versions.pre4h.avgR, spF.versions.pre4h.n, EN ? "without the weekly " + R(spF.versions.noW.avgR) + ", without the daily too " + R(spF.versions.noWD.avgR) + ": all lose" : "不看周线 " + R(spF.versions.noW.avgR) + "，连日线也不看 " + R(spF.versions.noWD.avgR) + "，全部亏损");
    if (btc && btc.rules && btc.rules.go3r) row(tr("同一规则用在比特币", "The same rule on Bitcoin"), btc.rules.go3r.avgR, btc.rules.go3r.n, EN ? "range " + R(btc.rules.go3r.lo) + " to " + R(btc.rules.go3r.hi) + ", including zero: watch only" : "范围 " + R(btc.rules.go3r.lo) + " 到 " + R(btc.rules.go3r.hi) + "，含零：只作观察");
    if (spB && spB.versions && V) row(tr("比特币：五个周期都不等收盘", "Bitcoin: all five timeframes before their close"), spB.versions.A4.r3.avgR, spB.versions.A4.r3.n, EN ? "the only one of 13 faster versions to pass its preset bar, but the same method made only " + R(V.A4.r3.avgR) + " on gold, and Bitcoin's rule itself is unproven, so nothing changed" : "13 个更快的版本里只有它过了预设标准，但同样做法在黄金只有 " + R(V.A4.r3.avgR) + "，比特币规则本身也没被证明，所以不改");
    if (Q.long) row(tr("对照：不看任何条件，一直做多黄金", "Control: always long gold, no conditions"), Q.long.avgR, Q.long.n, tr("说明规则赚的不只是金价上涨", "shows the rule earns more than gold's rise"));
    table($("no-tab"), EN ? ["Method", "Replay, a trade"] : ["做法", "回放平均每笔"], rows);
    if (own) $("pat-num").textContent = EN ? "In the replay patterns had no edge of their own: traded at their own levels, " + own.n.toLocaleString("en-US") + " 1-hour patterns won " + pct(own.win) + " and averaged " + R(own.avgR) + " a trade. " : "回放里形态本身没有优势：按形态自己的价位做，" + own.n.toLocaleString("en-US") + " 个 1 小时形态胜率 " + pct(own.win) + "，平均每笔 " + R(own.avgR) + "。";
  });
})();
