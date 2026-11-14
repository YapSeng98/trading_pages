// Plan helpers for report.html. Pure functions over the output of runXauEngine() (assets/xau-engine.js):
// no DOM and no network, so the maths can be checked in Node. All prices are spot prices.
//
// The rules here follow the 2019-2026 replay on real spot gold (research/xau-replay/, numbers in data/xau-backtest.json):
//   - trade only with the weekly, daily and 4-hour trends when all three agree; against them lost steadily;
//   - enter when the 1-hour and 15-minute trends have turned the same way too;
//   - the stop needs room: 3 x the 1-hour ATR. Stops of 1.5 x or less showed no edge;
//   - let it run: target 3R, or trail the stop 2R behind the best price and leave when the three big trends split;
//   - buying the "cheap" half of the range, gaps and the 15-minute trigger added nothing measurable.
var XauPlan = (function () {
  "use strict";

  var SYS = { stopAtr: 3, targetR: 3, trailR: 2, minStopAtr: 2, maxStopAtr: 8, risk: 0.5 };
  // What the replay found, in the words the verdict uses. Gold's by default; btc.html (and scripts/update_btc.js)
  // pass Bitcoin's own replay through setMarket(), so a signal there is described by what it did on Bitcoin.
  var MK = { goText: "这是回放里唯一显出优势的情形。", streak: 15, shortWarn: "", longWarn: "",
    lateText: "回放里，信号走出 1R 以后才进的单平均每笔 +0.17R，和刚出现时进（+0.18R）差不多。",                 // data/xau-backtest.json rules.late1r / go3r
    // data/xau-backtest.json patterns (research/xau-replay/pattern_check.js)
    patNote: "回放里（黄金 2011–2026）形态单独拿来做没有优势：1 小时形态完成后进场 2,637 次，平均每笔 +0.01R；按形态自己的止损和目标，胜率 59%，平均 −0.02R。和信号同向也没让信号更好（+0.20R，没有形态时 +0.21R）。它们的用处是标出关键位、目标和失效位。",
    patAgainst: "回放里这种情况很少（16 笔），平均每笔 −0.28R，比平常差；笔数太少，规则不因此改变。想更稳，这一笔可以减半手数或不做。",
    // the health check's yardstick: data/xau-backtest.json proof (target 3R: average, spread, worst drawdown)
    health: { avgR: 0.182, sd: 1.823, maxDD: 38 }, observe: false,
    // data/xau-backtest.json rules.gotrail / go3r, by period
    exitNote: "大趋势里用跟踪止损更能拿住利润：回放里它在三段历史都比 3R 好（平均每笔 +0.25R 对 +0.18R）。",
    // data/xau-backtest.json shortTerm (research/xau-replay/short_check.js, costs included)
    shortText: "回放（黄金 2011–2026，含点差）：这条规则 1,164 笔，平均每笔 +0.04R，2019–2023 年是亏的（−0.07R），算不上可靠的优势；另外两条常见短线规则更差：15 分钟顺势 −0.10R，亚洲盘区间突破 +0.01R。所以这里只给参考价位，不发提醒。真要做，手数用主信号的一半或更少。",
    noneText: "回放里只有三个大周期同向时才有优势，其余时间进场和抛硬币差不多，逆着它们做则是长期亏损。" };
  function setMarket(o) { for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) MK[k] = o[k]; }
  if (typeof window !== "undefined" && window.LANG === "en") setMarket({ goText: "This is the one situation where the replay showed an edge. ",
    lateText: "In the replay, entering after the signal had already run 1R averaged +0.17R a trade, about the same as entering at once (+0.18R). ",
    patNote: "In the replay (gold 2011–2026) patterns had no edge on their own: entering after a finished 1-hour pattern, 2,637 times, averaged +0.01R a trade; with the pattern's own stop and target, 59% won and the average was −0.02R. Agreeing with a signal did not make the signal better either (+0.20R, against +0.21R without a pattern). What they are good for is marking key levels, targets and where a move fails.",
    patAgainst: "This is rare in the replay (16 trades) and averaged −0.28R a trade, worse than usual; too few trades to change the rule. To play safer, halve the size on this one or skip it.",
    exitNote: "In a big trend the trailing stop holds on to more profit: in the replay it beat 3R in all three periods (+0.25R a trade against +0.18R).",
    shortText: "Replay (gold 2011–2026, spread included): this rule made 1,164 trades at +0.04R on average, and lost in 2019–2023 (−0.07R): not a reliable edge. Two other common short-term rules did worse: 15-minute with the trend −0.10R, the Asian-range breakout +0.01R. So this gives reference prices only and no alerts. If you trade it anyway, use half the main signal's size or less.",
    noneText: "In the replay there was an edge only when the three big trends agreed; at other times entering was about a coin toss, and trading against them lost steadily." });
  var TF_ORDER = ["W", "D", "4H", "1H", "15M"];
  var TF_WEIGHT = { W: 3, D: 3, "4H": 2, "1H": 1, "15M": 1 };
  var TF_ZH = { W: "周线", D: "日线", "4H": "4 小时", "1H": "1 小时", "15M": "15 分钟" };
  var TF_S = { W: "周线", D: "日线", "4H": "4小时", "1H": "1小时", "15M": "15分钟" };   // compact form for labels

  var ZH = {
    trend: { bullish: "看多", bearish: "看空", unclear: "不明", mixed: "分歧" },
    stack: { bullish: "多头排列", bearish: "空头排列", mixed: "交错" },
    zone: { premium: "溢价区", discount: "折价区", equilibrium: "均衡区" },
    pattern: {
      "Double top": "双顶", "Double bottom": "双底", "Head and shoulders": "头肩顶", "Inverse head and shoulders": "头肩底",
      "Ascending triangle": "上升三角形", "Descending triangle": "下降三角形", "Symmetrical triangle": "对称三角形",
      "Rising wedge": "上升楔形", "Falling wedge": "下降楔形", "Rising channel": "上升通道", "Falling channel": "下降通道",
      "Range": "横盘区间", "Bull flag": "牛旗", "Bear flag": "熊旗"
    },
    status: {
      "confirmed: closed below neckline": "已确认：收破颈线", "confirmed: closed above neckline": "已确认：收上颈线",
      "forming: watch the neckline": "形成中：关注颈线", "forming: right shoulder in place": "形成中：右肩已现",
      "inside: watch for a breakout": "形态内：等待突破", "broke out upward": "已向上突破", "broke out downward": "已向下突破",
      "broke out": "已突破", "consolidating after the impulse": "脉冲后整理中"
    }
  };

  // The page's language (assets/i18n.js sets window.LANG). Node, the replay and the tracker have no window: Chinese.
  var EN = typeof window !== "undefined" && window.LANG === "en";
  function tr(zh, en) { return EN ? en : zh; }
  if (EN) {
    TF_ZH = { W: "Weekly", D: "Daily", "4H": "4-hour", "1H": "1-hour", "15M": "15-min" };
    TF_S = { W: "W", D: "D", "4H": "4H", "1H": "1H", "15M": "15M" };
    ZH = { trend: { bullish: "bullish", bearish: "bearish", unclear: "unclear", mixed: "mixed" }, stack: { bullish: "bullish stack", bearish: "bearish stack", mixed: "mixed" },
      zone: { premium: "premium", discount: "discount", equilibrium: "equilibrium" }, pattern: {}, status: {} };   // patterns and statuses: the engine's own English
  }

  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  var NF = {};                                                                   // one formatter per precision: creating one per number is slow
  function fmt(v, d) {
    v = num(v); if (v === null) return "—";
    d = d === undefined ? 2 : d;
    return (NF[d] || (NF[d] = new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
  }
  // Dollars for a sentence: whole dollars from $100 up, cents below that (a $0.35 risk must not read as "$0").
  function usd(v) {
    v = num(v); if (v === null) return "—";
    var a = Math.abs(v), cents = a < 100 && Math.round(a * 100) % 100 !== 0;
    return (v < 0 ? "−" : "") + "$" + fmt(a, cents ? 2 : 0);
  }
  function agoTxt(ms) { var m = Math.max(0, Math.round(ms / 60000)); if (m < 60) return m + tr(" 分钟前", " min ago"); var hr = Math.round(m / 60); return hr < 48 ? hr + tr(" 小时前", " h ago") : Math.round(hr / 24) + tr(" 天前", " days ago"); }
  function tfOk(E, tf) { var t = E && E.tfs && E.tfs[tf]; return t && !t.error ? t : null; }

  // ---------- key levels ----------
  // Every structural price the engine knows about. Point levels that land on the same spot are merged into one
  // (confluence); FVG zones are returned separately. Both lists are sorted high to low.
  function levels(E, opts) {
    opts = opts || {};
    var price = num(E && E.price); if (price === null) return { points: [], zones: [] };
    var H1 = tfOk(E, "1H"), D = tfOk(E, "D");
    var tol = Math.max(0.15 * ((H1 && H1.atr) || 8), 0.6);
    var win = opts.window || 3 * ((D && D.atr) || 80);
    var pts = [], zones = [];
    // rank decides which name leads when several sources land on one price: structure first, midpoints last
    function pt(p, label, tf, w, rank) { p = num(p); if (p !== null && Math.abs(p - price) <= win) pts.push({ price: p, label: label, tf: tf, w: w, rank: rank || 1 }); }

    var c = E.context || {};
    pt(c.prevDayHigh, tr("昨日高点", "yesterday's high"), "D", 3, 3); pt(c.prevDayLow, tr("昨日低点", "yesterday's low"), "D", 3, 3);
    pt(c.prevWeekHigh, tr("上周高点", "last week's high"), "W", 4, 3); pt(c.prevWeekLow, tr("上周低点", "last week's low"), "W", 4, 3);

    TF_ORDER.forEach(function (tf) {
      var t = tfOk(E, tf); if (!t || tf === "15M") return;
      var w = TF_WEIGHT[tf], n = TF_S[tf];
      if (t.range) { pt(t.range.top, n + tr("区间顶", " range high"), tf, w, 2); pt(t.range.bottom, n + tr("区间底", " range low"), tf, w, 2); if (tf === "D" || tf === "4H") pt(t.range.eq, n + tr("区间中点", " range midpoint"), tf, 1, 0); }
      pt(t.swingHigh, n + tr("前高", " prior high"), tf, w, 3); pt(t.swingLow, n + tr("前低", " prior low"), tf, w, 3);
      if (tf === "4H" || tf === "1H") { pt(t.intHigh, n + tr("近期小高点", " recent minor high"), tf, 1); pt(t.intLow, n + tr("近期小低点", " recent minor low"), tf, 1); }
      if (t.lastEvent) pt(t.lastEvent.level, EN ? n + (t.lastEvent.dir === "bull" ? " bullish" : " bearish") + (t.lastEvent.type === "CHoCH" ? " turn" : " break") + " level" : n + (t.lastEvent.dir === "bull" ? "向上" : "向下") + (t.lastEvent.type === "CHoCH" ? "转折" : "突破") + "位", tf, 1);
      if ((tf === "D" || tf === "4H") && t.ema) pt(t.ema.e200, n + tr(" 200 均线", " 200 EMA"), tf, 2, 2);
      ((t.liquidity || {}).equalHighs || []).forEach(function (p) { pt(p, n + tr("等高点（止损密集）", " equal highs (stops cluster)"), tf, 2, 2); });
      ((t.liquidity || {}).equalLows || []).forEach(function (p) { pt(p, n + tr("等低点（止损密集）", " equal lows (stops cluster)"), tf, 2, 2); });
      (t.patterns || []).forEach(function (p) {
        var nm = ZH.pattern[p.name] || p.name, tg = num(p.target);
        pt(p.level, EN ? n + " " + nm.toLowerCase() + " key level" : n + nm + "关键位", tf, 2, 2);
        // a target already passed is no longer a level worth watching
        if (tg !== null && ((p.bias === "bullish" && tg > price) || (p.bias === "bearish" && tg < price))) pt(tg, EN ? n + " " + nm.toLowerCase() + " target" : n + nm + "目标", tf, 1);
      });
      (t.fvgs || []).forEach(function (g) {
        var top = num(g.top), bot = num(g.bottom); if (top === null || bot === null) return;
        if (bot - price > win || price - top > win) return;
        zones.push({ kind: "zone", top: top, bottom: bot, price: (top + bot) / 2, polarity: g.dir, tf: tf, tapped: !!g.tapped,
          label: TF_S[tf] + (g.dir === "bull" ? tr("看多缺口", " bullish gap") : tr("看空缺口", " bearish gap")), strength: w, time: g.time,
          side: price > top ? "sup" : price < bot ? "res" : "in" });
      });
    });

    pts.sort(function (a, b) { return a.price - b.price; });
    var groups = [], cur = null;
    pts.forEach(function (p) {
      if (cur && p.price - cur.hi <= tol) { cur.items.push(p); cur.hi = p.price; }
      else { cur = { items: [p], hi: p.price }; groups.push(cur); }
    });
    var merged = groups.map(function (g) {
      var items = g.items.slice().sort(function (a, b) { return (b.w - a.w) || (b.rank - a.rank); });
      var labels = [], tfs = [], strength = 0;
      items.forEach(function (it) { if (labels.indexOf(it.label) < 0) labels.push(it.label); if (tfs.indexOf(it.tf) < 0) tfs.push(it.tf); strength += it.w; });
      var p = items[0].price; // the heaviest source names the price
      return { kind: "point", price: p, labels: labels, tfs: tfs, strength: strength, side: p >= price ? "res" : "sup" };
    });
    var n = opts.each || 6;
    var above = merged.filter(function (l) { return l.side === "res"; }).slice(0, n);
    var below = merged.filter(function (l) { return l.side === "sup"; }).slice(-n);
    zones.sort(function (a, b) { return b.price - a.price; });
    return { points: above.reverse().concat(below.reverse()), zones: zones };
  }

  // ---------- the old zone setup (kept only so the replay can score it) ----------
  // Zone / stop / target rules of the first version: enter in a 1H or 4H gap with a 15M trigger. The replay found
  // no edge in it, so the page no longer offers it. dir: 1 long, -1 short.
  function candidate(E, dir) {
    var H1 = tfOk(E, "1H"), H4 = tfOk(E, "4H"), M15 = tfOk(E, "15M"), price = num(E && E.price);
    if (!H1 || !H1.range || !H1.atr || price === null) return null;
    var want = dir > 0 ? "bull" : "bear";
    var g1 = (H1.fvgs || []).filter(function (g) { return g.dir === want; })[0];
    var g4 = H4 ? (H4.fvgs || []).filter(function (g) { return g.dir === want; })[0] : null;
    var zTop, zBot, zSrc;
    if (g1) { zTop = g1.top; zBot = g1.bottom; zSrc = "1H FVG"; }
    else if (g4) { zTop = g4.top; zBot = g4.bottom; zSrc = "4H FVG"; }
    else if (dir > 0) { zTop = H1.range.eq; zBot = H1.range.bottom; zSrc = tr("1H 折价区", "1H discount"); }
    else { zTop = H1.range.top; zBot = H1.range.eq; zSrc = tr("1H 溢价区", "1H premium"); }
    var r2 = function (v) { return Math.round(v * 100) / 100; };
    var entry = r2((zTop + zBot) / 2);
    var stop = dir > 0 ? r2(Math.min(zBot, H1.range.bottom) - 0.2 * H1.atr) : r2(Math.max(zTop, H1.range.top) + 0.2 * H1.atr);
    var tp1 = dir > 0 ? H1.range.top : H1.range.bottom;
    var tp2 = H4 && H4.range ? (dir > 0 ? H4.range.top : H4.range.bottom) : null;
    // a target only counts if it is beyond the entry (and TP2 beyond TP1) in the trade's direction
    if (num(tp1) !== null && (tp1 - entry) * dir <= 0) tp1 = null;
    if (num(tp2) !== null && ((tp2 - entry) * dir <= 0 || (num(tp1) !== null && (tp2 - tp1) * dir <= 0))) tp2 = null;
    if (tp1 === null && tp2 !== null) { tp1 = tp2; tp2 = null; }
    var risk = Math.abs(entry - stop);
    var inZone = price <= zTop + 0.1 * H1.atr && price >= zBot - 0.1 * H1.atr;
    var trig = !!(M15 && M15.lastInternal && M15.lastInternal.dir === want && M15.lastInternal.barsAgo <= 8);
    var aligned = E.overall && E.overall.alignedDirection === (dir > 0 ? "long" : "short");
    return {
      side: dir > 0 ? "long" : "short", aligned: !!aligned, zoneTop: zTop, zoneBottom: zBot, zoneSource: zSrc,
      entry: entry, stop: stop, tp1: num(tp1), tp2: num(tp2),
      rr1: risk > 0 && num(tp1) !== null ? Math.round(Math.abs(tp1 - entry) / risk * 10) / 10 : null,
      rr2: risk > 0 && num(tp2) !== null ? Math.round(Math.abs(tp2 - entry) / risk * 10) / 10 : null,
      stopAtr: Math.round(risk / H1.atr * 10) / 10, priceInZone: inZone, trigger15m: trig,
      state: inZone && trig ? "ready" : inZone ? "inzone" : "wait"
    };
  }
  function candidates(E) { return { long: candidate(E, 1), short: candidate(E, -1), aligned: (E && E.overall && E.overall.alignedDirection) || "none" }; }

  // ---------- position size ----------
  // XAUUSD: 1.00 lot = `contract` ounces (100 on most MT4/MT5 brokers), so a $1 move is worth contract × lots dollars.
  function size(p) {
    var entry = num(p.entry), stop = num(p.stop), tp1 = num(p.tp1), tp2 = num(p.tp2);
    var bal = num(p.balance), pct = num(p.riskPct), contract = num(p.contract) || 100, step = num(p.lotStep) || 0.01, spread = num(p.spread) || 0;
    var dir = p.side === "short" ? -1 : 1, errors = [], issues = [];
    var o = { valid: false, errors: errors, issues: issues, otherSideFits: false, same: false, dir: dir, dist: null, distPct: null, riskUsd: null, perLot: null, lotsRaw: null, lots: null,
      actualRisk: null, actualPct: null, r1: null, r2: null, pnl1: null, pnl2: null, minLotRisk: null, minLotPct: null, breakeven: null };
    if (entry === null || stop === null) { errors.push(tr("填写入场价与止损价", "Fill in the entry and the stop")); return o; }
    if (entry === stop) { o.same = true; errors.push(tr("入场价与止损价不能相同", "The entry and the stop cannot be the same")); return o; }
    // issues: which price sits on the wrong side of the entry for this direction ("at": where it is now)
    var want = dir > 0 ? tr("做多", "Long") : tr("做空", "Short"), bad = function (f, v, name, need) { issues.push({ f: f, price: v, at: v > entry ? "above" : "below" }); errors.push(EN ? want + ": the " + name + " must be " + need + " the entry" : want + "：" + name + "要" + need + "入场价"); };
    if ((entry - stop) * dir <= 0) bad("stop", stop, tr("止损", "stop"), dir > 0 ? tr("低于", "below") : tr("高于", "above"));
    if (tp1 !== null && (tp1 - entry) * dir <= 0) bad("tp1", tp1, tr("目标 1 ", "target 1"), dir > 0 ? tr("高于", "above") : tr("低于", "below"));
    if (tp2 !== null && (tp2 - entry) * dir <= 0) bad("tp2", tp2, tr("目标 2 ", "target 2"), dir > 0 ? tr("高于", "above") : tr("低于", "below"));
    var fits = function (d) { return (entry - stop) * d > 0 && (tp1 === null || (tp1 - entry) * d > 0) && (tp2 === null || (tp2 - entry) * d > 0); };
    o.otherSideFits = !!errors.length && fits(-dir);                            // the same prices make sense the other way round
    o.dist = Math.abs(entry - stop); o.distPct = o.dist / entry * 100;
    o.perLot = (o.dist + spread) * contract; o.minLotRisk = o.perLot * step;
    if (bal !== null && bal > 0) o.minLotPct = o.minLotRisk / bal * 100;
    if (tp1 !== null) o.r1 = Math.abs(tp1 - entry) / o.dist;
    if (tp2 !== null) o.r2 = Math.abs(tp2 - entry) / o.dist;
    var best = Math.max(o.r1 || 0, o.r2 || 0); if (best > 0) o.breakeven = 1 / (1 + best) * 100;
    if (errors.length) return o;
    o.valid = true;
    if (bal === null || bal <= 0 || pct === null || pct <= 0) return o;
    o.riskUsd = bal * pct / 100; o.lotsRaw = o.riskUsd / o.perLot;
    var dec = Math.max(0, Math.round(-Math.log(step) / Math.LN10));
    o.lots = +(Math.floor(o.lotsRaw / step + 1e-9) * step).toFixed(dec);
    o.actualRisk = o.lots * o.perLot; o.actualPct = o.actualRisk / bal * 100;
    if (tp1 !== null) o.pnl1 = o.lots * Math.abs(tp1 - entry) * contract;
    if (tp2 !== null) o.pnl2 = o.lots * Math.abs(tp2 - entry) * contract;
    return o;
  }
  // The same plan pointed at `side`: a stop or target left on the wrong side of the entry is reflected across it,
  // keeping its distance. Used when the direction is switched, so the prices follow instead of turning into errors.
  function mirror(plan, side) {
    var e = num(plan.entry), dir = side === "short" ? -1 : 1, out = { side: side, entry: plan.entry, stop: plan.stop, tp1: plan.tp1, tp2: plan.tp2 }, moved = [];
    if (e === null) return { plan: out, changed: false, moved: moved };
    var flip = function (v) { return Math.round((2 * e - v) * 10) / 10; }, st = num(plan.stop);
    if (st !== null && (e - st) * dir < 0) { out.stop = flip(st); moved.push("stop"); }
    ["tp1", "tp2"].forEach(function (k) { var t = num(plan[k]); if (t !== null && (t - e) * dir < 0) { out[k] = flip(t); moved.push(k); } });
    return { plan: out, changed: moved.length > 0, moved: moved };
  }

  // ---------- where the timeframes stand ----------
  function tdir(E, tf) { var t = tfOk(E, tf); return !t ? 0 : t.trend === "bullish" ? 1 : t.trend === "bearish" ? -1 : 0; }
  // dir: 1 / -1 when weekly, daily and 4-hour agree, else 0. full: the 1-hour and 15-minute agree as well.
  function regime(E) {
    var ov = (E && E.overall) || {}, d = { W: tdir(E, "W"), D: tdir(E, "D"), "4H": tdir(E, "4H"), "1H": tdir(E, "1H"), "15M": tdir(E, "15M") };
    var a3 = d.W !== 0 && d.W === d.D && d.D === d["4H"] ? d.W : 0, full = a3 !== 0 && d["1H"] === a3 && d["15M"] === a3;
    var sum = d.W + d.D + d["4H"], lean = sum > 0 ? 1 : sum < 0 ? -1 : 0;          // what most of the three say
    var since = function (list) { var m = null; list.forEach(function (tf) { var t = tfOk(E, tf); if (t && num(t.since) !== null) m = m === null ? t.since : Math.max(m, t.since); }); return m; };
    return { dir: a3, full: full, dirs: d, lean: lean, lagging: a3 ? ["1H", "15M"].filter(function (tf) { return d[tf] !== a3; }) : [],
      odd: a3 ? [] : ["W", "D", "4H"].filter(function (tf) { return lean === 0 || d[tf] !== lean; }),
      since3: a3 ? since(["W", "D", "4H"]) : null, since5: full ? since(TF_ORDER) : null, open: ov.marketOpen !== false };
  }
  // The price a timeframe has to close beyond for its trend to turn `to` (1 up, -1 down), if the engine has one.
  function flipLevel(E, tf, to) { var t = tfOk(E, tf); if (!t) return null; return to > 0 ? num(t.swingHigh) : num(t.swingLow); }
  // The early word: all five would agree if every candle still needed closed at this price. A warning, never a signal:
  // entering on it did worse than waiting for the close (research/xau-replay/SPEED-PLAN.md). tf: the biggest candle
  // still needed, the last one that can settle it. Any of the five can be the one missing, not only the small two.
  function soonNeed(E, px) {
    var R = regime(E), out = null; px = num(px); if (R.full || px === null) return null;
    [1, -1].forEach(function (dir) {
      if (out) return;
      var miss = TF_ORDER.filter(function (tf) { return R.dirs[tf] !== dir; }), need = miss.map(function (tf) { return { tf: tf, p: flipLevel(E, tf, dir) }; });
      if (need.length && !need.some(function (g) { return g.p === null || (px - g.p) * dir <= 0; })) out = { dir: dir, tf: miss[0], need: need };
    });
    return out;
  }

  // ---------- chart patterns ----------
  // Which way a finished pattern points: a double top / bottom or head and shoulders that closed through its neckline,
  // or a triangle, wedge, channel, range or flag that broke out. 0 while it is still forming.
  function patternWay(p) {
    var s = (p && p.status) || "";
    return /closed below|broke out downward/.test(s) ? -1 : /closed above|broke out upward/.test(s) ? 1 : s === "broke out" ? (p.bias === "bullish" ? 1 : -1) : 0;
  }
  // The finished patterns on the daily, 4-hour and 1-hour charts (the ones the replay scored), biggest timeframe first.
  function patternsNow(E) {
    var out = [];
    ["D", "4H", "1H"].forEach(function (tf) {
      var t = tfOk(E, tf);
      ((t && t.patterns) || []).forEach(function (p) { var d = patternWay(p); if (d) out.push({ tf: tf, dir: d, name: p.name, text: EN ? TF_ZH[tf] + " " + p.name.toLowerCase() + " (broke " + (d > 0 ? "up" : "down") + ")" : TF_ZH[tf] + (ZH.pattern[p.name] || p.name) + "（已" + (d > 0 ? "向上" : "向下") + "突破）" }); });
    });
    return out;
  }

  // A pattern's own trade, the textbook way: in on the break of its key level (or now, if it has already broken),
  // stop where the pattern fails, target its measured move. dir: the way it points (forming patterns: their bias;
  // patterns with no bias, such as a range still forming, have no plan). Returns null when the levels don't line up.
  // The replay scored these (research/xau-replay/pattern_check.js): about six in ten win, and on average about 0R.
  function patternPlan(p, price) {
    var done = patternWay(p), dir = done || (p.bias === "bullish" ? 1 : p.bias === "bearish" ? -1 : 0);
    if (!dir) return null;
    var key = num(p.level), up = num(p.upper), lo = num(p.lower), ht = num(p.height);
    var trig = key !== null ? key : dir > 0 ? up : lo;
    var stop = num(p.invalid) !== null ? num(p.invalid) : dir > 0 ? lo : up;
    var tgt = num(p.target) !== null ? num(p.target) : ht !== null && trig !== null ? trig + dir * ht : null;
    var entry = done ? num(price) : trig;
    if (entry === null || stop === null || tgt === null || (entry - stop) * dir <= 0 || (tgt - entry) * dir <= 0) return null;
    return { dir: dir, done: !!done, entry: entry, trigger: trig, stop: stop, target: tgt, rr: Math.abs(tgt - entry) / Math.abs(entry - stop) };
  }

  // ---------- the plan the replay supports ----------
  // Enter at the current price with the big trend; stop 3 x 1H ATR away; target 3R, or no target and a trailing stop.
  function systemPlan(E, dir, opts) {
    opts = opts || {}; var H1 = tfOk(E, "1H"), price = num(E && E.price);
    if (!dir || !H1 || !H1.atr || price === null) return null;
    var r1 = function (v) { return Math.round(v * 10) / 10; }, k = num(opts.stopAtr) || SYS.stopAtr, dist = k * H1.atr;
    return { side: dir > 0 ? "long" : "short", entry: r1(price), stop: r1(price - dir * dist), tp1: opts.trail ? null : r1(price + dir * SYS.targetR * dist), tp2: null,
      dist: dist, atr: H1.atr, stopAtr: k, trail: !!opts.trail, trailDist: r1(SYS.trailR * dist) };
  }

  // ---------- pre-trade checklist ----------
  // ok: true pass, false fail, null not applicable yet. Every rule here was scored in the replay.
  function checks(E, plan, sz) {
    var dir = plan.side === "short" ? -1 : 1, R = regime(E), H1 = tfOk(E, "1H"), out = [], way = dir > 0 ? tr("向上", "up") : tr("向下", "down");
    var zh = function (tf) { return TF_ZH[tf]; }, say = function (v) { return v > 0 ? tr("向上", "up") : v < 0 ? tr("向下", "down") : tr("不明", "unclear"); };
    out.push({ id: "htf", label: tr("周线、日线、4 小时都和你同向", "Weekly, daily and 4-hour all your way"), ok: R.dir === dir,
      detail: EN ? (R.dir === dir ? "All three big trends " + way + ": with the trend" : R.dir === -dir ? "All three big trends " + say(-dir) + ": this trade is against the trend, which lost steadily in the replay" :
        "Weekly " + say(R.dirs.W) + ", daily " + say(R.dirs.D) + ", 4-hour " + say(R.dirs["4H"]) + ": not agreeing yet; the replay found no edge at such times")
        : R.dir === dir ? "三个大周期都" + way + "，顺势" : R.dir === -dir ? "三个大周期都" + say(-dir) + "：这笔是逆势，回放里逆势长期亏损" :
        "周线" + say(R.dirs.W) + "、日线" + say(R.dirs.D) + "、4 小时" + say(R.dirs["4H"]) + "：还不一致，回放里这种时候没有优势" });
    out.push({ id: "ltf", label: tr("1 小时、15 分钟也同向", "1-hour and 15-min the same way too"), ok: R.dir === dir ? R.full : null,
      detail: R.dir !== dir ? tr("先等大方向一致", "First wait for the big trends to agree") : R.full ? tr("小周期也转成" + way + "了", "The small timeframes have turned " + way + " too") : EN ? R.lagging.map(zh).join(" and ") + " not " + way + " yet: wait for them to turn" : R.lagging.map(zh).join("、") + "还没转成" + way + "：等它转过来再进" });
    var stopOk = null, sd = tr("需要入场价与止损价", "Needs the entry and the stop");
    if (sz && sz.dist && H1 && H1.atr) {
      var m = sz.dist / H1.atr; stopOk = m >= SYS.minStopAtr && m <= SYS.maxStopAtr;
      sd = EN ? "The stop is " + m.toFixed(1) + " × the 1-hour ATR" + (m < SYS.minStopAtr ? ": too close. Stops of 1.5 × or less had no edge in the replay; 3 × is the rule" : m > SYS.maxStopAtr ? ": very far, which squeezes the lot size" : ": wide enough")
        : "止损距离是 1 小时平均波幅的 " + m.toFixed(1) + " 倍" + (m < SYS.minStopAtr ? "：太近。回放里 1.5 倍以内的止损没有优势，建议 3 倍" : m > SYS.maxStopAtr ? "：很远，手数会被压得很小" : "，够宽");
    }
    out.push({ id: "stop", label: tr("止损留够空间", "The stop has room"), ok: stopOk, detail: sd });
    var best = sz ? Math.max(sz.r1 || 0, sz.r2 || 0) : 0, hasT = num(plan.tp1) !== null || num(plan.tp2) !== null;
    out.push({ id: "rr", label: tr("让利润跑：目标至少 2R，或跟踪止损", "Let profits run: target 2R or more, or a trailing stop"), ok: sz && sz.dist ? (hasT ? best >= 2 : true) : null,
      detail: !hasT ? tr("没设目标：按跟踪止损离场（止损跟在最好价格后面 2R）", "No target: leave by the trailing stop (2R behind the best price)") : best > 0 ? (EN ? "The furthest target is " + best.toFixed(1) + "R" + (best < 2 ? ": too close. The replay's profit came mostly from the few trades that ran far" : "") : "最远目标是 " + best.toFixed(1) + "R" + (best < 2 ? "：太近。回放里的利润主要来自少数走得很远的单子" : "")) : tr("需要止损与目标价", "Needs the stop and a target") });
    var riskOk = null, rd = tr("需要账户余额与风险比例", "Needs the balance and the risk %");
    if (sz && sz.actualPct !== null) {
      if (sz.lots === 0) { riskOk = false; rd = EN ? "The smallest lot already loses " + usd(sz.minLotRisk) + ", over your limit of " + usd(sz.riskUsd) + ": this one cannot be opened; do not move the stop closer to fit it" : "最小手数就要亏 " + usd(sz.minLotRisk) + "，超过你设的上限 " + usd(sz.riskUsd) + "：这笔开不了，不要为了开单把止损缩近"; }
      else { riskOk = sz.actualPct <= 1.0001; rd = EN ? "Loses " + usd(sz.actualRisk) + " at the stop, " + sz.actualPct.toFixed(2) + "% of the account" + (!riskOk ? ": over 1%; a few losses in a row would hurt" : sz.actualPct > 0.55 ? ". The replay's longest losing run was " + MK.streak + " trades; 0.5% or less is steadier" : "") : "止损时亏 " + usd(sz.actualRisk) + "，是账户的 " + sz.actualPct.toFixed(2) + "%" + (!riskOk ? "：超过 1%，连亏几笔账户就很伤" : sz.actualPct > 0.55 ? "。回放里最长连亏过 " + MK.streak + " 笔，0.5% 或更少更稳" : ""); }
    }
    out.push({ id: "risk", label: tr("单笔亏损不超过 1%", "No more than 1% lost a trade"), ok: riskOk, detail: rd });
    return out;
  }

  // ---------- the one-line answer ----------
  function scoreWord(sc) { sc = num(sc) || 0; return EN ? (sc >= 7 ? "strongly bullish" : sc >= 4 ? "bullish" : sc >= 1 ? "slightly bullish" : sc === 0 ? "neutral" : sc >= -3 ? "slightly bearish" : sc >= -6 ? "bearish" : "strongly bearish") : sc >= 7 ? "强烈看多" : sc >= 4 ? "看多" : sc >= 1 ? "略偏多" : sc === 0 ? "中性" : sc >= -3 ? "略偏空" : sc >= -6 ? "看空" : "强烈看空"; }
  // When all five timeframes lined up, and where price closed on that candle (null once it is older than the bars kept).
  function signalInfo(E, R) {
    if (!R.full || num(R.since5) === null) return null;
    var M = tfOk(E, "15M"), bars = (M && M.bars) || [], px = null;
    for (var i = bars.length - 1; i >= 0; i--) { var end = (bars[i][0] + 900) * 1000; if (end === R.since5) { px = num(bars[i][4]); break; } if (end < R.since5) break; }
    return { at: R.since5, price: px, movedR: null };
  }
  // What it would take for the weekly, daily and 4-hour trends to all point `to`: the ones still to turn, the close
  // each needs, and how far the furthest of those is from price. complete: the engine has a level for every one.
  function pathTo(E, R, to, price) {
    var need = ["W", "D", "4H"].filter(function (tf) { return R.dirs[tf] !== to; }), steps = [], far = 0;
    need.forEach(function (tf) { var lv = flipLevel(E, tf, to); if (lv !== null) { steps.push({ tf: tf, price: lv }); if (price !== null) far = Math.max(far, Math.abs(lv - price)); } });
    return { to: to, need: need, steps: steps, complete: need.length > 0 && steps.length === need.length, far: far };
  }
  // "What do I do now?" in plain words.
  // level: go (all five timeframes agree) / ready (the big three agree, the small ones not yet) / none (the big three disagree).
  // next: the same answer as numbered steps: what to do now, what to wait for (alerts: prices worth an alarm), what
  // the trade will look like (fill: offer to load it into the plan), and what to do with a trade already on.
  function verdict(E, nowMs) {
    nowMs = nowMs || Date.now();
    var R = regime(E), buy = R.dir > 0, way = buy ? tr("向上", "up") : tr("向下", "down"), say = function (v) { return v > 0 ? tr("向上", "up") : v < 0 ? tr("向下", "down") : tr("不明", "unclear"); };
    var zh = function (tf) { return TF_ZH[tf]; }, cross = function (to) { return to > 0 ? tr("站上", "above") : tr("跌破", "below"); }, act = function (to) { return to > 0 ? tr("做多", "long") : tr("做空", "short"); };
    var cl = function (tf, to, p) { return EN ? "a " + zh(tf) + " close " + cross(to) + " " + p : zh(tf) + "收盘" + cross(to) + " " + p; };   // "a 4-hour close above 4,012.3"
    var price = num(E && E.price), H1 = tfOk(E, "1H"), room = H1 && H1.atr ? SYS.stopAtr * H1.atr : null;
    var v = { level: "none", side: R.dir > 0 ? "long" : R.dir < 0 ? "short" : "none", regime: R, closed: !R.open, reasons: [], ideas: [], lines: [], next: [], other: null, signal: null, plan: null, fresh: false };
    var big = EN ? "Weekly " + say(R.dirs.W) + ", daily " + say(R.dirs.D) + ", 4-hour " + say(R.dirs["4H"]) : "周线" + say(R.dirs.W) + "、日线" + say(R.dirs.D) + "、4 小时" + say(R.dirs["4H"]);
    v.reasons.push({ key: "dir", label: tr("大方向", "Big trend"), ok: R.dir !== 0, text: R.dir ? tr("周线、日线、4 小时都" + way, "Weekly, daily and 4-hour all " + way) : big + tr("，还不一致", ": not agreeing yet") });
    v.reasons.push({ key: "small", label: tr("小周期", "Small timeframes"), ok: R.dir ? R.full : null,
      text: !R.dir ? tr("大方向一致后才看小周期", "Small timeframes count only once the big trends agree") : R.full ? tr("1 小时和 15 分钟也" + way, "1-hour and 15-min " + way + " too") : EN ? R.lagging.map(zh).join(" and ") + " still " + say(-R.dir) + "; wait for them to turn back " + way : R.lagging.map(zh).join("、") + "还是" + say(-R.dir) + "，等它转回" + way });
    // chart patterns: shown for what they are. The replay found no edge in them, alone or with the rule; the rare
    // finished pattern pointing against a signal did worse, on too few trades to change the rule (MK.patAgainst).
    var pats = patternsNow(E), pAg = pats.filter(function (p) { return R.dir && p.dir === R.dir; }), pOp = pats.filter(function (p) { return R.dir && p.dir === -R.dir; });
    var ptx = function (list) { return list.slice(0, 2).map(function (p) { return p.text; }).join(tr("；", "; ")); };
    v.patterns = { all: pats, agree: pAg, against: pOp };
    v.reasons.push({ key: "pat", label: tr("形态", "Patterns"), ok: pOp.length && !pAg.length ? false : null,
      text: EN ? (!pats.length ? "No finished pattern on the daily, 4-hour or 1-hour" : !R.dir ? ptx(pats) + ": reference only"
        : pOp.length ? ptx(pOp) + ": against the big trend" + (pAg.length ? "; " + pAg[0].text + " with it" : "") : ptx(pAg) + ": with the big trend (reference only)")
        : !pats.length ? "日线、4 小时、1 小时都没有已完成的形态" : !R.dir ? ptx(pats) + "，只作参考"
        : pOp.length ? ptx(pOp) + "，和大方向相反" + (pAg.length ? "；" + pAg[0].text + "同向" : "") : ptx(pAg) + "，和大方向一致（只作参考）" });
    // What it takes for the big three to turn `to`: the 4-hour close that ends the current direction (then 观望), and
    // the daily and weekly closes that would make it the other way round.
    var turnText = function (to) {
      var f = function (tf) { var p = flipLevel(E, tf, to); return p === null ? null : { tf: tf, p: p, d: price === null ? null : Math.abs(p - price) }; };
      var h4 = R.dirs["4H"] === to ? null : f("4H"), rest = ["D", "W"].filter(function (tf) { return R.dirs[tf] !== to; }).map(f).filter(Boolean);
      var fp = function (x) { return cl(x.tf, to, fmt(x.p, 1)) + (x.d !== null ? tr("（差 " + fmt(x.d, 1) + "）", " (" + fmt(x.d, 1) + " away)") : ""); };
      if (EN) return (h4 ? fp(h4) + ": the three big trends stop agreeing and it becomes a wait. " : "") + (rest.length ? "To turn " + act(to) + ", it would also take " + rest.map(fp).join(" and ") + "." : "");
      return (h4 ? fp(h4) + "：三个大周期不再同向，变成观望。" : "") + (rest.length ? "要转成" + act(to) + "方向，还要" + rest.map(fp).join("、") + "。" : "");
    };
    var add = function (dir, p, text) { p = num(p); if (p !== null) v.lines.push({ dir: dir, price: p, text: text, dist: price === null ? null : Math.abs(p - price) }); return p; };
    var away = function (p) { return price === null ? "" : EN ? "$" + fmt(Math.abs(p - price), 1) + (p >= price ? " above" : " below") + " the price now. " : "比现价" + (p >= price ? "高 " : "低 ") + fmt(Math.abs(p - price), 1) + " 美元。"; };
    var step = function (lead, text, more) { var s = { lead: lead, text: text }, k; for (k in (more || {})) s[k] = more[k]; v.next.push(s); };
    var closes = function (list, to) { return list.map(function (g) { return cl(g.tf, to, fmt(g.price, 1)); }); };
    var andAlso = function (list) { return EN ? list.join(", and ") : list.map(function (x, i) { return i ? "，以及" + (/^\d/.test(x) ? " " : "") + x : x; }).join(""); };
    var waitWord = function (n) { return EN ? (n === 1 ? "Wait for this step: " : "Wait for these steps: ") : n === 1 ? "等这一步：" : n === 2 ? "等这两步：" : "等这几步："; };
    var alarm = tr("不开这页的时候，可以在 MT5 给这里的价位设价格提醒；到价只是提醒，还要看收盘。", "When this page is closed, set MT5 price alerts at these levels; reaching the price is only a reminder, the close decides.");

    if (!R.dir) {
      v.tag = tr("先观望", "Wait"); v.title = tr("先观望：大周期方向不一致", "Wait: the big trends do not agree");
      v.text = big + tr("。", ". ") + MK.noneText;
      step(tr("现在：不下单", "Now: no trade"), tr("不用找入场点，也不用一直盯着：结论每 15 分钟重算一次。", "No need to hunt for an entry or keep watching: the answer is worked out again every 15 minutes."));
      // the two ways the three can line up; the one whose furthest level is nearer comes first
      var up = pathTo(E, R, 1, price), dn = pathTo(E, R, -1, price), ways = [up, dn].filter(function (w) { return w.complete; }).sort(function (a, b) { return a.far - b.far; });
      var first = ways[0];
      if (first) {
        first.steps.forEach(function (g) { add(first.to > 0 ? "up" : "down", g.price, EN ? "A " + zh(g.tf) + " close " + cross(first.to) + " here" + (first.steps.length === 1 ? " and all three big trends are " + say(first.to) : " (turning " + say(first.to) + " takes " + first.steps.length + " steps; this is one)") : zh(g.tf) + "收盘" + cross(first.to) + "这里" + (first.steps.length === 1 ? "，就三周期同向" + say(first.to) : "（要转" + say(first.to) + "得走 " + first.steps.length + " 步，这是其中一步）")); });
        var g0 = first.steps[0], past = first.steps.length === 1 && price !== null && (g0.price - price) * first.to < 0;
        if (EN) {
          step(waitWord(first.steps.length) + andAlso(closes(first.steps, first.to)), (past ? "The price is already $" + fmt(Math.abs(price - g0.price), 1) + (first.to < 0 ? " below" : " above") + " it, but the " + zh(g0.tf) + " candle's close decides: it counts only if still " + (first.to < 0 ? "below" : "above") + " at the close. " : first.steps.length === 1 ? away(g0.price) : "") + "Then weekly, daily and 4-hour are all " + say(first.to) + ". " + alarm);
          step("Then: wait for the 1-hour and 15-min to turn " + say(first.to) + " too", "All five agreeing is the " + act(first.to) + " signal; this page will then give the entry, stop and target. " + (room ? "At today's volatility the stop would be about $" + fmt(room, 0) + " from the entry." : ""));
        } else {
        step(waitWord(first.steps.length) + andAlso(closes(first.steps, first.to)), (past ? "现价已经" + (first.to < 0 ? "低于" : "高于") + "它 " + fmt(Math.abs(price - g0.price), 1) + " 美元，但要看 " + zh(g0.tf) + " K 线收盘：收盘时还在" + (first.to < 0 ? "下方" : "上方") + "才算。" : first.steps.length === 1 ? away(g0.price) : "") + "那时周线、日线、4 小时就同向" + say(first.to) + "了。" + alarm);
        step("然后：等 1 小时和 15 分钟也" + say(first.to), "五个周期同向才是" + act(first.to) + "信号，到时这里会直接给出入场价、止损和目标。" + (room ? "按现在的波动，止损会离入场价 " + fmt(room, 0) + " 美元左右。" : ""));
        }
      } else step(tr("等周线、日线、4 小时走到同一个方向", "Wait for weekly, daily and 4-hour to line up"), tr("现在还算不出哪个价位会让它们同向；有了以后会列在「会改变局面的价位」里。", "No price can be worked out yet that would line them up; once there is one, it appears under «Levels that change the picture»."));
      step(tr("手上已经有单", "If you already have a trade on"), tr("按这页规则开的顺势单：用跟踪止损的，三个大周期已经不再同向，规则是离场；用目标 3R 的，止损和目标都不动，等价格碰到其中一个。", "A trade opened by this page's rule: with the trailing stop, the three big trends no longer agree, so the rule says leave; with the 3R target, leave the stop and target as they are and wait for price to reach one."));
      var rest = first ? (first === up ? dn : up) : null;                         // the other way round, so the picture is complete
      if (rest) v.other = EN ? "The other way round, all " + say(rest.to) + " would need " + (rest.complete ? andAlso(closes(rest.steps, rest.to)) + (price !== null ? " (the furthest $" + fmt(rest.far, 0) + " from the price now)." : ".") : rest.need.map(zh).join(" and ") + " all to turn " + say(rest.to) + "; no clear price yet.")
        : "反过来要变成同向" + say(rest.to) + "，需要" + (rest.complete ? andAlso(closes(rest.steps, rest.to)) + (price !== null ? "（最远的离现价 " + fmt(rest.far, 0) + " 美元）。" : "。") : rest.need.map(zh).join("和") + "都转" + say(rest.to) + "，现在还没有明确的价位。");
    } else {
      v.plan = systemPlan(E, R.dir);
      var out = flipLevel(E, "4H", -R.dir), k = v.plan;
      if (R.full) {
        v.level = "go"; v.fresh = num(R.since5) !== null && nowMs - R.since5 <= 2 * 3600000;
        // a market where the rule is not proven (Bitcoin) says so in the answer itself
        v.tag = EN ? (MK.observe ? "Watch only · " : "") + (buy ? "Go long with the trend" : "Go short with the trend") : (MK.observe ? "仅观察 · " : "") + "可以顺势" + act(R.dir); v.title = EN ? "All five timeframes " + way + ": " + (buy ? "long" : "short") + " with the trend" + (MK.observe ? " (watch only)" : "") : "五个周期都" + way + "，可以顺势" + act(R.dir) + (MK.observe ? "（只作观察）" : "");
        v.text = MK.goText + (R.dir < 0 ? MK.shortWarn : MK.longWarn) + (EN ? "Enter at the price now with the stop beyond 3 × the 1-hour ATR, not closer; let winners run, target 3R or a trailing stop. " + (v.fresh ? "The signal is fresh." : "The signal has been on for a while: entering now, the stop and target are worked out from the price now (the levels below).")
          : "按现价进，止损放在 3 倍小时波幅之外，别放近；赢的时候让它走，目标 3R 或用跟踪止损。" + (v.fresh ? "信号刚出现不久。" : "信号已出现一段时间：现在进的话，止损和目标按现价重新算（下面的价位就是）。"));
        // how old the signal is, and how far price has gone since. Entering later, with the stop set 3 x ATR from the
        // later price, did about as well in the replay as entering on the signal (rules.late1r), so a signal that has
        // run is still a signal: the plan is always worked out from the price now.
        var sig = v.signal = signalInfo(E, R), note = "";
        if (sig) {
          note = EN ? "The signal came " + agoTxt(nowMs - sig.at) + (sig.price !== null ? " at " + fmt(sig.price, 1) : "") + ". " : "信号 " + agoTxt(nowMs - sig.at) + "出现" + (sig.price !== null ? "，当时 " + fmt(sig.price, 1) : "") + "。";
          if (sig.price !== null && price !== null && room) {
            var m = sig.movedR = (price - sig.price) * R.dir / room;
            note += EN ? (m >= 1 ? "Price has since run " + m.toFixed(1) + "R its way. " + MK.lateText + "The stop is set from the price now, not the signal's stop. "
              : m >= 0.25 ? "Price has since run " + m.toFixed(1) + "R its way; the stop and target below are worked out from the price now. "
              : m <= -0.25 ? "The price is $" + fmt(Math.abs(price - sig.price), 1) + (buy ? " lower" : " higher") + " than then: a better entry, but price is also coming back. " : "The price is about where it was. ")
              : m >= 1 ? "之后价格已经顺着走了 " + m.toFixed(1) + "R。" + MK.lateText + "止损按现价重新放，不沿用信号当时的止损。"
              : m >= 0.25 ? "之后价格顺着走了 " + m.toFixed(1) + "R，下面的止损和目标已按现价重新算。"
              : m <= -0.25 ? "现在的价格比当时" + (buy ? "低" : "高") + " " + fmt(Math.abs(price - sig.price), 1) + " 美元：进场价更好，但也说明价格在往回走。" : "价格和当时差不多。";
          }
        }
        if (k) step(MK.observe ? tr("现在：只作观察，不建议用真钱", "Now: watch only, not with real money") : EN ? "Now: go " + act(R.dir) + " with the trend" : "现在：可以顺势" + act(R.dir), note + (EN ? (buy ? "Buy at the price now " : "Sell at the price now ") + fmt(k.entry, 1) + ", stop " + fmt(k.stop, 1) + " ($" + fmt(k.dist, 0) + " from the entry), target " + fmt(k.tp1, 1) + " (3R)." : (buy ? "现价买入 " : "现价卖出 ") + fmt(k.entry, 1) + "，止损 " + fmt(k.stop, 1) + "（离入场 " + fmt(k.dist, 0) + " 美元），目标 " + fmt(k.tp1, 1) + "（3R）。"), { fill: tr("填进计划 →", "Put it in the plan →") });
        step(tr("算好手数", "Work out the size"), EN ? "Fill in your balance in step 3 of the planner; risk at most " + SYS.risk + "% of the account a trade. The replay's longest losing run was " + MK.streak + " trades, so do not add to it." : "在计划器第 3 步填账户余额，每笔最多亏账户的 " + SYS.risk + "%。回放里最长连亏过 " + MK.streak + " 笔，所以不要加码。");
        // the replay tested two ways out, each on its own: a fixed 3R target, or a daily trailing stop with the regime exit
        if (k) step(tr("进场前选好离场做法（二选一，进场后别换）", "Choose the exit before entering (one of two; do not switch after)"), EN ? "Target 3R: stop " + fmt(k.stop, 1) + " and target " + fmt(k.tp1, 1) + " stay where they are. Trailing stop: no target; each day at 08:00 SGT move the stop to $" + fmt(k.trailDist, 0) + " behind the best price since entry, only in your favour. With either, do not move the stop to break-even early: in the replay that made less." : "目标 3R：止损 " + fmt(k.stop, 1) + "、目标 " + fmt(k.tp1, 1) + " 都不动。跟踪止损：不设目标，每天 08:00 SGT 把止损挪到入场以来最好价格后面 " + fmt(k.trailDist, 0) + " 美元，只往有利方向挪。两种都别提前挪到成本价，回放里那样会少赚。");
        step(tr("什么时候离场", "When to leave"), EN ? "Target 3R: it ends at the stop or the target; a change in the big trends is not a reason to leave early. Trailing stop: it ends at the moved stop" + (out !== null ? ", or on a 4-hour close " + cross(-R.dir) + " " + fmt(out, 1) + " (the three big trends stop agreeing)" : ", or when the three big trends stop agreeing (this turns back to «Wait»)") + "." : "目标 3R：碰到止损或目标就结束，大周期变了也不提前走。跟踪止损：碰到挪过的止损就结束" + (out !== null ? "；或者 4 小时收盘" + cross(-R.dir) + " " + fmt(out, 1) + "（三个大周期不再同向）就离场" : "；或者三个大周期不再同向（这里变回「先观望」）就离场") + "。");
      } else {
        var lag = R.lagging.map(zh).join(tr("和 ", " and "));
        // the small timeframes running against the big three: say so plainly (a bounce in a downtrend, a pullback in
        // an uptrend), and what it would take for the big direction itself to change
        var against = R.lagging.filter(function (tf) { return R.dirs[tf] === -R.dir; }), swing = buy ? tr("回调", "pullback") : tr("反弹", "bounce"), other = buy ? tr("向下", "down") : tr("向上", "up");
        v.level = "ready";
        if (EN) {
          v.tag = against.length ? (buy ? "Pullback · big trend up" : "Bounce · big trend down") : (buy ? "Waiting for small timeframes to turn up" : "Waiting for small timeframes to turn down");
          v.title = against.length ? "Big trend " + way + ", in a " + swing + " now (" + against.map(zh).join(", ") + " " + other + ")" : "Big trend " + way + ": wait for the small timeframes before " + (buy ? "buying" : "selling");
          v.text = "Weekly, daily and 4-hour all " + way + "; " + (against.length ? against.map(zh).join(" and ") + " turned " + other + ", price is in a " + swing : lag + " not turned yet") + ". By the rule: do not chase this " + swing +
            " (against the three big trends, which lost steadily in the replay), and do not " + (buy ? "buy" : "sell") + " yet either; when the " + swing + " ends and the small timeframes turn back " + way + ", that is the " + act(R.dir) + " signal. " + turnText(-R.dir);
          step(against.length ? "Now: do not chase the " + swing + ", and do not " + (buy ? "buy" : "sell") + " yet" : "Now: not in yet", against.length ? "Price is in a " + swing + " (" + against.map(zh).join(", ") + " " + other + "). Trading against the three big trends lost steadily in the replay; wait for the " + swing + " to end, then go " + act(R.dir) + "." : "The big trend is right; the small timeframes have not turned back yet. You can get the plan ready.");
        } else {
        v.tag = against.length ? swing + "中 · 大方向" + way : (buy ? "等小周期转多" : "等小周期转空");
        v.title = against.length ? "大方向" + way + "，现在在" + swing + "（" + against.map(zh).join("、") + other + "）" : "大方向" + way + "，等小周期转回来再" + (buy ? "买" : "卖");
        v.text = "周线、日线、4 小时都" + way + "；" + (against.length ? against.map(zh).join("和 ") + "已经转" + other + "，价格在" + swing : lag + "还没转过来") + "。按规则：不追这段" + swing +
          "（逆着三个大周期做，回放里长期亏损），也先不" + (buy ? "买" : "卖") + "；" + swing + "结束、小周期转回" + way + "，才是" + act(R.dir) + "信号。" + turnText(-R.dir);
        step(against.length ? "现在：不追" + swing + "，也先不" + (buy ? "买" : "卖") : "现在：先不进", against.length ? "价格在" + swing + "（" + against.map(zh).join("、") + other + "）。逆着三个大周期做在回放里长期亏损；等" + swing + "结束再" + act(R.dir) + "。" : "大方向对了，小周期还没转回来。可以先把计划准备好。");
        }
        var got = [];
        R.lagging.forEach(function (tf) { var p = add(buy ? "up" : "down", flipLevel(E, tf, R.dir), EN ? "A " + zh(tf) + " close " + cross(R.dir) + " here turns it back " + way : zh(tf) + "收盘" + cross(R.dir) + "这里，就转回" + way); if (p !== null) got.push({ tf: tf, price: p }); });
        if (got.length && got.length === R.lagging.length) step(waitWord(got.length) + andAlso(closes(got, R.dir)), (got.length === 1 ? away(got[0].price) : "") + (EN ? "Once they turn back, all five agree: that is the " + act(R.dir) + " signal. " : "转回来以后五个周期同向，就是" + act(R.dir) + "信号。") + alarm);
        else step(EN ? "Wait for " + lag + " to turn back " + way : "等" + lag + "转回" + way, EN ? "The page works it out again every 15 minutes; when they turn back the answer here becomes «Go " + act(R.dir) + " with the trend»." : "页面每 15 分钟重算一次，转回来时这里的结论会变成「可以顺势" + act(R.dir) + "」。");
        // the trade the signal would give if it fired at the last close still needed: concrete prices, worked out now
        var trig = got.length ? got.slice().sort(function (a, b) { return (a.price - b.price) * R.dir; })[got.length - 1].price : null;
        if (k) step(tr("到时候这样做", "What to do then"), EN ? (trig !== null ? "If it fires near " + fmt(trig, 1) + ": " + (buy ? "buy" : "sell") + " about " + fmt(trig, 1) + ", stop about " + fmt(trig - R.dir * k.dist, 1) + ", target about " + fmt(trig + R.dir * SYS.targetR * k.dist, 1) + " (3R). When it fires, this page gives the exact prices from the price and volatility then."
            : (buy ? "Buy" : "Sell") + " at the price then, with the stop about $" + fmt(k.dist, 0) + (buy ? " below" : " above") + " the entry (3 × the 1-hour ATR), and the target 3 × the stop distance.")
          : (trig !== null ? "如果在 " + fmt(trig, 1) + " 附近触发：" + (buy ? "买入" : "卖出") + "约 " + fmt(trig, 1) + "，止损约 " + fmt(trig - R.dir * k.dist, 1) + "，目标约 " + fmt(trig + R.dir * SYS.targetR * k.dist, 1) + "（3R）。触发时这里会按当时的价格和波动直接给出准确价位。"
          : "按当时的价格" + (buy ? "买入" : "卖出") + "，止损放在入场价" + (buy ? "下方" : "上方") + " " + fmt(k.dist, 0) + " 美元左右（3 倍小时波幅），目标是止损距离的 3 倍。"), { fill: tr("先填进计划看看 →", "Try it in the plan →") });
        step(EN ? "When to stop looking " + (buy ? "long" : "short") : "什么时候不再看" + (buy ? "多" : "空"), turnText(-R.dir));
      }
      if (v.level === "go" && pOp.length && !pAg.length) v.next.splice(1, 0, { lead: tr("注意：有反方向的形态", "Note: a pattern points the other way"), text: ptx(pOp) + tr("，和信号方向相反。", ": against the signal. ") + MK.patAgainst });
      // what ends it: the 4-hour trend turning against
      add(buy ? "down" : "up", out, EN ? "A 4-hour close " + (buy ? "below" : "above") + " here and the three big trends stop agreeing: a trailing-stop position leaves here" : "4 小时收盘" + (buy ? "跌破" : "站上") + "这里，三周期不再同向：用跟踪止损的持仓在这里离场");
    }
    return v;
  }
  // ---------- managing a position that is on ----------
  // pos: { side, entry, stop (now), initStop, tp1 (null = trailing), at (entry ms), stopAt (ms the stop was last set), mode "target" | "trail" }
  // bars: candles that opened at or after the entry, oldest first, rows [openMs, o, h, l, c, …]. live: the price now.
  // The trailing rule is the replay's: the stop moves once a day, at 00:00 UTC (08:00 SGT), to 2R behind the best
  // price since entry, and only ever towards profit; with a trailing stop, the trade ends when the weekly, daily and
  // 4-hour trends no longer all point its way. With a 3R target, stop and target stay where they are.
  function manage(pos, bars, live, nowMs, regimeDir) {
    var dir = pos.side === "short" ? -1 : 1, e = num(pos.entry), st0 = num(pos.initStop), st = num(pos.stop), tp = num(pos.tp1), px = num(live);
    if (e === null || st === null || st0 === null || !(Math.abs(e - st0) > 0)) return null;
    var R = Math.abs(e - st0), gap = SYS.trailR * R, better = function (a, b) { return dir > 0 ? Math.max(a, b) : Math.min(a, b); };
    var best = e, day = Math.floor(pos.at / 86400000), trail = st0, stopHitAt = null, targetHitAt = null, since = num(pos.stopAt) || pos.at;
    (bars || []).forEach(function (k) {
      var d = Math.floor(k[0] / 86400000);
      if (d > day) { trail = better(trail, best - dir * gap); day = d; }
      best = better(best, dir > 0 ? k[2] : k[3]);
      if (stopHitAt === null && k[0] >= since && (dir > 0 ? k[3] <= st : k[2] >= st)) stopHitAt = k[0];
      if (targetHitAt === null && tp !== null && (dir > 0 ? k[2] >= tp : k[3] <= tp)) targetHitAt = k[0];
    });
    if (Math.floor(nowMs / 86400000) > day) trail = better(trail, best - dir * gap);
    if (px !== null) best = better(best, px);                                   // today's best counts towards tomorrow's move
    if (px !== null && (px - st) * dir <= 0 && stopHitAt === null) stopHitAt = nowMs;
    if (px !== null && tp !== null && (px - tp) * dir >= 0 && targetHitAt === null) targetHitAt = nowMs;
    var r1 = function (v) { return Math.round(v * 10) / 10; };
    return { dir: dir, R: R, best: best, bestR: (best - e) * dir / R, trailStop: r1(trail), nextStop: r1(better(trail, best - dir * gap)), nextAt: (Math.floor(nowMs / 86400000) + 1) * 86400000,
      pnlPts: px === null ? null : (px - e) * dir, pnlR: px === null ? null : (px - e) * dir / R, toStop: px === null ? null : (px - st) * dir, toTarget: px === null || tp === null ? null : (tp - px) * dir,
      stopHitAt: stopHitAt, targetHitAt: targetHitAt, first: stopHitAt !== null && (targetHitAt === null || stopHitAt <= targetHitAt) ? "stop" : targetHitAt !== null ? "target" : null,
      moveStop: pos.mode === "trail" && (trail - st) * dir > 0.05, split: regimeDir !== dir };
  }
  // Nearest support and resistance worth naming: the closest level with some confluence on each side.
  function nearest(E) {
    var L = levels(E, { each: 12 }).points;
    var pick = function (side) {
      var list = L.filter(function (l) { return l.side === side; }); if (side === "res") list = list.slice().reverse();   // nearest first
      return list.filter(function (l) { return l.strength >= 3; })[0] || list[0] || null;
    };
    return { res: pick("res"), sup: pick("sup") };
  }
  // The plan as one sentence. Returns parts so the page can bold the numbers: [{t: text, b: true?}]
  function sentence(plan, sz) {
    var e = num(plan.entry), st = num(plan.stop), t1 = num(plan.tp1), t2 = num(plan.tp2), P = [];
    if (e === null || st === null || !sz || !sz.valid) return P;
    var buy = plan.side !== "short", sized = sz.lots !== null && sz.lots > 0;
    var b = function (x) { P.push({ t: x, b: true }); }, n = function (x) { P.push({ t: x }); };
    if (EN) {
      n(buy ? "Buy " : "Sell "); if (sized) { b(sz.lots.toFixed(2) + " lots"); n(" "); } n("at "); b(fmt(e, 1)); n(". ");
      n("Stopped out if price " + (buy ? "falls to " : "rises to ")); b(fmt(st, 1));
      if (sized) { n(", losing about "); b(usd(sz.actualRisk)); n(" (" + sz.actualPct.toFixed(2) + "% of the account)"); } else n(" ($" + fmt(sz.dist, 1) + " away)");
    } else {
    n("在 "); b(fmt(e, 1)); n(buy ? " 买入" : " 卖出"); if (sized) { n(" "); b(sz.lots.toFixed(2) + " 手"); } n("。");
    n("价格" + (buy ? "跌到 " : "涨到 ")); b(fmt(st, 1)); n(" 就止损");
    if (sized) { n("，约亏 "); b(usd(sz.actualRisk)); n("（账户的 " + sz.actualPct.toFixed(2) + "%）"); } else n("（距离 " + fmt(sz.dist, 1) + " 美元）");
    }
    n(tr("。", ". "));
    if (t1 !== null && sz.r1 !== null) {
      if (EN) {
        n("Take profit at "); b(fmt(t1, 1)); if (sized && sz.pnl1 !== null) { n(", making about "); b(usd(sz.pnl1)); } n(" (" + sz.r1.toFixed(1) + "R)");
        if (t2 !== null && sz.r2 !== null) { n("; at "); b(fmt(t2, 1)); if (sized && sz.pnl2 !== null) { n(" about "); b(usd(sz.pnl2)); } n(" (" + sz.r2.toFixed(1) + "R)"); }
      } else {
      n(buy ? "涨到 " : "跌到 "); b(fmt(t1, 1)); n(" 止盈"); if (sized && sz.pnl1 !== null) { n("，约赚 "); b(usd(sz.pnl1)); } n("（" + sz.r1.toFixed(1) + "R）");
      if (t2 !== null && sz.r2 !== null) { n("；到 "); b(fmt(t2, 1)); if (sized && sz.pnl2 !== null) { n(" 约赚 "); b(usd(sz.pnl2)); } n("（" + sz.r2.toFixed(1) + "R）"); }
      }
      n(tr("。", "."));
    }
    return P;
  }

  // ---------- words ----------
  function votes(E) {
    return TF_ORDER.map(function (tf) { var t = tfOk(E, tf); return { tf: tf, w: TF_WEIGHT[tf], v: !t ? null : t.trend === "bullish" ? 1 : t.trend === "bearish" ? -1 : 0 }; });
  }
  function headline(E) {
    var v = votes(E), up = v.filter(function (x) { return x.v === 1; }).map(function (x) { return x.tf; }), dn = v.filter(function (x) { return x.v === -1; }).map(function (x) { return x.tf; });
    var known = v.filter(function (x) { return x.v !== null; }).length;
    if (!known) return tr("暂无数据", "No data yet");
    if (up.length === known) return EN ? "All timeframes bullish: " + up.join(" · ") + " all up" : "多周期共振看多：" + up.join(" · ") + " 全部向上";
    if (dn.length === known) return EN ? "All timeframes bearish: " + dn.join(" · ") + " all down" : "多周期共振看空：" + dn.join(" · ") + " 全部向下";
    var htf = function (list) { return list.indexOf("W") >= 0 && list.indexOf("D") >= 0; };
    if (htf(dn) && up.length) return EN ? "Big timeframes bearish, small ones bouncing: " + dn.join("·") + " down, " + up.join("·") + " up" : "大周期看空，小周期反弹：" + dn.join("·") + " 向下，" + up.join("·") + " 向上";
    if (htf(up) && dn.length) return EN ? "Big timeframes bullish, small ones pulling back: " + up.join("·") + " up, " + dn.join("·") + " down" : "大周期看多，小周期回调：" + up.join("·") + " 向上，" + dn.join("·") + " 向下";
    return EN ? "Timeframes split: bullish " + (up.join("·") || "none") + ", bearish " + (dn.join("·") || "none") : "多周期分歧：看多 " + (up.join("·") || "无") + "，看空 " + (dn.join("·") || "无");
  }
  // shift(p) converts a raw price to the display basis.
  function summary(E, shift) {
    shift = shift || function (p) { return p; };
    var ov = (E && E.overall) || {}, parts = [], D = tfOk(E, "D"), H4 = tfOk(E, "4H");
    parts.push(ov.agree3 > 0 ? tr("周线、日线、4 小时同向看多。", "Weekly, daily and 4-hour agree: bullish.") : ov.agree3 < 0 ? tr("周线、日线、4 小时同向看空。", "Weekly, daily and 4-hour agree: bearish.") : tr("周线、日线、4 小时还不一致，暂无顺势交易。", "Weekly, daily and 4-hour do not agree yet: no trade with the trend."));
    var pos = [];
    if (D && D.range) pos.push("D " + ZH.zone[D.range.zone] + " " + D.range.pct + "%");
    if (H4 && H4.range) pos.push("4H " + ZH.zone[H4.range.zone] + " " + H4.range.pct + "%");
    if (pos.length) parts.push(EN ? "Price is in the " + pos.join(", ") + "." : "价格位于 " + pos.join("、") + "。");
    var ins = [];
    ["D", "4H", "1H"].forEach(function (tf) { var t = tfOk(E, tf); if (!t) return; (t.fvgs || []).forEach(function (g) { if (g.inside) ins.push(tf + (g.dir === "bull" ? tr(" 看多", " bullish") : tr(" 看空", " bearish")) + " FVG " + fmt(shift(g.bottom), 1) + "–" + fmt(shift(g.top), 1)); }); });
    if (ins.length) parts.push(EN ? "Inside the " + ins.join(", ") + "." : "正处于 " + ins.join("、") + " 内。");
    return parts.join("");
  }
  function eventText(ev, shift) {
    if (!ev) return "—";
    shift = shift || function (p) { return p; };
    var d = new Date(ev.time);
    return ev.type + (ev.dir === "bull" ? " ▲ " : " ▼ ") + fmt(shift(ev.level), 1) + " · " + (d.getUTCMonth() + 1) + "/" + d.getUTCDate();
  }
  function patternText(p) { return (ZH.pattern[p.name] || p.name); }
  function statusText(s) { return ZH.status[s] || s || ""; }

  function planText(o) {
    var sz = o.size || {}, p = o.plan, L = [];
    var side = p.side === "short" ? tr("做空", "short") : tr("做多", "long");
    L.push(EN ? "XAUUSD " + side + " plan · " + o.when : "XAUUSD " + side + "计划 · " + o.when);
    var say = sentence(p, sz).map(function (x) { return x.t; }).join(""); if (say) L.push(say);
    var a = EN ? "Entry " + fmt(p.entry, 1) + " | stop " + fmt(p.stop, 1) + (sz.dist ? " ($" + fmt(sz.dist, 1) + ")" : "") : "入场 " + fmt(p.entry, 1) + " ｜止损 " + fmt(p.stop, 1) + (sz.dist ? "（" + fmt(sz.dist, 1) + " 美元）" : "");
    if (num(p.tp1) !== null) a += tr(" ｜TP1 ", " | TP1 ") + fmt(p.tp1, 1) + (sz.r1 ? tr("（" + sz.r1.toFixed(1) + "R）", " (" + sz.r1.toFixed(1) + "R)") : "");
    if (num(p.tp2) !== null) a += tr(" ｜TP2 ", " | TP2 ") + fmt(p.tp2, 1) + (sz.r2 ? tr("（" + sz.r2.toFixed(1) + "R）", " (" + sz.r2.toFixed(1) + "R)") : "");
    L.push(a);
    if (sz.lots !== null && sz.lots !== undefined) L.push(EN ? "Lots " + sz.lots + " (risk " + usd(sz.actualRisk) + " = " + sz.actualPct.toFixed(2) + "%)" : "手数 " + sz.lots + "（风险 " + usd(sz.actualRisk) + " = " + sz.actualPct.toFixed(2) + "%）" + (sz.pnl1 !== null ? " · TP1 +" + usd(sz.pnl1) : "") + (sz.pnl2 !== null ? " · TP2 +" + usd(sz.pnl2) : ""));
    if (o.votes) L.push(EN ? "Timeframes: " + o.votes + " (score " + o.score + ")" : "多周期：" + o.votes + "（综合 " + o.score + "）");
    if (o.checks && o.checks.length) L.push(tr("检查：", "Checks: ") + o.checks.map(function (c) { return (c.ok === true ? "✓" : c.ok === false ? "✗" : tr("？", "?")) + c.label; }).join("  "));
    if (p.note) L.push(tr("备注：", "Note: ") + p.note);
    if (o.exit) L.push(tr("离场：", "Exit: ") + o.exit);
    L.push(tr("数据：", "Data: ") + o.basis);
    return L.join("\n");
  }

  // ---------- a bounce inside an aligned trend: which level tends to come first ----------
  // odds: data/xau-scenarios.json (research/xau-replay/scenario_check.js; descriptive, no rule was fitted to it). The
  // bounce starts at the later of the 1-hour turning against the big three and the big three lining up, and is measured
  // as the research measured it: the furthest 15-minute close against the big direction since then, in daily ATR.
  // K15 / K1: finished candles as the feed gives them ([startMs, o, h, l, c, v, endMs - 1]), oldest first.
  function bounceOdds(E, K15, K1, odds) {
    var R = regime(E), H1 = tfOk(E, "1H"), D = tfOk(E, "D");
    if (!odds || !R.dir || R.dirs["1H"] !== -R.dir || !H1 || num(H1.since) === null || !D || !num(D.atr)) return null;
    var dir = R.dir, start = Math.max(num(H1.since), num(R.since3) || 0);
    function scan(K) {
      var p0 = null, adv = 0;
      for (var i = 0; i < (K || []).length; i++) {
        var end = K[i][6] + 1; if (end < start) continue;
        if (p0 === null) { if (end !== start) return null; p0 = +K[i][4]; continue; }
        adv = Math.max(adv, (K[i][4] - p0) * -dir);
      }
      return p0 === null ? null : { p0: p0, adv: adv };
    }
    var got = scan(K15) || scan(K1), side = dir < 0 ? odds.downtrendBounce : odds.uptrendPullback;
    if (!got || !side) return null;
    var ext = got.adv / D.atr, row = null;
    (side.byExtent || []).forEach(function (r) { if (ext >= r.atr) row = r; });
    return { dir: dir, start: start, p0: got.p0, extAtr: ext, atLeast: row ? row.atr : 0, n: row ? row.n : side.n,
      back: row ? row.back : side.back, brk: row ? row.break : side.break, backAt: flipLevel(E, "1H", dir), breakAt: flipLevel(E, "4H", -dir) };
  }

  return { SYS: SYS, TF_ORDER: TF_ORDER, TF_WEIGHT: TF_WEIGHT, TF_ZH: TF_ZH, TF_S: TF_S, ZH: ZH, num: num, fmt: fmt, usd: usd, mirror: mirror, manage: manage, levels: levels, candidate: candidate, candidates: candidates,
    regime: regime, flipLevel: flipLevel, soonNeed: soonNeed, systemPlan: systemPlan, size: size, checks: checks, votes: votes, headline: headline, summary: summary, eventText: eventText,
    patternText: patternText, statusText: statusText, patternWay: patternWay, patternsNow: patternsNow, patternPlan: patternPlan, bounceOdds: bounceOdds, words: function () { return MK; }, planText: planText, scoreWord: scoreWord, verdict: verdict, nearest: nearest, sentence: sentence, setMarket: setMarket };
})();
if (typeof module !== "undefined" && module.exports) module.exports = XauPlan;
