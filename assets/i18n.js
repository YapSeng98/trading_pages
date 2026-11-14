/* Language. The site is written in Chinese. A page that has an English version says so with
   <meta name="i18n" content="en"> (before this script) and shows it when the visitor picks English in 设置
   (assets/site.js keeps the choice in localStorage "site.v1"). Loaded in <head>, before anything renders: sets
   window.LANG and <html lang>, gives the page's scripts T(zh, en) and the shared words (I18N), and once the page is
   parsed swaps the static text marked data-en (data-en-html for marked-up text, data-en-ph / -title / -label for
   placeholders, titles and aria-labels). The body stays hidden until then (1.5 s at most), so an English visitor
   does not see the Chinese flash past. Pages without an English version stay Chinese; site.js says so. */
(function () {
  "use strict";
  var pick = "zh"; try { var s = JSON.parse(localStorage.getItem("site.v1")) || {}; if (s.lang === "en") pick = "en"; } catch (e) {}
  var root = document.documentElement, has = !!document.querySelector('meta[name="i18n"][content~="en"]'), on = pick === "en" && has;
  window.LANG = on ? "en" : "zh";
  window.T = function (zh, en) { return on && en !== undefined ? en : zh; };
  root.setAttribute("data-lang", window.LANG); if (on) root.lang = "en";

  // ---- words the data files and the engine write in Chinese ----
  var TF = { W: ["周线", "Weekly"], D: ["日线", "Daily"], "4H": ["4 小时", "4-hour"], "1H": ["1 小时", "1-hour"], "15M": ["15 分钟", "15-min"] };
  var TF_ZH = { "周线": "W", "日线": "D", "4小时": "4H", "1小时": "1H", "15分钟": "15M" }, SHORT = { W: "Weekly", D: "Daily", "4H": "4H", "1H": "1H", "15M": "15M" };
  var TREND = { "向上": "up", "向下": "down", "不明": "unclear" };
  var WD = { "周一": "Mon", "周二": "Tue", "周三": "Wed", "周四": "Thu", "周五": "Fri", "周六": "Sat", "周日": "Sun", "日": "Sun", "一": "Mon", "二": "Tue", "三": "Wed", "四": "Thu", "五": "Fri", "六": "Sat" };
  var TERM = { "前高": "prior high", "前低": "prior low", "区间顶": "range high", "区间底": "range low", "区间中点": "range midpoint", "近期小高点": "recent minor high", "近期小低点": "recent minor low",
    "向上突破位": "breakout level", "向下突破位": "breakdown level", "200均线": "200 EMA", "看多缺口": "bullish gap", "看空缺口": "bearish gap", "等高点（止损密集）": "equal highs (stops cluster)",
    "等低点（止损密集）": "equal lows (stops cluster)", "昨日高点": "yesterday's high", "昨日低点": "yesterday's low", "上周高点": "last week's high", "上周低点": "last week's low", "关键位": "key level" };
  var PAT = { "双顶": "double top", "双底": "double bottom", "头肩顶": "head and shoulders", "头肩底": "inverse head and shoulders", "上升三角形": "ascending triangle", "下降三角形": "descending triangle",
    "对称三角形": "symmetrical triangle", "上升楔形": "rising wedge", "下降楔形": "falling wedge", "上升通道": "rising channel", "下降通道": "falling channel", "横盘区间": "range", "牛旗": "bull flag", "熊旗": "bear flag" };
  var PSUF = { "关键位": "key level", "目标": "target", "失效位": "invalidation", "颈线": "neckline", "上沿": "upper edge", "下沿": "lower edge" };
  // a level's name as the data file writes it ("4小时熊旗关键位、昨日低点") in English; unknown parts stay as written
  function level(name) {
    return String(name || "").split(/[、,，]/).map(function (part) {
      var rest = part.replace(/\s+/g, ""), pre = "";
      for (var z in TF_ZH) if (rest.indexOf(z) === 0) { pre = SHORT[TF_ZH[z]] + " "; rest = rest.slice(z.length); break; }
      if (TERM[rest]) return pre + TERM[rest];
      for (var p in PAT) if (rest.indexOf(p) === 0) { var suf = rest.slice(p.length); return pre + PAT[p] + (suf ? " " + (PSUF[suf] || suf) : ""); }
      return part.trim();
    }).join(", ");
  }
  window.I18N = {
    on: on, pick: pick,
    tf: function (code) { return (TF[code] || [code, code])[on ? 1 : 0]; },
    tfName: function (zhName) { var c = TF_ZH[String(zhName || "").replace(/\s+/g, "")]; return c ? TF[c][1] : zhName; },
    trend: function (zhWord) { return on ? TREND[zhWord] || zhWord : zhWord; },
    wd: function (zhDay) { return on ? WD[zhDay] || zhDay : zhDay; },
    level: function (zhName) { return on ? level(zhName) : zhName; },
    pattern: function (zhName) { return on ? PAT[zhName] || zhName : zhName; },
    swap: swap
  };

  function swap(scope) {
    var q = function (sel) { return (scope || document).querySelectorAll(sel); };
    [].forEach.call(q("[data-en]"), function (e) { e.textContent = e.getAttribute("data-en"); });
    [].forEach.call(q("[data-en-html]"), function (e) { e.innerHTML = e.getAttribute("data-en-html"); });
    [].forEach.call(q("[data-en-ph]"), function (e) { e.setAttribute("placeholder", e.getAttribute("data-en-ph")); });
    [].forEach.call(q("[data-en-title]"), function (e) { e.setAttribute("title", e.getAttribute("data-en-title")); });
    [].forEach.call(q("[data-en-label]"), function (e) { e.setAttribute("aria-label", e.getAttribute("data-en-label")); });
    var t = document.querySelector('meta[name="i18n-title"]'); if (t) document.title = t.getAttribute("content");
  }
  if (!on) return;
  var st = document.createElement("style"); st.textContent = "html.i18n-hold body{visibility:hidden}"; document.head.appendChild(st);
  root.classList.add("i18n-hold");
  var shown = function () { root.classList.remove("i18n-hold"); };
  document.addEventListener("DOMContentLoaded", function () { swap(); shown(); });
  setTimeout(shown, 1500);
})();
