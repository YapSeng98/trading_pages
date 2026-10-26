// Short-term (intraday) rules, tested before any of them goes on the page. Three common rules, parameters fixed
// before the first run, each traded on the 1-minute bars with the replay's costs, one position at a time, out by the
// end of the trading day. A rule is only worth showing if it is positive in every period, after costs.
//   ST1 15 分钟顺势：4 小时和 1 小时同向时，15 分钟转回同一方向就进；止损 2 倍 15 分钟波幅，目标 2R，最多拿 8 小时
//   ST2 亚洲盘区间突破：亚洲盘 8 小时的高低点，伦敦盘 6 小时内先突破哪边、且和 4 小时同向就跟；止损在区间中点，目标 2R，收盘前离场
//   ST3 昨日高低点突破：日线和 4 小时同向时，当天第一次突破昨日高点（做多）或低点（做空）就跟；止损 1.5 倍小时波幅，目标 2R，收盘前离场
// usage: MARKET=gold|btc node short_check.js <y0> <y1> [--write]
const L = require("./lib"), S = require("./sim");
const BTC = process.env.MARKET === "btc", [y0, y1] = process.argv.slice(2).filter(a => !a.startsWith("--")).map(Number);
const st = S.loadStates(BTC ? "btc" : "full"), X = L.source(BTC ? "btc" : "duk", y0, y1);
let ready = -1; for (let i = 0; i < st.n; i++) if (!Number.isNaN(st.a[i * S.C + 1])) { ready = st.a[i * S.C]; break; }
const from = Math.max(ready, X.t[0]), to = Math.min(st.a[(st.n - 1) * S.C], X.t[X.n - 1]), yrs = (to - from) / 86400 / 365.25;
const SPREAD = process.env.SPREAD ? +process.env.SPREAD : null;
const base = BTC ? { delay: 1, cooldown: 0, spreadBp: SPREAD === null ? 3 : SPREAD, swapRate: SPREAD === null ? 0.15 : 0, swapRateShort: SPREAD === null ? 0.15 : 0, swapDaily: true } : { delay: 1, cooldown: 0, spreadBp: SPREAD === null ? 1.5 : SPREAD, swapRate: 0.075 };
const row = i => st.a.subarray(i * S.C, i * S.C + S.C);
const rowAt = t => { let a = 0, b = st.n; while (a < b) { const m = (a + b) >> 1; if (st.a[m * S.C] <= t) a = m + 1; else b = m; } return a ? row(a - 1) : null; };   // last 15-minute close at or before t
// the trading day: gold's starts at 17:00 New York (broker midnight), Bitcoin's at 00:00 UTC
const dayStart = t => BTC ? Math.floor(t / 86400) * 86400 : L.bucket(t, "D", "ny");
const H = 3600;

// ---- ST1: inside the 4-hour and 1-hour trend, the 15-minute trend turning back that way ----
function st1() {
  const out = []; let prev15 = 0;
  for (let i = 0; i < st.n; i++) {
    const r = row(i), T = r[0], m15 = r[5];
    if (T >= from && T < to && r[3] !== 0 && r[3] === r[4] && m15 === r[3] && prev15 !== m15 && r[39] > 0)
      out.push({ t: T + 60, dir: m15, p: r[38], atr: r[39] * 2 / 3, hold: 8 * 60 });   // stopAtr 3 x (2/3 x 15M ATR) = 2 x 15M ATR
    prev15 = m15;
  }
  return out;
}
// ---- ST2: the Asian session's range, broken during London's first six hours, the 4-hour trend's way ----
function st2(filter) {
  const out = []; let d0 = -1, hi = -Infinity, lo = Infinity, done = true;
  for (let k = 0; k < X.n; k++) {
    const t = X.t[k]; if (t < from || t >= to) continue;
    const ds = dayStart(t);
    if (ds !== d0) { d0 = ds; hi = -Infinity; lo = Infinity; done = false; }
    const off = t - ds, asiaA = BTC ? 0 : H, asiaB = asiaA + 8 * H, brkB = asiaB + 6 * H;
    if (off >= asiaA && off < asiaB) { if (X.h[k] > hi) hi = X.h[k]; if (X.l[k] < lo) lo = X.l[k]; continue; }
    if (done || off < asiaB || off >= brkB || !(hi > lo)) continue;
    const dir = X.h[k] > hi ? 1 : X.l[k] < lo ? -1 : 0; if (!dir) continue;
    done = true;
    const r = rowAt(t); if (!r) continue;
    if (filter && r[3] !== dir) continue;
    const mid = (hi + lo) / 2;
    out.push({ t: t + 60, dir, p: dir > 0 ? hi : lo, stop: mid, tp1: NaN, tp2: NaN, atr: r[8], hold: Math.max(30, Math.round((ds + 22 * H - t) / 60)), range: hi - lo });
  }
  return out;
}
// ---- ST3: yesterday's high or low taken out, with the daily and 4-hour trends ----
function st3() {
  const out = []; let d0 = -1, ph = NaN, pl = NaN, ch = -Infinity, cl = Infinity, done = true;
  for (let k = 0; k < X.n; k++) {
    const t = X.t[k]; if (t < from - 3 * 86400 || t >= to) continue;
    const ds = dayStart(t);
    if (ds !== d0) { if (d0 >= 0) { ph = ch; pl = cl; } d0 = ds; ch = -Infinity; cl = Infinity; done = false; }
    const h = X.h[k], l = X.l[k], off = t - ds;
    if (!done && t >= from && off >= (BTC ? 0 : H) && off < 20 * H && ph > pl) {
      const dir = h > ph ? 1 : l < pl ? -1 : 0;
      if (dir) {
        done = true;
        const r = rowAt(t);
        if (r && r[2] === dir && r[3] === dir && r[8] > 0) out.push({ t: t + 60, dir, p: dir > 0 ? ph : pl, atr: r[8] * 0.5, hold: Math.max(30, Math.round((ds + 22 * H - t) / 60)) });   // stopAtr 3 x (0.5 x 1H ATR) = 1.5 x 1H ATR
      }
    }
    if (h > ch) ch = h; if (l < cl) cl = l;
  }
  return out;
}
// one position at a time, each trade with its own time limit
function run(sigs, ex) {
  const out = []; let busy = 0;
  for (const sg of sigs.sort((a, b) => a.t - b.t)) {
    if (sg.t < busy) continue;
    const tr = S.trade(sg, X, Object.assign({}, base, ex, { maxHold: sg.hold }));
    if (!tr || tr.skip) continue;
    out.push(tr); busy = tr.exitT;
  }
  return out;
}
const SEG = BTC ? [["2018-20", 0, Date.UTC(2021, 0, 1) / 1000], ["2021-23", Date.UTC(2021, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["2024-26", Date.UTC(2024, 0, 1) / 1000, 1e12]]
  : [["2011-18", 0, Date.UTC(2019, 0, 1) / 1000], ["2019-23", Date.UTC(2019, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["2024-26", Date.UTC(2024, 0, 1) / 1000, 1e12]];
const f = (v, d = 2) => (v >= 0 ? "+" : "") + v.toFixed(d);
function yearBoot(tr) {
  const g = S.byKey(tr, x => new Date(x.t * 1000).getUTCFullYear()), ks = Object.keys(g), rnd = L.rng(5), m = [];
  for (let b = 0; b < 3000; b++) { let s = 0, n = 0; for (let i = 0; i < ks.length; i++) for (const x of g[ks[(rnd() * ks.length) | 0]]) { s += x.R; n++; } m.push(s / n); }
  return m.filter(v => v > 0).length / m.length * 100;
}
const RULES = {
  ST1: ["15 分钟顺势", () => run(st1(), { stopAtr: 3, mgmt: "fix", fixR: 2 })],
  ST2: ["亚洲盘区间突破（顺 4 小时）", () => run(st2(true), { mgmt: "fix", fixR: 2 })],
  ST2x: ["  同上，不看 4 小时（对照）", () => run(st2(false), { mgmt: "fix", fixR: 2 })],
  ST3: ["昨日高低点突破（顺日线和 4 小时）", () => run(st3(), { stopAtr: 3, mgmt: "fix", fixR: 2 })],
};
console.log((BTC ? "BTC" : "GOLD") + " " + new Date(from * 1000).toISOString().slice(0, 10) + " -> " + new Date(to * 1000).toISOString().slice(0, 10) + " (" + yrs.toFixed(1) + " yrs), costs included");
const R = {};
for (const [id, [name, fn]] of Object.entries(RULES)) {
  const tr = fn(), s = S.stats(tr);
  const seg = SEG.map(([g, a, b]) => { const q = S.stats(tr.filter(x => x.t >= a && x.t < b)); return { label: g, n: q.n || 0, avgR: q.n ? +q.avgR.toFixed(3) : null, win: q.n ? +q.win.toFixed(1) : null }; });
  const pY = s.n ? yearBoot(tr) : 0, holdMin = s.n ? L.quant(tr.map(x => x.holdMin), 0.5) : 0;
  R[id] = { name, n: s.n, perYear: +(s.n / yrs).toFixed(1), win: s.n ? +s.win.toFixed(1) : null, avgR: s.n ? +s.avgR.toFixed(3) : null, lo: s.n ? +s.lo.toFixed(3) : null, hi: s.n ? +s.hi.toFixed(3) : null, rPerYear: s.n ? +(s.totalR / yrs).toFixed(1) : null, maxDD: s.n ? +s.maxDD.toFixed(1) : null, streak: s.maxLoseStreak, holdMin: Math.round(holdMin), pYears: Math.round(pY), segments: seg, long: s.n ? +S.stats(tr.filter(x => x.dir > 0)).avgR.toFixed(3) : null, short: s.n ? +S.stats(tr.filter(x => x.dir < 0)).avgR.toFixed(3) : null };
  const q = R[id];
  console.log(id.padEnd(5) + name.padEnd(26) + (s.n ? "n " + String(q.n).padStart(5) + " (" + q.perYear + "/yr)  win " + q.win + "%  avg " + f(q.avgR) + "R [" + f(q.lo) + "," + f(q.hi) + "]  " + q.rPerYear + "R/yr  DD " + q.maxDD + "R  hold " + q.holdMin + "m  P(yrs>0) " + q.pYears + "%  long " + f(q.long) + " short " + f(q.short) : "n 0"));
  console.log("      " + seg.map(g => g.label + " " + (g.n ? f(g.avgR) + "R (" + g.n + ")" : "—")).join("   "));
}
module.exports = R;
if (process.argv.includes("--write")) {
  const fs = require("fs"), file = L.REPO + "/data/" + (BTC ? "btc" : "xau") + "-backtest.json", bt = JSON.parse(fs.readFileSync(file, "utf8"));
  bt.shortTerm = { tested: new Date().toISOString().slice(0, 10), from: new Date(from * 1000).toISOString().slice(0, 10), to: new Date(to * 1000).toISOString().slice(0, 10), rules: R, note: "research/xau-replay/short_check.js：三条短线规则，参数在第一次运行前定好，按 1 分钟 K 线和回放的成本算，一次一笔，当天收盘前离场。" };
  fs.writeFileSync(file, JSON.stringify(bt, null, 1) + "\n"); console.log("wrote shortTerm into " + file);
}
