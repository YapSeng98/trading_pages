// Do standard indicators confirm the rule's signals? Written down on 2026-10-27 BEFORE any result was seen:
//   the rule's own trades (five timeframes agree, stop 3 x 1H ATR, target 3R) are split by each indicator at the
//   signal, settings fixed: EMA 20/50/200 stacked the trade's way (daily, 4-hour), RSI(14) on the trade's side of 50
//   (1-hour, 4-hour), MACD(12,26,9) histogram the trade's way (4-hour, daily), ADX(14) at 25 or more (daily, 4-hour).
//   An indicator counts as a confirmation only if its confirmed trades beat the unconfirmed ones in all three gold
//   periods, on Bitcoin, AND on the seven other coins together, with at least 40% of trades confirmed; and, eight
//   being tested, gold's difference must hold with p < 0.05 / 8 (bootstrap).
// usage: node indicator_check.js
const L = require("./lib"), S = require("./sim");
const W3 = r => (r[1] === r[2] && r[2] === r[3] && r[2] !== 0 ? r[2] : 0), C5 = r => (W3(r) && r[4] === r[2] && r[5] === r[2] ? r[2] : 0);
const T3 = { stopAtr: 3, mgmt: "fix", fixR: 3 };
const MKT = [
  { id: "GOLD", tag: "full", src: "duk", y: [2010, 2026], align: "ny", skip: L.spotClosed, ex: { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 1.5, swapRate: 0.075 } },
  { id: "BTC", tag: "btc", src: "btc", y: [2017, 2026], align: "utc", ex: { delay: 1, cooldown: 0, maxHold: 60000, spreadBp: 3, swapRate: 0.15, swapRateShort: 0.15, swapDaily: true } },
].concat(["ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "SOLUSDT"].map(s => ({ id: s, coin: true, tag: "x_" + s.toLowerCase(), src: "bn15:" + s, y: [2017, 2026], align: "utc", ex: { delay: -1, barSec: 900, cooldown: 0, maxHold: 4000, spreadBp: 3, swapRate: 0.15, swapRateShort: 0.15, swapDaily: true } })));

// ---- indicator series on closed candles ----
function ema(a, n) { const k = 2 / (n + 1), o = []; let e = null; for (const v of a) { e = e === null ? v : v * k + e * (1 - k); o.push(e); } return o; }
function macdHist(c) { const m = ema(c, 12).map((v, i) => v - ema(c, 26)[i]); const e26 = ema(c, 26), e12 = ema(c, 12), line = e12.map((v, i) => v - e26[i]), sig = ema(line, 9); return line.map((v, i) => v - sig[i]); }
function adx(hh, ll, cc, n) {
  const out = new Array(cc.length).fill(NaN); let tr = 0, pdm = 0, mdm = 0, adxv = null, dxs = [];
  for (let i = 1; i < cc.length; i++) {
    const t = Math.max(hh[i] - ll[i], Math.abs(hh[i] - cc[i - 1]), Math.abs(ll[i] - cc[i - 1])), up = hh[i] - hh[i - 1], dn = ll[i - 1] - ll[i];
    const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
    if (i <= n) { tr += t; pdm += p; mdm += m; if (i < n) continue; } else { tr = tr - tr / n + t; pdm = pdm - pdm / n + p; mdm = mdm - mdm / n + m; }
    const pdi = tr ? 100 * pdm / tr : 0, mdi = tr ? 100 * mdm / tr : 0, dx = pdi + mdi ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0;
    if (adxv === null) { dxs.push(dx); if (dxs.length === n) adxv = dxs.reduce((a, b) => a + b, 0) / n; } else adxv = (adxv * (n - 1) + dx) / n;
    if (adxv !== null) out[i] = adxv;
  }
  return out;
}
function series(B, tf, align, skip) {
  const K = L.aggregate(B, tf, align, skip), c = K.map(k => k[4]), h = K.map(k => k[2]), l = K.map(k => k[3]);
  return { close: K.map(k => (k[6] + 1) / 1000), hist: macdHist(c), adx: adx(h, l, c, 14) };
}
const at = (s, t) => { let a = 0, b = s.close.length; while (a < b) { const m = (a + b) >> 1; if (s.close[m] <= t) a = m + 1; else b = m; } return a - 1; };   // last candle closed by t

const IND = {
  emaD: ["日线均线 20/50/200 顺着排列", (x, r) => r[34] === x.dir],
  ema4: ["4 小时均线顺着排列", (x, r) => r[35] === x.dir],
  rsi1: ["1 小时 RSI 在 50 的同一边", (x, r) => (x.dir > 0 ? r[31] > 50 : r[31] < 50)],
  rsi4: ["4 小时 RSI 在 50 的同一边", (x, r) => (x.dir > 0 ? r[30] > 50 : r[30] < 50)],
  macd4: ["4 小时 MACD 柱顺着方向", (x, r, q) => q.m4 * x.dir > 0],
  macdD: ["日线 MACD 柱顺着方向", (x, r, q) => q.mD * x.dir > 0],
  adxD: ["日线 ADX ≥ 25（趋势强）", (x, r, q) => q.aD >= 25],
  adx4: ["4 小时 ADX ≥ 25", (x, r, q) => q.a4 >= 25],
};
const res = {};
for (const mk of MKT) {
  const st = S.loadStates(mk.tag), X = L.source(mk.src, mk.y[0], mk.y[1]);
  let ready = -1; for (let i = 0; i < st.n; i++) if (!Number.isNaN(st.a[i * S.C + 1])) { ready = st.a[i * S.C]; break; }
  const from = Math.max(ready, X.t[0]), to = Math.min(st.a[(st.n - 1) * S.C], X.t[X.n - 1]);
  const tr = S.run(S.rowSignals(st, X, C5, { from, to, regime: W3, onset: true }), X, Object.assign({}, mk.ex, T3));
  const s4 = series(X, "4H", mk.align, mk.skip), sD = series(X, "D", mk.align, mk.skip);
  const rowAt = t => { let a = 0, b = st.n; while (a < b) { const m = (a + b) >> 1; if (st.a[m * S.C] <= t) a = m + 1; else b = m; } return st.a.subarray((a - 1) * S.C, a * S.C); };
  res[mk.id] = { coin: !!mk.coin, trades: tr.map(x => { const t = x.sg.t - 60, r = rowAt(t), i4 = at(s4, t), iD = at(sD, t); const q = { m4: s4.hist[i4], mD: sD.hist[iD], a4: s4.adx[i4], aD: sD.adx[iD] }; const tags = {}; for (const [k, [, fn]] of Object.entries(IND)) tags[k] = !!fn(x, r, q); return { R: x.R, t: x.t, tags }; }) };
  process.stderr.write(mk.id + " " + tr.length + " trades\n");
}
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN), f = v => (Number.isNaN(v) ? "  —  " : (v >= 0 ? "+" : "") + v.toFixed(2));
const SEG = [["2011-18", 0, Date.UTC(2019, 0, 1) / 1000], ["2019-23", Date.UTC(2019, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000], ["2024-26", Date.UTC(2024, 0, 1) / 1000, 1e12]];
const coins = Object.values(res).filter(v => v.coin).flatMap(v => v.trades), gold = res.GOLD.trades, btc = res.BTC.trades;
console.log("Rule's trades: gold " + gold.length + ", Bitcoin " + btc.length + ", seven coins " + coins.length + ". Each cell: avg R when confirmed / when not.\n");
console.log("indicator".padEnd(26) + "share  " + SEG.map(s => ("gold " + s[0]).padEnd(17)).join("") + "Bitcoin".padEnd(17) + "7 coins".padEnd(17) + "gold p     verdict");
const rnd = L.rng(31);
for (const [k, [name]] of Object.entries(IND)) {
  const split = q => [mean(q.filter(x => x.tags[k]).map(x => x.R)), mean(q.filter(x => !x.tags[k]).map(x => x.R))];
  const cells = SEG.map(([, a, b]) => split(gold.filter(x => x.t >= a && x.t < b))).concat([split(btc), split(coins)]);
  const share = gold.filter(x => x.tags[k]).length / gold.length;
  // bootstrap the gold difference (confirmed minus not)
  const A = gold.filter(x => x.tags[k]).map(x => x.R), B = gold.filter(x => !x.tags[k]).map(x => x.R); let le = 0;
  for (let b = 0; b < 4000; b++) { let sa = 0, sb = 0; for (let i = 0; i < A.length; i++) sa += A[(rnd() * A.length) | 0]; for (let i = 0; i < B.length; i++) sb += B[(rnd() * B.length) | 0]; if (sa / A.length - sb / B.length <= 0) le++; }
  const p = le / 4000, better = cells.every(c => c[0] > c[1]), pass = better && share >= 0.4 && p < 0.05 / 8;
  console.log(name.padEnd(24) + (share * 100).toFixed(0).padStart(4) + "%  " + cells.map(c => (f(c[0]) + " / " + f(c[1])).padEnd(17)).join("") + p.toFixed(3).padEnd(11) + (pass ? "CONFIRMS" : better ? "better everywhere, not significant" : "no"));
}
