/* Bitcoin's facts for the site, the way scripts/update_gold.js does gold: runs btc.html's own engine and rule on
   Binance BTC/USDT candles and writes
     data/btc-state.json    price, today, the verdict, the plan when it is "go", each timeframe, levels (home page)
     data/btc-signals.json  the live paper record: every "go" signal followed to its stop or target (btc.html)
   Same engine (assets/xau-engine.js), same rule (assets/xau-plan.js), candles cut in UTC like Binance and like the
   Bitcoin replay (research/xau-replay/report_btc.js). Costs in the paper record are the replay's: spread 3 bp,
   financing 15% a year on both sides, charged every day. Runs in .github/workflows/market.yml. */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const E = require(path.join(ROOT, "assets/xau-engine.js")), P = require(path.join(ROOT, "assets/xau-plan.js"));
const TR = require(path.join(__dirname, "xau_track.js")), BF = require(path.join(ROOT, "assets/btc-feed.js"));
{ const w = BF.replayWords((() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data/btc-backtest.json"), "utf8")); } catch (e) { return null; } })()); if (w) P.setMarket(w); }   // the verdict in Bitcoin's own replay words
const OUT = path.join(ROOT, "data/btc-state.json"), LOG = path.join(ROOT, "data/btc-signals.json");
const API = "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT";
const IV = { "15M": "15m", "1H": "1h", "4H": "4h", D: "1d", W: "1w" }, LIM = { W: 400, D: 700, "4H": 900, "1H": 900, "15M": 1000 };
const DUR = { "15M": 900, "1H": 3600, "4H": 14400, D: 86400, W: 604800 };
const SGT = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 16).replace("T", " ") + " SGT";
const r1 = v => (typeof v === "number" && isFinite(v) ? Math.round(v * 10) / 10 : null);
const WAY = { bullish: "向上", bearish: "向下", unclear: "不明" };
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } };
// the record's clock: Bitcoin never shuts, financing every 00:00 UTC
const F = { closed: () => false, serverOff: () => 0, usDst: () => false, bucket: (t, tf) => (tf === "W" ? Math.floor((t - 345600) / 604800) * 604800 + 345600 : Math.floor(t / DUR[tf]) * DUR[tf]) };
const CFG = { spreadBp: 3, finLong: 0.15, finShort: 0.15, shut: () => false, shutWhy: "",
  nights: (a, b) => { let n = 0; for (let d = Math.ceil(a / 86400000) * 86400000; d <= b; d += 86400000) if (d > a) n++; return n; } };

async function get(url) {
  let last;
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
    catch (e) { last = e; await new Promise(res => setTimeout(res, 3000 * (a + 1))); }
  }
  throw last;
}

(async () => {
  const now = Date.now(), K = {};
  for (const tf of Object.keys(IV)) {
    let rows = await get(API + "&interval=" + IV[tf] + "&limit=" + LIM[tf]);
    // quarter-hours: a second page further back, so the trend-change history can look back five days with the
    // engine still seeing its full 800 candles at the start
    if (tf === "15M" && rows.length) rows = (await get(API + "&interval=15m&limit=1000&endTime=" + (rows[0][0] - 1))).concat(rows);
    K[tf] = rows.filter(x => x[6] < now).map(x => [x[0], +x[1], +x[2], +x[3], +x[4], +x[5], x[6]]);
  }
  if (K["15M"].length < 200 || K["1H"].length < 200) throw new Error("too little data from Binance");
  const last = K["15M"][K["15M"].length - 1], feed = { source: "spot", K, price: last[4], priceAt: last[6] + 1 };
  E.XAU_TFS.forEach(c => { c.bars = 0; });
  const eng = E.runXauEngine(feed, now), V = P.verdict(eng, now), LV = P.levels(eng, { each: 5 });
  const D = K.D, prev = D[D.length - 1], dayStart = F.bucket(now / 1000, "D") * 1000, today = K["15M"].filter(k => k[0] >= dayStart);
  const state = {
    updated: SGT(now), source: "币安 BTC/USDT", marketOpen: true,
    price: r1(eng.price), priceTime: SGT(feed.priceAt), priceNote: "最近一根已收盘 15 分钟 K 线的收盘价",
    today: { open: today.length ? r1(today[0][1]) : null, high: today.length ? r1(Math.max(...today.map(k => k[2]))) : null, low: today.length ? r1(Math.min(...today.map(k => k[3]))) : null,
      changeFromPrevClose: prev ? r1(eng.price - prev[4]) : null, changePct: prev ? Math.round((eng.price / prev[4] - 1) * 10000) / 100 : null, note: "按 UTC 换日（新加坡时间早上 8 点）" },
    previousDay: prev ? { date: new Date(prev[0]).toISOString().slice(0, 10), open: r1(prev[1]), high: r1(prev[2]), low: r1(prev[3]), close: r1(prev[4]) } : null,
    recentDays: D.slice(-7).map(k => { const d = new Date(k[0]); return { date: (d.getUTCMonth() + 1) + "/" + d.getUTCDate(), close: r1(k[4]) }; }),
    verdict: { level: V.level, tag: V.tag, title: V.title, text: V.text, reasons: V.reasons.map(r => ({ label: r.label, ok: r.ok, text: r.text })) },
    plan: V.plan && V.level === "go" ? { side: V.plan.side === "long" ? "做多" : "做空", entry: V.plan.entry, stop: V.plan.stop, target: V.plan.tp1, stopDistance: r1(V.plan.dist), trailDistance: V.plan.trailDist } : null,
    watch: V.lines.map(l => ({ price: r1(l.price), text: l.text })),
    score: eng.overall.score,
    timeframes: P.TF_ORDER.map(tf => {
      const t = eng.tfs[tf]; if (!t || t.error) return { tf, name: P.TF_ZH[tf], error: (t && t.error) || "no data" };
      return { tf, name: P.TF_ZH[tf], trend: WAY[t.trend], since: t.since ? SGT(t.since) : null, rsi: t.rsi, atr: t.atr, turnsUpAbove: r1(t.swingHigh), turnsDownBelow: r1(t.swingLow) };
    }),
    resistance: LV.points.filter(l => l.side === "res").reverse().map(l => ({ price: r1(l.price), what: l.labels.join("、"), strength: l.strength })),
    support: LV.points.filter(l => l.side === "sup").map(l => ({ price: r1(l.price), what: l.labels.join("、"), strength: l.strength })),
  };
  let log = readJson(LOG); const before = log ? JSON.stringify([log.signals, log.events, log.a3, log.a5, log.open]) : "";
  log = TR.track(K, log, { E, F, cfg: CFG }).log;
  log.rule = "五个周期同向时进场，止损 3 倍小时波幅，目标 3R；一次只持有一笔（比特币，成本：点差万分之 3、多空隔夜利息年化 15%）";
  const happened = JSON.stringify([log.signals, log.events, log.a3, log.a5, log.open]) !== before;
  state.record = Object.assign({ since: log.since }, log.summary);
  const old = readJson(OUT), oldMs = old && old.updated ? Date.parse(old.updated.replace(" SGT", ":00+08:00").replace(" ", "T")) : 0;
  if (!happened && now - oldMs < 50 * 60000 && !process.env.BTC_FORCE) { console.log("Nothing new since " + old.updated + "; files left as they are."); return; }
  fs.writeFileSync(OUT, JSON.stringify(state, null, 1) + "\n");
  fs.writeFileSync(LOG, JSON.stringify(log, null, 1) + "\n");
  console.log("Wrote data/btc-state.json at " + state.updated + " | price " + state.price + " | " + state.verdict.tag + " | " + state.timeframes.map(t => t.tf + (t.trend || "?")).join(" "));
})().catch(e => { console.error("update_btc failed, old files kept:", e.message); process.exit(1); });
