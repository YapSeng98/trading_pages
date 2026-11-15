// 形态说明: a popup for the chart pattern on screen (2026-11-15, owner: "create a small pop up to show the details of
// the chart pattern for the current gold/bitcoin and forex ... how to identify and when is the entries point TP and SL").
// For that pattern: how to spot it (worded from the engine's own definitions, xPatterns in xau-engine.js), the textbook
// trade with this pattern's own prices (XauPlan.patternPlan: in on the break, stop where it fails, target the measured
// move), a sketch of the textbook shape with those three levels, where the price is now against them, and the replay's
// record for trading patterns this way (patterns.own in the market's replay file). Reference, never a signal: the replay
// found no edge in patterns (CLAUDE.md), and the popup says so.
// Used by the gold and Bitcoin pages (market-page.js) and the forex page (fx-page.js).
// PatGuide.open(pattern, { tf, fmt(v) -> text, price() -> the price now (live, or the last close), priceWord, market,
//   live: true to follow the price while open, replay: url, replayName, replayNote, opener }); prices in the engine's units
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var tr = window.T || function (zh) { return zh; }, EN = window.LANG === "en";
  var C = { bull: "var(--m-bull,#0ab074)", bear: "var(--m-bear,#db2943)", gold: "var(--gold,#D4A72C)", ink: "var(--ink,#F4F5FB)", dim: "var(--dim,#858BA3)" };
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function sv(n, a, p) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function tx(p, x, y, s, a) { var t = sv("text", Object.assign({ x: x.toFixed(1), y: y.toFixed(1) }, a || {}), p); t.textContent = s; return t; }
  var TFW = { D: tr("日线", "daily"), "4H": tr("4 小时", "4-hour"), "1H": tr("1 小时", "1-hour") };

  // ---------- how to spot each pattern: the engine's tests in plain words ----------
  var CLOSE = tr("要等这个周期的 K 线收盘才算，盘中碰到不算。", "It counts only when a candle of this timeframe closes there; touching it during the candle does not.");
  var SPOT = {
    "Double top": [tr("涨了一段之后，价格两次涨到差不多同一个高点（相差不到 0.35 倍 ATR），中间回落出一个低点。", "After a rise, price reaches about the same high twice (within 0.35 × ATR), with a pullback low in between."),
      tr("两个顶之间的最低点画一条水平线，就是「颈线」；顶要比颈线高出至少 1.5 倍 ATR 才算数。", "A flat line through the lowest low between the two tops is the neckline; the tops must stand at least 1.5 × ATR above it to count."),
      tr("K 线收盘跌破颈线才算完成；之前只是「形成中」。", "It is complete only when a candle closes below the neckline; before that it is only forming.")],
    "Double bottom": [tr("跌了一段之后，价格两次跌到差不多同一个低点（相差不到 0.35 倍 ATR），中间反弹出一个高点。", "After a fall, price reaches about the same low twice (within 0.35 × ATR), with a bounce high in between."),
      tr("两个底之间的最高点画一条水平线，就是「颈线」；底要比颈线低至少 1.5 倍 ATR 才算数。", "A flat line through the highest high between the two bottoms is the neckline; the bottoms must sit at least 1.5 × ATR below it to count."),
      tr("K 线收盘站上颈线才算完成；之前只是「形成中」。", "It is complete only when a candle closes above the neckline; before that it is only forming.")],
    "Head and shoulders": [tr("三个高点：中间的「头」最高（比两边至少高 0.5 倍 ATR），左右两个「肩」高度差不多。", "Three highs: the middle one, the head, is the highest (at least 0.5 × ATR above the others), and the two shoulders are about level."),
      tr("两肩之间的两个低点连成「颈线」，可以是斜的。", "The two lows between them, joined, make the neckline; it may slope."),
      tr("K 线收盘跌破颈线才算完成；右肩出现但没跌破时是「形成中」。", "It is complete only when a candle closes below the neckline; with the right shoulder in place but no break it is still forming.")],
    "Inverse head and shoulders": [tr("三个低点：中间的「头」最低（比两边至少低 0.5 倍 ATR），左右两个「肩」高度差不多。", "Three lows: the middle one, the head, is the lowest (at least 0.5 × ATR below the others), and the two shoulders are about level."),
      tr("两肩之间的两个高点连成「颈线」，可以是斜的。", "The two highs between them, joined, make the neckline; it may slope."),
      tr("K 线收盘站上颈线才算完成；右肩出现但没突破时是「形成中」。", "It is complete only when a candle closes above the neckline; with the right shoulder in place but no break it is still forming.")],
    "Ascending triangle": [tr("上方几个高点停在差不多同一个价位（平的上沿），下方的低点一个比一个高（上升的下沿）。", "The highs stop at about the same price (a flat top) while each low is higher than the last (a rising bottom)."),
      tr("两条线越收越窄：买方一次比一次更早接住，卖方守着同一个价。", "The two lines narrow: buyers step in earlier each time while sellers hold one price."),
      tr("收盘高出上沿 0.25 倍 ATR 算向上突破；收盘跌破下沿 0.25 倍 ATR 算失败。", "A close 0.25 × ATR above the top line is a breakout; a close 0.25 × ATR below the bottom line means it failed.")],
    "Descending triangle": [tr("下方几个低点停在差不多同一个价位（平的下沿），上方的高点一个比一个低（下降的上沿）。", "The lows stop at about the same price (a flat bottom) while each high is lower than the last (a falling top)."),
      tr("两条线越收越窄：卖方一次比一次更早出手，买方守着同一个价。", "The two lines narrow: sellers step in earlier each time while buyers hold one price."),
      tr("收盘低于下沿 0.25 倍 ATR 算向下突破；收盘高出上沿 0.25 倍 ATR 算失败。", "A close 0.25 × ATR below the bottom line is a breakdown; a close 0.25 × ATR above the top line means it failed.")],
    "Symmetrical triangle": [tr("高点一个比一个低，低点一个比一个高，两条线向中间收拢。", "Each high is lower and each low is higher: the two lines close in on each other."),
      tr("它本身没有方向：多空都在收缩，等它选边。", "It has no direction of its own: both sides are holding back until it picks one."),
      tr("收盘高出上沿 0.25 倍 ATR 看多，收盘低于下沿 0.25 倍 ATR 看空。", "A close 0.25 × ATR above the top line points up; a close 0.25 × ATR below the bottom line points down.")],
    "Rising wedge": [tr("高点和低点都在抬高，但两条线越收越窄（开始时的宽度至少收窄四分之一）。", "Highs and lows both rise, but the two lines narrow (by at least a quarter of their starting width)."),
      tr("涨势在变弱：每一次新高都比上一次涨得少。", "The rise is tiring: each new high adds less than the last."),
      tr("通常向下破：收盘低于下沿 0.25 倍 ATR 才算。", "It usually breaks down: a close 0.25 × ATR below the bottom line.")],
    "Falling wedge": [tr("高点和低点都在降低，但两条线越收越窄（开始时的宽度至少收窄四分之一）。", "Highs and lows both fall, but the two lines narrow (by at least a quarter of their starting width)."),
      tr("跌势在变弱：每一次新低都比上一次跌得少。", "The fall is tiring: each new low takes less than the last."),
      tr("通常向上破：收盘高出上沿 0.25 倍 ATR 才算。", "It usually breaks up: a close 0.25 × ATR above the top line.")],
    "Rising channel": [tr("高点和低点都在抬高，两条线大致平行。", "Highs and lows both rise, along two roughly parallel lines."),
      tr("价格在通道里来回：碰上沿回落，碰下沿反弹。", "Price swings inside it: down from the top line, up from the bottom line."),
      tr("收盘高出上沿 0.25 倍 ATR 是加速向上；收盘低于下沿 0.25 倍 ATR 是上涨节奏被打破。", "A close 0.25 × ATR above the top line is the rise speeding up; a close 0.25 × ATR below the bottom line breaks the rise.")],
    "Falling channel": [tr("高点和低点都在降低，两条线大致平行。", "Highs and lows both fall, along two roughly parallel lines."),
      tr("价格在通道里来回：碰上沿回落，碰下沿反弹。", "Price swings inside it: down from the top line, up from the bottom line."),
      tr("收盘低于下沿 0.25 倍 ATR 是加速向下；收盘高出上沿 0.25 倍 ATR 是下跌节奏被打破。", "A close 0.25 × ATR below the bottom line is the fall speeding up; a close 0.25 × ATR above the top line breaks the fall.")],
    "Range": [tr("高点停在差不多同一个价，低点也停在差不多同一个价：上下两条线都是平的。", "Highs stop at about one price and lows at about another: both lines are flat."),
      tr("多空平衡，没有方向。", "Buyers and sellers are balanced: no direction."),
      tr("收盘高出上沿或低于下沿 0.25 倍 ATR，才算选了边。", "It picks a side only with a close 0.25 × ATR beyond the top or the bottom line.")],
    "Bull flag": [tr("先有一段很急的上涨（旗杆）：3 到 8 根 K 线涨了至少 4 倍 ATR。", "First a sharp rise, the pole: at least 4 × ATR in 3 to 8 candles."),
      tr("然后 4 到 25 根 K 线窄幅回落或横走（旗面）：回撤不到旗杆的一半，区间小于旗杆的 0.6 倍。", "Then 4 to 25 candles drift down or sideways in a tight box, the flag: giving back less than half the pole, in a range under 0.6 of its length."),
      tr("K 线收盘突破旗面的高点才算完成。", "It is complete when a candle closes above the flag's high.")],
    "Bear flag": [tr("先有一段很急的下跌（旗杆）：3 到 8 根 K 线跌了至少 4 倍 ATR。", "First a sharp fall, the pole: at least 4 × ATR in 3 to 8 candles."),
      tr("然后 4 到 25 根 K 线窄幅反弹或横走（旗面）：回撤不到旗杆的一半，区间小于旗杆的 0.6 倍。", "Then 4 to 25 candles drift up or sideways in a tight box, the flag: taking back less than half the pole, in a range under 0.6 of its length."),
      tr("K 线收盘跌破旗面的低点才算完成。", "It is complete when a candle closes below the flag's low.")]
  };
  var FAM = { "Double top": "dt", "Double bottom": "dt", "Head and shoulders": "hs", "Inverse head and shoulders": "hs", "Bull flag": "flag", "Bear flag": "flag" };

  // the textbook trade's three rules, by family and the way the trade points
  function rules(name, dir) {
    var up = dir > 0, fam = FAM[name] || "shape";
    if (fam === "dt" || fam === "hs") return {
      entry: up ? tr("K 线收盘站上颈线时买入", "Buy when a candle closes above the neckline") : tr("K 线收盘跌破颈线时卖出", "Sell when a candle closes below the neckline"),
      stop: fam === "dt" ? (up ? tr("两个底里较低的那个：跌回这里，形态就失败了", "The lower of the two bottoms: back there, the pattern has failed") : tr("两个顶里较高的那个：涨回这里，形态就失败了", "The higher of the two tops: back there, the pattern has failed"))
        : (up ? tr("头的最低点：跌回这里，形态就失败了", "The head's low: back there, the pattern has failed") : tr("头的最高点：涨回这里，形态就失败了", "The head's high: back there, the pattern has failed")),
      target: fam === "dt" ? (up ? tr("从颈线再往上量一个形态高度（底到颈线的距离）", "One pattern height (bottom to neckline) above the neckline") : tr("从颈线再往下量一个形态高度（顶到颈线的距离）", "One pattern height (top to neckline) below the neckline"))
        : (up ? tr("从颈线再往上量一个「头到颈线」的距离", "The head-to-neckline distance, measured up from the neckline") : tr("从颈线再往下量一个「头到颈线」的距离", "The head-to-neckline distance, measured down from the neckline")) };
    if (fam === "flag") return {
      entry: up ? tr("K 线收盘突破旗面高点时买入", "Buy when a candle closes above the flag's high") : tr("K 线收盘跌破旗面低点时卖出", "Sell when a candle closes below the flag's low"),
      stop: up ? tr("旗面的低点：跌回这里，形态就失败了", "The flag's low: back there, the pattern has failed") : tr("旗面的高点：涨回这里，形态就失败了", "The flag's high: back there, the pattern has failed"),
      target: up ? tr("从突破点再往上量一根旗杆的长度", "One pole length up from the break") : tr("从突破点再往下量一根旗杆的长度", "One pole length down from the break") };
    return {
      entry: up ? tr("K 线收盘站上上沿时买入（斜线的价位每根 K 线都在变，这里是最新一根的价）", "Buy when a candle closes above the top line (a sloping line's price changes each candle; this is its price at the latest one)")
        : tr("K 线收盘跌破下沿时卖出（斜线的价位每根 K 线都在变，这里是最新一根的价）", "Sell when a candle closes below the bottom line (a sloping line's price changes each candle; this is its price at the latest one)"),
      stop: up ? tr("下沿：回到这条线下面，突破就失败了", "The bottom line: back below it, the breakout has failed") : tr("上沿：回到这条线上面，突破就失败了", "The top line: back above it, the breakdown has failed"),
      target: up ? tr("从上沿再往上量一个形态开始时的宽度", "The pattern's starting width, measured up from the top line") : tr("从下沿再往下量一个形态开始时的宽度", "The pattern's starting width, measured down from the bottom line") };
  }

  // ---------- the sketch: a textbook drawing (0-100 grid, 0 at the top), not to scale ----------
  var MIR = { top: "bottom", head: "head", ls: "ls", rs: "rs" };
  function flipY(s) {   // the bullish twin of a bearish drawing: upside down
    var f = function (q) { return [q[0], 100 - q[1]]; };
    return { path: s.path.map(f), proj: s.proj.map(f), lines: s.lines.map(function (l) { return [f(l[0]), f(l[1]), l[2]]; }),
      pts: s.pts.map(function (q) { return [q[0], 100 - q[1], MIR[q[2]] || q[2]]; }), box: s.box ? { x0: s.box.x0, x1: s.box.x1, y0: 100 - s.box.y1, y1: 100 - s.box.y0 } : null,
      entry: 100 - s.entry, stop: 100 - s.stop, target: 100 - s.target, bars: s.bars.map(function (b) { return [b[0], 100 - b[1], 100 - b[2]]; }), dir: -s.dir, pole: s.pole ? [f(s.pole[0]), f(s.pole[1])] : null };
  }
  var DT = { path: [[0, 70], [14, 30], [28, 55], [42, 32], [56, 55], [63, 64]], proj: [[63, 64], [92, 80]], lines: [[[8, 55], [74, 55], "neck"]], pts: [[14, 30, "top"], [42, 32, "top"]],
    entry: 55, stop: 30, target: 80, bars: [[44, 30, 55], [84, 55, 80]], dir: -1 };
  var HS = { path: [[0, 74], [12, 44], [22, 56], [34, 22], [46, 57], [58, 44], [66, 64]], proj: [[66, 64], [92, 90]], lines: [[[16, 55.7], [76, 58.2], "neck"]], pts: [[12, 44, "ls"], [34, 22, "head"], [58, 44, "rs"]],
    entry: 57.5, stop: 22, target: 91, bars: [[34, 22, 56.5], [86, 57.5, 91]], dir: -1 };
  var FLAG = { path: [[0, 18], [10, 20], [30, 52], [36, 47], [42, 50], [48, 45], [54, 48], [60, 44], [66, 58]], proj: [[66, 58], [92, 84]], lines: [], pts: [], pole: [[10, 20], [30, 52]],
    box: { x0: 31, x1: 62, y0: 44, y1: 52 }, entry: 52, stop: 44, target: 84, bars: [[3, 20, 52], [86, 52, 84]], dir: -1 };
  var SHAPES = { "Ascending triangle": [40, 40, 72, 48], "Descending triangle": [28, 52, 60, 60], "Symmetrical triangle": [34, 46, 70, 56], "Rising wedge": [50, 26, 74, 36],
    "Falling wedge": [26, 52, 50, 62], "Rising channel": [56, 34, 76, 54], "Falling channel": [24, 46, 44, 66], "Range": [40, 40, 62, 62] };
  function shape(L, dir) {
    var uS = L[0], uE = L[1], lS = L[2], lE = L[3], X0 = 4, X1 = 60, at = function (s, e, x) { return s + (e - s) * (x - X0) / (X1 - X0); };
    var path = [], up = dir < 0;   // start on the line opposite the last touch: the last touch faces away from the break
    [4, 13, 22, 31, 40, 49, 58].forEach(function (x, i) { var onUp = (i % 2 === 0) === up; path.push([x, onUp ? at(uS, uE, x) + 1.2 : at(lS, lE, x) - 1.2]); });
    var ht = lS - uS, s = { path: path, proj: [], lines: [[[X0, uS], [X1 + 10, at(uS, uE, X1 + 10)], "upper"], [[X0, lS], [X1 + 10, at(lS, lE, X1 + 10)], "lower"]], pts: [], bars: [], dir: dir, band: [uS, uE, lS, lE, X0, X1 + 10] };
    if (dir > 0) { path.push([66, uE - 8]); s.entry = uE; s.stop = lE; s.target = uE - ht; }
    else if (dir < 0) { path.push([66, lE + 8]); s.entry = lE; s.stop = uE; s.target = lE + ht; }
    if (dir) { s.proj = [path[path.length - 1], [92, s.target]]; s.bars = [[6, uS, lS], [86, s.entry, s.target]]; }
    return s;
  }
  function sketch(name, dir, vals) {   // vals: this pattern's prices as text, and the entry level's name
    var fam = FAM[name], s;
    if (fam === "dt") s = name === "Double bottom" ? flipY(DT) : DT;
    else if (fam === "hs") s = name === "Inverse head and shoulders" ? flipY(HS) : HS;
    else if (fam === "flag") s = name === "Bull flag" ? flipY(FLAG) : FLAG;
    else s = shape(SHAPES[name] || SHAPES.Range, dir);
    var W = 340, H = 178, L = 8, R = 246, T = 14, B = 164, X = function (x) { return L + x * (R - L) / 100; }, Y = function (y) { return T + y * (B - T) / 100; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, class: "pg-svg", role: "img", "aria-label": tr("形态示意图", "Pattern sketch") });
    sv("rect", { x: X(s.dir ? 60 : 64), y: T - 6, width: R - X(s.dir ? 60 : 64), height: B - T + 12, fill: "rgba(255,255,255,.025)" }, svg);
    if (s.band) {          // the area between a triangle's / wedge's / channel's lines
      var b = s.band, at = function (st, en, x) { return st + (en - st) * (x - b[4]) / (60 - b[4]); };
      sv("polygon", { points: [[b[4], b[0]], [b[5], at(b[0], b[1], b[5])], [b[5], at(b[2], b[3], b[5])], [b[4], b[2]]].map(function (q) { return X(q[0]).toFixed(1) + "," + Y(q[1]).toFixed(1); }).join(" "), fill: s.dir > 0 ? "rgba(10,176,116,.09)" : s.dir < 0 ? "rgba(219,41,67,.09)" : "rgba(212,167,44,.09)" }, svg);
    }
    if (s.box) sv("rect", { x: X(s.box.x0), y: Y(s.box.y0), width: X(s.box.x1) - X(s.box.x0), height: Y(s.box.y1) - Y(s.box.y0), fill: "rgba(212,167,44,.08)", stroke: C.gold, "stroke-dasharray": "3 3" }, svg);
    if (s.pole) sv("line", { x1: X(s.pole[0][0]), y1: Y(s.pole[0][1]), x2: X(s.pole[1][0]), y2: Y(s.pole[1][1]), stroke: s.dir > 0 ? C.bull : C.bear, "stroke-width": 7, "stroke-linecap": "round", opacity: 0.28 }, svg);
    s.lines.forEach(function (l) { sv("line", { x1: X(l[0][0]), y1: Y(l[0][1]), x2: X(l[1][0]), y2: Y(l[1][1]), stroke: C.gold, "stroke-width": 1.6, "stroke-linecap": "round" }, svg); });
    var nk = s.lines.filter(function (l) { return l[2] === "neck"; })[0];
    if (nk) tx(svg, X(nk[0][0]) + 2, Y(nk[0][1]) + (s.dir < 0 ? 13 : -6), tr("颈线", "neckline"), { class: "pg-lab", fill: C.gold });
    if (s.band) { tx(svg, X(5), Y(s.band[0]) - 5, tr("上沿", "top line"), { class: "pg-lab", fill: C.gold }); tx(svg, X(5), Y(s.band[2]) + 13, tr("下沿", "bottom line"), { class: "pg-lab", fill: C.gold }); }
    if (s.box) tx(svg, X(s.box.x1), Y(s.dir > 0 ? s.box.y1 : s.box.y0) + (s.dir > 0 ? 13 : -5), tr("旗面", "flag"), { class: "pg-lab", fill: C.gold, "text-anchor": "end" });
    if (s.pole) tx(svg, X((s.pole[0][0] + s.pole[1][0]) / 2) + 6, Y((s.pole[0][1] + s.pole[1][1]) / 2) + 4, tr("旗杆", "pole"), { class: "pg-lab", fill: C.dim });
    sv("polyline", { points: s.path.map(function (q) { return X(q[0]).toFixed(1) + "," + Y(q[1]).toFixed(1); }).join(" "), fill: "none", stroke: C.ink, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    var WORD = { top: tr("顶", "top"), bottom: tr("底", "bottom"), head: tr("头", "head"), ls: tr("左肩", "L shoulder"), rs: tr("右肩", "R shoulder") };
    s.pts.forEach(function (q) { sv("circle", { cx: X(q[0]), cy: Y(q[1]), r: 4, fill: "var(--bg2,#101016)", stroke: C.gold, "stroke-width": 2 }, svg); tx(svg, X(q[0]), Y(q[1]) + (q[1] < 50 ? -9 : 17), WORD[q[2]] || "", { class: "pg-lab", "text-anchor": "middle", fill: C.ink }); });
    if (!s.dir) { tx(svg, X(68), Y(50), tr("等它选边", "waiting for a side"), { class: "pg-lab", fill: C.dim }); return svg; }
    // the three levels, the measured move, and their labels in the right margin with this pattern's own prices
    var lv = [["entry", s.entry, C.gold, "5 3", vals.entryWord || tr("进场", "Entry")], ["stop", s.stop, C.bear, "2 3", tr("止损 SL", "Stop SL")], ["target", s.target, C.bull, "2 3", tr("止盈 TP", "Target TP")]];
    lv.forEach(function (l) { sv("line", { x1: X(56), x2: R, y1: Y(l[1]), y2: Y(l[1]), stroke: l[2], "stroke-width": 1.4, "stroke-dasharray": l[3] }, svg); });
    var p0 = s.proj[0], p1 = s.proj[1];
    sv("path", { d: "M" + X(p0[0]).toFixed(1) + " " + Y(p0[1]).toFixed(1) + " L" + X(p1[0]).toFixed(1) + " " + Y(p1[1]).toFixed(1), stroke: C.bull, "stroke-width": 1.6, "stroke-dasharray": "1 3", "stroke-linecap": "round", fill: "none" }, svg);
    var ax = X(p1[0]), ay = Y(p1[1]), dy = s.dir > 0 ? 6 : -6;
    sv("path", { d: "M" + (ax - 4) + " " + (ay + dy) + " L" + ax + " " + ay + " L" + (ax + 4) + " " + (ay + dy), stroke: C.bull, "stroke-width": 1.6, fill: "none" }, svg);
    s.bars.forEach(function (bb) { var x = X(bb[0]); sv("line", { x1: x, x2: x, y1: Y(bb[1]), y2: Y(bb[2]), stroke: C.dim, "stroke-width": 1 }, svg); [bb[1], bb[2]].forEach(function (yy) { sv("line", { x1: x - 3, x2: x + 3, y1: Y(yy), y2: Y(yy), stroke: C.dim, "stroke-width": 1 }, svg); }); tx(svg, x + 4, (Y(bb[1]) + Y(bb[2])) / 2 + 4, "H", { class: "pg-val", fill: C.dim }); });
    var labs = lv.map(function (l) { return { y: Y(l[1]), t: l[4], v: vals[l[0]], c: l[2] }; }).sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 27) labs[i].y = labs[i - 1].y + 27;   // a label and its figure take about 25px
    var over = labs[labs.length - 1].y - (H - 8); if (over > 0) labs.forEach(function (l) { l.y -= over; });
    if (labs[0].y < 12) { var d0 = 12 - labs[0].y; labs.forEach(function (l) { l.y += d0; }); }
    labs.forEach(function (l) { tx(svg, R + 6, l.y - 2, l.t, { class: "pg-lab", fill: l.c }); tx(svg, R + 6, l.y + 10, l.v, { class: "pg-val", fill: C.ink }); });
    return svg;
  }

  // The pattern's own three levels, whatever the price now: the same choice as XauPlan.patternPlan makes before it checks
  // the price (break level, where it fails, measured target), so a pattern that has already run still shows them.
  function levelsOf(p, dir) {
    var key = num(p.level), up = num(p.upper), lo = num(p.lower), ht = num(p.height);
    var trig = key !== null ? key : dir > 0 ? up : lo, stop = num(p.invalid) !== null ? num(p.invalid) : dir > 0 ? lo : up;
    var tgt = num(p.target) !== null ? num(p.target) : ht !== null && trig !== null ? trig + dir * ht : null;
    return { trigger: trig, stop: stop, target: tgt, rr: trig !== null && stop !== null && tgt !== null && trig !== stop ? Math.abs(tgt - trig) / Math.abs(trig - stop) : null };
  }

  // ---------- the replay's record for trading patterns their own way ----------
  var REC = {};
  function record(url) { return REC[url] || (REC[url] = fetch(url, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { return d && d.patterns && d.patterns.own || null; }).catch(function () { return null; })); }

  // ---------- the popup ----------
  var CSS = ".pg-dlg{margin:auto;border:0;padding:0;background:transparent;width:min(560px,calc(100vw - 32px));max-width:none;max-height:calc(100vh - 40px);color:var(--text,#C4C8D8);overflow:visible}" +
    ".pg-dlg::backdrop{background:rgba(4,6,14,.66)}" +
    ".pg-box{position:relative;background:var(--bg2,#0E1220);border:1px solid rgba(212,167,44,.32);border-radius:20px;padding:18px 18px 16px;max-height:calc(100vh - 40px);overflow:auto;box-shadow:0 24px 64px rgba(0,0,0,.55);font-size:13px;line-height:1.65}" +
    ".pg-h{display:flex;align-items:flex-start;gap:10px}.pg-h h3{margin:0;font:600 16px/1.4 'Space Grotesk','Noto Sans SC',sans-serif;color:var(--ink,#F4F5FB)}" +
    ".pg-h h3 .up{color:#34D399}.pg-h h3 .dn{color:#F87171}" +
    ".pg-x{margin-left:auto;flex:none;width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:var(--ink,#F4F5FB);font-size:20px;line-height:1;cursor:pointer}.pg-x:hover{background:rgba(255,255,255,.08)}" +
    ".pg-st{margin:4px 0 2px;color:var(--dim,#858BA3);font-size:12.5px}.pg-st i{font-style:normal;color:#C2A055;border:1px solid rgba(212,167,44,.35);border-radius:999px;padding:1px 8px;margin-right:6px;font-size:11px}" +
    ".pg-svg{display:block;width:100%;height:auto;margin:8px 0 2px}.pg-svg .pg-lab{font:600 11px 'Noto Sans SC',sans-serif}.pg-svg .pg-val{font:500 11px 'IBM Plex Mono',monospace}" +
    ".pg-cap{font-size:11px;color:var(--dim,#858BA3);margin:0 0 4px}" +
    ".pg-box h4{margin:14px 0 6px;font:600 13px/1.4 'Space Grotesk','Noto Sans SC',sans-serif;color:var(--ink,#F4F5FB)}" +
    ".pg-box ol{margin:0;padding-left:20px}.pg-box ol li{margin:3px 0}" +
    ".pg-tbl{width:100%;border-collapse:collapse}.pg-tbl td{padding:7px 6px;border-top:1px solid rgba(255,255,255,.07);vertical-align:top}" +
    ".pg-tbl td:first-child{white-space:nowrap;font-weight:600;color:var(--ink,#F4F5FB);padding-left:0}.pg-tbl td:last-child{text-align:right;white-space:nowrap;font:600 13px 'IBM Plex Mono',monospace;color:var(--ink,#F4F5FB);padding-right:0}" +
    ".pg-tbl tr.e td:first-child{color:#E6BE55}.pg-tbl tr.s td:first-child{color:#F87171}.pg-tbl tr.t td:first-child{color:#34D399}.pg-tbl .weak{color:#F59E0B}" +
    ".pg-now{margin-top:10px;padding:9px 11px;border-radius:12px;background:rgba(255,255,255,.04);color:var(--ink,#F4F5FB)}" +
    ".pg-rec{margin-top:12px;font-size:12px;color:var(--dim,#858BA3)}.pg-rec b{color:var(--text,#C4C8D8)}" +
    ".vp-how{border:1px solid rgba(212,167,44,.4);background:rgba(212,167,44,.08);color:#E6BE55;font:500 12px/1.2 'Noto Sans SC',sans-serif;padding:6px 11px;border-radius:999px;cursor:pointer;margin-left:6px;white-space:nowrap}.vp-how:hover{background:rgba(212,167,44,.16)}" +
    "@media(max-width:640px){.pg-dlg{width:100vw;margin:auto 0 0;max-height:90vh}.pg-box{border-radius:20px 20px 0 0;max-height:90vh;padding:16px 16px 20px}.vp-how{min-height:34px;margin:6px 0 0}}" +
    "@media(prefers-reduced-motion:no-preference){.pg-dlg[open] .pg-box{animation:pgIn .16s ease-out}}@keyframes pgIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}";
  function style() { if (document.getElementById("pg-css")) return; var s = document.createElement("style"); s.id = "pg-css"; s.textContent = CSS; document.head.appendChild(s); }
  style();

  var dlg = null, timer = null, back = null;
  function unlock() { document.documentElement.style.overflow = ""; if (timer) { clearInterval(timer); timer = null; } }
  function close() { if (!dlg) return; unlock(); if (dlg.open && dlg.close) dlg.close(); else dlg.removeAttribute("open"); }
  function open(p, o) {
    o = o || {}; var P = window.XauPlan; if (!p || !P) return;
    if (timer) { clearInterval(timer); timer = null; }
    var f = o.fmt || function (v) { return String(v); }, name = p.name, way = P.patternWay(p);
    var live = function () { return o.price ? num(o.price()) : null; };
    var pl = P.patternPlan(p, live());   // a pattern that has broken is entered at the price now, as on its chart
    var dir = pl ? pl.dir : way || (p.bias === "bullish" ? 1 : p.bias === "bearish" ? -1 : 0), lv = levelsOf(p, dir || 1);
    var fv = function (v) { return num(v) === null ? "—" : f(v); };
    if (!dlg) {
      dlg = document.createElement("dialog"); dlg.className = "pg-dlg"; dlg.setAttribute("aria-labelledby", "pg-title");
      dlg.addEventListener("click", function (e) { if (e.target === dlg) close(); });
      dlg.addEventListener("cancel", unlock);   // Esc: the page scrolls again at once, before the close event arrives
      dlg.addEventListener("close", function () { unlock(); if (back && back.focus) try { back.focus({ preventScroll: true }); } catch (e) {} });
      document.body.appendChild(dlg);
    }
    while (dlg.firstChild) dlg.removeChild(dlg.firstChild);
    var box = h("div", "pg-box"); dlg.appendChild(box);
    // title: timeframe, name, bias, status
    var hd = h("div", "pg-h"), h3 = h("h3"); h3.id = "pg-title";
    h3.appendChild(document.createTextNode((TFW[o.tf] || o.tf || "") + " · " + P.patternText(p) + (EN ? " " : "")));
    h3.appendChild(h("span", p.bias === "bullish" ? "up" : p.bias === "bearish" ? "dn" : "", p.bias === "bullish" ? tr("（偏多）", "(bullish)") : p.bias === "bearish" ? tr("（偏空）", "(bearish)") : tr("（没有方向）", "(no direction)")));
    var x = h("button", "pg-x", "×"); x.type = "button"; x.setAttribute("aria-label", tr("关闭", "Close")); x.addEventListener("click", close);
    hd.appendChild(h3); hd.appendChild(x); box.appendChild(hd);
    var st = h("p", "pg-st"); st.appendChild(h("i", "", tr("参考 · 不是信号", "reference · not a signal"))); st.appendChild(document.createTextNode((o.market ? o.market + " · " : "") + P.statusText(p.status))); box.appendChild(st);
    // the sketch with this pattern's own prices
    var vals = { entry: fv(lv.trigger), stop: fv(lv.stop), target: fv(lv.target), entryWord: way ? tr("突破位", "Break level") : null };
    box.appendChild(sketch(name, dir, vals));
    box.appendChild(h("p", "pg-cap", tr("示意图，不按比例；右边的数字是这一个形态的价位。", "A sketch, not to scale; the figures on the right are this pattern's own prices.")));
    // how to spot it
    box.appendChild(h("h4", "", tr("怎么认出来", "How to spot it")));
    var ol = h("ol"); (SPOT[name] || []).forEach(function (t) { ol.appendChild(h("li", "", t)); }); ol.appendChild(h("li", "", CLOSE)); box.appendChild(ol);
    // the textbook trade, rule by rule, with this pattern's prices
    box.appendChild(h("h4", "", tr("什么时候进场、止损、止盈", "When to enter, where the stop and target go")));
    var rl = rules(name, dir || 1), tb = h("table", "pg-tbl"), body = h("tbody"); tb.appendChild(body);
    var row = function (cls, k, rule, v) { var tr2 = h("tr", cls); tr2.appendChild(h("td", "", k)); tr2.appendChild(h("td", "", rule)); tr2.appendChild(h("td", "", v)); body.appendChild(tr2); return tr2; };
    if (!dir) {
      row("e", tr("进场", "Entry"), tr("还没有方向：等收盘突破上沿（做多）或跌破下沿（做空），突破哪边就做哪边。", "No direction yet: wait for a close above the top line (long) or below the bottom line (short), and trade the side it breaks."), (num(p.upper) !== null ? f(p.upper) : "—") + " / " + (num(p.lower) !== null ? f(p.lower) : "—"));
      row("s", tr("止损", "Stop"), tr("突破后的另一条线。", "The other line, once it has broken."), "—");
      row("t", tr("止盈", "Target"), tr("从突破的那条线量一个形态开始时的宽度。", "The pattern's starting width, measured from the line it breaks."), num(p.height) !== null ? "± " + f(p.height) : "—");
    } else {
      // with a trade left: entered at the break (still forming) or at the price now (already broken); with none left
      // (past its target or its fail level): the pattern's own levels, reward:risk counted from the break
      if (!pl && lv.trigger !== null) box.appendChild(h("p", "pg-cap", tr("按现价已经没有这笔交易（价格已过它的目标或失效位）；下面是这个形态本来的价位，盈亏比按突破位算。", "No trade left at this price (it is past the target or the fail level); below are the pattern's own levels, with reward:risk counted from the break.")));
      row("e", tr("进场", "Entry"), rl.entry + tr("。", ".") + (pl && pl.done ? tr("已经突破了：教科书做法是按现价进场，止损和目标不变（盈亏比按现价算）。", " It has already broken: the textbook entry is then the price now, with the same stop and target (reward:risk at that price).") : ""), pl ? f(pl.done ? pl.entry : pl.trigger) : fv(lv.trigger));
      row("s", tr("止损 SL", "Stop SL"), rl.stop + tr("。", "."), fv(pl ? pl.stop : lv.stop));
      row("t", tr("止盈 TP", "Target TP"), rl.target + tr("。", "."), fv(pl ? pl.target : lv.target));
      var rrv = pl ? pl.rr : lv.rr, rr = row("", tr("盈亏比", "R:R"), tr("目标的距离 ÷ 止损的距离；低于 1 表示赚的比可能亏的少。", "Distance to the target ÷ distance to the stop; below 1, it would make less than it could lose."), rrv !== null ? rrv.toFixed(2) : "—");
      if (rrv !== null && rrv < 1) rr.lastChild.className = "weak";
    }
    box.appendChild(tb);
    // where the price is now
    var now = h("div", "pg-now"); box.appendChild(now);
    var paintNow = function () {
      var v = live(); now.hidden = v === null; if (v === null) return;
      var q = P.patternPlan(p, v), w = (o.priceWord || tr("现价", "Price now")) + " " + f(v) + tr("：", ": "), d = function (a) { return f(Math.abs(v - a)); };
      if (!dir) now.textContent = w + tr("还在形态里，等收盘突破。", "still inside the pattern; wait for a close beyond it.");
      else if (!way && pl) now.textContent = w + ((pl.dir > 0 ? v > pl.trigger : v < pl.trigger) ? (EN ? "already beyond the entry level " + f(pl.trigger) + "; it counts only if the " + (TFW[o.tf] || o.tf) + " candle closes there." : "已经越过进场位 " + f(pl.trigger) + "，要等这根 " + (TFW[o.tf] || o.tf) + " K 线收盘还在那边才算。")
        : (EN ? d(pl.trigger) + " from the entry level " + f(pl.trigger) + "; not triggered." : "离进场位 " + f(pl.trigger) + " 还差 " + d(pl.trigger) + "，还没触发。"));
      else if (!way) now.textContent = w + tr("这一个的价位对不上，没有教科书做法可算。", "this one's prices do not line up, so there is no textbook trade to work out.");
      else if (q) now.textContent = w + (EN ? "entering here: stop " + f(q.stop) + " (" + d(q.stop) + " away), target " + f(q.target) + " (" + d(q.target) + " away), R:R " + q.rr.toFixed(2) + (q.rr < 1 ? ", below 1: not worth chasing." : ".") : "按现价进场：止损 " + f(q.stop) + "（相差 " + d(q.stop) + "），目标 " + f(q.target) + "（相差 " + d(q.target) + "），盈亏比 " + q.rr.toFixed(2) + (q.rr < 1 ? "，低于 1：不值得追。" : "。"));
      else if (lv.target !== null && (dir > 0 ? v >= lv.target : v <= lv.target)) now.textContent = w + (EN ? "it has already reached the target " + f(lv.target) + ": the measured move is done, no trade left in this pattern." : "已经到过目标 " + f(lv.target) + "：量度的幅度走完了，这个形态没有剩下的交易。");
      else if (lv.stop !== null && (dir > 0 ? v <= lv.stop : v >= lv.stop)) now.textContent = w + (EN ? "it is back through the fail level " + f(lv.stop) + ": the pattern has failed." : "已经回到失效位 " + f(lv.stop) + " 另一边：这个形态失败了。");
      else now.textContent = w + tr("按现价已经没有这笔交易。", "no trade left at this price.");
    };
    paintNow();
    // the replay's record
    var rec = h("p", "pg-rec", tr("正在读取回放结果…", "Reading the replay results…")); box.appendChild(rec);
    if (o.replay) record(o.replay).then(function (own) {
      var k = o.tf === "1H" ? "1H" : "4H", r = own && own[k];
      if (!r) { rec.textContent = tr("参考，不是信号：回放里形态单独拿来做没有优势。进场仍按页面上方的结论。", "Reference, not a signal: in the replay patterns had no edge on their own. Entries still go by the answer at the top of the page."); return; }
      while (rec.firstChild) rec.removeChild(rec.firstChild);
      rec.appendChild(h("b", "", tr("回放怎么说：", "What the replay says: ")));
      rec.appendChild(document.createTextNode((o.replayNote ? o.replayNote + (EN ? " " : "") : "") + (EN ? "traded this way, with each pattern's own stop and target, " + r.n.toLocaleString("en-US") + " " + TFW[k] + " patterns" + (o.replayName ? " on " + o.replayName : "") + (o.tf === "D" ? " (too few daily ones; the 4-hour result)" : "") + " won " + Math.round(r.win) + "% of the time but averaged " + (r.avgR >= 0 ? "+" : "−") + Math.abs(r.avgR).toFixed(2) + "R a trade: the wins are smaller than the losses, so over time it comes to about nothing. That is why patterns here only mark key levels, stops and targets; whether to enter still goes by the answer at the top of the page."
        : "按这个做法、用每个形态自己的止损和目标，" + (o.replayName ? o.replayName + "的 " : "") + r.n.toLocaleString("en-US") + " 个 " + TFW[k] + "形态" + (o.tf === "D" ? "（日线形态太少，这里用 4 小时的结果）" : "") + "赢了 " + Math.round(r.win) + "%，但平均每笔 " + (r.avgR >= 0 ? "+" : "−") + Math.abs(r.avgR).toFixed(2) + "R：赢的时候赚得少、输的时候亏得多，长期约等于不赚不亏。所以形态在这里只用来标出关键位、止损和目标；要不要进场，仍以页面上方的结论为准。")));
    });
    // open it
    back = o.opener || document.activeElement;
    document.documentElement.style.overflow = "hidden";
    if (dlg.showModal) { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } } else dlg.setAttribute("open", "");
    try { x.focus({ preventScroll: true }); } catch (e) {}
    if (o.live && o.price) timer = setInterval(paintNow, 2000);
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && dlg && dlg.open && !dlg.showModal) close(); });
  window.PatGuide = { open: open, close: close };
})();
