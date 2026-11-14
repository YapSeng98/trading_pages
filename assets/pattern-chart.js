// Draws one chart pattern on its own candles: the bars around it, its points (tops, bottoms, shoulders, head, the
// swing highs and lows of a triangle), its lines (neckline, upper and lower edge, a flag's pole and box), and to the
// right of the last closed bar the levels its textbook trade uses: the break level, where it fails, and its measured
// target. Used by the gold, Bitcoin and forex pages; the pattern comes from the engine (xau-engine.js `geo`).
// Reference only: the replay found no edge in patterns (CLAUDE.md), and the caller says so next to the chart.
// PatChart.draw(rows, pattern, opts) -> element or null
//   rows: closed candles [openMs, o, h, l, c, …] of the pattern's timeframe, in the pattern's price units
//   opts: { fmt(v) -> text, plan: XauPlan.patternPlan(…) or null, title, tfLabel, w: the width it will be shown at }
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var LAB = { top: "顶", bottom: "底", ls: "左肩", head: "头", rs: "右肩" };
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
    if (plan) { addLv(plan.trigger, "trig", plan.done ? "突破位" : "突破才进"); addLv(plan.stop, "stop", "失效位"); addLv(plan.target, "tgt", "目标"); }
    else { addLv(pat.level, "trig", "关键位"); addLv(pat.upper, "trig", "上沿"); addLv(pat.lower, "trig", "下沿"); addLv(pat.invalid, "stop", "失效位"); addLv(pat.target, "tgt", "目标"); }
    var py = (hi - lo) * 0.07; lo -= py; hi += py;
    var Y = function (v) { return T + (hi - v) * (H - T - B) / (hi - lo); };
    var clampY = function (y) { return Math.max(T - 4, Math.min(H - B + 4, y)); };

    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "pc-svg", role: "img", "aria-label": o.title || "形态图" });
    var defs = el("defs", {}, svg), cp = el("clipPath", { id: "pcclip" + (++draw.n) }, defs); el("rect", { x: L, y: T - 4, width: xR - L, height: H - T - B + 8 }, cp);
    var clip = "url(#pcclip" + draw.n + ")";
    [0.25, 0.5, 0.75].forEach(function (f) { var y = T + f * (H - T - B); el("line", { x1: L, x2: xR, y1: y, y2: y, stroke: "rgba(255,255,255,.05)" }, svg); });
    el("rect", { x: xEnd, y: T - 4, width: xR - xEnd, height: H - T - B + 8, fill: "rgba(255,255,255,.028)" }, svg);
    txt(svg, xEnd + 4, H - 6, "之后", { class: "pc-ax" });

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
      if (l.k === "neck") txt(svg, X(i0) + 2, Y(p0) + (dir < 0 ? 13 : -6), "颈线", { class: "pc-lab", fill: C.gold });
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
    labs.push({ y: cy, text: "最后收盘", val: o.fmt ? o.fmt(lastR[4]) : String(lastR[4]), col: C.ink });
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
    labs.forEach(function (l) { txt(svg, xR + 5, l.y - 2, l.text, { class: "pc-lab", fill: l.col }); txt(svg, xR + 5, l.y + 9, l.val, { class: "pc-val", fill: C.ink }); });
    txt(svg, L + 2, H - 6, o.tfLabel ? o.tfLabel + " · " + n + " 根" : n + " 根", { class: "pc-ax" });

    // hover / touch: the bar under the pointer
    var wrap = document.createElement("div"); wrap.className = "pc";
    var vl = el("line", { y1: T, y2: H - B, stroke: "rgba(255,255,255,.35)", "stroke-dasharray": "2 3", visibility: "hidden" }, svg);
    el("rect", { x: L, y: 0, width: xEnd - L, height: H, fill: "transparent" }, svg);
    var tip = document.createElement("div"); tip.className = "pc-tip"; tip.hidden = true;
    var show = function (ev) {
      var rc = svg.getBoundingClientRect(), px = (ev.clientX - rc.left) * W / rc.width, i = Math.max(s, Math.min(e, Math.round((px - L) / cw - 0.5) + s)), r = rows[i];
      vl.setAttribute("x1", X(i)); vl.setAttribute("x2", X(i)); vl.setAttribute("visibility", "visible");
      var d = new Date(r[0] + 8 * 3600000), when = (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2);
      var f = o.fmt || String;
      tip.textContent = when + " SGT · 开 " + f(r[1]) + " 高 " + f(r[2]) + " 低 " + f(r[3]) + " 收 " + f(r[4]);
      tip.hidden = false;
      var x = X(i) * rc.width / W, w = tip.offsetWidth; tip.style.left = Math.max(0, Math.min(rc.width - w, x - w / 2)) + "px";
    };
    svg.addEventListener("pointermove", show); svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", function () { vl.setAttribute("visibility", "hidden"); tip.hidden = true; });
    wrap.appendChild(svg); wrap.appendChild(tip);
    var leg = document.createElement("div"); leg.className = "pc-leg";
    leg.innerHTML = '<span><i style="background:var(--gold,#D4A72C)"></i>形态的线</span><span><i class="d" style="border-color:var(--gold,#D4A72C)"></i>突破位</span><span><i class="d" style="border-color:' + COLS.stop + '"></i>失效位</span><span><i class="d" style="border-color:' + COLS.tgt + '"></i>目标</span><span>右边灰色区域：最后一根之后</span>';
    wrap.appendChild(leg);
    return wrap;
  }
  draw.n = 0;
  window.PatChart = { draw: draw };
})();
