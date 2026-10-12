#!/usr/bin/env node
/* Runs the report page's own engine on a server and writes what it finds to data/xau-state.json.

   Why: the daily Claude refresh writes daily.html and risk.html, but the cloud machine it runs on cannot reach any
   price service. Before this file existed it took prices and levels from web search snippets. Now it reads this
   file for every number (price, yesterday's high and low, each timeframe's trend, the levels, the verdict) and uses
   web search only for the story behind the move.

   Same code as the page: assets/xau-feed.js cuts the candles, assets/xau-engine.js reads them, assets/xau-plan.js
   turns that into the verdict. Candles are real spot XAU/USD from Dukascopy's chart feed; if that does not answer,
   Binance PAXG moved onto the spot price, exactly like the page's fallback.

   It also keeps the live record, data/xau-signals.json: every "go" becomes a paper trade that is followed to its
   stop or target (scripts/xau_track.js). The tracker also words the alerts worth sending (new signal, trade closed,
   big trends lining up or splitting). They are printed in the job log and written to the file named by
   XAU_ALERTS_FILE when that is set; nothing delivers them to a phone yet.

   The files are rewritten only when something happened or the state file is close to an hour old, so the job can
   be scheduled more often than hourly without a commit on every run.

   Runs in GitHub Actions (.github/workflows/market.yml); by hand:  node scripts/update_gold.js
   On failure the old files are left as they are and the exit code is 1. */
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const F = require(path.join(ROOT, "assets/xau-feed.js"));
global.XauFeed = F;                                             // the engine asks it whether the market is open
const E = require(path.join(ROOT, "assets/xau-engine.js")), P = require(path.join(ROOT, "assets/xau-plan.js"));
const TR = require(path.join(__dirname, "xau_track.js"));
const OUT = path.join(ROOT, "data", "xau-state.json"), LOG = path.join(ROOT, "data", "xau-signals.json");
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } };
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", Referer: "https://yapseng98.github.io/trading_pages/report.html" };

async function get(url, opts) {
  let last;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(40000) }, opts));
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } catch (e) { last = e; await new Promise(res => setTimeout(res, 3000 * (a + 1))); }
  }
  throw last;
}
async function duk(interval, limit) {
  const t = await get(F.DUK + "&interval=" + interval + "&limit=" + limit + "&timestamp=" + (Date.now() + 60000) + "&jsonp=cb", { headers: UA });
  return F.clean(JSON.parse(t.slice(t.indexOf("(") + 1, t.lastIndexOf(")"))));
}
async function spot(now) {
  const h1 = await duk("1HOUR", F.NEED.h1), d1 = await duk("1DAY", F.NEED.d1), m15 = await duk("15MIN", 1400);   // two weeks of quarter-hours: room to catch up after a gap
  if (h1.length < 2000 || m15.length < 200) throw new Error("spot feed: too little data");
  return F.spotCandles(h1, d1, m15, now);
}
async function paxg(now) {
  const tz = F.serverOff(now / 1000) / 3600, q = async (iv, lim, zone) => JSON.parse(await get(F.BIN + "&interval=" + iv + "&limit=" + lim + (zone ? "&timeZone=" + tz : "")));
  let quote = null; try { const d = JSON.parse(await get(F.SPOT)); if (d && d.price > 0) quote = +d.price; } catch (e) { /* no calibration */ }
  return F.paxgCandles(await q("15m", 800), await q("1h", 800), await q("4h", 800, true), await q("1d", 1000, true), quote, now, "spot");
}

const SGT = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 16).replace("T", " ") + " SGT";
const r1 = v => (typeof v === "number" && isFinite(v) ? Math.round(v * 10) / 10 : null);
const WAY = { bullish: "向上", bearish: "向下", unclear: "不明" };

(async () => {
  const now = Date.now(); let feed, note = null;
  try { feed = await spot(now); } catch (e) { note = "spot feed failed (" + e.message + "), used PAXG"; console.error(note); feed = await paxg(now); }
  E.XAU_TFS.forEach(c => { c.bars = 0; });
  const eng = E.runXauEngine(feed, now), V = P.verdict(eng), LV = P.levels(eng, { each: 5 }), K = feed.K;
  if (typeof eng.price !== "number") throw new Error("engine returned no price");

  // today so far (broker day: from 17:00 New York), from the finished quarter-hours
  const D = K.D, prev = D[D.length - 1], dayStart = F.bucket(now / 1000, "D") * 1000, today = K["15M"].filter(k => k[0] >= dayStart);
  const hi = today.length ? Math.max(...today.map(k => k[2])) : null, lo = today.length ? Math.min(...today.map(k => k[3])) : null;
  const wk = K.W[K.W.length - 1], weekStart = F.bucket(now / 1000, "W") * 1000, thisWeek = K["1H"].filter(k => k[0] >= weekStart);

  const state = {
    updated: SGT(now), source: feed.source === "spot" ? "现货金 XAU/USD（Dukascopy 买价）" : "PAXG 代币行情校准到现货（备用，价位可能差几美元）", note,
    marketOpen: !F.closed(now / 1000),
    price: r1(eng.price), priceTime: SGT(feed.priceAt), priceNote: "最近一根已收盘 15 分钟 K 线的收盘价",
    today: { open: today.length ? r1(today[0][1]) : null, high: r1(hi), low: r1(lo), changeFromPrevClose: prev ? r1(eng.price - prev[4]) : null, changePct: prev ? Math.round((eng.price / prev[4] - 1) * 10000) / 100 : null, note: "交易日按纽约 17:00 换日（新加坡时间早上 5 点或 6 点）" },
    previousDay: prev ? { date: new Date(prev[6]).toISOString().slice(0, 10), open: r1(prev[1]), high: r1(prev[2]), low: r1(prev[3]), close: r1(prev[4]) } : null,
    recentDays: D.slice(-7).map(k => { const d = new Date(k[6]); return { date: (d.getUTCMonth() + 1) + "/" + d.getUTCDate(), close: r1(k[4]) }; }),
    thisWeek: thisWeek.length ? { high: r1(Math.max(...thisWeek.map(k => k[2]))), low: r1(Math.min(...thisWeek.map(k => k[3]))) } : null,
    previousWeek: wk ? { open: r1(wk[1]), high: r1(wk[2]), low: r1(wk[3]), close: r1(wk[4]) } : null,
    verdict: { level: V.level, tag: (V.closed ? "休市中 · " : "") + V.tag, title: V.title, text: V.text, reasons: V.reasons.map(r => ({ label: r.label, ok: r.ok, text: r.text })) },
    plan: V.plan && V.level === "go" ? { side: V.plan.side === "long" ? "做多" : "做空", entry: V.plan.entry, stop: V.plan.stop, target: V.plan.tp1, stopDistance: r1(V.plan.dist), trailDistance: V.plan.trailDist, rule: "现价进，止损 3 倍 1 小时波幅，目标 3R；或不设目标、每天把止损挪到最好价格后面 2R" } : null,
    watch: V.lines.map(l => ({ price: r1(l.price), text: l.text })),
    score: eng.overall.score,
    timeframes: P.TF_ORDER.map(tf => {
      const t = eng.tfs[tf]; if (!t || t.error) return { tf, name: P.TF_ZH[tf], error: (t && t.error) || "no data" };
      return { tf, name: P.TF_ZH[tf], trend: WAY[t.trend], since: t.since ? SGT(t.since) : null, rsi: t.rsi, atr: t.atr, ema20: r1(t.ema.e20), ema50: r1(t.ema.e50), ema200: r1(t.ema.e200),
        emaOrder: P.ZH.stack[t.ema.stack], range: t.range ? { top: r1(t.range.top), bottom: r1(t.range.bottom), positionPct: t.range.pct } : null,
        lastBreak: t.lastEvent ? { kind: t.lastEvent.type === "CHoCH" ? "转折" : "延续", direction: t.lastEvent.dir === "bull" ? "向上" : "向下", level: r1(t.lastEvent.level), barsAgo: t.lastEvent.barsAgo } : null,
        turnsUpAbove: r1(t.swingHigh), turnsDownBelow: r1(t.swingLow) };
    }),
    resistance: LV.points.filter(l => l.side === "res").reverse().map(l => ({ price: r1(l.price), what: l.labels.join("、"), strength: l.strength })),
    support: LV.points.filter(l => l.side === "sup").map(l => ({ price: r1(l.price), what: l.labels.join("、"), strength: l.strength })),
    rules: "方向只在周线、日线、4 小时同向时才做；1 小时和 15 分钟也同向才进场；止损 3 倍 1 小时波幅；目标 3R 或跟踪止损。依据见 data/xau-backtest.json。",
  };
  // the live record: only on real spot candles, never on the fallback feed
  let alerts = [], log = readJson(LOG), before = log ? JSON.stringify([log.signals, log.events, log.a3, log.a5, log.open]) : "";
  if (feed.source === "spot") { const r = TR.track(feed.K, log, { E, F }); log = r.log; alerts = r.alerts; }
  const happened = !!log && JSON.stringify([log.signals, log.events, log.a3, log.a5, log.open]) !== before;
  if (log) state.record = Object.assign({ since: log.since }, log.summary);

  // rewrite the files only when something happened, or the state on disk is getting old
  const old = readJson(OUT), oldMs = old && old.updated ? Date.parse(old.updated.replace(" SGT", ":00+08:00").replace(" ", "T")) : 0;
  if (!happened && !alerts.length && now - oldMs < 50 * 60000 && !process.env.XAU_FORCE) { console.log("Nothing new since " + old.updated + "; files left as they are."); return; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(state, null, 1) + "\n");
  if (log) fs.writeFileSync(LOG, JSON.stringify(log, null, 1) + "\n");
  if (alerts.length) { console.log("ALERTS:\n" + alerts.join("\n\n")); if (process.env.XAU_ALERTS_FILE) fs.writeFileSync(process.env.XAU_ALERTS_FILE, alerts.join("\n\n---\n\n") + "\n"); }
  console.log("Wrote data/xau-state.json at " + state.updated + " | " + feed.source + " | price " + state.price + " | " + state.verdict.tag + " | " + state.timeframes.map(t => t.tf + (t.trend || "?")).join(" "));
})().catch(e => { console.error("update_gold failed, old file kept:", e.message); process.exit(1); });
