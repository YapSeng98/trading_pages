// The gold rule on 12 futures markets, as written down in PLAN.md before this was run. usage: node fut_test.js
// Same pipeline as research/forex/fx_test.js: the page's engine reads weekly, daily, 4-hour and 1-hour candles cut in
// broker time at every hourly close; the signal is all four agreeing (onset), entered at the next hourly open, stop
// 3 x the 1-hour ATR, target 3R (or the trailing exit), one position at a time per market. Each market runs on the raw
// Yahoo series and on the roll-adjusted one; the version without the weekly trend runs alongside.
const fs = require("fs"), path = require("path");
const XR = path.join(__dirname, "../xau-replay"), L = require(XR + "/lib"), S = require(XR + "/sim");
const DATA = path.join(__dirname, "data"), C = 40, FROM = Date.UTC(2024, 8, 16) / 1000;
const ctx = L.loadEngine(L.REPO + "/assets/xau-engine.js"), TFS = ctx.XAU_TFS.filter(c => c.tf !== "15M");
ctx.xPatterns = () => []; ctx.xFvgs = () => [];                // not used by the rule; skipped for speed
const tr = v => (v === "bullish" ? 1 : v === "bearish" ? -1 : v === "unclear" || v === "mixed" ? 0 : NaN), nz = v => (typeof v === "number" && isFinite(v) ? v : NaN);
const W3 = r => (r[1] === r[2] && r[2] === r[3] && r[2] !== 0 ? r[2] : 0), C4 = r => (W3(r) && r[4] === r[2] ? r[2] : 0);
const D2 = r => (r[2] === r[3] && r[2] !== 0 ? r[2] : 0), N3 = r => (D2(r) && r[4] === r[2] ? r[2] : 0);   // no weekly
const MARKETS = [["SI", "金属", 4], ["HG", "金属", 4], ["CL", "能源", 3], ["BZ", "能源", 3], ["ES", "股指", 1], ["NQ", "股指", 1.5], ["YM", "股指", 1.5], ["RTY", "股指", 2], ["NKD", "股指", 2], ["ZN", "债券", 1], ["ZB", "债券", 1], ["ZF", "债券", 1]];
const NAMES = { SI: "白银", HG: "铜", CL: "WTI 原油", BZ: "布伦特原油", ES: "标普 500", NQ: "纳指 100", YM: "道指", RTY: "罗素 2000", NKD: "日经", ZN: "10 年美债", ZB: "30 年美债", ZF: "5 年美债", GC: "黄金期货" };
const GROUPS = ["金属", "能源", "股指", "债券"];

const median = a => { const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
// roll adjustment (PLAN.md): a jump from one close to the next open larger than 4 x the series' median bar range is
// taken out by moving every earlier price in proportion; daily rows use the daily median, hourly rows the hourly one
function adjust(rows, nDaily) {
  const medD = median(rows.slice(0, nDaily).map(r => r[2] - r[3])), medH = median(rows.slice(nDaily).map(r => r[2] - r[3]));
  const out = rows.map(r => r.slice()); let f = 1, n = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    for (let j = 1; j <= 4; j++) out[i][j] = rows[i][j] * f;
    if (i > 0 && Math.abs(rows[i][1] - rows[i - 1][4]) > 4 * (i > nDaily ? medH : medD)) { f *= rows[i][1] / rows[i - 1][4]; n++; }
  }
  return { rows: out, jumps: n };
}
function bars(rows, k) {
  const n = rows.length, B = { t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), x: new Float64Array(n).fill(1), n };
  rows.forEach((r, i) => { B.t[i] = r[0]; B.o[i] = r[1] * k; B.h[i] = r[2] * k; B.l[i] = r[3] * k; B.c[i] = r[4] * k; });
  return B;
}
// engine rows at every hourly close, as research/forex/fx_test.js
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
    const r = new Float64Array(C).fill(NaN);
    r[0] = T; r[1] = W.error ? NaN : tr(W.trend); r[2] = tr(D.trend); r[3] = tr(H4.trend); r[4] = tr(H1.trend); r[5] = r[4];
    r[8] = nz(H1.atr); r[9] = nz(D.atr); r[38] = H[i][4];
    rows.push(r);
  }
  const a = new Float64Array(rows.length * C); rows.forEach((r, i) => a.set(r, i * C));
  return { a, n: rows.length };
}
function trades(St, X, ex) {
  const base = Object.assign({ delay: -1, barSec: 3600, cooldown: 0, maxHold: 1000 }, ex), out = {};
  for (const [id, cond, regime] of [["rule", C4, W3], ["noW", N3, D2]]) {
    const sig = S.rowSignals(St, null, cond, { from: FROM, regime, onset: true });
    out[id] = { fix: S.run(sig, X, Object.assign({}, base, { stopAtr: 3, mgmt: "fix", fixR: 3 })), trail: S.run(sig, X, Object.assign({}, base, { stopAtr: 3, mgmt: "trail", trail: 2, trailEvery: 86400, regimeExit: true })) };
  }
  return out;
}
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN), f = v => (Number.isNaN(v) ? "  —  " : (v >= 0 ? "+" : "") + v.toFixed(3));
const avg = t => mean(t.map(x => x.R)), monthOf = x => { const d = new Date(x.t * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
function byMonth(t) { const m = new Map(); t.forEach(x => { const k = monthOf(x); (m.get(k) || m.set(k, []).get(k)).push(x.R); }); return m; }
// share of 4,000 month resamples in which the average is at or below 0 (one list), or a's average at or below b's (two)
function boot(a, b, seed) {
  const A = byMonth(a), Bm = b ? byMonth(b) : null, keys = [...new Set([...A.keys(), ...(Bm ? Bm.keys() : [])])], rnd = L.rng(seed); let le = 0;
  for (let it = 0; it < 4000; it++) {
    let sa = 0, na = 0, sb = 0, nb = 0;
    for (let i = 0; i < keys.length; i++) { const k = keys[(rnd() * keys.length) | 0]; for (const v of A.get(k) || []) { sa += v; na++; } if (Bm) for (const v of Bm.get(k) || []) { sb += v; nb++; } }
    if ((Bm ? sa / na - sb / nb : sa / na) <= 0) le++;
  }
  return le / 4000;
}
const line = (name, t) => name.padEnd(10) + String(t.length).padStart(4) + " trades  win " + (t.length ? (t.filter(x => x.R > 0).length / t.length * 100).toFixed(0) : "—").padStart(3) + "%  avg " + f(avg(t)) + "R  total " + f(t.reduce((s, x) => s + x.R, 0)).padStart(8) + "R";
function load(sym) {
  const H = JSON.parse(fs.readFileSync(path.join(DATA, sym + "_1h.json"))).filter(r => r[0] % 3600 === 0), Dd = JSON.parse(fs.readFileSync(path.join(DATA, sym + "_1d.json")));
  const first = H[0][0], pre = Dd.filter(r => r[0] < first), rows = pre.concat(H), px = median(H.map(r => r[4])), k = Math.pow(10, Math.max(0, Math.ceil(3 - Math.log10(px))));   // prices above 1,000: the engine rounds to cents
  return { first, rows, nDaily: pre.length, k };
}
function runMarket(sym, spread) {
  const M = load(sym), out = {};
  for (const ver of ["raw", "adj"]) {
    const A = ver === "raw" ? { rows: M.rows, jumps: 0 } : adjust(M.rows, M.nDaily), B = bars(A.rows, M.k), X = bars(A.rows.slice(M.nDaily), M.k);
    out[ver] = trades(states(B, M.first), X, { spreadBp: spread, swapRate: 0.01, swapRateShort: 0.01 }); out[ver].jumps = A.jumps;
  }
  return out;
}

const VERS = ["raw", "adj"], RULES = ["rule", "noW"], EXITS = ["fix", "trail"];
const pooled = {}, groups = {}, res = { tested: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), from: "2024-09-16", markets: {} };
VERS.forEach(v => { pooled[v] = {}; groups[v] = {}; RULES.forEach(r => { pooled[v][r] = { fix: [], trail: [] }; groups[v][r] = {}; GROUPS.forEach(g => { groups[v][r][g] = []; }); }); });
console.log("==== the gold rule on 12 futures markets, four timeframes on hourly bars, trades from 2024-09-16 ====");
for (const [sym, grp, spread] of MARKETS) {
  const R = runMarket(sym, spread), m = res.markets[sym] = { name: NAMES[sym], group: grp, spreadBp: spread, jumps: R.adj.jumps };
  for (const v of VERS) for (const r of RULES) {
    for (const e of EXITS) pooled[v][r][e].push(...R[v][r][e]);
    groups[v][r][grp].push(...R[v][r].fix);
    m[v + "_" + r] = { n: R[v][r].fix.length, avgR: +avg(R[v][r].fix).toFixed(3), trailN: R[v][r].trail.length, trailAvgR: +avg(R[v][r].trail).toFixed(3) };
  }
  console.log("  " + (sym + " " + grp).padEnd(9) + "raw " + line("", R.raw.rule.fix).trim() + "   | adj " + line("", R.adj.rule.fix).trim() + "  (" + R.adj.jumps + " jumps)");
}
res.series = {};
for (const v of VERS) {
  const P = pooled[v], grp = {}; GROUPS.forEach(g => { grp[g] = { n: groups[v].rule[g].length, avgR: +avg(groups[v].rule[g]).toFixed(3), noW: +avg(groups[v].noW[g]).toFixed(3) }; });
  const pFix = boot(P.rule.fix, null, 7), pos = GROUPS.filter(g => grp[g].avgR > 0).length, passed = avg(P.rule.fix) > 0 && pFix < 0.05 && pos >= 3;
  const s = res.series[v] = { n: P.rule.fix.length, win: +(P.rule.fix.filter(x => x.R > 0).length / P.rule.fix.length * 100).toFixed(1), avgR: +avg(P.rule.fix).toFixed(3), totalR: +P.rule.fix.reduce((a, x) => a + x.R, 0).toFixed(1), p: +pFix.toFixed(3), groupsPositive: pos, passed, groups: grp,
    trail: { n: P.rule.trail.length, avgR: +avg(P.rule.trail).toFixed(3), p: +boot(P.rule.trail, null, 7).toFixed(3) },
    noW: { n: P.noW.fix.length, avgR: +avg(P.noW.fix).toFixed(3), p: +boot(P.noW.fix, null, 7).toFixed(3), trailN: P.noW.trail.length, trailAvgR: +avg(P.noW.trail).toFixed(3), trailP: +boot(P.noW.trail, null, 7).toFixed(3),
      pBetterFix: +(1 - boot(P.noW.fix, P.rule.fix, 11)).toFixed(3), pBetterTrail: +(1 - boot(P.noW.trail, P.rule.trail, 11)).toFixed(3) } };
  console.log("\n  " + v.toUpperCase() + " · ALL 12  " + line("rule 3R", P.rule.fix).trim() + "  p " + s.p.toFixed(3) + "  groups positive " + pos + "/4 -> " + (passed ? "PASSES" : "fails"));
  console.log("              " + line("trailing", P.rule.trail).trim() + "  p " + s.trail.p.toFixed(3));
  console.log("              " + line("noW 3R", P.noW.fix).trim() + "  p " + s.noW.p.toFixed(3) + "  share of resamples noW ahead " + s.noW.pBetterFix.toFixed(3));
  console.log("              " + line("noW trail", P.noW.trail).trim() + "  p " + s.noW.trailP.toFixed(3) + "  share of resamples noW ahead " + s.noW.pBetterTrail.toFixed(3));
  console.log("              groups (rule 3R / noW 3R): " + GROUPS.map(g => g + " " + f(grp[g].avgR) + " / " + f(grp[g].noW) + " (" + grp[g].n + ")").join("  "));
}
res.verdict = res.series.raw.passed && res.series.adj.passed ? "passes" : !res.series.raw.passed && !res.series.adj.passed ? "fails" : "unclear";
console.log("\n  verdict by the pass mark written beforehand: " + res.verdict.toUpperCase());

// yardstick: gold futures the same way, spot gold's four-timeframe version and the real rule over the same dates
console.log("\n==== yardstick: gold ====");
const G = runMarket("GC", 1.5);
res.gold = {};
for (const v of VERS) { console.log("  GC " + v + "    " + line("rule 3R", G[v].rule.fix).trim() + "   | trailing " + line("", G[v].rule.trail).trim()); res.gold["futures_" + v] = { n: G[v].rule.fix.length, avgR: +avg(G[v].rule.fix).toFixed(3), trailAvgR: +avg(G[v].rule.trail).toFixed(3), noW: +avg(G[v].noW.fix).toFixed(3), noWtrail: +avg(G[v].noW.trail).toFixed(3) }; }
const Gs = L.source("duk", 2022, 2026), Gh = L.aggregate(Gs, "1H", "ny", L.spotClosed).map(k => [k[0] / 1000, k[1], k[2], k[3], k[4]]), GB = bars(Gh, 1);
const GT = trades(states(GB, GB.t[0]), GB, { spreadBp: 1.5, swapRate: 0.075 });
console.log("  spot 4TF  " + line("rule 3R", GT.rule.fix).trim() + "   | trailing " + line("", GT.rule.trail).trim() + "   (Dukascopy, data to " + new Date(GB.t[GB.n - 1] * 1000).toISOString().slice(0, 10) + ")");
const st = S.loadStates("full"), Xm = L.source("duk", 2024, 2026), C5 = r => (W3(r) && r[4] === r[2] && r[5] === r[2] ? r[2] : 0);
const real = S.run(S.rowSignals(st, Xm, C5, { from: FROM, to: Xm.t[Xm.n - 1], regime: W3, onset: true }), Xm, { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 1.5, swapRate: 0.075, stopAtr: 3, mgmt: "fix", fixR: 3 });
console.log("  real rule " + line("5TF 3R", real).trim() + "   (five timeframes, minute bars: what the gold page does)");
res.gold.spot4tf = { n: GT.rule.fix.length, avgR: +avg(GT.rule.fix).toFixed(3), trailAvgR: +avg(GT.rule.trail).toFixed(3), noW: +avg(GT.noW.fix).toFixed(3), noWtrail: +avg(GT.noW.trail).toFixed(3) };
res.gold.realRule = { n: real.length, avgR: +avg(real).toFixed(3) };
fs.writeFileSync(path.join(__dirname, "result.json"), JSON.stringify(res, null, 1) + "\n");
