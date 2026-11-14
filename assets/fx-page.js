// forex.html: the five-timeframe rule run on the major currency pairs, in the visitor's browser. Forex only.
// The rule was chosen on gold. Replayed on these 11 pairs (research/forex, Yahoo hourly bars 2024-04 to 2026-10) it
// lost money: -0.07R a trade over 688 trades, 4 pairs positive, while the same test made +0.66R on gold. So this page is
// a trend map with the rule's prices, and says plainly that the replay found no money in them. Round 2
// (research/forex/edges: Fed days, time of day, strong against weak currencies, the London breakout) found no method
// that makes money on currencies after costs either; the warning box quotes both result files.
// Alerts are off until switched on.
// Prices are scaled to whole points before the engine sees them (EUR/USD 1.08345 -> 108345): the engine rounds to
// two decimals, and the rule itself (structure, ATR multiples) does not care about the scale.
(function () {
  "use strict";
  var tr = window.T || function (zh) { return zh; }, EN = window.LANG === "en";
  var PAIRS = [
    { i: "EUR/USD", d: 5, n: tr("欧元 / 美元", "Euro / US dollar") }, { i: "GBP/USD", d: 5, n: tr("英镑 / 美元", "Pound / US dollar") }, { i: "USD/JPY", d: 3, n: tr("美元 / 日元", "US dollar / yen") },
    { i: "AUD/USD", d: 5, n: tr("澳元 / 美元", "Aussie / US dollar") }, { i: "NZD/USD", d: 5, n: tr("纽元 / 美元", "Kiwi / US dollar") }, { i: "USD/CAD", d: 5, n: tr("美元 / 加元", "US dollar / Canadian dollar") },
    { i: "USD/CHF", d: 5, n: tr("美元 / 瑞郎", "US dollar / Swiss franc") }, { i: "EUR/JPY", d: 3, n: tr("欧元 / 日元", "Euro / yen") }, { i: "GBP/JPY", d: 3, n: tr("英镑 / 日元", "Pound / yen") },
    { i: "AUD/JPY", d: 3, n: tr("澳元 / 日元", "Aussie / yen") }, { i: "EUR/GBP", d: 5, n: tr("欧元 / 英镑", "Euro / pound") }
  ];
  var P = XauPlan, F = XauFeed, $ = function (id) { return document.getElementById(id); };
  var TFS = ["W", "D", "4H", "1H", "15M"], TFN = EN ? { W: "weekly", D: "daily", "4H": "4-hour", "1H": "1-hour", "15M": "15-min" } : { W: "周线", D: "日线", "4H": "4小时", "1H": "1小时", "15M": "15分钟" };
  var LSK = "fx.", ls = { get: function (k, d) { try { var v = localStorage.getItem(LSK + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(LSK + k, JSON.stringify(v)); } catch (e) {} } };
  var S = { res: {}, busy: false, lastQ: -1, notify: !!ls.get("notify", false), base: null, acct: ls.get("acct", null) || { balance: null, riskPct: 0.5, lev: 100 } };
  // the forex words: never gold's replay
  P.setMarket({ goText: tr("回放里这个规则在外汇上不赚钱，只作趋势参考。", "In the replay this rule loses money on forex: a trend reference only."), observe: true, health: null, noneText: "", lateText: "", patNote: "", patAgainst: "", shortText: "" });
  XAU_TFS.forEach(function (c) { c.bars = c.tf === "15M" ? 96 : 0; });

  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in (attrs || {})) { var v = attrs[k]; if (v === null || v === undefined || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function sgt(ms) { var d = new Date(ms + 8 * 3600000); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2); }
  function ago(ms) { var m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 60 ? m + tr(" 分钟前", " min ago") : m < 2880 ? Math.round(m / 60) + tr(" 小时前", " h ago") : Math.round(m / 1440) + tr(" 天前", " days ago"); }
  var NF = {}, nf = function (d) { return NF[d] || (NF[d] = new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })); };   // one formatter per precision: creating one per number is slow
  function px(p, v) { return typeof v === "number" && isFinite(v) ? nf(p.d).format(v) : "—"; }
  function pips(p, dist) { var pip = p.metal ? 0.01 : p.d === 3 ? 0.01 : 0.0001; return Math.round(dist / pip) + (p.metal ? tr(" 美分", " cents") : tr(" 点", " pips")); }

  // ---------- lots: 0.01 lot = 1,000 units of the first currency; a pip is 0.0001 (0.01 on yen pairs) ----------
  function rateOf(i) { var r = S.res[i]; return r && typeof r.price === "number" && isFinite(r.price) && r.price > 0 ? r.price : null; }
  function toUsd(ccy) {                                                          // dollars for one unit of ccy, from the pairs on this page
    if (ccy === "USD") return 1;
    var d = rateOf(ccy + "/USD"); if (d) return d;
    var v = rateOf("USD/" + ccy); return v ? 1 / v : null;
  }
  function usd(v, d) { return "$" + nf(d === undefined ? 2 : d).format(v); }
  function num(v) { return typeof v === "number" && isFinite(v) && v > 0 ? v : null; }
  function lotInfo(r) {
    var p = r.p, b = p.i.slice(0, 3), q = p.i.slice(4), pip = p.d === 3 ? 0.01 : 0.0001, qu = toUsd(q), bu = toUsd(b);
    if (qu === null || bu === null) return null;
    var o = { b: b, pip: pip, pipUsd: 1000 * pip * qu, notional: 1000 * bu, margin: 1000 * bu / (num(S.acct.lev) || 100) };
    var dist = r.plan ? r.plan.dist : r.atr ? 3 * r.atr : null;                 // the rule's stop: 3 x the 1-hour ATR
    if (dist) { o.stopPips = Math.round(dist / pip); o.stopUsd = o.stopPips * o.pipUsd; }
    var bal = num(S.acct.balance), pct = num(S.acct.riskPct);
    if (o.stopUsd && bal && pct) { o.risk = bal * pct / 100; o.lots = Math.floor(o.risk / o.stopUsd + 1e-9) / 100; o.lotsLoss = o.lots * 100 * o.stopUsd; }
    return o;
  }
  function renderLots() {
    var box = $("fx-lot-tab"); if (!box) return; while (box.firstChild) box.removeChild(box.firstChild);
    var head = EN ? ["Pair", "0.01 lot =", "Per pip", "Rule's stop", "0.01 lot to stop", "Your lots"] : ["货币对", "0.01 手 =", "每动 1 点", "规则止损", "0.01 手到止损", "你的手数"];
    var rows = PAIRS.map(function (p) {
      var r = S.res[p.i], o = r && r.price ? lotInfo(r) : null;
      var c = function (i, main, sub, cls) { return h("td", { "data-l": head[i], class: cls || null }, [main, sub ? h("small", { text: sub }) : null]); };
      if (!o) return h("tr", null, [c(0, p.i), c(1, tr("读取中…", "Loading…")), c(2, "—"), c(3, "—"), c(4, "—"), c(5, "—")]);
      var mine = o.lots === undefined ? c(5, "—", tr("填上面的余额", "fill in the balance above")) : o.lots >= 0.01 ? c(5, o.lots.toFixed(2) + tr(" 手", " lots"), tr("到止损亏 ", "loses ") + usd(o.lotsLoss) + tr("", " at the stop")) : c(5, tr("开不了", "too big"), EN ? "0.01 lot loses " + usd(o.stopUsd) + ", over " + usd(o.risk) : "0.01 手亏 " + usd(o.stopUsd) + "，超过 " + usd(o.risk), "warn");
      return h("tr", null, [c(0, p.i, p.n), c(1, "1,000 " + o.b, tr("约 ", "about ") + usd(o.notional, 0) + tr(" · 保证金 ", " · margin ") + usd(o.margin)), c(2, usd(o.pipUsd, 3).replace(/0$/, "")),
        o.stopPips ? c(3, o.stopPips + tr(" 点", " pips"), tr("3 倍小时波幅", "3 × 1-hour ATR")) : c(3, "—"), o.stopUsd ? c(4, "−" + usd(o.stopUsd), null, "dn") : c(4, "—"), mine]);
    });
    box.appendChild(h("table", { class: "lots-t" }, [h("thead", null, [h("tr", null, head.map(function (t) { return h("th", { text: t }); }))]), h("tbody", null, rows)]));
    var lev = num(S.acct.lev) || 100;
    $("fx-lot-sub").textContent = EN ? "In US dollars at the live prices (a USD account); margin at 1:" + lev + " leverage." : "按现价换成美元（美元账户），保证金按 1:" + lev + " 杠杆。";
  }

  // ---------- one pair ----------
  function analyse(p, feed) {
    var k = Math.pow(10, p.d), sc = function (rows) { return rows.map(function (r) { return [r[0], r[1] * k, r[2] * k, r[3] * k, r[4] * k, 0, r[6]]; }); }, K = {};
    TFS.forEach(function (tf) { K[tf] = sc(feed.K[tf] || []); });
    var E = runXauEngine({ source: "spot", K: K, price: feed.price * k, priceAt: feed.priceAt }, Date.now()), R = P.regime(E), un = function (v) { return typeof v === "number" ? v / k : null; };
    var out = { p: p, price: feed.price, at: feed.priceAt, dirs: R.dirs, dir: R.dir, full: R.full, lean: R.lean, odd: R.odd, since3: R.since3, since5: R.since5, K: K, k: k };
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
    // the early word: this close already stands beyond every close still needed for all five to agree. This page sees
    // prices only at 15-minute closes (no live forex feed, no extra requests), so a close is the soonest it can say so.
    var sn = P.soonNeed(E, E.price);
    out.soon = sn ? { dir: sn.dir, tf: sn.tf, need: sn.need.map(function (g) { return { tf: g.tf, price: un(g.p) }; }) } : null;
    out.state = R.full ? (R.dir > 0 ? "buy" : "sell") : R.dir ? "ready" : "none";
    // chart patterns, as on the gold page: finished ones on the daily, 4-hour and 1-hour charts, and any still forming
    out.pats = P.patternsNow(E);
    out.plans = [];
    ["D", "4H", "1H"].forEach(function (tf) {
      ((E.tfs[tf] || {}).patterns || []).forEach(function (q) {
        var pl = P.patternPlan(q, E.price), done = P.patternWay(q);
        out.plans.push({ tf: tf, name: P.patternText(q), done: !!done, dir: pl ? pl.dir : done, bias: q.bias, status: P.statusText(q.status),
          plan: pl ? { entry: un(pl.entry), stop: un(pl.stop), target: un(pl.target), rr: pl.rr } : null, raw: q, rawPlan: pl });
      });
    });
    return out;
  }

  // ---------- page ----------
  var ORDER = { buy: 0, sell: 0, ready: 1, none: 2, err: 3 }, GROUP = { buy: "live", sell: "live", ready: "ready", none: "none" };
  function render() {
    var list = PAIRS.map(function (p) { return S.res[p.i] || { p: p, state: "load" }; });
    var n = { buy: 0, sell: 0, ready: 0, none: 0, err: 0 }; list.forEach(function (r) { if (n[r.state] !== undefined) n[r.state]++; });
    $("fx-sum").textContent = EN ? "Buy signals " + n.buy + " · sell signals " + n.sell + " · waiting for small timeframes " + n.ready + " · mixed " + n.none + (n.err ? " · not read " + n.err : "") : "买入信号 " + n.buy + " · 卖出信号 " + n.sell + " · 等小周期 " + n.ready + " · 方向不一致 " + n.none + (n.err ? " · 读取失败 " + n.err : "");
    list.sort(function (a, b) { return (ORDER[a.state] === undefined ? 4 : ORDER[a.state]) - (ORDER[b.state] === undefined ? 4 : ORDER[b.state]) || (b.since5 || 0) - (a.since5 || 0); });
    // the one line that answers "anything to do now?"
    var strip = $("fx-sig"); while (strip.firstChild) strip.removeChild(strip.firstChild);
    var live = list.filter(function (r) { return r.state === "buy" || r.state === "sell"; }), ready = list.filter(function (r) { return r.state === "ready"; }), done = list.filter(function (r) { return r.state !== "load"; }).length;
    strip.className = "fx-sig" + (live.length ? " on" : "");
    if (live.length) {
      strip.appendChild(h("b", { text: tr("规则现在的信号（外汇回放里不赚钱，只作参考）：", "The rule's signals now (they lost money in the forex replay; reference only):") }));
      live.forEach(function (r) { strip.appendChild(h("a", { class: "fx-s " + r.state, href: "#sig-" + r.p.i.replace("/", ""), text: (r.state === "buy" ? tr("▲ 买入 ", "▲ Buy ") : tr("▼ 卖出 ", "▼ Sell ")) + r.p.i })); });
    } else if (done > n.err) {
      strip.appendChild(h("b", { text: tr("现在没有货币对出信号。", "No pair has a signal now.") }));
      strip.appendChild(h("span", { text: ready.length ? tr("大方向一致、在等小周期转过来的：", "Big trends agree, waiting for the small timeframes to turn: ") + ready.map(function (r) { return r.p.i + (r.dir > 0 ? tr("（向上）", " (up)") : tr("（向下）", " (down)")); }).join(tr("、", ", ")) + tr("。", ".") : tr("也没有大方向一致的货币对，先不做。", "No pair has its big trends agreeing either: nothing to do.") }));
    } else if (n.err === list.length) {                                         // a feed that failed is not "no signal"
      strip.appendChild(h("b", { text: tr("外汇数据没有读到，现在没有答案。", "The forex data was not read: no answer right now.") }));
      strip.appendChild(h("span", { text: tr("这不等于没有信号。点“⟳ 刷新”再试；页面开着，下一根 15 分钟 K 线收盘后也会自动再读。", "That is not the same as no signal. Press «⟳ Refresh» to try again; with the page open it also reads again after the next 15-minute close.") }));
    } else strip.appendChild(h("span", { text: tr("读取中…", "Loading…") }));
    if (n.err && n.err < list.length && done > n.err) strip.appendChild(h("span", { class: "fx-wait", text: (EN ? n.err + " more were not read and are not in the line above: " : "另有 " + n.err + " 个没读到，上面这句不包括它们：") + list.filter(function (r) { return r.state === "err"; }).map(function (r) { return r.p.i; }).join(tr("、", ", ")) + tr("。", ".") }));
    var soon = list.filter(function (r) { return r.soon && r.state !== "err"; });
    if (soon.length) strip.appendChild(h("span", { class: "fx-wait", text: tr("⏳ 最新收盘已到位、只等大周期收盘的（还不是信号）：", "⏳ The latest closes are in place, waiting only for a bigger candle to close (not a signal yet): ") + soon.map(function (r) { return r.p.i + (r.soon.dir > 0 ? tr("（买入）", " (buy)") : tr("（卖出）", " (sell)")); }).join(tr("、", ", ")) + tr("。", ".") }));
    if (done > n.err && (ready.length || soon.length)) strip.appendChild(h("span", { class: "fx-wait", text: tr("这页只在每根 15 分钟 K 线收盘后看一次价格。想更早知道，可以在 MT5 给卡片上的价位设价格提醒；外汇回放里不赚钱，只作参考。", "This page checks prices once per 15-minute close. To know sooner, set price alerts in MT5 at the levels on the cards; the forex replay lost money, so this is reference only.") }));
    if (done && done < list.length) strip.appendChild(h("span", { class: "fx-wait", text: EN ? "Still reading " + (list.length - done) + "…" : "还在读 " + (list.length - done) + " 个…" }));
    var box = $("fx-list"); while (box.firstChild) box.removeChild(box.firstChild);
    [["live", tr("有信号（回放里不赚钱）", "Signal (lost money in the replay)")], ["ready", tr("大方向一致 · 等小周期", "Big trends agree · waiting for small timeframes")], ["none", tr("方向不一致 · 先不做", "Mixed · nothing to do")], [null, tr("读取中 / 读取失败", "Loading / not read")]].forEach(function (g) {
      var rows = list.filter(function (r) { return (GROUP[r.state] || null) === g[0]; }); if (!rows.length) return;
      box.appendChild(h("h3", { class: "fx-grp" }, [g[1] + " ", h("span", { text: rows.length + tr(" 个", "") })]));
      rows.forEach(function (r) { box.appendChild(card(r)); });
    });
    renderLots();
  }
  function arrows(r) {
    return h("div", { class: "fx-tf" }, TFS.map(function (tf) { var v = r.dirs ? r.dirs[tf] : 0; return h("span", { class: v > 0 ? "up" : v < 0 ? "dn" : "", title: TFN[tf] }, [h("i", { text: (EN ? { W: "W", D: "D", "4H": "4H", "1H": "1H", "15M": "15M" } : { W: "周", D: "日", "4H": "4H", "1H": "1H", "15M": "15M" })[tf] }), h("b", { text: v > 0 ? "↑" : v < 0 ? "↓" : "–" })]); }));
  }
  function card(r) {
    var p = r.p, el = h("div", { class: "fx-c " + r.state });
    var counter = r.state === "ready" && (r.lag || []).some(function (g) { return r.dirs[g.tf] === -r.dir; });   // small timeframes running against the big three
    var chip = EN ? { buy: "Buy signal (lost in the replay)", sell: "Sell signal (lost in the replay)", ready: r.dir > 0 ? (counter ? "Big trend up · pulling back" : "Big trend up · waiting for small timeframes") : (counter ? "Big trend down · bouncing" : "Big trend down · waiting for small timeframes"), none: "Mixed", err: "Not read", load: "Loading…" }[r.state]
      : { buy: "买入信号（回放不赚钱）", sell: "卖出信号（回放不赚钱）", ready: r.dir > 0 ? (counter ? "大方向向上 · 回调中" : "大方向向上 · 等小周期") : (counter ? "大方向向下 · 反弹中" : "大方向向下 · 等小周期"), none: "方向不一致", err: "读取失败", load: "读取中…" }[r.state];
    el.appendChild(h("div", { class: "fx-top" }, [h("div", null, [h("b", { class: "fx-i", text: p.i }), h("span", { class: "fx-n", text: p.n })]),
      h("div", { class: "fx-p" }, [h("b", { class: "mono", text: px(p, r.price) }), r.chg !== null && r.chg !== undefined ? h("span", { class: "mono " + (r.chg >= 0 ? "up" : "dn"), text: (r.chg >= 0 ? "+" : "") + r.chg.toFixed(2) + "%" }) : null,
        r.at ? h("small", { class: late(r.at) ? "late" : null, text: tr("价格 ", "price ") + sgt(r.at).split(" ")[1] + (late(r.at) ? tr(" · 延迟", " · delayed") : "") }) : null])]));
    if (r.state === "load" || r.state === "err") { el.appendChild(h("p", { class: "fx-l", text: r.state === "err" ? (EN ? "Not read: " + (r.err || "") + "; trying again at the next refresh." : "读取失败：" + (r.err || "") + "，下一次刷新再试。") : tr("读取中…", "Loading…") })); return el; }
    el.appendChild(h("div", { class: "fx-mid" }, [arrows(r), r.state === "buy" || r.state === "sell" ? null : h("span", { class: "fx-chip " + r.state, text: chip })]));   // a signal says it in its own block below
    var buy = r.dir > 0, act = buy ? tr("买入", "buy") : tr("卖出", "sell"), line = "";
    if (r.state === "buy" || r.state === "sell") {
      el.appendChild(action(r)); line = null;
    } else if (r.state === "ready") {
      var got = (r.lag || []).filter(function (g) { return g.price !== null; });
      var trig = got.length ? got.slice().sort(function (a, b) { return (a.price - b.price) * r.dir; })[got.length - 1].price : null;
      line = EN ? "Wait for " + got.map(function (g) { return "a " + TFN[g.tf] + " close " + (buy ? "above " : "below ") + px(p, g.price); }).join(" and ") + " → " + act + " signal. " +
          (trig !== null && r.plan ? "Then about: " + act + " " + px(p, trig) + ", stop " + px(p, trig - r.dir * r.plan.dist) + ", target " + px(p, trig + r.dir * 3 * r.plan.dist) + "." : "")
        : "等" + got.map(function (g) { return TFN[g.tf] + "收盘" + (buy ? "站上 " : "跌破 ") + px(p, g.price); }).join("、") + " → " + act + "信号。" +
          (trig !== null && r.plan ? "到时约：" + act + " " + px(p, trig) + "，止损 " + px(p, trig - r.dir * r.plan.dist) + "，目标 " + px(p, trig + r.dir * 3 * r.plan.dist) + "。" : "");
    } else {
      var w = (r.paths || [])[0];
      line = EN ? "Weekly " + way(r.dirs.W) + ", daily " + way(r.dirs.D) + ", 4-hour " + way(r.dirs["4H"]) + ": not agreeing. " + (w ? "Nearest step: " + w.steps.map(function (s) { return "a " + TFN[s.tf] + " close " + (w.to > 0 ? "above " : "below ") + px(p, s.price); }).join(" and ") + " → all three big trends " + way(w.to) + "." : "")
        : "周线" + way(r.dirs.W) + "、日线" + way(r.dirs.D) + "、4 小时" + way(r.dirs["4H"]) + "，不一致。" + (w ? "最近的一步：" + w.steps.map(function (s) { return TFN[s.tf] + "收盘" + (w.to > 0 ? "站上 " : "跌破 ") + px(p, s.price); }).join("、") + " → 三个大周期同向" + way(w.to) + "。" : "");
    }
    if (line) el.appendChild(h("p", { class: "fx-l", text: line }));
    if (r.soon) el.appendChild(h("p", { class: "fx-l", text: soonLine(r) }));
    if (r.state !== "none") { var pl = patLine(r); if (pl) el.appendChild(pl); }
    var foot = [];
    if (r.dir && r.since3) foot.push(EN ? "big trend for " + Math.max(0, Math.round((Date.now() - r.since3) / 86400000)) + " days" : "大方向已持续 " + Math.max(0, Math.round((Date.now() - r.since3) / 86400000)) + " 天");
    if (r.dir && r.flipOut !== null && r.flipOut !== undefined) foot.push(EN ? "ends on a 4-hour close " + (buy ? "below " : "above ") + px(p, r.flipOut) : "4 小时收盘" + (buy ? "跌破 " : "站上 ") + px(p, r.flipOut) + " 就结束");
    if (r.atr) foot.push(tr("小时波幅 ", "1-hour ATR ") + pips(p, r.atr));
    foot.push(tr("K 线到 ", "candles to ") + sgt(r.at));
    el.appendChild(h("p", { class: "fx-f", text: foot.join(" · ") }));
    return el;
  }
  var TF_SEC = { W: 604800, D: 86400, "4H": 14400, "1H": 3600, "15M": 900 };
  function soonLine(r) {
    var o = r.soon, buy = o.dir > 0, p = r.p, end = (F.bucket(Date.now() / 1000, o.tf) + TF_SEC[o.tf]) * 1000;
    if (EN) return "⏳ The latest closes are in place: " + o.need.map(function (g) { return "a " + TFN[g.tf] + " close " + (buy ? "above " : "below ") + px(p, g.price); }).join(" and ") + " → " + (buy ? "buy" : "sell") + " signal. It counts only if still there at " + (o.tf === "W" ? "the weekly close" : "the " + sgt(end) + " close") + "; not a signal yet.";
    return "⏳ 最新收盘已到位：" + o.need.map(function (g) { return TFN[g.tf] + "收盘" + (buy ? "站上 " : "跌破 ") + px(p, g.price); }).join("、") + " → " + (buy ? "买入" : "卖出") + "信号。" + (o.tf === "W" ? "本周收盘" : sgt(end) + " 收盘") + "时还在才算，现在还不是信号。";
  }
  // A pair you can trade now: which way, the three prices, and a plan to copy into MT5.
  function action(r) {
    var p = r.p, k = r.plan, buy = r.dir > 0, side = buy ? "buy" : "sell";
    var box = h("div", { class: "fx-act " + side, id: "sig-" + p.i.replace("/", "") });
    box.appendChild(h("div", { class: "fx-act-h" }, [h("b", { text: buy ? tr("▲ 买入", "▲ Buy") : tr("▼ 卖出", "▼ Sell") }), h("span", { text: EN ? "all five timeframes " + (buy ? "up" : "down") : (buy ? "BUY" : "SELL") + " · 五个周期都" + (buy ? "向上" : "向下") }), h("span", { class: "fx-un", text: tr("回放不赚钱", "lost in the replay") })]));
    var g = h("div", { class: "fx-act-g" }), tile = function (k1, v, d, cls) { g.appendChild(h("div", { class: cls || "" }, [h("i", { text: k1 }), h("b", { class: "mono", text: v }), h("s", { text: d })])); };
    tile(tr("入场", "Entry"), px(p, k.entry), tr("现价", "price now"));
    tile(tr("止损", "Stop"), px(p, k.stop), (buy ? "−" : "+") + pips(p, k.dist), "st");
    tile(tr("目标 3R", "Target 3R"), px(p, k.tp1), (buy ? "+" : "−") + pips(p, 3 * k.dist), "tg");
    box.appendChild(g);
    box.appendChild(h("p", { text: EN ? "Or no target: each day at 08:00 SGT move the stop to " + pips(p, k.trail) + " behind the best price since entry, and leave when the three big trends stop agreeing (holds on to more profit in a big trend)." : "或者不设目标：每天 08:00 SGT 把止损挪到入场以来最好价格后面 " + pips(p, k.trail) + "，三个大周期不再同向就离场（大趋势里更能拿住利润）。" }));
    var o = lotInfo(r);
    if (o && o.stopUsd) box.appendChild(h("p", { class: "fx-lot1" }, [EN ? "0.01 lot: " + usd(o.pipUsd, 3).replace(/0$/, "") + " a pip, loses " + usd(o.stopUsd) + " at the stop. " : "0.01 手：每点 " + usd(o.pipUsd, 3).replace(/0$/, "") + "，到止损亏 " + usd(o.stopUsd) + "。",
      o.lots === undefined ? h("a", { href: "#fx-lots", text: tr("填账户余额算手数 →", "Fill in your balance for the lots →") }) : o.lots >= 0.01 ? h("b", { text: EN ? "For your account: " + o.lots.toFixed(2) + " lots (loses " + usd(o.lotsLoss) + " at the stop)" : "按你的账户：" + o.lots.toFixed(2) + " 手（到止损亏 " + usd(o.lotsLoss) + "）" }) : h("b", { text: tr("按你的账户：0.01 手也超过你设的亏损上限，这笔开不了。", "For your account: even 0.01 lot is over your loss limit, so this one cannot be opened.") })]));
    if (r.since5) box.appendChild(h("p", { class: "fx-age", text: EN ? "Signal came " + ago(r.since5) + (r.sigPx ? " (at " + px(p, r.sigPx) + ")" : "") + (typeof r.movedR === "number" ? ", has moved " + (r.movedR >= 0 ? "+" : "−") + Math.abs(r.movedR).toFixed(1) + "R since" : "") + ". The stop and target above are worked out from the price now." : "信号 " + ago(r.since5) + "出现" + (r.sigPx ? "（当时 " + px(p, r.sigPx) + "）" : "") + (typeof r.movedR === "number" ? "，之后已走 " + (r.movedR >= 0 ? "+" : "−") + Math.abs(r.movedR).toFixed(1) + "R" : "") + "。上面的止损和目标已按现价重算。" }));
    var plan = EN ? p.i + " " + (buy ? "buy" : "sell") + " · entry " + px(p, k.entry) + " · stop " + px(p, k.stop) + " (" + pips(p, k.dist) + ") · target " + px(p, k.tp1) + " (3R) · or trailing stop " + pips(p, k.trail) + " · signal " + (r.since5 ? sgt(r.since5) + " SGT" : "") + " · this rule lost money in the forex replay"
      : p.i + " " + (buy ? "买入" : "卖出") + " · 入场 " + px(p, k.entry) + " · 止损 " + px(p, k.stop) + "（" + pips(p, k.dist) + "）· 目标 " + px(p, k.tp1) + "（3R）· 或跟踪止损 " + pips(p, k.trail) + " · 信号 " + (r.since5 ? sgt(r.since5) + " SGT" : "") + " · 外汇回放里这个规则不赚钱";
    var btn = h("button", { type: "button", class: "btn sm", text: tr("复制计划", "Copy plan"), onclick: function () {
      var done = function () { btn.textContent = tr("已复制 ✓", "Copied ✓"); setTimeout(function () { btn.textContent = tr("复制计划", "Copy plan"); }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(plan).then(done, function () { window.prompt(tr("复制这段：", "Copy this:"), plan); }); else window.prompt(tr("复制这段：", "Copy this:"), plan);
    } });
    box.appendChild(h("div", { class: "fx-act-b" }, [btn]));
    return box;
  }
  // the pattern line: folded, because patterns showed no edge in the replay; open by itself when a finished one points
  // against a live signal
  function patLine(r) {
    var dir = r.dir || 0, list = (r.plans || []).slice(0, 3), warn = warnOf(r);
    if (!list.length) return null;
    var box = h("details", { class: "fx-pat" + (warn ? " warn" : ""), open: warn ? "" : null }), inner = h("div", { class: "fx-pat-in" });
    box.appendChild(h("summary", null, [h("b", { text: (warn ? "⚠ " : "") + tr("形态（参考）", "Patterns (reference)") }), " " + list.map(function (q) { return P.TF_ZH[q.tf] + " " + q.name; }).join(" · ")]));
    var slots = [];
    list.forEach(function (q) {
      var rel = !q.dir ? "" : !dir ? "" : q.dir === dir ? tr(" · 和大方向一致", " · with the big trend") : tr(" · 和大方向相反", " · against the big trend"), p = r.p, k = q.plan;
      var row = h("div", { class: "fx-pr" }, [h("div", { class: "fx-pr-n" }, [h("b", { text: P.TF_ZH[q.tf] + " " + q.name }), h("span", { text: q.status + rel })])]);
      if (q.raw && q.raw.geo && window.PatChart) { var sl = h("div", { class: "fx-pc" }); row.appendChild(sl); slots.push({ el: sl, q: q }); }
      if (k) {
        var buy = k.dir > 0, weak = k.rr < 1;
        row.appendChild(h("div", { class: "fx-pr-g" }, [
          h("span", null, [h("i", { text: q.done ? (buy ? tr("买入（现价）", "Buy (now)") : tr("卖出（现价）", "Sell (now)")) : (buy ? tr("收盘站上才买", "Buy above") : tr("收盘跌破才卖", "Sell below")) }), h("b", { class: "mono", text: px(p, k.entry) })]),
          h("span", { class: "st" }, [h("i", { text: tr("止损 SL", "Stop SL") }), h("b", { class: "mono", text: px(p, k.stop) })]),
          h("span", { class: "tg" }, [h("i", { text: tr("目标 TP", "Target TP") }), h("b", { class: "mono", text: px(p, k.target) })]),
          h("span", { class: weak ? "weak" : "" }, [h("i", { text: tr("盈亏比", "R:R") }), h("b", { class: "mono", text: k.rr.toFixed(2) })])]));
        if (weak) row.appendChild(h("p", { class: "fx-pr-w", text: EN ? "Reward:risk below 1: it would make less than it could lose; " + (q.done ? "most of it has already run, not worth chasing." : "not worth taking.") : "盈亏比低于 1：赚的比可能亏的少，" + (q.done ? "大部分已经走完，不值得追。" : "不值得做。") }));
      } else row.appendChild(h("p", { class: "fx-pr-w", text: q.bias === "neutral" ? tr("没有方向的形态：等它突破再看。", "A pattern with no direction: wait for it to break.") : tr("价位对不上（可能已经走过目标或止损），不给方案。", "The levels do not line up (it may have passed its target or stop), so no plan.") }));
      inner.appendChild(row);
    });
    inner.appendChild(h("p", { class: "fx-pr-note", text: (warn ? tr("有反方向的已完成形态：黄金回放里这种情况很少，结果偏差（16 笔，平均 −0.28R），笔数太少不能当规则；想更稳可以减半或不做。", "A finished pattern points the other way: rare in the gold replay and worse than usual (16 trades, −0.28R on average), too few to make a rule; to play safer, halve the size or skip it. ") : "") + S.patWords }));
    box.appendChild(inner);
    var drawn = false, drawCharts = function () {
      if (drawn || !box.open) return; drawn = true;
      slots.forEach(function (sl) {
        var q = sl.q, rows = (r.K[q.tf] || []).filter(function (k) { return k[6] < Date.now(); });
        var c = PatChart.draw(rows, q.raw, { fmt: function (v) { return px(r.p, v / r.k); }, plan: q.rawPlan, tfLabel: P.TF_ZH[q.tf], title: r.p.i + " " + P.TF_ZH[q.tf] + q.name, w: sl.el.clientWidth || 320 });
        if (c) sl.el.appendChild(c);
      });
    };
    box.addEventListener("toggle", drawCharts); if (box.open) setTimeout(drawCharts, 0);
    return box;
  }
  function warnOf(r) { var dir = r.dir || 0, ag = (r.pats || []).filter(function (q) { return dir && q.dir === dir; }), op = (r.pats || []).filter(function (q) { return dir && q.dir === -dir; }); return (r.state === "buy" || r.state === "sell") && op.length && !ag.length; }
  function way(d) { return d > 0 ? tr("向上", "up") : d < 0 ? tr("向下", "down") : tr("不明", "unclear"); }
  // a price from a 15-minute close more than 45 minutes old while the market is open
  function late(ms) { return Date.now() - ms > 45 * 60000 && !F.closed(Date.now() / 1000); }

  // ---------- loading: two pairs at a time; newest bars only after the first load ----------
  function scan() {
    if (S.busy) return; S.busy = true; S.lastTry = Date.now(); S.lastQ = Math.floor((Date.now() - 25000) / 900000);
    $("fx-stamp").textContent = EN ? "Reading " + PAIRS.length + " markets…" : "正在读取 " + PAIRS.length + " 个市场…";
    var queue = PAIRS.slice(), running = 0;
    return new Promise(function (done) {
      function next() {
        if (!queue.length) { if (!running) done(); return; }
        var p = queue.shift(); running++;
        F.loadInst(p.i).then(function (feed) { S.res[p.i] = analyse(p, feed); }, function (e) { S.res[p.i] = Object.assign(S.res[p.i] || { p: p }, { state: "err", err: e && e.message ? e.message : tr("无响应", "no answer") }); })
          .then(function () { running--; render(); next(); });
      }
      next(); next();
    }).then(function () {
      var bad = PAIRS.filter(function (p) { return S.res[p.i].state === "err"; }).length;
      S.busy = false; $("fx-stamp").textContent = (bad === PAIRS.length ? tr("这次没有读到数据 · 每 15 分钟自动再读", "No data this time · reads again every 15 minutes") : (EN ? "From the 15-minute candle that closed " + sgt(Date.now() - (Date.now() % 900000)) + " SGT · recomputed every 15 minutes" : "按 " + sgt(Date.now() - (Date.now() % 900000)) + " SGT 收盘的 15 分钟 K 线计算 · 每 15 分钟自动重算") + (bad ? (EN ? " · " + bad + " not read" : " · " + bad + " 个没读到") : "")) + (F.closed(Date.now() / 1000) ? tr(" · 周末休市", " · weekend, market closed") : "");
      alerts();
    });
  }

  // ---------- alerts: a new buy / sell signal on any pair, only when switched on ----------
  function alerts() {
    var keys = {}; PAIRS.forEach(function (p) { var r = S.res[p.i]; if (r && (r.state === "buy" || r.state === "sell")) keys[p.i] = r.state + ":" + (r.since5 || ""); });
    var opening = S.base === null;
    PAIRS.forEach(function (p) {                                                // the early word, once per deciding candle
      var r = S.res[p.i], o = r && r.soon; if (!o || r.state === "err") return;
      var key = o.dir + ":" + o.tf + ":" + F.bucket(Date.now() / 1000, o.tf), sent = ls.get("sentSoon", {}); if (sent[p.i] === key) return; sent[p.i] = key; ls.set("sentSoon", sent);
      if (opening || !S.notify || !("Notification" in window) || Notification.permission !== "granted") return;
      try { new Notification("⏳ " + p.i + (EN ? " · a " + (o.dir > 0 ? "buy" : "sell") + " signal may come (lost in the replay)" : " · 可能出" + (o.dir > 0 ? "买入" : "卖出") + "信号（回放不赚钱）"), { body: soonLine(r), tag: "fx-soon-" + p.i, renotify: true }); } catch (e) {}
    });
    if (opening) { S.base = keys; return; }                                     // what the page opened with is already on screen
    PAIRS.forEach(function (p) {
      var key = keys[p.i]; if (!key || S.base[p.i] === key) return;
      S.base[p.i] = key;
      var sent = ls.get("sent", {}); if (sent[p.i] === key) return; sent[p.i] = key; ls.set("sent", sent);
      var r = S.res[p.i], k = r.plan, buy = r.dir > 0;
      if (!S.notify || !("Notification" in window) || Notification.permission !== "granted" || !k) return;
      try { new Notification((buy ? "🟢 " : "🔴 ") + p.i + " · " + (EN ? (buy ? "buy" : "sell") + " signal (lost in the replay)" : (buy ? "买入" : "卖出") + "信号（回放不赚钱）"), { body: EN ? (buy ? "Buy about " : "Sell about ") + px(p, k.entry) + ", stop " + px(p, k.stop) + ", target " + px(p, k.tp1) + " (3R). In the replay this rule loses money on forex: reference only." : (buy ? "买入约 " : "卖出约 ") + px(p, k.entry) + "，止损 " + px(p, k.stop) + "，目标 " + px(p, k.tp1) + "（3R）。回放里这个规则在外汇上不赚钱，只作参考。", tag: "fx-" + p.i, renotify: true }); } catch (e) {}
    });
    Object.keys(S.base).forEach(function (i) { if (!keys[i]) delete S.base[i]; });
  }
  function renderAlert() {
    var b = $("fx-alert"), granted = "Notification" in window && Notification.permission === "granted";
    b.textContent = S.notify ? (granted ? tr("🔔 外汇信号提醒：开（点一下关闭）", "🔔 Forex alerts: on (tap to turn off)") : tr("🔔 提醒已开，但浏览器还没允许通知：点一下允许", "🔔 Alerts on, but the browser has not allowed notifications: tap to allow")) : tr("🔕 外汇信号提醒：关（点一下打开）", "🔕 Forex alerts: off (tap to turn on)");
    b.className = "btn sm " + (S.notify ? "on" : "");
  }
  $("fx-alert").addEventListener("click", function () {
    if (S.notify && "Notification" in window && Notification.permission === "default") { Notification.requestPermission().then(renderAlert); return; }
    S.notify = !S.notify; ls.set("notify", S.notify);
    if (S.notify && "Notification" in window && Notification.permission === "default") Notification.requestPermission().then(renderAlert);
    renderAlert();
  });
  $("fx-refresh").addEventListener("click", function () { scan(); });
  [["fx-bal", "balance"], ["fx-risk", "riskPct"], ["fx-lev", "lev"]].forEach(function (m) {
    var el = $(m[0]), v = S.acct[m[1]]; el.value = v === null || v === undefined ? "" : v;
    el.addEventListener("input", function () { var x = parseFloat(this.value); S.acct[m[1]] = isFinite(x) && x > 0 ? x : null; ls.set("acct", S.acct); render(); });
  });
  S.patWords = tr("形态按自己的止损和目标做：回放里胜率约六成，但赚的少、亏的多，平均每笔约 0R，只作参考。", "Traded with their own stop and target, patterns won about six times in ten in the replay, but made little and lost more: about 0R a trade on average. Reference only.");
  fetch("data/xau-backtest.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (bt) {
    var o = bt && bt.patterns && bt.patterns.own; if (!o || !o["1H"]) return;
    var sg = function (v) { return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "R"; };
    S.patWords = EN ? "Traded with their own stop and target (gold replay, " + o["1H"].n.toLocaleString("en-US") + " 1-hour patterns): " + Math.round(o["1H"].win) + "% won, but " + sg(o["1H"].avgR) + " a trade on average: more wins, bigger losses. Reference only, no more reliable than the five-timeframe signal above." : "形态按自己的止损和目标做（黄金回放，" + o["1H"].n.toLocaleString("en-US") + " 个 1 小时形态）：胜率 " + Math.round(o["1H"].win) + "%，但平均每笔 " + sg(o["1H"].avgR) + "：赚的次数多、亏的时候亏得多。只作参考，不比上面的五周期信号可靠。"; render();
  }).catch(function () {});
  var getJ = function (u) { return fetch(u, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  Promise.all([getJ("research/forex/result.json"), getJ("research/forex/edges/result.json"), getJ("research/forex/speed-result.json")]).then(function (res) {
    var d = res[0], e = res[1], sp = res[2] && res[2].versions;
    if (!d || !d.n || !d.gold) return;
    var el = $("fx-proof"), R = function (v) { return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "R"; }, ym = function (s) { var p = String(s).split("-"); return EN ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+p[1] - 1] + " " + p[0] : p[0] + " 年 " + +p[1] + " 月"; };
    var bp = function (v) { return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + " bp"; };
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(h("b", { text: d.passed ? tr("回放结果：这个规则在外汇上有小优势，但历史很短。", "Replay: this rule has a small edge on forex, but the history is short.") : tr("回放结果：这个规则在外汇上不赚钱。", "Replay: this rule does not make money on forex.") }));
    el.appendChild(document.createTextNode(EN ? " " + ym(d.from) + " to " + ym(d.tested) + ", 11 pairs, " + d.n + " trades, " + R(d.avgR) + " a trade on average, " + d.positive + " pairs positive; the same method made " + R(d.gold.fourTfHourly.avgR) + " a trade on gold over the same dates." + (d.passed ? "" : " Treat forex signals as a trend reference only; do not trade them with real money.")
      : " " + ym(d.from) + "到 " + ym(d.tested) + "，11 个货币对共 " + d.n + " 笔，平均每笔 " + R(d.avgR) + "，" + d.positive + " 个货币对是正的；同样的做法同期在黄金上一笔 " + R(d.gold.fourTfHourly.avgR) + "。" + (d.passed ? "" : "外汇信号只当趋势参考，不建议按它用真钱下单。")));
    // round 2: the effects documented for currencies, each after its paper's years, and the London breakout
    if (!e || !e.A1 || !e.A2 || !e.A3 || !e.B1) return;
    var t = [
      EN ? ["shorting the dollar on Fed days", e.A1.n + " times since 2011, " + bp(e.A1.avgBp) + " each; " + bp(e.A1.paperYears.avgBp) + " in the paper's years, gone once published", e.A1.passed] : ["美联储决议日做空美元", "2011 年起 " + e.A1.n + " 次，每次 " + bp(e.A1.avgBp) + "；论文那些年是 " + bp(e.A1.paperYears.avgBp) + "，公开后就没了", e.A1.passed],
      EN ? ["the US/Europe time-of-day pattern", "EUR/USD " + bp(e.A2.avgBp) + " a day", e.A2.passed] : ["欧美时段规律", "EUR/USD 每天 " + bp(e.A2.avgBp), e.A2.passed],
      EN ? ["buying the strongest, selling the weakest currencies", (e.A3.avgPct >= 0 ? "+" : "−") + Math.abs(e.A3.avgPct).toFixed(2) + "% a month", e.A3.passed] : ["买最强卖最弱的货币", "每月 " + (e.A3.avgPct >= 0 ? "+" : "−") + Math.abs(e.A3.avgPct).toFixed(2) + "%", e.A3.passed],
      EN ? ["the London breakout", e.B1.n.toLocaleString("en-US") + " trades, " + R(e.B1.avgR) + " each", e.B1.passed] : ["伦敦开盘突破", e.B1.n.toLocaleString("en-US") + " 笔，每笔 " + R(e.B1.avgR), e.B1.passed]
    ].concat(sp ? [EN ? ["faster signals", "4-hour before its close " + R(sp.pre4h.avgR) + " a trade, without the weekly " + R(sp.noW.avgR), sp.pre4h.passed || sp.noW.passed] : ["更快的信号", "4 小时不等收盘每笔 " + R(sp.pre4h.avgR) + "，不看周线 " + R(sp.noW.avgR), sp.pre4h.passed || sp.noW.passed]] : []), none = t.every(function (x) { return !x[2]; });
    el.appendChild(h("div", { class: "more" }, [h("b", { text: none ? tr("其他做法也测过了，扣点差后都不赚钱：", "Other methods were tested too; after costs none makes money:") : tr("另外测过的做法：", "Other methods tested:") }),
      " " + t.map(function (x) { return EN ? x[0] + " (" + x[1] + (x[2] ? ", passed" : "") + ")" : x[0] + "（" + x[1] + (x[2] ? "，通过" : "") + "）"; }).join(tr("、", "; ")) + tr("。", ".")]));
  });
  renderAlert(); render(); scan();
  // after every 15-minute close (+25 s for the feed); while hidden only when alerts are on. If the feed has not published
  // that candle yet, or a pair failed, look again a minute later, three times at most, as the gold page does: before,
  // a candle published late waited for the next quarter hour.
  var qSeen = null, qTries = 0;
  setInterval(function () {
    if (document.visibilityState !== "visible" && !S.notify) return;
    var now = Date.now(), q = Math.floor((now - 25000) / 900000);
    if (q !== qSeen) { qSeen = q; qTries = 0; }
    if (q !== S.lastQ) { scan(); return; }
    if (S.busy || now - S.lastTry < 55000 || qTries >= 3 || F.closed(now / 1000)) return;
    var behind = PAIRS.some(function (p) { var r = S.res[p.i]; return !r || r.state === "err" || !r.at || r.at < q * 900000; });
    if (behind) { qTries++; scan(); }
  }, 20000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && Math.floor((Date.now() - 25000) / 900000) !== S.lastQ) scan(); });
})();
