// Daily trend-following on 55 years of markets. Written down on 2026-10-27 BEFORE any result was seen.
//   strategies (textbook settings, nothing tuned):
//     TSMOM   12-month time-series momentum: at each month's last close hold the side of the last 252 days' return
//     DONCH   55/20 breakout on closes (Turtle system 2): enter on a 55-day high / low, leave on a 20-day low / high
//     MAX     50/200-day moving averages: the side of the 50-day against the 200-day
//   sizing  each position sized to 1% daily volatility (63-day standard deviation), capped at 4x; size set when a
//           position is opened (TSMOM: at each month end), so costs are only paid when it changes
//   costs   per unit of position changed: 1.5 bp major currencies and gold, 5 bp emerging currencies, oil, gas and
//           crypto, 2 bp stock indices. Currency carry (interest differences) is NOT included: a known gap.
//   markets FRED daily closes (fetch_fred.py): 17 currencies against the US dollar, WTI, Brent, US gas, Nasdaq
//           Composite and Nasdaq 100; plus spot gold 2010-2026 and Bitcoin and 7 coins (research/xau-replay data)
//   success the equal-risk portfolio of all markets earns a positive Sharpe with p < 0.05 BOTH before 2010 AND from
//           2010 (after these ideas were published), AND at least 60% of markets are positive over their history.
// usage: node trend_daily.js
const fs = require("fs"), path = require("path");
const XR = path.join(__dirname, "../xau-replay"), L = require(XR + "/lib");
const DATA = path.join(__dirname, "data");
const DAY = 86400;

// ---------- markets: daily closes [tSec, close] ----------
const FRED = { DEXUSUK: ["GBP/USD", 1.5], DEXJPUS: ["USD/JPY", 1.5], DEXCAUS: ["USD/CAD", 1.5], DEXSZUS: ["USD/CHF", 1.5], DEXUSAL: ["AUD/USD", 1.5], DEXUSNZ: ["NZD/USD", 1.5], DEXUSEU: ["EUR/USD", 1.5],
  DEXSDUS: ["USD/SEK", 1.5], DEXNOUS: ["USD/NOK", 1.5], DEXDNUS: ["USD/DKK", 1.5], DEXSIUS: ["USD/SGD", 5], DEXMAUS: ["USD/MYR", 5], DEXKOUS: ["USD/KRW", 5], DEXMXUS: ["USD/MXN", 5], DEXINUS: ["USD/INR", 5],
  DEXTHUS: ["USD/THB", 5], DEXSFUS: ["USD/ZAR", 5], DCOILWTICO: ["WTI oil", 5], DCOILBRENTEU: ["Brent oil", 5], DHHNGSP: ["US gas", 5], NASDAQCOM: ["Nasdaq Comp", 2], NASDAQ100: ["Nasdaq 100", 2] };
const markets = [];
for (const [id, [name, cost]] of Object.entries(FRED)) {
  const rows = fs.readFileSync(path.join(DATA, id + ".csv"), "utf8").trim().split("\n").map(l => { const [d, v] = l.split(","); return [Date.parse(d + "T00:00:00Z") / 1000, +v]; }).filter(r => isFinite(r[1]));
  markets.push({ name, cost, kind: /DEX/.test(id) ? "fx" : /NASDAQ/.test(id) ? "index" : "commodity", d: rows });
}
// each daily bar is dated by the UTC day it closes in (gold closes 17:00 New York, the coins at midnight UTC)
const fromBars = (B, align, skip) => L.aggregate(B, "D", align, skip).map(k => [Math.floor(k[6] / 1000 / DAY) * DAY, k[4]]);
// the portfolio averages markets by weekday: the coins' Saturday and Sunday returns are added to their Monday
const bday = tSec => { const d = Math.floor(tSec / DAY), w = new Date(d * DAY * 1000).getUTCDay(); return w === 6 ? d + 2 : w === 0 ? d + 1 : d; };
markets.push({ name: "Gold", cost: 1.5, kind: "gold", d: fromBars(L.source("duk", 2010, 2026), "ny", L.spotClosed) });
markets.push({ name: "BTC", cost: 5, kind: "crypto", d: fromBars(L.source("btc", 2017, 2026), "utc") });
for (const s of ["ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "SOLUSDT"]) markets.push({ name: s.replace("USDT", ""), cost: 5, kind: "crypto", d: fromBars(L.source("bn15:" + s, 2017, 2026), "utc") });

// ---------- strategies: position (−1, 0, 1) times size, decided at each close ----------
function run(m, strat) {
  const t = m.d.map(r => r[0]), c = m.d.map(r => r[1]), n = c.length, r = new Float64Array(n);
  for (let i = 1; i < n; i++) r[i] = c[i] > 0 && c[i - 1] > 0 ? c[i] / c[i - 1] - 1 : 0;   // negative oil prices (2020): no return that day
  const vol = new Float64Array(n);
  for (let i = 63; i < n; i++) { let s = 0, s2 = 0; for (let k = i - 62; k <= i; k++) { s += r[k]; s2 += r[k] * r[k]; } const v = s2 / 63 - (s / 63) ** 2; vol[i] = Math.sqrt(Math.max(v, 0)); }
  const size = i => (vol[i] > 0 ? Math.min(4, 0.01 / vol[i]) : 0);
  const pos = new Float64Array(n); let cur = 0, side = 0, sma50 = 0, sma200 = 0;
  for (let i = 0; i < n; i++) {
    if (strat === "MAX") { sma50 += c[i] - (i >= 50 ? c[i - 50] : 0); sma200 += c[i] - (i >= 200 ? c[i - 200] : 0); }
    if (i < 252) { pos[i] = 0; continue; }
    if (strat === "TSMOM") {
      const monthEnd = i === n - 1 || new Date(t[i + 1] * 1000).getUTCMonth() !== new Date(t[i] * 1000).getUTCMonth();
      if (monthEnd) { const s = c[i - 252] > 0 && c[i] > 0 ? Math.sign(c[i] / c[i - 252] - 1) : 0; cur = s * size(i); }
    } else if (strat === "DONCH") {
      let hi55 = -Infinity, lo55 = Infinity, hi20 = -Infinity, lo20 = Infinity;
      for (let k = i - 55; k < i; k++) { hi55 = Math.max(hi55, c[k]); lo55 = Math.min(lo55, c[k]); }
      for (let k = i - 20; k < i; k++) { hi20 = Math.max(hi20, c[k]); lo20 = Math.min(lo20, c[k]); }
      if (side > 0 && c[i] < lo20) side = 0; else if (side < 0 && c[i] > hi20) side = 0;
      if (side === 0) { if (c[i] > hi55) { side = 1; cur = size(i); } else if (c[i] < lo55) { side = -1; cur = -size(i); } else cur = 0; }
    } else if (strat === "MAX") {
      const s = Math.sign(sma50 / 50 - sma200 / 200);
      if (s !== side) { side = s; cur = s * size(i); }
    }
    pos[i] = cur;
  }
  // daily strategy returns: yesterday's position on today's move, less the cost of today's change
  const R = new Float64Array(n).fill(NaN), trades = []; let open = null;   // NaN until the strategy can trade; flat days count as 0
  for (let i = 1; i < n; i++) {
    if (i <= 252) continue;
    R[i] = pos[i - 1] * r[i] - Math.abs(pos[i] - pos[i - 1]) * m.cost / 10000;
    if (open) open.pnl += R[i];
    if (Math.sign(pos[i]) !== Math.sign(pos[i - 1])) { if (open) trades.push(open.pnl); open = pos[i] !== 0 ? { pnl: 0 } : null; }
  }
  return { t, R, trades };
}
// ---------- statistics ----------
const stats = (R, from = 0, to = 1e12, t) => {
  const v = []; for (let i = 0; i < R.length; i++) if ((!t || (t[i] >= from && t[i] < to)) && !Number.isNaN(R[i])) v.push(R[i]);
  if (v.length < 60) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)), yrs = v.length / 252;
  const sharpe = m / sd * Math.sqrt(252), tStat = sharpe * Math.sqrt(yrs);
  let eq = 0, pk = 0, dd = 0; for (const x of v) { eq += x; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  return { sharpe, t: tStat, p: 2 * (1 - Phi(Math.abs(tStat))), ann: m * 252, dd, yrs };
};
function Phi(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
const Y2010 = Date.UTC(2010, 0, 1) / 1000;
const out = {};
for (const strat of ["TSMOM", "DONCH", "MAX"]) {
  console.log("\n==== " + { TSMOM: "12-month momentum (monthly)", DONCH: "55/20-day breakout", MAX: "50/200-day moving averages" }[strat] + " ====");
  console.log("market".padEnd(13) + "from  years  Sharpe   t     yearly(vol units)  worst fall   trades  win%   before 2010   from 2010");
  const runs = markets.map(m => ({ m, res: run(m, strat) }));
  let pos = 0;
  for (const { m, res } of runs) {
    const s = stats(res.R), a = stats(res.R, 0, Y2010, res.t), b = stats(res.R, Y2010, 1e12, res.t), w = res.trades.length ? res.trades.filter(x => x > 0).length / res.trades.length * 100 : 0;
    if (!s) continue; if (s.sharpe > 0) pos++;
    console.log(m.name.padEnd(13) + new Date(m.d[0][0] * 1000).getUTCFullYear() + "  " + s.yrs.toFixed(0).padStart(4) + "  " + s.sharpe.toFixed(2).padStart(6) + " " + s.t.toFixed(1).padStart(5) + "   " + (s.ann * 100).toFixed(1).padStart(6) + "%            " + (s.dd * 100).toFixed(0).padStart(4) + "%   " + String(res.trades.length).padStart(6) + "  " + w.toFixed(0).padStart(3) + "%   " + (a ? a.sharpe.toFixed(2).padStart(6) : "     —") + "        " + (b ? b.sharpe.toFixed(2).padStart(6) : "     —"));
  }
  // the equal-risk portfolio: each day, the average of the markets trading that day
  const byDay = new Map();
  runs.forEach(({ res }, k) => { for (let i = 0; i < res.R.length; i++) { if (Number.isNaN(res.R[i])) continue; const d = bday(res.t[i]), e = byDay.get(d) || new Map(); e.set(k, (e.get(k) || 0) + res.R[i]); byDay.set(d, e); } });
  const days = [...byDay.keys()].sort((a, b) => a - b), PT = days.map(d => d * DAY), PR = days.map(d => { const e = byDay.get(d); let s = 0; for (const v of e.values()) s += v; return s / e.size; });
  const all = stats(PR, 0, 1e12, PT), pre = stats(PR, 0, Y2010, PT), post = stats(PR, Y2010, 1e12, PT);
  const decades = [1975, 1980, 1990, 2000, 2010, 2020].map((y, k, arr) => { const s = stats(PR, Date.UTC(y, 0, 1) / 1000, Date.UTC(arr[k + 1] || 2030, 0, 1) / 1000, PT); return (y === 1975 ? "1970s" : y + "s") + " " + (s ? s.sharpe.toFixed(2) : "—"); });
  const passed = pre && post && pre.sharpe > 0 && pre.p < 0.05 && post.sharpe > 0 && post.p < 0.05 && pos / runs.length >= 0.6;
  console.log("PORTFOLIO    Sharpe " + all.sharpe.toFixed(2) + " (t " + all.t.toFixed(1) + ")  before 2010 " + pre.sharpe.toFixed(2) + " (p " + pre.p.toFixed(3) + ")  from 2010 " + post.sharpe.toFixed(2) + " (p " + post.p.toFixed(3) + ")  markets positive " + pos + "/" + runs.length + "  worst fall " + (all.dd * 100).toFixed(0) + "%");
  console.log("             by decade: " + decades.join("  "));
  console.log("             verdict by the criteria written down beforehand: " + (passed ? "PASSES" : "FAILS"));
  out[strat] = { sharpe: +all.sharpe.toFixed(2), pre: +pre.sharpe.toFixed(2), preP: +pre.p.toFixed(3), post: +post.sharpe.toFixed(2), postP: +post.p.toFixed(3), positive: pos, markets: runs.length, passed };
}
fs.writeFileSync(path.join(__dirname, "result.json"), JSON.stringify({ tested: new Date().toISOString().slice(0, 10), strategies: out }, null, 1) + "\n");
// ---- the three together (decided AFTER the results above, so information only, not a pass / fail test) ----
{
  const byDay = new Map();
  markets.forEach((m, k) => {
    const rs = ["TSMOM", "DONCH", "MAX"].map(s => run(m, s));
    for (let i = 0; i < rs[0].R.length; i++) { if (Number.isNaN(rs[0].R[i])) continue; const d = bday(rs[0].t[i]), e = byDay.get(d) || new Map(); e.set(k, (e.get(k) || 0) + (rs[0].R[i] + rs[1].R[i] + rs[2].R[i]) / 3); byDay.set(d, e); }
  });
  const days = [...byDay.keys()].sort((a, b) => a - b), PT = days.map(d => d * DAY), PR = days.map(d => { const e = byDay.get(d); let s = 0; for (const v of e.values()) s += v; return s / e.size; });
  const all = stats(PR, 0, 1e12, PT), pre = stats(PR, 0, Y2010, PT), post = stats(PR, Y2010, 1e12, PT);
  const yrs = []; for (let y = 2010; y <= 2026; y++) { const s = stats(PR, Date.UTC(y, 0, 1) / 1000, Date.UTC(y + 1, 0, 1) / 1000, PT); if (s) yrs.push(y + " " + (s.ann * 100).toFixed(0) + "%"); }
  console.log("\n==== the three together (information only) ====\nPORTFOLIO    Sharpe " + all.sharpe.toFixed(2) + "  before 2010 " + pre.sharpe.toFixed(2) + " (p " + pre.p.toFixed(3) + ")  from 2010 " + post.sharpe.toFixed(2) + " (p " + post.p.toFixed(3) + ")  worst fall " + (all.dd * 100).toFixed(0) + "%");
  console.log("             each year since 2010 (return at ~16% yearly risk per market, averaged): " + yrs.join("  "));
  out.combined = { sharpe: +all.sharpe.toFixed(2), pre: +pre.sharpe.toFixed(2), post: +post.sharpe.toFixed(2), postP: +post.p.toFixed(3), worst: +(all.dd * 100).toFixed(0), note: "decided after the three were run: information only" };
  fs.writeFileSync(path.join(__dirname, "result.json"), JSON.stringify({ tested: new Date().toISOString().slice(0, 10), markets: markets.length, from: 1971, strategies: out }, null, 1) + "\n");
}
