// The tests written down in PLAN.md (2026-10-28, before any of them was run). usage: node world_tests.js
const fs = require("fs"), path = require("path");
const XR = path.join(__dirname, "../xau-replay"), L = require(XR + "/lib"), S = require(XR + "/sim");
const TD = path.join(__dirname, "../trend-daily/data"), WD = path.join(__dirname, "data");
const DAY = 86400, Y2010 = Date.UTC(2010, 0, 1) / 1000;
const out = {};

// ---------- data ----------
const csv = (dir, id) => fs.readFileSync(path.join(dir, id + ".csv"), "utf8").trim().split("\n").map(l => { const [d, v] = l.split(","); return [Date.parse(d + "T00:00:00Z") / 1000, +v]; }).filter(r => isFinite(r[1]));
const mIdx = t => { const d = new Date(t * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
// a monthly rate as known on day t: last month's (a month's average is only known once the month is over)
function rateSeries(...ids) {
  const m = new Map();
  for (const id of ids.reverse()) for (const [t, v] of csv(WD, id)) m.set(mIdx(t), v);     // first id wins where both exist
  const keys = [...m.keys()].sort((a, b) => a - b);
  return t => { const want = mIdx(t) - 1; let lo = 0, hi = keys.length; while (lo < hi) { const md = (lo + hi) >> 1; if (keys[md] <= want) lo = md + 1; else hi = md; } return lo ? (keys[lo - 1] >= want - 6 ? m.get(keys[lo - 1]) : null) : null; };
}
const US = rateSeries("IR3TIB01USM156N");
const CCY = [ // FRED price series, true when quoted as dollars per unit of the currency, its rate series
  ["GBP", "DEXUSUK", true, rateSeries("IR3TIB01GBM156N"), 1.5], ["JPY", "DEXJPUS", false, rateSeries("IR3TIB01JPM156N", "IRSTCI01JPM156N"), 1.5],
  ["CAD", "DEXCAUS", false, rateSeries("IR3TIB01CAM156N"), 1.5], ["CHF", "DEXSZUS", false, rateSeries("IR3TIB01CHM156N", "IRSTCI01CHM156N"), 1.5],
  ["AUD", "DEXUSAL", true, rateSeries("IR3TIB01AUM156N"), 1.5], ["NZD", "DEXUSNZ", true, rateSeries("IR3TIB01NZM156N"), 1.5],
  ["EUR", "DEXUSEU", true, rateSeries("IR3TIB01EZM156N"), 1.5], ["SEK", "DEXSDUS", false, rateSeries("IR3TIB01SEM156N"), 1.5],
  ["NOK", "DEXNOUS", false, rateSeries("IR3TIB01NOM156N"), 1.5], ["DKK", "DEXDNUS", false, rateSeries("IR3TIB01DKM156N"), 1.5],
  ["MXN", "DEXMXUS", false, rateSeries("IR3TIB01MXM156N"), 5], ["ZAR", "DEXSFUS", false, rateSeries("IR3TIB01ZAM156N"), 5], ["KRW", "DEXKOUS", false, rateSeries("IR3TIB01KRM156N"), 5],
].map(([name, id, direct, rate, cost]) => {
  const d = csv(TD, id), t = d.map(r => r[0]), n = d.length, spot = new Float64Array(n), carry = new Float64Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    spot[i] = direct ? d[i][1] / d[i - 1][1] - 1 : d[i - 1][1] / d[i][1] - 1;          // holding the currency against the dollar
    const rf = rate(t[i]), ru = US(t[i]); if (rf !== null && ru !== null) carry[i] = (rf - ru) / 100 * (t[i] - t[i - 1]) / DAY / 365;
  }
  return { name, t, spot, carry, cost, px: d.map(r => (direct ? r[1] : 1 / r[1])) };    // px: the currency's price in dollars
});

// ---------- statistics ----------
function Phi(x) { const k = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), p = d * k * (0.3193815 + k * (-0.3565638 + k * (1.781478 + k * (-1.821256 + k * 1.330274)))); return x > 0 ? 1 - p : p; }
function stats(t, R, from = 0, to = 1e12) {
  const v = []; for (let i = 0; i < R.length; i++) if (t[i] >= from && t[i] < to && !Number.isNaN(R[i])) v.push(R[i]);
  if (v.length < 120) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)), yrs = v.length / 252, sh = sd ? m / sd * Math.sqrt(252) : 0;
  let eq = 0, pk = 0, dd = 0; for (const x of v) { eq += x; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  return { sharpe: sh, p: 2 * (1 - Phi(Math.abs(sh * Math.sqrt(yrs)))), ann: m * 252, vol: sd * Math.sqrt(252), dd, yrs };
}
// weekday series: Saturday and Sunday returns (the coins) are added to Monday, so every series has about 252 days a year
const bday = tSec => { const d = Math.floor(tSec / DAY), w = new Date(d * DAY * 1000).getUTCDay(); return w === 6 ? d + 2 : w === 0 ? d + 1 : d; };
function weekdays(t, R) { const m = new Map(); for (let i = 0; i < t.length; i++) if (!Number.isNaN(R[i])) { const d = bday(t[i]); m.set(d, (m.get(d) || 0) + R[i]); } const k = [...m.keys()].sort((a, b) => a - b); return [k.map(d => d * DAY), k.map(d => m.get(d))]; }
const f2 = v => (v === null || v === undefined ? "  —  " : (v >= 0 ? " " : "") + v.toFixed(2));
const line = (name, t, R) => { const a = stats(t, R), b = stats(t, R, 0, Y2010), c = stats(t, R, Y2010); return name.padEnd(30) + (a ? "Sharpe " + f2(a.sharpe) + "  yearly " + (a.ann * 100).toFixed(1).padStart(5) + "%  vol " + (a.vol * 100).toFixed(0).padStart(3) + "%  worst fall " + (a.dd * 100).toFixed(0).padStart(3) + "%" : "") + "   before 2010 " + (b ? f2(b.sharpe) + " (p " + b.p.toFixed(3) + ")" : "      —        ") + "   from 2010 " + (c ? f2(c.sharpe) + " (p " + c.p.toFixed(3) + ")" : "—"); };

// ---------- T1: RSI(2) mean reversion on stock indices (long only, as published) ----------
function rsi2(c) { const o = new Float64Array(c.length).fill(NaN); let g = 0, l = 0; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= 2) { g += up / 2; l += dn / 2; if (i === 2) o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } else { g = (g + up) / 2; l = (l + dn) / 2; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; }
function sma(c, n) { const o = new Float64Array(c.length).fill(NaN); let s = 0; for (let i = 0; i < c.length; i++) { s += c[i]; if (i >= n) s -= c[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
function meanRev(t, c, cost, both, sized, fin = 0, stop = 0) {
  const n = c.length, r = c.map((v, i) => (i && c[i - 1] > 0 && v > 0 ? v / c[i - 1] - 1 : 0)), R = new Float64Array(n).fill(NaN);
  const rs = rsi2(c), m200 = sma(c, 200), m5 = sma(c, 5), trades = [], tradeAt = [], P = new Float64Array(n); let pos = 0, w = 1, entry = 0, inDays = 0;
  const vol = i => { let s = 0, s2 = 0; for (let k = i - 62; k <= i; k++) { s += r[k]; s2 += r[k] * r[k]; } return Math.sqrt(Math.max(s2 / 63 - (s / 63) ** 2, 1e-12)); };
  for (let i = 200; i < n; i++) {
    R[i] = pos * w * r[i] - (pos ? w * fin / 252 : 0); if (pos) inDays++;
    let next = pos;
    if (pos > 0 && (c[i] > m5[i] || (stop && c[i] <= entry * (1 - stop)))) next = 0; else if (pos < 0 && (c[i] < m5[i] || (stop && c[i] >= entry * (1 + stop)))) next = 0;
    if (next === 0 && pos === 0) { if (c[i] > m200[i] && rs[i] < 10) next = 1; else if (both && c[i] < m200[i] && rs[i] > 90) next = -1; }
    if (next !== pos) { R[i] -= cost / 10000 * w; if (pos) trades.push((c[i] / entry - 1) * pos - 2 * cost / 10000); if (pos) tradeAt.push(t[i]); if (next) { entry = c[i]; w = sized ? Math.min(4, 0.01 / vol(i)) : 1; } pos = next; }
    P[i] = pos * w;
  }
  return { R, trades, tradeAt, inMarket: inDays / (n - 200), P };
}
console.log("==== T1 Connors RSI(2) on stock indices: long only, buy below RSI 10 above the 200-day, sell above the 5-day ====");
const IDX = [["Nasdaq Composite", csv(TD, "NASDAQCOM")], ["Nasdaq 100", csv(TD, "NASDAQ100")], ["Nikkei 225", csv(WD, "NIKKEI225")]];
out.T1 = {};
for (const [name, d] of IDX) {
  const t = d.map(r => r[0]), c = d.map(r => r[1]), res = meanRev(t, c, 2, false, false), w = res.trades.filter(x => x > 0).length / res.trades.length;
  const bh = c.map((v, i) => (i >= 200 ? v / c[i - 1] - 1 : NaN));
  console.log(line(name, t, res.R) + "\n" + "".padEnd(30) + "win rate " + (w * 100).toFixed(0) + "% of " + res.trades.length + " trades, avg trade " + (res.trades.reduce((a, b) => a + b, 0) / res.trades.length * 100).toFixed(2) + "%, in the market " + (res.inMarket * 100).toFixed(0) + "% of days");
  console.log(line("  buy and hold " + name, t, bh));
  const a = stats(t, res.R, 0, Y2010), b = stats(t, res.R, Y2010);
  out.T1[name] = { win: +(w * 100).toFixed(1), trades: res.trades.length, pre: a && +a.sharpe.toFixed(2), preP: a && +a.p.toFixed(3), post: b && +b.sharpe.toFixed(2), postP: b && +b.p.toFixed(3) };
}
const c1 = out.T1["Nasdaq Composite"], pass1 = c1.pre > 0 && c1.preP < 0.05 && c1.post > 0 && c1.postP < 0.05 && out.T1["Nasdaq 100"].post > 0 && out.T1["Nikkei 225"].post > 0;
console.log("verdict T1: " + (pass1 ? "PASSES" : "FAILS")); out.T1.passed = pass1;

// ---------- T1b: the same rule both ways on other markets (information) ----------
console.log("\n==== T1b the same rule both ways, sized to 1% daily risk, on other markets (information only) ====");
const fromBars = (B, align, skip) => L.aggregate(B, "D", align, skip).map(k => [Math.floor(k[6] / 1000 / DAY) * DAY, k[4]]);   // dated by the UTC day the bar closes in
const OTHER = CCY.map(c => [c.name + "/USD", c.t.map((x, i) => [x, c.px[i]]), c.cost]).concat([["WTI oil", csv(TD, "DCOILWTICO"), 5], ["Gold", fromBars(L.source("duk", 2010, 2026), "ny", L.spotClosed), 1.5], ["BTC", fromBars(L.source("btc", 2017, 2026), "utc"), 5]]);
for (const s of ["ETHUSDT", "BNBUSDT", "SOLUSDT"]) OTHER.push([s.replace("USDT", ""), fromBars(L.source("bn15:" + s, 2017, 2026), "utc"), 5]);
let posOther = 0; const t1b = [];
for (const [name, d, cost] of OTHER) { const t = d.map(r => r[0]), c = d.map(r => r[1]), res = meanRev(t, c, cost, true, true), a = stats(...weekdays(t, res.R)); if (a && a.sharpe > 0) posOther++; t1b.push(name + " " + (a ? f2(a.sharpe).trim() : "—") + " (" + (res.trades.length ? Math.round(res.trades.filter(x => x > 0).length / res.trades.length * 100) : 0) + "% wins)"); }
console.log("  Sharpe (win rate): " + t1b.join(" · ") + "\n  positive " + posOther + " of " + OTHER.length);

// ---------- T2: currency carry ----------
console.log("\n==== T2 Currency carry, 13 currencies against the dollar, rates as known at the time ====");
const day0 = Date.UTC(1986, 0, 1) / 1000, days = [...new Set(CCY.flatMap(c => c.t.filter(x => x >= day0)))].sort((a, b) => a - b);
const at = c => { const m = new Map(); c.t.forEach((x, i) => m.set(x, i)); return m; }, IX = CCY.map(at);
function volAt(c, i) { if (i < 64) return null; let s = 0, s2 = 0; for (let k = i - 62; k <= i; k++) { s += c.spot[k]; s2 += c.spot[k] ** 2; } return Math.sqrt(Math.max(s2 / 63 - (s / 63) ** 2, 1e-12)); }
function carryStrat(kind, withCarry = true, hold = 0) {
  const R = new Float64Array(days.length).fill(NaN); let pos = CCY.map(() => 0);
  for (let d = 1; d < days.length; d++) {
    const t = days[d]; let sum = 0, cnt = 0;
    CCY.forEach((c, k) => { const i = IX[k].get(t); if (i === undefined || !pos[k]) return; const ret = c.spot[i] + (withCarry && !Number.isNaN(c.carry[i]) ? c.carry[i] : 0); sum += pos[k] * ret - Math.abs(pos[k]) * hold * (t - days[d - 1]) / DAY / 365; cnt++; });
    R[d] = kind === "xs" ? (cnt ? sum / 6 : 0) : sum / Math.max(1, CCY.filter((c, k) => IX[k].has(t) && !Number.isNaN(c.carry[IX[k].get(t)])).length);
    const monthEnd = d === days.length - 1 || mIdx(days[d + 1]) !== mIdx(t);
    if (!monthEnd) continue;
    const live = CCY.map((c, k) => { const i = IX[k].get(t); if (i === undefined || Number.isNaN(c.carry[i])) return null; const v = volAt(c, i); return v ? { k, carry: c.carry[i], w: Math.min(4, 0.01 / v) } : null; }).filter(Boolean);
    const next = CCY.map(() => 0);
    if (kind === "ts") live.forEach(x => { next[x.k] = Math.sign(x.carry) * x.w; });
    else if (live.length >= 6) { live.sort((a, b) => b.carry - a.carry); live.slice(0, 3).forEach(x => { next[x.k] = x.w; }); live.slice(-3).forEach(x => { next[x.k] = -x.w; }); }
    let cost = 0; CCY.forEach((c, k) => { cost += Math.abs(next[k] - pos[k]) * c.cost / 10000; });
    R[d] -= cost / (kind === "xs" ? 6 : Math.max(1, live.length)); pos = next;
  }
  return R;
}
out.T2 = {};
for (const [kind, name] of [["ts", "(a) time-series carry"], ["xs", "(b) cross-sectional carry 3/3"]]) {
  const R = carryStrat(kind); console.log(line(name, days, R)); const a = stats(days, R, 0, Y2010), b = stats(days, R, Y2010);
  out.T2[kind] = { pre: +a.sharpe.toFixed(2), preP: +a.p.toFixed(3), post: +b.sharpe.toFixed(2), postP: +b.p.toFixed(3), passed: a.sharpe > 0 && a.p < 0.05 && b.sharpe > 0 && b.p < 0.05, R };
  console.log("verdict T2" + kind[0] + ": " + (out.T2[kind].passed ? "PASSES" : "FAILS"));
}
const xsR = out.T2.xs.R, worstYears = []; for (let y = 1986; y <= 2026; y++) { const s = stats(days, xsR, Date.UTC(y, 0, 1) / 1000, Date.UTC(y + 1, 0, 1) / 1000); if (s) worstYears.push([y, s.ann]); }
console.log("  cross-sectional carry, worst years: " + worstYears.sort((a, b) => a[1] - b[1]).slice(0, 4).map(x => x[0] + " " + (x[1] * 100).toFixed(0) + "%").join(", ") + " (the crash risk the literature describes)");

// ---------- T3: trend on currencies, with and without carry (information) ----------
function trendRules(c, i, st) {   // the three rules of research/trend-daily on a price series, positions after day i
  const px = c.px; if (i < 252) return 0;
  const monthEnd = i === px.length - 1 || mIdx(c.t[i + 1]) !== mIdx(c.t[i]);
  if (monthEnd || st.mom === undefined) st.mom = Math.sign(px[i] / px[i - 252] - 1);
  let hi55 = -Infinity, lo55 = Infinity, hi20 = -Infinity, lo20 = Infinity;
  for (let k = i - 55; k < i; k++) { hi55 = Math.max(hi55, px[k]); lo55 = Math.min(lo55, px[k]); } for (let k = i - 20; k < i; k++) { hi20 = Math.max(hi20, px[k]); lo20 = Math.min(lo20, px[k]); }
  st.br = st.br || 0; if (st.br > 0 && px[i] < lo20) st.br = 0; else if (st.br < 0 && px[i] > hi20) st.br = 0; if (!st.br) st.br = px[i] > hi55 ? 1 : px[i] < lo55 ? -1 : 0;
  let s50 = 0, s200 = 0; for (let k = i - 49; k <= i; k++) s50 += px[k]; for (let k = i - 199; k <= i; k++) s200 += px[k];
  return (st.mom + st.br + Math.sign(s50 / 50 - s200 / 200)) / 3;
}
console.log("\n==== T3 daily trend (three rules) on the 13 currencies, spot only vs with the interest difference (information) ====");
for (const withCarry of [false, true]) {
  const R = new Float64Array(days.length).fill(NaN), sts = CCY.map(() => ({})), pos = CCY.map(() => 0), size = CCY.map(() => 0);
  for (let d = 1; d < days.length; d++) {
    const t = days[d]; let sum = 0, cnt = 0;
    CCY.forEach((c, k) => { const i = IX[k].get(t); if (i === undefined) return; if (pos[k]) { sum += pos[k] * size[k] * (c.spot[i] + (withCarry && !Number.isNaN(c.carry[i]) ? c.carry[i] : 0)); } if (i >= 252) { cnt++; const p = trendRules(c, i, sts[k]); if (p !== pos[k]) { sum -= Math.abs(p * (volAt(c, i) ? Math.min(4, 0.01 / volAt(c, i)) : 0) - pos[k] * size[k]) * c.cost / 10000; size[k] = volAt(c, i) ? Math.min(4, 0.01 / volAt(c, i)) : 0; pos[k] = p; } } });
    R[d] = cnt ? sum / cnt : NaN;
  }
  console.log(line(withCarry ? "trend + carry" : "trend, spot only", days, R)); out["T3" + (withCarry ? "c" : "s")] = R;
}

// ---------- T4: gold rule and real yields ----------
console.log("\n==== T4 the gold 4-hour rule's trades, split by the 63-day change in the 10-year real yield ====");
const st = S.loadStates("full"), X = L.source("duk", 2010, 2026);
let ready = -1; for (let i = 0; i < st.n; i++) if (!Number.isNaN(st.a[i * S.C + 1])) { ready = st.a[i * S.C]; break; }
const W3 = r => (r[1] === r[2] && r[2] === r[3] && r[2] !== 0 ? r[2] : 0), C5 = r => (W3(r) && r[4] === r[2] && r[5] === r[2] ? r[2] : 0);
const tr = S.run(S.rowSignals(st, X, C5, { from: Math.max(ready, X.t[0]), to: Math.min(st.a[(st.n - 1) * S.C], X.t[X.n - 1]), regime: W3, onset: true }), X, { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 1.5, swapRate: 0.075, stopAtr: 3, mgmt: "fix", fixR: 3 });
const ry = csv(WD, "DFII10"), ryT = ry.map(r => r[0]);
const ryAt = t => { let lo = 0, hi = ryT.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ryT[m] < t - DAY) lo = m + 1; else hi = m; } return lo; };   // the last value known the day before
const SEG = [["2011-18", 0, Date.UTC(2019, 0, 1) / 1000], ["2019-23", Date.UTC(2019, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["2024-26", Date.UTC(2024, 0, 1) / 1000, 1e12]];
const tag = tr.map(x => { const i = ryAt(x.t) - 1; const ch = i >= 63 ? ry[i][1] - ry[i - 63][1] : 0; return { R: x.R, t: x.t, agree: (x.dir > 0 && ch < 0) || (x.dir < 0 && ch > 0) }; });
const avg = a => (a.length ? a.reduce((s, x) => s + x.R, 0) / a.length : NaN);
const cells = SEG.map(([g, a, b]) => { const q = tag.filter(x => x.t >= a && x.t < b); return [g, avg(q.filter(x => x.agree)), avg(q.filter(x => !x.agree)), q.filter(x => x.agree).length, q.length]; });
cells.forEach(c => console.log("  " + c[0] + ": agreeing with real yields " + f2(c[1]) + "R (" + c[3] + " trades) · against " + f2(c[2]) + "R (" + (c[4] - c[3]) + ")"));
const pass4 = cells.every(c => c[1] > c[2]); console.log("verdict T4: " + (pass4 ? "PASSES" : "FAILS")); out.T4 = { passed: pass4, cells: cells.map(c => ({ seg: c[0], agree: +c[1].toFixed(3), against: +c[2].toFixed(3) })) };

// ---------- T5: a portfolio of different strategies ----------
console.log("\n==== T5 equal-risk mix: daily trend on all markets + cross-sectional carry + Nasdaq mean reversion ====");
// (a) the daily trend portfolio, the three rules together, on the markets of research/trend-daily
const TMK = ["DEXUSUK", "DEXJPUS", "DEXCAUS", "DEXSZUS", "DEXUSAL", "DEXUSNZ", "DEXUSEU", "DEXSDUS", "DEXNOUS", "DEXDNUS", "DEXSIUS", "DEXMAUS", "DEXKOUS", "DEXMXUS", "DEXINUS", "DEXTHUS", "DEXSFUS", "DCOILWTICO", "DCOILBRENTEU", "DHHNGSP", "NASDAQCOM", "NASDAQ100"].map(id => ({ d: csv(TD, id), cost: /DEX(US|JP|CA|SZ|SD|NO|DN)/.test(id) ? 1.5 : /NASDAQ/.test(id) ? 2 : 5 }))
  .concat([{ d: fromBars(L.source("duk", 2010, 2026), "ny", L.spotClosed), cost: 1.5 }, { d: fromBars(L.source("btc", 2017, 2026), "utc"), cost: 5 }]);
function trendPort(hold = 0) {
const byDay = new Map();
TMK.forEach((m, mi) => {
  const c = { t: m.d.map(r => r[0]), px: m.d.map(r => r[1]) }, n = c.t.length, rr = c.px.map((v, i) => (i && c.px[i - 1] > 0 && v > 0 ? v / c.px[i - 1] - 1 : 0)), stt = {};
  let pos = 0, size = 0;
  for (let i = 253; i < n; i++) {
    let s = 0, s2 = 0; for (let k = i - 62; k <= i; k++) { s += rr[k]; s2 += rr[k] ** 2; } const vv = Math.sqrt(Math.max(s2 / 63 - (s / 63) ** 2, 1e-12));
    let ret = pos * size * rr[i] - Math.abs(pos * size) * hold * (c.t[i] - c.t[i - 1]) / DAY / 365; const p = trendRules(c, i, stt); if (p !== pos) { const ns = Math.min(4, 0.01 / vv); ret -= Math.abs(p * ns - pos * size) * m.cost / 10000; pos = p; size = ns; }
    const dk = bday(c.t[i]), e = byDay.get(dk) || new Map(); e.set(mi, (e.get(mi) || 0) + ret); byDay.set(dk, e);
  }
});
const tKeys = [...byDay.keys()].sort((a, b) => a - b);
return [tKeys.map(k => k * DAY), tKeys.map(k => { const e = byDay.get(k); let s = 0; for (const v of e.values()) s += v; return s / e.size; })];
}
const [trendT, trendR] = trendPort();
// (b) cross-sectional carry and (c) Nasdaq Composite mean reversion, on their own days
const nq = csv(TD, "NASDAQCOM"), nqT = nq.map(r => r[0]), nqR = meanRev(nqT, nq.map(r => r[1]), 2, false, false).R;
const series = [["trend", trendT, trendR], ["carry", days, xsR], ["Nasdaq mean reversion", nqT, Array.from(nqR)]];
const scaled = series.map(([name, t, R]) => { const s = stats(t, R); const k = s ? 0.10 / s.vol : 0; const m = new Map(); t.forEach((x, i) => { if (!Number.isNaN(R[i])) m.set(Math.floor(x / DAY), R[i] * k); }); return { name, m, s }; });
console.log("  each on its own (all years): " + scaled.map(x => x.name + " Sharpe " + f2(x.s.sharpe).trim()).join(" · "));
// correlation of daily returns on shared days
const corr = (a, b) => { const k = [...a.m.keys()].filter(x => b.m.has(x)); const xa = k.map(x => a.m.get(x)), xb = k.map(x => b.m.get(x)); const ma = xa.reduce((s, v) => s + v, 0) / k.length, mb = xb.reduce((s, v) => s + v, 0) / k.length; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < k.length; i++) { sab += (xa[i] - ma) * (xb[i] - mb); saa += (xa[i] - ma) ** 2; sbb += (xb[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb); };
console.log("  correlations: trend-carry " + corr(scaled[0], scaled[1]).toFixed(2) + " · trend-Nasdaq MR " + corr(scaled[0], scaled[2]).toFixed(2) + " · carry-Nasdaq MR " + corr(scaled[1], scaled[2]).toFixed(2));
const allDays = [...new Set(scaled.flatMap(x => [...x.m.keys()]))].filter(k => k * DAY >= day0).sort((a, b) => a - b);
const mixT = allDays.map(k => k * DAY), mixR = allDays.map(k => { let s = 0, n = 0; scaled.forEach(x => { if (x.m.has(k)) { s += x.m.get(k); n++; } }); return n ? s / n : NaN; });
console.log(line("the mix (from 1986)", mixT, mixR));
const singlesPost = scaled.map(x => { const t = [...x.m.keys()].sort((a, b) => a - b); return stats(t.map(k => k * DAY), t.map(k => x.m.get(k)), Y2010); });
const mixPost = stats(mixT, mixR, Y2010), bestSingle = Math.max(...singlesPost.map(s => (s ? s.sharpe : -9)));
console.log("  from 2010: singles " + singlesPost.map((s, i) => scaled[i].name + " " + (s ? f2(s.sharpe).trim() : "—")).join(" · ") + "  ->  mix " + f2(mixPost.sharpe).trim() + " (p " + mixPost.p.toFixed(3) + ")");
const pass5 = mixPost.sharpe > bestSingle && mixPost.p < 0.05; console.log("verdict T5: " + (pass5 ? "PASSES" : "FAILS"));
const yrs = []; for (let y = 2010; y <= 2026; y++) { const s = stats(mixT, mixR, Date.UTC(y, 0, 1) / 1000, Date.UTC(y + 1, 0, 1) / 1000); if (s) yrs.push(y + " " + (s.ann * 100).toFixed(0) + "%"); }
console.log("  the mix each year since 2010 (at about 6% yearly risk): " + yrs.join("  "));
out.T5 = { passed: pass5, mixPost: +mixPost.sharpe.toFixed(2), mixPostP: +mixPost.p.toFixed(3), singlesPost: singlesPost.map((s, i) => ({ name: scaled[i].name, post: s ? +s.sharpe.toFixed(2) : null })), corr: { trendCarry: +corr(scaled[0], scaled[1]).toFixed(2), trendMR: +corr(scaled[0], scaled[2]).toFixed(2), carryMR: +corr(scaled[1], scaled[2]).toFixed(2) }, mixAll: +stats(mixT, mixR).sharpe.toFixed(2) };
// ---------- T5 checks: decided AFTER T1-T5 were run, so information only ----------
console.log("\n==== T5 checks (decided after seeing T5: information only) ====");
function mixOf(legs, pastOnly) {   // legs [name, t, R]: each scaled to 10% yearly risk, then averaged on each weekday
  const maps = legs.map(([, t, R]) => {
    const ks = [], vs = []; for (let i = 0; i < t.length; i++) if (!Number.isNaN(R[i])) { ks.push(Math.floor(t[i] / DAY)); vs.push(R[i]); }
    const m = new Map();
    if (!pastOnly) { const k = 0.10 / stats(ks.map(d => d * DAY), vs).vol; ks.forEach((d, i) => m.set(d, vs[i] * k)); }
    else { let s1 = 0, s2 = 0; for (let i = 0; i < ks.length; i++) { if (i >= 504) m.set(ks[i], vs[i] * 0.10 / Math.sqrt(Math.max(s2 / i - (s1 / i) ** 2, 1e-12) * 252)); s1 += vs[i]; s2 += vs[i] ** 2; } }   // risk measured on all days before, at least two years
    return m;
  });
  const ds = [...new Set(maps.flatMap(m => [...m.keys()]))].filter(d => d * DAY >= day0).sort((a, b) => a - b);
  return [ds.map(d => d * DAY), ds.map(d => { let s = 0, n = 0; for (const m of maps) if (m.has(d)) { s += m.get(d); n++; } return n ? s / n : NaN; })];
}
const worstAt = (T, R) => { let eq = 0, pk = 0, d = 0, a = 0, b = 0, cp = 0; for (let i = 0; i < T.length; i++) { if (Number.isNaN(R[i])) continue; eq += R[i]; if (eq > pk) { pk = eq; cp = T[i]; } if (pk - eq > d) { d = pk - eq; a = cp; b = T[i]; } } return new Date(a * 1000).toISOString().slice(0, 7) + " to " + new Date(b * 1000).toISOString().slice(0, 7); };
const nq100 = csv(TD, "NASDAQ100"), nq100T = nq100.map(r => r[0]);
const legTrend = ["trend", trendT, trendR], legCarry = ["carry", days, Array.from(xsR)], legNq = ["Nasdaq MR", nqT, Array.from(nqR)];
const CHECKS = [
  ["as tested", [legTrend, legCarry, legNq], false],
  ["risk measured from the past only", [legTrend, legCarry, legNq], true],
  ["without the Nasdaq part", [legTrend, legCarry], false],
  ["Nasdaq 100 instead of Composite", [legTrend, legCarry, ["Nasdaq 100 MR", nq100T, Array.from(meanRev(nq100T, nq100.map(r => r[1]), 2, false, false).R)]], false],
  ["trend and carry pay 1%/yr on positions held", [["trend", ...trendPort(0.01)], ["carry", days, Array.from(carryStrat("xs", true, 0.01))], legNq], false],
  ["Nasdaq part pays 5%/yr financing", [legTrend, legCarry, ["Nasdaq MR fin", nqT, Array.from(meanRev(nqT, nq.map(r => r[1]), 2, false, false, 0.05).R)]], false],
];
out.T5checks = {};
{ const tH = trendPort(0.01), cH = carryStrat("xs", true, 0.01), a = stats(tH[0], tH[1], Y2010), b = stats(days, cH, Y2010); console.log("  with 1%/yr on positions held, from 2010 alone: trend " + f2(a.sharpe).trim() + " · carry " + f2(b.sharpe).trim() + " · Nasdaq MR (no such cost) " + f2(stats(nqT, nqR, Y2010).sharpe).trim()); out.T5checks.holdAlone = { trend: +a.sharpe.toFixed(2), carry: +b.sharpe.toFixed(2) }; }
for (const [name, legs, past] of CHECKS) { const [T, R] = mixOf(legs, past); console.log(line(name, T, R) + "   worst fall " + worstAt(T, R)); const a = stats(T, R, 0, Y2010), b = stats(T, R, Y2010); out.T5checks[name] = { pre: +a.sharpe.toFixed(2), post: +b.sharpe.toFixed(2), postP: +b.p.toFixed(3) }; }
// the Nasdaq dip-buy done a day late (decided at the US close, bought or sold at the next close), as from Singapore
for (const [name, d] of [["Nasdaq Composite", nq], ["Nasdaq 100", nq100]]) {
  const t = d.map(r => r[0]), c = d.map(r => r[1]), res = meanRev(t, c, 2, false, false), n = c.length, RL = new Float64Array(n).fill(NaN);
  for (let i = 202; i < n; i++) RL[i] = res.P[i - 2] * (c[i] / c[i - 1] - 1) - Math.abs(res.P[i - 1] - res.P[i - 2]) * 2 / 10000;
  console.log(line("  " + name + " one day late", t, RL)); const b = stats(t, RL, Y2010); out.T5checks["late " + name] = +b.sharpe.toFixed(2);
}
// the gold 4-hour rule as a fourth part: its trades booked in the month they close, at a fixed risk per trade
{
  const mon = t => mIdx(t), gm = new Map(); for (const x of tr) gm.set(mon(x.exitT), (gm.get(mon(x.exitT)) || 0) + x.R);
  const m0 = mon(tr[0].t), m1 = mon(tr[tr.length - 1].exitT), months = []; for (let m = m0; m <= m1; m++) months.push(m);
  const legM = legs => legs.map(([, t, R]) => { const k = 0.10 / stats(t, R).vol, mm = new Map(); for (let i = 0; i < t.length; i++) if (!Number.isNaN(R[i])) mm.set(mon(t[i]), (mm.get(mon(t[i])) || 0) + R[i] * k); return months.map(m => mm.get(m) || 0); });
  const [mT, mC, mN] = legM([legTrend, legCarry, legNq]), g0 = months.map(m => gm.get(m) || 0);
  const msd = a => { const mu = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / (a.length - 1)); };
  const gk = 0.10 / (msd(g0) * Math.sqrt(12)), mG = g0.map(v => v * gk);
  const shM = a => { const mu = a.reduce((x, y) => x + y, 0) / a.length; return mu / msd(a) * Math.sqrt(12); };
  const cM = (a, b) => { const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length; let s = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb); };
  const mix3 = months.map((_, i) => (mT[i] + mC[i] + mN[i]) / 3), mix4 = months.map((_, i) => (mT[i] + mC[i] + mN[i] + mG[i]) / 4);
  const y0 = new Date(Date.UTC(Math.floor(m0 / 12), m0 % 12, 1)).toISOString().slice(0, 7);
  console.log("  gold 4-hour rule as a 4th part (monthly, from " + y0 + "): gold rule alone Sharpe " + f2(shM(mG)).trim() + " · the three-part mix " + f2(shM(mix3)).trim() + " · mix with the gold rule " + f2(shM(mix4)).trim());
  console.log("  monthly correlation of the gold rule with: trend " + cM(mG, mT).toFixed(2) + " · carry " + cM(mG, mC).toFixed(2) + " · Nasdaq MR " + cM(mG, mN).toFixed(2) + " · the mix " + cM(mG, mix3).toFixed(2));
  out.T5checks.gold4th = { from: y0, goldAlone: +shM(mG).toFixed(2), mix3: +shM(mix3).toFixed(2), mix4: +shM(mix4).toFixed(2), corrTrend: +cM(mG, mT).toFixed(2), corrMix: +cM(mG, mix3).toFixed(2) };
}
// ---------- the mix the 分散组合 page shows (information only): gold 4-hour rule + daily trend + Nasdaq 100 dip-buying ----------
// The trend part is the page's own market list as far as the data here goes (12 currencies, gold, WTI, Brent, Nasdaq 100,
// Bitcoin, Ethereum: 18 of the page's 19, no silver), each market sized like trend.html and the account holding all of
// them. Sizing factors: how much one year swings the account, per unit of each part's own risk setting.
{
  const PAGE = ["DEXUSEU", "DEXUSUK", "DEXJPUS", "DEXUSAL", "DEXUSNZ", "DEXCAUS", "DEXSZUS", "DEXSDUS", "DEXNOUS", "DEXMXUS", "DEXSFUS", "DEXSIUS", "DCOILWTICO", "DCOILBRENTEU", "NASDAQ100"]
    .map(id => ({ d: csv(TD, id), cost: /DEX(US|JP|CA|SZ|SD|NO)/.test(id) ? 1.5 : /NASDAQ/.test(id) ? 2 : 5 }))
    .concat([{ d: fromBars(L.source("duk", 2010, 2026), "ny", L.spotClosed), cost: 1.5 }, { d: fromBars(L.source("btc", 2017, 2026), "utc"), cost: 5 }, { d: fromBars(L.source("bn15:ETHUSDT", 2017, 2026), "utc"), cost: 5 }]);
  const acc = new Map();   // the account's trend P&L per weekday at 1% daily risk per market: the SUM over markets
  for (const m of PAGE) {
    const c = { t: m.d.map(r => r[0]), px: m.d.map(r => r[1]) }, n = c.t.length, rr = c.px.map((v, i) => (i && c.px[i - 1] > 0 && v > 0 ? v / c.px[i - 1] - 1 : 0)), stt = {};
    let pos = 0, size = 0;
    for (let i = 253; i < n; i++) {
      let a = 0, a2 = 0; for (let k = i - 62; k <= i; k++) { a += rr[k]; a2 += rr[k] ** 2; } const vv = Math.sqrt(Math.max(a2 / 63 - (a / 63) ** 2, 1e-12));
      let ret = pos * size * rr[i]; const p = trendRules(c, i, stt); if (p !== pos) { const ns = Math.min(4, 0.01 / vv); ret -= Math.abs(p * ns - pos * size) * m.cost / 10000; pos = p; size = ns; }
      const dk = bday(c.t[i]); acc.set(dk, (acc.get(dk) || 0) + ret);
    }
  }
  const aT = [...acc.keys()].sort((a, b) => a - b), aR = aT.map(k => acc.get(k)), aTs = aT.map(k => k * DAY);
  const ndx = meanRev(nq100T, nq100.map(r => r[1]), 2, false, false);
  const mon = t => mIdx(t), m0 = mIdx(Date.UTC(2011, 1, 1) / 1000), m1 = mIdx(tr[tr.length - 1].exitT), months = []; for (let m = m0; m <= m1; m++) months.push(m);
  const byMonth = (t, R) => { const mm = new Map(); for (let i = 0; i < t.length; i++) if (!Number.isNaN(R[i])) mm.set(mon(t[i]), (mm.get(mon(t[i])) || 0) + R[i]); return months.map(m => mm.get(m) || 0); };
  const gR = new Map(); for (const x of tr) gR.set(mon(x.exitT), (gR.get(mon(x.exitT)) || 0) + x.R * 0.01);   // 1% of the account per R
  const G = months.map(m => gR.get(m) || 0), T = byMonth(aTs, aR), N = byMonth(nq100T, ndx.R);
  const mu = a => a.reduce((x, y) => x + y, 0) / a.length, sd = a => { const m = mu(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
  const sh = a => mu(a) / sd(a) * Math.sqrt(12), cor = (a, b) => { const ma = mu(a), mb = mu(b); let s = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb); };
  const vG = sd(G) * Math.sqrt(12), vT = sd(T) * Math.sqrt(12), vN = sd(N) * Math.sqrt(12);   // yearly swing of the account per unit setting
  // every series at the same 10% yearly swing, so falls and years compare like for like
  const at10 = a => { const k = 0.10 / (sd(a) * Math.sqrt(12)); return a.map(v => v * k); }, G10 = at10(G), T10 = at10(T), N10 = at10(N);
  const pair = at10(months.map((_, i) => G10[i] + N10[i])), three = at10(months.map((_, i) => G10[i] + T10[i] + N10[i]));
  const fall = a => { let e = 0, p = 0, d = 0; for (const x of a) { e += x; p = Math.max(p, e); d = Math.max(d, p - e); } return d; };
  const years = a => { const y = {}; months.forEach((m, i) => { const k = Math.floor(m / 12); y[k] = (y[k] || 0) + a[i]; }); return y; };
  const card = a => { const y = Object.values(years(a)); return { sharpe: +sh(a).toFixed(2), worstFall: +(fall(a) * 100).toFixed(0), worstYear: +(Math.min(...y) * 100).toFixed(0), losingYears: y.filter(v => v < 0).length, years: y.length }; };
  const C = { gold: card(G10), trend: card(T10), ndx: card(N10), goldNdx: card(pair), all3: card(three) };
  console.log("\n==== the 分散组合 page's parts: gold 4-hour rule, daily trend (18 of its 19 markets), Nasdaq 100 dip-buying; monthly from 2011-02, all at the same 10% yearly swing (information only) ====");
  for (const [k, name] of [["gold", "gold rule"], ["trend", "daily trend"], ["ndx", "Nasdaq 100 dip-buying"], ["goldNdx", "gold + Nasdaq (chosen after seeing these)"], ["all3", "all three"]]) console.log("  " + name.padEnd(42) + "Sharpe " + f2(C[k].sharpe) + "  worst fall " + String(C[k].worstFall).padStart(3) + "%  worst year " + String(C[k].worstYear).padStart(4) + "%  losing years " + C[k].losingYears + "/" + C[k].years);
  console.log("  correlations: gold-trend " + cor(G, T).toFixed(2) + " · gold-Nasdaq " + cor(G, N).toFixed(2) + " · trend-Nasdaq " + cor(T, N).toFixed(2));
  console.log("  one year swings the account by: gold rule " + (vG * 100).toFixed(1) + "% per 1% risk a trade · trend " + (vT * 100).toFixed(1) + "% per 1%/day risk a market (18 markets) · Nasdaq dip-buying " + (vN * 100).toFixed(1) + "% per 1x the account bought");
  // trend.html's account: all markets held together, at 1% daily risk per market, from 2011 (daily, so a bad day shows)
  const dv = aR.filter((_, i) => aTs[i] >= Date.UTC(2011, 0, 1) / 1000), dsd = Math.sqrt(dv.reduce((x, y) => x + y * y, 0) / dv.length - (mu(dv)) ** 2);
  let de = 0, dp = 0, dd = 0; for (const x of dv) { de += x; dp = Math.max(dp, de); dd = Math.max(dd, dp - de); }
  const trendAcct = { daySwingPer1pct: +(dsd * 100).toFixed(1), yearSwingPer1pct: +(dsd * Math.sqrt(252) * 100).toFixed(1), worstFallPer1pct: +(dd * 100).toFixed(0), worstDayPer1pct: +(Math.min(...dv) * 100).toFixed(1) };
  console.log("  trend.html's account per 1%/day risk a market, from 2011: " + trendAcct.daySwingPer1pct + "% a day, " + trendAcct.yearSwingPer1pct + "% a year, worst day " + trendAcct.worstDayPer1pct + "%, worst fall " + trendAcct.worstFallPer1pct + "%");
  const yg = years(G10), yn = years(N10), yp = years(pair);
  console.log("  by year (gold / Nasdaq / both): " + Object.keys(yg).map(y => y + " " + Math.round(yg[y] * 100) + "/" + Math.round(yn[y] * 100) + "/" + Math.round(yp[y] * 100)).join("  "));
  out.pageMix = { from: "2011-02", note: "information only: decided after T1-T5; the gold + Nasdaq pair was picked after seeing these numbers", swingAt: 10, parts: C,
    corr: { goldTrend: +cor(G, T).toFixed(2), goldNdx: +cor(G, N).toFixed(2), trendNdx: +cor(T, N).toFixed(2) },
    byYear: Object.keys(yg).map(y => ({ y: +y, gold: +(yg[y] * 100).toFixed(1), ndx: +(yn[y] * 100).toFixed(1), both: +(yp[y] * 100).toFixed(1) })),
    swing: { goldPer1pctTrade: +(vG * 100).toFixed(2), trendPer1pctDay: +(vT * 100).toFixed(2), ndxPer1x: +(vN * 100).toFixed(2) }, trendAcct };
}
// ---------- the Nasdaq 100 dip-buy's tail (information only): its worst trades, and a protective stop on the close ----------
{
  const t = nq100T, c = nq100.map(r => r[1]), base = meanRev(t, c, 2, false, false), Yd = x => new Date(x * 1000).toISOString().slice(0, 7);
  const worst = base.trades.map((r, i) => ({ r, t: base.tradeAt[i] })).sort((a, b) => a.r - b.r).slice(0, 4);
  console.log("\n==== Nasdaq 100 dip-buying: worst trades and a stop on the close (information only) ====\n  worst trades (month closed): " + worst.map(x => Yd(x.t) + " " + (x.r * 100).toFixed(1) + "%").join(" · "));
  out.ndxRisk = { worst: worst.map(x => ({ month: Yd(x.t), pct: +(x.r * 100).toFixed(1) })), stops: {} };
  for (const st of [0, 0.08, 0.10]) { const r = meanRev(t, c, 2, false, false, 0, st), a = stats(t, r.R, 0, Y2010), b = stats(t, r.R, Y2010), w = Math.min(...r.trades);
    console.log("  " + (st ? "stop " + st * 100 + "% on a close" : "no stop (the rule)").padEnd(22) + "before 2010 " + f2(a.sharpe) + " · from 2010 " + f2(b.sharpe) + " · worst trade " + (w * 100).toFixed(1) + "%");
    out.ndxRisk.stops[st ? st * 100 + "%" : "none"] = { pre: +a.sharpe.toFixed(2), post: +b.sharpe.toFixed(2), worst: +(w * 100).toFixed(1) }; }
  const all = base.trades, wins = all.filter(x => x > 0), loss = all.filter(x => x <= 0);
  out.ndxRisk.trades = { n: all.length, winPct: +(wins.length / all.length * 100).toFixed(0), avgWin: +(wins.reduce((a, b) => a + b, 0) / wins.length * 100).toFixed(2), avgLoss: +(loss.reduce((a, b) => a + b, 0) / loss.length * 100).toFixed(2) };
  console.log("  " + all.length + " trades, " + out.ndxRisk.trades.winPct + "% wins, average win " + out.ndxRisk.trades.avgWin + "%, average loss " + out.ndxRisk.trades.avgLoss + "%");
}
delete out.T2.ts.R; delete out.T2.xs.R; delete out.T3s; delete out.T3c;
fs.writeFileSync(path.join(__dirname, "result.json"), JSON.stringify({ tested: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), out }, null, 1) + "\n");
