// XAU multi-timeframe engine v1 (engine id "xau-mtf-1"). Same analysis code as engine.js of the
// "XAU 4-Hour Report" artifact, so report.html and the stored reports agree; only the data fetch differs:
// here it calls https://data-api.binance.vision cross-origin (public, no key, CORS open) and in parallel.
// PAXGUSDT is a gold-backed token that tracks XAUUSD within a few dollars.
// Usage:  <script src="assets/xau-engine.js">  then  await runXauEngine()
var XAU_API = "https://data-api.binance.vision";
var XAU_TFS = [
  { tf: "W",   iv: "1w",  limit: 300, swing: 3, internal: 2, pat: 2, win: 60,  bars: 0  },
  { tf: "D",   iv: "1d",  limit: 600, swing: 5, internal: 2, pat: 3, win: 90,  bars: 60 },
  { tf: "4H",  iv: "4h",  limit: 800, swing: 5, internal: 2, pat: 3, win: 100, bars: 60 },
  { tf: "1H",  iv: "1h",  limit: 800, swing: 5, internal: 2, pat: 3, win: 100, bars: 60 },
  { tf: "15M", iv: "15m", limit: 800, swing: 5, internal: 2, pat: 3, win: 100, bars: 0  }
];
var XAU_WEIGHTS = { W: 3, D: 3, "4H": 2, "1H": 1, "15M": 1 };

function xr(v, d) { if (v === null || v === undefined || !isFinite(v)) return null; var m = Math.pow(10, d === undefined ? 2 : d); return Math.round(v * m) / m; }
function xIso(ms) { return new Date(ms).toISOString().slice(0, 16) + "Z"; }

// Gold is closed from about Fri 21:00 to Sun 22:00 UTC; PAXG keeps trading, so drop those candles intraday.
function xWeekend(ms) {
  var d = new Date(ms), wd = d.getUTCDay(), h = d.getUTCHours();
  return wd === 6 || (wd === 5 && h >= 21) || (wd === 0 && h < 22);
}

function xEma(a, n) { var k = 2 / (n + 1), e = null, o = []; for (var i = 0; i < a.length; i++) { e = e === null ? a[i] : a[i] * k + e * (1 - k); o.push(e); } return o; }
function xAtr(h, l, c, n) {
  var o = [], a = null;
  for (var i = 0; i < c.length; i++) {
    var tr = i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i];
    a = i < n ? (a === null ? tr : (a * i + tr) / (i + 1)) : (a * (n - 1) + tr) / n;
    o.push(a);
  }
  return o;
}
function xRsi(c, n) {
  var g = 0, s = 0, o = [null];
  for (var i = 1; i < c.length; i++) {
    var d = c[i] - c[i - 1], up = d > 0 ? d : 0, dn = d < 0 ? -d : 0;
    if (i <= n) { g += up / n; s += dn / n; o.push(i < n ? null : (s === 0 ? 100 : 100 - 100 / (1 + g / s))); }
    else { g = (g * (n - 1) + up) / n; s = (s * (n - 1) + dn) / n; o.push(s === 0 ? 100 : 100 - 100 / (1 + g / s)); }
  }
  return o;
}
function xIsPH(h, j, len) { for (var k = 1; k <= len; k++) { if (h[j - k] > h[j] || h[j + k] >= h[j]) return false; } return true; }
function xIsPL(l, j, len) { for (var k = 1; k <= len; k++) { if (l[j - k] < l[j] || l[j + k] <= l[j]) return false; } return true; }

// Bar-by-bar CHoCH / BOS on closes, same rules as the TradingView / MT5 indicators.
function xStructure(B, len) {
  var h = B.h, l = B.l, c = B.c, n = c.length;
  var s = { trend: 0, hi: null, hiI: -1, hiB: true, lo: null, loI: -1, loB: true, lastHi: null, lastLo: null, rTop: null, rBot: null, rI: -1 };
  var events = [], swings = [], sweeps = [];
  for (var i = 0; i < n; i++) {
    var j = i - len;
    if (j - len >= 0) {
      if (xIsPH(h, j, len)) { swings.push({ i: j, kind: s.lastHi === null ? "H" : (h[j] > s.lastHi ? "HH" : "LH"), p: h[j] }); s.lastHi = h[j]; s.hi = h[j]; s.hiI = j; s.hiB = false; }
      if (xIsPL(l, j, len)) { swings.push({ i: j, kind: s.lastLo === null ? "L" : (l[j] < s.lastLo ? "LL" : "HL"), p: l[j] }); s.lastLo = l[j]; s.lo = l[j]; s.loI = j; s.loB = false; }
    }
    if (!s.hiB && c[i] > s.hi) {
      var o = l[i]; for (var k = Math.max(s.hiI, i - 500); k <= i; k++) o = Math.min(o, l[k]);
      events.push({ i: i, type: s.trend === -1 ? "CHoCH" : "BOS", dir: "bull", level: s.hi, from: s.hiI });
      s.trend = 1; s.hiB = true; s.rTop = h[i]; s.rBot = o; s.rI = s.hiI;
    } else if (!s.hiB && h[i] > s.hi && c[i] < s.hi) { sweeps.push({ i: i, side: "high", level: s.hi }); }
    if (!s.loB && c[i] < s.lo) {
      var o2 = h[i]; for (var k2 = Math.max(s.loI, i - 500); k2 <= i; k2++) o2 = Math.max(o2, h[k2]);
      events.push({ i: i, type: s.trend === 1 ? "CHoCH" : "BOS", dir: "bear", level: s.lo, from: s.loI });
      s.trend = -1; s.loB = true; s.rTop = o2; s.rBot = l[i]; s.rI = s.loI;
    } else if (!s.loB && l[i] < s.lo && c[i] > s.lo) { sweeps.push({ i: i, side: "low", level: s.lo }); }
    if (s.rTop !== null) { s.rTop = Math.max(s.rTop, h[i]); s.rBot = Math.min(s.rBot, l[i]); }
  }
  return { trend: s.trend, events: events, swings: swings, sweeps: sweeps, hi: s.hiB ? null : s.hi, lo: s.loB ? null : s.lo,
           hiAny: s.hi, loAny: s.lo, rTop: s.rTop, rBot: s.rBot, rI: s.rI };
}

function xFvgs(B, atr, minAtr, maxAge) {
  var h = B.h, l = B.l, c = B.c, n = c.length, out = [];
  for (var i = 2; i < n; i++) {
    var a = atr[i]; if (!a) continue;
    if (l[i] > h[i - 2] && c[i - 1] > h[i - 2] && l[i] - h[i - 2] >= minAtr * a) out.push({ dir: "bull", top: l[i], bot: h[i - 2], i: i, tapped: false, dead: false });
    if (h[i] < l[i - 2] && c[i - 1] < l[i - 2] && l[i - 2] - h[i] >= minAtr * a) out.push({ dir: "bear", top: l[i - 2], bot: h[i], i: i, tapped: false, dead: false });
  }
  out.forEach(function (g) {
    for (var k = g.i + 1; k < n; k++) {
      if (g.dir === "bull") { if (c[k] < g.bot) { g.dead = true; break; } if (l[k] <= g.top) g.tapped = true; }
      else { if (c[k] > g.top) { g.dead = true; break; } if (h[k] >= g.bot) g.tapped = true; }
    }
  });
  return out.filter(function (g) { return !g.dead && n - 1 - g.i <= maxAge; });
}

// Alternating swing points (H, L, H, L ...) for pattern work
function xAlt(B, len, from) {
  var P = [], h = B.h, l = B.l;
  for (var j = Math.max(len, from); j < h.length - len; j++) {
    if (xIsPH(h, j, len)) P.push({ i: j, t: "H", p: h[j] });
    if (xIsPL(l, j, len)) P.push({ i: j, t: "L", p: l[j] });
  }
  var o = [];
  P.forEach(function (p) {
    var last = o[o.length - 1];
    if (last && last.t === p.t) { if ((p.t === "H" && p.p > last.p) || (p.t === "L" && p.p < last.p)) o[o.length - 1] = p; }
    else o.push(p);
  });
  return o;
}
function xFit(pts) {
  var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
  pts.forEach(function (p) { sx += p.i; sy += p.p; sxx += p.i * p.i; sxy += p.i * p.p; });
  var d = n * sxx - sx * sx; var m = d === 0 ? 0 : (n * sxy - sx * sy) / d; var b = (sy - m * sx) / n;
  var res = 0; pts.forEach(function (p) { res = Math.max(res, Math.abs(p.p - (m * p.i + b))); });
  return { m: m, b: b, res: res, at: function (i) { return m * i + b; } };
}

function xPatterns(B, atr, cfg) {
  var n = B.c.length, last = n - 1, close = B.c[last], a = atr[last], out = [];
  if (!a) return out;
  var tol = Math.max(0.35 * a, close * 0.0015);
  var P = xAlt(B, cfg.pat, Math.max(0, n - cfg.win));
  var Hs = P.filter(function (p) { return p.t === "H"; }), Ls = P.filter(function (p) { return p.t === "L"; });
  function minBetween(i0, i1) { var m = Infinity; for (var k = i0; k <= i1; k++) m = Math.min(m, B.l[k]); return m; }
  function maxBetween(i0, i1) { var m = -Infinity; for (var k = i0; k <= i1; k++) m = Math.max(m, B.h[k]); return m; }
  var recent = Math.max(10, Math.round(cfg.win * 0.45));

  // Double top / bottom
  if (Hs.length >= 2) {
    var h1 = Hs[Hs.length - 2], h2 = Hs[Hs.length - 1];
    if (Math.abs(h1.p - h2.p) <= tol && last - h2.i <= recent) {
      var neck = minBetween(h1.i, h2.i), top = Math.max(h1.p, h2.p);
      if ((h1.p + h2.p) / 2 - neck >= 1.5 * a && close <= top + tol) {
        var conf = close < neck;
        out.push({ name: "Double top", bias: "bearish", status: conf ? "confirmed: closed below neckline" : "forming: watch the neckline",
          level: xr(neck), invalid: xr(top), target: xr(neck - (top - neck)), from: h1.i, to: h2.i });
      }
    }
  }
  if (Ls.length >= 2) {
    var l1 = Ls[Ls.length - 2], l2 = Ls[Ls.length - 1];
    if (Math.abs(l1.p - l2.p) <= tol && last - l2.i <= recent) {
      var neck2 = maxBetween(l1.i, l2.i), bot = Math.min(l1.p, l2.p);
      if (neck2 - (l1.p + l2.p) / 2 >= 1.5 * a && close >= bot - tol) {
        var conf2 = close > neck2;
        out.push({ name: "Double bottom", bias: "bullish", status: conf2 ? "confirmed: closed above neckline" : "forming: watch the neckline",
          level: xr(neck2), invalid: xr(bot), target: xr(neck2 + (neck2 - bot)), from: l1.i, to: l2.i });
      }
    }
  }
  // Head and shoulders / inverse
  if (Hs.length >= 3) {
    var A = Hs[Hs.length - 3], Hd = Hs[Hs.length - 2], C = Hs[Hs.length - 1];
    var LA = Ls.filter(function (p) { return p.i > A.i && p.i < Hd.i; }), LC = Ls.filter(function (p) { return p.i > Hd.i && p.i < C.i; });
    if (LA.length && LC.length && Hd.p - Math.max(A.p, C.p) >= 0.5 * a && last - C.i <= recent) {
      var n1 = LA[LA.length - 1], n2 = LC[LC.length - 1];
      var nf = xFit([n1, n2]), neckNow = nf.at(last), neckHead = nf.at(Hd.i);
      if (Math.abs(A.p - C.p) <= Math.max(0.6 * a, 0.3 * (Hd.p - neckHead)) && close < Hd.p) {
        var cf = close < neckNow;
        out.push({ name: "Head and shoulders", bias: "bearish", status: cf ? "confirmed: closed below neckline" : "forming: right shoulder in place",
          level: xr(neckNow), invalid: xr(Hd.p), target: xr(neckNow - (Hd.p - neckHead)), from: A.i, to: C.i });
      }
    }
  }
  if (Ls.length >= 3) {
    var A2 = Ls[Ls.length - 3], Hd2 = Ls[Ls.length - 2], C2 = Ls[Ls.length - 1];
    var HA = Hs.filter(function (p) { return p.i > A2.i && p.i < Hd2.i; }), HC = Hs.filter(function (p) { return p.i > Hd2.i && p.i < C2.i; });
    if (HA.length && HC.length && Math.min(A2.p, C2.p) - Hd2.p >= 0.5 * a && last - C2.i <= recent) {
      var m1 = HA[HA.length - 1], m2 = HC[HC.length - 1];
      var nf2 = xFit([m1, m2]), neckNow2 = nf2.at(last), neckHead2 = nf2.at(Hd2.i);
      if (Math.abs(A2.p - C2.p) <= Math.max(0.6 * a, 0.3 * (neckHead2 - Hd2.p)) && close > Hd2.p) {
        var cf2 = close > neckNow2;
        out.push({ name: "Inverse head and shoulders", bias: "bullish", status: cf2 ? "confirmed: closed above neckline" : "forming: right shoulder in place",
          level: xr(neckNow2), invalid: xr(Hd2.p), target: xr(neckNow2 + (neckHead2 - Hd2.p)), from: A2.i, to: C2.i });
      }
    }
  }
  // Triangles, wedges, channels, ranges from the last 2-4 swing highs and lows
  var hs = Hs.slice(-4), ls = Ls.slice(-4);
  if (hs.length >= 2 && ls.length >= 2) {
    var fh = xFit(hs), fl = xFit(ls), start = Math.min(hs[0].i, ls[0].i);
    if (fh.res <= 0.6 * a && fl.res <= 0.6 * a && last - Math.max(hs[hs.length - 1].i, ls[ls.length - 1].i) <= recent) {
      var sH = fh.m / a, sL = fl.m / a, flat = 0.02;
      var wStart = fh.at(start) - fl.at(start), wNow = fh.at(last) - fl.at(last);
      if (wNow > 0 && wStart > 0) {
        var conv = wNow < wStart * 0.75, name = null, bias = "neutral";
        if (Math.abs(sH) < flat && sL > flat) { name = "Ascending triangle"; bias = "bullish"; }
        else if (sH < -flat && Math.abs(sL) < flat) { name = "Descending triangle"; bias = "bearish"; }
        else if (sH < -flat && sL > flat) { name = "Symmetrical triangle"; bias = "neutral"; }
        else if (sH > flat && sL > flat && conv) { name = "Rising wedge"; bias = "bearish"; }
        else if (sH < -flat && sL < -flat && conv) { name = "Falling wedge"; bias = "bullish"; }
        else if (sH > flat && sL > flat) { name = "Rising channel"; bias = "bullish"; }
        else if (sH < -flat && sL < -flat) { name = "Falling channel"; bias = "bearish"; }
        else if (Math.abs(sH) < flat && Math.abs(sL) < flat) { name = "Range"; bias = "neutral"; }
        if (name) {
          var up = fh.at(last), dn = fl.at(last), st = "inside: watch for a breakout";
          if (close > up + 0.25 * a) st = "broke out upward"; else if (close < dn - 0.25 * a) st = "broke out downward";
          out.push({ name: name, bias: bias, status: st, upper: xr(up), lower: xr(dn), height: xr(wStart),
            touches: hs.length + ls.length, from: start, to: last });
        }
      }
    }
  }
  // Flags: sharp impulse, then a tight counter-trend drift
  var c = B.c;
  for (var end = last - 5; end >= Math.max(10, last - 30); end--) {
    var best = 0, bj = -1;
    for (var m = 3; m <= 8; m++) { if (end - m < 0) break; var mv = c[end] - c[end - m]; if (Math.abs(mv) > Math.abs(best)) { best = mv; bj = end - m; } }
    if (bj >= 0 && Math.abs(best) >= 4 * atr[end]) {
      var cons = { hi: -Infinity, lo: Infinity };
      for (var k3 = end + 1; k3 <= last; k3++) { cons.hi = Math.max(cons.hi, B.h[k3]); cons.lo = Math.min(cons.lo, B.l[k3]); }
      var span = last - end, retr = best > 0 ? (c[end] - cons.lo) / best : (cons.hi - c[end]) / -best;
      if (span >= 4 && span <= 25 && retr < 0.5 && (cons.hi - cons.lo) < 0.6 * Math.abs(best)) {
        var bull = best > 0;
        out.push({ name: bull ? "Bull flag" : "Bear flag", bias: bull ? "bullish" : "bearish",
          status: (bull ? close > cons.hi : close < cons.lo) ? "broke out" : "consolidating after the impulse",
          level: xr(bull ? cons.hi : cons.lo), invalid: xr(bull ? cons.lo : cons.hi),
          target: xr(bull ? cons.hi + best : cons.lo + best), from: bj, to: last });
      }
      break;
    }
  }
  // A head & shoulders neckline or a triangle's flat side also looks like equal highs/lows: keep the bigger pattern.
  var names = out.map(function (p) { return p.name; });
  var dropTop = names.indexOf("Inverse head and shoulders") >= 0 || names.indexOf("Ascending triangle") >= 0 || names.indexOf("Range") >= 0;
  var dropBot = names.indexOf("Head and shoulders") >= 0 || names.indexOf("Descending triangle") >= 0 || names.indexOf("Range") >= 0;
  var hasShape = names.some(function (nm) { return /wedge|triangle|channel/i.test(nm); });
  return out.filter(function (p) {
    if (p.name === "Double top" && dropTop) return false;
    if (p.name === "Double bottom" && dropBot) return false;
    if (/flag/i.test(p.name) && hasShape) return false;
    return true;
  });
}

function xAnalyzeTf(cfg, raw, nowMs) {
  var rows = raw.filter(function (k) { return k[6] < nowMs; });
  if (cfg.iv !== "1w") rows = rows.filter(function (k) { return cfg.iv === "1d" ? [0, 6].indexOf(new Date(k[0]).getUTCDay()) < 0 : !xWeekend(k[0]); });
  var B = { t: [], o: [], h: [], l: [], c: [] };
  rows.forEach(function (k) { B.t.push(k[0]); B.o.push(+k[1]); B.h.push(+k[2]); B.l.push(+k[3]); B.c.push(+k[4]); });
  var n = B.c.length; if (n < 60) return { tf: cfg.tf, error: "not enough data (" + n + " bars)" };
  var last = n - 1, close = B.c[last], atr = xAtr(B.h, B.l, B.c, 14), a = atr[last], rsi = xRsi(B.c, 14);
  var e20 = xEma(B.c, 20)[last], e50 = xEma(B.c, 50)[last], e200 = n >= 200 ? xEma(B.c, 200)[last] : null;
  var stack = (e200 !== null && close > e20 && e20 > e50 && e50 > e200) ? "bullish" : (e200 !== null && close < e20 && e20 < e50 && e50 < e200) ? "bearish" : "mixed";
  var S = xStructure(B, cfg.swing), I = xStructure(B, cfg.internal);
  function ev(e) { return e ? { type: e.type, dir: e.dir, level: xr(e.level), time: xIso(B.t[e.i]), barsAgo: last - e.i } : null; }
  var evs = S.events, ievs = I.events;
  var rng = null;
  if (S.rTop !== null && S.rTop > S.rBot) {
    var pct = (close - S.rBot) / (S.rTop - S.rBot) * 100;
    rng = { top: xr(S.rTop), bottom: xr(S.rBot), eq: xr((S.rTop + S.rBot) / 2), pct: Math.round(pct), zone: pct > 55 ? "premium" : pct < 45 ? "discount" : "equilibrium", since: xIso(B.t[S.rI]) };
  }
  var G = xFvgs(B, atr, 0.3, 300);
  var bullG = G.filter(function (g) { return g.dir === "bull" && g.bot < close; }).sort(function (x, y) { return y.top - x.top; }).slice(0, 2);
  var bearG = G.filter(function (g) { return g.dir === "bear" && g.top > close; }).sort(function (x, y) { return x.bot - y.bot; }).slice(0, 2);
  function gOut(g) { return { dir: g.dir, top: xr(g.top), bottom: xr(g.bot), time: xIso(B.t[g.i]), tapped: g.tapped, inside: close <= g.top && close >= g.bot }; }
  // equal highs / lows = resting liquidity (untaken)
  var sw = S.swings.slice(-14), eqh = [], eql = [];
  var shs = sw.filter(function (p) { return /H$/.test(p.kind); }), sls = sw.filter(function (p) { return /L$/.test(p.kind); });
  for (var x = 0; x < shs.length; x++) for (var y = x + 1; y < shs.length; y++) {
    if (Math.abs(shs[x].p - shs[y].p) <= 0.15 * a) { var lv = Math.max(shs[x].p, shs[y].p), taken = false; for (var q = shs[y].i + 1; q < n; q++) if (B.h[q] > lv) { taken = true; break; } if (!taken && lv > close) eqh.push(xr(lv)); }
  }
  for (var x2 = 0; x2 < sls.length; x2++) for (var y2 = x2 + 1; y2 < sls.length; y2++) {
    if (Math.abs(sls[x2].p - sls[y2].p) <= 0.15 * a) { var lv2 = Math.min(sls[x2].p, sls[y2].p), taken2 = false; for (var q2 = sls[y2].i + 1; q2 < n; q2++) if (B.l[q2] < lv2) { taken2 = true; break; } if (!taken2 && lv2 < close) eql.push(xr(lv2)); }
  }
  var sweeps = S.sweeps.filter(function (s) { return last - s.i <= 10; }).map(function (s) { return { side: s.side, level: xr(s.level), barsAgo: last - s.i }; });
  var pats = xPatterns(B, atr, cfg).map(function (p) { p.from = xIso(B.t[p.from]); p.to = xIso(B.t[p.to]); return p; });
  var res = {
    tf: cfg.tf, close: xr(close), barTime: xIso(B.t[last]), atr: xr(a), rsi: xr(rsi[last], 1),
    ema: { e20: xr(e20), e50: xr(e50), e200: xr(e200), stack: stack },
    trend: S.trend === 1 ? "bullish" : S.trend === -1 ? "bearish" : "unclear",
    internal: I.trend === 1 ? "bullish" : I.trend === -1 ? "bearish" : "unclear",
    lastEvent: ev(evs[evs.length - 1]), prevEvent: ev(evs[evs.length - 2]), lastInternal: ev(ievs[ievs.length - 1]),
    swings: S.swings.slice(-6).map(function (p) { return { kind: p.kind, price: xr(p.p), time: xIso(B.t[p.i]) }; }),
    swingHigh: xr(S.hi), swingLow: xr(S.lo), intHigh: xr(I.hi), intLow: xr(I.lo), range: rng,
    fvgs: bullG.map(gOut).concat(bearG.map(gOut)),
    liquidity: { equalHighs: eqh.slice(-3), equalLows: eql.slice(-3), sweeps: sweeps },
    patterns: pats
  };
  if (cfg.bars) res.bars = B.t.slice(-cfg.bars).map(function (t, k) { var i = n - cfg.bars + k; return [Math.round(t / 1000), xr(B.o[i]), xr(B.h[i]), xr(B.l[i]), xr(B.c[i])]; });
  return res;
}

function xOverall(T, price, nowMs) {
  var score = 0, parts = [];
  XAU_TFS.forEach(function (c) { var t = T[c.tf]; if (!t || t.error) return; var v = t.trend === "bullish" ? 1 : t.trend === "bearish" ? -1 : 0; score += v * XAU_WEIGHTS[c.tf]; parts.push(c.tf + ":" + (v > 0 ? "+" : v < 0 ? "-" : "0")); });
  var bias = score >= 4 ? "bullish" : score <= -4 ? "bearish" : "mixed";
  var D = T.D || {}, H4 = T["4H"] || {}, H1 = T["1H"] || {}, M15 = T["15M"] || {};
  var dir = (D.trend === "bullish" && H4.trend === "bullish") ? 1 : (D.trend === "bearish" && H4.trend === "bearish") ? -1 : 0;
  var setup = { side: "none", reason: "Daily and 4H structure disagree: no aligned trade." };
  if (dir !== 0 && H1.range && H1.atr) {
    var side = dir > 0 ? "long" : "short";
    var zoneG = (H1.fvgs || []).filter(function (g) { return g.dir === (dir > 0 ? "bull" : "bear"); })[0] || (H4.fvgs || []).filter(function (g) { return g.dir === (dir > 0 ? "bull" : "bear"); })[0];
    var zTop, zBot, zSrc;
    if (zoneG) { zTop = zoneG.top; zBot = zoneG.bottom; zSrc = "FVG (" + (H1.fvgs.indexOf(zoneG) >= 0 ? "1H" : "4H") + ")"; }
    else if (dir > 0) { zTop = H1.range.eq; zBot = H1.range.bottom; zSrc = "1H discount"; }
    else { zTop = H1.range.top; zBot = H1.range.eq; zSrc = "1H premium"; }
    var entry = xr((zTop + zBot) / 2);
    var stop = dir > 0 ? xr(Math.min(zBot, H1.range.bottom) - 0.2 * H1.atr) : xr(Math.max(zTop, H1.range.top) + 0.2 * H1.atr);
    var tp1 = dir > 0 ? H1.range.top : H1.range.bottom;
    var tp2 = dir > 0 ? (H4.range ? H4.range.top : null) : (H4.range ? H4.range.bottom : null);
    var risk = Math.abs(entry - stop), rr1 = risk > 0 && tp1 !== null ? xr(Math.abs(tp1 - entry) / risk, 1) : null;
    var inZone = price <= zTop + 0.1 * H1.atr && price >= zBot - 0.1 * H1.atr;
    var trig = M15.lastInternal && M15.lastInternal.dir === (dir > 0 ? "bull" : "bear") && M15.lastInternal.barsAgo <= 8;
    setup = { side: side, zoneTop: zTop, zoneBottom: zBot, zoneSource: zSrc, entry: entry, stop: stop, tp1: tp1, tp2: tp2, rr1: rr1,
      priceInZone: inZone, trigger15m: !!trig, state: inZone && trig ? "READY: in zone with a 15M trigger" : inZone ? "IN ZONE: wait for a 15M i-CHoCH" : "WAIT: let price come to the zone" };
  }
  var d = new Date(nowMs), marketOpen = !xWeekend(nowMs);
  return { score: score, maxScore: 10, bias: bias, votes: parts.join(" "), alignedDirection: dir > 0 ? "long" : dir < 0 ? "short" : "none", setup: setup, marketOpen: marketOpen };
}

async function runXauEngine() {
  var nowMs = Date.now(), T = {}, price = null;
  var raws = await Promise.all(XAU_TFS.map(function (cfg) {
    return fetch(XAU_API + "/api/v3/klines?symbol=PAXGUSDT&interval=" + cfg.iv + "&limit=" + cfg.limit)
      .then(function (r) { return r.ok ? r.json() : { error: "HTTP " + r.status }; })
      .catch(function (e) { return { error: String((e && e.message) || e) }; });
  }));
  XAU_TFS.forEach(function (cfg, k) {
    var raw = raws[k];
    if (!Array.isArray(raw)) { T[cfg.tf] = { tf: cfg.tf, error: (raw && raw.error) || "bad response" }; return; }
    if (cfg.iv === "15m" && raw.length) price = +raw[raw.length - 1][4];
    T[cfg.tf] = xAnalyzeTf(cfg, raw, nowMs);
  });
  // previous day / week high-low for context
  var D = T.D || {};
  var ctx = {};
  if (D.bars && D.bars.length) { var pd = D.bars[D.bars.length - 1]; ctx.prevDayHigh = pd[2]; ctx.prevDayLow = pd[3]; }
  var wk = raws[0];
  if (Array.isArray(wk) && wk.length >= 2) { var pw = wk[wk.length - 2]; ctx.prevWeekHigh = xr(+pw[2]); ctx.prevWeekLow = xr(+pw[3]); }
  return { engine: "xau-mtf-1", symbol: "PAXGUSDT (gold-backed, tracks XAUUSD)", generatedAt: new Date(nowMs).toISOString(),
           price: xr(price), context: ctx, overall: xOverall(T, price, nowMs), tfs: T };
}
