// Draws one chart pattern on its own candles: the bars around it, its points (tops, bottoms, shoulders, head, the
// swing highs and lows of a triangle), its lines (neckline, upper and lower edge, a flag's pole and box), and to the
// right of the last closed bar the levels its textbook trade uses: the break level, where it fails, and its measured
// target. Used by the gold, Bitcoin and forex pages; the pattern comes from the engine (xau-engine.js `geo`).
// Reference only: the replay found no edge in patterns (CLAUDE.md), and the caller says so next to the chart.
// PatChart.draw(rows, pattern, opts) -> element or null
//   rows: closed candles [openMs, o, h, l, c, …] of the pattern's timeframe, in the pattern's price units
//   opts: { fmt(v) -> text, plan: XauPlan.patternPlan(…) or null, title, tfLabel, w: the width it will be shown at,
//           live: the price now and bar: the candle still forming [openMs, o, h, l, c], both optional, kept inside the scale }
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var tr = window.T || function (zh) { return zh; };
  var LAB = { top: tr("顶", "top"), bottom: tr("底", "bottom"), ls: tr("左肩", "L shoulder"), head: tr("头", "head"), rs: tr("右肩", "R shoulder") };
  var C = { bull: "var(--m-bull,#0ab074)", bear: "var(--m-bear,#db2943)", gold: "var(--gold,#D4A72C)", ink: "var(--ink,#F6F5F3)", dim: "var(--dim,#8A857E)" };
  function el(n, a, p) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function txt(p, x, y, s, a) { var t = el("text", Object.assign({ x: x.toFixed(1), y: y.toFixed(1) }, a || {}), p); t.textContent = s; return t; }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }

  function draw(rows, pat, o) {
    o = o || {};
    var g = pat && pat.geo; if (!g || !rows || rows.length < 10) return null;
    var idx = {}; rows.forEach(function (r, i) { idx[r[0]] = i; });
    var at = function (t) { return idx[t] === undefined ? null : idx[t]; };
    var lastI = at(g.last); if (lastI === null) lastI = rows.length - 1;
    var starts = g.pts.map(function (q) { return at(q.t); }).concat(g.lines.map(function (l) { return at(l.t0); }), g.box ? [at(g.box.t0)] : []).filter(function (i) { return i !== null; });
    if (!starts.length) return null;
    var first = Math.min.apply(null, starts), span = lastI - first + 1;
    var s = Math.max(0, first - Math.max(6, Math.round(span * 0.25))), e = lastI;
    if (e - s + 1 > 150) s = e - 149;
    var R = rows.slice(s, e + 1), n = R.length, proj = Math.max(8, Math.round(n * 0.24));

    // drawn at the width it is shown at (opts.w), so the labels keep their size on a phone
    var W = Math.round(Math.max(290, Math.min(480, o.w || 420))), H = Math.round(Math.max(210, Math.min(250, W * 0.56))), L = 4, RG = 64, T = 14, B = 20, cw = (W - L - RG) / (n + proj);
    var X = function (i) { return L + (i - s + 0.5) * cw; }, xEnd = X(e) + cw / 2, xR = W - RG;
    var plan = o.plan || null, dir = plan ? plan.dir : pat.bias === "bullish" ? 1 : pat.bias === "bearish" ? -1 : 0;
    var col = dir > 0 ? C.bull : dir < 0 ? C.bear : C.gold;

    // price range: the bars, the pattern, and its levels (a far target is allowed to stretch the range by 70% at most)
    var lo = Infinity, hi = -Infinity;
    R.forEach(function (r) { lo = Math.min(lo, r[3]); hi = Math.max(hi, r[2]); });
    var rng = hi - lo || 1, levels = [];
    var addLv = function (v, kind, label) { v = num(v); if (v === null) return; levels.push({ v: v, kind: kind, label: label }); lo = Math.min(lo, Math.max(v, lo - 0.7 * rng)); hi = Math.max(hi, Math.min(v, hi + 0.7 * rng)); };
    if (plan) { addLv(plan.trigger, "trig", plan.done ? tr("突破位", "break level") : tr("突破才进", "on break")); addLv(plan.stop, "stop", tr("失效位", "fails")); addLv(plan.target, "tgt", tr("目标", "target")); }
    else { addLv(pat.level, "trig", tr("关键位", "key level")); addLv(pat.upper, "trig", tr("上沿", "upper edge")); addLv(pat.lower, "trig", tr("下沿", "lower edge")); addLv(pat.invalid, "stop", tr("失效位", "fails")); addLv(pat.target, "tgt", tr("目标", "target")); }
    // the price now and the candle still forming are drawn on the chart, not pinned to its edge (up to a range further)
    [num(o.live)].concat(o.bar ? [num(o.bar[2]), num(o.bar[3])] : []).forEach(function (v) { if (v !== null) { lo = Math.min(lo, Math.max(v, lo - rng)); hi = Math.max(hi, Math.min(v, hi + rng)); } });
    var py = (hi - lo) * 0.07; lo -= py; hi += py;
    var Y = function (v) { return T + (hi - v) * (H - T - B) / (hi - lo); };
    var clampY = function (y) { return Math.max(T - 4, Math.min(H - B + 4, y)); };

    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "pc-svg", role: "img", "aria-label": o.title || tr("形态图", "Pattern chart") });
    var defs = el("defs", {}, svg), cp = el("clipPath", { id: "pcclip" + (++draw.n) }, defs); el("rect", { x: L, y: T - 4, width: xR - L, height: H - T - B + 8 }, cp);
    var clip = "url(#pcclip" + draw.n + ")";
    [0.25, 0.5, 0.75].forEach(function (f) { var y = T + f * (H - T - B); el("line", { x1: L, x2: xR, y1: y, y2: y, stroke: "rgba(255,255,255,.05)" }, svg); });
    el("rect", { x: xEnd, y: T - 4, width: xR - xEnd, height: H - T - B + 8, fill: "rgba(255,255,255,.028)" }, svg);
    txt(svg, xEnd + 4, H - 6, tr("之后", "after"), { class: "pc-ax" });

    // a line at bar i, from its anchor and slope (per bar), clipped to the drawn bars and the space after them
    var lineAt = function (l, i) { var i1 = at(l.t1); return i1 === null ? null : l.p1 + (l.m || 0) * (i - i1); };
    var up = g.lines.filter(function (l) { return l.k === "upper"; })[0], dn = g.lines.filter(function (l) { return l.k === "lower"; })[0];
    var ext = e + Math.round(proj * 0.55);
    if (up && dn) {                                    // the area between a triangle's / wedge's / channel's edges
      var a0 = Math.max(s, at(up.t0) === null ? s : at(up.t0)), pts = [];
      for (var i = a0; i <= ext; i += Math.max(1, Math.round((ext - a0) / 40))) pts.push(X(i).toFixed(1) + "," + Y(lineAt(up, i)).toFixed(1));
      pts.push(X(ext).toFixed(1) + "," + Y(lineAt(up, ext)).toFixed(1));
      for (var j = ext; j >= a0; j -= Math.max(1, Math.round((ext - a0) / 40))) pts.push(X(j).toFixed(1) + "," + Y(lineAt(dn, j)).toFixed(1));
      pts.push(X(a0).toFixed(1) + "," + Y(lineAt(dn, a0)).toFixed(1));
      el("polygon", { points: pts.join(" "), fill: dir > 0 ? "rgba(10,176,116,.10)" : dir < 0 ? "rgba(219,41,67,.10)" : "rgba(212,167,44,.10)", "clip-path": clip }, svg);
    }
    if (g.box) {                                       // a flag's consolidation
      var b0 = at(g.box.t0), b1 = at(g.box.t1);
      if (b0 !== null && b1 !== null) el("rect", { x: X(b0) - cw / 2, y: Y(g.box.hi), width: (b1 - b0 + 1) * cw, height: Math.max(2, Y(g.box.lo) - Y(g.box.hi)), fill: "rgba(212,167,44,.08)", stroke: C.gold, "stroke-dasharray": "3 3", "stroke-width": 1 }, svg);
    }

    // the candles
    var bw = Math.max(1, Math.min(7, cw * 0.62));
    R.forEach(function (r, k) {
      var i = s + k, x = X(i), upc = r[4] >= r[1], c = upc ? C.bull : C.bear;
      el("line", { x1: x.toFixed(1), x2: x.toFixed(1), y1: Y(r[2]).toFixed(1), y2: Y(r[3]).toFixed(1), stroke: c, "stroke-width": 1, opacity: 0.8 }, svg);
      var y0 = Y(Math.max(r[1], r[4])), y1 = Y(Math.min(r[1], r[4]));
      el("rect", { x: (x - bw / 2).toFixed(1), y: y0.toFixed(1), width: bw.toFixed(1), height: Math.max(1, y1 - y0).toFixed(1), fill: c, rx: bw > 4 ? 1 : 0 }, svg);
    });

    // the pattern's lines
    g.lines.forEach(function (l) {
      var i0 = at(l.t0); if (i0 === null || i0 < s) i0 = s;
      var iEnd = l.k === "pole" ? at(l.t1) : ext; if (iEnd === null) return;
      var p0 = l.k === "pole" ? l.p0 : lineAt(l, i0), p1 = l.k === "pole" ? l.p1 : lineAt(l, iEnd);
      el("line", { x1: X(i0).toFixed(1), y1: Y(p0).toFixed(1), x2: X(iEnd).toFixed(1), y2: Y(p1).toFixed(1), stroke: l.k === "pole" ? col : C.gold, "stroke-width": l.k === "pole" ? 3 : 1.8, "stroke-linecap": "round", "clip-path": clip, opacity: l.k === "pole" ? 0.7 : 1 }, svg);
      if (l.k === "neck") txt(svg, X(i0) + 2, Y(p0) + (dir < 0 ? 13 : -6), tr("颈线", "neckline"), { class: "pc-lab", fill: C.gold });
    });
    // the pattern's points
    g.pts.forEach(function (q) {
      var i = at(q.t); if (i === null || i < s) return;
      var r = rows[i], high = q.k === "top" || q.k === "hi" || ((q.k === "ls" || q.k === "head" || q.k === "rs") && q.p >= (r[1] + r[4]) / 2), x = X(i), y = Y(q.p);
      if (q.k === "neck") { el("rect", { x: (x - 3).toFixed(1), y: (y - 3).toFixed(1), width: 6, height: 6, transform: "rotate(45 " + x.toFixed(1) + " " + y.toFixed(1) + ")", fill: C.gold }, svg); return; }
      if (q.k === "pole") return;
      el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: LAB[q.k] ? 4.5 : 3, fill: "var(--bg2,#101016)", stroke: C.gold, "stroke-width": 2 }, svg);
      if (LAB[q.k]) txt(svg, x, high ? y - 9 : y + 17, LAB[q.k], { class: "pc-lab", "text-anchor": "middle", fill: C.ink });
    });

    // the levels its textbook trade uses, drawn after the last bar, labels in the right margin
    var COLS = { trig: C.gold, stop: C.bear, tgt: C.bull };           // red where it fails, green where it pays, either way
    var seen = {}, labs = [];
    levels.forEach(function (lv) {
      var key = lv.kind + Math.round(lv.v * 100); if (seen[key]) return; seen[key] = 1;
      var y = clampY(Y(lv.v)), off = y !== Y(lv.v);
      el("line", { x1: xEnd.toFixed(1), x2: xR.toFixed(1), y1: y.toFixed(1), y2: y.toFixed(1), stroke: COLS[lv.kind], "stroke-width": 1.4, "stroke-dasharray": lv.kind === "trig" ? "5 3" : "2 3" }, svg);
      labs.push({ y: y, text: lv.label + (off ? (lv.v > hi ? " ↑" : " ↓") : ""), val: o.fmt ? o.fmt(lv.v) : String(lv.v), col: COLS[lv.kind] });
    });
    var lastR = rows[e], cy = Y(lastR[4]);
    el("circle", { cx: X(e).toFixed(1), cy: cy.toFixed(1), r: 3.5, fill: C.ink, stroke: "var(--bg2,#101016)", "stroke-width": 1.5 }, svg);
    labs.push({ y: cy, text: tr("最后收盘", "last close"), val: o.fmt ? o.fmt(lastR[4]) : String(lastR[4]), col: C.ink, close: true });
    if (plan) {                                        // the measured move, as an arrow from the last close toward the target
      var ty = clampY(Y(plan.target)), tx = xEnd + (xR - xEnd) * 0.55;
      el("path", { d: "M" + X(e).toFixed(1) + " " + cy.toFixed(1) + " L" + tx.toFixed(1) + " " + ty.toFixed(1), stroke: COLS.tgt, "stroke-width": 1.5, "stroke-dasharray": "1 3", fill: "none", "stroke-linecap": "round" }, svg);
      el("path", { d: "M" + (tx - 4) + " " + (ty + (dir > 0 ? 6 : -6)) + " L" + tx + " " + ty + " L" + (tx + 4) + " " + (ty + (dir > 0 ? 6 : -6)), stroke: COLS.tgt, "stroke-width": 1.5, fill: "none" }, svg);
    }
    // right-margin labels, pushed apart so none overlap
    labs.sort(function (a, b) { return a.y - b.y; });
    for (var q = 1; q < labs.length; q++) if (labs[q].y - labs[q - 1].y < 22) labs[q].y = labs[q - 1].y + 22;
    var over = labs.length ? labs[labs.length - 1].y - (H - 6) : 0;
    if (over > 0) labs.forEach(function (l) { l.y -= over; });
    labs.forEach(function (l) { l.a = txt(svg, xR + 5, l.y - 2, l.text, { class: "pc-lab", fill: l.col }); l.b = txt(svg, xR + 5, l.y + 9, l.val, { class: "pc-val", fill: C.ink }); });
    txt(svg, L + 2, H - 6, o.tfLabel ? o.tfLabel + " · " + n + tr(" 根", " bars") : n + tr(" 根", " bars"), { class: "pc-ax" });

    // the price now, for a caller that follows it (gold, Bitcoin): the candle still forming, hollow, in the first slot
    // after the last close; a dot at the price with a line to the right edge; and the figure in the right margin, in the
    // free slot nearest the price (the last close's label gives way to it). Hidden until wrap.setLive(price, bar) is
    // called. It returns false when the price is off the drawn scale (then it sits at the edge with an arrow), so the
    // caller can draw the chart again with opts.live.
    var liveG = el("g", { visibility: "hidden", "pointer-events": "none" }, svg), xF = X(e + 1);
    var fWick = el("line", { x1: xF.toFixed(1), x2: xF.toFixed(1), "stroke-width": 1 }, liveG);
    var fBody = el("rect", { x: (xF - bw / 2).toFixed(1), width: bw.toFixed(1), fill: "none", "stroke-width": 1.3, rx: bw > 4 ? 1 : 0 }, liveG);
    var liveLn = el("line", { x1: X(e).toFixed(1), y1: cy.toFixed(1), stroke: C.ink, "stroke-width": 1, opacity: 0.5 }, liveG);
    var liveH = el("line", { x2: xR.toFixed(1), stroke: C.ink, "stroke-width": 1, "stroke-dasharray": "1 3", opacity: 0.6 }, liveG);
    var liveRing = el("circle", { r: 6, fill: "none", stroke: C.ink, "stroke-width": 1, class: "pc-ring" }, liveG);
    var liveDot = el("circle", { r: 3, fill: C.ink }, liveG);
    var liveA = txt(liveG, xR + 5, 0, tr("现价", "now"), { class: "pc-lab", fill: C.ink }), liveB = txt(liveG, xR + 5, 0, "", { class: "pc-val pc-now", fill: C.ink });
    var closeLab = labs.filter(function (l) { return l.close; })[0], fixed = labs.filter(function (l) { return !l.close; }), hollow = null;
    var free = function (c) { return c >= T && c <= H - 6 && fixed.every(function (l) { return Math.abs(l.y - c) >= 22; }); };
    var wrap = document.createElement("div"); wrap.className = "pc";
    wrap.setLive = function (v, bar) {
      v = num(v); var b = v !== null && bar && num(bar[1]) !== null ? bar : null, on = v !== null;
      liveG.setAttribute("visibility", on ? "visible" : "hidden");
      if (closeLab) { closeLab.a.setAttribute("visibility", on ? "hidden" : "visible"); closeLab.b.setAttribute("visibility", on ? "hidden" : "visible"); }
      if (hollow) hollow.hidden = !b;
      if (!on) return true;
      var y0 = Y(v), y = clampY(y0), x = b ? xF : xEnd + 9;
      if (b) {
        var bo = b[1], c = v >= bo ? C.bull : C.bear, t0 = clampY(Y(Math.max(bo, v))), t1 = clampY(Y(Math.min(bo, v)));
        fWick.setAttribute("y1", clampY(Y(Math.max(num(b[2]) === null ? v : b[2], bo, v))).toFixed(1)); fWick.setAttribute("y2", clampY(Y(Math.min(num(b[3]) === null ? v : b[3], bo, v))).toFixed(1));
        fBody.setAttribute("y", t0.toFixed(1)); fBody.setAttribute("height", Math.max(1, t1 - t0).toFixed(1));
        fWick.setAttribute("stroke", c); fBody.setAttribute("stroke", c);
      }
      [fWick, fBody].forEach(function (k) { k.setAttribute("visibility", b ? "inherit" : "hidden"); });
      liveLn.setAttribute("visibility", b ? "hidden" : "inherit"); liveLn.setAttribute("x2", x.toFixed(1)); liveLn.setAttribute("y2", y.toFixed(1));
      liveH.setAttribute("x1", (x + 7).toFixed(1)); liveH.setAttribute("y1", y.toFixed(1)); liveH.setAttribute("y2", y.toFixed(1));
      [liveRing, liveDot].forEach(function (k) { k.setAttribute("cx", x.toFixed(1)); k.setAttribute("cy", y.toFixed(1)); });
      var want = Math.max(T, Math.min(H - 6, y)), ly = want;
      for (var k = 0; k <= 90; k++) { if (free(want - 2 * k)) { ly = want - 2 * k; break; } if (free(want + 2 * k)) { ly = want + 2 * k; break; } }
      liveA.setAttribute("y", (ly - 2).toFixed(1)); liveB.setAttribute("y", (ly + 9).toFixed(1));
      liveB.textContent = (o.fmt ? o.fmt(v) : String(v)) + (y !== y0 ? (v > hi ? " ↑" : " ↓") : "");
      return y === y0;
    };
    var vl = el("line", { y1: T, y2: H - B, stroke: "rgba(255,255,255,.35)", "stroke-dasharray": "2 3", visibility: "hidden" }, svg);
    el("rect", { x: L, y: 0, width: xEnd - L, height: H, fill: "transparent" }, svg);
    var tip = document.createElement("div"); tip.className = "pc-tip"; tip.hidden = true;
    var show = function (ev) {
      var rc = svg.getBoundingClientRect(), px = (ev.clientX - rc.left) * W / rc.width, i = Math.max(s, Math.min(e, Math.round((px - L) / cw - 0.5) + s)), r = rows[i];
      vl.setAttribute("x1", X(i)); vl.setAttribute("x2", X(i)); vl.setAttribute("visibility", "visible");
      var d = new Date(r[0] + 8 * 3600000), when = (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2);
      var f = o.fmt || String;
      tip.textContent = when + " SGT · " + tr("开 ", "O ") + f(r[1]) + tr(" 高 ", " H ") + f(r[2]) + tr(" 低 ", " L ") + f(r[3]) + tr(" 收 ", " C ") + f(r[4]);
      tip.hidden = false;
      var x = X(i) * rc.width / W, w = tip.offsetWidth; tip.style.left = Math.max(0, Math.min(rc.width - w, x - w / 2)) + "px";
    };
    svg.addEventListener("pointermove", show); svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", function () { vl.setAttribute("visibility", "hidden"); tip.hidden = true; });
    wrap.appendChild(svg); wrap.appendChild(tip);
    var leg = document.createElement("div"); leg.className = "pc-leg";
    leg.innerHTML = '<span><i style="background:var(--gold,#D4A72C)"></i>' + tr("形态的线", "Pattern lines") + '</span><span><i class="d" style="border-color:var(--gold,#D4A72C)"></i>' + tr("突破位", "Break level") + '</span><span><i class="d" style="border-color:' + COLS.stop + '"></i>' + tr("失效位", "Fails") + '</span><span><i class="d" style="border-color:' + COLS.tgt + '"></i>' + tr("目标", "Target") + '</span><span>' + tr("右边灰色区域：最后一根之后", "Grey area on the right: after the last bar") + '</span>';
    hollow = document.createElement("span"); hollow.hidden = true;
    hollow.innerHTML = '<i style="width:7px;height:11px;border:1.3px solid currentColor;background:none;border-radius:1px;vertical-align:-1px"></i>' + tr("空心 K 线：还没收盘的这一根", "Hollow candle: the one still forming");
    leg.appendChild(hollow);
    wrap.appendChild(leg);
    return wrap;
  }
  draw.n = 0;
  window.PatChart = { draw: draw };
})();
