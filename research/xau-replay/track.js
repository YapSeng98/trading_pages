// How well does the PAXG token (the page's first data source, now the fallback) follow real spot gold?
// Needs download.py (spot) and download_paxg.py for the same years.  usage: node track.js <y0> <y1>
const L = require("./lib");
const [y0, y1] = process.argv.slice(2).map(Number);
const SPOT = L.source("duk", y0, y1);
const f = (v, d) => (Number.isFinite(v) ? v.toFixed(d === undefined ? 2 : d) : "  -");
const abs = a => a.map(Math.abs);
console.log("spot bars", SPOT.n, new Date(SPOT.t[0] * 1000).toISOString().slice(0, 16), "->", new Date(SPOT.t[SPOT.n - 1] * 1000).toISOString().slice(0, 16));

function study(name, P, step) {
  // align on the proxy's bar grid: spot bar at the same close time
  const T = [], B = [], Px = [], Sx = [];
  for (let i = 0; i < P.n; i++) {
    const tClose = P.t[i] + step - 60, k = L.lowerBound(SPOT.t, tClose);
    if (k >= SPOT.n || SPOT.t[k] !== tClose) continue;
    T.push(tClose); B.push(P.c[i] - SPOT.c[k]); Px.push(P.c[i]); Sx.push(SPOT.c[k]);
  }
  console.log("\n==== " + name + " vs spot (bid), matched bars " + T.length + " ====");
  // 1. level of the gap by year
  const byY = {}; T.forEach((t, i) => { const y = new Date(t * 1000).getUTCFullYear(); (byY[y] = byY[y] || []).push(B[i]); });
  console.log("gap = proxy - spot ($):");
  Object.keys(byY).forEach(y => { const a = byY[y]; console.log("  " + y + "  mean " + f(L.mean(a)).padStart(7) + "  sd " + f(L.sd(a)).padStart(6) + "  p1 " + f(L.quant(a, 0.01)).padStart(7) + "  p99 " + f(L.quant(a, 0.99)).padStart(7) + "  as % of price " + f(L.mean(a) / L.mean(Sx) * 100, 3) + "%"); });
  // 2. drift of the gap: how wrong is a level drawn h ago after re-calibrating now
  const idx = new Map(); T.forEach((t, i) => idx.set(t, i));
  console.log("gap drift over a horizon (this is the error on an older level after calibrating now):");
  for (const [lab, h] of [["15 min", 900], ["1 hour", 3600], ["4 hours", 14400], ["24 hours", 86400], ["3 days", 259200], ["7 days", 604800]]) {
    const d = []; for (let i = 0; i < T.length; i += 3) { const j = idx.get(T[i] + h); if (j !== undefined) d.push(B[j] - B[i]); }
    if (d.length < 100) continue; const a = abs(d);
    console.log("  " + lab.padEnd(9) + " median |drift| $" + f(L.quant(a, 0.5)).padStart(6) + "   90% within $" + f(L.quant(a, 0.9)).padStart(6) + "   99% within $" + f(L.quant(a, 0.99)).padStart(6) + "   n=" + d.length);
  }
  return { T, B, idx };
}

// candle highs and lows: phantom wicks. Compare 15-minute candles built from each feed.
function wicks(name, P, y) {
  const a = Date.UTC(y, 0, 1) / 1000;
  const cut = B => { const i0 = L.lowerBound(B.t, a); return { t: B.t.subarray(i0), o: B.o.subarray(i0), h: B.h.subarray(i0), l: B.l.subarray(i0), c: B.c.subarray(i0), n: B.n - i0 }; };
  for (const tf of ["15M", "1H", "4H"]) {
    const ks = L.aggregate(cut(SPOT), tf, "utc"), kp = L.aggregate(cut(P), tf, "utc"), m = new Map(); kp.forEach(k => m.set(k[0], k));
    const eh = [], el = [], rng = [];
    for (const s of ks) {
      const p = m.get(s[0]); if (!p) continue;
      if (L.spotClosed(s[0] / 1000) || L.spotClosed(s[6] / 1000)) continue;
      const gap = p[4] - s[4];                               // calibrate on the close, as the page does
      eh.push(p[2] - gap - s[2]); el.push(p[3] - gap - s[3]); rng.push(s[2] - s[3]);
    }
    const ah = abs(eh).concat(abs(el));
    console.log("  " + name + " " + tf.padEnd(3) + " candle high/low error vs spot: median $" + f(L.quant(ah, 0.5)) + "  90% within $" + f(L.quant(ah, 0.9)) + "  99% within $" + f(L.quant(ah, 0.99)) + "   (median spot candle range $" + f(L.quant(rng, 0.5)) + ", n=" + eh.length + ")" +
      "   wick too long by > $2: " + f(ah.filter(v => v > 2).length / ah.length * 100, 1) + "%");
  }
}

const PAXG = L.source("paxg", y0, y1);
const sp = study("PAXG (the page's feed)", PAXG, 60);
// thin trading: share of spot-open minutes in which PAXG did not trade at all
{ const by = {}; for (let i = 0; i < PAXG.n; i++) { if (L.spotClosed(PAXG.t[i])) continue; const y = new Date(PAXG.t[i] * 1000).getUTCFullYear(); const o = by[y] = by[y] || [0, 0, 0]; o[0]++; if (PAXG.x[i] === 0) o[1]++; o[2] += PAXG.x[i]; }
  console.log("PAXG minutes with no trade at all while gold is open:", Object.keys(by).map(y => y + ": " + f(by[y][1] / by[y][0] * 100, 0) + "% (avg " + f(by[y][2] / by[y][0], 1) + " trades/min)").join("  ")); }
console.log("\n==== candle shape (from " + Math.max(y0, y1 - 1) + ") ====");
wicks("PAXG", PAXG, Math.max(y0, y1 - 1));

// previous-day high/low as the page computes it (UTC day on PAXG, shifted by the gap now) vs the broker's previous day (17:00 New York close) on spot
console.log("\n==== yesterday's high / low: page method vs a broker chart ====");
function days(Bars, align) { return L.aggregate(Bars, "D", align, L.spotClosed); }
const dSpotNy = days(SPOT, "ny"), dSpotUtc = days(SPOT, "utc"), dPaxUtc = L.aggregate(PAXG, "D", "utc"), dPaxNy = days(PAXG, "ny");
function prevAt(list, tMs) { let a = 0, b = list.length; while (a < b) { const m = (a + b) >> 1; if (list[m][6] < tMs) a = m + 1; else b = m; } return a ? list[a - 1] : null; }   // last candle fully closed before t
function compare(label, list, usePaxFilter, hours) {
  const errs = [];
  for (const d of dSpotNy) {
    for (const hr of hours) {
      const view = d[0] + hr * 3600000; if (view >= d[6]) continue;       // a moment inside this broker day
      const truth = prevAt(dSpotNy, view); let mine = prevAt(list, view); if (!truth || !mine) continue;
      if (usePaxFilter) { let k = list.indexOf(mine); while (k >= 0 && [0, 6].includes(new Date(list[k][0]).getUTCDay())) k--; if (k < 0) continue; mine = list[k]; }   // the engine drops Sat/Sun UTC candles
      let gap = 0;
      if (list === dPaxUtc || list === dPaxNy) { const i = sp.idx.get(Math.floor(view / 60000) * 60 - 60); if (i === undefined) continue; gap = sp.B[i]; }
      errs.push(mine[2] - gap - truth[2], mine[3] - gap - truth[3]);
    }
  }
  const a = abs(errs);
  console.log("  " + label.padEnd(52) + " exact (<$0.5) " + f(a.filter(v => v < 0.5).length / a.length * 100, 0).padStart(3) + "%   within $2: " + f(a.filter(v => v <= 2).length / a.length * 100, 0).padStart(3) + "%   off by > $5: " + f(a.filter(v => v > 5).length / a.length * 100, 0).padStart(3) + "%   90% within $" + f(L.quant(a, 0.9)) + "  n=" + a.length);
}
const HRS = [3, 9, 15];   // three moments in the broker day (roughly Asia, London, New York)
compare("spot, UTC days (boundary effect only)", dSpotUtc, true, HRS);
compare("PAXG, UTC days + calibration (the page today)", dPaxUtc, true, HRS);
compare("PAXG, broker days + calibration (proposed)", dPaxNy, false, HRS);
