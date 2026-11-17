// Fills the home page's market summary from data files, so none of it is typed by hand and none of it goes stale:
//   data/xau-state.json   the report page's engine, run on a server by a timed job (scripts/update_gold.js)
//   data/calendar.json    this week's US releases (scripts/update_calendar.py)
// The live price comes from assets/gold-live.js (PAXG ticks calibrated on spot one-minute candles), or from
// api.gold-api.com once a minute when that is missing; today's change is measured from the previous close in
// the state file. If a file cannot be read, the block says so instead of showing an old figure.
// The verdict: the state file is written by a job GitHub runs about every 5 hours, so when this browser already holds
// gold's candles (it has opened the gold page this week) the page loads the gold page's engine and works the answer
// out itself from the newest closed candles, again after each 15-minute close; otherwise it shows the file's, with its age.
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg", S = { state: null, cal: null, live: null, lv: null };
  function $(id) { return document.getElementById(id); }
  function set(id, text) { var e = $(id); if (e) e.textContent = text; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  var NF = {}, nf = function (d) { return NF[d] || (NF[d] = new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })); };   // one formatter per precision: creating one per number is slow
  function fmt(v, d) { return typeof v === "number" && isFinite(v) ? nf(d === undefined ? 1 : d).format(v) : "—"; }
  function sgn(v, d) { var t = fmt(Math.abs(v), d); return (v > 0 ? "+" : v < 0 ? "−" : "") + t; }
  function mk(t, at, parent) { var e = document.createElementNS(NS, t); for (var k in at) e.setAttribute(k, at[k]); if (parent) parent.appendChild(e); return e; }
  function chips(id, list) { var box = $(id); if (!box) return; while (box.firstChild) box.removeChild(box.firstChild); list.forEach(function (c) { if (c) box.appendChild(el("span", "chip " + c[0], c[1])); }); }
  function get(url) { return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(function () { return null; }); }
  // English (assets/i18n.js): the data file and the engine write their words in Chinese, so the English sentences are
  // built from the same values (trend, level, prices) rather than translated from the Chinese ones
  var EN = window.LANG === "en", tr = window.T || function (zh) { return zh; }, I = window.I18N || { trend: function (w) { return w; }, wd: function (w) { return w; }, level: function (w) { return w; }, tfName: function (w) { return w; } };
  var ARROW = { "向上": "↑", "向下": "↓", "不明": "–" }, SHORT = EN ? { W: "W", D: "D", "4H": "4H", "1H": "1H", "15M": "15M" } : { W: "周", D: "日", "4H": "4H", "1H": "1H", "15M": "15M" };
  function scoreWord(sc) { return sc >= 7 ? tr("强烈看多", "Strongly bullish") : sc >= 4 ? tr("看多", "Bullish") : sc >= 1 ? tr("略偏多", "Slightly bullish") : sc === 0 ? tr("中性", "Neutral") : sc >= -3 ? tr("略偏空", "Slightly bearish") : sc >= -6 ? tr("看空", "Bearish") : tr("强烈看空", "Strongly bearish"); }
  function left(ms) { var m = Math.max(0, Math.round(ms / 60000)); if (m < 60) return m + tr(" 分钟", " min"); var h = Math.floor(m / 60); return h < 48 ? h + tr(" 小时", " h") : Math.floor(h / 24) + tr(" 天", " days"); }
  // the big three's common direction from the timeframes list (trend words as the file writes them)
  function bigDir(tfs) { var t = tfs.slice(0, 3).map(function (x) { return x.trend; }); return t.length === 3 && t.every(function (w) { return w === "向上"; }) ? 1 : t.length === 3 && t.every(function (w) { return w === "向下"; }) ? -1 : 0; }
  function tagEn(v, tfs) {
    var tag = v.tag || "", d = bigDir(tfs), pre = (/休市/.test(tag) ? "Market closed · " : "") + (/仅观察/.test(tag) ? "Watch only · " : "");
    if (v.level === "go") return pre + ((d < 0 || /做空/.test(tag)) ? "Sell with the trend" : "Buy with the trend");
    if (v.level === "none") return pre + "Stand aside";
    return pre + (d < 0 ? "Wait: big trend down" : d > 0 ? "Wait: big trend up" : "Wait");
  }
  function titleEn(v, tfs) {
    var d = bigDir(tfs), way = d < 0 ? "down" : "up";
    if (v.level === "go") return "All five timeframes point " + way + ": the rule says " + (d < 0 ? "sell" : "buy") + " with the trend";
    if (v.level === "none") return "Stand aside: the weekly, daily and 4-hour trends do not agree";
    return "The weekly, daily and 4-hour point " + way + "; waiting for the 1-hour and 15-minute to turn " + way;
  }
  // a watch line ("4 小时收盘站上这里，…") as: a 4-hour close above here changes the answer
  function watchEn(w) {
    var m = /^(周线|日线|4\s*小时|1\s*小时|15\s*分钟)/.exec(w.text || ""), tf = m ? I.tfName(m[1]) : "candle", up = w.dir === "up" || /站上/.test(w.text || "");
    return "a " + tf.toLowerCase() + " close " + (up ? "above" : "below") + " here changes the answer";
  }

  // upcoming releases, one entry per release time
  function upcoming(cal, onlyHigh) {
    var now = Date.now(), by = {}, out = [];
    ((cal && cal.events) || []).forEach(function (e) {
      if (e.allDay || e.ms <= now || (onlyHigh && e.impact !== "high")) return;
      var k = e.ms + "|" + e.impact, g = by[k], day = e.date.replace("月", "/").replace("日", "");
      if (!g) { g = by[k] = { ms: e.ms, when: EN ? day + " (" + I.wd(e.weekday) + ") " + e.time : day + "（" + e.weekday + "）" + e.time, names: [], high: e.impact === "high" }; out.push(g); }
      g.names.push(EN ? e.title || e.zh : e.zh || e.title);
    });
    out.forEach(function (g) { g.name = g.names.slice(0, 2).join(tr("、", ", ")) + (g.names.length > 2 ? tr(" 等", " and more") : ""); });
    return out.sort(function (a, b) { return a.ms - b.ms; });
  }

  function drawDays(st) {
    var svg = $("g7svg"); if (!svg) return; while (svg.firstChild) svg.removeChild(svg.firstChild);
    var pts = (st.recentDays || []).map(function (p) { return { d: p.date, v: p.close }; });
    if (S.live !== null && st.marketOpen) pts.push({ d: tr("现在", "Now"), v: S.live });
    pts = pts.slice(-7); if (pts.length < 2) return;
    var vs = pts.map(function (p) { return p.v; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), pad = (hi - lo) * 0.15 || 10, mn = lo - pad, mx = hi + pad;
    var W = 340, H = 96, L = 8, R = 52, T = 10, B = 18, X = function (i) { return L + i * (W - L - R) / (pts.length - 1); }, Y = function (v) { return T + (mx - v) * (H - T - B) / (mx - mn); };
    var line = pts.map(function (p, i) { return X(i).toFixed(1) + "," + Y(p.v).toFixed(1); });
    var defs = mk("defs", {}, svg), gr = mk("linearGradient", { id: "g7g", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    mk("stop", { offset: "0%", "stop-color": "#D4A72C", "stop-opacity": "0.28" }, gr); mk("stop", { offset: "100%", "stop-color": "#D4A72C", "stop-opacity": "0" }, gr);
    mk("polygon", { points: line.join(" ") + " " + X(pts.length - 1).toFixed(1) + "," + (H - B) + " " + L + "," + (H - B), fill: "url(#g7g)" }, svg);
    mk("polyline", { points: line.join(" "), fill: "none", stroke: "#D4A72C", "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    pts.forEach(function (p, i) {
      mk("circle", { cx: X(i).toFixed(1), cy: Y(p.v).toFixed(1), r: i === pts.length - 1 ? "3.5" : "2", fill: "#D4A72C", stroke: "#15151C", "stroke-width": "1" }, svg);
      mk("text", { x: i === 0 ? "0" : X(i).toFixed(1), y: H - 3, fill: "#8A857E", "font-size": "11", "font-family": "'IBM Plex Mono',monospace", "text-anchor": i === 0 ? "start" : "middle" }, svg).textContent = p.d;
    });
    var last = pts[pts.length - 1];
    mk("text", { x: (X(pts.length - 1) + 5).toFixed(1), y: (Y(last.v) + 3).toFixed(1), fill: "#F6F5F3", "font-size": "11", "font-weight": "700", "font-family": "'Space Grotesk',monospace" }, svg).textContent = "$" + fmt(last.v, 0);
    set("g7-range", tr("低 $", "Low $") + fmt(lo, 0) + tr(" · 高 $", " · High $") + fmt(hi, 0));
  }
  function drawScore(sc) {
    var svg = $("scoresvg"); if (!svg) return; while (svg.firstChild) svg.removeChild(svg.firstChild);
    var cx = 85, cy = 82, r = 58, pt = function (p) { var a = Math.PI * (1 - p); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
    var arc = function (p0, p1, color) { var s = pt(Math.min(p0, p1)), e = pt(Math.max(p0, p1)); mk("path", { d: "M" + s[0].toFixed(1) + " " + s[1].toFixed(1) + " A" + r + " " + r + " 0 0 1 " + e[0].toFixed(1) + " " + e[1].toFixed(1), fill: "none", stroke: color, "stroke-width": 10, "stroke-linecap": "round" }, svg); };
    var p = (Math.max(-10, Math.min(10, sc)) + 10) / 20;
    arc(0, 1, "#2B2B36"); if (sc !== 0) arc(0.5, p, sc > 0 ? "#0ab074" : "#db2943");
    mk("text", { x: cx, y: cy - 8, fill: "#F6F5F3", "font-size": "22", "font-weight": "700", "font-family": "'Space Grotesk',monospace", "text-anchor": "middle" }, svg).textContent = sgn(sc, 0);
    mk("text", { x: cx, y: cy + 8, fill: "#8A857E", "font-size": "8.5", "font-family": "'IBM Plex Mono',monospace", "text-anchor": "middle" }, svg).textContent = scoreWord(sc) + tr(" · 范围 ±10", " · range ±10");
  }

  function paint() {
    paintSince();
    var st = S.state, cal = S.cal, ev = upcoming(cal, false), hi = ev.filter(function (e) { return e.high; }), now = Date.now();
    if (cal) {
      var nx = hi[0];
      set("pulse-event", nx ? nx.name + " " + (EN ? nx.when.split(") ")[0] + ")" : nx.when.split("）")[0] + "）") : tr("本周没有剩下的大数据", "No big releases left this week"));
      set("pulse-event-d", nx ? nx.when + tr(" SGT，还有 ", " SGT, in ") + left(nx.ms - now) + tr("。", ".") + (hi.length > 1 ? tr("之后：", " Then: ") + hi.slice(1, 4).map(function (e) { return e.name + " " + e.when; }).join(" · ") : "") : tr("日历每周日换到新的一周。", "The calendar moves to the new week every Sunday."));
      chips("hub-risk-chips", hi.length ? hi.slice(0, 2).map(function (e, i) { return [i ? "gold" : "bear", (i ? tr("之后：", "Then: ") : tr("下一个大数据：", "Next big release: ")) + e.name + " · " + e.when + " SGT"]; }) : [["gold", tr("本周没有剩下的大数据", "No big releases left this week")]]);
    } else { set("pulse-event", tr("日历暂时读不到", "Calendar not available right now")); set("pulse-event-d", tr("请打开风险计划页查看。", "Open the gold page's calendar tab.")); chips("hub-risk-chips", [["gold", tr("经济日历与风险计划", "Calendar and risk plan")]]); }
    if (!st) {
      ["pulse-gold", "pulse-verdict-d", "pulse-tf-d"].forEach(function (id) { set(id, tr("数据文件暂时读不到，请打开 4H 报告看实时结论。", "The data file is not available right now; open the gold page for the live answer.")); });
      set("pulse-verdict", "—"); set("pulse-tf", "—"); set("pulse-updated", tr("数据暂时读不到", "Data not available")); return;
    }
    var pd = st.previousDay || {}, pw = st.previousWeek || {}, td = st.today || {}, price = S.live !== null && st.marketOpen ? S.live : st.price;
    var chg = typeof pd.close === "number" ? price - pd.close : null, pct = chg === null ? null : chg / pd.close * 100;
    var L = S.lv, tfs = ((L ? L.timeframes : st.timeframes) || []).filter(function (t) { return !t.error; }), dirs = tfs.map(function (t) { return SHORT[t.tf] + (ARROW[t.trend] || "–"); }).join(" ");
    var big = tfs.slice(0, 3).map(function (t) { return EN ? I.tfName(t.name) + " " + I.trend(t.trend) : t.name.replace(" ", "") + t.trend; }).join(tr("、", ", ")), v = (L ? L.verdict : st.verdict) || {}, go = v.level === "go";
    var vTag = EN ? tagEn(v, tfs) : v.tag, vTitle = EN ? titleEn(v, tfs) : v.title;
    var dayHi = Math.max(td.high || price, price), dayLo = Math.min(td.low || price, price), dayOpen = td.open;
    // weekend: the day to show is the last full one (previousDay, Friday), measured against the day before it
    var shut = !st.marketOpen, rd = st.recentDays || [], pdKey = typeof pd.date === "string" ? (+pd.date.slice(5, 7)) + "/" + (+pd.date.slice(8, 10)) : null;
    var base = pd.close;
    if (shut && typeof pd.close === "number") {
      var k = rd.length && rd[rd.length - 1].date === pdKey ? rd.length - 2 : -1;
      base = k >= 0 ? rd[k].close : null; dayHi = pd.high; dayLo = pd.low; dayOpen = pd.open;
      chg = typeof base === "number" ? pd.close - base : null; pct = chg === null ? null : chg / base * 100;
    }
    var dayWord = shut ? tr("上一交易日", "Last session") + (pdKey ? tr("（" + pdKey + "）", " (" + pdKey + ")") : "") : tr("今日", "Today");
    // say plainly when the data file is old: the job that writes it runs on GitHub's timer, which can fall hours behind
    var at = Date.parse(String(st.updated).replace(" SGT", ":00+08:00").replace(" ", "T")), ageH = isFinite(at) ? (now - at) / 3600000 : 0, old = ageH >= 1, w0 = ((L ? L.watch : st.watch) || [])[0];
    // the verdict below is as old as the file; the live price can already have crossed the level that changes it
    var crossed = !!(w0 && S.live !== null && st.marketOpen && (/跌破/.test(w0.text) ? S.live < w0.price : S.live > w0.price)), ageTxt = old ? Math.round(ageH) + tr(" 小时前", " h ago") : "";
    set("pulse-updated", EN ? "⟳ Data " + st.updated + (old ? " (" + Math.round(ageH) + " h ago, the update is late)" : " · auto-updated") + " · price live" : "⟳ 数据 " + st.updated + (old ? "（" + Math.round(ageH) + " 小时前，自动更新晚了）" : " · 自动更新") + " · 价格实时");
    set("hub-upd", EN ? "⟳ Data file " + st.updated + (old ? ", " + Math.round(ageH) + " h old; take the direction and levels from the gold page" : "") + " · gold price and chart live" : "⟳ 数据文件 " + st.updated + (old ? "，已是 " + Math.round(ageH) + " 小时前；方向和价位请以 4H 报告为准" : "") + " · 金价与图表实时");
    set("pulse-gold", EN
      ? dayWord + (chg === null ? "" : " " + sgn(chg) + " USD (" + sgn(pct, 2) + "%)") + ", range " + fmt(dayLo) + "–" + fmt(dayHi) + ". " + (shut ? "" : "Yesterday closed " + fmt(pd.close) + ", range " + fmt(pd.low) + "–" + fmt(pd.high) + ". ") + "Last week's range " + fmt(pw.low) + "–" + fmt(pw.high) + "."
      : dayWord + (chg === null ? "" : " " + sgn(chg) + " 美元（" + sgn(pct, 2) + "%）") + "，区间 " + fmt(dayLo) + "–" + fmt(dayHi) + "。" + (shut ? "" : "昨日收 " + fmt(pd.close) + "，区间 " + fmt(pd.low) + "–" + fmt(pd.high) + "。") + "上周区间 " + fmt(pw.low) + "–" + fmt(pw.high) + "。");
    var vOld = !L && old, vWhen = L ? tr("按 " + L.at + " 收盘的 K 线实时算的。", "Worked out live from the " + L.at + " close. ") : vOld ? tr("这是 " + ageTxt + "算的。", "Worked out " + ageTxt + ". ") : "";
    set("pulse-verdict", vTag || "—");
    set("pulse-verdict-d", EN
      ? vWhen + (vTitle || "") + "." + (w0 ? " Watch " + fmt(w0.price) + ": " + watchEn(w0) + "." + (crossed ? " Price is already past it; " + (L ? "it counts when that candle closes." : "the answer may have changed: open the gold page for the live one.") : "") : "")
      : vWhen + (vTitle || "") + "。" + (w0 ? "关注 " + fmt(w0.price) + "：" + w0.text + "。" + (crossed ? "现价已经越过它，" + (L ? "要看那根 K 线收盘。" : "结论可能已变，打开黄金页看实时结论。") : "") : ""));
    var tfBox = $("pulse-tf");
    if (tfBox) {            // five lights: one per timeframe, coloured by its direction, with the day that trend began
      while (tfBox.firstChild) tfBox.removeChild(tfBox.firstChild);
      tfs.forEach(function (t, i) {
        var up = t.trend === "向上", dn = t.trend === "向下", chip = el("span", "tfl " + (up ? "up" : dn ? "dn" : "un") + (i < 3 ? " big" : ""));
        chip.appendChild(el("i", null, SHORT[t.tf] || t.tf)); chip.appendChild(el("b", null, up ? "▲" : dn ? "▼" : "–"));
        var sm = t.since && /^\d{4}-(\d{2})-(\d{2})/.exec(t.since); if (sm) chip.appendChild(el("small", null, tr("自 ", "since ") + (+sm[1]) + "/" + (+sm[2])));
        tfBox.appendChild(chip);
      });
      if (!tfs.length) tfBox.textContent = "—";
    }
    set("pulse-tf-d", tr("周线、日线、4 小时同向才做；1 小时和 15 分钟也同向才进场。现在：", "Trade only when the weekly, daily and 4-hour agree; enter when the 1-hour and 15-minute agree too. Now: ") + big + tr("。", "."));
    chips("hub-main-chips", [
      [chg === null ? "gold" : chg >= 0 ? "bull" : "bear", (st.marketOpen ? tr("今日 ", "Today ") : (pdKey ? pdKey + " " : "") + tr("收盘 ", "close ")) + (chg === null ? "" : sgn(chg) + tr("（" + sgn(pct, 2) + "%）· ", " (" + sgn(pct, 2) + "%) · ")) + tr("区间 ", "range ") + fmt(dayLo, 0) + "–" + fmt(dayHi, 0)],
      [go ? "bull" : "gold", tr("系统结论", "The rule") + (L ? tr("（实时）", " (live)") : vOld ? tr("（" + ageTxt + "）", " (" + ageTxt + ")") : "") + tr("：", ": ") + (vTag || "—") + " · " + dirs],
      hi[0] ? ["gold", tr("下一个大数据：", "Next big release: ") + hi[0].name + " " + hi[0].when] : null
    ]);
    chips("hub-news-chips", [["gold", tr("昨日收 ", "Yesterday's close ") + fmt(pd.close) + tr(" · 上周区间 ", " · last week's range ") + fmt(pw.low, 0) + "–" + fmt(pw.high, 0)]]);
    drawDays(st); drawScore(L && typeof L.score === "number" ? L.score : typeof st.score === "number" ? st.score : 0);
    // key levels around the price, highest first: nearest resistance and support, the plan's stop and target while there
    // is a signal, and the price that would change the answer
    var lad = $("hub-levels");
    if (lad) {
      while (lad.firstChild) lad.removeChild(lad.firstChild);
      // the file's levels were sorted around the price at its run; the price now may have passed some of them
      var lvAll = (st.resistance || []).concat(st.support || []), lvUp = null, lvDn = null, rows = [];
      lvAll.forEach(function (l) { if (typeof l.price !== "number") return; if (l.price > price && (!lvUp || l.price < lvUp.price)) lvUp = l; if (l.price < price && (!lvDn || l.price > lvDn.price)) lvDn = l; });
      var what = function (l) { var two = String(l.what || "").split("、").slice(0, 2).join("、"); return EN ? I.level(two) : two; };
      var add = function (p, cls, name, note) { if (typeof p === "number" && isFinite(p)) rows.push({ p: p, cls: cls, name: name, note: note }); };
      var pl = L ? L.plan : st.plan;
      if (lvUp) add(lvUp.price, "res", tr("最近阻力", "Nearest resistance"), what(lvUp));
      if (lvDn) add(lvDn.price, "sup", tr("最近支撑", "Nearest support"), what(lvDn));
      if (go && pl) { add(pl.stop, "stop", tr("方案止损", "The plan's stop"), tr("3 倍小时波幅", "3 × the 1-hour ATR")); add(pl.target, "tgt", tr("方案目标", "The plan's target"), "3R"); }
      if (w0 && typeof w0.price === "number") add(w0.price, "watch", tr("会改变结论的价位", "Changes the answer"), EN ? watchEn(w0) : String(w0.text || "").split("，")[0]);
      add(price, "now", shut ? tr("收盘价", "Last close") : tr("现价", "Price now"), "");
      rows.sort(function (x, y) { return y.p - x.p; });
      rows.forEach(function (r) {
        var li = el("li", r.cls), mid = el("span"); li.appendChild(el("b", null, fmt(r.p)));
        mid.appendChild(el("strong", null, r.name)); if (r.note) mid.appendChild(el("small", null, r.note));
        li.appendChild(mid); li.appendChild(el("em", null, r.cls === "now" ? "" : sgn(r.p - price))); lad.appendChild(li);
      });
    }
  }

  function livePrice() {
    fetch("https://api.gold-api.com/price/XAU", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !(d.price > 0)) return;
      S.live = d.price;
      [].forEach.call(document.querySelectorAll(".js-live-price"), function (e) { e.textContent = "$" + fmt(d.price, 0); });
      var t = new Date().toLocaleString(EN ? "en-GB" : "zh-CN", { timeZone: "Asia/Singapore", hour12: false });
      [].forEach.call(document.querySelectorAll(".js-live-time"), function (e) { e.textContent = t + " (SGT)"; });
      paint();
    }).catch(function () {});
  }
  // what's moving gold this week (data/drivers.json): the short list; the full card is on the gold page
  var DRV = { dxy: tr("美元指数", "US dollar index"), us10y: tr("美债 10 年收益率", "US 10-year yield"), real10y: tr("10 年实际收益率", "10-year real yield"), oil: tr("原油", "Crude oil"), silver: tr("白银", "Silver"), spx: tr("标普 500", "S&P 500") };
  function spark(vals) {
    var svg = mk("svg", { viewBox: "0 0 64 20", preserveAspectRatio: "none", "aria-hidden": "true" }); if (!vals || vals.length < 2) return svg;
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), r = hi - lo || 1;
    mk("polyline", { points: vals.map(function (v, i) { return (i * 64 / (vals.length - 1)).toFixed(1) + "," + (2 + 16 * (1 - (v - lo) / r)).toFixed(1); }).join(" "), fill: "none", stroke: "#E6BE55", "stroke-width": "1.4", "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }, svg);
    return svg;
  }
  function paintDrivers(d) {
    var top = $("hub-drv-top"), ul = $("hub-drv"); if (!top || !ul) return;
    var rows = (d && d.series) || [], gold = rows.filter(function (s) { return s.id === "gold"; })[0];
    while (ul.firstChild) ul.removeChild(ul.firstChild); while (top.firstChild) top.removeChild(top.firstChild);
    if (!gold) { top.textContent = tr("驱动因素的数据暂时读不到。", "The drivers data is not available right now."); return; }
    var ch = function (s) { var v = s.chg1w; if (typeof v !== "number") return ["—", ""]; if (s.kind === "pp") { var bp = Math.round(v * 100); return [(bp > 0 ? "+" : bp < 0 ? "−" : "") + Math.abs(bp) + " bp", bp > 0 ? "up" : bp < 0 ? "dn" : ""]; } return [sgn(v, 2) + "%", v > 0 ? "up" : v < 0 ? "dn" : ""]; };
    var g = ch(gold); top.appendChild(document.createTextNode(tr("黄金（期货）这一周 ", "Gold (futures) this week "))); top.appendChild(el("b", g[1], g[0]));
    var gn = gold.now && !gold.now.wait && typeof gold.now.chg === "number" ? gold.now : null;   // trading when the data job last ran: today's move so far (`wait`: the last session's close is not out yet, so it would not be today's)
    if (gn) { top.appendChild(document.createTextNode(tr(" · 今天 ", " · today "))); top.appendChild(el("b", gn.chg > 0 ? "up" : gn.chg < 0 ? "dn" : "", sgn(gn.chg, 2) + "%")); }
    rows.forEach(function (s) {
      if (!DRV[s.id]) return;
      var li = el("li"), c = ch(s), nm = el("span", "nm", DRV[s.id]), push = { dxy: -1, us10y: -1, real10y: -1 }[s.id];   // a rising dollar or yield usually weighs on gold
      if (push && typeof s.chg1w === "number" && s.chg1w !== 0) nm.appendChild(el("em", null, s.chg1w * push < 0 ? tr("不利", "headwind") : tr("有利", "tailwind")));
      li.appendChild(nm); li.appendChild(spark(s.spark)); li.appendChild(el("b", c[1], c[0])); ul.appendChild(li);
    });
    set("hub-drv-ft", tr("日收盘到 ", "Daily closes to ") + gold.date + (gn ? tr(" · 盘中 ", " · intraday ") + String(gn.at).slice(5, 16) : "") + tr(" · 参考，不是信号", " · context, not a signal"));
  }
  function loadFiles() { get("data/drivers.json").then(function (d) { S.drv = d; paintDrivers(d); paintSys(); }); return Promise.all([get("data/xau-state.json"), get("data/calendar.json")]).then(function (r) { S.state = r[0]; S.cal = r[1]; S.tried = true; paint(); paintSys(); }); }

  // ---------- 系统状态: is every part still updating itself? ----------
  // The owner asked to be able to confirm it (2026-11-15: "i want to confirm that entire system is auto updated").
  // One row per feed: when it last changed, how often it should, and whether that is on time. The gold state, calendar
  // and drivers files are already on the page; the rest (Bitcoin state, headlines, stock quotes, and the written brief's
  // date line read from news.html) are fetched only when the card comes near the screen, then every 10 minutes.
  var SYS = { asked: false, btc: null, news: null, quotes: null, briefAt: null, briefTried: false };
  function sgtMs(t) { var m = String(t || "").match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5]) : null; }
  function stampSgt(ms) { var d = new Date(ms + 8 * 3600000); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2); }
  function grade(ms, okH, lateH) { if (ms === null) return "none"; var h = (Date.now() - ms) / 3600000; return h <= okH ? "ok" : h <= lateH ? "late" : "stale"; }
  // the stock-quotes job's last due time: 08:20 SGT Tuesday to Saturday, 17:40 SGT Monday to Friday
  function quoteSlot(now) {
    var best = null;
    for (var back = 0; back < 8; back++) {
      var d = new Date(now + 8 * 3600000 - back * 86400000), wd = d.getUTCDay();
      [[8, 20, [2, 3, 4, 5, 6]], [17, 40, [1, 2, 3, 4, 5]]].forEach(function (x) {
        if (x[2].indexOf(wd) < 0) return;
        var t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), x[0] - 8, x[1]);
        if (t <= now && (best === null || t > best)) best = t;
      });
    }
    return best;
  }
  function loadSys() {
    get("data/btc-state.json").then(function (d) { SYS.btc = d; paintSys(); });
    get("data/news.json").then(function (d) { SYS.news = d; paintSys(); });
    get("data/quotes.json").then(function (d) { SYS.quotes = d; paintSys(); });
    fetch("news.html", { cache: "no-cache" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
      var m = t.match(/class="hdate">\s*(\d{4})年(\d{1,2})月(\d{1,2})日[^<]*?(\d{1,2}):(\d{2})\s*SGT/);
      SYS.briefAt = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5]) : null; SYS.briefTried = true; paintSys();
    }).catch(function () { SYS.briefTried = true; paintSys(); });
  }
  function paintSys() {
    var ul = $("sys-list"); if (!ul || !SYS.asked) return;
    var now = Date.now(), st = S.state, open = !!(st && st.marketOpen), wkOf = function (ms) { return Math.floor((ms - 5 * 3600000 - 3 * 86400000) / 604800000); };
    var rows = [];
    var add = function (key, name, what, ms, state, every, note) { rows.push({ key: key, name: name, what: what, ms: ms, state: state, every: every, note: note }); };
    add("live", tr("黄金 · 比特币 · 外汇页面", "Gold · Bitcoin · Forex pages"), tr("在你的浏览器里实时计算，不靠服务器：价格逐秒，结论和图表形态在每根 15 分钟 K 线收盘后重算", "worked out live in your browser, not on a server: price by the second, the answer and chart patterns again after every 15-minute close"), null, "live", tr("实时", "live"), tr("页面开着时", "while a page is open"));
    var gAt = st ? sgtMs(st.updated) : null;
    add("gold", tr("黄金结论文件 · 纸上记录", "Gold answer file · paper record"), tr("首页、导航栏的结论，纸上记录和趋势变化", "the answer on the home page and in the navbar, the paper record and the trend-change log"), gAt, st ? grade(gAt, open ? 1.5 : 8, open ? 8 : 30) : S.tried ? "none" : "wait", open ? tr("每 15 分钟", "every 15 min") : tr("休市：每 6 小时", "closed: every 6 h"));
    var bAt = SYS.btc ? sgtMs(SYS.btc.updated) : null;
    add("btc", tr("比特币结论文件", "Bitcoin answer file"), tr("首页的比特币卡片和它的纸上记录", "the Bitcoin tile on the home page and its paper record"), bAt, SYS.btc ? grade(bAt, open ? 1.5 : 8, open ? 8 : 30) : "wait", open ? tr("每 15 分钟", "every 15 min") : tr("周末：每 6 小时", "weekend: every 6 h"));   // the job's weekend pace, though Bitcoin trades: its page is live in the browser
    var nAt = SYS.news ? sgtMs(SYS.news.updated) : null, nN = SYS.news && SYS.news.items ? SYS.news.items.length : 0;
    add("news", tr("实时头条", "Live headlines"), EN ? "gold headlines on the news tab and in Ask Claude" + (SYS.news ? " · " + nN + " now" : "") : "快讯页和问 Claude 里的黄金头条" + (SYS.news ? " · 现在 " + nN + " 条" : ""), nAt, SYS.news ? grade(nAt, open ? 1.5 : 8, open ? 8 : 30) : "wait", open ? tr("每 15 分钟", "every 15 min") : tr("休市：每 6 小时", "closed: every 6 h"));
    var cal = S.cal, cHas = !!(cal && (cal.events || []).some(function (e) { return wkOf(e.ms) === wkOf(now); })), cNew = (now - 5 * 3600000 - 3 * 86400000) % 604800000 < 12 * 3600000;   // the first 12 hours of ForexFactory's week
    add("cal", tr("经济日历", "Economic calendar"), cal ? (cHas ? tr("本周的美国数据", "this week's US releases") : cNew ? tr("新一周刚开始，日历在下一次运行时换过来", "the new week has just begun; the calendar moves at the next run") : tr("还是上一周的日历", "still last week's calendar")) : tr("读不到", "not readable"), null, !cal ? (S.tried ? "none" : "wait") : cHas || cNew ? "ok" : "late", tr("每周换一次，每次运行都检查", "weekly; checked at every run"), cal && cal.updated ? tr("内容上次变化 ", "last changed ") + String(cal.updated).slice(5, 16) : "");
    var q = SYS.quotes, qAt = q ? sgtMs(q.updated) : null, slot = quoteSlot(now), qSt = !q ? "wait" : qAt === null ? "none" : qAt >= slot || now - slot < 2 * 3600000 ? "ok" : now - slot < 12 * 3600000 ? "late" : "stale";
    add("quotes", tr("股票行情", "Stock quotes"), EN ? "closing prices on the stocks page" + (q && q.failed && q.failed.length ? " · " + q.failed.length + " not fetched" : "") : "股票页的收盘价" + (q && q.failed && q.failed.length ? " · " + q.failed.length + " 只没取到" : ""), qAt, qSt, tr("工作日两次：08:20 和 17:40", "twice a weekday: 08:20 and 17:40"));
    var dv = S.drv, dAt = dv ? sgtMs(dv.updated) : null;
    add("drv", tr("驱动因素", "Gold's drivers"), tr("美元、收益率、原油、白银、标普：日收盘和盘中", "dollar, yields, oil, silver, S&P 500: daily closes and intraday"), dAt, dv ? grade(dAt, open ? 2 : 60, open ? 10 : 80) : (S.drv === undefined ? "wait" : "none"), open ? tr("每小时", "hourly") : tr("休市：收盘后一次", "closed: once after the close"));
    add("brief", tr("每日文字解读", "Daily written brief"), tr("黄金页「分析 · 消息 · 日历」里的文字，由每天 10:10 的 Claude 任务写", "the text in the gold page's «Brief · news · calendar», written by the Claude job at 10:10 every day"), SYS.briefAt, !SYS.briefTried ? "wait" : grade(SYS.briefAt, 26, 30), tr("每天 10:10", "daily at 10:10"));
    var WORD = { ok: tr("正常", "on time"), late: tr("晚了", "late"), stale: tr("停了", "stopped"), none: tr("读不到", "not readable"), wait: tr("检查中", "checking"), live: tr("实时", "live") };
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    rows.forEach(function (r) {
      var li = el("li", "s-" + r.state), when = r.ms !== null && r.ms !== undefined ? stampSgt(r.ms) + " · " + (EN ? left(now - r.ms) + " ago" : left(now - r.ms) + "前") : r.note || "—";
      li.appendChild(el("i")); var mid = el("div"); mid.appendChild(el("strong", null, r.name)); mid.appendChild(el("small", null, r.what)); li.appendChild(mid);
      var rt = el("div", "rt"); rt.appendChild(el("b", null, WORD[r.state])); rt.appendChild(el("em", null, when + (r.ms !== null && r.ms !== undefined && r.note ? " · " + r.note : ""))); if (r.key !== "live") rt.appendChild(el("span", null, tr("应 ", "due ") + r.every)); li.appendChild(rt);
      ul.appendChild(li);
    });
    var feeds = rows.filter(function (r) { return r.key !== "live"; }), waiting = feeds.some(function (r) { return r.state === "wait"; }), bad = feeds.filter(function (r) { return r.state !== "ok" && r.state !== "wait"; });
    var head = $("sys-head"); if (!head) return;
    head.className = "sys-head s-" + (waiting ? "wait" : bad.length ? (bad.some(function (r) { return r.state === "stale" || r.state === "none"; }) ? "stale" : "late") : "ok");
    while (head.firstChild) head.removeChild(head.firstChild);
    head.appendChild(el("i"));
    head.appendChild(el("b", null, waiting ? tr("检查中…", "Checking…") : !bad.length ? tr("全部在自动更新", "Everything is updating itself") : EN ? bad.length + " of " + feeds.length + " behind" : feeds.length + " 项里 " + bad.length + " 项没跟上"));
    head.appendChild(el("span", null, waiting ? "" : (!bad.length ? (EN ? feeds.length + " of " + feeds.length + " feeds on time" : feeds.length + " 项都正常") : bad.map(function (r) { return r.name + tr("：", ": ") + WORD[r.state]; }).join(tr("；", "; "))) + tr(" · 检查于 ", " · checked ") + stampSgt(now).split(" ")[1]));
    // a late server file does not make the gold page late: say so once, when that is the case
    var tip = $("sys-tip"); if (tip) tip.textContent = bad.some(function (r) { return r.key === "gold" || r.key === "btc"; }) ? tr("服务器文件晚了，不影响黄金、比特币、外汇页面本身：它们打开时在你的浏览器里实时计算。晚的只是首页卡片、导航栏和头条。", "A late server file does not make the gold, Bitcoin or forex pages late: they are worked out live in your browser when open. Only the home cards, the navbar pill and the headlines lag.") : "";
  }
  (function () {
    var card = $("hub-sys"); if (!card) return;
    var go = function () { if (SYS.asked) return; SYS.asked = true; paintSys(); loadSys(); setInterval(function () { if (document.visibilityState === "visible") loadSys(); }, 600000); setInterval(paintSys, 60000); };
    if (!("IntersectionObserver" in window)) { go(); return; }
    var io = new IntersectionObserver(function (es) { if (es.some(function (x) { return x.isIntersecting; })) { io.disconnect(); go(); } }, { rootMargin: "400px 0px" });
    io.observe(card);
  })();
  // the gold page's own engine, loaded only for a browser that holds the candles; same versions as report.html
  function script(src) { return new Promise(function (ok, no) { var e = document.createElement("script"); e.src = src; e.onload = ok; e.onerror = no; document.head.appendChild(e); }); }
  var WAY = { bullish: "向上", bearish: "向下" }, TFN = { W: "周线", D: "日线", "4H": "4 小时", "1H": "1 小时", "15M": "15 分钟" };
  function liveVerdict() {
    if (!window.XauFeed || !XauFeed.hasCache) return;
    XauFeed.hasCache().then(function (has) {
      if (!has) return;
      return (window.XauPlan && window.runXauEngine ? Promise.resolve() : script("assets/xau-engine.js?v=6").then(function () { return script("assets/xau-plan.js?v=20"); })).then(function () {
        return XauFeed.load({ source: "spot" });                                // spot only: the backup feed's answer can differ, the file's is then the better one
      }).then(function (feed) {
        var now = Date.now(), E = runXauEngine(feed, now), V = XauPlan.verdict(E, now), P = V.plan && V.level === "go" ? V.plan : null, d = new Date(feed.priceAt + 8 * 3600000);
        S.lv = { at: ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2), score: E.overall.score,
          verdict: { level: V.level, tag: (V.closed ? "休市中 · " : "") + V.tag, title: V.title, text: V.text },
          plan: P ? { side: P.side === "long" ? "做多" : "做空", stop: P.stop, target: P.tp1 } : null,
          watch: (V.lines || []).map(function (l) { return { price: l.price, text: l.text }; }),
          timeframes: ["W", "D", "4H", "1H", "15M"].map(function (tf) { var t = E.tfs[tf]; return !t || t.error ? { tf: tf, error: true } : { tf: tf, name: TFN[tf], trend: WAY[t.trend] || "不明" }; }) };
        paint();
      });
    }).catch(function () { S.lv = null; paint(); });                            // the file's answer, with its age, as before
  }
  // With assets/gold-live.js on the page the price is live (PAXG ticks calibrated on spot minutes); the summary
  // around it is repainted at most every 10 seconds.
  var lastPaint = 0;
  function fromGoldLive(p) {
    S.live = p.price;
    [].forEach.call(document.querySelectorAll(".js-live-price"), function (e) { e.textContent = "$" + fmt(p.price, 0); });
    var t = new Date().toLocaleString(EN ? "en-GB" : "zh-CN", { timeZone: "Asia/Singapore", hour12: false });
    [].forEach.call(document.querySelectorAll(".js-live-time"), function (e) { e.textContent = t + " (SGT)" + (p.how === "spot" ? tr(" · 按现货校准", " · calibrated to spot") : p.how === "closed" ? tr(" · 休市", " · market closed") : ""); });
    if (Date.now() - lastPaint > 10000) { lastPaint = Date.now(); paint(); }
  }
  // Bitcoin tile: its answer from data/btc-state.json (scripts/update_btc.js), its price straight from Binance
  function btc() {
    get("data/btc-state.json").then(function (b) {
      if (!b || !b.verdict) return;
      SN.btc = b; paintSince();
      var arrows = (b.timeframes || []).map(function (t) { return (EN ? SHORT[t.tf] || t.tf : (t.name || t.tf).replace(" ", "")) + (t.trend === "向上" ? "↑" : t.trend === "向下" ? "↓" : "–"); }).join(" ");
      var at = Date.parse(String(b.updated).replace(" SGT", ":00+08:00").replace(" ", "T")), ageH = isFinite(at) ? (Date.now() - at) / 3600000 : 0;   // written by the same late job as gold's file
      chips("hub-btc-chips", [[b.verdict.level === "go" ? "bull" : "gold", tr("结论", "Answer") + (ageH >= 1 ? tr("（" + Math.round(ageH) + " 小时前）", " (" + Math.round(ageH) + " h ago)") : "") + tr("：", ": ") + (EN ? tagEn(b.verdict, b.timeframes || []) : b.verdict.tag) + " · " + arrows]]);
    }).catch(function () {});
    fetch("https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      var p = d && parseFloat(d.price); if (isFinite(p) && p > 0) set("hub-btc-price", "$" + fmt(p, 0));
    }).catch(function () {});
  }
  // ---------- since your last visit ----------
  // The owner took up the proposal on 2026-11-15. A returning visitor (this page last seen over 15 minutes ago,
  // localStorage "hub.seen") gets one card under the title: whether gold's answer changed and the price then and now,
  // the bigger timeframes' turns (and how many 15-minute ones), the paper trades opened or closed, Bitcoin's answer, and
  // how many headlines are new, all from the data files' own times. index.html shows the card's frame before the page
  // is drawn, so nothing moves when it fills. The visit is written down when the page is left, after a minute on it,
  // or when the card is closed.
  var SEEN = "hub.seen", seen0 = null, SN = { sig: null, btc: null, news: null };
  try { seen0 = JSON.parse(localStorage.getItem(SEEN)); } catch (e) {}
  function bareTag(t) { return String(t || "").replace("休市中 · ", "").replace("仅观察 · ", ""); }
  function fakeTfs(d) { var w = d > 0 ? "向上" : d < 0 ? "向下" : "不明"; return [{ trend: w }, { trend: w }, { trend: w }]; }
  function goldNow() {
    var st = S.state; if (!st) return null;
    var v = (S.lv ? S.lv.verdict : st.verdict) || {}, tfs = ((S.lv ? S.lv.timeframes : st.timeframes) || []).filter(function (t) { return !t.error; });
    return { v: v, tfs: tfs, px: S.live !== null && st.marketOpen ? S.live : st.price };
  }
  function saveSeen() {
    var g = goldNow(), b = SN.btc; if (!g) return;
    try { localStorage.setItem(SEEN, JSON.stringify({ at: Date.now(), gTag: bareTag(g.v.tag), gLevel: g.v.level, gDir: bigDir(g.tfs), gPx: g.px,
      bTag: b && b.verdict ? bareTag(b.verdict.tag) : null, bLevel: b && b.verdict ? b.verdict.level : null, bDir: b ? bigDir(b.timeframes || []) : 0, bPx: b ? b.price : null })); } catch (e) {}
  }
  function sinceWhen(ms) {
    var d = new Date(ms + 8 * 3600000), n = new Date(Date.now() + 8 * 3600000), hm = ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2);
    return d.getUTCDate() === n.getUTCDate() && d.getUTCMonth() === n.getUTCMonth() ? hm : (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " " + hm;
  }
  function paintSince() {
    var box = $("hub-since"); if (!box || box.hidden || !seen0 || !S.state || !SN.sig) return;
    var at = seen0.at, g = goldNow(), lines = [], pct = function (a, b) { return sgn((b - a) / a * 100, 2) + "%"; };
    set("sn-t", (EN ? "Since your last visit · " : "自你上次来过 · ") + sinceWhen(at) + (EN ? " (" + left(Date.now() - at) + " ago)" : "（" + left(Date.now() - at) + "前）"));
    // gold's answer and price
    var nowTag = EN ? tagEn(g.v, g.tfs) : g.v.tag, oldTag = EN ? tagEn({ level: seen0.gLevel, tag: seen0.gTag }, fakeTfs(seen0.gDir)) : seen0.gTag, same = bareTag(g.v.tag) === seen0.gTag;
    var px = typeof seen0.gPx === "number" && typeof g.px === "number" ? (EN ? " Price " : "金价 ") + fmt(seen0.gPx) + " → " + fmt(g.px) + (EN ? " (" : "（") + sgn(g.px - seen0.gPx) + (EN ? ", " : "，") + pct(seen0.gPx, g.px) + (EN ? ")." : "）。") : "";
    lines.push([same ? "" : "chg", same ? (EN ? "Gold's answer is the same: " + nowTag + "." : "黄金结论没变：" + nowTag + "。") : (EN ? "Gold's answer changed: " + oldTag + " → " + nowTag + "." : "黄金结论变了：" + oldTag + " → " + nowTag + "。"), px]);
    // the trends, from the paper-record file's list of turns
    var ch = (SN.sig.changes || []).filter(function (c) { return c.ms > at; }), big = ch.filter(function (c) { return c.tf !== "15M"; }).reverse(), n15 = ch.length - big.length;
    var turn = function (c) { return (EN ? I.tfName(TFN[c.tf]) + (c.to === "bullish" ? " turned up" : c.to === "bearish" ? " turned down" : " became unclear") : TFN[c.tf] + (c.to === "bullish" ? "转多" : c.to === "bearish" ? "转空" : "变得不明")) + (EN ? " (" : "（") + sinceWhen(c.ms) + (EN ? ")" : "）"); };
    lines.push([big.length ? "chg" : "", (EN ? "Trends: " : "趋势：") + (big.length ? big.slice(0, 3).map(turn).join(EN ? ", " : "、") + (big.length > 3 ? (EN ? " and " + (big.length - 3) + " more" : " 等 " + big.length + " 次") : "") : tr("大周期都没变", "no change on the bigger timeframes")) + (n15 ? (EN ? "; the 15-minute turned " + n15 + (n15 > 1 ? " times" : " time") : "；15 分钟变了 " + n15 + " 次") : "") + tr("。", "."), ""]);
    // the paper record
    var sg = SN.sig.signals || [], opened = sg.filter(function (s) { return s.ms > at && s.status !== "skipped"; }), closed = sg.filter(function (s) { return s.exitMs > at; });
    var side = function (s) { return EN ? (s.side === "做空" ? "short" : "long") : s.side; };
    if (opened.length || closed.length) lines.push(["chg", (EN ? "Paper record: " : "纸面记录：") + opened.map(function (s) { return EN ? "new " + side(s) + " at " + fmt(s.entry) : "新开" + side(s) + " " + fmt(s.entry); }).concat(closed.map(function (s) {
      return "#" + s.id + (s.status === "target" ? tr(" 到目标 ", " hit its target ") : s.status === "stop" ? tr(" 止损 ", " stopped out ") : tr(" 平仓 ", " closed ")) + (typeof s.R === "number" ? sgn(s.R, 2) + "R" : "");
    })).join(EN ? "; " : "；") + tr("。", "."), ""]);
    // Bitcoin
    var b = SN.btc;
    if (b && b.verdict && seen0.bTag) {
      var bSame = bareTag(b.verdict.tag) === seen0.bTag, bNow = EN ? tagEn(b.verdict, b.timeframes || []) : b.verdict.tag, bOld = EN ? tagEn({ level: seen0.bLevel, tag: seen0.bTag }, fakeTfs(seen0.bDir)) : seen0.bTag;
      var bp = typeof seen0.bPx === "number" && typeof b.price === "number" ? (EN ? " " : "") + fmt(seen0.bPx, 0) + " → " + fmt(b.price, 0) + (EN ? " (" : "（") + pct(seen0.bPx, b.price) + (EN ? ")." : "）。") : "";
      lines.push([bSame ? "" : "chg", bSame ? (EN ? "Bitcoin's answer is the same (watch only)." : "比特币结论没变（仅观察）。") : (EN ? "Bitcoin's answer changed: " + bOld + " → " + bNow + "." : "比特币结论变了：" + bOld + " → " + bNow + "。"), bp]);
    }
    // headlines
    var nn = SN.news && SN.news.items ? SN.news.items.filter(function (i) { return i.ms > at; }).length : 0;
    if (nn) lines.push(["", EN ? nn + " new headline" + (nn > 1 ? "s" : "") + " on gold." : "黄金新头条 " + nn + " 条。", "", "report.html#read-news"]);
    var ul = $("sn-list"); while (ul.firstChild) ul.removeChild(ul.firstChild);
    lines.forEach(function (l) {
      var li = el("li", l[0]); li.appendChild(el("span", "", l[1])); if (l[2]) li.appendChild(el("span", "sn-px", l[2]));
      if (l[3]) { var a = el("a", "", tr(" 去看 →", " Read →")); a.href = l[3]; li.appendChild(a); }
      ul.appendChild(li);
    });
  }
  function startSince() {
    var box = $("hub-since");
    if (box && !box.hidden && seen0) {
      get("data/xau-signals.json").then(function (d) { SN.sig = d || { changes: [], signals: [] }; paintSince(); });
      get("data/news.json").then(function (d) { SN.news = d; paintSince(); });
      var x = $("sn-x"); if (x) x.addEventListener("click", function () { saveSeen(); box.hidden = true; });
    }
    window.addEventListener("pagehide", saveSeen);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") saveSeen(); });
    setTimeout(function () { if (document.visibilityState === "visible") saveSeen(); }, 60000);
  }
  function start() {
    startSince();
    btc(); setInterval(btc, 60000);
    loadFiles().then(function () { if (window.GoldLive) GoldLive.on(fromGoldLive); else { livePrice(); setInterval(livePrice, 60000); } liveVerdict(); });
    setInterval(loadFiles, 15 * 60000);
    // again after each 15-minute close (plus a minute for the feed), as the gold page asks
    (function next() { var q = 900000, w = q - Date.now() % q + 60000; setTimeout(function () { liveVerdict(); next(); }, w); })();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
