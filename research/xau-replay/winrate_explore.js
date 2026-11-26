// Exploratory, 2026-11-26 (owner: "the rate should be more than 70%"): what the win rate costs. The rule's signals
// (all five timeframes agree, stop 3 x 1H ATR), scored with different exits, by period. Nothing here changes the page.
const L = require("./lib"), S = require("./sim");
const st = S.loadStates("full"), X = L.source("duk", 2010, 2026);
let ready = -1; for (let i = 0; i < st.n; i++) if (!Number.isNaN(st.a[i * S.C + 1])) { ready = st.a[i * S.C]; break; }
const from = Math.max(ready, X.t[0]), to = Math.min(st.a[(st.n - 1) * S.C], X.t[X.n - 1]);
const base = { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 1.5, swapRate: 0.075 };
const W3 = r => (r[1] === r[2] && r[2] === r[3] && r[2] !== 0 ? r[2] : 0), C5 = r => (W3(r) && r[4] === r[2] && r[5] === r[2] ? r[2] : 0);
const S5 = S.rowSignals(st, X, C5, { from, to, regime: W3, onset: true });
const SEG = [["11-18", 0, Date.UTC(2019, 0, 1) / 1000], ["19-23", Date.UTC(2019, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["24-26", Date.UTC(2024, 0, 1) / 1000, 1e12]];
const f = (v, d = 3) => (v >= 0 ? "+" : "") + v.toFixed(d);
function row(name, tr) {
  const s = S.stats(tr, { boot: 500 });
  const seg = SEG.map(([l, a, b]) => { const q = S.stats(tr.filter(x => x.t >= a && x.t < b), { boot: 200 }); return l + " " + (q.n ? q.win.toFixed(0) + "% " + f(q.avgR, 2) : "-"); }).join(" | ");
  console.log(name.padEnd(40) + "n=" + String(s.n).padStart(4) + " win " + s.win.toFixed(0).padStart(3) + "% avg " + f(s.avgR) + "R  " + (s.totalR / 15.6).toFixed(1).padStart(5) + "R/yr  DD " + s.maxDD.toFixed(0).padStart(3) + "R | " + seg);
}
console.log("signals", S5.length, new Date(from * 1000).toISOString().slice(0, 10), "->", new Date(to * 1000).toISOString().slice(0, 10));
console.log("\nA) fixed target, stop 3 x ATR");
for (const t of [0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3]) row("target " + t + "R", S.run(S5, X, Object.assign({}, base, { stopAtr: 3, mgmt: "fix", fixR: t })));
console.log("\nB) half off at k, stop to entry, rest at 3R / trailing");
for (const k of [0.33, 0.5, 0.75, 1]) {
  row("half at " + k + "R, rest 3R", S.run(S5, X, Object.assign({}, base, { stopAtr: 3, mgmt: "scale", halfR: k, restR: 3 })));
  row("half at " + k + "R, rest trailing", S.run(S5, X, Object.assign({}, base, { stopAtr: 3, mgmt: "scale", halfR: k, trail: 2, trailEvery: 86400, regimeExit: true })));
}
console.log("\nC) stop to entry once +k, target 3R");
for (const k of [0.5, 1]) row("breakeven at " + k + "R, target 3R", S.run(S5, X, Object.assign({}, base, { stopAtr: 3, mgmt: "fix", fixR: 3, beAt: k })));
console.log("\nD) wider stop, near target");
for (const [k, t] of [[4, 0.5], [5, 0.5], [6, 0.33], [4, 1]]) row("stop " + k + "xATR target " + t + "R", S.run(S5, X, Object.assign({}, base, { stopAtr: k, mgmt: "fix", fixR: t })));
