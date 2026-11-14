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
    var ul = $("pulse-list");
    if (ul) {
      while (ul.firstChild) ul.removeChild(ul.firstChild);
      // the file's levels were sorted around the price at its run; the price now may have passed some of them
      var lvAll = (st.resistance || []).concat(st.support || []), lvUp = null, lvDn = null;
      lvAll.forEach(function (l) { if (typeof l.price !== "number") return; if (l.price > price && (!lvUp || l.price < lvUp.price)) lvUp = l; if (l.price < price && (!lvDn || l.price > lvDn.price)) lvDn = l; });
      var li = function (head, text) { var x = el("li"); x.appendChild(el("strong", "", head)); x.appendChild(document.createTextNode(tr("：", ": ") + text)); ul.appendChild(x); };
      var pl = L ? L.plan : st.plan;
      if (EN) {
        li("Gold", (shut ? "Market closed, last close " : "Price ") + fmt(price) + ". " + dayWord + ": open " + fmt(dayOpen) + ", high " + fmt(dayHi) + ", low " + fmt(dayLo) + (chg === null ? "" : ", " + sgn(chg) + " USD (" + sgn(pct, 2) + "%) on the " + (shut ? "day before" : "previous close")) + ". Nearest resistance above " + (lvUp ? fmt(lvUp.price) + " (" + I.level(lvUp.what) + ")" : "—") + ", nearest support below " + (lvDn ? fmt(lvDn.price) + " (" + I.level(lvDn.what) + ")" : "—") + ".");
        li("Answer", (vTitle || "") + "." + (go && pl ? " Plan: " + (/空/.test(pl.side) ? "sell" : "buy") + ", stop " + fmt(pl.stop) + ", target " + fmt(pl.target) + "." : ""));
        li("Next", hi.length ? hi.slice(0, 3).map(function (e) { return e.when + " " + e.name; }).join("; ") + ". No new trades 30 minutes either side of a release." : "Nothing big left on this week's calendar.");
      } else {
        li("黄金", (shut ? "休市中，收盘价 " : "现价 ") + fmt(price) + "。" + dayWord + "开 " + fmt(dayOpen) + "，最高 " + fmt(dayHi) + "，最低 " + fmt(dayLo) + (chg === null ? "" : "，较" + (shut ? "前一日" : "昨日") + "收盘 " + sgn(chg) + " 美元（" + sgn(pct, 2) + "%）") + "。上方最近的阻力 " + (lvUp ? fmt(lvUp.price) + "（" + lvUp.what + "）" : "—") + "，下方最近的支撑 " + (lvDn ? fmt(lvDn.price) + "（" + lvDn.what + "）" : "—") + "。");
        li("结论", (v.text || "") + (go && pl ? " 方案：" + pl.side + "，止损 " + fmt(pl.stop) + "，目标 " + fmt(pl.target) + "。" : ""));
        li("接下来", (hi.length ? hi.slice(0, 3).map(function (e) { return e.when + " " + e.name; }).join("；") + "。数据公布前后 30 分钟不开新仓。" : "本周日历上没有剩下的大数据。"));
      }
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
    rows.forEach(function (s) {
      if (!DRV[s.id]) return;
      var li = el("li"), c = ch(s), nm = el("span", "nm", DRV[s.id]), push = { dxy: -1, us10y: -1, real10y: -1 }[s.id];   // a rising dollar or yield usually weighs on gold
      if (push && typeof s.chg1w === "number" && s.chg1w !== 0) nm.appendChild(el("em", null, s.chg1w * push < 0 ? tr("不利", "headwind") : tr("有利", "tailwind")));
      li.appendChild(nm); li.appendChild(spark(s.spark)); li.appendChild(el("b", c[1], c[0])); ul.appendChild(li);
    });
    set("hub-drv-ft", tr("日收盘到 ", "Daily closes to ") + gold.date + tr(" · 参考，不是信号", " · context, not a signal"));
  }
  function loadFiles() { get("data/drivers.json").then(paintDrivers); return Promise.all([get("data/xau-state.json"), get("data/calendar.json")]).then(function (r) { S.state = r[0]; S.cal = r[1]; paint(); }); }
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
      var arrows = (b.timeframes || []).map(function (t) { return (EN ? SHORT[t.tf] || t.tf : (t.name || t.tf).replace(" ", "")) + (t.trend === "向上" ? "↑" : t.trend === "向下" ? "↓" : "–"); }).join(" ");
      var at = Date.parse(String(b.updated).replace(" SGT", ":00+08:00").replace(" ", "T")), ageH = isFinite(at) ? (Date.now() - at) / 3600000 : 0;   // written by the same late job as gold's file
      chips("hub-btc-chips", [[b.verdict.level === "go" ? "bull" : "gold", tr("结论", "Answer") + (ageH >= 1 ? tr("（" + Math.round(ageH) + " 小时前）", " (" + Math.round(ageH) + " h ago)") : "") + tr("：", ": ") + (EN ? tagEn(b.verdict, b.timeframes || []) : b.verdict.tag) + " · " + arrows]]);
    }).catch(function () {});
    fetch("https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      var p = d && parseFloat(d.price); if (isFinite(p) && p > 0) set("hub-btc-price", "$" + fmt(p, 0));
    }).catch(function () {});
  }
  function start() {
    btc(); setInterval(btc, 60000);
    loadFiles().then(function () { if (window.GoldLive) GoldLive.on(fromGoldLive); else { livePrice(); setInterval(livePrice, 60000); } liveVerdict(); });
    setInterval(loadFiles, 15 * 60000);
    // again after each 15-minute close (plus a minute for the feed), as the gold page asks
    (function next() { var q = 900000, w = q - Date.now() % q + 60000; setTimeout(function () { liveVerdict(); next(); }, w); })();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
