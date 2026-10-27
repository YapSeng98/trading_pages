// Is the rule's edge proven? Tests that try to knock it down (scratch-free: prints a report, writes nothing).
//   1. plain statistics: mean R, t-test, bootstrap by trade / month / year, how many trades a proof would need
//   2. random entries: the same stop and target, entered at random 15-minute closes (direction mix as the rule's)
//   3. direction: the rule's own entry times, direction flipped at random (sign-flip test)
//   4. timing: random closes inside the big-three trend, entered with it (do the 1H / 15M conditions add anything?)
//   5. many tries: deflated Sharpe ratio for ~50 variants looked at, and the probability of backtest overfitting
//      (CSCV over the stop / target / trailing family, whole calendar years as blocks)
//   6. costs that would erase it, and what it earns against simply holding the market
// usage: MARKET=gold|btc node proof_check.js <y0> <y1>
const L = require("./lib"), S = require("./sim");
const BTC = process.env.MARKET === "btc", [y0, y1] = process.argv.slice(2).map(Number);
const st = S.loadStates(BTC ? "btc" : "full"), X = L.source(BTC ? "btc" : "duk", y0, y1);
let ready = -1; for (let i = 0; i < st.n; i++) if (!Number.isNaN(st.a[i * S.C + 1])) { ready = st.a[i * S.C]; break; }
const from = Math.max(ready, X.t[0]), to = Math.min(st.a[(st.n - 1) * S.C], X.t[X.n - 1]), yrs = (to - from) / 86400 / 365.25;
const base = BTC ? { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 3, swapRate: 0.15, swapRateShort: 0.15, swapDaily: true } : { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 1.5, swapRate: 0.075 };
const W3 = r => (r[1] === r[2] && r[2] === r[3] && r[2] !== 0 ? r[2] : 0), C5 = r => (W3(r) && r[4] === r[2] && r[5] === r[2] ? r[2] : 0);
const T3 = { stopAtr: 3, mgmt: "fix", fixR: 3 }, TRL = { stopAtr: 3, mgmt: "trail", trail: 2, trailEvery: 86400, regimeExit: true };
const row = i => st.a.subarray(i * S.C, i * S.C + S.C);
const f = (v, d = 3) => (v >= 0 ? "+" : "") + v.toFixed(d), pct = v => (v * 100).toFixed(1) + "%";
const rnd = L.rng(2026);
// normal distribution helpers
const Phi = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
const PhiInv = p => { let lo = -10, hi = 10; for (let k = 0; k < 100; k++) { const m = (lo + hi) / 2; if (Phi(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
const moments = a => { const n = a.length, m = L.mean(a), s = L.sd(a); let s3 = 0, s4 = 0; for (const v of a) { const z = (v - m) / s; s3 += z ** 3; s4 += z ** 4; } return { n, m, s, skew: s3 / n, kurt: s4 / n }; };

const S5 = S.rowSignals(st, X, C5, { from, to, regime: W3, onset: true });
const main = S.run(S5, X, Object.assign({}, base, T3)), trail = S.run(S5, X, Object.assign({}, base, TRL));
console.log((BTC ? "BITCOIN" : "GOLD") + " " + new Date(from * 1000).toISOString().slice(0, 10) + " -> " + new Date(to * 1000).toISOString().slice(0, 10) + " (" + yrs.toFixed(1) + " yrs)\n");

// ---- 1. plain statistics ----
console.log("1) THE NUMBERS");
for (const [nm, tr] of [["target 3R", main], ["trailing stop", trail]]) {
  const R = tr.map(x => x.R), mo = moments(R), tstat = mo.m / (mo.s / Math.sqrt(mo.n)), p = 2 * (1 - Phi(Math.abs(tstat)));
  const need = Math.ceil((1.96 * mo.s / mo.m) ** 2);
  console.log("  " + nm.padEnd(14) + "n " + mo.n + "  avg " + f(mo.m) + "R  sd " + mo.s.toFixed(2) + "  t " + tstat.toFixed(2) + "  p " + p.toFixed(3) + "  skew " + mo.skew.toFixed(2) + "  trades needed for a 95% proof at this average: " + need + (need > mo.n ? " (have " + mo.n + ")" : " (have enough)"));
}

// ---- random entries, traded one at a time like a person would ----
// Each run walks through history; at every 15-minute close there is a small chance of a random entry (about once a day),
// taken only when no trade is on. Picking moments independently instead would over-count long trends (every hour of a
// big trend becomes another winning entry), which no one-trade-at-a-time trader can do.
const rowsIn = []; for (let i = 0; i < st.n; i++) { const r = row(i); if (r[0] >= from && r[0] < to && r[8] > 0) rowsIn.push(i); }
function seqRuns(dirOf, runs) {
  const means = [];
  for (let k = 0; k < runs; k++) {
    const sigs = [];
    for (const i of rowsIn) { if (rnd() >= 1 / 96) continue; const r = row(i), d = dirOf(r); if (d) sigs.push({ t: r[0] + 60, dir: d, p: r[38], atr: r[8], regimeEnd: 0 }); }
    const tr = S.run(sigs, X, Object.assign({}, base, T3)); means.push(L.mean(tr.map(x => x.R)));
  }
  return means.sort((a, b) => a - b);
}
const actual = L.mean(main.map(x => x.R)), longShare = main.filter(x => x.dir > 0).length / main.length, RUNS = 400, t0 = Date.now();
const rm = seqRuns(() => (rnd() < longShare ? 1 : -1), RUNS), beat = rm.filter(m => m >= actual).length;
console.log("\n2) AGAINST RANDOM ENTRIES (same stop 3 x ATR, target 3R, costs, " + pct(longShare) + " longs like the rule, one trade at a time; " + RUNS + " runs)");
console.log("  random entries average " + f(L.mean(rm)) + "R (95% of runs between " + f(rm[Math.floor(RUNS * 0.025)]) + " and " + f(rm[Math.floor(RUNS * 0.975)]) + ");  the rule " + f(actual) + "R;  random beat the rule in " + pct(beat / RUNS) + " of runs");
// ---- 3. direction: same entry times, random direction ----
const flipped = main.map(x => { const tr = S.trade(Object.assign({}, x.sg, { dir: -x.dir }), X, Object.assign({}, base, T3)); return tr && !tr.skip ? tr.R : null; });
const pairs = main.map((x, k) => [x.R, flipped[k]]).filter(p => p[1] !== null);
let beat3 = 0; const real3 = L.mean(pairs.map(p => p[0]));
for (let k = 0; k < RUNS; k++) { let s = 0; for (const p of pairs) s += rnd() < 0.5 ? p[0] : p[1]; if (s / pairs.length >= real3) beat3++; }
console.log("\n3) DIRECTION (the rule's own entry times; the other way round averaged " + f(L.mean(pairs.map(p => p[1]))) + "R)");
console.log("  picking the side by coin flip beat the rule's side in " + pct(beat3 / RUNS) + " of " + RUNS + " runs");

// ---- 4. timing inside the big trend ----
const tm = seqRuns(r => W3(r), RUNS), beat4 = tm.filter(m => m >= actual).length;
console.log("\n4) TIMING (random moments while weekly, daily and 4-hour agree, entered their way, one trade at a time)");
console.log("  random timing inside the trend averages " + f(L.mean(tm)) + "R (95% of runs between " + f(tm[Math.floor(RUNS * 0.025)]) + " and " + f(tm[Math.floor(RUNS * 0.975)]) + ");  the rule " + f(actual) + "R;  random timing beat it in " + pct(beat4 / RUNS) + " of runs");
const ag = seqRuns(r => -W3(r), RUNS);
console.log("  for scale: random moments AGAINST the big trend average " + f(L.mean(ag)) + "R   (" + ((Date.now() - t0) / 1000).toFixed(0) + "s for the random runs)");

// ---- 5. many tries ----
const fam = [];
for (const k of [2, 2.5, 3, 3.5, 4]) for (const t of [2, 2.5, 3, 4, 5]) fam.push(["fix " + k + "x/" + t + "R", Object.assign({}, base, { stopAtr: k, mgmt: "fix", fixR: t })]);
for (const k of [2, 3, 4]) for (const t of [1.5, 2, 3]) fam.push(["trail " + k + "x/" + t + "R", Object.assign({}, base, { stopAtr: k, mgmt: "trail", trail: t, trailEvery: 86400, regimeExit: true })]);
const famTr = fam.map(([nm, o]) => ({ nm, tr: S.run(S5, X, o) }));
const srs = famTr.map(v => { const R = v.tr.map(x => x.R); return L.mean(R) / L.sd(R); });
const mo = moments(main.map(x => x.R)), SR = mo.m / mo.s, TRIALS = 50, V = L.sd(srs) ** 2, g = 0.5772156649;
const SR0 = Math.sqrt(V) * ((1 - g) * PhiInv(1 - 1 / TRIALS) + g * PhiInv(1 - 1 / (TRIALS * Math.E)));
const DSR = Phi((SR - SR0) * Math.sqrt(mo.n - 1) / Math.sqrt(1 - mo.skew * SR + (mo.kurt - 1) / 4 * SR * SR));
console.log("\n5) MANY TRIES (about " + TRIALS + " variants were looked at before the rule was fixed)");
console.log("  Sharpe per trade " + SR.toFixed(3) + "; the best of " + TRIALS + " luck-only variants would reach about " + SR0.toFixed(3) + " (spread of the family's Sharpes " + Math.sqrt(V).toFixed(3) + ")");
console.log("  deflated Sharpe ratio: " + pct(DSR) + " chance the edge is real after allowing for the tries (95% is the usual bar)");
// CSCV: whole calendar years as blocks
const yearsAll = [...new Set(famTr.flatMap(v => v.tr.map(x => new Date(x.t * 1000).getUTCFullYear())))].sort();
let Y = yearsAll.filter(y => y > new Date(from * 1000).getUTCFullYear() || new Date(from * 1000).getUTCMonth() < 2);
if (Y.length % 2) Y = Y.slice(1);
const M = famTr.map(v => Y.map(y => { const q = v.tr.filter(x => new Date(x.t * 1000).getUTCFullYear() === y); return q.reduce((a, b) => a + b.R, 0); }));
const half = Y.length / 2, combos = [];
(function pick(start, acc) { if (acc.length === half) { combos.push(acc.slice()); return; } for (let k = start; k < Y.length; k++) { acc.push(k); pick(k + 1, acc); acc.pop(); } })(0, []);
let below = 0, oosBestPos = 0;
for (const c of combos) {
  const inS = new Set(c), isMean = M.map(r => r.reduce((a, v, k) => a + (inS.has(k) ? v : 0), 0)), oos = M.map(r => r.reduce((a, v, k) => a + (inS.has(k) ? 0 : v), 0));
  const best = isMean.indexOf(Math.max(...isMean)), rank = oos.filter(v => v < oos[best]).length + 1, w = rank / (M.length + 1);
  if (Math.log(w / (1 - w)) <= 0) below++; if (oos[best] > 0) oosBestPos++;
}
console.log("  probability of backtest overfitting (CSCV, " + famTr.length + " stop/target/trailing variants, " + Y.length + " years, " + combos.length + " splits): " + pct(below / combos.length) + "  (below 50% = the in-sample winner stays above the median out of sample)");
console.log("  the in-sample winner still made money out of sample in " + pct(oosBestPos / combos.length) + " of splits");
console.log("  family: " + famTr.filter(v => L.mean(v.tr.map(x => x.R)) > 0).length + " of " + famTr.length + " variants positive overall");

// ---- 6. costs and the plain alternative ----
console.log("\n6) COSTS AND THE ALTERNATIVE");
for (const sp of BTC ? [3, 6, 10, 15] : [1.5, 3, 5, 8]) { const tr = S.run(S5, X, Object.assign({}, base, T3, { spreadBp: sp })); console.log("  spread " + String(sp).padStart(4) + " bp (" + (BTC ? "$" + Math.round(80000 * sp / 10000) : "$" + (4000 * sp / 10000).toFixed(2)) + " at today's price): avg " + f(L.mean(tr.map(x => x.R))) + "R"); }
const p0 = X.c[L.lowerBound(X.t, from)], p1 = X.c[L.lowerBound(X.t, to) - 1];
// buy and hold: yearly return and worst fall, from daily closes
let peak = p0, dd = 0; for (let k = L.lowerBound(X.t, from); k < L.lowerBound(X.t, to); k += 1440) { peak = Math.max(peak, X.c[k]); dd = Math.max(dd, 1 - X.c[k] / peak); }
const cagr = (p1 / p0) ** (1 / yrs) - 1, sm = S.stats(main);
console.log("  holding " + (BTC ? "Bitcoin" : "gold") + ": " + Math.round(p0) + " -> " + Math.round(p1) + ", " + pct(cagr) + " a year, worst fall " + pct(dd));
for (const risk of [0.005, 0.01]) console.log("  the rule at " + (risk * 100) + "% risk a trade: about " + pct(sm.totalR / yrs * risk) + " a year (simple, not compounded), worst drawdown about " + pct(sm.maxDD * risk));
// trend years: is the rule just "gold trended"?
const yy = S.byKey(main, x => new Date(x.t * 1000).getUTCFullYear()), pts = [];
for (const y of Object.keys(yy)) { const a = L.lowerBound(X.t, Date.UTC(+y, 0, 1) / 1000), b = L.lowerBound(X.t, Date.UTC(+y + 1, 0, 1) / 1000) - 1; if (b > a) pts.push([Math.abs(X.c[b] / X.c[a] - 1), yy[y].reduce((s, x) => s + x.R, 0)]); }
const mx = L.mean(pts.map(p => p[0])), my = L.mean(pts.map(p => p[1])); let sxy = 0, sxx = 0, syy = 0; for (const [a, b] of pts) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
console.log("  correlation between how far " + (BTC ? "Bitcoin" : "gold") + " moved in a year (either way) and the rule's R that year: " + (sxy / Math.sqrt(sxx * syy)).toFixed(2));
// --write: keep what the pages quote (the health check's yardstick and the proof results) in the market's replay file
if (process.argv.includes("--write")) {
  const fs = require("fs"), file = L.REPO + "/data/" + (BTC ? "btc" : "xau") + "-backtest.json", bt = JSON.parse(fs.readFileSync(file, "utf8"));
  const R3 = main.map(x => x.R), m3 = moments(R3);
  bt.proof = {
    tested: new Date().toISOString().slice(0, 10), n: m3.n, avgR: +m3.m.toFixed(3), sd: +m3.s.toFixed(3), maxDD: +S.stats(main).maxDD.toFixed(1),
    pValue: +(2 * (1 - Phi(Math.abs(m3.m / (m3.s / Math.sqrt(m3.n)))))).toFixed(3),
    randomBeat: +(beat / RUNS).toFixed(3), sideBeat: +(beat3 / RUNS).toFixed(3), timingBeat: +(beat4 / RUNS).toFixed(3), randomTimingAvgR: +L.mean(tm).toFixed(3),
    deflatedSharpe: +DSR.toFixed(3), pbo: +(below / combos.length).toFixed(3), variantsPositive: famTr.filter(v => L.mean(v.tr.map(x => x.R)) > 0).length, variants: famTr.length,
    note: "research/xau-replay/proof_check.js：随机进场按一次一笔算；deflated Sharpe 按约 50 个看过的变体算；pbo 用 CSCV、整年为块。",
  };
  fs.writeFileSync(file, JSON.stringify(bt, null, 1) + "\n"); console.log("\nwrote proof into " + file);
}
