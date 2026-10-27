// trend.html: daily trend-following across many markets, the strategy family with the broadest evidence in this
// project (research/trend-daily: 31 markets since 1971; Sharpe about 0.9 over all years, about 0.4 since 2010 and not
// yet significant there). Three textbook rules on daily closes, nothing tuned:
//   动量  12-month momentum: at each month's last close, the side of the last 252 days' move
//   突破  55/20 breakout: in on a 55-day high / low close, out on a 20-day low / high close
//   均线  the 50-day average against the 200-day
// The combined position is their average (−1 … +1 in thirds). Each market is sized to the same daily risk.
// Daily bars: Dukascopy (UTC days) for currencies, metals, oil and the Nasdaq, read by the page as a script like the
// gold page does; Binance for Bitcoin and Ethereum. Decisions use closed days only; the day still forming gives the
// price shown. Alerts fire when a market's combined position changes, while the page is open.
(function () {
  "use strict";
  var MKTS = [
    { i: "EUR/USD", n: "欧元 / 美元", d: 5, fx: "base" }, { i: "GBP/USD", n: "英镑 / 美元", d: 5, fx: "base" }, { i: "USD/JPY", n: "美元 / 日元", d: 3, fx: "usd" },
    { i: "AUD/USD", n: "澳元 / 美元", d: 5, fx: "base" }, { i: "NZD/USD", n: "纽元 / 美元", d: 5, fx: "base" }, { i: "USD/CAD", n: "美元 / 加元", d: 5, fx: "usd" },
    { i: "USD/CHF", n: "美元 / 瑞郎", d: 5, fx: "usd" }, { i: "USD/SEK", n: "美元 / 瑞典克朗", d: 4, fx: "usd" }, { i: "USD/NOK", n: "美元 / 挪威克朗", d: 4, fx: "usd" },
    { i: "USD/MXN", n: "美元 / 墨西哥比索", d: 4, fx: "usd" }, { i: "USD/ZAR", n: "美元 / 南非兰特", d: 4, fx: "usd" }, { i: "USD/SGD", n: "美元 / 新加坡元", d: 5, fx: "usd" },
    { i: "XAU/USD", n: "黄金", d: 2, oz: 100 }, { i: "XAG/USD", n: "白银", d: 3, oz: 5000 },
    { i: "LIGHT.CMD/USD", n: "WTI 原油", d: 2, label: "WTI" }, { i: "BRENT.CMD/USD", n: "布伦特原油", d: 2, label: "Brent" },
    { i: "USATECH.IDX/USD", n: "纳斯达克 100", d: 1, label: "Nasdaq 100" },
    { i: "BTCUSDT", n: "比特币", d: 0, label: "BTC", bin: true }, { i: "ETHUSDT", n: "以太坊", d: 1, label: "ETH", bin: true }
  ];
  var F = window.XauFeed, $ = function (id) { return document.getElementById(id); }, DAY = 86400;
  var ls = { get: function (k, d) { try { var v = localStorage.getItem("trend." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem("trend." + k, JSON.stringify(v)); } catch (e) {} } };
  var S = { rows: {}, res: {}, busy: false, lastQ: -1, base: null, notify: ls.get("notify", true), acct: ls.get("acct", { bal: 10000, risk: 0.15 }) };
  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) { var v = attrs[k]; if (v === null || v === undefined || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  var fmt = function (m, v) { return typeof v === "number" && isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: m.d, maximumFractionDigits: m.d }) : "—"; };
  var date = function (t) { var d = new Date(t * 1000); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate(); };

  // ---------- daily bars ----------
  function binance(sym, limit) {
    return fetch("https://data-api.binance.vision/api/v3/klines?symbol=" + sym + "&interval=1d&limit=" + limit, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("币安 " + r.status); return r.json(); })
      .then(function (rows) { return rows.map(function (x) { return [Math.round(x[0] / 1000), +x[1], +x[2], +x[3], +x[4]]; }); });
  }
  function load(m) {
    var have = S.rows[m.i], limit = have ? 4 : 420;                               // after the first load, only the newest days
    return (m.bin ? binance(m.i, limit) : F.daily(m.i, limit)).then(function (rows) {
      if (!rows.length) throw new Error("没有返回数据");
      var map = {}; (have || []).concat(rows).forEach(function (r) { map[r[0]] = r; });
      S.rows[m.i] = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return a[0] - b[0]; }).slice(-450);
      return S.rows[m.i];
    });
  }

  // ---------- the three rules over the closed days ----------
  function analyse(m, rows) {
    var now = Date.now() / 1000, last = rows[rows.length - 1], forming = last[0] + DAY > now;
    var days = forming ? rows.slice(0, -1) : rows, c = days.map(function (r) { return r[4]; }), t = days.map(function (r) { return r[0]; }), n = c.length;
    if (n < 260) return { m: m, state: "err", err: "历史不够（" + n + " 天）" };
    var ret = c.map(function (v, i) { return i ? v / c[i - 1] - 1 : 0; });
    // state of each rule after each closed day (from day 252, when all three can speak)
    var mom = 0, br = 0, out = [];
    for (var i = 252; i < n; i++) {
      var monthEnd = i === n - 1 ? new Date((t[i] + DAY) * 1000).getUTCDate() === 1 || new Date((t[i] + DAY) * 1000).getUTCMonth() !== new Date(t[i] * 1000).getUTCMonth() : new Date(t[i + 1] * 1000).getUTCMonth() !== new Date(t[i] * 1000).getUTCMonth();
      if (monthEnd || i === 252) mom = Math.sign(c[i] / c[i - 252] - 1);
      var hi55 = -Infinity, lo55 = Infinity, hi20 = -Infinity, lo20 = Infinity, k;
      for (k = i - 55; k < i; k++) { if (c[k] > hi55) hi55 = c[k]; if (c[k] < lo55) lo55 = c[k]; }
      for (k = i - 20; k < i; k++) { if (c[k] > hi20) hi20 = c[k]; if (c[k] < lo20) lo20 = c[k]; }
      if (br > 0 && c[i] < lo20) br = 0; else if (br < 0 && c[i] > hi20) br = 0;
      if (br === 0) br = c[i] > hi55 ? 1 : c[i] < lo55 ? -1 : 0;
      var s50 = 0, s200 = 0; for (k = i - 49; k <= i; k++) s50 += c[k]; for (k = i - 199; k <= i; k++) s200 += c[k];
      var ma = Math.sign(s50 / 50 - s200 / 200);
      out.push({ t: t[i], mom: mom, br: br, ma: ma, sum: mom + br + ma, hi55: hi55, lo55: lo55, hi20: hi20, lo20: lo20 });
    }
    var now0 = out[out.length - 1], since = now0.t;
    for (var j = out.length - 2; j >= 0 && out[j].sum === now0.sum; j--) since = out[j].t;
    var v = 0, s = 0; for (k = n - 63; k < n; k++) { s += ret[k]; v += ret[k] * ret[k]; }
    var vol = Math.sqrt(Math.max(v / 63 - (s / 63) * (s / 63), 0));
    return { m: m, state: now0.sum > 0 ? "long" : now0.sum < 0 ? "short" : "flat", sum: now0.sum, mom: now0.mom, br: now0.br, ma: now0.ma, since: since + DAY,
      price: forming ? last[4] : c[n - 1], close: c[n - 1], closeT: t[n - 1] + DAY, vol: vol, hi55: now0.hi55, lo55: now0.lo55, hi20: now0.hi20, lo20: now0.lo20 };
  }

  // ---------- page ----------
  function strength(sum) { var a = Math.abs(sum); return sum === 0 ? "平" : (sum > 0 ? "多 " : "空 ") + a + "/3"; }
  function size(r) {
    // the same daily risk in every market: notional = balance × risk% ÷ daily volatility × how many of the three agree
    var a = S.acct, notional = r.vol > 0 ? a.bal * a.risk / 100 / r.vol * Math.abs(r.sum) / 3 : 0, m = r.m, lots = null;
    if (m.fx === "base") lots = notional / (100000 * r.price); else if (m.fx === "usd") lots = notional / 100000; else if (m.oz) lots = notional / (m.oz * r.price);
    return { notional: notional, lots: lots };
  }
  function render() {
    var list = MKTS.map(function (m) { return S.res[m.i] || { m: m, state: "load" }; }), cnt = { long: 0, short: 0, flat: 0 };
    list.forEach(function (r) { if (cnt[r.state] !== undefined) cnt[r.state]++; });
    $("tr-sum").textContent = "做多 " + cnt.long + " · 做空 " + cnt.short + " · 空仓 " + cnt.flat;
    var box = $("tr-list"); while (box.firstChild) box.removeChild(box.firstChild);
    list.slice().sort(function (a, b) { return Math.abs(b.sum || 0) - Math.abs(a.sum || 0); }).forEach(function (r) { box.appendChild(card(r)); });
  }
  function card(r) {
    var m = r.m, el = h("div", { class: "tr-c " + r.state });
    el.appendChild(h("div", { class: "tr-top" }, [h("div", null, [h("b", { class: "tr-i", text: m.label || m.i }), h("span", { class: "tr-n", text: m.n })]), h("div", { class: "tr-p" }, [h("b", { class: "mono", text: fmt(m, r.price) })])]));
    if (r.state === "load" || r.state === "err") { el.appendChild(h("p", { class: "tr-l", text: r.state === "err" ? "读取失败：" + (r.err || "") : "读取中…" })); return el; }
    var rule = function (name, v, why) { return h("span", { class: "tr-r " + (v > 0 ? "up" : v < 0 ? "dn" : ""), title: why }, [h("i", { text: name }), h("b", { text: v > 0 ? "多" : v < 0 ? "空" : "平" })]); };
    el.appendChild(h("div", { class: "tr-mid" }, [h("div", { class: "tr-rs" }, [rule("动量", r.mom, "12 个月动量，按月底收盘"), rule("突破", r.br, "55 天突破进，20 天反向离场"), rule("均线", r.ma, "50 日均线对 200 日均线")]),
      h("span", { class: "tr-chip " + r.state, text: strength(r.sum) })]));
    var z = size(r), act = r.sum > 0 ? "持有多单" : r.sum < 0 ? "持有空单" : "不持仓";
    el.appendChild(h("p", { class: "tr-l", text: act + (r.sum ? "（" + Math.abs(r.sum) + " 条规则同意）" : "") + "，自 " + date(r.since) + " 起。" +
      (r.sum ? "按你的账户：名义金额约 $" + Math.round(z.notional).toLocaleString("en-US") + (z.lots !== null ? "，约 " + z.lots.toFixed(2) + " 手" + (z.lots < 0.01 ? "（低于最小 0.01 手：这个账户做不了这个市场，跳过）" : "") : "") + "。" : "") }));
    var nxt = r.br > 0 ? "突破规则：收盘跌破 " + fmt(m, r.lo20) + "（20 天低点）就离场" : r.br < 0 ? "突破规则：收盘站上 " + fmt(m, r.hi20) + "（20 天高点）就离场" : "突破规则：收盘站上 " + fmt(m, r.hi55) + " 做多，跌破 " + fmt(m, r.lo55) + " 做空";
    el.appendChild(h("p", { class: "tr-f", text: nxt + " · 每天波动约 " + (r.vol * 100).toFixed(2) + "% · 按 " + date(r.closeT - DAY) + " 收盘" }));
    return el;
  }

  // ---------- refresh: all markets on load, then the newest days every 15 minutes ----------
  function scan() {
    if (S.busy) return; S.busy = true; S.lastQ = Math.floor(Date.now() / 900000);
    $("tr-stamp").textContent = "正在读取 " + MKTS.length + " 个市场…";
    var queue = MKTS.slice(), running = 0;
    return new Promise(function (done) {
      function next() {
        if (!queue.length) { if (!running) done(); return; }
        var m = queue.shift(); running++;
        load(m).then(function (rows) { S.res[m.i] = analyse(m, rows); }, function (e) { if (!S.res[m.i] || S.res[m.i].state === "load") S.res[m.i] = { m: m, state: "err", err: e && e.message ? e.message : "无响应" }; })
          .then(function () { running--; render(); next(); });
      }
      next(); next(); next();
    }).then(function () { S.busy = false; var d = new Date(Date.now() + 8 * 3600000); $("tr-stamp").textContent = "更新于 " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2) + " SGT · 仓位按每天收盘（UTC 0 点 = 新加坡早上 8 点）重算 · 价格每 15 分钟更新"; alerts(); });
  }
  function alerts() {
    var now = {}; MKTS.forEach(function (m) { var r = S.res[m.i]; if (r && r.sum !== undefined) now[m.i] = r.sum; });
    if (S.base === null) { S.base = now; return; }
    MKTS.forEach(function (m) {
      if (now[m.i] === undefined || S.base[m.i] === undefined || now[m.i] === S.base[m.i]) return;
      var from = S.base[m.i], to = now[m.i], r = S.res[m.i]; S.base[m.i] = to;
      var sent = ls.get("sent", {}), key = to + ":" + r.closeT; if (sent[m.i] === key) return; sent[m.i] = key; ls.set("sent", sent);
      if (!S.notify || !("Notification" in window) || Notification.permission !== "granted") return;
      try { new Notification("📊 " + (m.label || m.i) + " · 日线趋势 " + strength(from) + " → " + strength(to), { body: (to > 0 ? "做多" : to < 0 ? "做空" : "离场") + "：" + (m.n) + " 收盘 " + fmt(m, r.close) + "。打开看仓位大小。", tag: "trend-" + m.i, renotify: true }); } catch (e) {}
    });
  }
  // ---------- controls ----------
  function renderAlert() {
    var b = $("tr-alert"), ok = "Notification" in window && Notification.permission === "granted";
    b.textContent = S.notify ? (ok ? "🔔 仓位变化提醒：开" : "🔔 提醒已开，点一下允许浏览器通知") : "🔕 仓位变化提醒：关";
    b.className = "btn sm " + (S.notify ? "on" : "");
  }
  $("tr-alert").addEventListener("click", function () {
    if (S.notify && "Notification" in window && Notification.permission === "default") { Notification.requestPermission().then(renderAlert); return; }
    S.notify = !S.notify; ls.set("notify", S.notify); if (S.notify && "Notification" in window && Notification.permission === "default") Notification.requestPermission().then(renderAlert); renderAlert();
  });
  ["bal", "risk"].forEach(function (k) {
    var inp = $("tr-" + k); inp.value = S.acct[k];
    inp.addEventListener("input", function () { var v = parseFloat(inp.value); if (isFinite(v) && v > 0) { S.acct[k] = v; ls.set("acct", S.acct); render(); } });
  });
  $("tr-refresh").addEventListener("click", scan);
  // the replay behind the page, from its own results file
  fetch("research/trend-daily/result.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.strategies) return; var s = d.strategies, c = s.combined || {};
    $("tr-proof").textContent = "回放（" + d.from + "–2026，" + d.markets + " 个市场，含成本）：三条规则一起用，夏普 " + c.sharpe + "（2010 年前 " + c.pre + "，2010 年起 " + c.post + "，" + (c.postP < 0.05 ? "有统计上的把握" : c.postP < 0.1 ? "还差一点达到统计上的把握" : "还没有统计上的把握") + "），最深回撤约 " + c.worst + "%。单条规则：动量 " + s.TSMOM.sharpe + "、突破 " + s.DONCH.sharpe + "、均线 " + s.MAX.sharpe + "；" + s.DONCH.positive + " / " + s.DONCH.markets + " 个市场是赚的。";
  }).catch(function () {});
  if (S.notify && "Notification" in window && Notification.permission === "default") document.addEventListener("click", function once() { document.removeEventListener("click", once); Notification.requestPermission().then(renderAlert); });
  renderAlert(); render(); scan();
  setInterval(function () { var q = Math.floor(Date.now() / 900000); if (q !== S.lastQ && (document.visibilityState === "visible" || S.notify)) scan(); }, 30000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && Math.floor(Date.now() / 900000) !== S.lastQ) scan(); });
})();
