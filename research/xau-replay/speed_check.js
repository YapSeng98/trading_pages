// Can the gold signal come sooner? The test written down in SPEED-PLAN.md, before any of these numbers were seen.
// Needs data/speed_states.bin and data/speed_states_s3.bin (speed_states.js).
// usage: node --max-old-space-size=6000 speed_check.js [--write]    (--write keeps the result in speed-result.json)
//        MARKET=btc node ... speed_check.js [--write]               (Bitcoin: speed-result-btc.json, information only)
const L = require("./lib"), S = require("./sim"), fs = require("fs"), path = require("path");
const write = process.argv.includes("--write"), BTC = process.env.MARKET === "btc", ALIGN = BTC ? "utc" : "ny";
const C = 22, load = tag => { const b = fs.readFileSync(L.DATA + "/" + tag + ".bin"); return new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const A = load(BTC ? "speed_states_btc" : "speed_states"), A3 = load(BTC ? "speed_states_btc_s3" : "speed_states_s3"), n = A.length / C, X = BTC ? L.source("btc", 2017, 2026) : L.source("duk", 2010, 2026);
if (A3.length !== A.length) throw new Error("the two state files differ in length");
const T = i => A[i * C], TR = (i, tf) => A[i * C + 1 + tf], HI = (i, tf) => A[i * C + 6 + tf], LO = (i, tf) => A[i * C + 11 + tf], INT = (i, tf) => A[i * C + 16 + tf - 1], ATR = i => A[i * C + 20], PX = i => A[i * C + 21], S3 = (i, tf) => A3[i * C + 1 + tf];
const W = 0, D = 1, H4 = 2, H1 = 3, M15 = 4, TFN = ["W", "D", "4H", "1H", "15M"];
let first = -1; for (let i = 0; i < n; i++) if (!Number.isNaN(TR(i, W))) { first = i; break; }
const from = T(first), to = Math.min(T(n - 1), X.t[X.n - 1]), yrs = (to - from) / 86400 / 365.25;
const same = v => { const d = v[0]; if (!d || Number.isNaN(d)) return 0; for (const x of v) if (x !== d) return 0; return d; };
const big3 = i => same([TR(i, W), TR(i, D), TR(i, H4)]), all5 = i => same([TR(i, W), TR(i, D), TR(i, H4), TR(i, H1), TR(i, M15)]);
const base = BTC ? { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 3, swapRate: 0.15, swapRateShort: 0.15, swapDaily: true } : { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 1.5, swapRate: 0.075 }, T3 = { stopAtr: 3, mgmt: "fix", fixR: 3 }, TRAIL = { stopAtr: 3, mgmt: "trail", trail: 2, trailEvery: 86400, regimeExit: true };
const iso = t => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ");

// ---- signals on closed candles (what rowSignals does, on these states) ----
function closed(cond, regime) {
  const out = []; let prev = 0, open = [];
  for (let i = 0; i < n; i++) {
    const t = T(i); if (t < from) continue; if (t >= to) break;
    const dir = cond(i), reg = regime(i);
    if (open.length && reg !== open[0].dir) { open.forEach(s => { s.regimeEnd = t + 60; }); open = []; }
    if (dir && dir !== prev) { const s = { t: t + 60, dir, p: PX(i), atr: ATR(i), regimeEnd: 0, i }; out.push(s); open.push(s); }
    prev = dir;
  }
  return out;
}
// the first close after `after` where the closed big three no longer point this way
function regimeEndFrom(sigs, graceTf) {
  let j = 0;
  sigs.forEach(s => {
    const grace = graceTf ? L.bucket(s.t, graceTf, ALIGN) + L.DUR[graceTf] : s.t;
    while (j < n && T(j) < s.t) j++;
    let q = j; while (q < n && T(q) < grace) q++;
    for (; q < n; q++) if (big3(q) !== s.dir) { s.regimeEnd = T(q) + 60; break; }
  });
  return sigs;
}
// ---- group A: chosen timeframes count as turned at the first 1-minute close beyond their level ----
function preview(P) {
  const out = []; let i = first, prev = 0, seen = -1;
  for (let k = L.lowerBound(X.t, from); k < X.n; k++) {
    const t = X.t[k]; if (t >= to) break;
    while (i + 1 < n && T(i + 1) <= t) i++;
    if (T(i) > t || t - T(i) >= 900) continue;
    if (i !== seen) {                                             // a close that completes the five is known at the close, as in the baseline
      seen = i; const c5 = all5(i);
      if (c5 && c5 !== prev) { out.push({ t: T(i) + 60, dir: c5, p: PX(i), atr: ATR(i), regimeEnd: 0, i }); prev = c5; }
    }
    const c = X.c[k], v = [TR(i, W), TR(i, D), TR(i, H4), TR(i, H1), TR(i, M15)];
    for (const tf of P) { if (c > HI(i, tf)) v[tf] = 1; else if (c < LO(i, tf)) v[tf] = -1; }
    const on = same(v);
    if (on && on !== prev) out.push({ t: t + 120, dir: on, p: c, atr: ATR(i), regimeEnd: 0, i });   // known at the minute's close; in 2 minutes later, like the baseline
    prev = on;
  }
  const big = P.includes(W) ? "W" : P.includes(D) ? "D" : P.includes(H4) ? "4H" : null;
  return regimeEndFrom(out, big);
}
// ---- A5: a resting stop order at the level the small timeframes still need ----
function stopOrder() {
  const out = []; let i = first, prev = 0, seen = -1, firedAt = {};
  for (let k = L.lowerBound(X.t, from); k < X.n; k++) {
    const t = X.t[k]; if (t >= to) break;
    while (i + 1 < n && T(i + 1) <= t) i++;
    if (T(i) > t || t - T(i) >= 900) continue;
    if (i !== seen) { seen = i; const c5 = all5(i); if (c5 && c5 !== prev) out.push({ t: T(i) + 60, dir: c5, p: PX(i), atr: ATR(i), regimeEnd: 0, i }); prev = c5; }
    const dir = big3(i); if (!dir || all5(i)) continue;
    let lv = null, ok = true;
    for (const tf of [H1, M15]) { if (TR(i, tf) === dir) continue; const x = dir > 0 ? HI(i, tf) : LO(i, tf); if (Number.isNaN(x)) { ok = false; break; } lv = lv === null ? x : dir > 0 ? Math.max(lv, x) : Math.min(lv, x); }
    if (!ok || lv === null || firedAt[dir] === lv) continue;
    if (dir > 0 ? X.h[k] >= lv : X.l[k] <= lv) { firedAt[dir] = lv; const px = dir > 0 ? Math.max(X.o[k], lv) : Math.min(X.o[k], lv); out.push({ t: t - 60, dir, p: px, fill: px, atr: ATR(i), regimeEnd: 0, i }); }
  }
  return regimeEndFrom(out, null);
}
const big = big3;
const VERSIONS = {
  A1: ["15M 按 1 分钟收盘提前算", () => preview([M15])],
  A2: ["15M、1H 提前算", () => preview([M15, H1])],
  A3: ["15M、1H、4H 提前算", () => preview([M15, H1, H4])],
  A4: ["五个周期都提前算", () => preview([M15, H1, H4, D, W])],
  A5: ["A2 改成挂在价位上的止损单", () => stopOrder()],
  B1: ["不等 15M", () => closed(i => same([TR(i, W), TR(i, D), TR(i, H4), TR(i, H1)]), big)],
  B2: ["不等 1H", () => closed(i => same([TR(i, W), TR(i, D), TR(i, H4), TR(i, M15)]), big)],
  B3: ["不看周线", () => closed(i => same([TR(i, D), TR(i, H4), TR(i, H1), TR(i, M15)]), i => same([TR(i, D), TR(i, H4)]))],
  B4: ["不看周线和日线", () => closed(i => same([TR(i, H4), TR(i, H1), TR(i, M15)]), i => same([TR(i, H4)]))],
  C1: ["1H、15M 用 2 根摆动", () => closed(i => same([TR(i, W), TR(i, D), TR(i, H4), INT(i, H1), INT(i, M15)]), big)],
  C2: ["4H、1H、15M 用 2 根摆动", () => closed(i => same([TR(i, W), TR(i, D), INT(i, H4), INT(i, H1), INT(i, M15)]), i => same([TR(i, W), TR(i, D), INT(i, H4)]))],
  C3: ["1H、15M 用 3 根摆动", () => closed(i => same([TR(i, W), TR(i, D), TR(i, H4), S3(i, H1), S3(i, M15)]), big)],
  C4: ["4H、1H、15M 用 3 根摆动", () => closed(i => same([TR(i, W), TR(i, D), S3(i, H4), S3(i, H1), S3(i, M15)]), i => same([TR(i, W), TR(i, D), S3(i, H4)]))],
};
const SEG = BTC ? [["2018-2020", 0, Date.UTC(2021, 0, 1) / 1000], ["2021-2023", Date.UTC(2021, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["2024-2026", Date.UTC(2024, 0, 1) / 1000, 1e12]]
  : [["2011-2018", 0, Date.UTC(2019, 0, 1) / 1000], ["2019-2023", Date.UTC(2019, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["2024-2026", Date.UTC(2024, 0, 1) / 1000, 1e12]];
const r3 = v => (v === undefined || v === null || Number.isNaN(v) ? null : +v.toFixed(3)), r1 = v => (v === undefined || v === null || Number.isNaN(v) ? null : +v.toFixed(1));
function pack(tr) {
  const s = S.stats(tr);
  return { n: s.n, win: r1(s.win), avgR: r3(s.avgR), lo: r3(s.lo), hi: r3(s.hi), totalR: r1(s.totalR), rPerYear: r3(s.totalR / yrs), maxDD: r1(s.maxDD), streak: s.maxLoseStreak, pf: s.pf === Infinity ? null : r3(s.pf),
    seg: SEG.map(([label, a, b]) => { const q = S.stats(tr.filter(x => x.t >= a && x.t < b)); return { label, n: q.n, avgR: q.n ? r3(q.avgR) : null }; }) };
}
const yearOf = t => new Date(t * 1000).getUTCFullYear();
const perYear = tr => { const m = {}; tr.forEach(x => { const y = yearOf(x.t), e = m[y] = m[y] || { s: 0, c: 0 }; e.s += x.R; e.c++; }); return m; };

// ---- baseline: must reproduce report.js ----
const baseSigs = closed(all5, big);
const baseTr = S.run(baseSigs, X, Object.assign({}, base, T3)), baseTrail = S.run(baseSigs, X, Object.assign({}, base, TRAIL));
const B0 = pack(baseTr), B0t = pack(baseTrail);
console.log("scored", iso(from), "->", iso(to), yrs.toFixed(1) + " yrs | signals", baseSigs.length);
console.log("BASELINE 3R   ", JSON.stringify(B0));
console.log("BASELINE trail", JSON.stringify(B0t));
const known = JSON.parse(fs.readFileSync(L.REPO + (BTC ? "/data/btc-backtest.json" : "/data/xau-backtest.json"), "utf8")).rules.go3r;
if (process.env.BASE_ONLY) process.exit(0);

// ---- part 1: where the time goes ----
const part1 = (() => {
  const by = {}, wait = [], moved = [], gone = [];
  for (const s of baseSigs) {
    const i = s.i, d = s.dir; let tf = -1;
    if (i > 0) for (const q of [W, D, H4, H1, M15]) if (TR(i, q) === d && TR(i - 1, q) !== d) { tf = q; break; }   // the biggest timeframe that turned on this close
    by[tf < 0 ? "?" : TFN[tf]] = (by[tf < 0 ? "?" : TFN[tf]] || 0) + 1;
    const dist = 3 * s.atr;
    if (tf >= 0) {
      const lv = d > 0 ? HI(i - 1, tf) : LO(i - 1, tf);
      if (!Number.isNaN(lv)) {
        const start = L.bucket(T(i) - 1, TFN[tf], ALIGN); let k = L.lowerBound(X.t, start), f = -1;
        for (; k < X.n && X.t[k] < T(i); k++) if ((X.c[k] - lv) * d > 0) { f = k; break; }
        if (f >= 0) { const w = (T(i) - (X.t[f] + 60)) / 60; wait.push({ tf: TFN[tf], w: Math.max(0, w), r: (s.p - X.c[f]) * d / dist }); }
      }
    }
    let j = i; while (j > 0 && TR(j, H1) === d && T(i) - T(j) < 14 * 86400) j--;
    let js = j; while (js > 0 && TR(js, H1) !== d && T(i) - T(js) < 14 * 86400) js--;
    const ka = L.lowerBound(X.t, T(js)), kb = L.lowerBound(X.t, T(i)); let ext = s.p;
    for (let k = ka; k < kb; k++) ext = d > 0 ? Math.min(ext, X.l[k]) : Math.max(ext, X.h[k]);
    gone.push((s.p - ext) * d / dist);
  }
  const q = (a, p) => r3(L.quant(a, p)), byTf = {};
  TFN.forEach(tf => { const w = wait.filter(x => x.tf === tf); if (w.length) byTf[tf] = { n: w.length, medianMin: r1(L.quant(w.map(x => x.w), 0.5)), p90Min: r1(L.quant(w.map(x => x.w), 0.9)), medianR: q(w.map(x => x.r), 0.5), meanR: r3(L.mean(w.map(x => x.r))) }; });
  const mfe = baseTr.map(x => x.mfeR);
  return { signals: baseSigs.length, decidedBy: by, waitByTf: byTf, waitAll: { medianMin: r1(L.quant(wait.map(x => x.w), 0.5)), p90Min: r1(L.quant(wait.map(x => x.w), 0.9)), medianR: q(wait.map(x => x.r), 0.5), meanR: r3(L.mean(wait.map(x => x.r))) },
    goneR: { median: q(gone, 0.5), p25: q(gone, 0.25), p75: q(gone, 0.75) }, afterMfeR: { median: q(mfe, 0.5), p75: q(mfe, 0.75) } };
})();

// ---- big moves: legs of at least 5 daily ATR on daily closes ----
const legs = (() => {
  const K = L.aggregate(X, "D", ALIGN, BTC ? null : L.spotClosed), out = []; let atr = 0, dir = 0, pv = 0, pvT = 0, ex = 0, exT = 0;
  K.forEach((b, i) => {
    const pc = i ? K[i - 1][4] : b[4], tr = Math.max(b[2] - b[3], Math.abs(b[2] - pc), Math.abs(b[3] - pc));
    atr = i < 14 ? (atr * i + tr) / (i + 1) : (atr * 13 + tr) / 14;
    const c = b[4], t = (b[6] + 1) / 1000;
    if (i < 14) { pv = ex = c; pvT = exT = t; return; }
    if (!dir) { if (c - pv >= 5 * atr) { dir = 1; ex = c; exT = t; } else if (pv - c >= 5 * atr) { dir = -1; ex = c; exT = t; } return; }
    if ((c - ex) * dir > 0) { ex = c; exT = t; }
    else if ((ex - c) * dir >= 5 * atr) { out.push({ dir, a: pv, aT: pvT, b: ex, bT: exT }); dir = -dir; pv = ex; pvT = exT; ex = c; exT = t; }
  });
  return out.filter(l => l.aT >= from && l.bT < to);
})();
function capture(sigs) {
  let hit = 0; const hours = [], used = [];
  legs.forEach(l => { const s = sigs.find(x => x.dir === l.dir && x.t >= l.aT && x.t < l.bT); if (!s) return; hit++; hours.push((s.t - l.aT) / 3600); used.push((s.p - l.a) / (l.b - l.a) * 100); });
  return { legs: legs.length, caught: hit, caughtPct: r1(hit / legs.length * 100), medianHours: r1(L.quant(hours, 0.5)), medianUsedPct: r1(L.quant(used, 0.5)) };
}

// ---- part 2: what being late costs ----
const part2 = [2, 5, 15, 30, 60, 120, 240, 480].map(m => { const tr = S.run(baseSigs, X, Object.assign({}, base, T3, { delay: m - 1 })), p = pack(tr); return { lateMin: m, n: p.n, win: p.win, avgR: p.avgR, lo: p.lo, hi: p.hi, maxDD: p.maxDD, rPerYear: p.rPerYear, seg: p.seg.map(x => x.avgR) }; });

// ---- part 3: the thirteen versions ----
const rows = {};
for (const id of Object.keys(VERSIONS)) {
  const [name, fn] = VERSIONS[id], sigs = fn().sort((a, b) => a.t - b.t);
  const tr = S.run(sigs, X, Object.assign({}, base, T3)), trail = S.run(sigs, X, Object.assign({}, base, TRAIL));
  // how much sooner, against the baseline's signals
  const leads = [], gains = []; let beat = 0, prevB = 0;
  for (const b of baseSigs) {
    const lo = Math.max(b.t - 48 * 3600, prevB); let f = null;
    for (const v of sigs) { if (v.t >= b.t) break; if (v.t > lo && v.dir === b.dir) { f = v; break; } }
    if (f) { beat++; leads.push((b.t - f.t) / 60); gains.push((b.p - f.p) * b.dir / (3 * b.atr)); }
    prevB = b.t;
  }
  // how often an early signal was followed by the baseline's within a day
  let conf = 0; sigs.forEach(v => { if (baseSigs.some(b => b.dir === v.dir && b.t >= v.t && b.t - v.t <= 86400)) conf++; });
  rows[id] = { id, name, signals: sigs.length, r3: pack(tr), trail: pack(trail), capture: capture(sigs), beatShare: r1(beat / baseSigs.length * 100), medianLeadMin: r1(L.quant(leads, 0.5)), meanGainR: r3(L.mean(gains)), confirmedPct: r1(conf / sigs.length * 100), tr, sigs };
}
// non-inferiority: chance the average is over 0.05R below the baseline's, resampling whole years with the same draws
const YEARS = []; for (let y = yearOf(from); y <= yearOf(to); y++) YEARS.push(y);
const pb = perYear(baseTr), DRAWS = 5000;
Object.values(rows).forEach(r => {
  const pv = perYear(r.tr), rnd = L.rng(20261105), diffs = new Float64Array(DRAWS); let worse = 0;
  for (let d = 0; d < DRAWS; d++) {
    let sa = 0, ca = 0, sb = 0, cb = 0;
    for (let q = 0; q < YEARS.length; q++) { const y = YEARS[(rnd() * YEARS.length) | 0], a = pv[y], b = pb[y]; if (a) { sa += a.s; ca += a.c; } if (b) { sb += b.s; cb += b.c; } }
    const df = (ca ? sa / ca : 0) - (cb ? sb / cb : 0); diffs[d] = df; if (df <= -0.05) worse++;
  }
  r.diff = r3(r.r3.avgR - B0.avgR); r.diffLo = r3(L.quant(diffs, 0.05)); r.diffHi = r3(L.quant(diffs, 0.95)); r.pWorse = worse / DRAWS;
});
const ranked = Object.values(rows).sort((a, b) => a.pWorse - b.pWorse); let mx = 0;
ranked.forEach((r, k) => { mx = Math.max(mx, Math.min(1, r.pWorse * (ranked.length - k))); r.pHolm = +mx.toFixed(4); });
const DD_MAX = B0.maxDD * 1.25, RY_MIN = B0.rPerYear * 0.9;
Object.values(rows).forEach(r => {
  const q = r.r3;
  r.tests = { faster: r.medianLeadMin >= 5 && r.beatShare >= 50, notWorse: r.pHolm < 0.10, everyPeriod: q.seg.every(x => x.avgR > 0), drawdown: q.maxDD <= DD_MAX, perYear: q.rPerYear >= RY_MIN };
  r.pass = Object.values(r.tests).every(Boolean);
  if (r.pass) { const c3 = S.run(VERSIONS[r.id][1]().sort((a, b) => a.t - b.t), X, Object.assign({}, base, T3, { spreadBp: base.spreadBp * 2 })); r.spread3 = pack(c3); }
});

// ---- exploratory: added after the results above were seen. Nothing here can pass or fail a version ----
const explore = (() => {
  // the nearest earlier signal, not the first in the 48 hours: the first is often an older false start
  const nearest = {};
  Object.values(rows).forEach(r => {
    const ld = [], gn = []; let prevB = 0;
    for (const b of baseSigs) {                                       // after the previous baseline signal, so that signal's own twin does not count
      const lo = Math.max(b.t - 48 * 3600, prevB); let f = null;
      for (const v of r.sigs) { if (v.t >= b.t) break; if (v.t > lo && v.dir === b.dir) f = v; }
      if (f) { ld.push((b.t - f.t) / 60); gn.push((b.p - f.p) * b.dir / (3 * b.atr)); }
      prevB = b.t;
    }
    nearest[r.id] = { beatPct: r1(ld.length / baseSigs.length * 100), medianMin: r1(L.quant(ld, 0.5)), meanGainR: r3(L.mean(gn)) };
  });
  // preview without firing again while the closed candles already show all five: only a look ahead of a close that has not come
  function previewNoRefire(P) {
    const out = []; let i = first, prev = 0, seen = -1;
    for (let k = L.lowerBound(X.t, from); k < X.n; k++) {
      const t = X.t[k]; if (t >= to) break;
      while (i + 1 < n && T(i + 1) <= t) i++;
      if (T(i) > t || t - T(i) >= 900) continue;
      const c5 = all5(i);
      if (i !== seen) { seen = i; if (c5 && c5 !== prev) { out.push({ t: T(i) + 60, dir: c5, p: PX(i), atr: ATR(i), regimeEnd: 0, i }); prev = c5; } }
      if (c5) { prev = c5; continue; }
      const c = X.c[k], v = [TR(i, W), TR(i, D), TR(i, H4), TR(i, H1), TR(i, M15)];
      for (const tf of P) { if (c > HI(i, tf)) v[tf] = 1; else if (c < LO(i, tf)) v[tf] = -1; }
      const on = same(v);
      if (on && on !== prev) out.push({ t: t + 120, dir: on, p: c, atr: ATR(i), regimeEnd: 0, i });
      prev = on;
    }
    return regimeEndFrom(out, null);
  }
  const noRefire = {};
  [["A1x", [M15]], ["A2x", [M15, H1]]].forEach(([id, P]) => { const sg = previewNoRefire(P), p = pack(S.run(sg, X, Object.assign({}, base, T3))); noRefire[id] = { signals: sg.length, r3: p }; });
  // A5 under worse fills, against the baseline at the same spread
  const a5 = rows.A5.sigs, slip = bp => a5.map(s => (s.fill === undefined ? s : Object.assign({}, s, { fill: s.fill * (1 + s.dir * bp / 10000) })));
  const costs = { baseSpread3: pack(S.run(baseSigs, X, Object.assign({}, base, T3, { spreadBp: base.spreadBp * 2 }))).avgR, a5Spread3: pack(S.run(a5, X, Object.assign({}, base, T3, { spreadBp: base.spreadBp * 2 }))).avgR };
  [1, 2, 3, 5].forEach(bp => { const p = pack(S.run(slip(bp), X, Object.assign({}, base, T3))); costs["a5Slip" + bp] = { avgR: p.avgR, rPerYear: p.rPerYear, maxDD: p.maxDD }; });
  // how often that resting order would have to be moved
  let changes = 0, waitRows = 0, last = null; const life = []; let lifeStart = 0;
  for (let i = first; i < n; i++) {
    const dir = big3(i); if (!dir || all5(i)) { last = null; continue; }
    let lv = null, ok = true;
    for (const tf of [H1, M15]) { if (TR(i, tf) === dir) continue; const x = dir > 0 ? HI(i, tf) : LO(i, tf); if (Number.isNaN(x)) { ok = false; break; } lv = lv === null ? x : dir > 0 ? Math.max(lv, x) : Math.min(lv, x); }
    if (!ok || lv === null) continue;
    waitRows++;
    if (lv !== last) { changes++; if (last !== null) life.push((T(i) - lifeStart) / 3600); last = lv; lifeStart = T(i); }
  }
  const orderMoves = { perDay: r1(changes / (waitRows * 900 / 86400)), medianHoursLevelStays: r1(L.quant(life, 0.5)), waitingSharePct: r1(waitRows / (n - first) * 100) };
  // B3 (no weekly) in full: the one version that changes how big moves are caught
  const b3 = rows.B3, by = (tr, m = {}) => { tr.forEach(x => { const y = yearOf(x.t); m[y] = (m[y] || 0) + x.R; }); return m; };
  const yb = by(baseTr), y3 = by(b3.tr), table = YEARS.map(y => ({ y, base: r1(yb[y] || 0), b3: r1(y3[y] || 0) }));
  const rnd = L.rng(777); let more = 0; for (let d = 0; d < DRAWS; d++) { let s = 0; for (let q = 0; q < YEARS.length; q++) { const y = YEARS[(rnd() * YEARS.length) | 0]; s += (y3[y] || 0) - (yb[y] || 0); } if (s > 0) more++; }
  const side = (tr, d) => { const q = S.stats(tr.filter(x => x.dir === d)); return { n: q.n, avgR: r3(q.avgR) }; };
  const shows = {
    trail: { base: { n: B0t.n, avgR: B0t.avgR, rPerYear: B0t.rPerYear, maxDD: B0t.maxDD }, b3: { n: b3.trail.n, avgR: b3.trail.avgR, rPerYear: b3.trail.rPerYear, maxDD: b3.trail.maxDD, seg: b3.trail.seg.map(x => x.avgR) } },
    spread3: pack(S.run(b3.sigs, X, Object.assign({}, base, T3, { spreadBp: base.spreadBp * 2 }))).avgR, long: side(b3.tr, 1), short: side(b3.tr, -1), baseLong: side(baseTr, 1), baseShort: side(baseTr, -1),
    losingYears: { base: table.filter(x => x.base < 0).length, b3: table.filter(x => x.b3 < 0).length }, moreRPct: r1(more / DRAWS * 100), years: table };
  const captures = {}; Object.values(rows).forEach(r => { captures[r.id] = r.capture; });
  return { note: "after the results were seen; cannot pass or fail a version", nearest, noRefire, costs, orderMoves, b3: shows, captures };
})();

// ---- print ----
console.log("\nreproduces report.js? go3r in the file: n", known.n, "avg", known.avgR, "maxDD", known.maxDD);
console.log("\nPART 1", JSON.stringify(part1, null, 1));
console.log("\nbig moves (5 daily ATR on closes): baseline", JSON.stringify(capture(baseSigs)));
console.log("\nPART 2  late(min)  n  win  avgR [lo,hi]  maxDD  R/yr  periods");
part2.forEach(p => console.log(String(p.lateMin).padStart(5), String(p.n).padStart(5), String(p.win).padStart(5), String(p.avgR).padStart(7), "[" + p.lo + "," + p.hi + "]", String(p.maxDD).padStart(6), String(p.rPerYear).padStart(6), p.seg.join(" / ")));
console.log("\nPART 3 (3R)");
console.log("id   n     win   avgR   diff [5%,95%]        pWorse pHolm  maxDD  R/yr   periods                 beat%  lead  gainR  conf%  legs caught used%  trailAvg trailDD  PASS");
Object.keys(rows).forEach(id => { const r = rows[id], q = r.r3; console.log(id.padEnd(3), String(q.n).padStart(5), String(q.win).padStart(5), String(q.avgR).padStart(7), String(r.diff).padStart(7), ("[" + r.diffLo + "," + r.diffHi + "]").padEnd(16), String(r.pWorse.toFixed(3)).padStart(6), String(r.pHolm.toFixed(3)).padStart(6), String(q.maxDD).padStart(6), String(q.rPerYear).padStart(6), q.seg.map(x => x.avgR).join(" / ").padEnd(24), String(r.beatShare).padStart(5), String(r.medianLeadMin).padStart(7), String(r.meanGainR).padStart(7), String(r.confirmedPct).padStart(6), String(r.capture.caughtPct).padStart(6), String(r.capture.medianUsedPct).padStart(6), String(r.trail.avgR).padStart(8), String(r.trail.maxDD).padStart(7), r.pass ? "PASS" : "fail: " + Object.keys(r.tests).filter(k => !r.tests[k]).join(",")); });
Object.values(rows).filter(r => r.spread3).forEach(r => console.log(r.id, "spread 3 bp:", JSON.stringify(r.spread3)));
console.log("\nEXPLORATORY", JSON.stringify(explore, null, 1));

if (write) {
  const clean = {}; Object.keys(rows).forEach(id => { const { tr, sigs, ...rest } = rows[id]; clean[id] = rest; });
  fs.writeFileSync(path.join(__dirname, BTC ? "speed-result-btc.json" : "speed-result.json"), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), from: iso(from), to: iso(to), years: r1(yrs), baseline: { r3: B0, trail: B0t, capture: capture(baseSigs) }, part1, part2, versions: clean, passed: Object.values(rows).filter(r => r.pass).map(r => r.id), exploratory: explore }, null, 1) + "\n");
  console.log("\nwrote the result file");
}
