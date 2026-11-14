// Candle feed for report.html. Gives the engine the same candles a gold broker's MT5 chart shows:
// real spot XAU/USD, days cut at 17:00 New York (broker "server time"), weekend removed.
//
//   XauFeed.load()  ->  Promise<{ source, K: { W, D, "4H", "1H", "15M" }, price, asOf, gap, warn }>
//   K[tf] is a list of closed candles [openMs, open, high, low, close, 0, closeMs], oldest first, in spot prices.
//
// Source 1 ("spot"): Dukascopy's public chart feed, bid prices, read as a script (JSONP). It is not a documented
//   API and may stop working; then:
// Source 2 ("paxg"): Binance PAXG/USDT candles (a gold-backed token), shifted by its current gap to spot.
//   Measured against spot, that gap drifts a few dollars within a day, so levels from this source are approximate.
//
// Tested against real spot history: research/xau-replay/.
var XauFeed = (function () {
  "use strict";
  var DUK = "https://freeserv.dukascopy.com/2.0/?path=chart/json3&instrument=XAU/USD&offer_side=B&splits=true&time_direction=P";
  var BIN = "https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT";
  var SPOT = "https://api.gold-api.com/price/XAU";
  var DUR = { "15M": 900, "1H": 3600, "4H": 14400, D: 86400, W: 604800 };
  var NEED = { h1: 14600, d1: 1900, m15: 820 };          // enough for 600 broker days, 300 weeks, 800 quarter-hours

  // ---------- time ----------
  // US daylight time: second Sunday of March 07:00 UTC to first Sunday of November 06:00 UTC.
  var dstCache = {};
  function usDst(tSec) {
    var y = new Date(tSec * 1000).getUTCFullYear(), r = dstCache[y];
    if (!r) {
      var mar1 = new Date(Date.UTC(y, 2, 1)).getUTCDay(), nov1 = new Date(Date.UTC(y, 10, 1)).getUTCDay();
      r = dstCache[y] = [Date.UTC(y, 2, 1 + ((7 - mar1) % 7) + 7, 7) / 1000, Date.UTC(y, 10, 1 + ((7 - nov1) % 7), 6) / 1000];
    }
    return tSec >= r[0] && tSec < r[1];
  }
  // Broker server time = New York + 7 hours (GMT+3 in summer, GMT+2 in winter), so a new day starts at 17:00 New York.
  function serverOff(tSec) { return (usDst(tSec) ? 3 : 2) * 3600; }
  // Spot gold is shut from Friday 17:00 to Sunday 18:00 New York.
  function closed(tSec) {
    var d = new Date((tSec + serverOff(tSec) - 7 * 3600) * 1000), wd = d.getUTCDay(), hr = d.getUTCHours();
    return wd === 6 || (wd === 5 && hr >= 17) || (wd === 0 && hr < 18);
  }
  // Friday's close (17:00 New York) of the week whose Monday 00:00 UTC is monSec, as Unix seconds.
  function fridayClose(monSec) { var fri = monSec + 4 * 86400; return fri + (usDst(fri + 43200) ? 21 : 22) * 3600; }
  function bucket(tSec, tf) {
    var dur = DUR[tf], off = dur > 3600 ? serverOff(tSec) : 0, loc = tSec + off;
    var s = tf === "W" ? Math.floor((loc - 345600) / 604800) * 604800 + 345600 : Math.floor(loc / dur) * dur;
    return s - off;
  }
  // rows: [tSec, o, h, l, c] oldest first, each row one finished bar of `step` seconds. Returns candles of timeframe tf.
  function build(rows, tf, step, nowMs) {
    var out = [], cur = null, start = null, dur = DUR[tf];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]; if (closed(r[0])) continue;
      var s = bucket(r[0], tf);
      if (s !== start) { start = s; cur = [s * 1000, r[1], r[2], r[3], r[4], 0, (s + dur) * 1000 - 1]; out.push(cur); }
      else { if (r[2] > cur[2]) cur[2] = r[2]; if (r[3] < cur[3]) cur[3] = r[3]; cur[4] = r[4]; }
    }
    while (out.length && out[out.length - 1][6] >= nowMs) out.pop();              // the candle still forming is not passed on
    return out;
  }

  // ---------- source 1: spot ----------
  // The feed sends no CORS header and refuses requests without a Referer, so it can only be read as a script
  // (JSONP) from the page itself: a sandboxed frame is turned away. What comes back is checked row by row and
  // only finite numbers are kept. This is the same level of trust as the chart widget embedded on the daily page.
  var seq = 0;
  function clean(data) {
    var rows = [];
    if (Array.isArray(data)) for (var i = 0; i < data.length; i++) {
      var r = data[i]; if (!Array.isArray(r) || r.length < 5) continue;
      var t = +r[0], o = +r[1], h = +r[2], l = +r[3], c = +r[4];
      if (isFinite(t) && isFinite(o) && isFinite(h) && isFinite(l) && isFinite(c) && o > 0 && l > 0 && h >= l) rows.push([Math.round(t / 1000), o, h, l, c]);
    }
    rows.sort(function (a, b) { return a[0] - b[0]; });
    return rows;
  }
  function duk(interval, limit, timeout, inst) {
    return new Promise(function (ok, no) {
      var cb = "__xauFeed" + (++seq), s = document.createElement("script"), done = false;
      var drop = function () { try { delete window[cb]; } catch (e) { window[cb] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); };
      var fin = function (err, data) {
        if (done) return; done = true; clearTimeout(timer);
        // an answer that arrives after the time limit still calls its callback: leave a stub for it and tidy up later
        if (err === "no answer") { window[cb] = function () {}; setTimeout(drop, 120000); } else drop();
        if (err) no(new Error("spot feed: " + err)); else ok(clean(data));
      };
      var timer = setTimeout(function () { fin("no answer"); }, timeout || 15000);
      window[cb] = function (data) { fin(null, data); };
      s.onerror = function () { fin("refused"); };
      s.async = true; s.referrerPolicy = "origin";
      s.src = (inst ? DUK.replace("XAU/USD", inst) : DUK) + "&interval=" + interval + "&limit=" + limit + "&timestamp=" + (Date.now() + 60000) + "&jsonp=" + cb;
      document.head.appendChild(s);
    });
  }
  function merge(old, add, keep) {
    if (!old || !old.length) return add.slice(-keep);
    var m = {}, i; for (i = 0; i < old.length; i++) m[old[i][0]] = old[i]; for (i = 0; i < add.length; i++) m[add[i][0]] = add[i];
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return a[0] - b[0]; }).slice(-keep);
  }
  // Candles from finished spot bars: h1 hourly, d1 UTC days, m15 quarter-hours (rows of [tSec, o, h, l, c]).
  function spotCandles(h1, d1, m15, nowMs) {
    // weeks from UTC day bars: the short Sunday bar belongs to the week that follows it
    var W = [], cur = null, wk = null;
    d1.forEach(function (r) {
      var k = Math.floor((r[0] + 86400 - 345600) / 604800);
      if (k !== wk) { wk = k; var s = k * 604800 + 345600 - 86400; cur = [s * 1000, r[1], r[2], r[3], r[4], 0, (s + 604800) * 1000 - 1]; W.push(cur); }
      else { if (r[2] > cur[2]) cur[2] = r[2]; if (r[3] < cur[3]) cur[3] = r[3]; cur[4] = r[4]; }
    });
    // a week is finished once Friday's close (17:00 New York) has passed
    while (W.length && nowMs < fridayClose(W[W.length - 1][0] / 1000 + 86400) * 1000) W.pop();
    var K = { W: W, D: build(h1, "D", 3600, nowMs), "4H": build(h1, "4H", 3600, nowMs), "1H": build(h1, "1H", 3600, nowMs), "15M": build(m15, "15M", 900, nowMs) };
    if (K["15M"].length < 100 || K.D.length < 100) throw new Error("spot feed: too few candles");
    var last = K["15M"][K["15M"].length - 1];
    return { source: "spot", K: K, price: last[4], priceAt: last[6] + 1, asOf: nowMs, gap: null, warn: null };
  }
  // ---------- finished bars kept in this browser (IndexedDB) ----------
  // Old bars do not change, so a visit asks the feed only for the bars since the newest one held, with an overlap: about
  // 250 rows instead of 17,000 for gold and 250 instead of 8,700 for each forex pair. The whole history is downloaded
  // the first time, once a week, and whenever a finished bar in the overlap comes back at another price. Without
  // storage (private window, blocked) every visit simply downloads it all, as it did before.
  var FULL_EVERY = 7 * 86400000, dbOpen = null;
  function waitAtMost(start) {                                                   // a browser whose storage hangs must not hold the page up
    return new Promise(function (ok) { var t = setTimeout(function () { ok(null); }, 1500); try { start(function (v) { clearTimeout(t); ok(v); }); } catch (e) { clearTimeout(t); ok(null); } });
  }
  function db() {
    return dbOpen || (dbOpen = waitAtMost(function (ok) {
      var q = indexedDB.open("xau-feed", 1);
      q.onupgradeneeded = function () { q.result.createObjectStore("bars"); };
      q.onsuccess = function () { ok(q.result); }; q.onerror = q.onblocked = function () { ok(null); };
    }));
  }
  function pack(rows) { var a = new Float64Array(rows.length * 5), i = 0; rows.forEach(function (r) { a[i++] = r[0]; a[i++] = r[1]; a[i++] = r[2]; a[i++] = r[3]; a[i++] = r[4]; }); return a; }
  function unpack(a) { var o = new Array(a.length / 5); for (var i = 0, j = 0; i < a.length; i += 5, j++) o[j] = [a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4]]; return o; }
  function recall(key) {
    return db().then(function (d) {
      return !d ? null : waitAtMost(function (ok) {
        var q = d.transaction("bars").objectStore("bars").get(key);
        q.onsuccess = function () { var v = q.result; ok(v && v.h1 && v.d1 && v.m15 ? { h1: unpack(v.h1), d1: unpack(v.d1), m15: unpack(v.m15), at: v.at, got: v.got || v.at } : null); }; q.onerror = function () { ok(null); };
      });
    });
  }
  function remember(key, c) { db().then(function (d) { if (d) try { d.transaction("bars", "readwrite").objectStore("bars").put({ h1: pack(c.h1), d1: pack(c.d1), m15: pack(c.m15), at: c.at, got: c.got }, key); } catch (e) {} }); }
  // A bar that had finished when it was last read and now comes back at another price means the history changed: the
  // held copy is not to be trusted. A bar still forming at that read (today's daily bar, say) is expected to differ.
  function changed(old, add, step, gotMs) {
    var m = {}, i, o, tail = old.slice(-(add.length + 5)), upto = gotMs / 1000 - 1800 - step;
    for (i = 0; i < tail.length; i++) m[tail[i][0]] = tail[i];
    for (i = 0; i < add.length; i++) { o = m[add[i][0]]; if (o && add[i][0] < upto && Math.abs(add[i][4] - o[4]) > o[4] * 0.0001) return true; }
    return false;
  }
  // one instrument's bars: what the browser holds, then what the feed has added since
  function loadBars(c, name, need, minFull, inst, nowMs) {
    var key = name + ":" + need.h1, ready = c.read ? Promise.resolve() : recall(key).then(function (s) {
      c.read = true; if (s && !c.h1 && s.h1.length >= minFull && s.m15.length >= 200) { c.h1 = s.h1; c.d1 = s.d1; c.m15 = s.m15; c.at = s.at; c.got = s.got; }
    });
    return ready.then(function () {
      var full = !c.h1 || nowMs - c.at > FULL_EVERY, nowSec = nowMs / 1000;
      var since = function (rows, step, more, keep) { return Math.min(keep, Math.ceil((nowSec - rows[rows.length - 1][0]) / step) + more); };    // the gap since the newest bar held, and an overlap
      var nH = full ? need.h1 : since(c.h1, 3600, 48, need.h1), nD = full ? need.d1 : since(c.d1, 86400, 12, need.d1), nM = full ? need.m15 : since(c.m15, 900, 96, need.m15);
      return Promise.all([duk("1HOUR", nH, nH > 1000 ? 25000 : 12000, inst), duk("1DAY", nD, 15000, inst), duk("15MIN", nM, 15000, inst)]).then(function (res) {
        if (res[0].length < (full ? minFull : 2) || res[2].length < (full ? 200 : 2)) throw new Error(name + (window.LANG === "en" ? ": too little data" : "：数据太少"));
        if (!full && (changed(c.h1, res[0], 3600, c.got) || changed(c.d1, res[1], 86400, c.got) || changed(c.m15, res[2], 900, c.got))) { c.h1 = null; return loadBars(c, name, need, minFull, inst, nowMs); }
        c.h1 = merge(full ? null : c.h1, res[0], need.h1); c.d1 = merge(full ? null : c.d1, res[1], need.d1); c.m15 = merge(full ? null : c.m15, res[2], need.m15);
        if (full) c.at = nowMs;
        c.got = nowMs; remember(key, c);
        return spotCandles(c.h1, c.d1, c.m15, nowMs);
      });
    });
  }
  var cache = { h1: null, d1: null, m15: null, at: 0 }, spotFails = 0;
  // true when this browser holds gold's candles and they do not need the weekly full download yet: then a load asks
  // the feed only for the bars since (the home page uses this to work out the answer live without a heavy first visit)
  function hasCache() { return recall("XAU/USD:" + NEED.h1).then(function (s) { return !!(s && s.h1.length >= 2000 && Date.now() - s.at < FULL_EVERY - 3600000); }).catch(function () { return false; }); }
  function loadSpot(nowMs) { return loadBars(cache, "XAU/USD", NEED, 2000, undefined, nowMs); }

  // ---------- source 2: PAXG on Binance, moved onto the spot price ----------
  function getJson(url) {                                                        // with a time limit, like the spot feed: a stalled backup must not hold the answer
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 20000);
    return fetch(url, { cache: "no-store", signal: ctl.signal }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) { clearTimeout(timer); return d; }, function (e) { clearTimeout(timer); throw e && e.name === "AbortError" ? new Error(window.LANG === "en" ? "the backup feed did not answer in 20 s" : "备用行情 20 秒没有回应") : e; });
  }
  function spotNow() { return getJson(SPOT).then(function (d) { var p = d && +d.price; return isFinite(p) && p > 0 ? p : null; }).catch(function () { return null; }); }
  // Candles from Binance klines (4h and 1d asked for in broker time), shifted by the gap to the spot quote.
  function paxgCandles(m15, h1, h4, d1, spot, nowMs, why) {
    var lastPx = +m15[m15.length - 1][4], gap = spot !== null && Math.abs(spot - lastPx) < 80 && !closed(nowMs / 1000) ? spot - lastPx : null;
    var g = gap === null ? 0 : gap;
    var conv = function (rows, daily) {
      return rows.filter(function (k) { return k[6] < nowMs; }).filter(function (k) {
        if (!daily) return !(closed(k[0] / 1000) && closed(k[6] / 1000));          // keep a candle if any part of it was tradable
        var wd = new Date(k[0] + serverOff(k[0] / 1000) * 1000).getUTCDay(); return wd !== 0 && wd !== 6;          // server Saturday and Sunday: weekend
      }).map(function (k) { return [k[0], +k[1] + g, +k[2] + g, +k[3] + g, +k[4] + g, 0, k[6]]; });
    };
    var D = conv(d1, true), W = [], cur = null, wk = null;
    D.forEach(function (k) {
      var s = bucket(k[0] / 1000, "W");
      if (s !== wk) { wk = s; cur = [s * 1000, k[1], k[2], k[3], k[4], 0, (s + 604800) * 1000 - 1]; W.push(cur); }
      else { if (k[2] > cur[2]) cur[2] = k[2]; if (k[3] < cur[3]) cur[3] = k[3]; cur[4] = k[4]; }
    });
    while (W.length && nowMs < (W[W.length - 1][0] / 1000 + 5 * 86400) * 1000) W.pop();   // server Friday midnight = Friday's close
    return { source: "paxg", K: { W: W, D: D, "4H": conv(h4), "1H": conv(h1), "15M": conv(m15) }, price: lastPx + g, priceAt: nowMs, asOf: nowMs, gap: gap,
      warn: window.LANG === "en" ? (why ? "The spot feed cannot be reached right now; " : "") + "using the PAXG token's prices" + (gap === null ? " (not matched to spot)" : "") + ": levels may differ from your platform by a few dollars"
        : (why ? "现货数据源暂时连不上，" : "") + "改用 PAXG 代币行情" + (gap === null ? "（未能校准到现货价）" : "") + "：价位可能和你的平台差几美元" };
  }
  function loadPaxg(nowMs, why) {
    var tz = serverOff(nowMs / 1000) / 3600;
    var q = function (iv, lim, zone) { return getJson(BIN + "&interval=" + iv + "&limit=" + lim + (zone ? "&timeZone=" + tz : "")); };
    return Promise.all([q("15m", 800), q("1h", 800), q("4h", 800, true), q("1d", 1000, true), spotNow()]).then(function (res) { return paxgCandles(res[0], res[1], res[2], res[3], res[4], nowMs, why); });
  }

  // ---------- any other Dukascopy instrument (the forex page) ----------
  // Same feed, same broker-day candles; a lighter history (250 broker days of hourly bars is plenty for the trends)
  // and its own bars per instrument, kept in the browser like gold's.
  var NEED_FX = { h1: 6000, d1: 1900, m15: 820 }, caches = {};
  function loadInst(inst) { return loadBars(caches[inst] || (caches[inst] = { h1: null, d1: null, m15: null, at: 0 }), inst, NEED_FX, 1500, inst, Date.now()); }

  // Daily bars (UTC days) of any instrument, for the daily trend page: rows of [tSec, o, h, l, c], oldest first.
  function daily(inst, limit) { return duk("1DAY", limit || 420, 20000, inst); }

  function load(opts) {
    opts = opts || {}; var nowMs = Date.now();
    if (opts.source === "paxg") return loadPaxg(nowMs, null);
    // a feed that keeps refusing is left alone: 15 minutes after three failures in a row, an hour after six
    if (spotFails >= 3 && nowMs - cache.failAt < (spotFails >= 6 ? 60 : 15) * 60000) return loadPaxg(nowMs, "spot");
    return loadSpot(nowMs).then(function (f) { spotFails = 0; return f; }, function (e) {
      spotFails++; cache.failAt = nowMs;                                           // the candles already held stay: the next try only asks for the newest ones
      if (opts.source === "spot") throw e;
      return loadPaxg(nowMs, "spot");
    });
  }
  // the last n finished 1-minute spot bars, rows of [tSec, o, h, l, c]: for the candle still forming, and as a
  // second opinion on the live price
  function minutes(n) { return duk("1MIN", n || 20, 8000); }

  return { load: load, hasCache: hasCache, loadInst: loadInst, daily: daily, minutes: minutes, closed: closed, serverOff: serverOff, usDst: usDst, bucket: bucket, build: build, DUR: DUR,
    spotCandles: spotCandles, paxgCandles: paxgCandles, clean: clean, NEED: NEED, DUK: DUK, BIN: BIN, SPOT: SPOT };   // the pure parts, for scripts/update_gold.js
})();
if (typeof module !== "undefined" && module.exports) module.exports = XauFeed;
