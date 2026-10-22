// One live gold price for the daily, news, risk and home pages, worked out the way report.html does it:
// - ticks: Binance PAXG/USDT over a WebSocket (every trade and best-quote change), which trades about $10-15 above
//   spot gold;
// - the gap to spot: spot's last ~20 finished one-minute closes (Dukascopy, bid, through assets/xau-feed.js) matched
//   minute by minute with PAXG's one-minute closes, middle value taken; measured again every 15 minutes;
// - fallback: api.gold-api.com (moves only every 30 seconds and was found up to $2 off spot on 2026-10-23) when the
//   spot minutes cannot be read;
// - while gold is shut (Friday 17:00 to Sunday 18:00 New York) PAXG keeps trading: the price is then spot's last close.
// Pages listen with GoldLive.on(function (p) { p.price, p.at, p.how ("spot" | "gold-api" | "closed"), p.closed }).
(function () {
  "use strict";
  if (window.GoldLive) return;
  var BIN1M = "https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=1m&limit=30";
  var WSURL = "wss://data-stream.binance.vision/stream?streams=paxgusdt@aggTrade/paxgusdt@bookTicker";
  var S = { raw: null, gap: null, gapAt: 0, spot: null, spotAt: 0, last: null, closedPx: null }, subs = [], emitT = null, ws = null, back = 0;
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function feed() { return window.XauFeed || null; }
  function shut() { var F = feed(); return F ? F.closed(Date.now() / 1000) : false; }
  function current() {
    if (shut()) { var c = num(S.closedPx) !== null ? S.closedPx : S.spot; return c === null ? null : { price: c, at: Date.now(), how: "closed", closed: true }; }
    if (num(S.raw) !== null && num(S.gap) !== null && Date.now() - S.gapAt < 40 * 60000) return { price: Math.round((S.raw + S.gap) * 100) / 100, at: Date.now(), how: S.gapHow, closed: false };
    if (num(S.spot) !== null) return { price: S.spot, at: S.spotAt, how: "gold-api", closed: false };
    return null;
  }
  function emit() {
    if (emitT) return;
    emitT = setTimeout(function () { emitT = null; var p = current(); if (!p) return; S.last = p; subs.forEach(function (f) { try { f(p); } catch (e) {} }); }, 1000);   // at most once a second
  }
  function goldApi() {
    return fetch("https://api.gold-api.com/price/XAU", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && num(d.price) !== null && d.price > 0) { S.spot = d.price; S.spotAt = Date.now(); }
    }).catch(function () {});
  }
  function tickOnce() { return fetch("https://data-api.binance.vision/api/v3/ticker/price?symbol=PAXGUSDT", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) { var p = d && parseFloat(d.price); if (isFinite(p) && p > 0) S.raw = p; }).catch(function () {}); }
  // the gap, from matched minutes; when spot minutes are not available, from gold-api (rough)
  function calibrate() {
    var F = feed();
    var spotMin = F && F.minutes ? F.minutes(20).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([spotMin, fetch(BIN1M, { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return null; })]).then(function (r) {
      var rows = r[0], k = r[1];
      if (rows && rows.length) S.closedPx = rows[rows.length - 1][4];
      if (rows && rows.length >= 5 && k && k.length) {
        var px = {}, now = Date.now(); k.forEach(function (x) { if (x[6] < now) px[Math.round(x[0] / 1000)] = parseFloat(x[4]); });
        var d = rows.filter(function (q) { return isFinite(px[q[0]]); }).map(function (q) { return q[4] - px[q[0]]; }).sort(function (a, b) { return a - b; });
        if (d.length >= 5 && Math.abs(d[Math.floor(d.length / 2)]) < 80) { S.gap = d[Math.floor(d.length / 2)]; S.gapAt = Date.now(); S.gapHow = "spot"; return; }
      }
      return Promise.all([goldApi(), tickOnce()]).then(function () {
        if (num(S.spot) !== null && num(S.raw) !== null && Math.abs(S.spot - S.raw) < 80) { S.gap = S.spot - S.raw; S.gapAt = Date.now(); S.gapHow = "gold-api"; }
      });
    }).then(emit);
  }
  function connect() {
    if (!("WebSocket" in window) || ws) return;
    var w; try { w = new WebSocket(WSURL); } catch (e) { return; }
    ws = w;
    w.onopen = function () { back = 0; };
    w.onmessage = function (m) {
      var d; try { d = JSON.parse(m.data).data; } catch (e) { return; }
      var p = d && d.p ? parseFloat(d.p) : d && d.b && d.a ? (parseFloat(d.b) + parseFloat(d.a)) / 2 : NaN;
      if (!isFinite(p) || p <= 0 || p === S.raw) return;
      S.raw = p; if (!shut()) emit();
    };
    w.onerror = function () { try { w.close(); } catch (e) {} };
    w.onclose = function () { if (ws === w) ws = null; back = Math.min(back + 1, 6); setTimeout(connect, 3000 * back); };
  }
  window.GoldLive = {
    on: function (f) { subs.push(f); if (S.last) try { f(S.last); } catch (e) {} },
    now: function () { return current(); }
  };
  goldApi().then(function () { emit(); });                                      // something to show at once
  tickOnce().then(calibrate);
  connect();
  setInterval(function () { if (document.visibilityState === "visible") calibrate(); }, 15 * 60000);
  setInterval(function () { if (document.visibilityState === "visible" && !(ws && ws.readyState === 1)) tickOnce().then(emit); }, 30000);   // no socket: poll
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && Date.now() - S.gapAt > 15 * 60000) calibrate(); });
})();
