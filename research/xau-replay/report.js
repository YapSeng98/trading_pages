// Score the rules on the replayed states and write the numbers the page shows: data/xau-backtest.json.
// The rule (go3r) and its trailing variant were fixed on 2019-2023 and confirmed on 2024-2026 before the
// 2010-2018 history was downloaded, so that period is an untouched test.
// usage: node report.js <y0> <y1> [tag=full] [--write]
const L = require("./lib"), S = require("./sim"), fs = require("fs");
const args = process.argv.slice(2), write = args.includes("--write"), [y0s, y1s, tagArg] = args.filter(a => a !== "--write");
const st = S.loadStates(tagArg || "full"), X = L.source("duk", +y0s, +y1s);
// The scored period starts when the engine can first read all five timeframes. The weekly one needs 60 finished
// candles, so the first 14 months of the history only warm it up: no rule that uses it can trade there. Counting
// those months as "years tested" made every per-year figure too small, and the page said 2010 above a list that
// starts in 2011. Every rule is scored from the same day, so the comparison stays like for like.
let ready = -1; for (let i = 0; i < st.n; i++) if (!Number.isNaN(st.a[i * S.C + 1])) { ready = st.a[i * S.C]; break; }
if (ready < 0) throw new Error("the weekly timeframe never becomes readable in these states");
const dataFrom = X.t[0], from = Math.max(ready, X.t[0]), to = Math.min(st.a[(st.n - 1) * S.C], X.t[X.n - 1]), yrs = (to - from) / 86400 / 365.25;
// costs: spread 1.5 bp of price (about $0.63 at $4,200; the median in the bid/ask history 2024-2026 is 1.5-1.7 bp),
// long positions pay 7.5% a year overnight (three nights on Wednesday), shorts earn nothing
const base = { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 1.5, swapRate: 0.075 };
const iso = t => new Date(t * 1000).toISOString().slice(0, 10);
const W3 = r => (r[1] === r[2] && r[2] === r[3] && r[2] !== 0 ? r[2] : 0), C5 = r => (W3(r) && r[4] === r[2] && r[5] === r[2] ? r[2] : 0), D4 = r => r[7];
const sig = (cond, opt) => S.rowSignals(st, X, cond, Object.assign({ from, to, regime: W3 }, opt));
const T3 = { stopAtr: 3, mgmt: "fix", fixR: 3 };

const RULES = {
  go3r: ["五个周期同向时进场，止损 3 倍小时波幅，目标 3R", "这页现在的做法", () => S.run(sig(C5, { onset: true }), X, Object.assign({}, base, T3))],
  gotrail: ["同样的进场和止损，不设目标：每天挪一次跟踪止损", "止损跟在最好价格后面 2R；三个大周期不再同向就离场", () => S.run(sig(C5, { onset: true }), X, Object.assign({}, base, { stopAtr: 3, mgmt: "trail", trail: 2, trailEvery: 86400, regimeExit: true }))],
  late1r: ["信号走出 1R 以后才进", "五个周期还同向，但价格已经顺着走了 1 倍止损距离；止损按这时的价格重新放 3 倍波幅，目标 3R", () => S.run(S.lateSignals(st, C5, 1, { from, to }), X, Object.assign({}, base, T3))],
  early: ["大方向对了就进，不等小周期转回来", "周线、日线、4 小时同向，但 1 小时或 15 分钟还没同向", () => S.run(sig(r => (W3(r) && !C5(r) ? W3(r) : 0)), X, Object.assign({}, base, T3))],
  tight: ["同样的信号，但止损只放 1.5 倍波幅", "止损近了一半，其余不变", () => S.run(sig(C5, { onset: true }), X, Object.assign({}, base, { stopAtr: 1.5, mgmt: "fix", fixR: 3 }))],
  d4: ["只看日线和 4 小时，不管周线", "这页以前判断方向的办法", () => S.run(S.rowSignals(st, X, D4, { from, to, regime: D4 }), X, Object.assign({}, base, T3))],
  old: ["旧版信号：日线和 4 小时同向 + 价格进缺口 + 15 分钟转折", "用旧版自己的止损和目标（结构止损，目标在区间顶/底）", () => S.run(S.signals(st, X, { level: "go", from, to }), X, Object.assign({}, base, { mgmt: "half", cooldown: 60 }))],
  against: ["逆着三个大周期做", "同样的止损和目标，方向反过来", () => S.run(sig(r => -W3(r)), X, Object.assign({}, base, T3))],
  long: ["不看任何条件，一直做多", "只是用来对照：这段历史里黄金本身涨了多少", () => S.run(S.rowSignals(st, X, () => 1, { from, to }), X, Object.assign({}, base, T3))],
};
const Y0 = new Date(from * 1000).getUTCFullYear(), Y1 = new Date(to * 1000).getUTCFullYear();
const SEG = [[Y0 + "–2018（定规则前没看过）", 0, Date.UTC(2019, 0, 1) / 1000], ["2019–2023（定规则用的）", Date.UTC(2019, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["2024–" + Y1 + "（第一次验证）", Date.UTC(2024, 0, 1) / 1000, 1e12]];
const r2 = (v, d) => (v === undefined || v === null || Number.isNaN(v) ? null : v === Infinity ? 99 : +v.toFixed(d === undefined ? 3 : d));
function pack(name, note, tr) {
  const s = S.stats(tr), yy = S.byKey(tr, x => new Date(x.t * 1000).getUTCFullYear()), side = d => { const q = S.stats(tr.filter(x => x.dir === d)); return q.n ? { n: q.n, avgR: r2(q.avgR), win: r2(q.win, 1) } : { n: 0 }; };
  const sorted = tr.map(x => x.R).sort((a, b) => b - a), top5 = sorted.slice(0, 5).reduce((a, b) => a + b, 0);
  const wins = tr.filter(x => x.R > 0), losses = tr.filter(x => x.R < 0), sum = q => q.reduce((a, b) => a + b.R, 0);
  // each year to one decimal, rounded so the column adds up to the total printed above it (largest remainders get the spare tenths)
  const yk = Object.keys(yy).sort(), raw = yk.map(y => sum(yy[y]) * 10), fl = raw.map(Math.floor), spare = Math.round(s.totalR * 10) - fl.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).slice(0, Math.max(0, spare)).forEach(([, i]) => { fl[i]++; });
  const gaps = tr.slice(1).map((x, i) => (x.t - tr[i].t) / 86400).sort((a, b) => a - b), gq = q => (gaps.length ? gaps[Math.floor((gaps.length - 1) * q)] : null);   // days from one entry to the next
  return { name, note, n: s.n, perYear: r2(s.n / yrs, 1), win: r2(s.win, 1), avgR: r2(s.avgR), avgWin: r2(s.avgWin, 2), avgLoss: r2(s.avgLoss, 2), lo: r2(s.lo), hi: r2(s.hi), rPerYear: r2(s.totalR / yrs, 2), totalR: r2(s.totalR, 1), maxDD: r2(s.maxDD, 1), streak: s.maxLoseStreak, holdH: r2(s.holdH, 0), pf: r2(s.pf, 2),
    best: r2(sorted[0], 1), top5: r2(top5, 1), long: side(1), short: side(-1), shut: tr.skipped || 0, nWin: wins.length, nLoss: losses.length, sumWin: r2(sum(wins), 1), sumLoss: r2(sum(losses), 1), wait: { median: r2(gq(0.5), 1), p90: r2(gq(0.9), 0), max: r2(gq(1), 0) },
    years: yk.map((y, i) => ({ y: +y, n: yy[y].length, r: fl[i] / 10 })),
    segments: SEG.map(([label, a, b]) => { const q = tr.filter(x => x.t >= a && x.t < b), z = S.stats(q), span = (Math.min(b, to) - Math.max(a, from)) / 86400 / 365.25; return z.n ? { label, n: z.n, avgR: r2(z.avgR), lo: r2(z.lo), hi: r2(z.hi), rPerYear: r2(z.totalR / span, 1), win: r2(z.win, 0), maxDD: r2(z.maxDD, 1) } : { label, n: 0 }; }) };
}
console.log("real spot fills | spread 1.5 bp, long financing 7.5%/yr |", iso(from), "->", iso(to), "(" + yrs.toFixed(1) + " years; history starts " + iso(dataFrom) + ", the weekly timeframe is readable from " + iso(ready) + ")");
const R = {};
for (const id of Object.keys(RULES)) {
  const [name, note, fn] = RULES[id], p = R[id] = pack(name, note, fn());
  console.log("\n" + id + ": " + name);
  console.log("  all".padEnd(30) + "n=" + String(p.n).padStart(5) + "  win " + p.win + "%  avg " + (p.avgR >= 0 ? "+" : "") + p.avgR + "R [" + p.lo + "," + p.hi + "]  " + p.rPerYear + "R/yr  PF " + p.pf + "  maxDD " + p.maxDD + "R  streak " + p.streak + "  hold " + p.holdH + "h");
  p.segments.forEach(g => console.log("  " + g.label.padEnd(28) + (g.n ? "n=" + String(g.n).padStart(5) + "  win " + g.win + "%  avg " + (g.avgR >= 0 ? "+" : "") + g.avgR + "R [" + g.lo + "," + g.hi + "]  " + g.rPerYear + "R/yr  maxDD " + g.maxDD + "R" : "n=0")));
}
if (write) {
  const sg = (v, d) => { const t = Math.abs(v).toFixed(d === undefined ? 2 : d); return (+t === 0 ? "" : v > 0 ? "+" : "−") + t; }, num = v => Math.round(v).toLocaleString("en-US");
  const m = R.go3r, t = R.gotrail, l = R.late1r, e = R.early, g = R.tight, o = R.old, a = R.against, bad = m.years.filter(y => y.r < 0).map(y => y.y), [s1, s2, s3] = m.segments;
  const p0 = X.c[L.lowerBound(X.t, from)], p1 = X.c[X.n - 1];
  // how many times the signal came up, against how many became trades (one position at a time: the rest came up while a trade was on)
  let rowsIn = 0, big3 = 0, all5 = 0;                                          // how much of the time the trends line up
  for (let i = 0; i < st.n; i++) { const r = st.a.subarray(i * S.C, i * S.C + S.C); if (r[0] < from || r[0] >= to) continue; rowsIn++; if (W3(r)) big3++; if (C5(r)) all5++; }
  const onsets = sig(C5, { onset: true }).length, partial = m.years.filter(y => (y.y === Y0 && new Date(from * 1000).getUTCMonth() > 0) || (y.y === Y1 && new Date(to * 1000).getUTCMonth() < 11)).map(y => y.y);
  const out = {
    updated: iso(Date.now() / 1000 + 8 * 3600), from: iso(from), to: iso(to), years: r2(yrs, 1), dataFrom: iso(dataFrom), signals: onsets, signalsWhileOpen: onsets - m.n - m.shut, signalsShut: m.shut, aligned: { big3: r2(big3 / rowsIn * 100, 0), all5: r2(all5 / rowsIn * 100, 0) }, partialYears: partial, priceFrom: Math.round(p0), priceTo: Math.round(p1),
    source: "现货金 XAU/USD 的 1 分钟买价 K 线（Dukascopy），约 " + Math.round(X.n / 1e5) / 10 + " 百万根，日线按纽约 17:00 换日。历史从 " + iso(dataFrom) + " 开始，头一年多只用来让周线攒够 60 根 K 线，成绩从 " + iso(from) + " 算起。",
    costs: "点差按价格的万分之 1.5（现在约 0.63 美元），做多的隔夜利息按年化 7.5%，做空不计利息；信号出现后 1 分钟按市价进场，止损和目标同一分钟都碰到时算止损。",
    main: "go3r", order: ["go3r", "gotrail", "late1r", "early", "tight", "d4", "old", "against", "long"], rules: R,
    findings: [
      { b: "只做三个大周期同向的那一边。", t: "顺着做，平均每笔 " + sg(m.avgR) + "R；逆着做，平均每笔 " + sg(a.avgR) + "R，" + r2(yrs, 1) + " 年累计亏掉 " + Math.round(Math.abs(a.totalR)) + "R。" },
      { b: "等小周期也转回来再进。", t: "大方向对了就急着进，" + e.n + " 笔平均每笔 " + sg(e.avgR) + "R，等于白做；等 1 小时和 15 分钟也同向再进，才是 " + sg(m.avgR) + "R。" },
      { b: "信号走了一段再进也可以。", t: "价格已经顺着走了 1R 才进、止损按那时的价格重新放 3 倍波幅：" + l.n + " 笔，平均每笔 " + sg(l.avgR) + "R，和信号刚出现时进（" + sg(m.avgR) + "R）差不多。要紧的是止损从自己的入场价算，不沿用信号当时的止损。" },
      { b: "止损要放宽。", t: "同样的信号，止损从 3 倍小时波幅缩到 1.5 倍：平均每笔从 " + sg(m.avgR) + "R 降到 " + sg(g.avgR) + "R，最长连亏从 " + m.streak + " 笔变成 " + g.streak + " 笔，最深回撤从 " + Math.round(m.maxDD) + "R 变成 " + Math.round(g.maxDD) + "R。" },
      { b: "旧版的入场信号没有优势。", t: "日线和 4 小时同向、价格进缺口、15 分钟出现转折，也就是这页以前说「可以考虑」的情形：" + num(o.n) + " 笔里 " + Math.round(o.win) + "% 是赚的，但平均每笔 " + sg(o.avgR) + "R，因为赚的时候赚得少、亏的时候亏得多。" },
      { b: "不设目标、用跟踪止损，结果略好。", t: "平均每笔 " + sg(t.avgR) + "R、最深回撤 " + Math.round(t.maxDD) + "R（设 3R 目标是 " + sg(m.avgR) + "R、" + Math.round(m.maxDD) + "R）。代价是更靠少数大单：最好的 5 笔占了总利润的 " + Math.round(t.top5 / t.totalR * 100) + "%。" },
      { b: "做多比做空好，但两边都是正的。", t: "做多平均每笔 " + sg(m.long.avgR) + "R，做空 " + sg(m.short.avgR) + "R。要记得这段历史里金价从 " + num(p0) + " 美元涨到了 " + num(p1) + " 美元。" },
      // from track.js (PAXG against spot, 2021-2026)
      { b: "为什么换了数据源。", t: "这页以前用金价代币 PAXG 的 K 线。拿它和真实现货逐分钟比：它算出的「昨日高低点」有 41% 的时候差 5 美元以上，只有 28% 在 2 美元以内；两者的差价一天之内就会漂移 3 到 10 美元。现在直接用现货金的 K 线。" },
    ],
    caveats: [
      { b: "这不是印钞机。", t: m.years.length + " 个年份里有 " + bad.length + " 个是亏的（" + bad.join("、") + "）。最长连亏 " + m.streak + " 笔，最深回撤 " + Math.round(m.maxDD) + "R：每笔冒 1% 的话就是账户的 " + Math.round(m.maxDD) + "%，所以建议每笔只冒 0.5% 或更少。" },
      { b: "三段历史的成绩差很多。", t: "定规则之前没看过的 " + Y0 + "–2018：平均每笔 " + sg(s1.avgR) + "R，几乎只是打平。定规则时用的 2019–2023：" + sg(s2.avgR) + "R。2024–" + Y1 + "：" + sg(s3.avgR) + "R，因为这几年黄金走出了大趋势。以后的年份更可能像前两段，而不是最后一段。" },
      { b: "回放不是实盘。", t: "回放假设每个信号都在 1 分钟内进场，不犹豫、不漏单、不提前平仓，一做就是十几年。大数据公布时的滑点只按 1 分钟 K 线估算。真人执行的结果通常会差一些。" },
      { b: "成本是估的。", t: "各家平台的点差和隔夜利息不一样。持仓通常要过一两夜，利息对结果的影响不小；你的平台更贵的话，结果会更差。" },
    ],
  };
  // the chart-pattern check (pattern_check.js --write) keeps its results in the same file: carry them over
  try { const old = JSON.parse(fs.readFileSync(L.REPO + "/data/xau-backtest.json", "utf8")); if (old.patterns) out.patterns = old.patterns; if (old.shortTerm) out.shortTerm = old.shortTerm; } catch (e) { /* first run */ }
  fs.writeFileSync(L.REPO + "/data/xau-backtest.json", JSON.stringify(out, null, 1) + "\n");
  console.log("\nwrote data/xau-backtest.json");
}
