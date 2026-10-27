// Turn replayed engine states into signals, signals into trades, trades into statistics.
const L = require("./lib"), fs = require("fs");
const C = 40;
function loadStates(tag) { const b = fs.readFileSync(L.DATA + "/states_" + tag + ".bin"); const a = new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); return { a, n: a.length / C, tag }; }

// A signal is the minute a condition switches on. level:
//   go      = D+4H agree, price in the entry zone, 15M trigger   (the page's "可以考虑做多/做空")
//   ready   = D+4H agree, price in the entry zone                (the page's "等信号")
//   zone    = price in zone with trigger, whatever the higher timeframes say
//   aligned = D+4H agree (onset of agreement)
function signals(S, sig, o) {
  o = Object.assign({ level: "go", tol: 0.1 }, o);
  const out = [], a = S.a; let j = 0; const prev = { 1: false, "-1": false };
  for (let i = 0; i < S.n; i++) {
    const r = a.subarray(i * C, i * C + C), T = r[0];
    if (o.from && T < o.from) continue; if (o.to && T >= o.to) break;
    if (!(i > 0 && a[(i - 1) * C] === T - 900)) prev[1] = prev[-1] = false;
    while (j < sig.n && sig.t[j] < T) j++;
    for (; j < sig.n && sig.t[j] < T + 900; j++) {
      const p = sig.c[j];
      for (const dir of [1, -1]) {
        const b = dir > 0 ? 10 : 17, zt = r[b], zb = r[b + 1]; let on = false;
        if (!Number.isNaN(zt)) {
          const al = r[7] === dir, inz = p <= zt + o.tol * r[8] && p >= zb - o.tol * r[8], trig = r[b + 6] === 1;
          on = o.level === "go" ? al && inz && trig : o.level === "ready" ? al && inz : o.level === "zone" ? inz && trig : o.level === "aligned" ? al : false;
        }
        if (on && !prev[dir]) out.push({ t: sig.t[j] + 60, dir, p, zt, zb, mid: r[b + 2], stop: r[b + 3], tp1: r[b + 4], tp2: r[b + 5], trig: r[b + 6], atr: r[8], atrD: r[9],
          w: r[1], d: r[2], h4: r[3], h1: r[4], m15: r[5], score: r[6], al: r[7], src: r[dir > 0 ? 36 : 37], h1top: r[24], h1bot: r[25], rsi1h: r[31], rsi4h: r[30], dPct: r[32], h4Pct: r[33], stD: r[34], st4: r[35], iD: r[26], i4: r[27], i1: r[28] });
        prev[dir] = on;
      }
    }
  }
  return out;
}

// A signal at every 15-minute row where cond(row) names a direction (1 / -1). onset: only when it switches on.
// Each signal carries regimeEnd = the first later row where cond no longer names that direction.
function rowSignals(S, sig, cond, o) {
  o = o || {}; const out = [], a = S.a; let prev = 0, open = [];
  for (let i = 0; i < S.n; i++) {
    const r = a.subarray(i * C, i * C + C), T = r[0];
    if (o.from && T < o.from) continue; if (o.to && T >= o.to) break;
    const dir = cond(r) || 0, reg = o.regime ? (o.regime(r) || 0) : dir;
    if (open.length && reg !== open[0].dir) { open.forEach(s => { s.regimeEnd = T + 60; }); open = []; }
    if (dir && (!o.onset || dir !== prev) && (!o.when || o.when(r))) {
      const b = dir > 0 ? 10 : 17;
      const sg = { t: T + 60, dir, p: r[38], zt: r[b], zb: r[b + 1], mid: r[b + 2], stop: r[b + 3], tp1: r[b + 4], tp2: r[b + 5], trig: r[b + 6], atr: r[8], atrD: r[9], w: r[1], d: r[2], h4: r[3], h1: r[4], m15: r[5], score: r[6], al: r[7], stD: r[34], st4: r[35], regimeEnd: 0 };
      out.push(sg); open.push(sg);
    }
    prev = dir;
  }
  return out;
}

// Entering late: one signal per stretch of cond, at the first 15-minute close where price has already gone k x the
// stop distance (3 x 1H ATR at the moment cond switched on) the signal's way, cond still on. The trade's stop is then
// set from that later entry, as the page does for someone arriving late. regimeEnd as in rowSignals.
function lateSignals(S, cond, k, o) {
  o = o || {}; const out = [], a = S.a; let on = null;
  for (let i = 0; i < S.n; i++) {
    const r = a.subarray(i * C, i * C + C), T = r[0];
    if (o.from && T < o.from) continue; if (o.to && T >= o.to) break;
    const d = cond(r) || 0;
    if (!d) { on = null; continue; }
    if (!on || on.dir !== d) { on = { dir: d, p: r[38], dist: 3 * r[8], done: false }; continue; }
    if (!on.done && (r[38] - on.p) * d >= k * on.dist) { on.done = true; out.push({ t: T + 60, dir: d, p: r[38], atr: r[8], regimeEnd: 0 }); }
  }
  if (o.regime) { let j = 0; out.forEach(s => { while (j < S.n && a[j * C] < s.t) j++; for (let q = j; q < S.n; q++) if (o.regime(a.subarray(q * C, q * C + C)) !== s.dir) { s.regimeEnd = a[q * C] + 60; break; } }); }
  return out;
}

// One trade on the execution series X. X is BID prices unless o.mid (then bid/ask sit spread/2 either side).
// Levels are moved onto X's price basis by the gap between the two feeds at the signal minute (what the page's calibration does).
// mgmt: "tp1" all out at TP1 | "tp2" all out at the far target | "half" half at TP1 then stop to entry, rest at TP2 | "fix" fixed multiple of risk
function trade(sg, X, o) {
  const dir = sg.dir, bs = o.barSec || 60;                               // bar length: 60 s, or 900 s on 15-minute bars
  let off = 0;
  if (o.shift) { const k0 = L.lowerBound(X.t, sg.t - 60); if (k0 >= X.n || X.t[k0] - (sg.t - 60) > 120) return null; off = X.c[k0] - sg.p; }
  const te = sg.t + (o.delay || 0) * 60, e = L.lowerBound(X.t, te);
  if (e >= X.n || X.t[e] - te > 300) return null;                       // market shut at entry time
  const sp = o.spreadBp ? X.o[e] * o.spreadBp / 10000 : o.spread, aB = o.mid ? sp / 2 : 0, aA = o.mid ? sp / 2 : sp;   // spreadBp: spread as a share of price
  const entry = dir > 0 ? X.o[e] + aA : X.o[e] - aB;
  let stop = (o.stopAtr ? (dir > 0 ? entry - o.stopAtr * sg.atr : entry + o.stopAtr * sg.atr) : sg.stop + off);
  const risk = (entry - stop) * dir;
  if (!(risk > 0)) return null;                                          // price already through the stop
  let tp1 = sg.tp1 + off, tp2 = sg.tp2 + off;
  if (!((tp1 - entry) * dir > 0)) tp1 = NaN; if (!((tp2 - entry) * dir > 0)) tp2 = NaN;
  if (!Number.isNaN(tp1) && !Number.isNaN(tp2) && !((tp2 - tp1) * dir > 0)) tp2 = NaN;
  const far = !Number.isNaN(tp2) ? tp2 : tp1, near = !Number.isNaN(tp1) ? tp1 : tp2;
  const rr1 = Number.isNaN(near) ? NaN : (near - entry) * dir / risk, rrBest = Number.isNaN(far) ? NaN : (far - entry) * dir / risk;
  let A, Bt;                                                             // first and second target
  if (o.mgmt === "trail") { A = dir > 0 ? Infinity : -Infinity; Bt = NaN; }
  else if (o.mgmt === "fix") { A = entry + dir * o.fixR * risk; Bt = NaN; }
  else if (o.mgmt === "tp1") { A = near; Bt = NaN; }
  else if (o.mgmt === "tp2") { A = far; Bt = NaN; }
  else { A = near; Bt = far === near ? NaN : far; }
  if (Number.isNaN(A)) return { skip: "no target", rr1, rrBest, risk };
  const maxK = Math.min(X.n, e + (o.maxHold || 7200));
  let pnl = 0, left = 1, exitT = null, why = "time", mfe = 0, mae = 0, k = e, best = entry;
  for (; k < maxK; k++) {
    if (k > e && X.t[k] - X.t[k - 1] > 3 * 86400 + 3600) { /* long holiday gap: carry on */ }
    const bo = X.o[k] - aB, bh = X.h[k] - aB, bl = X.l[k] - aB, ao = X.o[k] + aA, ah = X.h[k] + aA, al = X.l[k] + aA;
    if (o.regimeExit && sg.regimeEnd && X.t[k] >= sg.regimeEnd) { pnl += left * (dir > 0 ? bo - entry : entry - ao); left = 0; why = "regime"; exitT = X.t[k] + bs; break; }
    if (o.timeStop && k - e >= o.timeStop) { pnl += left * (dir > 0 ? bo - entry : entry - ao); left = 0; why = "time"; exitT = X.t[k] + bs; break; }
    if (dir > 0) {
      if (bo <= stop) { pnl += left * (bo - entry); left = 0; why = "stop"; }
      else if (bl <= stop) { pnl += left * (stop - entry); left = 0; why = "stop"; }
      else {
        mae = Math.min(mae, bl - entry);
        if (bh >= A) {
          if (Number.isNaN(Bt)) { pnl += left * (A - entry); left = 0; why = "target"; }
          else if (left === 1) { pnl += 0.5 * (A - entry); left = 0.5; stop = entry; if (bh >= Bt) { pnl += 0.5 * (Bt - entry); left = 0; why = "target2"; } }
          else if (bh >= Bt) { pnl += left * (Bt - entry); left = 0; why = "target2"; }
        } else if (left < 1 && bh >= Bt) { pnl += left * (Bt - entry); left = 0; why = "target2"; }
        mfe = Math.max(mfe, bh - entry);
      }
    } else {
      if (ao >= stop) { pnl += left * (entry - ao); left = 0; why = "stop"; }
      else if (ah >= stop) { pnl += left * (entry - stop); left = 0; why = "stop"; }
      else {
        mae = Math.min(mae, entry - ah);
        if (al <= A) {
          if (Number.isNaN(Bt)) { pnl += left * (entry - A); left = 0; why = "target"; }
          else if (left === 1) { pnl += 0.5 * (entry - A); left = 0.5; stop = entry; if (al <= Bt) { pnl += 0.5 * (entry - Bt); left = 0; why = "target2"; } }
          else if (al <= Bt) { pnl += left * (entry - Bt); left = 0; why = "target2"; }
        } else if (left < 1 && al <= Bt) { pnl += left * (entry - Bt); left = 0; why = "target2"; }
        mfe = Math.max(mfe, entry - al);
      }
    }
    if (left === 0) { exitT = X.t[k] + bs; break; }
    if (o.trail) {
      best = dir > 0 ? Math.max(best, bh) : Math.min(best, al);
      // trailEvery: the stop is only moved at fixed clock times (a person checking in), not tick by tick
      const due = !o.trailEvery || Math.floor((X.t[k] + bs - (o.trailOff || 0)) / o.trailEvery) !== Math.floor((X.t[k] - (o.trailOff || 0)) / o.trailEvery);
      if (due && (!o.trailStart || (best - entry) * dir >= o.trailStart * risk)) { if (dir > 0) stop = Math.max(stop, best - o.trail * risk); else stop = Math.min(stop, best + o.trail * risk); }
    }
    if (o.beAt && ((dir > 0 ? bh - entry : entry - al) >= o.beAt * risk)) { if (dir > 0) stop = Math.max(stop, entry); else stop = Math.min(stop, entry); }
  }
  if (left > 0) { const kk = Math.min(k, X.n - 1); pnl += left * (dir > 0 ? X.c[kk] - aB - entry : entry - (X.c[kk] + aA)); exitT = X.t[kk] + bs; }
  if (why === "stop" && left === 0 && pnl > -1e-9 && o.mgmt === "half") why = "breakeven";
  // overnight financing: charged at each 17:00 New York roll, Monday to Friday, three nights' worth on Wednesday
  let nights = 0;
  if (o.swapLong || o.swapShort || o.swapRate || o.swapRateShort) {
    for (let day = Math.floor(X.t[e] / 86400) * 86400; day <= exitT; day += 86400) {
      if (o.swapDaily) { if (day > X.t[e] && day <= exitT) nights++; continue; }   // crypto: every 00:00 UTC, weekends too
      const roll = day + (L.usDst(day + 43200) ? 21 : 22) * 3600, wd = new Date(roll * 1000).getUTCDay();
      if (roll > X.t[e] && roll <= exitT && wd >= 1 && wd <= 5) nights += wd === 3 ? 3 : 1;
    }
    pnl -= nights * (dir > 0 ? (o.swapLong || 0) + (o.swapRate ? entry * o.swapRate / 360 : 0) : (o.swapShort || 0) + (o.swapRateShort ? entry * o.swapRateShort / 360 : 0));
  }
  return { t: X.t[e], exitT, dir, entry, risk, R: pnl / risk, why, rr1, rrBest, mfeR: mfe / risk, maeR: mae / risk, holdMin: (exitT - X.t[e]) / 60, off, nights, sg };
}

// One position at a time, plus a pause after each entry so one flickering setup is one trade.
function run(sigs, X, o) {
  const out = []; let busy = 0; const lastEntry = { 1: 0, "-1": 0 }; let skipped = 0, noTarget = 0;
  for (const sg of sigs) {
    if (o.filter && !o.filter(sg)) continue;
    if (!o.overlap && sg.t < busy) continue;
    if (sg.t - lastEntry[sg.dir] < (o.cooldown === undefined ? 60 : o.cooldown) * 60) continue;
    const tr = trade(sg, X, o);
    if (!tr) { skipped++; continue; }
    if (tr.skip) { noTarget++; continue; }
    if (o.tradeFilter && !o.tradeFilter(tr)) continue;
    out.push(tr); busy = tr.exitT; lastEntry[sg.dir] = sg.t;
  }
  out.skipped = skipped; out.noTarget = noTarget;
  return out;
}

function stats(tr, o) {
  o = o || {};
  const R = tr.map(x => x.R), n = R.length;
  if (!n) return { n: 0 };
  const wins = R.filter(v => v > 0), losses = R.filter(v => v < 0);
  const gw = wins.reduce((a, b) => a + b, 0), gl = -losses.reduce((a, b) => a + b, 0);
  let eq = 0, peak = 0, dd = 0, streak = 0, maxStreak = 0;
  for (const v of R) { eq += v; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); if (v < 0) { streak++; maxStreak = Math.max(maxStreak, streak); } else if (v > 0) streak = 0; }
  // bootstrap the mean R
  const rnd = L.rng(12345), B = o.boot || 2000, means = new Float64Array(B);
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < n; i++) s += R[(rnd() * n) | 0]; means[b] = s / n; }
  const span = (tr[n - 1].t - tr[0].t) / 86400 / 30.44 || 1;
  const m = L.mean(R), s = L.sd(R);
  return { n, win: wins.length / n * 100, avgR: m, lo: L.quant(means, 0.025), hi: L.quant(means, 0.975), t: s ? m / (s / Math.sqrt(n)) : NaN, totalR: eq, pf: gl ? gw / gl : Infinity, maxDD: dd, maxLoseStreak: maxStreak,
    perMonth: n / span, holdH: L.quant(tr.map(x => x.holdMin), 0.5) / 60, avgWin: L.mean(wins), avgLoss: L.mean(losses), pPos: means.filter(v => v > 0).length / B * 100 };
}
function fmtRow(name, s) {
  if (!s.n) return name.padEnd(34) + " n=0";
  const f = (v, d) => (v === Infinity ? "inf" : v.toFixed(d === undefined ? 2 : d));
  return name.padEnd(34) + " n=" + String(s.n).padStart(4) + "  win " + f(s.win, 0).padStart(3) + "%  avg " + (s.avgR >= 0 ? "+" : "") + f(s.avgR, 3) + "R [" + f(s.lo, 2) + "," + f(s.hi, 2) + "]  total " + f(s.totalR, 0).padStart(5) + "R  PF " + f(s.pf).padStart(5) +
    "  maxDD " + f(s.maxDD, 1).padStart(5) + "R  streak " + String(s.maxLoseStreak).padStart(2) + "  /mo " + f(s.perMonth, 1).padStart(4) + "  hold " + f(s.holdH, 1) + "h  P(avg>0) " + f(s.pPos, 0) + "%";
}
function byKey(tr, fn) { const g = {}; tr.forEach(x => { const k = fn(x); (g[k] = g[k] || []).push(x); }); return g; }

// "Which comes first?" from each signal: +k x unit or -1 x unit. A coin flip gives 1/(1+k).
function firstPassage(sigs, X, o) {
  const ks = o.ks || [1, 2, 3], hit = ks.map(() => 0), tot = ks.map(() => 0); let used = 0;
  let lastT = { 1: 0, "-1": 0 };
  for (const sg of sigs) {
    if (o.filter && !o.filter(sg)) continue;
    if (sg.t - lastT[sg.dir] < (o.cooldown === undefined ? 60 : o.cooldown) * 60) continue;
    const te = sg.t + (o.delay || 0) * 60, e = L.lowerBound(X.t, te); if (e >= X.n || X.t[e] - te > 300) continue;
    const sp = o.spread, aB = o.mid ? sp / 2 : 0, aA = o.mid ? sp / 2 : sp, dir = sg.dir;
    const entry = dir > 0 ? X.o[e] + aA : X.o[e] - aB;
    let off = 0; if (o.shift) { const k0 = L.lowerBound(X.t, sg.t - 60); if (k0 >= X.n || X.t[k0] - (sg.t - 60) > 120) continue; off = X.c[k0] - sg.p; }
    const unit = o.unit === "atr" ? (o.mult || 1) * sg.atr : (entry - (sg.stop + off)) * dir;
    if (!(unit > 0)) continue;
    lastT[sg.dir] = sg.t; used++;
    const stop = entry - dir * unit, maxK = Math.min(X.n, e + (o.maxHold || 7200)), done = ks.map(() => false);
    for (let k = e; k < maxK; k++) {
      const adv = dir > 0 ? X.l[k] - aB : X.h[k] + aA, fav = dir > 0 ? X.h[k] - aB : X.l[k] + aA;
      if ((adv - stop) * dir <= 0) { ks.forEach((_, q) => { if (!done[q]) { done[q] = true; tot[q]++; } }); break; }
      ks.forEach((kk, q) => { if (!done[q] && (fav - (entry + dir * kk * unit)) * dir >= 0) { done[q] = true; tot[q]++; hit[q]++; } });
      if (done.every(Boolean)) break;
    }
  }
  return { used, rows: ks.map((kk, q) => ({ k: kk, n: tot[q], hit: tot[q] ? hit[q] / tot[q] * 100 : NaN, coin: 100 / (1 + kk), exp: tot[q] ? (hit[q] / tot[q]) * kk - (1 - hit[q] / tot[q]) : NaN })) };
}
function fpRow(name, fp) { return name.padEnd(34) + " n=" + String(fp.used).padStart(5) + "  " + fp.rows.map(r => "+" + r.k + " first: " + r.hit.toFixed(1) + "% (coin " + r.coin.toFixed(1) + "%, exp " + (r.exp >= 0 ? "+" : "") + r.exp.toFixed(3) + ")").join("  |  "); }

module.exports = { C, loadStates, signals, rowSignals, lateSignals, trade, run, stats, fmtRow, byKey, firstPassage, fpRow };
