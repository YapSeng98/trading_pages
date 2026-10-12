/* Keeps a live record of the report page's rule: every time the engine says "go", a paper trade is opened and
   followed to its stop or target, with the same costs as the replay. It answers the one question a replay cannot:
   does the rule still work on prices nobody had seen when it was chosen?

   The rule, exactly as replayed (research/xau-replay, rule "go3r"): when all five timeframes come to agree, enter at
   the close of that 15-minute candle; stop 3 x the 1-hour ATR; target 3R; one position at a time, so a signal that
   arrives while a paper trade is open, or during the daily one-hour market break, is logged as skipped.

   track(K, log, deps) walks every 15-minute candle that closed since log.lastChecked, so the record does not depend
   on when or how often the job runs. K holds closed candles per timeframe, oldest first, as assets/xau-feed.js
   builds them. Returns the new log and the alerts worth sending (plain text, newest last). */
"use strict";
const SPREAD_BP = 1.5, FINANCING = 0.075, STOP_ATR = 3, TARGET_R = 3, MAX_CATCHUP = 550;
const SGT = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 16).replace("T", " ") + " SGT";
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const money = v => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const SITE = "https://yapseng98.github.io/trading_pages/report.html";

// number of candles that closed before T
function upto(list, T) { let a = 0, b = list.length; while (a < b) { const m = (a + b) >> 1; if (list[m][6] < T) a = m + 1; else b = m; } return a; }

// nights a position is charged for: each 17:00 New York roll from Monday to Friday, three for Wednesday
function nights(F, fromMs, toMs) {
  let n = 0;
  for (let day = Math.floor(fromMs / 86400000) * 86400; day * 1000 <= toMs; day += 86400) {
    const roll = (day + (F.usDst(day + 43200) ? 21 : 22) * 3600) * 1000, wd = new Date(roll).getUTCDay();
    if (roll > fromMs && roll <= toMs && wd >= 1 && wd <= 5) n += wd === 3 ? 3 : 1;
  }
  return n;
}
function summary(signals) {
  const done = signals.filter(s => s.status === "target" || s.status === "stop"), total = done.reduce((a, s) => a + s.R, 0);
  return { signals: signals.length, taken: signals.filter(s => s.status !== "skipped").length, closed: done.length, wins: done.filter(s => s.R > 0).length,
    totalR: r2(total), avgR: done.length ? r2(total / done.length) : null, open: signals.filter(s => s.status === "open").length };
}

function track(K, log, deps) {
  const { E, F } = deps, m15 = K["15M"] || [], alerts = [];
  if (!m15.length) return { log, alerts };
  const lastT = m15[m15.length - 1][6] + 1;
  const evalAt = T => {
    const feed = { source: "spot", K: {} };
    for (const tf of Object.keys(K)) { const n = upto(K[tf], T); feed.K[tf] = K[tf].slice(Math.max(0, n - 1000), n); }
    const c = feed.K["15M"]; feed.price = c.length ? c[c.length - 1][4] : null;
    return E.runXauEngine(feed, T);
  };
  const fresh = why => {
    const ov = evalAt(lastT).overall;
    return { rule: "五个周期同向时进场，止损 3 倍小时波幅，目标 3R；一次只持有一笔", since: SGT(lastT), sinceMs: lastT, lastChecked: lastT, a3: ov.agree3, a5: ov.agree5,
      open: null, nextId: 1, signals: [], events: [{ ms: lastT, time: SGT(lastT), type: "start", text: why }], summary: summary([]) };
  };
  if (!log || !log.lastChecked) return { log: fresh("开始记录"), alerts };
  const start = upto(m15, log.lastChecked);
  if (m15.length - start > MAX_CATCHUP) {                       // too long a gap to walk through with full history: start again from now, keep what is on record
    const f = fresh("记录中断后重新开始（中间一段没有数据）"); f.since = log.since; f.sinceMs = log.sinceMs; f.nextId = log.nextId; f.signals = log.signals; f.open = log.open; f.events = log.events.concat(f.events).slice(-80); f.summary = summary(f.signals);
    return { log: f, alerts };
  }
  const note = (ms, type, text) => { log.events.push({ ms, time: SGT(ms), type, text }); };
  for (let i = start; i < m15.length; i++) {
    const k = m15[i], T = k[6] + 1;
    // 1. the open paper trade lives through this candle (bid prices; the ask is one spread above)
    if (log.open) {
      const s = log.signals.find(x => x.id === log.open), dir = s.side === "做多" ? 1 : -1, sp = s.spread; let exit = null, why = null;
      if (dir > 0) { if (k[1] <= s.stop) { exit = k[1]; why = "stop"; } else if (k[3] <= s.stop) { exit = s.stop; why = "stop"; } else if (k[2] >= s.target) { exit = s.target; why = "target"; } }
      else { if (k[1] + sp >= s.stop) { exit = k[1] + sp; why = "stop"; } else if (k[2] + sp >= s.stop) { exit = s.stop; why = "stop"; } else if (k[3] + sp <= s.target) { exit = s.target; why = "target"; } }
      if (why) {
        const n = nights(F, s.ms, T), cost = dir > 0 ? n * s.entry * FINANCING / 360 : 0, pnl = (exit - s.entry) * dir - cost;
        s.status = why; s.exitTime = SGT(T); s.exitMs = T; s.exitPrice = r2(exit); s.nights = n; s.R = r2(pnl / s.risk); log.open = null;
        note(T, "closed", s.side + " #" + s.id + (why === "target" ? " 到目标" : " 止损") + "，" + (s.R >= 0 ? "+" : "−") + Math.abs(s.R).toFixed(2) + "R");
        alerts.push((why === "target" ? "✅" : "❌") + " 纸面记录 #" + s.id + "（" + s.side + "）" + (why === "target" ? "到目标 " : "止损 ") + money(exit) + "，结果 " + (s.R >= 0 ? "+" : "−") + Math.abs(s.R).toFixed(2) + "R。上线以来合计 " + (() => { const z = summary(log.signals); return (z.totalR >= 0 ? "+" : "−") + Math.abs(z.totalR).toFixed(1) + "R（" + z.closed + " 笔）"; })() + "。");
      }
    }
    // 2. what the engine says with the candles closed by now
    const eng = evalAt(T), ov = eng.overall, a3 = ov.agree3, a5 = ov.agree5, H1 = eng.tfs["1H"], way = d => (d > 0 ? "向上" : "向下");
    // 3. the big three coming into line, or falling out of it
    if (a3 !== log.a3) {
      if (a3 !== 0 && !(a5 !== 0 && a5 !== log.a5)) { note(T, "ready", "周线、日线、4 小时同向" + way(a3)); alerts.push("🟡 周线、日线、4 小时都" + way(a3) + "了（" + SGT(T) + "，现货金 " + money(k[4]) + "）。还差 1 小时和 15 分钟也转成" + way(a3) + "，到时会再提醒。"); }
      if (a3 === 0) { note(T, "ended", "三个大周期不再同向"); alerts.push("⚪ 周线、日线、4 小时不再同向（" + SGT(T) + "，现货金 " + money(k[4]) + "）。按规则，这时不开新仓；用跟踪止损持仓的，这是离场信号。"); }
    }
    // 4. all five agree, newly: the signal
    if (a5 !== 0 && a5 !== log.a5 && H1 && H1.atr) {
      const dir = a5, px = k[4], sp = r2(px * SPREAD_BP / 10000), entry = dir > 0 ? px + sp : px, risk = STOP_ATR * H1.atr;
      // gold shuts for an hour at 17:00 New York every day (midnight on the broker clock), and for the weekend:
      // a signal that lands there cannot be entered, and the replay did not count it either
      const shut = F.closed(T / 1000) || new Date(T + F.serverOff(T / 1000) * 1000).getUTCHours() === 0;
      const s = { id: log.nextId++, time: SGT(T), ms: T, side: dir > 0 ? "做多" : "做空", entry: r2(entry), stop: r2(entry - dir * risk), target: r2(entry + dir * TARGET_R * risk), risk: r2(risk), atr: H1.atr, spread: sp, status: log.open || shut ? "skipped" : "open" };
      if (s.status === "skipped") s.why = log.open ? "已有纸面持仓" : "出现在每日休市的那一小时";
      log.signals.push(s);
      if (s.status === "open") {
        log.open = s.id; note(T, "go", "信号 #" + s.id + "：" + s.side + " " + money(s.entry));
        alerts.push((dir > 0 ? "🟢" : "🔴") + " 信号 #" + s.id + "：五个周期都" + way(dir) + "，可以顺势" + s.side + "。\n- 时间：" + s.time + "\n- 现货金：" + money(px) + "\n- 止损：" + money(s.stop) + "（离入场 " + money(risk) + " 美元 = 3 倍小时波幅）\n- 目标：" + money(s.target) + "（3R）\n- 最小 0.01 手止损一次约亏 $" + Math.round(risk) + "\n\n进场前在报告页确认手数和检查项：" + SITE);
      } else note(T, "skipped", "信号 #" + s.id + "（" + s.side + "）" + s.why + "，按规则跳过");
    }
    log.a3 = a3; log.a5 = a5; log.lastChecked = T;
  }
  log.events = log.events.slice(-80); log.summary = summary(log.signals);
  return { log, alerts };
}
module.exports = { track, summary, SGT, SPREAD_BP, FINANCING, STOP_ATR, TARGET_R };
