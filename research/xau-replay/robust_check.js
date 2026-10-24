// Robustness checks on the rule: bootstrap by whole months and years, the stop/target grid, late entry,
// side by period, RSI at entry, a few filters, win rate against pay-off. usage: MARKET=btc|gold node robust_check.js <y0> <y1>
const L = require("./lib"), S = require("./sim");
const BTC = process.env.MARKET === "btc", [y0, y1] = process.argv.slice(2).map(Number);
const st = S.loadStates(BTC ? "btc" : "full"), X = L.source(BTC ? "btc" : "duk", y0, y1);
let ready = -1; for (let i = 0; i < st.n; i++) if (!Number.isNaN(st.a[i * S.C + 1])) { ready = st.a[i * S.C]; break; }
const from = Math.max(ready, X.t[0]), to = Math.min(st.a[(st.n - 1) * S.C], X.t[X.n - 1]), yrs = (to - from) / 86400 / 365.25;
const base = BTC ? { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 3, swapRate: 0.15, swapRateShort: 0.15, swapDaily: true }
                 : { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 1.5, swapRate: 0.075 };
const W3 = r => (r[1] === r[2] && r[2] === r[3] && r[2] !== 0 ? r[2] : 0), C5 = r => (W3(r) && r[4] === r[2] && r[5] === r[2] ? r[2] : 0);
const sig = (cond, opt) => S.rowSignals(st, X, cond, Object.assign({ from, to, regime: W3 }, opt));
const T3 = { stopAtr: 3, mgmt: "fix", fixR: 3 }, TRL = { stopAtr: 3, mgmt: "trail", trail: 2, trailEvery: 86400, regimeExit: true };
const f = (v, d = 3) => (v >= 0 ? "+" : "") + v.toFixed(d);
const line = (name, tr) => { const s = S.stats(tr); return name.padEnd(36) + (s.n ? "n=" + String(s.n).padStart(4) + " win " + s.win.toFixed(0).padStart(2) + "% avg " + f(s.avgR) + "R [" + f(s.lo, 2) + "," + f(s.hi, 2) + "] " + (s.totalR / yrs).toFixed(1).padStart(5) + "R/yr DD " + s.maxDD.toFixed(0).padStart(3) + "R" : "n=0"); };
const yearOf = t => new Date(t * 1000).getUTCFullYear();
// bootstrap whole calendar years (keeps the clustering of trades inside a year), and whole months
function blockBoot(tr, key, B = 4000) {
  const g = S.byKey(tr, key), ks = Object.keys(g), rnd = L.rng(777), m = [];
  for (let b = 0; b < B; b++) { let s = 0, n = 0; for (let i = 0; i < ks.length; i++) { const q = g[ks[(rnd() * ks.length) | 0]]; for (const x of q) { s += x.R; n++; } } m.push(s / n); }
  m.sort((a, b) => a - b); return { lo: m[Math.floor(B * 0.025)], hi: m[Math.floor(B * 0.975)], pPos: m.filter(v => v > 0).length / B * 100 };
}
console.log((BTC ? "BTC" : "GOLD"), new Date(from * 1000).toISOString().slice(0, 10), "->", new Date(to * 1000).toISOString().slice(0, 10), yrs.toFixed(1) + " yrs");
const S5 = sig(C5, { onset: true }), main = S.run(S5, X, Object.assign({}, base, T3)), trail = S.run(S5, X, Object.assign({}, base, TRL));
console.log("\n1) the rule, and how sure we can be (bootstrap: trades / whole months / whole years)");
for (const [nm, tr] of [["target 3R", main], ["trailing stop", trail]]) {
  const s = S.stats(tr), bm = blockBoot(tr, x => yearOf(x.t) * 100 + new Date(x.t * 1000).getUTCMonth()), by = blockBoot(tr, x => yearOf(x.t));
  console.log("  " + line(nm, tr)); console.log("      months-block [" + f(bm.lo, 2) + "," + f(bm.hi, 2) + "] P(>0) " + bm.pPos.toFixed(0) + "%   years-block [" + f(by.lo, 2) + "," + f(by.hi, 2) + "] P(>0) " + by.pPos.toFixed(0) + "%");
}
console.log("\n2) long and short, by period (target 3R)");
const SEG = BTC ? [["2018-2020", 0, Date.UTC(2021, 0, 1) / 1000], ["2021-2023", Date.UTC(2021, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["2024-", Date.UTC(2024, 0, 1) / 1000, 1e12]]
  : [["2011-2018 (untouched)", 0, Date.UTC(2019, 0, 1) / 1000], ["2019-2023 (chosen on)", Date.UTC(2019, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["2024-2026", Date.UTC(2024, 0, 1) / 1000, 1e12]];
for (const d of [1, -1]) for (const [lab, a, b] of [["all", 0, 1e12]].concat(SEG)) console.log("  " + line((d > 0 ? "long  " : "short ") + lab, main.filter(x => x.dir === d && x.t >= a && x.t < b)));
console.log("\n3) parameter grid, target mode: avg R per trade (is 3 ATR / 3R on a plateau or a lucky peak?)");
const stops = [2, 2.5, 3, 3.5, 4], targets = [2, 2.5, 3, 4, 5];
console.log("  stop\\target " + targets.map(t => (t + "R").padStart(8)).join(""));
for (const k of stops) console.log("  " + (k + "xATR").padEnd(12) + targets.map(t => f(S.stats(S.run(S5, X, Object.assign({}, base, { stopAtr: k, mgmt: "fix", fixR: t }))).avgR, 2).padStart(8)).join(""));
console.log("  trailing stop, stop x ATR / trail R:");
for (const k of [2, 3, 4]) console.log("  " + (k + "xATR").padEnd(12) + [1.5, 2, 3].map(t => (t + "R:" + f(S.stats(S.run(S5, X, Object.assign({}, base, { stopAtr: k, mgmt: "trail", trail: t, trailEvery: 86400, regimeExit: true }))).avgR, 2)).padStart(11)).join(""));
console.log("\n4) entering late: same signal, entry delayed (target 3R)");
for (const m of [1, 15, 60, 240, 1440]) console.log("  " + line("delay " + m + " min", S.run(S5, X, Object.assign({}, base, T3, { delay: m }))));
// late by distance: first 15-minute close while all five still agree at which price has gone k x stop-distance from the onset price
console.log("  -- entry at the first close after price has already gone k R the trade's way (still all five agreeing):");
for (const k of [0.25, 0.5, 1, 1.5]) {
  const out = []; let on = null;
  for (let i = 0; i < st.n; i++) {
    const r = st.a.subarray(i * S.C, i * S.C + S.C), T = r[0]; if (T < from || T >= to) continue;
    const d = C5(r);
    if (!d) { on = null; continue; }
    if (!on || on.dir !== d) { on = { dir: d, p: r[38], dist: 3 * r[8], done: false }; continue; }
    if (!on.done && (r[38] - on.p) * d >= k * on.dist) { on.done = true; out.push({ t: T + 60, dir: d, p: r[38], atr: r[8], regimeEnd: 0 }); }
  }
  console.log("  " + line("after +" + k + "R move", S.run(out, X, Object.assign({}, base, T3))));
}
console.log("\n5) RSI at the signal (diagnostic only, not a rule): 4-hour RSI stretched the trade's way vs not");
const rs = S5.map(s => { const i = (() => { let a = 0, b = st.n; while (a < b) { const m = (a + b) >> 1; if (st.a[m * S.C] < s.t - 60) a = m + 1; else b = m; } return a; })(); return st.a[i * S.C + 30]; });
const tagged = S.run(S5.map((s, i) => Object.assign({}, s, { rsi4: rs[i] })), X, Object.assign({}, base, T3));
const stretched = x => (x.dir > 0 ? x.sg.rsi4 >= 70 : x.sg.rsi4 <= 30);
console.log("  " + line("4H RSI stretched (<=30 short / >=70 long)", tagged.filter(stretched)));
console.log("  " + line("4H RSI not stretched", tagged.filter(x => !stretched(x))));
console.log("  " + line("shorts, 4H RSI <= 30", tagged.filter(x => x.dir < 0 && x.sg.rsi4 <= 30)));
console.log("  " + line("shorts, 4H RSI > 30", tagged.filter(x => x.dir < 0 && x.sg.rsi4 > 30)));
console.log("\n6) years");
const yy = S.byKey(main, x => yearOf(x.t)); console.log("  " + Object.keys(yy).map(y => y + ":" + f(yy[y].reduce((a, b) => a + b.R, 0), 1)).join("  "));
console.log("\n7) filters with a reason behind them (target 3R): avg R per trade in each period; adopt only if better everywhere");
// first: is this the first time all five lined up since the big three came into line, or a later re-alignment?
const firstOf = []; { let reg = 0, cnt = 0; for (let i = 0; i < st.n; i++) { const r = st.a.subarray(i * S.C, i * S.C + S.C); const w = W3(r); if (w !== reg) { reg = w; cnt = 0; } const c = C5(r); if (c && (i === 0 || C5(st.a.subarray((i - 1) * S.C, i * S.C)) !== c)) { cnt++; firstOf.push([r[0] + 60, cnt]); } } }
const nth = new Map(firstOf); const rowAt = t => { let a = 0, b = st.n; while (a < b) { const m = (a + b) >> 1; if (st.a[m * S.C] < t - 60) a = m + 1; else b = m; } return st.a.subarray(a * S.C, a * S.C + S.C); };
const F = {
  "the rule as it is": () => true,
  "longs only": s => s.dir > 0,
  "daily EMAs stacked the trade's way": s => rowAt(s.t)[34] === s.dir,
  "4H EMAs stacked the trade's way": s => rowAt(s.t)[35] === s.dir,
  "first signal of a new big-three trend": s => nth.get(s.t) === 1,
  "2nd and later signals": s => (nth.get(s.t) || 0) > 1,
};
const segs = [["all", 0, 1e12]].concat(SEG);
console.log("  " + "".padEnd(40) + segs.map(g => g[0].slice(0, 20).padStart(22)).join(""));
for (const [nm, fn] of Object.entries(F)) {
  const tr = S.run(S5, X, Object.assign({}, base, T3, { filter: fn }));
  console.log("  " + nm.padEnd(40) + segs.map(([, a, b]) => { const q = S.stats(tr.filter(x => x.t >= a && x.t < b)); return q.n ? (f(q.avgR, 2) + " n" + q.n + " w" + q.win.toFixed(0) + "%").padStart(22) : "n=0".padStart(22); }).join(""));
}
console.log("\n8) win rate against pay-off (3 x ATR stop): a closer target wins more often but is it worth more?");
for (const t of [1, 1.5, 2, 3, 4]) { const q = S.stats(S.run(S5, X, Object.assign({}, base, { stopAtr: 3, mgmt: "fix", fixR: t }))); console.log("  target " + (t + "R").padEnd(5) + " win " + q.win.toFixed(0).padStart(2) + "%  avg " + f(q.avgR) + "R  R/yr " + (q.totalR / yrs).toFixed(1) + "  DD " + q.maxDD.toFixed(0) + "R  streak " + q.maxLoseStreak); }
