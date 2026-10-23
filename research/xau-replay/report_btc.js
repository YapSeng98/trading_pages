// The gold rule replayed on Bitcoin (Binance BTCUSDT, 1-minute bars, candles cut in UTC): does it hold there too?
// Nothing about the rule was changed for Bitcoin: same engine, same five timeframes, stop 3 x the 1-hour ATR,
// target 3R or the daily trailing stop. Writes data/btc-backtest.json, which btc.html shows.
// usage: MARKET=btc node gen_states.js 2017 2026  then  node report_btc.js 2017 2026 [--write]
const L = require("./lib"), S = require("./sim"), fs = require("fs");
const args = process.argv.slice(2), write = args.includes("--write"), [y0s, y1s] = args.filter(a => a !== "--write");
const st = S.loadStates("btc"), X = L.source("btc", +y0s, +y1s);
let ready = -1; for (let i = 0; i < st.n; i++) if (!Number.isNaN(st.a[i * S.C + 1])) { ready = st.a[i * S.C]; break; }
if (ready < 0) throw new Error("the weekly timeframe never becomes readable in these states");
const dataFrom = X.t[0], from = Math.max(ready, X.t[0]), to = Math.min(st.a[(st.n - 1) * S.C], X.t[X.n - 1]), yrs = (to - from) / 86400 / 365.25;
// costs as on an MT5 Bitcoin CFD: spread 3 bp of price (about $30 at $100,000) and financing 15% a year on both
// sides, charged every day including weekends. Brokers differ a lot; the low-cost line is a crypto exchange
// (2 bp all in, no financing).
const base = { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 3, swapRate: 0.15, swapRateShort: 0.15, swapDaily: true };
const cheap = { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 2 };
const iso = t => new Date(t * 1000).toISOString().slice(0, 10);
const W3 = r => (r[1] === r[2] && r[2] === r[3] && r[2] !== 0 ? r[2] : 0), C5 = r => (W3(r) && r[4] === r[2] && r[5] === r[2] ? r[2] : 0);
const sig = (cond, opt) => S.rowSignals(st, X, cond, Object.assign({ from, to, regime: W3 }, opt));
const T3 = { stopAtr: 3, mgmt: "fix", fixR: 3 }, TR = { stopAtr: 3, mgmt: "trail", trail: 2, trailEvery: 86400, regimeExit: true };

const RULES = {
  go3r: ["五个周期同向时进场，止损 3 倍小时波幅，目标 3R", "和黄金页完全一样的规则", () => S.run(sig(C5, { onset: true }), X, Object.assign({}, base, T3))],
  gotrail: ["同样的进场和止损，不设目标：每天挪一次跟踪止损", "止损跟在最好价格后面 2R；三个大周期不再同向就离场", () => S.run(sig(C5, { onset: true }), X, Object.assign({}, base, TR))],
  go3rLow: ["同上（目标 3R），按交易所的低成本算", "点差加手续费万分之 2，没有隔夜利息", () => S.run(sig(C5, { onset: true }), X, Object.assign({}, cheap, T3))],
  gotrailLow: ["同上（跟踪止损），按交易所的低成本算", "点差加手续费万分之 2，没有隔夜利息", () => S.run(sig(C5, { onset: true }), X, Object.assign({}, cheap, TR))],
  early: ["大方向对了就进，不等小周期转回来", "周线、日线、4 小时同向，但 1 小时或 15 分钟还没同向", () => S.run(sig(r => (W3(r) && !C5(r) ? W3(r) : 0)), X, Object.assign({}, base, T3))],
  tight: ["同样的信号，但止损只放 1.5 倍波幅", "止损近了一半，其余不变", () => S.run(sig(C5, { onset: true }), X, Object.assign({}, base, { stopAtr: 1.5, mgmt: "fix", fixR: 3 }))],
  against: ["逆着三个大周期做", "同样的止损和目标，方向反过来", () => S.run(sig(r => -W3(r)), X, Object.assign({}, base, T3))],
  long: ["不看任何条件，一直做多", "只是用来对照：这段历史里比特币本身涨了多少", () => S.run(S.rowSignals(st, X, () => 1, { from, to }), X, Object.assign({}, base, T3))],
};
const Y1 = new Date(to * 1000).getUTCFullYear();
const SEG = [["2018–2020", 0, Date.UTC(2021, 0, 1) / 1000], ["2021–2023", Date.UTC(2021, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["2024–" + Y1, Date.UTC(2024, 0, 1) / 1000, 1e12]];
const r2 = (v, d) => (v === undefined || v === null || Number.isNaN(v) ? null : v === Infinity ? 99 : +v.toFixed(d === undefined ? 3 : d));
function pack(name, note, tr) {
  const s = S.stats(tr), yy = S.byKey(tr, x => new Date(x.t * 1000).getUTCFullYear()), side = d => { const q = S.stats(tr.filter(x => x.dir === d)); return q.n ? { n: q.n, avgR: r2(q.avgR), win: r2(q.win, 1) } : { n: 0 }; };
  const sorted = tr.map(x => x.R).sort((a, b) => b - a), top5 = sorted.slice(0, 5).reduce((a, b) => a + b, 0);
  const wins = tr.filter(x => x.R > 0), losses = tr.filter(x => x.R < 0), sum = q => q.reduce((a, b) => a + b.R, 0);
  const yk = Object.keys(yy).sort(), raw = yk.map(y => sum(yy[y]) * 10), fl = raw.map(Math.floor), spare = Math.round(s.totalR * 10) - fl.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).slice(0, Math.max(0, spare)).forEach(([, i]) => { fl[i]++; });
  return { name, note, n: s.n, perYear: r2(s.n / yrs, 1), win: r2(s.win, 1), avgR: r2(s.avgR), avgWin: r2(s.avgWin, 2), avgLoss: r2(s.avgLoss, 2), lo: r2(s.lo), hi: r2(s.hi), rPerYear: r2(s.totalR / yrs, 2), totalR: r2(s.totalR, 1), maxDD: r2(s.maxDD, 1), streak: s.maxLoseStreak, holdH: r2(s.holdH, 0), pf: r2(s.pf, 2),
    best: r2(sorted[0], 1), top5: r2(top5, 1), long: side(1), short: side(-1), nWin: wins.length, nLoss: losses.length,
    years: yk.map((y, i) => ({ y: +y, n: yy[y].length, r: fl[i] / 10 })),
    segments: SEG.map(([label, a, b]) => { const q = tr.filter(x => x.t >= a && x.t < b), z = S.stats(q), span = (Math.min(b, to) - Math.max(a, from)) / 86400 / 365.25; return z.n ? { label, n: z.n, avgR: r2(z.avgR), lo: r2(z.lo), hi: r2(z.hi), rPerYear: r2(z.totalR / span, 1), win: r2(z.win, 0), maxDD: r2(z.maxDD, 1) } : { label, n: 0 }; }) };
}
console.log("BTCUSDT 1-minute | spread 3 bp, financing 15%/yr both sides, daily |", iso(from), "->", iso(to), "(" + yrs.toFixed(1) + " years; history starts " + iso(dataFrom) + ")");
const R = {};
for (const id of Object.keys(RULES)) {
  const [name, note, fn] = RULES[id], p = R[id] = pack(name, note, fn());
  console.log("\n" + id + ": " + name);
  console.log("  all".padEnd(16) + "n=" + String(p.n).padStart(5) + "  win " + p.win + "%  avg " + (p.avgR >= 0 ? "+" : "") + p.avgR + "R [" + p.lo + "," + p.hi + "]  " + p.rPerYear + "R/yr  PF " + p.pf + "  maxDD " + p.maxDD + "R  streak " + p.streak + "  hold " + p.holdH + "h  long " + p.long.avgR + " short " + p.short.avgR);
  p.segments.forEach(g => console.log("  " + g.label.padEnd(14) + (g.n ? "n=" + String(g.n).padStart(5) + "  win " + g.win + "%  avg " + (g.avgR >= 0 ? "+" : "") + g.avgR + "R [" + g.lo + "," + g.hi + "]  " + g.rPerYear + "R/yr  maxDD " + g.maxDD + "R" : "n=0")));
  console.log("  years " + p.years.map(y => y.y + ":" + y.r).join(" "));
}
if (write) {
  let rowsIn = 0, big3 = 0, all5 = 0;
  for (let i = 0; i < st.n; i++) { const r = st.a.subarray(i * S.C, i * S.C + S.C); if (r[0] < from || r[0] >= to) continue; rowsIn++; if (W3(r)) big3++; if (C5(r)) all5++; }
  const out = {
    updated: iso(Date.now() / 1000 + 8 * 3600), market: "BTCUSDT", from: iso(from), to: iso(to), years: r2(yrs, 1), dataFrom: iso(dataFrom), signals: sig(C5, { onset: true }).length,
    aligned: { big3: r2(big3 / rowsIn * 100, 0), all5: r2(all5 / rowsIn * 100, 0) }, priceFrom: Math.round(X.c[L.lowerBound(X.t, from)]), priceTo: Math.round(X.c[X.n - 1]),
    source: "币安 BTCUSDT 的 1 分钟 K 线，约 " + Math.round(X.n / 1e5) / 10 + " 百万根，按 UTC 换日（新加坡 08:00）。历史从 " + iso(dataFrom) + " 开始，头一年多只用来让周线攒够 60 根 K 线，成绩从 " + iso(from) + " 算起。",
    costs: "主结果按 MT5 比特币差价合约估：点差按价格的万分之 3，隔夜利息多空都按年化 15%、每天都收（周末也收）。「低成本」两行按交易所估：万分之 2，没有利息。信号出现后 1 分钟按市价进场，止损和目标同一分钟都碰到时算止损。",
    main: "go3r", order: ["go3r", "gotrail", "go3rLow", "gotrailLow", "early", "tight", "against", "long"], rules: R,
  };
  fs.writeFileSync(L.REPO + "/data/btc-backtest.json", JSON.stringify(out, null, 1) + "\n");
  console.log("\nwrote data/btc-backtest.json");
}
