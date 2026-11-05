// Can the forex signal come sooner? As written down in ../xau-replay/SPEED-PLAN.md before this was run.
// Hourly bars only (fx_test.js), so the baseline is its four-timeframe version: weekly, daily, 4-hour and 1-hour agree.
// usage: node fx_speed.js    (keeps the numbers in speed-result.json)
const fs = require("fs"), path = require("path");
const XR = path.join(__dirname, "../xau-replay"), L = require(XR + "/lib"), S = require(XR + "/sim");
const DATA = path.join(__dirname, "data"), FROM = Date.UTC(2024, 3, 1) / 1000, C = 40;
const ctx = L.loadEngine(L.REPO + "/assets/xau-engine.js"), TFS = ctx.XAU_TFS.filter(c => c.tf !== "15M");
ctx.xPatterns = () => []; ctx.xFvgs = () => [];
const tr = v => (v === "bullish" ? 1 : v === "bearish" ? -1 : v === "unclear" || v === "mixed" ? 0 : NaN), nz = v => (typeof v === "number" && isFinite(v) ? v : NaN);
const PAIRS = [["EURUSD", 5, 1], ["GBPUSD", 5, 1], ["USDJPY", 3, 1], ["AUDUSD", 5, 1], ["NZDUSD", 5, 1], ["USDCAD", 5, 1], ["USDCHF", 5, 1], ["EURJPY", 3, 2], ["GBPJPY", 3, 2], ["AUDJPY", 3, 2], ["EURGBP", 5, 2]];
const same = v => { const d = v[0]; if (!d || Number.isNaN(d)) return 0; for (const x of v) if (x !== d) return 0; return d; };
function bars(rows, k) {
  const n = rows.length, B = { t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), x: new Float64Array(n).fill(1), n };
  rows.forEach((r, i) => { B.t[i] = r[0]; B.o[i] = r[1] * k; B.h[i] = r[2] * k; B.l[i] = r[3] * k; B.c[i] = r[4] * k; });
  return B;
}
// the same rows as fx_test.js, keeping the prices that would turn the 4-hour trend
function states(B, firstHour) {
  const K = {}, ptr = {}, res = {};
  for (const c of TFS) { K[c.tf] = L.aggregate(B, c.tf, "ny", L.spotClosed); ptr[c.tf] = 0; res[c.tf] = { error: "no data" }; }
  const rows = [], H = K["1H"];
  for (let i = 0; i < H.length; i++) {
    const endMs = H[i][6] + 1, T = endMs / 1000;
    if (H[i][0] / 1000 < firstHour) continue;
    for (const c of TFS) {
      const k = K[c.tf]; let p = ptr[c.tf];
      while (p < k.length && k[p][6] < endMs) p++;
      if (p !== ptr[c.tf]) { ptr[c.tf] = p; res[c.tf] = ctx.xAnalyzeTf(c, k.slice(Math.max(0, p - (c.limit - 1)), p), endMs); }
    }
    const H1 = res["1H"], H4 = res["4H"], D = res.D, W = res.W;
    if (H1.error || H4.error || D.error) continue;
    rows.push({ T, w: W.error ? NaN : tr(W.trend), d: tr(D.trend), h4: tr(H4.trend), h1: tr(H1.trend), atr: nz(H1.atr), c: H[i][4], hi4: nz(H4.swingHigh), lo4: nz(H4.swingLow) });
  }
  return rows;
}
const big = r => same([r.w, r.d, r.h4]), base4 = r => same([r.w, r.d, r.h4, r.h1]);
function signals(rows, cond, regime) {
  const out = []; let prev = 0, open = [];
  for (const r of rows) {
    if (r.T < FROM) continue;
    const dir = cond(r), reg = regime(r);
    if (open.length && reg !== open[0].dir) { open.forEach(s => { s.regimeEnd = r.T + 60; }); open = []; }
    if (dir && dir !== prev) { const s = { t: r.T + 60, dir, p: r.c, atr: r.atr, regimeEnd: 0 }; out.push(s); open.push(s); }
    prev = dir;
  }
  return out;
}
const VERSIONS = {
  base: ["这条规则（四个周期）", rows => signals(rows, base4, big), 0],
  noW: ["不看周线（日线、4 小时、1 小时）", rows => signals(rows, r => same([r.d, r.h4, r.h1]), r => same([r.d, r.h4])), 0],
  noWD: ["不看周线和日线（4 小时、1 小时）", rows => signals(rows, r => same([r.h4, r.h1]), r => same([r.h4])), 0],
  // the 4-hour counted as turned at the first hourly close beyond its level, before its own candle closes
  pre4h: ["4 小时不等收盘", rows => signals(rows, r => { const h4 = r.c > r.hi4 ? 1 : r.c < r.lo4 ? -1 : r.h4; return same([r.w, r.d, h4, r.h1]); }, big), 0],
  late1: ["晚 1 小时进", rows => signals(rows, base4, big), 1],
  late2: ["晚 2 小时进", rows => signals(rows, base4, big), 2],
  late4: ["晚 4 小时进", rows => signals(rows, base4, big), 4],
  late8: ["晚 8 小时进", rows => signals(rows, base4, big), 8],
};
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
function boot(all, seed) {                                     // resample calendar months, as fx_test.js does
  const by = new Map(); all.forEach(x => { const d = new Date(x.t * 1000), k = d.getUTCFullYear() * 12 + d.getUTCMonth(); (by.get(k) || by.set(k, []).get(k)).push(x.R); });
  const months = [...by.values()], rnd = L.rng(seed); let le = 0;
  for (let b = 0; b < 4000; b++) { let s = 0, n = 0; for (let i = 0; i < months.length; i++) { const m = months[(rnd() * months.length) | 0]; for (const v of m) { s += v; n++; } } if (s / n <= 0) le++; }
  return le / 4000;
}
const res = {}; Object.keys(VERSIONS).forEach(id => { res[id] = { name: VERSIONS[id][0], pooled: [], pairs: {} }; });
for (const [pair, d, spread] of PAIRS) {
  const H = JSON.parse(fs.readFileSync(path.join(DATA, pair + "_1h.json"))).filter(r => r[0] % 3600 === 0), Dd = JSON.parse(fs.readFileSync(path.join(DATA, pair + "_1d.json")));
  const first = H[0][0], k = Math.pow(10, d), B = bars(Dd.filter(r => r[0] < first).concat(H), k), X = bars(H, k), rows = states(B, first);
  for (const id of Object.keys(VERSIONS)) {
    const [, fn, late] = VERSIONS[id], sg = fn(rows);
    // delay -1 is fx_test.js's "next hourly open"; each hour late adds 60 minutes
    const t = S.run(sg, X, { delay: -1 + late * 60, barSec: 3600, cooldown: 0, maxHold: 1000, spreadBp: spread, swapRate: 0.01, swapRateShort: 0.01, stopAtr: 3, mgmt: "fix", fixR: 3 });
    res[id].pooled.push(...t); res[id].pairs[pair] = +mean(t.map(x => x.R)).toFixed(3);
  }
  console.log(pair, "done");
}
const out = { tested: "2026-11-05", from: "2024-04-01", versions: {} };
console.log("\nversion                                n     win   avg      total   p      pairs+  verdict");
for (const id of Object.keys(res)) {
  const r = res[id], R = r.pooled.map(x => x.R), avg = mean(R), pos = Object.values(r.pairs).filter(v => v > 0).length, p = boot(r.pooled, 7), passed = avg > 0 && p < 0.05 && pos >= 7;
  out.versions[id] = { name: r.name, n: R.length, win: +(R.filter(v => v > 0).length / R.length * 100).toFixed(1), avgR: +avg.toFixed(3), totalR: +R.reduce((a, b) => a + b, 0).toFixed(1), p: +p.toFixed(3), positive: pos, passed, pairs: r.pairs };
  const o = out.versions[id];
  console.log(id.padEnd(6), r.name.padEnd(24), String(o.n).padStart(5), String(o.win).padStart(6), (o.avgR >= 0 ? "+" : "") + o.avgR.toFixed(3), String(o.totalR).padStart(8), o.p.toFixed(3), String(pos).padStart(5) + "/11", passed ? "PASSES" : "fails");
}
out.passed = Object.values(out.versions).filter(v => v.passed).map(v => v.name);
fs.writeFileSync(path.join(__dirname, "speed-result.json"), JSON.stringify(out, null, 1) + "\n");
