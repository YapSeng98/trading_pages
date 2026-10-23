// Replay the page's engine over history. At every 15-minute close it is given only the candles that had closed by
// then (exactly what the live page gets) and one row of its state is written out.
// usage: node gen_states.js <y0> <y1> [tag=full]
const L = require("./lib"), fs = require("fs");
const [y0s, y1s, tagArg] = process.argv.slice(2);
// MARKET=btc replays Bitcoin (Binance BTCUSDT): it trades around the clock, so candles are cut in plain UTC
// (days from 00:00 UTC, weeks from Monday) and no minute is skipped.
const BTC = process.env.MARKET === "btc";
const y0 = +y0s, y1 = +y1s, tag = tagArg || (BTC ? "btc" : "full"), align = BTC ? "utc" : "ny";
const ctx = L.loadEngine(L.REPO + "/assets/xau-engine.js"), P = L.loadPlan(L.REPO + "/assets/xau-plan.js");
const B = L.source(BTC ? "btc" : "duk", y0, y1);
console.log("spot bars", B.n, new Date(B.t[0] * 1000).toISOString(), "->", new Date(B.t[B.n - 1] * 1000).toISOString());

const TFS = ctx.XAU_TFS.map(c => Object.assign({}, c, { bars: 0 }));
const skip = BTC ? null : L.spotClosed;                       // gold: weekend minutes never reach the engine
const K = {}, ptr = {}, res = {};
TFS.forEach(c => { K[c.tf] = L.aggregate(B, c.tf, align, skip); ptr[c.tf] = 0; res[c.tf] = { tf: c.tf, error: "no data" }; });
console.log("candles", TFS.map(c => c.tf + ":" + K[c.tf].length).join(" "));

const COLS = 40, tr = v => v === "bullish" ? 1 : v === "bearish" ? -1 : v === "unclear" || v === "mixed" ? 0 : NaN;
const nz = v => (typeof v === "number" && isFinite(v) ? v : NaN);
const rows = [];
const first = Math.ceil(B.t[0] / 900) * 900, last = Math.floor(B.t[B.n - 1] / 900) * 900;
const t0 = Date.now(); let steps = 0, calls = 0;
for (let T = first; T <= last; T += 900) {
  const Tms = T * 1000; let moved15 = false;
  for (const c of TFS) {
    const k = K[c.tf]; let p = ptr[c.tf];
    while (p < k.length && k[p][6] < Tms) p++;
    if (p !== ptr[c.tf]) {
      ptr[c.tf] = p; if (c.tf === "15M") moved15 = true;
      res[c.tf] = ctx.xAnalyzeTf(c, k.slice(Math.max(0, p - (c.limit - 1)), p), Tms); calls++;
    }
  }
  if (!moved15) continue;                                   // no new 15-minute candle: market shut
  const k15 = K["15M"], lastBar = k15[ptr["15M"] - 1];
  if (lastBar[6] + 1 !== Tms) continue;                     // the candle that just closed must end exactly now
  const M15 = res["15M"], H1 = res["1H"], H4 = res["4H"], D = res.D, W = res.W;
  if (M15.error || H1.error || H4.error || D.error) continue;
  const price = lastBar[4], ov = ctx.xOverall(res, price, Tms), E = { price, overall: ov, tfs: res, context: {} };
  const cl = P.candidate(E, 1), cs = P.candidate(E, -1);
  const r = new Float64Array(COLS).fill(NaN);
  r[0] = T; r[1] = W.error ? NaN : tr(W.trend); r[2] = tr(D.trend); r[3] = tr(H4.trend); r[4] = tr(H1.trend); r[5] = tr(M15.trend);
  r[6] = ov.score; r[7] = ov.alignedDirection === "long" ? 1 : ov.alignedDirection === "short" ? -1 : 0;
  r[8] = nz(H1.atr); r[9] = nz(D.atr);
  const put = (c, o) => { if (!c) return; r[o] = c.zoneTop; r[o + 1] = c.zoneBottom; r[o + 2] = c.entry; r[o + 3] = c.stop; r[o + 4] = nz(c.tp1); r[o + 5] = nz(c.tp2); r[o + 6] = c.trigger15m ? 1 : 0; };
  put(cl, 10); put(cs, 17);
  if (H1.range) { r[24] = H1.range.top; r[25] = H1.range.bottom; }
  r[26] = tr(D.internal); r[27] = tr(H4.internal); r[28] = tr(H1.internal); r[29] = tr(M15.internal);
  r[30] = nz(H4.rsi); r[31] = nz(H1.rsi); r[32] = D.range ? D.range.pct : NaN; r[33] = H4.range ? H4.range.pct : NaN;
  r[34] = tr(D.ema.stack); r[35] = tr(H4.ema.stack);
  const zs = c => !c ? NaN : /1H FVG/.test(c.zoneSource) ? 1 : /4H FVG/.test(c.zoneSource) ? 2 : 3;
  r[36] = zs(cl); r[37] = zs(cs); r[38] = price; r[39] = nz(M15.atr);
  rows.push(r); steps++;
  if (steps % 20000 === 0) console.log(steps, new Date(Tms).toISOString().slice(0, 10), ((Date.now() - t0) / 1000).toFixed(0) + "s");
}
const out = new Float64Array(rows.length * COLS); rows.forEach((r, i) => out.set(r, i * COLS));
const name = L.DATA + "/states_" + tag + ".bin";
fs.writeFileSync(name, Buffer.from(out.buffer));
console.log("wrote", name, "rows", rows.length, "engine calls", calls, ((Date.now() - t0) / 1000).toFixed(0) + "s");
