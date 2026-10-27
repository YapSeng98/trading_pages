// forex.html: the five-timeframe rule run on the major currency pairs and silver, in the visitor's browser.
// The rule was chosen and replayed on gold only. It could not be replayed on forex (the only free intraday history,
// Dukascopy's chart feed, turns away automated downloads) and it did not hold on seven other cryptocurrencies
// (research/xau-replay/cross_check.js), so this page is a trend map with the rule's prices, labelled unproven.
// Alerts are off until switched on.
// Prices are scaled to whole points before the engine sees them (EUR/USD 1.08345 -> 108345): the engine rounds to
// two decimals, and the rule itself (structure, ATR multiples) does not care about the scale.
(function () {
  "use strict";
  var PAIRS = [
    { i: "EUR/USD", d: 5, n: "欧元 / 美元" }, { i: "GBP/USD", d: 5, n: "英镑 / 美元" }, { i: "USD/JPY", d: 3, n: "美元 / 日元" },
    { i: "AUD/USD", d: 5, n: "澳元 / 美元" }, { i: "NZD/USD", d: 5, n: "纽元 / 美元" }, { i: "USD/CAD", d: 5, n: "美元 / 加元" },
    { i: "USD/CHF", d: 5, n: "美元 / 瑞郎" }, { i: "EUR/JPY", d: 3, n: "欧元 / 日元" }, { i: "GBP/JPY", d: 3, n: "英镑 / 日元" },
    { i: "AUD/JPY", d: 3, n: "澳元 / 日元" }, { i: "EUR/GBP", d: 5, n: "欧元 / 英镑" }, { i: "XAG/USD", d: 3, n: "白银", metal: true }
  ];
  var P = XauPlan, F = XauFeed, $ = function (id) { return document.getElementById(id); };
  var TFS = ["W", "D", "4H", "1H", "15M"], TFN = { W: "周线", D: "日线", "4H": "4小时", "1H": "1小时", "15M": "15分钟" };
  var LSK = "fx.", ls = { get: function (k, d) { try { var v = localStorage.getItem(LSK + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(LSK + k, JSON.stringify(v)); } catch (e) {} } };
  var S = { res: {}, busy: false, lastQ: -1, notify: !!ls.get("notify", false), base: null };
  // the forex words: never gold's replay
  P.setMarket({ goText: "外汇上这个规则没有回放验证，只作趋势参考。", observe: true, health: null, noneText: "", lateText: "", patNote: "", patAgainst: "", shortText: "" });
  XAU_TFS.forEach(function (c) { c.bars = c.tf === "15M" ? 96 : 0; });

  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) { var v = attrs[k]; if (v === null || v === undefined || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function sgt(ms) { var d = new Date(ms + 8 * 3600000); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2); }
  function ago(ms) { var m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 60 ? m + " 分钟前" : m < 2880 ? Math.round(m / 60) + " 小时前" : Math.round(m / 1440) + " 天前"; }
  function px(p, v) { return typeof v === "number" && isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: p.d, maximumFractionDigits: p.d }) : "—"; }
  function pips(p, dist) { var pip = p.metal ? 0.01 : p.d === 3 ? 0.01 : 0.0001; return Math.round(dist / pip) + (p.metal ? " 美分" : " 点"); }

  // ---------- one pair ----------
  function analyse(p, feed) {
    var k = Math.pow(10, p.d), sc = function (rows) { return rows.map(function (r) { return [r[0], r[1] * k, r[2] * k, r[3] * k, r[4] * k, 0, r[6]]; }); }, K = {};
    TFS.forEach(function (tf) { K[tf] = sc(feed.K[tf] || []); });
    var E = runXauEngine({ source: "spot", K: K, price: feed.price * k, priceAt: feed.priceAt }, Date.now()), R = P.regime(E), un = function (v) { return typeof v === "number" ? v / k : null; };
    var out = { p: p, price: feed.price, at: feed.priceAt, dirs: R.dirs, dir: R.dir, full: R.full, lean: R.lean, odd: R.odd, since3: R.since3, since5: R.since5 };
    var D = K.D, prev = D.length ? D[D.length - 1][4] / k : null; out.chg = prev ? (feed.price / prev - 1) * 100 : null;
    var H1 = E.tfs["1H"] || {}; out.atr = un(H1.atr);
    if (R.dir) {
      var plan = P.systemPlan(E, R.dir); out.plan = plan ? { entry: un(plan.entry), stop: un(plan.stop), tp1: un(plan.tp1), dist: un(plan.dist), trail: un(plan.trailDist) } : null;
      out.lag = R.lagging.map(function (tf) { return { tf: tf, price: un(P.flipLevel(E, tf, R.dir)) }; });
      out.flipOut = un(P.flipLevel(E, "4H", -R.dir));                           // the 4-hour close that would end it
      if (R.full && R.since5) {                                                  // where price closed when all five came into line
        var bars = (E.tfs["15M"] || {}).bars || [];
        for (var i = bars.length - 1; i >= 0; i--) { var end = (bars[i][0] + 900) * 1000; if (end === R.since5) { out.sigPx = bars[i][4] / k; break; } if (end < R.since5) break; }
        if (out.sigPx && out.plan) out.movedR = (out.price - out.sigPx) * R.dir / out.plan.dist;
      }
    } else {
      // the nearest way the big three could line up: the closes still needed, each way
      out.paths = [1, -1].map(function (to) {
        var need = ["W", "D", "4H"].filter(function (tf) { return R.dirs[tf] !== to; }), steps = need.map(function (tf) { return { tf: tf, price: un(P.flipLevel(E, tf, to)) }; });
        return { to: to, steps: steps, ok: steps.every(function (s) { return s.price !== null; }), far: steps.reduce(function (m, s) { return s.price === null ? m : Math.max(m, Math.abs(s.price - feed.price)); }, 0) };
      }).filter(function (w) { return w.ok && w.steps.length; }).sort(function (a, b) { return a.far - b.far; });
    }
    out.state = R.full ? (R.dir > 0 ? "buy" : "sell") : R.dir ? "ready" : "none";
    return out;
  }

  // ---------- page ----------
  var ORDER = { buy: 0, sell: 0, ready: 1, none: 2, err: 3 };
  function render() {
    var list = PAIRS.map(function (p) { return S.res[p.i] || { p: p, state: "load" }; });
    var n = { buy: 0, sell: 0, ready: 0, none: 0 }; list.forEach(function (r) { if (n[r.state] !== undefined) n[r.state]++; });
    $("fx-sum").textContent = "买入信号 " + n.buy + " · 卖出信号 " + n.sell + " · 等小周期 " + n.ready + " · 方向不一致 " + n.none;
    list.sort(function (a, b) { return (ORDER[a.state] === undefined ? 4 : ORDER[a.state]) - (ORDER[b.state] === undefined ? 4 : ORDER[b.state]) || (b.since5 || 0) - (a.since5 || 0); });
    var strip = $("fx-sig"); while (strip.firstChild) strip.removeChild(strip.firstChild);
    var live = list.filter(function (r) { return r.state === "buy" || r.state === "sell"; });
    strip.hidden = !live.length;
    if (live.length) {
      strip.appendChild(h("b", { text: "现在可以做的：" }));
      live.forEach(function (r) { strip.appendChild(h("a", { class: "fx-s " + r.state, href: "#sig-" + r.p.i.replace("/", ""), text: (r.state === "buy" ? "▲ 买入 " : "▼ 卖出 ") + r.p.i })); });
    }
    var box = $("fx-list"); while (box.firstChild) box.removeChild(box.firstChild);
    list.forEach(function (r) { box.appendChild(card(r)); });
  }
  function arrows(r) {
    return h("div", { class: "fx-tf" }, TFS.map(function (tf) { var v = r.dirs ? r.dirs[tf] : 0; return h("span", { class: v > 0 ? "up" : v < 0 ? "dn" : "", title: TFN[tf] }, [h("i", { text: { W: "周", D: "日", "4H": "4H", "1H": "1H", "15M": "15M" }[tf] }), h("b", { text: v > 0 ? "↑" : v < 0 ? "↓" : "–" })]); }));
  }
  function card(r) {
    var p = r.p, el = h("div", { class: "fx-c " + r.state });
    var chip = { buy: "买入信号（未验证）", sell: "卖出信号（未验证）", ready: r.dir > 0 ? "大方向向上 · 等小周期" : "大方向向下 · 等小周期", none: "方向不一致", err: "读取失败", load: "读取中…" }[r.state];
    el.appendChild(h("div", { class: "fx-top" }, [h("div", null, [h("b", { class: "fx-i", text: p.i }), h("span", { class: "fx-n", text: p.n })]),
      h("div", { class: "fx-p" }, [h("b", { class: "mono", text: px(p, r.price) }), r.chg !== null && r.chg !== undefined ? h("span", { class: "mono " + (r.chg >= 0 ? "up" : "dn"), text: (r.chg >= 0 ? "+" : "") + r.chg.toFixed(2) + "%" }) : null])]));
    if (r.state === "load" || r.state === "err") { el.appendChild(h("p", { class: "fx-l", text: r.state === "err" ? "读取失败：" + (r.err || "") + "，下一次刷新再试。" : "读取中…" })); return el; }
    el.appendChild(h("div", { class: "fx-mid" }, [arrows(r), r.state === "buy" || r.state === "sell" ? null : h("span", { class: "fx-chip " + r.state, text: chip })]));   // a signal says it in its own block below
    var buy = r.dir > 0, act = buy ? "买入" : "卖出", line = "";
    if (r.state === "buy" || r.state === "sell") {
      el.appendChild(action(r)); line = null;
    } else if (r.state === "ready") {
      var got = (r.lag || []).filter(function (g) { return g.price !== null; });
      var trig = got.length ? got.slice().sort(function (a, b) { return (a.price - b.price) * r.dir; })[got.length - 1].price : null;
      line = "等" + got.map(function (g) { return TFN[g.tf] + "收盘" + (buy ? "站上 " : "跌破 ") + px(p, g.price); }).join("、") + " → " + act + "信号。" +
        (trig !== null && r.plan ? "到时约：" + act + " " + px(p, trig) + "，止损 " + px(p, trig - r.dir * r.plan.dist) + "，目标 " + px(p, trig + r.dir * 3 * r.plan.dist) + "。" : "");
    } else {
      var w = (r.paths || [])[0];
      line = "周线" + way(r.dirs.W) + "、日线" + way(r.dirs.D) + "、4 小时" + way(r.dirs["4H"]) + "，不一致。" + (w ? "最近的一步：" + w.steps.map(function (s) { return TFN[s.tf] + "收盘" + (w.to > 0 ? "站上 " : "跌破 ") + px(p, s.price); }).join("、") + " → 三个大周期同向" + way(w.to) + "。" : "");
    }
    if (line) el.appendChild(h("p", { class: "fx-l", text: line }));
    var foot = [];
    if (r.dir && r.since3) foot.push("大方向已持续 " + Math.max(0, Math.round((Date.now() - r.since3) / 86400000)) + " 天");
    if (r.dir && r.flipOut !== null && r.flipOut !== undefined) foot.push("4 小时收盘" + (buy ? "跌破 " : "站上 ") + px(p, r.flipOut) + " 就结束");
    if (r.atr) foot.push("小时波幅 " + pips(p, r.atr));
    foot.push("K 线到 " + sgt(r.at));
    el.appendChild(h("p", { class: "fx-f", text: foot.join(" · ") }));
    return el;
  }
  // A pair you can trade now: which way, the three prices, and a plan to copy into MT5.
  function action(r) {
    var p = r.p, k = r.plan, buy = r.dir > 0, side = buy ? "buy" : "sell";
    var box = h("div", { class: "fx-act " + side, id: "sig-" + p.i.replace("/", "") });
    box.appendChild(h("div", { class: "fx-act-h" }, [h("b", { text: buy ? "▲ 买入" : "▼ 卖出" }), h("span", { text: (buy ? "BUY" : "SELL") + " · 五个周期都" + (buy ? "向上" : "向下") }), h("span", { class: "fx-un", text: "未验证" })]));
    var g = h("div", { class: "fx-act-g" }), tile = function (k1, v, d, cls) { g.appendChild(h("div", { class: cls || "" }, [h("i", { text: k1 }), h("b", { class: "mono", text: v }), h("s", { text: d })])); };
    tile("入场", px(p, k.entry), "现价");
    tile("止损", px(p, k.stop), (buy ? "−" : "+") + pips(p, k.dist), "st");
    tile("目标 3R", px(p, k.tp1), (buy ? "+" : "−") + pips(p, 3 * k.dist), "tg");
    box.appendChild(g);
    box.appendChild(h("p", { text: "或者不设目标：每天 08:00 SGT 把止损挪到入场以来最好价格后面 " + pips(p, k.trail) + "，三个大周期不再同向就离场（大趋势里更能拿住利润）。" }));
    if (r.since5) box.appendChild(h("p", { class: "fx-age", text: "信号 " + ago(r.since5) + "出现" + (r.sigPx ? "（当时 " + px(p, r.sigPx) + "）" : "") + (typeof r.movedR === "number" ? "，之后已走 " + (r.movedR >= 0 ? "+" : "−") + Math.abs(r.movedR).toFixed(1) + "R" : "") + "。上面的止损和目标已按现价重算。" }));
    var plan = p.i + " " + (buy ? "买入" : "卖出") + " · 入场 " + px(p, k.entry) + " · 止损 " + px(p, k.stop) + "（" + pips(p, k.dist) + "）· 目标 " + px(p, k.tp1) + "（3R）· 或跟踪止损 " + pips(p, k.trail) + " · 信号 " + (r.since5 ? sgt(r.since5) + " SGT" : "") + " · 外汇上未经回放验证";
    var btn = h("button", { type: "button", class: "btn sm", text: "复制计划", onclick: function () {
      var done = function () { btn.textContent = "已复制 ✓"; setTimeout(function () { btn.textContent = "复制计划"; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(plan).then(done, function () { window.prompt("复制这段：", plan); }); else window.prompt("复制这段：", plan);
    } });
    box.appendChild(h("div", { class: "fx-act-b" }, [btn]));
    return box;
  }
  function way(d) { return d > 0 ? "向上" : d < 0 ? "向下" : "不明"; }

  // gold and Bitcoin from their own pages' server files, for one view of everything
  function others() {
    var box = $("fx-others"); if (!box) return;
    Promise.all(["data/xau-state.json", "data/btc-state.json"].map(function (u) { return fetch(u, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); })).then(function (st) {
      while (box.firstChild) box.removeChild(box.firstChild);
      [["🥇 黄金", "report.html", st[0], 1, "回放里有优势的规则（小，未完全证明）"], ["₿ 比特币", "btc.html", st[1], 0, "回放里没有证明有效，只作观察"]].forEach(function (x) {
        var s = x[2]; if (!s) return;
        var tfs = (s.timeframes || []).map(function (t) { return (t.name || "").replace(" ", "") + (t.trend === "向上" ? "↑" : t.trend === "向下" ? "↓" : "–"); }).join(" ");
        box.appendChild(h("a", { class: "fx-o", href: x[1] }, [h("b", { text: x[0] }), h("span", { class: "mono", text: (s.price || 0).toLocaleString("en-US", { maximumFractionDigits: x[3] }) }), h("span", { class: "fx-o-v", text: (s.verdict || {}).tag || "" }), h("span", { class: "fx-o-t", text: tfs }), h("span", { class: "fx-o-n", text: x[4] + " →" })]));
      });
    });
  }

  // ---------- loading: two pairs at a time; newest bars only after the first load ----------
  function scan() {
    if (S.busy) return; S.busy = true; S.lastQ = Math.floor((Date.now() - 25000) / 900000);
    $("fx-stamp").textContent = "正在读取 " + PAIRS.length + " 个市场…";
    var queue = PAIRS.slice(), running = 0;
    return new Promise(function (done) {
      function next() {
        if (!queue.length) { if (!running) done(); return; }
        var p = queue.shift(); running++;
        F.loadInst(p.i).then(function (feed) { S.res[p.i] = analyse(p, feed); }, function (e) { S.res[p.i] = Object.assign(S.res[p.i] || { p: p }, { state: "err", err: e && e.message ? e.message : "无响应" }); })
          .then(function () { running--; render(); next(); });
      }
      next(); next();
    }).then(function () {
      S.busy = false; $("fx-stamp").textContent = "按 " + sgt(Date.now() - (Date.now() % 900000)) + " SGT 收盘的 15 分钟 K 线计算 · 每 15 分钟自动重算" + (F.closed(Date.now() / 1000) ? " · 周末休市" : "");
      alerts();
    });
  }

  // ---------- alerts: a new buy / sell signal on any pair, only when switched on ----------
  function alerts() {
    var keys = {}; PAIRS.forEach(function (p) { var r = S.res[p.i]; if (r && (r.state === "buy" || r.state === "sell")) keys[p.i] = r.state + ":" + (r.since5 || ""); });
    if (S.base === null) { S.base = keys; return; }                             // what the page opened with is already on screen
    PAIRS.forEach(function (p) {
      var key = keys[p.i]; if (!key || S.base[p.i] === key) return;
      S.base[p.i] = key;
      var sent = ls.get("sent", {}); if (sent[p.i] === key) return; sent[p.i] = key; ls.set("sent", sent);
      var r = S.res[p.i], k = r.plan, buy = r.dir > 0;
      if (!S.notify || !("Notification" in window) || Notification.permission !== "granted" || !k) return;
      try { new Notification((buy ? "🟢 " : "🔴 ") + p.i + " · " + (buy ? "买入" : "卖出") + "信号（未验证）", { body: (buy ? "买入约 " : "卖出约 ") + px(p, k.entry) + "，止损 " + px(p, k.stop) + "，目标 " + px(p, k.tp1) + "（3R）。外汇上这个规则没有回放验证，只作参考。", tag: "fx-" + p.i, renotify: true }); } catch (e) {}
    });
    Object.keys(S.base).forEach(function (i) { if (!keys[i]) delete S.base[i]; });
  }
  function renderAlert() {
    var b = $("fx-alert"), granted = "Notification" in window && Notification.permission === "granted";
    b.textContent = S.notify ? (granted ? "🔔 外汇信号提醒：开（点一下关闭）" : "🔔 提醒已开，但浏览器还没允许通知：点一下允许") : "🔕 外汇信号提醒：关（点一下打开）";
    b.className = "btn sm " + (S.notify ? "on" : "");
  }
  $("fx-alert").addEventListener("click", function () {
    if (S.notify && "Notification" in window && Notification.permission === "default") { Notification.requestPermission().then(renderAlert); return; }
    S.notify = !S.notify; ls.set("notify", S.notify);
    if (S.notify && "Notification" in window && Notification.permission === "default") Notification.requestPermission().then(renderAlert);
    renderAlert();
  });
  $("fx-refresh").addEventListener("click", function () { scan(); others(); });
  renderAlert(); render(); others(); scan();
  // after every 15-minute close (+25 s for the feed); while hidden only when alerts are on
  setInterval(function () {
    var q = Math.floor((Date.now() - 25000) / 900000);
    if (q !== S.lastQ && (document.visibilityState === "visible" || S.notify)) { scan(); if (q % 4 === 0) others(); }
  }, 30000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && Math.floor((Date.now() - 25000) / 900000) !== S.lastQ) scan(); });
})();
