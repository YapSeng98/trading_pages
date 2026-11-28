// How often did the gold page's last-15-minutes heads-up turn into the rule's signal? (2026-11-28)
// The heads-up (XauPlan.soonNeed, alerted by the gold page in strong-signals-only mode): inside the last 15 minutes of the
// biggest candle the signal still waits for, the live price already stands beyond every close still needed for all
// five timeframes to agree. Once per deciding candle and direction. This counts, on the speed study's states (one row
// per 15-minute close, with each timeframe's trend and turning prices) and Dukascopy's 1-minute closes, how many of
// those heads-ups were followed by the signal at that candle's close, how long before the close they came, and how
// many signals had one. The 15-minute window was chosen before this was run. It changes nothing in the rule.
// Needs data/speed_states.bin (speed_states.js). usage: node --max-old-space-size=6000 headsup_check.js [--write]
const L = require("./lib"), fs = require("fs"), path = require("path");
const write = process.argv.includes("--write"), WIN = 900;
const C = 22, b = fs.readFileSync(L.DATA + "/speed_states.bin"), A = new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), n = A.length / C;
const X = L.source("duk", 2010, 2026);
const T = i => A[i * C], TR = (i, tf) => A[i * C + 1 + tf], HI = (i, tf) => A[i * C + 6 + tf], LO = (i, tf) => A[i * C + 11 + tf];
const TFN = ["W", "D", "4H", "1H", "15M"];
const same = v => { const d = v[0]; if (!d || Number.isNaN(d)) return 0; for (const x of v) if (x !== d) return 0; return d; };
const all5 = i => same([0, 1, 2, 3, 4].map(tf => TR(i, tf)));
let first = -1; for (let i = 0; i < n; i++) if (!Number.isNaN(TR(i, 0))) { first = i; break; }
const from = T(first), to = Math.min(T(n - 1), X.t[X.n - 1]);
const byT = new Map(); for (let i = first; i < n; i++) byT.set(T(i), i);

// every heads-up, as the page would send it
const ups = [], told = new Set();
let i = first;
for (let k = L.lowerBound(X.t, from); k < X.n; k++) {
  const t = X.t[k]; if (t >= to) break;
  while (i + 1 < n && T(i + 1) <= t) i++;
  if (T(i) > t || t - T(i) >= 900) continue;
  if (all5(i)) continue;                                                   // a signal is already on
  const c = X.c[k], now = t + 60;                                         // known at the minute's close
  for (const dir of [1, -1]) {
    const miss = [0, 1, 2, 3, 4].filter(tf => TR(i, tf) !== dir); if (!miss.length) continue;
    const lv = miss.map(tf => dir > 0 ? HI(i, tf) : LO(i, tf));
    if (lv.some(p => Number.isNaN(p) || (c - p) * dir <= 0)) continue;
    const tf = TFN[miss[0]], end = L.bucket(t, tf, "ny") + L.DUR[tf];
    if (end - now > WIN || end <= now - 60) continue;
    const key = dir + ":" + tf + ":" + end; if (told.has(key)) continue; told.add(key);
    ups.push({ t: now, dir, tf, end, px: c });
  }
}
// what came at that close: the signal (all five that way at the state written at the close)
ups.forEach(u => { const j = byT.get(u.end); u.known = j !== undefined; u.hit = u.known && all5(j) === u.dir; });
const scored = ups.filter(u => u.known), hits = scored.filter(u => u.hit);
// the signals in the same span, and how many had a heads-up before them
const sigs = []; let prev = 0;
for (let j = first; j < n; j++) { const t = T(j); if (t < from) continue; if (t >= to) break; const d = all5(j); if (d && d !== prev) sigs.push({ t, dir: d }); prev = d; }
const warned = new Set(hits.map(u => u.end + ":" + u.dir)), had = sigs.filter(s => warned.has(s.t + ":" + s.dir));
const lead = hits.map(u => (u.end - u.t) / 60).sort((a, b) => a - b), med = lead.length ? lead[Math.floor(lead.length / 2)] : null;
const byTf = {}; scored.forEach(u => { const g = byTf[u.tf] || (byTf[u.tf] = { n: 0, hit: 0 }); g.n++; if (u.hit) g.hit++; });
const years = (to - from) / 86400 / 365.25;
const res = {
  updated: new Date().toISOString().slice(0, 10), from: new Date(from * 1000).toISOString().slice(0, 10), to: new Date(to * 1000).toISOString().slice(0, 10),
  window: "last 15 minutes of the deciding candle", headsUps: scored.length, perYear: +(scored.length / years).toFixed(1), becameSignal: hits.length,
  hitPct: +(100 * hits.length / Math.max(1, scored.length)).toFixed(1), signals: sigs.length, signalsWarned: had.length,
  warnedPct: +(100 * had.length / Math.max(1, sigs.length)).toFixed(1), leadMinMedian: med,
  big: (function () { const g = scored.filter(u => u.tf !== "15M"), hh = g.filter(u => u.hit), l = hh.map(u => (u.end - u.t) / 60).sort((a, b) => a - b);
    return { note: "deciding candle 1-hour or bigger (split chosen after seeing byTf)", n: g.length, perYear: +(g.length / years).toFixed(1), hitPct: +(100 * hh.length / Math.max(1, g.length)).toFixed(1), leadMinMedian: l.length ? l[Math.floor(l.length / 2)] : null,
      signalsWarned: hh.length, warnedPct: +(100 * hh.length / Math.max(1, sigs.length)).toFixed(1) }; })(),
  signalsPerYear: +(sigs.length / years).toFixed(1),
  byTf: Object.keys(byTf).map(k => ({ tf: k, n: byTf[k].n, hitPct: +(100 * byTf[k].hit / byTf[k].n).toFixed(1) }))
};
console.log(JSON.stringify(res, null, 1));
if (write) {
  const f = path.join(L.REPO, "data", "xau-backtest.json"), J = JSON.parse(fs.readFileSync(f, "utf8"));
  J.headsUp = res; fs.writeFileSync(f, JSON.stringify(J, null, 1) + "\n"); console.log("written to data/xau-backtest.json (headsUp)");
}
