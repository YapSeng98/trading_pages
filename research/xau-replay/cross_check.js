// The rule, unchanged, on markets it was never chosen on. Written down on 2026-10-26 BEFORE any result was seen:
//   markets  ETH, BNB, LTC, XRP, ADA, DOGE, SOL — Binance spot, 15-minute bars (download_binance15.py), candles cut in
//            UTC like Bitcoin, states from gen_states.js (SRC=bn15:<SYM> TAG=x_<sym>)
//   rule     the page's: five timeframes agree, stop 3 x 1-hour ATR, target 3R; the trailing-stop way out alongside
//   costs    as Bitcoin's MT5 CFD: spread 3 bp, financing 15% a year on both sides, every day; fills on 15-minute
//            bars, the stop first when stop and target fall in the same bar (on gold and Bitcoin, 15-minute fills
//            flattered the result by 0.01-0.03R a trade)
//   success  the seven markets together average above 0R a trade with p < 0.05, AND at least 5 of the 7 are positive
//            (target 3R). Crypto markets move together, so a month-block bootstrap is printed too.
// Gold could not be checked the same way: the only free intraday history for silver, currencies, indices and oil is
// Dukascopy's chart feed, which turns away automated downloads.
// usage: node cross_check.js
const L = require("./lib"), S = require("./sim");
const MARKETS = [["ETHUSDT", 2017], ["BNBUSDT", 2017], ["LTCUSDT", 2017], ["XRPUSDT", 2018], ["ADAUSDT", 2018], ["DOGEUSDT", 2019], ["SOLUSDT", 2020]];
const base = { delay: -1, barSec: 900, cooldown: 0, maxHold: 4000, spreadBp: 3, swapRate: 0.15, swapRateShort: 0.15, swapDaily: true };
const W3 = r => (r[1] === r[2] && r[2] === r[3] && r[2] !== 0 ? r[2] : 0), C5 = r => (W3(r) && r[4] === r[2] && r[5] === r[2] ? r[2] : 0);
const T3 = { stopAtr: 3, mgmt: "fix", fixR: 3 }, TRL = { stopAtr: 3, mgmt: "trail", trail: 2, trailEvery: 86400, regimeExit: true };
const f = (v, d = 3) => (v >= 0 ? "+" : "") + v.toFixed(d);
const Phi = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
const all3 = [], allT = [], rows = [];
for (const [sym, y0] of MARKETS) {
  const st = S.loadStates("x_" + sym.toLowerCase()), X = L.source("bn15:" + sym, y0, 2026);
  let ready = -1; for (let i = 0; i < st.n; i++) if (!Number.isNaN(st.a[i * S.C + 1])) { ready = st.a[i * S.C]; break; }
  const from = Math.max(ready, X.t[0]), to = Math.min(st.a[(st.n - 1) * S.C], X.t[X.n - 1]), yrs = (to - from) / 86400 / 365.25;
  const sig = S.rowSignals(st, X, C5, { from, to, regime: W3, onset: true });
  const a = S.run(sig, X, Object.assign({}, base, T3)), b = S.run(sig, X, Object.assign({}, base, TRL));
  const ag = S.run(S.rowSignals(st, X, r => -W3(r), { from, to, regime: W3 }), X, Object.assign({}, base, T3));
  const sa = S.stats(a), sb = S.stats(b), sg = S.stats(ag);
  a.forEach(x => all3.push({ R: x.R, t: x.t, m: sym })); b.forEach(x => allT.push({ R: x.R, t: x.t, m: sym }));
  const p0 = X.c[L.lowerBound(X.t, from)], p1 = X.c[L.lowerBound(X.t, to) - 1];
  rows.push({ sym, from: new Date(from * 1000).toISOString().slice(0, 10), yrs: +yrs.toFixed(1), n: sa.n, avgR: +sa.avgR.toFixed(3), lo: +sa.lo.toFixed(3), hi: +sa.hi.toFixed(3), win: +sa.win.toFixed(1), rPerYear: +(sa.totalR / yrs).toFixed(1), maxDD: +sa.maxDD.toFixed(1), trail: +sb.avgR.toFixed(3), against: +sg.avgR.toFixed(3), move: +((p1 / p0 - 1) * 100).toFixed(0) });
  console.log(sym.padEnd(9) + "from " + rows.at(-1).from + " (" + yrs.toFixed(1) + " yrs)  n " + String(sa.n).padStart(3) + "  win " + sa.win.toFixed(0) + "%  avg " + f(sa.avgR) + "R [" + f(sa.lo, 2) + "," + f(sa.hi, 2) + "]  " + (sa.totalR / yrs).toFixed(1).padStart(5) + "R/yr  DD " + sa.maxDD.toFixed(0) + "R   trailing " + f(sb.avgR) + "R   against the trend " + f(sg.avgR) + "R   price " + (p1 / p0 - 1 >= 0 ? "+" : "") + ((p1 / p0 - 1) * 100).toFixed(0) + "%");
}
function pooled(name, list) {
  const R = list.map(x => x.R), m = L.mean(R), s = L.sd(R), t = m / (s / Math.sqrt(R.length)), p = 2 * (1 - Phi(Math.abs(t)));
  const g = S.byKey(list, x => new Date(x.t * 1000).toISOString().slice(0, 7)), ks = Object.keys(g), rnd = L.rng(11), ms = [];
  for (let b = 0; b < 4000; b++) { let sum = 0, n = 0; for (let i = 0; i < ks.length; i++) for (const x of g[ks[(rnd() * ks.length) | 0]]) { sum += x.R; n++; } ms.push(sum / n); }
  ms.sort((a, b) => a - b);
  console.log("  " + name.padEnd(12) + "n " + R.length + "  avg " + f(m) + "R  t " + t.toFixed(2) + "  p " + p.toFixed(3) + "   month-block bootstrap [" + f(ms[100], 2) + "," + f(ms[3900], 2) + "], P(avg>0) " + (ms.filter(v => v > 0).length / 40).toFixed(0) + "%");
  return { n: R.length, avgR: +m.toFixed(3), p: +p.toFixed(3), lo: +ms[100].toFixed(3), hi: +ms[3900].toFixed(3), pPos: Math.round(ms.filter(v => v > 0).length / 40) };
}
console.log("\nPOOLED (all seven)");
const P3 = pooled("target 3R", all3), PT = pooled("trailing", allT);
const positive = rows.filter(r => r.avgR > 0).length;
console.log("\nverdict by the criteria written down beforehand: pooled p " + P3.p + (P3.avgR > 0 && P3.p < 0.05 ? " (passes)" : " (fails)") + ", " + positive + " of 7 positive" + (positive >= 5 ? " (passes)" : " (fails)") + "  ->  " + (P3.avgR > 0 && P3.p < 0.05 && positive >= 5 ? "CONFIRMED on markets it was never chosen on" : "NOT confirmed"));
if (process.argv.includes("--write")) {
  const fs = require("fs"), file = L.REPO + "/data/btc-backtest.json", bt = JSON.parse(fs.readFileSync(file, "utf8"));
  bt.crossMarket = { tested: new Date().toISOString().slice(0, 10), markets: rows, pooled3R: P3, pooledTrail: PT, positive, passed: P3.avgR > 0 && P3.p < 0.05 && positive >= 5,
    note: "research/xau-replay/cross_check.js：规则一字不改，用在选规则时没看过的 7 个币上（15 分钟 K 线，成本按比特币差价合约）；成功标准事先写好：合并平均 >0 且 p<0.05，并且至少 5 个市场为正。" };
  fs.writeFileSync(file, JSON.stringify(bt, null, 1) + "\n"); console.log("wrote crossMarket into " + file);
}
