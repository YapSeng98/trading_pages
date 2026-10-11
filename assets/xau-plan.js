// Plan helpers for report.html. Pure functions over the output of runXauEngine() (assets/xau-engine.js):
// no DOM and no network, so the maths can be checked in Node. Prices are raw PAXG unless a caller shifts them.
var XauPlan = (function () {
  "use strict";

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

  // ---------- entry candidates ----------
  // Same zone / stop / target rules as xOverall() in the engine, run for one direction. dir: 1 long, -1 short.
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
    var dir = p.side === "short" ? -1 : 1, errors = [];
    var o = { valid: false, errors: errors, dir: dir, dist: null, distPct: null, riskUsd: null, perLot: null, lotsRaw: null, lots: null,
      actualRisk: null, actualPct: null, r1: null, r2: null, pnl1: null, pnl2: null, minLotRisk: null, breakeven: null };
    if (entry === null || stop === null) { errors.push("填写入场价与止损价"); return o; }
    if (entry === stop) { errors.push("入场价与止损价不能相同"); return o; }
    if ((entry - stop) * dir <= 0) errors.push(dir > 0 ? "做多：止损应低于入场价" : "做空：止损应高于入场价");
    if (tp1 !== null && (tp1 - entry) * dir <= 0) errors.push(dir > 0 ? "做多：TP1 应高于入场价" : "做空：TP1 应低于入场价");
    if (tp2 !== null && (tp2 - entry) * dir <= 0) errors.push(dir > 0 ? "做多：TP2 应高于入场价" : "做空：TP2 应低于入场价");
    o.dist = Math.abs(entry - stop); o.distPct = o.dist / entry * 100;
    o.perLot = (o.dist + spread) * contract; o.minLotRisk = o.perLot * step;
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

  // ---------- pre-trade checklist ----------
  // Mirrors the hub's own rules on risk.html (risk <= 1%, R:R >= 1:2). ok: true pass, false fail, null not enough data.
  // rawEntry is the plan's entry in raw PAXG terms, so it can be compared with engine ranges.
  function checks(E, plan, sz, rawEntry) {
    var dir = plan.side === "short" ? -1 : 1, want = dir > 0 ? "bull" : "bear", out = [];
    var H1 = tfOk(E, "1H"), M15 = tfOk(E, "15M"), ov = (E && E.overall) || {};
    var al = ov.alignedDirection || "none";
    var Dt = tfOk(E, "D"), mine = dir > 0 ? "bullish" : "bearish", withD = !!(Dt && Dt.trend === mine);
    out.push({ id: "htf", label: "日线和 4 小时都支持", ok: al === "none" ? false : al === plan.side,
      detail: al === "none" ? (withD ? "日线和你同向，但 4 小时还没转过来：等它转向会更稳" : "4 小时和你同向，但日线方向相反：这笔是逆着大方向抢" + (dir > 0 ? "反弹" : "回调")) : al === plan.side ? "日线和 4 小时都" + (dir > 0 ? "向上" : "向下") + "，和你的方向一致" : "日线和 4 小时都" + (dir > 0 ? "向下" : "向上") + "：和你的方向相反" });
    var e = num(rawEntry), zoneOk = null, zd = "需要入场价";
    if (H1 && H1.range && e !== null) {
      var pct = Math.round((e - H1.range.bottom) / (H1.range.top - H1.range.bottom) * 100);
      zoneOk = dir > 0 ? pct <= 50 : pct >= 50;
      zd = (pct > 100 ? "入场价在最近 1 小时区间的上方（偏贵）" : pct < 0 ? "入场价在最近 1 小时区间的下方（偏便宜）" : "入场价在最近 1 小时区间的 " + pct + "% 处（" + (pct > 55 ? "偏贵" : pct < 45 ? "偏便宜" : "中间") + "）") + (zoneOk ? "" : dir > 0 ? "：买入最好在下半部" : "：卖出最好在上半部");
    }
    out.push({ id: "zone", label: "入场位置划算", ok: zoneOk, detail: zd });
    var li = M15 && M15.lastInternal;
    var trig = li ? li.dir === want && li.barsAgo <= 8 : null;
    out.push({ id: "trigger", label: "已出现入场信号", ok: trig,
      detail: li ? "15 分钟图最近一次转折是" + (li.dir === "bull" ? "向上" : "向下") + "（" + li.barsAgo + " 根 K 线前）" + (trig ? "" : "，还没有新的" + (dir > 0 ? "向上" : "向下") + "转折") : "暂无数据" });
    var best = sz ? Math.max(sz.r1 || 0, sz.r2 || 0) : 0;
    out.push({ id: "rr", label: "赚赔比至少 2:1", ok: sz && sz.dist ? (best > 0 ? best >= 2 : null) : null,
      detail: best > 0 ? "最远目标能赚到亏损的 " + best.toFixed(1) + " 倍（" + best.toFixed(1) + "R）" : "需要止损与目标价" });
    var atrOk = null, ad = "需要入场价与止损价";
    if (sz && sz.dist && H1 && H1.atr) { var m = sz.dist / H1.atr; atrOk = m >= 0.8 && m <= 5; ad = "止损距离是 1 小时平均波幅的 " + m.toFixed(1) + " 倍" + (m < 0.8 ? "：太近，正常波动就可能扫掉" : m > 5 ? "：太远，手数会被压得很小" : "，合适"); }
    out.push({ id: "stop", label: "止损不过近也不过远", ok: atrOk, detail: ad });
    var riskOk = null, rd = "需要账户余额与风险比例";
    if (sz && sz.actualPct !== null) {
      if (sz.lots === 0) { riskOk = false; rd = "最小手数就要亏 $" + fmt(sz.minLotRisk, 0) + "，超过你设的上限 $" + fmt(sz.riskUsd, 0) + "：这笔开不了"; }
      else { riskOk = sz.actualPct <= 1.0001; rd = "止损时亏 $" + fmt(sz.actualRisk, 0) + "，是账户的 " + sz.actualPct.toFixed(2) + "%"; }
    }
    out.push({ id: "risk", label: "单笔亏损不超过 1%", ok: riskOk, detail: rd });
    return out;
  }

  // ---------- the one-line answer ----------
  function scoreWord(sc) { sc = num(sc) || 0; return sc >= 7 ? "强烈看多" : sc >= 4 ? "看多" : sc >= 1 ? "略偏多" : sc === 0 ? "中性" : sc >= -3 ? "略偏空" : sc >= -6 ? "看空" : "强烈看空"; }
  // "What do I do now?" in plain words, from the same facts the engine's own setup uses.
  // level: go (all three conditions met) / ready (in the zone, no signal yet) / wait (right direction, wrong price) / none (no agreed direction).
  function verdict(E, shift) {
    shift = shift || function (p) { return p; };
    var ov = (E && E.overall) || {}, al = ov.alignedDirection || "none", C = candidates(E), price = num(E && E.price);
    var D = tfOk(E, "D"), H4 = tfOk(E, "4H"), H1 = tfOk(E, "1H");
    var way = function (t) { return !t ? "不明" : t.trend === "bullish" ? "向上" : t.trend === "bearish" ? "向下" : "不明"; };
    var zone = function (k) { return fmt(shift(k.zoneBottom), 0) + "–" + fmt(shift(k.zoneTop), 0); };
    var c = al === "long" ? C.long : al === "short" ? C.short : null, buy = al === "long";
    var v = { level: "none", side: al, cand: c, closed: ov.marketOpen === false, reasons: [], ideas: [], lines: [] };

    v.reasons.push({ key: "dir", label: "方向", ok: al !== "none", text: al === "none" ? "日线" + way(D) + "、4 小时" + way(H4) + "，还不一致" : "日线和 4 小时都" + (buy ? "向上" : "向下") });
    if (c) {
      var gap = price > c.zoneTop ? price - c.zoneTop : price < c.zoneBottom ? c.zoneBottom - price : 0;
      v.reasons.push({ key: "pos", label: "位置", ok: c.priceInZone, text: c.priceInZone ? "价格已在入场区 " + zone(c) : "还没到入场区 " + zone(c) + "，差 " + fmt(gap, 0) + " 美元" });
      v.reasons.push({ key: "sig", label: "信号", ok: c.trigger15m, text: "15 分钟图" + (c.trigger15m ? "已出现" : "还没出现") + (buy ? "向上" : "向下") + "转折" });
    } else {
      v.reasons.push({ key: "pos", label: "位置", ok: null, text: "方向一致后才有顺势入场区" });
      v.reasons.push({ key: "sig", label: "信号", ok: null, text: "暂时不用看入场信号" });
    }

    if (!c) {
      var vs = votes(E), up = vs.filter(function (x) { return x.v === 1; }).map(function (x) { return TF_ZH[x.tf]; }), dn = vs.filter(function (x) { return x.v === -1; }).map(function (x) { return TF_ZH[x.tf]; });
      var dDown = !!(D && D.trend === "bearish"), dUp = !!(D && D.trend === "bullish");
      v.tag = "先观望"; v.title = "先观望，大小周期方向不一致";
      v.text = (dn.length ? dn.join("、") + "向下" : "") + (dn.length && up.length ? "，" : "") + (up.length ? up.join("、") + "向上" : "") + "。" +
        (dDown ? "这是下跌途中的反弹：现在追多是逆着大方向，做空又还没到好位置。" : dUp ? "这是上涨途中的回调：现在追空是逆着大方向，做多又还嫌早。" : "各周期方向混杂，没有明显优势。");
      [C.short, C.long].forEach(function (k) {
        if (!k) return; var sell = k.side === "short", withTrend = sell ? dDown : dUp;
        v.ideas.push({ side: k.side, withTrend: withTrend, cand: k,
          text: (sell ? "想做空：等价格反弹到 " : "想做多：等价格回落到 ") + zone(k) + "，并且 15 分钟图出现" + (sell ? "向下" : "向上") + "转折",
          note: withTrend ? "顺着日线方向" : "逆着日线方向，只算抢" + (sell ? "回调" : "反弹") + "，仓位要小" });
      });
      v.ideas.sort(function (a, b) { return (b.withTrend ? 1 : 0) - (a.withTrend ? 1 : 0); });
    } else if (c.state === "ready") {
      v.level = "go"; v.tag = "可以考虑" + (buy ? "做多" : "做空"); v.title = "条件到位，可以考虑" + (buy ? "做多" : "做空");
      v.text = "方向一致，价格在入场区 " + zone(c) + "，15 分钟图也给出了信号。先在计划器里确认手数和检查项，再下单。";
    } else if (c.state === "inzone") {
      v.level = "ready"; v.tag = "等信号"; v.title = "价格到了" + (buy ? "买入" : "卖出") + "区，等一个入场信号";
      v.text = "日线和 4 小时都" + (buy ? "向上" : "向下") + "，价格已回到入场区 " + zone(c) + "。等 15 分钟图出现" + (buy ? "向上" : "向下") + "转折再进，不要提前。";
    } else {
      v.level = "wait"; v.tag = buy ? "等回调" : "等反弹"; v.title = buy ? "方向向上，等回调到入场区再买" : "方向向下，等反弹到入场区再卖";
      v.text = "日线和 4 小时都" + (buy ? "向上" : "向下") + "，但现在的价格不划算。等价格" + (buy ? "回落" : "反弹") + "到 " + zone(c) + " 再找" + (buy ? "买点" : "卖点") + "，不要追。";
    }

    // the prices whose break would change the picture
    var add = function (dir, p, text) { p = num(p); if (p !== null) v.lines.push({ dir: dir, price: p, text: text }); };
    if (D && D.trend === "bearish") add("up", D.intHigh, "日线收盘站上这里，大方向开始转强");
    if (D && D.trend === "bullish") add("down", D.intLow, "日线收盘跌破这里，大方向开始转弱");
    if (H1 && H1.trend === "bullish") add("down", num(H1.swingLow) !== null ? H1.swingLow : H1.intLow, "1 小时收盘跌破这里，这一段上涨结束");
    if (H1 && H1.trend === "bearish") add("up", num(H1.swingHigh) !== null ? H1.swingHigh : H1.intHigh, "1 小时收盘站上这里，这一段下跌结束");
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
    if (sized) { n("，约亏 "); b("$" + fmt(sz.actualRisk, 0)); n("（账户的 " + sz.actualPct.toFixed(2) + "%）"); } else n("（距离 " + fmt(sz.dist, 1) + " 美元）");
    n("。");
    if (t1 !== null && sz.r1 !== null) {
      n(buy ? "涨到 " : "跌到 "); b(fmt(t1, 1)); n(" 止盈"); if (sized && sz.pnl1 !== null) { n("，约赚 "); b("$" + fmt(sz.pnl1, 0)); } n("（" + sz.r1.toFixed(1) + "R）");
      if (t2 !== null && sz.r2 !== null) { n("；到 "); b(fmt(t2, 1)); if (sized && sz.pnl2 !== null) { n(" 约赚 "); b("$" + fmt(sz.pnl2, 0)); } n("（" + sz.r2.toFixed(1) + "R）"); }
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
    parts.push(ov.alignedDirection === "long" ? "D 与 4H 结构同向看多，顺势做多为主。" : ov.alignedDirection === "short" ? "D 与 4H 结构同向看空，顺势做空为主。" : "D 与 4H 结构不一致，暂无顺势交易，等其中一方转向。");
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
    if (sz.lots !== null && sz.lots !== undefined) L.push("手数 " + sz.lots + "（风险 $" + fmt(sz.actualRisk, 0) + " = " + sz.actualPct.toFixed(2) + "%）" + (sz.pnl1 !== null ? " · TP1 +$" + fmt(sz.pnl1, 0) : "") + (sz.pnl2 !== null ? " · TP2 +$" + fmt(sz.pnl2, 0) : ""));
    if (o.votes) L.push("多周期：" + o.votes + "（综合 " + o.score + "）");
    if (o.checks && o.checks.length) L.push("检查：" + o.checks.map(function (c) { return (c.ok === true ? "✓" : c.ok === false ? "✗" : "？") + c.label; }).join("  "));
    if (p.note) L.push("备注：" + p.note);
    L.push("报价基准：" + o.basis);
    return L.join("\n");
  }

  return { TF_ORDER: TF_ORDER, TF_WEIGHT: TF_WEIGHT, TF_ZH: TF_ZH, TF_S: TF_S, ZH: ZH, num: num, fmt: fmt, levels: levels, candidate: candidate, candidates: candidates,
    size: size, checks: checks, votes: votes, headline: headline, summary: summary, eventText: eventText, patternText: patternText,
    statusText: statusText, planText: planText, scoreWord: scoreWord, verdict: verdict, nearest: nearest, sentence: sentence };
})();
if (typeof module !== "undefined" && module.exports) module.exports = XauPlan;
