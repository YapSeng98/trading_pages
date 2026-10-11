// Plan helpers for report.html. Pure functions over the output of runXauEngine() (assets/xau-engine.js):
// no DOM and no network, so the maths can be checked in Node. Prices are raw PAXG unless a caller shifts them.
var XauPlan = (function () {
  "use strict";

  var TF_ORDER = ["W", "D", "4H", "1H", "15M"];
  var TF_WEIGHT = { W: 3, D: 3, "4H": 2, "1H": 1, "15M": 1 };

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
    function pt(p, label, tf, w) { p = num(p); if (p !== null && Math.abs(p - price) <= win) pts.push({ price: p, label: label, tf: tf, w: w }); }

    var c = E.context || {};
    pt(c.prevDayHigh, "前日高 PDH", "D", 3); pt(c.prevDayLow, "前日低 PDL", "D", 3);
    pt(c.prevWeekHigh, "前周高 PWH", "W", 4); pt(c.prevWeekLow, "前周低 PWL", "W", 4);

    TF_ORDER.forEach(function (tf) {
      var t = tfOk(E, tf); if (!t || tf === "15M") return;
      var w = TF_WEIGHT[tf];
      if (t.range) { pt(t.range.top, tf + " 区间顶", tf, w); pt(t.range.bottom, tf + " 区间底", tf, w); if (tf === "D" || tf === "4H") pt(t.range.eq, tf + " 均衡 EQ", tf, 1); }
      pt(t.swingHigh, tf + " 结构高点", tf, w); pt(t.swingLow, tf + " 结构低点", tf, w);
      if (tf === "4H" || tf === "1H") { pt(t.intHigh, tf + " 内部高点", tf, 1); pt(t.intLow, tf + " 内部低点", tf, 1); }
      if (t.lastEvent) pt(t.lastEvent.level, tf + " " + t.lastEvent.type + (t.lastEvent.dir === "bull" ? " ▲" : " ▼") + " 突破位", tf, 1);
      if ((tf === "D" || tf === "4H") && t.ema) pt(t.ema.e200, tf + " EMA200", tf, 2);
      ((t.liquidity || {}).equalHighs || []).forEach(function (p) { pt(p, tf + " 等高流动性 EQH", tf, 2); });
      ((t.liquidity || {}).equalLows || []).forEach(function (p) { pt(p, tf + " 等低流动性 EQL", tf, 2); });
      (t.patterns || []).forEach(function (p) {
        var nm = ZH.pattern[p.name] || p.name, tg = num(p.target);
        pt(p.level, tf + " " + nm + "关键位", tf, 2);
        // a target already passed is no longer a level worth watching
        if (tg !== null && ((p.bias === "bullish" && tg > price) || (p.bias === "bearish" && tg < price))) pt(tg, tf + " " + nm + "目标", tf, 1);
      });
      (t.fvgs || []).forEach(function (g) {
        var top = num(g.top), bot = num(g.bottom); if (top === null || bot === null) return;
        if (bot - price > win || price - top > win) return;
        zones.push({ kind: "zone", top: top, bottom: bot, price: (top + bot) / 2, polarity: g.dir, tf: tf, tapped: !!g.tapped,
          label: tf + (g.dir === "bull" ? " 看多 FVG" : " 看空 FVG"), strength: w, time: g.time,
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
      var items = g.items.slice().sort(function (a, b) { return b.w - a.w; });
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
    out.push({ id: "htf", label: "大周期同向（D 与 4H 一致）", ok: al === "none" ? false : al === plan.side,
      detail: al === "none" ? "D 与 4H 结构分歧：属于逆势或反弹交易" : al === plan.side ? "D 与 4H 均" + (dir > 0 ? "看多" : "看空") : "D 与 4H 均" + (dir > 0 ? "看空" : "看多") + "：与计划方向相反" });
    var e = num(rawEntry), zoneOk = null, zd = "需要入场价";
    if (H1 && H1.range && e !== null) {
      var pct = Math.round((e - H1.range.bottom) / (H1.range.top - H1.range.bottom) * 100);
      zoneOk = dir > 0 ? pct <= 50 : pct >= 50;
      zd = (pct > 100 ? "入场在 1H 区间上方（溢价）" : pct < 0 ? "入场在 1H 区间下方（折价）" : "入场位于 1H 区间 " + pct + "%（" + (pct > 55 ? "溢价区" : pct < 45 ? "折价区" : "均衡区") + "）") + (zoneOk ? "" : dir > 0 ? "：做多宜在下半区" : "：做空宜在上半区");
    }
    out.push({ id: "zone", label: dir > 0 ? "折价区做多" : "溢价区做空", ok: zoneOk, detail: zd });
    var li = M15 && M15.lastInternal;
    var trig = li ? li.dir === want && li.barsAgo <= 8 : null;
    out.push({ id: "trigger", label: "15M 触发信号", ok: trig,
      detail: li ? "最近 15M 内部结构：" + li.type + (li.dir === "bull" ? " ▲" : " ▼") + " · " + li.barsAgo + " 根前" + (trig ? "" : "，等待同向 i-CHoCH") : "暂无数据" });
    var best = sz ? Math.max(sz.r1 || 0, sz.r2 || 0) : 0;
    out.push({ id: "rr", label: "盈亏比 ≥ 1:2", ok: sz && sz.dist ? (best > 0 ? best >= 2 : null) : null,
      detail: best > 0 ? "最远目标 " + best.toFixed(1) + "R" : "需要止损与目标价" });
    var atrOk = null, ad = "需要入场价与止损价";
    if (sz && sz.dist && H1 && H1.atr) { var m = sz.dist / H1.atr; atrOk = m >= 0.8 && m <= 5; ad = "止损距离 = " + m.toFixed(1) + "× 1H ATR（" + fmt(H1.atr, 1) + "）" + (m < 0.8 ? "：偏紧，易被扫" : m > 5 ? "：偏宽，手数会很小" : ""); }
    out.push({ id: "stop", label: "止损距离合理", ok: atrOk, detail: ad });
    var riskOk = null, rd = "需要账户余额与风险比例";
    if (sz && sz.actualPct !== null) {
      if (sz.lots === 0) { riskOk = false; rd = "最小手数的风险 $" + fmt(sz.minLotRisk, 0) + " 已超过设定上限 $" + fmt(sz.riskUsd, 0) + "：开不了仓"; }
      else { riskOk = sz.actualPct <= 1.0001; rd = "实际风险 " + sz.actualPct.toFixed(2) + "%（$" + fmt(sz.actualRisk, 0) + "）"; }
    }
    out.push({ id: "risk", label: "单笔风险 ≤ 1%", ok: riskOk, detail: rd });
    return out;
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

  return { TF_ORDER: TF_ORDER, TF_WEIGHT: TF_WEIGHT, ZH: ZH, num: num, fmt: fmt, levels: levels, candidate: candidate, candidates: candidates,
    size: size, checks: checks, votes: votes, headline: headline, summary: summary, eventText: eventText, patternText: patternText,
    statusText: statusText, planText: planText };
})();
if (typeof module !== "undefined" && module.exports) module.exports = XauPlan;
