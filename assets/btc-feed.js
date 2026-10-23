// Bitcoin candles for btc.html, in the shape assets/xau-feed.js gives the gold page, so the same engine
// (assets/xau-engine.js) and rule (assets/xau-plan.js) read them unchanged.
// Source: Binance BTC/USDT (data-api.binance.vision, the public market-data host, CORS open). Bitcoin trades around
// the clock, so candles are Binance's own: days from 00:00 UTC (08:00 SGT), weeks from Monday 00:00 UTC, nothing
// removed for weekends. The replay behind btc.html (research/xau-replay/report_btc.js) cut them the same way.
// Candle rows: [openMs, open, high, low, close, volume, closeMs], finished candles only.
var BtcFeed = (function () {
  "use strict";
  var API = "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT";
  var DUR = { "15M": 900, "1H": 3600, "4H": 14400, D: 86400, W: 604800 };
  var IV = { "15M": "15m", "1H": "1h", "4H": "4h", D: "1d", W: "1w" };
  var LIM = { W: 400, D: 700, "4H": 900, "1H": 900, "15M": 900 };           // a little over what the engine reads
  var cache = null;
  function kl(iv, limit) {
    return fetch(API + "&interval=" + iv + "&limit=" + limit, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("币安行情 " + r.status); return r.json();
    });
  }
  function done(rows, nowMs) {
    return (rows || []).filter(function (x) { return x[6] < nowMs; }).map(function (x) { return [x[0], +x[1], +x[2], +x[3], +x[4], +x[5], x[6]]; });
  }
  function load() {
    var nowMs = Date.now(), tfs = Object.keys(IV);
    return Promise.all(tfs.map(function (tf) { return kl(IV[tf], LIM[tf]); })).then(function (res) {
      var K = {}; tfs.forEach(function (tf, i) { K[tf] = done(res[i], nowMs); });
      var m = K["15M"], last = m[m.length - 1];
      if (!last) throw new Error("币安没有返回 K 线");
      cache = { source: "spot", K: K, price: last[4], priceTime: last[6] + 1, warn: null, at: nowMs };
      return cache;
    }, function (e) {
      if (cache && nowMs - cache.at < 3 * 3600000) { cache.warn = "币安暂时连不上，显示的是 " + new Date(cache.at + 8 * 3600000).toISOString().slice(11, 16) + " SGT 的数据"; return cache; }   // keep the last good answer for a while
      throw e;
    });
  }
  // the last finished one-minute bars, rows [tSec, o, h, l, c]
  function minutes(n) {
    n = n || 20;
    return kl("1m", n + 1).then(function (k) { return done(k, Date.now()).slice(-n).map(function (x) { return [Math.round(x[0] / 1000), x[1], x[2], x[3], x[4]]; }); });
  }
  function closed() { return false; }                                           // never shut
  function serverOff() { return 0; }
  function bucket(tSec, tf) { var d = DUR[tf]; return tf === "W" ? Math.floor((tSec - 345600) / 604800) * 604800 + 345600 : Math.floor(tSec / d) * d; }
  // How the verdict describes a signal, from Bitcoin's own replay (data/btc-backtest.json), for XauPlan.setMarket().
  function replayWords(bt) {
    var m = bt && bt.rules && bt.rules.go3r; if (!m) return null;
    var sg = function (v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + "R"; }, seg = (m.segments || []).filter(function (x) { return x.n; });
    var clear = m.lo > 0;                                                       // the whole range of the estimate above zero
    return {
      goText: clear ? "比特币回放里，这个信号平均每笔 " + sg(m.avgR) + "。"
        : "比特币回放里这个信号的优势不明显：平均每笔 " + sg(m.avgR) + "，分段看 " + seg.map(function (x) { return x.label + " " + sg(x.avgR); }).join("、") + "。把它当参考，不要当成有把握的信号。",
      shortWarn: m.short && m.short.avgR < 0 ? "做空信号在回放里整体是亏的（平均每笔 " + sg(m.short.avgR) + "）。" : "",
      longWarn: m.long && m.long.avgR > m.avgR ? "做多信号好一些（平均每笔 " + sg(m.long.avgR) + "）。" : "",
      streak: m.streak,
      noneText: "比特币回放里，逆着三个大周期做是长期亏损的" + (bt.rules.against ? "（平均每笔 " + sg(bt.rules.against.avgR) + "）" : "") + "；顺着做的优势" + (clear ? "也比黄金弱" : "也不明显") + "。"
    };
  }
  return { load: load, minutes: minutes, closed: closed, serverOff: serverOff, bucket: bucket, DUR: DUR, API: API, replayWords: replayWords };
})();
if (typeof module !== "undefined" && module.exports) module.exports = BtcFeed;
