// Fills the home page's market summary from data files, so none of it is typed by hand and none of it goes stale:
//   data/xau-state.json   the report page's engine, run on a server every hour (scripts/update_gold.js)
//   data/calendar.json    this week's US releases (scripts/update_calendar.py)
// The live price comes from api.gold-api.com once a minute; today's change is measured from the previous close in
// the state file. If a file cannot be read, the block says so instead of showing an old figure.
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg", S = { state: null, cal: null, live: null };
  function $(id) { return document.getElementById(id); }
  function set(id, text) { var e = $(id); if (e) e.textContent = text; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function fmt(v, d) { return typeof v === "number" && isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d === undefined ? 1 : d, maximumFractionDigits: d === undefined ? 1 : d }) : "—"; }
  function sgn(v, d) { var t = fmt(Math.abs(v), d); return (v > 0 ? "+" : v < 0 ? "−" : "") + t; }
  function mk(t, at, parent) { var e = document.createElementNS(NS, t); for (var k in at) e.setAttribute(k, at[k]); if (parent) parent.appendChild(e); return e; }
  function chips(id, list) { var box = $(id); if (!box) return; while (box.firstChild) box.removeChild(box.firstChild); list.forEach(function (c) { if (c) box.appendChild(el("span", "chip " + c[0], c[1])); }); }
  function get(url) { return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(function () { return null; }); }
  var ARROW = { "向上": "↑", "向下": "↓", "不明": "–" }, SHORT = { W: "周", D: "日", "4H": "4H", "1H": "1H", "15M": "15M" };
  function scoreWord(sc) { return sc >= 7 ? "强烈看多" : sc >= 4 ? "看多" : sc >= 1 ? "略偏多" : sc === 0 ? "中性" : sc >= -3 ? "略偏空" : sc >= -6 ? "看空" : "强烈看空"; }
  function left(ms) { var m = Math.max(0, Math.round(ms / 60000)); if (m < 60) return m + " 分钟"; var h = Math.floor(m / 60); return h < 48 ? h + " 小时" : Math.floor(h / 24) + " 天"; }

  // upcoming releases, one entry per release time
  function upcoming(cal, onlyHigh) {
    var now = Date.now(), by = {}, out = [];
    ((cal && cal.events) || []).forEach(function (e) {
      if (e.allDay || e.ms <= now || (onlyHigh && e.impact !== "high")) return;
      var k = e.ms + "|" + e.impact, g = by[k]; if (!g) { g = by[k] = { ms: e.ms, when: e.date.replace("月", "/").replace("日", "") + "（" + e.weekday + "）" + e.time, names: [], high: e.impact === "high" }; out.push(g); }
      g.names.push(e.zh || e.title);
    });
    out.forEach(function (g) { g.name = g.names.slice(0, 2).join("、") + (g.names.length > 2 ? " 等" : ""); });
    return out.sort(function (a, b) { return a.ms - b.ms; });
  }

  function drawDays(st) {
    var svg = $("g7svg"); if (!svg) return; while (svg.firstChild) svg.removeChild(svg.firstChild);
    var pts = (st.recentDays || []).map(function (p) { return { d: p.date, v: p.close }; });
    if (S.live !== null && st.marketOpen) pts.push({ d: "现在", v: S.live });
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
      mk("text", { x: X(i).toFixed(1), y: H - 4, fill: "#8A857E", "font-size": "8", "font-family": "'IBM Plex Mono',monospace", "text-anchor": "middle" }, svg).textContent = p.d;
    });
    var last = pts[pts.length - 1];
    mk("text", { x: (X(pts.length - 1) + 5).toFixed(1), y: (Y(last.v) + 3).toFixed(1), fill: "#F6F5F3", "font-size": "11", "font-weight": "700", "font-family": "'Space Grotesk',monospace" }, svg).textContent = "$" + fmt(last.v, 0);
    set("g7-range", "低 $" + fmt(lo, 0) + " · 高 $" + fmt(hi, 0));
  }
  function drawScore(sc) {
    var svg = $("scoresvg"); if (!svg) return; while (svg.firstChild) svg.removeChild(svg.firstChild);
    var cx = 85, cy = 82, r = 58, pt = function (p) { var a = Math.PI * (1 - p); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
    var arc = function (p0, p1, color) { var s = pt(Math.min(p0, p1)), e = pt(Math.max(p0, p1)); mk("path", { d: "M" + s[0].toFixed(1) + " " + s[1].toFixed(1) + " A" + r + " " + r + " 0 0 1 " + e[0].toFixed(1) + " " + e[1].toFixed(1), fill: "none", stroke: color, "stroke-width": 10, "stroke-linecap": "round" }, svg); };
    var p = (Math.max(-10, Math.min(10, sc)) + 10) / 20;
    arc(0, 1, "#2B2B36"); if (sc !== 0) arc(0.5, p, sc > 0 ? "#0ab074" : "#db2943");
    mk("text", { x: cx, y: cy - 8, fill: "#F6F5F3", "font-size": "22", "font-weight": "700", "font-family": "'Space Grotesk',monospace", "text-anchor": "middle" }, svg).textContent = sgn(sc, 0);
    mk("text", { x: cx, y: cy + 8, fill: "#8A857E", "font-size": "8.5", "font-family": "'IBM Plex Mono',monospace", "text-anchor": "middle" }, svg).textContent = scoreWord(sc) + " · 范围 ±10";
  }

  function paint() {
    var st = S.state, cal = S.cal, ev = upcoming(cal, false), hi = ev.filter(function (e) { return e.high; }), now = Date.now();
    if (cal) {
      var nx = hi[0];
      set("pulse-event", nx ? nx.name + " " + nx.when.split("）")[0] + "）" : "本周没有剩下的大数据");
      set("pulse-event-d", nx ? nx.when + " SGT，还有 " + left(nx.ms - now) + "。" + (hi.length > 1 ? "之后：" + hi.slice(1, 4).map(function (e) { return e.name + " " + e.when; }).join(" · ") : "") : "日历每周日换到新的一周。");
      chips("hub-risk-chips", hi.length ? hi.slice(0, 2).map(function (e, i) { return [i ? "gold" : "bear", (i ? "之后：" : "下一个大数据：") + e.name + " · " + e.when + " SGT"]; }) : [["gold", "本周没有剩下的大数据"]]);
    } else { set("pulse-event", "日历暂时读不到"); set("pulse-event-d", "请打开风险计划页查看。"); chips("hub-risk-chips", [["gold", "经济日历与风险计划"]]); }
    if (!st) {
      ["pulse-gold", "pulse-verdict-d", "pulse-tf-d"].forEach(function (id) { set(id, "数据文件暂时读不到，请打开 4H 报告看实时结论。"); });
      set("pulse-verdict", "—"); set("pulse-tf", "—"); set("pulse-updated", "数据暂时读不到"); return;
    }
    var pd = st.previousDay || {}, pw = st.previousWeek || {}, td = st.today || {}, price = S.live !== null && st.marketOpen ? S.live : st.price;
    var chg = typeof pd.close === "number" ? price - pd.close : null, pct = chg === null ? null : chg / pd.close * 100;
    var tfs = (st.timeframes || []).filter(function (t) { return !t.error; }), dirs = tfs.map(function (t) { return SHORT[t.tf] + (ARROW[t.trend] || "–"); }).join(" ");
    var big = tfs.slice(0, 3).map(function (t) { return t.name.replace(" ", "") + t.trend; }).join("、"), v = st.verdict || {}, go = v.level === "go";
    var dayHi = Math.max(td.high || price, price), dayLo = Math.min(td.low || price, price);
    set("pulse-updated", "⟳ 数据 " + st.updated + " · 每小时自动更新 · 价格实时");
    set("hub-upd", "⟳ 自动更新 · 数据文件 " + st.updated + " · 金价与图表实时");
    set("pulse-gold", (st.marketOpen ? "今日" : "上一交易日") + (chg === null ? "" : " " + sgn(chg) + " 美元（" + sgn(pct, 2) + "%）") + "，区间 " + fmt(dayLo) + "–" + fmt(dayHi) + "。昨日收 " + fmt(pd.close) + "，区间 " + fmt(pd.low) + "–" + fmt(pd.high) + "。上周区间 " + fmt(pw.low) + "–" + fmt(pw.high) + "。");
    set("pulse-verdict", v.tag || "—"); set("pulse-verdict-d", (v.title || "") + "。" + ((st.watch || [])[0] ? "关注 " + fmt(st.watch[0].price) + "：" + st.watch[0].text + "。" : ""));
    set("pulse-tf", dirs); set("pulse-tf-d", "周线、日线、4 小时同向才做；1 小时和 15 分钟也同向才进场。现在：" + big + "。");
    chips("hub-main-chips", [
      [chg === null ? "gold" : chg >= 0 ? "bull" : "bear", (st.marketOpen ? "今日 " : "收盘 ") + (chg === null ? "" : sgn(chg) + "（" + sgn(pct, 2) + "%）· ") + "区间 " + fmt(dayLo, 0) + "–" + fmt(dayHi, 0)],
      [go ? "bull" : "gold", "系统结论：" + (v.tag || "—") + " · " + dirs],
      hi[0] ? ["gold", "下一个大数据：" + hi[0].name + " " + hi[0].when] : null
    ]);
    chips("hub-news-chips", [["gold", "昨日收 " + fmt(pd.close) + " · 上周区间 " + fmt(pw.low, 0) + "–" + fmt(pw.high, 0)]]);
    drawDays(st); drawScore(typeof st.score === "number" ? st.score : 0);
    var ul = $("pulse-list");
    if (ul) {
      while (ul.firstChild) ul.removeChild(ul.firstChild);
      var li = function (head, text) { var x = el("li"); x.appendChild(el("strong", "", head)); x.appendChild(document.createTextNode("：" + text)); ul.appendChild(x); };
      li("黄金", "现价 " + fmt(price) + "。" + (st.marketOpen ? "今日" : "上一交易日") + "开 " + fmt(td.open) + "，最高 " + fmt(dayHi) + "，最低 " + fmt(dayLo) + (chg === null ? "" : "，较昨日收盘 " + sgn(chg) + " 美元（" + sgn(pct, 2) + "%）") + "。上方最近的阻力 " + ((st.resistance || [])[0] ? fmt(st.resistance[0].price) + "（" + st.resistance[0].what + "）" : "—") + "，下方最近的支撑 " + ((st.support || [])[0] ? fmt(st.support[0].price) + "（" + st.support[0].what + "）" : "—") + "。");
      li("结论", (v.text || "") + (go && st.plan ? " 方案：" + st.plan.side + "，止损 " + fmt(st.plan.stop) + "，目标 " + fmt(st.plan.target) + "。" : ""));
      li("接下来", (hi.length ? hi.slice(0, 3).map(function (e) { return e.when + " " + e.name; }).join("；") + "。数据公布前后 30 分钟不开新仓。" : "本周日历上没有剩下的大数据。"));
    }
  }

  function livePrice() {
    fetch("https://api.gold-api.com/price/XAU", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !(d.price > 0)) return;
      S.live = d.price;
      [].forEach.call(document.querySelectorAll(".js-live-price"), function (e) { e.textContent = "$" + fmt(d.price, 0); });
      var t = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Singapore", hour12: false });
      [].forEach.call(document.querySelectorAll(".js-live-time"), function (e) { e.textContent = t + " (SGT)"; });
      paint();
    }).catch(function () {});
  }
  function loadFiles() { return Promise.all([get("data/xau-state.json"), get("data/calendar.json")]).then(function (r) { S.state = r[0]; S.cal = r[1]; paint(); }); }
  function start() { loadFiles().then(livePrice); setInterval(livePrice, 60000); setInterval(loadFiles, 15 * 60000); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
