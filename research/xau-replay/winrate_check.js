// Can the rule's signals win 70% of the time? (owner, 2026-11-26: "improve the system more accurate and more strong
// signal, dun keep alert with not strong signal, the rate should be more than 70%"). Two ways to a higher win rate,
// both on the rule's own signals (all five timeframes agree, stop 3 x 1H ATR), 2011-02 to the end of the history:
//  1. take profit sooner: fixed targets from 0.33R to 3R, and half off early with the stop moved to entry;
//  2. pick stronger signals: every reading the engine has at the signal (side, the daily and 4-hour EMA stacks, the four
//     internal structures, 1-hour and 4-hour RSI, where price sits in the daily range, how long the big three have
//     agreed, daily volatility, the session, and a 0-4 strength score), scored by how often price went +1R before -1R.
// usage: node --max-old-space-size=8000 winrate_check.js [--write]   (--write: the summary into data/xau-backtest.json, `winrate`)
const L = require("./lib"), S = require("./sim"), fs = require("fs");
const st = S.loadStates("full"), X = L.source("duk", 2010, 2026), a = st.a, C = S.C;
let ready = -1; for (let i = 0; i < st.n; i++) if (!Number.isNaN(a[i * C + 1])) { ready = a[i * C]; break; }
const from = Math.max(ready, X.t[0]), to = Math.min(a[(st.n - 1) * C], X.t[X.n - 1]), yrs = (to - from) / 86400 / 365.25;
const base = { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 1.5, swapRate: 0.075, stopAtr: 3 };
const W3 = r => (r[1] === r[2] && r[2] === r[3] && r[2] !== 0 ? r[2] : 0), C5 = r => (W3(r) && r[4] === r[2] && r[5] === r[2] ? r[2] : 0);
const age3 = new Float64Array(st.n); { let s = 0, d = 0; for (let i = 0; i < st.n; i++) { const r = a.subarray(i * C, i * C + C), w = W3(r); if (w !== d) { d = w; s = r[0]; } age3[i] = w ? (r[0] - s) / 86400 : NaN; } }
const S5 = S.rowSignals(st, X, C5, { from, to, regime: W3, onset: true });
let j = 0; S5.forEach(sg => { while (j < st.n - 1 && a[(j + 1) * C] <= sg.t - 60) j++; sg.row = Array.from(a.subarray(j * C, j * C + C)); sg.age3 = age3[j]; });
const SEG = [["2011-2018", 0, Date.UTC(2019, 0, 1) / 1000], ["2019-2023", Date.UTC(2019, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["2024-", Date.UTC(2024, 0, 1) / 1000, 1e12]];
const r2 = (v, d = 3) => +v.toFixed(d), f = (v, d = 3) => (v >= 0 ? "+" : "") + v.toFixed(d);
function pack(tr) {
  const s = S.stats(tr, { boot: 500 });
  return { n: s.n, win: r2(s.win, 1), avgR: r2(s.avgR), rPerYear: r2(s.totalR / yrs, 1), maxDD: r2(s.maxDD, 1),
    segments: SEG.map(([l, a0, b0]) => { const q = S.stats(tr.filter(x => x.t >= a0 && x.t < b0), { boot: 100 }); return { label: l, n: q.n, win: r2(q.win, 1), avgR: r2(q.avgR) }; }) };
}
const out = { asked: 70, from: new Date(from * 1000).toISOString().slice(0, 10), to: new Date(to * 1000).toISOString().slice(0, 10), signals: S5.length, exits: [], features: [] };
const EXITS = [["target 0.33R", { mgmt: "fix", fixR: 0.33 }], ["target 0.5R", { mgmt: "fix", fixR: 0.5 }], ["target 1R", { mgmt: "fix", fixR: 1 }], ["target 3R (the rule)", { mgmt: "fix", fixR: 3 }],
  ["half at 0.33R, rest trailing", { mgmt: "scale", halfR: 0.33, trail: 2, trailEvery: 86400, regimeExit: true }], ["half at 0.75R, rest trailing", { mgmt: "scale", halfR: 0.75, trail: 2, trailEvery: 86400, regimeExit: true }]];
console.log("signals", S5.length, out.from, "->", out.to, yrs.toFixed(1) + " yrs\n");
for (const [name, o] of EXITS) {
  const p = Object.assign({ name, key: o.mgmt + (o.fixR || o.halfR) }, pack(S.run(S5, X, Object.assign({}, base, o)))); out.exits.push(p);
  console.log(name.padEnd(32) + "n=" + String(p.n).padStart(4) + " win " + String(p.win).padStart(5) + "% avg " + f(p.avgR) + "R " + String(p.rPerYear).padStart(5) + "R/yr DD " + p.maxDD + "R | " + p.segments.map(s => s.label + " " + s.win + "% " + f(s.avgR, 2)).join(" | "));
}
// how often price went +1R before -1R, by each reading at the signal
const one = S.run(S5, X, Object.assign({}, base, { mgmt: "fix", fixR: 1 })), hit = q => q.filter(x => x.R > 0).length / q.length * 100;
out.base1R = { n: one.length, hit: r2(hit(one), 1) };
const o2 = (v, d) => (d > 0 ? v : 100 - v);
const FEAT = [
  ["side", (r, d) => (d > 0 ? "long" : "short")],
  ["daily EMA stack", (r, d) => (r[34] === d ? "with" : r[34] === -d ? "against" : "mixed")],
  ["4-hour EMA stack", (r, d) => (r[35] === d ? "with" : r[35] === -d ? "against" : "mixed")],
  ["internal structures", (r, d) => [26, 27, 28, 29].filter(k => r[k] === d).length + " of 4"],
  ["1-hour RSI", (r, d) => { const v = o2(r[31], d); return v < 50 ? "<50" : v < 60 ? "50-60" : v < 70 ? "60-70" : ">70"; }],
  ["4-hour RSI", (r, d) => { const v = o2(r[30], d); return v < 50 ? "<50" : v < 60 ? "50-60" : v < 70 ? "60-70" : ">70"; }],
  ["daily range position", (r, d) => { const v = o2(r[32], d); return Number.isNaN(v) ? "na" : v < 45 ? "cheap" : v <= 55 ? "middle" : "dear"; }],
  ["big three agreeing for", (r, d, sg) => (sg.age3 < 1 ? "<1 day" : sg.age3 < 5 ? "1-5 days" : sg.age3 < 20 ? "5-20 days" : ">20 days")],
  ["daily volatility", r => { const v = r[9] / r[38] * 100; return v < 1.2 ? "<1.2%" : v < 1.8 ? "1.2-1.8%" : ">1.8%"; }],
  ["session", r => { const h = new Date((r[0] + 8 * 3600) * 1000).getUTCHours(); return h >= 6 && h < 15 ? "Asia" : h >= 15 && h < 20 ? "London" : h >= 20 || h < 2 ? "New York" : "late"; }],
  ["strength score 0-4", (r, d) => String((r[34] === d) + (r[35] === d) + [26, 27, 28, 29].every(k => r[k] === d) + (o2(r[31], d) >= 50 && o2(r[31], d) < 70))]];
console.log("\n+1R before -1R: all " + one.length + " trades " + out.base1R.hit + "%");
let best = null;
for (const [name, key] of FEAT) {
  const g = S.byKey(one, x => key(x.sg.row, x.sg.dir, x.sg)), rows = [];
  for (const k of Object.keys(g)) {
    const q = g[k]; if (q.length < 50) continue;                              // too few to say anything
    const seg = SEG.map(([, a0, b0]) => { const z = q.filter(x => x.t >= a0 && x.t < b0); return z.length >= 15 ? hit(z) : null; });
    const row = { bucket: k, n: q.length, hit: r2(hit(q), 1), worstPeriod: r2(Math.min.apply(null, seg.filter(v => v !== null)), 1) };
    rows.push(row); if (!best || row.worstPeriod > best.worstPeriod) best = Object.assign({ feature: name }, row);
  }
  out.features.push({ name, buckets: rows });
  console.log(name.padEnd(24) + rows.map(r => r.bucket + " " + r.hit + "% (worst period " + r.worstPeriod + "%, n" + r.n + ")").join(" · "));
}
const all = [].concat.apply([], out.features.map(x => x.buckets.map(b => b.hit)));
out.range1R = { lo: Math.min.apply(null, all), hi: Math.max.apply(null, all) }; out.best = best;
console.log("\nbuckets with 50+ trades: +1R-first rate from " + out.range1R.lo + "% to " + out.range1R.hi + "%; best in its worst period: " + best.feature + " " + best.bucket + " " + best.worstPeriod + "%");
if (process.argv.includes("--write")) {
  const p = L.REPO + "/data/xau-backtest.json", d = JSON.parse(fs.readFileSync(p, "utf8"));
  out.updated = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); d.winrate = out;
  fs.writeFileSync(p, JSON.stringify(d, null, 1) + "\n"); console.log("wrote winrate into data/xau-backtest.json");
}
