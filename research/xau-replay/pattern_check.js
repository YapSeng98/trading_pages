// Do the chart patterns the page shows (assets/xau-engine.js xPatterns) help? Walks every candle close of each
// timeframe, runs the page's own pattern finder on the candles closed by then, and records each time a pattern
// completes (double top/bottom or head and shoulders closes through its neckline; a triangle, wedge, channel, range
// or flag breaks out). Then:
//   A. the pattern on its own: trade the breakout way, stop 3 x 1H ATR, target 3R; and with the pattern's own
//      invalidation and target
//   B. the same, only when the weekly, daily and 4-hour trends point the same way (and when they point against it)
//   C. the page's rule: its signals split by whether a completed pattern agrees, disagrees, or there is none
// usage: MARKET=gold|btc node pattern_check.js <y0> <y1>
const L = require("./lib"), S = require("./sim");
const BTC = process.env.MARKET === "btc", [y0, y1] = process.argv.slice(2).map(Number);
const ctx = L.loadEngine(L.REPO + "/assets/xau-engine.js");
const st = S.loadStates(BTC ? "btc" : "full"), X = L.source(BTC ? "btc" : "duk", y0, y1);
const align = BTC ? "utc" : "ny", skip = BTC ? null : L.spotClosed;
let ready = -1; for (let i = 0; i < st.n; i++) if (!Number.isNaN(st.a[i * S.C + 1])) { ready = st.a[i * S.C]; break; }
const from = Math.max(ready, X.t[0]), to = Math.min(st.a[(st.n - 1) * S.C], X.t[X.n - 1]), yrs = (to - from) / 86400 / 365.25;
const base = BTC ? { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 3, swapRate: 0.15, swapRateShort: 0.15, swapDaily: true } : { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 1.5, swapRate: 0.075 };
const T3 = { stopAtr: 3, mgmt: "fix", fixR: 3 };
const W3 = r => (r[1] === r[2] && r[2] === r[3] && r[2] !== 0 ? r[2] : 0), C5 = r => (W3(r) && r[4] === r[2] && r[5] === r[2] ? r[2] : 0);
const rowIdx = t => { let a = 0, b = st.n; while (a < b) { const m = (a + b) >> 1; if (st.a[m * S.C] <= t) a = m + 1; else b = m; } return a - 1; };   // last state at or before t
const row = i => st.a.subarray(i * S.C, i * S.C + S.C);
// which way a completed pattern points; 0 while it is still forming
const way = p => /closed below|broke out downward/.test(p.status) ? -1 : /closed above|broke out upward/.test(p.status) ? 1 : p.status === "broke out" ? (p.bias === "bullish" ? 1 : -1) : 0;
const TFS = ctx.XAU_TFS.filter(c => ["W", "D", "4H", "1H", "15M"].includes(c.tf));
const events = [], live = {};            // live[tf]: [{t, ps}] the completed patterns after each close, for lookups
const t0 = Date.now();
for (const c of TFS) {
  const K = L.aggregate(X, c.tf, align, skip), lim = c.limit - 1, seen = new Set(); live[c.tf] = [];
  for (let n = 60; n <= K.length; n++) {
    const end = K[n - 1][6] + 1; if (end / 1000 < from - 86400 * 30 || end / 1000 > to) continue;
    const sl = K.slice(Math.max(0, n - lim), n), B = { t: [], h: [], l: [], c: [] };
    sl.forEach(k => { B.t.push(k[0]); B.h.push(k[2]); B.l.push(k[3]); B.c.push(k[4]); });
    const atr = ctx.xAtr(B.h, B.l, B.c, 14), ps = ctx.xPatterns(B, atr, c), done = [];
    for (const p of ps) {
      const d = way(p); if (!d) continue;
      const key = p.name + "|" + d + "|" + B.t[p.from];               // one pattern, counted once: the close that completed it
      done.push({ name: p.name, dir: d });
      if (seen.has(key)) continue; seen.add(key);
      const close = B.c[B.c.length - 1], h = num(p.height);
      let stop = num(p.invalid), tgt = num(p.target);
      if (stop === null) stop = d > 0 ? num(p.lower) : num(p.upper);
      if (tgt === null && h !== null) tgt = d > 0 ? num(p.upper) + h : num(p.lower) - h;
      events.push({ t: end / 1000 + 60, tf: c.tf, name: p.name, dir: d, p: close, nStop: stop, nTgt: tgt });
    }
    live[c.tf].push({ t: end / 1000, ps: done });
  }
  console.log(c.tf, "candles", K.length, "completed patterns", events.filter(e => e.tf === c.tf).length, ((Date.now() - t0) / 1000).toFixed(0) + "s");
}
function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
events.sort((a, b) => a.t - b.t);
// fill in what the trade needs from the replay states at that moment
const sigs = events.filter(e => e.t >= from && e.t < to).map(e => { const i = rowIdx(e.t - 60); if (i < 0) return null; const r = row(i); return Object.assign(e, { atr: r[8], big: W3(r), stop: e.nStop, tp1: e.nTgt, tp2: NaN, regimeEnd: 0 }); }).filter(e => e && e.atr > 0);
const SEG = BTC ? [["all", 0, 1e12], ["2018-20", 0, Date.UTC(2021, 0, 1) / 1000], ["2021-23", Date.UTC(2021, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["2024-", Date.UTC(2024, 0, 1) / 1000, 1e12]]
  : [["all", 0, 1e12], ["2011-18", 0, Date.UTC(2019, 0, 1) / 1000], ["2019-23", Date.UTC(2019, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["2024-26", Date.UTC(2024, 0, 1) / 1000, 1e12]];
const f = (v, d = 2) => (v >= 0 ? "+" : "") + v.toFixed(d);
const line = (nm, tr) => { const s = S.stats(tr); return "  " + nm.padEnd(40) + (s.n ? ("avg " + f(s.avgR) + "R [" + f(s.lo) + "," + f(s.hi) + "] n" + s.n + " win " + s.win.toFixed(0) + "%").padEnd(46) : "n0".padEnd(46)) + SEG.slice(1).map(([g, a, b]) => { const q = S.stats(tr.filter(x => x.t >= a && x.t < b)); return g + " " + (q.n ? f(q.avgR) : "—"); }).join("  "); };
// every pattern is its own test here (positions may overlap), so each one counts
const runAll = (list, ex) => S.run(list, X, Object.assign({}, base, ex, { overlap: true }));
console.log("\n" + (BTC ? "BTC" : "GOLD") + " " + new Date(from * 1000).toISOString().slice(0, 10) + " -> " + new Date(to * 1000).toISOString().slice(0, 10) + ", " + sigs.length + " completed patterns");
console.log("\nA. a completed pattern on its own, traded its breakout way (stop 3 x 1H ATR, target 3R)");
for (const tf of ["W", "D", "4H", "1H", "15M"]) console.log(line(tf + " all patterns", runAll(sigs.filter(s => s.tf === tf), T3)));
const names = [...new Set(sigs.map(s => s.name))].sort();
for (const nm of names) console.log(line("  " + nm + " (D/4H/1H)", runAll(sigs.filter(s => s.name === nm && ["D", "4H", "1H"].includes(s.tf)), T3)));
console.log("  -- with the pattern's own stop (its invalidation) and target:");
for (const tf of ["D", "4H", "1H"]) console.log(line(tf + " own stop/target", runAll(sigs.filter(s => s.tf === tf && s.stop !== null && s.tp1 !== null && (s.p - s.stop) * s.dir > 0 && (s.tp1 - s.p) * s.dir > 0), { mgmt: "tp1" })));
console.log("\nB. only with the big trend (weekly, daily and 4-hour agree with the pattern), and against it");
for (const tf of ["D", "4H", "1H", "15M"]) {
  console.log(line(tf + " with the big three", runAll(sigs.filter(s => s.tf === tf && s.big === s.dir), T3)));
  console.log(line(tf + " against the big three", runAll(sigs.filter(s => s.tf === tf && s.big === -s.dir), T3)));
}
console.log("\nC. the page's rule (all five agree, one position at a time), split by completed patterns at the signal");
const S5 = S.rowSignals(st, X, C5, { from, to, regime: W3, onset: true });
const lookup = (tf, t) => { const a = live[tf]; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].t <= t) lo = m + 1; else hi = m; } return lo ? a[lo - 1].ps : []; };
const tagged = S.run(S5, X, Object.assign({}, base, T3)).map(x => {
  let agree = 0, oppose = 0, ag = [], op = [];
  for (const tf of ["D", "4H", "1H"]) for (const p of lookup(tf, x.sg.t - 60)) { if (p.dir === x.dir) { agree++; ag.push(tf + " " + p.name); } else { oppose++; op.push(tf + " " + p.name); } }
  return Object.assign(x, { agree, oppose });
});
console.log(line("all the rule's trades", tagged));
console.log(line("a completed pattern agrees (D/4H/1H)", tagged.filter(x => x.agree && !x.oppose)));
console.log(line("a completed pattern points against", tagged.filter(x => x.oppose && !x.agree)));
console.log(line("both", tagged.filter(x => x.oppose && x.agree)));
console.log(line("no completed pattern", tagged.filter(x => !x.oppose && !x.agree)));
// --write: keep the summary the page quotes in the market's replay file (data/xau-backtest.json / btc-backtest.json)
if (process.argv.includes("--write")) {
  const fs = require("fs"), file = L.REPO + "/data/" + (BTC ? "btc" : "xau") + "-backtest.json", bt = JSON.parse(fs.readFileSync(file, "utf8"));
  const pk = tr => { const s = S.stats(tr); return s.n ? { n: s.n, avgR: +s.avgR.toFixed(3), win: +s.win.toFixed(1), lo: +s.lo.toFixed(3), hi: +s.hi.toFixed(3) } : { n: 0 }; };
  const own = tf => runAll(sigs.filter(s => s.tf === tf && s.stop !== null && s.tp1 !== null && (s.p - s.stop) * s.dir > 0 && (s.tp1 - s.p) * s.dir > 0), { mgmt: "tp1" });
  bt.patterns = {
    note: "形态在日线、4 小时、1 小时上完成（双顶/双底、头肩收破颈线，三角形、楔形、通道、区间、旗形突破）的那根 K 线收盘后 1 分钟进场；research/xau-replay/pattern_check.js",
    alone: { "1H": pk(runAll(sigs.filter(s => s.tf === "1H"), T3)), "4H": pk(runAll(sigs.filter(s => s.tf === "4H"), T3)) },
    own: { "1H": pk(own("1H")), "4H": pk(own("4H")) },
    rule: { all: pk(tagged), agree: pk(tagged.filter(x => x.agree && !x.oppose)), none: pk(tagged.filter(x => !x.oppose && !x.agree)), against: pk(tagged.filter(x => x.oppose && !x.agree)) },
  };
  fs.writeFileSync(file, JSON.stringify(bt, null, 1) + "\n");
  console.log("\nwrote patterns into " + file);
}
