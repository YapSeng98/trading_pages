// The page script of report.html (gold) and btc.html (Bitcoin). Everything that differs between the two comes from
// window.MARKET, set in the page before this file loads; the defaults are gold's.
(function(){
  "use strict";
  var M = Object.assign({
    id: "xau", ls: "xau4h.", sym: "XAUUSD", name: "黄金", contract: 100, unit: "盎司", weekend: true, calibrate: true,
    spotUrl: "https://api.gold-api.com/price/XAU", tick: "PAXGUSDT", ws: "paxgusdt",
    state: "data/xau-state.json", signals: "data/xau-signals.json", news: "data/news.json",
    srcSpot: "数据：现货金 XAU/USD", srcBackup: "备用数据：PAXG 代币",
    basisSpot: "现货金 XAU/USD，Dukascopy 买价，纽约 17:00 换日", basisBackup: "PAXG 代币行情校准到现货（备用数据源）",
    calEmpty: "本周剩下的时间里，日历上没有会明显影响金价的美国数据。", newsWord: "影响金价的消息", overlapTip: "伦敦与纽约重叠：通常是黄金波动最大的时段",
    closedText: "黄金休市中，开盘后再看",
    askIntro: "I trade XAUUSD (spot gold) on MT5 and live in Singapore.",
    askReplay: "A replay on 2011-2026 spot gold found an edge only when all five agree; buying dips, tight stops and trading against the big three lost money.",
    liveData: "spot XAU/USD, broker-style candles, day starts 17:00 New York", liveDataBackup: "backup feed: PAXG token moved onto spot, may differ from spot",
    // each market has its own chime, so an alert can be told apart by ear: gold rises in three notes
    chime: { wave: "triangle", notes: [[0, 784], [0.2, 1046], [0.4, 1318]] },
    gloss: {}
  }, window.MARKET || {});
  var Feed = M.feed || window.XauFeed;
  var P = XauPlan, fmt = P.fmt, num = P.num;
  var NS = "http://www.w3.org/2000/svg";
  var CHART_BARS = { W: 0, D: 120, "4H": 120, "1H": 120, "15M": 96 };
  var CHART_TFS = ["D", "4H", "1H", "15M"];
  var ZONE_TFS = { D: ["D", "W"], "4H": ["4H", "D"], "1H": ["1H", "4H"], "15M": ["1H", "4H"] };
  var FIELDS = ["entry", "stop", "tp1", "tp2"];
  var FIELD_ZH = { entry: "入场价", stop: "止损价", tp1: "目标 1", tp2: "目标 2" };
  var NEWS_MANUAL = { id: "news", label: "避开重大数据", detail: "数据公布前 30 分钟不开新仓，公布后等 15–30 分钟再进" };
  var STREAK = { id: "streak", label: "今天没有连亏两单", detail: "连亏两单就停手，不做报复性交易" };
  // sessions run on each market's own clock, so daylight saving is handled by the time zone
  var MKTS = [
    { zh: "亚洲盘", tz: "Asia/Tokyo", open: 9, close: 17 },
    { zh: "伦敦盘", tz: "Europe/London", open: 8, close: 17 },
    { zh: "纽约盘", tz: "America/New_York", open: 8, close: 17 }
  ];
  var GLOSS = {
    score: ["综合评分", "把五个周期的方向加权相加：周线、日线各 3 分，4 小时 2 分，1 小时和 15 分钟各 1 分。向上记正、向下记负，范围 −10 到 +10。越靠两端，各周期方向越一致。"],
    structure: ["方向（结构）", "价格不断创出更高的高点和低点，就是向上；不断创出更低的高点和低点，就是向下。本页每个周期的方向都按这条规则判断。"],
    bos: ["突破：BOS 与 CHoCH", "BOS 是顺着原方向又破了一个前高或前低，说明趋势延续。CHoCH 是第一次朝反方向突破，是可能转向的第一个信号。本页每个周期的「方向」就是这样翻转的。"],
    fvg: ["缺口（FVG）", "价格走得太急，三根 K 线中间留下一段没有成交重叠的空档。价格回到这里时常有反应，常被用来当入场区；回放里它没有带来额外优势，这里只作参考。"],
    zone: ["偏贵区和偏便宜区", "把最近一段行情从低点到高点当成一个区间：上半部算偏贵（溢价），下半部算偏便宜（折价）。常见的说法是买在偏便宜、卖在偏贵；但在黄金的回放里，顺势时在偏贵的一半进场反而更好，所以这页不把它当入场条件。"],
    atr: ["平均波幅（ATR）", "最近每根 K 线平均波动多少美元。止损如果比它近很多，正常的波动就可能把你扫出去。回放里，止损放在 3 倍 1 小时波幅之外才显出优势，1.5 倍以内没有。"],
    r: ["R：风险倍数", "把止损距离当成 1R。目标 2R 的意思是：赚到的会是可能亏掉的 2 倍。赚赔比有 2:1，胜率只要超过三分之一就不亏。这套规则的胜率只有四成左右，靠的是赢的单子走得远。"],
    trail: ["跟踪止损", "价格朝你的方向走了以后，把止损跟着往有利方向挪，但绝不往回挪。这页的做法：止损保持在「入场以来最好的价格」后面 2R 的位置，每天挪一次就够。走得越远，锁住的利润越多。"],
    lots: ["手数怎么算", "黄金 1 手通常是 100 盎司：价格每动 1 美元，1 手赚或亏 100 美元，0.01 手就是 1 美元。手数 = 愿意亏的钱 ÷（止损距离 × 100）。"],
    basis: ["数据从哪来", "K 线是现货金（XAU/USD），来自 Dukascopy 的公开图表数据，按纽约 17:00 换日，和多数 MT5 平台的日线一致。跳动的现价用 Binance 上 PAXG 代币的成交推送，再按它和现货的实时差值校准。现货数据连不上时，整页会改用 PAXG 行情并在上方提示：那时价位可能和你的平台差几美元。"],
    rsi: ["强弱（RSI）", "0 到 100 的动能读数。70 以上偏热，30 以下偏冷，50 上下代表多空大致均衡。"],
    ema: ["均线（EMA）", "最近 20、50、200 根 K 线的平均价。价格和三条线从上到下依次排开叫多头排列，反过来叫空头排列。"],
    liq: ["流动性：等高和等低", "几个高点或低点几乎一样高，那里通常堆着很多止损单。价格常常先去扫一下那里，再反向走。"]
  };

  Object.keys(M.gloss).forEach(function (k) { GLOSS[k] = M.gloss[k]; });
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(M.ls + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(M.ls + k, JSON.stringify(v)); } catch (e) {} }
  };
  var S = {
    E: null, feed: null, live: null, raw: null, spot: null, spotAt: 0, gap: 0, gapOk: false, busy: false, late: false, pos: LS.get("pos", null), posForm: null, srv: null, lastRun: 0, lastTry: 0, lastQ: 0, lastShown: null, proof: null, rec: null, mins: [], tHi: null, tLo: null,
    tf: LS.get("tf", "4H"), cmode: LS.get("cmode", "simple"), tab: LS.get("tab", "levels"),
    plan: LS.get("plan", null) || { side: "long", entry: null, stop: null, tp1: null, tp2: null, note: "" },
    acct: LS.get("acct", null) || { balance: null, riskPct: 0.5, contract: M.contract, lotStep: 0.01, spread: 0 },
    manual: LS.get("manual", {}), saved: LS.get("saved", []), armed: null, openLevel: null, daily: [], hadPlan: LS.get("plan", null) !== null,
    events: [], hasAi: false, vLevel: null, overLadder: false
  };
  if (CHART_TFS.indexOf(S.tf) < 0) S.tf = "4H";
  // A plan left over from the first version was made with token prices and rules the replay did not support.
  // Move it to the saved list once, so the chart is not showing its lines next to a different answer.
  if (LS.get("ver", 1) < 2) {
    LS.set("ver", 2);
    if (typeof S.plan.entry === "number" && typeof S.plan.stop === "number") {
      S.saved.unshift({ side: S.plan.side, entry: S.plan.entry, stop: S.plan.stop, tp1: S.plan.tp1, tp2: S.plan.tp2, note: "旧版页面留下的方案" + (S.plan.note ? "：" + S.plan.note : ""), lots: null, when: "升级前", basis: "旧版（PAXG 报价、旧规则）", status: "已取消" });
      S.saved = S.saved.slice(0, 20); LS.set("saved", S.saved);
    }
    S.plan = { side: "long", entry: null, stop: null, tp1: null, tp2: null, note: "" }; LS.set("plan", S.plan);
  }

  function $(id) { return document.getElementById(id); }
  function all(sel) { return [].slice.call(document.querySelectorAll(sel)); }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) {
      var v = attrs[k]; if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.className = v; else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
    }
    (kids || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function sv(name, attrs, parent) { var e = document.createElementNS(NS, name); for (var a in attrs) e.setAttribute(a, attrs[a]); if (parent) parent.appendChild(e); return e; }
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("show"); }, 1800); }
  function mark(ok) { return h("span", { class: "ck " + (ok === true ? "ok" : ok === false ? "no" : "na"), text: ok === true ? "✓" : ok === false ? "✕" : "–", "aria-label": ok === true ? "满足" : ok === false ? "不满足" : "暂不适用" }); }

  // ---------- price basis ----------
  // Everything the engine returns is already a spot price. Only the tick stream is PAXG: each tick is moved onto
  // spot by the gap between the two (S.gap), which is measured again whenever a fresh spot quote arrives.
  function sh(p) { return num(p); }
  function unsh(p) { return num(p); }
  function marketOpen() { return !Feed.closed(Date.now() / 1000); }
  function basisName() { return S.feed && S.feed.source === "paxg" ? M.basisBackup : M.basisSpot; }
  function calibrate() {
    if (!M.calibrate) { S.gap = 0; S.gapOk = true; setLive(); return; }
    if (S.basisAt && Date.now() - S.basisAt < 20 * 60000) return;              // the minute-by-minute calibration below is better
    if (num(S.spot) === null || num(S.raw) === null || !marketOpen() || Date.now() - S.spotAt > 3 * 60000) return;
    var g = S.spot - S.raw; if (Math.abs(g) > 80) return;                       // a gap this large means a bad quote, not a basis
    S.gap = Math.round(g * 100) / 100; S.gapOk = true; setLive();
  }
  // The gap between PAXG and spot, measured properly: the last ~20 finished one-minute closes of spot (Dukascopy, bid)
  // matched minute by minute with PAXG's one-minute closes on Binance, and the middle value taken. api.gold-api.com
  // moves only every 30 seconds and was found up to $2 off spot (2026-10-23), so it is only the fallback.
  function minuteBasis(rows) {
    if (!rows || rows.length < 5) return Promise.resolve(null);
    return fetch(BIN1M, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (k) {
      var px = {}, now = Date.now(); (k || []).forEach(function (x) { if (x[6] < now) px[Math.round(x[0] / 1000)] = parseFloat(x[4]); });
      var d = rows.filter(function (r) { return isFinite(px[r[0]]); }).map(function (r) { return r[4] - px[r[0]]; }).sort(function (a, b) { return a - b; });
      return d.length >= 5 ? { gap: d[Math.floor(d.length / 2)], n: d.length, spread: d[d.length - 1] - d[0] } : null;
    }).catch(function () { return null; });
  }
  var BIN1M = "https://data-api.binance.vision/api/v3/klines?symbol=" + M.tick + "&interval=1m&limit=30";
  // The live price: a calibrated tick while the market is open, else the close of the last finished candle.
  function setLive() {
    if (!S.E) return;
    if (marketOpen() && S.gapOk && num(S.raw) !== null) S.live = Math.round((S.raw + S.gap) * 100) / 100;
    else if (num(S.live) === null || !marketOpen()) S.live = S.feed ? S.feed.price : S.E.price;
    S.E.price = S.live;
    if (num(S.live) !== null) { S.tHi = S.tHi === null ? S.live : Math.max(S.tHi, S.live); S.tLo = S.tLo === null ? S.live : Math.min(S.tLo, S.live); }
  }
  // The candle still forming on a timeframe: the finished quarter-hours inside it, then the finished minutes after
  // those, then the live price. The engine never sees it (the answer is judged on closed candles only); it is drawn
  // so the chart reaches "now".
  function formingBar(tf) {
    if (!S.feed || !marketOpen() || num(S.live) === null) return null;
    var start = Feed.bucket(Date.now() / 1000, tf), K15 = S.feed.K["15M"] || [], o = null, hi = -Infinity, lo = Infinity, upto = start;
    var take = function (op, h2, l2) { if (o === null) o = op; if (h2 > hi) hi = h2; if (l2 < lo) lo = l2; };
    for (var i = 0; i < K15.length; i++) { var k = K15[i]; if (k[0] >= start * 1000) { take(k[1], k[2], k[3]); upto = (k[6] + 1) / 1000; } }
    S.mins.forEach(function (m) { if (m[0] >= upto) take(m[1], m[2], m[3]); });
    if (o === null) { var T = S.feed.K[tf] || [], lastC = T.length ? T[T.length - 1][4] : S.live; o = lastC; }   // nothing finished inside it yet: it opens where the last one closed
    take(o, Math.max(o, S.live, S.tHi === null ? S.live : S.tHi), Math.min(o, S.live, S.tLo === null ? S.live : S.tLo));
    return [start, o, hi, lo, S.live];
  }
  function r1(v) { return v === null ? null : Math.round(v * 10) / 10; }

  // ---------- time ----------
  var DTF = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  function parts(ms) { var p = {}; DTF.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; }); if (p.hour === "24") p.hour = "00"; return p; }
  function sgt(ms, mode) {
    var p = parts(ms);
    if (mode === "d") return p.month + "/" + p.day;
    if (mode === "t") return p.hour + ":" + p.minute;
    if (mode === "s") return p.hour + ":" + p.minute + ":" + p.second;
    if (mode === "full") return p.year + "-" + ("0" + p.month).slice(-2) + "-" + ("0" + p.day).slice(-2) + " " + p.hour + ":" + p.minute + " SGT";
    return p.month + "/" + p.day + " " + p.hour + ":" + p.minute;
  }
  function left(ms) { var m = Math.max(0, Math.round(ms / 60000)); if (m < 60) return m + " 分钟"; var hr = Math.floor(m / 60); if (hr < 48) return hr + " 小时 " + (m % 60) + " 分"; return Math.floor(hr / 24) + " 天 " + (hr % 24) + " 小时"; }
  var TODAY = sgt(Date.now(), "full").slice(0, 10);
  if (S.manual._d !== TODAY) S.manual = { _d: TODAY };                        // the self-confirmed ticks are for today only
  function ago(ms) { var m = Math.round((Date.now() - ms) / 60000); if (!isFinite(m)) return ""; if (m < 1) return "刚刚"; if (m < 60) return m + " 分钟前"; var hr = Math.round(m / 60); return hr < 48 ? hr + " 小时前" : Math.round(hr / 24) + " 天前"; }

  // ---------- term explainers ----------
  var popFor = null;
  function closePop() { $("pop").hidden = true; if (popFor) popFor.setAttribute("aria-expanded", "false"); popFor = null; }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest ? ev.target.closest(".q") : null, pop = $("pop");
    if (!b) { if (!ev.target.closest || !ev.target.closest("#pop")) closePop(); return; }
    ev.preventDefault(); ev.stopPropagation();
    if (popFor === b) { closePop(); return; }
    closePop();
    var g = GLOSS[b.getAttribute("data-g")]; if (!g) return;
    clear(pop); pop.appendChild(h("b", { text: g[0] })); pop.appendChild(document.createTextNode(g[1]));
    pop.hidden = false; popFor = b; b.setAttribute("aria-expanded", "true");
    var r = b.getBoundingClientRect(), w = pop.offsetWidth, x = Math.max(16, Math.min(window.innerWidth - w - 16, r.left + r.width / 2 - w / 2));
    var below = r.bottom + 8 + pop.offsetHeight < window.innerHeight;
    pop.style.left = (x + window.scrollX) + "px"; pop.style.top = ((below ? r.bottom + 8 : r.top - pop.offsetHeight - 8) + window.scrollY) + "px";
  });

  // ---------- verdict ----------
  function drawGauge(sc) {
    var svg = clear($("gauge")), cx = 100, cy = 96, r = 78;
    var pt = function (score, rad) { var th = Math.PI - (score + 10) / 20 * Math.PI; return [cx + rad * Math.cos(th), cy - rad * Math.sin(th)]; };
    var arc = function (a, b, rad) { var p0 = pt(a, rad), p1 = pt(b, rad); return "M" + p0[0].toFixed(1) + " " + p0[1].toFixed(1) + " A" + rad + " " + rad + " 0 0 " + (b > a ? 1 : 0) + " " + p1[0].toFixed(1) + " " + p1[1].toFixed(1); };
    sv("path", { d: arc(-10, 10, r), fill: "none", stroke: "rgba(255,255,255,.11)", "stroke-width": 12, "stroke-linecap": "round" }, svg);
    if (sc !== 0) sv("path", { d: arc(0, sc, r), fill: "none", stroke: sc > 0 ? "var(--m-bull)" : "var(--m-bear)", "stroke-width": 12, "stroke-linecap": "round" }, svg);
    var z0 = pt(0, r - 9), z1 = pt(0, r + 9); sv("line", { x1: z0[0], y1: z0[1], x2: z1[0], y2: z1[1], stroke: "var(--dim)", "stroke-width": 1.5 }, svg);
    var n = pt(sc, r - 18); sv("line", { x1: cx, y1: cy, x2: n[0].toFixed(1), y2: n[1].toFixed(1), stroke: "var(--ink)", "stroke-width": 2.5, "stroke-linecap": "round" }, svg);
    sv("circle", { cx: cx, cy: cy, r: 6, fill: "var(--ink)", stroke: "var(--bg2)", "stroke-width": 3 }, svg);
    sv("text", { x: 14, y: 113, "text-anchor": "middle" }, svg).textContent = "空";
    sv("text", { x: 186, y: 113, "text-anchor": "middle" }, svg).textContent = "多";
    svg.setAttribute("aria-label", "综合评分 " + sc + "，范围 −10 到 +10：" + P.scoreWord(sc));
  }
  function sysPlanNow(trail) { var R = P.regime(S.E); return R.dir ? P.systemPlan(S.E, R.dir, { trail: !!trail }) : null; }
  function toPlan() { var r = $("plan").getBoundingClientRect(); if (r.top > window.innerHeight - 200 || r.top < 0) $("plan").scrollIntoView({ behavior: "smooth", block: "start" }); }
  function renderVerdict() {
    var E = S.E, ov = E.overall || {}, V = P.verdict(E), box = $("verdict"), nw = newsCheck();
    // On the backup feed (PAXG) the structure can differ from spot. The server works the answer out on spot every few
    // hours: when the two disagree, the backup answer is shown as unconfirmed, not as a trade.
    var srv = S.srv && /现货/.test(S.srv.source || "") ? S.srv : null, backup = !!(S.feed && S.feed.source === "paxg");
    var agrees = !!(srv && srv.level === V.level && (V.level !== "go" || srv.side === V.side)), unconfirmed = backup && V.level !== "none" && !agrees;
    box.className = "verdict live-data " + (unconfirmed ? "wait" : V.level);
    $("v-tag").textContent = (V.closed ? "休市中 · " : "") + (unconfirmed ? "备用数据 · 待确认" : V.tag);
    $("v-title").textContent = unconfirmed ? "备用数据显示「" + V.tag + "」，现货还没确认" : V.title; $("v-text").textContent = V.text;
    var rs = clear($("v-reasons")), reasons = V.reasons.slice();
    reasons.push(V.closed ? { label: "时机", ok: false, text: M.closedText } : nw ? { label: "时机", ok: nw.ok, text: nw.detail } : { label: "时机", ok: null, text: "没读到日历：进场前自己看一眼有没有大数据" });
    reasons.forEach(function (r) { rs.appendChild(h("li", null, [h("div", { class: "rl" }, [mark(r.ok), r.label]), h("div", { class: "rt", text: r.text })])); });

    // what to do now, as steps: the first is the action, the rest is what to wait for and what follows
    var steps = V.next.slice(), hold = false;
    if (V.closed) { steps.unshift({ lead: "现在休市，什么都不用做", text: "周一约 06:00 SGT 开盘，可能跳空。开盘后再回来看一次结论。" }); hold = true; }
    else if (V.level === "go" && nw && nw.ok === false) { steps.unshift({ lead: "先等数据过去", text: nw.detail + "。数据前后价格乱跳，点差也会放大。" }); hold = true; }
    else if (V.level === "go" && steps[0] && steps[0].late) hold = true;
    // A trade opened on a Friday is held over the weekend: Monday can open beyond the stop. The replay held through
    // weekends too, so this is already in its results; the page only says when the market shuts.
    if (V.level === "go" && !V.closed && M.weekend) {
      var nowS = Date.now() / 1000, off = Feed.serverOff(nowS), sd = new Date((nowS + off) * 1000);
      if (sd.getUTCDay() === 5) {
        var shut = Date.UTC(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate()) - off * 1000 + 24 * 3600000;   // Friday 17:00 New York = 24:00 broker time
        steps.splice(Math.min(2, steps.length), 0, { lead: "今天是周五", text: "黄金 " + left(shut - Date.now()) + "后（周六 " + sgt(shut, "t") + " SGT）收市，进场的单会带过周末。周一开盘可能跳空越过止损，亏得比 1R 多。回放里的单子也都带着周末，这个风险已经算在结果里；按计划的手数做，别加码。" });
      }
    }
    // On the backup feed (PAXG) the structure can differ from spot: say so, compare with the server's last spot answer,
    // and offer no one-click plan unless the two agree.
    if (backup) {
      steps.unshift({ lead: "备用数据：这里的结论可能不准", text: "现货数据暂时连不上，这一页改用 PAXG 代币的 K 线计算，它的结构有时和现货不一样。" + (srv ? "服务器 " + srv.updated.slice(5, 16) + " 用现货算的结论是「" + srv.tag + "」" + (agrees ? "，和这里一致。" : "，和这里不一样：以现货为准，先别按这里下单。") : "先别按这里的信号下单，等现货数据恢复。") });
      hold = true; if (!agrees) steps.forEach(function (x) { delete x.fill; });
    }
    if (S.pos) { steps.unshift({ lead: "你有一笔持仓在跟踪", text: "怎么管理看上面「我的持仓」：止损、目标、每天该挪到哪里、什么时候离场都写好了。" }); hold = true; }
    S.late = V.level === "go" && !!(V.next[0] && V.next[0].late);
    var ol = clear($("v-next")); $("v-next-wrap").hidden = !steps.length;
    steps.forEach(function (st, i) {
      var acts = [];
      if (st.fill) acts.push(h("button", { type: "button", class: "btn sm", text: st.fill, onclick: function () { var c = sysPlanNow(false); if (c) loadCandidate(c, "目标 3R 方案"); toPlan(); } }));
      ol.appendChild(h("li", { class: i === 0 ? "now" + (hold ? " hold" : "") : "" }, [h("div", null, [h("div", { class: "nl", text: st.lead }), h("div", { class: "nt", text: st.text })]), acts.length ? h("div", { class: "na" }, acts) : null]));
    });
    $("v-other").hidden = !V.other; $("v-other").textContent = V.other || "";
    var lw = $("v-lines-wrap"), ll = clear($("v-lines")); lw.hidden = !V.lines.length && !V.other;
    V.lines.forEach(function (l) { ll.appendChild(h("div", { class: "v-line " + l.dir }, [h("i", { text: l.dir === "up" ? "▲" : "▼" }), h("b", { text: fmt(l.price, 1) }), h("span", null, [l.text, l.dist !== null ? h("small", { text: "离现价 " + fmt(l.dist, 1) + " 美元" }) : null])])); });
    renderProofLine(V);

    var chips = clear($("v-chips")), now = Date.now(), ss = sessionState(now), pm = posState();
    if (S.pos) chips.appendChild(h("button", { type: "button", class: "chip " + (pm && pm.pnlR > 0 ? "bull" : pm && pm.pnlR < 0 ? "bear" : "gold"), style: "cursor:pointer", text: "持仓中" + (pm && pm.pnlR !== null ? " " + sgn(pm.pnlR) + "R" : ""), onclick: function () { $("pos").scrollIntoView({ behavior: "smooth", block: "start" }); } }));
    if (ov.marketOpen !== false && ss.open.length) chips.appendChild(h("span", { class: "chip gold", text: ss.open.join(" + ") + (ss.overlap ? " 重叠" : "") }));
    var nx = S.events.filter(function (e) { return e.hi && e.ms > now; })[0];
    if (nx) chips.appendChild(h("span", { class: "chip neut", title: nx.name, text: "下个大数据 " + left(nx.ms - now) + "后" }));

    // gauge and timeframe lights (the price itself is painted by paintLive)
    var sc = Math.max(-10, Math.min(10, P.votes(E).reduce(function (a, v) { return a + (v.v || 0) * v.w; }, 0)));
    drawGauge(sc);
    $("g-word").textContent = P.scoreWord(sc) + " " + (sc > 0 ? "+" : sc < 0 ? "−" : "") + Math.abs(sc);
    // the score written out from the five lights, and the candle it was worked out on: nothing here is typed in
    var vs = P.votes(E), signed = function (x) { return (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x); }, m15 = E.tfs["15M"];
    var lastClose = m15 && m15.barTime ? Date.parse(m15.barTime) + 900000 : null, nextQ = (Math.floor(Date.now() / 900000) + 1) * 900000;
    var gs = clear($("g-sub")); gs.appendChild(document.createTextNode(vs.map(function (v) { return P.TF_S[v.tf] + " " + signed((v.v || 0) * v.w); }).join(" · ") + " = " + signed(sc)));
    gs.appendChild(h("span", { class: "g-at", text: (isFinite(lastClose) ? "按 " + sgt(lastClose, "t") + " 收盘的 K 线计算" : "按最新收盘的 K 线计算") + (marketOpen() ? " · " + sgt(nextQ, "t") + " 再算" : " · 休市中") + (S.feed && S.feed.source === "paxg" ? " · 备用数据" : "") }));
    var tfl = clear($("tfl"));
    // The arrow is the structure trend the rule uses: it turns only when a candle closes beyond the last swing high or
    // low, so price can fall for days under an "up" arrow. When the smaller swings, the moving averages and RSI all run
    // against the arrow, the box says "回调" (pullback) or "反弹" (bounce) and the line under the boxes says where it would turn.
    var counters = [];
    vs.forEach(function (v) {
      var t = E.tfs[v.tf], since = t && num(t.since) !== null ? t.since : null, flip = v.v ? P.flipLevel(E, v.tf, -v.v) : null;
      var stack = t && t.ema ? t.ema.stack : null, rsi = t ? num(t.rsi) : null, opp = v.v > 0 ? "bearish" : "bullish", why = [];
      if (v.v && t && t.internal === opp) why.push("小级别" + (v.v > 0 ? "向下" : "向上"));
      if (v.v && stack === opp) why.push("均线" + (v.v > 0 ? "空头" : "多头") + "排列");
      var against = !!(v.v && t && (t.internal === opp || (stack === opp && rsi !== null && (v.v > 0 ? rsi < 50 : rsi > 50))));
      if (against && rsi !== null) why.push("RSI " + Math.round(rsi));
      var dirWord = v.v === 1 ? "向上" : v.v === -1 ? "向下" : "不明", turnWord = v.v > 0 ? "向下" : "向上";
      var tip = P.TF_ZH[v.tf] + " 大结构" + dirWord + (since ? "，自 " + sgt(since) + " 起" : "") + "（权重 " + v.w + "）" +
        (t && t.lastEvent ? "；上次" + (t.lastEvent.dir === "bull" ? "向上" : "向下") + (t.lastEvent.type === "CHoCH" ? "转折" : "突破") + "在 " + fmt(t.lastEvent.level, 1) : "") +
        (against ? "；但最近在反着走（" + why.join("，") + "），" + (v.v > 0 ? "回调中" : "反弹中") : "") + (flip !== null ? "；收盘" + (v.v > 0 ? "跌破 " : "站上 ") + fmt(flip, 1) + " 才转" + turnWord : "");
      if (against) counters.push({ tf: v.tf, v: v.v, flip: flip, why: why });
      var sinceTxt = !since ? "" : Date.now() - since < 86400000 ? sgt(since, "t") + " 起" : sgt(since, "d") + " 起";
      tfl.appendChild(h("div", { class: "tfc " + (v.v === 1 ? "bull" : v.v === -1 ? "bear" : "") + (against ? " counter" : ""), title: tip, "aria-label": tip }, [h("div", { class: "n", text: P.TF_ZH[v.tf].replace(" ", "") }), h("div", { class: "a", text: v.v === 1 ? "▲" : v.v === -1 ? "▼" : "—" }), h("div", { class: "w", text: dirWord }), against ? h("div", { class: "c", text: v.v > 0 ? "回调中" : "反弹中" }) : null, h("div", { class: "s", text: sinceTxt })]));
    });
    var tn = $("tfl-note"); tn.hidden = !counters.length;
    tn.textContent = counters.map(function (c) { return P.TF_ZH[c.tf] + "：大结构还是" + (c.v > 0 ? "向上" : "向下") + "，但最近一直在" + (c.v > 0 ? "跌" : "涨") + "（" + c.why.join("，") + "）" + (c.flip !== null ? "，要收盘" + (c.v > 0 ? "跌破 " : "站上 ") + fmt(c.flip, 1) + " 才算转" + (c.v > 0 ? "向下" : "向上") : ""); }).join("；") + (counters.length ? "。箭头只在 K 线收盘突破前高或前低时才改变，规则看的就是它。" : "");

    $("closed").hidden = !V.closed;
    alertCheck(V, unconfirmed);
    S.vLevel = V.level; paintLive();
  }
  // The parts that move with every price tick: the number, and where it sits between support and resistance.
  function paintLive() {
    var E = S.E; if (!E) return;
    var shown = sh(S.live), pe = $("price"), open = marketOpen(), paxg = S.feed && S.feed.source === "paxg";
    $("price-k").textContent = open ? "现价 · 现货金" : "收盘价 · 现货金";
    pe.textContent = fmt(shown, 2);
    if (S.lastShown !== null && shown !== S.lastShown) { pe.classList.remove("up", "dn"); void pe.offsetWidth; pe.classList.add(shown > S.lastShown ? "up" : "dn"); }
    S.lastShown = shown;
    $("price-sub").textContent = !open ? "休市中，周一约 06:00 SGT 开盘" : S.gapOk && num(S.raw) !== null ? (!M.calibrate ? "实时成交价 · " + M.liveName : "实时推送 · " + (S.basisAt && Date.now() - S.basisAt < 20 * 60000 ? "按现货 1 分钟 K 线校准（买价，和 MT5 图表同一种价）" : "按 gold-api 现货报价校准") + (paxg ? "（备用数据源）" : "")) : "最近一根 15 分钟 K 线的收盘价，实时报价连接中";
    // where price sits between the nearest support and resistance
    var nr = P.nearest(E), vr = $("v-range"); vr.hidden = !(nr.sup && nr.res);
    if (nr.sup && nr.res) {
      var a = sh(nr.sup.price), b = sh(nr.res.price), pos = Math.max(2, Math.min(98, (shown - a) / (b - a) * 100));
      $("vr-sup").textContent = fmt(a, 1); $("vr-sup-l").textContent = nr.sup.labels.slice(0, 2).join(" · ") + "，比现价低 " + fmt(shown - a, 1) + " 美元";
      $("vr-res").textContent = fmt(b, 1); $("vr-res-l").textContent = nr.res.labels.slice(0, 2).join(" · ") + "，比现价高 " + fmt(b - shown, 1) + " 美元";
      $("vr-dot").style.left = pos + "%"; $("vr-cap").style.left = pos + "%"; $("vr-cap").textContent = "现价 " + fmt(shown, 1);
    }
  }

  // ---------- timeframe table ----------
  function rsiWord(r) { return r >= 70 ? "偏热" : r <= 30 ? "偏冷" : r >= 55 ? "偏强" : r <= 45 ? "偏弱" : "均衡"; }
  function renderMatrix() {
    var tb = clear($("matrix")), E = S.E;
    P.TF_ORDER.forEach(function (tf) {
      var t = E.tfs[tf];
      if (!t || t.error) { tb.appendChild(h("tr", null, [h("td", { class: "tf", text: P.TF_ZH[tf] }), h("td", { colspan: "6", class: "muted", text: "数据不足：" + ((t && t.error) || "无响应") })])); return; }
      var tr = h("tr");
      tr.appendChild(h("td", { class: "tf" }, [P.TF_ZH[tf], h("span", { class: "w", text: tf + " · 权重 " + P.TF_WEIGHT[tf] })]));
      var cls = t.trend === "bullish" ? "bull" : t.trend === "bearish" ? "bear" : "neut";
      tr.appendChild(h("td", null, [h("span", { class: "chip " + cls, text: cls === "bull" ? "▲ 向上" : cls === "bear" ? "▼ 向下" : "不明" }), h("div", { class: "sm", text: "小级别" + (t.internal === "bullish" ? "向上" : t.internal === "bearish" ? "向下" : "不明") })]));
      tr.appendChild(h("td", null, [h("div", { class: "mono", text: P.eventText(t.lastEvent, sh) }), h("div", { class: "sm", text: t.lastEvent ? (t.lastEvent.dir === "bull" ? "向上" : "向下") + (t.lastEvent.type === "CHoCH" ? "转折" : "延续") + " · " + t.lastEvent.barsAgo + " 根前" : "" })]));
      var z = h("td");
      if (t.range) {
        z.appendChild(h("div", { text: (t.range.zone === "premium" ? "偏贵" : t.range.zone === "discount" ? "偏便宜" : "中间") + " " + t.range.pct + "%" }));
        var zb = h("div", { class: "zbar", role: "img", "aria-label": "在区间的 " + t.range.pct + "% 处" }), i = h("i"); i.style.left = Math.max(0, Math.min(100, t.range.pct)) + "%"; zb.appendChild(i); z.appendChild(zb);
        z.appendChild(h("div", { class: "sm mono", text: fmt(sh(t.range.bottom), 0) + " – " + fmt(sh(t.range.top), 0) }));
      } else z.appendChild(document.createTextNode("—"));
      tr.appendChild(z);
      tr.appendChild(h("td", null, [h("div", { class: "mono", text: t.rsi === null ? "—" : String(t.rsi) }), h("div", { class: "sm", text: t.rsi === null ? "" : rsiWord(t.rsi) })]));
      var em = t.ema || {};
      tr.appendChild(h("td", null, [h("div", { text: P.ZH.stack[em.stack] || em.stack || "—" }), h("div", { class: "sm mono", text: fmt(sh(em.e20), 0) + " / " + fmt(sh(em.e50), 0) + " / " + fmt(sh(em.e200), 0) })]));
      var notes = [];
      (t.patterns || []).forEach(function (p) { notes.push(P.patternText(p) + "（" + P.statusText(p.status) + "）"); });
      ((t.liquidity || {}).sweeps || []).forEach(function (s) { notes.push((s.side === "high" ? "刚扫过高点 " : "刚扫过低点 ") + fmt(sh(s.level), 1) + " · " + s.barsAgo + " 根前"); });
      (t.fvgs || []).forEach(function (g) { if (g.inside) notes.push("价格在" + (g.dir === "bull" ? "看多" : "看空") + "缺口内"); });
      var eqh = (t.liquidity || {}).equalHighs || [], eql = (t.liquidity || {}).equalLows || [];
      if (eqh.length) notes.push("等高 " + eqh.map(function (p) { return fmt(sh(p), 1); }).join("、"));
      if (eql.length) notes.push("等低 " + eql.map(function (p) { return fmt(sh(p), 1); }).join("、"));
      var last = h("td"); if (!notes.length) last.appendChild(h("span", { class: "muted", text: "—" }));
      notes.forEach(function (n, k) { last.appendChild(h("div", { class: k ? "sm" : "", text: n })); });
      tr.appendChild(last); tb.appendChild(tr);
    });
  }

  // ---------- chart ----------
  var CH = null; // the bars of the last draw, for the hover layer and the data table
  function niceStep(span, target) { var raw = span / target, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), n = raw / mag; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag; }
  function renderTfTabs() {
    var el = clear($("tftabs"));
    CHART_TFS.forEach(function (tf) {
      el.appendChild(h("button", { type: "button", "aria-pressed": String(tf === S.tf), text: P.TF_ZH[tf].replace(" ", ""), onclick: function () { S.tf = tf; LS.set("tf", tf); renderTfTabs(); drawChart(); fillTable(); } }));
    });
    all("[data-cmode]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-cmode") === S.cmode)); });
  }
  // In "simple" mode the chart shows only what the verdict talks about: the two nearest strong levels on each
  // side and this timeframe's own gaps nearest to price.
  function chartLevels(E) {
    var LV = P.levels(E), tfs = ZONE_TFS[S.tf], pts = LV.points, zs = LV.zones.filter(function (z) { return tfs.indexOf(z.tf) >= 0; });
    if (S.cmode !== "simple") return { points: pts, zones: zs };
    var near = function (side) { var l = pts.filter(function (p) { return p.side === side && p.strength >= 3; }); if (side === "res") l = l.slice().reverse(); return l.slice(0, 2); };
    var own = zs.filter(function (z) { return z.tf === tfs[0]; }), pick = function (side) { var l = own.filter(function (z) { return z.side === side; }); return side === "res" ? l.slice(-1) : l.slice(0, 1); };
    return { points: near("res").concat(near("sup")), zones: pick("res").concat(own.filter(function (z) { return z.side === "in"; }), pick("sup")) };
  }
  function drawChart() {
    var box = $("chart"), E = S.E; if (!E) return;
    var t = E.tfs[S.tf], tip = null;
    clear(box);
    if (!t || t.error || !t.bars || t.bars.length < 5) { box.appendChild(h("p", { class: "note", text: "这个周期暂时没有 K 线数据。" })); CH = null; return; }
    var W = Math.max(300, Math.round(box.clientWidth)), H = W < 560 ? 320 : W < 800 ? 380 : 440;
    var L = 8, R = 68, T = 14, B = 26, plotW = W - L - R;
    var fb = formingBar(S.tf), src = fb && fb[0] > t.bars[t.bars.length - 1][0] ? t.bars.concat([fb]) : t.bars, live = src !== t.bars;
    var n = Math.max(30, Math.min(src.length, Math.floor(plotW / 7)));
    var bars = src.slice(-n).map(function (b) { return [b[0], sh(b[1]), sh(b[2]), sh(b[3]), sh(b[4])]; });
    var lo = Infinity, hi = -Infinity; bars.forEach(function (b) { lo = Math.min(lo, b[3]); hi = Math.max(hi, b[2]); });
    var span0 = hi - lo, price = sh(S.live), extras = [price];
    FIELDS.forEach(function (k) { extras.push(num(S.plan[k])); });
    extras.forEach(function (v) { if (v !== null && v > lo - span0 * 0.8 && v < hi + span0 * 0.8) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    var pad = (hi - lo) * 0.07; lo -= pad; hi += pad;
    var y = function (p) { return T + (hi - p) / (hi - lo) * (H - T - B); };
    var cw = plotW / n, x = function (i) { return L + cw * i + cw / 2; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", tabindex: "0", "aria-label": P.TF_ZH[S.tf] + " K 线图，含支撑阻力、缺口和你的计划价位。左右方向键可逐根查看。" });

    // grid + price axis (solid hairlines)
    var step = niceStep(hi - lo, 5), ticks = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      var gy = y(v);
      sv("line", { x1: L, x2: W - R, y1: gy, y2: gy, stroke: "var(--border)", "stroke-width": 1 }, svg);
      ticks.push({ y: gy, text: Math.round(v).toLocaleString("en-US") });
    }
    var labels = []; // {y, x, text, strength}: placed later so that the strongest win the space
    var LV = chartLevels(E);

    LV.zones.forEach(function (z) {
      var top = sh(z.top), bot = sh(z.bottom); if (bot > hi || top < lo) return;
      if (top - bot > (hi - lo) * 0.6) return;                                   // too tall to say anything as a band
      var zt = Date.parse(z.time) / 1000, xi = 0;
      for (var k = 0; k < bars.length; k++) { if (bars[k][0] >= zt) { xi = k; break; } }
      var x0 = zt <= bars[0][0] ? L : x(xi) - cw / 2, col = z.polarity === "bull" ? "var(--m-bull)" : "var(--m-bear)";
      var yt = Math.max(T, y(top)), yb = Math.min(H - B, y(bot));
      sv("rect", { x: x0, y: yt, width: W - R - x0, height: Math.max(2, yb - yt), fill: col, "fill-opacity": 0.1 }, svg);
      sv("line", { x1: x0, x2: W - R, y1: yt, y2: yt, stroke: col, "stroke-opacity": 0.35, "stroke-width": 1 }, svg);
      sv("line", { x1: x0, x2: W - R, y1: yb, y2: yb, stroke: col, "stroke-opacity": 0.35, "stroke-width": 1 }, svg);
      labels.push({ y: yt + 12, x: x0 + 6, text: z.label, strength: z.strength - 0.5 });
    });

    LV.points.forEach(function (l) {
      var p = sh(l.price); if (p > hi || p < lo) return;
      var col = l.side === "res" ? "var(--m-bear)" : "var(--m-bull)", ly = y(p);
      sv("line", { class: "lv", "data-lv": l.price, x1: L, x2: W - R, y1: ly, y2: ly, stroke: col, "stroke-opacity": 0.6, "stroke-width": 1, "stroke-dasharray": "5 4" }, svg);
      labels.push({ y: ly - 4, x: L + 6, text: (l.side === "res" ? "阻力 " : "支撑 ") + fmt(p, 1) + " · " + l.labels[0] + (l.labels.length > 1 ? " 等 " + l.labels.length + " 项" : ""), strength: l.strength });
    });

    bars.forEach(function (b, i) {
      var up = b[4] >= b[1], col = up ? "var(--m-bull)" : "var(--m-bear)", cx = x(i), bw = Math.max(1.5, cw * 0.62);
      sv("line", { x1: cx, x2: cx, y1: y(b[2]), y2: y(b[3]), stroke: col, "stroke-width": 1 }, svg);
      var open = live && i === bars.length - 1;                                  // the candle still forming is drawn hollow
      sv("rect", { x: cx - bw / 2, y: y(Math.max(b[1], b[4])), width: bw, height: Math.max(1, Math.abs(y(b[1]) - y(b[4]))), rx: bw > 4 ? 1 : 0, fill: open ? "var(--bg2)" : col, stroke: col, "stroke-width": open ? 1.25 : 0 }, svg);
    });

    // plan: risk / reward wash, then lines
    var pl = S.plan, e = num(pl.entry), s = num(pl.stop), t1 = num(pl.tp1), t2 = num(pl.tp2), tags = [];
    var inR = function (p) { return p !== null && p >= lo && p <= hi; };
    var wx = L + plotW * 0.78;
    if (inR(e) && s !== null) { var ys = Math.max(T, Math.min(H - B, y(s))); sv("rect", { x: wx, y: Math.min(y(e), ys), width: W - R - wx, height: Math.abs(y(e) - ys), fill: "var(--m-bear)", "fill-opacity": 0.1 }, svg); }
    var far = t2 !== null ? t2 : t1;
    if (inR(e) && far !== null) { var yf = Math.max(T, Math.min(H - B, y(far))); sv("rect", { x: wx, y: Math.min(y(e), yf), width: W - R - wx, height: Math.abs(y(e) - yf), fill: "var(--m-bull)", "fill-opacity": 0.1 }, svg); }
    [["entry", e, "var(--m-blue)", "#0A0A0F", "入场"], ["stop", s, "var(--m-bear)", "#FFFFFF", "止损"], ["tp1", t1, "var(--m-bull)", "#0A0A0F", "目标1"], ["tp2", t2, "var(--m-bull)", "#0A0A0F", "目标2"]].forEach(function (d) {
      if (!inR(d[1])) return;
      sv("line", { x1: L, x2: W - R, y1: y(d[1]), y2: y(d[1]), stroke: d[2], "stroke-width": 1.5 }, svg);
      tags.push({ y: y(d[1]), text: Math.round(d[1]).toLocaleString("en-US"), fill: d[2], ink: d[3] });
      labels.push({ y: y(d[1]) - 4, x: W - R - 46, text: d[4], strength: 99 });
    });

    if (inR(price)) {
      sv("line", { x1: L, x2: W - R, y1: y(price), y2: y(price), stroke: "var(--m-gold)", "stroke-width": 1.25 }, svg);
      tags.push({ y: y(price), text: fmt(price, 1), fill: "var(--m-gold)", ink: "#0A0A0F" });
    }

    // labels: strongest first, skip any that would collide
    var placed = [];
    labels.sort(function (a, b) { return b.strength - a.strength; }).forEach(function (lb) {
      if (lb.y < T + 9 || lb.y > H - B - 3) return;
      var tw = 0; for (var ci = 0; ci < lb.text.length; ci++) tw += lb.text.charCodeAt(ci) > 255 ? 10.6 : 6.35;
      if (lb.x + tw + 6 > W - R) return;
      for (var k = 0; k < placed.length; k++) if (Math.abs(placed[k].y - lb.y) < 14 && lb.x < placed[k].x1 + 6 && lb.x + tw > placed[k].x0 - 6) return;
      placed.push({ y: lb.y, x0: lb.x, x1: lb.x + tw });
      sv("rect", { x: lb.x - 4, y: lb.y - 10.5, width: tw + 8, height: 14, rx: 3, fill: "var(--bg2)", "fill-opacity": 0.86 }, svg);
      sv("text", { x: lb.x, y: lb.y, style: "fill:var(--text)" }, svg).textContent = lb.text;
    });

    // axis tags: keep them apart, and never print a tick under one
    tags.sort(function (a, b) { return a.y - b.y; });
    for (var q = 1; q < tags.length; q++) if (tags[q].y - tags[q - 1].y < 17) tags[q].y = tags[q - 1].y + 17;
    ticks.forEach(function (tk) {
      for (var k = 0; k < tags.length; k++) if (Math.abs(tags[k].y - tk.y) < 15) return;
      sv("text", { x: W - R + 8, y: tk.y + 3.5 }, svg).textContent = tk.text;
    });
    tags.forEach(function (g) {
      var ty = Math.max(T + 8, Math.min(H - B - 8, g.y));
      sv("rect", { x: W - R + 3, y: ty - 8.5, width: R - 5, height: 17, rx: 4, fill: g.fill }, svg);
      sv("text", { x: W - R + 8, y: ty + 3.5, style: "fill:" + g.ink + ";font-weight:600" }, svg).textContent = g.text;
    });

    // time axis
    var mode = S.tf === "D" || S.tf === "4H" ? "d" : S.tf === "1H" ? "dt" : "t", cnt = W < 560 ? 3 : mode === "dt" ? 4 : 5;
    for (var a = 0; a < cnt; a++) {
      var idx = Math.round(a * (n - 1) / (cnt - 1));
      sv("text", { x: x(idx), y: H - 7, "text-anchor": a === 0 ? "start" : a === cnt - 1 ? "end" : "middle" }, svg).textContent = sgt(bars[idx][0] * 1000, mode === "t" && a === 0 ? "dt" : mode);
    }

    // hover layer
    var vl = sv("line", { y1: T, y2: H - B, stroke: "var(--dim)", "stroke-width": 1, visibility: "hidden" }, svg);
    var hl = sv("line", { x1: L, x2: W - R, stroke: "var(--dim)", "stroke-width": 1, visibility: "hidden" }, svg);
    var ab = sv("rect", { x: W - R + 3, width: R - 5, height: 17, rx: 4, fill: "var(--bg4)", visibility: "hidden" }, svg);
    var at = sv("text", { x: W - R + 8, style: "fill:var(--ink);font-weight:600", visibility: "hidden" }, svg);
    sv("rect", { x: L, y: T, width: plotW, height: H - T - B, fill: "transparent" }, svg);
    box.appendChild(svg);
    tip = h("div", { class: "tip", hidden: true }); box.appendChild(tip);
    CH = { bars: bars, n: n, i: n - 1, live: live };

    function show(i, py) {
      i = Math.max(0, Math.min(n - 1, i)); CH.i = i;
      var b = bars[i], cx = x(i), pr = py === null ? b[4] : hi - (py - T) / (H - T - B) * (hi - lo), yy = py === null ? y(b[4]) : py;
      vl.setAttribute("x1", cx); vl.setAttribute("x2", cx); vl.setAttribute("visibility", "visible");
      hl.setAttribute("y1", yy); hl.setAttribute("y2", yy); hl.setAttribute("visibility", "visible");
      ab.setAttribute("y", yy - 8.5); ab.setAttribute("visibility", "visible");
      at.setAttribute("y", yy + 3.5); at.textContent = fmt(pr, 1); at.setAttribute("visibility", "visible");
      clear(tip); tip.hidden = false;
      var chg = (b[4] - b[1]) / b[1] * 100;
      tip.appendChild(h("div", { class: "t", text: P.TF_ZH[S.tf] + " · " + sgt(b[0] * 1000, S.tf === "D" ? "d" : "dt") + " SGT" + (live && i === n - 1 ? " · 还没收盘" : "") }));
      [["开盘", fmt(b[1], 2)], ["最高", fmt(b[2], 2)], ["最低", fmt(b[3], 2)], ["收盘", fmt(b[4], 2)], ["涨跌", (chg >= 0 ? "▲ +" : "▼ −") + Math.abs(chg).toFixed(2) + "%"]].forEach(function (r) {
        tip.appendChild(h("div", { class: "r" }, [h("span", { text: r[0] }), h("b", { text: r[1] })]));
      });
      var scale = box.clientWidth / W, tw = tip.offsetWidth, lf = cx * scale + 14;
      if (lf + tw > box.clientWidth - R * scale) lf = cx * scale - tw - 14;
      tip.style.left = Math.max(4, lf) + "px"; tip.style.top = Math.max(4, Math.min(yy * scale - 20, box.clientHeight - tip.offsetHeight - 8)) + "px";
    }
    function hide() { [vl, hl, ab, at].forEach(function (el) { el.setAttribute("visibility", "hidden"); }); tip.hidden = true; }
    function at2(ev) { var r = svg.getBoundingClientRect(), k = W / r.width; return { px: (ev.clientX - r.left) * k, py: (ev.clientY - r.top) * k }; }
    svg.addEventListener("pointermove", function (ev) { var p = at2(ev); if (p.px < L || p.px > W - R || p.py < T || p.py > H - B) { hide(); return; } show(Math.floor((p.px - L) / cw), p.py); });
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("click", function (ev) {
      if (!S.armed) return; var p = at2(ev); if (p.py < T || p.py > H - B) return;
      setField(S.armed, Math.round((hi - (p.py - T) / (H - T - B) * (hi - lo)) * 10) / 10);
    });
    svg.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowLeft") { show(CH.i - 1, null); ev.preventDefault(); }
      else if (ev.key === "ArrowRight") { show(CH.i + 1, null); ev.preventDefault(); }
      else if (ev.key === "Escape") hide();
    });
    svg.addEventListener("focus", function () { show(CH.i, null); });
    svg.addEventListener("blur", hide);
    box.classList.toggle("picking", !!S.armed);
  }
  function fillTable() {
    var d = $("tbl"), body = $("tbl-body"); if (!d.open || !CH) return;
    clear(body);
    var tb = h("tbody");
    CH.bars.slice().reverse().forEach(function (b, k) { tb.appendChild(h("tr", null, [h("td", { text: sgt(b[0] * 1000, S.tf === "D" ? "d" : "dt") + (CH.live && k === 0 ? "（未收盘）" : "") }), h("td", { text: fmt(b[1], 2) }), h("td", { text: fmt(b[2], 2) }), h("td", { text: fmt(b[3], 2) }), h("td", { text: fmt(b[4], 2) })])); });
    body.appendChild(h("table", null, [h("thead", null, [h("tr", null, [h("th", { text: P.TF_ZH[S.tf] + " · SGT" }), h("th", { text: "开" }), h("th", { text: "高" }), h("th", { text: "低" }), h("th", { text: "收" })])]), tb]));
  }

  // ---------- levels, gaps, patterns ----------
  function levelRow(l) {
    var p = sh(l.price), d = p - sh(S.live);
    var dots = h("span", { class: "str", title: "重合的依据越多越满" }), lv = l.strength >= 6 ? 3 : l.strength >= 3 ? 2 : 1;
    for (var k = 0; k < 3; k++) dots.appendChild(h("i", { class: k < lv ? "on" : "" }));
    var li = h("li", { class: l.side, tabindex: "0", role: "button", "aria-label": fmt(p, 1) + " " + l.labels.join("，") }, [h("span", { class: "bar" }), h("b", { text: fmt(p, 1) }), h("span", { class: "lb" }, [l.labels.join(" · "), dots]), h("span", { class: "dist", text: (d >= 0 ? "高 " : "低 ") + fmt(Math.abs(d), 1) })]);
    var pick = function () {
      if (S.armed) { setField(S.armed, Math.round(p * 10) / 10); return; }
      S.openLevel = S.openLevel === l.price ? null : l.price; renderLevels();
    };
    li.addEventListener("click", pick);
    li.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
    li.addEventListener("mouseenter", function () { hlLevel(l.price, true); }); li.addEventListener("mouseleave", function () { hlLevel(l.price, false); });
    return li;
  }
  function hlLevel(raw, on) { var el = $("chart").querySelector('.lv[data-lv="' + raw + '"]'); if (el) el.classList.toggle("hl", on); }
  function renderLevels() {
    var E = S.E, LV = P.levels(E), ul = clear($("ladder")), nowDone = false;
    var addNow = function () { ul.appendChild(h("li", { class: "now" }, [h("span", { class: "bar" }), h("b", { text: fmt(sh(S.live), 1) }), h("span", { class: "lb", text: "现价" }), h("span", { class: "dist" })])); nowDone = true; };
    LV.points.forEach(function (l) {
      if (!nowDone && l.side === "sup") addNow();
      ul.appendChild(levelRow(l));
      if (S.openLevel === l.price) {
        var q = h("span", { class: "quick" });
        FIELDS.forEach(function (f) { q.appendChild(h("button", { type: "button", text: "设为" + FIELD_ZH[f], onclick: function (ev) { ev.stopPropagation(); S.openLevel = null; setField(f, Math.round(sh(l.price) * 10) / 10); renderLevels(); } })); });
        ul.appendChild(h("li", { class: "act" }, [q]));
      }
    });
    if (!nowDone) addNow();

    var zl = clear($("zones")), zs = LV.zones.filter(function (z) { return z.tf !== "W" || z.side === "in"; }).slice(0, 8);
    if (!zs.length) zl.appendChild(h("p", { class: "note", text: "附近没有还留着的缺口。" }));
    zs.forEach(function (z) {
      var top = sh(z.top), bot = sh(z.bottom), pr = sh(S.live);
      var st = z.side === "in" ? "价格在里面" : z.side === "res" ? "在上方 " + fmt(bot - pr, 1) : "在下方 " + fmt(pr - top, 1);
      zl.appendChild(h("div", { class: "zi " + z.polarity + (z.side === "in" ? " in" : "") }, [h("span", { class: "bar" }), h("div", null, [h("div", { class: "zt", text: z.label + (z.tapped ? "" : " · 还没被碰过") }), h("div", { class: "zr", text: fmt(bot, 1) + " – " + fmt(top, 1) })]), h("span", { class: "zs", text: st })]));
    });

    var pt = clear($("patterns")), any = false;
    P.TF_ORDER.forEach(function (tf) {
      var t = E.tfs[tf]; if (!t || t.error) return;
      (t.patterns || []).forEach(function (p) {
        any = true;
        var bits = [];
        if (num(p.level) !== null) bits.push("关键位 " + fmt(sh(p.level), 1));
        if (num(p.upper) !== null) bits.push("上沿 " + fmt(sh(p.upper), 1) + " · 下沿 " + fmt(sh(p.lower), 1));
        if (num(p.target) !== null) bits.push("目标 " + fmt(sh(p.target), 1));
        if (num(p.invalid) !== null) bits.push("失效 " + fmt(sh(p.invalid), 1));
        pt.appendChild(h("div", { class: "pat " + p.bias }, [h("span", { class: "t", text: P.TF_ZH[tf] + " · " + P.patternText(p) + (p.bias === "bullish" ? "（偏多）" : p.bias === "bearish" ? "（偏空）" : "") }), h("span", { class: "s", text: P.statusText(p.status) }), bits.length ? h("span", { class: "s mono", text: bits.join(" · ") }) : null]));
      });
    });
    if (!any) pt.appendChild(h("p", { class: "note", text: "各周期暂时没有清晰的形态。" }));
  }

  // ---------- plan ----------
  function persistPlan() { LS.set("plan", S.plan); LS.set("acct", S.acct); }
  function syncInputs() {
    FIELDS.forEach(function (f) { var v = num(S.plan[f]); $("in-" + f).value = v === null ? "" : String(Math.round(v * 100) / 100); });
    $("in-bal").value = num(S.acct.balance) === null ? "" : S.acct.balance;
    $("in-risk").value = num(S.acct.riskPct) === null ? "" : S.acct.riskPct;
    $("in-contract").value = S.acct.contract; $("in-step").value = S.acct.lotStep; $("in-spread").value = S.acct.spread;
    $("in-note").value = S.plan.note || "";
    all("[data-side]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-side") === S.plan.side)); });
  }
  function replan() { persistPlan(); syncInputs(); if (S.E) renderCands(); renderPlan(); drawChart(); }
  function setField(f, v) {
    S.plan[f] = v; S.armed = null; touched(); replan(); renderArm();
    var el = $("in-" + f).closest(".f"); el.classList.add("flash"); setTimeout(function () { el.classList.remove("flash"); }, 700);
  }
  function renderArm() {
    all("[data-pick]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-pick") === S.armed)); });
    var hint = $("pickhint"); hint.hidden = !S.armed;
    if (S.armed) hint.textContent = "正在选「" + FIELD_ZH[S.armed] + "」：在图表上点一个价位就填好了。再点一次 ⌖ 取消。";
    $("chart").classList.toggle("picking", !!S.armed);
  }
  function touched() { S.plan.at = Date.now(); }                                // when the prices were last set: old ones are flagged
  function hasPlan() { return num(S.plan.entry) !== null && num(S.plan.stop) !== null; }
  function clearPlan() { S.plan = { side: S.plan.side, entry: null, stop: null, tp1: null, tp2: null, note: "", at: null }; S.manual = { _d: TODAY }; LS.set("manual", S.manual); replan(); }
  function loadCandidate(c, label) {
    S.plan.side = c.side; S.plan.entry = c.entry; S.plan.stop = c.stop; S.plan.tp1 = c.tp1; S.plan.tp2 = c.tp2; touched();
    replan(); toast("已填好：" + label);
  }
  function shownCand(c) { return { side: c.side, entry: r1(sh(c.entry)), stop: r1(sh(c.stop)), tp1: r1(sh(c.tp1)), tp2: r1(sh(c.tp2)) }; }
  function isSel(c) { return S.plan.side === c.side && num(S.plan.entry) !== null && Math.abs(S.plan.entry - c.entry) < 0.06 && num(S.plan.stop) !== null && Math.abs(S.plan.stop - c.stop) < 0.06 && (num(S.plan.tp1) === null) === (num(c.tp1) === null); }
  function renderCands() {
    var el = clear($("cands")), E = S.E, R = P.regime(E), any = false, picked = false;
    var card = function (k, side, tagline, line, sub, rr, label, live) {
      var on = isSel(k); any = true; if (on) picked = true;
      var btn = h("button", { type: "button", class: "cand" + (on ? " sel" : ""), "aria-pressed": String(on), title: "把这个方案填进计划" }, [
        h("span", { class: "cs " + side, text: side === "long" ? "▲ 做多" : "▼ 做空" }),
        h("span", null, [h("div", { class: "ct", text: line }), h("div", { class: "cd", text: tagline + (sub ? " · " + sub : "") })]),
        h("span", { class: "cr" }, [rr === null ? "跟踪" : rr.toFixed(1) + "R", h("small", { text: rr === null ? "不设目标" : "赚赔比" })])
      ]);
      btn.addEventListener("click", function () { loadCandidate(live ? live() || k : k, label); });
      el.appendChild(btn);
    };
    if (R.dir) [false, true].forEach(function (trail) {
      var k = P.systemPlan(E, R.dir, { trail: trail }); if (!k) return; var buy = R.dir > 0;
      card(k, k.side, R.full && S.late ? "信号已走远，这么晚进没有回放数据" : R.full ? "回放里有优势的情形" : "大方向对了，等小周期转回来再用", (buy ? "现价买入 " : "现价卖出 ") + fmt(k.entry, 0) + " · 止损 " + fmt(k.stop, 0) + (trail ? " · 跟踪止损" : " · 目标 " + fmt(k.tp1, 0)),
        "止损 " + fmt(k.dist, 0) + " 美元 = 3 倍小时波幅", trail ? null : P.SYS.targetR, trail ? "跟踪止损方案" : "目标 3R 方案", function () { return sysPlanNow(trail); });
    });
    else {
      el.appendChild(h("p", { class: "note", text: "现在没有信号，所以这里没有方案。周线、日线、4 小时同向以后，会自动出现按规则算好的价位。" }));
      var H1 = E.tfs["1H"];
      if (H1 && H1.atr && num(E.price) !== null) {                              // a worked example to learn the sizing on, clearly not a signal
        var row = h("div", { class: "prac" }, [h("span", { text: "想先熟悉手数怎么算？按现价生成一个示例（不是信号）：" })]);
        [1, -1].forEach(function (d) { row.appendChild(h("button", { type: "button", class: "btn sm ghost", text: d > 0 ? "▲ 练习做多" : "▼ 练习做空", onclick: function () { var k = P.systemPlan(S.E, d, {}); if (k) loadCandidate(k, "练习方案（不是信号）"); } })); });
        el.appendChild(row);
      }
    }
    S.daily.forEach(function (d) {
      var buy = d.side === "long", k = { side: d.side, entry: r1(d.entry), stop: r1(d.stop), tp1: d.tp1 === null ? null : r1(d.tp1), tp2: d.tp2 === null ? null : r1(d.tp2) };
      card(k, d.side, "来自每日分析，没有回放过", fmt(k.entry, 0) + (buy ? " 买入" : " 卖出") + " · 止损 " + fmt(k.stop, 0) + (k.tp1 !== null ? " · 目标 " + fmt(k.tp1, 0) : ""), "", d.rr, "每日分析的方案");
    });
    S.cardState = !any ? "na" : picked ? "done" : "";
  }
  function currentSize() { return P.size({ side: S.plan.side, entry: S.plan.entry, stop: S.plan.stop, tp1: S.plan.tp1, tp2: S.plan.tp2, balance: S.acct.balance, riskPct: S.acct.riskPct, contract: S.acct.contract, lotStep: S.acct.lotStep, spread: S.acct.spread }); }
  // Auto version of the "stay clear of big data" rule, when the risk calendar gives exact SGT times.
  function newsCheck() {
    var now = Date.now(), ev = S.events.filter(function (e) { return e.timed && e.hi; }); if (!S.events.length) return null;
    if (!ev.length) { var nm = S.events.filter(function (e) { return e.timed && e.ms > now; })[0]; return { id: "news", label: "避开重大数据", ok: true, detail: "本周日历上剩下的都不是高影响数据" + (nm ? "；下一个中等影响的是 " + nm.name + "（" + nm.date + " " + nm.time.split(" ")[0] + " SGT）" : "") }; }
    var next = ev.filter(function (e) { return e.ms > now; })[0], last = ev.filter(function (e) { return e.ms <= now; }).pop();
    if (next && next.ms - now <= 30 * 60000) return { id: "news", label: "避开重大数据", ok: false, detail: left(next.ms - now) + "后公布 " + next.name + "：数据前 30 分钟不开新仓" };
    if (last && now - last.ms <= 30 * 60000) return { id: "news", label: "避开重大数据", ok: false, detail: last.name + " 刚公布 " + left(now - last.ms) + "：等第一波走完再进" };
    return { id: "news", label: "避开重大数据", ok: true, detail: next ? "下一个大数据是 " + next.name + "（" + next.date + " " + next.time.split(" ")[0] + " SGT），还有 " + left(next.ms - now) : "日历上暂时没有带时间的大数据" };
  }
  function manualList() { return newsCheck() ? [STREAK] : [NEWS_MANUAL, STREAK]; }
  function currentChecks(sz) { var ck = S.E ? P.checks(S.E, S.plan, sz) : [], nw = newsCheck(); if (nw) ck.push(nw); return ck; }
  function helper(k) {
    var E = S.E; if (!E) return; var H1 = E.tfs["1H"], dir = S.plan.side === "short" ? -1 : 1, e = num(S.plan.entry), st = num(S.plan.stop);
    var set = function (f, v) { S.plan[f] = r1(v); };
    if (k === "e-now") set("entry", S.live);
    else if (k.slice(0, 2) === "s-") { if (e === null || !H1 || !H1.atr) { toast("先填入场价"); return; } set("stop", e - dir * parseFloat(k.slice(2)) * H1.atr); }
    else if (k === "t-none") { S.plan.tp1 = null; S.plan.tp2 = null; }
    else if (k === "t-2" || k === "t-3") { if (e === null || st === null) { toast("先填入场价和止损价"); return; } set("tp1", e + dir * parseFloat(k.slice(2)) * Math.abs(e - st)); S.plan.tp2 = null; }
    else if (k === "t-level") {
      if (e === null) { toast("先填入场价"); return; }
      var minD = st === null ? 0 : 2 * Math.abs(e - st);                          // nothing closer than 2R
      var pts = P.levels(E, { each: 12 }).points.map(function (l) { return l.price; }).filter(function (p) { return (p - e) * dir >= Math.max(minD, 1); }).sort(function (a, b) { return (a - b) * dir; });
      if (!pts.length) { toast("这个方向上 2R 以外没有关键位"); return; }
      set("tp1", pts[0]); S.plan.tp2 = pts.length > 1 ? r1(pts[1]) : null;
    }
    touched(); replan();
  }
  function ring(done, total, col) {
    var svg = sv("svg", { viewBox: "0 0 44 44", role: "img", "aria-label": "通过 " + done + " 项，共 " + total + " 项" }), c = 2 * Math.PI * 18;
    sv("circle", { cx: 22, cy: 22, r: 18, fill: "none", stroke: "var(--bg4)", "stroke-width": 4 }, svg);
    if (done > 0) sv("circle", { cx: 22, cy: 22, r: 18, fill: "none", stroke: col, "stroke-width": 4, "stroke-linecap": "round", "stroke-dasharray": (c * done / total).toFixed(1) + " " + c.toFixed(1), transform: "rotate(-90 22 22)" }, svg);
    sv("text", { x: 22, y: 26, "text-anchor": "middle" }, svg).textContent = done + "/" + total;
    return svg;
  }
  // One line at the top of the plan: how what is typed in compares with the answer at the top of the page.
  function planState(sz) {
    if (!S.E) return null;
    if (S.feed && S.feed.source === "paxg" && P.regime(S.E).full && !(S.srv && S.srv.level === "go")) return ["bad", "备用数据：信号没法确认", "现货数据连不上，五个周期同向是用 PAXG 代币算的，和现货可能不一样。先别下单，等现货恢复。"];
    var R = P.regime(S.E), dir = S.plan.side === "short" ? -1 : 1, way = R.dir > 0 ? "向上" : "向下", act = R.dir > 0 ? "做多" : "做空", mine = dir > 0 ? "做多" : "做空";
    var gone = "这次信号出现已久，价格已经顺着走了一段。回放只测过信号刚出现时进场，等下一次更稳妥。";
    if (!hasPlan()) return R.full && S.late ? ["ready", "信号已经走远", gone] : R.full ? ["go", "现在有信号", "点第 1 步里的方案，入场、止损、目标会自动填好。"]
      : R.dir ? ["ready", "大方向" + way + "，还在等小周期", "可以先点第 1 步里的方案，把计划准备好，等信号出现再下单。"]
      : ["none", "现在没有信号，不用做计划", "上面的结论是「先观望」。想熟悉手数怎么算，可以用第 1 步的练习按钮。"];
    if (!sz.valid) return ["bad", "价位还没填对", "看下面的提示，点一下就能改好。"];
    if (R.dir === dir) return R.full && S.late ? ["ready", "方向对，但信号已经走远", gone] : R.full ? ["go", "这笔和现在的信号同向", "五个周期都" + way + "。下面的检查都通过，就可以按计划执行。"]
      : ["ready", "方向对了，时机还没到", "等小周期转回" + way + "、上面的结论变成「可以顺势" + act + "」再下单。"];
    if (R.dir === -dir) return ["bad", "这笔是逆势", "周线、日线、4 小时都" + way + "，你填的是" + mine + "。回放里逆着三个大周期做是长期亏损。"];
    return ["none", "这是练习，不是信号", "上面的结论是「先观望」。可以用它熟悉手数怎么算，不建议现在真的下单。"];
  }
  function setHint(id, text, cls) { var el = $("fh-" + id); el.textContent = text || ""; el.className = "fh" + (cls ? " " + cls : ""); $("in-" + id).closest(".f").classList.toggle("bad", cls === "bad"); }
  // The line under each box: how far the price is from the entry, in dollars and in the units the rules use;
  // or, when it is on the wrong side for the direction, what is wrong with it.
  function renderHints() {
    var e = num(S.plan.entry), st = num(S.plan.stop), sell = S.plan.side === "short", dir = sell ? -1 : 1, px = num(S.live), H1 = S.E && S.E.tfs["1H"], atr = H1 && H1.atr ? H1.atr : null;
    var sx = clear($("side-x")); sx.appendChild(h("b", { text: sell ? "做空" : "做多" }));
    sx.appendChild(document.createTextNode(sell ? "：先卖后买，价格跌了才赚钱。止损放在入场价上方，目标放在下方。" : "：先买后卖，价格涨了才赚钱。止损放在入场价下方，目标放在上方。"));
    setHint("entry", e === null ? (px !== null ? "现价 " + fmt(px, 1) : "") : px === null ? "" : Math.abs(e - px) < 0.05 ? "就是现价" : "比现价" + (e > px ? "高 " : "低 ") + fmt(Math.abs(e - px), 1) + " 美元");
    var same = e !== null && st === e, stBad = e !== null && st !== null && (e - st) * dir < 0;
    setHint("stop", st === null ? (e !== null && atr ? "规则：离入场价 " + fmt(P.SYS.stopAtr * atr, 0) + " 美元（3 倍小时波幅）" : "") : e === null ? "" : same ? "不能和入场价一样" : stBad ? (sell ? "做空的止损要高于入场价" : "做多的止损要低于入场价")
      : "离入场价 " + fmt(Math.abs(e - st), 1) + " 美元" + (atr ? " · " + (Math.abs(e - st) / atr).toFixed(1) + " 倍小时波幅" : ""), st !== null && (same || stBad) ? "bad" : "");
    ["tp1", "tp2"].forEach(function (k) {
      var t = num(S.plan[k]), bad = e !== null && t !== null && (t - e) * dir <= 0, okStop = e !== null && st !== null && !stBad && !same;
      setHint(k, t === null ? (k === "tp1" ? "不填 = 用跟踪止损离场" : "") : e === null ? "" : bad ? (sell ? "做空的目标要低于入场价" : "做多的目标要高于入场价")
        : "离入场价 " + fmt(Math.abs(t - e), 1) + " 美元" + (okStop ? " · 止损距离的 " + (Math.abs(t - e) / Math.abs(e - st)).toFixed(1) + " 倍" : ""), bad ? "bad" : "");
    });
    var bal = num(S.acct.balance), pct = num(S.acct.riskPct), cash = bal !== null && bal > 0 && pct !== null && pct > 0 ? bal * pct / 100 : null;
    all("#riskq button").forEach(function (b) { b.setAttribute("aria-pressed", String(parseFloat(b.getAttribute("data-r")) === pct)); });
    setHint("bal", bal === null || bal <= 0 ? "MT5 里显示的余额" : "");
    setHint("risk", pct === null || pct <= 0 ? "建议 0.5%" : cash === null ? "填上余额就能算出金额" : "= 最多亏 " + P.usd(cash) + (pct > 1 ? " · 超过 1%，偏高" : pct < 0.1 ? " · 很小，常用 0.25%–1%" : ""), pct !== null && pct > 1 ? "bad" : pct !== null && pct > 0 && pct < 0.1 ? "warn" : "");
  }
  // Prices that do not fit the direction: say what is wrong in plain words and offer the repair as a button.
  function fixPanel(sz) {
    var sell = S.plan.side === "short", mine = sell ? "做空" : "做多", other = sell ? "做多" : "做空", box = h("div", { class: "fix" });
    if (sz.same) {
      box.appendChild(h("div", { class: "fx-t", text: "入场价和止损价不能一样" }));
      box.appendChild(h("p", { text: "止损是「看错了就认输」的价位，要和入场价拉开距离。规则用的是 3 倍小时波幅。" }));
      box.appendChild(h("div", { class: "fa" }, [h("button", { type: "button", class: "btn sm pri", text: "按 3 倍小时波幅设止损", onclick: function () { helper("s-3"); } })]));
      return box;
    }
    box.appendChild(h("div", { class: "fx-t", text: "价位和方向对不上" }));
    box.appendChild(h("p", null, ["你选的是", h("b", { text: mine }), "：价格" + (sell ? "下跌" : "上涨") + "才赚钱，所以止损要在入场价" + (sell ? "上方" : "下方") + "，目标要在入场价" + (sell ? "下方" : "上方") + "。现在填的是："]));
    var ul = h("ul"), hasS = false, hasT = false;
    sz.issues.forEach(function (it) { if (it.f === "stop") hasS = true; else hasT = true; ul.appendChild(h("li", null, [FIELD_ZH[it.f] + " ", h("b", { class: "n", text: fmt(it.price, 1) }), " 在入场价" + (it.at === "above" ? "上方" : "下方")])); });
    box.appendChild(ul);
    var fa = h("div", { class: "fa" });
    if (sz.otherSideFits) fa.appendChild(h("button", { type: "button", class: "btn sm pri", text: "改成" + other + "（价位不动）", onclick: function () { S.plan.side = sell ? "long" : "short"; touched(); replan(); toast("已改成" + other); } }));
    fa.appendChild(h("button", { type: "button", class: "btn sm" + (sz.otherSideFits ? "" : " pri"), text: "保持" + mine + "，把" + (hasS && hasT ? "止损和目标" : hasS ? "止损" : "目标") + "翻到另一边",
      onclick: function () { var m = P.mirror(S.plan, S.plan.side); S.plan.stop = m.plan.stop; S.plan.tp1 = m.plan.tp1; S.plan.tp2 = m.plan.tp2; touched(); replan(); toast("已翻到另一边，距离不变"); } }));
    fa.appendChild(h("button", { type: "button", class: "btn sm ghost", text: "清空重填", onclick: clearPlan }));
    box.appendChild(fa);
    return box;
  }
  function pctTxt(v) { return (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + "%"; }
  // The account allows less than the smallest position costs: show it with their own numbers and say what can be done.
  function smallPanel(sz) {
    var bal = S.acct.balance, step = num(S.acct.lotStep) || 0.01, box = h("div", { class: "fix small" }), one = Math.round(sz.minLotRisk * 100) / 100;
    box.appendChild(h("div", { class: "fx-t", text: "这笔开不了：最小手数也超过你的亏损上限" }));
    box.appendChild(h("p", null, ["你最多肯亏 ", h("b", { class: "n", text: P.usd(sz.riskUsd) }), "（" + P.usd(bal) + " 的 " + S.acct.riskPct + "%）。可是最小的 " + step + " 手，到止损就要亏 ", h("b", { class: "n", text: P.usd(sz.minLotRisk) }), "，是账户的 " + pctTxt(sz.minLotPct) + "。"]));
    var ul = h("ul"), fa = h("div", { class: "fa" });
    if (sz.minLotPct <= 1) {
      var up = +(Math.ceil(sz.minLotPct * 20 - 1e-9) / 20).toFixed(2);          // the next 0.05% that fits one minimum lot
      ul.appendChild(h("li", { text: "把「这笔最多亏」调到 " + up + "%，就能开 " + step + " 手，仍在 1% 以内。" }));
      fa.appendChild(h("button", { type: "button", class: "btn sm pri", text: "改成 " + up + "%", onclick: function () { S.acct.riskPct = up; persistPlan(); syncInputs(); renderPlan(); } }));
    } else {
      ul.appendChild(h("li", { text: "要让 " + step + " 手只占账户的 1%，账户需要约 " + P.usd(Math.ceil(one * 10 - 1e-6) * 10) + "；只占 0.5% 需要约 " + P.usd(Math.ceil(one * 20 - 1e-6) * 10) + "。" }));
      ul.appendChild(h("li", { text: "可以先用模拟账户照这页练习；或者用合约更小的账户（例如每手 1 盎司的美分账户），并在上面「合约设置」里把每手盎司改成你平台的数字。" }));
    }
    ul.appendChild(h("li", { text: "不要为了凑手数把止损收近：回放里近的止损没有优势。" }));
    box.appendChild(ul); if (fa.firstChild) box.appendChild(fa);
    return box;
  }
  function renderPlan() {
    var sz = currentSize(), tk = clear($("ticket")), E = S.E, H1 = E && E.tfs["1H"], has = hasPlan(), ok = has && sz.valid, sell = S.plan.side === "short";
    // where this plan stands against the answer, the hint under each box, and a flag on prices left from another day
    var ps = planState(sz), pe = $("pstate"); pe.hidden = !ps;
    if (ps) { pe.className = "pstate " + ps[0]; $("pstate-t").textContent = ps[1]; $("pstate-x").textContent = ps[2]; }
    renderHints();
    var age = S.plan.at ? Date.now() - S.plan.at : null, old = has && (age === null || age > 12 * 3600000);
    $("stale").hidden = !old;
    if (old) { $("stale-t").textContent = "这组价位是" + (age === null ? "以前" : ago(S.plan.at)) + "填的，不是按现在的行情算的。"; $("stale-new").hidden = !(E && P.regime(E).dir); }
    var stepMark = function (id, n, st) { var el = $(id); el.className = "st-n" + (st ? " " + st : ""); el.textContent = st === "done" ? "✓" : st === "bad" ? "!" : String(n); };
    stepMark("st1", 1, S.cardState || ""); stepMark("st2", 2, ok ? "done" : has ? "bad" : ""); stepMark("st3", 3, ok && sz.lots > 0 ? "done" : ok && sz.lots === 0 ? "bad" : "");

    tk.className = "ticket" + (!has ? " empty" : !sz.valid ? " need" : "");
    if (!has) tk.appendChild(h("p", { class: "note", text: "点第 1 步里的方案，或在第 2 步输入入场价和止损价。这里会告诉你该下多少手、会亏多少、能赚多少。" }));
    else if (!sz.valid) tk.appendChild(fixPanel(sz));
    else {
      var dec = Math.max(2, Math.round(-Math.log(num(S.acct.lotStep) || 0.01) / Math.LN10)), top = h("div", { class: "tk-top" });
      top.appendChild(h("span", { class: "v", text: sz.lots !== null ? sz.lots.toFixed(dec) : "—" }));
      top.appendChild(h("span", { class: "u" }, [sz.lots !== null ? "手" : "填上账户余额就能算出手数", sz.lots !== null ? h("button", { type: "button", class: "q", "data-g": "lots", "aria-label": "解释：手数", text: "?" }) : null]));
      top.appendChild(h("span", { class: "chip " + (sell ? "bear" : "bull"), text: sell ? "▼ 做空" : "▲ 做多" }));
      tk.appendChild(top);
      if (sz.lots === 0) tk.appendChild(smallPanel(sz));
      else { var say = P.sentence(S.plan, sz); if (say.length) { var p = h("p", { class: "tk-say" }); say.forEach(function (x) { p.appendChild(x.b ? h("b", { text: x.t }) : document.createTextNode(x.t)); }); tk.appendChild(p); } }
      var nums = h("div", { class: "tk-nums" }), cell = function (k, v, d) { nums.appendChild(h("div", null, [h("div", { class: "tk", text: k }), h("div", { class: "tv", text: v }), h("div", { class: "td", text: d })])); };
      cell("止损时亏", sz.lots ? P.usd(sz.actualRisk) : "$" + fmt(sz.dist, 1), sz.lots ? "账户的 " + sz.actualPct.toFixed(2) + "%" : "每" + M.unit + "，止损距离");
      cell("目标 1", sz.r1 === null ? "—" : sz.pnl1 !== null && sz.lots ? "+" + P.usd(sz.pnl1) : sz.r1.toFixed(1) + "R", sz.r1 === null ? "未设置" : "赚赔比 " + sz.r1.toFixed(1));
      cell("目标 2", sz.r2 === null ? "—" : sz.pnl2 !== null && sz.lots ? "+" + P.usd(sz.pnl2) : sz.r2.toFixed(1) + "R", sz.r2 === null ? "未设置" : "赚赔比 " + sz.r2.toFixed(1));
      tk.appendChild(nums);
      var foot = h("div", { class: "tk-foot" });
      if (sz.r1 || sz.r2) {
        var a = sz.r1 || sz.r2, bx = sz.r1 && sz.r2 && sz.r2 > sz.r1 ? sz.r2 - sz.r1 : 0, bar = h("div", { class: "rrbar", role: "img", "aria-label": "亏 1 份，赚 " + (a + bx).toFixed(1) + " 份" });
        var seg = function (c, w) { var i = h("i", { class: c }); i.style.flex = w + " 1 0"; bar.appendChild(i); };
        seg("rk", 1); seg("rw", a); if (bx) seg("rw2", bx);
        foot.appendChild(bar);
        foot.appendChild(h("div", { class: "rrbar-l" }, [h("span", { text: "亏 1 份" }), h("span", { text: "赚 " + (a + bx).toFixed(1) + " 份" })]));
      }
      var meta = [];
      if (H1 && H1.atr) meta.push("止损距离 " + fmt(sz.dist, 1) + " 美元，是 1 小时平均波幅的 " + (sz.dist / H1.atr).toFixed(1) + " 倍");
      if (sz.breakeven !== null) meta.push("胜率超过 " + sz.breakeven.toFixed(0) + "% 就不亏");
      if (meta.length) foot.appendChild(h("div", { class: "tk-meta", text: meta.join(" · ") }));
      foot.appendChild(h("div", { class: "tk-meta", text: exitRule(sz) }));
      tk.appendChild(foot);
    }

    // checklist: what is wrong first, what is fine folded away. It waits until the prices themselves make sense.
    var MAN = manualList(), ck = currentChecks(sz), bad = [], open = [], good = [];
    ck.forEach(function (c) { (c.ok === true ? good : c.ok === false ? bad : open).push(c); });
    var total = ck.length + MAN.length, okN = good.length + MAN.filter(function (m) { return S.manual[m.id]; }).length;
    var sum = clear($("chk-sum")), unsure = open.length + MAN.filter(function (m) { return !S.manual[m.id]; }).length;
    var cls = !ok ? "" : bad.length >= 3 ? "bad" : bad.length || unsure ? "warn" : "ok";
    sum.className = "chk-sum " + cls;
    sum.appendChild(ring(ok ? okN : 0, total, cls === "ok" ? "var(--m-bull)" : cls === "bad" ? "var(--m-bear)" : "var(--m-gold)"));
    sum.appendChild(h("div", null, [h("b", { text: !ok ? "开仓前检查" : bad.length ? "有 " + bad.length + " 项没通过" : unsure ? "还有 " + unsure + " 项要你确认" : "全部通过，可以按计划执行" }),
      h("span", { text: !has ? "填好价位后，这里按回放里有优势的规则逐项检查" : !ok ? "先把上面的价位改对，这里再逐项检查" : bad.length ? bad.map(function (c) { return c.label; }).join("、") : unsure ? "看一下下面的项目，确认后点一下" : "方向、止损、风险都符合回放里的规则" })]));
    var ul = clear($("checks")), okList = clear($("checks-ok"));
    var row = function (c) { return h("li", null, [mark(c.ok), h("div", null, [h("div", { class: "cl", text: c.label }), h("div", { class: "cx", text: c.detail })])]); };
    if (ok) {
      bad.forEach(function (c) { ul.appendChild(row(c)); }); open.forEach(function (c) { ul.appendChild(row(c)); });
      MAN.forEach(function (m) {
        var on = !!S.manual[m.id], box = h("input", { type: "checkbox", id: "mc-" + m.id }); box.checked = on;
        var li = h("li", { class: "manual" }, [h("span", { class: "ck " + (on ? "ok" : "na"), text: on ? "✓" : "" }), h("label", { for: "mc-" + m.id, style: "cursor:pointer" }, [box, h("div", { class: "cl", text: m.label + "（自己确认后点一下）" }), h("div", { class: "cx", text: m.detail })])]);
        box.addEventListener("change", function () { S.manual[m.id] = box.checked; LS.set("manual", S.manual); renderPlan(); });
        li.addEventListener("click", function (ev) { if (ev.target.tagName !== "INPUT" && !ev.target.closest("label")) box.click(); });
        ul.appendChild(li);
      });
      good.forEach(function (c) { okList.appendChild(row(c)); });
    }
    $("chk-pass").hidden = !ok || !good.length; $("chk-pass-s").textContent = "已通过的 " + good.length + " 项";
  }
  // How to manage the trade once it is on, in one line. The trailing distance is 2R.
  function exitRule(sz) {
    var hasT = num(S.plan.tp1) !== null || num(S.plan.tp2) !== null;
    // the two ways out the replay tested, each on its own: fixed stop and target, or a daily trailing stop with the regime exit
    return "持仓后：" + (hasT ? "止损和目标都不动，碰到哪个算哪个；大周期变了也不提前走（目标做法）" : "每天 08:00 SGT 把止损挪到入场以来最好价格后面 " + fmt(2 * sz.dist, 0) + " 美元，只往有利方向挪；三个大周期不再同向（结论变回「先观望」）就离场（跟踪止损做法）") + "。别提前挪到成本价";
  }
  function planAsText() {
    var sz = currentSize(), ck = currentChecks(sz).concat(manualList().map(function (m) { return { label: m.label, ok: !!S.manual[m.id] }; }));
    return P.planText({ plan: S.plan, size: sz, when: sgt(Date.now(), "full"), votes: S.E ? S.E.overall.votes : "", score: S.E ? S.E.overall.score : "", checks: ck, basis: basisName(), exit: sz.dist ? exitRule(sz).replace("持仓后：", "") : "" });
  }
  function copyText(t) {
    var done = function () { toast("计划已复制"); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, fallback); } else fallback();
    function fallback() { var ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("复制失败，请手动选择"); } document.body.removeChild(ta); }
  }
  function renderSaved() {
    var el = clear($("saved")), st = clear($("stats")), wins = 0, losses = 0, rsum = 0;
    $("saved-empty").hidden = !!S.saved.length; $("saved-n").textContent = S.saved.length ? String(S.saved.length) : "";
    S.saved.forEach(function (p) {
      var risk = Math.abs(p.entry - p.stop); if (!risk) return;
      if (p.status === "已止盈") { wins++; rsum += num(p.tp1) !== null ? Math.abs(p.tp1 - p.entry) / risk : 0; } else if (p.status === "已止损") { losses++; rsum -= 1; }
    });
    if (wins + losses) {
      st.appendChild(h("span", { class: "chip neut", text: "已结束 " + (wins + losses) + " 笔" }));
      st.appendChild(h("span", { class: "chip " + (wins >= losses ? "bull" : "bear"), text: "胜率 " + Math.round(wins / (wins + losses) * 100) + "%" }));
      st.appendChild(h("span", { class: "chip " + (rsum >= 0 ? "bull" : "bear"), text: "累计 " + (rsum >= 0 ? "+" : "−") + Math.abs(rsum).toFixed(1) + "R（止盈按目标 1 算）" }));
    }
    S.saved.forEach(function (p, idx) {
      var sel = h("select", { "aria-label": "状态" });
      ["计划中", "已入场", "已止盈", "已止损", "已取消"].forEach(function (s) { var o = h("option", { text: s }); if (s === p.status) o.selected = true; sel.appendChild(o); });
      sel.addEventListener("change", function () { p.status = sel.value; LS.set("saved", S.saved); renderSaved(); renderProof(); });
      el.appendChild(h("div", { class: "sv" }, [
        h("span", { class: "chip " + (p.side === "long" ? "bull" : "bear"), text: p.side === "long" ? "▲ 做多" : "▼ 做空" }),
        h("div", null, [h("div", { class: "sm1", text: "入场 " + fmt(p.entry, 1) + " · 止损 " + fmt(p.stop, 1) + (num(p.tp1) !== null ? " · 目标 " + fmt(p.tp1, 1) + (num(p.tp2) !== null ? " / " + fmt(p.tp2, 1) : "") : "") + (num(p.lots) !== null ? " · " + p.lots + " 手" : "") }), h("div", { class: "sm2", text: p.when + " · " + p.basis + (p.note ? " · " + p.note : "") })]),
        h("div", { class: "sa" }, [sel,
          h("button", { type: "button", class: "btn sm", text: "载入", onclick: function () { S.plan = { side: p.side, entry: p.entry, stop: p.stop, tp1: p.tp1, tp2: p.tp2, note: p.note || "", at: Date.now() }; replan(); $("plan").scrollIntoView({ behavior: "smooth", block: "start" }); } }),
          h("button", { type: "button", class: "btn sm ghost", text: "删除", onclick: function () { S.saved.splice(idx, 1); LS.set("saved", S.saved); renderSaved(); } })])
      ]));
    });
  }

  // ---------- my position ----------
  // One open position at a time, kept in this browser (xau4h.pos). The page follows it live: profit and loss, how far
  // the stop and target are, where the rule moves the stop each day and when it says to leave (P.manage). Closing it
  // can write the result into the P&L calendar (journal.html keeps "pnl.v1" in this same browser).
  function posBars(since) {
    if (!S.feed) return [];
    var K15 = S.feed.K["15M"] || [], K1 = S.feed.K["1H"] || [], first15 = K15.length ? K15[0][0] : Infinity, out = [];
    K1.forEach(function (k) { if (k[0] >= since && k[6] < first15) out.push(k); });    // hours older than the 15-minute history
    K15.forEach(function (k) { if (k[0] >= since) out.push(k); });
    return out;
  }
  function posState() { var p = S.pos; return p && S.E ? P.manage(p, posBars(p.at), S.live, Date.now(), P.regime(S.E).dir) : null; }
  function savePos() { LS.set("pos", S.pos); }
  function enterPos() {
    var sz = currentSize(); if (!hasPlan() || !sz.valid) { toast("先把计划里的价位填对"); return; }
    if (S.pos && !window.confirm("已经有一笔持仓在跟踪。换成这一笔吗？（旧的不会记账）")) return;
    var dir = S.plan.side === "short" ? -1 : 1, V = S.E ? P.verdict(S.E) : null;
    S.pos = { side: S.plan.side, entry: S.plan.entry, stop: S.plan.stop, initStop: S.plan.stop, tp1: num(S.plan.tp1), lots: sz.lots || null, at: Date.now(), stopAt: Date.now(),
      mode: num(S.plan.tp1) !== null ? "target" : "trail", rule: !!(V && V.level === "go" && V.regime.dir === dir && !(S.feed && S.feed.source === "paxg")) };
    savePos(); S.posForm = "edit"; renderPos(); if (S.E) renderVerdict();
    $("pos").scrollIntoView({ behavior: "smooth", block: "start" }); toast("开始跟踪这笔持仓：先核对成交价和手数");
  }
  function journalAdd(item) {
    var J = null; try { J = JSON.parse(localStorage.getItem("pnl.v1")); } catch (e) {}
    if (!J || !Array.isArray(J.items)) J = { cur: "$", start: null, items: [] };
    J.items.push(item);
    try { localStorage.setItem("pnl.v1", JSON.stringify(J)); return true; } catch (e) { return false; }
  }
  function closePos(price, lots, toJournal) {
    var p = S.pos, dir = p.side === "short" ? -1 : 1, contract = num(S.acct.contract) || M.contract, R = Math.abs(p.entry - p.initStop), pts = (price - p.entry) * dir;
    var amt = lots ? Math.round(pts * lots * contract * 100) / 100 : null, msg = "已平仓：" + (amt !== null ? (amt >= 0 ? "+" : "−") + P.usd(Math.abs(amt)) + "，" : "") + sgn(pts / R) + "R";
    if (toJournal && amt !== null) {
      var d = new Date(), pad = function (n) { return (n < 10 ? "0" : "") + n; };
      var ok = journalAdd({ id: "x" + Date.now().toString(36), d: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()), amt: amt, sym: M.sym, side: p.side, lots: lots,
        risk: Math.round(lots * R * contract * 100) / 100, rule: p.rule, note: "4H 报告持仓：入场 " + fmt(p.entry, 1) + "，初始止损 " + fmt(p.initStop, 1) + "，平仓 " + fmt(price, 1) + "（" + sgn(pts / R) + "R）" });
      msg += ok ? "，已记到盈亏日历" : "，但记账失败：浏览器不允许存储";
    }
    S.pos = null; S.posForm = null; savePos(); renderPos(); renderProof(); if (S.E) renderVerdict(); toast(msg);
  }
  function posField(id, label, val, step) { return h("div", { class: "f" }, [h("label", { for: id, text: label }), h("div", { class: "inp" }, [(function () { var i = h("input", { id: id, type: "number", inputmode: "decimal", step: step || "0.1", placeholder: "—" }); i.value = val === null || val === undefined ? "" : String(val); return i; })()])]); }
  function renderPos() {
    var box = $("pos"), p = S.pos; box.hidden = !p; clear(box); if (!p) return;
    var m = posState(), sell = p.side === "short", dir = sell ? -1 : 1, contract = num(S.acct.contract) || M.contract, lots = num(p.lots), px = num(S.live);
    var held = Date.now() - p.at, heldTxt = held < 3600000 ? Math.max(1, Math.round(held / 60000)) + " 分钟" : held < 172800000 ? Math.round(held / 3600000) + " 小时" : Math.round(held / 86400000) + " 天";
    box.appendChild(h("div", { class: "card-head" }, [h("h2", null, ["我的持仓 ", h("small", { text: "Position" })]), h("div", { class: "ph" }, [
      h("span", { class: "chip " + (sell ? "bear" : "bull"), text: (sell ? "▼ 做空 " : "▲ 做多 ") + (lots ? lots + " 手" : "手数未填") }),
      h("span", { class: "chip neut", text: p.mode === "trail" ? "跟踪止损做法" : "目标 3R 做法" }), h("span", { class: "chip neut", text: "已持有 " + heldTxt })])]));
    if (m) {
      var cash = m.pnlPts !== null && lots ? m.pnlPts * lots * contract : null, cls = m.pnlPts > 0 ? "up" : m.pnlPts < 0 ? "dn" : "";
      box.appendChild(h("div", { class: "pbig" }, [h("span", { class: "v " + cls, text: cash !== null ? (cash >= 0 ? "+" : "−") + P.usd(Math.abs(cash)) : m.pnlPts !== null ? sgn(m.pnlPts, 1) + " 美元/盎司" : "—" }),
        h("span", { class: "r " + cls, text: m.pnlR !== null ? sgn(m.pnlR) + "R" : "" }), h("span", { class: "px", text: px !== null ? "现价 " + fmt(px, 2) + (S.feed && S.feed.source === "paxg" ? "（备用数据）" : "") : "" })]));
      // where price sits between the stop and the target (or 3R when trailing)
      var far = num(p.tp1) !== null ? p.tp1 : p.entry + dir * 3 * m.R, span = (far - p.stop) * dir, at = function (v) { return Math.max(0, Math.min(100, (v - p.stop) * dir / span * 100)); };
      if (span > 0) {
        var tr = h("div", { class: "ptrack", role: "img", "aria-label": "现价在止损和" + (num(p.tp1) !== null ? "目标" : "3R") + "之间的位置" }), mk = h("i"), en = h("b");
        en.style.left = at(p.entry) + "%"; mk.style.left = at(px === null ? p.entry : px) + "%"; tr.appendChild(en); tr.appendChild(mk); box.appendChild(tr);
        box.appendChild(h("div", { class: "plab" }, [h("span", { text: "止损 " + fmt(p.stop, 1) }), h("span", { text: "入场 " + fmt(p.entry, 1) }), h("span", { text: (num(p.tp1) !== null ? "目标 " : "3R ") + fmt(far, 1) })]));
      }
      // the one thing to do now
      var todo, tcls = "", btn = null;
      if (m.first === "stop") { todo = [h("b", { text: "价格" + (m.stopHitAt < Date.now() - 60000 ? "在 " + sgt(m.stopHitAt) + " " : "") + "碰到了止损 " + fmt(p.stop, 1) + "。" }), "在 MT5 确认这笔已经平仓，然后点「平仓记账」。"]; tcls = "bad"; }
      else if (m.first === "target") { todo = [h("b", { text: "价格" + (m.targetHitAt < Date.now() - 60000 ? "在 " + sgt(m.targetHitAt) + " " : "") + "到了目标 " + fmt(p.tp1, 1) + "。" }), "在 MT5 确认已经止盈，然后点「平仓记账」。"]; tcls = "good"; }
      else if (p.mode === "trail" && m.split) { todo = [h("b", { text: "三个大周期不再同向，规则说现在离场。" }), "在 MT5 平仓，然后点「平仓记账」。"]; tcls = "bad"; }
      else if (m.moveStop) {
        todo = [h("b", { text: "今天（08:00 SGT 起）止损该挪到 " + fmt(m.trailStop, 1) + "。" }), "入场以来最好的价格是 " + fmt(m.best, 1) + "，往回 2R（" + fmt(2 * m.R, 0) + " 美元）。在 MT5 改好以后点右边的按钮。"]; tcls = "warn";
        btn = h("button", { type: "button", class: "btn sm pri", text: "已改到 " + fmt(m.trailStop, 1), onclick: function () { S.pos.stop = m.trailStop; S.pos.stopAt = Date.now(); savePos(); renderPos(); toast("止损已更新"); } });
      }
      else if (p.mode === "trail") todo = ["止损 " + fmt(p.stop, 1) + " 不动。每天 08:00 SGT 看一次：" + ((m.nextStop - p.stop) * dir > 0.05 ? "按现在的价格，明天要挪到 " + fmt(m.nextStop, 1) + "。" : "价格还没走出 1R 以上，明天也不用挪。")];
      else todo = ["止损 " + fmt(p.stop, 1) + " 和目标 " + fmt(p.tp1, 1) + " 都不动，等价格碰到其中一个。这是回放里 3R 做法的规则。" + (m.split ? "三个大周期已经不再同向，但 3R 做法不因此提前离场。" : "")];
      box.appendChild(h("div", { class: "pdo " + tcls }, [h("div", null, todo), btn]));
      box.appendChild(h("p", { class: "pmeta", text: "入场 " + fmt(p.entry, 1) + "（" + sgt(p.at) + "）· 初始止损 " + fmt(p.initStop, 1) + "，1R = " + fmt(m.R, 1) + " 美元" + (lots ? "（" + P.usd(lots * m.R * contract) + "）" : "") +
        " · 入场以来最好 " + fmt(m.best, 1) + "（" + sgn(m.bestR) + "R）" + (m.toStop !== null ? " · 离止损 " + fmt(Math.max(0, m.toStop), 1) + " 美元" : "") + (m.toTarget !== null ? " · 离目标 " + fmt(Math.max(0, m.toTarget), 1) + " 美元" : "") + (p.rule ? " · 按规则开的" : " · 不是按信号开的") }));
    } else box.appendChild(h("p", { class: "note", text: "价格还在载入，或者这笔持仓少了入场价、止损价。点「修改」补上。" }));

    var acts = h("div", { class: "actions", style: "margin-top:14px" });
    acts.appendChild(h("button", { type: "button", class: "btn pri", text: "平仓记账", onclick: function () { S.posForm = S.posForm === "close" ? null : "close"; renderPos(); } }));
    acts.appendChild(h("button", { type: "button", class: "btn", text: "修改", onclick: function () { S.posForm = S.posForm === "edit" ? null : "edit"; renderPos(); } }));
    acts.appendChild(h("button", { type: "button", class: "btn ghost", text: "撤销（没成交）", onclick: function () { if (window.confirm("撤销这笔持仓？不会记账。")) { S.pos = null; S.posForm = null; savePos(); renderPos(); if (S.E) renderVerdict(); } } }));
    box.appendChild(acts);
    if (S.posForm === "edit") {
      var mode = h("select", { id: "pe-mode" }, [h("option", { value: "target", text: "目标 3R（止损目标都不动）" }), h("option", { value: "trail", text: "跟踪止损（每天挪一次）" })]); mode.value = p.mode;
      var form = h("form", { class: "pform" }, [posField("pe-entry", "成交价", p.entry), posField("pe-stop", "止损价", p.stop), posField("pe-tp1", "目标价（可空）", p.tp1), posField("pe-lots", "手数", p.lots, "0.01"),
        h("div", { class: "f", style: "grid-column:1/-1" }, [h("label", { for: "pe-mode", text: "离场做法" }), h("div", { class: "inp" }, [mode])]),
        h("div", { class: "actions", style: "grid-column:1/-1;margin-top:0" }, [h("button", { type: "submit", class: "btn sm pri", text: "保存" }), h("button", { type: "button", class: "btn sm ghost", text: "取消", onclick: function () { S.posForm = null; renderPos(); } })])]);
      form.addEventListener("submit", function (ev) {
        ev.preventDefault(); var g = function (id) { var v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : null; };
        var e = g("pe-entry"), st = g("pe-stop"), tp = g("pe-tp1"), lt = g("pe-lots"), d = S.pos.side === "short" ? -1 : 1;
        if (e === null || st === null || (e - st) * d <= 0) { toast(d > 0 ? "做多的止损要低于成交价" : "做空的止损要高于成交价"); return; }
        if (tp !== null && (tp - e) * d <= 0) { toast(d > 0 ? "做多的目标要高于成交价" : "做空的目标要低于成交价"); return; }
        if (S.pos.stop !== st) S.pos.stopAt = Date.now();
        if (S.pos.entry !== e && S.pos.stop === S.pos.initStop) S.pos.initStop = st;          // the fill price changed before the stop was ever moved
        S.pos.entry = e; S.pos.stop = st; if (S.pos.initStop === null || (e - S.pos.initStop) * d <= 0) S.pos.initStop = st;
        S.pos.lots = lt; S.pos.mode = $("pe-mode").value === "trail" || tp === null ? "trail" : "target"; S.pos.tp1 = S.pos.mode === "trail" ? null : tp;
        S.posForm = null; savePos(); renderPos(); toast("持仓已更新");
      });
      box.appendChild(form);
    }
    if (S.posForm === "close") {
      var cf = h("form", { class: "pform" }, [posField("pc-price", "平仓价（MT5 实际成交）", px === null ? null : r1(px)), posField("pc-lots", "手数", p.lots, "0.01"),
        h("label", { class: "f", style: "grid-column:span 2;display:flex;gap:8px;align-items:center;font-size:12px;color:var(--text);cursor:pointer" }, [(function () { var c = h("input", { type: "checkbox", id: "pc-j" }); c.checked = true; return c; })(), "同时记到盈亏日历"]),
        h("div", { class: "actions", style: "grid-column:1/-1;margin-top:0" }, [h("button", { type: "submit", class: "btn sm pri", text: "确认平仓" }), h("button", { type: "button", class: "btn sm ghost", text: "取消", onclick: function () { S.posForm = null; renderPos(); } })])]);
      cf.addEventListener("submit", function (ev) {
        ev.preventDefault(); var pr = parseFloat($("pc-price").value), lt = parseFloat($("pc-lots").value);
        if (!isFinite(pr) || pr <= 0) { toast("请填平仓价"); return; }
        closePos(pr, isFinite(lt) && lt > 0 ? lt : null, $("pc-j").checked);
      });
      box.appendChild(cf);
    }
  }

  // ---------- hub context: risk calendar + daily plan ----------
  function txt(el) { return el ? el.textContent.replace(/\s+/g, " ").trim() : ""; }
  function getDoc(url) { return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (t) { return new DOMParser().parseFromString(t, "text/html"); }); }
  function showEvents(rowsAll, srcNote) {
    var now = Date.now();
    S.events = rowsAll.filter(function (e) { return e.ms !== null; }).sort(function (a, b) { return a.ms - b.ms; });
    var rows = rowsAll.filter(function (e) { return !e.done && (e.ms === null || e.ms > now - 3 * 3600000); }).slice(0, 6);   // upcoming, and anything in the last 3 hours
    var el = clear($("events")); $("events-src").textContent = srcNote;
    if (!rows.length) { el.appendChild(h("p", { class: "note", text: M.calEmpty })); }
    rows.forEach(function (e) {
      var cd = !e.timed ? "" : e.ms > now ? "还有 " + left(e.ms - now) : "已公布";
      el.appendChild(h("div", { class: "ev" }, [h("div", null, [h("div", { class: "when", text: e.date }), h("div", { class: "time", text: e.time })]), h("div", null, [e.imp ? h("span", { class: "chip " + (e.hi ? "bear" : "gold"), text: "影响 " + e.imp }) : null, cd ? h("span", { class: "chip neut", style: "margin-left:6px", text: cd }) : null, h("div", { class: "name", style: "margin-top:5px", text: e.name }), e.extra ? h("div", { class: "note", style: "margin-top:2px", text: e.extra }) : null])]));
    });
    renderSessions(); renderPlan(); if (S.E) renderVerdict();
  }
  // Fallback: the calendar table the daily refresh writes on the risk page.
  function eventsFromRisk() {
    return getDoc("risk.html").then(function (doc) {
      var now = Date.now(), np = parts(now);
      var rowsAll = [].slice.call(doc.querySelectorAll("table.cal tbody tr")).map(function (tr) {
        var date = txt(tr.querySelector(".cal-date")), time = txt(tr.querySelector(".cal-time")), name = txt(tr.querySelector(".cal-event")), imp = tr.querySelector(".imp");
        var m = date.match(/(\d{1,2})月(\d{1,2})/), t = time.match(/(\d{1,2}):(\d{2})\s*SGT/), ms = null;
        if (m) { var y = +np.year, mo = +m[1]; if (mo < +np.month - 6) y += 1; ms = Date.UTC(y, mo - 1, +m[2], t ? +t[1] : 0, t ? +t[2] : 0) - 8 * 3600000; }
        return { date: date.replace(/[✓✔▲△⚠️]/g, "").trim(), time: time, name: name.replace(/^[✓★\s]+/, ""), imp: imp ? txt(imp) : "", hi: !!(imp && /\bh\b/.test(imp.className)), ms: ms, timed: !!(m && t), done: date.indexOf("✓") >= 0 || name.indexOf("✓") === 0 };
      }).filter(function (e) { return e.date; });
      if (!rowsAll.length) throw new Error("no rows");
      showEvents(rowsAll, "自动日历暂时读不到，这里取自风险计划页（每天更新一次）");
    });
  }
  function loadContext() {
    (M.state ? fetch(M.state, { cache: "no-cache" }) : Promise.reject(new Error("no state"))).then(function (r) { return r.ok ? r.json() : null; }).then(function (st) {
      if (st && st.verdict) { S.srv = { updated: st.updated || "", tag: st.verdict.tag, level: st.verdict.level, side: st.plan ? (st.plan.side === "做多" ? "long" : "short") : st.verdict.level === "none" ? "none" : null, source: st.source || "" }; if (S.E) renderVerdict(); }
    }).catch(function () {});
    // 1. the calendar file a scheduled job refreshes several times a day; 2. the risk page's table
    fetch("data/calendar.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (cal) {
      var up = Date.parse(String(cal.updated || "").replace(" SGT", ":00+08:00").replace(" ", "T")), last = 0;
      (cal.events || []).forEach(function (e) { last = Math.max(last, e.ms); });
      if (!cal.events || !cal.events.length || !(Date.now() - up < 3 * 86400000) || Date.now() - last > 4 * 86400000) throw new Error("stale");
      var by = {}, rows = [];
      cal.events.forEach(function (e) {                                           // one row per release time: CPI m/m, y/y and core land together
        var key = e.ms + "|" + e.impact, g = by[key];
        if (!g) { g = by[key] = { date: e.date + "（" + e.weekday + "）", time: e.allDay ? "全天" : e.time + " SGT", names: [], imp: e.impact === "high" ? "高" : e.impact === "medium" ? "中" : "假日", hi: e.impact === "high", ms: e.ms, timed: !e.allDay, done: false, fc: [] }; rows.push(g); }
        g.names.push(e.zh || e.title); if (e.forecast) g.fc.push((e.zh || e.title) + " 预期 " + e.forecast + (e.previous ? "（前值 " + e.previous + "）" : ""));
      });
      rows.forEach(function (g) { g.name = g.names.slice(0, 3).join("、") + (g.names.length > 3 ? " 等 " + g.names.length + " 项" : ""); g.extra = g.fc.slice(0, 2).join("；"); });
      showEvents(rows, "本周美国数据，每天自动更新几次 · 上次 " + cal.updated);
    }).catch(function () {
      eventsFromRisk().catch(function () { clear($("events")).appendChild(h("p", { class: "note", text: "这里读不到日历，请直接打开风险计划页。" })); });
    });

    (M.dailyPlans === false ? Promise.reject(new Error("none")) : getDoc("daily.html")).then(function (doc) {
      var items = [].slice.call(doc.querySelectorAll(".risk-list li")).map(txt).filter(function (t) { return t.indexOf("入场方案") >= 0; }).slice(0, 2);
      var el = clear($("dplans")); if (!items.length) throw new Error("none");
      S.daily = [];
      items.forEach(function (t) {
        el.appendChild(h("div", { class: "dplan", text: t }));
        var side = t.indexOf("空头") >= 0 ? "short" : t.indexOf("多头") >= 0 ? "long" : null, n = function (m) { return m ? parseFloat(m[1].replace(/,/g, "")) : null; };
        var entry = n(t.match(/\$\s?([\d,]+(?:\.\d+)?)/)), stop = n(t.match(/止损\s?\$?\s?([\d,]+(?:\.\d+)?)/)), tp1 = n(t.match(/TP1[:：]?\s?\$?\s?([\d,]+(?:\.\d+)?)/)), tp2 = n(t.match(/TP2[:：]?\s?\$?\s?([\d,]+(?:\.\d+)?)/));
        var dir = side === "short" ? -1 : 1;
        if (!side || entry === null || stop === null || (entry - stop) * dir <= 0) return;      // only offer one-click use when the line parses cleanly
        if (tp1 !== null && (tp1 - entry) * dir <= 0) tp1 = null; if (tp2 !== null && (tp2 - entry) * dir <= 0) tp2 = null;
        S.daily.push({ side: side, entry: entry, stop: stop, tp1: tp1, tp2: tp2, rr: tp1 === null ? null : Math.abs(tp1 - entry) / Math.abs(entry - stop) });
      });
      var hd = txt(doc.querySelector(".hdate")).split("·")[0];
      el.appendChild(h("p", { class: "note" }, ["摘自每日分析" + (hd ? "（" + hd.trim() + "）" : "") + "。这是每天写一次的文字方案，没有做过回放，和上面的结论不一定一致；它们也在计划器第 1 步里。 ", h("a", { href: "daily.html", style: "color:var(--gold-lt)", text: "打开每日分析 →" })]));
      if (S.E) renderCands();
    }).catch(function () { if (M.dailyPlans === false || !$("dplans")) return; clear($("dplans")).appendChild(h("p", { class: "note" }, ["这里读不到每日方案，", h("a", { href: "daily.html", style: "color:var(--gold-lt)", text: "打开每日分析 →" })])); });
  }

  // ---------- Claude's written report (snapshot file) ----------
  function loadSnapshot() {
    if (M.snapshot === null) return;
    fetch(M.snapshot || "data/xau-report.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (r) {
      if (!r || !r.headline) return;
      var ms = Date.parse(r.createdAt), stale = !isFinite(ms) || Date.now() - ms > 12 * 3600 * 1000, body = clear($("ai-body"));
      $("ai-age").textContent = isFinite(ms) ? sgt(ms, "dt") + " SGT · " + ago(ms) : "时间未知";
      $("ai-stale").hidden = !stale;
      var inner = h("div");
      inner.appendChild(h("h3", { class: "hl", text: r.headline })); inner.appendChild(h("p", { text: r.summary || "" }));
      var grid = h("div", { class: "ai-grid" }), st = r.setup || {};
      if (st.state || st.trigger) grid.appendChild(h("div", { class: "ai-box" }, [h("h3", { text: "当期方案" }), st.state ? h("p", null, [h("b", { text: st.state })]) : null, st.trigger ? h("p", null, [h("b", { text: "触发：" }), st.trigger]) : null, st.invalidation ? h("p", null, [h("b", { text: "失效：" }), st.invalidation]) : null, st.note ? h("p", { class: "muted", text: st.note }) : null]));
      (r.scenarios || []).forEach(function (x) {
        var b = /bull/i.test(x.name) ? "bull" : /bear/i.test(x.name) ? "bear" : "";
        grid.appendChild(h("div", { class: "ai-box " + b }, [h("h3", { text: x.name }), x.trigger ? h("p", null, [h("b", { text: "如果：" }), x.trigger]) : null, x.path ? h("p", null, [h("b", { text: "那么：" }), x.path]) : null, x.invalidation ? h("p", { class: "muted", text: "失效条件：" + x.invalidation }) : null]));
      });
      if (grid.children.length) inner.appendChild(grid);
      (r.analysis || []).forEach(function (sec, i) {
        var d = h("details", null, [h("summary", { text: sec.title || "分析" })]); if (i === 0 && !stale) d.open = true;
        String(sec.body || "").split(/\n\n+/).forEach(function (par) { if (par.trim()) d.appendChild(h("p", { text: par.trim() })); });
        inner.appendChild(d);
      });
      if (r.news && r.news.length) {
        var d2 = h("details", null, [h("summary", { text: M.newsWord })]), ul = h("ul", { class: "newsl" });
        r.news.forEach(function (nw) {
          var li = h("li");
          if (/^https:\/\//.test(String(nw.url || ""))) li.appendChild(h("a", { href: nw.url, target: "_blank", rel: "noopener noreferrer", text: nw.title || nw.url })); else li.appendChild(h("b", { text: nw.title || "" }));
          if (nw.note) li.appendChild(h("span", { text: nw.note }));
          ul.appendChild(li);
        });
        d2.appendChild(ul); inner.appendChild(d2);
      }
      if (stale) body.appendChild(h("details", null, [h("summary", { text: "这期解读已超过 12 小时，展开查看" }), inner])); else body.appendChild(inner);
      if (!isFinite(ms) || Date.now() - ms > 24 * 3600 * 1000) return;                 // an old write-up would contradict the live answer: leave the tab hidden
      S.hasAi = true; $("tab-ai").hidden = false; if (LS.get("tab", "levels") === "ai") showTab("ai");
    }).catch(function () {});
  }

  // ---------- sessions ----------
  function tzp(tz, ms) { var p = {}; new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; }); return p; }
  function spans(m, now) {      // open/close instants for yesterday, today and tomorrow on that market's clock
    var out = [];
    for (var k = -1; k <= 1; k++) {
      var ref = now + k * 86400000, p = tzp(m.tz, ref), day = Date.UTC(+p.year, +p.month - 1, +p.day), wd = new Date(day).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      var off = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute) - Math.floor(ref / 60000) * 60000;   // zone offset in ms
      out.push({ s: day + m.open * 3600000 - off, e: day + m.close * 3600000 - off });
    }
    return out;
  }
  function sessionState(now) {
    var open = [], next = null;
    MKTS.forEach(function (m) { spans(m, now).forEach(function (x) { if (now >= x.s && now < x.e) open.push(m.zh); else if (x.s > now && (!next || x.s < next.ms)) next = { ms: x.s, zh: m.zh }; }); });
    return { open: open, next: next, overlap: open.indexOf("伦敦盘") >= 0 && open.indexOf("纽约盘") >= 0 };
  }
  function renderSessions() {
    var now = Date.now(), np = parts(now), d0 = Date.UTC(+np.year, +np.month - 1, +np.day) - 8 * 3600000, d1 = d0 + 86400000;   // today in SGT
    var pct = function (ms) { return Math.max(0, Math.min(100, (ms - d0) / 864000)); };
    var tl = clear($("tl")), st = sessionState(now), ivs = {};
    MKTS.forEach(function (m) {
      var sp = spans(m, now), on = st.open.indexOf(m.zh) >= 0, track = h("div", { class: "tl-track" }), hours = "";
      sp.forEach(function (x) {
        if (x.e <= d0 || x.s >= d1) return;
        var i = h("i"); i.style.left = pct(x.s) + "%"; i.style.width = (pct(x.e) - pct(x.s)) + "%"; track.appendChild(i);
        if (x.s >= d0 && !hours) hours = sgt(x.s, "t") + "–" + sgt(x.e, "t");
      });
      if (!hours && sp.length) hours = sgt(sp[sp.length - 1].s, "t") + "–" + sgt(sp[sp.length - 1].e, "t");
      ivs[m.zh] = sp;
      tl.appendChild(h("div", { class: "tl-row" + (on ? " on" : "") }, [h("div", { class: "tl-name" }, [m.zh + (on ? " ●" : ""), h("span", { text: hours ? hours + " SGT" : "周末休市" })]), track]));
    });
    var over = h("div", { class: "tl-over" });
    (ivs["伦敦盘"] || []).forEach(function (a) { (ivs["纽约盘"] || []).forEach(function (b) {
      var s0 = Math.max(a.s, b.s, d0), e0 = Math.min(a.e, b.e, d1); if (e0 <= s0) return;
      var o = h("div", { class: "tl-ov", title: M.overlapTip }); o.style.left = pct(s0) + "%"; o.style.width = (pct(e0) - pct(s0)) + "%"; over.appendChild(o);
    }); });
    var nl = h("div", { class: "tl-now", title: "现在 " + sgt(now, "t") + " SGT" }); nl.style.left = pct(now) + "%"; over.appendChild(nl); tl.appendChild(over);
    var head = clear($("sess-now"));
    head.appendChild(h("span", { class: "chip neut", text: "现在 " + sgt(now, "t") + " SGT" }));
    if (st.open.length) head.appendChild(h("span", { class: "chip gold", text: st.open.join(" + ") + (st.overlap ? " · 重叠时段" : "") }));
    else if (st.next) head.appendChild(h("span", { class: "chip neut", text: st.next.zh + " " + left(st.next.ms - now) + "后开盘" }));
  }

  var vAt = 0;
  function checkVerdict() {
    if (!S.E || S.vLevel === null || Date.now() - vAt < 500) return; vAt = Date.now();
    if (P.verdict(S.E).level === S.vLevel) return;
    renderVerdict(); renderCands();
  }

  // ---------- records: only what really happened ----------
  // The owner asked on 2026-10-14 for this tab to show real records only: their own trades and the rule's paper
  // record since it went live. The 2011-2026 replay behind the rule is not shown; it stays in data/xau-backtest.json
  // and research/xau-replay/.
  function sgn(v, d) { d = d === undefined ? 2 : d; var t = Math.abs(v).toFixed(d); return (+t === 0 ? "" : v > 0 ? "+" : "−") + t; }
  function loadProof() {
    fetch(M.signals, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      if (d && d.summary) { S.rec = d; renderProof(); renderChanges(); if (S.E) renderVerdict(); }
    }).catch(function () {});
  }
  // The visitor's own trades: the P&L calendar (journal.html keeps them in localStorage "pnl.v1"; same site, so this
  // page can read them). Shown first, so they are not mistaken for the rule's automatic record below.
  function ownBlock(el) {
    var J = null; try { J = JSON.parse(localStorage.getItem("pnl.v1")); } catch (e) {}
    var items = J && Array.isArray(J.items) ? J.items.filter(function (x) { return x && /^\d{4}-\d{2}-\d{2}$/.test(x.d) && num(x.amt) !== null; }) : [];
    var cur = J && typeof J.cur === "string" && J.cur ? J.cur : "$", done = S.saved.filter(function (p) { return p.status === "已止盈" || p.status === "已止损"; });
    var cash = function (v) { var a = Math.abs(v); return (v > 0 ? "+" : v < 0 ? "−" : "") + cur + a.toLocaleString("en-US", { maximumFractionDigits: a < 100 ? 2 : 0 }); };
    var link = h("a", { href: "journal.html", style: "color:var(--gold-lt)", text: "打开盈亏日历 →" });
    el.appendChild(h("div", { class: "sub-h", text: "你自己的交易（只存在这台设备的浏览器里）" }));
    if (!items.length) {
      el.appendChild(h("p", { class: "p-intro", style: "margin-bottom:22px" }, ["你还没有在「盈亏日历」里记过交易" + (done.length ? "（「已保存」里有 " + done.length + " 笔标成已结束的计划）" : "") + "。每做完一笔记一下金额，最好也填「原本最多打算亏多少」和「是不是按规则做的」，这里就会自动显示。 ", link]));
      return;
    }
    items.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    var sum = 0, win = 0, loss = 0, rs = [], byRule = 0, notRule = 0;
    items.forEach(function (x) { sum += x.amt; if (x.amt > 0) win++; else if (x.amt < 0) loss++; if (num(x.risk) !== null && x.risk > 0) rs.push(x.amt / x.risk); if (x.rule === true) byRule++; else if (x.rule === false) notRule++; });
    var n = items.length, md = function (d) { return (+d.slice(5, 7)) + "/" + (+d.slice(8, 10)); }, even = n - win - loss, unmarked = n - byRule - notRule;
    var tiles = h("div", { class: "pf-tiles" }), tile = function (k, v, cls, sub) { tiles.appendChild(h("div", { class: "pf-t" }, [h("div", { class: "k", text: k }), h("div", { class: "v " + (cls || ""), text: v }), h("div", { class: "d", text: sub })])); };
    tile("记了几笔", n + " 笔", "", md(items[0].d) + (n > 1 ? " 到 " + md(items[n - 1].d) : "") + "，来自盈亏日历");
    tile("赚 / 亏", win + " 赚 · " + loss + " 亏", "", (win + loss ? "胜率 " + Math.round(win / (win + loss) * 100) + "%" : "") + (even ? (win + loss ? "，" : "") + even + " 笔打平" : ""));
    var avgR = rs.length ? rs.reduce(function (a, b) { return a + b; }, 0) / rs.length : null;
    tile("合计", cash(sum), sum > 0 ? "up" : sum < 0 ? "dn" : "", avgR !== null ? rs.length + " 笔填了风险：平均每笔 " + sgn(avgR) + "R" : "填上「原本最多打算亏」就能换算成 R");
    tile("按规则做的", byRule + " 笔", "", notRule || unmarked ? (notRule ? notRule + " 笔不是" : "") + (notRule && unmarked ? "，" : "") + (unmarked ? unmarked + " 笔没标记" : "") : "全部按规则");
    el.appendChild(tiles);
    var say = n < 30 ? "只有 " + n + " 笔，还说明不了好坏：要攒到 30 笔以上才看得出来。" : "已经有 " + n + " 笔。";
    if (S.rec && S.rec.summary && !S.rec.summary.signals) say += "规则上线以来还没出过信号，所以这 " + n + " 笔都不是这页的信号单。";
    el.appendChild(h("p", { class: "p-intro", style: "margin-bottom:22px" }, [say + (done.length ? "「已保存」里另有 " + done.length + " 笔标成已结束的计划。" : "") + " ", link]));
  }
  // The rule's paper record since it went live, kept by the market job (scripts/xau_track.js).
  function recordBlock(el) {
    var r = S.rec; if (!r) return;
    var z = r.summary || {}, sig = r.signals || [], open = sig.filter(function (x) { return x.status === "open"; })[0];
    el.appendChild(h("div", { class: "sub-h", text: "规则的自动记录：机器按信号记的纸面交易，不是你的交易（从 " + r.since + " 起）" }));
    el.appendChild(h("p", { class: "p-intro", text: "规则上线之后，机器照着规则记下的纸面交易：出现信号就按规则进场（已有持仓时跳过），一直跟到止损或目标，点差和隔夜利息都算进去。每次运行都会把上次以来的每一根 15 分钟 K 线补看一遍，所以晚运行也不会漏。" + (z.signals ? "" : "从 " + r.since.replace(" SGT", "") + " 到现在，五个周期一次也没有同时同向，所以这里还是 0。") }));
    var tiles = h("div", { class: "pf-tiles" }), tile = function (k, v, cls, sub) { tiles.appendChild(h("div", { class: "pf-t" }, [h("div", { class: "k", text: k }), h("div", { class: "v " + (cls || ""), text: v }), h("div", { class: "d", text: sub })])); };
    tile("出现过的信号", z.signals + " 次", "", z.signals ? z.taken + " 次进场，" + (z.signals - z.taken) + " 次按规则跳过" : "还没有出现");
    tile("已经结束", z.closed + " 笔", "", z.closed ? "其中 " + z.wins + " 笔赚钱" : "还没有");
    tile("合计", z.closed ? sgn(z.totalR, 1) + "R" : "—", z.totalR > 0 ? "up" : z.totalR < 0 ? "dn" : "", z.closed ? "平均每笔 " + sgn(z.avgR) + "R" : "等第一笔结束");
    var oR = openR(open);
    tile("进行中", open ? open.side + (oR !== null ? " " + sgn(oR) + "R" : "") : "没有", oR !== null ? (oR > 0 ? "up" : oR < 0 ? "dn" : "") : open ? (open.side === "做多" ? "up" : "dn") : "", open ? "入场 " + fmt(open.entry, 1) + " · 止损 " + fmt(open.stop, 1) + " · 目标 " + fmt(open.target, 1) + (oR !== null ? " · 按现价 " + fmt(S.live, 1) + " 算" : "") : "现在没有纸面持仓");
    el.appendChild(tiles);
    if (sig.length) {
      var tb = h("tbody"), word = { open: "进行中", target: "到目标", stop: "止损", skipped: "跳过" };
      sig.slice().reverse().slice(0, 15).forEach(function (x) {
        tb.appendChild(h("tr", null, [h("td", { class: "l", text: "#" + x.id + " · " + x.time.replace(" SGT", "") }), h("td", { class: "num " + (x.side === "做多" ? "up" : "dn"), text: x.side }), h("td", { class: "num", text: fmt(x.entry, 1) }), h("td", { class: "num", text: fmt(x.stop, 1) }), h("td", { class: "num", text: fmt(x.target, 1) }),
          h("td", { class: "num", text: word[x.status] + (x.status === "skipped" && x.why ? "（" + x.why + "）" : "") }), (function () { var rr = typeof x.R === "number" ? x.R : openR(x); return h("td", { class: "num " + (rr > 0 ? "up" : rr < 0 ? "dn" : ""), text: rr === null ? "—" : sgn(rr) + "R" + (typeof x.R === "number" ? "" : "（现在）") }); })()]));
      });
      el.appendChild(h("div", { class: "tablewrap", style: "margin-bottom:10px" }, [h("table", { class: "pf" }, [h("thead", null, [h("tr", null, [h("th", { class: "l", text: "信号（新加坡时间）" }), h("th", { text: "方向" }), h("th", { text: "入场" }), h("th", { text: "止损" }), h("th", { text: "目标" }), h("th", { text: "状态" }), h("th", { text: "结果" })])]), tb])]));
    }
    var ev = (r.events || []).slice(-4).reverse();
    if (ev.length) el.appendChild(h("p", { class: "note", text: "最近的动静：" + ev.map(function (e) { return e.time.slice(5, 16) + " " + e.text; }).join("；") + "。" + (num(r.lastChecked) !== null ? "已经检查到 " + sgt(r.lastChecked, "dt") + " SGT 收盘的 K 线；" : "") + "它不知道你自己有没有下单。" }));
  }
  // One line under the answer: the rule's live record so far.
  function renderProofLine(V) {
    var el = clear($("v-proof")), r = S.rec; el.hidden = !r; if (!r) return;
    var z = r.summary || {};
    el.appendChild(h("b", { text: "规则上线以来（" + r.since.replace(" SGT", "") + " 起）：" }));
    var op = (r.signals || []).filter(function (x) { return x.status === "open"; })[0], oR = openR(op);
    el.appendChild(document.createTextNode(z.signals ? "信号 " + z.signals + " 次，进场 " + z.taken + " 笔，已结束 " + z.closed + " 笔" + (z.closed ? "，合计 " + sgn(z.totalR, 1) + "R" : "") + (op ? "；纸面持仓 #" + op.id + " " + op.side + "中" + (oR !== null ? "，现在 " + sgn(oR) + "R" : "") : "") + "。" : "还没有出现过信号。"));
    el.appendChild(h("button", { type: "button", text: "看成绩记录 →", onclick: function () { showTab("proof"); document.querySelector('[data-panel="proof"]').scrollIntoView({ behavior: "smooth", block: "start" }); } }));
  }
  function renderProof() { var el = clear($("proof")); ownBlock(el); recordBlock(el); }
  // where the rule's open paper trade stands at the live price, in R (its own risk, before costs)
  function openR(x) { if (!x || x.status !== "open" || num(S.live) === null || !(x.risk > 0)) return null; return (S.live - x.entry) * (x.side === "做空" ? -1 : 1) / x.risk; }

  // ---------- signal reminder ----------
  // The owner asked on 2026-10-23 for a browser notification when a new buy or sell signal appears. It needs nothing
  // set up beyond allowing notifications: while this page is open (a background tab is fine on a computer), it keeps
  // recomputing after each 15-minute close and notifies when the answer turns into "go". The answer the page opened
  // with is the baseline (no alert for a signal already showing), and each signal alerts once across all open tabs.
  var NOTE_OK = "Notification" in window;
  // On unless the visitor switched it off (the owner asked on 2026-10-23 for it to be on by default). The browser's
  // permission is per site, so allowing it once covers the gold page and the Bitcoin page alike.
  S.notify = LS.get("notify", true) !== false;
  function askPermission() {
    if (!NOTE_OK || !S.notify || Notification.permission !== "default" || S.asking) return;
    S.asking = true;
    var done = function () { S.asking = false; renderAlert(); if (alertsOn()) toast("提醒已开：出现新信号或趋势变化时会弹出通知"); };
    try { var r = Notification.requestPermission(done); if (r && r.then) r.then(done, done); } catch (e) { done(); }
  }
  // what to be told about (the owner asked on 2026-10-23 for trend changes too): a new signal, the answer changing,
  // the weekly / daily / 4-hour trend turning, and (off by default: several times a day) the 1-hour / 15-minute
  S.nopt = Object.assign({ signal: true, verdict: true, big: true, small: false }, LS.get("notifyOpts", {}));
  function alertsOn() { return NOTE_OK && S.notify && Notification.permission === "granted"; }
  function renderAlert() {
    var el = clear($("v-alert")); el.hidden = !NOTE_OK; if (!NOTE_OK) return;
    var perm = Notification.permission, on = alertsOn(); el.className = "v-alert" + (on ? " on" : "");
    var t = h("div", { class: "t" });
    if (on) {
      t.appendChild(h("b", { text: "🔔 提醒已开，刷新或重开浏览器后也一直开着。" })); t.appendChild(document.createTextNode("这一页开着（可以放在后台）就会每 15 分钟检查一次，按下面勾选的弹出通知。手机浏览器会暂停后台页面，电脑上最可靠。"));
      var opts = h("div", { class: "nopts" });
      [["signal", "新的做多 / 做空信号"], ["verdict", "结论变化（例如信号失效、大周期不再同向）"], ["big", "周线、日线、4 小时转向"], ["small", "1 小时、15 分钟转向（一天可能好几次）"]].forEach(function (o) {
        var cb = h("input", { type: "checkbox", id: "nopt-" + o[0] }); cb.checked = !!S.nopt[o[0]];
        cb.addEventListener("change", function () { S.nopt[o[0]] = cb.checked; LS.set("notifyOpts", S.nopt); });
        opts.appendChild(h("label", { class: "nopt", for: "nopt-" + o[0] }, [cb, o[1]]));
      });
      t.appendChild(opts);
      var snd = h("div", { class: "nsnd" + (soundOn() ? " on" : "") });
      snd.appendChild(document.createTextNode(soundOn() ? "🔊 网页提示音已开（电脑静音或勿扰模式时听不到）。" : "通知照常弹出。网页提示音在按浏览器的刷新（F5）后要点一下页面才响：这是浏览器的规定。页面自己会更新，不用刷新；要重算就点上面的「⟳ 刷新」，提示音不会断。完全不想点：在电脑通知设置里打开浏览器的通知声音（Mac：系统设置 → 通知 → Google Chrome → 播放通知声音）。"));
      if (!soundOn()) snd.appendChild(h("button", { type: "button", class: "btn sm", text: "开启提示音", onclick: function () { ensureAudio(); setTimeout(function () { chime(); renderAlert(); }, 150); } }));
      t.appendChild(snd);
    }
    else if (S.notify && perm === "default") { t.appendChild(h("b", { text: "🔔 提醒默认开着，还差浏览器允许一次。" })); t.appendChild(document.createTextNode("浏览器弹出询问时点「允许」；没看到询问就点右边的按钮。允许一次以后，黄金页和比特币页都不用再点。")); }
    else if (S.notify && perm === "denied") { t.appendChild(h("b", { text: "浏览器拒绝了通知。" })); t.appendChild(document.createTextNode("点地址栏左边的网站设置，把「通知」改成允许，再回来点「开启」。")); }
    else { t.appendChild(h("b", { text: "🔔 有新信号或趋势变化时提醒我" })); t.appendChild(document.createTextNode("：浏览器弹出通知，不用设置别的。")); }
    el.appendChild(t);
    if (on) {
      el.appendChild(h("button", { type: "button", class: "btn sm", text: "试一下", onclick: function () { ensureAudio(); renderAlert(); fireAlert(M.sym + " 提醒测试", "这是一条测试通知。出现新信号时会像这样弹出，点它回到报告页。", M.id + "-test"); } }));
      el.appendChild(h("button", { type: "button", class: "btn sm ghost", text: "关闭", onclick: function () { S.notify = false; LS.set("notify", false); renderAlert(); } }));
    } else el.appendChild(h("button", { type: "button", class: "btn sm pri", text: S.notify && Notification.permission === "default" ? "允许通知" : "开启提醒", onclick: function () {
      S.notify = true; LS.set("notify", true); ensureAudio(); askPermission(); renderAlert();
    } }));
  }
  // The chime. Browsers let a page make sound only after the visitor has clicked or typed on it since it was
  // loaded, so the sound is unlocked by the first click anywhere (or by 开启提示音 / 试一下); until then the
  // notification still pops up, silently, and the switch says so.
  function ensureAudio() {
    try {
      if (!S.audio && (window.AudioContext || window.webkitAudioContext)) S.audio = new (window.AudioContext || window.webkitAudioContext)();
      if (S.audio && S.audio.state === "suspended") S.audio.resume().then(function () { if ($("v-alert")) renderAlert(); soundChip(); }, function () {});
    } catch (e) {}
    return !!(S.audio && S.audio.state === "running");
  }
  function soundOn() { return !!(S.audio && S.audio.state === "running"); }
  function soundChip() {
    var c = $("snd-chip");
    if (!c) { c = h("button", { type: "button", id: "snd-chip", class: "snd-chip", text: "🔇 点一下页面，开启提示音" }); document.body.appendChild(c); }
    c.hidden = !(S.notify && NOTE_OK && !soundOn());
  }
  if (S.notify) setTimeout(function () { askPermission(); ensureAudio(); setTimeout(function () { if ($("v-alert")) renderAlert(); soundChip(); }, 400); }, 0);
  document.addEventListener("click", function () { if (S.notify && NOTE_OK && Notification.permission === "default") askPermission(); }, { once: false, passive: true });
  ["pointerdown", "keydown", "touchstart"].forEach(function (evn) { document.addEventListener(evn, function () { if (S.notify && !soundOn()) { ensureAudio(); setTimeout(function () { renderAlert(); soundChip(); }, 300); } }, { passive: true }); });
  function chime() {
    ensureAudio(); var a = S.audio; if (!a || a.state !== "running") return;
    try { M.chime.notes.forEach(function (n) { var d = n[0], o = a.createOscillator(), g = a.createGain(); o.type = M.chime.wave; o.frequency.value = n[1]; g.gain.setValueAtTime(0.0001, a.currentTime + d); g.gain.exponentialRampToValueAtTime(0.35, a.currentTime + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d + 0.32); o.connect(g); g.connect(a.destination); o.start(a.currentTime + d); o.stop(a.currentTime + d + 0.34); }); } catch (e) {}
  }
  function fireAlert(title, body, tag) {
    if (!alertsOn()) return;
    try {
      var n = new Notification(title, { body: body, tag: tag, renotify: true, requireInteraction: true, silent: false });
      n.onclick = function () { try { window.focus(); } catch (e) {} $("verdict").scrollIntoView({ behavior: "smooth", block: "start" }); n.close(); };
    } catch (e) { toast(title + "：" + body); }
    chime();
    if (document.visibilityState !== "visible") { var t0 = S.title0 || (S.title0 = document.title); document.title = "🔔 " + title; var back = function () { if (document.visibilityState === "visible") { document.title = t0; document.removeEventListener("visibilitychange", back); } }; document.addEventListener("visibilitychange", back); }
  }
  // called with every new answer: alert when it has just become "go"
  function alertCheck(V, unconfirmed) {
    levelCheck(V, unconfirmed);
    var R = V.regime || {}, key = V.level === "go" && !V.closed && !unconfirmed ? "go:" + R.dir + ":" + (R.since5 || "") : null;
    var prev = S.alertKey; S.alertKey = key;
    if (prev === undefined) { if (key) LS.set("notified", key); return; }      // the answer the page opened with: already on screen
    if (!key || key === prev || LS.get("notified", "") === key) return;
    LS.set("notified", key);
    if (!S.nopt.signal) return;
    var k = sysPlanNow(false), nw = newsCheck();
    fireAlert(M.sym + " 新信号：" + V.tag, V.title + "。现价 " + fmt(S.live, 1) + (k ? "，" + (k.side === "short" ? "卖出" : "买入") + "止损 " + fmt(k.stop, 1) + "，目标 " + fmt(k.tp1, 1) + "（3R）" : "") + "。" + (nw && nw.ok === false ? "注意：" + nw.detail + "。" : "") + "点开看计划。", M.id + "-signal");
  }

  // The answer moving from one state to another (a new "go" has its own alert above): e.g. the signal fading to
  // "wait for the small timeframes", or the big three falling out of line.
  function levelCheck(V, unconfirmed) {
    if (V.closed || unconfirmed) return;
    var R = V.regime || {}, key = V.level + ":" + (R.dir || 0), prev = S.levelKey; S.levelKey = key;
    if (prev === undefined || prev === key || V.level === "go") return;
    var stamp = key + ":" + Math.floor(Date.now() / 900000);                    // once per quarter hour across tabs
    if (LS.get("notifiedLevel", "") === stamp) return; LS.set("notifiedLevel", stamp);
    if (!S.nopt.verdict) return;
    fireAlert(M.sym + " 结论变了：" + V.tag, V.title + "。现在 " + arrowsNow() + "。" + (S.pos ? "你有持仓：看「我的持仓」里写的做法。" : ""), M.id + "-level");
  }
  var TW = { bullish: "向上", bearish: "向下", unclear: "不明", mixed: "不明" };
  function arrowsNow() { return S.E ? P.votes(S.E).map(function (v) { return P.TF_S[v.tf] + (v.v > 0 ? "↑" : v.v < 0 ? "↓" : "–"); }).join(" ") : ""; }
  // ---------- trend changes ----------
  // Each recompute is compared with the one before (on the same data source): a timeframe whose trend has flipped
  // is listed, and alerted if wanted. The server's record (S.rec.changes, every 15-minute close, also while no page
  // is open) gives the history before this page was opened.
  S.liveChanges = [];
  function trendCheck(E, source) {
    var cur = {}; ["W", "D", "4H", "1H", "15M"].forEach(function (tf) { var t = E.tfs[tf]; cur[tf] = t && !t.error ? t.trend : null; });
    var prev = S.prevTrends, same = S.prevSource === source; S.prevTrends = cur; S.prevSource = source;
    if (!prev || !same || source === "paxg") return;
    var m15 = E.tfs["15M"], closeMs = m15 && m15.barTime ? Date.parse(m15.barTime) + 900000 : Date.now();
    Object.keys(cur).forEach(function (tf) {
      var a = prev[tf], b = cur[tf]; if (!a || !b || a === b) return;
      var t = E.tfs[tf], ch = { ms: num(t.since) !== null ? t.since : closeMs, tf: tf, from: a, to: b, price: S.feed ? S.feed.price : null, level: t.lastEvent ? t.lastEvent.level : null,
        a3: E.overall.agree3, a5: E.overall.agree5, live: true };
      S.liveChanges.push(ch);
      var key = "chg:" + tf + ":" + ch.ms; if (LS.get("notifiedChg", "") === key) return; LS.set("notifiedChg", key);
      var big = tf === "W" || tf === "D" || tf === "4H";
      if (big ? !S.nopt.big : !S.nopt.small) return;
      var V = P.verdict(E);
      fireAlert(M.sym + "：" + P.TF_ZH[tf] + "转" + TW[b], "收盘 " + (ch.price !== null ? fmt(ch.price, 1) : "—") + (ch.level !== null ? "，" + (b === "bearish" ? "跌破 " : "站上 ") + fmt(ch.level, 1) : "") + "。现在 " + arrowsNow() + " · 结论：" + V.tag + "。", M.id + "-trend-" + tf);
    });
    renderChanges();
  }
  // the list: the server's record, plus any flip it has not seen yet (each timeframe's start time is newer than the
  // record's last check), plus what this page saw itself
  function allChanges() {
    var r = S.rec, out = (r && r.changes ? r.changes.slice() : []), seen = {}, last = r && num(r.lastChecked) !== null ? r.lastChecked : 0;
    var keyOf = function (c) { return c.tf + ":" + Math.round(c.ms / 900000); };
    out.forEach(function (c) { seen[keyOf(c)] = 1; });
    S.liveChanges.forEach(function (c) { if (!seen[keyOf(c)]) { seen[keyOf(c)] = 1; out.push(c); } });
    if (S.E) ["W", "D", "4H", "1H", "15M"].forEach(function (tf) {
      var t = S.E.tfs[tf]; if (!t || t.error || num(t.since) === null || t.since <= last || (t.trend !== "bullish" && t.trend !== "bearish")) return;
      var c = { ms: t.since, tf: tf, from: t.trend === "bullish" ? "bearish" : "bullish", to: t.trend, price: null, level: t.lastEvent ? t.lastEvent.level : null, a3: S.E.overall.agree3, a5: S.E.overall.agree5, live: true };
      if (!seen[keyOf(c)]) { seen[keyOf(c)] = 1; out.push(c); }
    });
    return out.sort(function (a, b) { return b.ms - a.ms; });
  }
  function renderChanges() {
    var box = $("chg-body"); if (!box) return;
    var list = allChanges(), bigOnly = !!S.chgBig, shown = list.filter(function (c) { return !bigOnly || c.tf === "W" || c.tf === "D" || c.tf === "4H"; });
    clear(box);
    $("chg-span").textContent = S.rec && S.rec.changes ? "每根 15 分钟 K 线收盘后检查 · 记录从 " + sgt(S.rec.changes.length ? S.rec.changes[0].ms : S.rec.lastChecked, "d") + " 起" : "记录读取中";
    var head = h("div", { class: "cg-now" }); head.appendChild(h("b", { text: "现在 " + arrowsNow() })); 
    if (list[0]) head.appendChild(document.createTextNode(" · 最近一次：" + P.TF_ZH[list[0].tf] + "转" + TW[list[0].to] + "（" + sgt(list[0].ms) + "，" + ago(list[0].ms) + "）"));
    var tg = h("button", { type: "button", class: "btn sm ghost", text: bigOnly ? "显示全部周期" : "只看周线、日线、4 小时", onclick: function () { S.chgBig = !S.chgBig; LS.set("chgBig", S.chgBig); renderChanges(); } });
    head.appendChild(tg); box.appendChild(head);
    if (!shown.length) { box.appendChild(h("p", { class: "note", text: bigOnly ? "这段时间周线、日线、4 小时都没有转向。" : "这段时间没有周期转向。" })); return; }
    var ol = h("ol", { class: "cg-list" }), limit = S.chgAll ? shown.length : 8;
    shown.slice(0, limit).forEach(function (c) {
      var big = c.tf === "W" || c.tf === "D" || c.tf === "4H", up = c.to === "bullish", fresh = Date.now() - c.ms < 4 * 3600000;
      var after = c.a5 ? "五个周期同向" + (c.a5 > 0 ? "向上：做多信号" : "向下：做空信号") : c.a3 ? "三大周期同向" + (c.a3 > 0 ? "向上" : "向下") + "，等小周期" : "";
      ol.appendChild(h("li", { class: "cg" + (big ? " big" : "") }, [
        h("span", { class: "cg-t", text: sgt(c.ms) }),
        h("span", { class: "cg-tf " + (up ? "up" : "dn"), text: P.TF_S[c.tf] }),
        h("span", { class: "cg-d " + (up ? "up" : "dn"), text: (TW[c.from] || "—") + " → " + TW[c.to] + (fresh ? " · 新" : "") }),
        h("span", { class: "cg-p", text: (c.price !== null && c.price !== undefined ? "收盘 " + fmt(c.price, 1) : "") + (c.level !== null && c.level !== undefined ? (c.price !== null && c.price !== undefined ? "，" : "") + (up ? "站上 " : "跌破 ") + fmt(c.level, 1) : "") }),
        after ? h("span", { class: "cg-a" + (c.a5 ? " sig" : ""), text: after }) : null
      ]));
    });
    box.appendChild(ol);
    if (shown.length > 8) box.appendChild(h("button", { type: "button", class: "btn sm ghost", text: S.chgAll ? "收起" : "显示全部 " + shown.length + " 条", onclick: function () { S.chgAll = !S.chgAll; renderChanges(); } }));
  }
  S.chgBig = !!LS.get("chgBig", false);
  (function () {
    var st = document.createElement("style");
    st.textContent = ".snd-chip{position:fixed;right:16px;bottom:16px;z-index:60;border:1px solid rgba(212,167,44,.5);background:rgba(21,21,28,.95);color:var(--gold-lt);font:600 12.5px/1 var(--f-d);padding:11px 15px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.5);cursor:pointer}" +
      ".nsnd{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px;font-size:12.5px;color:var(--gold-lt)}.nsnd.on{color:var(--dim)}.nopts{display:flex;flex-direction:column;gap:6px;margin-top:10px}.nopt{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--text);cursor:pointer}" +
      ".cg-now{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;font-size:13px;color:var(--text);margin-bottom:12px}.cg-now b{color:var(--ink)}.cg-now .btn{margin-left:auto}" +
      ".cg-list{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:0}" +
      ".cg{display:grid;grid-template-columns:96px 64px 112px minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:9px 4px;border-top:1px solid var(--border);font-size:12.5px;color:var(--dim)}" +
      ".cg.big{color:var(--text)}.cg.big .cg-tf{font-weight:700}" +
      ".cg-t{font-family:var(--f-m);font-size:11.5px;white-space:nowrap}.cg-tf{font-family:var(--f-m);font-size:11.5px;padding:3px 8px;border-radius:6px;text-align:center;background:var(--bg3)}" +
      ".cg-tf.up,.cg-d.up{color:var(--bull)}.cg-tf.dn,.cg-d.dn{color:var(--bear)}.cg-d{font-weight:600;white-space:nowrap}.cg-p{font-family:var(--f-m);font-size:11.5px;min-width:0}" +
      ".cg-a{font-size:11.5px;padding:3px 9px;border-radius:999px;background:var(--bg3);white-space:nowrap}.cg-a.sig{color:var(--gold-lt);background:rgba(212,167,44,.12)}" +
      "@media(max-width:700px){.cg{grid-template-columns:auto auto minmax(0,1fr)}.cg-p,.cg-a{grid-column:1/-1}.cg-a{justify-self:start}}";
    document.head.appendChild(st);
  })();

  // ---------- the written brief inside this page ----------
  // daily.html, news.html and risk.html load in frames only when their tab is first opened (or the section scrolls
  // into view); assets/embed.js inside them hides their own navbar and reports their height.
  function showRead(id, scroll) {
    if (!$("rf-" + id)) id = "daily";
    all("#rtabs [data-read]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-read") === id)); });
    all("#read-box .rf").forEach(function (f) { var on = f.id === "rf-" + id; f.hidden = !on; if (on && !f.getAttribute("src")) { f.setAttribute("src", f.getAttribute("data-src")); $("read-wait").hidden = false; } });
    S.readTab = id;
    if (scroll) $("read").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data || !e.data.embedH) return;
    all("#read-box .rf").forEach(function (f) { if (f.contentWindow === e.source) { f.style.height = Math.min(e.data.embedH + 4, 30000) + "px"; if (!f.hidden) $("read-wait").hidden = true; } });
  });
  all("#rtabs [data-read]").forEach(function (b) { b.addEventListener("click", function () { showRead(b.getAttribute("data-read")); }); });
  all("#gnav a").forEach(function (a) { a.addEventListener("click", function (ev) {
    var r = a.getAttribute("data-read"), t = a.getAttribute("data-tab");
    if (r) { ev.preventDefault(); showRead(r, true); history.replaceState(null, "", "#read-" + r); }
    if (t) { showTab(t); }
  }); });
  (function () {
    if (!$("read")) return;                                                     // btc.html has no written brief
    var m = location.hash.match(/^#read-(daily|news|risk)$/);
    if (m) { showRead(m[1]); setTimeout(function () { $("read").scrollIntoView({ block: "start" }); }, 600); return; }
    if ("IntersectionObserver" in window) { var io = new IntersectionObserver(function (es) { if (es.some(function (x) { return x.isIntersecting; })) { io.disconnect(); if (!S.readTab) showRead("daily"); } }, { rootMargin: "400px 0px" }); io.observe($("read")); }
    else showRead("daily");
  })();
  // the section in view lights up in the quick links
  if ("IntersectionObserver" in window) {
    var gnLinks = all("#gnav a"), seen = {};
    var gio = new IntersectionObserver(function (es) {
      es.forEach(function (x) { seen[x.target.id] = x.isIntersecting; });
      var cur = ["verdict", "changes", "ask", "chart-sec", "plan", "read", "replay", "dtabs"].filter(function (id) { return seen[id]; })[0];
      gnLinks.forEach(function (a) { var href = a.getAttribute("href").slice(1), id = /^read-/.test(href) ? "read" : href; a.classList.toggle("on", id === cur && (id !== "read" || a.getAttribute("data-read") === S.readTab)); });
    }, { rootMargin: "-25% 0px -60% 0px" });
    ["verdict", "changes", "ask", "chart-sec", "plan", "read", "replay", "dtabs"].forEach(function (id) { var el = $(id); if (el) gio.observe(el); });
  }
  (function navH() { var nb = document.querySelector(".navbar"); document.documentElement.style.setProperty("--navh", (nb ? nb.offsetHeight : 54) + "px"); window.addEventListener("resize", function () { document.documentElement.style.setProperty("--navh", (nb ? nb.offsetHeight : 54) + "px"); }); })();

  // ---------- ask Claude ----------
  // The question goes to claude.ai with this page's live state written out as plain facts, so the answer is about
  // the situation now. Nothing leaves the page until the button is pressed; the visitor's own Claude account answers.
  // claude.ai/new?q= fills in the message; the same text is also copied, in case the app opens without it.
  function loadNews() { if (!M.news) return; fetch(M.news, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && d.items) S.news = d.items; }).catch(function () {}); }
  var EN_TF = { W: "Weekly", D: "Daily", "4H": "4-hour", "1H": "1-hour", "15M": "15-min" };
  function f1(v) { return num(v) === null ? "—" : fmt(v, 1); }
  function askContext(withMe) {
    var E = S.E, L = [], now = Date.now();
    if (!E) return "（行情还在载入，资料暂时不完整）";
    var V = P.verdict(E), R = V.regime || P.regime(E), open = marketOpen(), K = S.feed && S.feed.K, D = K && K.D, prev = D && D.length ? D[D.length - 1][4] : null;
    L.push("LIVE DATA from the trading page at " + sgt(now, "full") + " (" + (S.feed && S.feed.source === "paxg" ? M.liveDataBackup : M.liveData) + ")");
    L.push("Market: " + (open ? "open" : "closed for the weekend (reopens Monday about 06:00 SGT)"));
    L.push("Price (bid, live): " + f1(S.live) + (prev !== null && num(S.live) !== null ? " | previous day close " + f1(prev) + " (" + (S.live >= prev ? "+" : "") + fmt(S.live - prev, 1) + ", " + (S.live >= prev ? "+" : "") + fmt((S.live - prev) / prev * 100, 2) + "%)" : ""));
    L.push("Rule's answer now: " + V.tag + " / " + V.title + " (level: " + V.level + ")");
    if (V.signal) L.push("Signal: appeared " + sgt(V.signal.at) + " SGT at " + f1(V.signal.price) + (num(V.signal.movedR) !== null ? ", price has moved " + V.signal.movedR.toFixed(1) + "R in its favour since" : ""));
    L.push("Timeframes (structure trend; weights W3 D3 4H2 1H1 15M1; score " + P.votes(E).reduce(function (a, v) { return a + (v.v || 0) * v.w; }, 0) + " of -10..+10):");
    P.votes(E).forEach(function (v) {
      var t = E.tfs[v.tf] || {}, flip = v.v ? P.flipLevel(E, v.tf, -v.v) : null, opp = v.v > 0 ? "bearish" : "bullish";
      var against = !!(v.v && (t.internal === opp || (t.ema && t.ema.stack === opp && num(t.rsi) !== null && (v.v > 0 ? t.rsi < 50 : t.rsi > 50))));
      L.push("- " + EN_TF[v.tf] + ": " + (v.v > 0 ? "UP" : v.v < 0 ? "DOWN" : "unclear") + (num(t.since) !== null ? " since " + sgt(t.since) : "") + ", RSI " + (num(t.rsi) !== null ? Math.round(t.rsi) : "—") + ", ATR " + f1(t.atr) +
        (against ? ", but moving against it lately (" + (v.v > 0 ? "pullback" : "bounce") + ")" : "") + (flip !== null ? "; turns " + (v.v > 0 ? "down on a close below " : "up on a close above ") + f1(flip) : ""));
    });
    var k = R.dir ? P.systemPlan(E, R.dir) : null;
    if (k) L.push("Plan at the live price: " + (k.side === "short" ? "SELL" : "BUY") + " " + f1(k.entry) + ", stop " + f1(k.stop) + " (" + fmt(k.dist, 1) + " away = 3x 1-hour ATR), target 3R " + f1(k.tp1) + "; trailing-stop alternative keeps the stop " + fmt(k.trailDist, 0) + " behind the best price" + (R.full ? "" : " (not valid yet: the small timeframes have not turned)"));
    V.lines.forEach(function (l) { L.push("Level that changes the answer: " + f1(l.price) + " (" + l.text + ")"); });
    var nr = P.nearest(E);
    if (nr.sup || nr.res) L.push("Nearest support " + (nr.sup ? f1(nr.sup.price) + " (" + (nr.sup.labels || []).slice(0, 2).join(", ") + ")" : "—") + " | nearest resistance " + (nr.res ? f1(nr.res.price) + " (" + (nr.res.labels || []).slice(0, 2).join(", ") + ")" : "—"));
    var ev = (S.events || []).filter(function (e) { return e.ms > now - 3600000; }).slice(0, 4);
    L.push("US calendar ahead (SGT): " + (ev.length ? ev.map(function (e) { return e.date + " " + e.time + " " + e.name + " [" + (e.imp || "") + "]" + (e.extra ? " " + e.extra : ""); }).join(" ; ") : "nothing medium or high impact left this week"));
    if (open) { var sd = new Date((now / 1000 + Feed.serverOff(now / 1000)) * 1000); if (sd.getUTCDay() === 5) L.push("It is Friday: gold shuts Saturday about 05:00 SGT, a trade opened now is held over the weekend."); }
    var nw = (S.news || []).slice(0, 6);
    if (nw.length) { L.push("Latest gold headlines:"); nw.forEach(function (x) { L.push("- " + x.t + " (" + x.src + ", " + ago(x.ms) + ")"); }); }
    var r = S.rec;
    if (r && r.summary) {
      var op = (r.signals || []).filter(function (x) { return x.status === "open"; })[0], oR = openR(op);
      L.push("Rule's paper record since " + r.since + ": signals " + r.summary.signals + ", closed " + r.summary.closed + (r.summary.closed ? ", total " + sgn(r.summary.totalR, 1) + "R" : "") + (op ? "; open " + (op.side === "做空" ? "short" : "long") + " #" + op.id + " from " + f1(op.entry) + ", stop " + f1(op.stop) + ", target " + f1(op.target) + (oR !== null ? ", now " + sgn(oR) + "R" : "") : ""));
    }
    if (withMe) {
      var pm = posState(), p = S.pos;
      if (p) L.push("MY POSITION (tracked on the page): " + (p.side === "short" ? "short" : "long") + (p.lots ? " " + p.lots + " lots" : "") + " from " + f1(p.entry) + " (" + sgt(p.at) + " SGT), stop now " + f1(p.stop) + " (first stop " + f1(p.initStop) + "), " + (p.mode === "trail" ? "trailing-stop method" : "fixed target " + f1(p.tp1)) + (pm && pm.pnlR !== null ? ", now " + sgn(pm.pnlR) + "R" : "") + (pm && pm.moveStop ? ", rule says move the stop to " + f1(pm.trailStop) + " today" : ""));
      else L.push("MY POSITION: none tracked on the page.");
      if (num(S.acct.balance) !== null) L.push("MY ACCOUNT: balance " + P.usd(S.acct.balance) + ", risk per trade " + S.acct.riskPct + "%, contract " + (S.acct.contract || 100) + " oz per lot, minimum lot " + (S.acct.lotStep || 0.01));
    }
    return L.join("\n");
  }
  function askPrompt(q, withMe) {
    return M.askIntro + " Answer in Simplified Chinese, plainly and briefly: the direct answer first, then the reasons, then the main risk. " +
      "Use the live data below from my trading page; you may search the web for news after that time. " +
      "My page's rule: trade only when the weekly, daily and 4-hour structure trends agree, enter when the 1-hour and 15-minute agree too; stop 3x the 1-hour ATR; " +
      "exit either with a fixed 3R target (stop and target never move) or with a trailing stop (moved once a day at 08:00 SGT to 2R behind the best price, exit when the big three stop agreeing); risk 0.5% of the account per trade, never above 1%. " +
      M.askReplay + " If you disagree with the rule's answer, say why, but do not suggest entries that break it.\n\n" +
      "MY QUESTION: " + q + "\n\n" + askContext(withMe);
  }
  function askNow(open) {
    var q = $("ask-q").value.trim();
    if (!q) { $("ask-msg").textContent = "先选一个问题，或者自己写一个。"; $("ask-q").focus(); return; }
    var text = askPrompt(q, $("ask-me").checked), url = "https://claude.ai/new?q=" + encodeURIComponent(text);
    $("ask-pre").textContent = text;
    var copied = function (ok) { $("ask-msg").textContent = open ? (ok ? "已在新窗口打开 Claude，问题和资料已填好；如果没有填好，在输入框里粘贴即可（已复制）。" : "已在新窗口打开 Claude。如果问题没有填好，点「只复制」再粘贴。") : ok ? "已复制，到 Claude 里粘贴即可。" : "复制失败：打开下面的「Claude 会看到的资料」，手动复制。"; };
    if (open) {
      if (url.length > 12000) url = "https://claude.ai/new";                   // too long for a link: the copied text carries it
      var a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
    }
    try { navigator.clipboard.writeText(text).then(function () { copied(true); }, function () { copied(false); }); } catch (e) { copied(false); }
  }
  all("#ask-qs button").forEach(function (b) { b.addEventListener("click", function () { all("#ask-qs button").forEach(function (x) { x.classList.toggle("on", x === b); }); $("ask-q").value = b.getAttribute("data-q"); $("ask-msg").textContent = ""; if (!$("ask-ctx").open) return; $("ask-pre").textContent = askPrompt($("ask-q").value, $("ask-me").checked); }); });
  $("ask-go").addEventListener("click", function () { askNow(true); });
  $("ask-copy").addEventListener("click", function () { askNow(false); });
  $("ask-ctx").addEventListener("toggle", function () { if ($("ask-ctx").open) $("ask-pre").textContent = askPrompt($("ask-q").value.trim() || "（还没写问题）", $("ask-me").checked); });

  // ---------- tabs ----------
  function showTab(id) {
    if (!document.querySelector('[data-panel="' + id + '"]') || (id === "ai" && !S.hasAi)) id = "levels"; else { S.tab = id; LS.set("tab", id); }
    all("#dtabs [data-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === id)); });
    all("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== id; });
  }

  // ---------- data ----------
  function fetchSpot() {
    if (!M.spotUrl) return Promise.resolve();
    return fetch(M.spotUrl, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      var at = d && Date.parse(d.updatedAt);
      if (d && num(d.price) !== null && d.price > 0 && (!isFinite(at) || Date.now() - at < 3 * 60000)) { S.spot = d.price; S.spotAt = Date.now(); }   // a quote older than 3 minutes is not used
    }).catch(function () {});
  }
  // A PAXG tick: kept raw, shown after the gap to spot is added. While gold is shut the ticks are ignored.
  function livePrice(p) { S.raw = p; setLive(); }
  function fetchTick() { return fetch("https://data-api.binance.vision/api/v3/ticker/price?symbol=" + M.tick, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) { var p = d && parseFloat(d.price); if (isFinite(p) && p > 0) livePrice(p); }).catch(function () {}); }
  function setStamp() {
    var on = streamOn(); $("ldot").className = "ldot" + (on ? " on" : "");
    $("stamp").textContent = (on ? "报价实时推送" : "报价每 30 秒更新") + " · K 线于 " + (S.lastRun ? sgt(S.lastRun, "t") : "--:--") + " 更新，每 15 分钟收线后重算";
    var src = $("src"), px = S.feed && S.feed.source === "paxg";
    src.className = "chip " + (px ? "gold" : "neut"); src.textContent = !S.feed ? "数据载入中" : px ? M.srcBackup : M.srcSpot;
  }
  function busyUi() { return !!S.armed || S.overLadder || $("chart").querySelector(".tip:not([hidden])") !== null; }

  // ---------- live price stream ----------
  // Binance pushes every trade and best bid/ask change, so the price is live to the second.
  // The polling loop below stays as the fallback when the socket is down or silent.
  var WS = null, wsBack = 0, wsAt = 0, paintT = null, slowN = 0;
  function streamOn() { return !!WS && WS.readyState === 1 && Date.now() - wsAt < 90000; }
  function onPrice() {
    checkVerdict();
    if (document.visibilityState !== "visible" || paintT) return;
    paintT = setTimeout(function () {                                           // repaint at most once a second
      paintT = null; if (document.visibilityState !== "visible") return;
      paintLive(); if (S.pos && !S.posForm) renderPos(); if (++slowN % 10 === 0 && !busyUi()) { renderLevels(); drawChart(); }
    }, 1000);
  }
  function connectStream() {
    if (!("WebSocket" in window) || WS) return;
    var ws; try { ws = new WebSocket("wss://data-stream.binance.vision/stream?streams=" + M.ws + "@aggTrade/" + M.ws + "@bookTicker"); } catch (e) { return; }
    WS = ws;
    ws.onopen = function () { wsBack = 0; wsAt = Date.now(); setStamp(); };
    ws.onmessage = function (m) {
      var d; try { d = JSON.parse(m.data).data; } catch (e) { return; }
      var p = d && d.p ? parseFloat(d.p) : d && d.b && d.a ? (parseFloat(d.b) + parseFloat(d.a)) / 2 : NaN;   // last trade, or the mid of the best quotes
      if (!isFinite(p) || p <= 0) return;
      wsAt = Date.now(); if (p === S.raw || !S.E) return;
      livePrice(p); onPrice();
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
    ws.onclose = function () { if (WS === ws) WS = null; wsBack = Math.min(wsBack + 1, 6); setTimeout(connectStream, 3000 * wsBack); setStamp(); };
  }
  function renderAll() { renderPos(); renderVerdict(); renderTfTabs(); renderMatrix(); renderCands(); renderLevels(); renderPlan(); drawChart(); fillTable(); }
  function refresh() {
    if (S.busy) return; S.busy = true; S.lastTry = Date.now(); document.body.classList.add("refreshing");
    XAU_TFS.forEach(function (c) { c.bars = CHART_BARS[c.tf]; });
    Promise.all([Feed.load(), fetchSpot(), num(S.raw) === null ? fetchTick() : null]).then(function (res) {
      var feed = res[0], E = runXauEngine(feed); if (!E || num(E.price) === null) throw new Error("行情接口没有返回数据");
      S.feed = feed; S.E = E; S.lastRun = Date.now(); S.lastQ = Math.floor((Date.now() - 25000) / 900000);
      calibrate(); setLive();
      // the finished minutes since the last quarter-hour: they complete the candle that is still forming, and stand
      // in for the price service when it has given no fresh quote
      S.tHi = S.tLo = null; if (feed.source !== "spot") S.mins = [];
      if (feed.source === "spot" && marketOpen()) Feed.minutes(20).then(function (rows) {
        S.mins = rows; var m = rows[rows.length - 1];
        minuteBasis(rows).then(function (b) { if (!b || Math.abs(b.gap) > 80) return; S.gap = Math.round(b.gap * 100) / 100; S.gapOk = true; S.basisAt = Date.now(); S.basisN = b.n; setLive(); paintLive(); });
        if (m && Date.now() - S.spotAt > 3 * 60000 && Date.now() - (m[0] + 60) * 1000 < 3 * 60000 && num(S.raw) !== null) { S.spot = m[4]; S.spotAt = Date.now(); calibrate(); }
        paintLive(); if (!busyUi()) drawChart();
      }).catch(function () {});
      if (!S.hadPlan) { S.hadPlan = true; var k0 = sysPlanNow(false); if (k0 && P.regime(E).full) { S.plan.side = k0.side; S.plan.entry = k0.entry; S.plan.stop = k0.stop; S.plan.tp1 = k0.tp1; S.plan.tp2 = null; touched(); syncInputs(); } }
      $("err").hidden = true; $("feed-warn").hidden = !feed.warn; $("feed-warn-t").textContent = feed.warn || "";
      renderAll(); setStamp();
      renderProof(); trendCheck(E, feed.source); renderChanges();
      if (location.hash === "#ask" && !S.askJumped) { S.askJumped = true; setTimeout(function () { $("ask").scrollIntoView({ block: "start" }); $("ask-q").focus({ preventScroll: true }); }, 300); }   // arrived from another page's "问 Claude" link
    }).catch(function (e) {
      $("err").hidden = false; $("err-t").textContent = (e && e.message ? e.message : "网络异常") + "。" + (S.E ? "页面保留上一次的结果。" : "");
    }).then(function () { S.busy = false; document.body.classList.remove("refreshing"); });
  }
  function tick() {
    if (!S.E || S.busy) return;
    var vis = document.visibilityState === "visible";
    if (!vis) return;
    Promise.all([streamOn() ? null : fetchTick(), marketOpen() ? fetchSpot() : null]).then(function () {
      calibrate(); checkVerdict(); setStamp();
      if (vis) { renderVerdict(); if (!busyUi()) { renderLevels(); drawChart(); } }
    });
  }
  function loop() { tick(); setTimeout(loop, 30000); }

  // ---------- wiring ----------
  all("[data-cmode]").forEach(function (b) { b.addEventListener("click", function () { S.cmode = b.getAttribute("data-cmode"); LS.set("cmode", S.cmode); renderTfTabs(); drawChart(); }); });
  // Switching direction turns a plan that was right for the old direction round, so the stop and targets follow
  // instead of becoming errors. Prices that only make sense for the new direction are left as they are.
  all("[data-side]").forEach(function (b) { b.addEventListener("click", function () {
    var side = b.getAttribute("data-side"); if (side === S.plan.side) return;
    var was = currentSize(), m = P.mirror(S.plan, side); S.plan.side = side;
    if (was.valid && m.changed) { S.plan.stop = m.plan.stop; S.plan.tp1 = m.plan.tp1; S.plan.tp2 = m.plan.tp2; touched(); toast("已换成" + (side === "short" ? "做空" : "做多") + "：止损和目标翻到了另一边，距离不变"); }
    replan();
  }); });
  all("[data-pick]").forEach(function (b) { b.addEventListener("click", function () { var f = b.getAttribute("data-pick"); S.armed = S.armed === f ? null : f; renderArm(); if (S.armed) { var r = $("chart").getBoundingClientRect(); if (r.bottom < 120 || r.top > window.innerHeight - 120) $("chart").scrollIntoView({ behavior: "smooth", block: "center" }); } }); });
  FIELDS.forEach(function (f) { $("in-" + f).addEventListener("input", function () { var v = parseFloat(this.value); S.plan[f] = isFinite(v) ? v : null; touched(); persistPlan(); if (S.E) renderCands(); renderPlan(); drawChart(); }); });
  [["in-bal", "balance"], ["in-risk", "riskPct"], ["in-contract", "contract"], ["in-step", "lotStep"], ["in-spread", "spread"]].forEach(function (m) {
    $(m[0]).addEventListener("input", function () { var v = parseFloat(this.value); S.acct[m[1]] = isFinite(v) && v >= 0 ? v : null; persistPlan(); renderPlan(); });
  });
  all("#riskq button").forEach(function (b) { b.addEventListener("click", function () { S.acct.riskPct = parseFloat(b.getAttribute("data-r")); persistPlan(); syncInputs(); renderPlan(); }); });
  all("#helpers button[data-h]").forEach(function (b) { b.addEventListener("click", function () { helper(b.getAttribute("data-h")); }); });
  all("#dtabs [data-tab]").forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); }); });
  $("in-note").addEventListener("input", function () { S.plan.note = this.value; persistPlan(); });
  $("copy").addEventListener("click", function () { if (num(S.plan.entry) === null || num(S.plan.stop) === null) { toast("先填入场价和止损价"); return; } copyText(planAsText()); });
  $("save").addEventListener("click", function () {
    if (num(S.plan.entry) === null || num(S.plan.stop) === null) { toast("先填入场价和止损价"); return; }
    var sz = currentSize();
    S.saved.unshift({ side: S.plan.side, entry: S.plan.entry, stop: S.plan.stop, tp1: S.plan.tp1, tp2: S.plan.tp2, note: S.plan.note || "", lots: sz.lots, when: sgt(Date.now(), "full"), basis: basisName(), status: "计划中" });
    S.saved = S.saved.slice(0, 20); LS.set("saved", S.saved); renderSaved(); toast("已保存，在下方「已保存」里");
  });
  $("reset").addEventListener("click", clearPlan);
  $("enter").addEventListener("click", enterPos);
  $("stale-clear").addEventListener("click", clearPlan);
  $("stale-new").addEventListener("click", function () { var c = sysPlanNow(false); if (c) loadCandidate(c, "按现在的行情重算"); });
  $("retry").addEventListener("click", refresh);
  $("refresh-now").addEventListener("click", function () { refresh(); loadContext(); loadSnapshot(); loadProof(); loadNews(); });
  $("ladder").addEventListener("mouseenter", function () { S.overLadder = true; }); $("ladder").addEventListener("mouseleave", function () { S.overLadder = false; });
  $("howto").hidden = !!LS.get("howtoDone", false);
  $("howto-x").addEventListener("click", function () { LS.set("howtoDone", true); $("howto").hidden = true; });
  $("tbl").addEventListener("toggle", fillTable);
  window.addEventListener("storage", function (e) { if (e.key === "pnl.v1") renderProof(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { closePop(); if (S.armed) { S.armed = null; renderArm(); } } });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && Date.now() - S.lastRun > 5 * 60000) refresh(); });
  var rz; window.addEventListener("resize", function () { clearTimeout(rz); closePop(); rz = setTimeout(function () { if (S.E) drawChart(); }, 150); });

  var gl = $("gloss"); Object.keys(GLOSS).forEach(function (k) { gl.appendChild(h("div", null, [h("b", { text: GLOSS[k][0] }), h("span", { text: GLOSS[k][1] })])); });
  syncInputs(); renderArm(); renderPlan(); renderSaved(); renderSessions(); renderProof(); renderPos(); showTab(S.tab); renderAlert();
  refresh(); loadContext(); loadSnapshot(); loadProof(); loadNews();
  connectStream(); setTimeout(loop, 30000);
  // The answer can only change when a 15-minute candle closes: recompute just after each quarter hour. The feed
  // needs a few seconds to publish the candle; if it is not there yet, look again a minute later, three times at
  // most. Nothing is fetched in between, so an open tab asks the price feed for candles about 16 times an hour.
  var qSeen = null, qTries = 0;
  setInterval(function () {
    if (document.visibilityState !== "visible" && !alertsOn()) return;         // a hidden tab keeps checking only for the signal reminder
    var now = Date.now(), q = Math.floor((now - 25000) / 900000);
    if (now - S.lastTry < 55000) return;
    if (q !== qSeen) { qSeen = q; qTries = 0; if (q !== S.lastQ) { refresh(); return; } }
    var K = S.feed && S.feed.K["15M"], have = K && K.length ? K[K.length - 1][6] + 1 : 0;
    if (q !== S.lastQ || (marketOpen() && have < q * 900000)) { if (qTries < 3) { qTries++; refresh(); } }
  }, 20000);
  document.addEventListener("market:words", function () { if (S.E) { renderVerdict(); renderPlan(); } });   // btc.html: its replay's words arrived
  setInterval(function () { renderSessions(); renderPlan(); if (S.E) renderVerdict(); if (S.rec && S.tab === "proof") renderProof(); }, 60000);
})();
