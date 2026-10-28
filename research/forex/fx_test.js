// The gold rule on forex, as written down in PLAN.md before this was run. usage: node fx_test.js
// The page's engine (assets/xau-engine.js) reads weekly, daily, 4-hour and 1-hour candles cut in broker time at every
// hourly close; the signal is all four agreeing (onset), entered at the next hourly open, stop 3 x the 1-hour ATR,
// target 3R (or the trailing exit), one position at a time per pair, exits checked on hourly bars (stop first).
const fs = require("fs"), path = require("path");
const XR = path.join(__dirname, "../xau-replay"), L = require(XR + "/lib"), S = require(XR + "/sim");
const DATA = path.join(__dirname, "data"), C = 40, FROM = Date.UTC(2024, 3, 1) / 1000;
const ctx = L.loadEngine(L.REPO + "/assets/xau-engine.js"), TFS = ctx.XAU_TFS.filter(c => c.tf !== "15M");
const tr = v => (v === "bullish" ? 1 : v === "bearish" ? -1 : v === "unclear" || v === "mixed" ? 0 : NaN), nz = v => (typeof v === "number" && isFinite(v) ? v : NaN);
const W3 = r => (r[1] === r[2] && r[2] === r[3] && r[2] !== 0 ? r[2] : 0), C4 = r => (W3(r) && r[4] === r[2] ? r[2] : 0);
const PAIRS = [["EURUSD", 5, 1], ["GBPUSD", 5, 1], ["USDJPY", 3, 1], ["AUDUSD", 5, 1], ["NZDUSD", 5, 1], ["USDCAD", 5, 1], ["USDCHF", 5, 1], ["EURJPY", 3, 2], ["GBPJPY", 3, 2], ["AUDJPY", 3, 2], ["EURGBP", 5, 2]];

function bars(rows, k) {
  const n = rows.length, B = { t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), x: new Float64Array(n).fill(1), n };
  rows.forEach((r, i) => { B.t[i] = r[0]; B.o[i] = r[1] * k; B.h[i] = r[2] * k; B.l[i] = r[3] * k; B.c[i] = r[4] * k; });
  return B;
}
// engine rows at every hourly close (the 15-minute column repeats the hourly trend: there is no 15-minute history)
function states(B, firstHour) {
  const K = {}, ptr = {}, res = {};
  for (const c of TFS) { K[c.tf] = L.aggregate(B, c.tf, "ny", L.spotClosed); ptr[c.tf] = 0; res[c.tf] = { error: "no data" }; }
  const rows = [], H = K["1H"];
  for (let i = 0; i < H.length; i++) {
    const endMs = H[i][6] + 1, T = endMs / 1000;
    if (H[i][0] / 1000 < firstHour) continue;                    // "hours" built from the daily bars in front are not hours
    for (const c of TFS) {
      const k = K[c.tf]; let p = ptr[c.tf];
      while (p < k.length && k[p][6] < endMs) p++;
      if (p !== ptr[c.tf]) { ptr[c.tf] = p; res[c.tf] = ctx.xAnalyzeTf(c, k.slice(Math.max(0, p - (c.limit - 1)), p), endMs); }
    }
    const H1 = res["1H"], H4 = res["4H"], D = res.D, W = res.W;
    if (H1.error || H4.error || D.error) continue;
    const r = new Float64Array(C).fill(NaN);
    r[0] = T; r[1] = W.error ? NaN : tr(W.trend); r[2] = tr(D.trend); r[3] = tr(H4.trend); r[4] = tr(H1.trend); r[5] = r[4];
    r[8] = nz(H1.atr); r[9] = nz(D.atr); r[38] = H[i][4];
    rows.push(r);
  }
  const a = new Float64Array(rows.length * C); rows.forEach((r, i) => a.set(r, i * C));
  return { a, n: rows.length };
}
function trades(St, X, ex) {
  const sig = S.rowSignals(St, null, C4, { from: FROM, regime: W3, onset: true });
  const base = Object.assign({ delay: -1, barSec: 3600, cooldown: 0, maxHold: 1000 }, ex);
  return { fix: S.run(sig, X, Object.assign({}, base, { stopAtr: 3, mgmt: "fix", fixR: 3 })), trail: S.run(sig, X, Object.assign({}, base, { stopAtr: 3, mgmt: "trail", trail: 2, trailEvery: 86400, regimeExit: true })) };
}
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN), f = v => (Number.isNaN(v) ? "  —  " : (v >= 0 ? "+" : "") + v.toFixed(3));
const line = (name, t) => name.padEnd(9) + String(t.length).padStart(4) + " trades  win " + (t.length ? (t.filter(x => x.R > 0).length / t.length * 100).toFixed(0) : "—").padStart(3) + "%  avg " + f(mean(t.map(x => x.R))) + "R  total " + f(t.reduce((s, x) => s + x.R, 0)).padStart(8) + "R";
function boot(all, seed) {   // resample calendar months, so pairs that move together count once
  const by = new Map(); all.forEach(x => { const d = new Date(x.t * 1000), k = d.getUTCFullYear() * 12 + d.getUTCMonth(); (by.get(k) || by.set(k, []).get(k)).push(x.R); });
  const months = [...by.values()], rnd = L.rng(seed); let le = 0;
  for (let b = 0; b < 4000; b++) { let s = 0, n = 0; for (let i = 0; i < months.length; i++) { const m = months[(rnd() * months.length) | 0]; for (const v of m) { s += v; n++; } } if (s / n <= 0) le++; }
  return le / 4000;
}

const out = { tested: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), from: "2024-04-01", pairs: {} }, pooled = { fix: [], trail: [] };
console.log("==== the gold rule on 11 currency pairs, four timeframes on hourly bars, trades from 2024-04-01 ====");
for (const [pair, d, spread] of PAIRS) {
  const H = JSON.parse(fs.readFileSync(path.join(DATA, pair + "_1h.json"))).filter(r => r[0] % 3600 === 0), Dd = JSON.parse(fs.readFileSync(path.join(DATA, pair + "_1d.json")));
  const first = H[0][0], k = Math.pow(10, d), B = bars(Dd.filter(r => r[0] < first).concat(H), k), X = bars(H, k);
  const St = states(B, first), T = trades(St, X, { spreadBp: spread, swapRate: 0.01, swapRateShort: 0.01 });
  console.log("  " + line(pair, T.fix) + "   | trailing: " + line("", T.trail).trim());
  out.pairs[pair] = { n: T.fix.length, avgR: +mean(T.fix.map(x => x.R)).toFixed(3), win: +(T.fix.filter(x => x.R > 0).length / Math.max(1, T.fix.length) * 100).toFixed(0), trailAvgR: +mean(T.trail.map(x => x.R)).toFixed(3) };
  pooled.fix.push(...T.fix); pooled.trail.push(...T.trail);
}
const pos = Object.values(out.pairs).filter(p => p.avgR > 0).length, pF = boot(pooled.fix, 7), pT = boot(pooled.trail, 7);
console.log("  " + line("ALL 11", pooled.fix) + "  p " + pF.toFixed(3) + "   | trailing: " + line("", pooled.trail).trim() + "  p " + pT.toFixed(3));
const half = (a, b) => pooled.fix.filter(x => x.t >= a && x.t < b);
console.log("  halves (target 3R): 2024-04..2025-12 " + f(mean(half(FROM, Date.UTC(2026, 0, 1) / 1000).map(x => x.R))) + "R (" + half(FROM, Date.UTC(2026, 0, 1) / 1000).length + ")  ·  2026 " + f(mean(half(Date.UTC(2026, 0, 1) / 1000, 1e12).map(x => x.R))) + "R (" + half(Date.UTC(2026, 0, 1) / 1000, 1e12).length + ")");
const passed = mean(pooled.fix.map(x => x.R)) > 0 && pF < 0.05 && pos >= 7;
console.log("  pairs positive " + pos + " / 11  ->  verdict by the pass mark written beforehand: " + (passed ? "PASSES" : "FAILS"));
Object.assign(out, { n: pooled.fix.length, avgR: +mean(pooled.fix.map(x => x.R)).toFixed(3), p: +pF.toFixed(3), positive: pos, passed, trail: { n: pooled.trail.length, avgR: +mean(pooled.trail.map(x => x.R)).toFixed(3), p: +pT.toFixed(3) } });

// yardstick: spot gold, the same four-timeframe version on the same hourly bars and dates, and its real rule
console.log("\n==== yardstick: spot gold over the same dates ====");
const G = L.source("duk", 2022, 2026), Gh = L.aggregate(G, "1H", "ny", L.spotClosed).map(k => [k[0] / 1000, k[1], k[2], k[3], k[4]]);
const GB = bars(Gh, 1), GT = trades(states(GB, GB.t[0]), GB, { spreadBp: 1.5, swapRate: 0.075 });
console.log("  " + line("4TF/1h", GT.fix) + "   | trailing: " + line("", GT.trail).trim());
const st = S.loadStates("full"), Xm = L.source("duk", 2024, 2026), C5 = r => (W3(r) && r[4] === r[2] && r[5] === r[2] ? r[2] : 0);
const real = S.run(S.rowSignals(st, Xm, C5, { from: FROM, to: Xm.t[Xm.n - 1], regime: W3, onset: true }), Xm, { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 1.5, swapRate: 0.075, stopAtr: 3, mgmt: "fix", fixR: 3 });
console.log("  " + line("real rule", real) + "   (five timeframes, minute bars: what the gold page does)");
out.gold = { fourTfHourly: { n: GT.fix.length, avgR: +mean(GT.fix.map(x => x.R)).toFixed(3), trailAvgR: +mean(GT.trail.map(x => x.R)).toFixed(3) }, realRule: { n: real.length, avgR: +mean(real.map(x => x.R)).toFixed(3) } };
fs.writeFileSync(path.join(__dirname, "result.json"), JSON.stringify(out, null, 1) + "\n");
