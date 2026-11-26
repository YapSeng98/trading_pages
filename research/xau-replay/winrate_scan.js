// Exploratory, 2026-11-26: does anything known at the signal pick out signals that reach +1R before -1R (stop 3 x 1H
// ATR) far more often than the usual ~51%? Buckets by period. Nothing here changes the page.
const L = require("./lib"), S = require("./sim");
const st = S.loadStates("full"), X = L.source("duk", 2010, 2026), a = st.a, C = S.C;
let ready = -1; for (let i = 0; i < st.n; i++) if (!Number.isNaN(a[i * C + 1])) { ready = a[i * C]; break; }
const from = Math.max(ready, X.t[0]), to = Math.min(a[(st.n - 1) * C], X.t[X.n - 1]);
const base = { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 1.5, swapRate: 0.075, stopAtr: 3, mgmt: "fix", fixR: 1 };
const W3 = r => (r[1] === r[2] && r[2] === r[3] && r[2] !== 0 ? r[2] : 0), C5 = r => (W3(r) && r[4] === r[2] && r[5] === r[2] ? r[2] : 0);
// regime age: since when the big three have agreed, and since when all five (per row)
const age3 = new Float64Array(st.n); { let s = 0, d = 0; for (let i = 0; i < st.n; i++) { const r = a.subarray(i * C, i * C + C), w = W3(r); if (w !== d) { d = w; s = r[0]; } age3[i] = w ? (r[0] - s) / 86400 : NaN; } }
const S5 = S.rowSignals(st, X, C5, { from, to, regime: W3, onset: true });
// attach the row each signal came from
let j = 0; S5.forEach(sg => { while (j < st.n - 1 && a[(j + 1) * C] <= sg.t - 60) j++; sg.row = Array.from(a.subarray(j * C, j * C + C)); sg.age3 = age3[j]; });
const tr = S.run(S5, X, base);
const SEG = [["11-18", 0, Date.UTC(2019, 0, 1) / 1000], ["19-23", Date.UTC(2019, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["24-26", Date.UTC(2024, 0, 1) / 1000, 1e12]];
const hit = q => q.length ? (q.filter(x => x.R > 0).length / q.length * 100) : NaN;
function show(name, key) {
  const g = S.byKey(tr, x => key(x.sg.row, x.sg.dir, x.sg));
  console.log("\n" + name);
  Object.keys(g).sort().forEach(k => {
    const q = g[k], seg = SEG.map(([l, a0, b0]) => { const z = q.filter(x => x.t >= a0 && x.t < b0); return l + " " + (z.length ? hit(z).toFixed(0).padStart(3) + "% n" + z.length : "-"); }).join(" | ");
    console.log("  " + String(k).padEnd(22) + "n=" + String(q.length).padStart(4) + " hit " + hit(q).toFixed(0).padStart(3) + "% avg " + (S.stats(q, { boot: 50 }).avgR >= 0 ? "+" : "") + S.stats(q, { boot: 50 }).avgR.toFixed(3) + "R | " + seg);
  });
}
console.log("1R first-passage: all", tr.length, "trades, hit", hit(tr).toFixed(1) + "%");
const o = (v, d) => (d > 0 ? v : 100 - v);
show("side", (r, d) => (d > 0 ? "long" : "short"));
show("daily EMA stack with the signal", (r, d) => (r[34] === d ? "yes" : r[34] === -d ? "against" : "mixed"));
show("4H EMA stack with the signal", (r, d) => (r[35] === d ? "yes" : r[35] === -d ? "against" : "mixed"));
show("internal structure D/4H/1H/15M all with it", (r, d) => ([26, 27, 28, 29].every(k => r[k] === d) ? "all" : [26, 27, 28, 29].filter(k => r[k] === d).length + " of 4"));
show("1H RSI, signal side", (r, d) => { const v = o(r[31], d); return v < 50 ? "a <50" : v < 60 ? "b 50-60" : v < 70 ? "c 60-70" : "d >70"; });
show("4H RSI, signal side", (r, d) => { const v = o(r[30], d); return v < 50 ? "a <50" : v < 60 ? "b 50-60" : v < 70 ? "c 60-70" : "d >70"; });
show("daily range position, signal side", (r, d) => { const v = o(r[32], d); return Number.isNaN(v) ? "na" : v < 45 ? "a cheap" : v <= 55 ? "b middle" : "c dear"; });
show("big three agreeing for", (r, d, sg) => (sg.age3 < 1 ? "a <1 day" : sg.age3 < 5 ? "b 1-5 days" : sg.age3 < 20 ? "c 5-20 days" : "d >20 days"));
show("daily ATR / price", (r) => { const v = r[9] / r[38] * 100; return v < 0.8 ? "a <0.8%" : v < 1.2 ? "b 0.8-1.2%" : v < 1.8 ? "c 1.2-1.8%" : "d >1.8%"; });
show("hour SGT", (r) => { const h = new Date((r[0] + 8 * 3600) * 1000).getUTCHours(); return h >= 6 && h < 15 ? "a Asia 06-15" : h < 20 && h >= 15 ? "b London 15-20" : h >= 20 || h < 2 ? "c NY 20-02" : "d late 02-06"; });
// a composite fixed by trading logic before looking: one point each for the daily stack, the 4H stack, all four internal structures, 1H RSI 50-70 on the signal side
show("strength points (0-4)", (r, d) => String((r[34] === d) + (r[35] === d) + ([26, 27, 28, 29].every(k => r[k] === d)) + (o(r[31], d) >= 50 && o(r[31], d) < 70)));
