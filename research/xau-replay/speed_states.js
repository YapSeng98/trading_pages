// For the speed test (SPEED-PLAN.md): at every 15-minute close, each timeframe's trend AND the prices that would turn
// it, which states_full.bin does not keep. Same candles and same engine as gen_states.js; pattern and gap searches are
// stubbed out because they do not touch the trend. The last column check compares the trends with states_full.bin.
// usage: node speed_states.js <y0> <y1>            -> data/speed_states.bin (the page's swing lengths)
//        SWING=3 node speed_states.js <y0> <y1>    -> data/speed_states_s3.bin (4H, 1H, 15M on 3-bar swings)
const L = require("./lib"), fs = require("fs");
const [y0s, y1s] = process.argv.slice(2), y0 = +y0s, y1 = +y1s, SW = +process.env.SWING || 0, tag = SW ? "speed_states_s" + SW : "speed_states";
const ctx = L.loadEngine(L.REPO + "/assets/xau-engine.js");
ctx.xPatterns = () => []; ctx.xFvgs = () => [];
const B = L.source("duk", y0, y1), skip = L.spotClosed, align = "ny";
const TFS = ctx.XAU_TFS.map(c => Object.assign({}, c, { bars: 0 }, SW && ["4H", "1H", "15M"].includes(c.tf) ? { swing: SW } : {}));
const K = {}, ptr = {}, res = {};
TFS.forEach(c => { K[c.tf] = L.aggregate(B, c.tf, align, skip); ptr[c.tf] = 0; res[c.tf] = { tf: c.tf, error: "no data" }; });
const COLS = 22, tr = v => v === "bullish" ? 1 : v === "bearish" ? -1 : v === "unclear" || v === "mixed" ? 0 : NaN;
const nz = v => (typeof v === "number" && isFinite(v) ? v : NaN), ORDER = ["W", "D", "4H", "1H", "15M"];
const rows = [], first = Math.ceil(B.t[0] / 900) * 900, last = Math.floor(B.t[B.n - 1] / 900) * 900, t0 = Date.now();
for (let T = first; T <= last; T += 900) {
  const Tms = T * 1000; let moved15 = false;
  for (const c of TFS) {
    const k = K[c.tf]; let p = ptr[c.tf];
    while (p < k.length && k[p][6] < Tms) p++;
    if (p !== ptr[c.tf]) { ptr[c.tf] = p; if (c.tf === "15M") moved15 = true; res[c.tf] = ctx.xAnalyzeTf(c, k.slice(Math.max(0, p - (c.limit - 1)), p), Tms); }
  }
  if (!moved15) continue;
  const lastBar = K["15M"][ptr["15M"] - 1];
  if (lastBar[6] + 1 !== Tms) continue;
  if (res["15M"].error || res["1H"].error || res["4H"].error || res.D.error) continue;
  const r = new Float64Array(COLS).fill(NaN);
  r[0] = T;                                                     // 1-5 trend, 6-10 the close that turns it up, 11-15 the close that turns it down (W, D, 4H, 1H, 15M)
  ORDER.forEach((tf, i) => { const x = res[tf]; if (x.error) return; r[1 + i] = tr(x.trend); r[6 + i] = nz(x.swingHigh); r[11 + i] = nz(x.swingLow); });
  r[16] = tr(res.D.internal); r[17] = tr(res["4H"].internal); r[18] = tr(res["1H"].internal); r[19] = tr(res["15M"].internal);   // 2-bar swings
  r[20] = nz(res["1H"].atr); r[21] = lastBar[4];
  rows.push(r);
  if (rows.length % 50000 === 0) console.log(rows.length, new Date(Tms).toISOString().slice(0, 10), ((Date.now() - t0) / 1000).toFixed(0) + "s");
}
const out = new Float64Array(rows.length * COLS); rows.forEach((r, i) => out.set(r, i * COLS));
fs.writeFileSync(L.DATA + "/" + tag + ".bin", Buffer.from(out.buffer));
console.log("wrote", tag, "rows", rows.length, ((Date.now() - t0) / 1000).toFixed(0) + "s");
if (!SW) {                                                       // the stubs must not have changed a single trend
  const b = fs.readFileSync(L.DATA + "/states_full.bin"), a = new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), n = a.length / 40; let bad = 0, cmp = 0, j = 0;
  for (let i = 0; i < n; i++) { const T = a[i * 40]; while (j < rows.length && rows[j][0] < T) j++; if (j >= rows.length || rows[j][0] !== T) { bad++; continue; } cmp++; for (let q = 1; q <= 5; q++) { const u = a[i * 40 + q], v = rows[j][q]; if (!(u === v || (Number.isNaN(u) && Number.isNaN(v)))) { bad++; break; } } }
  console.log("trend check against states_full.bin: rows compared", cmp, "different", bad);
}
