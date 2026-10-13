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

  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function fmt(v, d) {
    v = num(v); if (v === null) return "—";
    d = d === undefined ? 2 : d;
    return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  // Dollars for a sentence: whole dollars from $100 up, cents below that (a $0.35 risk must not read as "$0").
  function usd(v) {
    v = num(v); if (v === null) return "—";
    var a = Math.abs(v), cents = a < 100 && Math.round(a * 100) % 100 !== 0;
    return (v < 0 ? "−" : "") + "$" + fmt(a, cents ? 2 : 0);
  }
  function agoTxt(ms) { var m = Math.max(0, Math.round(ms / 60000)); if (m < 60) return m + " 分钟前"; var hr = Math.round(m / 60); return hr < 48 ? hr + " 小时前" : Math.round(hr / 24) + " 天前"; }
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
    pt(c.prevDayHigh, "昨日高点", "D", 3, 3); pt(c.prevDayLow, "昨日低点", "D", 3, 3);
    pt(c.prevWeekHigh, "上周高点", "W", 4, 3); pt(c.prevWeekLow, "上周低点", "W", 4, 3);

    TF_ORDER.forEach(function (tf) {
      var t = tfOk(E, tf); if (!t || tf === "15M") return;
      var w = TF_WEIGHT[tf], n = TF_S[tf];
      if (t.range) { pt(t.range.top, n + "区间顶", tf, w, 2); pt(t.range.bottom, n + "区间底", tf, w, 2); if (tf === "D" || tf === "4H") pt(t.range.eq, n + "区间中点", tf, 1, 0); }
      pt(t.swingHigh, n + "前高", tf, w, 3); pt(t.swingLow, n + "前低", tf, w, 3);
      if (tf === "4H" || tf === "1H") { pt(t.intHigh, n + "近期小高点", tf, 1); pt(t.intLow, n + "近期小低点", tf, 1); }
      if (t.lastEvent) pt(t.lastEvent.level, n + (t.lastEvent.dir === "bull" ? "向上" : "向下") + (t.lastEvent.type === "CHoCH" ? "转折" : "突破") + "位", tf, 1);
      if ((tf === "D" || tf === "4H") && t.ema) pt(t.ema.e200, n + " 200 均线", tf, 2, 2);
      ((t.liquidity || {}).equalHighs || []).forEach(function (p) { pt(p, n + "等高点（止损密集）", tf, 2, 2); });
      ((t.liquidity || {}).equalLows || []).forEach(function (p) { pt(p, n + "等低点（止损密集）", tf, 2, 2); });
      (t.patterns || []).forEach(function (p) {
        var nm = ZH.pattern[p.name] || p.name, tg = num(p.target);
        pt(p.level, n + nm + "关键位", tf, 2, 2);
        // a target already passed is no longer a level worth watching
        if (tg !== null && ((p.bias === "bullish" && tg > price) || (p.bias === "bearish" && tg < price))) pt(tg, n + nm + "目标", tf, 1);
      });
      (t.fvgs || []).forEach(function (g) {
        var top = num(g.top), bot = num(g.bottom); if (top === null || bot === null) return;
        if (bot - price > win || price - top > win) return;
        zones.push({ kind: "zone", top: top, bottom: bot, price: (top + bot) / 2, polarity: g.dir, tf: tf, tapped: !!g.tapped,
          label: TF_S[tf] + (g.dir === "bull" ? "看多缺口" : "看空缺口"), strength: w, time: g.time,
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
    else if (dir > 0) { zTop = H1.range.eq; zBot = H1.range.bottom; zSrc = "1H 折价区"; }
    else { zTop = H1.range.top; zBot = H1.range.eq; zSrc = "1H 溢价区"; }
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
    if (entry === null || stop === null) { errors.push("填写入场价与止损价"); return o; }
    if (entry === stop) { o.same = true; errors.push("入场价与止损价不能相同"); return o; }
    // issues: which price sits on the wrong side of the entry for this direction ("at": where it is now)
    var want = dir > 0 ? "做多" : "做空", bad = function (f, v, name, need) { issues.push({ f: f, price: v, at: v > entry ? "above" : "below" }); errors.push(want + "：" + name + "要" + need + "入场价"); };
    if ((entry - stop) * dir <= 0) bad("stop", stop, "止损", dir > 0 ? "低于" : "高于");
    if (tp1 !== null && (tp1 - entry) * dir <= 0) bad("tp1", tp1, "目标 1 ", dir > 0 ? "高于" : "低于");
    if (tp2 !== null && (tp2 - entry) * dir <= 0) bad("tp2", tp2, "目标 2 ", dir > 0 ? "高于" : "低于");
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
    var dir = plan.side === "short" ? -1 : 1, R = regime(E), H1 = tfOk(E, "1H"), out = [], way = dir > 0 ? "向上" : "向下";
    var zh = function (tf) { return TF_ZH[tf]; }, say = function (v) { return v > 0 ? "向上" : v < 0 ? "向下" : "不明"; };
    out.push({ id: "htf", label: "周线、日线、4 小时都和你同向", ok: R.dir === dir,
      detail: R.dir === dir ? "三个大周期都" + way + "，顺势" : R.dir === -dir ? "三个大周期都" + say(-dir) + "：这笔是逆势，回放里逆势长期亏损" :
        "周线" + say(R.dirs.W) + "、日线" + say(R.dirs.D) + "、4 小时" + say(R.dirs["4H"]) + "：还不一致，回放里这种时候没有优势" });
    out.push({ id: "ltf", label: "1 小时、15 分钟也同向", ok: R.dir === dir ? R.full : null,
      detail: R.dir !== dir ? "先等大方向一致" : R.full ? "小周期也转成" + way + "了" : R.lagging.map(zh).join("、") + "还没转成" + way + "：等它转过来再进" });
    var stopOk = null, sd = "需要入场价与止损价";
    if (sz && sz.dist && H1 && H1.atr) {
      var m = sz.dist / H1.atr; stopOk = m >= SYS.minStopAtr && m <= SYS.maxStopAtr;
      sd = "止损距离是 1 小时平均波幅的 " + m.toFixed(1) + " 倍" + (m < SYS.minStopAtr ? "：太近。回放里 1.5 倍以内的止损没有优势，建议 3 倍" : m > SYS.maxStopAtr ? "：很远，手数会被压得很小" : "，够宽");
    }
    out.push({ id: "stop", label: "止损留够空间", ok: stopOk, detail: sd });
    var best = sz ? Math.max(sz.r1 || 0, sz.r2 || 0) : 0, hasT = num(plan.tp1) !== null || num(plan.tp2) !== null;
    out.push({ id: "rr", label: "让利润跑：目标至少 2R，或跟踪止损", ok: sz && sz.dist ? (hasT ? best >= 2 : true) : null,
      detail: !hasT ? "没设目标：按跟踪止损离场（止损跟在最好价格后面 2R）" : best > 0 ? "最远目标是 " + best.toFixed(1) + "R" + (best < 2 ? "：太近。回放里的利润主要来自少数走得很远的单子" : "") : "需要止损与目标价" });
    var riskOk = null, rd = "需要账户余额与风险比例";
    if (sz && sz.actualPct !== null) {
      if (sz.lots === 0) { riskOk = false; rd = "最小手数就要亏 " + usd(sz.minLotRisk) + "，超过你设的上限 " + usd(sz.riskUsd) + "：这笔开不了，不要为了开单把止损缩近"; }
      else { riskOk = sz.actualPct <= 1.0001; rd = "止损时亏 " + usd(sz.actualRisk) + "，是账户的 " + sz.actualPct.toFixed(2) + "%" + (!riskOk ? "：超过 1%，连亏几笔账户就很伤" : sz.actualPct > 0.55 ? "。回放里最长连亏过 15 笔，0.5% 或更少更稳" : ""); }
    }
    out.push({ id: "risk", label: "单笔亏损不超过 1%", ok: riskOk, detail: rd });
    return out;
  }

  // ---------- the one-line answer ----------
  function scoreWord(sc) { sc = num(sc) || 0; return sc >= 7 ? "强烈看多" : sc >= 4 ? "看多" : sc >= 1 ? "略偏多" : sc === 0 ? "中性" : sc >= -3 ? "略偏空" : sc >= -6 ? "看空" : "强烈看空"; }
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
    var R = regime(E), buy = R.dir > 0, way = buy ? "向上" : "向下", say = function (v) { return v > 0 ? "向上" : v < 0 ? "向下" : "不明"; };
    var zh = function (tf) { return TF_ZH[tf]; }, cross = function (to) { return to > 0 ? "站上" : "跌破"; }, act = function (to) { return to > 0 ? "做多" : "做空"; };
    var price = num(E && E.price), H1 = tfOk(E, "1H"), room = H1 && H1.atr ? SYS.stopAtr * H1.atr : null;
    var v = { level: "none", side: R.dir > 0 ? "long" : R.dir < 0 ? "short" : "none", regime: R, closed: !R.open, reasons: [], ideas: [], lines: [], next: [], other: null, signal: null, plan: null, fresh: false };
    var big = "周线" + say(R.dirs.W) + "、日线" + say(R.dirs.D) + "、4 小时" + say(R.dirs["4H"]);
    v.reasons.push({ key: "dir", label: "大方向", ok: R.dir !== 0, text: R.dir ? "周线、日线、4 小时都" + way : big + "，还不一致" });
    v.reasons.push({ key: "small", label: "小周期", ok: R.dir ? R.full : null,
      text: !R.dir ? "大方向一致后才看小周期" : R.full ? "1 小时和 15 分钟也" + way : R.lagging.map(zh).join("、") + "还是" + say(-R.dir) + "，等它转回" + way });
    var add = function (dir, p, text) { p = num(p); if (p !== null) v.lines.push({ dir: dir, price: p, text: text, dist: price === null ? null : Math.abs(p - price) }); return p; };
    var away = function (p) { return price === null ? "" : "比现价" + (p >= price ? "高 " : "低 ") + fmt(Math.abs(p - price), 1) + " 美元。"; };
    var step = function (lead, text, more) { var s = { lead: lead, text: text }, k; for (k in (more || {})) s[k] = more[k]; v.next.push(s); };
    var closes = function (list, to) { return list.map(function (g) { return zh(g.tf) + "收盘" + cross(to) + " " + fmt(g.price, 1); }); };
    var andAlso = function (list) { return list.map(function (x, i) { return i ? "，以及" + (/^\d/.test(x) ? " " : "") + x : x; }).join(""); };
    var waitWord = function (n) { return n === 1 ? "等这一步：" : n === 2 ? "等这两步：" : "等这几步："; };
    var bells = function (list, to) { return list.map(function (g) { return { price: g.price, label: zh(g.tf) + "转" + say(to) + "的价位" }; }); };

    if (!R.dir) {
      v.tag = "先观望"; v.title = "先观望：大周期方向不一致";
      v.text = big + "。回放里只有三个大周期同向时才有优势，其余时间进场和抛硬币差不多，逆着它们做则是长期亏损。";
      step("现在：不下单", "不用找入场点，也不用一直盯着：结论每 15 分钟重算一次。");
      // the two ways the three can line up; the one whose furthest level is nearer comes first
      var up = pathTo(E, R, 1, price), dn = pathTo(E, R, -1, price), ways = [up, dn].filter(function (w) { return w.complete; }).sort(function (a, b) { return a.far - b.far; });
      var first = ways[0];
      if (first) {
        first.steps.forEach(function (g) { add(first.to > 0 ? "up" : "down", g.price, zh(g.tf) + "收盘" + cross(first.to) + "这里" + (first.steps.length === 1 ? "，就三周期同向" + say(first.to) : "（要转" + say(first.to) + "得走 " + first.steps.length + " 步，这是其中一步）")); });
        step(waitWord(first.steps.length) + andAlso(closes(first.steps, first.to)), (first.steps.length === 1 ? away(first.steps[0].price) : "") + "那时周线、日线、4 小时就同向" + say(first.to) + "了。", { alerts: bells(first.steps, first.to) });
        step("然后：等 1 小时和 15 分钟也" + say(first.to), "五个周期同向才是" + act(first.to) + "信号，到时这里会直接给出入场价、止损和目标。" + (room ? "按现在的波动，止损会离入场价 " + fmt(room, 0) + " 美元左右。" : ""));
      } else step("等周线、日线、4 小时走到同一个方向", "现在还算不出哪个价位会让它们同向；有了以后会列在「会改变局面的价位」里。");
      step("手上已经有单", "如果是按这页规则开的顺势单：三个大周期已经不再同向，规则是离场。");
      var rest = first ? (first === up ? dn : up) : null;                         // the other way round, so the picture is complete
      if (rest) v.other = "反过来要变成同向" + say(rest.to) + "，需要" + (rest.complete ? andAlso(closes(rest.steps, rest.to)) + (price !== null ? "（最远的离现价 " + fmt(rest.far, 0) + " 美元）。" : "。") : rest.need.map(zh).join("和") + "都转" + say(rest.to) + "，现在还没有明确的价位。");
    } else {
      v.plan = systemPlan(E, R.dir);
      var out = flipLevel(E, "4H", -R.dir), k = v.plan;
      if (R.full) {
        v.level = "go"; v.fresh = num(R.since5) !== null && nowMs - R.since5 <= 2 * 3600000;
        v.tag = "可以顺势" + act(R.dir); v.title = "五个周期都" + way + "，可以顺势" + act(R.dir);
        v.text = "这是回放里唯一显出优势的情形。按现价进，止损放在 3 倍小时波幅之外，别放近；赢的时候让它走，目标 3R 或用跟踪止损。" + (v.fresh ? "信号刚出现不久。" : "信号已持续一段时间，不要追已经走远的行情。");
        // how old the signal is, and how far price has gone since: the replay entered on the candle that completed it
        var sig = v.signal = signalInfo(E, R), note = "", late = false;
        if (sig) {
          note = "信号 " + agoTxt(nowMs - sig.at) + "出现" + (sig.price !== null ? "，当时 " + fmt(sig.price, 1) : "") + "。";
          if (sig.price !== null && price !== null && room) {
            var m = sig.movedR = (price - sig.price) * R.dir / room; late = m >= 1;
            note += late ? "之后价格已经顺着走了 " + m.toFixed(1) + "R。回放只测过信号刚出现时进场，这么晚再进没有数据支持，等下一次更稳妥。"
              : m >= 0.25 ? "之后价格顺着走了 " + m.toFixed(1) + "R，剩下的空间小了一些。"
              : m <= -0.25 ? "现在的价格比当时" + (buy ? "低" : "高") + " " + fmt(Math.abs(price - sig.price), 1) + " 美元：进场价更好，但也说明价格在往回走。" : "价格和当时差不多。";
          }
        }
        if (k) step(late ? "现在：信号已经走远，别追" : "现在：可以顺势" + act(R.dir), note + (late ? "还是想进的话：" : "") + (buy ? "现价买入 " : "现价卖出 ") + fmt(k.entry, 1) + "，止损 " + fmt(k.stop, 1) + "（离入场 " + fmt(k.dist, 0) + " 美元），目标 " + fmt(k.tp1, 1) + "（3R）。", { fill: "填进计划 →", late: late });
        step("算好手数", "在计划器第 3 步填账户余额，每笔最多亏账户的 " + SYS.risk + "%。回放里最长连亏过 15 笔，所以不要加码。");
        if (k) step("进场以后", "每天把止损挪到最好价格后面 " + fmt(k.trailDist, 0) + " 美元，只往有利方向挪。别提前挪到成本价，回放里那样会少赚。");
        step("什么时候离场", "到目标止盈" + (out !== null ? "；或者 4 小时收盘" + cross(-R.dir) + " " + fmt(out, 1) + "（三个大周期不再同向）" : "；或者这里的结论变回「先观望」") + "。");
      } else {
        var lag = R.lagging.map(zh).join("和 ");
        v.level = "ready"; v.tag = buy ? "等小周期转多" : "等小周期转空"; v.title = "大方向" + way + "，等小周期转回来再" + (buy ? "买" : "卖");
        v.text = "周线、日线、4 小时都" + way + "，但 " + lag + "还在" + (buy ? "回调" : "反弹") + "。等它重新转成" + way + "再进；提前接" + (buy ? "回调" : "反弹") + "在回放里没有优势。";
        step("现在：先不进", "大方向对了，小周期还没转回来。可以先把计划准备好。");
        var got = [];
        R.lagging.forEach(function (tf) { var p = add(buy ? "up" : "down", flipLevel(E, tf, R.dir), zh(tf) + "收盘" + cross(R.dir) + "这里，就转回" + way); if (p !== null) got.push({ tf: tf, price: p }); });
        if (got.length && got.length === R.lagging.length) step(waitWord(got.length) + andAlso(closes(got, R.dir)), (got.length === 1 ? away(got[0].price) : "") + "转回来以后五个周期同向，就是" + act(R.dir) + "信号。", { alerts: bells(got, R.dir) });
        else step("等" + lag + "转回" + way, "页面每 15 分钟重算一次，转回来时这里的结论会变成「可以顺势" + act(R.dir) + "」。");
        if (k) step("到时候这样做", "按当时的价格" + (buy ? "买入" : "卖出") + "，止损放在入场价" + (buy ? "下方" : "上方") + " " + fmt(k.dist, 0) + " 美元左右（3 倍小时波幅），目标是止损距离的 3 倍。", { fill: "先填进计划看看 →" });
        step("什么时候作废", (out !== null ? "4 小时收盘" + cross(-R.dir) + " " + fmt(out, 1) : "4 小时方向反转") + "，三个大周期就不再同向，回到观望。");
      }
      // what ends it: the 4-hour trend turning against
      add(buy ? "down" : "up", out, "4 小时收盘" + (buy ? "跌破" : "站上") + "这里，三周期不再同向：有持仓就离场");
    }
    return v;
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
    n("在 "); b(fmt(e, 1)); n(buy ? " 买入" : " 卖出"); if (sized) { n(" "); b(sz.lots.toFixed(2) + " 手"); } n("。");
    n("价格" + (buy ? "跌到 " : "涨到 ")); b(fmt(st, 1)); n(" 就止损");
    if (sized) { n("，约亏 "); b(usd(sz.actualRisk)); n("（账户的 " + sz.actualPct.toFixed(2) + "%）"); } else n("（距离 " + fmt(sz.dist, 1) + " 美元）");
    n("。");
    if (t1 !== null && sz.r1 !== null) {
      n(buy ? "涨到 " : "跌到 "); b(fmt(t1, 1)); n(" 止盈"); if (sized && sz.pnl1 !== null) { n("，约赚 "); b(usd(sz.pnl1)); } n("（" + sz.r1.toFixed(1) + "R）");
      if (t2 !== null && sz.r2 !== null) { n("；到 "); b(fmt(t2, 1)); if (sized && sz.pnl2 !== null) { n(" 约赚 "); b(usd(sz.pnl2)); } n("（" + sz.r2.toFixed(1) + "R）"); }
      n("。");
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
    if (!known) return "暂无数据";
    if (up.length === known) return "多周期共振看多：" + up.join(" · ") + " 全部向上";
    if (dn.length === known) return "多周期共振看空：" + dn.join(" · ") + " 全部向下";
    var htf = function (list) { return list.indexOf("W") >= 0 && list.indexOf("D") >= 0; };
    if (htf(dn) && up.length) return "大周期看空，小周期反弹：" + dn.join("·") + " 向下，" + up.join("·") + " 向上";
    if (htf(up) && dn.length) return "大周期看多，小周期回调：" + up.join("·") + " 向上，" + dn.join("·") + " 向下";
    return "多周期分歧：看多 " + (up.join("·") || "无") + "，看空 " + (dn.join("·") || "无");
  }
  // shift(p) converts a raw price to the display basis.
  function summary(E, shift) {
    shift = shift || function (p) { return p; };
    var ov = (E && E.overall) || {}, parts = [], D = tfOk(E, "D"), H4 = tfOk(E, "4H");
    parts.push(ov.agree3 > 0 ? "周线、日线、4 小时同向看多。" : ov.agree3 < 0 ? "周线、日线、4 小时同向看空。" : "周线、日线、4 小时还不一致，暂无顺势交易。");
    var pos = [];
    if (D && D.range) pos.push("D " + ZH.zone[D.range.zone] + " " + D.range.pct + "%");
    if (H4 && H4.range) pos.push("4H " + ZH.zone[H4.range.zone] + " " + H4.range.pct + "%");
    if (pos.length) parts.push("价格位于 " + pos.join("、") + "。");
    var ins = [];
    ["D", "4H", "1H"].forEach(function (tf) { var t = tfOk(E, tf); if (!t) return; (t.fvgs || []).forEach(function (g) { if (g.inside) ins.push(tf + (g.dir === "bull" ? " 看多" : " 看空") + " FVG " + fmt(shift(g.bottom), 1) + "–" + fmt(shift(g.top), 1)); }); });
    if (ins.length) parts.push("正处于 " + ins.join("、") + " 内。");
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
    var side = p.side === "short" ? "做空" : "做多";
    L.push("XAUUSD " + side + "计划 · " + o.when);
    var say = sentence(p, sz).map(function (x) { return x.t; }).join(""); if (say) L.push(say);
    var a = "入场 " + fmt(p.entry, 1) + " ｜止损 " + fmt(p.stop, 1) + (sz.dist ? "（" + fmt(sz.dist, 1) + " 美元）" : "");
    if (num(p.tp1) !== null) a += " ｜TP1 " + fmt(p.tp1, 1) + (sz.r1 ? "（" + sz.r1.toFixed(1) + "R）" : "");
    if (num(p.tp2) !== null) a += " ｜TP2 " + fmt(p.tp2, 1) + (sz.r2 ? "（" + sz.r2.toFixed(1) + "R）" : "");
    L.push(a);
    if (sz.lots !== null && sz.lots !== undefined) L.push("手数 " + sz.lots + "（风险 " + usd(sz.actualRisk) + " = " + sz.actualPct.toFixed(2) + "%）" + (sz.pnl1 !== null ? " · TP1 +" + usd(sz.pnl1) : "") + (sz.pnl2 !== null ? " · TP2 +" + usd(sz.pnl2) : ""));
    if (o.votes) L.push("多周期：" + o.votes + "（综合 " + o.score + "）");
    if (o.checks && o.checks.length) L.push("检查：" + o.checks.map(function (c) { return (c.ok === true ? "✓" : c.ok === false ? "✗" : "？") + c.label; }).join("  "));
    if (p.note) L.push("备注：" + p.note);
    if (o.exit) L.push("离场：" + o.exit);
    L.push("数据：" + o.basis);
    return L.join("\n");
  }

  return { SYS: SYS, TF_ORDER: TF_ORDER, TF_WEIGHT: TF_WEIGHT, TF_ZH: TF_ZH, TF_S: TF_S, ZH: ZH, num: num, fmt: fmt, usd: usd, mirror: mirror, levels: levels, candidate: candidate, candidates: candidates,
    regime: regime, flipLevel: flipLevel, systemPlan: systemPlan, size: size, checks: checks, votes: votes, headline: headline, summary: summary, eventText: eventText,
    patternText: patternText, statusText: statusText, planText: planText, scoreWord: scoreWord, verdict: verdict, nearest: nearest, sentence: sentence };
})();
if (typeof module !== "undefined" && module.exports) module.exports = XauPlan;
